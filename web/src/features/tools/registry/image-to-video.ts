/**
 * TASK-041 / IMAGE_TO_VIDEO（图转视频，makeType 30）——“页面”这一层的事实来源。
 *
 * 证据（只读，不搬 LinkFox 前端代码）：
 * - docs/V1.0/plan_linkfox_navigation/page-specs/34-image-to-video.md（区域、控件、联动、校验、验收）
 * - docs/V1.0/plan_linkfox_navigation/tool_specs.json#IMAGE_TO_VIDEO（27 字段契约（gateway TOOL_ADAPTER_TABLE.IMAGE_TO_VIDEO））
 * - gateway.ts TOOL_ADAPTER_TABLE.IMAGE_TO_VIDEO（kind=video, requiresReferences）
 *
 * 设计原则：
 * - 所有枚举（素材模式/视频类型/比例/时长/清晰度/国家）都从这里出，页面不硬编码文案；
 * - 未知取值一律回落到稳定默认值，并在 `readImageToVideoValues` 里丢弃非法枚举；
 * - 只有“证据确凿”的枚举才标 `page_spec`，由页面文案推导的标 `page_copy`，其余标 `inferred`。
 */

export const IMAGE_TO_VIDEO_TOOL_ID = "IMAGE_TO_VIDEO";
export const IMAGE_TO_VIDEO_ROUTE = "/tools/ai-video/image-to-video";
/** LinkFox draw 菜单的 makeType（schema_final.json） */
export const IMAGE_TO_VIDEO_MAKE_TYPE = 30;
/** 草稿槽位：写入 tool-draft:v1:IMAGE_TO_VIDEO 的 values.imageToVideo */
export const IMAGE_TO_VIDEO_DRAFT_SLOT = "imageToVideo";

export type ImageToVideoEvidence = "page_spec" | "page_copy" | "inferred";

/** 27 字段契约（gateway TOOL_ADAPTER_TABLE.IMAGE_TO_VIDEO）（顺序与 tool_specs.json / gateway 注册表一致）。 */
export const IMAGE_TO_VIDEO_FIELDS = [
    "aspectRatio",
    "duration",
    "extension",
    "fileKey",
    "fileName",
    "imageInputMode",
    "imageList",
    "imageUrl",
    "isPro",
    "language",
    "lastFrameImageUrl",
    "productInfo",
    "productUrl",
    "prompt",
    "promptOptimizer",
    "referenceAudios",
    "referenceDocument",
    "referenceVideo",
    "saleCountry",
    "size",
    "sourceImageUrl",
    "templateKey",
    "templateName",
    "thumbUrl",
    "url",
    "videoTime",
    "videoType",
] as const;

export type ImageToVideoField = (typeof IMAGE_TO_VIDEO_FIELDS)[number];

/** 上传约束：原站文案「支持上传9张图，10M以内，384*384 ~ 4096*4096，宽高比 0.4～2.5」。 */
export const IMAGE_TO_VIDEO_UPLOAD = {
    maxCount: 9,
    maxBytes: 10 * 1024 * 1024,
    minSide: 384,
    maxSide: 4096,
    minRatio: 0.4,
    maxRatio: 2.5,
    mimeTypes: ["image/png", "image/jpeg", "image/webp"] as const,
    hint: "支持上传9张图，10M以内，384*384 ~ 4096*4096，宽高比（宽÷高）0.4～2.5（含边界）",
} as const;

/** 商品信息计数器：页面文案 0/1600（字段表写 0/2500，页面口径更严，取交集 1600）。 */
export const IMAGE_TO_VIDEO_PRODUCT_INFO_LIMIT = 1600;
/** 提示词上限：字段表 1–4000 字。 */
export const IMAGE_TO_VIDEO_PROMPT_LIMIT = 4000;
export const IMAGE_TO_VIDEO_PRODUCT_URL_LIMIT = 2048;

export type ImageToVideoSourceMode = "reference" | "frames" | "product-link";

export type ImageToVideoSourceModeSpec = {
    key: ImageToVideoSourceMode;
    label: string;
    hint: string;
    evidence: ImageToVideoEvidence;
};

/** 素材模式：参考素材 / 首尾帧 / 商品链接（页面 §9 实测文案）。 */
export const IMAGE_TO_VIDEO_SOURCE_MODES: readonly ImageToVideoSourceModeSpec[] = [
    { key: "reference", label: "参考素材", hint: "最多 9 张参考图，可本地上传或从作品/商品库选择", evidence: "page_spec" },
    { key: "frames", label: "首尾帧", hint: "首帧必填、尾帧可选；两帧进入同一次请求", evidence: "page_spec" },
    { key: "product-link", label: "商品链接", hint: "粘贴商品链接后分析卖点，再补参考图", evidence: "page_spec" },
];

export type ImageToVideoAspectRatio = {
    key: string;
    label: string;
    /** 传给 provider 的 size 值；auto 走“自适应” */
    value: string;
};

