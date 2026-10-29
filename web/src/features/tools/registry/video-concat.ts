/**
 * VIDEO_CONCAT（视频拼接，makeType 52）——“页面”这一层的事实来源。
 *
 * 证据（只读，不搬 LinkFox 前端代码）：
 * - docs/V1.0/plan_linkfox_navigation/page-specs/39-video-concat.md（区域：片段列表｜预览播放器｜
 *   排序/裁剪｜封面与比例｜导出；证据级别 supplemental_chunk_design，无原站实测 DOM）
 * - docs/V1.0/plan_linkfox_navigation/tool_specs.json#VIDEO_CONCAT 与 registry/index.ts 的 10 个字段：
 *   editType / imageFormat / imageHeight / imageSize / imageUrl / imageWidth / videoCoverUrl /
 *   videoList / videoRatio / videoTime
 *
 * 真实边界（不接受“演示成功”）：
 * - 片段时长只有从真实文件 metadata 读到才认可；读不到时长就当作“不可裁剪、不可提交”，不猜。
 * - 裁剪后的有效时长 = 各片段裁剪后时长之和；`videoTime=auto` 就是跟随该真实值，不写死。
 * - 封面只有两条真路径：用户上传的封面图，或者播放器当前帧的真实 canvas 抓帧；没有“默认封面”。
 * - 本模块不谎称调用了模型：所有函数都是本地确定性计算。
 */

import { z } from "zod";

import type { ToolSpec } from "../types";
import { getToolById } from "./index";

export const VIDEO_CONCAT_TOOL_ID = "VIDEO_CONCAT";
export const VIDEO_CONCAT_ROUTE = "/tools/ai-video/video-concat";
export const VIDEO_CONCAT_DRAFT_KEY = `tool-draft:v1:${VIDEO_CONCAT_TOOL_ID}` as const;

/** 拼接至少两段才有意义（一段不叫拼接）；上限是本地编辑器约束，超出要求用户先自行精简。 */
export const VIDEO_CONCAT_MIN_CLIPS = 2;
export const VIDEO_CONCAT_MAX_CLIPS = 10;

/** 单片最短 0.5s、最长 5 分钟：与视频资产默认读取能力一致，超出会先被拒绝，不静默截断。 */
export const VIDEO_CONCAT_CLIP_MIN_MS = 500;
export const VIDEO_CONCAT_CLIP_MAX_MS = 5 * 60 * 1000;
/** 单次裁剪不允许短于 300ms，否则上游会给出无意义产物。 */
export const VIDEO_CONCAT_TRIM_MIN_MS = 300;

/** 素材硬约束（页面规格 §2「片段列表」的可用格式与大小）。 */
export const VIDEO_CONCAT_SOURCE_RULE = {
    maxBytes: 100 * 1024 * 1024,
    mimeTypes: ["video/mp4", "video/quicktime", "video/webm"] as const,
    minClipMs: VIDEO_CONCAT_CLIP_MIN_MS,
    maxClipMs: VIDEO_CONCAT_CLIP_MAX_MS,
} as const;

/** 封面硬约束：只接受位图，视频文件绝不能当封面塞进 images 字段。 */
export const VIDEO_CONCAT_COVER_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;

export function isVideoConcatCoverMime(mimeType?: string): boolean {
    const mime = normalizeMime(mimeType);
    return (VIDEO_CONCAT_COVER_MIMES as readonly string[]).includes(mime);
}

/** 本页 editType 固定为 video（图片编辑走 IMAGE_CROP 等页），保留字段是为了指纹与审计。 */
export const VIDEO_CONCAT_EDIT_TYPE = "video" as const;
export type VideoConcatEditType = typeof VIDEO_CONCAT_EDIT_TYPE;

export type VideoConcatRatio = { value: string; label: string; note: string };

/**
 * 输出比例：与视频族其它页一致（9:16 / 16:9 / 1:1 / 4:3 / 3:4 / 21:9）。
 * 原站本页无可测 DOM（supplemental 设计），这里不复刻“未知按钮”，但会由 gateway 依据
 * `videoRatio` 写入真实请求参数，不做本地伪造输出。
 */
