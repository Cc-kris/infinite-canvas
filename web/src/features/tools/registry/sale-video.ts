/**
 * TASK-042 / SALE_VIDEO（带货口播，makeType 73）——“页面”这一层的事实来源。
 *
 * 证据（只读，不搬 LinkFox 前端代码）：
 * - docs/V1.0/plan_linkfox_navigation/page-specs/35-sale-video.md（区域、控件、联动、校验、验收）
 * - docs/V1.0/plan_linkfox_navigation/evidence/page-dom-20261028/SALE_VIDEO.json（实测文案与控件）
 * - docs/V1.0/plan_linkfox_navigation/tool_specs.json#SALE_VIDEO 与 registry/index.ts 的 12 个字段
 *
 * 真实边界：
 * - 原站「645 算力」是它的计费口径，这里不复刻；主按钮只显示本次真实产物数量/时长/分辨率。
 * - `hiddenPrompt` 由本模块模板确定性生成，页面只读展示（审计用），不参与手填。
 * - 「AI帮写」不谎称调用了模型：它用本模块的模板把国家/语言/商品图数量拼成口播草稿，页面标注为“模板帮写”。
 */

import type { ToolSpec } from "../types";
import { getToolById } from "./index";

export const SALE_VIDEO_TOOL_ID = "SALE_VIDEO";
export const SALE_VIDEO_DRAFT_KEY = `tool-draft:v1:${SALE_VIDEO_TOOL_ID}` as const;

/** 提示词上限：原站计数 0/4000。 */
export const SALE_VIDEO_PROMPT_MAX = 4000;
/** 商品图上限：原站「支持上传 9 张图」。 */
export const SALE_VIDEO_MAX_SOURCES = 9;

/** 商品图硬约束：10M 以内、384²–4096²、宽高比 0.4–2.5（含边界）、png/jpeg/webp。 */
export const SALE_VIDEO_SOURCE_RULE = {
    maxBytes: 10 * 1024 * 1024,
    minSide: 384,
    maxSide: 4096,
    minRatio: 0.4,
    maxRatio: 2.5,
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
} as const;

export type SaleVideoResolution = { value: string; label: string; note: string; width: number; height: number };

/** 分辨率：原站只有 480P / 720P 两档。 */
export const SALE_VIDEO_RESOLUTIONS: readonly SaleVideoResolution[] = [
    { value: "480P", label: "480P", note: "出片更快", width: 854, height: 480 },
    { value: "720P", label: "720P", note: "清晰稳妥", width: 1280, height: 720 },
];

/** 时长：拖动选择 5 / 10 / 15 秒（原站滑杆刻度 5、10、15）。 */
export const SALE_VIDEO_DURATIONS = [5, 10, 15] as const;
export type SaleVideoDuration = (typeof SALE_VIDEO_DURATIONS)[number];

/** 比例：7 种（自适应 + 6 个固定画幅），与原站按钮顺序一致。 */
export const SALE_VIDEO_RATIOS: readonly { value: string; label: string; note: string }[] = [
    { value: "auto", label: "自适应", note: "跟随商品图" },
    { value: "9:16", label: "9:16", note: "竖屏信息流" },
    { value: "16:9", label: "16:9", note: "横屏" },
    { value: "1:1", label: "1:1", note: "方图" },
    { value: "4:3", label: "4:3", note: "横屏偏方" },
    { value: "3:4", label: "3:4", note: "竖屏偏方" },
    { value: "21:9", label: "21:9", note: "宽银幕" },
];

export type SaleVideoLanguage = { value: string; label: string };

/** 输出语言：用 BCP-47 稳定标识；label 保留原站“语言 + 英文名”写法。 */
export const SALE_VIDEO_LANGUAGES: readonly SaleVideoLanguage[] = [
    { value: "en-US", label: "英语（English）" },
    { value: "en-GB", label: "英语 · 英国（English UK）" },
    { value: "de-DE", label: "德语（Deutsch）" },
    { value: "fr-FR", label: "法语（Français）" },
    { value: "es-ES", label: "西班牙语（Español）" },
    { value: "it-IT", label: "意大利语（Italiano）" },
    { value: "pt-BR", label: "葡萄牙语（Português）" },
    { value: "ja-JP", label: "日语（日本語）" },
    { value: "ko-KR", label: "韩语（한국어）" },
    { value: "nl-NL", label: "荷兰语（Nederlands）" },
    { value: "pl-PL", label: "波兰语（Polski）" },
    { value: "tr-TR", label: "土耳其语（Türkçe）" },
    { value: "ar-SA", label: "阿拉伯语（العربية）" },
    { value: "th-TH", label: "泰语（ไทย）" },
    { value: "vi-VN", label: "越南语（Tiếng Việt）" },
    { value: "id-ID", label: "印尼语（Bahasa Indonesia）" },
    { value: "ms-MY", label: "马来语（Bahasa Melayu）" },
    { value: "hi-IN", label: "印地语（हिन्दी）" },
    { value: "zh-CN", label: "中文（简体）" },
];

