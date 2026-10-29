/**
 * R9 视频任务「续查」验收（不重新提交）。
 *
 * 只做三件事：
 * 1) 用上次真实提交留下的持久 profile 打开工具页 → 应用自身的 hydrate+recoverAll/waitForResult 接手轮询，
 *    把 922edd5 记录的两个真实 taskId 推进到终态（页面不点「立即生成」）；
 * 2) 终态后 fresh reload，用历史记录 data-task-id 验证任务确实落库可恢复，再点「查看结果」；
 * 3) 若成功：校验 MP4（ftyp magic + 字节），走下载 / 存资产 / 发画布三动作并留证；若失败/unknown：原样记录真实状态。
 *
 * 用法：
 *   cd web && node scripts/real-acceptance/accept-r9-video-resume.mjs --tool=translation --task=task_xxx [--wait-min=18]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const EVIDENCE_ROOT = process.env.IC_EVIDENCE_ROOT
    || path.resolve(process.cwd(), "../docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance");

const arg = (name, dflt) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : dflt;
};

const TOOL = arg("tool", "translation");
const TASK_ID = arg("task", "");
const WAIT_MIN = Number(arg("wait-min", "18"));

const SPECS = {
    translation: { toolId: "VIDEO_TRANSLATION", route: "/tools/ai-video/video-translation", waitText: "视频翻译" },
    concat: { toolId: "VIDEO_CONCAT", route: "/tools/ai-video/video-concat", waitText: "视频拼接" },
};
const spec = SPECS[TOOL];
if (!spec) {
    console.error("unknown --tool, use translation|concat");
    process.exit(2);
}

const OUT = path.join(EVIDENCE_ROOT, spec.toolId);
const PROFILE = path.join("/tmp", `ic_r9_profile_${TOOL}`);
const TERMINAL = new Set(["done", "succeeded", "failed", "unknown", "canceled"]);

const record = {
    toolId: spec.toolId,
    route: spec.route,
    mode: "resume-only（不重新提交）",
    taskId: TASK_ID || null,
    startedAt: new Date().toISOString(),
    steps: [],
    statusTimeline: [],
    reload: null,
    result: null,
    actions: {},
    issues: [],
};

/**
 * 读任务快照：只读 localStorage 落盘快照（app 自己写的），不 import store 模块
 * ——Vite dev 下 import 到的是带 HMR query 的另一份模块实例，store 为空，会误判「没有快照」。
 */
const readTask = (page, id) => page.evaluate((wanted) => {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("tool-task:v1:task-"));
    const all = [];
    let hit = null;
    for (const k of keys) {
        let v = null;
        try { v = JSON.parse(localStorage.getItem(k) || "null"); } catch { continue; }
        if (!v) continue;
        all.push({ id: v.id, status: v.status, upstreamTaskId: v.upstreamTaskId ?? null });
        if (!hit && (v.id === wanted || v.upstreamTaskId === wanted)) hit = v;
    }
    if (!hit) return { found: false, keys: all.slice(0, 5) };
    return {
        found: true,
        id: hit.id,
        status: hit.status,
        upstreamTaskId: hit.upstreamTaskId ?? null,
        submittedAt: hit.submittedAt ?? null,
        progress: hit.progress ?? null,
        error: hit.error ? { message: String(hit.error.message || "").slice(0, 400), code: hit.error.code ?? null } : null,
        items: (hit.result?.items || []).map((i) => ({
            kind: i.kind,
            storageKey: i.storageKey ?? null,
            url: (i.url || "").slice(0, 120),
            bytes: i.bytes ?? null,
            mimeType: i.mimeType ?? null,
            payloadDropped: Boolean(i.payloadDropped),
        })),
        updatedAt: hit.updatedAt ?? null,
    };
}, id);

