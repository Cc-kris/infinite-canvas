import path from "node:path";
import { launchBrowser, prepareContext, sleep, BASE_URL } from "./lib.mjs";
const FIXTURES = path.resolve("scripts/real-acceptance/fixtures");
const browser = await launchBrowser({ headless: true });
try {
  const { page, network } = await prepareContext(browser);
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  await page.goto(`${BASE_URL}/tools/smart-edit/change-color`, { waitUntil: "domcontentloaded" });
  await sleep(3000);
  const fileInputs = await page.locator('input[type=file]').count();
  console.log("fileInputs:", fileInputs);
  const inp = page.locator('input[type=file]').first();
  await inp.setInputFiles(path.join(FIXTURES, "apparel-print.jpg"));
  await sleep(3000);
  const meta = await page.locator('[data-testid=change-color-source-meta]').allInnerTexts().catch(()=>[]);
  console.log("sourceMeta:", meta);
  await page.fill("[data-testid=change-color-hex]", "#2E6BE6");
  await page.locator("[data-testid=change-color-hex]").blur();
  await sleep(1200);
  const state = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid=change-color-generate]');
    const issues = document.querySelector('[data-testid=change-color-issues]');
    const region = document.querySelector('[data-testid=change-color-region-label]');
    const maskState = document.querySelector('[data-testid=change-color-mask-state]');
    return {
      btnDisabled: btn ? btn.disabled : null,
      btnText: btn ? btn.textContent : null,
      issues: issues ? issues.innerText : null,
      region: region ? region.innerText : null,
      maskState: maskState ? maskState.innerText : null,
      hasWorkspace: !!document.querySelector('[data-testid=change-color-workspace]'),
    };
  });
  console.log("state:", JSON.stringify(state, null, 1));
  console.log("consoleErrors:", errs.slice(0, 5));
  console.log("network:", JSON.stringify(network).slice(0, 400));
  await page.screenshot({ path: "/tmp/probe-color.png", fullPage: true });
} finally {
  await browser.close();
}
