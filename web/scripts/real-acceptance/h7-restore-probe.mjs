/**
 * H7｜7 工具「真实历史恢复」现状取证（只读：不生成、不注入）
 *
 * 在全新临时 profile 里真实加载 7 个工具页，等页面稳定后记录：
 *  - 历史坞 / 历史记录 tab 是否挂载、条目数、空态文案
 *  - localStorage 中该 toolId 的真实任务条数
 * 并对 docs 归档的真实结果图做字节级校验（sha256 / 尺寸）。
 *
 * 用法（在 web/ 下）：node scripts/real-acceptance/h7-restore-probe.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const BASE = process.env.H7_BASE ?? "http://127.0.0.1:3000";
const REPO = path.resolve(process.cwd(), "..");
const EVID = path.join(REPO, "docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/H-restore-7tools-20261029");
fs.mkdirSync(EVID, { recursive: true });

const TOOLS = [
  { id: "NEW_REPLACE_BG_V2", slug: "new-replace-bg-v2" },
  { id: "REPLACE_GOODS", slug: "replace-goods" },
  { id: "PRODUCT_SCENE", slug: "product-scene" },
  { id: "HANDHELD_GOODS", slug: "handheld-goods" },
  { id: "AI_DRESSING_V2", slug: "ai-dressing-v2" },
  { id: "AI_POSTURE", slug: "ai-posture" },
  { id: "AI_WEARABLE", slug: "ai-wearable" },
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const results = [];

for (const t of TOOLS) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(`${BASE}/tools/product-design/${t.slug}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4500);
  const snap = await page.evaluate((toolId) => {
    const dock = document.querySelector('[data-testid="tool-history-dock"]');
    const bodyText = document.body.innerText.replace(/\s+/g, " ");
    const idx = JSON.parse(localStorage.getItem("tool-task:v1:index") || "[]");
    const mine = idx.filter((id) => {
      try {
        const task = JSON.parse(localStorage.getItem("tool-task:v1:" + id) || "null");
        return task && task.toolId === toolId;
      } catch {
        return false;
      }
    });
    return {
      url: location.pathname,
      workspaceMounted: !!document.querySelector('[data-testid="tool-workspace"]'),
      dockMounted: !!dock,
      dockItemCount: dock ? dock.querySelectorAll('[data-testid="tool-history-dock-item"]').length : null,
      dockCountText: dock?.querySelector('[data-testid="tool-history-dock-count"]')?.textContent?.trim() ?? null,
      dockEmptyHint: dock?.querySelector('[data-testid="tool-history-dock-empty"]')?.textContent?.trim() ?? null,
      ownHistoryTab: bodyText.includes("历史记录"),
      myPersistedTasks: mine.length,
      totalPersistedTasks: idx.length,
    };
  }, t.id);
  results.push({ tool: t.id, ...snap, pageErrors: errors.slice(0, 3) });
  console.log(t.id, JSON.stringify(snap));
  await page.close();
}
await browser.close();

// 归档真实结果图（真实 provider 输出字节）校验
const archive = [];
for (const t of TOOLS) {
  const dir = path.join(REPO, "docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance", t.id);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((n) => /result.*\.png$/i.test(n))) {
    const p = path.join(dir, f);
    const buf = fs.readFileSync(p);
    archive.push({
      tool: t.id,
      file: path.relative(REPO, p),
      bytes: buf.length,
      sha256: crypto.createHash("sha256").update(buf).digest("hex"),
      png: { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) },
    });
  }
}

const out = {
  capturedAt: new Date().toISOString(),
  method: "playwright chromium.launch(channel=chrome, headless) 全新临时 profile；只读 DOM / localStorage / 归档文件字节，不生成、不注入",
  base: BASE,
  results,
  archiveRealResults: archive,
  note: "myPersistedTasks=0 表示该工具在此 profile 无真实任务；不代表页面缺陷。历史坞挂载 = 恢复入口可用。",
};
fs.writeFileSync(path.join(EVID, "h7-freshload-probe.json"), JSON.stringify(out, null, 2));
console.log("WROTE", path.join(EVID, "h7-freshload-probe.json"));
