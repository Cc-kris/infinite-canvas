import axios from "axios";
import { nanoid } from "nanoid";

import i18n from "@/i18n";
import { dataUrlToFile, readFileAsDataUrl } from "@/lib/image-utils";
import { shrinkInlineImages } from "@/lib/inline-image";
import { clampVideoSeconds, computeVideoSize, inferVideoRatio } from "@/lib/media-size";
import { getMediaBlob, resolveMediaUrl, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import { boolConfig, buildApiUrl, modelOptionName, resolveModelRequestConfig, resolveModelScript, resolveVideoHttpConfig, withLocalProxy, type AiConfig, type VideoHttpConfig } from "@/stores/use-config-store";
import { runModelPlugin } from "./model-plugin";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

type VideoResponse = {
    id: string;
    status?: string;
    progress?: number;
    error?: { message?: string };
    url?: string;
    result_url?: string;
    video_url?: string;
    video?: { url?: string; duration?: number } | null;
    content?: { video_url?: string; url?: string } | null;
};
type ApiVideoResponse = VideoResponse | { code?: number | string; data?: VideoResponse | null; msg?: string; message?: string; error?: { message?: string } };
type ApiEnvelope<T> = T | { code?: number | string; data?: T | null; msg?: string; message?: string; error?: { message?: string } };
type RequestOptions = { signal?: AbortSignal };
type VideoMediaOptions = RequestOptions & { videos?: ReferenceVideo[]; audios?: ReferenceAudio[] };
const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

export type VideoGenerationResult = { blob?: Blob; url?: string; mimeType?: string };
export type VideoGenerationTask = { id: string; provider: "openai" | "gemini" | "plugin" | "http"; model: string };
type GeminiInlineData = { bytesBase64Encoded: string; mimeType: string };
type GeminiVideoOperation = {
    name?: string;
    done?: boolean;
    error?: { message?: string };
    response?: { generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string } }> } };
};
export type VideoGenerationTaskState = { status: "pending" } | { status: "completed"; result: VideoGenerationResult } | { status: "failed"; error: string };

/** Results for scripted (plugin) video models, which run their own create+poll in one shot at task creation. */
const pluginVideoResults = new Map<string, VideoGenerationResult>();
const httpVideoResults = new Map<string, VideoGenerationResult>();

function aiApiUrl(config: AiConfig, path: string) {
    return buildApiUrl(config.baseUrl, path);
}

function aiHeaders(config: AiConfig, contentType?: string) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

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
    if (requestConfig.apiFormat === "http") return createHttpVideoTask(requestConfig, selectedModel, prompt, references, options);
    assertVideoConfig(requestConfig, requestConfig.model);
    if (requestConfig.apiFormat === "gemini") return createGeminiVideoTask(requestConfig, selectedModel, prompt, references, options);
    return createOpenAIVideoTask(requestConfig, selectedModel, prompt, references, options);
}

export async function pollVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    if (task.provider === "plugin") {
        const result = pluginVideoResults.get(task.id);
        return result ? { status: "completed", result } : { status: "failed", error: apiText("pluginVideoExpired") };
    }
    const requestConfig = resolveModelRequestConfig(config, task.model);
    if (task.provider === "http" || requestConfig.apiFormat === "http") return pollHttpVideoTask(requestConfig, task, options);
    assertVideoConfig(requestConfig, requestConfig.model);
    if (task.provider === "gemini") return pollGeminiVideoTask(requestConfig, task, options);
    return pollOpenAIVideoTask(requestConfig, task, options);
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

// 上游（sub2api/Cloudflare）处理内联图片的成本随 base64 体积线性上升，
// 内联前统一走公共的 shrinkInlineImage（web/src/lib/inline-image.ts），把请求体压到几百 KB。

export async function storeGeneratedVideo(result: VideoGenerationResult): Promise<UploadedFile> {
    // 与 waitForVideoGenerationTask 同一道闸门：空 blob / 非 http(s) URL 一律判失败，不落“假成果”。
    const verified = ensurePlayableVideoResult(result);
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

/** 边缘/网关层瞬时故障：Cloudflare 520/522/524、源站过载 502/503、限流 429。上游多半没受理请求。 */
const TRANSIENT_GATEWAY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525]);

function requestStatus(error: unknown) {
    return (error as { response?: { status?: number } } | null)?.response?.status;
}

/**
 * 官方 OpenAI 只吃 multipart；其余（sub2api 等中转）只解析 JSON。
 * 先发 JSON 可以省掉一次注定 400、还要等十几秒的 multipart 往返，也少一次上游压力。
 */
function prefersJsonFirst(baseUrl: string) {
    try {
        const host = new URL(baseUrl).host.toLowerCase();
        return !(host === "openai.com" || host.endsWith(".openai.com"));
    } catch {
        return false;
    }
}