/** 7 种比例：自适应 + 6 个固定比例。 */
export const IMAGE_TO_VIDEO_RATIOS: readonly ImageToVideoAspectRatio[] = [
    { key: "auto", label: "自适应", value: "auto" },
    { key: "9:16", label: "9:16", value: "9:16" },
    { key: "16:9", label: "16:9", value: "16:9" },
    { key: "1:1", label: "1:1", value: "1:1" },
    { key: "4:3", label: "4:3", value: "4:3" },
    { key: "3:4", label: "3:4", value: "3:4" },
    { key: "21:9", label: "21:9", value: "21:9" },
];

export type ImageToVideoResolution = {
    key: string;
    label: string;
    /** 传给 provider 的 vquality 值 */
    value: string;
};

export const IMAGE_TO_VIDEO_RESOLUTIONS: readonly ImageToVideoResolution[] = [
    { key: "768P", label: "768P", value: "768" },
    { key: "1080P", label: "1080P", value: "1080" },
];

/** 时长滑杆：5 / 10 / 15 秒（页面 §2）。 */
export const IMAGE_TO_VIDEO_DURATIONS = [5, 10, 15] as const;
export type ImageToVideoDuration = (typeof IMAGE_TO_VIDEO_DURATIONS)[number];

export type ImageToVideoVideoType = {
    key: "product-showcase" | "ugc-seed" | "pain-point" | "home-scene";
    label: string;
    templateKey: string;
    templateName: string;
    /** 模板自带的描述骨架（生成提示词时拼装，不代替用户输入） */
    templatePrompt: string;
    defaultDuration: ImageToVideoDuration;
    evidence: ImageToVideoEvidence;
};

/** 视频类型必填，且“改变模板和提示词”（页面 §3）。 */
export const IMAGE_TO_VIDEO_VIDEO_TYPES: readonly ImageToVideoVideoType[] = [
    {
        key: "product-showcase",
        label: "产品展示",
        templateKey: "tpl-product-showcase",
        templateName: "产品展示·环绕卖点",
        templatePrompt: "主体居中，缓慢环绕运镜，依次展示产品正面、侧面与关键细节，光线均匀，背景干净",
        defaultDuration: 5,
        evidence: "page_spec",
    },
    {
        key: "ugc-seed",
        label: "UGC种草",
        templateKey: "tpl-ugc-seed",
        templateName: "UGC种草·手持口播",
        templatePrompt: "第一人称手持拍摄，生活化场景，镜头轻微晃动，产品自然入画，节奏轻快，像真实用户分享",
        defaultDuration: 10,
        evidence: "page_spec",
    },
    {
        key: "pain-point",
        label: "痛点解决",
        templateKey: "tpl-pain-point",
        templateName: "痛点解决·前中后对比",
        templatePrompt: "先呈现使用前的困扰，再切到产品介入，最后展示使用后的改善，对比清晰不夸大",
        defaultDuration: 10,
        evidence: "page_spec",
    },
    {
        key: "home-scene",
        label: "家居场景",
        templateKey: "tpl-home-scene",
        templateName: "家居场景·空间氛围",
        templatePrompt: "真实家居空间，自然光，产品融入家具与软装，镜头平稳推进，氛围温暖",
        defaultDuration: 15,
        evidence: "page_spec",
    },
];

export const IMAGE_TO_VIDEO_VIDEO_TYPE_BY_KEY = Object.fromEntries(
    IMAGE_TO_VIDEO_VIDEO_TYPES.map((item) => [item.key, item]),
) as Record<ImageToVideoVideoType["key"], ImageToVideoVideoType>;

export const IMAGE_TO_VIDEO_VIDEO_TYPE_KEYS = IMAGE_TO_VIDEO_VIDEO_TYPES.map((item) => item.key);

export type ImageToVideoModel = {
    key: string;
    label: string;
    hint: string;
    evidence: ImageToVideoEvidence;
};

/**
 * 模型品质区只负责“页面目录”（原站文案 MiniMax H3）。
 * 真正可提交的模型必须来自用户配置的 videoModel / 频道列表，registry 不伪造模型值。
 */
export const IMAGE_TO_VIDEO_MODEL_CATALOG: readonly ImageToVideoModel[] = [
    { key: "minimax-h3", label: "MiniMax H3", hint: "适合批量测款与日常上新", evidence: "page_spec" },
];

export type ImageToVideoCountry = {
    key: string;
    label: string;
    defaultLanguage: string;
    evidence: ImageToVideoEvidence;
};

/** 销售国家/地区：只有 US(美国)→英语 是页面实测，其余按语言默认值推导。 */
export const IMAGE_TO_VIDEO_COUNTRIES: readonly ImageToVideoCountry[] = [
    { key: "US", label: "US(美国)", defaultLanguage: "英语", evidence: "page_spec" },
    { key: "UK", label: "UK(英国)", defaultLanguage: "英语", evidence: "inferred" },
    { key: "DE", label: "DE(德国)", defaultLanguage: "德语", evidence: "inferred" },
    { key: "FR", label: "FR(法国)", defaultLanguage: "法语", evidence: "inferred" },
    { key: "JP", label: "JP(日本)", defaultLanguage: "日语", evidence: "inferred" },
    { key: "BR", label: "BR(巴西)", defaultLanguage: "葡萄牙语", evidence: "inferred" },
    { key: "MX", label: "MX(墨西哥)", defaultLanguage: "西班牙语", evidence: "inferred" },
];

