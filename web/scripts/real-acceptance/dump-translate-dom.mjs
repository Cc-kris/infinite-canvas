import { BASE_URL, launchBrowser, prepareContext, sleep } from "./lib.mjs";
import { applyProviderConfig } from "./provider.mjs";
const browser = await launchBrowser({ headless: true });
try {
    const { page } = await prepareContext(browser);
    await applyProviderConfig(page);
    await page.goto(`${BASE_URL}/tools/ecommerce-suite/image-translation`, { waitUntil: "domcontentloaded" });
    await sleep(3000);
    const out = await page.evaluate(() => {
        const root = document.querySelector("main") || document.body;
        const btns = [...root.querySelectorAll("button")].map((b) => ({ t: b.innerText.trim().slice(0, 24), d: b.disabled }));
        const inputs = [...root.querySelectorAll("input,textarea")].map((i) => ({ tag: i.tagName, type: i.type, ph: i.placeholder || "", aria: i.getAttribute("aria-label") || "", ro: i.readOnly, val: (i.value || "").slice(0, 20) }));
        const sels = [...root.querySelectorAll("select")].map((s) => ({ aria: s.getAttribute("aria-label"), n: s.options.length }));
        const roles = [...root.querySelectorAll("[role=checkbox],[role=option],[role=tab]")].slice(0, 30).map((e) => ({ r: e.getAttribute("role"), t: e.innerText.trim().slice(0, 16), s: e.getAttribute("aria-selected") || e.getAttribute("aria-checked") }));
        return { title: document.title, btns, inputs, sels, roles, text: root.innerText.slice(0, 900) };
    });
    console.log(JSON.stringify(out, null, 1));
} finally { await browser.close(); }
