/**
 * R10：AI_TEXT / ORNAMENT_TEXT / SDS_DESIGN 各一次真实 UI 生成验收。
 *
 * 真实链路（无 mock、无注入）：
 *   UI 填表 → 真实 <input type=file> 上传仓库内合法素材 → 点击生成 → canvas-proxy 127.0.0.1:23210
 *   → 上游 /v1/images/* 真实返回 → 任务落 localStorage(tool-task:v1:*) + 结果字节落 IDB
 *   → 真实整页 reload → 历史坞/结果区观测 → 下载(真实下载事件+字节 sha256)
 *   → 存入资产(资产库条数) → 发送画布(画布节点数)
 *
 * 用法: node accept-pod3-real.mjs --tool AI_TEXT
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { applyProviderConfig } from "./provider.mjs";

const BASE = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(SCRIPT_DIR, "fixtures");
const EVIDENCE_ROOT = path.resolve(SCRIPT_DIR, "../../../docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance");

const toolArg = (() => {
    const i = process.argv.indexOf("--tool");
    return i > -1 ? process.argv[i + 1] : "AI_TEXT";
})();

const ROUTES = {
    AI_TEXT: "/tools/product-design/ai-text",
    ORNAMENT_TEXT: "/tools/product-design/ornament-text",
    SDS_DESIGN: "/tools/product-design/sds-design",
};
const OUT = path.join(EVIDENCE_ROOT, toolArg, "r10-real-20261029");
fs.mkdirSync(OUT, { recursive: true });

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** 只读文件头解析尺寸（PNG IHDR / JPEG SOF）。 */
function imageDims(buf) {
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), format: "png" };
    if (buf[0] === 0xff && buf[1] === 0xd8) {
        let i = 2;
        while (i < buf.length - 9) {
            if (buf[i] !== 0xff) { i += 1; continue; }
            const marker = buf[i + 1];
            const len = buf.readUInt16BE(i + 2);
            if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5), format: "jpeg" };
            i += 2 + len;
        }
    }
    return { width: null, height: null, format: "unknown" };
}

/** 页内工具：从 IDB 取结果字节 + 读取资产/画布/任务状态。 */
const PAGE_HELPERS = `
  window.__icReadBlob = async (storageKey) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open("infinite-canvas"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const stores = [...db.objectStoreNames];
    for (const name of stores) {
      const v = await new Promise((res) => { try { const tx = db.transaction(name, "readonly"); const rq = tx.objectStore(name).get(storageKey); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(undefined); } catch { res(undefined); } });
      if (v instanceof Blob) {
        const buf = new Uint8Array(await v.arrayBuffer());
        let bin = ""; const CH = 0x8000;
        for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
        db.close();
        return { mime: v.type, size: v.size, b64: btoa(bin), store: name };
      }
    }
    db.close();
    return null;
  };
  window.__icCounts = async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open("infinite-canvas"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const getApp = async (key) => {
      if (![...db.objectStoreNames].includes("app_state")) return null;
      const raw = await new Promise((res) => { const rq = db.transaction("app_state", "readonly").objectStore("app_state").get(key); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); });
      try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
    };
    // 资产库/画布都走 zustand persist + localforage(app_state)，不是 localStorage。
    const assetParsed = await getApp("infinite-canvas:asset_store");
    const assets = assetParsed?.state?.assets ?? assetParsed?.assets ?? [];
    const canvasParsed = await getApp("infinite-canvas:canvas_store");
    const projects = canvasParsed?.state?.projects ?? [];
    db.close();
    const tasks = Object.keys(localStorage).filter((k) => k.startsWith("tool-task:v1:task-"));
    return { assetCount: assets.length, assetTitles: assets.slice(-3).map((a) => a.title), projectCount: projects.length, nodeCount: projects.reduce((n, p) => n + (p.nodes?.length ?? 0), 0), taskCount: tasks.length };
  };
`;

async function newPage() {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, locale: "zh-CN", acceptDownloads: true });
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const provider = await applyProviderConfig(page);
    await page.addInitScript(PAGE_HELPERS);
    await page.evaluate(PAGE_HELPERS);
    return { browser, context, page, provider };
}

