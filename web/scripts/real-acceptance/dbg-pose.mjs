import { chromium } from "playwright";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ headless: true, channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
await page.goto("http://127.0.0.1:3000/tools/product-design/ai-pose-generator", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await page.locator('[data-testid="ai-pose-prompt"]').fill("正面站姿，双臂自然下垂，职业模特体态");
await page.waitForTimeout(1200);
const info = await page.evaluate(() => {
    const ta = document.querySelector('[data-testid="ai-pose-prompt"]');
    const btn = document.querySelector('[data-testid="ai-pose-submit"]');
    return {
        value: ta ? ta.value : null,
        count: ta ? ta.value.length : -1,
        disabled: btn ? btn.disabled : null,
        btnText: btn ? btn.innerText : null,
        submitBlock: btn ? btn.parentElement.innerText.slice(0, 300) : null,
        issues: [...document.querySelectorAll('[data-testid*="issue"], [role="alert"]')].map((e) => e.innerText.slice(0, 120)),
    };
});
console.log(JSON.stringify(info, null, 1));
await ctx.close();
await b.close();
