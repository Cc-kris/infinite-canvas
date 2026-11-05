/**
 * edit8 八工具「六维终验」本地侧采集器（同状态：全新上下文、未上传图片、1908×781）。
 *
 * 采集内容（每条都可复算）：
 *  - rect：根容器 / 左右面板 / 表单控件 / 按钮的 getBoundingClientRect
 *  - 计算样式：backgroundColor / color / borderColor / borderRadius / borderWidth / fontSize / fontWeight / padding / lineHeight / boxShadow
 *  - 原始 DOM：documentElement.outerHTML 落盘（dom/<TOOL>.html）
 *  - 文案：body.innerText + 工作区可见文本集合
 *  - 控件默认值：value / checked / aria-checked / aria-selected / disabled / placeholder
 *
 * 运行：cd web && zsh -lc 'node scripts/real-acceptance/edit8-final-snap.mjs [TOOL...]'
 */
import fs from "node:fs/promises";
import path from "node:path";
import { launchBrowser, BASE_URL } from "./lib.mjs";

const OUT_ROOT = path.resolve(
    process.cwd(),
    "../docs/V1.0/plan_linkfox_navigation/evidence/edit8-final-20261029",
);

export const TOOLS = {
    SCALE_UP: "/tools/ecommerce-suite/scale-up",
    AI_OUTPAINTING: "/tools/ecommerce-suite/ai-outpainting",
    AREA_REPAIR: "/tools/smart-edit/area-repair",
    REMOVE_PEN: "/tools/smart-edit/remove-pen",
    CHANGE_COLOR: "/tools/smart-edit/change-color",
    IMAGE_CROP: "/tools/smart-edit/image-crop",
    PRODUCT_REFINE: "/tools/smart-edit/product-refine",
    FIX_COLOR: "/tools/smart-edit/fix-color",
};

const STYLE_KEYS = [
    "backgroundColor",
    "color",
    "borderColor",
    "borderRadius",
    "borderWidth",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "padding",
    "boxShadow",
];

