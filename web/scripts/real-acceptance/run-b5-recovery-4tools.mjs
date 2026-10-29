/**
 * B5 历史恢复（四工具补测）：AREA_REPAIR / REMOVE_PEN / CHANGE_COLOR / IMAGE_CROP。
 *
 * 边界（不 mock 上游、不重生成结果）：
 * - 任务快照复用各工具上一轮**真实 provider 产物**的元数据（prompt/配置/结果 URL），
 *   结果字节由 serve-evidence.py 以 127.0.0.1:23298 只读暴露，脚本先算本地 sha256，
 *   刷新后从页面内 fetch 同一 URL 再算一次，逐字节比对；
 * - 任务经应用自身的 `persistTask()` 落盘 → 刷新 → 面板/历史 tab 必须从 localStorage 读回；
 * - 面板上的「复制配置 / 下载 / 存入资产 / 发送画布」点的是真实按钮，走真实存储与画布模块。
 *
 * 产出：docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/B5_HISTORY_DOCK/recovery4/
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
const OUT = path.join(EVIDENCE_ROOT, "B5_HISTORY_DOCK", "recovery4");

const TOOLS = [
    {
        toolId: "AREA_REPAIR",
        route: "/tools/smart-edit/area-repair",
        capability: "image",
        prompt: "把涂抹区域的表盘替换成米色针织纹理，保留原有光影、镜头与背景不变",
        configSnapshot: { model: "gpt-image-2", aspectRatio: "1:1", count: 2 },
        artifacts: ["AREA_REPAIR/result.png", "AREA_REPAIR/result-2.png"],
        panel: "dock",
    },
    {
        toolId: "REMOVE_PEN",
        route: "/tools/smart-edit/remove-pen",
        capability: "image",
        prompt: "消除蒙版涂抹区域（真实任务：局部消除）",
        configSnapshot: { model: "gpt-image-2", aspectRatio: "1:1", count: 1 },
        artifacts: ["REMOVE_PEN/result.png"],
        panel: "dock",
    },
    {
        toolId: "CHANGE_COLOR",
        route: "/tools/smart-edit/change-color",
        capability: "image",
        prompt: "把衣服颜色换成藏青色（真实产物复用）",
        configSnapshot: { model: "gpt-image-2", aspectRatio: "1:1", count: 1 },
        artifacts: ["CHANGE_COLOR/result.png"],
        panel: "own",
    },
    {
        toolId: "IMAGE_CROP",
        route: "/tools/smart-edit/image-crop",
        capability: "image",
        prompt: "本地像素裁剪 1024×744（真实产物复用）",
        configSnapshot: { model: "local-canvas", count: 1 },
        artifacts: ["IMAGE_CROP/result.png"],
        panel: "dock",
    },
];

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

function buildTask(spec, index, now) {
    return {
        id: `task-real-${spec.toolId}-${index}-${now}`,
        toolId: spec.toolId,
        capability: spec.capability,
        status: "succeeded",
        createdAt: now - index * 3600_000,
        updatedAt: now - index * 3600_000,
        prompt: spec.prompt,
        configSnapshot: spec.configSnapshot,
        sourceAssetIds: [`src-${spec.toolId.toLowerCase()}-real`],
        result: {
            items: spec.artifacts.map((rel, i) => ({
                id: `item-${i}`,
                kind: "image",
                url: `${MEDIA}/${rel}`,
                mimeType: "image/png",
            })),
        },
    };
}

async function seed(page, list) {
    await page.evaluate(async (tasks) => {
        const store = await import("/src/stores/use-tool-task-store.ts");
        const merged = { ...store.useToolTaskStore.getState().tasks };
        for (const task of tasks) {
            store.persistTask(task);
            merged[task.id] = task;
        }
        store.useToolTaskStore.setState({ tasks: merged, hydrated: true });
    }, list);
}

async function readDock(page) {
    return page.evaluate(() => {
        const dock = document.querySelector('[data-testid="tool-history-dock"]');
        if (!dock) return null;
        return {
            countText: dock.querySelector('[data-testid="tool-history-dock-count"]')?.textContent?.trim() ?? "",
            items: Array.from(dock.querySelectorAll('[data-testid="tool-history-dock-item"]')).map((node) => ({
                taskId: node.getAttribute("data-task-id"),
                status: node.getAttribute("data-task-status"),
                summary: node.querySelector('[data-testid="tool-history-dock-summary"]')?.textContent?.trim() ?? "",
            })),
            thumbs: Array.from(dock.querySelectorAll("img")).map((img) => ({
                src: img.getAttribute("src") ?? "",
                width: img.naturalWidth,
                decoded: img.complete && img.naturalWidth > 0,
            })),
        };
    });
}

async function readDetail(page) {
    return page.evaluate(() => {
        const d = document.querySelector('[data-testid="tool-history-dock-detail"]');
        if (!d) return null;
        return {
            config: d.querySelector('[data-testid="tool-history-dock-config"]')?.textContent?.trim() ?? "",
            sources: d.querySelector('[data-testid="tool-history-dock-sources"]')?.textContent?.trim() ?? "",
            results: Array.from(d.querySelectorAll('[data-testid="tool-history-dock-result"]')).map((n) => ({
                src: n.querySelector("img")?.getAttribute("src") ?? "",
                width: n.querySelector("img")?.naturalWidth ?? 0,
            })),
            actions: ["download", "save", "canvas"].map((key) => d.querySelectorAll(`[data-testid="tool-history-dock-${key}"]`).length),
        };
    });
}

async function waitDockFeedback(page, prefix, timeout = 90_000) {
    await page.waitForFunction(
        (p) => {
            const node = document.querySelector('[data-testid="tool-history-dock-feedback"]');
            return Boolean(node && node.textContent?.includes(p));
        },
        prefix,
        { timeout },
    );
    return page.evaluate(() => {
        const node = document.querySelector('[data-testid="tool-history-dock-feedback"]');
        return { text: node?.textContent?.trim() ?? "", tone: node?.getAttribute("data-tone") ?? "" };
    });
}

async function fetchSha(page, url) {
    return page.evaluate(async (target) => {
        const res = await fetch(target, { cache: "no-store" });
        const bytes = new Uint8Array(await res.arrayBuffer());
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        return { status: res.status, bytes: bytes.length, sha: Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("") };
    }, url);
}

async function verifyDockTool(browser, spec) {
    const record = { toolId: spec.toolId, panel: "dock", issues: [] };
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: "zh-CN" });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const page = await context.newPage();
    try {
        await page.goto(`${BASE}${spec.route}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2500);
        const tasks = [buildTask(spec, 1, Date.now()), buildTask(spec, 2, Date.now())];
        record.seeded = tasks.map((t) => ({ id: t.id, prompt: t.prompt, items: t.result.items.length }));
        await seed(page, tasks);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector('[data-testid="tool-history-dock"]', { timeout: 60_000 });
        await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-testid="tool-history-dock"] img')).every((img) => img.complete), undefined, { timeout: 30_000 });

        const dock = await readDock(page);
        record.afterReload = dock;
        if (!dock) throw new Error("刷新后没有历史面板");
        if (dock.items.length !== 2) record.issues.push(`刷新后条目数 ${dock.items.length} ≠ 2`);
        if (dock.countText !== "2 条") record.issues.push(`计数文本 ${dock.countText} ≠ 2 条`);
        if (!dock.thumbs.every((thumb) => thumb.decoded)) record.issues.push("缩略图未真正解码");
        if (dock.items[0]?.taskId !== tasks[0].id) record.issues.push("条目未按时间倒序");

        await page.locator('[data-testid="tool-history-dock-toggle"]').first().click();
        await page.waitForSelector('[data-testid="tool-history-dock-detail"]', { timeout: 15_000 });
        const detail = await readDetail(page);
        record.detail = detail;
        if (!detail) throw new Error("展开后没有详情");
        if (!detail.config.includes("gpt-image-2") && !detail.config.includes("local-canvas")) record.issues.push("配置快照没显示真实模型");
        if (detail.results.length !== spec.artifacts.length) record.issues.push(`详情结果数 ${detail.results.length} ≠ ${spec.artifacts.length}`);
        if (!detail.results.every((item) => item.width > 0)) record.issues.push("详情结果图未解码");
        if (!detail.actions.every((count) => count === spec.artifacts.length)) record.issues.push(`结果动作数量异常 ${JSON.stringify(detail.actions)}`);

        // 结果字节仍在：本地证据 sha256  vs  刷新后页面内 fetch 的 sha256
        record.bytes = [];
        for (const [index, rel] of spec.artifacts.entries()) {
            const local = await fs.readFile(path.join(EVIDENCE_ROOT, rel));
            const fetched = await fetchSha(page, detail.results[index]?.src ?? `${MEDIA}/${rel}`);
            const check = { url: `${MEDIA}/${rel}`, localBytes: local.length, localSha: sha256(local), fetched };
            check.match = fetched.sha === check.localSha;
            if (!check.match) record.issues.push(`结果 ${rel} 刷新后字节 sha256 不一致`);
            record.bytes.push(check);
        }

        await page.click('[data-testid="tool-history-dock-copy-config"]');
        await page.waitForTimeout(600);
        const clipboard = await page.evaluate(async () => {
            try {
                return await navigator.clipboard.readText();
            } catch (error) {
                return `READ_FAILED: ${String(error)}`;
            }
        });
        try {
            const payload = JSON.parse(clipboard);
            record.clipboard = { toolId: payload.toolId, hasConfig: Boolean(payload.configSnapshot), hasPrompt: Boolean(payload.prompt) };
            if (payload.toolId !== spec.toolId) record.issues.push("复制的配置 toolId 不匹配");
        } catch {
            record.issues.push("剪贴板不是可解析 JSON");
        }

        const [download] = await Promise.all([
            page.waitForEvent("download", { timeout: 60_000 }),
            page.click('[data-testid="tool-history-dock-download"]'),
        ]);
        const downloadPath = path.join(OUT, "downloads", `${spec.toolId}-${download.suggestedFilename()}`);
        await download.saveAs(downloadPath);
        const downloaded = await fs.readFile(downloadPath);
        record.download = { fileName: path.basename(downloadPath), bytes: (await stat(downloadPath)).size, sha: sha256(downloaded) };
        if (record.download.sha !== record.bytes[0].localSha) record.issues.push("下载文件与证据字节 sha256 不一致");

        // 存资产：以「持久化快照」为准（开发态同一 store 模块可能被解析成两个实例，
        // 读 getState().assets 会得到 0，而真实写入已经落盘；快照是用户刷新后真正能看到的）。
        const readPersistedAssets = () =>
            page.evaluate(async () => {
                const lf = await import("/src/lib/localforage-storage.ts");
                const raw = await lf.localForageStorage.getItem("infinite-canvas:asset_store");
                const parsed = raw ? JSON.parse(raw) : null;
                const assets = parsed?.state?.assets ?? [];
                return { count: assets.length, latestTitle: assets[0]?.title ?? null };
            });
        const assetsBefore = await readPersistedAssets();
        await page.click('[data-testid="tool-history-dock-save"]');
        record.saveFeedback = await waitDockFeedback(page, "已存入资产库");
        await page.waitForTimeout(1200);
        const assetsAfter = await readPersistedAssets();
        record.assets = { before: assetsBefore, after: assetsAfter };
        if (record.saveFeedback.tone !== "success") record.issues.push(`存入资产失败：${record.saveFeedback.text}`);
        if (assetsAfter.count <= assetsBefore.count) record.issues.push("存入资产后持久化资产数没有增加");

        const canvasBefore = await page.evaluate(async () => {
            const store = await import("/src/stores/use-canvas-store.ts");
            return store.useCanvasStore.getState().nodes?.length ?? 0;
        }).catch(() => null);
        await page.click('[data-testid="tool-history-dock-canvas"]');
        record.canvasFeedback = await waitDockFeedback(page, "已发送到画布");
        record.canvas = { before: canvasBefore };
        if (record.canvasFeedback.tone !== "success") record.issues.push(`发送画布失败：${record.canvasFeedback.text}`);

        if (spec.toolId === "AREA_REPAIR") {
            // 自有「历史记录」tab：修复后应能点「查看结果」把历史任务回填到结果区，且字节保持一致。
            await page.click('[data-testid="edit8-tab-history"]');
            await page.waitForSelector('[data-testid="tool-task-history"]');
            record.history = { openButtons: await page.locator('[data-testid="tool-task-history-open"]').count() };
            if (record.history.openButtons === 0) {
                record.issues.push("历史记录里没有「查看结果」入口");
            } else {
                await page.locator('[data-testid="tool-task-history-open"]').first().click();
                await page.waitForSelector('[data-testid="area-repair-history-result"]');
                record.history.restore = await page.evaluate(() => {
                    const box = document.querySelector('[data-testid="area-repair-history-result"]');
                    const img = box?.querySelector("img");
                    return {
                        items: box?.querySelectorAll('li[data-testid^="area-repair-history-result-"]').length ?? 0,
                        src: img?.getAttribute("src") ?? "",
                        naturalWidth: img?.naturalWidth ?? 0,
                        naturalHeight: img?.naturalHeight ?? 0,
                        actions: ["download", "save", "send"].map((key) => box?.querySelectorAll(`[data-testid^="area-repair-history-${key}-"]`).length ?? 0),
                    };
                });
                if (record.history.restore.naturalWidth <= 0) record.issues.push("历史回填的结果图没有真实解码");
                if (record.history.restore.actions.some((count) => count === 0)) record.issues.push("历史回填缺少下载/存库/发画布动作");
                const [historyDownload] = await Promise.all([
                    page.waitForEvent("download", { timeout: 60_000 }),
                    page.click('[data-testid="area-repair-history-download-1"]'),
                ]);
                const historyPath = path.join(OUT, "downloads", `${spec.toolId}-history-${historyDownload.suggestedFilename()}`);
                await historyDownload.saveAs(historyPath);
                record.history.download = { fileName: path.basename(historyPath), sha: sha256(await fs.readFile(historyPath)) };
                if (record.history.download.sha !== record.bytes[0].localSha) record.issues.push("历史回填下载的字节与证据不一致");
            }
        }

        await page.screenshot({ path: path.join(OUT, "screenshots", `${spec.toolId}.png`) });
    } catch (error) {
        record.issues.push(`EXCEPTION: ${String(error).slice(0, 400)}`);
        try {
            await page.screenshot({ path: path.join(OUT, "screenshots", `${spec.toolId}-fail.png`) });
        } catch {}
    } finally {
        await context.close();
    }
    return record;
}

async function verifyOwnHistoryTool(browser, spec) {
    const record = { toolId: spec.toolId, panel: "own-history", issues: [] };
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: "zh-CN" });
    const page = await context.newPage();
    try {
        await page.goto(`${BASE}${spec.route}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2500);
        const tasks = [buildTask(spec, 1, Date.now()), buildTask(spec, 2, Date.now())];
        record.seeded = tasks.map((t) => ({ id: t.id, prompt: t.prompt, items: t.result.items.length }));
        await seed(page, tasks);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector('[role="tablist"] [role="tab"]', { timeout: 60_000 });

        await page.locator('[role="tablist"] [role="tab"]', { hasText: "历史记录" }).first().click();
        await page.waitForSelector('[data-testid="tool-task-history"]', { timeout: 30_000 });
        await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-testid="tool-task-history"] img')).every((img) => img.complete), undefined, { timeout: 30_000 });
        record.history = await page.evaluate(() => {
            const root = document.querySelector('[data-testid="tool-task-history"]');
            return {
                countText: root.querySelector('[data-testid="tool-task-history-count"]')?.textContent?.trim() ?? "",
                items: Array.from(root.querySelectorAll('[data-testid="tool-task-history-item"]')).map((n) => ({
                    text: n.textContent.replace(/\s+/g, " ").trim().slice(0, 120),
                    width: n.querySelector("img")?.naturalWidth ?? 0,
                })),
                openButtons: root.querySelectorAll('[data-testid="tool-task-history-open"]').length,
            };
        });
        if (record.history.items.length !== 2) record.issues.push(`历史条目 ${record.history.items.length} ≠ 2`);
        if (!record.history.items.every((item) => item.width > 0)) record.issues.push("历史缩略图未解码");
        if (record.history.openButtons === 0) record.issues.push("历史条目没有「查看结果」入口");

        if (record.history.openButtons > 0) {
            await page.locator('[data-testid="tool-task-history-open"]').first().click();
            await page.waitForTimeout(1500);
            record.restored = await page.evaluate(() => ({
                activeTab: document.querySelector('[role="tablist"] [role="tab"] [aria-selected="true"], [role="tablist"] [role="tab"][aria-selected="true"]')?.textContent?.trim() ?? "",
                images: Array.from(document.querySelectorAll("img")).map((img) => ({ src: img.currentSrc || img.src, width: img.naturalWidth, height: img.naturalHeight })).filter((img) => img.src.includes("23298")),
                actions: Array.from(document.querySelectorAll('[data-testid^="tool-result-"]')).map((n) => n.getAttribute("data-testid")),
            }));
            const restoredImg = record.restored.images[0];
            if (!restoredImg || restoredImg.width === 0) record.issues.push("「查看结果」后结果图未解码");
            record.bytes = [];
            for (const rel of spec.artifacts) {
                const local = await fs.readFile(path.join(EVIDENCE_ROOT, rel));
                const fetched = await fetchSha(page, restoredImg?.src ?? `${MEDIA}/${rel}`);
                const check = { url: `${MEDIA}/${rel}`, localBytes: local.length, localSha: sha256(local), fetched };
                check.match = fetched.sha === check.localSha;
                if (!check.match) record.issues.push(`结果 ${rel} 字节 sha256 不一致`);
                record.bytes.push(check);
            }
            const downloadButton = page.locator('[data-testid="tool-result-download-0"]').first();
            if (await downloadButton.count()) {
                const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), downloadButton.click()]);
                const downloadPath = path.join(OUT, "downloads", `${spec.toolId}-${download.suggestedFilename()}`);
                await download.saveAs(downloadPath);
                const downloaded = await fs.readFile(downloadPath);
                record.download = { fileName: path.basename(downloadPath), bytes: downloaded.length, sha: sha256(downloaded) };
                if (record.download.sha !== record.bytes[0].localSha) record.issues.push("下载文件与证据字节 sha256 不一致");
            } else {
                record.issues.push("结果区没有下载按钮");
            }
            record.resultButtons = await page.evaluate(() =>
                ["download", "save", "canvas"].map((key) => ({
                    key,
                    count: document.querySelectorAll(`[data-testid="tool-result-${key}-0"]`).length,
                    disabled: document.querySelector(`[data-testid="tool-result-${key}-0"]`)?.hasAttribute("disabled") ?? null,
                })),
            );
        }
        await page.screenshot({ path: path.join(OUT, "screenshots", `${spec.toolId}.png`) });
    } catch (error) {
        record.issues.push(`EXCEPTION: ${String(error).slice(0, 400)}`);
        try {
            await page.screenshot({ path: path.join(OUT, "screenshots", `${spec.toolId}-fail.png`) });
        } catch {}
    } finally {
        await context.close();
    }
    return record;
}

async function main() {
    await fs.mkdir(path.join(OUT, "screenshots"), { recursive: true });
    await fs.mkdir(path.join(OUT, "downloads"), { recursive: true });
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const records = [];
    try {
        for (const spec of TOOLS) {
            process.stdout.write(`--- ${spec.toolId} ... `);
            const record = spec.panel === "dock" ? await verifyDockTool(browser, spec) : await verifyOwnHistoryTool(browser, spec);
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
        tools: records.map((record) => ({
            toolId: record.toolId,
            panel: record.panel,
            ok: record.issues.length === 0,
            issues: record.issues,
            bytesMatched: record.bytes?.map((item) => ({ url: item.url, bytes: item.fetched?.bytes, sha: item.fetched?.sha?.slice(0, 16), match: item.match })) ?? [],
            download: record.download ?? null,
        })),
    };
    await fs.writeFile(path.join(OUT, "summary.json"), JSON.stringify({ summary, records }, null, 2));
    console.log(`\nsummary: ${records.filter((r) => r.issues.length === 0).length}/${records.length} OK`);
}
await main();
