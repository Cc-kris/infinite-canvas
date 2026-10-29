/**
 * B6｜「优秀案例」页签 + 做同款回填 真机验收（AI_OUTPAINTING）。
 *
 * 事实边界：
 * - 真 Chrome、真点击（不是直接调 store）；点的是页面上的 `tool-case-apply` 按钮；
 * - 回填链路真实：fetch 案例原图 → `uploadToolAsset()`（localforage/IndexedDB 真持久化）
 *   → `onSourceChange()` → draft store 落盘；
 * - 不重复生成：不点「生成」，只验证回填与持久化；
 * - 刷新后读 DOM（缩略图/名称/提示词）与 IndexedDB 的 draft 快照双证。
 *
 * 产出：docs/V1.0/plan_linkfox_navigation/evidence/b6-cases/local/
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const OUT = path.resolve(HERE, "../../../docs/V1.0/plan_linkfox_navigation/evidence/b6-cases/local");
const ROUTE = "/tools/ecommerce-suite/ai-outpainting";

const summary = { route: ROUTE, base: BASE, at: new Date().toISOString(), steps: [] };

async function readDraft(page, toolId) {
    return page.evaluate(async (id) => {
        const open = () =>
            new Promise((resolve, reject) => {
                const req = indexedDB.open("infinite-canvas");
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        const db = await open();
        if (!db.objectStoreNames.contains("app_state")) return { error: "no app_state store", stores: Array.from(db.objectStoreNames) };
        const tx = db.transaction("app_state", "readonly");
        const store = tx.objectStore("app_state");
        const all = await new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        const keys = await new Promise((resolve, reject) => {
            const req = store.getAllKeys();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        const idx = keys.findIndex((k) => String(k).includes(id));
        const raw = idx >= 0 ? all[idx] : null;
        let parsed = raw;
        if (typeof raw === "string") {
            try {
                parsed = JSON.parse(raw);
            } catch {
                parsed = raw;
            }
        }
        return { key: idx >= 0 ? String(keys[idx]) : null, value: parsed ?? null, keyCount: keys.length };
    }, toolId);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
await mkdir(path.join(OUT, "screenshots"), { recursive: true });

try {
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="outpaint-tab-cases"]', { timeout: 20000 });

    const tabBar = await page.$eval('[role="tablist"]', (el) => ({
        text: el.innerText.replace(/\n/g, "|"),
        tabs: Array.from(el.querySelectorAll('[role="tab"]')).map((t) => ({
            text: t.innerText,
            selected: t.getAttribute("aria-selected"),
            cls: t.className,
        })),
    }));
    summary.steps.push({ step: "tabbar-before", ...tabBar });

    await page.click('[data-testid="outpaint-tab-cases"]');
    await page.waitForSelector('[data-testid="tool-case-card"]', { timeout: 15000 });
    const casesDom = await page.evaluate(() => {
        const wrap = document.querySelector('[data-testid="tool-cases"]');
        const cards = Array.from(document.querySelectorAll('[data-testid="tool-case-card"]'));
        const box = (el) => {
            const r = el.getBoundingClientRect();
            return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
        };
        const mask = cards[0]?.querySelector('[data-testid="tool-case-preview"]');
        return {
            wrapperBox: wrap ? box(wrap) : null,
            columnBox: wrap && wrap.firstElementChild ? box(wrap.firstElementChild) : null,
            wrapperStyle: wrap
                ? (() => {
                      const inner = wrap.firstElementChild;
                      const s = getComputedStyle(inner);
                      return { columnCount: s.columnCount, columnGap: s.columnGap };
                  })()
                : null,
            cards: cards.map((c) => ({
                id: c.getAttribute("data-case-id"),
                box: box(c),
                img: c.querySelector("img")?.getAttribute("src"),
                text: c.innerText.replace(/\n/g, "|"),
                btnBox: c.querySelector('[data-testid="tool-case-apply"]')
                    ? box(c.querySelector('[data-testid="tool-case-apply"]'))
                    : null,
            })),
            maskStyle: mask
                ? (() => {
                      const s = getComputedStyle(mask);
                      return { bg: s.backgroundColor, opacity: s.opacity, position: s.position };
                  })()
                : null,
        };
    });
    summary.steps.push({ step: "cases-panel", ...casesDom });
    await page.screenshot({ path: path.join(OUT, "screenshots", "01-cases-tab.png") });

    // hover 预览蒙层
    await page.hover('[data-testid="tool-case-card"]');
    await page.waitForTimeout(400);
    const maskAfterHover = await page.$eval('[data-testid="tool-case-card"] > div', (el) => getComputedStyle(el).opacity);
    summary.steps.push({ step: "mask-hover-opacity", opacity: maskAfterHover });
    await page.screenshot({ path: path.join(OUT, "screenshots", "02-card-hover.png") });

    // 真实点击「做同款」
    const before = {
        name: await page.$eval('[data-testid="outpaint-source-name"]', (el) => el.innerText).catch(() => null),
        prompt: await page.$eval("textarea", (el) => el.value).catch(() => null),
    };
    await page.click('[data-testid="tool-case-apply"]');
    await page.waitForTimeout(2500);
    const after = {
        name: await page.$eval('[data-testid="outpaint-source-name"]', (el) => el.innerText).catch(() => null),
        prompt: await page.$eval("textarea", (el) => el.value).catch(() => null),
        notice: await page.$eval('[data-testid="outpaint-notice"]', (el) => el.innerText).catch(() => null),
        canvasImg: await page.$eval('[data-testid="outpaint-canvas"] img', (el) => el.getAttribute("src")).catch(() => null),
        activeTab: await page.$eval('[aria-selected="true"][role="tab"]', (el) => el.innerText).catch(() => null),
    };
    const draftBeforeReload = await readDraft(page, "AI_OUTPAINTING");
    summary.steps.push({ step: "apply-case", before, after, draft: draftBeforeReload });
    await page.screenshot({ path: path.join(OUT, "screenshots", "03-after-apply.png") });

    // 刷新后持久化
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="outpaint-tab-cases"]', { timeout: 20000 });
    await page.waitForTimeout(1500);
    const afterReload = {
        name: await page.$eval('[data-testid="outpaint-source-name"]', (el) => el.innerText).catch(() => null),
        prompt: await page.$eval("textarea", (el) => el.value).catch(() => null),
        canvasImg: await page.$eval('[data-testid="outpaint-canvas"] img', (el) => el.getAttribute("src")).catch(() => null),
        hasThumb: await page.$$eval('[data-testid="outpaint-canvas"] img', (els) => els.length),
        activeTab: await page.$eval('[aria-selected="true"][role="tab"]', (el) => el.innerText).catch(() => null),
    };
    const draftAfterReload = await readDraft(page, "AI_OUTPAINTING");
    summary.steps.push({ step: "after-reload", ...afterReload, draft: draftAfterReload });
    await page.screenshot({ path: path.join(OUT, "screenshots", "04-after-reload.png") });

    const assetIdOf = (d) => d?.value?.sourceAssetId ?? d?.value?.values?.sourceAssetId ?? null;
    const sameAsset = !!assetIdOf(draftBeforeReload) && assetIdOf(draftBeforeReload) === assetIdOf(draftAfterReload);
    summary.assertions = {
        tabBarHas3: tabBar.tabs.length === 3,
        tabLabels: tabBar.tabs.map((t) => t.text).join("/"),
        hasCaseCard: casesDom.cards.length > 0,
        maskShowsOnHover: maskAfterHover === "1",
        promptBackfilled: !!after.prompt && after.prompt !== before.prompt,
        sourceBackfilled: !!after.name && after.name !== before.name,
        canvasHasImage: !!after.canvasImg,
        draftPersistedAcrossReload: sameAsset,
        draftKey: draftBeforeReload?.key ?? null,
        assetIdBefore: assetIdOf(draftBeforeReload),
        assetIdAfter: assetIdOf(draftAfterReload),
    };
    summary.ok = Object.entries(summary.assertions)
        .filter(([k]) => !["tabLabels"].includes(k))
        .every(([, v]) => v !== false);
    summary.errors = errors;
} catch (error) {
    summary.error = String(error).slice(0, 800);
    summary.ok = false;
    await page.screenshot({ path: path.join(OUT, "screenshots", "99-error.png") }).catch(() => {});
} finally {
    await writeFile(path.join(OUT, "run-outpaint-cases.json"), JSON.stringify(summary, null, 2));
    await browser.close();
}

console.log(JSON.stringify({ ok: summary.ok, assertions: summary.assertions, error: summary.error }, null, 2));
