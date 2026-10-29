/**
 * r26b-verify：已 succeeded 的真实任务（task-mvtp33dv-57nmbx）只读验证
 * - 不提交任何新生成请求（不做任何结果注入）
 * - 同一文档 fresh reload → 下载 / 存资产 / 发画布 三路字节对账
 * 环境变量：IC_BASE_URL / IC_PROFILE / IC_OUT
 */
import { chromium } from "../../node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const BASE = process.env.IC_BASE_URL ?? "http://127.0.0.1:3000";
const PROFILE = process.env.IC_PROFILE ?? "/Users/mac/Documents/Dev/infinite-canvas/.acceptance-profile/r26b";
const OUT = process.env.IC_OUT ?? "/tmp/r26/out5";
const TASK_ID = "task-mvtp33dv-57nmbx";
const EXPECT = {
    taskId: TASK_ID,
    bytes: 1831533,
    sha256: "2f8f7f112bccc0a67d13bf8fb5a166da715ec85c2ff169f8c147f7e3d3cf415e",
    storageKey: "tool-result:task-mvtp33dv-57nmbx:0:3yrrtwJa4FBz7TxtYTf29",
};

fs.mkdirSync(OUT, { recursive: true });
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const rec = {
    startedAt: new Date().toISOString(),
    baseUrl: BASE,
    profile: PROFILE,
    mode: "verify-existing-succeeded-task (no generation submitted)",
    expected: EXPECT,
    requests: [],
};

const ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    viewport: { width: 1600, height: 1000 },
    acceptDownloads: true,
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

await page.addInitScript(() => {
    const idbAll = (dbName, storeName) =>
        new Promise((res, rej) => {
            const open = indexedDB.open(dbName);
            open.onerror = () => rej(open.error);
            open.onsuccess = () => {
                const db = open.result;
                if (!db.objectStoreNames.contains(storeName)) {
                    db.close();
                    res([]);
                    return;
                }
                const tx = db.transaction(storeName, "readonly");
                const cur = tx.objectStore(storeName).openCursor();
                const out = [];
                cur.onsuccess = () => {
                    const c = cur.result;
                    if (c) {
                        out.push({ key: c.key, value: c.value });
                        c.continue();
                    } else {
                        db.close();
                        res(out);
                    }
                };
                cur.onerror = () => rej(cur.error);
            };
        });
    const blobToB64 = async (blob) => {
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        const CH = 0x8000;
        for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode(...buf.subarray(i, i + CH));
        return btoa(bin);
    };
    const shaHex = async (ab) => {
        const d = new Uint8Array(await crypto.subtle.digest("SHA-256", ab));
        return Array.from(d).map((b) => b.toString(16).padStart(2, "0")).join("");
    };
    const STORES = ["media_files", "image_files", "asset_files", "canvas_files"];
    window.__r26 = {
        idbAll,
        async media(storeNames, key) {
            const tried = [];
            for (const s of [].concat(storeNames)) {
                const rows = await idbAll("infinite-canvas", s);
                tried.push({ store: s, count: rows.length });
                const hit = rows.find((r) => r.key === key);
                if (!hit) continue;
                const v = hit.value;
                if (v instanceof Blob) {
                    const ab = await v.arrayBuffer();
                    return { found: true, store: s, size: v.size, type: v.type, sha256: await shaHex(ab), b64: await blobToB64(new Blob([ab])) };
                }
                return { found: true, store: s, scalar: true, json: JSON.stringify(v).slice(0, 400) };
            }
            return { found: false, tried };
        },
        async stores() {
            const rows = await idbAll("infinite-canvas", "app_state");
            const out = { assetStore: null, canvasStore: null, keys: rows.map((r) => r.key) };
            for (const r of rows) {
                let p;
                try {
                    p = JSON.parse(r.value);
                } catch {
                    continue;
                }
                const st = p?.state ?? p;
                if (st && Array.isArray(st.assets)) out.assetStore = { key: r.key, assets: st.assets };
                if (st && (st.nodes || st.nodeOrder))
                    out.canvasStore = { key: r.key, nodes: st.nodes, nodeOrder: st.nodeOrder, rawKeys: Object.keys(st) };
            }
            return out;
        },
    };
});

const cdp = await ctx.newCDPSession(page);
await cdp.send("Network.enable");
cdp.on("Network.requestWillBeSent", (e) => {
    const u = e.request?.url ?? "";
    if (/\/v1\/images\/(edits|generations)/.test(u)) rec.requests.push({ method: e.request?.method, url: u.split("?")[0] });
});

