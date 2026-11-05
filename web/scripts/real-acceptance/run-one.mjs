/**
 * 真实 UI 验收执行器：一次跑一个工具（`node run-one.mjs AREA_REPAIR`），
 * 也可 `node run-one.mjs all` 顺序跑完 8 个。
 *
 * 每个工具都做真实的：上传真实 JPG → 在画布上用鼠标涂抹 → 填写真实描述 →
 * 点击真实提交按钮 → 等真实 provider 返回（经本机 canvas-proxy）。
 *
 * 证据落盘：evidence/real-acceptance/<TOOL>/
 *   ui.png            完成后整页截图
 *   result.png        结果图（能取到 data:/blob: 时）
 *   step-*.png        关键步骤截图
 *   run.json          控件状态 / issue 文本 / 网络记录 / 结果判定
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { BASE_URL, EVIDENCE_ROOT, launchBrowser, prepareContext, sleep } from "./lib.mjs";
import { applyProviderConfig } from "./provider.mjs";

/** IC_REAL_PROVIDER=1：从 keychain 注入真实图像渠道（只回报长度，不打印密钥）。 */
const REAL_PROVIDER = process.env.IC_REAL_PROVIDER === "1";

const FIXTURES = path.resolve("scripts/real-acceptance/fixtures");

/** 逐字节哈希：结果图必须≠上传源图，否则只是把源图预览当成了生成结果。 */
async function fileSha256(filePath) {
    const buf = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(buf).digest("hex");
}

const RECIPES = {
    IMAGE_CROP: {
        route: "/tools/smart-edit/image-crop",
        fixture: "product-watch.jpg",
        run: async (page) => {
            await upload(page, '[data-testid=tool-asset-file-input]', "product-watch.jpg");
            await sleep(1500);
            await page.click('[data-testid=crop-platform-amazon]').catch(() => null);
            await sleep(600);
            await page.click('[data-testid=crop-submit]');
            await sleep(2500);
        },
    },
    PRODUCT_REFINE: {
        route: "/tools/smart-edit/product-refine",
        fixture: "product-watch.jpg",
        run: async (page) => {
            await upload(page, '[data-testid=tool-asset-file-input]', "product-watch.jpg");
            await sleep(2500);
            await page.click('[data-testid=refine-generate]');
        },
    },
    FIX_COLOR: {
        route: "/tools/smart-edit/fix-color",
        fixture: "product-watch.jpg",
        run: async (page) => {
            await upload(page, '[data-testid=tool-asset-file-input]', "product-watch.jpg");
            await sleep(2500);
            await paint(page, "[data-testid=fix-color-mask-canvas]");
            await sleep(800);
            await page.click('[data-testid=fix-color-submit]');
        },
    },
    AREA_REPAIR: {
        route: "/tools/smart-edit/area-repair",
        fixture: "product-watch.jpg",
        run: async (page) => {
            await upload(page, '[data-testid=tool-asset-file-input]', "product-watch.jpg");
            await sleep(2500);
            await paint(page, "[data-testid=mask-canvas]");
            await page.fill("[data-testid=area-repair-prompt]", "把表盘上的细小划痕抹掉，保留金属拉丝质感与原有反光");
            await sleep(500);
            await page.click('[data-testid=area-repair-submit]');
        },
    },
    REMOVE_PEN: {
        route: "/tools/smart-edit/remove-pen",
        fixture: "product-watch.jpg",
        run: async (page) => {
            await upload(page, '[data-testid=tool-asset-file-input]', "product-watch.jpg");
            await sleep(2500);
            await paint(page, "[data-testid=remove-pen-canvas]");
            await sleep(800);
            await page.click('[data-testid=remove-pen-submit]');
        },
    },
    HAND_REPAIR: {
        route: "/tools/smart-edit/hand-repair",
        resultSelector: "[data-testid=hand-repair-results] img",
        fixture: "hand-product.jpg",
        run: async (page) => {
            await upload(page, '[data-testid=tool-asset-file-input]', "hand-product.jpg");
            await sleep(2500);
            await paint(page, "[data-testid=hand-repair-canvas]");
            await sleep(600);
            await page.locator("[data-testid=hand-repair-person-type]").first().click();
            await sleep(400);
            await page.click('[data-testid=hand-repair-submit]');
        },
    },
    CHANGE_COLOR: {
        route: "/tools/smart-edit/change-color",
        fixture: "apparel-print.jpg",
        run: async (page) => {
            await upload(page, '[data-testid=change-color-source] input[type=file]', "apparel-print.jpg");
            await sleep(2500);
            await page.fill("[data-testid=change-color-hex]", "#2E6BE6");
            await page.locator("[data-testid=change-color-hex]").blur();
            await sleep(600);
            await page.click('[data-testid=change-color-submit]');
        },
    },
    PRINTING_REPAIR: {
        route: "/tools/smart-edit/printing-repair",
        fixture: "apparel-print.jpg",
        run: async (page) => {
            const inputs = page.locator("input[type=file]");
            await inputs.nth(0).setInputFiles(path.join(FIXTURES, "apparel-print.jpg"));
            await sleep(2500);
            await inputs.nth(1).setInputFiles(path.join(FIXTURES, "apparel-print.jpg"));
            await sleep(6000);
            await page.click('[data-testid=printing-repair-submit]');
        },
    },
};