export const IMAGE_TO_VIDEO_LANGUAGES = ["英语", "德语", "法语", "日语", "葡萄牙语", "西班牙语"] as const;

/** 图片来源模式（字段 imageInputMode）：本地上传 / 作品选择 / 商品库选择 互斥。 */
export type ImageToVideoImageInputMode = "local" | "library" | "product-library";

export const IMAGE_TO_VIDEO_INPUT_MODES: readonly { key: ImageToVideoImageInputMode; label: string }[] = [
    { key: "local", label: "本地上传" },
    { key: "library", label: "作品选择" },
    { key: "product-library", label: "商品库选择" },
];

export const IMAGE_TO_VIDEO_DEFAULTS = {
    sourceMode: "reference" as ImageToVideoSourceMode,
    videoType: "product-showcase" as ImageToVideoVideoType["key"],
    modelId: "",
    resolution: "768P",
    duration: 5 as ImageToVideoDuration,
    aspectRatio: "auto",
    saleCountry: "US",
    language: "英语",
    imageInputMode: "local" as ImageToVideoImageInputMode,
    promptMode: "template" as ImageToVideoPromptMode,
    promptOptimizer: true,
    isPro: false,
} as const;

export type ImageToVideoPromptMode = "template" | "custom";

export type ImageToVideoValues = {
    sourceMode: ImageToVideoSourceMode;
    /** reference 模式的参考图（有序，最多 9） */
    referenceAssetIds: string[];
    firstFrameAssetId: string;
    lastFrameAssetId: string;
    imageInputMode: ImageToVideoImageInputMode;
    productUrl: string;
    productInfo: string;
    productAnalyzed: boolean;
    videoType: ImageToVideoVideoType["key"];
    templateKey: string;
    templateName: string;
    promptMode: ImageToVideoPromptMode;
    prompt: string;
    promptOptimizer: boolean;
    modelId: string;
    resolution: string;
    duration: ImageToVideoDuration;
    aspectRatio: string;
    saleCountry: string;
    language: string;
    isPro: boolean;
};

export const IMAGE_TO_VIDEO_SOURCE_MODE_BY_KEY = Object.fromEntries(
    IMAGE_TO_VIDEO_SOURCE_MODES.map((item) => [item.key, item]),
) as Record<ImageToVideoSourceMode, ImageToVideoSourceModeSpec>;

export const IMAGE_TO_VIDEO_RATIO_BY_KEY = Object.fromEntries(
    IMAGE_TO_VIDEO_RATIOS.map((item) => [item.key, item]),
) as Record<string, ImageToVideoAspectRatio>;

export const IMAGE_TO_VIDEO_RESOLUTION_BY_KEY = Object.fromEntries(
    IMAGE_TO_VIDEO_RESOLUTIONS.map((item) => [item.key, item]),
) as Record<string, ImageToVideoResolution>;

export const IMAGE_TO_VIDEO_COUNTRY_BY_KEY = Object.fromEntries(
    IMAGE_TO_VIDEO_COUNTRIES.map((item) => [item.key, item]),
) as Record<string, ImageToVideoCountry>;

export function isImageToVideoSourceMode(value: unknown): value is ImageToVideoSourceMode {
    return typeof value === "string" && value in IMAGE_TO_VIDEO_SOURCE_MODE_BY_KEY;
}

export function isImageToVideoVideoType(value: unknown): value is ImageToVideoVideoType["key"] {
    return typeof value === "string" && (IMAGE_TO_VIDEO_VIDEO_TYPE_KEYS as readonly string[]).includes(value);
}

export function isImageToVideoDuration(value: unknown): value is ImageToVideoDuration {
    return typeof value === "number" && (IMAGE_TO_VIDEO_DURATIONS as readonly number[]).includes(value);
}

export function isImageToVideoInputMode(value: unknown): value is ImageToVideoImageInputMode {
    return typeof value === "string" && IMAGE_TO_VIDEO_INPUT_MODES.some((item) => item.key === value);
}

export function isImageToVideoPromptMode(value: unknown): value is ImageToVideoPromptMode {
    return value === "template" || value === "custom";
}

export function videoTypeOf(key: string): ImageToVideoVideoType {
    return isImageToVideoVideoType(key) ? IMAGE_TO_VIDEO_VIDEO_TYPE_BY_KEY[key] : IMAGE_TO_VIDEO_VIDEO_TYPE_BY_KEY["product-showcase"];
}