const readTask = () =>
    page.evaluate((tid) => {
        const keys = Object.keys(localStorage).filter((k) => k.startsWith("tool-task:v1:") && k !== "tool-task:v1:index");
        const all = keys.map((k) => {
            try {
                const t = JSON.parse(localStorage.getItem(k));
                return { id: t.id, toolId: t.toolId, status: t.status, createdAt: t.createdAt, finishedAt: t.finishedAt ?? null };
            } catch {
                return null;
            }
        });
        const raw = localStorage.getItem("tool-task:v1:" + tid);
        const t = raw ? JSON.parse(raw) : null;
        return {
            all: all.filter(Boolean),
            task: t
                ? {
                      id: t.id,
                      toolId: t.toolId,
                      status: t.status,
                      createdAt: t.createdAt,
                      finishedAt: t.finishedAt ?? null,
                      submittedAt: t.submittedAt ?? null,
                      attempts: t.attempts ?? null,
                      items: (t.result?.items ?? []).map((i) => ({ kind: i.kind, storageKey: i.storageKey, bytes: i.bytes, dataUrlLen: i.dataUrl ? i.dataUrl.length : 0 })),
                  }
                : null,
        };
    }, TASK_ID);

// ---- 1) 打开工具页（不写配置、不提交生成）----
await page.goto(BASE + "/tools/smart-edit/remove-pen", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
rec.storeBeforeReload = await readTask();

// ---- 2) 同一文档 fresh reload ----
const navBefore = await page.evaluate(() => performance.getEntriesByType("navigation")[0]?.type ?? "");
const reloadResp = await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-testid=remove-pen-workspace]", { timeout: 90000 });
await page.waitForTimeout(4000);
rec.reload = { beforeType: navBefore, status: reloadResp ? reloadResp.status() : null, at: new Date().toISOString() };
rec.afterReload = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const img = document.querySelector("img[alt='消除结果']");
    const btn = (id) => document.querySelector(`[data-testid=${id}]`);
    const href = btn("remove-pen-download")?.getAttribute("href") || "";
    return {
        navType: nav?.type ?? null,
        resultImg: img ? { srcScheme: (img.currentSrc || img.src || "").split(":")[0], naturalW: img.naturalWidth, naturalH: img.naturalHeight, complete: img.complete } : null,
        downloadHrefScheme: href.split(":")[0],
        downloadHrefLen: href.length,
        saveDisabled: btn("remove-pen-save")?.disabled ?? null,
        sendDisabled: btn("remove-pen-send")?.disabled ?? null,
        feedback: btn("remove-pen-result-feedback")?.textContent ?? null,
        submitExists: !!btn("remove-pen-submit"),
    };
});
await page.screenshot({ path: path.join(OUT, "02-after-reload.png") });
rec.storeAfterReload = await readTask();

// ---- 3) 结果字节（IDB，多 store 尝试）----
const sk = rec.storeAfterReload.task?.items?.find((i) => i.storageKey)?.storageKey ?? EXPECT.storageKey;
rec.resultStorageKey = sk;
const media = await page.evaluate((k) => window.__r26.media(["media_files", "image_files"], k), sk);
rec.resultBytes = { found: media.found, store: media.store ?? null, size: media.size ?? 0, type: media.type ?? "", sha256: media.sha256 ?? null, tried: media.tried ?? null };
if (media.found && media.b64) {
    const buf = Buffer.from(media.b64, "base64");
    fs.writeFileSync(path.join(OUT, "result.png"), buf);
    rec.resultBytes.fileBytes = buf.length;
    rec.resultBytes.fileSha256 = sha256(buf);
}
rec.resultBytes.matchesExpected = rec.resultBytes.sha256 === EXPECT.sha256 && (rec.resultBytes.size === EXPECT.bytes);

// ---- 4) 下载 ----
const dlAnchor = page.locator("[data-testid=remove-pen-download]");
let dlSha = null;
try {
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), dlAnchor.click()]);
    const ext = download.suggestedFilename().match(/\.[a-z0-9]+$/i)?.[0] ?? ".bin";
    const target = path.join(OUT, "download" + ext);
    await download.saveAs(target);
    const buf = fs.readFileSync(target);
    dlSha = sha256(buf);
    rec.download = { via: "playwright-download", suggested: download.suggestedFilename(), file: path.basename(target), bytes: buf.length, sha256: dlSha };
} catch (e) {
    try {
        const href = await dlAnchor.getAttribute("href");
        const b64 = href?.includes(",") ? href.split(",")[1] : null;
        if (!b64) throw new Error("no href b64");
        const buf = Buffer.from(b64, "base64");
        fs.writeFileSync(path.join(OUT, "download-via-anchor.png"), buf);
        dlSha = sha256(buf);
        rec.download = { via: "anchor-b64", hrefScheme: (href || "").split(":")[0], bytes: buf.length, sha256: dlSha, note: String(e).slice(0, 120) };
    } catch (e2) {
        rec.download = { via: "failed", error: String(e).slice(0, 160), error2: String(e2).slice(0, 160) };
    }
}
rec.download.matchesResultBytes = !!dlSha && dlSha === EXPECT.sha256;

