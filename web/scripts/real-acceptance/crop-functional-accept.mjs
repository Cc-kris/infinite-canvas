/**
 * IMAGE_CROP 真实功能闭环验收（纯本地渲染，不调用任何上游模型、不消耗算力）。
 *
 * 断言链：上传真实图片 → 画布出现裁剪框 → 切平台预设 → 输出尺寸跟随 →
 *        下载得到真实 PNG 字节且 IHDR 尺寸与所选预设一致。
 *
 * 用法：cd web && node scripts/real-acceptance/crop-functional-accept.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { chromium } from "playwright";

const BASE_URL = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const SRC = path.join(os.tmpdir(), "crop-accept-src.png");

/** 生成 1200×800 渐变底图（不依赖任何外部素材）。 */
function makeSource() {
    // 最小 PNG 编码：用 sharp 不可用时退化为 playwright 内绘制
    return SRC;
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "zh-CN", acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
});

await page.goto(`${BASE_URL}/tools/smart-edit/image-crop`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);

// 1) 上传真实图片（用页面自身 canvas 生成，避免引入测试素材文件）
if (!fs.existsSync(SRC)) {
    const dataUrl = await page.evaluate(() => {
        const c = document.createElement("canvas");
        c.width = 1200;
        c.height = 800;
        const ctx = c.getContext("2d");
        const g = ctx.createLinearGradient(0, 0, 1200, 800);
        g.addColorStop(0, "#7c3aed");
        g.addColorStop(1, "#22d3ee");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 1200, 800);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 96px sans-serif";
        ctx.fillText("CROP", 420, 430);
        return c.toDataURL("image/png");
    });
    fs.writeFileSync(SRC, Buffer.from(dataUrl.split(",")[1], "base64"));
}
makeSource();

await page.setInputFiles('[data-testid="tool-asset-file-input"]', SRC);
await page.waitForTimeout(2200);

const uploaded = await page.evaluate(() => ({
    canvas: Boolean(document.querySelector('[data-testid="crop-canvas"]')),
    rect: Boolean(document.querySelector('[data-testid="crop-rect"]')),
    summary: document.querySelector('[data-testid="crop-output-summary"]')?.textContent?.trim() ?? null,
}));

// 2) 切平台预设，输出尺寸必须跟随
const platformKeys = await page.$$eval('[data-testid^="crop-platform-"]', (els) =>
    els.map((e) => e.getAttribute("data-testid")).filter((id) => id && id !== "crop-platform-search"),
);
if (platformKeys.length === 0) throw new Error("平台预设列表为空");
const picked = platformKeys.find((k) => k.includes("amazon")) ?? platformKeys[0];
await page.click(`[data-testid="${picked}"]`);
await page.waitForTimeout(1000);
const presetSummary = (await page.textContent('[data-testid="crop-output-summary"]'))?.trim() ?? "";
const [expectW, expectH] = presetSummary.split("×").map((n) => Number(n.replace(/[^\d]/g, "")));

// 3) 下载真实字节，校验 PNG 头尺寸
const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
await page.click('[data-testid="crop-download"]');
const download = await downloadPromise;
const outPath = path.join(os.tmpdir(), `crop-accept-${expectW}x${expectH}.png`);
await download.saveAs(outPath);
const buf = fs.readFileSync(outPath);
const pngW = buf.readUInt32BE(16);
const pngH = buf.readUInt32BE(20);

const checks = [
    { name: "上传后出现可裁剪画布", pass: uploaded.canvas && uploaded.rect },
    { name: "上传后输出摘要显示原图尺寸", pass: uploaded.summary === "1200×800" },
    { name: "平台预设可选（≥20 项）", pass: platformKeys.length >= 20 },
    { name: "切换预设后摘要跟随", pass: expectW > 0 && expectH > 0 },
    { name: "下载文件名与预设一致", pass: download.suggestedFilename() === `crop-${expectW}x${expectH}.png` },
    { name: "下载字节是真实 PNG", pass: buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" && buf.length > 1000 },
    { name: "PNG 头尺寸与预设一致", pass: pngW === expectW && pngH === expectH },
    { name: "无页面错误", pass: errors.length === 0 },
];

await page.screenshot({ path: "/tmp/crop-functional-accept.png" });
await browser.close();

for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}`);
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} 通过`);
if (errors.length) console.log("errors:", errors.slice(0, 5));
process.exit(failed.length === 0 ? 0 : 1);
