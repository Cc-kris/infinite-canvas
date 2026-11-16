import i18n from "@/i18n";
import { buildImageReferencePromptText } from "@/lib/image-reference-prompt";
import { imageSizePresets, inferMediaScale } from "@/lib/media-size";
import { shrinkInlineImages } from "@/lib/inline-image";
import { imageToDataUrl } from "@/services/image-storage";
import { resolveModelRequestConfig, resolveModelScript, type AiConfig, type ModelChannel } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

import { DesktopRequestError } from "./desktop/http";
import { requestImageEdit, requestImageGeneration, requestModels, requestTextChat } from "./desktop/capabilities/providers";
import { normalizePluginImages, runModelPlugin } from "./model-plugin";
import { nanoid } from "nanoid";

const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

export type AiTextMessage = {
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

type RequestOptions = { signal?: AbortSignal };

const IMAGE_SIZE_STEP = 16;
const IMAGE_MIN_PIXELS = 655360;
const IMAGE_MAX_PIXELS = 8294400;
const IMAGE_MAX_EDGE = 3840;
const IMAGE_MAX_RATIO = 3;
const DEFAULT_IMAGE_SHORT_SIDE = 1024;

function parseRatioValue(value: string) {
    const parts = value.split(":");
    if (parts.length !== 2) throw new Error(apiText("invalidImageSizeFormat"));
    const w = Number(parts[0]);
    const h = Number(parts[1]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) throw new Error(apiText("positiveImageRatio"));
    return { width: w, height: h };
}

function parseImageRatio(value: string) {
    const ratio = parseRatioValue(value);
    if (Math.max(ratio.width, ratio.height) / Math.min(ratio.width, ratio.height) > IMAGE_MAX_RATIO) throw new Error(apiText("imageRatioLimit"));
    return ratio;
}

function validateImageSize(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error(apiText("positiveImageDimensions"));
    if (width % IMAGE_SIZE_STEP !== 0 || height % IMAGE_SIZE_STEP !== 0) throw new Error(apiText("imageDimensionStep"));
    if (Math.max(width, height) > IMAGE_MAX_EDGE) throw new Error(apiText("imageEdgeLimit"));
    if (Math.max(width, height) / Math.min(width, height) > IMAGE_MAX_RATIO) throw new Error(apiText("imageRatioLimit"));
    const pixels = width * height;
    if (pixels < IMAGE_MIN_PIXELS || pixels > IMAGE_MAX_PIXELS) throw new Error(apiText("imagePixelLimit"));
}

function parseImageDimensions(value: string) {
    const match = value.match(/^(\d+)x(\d+)$/i);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
}

function resolveSize(ratio: string): string {
    const parsedRatio = parseImageRatio(ratio);
    const preset = imageSizePresets["1k"][ratio];
    if (preset) return preset;
    const isLandscape = parsedRatio.width >= parsedRatio.height;
    const longRatio = isLandscape ? parsedRatio.width / parsedRatio.height : parsedRatio.height / parsedRatio.width;
    const longSide = Math.round((DEFAULT_IMAGE_SHORT_SIDE * longRatio) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    const width = isLandscape ? longSide : DEFAULT_IMAGE_SHORT_SIDE;
    const height = isLandscape ? DEFAULT_IMAGE_SHORT_SIDE : longSide;
    validateImageSize(width, height);
    return `${width}x${height}`;
}

/** 历史记录/外部写入的尺寸可能早于当前规则（例如 480x854），恢复前先判断，避免下一次生成直接在本地报错。 */
export function isSupportedImageSize(size: string) {
    const value = String(size || "").trim();
    if (!value || value.toLowerCase() === "auto") return true;
    const dimensions = parseImageDimensions(value);
    if (dimensions) {
        try {
            validateImageSize(dimensions.width, dimensions.height);
            return true;
        } catch {
            return false;
        }
    }
    if (value.includes(":")) {
        try {
            resolveSize(value);
            return true;
        } catch {
            return false;
        }
    }
    return false;
}

const HTML_SOURCE_PATTERN = /^\s*<(?:!doctype|html|head|body|script|div|p|pre)/i;
const DATA_IMAGE_PATTERN = /^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i;

/**
 * TASK-047：图片来源可用性判定。
 * 中转/网关异常时 `url` 常见会变成 HTML 错误页或 JSON 片段；直接当成图片写进历史记录，
 * 后续画布渲染才失败，等于假成功。这里只放行真正能被浏览器加载的来源。
 */
export function isUsableImageSource(value: unknown): value is string {
    if (typeof value !== "string") return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (HTML_SOURCE_PATTERN.test(trimmed)) return false;
    if (/^[{[]/.test(trimmed)) return false;
    return DATA_IMAGE_PATTERN.test(trimmed) || /^https?:\/\//i.test(trimmed) || /^blob:/i.test(trimmed) || /^gs:\/\//i.test(trimmed);
}

function readApiErrorMessage(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            const inner = readApiErrorMessage(parsed) || value;
            if (inner === value && typeof parsed === "object" && Object.keys(parsed).length === 0) return "";
            return inner;
        } catch {
            if (/<[a-z][\s\S]*>/i.test(value)) return apiText("htmlError", { preview: `${value.slice(0, 80)}...` });
            return value;
        }
    }
    if (typeof value !== "object") return "";
    const payload = value as { msg?: unknown; message?: unknown; error?: unknown; detail?: unknown };
    const errorMsg = typeof payload.error === "string" ? payload.error : (payload.error as { message?: unknown })?.message;
    return readApiErrorMessage(payload.msg) || readApiErrorMessage(payload.message) || readApiErrorMessage(errorMsg) || readApiErrorMessage(payload.detail) || "";
}

function statusErrorMessage(status: number, fallback: string) {
    if (status === 401 || status === 403) return apiText("authenticationFailed");
    if (status === 429) return apiText("rateLimited");
    if (status === 404) return apiText("notFound");
    if (status === 502) return apiText("badGateway");
    if (status === 503) return apiText("serviceBusy");
    return fallback;
}

function readProviderError(error: unknown, fallback: string) {
    if (error instanceof DOMException && error.name === "AbortError") return apiText("requestCanceled");
    if (error instanceof DesktopRequestError) {
        const message = readApiErrorMessage(error.message) || error.message || "";
        if (message && !/本地服务请求失败/.test(message)) return message;
        return statusErrorMessage(error.status, message || fallback);
    }
    if (error instanceof Error && error.name === "AbortError") return apiText("requestCanceled");
    return error instanceof Error ? readApiErrorMessage(error.message) || error.message : fallback;
}

function withSystemPrompt(config: AiConfig, prompt: string) {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
}

function withSystemMessage<T extends AiTextMessage>(config: AiConfig, messages: T[]) {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? [{ role: "system" as const, content: systemPrompt }, ...messages] : messages;
}

export async function requestGeneration(config: AiConfig, prompt: string, options?: RequestOptions) {
    const requestConfig = resolveModelRequestConfig(config, config.model || config.imageModel);
    const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const script = resolveModelScript(config, config.model || config.imageModel);
    if (script) {
        try {
            const result = await runModelPlugin({
                capability: "image",
                script,
                config: requestConfig,
                prompt: withSystemPrompt(requestConfig, prompt),
                images: [],
                params: { size: resolveRequestSize(config.size), resolution: inferMediaScale(config.size), quality: normalizeQuality(config.quality), count: n },
                signal: options?.signal,
            });
            return normalizePluginImages(result).map((dataUrl) => ({ id: nanoid(), dataUrl }));
        } catch (error) {
            throw new Error(readProviderError(error, apiText("requestFailed")));
        }
    }
    try {
        return await requestImageGeneration({
            config: requestConfig,
            prompt,
            count: n,
            quality: config.quality,
            size: config.size,
            background: config.background,
            signal: options?.signal,
        });
    } catch (error) {
        throw new Error(readProviderError(error, apiText("requestFailed")));
    }
}

export async function requestEdit(config: AiConfig, prompt: string, references: ReferenceImage[], options?: RequestOptions) {
    const requestConfig = resolveModelRequestConfig(config, config.model || config.imageModel);
    const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const requestPrompt = buildImageReferencePromptText(prompt, references);
    const script = resolveModelScript(config, config.model || config.imageModel);
    if (script) {
        const refs = await shrinkInlineImages(await Promise.all(references.map((image) => imageToDataUrl(image))));
        try {
            const result = await runModelPlugin({
                capability: "image",
                script,
                config: requestConfig,
                prompt: withSystemPrompt(requestConfig, requestPrompt),
                images: refs,
                params: { size: resolveRequestSize(config.size), resolution: inferMediaScale(config.size), quality: normalizeQuality(config.quality), count: n },
                signal: options?.signal,
            });
            return normalizePluginImages(result).map((dataUrl) => ({ id: nanoid(), dataUrl }));
        } catch (error) {
            throw new Error(readProviderError(error, apiText("requestFailed")));
        }
    }
    try {
        const refs = await shrinkInlineImages(await Promise.all(references.map((image) => imageToDataUrl(image))));
        return await requestImageEdit({
            config: requestConfig,
            prompt: requestPrompt,
            references: refs,
            count: n,
            quality: config.quality,
            size: config.size,
            background: config.background,
            signal: options?.signal,
        });
    } catch (error) {
        throw new Error(readProviderError(error, apiText("requestFailed")));
    }
}

export async function requestImageQuestion(config: AiConfig, messages: AiTextMessage[], onDelta: (text: string) => void, options?: RequestOptions) {
    const requestConfig = resolveModelRequestConfig(config, config.model || config.textModel);
    const script = resolveModelScript(config, config.model || config.textModel);
    if (script) {
        try {
            const answer = await runModelPlugin<string>({
                capability: "text",
                script,
                config: requestConfig,
                messages: withSystemMessage(requestConfig, messages),
                signal: options?.signal,
                onDelta,
            });
            const text = String(answer ?? "").trim() || apiText("noContent");
            if (text === apiText("noContent")) onDelta(text);
            return text;
        } catch (error) {
            throw new Error(readProviderError(error, apiText("requestFailed")));
        }
    }
    try {
        const result = await requestTextChat({ config: requestConfig, messages, onDelta, signal: options?.signal });
        const text = result.content || apiText("noContent");
        if (text === apiText("noContent")) onDelta(text);
        return text;
    } catch (error) {
        throw new Error(readProviderError(error, apiText("requestFailed")));
    }
}

export async function fetchImageModels(config: Pick<AiConfig, "baseUrl" | "apiKey" | "apiFormat">) {
    try {
        return await requestModels({ baseUrl: config.baseUrl, apiKey: config.apiKey, apiFormat: config.apiFormat });
    } catch (error) {
        throw new Error(readProviderError(error, apiText("modelReadFailed")));
    }
}

export async function fetchChannelModels(channel: ModelChannel) {
    return fetchImageModels({ baseUrl: channel.baseUrl, apiKey: channel.apiKey, apiFormat: channel.apiFormat });
}

function normalizeQuality(quality: string) {
    const value = quality.trim().toLowerCase();
    return ["low", "medium", "high", "xhigh", "max"].includes(value) ? value : undefined;
}

function resolveRequestSize(size: string) {
    const value = size.trim();
    if (!value || value.toLowerCase() === "auto") return undefined;
    const dimensions = parseImageDimensions(value);
    if (dimensions) {
        validateImageSize(dimensions.width, dimensions.height);
        return `${dimensions.width}x${dimensions.height}`;
    }
    if (value.includes(":")) return resolveSize(value);
    throw new Error(apiText("invalidImageSizeFormat"));
}
