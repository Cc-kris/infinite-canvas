/**
 * AI_DRESSING_XSY 真实持久化 + 刷新恢复验收（2026-10-29）
 *
 * 边界：
 * - 只提交 **一次** 真实请求（套餐单件、outputNum=1），不批量、不重试扣费；
 * - provider 走 keychain（provider.mjs），不打印密钥；
 * - 原始回执（XHR 请求字段 + 响应体）与结果图真实字节落盘到 evidence 目录；
 * - 刷新恢复只读 localStorage/IndexedDB 的真实任务快照，不注入任何假快照。
 *
 * 用法：
 *   node xsy-persist-restore-20261029.mjs submit     # 真实提交一次 + 结果动作 + reload 前取证
 *   node xsy-persist-restore-20261029.mjs reload     # 只刷新取证（不重新提交）
 */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyProviderConfig } from "./provider.mjs";

const BASE = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const REPO = "/Users/mac/Documents/Dev/infinite-canvas";
const ROUTE = "/tools/product-design/ai-dressing-xsy";
const OUT = path.join(REPO, "docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_DRESSING_XSY_20261029_persist");
const PROFILE = path.join(REPO, "temp/xsy-profile-20261029");
const CASES = path.join(REPO, "web/public/__cases/ai-dressing");
const MODEL = path.join(CASES, "1940370107691995136-model.webp");
const GARMENT = path.join(CASES, "1940370107691995136-garment.webp");
const STATE = path.join(OUT, "state.json");

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const phase = process.argv[2] || "submit";

async function readLocalTasks(page) {
    return page.evaluate(() => {
        const index = JSON.parse(localStorage.getItem("tool-task:v1:index") || "[]");
        const tasks = index
            .map((id) => {
                try {
                    return JSON.parse(localStorage.getItem(`tool-task:v1:${id}`) || "null");
                } catch {
                    return null;
                }
            })
            .filter(Boolean);
        return tasks.map((t) => ({
            id: t.id,
            toolId: t.toolId,
            status: t.status,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            error: t.error ?? null,
            upstreamTaskId: t.upstreamTaskId ?? null,
            items: (t.result?.items || []).map((i) => ({
                kind: i.kind,
                mimeType: i.mimeType ?? null,
                bytes: i.bytes ?? null,
                storageKey: i.storageKey ?? null,
                hasDataUrl: Boolean(i.dataUrl),
                url: i.url ? String(i.url).slice(0, 120) : null,
                payloadDropped: Boolean(i.payloadDropped),
            })),
        }));
    });
}

async function capturePage(page, tag) {
    return page.evaluate((tag) => {
        const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;
        const count = (sel) => document.querySelectorAll(sel).length;
        return {
            tag,
            url: location.href,
            dockCount: text('[data-testid="tool-history-dock-count"]'),
            dockItems: count('[data-testid^="tool-history-dock-item"], [data-testid="tool-history-dock"] li'),
            resultGrid: count('[data-testid="xsy-result-grid"] img'),
            resultGridSrc: Array.from(document.querySelectorAll('[data-testid="xsy-result-grid"] img')).map((i) => String(i.src).slice(0, 60)),
            resultEmpty: text('[data-testid="xsy-result-empty"]'),
            toolResult: Boolean(document.querySelector('[data-testid="tool-result"]')),
            toolResultEmpty: text('[data-testid="tool-result-empty"]'),
            toolResultSummary: text('[data-testid="tool-result-summary"]'),
            toolResultImages: count('[data-testid="tool-result-image"]'),
            downloadBtn: Boolean(document.querySelector('[data-testid="tool-result-download-0"]')),
            downloadDisabled: document.querySelector('[data-testid="tool-result-download-0"]')?.disabled ?? null,
            feedback: text('[data-testid="tool-result-feedback"]'),
            runError: text('[data-testid="xsy-run-error"]'),
            gate: text('[data-testid="xsy-gate"]'),
            estimate: text('[data-testid="xsy-estimate"]'),
            step: document.querySelector('[data-testid="xsy-workspace"]')?.getAttribute("data-step") ?? null,
            tab: document.querySelector('[data-testid="xsy-workspace"]')?.getAttribute("data-tab") ?? null,
        };
    }, tag);
}

