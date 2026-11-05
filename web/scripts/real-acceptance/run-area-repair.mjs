/**
 * AREA_REPAIR（局部重绘）· 全门禁真实验收执行器。
 *
 * 与 run-repair-actions.mjs 同一套边界（真 Chrome / 真点击 / 真文件上传 / 真 provider 经 23210 代理），
 * 差别在于这个工具的交互是「在图上涂抹蒙版」：
 *   1. 上传真实商品图 → 在 mask-canvas 上用真实指针事件画出蒙版，并断言覆盖率从「尚未涂抹」变化；
 *   2. 描述 + 张数（选 2，证明多张真实出图，不是单张糊过去）；
 *   3. 结果门禁：每张结果的图字节必须与源图不同（防图回显假阳性），且「存库 / 发画布 / 下载」三个动作
 *      都要真点、真拿到返回（资产 ID / 画布 projectId / 下载链接与文件名）；
 *   4. 落库、发画布后用独立路由回验（/assets 出现该结果、/canvas/<projectId> 出现大图节点）。
 *
 * 用法：node run-area-repair.mjs
 */
import { launchBrowser, sleep } from "./lib.mjs";
import { applyProviderConfig } from "./provider.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const BASE_URL = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const HERE = path.resolve(new URL(".", import.meta.url).pathname);
const FIXTURES = path.join(HERE, "fixtures");
const EVIDENCE_ROOT =
    process.env.IC_EVIDENCE_ROOT || path.resolve(HERE, "../../../docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance");
const RESULT_DEADLINE_MS = Number(process.env.AREA_RESULT_DEADLINE_MS || 420_000);
const TOOL_ID = "AREA_REPAIR";
const ROUTE = "/tools/smart-edit/area-repair";
const FIXTURE = process.env.AREA_FIXTURE || "product-watch.jpg";
const PROMPT = process.env.AREA_PROMPT || "把涂抹区域的表盘替换成米色针织纹理，保留原有光影、镜头与背景不变";
const OUTPUT_NUM = Number(process.env.AREA_OUTPUT_NUM || 2);

const TRACE = (msg) => console.log(`[area] ${msg}`);
const sha256 = async (file) => crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");

