// 用 Playwright 真视口截图：本地 6 宽 × 浅/暗 + 原站 6 宽
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const path0 = require('path');
const EVID = process.env.EVID || path0.resolve(__dirname, '..', 'evidence', 'b12-shell-responsive-20261029');
const LOCAL = process.env.LOCAL_URL || 'http://127.0.0.1:3000/tools/ecommerce-suite/ai-outpainting';
const REAL = process.env.REAL_URL || 'https://www.linkfox.com/draw/ai-outpainting';
const WIDTHS = [1908, 1440, 1280, 1024, 768, 390];

// 读 JPEG 宽高
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return null;
}

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const rows = [];
  const md5 = (b) => crypto.createHash('md5').update(b).digest('hex').slice(0, 12);

  async function capture(ctxOpts, url, sub, theme, label) {
    const ctx = await browser.newContext({ viewport: { width: ctxOpts.width, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    if (theme === 'dark') {
      await page.addInitScript(() => {
        localStorage.setItem('infinite-canvas:theme_store', JSON.stringify({ state: { theme: 'dark' }, version: 0 }));
      });
    }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => ({
      iw: window.innerWidth,
      sw: document.documentElement.scrollWidth,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      headerH: (document.querySelector('header') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height,
    }));
    const outDir = path.join(EVID, sub, String(ctxOpts.width));
    fs.mkdirSync(outDir, { recursive: true });
    const buf = await page.screenshot({ type: 'jpeg', quality: 82, fullPage: false });
    fs.writeFileSync(path.join(outDir, 'shot.jpg'), buf);
    const dim = jpegSize(buf);
    rows.push({
      side: label, width: ctxOpts.width, theme,
      innerWidth: info.iw, scrollWidth: info.sw, overflowX: info.sw > info.iw,
      headerH: Math.round(info.headerH), bodyBg: info.bodyBg,
      bytes: buf.length, md5: md5(buf), px: dim ? dim.w + 'x' + dim.h : null,
      pxOk: !!dim && dim.w === ctxOpts.width && dim.h === 900,
    });
    await ctx.close();
  }

  for (const w of WIDTHS) {
    await capture({ width: w }, LOCAL, 'local', 'light', 'local');
    await capture({ width: w }, LOCAL, 'local-dark', 'dark', 'local-dark');
    await capture({ width: w }, REAL, 'real', 'light', 'real');
  }
  await browser.close();

  rows.sort((a, b) => a.side.localeCompare(b.side) || b.width - a.width);
  for (const r of rows) {
    console.log(`${r.side.padEnd(10)} ${String(r.width).padStart(4)} iw=${r.innerWidth} sw=${r.scrollWidth} ovf=${r.overflowX ? 'YES' : 'no '} hdrH=${r.headerH} px=${r.px} pxOk=${r.pxOk} md5=${r.md5} bytes=${r.bytes} bg=${r.bodyBg}`);
  }
  const ok = rows.filter((r) => r.pxOk);
  console.log('unique md5:', new Set(ok.map((r) => r.md5)).size, '/', ok.length);
  fs.writeFileSync(path.join(EVID, 'shots-verify.json'), JSON.stringify(rows, null, 1));
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
