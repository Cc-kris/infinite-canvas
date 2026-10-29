/**
 * design19：D 维度（默认值逐控件）+ 案例/同款 同口径双端采集。
 * real 侧注入原站登录 Cookie（TMWebDriver CDP 导出），local 侧冷启，
 * 两端跑同一段提取器 /tmp/d19_extract.js → 产物 defaults-real/<TOOL>.json。
 */
import { chromium } from "playwright";
import fsp from "node:fs/promises";
import path from "node:path";

const NADIR = "/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/design19-nv-20261029";
const SRC = await fsp.readFile("/tmp/d19_extract.js", "utf8");
const TOOLS = [
    ["NEW_REPLACE_BG", "new-replace-bg-v2", "product-home"],
    ["REPLACE_GOODS", "replace-goods", "product-replacement"],
    ["PRODUCT_SCENE", "product-scene"],
    ["HANDHELD_GOODS", "handheld-goods"],
    ["AI_DRESSING_V2", "ai-dressing-v2", "ai-dressing"],
    ["AI_POSTURE", "ai-posture"],
    ["AI_WEARABLE", "ai-wearable"],
    ["AI_TEXT", "ai-text"],
    ["ORNAMENT_TEXT", "ornament-text"],
    ["SDS_DESIGN", "sds-design"],
];

const raw = JSON.parse(await fsp.readFile("/tmp/d19_cookies.json", "utf8"));
const cookies = raw.cookies
    .filter((c) => String(c.domain || "").includes("linkfox"))
    .map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || "/",
        expires: c.expirationDate ? Math.floor(c.expirationDate) : -1,
        httpOnly: !!c.httpOnly,
        secure: !!c.secure,
        sameSite: c.sameSite === "no_restriction" ? "None" : c.sameSite === "strict" ? "Strict" : "Lax",
    }));
console.log("linkfox cookies:", cookies.length);

const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
function diff(real, local) {
    const keyOf = (c) => `${c.kind}|${norm(c.label).slice(0, 28)}`;
    const rM = new Map(),
        lM = new Map();
    for (const c of real.controls) if (!rM.has(keyOf(c))) rM.set(keyOf(c), c);
    for (const c of local.controls) if (!lM.has(keyOf(c))) lM.set(keyOf(c), c);
    const changed = [];
    for (const [k, r] of rM) {
        const l = lM.get(k);
        if (!l) continue;
        const rv = r.value ?? r.active ?? JSON.stringify(r.checked ?? "");
        const lv = l.value ?? l.active ?? JSON.stringify(l.checked ?? "");
        if (norm(String(rv)) !== norm(String(lv))) changed.push({ key: k, real: rv, local: lv });
        else if ((r.options || []).join(",") !== (l.options || []).join(",")) changed.push({ key: k, real: `options:${(r.options || []).join("|")}`, local: `options:${(l.options || []).join("|")}` });
    }
    return { onlyReal: [...rM.keys()].filter((k) => !lM.has(k)), onlyLocal: [...lM.keys()].filter((k) => !rM.has(k)), changed };
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const summary = [];
for (const [toolId, slug, realSlug] of TOOLS.filter((t) => !process.env.IC_D19_ONLY || process.env.IC_D19_ONLY.split(",").includes(t[0]))) {
    const rec = { toolId, slug };
    for (const side of ["real", "local"]) {
        const ctx = await browser.newContext({
            viewport: { width: 1500, height: 950 },
            proxy: side === "real" ? { server: "http://127.0.0.1:7890", bypass: "localhost,127.0.0.1" } : undefined,
        });
        if (side === "real") await ctx.addCookies(cookies);
        const page = await ctx.newPage();
        try {
            const url = side === "real" ? `https://www.linkfox.com/draw/${realSlug || slug}` : `http://127.0.0.1:3000/tools/product-design/${slug}`;
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
            await page.waitForTimeout(side === "real" ? 7000 : 4000);
            const j = await page.evaluate(SRC);
            rec[side] = JSON.parse(j);
        } catch (e) {
            rec[side] = { error: String(e?.message || e).slice(0, 160) };
        } finally {
            await ctx.close().catch(() => {});
        }
    }
    if (rec.real?.controls && rec.local?.controls) rec.diff = diff(rec.real, rec.local);
    await fsp.writeFile(path.join(NADIR, "defaults-real", `${toolId}.json`), JSON.stringify(rec, null, 2));
    const d = rec.diff || {};
    console.log(
        `${toolId}: real=${rec.real?.controls?.length ?? "ERR"} local=${rec.local?.controls?.length ?? "ERR"} onlyR=${d.onlyReal?.length ?? "-"} onlyL=${d.onlyLocal?.length ?? "-"} chg=${d.changed?.length ?? "-"} caseR=${JSON.stringify(rec.real?.caseModule)} caseL=${JSON.stringify(rec.local?.caseModule)} gate=${rec.real?.loginGate}`,
    );
    summary.push({ toolId, counts: { onlyReal: d.onlyReal?.length, onlyLocal: d.onlyLocal?.length, changed: d.changed?.length }, caseReal: rec.real?.caseModule, caseLocal: rec.local?.caseModule, loginGate: rec.real?.loginGate });
}
await browser.close();
await fsp.writeFile(path.join(NADIR, "defaults-real-summary.json"), JSON.stringify(summary, null, 2));
