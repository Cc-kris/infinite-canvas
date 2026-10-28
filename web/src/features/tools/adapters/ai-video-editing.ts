/**
 * TASK-044 / AI_VIDEO_EDITING adapter —— 把「视频编辑」页状态变成一次真实视频请求。
 *
 * 事实边界：
 * - 真实请求经 `useToolTaskStore.runTool` → gateway → provider；本文件不伪造成功、不写死 mock 结果。
 * - registry 声明的 7 个字段一次性落齐（duration/outputNum/prompt/refImageUrls/sourceVideoDuration/
 *   sourceVideoUrl/videoType），`collectAiVideoEditingFieldGaps` 逐个核对，杜绝「静默丢参」。
 * - 源视频是真实文件：走 `videos: [ReferenceVideo]`（gateway 视频分支会把它编码给 provider）。
 * - 截取区间不进上游参数，故同时写进 prompt（模板段 + 用户可见段），页面只读展示模板段。
 */

import { clampVideoSeconds, inferVideoRatio } from "@/lib/media-size";
import type { ToolAssetRecord } from "@/services/api/tools/assets";
import type { BrowserToolInput, SubmitOptions, WaitOptions } from "@/services/api/tools/gateway";
import { describeToolExecution } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceVideo } from "@/types/media";

import {
    AI_VIDEO_EDITING_MAX_REFERENCES,
    AI_VIDEO_EDITING_MIN_CLIP_MS,
    AI_VIDEO_EDITING_OUTPUT_NUM,
    AI_VIDEO_EDITING_PROMPT_MAX,
    AI_VIDEO_EDITING_TOOL_ID,
    AI_VIDEO_EDITING_VIDEO_RULE,
    aiVideoEditingClipLabel,
    checkAiVideoEditingPrompt,
    composeAiVideoEditingProviderPrompt,
    findAiVideoEditingType,
    isAiVideoEditingSnapshotStale,
    resolveAiVideoEditingClip,
    type AiVideoEditingClipWindow,
    type AiVideoEditingSnapshot,
    type AiVideoEditingState,
} from "@/features/tools/registry/ai-video-editing";

export { AI_VIDEO_EDITING_TOOL_ID };

/* ============================== 错误 ============================== */

export type AiVideoEditingErrorCode =
    | "model-missing"
    | "no-source-video"
    | "source-video-too-large"
    | "source-video-too-short"
    | "source-video-mime"
    | "source-video-missing-file"
    | "clip-invalid"
    | "no-reference"
    | "too-many-references"
    | "invalid-type"
    | "prompt-empty"
    | "prompt-too-long"
    | "reference-unavailable"
    | "field-missing";

export class AiVideoEditingAdapterError extends Error {
    readonly code: AiVideoEditingErrorCode;
    constructor(code: AiVideoEditingErrorCode, message: string) {
        super(message);
        this.name = "AiVideoEditingAdapterError";
        this.code = code;
    }
}

/* ============================== 校验 ============================== */

export type AiVideoEditingInput = {
    state: AiVideoEditingState;
    model: string;
    /** 源视频资产（含时长/大小），未选时传 null。 */
    source: ToolAssetRecord | null;
    /** 参考图资产，顺序即提交顺序。 */
    references: readonly ToolAssetRecord[];
};

/** 从资产元数据解析源视频时长（毫秒）；未知返回 0，由调用方提示重新上传。 */
export function aiVideoEditingSourceDurationMs(source: ToolAssetRecord | null): number {
    if (!source) return 0;
    return Number.isFinite(source.durationMs) ? Math.max(0, Math.round(source.durationMs ?? 0)) : 0;
}

/** 当前页面口径的截取窗口（源视频时长 + 类型上限 + 最小时长）。 */
export function aiVideoEditingClipWindow(state: AiVideoEditingState, source: ToolAssetRecord | null): AiVideoEditingClipWindow {
    return resolveAiVideoEditingClip({
        sourceDurationMs: aiVideoEditingSourceDurationMs(source),
        clipStart: state.clipStart,
        clipDuration: state.clipDuration,
        type: findAiVideoEditingType(state.videoType),
        hasSource: Boolean(source),
    });
}

/**
 * D4：视频请求的视频参数必须跟随「截取区间 / 源视频画幅」，不能沿用全局 6 秒 / 1:1。
 * - seconds：截取时长向上取整（provider 只要整数秒，向下取整会截掉尾帧），再按 4–30 秒夹紧；
 * - ratio：由源视频真实宽高推导；宽高未知时返回 undefined（保持全局配置，不瞎猜）。
 * 像素尺寸 size 由 gateway 按 ratio + 当前分辨率档位推导，adapter 不重复算。
 */
