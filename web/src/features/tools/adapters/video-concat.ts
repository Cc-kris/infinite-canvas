/**
 * VIDEO_CONCAT adapter —— 把「视频拼接」页状态变成一次真实视频请求。
 *
 * 事实边界（都已在代码里核对，不靠猜）：
 * 1. 请求经 `useToolTaskStore.runTool` → gateway → provider；本文件不伪造成功、不写死结果。
 * 2. gateway 的 `TOOL_ADAPTER_TABLE.VIDEO_CONCAT` 要求 references + videos + prompt 三样齐全，
 *    因此封面图会同时作为 `references`（唯一参考图）和 `videoCoverUrl`/`imageUrl` 字段。
 * 3. **多段视频到底能不能到上游，取决于通道实现**（`services/api/video.ts`）：
 *    - openai：`videos.forEach(...append("video[]"))` → 多段真实上传；
 *    - gemini：`if (videos[0]) instance.video = ...` → **只提交第 1 段，其余静默丢弃**；
 *    - http（自定义协议）：`createHttpVideoTask` 的 body 模板里**根本没有 videos** → 全部丢弃；
 *    - plugin（模型脚本）：videos 会传给脚本，但脚本是否消费无法取证 → 记为 unverified。
 *    所以本文件按通道给出真实能力证据，不支持的通道直接阻断提交，绝不“点了就算成功”。
 * 4. 视频服务只吃 prompt，因此片段顺序 / 裁剪区间 / 比例 / 时长 / 封面全部写进 prompt。
 */

import type { ReferenceImage } from "@/types/image";
import type { ReferenceVideo } from "@/types/media";
import type { BrowserToolInput } from "@/services/api/tools/gateway";
import type { ToolTask } from "@/services/api/tools/task-machine";

import {
    VIDEO_CONCAT_CAPABILITY_REQUIREMENTS,
    VIDEO_CONCAT_EDIT_TYPE,
    VIDEO_CONCAT_MAX_CLIPS,
    VIDEO_CONCAT_MIN_CLIPS,
    VIDEO_CONCAT_TOOL_ID,
    buildVideoConcatPrompt,
    checkVideoConcatClipSource,
    effectiveVideoConcatSeconds,
    formatVideoConcatDuration,
    normalizeVideoConcatClip,
    validateVideoConcatState,
    videoConcatClipMs,
    videoConcatTotalMs,
    type VideoConcatClip,
    type VideoConcatCover,
    type VideoConcatIssue,
    type VideoConcatState,
} from "@/features/tools/registry/video-concat";

export const VIDEO_CONCAT_FIELD_KEYS = [
    "editType",
    "imageFormat",
    "imageHeight",
    "imageSize",
    "imageUrl",
    "imageWidth",
    "videoCoverUrl",
    "videoList",
    "videoRatio",
    "videoTime",
] as const;

export type VideoConcatFieldKey = (typeof VIDEO_CONCAT_FIELD_KEYS)[number];

/* ============================== 错误 ============================== */

export type VideoConcatAdapterErrorCode =
    | "no-clips"
    | "too-few-clips"
    | "too-many-clips"
    | "clip-mime"
    | "clip-too-large"
    | "clip-too-short"
    | "clip-too-long"
    | "clip-duration-unknown"
    | "clip-trim-invalid"
    | "duplicate-clip"
    | "cover-missing"
    | "cover-invalid"
    | "ratio-invalid"
    | "model-missing"
    | "summary-missing"
    | "channel-no-video-input"
    | "channel-single-video-only"
    | "channel-unverified";

export class VideoConcatAdapterError extends Error {
    readonly code: VideoConcatAdapterErrorCode;

    constructor(code: VideoConcatAdapterErrorCode, message: string) {
        super(message);
        this.name = "VideoConcatAdapterError";
        this.code = code;
    }
}

/** 上传前逐文件校验：返回 null 表示可接受；否则给出真实原因码。 */
export function checkVideoConcatUpload(source: {
    name?: string;
    mimeType?: string;
    bytes?: number;
    durationMs?: number;
}): { code: VideoConcatAdapterErrorCode; message: string } | null {
    const issue = checkVideoConcatClipSource(source);
    return issue ? { code: issue.code, message: issue.message } : null;
}

/* ============================ 能力检测 ============================ */

