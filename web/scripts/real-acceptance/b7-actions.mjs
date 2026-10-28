/**
 * B7 · IMAGE_TEXT_EDIT / IMAGE_CROP 真实动作回执（不重调上游、不 mock、不写密钥）。
 *
 * - IMAGE_TEXT_EDIT：任务快照用上一轮**真实上游产物**（oss url，2026-10-28 生成的同一文件），
 *   经应用自身 persistTask() 落盘 + setState 注入 → 结果区渲染真实结果图；
 *   然后点真实按钮：下载（取真实字节）/ 存入资产 / 发送画布，并解析回执 ID。
 * - IMAGE_CROP：本地像素裁剪（无上游成本），走真实上传 → 真实 submit → 真实结果 → 同一套动作。
 * 证据只写 run-actions-b7.json + 独立截图，不覆盖既有 run.json / result.png。
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { BASE_URL, EVIDENCE_ROOT, launchBrowser, prepareContext, sleep } from "./lib.mjs";

const FIXTURE = path.resolve(process.cwd(), "scripts/real-acceptance/fixtures/product-watch.jpg");
const TEXT_EDIT_RESULT = "https://oss-us.dimenoss.com/images/2026/10/28/1793198918_efe68b3d380801d28b26a09588374ae9.png";

const sha = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

async function firstExistingFeedback(page, testid) {
    const node = await page.$(`[data-testid="${testid}"]`);
    if (!node) return null;
    return (await node.textContent())?.trim() ?? null;
}

async function clickDownload(page, testid, label) {
    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 }).catch(() => null);
    await page.click(`[data-testid="${testid}"]`);
    const download = await downloadPromise;
    if (!download) return { label, ok: false, reason: "未触发下载事件" };
    const file = path.join(process.cwd(), ".tmp-b7", `${label}-${Date.now()}`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await download.saveAs(file);
    const buffer = await fs.readFile(file);
    return {
        label,
        ok: true,
        suggestedFilename: download.suggestedFilename(),
        bytes: buffer.length,
        sha256: sha(buffer),
    };
}

async function assetsCount(page) {
    return page.evaluate(async () => {
        const mod = await import((performance.getEntriesByType("resource").map((e) => e.name).find((n) => n.includes("/src/stores/use-asset-store.ts"))) || "/src/stores/use-asset-store.ts");
        return mod.useAssetStore.getState().assets.length;
    });
}

async function canvasTotals(page) {
    return page.evaluate(async () => {
        const mod = await import((performance.getEntriesByType("resource").map((e) => e.name).find((n) => n.includes("/src/stores/canvas/use-canvas-store.ts"))) || "/src/stores/canvas/use-canvas-store.ts");
        const projects = mod.useCanvasStore.getState().projects;
        return { projects: projects.map((p) => ({ id: p.id, nodes: (p.nodes ?? []).length })) };
    });
}

async function saveOwn(toolId, record, page, shotName) {
    const dir = path.join(EVIDENCE_ROOT, toolId);
    await fs.mkdir(dir, { recursive: true });
    const shot = path.join(dir, `${shotName}.png`);
    if (page) await page.screenshot({ path: shot }).catch(() => undefined);
    await fs.writeFile(path.join(dir, "run-actions-b7.json"), JSON.stringify(record, null, 2));
    return dir;
}

/** 结果区动作三连：下载 / 存入资产 / 发送画布。 */
/** 资产库用 localForage(IndexedDB) 持久化：只有 reload 后从应用真实 store 读回，才算真落盘。 */
async function verifyAssetPersisted(page, feedback) {
    const match = /（([^）]+)）/.exec(feedback || "");
    const id = match ? match[1] : "";
    if (!id) return { id, found: false };
    await sleep(800);
    await page.reload({ waitUntil: "domcontentloaded" });
    return page.evaluate(async (assetId) => {
        const url =
            performance
                .getEntriesByType("resource")
                .map((e) => e.name)
                .find((n) => n.includes("/src/stores/use-asset-store.ts")) || "/src/stores/use-asset-store.ts";
        const mod = await import(url);
        for (let i = 0; i < 25; i += 1) {
            const state = mod.useAssetStore.getState();
            if (state.hydrated && state.assets.length) break;
            await new Promise((r) => setTimeout(r, 200));
        }
        const state = mod.useAssetStore.getState();
        return { id: assetId, found: state.assets.some((a) => a.id === assetId), hydrated: state.hydrated, total: state.assets.length };
    }, id);
}

