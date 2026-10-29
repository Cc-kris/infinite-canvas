/**
 * design19：10 工具「默认值逐控件」+「案例/同款模块」同口径双端采集与比对。
 * 同一段提取器分别跑 local(127.0.0.1:3000) 与 real(www.linkfox.com/draw)，
 * 产物：defaults/<TOOL>.json（两端控件快照 + diff）。
 * 用法：node run-defaults-diff.mjs
 */
import { chromium } from "playwright";
import fsp from "node:fs/promises";
import path from "node:path";

const NADIR = "/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/design19-nv-20261029";
const LOCAL = "http://127.0.0.1:3000/tools/product-design";
const REAL = "https://www.linkfox.com/draw";

const TOOLS = [
    { toolId: "NEW_REPLACE_BG", slug: "new-replace-bg-v2" },
    { toolId: "REPLACE_GOODS", slug: "replace-goods" },
    { toolId: "PRODUCT_SCENE", slug: "product-scene" },
    { toolId: "HANDHELD_GOODS", slug: "handheld-goods" },
    { toolId: "AI_DRESSING_V2", slug: "ai-dressing-v2" },
    { toolId: "AI_POSTURE", slug: "ai-posture" },
    { toolId: "AI_WEARABLE", slug: "ai-wearable" },
    { toolId: "AI_TEXT", slug: "ai-text" },
    { toolId: "ORNAMENT_TEXT", slug: "ornament-text" },
    { toolId: "SDS_DESIGN", slug: "sds-design" },
];

/** 同口径提取器：只取「可交互表单控件 + 选中态 chip 组 + 案例模块」，不取导航。 */
const EXTRACT = () => {
    const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
    const nearLabel = (el) => {
        const aria = clean(el.getAttribute("aria-label"));
        if (aria) return aria;
        const id = el.id;
        if (id) {
            const lab = document.querySelector(`label[for="${CSS.escape(id)}"]`);
            if (lab) return clean(lab.innerText);
        }
        let p = el.parentElement;
        for (let i = 0; i < 4 && p; i += 1) {
            const t = clean(p.innerText);
            if (t && t.length <= 60) return t;
            p = p.parentElement;
        }
        return "";
    };
    const controls = [];
    // 1) 原生 select
    for (const el of document.querySelectorAll("select")) {
        controls.push({
            kind: "select",
            label: nearLabel(el),
            value: el.value,
            options: Array.from(el.options).map((o) => `${o.value}=${clean(o.text)}`).filter((x) => !x.includes("=自定义")),
        });
    }
    // 2) 文本/数字输入
    for (const el of document.querySelectorAll("input, textarea")) {
        if (el.type === "file" || el.type === "hidden") continue;
        controls.push({
            kind: el.tagName === "TEXTAREA" ? "textarea" : `input:${el.type || "text"}`,
            label: clean(el.placeholder) || nearLabel(el),
            value: el.type === "checkbox" || el.type === "radio" ? String(el.checked) : el.value,
        });
    }
    // 3) radio/checkbox 组（按 name 聚合）
    const groups = new Map();
    for (const el of document.querySelectorAll('input[type="radio"], input[type="checkbox"]')) {
        const key = `${el.type}:${el.name || nearLabel(el.parentElement)}`;
        if (!groups.has(key)) groups.set(key, { kind: "group", label: key, options: [], checked: [] });
        const g = groups.get(key);
        const t = clean(el.closest("label")?.innerText || el.value);
        g.options.push(t);
        if (el.checked) g.checked.push(t);
    }
    for (const g of groups.values()) controls.push(g);

    // 4) chip 组：同一父容器内的 2~8 个按钮，其中一个呈选中态
    const isActive = (b) =>
        b.getAttribute("aria-pressed") === "true" ||
        /(^|\s)(active|selected|is-active)(\s|$)/.test(b.className || "") ||
        (getComputedStyle(b).backgroundColor !== "rgba(0, 0, 0, 0)" && getComputedStyle(b).color === "rgb(255, 255, 255)");
    const seen = new Set();
    for (const box of document.querySelectorAll("div, ul")) {
        const btns = Array.from(box.children).filter((c) => c.tagName === "BUTTON" || (c.tagName === "DIV" && c.querySelector(":scope > button")));
        const real = btns.map((c) => (c.tagName === "BUTTON" ? c : c.querySelector(":scope > button"))).filter(Boolean);
        if (real.length < 2 || real.length > 8) continue;
        if (real.some((b) => seen.has(b))) continue;
        const actives = real.filter(isActive).map((b) => clean(b.innerText)).filter(Boolean);
        if (actives.length !== 1) continue;
        real.forEach((b) => seen.add(b));
        controls.push({
            kind: "chips",
            label: clean(box.parentElement?.innerText || "").slice(0, 40),
            options: real.map((b) => clean(b.innerText)).filter(Boolean),
            active: actives[0],
        });
    }

    // 5) 案例/同款模块
    const bodyText = document.body.innerText;
    const tabTexts = Array.from(document.querySelectorAll("button, [role=tab], div"))
        .map((n) => clean(n.innerText))
        .filter((t) => t && t.length <= 8);
    const caseTab = tabTexts.filter((t) => t === "优秀案例" || t === "案例").length;
    const sameStyle = Array.from(document.querySelectorAll("button, div")).filter((n) => clean(n.innerText) === "同款").length;
    return {
        url: location.href,
        title: document.title,
        loginGate: /登录\/注册|登录免费生成/.test(bodyText),
        controls,
        caseModule: { caseTab, sameStyle, hasCaseWord: /优秀案例|案例/.test(bodyText) },
    };
};

