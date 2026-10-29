import { chromium } from "playwright";
import fs from "node:fs";
const ctx = await chromium.launchPersistentContext("/tmp/ic_r9_profile_translation", { channel: "chrome", headless: true, viewport: { width: 1440, height: 1000 }, locale: "zh-CN" });
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto("http://127.0.0.1:3000/", { waitUntil: "load" });
await page.waitForTimeout(1500);
const out = await page.evaluate(async () => {
  const db = await new Promise((r, j) => { const q = indexedDB.open("infinite-canvas"); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); });
  const get = (store, key) => new Promise((r) => { const q = db.transaction(store, "readonly").objectStore(store).get(key); q.onsuccess = () => r(q.result); q.onerror = () => r(null); });
  const canvasRaw = await get("app_state", "infinite-canvas:canvas_store");
  const assetRaw = await get("app_state", "infinite-canvas:asset_store");
  const cs = typeof canvasRaw === "string" ? JSON.parse(canvasRaw) : canvasRaw;
  const as = typeof assetRaw === "string" ? JSON.parse(assetRaw) : assetRaw;
  const projects = cs?.state?.projects ?? cs?.projects ?? [];
  const p = projects.find((x) => x.id === "c86DFKiJXDkVfHFgz5-jP");
  const node = p?.nodes?.[0];
  const assets = as?.state?.assets ?? as?.assets ?? [];
  const asset = assets.find((a) => a.id === "vT7_AZTJmExCSJO3_dt3j");
  const keys = [node?.metadata?.storageKey, asset?.data?.storageKey].filter(Boolean);
  const media = {};
  for (const k of keys) {
    const blob = await get("media_files", k);
    media[k] = blob ? { type: blob.type ?? null, size: blob.size ?? null } : null;
  }
  const taskResultBlob = await get("media_files", "tool-result:guW96FrxlpSM3CtY3clem");
  db.close();
  return {
    canvasProject: p ? { id: p.id, title: p.title, nodes: p.nodes.length, viewport: p.viewport } : null,
    canvasNode: node ? { id: node.id, type: node.type, title: node.title, width: node.width, height: node.height, metadata: node.metadata } : null,
    asset: asset ? { id: asset.id, kind: asset.kind, title: asset.title, createdAt: asset.createdAt, data: { storageKey: asset.data?.storageKey, bytes: asset.data?.bytes, width: asset.data?.width, height: asset.data?.height, mimeType: asset.data?.mimeType }, metadata: asset.metadata } : null,
    mediaBlobs: media,
    taskResultStore: taskResultBlob ? { type: taskResultBlob.type, size: taskResultBlob.size } : null,
  };
});
fs.writeFileSync("/tmp/ic_r16/verify_store.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1).slice(0, 3000));
await ctx.close();
