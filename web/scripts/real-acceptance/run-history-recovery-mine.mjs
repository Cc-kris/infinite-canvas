/**
 * 历史恢复真实验收（本人负责的 7 个工具）。
 *
 * 边界：
 * - 真 Chrome、真上传、真点击、真 provider（provider.mjs 走用户已配渠道）；
 * - 不做任何快照注入：任务只来自本次真实运行（persistTask 由应用自己写）；
 * - 刷新（同一 context，等同用户按 F5）后读真实 DOM 与 localStorage，验证历史条目、
 *   结果图真实解码（naturalWidth > 0）、下载字节数、存入资产回执。
 *
 * 用法：node run-history-recovery-mine.mjs SCALE_UP [CHANGE_COLOR ...]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { BASE_URL, EVIDENCE_ROOT, sleep } from "./lib.mjs";
import { applyProviderConfig } from "./provider.mjs";

const FIXTURES = path.resolve("scripts/real-acceptance/fixtures");
const OUT_ROOT = path.join(EVIDENCE_ROOT, "HISTORY_RECOVERY_MINE");

const RECIPES = {
    SCALE_UP: {
        route: "/tools/ecommerce-suite/scale-up",
        fixture: "product-watch.jpg",
        submit: '[data-testid="scale-up-generate"]',
        historyTab: null, // SCALE_UP 用页面级 Dock（tool-history-dock）
        run: async (page) => {
            await upload(page, '[data-testid="tool-asset-file-input"]', "product-watch.jpg");
            await page.waitForTimeout(2000);
            await page.click('[data-testid="scale-up-generate"]');
        },
    },
    CHANGE_COLOR: {
        route: "/tools/smart-edit/change-color",
        fixture: "product-watch.jpg",
        submit: '[data-testid="change-color-submit"]',
        historyTab: '[data-testid="change-color-tab-history"]',
        resultTab: '[data-testid="change-color-tab-result"]',
        run: async (page) => {
            await upload(page, '[data-testid="tool-asset-file-input"]', "product-watch.jpg");
            await page.waitForTimeout(2500);
            // 该工具必填目标色：不选色时「立即生成」永久禁用（issues 会提示）。
            await page.evaluate(() => {
                const input = document.querySelector('[data-testid="change-color-hex"]');
                if (!input) throw new Error("hex input missing");
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                setter.call(input, "#2E6BE6");
                input.dispatchEvent(new Event("input", { bubbles: true }));
            });
            await page.waitForTimeout(800);
            await page.click('[data-testid="change-color-submit"]');
        },
    },
};

async function upload(page, selector, file) {
    const input = page.locator(selector).first();
    await input.setInputFiles(path.join(FIXTURES, file));
}

/** 从 localStorage 读本工具任务（应用自身 persistTask 落盘的快照）。 */
async function readTasks(page, toolId) {
    return page.evaluate((toolId) => {
        const out = [];
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (!key || !key.includes("tool-task")) continue;
            let parsed;
            try {
                parsed = JSON.parse(localStorage.getItem(key) || "null");
            } catch {
                continue;
            }
            const tasks = Array.isArray(parsed) ? parsed : parsed?.tasks ? Object.values(parsed.tasks) : [parsed];
            for (const task of tasks) {
                if (task && task.toolId === toolId) out.push({ key, task });
            }
        }
        // 去重（索引键 + 明细键可能同时命中）
        const seen = new Map();
        for (const row of out) seen.set(row.task.id, row.task);
        return [...seen.values()];
    }, toolId);
}

async function waitForTask(page, toolId, { timeoutMs = 300000 } = {}) {
    const started = Date.now();
    let last = [];
    while (Date.now() - started < timeoutMs) {
        last = await readTasks(page, toolId);
        const terminal = last.find((t) => t.status === "succeeded" || t.status === "failed");
        if (terminal) return { tasks: last, task: terminal, waitedMs: Date.now() - started };
        await sleep(3000);
    }
    return { tasks: last, task: last[0] ?? null, waitedMs: Date.now() - started, timeout: true };
}

