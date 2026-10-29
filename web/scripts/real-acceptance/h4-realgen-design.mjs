/**
 * H4 真实生成（补取证）：NEW_REPLACE_BG_V2（商品图）/ REPLACE_GOODS（商品替换）。
 *
 * 边界（不接受 mock / 不注入历史）：
 * - 真 Chrome（channel: chrome）+ 真点击 + 真文件上传（setInputFiles 到真实 <input type=file>）；
 * - 真 provider：经本机 canvas-proxy http://127.0.0.1:23210，模型取 keychain 注入的 ccai gpt-image-2；
 * - 任务只由本页真实提交产生（记录点击前的 localStorage 任务键，提交后只认新键）；
 * - 结果字节从页面渲染的 result 图取回（data:/blob:/http），并与输入图 sha256 逐字节比对；
 * - 刷新后只从应用自身持久化读历史（tool-history-dock），不写任何任务快照。
 *
 * 用法：node h4-realgen-design.mjs NEW_REPLACE_BG_V2|REPLACE_GOODS|all
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { BASE_URL, EVIDENCE_ROOT, launchBrowser, sleep } from "./lib.mjs";
import { applyProviderConfig } from "./provider.mjs";

const FIXTURES = path.resolve("scripts/real-acceptance/fixtures");
const OUT = path.join(EVIDENCE_ROOT, "h4-design-realgen-20261029");
const MASK = "/tmp/h4gen/mask-watch.png";
const GEN_TIMEOUT_MS = Number(process.env.IC_GEN_TIMEOUT_MS || 900_000);

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

async function shot(page, name) {
    const file = path.join(OUT, name);
    await page.screenshot({ path: file, fullPage: false }).catch(() => null);
    return path.basename(file);
}

async function taskKeys(page) {
    return page.evaluate(() => {
        const keys = [];
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (key && key.startsWith("tool-task:v1:")) keys.push(key);
        }
        return keys;
    });
}

async function taskIds(page) {
    return page.evaluate(async () => {
        const ids = new Set();
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (key && key.startsWith("tool-task:v1:")) ids.add(key.slice("tool-task:v1:".length));
        }
        try {
            const mod = await import("/src/stores/use-tool-task-store.ts");
            for (const id of Object.keys(mod.useToolTaskStore.getState().tasks || {})) ids.add(id);
        } catch {
            /* 模块不可用时只用 localStorage */
        }
        return Array.from(ids);
    });
}

async function readTaskRecord(page, taskId) {
    return page.evaluate(async (id) => {
        const ls = (() => {
            try {
                return JSON.parse(localStorage.getItem(`tool-task:v1:${id}`) || "null");
            } catch {
                return null;
            }
        })();
        let live = null;
        try {
            const mod = await import("/src/stores/use-tool-task-store.ts");
            live = mod.useToolTaskStore.getState().tasks?.[id] ?? null;
        } catch {
            live = null;
        }
        return {
            localSnapshot: ls,
            live: live
                ? {
                      id: live.id,
                      toolId: live.toolId,
                      status: live.status,
                      createdAt: live.createdAt,
                      updatedAt: live.updatedAt,
                      prompt: live.prompt,
                      configSnapshot: live.configSnapshot,
                      sourceAssetIds: live.sourceAssetIds,
                      error: live.error,
                      upstreamTaskId: live.upstreamTaskId ?? null,
                      requestId: live.requestId ?? null,
                      result: live.result
                          ? {
                                items: (live.result.items || []).map((item) => ({
                                    id: item.id,
                                    kind: item.kind,
                                    mimeType: item.mimeType,
                                    url: item.url,
                                    storageKey: item.storageKey,
                                    bytes: item.bytes,
                                    width: item.width,
                                    height: item.height,
                                    payloadDropped: item.payloadDropped ?? false,
                                    hasDataUrl: Boolean(item.dataUrl),
                                    hasBlob: Boolean(item.blob),
                                })),
                            }
                          : null,
                  }
                : null,
        };
    }, taskId);
}

