/**
 * design19 前 10 工具非视觉验收：结果区「下载 / 存入资产 / 发送画布」+ 历史。
 * 边界：结果字节来自已真实生成的 PNG；本地带 CORS 静态服务托管 → 浏览器真实取字节；
 * 任务用应用自身 persistTask() 落盘后刷新，点击真实按钮，比对 download/资产/画布节点三处 bytes。
 * 用法：IC_D19_ONLY=AI_TEXT node run-actions10.mjs
 */
import { chromium } from "playwright";
import http from "node:http";
import fsp from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const ROOT = "/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence";
const NADIR = path.join(ROOT, "design19-nv-20261029");
const RA = path.join(ROOT, "real-acceptance");
const SERVE = "/tmp/ic-d19n-artifacts";
const PORT = Number(process.env.IC_D19_PORT || 8993);
const ORIGIN = `http://127.0.0.1:${PORT}`;

const TOOLS = [
    { toolId: "NEW_REPLACE_BG", taskToolId: "NEW_REPLACE_BG_V2", historyTab: true, route: "/tools/product-design/new-replace-bg-v2", file: path.join(RA, "NEW_REPLACE_BG_V2/result1.png") },
    { toolId: "REPLACE_GOODS", route: "/tools/product-design/replace-goods", file: path.join(RA, "REPLACE_GOODS/upstream_result.png") },
    { toolId: "PRODUCT_SCENE", historyTab: true, route: "/tools/product-design/product-scene", file: path.join(RA, "PRODUCT_SCENE/result1.png") },
    { toolId: "HANDHELD_GOODS", route: "/tools/product-design/handheld-goods", file: path.join(RA, "HANDHELD_GOODS/result.png") },
    { toolId: "AI_DRESSING_V2", route: "/tools/product-design/ai-dressing-v2", file: path.join(RA, "AI_DRESSING_V2/result1.png") },
    { toolId: "AI_POSTURE", route: "/tools/product-design/ai-posture", file: path.join(RA, "AI_POSTURE/result1.png") },
    { toolId: "AI_WEARABLE", route: "/tools/product-design/ai-wearable", file: path.join(RA, "AI_WEARABLE/result1.png") },
    { toolId: "AI_TEXT", route: "/tools/product-design/ai-text", file: path.join(NADIR, "gen/AI_TEXT.png") },
    { toolId: "ORNAMENT_TEXT", route: "/tools/product-design/ornament-text", file: path.join(NADIR, "gen/ORNAMENT_TEXT.png") },
    { toolId: "SDS_DESIGN", route: "/tools/product-design/sds-design", file: path.join(NADIR, "gen/SDS_DESIGN.png") },
];

function startServer() {
    const server = http.createServer(async (req, res) => {
        const rel = decodeURIComponent(new URL(req.url, ORIGIN).pathname).replace(/^\/+/, "");
        const abs = path.join(SERVE, rel);
        if (!abs.startsWith(SERVE)) return void res.writeHead(403).end("forbidden");
        try {
            const buf = await fsp.readFile(abs);
            res.writeHead(200, { "content-type": "image/png", "content-length": buf.length, "access-control-allow-origin": "*", "cache-control": "no-store" });
            res.end(buf);
        } catch {
            res.writeHead(404, { "access-control-allow-origin": "*" }).end("not found");
        }
    });
    return new Promise((r) => server.listen(PORT, "127.0.0.1", () => r(server)));
}

function buildTask(tool, url) {
    const now = Date.now();
    const slug = tool.toolId.toLowerCase();
    const taskToolId = tool.taskToolId || tool.toolId;
    return {
        id: `d19-${slug}-task`, toolId: taskToolId, status: "succeeded",
        clientOperationId: `d19-${slug}-op`, fingerprint: `d19-${slug}-fp`, capability: "image",
        prompt: `design19 非视觉验收：${tool.toolId} 真实产物复用（不重调上游）`,
        configSnapshot: { capability: "image", model: "evidence-reuse", count: 1 }, sourceAssetIds: [],
        createdAt: now, updatedAt: now, submittedAt: now, finishedAt: now,
        attempts: 1, pollCount: 0, transientFailures: 0,
        result: { items: [{ id: `d19-${slug}-item-1`, kind: "image", url, mimeType: "image/png" }], completedAt: now },
    };
}

const OBSERVE = () => {
    window.__d19 = { busySeen: false };
    const root = document.querySelector('[data-testid="tool-result"], [data-testid="tool-history-dock"]');
    if (!root) return;
    const check = () => { if (root.querySelector("button[disabled]")) window.__d19.busySeen = true; };
    window.__d19obs?.disconnect?.();
    window.__d19obs = new MutationObserver(check);
    window.__d19obs.observe(root, { childList: true, subtree: true, attributes: true });
    check();
};