export type SaleVideoCountry = { value: string; label: string; language: string };

/** 目标国家/地区 → 默认语言（原站 US（美国）默认英语）。 */
export const SALE_VIDEO_COUNTRIES: readonly SaleVideoCountry[] = [
    { value: "US", label: "US（美国）", language: "en-US" },
    { value: "GB", label: "GB（英国）", language: "en-GB" },
    { value: "DE", label: "DE（德国）", language: "de-DE" },
    { value: "FR", label: "FR（法国）", language: "fr-FR" },
    { value: "ES", label: "ES（西班牙）", language: "es-ES" },
    { value: "IT", label: "IT（意大利）", language: "it-IT" },
    { value: "BR", label: "BR（巴西）", language: "pt-BR" },
    { value: "MX", label: "MX（墨西哥）", language: "es-ES" },
    { value: "JP", label: "JP（日本）", language: "ja-JP" },
    { value: "KR", label: "KR（韩国）", language: "ko-KR" },
    { value: "NL", label: "NL（荷兰）", language: "nl-NL" },
    { value: "PL", label: "PL（波兰）", language: "pl-PL" },
    { value: "TR", label: "TR（土耳其）", language: "tr-TR" },
    { value: "SA", label: "SA（沙特阿拉伯）", language: "ar-SA" },
    { value: "AE", label: "AE（阿联酋）", language: "ar-SA" },
    { value: "TH", label: "TH（泰国）", language: "th-TH" },
    { value: "VN", label: "VN（越南）", language: "vi-VN" },
    { value: "ID", label: "ID（印尼）", language: "id-ID" },
    { value: "MY", label: "MY（马来西亚）", language: "ms-MY" },
    { value: "IN", label: "IN（印度）", language: "hi-IN" },
    { value: "CN", label: "CN（中国大陆）", language: "zh-CN" },
];

export const DEFAULT_SALE_VIDEO_COUNTRY = "US";

/** 页面可变状态：只放真正会进入提交/草稿的字段。 */
export type SaleVideoState = {
    saleCountry: string;
    language: string;
    resolution: string;
    videoTime: SaleVideoDuration;
    aspectRatio: string;
    isPro: boolean;
    /** 可见提示词（用户口播脚本）；hiddenPrompt 不在此，由模板派生。 */
    prompt: string;
};

export function findSaleVideoCountry(value: string): SaleVideoCountry | undefined {
    return SALE_VIDEO_COUNTRIES.find((country) => country.value === value);
}

export function findSaleVideoLanguage(value: string): SaleVideoLanguage | undefined {
    return SALE_VIDEO_LANGUAGES.find((language) => language.value === value);
}

export function findSaleVideoResolution(value: string): SaleVideoResolution | undefined {
    return SALE_VIDEO_RESOLUTIONS.find((resolution) => resolution.value === value);
}

/** 国家可用的语言：国家的默认语言永远在列表里（避免联动后选中一个不存在的语言）。 */
export function saleVideoLanguageOptions(country: string): readonly SaleVideoLanguage[] {
    const matched = findSaleVideoCountry(country);
    if (!matched) return SALE_VIDEO_LANGUAGES;
    const preferred = findSaleVideoLanguage(matched.language);
    if (!preferred) return SALE_VIDEO_LANGUAGES;
    return [preferred, ...SALE_VIDEO_LANGUAGES.filter((language) => language.value !== preferred.value)];
}

/**
 * 原站默认值：US（美国）+ 英语 + 720P + 15 秒 + 自适应。
 * 720P/15 秒取自实测控件顺序与「15秒」当前值；比例「自适应」是原站第一项。
 */
export function createSaleVideoState(patch: Partial<SaleVideoState> = {}): SaleVideoState {
    return {
        saleCountry: DEFAULT_SALE_VIDEO_COUNTRY,
        language: "en-US",
        resolution: "720P",
        videoTime: 15,
        aspectRatio: "auto",
        isPro: false,
        prompt: "",
        ...patch,
    };
}

