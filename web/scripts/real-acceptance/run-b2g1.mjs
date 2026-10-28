/**
 * B2/G1 真实结果字节留存验收：AI_TEXT / ORNAMENT_TEXT / SDS_DESIGN / SCENE_TRANSFER
 *
 * 每个工具独立跑一次真实上游生成（canvas-proxy → 真实渠道），并：
 *   1. 抓上游响应**全量 body**（含 b64_json），零截断落盘；
 *   2. 解码出真实图片字节 → sha256 / 尺寸 / 字节数；
 *   3. 点共享结果动作「下载 / 存入资产 / 发送画布」并抓回执；
 *   4. 刷新页面后从 IndexedDB 按 storageKey 取回字节，sha256 与第 2 步一致（G1 的核心断言）；
 *   5. 落截图 + DOM 证据 + LinkFox 对照。
 *
 * 用法：node scripts/real-acceptance/run-b2g1.mjs AI_TEXT
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { BASE_URL, EVIDENCE_ROOT, PROXY_URL, launchBrowser } from "./lib.mjs";
import { applyProviderConfig } from "./provider.mjs";

const FIXTURES = path.resolve(process.cwd(), "scripts/real-acceptance/fixtures");

const TOOLS = {
    AI_TEXT: {
        route: "/tools/product-design/ai-text",
        submitText: "生成 POD 素材",
        prompt: "FOREVER YOUNG 夏日限定",
        files: [path.join(FIXTURES, "apparel-print.jpg")],
        linkfoxNote: "LinkFox 原站 /tools/product-design/ai-text 抓取时重定向首页（见 final-gap-audit §LinkFox 对照），参数基准取 page-specs + acceptance 契约。",
    },
    ORNAMENT_TEXT: {
        route: "/tools/product-design/ornament-text",
        submitText: "生成饰品文字",
        text: "FOREVER",
        prompt: "玫瑰金浮雕 宝石边镶嵌碎钻",
        files: [],
        linkfoxNote: "LinkFox 原站 /tools/product-design/ornament-text 抓取时重定向首页；参数基准取 page-specs + acceptance 契约。",
    },
    SDS_DESIGN: {
        route: "/tools/product-design/sds-design",
        submitText: "立即生成",
        files: [path.join(FIXTURES, "product-watch.jpg"), path.join(FIXTURES, "apparel-print.jpg")],
        linkfoxNote: "LinkFox SDS 素材贴合：输入=商品图+素材图，输出=贴合图；本地按同参数真实生成一张。",
    },
    SCENE_TRANSFER: {
        route: "/tools/product-design/scene-transfer",
        submitText: "开始迁移",
        files: [path.join(FIXTURES, "product-watch.jpg"), path.join(FIXTURES, "color-ref-navy.png")],
        // scene.tsx 用组件内 useState 持有 task，不进 useToolTaskStore → 结果不落盘（G1 缺口，见 final-gap-audit）
        persisted: false,
        gap: "SCENE_TRANSFER 的 task 只存在组件 useState（runSceneTransfer onUpdate → setTask），未进 useToolTaskStore，localStorage 无 tool-task:v1:* 快照，刷新即丢结果",
        linkfoxNote: "LinkFox 场景迁移：输入=商品图 imageUrl + 场景风格 imageStyleUrl + 可选 segImageUrl + similarity；输出=迁移图。",
    },
};

const tool = process.argv[2];
if (!tool || !TOOLS[tool]) throw new Error(`用法: node run-b2g1.mjs <${Object.keys(TOOLS).join("|")}>`);
const spec = TOOLS[tool];
const OUT = path.join(EVIDENCE_ROOT, "B2G1", tool);

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/** 从 PNG/JPEG/WEBP 头部读真实尺寸（不信 UI 文案）。 */
function imageSize(buf) {
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
        return { format: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
        let i = 2;
        while (i < buf.length - 9) {
            if (buf[i] !== 0xff) { i += 1; continue; }
            const marker = buf[i + 1];
            const len = buf.readUInt16BE(i + 2);
            if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
                return { format: "jpeg", width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
            }
            i += 2 + len;
        }
    }
    if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
        const fmt = buf.toString("ascii", 12, 16);
        if (fmt === "VP8X") return { format: "webp", width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
        if (fmt === "VP8 ") return { format: "webp", width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    return { format: "unknown", width: 0, height: 0 };
}

async function login(page) {
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    const info = await applyProviderConfig(page);
    return info;
}

/** 可选填充：字段不存在时返回 null 而不抛错（有的工具没有该字段）。 */
async function tryFill(page, labelIncludes, value) {
    try {
        return await fillByLabel(page, labelIncludes, value);
    } catch {
        return null;
    }
}

/** 按 label 文本填字段（label 包裹 input 的写法，本仓库工作区统一如此）。 */
async function fillByLabel(page, labelIncludes, value) {
    const ok = await page.evaluate(
        ({ labelIncludes, value }) => {
            const setValue = (el, v) => {
                const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
                const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
                setter?.call(el, v);
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
            };
            const labels = [...document.querySelectorAll("label")].filter((l) => (l.textContent || "").includes(labelIncludes));
            for (const label of labels) {
                const el = label.querySelector("textarea, select, input:not([type=checkbox]):not([type=range])");
                if (el) { setValue(el, value); return label.textContent.trim().slice(0, 40); }
            }
            return null;
        },
        { labelIncludes, value },
    );
    if (!ok) throw new Error(`找不到字段：${labelIncludes}`);
    return ok;
}

async function clickByText(page, text, { exact = false } = {}) {
    const btn = page.getByRole("button", { name: text, exact });
    const count = await btn.count();
    for (let i = 0; i < count; i += 1) {
        const item = btn.nth(i);
        if (await item.isVisible()) {
            const disabled = await item.isDisabled();
            if (disabled) throw new Error(`按钮「${text}」为 disabled，前置条件未满足`);
            await item.click();
            return true;
        }
    }
    throw new Error(`找不到可点按钮：${text}`);
}

async function main() {
    await fs.mkdir(OUT, { recursive: true });
    const receipt = { tool, route: spec.route, startedAt: new Date().toISOString(), upstream: [], steps: [], g1: {}, linkfox: { note: spec.linkfoxNote } };
    const browser = await launchBrowser({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, locale: "zh-CN", acceptDownloads: true });
    const page = await context.newPage();

    /** 全量响应体：这里不截断、不采样，原样落盘。 */
    const captured = [];
    page.on("response", async (res) => {
        const req = res.request();
        if (req.method() !== "POST") return;
        if (!/\/v1\/images\/(generations|edits)/.test(res.url())) return;
        try {
            const body = await res.body();
            const idx = captured.length;
            const file = path.join(OUT, `raw-upstream-${idx}.json`);
            await fs.writeFile(file, body);
            captured.push({ file, bytes: body.length, url: res.url(), status: res.status(), requestContentType: req.headers()["content-type"] ?? "" });
        } catch (error) {
            captured.push({ error: String(error), url: res.url() });
        }
    });

    try {
        receipt.provider = await login(page);
        await page.goto(`${BASE_URL}${spec.route}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(1500);

        const fileInputs = page.locator('input[type="file"]');
        const fileCount = await fileInputs.count();
        receipt.steps.push({ step: "file-inputs", count: fileCount });

        if (tool === "AI_TEXT") {
            await fillByLabel(page, "素材模式", "text");
            await tryFill(page, "输出比例", "1:1");
            await tryFill(page, "输出数量", "1");
            await fillByLabel(page, "提示词", spec.prompt);
        } else if (tool === "ORNAMENT_TEXT") {
            await fillByLabel(page, "饰品文字内容", spec.text);
            await fillByLabel(page, "效果描述", spec.prompt);
        }

        for (let i = 0; i < Math.min(fileCount, spec.files.length); i += 1) {
            const before = await page.getByRole("button", { name: "移除" }).count();
            await fileInputs.nth(i).setInputFiles(spec.files[i]);
            // 上传是异步的：必须等它真的进列表（source 登记完成），否则提交会命中 `!source` 静默 return。
            await page.waitForFunction(
                ({ minCount }) => [...document.querySelectorAll("button")].filter((b) => b.textContent?.trim() === "移除").length > minCount,
                { minCount: before },
                { timeout: 60_000, polling: 500 },
            );
            await page.waitForTimeout(400);
        }
        if (spec.files.length) receipt.steps.push({ step: "uploads", files: spec.files.map((f) => path.basename(f)) });

        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(OUT, "step-1-before-submit.png"), fullPage: false });

        await clickByText(page, spec.submitText);
        receipt.steps.push({ step: "submitted", at: new Date().toISOString() });

        // 生成 45–60s/张：给足 6 分钟，中途每秒看一次状态。
        await page.waitForFunction(
            () => {
                const el = document.querySelector('[data-testid="tool-result"]');
                if (!el) return false;
                const view = el.getAttribute("data-view");
                return view === "succeeded" || view === "failed";
            },
            null,
            { timeout: 360_000, polling: 2000 },
        );
        const view = await page.locator('[data-testid="tool-result"]').getAttribute("data-view");
        receipt.resultView = view;
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT, "step-2-result.png") });
        if (view !== "succeeded") {
            receipt.resultText = await page.locator('[data-testid="tool-result"]').innerText();
            throw new Error(`任务终态=${view}：${receipt.resultText.slice(0, 400)}`);
        }

        receipt.upstream = captured;
        if (!captured.length) throw new Error("没有抓上游响应体");

        // 解码真实字节
        const rawJson = JSON.parse(await fs.readFile(captured[0].file, "utf8"));
        // 上游有两种形态：gpt-image 系返回 b64_json，部分渠道返回 oss url（需二次下载）。
        const b64 = rawJson?.data?.[0]?.b64_json;
        let imageBuf;
        if (b64) {
            receipt.upstreamForm = "b64_json";
            imageBuf = Buffer.from(b64, "base64");
        } else if (rawJson?.data?.[0]?.url) {
            receipt.upstreamForm = "url";
            receipt.upstreamUrl = rawJson.data[0].url;
            const res = await fetch(`${PROXY_URL}/${rawJson.data[0].url}`);
            if (!res.ok) throw new Error(`上游 url 取字节失败：${res.status}`);
            imageBuf = Buffer.from(await res.arrayBuffer());
        } else {
            throw new Error(`上游响应既无 b64_json 也无 url：${Object.keys(rawJson)}`);
        }
        const png = path.join(OUT, "result-0.png");
        await fs.writeFile(png, imageBuf);
        const size = imageSize(imageBuf);
        const resultMeta = { file: path.basename(png), bytes: imageBuf.length, sha256: sha256(imageBuf), ...size };
        receipt.result = resultMeta;
        receipt.upstreamJson = { keys: Object.keys(rawJson), dataLen: rawJson?.data?.length ?? 0, revisedPrompt: rawJson?.data?.[0]?.revised_prompt?.slice(0, 200) };

        // 落盘快照（G1）：localStorage 里应有 storageKey、无 dataUrl
        const snapshot = await page.evaluate(() => {
            const out = [];
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i);
                if (!key?.startsWith("tool-task:v1:")) continue;
                out.push({ key, value: localStorage.getItem(key) });
            }
            return out;
        });
        await fs.writeFile(path.join(OUT, "task-snapshot.json"), JSON.stringify(snapshot, null, 1));
        const g1Supported = spec.persisted !== false;
        let snapItem = null;
        for (const entry of snapshot) {
            if (entry.key === "tool-task:v1:index") continue;
            const parsed = JSON.parse(entry.value);
            if (parsed.toolId && parsed.status === "succeeded" && parsed.result?.items?.[0]?.bytes) {
                snapItem = { taskId: parsed.id, item: parsed.result.items[0], length: entry.value.length };
                break;
            }
        }
        if (!snapItem && g1Supported) throw new Error("localStorage 里没有带 bytes 的成功任务快照");
        if (!snapItem) {
            // 该工作区不走 tool-task store：如实记录缺口，不假装 G1 通过
            receipt.g1 = { supported: false, gap: spec.gap, snapshotKeys: snapshot.map((e) => e.key) };
        }
        if (snapItem) {
            receipt.g1.persisted = {
                taskId: snapItem.taskId,
                storageKey: snapItem.item.storageKey,
                bytes: snapItem.item.bytes,
                hasDataUrlInSnapshot: Boolean(snapItem.item.dataUrl),
                payloadDropped: snapItem.item.payloadDropped,
                snapshotChars: snapItem.length,
            };
            if (!snapItem.item.storageKey) throw new Error("G1 失败：落盘快照没有 storageKey");
            if (snapItem.item.dataUrl) throw new Error("G1 失败：dataUrl 仍在落盘快照里（应已剥离）");
        }

        // 共享结果动作 1：下载（真实文件落到磁盘并与上游字节比对）
        const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
        await page.locator('[data-testid="tool-result-download-0"]').click();
        const download = await downloadPromise;
        const downloadedPath = path.join(OUT, `downloaded-${download.suggestedFilename()}`);
        await download.saveAs(downloadedPath);
        const downloadedBuf = await fs.readFile(downloadedPath);
        receipt.actions = {
            download: {
                suggestedFilename: download.suggestedFilename(),
                bytes: downloadedBuf.length,
                sha256: sha256(downloadedBuf),
                matchesUpstream: sha256(downloadedBuf) === resultMeta.sha256,
            },
        };

        // 共享结果动作 2：存入资产
        await page.locator('[data-testid="tool-result-save-0"]').click();
        await page.waitForTimeout(2500);
        receipt.actions.saveAsset = await page.locator('[data-testid="tool-result-feedback"]').first().innerText().catch(() => null);
        await page.screenshot({ path: path.join(OUT, "step-3-saved-asset.png") });

        // 共享结果动作 3：发送画布
        await page.locator('[data-testid="tool-result-canvas-0"]').click();
        await page.waitForTimeout(2500);
        receipt.actions.sendCanvas = await page.locator('[data-testid="tool-result-feedback"]').first().innerText().catch(() => null);
        await page.screenshot({ path: path.join(OUT, "step-4-sent-canvas.png") });

        // G1 关键断言：刷新后从 IndexedDB 取回字节，sha256 必须一致
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForTimeout(3000);
        const idb = snapItem ? await page.evaluate(async (storageKey) => {
            const open = () => new Promise((resolve, reject) => {
                const req = indexedDB.open("infinite-canvas");
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            const db = await open();
            const read = () => new Promise((resolve, reject) => {
                if (!db.objectStoreNames.contains("media_files")) return resolve(null);
                const tx = db.transaction("media_files", "readonly");
                const get = tx.objectStore("media_files").get(storageKey);
                get.onsuccess = () => resolve(get.result ?? null);
                get.onerror = () => reject(get.error);
            });
            const blob = await read();
            if (!blob) return { found: false, stores: [...db.objectStoreNames] };
            const buf = await blob.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = "";
            const CHUNK = 0x8000;
            for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
            return { found: true, size: bytes.length, mimeType: blob.type, base64: btoa(binary), stores: [...db.objectStoreNames] };
        }, snapItem.item.storageKey) : null;
        if (snapItem) {
            if (!idb.found) throw new Error(`G1 失败：刷新后 IndexedDB 取不到 ${snapItem.item.storageKey}`);
            const idbBuf = Buffer.from(idb.base64, "base64");
            await fs.writeFile(path.join(OUT, "restored-after-reload.png"), idbBuf);
            receipt.g1.afterReload = {
                storageKey: snapItem.item.storageKey,
                bytes: idb.size,
                mimeType: idb.mimeType,
                sha256: sha256(idbBuf),
                matchesUpstream: sha256(idbBuf) === resultMeta.sha256,
            };
        }

        const restoredPanel = await page.evaluate(() => {
            const el = document.querySelector('[data-testid="tool-result"]');
            return el ? { view: el.getAttribute("data-view"), text: el.innerText.replace(/\s+/g, " ").slice(0, 300) } : null;
        });
        const buttonsEnabled = await page.evaluate(() => {
            const pick = (id) => {
                const el = document.querySelector(`[data-testid="${id}"]`);
                return el ? { exists: true, disabled: el.disabled } : { exists: false };
            };
            return { download: pick("tool-result-download-0"), save: pick("tool-result-save-0"), canvas: pick("tool-result-canvas-0") };
        });
        if (snapItem) {
            receipt.g1.restoredPanel = restoredPanel;
            receipt.g1.restoredButtons = buttonsEnabled;
        } else {
            receipt.g1.afterReloadPanel = restoredPanel;
            receipt.g1.gapConfirmed = !restoredPanel || restoredPanel.view === "empty" || !buttonsEnabled.download.exists;
        }
        await page.screenshot({ path: path.join(OUT, "step-5-after-reload.png") });

        // 资产库 / 画布的真实落点
        receipt.assetsPage = await page.evaluate(() => {
            const raw = localStorage.getItem("asset:v1:index") ?? localStorage.getItem("asset");
            return raw ? raw.slice(0, 200) : null;
        });
        const dom = await page.evaluate(() => ({
            url: location.href,
            headings: [...document.querySelectorAll("h1,h2,h3")].map((e) => e.textContent?.trim()).filter(Boolean).slice(0, 8),
        }));
        await fs.writeFile(path.join(OUT, "result_dom.json"), JSON.stringify(dom, null, 1));

        receipt.finishedAt = new Date().toISOString();
        const b2Ok = receipt.actions.download.matchesUpstream;
        const g1Ok = snapItem ? Boolean(receipt.g1.afterReload?.matchesUpstream && receipt.g1.restoredButtons?.download?.exists) : Boolean(receipt.g1.gapConfirmed);
        receipt.verdict = b2Ok && g1Ok ? (snapItem ? "PASS" : "PARTIAL") : "FAIL";
        await fs.writeFile(path.join(OUT, "run-b2g1.json"), JSON.stringify(receipt, null, 1));
        console.log(JSON.stringify(receipt, null, 1));
    } catch (error) {
        receipt.error = String(error?.stack ?? error);
        receipt.failureDom = await page
            .evaluate(() => ({
                url: location.href,
                resultView: document.querySelector('[data-testid="tool-result"]')?.getAttribute("data-view") ?? null,
                resultText: document.querySelector('[data-testid="tool-result"]')?.innerText?.replace(/\s+/g, " ").slice(0, 500) ?? null,
                bodyText: document.body.innerText.replace(/\s+/g, " ").slice(0, 600),
            }))
            .catch(() => null);
        receipt.finishedAt = new Date().toISOString();
        receipt.verdict = "FAIL";
        await page.screenshot({ path: path.join(OUT, "step-failure.png") }).catch(() => undefined);
        await fs.writeFile(path.join(OUT, "run-b2g1.json"), JSON.stringify(receipt, null, 1));
        throw error;
    } finally {
        await browser.close();
    }
}

await main();
