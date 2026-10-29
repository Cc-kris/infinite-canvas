/**
 * 视频类工具视觉对照采集：本地 6 页截图 + 可见文本 + 控件矩形 + 关键样式。
 * 只读采集，不触发真实生成。
 *
 *   cd web && ~/.bun/bin/bun scripts/real-acceptance/capture-video-tools-parity.mjs [outDir]
 */
import { launchBrowser, BASE_URL } from "./lib.mjs";
import fs from "node:fs/promises";
import path from "node:path";

const TOOLS = [
    { id: "AI_VIDEO_EDITING", route: "/tools/ai-video/ai-video-editing" },
    { id: "VIDEO_REPLICATION", route: "/tools/ai-video/video-replication" },
    { id: "SALE_VIDEO", route: "/tools/ai-video/sale-video" },
    { id: "FISSION_LINK", route: "/tools/product-design/fission-link" },
    { id: "VIDEO_TRANSLATION", route: "/tools/ai-video/video-translation" },
    { id: "VIDEO_CONCAT", route: "/tools/ai-video/video-concat" },
];

const outDir = process.argv[2] || path.resolve(process.cwd(), "../docs/V1.0/plan_linkfox_navigation/evidence/video-parity-20261029/local");

const COLLECT = () => {
    const rectOf = (el) => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const styleOf = (el) => {
        const cs = getComputedStyle(el);
        return {
            fontSize: cs.fontSize,
            fontWeight: cs.fontWeight,
            color: cs.color,
            background: cs.backgroundColor,
            borderRadius: cs.borderRadius,
            padding: cs.padding,
            border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
        };
    };
    const visible = (el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
    };
    const controls = [...document.querySelectorAll("button,a[role=button],input,textarea,select,[role=tab],[role=radio],[role=switch]")]
        .filter(visible)
        .map((el) => ({
            tag: el.tagName.toLowerCase(),
            text: (el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().slice(0, 80),
            placeholder: el.getAttribute("placeholder") || "",
            disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true",
            rect: rectOf(el),
            style: styleOf(el),
        }))
        .filter((c) => c.text || c.placeholder);

    const texts = [];
    const walk = (el) => {
        for (const child of el.children) {
            const cs = getComputedStyle(child);
            if (cs.display === "none" || cs.visibility === "hidden") continue;
            const own = [...child.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
            if (own && visible(child)) {
                const t = (child.textContent || "").trim().replace(/\s+/g, " ");
                if (t) texts.push({ text: t.slice(0, 120), rect: rectOf(child), style: styleOf(child) });
            }
            walk(child);
        }
    };
    walk(document.body);
    const seen = new Set();
    const uniqTexts = texts.filter((t) => (seen.has(t.text + t.rect.y) ? false : (seen.add(t.text + t.rect.y), true)));

    const main = document.querySelector("main") || document.body;
    return {
        url: location.href,
        title: document.title,
        viewport: { w: innerWidth, h: innerHeight, scrollH: document.documentElement.scrollHeight },
        mainRect: rectOf(main),
        controls,
        texts: uniqTexts,
        html: document.body.innerHTML.length,
    };
};

const run = async () => {
    await fs.mkdir(outDir, { recursive: true });
    const browser = await launchBrowser({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1908, height: 781 }, locale: "zh-CN" });
    const page = await context.newPage();
    const report = { baseUrl: BASE_URL, capturedAt: new Date().toISOString(), viewport: { w: 1908, h: 781 }, tools: {} };

    for (const tool of TOOLS) {
        const url = `${BASE_URL}${tool.route}`;
        await page.goto(url, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(1200);
        const data = await page.evaluate(COLLECT);
        const dir = path.join(outDir, tool.id);
        await fs.mkdir(dir, { recursive: true });
        await page.screenshot({ path: path.join(dir, "shot.png"), fullPage: false });
        await fs.writeFile(path.join(dir, "dom.json"), JSON.stringify(data, null, 2));
        report.tools[tool.id] = { url: data.url, title: data.title, viewport: data.viewport, mainRect: data.mainRect, controls: data.controls.length, texts: data.texts.length };
        console.log(`${tool.id}: ${data.url} main=${JSON.stringify(data.mainRect)} controls=${data.controls.length} texts=${data.texts.length}`);
    }
    await fs.writeFile(path.join(outDir, "capture.json"), JSON.stringify(report, null, 2));
    await browser.close();
};

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