/** 非法/缺失的草稿值直接回落默认，绝不把未知枚举提交上游。 */
export function normalizeSaleVideoState(patch: Partial<SaleVideoState> | null | undefined): SaleVideoState {
    const base = createSaleVideoState();
    if (!patch || typeof patch !== "object") return base;
    const country = typeof patch.saleCountry === "string" && findSaleVideoCountry(patch.saleCountry) ? patch.saleCountry : base.saleCountry;
    const language = typeof patch.language === "string" && findSaleVideoLanguage(patch.language) ? patch.language : base.language;
    const resolution = typeof patch.resolution === "string" && findSaleVideoResolution(patch.resolution) ? patch.resolution : base.resolution;
    const videoTime = SALE_VIDEO_DURATIONS.includes(patch.videoTime as SaleVideoDuration) ? (patch.videoTime as SaleVideoDuration) : base.videoTime;
    const aspectRatio = typeof patch.aspectRatio === "string" && SALE_VIDEO_RATIOS.some((ratio) => ratio.value === patch.aspectRatio) ? patch.aspectRatio : base.aspectRatio;
    const prompt = typeof patch.prompt === "string" ? patch.prompt : base.prompt;
    return { saleCountry: country, language, resolution, videoTime, aspectRatio, isPro: Boolean(patch.isPro), prompt };
}

/**
 * 切换国家：语言跟到该国家的默认语言（原站「国家联动语言」）。
 * 返回值显式告诉 UI 语言被改写，便于提示“已切换为 xx”，而不是静默改值。
 */
export function applySaleVideoCountry(state: SaleVideoState, country: string): { state: SaleVideoState; languageChanged: boolean } {
    const matched = findSaleVideoCountry(country);
    if (!matched) return { state, languageChanged: false };
    if (state.saleCountry === matched.value) return { state, languageChanged: false };
    return {
        state: { ...state, saleCountry: matched.value, language: matched.language },
        languageChanged: matched.language !== state.language,
    };
}

export type SaleVideoPromptCheck = { value: string; length: number; empty: boolean; tooLong: boolean };

export function checkSaleVideoPrompt(prompt: string): SaleVideoPromptCheck {
    const value = prompt ?? "";
    const length = Array.from(value).length;
    return { value, length, empty: value.trim().length === 0, tooLong: length > SALE_VIDEO_PROMPT_MAX };
}

export function saleVideoPromptCounter(prompt: string): string {
    return `${checkSaleVideoPrompt(prompt).length} / ${SALE_VIDEO_PROMPT_MAX}`;
}

/** 商品图输入摘要（只依赖适配器整理后的稳定字段，方便单测）。 */
export type SaleVideoSourceSummary = { name: string; width?: number; height?: number };

/**
 * 隐藏提示词：模板确定性生成，页面只读展示，用于审计“模型到底被要求了什么”。
 * 不拼用户自由文本，避免把可编辑内容偷渡进不可见指令。
 */
export function buildSaleVideoHiddenPrompt(input: {
    state: SaleVideoState;
    model: string;
    sources: readonly SaleVideoSourceSummary[];
    resolutionLabel?: string;
}): string {
    const { state, model, sources } = input;
    const country = findSaleVideoCountry(state.saleCountry);
    const language = findSaleVideoLanguage(state.language);
    const resolution = findSaleVideoResolution(state.resolution);
    const ratio = SALE_VIDEO_RATIOS.find((item) => item.value === state.aspectRatio);
    const pictureCount = sources.length;
    return [
        "【带货口播 · 模板 v1】",
        `目标市场：${country?.label ?? state.saleCountry}；口播语言：${language?.label ?? state.language}`,
        `成片：${state.videoTime} 秒 / ${resolution?.label ?? state.resolution} / 画幅 ${ratio?.label ?? state.aspectRatio}；模型：${model || "未选择"}`,
        `素材：${pictureCount} 张商品图按上传顺序作为主视觉，商品外观、颜色、logo 与包装文字必须与素材一致`,
        "口播结构：3 秒钩子（痛点/场景）→ 2–3 个可验证卖点 → 使用场景演示 → 行动号召",
        "约束：不虚构未提供的价格、折扣、认证、功效与参数；不添加水印、字幕贴纸与第三方品牌标识；旁白与画面对齐，不出现数字人口型要求",
        state.isPro ? "模式：专业模式（允许更长的卖点铺陈与镜头切换）" : "模式：标准模式（单一场景、稳定镜头）",
    ].join("\n");
}

