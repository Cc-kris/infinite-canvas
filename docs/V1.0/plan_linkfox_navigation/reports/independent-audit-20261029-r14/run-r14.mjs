/**
 * r14: IMAGE_TO_VIDEO / VIDEO_REPLICATION 真实提交一次 -> 轮询终态 -> 刷新 -> 三动作。
 * 不注入：只点真实 UI 控件，任务快照由应用自己落 localStorage。
 */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import fss from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3000";
const PROFILE = "/tmp/ic_r9_profile_translation";
const MODE = (process.argv[2] || "I2V").toUpperCase();
const OUT = `/tmp/ic_r14/${MODE}`;
const IMAGE = "/Users/mac/Documents/Dev/infinite-canvas/web/scripts/real-acceptance/fixtures/product-watch.jpg";
const SOURCE_MP4 = "https://media.w3.org/2010/05/sintel/trailer.mp4";
const TERMINAL_MS = Number(process.env.TERMINAL_MS || 900_000);
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

await fs.mkdir(path.join(OUT, "downloads"), { recursive: true });
const LOG = path.join(OUT, "run.log");
const log = (o) => { const s = typeof o === "string" ? o : JSON.stringify(o); fss.appendFileSync(LOG, `[${new Date().toISOString()}] ${s}\n`); console.log(s); };

const record = { mode: MODE, startedAt: new Date().toISOString(), toolId: null, taskId: null, net: [], issues: [], terminal: null, actions: {}, history: {}, panel: {} };
const save = async () => fs.writeFile(path.join(OUT, "result.json"), JSON.stringify(record, null, 1));

