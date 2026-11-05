/**
 * PRINTING_REPAIR / HAND_REPAIR · 全门禁真实验收执行器。
 *
 * 与 run-edit6.mjs 的差别：
 *   1. 上传按控件真实就绪态推进（PRINTING 的 Step 2 在 Step 1 未落地前 disabled，
 *      固定 sleep 会把印花写进 disabled 的 input，导致 print=null、submit 永久 disabled）；
 *   2. 结果门禁除真实出图外，还要走完「存入资产 → 发送画布」两个真实动作并解析返回 ID；
 *   3. 落库/发画布后用独立路由回验（/assets 出现该结果标题、/canvas/<projectId> 出现新节点图片）；
 *   4. task / result item ID 从应用运行中的任务 store 读取（只读内存状态，不碰 localStorage /
 *      IndexedDB / keychain，也不打印任何密钥）。
 *
 * 用法：node run-repair-actions.mjs PRINTING_REPAIR|HAND_REPAIR
 */
import { launchBrowser, sleep, PROXY_URL } from "./lib.mjs";
import { applyProviderConfig } from "./provider.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const BASE_URL = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const HERE = path.resolve(new URL(".", import.meta.url).pathname);
const FIXTURES = path.join(HERE, "fixtures");
const EVIDENCE_ROOT =
    process.env.IC_EVIDENCE_ROOT || path.resolve(HERE, "../../../docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance");
const RESULT_DEADLINE_MS = Number(process.env.REPAIR_DEADLINE_MS || 300_000);

const TOOLS = {
    PRINTING_REPAIR: {
        name: "印花修复",
        route: "/tools/smart-edit/printing-repair",
        baseFixture: "apparel-print.jpg",
        printFixture: "apparel-print-ref.jpg",
        submit: "printing-repair-submit",
        issues: "printing-repair-issues",
    },
    HAND_REPAIR: {
        name: "手部修复",
        route: "/tools/smart-edit/hand-repair",
        baseFixture: "hand-product.jpg",
        submit: "hand-repair-submit",
        issues: "hand-repair-errors",
    },
};

const sha256 = async (file) => {
    const buf = await fs.readFile(file);
    return crypto.createHash("sha256").update(buf).digest("hex");
};

async function attachNetLog(page) {
    const net = [];
    page.on("requestfinished", async (req) => {
        const url = req.url();
        if (!url.includes("23210") && !url.includes("/v1/")) return;
        const res = await req.response().catch(() => null);
        net.push({
            method: req.method(),
            // 不记录 query / header，避免任何凭据进入证据
            url: url.replace(/[?].*$/, ""),
            status: res ? res.status() : null,
            ms: Math.round(req.timing().responseEnd || 0),
            at: new Date().toISOString(),
        });
    });
    page.on("pageerror", (err) => net.push({ pageerror: String(err).slice(0, 300) }));
    return net;
}

const text = (page, sel) =>
    page.evaluate((s) => {
        const el = document.querySelector(s);
        return el ? (el.innerText || "").trim().replace(/\s+/g, " ") : null;
    }, sel);

async function waitForInputReady(page, index, timeout = 120_000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const state = await page.evaluate((i) => {
            const inputs = [...document.querySelectorAll('[data-testid="tool-asset-file-input"]')];
            const el = inputs[i];
            return el ? { count: inputs.length, disabled: el.disabled } : { count: inputs.length, disabled: true };
        }, index);
        if (state.count > index && !state.disabled) return state;
        await sleep(500);
    }
    throw new Error(`上传控件 #${index} 未就绪`);
}

/** 结果图地址：结果区里第一张真实结果图。 */
async function resultSrc(page) {
    return page.evaluate(() => {
        const item = document.querySelector('[data-testid="tool-result-item-0"]');
        const img = item?.querySelector('[data-testid="tool-result-image"]');
        return img ? img.currentSrc || img.src || "" : "";
    });
}