/** 网关 5xx / 连接被掐：退避重试，避免"点一下生成就报 Cloudflare 错误"。 */
async function withGatewayRetry<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await run();
        } catch (error) {
            lastError = error;
            if (axios.isCancel(error)) throw error;
            const status = requestStatus(error);
            const transient = status ? TRANSIENT_GATEWAY_STATUSES.has(status) : axios.isAxiosError(error);
            if (!transient || attempt === attempts) throw error;
            await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 800 : 2000));
        }
    }
    throw lastError;
}

/** 失败信息带上状态码与目标地址，用户截图就能定位是哪一步、哪个域。 */
function withRequestDiagnosis(message: string, status: number | undefined, baseUrl: string, path: string) {
    let endpoint = baseUrl.trim();
    try {
        endpoint = new URL(baseUrl.trim()).host;
    } catch {
        // baseUrl 不规范时保留原文
    }
    const trimmed = message.length > 180 ? `${message.slice(0, 180)}…` : message;
    // 重试用尽的网关故障：前缀一句人话，否则用户只看到 Cloudflare 的英文原文，误以为是自己配置错。
    const hint = status && TRANSIENT_GATEWAY_STATUSES.has(status) ? `${apiText("videoGatewayRetryHint")}：` : "";
    return `${hint}${trimmed} · ${endpoint}${path}${status ? ` · HTTP ${status}` : ""}`;
}

/**
 * 提交顺序（回归守卫）：源视频/音频只能进 multipart，JSON 体根本带不了。
 * 实测 2026-10-28：API_VIDEO_EDITING 带源视频 + 参考图提交 api.cc-ai.xyz（中转域）时，
 * 旧的 `jsonFirst = inlineImages || prefersJsonFirst(baseUrl)` 判定为 true → 先发纯文本 JSON，
 * 上游返回 404 → 非 400/415/422 不重试 multipart → 源视频与参考图全部丢参，
 * 「视频编辑」静默降级成「文生视频」（界面仍显示视频编辑成功）。
 * 因此：只要本次请求带 videos/audios，就只发 multipart，不再尝试 JSON。
 */
export type VideoSubmitSlot = "json" | "multipart";

/**
 * 参考图能否内联进 JSON。
 * 实测 2026-10-29（sub2api / MiniMax-H3）：`images[]` 里的 data URL 会被上游采纳
 * （usage.input_image_count=1），且与是否同时带源视频无关；源视频只能以公网 http(s) URL
 * 走 `videos[]`。所以「有源视频就丢掉参考图」是错的，这里显式写成恒等判定并单测锁住。
 */
export function canInlineImagesToJson(imageCount: number): boolean {
    return imageCount > 0;
}

export function planVideoSubmitPayloads(input: {
    /** 参考图能否内联进 JSON（由 canInlineImagesToJson 决定，与是否有源视频无关）。 */
    inlineImages: boolean;
    /** 本次请求是否带只存在于 multipart 的素材（源视频/音频）。 */
    mediaOnlyInMultipart: boolean;
    /** 是否中转域（非 openai.com），中转多半只解析 JSON。 */
    relayHost: boolean;
    /**
     * 源视频是否已内联进 JSON（videos: [公网 http(s) URL]）。
     * 实测 2026-10-29：sub2api 的 /videos 收 multipart 直接 400
     * （`'utf-8' codec can't decode byte 0xe8`，把视频字节当文本解码），
     * 但 JSON `{"videos":["https://…mp4"]}` 返回 200 并建任务。
     * 因此源视频有公网地址时不能被迫走 multipart。
     */
    inlineVideos?: boolean;
}): { order: VideoSubmitSlot[] } {
    if (input.inlineVideos) {
        // 中转域只解析 JSON：先发 JSON，再留 multipart 兜底（官方 OpenAI 只认 multipart）
        return { order: input.relayHost ? ["json", "multipart"] : ["multipart", "json"] };
    }
    if (input.mediaOnlyInMultipart) return { order: ["multipart"] };
    const multipartFirst = !input.inlineImages && !input.relayHost;
    return { order: multipartFirst ? ["multipart", "json"] : ["json", "multipart"] };
}