export function ratioValueOf(key: string): string {
    return IMAGE_TO_VIDEO_RATIO_BY_KEY[key]?.value ?? IMAGE_TO_VIDEO_RATIO_BY_KEY.auto.value;
}

export function resolutionValueOf(key: string): string {
    return IMAGE_TO_VIDEO_RESOLUTION_BY_KEY[key]?.value ?? IMAGE_TO_VIDEO_RESOLUTION_BY_KEY["768P"].value;
}

export function countryOf(key: string): ImageToVideoCountry {
    return IMAGE_TO_VIDEO_COUNTRY_BY_KEY[key] ?? IMAGE_TO_VIDEO_COUNTRY_BY_KEY.US;
}

/** 空值工厂：每个字段都必须有显式默认值，避免 undefined 进快照。 */
export function createImageToVideoValues(overrides: Partial<ImageToVideoValues> = {}): ImageToVideoValues {
    const videoType = isImageToVideoVideoType(overrides.videoType) ? overrides.videoType : IMAGE_TO_VIDEO_DEFAULTS.videoType;
    const template = videoTypeOf(videoType);
    const saleCountry = overrides.saleCountry && IMAGE_TO_VIDEO_COUNTRY_BY_KEY[overrides.saleCountry] ? overrides.saleCountry : IMAGE_TO_VIDEO_DEFAULTS.saleCountry;
    const country = countryOf(saleCountry);
    const language =
        overrides.language && (IMAGE_TO_VIDEO_LANGUAGES as readonly string[]).includes(overrides.language) ? overrides.language : country.defaultLanguage;
    return {
        sourceMode: isImageToVideoSourceMode(overrides.sourceMode) ? overrides.sourceMode : IMAGE_TO_VIDEO_DEFAULTS.sourceMode,
        referenceAssetIds: Array.isArray(overrides.referenceAssetIds)
            ? overrides.referenceAssetIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0).slice(0, IMAGE_TO_VIDEO_UPLOAD.maxCount)
            : [],
        firstFrameAssetId: typeof overrides.firstFrameAssetId === "string" ? overrides.firstFrameAssetId : "",
        lastFrameAssetId: typeof overrides.lastFrameAssetId === "string" ? overrides.lastFrameAssetId : "",
        imageInputMode: isImageToVideoInputMode(overrides.imageInputMode) ? overrides.imageInputMode : IMAGE_TO_VIDEO_DEFAULTS.imageInputMode,
        productUrl: typeof overrides.productUrl === "string" ? overrides.productUrl.slice(0, IMAGE_TO_VIDEO_PRODUCT_URL_LIMIT) : "",
        productInfo: typeof overrides.productInfo === "string" ? overrides.productInfo.slice(0, IMAGE_TO_VIDEO_PRODUCT_INFO_LIMIT) : "",
        productAnalyzed: overrides.productAnalyzed === true,
        videoType,
        templateKey: typeof overrides.templateKey === "string" && overrides.templateKey ? overrides.templateKey : template.templateKey,
        templateName: typeof overrides.templateName === "string" && overrides.templateName ? overrides.templateName : template.templateName,
        promptMode: isImageToVideoPromptMode(overrides.promptMode) ? overrides.promptMode : IMAGE_TO_VIDEO_DEFAULTS.promptMode,
        prompt: typeof overrides.prompt === "string" ? overrides.prompt.slice(0, IMAGE_TO_VIDEO_PROMPT_LIMIT) : "",
        promptOptimizer: overrides.promptOptimizer === undefined ? IMAGE_TO_VIDEO_DEFAULTS.promptOptimizer : overrides.promptOptimizer === true,
        modelId: typeof overrides.modelId === "string" ? overrides.modelId : IMAGE_TO_VIDEO_DEFAULTS.modelId,
        resolution: IMAGE_TO_VIDEO_RESOLUTION_BY_KEY[String(overrides.resolution)] ? String(overrides.resolution) : IMAGE_TO_VIDEO_DEFAULTS.resolution,
        duration: isImageToVideoDuration(overrides.duration) ? overrides.duration : IMAGE_TO_VIDEO_DEFAULTS.duration,
        aspectRatio: IMAGE_TO_VIDEO_RATIO_BY_KEY[String(overrides.aspectRatio)] ? String(overrides.aspectRatio) : IMAGE_TO_VIDEO_DEFAULTS.aspectRatio,
        saleCountry,
        language,
        isPro: overrides.isPro === true,
    };
}

/** 草稿反序列化：脏数据不允许把页面带进非法枚举。 */
export function readImageToVideoValues(raw: unknown): ImageToVideoValues {
    if (!raw || typeof raw !== "object") return createImageToVideoValues();
    return createImageToVideoValues(raw as Partial<ImageToVideoValues>);
}

/** 序列化进草稿槽位（去掉瞬时状态后再落盘）。 */
export function toImageToVideoDraftValues(values: ImageToVideoValues): Record<string, unknown> {
    return { ...values };
}

export type ImageToVideoLinkResult = {
    values: ImageToVideoValues;
    changes: string[];
};

