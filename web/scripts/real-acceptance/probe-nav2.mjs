import { BASE_URL, launchBrowser, prepareContext, sleep } from "./lib.mjs";
const browser = await launchBrowser();
const { context, page } = await prepareContext(browser);
for (const w of [768, 900]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto(`${BASE_URL}/tools/smart-edit/image-crop`, { waitUntil: "networkidle" });
  await sleep(500);
  console.log(JSON.stringify(await page.evaluate((vw) => {
    const nav = document.querySelector("[data-testid=tools-nav-primary]");
    const items = nav ? [...nav.querySelectorAll("button, a")] : [];
    return {
      vw,
      navBox: nav ? nav.getBoundingClientRect().toJSON() : null,
      scrollW: nav?.scrollWidth, clientW: nav?.clientWidth,
      categories: items.map((el) => ({
        label: el.textContent.trim().slice(0, 12),
        x: Math.round(el.getBoundingClientRect().x),
        w: Math.round(el.getBoundingClientRect().width),
        inViewport: el.getBoundingClientRect().x >= 0 && el.getBoundingClientRect().right <= vw,
      })),
    };
  }, w)));
}
await browser.close();