async function upload(page, selector, file) {
    const input = page.locator(selector).first();
    await input.setInputFiles(path.join(FIXTURES, file));
}

/** 在蒙版画布上用真实鼠标事件画三笔，覆盖画面中部。 */
async function paint(page, selector) {
    const canvas = page.locator(selector).first();
    await canvas.waitFor({ state: "visible", timeout: 15000 });
    const box = await canvas.boundingBox();
    if (!box) throw new Error(`画布不可见：${selector}`);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const strokes = [
        [
            [-60, -40],
            [0, -10],
            [40, 10],
            [60, 30],
        ],
        [
            [-50, 40],
            [-10, 30],
            [30, 35],
        ],
        [
            [-30, 0],
            [3, -35],
            [35, -20],
        ],
    ];
    for (const stroke of strokes) {
        const [first, ...rest] = stroke;
        await page.mouse.move(cx + first[0], cy + first[1]);
        await page.mouse.down();
        for (const [dx, dy] of rest) {
            await page.mouse.move(cx + dx, cy + dy, { steps: 6 });
        }
        await page.mouse.up();
        await sleep(120);
    }
}

async function snapshot(page) {
    return page.evaluate(() => {
        const t = (el) => el.getAttribute("data-testid") || "";
        const vis = (el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        };
        const imgs = [...document.querySelectorAll("img")]
            .filter(vis)
            .map((el) => ({ src: (el.currentSrc || el.src || "").slice(0, 60), w: el.naturalWidth, h: el.naturalHeight }))
            .filter((i) => i.src && !i.src.includes("logo"));
        return {
            submitButtons: [...document.querySelectorAll("button")]
                .filter((el) => vis(el) && /submit|generate|开始|生成|应用/.test(`${t(el)} ${el.innerText}`))
                .map((el) => ({ id: t(el), text: el.innerText.trim().slice(0, 14), disabled: el.disabled })),
            issues: [...document.querySelectorAll('[data-testid$="-issues"], [data-testid$="-notice"], [data-testid$="-error"]')]
                .filter(vis)
                .map((el) => `${t(el)}=${el.innerText.trim().slice(0, 120)}`),
            images: imgs,
            bodyText: document.body.innerText.replace(/\n{2,}/g, "\n").slice(0, 900),
        };
    });
}

/** 结果图：提交后出现的、尺寸够大的第一张非源图图片。 */
async function grabResult(page, before, resultSelector) {
    const cand = await page.evaluate(({ beforeSrc, resultSelector }) => {
        const vis = (el) => {
            const r = el.getBoundingClientRect();
            return r.width > 120 && r.height > 120;
        };
        const bigEnough = (el) => (el.naturalWidth || 0) > 200;
        const srcOf = (el) => el.currentSrc || el.src || "";
        // 配方指定了结果容器：只认这里（工作台自绘结果网格，不走共享 ToolResult）
        if (resultSelector) {
            const own = [...document.querySelectorAll(resultSelector)].filter((el) => srcOf(el));
            return own.length ? srcOf(own[own.length - 1]) : "";
        }

        // 第零优先：共享结果组件 ToolResult 的结果图（对比滑块、源图条带都不在这里）。
        const shared = [...document.querySelectorAll("[data-testid=tool-result-image]")].filter((el) => srcOf(el));
        if (shared.length) return srcOf(shared[shared.length - 1]);

        // 第一优先：结果区容器里的图（各工作台用 `<tool>-result(s)` 命名）。
        // 只看这里能避免把「上传后的源图预览」当成生成结果（假阳性）。
        const scopes = [...document.querySelectorAll('[data-testid*="result"]')].filter(
            (el) => !/empty|status|stale|feedback/.test(el.getAttribute("data-testid") || ""),
        );
        const scoped = scopes
            .flatMap((scope) => [...scope.querySelectorAll("img")])
            .filter((el) => vis(el) && bigEnough(el));
        if (scoped.length) return srcOf(scoped[scoped.length - 1]);

        // 退路：页面上确实没有结果区容器时才用全局启发式，且必须排除提交前已存在/同一 URL 的图。
        const known = new Set(beforeSrc);
        const imgs = [...document.querySelectorAll("img")]
            .filter((el) => vis(el) && bigEnough(el))
            .filter((el) => !known.has(srcOf(el)))
            .filter((el) => !beforeSrc.some((s) => s && s.slice(0, 60) === srcOf(el).slice(0, 60)));
        const last = imgs[imgs.length - 1];
        return last ? srcOf(last) : "";
    }, { beforeSrc: before, resultSelector });
    return cand;
}

