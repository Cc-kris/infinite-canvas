/**
 * edit8 非视觉维度验收（CHANGE_COLOR 起，逐工具扩）。
 *
 * 只做「非视觉」三维取证，不提交生成、不改上游：
 *  1) 原站默认值已在 .worker-edit8-nv 采集，这里测本站默认值（DOM 快照）；
 *  2) 三动作：下载（真实字节+sha256）/ 存入资产（真实 assetId + 刷新后仍在）/ 发送画布（真实 projectId + 节点）；
 *  3) 历史刷新复用：写入上一轮真实上游产物 → reload → 历史 tab 读回 → 查看结果图解码。
 *
 * 运行：cd web && zsh -lc 'node scripts/real-acceptance/edit8-nv-accept.mjs CHANGE_COLOR'
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { launchBrowser, BASE_URL, EVIDENCE_ROOT, sleep } from "./lib.mjs";

const TOOLS = {
    CHANGE_COLOR: {
        route: "/tools/smart-edit/change-color",
        workspace: "change-color-workspace",
        resultUrl: "https://oss-us.dimenoss.com/images/2026/10/28/1793201243_a98f4d7594f17eb48ade22f52e2295cb.png",
        prompt: "一键换色 · 非视觉验收（复用真实产物）",
    },
};

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

async function snapshotControls(page, workspace) {
    return page.evaluate((ws) => {
        const root = document.querySelector(`[data-testid="${ws}"]`) ?? document.body;
        const labelOf = (el) => {
            const lab = el.closest("label");
            if (lab) return (lab.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
            const id = el.getAttribute("aria-label") || el.getAttribute("name") || "";
            return id;
        };
        const nodes = [...root.querySelectorAll("input, select, textarea, [role=switch], [role=slider]")];
        return nodes
            .map((el) => {
                const style = getComputedStyle(el);
                if (style.display === "none" || style.visibility === "hidden") return null;
                const type = el.getAttribute("type") || el.tagName.toLowerCase();
                return {
                    testid: el.getAttribute("data-testid"),
                    tag: el.tagName.toLowerCase(),
                    type,
                    role: el.getAttribute("role"),
                    label: labelOf(el),
                    value: el.value ?? null,
                    checked: el.checked ?? null,
                    ariaChecked: el.getAttribute("aria-checked"),
                    ariaNow: el.getAttribute("aria-valuenow"),
                    min: el.getAttribute("min"),
                    max: el.getAttribute("max"),
                    step: el.getAttribute("step"),
                    disabled: Boolean(el.disabled),
                };
            })
            .filter(Boolean);
    }, workspace);
}

/** 取应用实际加载的模块 URL（dev 下带 ?t=HMR 时间戳，裸路径会拿到另一个 store 实例）。 */
async function collectStores(page) {
    return page.evaluate(() => {
        const urls = performance.getEntriesByType("resource").map((e) => e.name);
        const find = (frag) => urls.find((u) => u.includes(frag)) ?? null;
        return {
            asset: find("/src/stores/use-asset-store.ts"),
            canvas: find("/src/stores/canvas/use-canvas-store.ts"),
            task: find("/src/stores/use-tool-task-store.ts"),
        };
    });
}

async function readCanvas(page) {
    return page.evaluate(async () => {
        const urls = performance.getEntriesByType("resource").map((e) => e.name);
        const url = urls.find((u) => u.includes("/src/stores/canvas/use-canvas-store.ts")) ?? "/src/stores/canvas/use-canvas-store.ts";
        const mod = await import(url);
        return mod.useCanvasStore.getState().projects.map((p) => ({
            id: p.id,
            title: p.title,
            nodeCount: p.nodes.length,
            nodeIds: p.nodes.map((n) => n.id),
            images: p.nodes.filter((n) => n.type === "image" || n.imageUrl).map((n) => ({ id: n.id, url: n.imageUrl ?? n.data?.url ?? null })),
        }));
    });
}

async function readAssets(page) {
    return page.evaluate(async () => {
        const urls = performance.getEntriesByType("resource").map((e) => e.name);
        const url = urls.find((u) => u.includes("/src/stores/use-asset-store.ts")) ?? "/src/stores/use-asset-store.ts";
        const mod = await import(url);
        return mod.useAssetStore.getState().assets.map((a) => ({
            id: a.id,
            kind: a.kind,
            title: a.title,
            bytes: a.data?.bytes ?? null,
            width: a.data?.width ?? null,
            height: a.data?.height ?? null,
            hasDataUrl: Boolean(a.data?.dataUrl),
            dataUrlLength: a.data?.dataUrl?.length ?? 0,
            createdAt: a.createdAt,
        }));
    });
}

