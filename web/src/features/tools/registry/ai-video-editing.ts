/**
 * TASK-044 / AI_VIDEO_EDITING（视频编辑，makeType 95）——“页面”这一层的事实来源。
 *
 * 证据（只读，不搬 LinkFox 前端代码）：
 * - docs/V1.0/plan_linkfox_navigation/page-specs/37-ai-video-editing.md（区域、控件、联动、校验、验收）
 * - docs/V1.0/plan_linkfox_navigation/evidence/page-dom-20261028/AI_VIDEO_EDITING.json（实测文案与控件）
 * - docs/V1.0/plan_linkfox_navigation/tool_specs.json#AI_VIDEO_EDITING 与 registry/index.ts 的 7 个字段
 *
 * 真实边界：
 * - 原站「1190 算力」是它的计费口径，这里不复刻；主按钮只报本次真实产物数量/时长。
 * - `hiddenPrompt` 由本模块模板确定性生成，页面只读展示（审计用），不参与手填。
 * -「提示词优化」不谎称调用模型：用本模块模板把截取区间/参考图数量/类型拼成草稿，页面标注“模板优化”。
 * - 参考图在原站是「选填」，但本地网关 `gateway.ts` 对本工具声明 `requiresReferences: true`，
 *   因此提交必须 ≥1 张；页面如实提示这条本地约束，不静默丢参也不伪造成功。
 */

import type { ToolSpec } from "../types";
import { getToolById } from "./index";

export const AI_VIDEO_EDITING_TOOL_ID = "AI_VIDEO_EDITING";
export const AI_VIDEO_EDITING_DRAFT_KEY = `tool-draft:v1:${AI_VIDEO_EDITING_TOOL_ID}` as const;

/** 提示词上限：原站计数 0 / 2500。 */
export const AI_VIDEO_EDITING_PROMPT_MAX = 2500;
/** 参考图上限：原站「支持上传 30 张图」。 */
export const AI_VIDEO_EDITING_MAX_REFERENCES = 30;
/** 输出条数：原站没有张数控件，工具声明 outputNum = 1。 */
export const AI_VIDEO_EDITING_OUTPUT_NUM = 1;

/** 参考图硬约束：10M 以内、384²–4096²、宽高比 0.4–2.5（含边界）。 */
export const AI_VIDEO_EDITING_REFERENCE_RULE = {
    maxBytes: 10 * 1024 * 1024,
    minSide: 384,
    maxSide: 4096,
    minRatio: 0.4,
    maxRatio: 2.5,
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
} as const;

/** 源视频硬约束：MP4/MOV、100M 以内、时长不低于 4 秒、截取不超过 30 秒。 */
export const AI_VIDEO_EDITING_VIDEO_RULE = {
    maxBytes: 100 * 1024 * 1024,
    minSourceMs: 4_000,
    maxClipMs: 30_000,
    mimeTypes: ["video/mp4", "video/quicktime"],
} as const;

/** 截取区间最小时长：1 秒（短于 1 秒的区间对视频编辑没有意义）。 */
export const AI_VIDEO_EDITING_MIN_CLIP_MS = 1_000;

export const AI_VIDEO_EDITING_VIDEO_MIME_LABEL = "MP4 / MOV";

/* ============================== 视频类型 ============================== */

export type AiVideoEditingTypeId = "product_person_precise";

export type AiVideoEditingType = {
    id: AiVideoEditingTypeId;
    /** 原站控件文案。 */
    label: string;
    note: string;
    /** 该类型允许的最长截取时长（毫秒）。 */
    maxClipMs: number;
    /** 该类型是否要求至少 1 张参考图（主体锁定）。 */
    requiresReference: boolean;
    /** 直接写进隐藏提示词的编辑意图。 */
    intent: string;
};

/**
 * 视频类型：原站实测只有一个可选项「商品人物精准编辑」。
 * 不凭空造第二个模式（选项动态来自模型目录，未加载时展示这一条并禁用切换）。
 */
export const AI_VIDEO_EDITING_TYPES: readonly AiVideoEditingType[] = [
    {
        id: "product_person_precise",
        label: "商品人物精准编辑",
        note: "锁定商品/人物身份，只改动作、场景与风格",
        maxClipMs: AI_VIDEO_EDITING_VIDEO_RULE.maxClipMs,
        requiresReference: true,
        intent: "保持参考图中商品与人物的一致性，只按需求改写镜头内容、动作、场景与光线",
    },
];

