/**
 * B5 真实 UI 验收：17 个工具的页面级共享历史面板（ToolHistoryDock）。
 *
 * 边界（不 mock 上游、不新造结果）：
 * - 结果 URL 指向**本仓库既有真实产物的字节**：evidence/real-acceptance/<TOOL>/ 下的
 *   上一轮真实 provider 调用产物，由 serve-evidence.py 以 127.0.0.1:23298 只读暴露；
 * - 任务快照经应用自身的 `persistTask()` 落盘 → 刷新 → 面板必须从 localStorage 读回；
 * - 「下载 / 存入资产 / 发送到画布 / 复制配置」点的是真实按钮，走真实存储与画布模块。
 *
 * 产出：evidence/real-acceptance/B5_HISTORY_DOCK/{summary.json, screenshots/}
 */
import { chromium } from "playwright";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const MEDIA = process.env.IC_EVIDENCE_MEDIA || "http://127.0.0.1:23298";
const OUT = path.resolve(HERE, "../../../docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/B5_HISTORY_DOCK");

const VIDEO_ARTIFACT = "IMAGE_TO_VIDEO/06-result-video.mp4";

/** 每个工具用它自己那一轮真实产物的字节做快照（toolId → evidence 相对路径）。 */
const TOOLS = [
    { toolId: "AI_TEXT", route: "/tools/product-design/ai-text", artifacts: ["AI_TEXT/03-after-provider.png"] },
    { toolId: "ORNAMENT_TEXT", route: "/tools/product-design/ornament-text", artifacts: ["ORNAMENT_TEXT/02-result.png"] },
    { toolId: "SDS_DESIGN", route: "/tools/product-design/sds-design", artifacts: ["SDS_DESIGN/02-result.png"] },
    { toolId: "SCENE_TRANSFER", route: "/tools/product-design/scene-transfer", artifacts: ["FISSION_LINK/03-upstream-result.png"] },
    { toolId: "AI_DRESSING_V2", route: "/tools/product-design/ai-dressing-v2", artifacts: ["AI_DRESSING_V2/result1.png"] },
    { toolId: "AI_DRESSING_XSY", route: "/tools/product-design/ai-dressing-xsy", artifacts: ["AI_DRESSING_XSY/02-result.png"] },
    { toolId: "AI_POSE_GENERATOR", route: "/tools/product-design/ai-pose-generator", artifacts: ["AI_POSE_GENERATOR/real-run-1024.png"] },
    { toolId: "AI_POSTURE", route: "/tools/product-design/ai-posture", artifacts: ["AI_POSTURE/result1.png"] },
    { toolId: "AI_WEARABLE", route: "/tools/product-design/ai-wearable", artifacts: ["AI_WEARABLE/result1.png"] },
    { toolId: "FISSION_LINK", route: "/tools/product-design/fission-link", artifacts: ["FISSION_LINK/03-upstream-result.png"] },
    { toolId: "NEW_REPLACE_BG_V2", route: "/tools/product-design/new-replace-bg-v2", artifacts: ["NEW_REPLACE_BG_V2/result1.png"] },
    { toolId: "HANDHELD_GOODS", route: "/tools/product-design/handheld-goods", artifacts: ["HANDHELD_GOODS/result.png"] },
    { toolId: "MATERIAL_UPPER_BODY", route: "/tools/product-design/material-upper-body", artifacts: ["MATERIAL_UPPER_BODY/real-run-1024.png"] },
    { toolId: "CHANGE_COLOR_V2", route: "/tools/ecommerce-suite/change-color-v2", artifacts: ["CHANGE_COLOR_V2/05-unit1-result.png"] },
    { toolId: "SCALE_UP", route: "/tools/ecommerce-suite/scale-up", artifacts: ["SCALE_UP/05-downloaded.png"] },
    { toolId: "PRODUCT_IMAGE_SUITE", route: "/tools/ecommerce-suite/product-image-suite", artifacts: ["PRODUCT_IMAGE_SUITE/02-result.png"] },
    { toolId: "DRESS_WEAR_SET", route: "/tools/ecommerce-suite/dress-wear-set", artifacts: ["DRESS_WEAR_SET/result.png"] },
    { toolId: "IMAGE_TRANSLATION", route: "/tools/ecommerce-suite/image-translation", artifacts: ["IMAGE_TRANSLATION/result.png"] },
    { toolId: "AI_VIDEO_EDITING", route: "/tools/ai-video/ai-video-editing", artifacts: [VIDEO_ARTIFACT], kind: "video" },
    { toolId: "SALE_VIDEO", route: "/tools/ai-video/sale-video", artifacts: [VIDEO_ARTIFACT], kind: "video" },
];

