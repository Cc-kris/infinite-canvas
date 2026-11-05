/**
 * PRODUCT_REFINE / FIX_COLOR · ccai-tmp 真机真上游复测（含 P0 blob 源图回归）。
 *
 * 与 run-edit6.mjs 的差别：
 *   1. 额外点『存入资产』『发送画布』并各自核对落库结果（新标签页读 UI，不看存储）；
 *   2. 记录本地 taskId / upstreamTaskId / 结果项 id / 上游响应 request-id；
 *   3. 上传后先断言源图是 `blob:`（P0：065fc58 修复点），再提交；
 *   4. 每一步核对 URL，失败即记录并截图。
 *
 * 用法：node run-pr-fc.mjs PRODUCT_REFINE
 *       node run-pr-fc.mjs FIX_COLOR
 * 环境：IC_BASE_URL（默认 http://127.0.0.1:3000）、IC_HEADED=1 开有头。
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { BASE_URL, EVIDENCE_ROOT, launchBrowser, sleep } from "./lib.mjs";
import { applyProviderConfig } from "./provider.mjs";

const FIXTURES = path.resolve("scripts/real-acceptance/fixtures");

const TOOLS = {
    PRODUCT_REFINE: {
        name: "商品精修",
        route: "/tools/smart-edit/product-refine",
        fixture: "product-watch.jpg",
        saveTitle: "生成结果",
        submit: "[data-testid=refine-generate]",
        steps: async (page) => {
            await upload(page, "[data-testid=tool-asset-file-input]", "product-watch.jpg");
            await sleep(2500);
        },
    },
    FIX_COLOR: {
        name: "色差修复",
        route: "/tools/smart-edit/fix-color",
        fixture: "product-watch.jpg",
        saveTitle: "色差修复结果",
        submit: "[data-testid=fix-color-submit]",
        steps: async (page) => {
            await upload(page, "[data-testid=tool-asset-file-input]", "product-watch.jpg");
            await sleep(2500);
            await paint(page, "[data-testid=fix-color-mask-canvas]");
            await sleep(900);
        },
    },
};

async function sha256(buf) {
    return crypto.createHash("sha256").update(buf).digest("hex");
}

async function upload(page, selector, file) {
    await page.locator(selector).first().setInputFiles(path.join(FIXTURES, file));
}

/** 真实鼠标在蒙版画布上画三笔。 */
async function paint(page, selector) {
    const canvas = page.locator(selector).first();
    await canvas.waitFor({ state: "visible", timeout: 20000 });
    const box = await canvas.boundingBox();
    if (!box) throw new Error(`画布不可见：${selector}`);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const strokes = [
        [[-60, -40], [0, -10], [40, 10], [60, 30]],
        [[-50, 40], [-10, 30], [30, 35]],
        [[-30, 0], [3, -35], [35, -20]],
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

/** 等提交按钮可用并真实点击；禁用时把页面可见校验信息一并抛出。 */
async function submitWhenReady(page, selector) {
    const btn = page.locator(selector).first();
    await btn.waitFor({ state: "visible", timeout: 20000 });
    const deadline = Date.now() + 30000;
    let snap = null;
    while (Date.now() < deadline) {
        snap = await page.evaluate((sel) => {
            const b = document.querySelector(sel);
            const txt = (e) => (e ? (e.innerText || "").trim().replace(/\s+/g, " ").slice(0, 200) : "");
            return {
                found: Boolean(b),
                disabled: b ? b.disabled : null,
                label: txt(b),
                issues: [...document.querySelectorAll('[data-testid$="-issues"]')].map((e) => txt(e)).filter(Boolean),
                errors: [...document.querySelectorAll('[data-testid$="-error"]')].map((e) => txt(e)).filter(Boolean),
                imgs: [...document.querySelectorAll("img")].map((i) => (i.currentSrc || i.src || "").slice(0, 30)),
            };
        }, selector);
        if (snap.found && snap.disabled === false) break;
        await sleep(1000);
    }
    if (!snap || snap.disabled !== false) throw new Error(`提交按钮不可用：${JSON.stringify(snap)}`);
    // 真实鼠标坐标点击 + 运行态校验；点不中时重试（按钮偶尔被浮层挡住会静默无效）。
    let clicked = false;
    for (let attempt = 0; attempt < 3 && !clicked; attempt += 1) {
        const box = await btn.boundingBox();
        if (box) {
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        } else {
            await btn.click({ force: true });
        }
        for (let i = 0; i < 10; i += 1) {
            await sleep(700);
            const running = await page
                .evaluate(async () => {
                    const mod = await import("/src/stores/use-tool-task-store.ts");
                    const n = Object.keys(mod.useToolTaskStore.getState().tasks || {}).length;
                    const b = document.querySelector("[data-testid=refine-generate]");
                    return n > 0 || Boolean(b && /中…|中\.\.\./.test(b.innerText || ""));
                })
                .catch(() => false);
            if (running) { clicked = true; break; }
        }
    }
    snap.clickAttempts = clicked ? "ok" : "no-effect";
    // 代理可能正在重启：轮询等待任务真正建立（最长 120s），而不是固定 6s 快速失败。
    for (let i = 0; i < 40; i += 1) {
        await sleep(3000);
        const n = await page
            .evaluate(async () => {
                const mod = await import("/src/stores/use-tool-task-store.ts");
                return Object.keys(mod.useToolTaskStore.getState().tasks || {}).length;
            })
            .catch(() => -1);
        if (n > 0) break;
    }
    const after = await page.evaluate(async () => {
        let tasks = null;
        try {
            const mod = await import("/src/stores/use-tool-task-store.ts");
            const all = Object.values(mod.useToolTaskStore.getState().tasks || {});
            tasks = all.map((t) => ({ id: t.id, toolId: t.toolId, status: t.status }));
        } catch (e) {
            tasks = String(e);
        }
        const toasts = [...document.querySelectorAll(".ant-message-notice-content, [role=alert]")].map((e) => (e.innerText || "").trim()).slice(0, 4);
        const errs = [...document.querySelectorAll('[data-testid$="-run-error"]')].map((e) => (e.innerText || "").trim());
        const btns = [...document.querySelectorAll("button")].filter((b) => /精修|修复|生成中/.test(b.innerText || "")).map((b) => ({ text: (b.innerText || "").trim(), disabled: b.disabled }));
        return { tasks, toasts, errs, btns };
    }).catch((e) => ({ error: String(e) }));
    return { ...snap, after };
}

function assertUrl(page, expectPath, label) {
    const url = new URL(page.url());
    if (url.pathname !== expectPath) throw new Error(`${label} URL 不符：期望 ${expectPath}，实际 ${url.pathname}`);
    return url.pathname;
}

/** 结果区第一张结果图地址 + 页面内证据。 */
async function resultState(page) {
    return page.evaluate(() => {
        const tid = (el) => el.getAttribute("data-testid") || "";
        const vis = (el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        };
        const text = (el) => (el.innerText || "").trim().replace(/\s+/g, " ");
        const items = [...document.querySelectorAll('[data-testid^="tool-result-item-"]')].filter(vis);
        const firstItem = items[0];
        const img = firstItem ? firstItem.querySelector('[data-testid="tool-result-image"]') : null;
        return {
            itemCount: items.length,
            resultSrc: img ? img.currentSrc || img.src || "" : "",
            resultW: img ? img.naturalWidth : 0,
            resultH: img ? img.naturalHeight : 0,
            failure: document.querySelector('[data-testid="tool-result-failed"]') ? text(document.querySelector('[data-testid="tool-result-failed"]')).slice(0, 300) : "",
            unknown: document.querySelector('[data-testid="tool-result-unknown"]') ? text(document.querySelector('[data-testid="tool-result-unknown"]')).slice(0, 300) : "",
            running: Boolean(document.querySelector('[data-testid="tool-result-running"]')),
            actions: firstItem
                ? [...firstItem.querySelectorAll("button")].filter(vis).map((b) => ({ id: tid(b), text: text(b), disabled: b.disabled }))
                : [],
            feedback: document.querySelector('[data-testid="tool-result-feedback"]')
                ? { tone: document.querySelector('[data-testid="tool-result-feedback"]').getAttribute("data-tone"), text: text(document.querySelector('[data-testid="tool-result-feedback"]')) }
                : null,
            issues: [...document.querySelectorAll('[data-testid$="-issues"], [data-testid$="-notice"], [data-testid$="-error"]')].filter(vis).map((el) => `${tid(el)}=${text(el).slice(0, 160)}`),
        };
    });
}

/** 上传后的源图地址（P0 断言：blob:）。 */
async function sourceState(page) {
    return page.evaluate(() => {
        const inputs = [...document.querySelectorAll("img")].map((el) => el.currentSrc || el.src || "");
        const blob = inputs.find((src) => src.startsWith("blob:"));
        return { blobSrc: blob || "", all: inputs.slice(0, 6) };
    });
}

async function taskIds(page, toolId) {
    return page.evaluate(async (id) => {
        const mod = await import("/src/stores/use-tool-task-store.ts");
        const all = Object.values(mod.useToolTaskStore.getState().tasks || {});
        const tasks = all.filter((t) => t && t.toolId === id);
        tasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const t = tasks[0];
        if (!t) return { taskCount: tasks.length, allCount: all.length, toolIds: [...new Set(all.map((x) => x.toolId))] };
        return {
            taskId: t.id,
            status: t.status,
            upstreamTaskId: t.upstreamTaskId || null,
            upstreamProvider: t.upstreamProvider || null,
            model: t.configSnapshot ? t.configSnapshot.model : null,
            size: t.configSnapshot ? t.configSnapshot.size : null,
            sourceAssetIds: t.sourceAssetIds || [],
            resultItemIds: (t.result && t.result.items ? t.result.items : []).map((i) => i.id),
            error: t.error ? t.error.message : null,
        };
    }, toolId);
}

async function saveBytes(page, src, filePath) {
    if (!src) return false;
    if (src.startsWith("data:")) {
        const bytes = Buffer.from((src.split(",")[1] || ""), "base64");
        if (!bytes.length) return false;
        await fs.writeFile(filePath, bytes);
        return true;
    }
    const arr = await page.evaluate(async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
        return Array.from(new Uint8Array(await res.arrayBuffer()));
    }, src);
    if (!arr.length) return false;
    await fs.writeFile(filePath, Buffer.from(arr));
    return true;
}

async function clickAction(page, testid) {
    const btn = page.locator(`[data-testid=${testid}]`).first();
    await btn.waitFor({ state: "visible", timeout: 15000 });
    if (await btn.isDisabled()) throw new Error(`${testid} 处于 disabled，不能验证真实动作`);
    await btn.click();
    // 反馈条出现即视为动作完成（内容含 assetId / projectId）
    const fb = page.locator('[data-testid="tool-result-feedback"]').first();
    await fb.waitFor({ state: "visible", timeout: 60000 });
    const text = (await fb.innerText()).replace(/\s+/g, " ").trim();
    const tone = await fb.getAttribute("data-tone");
    const idMatch = text.match(/（([^）]+)）/);
    return { text, tone, id: idMatch ? idMatch[1] : "" };
}

async function runTool(toolId) {
    const recipe = TOOLS[toolId];
    if (!recipe) throw new Error(`未收录：${toolId}`);
    const dir = path.join(EVIDENCE_ROOT, toolId);
    await fs.mkdir(dir, { recursive: true });

    const record = {
        toolId,
        name: recipe.name,
        route: recipe.route,
        fixture: recipe.fixture,
        startedAt: new Date().toISOString(),
        urls: {},
    };
    const browser = await launchBrowser({ headless: process.env.IC_HEADED !== "1" });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
    const page = await context.newPage();
    const network = [];
    const consoleLines = [];
    page.on("request", (req) => {
        const url = req.url();
        if (!/23210|\/v1\/|17371|__canvas-hub|\/api\//.test(url)) return;
        network.push({ req: req.method(), url: url.replace(/(token=)[^&]+/, "$1***").slice(0, 150), at: new Date().toISOString() });
    });
    page.on("pageerror", (err) => network.push({ pageerror: String((err && err.stack) || err).slice(0, 500), at: new Date().toISOString() }));
    page.on("requestfailed", (req) => {
        network.push({ failed: req.url().slice(0, 160), err: (req.failure() && req.failure().errorText) || "", at: new Date().toISOString() });
    });
    page.on("console", (msg) => {
        if (msg.type() === "error" || msg.type() === "warning") consoleLines.push(`${msg.type()}: ${msg.text().slice(0, 200)}`);
    });
    const upstream = [];
    page.on("response", async (res) => {
        const url = res.url();
        if (!/\/v1\/images\/(edits|generations)/.test(url)) return;
        const headers = res.headers();
        upstream.push({
            url: url.replace(/(token=)[^&]+/, "$1***").slice(0, 160),
            status: res.status(),
            requestId: headers["x-request-id"] || headers["x-oneapi-request-id"] || headers["x-new-api-request-id"] || null,
            at: new Date().toISOString(),
        });
    });
    page.on("requestfinished", async (req) => {
        const url = req.url();
        if (!/127\.0\.0\.1:23210|127\.0\.0\.1:17371/.test(url)) return;
        if (/\.(js|css|png|jpg|jpeg|webp|svg|woff2?|map)(\?|$)/.test(url)) return;
        const res = await req.response().catch(() => null);
        network.push({ method: req.method(), url: url.replace(/(token=)[^&]+/, "$1***").slice(0, 160), status: res ? res.status() : null, at: new Date().toISOString() });
    });

    try {
        await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
        record.provider = await applyProviderConfig(page);
        await page.goto(`${BASE_URL}${recipe.route}`, { waitUntil: "domcontentloaded" });
        await sleep(1500);
        record.urls.workspace = assertUrl(page, recipe.route, "工作台");

        await page.screenshot({ path: path.join(dir, "step-1-loaded.png") });
        const before = await sourceState(page);
        record.sourceBefore = before;

        await recipe.steps(page);
        await sleep(2500);
        record.urls.submitted = assertUrl(page, recipe.route, "提交后");
        record.sourceAfterUpload = await sourceState(page);
        record.p0BlobAccepted = Boolean(record.sourceAfterUpload.blobSrc);
        record.submitReady = await submitWhenReady(page, recipe.submit);
        const after = record.submitReady.after || {};
        const created = Array.isArray(after.tasks) ? after.tasks.length : -1;
        const busy = (after.btns || []).some((b) => /中|…/.test(b.text));
        const posted = network.some((n) => n.method === "POST") || upstream.length > 0;
        record.submitEvidence = { created, busy, posted, tasksReadable: created !== -1 };
        if (created === -1 && !busy && !posted) throw new Error(`点击无任何反应：${JSON.stringify(after)}`);
        record.urls.submitted = assertUrl(page, recipe.route, "提交后");
        await page.screenshot({ path: path.join(dir, "step-2-submitted.png") });

        // 等待真实结果（最多 5 分钟）
        let state = await resultState(page);
        const deadline = Date.now() + 300_000;
        while (Date.now() < deadline) {
            if (state.itemCount > 0 || state.failure || state.unknown) break;
            await sleep(3000);
            state = await resultState(page);
        }
        record.resultState = { itemCount: state.itemCount, failure: state.failure, unknown: state.unknown, actions: state.actions };
        if (state.itemCount === 0) throw new Error(`未拿到结果：failure=${state.failure || "-"} unknown=${state.unknown || "-"}`);

        // 等结果图解码完成
        for (let i = 0; i < 40 && !state.resultW; i++) {
            await sleep(1500);
            state = await resultState(page);
        }
        record.resultSrcPrefix = state.resultSrc.slice(0, 64);
        record.resultSize = { w: state.resultW, h: state.resultH };
        record.urls.result = assertUrl(page, recipe.route, "结果页");

        // 上游身份
        record.task = await taskIds(page, toolId);
        record.upstream = upstream.slice(-3);

        // 结果字节
        const resultPath = path.join(dir, `result-${Date.now()}.png`);
        record.resultSavedBytes = await saveBytes(page, state.resultSrc, resultPath);
        if (record.resultSavedBytes) {
            const buf = await fs.readFile(resultPath);
            const fixBuf = await fs.readFile(path.join(FIXTURES, recipe.fixture));
            record.resultSha256 = (await sha256(buf)).slice(0, 16);
            record.fixtureSha256 = (await sha256(fixBuf)).slice(0, 16);
            record.resultEqualsFixture = record.resultSha256 === record.fixtureSha256;
            // 固定文件名，便于 result.json 引用
            await fs.rm(path.join(dir, "result.png"), { force: true });
            await fs.rename(resultPath, path.join(dir, "result.png"));
        }
        await page.screenshot({ path: path.join(dir, "ui.png") });

        // ---- 存入资产 ----
        const save = await clickAction(page, "tool-result-save-0");
        record.saveToAssets = save;
        record.urls.afterSave = assertUrl(page, recipe.route, "存入资产后");
        await page.screenshot({ path: path.join(dir, "step-3-saved-asset.png") });

        // ---- 发送画布 ----
        const send = await clickAction(page, "tool-result-canvas-0");
        record.sendToCanvas = send;
        record.urls.afterCanvas = assertUrl(page, recipe.route, "发送画布后");
        await page.screenshot({ path: path.join(dir, "step-4-sent-canvas.png") });

        // ---- 资产库核对（新标签页，同 context） ----
        const assetPage = await context.newPage();
        await assetPage.goto(`${BASE_URL}/assets`, { waitUntil: "domcontentloaded" });
        await sleep(2500);
        record.urls.assets = assertUrl(assetPage, "/assets", "资产库");
        if (save.id) {
            const search = assetPage.locator('input[type="search"], input[placeholder*="搜索"], input[placeholder*="search"]').first();
            if (await search.count()) {
                await search.fill(save.id).catch(() => null);
                await sleep(1200);
            }
        }
        const cards = await assetPage.evaluate(async (title) => {
            const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
            const imgs = [...document.querySelectorAll("img")].filter((i) => i.alt === title);
            const out = [];
            for (const img of imgs) {
                const src = img.currentSrc || img.src || "";
                let sha = "";
                if (src) {
                    try {
                        const res = await fetch(src);
                        sha = hex(await crypto.subtle.digest("SHA-256", await res.arrayBuffer())).slice(0, 16);
                    } catch {
                        sha = "";
                    }
                }
                out.push({ srcPrefix: src.slice(0, 40), sha, w: img.naturalWidth, h: img.naturalHeight });
            }
            return out;
        }, recipe.saveTitle);
        record.assetsVerify = {
            assetId: save.id,
            title: recipe.saveTitle,
            titleCardCount: cards.length,
            cards,
            matchByBytes: cards.some((c) => c.sha && c.sha === record.resultSha256),
            matchBySize: cards.some((c) => c.w === record.resultSize.w && c.h === record.resultSize.h),
            imageCount: await assetPage.evaluate(() => [...document.querySelectorAll("img")].filter((i) => i.naturalWidth > 200).length),
        };
        await assetPage.screenshot({ path: path.join(dir, "step-5-asset-library.png") });

        // ---- 画布核对 ----
        const projectId = send.id;
        if (!projectId) throw new Error(`发送画布未返回 projectId：${send.text}`);
        const canvasPage = await context.newPage();
        await canvasPage.goto(`${BASE_URL}/canvas/${projectId}`, { waitUntil: "domcontentloaded" });
        await sleep(4000);
        record.urls.canvas = assertUrl(canvasPage, `/canvas/${projectId}`, "画布");
        const canvasState = await canvasPage.evaluate(async (pid) => {
            const mod = await import("/src/stores/canvas/use-canvas-store.ts");
            const project = (mod.useCanvasStore.getState().projects || []).find((p) => p.id === pid);
            const nodes = project ? project.nodes || [] : [];
            const imgs = [...document.querySelectorAll("img")].filter((i) => i.naturalWidth > 200);
            return {
                projectTitle: project ? project.title : null,
                nodeCount: nodes.length,
                nodeTypes: nodes.map((n) => n.type),
                imageNodes: nodes.filter((n) => n.type === "image").length,
                bigImages: imgs.length,
                body: document.body.innerText.replace(/\s+/g, " ").slice(0, 800),
            };
        }, projectId);
        record.canvasVerify = {
            projectId,
            projectTitle: canvasState.projectTitle,
            nodeCount: canvasState.nodeCount,
            nodeTypes: canvasState.nodeTypes,
            imageNodes: canvasState.imageNodes,
            bigImages: canvasState.bigImages,
            titleVisible: canvasState.body.length > 0,
        };
        await canvasPage.screenshot({ path: path.join(dir, "step-6-canvas.png") });

        record.ok = Boolean(
            record.resultSavedBytes &&
                !record.resultEqualsFixture &&
                record.resultSize.w > 200 &&
                record.p0BlobAccepted &&
                (record.assetsVerify.matchByBytes || record.assetsVerify.matchBySize) &&
                record.canvasVerify.imageNodes > 0,
        );
    } catch (error) {
        record.error = String(error && error.message ? error.message : error);
        await page.screenshot({ path: path.join(dir, "ui-error.png") }).catch(() => null);
        record.ok = false;
    } finally {
        record.network = network.slice(-15);
        record.console = consoleLines.slice(0, 20);
        record.finishedAt = new Date().toISOString();
        await browser.close();
    }

    await fs.writeFile(path.join(dir, "run-pr-fc.json"), JSON.stringify(record, null, 2));
    console.log(JSON.stringify(record, null, 2));
    return record;
}

const toolId = process.argv[2];
runTool(toolId).then(
    (r) => {
        process.exitCode = r.ok ? 0 : 2;
    },
    (e) => {
        console.error(e);
        process.exitCode = 1;
    },
);