const READ_BUSY = () => {
    const root = document.querySelector('[data-testid="tool-result"], [data-testid="tool-history-dock"]');
    return { ...window.__d19, disabledNow: root ? root.querySelectorAll("button[disabled]").length : -1 };
};

async function readStores(page) {
    return page.evaluate(async () => {
        const { localForageStorage } = await import("/src/lib/localforage-storage.ts");
        let assets = [];
        for (let i = 0; i < 12 && !assets.length; i += 1) {
            const raw = await localForageStorage.getItem("infinite-canvas:asset_store");
            if (raw) { try { assets = JSON.parse(raw)?.state?.assets || []; } catch { assets = []; } }
            if (!assets.length) await new Promise((r) => setTimeout(r, 250));
        }
        let projects = [];
        for (let i = 0; i < 12 && !projects.length; i += 1) {
            const raw = await localForageStorage.getItem("infinite-canvas:canvas_store");
            if (raw) { try { const l = JSON.parse(raw)?.state?.projects; if (Array.isArray(l)) projects = l; } catch { projects = []; } }
            if (!projects.length) await new Promise((r) => setTimeout(r, 250));
        }
        if (!projects.length) {
            try { const s = await import("/src/stores/canvas/use-canvas-store.ts"); projects = s.useCanvasStore.getState().projects || []; } catch { projects = []; }
        }
        const a = assets[0];
        const p = projects[0];
        const last = p ? (p.nodes || []).slice(-1)[0] : null;
        return {
            assetCount: assets.length,
            lastAsset: a ? { id: a.id, kind: a.kind, bytes: a.data?.bytes, toolId: a.metadata?.toolId } : null,
            projectCount: projects.length,
            lastProject: p ? { id: p.id, nodeCount: (p.nodes || []).length, lastNodeBytes: last?.metadata?.bytes ?? null, lastNodeType: last?.type ?? null } : null,
        };
    });
}

async function readFeedback(page, timeoutMs = 4000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
        const t = await page.evaluate(() => {
            for (const n of document.querySelectorAll('[data-testid$="-feedback"]')) {
                const v = (n.textContent || "").trim();
                if (v) return v;
            }
            return "";
        }).catch(() => "");
        if (t) return t;
        await page.waitForTimeout(200);
    }
    return null;
}

async function clickAction(page, action) {
    const sels = [`[data-testid="tool-result-${action}-0"]`, `[data-testid="tool-history-dock-${action}"]`];
    const tryClick = async (tag) => {
        for (const sel of sels) {
            const loc = page.locator(sel).first();
            if (!(await loc.count())) continue;
            if (!(await loc.isVisible().catch(() => false))) continue;
            await loc.click();
            return tag ? `${sel}*toggled` : sel;
        }
        return null;
    };
    const hit = await tryClick(false);
    if (hit) return hit;
    const toggle = page.locator('[data-testid="tool-history-dock-toggle"]').first();
    if (await toggle.count()) {
        await toggle.click().catch(() => {});
        await page.waitForTimeout(400);
        const hit2 = await tryClick(true);
        if (hit2) return hit2;
    }
    throw new Error(`按钮未找到: ${action}`);
}

