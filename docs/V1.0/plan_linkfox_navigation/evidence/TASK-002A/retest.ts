import { chromium } from "/Users/mac/Documents/Dev/infinite-canvas/web/node_modules/playwright/index.mjs";
const B = "http://127.0.0.1:3000";
const browser = await chromium.launch({ executablePath: "/Users/mac/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" });
const res: any = {};

// English
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem("infinite-canvas:locale", "en-US"));
const p = await ctx.newPage();
await p.goto(B + "/", { waitUntil: "networkidle" });
await p.waitForTimeout(1800);
await p.waitForSelector('[data-testid="tools-nav-primary"]', { state: "visible" });
res.enTriggers = await p.$$eval('[data-testid^="tools-nav-trigger-"]', (e) => e.map((x) => (x as HTMLElement).innerText.trim()));
await p.hover('[data-testid="tools-nav-trigger-batch-generate"]');
await p.waitForSelector('[data-testid="tools-nav-menu-batch-generate"]');
res.enBatchMenu = await p.$$eval('[data-testid="tools-nav-menu-batch-generate"] [data-testid^="tools-nav-item-"]', (e) => e.map((x) => (x as HTMLElement).innerText.replace(/\s+/g, " ").trim()));
res.enBatchCount = res.enBatchMenu.length;
res.enEntryLink = await p.$eval('[data-testid="tools-nav-category-entry-batch-generate"]', (e) => (e as HTMLElement).innerText.trim());
await p.screenshot({ path: "/tmp/navverify/desktop-en-menu-batch.png" });

// keyboard focus with generous waits
const q = await ctx.newPage();
await q.goto(B + "/", { waitUntil: "networkidle" });
await q.waitForTimeout(1800);
await q.waitForSelector('[data-testid="tools-nav-primary"]', { state: "visible" });
const trig = '[data-testid="tools-nav-trigger-smart-edit"]';
await q.focus(trig);
await q.keyboard.press("ArrowDown");
await q.waitForTimeout(400);
res.kb1 = await q.evaluate(() => ({ active: document.activeElement?.getAttribute("data-testid"), role: document.activeElement?.getAttribute("role"), label: (document.activeElement as HTMLElement)?.innerText?.trim(), expanded: document.querySelector('[data-testid="tools-nav-trigger-smart-edit"]')?.getAttribute("aria-expanded") }));
await q.keyboard.press("ArrowDown");
await q.waitForTimeout(200);
res.kb2 = await q.evaluate(() => ({ active: document.activeElement?.getAttribute("data-testid"), label: (document.activeElement as HTMLElement)?.innerText?.replace(/\s+/g," ").trim() }));
await q.keyboard.press("End");
await q.waitForTimeout(200);
res.kbEnd = await q.evaluate(() => ({ active: document.activeElement?.getAttribute("data-testid"), label: (document.activeElement as HTMLElement)?.innerText?.replace(/\s+/g," ").trim() }));
await q.keyboard.press("Escape");
await q.waitForTimeout(300);
res.kbEsc = await q.evaluate(() => ({ expanded: document.querySelector('[data-testid="tools-nav-trigger-smart-edit"]')?.getAttribute("aria-expanded"), focus: document.activeElement?.getAttribute("data-testid") }));
// Enter on focused trigger navigates
await q.focus(trig);
await q.keyboard.press("Enter");
await q.waitForTimeout(800);
res.enterNav = { url: q.url() };
await browser.close();
console.log(JSON.stringify(res, null, 1));
