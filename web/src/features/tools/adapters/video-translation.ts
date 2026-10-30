import type { ToolAssetRecord } from "@/services/api/tools/assets";
import type { BrowserToolInput, SubmitOptions, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
import type { ReferenceVideo } from "@/types/media";

import {
    VIDEO_TRANSLATION_FIELD_ORDER,
    VIDEO_TRANSLATION_OUTPUT_OPTIONS,
    VIDEO_TRANSLATION_SOURCE_RULE,
    VIDEO_TRANSLATION_SUPPORTED_OUTPUT,
    VIDEO_TRANSLATION_TOOL_ID,
    createVideoTranslationSnapshot,
    createVideoTranslationValues,
    normalizeVideoTranslationOutput,
    normalizeVideoTranslationOutputRatio,
    planVideoTranslationOutput,
    resolveVideoTranslationCatalog,
    videoTranslationLanguageLabel,
    videoTranslationOptionLabel,
    videoTranslationSourceOptions,
    videoTranslationTargetOptions,
    type VideoTranslationCatalog,
    type VideoTranslationOutputPlan,
    type VideoTranslationSnapshot,
    type VideoTranslationValues,
} from "../registry/video-translation";

/**
 * TASK-045：VIDEO_TRANSLATION 的真实请求层。
 *
 * 三条硬边界（都不许“看起来能用”）：
 *  1. 原视频必须真的过得了页面规则（MP4/MOV、100MB、2–30 秒），否则提交前就拦；
 *  2. provider 契约只吃 `videos + prompt + fields`，没有口型同步开关 →
 *     「口型同步」必须做能力检查：拿不到支持证据就是 blocker，绝不静默丢参；
 *  3. 页面上的每个选项都写进 prompt（`auditVideoTranslationPrompt` 逐项核对），
 *     只改 UI 不改 prompt 等于没改，测试直接失败。
 */

export type VideoTranslationErrorCode =
    | "no-source"
    | "source-mime"
    | "source-too-large"
    | "source-too-short"
    | "source-too-long"
    | "source-duration-unknown"
    | "source-unavailable"
    | "model-missing"
    | "invalid-language"
    | "same-language"
    | "invalid-output"
    | "capability-blocked";

export class VideoTranslationAdapterError extends Error {
    readonly code: VideoTranslationErrorCode;
    constructor(code: VideoTranslationErrorCode, message: string) {
        super(message);
        this.name = "VideoTranslationAdapterError";
        this.code = code;
    }
}

/* ============================== 原视频 ============================== */

export type VideoTranslationSource = {
    assetId: string;
    name: string;
    url: string;
    storageKey?: string;
    bytes: number;
    mimeType: string;
    durationMs: number;
    width?: number;
    height?: number;
};

export function videoTranslationSourceFromRecord(record: ToolAssetRecord): VideoTranslationSource {
    return {
        assetId: record.id,
        name: record.name,
        url: record.url,
        storageKey: record.storageKey,
        bytes: record.bytes,
        mimeType: record.mimeType,
        durationMs: record.durationMs ?? 0,
        width: record.width,
        height: record.height,
    };
}

/** severity=block 阻断提交；notice 只提示（例如时长超出建议区间，spec 里是「建议」）。 */
export type VideoTranslationSourceIssue = {
    code: VideoTranslationErrorCode;
    message: string;
    severity: "block" | "notice";
};

/** 页面规则的一次性核对（上传后即时反馈，不只靠提交时抛错）。 */
export function checkVideoTranslationSource(
    source: Pick<VideoTranslationSource, "bytes" | "mimeType" | "durationMs"> | null | undefined,
): VideoTranslationSourceIssue[] {
    if (!source) return [{ code: "no-source", message: "请先上传需要翻译的原视频", severity: "block" }];
    const issues: VideoTranslationSourceIssue[] = [];
    const mime = source.mimeType.toLowerCase();
    const allowed = VIDEO_TRANSLATION_SOURCE_RULE.mimeTypes as readonly string[];
    if (!allowed.includes(mime)) {
        issues.push({ code: "source-mime", message: "只支持 MP4、MOV 格式的原视频", severity: "block" });
    }
    if (source.bytes > VIDEO_TRANSLATION_SOURCE_RULE.maxBytes) {
        issues.push({ code: "source-too-large", message: "原视频需在 100MB 以内", severity: "block" });
    }
    const { minDurationMs, maxDurationMs, minSeconds, maxSeconds } = VIDEO_TRANSLATION_SOURCE_RULE;
    if (!Number.isFinite(source.durationMs) || source.durationMs <= 0) {
        issues.push({ code: "source-duration-unknown", message: "读不到原视频时长，请重新上传后再试", severity: "block" });
    } else if (source.durationMs < minDurationMs) {
        issues.push({
            code: "source-too-short",
            message: `原视频建议 ${minSeconds}–${maxSeconds} 秒，当前偏短，语音可能不完整`,
            severity: "notice",
        });
    } else if (source.durationMs > maxDurationMs) {
        issues.push({
            code: "source-too-long",
            message: `原视频建议 ${minSeconds}–${maxSeconds} 秒，当前偏长，可能影响翻译质量`,
            severity: "notice",
        });
    }
    return issues;
}

/** 资产 → gateway 的 ReferenceVideo（与 video-replication 一致：只用会话内 object URL）。 */
export function toVideoTranslationVideoRef(source: VideoTranslationSource): ReferenceVideo {
    return {
        id: source.assetId,
        name: source.name,
        type: source.mimeType,
        url: source.url,
        storageKey: source.storageKey,
        bytes: source.bytes,
        width: source.width,
        height: source.height,
        durationMs: source.durationMs,
    };
}

/* ============================== 能力检查 ============================== */

export type VideoTranslationCapabilityKey = "lipSync" | "outputNum" | "referenceVideo";

export type VideoTranslationCapabilityReport = {
    /** 需求（required=true 表示缺证据就阻断提交） */
    requirements: Array<{ key: VideoTranslationCapabilityKey; required: boolean; label: string; detail: string }>;
    /** 证据：supported / unsupported / unknown；unknown 一律按未验证处理 */
    evidence: Record<VideoTranslationCapabilityKey, "supported" | "unsupported" | "unknown">;
    /** 人话版阻断原因（空数组表示可提交） */
    blockers: string[];
    /** 需要用户显式确认才继续的降级项 */
    degradations: string[];
};

/**
 * 当前 provider 契约（web/src/services/api/video.ts）只发送 prompt + 参考媒体 + 少量全局参数，
 * 没有任何“口型同步”开关 → 口型同步属于拿不到支持证据的能力，按 unknown 处理并阻断。
 * 一旦渠道接入原生口型同步参数，把这里的 evidence 改成 supported 即可，页面无需改动。
 */
export function checkVideoTranslationCapability(
    values: VideoTranslationValues,
    options: { lipSyncSupported?: boolean; nativeOutputCount?: number } = {},
): VideoTranslationCapabilityReport {
    const lipSyncSupported = options.lipSyncSupported ?? false;
    const nativeOutputCount = options.nativeOutputCount ?? VIDEO_TRANSLATION_SUPPORTED_OUTPUT;
    const outputNum = normalizeVideoTranslationOutput(values.outputNum);

    const evidence: VideoTranslationCapabilityReport["evidence"] = {
        referenceVideo: "supported",
        lipSync: lipSyncSupported ? "supported" : "unsupported",
        outputNum: outputNum <= nativeOutputCount ? "supported" : "unsupported",
    };

    const requirements: VideoTranslationCapabilityReport["requirements"] = [
        { key: "referenceVideo", required: true, label: "原视频翻译", detail: "上游接收原视频 + 目标语言" },
        {
            key: "lipSync",
            required: values.lipSync,
            label: "口型同步",
            detail: values.lipSync ? "已开启：需要 provider 支持口型同步" : "已关闭：只做配音/字幕级翻译",
        },
        {
            key: "outputNum",
            required: outputNum > nativeOutputCount,
            label: "多输出",
            detail: `当前渠道一次返回 ${nativeOutputCount} 条视频`,
        },
    ];

    const blockers = requirements
        .filter((item) => item.required && evidence[item.key] !== "supported")
        .map((item) =>
            item.key === "lipSync"
                ? "当前视频模型没有口型同步能力声明，无法保证唇形对齐：请关闭「口型同步」后重试"
                : item.key === "outputNum"
                  ? `当前视频模型一次只能返回 ${nativeOutputCount} 条视频，请把输出数量改成 ${nativeOutputCount}`
                  : `当前视频模型不支持${item.label}`,
        );

    const degradations = requirements
        .filter((item) => !item.required && evidence[item.key] === "unsupported")
        .map((item) => `${item.label}：${item.detail}`);

    return { requirements, evidence, blockers, degradations };
}

/* ============================== 提示词 ============================== */

export type VideoTranslationPromptSegments = {
    task: string;
    source: string;
    target: string;
    lipSync: string;
    output: string;
    type: string;
    mode: string;
    text: string;
};

/**
 * 视频服务只吃 prompt：页面每个选项都必须出现在提示词里。
 * `auditVideoTranslationPrompt` 会逐项核对，缺一项就当作“选项没生效”。
 */
export function composeVideoTranslationPrompt(
    values: VideoTranslationValues,
    catalog: VideoTranslationCatalog = resolveVideoTranslationCatalog(),
): VideoTranslationPromptSegments {
    const sourceLabel = videoTranslationLanguageLabel(values.sourceLanguage, catalog) || values.sourceLanguage;
    const targetLabel = videoTranslationLanguageLabel(values.targetLanguage, catalog) || values.targetLanguage;
    const typeLabel = videoTranslationOptionLabel(catalog.videoTypes, values.videoType) || values.videoType;
    const outputNum = normalizeVideoTranslationOutput(values.outputNum);

    const task =
        "任务：把原视频的语音翻译成目标语言并重新配音，保持原画面、镜头节奏与字幕时间轴不变，输出可直接投放的成片。";
    const source =
        values.sourceLanguage === "auto"
            ? "源语言：自动识别原视频语音语言（识别结果需与目标语言不同）。"
            : `源语言：${sourceLabel}。`;
    const target = `目标语言：${targetLabel}；译制语音与字幕统一使用该语言。`;
    const lipSync = values.lipSync
        ? "口型同步：开启，译制语音需与原画面唇形对齐。"
        : "口型同步：关闭，仅替换音轨与字幕，不改动唇形。";
    const output = `输出数量：${outputNum} 条；每条均为完整成片。`;
    const type = `翻译类型：${typeLabel}。`;
    const mode = values.mode === "advanced" ? "模式：高级模式，参数以上述设置为准。" : "模式：标准翻译。";

    const lines = [task, source, target, lipSync, output, type, mode];
    return { task, source, target, lipSync, output, type, mode, text: lines.join("\n") };
}

/** 逐项核对：页面选项 → 提示词。返回缺失项（空数组表示全部覆盖）。 */
export function auditVideoTranslationPrompt(
    prompt: string,
    values: VideoTranslationValues,
    catalog: VideoTranslationCatalog = resolveVideoTranslationCatalog(),
): string[] {
    const segments = composeVideoTranslationPrompt(values, catalog);
    const missing: string[] = [];
    for (const key of ["task", "source", "target", "lipSync", "output", "type", "mode"] as const) {
        if (!prompt.includes(segments[key])) missing.push(key);
    }
    return missing;
}

/* ============================== 真实请求 ============================== */

export type BuildVideoTranslationInputArgs = {
    values: VideoTranslationValues;
    source: VideoTranslationSource | null;
    model: string;
    catalog?: VideoTranslationCatalog;
    lipSyncSupported?: boolean;
    nativeOutputCount?: number;
    /** 分辨率档位（全局 videoQuality）：只影响申请给上游的像素尺寸，档位本身由 ratio 推。 */
    resolution?: string;
};

/** 页面 7 个 provider 字段：一个都不能缺（gateway 按 fields 声明校验）。 */
export function buildVideoTranslationFields(
    values: VideoTranslationValues,
    source: VideoTranslationSource,
): Record<string, string | number | boolean> {
    return {
        lipSync: values.lipSync,
        outputNum: normalizeVideoTranslationOutput(values.outputNum),
        sourceLanguage: values.sourceLanguage,
        sourceVideoName: source.name,
        sourceVideoUrl: source.url,
        targetLanguage: values.targetLanguage,
        videoType: values.videoType,
    };
}

export function auditVideoTranslationFields(fields: Record<string, unknown>): string[] {
    return VIDEO_TRANSLATION_FIELD_ORDER.filter((key) => {
        const value = fields[key];
        if (key === "lipSync") return typeof value !== "boolean";
        return value === undefined || value === null || value === "";
    });
}

export function buildVideoTranslationBrowserInput(args: BuildVideoTranslationInputArgs): BrowserToolInput {
    const catalog = resolveVideoTranslationCatalog(args.catalog);
    const values = args.values;
    const model = args.model.trim();
    if (!model) throw new VideoTranslationAdapterError("model-missing", "请先选择视频模型");
    if (!args.source) throw new VideoTranslationAdapterError("no-source", "请先上传需要翻译的原视频");

    const sourceBlocker = checkVideoTranslationSource(args.source).find((issue) => issue.severity === "block");
    if (sourceBlocker) throw new VideoTranslationAdapterError(sourceBlocker.code, sourceBlocker.message);

    const knownSource = videoTranslationSourceOptions(catalog).some((item) => item.id === values.sourceLanguage);
    if (!knownSource) throw new VideoTranslationAdapterError("invalid-language", "源语言不在可选范围");
    if (!videoTranslationTargetOptions(values.sourceLanguage, catalog).some((item) => item.id === values.targetLanguage)) {
        throw new VideoTranslationAdapterError(
            values.sourceLanguage === values.targetLanguage ? "same-language" : "invalid-language",
            "目标语言需与显式指定的源语言不同",
        );
    }
    const outputNum = normalizeVideoTranslationOutput(values.outputNum);
    if (!(VIDEO_TRANSLATION_OUTPUT_OPTIONS as readonly number[]).includes(outputNum)) {
        throw new VideoTranslationAdapterError("invalid-output", `输出数量只能选 ${VIDEO_TRANSLATION_OUTPUT_OPTIONS.join(" / ")}`);
    }

    const capability = checkVideoTranslationCapability(values, {
        lipSyncSupported: args.lipSyncSupported,
        nativeOutputCount: args.nativeOutputCount,
    });
    if (capability.blockers.length > 0) {
        throw new VideoTranslationAdapterError("capability-blocked", capability.blockers[0]);
    }

    const segments = composeVideoTranslationPrompt(values, catalog);
    const outputPlan = resolveVideoTranslationOutputPlan(values, args.source, args.resolution);
    return {
        toolId: VIDEO_TRANSLATION_TOOL_ID,
        prompt: segments.text,
        videos: [toVideoTranslationVideoRef(args.source)],
        model,
        fields: buildVideoTranslationFields(values, args.source),
        // 画幅：默认跟随原视频。不传的话 gateway 会退回全局 config.size=1:1（方形重构图）。
        videoRatio: outputPlan.ratio,
    };
}

/**
 * 本次提交的画幅方案（UI 与请求层共用同一份判断，避免「提示一套、提交另一套」）。
 * 源比例命中上游档位（误差 ≤0.5%）才算保持，否则带显式 notice。
 */
export function resolveVideoTranslationOutputPlan(
    values: Pick<VideoTranslationValues, "outputRatio">,
    source: Pick<VideoTranslationSource, "width" | "height"> | null | undefined,
    resolution: string = "720",
): VideoTranslationOutputPlan {
    return planVideoTranslationOutput(source, normalizeVideoTranslationOutputRatio(values.outputRatio), resolution);
}

/* ============================== 提交 / 重试 ============================== */

export type VideoTranslationGatewayLike = {
    run: (input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
    submit?: (input: BrowserToolInput, options?: SubmitOptions) => Promise<ToolTask>;
};

/** 真实 store 端口：动态 import，避免 adapter 顶层依赖 zustand。 */
export async function createVideoTranslationRunPort(): Promise<VideoTranslationGatewayLike> {
    const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
    return {
        run: (input, options) => useToolTaskStore.getState().runTool(input, options),
        submit: (input, options) => useToolTaskStore.getState().submitTool(input, options),
    };
}

export type VideoTranslationRunOptions = { draftRevision?: number | string | null; signal?: AbortSignal };

export async function runVideoTranslationTask(
    args: { browserInput: BrowserToolInput; port: VideoTranslationGatewayLike } & VideoTranslationRunOptions,
): Promise<ToolTask> {
    return args.port.run(args.browserInput, {
        draftRevision: args.draftRevision ?? null,
        signal: args.signal,
        dedupe: true,
    });
}

/** 重试：同一逻辑操作沿用原指纹之外的一切，但 dedupe=false，确保真的再发一次。 */
export async function retryVideoTranslationTask(
    args: { browserInput: BrowserToolInput; port: VideoTranslationGatewayLike } & VideoTranslationRunOptions,
): Promise<ToolTask> {
    return args.port.run(args.browserInput, {
        draftRevision: args.draftRevision ?? null,
        signal: args.signal,
        dedupe: false,
    });
}

/* ============================== 结果 ============================== */

export type VideoTranslationResultView = {
    state: "idle" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";
    videos: ToolTaskResultItem[];
    message: string;
    stale: boolean;
    snapshot: VideoTranslationSnapshot | null;
    /** 结果条数与页面要求的输出数量是否一致（不一致要说出来，不假装成功） */
    outputMatched: boolean;
};

export function videoTranslationStatusText(status: ToolTask["status"]): string {
    switch (status) {
        case "draft":
            return "待提交";
        case "validating":
            return "校验中";
        case "submitting":
            return "提交中";
        case "running":
            return "翻译中";
        case "succeeded":
            return "已完成";
        case "failed":
            return "失败";
        case "cancelled":
            return "已取消";
        default:
            return "状态未知";
    }
}

export function videoTranslationResultView(args: {
    task: ToolTask | null | undefined;
    snapshot: VideoTranslationSnapshot | null | undefined;
    current: VideoTranslationValues;
    catalog?: VideoTranslationCatalog;
}): VideoTranslationResultView {
    const catalog = resolveVideoTranslationCatalog(args.catalog);
    const currentSnapshot = createVideoTranslationSnapshot(args.current, catalog, 0);
    const captured = args.snapshot ?? null;
    const stale = Boolean(captured && captured.hash !== currentSnapshot.hash);
    const task = args.task;
    const snapshot = captured;

    if (!task) {
        return { state: "idle", videos: [], message: "尚未提交", stale: false, snapshot, outputMatched: true };
    }

    const videos = (task.result?.items ?? []).filter((item) => item.kind === "video");
    const expected = normalizeVideoTranslationOutput(snapshot?.values.outputNum ?? args.current.outputNum);

    switch (task.status) {
        case "draft":
        case "validating":
        case "submitting":
        case "running":
            return { state: "running", videos, message: videoTranslationStatusText(task.status), stale, snapshot, outputMatched: true };
        case "succeeded":
            if (videos.length === 0) {
                return { state: "failed", videos: [], message: "任务成功但没有可播放的翻译视频", stale, snapshot, outputMatched: false };
            }
            return {
                state: "succeeded",
                videos,
                message: videos.length < expected ? `已返回 ${videos.length} / ${expected} 条视频` : `已返回 ${videos.length} 条视频`,
                stale,
                snapshot,
                outputMatched: videos.length >= expected,
            };
        case "failed":
            return {
                state: "failed",
                videos,
                message: task.error?.message || "翻译失败，可保留配置重试",
                stale,
                snapshot,
                outputMatched: true,
            };
        case "cancelled":
            return { state: "cancelled", videos, message: "已取消；上游可能仍在计费", stale, snapshot, outputMatched: true };
        default:
            return {
                state: "unknown",
                videos,
                message: "状态未知，请到历史记录确认后再决定是否重试",
                stale,
                snapshot,
                outputMatched: true,
            };
    }
}

/** 页面初始值（保持与 registry 默认一致，便于测试与草稿恢复共用）。 */
export function createInitialVideoTranslationValues(): VideoTranslationValues {
    return createVideoTranslationValues();
}