export function aiVideoEditingVideoRequestParams(input: {
    window: AiVideoEditingClipWindow;
    source: ToolAssetRecord | null;
}): { seconds?: string; ratio?: string } {
    const { window, source } = input;
    const seconds = window.durationMs > 0 ? clampVideoSeconds(String(Math.ceil(window.durationMs / 1000))) : undefined;
    const width = source?.width ?? 0;
    const height = source?.height ?? 0;
    const ratio = width > 0 && height > 0 ? inferVideoRatio(`${width}x${height}`) : undefined;
    return {
        ...(seconds ? { seconds } : {}),
        ...(ratio && ratio !== "auto" ? { ratio } : {}),
    };
}

/**
 * D3：提交前核对本地库存里 Blob 是否还在。
 * 素材可能被「素材库清理 / 另一个标签页删除 / 浏览器回收」弄失效；记录还在时按钮不该仍可点。
 * 纯函数注入 readBlob，便于单测（adapter 不直接碰 IndexedDB）。
 */
export async function collectAiVideoEditingAssetIssues(
    records: readonly ToolAssetRecord[],
    readBlob: (storageKey: string) => Promise<Blob | null>,
): Promise<string[]> {
    const issues: string[] = [];
    const seen = new Set<string>();
    for (const record of records) {
        if (!record.storageKey || seen.has(record.storageKey)) continue;
        seen.add(record.storageKey);
        let blob: Blob | null = null;
        try {
            blob = await readBlob(record.storageKey);
        } catch {
            blob = null;
        }
        if (!blob || blob.size === 0) {
            issues.push(`${record.name}（${record.kind === "video" ? "源视频" : "参考图"}）本地数据已失效，请重新上传`);
        }
    }
    return issues;
}

/** 参考图/源视频由共享上传组件校验过尺寸比例；这里复核 adpater 侧必须自己保证的项。 */
export function assertAiVideoEditingInput(input: AiVideoEditingInput): AiVideoEditingClipWindow {
    const model = input.model.trim();
    if (!model) throw new AiVideoEditingAdapterError("model-missing", "请先选择视频模型");
    if (!findAiVideoEditingType(input.state.videoType)) {
        throw new AiVideoEditingAdapterError("invalid-type", "视频类型不在可选范围");
    }
    const source = input.source;
    if (!source) throw new AiVideoEditingAdapterError("no-source-video", "请先上传需要编辑的视频");
    if (!source.url) throw new AiVideoEditingAdapterError("source-video-missing-file", "源视频本地地址不可用，请重新上传");
    if (source.mimeType && !(AI_VIDEO_EDITING_VIDEO_RULE.mimeTypes as readonly string[]).includes(source.mimeType)) {
        throw new AiVideoEditingAdapterError("source-video-mime", "源视频只支持 MP4 / MOV");
    }
    if (source.bytes > AI_VIDEO_EDITING_VIDEO_RULE.maxBytes) {
        throw new AiVideoEditingAdapterError("source-video-too-large", "源视频需在 100M 以内");
    }
    const window = aiVideoEditingClipWindow(input.state, source);
    if (window.reason === "no-source" || window.sourceDurationMs < AI_VIDEO_EDITING_VIDEO_RULE.minSourceMs) {
        throw new AiVideoEditingAdapterError("source-video-too-short", "源视频时长不低于 4 秒");
    }
    if (window.durationMs < AI_VIDEO_EDITING_MIN_CLIP_MS) {
        throw new AiVideoEditingAdapterError("clip-invalid", `截取时长不能短于 ${Math.round(AI_VIDEO_EDITING_MIN_CLIP_MS / 1000)} 秒`);
    }
    if (window.durationMs > window.maxClipMs) {
        throw new AiVideoEditingAdapterError("clip-invalid", `截取时长最多 ${Math.round(window.maxClipMs / 1000)} 秒`);
    }
    if (input.references.length === 0) {
        throw new AiVideoEditingAdapterError("no-reference", "本地网关对本工具要求至少 1 张参考图");
    }
    if (input.references.length > AI_VIDEO_EDITING_MAX_REFERENCES) {
        throw new AiVideoEditingAdapterError("too-many-references", `参考图最多 ${AI_VIDEO_EDITING_MAX_REFERENCES} 张`);
    }
    const prompt = checkAiVideoEditingPrompt(input.state.prompt);
    if (prompt.empty) throw new AiVideoEditingAdapterError("prompt-empty", "请填写编辑需求描述");
    if (prompt.tooLong) throw new AiVideoEditingAdapterError("prompt-too-long", `编辑需求最多 ${AI_VIDEO_EDITING_PROMPT_MAX} 字`);
    return window;
}

/* ============================== 资产 → 请求入参 ============================== */

