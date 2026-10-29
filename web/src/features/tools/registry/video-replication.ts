import { z } from "zod";

/**
 * TASK-043：VIDEO_REPLICATION（视频复刻）页面契约。
 *
 * 事实来源：
 * - docs/V1.0/plan_linkfox_navigation/page-specs/36-video-replication.md
 * - docs/V1.0/plan_linkfox_navigation/evidence/page-dom-20261028/VIDEO_REPLICATION.json（原站真实控件）
 * - web/src/features/tools/registry/index.ts（layout=video、adapter=video、makeType=89）
 * - web/src/services/api/tools/gateway.ts（TOOL_ADAPTER_TABLE.VIDEO_REPLICATION 的 27 个字段）
 *
 * 证据边界：只有 DOM 上真实出现的枚举进入默认目录（比例 6 个、时长 Auto/5/10/15、
 * 分辨率 480P/720P、销售国家/地区 US(美国)、目标语言 英语、视频类型取自页面文案
 * 「一键生成带货口播视频」）。外部目录（`resolveVideoReplicationCatalog`）可注入更多选项，
 * 未加载/不在目录内的取值一律拦在提交前，绝不猜枚举。
 */

export const VIDEO_REPLICATION_TOOL_ID = "VIDEO_REPLICATION";
export const VIDEO_REPLICATION_ROUTE = "/tools/ai-video/video-replication";
export const VIDEO_REPLICATION_SOURCE_URL = "https://www.linkfox.com/draw/video-replication";

export const VIDEO_REPLICATION_VIDEO_LIMITS = {
    /** 原站文案：支持MP4/MOV格式，100M以内 */
    mimeTypes: ["video/mp4", "video/quicktime"] as const,
    maxBytes: 100 * 1024 * 1024,
    clipMinSeconds: 5,
    clipMaxSeconds: 30,
    /** 原站「Auto（15秒）」：没有可跟随的片段时按 15 秒 */
    autoSeconds: 15,
} as const;

export const VIDEO_REPLICATION_REFERENCE_LIMITS = {
    /** 原站文案：支持上传6张图，10M以内，384*384 ~ 4096*4096，宽高比 0.4～2.5（含边界） */
    maxCount: 6,
    maxBytes: 10 * 1024 * 1024,
    minSide: 384,
    maxSide: 4096,
    minAspect: 0.4,
    maxAspect: 2.5,
} as const;

/** 提示词/脚本输入上限（field_schema：TextArea 1–4000 字）。 */
export const VIDEO_REPLICATION_PROMPT_LIMIT = 4000;

export const VIDEO_REPLICATION_RESOLUTIONS = [
    { id: "480P", label: "480P" },
    { id: "720P", label: "720P" },
] as const;

export const VIDEO_REPLICATION_DURATIONS = [
    { id: "auto", label: "Auto（15秒）", hint: "跟随参考片段" },
    { id: "5", label: "5", hint: "5 秒" },
    { id: "10", label: "10", hint: "10 秒" },
    { id: "15", label: "15", hint: "15 秒" },
] as const;

export const VIDEO_REPLICATION_RATIOS = ["9:16", "16:9", "1:1", "3:4", "4:3", "21:9"] as const;

export type VideoReplicationOption = { id: string; label: string; hint?: string };
export type VideoReplicationCountry = VideoReplicationOption & { language: string };

export const VIDEO_REPLICATION_COUNTRIES: readonly VideoReplicationCountry[] = [
    { id: "US", label: "US(美国)", language: "en" },
];

export const VIDEO_REPLICATION_LANGUAGES: readonly VideoReplicationOption[] = [{ id: "en", label: "英语" }];

/** 页面产物形态：原站文案「一键生成带货口播视频」。 */
export const VIDEO_REPLICATION_VIDEO_TYPES: readonly VideoReplicationOption[] = [
    { id: "product-talking-head", label: "带货口播" },
];

/* ============================== 目录解析 ============================== */

export type VideoReplicationCatalog = {
    countries: readonly VideoReplicationCountry[];
    languages: readonly VideoReplicationOption[];
    videoTypes: readonly VideoReplicationOption[];
};

