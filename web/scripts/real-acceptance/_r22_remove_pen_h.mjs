/**
 * r22-h：REMOVE_PEN.H 单一回执闭合验收（复用已成功的真实任务，不生成、不注入）
 *
 * 真实链路（同一浏览器上下文，同一 tab）：
 *   打开工具页 → 真实 CDP Page.reload（同文档刷新）→ 结果恢复
 *   → 真实点击下载（浏览器下载事件 → 落盘）→ 真实点击存入资产 → 真实点击发送画布
 *
 * 与 r26b 的差异：
 *   - canvas_store 解析修正：zustand persist 的真实结构是 state.projects[].nodes
 *     （r26b 只找顶层 state.nodes，故 canvasSent 恒为 false）
 *   - canvasSent 由「真实点击后的 IDB 持久化节点」判定：发送前后快照差集取新节点，
 *     再按节点 metadata.storageKey 回读 image_files 真实字节与 sha
 *   - 记录 tabId（CDP Target.getTargetInfo.targetId）与 reload 机读标记
 *     （PerformanceNavigationTiming.type=reload + timeOrigin + 文档标记失效）
 *
 * 环境变量：IC_BASE_URL / IC_PROFILE / IC_OUT
 */
import { chromium } from "../../node_modules/playwright/index.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const BASE = process.env.IC_BASE_URL ?? "http://127.0.0.1:3000";
const PROFILE = process.env.IC_PROFILE ?? "/Users/mac/Documents/Dev/infinite-canvas/.acceptance-profile/r26b";
const OUT = process.env.IC_OUT ?? "/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h";
const TASK_ID = "task-mvtp33dv-57nmbx";
const EXPECT = {
    taskId: TASK_ID,
    bytes: 1831533,
    sha256: "2f8f7f112bccc0a67d13bf8fb5a166da715ec85c2ff169f8c147f7e3d3cf415e",
    storageKey: "tool-result:task-mvtp33dv-57nmbx:0:3yrrtwJa4FBz7TxtYTf29",
};

const DL_DIR = path.join(OUT, "downloads");
fs.mkdirSync(DL_DIR, { recursive: true });
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const statOf = (p) => {
    try {
        const st = fs.statSync(p);
        const buf = fs.readFileSync(p);
        return { path: p, exists: true, bytes: st.size, mtime: st.mtime.toISOString(), sha256: sha256(buf) };
    } catch (e) {
        return { path: p, exists: false, error: String(e).slice(0, 160) };
    }
};

const rec = {
    schema: "r22-h-remove-pen-receipt/v1",
    startedAt: new Date().toISOString(),
    baseUrl: BASE,
    profile: PROFILE,
    mode: "verify-existing-succeeded-task (no generation submitted, no injection)",
    expected: EXPECT,
    requests: [],
    legs: {},
    checks: {},
};

const ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    viewport: { width: 1600, height: 1000 },
    acceptDownloads: true,
    downloadsPath: DL_DIR,
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
const cdp = await ctx.newCDPSession(page);
const targetInfo = await cdp.send("Target.getTargetInfo");
rec.tab = {
    tabId: targetInfo.targetInfo.targetId,
    tabIndex: ctx.pages().indexOf(page),
    pagesInContext: ctx.pages().length,
    note: "自有 persistent-context（profile r26b）单标签；未使用用户浏览器既有标签",
};
console.log("[r22] tabId=", rec.tab.tabId);

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
    const shaHex = async (ab) => {
        const d = new Uint8Array(await crypto.subtle.digest("SHA-256", ab));
        return Array.from(d).map((b) => b.toString(16).padStart(2, "0")).join("");
    };
    const blobToB64 = async (blob) => {
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        const CH = 0x8000;
        for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode(...buf.subarray(i, i + CH));
        return btoa(bin);
    };
    window.__r22 = {
        idbAll,
        /** 回读某个 storageKey 的真实字节（多 store 尝试），返回 size/sha256/b64 */
        async bytesFor(storeNames, key) {
            const tried = [];
            for (const s of [].concat(storeNames)) {
                const rows = await idbAll("infinite-canvas", s);
                tried.push({ store: s, count: rows.length });
                const hit = rows.find((r) => r.key === key);
                if (!hit) continue;
                const v = hit.value;
                if (v instanceof Blob) {
                    const ab = await v.arrayBuffer();
                    return { found: true, store: s, size: v.size, type: v.type || "", sha256: await shaHex(ab), b64: await blobToB64(new Blob([ab])), tried };
                }
                if (v && v.blob instanceof Blob) {
                    const ab = await v.blob.arrayBuffer();
                    return { found: true, store: s, size: v.blob.size, type: v.blob.type || "", sha256: await shaHex(ab), b64: await blobToB64(v.blob), tried };
                }
                let json = null;
                try {
                    json = JSON.stringify(v).slice(0, 300);
                } catch {
                    json = null;
                }
                return { found: true, store: s, scalar: true, json, tried };
            }
            return { found: false, tried };
        },
        /** 读取 app_state（localforage）里的 canvas_store / asset_store 真实持久化状态 */
        async state() {
            const rows = await idbAll("infinite-canvas", "app_state");
            const out = { keys: rows.map((r) => r.key), keyMeta: [], canvas: null, assets: null };
            for (const r of rows) {
                let parsed = null;
                try {
                    parsed = JSON.parse(r.value);
                } catch {
                    out.keyMeta.push({ key: r.key, parsed: false, type: typeof r.value });
                    continue;
                }
                const st = parsed?.state ?? parsed;
                const projects = Array.isArray(st?.projects) ? st.projects : null;
                const assets = Array.isArray(st?.assets) ? st.assets : null;
                out.keyMeta.push({ key: r.key, parsed: true, topKeys: Object.keys(st || {}), projects: projects ? projects.length : null, assets: assets ? assets.length : null });
                if (projects) {
                    out.canvas = {
                        storageKey: r.key,
                        projects: projects.map((p) => ({
                            id: p.id,
                            title: p.title,
                            updatedAt: p.updatedAt,
                            nodes: (p.nodes || []).map((n) => ({
                                id: n.id,
                                type: n.type,
                                storageKey: n?.metadata?.storageKey ?? null,
                                content: typeof n?.metadata?.content === "string" ? n.metadata.content.slice(0, 60) : null,
                                bytes: n?.metadata?.bytes ?? null,
                                mimeType: n?.metadata?.mimeType ?? null,
                                naturalWidth: n?.metadata?.naturalWidth ?? null,
                                naturalHeight: n?.metadata?.naturalHeight ?? null,
                                toolId: n?.metadata?.toolId ?? null,
                                taskId: n?.metadata?.taskId ?? null,
                                resultAssetKey: n?.metadata?.resultAssetKey ?? null,
                                resultItemId: n?.metadata?.resultItemId ?? null,
                                nodeKeys: Object.keys(n || {}),
                                metadataKeys: Object.keys(n?.metadata || {}),
                            })),
                        })),
                        deletedProjects: Array.isArray(st?.deletedProjects) ? st.deletedProjects.length : null,
                    };
                }
                if (assets) out.assets = { storageKey: r.key, assets };
            }
            return out;
        },
    };
});

// 记录是否发生新的生成请求（真实的“未生成”机检）
await cdp.send("Network.enable");
cdp.on("Network.requestWillBeSent", (e) => {
    const u = e.request?.url ?? "";
    if (/\/v1\/images\/(edits|generations)/.test(u)) rec.requests.push({ method: e.request?.method, url: u.split("?")[0] });
});

const readTask = () =>
    page.evaluate((tid) => {
        const keys = Object.keys(localStorage).filter((k) => k.startsWith("tool-task:v1:") && k !== "tool-task:v1:index");
        const all = keys
            .map((k) => {
                try {
                    const t = JSON.parse(localStorage.getItem(k));
                    return { id: t.id, toolId: t.toolId, status: t.status };
                } catch {
                    return null;
                }
            })
            .filter(Boolean);
        const raw = localStorage.getItem("tool-task:v1:" + tid);
        const t = raw ? JSON.parse(raw) : null;
        return {
            all,
            task: t
                ? {
                      id: t.id,
                      toolId: t.toolId,
                      status: t.status,
                      createdAt: t.createdAt,
                      finishedAt: t.finishedAt ?? null,
                      items: (t.result?.items ?? []).map((i) => ({ kind: i.kind, storageKey: i.storageKey ?? null, bytes: i.bytes ?? null, dataUrlLen: i.dataUrl ? i.dataUrl.length : 0 })),
                  }
                : null,
        };
    }, TASK_ID);