async function readLiveTask(page, toolId, beforeIds) {
    return page.evaluate(async ({ toolId, beforeIds }) => {
        let mod = null;
        try {
            mod = await import("/src/stores/use-tool-task-store.ts");
        } catch {
            return null;
        }
        const tasks = Object.values(mod.useToolTaskStore.getState().tasks || {});
        const fresh = tasks.filter(
            (t) => t && t.toolId === toolId && !beforeIds.includes(t.id) && ["succeeded", "failed", "cancelled"].includes(t.status),
        );
        if (fresh.length === 0) return null;
        const t = fresh[fresh.length - 1];
        return {
            id: t.id,
            toolId: t.toolId,
            status: t.status,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            prompt: t.prompt,
            configSnapshot: t.configSnapshot,
            sourceAssetIds: t.sourceAssetIds,
            error: t.error ?? null,
            upstreamTaskId: t.upstreamTaskId ?? null,
            requestId: t.requestId ?? null,
            items: (t.result?.items || []).map((item) => ({
                id: item.id,
                kind: item.kind,
                mimeType: item.mimeType,
                url: item.url,
                storageKey: item.storageKey,
                bytes: item.bytes,
                width: item.width,
                height: item.height,
            })),
        };
    }, { toolId, beforeIds });
}

async function waitForNewTask(page, toolId, beforeKeys, beforeIds = []) {
    const started = Date.now();
    const before = new Set(beforeKeys);
    while (Date.now() - started < GEN_TIMEOUT_MS) {
        const live = await readLiveTask(page, toolId, beforeIds);
        if (live) return { key: `live:${live.id}`, record: live, origin: "memory-store" };
        const keys = await taskKeys(page);
        const fresh = keys.filter((k) => !before.has(k));
        for (const key of fresh) {
            const record = await page.evaluate((k) => {
                try {
                    return JSON.parse(localStorage.getItem(k) || "null");
                } catch {
                    return null;
                }
            }, key);
            if (!record || record.toolId !== toolId) continue;
            if (["succeeded", "failed", "cancelled"].includes(record.status)) return { key, record };
            if (record.status === "running" || record.status === "queued") {
                // 继续等终态
            }
        }
        const state = await page.evaluate(() => {
            const nodes = Array.from(document.querySelectorAll('[data-testid^="tool-result"]'));
            return nodes.map((n) => n.getAttribute("data-testid")).slice(0, 8);
        });
        void state;
        await sleep(2000);
    }
    return null;
}

async function resultSrc(page) {
    return page.evaluate(() => {
        const img = document.querySelector('[data-testid="tool-result-image"]');
        return img ? img.getAttribute("src") || "" : "";
    });
}

async function fetchBytes(page, src) {
    if (!src) return null;
    if (src.startsWith("data:")) {
        const b64 = src.split(",")[1] || "";
        return Buffer.from(b64, "base64");
    }
    const arr = await page.evaluate(async (url) => {
        const res = await fetch(url);
        const ab = await res.arrayBuffer();
        return Array.from(new Uint8Array(ab));
    }, src);
    return Buffer.from(arr);
}

async function feedback(page) {
    return page.evaluate(() => {
        const node = document.querySelector('[data-testid="tool-result-feedback"]');
        return node ? (node.textContent || "").trim() : null;
    });
}

async function clickAction(page, testid, label) {
    const btn = await page.$(`[data-testid="${testid}"]`);
    if (!btn) return { label, ok: false, reason: "按钮不存在" };
    const disabled = await btn.isDisabled();
    if (disabled) return { label, ok: false, reason: "按钮 disabled" };
    await btn.click();
    for (let i = 0; i < 40; i += 1) {
        await sleep(500);
        const text = await feedback(page);
        if (text && /已/.test(text)) return { label, ok: true, feedback: text };
        const err = await page.$('[data-testid="tool-result"] [class*="destructive"]');
        void err;
    }
    return { label, ok: false, reason: "未出现反馈", feedback: await feedback(page) };
}