const calls = [];
function attachNetwork(page) {
    page.on("request", (req) => {
        if (req.method() !== "POST") return;
        if (!/\/v1\/images\/(generations|edits)/.test(req.url())) return;
        let body = null;
        try { body = JSON.parse(req.postData() || "{}"); } catch {}
        calls.push({
            phase: calls.length, at: new Date().toISOString(), url: req.url(),
            model: body?.model ?? null, size: body?.size ?? null, n: body?.n ?? null,
            prompt: typeof body?.prompt === "string" ? body.prompt.slice(0, 500) : null,
            hasReferences: Array.isArray(body?.image) ? body.image.length : undefined,
        });
    });
    page.on("response", async (res) => {
        const url = res.url();
        if (!/\/v1\/images\/(generations|edits)/.test(url)) return;
        const req = res.request();
        if (req.method() !== "POST") return;
        const rec = {
            at: new Date().toISOString(), url, status: res.status(),
            requestId: res.headers()["x-request-id"] || res.headers()["request-id"] || null,
            contentType: res.headers()["content-type"] || null,
        };
        try {
            const body = await res.json();
            rec.bodyKind = Object.keys(body);
            rec.created = body.created ?? null;
            rec.itemCount = Array.isArray(body.data) ? body.data.length : null;
            if (Array.isArray(body.data) && body.data[0]) {
                rec.b64Length = typeof body.data[0].b64_json === "string" ? body.data[0].b64_json.length : null;
                rec.revisedPrompt = typeof body.data[0].revised_prompt === "string" ? body.data[0].revised_prompt.slice(0, 300) : null;
                rec.url = body.data[0].url ?? null;
            }
            rec.billing = body.usage ?? null;
        } catch (err) {
            rec.jsonError = String(err).slice(0, 200);
        }
        calls.push({ ...rec, kind: "response" });
    });
}

const waitSucceeded = async (page, timeoutMs = 720000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
        const state = await page.evaluate(() => {
            const el = document.querySelector('[data-testid="tool-result"]');
            return el ? { view: el.getAttribute("data-view"), text: (el.innerText || "").replace(/\s+/g, " ").slice(0, 400) } : null;
        });
        if (state?.view === "succeeded" || state?.view === "failed" || state?.view === "cancelled") return { ...state, ms: Date.now() - t0 };
        await page.waitForTimeout(2000);
    }
    return { view: "timeout", ms: Date.now() - t0 };
};

async function readTask(page) {
    return page.evaluate(() => {
        const keys = Object.keys(localStorage).filter((k) => k.startsWith("tool-task:v1:task-"));
        let best = null;
        for (const k of keys) {
            try {
                const t = JSON.parse(localStorage.getItem(k));
                if (!best || (t.submittedAt ?? t.createdAt ?? 0) > (best.submittedAt ?? best.createdAt ?? 0)) best = t;
            } catch {}
        }
        return best;
    });
}

function fmtTask(task) {
    if (!task) return null;
    const items = (task.result?.items ?? task.results ?? []).map((it) => ({
        id: it.id, kind: it.kind, mimeType: it.mimeType, bytes: it.bytes, width: it.width, height: it.height,
        storageKey: it.storageKey, payloadDropped: it.payloadDropped ?? false,
    }));
    return {
        id: task.id, toolId: task.toolId, status: task.status, createdAt: task.createdAt, submittedAt: task.submittedAt,
        completedAt: task.completedAt, prompt: (task.prompt || "").slice(0, 400),
        upstream: task.upstream ?? task.receipt ?? task.trace ?? null,
        error: task.error ?? null,
        configSnapshot: task.configSnapshot ?? null,
        items,
    };
}

/* ------------------------------- 每工具填表 ------------------------------- */
async function prepareAiText(page) {
    await page.locator('input[data-testid="tool-asset-file-input"]').first().setInputFiles(path.join(FIXTURES, "apparel-print.jpg"));
    await page.waitForTimeout(2500);
    // 选项来自模型目录（id/label），用索引兜底：模式选「图案 + 文字」（末项），比例选第一个可用项。
    const modeSel = page.getByLabel(/素材模式/);
    const modeCount = await modeSel.locator("option").count();
    await modeSel.selectOption({ index: modeCount >= 4 ? 3 : modeCount - 1 });
    const ratioSel = page.getByLabel(/输出比例/);
    await ratioSel.selectOption({ index: 1 });
    console.log("ai-text selects:", await modeSel.inputValue(), await ratioSel.inputValue());
    const ta = page.locator("textarea").first();
    await ta.fill("FOREVER YOUNG 夏日帆布印花，粗体无衬线英文，暖橙底");
    await page.waitForTimeout(1200);
}

async function prepareOrnamentText(page) {
    await page.getByRole("textbox", { name: "饰品文字内容" }).fill("FOREVER YOUNG");
    const effect = page.getByRole("textbox", { name: "效果描述" });
    if (await effect.count()) await effect.fill("玫瑰金浮雕，边缘细碎闪粉");
    await page.waitForTimeout(800);
}