/** 公网可访问的源视频地址（blob:/data:/idb 一律不算）。 */
export function collectPublicVideoUrls(videos: ReadonlyArray<{ url?: string }> | undefined): string[] {
    return (videos ?? [])
        .map((video) => (typeof video.url === "string" ? video.url.trim() : ""))
        .filter((url) => /^https?:\/\//i.test(url));
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

async function createOpenAIVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    const imageDataUrls = await Promise.all(references.map((image) => imageToDataUrl(image)));
    const images = imageDataUrls.map((dataUrl, index) => dataUrlToFile({ ...references[index], dataUrl }));
    const videos = await Promise.all((options?.videos || []).map((video) => referenceMediaToFile(video, "ref.mp4", "invalidReferenceVideo", options)));
    const audios = await Promise.all((options?.audios || []).map((audio) => referenceMediaToFile(audio, "ref.mp3", "invalidReferenceAudio", options)));
    const mode = resolveVideoMode(config.videoMode, images.length);
    const ratio = inferVideoRatio(config.size || "16:9");
    const body = new FormData();
    body.append("model", modelOptionName(model));
    body.append("prompt", prompt);
    body.append("seconds", normalizeVideoSeconds(config.videoSeconds));
    body.append("size", normalizeVideoSize(config.size, config.vquality) || "1280x720");
    if (ratio && ratio !== "auto") {
        body.append("ratio", ratio);
    }
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
        images.forEach((file, idx) => {
            body.append("image[]", file, `ref_${idx + 1}.png`);
            body.append("images", file, `ref_${idx + 1}.png`);
        });
    }
    videos.forEach((file) => body.append("video[]", file));
    audios.forEach((file) => body.append("audio[]", file));
    const media: File[] = [...images, ...videos, ...audios];
    // 部分中转（sub2api 等）的 /videos 只解析 JSON，收到 multipart 会直接 400「Expecting value」/
    // 「'utf-8' codec can't decode byte 0x89」（后者即 multipart 的 PNG 二进制被当文本解码）。
    // 官方 OpenAI 只认 multipart，因此保持 multipart 优先；被 400/415 拒绝时再用 JSON 重发一次。
    // 图片可用 data URL 内联进 JSON（实测 sub2api 的 images[] 字段会被采用，usage.input_image_count=1），
    // 视频/音频无法内联 —— 顺序由 planVideoSubmitPayloads 统一裁决。
    // 关键：参考图与源视频无关。旧实现写成「有视频就不内联图片」，导致源视频走 JSON 时参考图
    // 被整包丢掉（VIDEO_REPLICATION 这类「商品图 + 参考视频」会静默退化成只用视频）。
    const inlineImages = canInlineImagesToJson(imageDataUrls.length);
    const jsonFields: Record<string, unknown> = {
        model: modelOptionName(model),
        prompt,
        seconds: normalizeVideoSeconds(config.videoSeconds),
        size: normalizeVideoSize(config.size, config.vquality) || "1280x720",
        resolution_name: normalizeVideoResolution(config.vquality),
        generate_audio: boolConfig(config.videoGenerateAudio, true),
        watermark: boolConfig(config.videoWatermark, false),
        mode,
    };
    if (ratio && ratio !== "auto") jsonFields.ratio = ratio;
    if (inlineImages) jsonFields.images = await shrinkInlineImages(imageDataUrls);
    // 源视频有公网地址时可以直接进 JSON（videos: [url]）：中转域（sub2api 等）收 multipart 会 400。
    const publicVideoUrls = collectPublicVideoUrls(options?.videos);
    const inlineVideos = videos.length > 0 && publicVideoUrls.length === videos.length;
    if (inlineVideos) jsonFields.videos = publicVideoUrls;
    // 路由保持 OpenAI 标准 /videos：实测 sub2api 中转支持；ccai 中转整站不支持视频 API
    // （/videos 与 /video/generations 均失败，后者明确回 "Video API is not supported for this platform"），
    // 所以不做跨路由猜测，失败按上游原文报错。
    const post = (payload: FormData | Record<string, unknown>) => axios.post<ApiVideoResponse>(aiApiUrl(config, "/videos"), payload, {
        headers: payload instanceof FormData ? aiHeaders(config) : { ...aiHeaders(config), "Content-Type": "application/json" },
        signal: options?.signal,
    });
    const plan = planVideoSubmitPayloads({
        inlineImages: Boolean(inlineImages),
        mediaOnlyInMultipart: (videos.length > 0 && !inlineVideos) || audios.length > 0,
        relayHost: prefersJsonFirst(config.baseUrl),
        inlineVideos,
    });
    try {
        let created: ReturnType<typeof unwrapVideoResponse> | undefined;
        const payloads: Array<FormData | Record<string, unknown>> = plan.order.map((slot) => (slot === "json" ? jsonFields : body));
        let lastError: unknown;
        for (const payload of payloads) {
            try {
                created = unwrapVideoResponse((await withGatewayRetry(() => post(payload), 3)).data);
                break;
            } catch (error) {
                lastError = error;
                const status = requestStatus(error);
                if (status === 400 || status === 415 || status === 422) continue;
                throw error;
            }
        }
        if (!created) throw lastError;
        if (!created.id) throw new Error(apiText("noVideoTaskId"));
        return { id: created.id, provider: "openai", model };
    } catch (error) {
        throw new Error(withRequestDiagnosis(readAxiosError(error, apiText("videoTaskCreateFailed")), requestStatus(error), config.baseUrl, "/videos") + relayMultipartRejectionHint(requestStatus(error), readAxiosError(error, "")));
    }
}