async function main() {
    const ctx = await chromium.launchPersistentContext(PROFILE, {
        channel: "chrome", headless: true, viewport: { width: 1440, height: 1000 }, locale: "zh-CN",
        acceptDownloads: true, args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding"],
    });
    const page = ctx.pages()[0] || await ctx.newPage();
    page.setDefaultTimeout(60_000);

    page.on("request", (r) => {
        const u = r.url();
        if (/\/v1\//.test(u) || /__media/.test(u)) record.net.push({ k: "req", ts: Date.now(), m: r.method(), u: u.slice(0, 220), body: (r.postData() || "").slice(0, 300) });
    });
    page.on("response", async (r) => {
        const u = r.url();
        if (/\/v1\//.test(u)) {
            let body = "";
            try { body = (await r.text()).slice(0, 1500); } catch {}
            record.net.push({ k: "res", ts: Date.now(), s: r.status(), u: u.slice(0, 220), body });
        }
    });
    page.on("requestfailed", (r) => {
        const u = r.url();
        if (/\/v1\/|__media/.test(u)) record.net.push({ k: "fail", ts: Date.now(), u: u.slice(0, 220), err: r.failure()?.errorText });
    });
    page.on("console", (m) => { if (m.type() === "error") record.issues.push("console: " + m.text().slice(0, 300)); });

    const dumpTasks = async () => {
        try {
            return await page.evaluate(() => {
                const out = [];
                for (const k of Object.keys(localStorage)) {
                    if (!k.startsWith("tool-task:v1:task-")) continue;
                    let t = null;
                    try { t = JSON.parse(localStorage.getItem(k) || "null"); } catch { continue; }
                    if (!t) continue;
                    out.push({
                        key: k, id: t.id, toolId: t.toolId, status: t.status,
                        upstreamTaskId: t.upstreamTaskId ?? null, createdAt: t.createdAt ?? 0, updatedAt: t.updatedAt ?? 0,
                        pollCount: t.pollCount ?? null,
                        error: t.error ? { code: t.error.code ?? null, message: String(t.error.message ?? "").slice(0, 400) } : null,
                        items: (t.result?.items ?? []).map((i) => ({ kind: i.kind, url: i.url ? String(i.url).slice(0, 200) : null, storageKey: i.storageKey ?? null, bytes: i.bytes ?? null, mimeType: i.mimeType ?? null, payloadDropped: !!i.payloadDropped, ingestError: i.ingestError ? String(i.ingestError).slice(0, 200) : null })),
                    });
                }
                return out.sort((a, b) => b.createdAt - a.createdAt);
            });
        } catch (e) { return [{ err: String(e).slice(0, 120) }]; }
    };

    const start = Date.now();
    if (MODE === "I2V") {
        record.toolId = "IMAGE_TO_VIDEO";
        await page.goto(BASE + "/tools/ai-video/image-to-video", { waitUntil: "domcontentloaded" });
        await page.waitForSelector('[data-testid="image-to-video-submit"]');
        await page.locator('[data-testid="tool-asset-file-input"]').first().setInputFiles(IMAGE);
        await page.waitForTimeout(2500);
        await page.locator('[data-testid="image-to-video-prompt-mode-custom"]').click().catch(() => {});
        const box = page.locator('[data-testid="image-to-video-prompt"]');
        await box.fill("商品轻微旋转展示，柔光台面，镜头缓慢推进，保持手表外观与表盘细节不变");
        await page.waitForTimeout(800);
        record.before = await page.evaluate(() => {
            const btn = document.querySelector('[data-testid="image-to-video-submit"]');
            return {
                submit: { disabled: btn?.disabled, text: btn?.textContent.trim() },
                issues: [...document.querySelectorAll('[data-testid="image-to-video-issues"] li')].map((n) => n.textContent.trim()),
                preview: document.querySelector('[data-testid="image-to-video-prompt-preview"]')?.textContent.trim().slice(0, 200) ?? null,
                assets: [...document.querySelectorAll('[data-testid="image-to-video-reference-list"] *')].length,
            };
        });
        log({ before: record.before });
        await page.screenshot({ path: path.join(OUT, "01-filled.png"), fullPage: true });
        await page.locator('[data-testid="image-to-video-submit"]').click();
    } else {
        record.toolId = "VIDEO_REPLICATION";
        await page.goto(BASE + "/tools/ai-video/video-replication", { waitUntil: "domcontentloaded" });
        await page.waitForSelector('[data-testid="video-replication-submit"]');
        // 链接模式
        await page.getByRole("button", { name: "TikTok 链接" }).first().click();
        await page.waitForTimeout(600);
        const linkBox = page.getByPlaceholder(/粘贴公网视频直链/);
        await linkBox.fill(SOURCE_MP4);
        await page.waitForTimeout(1200);
        // 商品参考图（第二个 asset input 是图片，multiple）
        const inputs = page.locator('[data-testid="tool-asset-file-input"]');
        const n = await inputs.count();
        for (let i = 0; i < n; i++) {
            const accept = await inputs.nth(i).getAttribute("accept");
            if (accept && /image/.test(accept) && !/video/.test(accept)) { await inputs.nth(i).setInputFiles(IMAGE); break; }
        }
        await page.waitForTimeout(2000);
        const pb = page.locator('[data-testid="video-replication-script"]');
        if (await pb.count()) await pb.fill("复刻该视频的运镜节奏与画面风格，主体为腕表特写，干净浅灰背景");
        await page.waitForTimeout(800);
        record.before = await page.evaluate(() => {
            const btn = document.querySelector('[data-testid="video-replication-submit"]');
            const txt = (s) => document.querySelector(s)?.textContent?.trim().slice(0, 300) ?? null;
            return { submit: { disabled: btn?.disabled, text: btn?.textContent.trim() }, blockers: txt('[data-testid="video-replication-blocked"]'), error: txt('[data-testid="video-replication-error"]'), clip: txt('[data-testid="video-replication-clip"]'), notice: txt('[data-testid="video-replication-notice"]') };
        });
        log({ before: record.before });
        await page.screenshot({ path: path.join(OUT, "01-filled.png"), fullPage: true });
        if (record.before.submit.disabled) { record.issues.push("提交按钮禁用：" + JSON.stringify(record.before)); await save(); log({ abort: "disabled" }); await ctx.close(); return; }
        await page.locator('[data-testid="video-replication-submit"]').click();
    }

    // 提交后立刻抓快照（前 60 秒每 2 秒，之后每 5 秒）
    let terminal = null;
    while (Date.now() - start < TERMINAL_MS) {
        const tasks = await dumpTasks();
        const mine = tasks.filter((t) => t.toolId === record.toolId && (t.createdAt >= start - 60_000));
        if (mine.length) {
            record.taskId = mine[0].id;
            record.terminal = mine[0];
            if (["succeeded", "failed", "unknown"].includes(mine[0].status)) { terminal = mine[0]; break; }
        }
        await save();
        await page.waitForTimeout(record.terminal ? 5000 : 2000);
    }
    log({ terminal: terminal && { id: terminal.id, status: terminal.status, upstreamTaskId: terminal.upstreamTaskId, items: terminal.items, error: terminal.error } });
    record.netAtTerminal = record.net.slice();
    await save();
    if (!terminal) { record.issues.push("轮询超时未见终态"); await log_result(); await ctx.close(); return; }

    if (terminal.status !== "succeeded" || !terminal.items?.length) {
        record.verdict = "FAILED_REAL";
        await page.screenshot({ path: path.join(OUT, "02-failed.png"), fullPage: true }).catch(() => {});
        await log_result(); await ctx.close(); return;
    }

    // 终态截图
    await page.screenshot({ path: path.join(OUT, "02-succeeded.png"), fullPage: true }).catch(() => {});

    // 刷新 -> 历史恢复
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    record.history.row = await page.evaluate((id) => {
        const rows = [...document.querySelectorAll('[data-testid="tool-task-history-item"]')];
        const row = rows.find((r) => r.getAttribute("data-task-id") === id);
        return { count: rows.length, found: !!row, text: row?.textContent.trim().slice(0, 200) ?? null };
    }, terminal.id);
    await page.evaluate((id) => {
        const rows = [...document.querySelectorAll('[data-testid="tool-task-history-item"]')];
        rows.find((r) => r.getAttribute("data-task-id") === id)?.querySelector('[data-testid="tool-task-history-open"]')?.click();
    }, terminal.id);
    await page.waitForTimeout(3000);
    const inspect = () => page.evaluate(() => {
        const t = (s) => document.querySelector(s)?.textContent?.trim() ?? null;
        const b = (s) => { const e = document.querySelector(s); return e ? { exists: true, disabled: !!e.disabled } : { exists: false }; };
        const v = document.querySelector('[data-testid="tool-result"] video') || document.querySelector('video');
        return { feedback: t('[data-testid="tool-result-feedback"]'), download: b('[data-testid="tool-result-download-0"]'), save: b('[data-testid="tool-result-save-0"]'), canvas: b('[data-testid="tool-result-canvas-0"]'), video: v ? { src: String(v.currentSrc || v.src).slice(0, 80), w: v.videoWidth, h: v.videoHeight, d: Math.round(v.duration * 10) / 10, readyState: v.readyState } : null };
    });
    record.panel.afterReload = await inspect();
    await page.screenshot({ path: path.join(OUT, "03-reload-panel.png"), fullPage: true }).catch(() => {});

    // 动作1 下载
    try {
        const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), page.locator('[data-testid="tool-result-download-0"]').first().click()]);
        const f = path.join(OUT, "downloads", `${MODE}-reload.mp4`);
        await dl.saveAs(f);
        const buf = await fs.readFile(f);
        record.actions.download = { bytes: buf.length, sha256: sha256(buf), magic: buf.subarray(4, 8).toString("ascii"), name: dl.suggestedFilename() };
    } catch (e) { record.issues.push("下载失败: " + String(e).slice(0, 200)); }

    // 动作2 存资产
    try {
        await page.locator('[data-testid="tool-result-save-0"]').first().click();
        await page.waitForTimeout(4000);
        record.actions.save = await page.evaluate(async () => {
            const fb = document.querySelector('[data-testid="tool-result-feedback"]')?.textContent?.trim() ?? null;
            let assets = null;
            try {
                const m = await import("/src/stores/use-asset-store.ts");
                assets = (m.useAssetStore.getState().assets || []).filter((a) => /^video\//.test(a.mimeType || "")).map((a) => ({ id: a.id, bytes: a.bytes, mimeType: a.mimeType, sourceTaskId: a.sourceTaskId ?? null }));
            } catch (e) { assets = String(e).slice(0, 120); }
            return { feedback: fb, videoAssets: assets };
        });
    } catch (e) { record.issues.push("存资产失败: " + String(e).slice(0, 200)); }

    // 动作3 发画布
    try {
        await page.locator('[data-testid="tool-result-canvas-0"]').first().click();
        await page.waitForTimeout(6000);
        record.actions.canvas = await page.evaluate(async () => {
            const fb = document.querySelector('[data-testid="tool-result-feedback"]')?.textContent?.trim() ?? null;
            let nodes = null;
            try {
                const idb = await import("idb-keyval");
                const list = await idb.get("canvas-nodes");
                nodes = Array.isArray(list) ? list.filter((n) => /video/.test(String(n?.type || ""))).map((n) => ({ id: n.id, type: n.type })) : null;
            } catch (e) { nodes = String(e).slice(0, 120); }
            return { feedback: fb, videoNodes: nodes };
        });
    } catch (e) { record.issues.push("发画布失败: " + String(e).slice(0, 200)); }
    await page.screenshot({ path: path.join(OUT, "04-actions.png"), fullPage: true }).catch(() => {});

    // 二次刷新（fresh reload 后仍可从 IndexedDB 恢复）
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    record.history.row2 = await page.evaluate((id) => {
        const rows = [...document.querySelectorAll('[data-testid="tool-task-history-item"]')];
        const row = rows.find((r) => r.getAttribute("data-task-id") === id);
        return { count: rows.length, found: !!row };
    }, terminal.id);
    await page.evaluate((id) => {
        const rows = [...document.querySelectorAll('[data-testid="tool-task-history-item"]')];
        rows.find((r) => r.getAttribute("data-task-id") === id)?.querySelector('[data-testid="tool-task-history-open"]')?.click();
    }, terminal.id);
    await page.waitForTimeout(3000);
    record.panel.afterReload2 = await inspect();
    await page.screenshot({ path: path.join(OUT, "05-reload2-panel.png"), fullPage: true }).catch(() => {});

    const d = record.actions.download;
    record.verdict = d && d.magic === "ftyp" && d.bytes > 0 && record.panel.afterReload2?.download?.exists && !record.panel.afterReload2.download.disabled
        ? (record.actions.save?.videoAssets?.length && record.actions.canvas?.videoNodes?.length ? "PASS" : "PARTIAL") : "PARTIAL";
    await log_result();
    await ctx.close();
}

async function log_result() {
    await save();
    log({ verdict: record.verdict, taskId: record.taskId, upstream: record.terminal?.upstreamTaskId, items: record.terminal?.items, error: record.terminal?.error, download: record.actions.download, save: record.actions.save?.videoAssets, canvas: record.actions.canvas?.videoNodes, panel2: record.panel.afterReload2, issues: record.issues.slice(-8) });
}

try { await main(); } catch (e) { record.issues.push("fatal: " + String(e).slice(0, 600)); record.verdict = "ERROR"; await save(); log({ fatal: String(e).slice(0, 600) }); }