async function runTool(browser, tool) {
    const slug = tool.toolId.toLowerCase();
    const record = { toolId: tool.toolId, route: tool.route, steps: {}, ok: false, errors: [] };
    record.sourceBytes = (await fsp.stat(tool.file)).size;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: "zh-CN", acceptDownloads: true });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
    try {
        await page.goto(`${BASE_URL}${tool.route}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1500);
        await page.evaluate(async (payload) => {
            const store = await import("/src/stores/use-tool-task-store.ts");
            store.persistTask(payload);
        }, buildTask(tool, `${ORIGIN}/${tool.toolId}.png`));
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1500);

        if (tool.historyTab) {
            const tab = page.getByRole("button", { name: "历史记录" }).first();
            if (await tab.count()) { await tab.click().catch(() => {}); await page.waitForTimeout(800); }
            else {
                const t2 = page.locator('button:has-text("历史记录"), [role="tab"]:has-text("历史记录")').first();
                if (await t2.count()) { await t2.click().catch(() => {}); await page.waitForTimeout(800); }
            }
        }
        record.steps.dockItems = await page.locator('[data-testid="tool-history-dock-item"]').count();
        const hasResult = (await page.locator('[data-testid="tool-result"]').count()) > 0;
        const hasDock = (await page.locator('[data-testid="tool-history-dock"]').count()) > 0;
        record.steps.surface = hasResult ? "result" : hasDock ? "dock" : "none";
        record.steps.resultImg = await page.evaluate(() => {
            const img = document.querySelector('[data-testid="tool-result"] img, [data-testid="tool-history-dock-result"] img');
            return img ? { src: String(img.currentSrc || img.src).slice(0, 48), w: img.naturalWidth, h: img.naturalHeight } : null;
        });
        record.steps.historyText = await page.evaluate(() => {
            const m = document.body.innerText.match(/历史任务\s*?(\d+)\s*条/);
            return m ? Number(m[1]) : null;
        });

        const before = await readStores(page);
        record.steps.before = before;

        await page.evaluate(OBSERVE);
        const dlP = page.waitForEvent("download", { timeout: 20000 }).catch(() => null);
        record.steps.downloadBtn = await clickAction(page, "download");
        const dlEv = await dlP;
        let dl = null;
        if (dlEv) {
            const tmp = path.join("/tmp", `d19-${slug}-${Date.now()}.png`);
            await dlEv.saveAs(tmp);
            dl = { name: dlEv.suggestedFilename(), bytes: (await fsp.stat(tmp)).size };
            await fsp.unlink(tmp).catch(() => {});
        }
        await page.waitForTimeout(1200);
        record.steps.download = { file: dl, busy: await page.evaluate(READ_BUSY) };

        await page.evaluate(OBSERVE);
        record.steps.saveBtn = await clickAction(page, "save");
        record.steps.saveFeedback = await readFeedback(page);
        const afterSave = await readStores(page);
        record.steps.save = { before: before.assetCount, after: afterSave.assetCount, lastAsset: afterSave.lastAsset, busy: await page.evaluate(READ_BUSY) };

        await page.evaluate(OBSERVE);
        record.steps.canvasBtn = await clickAction(page, "canvas");
        record.steps.canvasFeedback = await readFeedback(page);
        const afterCanvas = await readStores(page);
        record.steps.canvas = { before: before.projectCount, after: afterCanvas.projectCount, lastProject: afterCanvas.lastProject, busy: await page.evaluate(READ_BUSY) };

        record.steps.pageErrors = pageErrors;
        const assetBytes = record.steps.save.lastAsset?.bytes ?? 0;
        const nodeBytes = record.steps.canvas.lastProject?.lastNodeBytes ?? 0;
        record.steps.bytes = { source: record.sourceBytes, download: dl?.bytes ?? 0, asset: assetBytes, node: nodeBytes };
        record.ok = Boolean(
            dl && dl.bytes === record.sourceBytes &&
            record.steps.save.after > record.steps.save.before && assetBytes === record.sourceBytes &&
            record.steps.canvas.after > record.steps.canvas.before && nodeBytes === record.sourceBytes &&
            record.steps.save.lastAsset?.toolId === (tool.taskToolId || tool.toolId) &&
            record.steps.download.busy.disabledNow === 0 && record.steps.save.busy.disabledNow === 0 && record.steps.canvas.busy.disabledNow === 0 &&
            pageErrors.length === 0,
        );
        if (!record.ok) {
            record.errors.push(`assert: dl=${dl?.bytes ?? "-"}/${record.sourceBytes} asset ${record.steps.save.before}->${record.steps.save.after}(${assetBytes}B,tool=${record.steps.save.lastAsset?.toolId ?? "-"}) proj ${record.steps.canvas.before}->${record.steps.canvas.after} node=${nodeBytes}B disabled=${record.steps.download.busy.disabledNow}/${record.steps.save.busy.disabledNow}/${record.steps.canvas.busy.disabledNow} errs=${pageErrors.length}`);
        }
    } catch (e) {
        record.errors.push(String(e?.message || e).slice(0, 400));
        record.steps.tail = await page.evaluate(() => document.body.innerText.slice(-400).replace(/\n+/g, " | ")).catch(() => null);
    } finally {
        await ctx.close().catch(() => {});
    }
    return record;
}

await fsp.mkdir(SERVE, { recursive: true });
for (const t of TOOLS) await fsp.copyFile(t.file, path.join(SERVE, `${t.toolId}.png`));

const server = await startServer();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const dir = path.join(NADIR, "actions");
await fsp.mkdir(dir, { recursive: true });
const results = [];
try {
    const only = (process.env.IC_D19_ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
    const selected = only.length ? TOOLS.filter((t) => only.includes(t.toolId)) : TOOLS;
    for (const tool of selected) {
        const rec = await runTool(browser, tool);
        results.push(rec);
        await fsp.writeFile(path.join(dir, `${tool.toolId}.json`), JSON.stringify({ ...rec, recordedAt: new Date().toISOString() }, null, 2));
        console.log(`${rec.ok ? "PASS" : "FAIL"} ${tool.toolId} ${rec.ok ? JSON.stringify(rec.steps.bytes) : rec.errors.join(" | ")}`);
    }
} finally {
    await browser.close().catch(() => {});
    server.close();
}
const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} PASS`);
