/**
 * 工具页样式对齐「Infinite Canvas 画布视觉语言」的实测证据采集。
 *
 * 检查项（不截图也能判定的硬证据，截图仅辅助）：
 * 1. 关键节点计算样式：工作台/左列/页签栏/主按钮/选项 chip 的 bg、color、border、radius；
 * 2. 旧 LinkFox 像素值残留扫描：整页遍历 computed bg/color/borderColor，命中禁用色即报；
 * 3. 390 宽无横向溢出。
 *
 * 用法：bun scripts/real-acceptance/canvas-token-align.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const OUT = path.resolve(
    process.cwd(),
    "../docs/V1.0/plan_linkfox_navigation/evidence/canvas-token-align-20261029",
);

const PAGES = [
    ["design19_handheld", "/tools/product-design/handheld-goods"],
    ["edit8_change_color", "/tools/smart-edit/change-color"],
];

const BANNED = [
    "#f5f7fa", "#edeff5", "#fafafa", "#f9f0ff",
    "#723cf9", "#3a7df9", "#6231e0",
    "#ededf0", "#f0f0f3", "#d9d9e0", "#e5e5ea", "#c9c9d4",
    "#1f1f2c", "#8a8a99", "#5a5a66", "#6b6b80",
];

const toHex = (v) => {
    if (!v) return "";
    const m = v.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    if (!m) return v;
    const [r, g, b] = [+m[1], +m[2], +m[3]].map((n) => Math.round(n).toString(16).padStart(2, "0"));
    return `#${r}${g}${b}`;
};

const probe = () => {
    const cs = (el, prop) => (el ? getComputedStyle(el).getPropertyValue(prop) : null);
    const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
    };
    const workbench =
        document.querySelector('[data-region="design19"]') ||
        document.querySelector('[data-layout="linkfox-edit8"]');
    const leftCol = workbench?.firstElementChild || null;
    const tabbar = document.querySelector('[role="tablist"]');
    const activeTab = tabbar?.querySelector('[aria-selected="true"], [data-state="active"]') || null;
    const buttons = [...document.querySelectorAll("button")];
    const primaryBtn =
        buttons.find((b) => /生成|立即生成/.test(b.textContent || "") && !b.disabled) ||
        buttons.find((b) => /生成/.test(b.textContent || "")) ||
        null;
    const chips = buttons.filter((b) => Math.round(b.getBoundingClientRect().height) === 26);
    const dropLabel = document.querySelector('[data-testid="tool-asset-drop-label"]');

    const bannedSet = new Set([
        "#f5f7fa", "#edeff5", "#fafafa", "#f9f0ff",
        "#723cf9", "#3a7df9", "#6231e0",
        "#ededf0", "#f0f0f3", "#d9d9e0", "#e5e5ea", "#c9c9d4",
        "#1f1f2c", "#8a8a99", "#5a5a66", "#6b6b80",
    ]);
    const hex = (v) => {
        if (!v) return "";
        const m = v.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
        if (!m) return v;
        const [r, g, b] = [+m[1], +m[2], +m[3]].map((n) => Math.round(n).toString(16).padStart(2, "0"));
        return `#${r}${g}${b}`;
    };
    const hits = [];
    for (const el of document.querySelectorAll("body *")) {
        const s = getComputedStyle(el);
        for (const prop of ["backgroundColor", "color", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor"]) {
            const h = hex(s.getPropertyValue(prop));
            if (bannedSet.has(h)) {
                hits.push({
                    tag: el.tagName.toLowerCase(),
                    cls: (el.className || "").toString().slice(0, 70),
                    prop,
                    value: h,
                    text: (el.textContent || "").trim().slice(0, 24),
                });
                break;
            }
        }
        if (hits.length >= 12) break;
    }

    return {
        theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
        viewport: { w: innerWidth, h: innerHeight },
        workbench: workbench
            ? {
                  found: true,
                  bg: cs(workbench, "background-color"),
                  color: cs(workbench, "color"),
                  radius: cs(workbench, "border-radius"),
                  box: box(workbench),
              }
            : { found: false },
        leftCol: leftCol
            ? {
                  bg: cs(leftCol, "background-color"),
                  borderRight: `${cs(leftCol, "border-right-width")} ${cs(leftCol, "border-right-color")}`,
                  radius: cs(leftCol, "border-radius"),
                  box: box(leftCol),
              }
            : null,
        tabbar: tabbar
            ? {
                  bg: cs(tabbar, "background-color"),
                  borderBottom: `${cs(tabbar, "border-bottom-width")} ${cs(tabbar, "border-bottom-color")}`,
                  box: box(tabbar),
              }
            : null,
        activeTab: activeTab
            ? { text: (activeTab.textContent || "").trim(), color: cs(activeTab, "color"), weight: cs(activeTab, "font-weight") }
            : null,
        primaryBtn: primaryBtn
            ? {
                  text: (primaryBtn.textContent || "").trim().slice(0, 12),
                  bg: cs(primaryBtn, "background-color"),
                  image: cs(primaryBtn, "background-image"),
                  color: cs(primaryBtn, "color"),
                  radius: cs(primaryBtn, "border-radius"),
                  shadow: cs(primaryBtn, "box-shadow"),
                  box: box(primaryBtn),
              }
            : null,
        chip: chips[0]
            ? {
                  text: (chips[0].textContent || "").trim().slice(0, 8),
                  bg: cs(chips[0], "background-color"),
                  border: cs(chips[0], "border-top-color"),
                  radius: cs(chips[0], "border-radius"),
                  selectedBg: chips.find((c) => cs(c, "background-color") !== cs(chips[0], "background-color"))
                      ? cs(chips.find((c) => cs(c, "background-color") !== cs(chips[0], "background-color")), "background-color")
                      : null,
              }
            : null,
        dropLabel: dropLabel ? { color: cs(dropLabel, "color"), text: (dropLabel.textContent || "").trim() } : null,
        bannedHits: hits,
        overflowX: document.documentElement.scrollWidth - innerWidth,
        hasHelpDock: !!document.querySelector('[data-testid="tool-help-dock"]'),
    };
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
await fs.mkdir(OUT, { recursive: true });
const report = { at: new Date().toISOString(), baseUrl: BASE_URL, cases: {}, banned: BANNED };

for (const [key, url] of PAGES) {
    for (const mode of ["desktop-light", "mobile390-light", "desktop-dark"]) {
        const viewport = mode.startsWith("mobile390") ? { width: 390, height: 844 } : { width: 1440, height: 900 };
        const context = await browser.newContext({ viewport, locale: "zh-CN" });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
        await page.goto(BASE_URL + url, { waitUntil: "networkidle" });
        if (mode.endsWith("dark")) {
            await page.evaluate(() => {
                document.documentElement.classList.add("dark");
                document.documentElement.style.colorScheme = "dark";
            });
        }
        await page.waitForTimeout(700);
        const data = await page.evaluate(probe);
        await page.screenshot({ path: path.join(OUT, `${key}-${mode}.png`) });
        report.cases[`${key}__${mode}`] = { url, ...data, pageerrors: errors };
        await context.close();
    }
}

await browser.close();
await fs.writeFile(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
const summary = Object.entries(report.cases).map(([k, v]) => ({
    case: k,
    workbenchBg: v.workbench?.bg,
    leftBg: v.leftCol?.bg,
    btnBg: v.primaryBtn?.bg,
    btnImg: v.primaryBtn?.image,
    btnRadius: v.primaryBtn?.radius,
    banned: v.bannedHits?.length ?? -1,
    overflowX: v.overflowX,
}));
console.log(JSON.stringify(summary, null, 1));
