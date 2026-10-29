
import { launchBrowser, BASE_URL } from "./lib.mjs";
const browser = await launchBrowser({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const out = {};
for (const [k, url] of [["wearable","/tools/product-design/ai-wearable"],["replace","/tools/product-design/replace-goods"]]) {
  await page.goto(BASE_URL + url, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  out[k] = await page.evaluate(() => ({
    promo: !!document.querySelector('[data-testid="shell-promo-bar"]'),
    userArea: !!document.querySelector('[data-testid="shell-user-area"]'),
    points: !!document.querySelector('[data-testid="shell-user-points"]'),
    topNav: !!document.querySelector('[data-testid="shell-top-nav"]'),
    helpDock: !!document.querySelector('[data-testid="tool-help-dock"]'),
    headerH: Math.round(document.querySelector('[data-testid="shell-top-nav"]')?.getBoundingClientRect().height || 0),
    navText: (document.querySelector('[data-testid="shell-top-nav"]')?.innerText || "").replace(/\s+/g, " ").slice(0, 160),
    headerY: Math.round(document.querySelector('[data-testid="shell-top-nav"]')?.getBoundingClientRect().top || 0),
  }));
  await page.screenshot({ path: `/tmp/d19cases/shell-${k}.png` });
}
console.log(JSON.stringify(out, null, 2));
await browser.close();