/** 已自带「历史记录」tab 的工具：页面级 Dock 必须不出现（避免双份历史）。 */
const TOOLS_WITH_OWN_HISTORY = [
    { toolId: "PRODUCT_REFINE", route: "/tools/smart-edit/product-refine" },
];

function mediaUrl(rel) {
    return `${MEDIA}/${rel}`;
}

function buildTask(spec, kindOfTask, index) {
    const now = Date.now();
    const base = {
        id: `b5-${spec.toolId}-${kindOfTask}-${index}-${now}`,
        toolId: spec.toolId,
        capability: spec.kind === "video" ? "video" : "image",
        createdAt: now - index * 60_000,
        updatedAt: now - index * 60_000,
        configSnapshot: {
            model: "gpt-image-2",
            aspectRatio: spec.kind === "video" ? "16:9" : "1:1",
            count: 1,
            reusedFrom: spec.artifacts[0],
        },
        sourceAssetIds: [`src-${spec.toolId.toLowerCase()}-1`],
    };
    if (kindOfTask === "succeeded") {
        return {
            ...base,
            status: "succeeded",
            prompt: `${spec.toolId} · 复用真实产物（${spec.artifacts[0]}）`,
            result: {
                items: spec.artifacts.map((rel, i) => ({
                    id: `${base.id}-item-${i}`,
                    kind: spec.kind === "video" ? "video" : "image",
                    url: mediaUrl(rel),
                    mimeType: spec.kind === "video" ? "video/mp4" : "image/png",
                })),
            },
        };
    }
    return {
        ...base,
        status: "failed",
        prompt: `${spec.toolId} · 失败任务（验证错误不被吞）`,
        error: { code: "upstream_5xx", message: "上游 502 Bad Gateway（历史面板需展示真实错误）", retryable: true },
    };
}

async function seed(page, spec) {
    const tasks = [
        buildTask(spec, "succeeded", 1),
        buildTask(spec, "succeeded", 2),
        buildTask(spec, "failed", 0),
    ];
    await page.evaluate(async (list) => {
        const store = await import("/src/stores/use-tool-task-store.ts");
        const merged = { ...store.useToolTaskStore.getState().tasks };
        for (const task of list) {
            store.persistTask(task);
            merged[task.id] = task;
        }
        store.useToolTaskStore.setState({ tasks: merged, hydrated: true });
    }, tasks);
    return tasks;
}

async function readDock(page) {
    return page.evaluate(() => {
        const dock = document.querySelector('[data-testid="tool-history-dock"]');
        if (!dock) return null;
        const items = Array.from(dock.querySelectorAll('[data-testid="tool-history-dock-item"]')).map((node) => ({
            taskId: node.getAttribute("data-task-id"),
            status: node.getAttribute("data-task-status"),
            time: node.querySelector('[data-testid="tool-history-dock-time"]')?.textContent?.trim() ?? "",
            summary: node.querySelector('[data-testid="tool-history-dock-summary"]')?.textContent?.trim() ?? "",
            badge: node.querySelector('[data-testid="tool-history-dock-video-badge"]')?.textContent?.trim() ?? "",
        }));
        const thumbs = Array.from(dock.querySelectorAll("img")).map((img) => ({
            src: img.getAttribute("src") ?? "",
            decoded: img.complete && img.naturalWidth > 0,
            naturalWidth: img.naturalWidth,
        }));
        const video = Array.from(dock.querySelectorAll("video")).map((node) => ({
            src: node.getAttribute("src") ?? "",
        }));
        return {
            countText: dock.querySelector('[data-testid="tool-history-dock-count"]')?.textContent?.trim() ?? "",
            empty: dock.querySelector('[data-testid="tool-history-dock-empty"]')?.textContent?.trim() ?? null,
            items,
            thumbs,
            video,
        };
    });
}

