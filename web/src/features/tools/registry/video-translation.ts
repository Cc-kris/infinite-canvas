import { z } from "zod";

import { getToolById } from "./index";
import type { ToolSpec } from "../types";

/**
 * TASK-045：VIDEO_TRANSLATION（视频翻译，makeType 96）——“页面”这一层的事实来源。
 *
 * 证据（只读，不搬 LinkFox 前端代码）：
 * - docs/V1.0/plan_linkfox_navigation/page-specs/38-video-translation.md
 * - docs/V1.0/plan_linkfox_navigation/evidence/page-dom-20261028/VIDEO_TRANSLATION.json
 *   实测文案：原视频 / 本地上传 / 作品选择 / 支持 MP4、MOV 格式，100MB 以内 /
 *   建议上传画面清晰、音频完整的视频（2-30 秒）/ 模式选择 / 高级模式 /
 *   需要翻译的语言 → 英语 / 口型同步默认开启 / 立即生成 / 生成结果 /
 *   上传原始视频 / 翻译结果 / 一键做同款
 * - registry/index.ts#VIDEO_TRANSLATION 的 7 个字段：
 *   lipSync、outputNum、sourceLanguage、sourceVideoName、sourceVideoUrl、
 *   targetLanguage、videoType（provider 侧一律必传，缺一不可）
 *
 * 本文件只放“页面事实 + 纯函数”；真实请求在 adapters/video-translation.ts。
 */

export const VIDEO_TRANSLATION_TOOL_ID = "VIDEO_TRANSLATION";
export const VIDEO_TRANSLATION_ROUTE = "/tools/ai-video/video-translation";
export const VIDEO_TRANSLATION_DRAFT_KEY = `tool-draft:v1:${VIDEO_TRANSLATION_TOOL_ID}`;

/** 原站实测：「支持 MP4、MOV 格式，100MB 以内」「建议…（2-30 秒）」。 */
export const VIDEO_TRANSLATION_SOURCE_RULE = {
    mimeTypes: ["video/mp4", "video/quicktime"] as const,
    maxBytes: 100 * 1024 * 1024,
    minBytes: 1,
    minDurationMs: 2_000,
    maxDurationMs: 30_000,
    minSeconds: 2,
    maxSeconds: 30,
    recommended: "2–30 秒",
} as const;

/** 页面上「输出数量」的可选项；上游一次只返回 1 条视频（见 adapter 能力检查）。 */
export const VIDEO_TRANSLATION_OUTPUT_OPTIONS = [1, 2, 3, 4] as const;
export const VIDEO_TRANSLATION_SUPPORTED_OUTPUT = 1;
export const VIDEO_TRANSLATION_DEFAULT_OUTPUT = 1;

/** 页面「模式选择 / 高级模式」。 */
export type VideoTranslationMode = "standard" | "advanced";
export const VIDEO_TRANSLATION_MODES: ReadonlyArray<{ id: VideoTranslationMode; label: string; hint: string }> = [
    { id: "standard", label: "标准翻译", hint: "识别源语言 → 译为目标语言，默认开启口型同步" },
    { id: "advanced", label: "高级模式", hint: "可调整输出数量与翻译类型" },
];

/** videoType 属于 model-catalog 枚举；未拿到目录时沿用页面唯一的「视频翻译」。 */
export type VideoTranslationOption = { id: string; label: string };
export const VIDEO_TRANSLATION_VIDEO_TYPES: readonly VideoTranslationOption[] = [
    { id: "video-translation", label: "视频翻译" },
];

export type VideoTranslationLanguage = { id: string; label: string; native: string };

/**
 * 语言目录（enumSource = model-catalog，可由真实渠道目录覆盖）。
 * 页面只实测到「英语」；其余为常用目标语言，界面标注来源，不冒充实测值。
 */