export const VIDEO_CONCAT_RATIOS: readonly VideoConcatRatio[] = [
    { value: "9:16", label: "9:16", note: "竖屏信息流" },
    { value: "16:9", label: "16:9", note: "横屏" },
    { value: "1:1", label: "1:1", note: "方屏" },
    { value: "4:3", label: "4:3", note: "横屏偏方" },
    { value: "3:4", label: "3:4", note: "竖屏偏方" },
    { value: "21:9", label: "21:9", note: "宽银幕" },
];

export const VIDEO_CONCAT_DEFAULT_RATIO = "9:16";

/** 输出时长档位：auto 跟随片段裁剪后总时长；固定档位如果短于素材总时长，会在页面上明确提示被裁剪。 */
export const VIDEO_CONCAT_DURATIONS = ["auto", 5, 10, 15] as const;
export type VideoConcatDuration = (typeof VIDEO_CONCAT_DURATIONS)[number];

/* ================================ 片段 ================================ */

export type VideoConcatClip = {
    /** 片段 id：与资产 id 一致，重排不改变 id，便于快照比对。 */
    id: string;
    assetId: string;
    name: string;
    url: string;
    /** file-storage 持久化键：提交时据此取回真实 Blob，而不是依赖会话内 object URL */
    storageKey?: string;
    mimeType: string;
    bytes: number;
    width?: number;
    height?: number;
    /** 真实文件时长（由视频 metadata 读取）；0 表示读不到，本页拒绝提交而不是猜测。 */
    durationMs: number;
    /** 裁剪起点（ms），含 */
    startMs: number;
    /** 裁剪终点（ms），不含 */
    endMs: number;
};

export type VideoConcatClipInput = {
    id: string;
    assetId?: string;
    name?: string;
    url: string;
    storageKey?: string;
    mimeType?: string;
    bytes?: number;
    width?: number;
    height?: number;
    durationMs?: number;
    startMs?: number;
    endMs?: number;
};

/** 片段裁剪后的有效时长；时长未知时返回 0（表示不可用），不拿“默认 5 秒”顶替。 */
export function videoConcatClipMs(clip: Pick<VideoConcatClip, "durationMs" | "startMs" | "endMs">): number {
    const duration = Number.isFinite(clip.durationMs) ? Math.max(0, Math.round(clip.durationMs)) : 0;
    if (duration <= 0) return 0;
    const start = clampNumber(clip.startMs, 0, duration);
    const end = clampNumber(clip.endMs, start, duration);
    return Math.max(0, Math.round(end - start));
}

/**
 * 归一化一个片段：裁剪区间夹到真实时长内，且不短于 300ms。
 * durationMs 未知时保留 0 并让 start/end 都为 0，由校验层给出“时长未知”阻断。
 */
export function normalizeVideoConcatClip(input: VideoConcatClipInput): VideoConcatClip {
    const durationMs = Number.isFinite(input.durationMs) ? Math.max(0, Math.round(input.durationMs as number)) : 0;
    const startMs = durationMs > 0 ? clampNumber(input.startMs ?? 0, 0, Math.max(0, durationMs - VIDEO_CONCAT_TRIM_MIN_MS)) : 0;
    const endMs = durationMs > 0 ? clampNumber(input.endMs ?? durationMs, startMs + VIDEO_CONCAT_TRIM_MIN_MS, durationMs) : 0;
    return {
        id: input.id,
        assetId: input.assetId ?? input.id,
        name: input.name ?? input.id,
        url: input.url,
        ...(input.storageKey ? { storageKey: input.storageKey } : {}),
        mimeType: normalizeMime(input.mimeType),
        bytes: Number.isFinite(input.bytes) ? Math.max(0, Math.round(input.bytes as number)) : 0,
        ...(input.width ? { width: input.width } : {}),
        ...(input.height ? { height: input.height } : {}),
        durationMs,
        startMs: Math.round(startMs),
        endMs: Math.round(endMs),
    };
}

