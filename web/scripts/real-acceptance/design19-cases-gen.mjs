/**
 * design19「优秀案例·做同款」真实复现验收。
 *
 * 边界（不接受任何伪造）：
 * - 案例 = LinkFox 原站 `/image/make-case/list` 真实下发的 item（案例 ID 原样记录）；
 * - 做同款 = 真点页面上的 `tool-case-apply`，走 fetch 案例素材 → uploadToolAsset → 表单回填；
 * - 出图 = 真点生成按钮，请求经 canvas-proxy(23210) 打到 provider，结果图字节从页面取回；
 * - 失败必须落原始错误（HTTP 状态 / 页面错误文本 / 网络记录），不写 PASS。
 *
 * 用法：
 *   node scripts/real-acceptance/design19-cases-gen.mjs --tool=scene --case=<id> [--headful]
 *   node scripts/real-acceptance/design19-cases-gen.mjs --tool=all
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { launchBrowser, BASE_URL } from "./lib.mjs";
import { applyProviderConfig } from "./provider.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../../../docs/V1.0/plan_linkfox_navigation/evidence/design19-cases-20261029");
const GEN_TIMEOUT = Number(process.env.IC_GEN_TIMEOUT || 300000);

const TOOLS = {
    scene: {
        id: "PRODUCT_SCENE",
        route: "/tools/product-design/product-scene",
        caseTab: '[data-testid="scene-tab-cases"]',
        generate: '[data-testid="scene-generate"]',
        result: '[data-testid="tool-result-image"]',
    },
    replace: {
        id: "REPLACE_GOODS",
        route: "/tools/product-design/replace-goods",
        caseTabText: "优秀案例",
        generate: '[data-testid="replace-goods-submit"]',
        result: '[data-testid="tool-result-image"]',
    },
    dressing: {
        id: "AI_DRESSING_V2",
        route: "/tools/product-design/ai-dressing-v2",
        caseTabText: "优秀案例",
        generate: '[data-testid="dressing-submit"]',
        result: '[data-testid="tool-result-image"]',
    },
    wearable: {
        id: "AI_WEARABLE",
        route: "/tools/product-design/ai-wearable",
        caseTabText: "优秀案例",
        generate: '[data-testid="dress-generate"]',
        result: '[data-testid="tool-result-image"]',
    },
    sds: {
        id: "SDS_DESIGN",
        route: "/tools/product-design/sds-design",
        caseTabText: "优秀案例",
        generateText: "立即生成",
        result: '[data-testid="tool-result-image"]',
    },
};

function parseArgs() {
    const out = { tool: "scene", caseId: "", headful: false };
    for (const arg of process.argv.slice(2)) {
        if (arg.startsWith("--tool=")) out.tool = arg.slice(7);
        else if (arg.startsWith("--case=")) out.caseId = arg.slice(7);
        else if (arg === "--headful") out.headful = true;
    }
    return out;
}

async function readDraft(page, toolId) {
    return page.evaluate(async (id) => {
        const key = `tool-draft:v1:${id}`;
        const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open("infinite-canvas");
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        const stores = Array.from(db.objectStoreNames);
        for (const name of stores) {
            const tx = db.transaction(name, "readonly");
            const store = tx.objectStore(name);
            const value = await new Promise((resolve) => {
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result ?? null);
                req.onerror = () => resolve(null);
            });
            if (value) {
                let parsed = value;
                if (typeof value === "string") {
                    try {
                        parsed = JSON.parse(value);
                    } catch {
                        /* 保留原字符串 */
                    }
                }
                return { store: name, draft: parsed };
            }
        }
        return { store: null, stores };
    }, toolId);
}