/** 源视频资产 → ReferenceVideo（provider 真实收到这段视频）。 */
export function toAiVideoEditingVideoRef(source: ToolAssetRecord): ReferenceVideo {
    if (!source.url) throw new AiVideoEditingAdapterError("source-video-missing-file", "源视频本地地址不可用，请重新上传");
    return {
        id: source.id,
        name: source.name,
        type: source.mimeType || "video/mp4",
        url: source.url,
        storageKey: source.storageKey,
        bytes: source.bytes,
        width: source.width,
        height: source.height,
        durationMs: source.durationMs,
    };
}

/** 参考图资产 → ReferenceImage（dataUrl 由调用方从本地存储读出，adapter 不直接碰 IndexedDB）。 */
export function toAiVideoEditingReference(input: {
    record: ToolAssetRecord;
    dataUrl: string;
}): ReferenceImage {
    if (!input.dataUrl) throw new AiVideoEditingAdapterError("reference-unavailable", "参考图本地数据不可用，请重新上传");
    return {
        id: input.record.id,
        name: input.record.name,
        type: input.record.mimeType || "image/png",
        dataUrl: input.dataUrl,
        url: input.record.url,
        storageKey: input.record.storageKey,
    };
}

/* ============================== 7 个字段 ============================== */

export type AiVideoEditingFieldsInput = AiVideoEditingInput & { window: AiVideoEditingClipWindow };

/** registry 声明的 7 个字段一次性落齐，避免「静默丢参」（TC-052 断言）。 */
export function buildAiVideoEditingFields(input: AiVideoEditingFieldsInput): Record<string, unknown> {
    const { state, model, source, references, window } = input;
    const hiddenPrompt = composeAiVideoEditingProviderPrompt({
        state,
        model,
        window,
        referenceCount: references.length,
    });
    return {
        duration: window.durationSec,
        outputNum: AI_VIDEO_EDITING_OUTPUT_NUM,
        prompt: state.prompt,
        refImageUrls: references.map((record) => record.url),
        sourceVideoDuration: Math.round(window.sourceDurationMs / 1000),
        sourceVideoUrl: source?.url ?? "",
        videoType: model.trim(),
    };
}

/** 审计用：registry 字段与本次 fields 的键差集（空数组 = 没丢参）。 */
export function collectAiVideoEditingFieldGaps(fields: Record<string, unknown>): string[] {
    const declared = describeToolExecution(AI_VIDEO_EDITING_TOOL_ID).fields;
    return [...declared].filter((key) => !(key in fields));
}

/** 本地网关对该工具是否强制参考图/源视频（运行时读取，不写死）。 */
export function aiVideoEditingGatewayRequires(): { references: boolean; video: boolean } {
    try {
        const descriptor = describeToolExecution(AI_VIDEO_EDITING_TOOL_ID);
        return { references: descriptor.requiresReferences, video: descriptor.requiresVideo };
    } catch {
        return { references: true, video: true };
    }
}

/* ============================== 真实请求 ============================== */

export type AiVideoEditingBrowserInputArgs = AiVideoEditingInput & {
    referenceImages: readonly ReferenceImage[];
};

/** 组装 gateway 入参：prompt 用「模板段 + 可见需求」，videos 是源视频，references 是参考图。 */
export function buildAiVideoEditingBrowserInput(input: AiVideoEditingBrowserInputArgs): BrowserToolInput {
    const window = assertAiVideoEditingInput(input);
    if (input.referenceImages.length !== input.references.length) {
        throw new AiVideoEditingAdapterError("reference-unavailable", "参考图与本地文件数量不一致，请重新上传后重试");
    }
    const fields = buildAiVideoEditingFields({ ...input, window });
    const gaps = collectAiVideoEditingFieldGaps(fields);
    if (gaps.length) throw new AiVideoEditingAdapterError("field-missing", `缺少必要字段：${gaps.join(", ")}`);
    /* D4：让请求的 seconds/size/ratio 跟随截取区间与源视频画幅，而不是全局默认 6 秒 / 1:1。 */
    const videoRequest = aiVideoEditingVideoRequestParams({ window, source: input.source });
    return {
        toolId: AI_VIDEO_EDITING_TOOL_ID,
        prompt: composeAiVideoEditingProviderPrompt({
            state: input.state,
            model: input.model,
            window,
            referenceCount: input.references.length,
        }),
        references: [...input.referenceImages],
        videos: [toAiVideoEditingVideoRef(input.source as ToolAssetRecord)],
        model: input.model.trim(),
        fields,
        ...(videoRequest.seconds ? { videoSeconds: videoRequest.seconds } : {}),
        ...(videoRequest.ratio ? { videoRatio: videoRequest.ratio } : {}),
    };
}

