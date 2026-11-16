/** 生图 / 改图：OpenAI 兼容 /images/generations、/images/edits 与 Gemini generateContent。 */
import { randomUUID } from "node:crypto";

import { buildApiUrl, dataUrlToBlob, geminiApiUrl, geminiHeaders, isRecord, openAiHeaders, requestUpstreamJson, UpstreamError, withSystemPrompt } from "./shared.mjs";

const IMAGE_QUALITY_VALUES = ["low", "medium", "high", "xhigh", "max"];
const DEFAULT_IMAGE_SHORT_SIDE = 1024;
const IMAGE_SIZE_STEP = 16;
const IMAGE_MIN_PIXELS = 655360;
const IMAGE_MAX_PIXELS = 8294400;
const IMAGE_MAX_EDGE = 3840;
const IMAGE_MAX_RATIO = 3;
const IMAGE_OUTPUT_FORMAT = "png";
const IMAGE_REQUEST_TIMEOUT_MS = 20 * 60_000;

const IMAGE_SIZE_PRESETS = {
    "1k": { "1:1": "1024x1024", "2:3": "1024x1536", "3:2": "1536x1024", "4:3": "1024x768", "3:4": "768x1024", "16:9": "1536x864", "9:16": "864x1536", "21:9": "2016x864", "9:21": "864x2016" },
    "2k": { "1:1": "2048x2048", "2:3": "1360x2048", "3:2": "2048x1360", "4:3": "2048x1536", "3:4": "1536x2048", "16:9": "2048x1152", "9:16": "1152x2048", "21:9": "2688x1152", "9:21": "1152x2688" },
    "4k": { "1:1": "2880x2880", "2:3": "2336x3520", "3:2": "3520x2336", "4:3": "3312x2480", "3:4": "2480x3312", "16:9": "3840x2160", "9:16": "2160x3840", "21:9": "3840x1648", "9:21": "1648x3840" },
};

const GEMINI_SUPPORTED_RATIOS = ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"];
const HTML_SOURCE_PATTERN = /^\s*<(?:!doctype|html|head|body|script|div|p|pre)/i;
const DATA_IMAGE_PATTERN = /^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i;

function normalizeQuality(quality) {
    const value = String(quality || "").trim().toLowerCase();
    return IMAGE_QUALITY_VALUES.includes(value) ? value : undefined;
}

function normalizeBackground(background) {
    return String(background || "").trim().toLowerCase() === "transparent" ? "transparent" : undefined;
}

