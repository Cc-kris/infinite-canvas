import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = "http://127.0.0.1:3000";
const EV = "/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/design19b-nv-final/_probe";
const ROUTES = [
    ["AI_POSE_GENERATOR", "/tools/product-design/ai-pose-generator"],
    ["AI_DRESSING_XSY", "/tools/product-design/ai-dressing-xsy"],
    ["FISSION_LINK", "/tools/product-design/fission-link"],
    ["IMAGE_TEXT_EDIT", "/tools/product-design/image-text-edit"],
    ["MATERIAL_UPPER_BODY", "/tools/product-design/material-upper-body"],
    ["NEW_DESIGNER", "/tools/product-design/new-designer"],
    ["PRODUCT_MARKET_MATERIAL", "/tools/product-design/product-market-material"],
    ["SCENE_TRANSFER", "/tools/product-design/scene-transfer"],
];

const browser = await chromium.launch({ headless: true, channel: "chrome" });
await fs.mkdir(EV, { recursive: true });
for (const [id, route] of ROUTES) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await ctx.newPage();
    await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    const info = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll("[data-testid]").forEach((el) => {
            const t = el.getAttribute("data-testid");
            const tag = el.tagName.toLowerCase();
            const txt = (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40);
            const dis = el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true";
            out.push({ t, tag, txt, dis });
        });
        return {
            toolId: document.querySelector("[data-tool-id]")?.getAttribute("data-tool-id"),
            text: document.body.innerText.slice(0, 1200),
            controls: out.slice(0, 200),
        };
    });
    await fs.writeFile(path.join(EV, `${id}.json`), JSON.stringify(info, null, 1));
    console.log(id, "mounted=", info.toolId, "controls=", info.controls.length);
    await ctx.close();
}
await browser.close();
