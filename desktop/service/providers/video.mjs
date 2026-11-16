/** 视频生成：OpenAI /videos、Gemini predictLongRunning、通用 HTTP 协议提交与轮询。 */
import { randomUUID } from "node:crypto";

import { storeMediaBuffer } from "../storage/media.mjs";
import { buildApiUrl, fetchUpstream, geminiBaseUrl, isRecord, openAiHeaders, readApiErrorMessage, readResponseText, requestUpstreamJson, statusMessage, UpstreamError, withGatewayRetry } from "./shared.mjs";

const VIDEO_SUBMIT_TIMEOUT_MS = 180_000;
const VIDEO_POLL_TIMEOUT_MS = 60_000;
const VIDEO_DONE_STATUS = new Set(["completed", "complete", "done", "succeeded", "success", "finished"]);
const VIDEO_FAILED_STATUS = new Set(["failed", "failure", "error", "cancelled", "canceled"]);
const HTTP_RESULT_FALLBACK_PATHS = ["video.url", "video.video_url", "video_url", "videoUrl", "data.video.url", "data.video_url", "data.output.video_url", "output.video_url", "result.video_url", "url"];

export class VideoPayloadError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "VideoPayloadError";
        this.code = code;
    }
}

/** 只在上游没有 pollUrl 时暂存「提交即出结果」的地址；与进程同生命周期。 */
const immediateHttpResults = new Map();

function clampVideoSeconds(value) {
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(4, Math.min(30, seconds)));
}

function parseAspectRatio(value) {
    const match = String(value || "").match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    return width && height ? { width, height } : null;
}

function parsePixelSize(value) {
    const match = String(value || "").match(/^(\d+)x(\d+)$/i);
    return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

function inferVideoRatio(size) {
    const ratios = ["1:1", "3:4", "4:3", "16:9", "9:16", "21:9", "auto"];
    if (!size || size === "auto") return "auto";
    if (ratios.includes(size)) return size;
    const pixels = parsePixelSize(size) || parseAspectRatio(size);
    if (!pixels) return "16:9";
    const target = pixels.width / pixels.height;
    const options = ratios.filter((item) => item !== "auto");
    return options.reduce((best, item) => {
        const current = parseAspectRatio(item);
        const bestRatio = parseAspectRatio(best);
        const currentValue = current.width / current.height;
        const bestValue = bestRatio.width / bestRatio.height;
        return Math.abs(currentValue - target) < Math.abs(bestValue - target) ? item : best;
    }, "16:9");
}

function normalizeVideoResolution(value) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = String(value || "").replace(/p$/i, "") || "720";
    return `${resolution}p`;
}

function computeVideoSize(resolution, ratio) {
    if (ratio === "auto" || !ratio) return "auto";
    const parsed = parseAspectRatio(ratio);
    if (!parsed) return "auto";
    const p = Math.max(1, Math.floor(Number(String(resolution || "720").replace(/p$/i, "")) || 720));
    const even = (value) => Math.max(2, Math.round(value / 2) * 2);
    const landscape = parsed.width >= parsed.height;
    const width = even(landscape ? (p * parsed.width) / parsed.height : p);
    const height = even(landscape ? p : (p * parsed.height) / parsed.width);
    return `${width}x${height}`;
}

function normalizeVideoSize(value, resolution) {
    if (value === "auto") return null;
    if (/^\d+x\d+$/.test(value || "")) return value;
    const ratio = inferVideoRatio(value || "16:9");
    if (ratio === "auto") return null;
    return computeVideoSize(resolution || "720", ratio);
}

function resolveVideoMode(mode, imageCount) {
    if (mode === "reference" || imageCount > 2) return "reference";
    return "frames";
}

function boolConfig(value, fallback) {
    return value ? value === "true" : fallback;
}

function prefersJsonFirst(baseUrl) {
    try {
        const host = new URL(baseUrl).host.toLowerCase();
        return !(host === "openai.com" || host.endsWith(".openai.com"));
    } catch {
        return false;
    }
}

function requestStatus(error) {
    return typeof error?.status === "number" ? error.status : undefined;
}

function withRequestDiagnosis(message, status, baseUrl, suffix) {
    let endpoint = String(baseUrl || "").trim();
    try {
        endpoint = new URL(String(baseUrl || "").trim()).host;
    } catch {
        // baseUrl 不规范时保留原文
    }
    const trimmed = message.length > 180 ? `${message.slice(0, 180)}…` : message;
    const hint = status && status >= 500 ? "网关多次返回错误，已自动重试：" : "";
    return `${hint}${trimmed} · ${endpoint}${suffix}${status ? ` · HTTP ${status}` : ""}`;
}