async function clickDownload(page, testid, label, dir) {
    const btn = await page.$(`[data-testid="${testid}"]`);
    if (!btn) return { label, ok: false, reason: "按钮不存在" };
    if (await btn.isDisabled()) return { label, ok: false, reason: "按钮 disabled" };
    const wait = page.waitForEvent("download", { timeout: 60_000 }).catch(() => null);
    await btn.click();
    const download = await wait;
    if (!download) return { label, ok: false, reason: "未触发下载事件", feedback: await feedback(page) };
    const file = path.join(dir, `${label}-${Date.now()}.png`);
    await download.saveAs(file);
    const buf = await fs.readFile(file);
    return { label, ok: true, suggestedFilename: download.suggestedFilename(), bytes: buf.length, sha256: sha(buf), savedAs: file };
}

async function dockState(page) {
    return page.evaluate(() => {
        const dock = document.querySelector('[data-testid="tool-history-dock"]');
        if (!dock) return { mounted: false };
        const items = Array.from(dock.querySelectorAll('[data-testid="tool-history-dock-item"]')).map((node) => ({
            taskId: node.getAttribute("data-task-id"),
            status: node.getAttribute("data-task-status"),
            summary: node.querySelector('[data-testid="tool-history-dock-summary"]')?.textContent?.trim() ?? "",
        }));
        const thumbs = Array.from(dock.querySelectorAll("img")).map((img) => ({
            src: (img.getAttribute("src") || "").slice(0, 120),
            width: img.naturalWidth,
            height: img.naturalHeight,
            decoded: img.complete && img.naturalWidth > 0,
        }));
        return {
            mounted: true,
            countText: dock.querySelector('[data-testid="tool-history-dock-count"]')?.textContent?.trim() ?? "",
            empty: Boolean(dock.querySelector('[data-testid="tool-history-dock-empty"]')),
            items,
            thumbs,
        };
    });
}

async function persistTasks(page, toolId, taskIds) {
    return page.evaluate((ids) => {
        const found = {};
        for (const id of ids) {
            try {
                found[id] = Boolean(localStorage.getItem(`tool-task:v1:${id}`));
            } catch {
                found[id] = false;
            }
        }
        return found;
    }, taskIds);
}

/* ------------------------------------------------------------------ */

