/**
 * R27：VIDEO_CONCAT 真实双片段拼接（HEAD 上真实提交一次，验证 c8c8ce9e 的时间预算修复）。
 *
 * 边界：
 * - 两个片段都是既往上游真实产物（磁盘可核 sha256），不走注入、不重复刷量；
 * - 全程真实 UI：input[type=file] change → 读取真实时长 → 抓帧封面 → 点「开始拼接」；
 * - 抓上游 /v1/videos 的 POST（multipart 里的 video[] 段数、媒体 URL）与响应 taskId；
 * - 终态后 fresh reload，用历史恢复结果，再走 下载 / 存资产 / 发画布 三动作，字节与 sha256 对账。
 *
 * 用法：cd web && node scripts/real-acceptance/accept-r27-concat-real.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { chromium } from "playwright";

const BASE = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const EVIDENCE_ROOT = process.env.IC_EVIDENCE_ROOT
    || path.resolve(process.cwd(), "../docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance");
const OUT = path.join(EVIDENCE_ROOT, "VIDEO_CONCAT");
const PROFILE = "/tmp/ic_r9_profile_concat";
const ROUTE = "/tools/ai-video/video-concat";

const CLIP_A = path.resolve(process.cwd(), "../docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/downloaded.mp4");
const CLIP_B = path.resolve(process.cwd(), "../docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4");

const TERMINAL = new Set(["done", "succeeded", "failed", "unknown", "canceled"]);
const WAIT_MIN = Number(process.env.IC_WAIT_MIN || "14");

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

const record = {
    round: "R27",
    head: null,
    route: ROUTE,
    startedAt: new Date().toISOString(),
    clips: [],
    steps: [],
    upstream: { requests: [], responses: [] },
    media: { requests: [] },
    statusTimeline: [],
    reload: null,
    result: null,
    actions: {},
    issues: [],
};

const readTasks = (page) => page.evaluate(() => {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("tool-task:v1:task-"));
    const out = [];
    for (const k of keys) {
        let v = null;
        try { v = JSON.parse(localStorage.getItem(k) || "null"); } catch { continue; }
        if (!v || v.toolId !== "VIDEO_CONCAT") continue;
        out.push({
            key: k,
            id: v.id,
            status: v.status,
            upstreamTaskId: v.upstreamTaskId ?? null,
            createdAt: v.createdAt ?? v.submittedAt ?? null,
            submittedAt: v.submittedAt ?? null,
            progress: v.progress ?? null,
            error: v.error ? { message: String(v.error.message || "").slice(0, 500), code: v.error.code ?? null } : null,
            items: (v.result?.items || []).map((i) => ({
                kind: i.kind,
                storageKey: i.storageKey ?? null,
                url: (i.url || "").slice(0, 160),
                bytes: i.bytes ?? null,
                mimeType: i.mimeType ?? null,
                payloadDropped: Boolean(i.payloadDropped),
            })),
            updatedAt: v.updatedAt ?? null,
        });
    }
    return out.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
});

async function main() {
    await fs.mkdir(OUT, { recursive: true });
    record.expect = {
        clipA: { path: CLIP_A, bytes: (await fs.stat(CLIP_A)).size, sha256: sha256(await fs.readFile(CLIP_A)) },
        clipB: { path: CLIP_B, bytes: (await fs.stat(CLIP_B)).size, sha256: sha256(await fs.readFile(CLIP_B)) },
    };

    const ctx = await chromium.launchPersistentContext(PROFILE, {
        channel: "chrome",
        headless: true,
        viewport: { width: 1500, height: 1000 },
        locale: "zh-CN",
        acceptDownloads: true,
    });
    const page = ctx.pages()[0] || (await ctx.newPage());
    page.on("pageerror", (e) => record.issues.push(`pageerror: ${String(e).slice(0, 200)}`));
    page.on("console", (m) => {
        if (m.type() === "error") record.consoleErrors = [...(record.consoleErrors || []), m.text().slice(0, 240)].slice(-20);
    });

    page.on("request", async (req) => {
        const url = req.url();
        if (/\/v1\/videos(\?|$)/.test(url) || /\/v1\/videos\/[^/]+$/.test(url)) {
            const entry = { at: new Date().toISOString(), method: req.method(), url: url.slice(0, 200) };
            if (req.method() === "POST") {
                const buf = req.postDataBuffer();
                if (buf) {
                    const text = buf.toString("latin1");
                    entry.bytes = buf.length;
                    entry.videoFields = (text.match(/name="video\[\]"/g) || []).length;
                    entry.imageFields = (text.match(/name="input_reference"|name="image"/g) || []).length;
                    entry.mediaUrls = [...new Set((text.match(/https?:\/\/[^\s"'\r\n]+\.(?:mp4|mov|webm)/g) || []))].slice(0, 8);
                    const modelMatch = text.match(/name="model"\r?\n\r?\n([^\r\n]+)/);
                    entry.model = modelMatch ? modelMatch[1] : null;
                    const secondsMatch = text.match(/name="seconds"\r?\n\r?\n([^\r\n]+)/);
                    entry.seconds = secondsMatch ? secondsMatch[1] : null;
                    const sizeMatch = text.match(/name="size"\r?\n\r?\n([^\r\n]+)/);
                    entry.size = sizeMatch ? sizeMatch[1] : null;
                }
            }
            record.upstream.requests.push(entry);
        } else if (/__media\/upload|trycloudflare\.com/.test(url)) {
            record.media.requests.push({ at: new Date().toISOString(), method: req.method(), url: url.slice(0, 200), bytes: req.postDataBuffer()?.length ?? null });
        }
    });
    page.on("response", async (res) => {
        const url = res.url();
        if (!/\/v1\/videos(\?|\/|$)/.test(url)) return;
        let body = "";
        try { body = (await res.text()).slice(0, 600); } catch { body = "<no body>"; }
        record.upstream.responses.push({ at: new Date().toISOString(), method: res.request().method(), status: res.status(), url: url.slice(0, 160), body });
    });

    try {
        record.head = "captured-in-run";
        await page.goto(`${BASE}${ROUTE}?r27=${Date.now()}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.body.innerText.includes("视频拼接"), undefined, { timeout: 45000 });
        await page.waitForSelector('[data-testid="video-concat-config"]', { timeout: 30000 });
        record.steps.push("page-opened");

        // 清空草稿里可能残留的片段/封面（只点页面自己的删除按钮，不写 store）
        for (let i = 0; i < 12; i += 1) {
            const del = page.locator('[data-testid="video-concat-clips"] button[aria-label="删除"]').first();
            if (!(await del.count())) break;
            await del.click();
            await page.waitForTimeout(250);
        }
        record.steps.push("draft-cleared");

        // 真实上传两段
        const clipsInput = page.locator('[data-testid="video-concat-config"] input[type="file"][multiple]').first();
        await clipsInput.setInputFiles([CLIP_A, CLIP_B]);
        await page.waitForFunction(() => document.querySelectorAll('[data-testid="video-concat-clips"] li').length >= 2, undefined, { timeout: 90000 });
        await page.waitForFunction(() => {
            const el = document.querySelector('[data-testid="video-concat-clips"]');
            return el && !el.innerText.includes("时长未知") && !document.body.innerText.includes("正在读取片段真实时长");
        }, undefined, { timeout: 120000 });
        record.clips = await page.evaluate(() => [...document.querySelectorAll('[data-testid="video-concat-clips"] li')].map((li) => li.innerText.replace(/\s+/g, " ").trim().slice(0, 160)));
        record.steps.push("clips-uploaded-with-real-duration");

        // 抓帧封面（真实 <video> 解码 + canvas）
        await page.locator('[data-testid="video-concat-grab-cover"]').click();
        await page.waitForSelector('[data-testid="video-concat-cover-name"]', { timeout: 90000 });
        record.cover = await page.evaluate(() => ({
            name: document.querySelector('[data-testid="video-concat-cover-name"]')?.textContent?.trim() ?? null,
            imgBytes: null,
        }));
        record.steps.push("cover-grabbed");

        record.preSubmit = await page.evaluate(() => ({
            channel: document.querySelector('[data-testid="video-concat-channel"]')?.innerText?.replace(/\s+/g, " ").trim() ?? null,
            summary: document.querySelector('[data-testid="video-concat-summary"]')?.innerText?.replace(/\s+/g, " ").trim() ?? null,
            issues: [...document.querySelectorAll('[data-testid="video-concat-issues"] li')].map((n) => n.innerText.trim()),
            blocked: document.querySelector('[data-testid="video-concat-blocked"]')?.innerText?.trim() ?? null,
        }));

        const submit = page.locator('[data-testid="video-concat-submit"]');
        record.submitState = {
            visible: await submit.count(),
            disabled: (await submit.count()) ? await submit.first().isDisabled() : null,
            text: (await submit.count()) ? (await submit.first().innerText()).trim() : null,
        };
        if (record.submitState.disabled) {
            record.issues.push(`提交按钮被禁用：${record.preSubmit.blocked || record.preSubmit.issues.join(";")}`);
            throw new Error("submit-disabled");
        }
        await submit.first().click();
        record.submitAt = new Date().toISOString();
        record.steps.push("submit-clicked");

        // 等任务快照出现（点击后 store 会创建 submitting 任务）
        await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith("tool-task:v1:task-")), undefined, { timeout: 20000 }).catch(() => {});
        let task = null;
        const deadline = Date.now() + WAIT_MIN * 60_000;
        let lastKey = "";
        while (Date.now() < deadline) {
            const tasks = await readTasks(page);
            record.storeSnapshotCount = tasks.length;
            task = tasks[0] || null;
            const key = task ? `${task.status}:${task.progress ?? ""}:${task.items.length}:${task.error?.message ?? ""}` : "none";
            if (key !== lastKey) {
                lastKey = key;
                record.statusTimeline.push({
                    at: new Date().toISOString(),
                    status: task?.status ?? "none",
                    progress: task?.progress ?? null,
                    items: task?.items.length ?? 0,
                    error: task?.error?.message ?? null,
                });
                await page.screenshot({ path: path.join(OUT, `r27-${record.statusTimeline.length}-${task?.status ?? "none"}.png`) }).catch(() => {});
                console.log(`[status] ${task?.status} progress=${task?.progress} items=${task?.items.length} ${task?.error?.message ?? ""}`);
            }
            if (task && TERMINAL.has(task.status)) break;
            await page.waitForTimeout(4000);
        }
        record.final = task;
        record.steps.push("terminal-or-timeout");

        // 上游请求取证摘要
        record.upstreamPost = record.upstream.requests.find((r) => r.method === "POST") || null;
        record.upstreamTaskId = (() => {
            for (const r of record.upstream.responses) {
                try {
                    const j = JSON.parse(r.body);
                    if (j && (j.id || j.task_id || j.data?.id)) return j.id || j.task_id || j.data.id;
                } catch { /* ignore */ }
            }
            return null;
        })();
        record.localTaskId = task?.id ?? null;
        record.upstreamTaskIdFromStore = task?.upstreamTaskId ?? null;

        const ok = task && (task.status === "done" || task.status === "succeeded");

        // fresh reload：历史里必须能找回
        await page.goto(`${BASE}${ROUTE}?fresh=${Date.now()}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="tool-task-history"]')), undefined, { timeout: 45000 });
        await page.waitForTimeout(2500);
        record.reload = await page.evaluate((tid) => {
            const rows = [...document.querySelectorAll('[data-testid="tool-task-history-item"]')].map((n) => ({
                taskId: n.getAttribute("data-task-id"),
                status: n.getAttribute("data-task-status"),
                text: n.innerText.replace(/\s+/g, " ").slice(0, 180),
            }));
            return { count: rows.length, matched: rows.some((r) => r.taskId === tid), head: rows.slice(0, 3) };
        }, record.localTaskId);
        record.steps.push("fresh-reload-history");
        await page.screenshot({ path: path.join(OUT, "r27-fresh-reload.png") }).catch(() => {});

        if (ok) {
            const openBtn = page.locator(`[data-testid="tool-task-history-item"][data-task-id="${record.localTaskId}"] [data-testid="tool-task-history-open"]`).first();
            await openBtn.click();
            await page.waitForFunction(() => {
                const v = document.querySelector('[data-testid="tool-result-video"]');
                return Boolean(v) && v.readyState >= 1;
            }, undefined, { timeout: 180000 });
            record.steps.push("history-restored-result");

            record.result = await page.evaluate(async () => {
                const v = document.querySelector('[data-testid="tool-result-video"]');
                const src = v?.currentSrc || v?.src || "";
                const out = { src: src.slice(0, 200), readyState: v?.readyState ?? null, duration: v?.duration ?? null, width: v?.videoWidth ?? null, height: v?.videoHeight ?? null };
                try {
                    const buf = await (await fetch(src, { cache: "no-store" })).arrayBuffer();
                    out.bytes = buf.byteLength;
                    out.magic = String.fromCharCode(...new Uint8Array(buf.slice(4, 8)));
                    const digest = await crypto.subtle.digest("SHA-256", buf);
                    out.sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
                } catch (e) { out.fetchError = String(e).slice(0, 200); }
                out.hasDownload = Boolean(document.querySelector('[data-testid="tool-result-download-0"]'));
                return out;
            });

            // 下载
            const dl = page.locator('[data-testid="tool-result-download-0"]').first();
            if (await dl.count()) {
                const [download] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }).catch(() => null), dl.click()]);
                if (download) {
                    const target = path.join(OUT, "r27-downloaded.mp4");
                    await download.saveAs(target);
                    const buf = await fs.readFile(target);
                    record.actions.download = {
                        file: target,
                        suggested: download.suggestedFilename(),
                        bytes: buf.length,
                        magic: buf.slice(4, 8).toString("ascii"),
                        sha256: sha256(buf),
                        matchesResultSha: record.result?.sha256 ? sha256(buf) === record.result.sha256 : null,
                    };
                } else record.issues.push("下载未触发 download 事件");
            } else record.issues.push("结果区没有下载按钮");
            await page.screenshot({ path: path.join(OUT, "r27-result.png") }).catch(() => {});

            // 存资产
            const save = page.locator('[data-testid="tool-result-save-0"]').first();
            if (await save.count()) {
                await save.click();
                await page.waitForFunction(() => (document.querySelector('[data-testid="tool-result-feedback"]')?.textContent ?? "").length > 0, undefined, { timeout: 60000 }).catch(() => {});
                record.actions.save = await page.evaluate(async () => {
                    const feedback = document.querySelector('[data-testid="tool-result-feedback"]')?.textContent?.trim() ?? null;
                    try {
                        const mod = await import("/src/stores/use-asset-store.ts");
                        const list = mod.useAssetStore.getState().assets || [];
                        const videos = list.filter((a) => a.kind === "video" || a.mimeType?.startsWith("video/"));
                        return { feedback, count: list.length, videos: videos.map((a) => ({ id: a.id, bytes: a.bytes, mimeType: a.mimeType ?? null, toolId: a.toolId ?? null })).slice(-3) };
                    } catch (e) { return { feedback, error: String(e).slice(0, 200) }; }
                });
            } else record.issues.push("结果区没有存资产按钮");

            // 发画布
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
                    } catch { /* ignore */ }
                    return { feedback, videoNodes };
                });
                await page.screenshot({ path: path.join(OUT, "r27-sent-canvas.png") }).catch(() => {});
                record.steps.push("three-actions-done");
            } else record.issues.push("结果区没有发画布按钮");
        } else {
            record.issues.push(`任务非成功终态（${task?.status ?? "none"}），不构造成功证据`);
            record.errorDom = await page.evaluate(() => ({
                alerts: [...document.querySelectorAll('[role="alert"]')].map((n) => n.innerText.trim()).slice(0, 6),
                errorText: document.querySelector('[data-testid="video-concat-error"]')?.innerText?.trim() ?? null,
                historyText: document.querySelector('[data-testid="video-concat-history"]')?.innerText?.replace(/\s+/g, " ").trim().slice(0, 400) ?? null,
            })).catch(() => null);
        }
    } catch (error) {
        record.error = String(error?.message || error).slice(0, 1000);
        record.stepOnError = record.steps.at(-1) ?? null;
        record.domOnError = await page.evaluate(() => ({
            alerts: [...document.querySelectorAll('[role="alert"]')].map((n) => n.innerText.trim()).slice(0, 6),
            concatError: document.querySelector('[data-testid="video-concat-error"]')?.innerText?.trim() ?? null,
            issues: [...document.querySelectorAll('[data-testid="video-concat-issues"] li')].map((n) => n.innerText.trim()),
            tail: document.body.innerText.slice(-700),
        })).catch(() => null);
        await page.screenshot({ path: path.join(OUT, "r27-error.png") }).catch(() => {});
    } finally {
        record.finishedAt = new Date().toISOString();
        record.upstreamRequestCount = record.upstream.requests.length;
        await fs.writeFile(path.join(OUT, "r27-run.json"), JSON.stringify(record, null, 2));
        console.log(JSON.stringify({
            steps: record.steps,
            submitState: record.submitState,
            preSubmit: record.preSubmit,
            clips: record.clips,
            upstreamPost: record.upstreamPost,
            upstreamTaskId: record.upstreamTaskId || record.upstreamTaskIdFromStore,
            final: record.final,
            reload: record.reload,
            result: record.result,
            actions: record.actions,
            issues: record.issues,
            error: record.error ?? null,
        }, null, 2));
        await ctx.close();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
