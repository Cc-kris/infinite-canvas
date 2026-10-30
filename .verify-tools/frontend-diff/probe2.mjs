
const { chromium } = await import('/Users/mac/Documents/Dev/infinite-canvas/web/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` });
const page = await browser.newPage({ viewport: { width: 1920, height: 839 } });
const bad=[];
page.on('response', async r => { if (r.status()>=400) bad.push(r.status()+' '+r.url()); });
page.on('pageerror', e => bad.push('PAGEERROR '+String(e).slice(0,200)));
await page.goto('http://localhost:3000/tools/smart-edit/area-repair', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(3000);
console.log(JSON.stringify(bad.slice(0,10),null,1));
const t = await page.evaluate(()=>document.body.innerText.length);
console.log('textlen',t);
await browser.close();
