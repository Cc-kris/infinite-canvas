/**
 * 39 工具页布局断言（唯一可复现验收）。
 *
 * 事实源：docs/V1.0/plan_linkfox_navigation/REPLICA_SPEC_SHEET.md §0
 * 断言项（每页都必须过）：
 *   1. 工具侧栏 176–188px（PRD 184）
 *   2. 配置栏 240–360px（原站主流 300，画布类最高 360）   ← 由 ToolWorkspaceColumns 提供 data-testid
 *   3. 结果/编辑区 ≥ 工作区宽度 55%
 *   4. 正文不得出现 LinkFox 商业化残留文案
 *   5. 无水平溢出
 *
 * 用法：
 *   cd web
 *   export PATH=/opt/homebrew/bin:$PATH
 *   CHROME_PATH="$HOME/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" \
 *     node scripts/real-acceptance/tools-layout-check.mjs            # 全 39 页
 *   ... node scripts/real-acceptance/tools-layout-check.mjs --only=SCALE_UP,AREA_REPAIR
 *   ... node scripts/real-acceptance/tools-layout-check.mjs --json=/tmp/layout.json
 *
 * 退出码：0 全过；1 有失败（CI/worker 用它判定）。
 */
import fs from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

const BASE_URL = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const REPO = path.resolve(process.cwd(), "..");
const SPECS = path.join(REPO, "docs/V1.0/plan_linkfox_navigation/tool_specs.json");

/** 画布类页面：配置栏允许扩到 360px（图层/蒙版/裁剪/设计器/文字框选画布）。 */
const CANVAS_IDS = new Set(["AREA_REPAIR", "REMOVE_PEN", "AI_OUTPAINTING", "IMAGE_CROP", "NEW_DESIGNER", "PRODUCT_REFINE", "IMAGE_TEXT_EDIT"]);

/** 原站个别工具没有独立配置列（工具条 + 画布内结果），不能强求 data-testid=tool-config-column。 */
const NO_CONFIG_COLUMN = new Set(["REMOVE_PEN", "AI_OUTPAINTING", "SCALE_UP"]);
const FORBIDDEN = [
    { re: /算力/, why: "原站算力计费" },
    { re: /点\/张/, why: "原站按张计费" },
    { re: /积分/, why: "原站积分体系" },
    { re: /水印分组/, why: "原站水印分组字段（PRD 未要求）" },
    { re: /立即购买|会员专享|开通会员/, why: "原站付费营销文案" },
    { re: /免费领/, why: "原站拉新文案" },
];

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith("--only="));
const jsonArg = args.find((a) => a.startsWith("--json="));
const only = onlyArg ? onlyArg.split("=")[1].split(",").filter(Boolean) : null;
const jsonOut = jsonArg ? jsonArg.split("=")[1] : path.join(REPO, "docs/analysis/tools-layout-baseline.json");

const specs = JSON.parse(fs.readFileSync(SPECS, "utf8")).tools;
const targets = specs
    .filter((t) => (only ? only.includes(t.id) : true))
    .map((t) => ({ id: t.id, label: t.label, route: t.route, canvas: CANVAS_IDS.has(t.id) }));

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, locale: "zh-CN" });

const results = [];
for (const t of targets) {
    const row = { ...t };
    try {
        await page.goto(BASE_URL + t.route, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(900);
        const m = await page.evaluate(() => {
            const w = (sel) => {
                const el = document.querySelector(sel);
                if (!el) return null;
                return Math.round(el.getBoundingClientRect().width);
            };
            const sidebar = document.querySelector('[data-testid="tool-sidebar"]');
            const cfg = document.querySelector('[data-testid="tool-config-column"]');
            const main = document.querySelector('[data-testid="tool-main-column"]');
            const text = (document.body.innerText || "").replace(/\s+/g, " ");
            return {
                hasColumnsPrimitive: !!document.querySelector('[data-testid="tool-workspace-columns"]'),
                sidebarW: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : null,
                configW: cfg ? Math.round(cfg.getBoundingClientRect().width) : null,
                mainW: main ? Math.round(main.getBoundingClientRect().width) : null,
                overflow: Math.max(0, Math.round(document.documentElement.scrollWidth - window.innerWidth)),
                text,
            };
        });
        const cap = t.canvas ? 360 : 320;
        const noConfig = NO_CONFIG_COLUMN.has(t.id);
        const failures = [];
        if (!m.hasColumnsPrimitive && !noConfig) failures.push("缺少 ToolWorkspaceColumns（无 data-testid=tool-workspace-columns）");
        if (m.sidebarW === null) failures.push("缺少工具侧栏 data-testid=tool-sidebar");
        else if (m.sidebarW < 176 || m.sidebarW > 188) failures.push(`工具侧栏 ${m.sidebarW}px 不在 176–188`);
        if (!noConfig && m.configW === null) failures.push("缺少配置栏 data-testid=tool-config-column");
        else if (!noConfig && (m.configW < 240 || m.configW > cap)) failures.push(`配置栏 ${m.configW}px 不在 240–${cap}`);
        const total = (m.configW || 0) + (m.mainW || 0);
        if (m.mainW === null) failures.push("缺少结果区 data-testid=tool-main-column");
        else if (total > 0 && m.mainW / total < 0.55) failures.push(`结果区占比 ${Math.round((m.mainW / total) * 100)}% < 55%`);
        for (const f of FORBIDDEN) {
            if (f.re.test(m.text)) failures.push(`正文残留「${f.re.source}」（${f.why}）`);
        }
        if (m.overflow > 0) failures.push(`水平溢出 ${m.overflow}px`);
        row.sidebarW = m.sidebarW;
        row.configW = m.configW;
        row.mainW = m.mainW;
        row.mainRatio = total ? Math.round((m.mainW / total) * 100) : null;
        row.failures = failures;
        row.pass = failures.length === 0;
    } catch (err) {
        row.failures = [`导航/测量异常：${String(err).slice(0, 200)}`];
        row.pass = false;
    }
    results.push(row);
    process.stdout.write(`${row.pass ? "PASS" : "FAIL"} ${row.id.padEnd(24)} cfg=${String(row.configW ?? "-").padStart(4)} main=${String(row.mainW ?? "-").padStart(4)} (${row.mainRatio ?? "-"}%) ${row.pass ? "" : row.failures.join("; ")}\n`);
}

await browser.close();

const passed = results.filter((r) => r.pass).length;
const summary = {
    at: new Date().toISOString(),
    baseUrl: BASE_URL,
    viewport: "1600x1000",
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
};
fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
fs.writeFileSync(jsonOut, JSON.stringify(summary, null, 2));
console.log(`\n${passed}/${results.length} 通过 → ${jsonOut}`);
process.exit(passed === results.length ? 0 : 1);