// ---- 5) 存入资产 ----
rec.save = {};
try {
    await page.locator("[data-testid=remove-pen-save]").click();
    await page.waitForTimeout(6000);
    rec.save.feedback = await page.evaluate(() => document.querySelector("[data-testid=remove-pen-result-feedback]")?.textContent ?? null);
    const stores1 = await page.evaluate(() => window.__r26.stores());
    const assets = stores1.assetStore?.assets ?? [];
    const newest = [...assets].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0];
    rec.save.asset = newest
        ? {
              assetId: newest.id,
              title: newest.title,
              kind: newest.kind,
              storageKey: newest.data?.storageKey ?? null,
              bytes: newest.data?.bytes ?? null,
              mimeType: newest.data?.mimeType ?? null,
              updatedAt: newest.updatedAt,
              totalAssets: assets.length,
          }
        : null;
    if (newest?.data?.storageKey) {
        const m = await page.evaluate((k) => window.__r26.media(["image_files", "media_files", "asset_files"], k), newest.data.storageKey);
        rec.save.assetBytes = { found: m.found, store: m.store ?? null, size: m.size ?? 0, sha256: m.sha256 ?? null };
        if (m.found && m.b64) fs.writeFileSync(path.join(OUT, "asset-blob.bin"), Buffer.from(m.b64, "base64"));
        rec.save.assetBytes.matchesResult = !!m.sha256 && m.sha256 === EXPECT.sha256;
    }
} catch (e) {
    rec.save.error = String(e).slice(0, 200);
}
await page.screenshot({ path: path.join(OUT, "03-after-save.png") });

// ---- 6) 发送画布 ----
rec.send = {};
try {
    await page.locator("[data-testid=remove-pen-send]").click();
    await page.waitForTimeout(6000);
    rec.send.feedback = await page.evaluate(() => document.querySelector("[data-testid=remove-pen-result-feedback]")?.textContent ?? null);
    const stores2 = await page.evaluate(() => window.__r26.stores());
    if (stores2.canvasStore) {
        const raw = stores2.canvasStore.nodes;
        const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
        const imgs = list.filter((n) => n && (n.type === "image" || n.kind === "image" || n.data?.storageKey || n.storageKey));
        const json = (n) => JSON.stringify(n ?? {});
        const newest = [...imgs].sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))[0];
        const keyHit = newest ? (json(newest).match(/"(?:storageKey|key)":"([^"]+)"/) ?? [])[1] : null;
        rec.send.canvasNode = newest
            ? {
                  canvasNodeId: newest.id ?? null,
                  type: newest.type ?? newest.kind ?? null,
                  nodeKeys: Object.keys(newest),
                  storageKey: newest.storageKey ?? newest.data?.storageKey ?? keyHit ?? null,
                  totalNodes: list.length,
                  imageNodes: imgs.length,
              }
            : null;
        if (rec.send.canvasNode?.storageKey) {
            const m = await page.evaluate((k) => window.__r26.media(["image_files", "media_files", "canvas_files"], k), rec.send.canvasNode.storageKey);
            rec.send.canvasNode.bytes = m.size ?? 0;
            rec.send.canvasNode.sha256 = m.sha256 ?? null;
            rec.send.canvasNode.matchesResult = !!m.sha256 && m.sha256 === EXPECT.sha256;
        }
    } else {
        rec.send.canvasStoreMissing = stores2.keys;
    }
} catch (e) {
    rec.send.error = String(e).slice(0, 200);
}
await page.screenshot({ path: path.join(OUT, "04-after-send.png") });

// ---- 7) 判定 ----
rec.checks = {
    taskSucceeded: rec.storeAfterReload.task?.status === "succeeded",
    freshReload: rec.afterReload?.navType === "reload",
    resultVisibleAfterReload: (rec.afterReload?.resultImg?.naturalW ?? 0) > 0,
    storedBytesMatch: rec.resultBytes.matchesExpected === true,
    downloadBytesMatch: rec.download?.matchesResultBytes === true,
    assetSaved: !!rec.save?.asset?.assetId,
    assetBytesMatch: rec.save?.assetBytes?.matchesResult === true,
    canvasSent: !!rec.send?.canvasNode?.canvasNodeId,
    canvasBytesMatch: rec.send?.canvasNode?.matchesResult === true,
    noNewGenerationRequest: rec.requests.length === 0,
};
rec.verdict = Object.values(rec.checks).every(Boolean) ? "PASS" : "PARTIAL";
rec.endedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, "receipt.json"), JSON.stringify(rec, null, 1));
console.log(JSON.stringify({ verdict: rec.verdict, checks: rec.checks, task: rec.storeAfterReload.task, resultBytes: rec.resultBytes, download: rec.download, asset: rec.save?.asset, assetBytes: rec.save?.assetBytes, canvasNode: rec.send?.canvasNode, reload: rec.afterReload, requests: rec.requests }, null, 1));
await ctx.close();
