/**
 * 39 工具页当前代码截图 + 首屏度量，产出可复现的验收证据。
 *
 * 与 tools-layout-check.mjs 的分工：
 *   - layout-check 只断言几何门槛（侧栏/配置列/主区占比/溢出/禁用文案）
 *   - 本脚本负责“当前代码长什么样”：每页覆盖 local-current.png，并记录首屏几何与
 *     是否存在明显空屏，供人工与 report.md 对照。
 *
 * 用法：
 *   cd web
 *   node scripts/real-acceptance/tools-screenshot-audit.mjs
 *   node scripts/real-acceptance/tools-screenshot-audit.mjs --only=AI_DRESSING_V2,NEW_REPLACE_BG_V2
 *   node scripts/real-acceptance/tools-screenshot-audit.mjs --json=/tmp/shots.json
 *
 * 注意：只读页面，不点击生成、不提交任务、不使用原站算力。
 */
import fs from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

const BASE_URL = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const REPO = path.resolve(process.cwd(), "..");
const SPECS = path.join(REPO, "docs/V1.0/plan_linkfox_navigation/tool_specs.json");
const OUT_ROOT = path.join(REPO, "docs/V1.0/e2e-1to1/20261102");

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith("--only="));
const jsonArg = args.find((a) => a.startsWith("--json="));
const only = onlyArg ? onlyArg.split("=")[1].split(",").filter(Boolean) : null;
const jsonOut = jsonArg ? jsonArg.split("=")[1] : "/tmp/tools-screenshot-audit.json";

const specs = JSON.parse(fs.readFileSync(SPECS, "utf8")).tools;
const targets = specs.filter((t) => (only ? only.includes(t.id) : true));

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, locale: "zh-CN" });

const results = [];
for (const t of targets) {
    const row = { id: t.id, label: t.label, route: t.route };
    const dir = path.join(OUT_ROOT, t.id);
    fs.mkdirSync(dir, { recursive: true });
    try {
        await page.goto(BASE_URL + t.route, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1200);
        const m = await page.evaluate(() => {
            const box = (sel) => {
                const el = document.querySelector(sel);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) };
            };
            const body = document.body.innerText || "";
            return {
                title: document.title,
                is404: /404|页面不存在/.test(body),
                textLen: body.replace(/\s+/g, " ").trim().length,
                textHead: body.replace(/\s+/g, " ").trim().slice(0, 160),
                sidebar: box('[data-testid="tool-sidebar"]'),
                config: box('[data-testid="tool-config-column"]'),
                main: box('[data-testid="tool-main-column"]'),
                overflow: Math.max(0, Math.round(document.documentElement.scrollWidth - window.innerWidth)),
                scrollY: Math.round(document.documentElement.scrollHeight - window.innerHeight),
            };
        });
        await page.screenshot({ path: path.join(dir, "local-current.png") });
        row.widths = { sidebar: m.sidebar?.w ?? null, config: m.config?.w ?? null, main: m.main?.w ?? null };
        row.overflow = m.overflow;
        row.scrollY = m.scrollY;
        row.is404 = m.is404;
        row.textLen = m.textLen;
        row.textHead = m.textHead;
        row.pass = !m.is404 && m.overflow === 0 && m.textLen > 200;
        if (m.is404) row.failures = ["页面 404"];
        else if (m.overflow > 0) row.failures = [`水平溢出 ${m.overflow}px`];
        else if (m.textLen <= 200) row.failures = [`正文过短 ${m.textLen} 字符`];
    } catch (error) {
        row.pass = false;
        row.failures = [`导航/截图异常：${String(error).slice(0, 200)}`];
    }
    results.push(row);
    process.stdout.write(
        `${row.pass ? "OK  " : "FAIL"} ${row.id.padEnd(24)} cfg=${String(row.widths?.config ?? "-").padStart(4)} main=${String(row.widths?.main ?? "-").padStart(4)} scrollY=${String(row.scrollY ?? "-").padStart(5)} ${row.pass ? "" : row.failures.join("; ")}\n`,
    );
}

await browser.close();

const passed = results.filter((r) => r.pass).length;
fs.writeFileSync(
    jsonOut,
    JSON.stringify({ at: new Date().toISOString(), baseUrl: BASE_URL, viewport: "1600x1000", total: results.length, passed, results }, null, 2),
);
console.log(`\n${passed}/${results.length} 页截图完成 → ${jsonOut}`);
process.exit(passed === results.length ? 0 : 1);
