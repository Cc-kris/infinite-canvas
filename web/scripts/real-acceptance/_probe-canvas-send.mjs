/**
 * 探针：同一浏览器上下文内跑「发画布」，记录 store 状态迁移、localforage 落库、/canvas 真实 UI。
 * 目的：定位 createProject 之后 projects 归零的真实原因（不要凭猜）。
 */
import { chromium } from "playwright";

const BASE = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const tool = process.env.IC_PROBE_TOOL || "SCALE_UP";
const ROUTE = process.env.IC_PROBE_ROUTE || "/tools/ecommerce-suite/scale-up";
const FILE = process.env.IC_PROBE_FILE || "SCALE_UP/02-result.png";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 200)));

await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);

const now = Date.now();
await page.evaluate(
    async ({ task }) => {
        const store = await import("/src/stores/use-tool-task-store.ts");
        store.persistTask(task);
    },
    {
        task: {
            id: `probe-${tool}-task`,
            toolId: tool,
            status: "succeeded",
            clientOperationId: `probe-${tool}-op`,
            fingerprint: `probe-${tool}-fp`,
            capability: "image",
            prompt: "probe",
            configSnapshot: { capability: "image", model: "evidence-reuse", count: 1 },
            sourceAssetIds: [],
            createdAt: now,
            updatedAt: now,
            submittedAt: now,
            finishedAt: now,
            attempts: 1,
            pollCount: 0,
            transientFailures: 0,
            result: { items: [{ id: `probe-${tool}-item`, kind: "image", url: `http://127.0.0.1:8991/${FILE}`, mimeType: "image/png" }], completedAt: now },
        },
    },
);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

// 起真实静态服务提供字节（与 b4 相同的只读服务）
import http from "node:http";
import fsp from "node:fs/promises";
import path from "node:path";
const root = "/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance";
const server = http.createServer(async (req, res) => {
    try {
        const buf = await fsp.readFile(path.join(root, decodeURIComponent(req.url.slice(1))));
        res.writeHead(200, { "content-type": "image/png", "content-length": buf.length, "access-control-allow-origin": "*" }).end(buf);
    } catch {
        res.writeHead(404, { "access-control-allow-origin": "*" }).end("nf");
    }
});
await new Promise((r) => server.listen(8991, "127.0.0.1", r));

await page.locator('[data-testid="tool-history-dock-toggle"]').first().click();
await page.waitForTimeout(300);

// 订阅 store 状态迁移
await page.evaluate(async () => {
    const mod = await import("/src/stores/canvas/use-canvas-store.ts");
    const s = mod.useCanvasStore;
    window.__probe = { hydratedAtStart: s.persist.hasHydrated(), log: [] };
    const snap = (tag) => window.__probe.log.push({ tag, hydrated: s.persist.hasHydrated(), n: s.getState().projects.length, t: Date.now() });
    snap("subscribe-start");
    s.subscribe((st, prev) => {
        if (st.projects !== prev.projects) window.__probe.log.push({ tag: "projects-changed", n: st.projects.length, titles: st.projects.map((p) => p.title), t: Date.now() });
    });
    s.persist.onFinishHydration(() => snap("finished-hydration"));
});

await page.locator('[data-testid="tool-history-dock-canvas"]').first().click();
await page.waitForTimeout(2500);

const state = await page.evaluate(async () => {
    const mod = await import("/src/stores/canvas/use-canvas-store.ts");
    const s = mod.useCanvasStore;
    const lfMod = await import("/src/lib/localforage-storage.ts");
    const raw = await lfMod.localForageStorage.getItem("infinite-canvas:canvas_store");
    const parsed = raw ? JSON.parse(raw) : null;
    return {
        probe: window.__probe,
        now: { hydrated: s.persist.hasHydrated(), n: s.getState().projects.length, titles: s.getState().projects.map((p) => p.title) },
        idb: { exists: !!parsed, n: parsed?.state?.projects?.length ?? 0 },
        feedback: Array.from(document.querySelectorAll('[data-testid*="feedback"], [role="status"], .ant-message'))
            .map((n) => n.textContent?.trim())
            .filter(Boolean)
            .slice(0, 5),
    };
});

await page.goto(`${BASE}/canvas`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const canvasUi = await page.evaluate(() => ({ text: document.body.innerText.slice(0, 500) }));

console.log(JSON.stringify({ state, canvasUi }, null, 2));
await browser.close();
server.close();
