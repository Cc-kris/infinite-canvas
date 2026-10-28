import { chromium } from "/Users/mac/Documents/Dev/infinite-canvas/web/node_modules/playwright/index.mjs";
import fs from "node:fs";

const BASE = "http://127.0.0.1:3000";
const out: any = { startedAt: new Date().toISOString() };
const browser = await chromium.launch({ executablePath: "/Users/mac/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" });

// ---------- desktop ----------
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
const page = await ctx.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.waitForTimeout(1600);
await page.waitForSelector('[data-testid="tools-nav-primary"]', { state: "visible", timeout: 20000 });

out.desktop = {};
out.desktop.triggers = await page.$$eval('[data-testid^="tools-nav-trigger-"]', (els) =>
  els.map((el) => ({ slug: el.getAttribute("data-testid")!.replace("tools-nav-trigger-", ""), label: (el as HTMLElement).innerText.trim(), expanded: el.getAttribute("aria-expanded"), haspopup: el.getAttribute("aria-haspopup"), href: el.getAttribute("href") })),
);
out.desktop.triggerLabels = out.desktop.triggers.map((t: any) => t.label);

// open each menu via hover and record entries
out.desktop.menus = {};
for (const t of out.desktop.triggers as any[]) {
  await page.hover(`[data-testid="tools-nav-trigger-${t.slug}"]`);
  const sel = `[data-testid="tools-nav-menu-${t.slug}"]`;
  await page.waitForSelector(sel, { timeout: 4000 });
  out.desktop.menus[t.slug] = await page.$$eval(`${sel} [role="menuitem"]`, (els) =>
    els.map((el) => ({ label: (el as HTMLElement).innerText.trim(), href: el.getAttribute("href"), testid: el.getAttribute("data-testid"), origin: el.getAttribute("data-origin") })),
  );
  out.desktop[`ariaExpandedWhileOpen_${t.slug}`] = await page.getAttribute(`[data-testid="tools-nav-trigger-${t.slug}"]`, "aria-expanded");
  await page.mouse.move(5, 400);
  await page.waitForTimeout(250);
}
out.desktop.menuCounts = Object.fromEntries(Object.entries(out.desktop.menus).map(([k, v]: any) => [k, v.length]));

// keyboard: ArrowDown opens + focuses first entry, Escape closes and restores focus
const firstTrigger = '[data-testid="tools-nav-trigger-product-design"]';
await page.focus(firstTrigger);
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(120);
out.desktop.keyboardOpen = {
  expanded: await page.getAttribute(firstTrigger, "aria-expanded"),
  activeText: await page.evaluate(() => (document.activeElement as HTMLElement)?.innerText?.trim() ?? ""),
  activeRole: await page.evaluate(() => document.activeElement?.getAttribute("role") ?? ""),
};
await page.keyboard.press("ArrowDown");
out.desktop.keyboardSecondEntry = await page.evaluate(() => (document.activeElement as HTMLElement)?.innerText?.trim() ?? "");
await page.keyboard.press("End");
out.desktop.keyboardLastEntry = await page.evaluate(() => (document.activeElement as HTMLElement)?.innerText?.trim() ?? "");
await page.keyboard.press("Escape");
await page.waitForTimeout(120);
out.desktop.keyboardClosed = {
  expanded: await page.getAttribute(firstTrigger, "aria-expanded"),
  menuStillOpen: (await page.$('[data-testid="tools-nav-menu-product-design"]')) !== null,
  focusReturnedToTrigger: await page.evaluate(() => document.activeElement?.getAttribute("data-testid")),
};

// breadcrumb-less active state check via URL (client-side navigation)
await page.evaluate(() => {
  history.pushState({}, "", "/tools/product-design/new-designer");
  dispatchEvent(new PopStateEvent("popstate"));
});
await page.waitForTimeout(400);
out.desktop.activeOnToolRoute = {
  activeTrigger: await page.evaluate(() => document.querySelector('[data-testid^="tools-nav-trigger-"][data-active="true"]')?.getAttribute("data-testid") ?? null),
  ariaCurrent: await page.evaluate(() => document.querySelector('[data-testid^="tools-nav-trigger-"][aria-current="page"]')?.getAttribute("data-testid") ?? null),
};
await page.hover('[data-testid="tools-nav-trigger-product-design"]');
await page.waitForSelector('[data-testid="tools-nav-menu-product-design"]');
out.desktop.activeEntry = await page.evaluate(() => document.querySelector('[data-testid^="tools-nav-item-"][data-active="true"]')?.getAttribute("data-testid") ?? null);