/** 设置裁剪区间（拖动/输入两种入口共用）；越界与过短都在这里被夹住，不产生非法区间。 */
export function trimVideoConcatClip(
    clip: VideoConcatClip,
    trim: { startMs?: number; endMs?: number },
): VideoConcatClip {
    return normalizeVideoConcatClip({
        ...clip,
        startMs: trim.startMs ?? clip.startMs,
        endMs: trim.endMs ?? clip.endMs,
    });
}

/** 还原为完整片段（清掉裁剪）。 */
export function resetVideoConcatTrim(clip: VideoConcatClip): VideoConcatClip {
    return normalizeVideoConcatClip({ ...clip, startMs: 0, endMs: clip.durationMs });
}

/** 上移/下移一个片段；越界返回原数组（不产生空洞）。 */
export function moveVideoConcatClip(clips: readonly VideoConcatClip[], index: number, delta: number): VideoConcatClip[] {
    const next = [...clips];
    const target = index + delta;
    if (index < 0 || index >= next.length || target < 0 || target >= next.length) return next;
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    return next;
}

export function removeVideoConcatClip(clips: readonly VideoConcatClip[], index: number): VideoConcatClip[] {
    if (index < 0 || index >= clips.length) return [...clips];
    return clips.filter((_, current) => current !== index);
}

/** 总时长 = 各片段裁剪后时长之和（ms）。 */
export function videoConcatTotalMs(clips: readonly VideoConcatClip[]): number {
    return clips.reduce((total, clip) => total + videoConcatClipMs(clip), 0);
}

export function formatVideoConcatDuration(ms: number): string {
    const safe = Math.max(0, Math.round(ms));
    const seconds = Math.round(safe / 100) / 10;
    if (safe < 60_000) return `${seconds.toFixed(safe % 1000 === 0 ? 0 : 1)}s`;
    const minutes = Math.floor(safe / 60_000);
    const rest = Math.round((safe % 60_000) / 1000);
    return `${minutes}m${rest.toString().padStart(2, "0")}s`;
}

/** 提交时真正写入 `videoTime` 的秒数：auto 跟随片段总时长（四舍五入到整秒，最少 1s）。 */
export function effectiveVideoConcatSeconds(input: {
    videoTime: VideoConcatDuration;
    clips: readonly VideoConcatClip[];
}): number {
    if (input.videoTime !== "auto") return input.videoTime;
    const totalMs = videoConcatTotalMs(input.clips);
    if (totalMs <= 0) return 0;
    return Math.max(1, Math.round(totalMs / 1000));
}

/* ================================ 状态 ================================ */

export type VideoConcatCoverSource = "upload" | "frame";

export type VideoConcatCover = {
    /** 封面来源：上传封面图 / 播放器当前帧抓取 */
    source: VideoConcatCoverSource;
    /** 可直接交给 provider 的地址（上传是资产 URL，抓帧是 data:image/...） */
    url: string;
    /** 上传封面时的 file-storage 键（provider 侧据此取真实 Blob） */
    storageKey?: string;
    /** 抓帧时同时保留 data URL，用于 provider 的参考图入参（图片必须内联成 dataUrl） */
    dataUrl?: string;
    name: string;
    mimeType: string;
    width?: number;
    height?: number;
    bytes: number;
    /** 抓帧来源的片段 id 与时间点，用于快照过期判定 */
    clipId?: string;
    frameMs?: number;
};

export type VideoConcatState = {
    editType: VideoConcatEditType;
    videoRatio: string;
    videoTime: VideoConcatDuration;
    clips: VideoConcatClip[];
    cover: VideoConcatCover | null;
    /** 片段预览当前选中项 */
    selectedClipId: string | null;
};

export const DEFAULT_VIDEO_CONCAT_STATE: VideoConcatState = {
    editType: VIDEO_CONCAT_EDIT_TYPE,
    videoRatio: VIDEO_CONCAT_DEFAULT_RATIO,
    videoTime: "auto",
    clips: [],
    cover: null,
    selectedClipId: null,
};

