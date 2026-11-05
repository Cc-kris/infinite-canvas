import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome", headless: true });
const c = await b.newContext({ locale: "zh-CN" });
const p = await c.newPage();
await p.goto("http://localhost:3000/tools/product-design/ornament-text", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2500);
const info = await p.evaluate(async () => {
  const m = await import("/src/stores/use-config-store.ts");
  const cfg = m.useConfigStore.getState().config;
  return {
    proxyEnabled: cfg.proxyEnabled, proxyUrl: cfg.proxyUrl, channelMode: cfg.channelMode,
    imageModel: cfg.imageModel,
    channels: (cfg.channels||[]).map(ch => ({ id: ch.id, name: ch.name, hasKey: Boolean(ch.apiKey), keyLen: (ch.apiKey||"").length, baseUrl: ch.baseUrl, models: (ch.models||[]).length })),
    defaults: { channels: (m.defaultConfig.channels||[]).map(ch=>({id:ch.id,hasKey:Boolean(ch.apiKey),baseUrl:ch.baseUrl})) },
  };
});
console.log(JSON.stringify(info, null, 1));
await b.close();
