/**
 * design19 前10工具 非视觉验收：AI_TEXT / ORNAMENT_TEXT / SDS_DESIGN 真实生成取原始字节。
 *
 * 事实来源：
 * - 三个工具历史证据只有界面截图（1920x839 等），无可核验的上游原始字节 → 必须现场真实生成。
 * - 提交入口：AI_TEXT「生成 POD 素材」、ORNAMENT_TEXT「生成饰品文字」、SDS_DESIGN「立即生成」。
 * - 结果图节点：[data-testid="tool-result-image"]（src 可能是 blob/http/data）→ 页面内 fetch 取字节。
 *
 * 输出：docs/V1.0/plan_linkfox_navigation/evidence/design19-nv-20261029/gen/<ID>.png + <ID>.json
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { chromium } from "playwright";

const BASE_URL = "http://127.0.0.1:3000";
const OUT = path.resolve("/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/design19-nv-20261029/gen");
const FIX = path.resolve("scripts/real-acceptance/fixtures");
const GEN_TIMEOUT = 240000;

const TARGETS = [
    { id: "AI_TEXT", route: "/tools/product-design/ai-text" },
    { id: "ORNAMENT_TEXT", route: "/tools/product-design/ornament-text" },
    { id: "SDS_DESIGN", route: "/tools/product-design/sds-design" },
];

const setNativeValue = (el, value) => {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
};

async function waitEnabled(page, label, timeout = 30000) {
    const btn = page.getByRole("button", { name: label, exact: true }).first();
    await btn.waitFor({ state: "visible", timeout });
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (!(await btn.isDisabled())) return true;
        await page.waitForTimeout(500);
    }
    const notice = await page.evaluate(() => [...document.querySelectorAll("p,span")]
        .map((e) => (e.textContent || "").trim())
        .filter((t) => /不完整|请先|请选择|未加载|至少/.test(t) && t.length < 60).slice(0, 4));
    throw new Error(`提交按钮一直禁用：${label} | 页面提示=${JSON.stringify(notice)}`);
}

async function generate(browser, target) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "zh-CN" });
    const page = await ctx.newPage();
    const rec = { toolId: target.id, route: target.route, steps: {}, ok: false, errors: [] };
    page.on("pageerror", (e) => rec.errors.push(String(e).slice(0, 200)));
    try {
        await page.goto(`${BASE_URL}${target.route}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(4500);

        if (target.id === "AI_TEXT") {
            await page.locator('input[type="file"]').first().setInputFiles(path.join(FIX, "apparel-print.jpg"));
            await page.waitForTimeout(2500);
            // 素材模式 / 输出比例：等模型目录加载出选项后取第一个非空值
            const selects = page.locator("select");
            const count = await selects.count();
            const picked = [];
            for (let i = 0; i < count; i += 1) {
                const sel = selects.nth(i);
                const cur = await sel.inputValue();
                if (cur) { picked.push({ i, cur }); continue; }
                const first = await sel.evaluate((el) => {
                    const opt = [...el.options].find((o) => o.value);
                    return opt ? opt.value : "";
                });
                if (first) { await sel.selectOption(first); picked.push({ i, cur: "", picked: first }); }
            }
            rec.steps.selects = picked;
            await page.locator("textarea").first().fill("复古星星印花，四色扁平风格，适合印花布料的无缝平铺图案").catch(async () => {
                await page.evaluate(([v]) => {
                    const el = document.querySelector("textarea");
                    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
                    setter?.call(el, v);
                    el.dispatchEvent(new Event("input", { bubbles: true }));
                }, ["复古星星印花，四色扁平风格，适合印花布料的无缝平铺图案"]);
            });
            await page.waitForTimeout(600);
            await waitEnabled(page, "生成 POD 素材");
            await page.getByRole("button", { name: "生成 POD 素材", exact: true }).first().click();
        }

        if (target.id === "ORNAMENT_TEXT") {
            await page.locator("textarea").first().fill("FOREVER · 永恒");
            await page.waitForTimeout(600);
            await waitEnabled(page, "生成饰品文字");
            await page.getByRole("button", { name: "生成饰品文字", exact: true }).first().click();
        }

        if (target.id === "SDS_DESIGN") {
            const files = page.locator('input[type="file"]');
            await files.nth(0).setInputFiles(path.join(FIX, "apparel-print.jpg"));
            await page.waitForTimeout(2500);
            await files.nth(1).setInputFiles(path.join(FIX, "product-watch.jpg"));
            await page.waitForTimeout(2500);
            await waitEnabled(page, "立即生成");
            await page.getByRole("button", { name: "立即生成", exact: true }).first().click();
        }

        rec.steps.submittedAt = new Date().toISOString();
        const img = page.locator('[data-testid="tool-result-image"]').first();
        await img.waitFor({ state: "visible", timeout: GEN_TIMEOUT });
        // 等图片真正解码完成
        await img.evaluate((el) => el.complete && el.naturalWidth > 0
            ? true
            : new Promise((res) => { el.onload = () => res(true); el.onerror = () => res(false); }));

        const payload = await page.evaluate(async () => {
            const el = document.querySelector('[data-testid="tool-result-image"]');
            const src = el?.getAttribute("src") || "";
            const resp = await fetch(src);
            const buf = new Uint8Array(await resp.arrayBuffer());
            let bin = "";
            const chunk = 0x8000;
            for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode(...buf.subarray(i, i + chunk));
            const feedback = [...document.querySelectorAll("p,span")].map((e) => (e.textContent || "").trim())
                .filter((t) => /响应 id|已下载|已保存|已发送/.test(t)).slice(0, 3);
            return { src: src.slice(0, 120), w: el?.naturalWidth, h: el?.naturalHeight, b64: btoa(bin), feedback };
        });

        const bytes = Buffer.from(payload.b64, "base64");
        await fs.writeFile(path.join(OUT, `${target.id}.png`), bytes);
        rec.steps.result = {
            srcKind: payload.src.startsWith("blob:") ? "blob" : payload.src.startsWith("data:") ? "data" : "http",
            naturalWidth: payload.w, naturalHeight: payload.h,
            bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
            isPng: bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
            feedback: payload.feedback,
        };
        rec.ok = bytes.length > 10000;
    } catch (error) {
        rec.errors.push(`中断：${String(error).slice(0, 300)}`);
        rec.steps.bodyTail = await page.evaluate(() => document.body.innerText.slice(-800)).catch(() => null);
    } finally {
        await fs.writeFile(path.join(OUT, `${target.id}.json`), JSON.stringify(rec, null, 2));
        await ctx.close();
    }
    return rec;
}

await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
for (const target of TARGETS) {
    if (only && only !== target.id) continue;
    const rec = await generate(browser, target);
    console.log(`${target.id} ok=${rec.ok} bytes=${rec.steps.result?.bytes ?? 0} ${rec.steps.result?.naturalWidth ?? 0}x${rec.steps.result?.naturalHeight ?? 0} sha=${(rec.steps.result?.sha256 ?? "").slice(0, 12)} ${rec.errors.join(" | ").slice(0, 160)}`);
}
await browser.close();