function parseRatioValue(value) {
    const parts = String(value || "").split(":");
    if (parts.length !== 2) throw new UpstreamError("图片尺寸格式不正确，请使用 1024x1024 或 1:1");
    const width = Number(parts[0]);
    const height = Number(parts[1]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new UpstreamError("图片比例必须是正数");
    return { width, height };
}

function parseImageRatio(value) {
    const ratio = parseRatioValue(value);
    if (Math.max(ratio.width, ratio.height) / Math.min(ratio.width, ratio.height) > IMAGE_MAX_RATIO) throw new UpstreamError("图片比例不能超过 3:1");
    return ratio;
}

function parseImageDimensions(value) {
    const match = String(value || "").match(/^(\d+)x(\d+)$/i);
    return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

function validateImageSize(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new UpstreamError("图片宽高必须是正整数");
    if (width % IMAGE_SIZE_STEP !== 0 || height % IMAGE_SIZE_STEP !== 0) throw new UpstreamError(`图片宽高必须是 ${IMAGE_SIZE_STEP} 的倍数`);
    if (Math.max(width, height) > IMAGE_MAX_EDGE) throw new UpstreamError(`图片边长不能超过 ${IMAGE_MAX_EDGE}`);
    if (Math.max(width, height) / Math.min(width, height) > IMAGE_MAX_RATIO) throw new UpstreamError("图片比例不能超过 3:1");
    const pixels = width * height;
    if (pixels < IMAGE_MIN_PIXELS || pixels > IMAGE_MAX_PIXELS) throw new UpstreamError(`图片像素总量需在 ${IMAGE_MIN_PIXELS}～${IMAGE_MAX_PIXELS} 之间`);
}

function resolveSize(ratio) {
    const parsedRatio = parseImageRatio(ratio);
    const preset = IMAGE_SIZE_PRESETS["1k"][ratio];
    if (preset) return preset;
    const isLandscape = parsedRatio.width >= parsedRatio.height;
    const longRatio = isLandscape ? parsedRatio.width / parsedRatio.height : parsedRatio.height / parsedRatio.width;
    const longSide = Math.round((DEFAULT_IMAGE_SHORT_SIDE * longRatio) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    const width = isLandscape ? longSide : DEFAULT_IMAGE_SHORT_SIDE;
    const height = isLandscape ? DEFAULT_IMAGE_SHORT_SIDE : longSide;
    validateImageSize(width, height);
    return `${width}x${height}`;
}

function resolveRequestSize(size) {
    const value = String(size || "").trim();
    if (!value || value.toLowerCase() === "auto") return undefined;
    const dimensions = parseImageDimensions(value);
    if (dimensions) {
        validateImageSize(dimensions.width, dimensions.height);
        return `${dimensions.width}x${dimensions.height}`;
    }
    if (value.includes(":")) return resolveSize(value);
    throw new UpstreamError("图片尺寸格式不正确，请使用 1024x1024 或 1:1");
}

function resolveGeminiImageConfig(size) {
    const value = String(size || "").trim();
    const dimensions = parseImageDimensions(value);
    const ratio = dimensions ? `${dimensions.width}:${dimensions.height}` : value;
    const aspectRatio = value && value.toLowerCase() !== "auto" ? closestGeminiAspectRatio(ratio) : undefined;
    const imageSize = resolveGeminiImageSize(dimensions);
    const image = { ...(aspectRatio ? { aspectRatio } : {}), ...(imageSize ? { imageSize } : {}) };
    return Object.keys(image).length ? { imageConfig: image } : {};
}

function closestGeminiAspectRatio(value) {
    const ratio = parseImageRatio(value);
    const target = ratio.width / ratio.height;
    return GEMINI_SUPPORTED_RATIOS.reduce((best, item) => {
        const current = parseRatioValue(item);
        const bestRatio = parseRatioValue(best);
        return Math.abs(current.width / current.height - target) < Math.abs(bestRatio.width / bestRatio.height - target) ? item : best;
    });
}

function resolveGeminiImageSize(dimensions) {
    if (!dimensions) return undefined;
    const size = `${dimensions.width}x${dimensions.height}`;
    const scale = Object.keys(IMAGE_SIZE_PRESETS).find((key) => Object.values(IMAGE_SIZE_PRESETS[key]).includes(size));
    if (scale) return scale.toUpperCase();
    const edge = Math.max(dimensions.width, dimensions.height);
    if (edge <= 768) return "512";
    if (edge <= 1536) return "1K";
    if (edge <= 3072) return "2K";
    return "4K";
}

export function isUsableImageSource(value) {
    if (typeof value !== "string") return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (HTML_SOURCE_PATTERN.test(trimmed)) return false;
    if (/^[{[]/.test(trimmed)) return false;
    return DATA_IMAGE_PATTERN.test(trimmed) || /^https?:\/\//i.test(trimmed) || /^blob:/i.test(trimmed) || /^gs:\/\//i.test(trimmed);
}

function resolveImageItem(item) {
    const remote = typeof item.url === "string" && /^https?:\/\//i.test(item.url) && isUsableImageSource(item.url) ? item.url : undefined;
    if (typeof item.b64_json === "string" && item.b64_json) {
        return remote ? { dataUrl: `data:image/png;base64,${item.b64_json}`, url: remote } : { dataUrl: `data:image/png;base64,${item.b64_json}` };
    }
    if (typeof item.url === "string" && item.url && isUsableImageSource(item.url)) {
        return { dataUrl: item.url, url: remote };
    }
    return null;
}

function parseImagePayload(payload) {
    if (typeof payload?.code === "number" && payload.code !== 0) throw new UpstreamError(payload.msg || "图片生成失败");
    const imageList = payload?.data || payload?.images || payload?.results || [];
    const images = imageList
        .filter(isRecord)
        .map(resolveImageItem)
        .filter(Boolean)
        .map((item) => ({ id: randomUUID(), dataUrl: item.dataUrl, ...(item.url ? { url: item.url } : {}) }));
    if (!images.length) {
        const rawKeys = Object.keys(payload || {}).filter((key) => key !== "code" && key !== "msg" && key !== "error");
        throw new UpstreamError(rawKeys.length ? `无法识别上游图片响应：${rawKeys.join(", ")}` : "上游没有返回图片");
    }
    return images;
}

function geminiImagePart(dataUrl) {
    const match = String(dataUrl || "").match(/^data:([^;,]+);base64,(.+)$/s);
    if (match) return { inlineData: { mimeType: match[1], data: match[2] } };
    return { fileData: { fileUri: dataUrl, mimeType: "image/png" } };
}

function validateGeminiPayload(payload) {
    if (payload?.error?.message) throw new UpstreamError(payload.error.message);
    if (payload?.promptFeedback?.blockReason) throw new UpstreamError(`Gemini 拒绝了该提示词（${payload.promptFeedback.blockReason}）`);
}

function parseGeminiImagePayload(payload) {
    validateGeminiPayload(payload);
    const images =
        payload?.candidates
            ?.flatMap((candidate) => candidate.content?.parts || [])
            .map((part) => {
                const inlineData = part.inlineData || (part.inline_data ? { mimeType: part.inline_data.mimeType || part.inline_data.mime_type, data: part.inline_data.data } : undefined);
                if (inlineData?.data) return `data:${inlineData.mimeType || "image/png"};base64,${inlineData.data}`;
                return part.fileData?.fileUri || null;
            })
            .filter((value) => isUsableImageSource(value))
            .map((dataUrl) => ({ id: randomUUID(), dataUrl })) || [];
    if (!images.length) throw new UpstreamError("Gemini 没有返回图片");
    return images;
}

async function requestGeminiImages(ctx, config, prompt, references, count, signal) {
    const parts = [{ text: prompt }];
    for (const dataUrl of references) parts.push(geminiImagePart(dataUrl));
    const systemInstruction = String(config.systemPrompt || "").trim();
    const generationConfig = {
        responseModalities: ["TEXT", "IMAGE"],
        ...resolveGeminiImageConfig(config.size),
    };
    const requests = Array.from({ length: count }, async () => {
        const payload = await requestUpstreamJson(ctx, geminiApiUrl({ ...config, model: config.model }), {
            method: "POST",
            headers: geminiHeaders(config),
            body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig, ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}) }),
            signal,
            timeoutMs: IMAGE_REQUEST_TIMEOUT_MS,
            fallback: "图片生成失败",
        });
        return parseGeminiImagePayload(payload);
    });
    return (await Promise.all(requests)).flat();
}

function assertImageConfig(config) {
    if (!String(config.baseUrl || "").trim()) throw new UpstreamError("请先在模型设置中填写渠道 Base URL");
    if (!String(config.apiKey || "").trim()) throw new UpstreamError("请先在模型设置中填写 API Key");
    if (!String(config.model || "").trim()) throw new UpstreamError("请先选择图片模型");
}

function buildEditForm(config, prompt, references, n, quality, requestSize, background) {
    const form = new FormData();
    form.set("model", config.model);
    form.set("prompt", withSystemPrompt(config, prompt));
    form.set("n", String(n));
    if (!/gpt-image/.test(config.model)) form.set("response_format", "b64_json");
    form.set("output_format", IMAGE_OUTPUT_FORMAT);
    if (quality) form.set("quality", quality);
    if (requestSize) form.set("size", requestSize);
    if (background) form.set("background", background);
    const blobs = references.map((dataUrl) => dataUrlToBlob(dataUrl, "image/png")).filter(Boolean);
    const field = blobs.length > 1 ? "image[]" : "image";
    blobs.forEach((blob, index) => form.append(field, new File([blob], `ref_${index + 1}.png`, { type: blob.type || "image/png" })));
    return form;
}

export async function generateImages(ctx, input) {
    const config = input.config || {};
    const prompt = String(input.prompt || "");
    const count = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(input.count)) || 1)));
    const quality = normalizeQuality(input.quality);
    const requestSize = resolveRequestSize(input.size);
    const background = normalizeBackground(input.background);
    const references = input.references || [];
    const signal = input.signal;
    const isEdit = references.length > 0;
    assertImageConfig(config);

    if (config.apiFormat === "gemini") {
        if (isEdit) assertImageConfig(config);
        return requestGeminiImages(ctx, config, prompt, references, count, signal);
    }

    if (!isEdit) {
        const payload = await requestUpstreamJson(ctx, buildApiUrl(config.baseUrl, "/images/generations"), {
            method: "POST",
            headers: openAiHeaders(config, "application/json"),
            body: JSON.stringify({
                model: config.model,
                prompt: withSystemPrompt(config, prompt),
                n: count,
                ...(quality ? { quality } : {}),
                ...(requestSize ? { size: requestSize } : {}),
                ...(background ? { background } : {}),
                ...(/gpt-image/.test(config.model) ? {} : { response_format: "b64_json" }),
                output_format: IMAGE_OUTPUT_FORMAT,
            }),
            signal,
            timeoutMs: IMAGE_REQUEST_TIMEOUT_MS,
            fallback: "图片生成失败",
        });
        return parseImagePayload(payload);
    }

    const form = buildEditForm(config, prompt, references, count, quality, requestSize, background);
    const payload = await requestUpstreamJson(ctx, buildApiUrl(config.baseUrl, "/images/edits"), {
        method: "POST",
        headers: openAiHeaders(config),
        body: form,
        signal,
        timeoutMs: IMAGE_REQUEST_TIMEOUT_MS,
        fallback: "图片编辑失败",
    });
    return parseImagePayload(payload);
}
