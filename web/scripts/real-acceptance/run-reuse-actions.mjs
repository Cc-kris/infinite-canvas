/**
 * PRODUCT_REFINE / CHANGE_COLOR：复用已有真实上游产物，验证「历史记录 / 查看结果 / 存入资产 / 发送画布」。
 *
 * 边界（不重调上游、不 mock）：
 * - 任务快照用**上一轮真实生成**得到的 oss 产物 URL（d7a0de6 / 14584e1 证据里的同一文件），
 *   经应用自身的 `persistTask()` 落盘 → 刷新 → 历史 tab 从 localStorage 读回；
 * - 「存入资产」「发送画布」点的是真实按钮，走真实 image-storage / 资产库 / 画布 store，
 *   浏览器真实网络从 oss 取字节，不经过任何替身；
 * - 本脚本**不提交生成**，因此不会产生新的算力消耗。
 */
import { launchBrowser, BASE_URL, saveEvidence, sleep } from "./lib.mjs";

const TOOLS = [
    {
        toolId: "CHANGE_COLOR",
        route: "/tools/smart-edit/change-color",
        resultUrl: "https://oss-us.dimenoss.com/images/2026/10/28/1793201243_a98f4d7594f17eb48ade22f52e2295cb.png",
        prompt: "一键换色 · 复用真实产物（1024x1024）",
        expectBatchLink: true,
    },
    {
        toolId: "PRODUCT_REFINE",
        route: "/tools/smart-edit/product-refine",
        resultUrl: "https://oss-us.dimenoss.com/images/2026/10/28/1793198997_cabf4ef587e2a79ab532f97043f5b24e.png",
        prompt: "商品精修 · 复用真实产物（2048x1488）",
        expectBatchLink: false,
    },
];