async function pollOpenAIVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const video = unwrapVideoResponse((await axios.get<ApiVideoResponse>(aiApiUrl(config, `/videos/${task.id}`), { headers: aiHeaders(config), signal: options?.signal })).data);
        const url = videoResultUrl(video, config);
        if (url) return { status: "completed", result: await videoResultFromUrl(url, options, aiHeaders(config)) };
        if (isVideoDoneStatus(video.status)) {
            // 已完成却没有 URL：只能靠 /content。这里必须真校验容器，空体/HTML/JSON 一律判失败，
            // 否则会把 Cloudflare 错误页当成“生成成功”写进历史记录。
            try {
                const blob = await withGatewayRetry(async () => {
                    const content = await axios.get<Blob>(aiApiUrl(config, `/videos/${task.id}/content`), { headers: aiHeaders(config), responseType: "blob", signal: options?.signal });
                    return assertPlayableVideoBlob(content.data);
                }, 3);
                return { status: "completed", result: { blob } };
            } catch (error) {
                if (axios.isCancel(error) || options?.signal?.aborted) throw error;
                if (isVideoPayloadError(error)) return { status: "failed", error: error.message };
                throw error;
            }
        }
        if (isVideoFailedStatus(video.status)) return { status: "failed", error: readApiErrorMessage(video.error?.message) || apiText("videoGenerationFailed") };
        return { status: "pending" };
    } catch (error) {
        if (isVideoPayloadError(error)) return { status: "failed", error: error.message };
        const wrapped = new Error(readAxiosError(error, apiText("videoTaskQueryFailed"))) as Error & { retryable?: boolean };
        wrapped.retryable = isTransientPollFailure(error);
        throw wrapped;
    }
}

// 轮询/下载期间的瞬时网络故障：Cloudflare 5xx、边缘节点断连、限流。
// 上游任务往往已经生成成功（已扣费），这类错误不能让整条任务直接判失败。
function isTransientPollFailure(error: unknown) {
    if (axios.isCancel(error)) return false;
    const status = (error as { response?: { status?: number } } | null)?.response?.status;
    if (status) return status >= 500 || status === 408 || status === 429;
    return axios.isAxiosError(error) || error instanceof TypeError;
}

export function isRetryableVideoError(error: unknown) {
    return Boolean((error as { retryable?: boolean } | null)?.retryable);
}

async function videoResultFromUrl(url: string, options?: RequestOptions, headers?: Record<string, string>): Promise<VideoGenerationResult> {
    try {
        const blob = await withGatewayRetry(async () => {
            const response = await axios.get<Blob>(withLocalProxy(url), { responseType: "blob", headers, signal: options?.signal });
            return assertPlayableVideoBlob(response.data);
        }, 2);
        return { blob };
    } catch (error) {
        if (axios.isCancel(error) || options?.signal?.aborted) throw error;
        // 下载回来的是 HTML/JSON/空体 = 上游给的地址本身不是视频，必须判失败。
        if (isVideoPayloadError(error)) throw error;
        // 其余多为 CORS/网络限制：URL 可能仍可播放，保留 URL 交给 <video> 直接拉取。
        return { url, mimeType: "video/mp4" };
    }
}

async function createGeminiVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    // 内联图先瘦身，否则 2MB+ 的原图会让上游等到 Cloudflare 524
    const images = await shrinkInlineImages(await Promise.all(references.map((image) => imageToDataUrl(image))));
    const videos = await Promise.all((options?.videos || []).map((video) => referenceMediaToFile(video, "ref.mp4", "invalidReferenceVideo", options)));
    const audios = await Promise.all((options?.audios || []).map((audio) => referenceMediaToFile(audio, "ref.mp3", "invalidReferenceAudio", options)));
    const mode = resolveVideoMode(config.videoMode, images.length);
    const instance: Record<string, unknown> = { prompt };
    if (mode === "frames") {
        if (images[0]) instance.image = parseDataUrlInline(images[0]);
        if (images[1]) instance.lastFrame = parseDataUrlInline(images[1]);
    } else {
        instance.referenceImages = images.map((dataUrl) => ({ image: parseDataUrlInline(dataUrl), referenceType: "asset" }));
    }
    if (videos[0]) instance.video = await fileToGeminiInline(videos[0]);
    if (audios[0]) instance.audio = await fileToGeminiInline(audios[0]);
    try {
        const created = unwrapEnvelope((await axios.post<ApiEnvelope<GeminiVideoOperation>>(geminiVideoUrl(config, model, "predictLongRunning"), {
            instances: [instance],
            parameters: {
                aspectRatio: videoAspectRatio(config.size),
                durationSeconds: Number(normalizeVideoSeconds(config.videoSeconds)) || 8,
                resolution: normalizeVideoResolution(config.vquality),
                generateAudio: boolConfig(config.videoGenerateAudio, true),
                addWatermark: boolConfig(config.videoWatermark, false),
            },
        }, { headers: geminiVideoHeaders(config), signal: options?.signal })).data, apiText("noVideoTask"));
        if (!created.name) throw new Error(apiText("noVideoTaskId"));
        return { id: created.name, provider: "gemini", model };
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("videoTaskCreateFailed")));
    }
}

