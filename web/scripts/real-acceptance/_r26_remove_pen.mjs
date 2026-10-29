/**
 * r26：REMOVE_PEN 真实 UI 全链路（生成 → fresh reload → 下载/存资产/发画布）
 * 只用真实 UI + 真实上游；不做任何结果注入。
 * 环境变量：
 *   IC_BASE_URL   默认 http://127.0.0.1:3000
 *   IC_PROFILE    持久化 profile 目录（字节留档，可复核）
 *   IC_OUT        证据输出目录
 *   IC_INPUT      输入图片绝对路径
 *   IC_CFG        ai_config_store JSON 文件
 */
import { chromium } from "../../node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const BASE = process.env.IC_BASE_URL ?? "http://127.0.0.1:3000";
const PROFILE = process.env.IC_PROFILE ?? "/Users/mac/Documents/Dev/infinite-canvas/.acceptance-profile/r26";
const OUT = process.env.IC_OUT ?? "/tmp/r26/out";
const INPUT = process.env.IC_INPUT ?? "/tmp/r26/apple_1024.jpg";
const CFG_PATH = process.env.IC_CFG ?? "/tmp/r26/cfg.json";

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PROFILE, { recursive: true });
const cfgRaw = fs.readFileSync(CFG_PATH, "utf8");
const cfgMeta = JSON.parse(fs.readFileSync("/tmp/r26/cfg_meta.json", "utf8"));
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const rec = {
    startedAt: new Date().toISOString(),
    baseUrl: BASE,
    profile: PROFILE,
    input: { file: path.basename(INPUT), bytes: fs.statSync(INPUT).size, sha256: sha256(fs.readFileSync(INPUT)) },
    config: { baseUrl: cfgMeta.baseUrl, model: cfgMeta.model, size: "1:1", quality: "low", proxyEnabled: false },
    requests: [],
    responses: [],
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
    const openDb = (dbName) =>
        new Promise((res, rej) => {
            const open = indexedDB.open(dbName);
            open.onsuccess = () => res(open.result);
            open.onerror = () => rej(open.error);
        });
    const ensureStore = async (dbName, storeName) => {
        let db = await openDb(dbName);
        if (!db.objectStoreNames.contains(storeName)) {
            const v = db.version + 1;
            db.close();
            db = await new Promise((res, rej) => {
                const up = indexedDB.open(dbName, v);
                up.onupgradeneeded = () => up.result.createObjectStore(storeName);
                up.onsuccess = () => res(up.result);
                up.onerror = () => rej(up.error);
            });
        }
        return db;
    };
    window.__r26 = {
        idbAll,
        /** 配置落库：应用的 persist 走 localForage(app_state)，localStorage 只是兜底，必须写 IDB 才生效。 */
        async setConfig(raw) {
            localStorage.setItem("infinite-canvas:ai_config_store", raw);
            const db = await ensureStore("infinite-canvas", "app_state");
            await new Promise((res, rej) => {
                const tx = db.transaction("app_state", "readwrite");
                tx.objectStore("app_state").put(raw, "infinite-canvas:ai_config_store");
                tx.oncomplete = () => {
                    db.close();
                    res(true);
                };
                tx.onerror = () => {
                    db.close();
                    rej(tx.error);
                };
            });
            return true;
        },
        async media(storeName, key) {
            const rows = await idbAll("infinite-canvas", storeName);
            const hit = rows.find((r) => r.key === key);
            if (!hit) return { found: false, keys: rows.map((r) => r.key).slice(-5) };
            const v = hit.value;
            if (v instanceof Blob) {
                const ab = await v.arrayBuffer();
                return {
                    found: true,
                    size: v.size,
                    type: v.type,
                    sha256: await shaHex(ab),
                    b64: await blobToB64(new Blob([ab])),
                };
            }
            return { found: true, scalar: true, json: JSON.stringify(v).slice(0, 400) };
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
const pendingBodies = [];
cdp.on("Network.requestWillBeSent", (e) => {
    const u = e.request?.url ?? "";
    if (!/\/v1\/images\/(edits|generations)/.test(u)) return;
    pendingBodies.push(
        (async () => {
            const entry = { method: e.request?.method, url: u.split("?")[0], at: new Date().toISOString() };
            try {
                const { postData } = await cdp.send("Network.getRequestPostData", { requestId: e.requestId });
                const body = postData ?? "";
                const buf = Buffer.from(body, "utf8");
                entry.cdpBodyBytes = buf.length;
                entry.cdpBodySha256 = sha256(buf);
                entry.multipartParts = (body.match(/^--[^\r\n]+$/gm) ?? []).length;
                entry.imageParts = (body.match(/name="image(\[\])?"/g) ?? []).length;
                const mModel = body.match(/name="model"\r\n\r\n([^\r\n]*)/);
                if (mModel) entry.modelField = mModel[1];
                const mSize = body.match(/name="size"\r\n\r\n([^\r\n]*)/);
                if (mSize) entry.sizeField = mSize[1];
                const mPrompt = body.match(/name="prompt"\r\n\r\n([\s\S]*?)\r\n--/);
                if (mPrompt) {
                    entry.prompt = mPrompt[1];
                    entry.promptSha256 = sha256(Buffer.from(mPrompt[1], "utf8"));
                    entry.promptBytes = Buffer.byteLength(mPrompt[1]);
                }
                const mQual = body.match(/name="quality"\r\n\r\n([^\r\n]*)/);
                if (mQual) entry.qualityField = mQual[1];
            } catch (err) {
                entry.bodyError = String(err).slice(0, 160);
            }
            rec.requests.push(entry);
            console.log("[cdp-request]", entry.method, entry.url, entry.cdpBodyBytes, "B", "parts=", entry.multipartParts, "imgs=", entry.imageParts);
        })(),
    );
});

page.on("console", (m) => {
    const t = m.text();
    if (/error|failed|errored/i.test(t)) console.log("[console]", t.slice(0, 240));
});
page.on("response", async (r) => {
    const u = r.url();
    if (!/\/v1\/images\/(edits|generations)/.test(u)) return;
    try {
        const body = await r.body();
        const text = body.toString("utf8");
        let shape = {};
        try {
            const j = JSON.parse(text);
            shape = {
                jsonKeys: Object.keys(j),
                b64Len: typeof j?.data?.[0]?.b64_json === "string" ? j.data[0].b64_json.length : 0,
                url: typeof j?.data?.[0]?.url === "string" ? j.data[0].url.slice(0, 100) : "",
                error: j?.error ? String(JSON.stringify(j.error)).slice(0, 200) : "",
            };
        } catch {
            shape = { notJson: text.slice(0, 160) };
        }
        rec.responses.push({ status: r.status(), bytes: body.length, sha256: sha256(body), ...shape, at: new Date().toISOString() });
        console.log("[response]", r.status(), body.length, "B", JSON.stringify(shape).slice(0, 200));
    } catch (e) {
        rec.responses.push({ status: r.status(), bodyError: String(e).slice(0, 120) });
    }
});

// ---- 1) 配置 + 打开工具页 ----
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.evaluate((cfg) => window.__r26.setConfig(cfg), cfgRaw);
await page.goto(BASE + "/tools/smart-edit/remove-pen", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
rec.pageUrl = page.url();

// ---- 2) 真实上传公网图片 ----
// 页面若从草稿恢复出上一轮的图片，会直接进入"已载入"态，此时空态上传控件不在 DOM 里
// （mask.tsx 仅在 image == null 时渲染 ToolAssetInput）。先走真实的「重新上传」按钮回到空态，
// 再通过空态的文件选择控件上传，全程只用真实 UI。
if ((await page.locator("input[data-testid=tool-asset-file-input]").count()) === 0) {
    const resetImage = page.locator("[data-testid=remove-pen-reset-image]");
    if ((await resetImage.count()) > 0) {
        await resetImage.click();
        await page.waitForSelector("input[data-testid=tool-asset-file-input]", { timeout: 15000 });
    }
}
await page.setInputFiles("input[data-testid=tool-asset-file-input]", INPUT);
await page.waitForSelector("[data-testid=remove-pen-canvas]", { timeout: 90000 });
await page.waitForTimeout(2000);
const canvasBox = await page.locator("[data-testid=remove-pen-canvas]").boundingBox();

// ---- 3) 真实涂抹蒙版（覆盖苹果红色区域 bbox 11%–87% × 12%–97%）----
const X0 = 0.16, X1 = 0.82, Y0 = 0.15, Y1 = 0.93;
let flip = false;
for (let fx = X0; fx <= X1 + 1e-6; fx += 0.035) {
    const x = canvasBox.x + canvasBox.width * fx;
    const ya = canvasBox.y + canvasBox.height * (flip ? Y1 : Y0);
    const yb = canvasBox.y + canvasBox.height * (flip ? Y0 : Y1);
    await page.mouse.move(x, ya);
    await page.mouse.down();
    const steps = 14;
    for (let i = 1; i <= steps; i++) await page.mouse.move(x, ya + ((yb - ya) * i) / steps);
    await page.mouse.up();
    flip = !flip;
}
await page.waitForTimeout(900);
rec.mask = {
    canvasBox: { w: Math.round(canvasBox.width), h: Math.round(canvasBox.height) },
    coverageText: await page.evaluate(() => document.querySelector("[data-testid=mask-coverage]")?.textContent ?? null),
};

// ---- 4) 提交并轮询终态 ----
const submit = page.locator("[data-testid=remove-pen-submit]");
rec.submitDisabledBefore = await submit.isDisabled();
if (rec.submitDisabledBefore) {
    rec.submitBlockReason = await page.evaluate(() => {
        const b = document.querySelector("[data-testid=remove-pen-submit]");
        return b?.getAttribute("title") ?? b?.getAttribute("aria-disabled") ?? null;
    });
} else {
    await submit.click();
}
rec.submittedAt = new Date().toISOString();

const deadline = Date.now() + 10 * 60 * 1000;
let task = null;
while (Date.now() < deadline) {
    task = await page.evaluate(() => {
        const keys = Object.keys(localStorage).filter((k) => k.startsWith("tool-task:v1:task-"));
        const tasks = keys
            .map((k) => {
                try {
                    return JSON.parse(localStorage.getItem(k));
                } catch {
                    return null;
                }
            })
            .filter(Boolean)
            .filter((t) => (t.toolId || "").includes("remove-pen"))
            .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
        return tasks[0]
            ? {
                  id: tasks[0].id,
                  status: tasks[0].status,
                  createdAt: tasks[0].createdAt,
                  finishedAt: tasks[0].finishedAt ?? null,
                  error: tasks[0].error ? String(JSON.stringify(tasks[0].error)).slice(0, 240) : null,
                  prompt: tasks[0].request?.prompt ? String(tasks[0].request.prompt).slice(0, 300) : null,
                  items: (tasks[0].result?.items ?? []).map((i) => ({
                      kind: i.kind,
                      storageKey: i.storageKey,
                      bytes: i.bytes,
                      dataUrlLen: i.dataUrl ? i.dataUrl.length : 0,
                      url: (i.url || "").slice(0, 60),
                      payloadDropped: !!i.payloadDropped,
                  })),
              }
            : null;
    });
    if (task && ["succeeded", "failed", "cancelled"].includes(task.status)) break;
    await page.waitForTimeout(4000);
}
rec.task = task;
rec.finishedAt = new Date().toISOString();
if (!task || task.status !== "succeeded") {
    rec.verdict = "GENERATION_FAILED";
    fs.writeFileSync(path.join(OUT, "receipt.json"), JSON.stringify(rec, null, 1));
    await page.screenshot({ path: path.join(OUT, "fail-generation.png") }).catch(() => {});
    console.log(JSON.stringify({ verdict: rec.verdict, task, responses: rec.responses }, null, 1));
    await ctx.close();
    process.exit(2);
}

// ---- 5) 取真实字节（IndexedDB media_files）----
const storageKey = task.items.find((i) => i.storageKey)?.storageKey ?? null;
rec.resultStorageKey = storageKey;
const media = storageKey ? await page.evaluate((k) => window.__r26.media("media_files", k), storageKey) : { found: false };
rec.resultBytes = { found: media.found, size: media.size ?? 0, type: media.type ?? "", sha256: media.sha256 ?? null };
if (media.found && media.b64) {
    const buf = Buffer.from(media.b64, "base64");
    fs.writeFileSync(path.join(OUT, "result.png"), buf);
    rec.resultBytes.fileSha256 = sha256(buf);
    rec.resultBytes.fileBytes = buf.length;
}
await page.screenshot({ path: path.join(OUT, "01-after-generate.png") });

// ---- 6) 同一文档 fresh reload ----
const navBefore = await page.evaluate(() => performance.getEntriesByType("navigation")[0]?.type ?? "");
const reloadResp = await page.reload({ waitUntil: "domcontentloaded" });
rec.reload = { beforeType: navBefore, status: reloadResp ? reloadResp.status() : null, at: new Date().toISOString() };
await page.waitForSelector("[data-testid=remove-pen-workspace]", { timeout: 60000 });
await page.waitForTimeout(3000);
rec.afterReload = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const img = document.querySelector('[data-testid=remove-pen-result-feedback]')?.closest("div")?.parentElement?.querySelector("img[alt='消除结果']") ?? document.querySelector("img[alt='消除结果']");
    const btn = (id) => document.querySelector(`[data-testid=${id}]`);
    return {
        navType: nav?.type ?? null,
        resultImg: img ? { srcScheme: (img.currentSrc || img.src || "").split(":")[0], naturalW: img.naturalWidth, naturalH: img.naturalHeight, complete: img.complete } : null,
        downloadHrefScheme: (btn("remove-pen-download")?.getAttribute("href") || "").split(":")[0],
        saveDisabled: btn("remove-pen-save")?.disabled ?? null,
        sendDisabled: btn("remove-pen-send")?.disabled ?? null,
        feedback: btn("remove-pen-result-feedback")?.textContent ?? null,
        taskSnapshotKeys: Object.keys(localStorage).filter((k) => k.startsWith("tool-task:v1:task-")).length,
    };
});
await page.screenshot({ path: path.join(OUT, "02-after-reload.png") });

// ---- 7) 下载 ----
const dlAnchor = page.locator("[data-testid=remove-pen-download]");
let dlSha = null;
try {
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), dlAnchor.click()]);
    const target = path.join(OUT, "download" + (download.suggestedFilename().match(/\.[a-z0-9]+$/i)?.[0] ?? ".bin"));
    await download.saveAs(target);
    const buf = fs.readFileSync(target);
    dlSha = sha256(buf);
    rec.download = { via: "playwright-download", suggested: download.suggestedFilename(), file: path.basename(target), bytes: buf.length, sha256: dlSha };
} catch (e) {
    const href = await dlAnchor.getAttribute("href");
    const got = await page.evaluate(async () => {
        const a = document.querySelector("[data-testid=remove-pen-download]");
        const r = await fetch(a.href);
        const b = await r.blob();
        const ab = await b.arrayBuffer();
        let bin = "";
        const u8 = new Uint8Array(ab);
        for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
        return { ok: r.ok, status: r.status, size: b.size, type: b.type, b64: btoa(bin) };
    });
    const buf = Buffer.from(got.b64, "base64");
    fs.writeFileSync(path.join(OUT, "download-via-anchor.bin"), buf);
    dlSha = sha256(buf);
    rec.download = { via: "anchor-fetch", hrefScheme: (href || "").split(":")[0], status: got.status, bytes: buf.length, sha256: dlSha, note: String(e).slice(0, 120) };
}
rec.download.matchesResultBytes =
    !!rec.resultBytes.sha256 && (dlSha === rec.resultBytes.sha256 || dlSha === rec.resultBytes.fileSha256);

