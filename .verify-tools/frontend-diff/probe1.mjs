const { chromium } = await import('/Users/mac/Documents/Dev/infinite-canvas/web/node_modules/playwright/index.mjs');
const b = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` });
const p = await b.newPage({ viewport: { width: 1920, height: 839 } });
await p.goto('http://localhost:3000/tools/ai-video/video-replication', { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
const r = await p.evaluate(() => ({
  has250: document.body.innerText.includes('250'),
  hasDriver: document.body.innerText.includes('ljq_driver'),
  radios: document.querySelectorAll('[role="radiogroup"][aria-label="销售国家/地区"]').length,
  selects: document.querySelectorAll('select').length,
  navHtml: (document.querySelector('[data-testid="ai-video-family-nav"]') || {}).outerHTML?.slice(0, 1500) || 'NO NAV',
  paramsHtml: (document.querySelector('[data-testid="video-replication-params"]') || {}).outerHTML?.slice(0, 400) || 'NO PARAMS',
}));
console.log(JSON.stringify(r, null, 1));
await b.close();
