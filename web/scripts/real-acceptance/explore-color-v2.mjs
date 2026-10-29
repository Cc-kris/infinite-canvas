/** 探查 CHANGE_COLOR_V2 页面结构（不触发真实生成）。 */
import path from "node:path";
import fs from "node:fs/promises";
import { BASE_URL, launchBrowser, prepareContext, sleep } from "./lib.mjs";

const ROUTE = "/tools/ecommerce-suite/change-color-v2";

const browser = await launchBrowser();
const { context, page } = await prepareContext(browser);
const out = {};
try {
    await page.goto(BASE_URL + ROUTE, { waitUntil: "domcontentloaded" });
    await sleep(2500);
    out.url = page.url();
    out.title = await page.title();
    out.fileInputs = await page.evaluate(() =>
        Array.from(document.querySelectorAll("input[type=file]")).map((el, i) => ({
            i,
            testid: el.getAttribute("data-testid"),
            accept: el.getAttribute("accept"),
            multiple: el.multiple,
            hidden: el.hidden || getComputedStyle(el).display === "none",
        })),
    );
    out.buttons = await page.evaluate(() =>
        Array.from(document.querySelectorAll("button"))
            .map((b) => ({ text: (b.textContent || "").trim().slice(0, 24), testid: b.getAttribute("data-testid"), disabled: b.disabled }))
            .filter((b) => b.text || b.testid),
    );
    out.sections = await page.evaluate(() =>
        Array.from(document.querySelectorAll("section[id]")).map((s) => ({ id: s.id, head: (s.querySelector("h2,h3")?.textContent || "").trim().slice(0, 40) })),
    );
    out.text = (await page.locator("body").innerText()).slice(0, 4000);
    const dir = path.resolve("../docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/CHANGE_COLOR_V2");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "00-explore.json"), JSON.stringify(out, null, 2));
    console.log(JSON.stringify({ url: out.url, fileInputs: out.fileInputs, sections: out.sections }, null, 2));
    console.log("--- text ---");
    console.log(out.text);
} finally {
    await context.close();
    await browser.close();
}