export type VideoConcatChannel = "openai" | "gemini" | "http" | "plugin" | "unknown";

export type VideoConcatCapabilityKey = (typeof VIDEO_CONCAT_CAPABILITY_REQUIREMENTS)[number]["key"];

export type VideoConcatProviderCapability = {
    channel: VideoConcatChannel;
    model: string;
    /** 一次请求最多能真实上传几段参考视频；null = 无法取证 */
    maxInputVideos: number | null;
    /** 逐项证据：supported / unsupported / unknown，缺省一律 unknown（绝不默认支持） */
    evidence: Partial<Record<VideoConcatCapabilityKey, "supported" | "unsupported" | "unknown">>;
    /** 真实阻断原因（人类可读，展示在提交按钮上方） */
    blockers: string[];
    /** 非阻断提示（例如“多段依赖中转是否接受多段 video[]”） */
    notes: string[];
    blocked: boolean;
};

/**
 * 依据「当前视频模型 + 通道实现」给出能力证据。
 * 证据来自 services/api/video.ts 的真实分支行为，不是产品文案猜测。
 */
export function resolveVideoConcatProviderCapability(input: {
    model: string;
    apiFormat?: string;
    /** 模型是否挂了插件脚本（runModelPlugin 通道） */
    hasPluginScript?: boolean;
}): VideoConcatProviderCapability {
    const model = (input.model ?? "").trim();
    const notes: string[] = [];
    const blockers: string[] = [];
    const evidence: VideoConcatProviderCapability["evidence"] = {};

    if (!model) {
        return {
            channel: "unknown",
            model,
            maxInputVideos: null,
            evidence: {},
            blockers: ["未选择视频模型"],
            notes,
            blocked: true,
        };
    }

    const apiFormat = (input.apiFormat ?? "").trim().toLowerCase();
    const channel: VideoConcatChannel = input.hasPluginScript
        ? "plugin"
        : apiFormat === "openai"
            ? "openai"
            : apiFormat === "gemini"
                ? "gemini"
                : apiFormat === "http"
                    ? "http"
                    : "unknown";

    switch (channel) {
        case "openai":
            evidence.referenceVideo = "supported";
            evidence.multiReference = "supported";
            evidence.aspectRatio = "supported";
            evidence.duration = "supported";
            notes.push("OpenAI /videos 通道会把每段视频作为 video[] 上传；多段是否被上游采用仍取决于中转实现。");
            return { channel, model, maxInputVideos: null, evidence, blockers, notes, blocked: false };

        case "gemini": {
            evidence.referenceVideo = "supported";
            evidence.multiReference = "unsupported";
            evidence.aspectRatio = "supported";
            evidence.duration = "supported";
            blockers.push("Gemini 通道只提交第 1 段参考视频（videos[0]），其余片段会被静默丢弃，不能用于拼接。");
            return { channel, model, maxInputVideos: 1, evidence, blockers, notes, blocked: true };
        }

        case "http":
            evidence.referenceVideo = "unsupported";
            evidence.multiReference = "unsupported";
            evidence.aspectRatio = "unknown";
            evidence.duration = "unknown";
            blockers.push("自定义 HTTP 协议的提交模板里没有 videos 字段，参考视频不会被发送，拼接无法完成。");
            return { channel, model, maxInputVideos: 0, evidence, blockers, notes, blocked: true };

        case "plugin":
            evidence.referenceVideo = "unknown";
            evidence.multiReference = "unknown";
            evidence.aspectRatio = "unknown";
            evidence.duration = "unknown";
            blockers.push("当前模型走插件脚本通道，脚本是否消费多段视频没有证据，按不支持处理。");
            return { channel, model, maxInputVideos: null, evidence, blockers, notes, blocked: true };

        default:
            evidence.referenceVideo = "unknown";
            evidence.multiReference = "unknown";
            blockers.push(`未知通道（apiFormat=${apiFormat || "空"}），无法确认多段视频会被发送。`);
            return { channel, model, maxInputVideos: null, evidence, blockers, notes, blocked: true };
    }
}

/* ============================== 字段 ============================== */

function coverFormat(cover: VideoConcatCover | null): string {
    const mime = (cover?.mimeType ?? "").toLowerCase();
    if (mime.includes("jpeg") || mime.includes("jpg")) return "jpeg";
    if (mime.includes("webp")) return "webp";
    return "png";
}

