/**
 * 智能编辑 6 工具 · ccai-tmp 真实 UI 复测执行器。
 *
 * 与 run-one.mjs 的差别（这是本次复测必须补的部分）：
 *   1. 显式注入 ccai-tmp 渠道（provider.mjs：keychain 只在内存里传递，不打印不落盘），
 *      不再依赖应用 defaultConfig 里的渠道；
 *   2. 结果门禁除「拿到真实结果图」外，还看结果面板暴露了哪些动作
 *      （存入资产 / 发送画布 / 下载），据此判定能不能满足「落库 + 画布」；
 *   3. 用「刷新后结果是否还在」判断落库，不读任何浏览器存储；
 *   4. 输出 result.json（与 SDS_DESIGN/result.json 同结构）。
 *
 * 用法：node run-edit6.mjs CHANGE_COLOR
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { BASE_URL, EVIDENCE_ROOT, applyProxyConfig, launchBrowser, sleep } from "./lib.mjs";
import { applyProviderConfig } from "./provider.mjs";

const FIXTURES = path.resolve("scripts/real-acceptance/fixtures");

const TOOLS = {
    CHANGE_COLOR: {
        name: "一键换色",
        route: "/tools/smart-edit/change-color",
        fixture: "apparel-print.jpg",
        submit: "change-color-generate",
        steps: async (page) => {
            await upload(page, "[data-testid=change-color-workspace] input[type=file]", "apparel-print.jpg");
            await sleep(2500);
            await page.fill("[data-testid=change-color-hex]", "#2E6BE6");
            await page.locator("[data-testid=change-color-hex]").blur();
            await sleep(600);
            await page.click("[data-testid=change-color-generate]");
        },
    },
    FIX_COLOR: {
        name: "修复偏色",
        route: "/tools/smart-edit/fix-color",
        fixture: "product-watch.jpg",
        submit: "fix-color-submit",
        steps: async (page) => {
            await upload(page, "[data-testid=tool-asset-file-input]", "product-watch.jpg");
            await sleep(2500);
            await paint(page, "[data-testid=fix-color-mask-canvas]");
            await sleep(800);
            await page.click("[data-testid=fix-color-submit]");
        },
    },
    HAND_REPAIR: {
        name: "手部修复",
        route: "/tools/smart-edit/hand-repair",
        fixture: "hand-product.jpg",
        submit: "hand-repair-submit",
        steps: async (page) => {
            await upload(page, "[data-testid=tool-asset-file-input]", "hand-product.jpg");
            await sleep(2500);
            await paint(page, "[data-testid=hand-repair-canvas]");
            await sleep(600);
            await page.locator("[data-testid=hand-repair-person-type]").first().click().catch(() => null);
            await sleep(400);
            await page.click("[data-testid=hand-repair-submit]");
        },
    },
    PRINTING_REPAIR: {
        name: "印花修复",
        route: "/tools/smart-edit/printing-repair",
        fixture: "apparel-print.jpg",
        submit: "printing-repair-submit",
        steps: async (page) => {
            const inputs = page.locator("input[type=file]");
            await inputs.nth(0).setInputFiles(path.join(FIXTURES, "apparel-print.jpg"));
            await sleep(2500);
            await inputs.nth(1).setInputFiles(path.join(FIXTURES, "apparel-print.jpg"));
            await sleep(6000);
            await page.click("[data-testid=printing-repair-submit]");
        },
    },
    PRODUCT_REFINE: {
        name: "商品精修",
        route: "/tools/smart-edit/product-refine",
        fixture: "product-watch.jpg",
        submit: "refine-generate",
        steps: async (page) => {
            await upload(page, "[data-testid=tool-asset-file-input]", "product-watch.jpg");
            await sleep(2500);
            await page.click("[data-testid=refine-generate]");
        },
    },
    REMOVE_PEN: {
        name: "消除笔",
        route: "/tools/smart-edit/remove-pen",
        fixture: "product-watch.jpg",
        submit: "remove-pen-submit",
        steps: async (page) => {
            await upload(page, "[data-testid=tool-asset-file-input]", "product-watch.jpg");
            await sleep(2500);
            await paint(page, "[data-testid=remove-pen-canvas]");
            await sleep(800);
            await page.click("[data-testid=remove-pen-submit]");
        },
    },
};

async function sha256(filePath) {
    const buf = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(buf).digest("hex");
}

async function upload(page, selector, file) {
    await page.locator(selector).first().setInputFiles(path.join(FIXTURES, file));
}

/** 在蒙版画布上画三笔（真实鼠标事件，覆盖画面中部）。 */
async function paint(page, selector) {
    const canvas = page.locator(selector).first();
    await canvas.waitFor({ state: "visible", timeout: 20000 });
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
        for (const [dx, dy] of rest) await page.mouse.move(cx + dx, cy + dy, { steps: 6 });
        await page.mouse.up();
        await sleep(120);
    }
}

