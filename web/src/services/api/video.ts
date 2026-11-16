import { nanoid } from "nanoid";

import i18n from "@/i18n";
import { dataUrlToFile } from "@/lib/image-utils";
import { shrinkInlineImages } from "@/lib/inline-image";
import { clampVideoSeconds, computeVideoSize, inferVideoRatio } from "@/lib/media-size";
import { isPublicMediaUrl } from "@/services/media-publish";
import { getMediaBlob, resolveMediaUrl, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import { boolConfig, resolveModelRequestConfig, resolveModelScript, resolveVideoHttpConfig, type AiConfig } from "@/stores/use-config-store";
import { mapUpstreamModelRejection, type SeedV25TranslationPayload } from "@/services/api/video-translation-seed-v25";
import { DesktopRequestError } from "./desktop/http";
import { requestVideoCreate, requestVideoPoll, type ProviderVideoResult } from "./desktop/capabilities/providers";
import { desktopFileUrl } from "./desktop/runtime";
import { runModelPlugin } from "./model-plugin";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

type RequestOptions = { signal?: AbortSignal };
type VideoMediaOptions = RequestOptions & {
    videos?: ReferenceVideo[];
    audios?: ReferenceAudio[];
    /** VIDEO_TRANSLATION → SEED_V25 翻译请求体（已由协议层校验；存在时只走 JSON）。 */
    translation?: SeedV25TranslationPayload;
};
const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

export type VideoGenerationResult = { blob?: Blob; url?: string; mimeType?: string; storageKey?: string; fileName?: string; bytes?: number };
export type VideoGenerationTask = { id: string; provider: "openai" | "gemini" | "plugin" | "http"; model: string };
export type VideoGenerationTaskState = { status: "pending" } | { status: "completed"; result: VideoGenerationResult } | { status: "failed"; error: string };

/** Results for scripted (plugin) video models, which run their own create+poll in one shot at task creation. */
const pluginVideoResults = new Map<string, VideoGenerationResult>();

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = [], options?: VideoMediaOptions): Promise<VideoGenerationResult> {
    return waitForVideoGenerationTask(config, await createVideoGenerationTask(config, prompt, references, options), options);
}

export async function waitForVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationResult> {
    let transientFailures = 0;
    for (let attempt = 0; attempt < 480; attempt += 1) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        let state: VideoGenerationTaskState;
        try {
            state = await pollVideoGenerationTask(config, task, options);
            transientFailures = 0;
        } catch (error) {
            // 任务已在上游生成（已扣费）时，轮询的瞬时网络故障不能判整条失败
            if (!isRetryableVideoError(error) || transientFailures >= 40) throw error;
            transientFailures += 1;
            await delay(3000, options?.signal);
            continue;
        }
        if (state.status === "completed") return ensurePlayableVideoResult(state.result);
        if (state.status === "failed") throw videoTaskFailed(state.error);
        if (attempt === 479) throw new Error(apiText("videoTimeout", { provider: "" }));
        await delay(2500, options?.signal);
    }
    throw new Error(apiText("videoTimeout", { provider: "" }));
}

export function isVideoTaskFailed(error: unknown) {
    return error instanceof Error && error.name === "VideoTaskFailed";
}

export function isRetryableVideoError(error: unknown) {
    return Boolean((error as { retryable?: boolean } | null)?.retryable);
}

function videoTaskFailed(message: string) {
    const error = new Error(message);
    error.name = "VideoTaskFailed";
    return error;
}

export async function createVideoGenerationTask(config: AiConfig, prompt: string, references: ReferenceImage[] = [], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    const selectedModel = (config.model || config.videoModel).trim();
    const requestConfig = resolveModelRequestConfig(config, selectedModel);
    const script = resolveModelScript(config, selectedModel);
    if (script) return createPluginVideoTask(requestConfig, selectedModel, script, prompt, references, options);
    try {
        const prepared = await prepareVideoInput(references, options);
        return await requestVideoCreate(
            {
                config: requestConfig,
                model: requestConfig.model,
                taskModel: selectedModel,
                prompt,
                inlineImages: prepared.inlineImages,
                imageFiles: prepared.imageFiles,
                videos: prepared.videos,
                audios: prepared.audios,
                videoHttp: resolveVideoHttpConfig(config, selectedModel),
                translation: options?.translation,
            },
            prepared.files,
            options?.signal,
        );
    } catch (error) {
        const message = readProviderError(error, apiText("videoTaskCreateFailed"));
        if (options?.translation && error instanceof DesktopRequestError) {
            const rejected = mapUpstreamModelRejection(error.status, message);
            if (rejected) {
                const normalized = new Error(rejected.message);
                normalized.name = "SeedV25ModelRejected";
                throw normalized;
            }
        }
        throw new Error(message);
    }
}

