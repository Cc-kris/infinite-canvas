import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

// Playwright 来自应用自身依赖，可用 IC_PLAYWRIGHT 覆盖。
const require_ = createRequire("/Users/mac/Documents/Dev/infinite-canvas/web/package.json");
const { chromium } = require_(process.env.IC_PLAYWRIGHT ?? "playwright");

const BASE = process.env.IC_BASE ?? "http://127.0.0.1:3020";
const TAG = process.env.IC_TAG ?? "run";
// 两张小 PNG 内嵌，脚本自包含（64x48 / 48x64，均 124B）
const PNG_DIR = join(tmpdir(), "ic-assetrace");
mkdirSync(PNG_DIR, { recursive: true });
const PNG_A = join(PNG_DIR, "a.png");
const PNG_B = join(PNG_DIR, "b.png");
writeFileSync(PNG_A, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAQ0lEQVR42u3PQQkAAAgEsItz/VMYywp+hcEKLNO+FgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQGBqwWPoCDEkZcDMwAAAABJRU5ErkJggg==", "base64"));
writeFileSync(PNG_B, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAADAAAABACAIAAADTQmMRAAAAQ0lEQVR42u3OQQkAAAgEsItjCPtjLFuIj8ECLNXzSoSEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEriyT5xDT8/79NgAAAABJRU5ErkJggg==", "base64"));
const out = [];
const log = (...a) => { const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "); out.push(s); console.log(s); };

const warm = async (page) => page.evaluate(async () => {
    const m = await import("/src/services/image-storage.ts");
    const c = document.createElement("canvas"); c.width = 8; c.height = 8;
    const g = c.getContext("2d"); g.fillStyle = "#123456"; g.fillRect(0, 0, 8, 8);
    const r = await m.uploadImage(c.toDataURL("image/png"));
    return { storageKey: r.storageKey, bytes: r.bytes };
});

const saveAsset = async (page, { png, title }) => {
    const t0 = Date.now();
    await page.getByRole("button", { name: /新增资产/ }).first().click();
    const d = page.locator('[role="dialog"]').first();
    await d.waitFor({ state: "visible", timeout: 15000 });
    // 类型下拉（antd Select，默认「文本」）→ 切到「图片」
    await d.locator("#kind").click();
    await page.locator('.ant-select-item-option, [role="option"]').filter({ hasText: /图\s*片/ }).first().click();
    await page.waitForTimeout(200);
    const kindNow = await d.innerText();
    if (!/图片内容/.test(kindNow)) throw new Error(`kind not switched: ${kindNow.replace(/\n/g, "|").slice(0, 120)}`);
    const inputs = d.locator('input[type="file"][accept*="image" i]');
    const n = await inputs.count();
    let draftOk = 0;
    for (let attempt = 1; attempt <= 3 && !draftOk; attempt += 1) {
        await inputs.nth(n - 1).setInputFiles(png);
        for (let i = 0; i < 20; i += 1) {
            if (await d.getByText(/\d+x\d+ · [\d.]+ ?(B|KB|MB)/).count()) { draftOk = 1; break; }
            await page.waitForTimeout(400);
        }
        log(`  draft attempt ${attempt}: ${draftOk ? "ok" : "missing"}`);
    }
    if (!draftOk) {
        throw new Error(`no draft in ${title}: ${(await d.innerText()).replace(/\n/g, "|").slice(0, 160)}`);
    }
    await d.locator("#title").fill(title);
    await page.waitForTimeout(150);
    const saveBtn = d.getByRole("button", { name: /保\s*存/ });
    await saveBtn.click();
    await d.waitFor({ state: "hidden", timeout: 20000 });
    log(`SAVED ${title} in ${Date.now() - t0}ms`);
};

const readIdb = async (page) => page.evaluate(async () => {
    const open = () => new Promise((res, rej) => { const r = indexedDB.open("infinite-canvas"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const db = await open();
    const version = db.version;
    const get = (store, key) => new Promise((res, rej) => {
        const tx = db.transaction(store, "readonly");
        const r = tx.objectStore(store).get(key);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error ?? new Error("get-failed"));
    });
    const storeNames = [...db.objectStoreNames];
    let raw = null;
    if (storeNames.includes("app_state")) raw = await get("app_state", "infinite-canvas:asset_store");
    let parsed = null;
    try { parsed = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { parsed = null; }
    const assets = parsed?.state?.assets ?? [];
    const bytes = {};
    if (storeNames.includes("image_files")) {
        for (const a of assets) {
            const sk = a.storageKey ?? a.coverStorageKey ?? a.data?.storageKey ?? null;
            if (!sk) continue;
            const blob = await get("image_files", sk).catch(() => null);
            bytes[a.title] = blob ? (blob.size ?? blob.byteLength ?? blob?.data?.length ?? null) : null;
        }
    }
    return {
        version, storeNames,
        persistKeys: Object.keys(parsed?.state ?? {}),
        count: assets.length,
        titles: assets.map((a) => a.title),
        storageKeys: assets.map((a) => a.data?.storageKey ?? a.storageKey ?? null),
        bytes,
        memTitles: (window.__assetTitles ?? null),
    };
});

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
ctx.on("page", (p) => p.on("pageerror", (e) => log("PAGEERROR", String(e))));

// Phase 0: 预热（先 A 建好 localforage 各 store，再开 B，避免跨标签 version 升级死锁）
const A = await ctx.newPage();
await A.goto(`${BASE}/assets`, { waitUntil: "domcontentloaded" });
await A.waitForTimeout(1500);
log("warm A", await warm(A));

const B = await ctx.newPage();
await B.goto(`${BASE}/assets`, { waitUntil: "domcontentloaded" });
await B.waitForTimeout(1500);
log("warm B", await warm(B));
await B.evaluate(() => { document.body.dataset.tab = "B"; });

const id0 = await readIdb(B);
log("initial", { version: id0.version, stores: id0.storeNames, count: id0.count, titles: id0.titles });

// Phase 1: 两标签各自保存一个不同资产
await saveAsset(A, { png: PNG_A, title: `${TAG}-TAB-A` });
await B.waitForTimeout(600);
log("B sees A?", await B.evaluate(() => document.body.innerText.includes("TAB-A")));

await saveAsset(B, { png: PNG_B, title: `${TAG}-TAB-B` });
await A.waitForTimeout(600);

// Phase 2: 机读证据（独立读 IDB，不依赖内存 store）
const idAfter = await readIdb(A);
log("after-save", idAfter);

// Phase 3: reload 两标签，确认两资产 + bytes 都在
await A.reload({ waitUntil: "domcontentloaded" });
await B.reload({ waitUntil: "domcontentloaded" });
await A.waitForTimeout(2500);
await B.waitForTimeout(2500);
const visA = await A.evaluate(() => (window.__titles = [...document.querySelectorAll("*")].length, document.body.innerText));
const visB = await B.evaluate(() => document.body.innerText);
const check = (text) => ({ hasA: text.includes("TAB-A"), hasB: text.includes("TAB-B") });
log("reload A visible", check(visA));
log("reload B visible", check(visB));
const idReload = await readIdb(A);
log("after-reload", { count: idReload.count, titles: idReload.titles, bytes: idReload.bytes });

const pass = idReload.titles.includes(`${TAG}-TAB-A`) && idReload.titles.includes(`${TAG}-TAB-B`)
    && Object.values(idReload.bytes).every((v) => typeof v === "number" && v > 0);
log("RESULT", pass ? "PASS" : "FAIL");

const EVIDENCE_OUT = process.env.IC_EVIDENCE_OUT ?? join(process.cwd(), `evidence-${TAG}.json`);
writeFileSync(EVIDENCE_OUT, JSON.stringify({ base: BASE, tag: TAG, pass, lines: out, afterSave: idAfter, afterReload: idReload }, null, 2));
await browser.close();
process.exit(pass ? 0 : 1);