/** 片段 → 字段值：只放真实读到的时长与裁剪区间，未知就写 0 并在校验层阻断。 */
export function buildVideoConcatVideoList(clips: readonly VideoConcatClip[]) {
    return clips.map((clip, index) => ({
        index: index + 1,
        id: clip.id,
        assetId: clip.assetId,
        name: clip.name,
        url: clip.url,
        mimeType: clip.mimeType,
        bytes: clip.bytes,
        durationMs: clip.durationMs,
        startMs: clip.startMs,
        endMs: clip.endMs,
        seconds: Math.round(videoConcatClipMs(clip) / 100) / 10,
    }));
}

/**
 * registry 声明的 10 个字段一次性落齐。
 * 封面图既做 `videoCoverUrl`（封面）也做 `imageUrl`（唯一参考图，gateway 要求 references 非空）。
 */
export function buildVideoConcatFields(input: {
    state: VideoConcatState;
    model: string;
    prompt?: string;
}): Record<string, unknown> {
    const { state } = input;
    const cover = state.cover;
    const videoList = buildVideoConcatVideoList(state.clips);
    return {
        editType: VIDEO_CONCAT_EDIT_TYPE,
        imageFormat: coverFormat(cover),
        imageHeight: cover?.height ?? 0,
        imageSize: cover?.bytes ?? 0,
        imageUrl: cover?.url ?? "",
        imageWidth: cover?.width ?? 0,
        videoCoverUrl: cover?.url ?? "",
        videoList,
        videoRatio: state.videoRatio,
        videoTime: effectiveVideoConcatSeconds({ videoTime: state.videoTime, clips: state.clips }),
    };
}

/** 逐个核对 registry 字段（杜绝“静默丢参”）：返回缺失字段列表。 */
export function auditVideoConcatFields(fields: Record<string, unknown>): VideoConcatFieldKey[] {
    return VIDEO_CONCAT_FIELD_KEYS.filter((key) => {
        const value = fields[key];
        if (value === undefined || value === null) return true;
        if (typeof value === "string") return value.trim().length === 0;
        if (Array.isArray(value)) return value.length === 0;
        return false;
    });
}

/* ============================ 请求素材 ============================ */

export function toVideoConcatReferenceVideo(clip: VideoConcatClip): ReferenceVideo {
    return {
        id: clip.assetId,
        name: clip.name,
        type: clip.mimeType || "video/mp4",
        url: clip.url,
        ...(clip.storageKey ? { storageKey: clip.storageKey } : {}),
        ...(clip.bytes ? { bytes: clip.bytes } : {}),
        ...(clip.width ? { width: clip.width } : {}),
        ...(clip.height ? { height: clip.height } : {}),
        ...(clip.durationMs ? { durationMs: clip.durationMs } : {}),
    };
}

/** 封面 → 唯一参考图（gateway 要求 references 非空，provider 侧也用它当封面参考）。 */
export function toVideoConcatReferenceImage(cover: VideoConcatCover): ReferenceImage {
    return {
        id: cover.clipId ? `cover-${cover.clipId}-${cover.frameMs ?? 0}` : `cover-${cover.name}`,
        name: cover.name,
        type: cover.mimeType || "image/png",
        dataUrl: cover.dataUrl ?? (cover.url.startsWith("data:") ? cover.url : ""),
        ...(cover.url.startsWith("data:") ? {} : { url: cover.url }),
        ...(cover.storageKey ? { storageKey: cover.storageKey } : {}),
    };
}

/* ============================== 断言 ============================== */

export type VideoConcatAssertionInput = {
    state: VideoConcatState;
    model: string;
    capability?: VideoConcatProviderCapability;
};