async function verifyTool(browser, spec) {
    const context = await browser.newContext({ viewport: { width: 1512, height: 950 }, locale: "zh-CN" });
    const page = await context.newPage();
    const record = { toolId: spec.toolId, route: spec.route, resultUrl: spec.resultUrl, issues: [] };

    await page.goto(`${BASE_URL}${spec.route}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[role="tablist"][aria-label="结果区"]', { timeout: 60_000 });

    record.tabs = await page.$$eval('[role="tablist"][aria-label="结果区"] [role="tab"]', (nodes) =>
        nodes.map((node) => ({ text: node.textContent?.trim() ?? "", selected: node.getAttribute("aria-selected") })),
    );
    record.libraryEntry = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
            从资产库选择: text.includes("从资产库选择"),
            资产库条目: document.querySelectorAll("details li button").length,
        };
    });
    record.batchLink = await page.evaluate(() => {
        const link = document.querySelector('[data-testid="change-color-batch-link"]');
        return link ? { text: link.textContent?.trim(), href: link.getAttribute("href") } : null;
    });
    if (spec.expectBatchLink && !record.batchLink) record.issues.push("缺少「批量一键换色」入口");

    // --- 1) 历史 tab 空态（全新 context，落盘为空）---
    await page.click('[role="tablist"] [role="tab"]:nth-child(2)');
    record.historyEmpty = await page.evaluate(() => {
        const node = document.querySelector('[data-testid="tool-task-history-empty"]');
        return node ? node.textContent?.trim() : null;
    });
    if (!record.historyEmpty) record.issues.push("历史 tab 未显示空态提示");

    // --- 2) 用应用自身的持久化函数写入真实产物快照 ---
    const taskId = `task-reuse-${spec.toolId}-${Date.now()}`;
    await page.evaluate(
        async ({ task, taskId }) => {
            const store = await import("/src/stores/use-tool-task-store.ts");
            store.persistTask(task);
            store.useToolTaskStore.setState({
                tasks: { ...store.useToolTaskStore.getState().tasks, [taskId]: task },
                hydrated: true,
            });
        },
        {
            taskId,
            task: {
                id: taskId,
                toolId: spec.toolId,
                capability: "image",
                status: "succeeded",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                prompt: spec.prompt,
                configSnapshot: { model: "gpt-image-2", aspectRatio: "1:1" },
                result: {
                    items: [
                        {
                            id: `${taskId}-item-0`,
                            kind: "image",
                            url: spec.resultUrl,
                            mimeType: "image/png",
                        },
                    ],
                },
                reusedFrom: "d7a0de6/14584e1 real upstream artifact",
            },
        },
    );

    // --- 3) 刷新：历史必须从 localStorage 恢复 ---
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[role="tablist"][aria-label="结果区"]', { timeout: 60_000 });
    await page.click('[role="tablist"] [role="tab"]:nth-child(2)');
    await page.waitForSelector('[data-testid="tool-task-history-item"]', { timeout: 20_000 });
    // 等缩略图真正解码完再读数，避免 complete=false / naturalWidth=0 的假失败
    await page
        .waitForFunction(
            () => {
                const img = document.querySelector('[data-testid="tool-task-history-item"] img');
                return Boolean(img && img.complete && img.naturalWidth > 0);
            },
            { timeout: 30_000 },
        )
        .catch(() => undefined);
    record.history = await page.evaluate(() => ({
        count: document.querySelectorAll('[data-testid="tool-task-history-item"]').length,
        firstText: document.querySelector('[data-testid="tool-task-history-item"]')?.textContent?.trim() ?? "",
        thumbs: Array.from(document.querySelectorAll('[data-testid="tool-task-history-item"] img')).map((img) => ({
            src: img.getAttribute("src"),
            naturalWidth: img.naturalWidth,
            complete: img.complete,
        })),
        hasOpen: Boolean(document.querySelector('[data-testid="tool-task-history-open"]')),
    }));
    if (record.history.count < 1) record.issues.push("刷新后历史列表为空（持久化未恢复）");
    if (!record.history.hasOpen) record.issues.push("历史条目缺少「查看结果」");
    const thumb = record.history.thumbs[0];
    if (!thumb || thumb.naturalWidth < 200) record.issues.push(`历史缩略图未真实加载：${JSON.stringify(thumb)}`);

    await page.screenshot({ path: `${process.cwd()}/.tmp-history.png` }).catch(() => undefined);

    // --- 4) 查看结果 → 真实结果区 ---
    await page.click('[data-testid="tool-task-history-open"]');
    await page.waitForSelector('[data-testid="tool-result-image"]', { timeout: 30_000 });
    await page
        .waitForFunction(
            () => {
                const img = document.querySelector('[data-testid="tool-result-image"]');
                return Boolean(img && img.complete && img.naturalWidth > 0);
            },
            { timeout: 30_000 },
        )
        .catch(() => undefined);
    record.resultImage = await page.evaluate(() => {
        const img = document.querySelector('[data-testid="tool-result-image"]');
        return img ? { src: img.getAttribute("src"), naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight } : null;
    });
    if (!record.resultImage || record.resultImage.naturalWidth < 200) record.issues.push("查看结果后未渲染真实结果图");

    // --- 5) 存入资产 ---
    const assetsBefore = await page.evaluate(async () => {
        const mod = await import("/src/stores/use-asset-store.ts");
        return mod.useAssetStore.getState().assets.length;
    });
    await page.click('[data-testid="tool-result-save-0"]');
    await page.waitForSelector('[data-testid="tool-result-feedback"]', { timeout: 60_000 });
    record.saveFeedback = await page.evaluate(() => document.querySelector('[data-testid="tool-result-feedback"]')?.textContent?.trim());
    const assetsAfter = await page.evaluate(async () => {
        const mod = await import("/src/stores/use-asset-store.ts");
        return mod.useAssetStore.getState().assets.length;
    });
    record.assets = { before: assetsBefore, after: assetsAfter };
    if (assetsAfter <= assetsBefore) record.issues.push("存入资产后资产库数量未增加");

    // 资产库有图后，「从作品库选择」入口必须出现（这是原站的作品库入口对齐点）
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[role="tablist"][aria-label="结果区"]', { timeout: 60_000 });
    await sleep(1500);
    record.libraryEntryAfterSave = await page.evaluate(() => {
        const details = Array.from(document.querySelectorAll("details")).find((node) =>
            (node.querySelector("summary")?.textContent ?? "").includes("从资产库选择"),
        );
        return {
            summary: details?.querySelector("summary")?.textContent?.trim() ?? null,
            items: details ? details.querySelectorAll("li").length : 0,
        };
    });
    if (!record.libraryEntryAfterSave.summary) record.issues.push("资产库有图后仍未出现「从资产库选择」入口");

    // 真实采用一张资产：展开 → 点「使用」→ 素材真的进了草稿列表
    if (record.libraryEntryAfterSave.summary) {
        await page.evaluate(() => {
            const details = Array.from(document.querySelectorAll("details")).find((node) =>
                (node.querySelector("summary")?.textContent ?? "").includes("从资产库选择"),
            );
            details?.setAttribute("open", "true");
        });
        const adopt = page.locator("details li button", { hasText: "使用" }).first();
        const enabled = await adopt.isEnabled().catch(() => false);
        if (!enabled) record.issues.push("「使用」按钮不可用（素材类型与输入约束不匹配）");
        await adopt.click();
        await page
            .waitForFunction(() => document.querySelectorAll('[data-testid="tool-asset-list"] li').length > 0, { timeout: 25_000 })
            .catch(() => undefined);
        record.libraryAdopt = await page.evaluate(() => ({
            draftItems: document.querySelectorAll('[data-testid="tool-asset-list"] li').length,
            thumbs: Array.from(document.querySelectorAll('[data-testid="tool-asset-list"] img'))
                .map((img) => img.getAttribute("src"))
                .slice(0, 2),
        }));
        if (record.libraryAdopt.draftItems < 1) record.issues.push("点「使用」后草稿里没有出现该素材");
    }

    // 回到结果态，供后续「发送画布」点击
    await page.click('[role="tablist"] [role="tab"]:nth-child(2)');
    await page.waitForSelector('[data-testid="tool-task-history-open"]', { timeout: 20_000 });
    await page.click('[data-testid="tool-task-history-open"]');
    await page.waitForSelector('[data-testid="tool-result-canvas-0"]', { timeout: 30_000 });

    // --- 6) 发送画布 ---
    const projectsBefore = await page.evaluate(async () => {
        const mod = await import("/src/stores/canvas/use-canvas-store.ts");
        const projects = mod.useCanvasStore.getState().projects;
        return projects.map((project) => ({ id: project.id, nodes: (project.nodes ?? []).length }));
    });
    await page.click('[data-testid="tool-result-canvas-0"]');
    await page.waitForFunction(
        () => {
            const node = document.querySelector('[data-testid="tool-result-feedback"]');
            return Boolean(node && node.textContent && (node.textContent.includes("画布") || node.textContent.includes("失败")));
        },
        { timeout: 90_000 },
    );
    record.canvasFeedback = await page.evaluate(() => document.querySelector('[data-testid="tool-result-feedback"]')?.textContent?.trim());
    const projectsAfter = await page.evaluate(async () => {
        const mod = await import("/src/stores/canvas/use-canvas-store.ts");
        const projects = mod.useCanvasStore.getState().projects;
        return projects.map((project) => ({ id: project.id, nodes: (project.nodes ?? []).length }));
    });
    record.canvas = { before: projectsBefore, after: projectsAfter };
    const totalBefore = projectsBefore.reduce((sum, project) => sum + project.nodes, 0);
    const totalAfter = projectsAfter.reduce((sum, project) => sum + project.nodes, 0);
    if (totalAfter <= totalBefore) record.issues.push("发送画布后画布节点数未增加");

    record.screenshot = `reuse-${spec.toolId}.png`;
    await saveEvidence(spec.toolId, record, { page, shotName: "reuse-actions" });
    await context.close();
    return record;
}

const browser = await launchBrowser({ headless: true });
const out = {};
try {
    for (const spec of TOOLS) {
        out[spec.toolId] = await verifyTool(browser, spec);
        const rec = out[spec.toolId];
        console.log(
            JSON.stringify(
                {
                    toolId: spec.toolId,
                    tabs: rec.tabs,
                    libraryEntry: rec.libraryEntry,
                    libraryEntryAfterSave: rec.libraryEntryAfterSave,
                    libraryAdopt: rec.libraryAdopt,
                    batchLink: rec.batchLink,
                    history: rec.history,
                    resultImage: rec.resultImage,
                    saveFeedback: rec.saveFeedback,
                    assets: rec.assets,
                    canvasFeedback: rec.canvasFeedback,
                    canvas: rec.canvas,
                    issues: rec.issues,
                },
                null,
                2,
            ),
        );
    }
} finally {
    await browser.close();
}
await sleep(0);