async function prepareVideoInput(references: ReferenceImage[], options?: VideoMediaOptions) {
    const files: Array<{ field: string; file: File }> = [];
    const imageDataUrls = await Promise.all(references.map((image) => imageToDataUrl(image)));
    const inlineImages = await shrinkInlineImages(imageDataUrls);
    const imageFiles: string[] = [];
    imageDataUrls.forEach((dataUrl, index) => {
        const field = `image_${index}`;
        files.push({ field, file: dataUrlToFile({ ...references[index], dataUrl }) });
        imageFiles.push(field);
    });
    const videos: Array<{ name: string; type: string; publicUrl?: string; file?: string }> = [];
    for (const [index, video] of (options?.videos || []).entries()) {
        const field = `video_${index}`;
        const file = await referenceMediaToFile(video, "ref.mp4", "invalidReferenceVideo", options);
        files.push({ field, file });
        videos.push({ name: video.name, type: video.type, ...(isPublicMediaUrl(video.url) ? { publicUrl: video.url } : {}), file: field });
    }
    const audios: Array<{ name: string; type: string; file?: string }> = [];
    for (const [index, audio] of (options?.audios || []).entries()) {
        const field = `audio_${index}`;
        const file = await referenceMediaToFile(audio, "ref.mp3", "invalidReferenceAudio", options);
        files.push({ field, file });
        audios.push({ name: audio.name, type: audio.type, file: field });
    }
    return { inlineImages, imageFiles, videos, audios, files };
}

/** 服务端已下载并落盘的视频直接复用；仍在上游地址或本地 Blob 的保持原样。 */
function withServiceFileUrl(result: ProviderVideoResult): VideoGenerationResult {
    const url = result.url?.startsWith("/files/") ? desktopFileUrl(result.fileName || result.url.slice("/files/".length)) : result.url;
    return { ...result, url };
}

export async function pollVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    if (task.provider === "plugin") {
        const result = pluginVideoResults.get(task.id);
        return result ? { status: "completed", result } : { status: "failed", error: apiText("pluginVideoExpired") };
    }
    const requestConfig = resolveModelRequestConfig(config, task.model);
    const videoHttp = resolveVideoHttpConfig(config, task.model);
    try {
        const state = await requestVideoPoll({ config: requestConfig, videoHttp, task, signal: options?.signal });
        if (state.status === "completed") return { status: "completed", result: withServiceFileUrl(state.result) };
        return state;
    } catch (error) {
        if (options?.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
        // 通用 HTTP 协议：上游轮询失败不判任务失败（任务可能仍在生成）。
        if (task.provider === "http" || requestConfig.apiFormat === "http") return { status: "pending" };
        const wrapped = new Error(readProviderError(error, apiText("videoTaskQueryFailed"))) as Error & { retryable?: boolean };
        wrapped.retryable = isTransientPollFailure(error);
        throw wrapped;
    }
}

function isTransientPollFailure(error: unknown) {
    if (error instanceof DesktopRequestError) return error.status >= 500 || error.status === 408 || error.status === 429;
    return error instanceof TypeError;
}

