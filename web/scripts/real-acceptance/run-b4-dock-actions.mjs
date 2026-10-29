/**
 * B4 真实验收：14 个工具的结果区/历史面板「下载 / 存入资产 / 发送画布」三动作。
 *
 * 边界（不 mock、不重调上游）：
 * - 结果字节来自**此前真实上游产物**（evidence/real-acceptance/<TOOL>/ 下真实文件），
 *   由本脚本起一个带 CORS 的本地静态服务托管，浏览器真实 HTTP 取字节；
 * - 任务快照用应用自身的 `persistTask()` 落盘 → 刷新 → 历史面板从 localStorage 读回；
 * - 点击的是真实按钮，走真实 image-storage / 资产库 / 画布 store，不做状态注入式"假通过"；
 * - 视频工具（AI_VIDEO_EDITING / SALE_VIDEO）上游端点 404，无自有产物，
 *   这里复用 IMAGE_TO_VIDEO 已验收的真实 mp4 字节，证据里显式标注 source=borrowed。
 */
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const EVIDENCE_ROOT = path.resolve("/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance");
const PORT = Number(process.env.IC_B4_PORT || 8991);
const ORIGIN = `http://127.0.0.1:${PORT}`;

/** toolId → 路由 + 真实产物文件（相对 EVIDENCE_ROOT）+ 结果类型 */
const TOOLS = [
    { toolId: "AI_DRESSING_V2", route: "/tools/product-design/ai-dressing-v2", file: "AI_DRESSING_V2/result1.png", kind: "image" },
    { toolId: "AI_POSE_GENERATOR", route: "/tools/product-design/ai-pose-generator", file: "AI_POSE_GENERATOR/real-run-1024.png", kind: "image" },
    { toolId: "AI_POSTURE", route: "/tools/product-design/ai-posture", file: "AI_POSTURE/result1.png", kind: "image" },
    { toolId: "AI_WEARABLE", route: "/tools/product-design/ai-wearable", file: "AI_WEARABLE/result1.png", kind: "image" },
    { toolId: "FISSION_LINK", route: "/tools/product-design/fission-link", file: "FISSION_LINK/01-result.png", kind: "image" },
    { toolId: "NEW_REPLACE_BG_V2", route: "/tools/product-design/new-replace-bg-v2", file: "NEW_REPLACE_BG_V2/result1.png", kind: "image" },
    { toolId: "AI_OUTPAINTING", route: "/tools/ecommerce-suite/ai-outpainting", file: "AI_OUTPAINTING/02-result.png", kind: "image", surface: "result" },
    { toolId: "HANDHELD_GOODS", route: "/tools/product-design/handheld-goods", file: "HANDHELD_GOODS/result.png", kind: "image" },
    { toolId: "MATERIAL_UPPER_BODY", route: "/tools/product-design/material-upper-body", file: "MATERIAL_UPPER_BODY/real-run-1024.png", kind: "image" },
    { toolId: "CHANGE_COLOR_V2", route: "/tools/ecommerce-suite/change-color-v2", file: "CHANGE_COLOR_V2/05-unit1-result.png", kind: "image" },
    { toolId: "SCALE_UP", route: "/tools/ecommerce-suite/scale-up", file: "SCALE_UP/02-result.png", kind: "image" },
    { toolId: "IMAGE_TRANSLATION", route: "/tools/ecommerce-suite/image-translation", file: "IMAGE_TRANSLATION/result.png", kind: "image" },
    { toolId: "PRODUCT_IMAGE_SUITE", route: "/tools/ecommerce-suite/product-image-suite", file: "PRODUCT_IMAGE_SUITE/02-result.png", kind: "image" },
    { toolId: "DRESS_WEAR_SET", route: "/tools/ecommerce-suite/dress-wear-set", file: "DRESS_WEAR_SET/result.png", kind: "image" },
    { toolId: "AI_VIDEO_EDITING", route: "/tools/ai-video/ai-video-editing", file: "IMAGE_TO_VIDEO/06-result-video.mp4", kind: "video", source: "borrowed" },
    { toolId: "SALE_VIDEO", route: "/tools/ai-video/sale-video", file: "IMAGE_TO_VIDEO/06-result-video.mp4", kind: "video", source: "borrowed" },
];

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

