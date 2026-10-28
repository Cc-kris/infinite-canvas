/**
 * 回归脚本：历史任务里带非法状态值（如旧版本的 "success"）时，工具页不能白屏。
 *
 * 事故链路（本次修复）：
 *   1) taskStatusMeta("success" as any) 查表得到 undefined → 读 .tone 抛 TypeError；
 *   2) 修好 tone 后暴露第二处：STATUS_ICON["success"] 为 undefined → React 渲染 undefined 组件白屏。
 * 期望：整页正常渲染，历史面板把该任务显示为「未知」，不提供重试按钮。
 *
 * 用法：node scripts/real-acceptance/check-legacy-status.mjs [route]
 */
import fsp from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const ROUTE = process.argv[2] ?? "/tools/product-design/ai-dressing-v2";
const TASK_ID = "legacy-status-regression-1";
const EVIDENCE_DIR = path.resolve(
    process.cwd(),
    "../docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/LEGACY_STATUS_REGRESSION",
);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 300)));

const base = process.env.IC_BASE_URL ?? "http://127.0.0.1:3000";
const record = { route: ROUTE, taskId: TASK_ID, steps: {}, ok: false, errors: [] };

try {
    await page.goto(`${base}${ROUTE}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // 写入一条"旧快照"：status 是历史遗留的非法值
    await page.evaluate((taskId) => {
        const task = {
            id: taskId,
            toolId: "AI_DRESSING_V2",
            status: "success",
            createdAt: Date.now() - 60000,
            updatedAt: Date.now() - 30000,
            submittedAt: Date.now() - 55000,
            finishedAt: Date.now() - 30000,
            configSnapshot: {},
            sourceAssetIds: [],
            pollCount: 1,
            items: [],
        };
        localStorage.setItem(`tool-task:v1:${taskId}`, JSON.stringify(task));
        localStorage.setItem("tool-task:v1:index", JSON.stringify([taskId]));
    }, TASK_ID);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3500);

    record.steps.result = await page.evaluate(() => {
        const dock = document.querySelector('[data-testid="tool-history-dock"]');
        return {
            errorBoundary: document.body.innerText.includes("Unexpected Application Error"),
            dockVisible: Boolean(dock),
            dockText: (dock?.innerText ?? "").slice(0, 200),
            toolbarVisible: Boolean(document.querySelector('[data-testid="tool-workspace"]')),
        };
    });
    record.steps.pageErrors = pageErrors;

    const r = record.steps.result;
    record.ok =
        !r.errorBoundary &&
        r.dockVisible &&
        r.dockText.includes("未知") &&
        pageErrors.length === 0;
    if (!record.ok) {
        record.errors.push(
            `legacy status 未兜底：errorBoundary=${r.errorBoundary} dock=${r.dockVisible} text=${r.dockText.slice(0, 60)} pageErrors=${pageErrors.length}`,
        );
    }
} catch (error) {
    record.errors.push(String(error).slice(0, 300));
} finally {
    await browser.close();
    await fsp.mkdir(EVIDENCE_DIR, { recursive: true });
    await fsp.writeFile(
        path.join(EVIDENCE_DIR, "legacy-status.json"),
        JSON.stringify({ ...record, recordedAt: new Date().toISOString() }, null, 2),
    );
}

console.log(`${record.ok ? "PASS" : "FAIL"} legacy-status ${record.ok ? "" : record.errors.join(" | ")}`);
process.exit(record.ok ? 0 : 1);