export const DEFAULT_AI_VIDEO_EDITING_TYPE: AiVideoEditingTypeId = "product_person_precise";

export function findAiVideoEditingType(id: string): AiVideoEditingType | undefined {
    return AI_VIDEO_EDITING_TYPES.find((type) => type.id === id);
}

/* ============================== 页面状态 ============================== */

/** 页面可变状态：只放真正会进入提交/草稿的字段（秒为单位，保留毫秒精度换算）。 */
export type AiVideoEditingState = {
    videoType: AiVideoEditingTypeId;
    /** 截取起点（秒）。 */
    clipStart: number;
    /** 截取时长（秒）→ 提交字段 duration。 */
    clipDuration: number;
    /** 可见编辑需求（用户输入）。 */
    prompt: string;
};

export function createAiVideoEditingState(patch: Partial<AiVideoEditingState> = {}): AiVideoEditingState {
    return {
        videoType: DEFAULT_AI_VIDEO_EDITING_TYPE,
        clipStart: 0,
        clipDuration: AI_VIDEO_EDITING_VIDEO_RULE.maxClipMs / 1000,
        prompt: "",
        ...patch,
    };
}

/** 非法/缺失的草稿值直接回落默认，绝不把未知枚举提交上游。 */
export function normalizeAiVideoEditingState(patch: Partial<AiVideoEditingState> | null | undefined): AiVideoEditingState {
    const base = createAiVideoEditingState();
    if (!patch || typeof patch !== "object") return base;
    const type = typeof patch.videoType === "string" && findAiVideoEditingType(patch.videoType) ? (patch.videoType as AiVideoEditingTypeId) : base.videoType;
    const clipStart = typeof patch.clipStart === "number" && Number.isFinite(patch.clipStart) && patch.clipStart >= 0 ? patch.clipStart : base.clipStart;
    const clipDuration = typeof patch.clipDuration === "number" && Number.isFinite(patch.clipDuration) && patch.clipDuration > 0 ? patch.clipDuration : base.clipDuration;
    const prompt = typeof patch.prompt === "string" ? patch.prompt : base.prompt;
    return { videoType: type, clipStart, clipDuration, prompt };
}

/* ============================== 截取 / 时长联动 ============================== */

export type AiVideoEditingClampReason = "none" | "source-end" | "type-limit" | "min-clip" | "no-source" | "unknown-duration";

export type AiVideoEditingClipWindow = {
    /** 源视频总长（毫秒），未知时为 0。 */
    sourceDurationMs: number;
    startMs: number;
    endMs: number;
    durationMs: number;
    startSec: number;
    endSec: number;
    durationSec: number;
    /** 该类型的最大可截取时长。 */
    maxClipMs: number;
    reason: AiVideoEditingClampReason;
    /** 给控件旁展示的真实提示（无变化时为空串）。 */
    notice: string;
};

function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(value, min), max);
}

/**
 * 截取区间求解：源视频/类型上限/最小时长三方夹紧，并显式返回被夹紧的原因。
 * 「时长和视频类型联动」就落在 `maxClipMs` 上：换类型会收窄可截时长。
 */
