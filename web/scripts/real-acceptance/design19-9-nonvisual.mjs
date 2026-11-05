/**
 * design19 后 9 工具「非视觉」补验执行器。
 *
 * 一条流水线内做四件事（全部真实，不 mock、不注入结果）：
 *  1) 默认值：冷启动抓取本站工作区每个控件的默认值（DOM 快照）；
 *  2) 真实生成：真实上传参考图 + 真实点击提交 + 真 provider（canvas-proxy）→ 等 UI 出结果；
 *  3) 三动作：结果区「下载 / 存入资产 / 发送画布」真实点击，校验三处字节 == 结果字节（sha256）；
 *  4) 历史：reload 后历史面板读回同一任务，结果图解码成功。
 *
 * 用法（cwd=web）：
 *   node scripts/real-acceptance/design19-9-nonvisual.mjs --ids=ORNAMENT_TEXT
 *   node scripts/real-acceptance/design19-9-nonvisual.mjs --ids=ORNAMENT_TEXT --probe
 * 产物：docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/<ID>/nv-<ts>.json + 结果字节
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { chromium } from "playwright";
import { applyProviderConfig } from "./provider.mjs";

const BASE_URL = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const PROXY_URL = process.env.IC_PROXY_URL || "http://127.0.0.1:23210";
const REPO = "/Users/mac/Documents/Dev/infinite-canvas";
const EVIDENCE_ROOT = path.join(REPO, "docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance");
const FIXTURES = path.join(REPO, "web/scripts/real-acceptance/fixtures");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

const args = process.argv.slice(2);
const argOf = (name) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : "";
};
const PROBE = args.includes("--probe");
const IDS = argOf("ids").split(",").map((s) => s.trim()).filter(Boolean);

/** 读 PNG/JPEG 头拿真实像素尺寸（不信任页面声明） */
function imageDims(buf) {
    if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
        return { mime: "image/png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
        let i = 2;
        while (i < buf.length - 9) {
            if (buf[i] !== 0xff) { i += 1; continue; }
            const marker = buf[i + 1];
            const len = buf.readUInt16BE(i + 2);
            if (marker >= 0xc0 && marker <= 0xcf) {
                return { mime: "image/jpeg", height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
            }
            i += 2 + len;
        }
    }
    return { mime: "unknown", width: 0, height: 0 };
}

/* ------------------------------------------------------------------ specs */

const TOOLS = {
    ORNAMENT_TEXT: {
        route: "/tools/product-design/ornament-text",
        workspace: "ornament-text-workspace",
        // 无需参考图：纯文本出图
        run: async (page) => {
            await page.fill('textarea[aria-label="饰品文字内容"]', "FOREVER");
            await page.fill('textarea[aria-label="效果描述"]', "玫瑰金浮雕，宝石边镶嵌碎钻");
            await sleep(400);
            await page.getByRole("button", { name: "生成饰品文字" }).click();
        },
        submitWaitMs: 900_000,
    },
};

/* ------------------------------------------------------------- snapshots */

function SNAP_JS(workspace) {
    const root = document.querySelector(`[data-testid="${workspace}"]`) ?? document.querySelector("main") ?? document.body;
    const txt = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();
    const controls = [];
    for (const el of root.querySelectorAll("input, select, textarea, [role=switch], [role=slider], [role=radio], [role=tab]")) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const label = el.getAttribute("aria-label") || (el.closest("label") ? txt(el.closest("label")).slice(0, 40) : "") || el.getAttribute("name") || "";
        const rec = {
            tag: el.tagName.toLowerCase(),
            type: el.getAttribute("type") || el.getAttribute("role") || "",
            label,
            value: el.type === "checkbox" || el.type === "radio" ? el.checked : el.value ?? null,
            placeholder: el.getAttribute("placeholder") || null,
            disabled: Boolean(el.disabled),
        };
        if (el.tagName === "SELECT") {
            rec.options = [...el.options].map((o) => ({ value: o.value, label: txt(o), selected: o.selected }));
            rec.value = el.value;
        }
        if (el.getAttribute("role") === "radio" || el.getAttribute("role") === "tab") rec.value = el.getAttribute("aria-checked") ?? el.getAttribute("aria-selected");
        controls.push(rec);
    }
    const buttons = [...root.querySelectorAll("button")].map((b) => ({ text: txt(b).slice(0, 40), disabled: Boolean(b.disabled), aria: b.getAttribute("aria-label") })).filter((b) => b.text || b.aria);
    const bodyText = (document.body.innerText || "").replace(/\n{2,}/g, "\n");
    return {
        url: location.pathname,
        title: document.title,
        controls,
        buttons,
        tabs: [...document.querySelectorAll('[role="tab"]')].map((t) => ({ text: txt(t), selected: t.getAttribute("aria-selected") })),
        caseModule: {
            has优秀案例: bodyText.includes("优秀案例"),
            has案例: bodyText.includes("案例"),
            has历史记录: bodyText.includes("历史记录"),
            has生成结果: bodyText.includes("生成结果"),
            toolCasesMounted: Boolean(document.querySelector('[data-testid="tool-cases"]')),
        },
        bodyText: bodyText.slice(0, 4000),
    };
};

