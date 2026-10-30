import fs from 'node:fs';
import path from 'node:path';

// capture2 的健壮版：页面空白（body.innerText 为空）时重载重试，最多 3 次
const DIR = path.dirname(new URL(import.meta.url).pathname);
const { chromium } = await import('/Users/mac/Documents/Dev/infinite-canvas/web/node_modules/playwright/index.mjs');
const CODE = fs.readFileSync('/Users/mac/Documents/Dev/infinite-canvas/capture_page.js', 'utf8');
const ROUTES = JSON.parse(fs.readFileSync(path.join(DIR, 'routes.json'), 'utf8'));
const OUT = path.join(DIR, 'local-dom2');
fs.mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3000';
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
});
const page = await browser.newPage({ viewport: { width: 1920, height: 839 } });
let broken = [];

for (const [i, r] of ROUTES.entries()) {
  let rec = { ok: false };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(BASE + r.route, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1600 + attempt * 1500);
      rec = await page.evaluate(CODE);
      rec.ok = true;
      if ((rec.text || '').trim().length > 0 && (rec.textEls || []).length > 0) break;
      rec.ok = false;
      rec.error = 'blank-render';
    } catch (e) {
      rec = { ok: false, error: String(e).slice(0, 200) };
    }
  }
  if (!rec.ok) broken.push(r.id);
  fs.writeFileSync(path.join(OUT, r.id + '.json'), JSON.stringify(rec, null, 1));
  console.log(`[${i + 1}/${ROUTES.length}] ${r.id} ok=${rec.ok} els=${rec.textEls ? rec.textEls.length : 0}`);
}
await browser.close();
console.log(broken.length ? `BROKEN ${broken.length}: ${broken.join(',')}` : 'ALL_OK');