export function createVideoConcatState(overrides: Partial<VideoConcatState> = {}): VideoConcatState {
    return {
        ...DEFAULT_VIDEO_CONCAT_STATE,
        ...overrides,
        editType: VIDEO_CONCAT_EDIT_TYPE,
        clips: (overrides.clips ?? []).map((clip) => normalizeVideoConcatClip(clip)),
        videoRatio: VIDEO_CONCAT_RATIOS.some((ratio) => ratio.value === overrides.videoRatio)
            ? (overrides.videoRatio as string)
            : VIDEO_CONCAT_DEFAULT_RATIO,
        videoTime: VIDEO_CONCAT_DURATIONS.includes(overrides.videoTime as VideoConcatDuration)
            ? (overrides.videoTime as VideoConcatDuration)
            : "auto",
    };
}

/* ============================== 校验 ============================== */

export type VideoConcatIssueCode =
    | "no-clips"
    | "too-few-clips"
    | "too-many-clips"
    | "clip-mime"
    | "clip-too-large"
    | "clip-too-short"
    | "clip-too-long"
    | "clip-duration-unknown"
    | "clip-trim-invalid"
    | "cover-missing"
    | "cover-invalid"
    | "ratio-invalid"
    | "model-missing"
    | "duplicate-clip";

export type VideoConcatIssue = {
    code: VideoConcatIssueCode;
    /** 对应 registry 字段，便于“缺哪个字段”审计 */
    field: string;
    message: string;
    clipId?: string;
};

/** 逐文件校验：MP4/MOV/WebM、≤100MB、0.5s–5min（页面规格 §2）。 */
export function checkVideoConcatClipSource(source: {
    name?: string;
    mimeType?: string;
    bytes?: number;
    durationMs?: number;
}): { code: VideoConcatIssueCode; message: string } | null {
    const name = source.name ?? "该文件";
    const mime = normalizeMime(source.mimeType);
    if (!(VIDEO_CONCAT_SOURCE_RULE.mimeTypes as readonly string[]).includes(mime)) {
        return { code: "clip-mime", message: `${name} 不是受支持的视频格式（仅 MP4 / MOV / WebM）` };
    }
    const bytes = Number(source.bytes ?? 0);
    if (bytes > VIDEO_CONCAT_SOURCE_RULE.maxBytes) {
        const limitMb = Math.round(VIDEO_CONCAT_SOURCE_RULE.maxBytes / (1024 * 1024));
        return { code: "clip-too-large", message: `${name} 超过 ${limitMb}MB，请先压缩或剪短` };
    }
    if (typeof source.durationMs === "number" && source.durationMs > 0) {
        if (source.durationMs < VIDEO_CONCAT_SOURCE_RULE.minClipMs) {
            return { code: "clip-too-short", message: `${name} 短于 0.5 秒，拼接无意义` };
        }
        if (source.durationMs > VIDEO_CONCAT_SOURCE_RULE.maxClipMs) {
            return { code: "clip-too-long", message: `${name} 超过 5 分钟，请先分割` };
        }
    }
    return null;
}

/**
 * 目录级校验：返回所有真实阻断项（不是“能否点按钮”的猜测）。
 * clips 为空、只有一段、时长未知、裁剪非法、缺封面、缺模型都会各给一条。
 */
