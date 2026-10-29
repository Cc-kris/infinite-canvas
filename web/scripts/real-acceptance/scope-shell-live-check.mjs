/**
 * 共享壳 live 校验（新口径 scope_boundary）。
 *
 * 断言（失败退出码 1）：
 *  1. 头部存在且贴顶（y=0），高度落在设计系统区间 48–72；
 *  2. 头部区域内不得出现：促销/免费领算力/积分/购买·充值/学习中心·教程/个人中心额度；
 *  3. 页面不得出现右下角帮助浮窗（tool-help-dock）；
 *  4. 必须保留：设置、主题、Agent、画布 入口。
 * 仅报告（不判错）：工具页正文的「算力」计费文案存量。
 */
import { launchBrowser, BASE_URL } from "./lib.mjs";

const FORBIDDEN = ["免费领算力", "领算力", "积分", "购买", "充值", "升级会员", "学习中心", "教程中心", "操作咨询", "产品教程"];
const PAGES = [
    ["wearable", "/tools/product-design/ai-wearable"],
    ["remove-pen", "/tools/smart-edit/remove-pen"],
];

const browser = await launchBrowser({ headless: true });
const out = { baseUrl: BASE_URL, at: new Date().toISOString(), pages: {}, failed: [] };

for (const [key, path] of PAGES) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE_URL + path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const r = await page.evaluate((forbidden) => {
        const nav = document.querySelector('[data-testid="shell-top-nav"]');
        const navText = (nav?.innerText || "").replace(/\s+/g, " ");
        const bodyText = (document.body.innerText || "").replace(/\s+/g, " ");
        const found = forbidden.filter((w) => navText.includes(w));
        const helpDock = !!document.querySelector('[data-testid="tool-help-dock"],[class*="help-dock"]');
        const entry = (sel) => !!document.querySelector(sel);
        return {
            headerY: Math.round(nav?.getBoundingClientRect().top ?? -1),
            headerH: Math.round(nav?.getBoundingClientRect().height ?? -1),
            navText: navText.slice(0, 200),
            forbiddenInHeader: found,
            helpDock,
            entries: {
                agent: entry('[data-testid="top-nav-agent-toggle"]'),
                settings: entry('[data-testid="settings-entry"],[aria-label*="设置"],[title*="设置"]'),
                theme: entry('[data-testid="theme-toggle"],[aria-label*="主题"],[aria-label*="深色"],[aria-label*="浅色"]'),
                canvas: entry('a[href*="/canvas"],[data-testid*="workspace-link"]'),
            },
            billingResidue: (bodyText.match(/\(\s*[\d*\w.]+\s*算力\s*\)/g) || []).slice(0, 5),
        };
    }, FORBIDDEN);
    r.key = key;
    r.route = path;
    out.pages[key] = r;
    if (r.headerY !== 0) out.failed.push(`${key}: headerY=${r.headerY}`);
    if (!(r.headerH >= 48 && r.headerH <= 72)) out.failed.push(`${key}: headerH=${r.headerH}`);
    if (r.forbiddenInHeader.length) out.failed.push(`${key}: header 出现 ${r.forbiddenInHeader.join(",")}`);
    if (r.helpDock) out.failed.push(`${key}: 帮助浮窗仍在`);
    for (const [k, ok] of Object.entries(r.entries)) if (!ok) out.failed.push(`${key}: 缺少 ${k} 入口`);
    await page.close();
}
await browser.close();
out.ok = out.failed.length === 0;
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
