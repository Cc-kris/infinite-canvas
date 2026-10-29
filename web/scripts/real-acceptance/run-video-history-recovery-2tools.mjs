/**
 * 视频双工具「真实历史恢复」验收：VIDEO_REPLICATION / VIDEO_TRANSLATION。
 *
 * 边界（不 mock 上游、不重生成）：
 * - 任务快照全部复用**已有真实任务**：
 *   · VIDEO_REPLICATION：sub2api MiniMax-H3 真跑出的 `task_Ma7egazZrnGPt5BtVr5vW2hfApVxvCIS`（status=done），
 *     产物字节 `evidence/real-acceptance/VIDEO_REPLICATION/link-mode/out.mp4`（2,277,978 B），
 *     由 `serve-evidence.py` 以 127.0.0.1:23298 只读暴露；
 *   · VIDEO_TRANSLATION：本机真实提交收到的 400 原文（无成片，只验「恢复 + 失败原因可见 + 不重提」）。
 * - 落盘走应用自身的 `useToolTaskStore.upsertTask()`（含真实 ingest：字节写 IndexedDB、记 storageKey），
 *   刷新后由 `hydrate()` + `restoreResultMediaUrls()` 从 storageKey 复原 blob 地址；
 * - 页面上的「查看结果 / 下载 / 存入资产」点的是真实按钮，走真实 file-saver / 资产库逻辑；
 * - 二次刷新后再下载一次，证明恢复靠 IndexedDB 而不是内存里的 blob URL。
 *
 * 用法：cd web && /opt/homebrew/bin/node scripts/real-acceptance/run-video-history-recovery-2tools.mjs
 * 产出：docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_HISTORY_RECOVERY_2TOOLS/
 */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { stat } from "node:fs/promises";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const BASE = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const MEDIA = process.env.IC_EVIDENCE_MEDIA || "http://127.0.0.1:23298";
const EVIDENCE_ROOT = path.resolve(HERE, "../../../docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance");
const OUT = path.join(EVIDENCE_ROOT, "VIDEO_HISTORY_RECOVERY_2TOOLS");

const REPLICATION_ARTIFACT = "VIDEO_REPLICATION/link-mode/out.mp4";
const REPLICATION_UPSTREAM_TASK = "task_Ma7egazZrnGPt5BtVr5vW2hfApVxvCIS";
const TRANSLATION_ERROR =
    "'utf-8' codec can't decode byte 0xe8 in position 1614: invalid continuation byte · sub2api.1006000.xyz/videos · HTTP 400（该中转的 /videos 只接受 JSON，收不了上传的视频文件字节；源视频需是公网可访问的 http(s) 地址）";

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

const SPECS = [
    {
        toolId: "VIDEO_REPLICATION",
        route: "/tools/ai-video/video-replication",
        history: '[data-testid="video-replication-history"]',
        result: '[data-testid="video-replication-result"]',
        capability: "video",
        kind: "success",
        prompt: "keep the product shot, restyle background to a clean studio table, 9:16",
        configSnapshot: {
            model: "MiniMax-H3",
            capability: "video",
            duration: 6,
            aspectRatio: "9:16",
            sourceMode: "link",
            videoLink: "https://modifications-ant-routing-lyrics.trycloudflare.com/small.mp4",
            upstreamTaskId: REPLICATION_UPSTREAM_TASK,
        },
        artifact: REPLICATION_ARTIFACT,
    },
    {
        toolId: "VIDEO_TRANSLATION",
        route: "/tools/ai-video/video-translation",
        history: '[data-testid="video-translation-history"]',
        result: '[data-testid="video-translation-result"]',
        capability: "video",
        kind: "failed",
        prompt: "把原视频的语音翻译成目标语言并重新配音，保持原画面、镜头节奏与字幕时间轴不变，输出可直接投放的成片",
        configSnapshot: {
            model: "sub2api-real::MiniMax-H3",
            capability: "video",
            sourceLanguage: "auto",
            targetLanguage: "en",
            lipSync: false,
            outputNum: 1,
            videoType: "standard",
        },
        error: { code: "upstream-http-400", message: TRANSLATION_ERROR },
    },
];