export function validateVideoConcatState(input: {
    state: VideoConcatState;
    model?: string;
}): VideoConcatIssue[] {
    const { state } = input;
    const issues: VideoConcatIssue[] = [];
    const model = (input.model ?? "").trim();

    if (state.clips.length === 0) {
        issues.push({ code: "no-clips", field: "videoList", message: "至少需要 2 段视频，当前还没有片段" });
    } else if (state.clips.length < VIDEO_CONCAT_MIN_CLIPS) {
        issues.push({
            code: "too-few-clips",
            field: "videoList",
            message: `至少需要 ${VIDEO_CONCAT_MIN_CLIPS} 段视频，当前只有 ${state.clips.length} 段`,
        });
    }
    if (state.clips.length > VIDEO_CONCAT_MAX_CLIPS) {
        issues.push({
            code: "too-many-clips",
            field: "videoList",
            message: `片段最多 ${VIDEO_CONCAT_MAX_CLIPS} 段，当前 ${state.clips.length} 段`,
        });
    }

    const seen = new Set<string>();
    for (const clip of state.clips) {
        if (seen.has(clip.assetId)) {
            issues.push({ code: "duplicate-clip", field: "videoList", message: `片段「${clip.name}」重复添加了两次`, clipId: clip.id });
        }
        seen.add(clip.assetId);

        const sourceIssue = checkVideoConcatClipSource({
            name: clip.name,
            mimeType: clip.mimeType,
            bytes: clip.bytes,
            durationMs: clip.durationMs || undefined,
        });
        if (sourceIssue) issues.push({ ...sourceIssue, field: "videoList", clipId: clip.id });

        if (!clip.durationMs) {
            issues.push({
                code: "clip-duration-unknown",
                field: "videoList",
                message: `没能读到「${clip.name}」的真实时长，无法确认裁剪区间，本页不会用猜测值提交`,
                clipId: clip.id,
            });
        } else if (videoConcatClipMs(clip) < VIDEO_CONCAT_TRIM_MIN_MS) {
            issues.push({
                code: "clip-trim-invalid",
                field: "videoList",
                message: `「${clip.name}」裁剪后不足 0.3 秒`,
                clipId: clip.id,
            });
        }
    }

    if (!state.cover) {
        issues.push({ code: "cover-missing", field: "videoCoverUrl", message: "还没有封面：请上传封面图或从片段抓取一帧" });
    } else if (!state.cover.url) {
        issues.push({ code: "cover-invalid", field: "videoCoverUrl", message: "封面地址为空，无法提交" });
    } else if (state.cover.mimeType && !isVideoConcatCoverMime(state.cover.mimeType)) {
        issues.push({
            code: "cover-invalid",
            field: "videoCoverUrl",
            message: `封面必须是图片（仅 PNG / JPG / WebP），当前是 ${state.cover.mimeType}，请重新抓帧或换图`,
        });
    }

    if (!VIDEO_CONCAT_RATIOS.some((ratio) => ratio.value === state.videoRatio)) {
        issues.push({ code: "ratio-invalid", field: "videoRatio", message: `不支持的输出比例：${state.videoRatio}` });
    }

    if (!model) {
        issues.push({ code: "model-missing", field: "editType", message: "未选择视频模型" });
    }

    return issues;
}

/** 页面顶部的产物文案：真实的段数与秒数，而不是“预计”。 */
export function videoConcatOutputLabel(state: VideoConcatState): string {
    const seconds = effectiveVideoConcatSeconds({ videoTime: state.videoTime, clips: state.clips });
    if (!state.clips.length) return "未添加片段";
    if (seconds <= 0) return `${state.clips.length} 段 · 时长未知`;
    return `${state.clips.length} 段 → ${seconds}s · ${state.videoRatio}`;
}

/* ============================ 隐藏提示词 ============================ */

/**
 * 交给 provider 的确定性指令：把片段顺序/裁剪区间/比例/时长/封面说清楚。
 * 视频服务只吃 prompt，因此这些页内事实必须显式写进 prompt，不能“静默丢参”。
 */
export function buildVideoConcatPrompt(input: { state: VideoConcatState; coverNote?: string }): string {
    const { state } = input;
    const seconds = effectiveVideoConcatSeconds({ videoTime: state.videoTime, clips: state.clips });
    const lines = [
        `把 ${state.clips.length} 段参考视频按给定顺序首尾拼成 1 条连续视频，${state.videoRatio} 画幅，目标时长 ${seconds || "未知"} 秒。`,
    ];
    state.clips.forEach((clip, index) => {
        const ms = videoConcatClipMs(clip);
        lines.push(
            `片段 ${index + 1}：${clip.name}，取 ${formatVideoConcatDuration(clip.startMs)}–${formatVideoConcatDuration(clip.endMs)}（有效 ${formatVideoConcatDuration(ms)}）。`,
        );
    });
    lines.push("衔接处保持原始节奏，不加转场特效、不加字幕、不改画面内容与声音。");
    if (input.coverNote) lines.push(`封面：${input.coverNote}。`);
    return lines.join("\n");
}

