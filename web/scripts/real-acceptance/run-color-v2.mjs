/**
 * CHANGE_COLOR_V2 真实 UI 验收（真上传 / 真点击 / 真 provider 调用，禁 mock）。
 *
 * 用法：
 *   node run-color-v2.mjs 1     # 第 1 轮：服装 + 模特，部位=上装，方案=参考色卡
 *   node run-color-v2.mjs 2     # 第 2 轮：产品（手表），部位=表带，沿用参考色卡
 *
 * 证据落盘到 repo 的 docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/CHANGE_COLOR_V2/
 */
import path from "node:path";
import fs from "node:fs/promises";

const round = Number(process.argv[2] || "1");
const REPO = path.resolve(process.cwd(), "../../..");
const EVIDENCE_ROOT = path.join(REPO, "docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance");
process.env.IC_EVIDENCE_ROOT = EVIDENCE_ROOT;
const DIR = path.join(EVIDENCE_ROOT, "CHANGE_COLOR_V2");
const FIXTURES = path.join(process.cwd(), "fixtures");

const { BASE_URL, launchBrowser, prepareContext, sleep, fetchImageBuffer } = await import("./lib.mjs");

const ROUTE = "/tools/ecommerce-suite/change-color-v2";
const REGION = round === 1 ? "上装" : "表带";
const FILES = round === 1
    ? ["apparel-print.jpg", "model-portrait.png"]
    : ["product-watch.jpg"];

const log = (...a) => console.log(`[round${round}]`, ...a);
const save = async (name, data) => {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(path.join(DIR, name), typeof data === "string" ? data : JSON.stringify(data, null, 2));
};

const browser = await launchBrowser();
const { context, page, network } = await prepareContext(browser);
const run = { round, route: ROUTE, region: REGION, files: FILES, startedAt: new Date().toISOString(), steps: [] };
const step = (name, data = {}) => {
    run.steps.push({ name, at: new Date().toISOString(), ...data });
    log(name, JSON.stringify(data).slice(0, 300));
};