async function fetchBytes(page, src) {
    if (!src) return null;
    if (src.startsWith("data:")) {
        const [head, b64] = src.split(",");
        return Buffer.from(b64 || "", "base64");
    }
    const arr = await page.evaluate(async (url) => {
        const res = await fetch(url);
        const ab = await res.arrayBuffer();
        return Array.from(new Uint8Array(ab));
    }, src);
    return Buffer.from(arr);
}

/** 从应用运行中的任务 store 读本次 task / result item ID（只读内存，不读持久化存储）。 */
async function readTaskIds(page, toolId) {
    return page.evaluate(async (id) => {
        const mod = await import("/src/stores/use-tool-task-store.ts");
        const tasks = Object.values(mod.useToolTaskStore.getState().tasks || {});
        const mine = tasks
            .filter((t) => t && t.toolId === id)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const t = mine[0];
        if (!t) return null;
        return {
            taskId: t.id,
            status: t.status,
            createdAt: t.createdAt,
            capability: t.capability,
            itemIds: (t.items || []).map((item) => item.id),
            itemCount: (t.items || []).length,
            promptChars: (t.prompt || "").length,
            sourceAssetIds: t.sourceAssetIds || [],
            fieldsKeys: Object.keys(t.fields || {}),
            errorCode: t.error?.code || null,
        };
    }, toolId);
}

async function runPrinting(page, recipe, record) {
    const inputs = page.locator('[data-testid="tool-asset-file-input"]');
    record.inputCount = await inputs.count();
    TRACE(`inputs=${record.inputCount}`);

    // Step 1：商品图（有误印花）
    await inputs.nth(0).setInputFiles(path.join(FIXTURES, recipe.baseFixture));
    await waitForInputReady(page, 1);
    record.step2EnabledAfterBase = true;
    TRACE("base uploaded, step2 ready");

    // Step 2：正确印花参考
    await inputs.nth(1).setInputFiles(path.join(FIXTURES, recipe.printFixture));
    await page.waitForSelector('[data-testid="printing-repair-seg"]', { timeout: 120_000 });
    record.segText = await text(page, '[data-testid="printing-repair-seg"]');
    TRACE(`seg=${record.segText}`);

    // Step 3：真实定位交互（滚轮缩放 + 方向键微调 + 拖动 + 撤销/重做）
    // 注意：画布在视口外时 mouse 事件不会命中元素，必须先滚到可视区；滚轮/方向键不依赖
    // pointer capture，比「直接拖」稳定，仍是对真实控件的真实输入。
    const stage = page.locator('[data-testid="printing-repair-stage"]');
    const layer = page.locator('[data-testid="printing-repair-print-layer"]');
    record.scaleBefore = await page.inputValue('[data-testid="printing-repair-scale"]');
    await stage.scrollIntoViewIfNeeded();
    await stage.hover();
    await page.mouse.wheel(0, -120);
    await sleep(400);
    await stage.focus();
    for (const key of ["ArrowRight", "ArrowRight", "ArrowDown"]) {
        await page.keyboard.press(key);
        await sleep(80);
    }
    const box = await layer.boundingBox();
    record.layerBox = box ? { w: Math.round(box.width), h: Math.round(box.height) } : null;
    if (box && box.width > 4 && box.height > 4) {
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + 24, cy + 14, { steps: 8 });
        await page.mouse.up();
        await sleep(300);
    }
    record.undoEnabled = await page.isEnabled('[data-testid="printing-repair-undo"]');
    record.scaleAfter = await page.inputValue('[data-testid="printing-repair-scale"]');
    record.transformLabel = await text(page, '[data-testid="printing-repair-transform-label"]');
    TRACE(`interact undo=${record.undoEnabled} scale ${record.scaleBefore}→${record.scaleAfter} label=${record.transformLabel}`);
    if (record.undoEnabled) {
        await page.click('[data-testid="printing-repair-undo"]', { timeout: 10_000 });
        await sleep(200);
        record.scaleAfterUndo = await page.inputValue('[data-testid="printing-repair-scale"]');
        await page.click('[data-testid="printing-repair-redo"]', { timeout: 10_000 });
        await sleep(200);
        record.scaleAfterRedo = await page.inputValue('[data-testid="printing-repair-scale"]');
    } else {
        record.undoRedoSkipped = "定位交互未产生历史，撤销/重做保持 disabled（记录为门禁未达）";
    }

    record.issuesBeforeSubmit = (await text(page, '[data-testid="printing-repair-issues"]')) || "";
    record.submitBefore = await page.evaluate((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        return el ? { disabled: el.disabled, text: (el.innerText || "").trim() } : null;
    }, recipe.submit);
}