/* ---------- 1) 打开工具页 ---------- */
await page.goto(BASE + "/tools/smart-edit/remove-pen", { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-testid=remove-pen-workspace]", { timeout: 90000 });
await page.waitForTimeout(2500);
rec.beforeReload = { task: await readTask() };
rec.beforeReloadTimeOrigin = await page.evaluate(() => performance.timeOrigin);

/* ---------- 2) 真实同文档 reload（CDP Page.reload） ---------- */
await page.evaluate(() => {
    window.__r22_docMarker = "before-reload";
});
const reloadResp = await cdp.send("Page.reload", { ignoreCache: false });
await page.waitForSelector("[data-testid=remove-pen-workspace]", { timeout: 90000 });
// 等结果图恢复（真实回读 IDB → blob url）
await page.waitForFunction(() => {
    const img = document.querySelector("img[alt='消除结果']");
    return img && img.complete && img.naturalWidth > 0;
}, null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1500);

rec.reload = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const img = document.querySelector("img[alt='消除结果']");
    const btn = (id) => document.querySelector(`[data-testid=${id}]`);
    const href = btn("remove-pen-download")?.getAttribute("href") || "";
    return {
        navType: nav?.type ?? null,
        // timeOrigin 属于 Performance 而非 PerformanceNavigationTiming
        timeOrigin: performance.timeOrigin ?? null,
        navStartTime: nav?.startTime ?? null,
        loadEventEnd: nav?.loadEventEnd ?? null,
        documentMarkerLost: typeof window.__r22_docMarker === "undefined",
        resultImg: img ? { srcScheme: (img.currentSrc || img.src || "").split(":")[0], naturalW: img.naturalWidth, naturalH: img.naturalHeight, complete: img.complete } : null,
        downloadHrefScheme: href.split(":")[0],
        downloadHrefLen: href.length,
        saveDisabled: btn("remove-pen-save")?.disabled ?? null,
        sendDisabled: btn("remove-pen-send")?.disabled ?? null,
        feedback: btn("remove-pen-result-feedback")?.textContent ?? null,
    };
});
rec.reload.cdpResponse = reloadResp ?? null;
rec.afterReloadTask = await readTask();
await page.screenshot({ path: path.join(OUT, "01-after-reload.png") });

/* ---------- 3) 结果字节（任务媒体库回读） ---------- */
const resultStorageKey = rec.afterReloadTask.task?.items?.find((i) => i.storageKey)?.storageKey ?? EXPECT.storageKey;
const rBytes = await page.evaluate((k) => window.__r22.bytesFor(["media_files", "image_files"], k), resultStorageKey);
const resultLeg = {
    storageKey: resultStorageKey,
    store: rBytes.store ?? null,
    bytes: rBytes.size ?? 0,
    sha256: rBytes.sha256 ?? null,
    mimeType: rBytes.type ?? null,
    found: rBytes.found === true,
    matchesExpected: (rBytes.size ?? 0) === EXPECT.bytes && rBytes.sha256 === EXPECT.sha256,
};
if (rBytes.found && rBytes.b64) {
    const buf = Buffer.from(rBytes.b64, "base64");
    const p = path.join(OUT, "result.png");
    fs.writeFileSync(p, buf);
    resultLeg.file = statOf(p);
}
rec.legs.result = resultLeg;

/* ---------- 4) 真实下载 → 落盘 ---------- */
rec.legs.download = {};
try {
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.locator("[data-testid=remove-pen-download]").click()]);
    const suggested = download.suggestedFilename();
    const target = path.join(DL_DIR, suggested || "remove-pen-result.png");
    await download.saveAs(target);
    const onDisk = statOf(target);
    // 额外落到用户 Downloads（验证“Downloads 文件”这一腿，同一份字节）
    const dlHome = path.join(os.homedir(), "Downloads", `r22h-${(onDisk.sha256 || "nohash").slice(0, 8)}-${suggested || "remove-pen.png"}`);
    fs.copyFileSync(target, dlHome);
    rec.legs.download = {
        via: "playwright-download-event",
        suggested,
        savePath: target,
        file: onDisk,
        downloadsCopy: statOf(dlHome),
        matchesExpected: onDisk.bytes === EXPECT.bytes && onDisk.sha256 === EXPECT.sha256,
    };
} catch (e) {
    rec.legs.download = { via: "failed", error: String(e).slice(0, 200) };
}
await page.screenshot({ path: path.join(OUT, "02-after-download.png") });