function snapshotInPage() {
    const rectOf = (el) => {
        const r = el.getBoundingClientRect();
        return {
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
        };
    };
    const NAME_MAP = {
        backgroundColor: "bg",
        color: "color",
        borderColor: "bc",
        borderRadius: "br",
        borderWidth: "bw",
        fontSize: "fs",
        fontWeight: "fw",
        lineHeight: "lh",
        padding: "pad",
        boxShadow: "shadow",
    };
    const KEYS = [
        "backgroundColor",
        "color",
        "borderColor",
        "borderRadius",
        "borderWidth",
        "fontSize",
        "fontWeight",
        "lineHeight",
        "padding",
        "boxShadow",
    ];
    const styleOf = (el) => {
        const c = getComputedStyle(el);
        const out = {};
        for (const k of KEYS) out[NAME_MAP[k]] = c[k];
        return out;
    };
    const textOf = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    const visible = (el) => {
        const r = el.getBoundingClientRect();
        const c = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && c.visibility !== "hidden" && c.display !== "none";
    };

    const root = document.querySelector("[data-testid$='-workspace']") || document.querySelector("main") || document.body;

    const controls = [...document.querySelectorAll("input,select,textarea,button,[role='button'],[role='radio'],[role='tab'],[role='switch'],[role='checkbox']")]
        .filter(visible)
        .map((el) => ({
            tag: el.tagName.toLowerCase(),
            type: el.getAttribute("type"),
            role: el.getAttribute("role"),
            testid: el.getAttribute("data-testid"),
            text: textOf(el).slice(0, 40),
            value: "value" in el ? String(el.value ?? "") : "",
            checked: "checked" in el ? Boolean(el.checked) : null,
            ariaChecked: el.getAttribute("aria-checked"),
            ariaSelected: el.getAttribute("aria-selected"),
            ariaPressed: el.getAttribute("aria-pressed"),
            disabled: Boolean(el.disabled) || el.getAttribute("aria-disabled") === "true",
            ph: el.getAttribute("placeholder"),
            r: rectOf(el),
            css: styleOf(el),
        }));

    // chips：可点击的文本叶子（原站快照同口径：短文本 + 可交互角色/标签）
    const chips = [...document.querySelectorAll("button,a,[role='button'],[role='tab'],[role='radio'],[role='menuitem'],label,span,div")]
        .filter((el) => visible(el))
        .filter((el) => {
            const t = textOf(el);
            if (!t || t.length > 30) return false;
            return ![...el.children].some((c) => textOf(c).replace(/\s+/g, "") === t.replace(/\s+/g, ""));
        })
        .map((el) => ({ text: textOf(el), cls: String(el.className).slice(0, 60), r: rectOf(el), css: styleOf(el) }));

    // 关键区段（面板级 rect + 样式）：带 data-testid 的区段容器
    const regions = [...document.querySelectorAll("[data-testid],[data-region]")]
        .filter(visible)
        .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width >= 120 && r.height >= 40;
        })
        .map((el) => ({
            key: el.getAttribute("data-testid") || el.getAttribute("data-region"),
            r: rectOf(el),
            css: styleOf(el),
        }))
        .slice(0, 60);

    const headings = [...document.querySelectorAll("h1,h2,h3,h4,legend")]
        .filter(visible)
        .map((el) => ({ tag: el.tagName.toLowerCase(), text: textOf(el), r: rectOf(el), css: styleOf(el) }));

    const t0 = rectOf(root);
    const panels = [...root.children]
        .filter(visible)
        .map((el) => ({ key: el.getAttribute("data-testid") || el.getAttribute("class")?.slice(0, 40) || "", r: rectOf(el), css: { bg: styleOf(el).bg, br: styleOf(el).br, bw: styleOf(el).bw } }));

    return {
        url: location.pathname,
        title: document.title,
        viewport: { w: innerWidth, h: innerHeight, scrollH: document.documentElement.scrollHeight },
        root: { key: root.getAttribute("data-testid") || root.tagName.toLowerCase(), r: t0, css: styleOf(root) },
        panels,
        regions,
        headings,
        controls,
        chips,
        bodyText: document.body.innerText,
        workspaceText: textOf(root),
        dom: document.documentElement.outerHTML,
    };
}

async function run() {
    const which = process.argv.slice(2);
    const list = Object.entries(TOOLS).filter(([id]) => !which.length || which.includes(id));
    await fs.mkdir(path.join(OUT_ROOT, "local"), { recursive: true });
    await fs.mkdir(path.join(OUT_ROOT, "dom"), { recursive: true });

    const browser = await launchBrowser({ headless: true });
    const summary = {};
    try {
        for (const [id, route] of list) {
            // 全新上下文 = 干净 localStorage / IndexedDB（与原站「新开页面未上传」同状态）
            const context = await browser.newContext({ viewport: { width: 1908, height: 781 }, locale: "zh-CN" });
            const page = await context.newPage();
            const errors = [];
            page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
            await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
            await page.waitForSelector("[data-testid$='-workspace']", { timeout: 60000 }).catch(() => null);
            await page.waitForTimeout(1500);

            const snap = await page.evaluate(snapshotInPage);
            const dom = snap.dom;
            delete snap.dom;
            snap.errors = errors;
            await fs.writeFile(path.join(OUT_ROOT, "local", `${id}.json`), JSON.stringify(snap, null, 2));
            await fs.writeFile(path.join(OUT_ROOT, "dom", `${id}.html`), dom);
            await page.screenshot({ path: path.join(OUT_ROOT, "local", `${id}.png`), fullPage: true });

            summary[id] = {
                url: snap.url,
                root: snap.root,
                regions: snap.regions.length,
                controls: snap.controls.length,
                chips: snap.chips.length,
                errors,
            };
            console.log(id, JSON.stringify(summary[id]));
            await context.close();
        }
    } finally {
        await browser.close();
    }
    await fs.writeFile(path.join(OUT_ROOT, "local", "_summary.json"), JSON.stringify(summary, null, 2));
}

await run();