await page.screenshot({ path: "/tmp/navverify/desktop-open-menu.png", fullPage: false });
await page.keyboard.press("Escape");
await page.waitForTimeout(150);
await page.screenshot({ path: "/tmp/navverify/desktop-closed.png" });

// overflow check
out.desktop.noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
out.desktop.consoleErrors = errors;

// ---------- English ----------
const enPage = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await enPage.addInitScript(() => localStorage.setItem("infinite-canvas:locale", "en-US"));
await enPage.goto(BASE + "/", { waitUntil: "networkidle" });
await enPage.waitForTimeout(1600);
await enPage.waitForSelector('[data-testid="tools-nav-primary"]', { state: "visible" });
out.english = {
  triggers: await enPage.$$eval('[data-testid^="tools-nav-trigger-"]', (els) => els.map((el) => (el as HTMLElement).innerText.trim())),
};
await enPage.hover('[data-testid="tools-nav-trigger-ai-video"]');
await enPage.waitForSelector('[data-testid="tools-nav-menu-ai-video"]');
out.english.aiVideoMenu = await enPage.$$eval('[data-testid="tools-nav-menu-ai-video"] [role="menuitem"]', (els) => els.map((el) => (el as HTMLElement).innerText.trim()));
await enPage.screenshot({ path: "/tmp/navverify/desktop-en-open-menu.png" });

// ---------- mobile ----------
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "zh-CN" });
const m = await mctx.newPage();
await m.goto(BASE + "/", { waitUntil: "networkidle" });
await m.waitForTimeout(1600);
await m.waitForSelector('[data-testid="tools-nav-primary"]', { state: "attached" });
out.mobile = {
  desktopNavHidden: await m.evaluate(() => {
    const el = document.querySelector('[data-testid="tools-nav-primary"]') as HTMLElement;
    return getComputedStyle(el).display === "none";
  }),
  hamburgerVisible: await m.isVisible('[data-testid="tools-nav-mobile-trigger"]'),
};
await m.click('[data-testid="tools-nav-mobile-trigger"]');
await m.waitForSelector('[data-testid="tools-nav-mobile"]', { timeout: 5000 });
out.mobile.drawerOpen = true;
out.mobile.categories = await m.$$eval('[data-testid^="mobile-tools-nav-category-"]', (els) => els.map((el) => ({ slug: el.getAttribute("data-testid")!.replace("mobile-tools-nav-category-", ""), label: (el as HTMLElement).innerText.replace(/\s+/g, " ").trim() })));
// expand all categories
for (const c of out.mobile.categories) {
  const toggle = `[data-testid="mobile-tools-nav-toggle-${c.slug}"]`;
  if ((await m.getAttribute(toggle, "aria-expanded")) !== "true") await m.click(toggle);
  await m.waitForTimeout(120);
}
out.mobile.itemCounts = {};
for (const c of out.mobile.categories) {
  out.mobile.itemCounts[c.slug] = await m.$$eval(`[id="mobile-tools-nav-panel-${c.slug}"] [data-testid^="mobile-tools-nav-item-"]`, (els) => els.map((el) => ({ label: (el as HTMLElement).innerText.replace(/\s+/g, " ").trim(), href: el.getAttribute("href") })));
}
out.mobile.counts = Object.fromEntries(Object.entries(out.mobile.itemCounts).map(([k, v]: any) => [k, v.length]));
out.mobile.workspaceLinks = await m.$$eval('[data-testid^="mobile-workspace-link-"]', (els) => els.map((el) => (el as HTMLElement).innerText.trim()));
out.mobile.noHorizontalOverflow = await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
await m.screenshot({ path: "/tmp/navverify/mobile-drawer-open.png", fullPage: false });

fs.writeFileSync("/tmp/navverify/dom-evidence.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify({
  triggers: out.desktop.triggerLabels,
  menuCounts: out.desktop.menuCounts,
  keyboard: out.desktop.keyboardOpen,
  keyboardClosed: out.desktop.keyboardClosed,
  activeOnToolRoute: out.desktop.activeOnToolRoute,
  activeEntry: out.desktop.activeEntry,
  en: out.english.triggers,
  enMenu: out.english.aiVideoMenu,
  mobileCounts: out.mobile.counts,
  mobileCategories: out.mobile.categories.map((c: any) => c.label),
  mobileHiddenDesktopNav: out.mobile.desktopNavHidden,
  overflow: [out.desktop.noHorizontalOverflow, out.mobile.noHorizontalOverflow],
  errors: errors.slice(0, 5),
}, null, 1));
await browser.close();