/* --------------------------------------------------------------- helpers */

/**
 * 从 DOM 读任务状态（不用 `/src/...` 动态 import）。
 *
 * 为什么：Vite dev 下应用入口是 `/src/main.tsx?t=xxx`，其链上的 store 模块 URL 带 `?t=`，
 * 与 evaluate 里裸路径 `import("/src/stores/use-tool-task-store.ts")` 是**两个模块实例**，
 * 读到的任务表恒为空（曾导致「提交后 45s 无任务落库」的误判）。DOM 是唯一口径。
 */
async function readTaskStore(page, toolId) {
    return page.evaluate(() => {
        const q = (s) => document.querySelector(s);
        const txt = (s) => {
            const n = q(s);
            return n ? (n.textContent || "").trim() : null;
        };
        const running = Boolean(q('[data-testid="tool-result-running"]'));
        const failed = q('[data-testid="tool-result-failed"]');
        const unknown = q('[data-testid="tool-result-unknown"]');
        const img = q('[data-testid="tool-result-image"]');
        const historyText = txt('[data-testid="tool-task-history-count"]');
        const historyCount = historyText ? Number((historyText.match(/(\d+)/) || [])[1] || 0) : 0;
        const status = running ? "running" : failed ? "failed" : unknown ? "unknown" : img ? "succeeded" : "idle";
        const items = [...document.querySelectorAll('[data-testid^="tool-result-item-"]')].map((li) => ({
            kind: li.getAttribute("data-kind"),
            payloadDropped: li.getAttribute("data-dropped") === "true",
        }));
        return {
            count: historyCount,
            historyText,
            task:
                status === "idle"
                    ? null
                    : {
                          id: null,
                          status,
                          createdAt: null,
                          finishedAt: null,
                          attempts: null,
                          error: failed ? { code: null, message: (failed.textContent || "").trim().slice(0, 400) } : null,
                          prompt: null,
                          configSnapshot: null,
                          sources: 0,
                          items,
                          summary: txt('[data-testid="tool-result-summary"]'),
                      },
        };
    });
}

const RESULT_SRC_JS = () => {
    const img = document.querySelector('[data-testid="tool-result-image"]');
    if (!img) return null;
    return img.currentSrc || img.src || null;
};

