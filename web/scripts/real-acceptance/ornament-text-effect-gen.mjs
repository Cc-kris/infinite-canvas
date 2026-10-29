/**
 * ORNAMENT_TEXT 效果描述（可选）真实生成验收。
 *
 * 要证的契约（2026-10-29 修）：
 * 1. 效果描述留空 → 不得被本地审计拦在提交前；请求必须真的发出，prompt 里写明“无额外效果描述/保持原材质”的回落语义。
 * 2. 效果描述有值 → 原文必须逐字出现在发给上游的 prompt 里，且不得混入回落语义。
 * 3. 顺带核三动作（撤销/重做/复位定位）与默认值（空文字空效果、serif、96、18–82）。
 *
 * 证据：请求体里的 prompt 原文（我们自己的提示词，不含密钥）、上游响应状态、结果图原始字节的 sha256/尺寸。
 * 密钥来自 Galley keychain（provider.mjs），只在内存里用，不打印不落盘。
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { applyProviderConfig } from "./provider.mjs";

const BASE = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const ROUTE = "/tools/product-design/ornament-text";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(
    process.env.IC_EVIDENCE_DIR ||
        path.join(SCRIPT_DIR, "../../../docs/V1.0/plan_linkfox_navigation/evidence/ornament-text-effect-20261029"),
);
const FALLBACK = "无额外效果描述，保持金属/宝石原材质与真实光影，文字为雕刻质感。";
const EFFECT = "玫瑰金浮雕，边缘镶嵌碎钻";

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

/** 记录 应用 → 上游 的真实请求（proxyEnabled=true 时走 127.0.0.1:23210 转发）。 */
const calls = [];
page.on("request", (req) => {
    if (req.method() !== "POST") return;
    const url = req.url();
    if (!/\/v1\/(images\/(generations|edits)|responses|chat\/completions)/.test(url)) return;
    let prompt = null;
    try {
        const body = JSON.parse(req.postData() || "{}");
        prompt = typeof body.prompt === "string" ? body.prompt : JSON.stringify(body.input ?? body.messages ?? null);
    } catch {
        const raw = req.postData() || "";
        const match = raw.match(/"prompt"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        prompt = match ? JSON.parse(`"${match[1]}"`) : null;
    }
    calls.push({ at: new Date().toISOString(), url, prompt });
});

const result = { route: ROUTE, base: BASE, cases: {}, ui: {}, errors: [] };

async function fill(selector, value) {
    const locator = page.locator(selector);
    await locator.waitFor({ state: "visible", timeout: 30000 });
    await locator.fill("");
    if (value) await locator.fill(value);
    await page.waitForTimeout(150);
}

/** 左右定位的可见百分比（“偏右 · 18%–82%” 里的 18%–82%）。 */
async function readPos() {
    const text = await page.locator('div[aria-label="左右定位"]').first().innerText();
    const match = text.match(/(\d+)%[–-](\d+)%/);
    return match ? `${match[1]}%–${match[2]}%` : text.replace(/\n/g, " ").slice(0, 60);
}

async function runCase(name, effect) {
    calls.length = 0;
    await fill('textarea[aria-label="饰品文字内容"]', "FOREVER");
    await fill('textarea[aria-label="效果描述"]', effect);
    const submitted = page.waitForResponse(
        (res) => /\/v1\/(images\/(generations|edits)|responses|chat\/completions)/.test(res.url()) && res.request().method() === "POST",
        { timeout: 120000 },
    ).catch(() => null);
    await page.getByRole("button", { name: "生成饰品文字" }).click();
    const response = await submitted;
    const call = calls[0] ?? null;
    const prompt = call?.prompt ?? "";
    const rec = {
        effectInput: effect,
        submittedAt: new Date().toISOString(),
        upstreamStatus: response ? response.status() : null,
        upstreamUrl: call?.url ?? null,
        prompt,
        promptLen: prompt.length,
        promptHasEffectText: Boolean(effect) && prompt.includes(effect),
        promptHasFallback: prompt.includes(FALLBACK),
        promptHasLocalBlockers: /未带上|audit-failed|请先填写饰品文字内容/.test(prompt),
        uiError: "",
    };
    // 结果图：读原始字节（页面内 fetch，避开跨域与 blob 生命周期）
    let image = null;
    try {
        const handle = page.locator('[data-testid="tool-result-image"]').first();
        await handle.waitFor({ state: "visible", timeout: 300000 });
        const src = await handle.getAttribute("src");
        const b64 = await page.evaluate(async (source) => {
            const res = await fetch(source);
            const buf = new Uint8Array(await res.arrayBuffer());
            let out = "";
            for (let i = 0; i < buf.length; i += 0x8000) {
                out += String.fromCharCode(...buf.subarray(i, i + 0x8000));
            }
            return btoa(out);
        }, src);
        const raw = Buffer.from(b64, "base64");
        const file = path.join(OUT, `${name}.png`);
        fs.writeFileSync(file, raw);
        const dims = await page.evaluate(async (source) => {
            const img = new Image();
            img.src = source;
            await img.decode();
            return { width: img.naturalWidth, height: img.naturalHeight };
        }, src);
        image = { file: path.basename(file), bytes: raw.length, sha256: createHash("sha256").update(raw).digest("hex"), ...dims, srcKind: /^blob:/.test(src) ? "blob" : /^data:/.test(src) ? "data" : "http" };
    } catch (error) {
        rec.uiError = String(error).slice(0, 300);
    }
    rec.result = image;
    const bodyText = await page.locator('[data-testid="ornament-text-workspace"]').innerText();
    rec.noticeText = (bodyText.match(/(提交失败|重试失败|未带上|生成失败)[^\n]{0,120}/) || [""])[0];
    result.cases[name] = rec;
    return rec;
}

try {
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "networkidle" });
    await applyProviderConfig(page);
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="ornament-text-workspace"]').waitFor({ state: "visible", timeout: 30000 });

    // 默认值：空文字、空效果、serif、96、18–82
    result.ui.defaults = await page.evaluate(() => {
        const area = document.querySelector('[data-testid="ornament-text-workspace"]');
        const text = area.querySelector('textarea[aria-label="饰品文字内容"]');
        const effect = area.querySelector('textarea[aria-label="效果描述"]');
        const font = area.querySelector('select[aria-label="字体"]');
        const size = area.querySelector('input[aria-label="字号"]');
        const label = area.querySelector('div[aria-label="左右定位"]')?.innerText ?? "";
        const submit = [...area.querySelectorAll("button")].find((b) => b.textContent.includes("生成饰品文字"));
        return { text: text.value, effect: effect.value, font: font.value, fontSize: size.value, positionText: label.split("\n").pop(), submitDisabled: submit.disabled };
    });

    // 三动作：单次键盘微调（= 一步历史）→ 撤销 → 重做 → 复位
    const canvas = page.locator('[aria-label="饰品文字预览画布"]');
    await canvas.click();
    result.ui.actions = { initial: await readPos() };
    await page.keyboard.press("ArrowRight");
    result.ui.actions.afterNudge = await readPos();
    await page.getByRole("button", { name: "撤销定位" }).click();
    result.ui.actions.afterUndo = await readPos();
    await page.getByRole("button", { name: "重做定位" }).click();
    result.ui.actions.afterRedo = await readPos();
    await page.getByRole("button", { name: "复位定位" }).click();
    result.ui.actions.afterReset = await readPos();

    await runCase("empty-effect", "");
    await runCase("effect-value", EFFECT);

    const fail = [];
    for (const [name, rec] of Object.entries(result.cases)) {
        if (!rec.upstreamUrl) fail.push(`${name}: 没有看到发往上游的请求`);
        if (rec.upstreamStatus !== 200) fail.push(`${name}: 上游状态 ${rec.upstreamStatus}`);
        if (!rec.result) fail.push(`${name}: 没有结果图字节`);
        if (rec.promptHasLocalBlockers) fail.push(`${name}: prompt 混入本地阻断文案`);
        if (name === "empty-effect" && !rec.promptHasFallback) fail.push("empty-effect: prompt 缺少回落语义");
        if (name === "empty-effect" && rec.promptHasEffectText) fail.push("empty-effect: prompt 把空效果当有值");
        if (name === "effect-value" && !rec.promptHasEffectText) fail.push("effect-value: prompt 没有逐字带上效果描述");
        if (name === "effect-value" && rec.promptHasFallback) fail.push("effect-value: prompt 混入回落语义");
    }
    if (result.ui.defaults.effect !== "" || result.ui.defaults.text !== "") fail.push("默认值不是空文字空效果");
    if (result.ui.actions.afterNudge === result.ui.actions.initial) fail.push("方向键没有改变定位");
    if (result.ui.actions.afterUndo !== result.ui.actions.initial) fail.push("撤销没有回到初始定位");
    if (result.ui.actions.afterRedo !== result.ui.actions.afterNudge) fail.push("重做没有回到微调后的定位");
    if (!/18%–82%/.test(result.ui.actions.afterReset)) fail.push(`复位没有回到 18–82（实际 ${result.ui.actions.afterReset}）`);
    result.ok = fail.length === 0;
    result.failures = fail;
} catch (error) {
    result.ok = false;
    result.errors.push(String(error).slice(0, 800));
}

fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(result, null, 2));
for (const [name, rec] of Object.entries(result.cases)) {
    console.log(`${name} status=${rec.upstreamStatus} bytes=${rec.result?.bytes ?? 0} ${rec.result?.width ?? 0}x${rec.result?.height ?? 0} effectText=${rec.promptHasEffectText} fallback=${rec.promptHasFallback} notice="${rec.noticeText}"`);
}
console.log("ui:", JSON.stringify(result.ui));
console.log(`ok=${result.ok}`, result.failures ?? result.errors);
await browser.close();
process.exit(result.ok ? 0 : 1);
