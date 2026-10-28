/**
 * DRESS_WEAR_SET（服装套图）真实验收：真实 provider + 结果卡三个动作（下载/存入资产/发送画布）。
 * 不 mock、不读浏览器存储/密钥；provider 由 keychain 在内存中注入（见 provider.mjs）。
 * 产物：docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/DRESS_WEAR_SET/
 */
import fs from "node:fs/promises";
import path from "node:path";
import { BASE_URL, launchBrowser, prepareContext, sleep, evidenceDir, fetchImageBuffer } from "./lib.mjs";
import { applyProviderConfig } from "./provider.mjs";

const FIXTURES = path.resolve("scripts/real-acceptance/fixtures");
const ROUTE = "/tools/ecommerce-suite/dress-wear-set";
const TOOL = "DRESS_WEAR_SET";

const log = { tool: TOOL, route: ROUTE, steps: [], network: [], consoleErrors: [], actions: {} };

const browser = await launchBrowser({ headless: true });
try {
    const { page, network } = await prepareContext(browser);
    page.setDefaultTimeout(180000);
    page.on("console", (m) => {
        if (m.type() === "error") log.consoleErrors.push(m.text().slice(0, 300));
    });

    await page.goto(`${BASE_URL}${ROUTE}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-testid=dress-suite-workspace]", { timeout: 120000 });
    log.steps.push("workspace-mounted");

    log.provider = await applyProviderConfig(page);
    log.steps.push("provider-applied");

    await page.locator("[data-testid=tool-asset-file-input]").first().setInputFiles(path.join(FIXTURES, "product-watch.jpg"));
    await page.waitForFunction(
        () => {
            const el = document.querySelector("[data-testid=tool-asset-list]");
            return !!el && el.children.length > 0;
        },
        null,
        { timeout: 120000 },
    );
    log.steps.push("uploaded");
    await sleep(1500);

    for (const [sel, value] of [
        ["input[list=dress-platform]", "亚马逊"],
        ["input[list=dress-region]", "美国"],
        ["input[list=dress-language]", "英语"],
    ]) {
        const input = page.locator(sel);
        await input.click();
        await input.fill("");
        await input.type(value, { delay: 20 });
        await input.blur();
    }
    log.steps.push("brand-fields");

    // 只保留「模特图」1 张
    const boxes = page.locator("[data-testid=dress-suite-workspace] input[type=checkbox]");
    const boxCount = await boxes.count();
    const boxInfo = [];
    for (let i = 0; i < boxCount; i += 1) {
        const label = await boxes.nth(i).evaluate((el) => (el.closest("label")?.innerText || "").split("\n")[0]);
        boxInfo.push({ i, label, checked: await boxes.nth(i).isChecked() });
    }
    log.checkboxes = boxInfo;
    for (const item of boxInfo) {
        const target = item.label.includes("模特图");
        if (item.checked !== target) await boxes.nth(item.i).click({ force: true });
    }
    await sleep(600);
    const minus = page.locator('button[aria-label="模特图减少"]');
    if (await minus.count()) {
        for (let guard = 0; guard < 15; guard += 1) {
            if (await minus.first().isDisabled()) break;
            await minus.first().click();
            await sleep(120);
        }
    }
    await sleep(500);

    const before = await page.evaluate(() => {
        const btn = [...document.querySelectorAll("button")].find((b) => /开始生成|生成中/.test(b.textContent || ""));
        const est = document.body.innerText.match(/预计产出\s*(\d+)\s*张\s*\/\s*(\d+)\s*组/);
        const errs = [...document.querySelectorAll(".text-destructive")].map((el) => el.textContent).filter(Boolean);
        return { btnText: btn?.textContent?.trim(), btnDisabled: btn?.disabled, estimate: est ? est.slice(1, 3) : null, errors: errs.slice(0, 5) };
    });
    log.beforeSubmit = before;
    const dir = await evidenceDir(TOOL);
    await page.screenshot({ path: path.join(dir, "01-before-submit.png") });
    if (before.btnDisabled) throw new Error(`提交按钮被禁用: ${JSON.stringify(before)}`);

    const t0 = Date.now();
    await page.locator("button", { hasText: "开始生成" }).first().click();
    log.steps.push("clicked-generate");

    await page.waitForFunction(
        () => {
            const summary = document.querySelector("[data-testid=dress-suite-summary]");
            if (!summary) return false;
            if (/成功\s*[1-9]/.test(summary.innerText)) return true;
            const group = document.querySelector("[data-testid^=dress-group-]");
            const text = group?.innerText || "";
            return /无法连接|连接超时|失败/.test(text) && !/生成中|排队|等待上游/.test(text);
        },
        null,
        { timeout: 420000 },
    );
    log.elapsedMs = Date.now() - t0;
    log.steps.push("settled");
    await sleep(1500);

    // 结果：分组文案 / 结果图 / 全量结果 id（UI 只显示前 8 位，全量在 download 属性里）
    log.result = await page.evaluate(() => {
        const summaryEl = document.querySelector("[data-testid=dress-suite-summary]");
        const groups = [...document.querySelectorAll("[data-testid^=dress-group-]")].map((el) => ({
            testid: el.getAttribute("data-testid"),
            text: (el.innerText || "").slice(0, 300),
            images: [...el.querySelectorAll("img")].map((img) => ({ alt: img.alt, srcHead: String(img.currentSrc || img.src).slice(0, 60), srcLen: String(img.currentSrc || img.src).length })),
            downloads: [...el.querySelectorAll("a[download]")].map((a) => a.getAttribute("download")),
            actions: [...el.querySelectorAll("button")].map((b) => (b.textContent || "").trim()).filter(Boolean),
        }));
        return { summary: summaryEl?.innerText ?? null, groups };
    });
    await page.screenshot({ path: path.join(dir, "02-result.png") });

    const firstSrc = await page.evaluate(() => {
        const img = document.querySelector("[data-testid^=dress-group-] img");
        return img ? img.currentSrc || img.src : null;
    });
    const fetched = await fetchImageBuffer(page, firstSrc);
    let resultBuffer = null;
    if (fetched) {
        resultBuffer = fetched.buffer;
        await fs.writeFile(path.join(dir, `result.${fetched.ext}`), resultBuffer);
        log.resultImage = { srcHead: firstSrc.slice(0, 60), bytes: fetched.buffer.length, file: `result.${fetched.ext}` };
    }

    // 动作 1：存入资产
    const notice = async (re) =>
        page.evaluate((pattern) => {
            const rx = new RegExp(pattern);
            return [...document.querySelectorAll("p,div,span")]
                .map((el) => (el.textContent || "").trim())
                .filter((t) => t.length > 2 && t.length < 120 && rx.test(t))
                .slice(0, 3);
        }, re.source);

    const group = page.locator("[data-testid^=dress-group-]").first();
    const saveBtn = group.getByRole("button", { name: "存入资产" }).first();
    if (!(await saveBtn.count())) throw new Error("结果卡缺少『存入资产』按钮");
    await saveBtn.click();
    await page.waitForFunction(
        () => /已存入资产库|存入资产库失败|payload|依赖/.test(document.body.innerText),
        null,
        { timeout: 120000 },
    );
    log.actions.saveToAssets = { clicked: true, notice: await notice(/已存入资产库|存入资产库失败/) };
    log.actions.saveToAssets.assetCount = await page.evaluate(async () => {
        const mod = await import("/src/stores/use-asset-store.ts");
        const state = mod.useAssetStore.getState();
        return { count: (state.assets || []).length, last: (state.assets || []).slice(-1)[0] ? { kind: state.assets.slice(-1)[0].kind, title: state.assets.slice(-1)[0].title, meta: state.assets.slice(-1)[0].metadata } : null };
    });
    await page.screenshot({ path: path.join(dir, "03-saved-asset.png") });

    // 动作 2：发送画布
    const sendBtn = group.getByRole("button", { name: "发送画布" }).first();
    if (!(await sendBtn.count())) throw new Error("结果卡缺少『发送画布』按钮");
    await sendBtn.click();
    await page.waitForFunction(
        () => /已发送到画布|发送到画布失败|画布依赖不可用/.test(document.body.innerText),
        null,
        { timeout: 120000 },
    );
    log.actions.sendToCanvas = { clicked: true, notice: await notice(/已发送到画布|发送到画布失败|画布依赖不可用/) };
    log.actions.sendToCanvas.canvas = await page.evaluate(async () => {
        const mod = await import("/src/stores/canvas/use-canvas-store.ts");
        const state = mod.useCanvasStore.getState();
        const projects = Object.values(state.projects || {});
        const last = projects.slice(-1)[0];
        return {
            projectCount: projects.length,
            last: last ? { id: last.id, title: last.title, nodes: (last.nodes || []).length, nodeTypes: (last.nodes || []).map((n) => n.type) } : null,
        };
    });
    await page.screenshot({ path: path.join(dir, "04-sent-canvas.png") });

    // 动作 3：下载（不落盘到浏览器下载目录，只验证按钮的 href/download 语义）
    log.actions.download = await page.evaluate(() => {
        const a = document.querySelector("[data-testid^=dress-group-] a[download]");
        return a ? { hrefKind: a.href.startsWith("data:") ? "data-url" : a.href.startsWith("blob:") ? "blob" : "http", download: a.getAttribute("download") } : null;
    });

    log.network = network.filter((n) => n.url && !/\/@(vite|react-refresh)|\.hot-update\./.test(n.url));
    await fs.writeFile(path.join(dir, "05-net.json"), JSON.stringify(log.network, null, 2));
    log.ok = true;
} catch (error) {
    log.ok = false;
    log.error = String(error?.stack || error).slice(0, 2500);
} finally {
    const dir = await evidenceDir(TOOL);
    log.finishedAt = new Date().toISOString();
    await fs.writeFile("/tmp/dress-accept.json", JSON.stringify(log, null, 2));
    console.log(JSON.stringify({ ok: log.ok, error: log.error?.slice(0, 400), steps: log.steps, elapsedMs: log.elapsedMs, summary: log.result?.summary, groups: log.result?.groups?.map((g) => ({ testid: g.testid, imgs: g.images.length, downloads: g.downloads, actions: g.actions })), actions: log.actions, img: log.resultImage, net: log.network?.length }));
    await browser.close();
}