/**
 * 目录优先级：外部（模型/服务端目录）覆盖页面证据目录；两者都没有时该控件禁用，
 * 由 `validateVideoReplicationState` 报 `*-unavailable`，不允许提交猜出来的枚举。
 */
export function resolveVideoReplicationCatalog(overrides: Partial<VideoReplicationCatalog> = {}): VideoReplicationCatalog {
    const merge = (base: readonly VideoReplicationOption[], extra?: readonly VideoReplicationOption[]) => {
        if (!extra?.length) return base;
        const merged = new Map(base.map((item) => [item.id, item]));
        for (const item of extra) merged.set(item.id, item);
        return Array.from(merged.values());
    };
    return {
        countries: (overrides.countries?.length ? overrides.countries : VIDEO_REPLICATION_COUNTRIES) as readonly VideoReplicationCountry[],
        languages: merge(VIDEO_REPLICATION_LANGUAGES, overrides.languages),
        videoTypes: merge(VIDEO_REPLICATION_VIDEO_TYPES, overrides.videoTypes),
    };
}

export function optionLabel(options: readonly VideoReplicationOption[], id: string): string {
    return options.find((item) => item.id === id)?.label ?? "";
}

/* ============================== 页面取值 ============================== */

export type VideoReplicationSourceMode = "link" | "upload";
export type VideoReplicationClipMode = "auto" | "manual";
export type VideoReplicationAnalyzeMode = "auto" | "manual";

export type VideoReplicationValues = {
    /** 链接与上传互斥 */
    sourceMode: VideoReplicationSourceMode;
    /** TikTok 链接（页面「粘贴 TikTok 视频链接」） */
    videoLink: string;
    /** 上传后的参考视频资产 ID / 名称 / 原始时长（秒） */
    refVideoAssetId: string;
    refVideoName: string;
    sourceVideoDuration: number;
    clipMode: VideoReplicationClipMode;
    clipStart: number;
    clipEnd: number;
    /** 商品参考图（≤6，由 ToolAssetInput 真实上传） */
    refImageAssetIds: string[];
    /** AI 脚本分析（选填，默认自动） */
    analyzeMode: VideoReplicationAnalyzeMode;
    /** 服务端分析结果键；前端只读绑定，绝不手填 */
    analyzeRedisKey: string;
    /** 脚本/提示词（页面 TextArea，1–4000 字） */
    prompt: string;
    promptOptimizer: boolean;
    resolution: string;
    videoTime: string;
    ratio: string;
    saleCountry: string;
    targetLanguage: string;
    videoType: string;
    isPro: boolean;
};

export function createVideoReplicationValues(patch: Partial<VideoReplicationValues> = {}): VideoReplicationValues {
    return {
        sourceMode: "upload",
        videoLink: "",
        refVideoAssetId: "",
        refVideoName: "",
        sourceVideoDuration: 0,
        clipMode: "auto",
        clipStart: 0,
        clipEnd: 0,
        refImageAssetIds: [],
        analyzeMode: "auto",
        analyzeRedisKey: "",
        prompt: "",
        promptOptimizer: false,
        resolution: "720P",
        videoTime: "auto",
        ratio: "9:16",
        saleCountry: "US",
        targetLanguage: "en",
        videoType: VIDEO_REPLICATION_VIDEO_TYPES[0].id,
        isPro: false,
        ...patch,
    };
}

/* ============================== 片段截取 ============================== */

export type VideoReplicationClip = { start: number; end: number; seconds: number };

function roundTenth(value: number): number {
    return Math.round(value * 10) / 10;
}

function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

/**
 * 截取器规则：片段 5–30 秒。
 * - 有原始时长时端点收敛到 [0, duration]；
 * - 无原始时长（例如作品库资产还没读元数据）时按「起点 + 5 秒」给出可提交的最小片段，
 *   避免页面上显示一个永远不满足 5 秒的区间。
 */