export const VIDEO_TRANSLATION_LANGUAGES: readonly VideoTranslationLanguage[] = [
    { id: "en", label: "英语", native: "English" },
    { id: "zh", label: "简体中文", native: "简体中文" },
    { id: "ja", label: "日语", native: "日本語" },
    { id: "ko", label: "韩语", native: "한국어" },
    { id: "es", label: "西班牙语", native: "Español" },
    { id: "pt", label: "葡萄牙语", native: "Português" },
    { id: "fr", label: "法语", native: "Français" },
    { id: "de", label: "德语", native: "Deutsch" },
    { id: "it", label: "意大利语", native: "Italiano" },
    { id: "ru", label: "俄语", native: "Русский" },
    { id: "ar", label: "阿拉伯语", native: "العربية" },
    { id: "th", label: "泰语", native: "ไทย" },
    { id: "vi", label: "越南语", native: "Tiếng Việt" },
    { id: "id", label: "印尼语", native: "Bahasa Indonesia" },
    { id: "tr", label: "土耳其语", native: "Türkçe" },
    { id: "hi", label: "印地语", native: "हिन्दी" },
];

/** 页面文案：「智能识别源语言」——源语言默认自动识别，也可显式指定。 */
export const VIDEO_TRANSLATION_AUTO_SOURCE: VideoTranslationLanguage = { id: "auto", label: "自动识别", native: "Auto" };
export const VIDEO_TRANSLATION_DEFAULT_TARGET = "en";

export type VideoTranslationCatalog = {
    languages: readonly VideoTranslationLanguage[];
    videoTypes: readonly VideoTranslationOption[];
};

export function resolveVideoTranslationCatalog(overrides?: Partial<VideoTranslationCatalog> | null): VideoTranslationCatalog {
    return {
        languages: overrides?.languages?.length ? overrides.languages : VIDEO_TRANSLATION_LANGUAGES,
        videoTypes: overrides?.videoTypes?.length ? overrides.videoTypes : VIDEO_TRANSLATION_VIDEO_TYPES,
    };
}

export function videoTranslationOptionLabel(options: readonly VideoTranslationOption[], id: string): string {
    return options.find((item) => item.id === id)?.label ?? "";
}

export function videoTranslationLanguageLabel(
    id: string,
    catalog: VideoTranslationCatalog = resolveVideoTranslationCatalog(),
): string {
    if (id === VIDEO_TRANSLATION_AUTO_SOURCE.id) return VIDEO_TRANSLATION_AUTO_SOURCE.label;
    const found = catalog.languages.find((item) => item.id === id);
    return found ? `${found.label}（${found.native}）` : "";
}

export function videoTranslationSourceOptions(
    catalog: VideoTranslationCatalog = resolveVideoTranslationCatalog(),
): readonly VideoTranslationLanguage[] {
    return [VIDEO_TRANSLATION_AUTO_SOURCE, ...catalog.languages];
}

/** 目标语言不能等于显式指定的源语言；自动识别时不限制。 */
export function videoTranslationTargetOptions(
    sourceLanguage: string,
    catalog: VideoTranslationCatalog = resolveVideoTranslationCatalog(),
): readonly VideoTranslationLanguage[] {
    return catalog.languages.filter((item) => item.id !== sourceLanguage);
}

export function normalizeVideoTranslationMode(value: unknown): VideoTranslationMode {
    return value === "advanced" ? "advanced" : "standard";
}

export function normalizeVideoTranslationOutput(value: unknown): number {
    const parsed = Math.floor(Math.abs(Number(value ?? VIDEO_TRANSLATION_DEFAULT_OUTPUT)));
    if (!Number.isFinite(parsed) || parsed < 1) return VIDEO_TRANSLATION_DEFAULT_OUTPUT;
    return Math.min(parsed, Math.max(...VIDEO_TRANSLATION_OUTPUT_OPTIONS));
}

/* ============================== 页面取值 ============================== */

export type VideoTranslationValues = {
    /** 源语言：auto（智能识别）或显式语言 id */
    sourceLanguage: string;
    /** 需要翻译的语言（页面默认「英语」） */
    targetLanguage: string;
    /** 口型同步：页面实测「默认开启」 */
    lipSync: boolean;
    /** 输出数量：上游一次只回 1 条，>1 会被能力检查拦下，不静默丢参 */
    outputNum: number;
    /** 标准 / 高级模式 */
    mode: VideoTranslationMode;
    /** videoType（model-catalog 枚举；未接入目录时只有 video-translation） */
    videoType: string;
    /** 原视频资产（ToolAssetInput 真实上传后写入） */
    sourceVideoAssetId: string;
    sourceVideoName: string;
    sourceVideoUrl: string;
    sourceVideoDurationMs: number;
};