async function verify(browser, toolId, spec) {
    const context = await browser.newContext({ viewport: { width: 1512, height: 950 }, locale: "zh-CN", acceptDownloads: true });
    const page = await context.newPage();
    const rec = { toolId, route: spec.route, at: new Date().toISOString(), issues: [] };

    await page.goto(`${BASE_URL}${spec.route}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[role="tablist"][aria-label="结果区"]', { timeout: 60_000 });
    await sleep(1200);

    // ---- 0) 本站默认值（DOM 快照）----
    rec.localDefaults = await snapshotControls(page, spec.workspace);

    // ---- 1) 历史空态 ----
    await page.click('[role="tablist"] [role="tab"]:nth-child(2)');
    rec.historyEmpty = await page.evaluate(() => document.querySelector('[data-testid="tool-task-history-empty"]')?.textContent?.trim() ?? null);

    // ---- 2) 写入真实上游产物快照（经应用自身 persistTask）----
    const taskId = `task-nv-${toolId}-${Date.now()}`;
    await page.evaluate(
        async ({ task, taskId }) => {
            const store = await import("/src/stores/use-tool-task-store.ts");
            store.persistTask(task);
            store.useToolTaskStore.setState({ tasks: { ...store.useToolTaskStore.getState().tasks, [taskId]: task }, hydrated: true });
        },
        {
            taskId,
            task: {
                id: taskId,
                toolId,
                capability: "image",
                status: "succeeded",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                prompt: spec.prompt,
                configSnapshot: { model: "gpt-image-2", aspectRatio: "1:1" },
                result: { items: [{ id: `${taskId}-item-0`, kind: "image", url: spec.resultUrl, mimeType: "image/png" }] },
                reusedFrom: "prior real upstream artifact (see evidence result.json source)",
            },
        },
    );
    rec.historyPersist = await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        const hit = keys.filter((k) => k.includes("tool_task") || k.includes("tool-task") || k.includes("toolTask"));
        return { keys: hit, sizes: hit.map((k) => ({ key: k, bytes: localStorage.getItem(k)?.length ?? 0 })) };
    });

    // ---- 3) 刷新 → 历史复用 ----
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[role="tablist"][aria-label="结果区"]', { timeout: 60_000 });
    await page.click('[role="tablist"] [role="tab"]:nth-child(2)');
    await page.waitForSelector('[data-testid="tool-task-history-item"]', { timeout: 30_000 });
    await page.waitForFunction(() => {
        const img = document.querySelector('[data-testid="tool-task-history-item"] img');
        return Boolean(img && img.complete && img.naturalWidth > 0);
    }, { timeout: 30_000 }).catch(() => undefined);
    rec.history = await page.evaluate(() => ({
        count: document.querySelectorAll('[data-testid="tool-task-history-item"]').length,
        firstText: document.querySelector('[data-testid="tool-task-history-item"]')?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        thumbs: [...document.querySelectorAll('[data-testid="tool-task-history-item"] img')].map((img) => ({
            src: (img.getAttribute("src") || "").slice(0, 120),
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
        })),
        hasOpen: Boolean(document.querySelector('[data-testid="tool-task-history-open"]')),
    }));
    if (rec.history.count < 1) rec.issues.push("刷新后历史为空");
    if (!rec.history.hasOpen) rec.issues.push("历史缺少查看结果");

    // ---- 4) 查看结果 ----
    await page.click('[data-testid="tool-task-history-open"]');
    await page.waitForSelector('[data-testid="tool-result-image"]', { timeout: 30_000 });
    await page.waitForFunction(() => {
        const img = document.querySelector('[data-testid="tool-result-image"]');
        return Boolean(img && img.complete && img.naturalWidth > 0);
    }, { timeout: 30_000 }).catch(() => undefined);
    rec.resultImage = await page.evaluate(() => {
        const img = document.querySelector('[data-testid="tool-result-image"]');
        return img ? { src: (img.getAttribute("src") || "").slice(0, 160), naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight } : null;
    });

    // ---- 5) 下载：真实字节 ----
    const dir = path.join(EVIDENCE_ROOT, toolId);
    await fs.mkdir(dir, { recursive: true });
    const downloadPromise = page.waitForEvent("download", { timeout: 90_000 }).catch(() => null);
    await page.click('[data-testid="tool-result-download-0"]');
    const download = await downloadPromise;
    if (download) {
        const suggested = download.suggestedFilename();
        const target = path.join(dir, "download-action.png");
        await download.saveAs(target);
        const buf = await fs.readFile(target);
        rec.download = {
            suggestedFilename: suggested,
            savedAs: path.basename(target),
            bytes: buf.length,
            sha256: sha256(buf),
        };
        // 与上游源字节对比
        const srcBuf = await page.evaluate(async (url) => {
            const res = await fetch(url);
            return Array.from(new Uint8Array(await res.arrayBuffer()));
        }, spec.resultUrl);
        const src = Buffer.from(srcBuf);
        rec.download.sourceBytes = src.length;
        rec.download.sameSha256 = sha256(src) === rec.download.sha256;
        if (buf.length < 1024) rec.issues.push("下载文件过小");
        if (!rec.download.sameSha256) rec.issues.push("下载字节与上游源不一致");
    } else {
        rec.download = { error: "no download event" };
        rec.issues.push("点击下载未触发文件下载");
    }
    // 等 busy 结束
    await page.waitForFunction(() => !document.querySelector('[data-testid="tool-result-feedback"]')?.textContent?.includes("处理中"), { timeout: 10_000 }).catch(() => undefined);
    rec.downloadFeedback = await page.evaluate(() => document.querySelector('[data-testid="tool-result-feedback"]')?.textContent?.trim() ?? null);

    // ---- 6) 存入资产 ----
    const assetsBefore = await readAssets(page);
    await page.click('[data-testid="tool-result-save-0"]');
    await page.waitForFunction((n) => {
        const s = document.querySelector('[data-testid="tool-result-feedback"]')?.textContent ?? "";
        return s.includes("资产库") || s.includes("失败") || s.includes("保存");
    }, assetsBefore.length, { timeout: 90_000 }).catch(() => undefined);
    await sleep(800);
    rec.saveFeedback = await page.evaluate(() => document.querySelector('[data-testid="tool-result-feedback"]')?.textContent?.trim() ?? null);
    const assetsAfter = await readAssets(page);
    const assetIdMatch = /（([^）]+)）/.exec(rec.saveFeedback || "");
    rec.assets = {
        before: assetsBefore.length,
        after: assetsAfter.length,
        newAsset: assetsAfter.find((a) => !assetsBefore.some((b) => b.id === a.id)) ?? null,
        feedbackAssetId: assetIdMatch ? assetIdMatch[1] : null,
    };
    if (assetsAfter.length <= assetsBefore.length) rec.issues.push("存入资产未新增");

    // 刷新后资产仍在（localforage 持久化）
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[role="tablist"][aria-label="结果区"]', { timeout: 60_000 });
    await sleep(1500);
    const assetsReload = await readAssets(page);
    const keep = rec.assets.newAsset;
    rec.assets.afterReload = keep ? assetsReload.some((a) => a.id === keep.id) : false;
    if (!rec.assets.afterReload) rec.issues.push("刷新后资产记录丢失");

    // 回到结果态
    await page.click('[role="tablist"] [role="tab"]:nth-child(2)');
    await page.waitForSelector('[data-testid="tool-task-history-open"]', { timeout: 30_000 });
    await page.click('[data-testid="tool-task-history-open"]');
    await page.waitForSelector('[data-testid="tool-result-canvas-0"]', { timeout: 30_000 });

    // ---- 7) 发送画布 ----
    const canvasBefore = await readCanvas(page);
    await page.click('[data-testid="tool-result-canvas-0"]');
    await page.waitForFunction(() => {
        const s = document.querySelector('[data-testid="tool-result-feedback"]')?.textContent ?? "";
        return s.includes("画布") || s.includes("失败");
    }, { timeout: 90_000 }).catch(() => undefined);
    await sleep(1000);
    rec.canvasFeedback = await page.evaluate(() => document.querySelector('[data-testid="tool-result-feedback"]')?.textContent?.trim() ?? null);
    const canvasAfter = await readCanvas(page);
    const addedNodes = canvasAfter.flatMap((p) => p.nodeIds).filter((id) => !canvasBefore.flatMap((q) => q.nodeIds).includes(id));
    rec.canvas = {
        projectsBefore: canvasBefore,
        projectsAfter: canvasAfter,
        addedNodeIds: addedNodes,
        feedbackProjectId: /（([^）]+)）/.exec(rec.canvasFeedback || "")?.[1] ?? null,
        newImageUrls: canvasAfter.flatMap((p) => p.images.filter((i) => !canvasBefore.flatMap((q) => q.images).some((j) => j.id === i.id))),
    };
    if (addedNodes.length === 0) rec.issues.push("发送画布未新增节点");

    rec.screenshot = "nv-actions.png";
    await page.screenshot({ path: path.join(dir, rec.screenshot) }).catch(() => undefined);
    await fs.writeFile(path.join(dir, "run-nv.json"), JSON.stringify(rec, null, 2));
    await context.close();
    console.log(JSON.stringify({ toolId, issues: rec.issues, download: rec.download, assets: rec.assets, canvasNodes: addedNodes, history: rec.history }, null, 2));
    return rec;
}

const browser = await launchBrowser({ headless: true });
try {
    const which = process.argv.slice(2);
    for (const [toolId, spec] of Object.entries(TOOLS)) {
        if (which.length && !which.includes(toolId)) continue;
        await verify(browser, toolId, spec);
    }
} finally {
    await browser.close();
}