/**
 * 纯联动函数（页面与单测共用）：
 * - 切换视频类型 → 模板 key/名称/默认时长同步（自定义描述模式不动用户文本）；
 * - 切换国家 → 语言跟随默认语言；
 * - 首尾帧模式选中首帧后，reference 列表不被清空（各模式草稿独立保留）。
 */
export function linkImageToVideoValues(previous: ImageToVideoValues, patch: Partial<ImageToVideoValues>): ImageToVideoLinkResult {
    const changes: string[] = [];
    let next: ImageToVideoValues = { ...previous, ...patch };

    if (patch.videoType !== undefined && patch.videoType !== previous.videoType) {
        const template = videoTypeOf(patch.videoType);
        next = {
            ...next,
            videoType: template.key,
            templateKey: template.templateKey,
            templateName: template.templateName,
            // 模板模式跟着类型换骨架；自定义描述保留用户文本。
            prompt: next.promptMode === "template" ? template.templatePrompt : next.prompt,
            duration: patch.duration !== undefined ? next.duration : template.defaultDuration,
        };
        changes.push(`视频类型切换为「${template.label}」，模板更新为「${template.templateName}」`);
    }

    if (patch.promptMode !== undefined && patch.promptMode !== previous.promptMode) {
        if (patch.promptMode === "template") {
            next = { ...next, prompt: videoTypeOf(next.videoType).templatePrompt };
            changes.push("已切回模板描述，提示词跟随模板骨架");
        } else {
            changes.push("已切到自定义描述，提示词需要你确认前后一致");
        }
    }

    if (patch.saleCountry !== undefined && patch.saleCountry !== previous.saleCountry) {
        const country = countryOf(patch.saleCountry);
        next = { ...next, saleCountry: country.key, language: country.defaultLanguage };
        changes.push(`销售地区切换为 ${country.label}，目标语言默认${country.defaultLanguage}`);
    }

    if (patch.referenceAssetIds !== undefined) {
        const deduped: string[] = [];
        for (const id of next.referenceAssetIds) {
            if (!id || deduped.includes(id)) continue;
            deduped.push(id);
        }
        if (deduped.length !== next.referenceAssetIds.length) changes.push("重复的参考图已合并");
        if (deduped.length > IMAGE_TO_VIDEO_UPLOAD.maxCount) changes.push(`参考图超过 ${IMAGE_TO_VIDEO_UPLOAD.maxCount} 张，已保留前 ${IMAGE_TO_VIDEO_UPLOAD.maxCount} 张`);
        next = { ...next, referenceAssetIds: deduped.slice(0, IMAGE_TO_VIDEO_UPLOAD.maxCount) };
    }

    return { values: next, changes };
}

export type ImageToVideoIssues = {
    /** 阻断提交的问题（文案直接展示在控件旁） */
    blockers: string[];
    /** 建议级提示，不阻断 */
    warnings: string[];
};

export type ImageToVideoAssetRef = { id: string; name?: string; width?: number; height?: number; mimeType?: string; bytes?: number };

/** 上传前置校验：尺寸/宽高比约束来自原站文案，在控件旁给出可定位的错误。 */
export function validateImageToVideoAsset(asset: ImageToVideoAssetRef): { ok: true } | { ok: false; message: string } {
    const width = asset.width ?? 0;
    const height = asset.height ?? 0;
    if (!width || !height) return { ok: true };
    if (width < IMAGE_TO_VIDEO_UPLOAD.minSide || height < IMAGE_TO_VIDEO_UPLOAD.minSide) {
        return { ok: false, message: `短边需 ≥ ${IMAGE_TO_VIDEO_UPLOAD.minSide}px，当前 ${width}×${height}` };
    }
    if (width > IMAGE_TO_VIDEO_UPLOAD.maxSide || height > IMAGE_TO_VIDEO_UPLOAD.maxSide) {
        return { ok: false, message: `长边需 ≤ ${IMAGE_TO_VIDEO_UPLOAD.maxSide}px，当前 ${width}×${height}` };
    }
    const ratio = width / height;
    if (ratio < IMAGE_TO_VIDEO_UPLOAD.minRatio || ratio > IMAGE_TO_VIDEO_UPLOAD.maxRatio) {
        return { ok: false, message: `宽高比需在 ${IMAGE_TO_VIDEO_UPLOAD.minRatio}～${IMAGE_TO_VIDEO_UPLOAD.maxRatio} 之间，当前 ${ratio.toFixed(2)}` };
    }
    return { ok: true };
}

/**
 * 提交前校验（页面侧）：素材模式决定必填项。
 * 注意：这里只做“能不能发真实请求”的判断，不做任何结果伪造。
 */