export function normalizeVideoReplicationClip(start: number, end: number, durationSeconds = 0): VideoReplicationClip {
    const min = VIDEO_REPLICATION_VIDEO_LIMITS.clipMinSeconds;
    const max = VIDEO_REPLICATION_VIDEO_LIMITS.clipMaxSeconds;
    const total = durationSeconds > 0 ? durationSeconds : 0;
    const safeStart = roundTenth(clampNumber(Number(start), 0, total > 0 ? Math.max(0, total - min) : 3600));
    const safeEndRaw = roundTenth(clampNumber(Number(end), safeStart + min, total > 0 ? total : safeStart + max));
    const safeEnd = Math.min(safeEndRaw, safeStart + max);
    return { start: safeStart, end: safeEnd, seconds: roundTenth(safeEnd - safeStart) };
}

/** Auto 时长跟随参考片段：有合法片段就用片段长度，否则用原站默认 15 秒。 */
export function effectiveVideoReplicationSeconds(values: VideoReplicationValues): number {
    if (values.videoTime !== "auto") {
        const fixed = Number(values.videoTime);
        if (Number.isFinite(fixed) && fixed > 0) return Math.round(fixed);
    }
    const clip = normalizeVideoReplicationClip(values.clipStart, values.clipEnd, values.sourceVideoDuration);
    const usable = clip.seconds >= VIDEO_REPLICATION_VIDEO_LIMITS.clipMinSeconds && clip.seconds <= VIDEO_REPLICATION_VIDEO_LIMITS.clipMaxSeconds;
    return usable ? Math.round(clip.seconds) : VIDEO_REPLICATION_VIDEO_LIMITS.autoSeconds;
}

export function videoReplicationClipReady(values: VideoReplicationValues): boolean {
    const clip = normalizeVideoReplicationClip(values.clipStart, values.clipEnd, values.sourceVideoDuration);
    if (clip.seconds < VIDEO_REPLICATION_VIDEO_LIMITS.clipMinSeconds) return false;
    if (clip.seconds > VIDEO_REPLICATION_VIDEO_LIMITS.clipMaxSeconds) return false;
    if (values.sourceVideoDuration > 0 && clip.end > values.sourceVideoDuration + 0.05) return false;
    return clip.end > clip.start;
}

/* ============================== 校验 ============================== */

export type VideoReplicationIssue = {
    code: string;
    field: string;
    message: string;
};

export type VideoReplicationSourceState = {
    /** 上传/解析后的参考视频是否已可提交 */
    videoReady: boolean;
    /** 链接是否已由服务端解析出可用视频；当前没有解析服务时为 false */
    linkResolved: boolean;
    /** 商品参考图数量（真实上传记录数） */
    referenceCount: number;
    /** 参考图逐张校验失败原因 */
    referenceIssues?: readonly string[];
};

