/**
 * r13：IMAGE_TO_VIDEO / VIDEO_REPLICATION / AI_VIDEO_EDITING 真实提交 → 整页刷新 → 历史恢复 → 三动作。
 *
 * 边界：不 mock 上游、不种子任务、不改任务快照；
 * - 真实素材：product-watch.jpg（仓内 fixture）+ 公网样片 media.w3.org/2010/05/sintel/trailer.mp4；
 * - 真实提交：sub2api-real / MiniMax-H3；网络请求/响应落 evidence；
 * - 真实动作：下载（file-saver）→ sha256 + ftyp 魔数；存资产（真实 asset store）；发到画布（真实 canvas store）。
 *
 * 用法：cd web && NODE_PATH=$PWD/node_modules /opt/homebrew/bin/node scripts/real-acceptance/accept-r13-three-video-tools.mjs IMAGE_TO_VIDEO
 */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, "../../..");
const BASE = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const PROFILE = process.env.IC_PROFILE || "/tmp/ic_r9_profile_translation";
const TOOL = (process.argv[2] || "IMAGE_TO_VIDEO").toUpperCase();
const OUT = path.join(REPO, "docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/r13-three-tools", TOOL);
const IMAGE = path.join(REPO, "web/scripts/real-acceptance/fixtures/product-watch.jpg");
const VIDEO = process.env.IC_SOURCE_VIDEO || "/tmp/r13_sintel.mp4";

const SPECS = {
    IMAGE_TO_VIDEO: {
        route: "/tools/ai-video/image-to-video",
        prompt: "商品轻微旋转展示，柔光台面，镜头缓慢推进，保持手表外观与表盘细节不变",
        submit: "image-to-video-submit",
    },
    VIDEO_REPLICATION: {
        route: "/tools/ai-video/video-replication",
        prompt: "复刻该视频的运镜节奏与画面风格，主体为腕表特写，干净浅灰背景",
        submit: "video-replication-submit",
    },
    AI_VIDEO_EDITING: {
        route: "/tools/ai-video/ai-video-editing",
        prompt: "保持主体与镜头运动不变，把背景替换为干净的浅灰影棚背景，光线柔和",
        submit: "ai-video-editing-submit",
    },
};

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function setFile(page, index, filePath) {
    const inputs = page.locator('[data-testid="tool-asset-file-input"]');
    await inputs.nth(index).setInputFiles(filePath);
}

async function waitSubmitReady(page, testid, timeout = 180_000) {
    await page.waitForFunction(
        (id) => {
            const btn = document.querySelector(`[data-testid="${id}"]`);
            return btn && !btn.disabled;
        },
        testid,
        { timeout },
    );
}

async function waitTerminal(page, toolId, since, timeoutMs) {
    const started = Date.now();
    let last = null;
    while (Date.now() - started < timeoutMs) {
        const snap = await page.evaluate((wanted) => {
            const out = [];
            for (const k of Object.keys(localStorage)) {
                if (!k.startsWith("tool-task:v1:task-")) continue;
                let t = null;
                try { t = JSON.parse(localStorage.getItem(k) || "null"); } catch { continue; }
                if (!t || t.toolId !== wanted) continue;
                out.push({
                    id: t.id, status: t.status, upstreamTaskId: t.upstreamTaskId ?? null,
                    createdAt: t.createdAt ?? 0, updatedAt: t.updatedAt ?? 0,
                    error: t.error ? { code: t.error.code ?? null, message: String(t.error.message ?? "").slice(0, 500) } : null,
                    items: (t.result?.items ?? []).map((i) => ({
                        kind: i.kind, url: i.url ? String(i.url).slice(0, 200) : null,
                        storageKey: i.storageKey ?? null, bytes: i.bytes ?? null,
                        mimeType: i.mimeType ?? null, payloadDropped: Boolean(i.payloadDropped),
                        ingestError: i.ingestError ? String(i.ingestError).slice(0, 300) : null,
                    })),
                });
            }
            return out.sort((a, b) => b.createdAt - a.createdAt);
        }, toolId);
        const fresh = snap.filter((t) => !since || t.createdAt >= since);
        if (fresh.length) last = fresh[0];
        if (last && ["succeeded", "failed", "unknown"].includes(last.status)) return last;
        await page.waitForTimeout(5000);
    }
    return last;
}

async function inspectPanel(page) {
    return page.evaluate(() => {
        const txt = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;
        const btn = (sel) => {
            const el = document.querySelector(sel);
            return el ? { exists: true, disabled: el.disabled, text: el.textContent.trim().slice(0, 20) } : { exists: false };
        };
        const video = document.querySelector('[data-testid="tool-result"] video');
        return {
            resultText: txt('[data-testid="tool-result"]')?.slice(0, 400) ?? null,
            feedback: txt('[data-testid="tool-result-feedback"]'),
            download: btn('[data-testid="tool-result-download-0"]'),
            save: btn('[data-testid="tool-result-save-0"]'),
            canvas: btn('[data-testid="tool-result-canvas-0"]'),
            videoEl: video ? { src: String(video.getAttribute("src") || video.currentSrc || "").slice(0, 120), duration: video.duration, w: video.videoWidth, h: video.videoHeight } : null,
        };
    });
}