/** 提交前断言：页面校验 + 通道能力，任一不满足直接抛错（带 code，UI 原样展示）。 */
export function assertVideoConcatInput(input: VideoConcatAssertionInput): void {
    const issues = validateVideoConcatState({ state: input.state, model: input.model });
    const clipIssues = issues.filter((issue) => issue.code !== "model-missing");
    if (clipIssues.length > 0) {
        throw new VideoConcatAdapterError(clipIssues[0].code as VideoConcatAdapterErrorCode, clipIssues[0].message);
    }
    if (issues.some((issue) => issue.code === "model-missing")) {
        throw new VideoConcatAdapterError("model-missing", "未选择视频模型");
    }
    const capability = input.capability ?? resolveVideoConcatProviderCapability({ model: input.model });
    if (capability.blocked) {
        const code: VideoConcatAdapterErrorCode =
            capability.channel === "gemini"
                ? "channel-single-video-only"
                : capability.channel === "http"
                    ? "channel-no-video-input"
                    : "channel-unverified";
        throw new VideoConcatAdapterError(code, capability.blockers[0] ?? "当前通道没有多段视频输入的证据");
    }
}

/** 组装 gateway 入参：prompt（含全部页内事实）+ references（封面）+ videos（按顺序的片段）。 */
export function buildVideoConcatBrowserInput(input: {
    state: VideoConcatState;
    model: string;
}): BrowserToolInput {
    const { state, model } = input;
    const fields = buildVideoConcatFields({ state, model });
    const missing = auditVideoConcatFields(fields);
    if (missing.length > 0) {
        throw new VideoConcatAdapterError("summary-missing", `提交字段不完整：${missing.join(" / ")}`);
    }
    const cover = state.cover;
    if (!cover) throw new VideoConcatAdapterError("cover-missing", "还没有封面：请上传封面图或从片段抓取一帧");

    const coverNote =
        cover.source === "frame"
            ? `封面取「${cover.name}」第 ${formatVideoConcatDuration(cover.frameMs ?? 0)} 帧`
            : `封面使用上传图「${cover.name}」`;
    const prompt = buildVideoConcatPrompt({ state, coverNote });
    const seconds = effectiveVideoConcatSeconds({ videoTime: state.videoTime, clips: state.clips });

    return {
        toolId: VIDEO_CONCAT_TOOL_ID,
        prompt,
        model,
        references: [toVideoConcatReferenceImage(cover)],
        videos: state.clips.map(toVideoConcatReferenceVideo),
        fields,
        count: 1,
        /* 页内画幅与时长同样必须进请求：此前只写进 prompt，请求沿用全局 1:1 / 6 秒。 */
        videoRatio: state.videoRatio,
        ...(seconds > 0 ? { videoSeconds: String(seconds) } : {}),
    };
}

/* ============================ 失败映射 ============================ */

export type VideoConcatFailure = {
    code: string;
    message: string;
    /** 是否值得再查询/再等待（而不是重新提交） */
    retryable: boolean;
    /** 用户下一步该做什么 */
    nextStep: string;
};