async function attachNetLog(page) {
    const net = [];
    page.on("requestfinished", async (req) => {
        const url = req.url();
        if (!url.includes("23210") && !url.includes("/v1/")) return;
        const res = await req.response().catch(() => null);
        net.push({
            method: req.method(),
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

async function fetchBytes(page, src) {
    if (!src) return null;
    if (src.startsWith("data:")) {
        const [, b64] = src.split(",");
        return Buffer.from(b64 || "", "base64");
    }
    const arr = await page.evaluate(async (url) => {
        const res = await fetch(url);
        const ab = await res.arrayBuffer();
        return Array.from(new Uint8Array(ab));
    }, src);
    return Buffer.from(arr);
}

/** 从应用运行中的任务 store 读本次任务（只读内存状态，不碰持久化存储/密钥）。 */
async function readTask(page, toolId) {
    return page.evaluate(async (id) => {
        const mod = await import("/src/stores/use-tool-task-store.ts");
        const tasks = Object.values(mod.useToolTaskStore.getState().tasks || {});
        const mine = tasks.filter((t) => t && t.toolId === id).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const t = mine[0];
        if (!t) return null;
        return {
            taskId: t.id,
            status: t.status,
            capability: t.capability,
            itemCount: (t.items || []).length,
            itemIds: (t.items || []).map((i) => i.id),
            promptChars: (t.prompt || "").length,
            errorCode: t.error?.code || null,
            errorMessage: t.error?.message || null,
            fieldsKeys: Object.keys(t.fields || {}),
        };
    }, toolId);
}

/** 从资产 store（运行内存）读最新一条该工具的结果资产，用于回验 /assets。 */
async function readLatestAsset(page, toolId) {
    return page.evaluate(async (id) => {
        const mod = await import("/src/stores/use-asset-store.ts");
        const assets = mod.useAssetStore.getState().assets || [];
        const mine = assets.filter((a) => a?.metadata?.toolId === id).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const a = mine[0];
        return a ? { assetId: a.id, title: a.title, coverUrl: String(a.coverUrl || "").slice(0, 80), source: a.source } : null;
    }, toolId);
}

/** 在蒙版画布上真实涂抹一笔（真实 pointer 事件，不是直接改 state）。 */
async function drawMask(page) {
    const canvas = page.locator('[data-testid="mask-canvas"]');
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    if (!box || box.width < 20 || box.height < 20) throw new Error(`蒙版画布尺寸异常：${JSON.stringify(box)}`);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx - box.width * 0.12, cy);
    await page.mouse.down();
    for (let i = 1; i <= 10; i += 1) {
        await page.mouse.move(cx - box.width * 0.12 + (box.width * 0.24 * i) / 10, cy + Math.sin(i / 2) * 6);
        await sleep(30);
    }
    await page.mouse.up();
    await sleep(400);
    return { w: Math.round(box.width), h: Math.round(box.height) };
}

async function run() {
    const dir = path.join(EVIDENCE_ROOT, TOOL_ID);
    await fs.mkdir(dir, { recursive: true });
    const record = {
        toolId: TOOL_ID,
        route: ROUTE,
        startedAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        fixture: FIXTURE,
        prompt: PROMPT,
        outputNum: OUTPUT_NUM,
        steps: [],
        ok: false,
    };
    let ok = false;
    const browser = await launchBrowser({ headless: true });
    try {
        const context = await browser.newContext({ viewport: { width: 1512, height: 950 }, locale: "zh-CN" });
        const page = await context.newPage();
        const net = await attachNetLog(page);
        const consoleLines = [];
        page.on("console", (msg) => {
            if (msg.type() === "error") consoleLines.push(String(msg.text()).slice(0, 200));
        });

        await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 120_000 });
        record.provider = await applyProviderConfig(page);
        TRACE(`provider applied channelCount=${record.provider.channelCount} imageModel=${record.provider.imageModel}`);

        await page.goto(`${BASE_URL}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.waitForSelector('[data-testid="area-repair-submit"]', { timeout: 60_000 });
        await sleep(1200);
        record.urlOnLoad = page.url();
        if (record.urlOnLoad !== `${BASE_URL}${ROUTE}`) throw new Error(`URL 不符：${record.urlOnLoad}`);

        // 1. 真实上传
        const inputs = page.locator('[data-testid="tool-asset-file-input"]');
        record.inputCount = await inputs.count();
        await inputs.first().setInputFiles(path.join(FIXTURES, FIXTURE));
        await page.waitForSelector('[data-testid="mask-canvas"]', { timeout: 120_000 });
        await sleep(800);
        record.coverageBefore = await text(page, '[data-testid="mask-coverage"]');
        record.steps.push("uploaded");
        TRACE(`uploaded coverage=${record.coverageBefore}`);
        await page.screenshot({ path: path.join(dir, "step-1-loaded.png") });

        // 2. 真实涂抹 + 工具栏真实交互（画笔大小 / 自动扩边 / 撤销-重做）
        record.maskBox = await drawMask(page);
        record.coverageAfter = await text(page, '[data-testid="mask-coverage"]');
        record.steps.push("mask-drawn");
        TRACE(`mask drawn coverage=${record.coverageAfter}`);
        if (record.coverageAfter === record.coverageBefore) throw new Error("涂抹后覆盖率未变化，蒙版没有真正画上去");

        const brush = page.locator('[data-testid="mask-brush-size"]');
        record.brushBefore = await brush.inputValue();
        // input[type=range] 不能用 fill()，用原生 setter + 事件链触发 React onChange
        await page.evaluate(() => {
            const el = document.querySelector('[data-testid="mask-brush-size"]');
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
            setter.call(el, "40");
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await sleep(200);
        record.brushAfter = await brush.inputValue();
        await page.click('[data-testid="mask-auto-expand"]');
        record.autoExpandAfter = await page.isChecked('[data-testid="mask-auto-expand"]');
        await page.click('[data-testid="mask-undo"]');
        record.coverageAfterUndo = await text(page, '[data-testid="mask-coverage"]');
        await page.click('[data-testid="mask-redo"]');
        record.coverageAfterRedo = await text(page, '[data-testid="mask-coverage"]');
        record.steps.push("toolbar");

        // 3. 描述 + 张数（真实输入/真实点击）
        await page.fill('[data-testid="area-repair-prompt"]', PROMPT);
        record.promptChars = (await page.inputValue('[data-testid="area-repair-prompt"]')).length;
        await page.locator('[data-testid="area-repair-output-num"] button', { hasText: String(OUTPUT_NUM) }).first().click();
        record.outputPressed = await page.evaluate(
            (n) =>
                [...document.querySelectorAll('[data-testid="area-repair-output-num"] button')]
                    .filter((b) => b.getAttribute("aria-pressed") === "true")
                    .map((b) => b.textContent.trim())
                    .join(","),
            OUTPUT_NUM,
        );
        record.issuesBeforeSubmit = (await text(page, '[data-testid="area-repair-issues"]')) || "";
        record.submitDisabled = await page.isDisabled('[data-testid="area-repair-submit"]');
        if (record.submitDisabled) throw new Error(`提交按钮 disabled：issues=${record.issuesBeforeSubmit}`);

        // 4. 真提交 + 等真实结果（每张结果卡都必须有图）
        await page.click('[data-testid="area-repair-submit"]', { timeout: 20_000 });
        record.steps.push("submitted");
        TRACE("clicked submit");

        const deadline = Date.now() + RESULT_DEADLINE_MS;
        let round = 0;
        let cards = [];
        while (Date.now() < deadline) {
            await sleep(5000);
            round += 1;
            const state = await page.evaluate(() => {
                const list = document.querySelector('[data-testid="area-repair-results"]');
                const items = !list
                    ? []
                    : [...list.querySelectorAll('[data-testid^="area-repair-result-"]')].map((li) => {
                          const img = li.querySelector("img");
                          return {
                              testid: li.getAttribute("data-testid"),
                              src: img ? img.currentSrc || img.src || "" : "",
                              w: img ? img.naturalWidth : 0,
                              h: img ? img.naturalHeight : 0,
                              label: (li.innerText || "").trim().replace(/\s+/g, " "),
                          };
                      });
                const err = document.querySelector('[data-testid="area-repair-issues"]');
                const notice = document.querySelector('[data-testid="area-repair-notice"]');
                const panel = document.querySelector('[data-testid="tool-task-panel"], [data-testid="tool-task-status"]');
                // 直接读落盘快照：哪几个任务真的被创建、各自状态是什么（判定卡在提交前还是上游）
                let tasks = [];
                try {
                    const ids = JSON.parse(localStorage.getItem("tool-task:v1:index") || "[]");
                    tasks = ids.slice(0, 6).map((id) => {
                        const raw = localStorage.getItem(`tool-task:v1:${id}`);
                        if (!raw) return { id, missing: true };
                        const t = JSON.parse(raw);
                        return {
                            id: String(t.id).slice(0, 10),
                            status: t.status,
                            dedupe: t.deduplicated === true,
                            fp: String(t.fingerprint || "").slice(0, 8),
                            tool: t.toolId,
                            err: t.error ? String(t.error.message || "").slice(0, 60) : "",
                        };
                    });
                } catch (error) {
                    tasks = [{ parseError: String(error) }];
                }
                return {
                    cards: items,
                    tasks,
                    failed: err ? (err.innerText || "").trim().slice(0, 200) : "",
                    notice: notice ? (notice.innerText || "").trim().slice(0, 160) : "",
                    panel: panel ? (panel.innerText || "").trim().replace(/\s+/g, " ").slice(0, 160) : "",
                    submitDisabled: !!document.querySelector('[data-testid="area-repair-submit"][disabled]'),
                };
            });
            cards = state.cards;
            const ups = net.filter((n) => /23210|images\/(edits|generations)/.test(n.url || "")).map((n) => `${n.status}/${n.ms}ms`);
            TRACE(
                `poll#${round} cards=${cards.length} withSrc=${cards.filter((c) => c.src).length} ` +
                    `submitDisabled=${state.submitDisabled} upstream=[${ups.join(", ")}] ` +
                    `notice=${JSON.stringify(state.notice)} panel=${JSON.stringify(state.panel)} failed=${JSON.stringify(state.failed)} ` +
                    `tasks=${JSON.stringify(state.tasks)}`,
            );
            if (cards.length >= OUTPUT_NUM && cards.every((c) => c.src && c.w > 0)) break;
        }
        record.cards = cards;
        if (!cards.length) throw new Error("没有拿到任何结果卡");
        if (cards.some((c) => !c.src)) throw new Error(`存在无图结果卡：${JSON.stringify(cards.map((c) => c.label))}`);

        // 5. 结果字节 + 假阳性防护（不得等于源图）
        const fixtureSha = await sha256(path.join(FIXTURES, FIXTURE));
        record.fixtureSha = fixtureSha.slice(0, 16);
        record.results = [];
        for (const card of cards) {
            const bytes = await fetchBytes(page, card.src);
            const sha = bytes ? crypto.createHash("sha256").update(bytes).digest("hex") : "";
            record.results.push({ src: card.src.slice(0, 80), bytes: bytes ? bytes.length : 0, sha: sha.slice(0, 16), dims: { w: card.w, h: card.h } });
            if (sha === fixtureSha) throw new Error(`结果 ${card.testid} 与源图字节相同（图回显假阳性）`);
        }
        const firstBytes = await fetchBytes(page, cards[0].src);
        await fs.writeFile(path.join(dir, "result.png"), firstBytes);
        for (let i = 1; i < cards.length; i += 1) {
            const b = await fetchBytes(page, cards[i].src);
            if (b) await fs.writeFile(path.join(dir, `result-${i + 1}.png`), b);
        }
        // 多单元 = 多个真实任务，逐个从落盘快照取回（单任务断言会误判）
        record.tasks = await page.evaluate(() => {
            try {
                const ids = JSON.parse(localStorage.getItem("tool-task:v1:index") || "[]");
                return ids
                    .map((id) => {
                        try {
                            return JSON.parse(localStorage.getItem("tool-task:v1:" + id) || "null");
                        } catch {
                            return null;
                        }
                    })
                    .filter(Boolean)
                    .filter((t) => t.toolId === "AREA_REPAIR")
                    .map((t) => ({ id: t.id, status: t.status, prompt: (t.prompt || "").slice(-24) }));
            } catch {
                return [];
            }
        });
        record.steps.push("result-bytes");

        // 6. 下载：真实 <a download> 的属性 + 链接可解析（真实字节已在上一步取到）
        record.download = await page.evaluate(() => {
            const a = document.querySelector('[data-testid="area-repair-download-1"]');
            return a ? { href: (a.getAttribute("href") || "").slice(0, 80), download: a.getAttribute("download") } : null;
        });
        if (!record.download?.download) throw new Error("结果卡缺少真实的下载文件名属性");
        record.steps.push("download");

        // 7. 存库（真点击 → 资产 store 出现该工具结果）
        await page.click('[data-testid="area-repair-save-1"]');
        await page.waitForFunction(
            () => {
                const el = document.querySelector('[data-testid="area-repair-result-feedback"]');
                return el && /已存入资产库|失败|错误/.test(el.innerText || "");
            },
            { timeout: 120_000 },
        );
        record.saveFeedback = await text(page, '[data-testid="area-repair-result-feedback"]');
        await sleep(1200);
        record.asset = await readLatestAsset(page, TOOL_ID);
        if (!record.asset?.assetId) throw new Error(`存库未在资产 store 落地：${record.saveFeedback}`);
        record.steps.push("saved");

        // 8. 发画布（真点击 → projectId）
        await page.click('[data-testid="area-repair-send-1"]');
        await page.waitForFunction(
            () => {
                const el = document.querySelector('[data-testid="area-repair-result-feedback"]');
                return el && /已发到画布|失败|错误/.test(el.innerText || "");
            },
            { timeout: 120_000 },
        );
        record.canvasFeedback = await text(page, '[data-testid="area-repair-result-feedback"]');
        record.projectId = (record.canvasFeedback || "").match(/已发到画布\s*(\S+)/)?.[1] || null;
        if (!record.projectId) throw new Error(`发画布未返回 projectId：${record.canvasFeedback}`);
        record.steps.push("sent-to-canvas");
        await page.screenshot({ path: path.join(dir, "ui.png") });

        // 9. 独立路由回验：资产库
        await page.goto(`${BASE_URL}/assets`, { waitUntil: "domcontentloaded" });
        await sleep(3500);
        record.assetsHit = await page.evaluate((t) => {
            const body = document.body.innerText;
            const imgs = [...document.querySelectorAll("img")].filter((i) => (i.naturalWidth || 0) > 200).length;
            return { titleHit: Boolean(t) && body.includes(t), bigImages: imgs };
        }, record.asset.title);
        await page.screenshot({ path: path.join(dir, "assets.png") });

        // 10. 独立路由回验：画布项目页
        await page.goto(`${BASE_URL}/canvas/${record.projectId}`, { waitUntil: "domcontentloaded" });
        await sleep(4000);
        record.canvasNode = await page.evaluate(() => {
            const imgs = [...document.querySelectorAll("img")].filter((i) => (i.naturalWidth || 0) > 200);
            return { bigImages: imgs.length, first: imgs[0] ? { w: imgs[0].naturalWidth, h: imgs[0].naturalHeight } : null };
        });
        await page.screenshot({ path: path.join(dir, "canvas.png") });

        const upstream = net.filter((n) => n.status && n.method === "POST" && /images\/edits|images\/generations/.test(n.url));
        record.upstream = upstream;
        record.network = net.filter((n) => n.status || n.pageerror).slice(-40);
        record.console = consoleLines.slice(0, 10);

        record.ok = Boolean(
            record.results?.length >= OUTPUT_NUM &&
                record.results.every((r) => r.bytes > 1000 && r.sha !== record.fixtureSha) &&
                (record.tasks?.length ?? 0) >= OUTPUT_NUM &&
                record.tasks.every((t) => t.status === "succeeded") &&
                record.asset?.assetId &&
                record.projectId &&
                record.assetsHit?.titleHit &&
                (record.canvasNode?.bigImages || 0) > 0 &&
                upstream.some((u) => u.status === 200),
        );
        ok = record.ok;

        // result.json：本次真实任务/结果元数据（不含任何密钥）
        await fs.writeFile(
            path.join(dir, "result.json"),
            JSON.stringify(
                {
                    toolId: TOOL_ID,
                    capturedAt: new Date().toISOString(),
                    prompt: PROMPT,
                    outputNum: OUTPUT_NUM,
                    task: record.task,
                    tasks: record.tasks,
                    results: record.results,
                    download: record.download,
                    asset: record.asset,
                    projectId: record.projectId,
                    upstream: (record.upstream || []).map((u) => ({ method: u.method, url: u.url, status: u.status, ms: u.ms })),
                },
                null,
                2,
            ),
        );
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
    await fs.writeFile(path.join(dir, "run-area.json"), JSON.stringify(record, null, 2));
    console.log(
        JSON.stringify(
            {
                toolId: TOOL_ID,
                ok: record.ok,
                error: record.error || null,
                coverage: [record.coverageBefore, record.coverageAfter, record.coverageAfterRedo],
                brush: [record.brushBefore, record.brushAfter],
                outputPressed: record.outputPressed,
                cards: (record.cards || []).map((c) => ({ testid: c.testid, dims: `${c.w}x${c.h}` })),
                results: record.results,
                download: record.download,
                task: record.task,
                asset: record.asset,
                projectId: record.projectId,
                saveFeedback: record.saveFeedback,
                canvasFeedback: record.canvasFeedback,
                assetsHit: record.assetsHit,
                canvasNode: record.canvasNode,
                upstream: (record.upstream || []).map((u) => ({ status: u.status, ms: u.ms })),
                console: record.console,
            },
            null,
            2,
        ),
    );
    return ok;
}

process.exit((await run()) ? 0 : 1);
