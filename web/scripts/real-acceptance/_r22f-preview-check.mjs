/** R22-F：用真 Chrome（Playwright）验证结果字节可解码可播放，绕开后台标签媒体节流。 */
import path from "node:path";
import { chromium } from "playwright";

const FILE = path.resolve("../docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/downloaded.mp4");
const PUBLIC = "https://telephony-affects-borders-wider.trycloudflare.com/__media/928c4113c960de0c5ffd1c31bc84d047.mp4";
const OUT = path.resolve("../docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 480, height: 360 } });
const page = await ctx.newPage();
const out = { file: FILE, results: {} };

async function probe(label, src) {
  await page.setContent(`<body style="margin:0;background:#111"><video id="v" src="${src}" controls preload="metadata" style="width:480px"></video></body>`);
  const r = await page.evaluate(async () => {
    const v = document.getElementById("v");
    const meta = await new Promise((res) => {
      let done = false;
      const fin = (x) => { if (!done) { done = true; res(x); } };
      v.addEventListener("loadedmetadata", () => fin("loadedmetadata"), { once: true });
      v.addEventListener("error", () => fin("error:" + (v.error && v.error.code)), { once: true });
      setTimeout(() => fin("timeout"), 15000);
    });
    let played = null;
    try {
      v.muted = true;
      await v.play();
      await new Promise((r2) => setTimeout(r2, 1200));
      played = { currentTime: v.currentTime, paused: v.paused };
      v.pause();
    } catch (e) { played = { error: String(e).slice(0, 120) }; }
    return { meta, duration: v.duration, videoWidth: v.videoWidth, videoHeight: v.videoHeight, readyState: v.readyState, networkState: v.networkState, played };
  });
  await page.screenshot({ path: path.join(OUT, `preview-${label}.png`) });
  out.results[label] = r;
}

await probe("file", "file://" + FILE);
await probe("public", PUBLIC);
console.log(JSON.stringify(out, null, 2));
await browser.close();