// ---- 8) 存入资产 ----
await page.locator("[data-testid=remove-pen-save]").click();
await page.waitForTimeout(6000);
rec.save = { feedback: await page.evaluate(() => document.querySelector("[data-testid=remove-pen-result-feedback]")?.textContent ?? null) };
const stores1 = await page.evaluate(() => window.__r26.stores());
if (stores1.assetStore) {
    const assets = stores1.assetStore.assets ?? [];
    const newest = [...assets].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0];
    rec.save.asset = newest
        ? {
              assetId: newest.id,
              title: newest.title,
              kind: newest.kind,
              storageKey: newest.data?.storageKey ?? null,
              bytes: newest.data?.bytes ?? null,
              mimeType: newest.data?.mimeType ?? null,
              stale: !!newest.stale,
              updatedAt: newest.updatedAt,
              totalAssets: assets.length,
          }
        : null;
    if (newest?.data?.storageKey) {
        const m = await page.evaluate((k) => window.__r26.media("image_files", k), newest.data.storageKey);
        rec.save.assetBytes = { found: m.found, size: m.size ?? 0, sha256: m.sha256 ?? null };
        if (m.found && m.b64) fs.writeFileSync(path.join(OUT, "asset-blob.bin"), Buffer.from(m.b64, "base64"));
        rec.save.assetBytes.matchesResult =
            !!rec.resultBytes.sha256 && (m.sha256 === rec.resultBytes.sha256 || m.sha256 === rec.resultBytes.fileSha256);
    }
}
await page.screenshot({ path: path.join(OUT, "03-after-save.png") });

