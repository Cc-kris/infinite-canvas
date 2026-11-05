/**
 * 导出 PRODUCT_REFINE / CHANGE_COLOR 页面的真实渲染文案与控件清单，
 * 用于与 LinkFox 原站 DOM（evidence/page-dom-20261028/*.json）做同工具 1:1 对照。
 *
 * 只读：不改配置、不发上游请求、不打印任何密钥。
 * 用法：node dump-refine-color.mjs [输出目录]
 */
import { launchBrowser, BASE_URL } from "./lib.mjs";
import fs from "node:fs/promises";
import path from "node:path";

const ROUTES = {
    PRODUCT_REFINE: "/tools/smart-edit/product-refine",
    CHANGE_COLOR: "/tools/smart-edit/change-color",
};

const outDir = process.argv[2] || path.resolve(process.cwd(), "dump-refine-color");

const browser = await launchBrowser({ headless: true });
const result = {};
try {
    const context = await browser.newContext({ viewport: { width: 1512, height: 950 }, locale: "zh-CN" });
    const page = await context.newPage();
    await fs.mkdir(outDir, { recursive: true });
    for (const [toolId, route] of Object.entries(ROUTES)) {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.waitForTimeout(2500);
        const dump = await page.evaluate(() => {
            const visible = (el) => {
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none";
            };
            const controls = [...document.querySelectorAll("button, input, textarea, select, [role=slider], [role=tab], [role=switch], a")]
                .filter(visible)
                .map((el) => ({
                    tag: el.tagName,
                    testId: el.getAttribute("data-testid") || null,
                    role: el.getAttribute("role") || null,
                    type: el.getAttribute("type") || null,
                    text: (el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().slice(0, 40),
                    disabled: el.disabled === true,
                }));
            const text = (document.body.innerText || "").replace(/\n{2,}/g, "\n").trim();
            return { url: location.href, text, textLines: text.split("\n").map((s) => s.trim()).filter(Boolean), controls };
        });
        await page.screenshot({ path: path.join(outDir, `${toolId}.png`) });
        result[toolId] = dump;
    }
} finally {
    await browser.close();
}
await fs.writeFile(path.join(outDir, "dump.json"), JSON.stringify(result, null, 2));
for (const [toolId, dump] of Object.entries(result)) {
    console.log(`##### ${toolId} ${dump.url} lines=${dump.textLines.length} controls=${dump.controls.length}`);
    console.log(dump.textLines.join(" | "));
    console.log("--controls--");
    console.log(dump.controls.map((c) => `${c.tag}${c.role ? `[${c.role}]` : ""}|${c.testId || ""}|${c.text}${c.disabled ? "|DISABLED" : ""}`).join("\n"));
}
