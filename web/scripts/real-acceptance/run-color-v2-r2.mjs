/**
 * CHANGE_COLOR_V2 第二单元真实验收（表带 / product-watch.jpg）
 * 与 run-color-v2.mjs 的差异（2026-10-29 现网 UI 对齐）：
 *  - plans 只能由「商品图提色」或「历史使用颜色」产生，上传参考图仅增加参考记录
 *  - 品质选中态断言改为 token 比对（不再依赖旧 #f9f0ff 像素色）
 * 运行：cd web/scripts/real-acceptance && node run-color-v2-r2.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { BASE_URL, launchBrowser, prepareContext, sleep, fetchImageBuffer } from "./lib.mjs";

const EVIDENCE_ROOT = path.resolve(process.cwd(), "../../docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance");
const DIR = path.join(EVIDENCE_ROOT, "CHANGE_COLOR_V2");
const FIXTURES = path.join(process.cwd(), "fixtures");
const ROUTE = "/tools/ecommerce-suite/change-color-v2";
const REGION = "表带";
const FILES = ["product-watch.jpg"];

const log = (...a) => console.log("[r2]", ...a);
const save = async (name, data) => {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(path.join(DIR, name), typeof data === "string" ? data : JSON.stringify(data, null, 2));
};

const browser = await launchBrowser();
const { context, page, network } = await prepareContext(browser);
const run = { round: 2, route: ROUTE, region: REGION, files: FILES, startedAt: new Date().toISOString(), steps: [] };
const step = (name, data = {}) => {
    run.steps.push({ name, at: new Date().toISOString(), ...data });
    log(name, JSON.stringify(data).slice(0, 300));
};

try {
    await page.goto(BASE_URL + ROUTE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-testid=tool-asset-file-input]", { state: "attached", timeout: 30000 });
    await sleep(1500);

    /* 1. 上传商品图（真实文件） */
    await page.setInputFiles("[data-testid=tool-asset-file-input]", FILES.map((f) => path.join(FIXTURES, f)));
    const suiteDeadline = Date.now() + 60000;
    let suiteCount = 0;
    while (Date.now() < suiteDeadline) {
        suiteCount = await page.locator("[data-testid=tool-asset-list] li").count();
        if (suiteCount >= FILES.length) break;
        await sleep(700);
    }
    step("upload-suite", { suiteCount, expected: FILES.length });
    if (suiteCount < FILES.length) throw new Error(`商品图上传未完成：${suiteCount}/${FILES.length}`);

    /* 2. 商品图提色 → 生成方案 */
    const extractBtn = page.locator("[data-testid=color-v2-extract]").first();
    await extractBtn.waitFor({ state: "visible", timeout: 20000 });
    await extractBtn.click();
    const planDeadline = Date.now() + 90000;
    let planCount = 0;
    while (Date.now() < planDeadline) {
        planCount = await page.locator("[data-testid=color-v2-plans] li").count();
        if (planCount >= 1) break;
        await sleep(800);
    }
    const plansText = await page.locator("section#plans").innerText();
    step("extract-plan", { planCount, plansText: plansText.slice(0, 400).replace(/\n+/g, " | ") });
    if (planCount < 1) throw new Error("提色未生成方案");

    /* 3. 换色部位 */
    await page.locator("[data-testid=color-v2-region]").fill(REGION);
    await sleep(200);
    step("select-region", { region: REGION });

    /* 4. 品质：高品质（token 断言） */
    await page.locator("[data-testid=color-v2-quality-high]").click();
    await sleep(300);
    const qualityState = await page.evaluate(() => {
        const hi = document.querySelector("[data-testid=color-v2-quality-high]");
        const lo = document.querySelector("[data-testid=color-v2-quality-low]") || null;
        return {
            highColor: hi ? getComputedStyle(hi).color : null,
            highBg: hi ? getComputedStyle(hi).backgroundColor : null,
            lowColor: lo ? getComputedStyle(lo).color : null,
            lowBg: lo ? getComputedStyle(lo).backgroundColor : null,
        };
    });
    step("select-quality", { quality: "high", qualityState });
    if (!qualityState.highColor || qualityState.highColor === qualityState.lowColor) {
        throw new Error(`品质选中态未生效：${JSON.stringify(qualityState)}`);
    }

    /* 5. 输入快照 */
    const snapshotHint = await page.locator("[data-testid=color-v2-snapshot]").innerText().catch(() => "");
    await save(`round2-01-input.txt`, [
        `route: ${ROUTE}`,
        `files: ${FILES.join(", ")}`,
        `region: ${REGION}`,
        `quality: high`,
        `plans: ${plansText}`,
        `adjust/snapshot: ${snapshotHint}`,
    ].join("\n"));

    /* 6. 开始换色（真实 provider） */
    const submit = page.locator("[data-testid=color-v2-submit]").first();
    if (await submit.isDisabled()) throw new Error("提交按钮 disabled（校验未通过）");
    await submit.click();
    step("submit", { ok: true });

    const expected = FILES.length;
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
    await save(`round2-03-results-dom.txt`, resultsText);
    await page.screenshot({ path: path.join(DIR, "round2-05-result.png"), fullPage: false });

    /* 7. 结果图字节 */
    const srcs = await page.evaluate(() =>
        Array.from(document.querySelectorAll("section#results figure img")).map((img) => img.getAttribute("src") || ""),
    );
    const saved = [];
    for (let i = 0; i < srcs.length; i += 1) {
        const got = await fetchImageBuffer(page, srcs[i]);
        if (!got) continue;
        const name = `round2-02-result-${i + 1}.${got.ext}`;
        await fs.writeFile(path.join(DIR, name), got.buffer);
        saved.push({ file: name, bytes: got.buffer.length, srcKind: srcs[i].slice(0, 30) });
    }
    step("save-bytes", { saved });

    /* 8. 刷新后历史回填（真实验收：刷新页面看结果是否仍在） */
    await page.reload({ waitUntil: "domcontentloaded" });
    await sleep(3000);
    const afterReload = await page.evaluate(() => {
        const figures = document.querySelectorAll("section#results figure img").length;
        const body = document.body.innerText;
        return { figures, hasHistoryTab: /历史/.test(body) };
    });
    step("reload-history", afterReload);
    await save(`round2-06-reload.json`, afterReload);

    run.ok = finished && figureCount >= expected;
    run.finishedAt = new Date().toISOString();
    run.networkErrors = network.filter((n) => n.status >= 400).slice(0, 10);
    await save(`round2-00-run.json`, run);
    log("DONE", JSON.stringify({ ok: run.ok, figureCount, saved: saved.length, afterReload }));
    if (!run.ok) process.exitCode = 1;
} catch (error) {
    run.error = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
    run.network = network.filter((n) => n.url);
    await save(`round2-00-run.json`, run);
    log("FAILED", run.error.slice(0, 500));
    process.exitCode = 1;
} finally {
    await context.close();
    await browser.close();
}