/** 页面状态快照：提交按钮、提示、图片、结果区动作按钮。 */
async function snapshot(page) {
    return page.evaluate(() => {
        const tid = (el) => el.getAttribute("data-testid") || "";
        const vis = (el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        };
        const text = (el) => (el.innerText || "").trim().replace(/\s+/g, " ");
        const imgs = [...document.querySelectorAll("img")]
            .filter(vis)
            .map((el) => ({ src: (el.currentSrc || el.src || "").slice(0, 48), w: el.naturalWidth, h: el.naturalHeight }))
            .filter((i) => i.src && !/logo/i.test(i.src));
        const resultScopes = [...document.querySelectorAll('[data-testid*="result"]')].filter(
            (el) => !/empty|status|stale|feedback/.test(tid(el)),
        );
        return {
            buttons: [...document.querySelectorAll("button")].filter(vis).map((el) => ({
                id: tid(el),
                text: text(el).slice(0, 16),
                disabled: el.disabled,
            })),
            resultActions: resultScopes
                .flatMap((scope) => [...scope.querySelectorAll("button, a")])
                .filter(vis)
                .map((el) => ({ id: tid(el), text: text(el).slice(0, 16), disabled: !!el.disabled })),
            issues: [...document.querySelectorAll('[data-testid$="-issues"], [data-testid$="-notice"], [data-testid$="-error"]')]
                .filter(vis)
                .map((el) => `${tid(el)}=${text(el).slice(0, 160)}`),
            images: imgs,
            bodyText: document.body.innerText.replace(/\n{2,}/g, "\n").slice(0, 1200),
        };
    });
}

