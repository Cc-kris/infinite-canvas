/** AI_TEXT 诊断：填完字段后 dump 实际值与 issues 文案（不发请求、不花钱）。 */
import { BASE_URL, launchBrowser } from "./lib.mjs";
import { applyProviderConfig } from "./provider.mjs";


const browser = await launchBrowser({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, locale: "zh-CN" });
const page = await context.newPage();
try {
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await applyProviderConfig(page);
    await page.goto(`${BASE_URL}/tools/product-design/ai-text`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

    await page.locator('input[type="file"]').first().setInputFiles("scripts/real-acceptance/fixtures/apparel-print.jpg");
    await page.waitForTimeout(1500);

    const spec_submit = "生成 POD 素材";
    const fill = (labelIncludes, value) =>
        page.evaluate(({ labelIncludes, value }) => {
            const labels = [...document.querySelectorAll("label")].filter((l) => (l.textContent || "").includes(labelIncludes));
            const hits = [];
            for (const label of labels) {
                const el = label.querySelector("textarea, select, input:not([type=checkbox])");
                if (!el) continue;
                const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
                Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
                hits.push({ label: label.textContent.trim().slice(0, 20), tag: el.tagName, value: el.value });
            }
            return hits;
        }, { labelIncludes, value });

    const step1 = await fill("素材模式", "text");
    const step2 = await fill("输出比例", "1:1");
    const step3 = await fill("提示词", "FOREVER YOUNG 夏日限定");
    await page.waitForTimeout(1200);

    const state = await page.evaluate(() => {
        const controls = [...document.querySelectorAll("select, input:not([type=file]), textarea")].map((el) => ({
            tag: el.tagName,
            type: el.getAttribute("type"),
            value: el.value,
            label: el.closest("label")?.textContent?.trim().slice(0, 18) ?? null,
        }));
        const amber = [...document.querySelectorAll("p,span,div")]
            .filter((el) => el.children.length === 0 && /amber/.test(el.parentElement?.className || ""))
            .map((el) => el.textContent?.trim())
            .filter(Boolean);
        const buttons = [...document.querySelectorAll("button")].map((b) => ({ text: b.textContent.trim().slice(0, 20), disabled: b.disabled }));
        return { controls, amber: [...new Set(amber)], buttons: buttons.filter((b) => b.text.includes("POD")) };
    });
    const reqs = [];
    page.on("request", (r) => { if (r.method() === "POST") reqs.push(r.url()); });
    const modeValue = await page.evaluate(() => {
        const label = [...document.querySelectorAll("label")].find((l) => (l.textContent || "").includes("素材模式"));
        return label?.querySelector("select")?.value ?? null;
    });
    await page.getByRole("button", { name: spec_submit }).first().click();
    await page.waitForTimeout(20_000);
    const after = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="tool-result"]');
        const errs = [...document.querySelectorAll("p")].map((p) => p.textContent?.trim()).filter((t) => t && /请先|失败|不完整|错误|无法/.test(t));
        return { view: el?.getAttribute("data-view") ?? null, errs: [...new Set(errs)].slice(0, 5), text: document.body.innerText.replace(/\s+/g, " ").slice(-300) };
    });
    console.log(JSON.stringify({ modeValue, state, reqs, after }, null, 1));
} finally {
    await browser.close();
}