export function validateImageToVideoState(values: ImageToVideoValues, assets: { references?: ImageToVideoAssetRef[]; firstFrame?: ImageToVideoAssetRef; lastFrame?: ImageToVideoAssetRef } = {}): ImageToVideoIssues {
    const blockers: string[] = [];
    const warnings: string[] = [];
    const references = assets.references ?? [];

    if (values.sourceMode === "reference") {
        if (references.length === 0) blockers.push("参考素材模式至少需要 1 张图");
        if (references.length > IMAGE_TO_VIDEO_UPLOAD.maxCount) blockers.push(`参考图最多 ${IMAGE_TO_VIDEO_UPLOAD.maxCount} 张，当前 ${references.length} 张`);
    }
    if (values.sourceMode === "frames") {
        if (!values.firstFrameAssetId) blockers.push("首尾帧模式必须先提供首帧");
        if (!assets.lastFrame && values.lastFrameAssetId) blockers.push("尾帧资产已丢失，请重新上传");
    }
    if (values.sourceMode === "product-link") {
        if (!values.productUrl.trim()) blockers.push("商品链接模式需要填写商品链接");
        else if (!/^https?:\/\//i.test(values.productUrl.trim())) blockers.push("商品链接需要以 http(s):// 开头");
        if (references.length === 0) blockers.push("商品链接模式仍需至少 1 张参考图");
    }

    if (!values.videoType) blockers.push("视频类型为必填项");
    if (values.promptMode === "custom" && !values.prompt.trim()) blockers.push("自定义描述模式下提示词不能为空");
    if (values.prompt.length > IMAGE_TO_VIDEO_PROMPT_LIMIT) blockers.push(`提示词最多 ${IMAGE_TO_VIDEO_PROMPT_LIMIT} 字，当前 ${values.prompt.length}`);
    if (values.productInfo.length > IMAGE_TO_VIDEO_PRODUCT_INFO_LIMIT) blockers.push(`商品信息最多 ${IMAGE_TO_VIDEO_PRODUCT_INFO_LIMIT} 字，当前 ${values.productInfo.length}`);
    if (!IMAGE_TO_VIDEO_RATIO_BY_KEY[values.aspectRatio]) blockers.push("视频比例不在允许的 7 种取值内");
    if (!IMAGE_TO_VIDEO_RESOLUTION_BY_KEY[values.resolution]) blockers.push("视频分辨率只支持 768P / 1080P");
    if (!isImageToVideoDuration(values.duration)) blockers.push("视频时长只支持 5 / 10 / 15 秒");

    for (const asset of [...references, ...(assets.firstFrame ? [assets.firstFrame] : []), ...(assets.lastFrame ? [assets.lastFrame] : [])]) {
        const checked = validateImageToVideoAsset(asset);
        if (!checked.ok) blockers.push(`${asset.name ?? asset.id}：${checked.message}`);
    }

    if (values.sourceMode === "frames" && references.length > 0) {
        warnings.push("首尾帧模式只发送首帧与尾帧，已上传的参考素材会保留在草稿但不进入本次请求");
    }
    if (values.promptMode === "template" && !values.prompt.trim()) {
        warnings.push("模板描述为空，生成时会使用模板骨架文本");
    }
    if (values.duration === 15 && values.resolution === "1080P") {
        warnings.push("15 秒 + 1080P 的部分上游会拒绝或降级，提交后以任务状态为准");
    }

    return { blockers, warnings };
}

/** 模板骨架 + 商品信息 + 输出规格 → 真正发给 provider 的提示词。 */
export function buildImageToVideoPrompt(values: ImageToVideoValues): string {
    const template = videoTypeOf(values.videoType);
    const parts: string[] = [];
    const custom = values.prompt.trim();
    parts.push(custom || template.templatePrompt);
    const product = values.productInfo.trim();
    if (product) parts.push(`商品信息：${product}`);
    const ratio = IMAGE_TO_VIDEO_RATIO_BY_KEY[values.aspectRatio] ?? IMAGE_TO_VIDEO_RATIO_BY_KEY.auto;
    const resolution = IMAGE_TO_VIDEO_RESOLUTION_BY_KEY[values.resolution] ?? IMAGE_TO_VIDEO_RESOLUTION_BY_KEY["768P"];
    parts.push(`规格：${values.duration} 秒，${resolution.label}，画面比例 ${ratio.label}，目标语言${values.language}`);
    if (values.sourceMode === "frames" && values.lastFrameAssetId) {
        parts.push("以首帧开始、尾帧结束，中间动作自然过渡");
    }
    if (values.promptOptimizer) parts.push("请在不改变卖点的前提下优化运镜与画面节奏");
    return parts.join("。");
}

export type ImageToVideoCapability = {
    executable: boolean;
    blockers: string[];
    warnings: string[];
    missingFields: ImageToVideoField[];
    expected: string;
    notices: string[];
};

/**
 * 可执行性 = 页面校验通过 + 用户配置里真实存在可用视频模型。
 * 缺模型时禁用按钮并说明原因，绝不发一次注定失败的请求。
 */
export function resolveImageToVideoCapability(input: {
    values: ImageToVideoValues;
    assets?: { references?: ImageToVideoAssetRef[]; firstFrame?: ImageToVideoAssetRef; lastFrame?: ImageToVideoAssetRef };
    modelOptions?: readonly string[];
}): ImageToVideoCapability {
    const issues = validateImageToVideoState(input.values, input.assets ?? {});
    const missingFields: ImageToVideoField[] = [];
    if (!input.values.videoType) missingFields.push("videoType");
    if (input.values.sourceMode === "reference" && (input.assets?.references ?? []).length === 0) missingFields.push("imageUrl");
    if (input.values.sourceMode === "frames" && !input.values.firstFrameAssetId) missingFields.push("sourceImageUrl");
    if (input.values.sourceMode === "product-link" && !input.values.productUrl.trim()) missingFields.push("productUrl");
    if (input.values.promptMode === "custom" && !input.values.prompt.trim()) missingFields.push("prompt");
    const modelOptions = input.modelOptions ?? [];
    const notices: string[] = [];
    const blockers = [...issues.blockers];

    if (!input.values.modelId.trim()) {
        blockers.push("未选择视频模型：请先在设置里配置可用的视频模型");
    } else if (modelOptions.length > 0 && !modelOptions.includes(input.values.modelId)) {
        blockers.push("当前选择的模型不在已配置的视频模型列表中");
    } else if (modelOptions.length === 0) {
        notices.push("尚未读取到视频模型配置，提交前请确认模型可用");
    }

    const template = videoTypeOf(input.values.videoType);
    const ratio = IMAGE_TO_VIDEO_RATIO_BY_KEY[input.values.aspectRatio] ?? IMAGE_TO_VIDEO_RATIO_BY_KEY.auto;
    const expected = `1 个视频 · ${input.values.duration}s · ${ratio.label} · ${input.values.resolution} · ${template.label}`;

    return {
        executable: blockers.length === 0,
        blockers,
        warnings: issues.warnings,
        missingFields,
        expected,
        notices,
    };
}

export type ImageToVideoSnapshot = {
    toolId: typeof IMAGE_TO_VIDEO_TOOL_ID;
    makeType: number;
    hash: string;
    sourceMode: ImageToVideoSourceMode;
    referenceAssetIds: string[];
    firstFrameAssetId: string;
    lastFrameAssetId: string;
    videoType: ImageToVideoVideoType["key"];
    templateKey: string;
    templateName: string;
    promptMode: ImageToVideoPromptMode;
    prompt: string;
    promptOptimizer: boolean;
    productInfo: string;
    productUrl: string;
    modelId: string;
    resolution: string;
    duration: number;
    aspectRatio: string;
    saleCountry: string;
    language: string;
    isPro: boolean;
    imageInputMode: ImageToVideoImageInputMode;
};

/** 稳定哈希（FNV-1a）：只用于“本次配置是否与快照一致”，不做安全用途。 */
export function stableHash(text: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

/** 任务快照：进入任务后锁定，用来判断“旧结果是否来自旧配置”。 */
export function createImageToVideoSnapshot(values: ImageToVideoValues): ImageToVideoSnapshot {
    const body: Omit<ImageToVideoSnapshot, "hash"> = {
        toolId: IMAGE_TO_VIDEO_TOOL_ID,
        makeType: IMAGE_TO_VIDEO_MAKE_TYPE,
        sourceMode: values.sourceMode,
        referenceAssetIds: [...values.referenceAssetIds].sort(),
        firstFrameAssetId: values.firstFrameAssetId,
        lastFrameAssetId: values.lastFrameAssetId,
        videoType: values.videoType,
        templateKey: values.templateKey,
        templateName: values.templateName,
        promptMode: values.promptMode,
        prompt: values.prompt.trim(),
        promptOptimizer: values.promptOptimizer,
        productInfo: values.productInfo.trim(),
        productUrl: values.productUrl.trim(),
        modelId: values.modelId.trim(),
        resolution: values.resolution,
        duration: values.duration,
        aspectRatio: values.aspectRatio,
        saleCountry: values.saleCountry,
        language: values.language,
        isPro: values.isPro,
        imageInputMode: values.imageInputMode,
    };
    return { ...body, hash: stableHash(JSON.stringify(body)) };
}

/** 配置漂移：提交后改配置不删结果，但结果必须标注“来自旧版本”。 */
export function describeImageToVideoDrift(snapshot: ImageToVideoSnapshot | undefined, values: ImageToVideoValues): string[] {
    if (!snapshot) return [];
    const current = createImageToVideoSnapshot(values);
    const fields: (keyof ImageToVideoSnapshot)[] = [
        "sourceMode",
        "referenceAssetIds",
        "firstFrameAssetId",
        "lastFrameAssetId",
        "videoType",
        "templateKey",
        "promptMode",
        "prompt",
        "promptOptimizer",
        "productInfo",
        "productUrl",
        "modelId",
        "resolution",
        "duration",
        "aspectRatio",
        "saleCountry",
        "language",
        "isPro",
        "imageInputMode",
    ];
    const labels: Partial<Record<keyof ImageToVideoSnapshot, string>> = {
        sourceMode: "素材模式",
        referenceAssetIds: "参考图",
        firstFrameAssetId: "首帧",
        lastFrameAssetId: "尾帧",
        videoType: "视频类型",
        templateKey: "视频模板",
        promptMode: "描述模式",
        prompt: "提示词",
        promptOptimizer: "提示词优化",
        productInfo: "商品信息",
        productUrl: "商品链接",
        modelId: "视频模型",
        resolution: "分辨率",
        duration: "视频时长",
        aspectRatio: "视频比例",
        saleCountry: "销售地区",
        language: "目标语言",
        isPro: "专业模式",
        imageInputMode: "图片来源",
    };
    const changed: string[] = [];
    for (const field of fields) {
        if (JSON.stringify(snapshot[field]) !== JSON.stringify(current[field])) {
            changed.push(labels[field] ?? field);
        }
    }
    return changed;
}

/**
 * 「做同款」映射：原站案例字段 → 本地表单值。
 *
 * 诚实边界（每条都要能被证据核对）：
 * - prompt 用原站案例里的真实脚本文本，原样进 `prompt` 并切到 `custom` 模式，不叠加模板骨架；
 * - 比例/清晰度取原站 `aspectRatio` / `resolution`，本地没有的档位不硬塞（回落到合法档并提示）；
 * - 原站 `videoTime`（10~20 秒）超出本地 5/10/15 档位时，按最近档位收敛并**明确提示**，
 *   绝不把「16 秒」静默当「15 秒」提交；
 * - 提示词优化默认关闭，避免向案例脚本追加文本、导致同款的 prompt 与原站不一致。
 */
export function imageToVideoCaseApplyPatch(input: {
    prompt: string;
    ratio: string;
    resolution: string;
    originDuration: number;
}, referenceAssetIds: string[]): { patch: Partial<ImageToVideoValues>; notices: string[] } {
    const notices: string[] = [];
    const ratio = IMAGE_TO_VIDEO_RATIO_BY_KEY[input.ratio] ? input.ratio : IMAGE_TO_VIDEO_DEFAULTS.aspectRatio;
    if (ratio !== input.ratio) notices.push(`原站比例 ${input.ratio} 本地无对应档位，已回落到 ${ratio}`);

    const resolution = IMAGE_TO_VIDEO_RESOLUTION_BY_KEY[input.resolution]
        ? input.resolution
        : IMAGE_TO_VIDEO_DEFAULTS.resolution;
    if (resolution !== input.resolution) {
        notices.push(`原站清晰度 ${input.resolution} 本地无对应档位，已回落到 ${resolution}`);
    }

    const duration = nearestImageToVideoDuration(input.originDuration);
    if (duration !== input.originDuration) {
        notices.push(
            `原站案例时长 ${input.originDuration} 秒，本地档位只有 5/10/15 秒，已按最近档位取 ${duration} 秒（请求参数真实变化）`,
        );
    }

    const prompt = input.prompt.trim();
    if (!prompt) {
        // 原站个别案例本身没有脚本（API 里 prompt 为空）：不编造脚本，只回填原图与规格。
        return {
            patch: {
                sourceMode: "reference",
                imageInputMode: "local",
                referenceAssetIds,
                promptMode: "template",
                prompt: "",
                aspectRatio: ratio,
                resolution,
                duration,
            },
            notices: [...notices, "该案例原站未提供脚本（prompt 为空），本次只回填原图与规格，不编造提示词"],
        };
    }

    return {
        patch: {
            sourceMode: "reference",
            imageInputMode: "local",
            referenceAssetIds,
            promptMode: "custom",
            prompt: input.prompt,
            promptOptimizer: false,
            aspectRatio: ratio,
            resolution,
            duration,
        },
        notices,
    };
}

/** 最近的时长档位（等距时取更长的一档，避免把案例意图缩短）。 */
export function nearestImageToVideoDuration(seconds: number): ImageToVideoDuration {
    const value = Number.isFinite(seconds) && seconds > 0 ? seconds : IMAGE_TO_VIDEO_DEFAULTS.duration;
    let best: ImageToVideoDuration = IMAGE_TO_VIDEO_DURATIONS[0];
    for (const candidate of IMAGE_TO_VIDEO_DURATIONS) {
        const diff = Math.abs(candidate - value);
        const bestDiff = Math.abs(best - value);
        if (diff < bestDiff || (diff === bestDiff && candidate > best)) best = candidate;
    }
    return best;
}

/** 历史任务里只存了请求的 `size`，按 value 反推回页面比例档位（认不出就返回 undefined，不乱猜）。 */
export function imageToVideoRatioFromSize(size: string | undefined): string | undefined {
    if (!size) return undefined;
    return IMAGE_TO_VIDEO_RATIOS.find((item) => item.value === size)?.key;
}

/** 结果单元：一个任务只产出一个视频，失败/待定也要占位，不允许静默消失。 */
export function imageToVideoExpectedCount(): number {
    return 1;
}