/** 结果图：结果区里的第一张「新」图（<img> 或 CSS background-image）。 */
async function grabResult(page, beforeSrcPrefixes) {
    return page.evaluate((before) => {
        const tid = (el) => el.getAttribute("data-testid") || "";
        const box = (el) => {
            const r = el.getBoundingClientRect();
            return { w: r.width, h: r.height };
        };
        const vis = (el) => {
            const r = box(el);
            return r.w > 60 && r.h > 60;
        };
        const bgUrl = (el) => {
            const bg = getComputedStyle(el).backgroundImage || "";
            const m = bg.match(/url\(["']?(.*?)["']?\)/);
            return m ? m[1] : "";
        };
        const scopes = [...document.querySelectorAll('[data-testid*="result"]')].filter(
            (el) => !/empty|status|stale|feedback/.test(tid(el)),
        );
        const cands = [];
        for (const scope of scopes) {
            for (const el of scope.querySelectorAll("img")) {
                if (!vis(el)) continue;
                const src = el.currentSrc || el.src || "";
                // 结果图可能因 loading="lazy" 离屏而未解码（naturalWidth=0），不能据此丢弃。
                if (/^(data:image\/|blob:|https?:)/.test(src)) cands.push(src);
            }
            for (const el of scope.querySelectorAll("*")) {
                if (el.tagName === "IMG" || !vis(el)) continue;
                const url = bgUrl(el);
                if (url && !/gradient/.test(url)) cands.push(url);
            }
        }
        const uniq = [...new Set(cands)];
        const fresh = uniq.find((s) => !before.includes(s.slice(0, 48)));
        return fresh || uniq[0] || "";
    }, beforeSrcPrefixes);
}

async function saveImage(page, src, filePath) {
    if (!src) return false;
    if (src.startsWith("data:")) {
        const base64 = src.split(",")[1] || "";
        const bytes = Buffer.from(base64, "base64");
        if (!bytes.length) return false;
        await fs.writeFile(filePath, bytes);
        return true;
    }
    if (src.startsWith("blob:") || src.startsWith("http")) {
        const arr = await page.evaluate(async (url) => {
            const res = await fetch(url);
            return Array.from(new Uint8Array(await res.arrayBuffer()));
        }, src);
        if (!arr.length) return false;
        await fs.writeFile(filePath, Buffer.from(arr));
        return true;
    }
    return false;
}

async function runTool(toolId) {
    const recipe = TOOLS[toolId];
    if (!recipe) throw new Error(`未收录工具：${toolId}`);
    const verbose = process.env.EDIT6_VERBOSE === "1";
    const dir = path.join(EVIDENCE_ROOT, toolId);
    await fs.mkdir(dir, { recursive: true });

    const record = { toolId, name: recipe.name, route: recipe.route, fixture: recipe.fixture, startedAt: new Date().toISOString() };
    const browser = await launchBrowser({ headless: process.env.EDIT6_HEADED === "1" ? false : true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
    const network = [];
    // 全量抓包：任何非静态资源请求都记（避免只看 /v1/ 漏掉应用自己的中转端点）。
    const staticRe = /\.(js|css|png|jpg|jpeg|webp|svg|woff2?|ts|tsx|map)(\?|$)/;
    page.on("requestfinished", async (req) => {
        const url = req.url();
        if (staticRe.test(url)) return;
        const res = await req.response().catch(() => null);
        network.push({ method: req.method(), url: url.slice(0, 140), status: res ? res.status() : null, ms: Math.round(req.timing().responseEnd || 0), at: new Date().toISOString() });
    });
    page.on("requestfailed", (req) => {
        const url = req.url();
        if (staticRe.test(url)) return;
        network.push({ method: req.method(), url: url.slice(0, 140), failed: String(req.failure()?.errorText || "").slice(0, 80), at: new Date().toISOString() });
    });
    page.on("pageerror", (err) => network.push({ pageerror: String(err).slice(0, 300), at: new Date().toISOString() }));
    // 请求「发起」事件：用于判断提交是否真的点上了（requestfinished 要等响应才记录）。
    const requestStarted = [];
    page.on("request", (req) => {
        if (req.method() === "POST") requestStarted.push(req.url());
    });
    const consoleLines = [];
    page.on("console", (msg) => {
        if (msg.type() === "error" || msg.type() === "warning") consoleLines.push(`${msg.type()}: ${msg.text().slice(0, 200)}`);
    });

    try {
        // 页面内 fetch 记录：Playwright 的 request 事件看不到 Service Worker / 部分 blob 取字节，
        // 这里包一层 window.fetch 才能判定「到底有没有发请求」。
        await page.addInitScript(() => {
            const log = [];
            const orig = window.fetch;
            window.fetch = function (input, init) {
                const url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
                const entry = { url: String(url).slice(0, 120), start: Date.now(), end: null, status: null, err: null };
                log.push(entry);
                return orig
                    .apply(this, arguments)
                    .then((res) => {
                        entry.end = Date.now();
                        entry.status = res.status;
                        return res;
                    })
                    .catch((e) => {
                        entry.end = Date.now();
                        entry.err = String(e && e.message ? e.message : e).slice(0, 120);
                        throw e;
                    });
            };
            window.__fetchLog = log;
        });
        await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
        await applyProxyConfig(page);
        record.provider = await applyProviderConfig(page); // ccai-tmp 注入（只在内存）
        await page.goto(`${BASE_URL}${recipe.route}`, { waitUntil: "domcontentloaded", timeout: 120000 });
        await page.waitForSelector("[data-testid=tool-workspace]", { timeout: 60000 });
        await sleep(1500);
        const before = await snapshot(page);
        record.beforeIssues = before.issues;
        await page.screenshot({ path: path.join(dir, "step-1-loaded.png") });

        await recipe.steps(page);
        await sleep(2000);
        await page.screenshot({ path: path.join(dir, "step-2-submitted.png") });

        // 提交补点：按钮刚从禁用变可用时，首次点击常被吞掉（尤其涂抹/上传后）。
        // 判定标准是「有没有真的发出上游请求」，而不是按钮文案。
        const submitSel = `[data-testid="${recipe.submit}"]`;
        record.submitAttempts = 1;
        for (let i = 0; i < 3; i++) {
            await sleep(8000);
            if (requestStarted.some((u) => u.includes("23210") || u.includes("/v1/"))) break;
            const btn = page.locator(submitSel).first();
            const enabled = await btn.isEnabled().catch(() => false);
            record.submitAttempts += 1;
            if (enabled) await btn.click({ timeout: 8000 }).catch(() => {});
        }
        record.requestStarted = requestStarted.filter((u) => u.includes("23210") || u.includes("/v1/")).slice(0, 4);

        const beforeSrcs = before.images.map((i) => i.src);
        const deadline = Date.now() + (process.env.EDIT6_DEADLINE_MS ? Number(process.env.EDIT6_DEADLINE_MS) : 180_000);
        let resultSrc = "";
        let last = null;
        while (Date.now() < deadline) {
            await sleep(5000);
            resultSrc = await grabResult(page, beforeSrcs);
            last = await snapshot(page);
            const err = last.issues.find((i) => /error|失败|错误/.test(i));
            const pending = last.buttons.some((b) => b.id === recipe.submit && b.disabled);
            if (resultSrc) break;
            if (err && !pending) break;
        }

        record.finishedAt = new Date().toISOString();
        record.resultSrcPrefix = resultSrc.slice(0, 40);
        record.resultSaved = await saveImage(page, resultSrc, path.join(dir, "result.png"));
        record.resultActions = last ? last.resultActions : [];
        record.issues = last ? last.issues : [];
        record.submitAfter = last ? last.buttons.find((b) => b.id === recipe.submit) || null : null;
        record.network = network.filter((n) => n.method === "POST" || n.pageerror);
        if (verbose) {
            record.pageFetchLog = await page.evaluate(() => (window.__fetchLog || []).slice(-40)).catch(() => []);
            record.bodyText = (await page.evaluate(() => document.body.innerText)).slice(0, 1200);
            record.resultDom = await page
                .evaluate(() => {
                    const scopes = [...document.querySelectorAll('[data-testid*="result"]')].filter(
                        (el) => !/empty|status|stale|feedback/.test(el.getAttribute("data-testid") || ""),
                    );
                    return scopes.map((s) => s.outerHTML.slice(0, 1500)).join("\n---\n").slice(0, 3000);
                })
                .catch(() => "");
        }
        await page.screenshot({ path: path.join(dir, "ui.png") });

        // 假阳性防护：结果图 == 源图 时不算通过。
        const fixtureSha = await sha256(path.join(FIXTURES, recipe.fixture));
        record.fixtureSha = fixtureSha.slice(0, 16);
        if (record.resultSaved) {
            const resultSha = await sha256(path.join(dir, "result.png"));
            record.resultSha = resultSha.slice(0, 16);
            if (resultSha === fixtureSha) {
                record.bogusSourceEcho = true;
                record.resultSaved = false;
                await fs.rm(path.join(dir, "result.png"), { force: true });
            }
        }

        // 落库：刷新后结果还在？（不读存储，只看 UI）
        if (record.resultSaved) {
            await page.reload({ waitUntil: "domcontentloaded" });
            await sleep(4000);
            const after = await snapshot(page);
            record.afterReload = { images: after.images.length, hasResult: after.images.some((i) => i.w > 200), actions: after.resultActions };
        }
    } catch (error) {
        record.error = String(error && error.message ? error.message : error);
        await page.screenshot({ path: path.join(dir, "ui-error.png") }).catch(() => null);
    } finally {
        await browser.close();
    }

    record.ok = Boolean(record.resultSaved);
    record.console = consoleLines.slice(0, 30);
    await fs.writeFile(path.join(dir, "run-edit6.json"), JSON.stringify(record, null, 2));
    console.log(JSON.stringify({ toolId, ok: record.ok, error: record.error || null, resultActions: record.resultActions, issues: record.issues, console: record.console.slice(0, 6), network: record.network || [], afterReload: record.afterReload || null }, null, 2));
    return record.ok;
}

const target = process.argv[2];
if (!target || !TOOLS[target]) {
    console.error(`用法：node run-edit6.mjs <${Object.keys(TOOLS).join("|")}>`);
    process.exit(2);
}
const ok = await runTool(target);
process.exit(ok ? 0 : 1);
