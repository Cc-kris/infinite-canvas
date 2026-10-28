/**
 * AI_VIDEO_EDITING D2 / D3 / D4 真实页面复测（真实 Chrome + 真实 UI；不产生假产物。
 * 上游 /v1/videos 用 route 拦截并回 200「已受理」，仅用于抓取真实 multipart 参数）。
 *
 * 运行：node recheck.mjs   （需 dev server http://127.0.0.1:3000）
 */
import { chromium } from "/Users/mac/Documents/Dev/infinite-canvas/web/node_modules/playwright/index.mjs";
import fs from "node:fs";

const ROUTE = "http://127.0.0.1:3000/tools/ai-video/ai-video-editing";
const MP4 = "/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/IMAGE_TO_VIDEO/06-result-video.mp4";
const REF = "/Users/mac/Documents/Dev/infinite-canvas/.worker-real-accept-av/assets/product.png";
const OUT = "/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/d2d3d4-recheck";
fs.mkdirSync(OUT, { recursive: true });

const report = { run_at: new Date().toISOString(), route: ROUTE, steps: {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitSourceReady(page, timeout = 60_000) {
    await page.waitForFunction(() => {
        const text = document.querySelector("[data-testid=tool-workspace]")?.textContent ?? "";
        const label = document.querySelector("[data-testid=ai-video-editing-clip-label]")?.textContent ?? "";
        return /1\s*\/\s*1/.test(text) && !/待上传源视频/.test(label);
    }, null, { timeout });
}

async function uploadSource(page, file = MP4) {
    await page.locator("[data-testid=tool-asset-file-input]").nth(0).setInputFiles(file);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });

/* ============ D2：元数据加载被挂起 → 入库必须到点兜底，不能永久卡住 ============ */
{
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
        const create = Document.prototype.createElement;
        Document.prototype.createElement = function (tag, options) {
            const el = create.call(this, tag, options);
            if (String(tag).toLowerCase() === "video") {
                window.__hungVideoCount = (window.__hungVideoCount || 0) + 1;
                Object.defineProperty(el, "preload", { configurable: true, get: () => "metadata", set: () => {} });
                Object.defineProperty(el, "src", { configurable: true, get: () => "", set: () => {} });
            }
            return el;
        };
    });
    await page.goto(ROUTE, { waitUntil: "networkidle" });
    await sleep(800);

    const startedAt = Date.now();
    await uploadSource(page);
    let recorded = false;
    const timeline = [];
    let lastPhase = "";
    while (Date.now() - startedAt < 40_000) {
        const phase = await page.evaluate(() => (document.querySelector("[data-testid=tool-workspace]")?.textContent ?? "").slice(0, 120));
        if (phase !== lastPhase) {
            timeline.push({ t: Date.now() - startedAt, phase });
            lastPhase = phase;
        }
        if (/1\s*\/\s*1\s*个/.test(phase)) {
            recorded = true;
            break;
        }
        await sleep(700);
    }
    const elapsedMs = Date.now() - startedAt;
    const after = await page.evaluate(() => ({
        hungVideoCount: window.__hungVideoCount || 0,
        clipLabel: document.querySelector("[data-testid=ai-video-editing-clip-label]")?.textContent ?? "",
        clipNotice: document.querySelector("[data-testid=ai-video-editing-clip-notice]")?.textContent ?? "",
        workspaceText: (document.querySelector("[data-testid=tool-workspace]")?.textContent ?? "").slice(0, 500),
    }));
    await page.screenshot({ path: `${OUT}/d2-hung-metadata-fallback.png` });
    report.steps.D2 = { recorded, elapsedMs, timeline, ...after };
    await ctx.close();
}

