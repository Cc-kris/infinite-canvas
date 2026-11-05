import { chromium } from "playwright";
import path from "node:path";
import { applyProviderConfig } from "./provider.mjs";

const BASE = "http://127.0.0.1:3000";
const FIX = "/Users/mac/Documents/Dev/infinite-canvas/web/scripts/real-acceptance/fixtures";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();
const net = [];
page.on("request", (r) => { if (!r.url().includes("localhost:3000/_next")) net.push(["REQ", r.method(), r.url().slice(0, 90)]); });
page.on("response", (r) => { if (r.url().includes("23210") || r.url().includes("/v1/")) net.push(["RES", r.status(), r.url().slice(0, 90)]); });
page.on("console", (m) => { if (m.type() === "error") net.push(["CONSOLE", m.text().slice(0, 120)]); });

await page.goto(BASE + "/tools/product-design/print-extract", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
console.log("provider", JSON.stringify(await applyProviderConfig(page)));
await page.locator('[data-testid="tool-asset-file-input"]').first().setInputFiles(path.join(FIX, "apparel-print.jpg"));
await page.waitForTimeout(1500);
const btn = page.locator('[data-testid="print-extract-generate"]');
console.log("disabled", await btn.isDisabled(), "text", (await btn.innerText()).slice(0, 40));
await btn.click();
for (let i = 0; i < 12; i += 1) {
    await sleep(5000);
    const st = await page.evaluate(() => {
        const grid = document.querySelector('[data-testid="print-extract-grid"]');
        const imgs = [...document.querySelectorAll('[data-testid="print-extract-grid"] img')].map((i) => i.src.slice(0, 60));
        return { imgs, gridText: grid ? grid.innerText.slice(0, 300) : null, tail: document.body.innerText.slice(0, 400) };
    });
    console.log(i, JSON.stringify(st).slice(0, 700));
    if (st.imgs.length && !st.imgs[0].startsWith("data:")) break;
}
console.log("NET", JSON.stringify(net.slice(-25), null, 0));
await ctx.close();
await browser.close();
