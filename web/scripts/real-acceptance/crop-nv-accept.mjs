/** IMAGE_CROP 非视觉维度实测：真实上传→裁剪→下载/存资产/发画布→刷新复用检查。 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { launchBrowser, BASE_URL, EVIDENCE_ROOT, sleep } from "./lib.mjs";

const FIXTURE = path.resolve("scripts/real-acceptance/fixtures/product-watch.jpg");
const OUT = path.join(EVIDENCE_ROOT, "IMAGE_CROP");
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

const storeUrl = (page, frag) =>
    page.evaluate((f) => performance.getEntriesByType("resource").map((e) => e.name).find((u) => u.includes(f)) ?? null, frag);

async function shopState(page, frag, expr) {
    const url = await storeUrl(page, frag);
    return page.evaluate(async ({ url, expr }) => {
        const mod = await import(url);
        // eslint-disable-next-line no-new-func
        return new Function("mod", `return (${expr})(mod);`)(mod);
    }, { url: url ?? frag, expr });
}

const browser = await launchBrowser({ headless: true });
const context = await browser.newContext({ viewport: { width: 1512, height: 950 }, locale: "zh-CN", acceptDownloads: true });
const page = await context.newPage();
const rec = { toolId: "IMAGE_CROP", at: new Date().toISOString(), issues: [] };
try {
    await page.goto(`${BASE_URL}/tools/smart-edit/image-crop`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="crop-workspace"]', { timeout: 60_000 });
    await sleep(800);
    rec.localDefaults = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="crop-workspace"]');
        const pick = (el) => ({
            testid: el.getAttribute("data-testid"),
            type: el.type ?? el.tagName.toLowerCase(),
            value: el.type === "checkbox" || el.type === "radio" ? el.checked : el.value,
            pressed: el.getAttribute("aria-pressed"),
            disabled: el.disabled ?? null,
            min: el.min ?? null,
            max: el.max ?? null,
            step: el.step ?? null,
        });
        return [...root.querySelectorAll("input, select, [aria-pressed]")].map(pick);
    });
    // 1) 真实上传
    await page.setInputFiles('[data-testid="tool-asset-file-input"]', FIXTURE);
    await page.waitForSelector('[data-testid="crop-canvas"]', { timeout: 60_000 });
    // 「开始裁剪」按原站布局收进工具条「更多」弹层（默认不占主流程），先展开再等可用。
    await page.click('[data-testid="crop-more"]');
    await page.waitForSelector('[data-testid="crop-more-panel"]', { timeout: 10_000 });
    await page.waitForFunction(() => {
        const b = document.querySelector('[data-testid="crop-submit"]');
        return b && !b.disabled;
    }, { timeout: 60_000 });
    rec.source = await page.evaluate(() => ({
        summary: document.querySelector('[data-testid="crop-output-summary"]')?.textContent?.trim() ?? null,
        canvasBox: (() => { const r = document.querySelector('[data-testid="crop-canvas"]').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
    }));
    rec.afterUpload = await page.evaluate(() => ({
        width: document.querySelectorAll('input[type=number]')[0]?.value ?? null,
        height: document.querySelectorAll('input[type=number]')[1]?.value ?? null,
        locked: (() => { const b = document.querySelector('[data-testid="crop-lock-ratio"]'); return b ? b.getAttribute("aria-pressed") ?? b.className : null; })(),
        tabPressed: [...document.querySelectorAll('[data-testid^="crop-tab-"]')].map((b) => ({ t: b.textContent.trim(), p: b.getAttribute("aria-pressed") })),
        platformPressed: [...document.querySelectorAll('[data-testid^="crop-platform-"]')].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent.trim()),
        format: document.querySelector('[data-testid="crop-format"]')?.value ?? null,
    }));
    // 2) 真实裁剪
    await page.click('[data-testid="crop-submit"]');
    await page.waitForSelector('[data-testid="tool-result-item-0"] img', { timeout: 90_000 });
    await page.waitForFunction(() => {
        const img = document.querySelector('[data-testid="tool-result-item-0"] img');
        return img && img.complete && img.naturalWidth > 0;
    }, { timeout: 90_000 });
    rec.submitted = await page.evaluate(() => {
        const img = document.querySelector('[data-testid="tool-result-item-0"] img');
        return {
            src: (img.getAttribute("src") || "").slice(0, 60),
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            taskText: document.querySelector('[data-testid="tool-result-item-0"]')?.textContent?.replace(/\s+/g, " ").trim().slice(0, 160) ?? "",
        };
    });
    // 3) 真实下载（字节 + sha256 + 解码尺寸）
    const assetsBefore = await shopState(page, "use-asset-store.ts", "(m)=>m.useAssetStore.getState().assets.length");
    const projectsBefore = await shopState(page, "use-canvas-store.ts", "(m)=>m.useCanvasStore.getState().projects.map((p)=>({id:p.id,nodes:(p.nodes||[]).length}))");
    const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 90_000 }),
        page.click('[data-testid="tool-result-download-0"]'),
    ]);
    const savedAs = path.join(OUT, "download-action.png");
    await download.saveAs(savedAs);
    const buf = await fs.readFile(savedAs);
    rec.download = { suggestedFilename: download.suggestedFilename(), bytes: buf.length, sha256: sha256(buf) };

    // 4) 存入资产
    await page.click('[data-testid="tool-result-save-0"]');
    await page.waitForFunction((n) => document.querySelectorAll("[data-testid='tool-result-item-0']").length === n, 1, { timeout: 30_000 }).catch(() => undefined);
    await sleep(2500);
    const assetsAfter = await shopState(page, "use-asset-store.ts", "(m)=>m.useAssetStore.getState().assets");
    rec.assets = {
        before: assetsBefore,
        after: assetsAfter.length,
        newest: assetsAfter.slice(-1).map((a) => ({ id: a.id, kind: a.kind, title: a.title, bytes: a.data?.bytes ?? null, width: a.data?.width ?? null, height: a.data?.height ?? null })),
        feedback: await page.evaluate(() => document.body.innerText.match(/已保存到资产库（[^）]+）/)?.[0] ?? null),
    };

    // 5) 发送到画布
    await page.click('[data-testid="tool-result-canvas-0"]');
    await sleep(2500);
    const projectsAfter = await shopState(page, "use-canvas-store.ts", "(m)=>m.useCanvasStore.getState().projects.map((p)=>({id:p.id,nodes:(p.nodes||[]).length}))");
    rec.canvas = {
        before: projectsBefore,
        after: projectsAfter,
        feedback: await page.evaluate(() => document.body.innerText.match(/已发送到画布（[^）]+）/)?.[0] ?? null),
    };

    // 6) 刷新 → 结果/历史是否复用
    const taskCount = await shopState(page, "use-tool-task-store.ts", "(m)=>Object.keys(m.useToolTaskStore.getState().tasks||{}).filter((k)=>m.useToolTaskStore.getState().tasks[k].toolId==='IMAGE_CROP').length");
    await page.screenshot({ path: path.join(OUT, "nv-crop-actions.png") });
    rec.taskStore = { cropTasksBeforeReload: taskCount };

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="crop-workspace"]', { timeout: 60_000 });
    await sleep(3000);
    rec.afterReload = await page.evaluate(() => ({
        sourceRestored: Boolean(document.querySelector('[data-testid="crop-canvas"]')),
        outputSummary: document.querySelector('[data-testid="crop-output-summary"]')?.textContent?.trim() ?? null,
        resultVisible: Boolean(document.querySelector('[data-testid="tool-result-item-0"]')),
        resultTabs: [...document.querySelectorAll('[role="tablist"][aria-label="结果区"] [role="tab"]')].map((t) => t.textContent.trim()),
        historyItems: document.querySelectorAll('[data-testid="tool-task-history-item"]').length,
        downloadButtons: document.querySelectorAll('[data-testid^="tool-result-download-"]').length,
    }));
    rec.taskStore.afterReloadCropTasks = await shopState(page, "use-tool-task-store.ts", "(m)=>Object.keys(m.useToolTaskStore.getState().tasks||{}).filter((k)=>m.useToolTaskStore.getState().tasks[k].toolId==='IMAGE_CROP').map((k)=>({id:k,status:m.useToolTaskStore.getState().tasks[k].status,items:(m.useToolTaskStore.getState().tasks[k].result?.items||[]).length}))");
    rec.storeAssetsAfterReload = await shopState(page, "use-asset-store.ts", "(m)=>m.useAssetStore.getState().assets.map((a)=>({id:a.id,bytes:a.data?.bytes??null,w:a.data?.width??null,h:a.data?.height??null}))");
    if (!rec.afterReload.resultVisible) rec.issues.push("刷新后裁剪结果未复用（页面无结果项）");
    rec.afterReload.historyNote = rec.afterReload.historyItems === 0 ? "裁剪页无历史列表 UI（仅恢复草稿+源图，结果任务不回流）" : "有历史条目";
    await fs.writeFile(path.join(OUT, "run-nv.json"), JSON.stringify(rec, null, 2));
} catch (error) {
    rec.issues.push(`运行中断：${String(error).slice(0, 200)}`);
    await fs.writeFile(path.join(OUT, "run-nv.json"), JSON.stringify(rec, null, 2));
} finally {
    await browser.close();
}
console.log(JSON.stringify({ ok: rec.issues.length === 0, issues: rec.issues, submitted: rec.submitted?.naturalWidth ? rec.submitted : null }, null, 2));