/* ============================== 快照 ============================== */

export type VideoConcatSnapshot = {
    toolId: typeof VIDEO_CONCAT_TOOL_ID;
    draftRevision: number | null;
    clientOperationId: string;
    model: string;
    editType: VideoConcatEditType;
    videoRatio: string;
    videoTime: number;
    clips: { assetId: string; startMs: number; endMs: number; durationMs: number }[];
    coverUrl: string;
    coverSource: VideoConcatCoverSource | null;
    prompt: string;
};

export function createVideoConcatSnapshot(input: {
    state: VideoConcatState;
    model: string;
    draftRevision?: number | null;
    clientOperationId: string;
    prompt?: string;
}): VideoConcatSnapshot {
    const { state } = input;
    return {
        toolId: VIDEO_CONCAT_TOOL_ID,
        draftRevision: input.draftRevision ?? null,
        clientOperationId: input.clientOperationId,
        model: input.model.trim(),
        editType: state.editType,
        videoRatio: state.videoRatio,
        videoTime: effectiveVideoConcatSeconds({ videoTime: state.videoTime, clips: state.clips }),
        clips: state.clips.map((clip) => ({
            assetId: clip.assetId,
            startMs: clip.startMs,
            endMs: clip.endMs,
            durationMs: clip.durationMs,
        })),
        coverUrl: state.cover?.url ?? "",
        coverSource: state.cover?.source ?? null,
        prompt: input.prompt ?? buildVideoConcatPrompt({ state }),
    };
}

function snapshotSignature(snapshot: VideoConcatSnapshot): string {
    return JSON.stringify([
        snapshot.model,
        snapshot.editType,
        snapshot.videoRatio,
        snapshot.videoTime,
        snapshot.coverUrl,
        snapshot.coverSource,
        snapshot.clips,
    ]);
}

/** 结果是否来自“另一个版本的输入”：模型/比例/时长/裁剪/封面任何一个变了都算过期。 */
export function isVideoConcatSnapshotStale(snapshot: VideoConcatSnapshot, current: VideoConcatSnapshot): boolean {
    return snapshotSignature(snapshot) !== snapshotSignature(current);
}

/* ============================== 草稿 ============================== */

const draftClipSchema = z.object({
    assetId: z.string().min(1),
    startMs: z.number().nonnegative(),
    endMs: z.number().nonnegative(),
});

const draftSchema = z.object({
    editType: z.literal(VIDEO_CONCAT_EDIT_TYPE).optional(),
    videoRatio: z.string().min(1).optional(),
    videoTime: z.union([z.literal("auto"), z.number().int().positive()]).optional(),
    clips: z.array(draftClipSchema).optional(),
    coverSource: z.union([z.literal("upload"), z.literal("frame")]).optional(),
});

export type VideoConcatDraftValues = {
    editType: VideoConcatEditType;
    videoRatio: string;
    videoTime: VideoConcatDuration;
    /** 只保存稳定事实：裁剪区间按资产 id 对齐，刷新后由资产索引还原 url/时长 */
    trims: { assetId: string; startMs: number; endMs: number }[];
    coverSource: VideoConcatCoverSource | null;
};

export function serializeVideoConcatDraftValues(state: VideoConcatState): VideoConcatDraftValues {
    return {
        editType: VIDEO_CONCAT_EDIT_TYPE,
        videoRatio: state.videoRatio,
        videoTime: state.videoTime,
        trims: state.clips.map((clip) => ({ assetId: clip.assetId, startMs: clip.startMs, endMs: clip.endMs })),
        coverSource: state.cover?.source ?? null,
    };
}