async function createPluginVideoTask(config: AiConfig, model: string, script: string, prompt: string, references: ReferenceImage[], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    if (!config.baseUrl.trim()) throw new Error(apiText("baseUrlRequired"));
    if (!config.apiKey.trim()) throw new Error(apiText("apiKeyRequired"));
    const refs = await shrinkInlineImages(await Promise.all(references.map((image) => imageToDataUrl(image))));
    const videos = await Promise.all((options?.videos || []).map((video) => referenceMediaToFile(video, "ref.mp4", "invalidReferenceVideo", options)));
    const audios = await Promise.all((options?.audios || []).map((audio) => referenceMediaToFile(audio, "ref.mp3", "invalidReferenceAudio", options)));
    const result = videoPluginResult(
        await runModelPlugin({
            capability: "video",
            script,
            config,
            prompt,
            images: refs,
            videos,
            audios,
            params: {
                seconds: normalizeVideoSeconds(config.videoSeconds),
                size: normalizeVideoSize(config.size, config.vquality),
                resolution: normalizeVideoResolution(config.vquality),
                ratio: videoAspectRatio(config.size),
                generateAudio: boolConfig(config.videoGenerateAudio, true),
                watermark: boolConfig(config.videoWatermark, false),
                mode: resolveVideoMode(config.videoMode, refs.length),
            },
            signal: options?.signal,
        }),
    );
    const id = nanoid();
    pluginVideoResults.set(id, result);
    return { id, provider: "plugin", model };
}

function videoPluginResult(result: unknown): VideoGenerationResult {
    if (result instanceof Blob) return { blob: result };
    if (typeof result === "string") return { url: result, mimeType: "video/mp4" };
    if (result && typeof result === "object") {
        const record = result as Record<string, unknown>;
        if (record.blob instanceof Blob) return { blob: record.blob };
        const url = [record.url, record.video_url, record.result_url].find((value) => typeof value === "string" && value) as string | undefined;
        if (url) return { url, mimeType: "video/mp4" };
    }
    throw new Error(apiText("scriptNoVideo"));
}

export async function storeGeneratedVideo(result: VideoGenerationResult): Promise<UploadedFile> {
    // 与 waitForVideoGenerationTask 同一道闸门：空 blob / 非 http(s) URL 一律判失败，不落“假成果”。
    const verified = ensurePlayableVideoResult(result);
    if (verified.storageKey && verified.url) {
        return { url: verified.url, storageKey: verified.storageKey, bytes: verified.bytes || 0, mimeType: verified.mimeType || "video/mp4" };
    }
    if (verified.blob) return uploadMediaFile(verified.blob, "video");
    if (verified.url) {
        try {
            return await uploadMediaFile(verified.url, "video");
        } catch {
            return { url: verified.url, storageKey: "", bytes: 0, mimeType: verified.mimeType || "video/mp4" };
        }
    }
    throw new Error(apiText("noPlayableVideo"));
}

/**
 * 提交/轮询预算（2026-10-29 真实 UI 复现）：VIDEO_CONCAT 填 2 段真实片段后点生成，
 * 任务记录停在 `submitting` 且 `updatedAt === createdAt`，上游迟迟没有 `/videos`，
 * 页面上连错误都没有——因为整条提交链路没有任何时间预算。
 *
 * 提交必须给预算：超时按「结果未知」报错（不能静默重试，上游可能已经受理并计费）。
 */
export const VIDEO_SUBMIT_TIMEOUT_MS = 180_000;
export const VIDEO_POLL_TIMEOUT_MS = 60_000;

/** 请求预算用尽（ECONNABORTED/ETIMEDOUT）：连接层没有回应，上游是否受理未知。 */
export function isRequestTimeoutError(error: unknown) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "ECONNABORTED" || code === "ETIMEDOUT") return true;
    const name = (error as { name?: string } | null)?.name;
    if (name === "TimeoutError") return true;
    const message = (error as { message?: string } | null)?.message || "";
    return /timeout of \d+ms exceeded/i.test(message);
}

export type VideoSubmitSlot = "json" | "multipart";

export function canInlineImagesToJson(imageCount: number): boolean {
    return imageCount > 0;
}

export function planVideoSubmitPayloads(input: {
    inlineImages: boolean;
    mediaOnlyInMultipart: boolean;
    relayHost: boolean;
    inlineVideos?: boolean;
}): { order: VideoSubmitSlot[] } {
    if (input.inlineVideos) return { order: input.relayHost ? ["json", "multipart"] : ["multipart", "json"] };
    if (input.mediaOnlyInMultipart) return { order: ["multipart"] };
    const multipartFirst = !input.inlineImages && !input.relayHost;
    return { order: multipartFirst ? ["multipart", "json"] : ["json", "multipart"] };
}