async function runScene(page, report) {
    const dir = OUT;
    await page.goto(`${BASE_URL}/tools/product-design/new-replace-bg-v2`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="scene-workspace"]', { timeout: 60_000 });
    await sleep(1500);
    report.steps.push(await shot(page, "NEW_REPLACE_BG_V2-step1-loaded.png"));

    const inputs = page.locator('input[type="file"]');
    const inputCount = await inputs.count();
    report.uploadInputs = inputCount;
    await inputs.nth(0).setInputFiles(path.join(FIXTURES, "product-watch.jpg"));
    for (let i = 0; i < 40; i += 1) {
        if (await page.$('[data-testid="scene-goods-meta"]')) break;
        await sleep(500);
    }
    report.goodsMeta = (await page.textContent('[data-testid="scene-goods-meta"]').catch(() => null))?.trim() ?? null;

    await inputs.nth(1).setInputFiles(MASK);
    await sleep(2500);

    const confirm = await page.$('[data-testid="scene-cutout-confirm"]');
    if (confirm && !(await confirm.isDisabled())) await confirm.click();
    await sleep(800);
    report.cutoutState = (await page.textContent('[data-testid="scene-cutout-state"]').catch(() => null))?.trim() ?? null;
    report.issuesBefore = (await page.textContent('[data-testid="scene-issues"]').catch(() => null))?.trim() ?? null;
    report.steps.push(await shot(page, "NEW_REPLACE_BG_V2-step2-ready.png"));

    const gen = await page.$('[data-testid="scene-generate"]');
    report.submit = {
        found: Boolean(gen),
        disabled: gen ? await gen.isDisabled() : null,
        label: gen ? (await gen.textContent())?.trim() : null,
    };
    if (!gen || (await gen.isDisabled())) {
        report.verdict = "BLOCKED";
        report.blockedReason = "submit-disabled";
        return;
    }

    const beforeKeys = await taskKeys(page);
    const beforeIds = await taskIds(page);
    report.taskKeysBefore = beforeKeys.length;
    report.existingTaskIds = beforeIds;
    const startedAt = Date.now();
    await gen.click();
    report.submittedAt = new Date().toISOString();
    await sleep(4000);
    report.steps.push(await shot(page, "NEW_REPLACE_BG_V2-step3-submitted.png"));

    const found = await waitForNewTask(page, "NEW_REPLACE_BG_V2", beforeKeys, beforeIds);
    report.elapsedMs = Date.now() - startedAt;
    if (!found) {
        report.verdict = "BLOCKED";
        report.blockedReason = "no-task-record-after-submit";
        report.runError = (await page.textContent('[data-testid="scene-run-error"]').catch(() => null))?.trim() ?? null;
        return;
    }
    report.taskId = found.record.id;
    report.taskStatus = found.record.status;
    report.localTaskKey = found.key;
    report.taskOrigin = found.origin ?? "localStorage";
    report.taskRecord = await readTaskRecord(page, found.record.id);
    report.steps.push(await shot(page, "NEW_REPLACE_BG_V2-step4-result.png"));

    if (found.record.status !== "succeeded") {
        report.verdict = "FAIL";
        report.failure = {
            status: found.record.status,
            error: found.record.error ?? report.taskRecord?.live?.error ?? null,
            runError: (await page.textContent('[data-testid="scene-run-error"]').catch(() => null))?.trim() ?? null,
        };
        return;
    }

    const src = await resultSrc(page);
    report.resultSrcKind = src.startsWith("data:") ? "data" : src.startsWith("blob:") ? "blob" : src.startsWith("http") ? "http" : "missing";
    const bytes = await fetchBytes(page, src);
    if (bytes) {
        await fs.writeFile(path.join(dir, "NEW_REPLACE_BG_V2-result.png"), bytes);
        report.result = {
            bytes: bytes.length,
            sha256: sha(bytes),
            isPng: bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
        };
        const goodsBuf = await fs.readFile(path.join(FIXTURES, "product-watch.jpg"));
        report.inputDiff = {
            goodsSha256: sha(goodsBuf),
            goodsBytes: goodsBuf.length,
            maskSha256: sha(await fs.readFile(MASK)),
            resultDiffersFromGoods: sha(bytes) !== sha(goodsBuf),
        };
    }

    report.actions = {
        download: await clickDownload(page, "tool-result-download-0", "NEW_REPLACE_BG_V2-download", dir),
        saveAsset: await clickAction(page, "tool-result-save-0", "saveAsset"),
        sendCanvas: await clickAction(page, "tool-result-canvas-0", "sendCanvas"),
    };
    report.steps.push(await shot(page, "NEW_REPLACE_BG_V2-step5-actions.png"));

    await page.reload({ waitUntil: "domcontentloaded" });
    await sleep(6000);
    report.reloadNavType = await page.evaluate(() => performance.getEntriesByType("navigation")[0]?.type ?? null);
    report.dockAfterReload = await dockState(page);
    report.persistedAfterReload = await persistTasks(page, "NEW_REPLACE_BG_V2", [report.taskId]);
    report.steps.push(await shot(page, "NEW_REPLACE_BG_V2-step6-reload.png"));

    const dockMatch = (report.dockAfterReload.items || []).find((item) => item.taskId === report.taskId);
    report.verdict = dockMatch && report.persistedAfterReload?.[report.taskId] ? "PASS" : "PARTIAL";
    if (report.verdict === "PARTIAL") report.blockedReason = "reload-history-missing";
}