async function saveImage(page, src, filePath) {
    if (!src) return false;
    if (src.startsWith("data:")) {
        const base64 = src.split(",")[1] || "";
        await fs.writeFile(filePath, Buffer.from(base64, "base64"));
        return true;
    }
    if (src.startsWith("blob:")) {
        const bytes = await page.evaluate(async (url) => {
            const res = await fetch(url);
            const buf = await res.arrayBuffer();
            return Array.from(new Uint8Array(buf));
        }, src);
        await fs.writeFile(filePath, Buffer.from(bytes));
        return true;
    }
    if (src.startsWith("http")) {
        const res = await page.request.get(src);
        if (res.ok()) {
            await fs.writeFile(filePath, await res.body());
            return true;
        }
    }
    return false;
}

async function runTool(toolId) {
    const recipe = RECIPES[toolId];
    if (!recipe) throw new Error(`没有该工具的验收配方：${toolId}`);
    const dir = path.join(EVIDENCE_ROOT, toolId);
    await fs.mkdir(dir, { recursive: true });

    const browser = await launchBrowser();
    const { context, page, network } = await prepareContext(browser);
    const record = { toolId, route: recipe.route, fixture: recipe.fixture, startedAt: new Date().toISOString() };

    try {
        if (REAL_PROVIDER) record.provider = await applyProviderConfig(page);
        await page.goto(`${BASE_URL}${recipe.route}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("[data-testid=tool-workspace]", { timeout: 25000 });
        await sleep(1200);
        const before = await snapshot(page);
        record.before = { images: before.images.map((i) => i.src), issues: before.issues };
        await page.screenshot({ path: path.join(dir, "step-1-loaded.png") });

        const submitBefore = before.submitButtons.find((b) => /submit|generate/.test(b.id));
        record.submitBefore = submitBefore || null;

        await recipe.run(page);
        await sleep(1500);
        await page.screenshot({ path: path.join(dir, "step-2-submitted.png") });

        // 等结果：最多 300 秒，出现新的大图或明确错误就收手
        const deadline = Date.now() + 300_000;
        let resultSrc = "";
        let lastSnap = null;
        while (Date.now() < deadline) {
            await sleep(5000);
            resultSrc = await grabResult(page, before.images.map((i) => i.src), recipe.resultSelector);
            lastSnap = await snapshot(page);
            const err = lastSnap.issues.find((i) => /error|失败|错误/.test(i));
            const pending = lastSnap.submitButtons.some((b) => /submit|generate/.test(b.id) && b.disabled);
            // 提交中时结果区里可能只有源图预览，必须等按钮退出 pending 再判定
            if (pending) continue;
            if (resultSrc || err) break;
        }

        record.finishedAt = new Date().toISOString();
        record.after = lastSnap;
        record.resultSrcPrefix = resultSrc.slice(0, 40);
        record.resultSaved = await saveImage(page, resultSrc, path.join(dir, "result.png"));
        record.network = network.filter((n) => n.method === "POST");

        // 假阳性防护：本次源图哈希 == 结果图哈希 时，说明抓到的是上传预览，不是生成结果。
        const fixtureSha = await fileSha256(path.join(FIXTURES, recipe.fixture));
        record.fixtureSha256 = fixtureSha.slice(0, 16);
        if (record.resultSaved) {
            const resultSha = await fileSha256(path.join(dir, "result.png"));
            record.resultSha256 = resultSha.slice(0, 16);
            if (resultSha === fixtureSha) {
                record.bogusSourceEcho = true;
                record.resultSaved = false;
                await fs.rm(path.join(dir, "result.png"), { force: true });
            }
        }
        record.ok = Boolean(resultSrc) && record.resultSaved === true && !record.bogusSourceEcho;
        // 结果动作：真实点击「下载」，校验下载字节与源图不同
        const dl = page.locator("[data-testid=tool-result-download-0]").first();
        if (record.ok && (await dl.count())) {
            const [download] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), dl.click()]);
            const file = path.join(dir, `download-${download.suggestedFilename()}`);
            await download.saveAs(file);
            const sha = await fileSha256(file);
            record.download = { file: path.basename(file), bytes: (await fs.stat(file)).size, sha256: sha.slice(0, 16), differsFromSource: sha !== fixtureSha };
        }
        await page.screenshot({ path: path.join(dir, "ui.png") });
    } catch (error) {
        record.error = String(error && error.message ? error.message : error);
        record.ok = false;
        await page.screenshot({ path: path.join(dir, "ui-error.png") }).catch(() => null);
    } finally {
        await fs.writeFile(path.join(dir, "run.json"), JSON.stringify(record, null, 2));
        await browser.close();
    }
    console.log(JSON.stringify({ toolId, ok: record.ok, error: record.error || null, resultSaved: record.resultSaved || false, download: record.download || null, network: (record.network || []).length, issues: (record.after && record.after.issues) || [] }));
    return record.ok;
}

const target = process.argv[2] || "all";
if (target === "all") {
    const results = {};
    for (const id of Object.keys(RECIPES)) {
        results[id] = await runTool(id);
        await fs.writeFile(path.join(EVIDENCE_ROOT, "summary.json"), JSON.stringify(results, null, 2));
    }
    process.exit(Object.values(results).every(Boolean) ? 0 : 1);
} else {
    const ok = await runTool(target);
    process.exit(ok ? 0 : 1);
}