async function domSnapshot(page) {
    return page.evaluate(() => {
        const text = (el) => (el ? (el.value ?? el.innerText ?? "").toString().slice(0, 400) : null);
        const values = {
            textareas: Array.from(document.querySelectorAll("textarea")).map(text),
            inputs: Array.from(document.querySelectorAll('input:not([type="file"])'))
                .map((el) => ({ type: el.type, value: text(el) }))
                .filter((item) => item.value),
            selects: Array.from(document.querySelectorAll("select")).map((el) => el.value),
            buttons: Array.from(document.querySelectorAll("button")).map((el) => (el.innerText || "").trim()).filter(Boolean).slice(0, 40),
            thumbs: Array.from(document.querySelectorAll("img")).filter((img) => /^blob:|^data:/.test(img.currentSrc || img.src)).length,
            body: (document.body.innerText || "").slice(0, 900),
        };
        return values;
    });
}

async function extractResult(page, timeout) {
    const started = Date.now();
    let last = { state: "pending" };
    while (Date.now() - started < timeout) {
        last = await page.evaluate(() => {
            const img = document.querySelector('[data-testid="tool-result-image"]');
            const failed = document.querySelector('[data-testid="tool-result-failed"]');
            const err = document.querySelector('[data-testid="replace-goods-submit-error"],[data-testid="dress-run-error"],[data-testid="tool-result-failed"]');
            const notice = Array.from(document.querySelectorAll("p,span,div"))
                .map((el) => (el.innerText || "").trim())
                .filter((t) => t && t.length < 120 && /失败|错误|不足|请先|超时|HTTP \d{3}/.test(t))
                .slice(0, 5);
            return {
                state: img ? "image" : failed ? "failed" : "pending",
                src: img ? img.currentSrc || img.src : "",
                error: err ? (err.innerText || "").trim().slice(0, 600) : null,
                notices: notice,
            };
        });
        if (last.state !== "pending") return last;
        await page.waitForTimeout(3000);
    }
    return { ...last, state: last.state === "pending" ? "timeout" : last.state };
}

async function fetchBytes(page, src) {
    if (!src) return null;
    return page.evaluate(async (url) => {
        try {
            const res = await fetch(url);
            const buf = new Uint8Array(await res.arrayBuffer());
            let binary = "";
            const chunk = 0x8000;
            for (let i = 0; i < buf.length; i += chunk) {
                binary += String.fromCharCode(...buf.subarray(i, i + chunk));
            }
            return { status: res.status, type: res.headers.get("content-type") || "", b64: btoa(binary) };
        } catch (error) {
            return { error: String(error) };
        }
    }, src);
}