async function runHand(page, recipe, record) {
    const inputs = page.locator('[data-testid="tool-asset-file-input"]');
    record.inputCount = await inputs.count();
    await inputs.nth(0).setInputFiles(path.join(FIXTURES, recipe.baseFixture));
    await page.waitForSelector('[data-testid="hand-repair-canvas"]', { timeout: 120_000 });
    await sleep(2500);

    record.coverageBefore = await text(page, '[data-testid="hand-repair-coverage"]');
    record.personTypeOptions = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="hand-repair-person-type"] option')].map((o) => o.textContent),
    );

    const canvas = page.locator('[data-testid="hand-repair-canvas"]');
    // 画布可能在视口外：先滚入可视区，否则 mouse 事件不落在画布上，覆盖率始终 0。
    await canvas.scrollIntoViewIfNeeded();
    await sleep(300);
    const box = await canvas.boundingBox();
    if (!box) throw new Error("手部蒙版画布未渲染");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const strokes = [
        [
            [-60, -10],
            [-20, 0],
            [20, 12],
            [55, 20],
        ],
        [
            [-40, 35],
            [0, 30],
            [35, 28],
        ],
    ];
    for (const stroke of strokes) {
        const [first, ...rest] = stroke;
        await page.mouse.move(cx + first[0], cy + first[1]);
        await page.mouse.down();
        for (const [dx, dy] of rest) await page.mouse.move(cx + dx, cy + dy, { steps: 8 });
        await page.mouse.up();
        await sleep(150);
    }
    await sleep(800);
    record.coverageAfter = await text(page, '[data-testid="hand-repair-coverage"]');
    record.issuesBeforeSubmit = (await text(page, '[data-testid="hand-repair-errors"]')) || "";
    record.submitBefore = await page.evaluate((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        return el ? { disabled: el.disabled, text: (el.innerText || "").trim() } : null;
    }, recipe.submit);
}

let TRACE = () => {};