async function pollGeminiVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const state = unwrapEnvelope((await axios.get<ApiEnvelope<GeminiVideoOperation>>(geminiOperationUrl(config, task.id), { headers: geminiVideoHeaders(config), signal: options?.signal })).data, apiText("videoTaskQueryFailed"));
        if (state.error) return { status: "failed", error: readApiErrorMessage(state.error.message) || apiText("videoGenerationFailed") };
        if (!state.done) return { status: "pending" };
        const uri = state.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
        if (!uri) return { status: "failed", error: apiText("noPlayableVideo") };
        const url = uri.includes("key=") ? uri : `${uri}${uri.includes("?") ? "&" : "?"}key=${config.apiKey}`;
        return { status: "completed", result: await videoResultFromUrl(url, options) };
    } catch (error) {
        throw new Error(readAxiosError(error, apiText("videoTaskQueryFailed")));
    }
}

function assertVideoConfig(config: AiConfig, model: string) {
    if (!model) throw new Error(apiText("videoModelRequired"));
    if (!config.baseUrl.trim()) throw new Error(apiText("baseUrlRequired"));
    if (!config.apiKey.trim()) throw new Error(apiText("apiKeyRequired"));
}

function geminiVideoBaseUrl(config: Pick<AiConfig, "baseUrl">) {
    const normalizedBaseUrl = config.baseUrl.trim().replace(/\/+$/, "");
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    return lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/v1beta") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1beta`;
}

function geminiVideoUrl(config: Pick<AiConfig, "baseUrl">, model: string, action: string) {
    return withLocalProxy(`${geminiVideoBaseUrl(config)}/models/${encodeURIComponent(modelOptionName(model).replace(/^models\//, ""))}:${action}`);
}

function geminiOperationUrl(config: Pick<AiConfig, "baseUrl">, name: string) {
    return withLocalProxy(`${geminiVideoBaseUrl(config)}/${name.replace(/^\//, "")}`);
}

function geminiVideoHeaders(config: Pick<AiConfig, "apiKey">) {
    return { "x-goog-api-key": config.apiKey, "Content-Type": "application/json" };
}

function videoAspectRatio(size: string) {
    const ratio = inferVideoRatio(size);
    return ratio === "auto" ? "16:9" : ratio;
}

function parseDataUrlInline(dataUrl: string, fallbackType = "image/png"): GeminiInlineData {
    const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    return { bytesBase64Encoded: match?.[2] || "", mimeType: match?.[1] || fallbackType };
}

async function fileToGeminiInline(file: File): Promise<GeminiInlineData> {
    return parseDataUrlInline(await readFileAsDataUrl(file), file.type || "application/octet-stream");
}

/** 0.27：通用 HTTP 视频协议——提交一次拿任务 ID，再按轮询地址取状态与结果。 */
async function createHttpVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], options?: VideoMediaOptions): Promise<VideoGenerationTask> {
    const protocol = resolveVideoHttpConfig(config, model);
    const baseUrl = (config.baseUrl || "").trim();
    const submitUrl = withLocalProxy(renderHttpUrlTemplate(protocol.submitUrl, { baseUrl, apiKey: config.apiKey, taskId: "" }));
    if (!submitUrl) throw new Error(apiText("httpSubmitUrlRequired"));
    const images = await shrinkInlineImages(await Promise.all(references.map((image) => imageToDataUrl(image))));
    const values: Record<string, unknown> = {
        baseUrl,
        apiKey: config.apiKey,
        model: modelOptionName(model),
        prompt,
        seconds: Number(normalizeVideoSeconds(config.videoSeconds)) || 6,
        size: normalizeVideoSize(config.size, config.vquality),
        ratio: inferVideoRatio(config.size || "16:9"),
        resolution: normalizeVideoResolution(config.vquality),
        mode: resolveVideoMode(config.videoMode, images.length),
        generateAudio: boolConfig(config.videoGenerateAudio, true),
        watermark: boolConfig(config.videoWatermark, false),
        images,
    };
    const bodyText = renderHttpTemplate(protocol.bodyTemplate, values);
    const parsedBody = parseHttpJson(bodyText);
    if (!parsedBody) throw new Error(apiText("httpBodyInvalidJson"));
    try {
        const data = (await withGatewayRetry(() => axios.post(submitUrl, parsedBody, { headers: httpHeaders(protocol, values), signal: options?.signal }), 3)).data;
        if (!protocol.pollUrl.trim()) {
            const direct = httpResultFromValue(httpPathValue(data, protocol.resultPath));
            if (!direct) throw new Error(apiText("noPlayableVideo"));
            const id = nanoid();
            httpVideoResults.set(id, direct);
            return { id, provider: "http", model };
        }
        const taskId = String(httpPathValue(data, protocol.taskIdPath) ?? "").trim();
        if (!taskId) throw new Error(apiText("noVideoTaskId"));
        return { id: taskId, provider: "http", model };
    } catch (error) {
        throw new Error(withRequestDiagnosis(readAxiosError(error, apiText("videoTaskCreateFailed")), requestStatus(error), baseUrl, " · 提交"));
    }
}