function startServer() {
    const server = http.createServer(async (req, res) => {
        const rel = decodeURIComponent(new URL(req.url, ORIGIN).pathname).replace(/^\/+/, "");
        const abs = path.join(EVIDENCE_ROOT, rel);
        if (!abs.startsWith(EVIDENCE_ROOT)) {
            res.writeHead(403).end("forbidden");
            return;
        }
        try {
            const buf = await fsp.readFile(abs);
            res.writeHead(200, {
                "content-type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream",
                "content-length": buf.length,
                "access-control-allow-origin": "*",
                "cache-control": "no-store",
            });
            res.end(buf);
        } catch {
            res.writeHead(404, { "access-control-allow-origin": "*" }).end("not found");
        }
    });
    return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildTask(tool, url) {
    const now = Date.now();
    const item = {
        id: `b4-${tool.toolId.toLowerCase()}-item-1`,
        kind: tool.kind,
        url,
        mimeType: tool.kind === "video" ? "video/mp4" : "image/png",
    };
    return {
        id: `b4-${tool.toolId.toLowerCase()}-task`,
        toolId: tool.toolId,
        status: "succeeded",
        clientOperationId: `b4-${tool.toolId.toLowerCase()}-op`,
        fingerprint: `b4-${tool.toolId.toLowerCase()}-fp`,
        capability: tool.kind,
        prompt: `B4 三动作验收：${tool.toolId} 真实产物复用（不重调上游）`,
        configSnapshot: { capability: tool.kind, model: "evidence-reuse", count: 1 },
        sourceAssetIds: [],
        createdAt: now,
        updatedAt: now,
        submittedAt: now,
        finishedAt: now,
        attempts: 1,
        pollCount: 0,
        transientFailures: 0,
        result: { items: [item], completedAt: now },
    };
}

/** 在页面上挂 MutationObserver，记录动作期间按钮是否进入 disabled（busy）态。 */
const OBSERVE = () => {
    window.__b4 = { busySeen: false, spinnerSeen: false };
    const root = document.querySelector('[data-testid="tool-history-dock"], [data-testid="tool-result"]');
    if (!root) return;
    const check = () => {
        if (root.querySelector("button[disabled]")) window.__b4.busySeen = true;
        if ((root.textContent || "").includes("处理中")) window.__b4.spinnerSeen = true;
    };
    window.__b4obs?.disconnect?.();
    window.__b4obs = new MutationObserver(check);
    window.__b4obs.observe(root, { childList: true, subtree: true, attributes: true });
    check();
};

const READ_BUSY = () => {
    const root = document.querySelector('[data-testid="tool-history-dock"], [data-testid="tool-result"]');
    return {
        ...window.__b4,
        disabledNow: root ? root.querySelectorAll("button[disabled]").length : -1,
    };
};

/** 轮询读取动作反馈文案：toast 时有时无，取首个非空即可。 */
async function readFeedback(page, timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const text = await page
            .evaluate(() => {
                const nodes = Array.from(
                    document.querySelectorAll(
                        '[data-testid="tool-history-dock-feedback"], [data-testid="tool-result-feedback"]',
                    ),
                );
                for (const node of nodes) {
                    const value = (node.textContent || "").trim();
                    if (value) return value;
                }
                return "";
            })
            .catch(() => "");
        if (text) return text;
        await page.waitForTimeout(200);
    }
    return null;
}

