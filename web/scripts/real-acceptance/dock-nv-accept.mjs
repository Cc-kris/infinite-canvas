/**
 * edit8 非视觉维度验收（dock 版）：适用于结果区用 tool-history-dock 的工具。
 *
 * 与 edit8-nv-accept.mjs 同口径：注入真实上游产物 → 刷新 → 历史 dock 读回
 * → 展开 → 下载（真实字节+sha）/ 存入资产（assetId+刷新存活）/ 发送画布（projectId+节点）。
 *
 * 运行：cd web && zsh -lc 'node scripts/real-acceptance/dock-nv-accept.mjs PRINTING_REPAIR'
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { launchBrowser, BASE_URL, EVIDENCE_ROOT, sleep } from "./lib.mjs";

const TOOLS = {
    PRINTING_REPAIR: {
        route: "/tools/smart-edit/printing-repair",
        workspace: "printing-repair-workspace",
        resultUrl: "https://oss-us.dimenoss.com/images/2026/10/28/1793202782_9bc88d2ecc63458197b17383e39c7138.png",
        prompt: "印花修复 · 非视觉验收（复用真实产物）",
    },
    HAND_REPAIR: {
        route: "/tools/smart-edit/hand-repair",
        workspace: "hand-repair-workspace",
        resultUrl: "https://oss-us.dimenoss.com/images/2026/10/28/1793199487_1ae76b65bdf7c0c415e9fed0e8025f06.png",
        prompt: "手部修复 · 非视觉验收（复用真实产物）",
    },
};

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

async function snapshotControls(page, workspace) {
    return page.evaluate((ws) => {
        const root = document.querySelector(`[data-testid="${ws}"]`) ?? document.body;
        const labelOf = (el) => {
            const aria = el.getAttribute("aria-label");
            if (aria) return aria;
            const txt = (el.textContent ?? "").replace(/\s+/g, " ").trim();
            if (txt) return txt.slice(0, 24);
            const name = el.getAttribute("name");
            if (name) return name;
            return (el.getAttribute("placeholder") ?? "").trim();
        };
        return [...root.querySelectorAll("button,select,input,textarea,[role=radio],[role=tab]")]
            .filter((el) => el.offsetParent !== null || el.tagName === "SELECT")
            .map((el) => {
                const type = el.getAttribute("type") ?? el.tagName.toLowerCase();
                return {
                    testid: el.getAttribute("data-testid"),
                    tag: el.tagName.toLowerCase(),
                    type,
                    role: el.getAttribute("role"),
                    label: labelOf(el),
                    value: el.value ?? null,
                    checked: typeof el.checked === "boolean" ? el.checked : null,
                    ariaPressed: el.getAttribute("aria-pressed"),
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

async function readAssets(page) {
    return page.evaluate(async () => {
        const urls = performance.getEntriesByType("resource").map((e) => e.name);
        const url = urls.find((u) => u.includes("/src/stores/use-asset-store.ts")) ?? "/src/stores/use-asset-store.ts";
        const mod = await import(url);
        const state = mod.useAssetStore.getState();
        const list = state.assets ?? state.items ?? [];
        return list.map((a) => ({ id: a.id, kind: a.kind, title: a.title, bytes: a.bytes ?? a.size ?? null, createdAt: a.createdAt }));
    });
}

async function readCanvas(page) {
    return page.evaluate(async () => {
        const urls = performance.getEntriesByType("resource").map((e) => e.name);
        const url = urls.find((u) => u.includes("/src/stores/canvas/use-canvas-store.ts")) ?? "/src/stores/canvas/use-canvas-store.ts";
        const mod = await import(url);
        return mod.useCanvasStore.getState().projects.map((p) => ({
            id: p.id,
            nodeIds: p.nodes.map((n) => n.id),
            images: p.nodes.filter((n) => n.type === "image" || n.imageUrl).map((n) => ({ id: n.id, url: n.imageUrl ?? n.data?.url ?? null })),
        }));
    });
}

function evDir(toolId) {
    return path.join(EVIDENCE_ROOT, toolId);
}

async function verify(browser, toolId, spec) {
    const dir = evDir(toolId);
    const context = await browser.newContext({ viewport: { width: 1512, height: 950 }, locale: "zh-CN", acceptDownloads: true });
    const page = await context.newPage();
    const rec = { toolId, route: spec.route, at: new Date().toISOString(), issues: [] };

    await page.goto(`${BASE_URL}${spec.route}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="tool-history-dock"]', { timeout: 60_000 });
    await sleep(1500);
    rec.localDefaults = await snapshotControls(page, spec.workspace);
    rec.dockEmpty = await page.evaluate(() => document.querySelector('[data-testid="tool-history-dock-empty"]')?.textContent?.trim() ?? null);

    // 注入已存在的真实上游产物（不触发任何生成请求）
    const taskId = `task-nv-${toolId}-${Date.now()}`;
    await page.evaluate(
        async ({ taskId, toolId, url, prompt }) => {
            const store = await import("/src/stores/use-tool-task-store.ts");
            const task = {
                id: taskId,
                toolId,
                capability: "image",
                status: "succeeded",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                prompt,
                configSnapshot: { model: "gpt-image-2", note: "prior real upstream artifact" },
                result: { items: [{ id: `${taskId}-0`, kind: "image", url, mimeType: "image/png" }] },
            };
            store.persistTask(task);
            store.useToolTaskStore.setState({
                tasks: { ...store.useToolTaskStore.getState().tasks, [taskId]: task },
                hydrated: true,
            });
        },
        { taskId, toolId, url: spec.resultUrl, prompt: spec.prompt },
    );

    // 刷新后从持久层读回（历史复用）
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="tool-history-dock"]', { timeout: 60_000 });
    await sleep(2500);
    rec.history = await page.evaluate(() => ({
        count: document.querySelector('[data-testid="tool-history-dock-count"]')?.textContent?.trim() ?? null,
        items: [...document.querySelectorAll('[data-testid="tool-history-dock-item"]')].map((li) => ({
            taskId: li.getAttribute("data-task-id"),
            status: li.getAttribute("data-task-status"),
        })),
    }));
    if (!rec.history.items.some((i) => i.taskId === taskId)) rec.issues.push("刷新后历史 dock 未命中刚写入的任务");

    // 展开 → 校验结果缩略图真实可解码
    await page.click('[data-testid="tool-history-dock-toggle"]');
    await page.waitForSelector('[data-testid="tool-history-dock-download"]', { timeout: 30_000 });
    rec.resultImage = await page.evaluate(async () => {
        const img = document.querySelector('[data-testid="tool-history-dock-result"] img');
        if (!img) return null;
        if (!img.complete) await new Promise((r) => { img.onload = r; img.onerror = r; });
        return { src: img.src.slice(0, 80), naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
    });
    if (!rec.resultImage?.naturalWidth) rec.issues.push("历史结果缩略图未能解码");

    // 下载：真实字节 + sha256，与上游源字节比对
    const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 60_000 }).catch(() => null),
        page.click('[data-testid="tool-history-dock-download"]'),
    ]);
    if (download) {
        const target = path.join(dir, "download-action.png");
        await download.saveAs(target);
        const buf = await fs.readFile(target);
        const srcBuf = Buffer.from(await (await fetch(spec.resultUrl)).arrayBuffer());
        rec.download = {
            suggestedFilename: download.suggestedFilename(),
            bytes: buf.length,
            sha256: sha256(buf),
            sourceBytes: srcBuf.length,
            sameSha256: sha256(srcBuf) === sha256(buf),
        };
        if (!rec.download.sameSha256) rec.issues.push("下载字节与上游源不一致");
    } else {
        rec.download = { error: "no download event" };
        rec.issues.push("点击下载未触发文件下载");
    }
    rec.actionFeedback = await page.evaluate(
        () => document.querySelector('[data-testid="tool-history-dock"]')?.textContent?.match(/已存入资产库[^）]*）/)?.[0] ?? null,
    );

    // 存入资产
    const assetsBefore = await readAssets(page);
    await page.click('[data-testid="tool-history-dock-save"]');
    // 存入资产内部要走真实上传（uploadImage），大图可能数十秒 → 轮询而不是死等固定时长
    let assetsAfter = assetsBefore;
    let saveWaitMs = null;
    for (let i = 0; i < 40; i++) {
        await sleep(1000);
        assetsAfter = await readAssets(page);
        if (assetsAfter.length > assetsBefore.length) { saveWaitMs = (i + 1) * 1000; break; }
    }
    rec.saveWaitMs = saveWaitMs;
    const newAsset = assetsAfter.find((a) => !assetsBefore.some((b) => b.id === a.id)) ?? null;
    rec.assets = { before: assetsBefore.length, after: assetsAfter.length, newAsset };
    if (!newAsset) rec.issues.push("存入资产未新增记录");

    // 刷新后资产仍在
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="tool-history-dock"]', { timeout: 60_000 });
    await sleep(2000);
    const assetsReload = await readAssets(page);
    rec.assets.afterReload = Boolean(newAsset && assetsReload.some((a) => a.id === newAsset.id));
    if (!rec.assets.afterReload) rec.issues.push("刷新后资产记录丢失");

    // 发送画布
    await page.click('[data-testid="tool-history-dock-toggle"]');
    await page.waitForSelector('[data-testid="tool-history-dock-canvas"]', { timeout: 30_000 });
    const canvasBefore = await readCanvas(page);
    await page.click('[data-testid="tool-history-dock-canvas"]');
    await sleep(5000);
    const canvasAfter = await readCanvas(page);
    const beforeIds = new Set(canvasBefore.flatMap((p) => p.nodeIds));
    rec.canvas = {
        projectsBefore: canvasBefore.map((p) => p.id),
        projectsAfter: canvasAfter.map((p) => ({ id: p.id, nodes: p.nodeIds.length })),
        addedNodeIds: canvasAfter.flatMap((p) => p.nodeIds).filter((id) => !beforeIds.has(id)),
    };
    if (rec.canvas.addedNodeIds.length === 0) rec.issues.push("发送画布未新增节点");

    await page.screenshot({ path: path.join(dir, "nv-actions.png") }).catch(() => undefined);
    await fs.writeFile(path.join(dir, "run-nv.json"), JSON.stringify(rec, null, 2));
    await context.close();
    console.log(JSON.stringify({ toolId, issues: rec.issues, download: rec.download, assets: rec.assets, canvas: rec.canvas, history: rec.history }, null, 2));
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