async function run(toolId) {
    const recipe = TOOLS[toolId];
    const dir = path.join(EVIDENCE_ROOT, toolId);
    await fs.mkdir(dir, { recursive: true });
    // 逐步进度：实时写 progress.log（脚本只在结尾打印摘要，卡住时无法定位）
    const tracePath = path.join(dir, "progress.log");
    await fs.writeFile(tracePath, `# ${toolId} start ${new Date().toISOString()}\n`);
    TRACE = (msg) => {
        const line = `${new Date().toISOString().slice(11, 23)} ${msg}`;
        try {
            fs.appendFileSync(tracePath, `${line}\n`);
        } catch {}
        console.log(line);
    };

    const record = {
        toolId,
        name: recipe.name,
        route: recipe.route,
        startedAt: new Date().toISOString(),
        steps: [],
    };

    const browser = await launchBrowser({ headless: true });
    TRACE("browser launched");
    let ok = false;
    try {
        const context = await browser.newContext({ viewport: { width: 1512, height: 950 }, locale: "zh-CN" });
        const page = await context.newPage();
        TRACE("page created");
        const net = await attachNetLog(page);
        page.on("request", (req) => {
            const u = req.url();
            if (u.includes("23210") || u.includes("/v1/")) TRACE(`REQ ${req.method()} ${u.slice(0, 110)}`);
        });
        const consoleLines = [];
        page.on("console", (msg) => {
            if (msg.type() === "error") consoleLines.push(String(msg.text()).slice(0, 200));
        });

        await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 120_000 });
        TRACE("home loaded");
        record.provider = await applyProviderConfig(page);
        TRACE(`provider applied channelCount=${record.provider.channelCount} imageModel=${record.provider.imageModel}`);

        await page.goto(`${BASE_URL}${recipe.route}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
        TRACE("route loaded");
        record.urlOnLoad = page.url();
        if (record.urlOnLoad !== `${BASE_URL}${recipe.route}`) {
            throw new Error(`URL 不符：${record.urlOnLoad}`);
        }
        await page.waitForSelector(`[data-testid="${recipe.submit}"]`, { timeout: 60_000 });
        await sleep(1500);

        if (toolId === "PRINTING_REPAIR") await runPrinting(page, recipe, record);
        else await runHand(page, recipe, record);

        if (record.submitBefore && record.submitBefore.disabled) {
            throw new Error(`提交按钮 disabled，issues=${record.issuesBeforeSubmit}`);
        }

        // 真提交
        TRACE(`submitBefore=${JSON.stringify(record.submitBefore)} issues=${record.issuesBeforeSubmit}`);
        await page.click(`[data-testid="${recipe.submit}"]`, { timeout: 20_000 });
        record.steps.push("submitted");
        TRACE("clicked submit");

        // 等真实结果
        const deadline = Date.now() + RESULT_DEADLINE_MS;
        let src = "";
        let round = 0;
        while (Date.now() < deadline) {
            await sleep(5000);
            round += 1;
            src = await resultSrc(page);
            if (src) break;
            const failed = await page.evaluate(() => {
                const el = document.querySelector('[data-testid="tool-result-failed"], [data-testid="tool-result-error"]');
                return el ? (el.innerText || "").trim().slice(0, 300) : "";
            });
            TRACE(`poll#${round} src=${src ? src.slice(0, 40) : "none"} failed=${failed ? failed.slice(0, 80) : "none"}`);
            if (failed) {
                record.failure = failed;
                break;
            }
        }
        record.resultSrcPrefix = src.slice(0, 60);
        if (!src) throw new Error(`未拿到结果图：${record.failure || "超时"}`);

        // 结果字节落盘 + 假阳性防护
        const bytes = await fetchBytes(page, src);
        if (bytes) await fs.writeFile(path.join(dir, "result.png"), bytes);
        record.resultBytes = bytes ? bytes.length : 0;
        record.resultSha = bytes ? crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16) : null;
        record.fixtureSha = (await sha256(path.join(FIXTURES, recipe.baseFixture))).slice(0, 16);
        if (record.resultSha === record.fixtureSha) throw new Error("结果图与源图字节相同（假阳性）");

        record.dims = await page.evaluate(() => {
            const img = document.querySelector('[data-testid="tool-result-item-0"] [data-testid="tool-result-image"]');
            return img ? { w: img.naturalWidth, h: img.naturalHeight } : null;
        });

        // task / result item ID（运行中的任务 store）
        record.task = await readTaskIds(page, toolId);

        // 存入资产
        await page.click('[data-testid="tool-result-save-0"]');
        await page.waitForFunction(
            () => {
                const el = document.querySelector('[data-testid="tool-result-feedback"]');
                return el && /已保存到资产库|失败|错误/.test(el.innerText || "");
            },
            { timeout: 90_000 },
        );
        record.saveFeedback = await text(page, '[data-testid="tool-result-feedback"]');
        record.assetId = (record.saveFeedback || "").match(/已保存到资产库（([^）]+)）/)?.[1] || null;

        // 发送画布
        await page.click('[data-testid="tool-result-canvas-0"]');
        await page.waitForFunction(
            () => {
                const el = document.querySelector('[data-testid="tool-result-feedback"]');
                return el && /已发送到画布|失败|错误/.test(el.innerText || "");
            },
            { timeout: 90_000 },
        );
        record.canvasFeedback = await text(page, '[data-testid="tool-result-feedback"]');
        record.projectId = (record.canvasFeedback || "").match(/已发送到画布（([^）]+)）/)?.[1] || null;

        await page.screenshot({ path: path.join(dir, "ui.png") });

        // 回验 1：资产库出现该结果
        if (record.assetId) {
            await page.goto(`${BASE_URL}/assets`, { waitUntil: "domcontentloaded" });
            record.assetsUrl = page.url();
            await sleep(3500);
            record.assetsHit = await page.evaluate((id) => {
                const body = document.body.innerText;
                const imgs = [...document.querySelectorAll("img")].filter((i) => (i.naturalWidth || 0) > 200).length;
                return { hasId: body.includes(id), bigImages: imgs, titleHit: body.includes("结果 1") };
            }, record.assetId);
            await page.screenshot({ path: path.join(dir, "assets.png") });
        }

        // 回验 2：画布项目页出现新节点图片
        if (record.projectId) {
            await page.goto(`${BASE_URL}/canvas/${record.projectId}`, { waitUntil: "domcontentloaded" });
            record.canvasUrl = page.url();
            await sleep(4000);
            record.canvasNode = await page.evaluate(() => {
                const imgs = [...document.querySelectorAll("img")].filter((i) => (i.naturalWidth || 0) > 200);
                return { bigImages: imgs.length, first: imgs[0] ? { w: imgs[0].naturalWidth, h: imgs[0].naturalHeight } : null };
            });
            await page.screenshot({ path: path.join(dir, "canvas.png") });
        }

        const upstream = net.filter((n) => n.status && n.method === "POST" && /images\/edits|images\/generations/.test(n.url));
        record.upstream = upstream;
        record.network = net.filter((n) => n.status || n.pageerror).slice(-40);
        record.console = consoleLines.slice(0, 10);

        record.ok = Boolean(
            record.resultBytes > 1000 &&
                record.task?.taskId &&
                record.assetId &&
                record.projectId &&
                (record.assetsHit?.hasId || record.assetsHit?.bigImages > 0) &&
                (record.canvasNode?.bigImages || 0) > 0 &&
                upstream.some((u) => u.status === 200),
        );
        ok = record.ok;
    } catch (error) {
        record.error = String(error && error.message ? error.message : error);
        try {
            const pages = browser.contexts()[0]?.pages() || [];
            if (pages[0]) await pages[0].screenshot({ path: path.join(dir, "ui-error.png") });
        } catch {
            /* 截图失败不影响判定 */
        }
    } finally {
        await browser.close();
    }

    record.finishedAt = new Date().toISOString();
    await fs.writeFile(path.join(dir, "run-actions.json"), JSON.stringify(record, null, 2));
    const brief = {
        toolId,
        ok: record.ok,
        error: record.error || null,
        resultSrcPrefix: record.resultSrcPrefix,
        dims: record.dims,
        resultBytes: record.resultBytes,
        task: record.task,
        assetId: record.assetId,
        projectId: record.projectId,
        saveFeedback: record.saveFeedback,
        canvasFeedback: record.canvasFeedback,
        assetsHit: record.assetsHit,
        canvasNode: record.canvasNode,
        upstream: (record.upstream || []).map((u) => ({ status: u.status, ms: u.ms })),
        console: record.console,
    };
    console.log(JSON.stringify(brief, null, 2));
    return ok;
}

const target = process.argv[2];
if (!target || !TOOLS[target]) {
    console.error(`用法：node run-repair-actions.mjs <${Object.keys(TOOLS).join("|")}>`);
    process.exit(2);
}
const ok = await run(target);
process.exit(ok ? 0 : 1);