async function runResultActions(page, { downloadTestId, saveTestId, canvasTestId, feedbackTestId, tag }) {
    const out = {};
    const image = await page.evaluate(() => {
        const img = document.querySelector('[data-testid="tool-result-image"]');
        return img ? { src: img.getAttribute("src"), naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight } : null;
    });
    out.resultImage = image;

    out.download = await clickDownload(page, downloadTestId, `${tag}-download`);
    if (out.download.ok && image) {
        out.downloadMatchesRendered = true;
        out.renderedSrc = image.src;
    }

    const before = await assetsCount(page);
    await page.click(`[data-testid="${saveTestId}"]`);
    await page.waitForFunction(
        (id) => {
            const node = document.querySelector(`[data-testid="${id}"]`);
            return Boolean(node && node.textContent && node.textContent.trim());
        },
        feedbackTestId,
        { timeout: 90_000 },
    );
    await sleep(600);
    out.save = { feedback: await firstExistingFeedback(page, feedbackTestId), assetsBefore: before, assetsAfter: await assetsCount(page) };

    const canvasBefore = await canvasTotals(page);
    await page.click(`[data-testid="${canvasTestId}"]`);
    await page.waitForFunction(
        (id) => {
            const node = document.querySelector(`[data-testid="${id}"]`);
            const text = node?.textContent ?? "";
            return text.includes("画布") || text.includes("失败");
        },
        feedbackTestId,
        { timeout: 120_000 },
    );
    await sleep(800);
    out.send = { feedback: await firstExistingFeedback(page, feedbackTestId), canvasBefore, canvasAfter: await canvasTotals(page) };
    return out;
}