function buildTask(spec) {
    const createdAt = Date.parse("2026-10-29T13:05:00+08:00");
    const task = {
        id: `task-real-${spec.toolId.toLowerCase()}-20261029`,
        toolId: spec.toolId,
        capability: spec.capability,
        status: spec.kind === "success" ? "succeeded" : "failed",
        createdAt,
        updatedAt: createdAt,
        prompt: spec.prompt,
        configSnapshot: spec.configSnapshot,
        sourceAssetIds: ["src-real-live-run-20261029"],
        result: {
            receivedAt: createdAt,
            items: spec.kind === "success"
                ? [{ id: "item-real-0", kind: "video", url: `${MEDIA}/${spec.artifact}`, mimeType: "video/mp4" }]
                : [],
        },
    };
    if (spec.error) task.error = spec.error;
    return task;
}

/** 走应用自身 upsertTask（真实 persistTask + ingestResultMedia）。 */
async function seed(page, task) {
    return page.evaluate(async (payload) => {
        const mod = await import("/src/stores/use-tool-task-store.ts");
        mod.useToolTaskStore.getState().upsertTask(payload);
        return true;
    }, task);
}

/** 等 ingest 完成：快照里出现 storageKey（字节已写进 IndexedDB）。 */
async function waitIngest(page, taskId, timeout = 60_000) {
    await page.waitForFunction(
        (id) => {
            const raw = localStorage.getItem(`tool-task:v1:${id}`);
            if (!raw) return false;
            try {
                const task = JSON.parse(raw);
                const items = task?.result?.items ?? [];
                return items.length > 0 && items.every((item) => Boolean(item.storageKey));
            } catch {
                return false;
            }
        },
        taskId,
        { timeout },
    );
    return page.evaluate((id) => JSON.parse(localStorage.getItem(`tool-task:v1:${id}`)), taskId);
}

async function readHistory(page, selector) {
    return page.evaluate((sel) => {
        const root = document.querySelector(sel);
        if (!root) return null;
        return {
            items: Array.from(root.querySelectorAll('[data-testid="tool-task-history-item"]')).map((node) => ({
                taskId: node.getAttribute("data-task-id"),
                status: node.getAttribute("data-task-status"),
                time: node.querySelector('[data-testid="tool-task-history-time"]')?.textContent?.trim() ?? "",
                error: node.querySelector('[data-testid="tool-task-history-error"]')?.textContent?.trim() ?? "",
                dropped: Boolean(node.querySelector('[data-testid="tool-task-history-payload-dropped"]')),
                openButtons: node.querySelectorAll('[data-testid="tool-task-history-open"]').length,
                thumbs: Array.from(node.querySelectorAll("img")).map((img) => ({
                    src: (img.getAttribute("src") ?? "").slice(0, 24),
                    width: img.naturalWidth,
                })),
            })),
        };
    }, selector);
}

async function readResultArea(page, selector) {
    return page.evaluate((sel) => {
        const root = document.querySelector(sel);
        const video = root?.querySelector('[data-testid="tool-result-video"]');
        const feedback = document.querySelector('[data-testid="tool-result-feedback"]');
        return {
            hasResult: Boolean(root),
            video: video
                ? {
                    srcScheme: (video.getAttribute("src") ?? "").split(":")[0],
                    readyState: video.readyState,
                    videoWidth: video.videoWidth,
                    duration: Number.isFinite(video.duration) ? video.duration : null,
                    error: video.error?.code ?? null,
                }
                : null,
            buttons: ["download", "save", "canvas"].map((key) => ({
                key,
                count: root?.querySelectorAll(`[data-testid="tool-result-${key}-0"]`).length ?? 0,
                disabled: root?.querySelector(`[data-testid="tool-result-${key}-0"]`)?.hasAttribute("disabled") ?? null,
            })),
            feedback: feedback ? { text: feedback.textContent?.trim() ?? "", tone: feedback.getAttribute("data-tone") ?? "" } : null,
        };
    }, selector);
}

/** 读持久化资产库（localforage 快照，刷新后用户真正看到的那份）。 */
async function readAssets(page) {
    return page.evaluate(async () => {
        const lf = await import("/src/lib/localforage-storage.ts");
        const raw = await lf.localForageStorage.getItem("infinite-canvas:asset_store");
        const assets = (raw ? JSON.parse(raw) : null)?.state?.assets ?? [];
        return {
            count: assets.length,
            videos: assets
                .filter((asset) => asset.kind === "video")
                .map((asset) => ({
                    id: asset.id,
                    title: asset.title,
                    bytes: asset.data?.bytes ?? null,
                    storageKey: asset.data?.storageKey ?? null,
                    mimeType: asset.data?.mimeType ?? null,
                    toolId: asset.metadata?.toolId ?? null,
                })),
        };
    });
}