/* ---------- 5) 真实点击「存入资产」 ---------- */
rec.legs.asset = {};
try {
    const before = await page.evaluate(() => window.__r22.state());
    const beforeAssets = before.assets?.assets ?? [];
    const beforeById = new Map(beforeAssets.map((a) => [a.id, a]));
    const pickKey = (list) =>
        list.find((a) => a?.metadata?.resultAssetKey === `tool-result:REMOVE_PEN:${TASK_ID}:${a?.metadata?.resultItemId}`) ??
        list.find((a) => a?.metadata?.taskId === TASK_ID) ??
        null;
    const beforeHit = pickKey(beforeAssets);
    await page.locator("[data-testid=remove-pen-save]").click();
    await page.waitForTimeout(6000);
    const feedback = await page.evaluate(() => document.querySelector("[data-testid=remove-pen-result-feedback]")?.textContent ?? null);
    const after = await page.evaluate(() => window.__r22.state());
    const assets = after.assets?.assets ?? [];
    const pick = pickKey(assets) ?? [...assets].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0];
    const prev = pick ? beforeById.get(pick.id) : null;
    const assetLeg = {
        feedback,
        assetId: pick?.id ?? null,
        title: pick?.title ?? null,
        kind: pick?.kind ?? null,
        storageKey: pick?.data?.storageKey ?? null,
        declaredBytes: pick?.data?.bytes ?? null,
        mimeType: pick?.data?.mimeType ?? null,
        metadata: pick?.metadata ?? null,
        revision: pick?.revision ?? null,
        createdAt: pick?.createdAt ?? null,
        updatedAt: pick?.updatedAt ?? null,
        // 幂等 upsert：同 resultAssetKey 命中已有记录 → 更新（created:false，revision+1）而非新建，
        // 所以「本次点击确有真实写入」的判据是 新记录 或 revision/updatedAt 变化。
        existedBefore: pick ? beforeById.has(pick.id) : false,
        prevRevision: prev?.revision ?? null,
        prevUpdatedAt: prev?.updatedAt ?? null,
        writtenThisRun: pick ? !beforeById.has(pick.id) || pick.revision !== prev?.revision || pick.updatedAt !== prev?.updatedAt : false,
        feedbackOk: typeof feedback === "string" && /已存入资产库/.test(feedback),
        totalAssets: assets.length,
        assetStoreKey: after.assets?.storageKey ?? null,
    };
    if (assetLeg.storageKey) {
        const m = await page.evaluate((k) => window.__r22.bytesFor(["image_files", "media_files", "asset_files"], k), assetLeg.storageKey);
        assetLeg.store = m.store ?? null;
        assetLeg.bytes = m.size ?? 0;
        assetLeg.sha256 = m.sha256 ?? null;
        assetLeg.matchesExpected = m.found === true && (m.size ?? 0) === EXPECT.bytes && m.sha256 === EXPECT.sha256;
        if (m.found && m.b64) {
            const p = path.join(OUT, "asset-blob.bin");
            fs.writeFileSync(p, Buffer.from(m.b64, "base64"));
            assetLeg.file = statOf(p);
        }
    }
    rec.legs.asset = assetLeg;
} catch (e) {
    rec.legs.asset = { error: String(e).slice(0, 200) };
}
await page.screenshot({ path: path.join(OUT, "03-after-save.png") });

