/** 音频生成：OpenAI 兼容 /audio/speech，返回原始字节。 */
import { buildApiUrl, fetchUpstream, openAiHeaders, readApiErrorMessage, readResponseText, statusMessage, UpstreamError } from "./shared.mjs";

const AUDIO_MIME = {
    wav: "audio/wav",
    opus: "audio/opus",
    aac: "audio/aac",
    flac: "audio/flac",
    pcm: "audio/pcm",
    mp3: "audio/mpeg",
};

function audioMimeType(format) {
    return AUDIO_MIME[format] || AUDIO_MIME.mp3;
}

function assertAudioConfig(config, model) {
    if (!String(model || "").trim()) throw new UpstreamError("请先选择音频模型");
    if (!String(config.baseUrl || "").trim()) throw new UpstreamError("请先在模型设置中填写渠道 Base URL");
    if (!String(config.apiKey || "").trim()) throw new UpstreamError("请先在模型设置中填写 API Key");
    if (config.apiFormat === "gemini") throw new UpstreamError("Gemini 渠道暂不支持音频生成");
}

export async function generateAudio(ctx, input) {
    const { config, prompt, voice, format, speed, instructions, signal } = input;
    const model = String(config.model || "").trim();
    assertAudioConfig(config, model);
    const mimeType = audioMimeType(format);
    const { response, scope } = await fetchUpstream(
        ctx,
        buildApiUrl(config.baseUrl, "/audio/speech"),
        {
            method: "POST",
            headers: openAiHeaders(config, "application/json"),
            body: JSON.stringify({
                model,
                input: prompt,
                voice,
                response_format: format,
                speed: Number(speed),
                ...(String(instructions || "").trim() ? { instructions: String(instructions).trim() } : {}),
            }),
        },
        { signal },
    );
    try {
        if (!response.ok) throw new UpstreamError(readApiErrorMessage(await readResponseText(response)) || statusMessage(response.status) || "音频生成失败", response.status);
        const contentType = String(response.headers.get("content-type") || "");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (contentType.includes("json")) {
            let payload;
            try {
                payload = JSON.parse(new TextDecoder().decode(bytes));
            } catch {
                payload = null;
            }
            if (typeof payload?.code === "number" && payload.code !== 0) throw new UpstreamError(payload.msg || "音频生成失败");
            if (payload?.error?.message) throw new UpstreamError(payload.error.message);
        }
        return { bytes, mimeType: contentType.startsWith("audio/") ? contentType : mimeType };
    } finally {
        scope.dispose();
    }
}

export { audioMimeType };
