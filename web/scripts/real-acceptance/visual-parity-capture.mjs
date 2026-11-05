/**
 * 31 个可对照工具的双端截图采集（原站登录态 + 本地），1600×1000，同一浏览器。
 * 只读：不点击生成，不提交任何任务。
 * 用法：ego-browser nodejs < web/scripts/real-acceptance/visual-parity-capture.mjs
 * 可选：在脚本顶部 ONLY 里填工具 ID 只采集部分页面。
 */
const ONLY = [];
/** SIDES=["local"] 只重采本地（改代码后复核），默认双端。 */
const SIDES = ["original", "local"];
/** 并行采集时每个调用方用自己的任务空间名，避免互相抢页面。 */
const SPACE = "linkfox-1to1-visual-parity";
const REPO = "/Users/mac/Documents/Dev/infinite-canvas";
const OUT = `${REPO}/docs/V1.0/e2e-1to1/20261105`;
const fs = await import("node:fs");
const specs = JSON.parse(fs.readFileSync(`${REPO}/docs/V1.0/plan_linkfox_navigation/tool_specs.json`, "utf8")).tools;
const src = fs.readFileSync(`${REPO}/web/scripts/real-acceptance/original-baseline-audit.mjs`, "utf8");
const ROUTES = Object.fromEntries([...src.matchAll(/^\s+([A-Z0-9_]+): \["([^"]+)"/gm)].map((m) => [m[1], m[2]]));

const task = await taskSpace(SPACE);
const page = task.page("p1");
await page.cdp("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

const settle = async () => {
    await page.waitForLoadState().catch(() => {});
    await page.waitForTimeout(3500);
};
const result = [];
for (const t of specs) {
    const route = ROUTES[t.id];
    if (!route || (ONLY.length && !ONLY.includes(t.id))) continue;
    fs.mkdirSync(`${OUT}/${t.id}`, { recursive: true });
    const row = { id: t.id, label: t.label, original: `https://www.linkfox.com${route}`, local: `http://127.0.0.1:3000${t.route}` };
    for (const side of SIDES) {
        try {
            await page.goto(row[side]);
            await settle();
            row[`${side}Url`] = await page.url();
            row[`${side}Text`] = (await page.evaluate(() => document.body.innerText)).slice(0, 4000);
            await page.screenshot({ path: `${OUT}/${t.id}/${side}.png` });
        } catch (e) {
            row[`${side}Error`] = String(e?.message ?? e).slice(0, 300);
        }
    }
    result.push(row);
    console.log(t.id, row.originalUrl, row.localUrl, row.originalError ?? "", row.localError ?? "");
}
if (SIDES.length === 2 && !ONLY.length) fs.writeFileSync(`${OUT}/capture.json`, JSON.stringify(result, null, 2));
console.log("done", result.length, "space", task.spaceId);
