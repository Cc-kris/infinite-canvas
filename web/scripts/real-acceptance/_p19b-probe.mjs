/**
 * design19b 后9工具本地页控件探针（只读，不改状态）。
 * 用法: node scripts/real-acceptance/_p19b-probe.mjs [--ids=A,B]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3000";
const OUT = "/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/design19b-nv-final/_probe";

const TOOLS = [
    ["PRINT_EXTRACT", "/tools/product-design/print-extract"],
    ["AI_POSE_GENERATOR", "/tools/product-design/ai-pose-generator"],
    ["AI_DRESSING_XSY", "/tools/product-design/ai-dressing-xsy"],
    ["FISSION_LINK", "/tools/product-design/fission-link"],
    ["IMAGE_TEXT_EDIT", "/tools/product-design/image-text-edit"],
    ["MATERIAL_UPPER_BODY", "/tools/product-design/material-upper-body"],
    ["NEW_DESIGNER", "/tools/product-design/new-designer"],
    ["PRODUCT_MARKET_MATERIAL", "/tools/product-design/product-market-material"],
    ["SCENE_TRANSFER", "/tools/product-design/scene-transfer"],
];
const ids = (process.argv.find((a) => a.startsWith("--ids=")) || "").replace("--ids=", "").split(",").filter(Boolean);
const list = ids.length ? TOOLS.filter((t) => ids.includes(t[0])) : TOOLS;

await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const out = {};
try {
    for (const [id, route] of list) {
        const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "zh-CN" });
        const page = await ctx.newPage();
        const errs = [];
        page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
        await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => errs.push("goto:" + e.message));
        await page.waitForTimeout(3500);
        const snap = await page.evaluate(() => {
            const txt = (n) => (n.textContent || "").replace(/\s+/g, " ").trim();
            const ws = document.querySelector('[data-testid="tool-workspace"]');
            const root = ws || document.querySelector("main") || document.body;
            const all = [...document.querySelectorAll("[data-testid]")].map((n) => n.getAttribute("data-testid"));
            return {
                path: location.pathname,
                toolId: ws?.getAttribute("data-tool-id") || null,
                workspaceReady: ws?.getAttribute("data-workspace") || null,
                testids: [...new Set(all)].slice(0, 400),
                files: [...root.querySelectorAll('input[type="file"]')].map((n, i) => ({ i, accept: n.accept, multiple: n.multiple })),
                buttons: [...root.querySelectorAll("button")].map((b) => ({ text: txt(b).slice(0, 40), testid: b.getAttribute("data-testid"), disabled: Boolean(b.disabled) })).filter((b) => b.text || b.testid),
                textareas: [...root.querySelectorAll("textarea")].map((t) => ({ aria: t.getAttribute("aria-label"), ph: t.placeholder, testid: t.getAttribute("data-testid") })),
                selects: [...root.querySelectorAll("select")].map((s) => ({ testid: s.getAttribute("data-testid"), value: s.value, n: s.options.length })),
                tabs: [...document.querySelectorAll('[role="tab"]')].map((t) => ({ text: txt(t), sel: t.getAttribute("aria-selected"), testid: t.getAttribute("data-testid") })),
                bodyText: (document.body.innerText || "").replace(/\n{2,}/g, "\n").slice(0, 2500),
            };
        });
        snap.errors = errs.slice(0, 5);
        out[id] = snap;
        await page.screenshot({ path: path.join(OUT, `${id}.png`), fullPage: false }).catch(() => {});
        console.log(`${id} toolId=${snap.toolId} files=${snap.files.length} btn=${snap.buttons.length} tabs=${snap.tabs.map((t) => t.text).join("/")} err=${snap.errors.join("|").slice(0, 80)}`);
        await ctx.close();
    }
} finally {
    await browser.close();
}
await fs.writeFile(path.join(OUT, "_probe.json"), JSON.stringify(out, null, 1));