async function fetchShaFromPage(page, url) {
    return page.evaluate(async (target) => {
        const res = await fetch(target, { cache: "no-store" });
        const bytes = new Uint8Array(await res.arrayBuffer());
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        return {
            status: res.status,
            bytes: bytes.length,
            sha: Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join(""),
        };
    }, url);
}

async function downloadAndHash(page, buttonSelector, outDir, fileName) {
    const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 90_000 }),
        page.click(buttonSelector),
    ]);
    const target = path.join(outDir, fileName);
    await download.saveAs(target);
    const bytes = await fs.readFile(target);
    return { file: path.basename(target), suggested: download.suggestedFilename(), bytes: (await stat(target)).size, sha: sha256(bytes) };
}

async function verifySuccessTool(browser, spec) {
    const record = { toolId: spec.toolId, kind: spec.kind, issues: [], network: [] };
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN", acceptDownloads: true });
    const page = await context.newPage();
    page.on("request", (req) => {
        const url = req.url();
        if (/\/v1\/videos(\?|$)/.test(url) && req.method() === "POST") record.network.push({ method: "POST", url });
    });
    try {
        const localBytes = await fs.readFile(path.join(EVIDENCE_ROOT, spec.artifact));
        record.artifact = { file: spec.artifact, bytes: localBytes.length, sha: sha256(localBytes) };
        if (localBytes.length !== 2_277_978) record.issues.push(`证据产物字节数异常 ${localBytes.length}`);

        await page.goto(`${BASE}${spec.route}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2500);

        const task = buildTask(spec);
        await seed(page, task);
        const snapshot = await waitIngest(page, task.id);
        record.seededTaskId = task.id;
        record.ingest = {
            storageKey: snapshot.result.items[0]?.storageKey ?? null,
            bytes: snapshot.result.items[0]?.bytes ?? null,
            urlScheme: (snapshot.result.items[0]?.url ?? "").split(":")[0],
        };
        if (!record.ingest.storageKey) record.issues.push("ingest 后没有 storageKey（字节没进 IndexedDB）");
        if (record.ingest.bytes !== localBytes.length) record.issues.push(`ingest 字节 ${record.ingest.bytes} ≠ 证据 ${localBytes.length}`);

        // ---- 第一次 fresh reload ----
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector(spec.history, { timeout: 60_000 });
        await page.waitForSelector('[data-testid="tool-task-history-open"]', { timeout: 60_000 });
        record.historyAfterReload = await readHistory(page, spec.history);
        const row = record.historyAfterReload?.items?.[0];
        if (!row) record.issues.push("刷新后历史坞没有条目");
        else {
            if (row.taskId !== task.id) record.issues.push(`历史条目 id 不匹配 ${row.taskId}`);
            if (row.status !== "succeeded") record.issues.push(`历史条目状态 ${row.status}`);
            if (row.openButtons !== 1) record.issues.push(`「查看结果」按钮数 ${row.openButtons}`);
            if (row.dropped) record.issues.push("历史坞误报「原始文件未保留」");
        }

        // 点「查看结果」→ 结果区
        await page.click('[data-testid="tool-task-history-open"]');
        await page.waitForSelector(`${spec.result} [data-testid="tool-result-video"]`, { timeout: 30_000 });
        await page.waitForFunction(
            (sel) => {
                const video = document.querySelector(`${sel} [data-testid="tool-result-video"]`);
                return Boolean(video && video.readyState >= 1);
            },
            spec.result,
            { timeout: 60_000 },
        );
        record.resultArea = await readResultArea(page, spec.result);
        if (!record.resultArea.video || record.resultArea.video.videoWidth === 0) record.issues.push("结果区视频没解码");
        if (!record.resultArea.buttons.every((b) => b.count === 1)) record.issues.push(`结果动作按钮缺失 ${JSON.stringify(record.resultArea.buttons)}`);

        // 页面内取播放源字节（blob:）逐字节比对
        const videoSrc = await page.evaluate((sel) => document.querySelector(`${sel} [data-testid="tool-result-video"]`)?.getAttribute("src") ?? "", spec.result);
        record.sourceBytes = await fetchShaFromPage(page, videoSrc);
        if (record.sourceBytes.sha !== record.artifact.sha) record.issues.push("刷新后播放源字节 sha256 与证据不一致");

        // 真实下载按钮
        record.download1 = await downloadAndHash(page, '[data-testid="tool-result-download-0"]', path.join(OUT, "downloads"), `${spec.toolId}-reload1-${REPLICATION_UPSTREAM_TASK}.mp4`);
        if (record.download1.sha !== record.artifact.sha) record.issues.push("第一次刷新后下载字节 sha256 与证据不一致");

        // 存入资产
        const assetsBefore = await readAssets(page);
        await page.click('[data-testid="tool-result-save-0"]');
        await page.waitForFunction(
            () => (document.querySelector('[data-testid="tool-result-feedback"]')?.textContent ?? "").includes("已保存到资产库"),
            undefined,
            { timeout: 60_000 },
        );
        await page.waitForTimeout(800);
        const assetsAfter = await readAssets(page);
        record.assets = { before: { count: assetsBefore.count, videos: assetsBefore.videos.length }, after: { count: assetsAfter.count, videos: assetsAfter.videos } };
        const saved = assetsAfter.videos.find((asset) => asset.storageKey && asset.bytes === localBytes.length);
        if (!saved) record.issues.push(`资产库没有新增 ${localBytes.length} 字节视频（after=${JSON.stringify(assetsAfter.videos)}）`);
        else {
            const assetBytes = await page.evaluate(async (key) => {
                const mod = await import("/src/services/file-storage.ts");
                const url = await mod.resolveMediaUrl(key, "");
                if (!url) return null;
                const res = await fetch(url);
                const bytes = new Uint8Array(await res.arrayBuffer());
                const digest = await crypto.subtle.digest("SHA-256", bytes);
                return { bytes: bytes.length, sha: Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("") };
            }, saved.storageKey);
            record.assetBytes = assetBytes;
            if (!assetBytes || assetBytes.sha !== record.artifact.sha) record.issues.push("资产库里的视频字节 sha256 与证据不一致");
        }
        record.assetsToolIdMatched = assetsAfter.videos.some((asset) => asset.toolId === spec.toolId);
        if (!record.assetsToolIdMatched) record.issues.push("资产 metadata.toolId 未记录本工具");

        await page.screenshot({ path: path.join(OUT, "screenshots", `${spec.toolId}-reload1.png`), fullPage: true });

        // ---- 第二次 fresh reload：证明恢复靠 IndexedDB ----
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector(spec.history, { timeout: 60_000 });
        await page.waitForSelector('[data-testid="tool-task-history-open"]', { timeout: 60_000 });
        await page.click('[data-testid="tool-task-history-open"]');
        await page.waitForFunction(
            (sel) => {
                const video = document.querySelector(`${sel} [data-testid="tool-result-video"]`);
                return Boolean(video && video.readyState >= 1);
            },
            spec.result,
            { timeout: 60_000 },
        );
        record.download2 = await downloadAndHash(page, '[data-testid="tool-result-download-0"]', path.join(OUT, "downloads"), `${spec.toolId}-reload2-${REPLICATION_UPSTREAM_TASK}.mp4`);
        if (record.download2.sha !== record.artifact.sha) record.issues.push("第二次刷新后下载字节 sha256 与证据不一致");
        record.assetsAfterSecondReload = (await readAssets(page)).videos.length;
        if (record.assetsAfterSecondReload < (record.assets.after.videos?.length ?? 0)) record.issues.push("二次刷新后资产库视频消失");
        await page.screenshot({ path: path.join(OUT, "screenshots", `${spec.toolId}-reload2.png`), fullPage: true });

        // ---- 第三次刷新：把落盘的远程 url 改成「已过期」，模拟上游链接失效 ----
        // 线上真实风险：MiniMax /content 链接会过期，此时只能靠 storageKey 从 IndexedDB 复原。
        await page.evaluate((id) => {
            const key = `tool-task:v1:${id}`;
            const snapshot = JSON.parse(localStorage.getItem(key));
            snapshot.result.items[0].url = "http://127.0.0.1:23298/__expired__/link-gone.mp4";
            localStorage.setItem(key, JSON.stringify(snapshot));
        }, task.id);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector(spec.history, { timeout: 60_000 });
        await page.waitForSelector('[data-testid="tool-task-history-open"]', { timeout: 60_000 });
        await page.click('[data-testid="tool-task-history-open"]');
        await page.waitForFunction(
            (sel) => {
                const video = document.querySelector(`${sel} [data-testid="tool-result-video"]`);
                return Boolean(video && video.readyState >= 1);
            },
            spec.result,
            { timeout: 60_000 },
        );
        record.resultAreaExpiredLink = await readResultArea(page, spec.result);
        if (!record.resultAreaExpiredLink.video || record.resultAreaExpiredLink.video.videoWidth === 0) {
            record.issues.push("远程链接过期后结果区视频无法解码（没有从 IndexedDB 复原）");
        }
        record.download3 = await downloadAndHash(page, '[data-testid="tool-result-download-0"]', path.join(OUT, "downloads"), `${spec.toolId}-expired-link.mp4`);
        if (record.download3.sha !== record.artifact.sha) record.issues.push("远程链接过期后下载字节 sha256 与证据不一致");
        await page.screenshot({ path: path.join(OUT, "screenshots", `${spec.toolId}-expired-link.png`), fullPage: true });
    } catch (error) {
        record.issues.push(`EXCEPTION: ${String(error).slice(0, 400)}`);
        try {
            await page.screenshot({ path: path.join(OUT, "screenshots", `${spec.toolId}-fail.png`), fullPage: true });
        } catch {}
    } finally {
        await context.close();
    }
    if (record.network.length > 0) record.issues.push(`恢复过程出现上游 POST ${record.network.length} 次（刷新不应重提）`);
    return record;
}

async function verifyFailedTool(browser, spec) {
    const record = { toolId: spec.toolId, kind: spec.kind, issues: [], network: [] };
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN" });
    const page = await context.newPage();
    page.on("request", (req) => {
        const url = req.url();
        if (/\/v1\/videos(\?|$)/.test(url) && req.method() === "POST") record.network.push({ method: "POST", url });
    });
    try {
        await page.goto(`${BASE}${spec.route}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2500);
        const task = buildTask(spec);
        await seed(page, task);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector(spec.history, { timeout: 60_000 });
        await page.waitForSelector('[data-testid="tool-task-history-item"]', { timeout: 60_000 });
        record.historyAfterReload = await readHistory(page, spec.history);
        const row = record.historyAfterReload?.items?.[0];
        if (!row) record.issues.push("刷新后历史坞没有条目");
        else {
            if (row.taskId !== task.id) record.issues.push(`历史条目 id 不匹配 ${row.taskId}`);
            if (row.status !== "failed") record.issues.push(`历史条目状态 ${row.status}`);
            if (!row.error.includes("HTTP 400")) record.issues.push("历史条目没有显示真实上游错误原文");
            if (row.openButtons !== 0) record.issues.push("没有结果项却出现「查看结果」按钮（会误导）");
        }
        record.resultArea = await readResultArea(page, spec.result);
        await page.screenshot({ path: path.join(OUT, "screenshots", `${spec.toolId}-reload1.png`), fullPage: true });
    } catch (error) {
        record.issues.push(`EXCEPTION: ${String(error).slice(0, 400)}`);
        try {
            await page.screenshot({ path: path.join(OUT, "screenshots", `${spec.toolId}-fail.png`), fullPage: true });
        } catch {}
    } finally {
        await context.close();
    }
    if (record.network.length > 0) record.issues.push(`刷新后自动重提上游 ${record.network.length} 次（违反「不重提」）`);
    return record;
}