async function prepareSdsDesign(page) {
    const inputs = page.locator('input[type="file"]');
    const n = await inputs.count();
    if (n < 2) throw new Error(`SDS 需要素材+商品两个文件输入，实际 ${n}`);
    await inputs.nth(0).setInputFiles(path.join(FIXTURES, "apparel-print.jpg"));
    await page.waitForTimeout(2500);
    await inputs.nth(1).setInputFiles(path.join(FIXTURES, "product-watch.jpg"));
    await page.waitForTimeout(3000);
    await page.getByRole("button", { name: "原色" }).click().catch(() => {});
    await page.waitForTimeout(800);
}

const PREPARE = { AI_TEXT: prepareAiText, ORNAMENT_TEXT: prepareOrnamentText, SDS_DESIGN: prepareSdsDesign };
const SUBMIT_LABEL = { AI_TEXT: "生成 POD 素材", ORNAMENT_TEXT: "生成饰品文字", SDS_DESIGN: "立即生成" };

async function clickAction(page, name) {
    const scope = page.locator('[data-testid="tool-result"]');
    const btn = scope.getByRole("button", { name, exact: false }).first();
    await btn.waitFor({ state: "visible", timeout: 15000 });
    await btn.click();
}

const toastText = (page) => page.evaluate(() => {
    const scope = document.querySelector('[data-testid="tool-result"]');
    return scope ? (scope.innerText || "").replace(/\s+/g, " ").slice(0, 600) : null;
});

