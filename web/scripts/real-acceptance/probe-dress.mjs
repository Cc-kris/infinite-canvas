/**
 * DRESS_WEAR_SET（服装套图）真实验收探针。
 * 真 Chrome + 真上传 + 真 provider（canvas-proxy）。不 mock、不读浏览器存储/密钥。
 * 输出：/tmp/dress-run.json（含 task id / 网络 / 结果图 dataURL 摘要）
 */
import fs from "node:fs/promises";
import path from "node:path";
import { BASE_URL, launchBrowser, prepareContext, sleep } from "./lib.mjs";
import { applyProviderConfig } from "./provider.mjs";

const FIXTURES = path.resolve("scripts/real-acceptance/fixtures");
const ROUTE = "/tools/ecommerce-suite/dress-wear-set";
const OUT = "/tmp/dress-run.json";

const browser = await launchBrowser({ headless: true });
const log = { route: ROUTE, steps: [], network: [], consoleErrors: [] };
try {
    const { page, network } = await prepareContext(browser);
    page.setDefaultTimeout(180000);
    page.on("console", (m) => {
        if (m.type() === "error") log.consoleErrors.push(m.text().slice(0, 300));
    });

    await page.goto(`${BASE_URL}${ROUTE}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid=dress-suite-workspace]', { timeout: 120000 });
    log.steps.push("workspace-mounted");

    // 0) 注入「已配置 provider」（keychain 内存传递，不打印）
    log.provider = await applyProviderConfig(page);
    log.steps.push("provider-applied");

    // 1) 上传真实商品图
    await page.locator('[data-testid=tool-asset-file-input]').first().setInputFiles(path.join(FIXTURES, "product-watch.jpg"));
    await page.waitForFunction(
        () => {
            const el = document.querySelector('[data-testid=tool-asset-list]');
            return !!el && el.children.length > 0;
        },
        null,
        { timeout: 120000 },
    );
    log.steps.push("uploaded");
    await sleep(1500);

    // 2) 品牌基因前置字段（datalist 输入框）
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

    // 3) 只保留「模特图」1 张，其余取消勾选，控制真实请求次数
    const boxes = page.locator('[data-testid=dress-suite-workspace] input[type=checkbox]');
    const boxCount = await boxes.count();
    const boxInfo = [];
    for (let i = 0; i < boxCount; i += 1) {
        const label = await boxes.nth(i).evaluate((el) => (el.closest("label")?.innerText || "").split("\n")[0]);
        const checked = await boxes.nth(i).isChecked();
        boxInfo.push({ i, label, checked });
    }
    log.checkboxes = boxInfo;

    // 取消所有已勾选的场景，仅保留第一个「模特图」
    for (const item of boxInfo) {
        const target = item.label.includes("模特图");
        if (item.checked !== target) await boxes.nth(item.i).click({ force: true });
    }
    await sleep(800);

    // 数量收到 1
    for (const label of ["模特图"]) {
        const minus = page.locator(`button[aria-label="${label}减少"]`);
        if (await minus.count()) {
            for (let guard = 0; guard < 15; guard += 1) {
                if (await minus.first().isDisabled()) break;
                await minus.first().click();
                await sleep(120);
            }
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

    if (before.btnDisabled) throw new Error(`提交按钮被禁用: ${JSON.stringify(before)}`);

    const t0 = Date.now();
    await page.locator("button", { hasText: "开始生成" }).first().click();
    log.steps.push("clicked-generate");

    // 4) 等真实上游返回：结果区出现产物或失败文案
    await page
        .waitForFunction(
            () => {
                const summary = document.querySelector('[data-testid=dress-suite-summary]');
                if (!summary) return false;
                if (/成功\s*[1-9]/.test(summary.innerText)) return true;
                const group = document.querySelector("[data-testid^=dress-group-]");
                const text = group?.innerText || "";
                // 快速失败：上游不可达 / 明确失败态，不再空等
                return /无法连接|连接超时|失败/.test(text) && !/生成中|排队|等待上游/.test(text);
            },
            null,
            { timeout: 420000 },
        )
        .catch(() => null);
    console.log(`[probe] settled after ${Date.now() - t0}ms`);
    log.elapsedMs = Date.now() - t0;
    log.steps.push("settled");
    await sleep(2000);

    // 5) 采集真实产物与 task id（应用运行时状态，不读浏览器存储）
    const collected = await page.evaluate(async () => {
        const summary = document.querySelector('[data-testid=dress-suite-summary]')?.innerText || "";
        const groups = [...document.querySelectorAll("[data-testid^=dress-group-]")].map((el) => ({
            scene: el.getAttribute("data-testid"),
            text: el.innerText.slice(0, 400),
            images: [...el.querySelectorAll("img")].map((img) => ({
                alt: img.alt,
                srcHead: String(img.currentSrc || img.src).slice(0, 60),
                len: String(img.currentSrc || img.src).length,
            })),
        }));
        const mod = await import("/src/stores/use-tool-task-store.ts");
        const tasks = Object.values(mod.useToolTaskStore.getState().tasks)
            .filter((t) => t.toolId === "DRESS_WEAR_SET")
            .map((t) => ({
                id: t.id,
                status: t.status,
                providerTaskId: t.providerTaskId ?? t.remoteId ?? t.taskId ?? null,
                createdAt: t.createdAt,
                error: t.error?.message ?? null,
                images: (t.result?.images || t.images || []).map((im) => (typeof im === "string" ? im.slice(0, 60) : Object.keys(im))),
            }));
        return { summary, groups, tasks };
    });
    log.result = collected;

    // 6) 结果图字节（真实产物）
    const firstSrc = await page.evaluate(() => {
        const img = document.querySelector("[data-testid^=dress-group-] img");
        return img ? img.currentSrc || img.src : null;
    });
    log.resultImage = firstSrc ? { srcHead: firstSrc.slice(0, 40), len: firstSrc.length } : null;
    if (firstSrc) {
        const b64 = await page.evaluate(async (src) => {
            const res = await fetch(src);
            const ab = await res.arrayBuffer();
            let s = "";
            const bytes = new Uint8Array(ab);
            for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
            return btoa(s);
        }, firstSrc);
        await fs.writeFile("/tmp/dress-result.png", Buffer.from(b64, "base64"));
        log.resultImage.bytes = Buffer.from(b64, "base64").length;
    }

    log.network = network.filter((n) => n.url);
    await page.screenshot({ path: "/tmp/dress-workspace.png", fullPage: false });
    log.ok = true;
} catch (error) {
    log.ok = false;
    log.error = String(error?.stack || error).slice(0, 2000);
} finally {
    await fs.writeFile(OUT, JSON.stringify(log, null, 2));
    console.log(JSON.stringify({ ok: log.ok, error: log.error, steps: log.steps, before: log.beforeSubmit, summary: log.result?.summary, groups: log.result?.groups?.map((g) => ({ scene: g.scene, imgs: g.images.length, text: g.text.slice(0, 80) })), tasks: log.result?.tasks, net: log.network?.length, img: log.resultImage }));
    await browser.close();
}
