import { BASE_URL, launchBrowser, prepareContext, sleep } from "./lib.mjs";
import { applyProviderConfig } from "./provider.mjs";
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now()-t0)/1000).toFixed(1)}s]`, ...a);
const browser = await launchBrowser({ headless: true });
const { page } = await prepareContext(browser);
const reqs = [];
page.on("requestfinished", (r) => { const u = r.url(); if (!u.includes(":3000/")) reqs.push(`${r.method()} ${u.slice(0,110)}`); });
page.on("requestfailed", (r) => reqs.push(`FAILED ${r.method()} ${r.url().slice(0,110)} ${r.failure()?.errorText}`));
page.on("console", (m) => { if (m.type() === "error") log("CONSOLE-ERR", m.text().slice(0,200)); });
const info = await applyProviderConfig(page);
log("provider:", JSON.stringify(info));
await page.goto(`${BASE_URL}/tools/ecommerce-suite/image-translation`, { waitUntil: "networkidle" });
await sleep(2500);
await page.setInputFiles("input[type=file]", "scripts/real-acceptance/fixtures/translate-source.png");
await sleep(4000);
log("uploaded; notice:", await page.evaluate(() => document.querySelector(".bg-accent")?.innerText?.slice(0,120)));
// 点目标语言 英语
await page.locator("#targets button", { hasText: "英语" }).first().click();
await sleep(800);
const btn = page.locator('button:has-text("识别文字（视觉模型）")');
log("recognize-btn count:", await btn.count(), "disabled:", await btn.first().isDisabled().catch(() => "n/a"));
await btn.first().click();
for (const s of [2, 5, 10, 20, 35, 50, 70]) {
    await sleep(s === 2 ? 2000 : (s - [2,5,10,20,35,50,70][[2,5,10,20,35,50,70].indexOf(s)-1]) * 1000);
    const st = await page.evaluate(() => ({
        notice: document.querySelector(".bg-accent")?.innerText?.slice(0, 200) || null,
        panel: (document.body.innerText.match(/4 · 逐文本框校对[\s\S]{0,90}/) || [null])[0],
    }));
    log(`t=${s}s`, JSON.stringify(st));
}
log("REQS:", JSON.stringify(reqs, null, 1));
await page.screenshot({ path: "/tmp/debug-ocr.png", fullPage: true });
await browser.close();