async function waitFeedback(page, prefix, timeout = 45_000) {
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

async function verifyTool(browser, spec) {
    const record = { toolId: spec.toolId, route: spec.route, artifacts: spec.artifacts, issues: [], steps: {} };
    const context = await browser.newContext({
        viewport: { width: 1512, height: 950 },
        locale: "zh-CN",
        acceptDownloads: true,
    });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    try {
        await page.goto(`${BASE}${spec.route}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector('[data-testid="tool-history-dock"]', { timeout: 60_000 });

        // 1) 空态（全新 context，localStorage 为空）
        record.steps.initial = await readDock(page);
        if (!record.steps.initial?.empty) record.issues.push("全新会话下没有渲染空态");

        // 2) 用应用自身 persistTask 落盘 3 条真实快照（2 成功 + 1 失败）
        const seeded = await seed(page, spec);
        record.seededTaskIds = seeded.map((task) => task.id);

        // 3) 刷新：面板必须从 localStorage 读回
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector('[data-testid="tool-history-dock-item"]', { timeout: 30_000 });
        await page.waitForFunction(
            () => {
                const dock = document.querySelector('[data-testid="tool-history-dock"]');
                if (!dock) return false;
                const imgs = Array.from(dock.querySelectorAll("img"));
                if (imgs.length === 0) return true;
                return imgs.every((img) => img.complete);
            },
            undefined,
            { timeout: 30_000 },
        );
        record.steps.afterReload = await readDock(page);
        const reloaded = record.steps.afterReload;
        if (reloaded.items.length !== 3) record.issues.push(`刷新后条目数 ${reloaded.items.length} ≠ 3`);
        if (reloaded.countText !== "3 条") record.issues.push(`面板计数文本为 ${reloaded.countText}，期望 3 条`);
        if (spec.kind === "video" && !reloaded.items.some((item) => String(item.badge ?? "").includes("视频结果"))) {
            record.issues.push("视频任务折叠行没有视频徽标");
        }
        if (reloaded.items[0]?.status !== "failed") record.issues.push("条目未按时间倒序（最新应为 failed）");
        if (reloaded.thumbs.length && !reloaded.thumbs.every((thumb) => thumb.decoded)) {
            record.issues.push("缩略图未真正解码（naturalWidth=0）");
        }


        // 4) 展开最新的成功任务，检查配置快照与来源素材
        const succeededId = reloaded.items.find((item) => item.status === "succeeded")?.taskId;
        const toggle = page.locator(`[data-testid="tool-history-dock-item"][data-task-id="${succeededId}"] [data-testid="tool-history-dock-toggle"]`);
        await toggle.click();
        await page.waitForSelector('[data-testid="tool-history-dock-detail"]', { timeout: 15_000 });
        record.steps.detail = await page.evaluate(() => {
            const detail = document.querySelector('[data-testid="tool-history-dock-detail"]');
            return {
                config: detail?.querySelector('[data-testid="tool-history-dock-config"]')?.textContent?.trim() ?? "",
                sources: detail?.querySelector('[data-testid="tool-history-dock-sources"]')?.textContent?.trim() ?? "",
                results: detail?.querySelectorAll('[data-testid="tool-history-dock-result"]').length ?? 0,
                videos: detail?.querySelectorAll("video").length ?? 0,
                actions: {
                    download: detail?.querySelectorAll('[data-testid="tool-history-dock-download"]').length ?? 0,
                    save: detail?.querySelectorAll('[data-testid="tool-history-dock-save"]').length ?? 0,
                    canvas: detail?.querySelectorAll('[data-testid="tool-history-dock-canvas"]').length ?? 0,
                },
            };
        });
        if (!record.steps.detail.config.includes("gpt-image-2")) record.issues.push("配置快照没显示真实模型字段");
        if (!record.steps.detail.sources) record.issues.push("输入素材没有展示");
        if (record.steps.detail.results < 1) record.issues.push("明细里没有结果项");
        if (spec.kind === "video" && record.steps.detail.videos < 1) record.issues.push("视频结果在明细里没有渲染 <video>");
        if (Object.values(record.steps.detail.actions).some((n) => n < 1)) record.issues.push("结果项缺少下载/存资产/发画布按钮");

        // 5) 复制配置（真实剪贴板）
        await page.click('[data-testid="tool-history-dock-copy-config"]');
        record.steps.copyFeedback = await waitFeedback(page, "配置", 20_000);
        record.steps.clipboard = await page.evaluate(async () => {
            try {
                return await navigator.clipboard.readText();
            } catch (error) {
                return `READ_FAILED: ${String(error)}`;
            }
        });
        try {
            const payload = JSON.parse(record.steps.clipboard);
            record.steps.clipboardTask = { toolId: payload.toolId, hasConfig: Boolean(payload.configSnapshot), hasPrompt: Boolean(payload.prompt) };
            if (record.steps.clipboardTask.toolId !== spec.toolId) record.issues.push("复制的配置 toolId 不匹配");
            if (!record.steps.clipboardTask.hasConfig) record.issues.push("复制的配置里没有 configSnapshot");
        } catch {
            record.issues.push("剪贴板内容不是可解析的 JSON 配置");
        }

        // 6) 下载真实产物
        const [download] = await Promise.all([
            page.waitForEvent("download", { timeout: 60_000 }),
            page.click('[data-testid="tool-history-dock-download"]'),
        ]);
        const downloadPath = path.join(OUT, "downloads", `${spec.toolId}-${download.suggestedFilename()}`);
        await download.saveAs(downloadPath);
        record.steps.download = { fileName: path.basename(downloadPath), bytes: (await stat(downloadPath)).size };
        if (record.steps.download.bytes < 1024) record.issues.push("下载文件字节过小，疑似空文件");

        // 7) 存入资产库
        await page.click('[data-testid="tool-history-dock-save"]');
        record.steps.saveFeedback = await waitFeedback(page, "已存入资产库", 90_000);
        if (record.steps.saveFeedback.tone !== "success") record.issues.push(`存入资产失败：${record.steps.saveFeedback.text}`);

        // 8) 发送到画布
        await page.click('[data-testid="tool-history-dock-canvas"]');
        record.steps.canvasFeedback = await waitFeedback(page, "已发送到画布", 90_000);
        if (record.steps.canvasFeedback.tone !== "success") record.issues.push(`发送画布失败：${record.steps.canvasFeedback.text}`);

        // 9) 失败任务：展开后必须显示真实错误原因
        const failedId = reloaded.items.find((item) => item.status === "failed")?.taskId;
        await page.locator(`[data-testid="tool-history-dock-item"][data-task-id="${failedId}"] [data-testid="tool-history-dock-toggle"]`).click();
        record.steps.errorText = await page
            .locator(`[data-testid="tool-history-dock-item"][data-task-id="${failedId}"] [data-testid="tool-history-dock-error"]`)
            .textContent();
        if (!record.steps.errorText?.includes("502")) record.issues.push("失败任务没有展示真实错误信息");

        await page.screenshot({ path: path.join(OUT, "screenshots", `${spec.toolId}.png`), fullPage: false });
    } catch (error) {
        record.issues.push(`EXCEPTION: ${String(error).slice(0, 400)}`);
        try {
            await page.screenshot({ path: path.join(OUT, "screenshots", `${spec.toolId}-fail.png`) });
        } catch {}
    } finally {
        record.consoleErrors = consoleErrors.slice(0, 5);
        await context.close();
    }
    return record;
}

async function verifyNoDuplicateDock(browser, spec) {
    const context = await browser.newContext({ viewport: { width: 1512, height: 950 }, locale: "zh-CN" });
    const page = await context.newPage();
    const record = { toolId: spec.toolId, route: spec.route, issues: [] };
    try {
        await page.goto(`${BASE}${spec.route}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector('[role="tablist"][aria-label="结果区"]', { timeout: 60_000 });
        record.dockCount = await page.locator('[data-testid="tool-history-dock"]').count();
        record.ownHistoryTab = await page.locator('[role="tablist"][aria-label="结果区"] [role="tab"]').allInnerTexts();
        if (record.dockCount !== 0) record.issues.push("自带历史的工具上仍挂载了页面级 Dock");
    } catch (error) {
        record.issues.push(`EXCEPTION: ${String(error).slice(0, 300)}`);
    } finally {
        await context.close();
    }
    return record;
}

async function main() {
    await mkdir(path.join(OUT, "screenshots"), { recursive: true });
    await mkdir(path.join(OUT, "downloads"), { recursive: true });
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const only = (process.env.IC_ONLY || "").split(",").filter(Boolean);
    const specs = only.length ? TOOLS.filter((item) => only.includes(item.toolId)) : TOOLS;
    const results = [];
    try {
        for (const spec of specs) {
            process.stdout.write(`--- ${spec.toolId} ... `);
            const record = await verifyTool(browser, spec);
            results.push(record);
            console.log(record.issues.length === 0 ? "OK" : `ISSUES(${record.issues.length})`);
            for (const issue of record.issues) console.log(`      ! ${issue}`);
        }
        const duplicates = [];
        for (const spec of TOOLS_WITH_OWN_HISTORY) {
            const record = await verifyNoDuplicateDock(browser, spec);
            duplicates.push(record);
            console.log(`--- ${spec.toolId} (自带历史) dock=${record.dockCount} ${record.issues.length ? "ISSUE" : "OK"}`);
        }
        const summary = {
            generatedAt: new Date().toISOString(),
            baseUrl: BASE,
            artifactSource: "既有真实产物字节（evidence/real-acceptance/<TOOL>/，经 127.0.0.1:23298 只读暴露）；任务快照经应用自身 persistTask 落盘",
            totalTools: TOOLS.length,
            passed: results.filter((r) => r.issues.length === 0).length,
            failed: results.filter((r) => r.issues.length > 0).map((r) => r.toolId),
            results,
            ownHistoryTools: duplicates,
        };
        await writeFile(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
        console.log(`\n=== ${summary.passed}/${summary.totalTools} 工具通过，失败：${summary.failed.join(",") || "无"}`);
    } finally {
        await browser.close();
    }
}

await main();