/** 解析草稿：结构不对就整体丢弃（返回 null），不做“尽量修补”的假恢复。 */
export function parseVideoConcatDraftValues(raw: unknown): VideoConcatDraftValues | null {
    const parsed = draftSchema.safeParse(raw);
    if (!parsed.success) return null;
    const value = parsed.data;
    const ratio = value.videoRatio && VIDEO_CONCAT_RATIOS.some((item) => item.value === value.videoRatio)
        ? value.videoRatio
        : VIDEO_CONCAT_DEFAULT_RATIO;
    const videoTime = VIDEO_CONCAT_DURATIONS.includes(value.videoTime as VideoConcatDuration)
        ? (value.videoTime as VideoConcatDuration)
        : "auto";
    return {
        editType: VIDEO_CONCAT_EDIT_TYPE,
        videoRatio: ratio,
        videoTime,
        trims: (value.clips ?? []).map((clip) => ({ assetId: clip.assetId, startMs: clip.startMs, endMs: clip.endMs })),
        coverSource: value.coverSource ?? null,
    };
}

/** 用草稿里的裁剪区间对齐真实片段：时长以真实 metadata 为准，草稿只提供“想剪哪里”。 */
export function applyVideoConcatDraft(clips: readonly VideoConcatClip[], draft: VideoConcatDraftValues | null): VideoConcatClip[] {
    if (!draft) return clips.map((clip) => normalizeVideoConcatClip(clip));
    const trims = new Map(draft.trims.map((trim) => [trim.assetId, trim]));
    return clips.map((clip) => {
        const trim = trims.get(clip.assetId);
        return trim ? trimVideoConcatClip(clip, { startMs: trim.startMs, endMs: trim.endMs }) : normalizeVideoConcatClip(clip);
    });
}

/* ============================ 能力需求 ============================ */

/**
 * 本页对 provider 的硬能力需求（由 adapter 用真实 apiFormat 证据来评估）：
 * - referenceVideo：必须能把视频作为参考素材上传（否则无片段可拼）；
 * - multiReference：必须支持一次提交多段视频（gemini 只取 videos[0]，会静默丢片段 → 阻断）；
 * - aspectRatio / duration：输出比例与时长必须可指定。
 * 证据缺省一律按 unknown（unverified）处理，禁止“默认支持”。
 */
export const VIDEO_CONCAT_CAPABILITY_REQUIREMENTS = [
    { key: "referenceVideo" as const, required: true, label: "多段视频输入", note: "拼接必须把每段视频真实上传给 provider" },
    { key: "multiReference" as const, required: true, label: "多路素材（≥2）", note: "只接受 1 段视频的通道会把其余片段丢掉" },
    { key: "aspectRatio" as const, required: true, label: "画幅比例", note: "输出比例决定成片画幅" },
    { key: "duration" as const, required: true, label: "时长设置", note: "拼接结果需要指定目标时长" },
];

export const VIDEO_CONCAT_FIELD_ORDER = [
    "videoList",
    "videoCoverUrl",
    "imageUrl",
    "imageWidth",
    "imageHeight",
    "imageFormat",
    "imageSize",
    "videoRatio",
    "videoTime",
    "editType",
] as const;

export function getVideoConcatSpec(): ToolSpec | undefined {
    return getToolById(VIDEO_CONCAT_TOOL_ID);
}

/* ============================== 工具函数 ============================== */

function clampNumber(value: number | undefined, min: number, max: number): number {
    const numeric = Number.isFinite(value) ? (value as number) : min;
    return Math.min(Math.max(numeric, min), max);
}

function normalizeMime(mimeType?: string): string {
    const value = (mimeType ?? "").trim().toLowerCase();
    if (value === "video/quicktime" || value === "video/mov" || value === "video/x-quicktime") return "video/quicktime";
    if (value === "video/webm") return "video/webm";
    if (value === "video/mp4" || value === "video/x-m4v") return "video/mp4";
    return value;
}
