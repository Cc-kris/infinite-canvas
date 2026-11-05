import { chromium } from "playwright";
import path from "node:path";
const FIX = path.resolve("fixtures");
const b = await chromium.launch({ headless: true, channel: "chrome" });
for (const [route, sel] of [["/tools/product-design/image-text-edit", "image-text-edit-file"], ["/tools/product-design/product-market-material", null]]) {
    const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 } });
    const p = await ctx.newPage();
    await p.goto("http://127.0.0.1:3000" + route, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(3500);
    const fi = p.locator(sel ? `[data-testid="${sel}"]` : '[data-testid="tool-workspace"] input[type=file]').first();
    if (await fi.count()) { await fi.setInputFiles(path.join(FIX, "product-watch.jpg")); }
    await p.waitForTimeout(3500);
    const info = await p.evaluate(() => {
        const ws = document.querySelector('[data-testid="tool-workspace"]') || document.body;
        const btns = [...ws.querySelectorAll("button")].map((b) => ({ t: b.getAttribute("data-testid"), txt: b.innerText.trim().slice(0, 18), dis: b.disabled })).filter((x) => x.txt);
        const inputs = [...ws.querySelectorAll("input,textarea,select")].map((e) => ({ t: e.getAttribute("data-testid"), type: e.type, ph: e.placeholder?.slice(0, 20), v: (e.value || "").slice(0, 30) }));
        return { text: ws.innerText.slice(0, 900), btns: btns.slice(0, 26), inputs: inputs.slice(0, 22) };
    });
    console.log("#####", route);
    console.log(JSON.stringify(info, null, 0).slice(0, 2600));
    await ctx.close();
}
await b.close();