async function main() {
    await fs.mkdir(OUT, { recursive: true });
    const context = await chromium.launchPersistentContext(PROFILE, {
        channel: "chrome",
        headless: true,
        viewport: { width: 1440, height: 960 },
        locale: "zh-CN",
        acceptDownloads: true,
    });
    const page = context.pages()[0] || (await context.newPage());

    const pollLog = [];
    page.on("response", async (res) => {
        const url = res.url();
        if (!/\/v1\/videos(\/|\?|$)/.test(url)) return;
        let body = "";
        try { body = (await res.text()).slice(0, 400); } catch { body = "<no body>"; }
        pollLog.push({ at: new Date().toISOString(), method: res.request().method(), status: res.status(), url: url.replace(/^.*\/v1\/videos/, "/v1/videos"), body });
        if (pollLog.length > 400) pollLog.shift();
    });
    page.on("pageerror", (e) => record.issues.push(`pageerror: ${String(e).slice(0, 200)}`));

    try {
        // ---------- 1) 打开工具页，交给应用自身的恢复逻辑 ----------
        await page.goto(`${BASE}${spec.route}?resume=${Date.now()}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction((t) => document.body.innerText.includes(t), spec.waitText, { timeout: 40000 });
        await page.waitForTimeout(3000);

        let task = await readTask(page, TASK_ID);
        record.steps.push("page-opened");
        record.initial = task;
        if (!task.found) throw new Error(`持久 profile 里没有该任务快照：${JSON.stringify(task.keys)}`);
        // 历史项 data-task-id 用的是本地 id（task-mvth...），上游 id 只用于查询
        record.localTaskId = task.id;
        record.taskId = task.upstreamTaskId || TASK_ID || task.id;
        record.upstreamTaskId = task.upstreamTaskId || TASK_ID || null;

        const deadline = Date.now() + WAIT_MIN * 60_000;
        let lastKey = "";
        while (Date.now() < deadline) {
            task = await readTask(page, record.taskId);
            const key = `${task.status}:${task.progress ?? ""}:${task.items.length}`;
            if (key !== lastKey) {
                lastKey = key;
                record.statusTimeline.push({ at: new Date().toISOString(), status: task.status, progress: task.progress, items: task.items.length, error: task.error?.message ?? null });
                await page.screenshot({ path: path.join(OUT, `resume-${task.status}-${record.statusTimeline.length}.png`) }).catch(() => {});
                console.log(`[status] ${task.status} progress=${task.progress} items=${task.items.length} ${task.error?.message ?? ""}`);
            }
            if (TERMINAL.has(task.status)) break;
            await page.waitForTimeout(5000);
        }
        record.steps.push("terminal-or-timeout");
        record.final = task;
        await page.screenshot({ path: path.join(OUT, "resume-final.png") }).catch(() => {});

        // ---------- 2) fresh reload：历史里必须能按 taskId 找回 ----------
        await page.goto(`${BASE}${spec.route}?fresh=${Date.now()}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="tool-task-history"]')), undefined, { timeout: 40000 });
        await page.waitForTimeout(2500);
        record.reload = await page.evaluate((taskId) => {
            const items = [...document.querySelectorAll('[data-testid="tool-task-history-item"]')].map((n) => ({
                taskId: n.getAttribute("data-task-id"),
                status: n.getAttribute("data-task-status"),
                text: n.innerText.replace(/\s+/g, " ").slice(0, 200),
            }));
            return { count: items.length, matched: items.some((i) => i.taskId === taskId), items: items.slice(0, 3) };
        }, record.localTaskId);
        record.steps.push("fresh-reload-history");
        await page.screenshot({ path: path.join(OUT, "fresh-reload-history.png") }).catch(() => {});
        if (!record.reload.matched) record.issues.push(`fresh reload 后历史里没有 taskId=${record.localTaskId}`);

        const settledStatus = (record.final && record.final.status) || "";
        if (settledStatus !== "done" && settledStatus !== "succeeded") {
            record.steps.push("no-product");
            record.issues.push(`任务非 done（${settledStatus}），不构造成功证据`);
        } else {
            // ---------- 3) 查看结果 → 结果区 ----------
            const localId = record.localTaskId || record.taskId;
            const openBtn = page.locator(`[data-testid="tool-task-history-item"][data-task-id="${localId}"] [data-testid="tool-task-history-open"]`).first();
            if (!(await openBtn.count())) throw new Error("历史项没有「查看结果」入口");
            await openBtn.click();
            await page.waitForFunction(() => {
                const v = document.querySelector('[data-testid="tool-result-video"]');
                return Boolean(v) && v.readyState >= 1;
            }, undefined, { timeout: 120000 });
            record.steps.push("history-restored-result");

            record.result = await page.evaluate(async () => {
                const v = document.querySelector('[data-testid="tool-result-video"]');
                const src = v?.currentSrc || v?.src || "";
                let bytes = null;
                let magic = null;
                let headHex = null;
                try {
                    const b = await (await fetch(src, { cache: "no-store" })).arrayBuffer();
                    bytes = b.byteLength;
                    const u8 = new Uint8Array(b.slice(0, 12));
                    magic = String.fromCharCode(...u8.slice(4, 8));
                    headHex = [...u8].map((x) => x.toString(16).padStart(2, "0")).join(" ");
                } catch (e) {
                    return { hasVideo: true, src, bytes: null, magic: null, fetchError: String(e).slice(0, 200) };
                }
                const dl = document.querySelector('[data-testid="tool-result-download-0"]');
                return { hasVideo: true, readyState: v.readyState, duration: v.duration, videoWidth: v.videoWidth, videoHeight: v.videoHeight, src: src.slice(0, 160), bytes, magic, headHex, hasDownloadButton: Boolean(dl) };
            });
            if (record.result.magic !== "ftyp") record.issues.push(`结果视频不是 MP4（magic=${record.result.magic}）`);
            await page.screenshot({ path: path.join(OUT, "result-restored.png") }).catch(() => {});

            // ---------- 4) 下载 ----------
            const dl = page.locator('[data-testid="tool-result-download-0"]').first();
            if (await dl.count()) {
                const [download] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }).catch(() => null), dl.click()]);
                if (download) {
                    const target = path.join(OUT, "downloaded.mp4");
                    await download.saveAs(target);
                    const b = await fs.readFile(target);
                    record.actions.download = {
                        suggested: download.suggestedFilename(),
                        bytes: b.length,
                        magic: b.slice(4, 8).toString("ascii"),
                        matchesResultBytes: record.result.bytes ? b.length === record.result.bytes : null,
                    };
                    if (record.actions.download.magic !== "ftyp") record.issues.push("下载产物不是 MP4");
                } else {
                    record.issues.push("下载没有触发 download 事件");
                }
            } else {
                record.issues.push("结果区没有下载按钮");
            }

            // ---------- 5) 存资产 ----------
            const save = page.locator('[data-testid="tool-result-save-0"]').first();
            if (await save.count()) {
                await save.click();
                await page.waitForFunction(
                    () => (document.querySelector('[data-testid="tool-result-feedback"]')?.textContent ?? "").length > 0,
                    undefined, { timeout: 60000 },
                ).catch(() => {});
                record.actions.save = {
                    feedback: await page.evaluate(() => document.querySelector('[data-testid="tool-result-feedback"]')?.textContent?.trim() ?? null),
                    assets: await page.evaluate(async () => {
                        const mod = await import("/src/stores/use-asset-store.ts");
                        const st = mod.useAssetStore.getState();
                        const list = st.assets || [];
                        const videos = list.filter((a) => a.kind === "video" || a.mimeType?.startsWith("video/"));
                        return { count: list.length, videos: videos.map((a) => ({ id: a.id, bytes: a.bytes, mimeType: a.mimeType ?? null, toolId: a.toolId ?? null })) };
                    }),
                };
            } else {
                record.issues.push("结果区没有存资产按钮");
            }

            // ---------- 6) 发到画布 ----------
            const canvasBtn = page.locator('[data-testid="tool-result-canvas-0"]').first();
            if (await canvasBtn.count()) {
                await canvasBtn.click();
                await page.waitForTimeout(4000);
                record.actions.canvas = await page.evaluate(async () => {
                    const feedback = document.querySelector('[data-testid="tool-result-feedback"]')?.textContent?.trim() ?? null;
                    let videoNodes = null;
                    try {
                        const idb = await import("idb-keyval");
                        const nodes = await idb.get("canvas-nodes");
                        videoNodes = Array.isArray(nodes) ? nodes.filter((n) => String(n?.type).includes("video")).length : null;
                    } catch { /* idb 不可用 */ }
                    return { feedback, videoNodes };
                });
                await page.screenshot({ path: path.join(OUT, "sent-canvas.png") }).catch(() => {});
            } else {
                record.issues.push("结果区没有发画布按钮");
            }
        }
    } catch (error) {
        record.error = String(error?.message || error).slice(0, 800);
        await page.screenshot({ path: path.join(OUT, "resume-error.png") }).catch(() => {});
        record.actions.domOnError = await page.evaluate(() => ({
            alerts: [...document.querySelectorAll('[role="alert"]')].map((n) => n.innerText.trim()).slice(0, 5),
            tail: document.body.innerText.slice(-800),
        })).catch(() => null);
    } finally {
        record.finishedAt = new Date().toISOString();
        record.pollReceiptsTail = pollLog.slice(-12).map((r) => `${r.at} ${r.method} ${r.status} ${r.body.slice(0, 200)}`);
        const file = path.join(OUT, `run-resume-${TOOL}.json`);
        await fs.writeFile(file, JSON.stringify(record, null, 2));
        console.log(JSON.stringify({ toolId: record.toolId, taskId: record.taskId, steps: record.steps, initial: record.initial?.status, final: record.final, reload: record.reload, result: record.result, actions: record.actions, issues: record.issues, error: record.error }, null, 2));
        await context.close();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
