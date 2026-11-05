/** 探针：验证 canvas store 在首次懒加载时 rehydrate 会把刚 createProject 的项目覆盖掉（竞态）。 */
import { chromium } from "playwright";

const BASE = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/tools/ecommerce-suite/scale-up`, { waitUntil: "networkidle" });
const r = await page.evaluate(async () => {
    const mod = await import("/src/stores/canvas/use-canvas-store.ts");
    const store = mod.useCanvasStore;
    const before = { hydrated: store.persist.hasHydrated(), projects: store.getState().projects.length };
    const id = store.getState().createProject("PROBE 竞态探针");
    const immediate = { id, found: !!store.getState().projects.find((p) => p.id === id), projects: store.getState().projects.length };
    await new Promise((res) => setTimeout(res, 1500));
    const after = {
        hydrated: store.persist.hasHydrated(),
        found: !!store.getState().projects.find((p) => p.id === id),
        projects: store.getState().projects.map((p) => p.title),
    };
    return { before, immediate, after };
});
console.log(JSON.stringify(r, null, 2));
await browser.close();