export function createVideoTranslationValues(patch: Partial<VideoTranslationValues> = {}): VideoTranslationValues {
    const base: VideoTranslationValues = {
        sourceLanguage: VIDEO_TRANSLATION_AUTO_SOURCE.id,
        targetLanguage: VIDEO_TRANSLATION_DEFAULT_TARGET,
        lipSync: true,
        outputNum: VIDEO_TRANSLATION_DEFAULT_OUTPUT,
        mode: "standard",
        videoType: VIDEO_TRANSLATION_VIDEO_TYPES[0].id,
        sourceVideoAssetId: "",
        sourceVideoName: "",
        sourceVideoUrl: "",
        sourceVideoDurationMs: 0,
    };
    const merged = { ...base, ...patch };
    merged.outputNum = normalizeVideoTranslationOutput(merged.outputNum);
    merged.mode = normalizeVideoTranslationMode(merged.mode);
    if (merged.sourceLanguage !== VIDEO_TRANSLATION_AUTO_SOURCE.id && merged.sourceLanguage === merged.targetLanguage) {
        // 显式源语言与目标语言相同 → 没有可翻译内容，退回自动识别，避免提交空任务。
        merged.sourceLanguage = VIDEO_TRANSLATION_AUTO_SOURCE.id;
    }
    return merged;
}

/** 切换源语言时同步修正目标语言，返回是否触发了联动。 */
export function applyVideoTranslationSource(
    values: VideoTranslationValues,
    sourceLanguage: string,
    catalog: VideoTranslationCatalog = resolveVideoTranslationCatalog(),
): { values: VideoTranslationValues; targetChanged: boolean } {
    const known = videoTranslationSourceOptions(catalog).some((item) => item.id === sourceLanguage);
    const nextSource = known ? sourceLanguage : VIDEO_TRANSLATION_AUTO_SOURCE.id;
    const conflict = nextSource !== VIDEO_TRANSLATION_AUTO_SOURCE.id && nextSource === values.targetLanguage;
    if (!conflict) return { values: { ...values, sourceLanguage: nextSource }, targetChanged: false };
    const fallback = catalog.languages.find((item) => item.id !== nextSource);
    return {
        values: { ...values, sourceLanguage: nextSource, targetLanguage: fallback?.id ?? values.targetLanguage },
        targetChanged: Boolean(fallback),
    };
}

/* ============================== 草稿读写 ============================== */

export function serializeVideoTranslationDraftValues(values: VideoTranslationValues): Record<string, unknown> {
    return {
        sourceLanguage: values.sourceLanguage,
        targetLanguage: values.targetLanguage,
        lipSync: values.lipSync,
        outputNum: values.outputNum,
        mode: values.mode,
        videoType: values.videoType,
        sourceVideoName: values.sourceVideoName,
        sourceVideoDurationMs: values.sourceVideoDurationMs,
    };
}

const draftValuesSchema = z.object({
    sourceLanguage: z.string().optional(),
    targetLanguage: z.string().optional(),
    lipSync: z.boolean().optional(),
    outputNum: z.number().optional(),
    mode: z.string().optional(),
    videoType: z.string().optional(),
    sourceVideoName: z.string().optional(),
    sourceVideoDurationMs: z.number().optional(),
});

/** 草稿只恢复“可安全重放”的配置；资产 id 由 draft.assetIds 单独恢复。 */
export function parseVideoTranslationDraftValues(
    raw: Record<string, unknown> | null | undefined,
    catalog: VideoTranslationCatalog = resolveVideoTranslationCatalog(),
): VideoTranslationValues {
    const parsed = draftValuesSchema.safeParse(raw ?? {});
    const data = parsed.success ? parsed.data : {};
    const known = catalog.languages.some((item) => item.id === data.targetLanguage);
    const videoTypes = catalog.videoTypes.some((item) => item.id === data.videoType);
    return createVideoTranslationValues({
        sourceLanguage: data.sourceLanguage ?? VIDEO_TRANSLATION_AUTO_SOURCE.id,
        targetLanguage: known ? (data.targetLanguage as string) : VIDEO_TRANSLATION_DEFAULT_TARGET,
        lipSync: data.lipSync ?? true,
        outputNum: data.outputNum ?? VIDEO_TRANSLATION_DEFAULT_OUTPUT,
        mode: normalizeVideoTranslationMode(data.mode),
        videoType: videoTypes ? (data.videoType as string) : catalog.videoTypes[0].id,
        sourceVideoName: data.sourceVideoName ?? "",
        sourceVideoDurationMs: typeof data.sourceVideoDurationMs === "number" ? data.sourceVideoDurationMs : 0,
    });
}

