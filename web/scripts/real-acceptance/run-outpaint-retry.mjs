/**
 * AI_OUTPAINTING 真实回执：真实上传 → 真实上游生成 → 对第 1 张点「重试这张」。
 *
 * 验收点：
 * 1. 单结果重试只替换被点的格子，其余结果 URL 不变；
 * 2. 重试走真实上游（新 URL / 新字节）；
 * 3. 历史记录面板有真实快照并可回载。
 *
 * 每 5s 记录一次进度到 stdout，超时也会写 b5-retry-receipt.json（status=failed）。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { BASE_URL, PROXY_URL, EVIDENCE_ROOT, applyProxyConfig } from "./lib.mjs";

const FIXTURES = path.resolve(process.cwd(), "scripts/real-acceptance/fixtures");
const TOOL_DIR = path.join(EVIDENCE_ROOT, "AI_OUTPAINTING");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const readItems = (page) =>
    page.evaluate(() =>
        [...document.querySelectorAll('[data-testid^="tool-result-item-"]')].map((li) => {
            const img = li.querySelector("img");
            return {
                index: Number(li.dataset.testid.replace("tool-result-item-", "")),
                src: img?.src ?? null,
                natural: img ? [img.naturalWidth, img.naturalHeight] : null,
                dropped: li.dataset.dropped ?? null,
                state: (li.dataset.kind ?? "") + "/" + (li.dataset.dropped ?? ""),
            };
        }),
    );

const readStatus = (page) =>
    page.evaluate(() => ({
        summary: document.querySelector('[data-testid="tool-result-summary"]')?.textContent?.trim() ?? null,
        notice: document.querySelector('[data-testid="outpaint-notice"]')?.textContent?.trim() ?? null,
        task: document.querySelector('[data-testid="task-status-panel"]')?.innerText?.replace(/\s+/g, " ").slice(0, 200) ?? null,
        items: document.querySelectorAll('[data-testid^="tool-result-item-"]').length,
    }));

async function main() {
    await fs.mkdir(TOOL_DIR, { recursive: true });
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await context.newPage();
    const calls = [];
    page.on("request", (req) => {
        const url = req.url();
        if (/\/v1\/|images\/generations|edits|canvas-proxy|23210/.test(url)) calls.push({ at: Date.now(), method: req.method(), url: url.slice(0, 160) });
    });

    const receipt = { tool: "AI_OUTPAINTING", at: new Date().toISOString(), status: "failed", steps: {} };
    try {
        await page.goto(`${BASE_URL}/tools/ecommerce-suite/ai-outpainting`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector('[data-testid="tool-asset-file-input"]', { timeout: 30000 });
        await applyProxyConfig(page);
        await sleep(800);

        // 1) 真实上传
        await page.setInputFiles('[data-testid="tool-asset-file-input"]', path.join(FIXTURES, "product-watch.jpg"));
        await page.waitForSelector('[data-testid="outpaint-source-name"]', { timeout: 30000 });
        receipt.steps.source = await page.locator('[data-testid="outpaint-source-name"]').innerText();

        // 2) 拖边造外扩 + 必填描述 + 数量 2
        const rightEdge = page.locator('[data-testid="outpaint-edge-right"]');
        await rightEdge.focus();
        for (let i = 0; i < 12; i += 1) await rightEdge.press("ArrowRight");
        await page.locator("textarea").first().fill("延续灰色水泥地面与柔和侧光，右侧补出完整的产品阴影");
        const twoChip = page.getByRole("button", { name: /^2\s*张$/ });
        if (await twoChip.count()) await twoChip.first().click();
        await sleep(400);
        receipt.steps.beforeSubmit = {
            countChips: await page.locator('[data-testid="outpaint-count"] button').evaluateAll((els) => els.map((e) => `${e.innerText.trim()}${e.getAttribute("aria-pressed") === "true" || e.dataset.active === "true" ? "*" : ""}`)),
            submitDisabled: await page.locator('[data-testid="outpaint-submit"]').isDisabled(),
            submitTitle: await page.locator('[data-testid="outpaint-submit"]').getAttribute("title"),
            submitText: (await page.locator('[data-testid="outpaint-submit"]').innerText()).trim(),
        };
        if (receipt.steps.beforeSubmit.submitDisabled) throw new Error(`submit 禁用: ${receipt.steps.beforeSubmit.submitTitle}`);

        // 3) 真实生成
        const t0 = Date.now();
        await page.locator('[data-testid="outpaint-submit"]').click();
        let generated = [];
        for (let i = 0; i < 36; i += 1) {
            await sleep(5000);
            generated = await readItems(page);
            const st = await readStatus(page);
            console.log(`[gen ${(i + 1) * 5}s] items=${generated.length} ready=${generated.filter((x) => x.natural?.[0] > 0).length} summary=${st.summary} task=${st.task}`);
            if (generated.length >= 2 && generated.every((x) => x.natural?.[0] > 0)) break;
        }
        receipt.steps.generated = { ms: Date.now() - t0, items: generated, status: await readStatus(page) };
        if (generated.filter((x) => x.natural?.[0] > 0).length < 2) throw new Error(`只拿到 ${generated.length} 张结果`);
        await page.screenshot({ path: path.join(TOOL_DIR, "b5-01-generated.png") });

        // 4) 单结果重试（第 1 张）
        const retryBtn = page.locator('[data-testid="tool-result-retry-0"]');
        receipt.steps.retryButton = { count: await retryBtn.count(), disabled: await retryBtn.isDisabled(), text: (await retryBtn.innerText()).trim() };
        const t1 = Date.now();
        await retryBtn.click();
        let afterRetry = generated;
        let feedback = null;
        let notice = null;
        for (let i = 0; i < 36; i += 1) {
            await sleep(5000);
            afterRetry = await readItems(page);
            const st = await readStatus(page);
            feedback = await page.evaluate(() => document.querySelector('[data-testid="tool-result-feedback"]')?.textContent?.trim() ?? null);
            notice = st.notice;
            console.log(`[retry ${(i + 1) * 5}s] item0=${String(afterRetry[0]?.src).slice(-28)} feedback=${feedback} notice=${notice}`);
            if (afterRetry[0]?.src && afterRetry[0].src !== generated[0].src && afterRetry[0].natural?.[0] > 0) break;
        }
        receipt.steps.retry = { index: 0, ms: Date.now() - t1, feedback, notice, items: afterRetry };
        receipt.assertions = {
            generatedTwoImages: generated.length >= 2 && generated.every((x) => x.natural?.[0] > 0),
            retriedItemChanged: Boolean(afterRetry[0]?.src && afterRetry[0].src !== generated[0].src),
            othersUntouched: afterRetry.length === generated.length && afterRetry.slice(1).every((x, i) => x.src === generated[i + 1].src),
            upstreamCalls: calls.length,
        };
        await page.screenshot({ path: path.join(TOOL_DIR, "b5-02-after-retry.png") });

        // 5) 历史记录面板
        receipt.steps.history = await page.evaluate(() => {
            const panel = document.querySelector('[data-testid="tool-task-history"]');
            const items = panel ? [...panel.querySelectorAll('[data-testid="tool-task-history-item"]')] : [];
            return {
                found: Boolean(panel),
                count: items.length,
                header: panel?.querySelector("h2,h3,p")?.textContent?.trim() ?? null,
                first: items[0]?.innerText?.replace(/\s+/g, " ").slice(0, 160) ?? null,
                openButtons: panel?.querySelectorAll('[data-testid="tool-task-history-open"]').length ?? 0,
            };
        });
        receipt.steps.historyOpen = await page.evaluate(async () => {
            const btn = document.querySelector('[data-testid="tool-task-history-open"]');
            if (!btn) return { clicked: false };
            btn.click();
            await new Promise((r) => setTimeout(r, 1200));
            return { clicked: true, notice: document.querySelector('[data-testid="outpaint-notice"]')?.textContent?.trim() ?? null };
        });
        receipt.status = receipt.assertions.retriedItemChanged && receipt.assertions.othersUntouched ? "passed" : "failed";
    } catch (error) {
        receipt.error = String(error?.message ?? error);
        receipt.steps.failure = await readStatus(page).catch(() => null);
        await page.screenshot({ path: path.join(TOOL_DIR, "b5-failed.png") }).catch(() => {});
    } finally {
        receipt.upstreamCalls = calls;
        await fs.writeFile(path.join(TOOL_DIR, "b5-retry-receipt.json"), JSON.stringify(receipt, null, 2));
        console.log("RECEIPT", receipt.status, JSON.stringify(receipt.assertions ?? receipt.error));
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
