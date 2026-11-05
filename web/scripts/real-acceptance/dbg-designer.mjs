import { chromium } from "playwright";
const b = await chromium.launch({ headless: true, channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
const p = await ctx.newPage();
await p.goto("http://127.0.0.1:3000/tools/product-design/new-designer", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(4000);
const info = await p.evaluate(() => ({
  tids: [...document.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid")),
  files: [...document.querySelectorAll('input[type=file]')].map((e) => e.getAttribute("data-testid") || e.accept),
  text: document.body.innerText.slice(0, 600),
  imgs: [...document.querySelectorAll("img")].map((i) => (i.src || "").slice(0, 40)),
}));
console.log(JSON.stringify(info, null, 1).slice(0, 2500));
await ctx.close(); await b.close();