const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

function diffSide(real, local) {
    const keyOf = (c) => `${c.kind}|${norm(c.label).slice(0, 30)}`;
    const rMap = new Map();
    for (const c of real.controls) if (!rMap.has(keyOf(c))) rMap.set(keyOf(c), c);
    const lMap = new Map();
    for (const c of local.controls) if (!lMap.has(keyOf(c))) lMap.set(keyOf(c), c);
    const onlyReal = [...rMap.keys()].filter((k) => !lMap.has(k));
    const onlyLocal = [...lMap.keys()].filter((k) => !rMap.has(k));
    const changed = [];
    for (const [k, r] of rMap) {
        const l = lMap.get(k);
        if (!l) continue;
        const rv = r.value ?? r.active ?? JSON.stringify(r.checked ?? "");
        const lv = l.value ?? l.active ?? JSON.stringify(l.checked ?? "");
        if (norm(String(rv)) !== norm(String(lv))) changed.push({ key: k, real: rv, local: lv });
        else if (r.options && l.options && r.options.join(",") !== l.options.join(",")) {
            changed.push({ key: k, real: `options:${r.options.join("|")}`, local: `options:${l.options.join("|")}` });
        }
    }
    return { onlyReal, onlyLocal, changed };
}

await fsp.mkdir(path.join(NADIR, "defaults"), { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const out = [];
for (const t of TOOLS) {
    const res = { toolId: t.toolId, slug: t.slug };
    for (const [side, base] of [["real", REAL], ["local", LOCAL]]) {
        const ctx = await browser.newContext({
            viewport: { width: 1440, height: 900 },
            proxy: side === "real" ? { server: "http://127.0.0.1:7890", bypass: "localhost,127.0.0.1" } : undefined,
        });
        const page = await ctx.newPage();
        try {
            await page.goto(`${base}/${t.slug}`, { waitUntil: "domcontentloaded", timeout: 45000 });
            await page.waitForTimeout(side === "real" ? 6000 : 3500);
            res[side] = await page.evaluate(EXTRACT);
        } catch (e) {
            res[side] = { error: String(e?.message || e).slice(0, 200) };
        } finally {
            await ctx.close().catch(() => {});
        }
    }
    if (res.real?.controls && res.local?.controls) {
        res.diff = diffSide(res.real, res.local);
        res.caseDiff = {
            real: res.real.caseModule,
            local: res.local.caseModule,
        };
    }
    await fsp.writeFile(path.join(NADIR, "defaults", `${t.toolId}.json`), JSON.stringify(res, null, 2));
    const d = res.diff || {};
    console.log(
        `${t.toolId}: realCtrls=${res.real?.controls?.length ?? "err"} localCtrls=${res.local?.controls?.length ?? "err"} onlyReal=${d.onlyReal?.length ?? "-"} onlyLocal=${d.onlyLocal?.length ?? "-"} changed=${d.changed?.length ?? "-"} case=${JSON.stringify(res.caseDiff ?? null)}`,
    );
    out.push({ toolId: t.toolId, diffCounts: { onlyReal: d.onlyReal?.length, onlyLocal: d.onlyLocal?.length, changed: d.changed?.length }, caseDiff: res.caseDiff, loginGate: res.real?.loginGate });
}
await browser.close();
await fsp.writeFile(path.join(NADIR, "defaults-summary.json"), JSON.stringify(out, null, 2));
