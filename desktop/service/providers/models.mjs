/** 渠道模型列表：OpenAI /models 与 Gemini /models。 */
import { buildApiUrl, geminiApiUrl, geminiHeaders, requestUpstreamJson, UpstreamError } from "./shared.mjs";
import { validateGeminiPayload } from "./text.mjs";

const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";

export async function fetchModels(ctx, input) {
    const config = { ...input };
    if (config.apiFormat === "gemini") {
        const payload = await requestUpstreamJson(ctx, geminiApiUrl({ baseUrl: config.baseUrl || DEFAULT_GEMINI_BASE_URL, model: "" }), {
            headers: geminiHeaders({ apiKey: config.apiKey || "" }),
            fallback: "模型列表读取失败",
        });
        validateGeminiPayload(payload);
        return (payload.models || [])
            .map((model) => model.name?.replace(/^models\//, ""))
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b));
    }
    if (!String(config.baseUrl || "").trim()) throw new UpstreamError("模型列表读取失败：请先填写 Base URL");
    const payload = await requestUpstreamJson(ctx, buildApiUrl(config.baseUrl, "/models"), {
        headers: { Authorization: `Bearer ${config.apiKey || ""}` },
        fallback: "模型列表读取失败",
    });
    if (payload?.error?.message) throw new UpstreamError(payload.error.message);
    return (payload.data || [])
        .map((model) => model.id)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
}

export { validateGeminiPayload };
