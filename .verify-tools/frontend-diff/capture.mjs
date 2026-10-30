// playwright 只装在 web/node_modules，本脚本在 web 之外，必须绝对路径导入（ESM 不走 NODE_PATH）
const { chromium } = await import('/Users/mac/Documents/Dev/infinite-canvas/web/node_modules/playwright/index.mjs');
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const ROUTES = JSON.parse(fs.readFileSync(path.join(DIR, 'routes.json'), 'utf8'));
const OUT = path.join(DIR, 'local-dom');
fs.mkdirSync(OUT, { recursive: true });

const BASE = process.env.BASE || 'http://localhost:3000';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
});
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();

const results = [];
for (const [i, r] of ROUTES.entries()) {
  const rec = { id: r.id, route: r.route, ok: false, error: null, title: '', text: '', lines: [], controls: [], regions: [] };
  try {
    await page.goto(BASE + r.route, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    const data = await page.evaluate(() => {
      const vis = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false;
        return true;
      };
      const controls = [];
      const sel = 'button, input, textarea, select, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="combobox"]';
      for (const el of document.querySelectorAll(sel)) {
        if (!vis(el)) continue;
        const rect = el.getBoundingClientRect();
        const t = (el.innerText || el.value || el.getAttribute('placeholder') || '').trim().slice(0, 120);
        const ph = el.getAttribute('placeholder') || '';
        if (!t && !ph) continue;
        controls.push({
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') || '',
          text: t,
          placeholder: ph,
          disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        });
      }
      const lines = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const t = (n.nodeValue || '').trim();
        if (!t) continue;
        const p = n.parentElement;
        if (!p || !vis(p)) continue;
        lines.push(t.slice(0, 200));
      }
      const regions = [];
      for (const el of document.querySelectorAll('main, section, aside, header, footer')) {
        if (!vis(el)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 60 || rect.height < 30) continue;
        regions.push({
          cls: (el.className && String(el.className).slice(0, 80)) || el.tagName.toLowerCase(),
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
          text: (el.innerText || '').slice(0, 300),
        });
      }
      return { title: document.title, lines, controls, regions };
    });
    rec.ok = true;
    rec.title = data.title;
    rec.lines = data.lines;
    rec.text = data.lines.join('\n');
    rec.controls = data.controls;
    rec.regions = data.regions.slice(0, 40);
  } catch (e) {
    rec.error = String(e).slice(0, 300);
  }
  fs.writeFileSync(path.join(OUT, r.id + '.json'), JSON.stringify(rec, null, 1));
  results.push({ id: r.id, ok: rec.ok, lines: rec.lines.length, controls: rec.controls.length, error: rec.error });
  console.log(`[${i + 1}/${ROUTES.length}] ${r.id} ok=${rec.ok} lines=${rec.lines.length} controls=${rec.controls.length}${rec.error ? ' ERR=' + rec.error.slice(0, 80) : ''}`);
}

await browser.close();
fs.writeFileSync(path.join(DIR, 'capture-summary.json'), JSON.stringify(results, null, 1));
console.log('DONE');