async function main() {
    await mkdir(OUT, { recursive: true });
    // 干净起点：submit 阶段清空持久 profile，避免上一轮草稿/任务污染判定（reload 阶段必须复用同一 profile）
    if (phase === "submit") await rm(PROFILE, { recursive: true, force: true });
    const context = await chromium.launchPersistentContext(PROFILE, {
        headless: false,
        // 用本机真实 Google Chrome（不额外下载 Playwright 内核；持久 profile 仍在仓库 temp 下）
        channel: process.env.IC_BROWSER_CHANNEL || "chrome",
        viewport: { width: 1440, height: 1000 },
        acceptDownloads: true,
    });
    // 抓真实 XHR 回执（axios 走 XHR）：请求字段 + 响应体，不记录任何 header/密钥。
    await context.addInitScript(() => {
        window.__xsyXHR = [];
        const origOpen = XMLHttpRequest.prototype.open;
        const origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this.__meta = { method, url: String(url) };
            return origOpen.call(this, method, url, ...rest);
        };
        XMLHttpRequest.prototype.send = function (body) {
            const meta = this.__meta || {};
            const entry = { method: meta.method, url: meta.url, at: new Date().toISOString(), request: null, status: null, bodyText: null, error: null };
            if (body instanceof FormData) {
                entry.request = { formFields: [] };
                for (const [k, v] of body.entries()) {
                    if (typeof v === "string") entry.request.formFields.push([k, v.length > 512 ? `[string len=${v.length}]` : v]);
                    else entry.request.formFields.push([k, `[file name=${v.name} type=${v.type} size=${v.size}]`]);
                }
            } else if (typeof body === "string") {
                entry.request = { bodyLen: body.length, bodyPreview: body.slice(0, 400) };
            }
            window.__xsyXHR.push(entry);
            this.addEventListener("load", () => {
                entry.status = this.status;
                try {
                    entry.bodyText = this.responseText;
                } catch (e) {
                    entry.error = String(e);
                }
            });
            this.addEventListener("error", () => {
                entry.error = "network-error";
            });
            return origSend.call(this, body);
        };
    });

    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const downloads = [];
    page.on("download", async (d) => {
        const file = path.join(OUT, "downloads", `${Date.now()}-${d.suggestedFilename()}`);
        await mkdir(path.dirname(file), { recursive: true });
        await d.saveAs(file);
        const buf = await readFile(file);
        downloads.push({ file, suggested: d.suggestedFilename(), bytes: buf.length, sha256: sha(buf) });
    });

    await page.goto(BASE + ROUTE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="xsy-workspace"]');
    const provider = await applyProviderConfig(page);
    await page.waitForSelector('[data-testid="xsy-workspace"]');

    const summary = { phase, base: BASE, route: ROUTE, startedAt: new Date().toISOString(), provider, case: { model: MODEL, garment: GARMENT } };
    summary.before = { page: await capturePage(page, "before"), tasks: await readLocalTasks(page) };

    if (phase === "submit") {
        // 只提交一次：先确认历史坞里没有 XSY 既有任务会干扰判定
        summary.before.xsyTasks = summary.before.tasks.filter((t) => t.toolId === "AI_DRESSING_XSY");

        // 1) 模特图
        await page.setInputFiles('[data-testid="xsy-step-model"] [data-testid="tool-asset-file-input"]', MODEL);
        await page.waitForFunction(() => {
            const el = document.querySelector('[data-testid="xsy-model-size"]');
            return el && /尺寸\s*\d+×\d+/.test(el.textContent || "");
        }, null, { timeout: 60000 });

        // 2) 连体衣服（默认 tab 是「上下装衣服」；点真实 tab 按钮切到 suit，只上传这一件，避免多件重复计费）
        await page.click('button[data-tab="suit"]');
        await page.waitForFunction(() => document.querySelector('button[data-tab="suit"]')?.getAttribute("aria-selected") === "true");
        await page.setInputFiles('[data-testid="xsy-slot-suit"] [data-testid="tool-asset-file-input"]', GARMENT);
        await page.waitForFunction(() => {
            const el = document.querySelector('[data-testid="xsy-slot-suit-size"]');
            return el && /尺寸\s*\d+×\d+/.test(el.textContent || "");
        }, null, { timeout: 60000 });

        // 3) 步进：模型 → 服装 → 蒙版（整件）→ 生成
        await page.click('[data-testid="xsy-next-model"]');
        await sleep(600);
        await page.click('[data-testid="xsy-next-garment"]');
        await sleep(600);
        await page.click('[data-testid="xsy-mask-suit-fill"]');
        await page.waitForFunction(() => {
            const t = document.querySelector('[data-testid="xsy-slot-suit-size"]')?.textContent || "";
            const m = t.match(/蒙版覆盖\s*([\d.]+)%/);
            return Boolean(m) && Number(m[1]) > 50;
        }, null, { timeout: 20000 });
        await page.click('[data-testid="xsy-next-mask"]');
        await page.waitForFunction(() => document.querySelector('[data-testid="xsy-workspace"]')?.getAttribute("data-step") === "4");

        summary.beforeSubmit = { page: await capturePage(page, "beforeSubmit"), tasks: await readLocalTasks(page) };
        const estimate = await page.textContent('[data-testid="xsy-estimate"]');
        summary.beforeSubmit.estimate = estimate;
        if (!/预计输出\s*1\s*张/.test(String(estimate))) throw new Error(`张数不是 1，拒绝提交以免批量扣费：${estimate}`);
        const submitDisabled = await page.$eval('[data-testid="xsy-submit"]', (b) => b.disabled);
        if (submitDisabled) throw new Error(`提交按钮被拦下：${await page.textContent('[data-testid="xsy-gate"]')}`);

        // 4) 提交一次（IC_DRY=1 时只走到这里做干跑校验，不发真实请求）
        if (process.env.IC_DRY === "1") {
            summary.dryRun = { stopped: "before-submit", page: await capturePage(page, "dry"), tasks: await readLocalTasks(page) };
            await writeFile(path.join(OUT, "dryrun-summary.json"), JSON.stringify(summary, null, 2));
            console.log(JSON.stringify({ ok: true, dryRun: true, estimate, out: OUT }, null, 2));
            await context.close();
            return;
        }
        const submittedAt = Date.now();
        await page.click('[data-testid="xsy-submit"]');
        await page.waitForFunction(() => {
            const err = document.querySelector('[data-testid="xsy-run-error"]');
            const img = document.querySelector('[data-testid="tool-result-image"]');
            return Boolean(err?.textContent?.trim()) || Boolean(img);
        }, null, { timeout: 300000 });
        summary.elapsedMs = Date.now() - submittedAt;

        // 5) 抓原始回执
        const receipts = await page.evaluate(() => window.__xsyXHR || []);
        const edits = receipts.filter((r) => r.url && r.url.includes("/images/edits"));
        await writeFile(path.join(OUT, "provider-receipt-raw.json"), JSON.stringify(receipts, null, 2));
        const slim = edits.map((r) => {
            let parsed = null;
            try {
                const obj = JSON.parse(r.bodyText);
                parsed = {
                    created: obj.created ?? null,
                    dataCount: Array.isArray(obj.data) ? obj.data.length : null,
                    firstKeys: obj.data?.[0] ? Object.keys(obj.data[0]) : [],
                    firstB64Len: obj.data?.[0]?.b64_json?.length ?? null,
                    revisedPrompt: obj.data?.[0]?.revised_prompt ?? null,
                    error: obj.error ?? null,
                };
            } catch (e) {
                parsed = { parseError: String(e), bodyPreview: String(r.bodyText || "").slice(0, 300) };
            }
            return { url: r.url, status: r.status, at: r.at, request: r.request, response: parsed };
        });
        await writeFile(path.join(OUT, "provider-receipt.json"), JSON.stringify(slim, null, 2));
        summary.receipts = { count: receipts.length, editsCount: edits.length, edits: slim };

        // 6) 结果图真实字节（从页面里的 blob 取）
        const imgSrc = await page.getAttribute('[data-testid="tool-result-image"]', "src");
        summary.resultSrcPrefix = String(imgSrc).slice(0, 40);
        const b64 = await page.evaluate(async (src) => {
            const r = await fetch(src);
            const buf = new Uint8Array(await r.arrayBuffer());
            let s = "";
            for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192));
            return btoa(s);
        }, imgSrc);
        const imgBuf = Buffer.from(b64, "base64");
        const imgName = "result-0.png";
        await writeFile(path.join(OUT, imgName), imgBuf);
        summary.result = { file: imgName, bytes: imgBuf.length, sha256: sha(imgBuf), mime: "image/png" };

        // 7) 结果动作：下载 / 存资产 / 发画布
        const dlWait = page.waitForEvent("download", { timeout: 60000 }).catch(() => null);
        await page.click('[data-testid="tool-result-download-0"]');
        await dlWait;
        await sleep(1200);
        summary.actionDownload = { feedback: await page.textContent('[data-testid="tool-result-feedback"]').catch(() => null), downloads };

        await page.click('[data-testid="tool-result-save-0"]');
        await page.waitForFunction(() => /资产库|失败|错误/.test(document.querySelector('[data-testid="tool-result-feedback"]')?.textContent || ""), null, { timeout: 30000 }).catch(() => {});
        summary.actionSave = { feedback: await page.textContent('[data-testid="tool-result-feedback"]').catch(() => null) };

        await page.click('[data-testid="tool-result-canvas-0"]');
        await page.waitForFunction(() => /画布|失败|错误/.test(document.querySelector('[data-testid="tool-result-feedback"]')?.textContent || ""), null, { timeout: 30000 }).catch(() => {});
        summary.actionCanvas = { feedback: await page.textContent('[data-testid="tool-result-feedback"]').catch(() => null) };

        const tasks = await readLocalTasks(page);
        summary.afterSubmit = { page: await capturePage(page, "afterSubmit"), tasks };
        const xsy = tasks.filter((t) => t.toolId === "AI_DRESSING_XSY");
        summary.afterSubmit.xsyTask = xsy[0] ?? null;
        await writeFile(STATE, JSON.stringify({ taskId: xsy[0]?.id ?? null, resultSha: summary.result?.sha256, submittedAt }, null, 2));
    }

    // 刷新恢复取证（submit 阶段的收尾也做一次；reload 阶段单独重跑时不提交）
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="xsy-workspace"]');
    await sleep(4000);
    const tasksAfter = await readLocalTasks(page);
    summary.afterReload = {
        page: await capturePage(page, "afterReload"),
        tasks: tasksAfter,
        xsyTask: tasksAfter.find((t) => t.toolId === "AI_DRESSING_XSY") ?? null,
        historyDockText: await page.textContent('[data-testid="tool-history-dock"]').catch(() => null),
    };

    // 刷新后真实动作：若结果区能操作，就真的点下载并校验字节
    const canDownload = await page.$('[data-testid="tool-result-download-0"]');
    if (canDownload && !(await canDownload.isDisabled())) {
        const dl = page.waitForEvent("download", { timeout: 60000 }).catch(() => null);
        await page.click('[data-testid="tool-result-download-0"]');
        await dl;
        await sleep(1200);
        summary.afterReload.reDownload = { feedback: await page.textContent('[data-testid="tool-result-feedback"]').catch(() => null), downloads };
        const match = downloads.find((d) => d.sha256 === summary.result?.sha256 || (summary.afterSubmit?.xsyTask?.items || []).length >= 0);
        summary.afterReload.reDownload.bytesMatchOriginal = Boolean(downloads.some((d) => d.sha256 === summary.result?.sha256));
    } else {
        summary.afterReload.reDownload = { skipped: "结果区无可用下载按钮（刷新后未恢复）" };
    }

    summary.finishedAt = new Date().toISOString();
    const stamp = phase === "submit" ? "run" : "reload";
    await writeFile(path.join(OUT, `${stamp}-summary.json`), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ ok: true, phase, out: OUT, status: summary.afterReload?.xsyTask?.status, result: summary.result ?? null, reDownload: summary.afterReload?.reDownload }, null, 2));
    await context.close();
}

main().catch(async (error) => {
    const detail = { ok: false, at: new Date().toISOString(), error: String(error && error.stack || error) };
    try {
        await mkdir(OUT, { recursive: true });
        await writeFile(path.join(OUT, `failure-${Date.now()}.json`), JSON.stringify(detail, null, 2));
    } catch {}
    console.error(JSON.stringify(detail, null, 2));
    process.exit(1);
});
