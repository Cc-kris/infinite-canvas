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

export function providerConfig() {
    const apiKey = readKey("ccai_image2_api_key");
    const baseUrl = readKey("gpt_image2_base_url", "https://api.cc-ai.xyz");
    const model = readKey("ccai_image2_model", "gpt-image-2");
    if (!apiKey) throw new Error("keychain 未提供 ccai_image2_api_key：无法做真实 provider 调用");
    return { apiKey, baseUrl, model };
}

/** 把渠道写进 zustand 配置（与用户在 /config 里手工填写等价）。 */
export async function applyProviderConfig(page) {
    const { apiKey, baseUrl, model } = providerConfig();
    const info = await page.evaluate(async ({ apiKey, baseUrl, model }) => {
        const mod = await import("/src/stores/use-config-store.ts");
        const store = mod.useConfigStore;
        const prev = store.getState().config;
        const channelId = "ccai-accept";
        const channels = [{
            id: channelId,
            name: "ccai-tmp (CCAI 临时)",
            baseUrl,
            apiKey,
            apiFormat: "openai",
            models: [
                { name: model, capability: "image" },
                { name: "gpt-5.5", capability: "text" },
            ],
        }];
        store.setState({
            config: {
                ...prev,
                channelMode: "local",
                baseUrl,
                apiKey,
                apiFormat: "openai",
                channels,
                model: `${channelId}::${model}`,
                imageModel: `${channelId}::${model}`,
                textModel: `${channelId}::gpt-5.5`,
            },
        });
        const now = store.getState().config;
        return {
            baseUrl: now.baseUrl,
            imageModel: now.imageModel,
            channelCount: now.channels.length,
            keyLen: (now.apiKey || "").length,
        };
    }, { apiKey, baseUrl, model });
    // 只回报长度与地址，不回报密钥本体
    return info;
}
