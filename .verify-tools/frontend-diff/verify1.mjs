import fs from 'node:fs';
import path from 'node:path';

// 用法: node verify1.mjs MATERIAL_UPPER_BODY [OTHER_TOOL ...]
const DIR = path.dirname(new URL(import.meta.url).pathname);
const { chromium } = await import('/Users/mac/Documents/Dev/infinite-canvas/web/node_modules/playwright/index.mjs');
const CODE = fs.readFileSync('/Users/mac/Documents/Dev/infinite-canvas/capture_page.js', 'utf8');
const ROUTES = JSON.parse(fs.readFileSync(path.join(DIR, 'routes.json'), 'utf8'));
const OUT = path.join(DIR, 'local-dom2');
fs.mkdirSync(OUT, { recursive: true });

const want = process.argv.slice(2).map((s) => s.toUpperCase());
const list = want.length ? ROUTES.filter((r) => want.includes(r.id.toUpperCase())) : ROUTES;
if (!list.length) { console.error('no matching tool id'); process.exit(2); }

const BASE = 'http://localhost:3000';
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
});
const page = await browser.newPage({ viewport: { width: 1920, height: 839 } });
for (const r of list) {
  let rec = { ok: false };
  try {
    await page.goto(BASE + r.route, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1400);
    rec = await page.evaluate(CODE);
    rec.ok = true;
  } catch (e) { rec.error = String(e).slice(0, 300); }
  fs.writeFileSync(path.join(OUT, r.id + '.json'), JSON.stringify(rec, null, 1));
  console.log(`${r.id} ok=${rec.ok} els=${rec.textEls ? rec.textEls.length : 0}`);
}
await browser.close();