/** 逐项校验页面配置；任何一条存在即禁止提交（`no silent drop`，也不伪造成功）。 */
export function validateVideoReplicationState(
    values: VideoReplicationValues,
    source: VideoReplicationSourceState,
    catalog: VideoReplicationCatalog = resolveVideoReplicationCatalog(),
): VideoReplicationIssue[] {
    const issues: VideoReplicationIssue[] = [];

    if (values.sourceMode === "link") {
        const raw = values.videoLink.trim();
        if (!raw) {
            issues.push({ code: "link-missing", field: "videoLink", message: "请粘贴公网视频直链（http(s)://…）。" });
        } else if (!/^https?:\/\//i.test(raw) || /^(blob|data):/i.test(raw)) {
            issues.push({
                code: "link-invalid",
                field: "videoLink",
                message: "链接需是公网可访问的 http(s) 直链（本地 blob/data 地址上游拿不到）。",
            });
        } else if (/tiktok\.com|douyin\.com|kuaishou\.com/i.test(raw)) {
            issues.push({
                code: "link-unresolved",
                field: "videoLink",
                message: "分享页链接需要服务端解析，当前未接入；请填视频文件直链（.mp4/.mov）。",
            });
        }
    } else if (!source.videoReady) {
        issues.push({ code: "source-missing", field: "videoSource", message: "请先上传参考视频（MP4/MOV，100MB 以内）。" });
    }

    if (source.videoReady && !videoReplicationClipReady(values)) {
        issues.push({
            code: "clip-range",
            field: "clipStart",
            message: `参考片段需截取 ${VIDEO_REPLICATION_VIDEO_LIMITS.clipMinSeconds}–${VIDEO_REPLICATION_VIDEO_LIMITS.clipMaxSeconds} 秒。`,
        });
    }

    if (source.referenceCount < 1) {
        issues.push({ code: "references-missing", field: "refImageList", message: "请上传至少 1 张商品参考图。" });
    }
    if (source.referenceCount > VIDEO_REPLICATION_REFERENCE_LIMITS.maxCount) {
        issues.push({
            code: "references-overflow",
            field: "refImageList",
            message: `商品参考图最多 ${VIDEO_REPLICATION_REFERENCE_LIMITS.maxCount} 张。`,
        });
    }
    for (const message of source.referenceIssues ?? []) {
        issues.push({ code: "reference-invalid", field: "refImageList", message });
    }

    const prompt = values.prompt.trim();
    if (!prompt) {
        issues.push({ code: "prompt-missing", field: "prompt", message: "请填写口播脚本（或用 AI 脚本分析生成后校对）。" });
    } else if (prompt.length > VIDEO_REPLICATION_PROMPT_LIMIT) {
        issues.push({ code: "prompt-too-long", field: "prompt", message: `脚本最多 ${VIDEO_REPLICATION_PROMPT_LIMIT} 字。` });
    }

    if (!VIDEO_REPLICATION_RESOLUTIONS.some((item) => item.id === values.resolution)) {
        issues.push({ code: "resolution-unknown", field: "resolution", message: "视频分辨率不在支持列表中（480P/720P）。" });
    }
    if (!VIDEO_REPLICATION_DURATIONS.some((item) => item.id === values.videoTime)) {
        issues.push({ code: "duration-unknown", field: "videoTime", message: "视频时长不在支持列表中（Auto/5/10/15）。" });
    }
    if (!VIDEO_REPLICATION_RATIOS.includes(values.ratio as (typeof VIDEO_REPLICATION_RATIOS)[number])) {
        issues.push({ code: "ratio-unknown", field: "ratio", message: "视频比例不在支持列表中。" });
    }
    if (!catalog.countries.some((item) => item.id === values.saleCountry)) {
        issues.push({ code: "country-unknown", field: "saleCountry", message: "销售国家/地区不在当前目录中。" });
    }
    if (!catalog.languages.some((item) => item.id === values.targetLanguage)) {
        issues.push({ code: "language-unknown", field: "targetLanguage", message: "目标语言不在当前目录中。" });
    }
    if (!catalog.videoTypes.some((item) => item.id === values.videoType)) {
        issues.push({ code: "video-type-unknown", field: "videoType", message: "视频类型不在当前目录中。" });
    }

    return issues;
}

export function hasBlockingVideoReplicationIssue(issues: readonly VideoReplicationIssue[]): boolean {
    return issues.length > 0;
}

/* ============================== 提示词 ============================== */

