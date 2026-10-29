import { chromium } from "playwright";
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const BASE = "http://127.0.0.1:3000";
const PROFILE = "/tmp/ic_r9_profile_translation";
const TASK = "task-mvtjhbcg-e8lnin";
const OUT = "/tmp/ic_r16";
const R = { task: TASK, ts: new Date().toISOString(), steps: {} };
const log = (k, v) => { R.steps[k] = v; console.log("== " + k + ": " + JSON.stringify(v).slice(0, 800)); };

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: "chrome", headless: true, viewport: { width: 1440, height: 1000 }, locale: "zh-CN", acceptDownloads: true,
});
const page = ctx.pages()[0] || await ctx.newPage();
page.setDefaultTimeout(30000);
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 300)); });
page.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 300)));

try {
  // ---- STEP 0: FRESH RELOAD (new browser process, page loaded from persisted stores) ----
  await page.goto(BASE + "/tools/ai-video/image-to-video", { waitUntil: "load" });
  await page.waitForSelector('[data-testid="image-to-video-workspace"]', { timeout: 25000 });
  const navInfo = await page.evaluate(() => ({ t: Math.round(performance.now()), ua: navigator.userAgent.includes("Headless") ? "headless" : "headful" }));
  log("freshLoad", navInfo);

  // ---- STEP 1: read persisted task record from localStorage (source of truth, pre-UI) ----
  const persisted = await page.evaluate((tid) => {
    const raw = localStorage.getItem("tool-task:v1:" + tid);
    const rec = raw ? JSON.parse(raw) : null;
    if (!rec) {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith("tool-task:v1:"));
      return { ok: false, keyCount: keys.length, keys: keys.slice(0, 8) };
    }
    return {
      ok: true,
      keys: Object.keys(rec).sort(),
      id: rec.id, toolId: rec.toolId, status: rec.status,
      createdAt: rec.createdAt, updatedAt: rec.updatedAt,
      upstreamTaskId: rec.upstreamTaskId ?? null,
      configSnapshot: rec.configSnapshot ?? null,
      sourceAssetIds: rec.sourceAssetIds ?? null,
      prompt: typeof rec.prompt === "string" ? rec.prompt.slice(0, 120) : rec.prompt,
      result: rec.result ? {
        keys: Object.keys(rec.result),
        items: (rec.result.items ?? []).map((it) => ({
          keys: Object.keys(it).sort(),
          url: it.url ?? null, blob: typeof it.blob, storageKey: it.storageKey ?? null,
          payloadDropped: it.payloadDropped ?? null, bytes: it.bytes ?? null,
          width: it.width ?? null, height: it.height ?? null, mimeType: it.mimeType ?? null,
        })),
      } : null,
    };
  }, TASK);
  log("persistedTask", persisted);

  // ---- STEP 2: open history task via real UI ----
  await page.waitForSelector('[data-testid="tool-task-history-item"]', { timeout: 20000 });
  const historyCount = await page.locator('[data-testid="tool-task-history-item"]').count();
  const opened = await page.evaluate((tid) => {
    const row = [...document.querySelectorAll('[data-testid="tool-task-history-item"]')].find((r) => r.getAttribute("data-task-id") === tid);
    if (!row) return { found: false };
    (row.querySelector('[data-testid="tool-task-history-open"]') || row).click();
    return { found: true, rowText: row.textContent.trim().slice(0, 160) };
  }, TASK);
  log("historyOpen", { historyCount, ...opened });
  await page.waitForSelector('[data-testid="tool-result-canvas-0"]', { timeout: 20000 });
  await page.waitForTimeout(2500);

  // ---- STEP 3: result panel state AFTER reload (the fix under test) ----
  const panel = await page.evaluate(() => {
    const txt = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;
    const btn = document.querySelector('[data-testid="tool-result-canvas-0"]');
    const vids = [...document.querySelectorAll("video")].map((v) => ({
      src: (v.currentSrc || v.src || "").slice(0, 100), duration: Number.isFinite(v.duration) ? v.duration : null,
      vw: v.videoWidth, vh: v.videoHeight, readyState: v.readyState, paused: v.paused,
    }));
    return {
      tone: txt('[data-testid="image-to-video-result-tone"]'),
      detail: txt('[data-testid="image-to-video-result-detail"]'),
      resultText: txt('[data-testid="image-to-video-result"]'),
      canvasBtn: btn ? { disabled: btn.disabled, label: btn.textContent.trim().slice(0, 40) } : null,
      downloadBtn: document.querySelector('[data-testid="tool-result-download-0"]') ? true : false,
      saveBtn: document.querySelector('[data-testid="tool-result-save-0"]') ? true : false,
      videos: vids,
      falseAccusation: /没有可播放视频|已记录上游返回为空/.test(document.body.innerText),
      caseNote: txt('[data-testid="image-to-video-case-note"]'),
    };
  });
  log("panelAfterReload", panel);

  // ---- STEP 4: config fields restored by history click ----
  const form = await page.evaluate(() => {
    const s = (id) => { const el = document.querySelector(`[data-testid="${id}"]`); if (!el) return null;
      const opt = el.selectedOptions?.[0]?.textContent?.trim() ?? null; return { value: el.value ?? null, label: opt, disabled: !!el.disabled }; };
    return { resolution: s("image-to-video-resolution"), duration: s("image-to-video-duration"), ratio: s("image-to-video-ratio"),
      prompt: (document.querySelector('[data-testid="image-to-video-prompt"]')?.value ?? null)?.slice?.(0, 100) ?? null,
      caseNote: document.querySelector('[data-testid="image-to-video-case-note"]')?.textContent?.trim() ?? null,
      lostNotice: (document.body.innerText.match(/比例未记录|沿用当前值|任务快照未存/g) || []).slice(0, 5) };
  });
  log("formRestored", form);
  await page.screenshot({ path: OUT + "/01-reload-panel.png", fullPage: false });

  // ---- STEP 5: download ----
  try {
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 90000 }),
      page.locator('[data-testid="tool-result-download-0"]').click(),
    ]);
    const f = OUT + "/downloads/seq.mp4";
    await dl.saveAs(f);
    const b = fs.readFileSync(f);
    let probe = null;
    try {
      probe = execFileSync("/opt/homebrew/bin/ffprobe", ["-v", "error", "-show_entries",
        "stream=codec_name,width,height,r_frame_rate,nb_frames,duration:format=duration,size,format_name", "-of", "json", f]).toString();
    } catch (e) { probe = { ffprobeErr: String(e).slice(0, 200) }; }
    log("download", {
      bytes: b.length, magic: b.subarray(4, 8).toString("ascii"), sha256: crypto.createHash("sha256").update(b).digest("hex"),
      suggestedFilename: dl.suggestedFilename(), ffprobe: typeof probe === "string" ? JSON.parse(probe) : probe,
    });
  } catch (e) { log("downloadError", { error: String(e).slice(0, 800) }); }

  // ---- STEP 6: save asset ----
  try {
    const before = await page.evaluate(async () => {
      const db = await new Promise((r, j) => { const q = indexedDB.open("infinite-canvas"); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); });
      const v = await new Promise((r) => { const q = db.transaction("app_state", "readonly").objectStore("app_state").get("infinite-canvas:asset_store"); q.onsuccess = () => r(q.result); q.onerror = () => r(null); });
      db.close();
      const st = typeof v === "string" ? JSON.parse(v) : v;
      const list = st?.state?.assets ?? st?.assets ?? [];
      return { count: list.length, ids: list.map((a) => a.id) };
    });
    await page.locator('[data-testid="tool-result-save-0"]').click({ timeout: 20000 });
    await page.waitForFunction(() => /已保存到资产库|保存失败|error/i.test(document.querySelector('[data-testid="tool-result-feedback"]')?.textContent ?? ""), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const feedback = await page.evaluate(() => document.querySelector('[data-testid="tool-result-feedback"]')?.textContent?.trim() ?? null);
    const after = await page.evaluate(async () => {
      const db = await new Promise((r, j) => { const q = indexedDB.open("infinite-canvas"); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); });
      const v = await new Promise((r) => { const q = db.transaction("app_state", "readonly").objectStore("app_state").get("infinite-canvas:asset_store"); q.onsuccess = () => r(q.result); q.onerror = () => r(null); });
      db.close();
      const st = typeof v === "string" ? JSON.parse(v) : v;
      const list = st?.state?.assets ?? st?.assets ?? [];
      const last = list[0];
      return { count: list.length, ids: list.map((a) => a.id), newest: last ? { id: last.id, kind: last.kind, createdAt: last.createdAt,
        storageKey: last.data?.storageKey, bytes: last.data?.bytes, width: last.data?.width, height: last.data?.height, taskId: last.metadata?.taskId } : null };
    });
    log("saveAsset", { feedback, beforeCount: before.count, afterCount: after.count, beforeIds: before.ids.slice(0, 3), newest: after.newest });
  } catch (e) { log("saveAssetError", { error: String(e).slice(0, 800) }); }

  // ---- STEP 7: send to canvas ----
  try {
    const before = await page.evaluate(async () => {
      const db = await new Promise((r, j) => { const q = indexedDB.open("infinite-canvas"); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); });
      const v = await new Promise((r) => { const q = db.transaction("app_state", "readonly").objectStore("app_state").get("infinite-canvas:canvas_store"); q.onsuccess = () => r(q.result); q.onerror = () => r(null); });
      db.close();
      const st = typeof v === "string" ? JSON.parse(v) : v;
      const ps = st?.state?.projects ?? st?.projects ?? [];
      return { projects: ps.map((p) => ({ id: p.id, title: p.title, nodes: p.nodes?.length ?? 0 })) };
    });
    await page.locator('[data-testid="tool-result-canvas-0"]').click({ timeout: 30000 });
    await page.waitForFunction(() => /已发送到画布|发送失败|未登录/i.test(document.querySelector('[data-testid="tool-result-feedback"]')?.textContent ?? ""), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const feedback = await page.evaluate(() => document.querySelector('[data-testid="tool-result-feedback"]')?.textContent?.trim() ?? null);
    const after = await page.evaluate(async () => {
      const db = await new Promise((r, j) => { const q = indexedDB.open("infinite-canvas"); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); });
      const v = await new Promise((r) => { const q = db.transaction("app_state", "readonly").objectStore("app_state").get("infinite-canvas:canvas_store"); q.onsuccess = () => r(q.result); q.onerror = () => r(null); });
      db.close();
      const st = typeof v === "string" ? JSON.parse(v) : v;
      const ps = st?.state?.projects ?? st?.projects ?? [];
      return { projects: ps.map((p) => ({ id: p.id, title: p.title, nodes: p.nodes?.length ?? 0, videoNodes: (p.nodes ?? []).filter((n) => /video/.test(String(n.type))).length,
        lastNode: p.nodes?.at(-1) ? { id: p.nodes.at(-1).id, type: p.nodes.at(-1).type, title: p.nodes.at(-1).title, metaKeys: Object.keys(p.nodes.at(-1).metadata ?? {}), content: String((p.nodes.at(-1).metadata?.content ?? p.nodes.at(-1).content ?? "")).slice(0, 160) } : null })) };
    });
    log("sendToCanvas", { feedback, projectsBefore: before.projects, projectsAfter: after.projects });
  } catch (e) { log("sendToCanvasError", { error: String(e).slice(0, 1200) }); }

  await page.screenshot({ path: OUT + "/02-after-sequence.png", fullPage: false });

  // ---- STEP 8: console errors (real, unfiltered) ----
  const renderWarn = errs.filter((t) => /Cannot update a component|while rendering/.test(t));
  log("console", { total: errs.length, renderPhaseSetState: renderWarn.slice(0, 3), last: errs.slice(-6) });
} catch (e) {
  log("fatal", { error: String(e).slice(0, 1500) });
} finally {
  fs.writeFileSync(OUT + "/receipt.json", JSON.stringify(R, null, 2));
  await ctx.close();
}
