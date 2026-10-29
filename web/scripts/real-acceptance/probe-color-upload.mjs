/** 探针：CHANGE_COLOR 页上传后为什么「立即生成」仍禁用。只读，不改页面状态。 */
import path from "node:path";
import { chromium } from "playwright";
import { BASE_URL } from "./lib.mjs";

const FIX = path.resolve("scripts/real-acceptance/fixtures/product-watch.jpg");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
await page.goto(`${BASE_URL}/tools/smart-edit/change-color`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const inputs = await page.locator('input[type="file"]').count();
const testids = await page.locator('[data-testid="tool-asset-file-input"]').count();
await page.locator('[data-testid="tool-asset-file-input"]').first().setInputFiles(FIX);
await page.waitForTimeout(3500);
const state = await page.evaluate(() => ({
    inputs: document.querySelectorAll('input[type="file"]').length,
    issues: document.querySelector('[data-testid="change-color-issues"]')?.innerText ?? null,
    submitDisabled: document.querySelector('[data-testid="change-color-submit"]')?.disabled ?? null,
    imgs: [...document.querySelectorAll("img")].map((i) => `${(i.currentSrc || i.src).slice(0, 28)}:${i.naturalWidth}x${i.naturalHeight}`).slice(0, 8),
    pickerText: document.querySelector('[data-region="config"]')?.innerText?.slice(0, 400) ?? null,
}));
console.log(JSON.stringify({ fileInputs: inputs, assetFileInputs: testids, state }, null, 2));
await browser.close();
