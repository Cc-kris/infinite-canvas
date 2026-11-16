/** 语音转录：临时音频文件 → OpenAI 兼容 /audio/transcriptions。 */
import { readFile } from "node:fs/promises";

import { HttpError } from "../http.mjs";
import { resolveTemp, removeTemp } from "../media/uploads.mjs";
import { buildApiUrl, fetchUpstream, upstreamErrorFromResponse } from "../providers/shared.mjs";

export async function transcribeAudio(ctx, body, signal) {
    const config = body.config || {};
    const model = String(config.model || "").trim();
    if (!model || !String(config.baseUrl || "").trim() || !String(config.apiKey || "").trim()) {
        throw new HttpError(400, "transcription-unavailable", "请先在模型设置中配置支持语音转录的音频模型；普通 TTS 模型不能代替 ASR");
    }
    if (config.apiFormat !== "openai") {
        throw new HttpError(400, "transcription-unavailable", "当前所选音频通道未实现语音转录；请配置支持 OpenAI 兼容 /audio/transcriptions 的 ASR 服务");
    }

    const filePath = resolveTemp(ctx.dataRoot, body.audioId);
    try {
        const bytes = await readFile(filePath);
        const form = new FormData();
        form.set("model", model);
        form.set("file", new File([bytes], "source-audio.mp3", { type: body.mimeType || "audio/mpeg" }));
        if (body.sourceLanguage && body.sourceLanguage !== "auto") form.set("language", String(body.sourceLanguage));
        form.set("response_format", "verbose_json");
        form.set("timestamp_granularities[]", "segment");

        let response;
        let scope;
        try {
            ({ response, scope } = await fetchUpstream(
                ctx,
                buildApiUrl(config.baseUrl, "/audio/transcriptions"),
                { method: "POST", headers: { Authorization: `Bearer ${config.apiKey}` }, body: form },
                { signal },
            ));
        } catch (error) {
            if (signal?.aborted) throw new HttpError(499, "aborted", "已取消语音转录");
            throw new HttpError(502, "transcription-failed", `语音转录失败：${error?.message || "请检查 ASR 服务配置"}`);
        }
        try {
            if (!response.ok) {
                const detail = await upstreamErrorFromResponse(response, "语音转录失败");
                throw new HttpError(502, "transcription-failed", `语音转录失败：${detail.message}`);
            }
            let payload;
            try {
                payload = await response.json();
            } catch (error) {
                throw new HttpError(502, "transcription-failed", "语音转录失败，请检查 ASR 服务配置");
            }
            const text = String(payload?.text || "").trim();
            const segments = (Array.isArray(payload?.segments) ? payload.segments : []).flatMap((segment) => {
                const startMs = Number(segment?.start) * 1000;
                const endMs = Number(segment?.end) * 1000;
                const content = String(segment?.text || "").trim();
                return content && Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs ? [{ startMs, endMs, text: content }] : [];
            });
            return { text, language: payload?.language, segments };
        } finally {
            scope?.dispose();
        }
    } finally {
        removeTemp(ctx.dataRoot, [body.audioId]);
    }
}