/** 公网可访问的源视频地址（blob:/data:/本机/私网一律不算——上游拉不到）。 */
export function collectPublicVideoUrls(videos: ReadonlyArray<{ url?: string }> | undefined): string[] {
    return (videos ?? [])
        .map((video) => (typeof video.url === "string" ? video.url.trim() : ""))
        .filter((url) => isPublicMediaUrl(url));
}

/**
 * 中转域把 multipart 当文本解码时的上游原文 → 人话。
 * 实测原文：`'utf-8' codec can't decode byte 0xe8 in position 1614: invalid continuation byte`。
 */
export function relayMultipartRejectionHint(status: number | undefined, message: string): string {
    if (status !== 400) return "";
    if (!/(codec can't decode|invalid continuation byte|Expecting value)/i.test(message)) return "";
    return "（该中转的 /videos 只接受 JSON，收不了上传的视频文件字节；源视频需是公网可访问的 http(s) 地址）";
}

async function referenceMediaToFile(item: { name: string; type?: string; url?: string; storageKey?: string }, fallbackName: string, errorKey: "invalidReferenceVideo" | "invalidReferenceAudio", options?: RequestOptions) {
    let blob = item.storageKey ? await getMediaBlob(item.storageKey) : null;
    if (!blob) {
        const url = item.storageKey ? await resolveMediaUrl(item.storageKey, item.url || "") : item.url || "";
        if (!url) throw new Error(apiText(errorKey));
        try {
            blob = await (await fetch(url, { signal: options?.signal })).blob();
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") throw error;
            throw new Error(apiText(errorKey));
        }
    }
    if (!blob.size) throw new Error(apiText(errorKey));
    return new File([blob], item.name || fallbackName, { type: item.type || blob.type || "application/octet-stream" });
}

function normalizeVideoSeconds(value: string) {
    return clampVideoSeconds(value);
}

function resolveVideoMode(mode: string | undefined, imageCount: number) {
    if (mode === "reference" || imageCount > 2) return "reference";
    return "frames";
}

function normalizeVideoSize(value: string, resolution?: string) {
    if (value === "auto") return null;
    if (/^\d+x\d+$/.test(value || "")) return value;
    const ratio = inferVideoRatio(value || "16:9");
    if (ratio === "auto") return null;
    return computeVideoSize(resolution || "720", ratio);
}

function normalizeVideoResolution(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = value.replace(/p$/i, "") || "720";
    return `${resolution}p`;
}

function videoAspectRatio(size: string) {
    const ratio = inferVideoRatio(size);
    return ratio === "auto" ? "16:9" : ratio;
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

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return apiText("authenticationFailed");
    if (status === 429) return apiText("rateLimited");
    return status ? `${fallback}（${status}）` : fallback;
}

function readProviderError(error: unknown, fallback: string) {
    if (error instanceof DOMException && error.name === "AbortError") return apiText("requestCanceled");
    if (error instanceof DesktopRequestError) {
        const message = readApiErrorMessage(error.message) || error.message || "";
        if (message && !/本地服务请求失败/.test(message)) return message;
        return statusMessage(error.status, message || fallback);
    }
    if (error instanceof Error && error.name === "AbortError") return apiText("requestCanceled");
    return error instanceof Error ? readApiErrorMessage(error.message) || error.message : fallback;
}

/* ========================= 真实视频载荷校验（TASK-047） ========================= */

export class VideoPayloadError extends Error {
    readonly code: "empty-video-payload" | "html-video-payload" | "json-video-payload" | "unknown-video-container";

    constructor(code: VideoPayloadError["code"], message: string) {
        super(message);
        this.name = "VideoPayloadError";
        this.code = code;
    }
}

export function isVideoPayloadError(error: unknown): error is VideoPayloadError {
    return Boolean(error) && (error as Error).name === "VideoPayloadError";
}

/** 已知视频容器魔数。只判前 12 字节，够用且不依赖完整下载。 */
export function isPlayableVideoPayload(bytes: Uint8Array, mimeType = ""): boolean {
    const type = (mimeType || "").toLowerCase();
    if (type.startsWith("text/") || type.includes("json") || type.includes("html") || type.includes("xml")) return false;
    if (bytes.byteLength < 12) return false;
    const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
    if (ascii(4, 8) === "ftyp") return true; // mp4 / mov / m4v
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return true; // webm / mkv
    if (ascii(0, 4) === "OggS") return true;
    if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "AVI ") return true;
    if (ascii(0, 3) === "FLV") return true;
    if (bytes[0] === 0x47) return true; // mpeg-ts
    if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0xba) return true; // mpeg-ps
    return false;
}