async function runReplace(page, report) {
    const dir = OUT;
    await page.goto(`${BASE_URL}/tools/product-design/replace-goods`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="replace-goods-workspace"]', { timeout: 60_000 });
    await sleep(1500);
    report.steps.push(await shot(page, "REPLACE_GOODS-step1-loaded.png"));

    const outBtn = await page.$('[data-testid="replace-goods-output-1"]');
    if (outBtn) {
        await outBtn.click();
        await sleep(500);
    }
    report.outputCount = outBtn ? 1 : null;

    const inputs = page.locator('input[type="file"]');
    report.uploadInputs = await inputs.count();
    await inputs.nth(0).setInputFiles(path.join(FIXTURES, "product-watch.jpg"));
    await sleep(4000);
    const inputs2 = page.locator('input[type="file"]');
    report.uploadInputsAfterScene = await inputs2.count();
    await inputs2.nth(1).setInputFiles(path.join(FIXTURES, "hand-product.jpg"));
    await sleep(5000);

    report.issuesBefore = (await page.textContent('[data-testid="replace-goods-issues"]').catch(() => null))?.trim() ?? null;
    report.quadReadout = (await page.textContent('[data-testid="replace-goods-quad-readout"]').catch(() => null))?.trim() ?? null;
    report.steps.push(await shot(page, "REPLACE_GOODS-step2-ready.png"));

    const submit = await page.$('[data-testid="replace-goods-submit"]');
    report.submit = {
        found: Boolean(submit),
        disabled: submit ? await submit.isDisabled() : null,
        label: submit ? (await submit.textContent())?.trim() : null,
    };
    if (!submit || (await submit.isDisabled())) {
        report.verdict = "BLOCKED";
        report.blockedReason = "submit-disabled";
        report.submitError = (await page.textContent('[data-testid="replace-goods-submit-error"]').catch(() => null))?.trim() ?? null;
        return;
    }

    const beforeKeys = await taskKeys(page);
    const beforeIds = await taskIds(page);
    report.taskKeysBefore = beforeKeys.length;
    report.existingTaskIds = beforeIds;
    const startedAt = Date.now();
    await submit.click();
    report.submittedAt = new Date().toISOString();
    await sleep(4000);
    report.steps.push(await shot(page, "REPLACE_GOODS-step3-submitted.png"));

    const found = await waitForNewTask(page, "REPLACE_GOODS", beforeKeys, beforeIds);
    report.elapsedMs = Date.now() - startedAt;
    if (!found) {
        report.verdict = "BLOCKED";
        report.blockedReason = "no-task-record-after-submit";
        report.submitError = (await page.textContent('[data-testid="replace-goods-submit-error"]').catch(() => null))?.trim() ?? null;
        return;
    }
    report.taskId = found.record.id;
    report.taskStatus = found.record.status;
    report.localTaskKey = found.key;
    report.taskOrigin = found.origin ?? "localStorage";
    report.taskRecord = await readTaskRecord(page, found.record.id);
    report.steps.push(await shot(page, "REPLACE_GOODS-step4-result.png"));

    if (found.record.status !== "succeeded") {
        report.verdict = "FAIL";
        report.failure = {
            status: found.record.status,
            error: found.record.error ?? report.taskRecord?.live?.error ?? null,
            submitError: (await page.textContent('[data-testid="replace-goods-submit-error"]').catch(() => null))?.trim() ?? null,
        };
        return;
    }

    const src = await resultSrc(page);
    report.resultSrcKind = src.startsWith("data:") ? "data" : src.startsWith("blob:") ? "blob" : src.startsWith("http") ? "http" : "missing";
    const bytes = await fetchBytes(page, src);
    if (bytes) {
        await fs.writeFile(path.join(dir, "REPLACE_GOODS-result.png"), bytes);
        report.result = {
            bytes: bytes.length,
            sha256: sha(bytes),
            isPng: bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
        };
        const sceneBuf = await fs.readFile(path.join(FIXTURES, "product-watch.jpg"));
        const targetBuf = await fs.readFile(path.join(FIXTURES, "hand-product.jpg"));
        report.inputDiff = {
            sceneSha256: sha(sceneBuf),
            targetSha256: sha(targetBuf),
            resultDiffersFromScene: sha(bytes) !== sha(sceneBuf),
            resultDiffersFromTarget: sha(bytes) !== sha(targetBuf),
        };
    }

    report.actions = {
        download: await clickDownload(page, "tool-result-download-0", "REPLACE_GOODS-download", dir),
        saveAsset: await clickAction(page, "tool-result-save-0", "saveAsset"),
        sendCanvas: await clickAction(page, "tool-result-canvas-0", "sendCanvas"),
    };
    report.steps.push(await shot(page, "REPLACE_GOODS-step5-actions.png"));

    await page.reload({ waitUntil: "domcontentloaded" });
    await sleep(6000);
    report.reloadNavType = await page.evaluate(() => performance.getEntriesByType("navigation")[0]?.type ?? null);
    report.dockAfterReload = await dockState(page);
    report.persistedAfterReload = await persistTasks(page, "REPLACE_GOODS", [report.taskId]);
    report.steps.push(await shot(page, "REPLACE_GOODS-step6-reload.png"));

    const dockMatch = (report.dockAfterReload.items || []).find((item) => item.taskId === report.taskId);
    report.verdict = dockMatch && report.persistedAfterReload?.[report.taskId] ? "PASS" : "PARTIAL";
    if (report.verdict === "PARTIAL") report.blockedReason = "reload-history-missing";
}

