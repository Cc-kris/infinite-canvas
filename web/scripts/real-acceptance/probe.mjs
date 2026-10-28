/** 探针：某工具页的真实 DOM 状态（侧栏数量、工作台可见性、控件清单）。 */
import { BASE_URL, launchBrowser, prepareContext, sleep } from "./lib.mjs";

const route = process.argv[2] || "/tools/smart-edit/image-crop";
const browser = await launchBrowser();
const { context, page, network } = await prepareContext(browser);
console.log("config:", JSON.stringify(await page.evaluate(async () => {
    const m = await import("/src/stores/use-config-store.ts");
    const c = m.useConfigStore.getState().config;
    return { proxyEnabled: c.proxyEnabled, proxyUrl: c.proxyUrl, imageModel: c.imageModel, channelMode: c.channelMode };
})));
await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
await sleep(1200);
const info = await page.evaluate(() => {
    const vis = (el) => !!(el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
    const sidebars = [...document.querySelectorAll("[data-testid=tool-sidebar]")].map((el) => ({
        visible: vis(el), w: Math.round(el.getBoundingClientRect().width), x: Math.round(el.getBoundingClientRect().x),
    }));
    const testids = [...new Set([...document.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid")))];
    return {
        url: location.pathname,
        title: document.title,
        sidebars,
        navTriggerVisible: vis(document.querySelector("[data-testid=tools-nav-mobile-trigger]")),
        bodyScrollW: document.documentElement.scrollWidth,
        testids: testids.slice(0, 150),
        text: document.body.innerText.replace(/\n{2,}/g, "\n").slice(0, 1500),
    };
});
console.log(JSON.stringify(info, null, 1));
console.log("network:", JSON.stringify(network));
await page.screenshot({ path: `/tmp/probe${route.replace(/\W+/g, "-")}.png` });
await browser.close();