/** 校验下载结果：JSON/HTML/空体一律判失败；容器认不出来也判失败（宁可报错，不给假成果）。 */
export async function assertPlayableVideoBlob(blob: Blob): Promise<Blob> {
    const bytes = await readPayloadBytes(blob);
    if (!bytes || bytes.byteLength === 0) throw new VideoPayloadError("empty-video-payload", apiText("noPlayableVideo"));
    const mimeType = (typeof blob === "object" && blob && "type" in blob ? blob.type : "") || "";
    const head = bytes.subarray(0, 64);
    const text = new TextDecoder().decode(head).trimStart();
    if (text.startsWith("<")) throw new VideoPayloadError("html-video-payload", apiText("htmlError", { preview: `${text.slice(0, 80)}...` }));
    if (head[0] === 0x7b || head[0] === 0x5b || mimeType.toLowerCase().includes("json")) {
        let payload: { code?: number; msg?: string; message?: string; error?: { message?: string } } | undefined;
        try {
            payload = JSON.parse(new TextDecoder().decode(bytes)) as typeof payload;
        } catch {
            payload = undefined;
        }
        const detail = readApiErrorMessage(payload) || readApiErrorMessage(payload?.error?.message) || readApiErrorMessage(payload?.message);
        if (detail) throw new VideoPayloadError("json-video-payload", detail);
        throw new VideoPayloadError("json-video-payload", apiText("videoDownloadFailed"));
    }
    if (!isPlayableVideoPayload(head, mimeType)) throw new VideoPayloadError("unknown-video-container", apiText("noPlayableVideo"));
    if (typeof Blob !== "undefined" && !(blob instanceof Blob)) {
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        return new Blob([copy.buffer as ArrayBuffer], { type: mimeType || "video/mp4" });
    }
    return blob;
}

async function readPayloadBytes(payload: Blob | Uint8Array | ArrayBuffer | string): Promise<Uint8Array> {
    if (typeof payload === "string") {
        const bytes = new Uint8Array(payload.length);
        for (let index = 0; index < payload.length; index += 1) bytes[index] = payload.charCodeAt(index) & 0xff;
        return bytes;
    }
    if (payload instanceof Uint8Array) return payload;
    if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
    if (payload && typeof (payload as Blob).arrayBuffer === "function") return new Uint8Array(await (payload as Blob).arrayBuffer());
    return new Uint8Array(0);
}

/**
 * 任务“完成”后的最后一道闸门：必须真的拿到 blob 或可下载 URL。
 * 上游返回 completed + 空 result 时抛 videoTaskFailed，不写假成功。
 */
export function ensurePlayableVideoResult(result: VideoGenerationResult | undefined | null): VideoGenerationResult {
    if (!result) throw videoTaskFailed(apiText("noPlayableVideo"));
    if (result.blob) {
        if (result.blob.size === 0) throw videoTaskFailed(apiText("noPlayableVideo"));
        return result;
    }
    if (result.storageKey && result.url) return result;
    const url = (result.url || "").trim();
    if (isPlayableVideoUrl(url) || url.startsWith("blob:") || url.startsWith("data:video/")) return result;
    throw videoTaskFailed(apiText("noPlayableVideo"));
}

/** 播放判定：只要是上游给的 http(s)/blob/data 就算可播（127.0.0.1 的上游结果在本地也能播）。 */
function isPlayableVideoUrl(value: string) {
    return /^https?:\/\//i.test(value || "");
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
        );
    });
}