async function pollHttpVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    const cached = httpVideoResults.get(task.id);
    if (cached) return { status: "completed", result: cached };
    const protocol = resolveVideoHttpConfig(config, task.model);
    const baseUrl = (config.baseUrl || "").trim();
    const values: Record<string, unknown> = { baseUrl, apiKey: config.apiKey, taskId: task.id, model: modelOptionName(task.model) };
    const pollUrl = withLocalProxy(renderHttpUrlTemplate(protocol.pollUrl, values));
    if (!pollUrl) return { status: "failed", error: apiText("httpPollUrlRequired") };
    try {
        const response = await axios.get(pollUrl, { headers: httpHeaders(protocol, values), signal: options?.signal });
        const data = response.data;
        const status = String(httpPathValue(data, protocol.statusPath) ?? "").trim().toLowerCase();
        const success = splitValues(protocol.successValues);
        const failure = splitValues(protocol.failureValues);
        const result = httpResultFromPaths(data, protocol.resultPath);
        const resultUrl = result ? resolveHttpResultUrl(result.url as string, baseUrl) : "";
        const resultHeaders = httpHeaders(protocol, values);
        if (result && (!status || !failure.length || !failure.includes(status))) {
            return { status: "completed", result: await videoResultFromUrl(resultUrl, options, resultHeaders) };
        }
        if (status && failure.includes(status)) {
            const message = String(httpPathValue(data, protocol.errorPath) ?? "").trim() || apiText("videoTaskFailedGeneric");
            return { status: "failed", error: message };
        }
        if (status && success.length && success.includes(status)) {
            return result ? { status: "completed", result: await videoResultFromUrl(resultUrl, options, resultHeaders) } : { status: "failed", error: apiText("noPlayableVideo") };
        }
        return { status: "pending" };
    } catch (error) {
        // 轮询遇到网关瞬时故障（520/524/断连）不能判任务失败——上游很可能还在生成，
        // 判失败会让画布节点红灯、用户重试后重复扣费。
        if (axios.isCancel(error) || options?.signal?.aborted) return { status: "failed", error: readAxiosError(error, apiText("videoTaskCreateFailed")) };
        return { status: "pending" };
    }
}

function httpHeaders(protocol: VideoHttpConfig, values: Record<string, unknown>) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const configured = protocol.headers.trim() ? parseHttpJson(renderHttpTemplate(protocol.headers, values)) : null;
    if (configured && typeof configured === "object") {
        Object.entries(configured as Record<string, unknown>).forEach(([key, value]) => {
            if (value === undefined || value === null || value === "") return;
            if (key.toLowerCase() === "content-type") return;
            headers[key] = String(value);
        });
        return headers;
    }
    if (values.apiKey) headers.Authorization = `Bearer ${String(values.apiKey)}`;
    return headers;
}

/**
 * URL 模板占位符 {{key}}：原样替换为字符串，绝不加引号——`{{baseUrl}}/videos` 必须渲染成
 * `http://host/videos`，而不是 `"http://host"/videos`。URL 里需要编码的值自己写成整段占位符。
 */
function renderHttpUrlTemplate(template: string, values: Record<string, unknown>) {
    return (template || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (match: string, key: string) => {
        if (!(key in values)) return match;
        return String(values[key] ?? "");
    });
}

/**
 * 结果里的视频地址可能是相对路径（OpenAI 风格的 `/v1/videos/<id>/content`），
 * 按渠道 baseUrl 补全成绝对地址后再下载；已是绝对地址则原样返回。
 */
