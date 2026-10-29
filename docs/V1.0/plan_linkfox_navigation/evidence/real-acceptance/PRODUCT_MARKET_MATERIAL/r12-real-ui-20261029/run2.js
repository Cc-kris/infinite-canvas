const { chromium } = require('/Users/mac/Documents/Dev/sub2apis/frontend/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SHOT = '/tmp/ic-accept/shots2'; fs.mkdirSync(SHOT, { recursive: true });
const OUT = '/tmp/ic-accept/run2.json';
const cfg = fs.readFileSync('/tmp/ic-accept/cfg.json', 'utf8');
const IMG = '/Users/mac/Documents/Dev/infinite-canvas/.worker-real-accept-market/assets/product.jpg';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

(async () => {
  const ctx = await chromium.launchPersistentContext('/tmp/ic-accept/profile2', {
    headless: true, viewport: { width: 1500, height: 1000 }, acceptDownloads: true,
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  const net = [];
  page.on('response', async res => {
    const u = res.url();
    if (/\/images\/(edits|generations)|\/v1\/images|\/images$/.test(u)) {
      try { const t = await res.text(); net.push({ url: u, status: res.status(), body: t.slice(0, 4000) }); }
      catch (e) { net.push({ url: u, status: res.status(), err: String(e).slice(0, 120) }); }
    }
  });
  const downloads = [];
  page.on('download', async d => { downloads.push({ name: d.suggestedFilename() }); await d.saveAs(path.join(SHOT, 'dl-' + d.suggestedFilename())); });

  const out = { startedAt: new Date().toISOString(), steps: {}, aplus: {} };
  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(c => localStorage.setItem('infinite-canvas:ai_config_store', c), cfg);
  await page.goto('http://127.0.0.1:3000/tools/product-design/product-market-material', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=开始生成', { timeout: 30000 });
  await sleep(1200);
  const bodyText = () => page.locator('body').innerText();
  out.steps.before = { history: (await bodyText()).match(/历史任务\s*\n?\s*(\d+)\s*条/)?.[1] || null };
  await page.screenshot({ path: path.join(SHOT, '01-before.png'), fullPage: true });

  // 1) 上传商品图（真实 file input）+ 填文案
  await page.setInputFiles('input[type=file]', IMG);
  await sleep(3000);
  await page.locator('textarea').first().fill(
    '商品：男士机械腕表。卖点：316L不锈钢表壳、蓝宝石镜面、夜光指针、50米防水、日本机芯。材质：不锈钢+真皮表带。尺寸：表径 40mm，表带 20mm。使用场景：商务通勤日常佩戴送礼。');
  await sleep(500);

  // 2) 平台：仅在未选中时点（幂等，不重置其它选择）
  const amazon = page.locator('button', { hasText: '亚马逊' }).first();
  if (await amazon.count()) {
    const cls = (await amazon.getAttribute('class')) || '';
    if (!cls.includes('bg-primary')) await amazon.click();
    out.steps.platform = { clicked: !cls.includes('bg-primary'), cls };
  }
  // 3) A+ 模板：先读真实选中态；为 0 才补选一个（绝不把唯一选中项点掉）
  const aplusState = async () => page.evaluate(() => [...document.querySelectorAll('[data-testid^="market-aplus-template-"]')]
    .map(el => ({ id: el.getAttribute('data-testid'), label: el.innerText.trim(), pressed: el.getAttribute('aria-pressed'), disabled: el.getAttribute('aria-disabled'), title: el.getAttribute('title') })));
  out.aplus.before = await aplusState();
  const activeBefore = (out.aplus.before || []).filter(t => t.pressed === 'true');
  out.aplus.activeCountBefore = activeBefore.length;
  if (!activeBefore.length) {
    const first = page.locator('[data-testid^="market-aplus-template-"]').first();
    await first.click(); await sleep(400);
    out.aplus.clickedToEnsureOne = await first.getAttribute('data-testid');
  }
  // 4) 再点一次已选中的唯一项，验证新兜底：不应被取消（回归证据）
  const sole = (await aplusState()).filter(t => t.pressed === 'true');
  if (sole.length === 1) {
    const btn = page.locator(`[data-testid="${sole[0].id}"]`);
    const before = await btn.getAttribute('aria-pressed');
    await btn.dispatchEvent('click'); await sleep(400);
    const after = await btn.getAttribute('aria-pressed');
    out.aplus.guardCheck = { id: sole[0].id, before, after, stillSelected: after === 'true', hint: (await bodyText()).includes('至少保留一个 A+ 模板') };
  }
  out.aplus.after = await aplusState();

  const submit = page.locator('button', { hasText: '开始生成' }).first();
  out.steps.form = {
    banner: await page.locator('text=/预计生成/').first().innerText().catch(() => ''),
    submitDisabled: await submit.isDisabled(),
    submitTitle: await submit.getAttribute('title'),
    issues: await page.evaluate(() => [...document.querySelectorAll('div')].map(d => d.innerText).filter(t => t && t.length < 200 && /至少|请先|不能|尚未/.test(t)).slice(0, 6)),
  };
  await page.screenshot({ path: path.join(SHOT, '02-form.png'), fullPage: true });
  if (out.steps.form.submitDisabled) {
    out.verdict = 'BLOCKED'; out.blocker = out.steps.form;
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    console.log(JSON.stringify({ verdict: 'BLOCKED', form: out.steps.form, aplus: out.aplus }, null, 2));
    await ctx.close(); return;
  }

  // 5) 真实提交
  const beforeKeys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('tool-task:v1:task-')));
  const t0 = Date.now();
  await submit.click();
  let cards = 0;
  for (let i = 0; i < 180; i++) { // 最多 9 分钟
    await sleep(3000);
    cards = await page.locator('[data-testid^="market-save-"]').count();
    const running = await page.locator('text=/生成中/').count();
    if (i % 10 === 0) log(`poll ${i}: cards=${cards} running=${running}`);
    if (cards > 0 && !running) break;
  }
  out.steps.submit = { ok: cards > 0, cards, elapsedMs: Date.now() - t0 };
  await page.screenshot({ path: path.join(SHOT, '03-result.png'), fullPage: true });

  // 6) 任务回执（localStorage 任务机 + DOM）
  out.tasks = await page.evaluate(bk => Object.keys(localStorage)
    .filter(k => k.startsWith('tool-task:v1:task-') && !bk.includes(k))
    .map(k => { const t = JSON.parse(localStorage.getItem(k));
      return { key: k, id: t.id, toolId: t.toolId, status: t.status, createdAt: t.createdAt, error: t.error || null,
        prompt: (t.prompt || '').slice(0, 80),
        items: ((t.result && t.result.items) || []).map(it => ({ id: it.id, kind: it.kind, mimeType: it.mimeType, url: (it.url || '').slice(0, 80), dataUrlLen: (it.dataUrl || '').length, dropped: !!it.payloadDropped })) };
    }), beforeKeys);
  out.dock = await page.evaluate(() => [...document.querySelectorAll('[data-task-id]')].map(e => ({ id: e.getAttribute('data-task-id'), status: e.getAttribute('data-task-status'), text: e.innerText.slice(0, 100) })).slice(0, 6));
  out.summaryText = (await bodyText()).match(/共\s*\d+\s*屏[^\n]*/)?.[0] || null;

  // 7) 结果图真实字节 + sha256
  const imgInfo = await page.evaluate(async () => {
    const els = [...document.querySelectorAll('article img')];
    const el = els[0]; if (!el) return null;
    const src = el.currentSrc || el.src; let b64 = null, mime = null;
    try { const r = await fetch(src); const b = await r.blob(); mime = b.type; const ab = await b.arrayBuffer();
      let s = ''; const u = new Uint8Array(ab);
      for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
      b64 = btoa(s);
    } catch (e) { return { src: src.slice(0, 80), err: String(e) }; }
    return { src: src.slice(0, 80), w: el.naturalWidth, h: el.naturalHeight, mime, b64 };
  });
  if (imgInfo && imgInfo.b64) {
    const buf = Buffer.from(imgInfo.b64, 'base64');
    fs.writeFileSync(path.join(SHOT, 'result-image.png'), buf);
    out.image = { src: imgInfo.src, w: imgInfo.w, h: imgInfo.h, mime: imgInfo.mime, bytes: buf.length,
      sha256: crypto.createHash('sha256').update(buf).digest('hex'), file: path.join(SHOT, 'result-image.png') };
  } else out.image = imgInfo;

  // 8) 三动作：存入资产库 / 发送画布 / 下载
  const feedback = async () => (await page.evaluate(() => {
    const el = document.querySelector('[data-testid="tool-result-feedback"]') || document.querySelector('[role=status]');
    return el ? el.innerText.slice(0, 160) : '';
  })) || '';
  const saveBtn = page.locator('[data-testid^="market-save-"]').first();
  await saveBtn.click(); await sleep(3000);
  out.steps.save = { label: await saveBtn.innerText(), feedback: await feedback() };
  await page.screenshot({ path: path.join(SHOT, '04-saved.png'), fullPage: true });

  const canvasBtn = page.locator('[data-testid^="market-canvas-"]').first();
  await canvasBtn.click(); await sleep(4000);
  out.steps.canvas = { label: await canvasBtn.innerText(), feedback: await feedback(), canvasNodes: await page.evaluate(() => { try { const s = JSON.parse(localStorage.getItem('infinite-canvas:nodes') || '[]'); return Array.isArray(s) ? s.length : null; } catch (e) { return null; } }) };
  await page.screenshot({ path: path.join(SHOT, '05-canvas.png'), fullPage: true });

  const dlBtn = page.locator('[data-testid^="market-download-"]').first();
  out.steps.download = { present: await dlBtn.count() };
  if (await dlBtn.count()) {
    try {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), dlBtn.click()]);
      const p = path.join(SHOT, 'dl-' + dl.suggestedFilename()); await dl.saveAs(p);
      const b = fs.readFileSync(p);
      out.steps.download.file = p; out.steps.download.bytes = b.length;
      out.steps.download.sha256 = crypto.createHash('sha256').update(b).digest('hex');
      out.steps.download.feedback = await feedback();
    } catch (e) { out.steps.download.error = String(e).slice(0, 200); out.steps.download.feedback = await feedback(); }
  }
  await page.screenshot({ path: path.join(SHOT, '06-actions.png'), fullPage: true });

  // 9) fresh reload：历史 + 结果重建
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(5000);
  const bt = await bodyText();
  out.steps.reload = {
    historyCount: bt.match(/历史任务\s*\n?\s*(\d+)\s*条/)?.[1] || null,
    cards: await page.locator('[data-testid^="market-save-"]').count(),
    imgs: await page.locator('article img').count(),
    summary: bt.match(/共\s*\d+\s*屏[^\n]*/)?.[0] || null,
    dock: await page.evaluate(() => [...document.querySelectorAll('[data-task-id]')].map(e => ({ id: e.getAttribute('data-task-id'), status: e.getAttribute('data-task-status') })).slice(0, 6)),
  };
  await page.screenshot({ path: path.join(SHOT, '07-after-reload.png'), fullPage: true });

  out.network = net.map(n => ({ url: n.url, status: n.status, head: (n.body || '').slice(0, 200) }));
  out.verdict = out.steps.submit.ok ? 'PASS' : 'FAIL';
  out.doneAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ verdict: out.verdict, form: out.steps.form, submit: out.steps.submit,
    tasks: (out.tasks || []).map(t => ({ id: t.id, status: t.status, items: t.items.length })),
    image: out.image && { ...out.image, b64: undefined }, actions: { save: out.steps.save, canvas: out.steps.canvas, download: out.steps.download },
    reload: out.steps.reload, aplusGuard: out.aplus.guardCheck }, null, 2));
  await ctx.close();
})().catch(e => { console.error('FAIL', e); fs.writeFileSync('/tmp/ic-accept/run2.err', String(e)); process.exit(1); });
