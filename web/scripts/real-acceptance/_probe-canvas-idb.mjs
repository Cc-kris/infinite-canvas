/** 探针：绕过 store 模块实例，直接读 localforage/IndexedDB 里持久化的画布项目。 */
import { chromium } from "playwright";

const BASE = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/canvas`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const r = await page.evaluate(async () => {
    const lf = (await import("/node_modules/.vite/deps/localforage.js")).default;
    lf.config({ name: "infinite-canvas", storeName: "app_state" });
    const raw = await lf.getItem("infinite-canvas:canvas_store");
    const parsed = raw ? JSON.parse(raw) : null;
    const projects = parsed?.state?.projects ?? [];
    return {
        keys: await lf.keys(),
        count: projects.length,
        projects: projects.map((p) => ({ id: p.id, title: p.title, nodes: (p.nodes || []).length, lastBytes: (p.nodes || []).slice(-1)[0]?.metadata?.bytes })),
    };
});
console.log(JSON.stringify(r, null, 2));
await browser.close();