export function resolveAiVideoEditingClip(input: {
    sourceDurationMs: number;
    clipStart: number;
    clipDuration: number;
    type?: AiVideoEditingType;
    /** 是否已有源视频记录：用于区分「还没上传」和「上传了但读不出时长」。 */
    hasSource?: boolean;
}): AiVideoEditingClipWindow {
    const type = input.type ?? findAiVideoEditingType(DEFAULT_AI_VIDEO_EDITING_TYPE) ?? AI_VIDEO_EDITING_TYPES[0];
    const source = Math.max(0, Math.floor(input.sourceDurationMs || 0));
    const maxClip = Math.min(type.maxClipMs, AI_VIDEO_EDITING_VIDEO_RULE.maxClipMs);
    if (source <= 0) {
        // 已有源视频记录却拿不到时长：浏览器无法解码/元数据探测超时。不能假装「还没上传」，
        // 也不该继续用 0 秒截取区间去提交（会出现 prompt 写 X 秒、实际下发别的秒数）。
        const unknown = Boolean(input.hasSource);
        return {
            sourceDurationMs: 0,
            startMs: 0,
            endMs: 0,
            durationMs: 0,
            startSec: 0,
            endSec: 0,
            durationSec: 0,
            maxClipMs: maxClip,
            reason: unknown ? "unknown-duration" : "no-source",
            notice: unknown ? "已上传源视频，但读不到时长（浏览器无法解码该文件），请重新上传可播放的 MP4/MOV" : "先上传源视频，才能确定截取区间",
        };
    }
    let reason: AiVideoEditingClampReason = "none";
    const startMs = Math.min(Math.max(0, Math.round((input.clipStart || 0) * 1000)), Math.max(0, source - AI_VIDEO_EDITING_MIN_CLIP_MS));
    const wanted = Math.round((input.clipDuration || 0) * 1000);
    let durationMs = clampNumber(wanted, AI_VIDEO_EDITING_MIN_CLIP_MS, maxClip);
    if (wanted > maxClip) reason = "type-limit";
    if (wanted > 0 && wanted < AI_VIDEO_EDITING_MIN_CLIP_MS) reason = "min-clip";
    const remaining = Math.max(0, source - startMs);
    if (durationMs > remaining) {
        durationMs = Math.max(0, remaining);
        if (durationMs < AI_VIDEO_EDITING_MIN_CLIP_MS) {
            durationMs = Math.min(AI_VIDEO_EDITING_MIN_CLIP_MS, remaining);
        }
        reason = "source-end";
    }
    const endMs = startMs + durationMs;
    const notice =
        reason === "type-limit"
            ? `「${type.label}」最长可截 ${Math.round(maxClip / 1000)} 秒，已按上限收窄`
            : reason === "source-end"
              ? `已截到源视频结尾（源片 ${formatSeconds(source)}）`
              : reason === "min-clip"
                ? `截取时长不能短于 ${Math.round(AI_VIDEO_EDITING_MIN_CLIP_MS / 1000)} 秒`
                : "";
    return {
        sourceDurationMs: source,
        startMs,
        endMs,
        durationMs,
        startSec: roundSeconds(startMs / 1000),
        endSec: roundSeconds(endMs / 1000),
        durationSec: roundSeconds(durationMs / 1000),
        maxClipMs: maxClip,
        reason,
        notice,
    };
}

/** 改起点：保持区间长度不变，超出源视频结尾则整体前移（不静默丢秒）。 */
export function applyAiVideoEditingClipStart(input: {
    state: AiVideoEditingState;
    sourceDurationMs: number;
    startSec: number;
}): AiVideoEditingState {
    const type = findAiVideoEditingType(input.state.videoType);
    const window = resolveAiVideoEditingClip({
        sourceDurationMs: input.sourceDurationMs,
        clipStart: input.startSec,
        clipDuration: input.state.clipDuration,
        type,
    });
    return { ...input.state, clipStart: window.startSec, clipDuration: window.durationSec };
}

/** 改时长：以当前起点为准向后取，源视频不够长时夹紧并提示（页面用 notice 展示）。 */
export function applyAiVideoEditingClipDuration(input: {
    state: AiVideoEditingState;
    sourceDurationMs: number;
    durationSec: number;
}): AiVideoEditingState {
    const type = findAiVideoEditingType(input.state.videoType);
    const window = resolveAiVideoEditingClip({
        sourceDurationMs: input.sourceDurationMs,
        clipStart: input.state.clipStart,
        clipDuration: input.durationSec,
        type,
    });
    return { ...input.state, clipStart: window.startSec, clipDuration: window.durationSec };
}

/** 换视频类型：截取时长按新类型上限重新夹紧。 */
export function applyAiVideoEditingType(input: { state: AiVideoEditingState; sourceDurationMs: number; videoType: string }): AiVideoEditingState {
    const type = findAiVideoEditingType(input.videoType);
    if (!type) return input.state;
    const window = resolveAiVideoEditingClip({
        sourceDurationMs: input.sourceDurationMs,
        clipStart: input.state.clipStart,
        clipDuration: input.state.clipDuration,
        type,
    });
    return { ...input.state, videoType: type.id, clipStart: window.startSec, clipDuration: window.durationSec };
}

