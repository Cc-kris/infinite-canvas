/** r26b-canvasprobe：只读取 canvas_store 结构 + 节点 image-17 字节 sha（不点击任何按钮） */
import { chromium } from "../../node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.IC_BASE_URL ?? "http://127.0.0.1:3000";
const PROFILE = process.env.IC_PROFILE ?? "/Users/mac/Documents/Dev/infinite-canvas/.acceptance-profile/r26b";
const OUT = process.env.IC_OUT ?? "/tmp/r26/out5";
const NODE_ID = "image-17";

const ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    viewport: { width: 1600, height: 1000 },
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.addInitScript(() => {
    const openDb = () => new Promise((res, rej) => { const o = indexedDB.open("infinite-canvas"); o.onsuccess = () => res(o.result); o.onerror = () => rej(o.error); });
    const shaHex = async (ab) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", ab))).map((b) => b.toString(16).padStart(2, "0")).join("");
    window.__p = {
        async raw(key) {
            const db = await openDb();
            const rows = await new Promise((res, rej) => {
                const tx = db.transaction("app_state", "readonly").objectStore("app_state").openCursor();
                const out = [];
                tx.onsuccess = () => { const c = tx.result; if (c) { out.push({ k: c.key, v: c.value }); c.continue(); } else { db.close(); res(out); } };
                tx.onerror = () => rej(tx.error);
            });
            const hit = rows.find((r) => r.k === key);
            return hit ? { found: true, len: typeof hit.v === "string" ? hit.v.length : -1, value: hit.v } : { found: false, keys: rows.map((r) => r.k) };
        },
        async media(key) {
            const db = await openDb();
            const names = ["image_files", "media_files", "canvas_files"].filter((n) => db.objectStoreNames.contains(n));
            for (const n of names) {
                const rows = await new Promise((res, rej) => {
                    const tx = db.transaction(n, "readonly").objectStore(n).openCursor();
                    const out = [];
                    tx.onsuccess = () => { const c = tx.result; if (c) { out.push({ k: c.key, v: c.value }); c.continue(); } else { res(out); } };
                    tx.onerror = () => rej(tx.error);
                });
                const hit = rows.find((r) => r.k === key);
                if (hit && hit.v instanceof Blob) {
                    const ab = await hit.v.arrayBuffer();
                    db.close();
                    return { found: true, store: n, size: hit.v.size, type: hit.v.type, sha256: await shaHex(ab), keys: rows.map((r) => r.k).slice(-5) };
                }
                if (hit) { db.close(); return { found: true, store: n, scalar: JSON.stringify(hit.v).slice(0, 200) }; }
            }
            db.close();
            return { found: false };
        },
    };
});
await page.goto(BASE + "/canvas", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

const out = await page.evaluate(async (nodeId) => {
    const raw = await window.__p.raw("infinite-canvas:canvas_store");
    if (!raw.found) return { storeMissing: true, keys: raw.keys };
    let parsed;
    try { parsed = JSON.parse(raw.value); } catch (e) { return { parseError: String(e).slice(0, 120), head: String(raw.value).slice(0, 200) }; }
    const st = parsed.state ?? parsed;
    const topKeys = Object.keys(st ?? {});
    const projects = st.projects ?? null;
    const findNodes = (o) => {
        const hits = [];
        const walk = (v, p, d) => {
            if (d > 6 || !v || typeof v !== "object") return;
            if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${p}[${i}]`, d + 1)); return; }
            if (v.id === nodeId) hits.push({ path: p, node: v });
            for (const k of Object.keys(v)) walk(v[k], `${p}.${k}`, d + 1);
        };
        walk(o, "root", 0);
        return hits;
    };
    const hits = findNodes(st);
    const node = hits[0]?.node ?? null;
    return {
        valueLen: raw.len,
        topKeys,
        projectIds: projects ? (Array.isArray(projects) ? projects.map((x) => x.id ?? x) : Object.keys(projects)) : null,
        hitPaths: hits.map((h) => h.path),
        nodeId: node?.id ?? null,
        nodeKeys: node ? Object.keys(node) : null,
        nodeJson: node ? JSON.stringify(node).slice(0, 1200) : null,
        storageKey: node?.storageKey ?? node?.data?.storageKey ?? (node ? (JSON.stringify(node).match(/"(?:storageKey|key)":"([^"]+)"/) ?? [])[1] : null),
        nodeMediaId: node?.data?.mediaId ?? node?.mediaId ?? null,
        nodeBytes: node?.data?.bytes ?? node?.bytes ?? null,
    };
}, NODE_ID);

if (out.storageKey) {
    out.media = await page.evaluate((k) => window.__p.media(k), out.storageKey);
    if (out.media?.found && out.media.sha256) out.media.matchesResult = out.media.sha256 === "2f8f7f112bccc0a67d13bf8fb5a166da715ec85c2ff169f8c147f7e3d3cf415e";
}
fs.writeFileSync(path.join(OUT, "canvas-probe.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1).slice(0, 3500));
await ctx.close();
