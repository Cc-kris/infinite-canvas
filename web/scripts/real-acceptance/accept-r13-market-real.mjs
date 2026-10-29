/**
 * R13：PRODUCT_MARKET_MATERIAL 真实 UI 生成验收（ff621c3 后）。
 *
 * 真实链路（无注入结果/状态、无 mock）：
 *   UI 上传仓库内合法商品图 → 填商品信息 → 保持 A+ 模板（守护回归）→ 点「开始生成」
 *   → canvas-proxy 127.0.0.1:23210 → 上游 /v1/images/* 真实返回
 *   → 任务落 localStorage(tool-task:v1:*) + 结果字节落 IDB media_files
 *   → 结果卡三动作（存入资产库 / 发送画布 / 下载）→ fresh reload 历史行 + 结果面板重建
 *
 * 用法: node accept-r13-market-real.mjs [--screens 1]
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { applyProviderConfig } from "./provider.mjs";

const BASE = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const ROUTE = "/tools/product-design/product-market-material";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(SCRIPT_DIR, "fixtures", "product-watch.jpg");
const OUT = path.resolve(SCRIPT_DIR, "../../../docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/PRODUCT_MARKET_MATERIAL/r13-real-ui-20261029");
fs.mkdirSync(OUT, { recursive: true });

const argOf = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback; };
const SCREENS = Number(argOf("--screens", "1"));
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const PAGE_HELPERS = `
  window.__icReadBlob = async (storageKey) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open("infinite-canvas"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const stores = [...db.objectStoreNames];
    for (const name of stores) {
      const v = await new Promise((res) => { try { const tx = db.transaction(name, "readonly"); const rq = tx.objectStore(name).get(storageKey); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(undefined); } catch { res(undefined); } });
      if (v instanceof Blob) {
        const buf = new Uint8Array(await v.arrayBuffer());
        let bin = ""; const CH = 0x8000;
        for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
        db.close();
        return { mime: v.type, size: v.size, b64: btoa(bin), store: name };
      }
    }
    db.close();
    return null;
  };
  window.__icCounts = async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open("infinite-canvas"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const getApp = async (key) => {
      if (![...db.objectStoreNames].includes("app_state")) return null;
      const raw = await new Promise((res) => { const rq = db.transaction("app_state", "readonly").objectStore("app_state").get(key); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); });
      try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
    };
    const assetParsed = await getApp("infinite-canvas:asset_store");
    const assets = assetParsed?.state?.assets ?? assetParsed?.assets ?? [];
    const canvasParsed = await getApp("infinite-canvas:canvas_store");
    const projects = canvasParsed?.state?.projects ?? [];
    db.close();
    const tasks = Object.keys(localStorage).filter((k) => k.startsWith("tool-task:v1:task-"));
    return { assetCount: assets.length, assetTitles: assets.slice(-3).map((a) => a.title), projectCount: projects.length, nodeCount: projects.reduce((n, p) => n + (p.nodes?.length ?? 0), 0), taskCount: tasks.length };
  };
`;

const receipt = { tool: "PRODUCT_MARKET_MATERIAL", route: ROUTE, base: BASE, startedAt: new Date().toISOString(), steps: {}, errors: [], upstream: [], aplus: {}, tasks: [], pageText: null, screenshots: [] };
const snap = async (page, name) => { const p = path.join(OUT, name); await page.screenshot({ path: p, fullPage: true }); receipt.screenshots.push(p); return p; };
const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));

const PROFILE = path.join(SCRIPT_DIR, "../../../.tmp_r13/profile-r13");
fs.mkdirSync(PROFILE, { recursive: true });
let context, page;
try {
  context = await chromium.launchPersistentContext(PROFILE, { channel: "chrome", headless: true, viewport: { width: 1600, height: 1150 }, locale: "zh-CN", acceptDownloads: true });
  page = context.pages()[0] || await context.newPage();
  page.on("pageerror", (e) => receipt.errors.push(`pageerror: ${String(e).slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error" && !/github|23210|ERR_BLOCKED/.test(m.text())) receipt.errors.push(`console: ${m.text().slice(0, 200)}`); });
  page.on("request", (req) => {
    if (req.method() !== "POST") return;
    if (!/\/v1\/images\/(generations|edits)/.test(req.url())) return;
    let body = null; try { body = JSON.parse(req.postData() || "{}"); } catch { body = null; }
    receipt.upstream.push({ at: new Date().toISOString(), dir: "req", url: req.url(), model: body?.model ?? null, size: body?.size ?? null, n: body?.n ?? null, refs: Array.isArray(body?.image) ? body.image.length : undefined, prompt: typeof body?.prompt === "string" ? body.prompt.slice(0, 400) : null });
  });
  page.on("response", async (res) => {
    if (!/\/v1\/images\/(generations|edits)/.test(res.url())) return;
    if (res.request().method() !== "POST") return;
    const rec = { at: new Date().toISOString(), dir: "res", url: res.url(), status: res.status(), requestId: res.headers()["x-request-id"] || res.headers()["request-id"] || null, contentType: res.headers()["content-type"] || null };
    try { const j = await res.json(); rec.body = { keys: Object.keys(j), created: j.created ?? null, data: Array.isArray(j.data) ? j.data.map((d) => ({ url: (d.url || "").slice(0, 80), b64Len: (d.b64_json || "").length, revisedPrompt: (d.revised_prompt || "").slice(0, 80) })) : undefined, error: j.error ?? undefined }; }
    catch { try { rec.bodyText = (await res.text()).slice(0, 300); } catch { rec.bodyText = null; } }
    receipt.upstream.push(rec);
  });

  // 0) provider 配置（与用户在设置页手填等价；不触碰任务/结果数据）
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const provider = await applyProviderConfig(page);
  receipt.provider = { imageModel: provider.imageModel, channels: provider.channels, baseUrl: provider.baseUrl, proxyEnabled: provider.proxyEnabled, keyLen: provider.keyLen };
  await page.addInitScript(PAGE_HELPERS);
  await page.evaluate(PAGE_HELPERS);

  // 1) 进入工具页
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!document.querySelector("textarea"), { timeout: 45000 });
  await page.waitForTimeout(1500);
  const submitBtn = page.locator("button", { hasText: /^开始生成$/ }).first();
  await snap(page, "01-before.png");
  receipt.steps.initial = {
    history: /历史任务\s*(\d+)\s*条/.exec(await bodyText(page))?.[1] ?? null,
    submitDisabled: await submitBtn.isDisabled(),
    issues: await page.evaluate(() => [...document.querySelectorAll("div")].map((d) => d.innerText).filter((t) => t && t.length < 120 && /至少|请先|不能|尚未/.test(t)).slice(0, 5)),
  };

  // 2) 真实上传合法商品图（<input type=file>）
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(FIXTURE);
  await page.waitForFunction(() => !/0 \/ 6 个/.test(document.body.innerText), { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  receipt.steps.upload = {
    fixture: FIXTURE,
    fixtureBytes: fs.statSync(FIXTURE).size,
    fixtureSha256: sha256(fs.readFileSync(FIXTURE)),
    countText: (await bodyText(page)).match(/\d \/ 6 个/)?.[0] ?? null,
    hints: await page.evaluate(() => [...document.querySelectorAll("div,p,span")].map((d) => d.innerText).filter((t) => t && t.length < 80 && /入库|上传中|读取/.test(t)).slice(0, 4)),
  };
  await snap(page, "02-uploaded.png");

  // 3) 填商品信息（卖点/材质/场景）
  const ta = page.locator("textarea").first();
  const PRODUCT_INFO = "商品：男士机械腕表。卖点：316L 不锈钢表壳、蓝宝石镜面、夜光指针、50 米防水、日本机芯。材质：不锈钢 + 真皮表带。尺寸：表径 40mm、表带 20mm。使用场景：商务通勤、日常佩戴、送礼。";
  await ta.fill(PRODUCT_INFO);
  await page.waitForTimeout(600);

  // 4) 屏数设为 1（UI 控件合法配置），分辨率 1K 降时延
  const numInput = page.locator('input[type="number"]').first();
  await numInput.fill(String(SCREENS));
  await numInput.dispatchEvent("input");
  await numInput.dispatchEvent("change");
  await page.waitForTimeout(400);
  const res1k = page.locator("button", { hasText: /^1K$/ }).first();
  if (await res1k.count()) { await res1k.click(); await page.waitForTimeout(300); }

  // 5) A+ 模板守护回归：对「唯一选中项」做真实点击，应保持选中
  const aplusState = () => page.evaluate(() => [...document.querySelectorAll('[data-testid^="market-aplus-template-"]')].map((el) => ({ id: el.getAttribute("data-testid"), pressed: el.getAttribute("aria-pressed"), ariaDisabled: el.getAttribute("aria-disabled"), title: el.getAttribute("title") })));
  receipt.aplus.before = await aplusState();
  const active = (receipt.aplus.before || []).filter((t) => t.pressed === "true");
  receipt.aplus.activeCountBefore = active.length;
  if (active.length === 1) {
    const btn = page.locator(`[data-testid="${active[0].id}"]`);
    await btn.click({ force: true });
    await page.waitForTimeout(500);
    const after = await aplusState();
    const same = after.find((t) => t.id === active[0].id);
    receipt.aplus.guardClick = {
      id: active[0].id,
      pressedAfterClick: same?.pressed,
      stillSelected: same?.pressed === "true",
      ariaDisabled: same?.ariaDisabled,
      hint: (await bodyText(page)).includes("至少保留一个 A+ 模板"),
    };
  } else {
    receipt.aplus.guardClick = { skipped: true, reason: `active=${active.length}` };
  }

  // 6) 提交前状态：横幅 + 按钮可用性 + 校验区
  const preflight = async () => ({
    banner: await page.evaluate(() => [...document.querySelectorAll("p")].map((p) => p.innerText).find((t) => t && t.includes("预计生成")) ?? null),
    submitDisabled: await submitBtn.isDisabled(),
    issues: await page.evaluate(() => [...document.querySelectorAll("div")].map((d) => d.innerText).filter((t) => t && t.length < 120 && /至少|请先|不能|尚未|失败/.test(t)).slice(0, 5)),
    count: await numInput.inputValue().catch(() => null),
  });
  receipt.steps.prepared = await preflight();
  await snap(page, "03-ready.png");
  if (receipt.steps.prepared.submitDisabled) throw new Error(`提交按钮禁用（真实阻断）：${JSON.stringify(receipt.steps.prepared)}`);

  // 7) 真实点击提交
  const taskKeysBefore = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("tool-task:v1:task-")));
  const submittedAt = Date.now();
  await submitBtn.click();
  receipt.submittedAt = new Date().toISOString();
  await page.waitForTimeout(3000);
  await snap(page, "04-submitted.png");

  // 8) 轮询结果卡（真实 UI），最多 12 分钟
  let cards = 0;
  let lastSummary = null;
  for (let i = 0; i < 240; i += 1) {
    const state = await page.evaluate(() => ({
      cards: document.querySelectorAll('[data-testid^="market-save-"]').length,
      running: /生成中|提交中/.test(document.body.innerText),
      err: [...document.querySelectorAll("div")].map((d) => d.innerText).filter((t) => t && t.length < 200 && /屏失败|失败：|上游|超时|错误/.test(t)).slice(0, 3),
      summary: (/共\s*\d+\s*屏[^\n]*/.exec(document.body.innerText) || [])[0] || null,
    }));
    cards = state.cards; lastSummary = state.summary;
    if (i % 5 === 0) console.log(`[poll ${i}] cards=${cards} running=${state.running} err=${JSON.stringify(state.err)}`);
    if (cards > 0 && !state.running) break;
    if (cards === 0 && !state.running && i > 3) { receipt.steps.failedRun = { err: state.err, text: (await bodyText(page)).slice(0, 1200) }; break; }
    await page.waitForTimeout(3000);
  }
  receipt.steps.submit = { ok: cards > 0, cards, summary: lastSummary, elapsedMs: Date.now() - submittedAt };
  await snap(page, "05-result.png");
  if (cards === 0) throw new Error(`提交后无结果卡：${JSON.stringify(receipt.steps.failedRun ?? {})}`);

  // 9) 任务回执（taskId / 状态 / 结果项）
  receipt.tasks = await page.evaluate((before) => Object.keys(localStorage)
    .filter((k) => k.startsWith("tool-task:v1:task-") && !before.includes(k))
    .map((k) => {
      const t = JSON.parse(localStorage.getItem(k));
      return {
        key: k, id: t.id, toolId: t.toolId, status: t.status, createdAt: t.createdAt, finishedAt: t.finishedAt ?? null,
        error: t.error ?? null, model: t.model ?? null, provider: t.provider ?? null,
        prompt: (t.prompt || "").slice(0, 150),
        meta: t.meta ?? t.metadata ?? null,
        items: ((t.result && t.result.items) || []).map((it) => ({ id: it.id, kind: it.kind, mimeType: it.mimeType ?? null, storageKey: it.storageKey ?? null, url: (it.url || "").slice(0, 100), dataUrlLen: (it.dataUrl || "").length, dropped: !!it.payloadDropped, width: it.width ?? null, height: it.height ?? null })),
      };
    }), taskKeysBefore);

  // 10) 真实字节：IDB 取 Blob → size/mime/sha
  const storedBytes = [];
  for (const task of receipt.tasks) {
    for (const item of task.items || []) {
      if (!item.storageKey) continue;
      const blob = await page.evaluate((key) => window.__icReadBlob(key), item.storageKey);
      if (!blob) { storedBytes.push({ taskId: task.id, itemId: item.id, storageKey: item.storageKey, found: false }); continue; }
      const buf = Buffer.from(blob.b64, "base64");
      const file = path.join(OUT, `${task.id.slice(-6)}-${item.id.slice(-6)}.png`);
      fs.writeFileSync(file, buf);
      storedBytes.push({ taskId: task.id, itemId: item.id, storageKey: item.storageKey, store: blob.store, mime: blob.mime, bytes: buf.length, sha256: sha256(buf), file, header: buf.subarray(0, 8).toString("hex") });
    }
  }
  receipt.steps.bytes = storedBytes;

  // 11) 下载（真实 download 事件 + 文件 sha 对齐 IDB 字节）
  const beforeAssetCounts = await page.evaluate(() => window.__icCounts());
  receipt.steps.beforeActions = beforeAssetCounts;
  const dlBtn = page.locator('[data-testid^="market-download-"]').first();
  const dlPresent = await dlBtn.count();
  receipt.steps.download = { present: dlPresent };
  if (dlPresent) {
    try {
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), dlBtn.click()]);
      const p = path.join(OUT, `download-${dl.suggestedFilename()}`);
      await dl.saveAs(p);
      const buf = fs.readFileSync(p);
      const first = storedBytes.find((b) => b.bytes);
      receipt.steps.download = { present: true, suggested: dl.suggestedFilename(), file: p, bytes: buf.length, sha256: sha256(buf), matchesStored: !!first && first.sha256 === sha256(buf) };
    } catch (error) { receipt.steps.download.error = String(error).slice(0, 300); }
  }
  await snap(page, "06-download.png");

  // 12) 存入资产库
  const saveBtn = page.locator('[data-testid^="market-save-"]').first();
  await saveBtn.click();
  await page.waitForTimeout(3500);
  const afterAsset = await page.evaluate(() => window.__icCounts());
  receipt.steps.saveToAssets = { before: beforeAssetCounts.assetCount, after: afterAsset.assetCount, delta: afterAsset.assetCount - beforeAssetCounts.assetCount, titles: afterAsset.assetTitles, label: await saveBtn.innerText().catch(() => null) };
  await snap(page, "07-saved.png");

  // 13) 发送画布
  const canvasBtn = page.locator('[data-testid^="market-canvas-"]').first();
  await canvasBtn.click();
  await page.waitForTimeout(4500);
  const afterCanvas = await page.evaluate(() => window.__icCounts());
  receipt.steps.sendToCanvas = { beforeNodes: beforeAssetCounts.nodeCount, afterNodes: afterCanvas.nodeCount, delta: afterCanvas.nodeCount - beforeAssetCounts.nodeCount, projects: afterCanvas.projectCount, label: await canvasBtn.innerText().catch(() => null) };
  await snap(page, "08-canvas.png");

  // 14) fresh reload：历史行 + 结果面板重建
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!document.querySelector("textarea"), { timeout: 45000 });
  await page.waitForTimeout(6000);
  const reloadCards = await page.locator('[data-testid^="market-save-"]').count();
  const historyTabClicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "历史记录" && b.offsetParent !== null);
    if (!btn) return false;
    btn.click();
    return true;
  });
  await page.waitForTimeout(2500);
  const historyRows = await page.evaluate(() => [...document.querySelectorAll("[data-task-id]")].map((e) => ({ id: e.getAttribute("data-task-id"), status: e.getAttribute("data-task-status"), text: e.innerText.replace(/\s+/g, " ").slice(0, 90) })));
  const bt = await bodyText(page);
  receipt.steps.reload = {
    historyTabClicked,
    historyCount: /历史任务\s*(\d+)\s*条/.exec(bt)?.[1] ?? null,
    resultCards: reloadCards,
    historyRows,
    myTaskVisible: receipt.tasks.some((t) => historyRows.some((r) => r.id === t.id)),
    summary: (/共\s*\d+\s*屏[^\n]*/.exec(bt) || [])[0] ?? null,
  };
  await snap(page, "09-reload-history.png");
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "生成结果" && x.offsetParent !== null); b?.click(); });
  await page.waitForTimeout(2000);
  receipt.steps.reload.resultCardsAfterTab = await page.locator('[data-testid^="market-save-"]').count();
  receipt.steps.reload.actionsAfterReload = {
    save: await page.locator('[data-testid^="market-save-"]').count(),
    canvas: await page.locator('[data-testid^="market-canvas-"]').count(),
    download: await page.locator('[data-testid^="market-download-"]').count(),
  };
  await snap(page, "10-reload-result.png");

  const firstBytes = storedBytes.find((b) => b.bytes);
  receipt.ok =
    cards > 0 &&
    !!firstBytes &&
    firstBytes.bytes > 1000 &&
    firstBytes.header.startsWith("89504e47") &&
    receipt.aplus.guardClick?.stillSelected === true &&
    receipt.steps.download.matchesStored === true &&
    receipt.steps.saveToAssets.delta >= 1 &&
    receipt.steps.sendToCanvas.delta >= 1 &&
    receipt.steps.reload.myTaskVisible === true &&
    receipt.steps.reload.resultCardsAfterTab > 0;
  receipt.finishedAt = new Date().toISOString();
  receipt.durationMs = Date.now() - submittedAt;
  fs.writeFileSync(path.join(OUT, "receipt.json"), JSON.stringify(receipt, null, 1));
  console.log(JSON.stringify({ ok: receipt.ok, tasks: receipt.tasks.map((t) => ({ id: t.id, status: t.status, items: t.items.length })), bytes: storedBytes.map((b) => ({ bytes: b.bytes, mime: b.mime, sha256: b.sha256 })), download: receipt.steps.download, save: receipt.steps.saveToAssets, canvas: receipt.steps.sendToCanvas, reload: receipt.steps.reload, aplus: receipt.aplus.guardClick, upstream: receipt.upstream.filter((u) => u.dir === "res").map((u) => ({ status: u.status, requestId: u.requestId, body: u.body })) }, null, 1));
} catch (error) {
  receipt.errors.push(String(error));
  receipt.finishedAt = new Date().toISOString();
  try { await snap(page, "99-error.png"); } catch { receipt.errors.push("screenshot failed"); }
  try { receipt.pageText = (await bodyText(page)).slice(0, 2000); } catch { receipt.pageText = null; }
  try {
    if (!receipt.tasks.length) {
      receipt.tasks = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("tool-task:v1:task-")).map((k) => { const t = JSON.parse(localStorage.getItem(k)); return { id: t.id, status: t.status, error: t.error ?? null, items: ((t.result && t.result.items) || []).length }; }));
    }
  } catch { receipt.errors.push("task dump failed"); }
  fs.writeFileSync(path.join(OUT, "receipt.json"), JSON.stringify(receipt, null, 1));
  console.log(JSON.stringify({ ok: false, errors: receipt.errors, pageText: receipt.pageText, tasks: receipt.tasks, upstream: receipt.upstream }, null, 1));
  process.exitCode = 1;
} finally {
  await context?.close();
}