async function runTool(browser, key, target, caseId) {
    const dir = path.join(OUT, key);
    await fs.mkdir(dir, { recursive: true });
    const record = {
        tool: key,
        toolId: target.id,
        route: target.route,
        base: BASE_URL,
        requestedCaseId: caseId || null,
        startedAt: new Date().toISOString(),
        network: [],
        steps: [],
        ok: false,
    };
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "zh-CN" });
    const page = await context.newPage();
    page.on("pageerror", (err) => record.steps.push({ step: "pageerror", message: String(err).slice(0, 400) }));
    page.on("response", async (res) => {
        const url = res.url();
        if (!/23210|\/v1\/images|\/v1\/chat/.test(url)) return;
        if (!/images|proxy/.test(url)) return;
        record.network.push({
            method: res.request().method(),
            url: url.slice(0, 300),
            status: res.status(),
            at: new Date().toISOString(),
        });
    });

    try {
        await page.goto(`${BASE_URL}${target.route}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);
        record.provider = await applyProviderConfig(page);
        await page.waitForTimeout(3000);

        // 1) 切到「优秀案例」
        if (target.caseTab) {
            await page.click(target.caseTab);
        } else {
            await page.getByRole("tab", { name: target.caseTabText }).first().click().catch(async () => {
                await page.getByRole("button", { name: target.caseTabText }).first().click();
            });
        }
        await page.waitForSelector('[data-testid="tool-case-card"]', { timeout: 20000 });

        const cards = await page.evaluate(() =>
            Array.from(document.querySelectorAll('[data-testid="tool-case-card"]')).map((card) => ({
                id: card.getAttribute("data-case-id"),
                text: (card.innerText || "").replace(/\n/g, "|").slice(0, 200),
                broken: Array.from(card.querySelectorAll("img")).some((img) => !img.complete || img.naturalWidth === 0),
            })),
        );
        record.cases = cards;
        const chosen = caseId ? cards.find((c) => c.id === caseId) : cards.find((c) => !c.broken) ?? cards[0];
        if (!chosen) throw new Error(`案例列表为空或未包含 ${caseId}：count=${cards.length}`);
        record.caseId = chosen.id;

        // 2) 做同款：真点卡片按钮
        const card = page.locator(`[data-testid="tool-case-card"][data-case-id="${chosen.id}"]`);
        await card.locator('[data-testid="tool-case-apply"]').click();
        await page.waitForTimeout(1200);
        // 等素材入库/回填结束（按钮 applying 状态消失）
        for (let i = 0; i < 40; i += 1) {
            const applying = await card.locator('[data-testid="tool-case-apply"]').innerText().catch(() => "");
            if (!/上传|处理|应用/.test(applying)) break;
            await page.waitForTimeout(1000);
        }
        await page.waitForTimeout(1500);
        record.steps.push({ step: "applied", dom: await domSnapshot(page), draft: await readDraft(page, target.id) });
        await page.screenshot({ path: path.join(dir, "01-applied.png") });

        const applyError = await page.locator('[data-testid="tool-cases-error"]').innerText().catch(() => "");
        if (applyError) record.applyError = applyError;

        // 3) 真实生成
        if (target.generate) await page.click(target.generate);
        else await page.getByRole("button", { name: target.generateText }).first().click();
        await page.waitForTimeout(2000);
        record.steps.push({ step: "submitted", dom: await domSnapshot(page) });
        await page.screenshot({ path: path.join(dir, "02-submitted.png") });

        const result = await extractResult(page, GEN_TIMEOUT);
        record.result = { state: result.state, error: result.error, notices: result.notices, srcPrefix: (result.src || "").slice(0, 80) };
        await page.screenshot({ path: path.join(dir, "03-result.png") });

        if (result.state !== "image") throw new Error(`未出图（${result.state}）：${result.error || (result.notices || []).join(" / ")}`);

        const bytes = await fetchBytes(page, result.src);
        if (!bytes || bytes.error || !bytes.b64) throw new Error(`结果图字节读取失败：${JSON.stringify(bytes).slice(0, 200)}`);
        const buffer = Buffer.from(bytes.b64, "base64");
        const ext = (bytes.type.split("/")[1] || "png").split(";")[0];
        await fs.writeFile(path.join(dir, `result-${chosen.id}.${ext}`), buffer);
        record.resultBytes = { file: `result-${chosen.id}.${ext}`, size: buffer.length, contentType: bytes.type, sha256: (await import("node:crypto")).createHash("sha256").update(buffer).digest("hex") };
        record.ok = true;
    } catch (error) {
        record.error = error instanceof Error ? error.message : String(error);
        record.steps.push({ step: "error", message: record.error, dom: await domSnapshot(page).catch(() => null) });
        await page.screenshot({ path: path.join(dir, "error.png") }).catch(() => {});
    } finally {
        await fs.writeFile(path.join(dir, "run.json"), JSON.stringify(record, null, 2));
        await context.close();
    }
    return record;
}

const args = parseArgs();
const keys = args.tool === "all" ? Object.keys(TOOLS) : [args.tool];
if (keys.some((k) => !TOOLS[k])) throw new Error(`未知工具：${args.tool}`);

await fs.mkdir(OUT, { recursive: true });
const browser = await launchBrowser({ headless: !args.headful });
const summary = [];
for (const key of keys) {
    const record = await runTool(browser, key, TOOLS[key], args.caseId);
    summary.push({ tool: key, ok: record.ok, caseId: record.caseId, error: record.error, bytes: record.resultBytes?.size ?? 0 });
    console.log(`${key}: ok=${record.ok} case=${record.caseId ?? "-"} bytes=${record.resultBytes?.size ?? 0}${record.error ? " err=" + record.error.slice(0, 200) : ""}`);
}
await browser.close();
await fs.writeFile(path.join(OUT, `summary-${keys.join("-")}.json`), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
