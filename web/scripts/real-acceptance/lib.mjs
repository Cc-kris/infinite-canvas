/**
 * 真实 UI 验收公共库（REAL ACCEPTANCE worker）。
 *
 * 边界（不接受 mock）：
 * - 真 Chrome（channel: chrome）、真点击、真文件上传（setInputFiles → 真实 <input type=file>）；
 * - 真 provider 调用：请求经本机 canvas-proxy（http://127.0.0.1:23210），模型 gpt-image-2；
 * - 不写任何密钥：上下文里只把「代理开关 + 代理地址 + 渠道模式」改成与用户现有配置一致，
 *   其余（channels / 模型清单）全部取应用自身的 `defaultConfig`。
 */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

export const BASE_URL = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
export const PROXY_URL = process.env.IC_PROXY_URL || "http://127.0.0.1:23210";
export const EVIDENCE_ROOT = process.env.IC_EVIDENCE_ROOT || path.resolve(process.cwd(), "../docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance");

export async function launchBrowser({ headless = true } = {}) {
    return chromium.launch({ channel: "chrome", headless });
}

/**
 * 准备一个上下文：把代理开关打开（= 用户现有 provider 配置的真实路由），
 * 其余配置沿用应用 defaultConfig，因此不需要任何密钥。
 */
export async function prepareContext(browser, { viewport = { width: 1440, height: 900 } } = {}) {
    const context = await browser.newContext({ viewport, locale: "zh-CN" });
    const page = await context.newPage();
    const network = [];
    page.on("requestfinished", async (req) => {
        const url = req.url();
        const proxyHost = PROXY_URL.replace(/^https?:\/\//, "");
        if (!url.includes(proxyHost) && !url.includes("/v1/")) return;
        const res = await req.response().catch(() => null);
        network.push({
            method: req.method(),
            url,
            status: res ? res.status() : null,
            ms: Math.round(req.timing().responseEnd || 0),
            at: new Date().toISOString(),
        });
    });
    page.on("pageerror", (err) => network.push({ pageerror: String(err).slice(0, 400), at: new Date().toISOString() }));
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await applyProxyConfig(page);
    return { context, page, network };
}

/** 用应用自身的 defaultConfig 打补丁：只改 proxyEnabled / proxyUrl / channelMode。 */
export async function applyProxyConfig(page) {
    return page.evaluate(async ({ proxyUrl }) => {
        const mod = await import("/src/stores/use-config-store.ts");
        const store = mod.useConfigStore;
        const config = { ...mod.defaultConfig, proxyEnabled: true, proxyUrl, channelMode: "local" };
        store.setState({ config });
        return {
            proxyEnabled: store.getState().config.proxyEnabled,
            proxyUrl: store.getState().config.proxyUrl,
            imageModel: store.getState().config.imageModel,
        };
    }, { proxyUrl: PROXY_URL });
}

export async function evidenceDir(toolId) {
    const dir = path.join(EVIDENCE_ROOT, toolId);
    await fs.mkdir(dir, { recursive: true });
    return dir;
}

/** 落一份 evidence：run.json + 截图 + 结果图字节。 */
export async function saveEvidence(toolId, payload, { page, shotName = "workspace", resultBuffer, resultExt = "png" } = {}) {
    const dir = await evidenceDir(toolId);
    const files = [];
    if (page) {
        const shot = path.join(dir, `${shotName}.png`);
        await page.screenshot({ path: shot, fullPage: false });
        files.push(path.basename(shot));
    }
    if (resultBuffer) {
        const out = path.join(dir, `result.${resultExt}`);
        await fs.writeFile(out, resultBuffer);
        files.push(path.basename(out));
    }
    await fs.writeFile(path.join(dir, "run.json"), JSON.stringify({ ...payload, files, recordedAt: new Date().toISOString() }, null, 2));
    return dir;
}

/** 从 dataURL / blob: / http URL 取回结果图字节（真实产物）。 */
export async function fetchImageBuffer(page, src) {
    if (!src) return null;
    if (src.startsWith("data:")) {
        const base64 = src.split(",")[1] || "";
        return { buffer: Buffer.from(base64, "base64"), ext: (src.match(/^data:image\/(\w+)/) || [])[1] || "png" };
    }
    const buf = await page.evaluate(async (url) => {
        const res = await fetch(url);
        const ab = await res.arrayBuffer();
        return Array.from(new Uint8Array(ab));
    }, src);
    return { buffer: Buffer.from(buf), ext: src.includes(".webp") ? "webp" : src.includes(".jpg") ? "jpg" : "png" };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
