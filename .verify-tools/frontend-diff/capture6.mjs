import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const { chromium } = await import('/Users/mac/Documents/Dev/infinite-canvas/web/node_modules/playwright/index.mjs');
const CODE = fs.readFileSync('/Users/mac/Documents/Dev/infinite-canvas/capture_page.js', 'utf8');
const ROUTES = JSON.parse(fs.readFileSync(path.join(DIR, 'routes.json'), 'utf8'));
const IDS = ['CHANGE_COLOR', 'IMAGE_CROP', 'PRODUCT_REFINE', 'SCALE_UP', 'REMOVE_PEN', 'AI_OUTPAINTING'];
const OUT = path.join(DIR, 'local-dom6');
fs.mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3000';
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
});
const page = await browser.newPage({ viewport: { width: 1920, height: 839 } });

for (const id of IDS) {
  const r = ROUTES.find((x) => x.id === id);
  let rec = { ok: false };
  try {
    await page.goto(BASE + r.route, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1600);
    rec = await page.evaluate(CODE);
    rec.ok = true;
  } catch (e) {
    rec.error = String(e).slice(0, 300);
  }
  fs.writeFileSync(path.join(OUT, id + '.json'), JSON.stringify(rec, null, 1));
  console.log(`${id} ok=${rec.ok} els=${rec.textEls ? rec.textEls.length : 0}`);
}
await browser.close();
console.log('DONE');