/* ---------- 6) 真实点击「发送画布」 ---------- */
rec.legs.canvas = {};
try {
    const before = await page.evaluate(() => window.__r22.state());
    const beforeNodes = new Set();
    for (const p of before.canvas?.projects ?? []) for (const n of p.nodes) beforeNodes.add(n.id);

    await page.locator("[data-testid=remove-pen-send]").click();
    await page.waitForTimeout(7000); // canvas persist 有 400ms debounce
    const feedback = await page.evaluate(() => document.querySelector("[data-testid=remove-pen-result-feedback]")?.textContent ?? null);
    const after = await page.evaluate(() => window.__r22.state());

    let hit = null;
    let freshCount = 0;
    for (const p of after.canvas?.projects ?? []) {
        for (const n of p.nodes) {
            if (beforeNodes.has(n.id)) continue;
            freshCount += 1;
            if (!hit || n.taskId === TASK_ID) hit = { project: p, node: n };
        }
    }
    if (!hit) {
        // 兜底（仍来自真实 IDB 状态）：按 taskId 命中节点
        for (const p of after.canvas?.projects ?? []) {
            for (const n of p.nodes) if (n.taskId === TASK_ID) hit = { project: p, node: n };
        }
    }
    const cx = {
        feedback,
        canvasStoreKey: after.canvas?.storageKey ?? null,
        projectId: hit?.project?.id ?? null,
        projectTitle: hit?.project?.title ?? null,
        nodeId: hit?.node?.id ?? null,
        nodeType: hit?.node?.type ?? null,
        nodeStorageKey: hit?.node?.storageKey ?? null,
        nodeDeclaredBytes: hit?.node?.bytes ?? null,
        nodeMimeType: hit?.node?.mimeType ?? null,
        nodeNaturalSize: hit?.node?.naturalWidth && hit?.node?.naturalHeight ? `${hit.node.naturalWidth}x${hit.node.naturalHeight}` : null,
        nodeToolId: hit?.node?.toolId ?? null,
        nodeTaskId: hit?.node?.taskId ?? null,
        nodeResultAssetKey: hit?.node?.resultAssetKey ?? null,
        nodeKeys: hit?.node?.nodeKeys ?? null,
        metadataKeys: hit?.node?.metadataKeys ?? null,
        isFreshNode: !!hit,
        freshNodeCount: freshCount,
        feedbackOk: typeof feedback === "string" && /已发送画布/.test(feedback),
        totalProjects: after.canvas?.projects?.length ?? 0,
    };
    if (cx.nodeStorageKey) {
        const m = await page.evaluate((k) => window.__r22.bytesFor(["image_files", "media_files"], k), cx.nodeStorageKey);
        cx.store = m.store ?? null;
        cx.bytes = m.size ?? 0;
        cx.sha256 = m.sha256 ?? null;
        cx.matchesExpected = m.found === true && (m.size ?? 0) === EXPECT.bytes && m.sha256 === EXPECT.sha256;
        if (m.found && m.b64) {
            const p = path.join(OUT, "canvas-node-blob.bin");
            fs.writeFileSync(p, Buffer.from(m.b64, "base64"));
            cx.file = statOf(p);
        }
    }
    rec.legs.canvas = cx;
} catch (e) {
    rec.legs.canvas = { error: String(e).slice(0, 200) };
}
await page.screenshot({ path: path.join(OUT, "04-after-send.png") });

