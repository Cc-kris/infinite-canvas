/**
 * 为真实验收把「已配置的 provider」注进页面配置（密钥只在内存中传递，绝不打印/落盘）。
 * 来源：Galley keychain（ccai_image2_api_key / gpt_image2_base_url / ccai_image2_model）。
 */
import { execFileSync } from "node:child_process";

const MEM = "/Users/mac/Library/Application Support/app.galley/managed-ga-state/memory";

function readKey(name, fallback = "") {
    try {
        const out = execFileSync("python3", [
            "-c",
            `import sys;sys.path.insert(0,${JSON.stringify(MEM)});import keychain;print(keychain.keys.${name}.use())`,
        ], { encoding: "utf8" });
        // keychain 导入时会打印说明横幅（以 # 开头），只取最后一个非注释行
        const lines = out.split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
        return lines.length ? lines[lines.length - 1] : fallback;
    } catch {
        return fallback;
    }
}

/**
 * 图像渠道：CCAI gpt-image-2（实测 /v1/images/edits 200）。
 * 文本/视觉渠道：SiliconFlow Qwen3-VL-8B-Instruct（实测 CCAI 的 chat/responses 端点 502/503，
 * 只有图像能力可用；OCR/逐框翻译必须走能看图的文本渠道）。
 */
export function providerConfig() {
    const apiKey = readKey("ccai_image2_api_key");
    const baseUrl = readKey("gpt_image2_base_url", "https://api.cc-ai.xyz");
    const model = readKey("ccai_image2_model", "gpt-image-2");
    if (!apiKey) throw new Error("keychain 未提供 ccai_image2_api_key：无法做真实 provider 调用");
    const textApiKey = readKey("siliconflow_api_key");
    const textBaseUrl = readKey("siliconflow_base_url", "https://api.siliconflow.cn/v1");
    const textModel = process.env.IC_TEXT_MODEL || "Qwen/Qwen3-VL-8B-Instruct";
    return { apiKey, baseUrl, model, textApiKey, textBaseUrl, textModel };
}

/**
 * 把渠道写进 zustand 持久化存储（localStorage）后整页 reload。
 *
 * 为什么不用 `import("/src/stores/use-config-store.ts").useConfigStore.setState()`：
 * Vite dev 下应用入口是 `/src/main.tsx?t=xxx`，其内部 import 的 store 模块 URL 带 `?t=`，
 * 与裸路径 import 得到**两个模块实例**，改前者不影响应用真正使用的那份（实测点击仍打
 * api.openai.com、Authorization 只有 "Bearer"）。写 localStorage 再 reload 走应用自己的
 * hydrate 流程，与用户在设置页手填等价。
 */
export async function applyProviderConfig(page) {
    const { apiKey, baseUrl, model, textApiKey, textBaseUrl, textModel } = providerConfig();
    const KEY = "infinite-canvas:ai_config_store";
    await page.evaluate(({ KEY, apiKey, baseUrl, model, textApiKey, textBaseUrl, textModel }) => {
        const raw = localStorage.getItem(KEY);
        const parsed = raw ? JSON.parse(raw) : { state: {}, version: 0 };
        const cfg = { ...((parsed.state && parsed.state.config) || {}) };
        cfg.channelMode = "local";
        cfg.baseUrl = baseUrl;
        cfg.apiKey = apiKey;
        cfg.apiFormat = "openai";
        cfg.proxyEnabled = true;
        cfg.proxyUrl = "http://127.0.0.1:23210";
        cfg.channels = [
            { id: "ccai-accept", name: "ccai-tmp (CCAI 图像)", baseUrl, apiKey, apiFormat: "openai", models: [{ name: model, capability: "image" }] },
            {
                id: "sf-accept",
                name: "sf-tmp (SiliconFlow 文本/视觉)",
                baseUrl: textBaseUrl,
                apiKey: textApiKey,
                apiFormat: "openai",
                models: [{ name: textModel, capability: "text" }, { name: "deepseek-ai/DeepSeek-V3.2", capability: "text" }],
            },
        ];
        cfg.model = `sf-accept::${textModel}`;
        cfg.imageModel = `ccai-accept::${model}`;
        cfg.textModel = `sf-accept::${textModel}`;
        parsed.state = { ...(parsed.state || {}), config: cfg };
        localStorage.setItem(KEY, JSON.stringify(parsed));
    }, { KEY, apiKey, baseUrl, model, textApiKey, textBaseUrl, textModel });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const check = await page.evaluate((KEY) => {
        const raw = JSON.parse(localStorage.getItem(KEY));
        const c = raw.state.config;
        return { imageModel: c.imageModel, channels: c.channels.map((x) => x.id), baseUrl: c.baseUrl, keyLen: (c.apiKey || "").length, proxyEnabled: c.proxyEnabled };
    }, KEY);
    // 只回报长度与地址，不回报密钥本体
    return { ...check, channelCount: check.channels.length, model: model };
}
