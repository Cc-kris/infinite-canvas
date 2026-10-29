const { chromium } = require('/Users/mac/Documents/Dev/sub2apis/frontend/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright');
const fs = require('fs'), path = require('path');
const SHOT = '/tmp/ic-accept/shots2'; fs.mkdirSync(SHOT, { recursive: true });
const cfg = fs.readFileSync('/tmp/ic-accept/cfg.json', 'utf8');
const IMG = '/Users/mac/Documents/Dev/infinite-canvas/.worker-real-accept-market/assets/product.jpg';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const readState = (page) => page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const submit = btns.find(b => /开始生成|生成中/.test(b.innerText));
  const section = [...document.querySelectorAll('section, div')].find(d => /A\+ 与营销画幅/.test(d.innerText) && d.querySelectorAll('button').length > 4);
  const tplButtons = section ? [...section.querySelectorAll('button')].slice(0, 12).map(b => ({ text: b.innerText, cls: b.className.includes('bg-primary') ? 'active' : 'plain', disabled: b.disabled })) : [];
  return {
    submitDisabled: submit ? submit.disabled : null,
    submitTitle: submit ? submit.getAttribute('title') : null,
    submitText: submit ? submit.innerText : null,
    expected: (document.body.innerText.match(/预计生成\s*(\d+)\s*屏[^\n]*/) || [])[0] || null,
    tplButtons,
    draft: (() => { try { const raw = localStorage.getItem('tool-draft:v1:PRODUCT_MARKET_MATERIAL'); return raw ? JSON.parse(raw) : null; } catch (e) { return String(e); } })(),
  };
});

(async () => {
  const ctx = await chromium.launchPersistentContext('/tmp/ic-accept/profile2', { headless: true, viewport: { width: 1500, height: 1000 } });
  const page = ctx.pages()[0] || await ctx.newPage();
  const out = {};
  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((c) => localStorage.setItem('infinite-canvas:ai_config_store', c), cfg);
  await page.goto('http://127.0.0.1:3000/tools/product-design/product-market-material', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=开始生成', { timeout: 30000 });
  await sleep(2000);
  out.initial = await readState(page);
  await page.screenshot({ path: path.join(SHOT, 'a-initial.png'), fullPage: true });

  await page.setInputFiles('input[type=file]', IMG);
  await sleep(3000);
  await page.locator('textarea').first().fill('商品：男士机械腕表。卖点：316L不锈钢表壳、蓝宝石镜面、夜光指针、50米防水、日本机芯。材质：不锈钢+真皮表带。尺寸：表径 40mm，表带 20mm。使用场景：商务通勤日常佩戴送礼。');
  await sleep(800);
  out.afterFill = await readState(page);
  await page.screenshot({ path: path.join(SHOT, 'b-filled.png'), fullPage: true });

  // 读数后再决定是否点模板（不盲点）
  const before = out.afterFill.tplButtons.filter(b => b.text.includes('高级A+'))[0];
  out.aplusBefore = before;
  if (before && before.cls !== 'active') {
    await page.locator('button', { hasText: '高级A+' }).first().click();
    await sleep(600);
    out.aplusAfterClick = (await readState(page)).tplButtons.filter(b => b.text.includes('高级A+'))[0];
  } else {
    out.aplusAfterClick = 'skipped(already active)';
  }
  out.final = await readState(page);
  await page.screenshot({ path: path.join(SHOT, 'c-ready.png'), fullPage: true });
  fs.writeFileSync('/tmp/ic-accept/probe.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ initial: out.initial, afterFill: { submitDisabled: out.afterFill.submitDisabled, submitTitle: out.afterFill.submitTitle, expected: out.afterFill.expected }, aplusBefore: out.aplusBefore, aplusAfterClick: out.aplusAfterClick, final: { submitDisabled: out.final.submitDisabled, submitTitle: out.final.submitTitle, expected: out.final.expected } }, null, 2));
  await ctx.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