/** 真正发给 provider 的 prompt：隐藏模板 + 用户可见口播稿（顺序固定，便于审计）。 */
export function composeSaleVideoProviderPrompt(input: { state: SaleVideoState; model: string; sources: readonly SaleVideoSourceSummary[] }): string {
    const hidden = buildSaleVideoHiddenPrompt(input);
    const visible = input.state.prompt.trim();
    return visible ? `${hidden}\n\n【口播脚本（用户可见，可编辑）】\n${visible}` : hidden;
}

/** 模板帮写：确定性生成口播草稿（不调用模型，页面标注“模板帮写”）。 */
export function composeSaleVideoScriptDraft(input: { state: SaleVideoState; sourceCount: number }): string {
    const { state, sourceCount } = input;
    const country = findSaleVideoCountry(state.saleCountry);
    const language = findSaleVideoLanguage(state.language);
    const market = country?.label ?? state.saleCountry;
    const langLabel = language?.label ?? state.language;
    const shots = Math.max(1, Math.min(sourceCount, SALE_VIDEO_MAX_SOURCES));
    return [
        `[模板帮写] 面向 ${market}，用${langLabel}口播，${state.videoTime} 秒。`,
        `开场 0–3 秒：用一个真实使用场景抛出痛点，画面切到第 1 张商品图（共 ${shots} 张素材）。`,
        "中段 3–10 秒：按素材顺序展示 2–3 个可见卖点（材质、做工、细节），每个卖点只讲一件事实，不夸大。",
        `结尾 10–${state.videoTime} 秒：回到整体使用画面，给出行动号召（查看详情/立即下单），语速自然、留白 0.5 秒。`,
        "风格：真实口播、不念参数表；不使用未在素材中出现的价格、折扣与认证。",
    ].join("\n");
}

/** 提交快照：真实决定产物的字段 + 源资产 + 草稿版本，用于“结果是否过期/来自旧版本”判定。 */
export type SaleVideoSnapshot = {
    toolId: typeof SALE_VIDEO_TOOL_ID;
    draftRevision: number | null;
    clientOperationId: string;
    model: string;
    saleCountry: string;
    language: string;
    resolution: string;
    videoTime: number;
    aspectRatio: string;
    isPro: boolean;
    prompt: string;
    hiddenPrompt: string;
    sourceAssetIds: string[];
};

export function createSaleVideoSnapshot(input: {
    state: SaleVideoState;
    model: string;
    sourceAssetIds: readonly string[];
    sources?: readonly SaleVideoSourceSummary[];
    draftRevision?: number | null;
    clientOperationId: string;
}): SaleVideoSnapshot {
    const sources = input.sources ?? input.sourceAssetIds.map((id) => ({ name: id }));
    return {
        toolId: SALE_VIDEO_TOOL_ID,
        draftRevision: input.draftRevision ?? null,
        clientOperationId: input.clientOperationId,
        model: input.model,
        saleCountry: input.state.saleCountry,
        language: input.state.language,
        resolution: input.state.resolution,
        videoTime: input.state.videoTime,
        aspectRatio: input.state.aspectRatio,
        isPro: input.state.isPro,
        prompt: input.state.prompt,
        hiddenPrompt: buildSaleVideoHiddenPrompt({ state: input.state, model: input.model, sources }),
        sourceAssetIds: [...input.sourceAssetIds],
    };
}

function snapshotSignature(snapshot: SaleVideoSnapshot): string {
    return JSON.stringify([
        snapshot.model,
        snapshot.saleCountry,
        snapshot.language,
        snapshot.resolution,
        snapshot.videoTime,
        snapshot.aspectRatio,
        snapshot.isPro,
        snapshot.prompt.trim(),
        snapshot.sourceAssetIds,
    ]);
}

/** 图片/提示词/模型/参数任一变化 → 已有结果标记“来自旧版本”，不冒充当前配置结果。 */
export function isSaleVideoSnapshotStale(submitted: SaleVideoSnapshot | null, candidate: SaleVideoSnapshot | null): boolean {
    if (!submitted || !candidate) return false;
    return snapshotSignature(submitted) !== snapshotSignature(candidate);
}