// ---- 9) 发送画布 ----
await page.locator("[data-testid=remove-pen-send]").click();
await page.waitForTimeout(6000);
rec.send = { feedback: await page.evaluate(() => document.querySelector("[data-testid=remove-pen-result-feedback]")?.textContent ?? null) };
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
        const m = await page.evaluate((k) => window.__r26.media("image_files", k), rec.send.canvasNode.storageKey);
        let mm = m;
        if (!m.found) mm = await page.evaluate((k) => window.__r26.media("media_files", k), rec.send.canvasNode.storageKey);
        rec.send.canvasNode.bytes = mm.size ?? 0;
        rec.send.canvasNode.sha256 = mm.sha256 ?? null;
        rec.send.canvasNode.matchesResult =
            !!rec.resultBytes.sha256 && (mm.sha256 === rec.resultBytes.sha256 || mm.sha256 === rec.resultBytes.fileSha256);
    }
}
await page.screenshot({ path: path.join(OUT, "04-after-send.png") });
rec.canvasUrl = BASE + "/canvas";

// ---- 10) 判定 ----
await Promise.all(pendingBodies).catch(() => {});
const checks = {
    generationSucceeded: rec.task?.status === "succeeded",
    realBytesPresent: (rec.resultBytes?.fileBytes ?? 0) > 1000,
    freshReload: rec.afterReload?.navType === "reload",
    resultVisibleAfterReload: (rec.afterReload?.resultImg?.naturalW ?? 0) > 0,
    downloadOk: rec.download?.matchesResultBytes === true,
    assetSaved: !!rec.save?.asset?.assetId,
    assetBytesMatch: rec.save?.assetBytes?.matchesResult === true,
    canvasSent: !!rec.send?.canvasNode?.canvasNodeId,
    canvasBytesMatch: rec.send?.canvasNode?.matchesResult === true,
};
rec.checks = checks;
rec.verdict = Object.values(checks).every(Boolean) ? "PASS" : "PARTIAL";
rec.endedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, "receipt.json"), JSON.stringify(rec, null, 1));
console.log(
    JSON.stringify(
        {
            verdict: rec.verdict,
            checks,
            taskId: rec.task?.id,
            status: rec.task?.status,
            storageKey: rec.resultStorageKey,
            resultBytes: rec.resultBytes,
            download: rec.download,
            asset: rec.save?.asset,
            assetBytes: rec.save?.assetBytes,
            canvasNode: rec.send?.canvasNode,
            requests: rec.requests,
            responses: rec.responses,
            reload: rec.afterReload,
            mask: rec.mask,
        },
        null,
        1,
    ),
);
await ctx.close();