try {
    await page.goto(BASE_URL + ROUTE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-testid=tool-asset-file-input]", { state: "attached", timeout: 30000 });
    await sleep(1500);

    /* 1. 上传整套商品图（真实文件） */
    await page.setInputFiles("[data-testid=tool-asset-file-input]", FILES.map((f) => path.join(FIXTURES, f)));
    const suiteDeadline = Date.now() + 60000;
    let suiteCount = 0;
    while (Date.now() < suiteDeadline) {
        suiteCount = await page.locator("[data-testid=tool-asset-list] li").count();
        if (suiteCount >= FILES.length) break;
        await sleep(700);
    }
    step("upload-suite", { suiteCount, expected: FILES.length });
    if (suiteCount < FILES.length) throw new Error(`套图上传未完成：${suiteCount}/${FILES.length}`);

    /* 2. 上传参考色卡 → 生成「参考图」方案 */
    await page.setInputFiles("section#plans input[type=file]", path.join(FIXTURES, "color-ref-navy.png"));
    const planDeadline = Date.now() + 45000;
    let planCount = 0;
    while (Date.now() < planDeadline) {
        const txt = await page.locator("section#plans").innerText();
        const m = txt.match(/(\d+)\s*个方案/) || txt.match(/(\d+)\/25/);
        planCount = m ? Number(m[1]) : 0;
        if (planCount >= 1) break;
        await sleep(600);
    }
    const plansText = await page.locator("section#plans").innerText();
    step("upload-reference-plan", { planCount, plansText: plansText.slice(0, 400).replace(/\n+/g, " | ") });
    if (planCount < 1) throw new Error("参考图方案未生成");

    /* 3. 换色部位 */
    await page.locator("[data-testid=color-v2-region]").fill(REGION);
    step("select-region", { region: REGION, active: await page.locator("section#region").innerText().then((t) => t.slice(0, 120).replace(/\n+/g, " | ")) });

    /* 4. 品质：高品质（radio + label，不是按钮） */
    await page.locator("[data-testid=color-v2-quality-high]").click();
    await sleep(300);
    const qualityState = await page.evaluate(() => {
        const btn = document.querySelector("[data-testid=color-v2-quality-high]");
        const c = btn ? getComputedStyle(btn) : null;
        return { bg: c ? c.backgroundColor : null, color: c ? c.color : null, active: btn?.getAttribute("aria-pressed") ?? null };
    });
    step("select-quality", { quality: "high", qualityState });
    if (!qualityState.bg || !/249, 240, 255/.test(qualityState.bg)) throw new Error(`品质未切换到高品质：${JSON.stringify(qualityState)}`);

    /* 5. 输入快照 */
    const snapshotHint = await page.locator("[data-testid=color-v2-snapshot]").innerText().catch(() => "");
    await save(`round${round}-01-input.txt`, [
        `route: ${ROUTE}`,
        `files: ${FILES.join(", ")}`,
        `region: ${REGION}`,
        `quality: high`,
        `plans: ${plansText}`,
        `adjust/snapshot: ${snapshotHint}`,
    ].join("\n"));

    /* 6. 开始换色（真实 provider 调用） */
    const submit = page.locator("[data-testid=color-v2-submit]").first();
    if (await submit.isDisabled()) throw new Error("提交按钮 disabled（校验未通过）");
    await submit.click();
    step("submit", { ok: true });

    const expected = FILES.length; // 每张图 × 1 个方案
    const genDeadline = Date.now() + 9 * 60 * 1000;
    let figureCount = 0;
    let finished = false;
    while (Date.now() < genDeadline) {
        const resText = await page.locator("section#results").innerText();
        figureCount = await page.locator("section#results figure img").count();
        if (/矩阵覆盖完整|矩阵完整/.test(resText) || (figureCount >= expected && !/生成中/.test(resText) && !resText.includes("尚未生成"))) {
            finished = true;
            break;
        }
        await sleep(4000);
    }
    const resultsText = await page.locator("section#results").innerText();
    step("generate", { finished, figureCount, resultsHead: resultsText.slice(0, 600).replace(/\n+/g, " | ") });
    await save(`round${round}-03-results-dom.txt`, resultsText);

    /* 7. 结果图字节（真实产物） */
    const srcs = await page.evaluate(() =>
        Array.from(document.querySelectorAll("section#results figure img")).map((img) => img.getAttribute("src") || ""),
    );
    const saved = [];
    for (let i = 0; i < srcs.length; i += 1) {
        const got = await fetchImageBuffer(page, srcs[i]);
        if (!got) continue;
        const name = `round${round}-02-result-${i + 1}.${got.ext}`;
        await fs.writeFile(path.join(DIR, name), got.buffer);
        saved.push({ file: name, bytes: got.buffer.length, srcKind: srcs[i].slice(0, 30) });
    }
    step("save-bytes", { saved });

    /* 8. 逐结果动作：下载 / 存入资产 / 发画布（只对第 1 张做，避免重复写库） */
    const actions = {};
    const figures = page.locator("section#results figure");
    const first = figures.first();
    // 下载
    try {
        const dl = page.waitForEvent("download", { timeout: 45000 });
        await first.locator("[data-testid=color-v2-download]").click();
        const download = await dl;
        const target = path.join(DIR, `round${round}-04-download-${download.suggestedFilename()}`);
        await download.saveAs(target);
        const st = await fs.stat(target);
        actions.download = { filename: download.suggestedFilename(), bytes: st.size };
    } catch (error) {
        actions.download = { error: error instanceof Error ? error.message : String(error) };
    }
    // 存入资产
    const assetsBefore = await page.evaluate(async () => {
        const mod = await import("/src/stores/use-asset-store.ts");
        return mod.useAssetStore.getState().assets.length;
    });
    try {
        await first.locator("[data-testid=color-v2-save]").click();
        const noticeDeadline = Date.now() + 60000;
        let notice = "";
        while (Date.now() < noticeDeadline) {
            const el = page.locator("[data-testid=color-v2-action-notice]");
            if (await el.count()) {
                notice = (await el.innerText()).trim();
                if (notice && !notice.includes("正在")) break;
            }
            await sleep(800);
        }
        const assetsAfter = await page.evaluate(async () => {
            const mod = await import("/src/stores/use-asset-store.ts");
            return mod.useAssetStore.getState().assets.map((a) => ({ id: a.id, name: a.name, type: a.type, size: a.size }));
        });
        actions.saveToAssets = { notice, before: assetsBefore, after: assetsAfter.length, newest: assetsAfter[0] };
    } catch (error) {
        actions.saveToAssets = { error: error instanceof Error ? error.message : String(error) };
    }
    // 发画布
    try {
        await first.locator("[data-testid=color-v2-send]").click();
        const noticeDeadline = Date.now() + 60000;
        let notice = "";
        while (Date.now() < noticeDeadline) {
            const el = page.locator("[data-testid=color-v2-action-notice]");
            if (await el.count()) {
                notice = (await el.innerText()).trim();
                if (notice && !notice.includes("正在")) break;
            }
            await sleep(800);
        }
        const canvas = await page.evaluate(async () => {
            const mod = await import("/src/stores/canvas/use-canvas-store.ts");
            const state = mod.useCanvasStore?.getState?.();
            if (!state) return { error: "canvas store not found" };
            const projects = state.projects ?? [];
            const active = projects.find((p) => p.id === (state.activeProjectId ?? state.currentProjectId)) ?? projects[0];
            return {
                projects: projects.length,
                activeProjectId: active?.id ?? null,
                nodes: (active?.nodes ?? []).map((n) => ({ id: n.id, type: n.type, url: String(n.data?.url ?? "").slice(0, 40) })),
            };
        });
        actions.sendToCanvas = { notice, canvas };
    } catch (error) {
        actions.sendToCanvas = { error: error instanceof Error ? error.message : String(error) };
    }
    step("result-actions", actions);
    await save(`round${round}-05-actions.json`, actions);

    await page.screenshot({ path: path.join(DIR, `round${round}-06-workspace.png`), fullPage: false });

    run.network = network.filter((n) => n.url && (/v1\/|23210/.test(n.url)));
    run.finishedAt = new Date().toISOString();
    run.ok = finished && saved.length > 0 && !actions.download?.error;
    await save(`round${round}-01-run.json`, run);
    log("DONE", JSON.stringify({ ok: run.ok, saved, actions }).slice(0, 800));
} catch (error) {
    run.error = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
    run.network = network.filter((n) => n.url);
    await save(`round${round}-01-run.json`, run);
    log("FAILED", run.error.slice(0, 500));
    process.exitCode = 1;
} finally {
    await context.close();
    await browser.close();
}