/** 产物说明：替代原站算力区，只报真实数量/时长/分辨率。 */
export function saleVideoOutputLabel(state: SaleVideoState): string {
    const resolution = findSaleVideoResolution(state.resolution);
    /** 本工具每次只落 1 条视频（原站也没有张数控件），专业模式只是提示词约束不同。 */
    return `1 条 · ${state.videoTime} 秒 · ${resolution?.label ?? state.resolution}`;
}

/** 草稿序列化：只落 UI 可恢复状态 + 源资产 id；文件本体由资产库管理。 */
export function serializeSaleVideoDraftValues(state: SaleVideoState) {
    return {
        saleCountry: state.saleCountry,
        language: state.language,
        resolution: state.resolution,
        videoTime: state.videoTime,
        aspectRatio: state.aspectRatio,
        isPro: state.isPro,
        prompt: state.prompt,
    };
}

export function parseSaleVideoDraftValues(values: unknown): { state: SaleVideoState; sourceAssetIds: string[] } {
    const record = (values && typeof values === "object" ? values : {}) as Record<string, unknown>;
    const sourceAssetIds = Array.isArray(record.sourceAssetIds) ? record.sourceAssetIds.filter((id): id is string => typeof id === "string") : [];
    return {
        state: normalizeSaleVideoState({
            saleCountry: typeof record.saleCountry === "string" ? record.saleCountry : undefined,
            language: typeof record.language === "string" ? record.language : undefined,
            resolution: typeof record.resolution === "string" ? record.resolution : undefined,
            videoTime: typeof record.videoTime === "number" ? (record.videoTime as SaleVideoDuration) : undefined,
            aspectRatio: typeof record.aspectRatio === "string" ? record.aspectRatio : undefined,
            isPro: typeof record.isPro === "boolean" ? record.isPro : undefined,
            prompt: typeof record.prompt === "string" ? record.prompt : undefined,
        }),
        sourceAssetIds,
    };
}

export type SaleVideoCapabilityInput = {
    model: string;
    sources: readonly SaleVideoSourceSummary[];
    sourceIssues?: readonly string[];
    prompt: string;
};

export type SaleVideoCapability = {
    executable: boolean;
    canSubmit: boolean;
    issues: string[];
    notices: string[];
    missingFields: string[];
    outputOptions: string;
};

/**
 * 页面/工具栏共用能力判定：没有模型、没有素材、提示词为空或超长都拒绝提交，
 * 不伪造“点了就能跑”的成功路径（TC-050 要求外部能力未接入时提交必须禁用）。
 */
export function resolveSaleVideoCapability(input: SaleVideoCapabilityInput): SaleVideoCapability {
    const issues: string[] = [...(input.sourceIssues ?? [])];
    const missingFields: string[] = [];
    const notices: string[] = [];
    const prompt = checkSaleVideoPrompt(input.prompt);

    if (!input.model.trim()) {
        issues.push("未选择视频模型");
        missingFields.push("videoType");
    }
    if (input.sources.length === 0) {
        issues.push("至少需要 1 张商品图");
        missingFields.push("imageUrl");
    }
    if (input.sources.length > SALE_VIDEO_MAX_SOURCES) {
        issues.push(`商品图最多 ${SALE_VIDEO_MAX_SOURCES} 张，当前 ${input.sources.length} 张`);
        missingFields.push("imageList");
    }
    if (prompt.empty) {
        issues.push("口播提示词不能为空");
        missingFields.push("prompt");
    }
    if (prompt.tooLong) {
        issues.push(`口播提示词最多 ${SALE_VIDEO_PROMPT_MAX} 字，当前 ${prompt.length} 字`);
        missingFields.push("prompt");
    }
    if (input.sources.length > 1) notices.push(`将 ${input.sources.length} 张商品图按上传顺序作为主视觉`);

    return {
        executable: Boolean(input.model.trim()),
        canSubmit: issues.length === 0,
        issues,
        notices,
        missingFields,
        outputOptions: input.sources.length ? `${input.sources.length} 图 → 1 条口播` : "未就绪",
    };
}

export function getSaleVideoSpec(): ToolSpec | undefined {
    return getToolById(SALE_VIDEO_TOOL_ID);
}

/** 供 adapter 与页面共用：字段展示顺序与 registry 一致。 */
export const SALE_VIDEO_FIELD_ORDER = [
    "saleCountry",
    "language",
    "videoType",
    "resolution",
    "videoTime",
    "aspectRatio",
    "isPro",
    "prompt",
    "visiblePrompt",
    "hiddenPrompt",
    "imageUrl",
    "imageList",
] as const;