/* -------------------------------- 主流程 -------------------------------- */
const receipt = { tool: toolArg, route: ROUTES[toolArg], base: BASE, startedAt: new Date().toISOString(), ok: false, steps: {}, errors: [] };
const { browser, page, provider } = await newPage();
try {
    attachNetwork(page);
    receipt.provider = provider;
    await page.goto(BASE + ROUTES[toolArg], { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="tool-workspace"]', { timeout: 30000 });
    await page.waitForTimeout(2000);
    receipt.steps.before = await page.evaluate(() => window.__icCounts());

    await PREPARE[toolArg](page);
    await page.screenshot({ path: path.join(OUT, "01-before-submit.png"), fullPage: true });

    const submit = page.getByRole("button", { name: SUBMIT_LABEL[toolArg] }).first();
    const submitState = await submit.evaluate((b) => ({ disabled: b.disabled, text: b.innerText.trim() }));
    receipt.steps.submitButton = submitState;
    if (submitState.disabled) {
        receipt.errors.push(`提交按钮 disabled，页面提示：${(await page.evaluate(() => document.body.innerText.match(/[^\n]*(请|无法|不完整)[^\n]*/g)?.slice(0, 6) || []).join(" | "))}`);
        throw new Error("submit disabled");
    }
    const submittedAt = Date.now();
    await submit.click();
    const result = await waitSucceeded(page);
    receipt.steps.result = result;
    await page.screenshot({ path: path.join(OUT, "02-result.png"), fullPage: true });

    // 真实 taskId（localStorage 落盘记录）
    const task = await readTask(page);
    receipt.task = fmtTask(task);
    if (!task) throw new Error("localStorage 中没有 tool-task:v1:task-* 记录");

    // 上游回执
    receipt.upstream = calls;
    fs.writeFileSync(path.join(OUT, "net.json"), JSON.stringify(calls, null, 1));

    if (result.view !== "succeeded") {
        receipt.errors.push(`任务未成功：view=${result.view}，页面文案=${result.text}`);
        receipt.ok = false;
        throw new Error("task not succeeded");
    }

    // 结果字节（IDB 真值）
    const item = (task.result?.items ?? task.results ?? [])[0];
    if (!item) throw new Error("任务没有结果项");
    const blob = await page.evaluate((k) => window.__icReadBlob(k), item.storageKey);
    if (!blob) throw new Error(`IDB 中找不到 storageKey=${item.storageKey} 的字节`);
    const bytes = Buffer.from(blob.b64, "base64");
    const ext = blob.mime === "image/jpeg" ? "jpg" : "png";
    const storedPath = path.join(OUT, `03-result.${ext}`);
    fs.writeFileSync(storedPath, bytes);
    const magic = bytes.subarray(0, 8).toString("hex");
    receipt.steps.bytes = { storageKey: item.storageKey, store: blob.store, mime: blob.mime, size: bytes.length, sha256: sha256(bytes), magic, dims: imageDims(bytes), file: path.relative(path.resolve(SCRIPT_DIR, "../../.."), storedPath), declaredBytes: item.bytes ?? null, width: item.width ?? null, height: item.height ?? null };

    // 真实整页 reload
    const navStart = Date.now();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="tool-workspace"]', { timeout: 60000 });
    await page.waitForTimeout(6000);
    receipt.steps.reload = await page.evaluate((taskId) => {
        const dock = document.querySelector('[data-testid="tool-history-dock"]');
        const rows = [...document.querySelectorAll('[data-testid="tool-history-dock"] [data-task-id]')].map((el) => ({
            taskId: el.getAttribute("data-task-id"), text: (el.innerText || "").replace(/\s+/g, " ").slice(0, 160),
        }));
        const res = document.querySelector('[data-testid="tool-result"]');
        return {
            navType: performance.getEntriesByType("navigation")[0]?.type ?? null,
            dockCount: document.querySelector('[data-testid="tool-history-dock-count"]')?.innerText?.trim() ?? null,
            rowCount: rows.length, rows,
            myRowVisible: rows.some((r) => r.taskId === taskId),
            resultView: res?.getAttribute("data-view") ?? null,
            resultText: (res?.innerText || "").replace(/\s+/g, " ").slice(0, 300),
            actionButtons: [...(res?.querySelectorAll("button") ?? [])].map((b) => ({ text: b.innerText.trim(), disabled: b.disabled })),
        };
    }, task.id);
    await page.screenshot({ path: path.join(OUT, "04-after-reload.png"), fullPage: true });

    // 下载（真实 download 事件 + 字节 sha256）
    const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 60000 }),
        clickAction(page, "下载"),
    ]);
    const dlPath = path.join(OUT, `05-download-${download.suggestedFilename()}`);
    await download.saveAs(dlPath);
    const dlBytes = fs.readFileSync(dlPath);
    receipt.steps.download = { suggestedFilename: download.suggestedFilename(), savedTo: path.relative(path.resolve(SCRIPT_DIR, "../../.."), dlPath), size: dlBytes.length, sha256: sha256(dlBytes), matchesStored: sha256(dlBytes) === sha256(bytes), toast: await toastText(page) };

    // 存入资产
    const beforeAsset = await page.evaluate(() => window.__icCounts());
    await clickAction(page, "存入资产");
    await page.waitForTimeout(2500);
    const afterAsset = await page.evaluate(() => window.__icCounts());
    receipt.steps.saveToAssets = { before: beforeAsset, after: afterAsset, delta: afterAsset.assetCount - beforeAsset.assetCount, toast: await toastText(page) };

    // 发送画布
    const beforeCanvas = await page.evaluate(() => window.__icCounts());
    await clickAction(page, "发送画布");
    await page.waitForTimeout(3000);
    const afterCanvas = await page.evaluate(() => window.__icCounts());
    receipt.steps.sendToCanvas = { before: beforeCanvas, after: afterCanvas, nodeDelta: afterCanvas.nodeCount - beforeCanvas.nodeCount, projectDelta: afterCanvas.projectCount - beforeCanvas.projectCount, toast: await toastText(page) };
    await page.screenshot({ path: path.join(OUT, "06-after-actions.png"), fullPage: true });

    receipt.ok = receipt.steps.download.matchesStored && receipt.steps.reload.myRowVisible && receipt.steps.result.view === "succeeded";
    receipt.finishedAt = new Date().toISOString();
    receipt.durationMs = Date.now() - submittedAt;
    fs.writeFileSync(path.join(OUT, "receipt.json"), JSON.stringify(receipt, null, 1));
    console.log(JSON.stringify({ tool: toolArg, ok: receipt.ok, taskId: task.id, result: result.view, bytes: receipt.steps.bytes, reload: { rows: receipt.steps.reload.rowCount, myRowVisible: receipt.steps.reload.myRowVisible, view: receipt.steps.reload.resultView }, download: receipt.steps.download, saveToAssets: { delta: receipt.steps.saveToAssets.delta, toast: receipt.steps.saveToAssets.toast }, sendToCanvas: { nodeDelta: receipt.steps.sendToCanvas.nodeDelta, projectDelta: receipt.steps.sendToCanvas.projectDelta, toast: receipt.steps.sendToCanvas.toast }, upstream: calls.filter((c) => c.kind === "response") }, null, 1));
} catch (error) {
    receipt.finishedAt = new Date().toISOString();
    receipt.errors.push(String(error));
    try { await page.screenshot({ path: path.join(OUT, "99-error.png"), fullPage: true }); } catch {}
    receipt.pageText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 1500)).catch(() => null);
    receipt.upstream = calls;
    fs.writeFileSync(path.join(OUT, "receipt.json"), JSON.stringify(receipt, null, 1));
    console.log(JSON.stringify({ tool: toolArg, ok: false, errors: receipt.errors, result: receipt.steps.result ?? null, upstream: calls }, null, 1));
    process.exitCode = 1;
} finally {
    await browser.close();
}