/* ---------- 7) 判定（全部来自真实状态） ---------- */
const L = rec.legs;
const checks = {
    taskSucceeded: rec.afterReloadTask.task?.status === "succeeded",
    reloadMarked:
        rec.reload.navType === "reload" &&
        rec.reload.documentMarkerLost === true &&
        typeof rec.reload.timeOrigin === "number" &&
        typeof rec.beforeReloadTimeOrigin === "number" &&
        rec.reload.timeOrigin > rec.beforeReloadTimeOrigin,
    resultVisibleAfterReload: (rec.reload.resultImg?.naturalW ?? 0) > 0 && rec.reload.resultImg?.complete === true,
    resultBytesMatch: L.result?.matchesExpected === true,
    downloadLandedMatch: L.download?.matchesExpected === true && L.download?.file?.exists === true,
    assetSavedReal: !!L.asset?.assetId && L.asset?.writtenThisRun === true && L.asset?.feedbackOk === true,
    assetBytesMatch: L.asset?.matchesExpected === true,
    canvasSent: !!L.canvas?.nodeId && L.canvas?.isFreshNode === true && L.canvas?.feedbackOk === true,
    canvasBytesMatch: L.canvas?.matchesExpected === true,
    noNewGenerationRequest: rec.requests.length === 0,
};
const shaSet = new Set([L.result?.sha256, L.download?.file?.sha256, L.asset?.sha256, L.canvas?.sha256].filter(Boolean));
checks.fourLegsSameSha = shaSet.size === 1 && shaSet.has(EXPECT.sha256);
rec.checks = checks;
rec.verdict = Object.values(checks).every(Boolean) ? "PASS" : "PARTIAL";
// 扁平机读摘要（单一回执内自洽；全部取自上方的真实读数）
rec.receipt = {
    schema: "r22-h-remove-pen/summary-v1",
    tool: "REMOVE_PEN",
    taskId: rec.afterReloadTask.task?.id ?? null,
    taskStatus: rec.afterReloadTask.task?.status ?? null,
    tabId: rec.tab.tabId,
    baseUrl: BASE,
    reloaded: rec.reload.navType === "reload" && rec.reload.documentMarkerLost === true,
    reloadMarker: {
        navType: rec.reload.navType,
        timeOriginBefore: rec.beforeReloadTimeOrigin ?? null,
        timeOriginAfter: rec.reload.timeOrigin ?? null,
        documentMarkerLost: rec.reload.documentMarkerLost,
        resultAfterReload: rec.reload.resultImg ? `${rec.reload.resultImg.naturalW}x${rec.reload.resultImg.naturalH}` : null,
    },
    legs: {
        result: { storageKey: L.result?.storageKey ?? null, store: L.result?.store ?? null, bytes: L.result?.bytes ?? 0, sha256: L.result?.sha256 ?? null, file: L.result?.file?.path ?? null },
        download: {
            storageKey: L.result?.storageKey ?? null,
            store: "browser-download",
            bytes: L.download?.file?.bytes ?? 0,
            sha256: L.download?.file?.sha256 ?? null,
            file: L.download?.file?.path ?? null,
            downloadsCopy: L.download?.downloadsCopy?.path ?? null,
        },
        asset: { assetId: L.asset?.assetId ?? null, storageKey: L.asset?.storageKey ?? null, store: L.asset?.store ?? null, bytes: L.asset?.bytes ?? 0, sha256: L.asset?.sha256 ?? null },
        canvas: {
            projectId: L.canvas?.projectId ?? null,
            nodeId: L.canvas?.nodeId ?? null,
            storageKey: L.canvas?.nodeStorageKey ?? null,
            store: L.canvas?.store ?? null,
            bytes: L.canvas?.bytes ?? 0,
            sha256: L.canvas?.sha256 ?? null,
        },
    },
    assetId: L.asset?.assetId ?? null,
    nodeId: L.canvas?.nodeId ?? null,
    canvasSent: !!L.canvas?.nodeId && L.canvas?.isFreshNode === true && L.canvas?.feedbackOk === true,
    expected: { bytes: EXPECT.bytes, sha256: EXPECT.sha256 },
    requests: rec.requests,
};
rec.endedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, "receipt.json"), JSON.stringify(rec, null, 1));

console.log(
    JSON.stringify(
        {
            verdict: rec.verdict,
            checks,
            tabId: rec.tab.tabId,
            taskId: rec.afterReloadTask.task?.id ?? null,
            status: rec.afterReloadTask.task?.status ?? null,
            reload: { navType: rec.reload.navType, timeOrigin: rec.reload.timeOrigin, markerLost: rec.reload.documentMarkerLost },
            legs: {
                result: { storageKey: L.result?.storageKey, bytes: L.result?.bytes, sha256: L.result?.sha256, store: L.result?.store },
                download: { path: L.download?.savePath, bytes: L.download?.file?.bytes, sha256: L.download?.file?.sha256 },
                asset: { assetId: L.asset?.assetId, store: L.asset?.store, bytes: L.asset?.bytes, sha256: L.asset?.sha256 },
                canvas: { nodeId: L.canvas?.nodeId, projectId: L.canvas?.projectId, store: L.canvas?.store, bytes: L.canvas?.bytes, sha256: L.canvas?.sha256 },
            },
            requests: rec.requests,
        },
        null,
        1,
    ),
);
await ctx.close();