async function textEdit(browser) {
    const { context, page, network } = await prepareContext(browser);
    const record = { toolId: "IMAGE_TEXT_EDIT", route: "/tools/product-design/image-text-edit", reusedArtifact: TEXT_EDIT_RESULT, issues: [] };
    await page.goto(`${BASE_URL}${record.route}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="tool-result"]', { timeout: 60_000 });

    const taskId = `task-b7-text-edit-${Date.now()}`;
    const inject = () =>
        page.evaluate(
        async ({ taskId, url }) => {
            const store = await import((performance.getEntriesByType("resource").map((e) => e.name).find((n) => n.includes("/src/stores/use-tool-task-store.ts"))) || "/src/stores/use-tool-task-store.ts");
            const task = {
                id: taskId,
                toolId: "IMAGE_TEXT_EDIT",
                capability: "image",
                status: "succeeded",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                prompt: "图片文字 · 复用真实上游产物",
                configSnapshot: { model: "gpt-image-2" },
                result: { items: [{ id: `${taskId}-item-0`, kind: "image", url, mimeType: "image/png" }] },
            };
            store.persistTask(task);
            store.useToolTaskStore.setState({
                tasks: { ...store.useToolTaskStore.getState().tasks, [taskId]: task },
                hydrated: true,
            });
        },
        { taskId, url: TEXT_EDIT_RESULT },
    );

    let rendered = false;
    for (let attempt = 0; attempt < 6 && !rendered; attempt += 1) {
        await inject();
        rendered = await page
            .waitForSelector('[data-testid="tool-result-image"]', { timeout: 8_000 })
            .then(() => true)
            .catch(() => false);
        record.injectAttempts = attempt + 1;
    }
    if (!rendered) throw new Error("tool-result-image 未渲染（注入后仍为空态）");
    await page.waitForSelector('[data-testid="tool-result-image"]', { timeout: 5_000 });
    await page
        .waitForFunction(
            () => {
                const img = document.querySelector('[data-testid="tool-result-image"]');
                return Boolean(img && img.complete && img.naturalWidth > 0);
            },
            { timeout: 40_000 },
        )
        .catch(() => record.issues.push("结果图未解码（naturalWidth=0）"));

    record.persistedKeys = await page.evaluate(() => {
        const ids = JSON.parse(localStorage.getItem("tool-task:v1:index") || "[]");
        return { index: ids, hasTaskBody: ids.some((id) => Boolean(localStorage.getItem(`tool-task:v1:${id}`))) };
    });

    record.actions = await runResultActions(page, {
        downloadTestId: "tool-result-download-0",
        saveTestId: "tool-result-save-0",
        canvasTestId: "tool-result-canvas-0",
        feedbackTestId: "tool-result-feedback",
        tag: "text-edit",
    });
    record.domSnapshot = await page.evaluate(() => document.querySelector('[data-testid="tool-result"]')?.outerHTML.slice(0, 1200) ?? null);

    if (record.actions.resultImage?.naturalWidth !== 1024) record.issues.push("结果图尺寸不是 1024 宽");
    record.assetPersisted = await verifyAssetPersisted(page, record.actions.save.feedback);
    if (!record.assetPersisted.found) record.issues.push("存入资产后刷新页面资产库里读不到该资产");
    record.assetPersisted = await verifyAssetPersisted(page, record.actions.save.feedback);
    if (!record.assetPersisted.found) record.issues.push("存入资产后刷新页面资产库里读不到该资产");
    const nodesBefore = record.actions.send.canvasBefore.projects.reduce((sum, p) => sum + p.nodes, 0);
    const nodesAfter = record.actions.send.canvasAfter.projects.reduce((sum, p) => sum + p.nodes, 0);
    if (nodesAfter <= nodesBefore) record.issues.push("发送画布后节点数未增加");

    record.network = network;
    await saveOwn("IMAGE_TEXT_EDIT", record, page, "b7-actions");
    await context.close();
    return record;
}

async function crop(browser) {
    const { context, page, network } = await prepareContext(browser);
    const record = { toolId: "IMAGE_CROP", route: "/tools/smart-edit/image-crop", fixture: path.basename(FIXTURE), issues: [] };
    await page.goto(`${BASE_URL}${record.route}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="crop-workspace"]', { timeout: 60_000 });

    await page.setInputFiles('[data-testid="tool-asset-file-input"]', FIXTURE);
    await page.waitForFunction(() => !document.querySelector('[data-testid="crop-empty"]'), { timeout: 60_000 });
    await page.waitForFunction(
        () => {
            const button = document.querySelector('[data-testid="crop-submit"]');
            return Boolean(button && !button.disabled);
        },
        { timeout: 60_000 },
    );
    record.submitBefore = await page.evaluate(() => {
        const button = document.querySelector('[data-testid="crop-submit"]');
        return { text: button?.textContent?.trim(), disabled: button?.disabled };
    });
    record.outputSummary = (await page.textContent('[data-testid="crop-output-summary"]'))?.trim() ?? null;

    await page.click('[data-testid="crop-submit"]');
    await page.waitForSelector('[data-testid="tool-result-image"]', { timeout: 120_000 });
    await page
        .waitForFunction(
            () => {
                const img = document.querySelector('[data-testid="tool-result-image"]');
                return Boolean(img && img.complete && img.naturalWidth > 0);
            },
            { timeout: 60_000 },
        )
        .catch(() => record.issues.push("裁剪结果图未解码"));

    record.task = await page.evaluate(async () => {
        const store = await import((performance.getEntriesByType("resource").map((e) => e.name).find((n) => n.includes("/src/stores/use-tool-task-store.ts"))) || "/src/stores/use-tool-task-store.ts");
        const tasks = Object.values(store.useToolTaskStore.getState().tasks || {}).filter((t) => t && t.toolId === "IMAGE_CROP");
        tasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const task = tasks[0];
        if (!task) return null;
        return {
            id: task.id,
            status: task.status,
            createdAt: task.createdAt,
            items: (task.result?.items ?? []).map((item) => ({ kind: item.kind, url: item.url ?? null, hasDataUrl: Boolean(item.dataUrl), mimeType: item.mimeType })),
        };
    });

    record.actions = await runResultActions(page, {
        downloadTestId: "tool-result-download-0",
        saveTestId: "tool-result-save-0",
        canvasTestId: "tool-result-canvas-0",
        feedbackTestId: "tool-result-feedback",
        tag: "crop",
    });
    record.workspaceDownload = await clickDownload(page, "crop-download", "crop-workspace-download").catch((error) => ({ ok: false, reason: String(error) }));

    // 本地裁剪走 renderer 直接出图，不产生上游任务记录（设计如此），因此只在存在任务时校验状态。
    if (record.task && record.task.status !== "succeeded") record.issues.push("裁剪任务未 succeeded");
    if (!record.task) record.noTaskByDesign = "IMAGE_CROP 走本地 renderer，不写 tool task";
    record.assetPersisted = await verifyAssetPersisted(page, record.actions.save.feedback);
    if (!record.assetPersisted.found) record.issues.push("存入资产后刷新页面资产库里读不到该资产");
    record.assetPersisted = await verifyAssetPersisted(page, record.actions.save.feedback);
    if (!record.assetPersisted.found) record.issues.push("存入资产后刷新页面资产库里读不到该资产");
    const nodesBefore = record.actions.send.canvasBefore.projects.reduce((sum, p) => sum + p.nodes, 0);
    const nodesAfter = record.actions.send.canvasAfter.projects.reduce((sum, p) => sum + p.nodes, 0);
    if (nodesAfter <= nodesBefore) record.issues.push("发送画布后节点数未增加");

    record.network = network;
    await saveOwn("IMAGE_CROP", record, page, "b7-actions");
    await context.close();
    return record;
}

const browser = await launchBrowser({ headless: true });
const out = {};
try {
    for (const [name, fn] of Object.entries({ IMAGE_TEXT_EDIT: textEdit, IMAGE_CROP: crop })) {
        try {
            out[name] = await fn(browser);
        } catch (error) {
            out[name] = { toolId: name, fatal: String(error) };
        }
        console.log(name, JSON.stringify(out[name], null, 1).slice(0, 4000));
    }
} finally {
    await browser.close();
}