async function main() {
    await fs.mkdir(path.join(OUT, "screenshots"), { recursive: true });
    await fs.mkdir(path.join(OUT, "downloads"), { recursive: true });
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const records = [];
    try {
        for (const spec of SPECS) {
            process.stdout.write(`--- ${spec.toolId} ... `);
            const record = spec.kind === "success" ? await verifySuccessTool(browser, spec) : await verifyFailedTool(browser, spec);
            records.push(record);
            console.log(record.issues.length === 0 ? "OK" : `ISSUES(${record.issues.length})`);
            for (const issue of record.issues) console.log(`      ! ${issue}`);
        }
    } finally {
        await browser.close();
    }
    const summary = {
        generatedAt: new Date().toISOString(),
        baseUrl: BASE,
        media: MEDIA,
        boundary: "复用已有真实任务/产物：VIDEO_REPLICATION=sub2api MiniMax-H3 done 任务+真实 mp4；VIDEO_TRANSLATION=真实 400 失败任务（无成片，不伪造）",
        tools: records.map((record) => ({
            toolId: record.toolId,
            kind: record.kind,
            ok: record.issues.length === 0,
            issues: record.issues,
            historyAfterReload: record.historyAfterReload?.items ?? [],
            ingest: record.ingest ?? null,
            download1: record.download1 ?? null,
            download2: record.download2 ?? null,
            download3: record.download3 ?? null,
            resultAreaExpiredLink: record.resultAreaExpiredLink ?? null,
            assets: record.assets ?? null,
            network: record.network,
        })),
    };
    await fs.writeFile(path.join(OUT, "summary.json"), JSON.stringify({ summary, records }, null, 2));
    console.log(`\nsummary: ${records.filter((r) => r.issues.length === 0).length}/${records.length} OK`);
}

await main();
