/** 诊断：OCR 请求到底打到哪里、返回什么（不改产品代码，只观测）。 */
import path from "node:path";
import { BASE_URL, launchBrowser, prepareContext, sleep } from "./lib.mjs";
import { applyProviderConfig } from "./provider.mjs";

const ROUTE = "/tools/ecommerce-suite/image-translation";
const FIXTURE = path.resolve(process.cwd(), "scripts/real-acceptance/fixtures/translate-source.png");

const browser = await launchBrowser({ headless: true });
const { page } = await prepareContext(browser);
const info = await applyProviderConfig(page);
const records = [];
await page.exposeFunction("__record", (r) => records.push(r));
await page.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = async (...args) => {
        const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
        const init = args[1] || {};
        const t = Date.now();
        try {
            const res = await orig(...args);
            const clone = res.clone();
            let body = "";
            try {
                const txt = await clone.text();
                body = txt.slice(0, 300);
            } catch {
                body = "<unreadable>";
            }
            const rawBody = typeof init.body === "string" ? init.body : "";
            window.__record({
                url: String(url).slice(0, 200),
                headerKeys: Object.keys(init.headers || {}),
                bodyLen: rawBody.length,
                bodyHead: rawBody.slice(0, 260),
                method: init.method || "GET",
                status: res.status,
                contentType: res.headers.get("content-type"),
                body,
                ms: Date.now() - t,
            });
            return res;
        } catch (e) {
            window.__record({ url: String(url).slice(0, 200), error: String(e), ms: Date.now() - t });
            throw e;
        }
    };
});

await page.goto(`${BASE_URL}${ROUTE}`, { waitUntil: "domcontentloaded" });
await sleep(2500);
await page.setInputFiles('input[type="file"]', FIXTURE);
await page.waitForFunction(() => /1\s*\/\s*12\s*张/.test(document.body.innerText), undefined, { timeout: 60000 });
await sleep(1500);
await page.evaluate(() => {
    const sec = document.querySelector("#targets");
    const btn = [...sec.querySelectorAll("button")].find((b) => b.innerText.trim() === "英语");
    btn.click();
});
await sleep(800);
await page.locator('button:has-text("识别文字（视觉模型）")').first().click();
await page.waitForFunction(
    () => /识别到 \d+ 个文字框|识别调用成功但没有返回文字框|识别失败/.test(
        Array.from(document.querySelectorAll("p.bg-accent")).map((e) => e.innerText).join("|"),
    ),
    undefined,
    { timeout: 180000 },
).catch(() => {});
await sleep(1000);
const notice = await page.evaluate(() => Array.from(document.querySelectorAll("p.bg-accent")).map((e) => e.innerText).join(" | "));
console.log(JSON.stringify({ provider: info, notice: notice.slice(0, 400), records }, null, 2));
await browser.close();