async function readStores(page) {
    return page.evaluate(async () => {
        // 直接读持久化层，避免动态 import 触发第二份 zustand 实例（异步水合导致误读为空）
        const { localForageStorage } = await import("/src/lib/localforage-storage.ts");
        let assets = [];
        for (let attempt = 0; attempt < 12; attempt += 1) {
            const raw = await localForageStorage.getItem("infinite-canvas:asset_store");
            if (raw) {
                try {
                    assets = JSON.parse(raw)?.state?.assets || [];
                } catch {
                    assets = [];
                }
                if (assets.length) break;
            }
            await new Promise((r) => setTimeout(r, 250));
        }
        let projects = [];
        // 画布项目同样读持久化层（zustand persist + localForage，setItem 有 400ms 去抖），
        // 动态 import store 会拿到另一份 zustand 实例，读不到本页面写入的项目。
        for (let attempt = 0; attempt < 12; attempt += 1) {
            const raw = await localForageStorage.getItem("infinite-canvas:canvas_store");
            if (raw) {
                try {
                    const list = JSON.parse(raw)?.state?.projects;
                    if (Array.isArray(list)) projects = list;
                } catch {
                    projects = [];
                }
                if (projects.length) break;
            }
            await new Promise((r) => setTimeout(r, 250));
        }
        if (!projects.length) {
            try {
                const canvasStore = await import("/src/stores/canvas/use-canvas-store.ts");
                projects = canvasStore.useCanvasStore.getState().projects || [];
            } catch {
                projects = [];
            }
        }
        if (!projects.length) {
            for (const key of Object.keys(localStorage)) {
                if (!key.toLowerCase().includes("canvas")) continue;
                try {
                    const parsed = JSON.parse(localStorage.getItem(key) || "{}");
                    if (Array.isArray(parsed?.state?.projects) && parsed.state.projects.length) {
                        projects = parsed.state.projects;
                        break;
                    }
                } catch {
                    /* 非本应用的键，忽略 */
                }
            }
        }
        const lastAsset = assets[0]
            ? {
                  id: assets[0].id,
                  title: assets[0].title,
                  kind: assets[0].kind,
                  storageKey: assets[0].data?.storageKey,
                  bytes: assets[0].data?.bytes,
                  toolId: assets[0].metadata?.toolId,
                  count: assets.length,
              }
            : null;
        const project = projects[0];
        return {
            assetCount: assets.length,
            lastAsset,
            projectCount: projects.length,
            lastProject: project
                ? {
                      id: project.id,
                      title: project.title,
                      nodeCount: (project.nodes || []).length,
                      lastNode: ((project.nodes || []).slice(-1)[0] || null) && {
                          id: project.nodes.slice(-1)[0].id,
                          type: project.nodes.slice(-1)[0].type,
                          metadata: project.nodes.slice(-1)[0].metadata,
                      },
                  }
                : null,
        };
    });
}