const FAILURE_TEXT: Record<string, { message: string; retryable: boolean; nextStep: string }> = {
    "no-clips": { message: "还没有片段", retryable: false, nextStep: "先上传至少 2 段视频" },
    "too-few-clips": { message: "片段不足 2 段", retryable: false, nextStep: "再添加 1 段以上视频" },
    "too-many-clips": { message: "片段数量超出上限", retryable: false, nextStep: "先精简片段数量再提交" },
    "clip-mime": { message: "片段格式不支持", retryable: false, nextStep: "换成 MP4 / MOV / WebM" },
    "clip-too-large": { message: "片段文件过大", retryable: false, nextStep: "压缩或剪短后再上传" },
    "clip-too-short": { message: "片段过短", retryable: false, nextStep: "换一段超过 0.5 秒的视频" },
    "clip-too-long": { message: "片段过长", retryable: false, nextStep: "先分割成 5 分钟以内的片段" },
    "clip-duration-unknown": { message: "读不到片段真实时长", retryable: false, nextStep: "重新上传该片段（浏览器无法解析时不提交）" },
    "clip-trim-invalid": { message: "裁剪区间非法", retryable: false, nextStep: "把裁剪长度调到 0.3 秒以上" },
    "duplicate-clip": { message: "同一段视频被添加两次", retryable: false, nextStep: "删除重复片段" },
    "cover-missing": { message: "缺少封面", retryable: false, nextStep: "上传封面图或从片段抓取一帧" },
    "cover-invalid": { message: "封面地址无效", retryable: false, nextStep: "重新上传封面图" },
    "ratio-invalid": { message: "输出比例不支持", retryable: false, nextStep: "重新选择一个比例" },
    "model-missing": { message: "未选择视频模型", retryable: false, nextStep: "在生成设置里选择视频模型" },
    "summary-missing": { message: "提交字段不完整", retryable: false, nextStep: "刷新页面后重新添加片段与封面" },
    "channel-no-video-input": { message: "当前通道不发送参考视频", retryable: false, nextStep: "切换到支持视频输入的模型/通道（如 OpenAI /videos）" },
    "channel-single-video-only": { message: "当前通道只接受 1 段视频", retryable: false, nextStep: "换成支持多段视频的通道，或先本地合成再上传" },
    "channel-unverified": { message: "当前通道的多段视频能力未取证", retryable: false, nextStep: "换用已知支持多段视频的通道" },
    "adapter-not-executable": { message: "该工具无法在本地网关执行", retryable: false, nextStep: "确认工具路由与网关能力配置" },
    "prompt-required": { message: "缺少提示词", retryable: false, nextStep: "补齐封面与片段后重试（提示词由页面自动生成）" },
    "references-required": { message: "缺少封面参考图", retryable: false, nextStep: "重新上传封面或抓取一帧" },
    "video-required": { message: "没有可提交的视频片段", retryable: false, nextStep: "重新添加片段（资产可能已失效）" },
    "unknown-tool": { message: "网关不认识 VIDEO_CONCAT", retryable: false, nextStep: "确认 registry 与网关版本一致" },
    "empty-video-result": { message: "上游报告完成但没有返回可播放视频", retryable: true, nextStep: "先查询任务状态，确认无产物后再重提交" },
    "missing-upstream-id": { message: "上游没有返回任务 id", retryable: true, nextStep: "稍后重试；若重复出现检查通道协议" },
    "no-query-api": { message: "该通道没有查询接口，结果未知", retryable: true, nextStep: "到上游后台核对后再决定是否重提交" },
    "provider-rejected": { message: "上游拒绝了本次请求", retryable: false, nextStep: "按提示修正输入（多为参数或权限问题）" },
    "provider-failed": { message: "上游报告任务失败", retryable: false, nextStep: "查看上游错误后再调整输入" },
    "provider-busy": { message: "上游繁忙", retryable: true, nextStep: "稍后重试，不要重复提交" },
    "timeout-or-network": { message: "网络或网关超时", retryable: true, nextStep: "先查询任务状态，避免重复计费" },
    "unclassified": { message: "未分类错误", retryable: true, nextStep: "先查询任务状态" },
    "task-timeout": { message: "等待超出预算，上游状态未知（不等于失败）", retryable: true, nextStep: "到上游核对任务状态" },
    "cancelled-by-user": { message: "已取消", retryable: false, nextStep: "如需继续请重新提交" },
};

/** 上游/网关错误码 → 用户可执行的说明；未知码保留原文，绝不改写成“成功”。 */
export function mapVideoConcatFailure(input: { code?: string; message?: string; retryable?: boolean }): VideoConcatFailure {
    const code = (input.code ?? "").trim() || "unclassified";
    const known = FAILURE_TEXT[code];
    const raw = (input.message ?? "").trim();
    if (known) {
        return {
            code,
            message: raw ? `${known.message}：${raw}` : known.message,
            retryable: input.retryable ?? known.retryable,
            nextStep: known.nextStep,
        };
    }
    return {
        code,
        message: raw || `上游返回了未登记的错误码 ${code}`,
        retryable: input.retryable ?? true,
        nextStep: "先查询任务状态，确认无产物后再决定是否重提交",
    };
}

export function mapVideoConcatIssues(issues: readonly VideoConcatIssue[]): VideoConcatFailure[] {
    return issues.map((issue) => ({
        ...mapVideoConcatFailure({ code: issue.code, message: issue.message, retryable: false }),
        code: issue.code,
    }));
}

/* ============================ 结果视图 ============================ */

export type VideoConcatResultView = {
    statusText: string;
    failure: VideoConcatFailure | null;
    videoUrl: string | null;
    itemCount: number;
    totalMs: number;
};

