const { chromium } = await import('/Users/mac/Documents/Dev/infinite-canvas/web/node_modules/playwright/index.mjs');
const b = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` });
const p = await b.newPage({ viewport: { width: 1920, height: 839 } });
let errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
p.on('pageerror', e => errs.push('PAGEERROR ' + String(e).slice(0, 200)));
for (const u of ['/tools/smart-edit/hand-repair', '/tools/smart-edit/printing-repair']) {
  errs = [];
  await p.goto('http://localhost:3000' + u, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => errs.push('GOTO ' + e.message));
  await p.waitForTimeout(2500);
  const len = await p.evaluate(() => document.body.innerText.length);
  console.log(u, 'len', len, JSON.stringify(errs.slice(0, 3)));
}
await b.close();