export function planVideoSubmitPayloads(input) {
    if (input.inlineVideos) return { order: input.relayHost ? ["json", "multipart"] : ["multipart", "json"] };
    if (input.mediaOnlyInMultipart) return { order: ["multipart"] };
    const multipartFirst = !input.inlineImages && !input.relayHost;
    return { order: multipartFirst ? ["multipart", "json"] : ["json", "multipart"] };
}

export function canInlineImagesToJson(imageCount) {
    return imageCount > 0;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

function isLocalHostname(hostname) {
    const host = String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
    if (!host) return true;
    if (LOOPBACK_HOSTS.has(host)) return true;
    if (host.endsWith(".local") || host.endsWith(".localhost") || host.endsWith(".internal")) return true;
    const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (ipv4) {
        const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
        if (a === 10 || a === 127 || a === 0) return true;
        if (a === 192 && b === 168) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 169 && b === 254) return true;
    }
    return false;
}

export function isPublicMediaUrl(raw) {
    if (!raw) return false;
    try {
        const parsed = new URL(raw);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
        return !isLocalHostname(parsed.hostname);
    } catch {
        return false;
    }
}

export function collectPublicVideoUrls(videos) {
    return (videos || []).map((video) => (typeof video?.url === "string" ? video.url.trim() : "")).filter((url) => isPublicMediaUrl(url));
}