/* ============================== 快照与指纹 ============================== */

export type VideoTranslationSnapshot = {
    /** 提交时的页面取值（用于「查看本次输入」与旧结果比对） */
    values: VideoTranslationValues;
    /** 提交时的语言/类型展示文案，避免目录后续变化导致结果无法解释 */
    labels: { source: string; target: string; videoType: string };
    capturedAt: number;
    /** 稳定片段哈希：配置改了就与结果不匹配 */
    hash: string;
};

export function createVideoTranslationSnapshot(
    values: VideoTranslationValues,
    catalog: VideoTranslationCatalog = resolveVideoTranslationCatalog(),
    capturedAt: number = Date.now(),
): VideoTranslationSnapshot {
    return {
        values: { ...values },
        labels: {
            source: videoTranslationLanguageLabel(values.sourceLanguage, catalog),
            target: videoTranslationLanguageLabel(values.targetLanguage, catalog),
            videoType: videoTranslationOptionLabel(catalog.videoTypes, values.videoType),
        },
        capturedAt,
        hash: hashVideoTranslationParts(videoTranslationStableParts(values)),
    };
}

/** 配置快照的稳定片段：只放影响产出的字段，不含时间戳/操作号。 */
export function videoTranslationStableParts(values: VideoTranslationValues): string[] {
    return [
        values.sourceLanguage,
        values.targetLanguage,
        String(values.lipSync),
        String(normalizeVideoTranslationOutput(values.outputNum)),
        values.mode,
        values.videoType,
        values.sourceVideoAssetId,
        values.sourceVideoName,
        values.sourceVideoUrl,
    ];
}

/** FNV-1a（与 video-replication / ai-text 同算法，无额外依赖）。 */
export function hashVideoTranslationParts(parts: readonly string[]): string {
    const joined = parts.join("|");
    let hash = 2166136261;
    for (let index = 0; index < joined.length; index += 1) {
        hash ^= joined.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

export function videoTranslationFingerprint(
    values: VideoTranslationValues,
    catalog: VideoTranslationCatalog = resolveVideoTranslationCatalog(),
): string {
    return createVideoTranslationSnapshot(values, catalog, 0).hash;
}

/** 当前配置是否已经不是产生该结果时的配置。 */
export function isVideoTranslationSnapshotStale(
    snapshot: VideoTranslationSnapshot | null | undefined,
    current: VideoTranslationSnapshot | null | undefined,
): boolean {
    if (!snapshot || !current) return false;
    return snapshot.hash !== current.hash;
}

/* ============================== 展示与规格 ============================== */

export function videoTranslationOutputLabel(values: VideoTranslationValues): string {
    return `${normalizeVideoTranslationOutput(values.outputNum)} 条视频`;
}

export function videoTranslationSummary(
    values: VideoTranslationValues,
    catalog: VideoTranslationCatalog = resolveVideoTranslationCatalog(),
): string {
    const source = videoTranslationLanguageLabel(values.sourceLanguage, catalog) || values.sourceLanguage;
    const target = videoTranslationLanguageLabel(values.targetLanguage, catalog) || values.targetLanguage;
    return `${source} → ${target} · 口型同步${values.lipSync ? "开" : "关"} · ${videoTranslationOutputLabel(values)}`;
}

export function getVideoTranslationSpec(): ToolSpec | undefined {
    return getToolById(VIDEO_TRANSLATION_TOOL_ID);
}

/** 供 adapter 与页面共用：字段顺序与 registry 声明一致。 */
export const VIDEO_TRANSLATION_FIELD_ORDER = [
    "lipSync",
    "outputNum",
    "sourceLanguage",
    "sourceVideoName",
    "sourceVideoUrl",
    "targetLanguage",
    "videoType",
] as const;