async function readHistoryRow(page, taskId) {
    return page.evaluate((id) => {
        const rows = [...document.querySelectorAll('[data-testid="tool-task-history-item"]')];
        const row = rows.find((r) => r.getAttribute("data-task-id") === id) || null;
        return {
            count: rows.length,
            found: Boolean(row),
            text: row?.textContent?.trim().slice(0, 200) ?? null,
            openButtons: row ? row.querySelectorAll('[data-testid="tool-task-history-open"]').length : 0,
            dropped: row ? Boolean(row.querySelector('[data-testid="tool-task-history-payload-dropped"]')) : null,
        };
    }, taskId);
}

async function main() {
    const spec = SPECS[TOOL];
    if (!spec) throw new Error(`unknown tool ${TOOL}`);
    await fs.mkdir(path.join(OUT, "downloads"), { recursive: true });
    const record = { toolId: TOOL, runAt: new Date().toISOString(), base: BASE, issues: [], net: [], actions: {} };

    const ctx = await chromium.launchPersistentContext(PROFILE, {
        channel: "chrome", headless: true, viewport: { width: 1440, height: 960 }, locale: "zh-CN", acceptDownloads: true,
    });
    const page = ctx.pages()[0] || (await ctx.newPage());
    page.on("response", async (res) => {
        const url = res.url();
        if (!/\/v1\/videos(\/|\?|$)/.test(url)) return;
        let body = "";
        try { body = (await res.text()).slice(0, 600); } catch { body = "<no-body>"; }
        record.net.push({ at: new Date().toISOString(), method: res.request().method(), status: res.status(), path: url.replace(/^.*\/v1\/videos/, "/v1/videos"), body });
        if (record.net.length > 500) record.net.shift();
    });
    page.on("pageerror", (e) => record.issues.push(`pageerror: ${String(e).slice(0, 160)}`));

    try {
        const since = Date.now();
        await page.goto(`${BASE}${spec.route}?r13=${since}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(`[data-testid="${spec.submit}"]`, { timeout: 60_000 });
        await page.waitForTimeout(1500);

        // ---- 素材 ----
        if (TOOL === "IMAGE_TO_VIDEO") {
            await setFile(page, 0, IMAGE);
            const custom = page.locator('[data-testid="image-to-video-prompt-mode-custom"]');
            if (await custom.count()) await custom.first().click();
            await page.locator('[data-testid="image-to-video-prompt"]').first().fill(spec.prompt);
        } else if (TOOL === "VIDEO_REPLICATION") {
            await setFile(page, 0, VIDEO);
            const ta = page.locator('[data-testid="video-replication-script"]').first();
            await ta.fill(spec.prompt);
        } else {
            await setFile(page, 0, VIDEO);
            // 参考图（可选）：第二个上传控件
            const inputs = page.locator('[data-testid="tool-asset-file-input"]');
            if ((await inputs.count()) > 1) await inputs.nth(1).setInputFiles(IMAGE);
            await page.locator('[data-testid="ai-video-editing-prompt"]').first().fill(spec.prompt);
        }

        await waitSubmitReady(page, spec.submit, 240_000);
        await page.screenshot({ path: path.join(OUT, "01-filled.png"), fullPage: true });
        const submitText = await page.locator(`[data-testid="${spec.submit}"]`).first().textContent();
        record.submitLabel = submitText?.trim() ?? null;

        await page.locator(`[data-testid="${spec.submit}"]`).first().click();
        await page.waitForTimeout(4000);
        await page.screenshot({ path: path.join(OUT, "02-submitted.png"), fullPage: true });

        record.terminal = await waitTerminal(page, TOOL, since, 15 * 60_000);
        record.taskId = record.terminal?.id ?? null;
        await page.screenshot({ path: path.join(OUT, "03-terminal.png"), fullPage: true });

        if (!record.terminal || record.terminal.status !== "succeeded") {
            record.verdict = "FAILED_UPSTREAM_OR_TIMEOUT";
            await fs.writeFile(path.join(OUT, "result.json"), JSON.stringify(record, null, 1));
            console.log(JSON.stringify({ tool: TOOL, verdict: record.verdict, status: record.terminal?.status ?? null, error: record.terminal?.error ?? null }, null, 1));
            await ctx.close();
            return;
        }

        // ---- 整页刷新 → 历史 → 查看结果 ----
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector('[data-testid="tool-task-history-item"]', { timeout: 60_000 });
        await page.waitForTimeout(3000);
        record.history1 = await readHistoryRow(page, record.taskId);
        if (!record.history1.found) record.issues.push("刷新后历史里找不到该任务");

        await page.evaluate((id) => {
            const rows = [...document.querySelectorAll('[data-testid="tool-task-history-item"]')];
            const row = rows.find((r) => r.getAttribute("data-task-id") === id);
            row?.querySelector('[data-testid="tool-task-history-open"]')?.click();
        }, record.taskId);
        await page.waitForTimeout(2500);
        await page.screenshot({ path: path.join(OUT, "04-reload-panel.png"), fullPage: true });
        record.panel1 = await inspectPanel(page);

        // ---- 动作 1：下载 ----
        let download = null;
        try {
            const [dl] = await Promise.all([
                page.waitForEvent("download", { timeout: 90_000 }),
                page.locator('[data-testid="tool-result-download-0"]').first().click(),
            ]);
            const file = path.join(OUT, "downloads", `${TOOL}-reload.mp4`);
            await dl.saveAs(file);
            const buf = await fs.readFile(file);
            download = { bytes: buf.length, sha256: sha256(buf), magic: buf.subarray(4, 8).toString("ascii"), name: dl.suggestedFilename() };
        } catch (e) {
            record.issues.push(`下载失败：${String(e).slice(0, 200)}`);
        }
        record.actions.download = download;

        // ---- 动作 2：存资产 ----
        try {
            await page.locator('[data-testid="tool-result-save-0"]').first().click();
            await page.waitForFunction(() => (document.querySelector('[data-testid="tool-result-feedback"]')?.textContent ?? "").trim().length > 0, undefined, { timeout: 90_000 }).catch(() => {});
            record.actions.save = await page.evaluate(async () => {
                const feedback = document.querySelector('[data-testid="tool-result-feedback"]')?.textContent?.trim() ?? null;
                let assets = null;
                try {
                    const mod = await import("/src/stores/use-asset-store.ts");
                    const list = mod.useAssetStore.getState().assets || [];
                    assets = list.filter((a) => String(a.mimeType || "").startsWith("video/")).map((a) => ({ id: a.id, bytes: a.bytes, mimeType: a.mimeType, toolId: a.toolId ?? null, sourceTaskId: a.sourceTaskId ?? null }));
                } catch (e) { assets = String(e); }
                return { feedback, assets };
            });
        } catch (e) {
            record.issues.push(`存资产失败：${String(e).slice(0, 200)}`);
        }

        // ---- 动作 3：发到画布 ----
        try {
            await page.locator('[data-testid="tool-result-canvas-0"]').first().click();
            await page.waitForTimeout(5000);
            record.actions.canvas = await page.evaluate(async () => {
                const feedback = document.querySelector('[data-testid="tool-result-feedback"]')?.textContent?.trim() ?? null;
                let nodes = null, projects = null;
                try {
                    const idb = await import("idb-keyval");
                    const list = await idb.get("canvas-nodes");
                    nodes = Array.isArray(list) ? list.filter((n) => String(n?.type || "").includes("video")).map((n) => ({ id: n.id, type: n.type, w: n.width, h: n.height })) : null;
                    const p = await idb.get("canvas-projects");
                    projects = Array.isArray(p) ? p.length : null;
                } catch (e) { nodes = String(e); }
                return { feedback, videoNodes: nodes, projects };
            });
        } catch (e) {
            record.issues.push(`发画布失败：${String(e).slice(0, 200)}`);
        }
        await page.screenshot({ path: path.join(OUT, "05-actions.png"), fullPage: true });

        // ---- 二次刷新，证明靠 IndexedDB 恢复 ----
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector('[data-testid="tool-task-history-item"]', { timeout: 60_000 });
        await page.waitForTimeout(3000);
        record.history2 = await readHistoryRow(page, record.taskId);
        await page.evaluate((id) => {
            const rows = [...document.querySelectorAll('[data-testid="tool-task-history-item"]')];
            const row = rows.find((r) => r.getAttribute("data-task-id") === id);
            row?.querySelector('[data-testid="tool-task-history-open"]')?.click();
        }, record.taskId);
        await page.waitForTimeout(2500);
        record.panel2 = await inspectPanel(page);
        await page.screenshot({ path: path.join(OUT, "06-reload2-panel.png"), fullPage: true });

        const ok = download && download.magic === "ftyp" && download.bytes > 0 && record.panel2?.download?.exists && !record.panel2?.download?.disabled;
        record.verdict = ok ? "PASS" : "PARTIAL";
        await fs.writeFile(path.join(OUT, "result.json"), JSON.stringify(record, null, 1));
        console.log(JSON.stringify({
            tool: TOOL, verdict: record.verdict, taskId: record.taskId, upstream: record.terminal.upstreamTaskId,
            items: record.terminal.items, download, panel2: record.panel2, issues: record.issues,
            save: record.actions.save, canvas: record.actions.canvas,
        }, null, 1));
    } catch (e) {
        record.issues.push(`fatal: ${String(e).slice(0, 500)}`);
        record.verdict = "ERROR";
        await fs.writeFile(path.join(OUT, "result.json"), JSON.stringify(record, null, 1)).catch(() => {});
        console.log(JSON.stringify({ tool: TOOL, verdict: "ERROR", error: String(e).slice(0, 800), issues: record.issues }, null, 1));
        await ctx.close();
        process.exitCode = 1;
        return;
    }
    await ctx.close();
}

await main();
