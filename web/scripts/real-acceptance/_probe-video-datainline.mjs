/**
 * 探针：sub2api 的 /v1/videos 是否接受「视频 data URL 内联」。
 *
 * 只判定能力，不做验收结论。密钥从应用自身 localStorage（localhost:3000 origin）读取，
 * 全程只在内存里用，绝不打印 / 落盘。
 *
 * 用法：cd web && node scripts/real-acceptance/_probe-video-datainline.mjs [publicUrl]
 *   无参数 → 测 data URL；带参数 → 测公网 http(s) URL（对照）
 */
import fs from "node:fs/promises";
import { launchBrowser } from "./lib.mjs";

const APP = process.env.IC_BASE_URL || "http://localhost:3000";
const PROXY = process.env.IC_PROXY_URL || "http://127.0.0.1:23210";
const VIDEO_FILE = process.env.IC_PROBE_VIDEO || "/tmp/ic_cors_root/small.mp4";
const publicUrl = process.argv[2] || "";

const browser = await launchBrowser({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "zh-CN" });
const page = await context.newPage();
await page.goto(`${APP}/`, { waitUntil: "domcontentloaded" });

const channel = await page.evaluate(async () => {
    const mod = await import("/src/stores/use-config-store.ts");
    const cfg = mod.useConfigStore.getState().config;
    const ch = (cfg.channels || []).find((c) => /sub2api/i.test(c.baseUrl || ""));
    if (!ch) return { found: false, channels: (cfg.channels || []).map((c) => ({ id: c.id, baseUrl: c.baseUrl })) };
    return {
        found: true,
        baseUrl: ch.baseUrl,
        models: (ch.models || []).map((m) => ({ name: m.name, capability: m.capability })),
        apiKey: ch.apiKey,
    };
});

if (!channel.found) {
    console.log(JSON.stringify({ ok: false, reason: "no-sub2api-channel-on-this-origin", channels: channel.channels }, null, 2));
    await browser.close();
    process.exit(1);
}

const bytes = await fs.readFile(VIDEO_FILE);
const dataUrl = `data:video/mp4;base64,${bytes.toString("base64")}`;
const videos = [publicUrl || dataUrl];

const body = {
    model: "MiniMax-H3",
    prompt: "保持镜头与主体不变，把背景换成浅灰摄影棚。",
    seconds: 5,
    size: "1280x720",
    resolution_name: "720p",
    generate_audio: false,
    watermark: false,
    mode: "video_to_video",
    videos,
};

const started = Date.now();
const res = await page.evaluate(async ({ proxy, base, key, payload }) => {
    const r = await fetch(`${proxy}/${base}/v1/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(payload),
    });
    const text = await r.text();
    return { status: r.status, text: text.slice(0, 1200) };
}, { proxy: PROXY, base: channel.baseUrl.replace(/\/$/, ""), key: channel.apiKey, payload: body });

console.log(JSON.stringify({
    mode: publicUrl ? "public-url" : "data-url",
    videoBytes: bytes.length,
    payloadVideosLength: videos[0].length,
    channel: { baseUrl: channel.baseUrl, models: channel.models },
    status: res.status,
    body: res.text,
    elapsedMs: Date.now() - started,
}, null, 2));

await browser.close();
