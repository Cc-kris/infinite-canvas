import fs from 'node:fs';
import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname);
const { chromium } = await import('/Users/mac/Documents/Dev/infinite-canvas/web/node_modules/playwright/index.mjs');
const CODE = fs.readFileSync('/Users/mac/Documents/Dev/infinite-canvas/capture_page.js', 'utf8');
const ROUTES = JSON.parse(fs.readFileSync(path.join(DIR, 'routes.json'), 'utf8')).filter(r =>
  ['REPLACE_GOODS','AREA_REPAIR','HAND_REPAIR','PRINTING_REPAIR','FIX_COLOR','HANDHELD_GOODS','PRODUCT_SCENE','SDS_DESIGN','SCENE_TRANSFER'].includes(r.id));
const OUT = path.join(DIR, 'local-dom2');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:3000';
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
});
const page = await browser.newPage({ viewport: { width: 1920, height: 839 } });
for (const [i, r] of ROUTES.entries()) {
  let rec = { ok: false };
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.goto(BASE + r.route, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2600);
      rec = await page.evaluate(CODE);
      if (rec && Array.isArray(rec.textEls) && rec.textEls.length >= 5) break;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      rec = await page.evaluate(CODE);
      if (rec && Array.isArray(rec.textEls) && rec.textEls.length >= 5) break;
    }
    rec.ok = true;
  } catch (e) { rec.error = String(e).slice(0, 300); }
  fs.writeFileSync(path.join(OUT, r.id + '.json'), JSON.stringify(rec, null, 1));
  console.log(`[${i + 1}/${ROUTES.length}] ${r.id} ok=${rec.ok} els=${rec.textEls ? rec.textEls.length : 0}`);
}
await browser.close();
console.log('DONE');