/* ============ D4：seconds / size 跟随截取区间与源视频画幅 ============ */
{
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await ctx.newPage();
    /* 只注入渠道凭据（apiKey），让页面认为「已配置」可提交；模型/画幅仍走页面默认值。
       上游请求由下面 route 拦截，不产生真实调用。 */
    await ctx.addInitScript(() => {
        const key = "infinite-canvas:ai_config_store";
        const raw = globalThis.localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : { state: {}, version: 0 };
        const state = parsed.state || (parsed.state = {});
        state.config = {
            channelMode: "local",
            baseUrl: "https://mock-upstream.invalid/v1",
            apiKey: "recheck-key",
            apiFormat: "openai",
            channels: [
                {
                    id: "default",
                    name: "recheck",
                    baseUrl: "https://mock-upstream.invalid/v1",
                    apiKey: "recheck-key",
                    apiFormat: "openai",
                    models: [
                        { name: "gpt-image-2", capability: "image" },
                        { name: "grok-imagine-video", capability: "video" },
                        { name: "gpt-5.5", capability: "text" },
                        { name: "gpt-4o-mini-tts", capability: "audio" },
                    ],
                },
            ],
            model: "default::gpt-image-2",
            imageModel: "default::gpt-image-2",
            videoModel: "default::grok-imagine-video",
            textModel: "default::gpt-5.5",
            audioModel: "default::gpt-4o-mini-tts",
            videoSeconds: "6",
            vquality: "720",
            videoGenerateAudio: "true",
            videoWatermark: "false",
            size: "1:1",
        };
        globalThis.localStorage.setItem(key, JSON.stringify(parsed));
    });
    let captured = null;
    await page.route("**/v1/videos", async (route) => {
        const req = route.request();
        if (!captured) {
            captured = {
                url: req.url(),
                method: req.method(),
                contentType: req.headers()["content-type"] ?? "",
                body: req.postData() ?? "",
            };
        }
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "recheck-d4", status: "pending" }) });
    });

    await page.goto(ROUTE, { waitUntil: "networkidle" });
    await sleep(600);
    await uploadSource(page);
    await waitSourceReady(page, 45_000);
    await page.locator("[data-testid=tool-asset-file-input]").nth(1).setInputFiles(REF);
    await page.waitForFunction(() => /1\s*\/\s*30/.test(document.querySelector("[data-testid=tool-workspace]")?.textContent ?? ""), null, { timeout: 30_000 });

    await page.evaluate(() => {
        const input = document.querySelector("[data-testid=ai-video-editing-clip-duration]");
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(input, "7.3");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.evaluate(() => {
        const area = document.querySelector("[data-testid=ai-video-editing-prompt]");
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
        setter.call(area, "把视频里的产品替换为参考图中的白色降噪耳机，保持人物动作、镜头运动和背景不变");
        area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(900);
    const beforeSubmit = await page.evaluate(() => ({
        clipLabel: document.querySelector("[data-testid=ai-video-editing-clip-label]")?.textContent ?? "",
        disabled: document.querySelector("[data-testid=ai-video-editing-submit]")?.hasAttribute("disabled") ?? null,
        blocked: document.querySelector("[data-testid=ai-video-editing-blocked]")?.textContent ?? null,
    }));
    await page.screenshot({ path: `${OUT}/d4-before-submit.png` });

    const diag = await page.evaluate(() => ({
        blocked: document.querySelector("[data-testid=ai-video-editing-blocked]")?.textContent ?? null,
        submitDisabled: document.querySelector("[data-testid=ai-video-editing-submit]")?.hasAttribute("disabled") ?? null,
        workspaceText: (document.querySelector("[data-testid=tool-workspace]")?.textContent ?? "").slice(0, 400),
    }));
    if (diag.submitDisabled) {
        await page.screenshot({ path: `${OUT}/d4-blocked.png` });
        report.steps.D4 = { ...diag, request: null, note: "提交按钮不可点，未发出请求" };
        await ctx.close();
        await browser.close();
        fs.writeFileSync(`${OUT}/recheck.json`, JSON.stringify(report, null, 1));
        console.log(JSON.stringify({ blocked: diag }, null, 1));
        process.exit(0);
    }
    await page.locator("[data-testid=ai-video-editing-submit]").click();
    for (let i = 0; i < 80 && !captured; i += 1) await sleep(250);

    const fields = {};
    if (captured) {
        const parts = captured.body.split(/\r\n/);
        for (let i = 0; i < parts.length; i += 1) {
            const m = /^Content-Disposition: form-data; name="([^"]+)"/.exec(parts[i]);
            if (m && parts[i + 2] !== undefined) fields[m[1]] = parts[i + 2];
        }
    }
    const uiAfter = await page.evaluate(() => ({
        result: (document.querySelector("[data-testid=tool-result]")?.textContent ?? "").slice(0, 300),
    }));
    await page.screenshot({ path: `${OUT}/d4-after-submit.png` });
    report.steps.D4 = {
        clipLabel: beforeSubmit.clipLabel,
        submitDisabledBeforeClick: beforeSubmit.disabled,
        blockedText: beforeSubmit.blocked,
        request: captured ? { url: captured.url, method: captured.method, contentType: captured.contentType } : null,
        multipartFields: fields,
        seconds: fields.seconds ?? null,
        size: fields.size ?? null,
        ratio: fields.ratio ?? null,
        hasVideoPart: /name="video\[\]"/.test(captured?.body ?? ""),
        uiAfterSubmit: uiAfter.result,
    };
    await ctx.close();
}

/* ============ D3：本地 Blob 失效 → 按钮禁用 + 内联原因 ============ */
{
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await ctx.newPage();
    await page.goto(ROUTE, { waitUntil: "networkidle" });
    await sleep(600);
    await uploadSource(page);
    await waitSourceReady(page, 45_000);
    await page.locator("[data-testid=tool-asset-file-input]").nth(1).setInputFiles(REF);
    await page.evaluate(() => {
        const area = document.querySelector("[data-testid=ai-video-editing-prompt]");
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
        setter.call(area, "把视频里的产品替换为参考图中的白色降噪耳机");
        area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(1000);
    const before = await page.evaluate(() => ({
        disabled: document.querySelector("[data-testid=ai-video-editing-submit]")?.hasAttribute("disabled") ?? null,
        issue: document.querySelector("[data-testid=ai-video-editing-asset-issue]")?.textContent ?? null,
    }));

    const deletedKeys = await page.evaluate(async () => {
        const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open("infinite-canvas");
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        const tx = db.transaction("media_files", "readwrite");
        const store = tx.objectStore("media_files");
        const keys = await new Promise((resolve) => {
            const req = store.getAllKeys();
            req.onsuccess = () => resolve(req.result);
        });
        keys.forEach((key) => store.delete(key));
        await new Promise((resolve) => (tx.oncomplete = resolve));
        window.dispatchEvent(new Event("focus"));
        return keys.length;
    });
    await sleep(1800);
    const after = await page.evaluate(() => ({
        disabled: document.querySelector("[data-testid=ai-video-editing-submit]")?.hasAttribute("disabled") ?? null,
        issue: document.querySelector("[data-testid=ai-video-editing-asset-issue]")?.textContent ?? null,
        blocked: document.querySelector("[data-testid=ai-video-editing-blocked]")?.textContent ?? null,
    }));
    await page.screenshot({ path: `${OUT}/d3-asset-invalid.png` });

    let requestCount = 0;
    page.on("request", (r) => { if (r.url().includes("/v1/videos")) requestCount += 1; });
    await page.evaluate(() => {
        document.querySelector("[data-testid=ai-video-editing-submit]")?.click();
    });
    await sleep(1500);
    report.steps.D3 = { deletedKeys, before, after, upstreamRequestsAfterForcedClick: requestCount };
    await ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/recheck.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
