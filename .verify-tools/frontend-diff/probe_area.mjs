
const { chromium } = await import('/Users/mac/Documents/Dev/infinite-canvas/web/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` });
const page = await browser.newPage({ viewport: { width: 1920, height: 839 } });
const errs=[];
page.on('console', m => { if (m.type()==='error') errs.push(m.text().slice(0,300)); });
page.on('pageerror', e => errs.push('PAGEERROR '+String(e).slice(0,400)));
await page.goto('http://localhost:3000/tools/smart-edit/area-repair', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(2500);
const info = await page.evaluate(() => ({ url: location.href, text: document.body.innerText.slice(0,300), main: !!document.querySelector('main'), html: document.body.innerHTML.length }));
console.log(JSON.stringify({info, errs: errs.slice(0,6)}, null, 1));
await browser.close();