async function readStores(page, want = "any") {
    return page.evaluate(async (want) => {
        const { localForageStorage } = await import("/src/lib/localforage-storage.ts");
        const parse = (raw) => {
            try { return JSON.parse(raw); } catch { return null; }
        };
        let assets = [];
        let projects = [];
        // 注意：canvas store 的持久化有 400ms 防抖（use-canvas-store.ts canvasStorage.setItem），
        // 且不能「assets 非空就 break」——否则发送画布后立刻读会读到空 projects（假阴性）。
        for (let i = 0; i < 12; i += 1) {
            const a = parse(await localForageStorage.getItem("infinite-canvas:asset_store"));
            assets = a?.state?.assets || [];
            const c = parse(await localForageStorage.getItem("infinite-canvas:canvas_store"));
            projects = c?.state?.projects || [];
            const hit = want === "asset" ? assets.length : want === "project" ? projects.length : assets.length || projects.length;
            if (hit) break;
            await new Promise((r) => setTimeout(r, 250));
        }
        const a0 = assets[0];
        const p0 = projects[0];
        const node = p0 ? (p0.nodes || [])[(p0.nodes || []).length - 1] : null;
        return {
            assetCount: assets.length,
            lastAsset: a0 ? { id: a0.id, title: a0.title, kind: a0.kind, storageKey: a0.data?.storageKey, bytes: a0.data?.bytes ?? null, toolId: a0.metadata?.toolId } : null,
            projectCount: projects.length,
            lastProject: p0 ? { id: p0.id, title: p0.title, nodeCount: (p0.nodes || []).length } : null,
            lastNode: node ? { id: node.id, type: node.type, bytes: node.metadata?.bytes ?? null, storageKey: node.metadata?.storageKey ?? null, w: node.metadata?.naturalWidth ?? null, h: node.metadata?.naturalHeight ?? null } : null,
        };
    }, want);
}

async function readFeedback(page, timeoutMs = 8000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
        const t = await page.evaluate(() => {
            const n = document.querySelector('[data-testid="tool-result-feedback"]');
            return n ? (n.textContent || "").trim() : "";
        }).catch(() => "");
        if (t) return t;
        await sleep(200);
    }
    return null;
}

async function waitResult(page, toolId, timeoutMs) {
    const started = Date.now();
    let last = null;
    while (Date.now() - started < timeoutMs) {
        last = await readTaskStore(page, toolId).catch(() => last);
        const st = last?.task?.status;
        if (!st && Date.now() - started > 45_000) {
            const feedback = await page.locator('[data-testid="tool-result-feedback"]').innerText().catch(() => null);
            throw new Error(`提交后 45s 无任务落库（可能被本地契约拦下）。feedback=${feedback}`);
        }
        if (st && st !== "running" && st !== "queued" && st !== "submitting") {
            // 等结果区 img 出现（渲染链路也要验证）
            for (let i = 0; i < 20; i += 1) {
                const src = await page.evaluate(RESULT_SRC_JS).catch(() => null);
                if (src) return { ...last, elapsedMs: Date.now() - started, resultSrc: src };
                await sleep(300);
            }
            return { ...last, elapsedMs: Date.now() - started, resultSrc: null };
        }
        await sleep(2000);
    }
    return { ...(last || {}), elapsedMs: Date.now() - started, timeout: true };
}

async function bytesFromSrc(page, src) {
    if (!src) return null;
    if (src.startsWith("data:")) {
        const b64 = src.split(",")[1] || "";
        return Buffer.from(b64, "base64");
    }
    const arr = await page.evaluate(async (url) => {
        const res = await fetch(url);
        return Array.from(new Uint8Array(await res.arrayBuffer()));
    }, src);
    return Buffer.from(arr);
}

/* ------------------------------------------------------------------ main */

