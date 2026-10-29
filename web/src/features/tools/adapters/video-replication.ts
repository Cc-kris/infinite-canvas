/**
 * TASK-043 / VIDEO_REPLICATION adapter —— 把「视频复刻」页状态变成一次真实视频请求。
 *
 * 事实边界：
 * - 请求经 `useToolTaskStore.runTool` → gateway → provider；本文件不伪造成功，也不写死结果。
 * - registry 声明的 27 个字段一次性落齐，`auditVideoReplicationFields` 逐个核对，杜绝「静默丢参」。
 * - 视频服务只吃 prompt，因此截取区间/分辨率/比例/时长/语言/国家全部写进 prompt（见 registry 的 segments）。
 * - 原站该页没有「商品分割图 / 自定义封面」控件：`imageSegUrl` / `videoCoverType` 显式留空并标注不适用，
 *   不拿别的 URL 冒充；`coverUrl` 用参考视频封面。
 */

import type { ToolAssetRecord } from "@/services/api/tools/assets";
import type { BrowserToolInput, SubmitOptions, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
import type { ReferenceImage } from "@/types/image";

import {
    VIDEO_REPLICATION_PROMPT_LIMIT,
    VIDEO_REPLICATION_REFERENCE_LIMITS,
    VIDEO_REPLICATION_TOOL_ID,
    VIDEO_REPLICATION_VIDEO_LIMITS,
    effectiveVideoReplicationSeconds,
    hashVideoReplicationParts,
    normalizeVideoReplicationClip,
    resolveVideoReplicationCatalog,
    videoReplicationPromptSegments,
    videoReplicationStableParts,
    type VideoReplicationCatalog,
    type VideoReplicationValues,
} from "@/features/tools/registry/video-replication";

export { VIDEO_REPLICATION_TOOL_ID };

/** registry 声明的 27 个字段（与 gateway TOOL_ADAPTER_TABLE 完全一致）。 */
export const VIDEO_REPLICATION_FIELD_KEYS = [
    "analyzeRedisKey",
    "aspectRatio",
    "clipEnd",
    "clipMode",
    "clipStart",
    "coverUrl",
    "duration",
    "imageSegUrl",
    "imageUrl",
    "isPro",
    "originalVideoId",
    "originalVideoUrl",
    "prompt",
    "promptOptimizer",
    "ratio",
    "refImageList",
    "refVideoName",
    "refVideoUrl",
    "resolution",
    "saleCountry",
    "sourceVideoDuration",
    "sourceVideoUrl",
    "targetLanguage",
    "videoCoverType",
    "videoSource",
    "videoTime",
    "videoType",
] as const;

/** 本页没有对应控件的字段：允许为空，但不允许「悄悄消失」。 */
export const VIDEO_REPLICATION_INAPPLICABLE_FIELDS = ["imageSegUrl", "videoCoverType"] as const;

/** 商品参考图支持的格式（原站文案：支持上传6张图，png/jpeg/webp）。 */
export const VIDEO_REPLICATION_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"] as const;

/** 本页可为空的字段：AI 分析未跑时 analyzeRedisKey 就是空串，不能算丢参。 */
export const VIDEO_REPLICATION_EMPTY_ALLOWED_FIELDS = [...VIDEO_REPLICATION_INAPPLICABLE_FIELDS, "analyzeRedisKey"] as const;

/* ============================== 错误 ============================== */

export type VideoReplicationErrorCode =
    | "no-video"
    | "video-mime"
    | "video-too-large"
    | "video-empty"
    | "clip-invalid"
    | "no-reference"
    | "too-many-references"
    | "reference-unavailable"
    | "prompt-empty"
    | "prompt-too-long"
    | "param-dropped"
    | "model-missing"
    | "link-unresolved"
    | "link-empty"
    | "link-invalid";

export class VideoReplicationAdapterError extends Error {
    readonly code: VideoReplicationErrorCode;

    constructor(code: VideoReplicationErrorCode, message: string) {
        super(message);
        this.name = "VideoReplicationAdapterError";
        this.code = code;
    }
}

/* ============================== 27 字段 ============================== */

export type VideoReplicationRefEntry = { id: string; name: string; url: string; width?: number; height?: number };

export type VideoReplicationFieldsInput = {
    values: VideoReplicationValues;
    video: VideoReplicationVideoSource;
    references: readonly VideoReplicationRefEntry[];
    catalog?: VideoReplicationCatalog;
};

/**
 * registry 声明的 27 个字段一次性落齐。
 * `imageSegUrl` / `videoCoverType` 本页无控件，显式空串；其余字段都必须来自真实页面状态。
 */
export function buildVideoReplicationFields(input: VideoReplicationFieldsInput): Record<string, unknown> {
    const { values, video, references } = input;
    const clip = normalizeVideoReplicationClip(values.clipStart, values.clipEnd, values.sourceVideoDuration);
    const segments = videoReplicationPromptSegments(values, input.catalog);
    return {
        analyzeRedisKey: values.analyzeRedisKey,
        aspectRatio: values.ratio,
        clipEnd: clip.end,
        clipMode: values.clipMode,
        clipStart: clip.start,
        coverUrl: video.url,
        duration: effectiveVideoReplicationSeconds(values),
        imageSegUrl: "",
        imageUrl: references[0]?.url ?? "",
        isPro: values.isPro,
        originalVideoId: video.assetId,
        originalVideoUrl: video.url,
        prompt: segments.text,
        promptOptimizer: values.promptOptimizer,
        ratio: values.ratio,
        refImageList: references.map((reference, index) => ({
            index,
            id: reference.id,
            name: reference.name,
            url: reference.url,
            width: reference.width,
            height: reference.height,
        })),
        refVideoName: video.name,
        refVideoUrl: video.url,
        resolution: values.resolution,
        saleCountry: values.saleCountry,
        sourceVideoDuration: Math.round((video.durationMs ?? 0) / 100) / 10,
        sourceVideoUrl: video.url,
        targetLanguage: values.targetLanguage,
        videoCoverType: "",
        videoSource: values.sourceMode,
        videoTime: values.videoTime,
        videoType: values.videoType,
    };
}

export type VideoReplicationFieldAudit = {
    missing: string[];
    inapplicable: string[];
    /** 字段齐全（不适用字段允许为空串） */
    ok: boolean;
};

/** 字段审计：27 个键一个都不能少；只有「本页无控件 / 可空」的键允许空值。 */
export function auditVideoReplicationFields(fields: Record<string, unknown>): VideoReplicationFieldAudit {
    const inapplicable = [...VIDEO_REPLICATION_INAPPLICABLE_FIELDS] as string[];
    const emptyAllowed = [...VIDEO_REPLICATION_EMPTY_ALLOWED_FIELDS] as string[];
    const missing = VIDEO_REPLICATION_FIELD_KEYS.filter((key) => {
        if (!(key in fields)) return true;
        if (emptyAllowed.includes(key)) return false;
        const value = fields[key];
        if (value === null || value === undefined) return true;
        if (typeof value === "string") return value.trim().length === 0;
        if (Array.isArray(value)) return value.length === 0;
        return false;
    });
    return { missing, inapplicable, ok: missing.length === 0 };
}

/* ============================== 参考视频校验 ============================== */

export type VideoReplicationVideoSource = {
    assetId: string;
    name: string;
    url: string;
    storageKey?: string;
    mimeType?: string;
    bytes?: number;
    durationMs?: number;
};

export type VideoReplicationVideoCheck = { ok: true } | { ok: false; code: VideoReplicationErrorCode; message: string };

/** 逐文件校验：MP4/MOV、≤100MB（页面规格 §1 与原站文案一致）。 */
export function checkVideoReplicationVideo(source: {
    name?: string;
    mimeType?: string;
    bytes?: number;
}): VideoReplicationVideoCheck {
    const name = source.name || "参考视频";
    const mime = (source.mimeType ?? "").toLowerCase();
    const allowed = VIDEO_REPLICATION_VIDEO_LIMITS.mimeTypes as readonly string[];
    if (mime && !allowed.includes(mime)) {
        return { ok: false, code: "video-mime", message: `${name} 格式不支持：仅 MP4 / MOV` };
    }
    if (typeof source.bytes === "number") {
        if (source.bytes <= 0) return { ok: false, code: "video-empty", message: `${name} 是空文件` };
        if (source.bytes > VIDEO_REPLICATION_VIDEO_LIMITS.maxBytes) {
            const mb = (source.bytes / 1024 / 1024).toFixed(1);
            return { ok: false, code: "video-too-large", message: `${name} 超过 100MB（当前 ${mb}MB）` };
        }
    }
    return { ok: true };
}

export function isVideoReplicationVideoReady(record: ToolAssetRecord | null | undefined): record is ToolAssetRecord {
    if (!record) return false;
    return checkVideoReplicationVideo({ name: record.name, mimeType: record.mimeType, bytes: record.bytes }).ok;
}

/** 片段区间校验：5–30 秒，且不越过原视频长度。 */
export function checkVideoReplicationClip(values: VideoReplicationValues): VideoReplicationVideoCheck {
    const clip = normalizeVideoReplicationClip(values.clipStart, values.clipEnd, values.sourceVideoDuration);
    if (!(clip.end > clip.start)) {
        return { ok: false, code: "clip-invalid", message: "片段时间轴起点必须小于终点" };
    }
    if (clip.seconds < VIDEO_REPLICATION_VIDEO_LIMITS.clipMinSeconds) {
        return { ok: false, code: "clip-invalid", message: `参考片段至少 ${VIDEO_REPLICATION_VIDEO_LIMITS.clipMinSeconds} 秒，当前 ${clip.seconds} 秒` };
    }
    if (clip.seconds > VIDEO_REPLICATION_VIDEO_LIMITS.clipMaxSeconds) {
        return { ok: false, code: "clip-invalid", message: `参考片段最多 ${VIDEO_REPLICATION_VIDEO_LIMITS.clipMaxSeconds} 秒，当前 ${clip.seconds} 秒` };
    }
    if (values.sourceVideoDuration > 0 && clip.end > values.sourceVideoDuration + 0.05) {
        return { ok: false, code: "clip-invalid", message: "片段终点超出原视频时长，请重新截取" };
    }
    return { ok: true };
}

/** 参考图逐张校验（≤6 张、≤10MB、384²–4096²、宽高比 0.4–2.5、png/jpeg/webp）。 */
export function checkVideoReplicationReference(source: {
    name?: string;
    mimeType?: string;
    bytes?: number;
    width?: number;
    height?: number;
}): VideoReplicationVideoCheck {
    const limit = VIDEO_REPLICATION_REFERENCE_LIMITS;
    const name = source.name || "参考图";
    const mime = (source.mimeType ?? "").toLowerCase();
    if (mime && !(VIDEO_REPLICATION_IMAGE_MIME_TYPES as readonly string[]).includes(mime)) {
        return { ok: false, code: "reference-unavailable", message: `${name} 格式不支持：仅 png / jpeg / webp` };
    }
    if (typeof source.bytes === "number") {
        if (source.bytes <= 0) return { ok: false, code: "reference-unavailable", message: `${name} 是空文件` };
        if (source.bytes > limit.maxBytes) {
            return { ok: false, code: "reference-unavailable", message: `${name} 超过 10MB（当前 ${(source.bytes / 1024 / 1024).toFixed(1)}MB）` };
        }
    }
    const { width, height } = source;
    if (typeof width === "number" && typeof height === "number" && width > 0 && height > 0) {
        if (width < limit.minSide || height < limit.minSide || width > limit.maxSide || height > limit.maxSide) {
            return { ok: false, code: "reference-unavailable", message: `${name} 尺寸 ${width}×${height}，需在 384–4096 之间` };
        }
        const ratio = width / height;
        if (ratio < limit.minAspect || ratio > limit.maxAspect) {
            return { ok: false, code: "reference-unavailable", message: `${name} 宽高比 ${ratio.toFixed(2)}，需在 0.4–2.5 之间` };
        }
    }
    return { ok: true };
}

/** 批量校验参考图：控件旁提示与提交前汇总复用同一份结果。 */
export function videoReplicationReferenceIssues(records: readonly ToolAssetRecord[]): string[] {
    const limit = VIDEO_REPLICATION_REFERENCE_LIMITS;
    const issues: string[] = [];
    if (records.length > limit.maxCount) issues.push(`商品参考图最多 ${limit.maxCount} 张，当前 ${records.length} 张`);
    for (const record of records) {
        const check = checkVideoReplicationReference({
            name: record.name,
            mimeType: record.mimeType,
            bytes: record.bytes,
            width: record.width,
            height: record.height,
        });
        if (!check.ok) issues.push(check.message);
    }
    return issues;
}

/** 资产记录 → 真实参考图（dataUrl 由调用方从本地存储读出，adapter 不碰 IndexedDB）。 */
export function toVideoReplicationReference(input: {
    id: string;
    name: string;
    dataUrl: string;
    type?: string;
    url?: string;
    storageKey?: string;
}): ReferenceImage {
    if (!input.dataUrl) {
        throw new VideoReplicationAdapterError("reference-unavailable", "商品参考图本地数据不可用，请重新上传");
    }
    return {
        id: input.id,
        name: input.name,
        type: input.type || "image/png",
        dataUrl: input.dataUrl,
        url: input.url,
        storageKey: input.storageKey,
    };
}

/* ============================== 提交前断言 ============================== */

export type VideoReplicationInput = {
    values: VideoReplicationValues;
    model: string;
    video: VideoReplicationVideoSource;
    references: readonly VideoReplicationRefEntry[];
    catalog?: VideoReplicationCatalog;
};

/**
 * 提交前在页面侧做的同一份校验（服务端仍按 schema 再校验一次）。
 * 任何一条不满足都直接抛错——不静默降级、不带着半份配置去打上游。
 */
export function assertVideoReplicationInput(input: VideoReplicationInput): void {
    const model = input.model.trim();
    if (!model) throw new VideoReplicationAdapterError("model-missing", "请先选择视频模型");

    if (input.values.sourceMode === "link") {
        /* 链接模式走公网直链（实测 2026-10-29：上游 /videos 只收公网 http(s) URL，
           本地 blob/data 地址一律 400）。这里只做「是不是公网直链」的判定，
           不假装能解析 TikTok 分享页——页面链接仍按未接入报错。 */
        const link = parsePublicVideoLink(input.values.videoLink);
        if (!link.ok) throw new VideoReplicationAdapterError(link.code, link.message);
    } else {
        const videoCheck = checkVideoReplicationVideo({ name: input.video.name, mimeType: input.video.mimeType, bytes: input.video.bytes });
        if (!videoCheck.ok) throw new VideoReplicationAdapterError(videoCheck.code, videoCheck.message);
        if (!input.video.url.trim()) {
            throw new VideoReplicationAdapterError("no-video", "参考视频地址缺失，请重新上传");
        }
    }

    const clipCheck = checkVideoReplicationClip(input.values);
    if (!clipCheck.ok) throw new VideoReplicationAdapterError(clipCheck.code, clipCheck.message);

    if (input.references.length < 1) {
        throw new VideoReplicationAdapterError("no-reference", "请至少上传 1 张商品参考图");
    }
    if (input.references.length > VIDEO_REPLICATION_REFERENCE_LIMITS.maxCount) {
        throw new VideoReplicationAdapterError(
            "too-many-references",
            `商品参考图最多 ${VIDEO_REPLICATION_REFERENCE_LIMITS.maxCount} 张`,
        );
    }

    const prompt = input.values.prompt.trim();
    if (!prompt) throw new VideoReplicationAdapterError("prompt-empty", "口播脚本不能为空：请填写或先用 AI 脚本分析生成后校对");
    if (prompt.length > VIDEO_REPLICATION_PROMPT_LIMIT) {
        throw new VideoReplicationAdapterError("prompt-too-long", `口播脚本最多 ${VIDEO_REPLICATION_PROMPT_LIMIT} 字`);
    }

    const catalog = input.catalog ?? resolveVideoReplicationCatalog();
    if (!catalog.countries.some((item) => item.id === input.values.saleCountry)) {
        throw new VideoReplicationAdapterError("param-dropped", "销售国家/地区不在当前目录中");
    }
    if (!catalog.languages.some((item) => item.id === input.values.targetLanguage)) {
        throw new VideoReplicationAdapterError("param-dropped", "目标语言不在当前目录中");
    }
    if (!catalog.videoTypes.some((item) => item.id === input.values.videoType)) {
        throw new VideoReplicationAdapterError("param-dropped", "视频类型不在当前目录中");
    }
}

/* ============================== 参数进提示词审计 ============================== */

/**
 * 只在 UI 选中、却没进 prompt 的参数等于没生效。逐项核对提示词是否携带：
 * 脚本正文、截取区间、比例/分辨率/时长、目标语言/销售国家、参考图数量/视频类型。
 */
export function assertVideoReplicationPromptCoverage(input: {
    values: VideoReplicationValues;
    prompt: string;
    catalog?: VideoReplicationCatalog;
}): void {
    const segments = videoReplicationPromptSegments(input.values, input.catalog);
    const text = input.prompt;
    const problems: string[] = [];
    if (!text.includes(segments.script)) problems.push("脚本正文");
    if (!text.includes(segments.clip)) problems.push("截取区间");
    if (!text.includes(segments.output)) problems.push("比例/分辨率/时长");
    if (!text.includes(segments.market)) problems.push("目标语言/销售国家");
    if (!text.includes(segments.product)) problems.push("参考图数量/视频类型");
    if (problems.length) {
        throw new VideoReplicationAdapterError("param-dropped", `提交参数校验失败：${problems.join("、")}未进入提示词`);
    }
}

/* ============================== 真实请求 ============================== */

export type VideoReplicationBrowserInputArgs = VideoReplicationInput & {
    /** 商品图本地数据，顺序与 references 一致。 */
    referenceImages: readonly ReferenceImage[];
    videoRef: import("@/types/media").ReferenceVideo;
};

/**
 * 组装 gateway 入参：prompt 带齐全部参数，references 是商品图，videos 是参考视频，
 * size 用出片比例（gateway 视频分支只认 config.size）。
 */
export function buildVideoReplicationBrowserInput(input: VideoReplicationBrowserInputArgs): BrowserToolInput {
    assertVideoReplicationInput(input);
    if (input.referenceImages.length !== input.references.length) {
        throw new VideoReplicationAdapterError("reference-unavailable", "商品图与本地文件数量不一致，请重新上传后再提交");
    }

    const fields = buildVideoReplicationFields({
        values: input.values,
        video: input.video,
        references: input.references,
        catalog: input.catalog,
    });
    const audit = auditVideoReplicationFields(fields);
    if (!audit.ok) {
        throw new VideoReplicationAdapterError("param-dropped", `提交参数校验失败：缺失 ${audit.missing.join("、")}`);
    }

    const prompt = String(fields.prompt);
    assertVideoReplicationPromptCoverage({ values: input.values, prompt, catalog: input.catalog });

    return {
        toolId: VIDEO_REPLICATION_TOOL_ID,
        prompt,
        references: [...input.referenceImages],
        videos: [input.videoRef],
        model: input.model.trim(),
        size: input.values.ratio,
        fields,
    };
}

/** 配置指纹：重试去重、判断「结果来自旧配置」都靠它。 */
export function videoReplicationFingerprint(values: VideoReplicationValues): string {
    return hashVideoReplicationParts(videoReplicationStableParts(values));
}

export type VideoReplicationRunPort = {
    run: (input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
    submit?: (input: BrowserToolInput, options?: SubmitOptions) => Promise<ToolTask>;
};

/** 真实 store 端口：动态 import，adapter 顶层不依赖 zustand store。 */
export async function createVideoReplicationRunPort(): Promise<VideoReplicationRunPort> {
    const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
    return {
        run: (input, options) => useToolTaskStore.getState().runTool(input, options),
        submit: (input, options) => useToolTaskStore.getState().submitTool(input, options),
    };
}

export type VideoReplicationRunOptions = {
    draftRevision?: number | null;
    signal?: AbortSignal;
    onUpdate?: (task: ToolTask) => void;
};

/** 首次提交：命中同指纹未完成任务则复用（dedupe 默认开启）。 */
export async function runVideoReplicationTask(
    args: { browserInput: BrowserToolInput; port: VideoReplicationRunPort } & VideoReplicationRunOptions,
): Promise<ToolTask> {
    return args.port.run(args.browserInput, {
        draftRevision: args.draftRevision ?? null,
        signal: args.signal,
        onUpdate: args.onUpdate,
    });
}

/** 同配置重试：dedupe:false，明确要求上游重新出片，不吞掉「再试一次」。 */
export async function retryVideoReplicationTask(
    args: { browserInput: BrowserToolInput; port: VideoReplicationRunPort } & VideoReplicationRunOptions,
): Promise<ToolTask> {
    return args.port.run(args.browserInput, {
        draftRevision: args.draftRevision ?? null,
        signal: args.signal,
        dedupe: false,
        onUpdate: args.onUpdate,
    });
}

/* ============================== 结果视图 ============================== */

export type VideoReplicationResultView = {
    status: "idle" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";
    label: string;
    videos: ToolTaskResultItem[];
    message: string;
    /** 结果是否来自旧配置：配置改了但没重新提交时提示「重新生成」。 */
    stale: boolean;
};

const STATUS_LABELS: Record<VideoReplicationResultView["status"], string> = {
    idle: "待生成",
    running: "生成中",
    succeeded: "已完成",
    failed: "失败",
    cancelled: "已取消",
    unknown: "状态未知",
};

export function videoReplicationResultView(input: {
    task?: ToolTask | null;
    values: VideoReplicationValues;
    /** 提交这次任务时的配置指纹（videoReplicationFingerprint 的返回值）。 */
    submittedFingerprint?: string | null;
}): VideoReplicationResultView {
    const task = input.task ?? null;
    if (!task) {
        return { status: "idle", label: STATUS_LABELS.idle, videos: [], message: "还没有提交过任务。", stale: false };
    }
    const status = (task.status ?? "unknown") as VideoReplicationResultView["status"];
    const videos = (task.result?.items ?? []).filter((item) => item.kind === "video");
    const stale =
        Boolean(input.submittedFingerprint) && input.submittedFingerprint !== videoReplicationFingerprint(input.values);
    const message =
        status === "failed"
            ? task.error?.message ?? "上游未返回失败原因。"
            : status === "unknown"
              ? "上游超时或状态未知：可先重试，不要当成失败结论。"
              : stale
                ? "配置已修改，当前结果来自旧配置，需要重新生成。"
                : "";
    return { status, label: STATUS_LABELS[status] ?? STATUS_LABELS.unknown, videos, message, stale };
}

/** 提交前的缺口提示：按顺序告诉用户「还差什么」，不靠按钮置灰让人猜。 */
export function videoReplicationMissingHints(input: {
    values: VideoReplicationValues;
    videoReady: boolean;
    referenceCount: number;
}): string[] {
    const hints: string[] = [];
    if (input.values.sourceMode === "link") {
        const link = parsePublicVideoLink(input.values.videoLink);
        if (!link.ok) hints.push(link.message);
    } else if (!input.videoReady) {
        hints.push("请上传参考视频（MP4/MOV，≤100MB）");
    }
    const clip = checkVideoReplicationClip(input.values);
    if (!clip.ok) hints.push(clip.message);
    if (input.referenceCount < 1) hints.push("请上传至少 1 张商品参考图");
    if (input.referenceCount > VIDEO_REPLICATION_REFERENCE_LIMITS.maxCount) {
        hints.push(`商品参考图最多 ${VIDEO_REPLICATION_REFERENCE_LIMITS.maxCount} 张`);
    }
    const prompt = input.values.prompt.trim();
    if (!prompt) hints.push("口播脚本为空：请填写或先用 AI 脚本分析");
    if (prompt.length > VIDEO_REPLICATION_PROMPT_LIMIT) hints.push(`口播脚本最多 ${VIDEO_REPLICATION_PROMPT_LIMIT} 字`);
    return hints;
}

/* ============================== 资产 → 请求入参 ============================== */

/** 参考视频资产 → ReferenceVideo（ReferenceVideo 只有 url：用资产会话内的 object URL）。 */
export function toVideoReplicationVideoRef(record: ToolAssetRecord): import("@/types/media").ReferenceVideo {
    if (!record.url) {
        throw new VideoReplicationAdapterError("no-video", "参考视频本地地址不可用，请重新上传");
    }
    return {
        id: record.id,
        name: record.name,
        type: record.mimeType || "video/mp4",
        url: record.url,
        storageKey: record.storageKey,
        bytes: record.bytes,
        width: record.width,
        height: record.height,
        durationMs: record.durationMs,
    };
}

/**
 * 链接模式：只接受「公网可访问的视频直链」。
 * 不需要服务端解析——上游 /videos 直接吃 `videos: [https://…]`（实测 2026-10-29 建任务并出片），
 * 所以能透传的就必须透传，不能透传的（blob/data/分享页）要在这里说清楚原因。
 */
export function parsePublicVideoLink(raw: string): { ok: true; url: string } | { ok: false; code: VideoReplicationErrorCode; message: string } {
    const url = (raw ?? "").trim();
    if (!url) return { ok: false, code: "link-empty", message: "请粘贴公网视频直链（以 http(s):// 开头，指向可直接下载的视频文件）" };
    if (/^(blob|data):/i.test(url)) {
        return { ok: false, code: "link-invalid", message: "这是浏览器本地地址，上游拿不到；请改用公网 http(s) 直链" };
    }
    if (!/^https?:\/\//i.test(url)) {
        return { ok: false, code: "link-invalid", message: "链接需以 http:// 或 https:// 开头（公网可访问）" };
    }
    if (/tiktok\.com|douyin\.com|kuaishou\.com/i.test(url)) {
        return { ok: false, code: "link-unresolved", message: "分享页链接需要服务端解析，当前未接入；请填视频文件直链（.mp4/.mov）" };
    }
    return { ok: true, url };
}

/** 公网直链 → ReferenceVideo（无本地字节，url 原样下发，由 video.ts 走 JSON videos[]）。 */
export function linkToVideoReplicationVideoRef(url: string): import("@/types/media").ReferenceVideo {
    const name = url.split("?")[0].split("/").pop() || "参考视频.mp4";
    const lower = name.toLowerCase();
    const type = lower.endsWith(".mov") ? "video/quicktime" : "video/mp4";
    return { id: `link-${name}`, name, type, url };
}

async function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () => reject(reader.error ?? new Error("读取本地图片失败"));
        reader.readAsDataURL(blob);
    });
}

/**
 * 商品参考图资产 → ReferenceImage（带 dataUrl，provider 才能拿到真实字节）。
 * 缺字节就报错，不拿空 dataUrl 蒙混过去。
 */
export async function loadVideoReplicationReferences(
    records: readonly ToolAssetRecord[],
): Promise<ReferenceImage[]> {
    const { readToolAssetBlob } = await import("@/services/api/tools/assets");
    const out: ReferenceImage[] = [];
    for (const record of records) {
        const blob = await readToolAssetBlob(record.storageKey);
        const dataUrl = blob ? await blobToDataUrl(blob) : "";
        out.push(
            toVideoReplicationReference({
                id: record.id,
                name: record.name,
                type: record.mimeType,
                url: record.url,
                storageKey: record.storageKey,
                dataUrl,
            }),
        );
    }
    return out;
}
