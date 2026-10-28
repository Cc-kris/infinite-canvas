/** 探针：md 档（900px）导航入口可见性 + 侧栏数量。 */
import { BASE_URL, launchBrowser, prepareContext, sleep } from "./lib.mjs";

const widths = (process.argv[2] || "390,768,900,1023,1024,1440").split(",").map(Number);
const route = process.argv[3] || "/tools/smart-edit/image-crop";
const browser = await launchBrowser();
const { context, page } = await prepareContext(browser);
for (const w of widths) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
    await sleep(600);
    const info = await page.evaluate(() => {
        const vis = (sel) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const st = getComputedStyle(el);
            return r.width > 0 && r.height > 0 && st.display !== "none" && st.visibility !== "hidden";
        };
        const sidebars = [...document.querySelectorAll("[data-testid=tool-sidebar]")]
            .filter((el) => el.getBoundingClientRect().width > 0).length;
        const shellBtn = [...document.querySelectorAll("button[aria-label^='打开']")].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.getAttribute("aria-label"));
        return {
            w: innerWidth,
            appNavTrigger: vis("[data-testid=tools-nav-mobile-trigger]"),
            primaryNav: vis("[data-testid=tools-nav-primary]"),
            shellNavButtons: shellBtn,
            visibleSidebars: sidebars,
            scrollOverflow: document.documentElement.scrollWidth - innerWidth,
        };
    });
    console.log(JSON.stringify(info));
}
await browser.close();