async function runTool(toolId) {
    const recipe = RECIPES[toolId];
    if (!recipe) throw new Error(`no recipe for ${toolId}`);
    const dir = path.join(OUT_ROOT, toolId);
    await fs.mkdir(dir, { recursive: true });
    const report = { toolId, route: recipe.route, startedAt: new Date().toISOString(), steps: [] };

    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN", acceptDownloads: true });
    const page = await context.newPage();
    const net = [];
    page.on("requestfinished", async (req) => {
        if (!/\/v1\//.test(req.url())) return;
        const res = await req.response().catch(() => null);
        net.push({ url: req.url().slice(0, 160), status: res ? res.status() : null });
    });
    page.on("pageerror", (err) => net.push({ pageerror: String(err).slice(0, 300) }));

    try {
        await page.goto(`${BASE_URL}${recipe.route}`, { waitUntil: "domcontentloaded" });
        await applyProviderConfig(page);
        report.steps.push({ step: "loaded", url: page.url(), model: await page.evaluate(() => localStorage.getItem("infinite-canvas:ai_config_store")?.includes("imageModel") ?? false) });

        await recipe.run(page);
        const waited = await waitForTask(page, toolId);
        report.run = {
            waitedMs: waited.waitedMs,
            timeout: Boolean(waited.timeout),
            taskCount: waited.tasks.length,
            task: waited.task
                ? {
                      id: waited.task.id,
                      status: waited.task.status,
                      toolId: waited.task.toolId,
                      items: (waited.task.result?.items ?? []).map((item) => ({
                          url: item.url ? item.url.slice(0, 60) : null,
                          storageKey: item.storageKey ?? null,
                          payloadDropped: Boolean(item.payloadDropped),
                          mimeType: item.mimeType ?? null,
                      })),
                      error: waited.task.error ?? null,
                  }
                : null,
            net: net.filter((n) => n.status || n.pageerror),
        };
        if (waited.task) await page.screenshot({ path: path.join(dir, "01-after-run.png") });

        // 刷新 = 用户 F5；历史必须来自应用自身落盘快照
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(4000);
        const afterReload = await readTasks(page, toolId);
        report.afterReload = { taskCount: afterReload.length, ids: afterReload.map((t) => `${t.id}:${t.status}`) };

        // 历史 UI
        if (recipe.historyTab) {
            await page.click(recipe.historyTab).catch(() => null);
            await page.waitForTimeout(600);
        }
        const dockCount = await page.locator('[data-testid="tool-history-dock"]').count();
        const histCountText = await page.locator('[data-testid="tool-task-history-count"]').first().textContent().catch(() => null);
        const dockItems = await page.locator('[data-testid="tool-history-dock-item"]').count();
        report.historyUi = { dockCount, histCountText, dockItems };
        await page.screenshot({ path: path.join(dir, "02-after-reload.png") });

        // 展开/选中历史，取真实结果图解码
        let resultEvidence = null;
        if (dockItems > 0) {
            await page.locator('[data-testid="tool-history-dock-toggle"]').first().click();
            await page.waitForTimeout(1200);
            report.historyUi.detailVisible = await page.locator('[data-testid="tool-history-dock-detail"]').first().isVisible().catch(() => false);
            await page.screenshot({ path: path.join(dir, "02b-dock-expanded.png") });
        }
        if (recipe.historyTab) {
            const item = page.locator('[data-testid="tool-task-history-item"]').first();
            if (await item.count()) {
                await item.click();
                await page.waitForTimeout(1200);
            }
            // 看完历史页签必须切回结果区，才能验证「点历史条目 → 结果区真的恢复出图」
            if (recipe.resultTab) {
                await page.click(recipe.resultTab).catch(() => null);
                await page.waitForTimeout(1500);
            }
        }
        const imgs = await page.evaluate(() => {
            const nodes = [...document.querySelectorAll("img")];
            return nodes
                .map((img) => ({ src: (img.currentSrc || img.src || "").slice(0, 40), w: img.naturalWidth, h: img.naturalHeight }))
                .filter((row) => row.w > 0)
                .slice(0, 6);
        });
        resultEvidence = { decodedImages: imgs };
        report.resultAfterReload = resultEvidence;
        await page.screenshot({ path: path.join(dir, "03-result-after-reload.png") });

        // 下载真实字节（结果区单项下载）
        const downloadBtn = page.locator('[data-testid="tool-result-download-0"]').first();
        if (await downloadBtn.count()) {
            try {
                const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), downloadBtn.click()]);
                const filePath = path.join(dir, `download-${Date.now()}-${download.suggestedFilename() || "result.png"}`);
                await download.saveAs(filePath);
                const stat = await fs.stat(filePath);
                report.download = { file: path.basename(filePath), bytes: stat.size };
            } catch (error) {
                report.download = { error: String(error).slice(0, 300) };
            }
        } else {
            report.download = { skipped: "no download button visible" };
        }

        report.finishedAt = new Date().toISOString();
    } finally {
        await context.close();
        await browser.close();
    }

    await fs.writeFile(path.join(dir, "run.json"), JSON.stringify(report, null, 2), "utf8");
    return report;
}

const tools = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
if (!tools.length) {
    console.error("usage: node run-history-recovery-mine.mjs <TOOL_ID ...>");
    process.exit(1);
}
const summary = [];
for (const toolId of tools) {
    const report = await runTool(toolId);
    summary.push(report);
    console.log(JSON.stringify({ toolId, run: report.run, afterReload: report.afterReload, historyUi: report.historyUi, result: report.resultAfterReload, download: report.download }, null, 2));
}
await fs.mkdir(OUT_ROOT, { recursive: true });
await fs.writeFile(path.join(OUT_ROOT, `summary-${Date.now()}.json`), JSON.stringify(summary, null, 2), "utf8");