async function main() {
    const which = (process.argv[2] || "all").toUpperCase();
    await fs.mkdir(OUT, { recursive: true });
    await fs.mkdir("/tmp/h4gen", { recursive: true });
    const browser = await launchBrowser({ headless: process.env.IC_HEADED !== "1" });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "zh-CN", acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    const network = [];
    page.on("pageerror", (err) => network.push({ pageerror: String(err).slice(0, 300), at: new Date().toISOString() }));
    page.on("response", (res) => {
        const url = res.url();
        if (url.includes("127.0.0.1:23210") || url.includes("/v1/images")) {
            network.push({ status: res.status(), method: res.request().method(), url: url.slice(0, 200), at: new Date().toISOString() });
        }
    });

    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    const provider = await applyProviderConfig(page);

    const results = {};
    const jobs = which === "ALL" ? ["NEW_REPLACE_BG_V2", "REPLACE_GOODS"] : [which];
    for (const toolId of jobs) {
        const report = {
            toolId,
            at: new Date().toISOString(),
            baseUrl: BASE_URL,
            injection: false,
            provider,
            steps: [],
        };
        console.log(`[run] ${toolId}`);
        try {
            if (toolId === "NEW_REPLACE_BG_V2") await runScene(page, report);
            else if (toolId === "REPLACE_GOODS") await runReplace(page, report);
            else throw new Error(`未知工具 ${toolId}`);
        } catch (error) {
            report.verdict = "ERROR";
            report.error = String(error && error.stack ? error.stack.slice(0, 1200) : error);
            await shot(page, `${toolId}-error.png`).catch(() => null);
        }
        report.network = network.slice(-40);
        report.finishedAt = new Date().toISOString();
        await fs.writeFile(path.join(OUT, `${toolId}.json`), JSON.stringify(report, null, 2));
        console.log(`[done] ${toolId} verdict=${report.verdict} task=${report.taskId ?? "-"}`);
        results[toolId] = { verdict: report.verdict, taskId: report.taskId ?? null, reason: report.blockedReason ?? report.error ?? null };
    }

    await browser.close();
    await fs.writeFile(path.join(OUT, "_summary.json"), JSON.stringify({ at: new Date().toISOString(), provider, results }, null, 2));
    console.log(JSON.stringify(results, null, 2));
}

main().catch(async (error) => {
    console.error(error);
    process.exit(1);
});
