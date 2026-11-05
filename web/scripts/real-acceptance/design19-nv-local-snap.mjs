/**
 * design19 前10工具：本地（127.0.0.1:3000）逐控件默认值 + 案例/同款 DOM 冷启动采集。
 * 产物：docs/V1.0/plan_linkfox_navigation/evidence/design19-nv-20261029/local/<ID>.json
 * 用法：node design19-nv-local-snap.mjs [--ids A,B]
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const EVID = path.join(REPO, "docs/V1.0/plan_linkfox_navigation/evidence/design19-nv-20261029/local");
const JS = fs.readFileSync(path.join(REPO, "docs/V1.0/plan_linkfox_navigation/tools/design19_nv_snap.js"), "utf8");

const TOOLS = [
    ["NEW_REPLACE_BG_V2", "/tools/product-design/new-replace-bg-v2"],
    ["REPLACE_GOODS", "/tools/product-design/replace-goods"],
    ["PRODUCT_SCENE", "/tools/product-design/product-scene"],
    ["HANDHELD_GOODS", "/tools/product-design/handheld-goods"],
    ["AI_DRESSING_V2", "/tools/product-design/ai-dressing-v2"],
    ["AI_POSTURE", "/tools/product-design/ai-posture"],
    ["AI_WEARABLE", "/tools/product-design/ai-wearable"],
    ["AI_TEXT", "/tools/product-design/ai-text"],
    ["ORNAMENT_TEXT", "/tools/product-design/ornament-text"],
    ["SDS_DESIGN", "/tools/product-design/sds-design"],
];

const only = (process.argv.find(a => a.startsWith("--ids=")) || "").replace("--ids=", "").split(",").filter(Boolean);
const list = only.length ? TOOLS.filter(t => only.includes(t[0])) : TOOLS;

fs.mkdirSync(EVID, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
    for (const [id, route] of list) {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
        const page = await ctx.newPage();
        const errs = [];
        page.on("pageerror", e => errs.push(String(e).slice(0, 300)));
        const t0 = Date.now();
        await page.goto("http://127.0.0.1:3000" + route, { waitUntil: "networkidle", timeout: 60000 }).catch(e => errs.push("goto:" + e.message));
        await page.waitForTimeout(2500);
        const snap = await page.evaluate(JS);
        snap.capture = { side: "local", url: page.url(), ready: true, ms: Date.now() - t0, errors: errs.slice(0, 5) };
        fs.writeFileSync(path.join(EVID, id + ".json"), JSON.stringify(snap, null, 1));
        const cm = snap.caseModule || {};
        console.log(id, "ctrls=" + snap.controls.length, "groups=" + (snap.optionGroups || []).length, "case=" + cm.caseTab, "同款=" + cm.sameStyle, (Date.now() - t0) + "ms");
        await ctx.close();
    }
} finally {
    await browser.close();
}
