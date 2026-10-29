import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3000";
const ROUTE = "/tools/product-design/new-designer";
const OUT = path.resolve("temp/designer-persist-evidence");
fs.mkdirSync(OUT, { recursive: true });
const IMG = path.resolve("dist/logo.png");

const log = (...a) => console.log("[e2e]", ...a);

const run = async () => {
    const browser = await chromium.launch({ headless: true, channel: "chrome" });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
    });
    page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 300)));

    await page.goto(BASE + ROUTE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    const hasExport = await page.locator('[data-testid="designer-export"]').count();
    log("designer-export present:", hasExport);
    if (!hasExport) {
        const txt = (await page.evaluate(() => document.body.innerText)).slice(0, 800);
        log("PAGE TEXT:", txt);
        fs.writeFileSync(path.join(OUT, "diag.txt"), txt);
        await page.screenshot({ path: path.join(OUT, "01-no-designer.png") });
        await browser.close();
        return;
    }

    const fileInput = page.locator('input[type="file"][accept*="image/png"]').first();
    log("file inputs:", await page.locator('input[type="file"]').count());
    await fileInput.setInputFiles(IMG);
    await page.waitForTimeout(3500);
    const layerCount = await page.locator('[aria-label="图层列表"] li').count();
    log("layers after upload:", layerCount);
    const uploadErrText = await page.evaluate(() => {
        const el = [...document.querySelectorAll("p")].find((p) => p.textContent?.includes("上传失败"));
        return el ? el.textContent : "";
    });
    if (uploadErrText) log("UPLOAD ERROR:", uploadErrText);

    const exportBtn = page.locator('[data-testid="designer-export"]');
    log("export disabled:", await exportBtn.isDisabled());
    await page.screenshot({ path: path.join(OUT, "02-before-export.png") });

    if (await exportBtn.isDisabled()) {
        log("BLOCKED: 导出仍禁用");
        fs.writeFileSync(path.join(OUT, "result.json"), JSON.stringify({ blocked: true, uploadErrText, consoleErrors, pageErrors }, null, 2));
        await browser.close();
        return;
    }

    await exportBtn.click();
    await page.waitForTimeout(7000);
    await page.screenshot({ path: path.join(OUT, "03-after-export.png") });

    const taskBlobs = await page.evaluate(() =>
        Object.keys(localStorage)
            .filter((k) => k.toLowerCase().includes("task"))
            .map((k) => ({ k, v: (localStorage.getItem(k) || "").slice(0, 300) })),
    );
    log("task keys:", JSON.stringify(taskBlobs).slice(0, 1200));
    const stageText = await page.evaluate(() => document.body.innerText.slice(0, 900));
    fs.writeFileSync(path.join(OUT, "stage.txt"), stageText);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3500);
    const dockExists = await page.locator('[data-testid="tool-history-dock"]').count();
    const dockRows = await page.locator('[data-testid="tool-history-dock"] li').count();
    const replayBtns = await page.locator('[data-testid="tool-history-dock-replay"]').count();
    log("after reload: dock:", dockExists, "rows:", dockRows, "replay:", replayBtns);
    await page.screenshot({ path: path.join(OUT, "04-after-reload.png") });

    const dockText = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="tool-history-dock"]');
        return el ? el.innerText.slice(0, 600) : "NO DOCK";
    });
    fs.writeFileSync(path.join(OUT, "dock.txt"), dockText);

    let notice = 0;
    let noticeText = "";
    let layersAfterReplay = 0;
    if (replayBtns > 0) {
        await page.locator('[data-testid="tool-history-dock-replay"]').first().click();
        await page.waitForTimeout(2000);
        notice = await page.locator('[data-testid="designer-replay-notice"]').count();
        noticeText = notice ? await page.locator('[data-testid="designer-replay-notice"]').first().innerText() : "";
        layersAfterReplay = await page.locator('[aria-label="图层列表"] li').count();
        await page.screenshot({ path: path.join(OUT, "05-after-replay.png") });
        log("replay notice:", notice, noticeText, "| layers:", layersAfterReplay);
    }

    fs.writeFileSync(
        path.join(OUT, "result.json"),
        JSON.stringify({ dockExists, dockRows, replayBtns, notice, noticeText, layersAfterReplay, uploadErrText, consoleErrors, pageErrors }, null, 2),
    );
    log("consoleErrors:", consoleErrors.slice(0, 5));
    log("pageErrors:", pageErrors.slice(0, 5));
    await browser.close();
};

run().catch((e) => {
    console.error("[e2e][fatal]", e);
    process.exit(1);
});