/** 换源视频：截取区间回到「从 0 开始、按类型上限」，旧结果不再当作当前结果的依据。 */
export function resetAiVideoEditingClipForSource(state: AiVideoEditingState, sourceDurationMs: number): AiVideoEditingState {
    const type = findAiVideoEditingType(state.videoType);
    const window = resolveAiVideoEditingClip({ sourceDurationMs, clipStart: 0, clipDuration: type?.maxClipMs ?? AI_VIDEO_EDITING_VIDEO_RULE.maxClipMs, type });
    return { ...state, clipStart: window.startSec, clipDuration: window.durationSec };
}

export function roundSeconds(value: number): number {
    return Math.round((Number(value) || 0) * 10) / 10;
}

export function formatSeconds(ms: number): string {
    const seconds = roundSeconds(ms / 1000);
    return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} 秒`;
}

/** 截取区间文案：`0–12.5 秒（共 12.5 秒）`。 */
export function aiVideoEditingClipLabel(window: AiVideoEditingClipWindow): string {
    if (window.reason === "no-source") return "待上传源视频";
    if (window.reason === "unknown-duration") return "时长未知";
    return `${window.startSec}–${window.endSec} 秒（共 ${window.durationSec} 秒）`;
}

/* ============================== 提示词 ============================== */

export type AiVideoEditingPromptCheck = { value: string; length: number; empty: boolean; tooLong: boolean };

export function checkAiVideoEditingPrompt(prompt: string): AiVideoEditingPromptCheck {
    const value = prompt ?? "";
    const length = Array.from(value).length;
    return { value, length, empty: value.trim().length === 0, tooLong: length > AI_VIDEO_EDITING_PROMPT_MAX };
}

export function aiVideoEditingPromptCounter(prompt: string): string {
    return `${checkAiVideoEditingPrompt(prompt).length} / ${AI_VIDEO_EDITING_PROMPT_MAX}`;
}

/**
 * 隐藏提示词：模板确定性生成，页面只读展示，用于审计“模型到底被要求了什么”。
 * 不拼用户自由文本，避免把可编辑内容偷渡进不可见指令。
 */
export function buildAiVideoEditingHiddenPrompt(input: {
    state: AiVideoEditingState;
    model: string;
    window: AiVideoEditingClipWindow;
    referenceCount: number;
}): string {
    const type = findAiVideoEditingType(input.state.videoType) ?? AI_VIDEO_EDITING_TYPES[0];
    const { window, referenceCount } = input;
    return [
        "【视频编辑 · 模板 v1】",
        `编辑类型：${type.label}；编辑意图：${type.intent}`,
        `源视频取自 ${window.startSec}–${window.endSec} 秒（共 ${window.durationSec} 秒，源片 ${formatSeconds(window.sourceDurationMs)}）`,
        `参考素材：${referenceCount} 张参考图按上传顺序参与主体一致性约束；商品外观、颜色、logo 与人物身份必须与参考图一致`,
        `输出：1 条视频，时长约 ${window.durationSec} 秒；模型：${input.model || "未选择"}`,
        "约束：不新增未出现在源视频/参考图中的商品、人物与文字；不改变源视频镜头语言之外的事实；不加水印与字幕贴纸",
    ].join("\n");
}

/** 真正发给 provider 的 prompt：隐藏模板 + 用户可见编辑需求（顺序固定，便于审计）。 */
export function composeAiVideoEditingProviderPrompt(input: {
    state: AiVideoEditingState;
    model: string;
    window: AiVideoEditingClipWindow;
    referenceCount: number;
}): string {
    const hidden = buildAiVideoEditingHiddenPrompt(input);
    const visible = input.state.prompt.trim();
    return visible ? `${hidden}\n\n【编辑需求（用户可见，可编辑）】\n${visible}` : hidden;
}

/** 模板优化：确定性生成编辑需求草稿（不调用模型，页面标注“模板优化”）。 */
export function composeAiVideoEditingPromptDraft(input: {
    state: AiVideoEditingState;
    window: AiVideoEditingClipWindow;
    referenceCount: number;
}): string {
    const type = findAiVideoEditingType(input.state.videoType) ?? AI_VIDEO_EDITING_TYPES[0];
    const subject = input.referenceCount > 0 ? `按 ${input.referenceCount} 张参考图锁定主体` : "按源视频主体保持一致";
    return [
        `[模板优化] ${type.label}：${subject}，只改写以下内容。`,
        `时间范围：${aiVideoEditingClipLabel(input.window)}。`,
        "画面：把背景换成干净的室内纯色场景，保留商品细节纹理与人物服装版型。",
        "动作：人物自然拿起商品展示标签，镜头轻微推进，不改变商品与人物身份。",
        "光线与风格：柔和侧光、真实阴影，色彩接近参考图，不额外加滤镜。",
        "禁止：新增文字、水印、贴纸与他人品牌标识。",
    ].join("\n");
}

/* ============================== 快照 / 草稿 ============================== */

export type AiVideoEditingSnapshot = {
    toolId: typeof AI_VIDEO_EDITING_TOOL_ID;
    draftRevision: number | null;
    clientOperationId: string;
    model: string;
    videoType: string;
    clipStartSec: number;
    durationSec: number;
    sourceVideoSec: number;
    prompt: string;
    hiddenPrompt: string;
    sourceAssetId: string;
    referenceAssetIds: string[];
};

export function createAiVideoEditingSnapshot(input: {
    state: AiVideoEditingState;
    model: string;
    window: AiVideoEditingClipWindow;
    referenceAssetIds: readonly string[];
    sourceAssetId: string;
    draftRevision?: number | null;
    clientOperationId: string;
}): AiVideoEditingSnapshot {
    return {
        toolId: AI_VIDEO_EDITING_TOOL_ID,
        draftRevision: input.draftRevision ?? null,
        clientOperationId: input.clientOperationId,
        model: input.model,
        videoType: input.state.videoType,
        clipStartSec: input.window.startSec,
        durationSec: input.window.durationSec,
        sourceVideoSec: roundSeconds(input.window.sourceDurationMs / 1000),
        prompt: input.state.prompt,
        hiddenPrompt: buildAiVideoEditingHiddenPrompt({
            state: input.state,
            model: input.model,
            window: input.window,
            referenceCount: input.referenceAssetIds.length,
        }),
        sourceAssetId: input.sourceAssetId,
        referenceAssetIds: [...input.referenceAssetIds],
    };
}

function snapshotSignature(snapshot: AiVideoEditingSnapshot): string {
    return JSON.stringify([
        snapshot.model,
        snapshot.videoType,
        snapshot.clipStartSec,
        snapshot.durationSec,
        snapshot.sourceAssetId,
        snapshot.referenceAssetIds,
        snapshot.prompt.trim(),
    ]);
}

/** 源视频/参考图/提示词/模型/截取任一变化 → 已有结果标记“来自旧版本”，不冒充当前配置结果。 */
export function isAiVideoEditingSnapshotStale(submitted: AiVideoEditingSnapshot | null, candidate: AiVideoEditingSnapshot | null): boolean {
    if (!submitted || !candidate) return false;
    return snapshotSignature(submitted) !== snapshotSignature(candidate);
}

/** 产物说明：替代原站算力区，只报真实数量/时长。 */
export function aiVideoEditingOutputLabel(window: AiVideoEditingClipWindow): string {
    if (window.reason === "no-source") return `1 条 · 待上传源视频`;
    if (window.reason === "unknown-duration") return `1 条 · 时长未知`;
    return `1 条 · ${window.durationSec} 秒`;
}

/** 草稿序列化：只落 UI 可恢复状态 + 源资产 id；文件本体由资产库管理。 */
export function serializeAiVideoEditingDraftValues(state: AiVideoEditingState, sourceAssetId: string) {
    return {
        videoType: state.videoType,
        clipStart: state.clipStart,
        clipDuration: state.clipDuration,
        prompt: state.prompt,
        sourceAssetId,
    };
}

export function parseAiVideoEditingDraftValues(values: unknown): { state: AiVideoEditingState; sourceAssetId: string; referenceAssetIds: string[] } {
    const record = (values && typeof values === "object" ? values : {}) as Record<string, unknown>;
    const referenceAssetIds = Array.isArray(record.referenceAssetIds)
        ? record.referenceAssetIds.filter((id): id is string => typeof id === "string")
        : [];
    return {
        state: normalizeAiVideoEditingState({
            videoType: typeof record.videoType === "string" ? (record.videoType as AiVideoEditingTypeId) : undefined,
            clipStart: typeof record.clipStart === "number" ? record.clipStart : undefined,
            clipDuration: typeof record.clipDuration === "number" ? record.clipDuration : undefined,
            prompt: typeof record.prompt === "string" ? record.prompt : undefined,
        }),
        sourceAssetId: typeof record.sourceAssetId === "string" ? record.sourceAssetId : "",
        referenceAssetIds,
    };
}

/* ============================== 能力判定 ============================== */

export type AiVideoEditingCapabilityInput = {
    model: string;
    hasSourceVideo: boolean;
    sourceIssues?: readonly string[];
    referenceCount: number;
    /** 本地网关是否强制要求参考图（来自 gateway.ts 的 requiresReferences）。 */
    gatewayRequiresReferences: boolean;
    prompt: string;
    clip: AiVideoEditingClipWindow;
};

export type AiVideoEditingCapability = {
    canSubmit: boolean;
    issues: string[];
    notices: string[];
    missingFields: string[];
};

/**
 * 页面/工具栏共用能力判定：缺模型、缺源视频、参考图不足、提示词空/超长都拒绝提交。
 * 不伪造“点了就能跑”的成功路径。
 */
export function resolveAiVideoEditingCapability(input: AiVideoEditingCapabilityInput): AiVideoEditingCapability {
    const issues: string[] = [...(input.sourceIssues ?? [])];
    const notices: string[] = [];
    const missingFields: string[] = [];
    const prompt = checkAiVideoEditingPrompt(input.prompt);

    if (!input.model.trim()) {
        issues.push("未选择视频模型");
        missingFields.push("videoType");
    }
    if (!input.hasSourceVideo) {
        issues.push("先上传需要编辑的视频（MP4/MOV，100M 内，≥4 秒）");
        missingFields.push("sourceVideoUrl");
    }
    if (input.hasSourceVideo && input.clip.reason === "unknown-duration") {
        // 时长读不出来就无法确定 seconds，硬提交会让 prompt 与真实下发时长互相矛盾。
        issues.push("源视频时长读取失败（浏览器无法解码），请重新上传可播放的 MP4/MOV");
        missingFields.push("sourceVideoDuration");
    }
    if (input.clip.reason === "source-end" || input.clip.reason === "type-limit") notices.push(input.clip.notice);
    if (input.hasSourceVideo && input.clip.durationMs < AI_VIDEO_EDITING_MIN_CLIP_MS) {
        issues.push(`截取时长不能短于 ${Math.round(AI_VIDEO_EDITING_MIN_CLIP_MS / 1000)} 秒`);
        missingFields.push("duration");
    }
    if (input.referenceCount > AI_VIDEO_EDITING_MAX_REFERENCES) {
        issues.push(`参考图最多 ${AI_VIDEO_EDITING_MAX_REFERENCES} 张，当前 ${input.referenceCount} 张`);
        missingFields.push("refImageUrls");
    }
    if (input.referenceCount === 0) {
        // 原站标注“选填”，但本地网关对本工具 requiresReferences=true —— 如实说明，不静默丢参。
        issues.push(
            input.gatewayRequiresReferences
                ? "本地网关对本工具要求至少 1 张参考图（原站标注选填，当前链路必须 1 张以上）"
                : "至少需要 1 张参考图",
        );
        missingFields.push("refImageUrls");
    }
    if (prompt.empty) {
        issues.push("填写编辑需求描述");
        missingFields.push("prompt");
    }
    if (prompt.tooLong) {
        issues.push(`编辑需求最多 ${AI_VIDEO_EDITING_PROMPT_MAX} 字，当前 ${prompt.length} 字`);
        missingFields.push("prompt");
    }
    if (input.referenceCount > 0 && input.referenceCount < 1) missingFields.push("refImageUrls");

    return { canSubmit: issues.length === 0, issues, notices, missingFields };
}

/* ============================== 页面 spec ============================== */

export function getAiVideoEditingSpec(): ToolSpec | undefined {
    return getToolById(AI_VIDEO_EDITING_TOOL_ID);
}

export type AiVideoEditingSpecSummary = {
    title: string;
    route: string;
    layout: string;
    enabled: boolean;
};

/** 工具栏/测试用：确认 registry 里本工具仍是 video 布局且启用。 */
export function aiVideoEditingSpecSummary(): AiVideoEditingSpecSummary | null {
    const spec = getAiVideoEditingSpec();
    if (!spec) return null;
    return {
        title: spec.title,
        route: spec.route,
        layout: spec.layout,
        enabled: spec.enabled,
    };
}