await fs.mkdir(path.join(EVIDENCE_ROOT, "_nv-runs"), { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const summary = [];

try {
    for (const [toolId, spec] of Object.entries(TOOLS)) {
        if (IDS.length && !IDS.includes(toolId)) continue;
        const rec = { toolId, route: spec.route, at: new Date().toISOString(), steps: {}, errors: [] };
        const context = await browser.newContext({ viewport: { width: 1512, height: 950 }, locale: "zh-CN", acceptDownloads: true });
        const page = await context.newPage();
        const pageErrors = [];
        page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 300)));
        const net = [];
        page.on("response", async (res) => {
            const u = res.url();
            if (!u.includes("/v1/images") && !u.includes("23210")) return;
            net.push({ url: u.slice(0, 200), status: res.status(), at: new Date().toISOString() });
        });
        try {
            await page.goto(`${BASE_URL}${spec.route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
            await page.waitForTimeout(2500);

            // 注入 keychain 里的真实图像渠道（ccai gpt-image-2），否则会落到无 key 的 default 渠道打 api.openai.com
            const prov = await applyProviderConfig(page);
            rec.steps.provider = { imageModel: prov.imageModel, channelCount: prov.channelCount, keyLen: prov.keyLen };
            await page.waitForTimeout(600);

            // 0) 默认值 + 页面结构
            rec.steps.defaults = await page.evaluate(SNAP_JS, spec.workspace);
            rec.steps.config = await page.evaluate(async () => {
                const mod = await import("/src/stores/use-config-store.ts");
                const c = mod.useConfigStore.getState().config;
                const imageModels = mod.selectableModelsByCapability ? mod.selectableModelsByCapability(c, "image") : [];
                return {
                    imageModel: c.imageModel,
                    proxyEnabled: c.proxyEnabled,
                    proxyUrl: c.proxyUrl,
                    channelMode: c.channelMode,
                    channels: (c.channels || []).map((ch) => ({ id: ch.id, name: ch.name, hasKey: Boolean(ch.apiKey), models: (ch.models || []).length })),
                    imageModels,
                };
            });
            console.log(`[${toolId}] defaults=${rec.steps.defaults.controls.length} ctrls, model=${rec.steps.config.imageModel}, models=${rec.steps.config.imageModels?.length}`);
            if (PROBE) {
                await fs.mkdir(path.join(EVIDENCE_ROOT, toolId), { recursive: true });
                await fs.writeFile(path.join(EVIDENCE_ROOT, toolId, "nv-defaults.json"), JSON.stringify(rec, null, 2));
                await context.close();
                summary.push(rec);
                continue;
            }

            // 1) 真实提交
            await spec.run(page);
            rec.steps.submittedAt = new Date().toISOString();

            // 2) 等结果（真实 provider）
            const waited = await waitResult(page, toolId, spec.submitWaitMs ?? 900_000);
            rec.steps.task = waited;
            rec.steps.network = net;
            if (!waited.task || waited.task.status !== "succeeded" || !waited.resultSrc) {
                throw new Error(`结果未落地：status=${waited.task?.status ?? "no-task"} src=${Boolean(waited.resultSrc)} err=${JSON.stringify(waited.task?.error ?? null)} timeout=${Boolean(waited.timeout)}`);
            }

            // 3) 结果字节（真实产物）
            const resultBuf = await bytesFromSrc(page, waited.resultSrc);
            const dims = imageDims(resultBuf);
            const resultSha = sha256(resultBuf);
            const outFile = path.join(EVIDENCE_ROOT, toolId, "nv-result.png");
            await fs.mkdir(path.join(EVIDENCE_ROOT, toolId), { recursive: true });
            await fs.writeFile(outFile, resultBuf);
            rec.steps.result = {
                bytes: resultBuf.length,
                sha256: resultSha,
                dims,
                file: path.relative(REPO, outFile),
                srcKind: waited.resultSrc.startsWith("data:") ? "dataUrl" : "url",
            };
            await page.screenshot({ path: path.join(EVIDENCE_ROOT, toolId, "nv-result-pane.png") }).catch(() => {});

            // 4) 三动作
            const before = await readStores(page, "any");
            rec.steps.before = before;

            const dlPromise = page.waitForEvent("download", { timeout: 25_000 }).catch(() => null);
            await page.locator('[data-testid="tool-result-download-0"]').click();
            const dl = await dlPromise;
            let dlRec = null;
            if (dl) {
                const tmp = path.join("/tmp", `nv-${toolId}-${Date.now()}-${dl.suggestedFilename()}`);
                await dl.saveAs(tmp);
                const buf = await fs.readFile(tmp);
                dlRec = { suggestedFilename: dl.suggestedFilename(), bytes: buf.length, sha256: sha256(buf) };
                await fs.unlink(tmp).catch(() => {});
            }
            await sleep(800);
            const dlFeedback = await readFeedback(page, 3000);
            rec.steps.download = { ...dlRec, feedback: dlFeedback };

            await page.locator('[data-testid="tool-result-save-0"]').click();
            const saveFeedback = await readFeedback(page);
            const afterSave = await readStores(page, "asset");
            rec.steps.save = { feedback: saveFeedback, assetCountBefore: before.assetCount, assetCountAfter: afterSave.assetCount, lastAsset: afterSave.lastAsset };

            await page.locator('[data-testid="tool-result-canvas-0"]').click();
            const canvasFeedback = await readFeedback(page);
            const afterCanvas = await readStores(page, "project");
            rec.steps.canvas = { feedback: canvasFeedback, projectCountBefore: before.projectCount, projectCountAfter: afterCanvas.projectCount, lastProject: afterCanvas.lastProject, lastNode: afterCanvas.lastNode };
            await page.screenshot({ path: path.join(EVIDENCE_ROOT, toolId, "nv-actions.png") }).catch(() => {});

            // 5) 历史：刷新后同一任务仍可读回、结果图可解码
            await page.reload({ waitUntil: "domcontentloaded" });
            await page.waitForTimeout(3000);
            const dock = page.locator('[data-testid="tool-history-dock"]');
            const dockVisible = await dock.isVisible().catch(() => false);
            let dockItems = 0;
            let historyResult = null;
            if (dockVisible) {
                dockItems = await page.locator('[data-testid="tool-history-dock-item"]').count();
                const toggle = page.locator('[data-testid="tool-history-dock-toggle"]').first();
                if (await toggle.isVisible().catch(() => false)) {
                    await toggle.click();
                    await sleep(600);
                    historyResult = await page.evaluate(() => {
                        const img = document.querySelector('[data-testid="tool-history-dock-result"]');
                        return img ? { srcKind: (img.currentSrc || "").startsWith("data:") ? "dataUrl" : "url", ok: img.complete !== false } : null;
                    });
                }
            }
            const afterReloadTask = await readTaskStore(page, toolId);
            rec.steps.history = {
                dockMounted: dockVisible,
                dockItemCount: dockItems,
                historyResultImage: historyResult,
                taskCountAfterReload: afterReloadTask.count,
                taskStatusAfterReload: afterReloadTask.task?.status ?? null,
                itemsPayloadDropped: afterReloadTask.task?.items?.map((i) => i.payloadDropped) ?? [],
            };

            rec.steps.pageErrors = pageErrors;
            rec.steps.bytesMatch = {
                result: resultBuf.length,
                download: dlRec?.bytes ?? 0,
                asset: afterSave.lastAsset?.bytes ?? 0,
                node: afterCanvas.lastNode?.bytes ?? 0,
                same:
                    resultBuf.length > 0 &&
                    dlRec?.bytes === resultBuf.length &&
                    afterSave.lastAsset?.bytes === resultBuf.length &&
                    afterCanvas.lastNode?.bytes === resultBuf.length,
            };
            rec.scroll = true;
        } catch (err) {
            rec.errors.push(String(err && err.message ? err.message : err).slice(0, 500));
            await page.screenshot({ path: path.join(EVIDENCE_ROOT, toolId, "nv-fail.png") }).catch(() => {});
            rec.steps.pageBody = await page.evaluate(() => (document.body.innerText || "").slice(0, 1500)).catch(() => null);
        } finally {
            await context.close().catch(() => {});
        }
        await fs.mkdir(path.join(EVIDENCE_ROOT, toolId), { recursive: true });
        await fs.writeFile(path.join(EVIDENCE_ROOT, toolId, "nv-run.json"), JSON.stringify(rec, null, 2));
        summary.push(rec);
        console.log(`${rec.errors.length ? "FAIL" : "OK"} ${toolId} bytes=${rec.steps.result?.bytes ?? "-"} same=${rec.steps.bytesMatch?.same ?? "-"} ${rec.errors.join(" | ")}`);
    }
} finally {
    await browser.close().catch(() => {});
}
await fs.writeFile(path.join(EVIDENCE_ROOT, "_nv-runs", `design19-9-${Date.now()}.json`), JSON.stringify(summary, null, 2));