export type AiVideoEditingGatewayLike = {
    run: (input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
    submit?: (input: BrowserToolInput, options?: SubmitOptions) => Promise<ToolTask>;
};

/** 真实 store 端口：动态 import，避免 adapter 顶层依赖 zustand store。 */
export async function createAiVideoEditingRunPort(): Promise<AiVideoEditingGatewayLike> {
    const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
    return {
        run: (input, options) => useToolTaskStore.getState().runTool(input, options),
        submit: (input, options) => useToolTaskStore.getState().submitTool(input, options),
    };
}

export async function runAiVideoEditingTask(input: {
    browserInput: BrowserToolInput;
    port: AiVideoEditingGatewayLike;
    draftRevision?: number | null;
    signal?: AbortSignal;
}): Promise<ToolTask> {
    return input.port.run(input.browserInput, {
        draftRevision: input.draftRevision ?? null,
        signal: input.signal,
    });
}

/** 同一快照重试：不换输入，只关掉去重，确保真的再发一次。 */
export async function retryAiVideoEditingTask(input: {
    snapshot: AiVideoEditingSnapshot;
    browserInput: BrowserToolInput;
    port: AiVideoEditingGatewayLike;
    signal?: AbortSignal;
}): Promise<ToolTask> {
    return input.port.run(input.browserInput, {
        draftRevision: input.snapshot.draftRevision,
        signal: input.signal,
        dedupe: false,
    });
}

/* ============================== 结果视图 ============================== */

export type AiVideoEditingResultState = "empty" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";

export type AiVideoEditingResultView = {
    state: AiVideoEditingResultState;
    videos: ToolTaskResultItem[];
    message: string;
    stale: boolean;
    snapshot: AiVideoEditingSnapshot | null;
};

export function aiVideoEditingResultView(input: {
    task?: ToolTask | null;
    snapshot?: AiVideoEditingSnapshot | null;
    current?: AiVideoEditingSnapshot | null;
}): AiVideoEditingResultView {
    const task = input.task ?? null;
    const snapshot = input.snapshot ?? null;
    const stale = isAiVideoEditingSnapshotStale(snapshot, input.current ?? null);
    const videos = (task?.result?.items ?? []).filter((item) => item.kind === "video");
    if (!task) return { state: "empty", videos: [], message: "编辑结果会出现在这里", stale: false, snapshot: null };
    switch (task.status) {
        case "submitting":
        case "running":
            return { state: "running", videos: [], message: "上游编辑中，完成后自动展示", stale, snapshot };
        case "succeeded":
            return videos.length
                ? { state: "succeeded", videos, message: stale ? "结果来自旧版本配置" : "编辑完成", stale, snapshot }
                : { state: "failed", videos: [], message: "任务成功但没有可播放视频", stale, snapshot };
        case "failed":
            return { state: "failed", videos: [], message: task.error?.message || "编辑失败，可保留配置重试", stale, snapshot };
        case "cancelled":
            return { state: "cancelled", videos: [], message: "已取消；上游可能仍在计费", stale, snapshot };
        case "unknown":
            return { state: "unknown", videos: [], message: "状态未知：请先查询任务再决定是否重试", stale, snapshot };
        default:
            return { state: "empty", videos: [], message: "编辑结果会出现在这里", stale: false, snapshot };
    }
}

export function aiVideoEditingStatusText(state: AiVideoEditingResultState): string {
    switch (state) {
        case "running":
            return "编辑中";
        case "succeeded":
            return "已完成";
        case "failed":
            return "失败";
        case "cancelled":
            return "已取消";
        case "unknown":
            return "状态未知";
        default:
            return "待生成";
    }
}

/** 结果卡片的元信息行：只报真实时长/条数，不复刻原站算力数字。 */
export function aiVideoEditingResultMeta(view: AiVideoEditingResultView): string {
    if (!view.snapshot) return "尚未提交";
    const parts = [`${view.snapshot.durationSec} 秒`, `参考图 ${view.snapshot.referenceAssetIds.length} 张`];
    if (view.snapshot.clipStartSec > 0) parts.push(`从 ${view.snapshot.clipStartSec} 秒起截取`);
    return parts.join(" · ");
}

/** 供页面展示的截取区间文案（在 adapter 侧转一次，UI 不再自己算）。 */
export function aiVideoEditingClipText(input: { state: AiVideoEditingState; source: ToolAssetRecord | null }): string {
    return aiVideoEditingClipLabel(aiVideoEditingClipWindow(input.state, input.source));
}

export { aiVideoEditingClipLabel, isAiVideoEditingSnapshotStale };
export type { AiVideoEditingSnapshot };
