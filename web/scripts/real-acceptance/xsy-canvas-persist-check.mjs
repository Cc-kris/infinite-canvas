import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
const OUT = "/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_DRESSING_XSY_20261029_persist";
const ctx = await chromium.launchPersistentContext("/Users/mac/Documents/Dev/infinite-canvas/temp/xsy-profile-20261029", { headless: true, channel: "chrome" });
const page = await ctx.newPage();
const readCanvas = () => page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open("infinite-canvas"); q.onsuccess = () => r(q.result); });
  const raw = await new Promise((r) => { const q = db.transaction("app_state", "readonly").objectStore("app_state").get("infinite-canvas:canvas_store"); q.onsuccess = () => r(q.result); });
  if (!raw) return { count: 0, projects: [] };
  const j = typeof raw === "string" ? JSON.parse(raw) : raw;
  const projects = j.state?.projects ?? [];
  return { count: projects.length, projects: projects.map((p) => ({ id: p.id, title: p.title, nodes: p.nodes?.length, images: (p.nodes || []).filter((n) => n.type === "image").length })) };
});
await page.goto("http://127.0.0.1:3000/tools/product-design/ai-dressing-xsy", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="tool-result-canvas-0"]', { timeout: 40000 });
const before = await readCanvas();
const enabled = await page.isEnabled('[data-testid="tool-result-canvas-0"]');
await page.click('[data-testid="tool-result-canvas-0"]');
let feedback = null;
try {
  await page.waitForFunction(() => /已发送到画布/.test(document.querySelector('[data-testid="tool-result-feedback"]')?.textContent || ""), null, { timeout: 20000 });
  feedback = (await page.textContent('[data-testid="tool-result-feedback"]')).trim();
} catch {}
await page.waitForTimeout(3000);
const afterClick = await readCanvas();
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);
const afterReload = await readCanvas();
const result = { enabledBefore: enabled, feedback, before, afterClick, afterReload };
await writeFile(`${OUT}/canvas-persist-check.json`, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1).slice(0, 1800));
await ctx.close();