export function videoConcatResultView(task: ToolTask | null | undefined): VideoConcatResultView {
    if (!task) {
        return { statusText: "尚未提交", failure: null, videoUrl: null, itemCount: 0, totalMs: 0 };
    }
    const items = task.result?.items ?? [];
    const video = items.find((item) => item.kind === "video" && (item.url || item.blob || item.dataUrl));
    const failure = task.error ? mapVideoConcatFailure({ code: task.error.code, message: task.error.message, retryable: task.error.retryable }) : null;
    const statusText =
        task.status === "succeeded"
            ? video
                ? "已完成"
                : "上游报告完成但没有返回视频"
            : task.status === "failed"
                ? failure?.message ?? "失败"
                : task.status === "cancelled"
                    ? "已取消"
                    : task.status === "unknown"
                        ? "状态未知（上游可能仍在跑）"
                        : "生成中";
    return {
        statusText,
        failure,
        videoUrl: video?.url ?? video?.dataUrl ?? null,
        itemCount: items.length,
        totalMs: task.status === "succeeded" && task.finishedAt ? Math.max(0, task.finishedAt - task.createdAt) : 0,
    };
}

/** 提交按钮上方的“为什么点不了”：把校验问题与通道阻断合并成一句话。 */
export function videoConcatBlockedReason(input: {
    issues: readonly VideoConcatIssue[];
    capability: VideoConcatProviderCapability;
}): string {
    if (input.capability.blocked) return input.capability.blockers[0] ?? "当前通道不可用";
    if (input.issues.length > 0) return input.issues[0].message;
    return "";
}

/** 依据上传记录构造片段：时长取真实 metadata，读不到就是 0（由校验层阻断）。 */
export function toVideoConcatClip(record: {
    id: string;
    name: string;
    url: string;
    mimeType: string;
    bytes: number;
    width?: number;
    height?: number;
    durationMs?: number;
}): VideoConcatClip {
    return normalizeVideoConcatClip({
        id: record.id,
        assetId: record.id,
        name: record.name,
        url: record.url,
        mimeType: record.mimeType,
        bytes: record.bytes,
        width: record.width,
        height: record.height,
        durationMs: record.durationMs ?? 0,
    });
}

export function videoConcatSummary(state: VideoConcatState): string {
    const total = videoConcatTotalMs(state.clips);
    const seconds = effectiveVideoConcatSeconds({ videoTime: state.videoTime, clips: state.clips });
    return `${Math.min(state.clips.length, VIDEO_CONCAT_MAX_CLIPS)} 段 / 最少 ${VIDEO_CONCAT_MIN_CLIPS} 段 · 素材 ${formatVideoConcatDuration(total)} → 输出 ${seconds || 0}s`;
}

/* ============================ 提交端口 ============================ */

/** 只暴露真正需要的两个方法，方便测试注入假端口（假端口只验证调用协议，不伪造成功结果）。 */
export type VideoConcatGatewayPort = {
    run: (input: BrowserToolInput, options?: { draftRevision?: number | null; signal?: AbortSignal }) => Promise<ToolTask>;
    submit: (input: BrowserToolInput, options?: { draftRevision?: number | null; signal?: AbortSignal }) => Promise<ToolTask>;
};

/** 真实端口：走 useToolTaskStore → gateway（与页面其它工具同一条链路）。 */
export async function createVideoConcatRunPort(): Promise<VideoConcatGatewayPort> {
    const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
    return {
        run: (input, options) => useToolTaskStore.getState().runTool(input, options),
        submit: (input, options) => useToolTaskStore.getState().submitTool(input, options),
    };
}

export async function runVideoConcatTask(input: {
    browserInput: BrowserToolInput;
    port: VideoConcatGatewayPort;
    draftRevision?: number | null;
    signal?: AbortSignal;
}): Promise<ToolTask> {
    return input.port.run(input.browserInput, { draftRevision: input.draftRevision ?? null, signal: input.signal });
}

/**
 * 重试：只有“结果未知”的任务才值得再查；这里重新提交同一份输入（片段 URL/storageKey 都在 state 里），
 * 不复制 sale-video 的“参考图重载”，因为片段本身就是持久化资产。
 */
export async function retryVideoConcatTask(input: {
    browserInput: BrowserToolInput;
    port: VideoConcatGatewayPort;
    draftRevision?: number | null;
    signal?: AbortSignal;
}): Promise<ToolTask> {
    return input.port.submit(input.browserInput, { draftRevision: input.draftRevision ?? null, signal: input.signal });
}