function resolveHttpResultUrl(url: string, baseUrl: string) {
    const trimmed = (url || "").trim();
    if (!trimmed) return "";
    if (/^(https?:|blob:|data:)/i.test(trimmed)) return trimmed;
    const base = (baseUrl || "").trim().replace(/\/+$/, "");
    if (!base) return trimmed;
    return trimmed.startsWith("/") ? `${base}${trimmed}` : `${base}/${trimmed}`;
}

/** 模板占位符 {{key}}：引号内替换为转义后的字符串，引号外替换为 JSON 值（用于 JSON 请求体与请求头）。 */
function renderHttpTemplate(template: string, values: Record<string, unknown>) {
    return (template || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (match: string, key: string, offset: number, input: string) => {
        if (!(key in values)) return match;
        const value = values[key];
        const before = input[offset - 1];
        const after = input[offset + match.length];
        if (before === '"' && after === '"') {
            if (typeof value === "string") return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
            return String(value ?? "");
        }
        return JSON.stringify(value ?? null);
    });
}

function parseHttpJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function httpPathValue(source: unknown, path: string): unknown {
    const trimmed = (path || "").trim();
    if (!trimmed) return undefined;
    return trimmed.split(".").reduce<unknown>((current, key) => {
        if (current === null || current === undefined) return undefined;
        if (Array.isArray(current)) {
            const index = Number(key);
            return Number.isInteger(index) ? current[index] : undefined;
        }
        if (typeof current !== "object") return undefined;
        return (current as Record<string, unknown>)[key];
    }, source);
}

function splitValues(value: string) {
    return (value || "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
}

/** 结果字段可能是 URL 字符串，也可能是 { url } / { video_url } 这类对象。 */
function httpResultFromValue(value: unknown): VideoGenerationResult | null {
    if (typeof value === "string" && value.trim()) return { url: value.trim(), mimeType: "video/mp4" };
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        const url = [record.url, record.video_url, record.result_url, record.videoUrl].find((item) => typeof item === "string" && item) as string | undefined;
        if (url) return { url, mimeType: "video/mp4" };
    }
    return null;
}

/** 配置的 resultPath 没命中时，再试这些常见位置——真实厂商的返回结构五花八门（如 video.url）。 */
const HTTP_RESULT_FALLBACK_PATHS = [
    "video.url",
    "video.video_url",
    "video_url",
    "videoUrl",
    "data.video.url",
    "data.video_url",
    "data.output.video_url",
    "output.video_url",
    "result.video_url",
    "url",
];