function formatSeconds(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export type VideoReplicationPromptSegments = {
    script: string;
    clip: string;
    product: string;
    output: string;
    market: string;
    text: string;
};

/**
 * 把页面上的每一个参数都写进提示词——视频服务只吃 prompt，
 * 任何「只在 UI 上选中、没进 prompt」的选项都等于没生效。
 */
export function videoReplicationPromptSegments(
    values: VideoReplicationValues,
    catalog: VideoReplicationCatalog = resolveVideoReplicationCatalog(),
): VideoReplicationPromptSegments {
    const clip = normalizeVideoReplicationClip(values.clipStart, values.clipEnd, values.sourceVideoDuration);
    const seconds = effectiveVideoReplicationSeconds(values);
    const typeLabel = optionLabel(catalog.videoTypes, values.videoType);
    const languageLabel = optionLabel(catalog.languages, values.targetLanguage);
    const countryLabel = optionLabel(catalog.countries, values.saleCountry);

    const script = values.prompt.trim();
    const clipLine = `复刻参考视频第 ${formatSeconds(clip.start)}–${formatSeconds(clip.end)} 秒（共 ${formatSeconds(clip.seconds)} 秒）的镜头结构与节奏，商品主体保持稳定、不变形。`;
    const productLine = `商品参考图 ${values.refImageAssetIds.length} 张；视频类型：${typeLabel}。`;
    const outputLine = `输出比例：${values.ratio}；输出分辨率：${values.resolution}；输出时长：${seconds} 秒。`;
    const marketLine = `口播语言：${languageLabel}；销售国家/地区：${countryLabel}。`;

    const lines = [script, clipLine, productLine, outputLine, marketLine].filter((line) => line.length > 0);
    return { script, clip: clipLine, product: productLine, output: outputLine, market: marketLine, text: lines.join("\n") };
}

/**
 * 配置快照的稳定片段：只放会影响产出的字段（不含时间戳、客户端操作号），
 * 用于「切换配置后旧结果不能冒充当前配置结果」的比对。
 */
export function videoReplicationStableParts(values: VideoReplicationValues): string[] {
    const clip = normalizeVideoReplicationClip(values.clipStart, values.clipEnd, values.sourceVideoDuration);
    return [
        values.sourceMode,
        values.refVideoAssetId,
        `${formatSeconds(clip.start)}-${formatSeconds(clip.end)}`,
        values.refImageAssetIds.join(","),
        values.videoType,
        values.resolution,
        values.ratio,
        values.videoTime,
        String(effectiveVideoReplicationSeconds(values)),
        values.saleCountry,
        values.targetLanguage,
        String(values.isPro),
        String(values.promptOptimizer),
        values.prompt.trim(),
    ];
}

/** FNV-1a；与 ai-text 前置实现同算法，跨工具可比较且无额外依赖。 */
export function hashVideoReplicationParts(parts: readonly string[]): string {
    const joined = parts.join("|");
    let hash = 2166136261;
    for (let index = 0; index < joined.length; index += 1) {
        hash ^= joined.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

/** 配置是否仍是产生这个结果时的配置。 */
export function videoReplicationSnapshotMatches(current: VideoReplicationValues, producedParts: readonly string[]): boolean {
    return hashVideoReplicationParts(videoReplicationStableParts(current)) === hashVideoReplicationParts(producedParts);
}

/* ============================== 草稿持久化 ============================== */

/**
 * 草稿 schema：只持久化「用户填的东西」，源视频文件/图片本身走资产库，不塞进 localStorage。
 * 旧版本草稿字段缺失时给默认值，不让整份草稿因为一个新字段作废。
 */
export const videoReplicationDraftSchema = z.object({
    sourceMode: z.enum(["link", "upload"]).catch("upload"),
    videoLink: z.string().catch(""),
    refVideoAssetId: z.string().catch(""),
    refVideoName: z.string().catch(""),
    sourceVideoDuration: z.number().finite().nonnegative().catch(0),
    clipMode: z.enum(["auto", "manual"]).catch("auto"),
    clipStart: z.number().finite().nonnegative().catch(0),
    clipEnd: z.number().finite().nonnegative().catch(0),
    refImageAssetIds: z.array(z.string()).catch([]),
    analyzeMode: z.enum(["auto", "manual"]).catch("auto"),
    /** 服务端分析结果键：前端只读，草稿里保留以便重进页面能对上同一次分析 */
    analyzeRedisKey: z.string().catch(""),
    prompt: z.string().max(VIDEO_REPLICATION_PROMPT_LIMIT * 2).catch(""),
    promptOptimizer: z.boolean().catch(false),
    resolution: z.string().catch("720P"),
    videoTime: z.string().catch("auto"),
    ratio: z.string().catch("9:16"),
    saleCountry: z.string().catch(VIDEO_REPLICATION_COUNTRIES[0].id),
    targetLanguage: z.string().catch(VIDEO_REPLICATION_LANGUAGES[0].id),
    videoType: z.string().catch(VIDEO_REPLICATION_VIDEO_TYPES[0].id),
    isPro: z.boolean().catch(false),
});

/** 解析存下来的草稿；坏数据一律回落默认值，并保持类型完整。 */
export function parseVideoReplicationDraftValues(raw: unknown): VideoReplicationValues {
    const parsed = videoReplicationDraftSchema.safeParse(raw);
    return createVideoReplicationValues(parsed.success ? parsed.data : {});
}

/** 写草稿：与 schema 同构，避免存进无法再解析的东西。 */
export function serializeVideoReplicationDraftValues(values: VideoReplicationValues): Record<string, unknown> {
    return {
        ...values,
        prompt: values.prompt.slice(0, VIDEO_REPLICATION_PROMPT_LIMIT),
    };
}

/* ============================== 联动与展示 ============================== */

/** 换销售国家时同步口播语言（原站行为：国家 → 语言联动），语言目录里没有就保持原值。 */
export function applyVideoReplicationCountry(
    values: VideoReplicationValues,
    countryId: string,
    catalog: VideoReplicationCatalog = resolveVideoReplicationCatalog(),
): VideoReplicationValues {
    const country = catalog.countries.find((item) => item.id === countryId);
    if (!country) return values;
    const language = catalog.languages.some((item) => item.id === country.language)
        ? country.language
        : values.targetLanguage;
    return { ...values, saleCountry: country.id, targetLanguage: language };
}

/**
 * 本地脚本草稿模板（不冒充模型输出）：只按用户已选的国家/语言/视频类型/参考图数量
 * 拼一段可编辑的骨架，用户在文本框里自己改写。
 */
export function composeVideoReplicationScriptDraft(input: {
    values: VideoReplicationValues;
    catalog?: VideoReplicationCatalog;
}): string {
    const catalog = input.catalog ?? resolveVideoReplicationCatalog();
    const { values } = input;
    const country = optionLabel(catalog.countries, values.saleCountry);
    const language = optionLabel(catalog.languages, values.targetLanguage);
    const type = optionLabel(catalog.videoTypes, values.videoType);
    const seconds = effectiveVideoReplicationSeconds(values);
    const shots = values.refImageAssetIds.length;
    return [
        `【${type}·${country}·${language}·约 ${formatSeconds(seconds)} 秒】`,
        `1. 开场 0–2s：${shots > 0 ? "用参考图里的主体直接入镜" : "主体正面入镜"}，一句话点出核心卖点。`,
        `2. 中段：按参考视频的镜头节奏复刻动作与运镜，展示 ${shots > 0 ? `这 ${shots} 张参考图中的` : ""}产品细节。`,
        "3. 结尾：给出一句行动号召，画面停在与参考视频一致的收尾构图上。",
        "（以上为本地模板，未调用模型；按需改写后再生成。）",
    ].join("\n");
}

/** 提示词字数计数：文本框右上角 0/4000。 */
export function videoReplicationPromptCounter(values: VideoReplicationValues): { length: number; limit: number; over: boolean } {
    const length = values.prompt.length;
    return { length, limit: VIDEO_REPLICATION_PROMPT_LIMIT, over: length > VIDEO_REPLICATION_PROMPT_LIMIT };
}

/** 产物摘要：9:16 · 720P · 15 秒 · 英语 · US(美国) —— 提交前给用户最后确认一遍。 */
export function videoReplicationOutputLabel(
    values: VideoReplicationValues,
    catalog: VideoReplicationCatalog = resolveVideoReplicationCatalog(),
): string {
    const seconds = effectiveVideoReplicationSeconds(values);
    const resolution = VIDEO_REPLICATION_RESOLUTIONS.find((item) => item.id === values.resolution)?.label ?? values.resolution;
    return [
        values.ratio,
        resolution,
        `约 ${formatSeconds(seconds)} 秒`,
        optionLabel(catalog.languages, values.targetLanguage),
        optionLabel(catalog.countries, values.saleCountry),
    ].join(" · ");
}