async function runTool(browser, tool) {
    const record = { toolId: tool.toolId, route: tool.route, source: tool.source ?? "own", steps: {}, ok: false, errors: [] };
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN", acceptDownloads: true });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("pageerror", (err) => consoleErrors.push(String(err).slice(0, 300)));

    const url = `${ORIGIN}/${tool.file}`;
    const task = buildTask(tool, url);

    try {
        await page.goto(`${BASE_URL}${tool.route}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1200);

        // 1) 用应用自身的持久化把任务落进 localStorage 快照
        await page.evaluate(async (payload) => {
            const store = await import("/src/stores/use-tool-task-store.ts");
            store.persistTask(payload);
        }, task);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1200);

        const surface = tool.surface ?? "dock";
        if (surface === "dock") {
            const dock = page.locator('[data-testid="tool-history-dock"]');
            try {
                await dock.waitFor({ state: "visible", timeout: 30000 });
            } catch (error) {
                record.steps.failBody = await page.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => null);
                throw error;
            }
            record.steps.dockMounted = true;
            record.steps.dockItemCount = await page.locator('[data-testid="tool-history-dock-item"]').count();
            await page.locator('[data-testid="tool-history-dock-toggle"]').first().click();
            await page.waitForTimeout(300);
            record.steps.detailVisible = await page.locator('[data-testid="tool-history-dock-result"]').count();
        } else {
            // AI_OUTPAINTING：自带历史面板 → 点「查看结果」把任务交给真实结果区
            const open = page.locator('[data-testid="tool-task-history-open"]').first();
            await open.waitFor({ state: "visible", timeout: 15000 });
            await open.click();
            await page.waitForTimeout(600);
            await page.locator('[data-testid="tool-result"]').waitFor({ state: "visible", timeout: 10000 });
            record.steps.resultVisible = true;
        }

        const before = await readStores(page);
        record.steps.before = before;

        const testid = (action) =>
            surface === "dock" ? `tool-history-dock-${action}` : `tool-result-${action}-0`;

        // 2) 下载（真实 download 事件 + 真实字节）
        await page.evaluate(OBSERVE);
        const downloadPromise = page.waitForEvent("download", { timeout: 20000 }).catch(() => null);
        await page.locator(`[data-testid="${testid("download")}"]`).first().click();
        const download = await downloadPromise;
        let downloaded = null;
        if (download) {
            const tmp = path.join("/tmp", `b4-${tool.toolId}-${Date.now()}-${download.suggestedFilename()}`);
            await download.saveAs(tmp);
            const stat = await fsp.stat(tmp);
            downloaded = { suggestedFilename: download.suggestedFilename(), bytes: stat.size, path: tmp };
            await fsp.unlink(tmp).catch(() => {});
        }
        await page.waitForTimeout(1500);
        record.steps.download = { download: downloaded, busy: await page.evaluate(READ_BUSY) };

        // 3) 存入资产
        await page.evaluate(OBSERVE);
        await page.locator(`[data-testid="${testid("save")}"]`).first().click();
        const saveFeedback = await readFeedback(page);
        const afterSave = await readStores(page);
        record.steps.save = {
            feedback: (saveFeedback || "").trim() || null,
            assetCountBefore: before.assetCount,
            assetCountAfter: afterSave.assetCount,
            lastAsset: afterSave.lastAsset,
            busy: await page.evaluate(READ_BUSY),
        };

        // 4) 发送到画布
        await page.evaluate(OBSERVE);
        await page.locator(`[data-testid="${testid("canvas")}"]`).first().click();
        const canvasFeedback = await readFeedback(page);
        const afterCanvas = await readStores(page);
        record.steps.canvas = {
            feedback: (canvasFeedback || "").trim() || null,
            projectCountBefore: before.projectCount,
            projectCountAfter: afterCanvas.projectCount,
            lastProject: afterCanvas.lastProject,
            busy: await page.evaluate(READ_BUSY),
        };

        record.steps.title = await page.title();
        record.steps.consoleErrors = consoleErrors;

        const d = record.steps.download;
        const s = record.steps.save;
        const c = record.steps.canvas;
        const downloadBytes = d.download?.bytes ?? 0;
        const assetBytes = s.lastAsset?.bytes ?? 0;
        const nodeBytes = c.lastProject?.lastNode?.metadata?.bytes ?? 0;
        record.steps.bytesMatch = {
            download: downloadBytes,
            asset: assetBytes,
            node: nodeBytes,
            same: downloadBytes > 0 && downloadBytes === assetBytes && downloadBytes === nodeBytes,
        };
        record.ok = Boolean(
            d.download && d.download.bytes > 0 &&
            s.assetCountAfter > s.assetCountBefore &&
            c.projectCountAfter > c.projectCountBefore &&
            c.lastProject?.nodeCount > 0 &&
            record.steps.bytesMatch.same &&
            s.lastAsset?.toolId === tool.toolId &&
            !d.busy.disabledNow && !s.busy.disabledNow && !c.busy.disabledNow &&
            consoleErrors.length === 0,
        );
        if (!record.ok) {
            record.errors.push(
                `assert: download=${!!d.download}(${downloadBytes}B) asset ${s.assetCountBefore}->${s.assetCountAfter}(${assetBytes}B,tool=${s.lastAsset?.toolId ?? "-"}) project ${c.projectCountBefore}->${c.projectCountAfter} nodes=${c.lastProject?.nodeCount ?? 0}(${nodeBytes}B) disabledNow=${d.busy.disabledNow}/${s.busy.disabledNow}/${c.busy.disabledNow} pageerrors=${consoleErrors.length}`,
            );
        }

        await page.screenshot({ path: path.join(EVIDENCE_ROOT, tool.toolId, "b4-actions.png") }).catch(() => {});
    } catch (error) {
        record.errors.push(String(error && error.message ? error.message : error).slice(0, 400));
        await page.screenshot({ path: path.join(EVIDENCE_ROOT, tool.toolId, "b4-actions-fail.png") }).catch(() => {});
    } finally {
        await context.close().catch(() => {});
    }
    return record;
}

const server = await startServer();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
    const only = (process.env.IC_B4_ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
    const selected = only.length ? TOOLS.filter((t) => only.includes(t.toolId)) : TOOLS;
    for (const tool of selected) {
        const rec = await runTool(browser, tool);
        results.push(rec);
        await fsp.mkdir(path.join(EVIDENCE_ROOT, tool.toolId), { recursive: true });
        await fsp.writeFile(
            path.join(EVIDENCE_ROOT, tool.toolId, "b4-actions.json"),
            JSON.stringify({ ...rec, recordedAt: new Date().toISOString() }, null, 2),
        );
        console.log(`${rec.ok ? "PASS" : "FAIL"} ${tool.toolId} ${rec.ok ? "" : rec.errors.join(" | ")}`);
    }
} finally {
    await browser.close().catch(() => {});
    server.close();
}

const pass = results.filter((r) => r.ok).length;
await fsp.writeFile(path.join(EVIDENCE_ROOT, "b4-summary.json"), JSON.stringify({ pass, total: results.length, results }, null, 2));
console.log(`\n${pass}/${results.length} PASS`);
process.exit(pass === results.length ? 0 : 1);