function httpResultFromPaths(source: unknown, path: string) {
    const primary = httpResultFromValue(httpPathValue(source, path));
    if (primary) return primary;
    const configured = (path || "").trim();
    for (const candidate of HTTP_RESULT_FALLBACK_PATHS) {
        if (candidate === configured) continue;
        const found = httpResultFromValue(httpPathValue(source, candidate));
        if (found) return found;
    }
    return null;
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

function unwrapVideoResponse(payload: ApiVideoResponse) {
    return unwrapEnvelope(payload, apiText("noVideoTask"));
}

function unwrapEnvelope<T>(payload: ApiEnvelope<T>, emptyMessage: string): T {
    if (!payload) throw new Error(emptyMessage);
    if (typeof payload === "object" && "code" in payload && payload.code !== undefined) {
        if (payload.code !== 0 && payload.code !== "0") throw new Error(readApiErrorMessage(payload) || apiText("requestFailed"));
        if (!payload.data) throw new Error(emptyMessage);
        return payload.data;
    }
    return payload as T;
}

function videoResultUrl(payload: VideoResponse, config?: Pick<AiConfig, "baseUrl">) {
    const candidates = [payload.video_url, payload.result_url, payload.url, payload.video?.url, payload.content?.video_url, payload.content?.url];
    for (const candidate of candidates) {
        if (typeof candidate !== "string" || !candidate.trim()) continue;
        const url = resolveVideoMediaUrl(candidate, config);
        if (url) return url;
    }
    return undefined;
}

/** Some relays（如 sub2api）返回的是相对路径 /v1/videos/<id>/content，需要拼回 baseUrl。 */
function resolveVideoMediaUrl(raw: string, config?: Pick<AiConfig, "baseUrl">) {
    const url = raw.trim();
    if (/^https?:\/\//i.test(url) || url.startsWith("blob:") || url.startsWith("data:")) {
        return isPublicMediaUrl(url) || /\.mp4(\?|#|$)/i.test(url) || url.startsWith("blob:") || url.startsWith("data:") ? url : undefined;
    }
    if (!url.startsWith("/") || !config) return undefined;
    const baseUrl = config.baseUrl.trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
    return baseUrl ? `${baseUrl}${url}` : undefined;
}

const VIDEO_DONE_STATUS = new Set(["completed", "complete", "done", "succeeded", "success", "finished"]);
const VIDEO_FAILED_STATUS = new Set(["failed", "failure", "error", "cancelled", "canceled"]);

/** 各家中转的完成态命名不一致：OpenAI 用 completed，sub2api 用 done。 */
function isVideoDoneStatus(status?: string) {
    return !!status && VIDEO_DONE_STATUS.has(status.trim().toLowerCase());
}

function isVideoFailedStatus(status?: string) {
    return !!status && VIDEO_FAILED_STATUS.has(status.trim().toLowerCase());
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
    // error may be a string or an object containing a message.
    const errorMsg =
        typeof payload.error === "string"
            ? payload.error
            : (payload.error as { message?: unknown })?.message;
    return (
        readApiErrorMessage(payload.msg) ||
        readApiErrorMessage(payload.message) ||
        readApiErrorMessage(errorMsg) ||
        readApiErrorMessage(payload.detail) ||
        ""
    );
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return apiText("requestCanceled");
    if (axios.isAxiosError<{ error?: { message?: string }; msg?: string; message?: string; code?: number | string }>(error)) {
        if (!error.response && error.code === "ERR_NETWORK") return apiText("requestFailed");
        const responseData = error.response?.data;
        return readApiErrorMessage(responseData) || statusMessage(error.response?.status, fallback);
    }
    if (error instanceof DOMException && error.name === "AbortError") return apiText("requestCanceled");
    return error instanceof Error ? readApiErrorMessage(error.message) || error.message : fallback;
}

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return apiText("authenticationFailed");
    if (status === 429) return apiText("rateLimited");
    return status ? `${fallback}（${status}）` : fallback;
}

/* ========================= 真实视频载荷校验（TASK-047） ========================= */

/**
 * 上游“已完成”不等于“有视频”。真实踩过的坑：
 * - `/videos/{id}/content` 在 Cloudflare/中转异常时返回 HTML 错误页、JSON 错误体，甚至 200 空体；
 * - 旧的 assertVideoBlob 只在 `type` 含 json 时才校验，HTML/空 blob 会被当成成果 → 假成功。
 * 这里按容器魔数判定“可播放”，判定不了就判失败，绝不返回一个打不开的文件。
 */
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
    if (!bytes || bytes.byteLength === 0) {
        throw new VideoPayloadError("empty-video-payload", apiText("noPlayableVideo"));
    }
    const mimeType = (typeof blob === "object" && blob && "type" in blob ? blob.type : "") || "";
    const head = bytes.subarray(0, 64);
    const text = new TextDecoder().decode(head).trimStart();
    if (text.startsWith("<")) {
        throw new VideoPayloadError("html-video-payload", apiText("htmlError", { preview: `${text.slice(0, 80)}...` }));
    }
    if (head[0] === 0x7b || head[0] === 0x5b || mimeType.toLowerCase().includes("json")) {
        // JSON 错误体：尽量取出上游的人话，取不到再退回通用文案。
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
    if (!isPlayableVideoPayload(head, mimeType)) {
        throw new VideoPayloadError("unknown-video-container", apiText("noPlayableVideo"));
    }
    // 兜住“不是真 Blob”的适配器（Node/Bun 的 axios 会忽略 responseType:"blob" 返回字符串），
    // 统一交回 Blob，避免下游 createObjectURL 收到字符串。
    if (typeof Blob !== "undefined" && !(blob instanceof Blob)) {
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        return new Blob([copy.buffer as ArrayBuffer], { type: mimeType || "video/mp4" });
    }
    return blob;
}

/**
 * 把下载到的载荷统一读成字节。浏览器给 Blob；Node/Bun 的 axios 忽略 `responseType: "blob"`，
 * 会把二进制按 latin1 变成字符串——这里逐字符映射回字节，不静默丢弃内容。
 */
async function readPayloadBytes(payload: Blob | Uint8Array | ArrayBuffer | string): Promise<Uint8Array> {
    if (typeof payload === "string") {
        const bytes = new Uint8Array(payload.length);
        for (let index = 0; index < payload.length; index += 1) bytes[index] = payload.charCodeAt(index) & 0xff;
        return bytes;
    }
    if (payload instanceof Uint8Array) return payload;
    if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
    if (payload && typeof (payload as Blob).arrayBuffer === "function") {
        return new Uint8Array(await (payload as Blob).arrayBuffer());
    }
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
    const url = (result.url || "").trim();
    if (isPublicMediaUrl(url) || url.startsWith("blob:") || url.startsWith("data:video/")) return result;
    throw videoTaskFailed(apiText("noPlayableVideo"));
}

function isPublicMediaUrl(value: string) {
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