export function relayMultipartRejectionHint(status, message) {
    if (status !== 400) return "";
    if (!/(codec can't decode|invalid continuation byte|Expecting value)/i.test(message || "")) return "";
    return "（该中转的 /videos 只接受 JSON，收不了上传的视频文件字节；源视频需是公网可访问的 http(s) 地址）";
}

function unwrapEnvelope(payload, emptyMessage) {
    if (!payload) throw new UpstreamError(emptyMessage);
    if (typeof payload === "object" && "code" in payload && payload.code !== undefined) {
        if (payload.code !== 0 && payload.code !== "0") throw new UpstreamError(readApiErrorMessage(payload) || "请求失败");
        if (!payload.data) throw new UpstreamError(emptyMessage);
        return payload.data;
    }
    return payload;
}

function videoResultUrl(payload, config) {
    const candidates = [payload.video_url, payload.result_url, payload.url, payload.video?.url, payload.content?.video_url, payload.content?.url];
    for (const candidate of candidates) {
        if (typeof candidate !== "string" || !candidate.trim()) continue;
        const url = resolveVideoMediaUrl(candidate, config);
        if (url) return url;
    }
    return undefined;
}

function resolveVideoMediaUrl(raw, config) {
    const url = String(raw || "").trim();
    if (/^https?:\/\//i.test(url) || url.startsWith("blob:") || url.startsWith("data:")) return url;
    if (!url.startsWith("/") || !config?.baseUrl) return undefined;
    const baseUrl = String(config.baseUrl).trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
    return baseUrl ? `${baseUrl}${url}` : undefined;
}

function isVideoDoneStatus(status) {
    return Boolean(status) && VIDEO_DONE_STATUS.has(String(status).trim().toLowerCase());
}

function isVideoFailedStatus(status) {
    return Boolean(status) && VIDEO_FAILED_STATUS.has(String(status).trim().toLowerCase());
}

function channelApiPrefixes(baseUrl) {
    try {
        const parsed = new URL(String(baseUrl || "").trim());
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
        const pathname = parsed.pathname.replace(/\/+$/, "");
        if (!pathname) return { origin: parsed.origin, prefixes: ["/v1/"] };
        const prefixes = [`${pathname}/`];
        if (!/\/v1$/i.test(pathname)) prefixes.push(`${pathname}/v1/`);
        return { origin: parsed.origin, prefixes };
    } catch {
        return null;
    }
}

function channelMediaHeaders(url, config) {
    if (!config || config.apiFormat === "gemini") return undefined;
    const apiKey = String(config.apiKey || "").trim();
    if (!apiKey || !url) return undefined;
    if (/^(?:blob:|data:|file:)/i.test(url)) return undefined;
    let target;
    try {
        target = new URL(url);
    } catch {
        return undefined;
    }
    const api = channelApiPrefixes(config.baseUrl);
    if (!api || target.origin !== api.origin) return undefined;
    const targetPath = `${target.pathname.replace(/\/+$/, "")}/`;
    return api.prefixes.some((prefix) => targetPath.startsWith(prefix)) ? { Authorization: `Bearer ${apiKey}` } : undefined;
}

function parseDataUrlInline(dataUrl, fallbackType = "image/png") {
    const match = String(dataUrl || "").match(/^data:([^;,]+)?;base64,(.*)$/s);
    return { bytesBase64Encoded: match?.[2] || "", mimeType: match?.[1] || fallbackType };
}

async function fileToInline(file) {
    const bytes = Buffer.from(await file.arrayBuffer());
    return { bytesBase64Encoded: bytes.toString("base64"), mimeType: file.type || "application/octet-stream" };
}

function assertVideoConfig(config, model) {
    if (!String(model || "").trim()) throw new UpstreamError("请先选择视频模型");
    if (!String(config.baseUrl || "").trim()) throw new UpstreamError("请先在模型设置中填写渠道 Base URL");
    if (!String(config.apiKey || "").trim()) throw new UpstreamError("请先在模型设置中填写 API Key");
}

function videoAspectRatio(size) {
    const ratio = inferVideoRatio(size);
    return ratio === "auto" ? "16:9" : ratio;
}

/* ============================ OpenAI /videos ============================ */

async function publishLocalVideo(ctx, config, entry, signal) {
    const hostBase = String(config.mediaHostUrl || "").trim().replace(/\/+$/, "");
    if (!hostBase) throw new UpstreamError("未配置素材公网基址：本地素材需要先上传到可公网访问的地址");
    let parsed;
    try {
        parsed = new URL(hostBase);
    } catch {
        throw new UpstreamError(`素材公网基址不是合法的 http(s) 地址：${hostBase}`);
    }
    if (parsed.protocol !== "https:") throw new UpstreamError("上游只接受公网 https 视频地址，但素材公网基址是 http：请填写 https 隧道域名");
    if (isLocalHostname(parsed.hostname)) throw new UpstreamError("素材公网基址指向本机/私网，上游无法访问：请填写公网隧道域名");
    if (!entry.file) throw new UpstreamError(`参考视频「${entry.name || "未命名"}」没有可用的本地字节`);
    const bytes = await entry.file.arrayBuffer();
    const { response, scope } = await fetchUpstream(
        ctx,
        `${hostBase}/__media/upload`,
        {
            method: "POST",
            headers: { "content-type": entry.type || entry.file.type || "application/octet-stream", "x-media-name": encodeURIComponent(entry.name || "ref.mp4") },
            body: bytes,
        },
        { signal },
    );
    try {
        const text = await readResponseText(response);
        if (!response.ok) throw new UpstreamError(`素材上传被拒绝（HTTP ${response.status}）`, response.status, text.slice(0, 300));
        let payload;
        try {
            payload = JSON.parse(text);
        } catch {
            payload = null;
        }
        if (!payload?.path) throw new UpstreamError("素材上传响应缺少 path 字段");
        return `${hostBase}${payload.path.startsWith("/") ? payload.path : `/${payload.path}`}`;
    } finally {
        scope.dispose();
    }
}

async function createOpenAIVideoTask(ctx, input) {
    const { config, model, prompt } = input;
    const images = input.images || [];
    const inlineImages = input.inlineImages || [];
    const videos = input.videos || [];
    const audios = input.audios || [];
    const mode = resolveVideoMode(config.videoMode, images.length);
    const ratio = inferVideoRatio(config.size || "16:9");

    const body = new FormData();
    body.append("model", model);
    body.append("prompt", prompt);
    body.append("seconds", clampVideoSeconds(config.videoSeconds));
    body.append("size", normalizeVideoSize(config.size, config.vquality) || "1280x720");
    if (ratio && ratio !== "auto") body.append("ratio", ratio);
    body.append("resolution_name", normalizeVideoResolution(config.vquality));
    body.append("generate_audio", String(boolConfig(config.videoGenerateAudio, true)));
    body.append("watermark", String(boolConfig(config.videoWatermark, false)));
    body.append("mode", mode);
    if (mode === "frames") {
        if (images[0]) {
            body.append("first_frame", images[0], "first.png");
            body.append("images", images[0], "first.png");
        }
        if (images[1]) {
            body.append("last_frame", images[1], "last.png");
            body.append("images", images[1], "last.png");
        }
    } else {
        images.forEach((file, index) => {
            body.append("image[]", file, `ref_${index + 1}.png`);
            body.append("images", file, `ref_${index + 1}.png`);
        });
    }
    videos.forEach((entry) => entry.file && body.append("video[]", entry.file));
    audios.forEach((entry) => entry.file && body.append("audio[]", entry.file));

    const inlineImageCount = inlineImages.length;
    const jsonFields = {
        model,
        prompt,
        seconds: clampVideoSeconds(config.videoSeconds),
        size: normalizeVideoSize(config.size, config.vquality) || "1280x720",
        resolution_name: normalizeVideoResolution(config.vquality),
        generate_audio: boolConfig(config.videoGenerateAudio, true),
        watermark: boolConfig(config.videoWatermark, false),
        mode,
    };
    if (ratio && ratio !== "auto") jsonFields.ratio = ratio;
    if (canInlineImagesToJson(inlineImageCount)) jsonFields.images = inlineImages;
    const publicVideoUrls = videos.map((entry) => entry.publicUrl).filter((url) => isPublicMediaUrl(url));
    const inlineVideos = videos.length > 0 && publicVideoUrls.length === videos.length;
    if (inlineVideos) jsonFields.videos = publicVideoUrls;

    const translation = input.translation;
    if (translation) {
        jsonFields.model = translation.model;
        jsonFields.prompt = translation.prompt;
        jsonFields.videos = translation.videos;
        jsonFields.type = translation.type;
        jsonFields.outputNum = translation.outputNum;
        jsonFields.sourceVideoUrl = translation.sourceVideoUrl;
        jsonFields.sourceVideoName = translation.sourceVideoName;
        jsonFields.sourceLanguage = translation.sourceLanguage;
        jsonFields.targetLanguage = translation.targetLanguage;
        jsonFields.lipSync = translation.lipSync;
        jsonFields.extendFields = translation.extendFields;
    }

    let publishedForJson = false;
    const publishVideosForJson = async () => {
        if (publishedForJson || !videos.length) return;
        const urls = [];
        for (const entry of videos) urls.push(await publishLocalVideo(ctx, config, entry, input.signal));
        jsonFields.videos = urls;
        publishedForJson = true;
    };

    const post = (payload) =>
        requestUpstreamJson(ctx, buildApiUrl(config.baseUrl, "/videos"), {
            method: "POST",
            headers: payload instanceof FormData ? openAiHeaders(config) : openAiHeaders(config, "application/json"),
            body: payload instanceof FormData ? payload : JSON.stringify(payload),
            signal: input.signal,
            timeoutMs: VIDEO_SUBMIT_TIMEOUT_MS,
            fallback: "视频任务提交失败",
        });

    const plan = translation
        ? { order: ["json"] }
        : planVideoSubmitPayloads({
              inlineImages: Boolean(inlineImageCount),
              mediaOnlyInMultipart: (videos.length > 0 && !inlineVideos) || audios.length > 0,
              relayHost: prefersJsonFirst(config.baseUrl),
              inlineVideos,
          });

    try {
        let created;
        let lastError;
        for (const slot of plan.order) {
            const payload = slot === "json" ? jsonFields : body;
            try {
                created = unwrapEnvelope(await withGatewayRetry(() => post(payload), 3), "上游没有返回视频任务");
                break;
            } catch (error) {
                lastError = error;
                const status = requestStatus(error);
                const message = error?.message || "";
                if (!publishedForJson && !translation && videos.length > 0 && relayMultipartRejectionHint(status, message)) {
                    await publishVideosForJson();
                    created = unwrapEnvelope(await withGatewayRetry(() => post(jsonFields), 3), "上游没有返回视频任务");
                    break;
                }
                if (status === 400 || status === 415 || status === 422) continue;
                throw error;
            }
        }
        if (!created) throw lastError || new UpstreamError("视频任务提交失败");
        if (!created.id) throw new UpstreamError("上游没有返回视频任务 ID");
        return { id: created.id, provider: "openai", model: input.taskModel || model };
    } catch (error) {
        if (translation && error instanceof UpstreamError) throw error;
        const status = requestStatus(error);
        const baseMessage = error?.message || "视频任务提交失败";
        throw new UpstreamError(withRequestDiagnosis(baseMessage, status, config.baseUrl, "/videos") + relayMultipartRejectionHint(status, baseMessage), status);
    }
}

async function pollOpenAIVideoTask(ctx, input) {
    const { config, task } = input;
    try {
        const payload = unwrapEnvelope(
            await requestUpstreamJson(ctx, buildApiUrl(config.baseUrl, `/videos/${encodeURIComponent(task.id)}`), {
                headers: openAiHeaders(config),
                signal: input.signal,
                timeoutMs: VIDEO_POLL_TIMEOUT_MS,
                fallback: "视频任务查询失败",
            }),
            "视频任务查询失败",
        );
        const url = videoResultUrl(payload, config);
        if (url) return { status: "completed", result: await videoResultFromUrl(ctx, url, { headers: channelMediaHeaders(url, config), signal: input.signal }) };
        if (isVideoDoneStatus(payload.status)) {
            try {
                const bytes = await withGatewayRetry(
                    async () => {
                        const { bytes: content } = await requestUpstreamBytes(ctx, buildApiUrl(config.baseUrl, `/videos/${encodeURIComponent(task.id)}/content`), {
                            headers: openAiHeaders(config),
                            signal: input.signal,
                            fallback: "视频下载失败",
                        });
                        assertPlayableVideoPayload(content, "");
                        return content;
                    },
                    3,
                );
                return { status: "completed", result: await storeVideoBytes(ctx, bytes, "video/mp4") };
            } catch (error) {
                if (error instanceof VideoPayloadError) return { status: "failed", error: error.message };
                throw error;
            }
        }
        if (isVideoFailedStatus(payload.status)) return { status: "failed", error: readApiErrorMessage(payload.error?.message) || "视频生成失败" };
        return { status: "pending" };
    } catch (error) {
        if (error instanceof VideoPayloadError) return { status: "failed", error: error.message };
        throw error;
    }
}

/* ============================ Gemini ============================ */

function geminiVideoBaseUrl(config) {
    const normalized = String(config.baseUrl || "").trim().replace(/\/+$/, "");
    const lower = normalized.toLowerCase();
    return lower.endsWith("/v1") || lower.endsWith("/v1beta") ? normalized : `${normalized}/v1beta`;
}

function geminiVideoUrl(config, model, action) {
    return `${geminiVideoBaseUrl(config)}/models/${encodeURIComponent(String(model).replace(/^models\//, ""))}:${action}`;
}

function geminiOperationUrl(config, name) {
    return `${geminiVideoBaseUrl(config)}/${String(name).replace(/^\//, "")}`;
}

function geminiVideoHeaders(config) {
    return { "x-goog-api-key": config.apiKey, "Content-Type": "application/json" };
}

async function createGeminiVideoTask(ctx, input) {
    const { config, model, prompt } = input;
    const images = input.inlineImages || [];
    const videos = input.videos || [];
    const audios = input.audios || [];
    const mode = resolveVideoMode(config.videoMode, images.length);
    const instance = { prompt };
    if (mode === "frames") {
        if (images[0]) instance.image = parseDataUrlInline(images[0]);
        if (images[1]) instance.lastFrame = parseDataUrlInline(images[1]);
    } else {
        instance.referenceImages = images.map((dataUrl) => ({ image: parseDataUrlInline(dataUrl), referenceType: "asset" }));
    }
    if (videos[0]?.file) instance.video = await fileToInline(videos[0].file);
    if (audios[0]?.file) instance.audio = await fileToInline(audios[0].file);

    const payload = await requestUpstreamJson(ctx, geminiVideoUrl(config, model, "predictLongRunning"), {
        method: "POST",
        headers: geminiVideoHeaders(config),
        body: JSON.stringify({
            instances: [instance],
            parameters: {
                aspectRatio: videoAspectRatio(config.size),
                durationSeconds: Number(clampVideoSeconds(config.videoSeconds)) || 8,
                resolution: normalizeVideoResolution(config.vquality),
                generateAudio: boolConfig(config.videoGenerateAudio, true),
                addWatermark: boolConfig(config.videoWatermark, false),
            },
        }),
        signal: input.signal,
        fallback: "视频任务提交失败",
    });
    const created = unwrapEnvelope(payload, "上游没有返回视频任务");
    if (!created.name) throw new UpstreamError("上游没有返回视频任务 ID");
    return { id: created.name, provider: "gemini", model: input.taskModel || model };
}

async function pollGeminiVideoTask(ctx, input) {
    const { config, task } = input;
    const payload = unwrapEnvelope(
        await requestUpstreamJson(ctx, geminiOperationUrl(config, task.id), { headers: geminiVideoHeaders(config), signal: input.signal, fallback: "视频任务查询失败" }),
        "视频任务查询失败",
    );
    if (payload.error) return { status: "failed", error: readApiErrorMessage(payload.error.message) || "视频生成失败" };
    if (!payload.done) return { status: "pending" };
    const uri = payload.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    if (!uri) return { status: "failed", error: "上游没有返回可播放的视频" };
    const url = uri.includes("key=") ? uri : `${uri}${uri.includes("?") ? "&" : "?"}key=${config.apiKey}`;
    try {
        return { status: "completed", result: await videoResultFromUrl(ctx, url, { signal: input.signal }) };
    } catch (error) {
        if (error instanceof VideoPayloadError) return { status: "failed", error: error.message };
        throw error;
    }
}

/* ============================ 通用 HTTP 协议 ============================ */

function renderHttpUrlTemplate(template, values) {
    return String(template || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => (key in values ? String(values[key] ?? "") : match));
}

function renderHttpTemplate(template, values) {
    return String(template || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key, offset, source) => {
        if (!(key in values)) return match;
        const value = values[key];
        const before = source[offset - 1];
        const after = source[offset + match.length];
        if (before === '"' && after === '"') {
            if (typeof value === "string") return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
            return String(value ?? "");
        }
        return JSON.stringify(value ?? null);
    });
}

function parseHttpJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function httpPathValue(source, pathText) {
    const trimmed = String(pathText || "").trim();
    if (!trimmed) return undefined;
    return trimmed.split(".").reduce((current, key) => {
        if (current === null || current === undefined) return undefined;
        if (Array.isArray(current)) {
            const index = Number(key);
            return Number.isInteger(index) ? current[index] : undefined;
        }
        if (typeof current !== "object") return undefined;
        return current[key];
    }, source);
}

function splitValues(value) {
    return String(value || "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
}

function httpResultFromValue(value) {
    if (typeof value === "string" && value.trim()) return { url: value.trim(), mimeType: "video/mp4" };
    if (value && typeof value === "object") {
        const url = [value.url, value.video_url, value.result_url, value.videoUrl].find((item) => typeof item === "string" && item);
        if (url) return { url, mimeType: "video/mp4" };
    }
    return null;
}

function httpResultFromPaths(source, pathText) {
    const primary = httpResultFromValue(httpPathValue(source, pathText));
    if (primary) return primary;
    const configured = String(pathText || "").trim();
    for (const candidate of HTTP_RESULT_FALLBACK_PATHS) {
        if (candidate === configured) continue;
        const found = httpResultFromValue(httpPathValue(source, candidate));
        if (found) return found;
    }
    return null;
}

function httpHeaders(protocol, values) {
    const headers = { "Content-Type": "application/json" };
    const configured = protocol.headers?.trim() ? parseHttpJson(renderHttpTemplate(protocol.headers, values)) : null;
    if (configured && typeof configured === "object") {
        Object.entries(configured).forEach(([key, value]) => {
            if (value === undefined || value === null || value === "") return;
            if (key.toLowerCase() === "content-type") return;
            headers[key] = String(value);
        });
        return headers;
    }
    if (values.apiKey) headers.Authorization = `Bearer ${values.apiKey}`;
    return headers;
}

function resolveHttpResultUrl(url, baseUrl) {
    const trimmed = String(url || "").trim();
    if (!trimmed) return "";
    if (/^(https?:|blob:|data:)/i.test(trimmed)) return trimmed;
    const base = String(baseUrl || "").trim().replace(/\/+$/, "");
    if (!base) return trimmed;
    return trimmed.startsWith("/") ? `${base}${trimmed}` : `${base}/${trimmed}`;
}

async function createHttpVideoTask(ctx, input) {
    const { config, model, prompt } = input;
    const protocol = input.videoHttp || {};
    const baseUrl = String(config.baseUrl || "").trim();
    const submitUrl = renderHttpUrlTemplate(protocol.submitUrl || "{{baseUrl}}/videos", { baseUrl, apiKey: config.apiKey, taskId: "" });
    if (!submitUrl) throw new UpstreamError("请先配置 HTTP 协议的视频提交地址");
    const images = input.inlineImages || [];
    const values = {
        baseUrl,
        apiKey: config.apiKey,
        model,
        prompt,
        seconds: Number(clampVideoSeconds(config.videoSeconds)) || 6,
        size: normalizeVideoSize(config.size, config.vquality),
        ratio: inferVideoRatio(config.size || "16:9"),
        resolution: normalizeVideoResolution(config.vquality),
        mode: resolveVideoMode(config.videoMode, images.length),
        generateAudio: boolConfig(config.videoGenerateAudio, true),
        watermark: boolConfig(config.videoWatermark, false),
        images,
    };
    const parsedBody = parseHttpJson(renderHttpTemplate(protocol.bodyTemplate || "{}", values));
    if (!parsedBody) throw new UpstreamError("HTTP 视频提交体不是合法 JSON");
    try {
        const data = await withGatewayRetry(
            () =>
                requestUpstreamJson(ctx, submitUrl, {
                    method: "POST",
                    headers: httpHeaders(protocol, values),
                    body: JSON.stringify(parsedBody),
                    signal: input.signal,
                    fallback: "视频任务提交失败",
                }),
            3,
        );
        if (!protocol.pollUrl?.trim()) {
            const direct = httpResultFromValue(httpPathValue(data, protocol.resultPath));
            if (!direct) throw new UpstreamError("上游没有返回可播放的视频");
            const id = randomUUID();
            immediateHttpResults.set(id, { ...direct, mimeType: direct.mimeType || "video/mp4" });
            return { id, provider: "http", model };
        }
        const taskId = String(httpPathValue(data, protocol.taskIdPath) ?? "").trim();
        if (!taskId) throw new UpstreamError("上游没有返回视频任务 ID");
        return { id: taskId, provider: "http", model: input.taskModel || model };
    } catch (error) {
        const status = requestStatus(error);
        throw new UpstreamError(withRequestDiagnosis(error?.message || "视频任务提交失败", status, baseUrl, " · 提交"), status);
    }
}

async function pollHttpVideoTask(ctx, input) {
    const { config, task } = input;
    const cached = immediateHttpResults.get(task.id);
    if (cached) return { status: "completed", result: cached };
    const protocol = input.videoHttp || {};
    const baseUrl = String(config.baseUrl || "").trim();
    const values = { baseUrl, apiKey: config.apiKey, taskId: task.id, model: task.model };
    const pollUrl = renderHttpUrlTemplate(protocol.pollUrl || "", values);
    if (!pollUrl) return { status: "failed", error: "请先配置 HTTP 协议的视频轮询地址" };
    try {
        const data = await requestUpstreamJson(ctx, pollUrl, { headers: httpHeaders(protocol, values), signal: input.signal, fallback: "视频任务查询失败" });
        const status = String(httpPathValue(data, protocol.statusPath) ?? "").trim().toLowerCase();
        const success = splitValues(protocol.successValues);
        const failure = splitValues(protocol.failureValues);
        const result = httpResultFromPaths(data, protocol.resultPath);
        if (result && (!status || !failure.length || !failure.includes(status))) {
            const resultUrl = resolveHttpResultUrl(result.url, baseUrl);
            return { status: "completed", result: await videoResultFromUrl(ctx, resultUrl, { headers: httpHeaders(protocol, values), signal: input.signal }) };
        }
        if (status && failure.includes(status)) {
            return { status: "failed", error: String(httpPathValue(data, protocol.errorPath) ?? "").trim() || "视频生成失败" };
        }
        if (status && success.length && success.includes(status)) {
            return result ? { status: "completed", result: await videoResultFromUrl(ctx, resolveHttpResultUrl(result.url, baseUrl), { headers: httpHeaders(protocol, values), signal: input.signal }) } : { status: "failed", error: "上游没有返回可播放的视频" };
        }
        return { status: "pending" };
    } catch (error) {
        if (error?.name === "AbortError") return { status: "failed", error: "已取消视频任务查询" };
        return { status: "pending" };
    }
}

/* ============================ 结果下载与落盘 ============================ */

function videoExtension(mimeType) {
    const type = String(mimeType || "").toLowerCase();
    if (type.includes("webm")) return "webm";
    if (type.includes("quicktime") || type.includes("mov")) return "mov";
    if (type.includes("ogg")) return "ogg";
    return "mp4";
}

/** 视频结果按存储层的 key 规则落盘并登记索引，刷新后仍能按 storageKey 取回字节。 */
async function storeVideoBytes(ctx, bytes, mimeType) {
    const entry = await storeMediaBuffer(ctx, `video:${randomUUID()}`, Buffer.from(bytes), { kind: "video", mimeType: mimeType || "video/mp4", fallbackExtension: `.${videoExtension(mimeType)}` });
    return { url: entry.url, storageKey: entry.storageKey, fileName: entry.file, mimeType: entry.mimeType, bytes: entry.bytes };
}

export function isPlayableVideoPayload(bytes, mimeType = "") {
    const type = String(mimeType || "").toLowerCase();
    if (type.startsWith("text/") || type.includes("json") || type.includes("html") || type.includes("xml")) return false;
    if (!bytes || bytes.byteLength < 12) return false;
    const ascii = (start, end) => String.fromCharCode(...bytes.subarray(start, end));
    if (ascii(4, 8) === "ftyp") return true;
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return true;
    if (ascii(0, 4) === "OggS") return true;
    if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "AVI ") return true;
    if (ascii(0, 3) === "FLV") return true;
    if (bytes[0] === 0x47) return true;
    if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0xba) return true;
    return false;
}

function assertPlayableVideoPayload(bytes, mimeType) {
    if (!bytes || bytes.byteLength === 0) throw new VideoPayloadError("empty-video-payload", "上游没有返回可播放的视频");
    const head = bytes.subarray(0, 64);
    const text = new TextDecoder().decode(head).trimStart();
    if (text.startsWith("<")) throw new VideoPayloadError("html-video-payload", `上游返回了 HTML 错误页：${text.slice(0, 80)}...`);
    if (head[0] === 0x7b || head[0] === 0x5b || String(mimeType || "").toLowerCase().includes("json")) {
        let payload;
        try {
            payload = JSON.parse(new TextDecoder().decode(bytes));
        } catch {
            payload = undefined;
        }
        const detail = readApiErrorMessage(payload) || readApiErrorMessage(payload?.error?.message) || readApiErrorMessage(payload?.message);
        throw new VideoPayloadError("json-video-payload", detail || "视频下载失败");
    }
    if (!isPlayableVideoPayload(head, mimeType)) throw new VideoPayloadError("unknown-video-container", "上游没有返回可播放的视频");
}

async function requestUpstreamBytes(ctx, url, options) {
    const { response, scope } = await fetchUpstream(ctx, url, { method: "GET", headers: options.headers }, { signal: options.signal });
    try {
        if (!response.ok) throw new UpstreamError(readApiErrorMessage(await readResponseText(response)) || statusMessage(response.status) || options.fallback || "视频下载失败", response.status);
        return { bytes: new Uint8Array(await response.arrayBuffer()), response };
    } finally {
        scope.dispose();
    }
}

async function videoResultFromUrl(ctx, url, options = {}) {
    try {
        const bytes = await withGatewayRetry(
            async () => {
                const { bytes: content, response } = await requestUpstreamBytes(ctx, url, { headers: options.headers, signal: options.signal, fallback: "视频下载失败" });
                const mimeType = String(response.headers.get("content-type") || "").split(";")[0].trim();
                assertPlayableVideoPayload(content, mimeType);
                return { content, mimeType };
            },
            2,
        );
        return await storeVideoBytes(ctx, bytes.content, bytes.mimeType || "video/mp4");
    } catch (error) {
        if (error instanceof VideoPayloadError) throw error;
        if (error?.name === "AbortError") throw error;
        if (/^https?:\/\//i.test(url)) return { url, mimeType: "video/mp4" };
        throw error;
    }
}

/* ============================ 对外入口 ============================ */

export async function createVideoTask(ctx, input) {
    const { config } = input;
    if (config.apiFormat === "http") return createHttpVideoTask(ctx, input);
    assertVideoConfig(config, config.model);
    if (config.apiFormat === "gemini") return createGeminiVideoTask(ctx, input);
    return createOpenAIVideoTask(ctx, input);
}

export async function pollVideoTask(ctx, input) {
    const { config, task } = input;
    if (task.provider === "http" || config.apiFormat === "http") return pollHttpVideoTask(ctx, input);
    assertVideoConfig(config, task.model || config.model);
    if (task.provider === "gemini") return pollGeminiVideoTask(ctx, input);
    return pollOpenAIVideoTask(ctx, input);
}

export { VIDEO_SUBMIT_TIMEOUT_MS, VIDEO_POLL_TIMEOUT_MS };
