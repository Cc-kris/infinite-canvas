import { z } from "zod";

/**
 * TASK-039 / PRODUCT_MARKET_MATERIAL（商品营销素材，makeType 64）—— 页面这一层的事实来源。
 *
 * 证据（只读，不搬 LinkFox 前端代码）：
 * - docs/V1.0/plan_linkfox_navigation/page-specs/32-product-market-material.md
 *   （四大区域：商品多图与信息｜品牌/平台/语言｜A+与营销画幅｜营销素材结果；
 *    平台切换过滤合法 A+ 比例；自定义比例展开尺寸；品牌 DNA 控制字体主色；输出按营销模块分组）
 * - docs/analysis/assets/linkfox/schema_final.json#PRODUCT_MARKET_MATERIAL
 *   （bizType 64，chunk ProductTask-FDmCdDjl.js，字段清单：APlusAspectRatio / aspectRatio /
 *    brandDNA / brandKey / brandName / coverList / images / isCustomAspectRatio / language /
 *    name / platform / provider / quality / resolution / salesRegion）
 * - docs/analysis/assets/linkfox/create_payload_product_suite.json
 *   （同族 ProductTask 真实提交体：brandKey = { salesRegion: "美国", language: "英语", platform: "亚马逊" }；
 *    configData.aPlusConfig.sceneType 的键 APlusPro / A+ / custom / APlusHasPhone 即 A+ 模板组合来源）
 * - docs/analysis/assets/linkfox/models_catalog.json#image.69
 *   （makeType 64 未单列模型目录，按同族商品套图 69 的 provider / quality / resolution / ratio 目录落地）
 * - docs/V1.0/plan_linkfox_navigation/technical_design.md
 *   （平台预置：Amazon / Walmart / Etsy / Temu / Shopify / SHEIN，用于本页平台卡片）
 *
 * 边界：registry/index.ts 持有 39 工具的 id 级 ToolSpec，本模块不重复声明 id，
 * 只提供本页独有的枚举、校验、单元计划、Prompt 与快照，避免两处真相。
 */

export const PRODUCT_MARKET_MATERIAL_TOOL_ID = "PRODUCT_MARKET_MATERIAL";

/** 草稿键（technical_design §6）。 */
export const MARKET_DRAFT_KEY = `tool-draft:v1:${PRODUCT_MARKET_MATERIAL_TOOL_ID}`;

/* ------------------------------- 上传限制 ------------------------------- */

/**
 * 商品多图上传限制：沿用同族套图的单图硬限制（10M / 384–4096px / 宽高比 ≤ 5:1），
 * 数量按“商品多图”设计为 1–6 张（补充工具，chunk 未给出数量文案；上限在 UI 与校验同时生效）。
 */
export const MARKET_UPLOAD_LIMITS = {
    minFiles: 1,
    maxFiles: 6,
    maxBytes: 10 * 1024 * 1024,
    minSide: 384,
    maxSide: 4096,
    maxAspectRatio: 5,
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
} as const;

/** 商品信息上限：与同族套图一致（页面计数 0 / 2500）。 */
export const MARKET_PRODUCT_INFO_MAX_LENGTH = 2500;

/** 单模块张数上限：chunk 侧每个 A+ 类型默认 num=4；画布侧允许 1–8，超限截断。 */
export const MARKET_DEFAULT_MODULE_COUNT = 4;
export const MARKET_MAX_MODULE_COUNT = 8;

/* -------------------------------- 平台 -------------------------------- */

export type MarketPlatformId = "amazon" | "shopify" | "walmart" | "etsy" | "temu";

export type MarketPlatformOption = {
    id: MarketPlatformId;
    /** 界面文案（Amazon 为 chunk 实测中文值“亚马逊”） */
    label: string;
    /** 进入 brandKey.platform 的真实取值（chunk 提交体用中文名） */
    brandKeyValue: string;
    /** 该平台是否提供 A+ 详情页模块；不提供时 A+ 比例列表为空，UI 必须禁用而不是拼接 */
    supportsAplus: boolean;
};

export const MARKET_PLATFORMS: readonly MarketPlatformOption[] = [
    { id: "amazon", label: "亚马逊", brandKeyValue: "亚马逊", supportsAplus: true },
    { id: "shopify", label: "Shopify 独立站", brandKeyValue: "Shopify", supportsAplus: false },
    { id: "walmart", label: "沃尔玛", brandKeyValue: "沃尔玛", supportsAplus: false },
    { id: "etsy", label: "Etsy", brandKeyValue: "Etsy", supportsAplus: false },
    { id: "temu", label: "Temu", brandKeyValue: "Temu", supportsAplus: false },
] as const;

export const DEFAULT_PLATFORM: MarketPlatformId = "amazon";

export function findPlatform(id: string): MarketPlatformOption | undefined {
    return MARKET_PLATFORMS.find((platform) => platform.id === id);
}

/* ------------------------------- 销售地区 ------------------------------- */

export type MarketRegionId = "us" | "uk" | "de" | "jp";

export type MarketRegionOption = {
    id: MarketRegionId;
    label: string;
    /** brandKey.salesRegion 的真实取值（chunk 提交体用中文名） */
    brandKeyValue: string;
    /** 该地区默认输出语言；切换地区时联动语言（页面规格：语言与销售地区随任务快照） */
    defaultLanguage: MarketLanguageId;
};

export type MarketLanguageId = "en" | "de" | "ja";

export const MARKET_LANGUAGES: readonly { id: MarketLanguageId; label: string; brandKeyValue: string }[] = [
    { id: "en", label: "英语", brandKeyValue: "英语" },
    { id: "de", label: "德语", brandKeyValue: "德语" },
    { id: "ja", label: "日语", brandKeyValue: "日语" },
] as const;

export const MARKET_SALES_REGIONS: readonly MarketRegionOption[] = [
    { id: "us", label: "美国", brandKeyValue: "美国", defaultLanguage: "en" },
    { id: "uk", label: "英国", brandKeyValue: "英国", defaultLanguage: "en" },
    { id: "de", label: "德国", brandKeyValue: "德国", defaultLanguage: "de" },
    { id: "jp", label: "日本", brandKeyValue: "日本", defaultLanguage: "ja" },
] as const;

export const DEFAULT_REGION: MarketRegionId = "us";
export const DEFAULT_LANGUAGE: MarketLanguageId = "en";

export function findRegion(id: string): MarketRegionOption | undefined {
    return MARKET_SALES_REGIONS.find((region) => region.id === id);
}

/* ------------------------------ A+ 与营销画幅 ------------------------------ */

/** A+ 模板组合：键名来自 chunk configData.aPlusConfig.sceneType（APlusPro / A+ / custom / APlusHasPhone）。 */
export type MarketAplusTemplateId = "APlusPro" | "A+" | "custom" | "APlusHasPhone";

export type MarketAplusTemplate = {
    id: MarketAplusTemplateId;
    label: string;
    /** 只有支持 A+ 的平台才出现该模板 */
    platformScoped: boolean;
    instruction: string;
};

export const MARKET_APLUS_TEMPLATES: readonly MarketAplusTemplate[] = [
    {
        id: "APlusPro",
        label: "高级A+",
        platformScoped: true,
        instruction: "高级 A+ 详情页模块：宽幅整屏构图，商品为主视觉，左侧或上方预留标题与利益点文本区，整体按品牌主色与字体统一。",
    },
    {
        id: "A+",
        label: "普通A+",
        platformScoped: true,
        instruction: "普通 A+ 详情页模块：标准图文排版，一张主图配一段利益点文案区，背景干净，商品边缘清晰。",
    },
    {
        id: "APlusHasPhone",
        label: "手机A+",
        platformScoped: true,
        instruction: "手机端 A+ 模块：竖版构图，主体偏中上，文字区留白保证小屏可读，商品细节不被裁切。",
    },
    {
        id: "custom",
        label: "自定比例",
        platformScoped: true,
        instruction: "自定比例 A+ 模块：按用户给定宽高构图，主体居中并留出安全边距，避免文字压住商品关键细节。",
    },
] as const;

export function findAplusTemplate(id: string): MarketAplusTemplate | undefined {
    return MARKET_APLUS_TEMPLATES.find((template) => template.id === id);
}

/**
 * A+ 图比例（APlusAspectRatio）——按平台过滤。
 * Amazon 提供头图/宽屏/手机三档固定像素 + 自定比例；其他平台没有 A+ 模块则返回空数组，
 * 页面据此禁用 A+ 区域，绝不把别的平台比例塞给亚马逊。
 */
export const MARKET_APLUS_RATIOS = [
    { id: "970x600", label: "头图 970×600", width: 970, height: 600, platforms: ["amazon"] },
    { id: "1464x600", label: "宽屏 1464×600", width: 1464, height: 600, platforms: ["amazon"] },
    { id: "600x450", label: "手机 600×450", width: 600, height: 450, platforms: ["amazon"] },
    { id: "custom", label: "自定比例", width: 0, height: 0, platforms: ["amazon"] },
] as const satisfies readonly {
    id: string;
    label: string;
    width: number;
    height: number;
    platforms: readonly MarketPlatformId[];
}[];

export type MarketAplusRatioId = (typeof MARKET_APLUS_RATIOS)[number]["id"];

export function aplusRatiosForPlatform(platform: MarketPlatformId): readonly (typeof MARKET_APLUS_RATIOS)[number][] {
    return MARKET_APLUS_RATIOS.filter((ratio) => (ratio.platforms as readonly MarketPlatformId[]).includes(platform));
}

export function platformSupportsAplus(platform: MarketPlatformId): boolean {
    return Boolean(findPlatform(platform)?.supportsAplus) && aplusRatiosForPlatform(platform).length > 0;
}

/** 营销画幅（aspectRatio）：只允许 provider 目录里存在的比例，默认取目录交集的前四项。 */
export const MARKET_MARKETING_RATIOS = ["1:1", "4:5", "9:16", "16:9", "3:4", "3:2"] as const;
export type MarketMarketingRatio = (typeof MARKET_MARKETING_RATIOS)[number];

/** 主副图（营销图）模块：与 A+ 模块并列，逐模块生成，画幅走 marketing 比例。 */
export const MARKET_MARKETING_MODULES = [
    { id: "marketing-selling-point", label: "卖点图" },
    { id: "marketing-white-bg", label: "白底图" },
    { id: "marketing-scene", label: "场景图" },
    { id: "marketing-closeup", label: "特写图" },
    { id: "marketing-closeup-white", label: "特写白底图" },
] as const;
export type MarketMarketingModuleId = (typeof MARKET_MARKETING_MODULES)[number]["id"];

/** 排版模式：每种排版生成一张 / 无文字模式。 */
export const MARKET_LAYOUT_MODES = [
    { id: "per-layout", label: "每种排版生成一张" },
    { id: "no-text", label: "无文字模式" },
] as const;
export type MarketLayoutMode = (typeof MARKET_LAYOUT_MODES)[number]["id"];


export const MARKET_RESOLUTIONS = ["1K", "2K", "4K"] as const;
export type MarketResolution = (typeof MARKET_RESOLUTIONS)[number];

/** 品质档位取自模型目录 supportedQualities（low/medium/high/xhigh/max），tier 只用于 Prompt 与展示。 */
export const MARKET_QUALITIES = [
    { id: "low", label: "低品质", tier: 1 },
    { id: "medium", label: "中品质", tier: 2 },
    { id: "high", label: "高品质", tier: 3 },
    { id: "xhigh", label: "超高品质", tier: 4 },
    { id: "max", label: "最大品质", tier: 5 },
] as const;
export type MarketQuality = (typeof MARKET_QUALITIES)[number]["id"];

export const MARKET_FONT_STYLES = [
    { id: "modern", label: "现代无衬线" },
    { id: "classic", label: "经典衬线" },
    { id: "bold", label: "粗体强调" },
] as const;
export type MarketFontStyle = (typeof MARKET_FONT_STYLES)[number]["id"];

/* ------------------------------- 模型目录 ------------------------------- */

export type MarketProviderOption = {
    code: string;
    name: string;
    resolutions: readonly string[];
    qualities: readonly string[];
    ratios: readonly string[];
    /** 目录给出的参考图上限；商品多图提交必须 ≤ 该值 */
    maxReferences: number;
};

/**
 * models_catalog.json#image.69 原样落地（makeType 64 未单列目录，同族 ProductTask 套图共用）。
 * 目录里没有的档位一律不出现在 UI，避免拼接不存在的品质/分辨率。
 */
export const MARKET_PROVIDERS: readonly MarketProviderOption[] = [
    {
        code: "GPT_2_5_IMAGE",
        name: "LF智能模型 G-2.5 Sunburst",
        resolutions: ["1K", "2K", "4K"],
        qualities: ["low", "medium", "high", "xhigh", "max"],
        ratios: ["1:1", "3:4", "4:3", "2:3", "3:2", "9:16", "16:9", "4:5", "5:4", "21:9", "9:21"],
        maxReferences: 5,
    },
    {
        code: "GEMINI_NANO_BANANA_2_1",
        name: "LF全能模型 2.1",
        resolutions: ["1K", "2K", "4K"],
        qualities: [],
        ratios: ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "16:9", "9:16", "21:9"],
        maxReferences: 5,
    },
    {
        code: "GPT_2_5_F_IMAGE",
        name: "LF智能模型 G-2.5 Flare",
        resolutions: ["1K", "2K", "4K"],
        qualities: ["low", "medium", "high", "xhigh", "max"],
        ratios: ["1:1", "3:4", "4:3", "2:3", "3:2", "9:16", "16:9", "4:5", "5:4", "21:9", "9:21"],
        maxReferences: 5,
    },
] as const;

export const DEFAULT_PROVIDER = "GPT_2_5_IMAGE";

export function findProvider(code: string): MarketProviderOption | undefined {
    const target = code.trim();
    if (!target) return undefined;
    return MARKET_PROVIDERS.find((provider) => provider.code === target);
}

/** UI 只展示当前 provider 目录里的品质/分辨率/比例；目录缺失时交给用户配置（空数组 = 不约束）。 */
export function availableQualities(providerCode: string): readonly { id: MarketQuality; label: string; tier: number }[] {
    const provider = findProvider(providerCode);
    if (!provider || provider.qualities.length === 0) return [];
    return MARKET_QUALITIES.filter((quality) => provider.qualities.includes(quality.id));
}

export function availableResolutions(providerCode: string): readonly MarketResolution[] {
    const provider = findProvider(providerCode);
    if (!provider) return [];
    return MARKET_RESOLUTIONS.filter((resolution) => provider.resolutions.includes(resolution));
}

export function availableMarketingRatios(providerCode: string): readonly MarketMarketingRatio[] {
    const provider = findProvider(providerCode);
    if (!provider) return [...MARKET_MARKETING_RATIOS];
    return MARKET_MARKETING_RATIOS.filter((ratio) => provider.ratios.includes(ratio));
}

/* --------------------------------- 配置 --------------------------------- */

export type MarketBrandDna = {
    /** 品牌主色，`#RGB` / `#RRGGBB`；空 = 不约束 */
    primaryColor: string;
    fontStyle: MarketFontStyle | "";
    /** 品牌风格描述（进入 Prompt） */
    tone: string;
};

export type MarketConfig = {
    /** 商品多图资产 id（有序，第一张为主图） */
    sourceAssetIds: string[];
    /** 套图封面顺序（coverList）：必须是 sourceAssetIds 子集，不能空引用 */
    coverList: string[];
    productInfo: string;
    /** 项目/资产名称（name） */
    projectName: string;
    brandName: string;
    brandDna: MarketBrandDna;
    platform: MarketPlatformId;
    salesRegion: MarketRegionId;
    language: MarketLanguageId;
    /** A+ 模板组合（多选） */
    aplusTemplateIds: string[];
    aplusAspectRatio: string;
    aplusCount: number;
    aspectRatio: MarketMarketingRatio;
    isCustomAspectRatio: boolean;
    customWidth: number;
    customHeight: number;
    quality: MarketQuality;
    resolution: MarketResolution;
    provider: string;
    /** 空 = 使用当前用户配置的图片模型 */
    model: string;
    /** 主副图（营销图）模块多选 */
    marketingModuleIds: string[];
    /** 排版模式：每种排版生成一张 / 无文字模式 */
    layoutMode: MarketLayoutMode;
};

const countSchema = z.number().int().min(1).max(MARKET_MAX_MODULE_COUNT);
const hexColor = z.union([z.literal(""), z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "品牌主色必须是 #RGB 或 #RRGGBB")]);

export const marketConfigSchema = z.object({
    sourceAssetIds: z.array(z.string()).max(MARKET_UPLOAD_LIMITS.maxFiles).default([]),
    coverList: z.array(z.string()).default([]),
    productInfo: z.string().max(MARKET_PRODUCT_INFO_MAX_LENGTH).default(""),
    projectName: z.string().default(""),
    brandName: z.string().default(""),
    brandDna: z
        .object({
            primaryColor: hexColor.default(""),
            fontStyle: z.union([z.enum(["modern", "classic", "bold"]), z.literal("")]).default(""),
            tone: z.string().max(400).default(""),
        })
        .default({ primaryColor: "", fontStyle: "", tone: "" }),
    platform: z.enum(["amazon", "shopify", "walmart", "etsy", "temu"]).default(DEFAULT_PLATFORM),
    salesRegion: z.enum(["us", "uk", "de", "jp"]).default(DEFAULT_REGION),
    language: z.enum(["en", "de", "ja"]).default(DEFAULT_LANGUAGE),
    aplusTemplateIds: z.array(z.enum(["APlusPro", "A+", "APlusHasPhone", "custom"])).default(["APlusPro"]),
    aplusAspectRatio: z.string().default("970x600"),
    aplusCount: countSchema.default(MARKET_DEFAULT_MODULE_COUNT),
    aspectRatio: z.enum(MARKET_MARKETING_RATIOS).default("1:1"),
    isCustomAspectRatio: z.boolean().default(false),
    customWidth: z.number().int().min(0).max(MARKET_UPLOAD_LIMITS.maxSide).default(0),
    customHeight: z.number().int().min(0).max(MARKET_UPLOAD_LIMITS.maxSide).default(0),
    quality: z.enum(["low", "medium", "high", "xhigh", "max"]).default("high"),
    resolution: z.enum(MARKET_RESOLUTIONS).default("2K"),
    provider: z.string().default(DEFAULT_PROVIDER),
    model: z.string().default(""),
    marketingModuleIds: z
        .array(z.string())
        .default(["marketing-selling-point", "marketing-white-bg", "marketing-scene", "marketing-closeup"]),
    layoutMode: z.enum(["per-layout", "no-text"]).default("per-layout"),
});

export function createDefaultMarketConfig(overrides: Partial<MarketConfig> = {}): MarketConfig {
    return { ...marketConfigSchema.parse({}), ...overrides };
}

/** 草稿 values → 配置；非法字段回落到默认值并返回 issues（不静默吞掉）。 */
export function readMarketConfig(values: Record<string, unknown> | undefined): { config: MarketConfig; issues: string[] } {
    const parsed = marketConfigSchema.safeParse(values ?? {});
    if (parsed.success) {
        const config = parsed.data as MarketConfig;
        return { config: normalizeConfig(config), issues: [] };
    }
    return {
        config: createDefaultMarketConfig(),
        issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`),
    };
}

/**
 * 平台/地区/语言/比例之间的硬联动（切换平台后留下的非法 A+ 比例必须被纠正，而不是提交脏数据）：
 * - 平台无 A+ → 清空模板与比例；
 * - A+ 比例不在该平台列表 → 回到该平台第一档；
 * - provider 不支持的画幅 → 回到目录第一项；
 * - provider 不支持的品质/分辨率 → 回到目录第一项（目录为空时保留用户值）。
 */
export function normalizeConfig(config: MarketConfig): MarketConfig {
    const platform = findPlatform(config.platform) ? config.platform : DEFAULT_PLATFORM;
    const region = findRegion(config.salesRegion) ? config.salesRegion : DEFAULT_REGION;
    const aplusAllowed = platformSupportsAplus(platform);
    const ratios = aplusRatiosForPlatform(platform);
    const templates = aplusAllowed ? config.aplusTemplateIds.filter((id) => findAplusTemplate(id)) : [];
    const aplusAspectRatio = aplusAllowed && ratios.some((ratio) => ratio.id === config.aplusAspectRatio) ? config.aplusAspectRatio : (ratios[0]?.id ?? "");
    const marketingRatios = availableMarketingRatios(config.provider);
    const aspectRatio = marketingRatios.length === 0 || marketingRatios.includes(config.aspectRatio) ? config.aspectRatio : marketingRatios[0];
    const qualities = availableQualities(config.provider);
    const quality = qualities.length === 0 || qualities.some((entry) => entry.id === config.quality) ? config.quality : qualities[0].id;
    const resolutions = availableResolutions(config.provider);
    const resolution = resolutions.length === 0 || resolutions.includes(config.resolution) ? config.resolution : resolutions[0];
    const known = new Set(config.sourceAssetIds);
    const coverList = config.coverList.filter((id) => known.has(id));
    return {
        ...config,
        platform,
        salesRegion: region,
        aplusTemplateIds: templates,
        aplusAspectRatio,
        aspectRatio,
        quality,
        resolution,
        coverList: coverList.length > 0 ? coverList : config.sourceAssetIds.slice(0, 1),
    };
}

/* -------------------------------- 校验 -------------------------------- */

export type MarketValidationIssue = {
    code: string;
    field: string;
    message: string;
};

export type MarketValidationContext = {
    /** 已上传且可访问的图片数 */
    sourceReadyCount?: number;
    /** 模型可用性：用户配置为空且未选 model 时不能提交 */
    imageModelReady?: boolean;
};

/** 提交前校验：只报具体字段，不用一句“参数错误”糊过去。 */
export function validateMarketConfig(config: MarketConfig, context: MarketValidationContext = {}): MarketValidationIssue[] {
    const issues: MarketValidationIssue[] = [];
    const images = config.sourceAssetIds.filter((id) => id.trim());
    if (images.length < MARKET_UPLOAD_LIMITS.minFiles) {
        issues.push({ code: "images-required", field: "images", message: "至少上传 1 张商品图。" });
    }
    if (images.length > MARKET_UPLOAD_LIMITS.maxFiles) {
        issues.push({ code: "images-too-many", field: "images", message: `商品图最多 ${MARKET_UPLOAD_LIMITS.maxFiles} 张。` });
    }
    if (context.sourceReadyCount !== undefined && context.sourceReadyCount < images.length) {
        issues.push({ code: "images-not-ready", field: "images", message: "还有商品图没有完成入库，请等待上传结束。" });
    }
    if (images.length > 0 && config.productInfo.trim().length === 0) {
        issues.push({ code: "product-info-required", field: "images", message: "请填写商品信息（卖点/材质/使用场景），否则只能凭空生成。" });
    }
    if (config.productInfo.length > MARKET_PRODUCT_INFO_MAX_LENGTH) {
        issues.push({ code: "product-info-too-long", field: "images", message: `商品信息最多 ${MARKET_PRODUCT_INFO_MAX_LENGTH} 字。` });
    }
    if (!findPlatform(config.platform)) {
        issues.push({ code: "platform-invalid", field: "platform", message: "请选择目标平台。" });
    }
    if (!findRegion(config.salesRegion)) {
        issues.push({ code: "region-invalid", field: "salesRegion", message: "请选择销售地区。" });
    }
    if (!MARKET_LANGUAGES.some((language) => language.id === config.language)) {
        issues.push({ code: "language-invalid", field: "language", message: "请选择输出语言。" });
    }
    const provider = findProvider(config.provider);
    if (!provider) {
        issues.push({ code: "provider-unknown", field: "provider", message: "当前模型不在目录中，不能提交。" });
    }
    if (context.imageModelReady === false && !config.model.trim()) {
        issues.push({ code: "model-missing", field: "provider", message: "请先在配置里选择图片模型，或在本页指定模型。" });
    }
    if (config.brandDna.primaryColor && !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(config.brandDna.primaryColor)) {
        issues.push({ code: "brand-color-invalid", field: "brandDNA", message: "品牌主色必须是 #RGB 或 #RRGGBB。" });
    }

    /* A+ 区域：平台过滤 + 模板 + 比例 */
    if (!platformSupportsAplus(config.platform)) {
        if (config.aplusTemplateIds.length > 0) {
            issues.push({ code: "aplus-unsupported", field: "APlusAspectRatio", message: "该平台没有 A+ 模块，请清空 A+ 模板。" });
        }
    } else {
        if (config.aplusTemplateIds.length === 0) {
            issues.push({ code: "aplus-template-required", field: "coverList", message: "请至少选择一个 A+ 模板。" });
        }
        const allowed = aplusRatiosForPlatform(config.platform);
        if (!allowed.some((ratio) => ratio.id === config.aplusAspectRatio)) {
            issues.push({ code: "aplus-ratio-invalid", field: "APlusAspectRatio", message: "该平台不支持这个 A+ 比例。" });
        }
        if (config.aplusAspectRatio === "custom") {
            if (config.customWidth < 64 || config.customHeight < 64) {
                issues.push({ code: "aplus-custom-size", field: "isCustomAspectRatio", message: "自定比例宽高至少 64px。" });
            }
            if (config.customWidth > MARKET_UPLOAD_LIMITS.maxSide || config.customHeight > MARKET_UPLOAD_LIMITS.maxSide) {
                issues.push({ code: "aplus-custom-size", field: "isCustomAspectRatio", message: `自定比例宽高不能超过 ${MARKET_UPLOAD_LIMITS.maxSide}px。` });
            }
        }
    }

    /* 营销画幅 */
    if (config.isCustomAspectRatio) {
        if (config.customWidth < 64 || config.customHeight < 64) {
            issues.push({ code: "custom-size", field: "isCustomAspectRatio", message: "自定义画幅宽高至少 64px。" });
        }
    } else if (provider && !provider.ratios.includes(config.aspectRatio)) {
        issues.push({ code: "ratio-unsupported", field: "aspectRatio", message: `${provider.name} 不支持 ${config.aspectRatio}。` });
    }
    if (provider && provider.qualities.length > 0 && !provider.qualities.includes(config.quality)) {
        issues.push({ code: "quality-unsupported", field: "quality", message: `${provider.name} 不支持该品质档位。` });
    }
    if (provider && !provider.resolutions.includes(config.resolution)) {
        issues.push({ code: "resolution-unsupported", field: "resolution", message: `${provider.name} 不支持 ${config.resolution}。` });
    }
    if (provider && images.length > provider.maxReferences) {
        issues.push({ code: "references-too-many", field: "images", message: `${provider.name} 最多接收 ${provider.maxReferences} 张参考图。` });
    }
    if (images.length > 0 && config.coverList.some((id) => !images.includes(id))) {
        issues.push({ code: "cover-dangling", field: "coverList", message: "封面引用了不存在的商品图。" });
    }
    return issues;
}

/* ------------------------------ 单元与计划 ------------------------------ */

export type MarketUnit = {
    id: string;
    moduleId: string;
    moduleLabel: string;
    templateId: MarketAplusTemplateId;
    index: number;
    total: number;
    label: string;
    /** A+ 模块的目标像素；营销画幅模块为 0（走 aspectRatio） */
    width: number;
    height: number;
    prompt: string;
};

export type MarketPlan = {
    moduleId: string;
    label: string;
    count: number;
    width: number;
    height: number;
};
/** 按模板顺序展开计划：每个 A+ 模板一组，组内 count 张。 */
export function buildMarketPlan(config: MarketConfig): MarketPlan[] {
    const ratio = MARKET_APLUS_RATIOS.find((entry) => entry.id === config.aplusAspectRatio);
    const width = config.aplusAspectRatio === "custom" ? config.customWidth : (ratio?.width ?? 0);
    const height = config.aplusAspectRatio === "custom" ? config.customHeight : (ratio?.height ?? 0);
    const aplusPlans: MarketPlan[] = config.aplusTemplateIds
        .map((id) => findAplusTemplate(id))
        .filter((template): template is MarketAplusTemplate => Boolean(template))
        .map((template) => ({
            moduleId: template.id as string,
            label: template.label,
            count: Math.min(MARKET_MAX_MODULE_COUNT, Math.max(1, Math.round(config.aplusCount))),
            width,
            height,
        }));
    const marketingPlans: MarketPlan[] = MARKET_MARKETING_MODULES.filter((module) =>
        config.marketingModuleIds.includes(module.id),
    ).map((module) => ({
        moduleId: module.id,
        label: module.label,
        count: 1,
        width: 0,
        height: 0,
    }));
    return [...aplusPlans, ...marketingPlans];
}

export function marketExpectedCount(config: MarketConfig): number {
    return buildMarketPlan(config).reduce((sum, plan) => sum + plan.count, 0);
}

export function buildMarketUnits(config: MarketConfig): MarketUnit[] {
    const units: MarketUnit[] = [];
    for (const plan of buildMarketPlan(config)) {
        for (let index = 1; index <= plan.count; index += 1) {
            units.push({
                id: `${plan.moduleId}#${index}`,
                moduleId: plan.moduleId,
                moduleLabel: plan.label,
                templateId: plan.moduleId as MarketAplusTemplateId,
                index,
                total: plan.count,
                label: `${plan.label} ${index}/${plan.count}`,
                width: plan.width,
                height: plan.height,
                prompt: buildMarketUnitPrompt(config, { plan, index }),
            });
        }
    }
    return units;
}

/* -------------------------------- Prompt -------------------------------- */

function qualityLabel(quality: MarketQuality): string {
    return MARKET_QUALITIES.find((entry) => entry.id === quality)?.label ?? quality;
}

function platformLabel(id: MarketPlatformId): string {
    return findPlatform(id)?.label ?? id;
}

/**
 * 唯一进入 provider 的指令来源：商品信息、品牌 DNA、平台/地区/语言、A+ 模板与画幅、品质都在这里落地。
 */
export function buildMarketUnitPrompt(config: MarketConfig, input: { plan: MarketPlan; index: number }): string {
    const { plan, index } = input;
    const template = findAplusTemplate(plan.moduleId);
    const language = MARKET_LANGUAGES.find((entry) => entry.id === config.language)?.label ?? config.language;
    const region = findRegion(config.salesRegion)?.label ?? config.salesRegion;
    const parts: string[] = [];
    parts.push(`基于上传的商品图生成 ${plan.label} 营销素材第 ${index}/${plan.count} 屏，投放平台：${platformLabel(config.platform)}，销售地区：${region}。`);
    parts.push("保持商品本体形状、颜色、材质纹理、logo 与包装文字不变，不得臆造未出现的配件、赠品或参数。");
    parts.push(
        plan.width > 0 && plan.height > 0
            ? `画幅 ${plan.width}×${plan.height}px（A+ 比例 ${config.aplusAspectRatio}），分辨率 ${config.resolution}，品质 ${qualityLabel(config.quality)}。`
            : `画幅 ${config.isCustomAspectRatio ? `${config.customWidth}×${config.customHeight}px` : config.aspectRatio}，分辨率 ${config.resolution}，品质 ${qualityLabel(config.quality)}。`,
    );
    if (template) parts.push(template.instruction);
    parts.push(`画面内文案使用${language}，并与${region}本地表达习惯一致；不要出现其他品牌标识或价格。`);
    parts.push(config.layoutMode === "no-text" ? "无文字模式：画面内不出现任何文字，仅用构图与色彩表达信息。" : "每种排版各生成一张，画面版式彼此保持差异。");
    const info = config.productInfo.trim();
    parts.push(info ? `商品信息：${info}` : "商品信息：未填写。");
    if (config.brandName.trim()) parts.push(`品牌名称：${config.brandName.trim()}。`);
    if (config.brandDna.primaryColor || config.brandDna.fontStyle || config.brandDna.tone) {
        const dna: string[] = [];
        if (config.brandDna.primaryColor) dna.push(`主色 ${config.brandDna.primaryColor}`);
        if (config.brandDna.fontStyle) dna.push(`字体风格 ${MARKET_FONT_STYLES.find((style) => style.id === config.brandDna.fontStyle)?.label ?? config.brandDna.fontStyle}`);
        if (config.brandDna.tone.trim()) dna.push(`风格 ${config.brandDna.tone.trim()}`);
        parts.push(`品牌基因：${dna.join("，")}；文字与色块遵循该规范。`);
    }
    return parts.join("\n");
}

/* ------------------------------- 字段绑定 ------------------------------- */

/**
 * 16 个 chunk 字段的真实取值（提交给 gateway 的 fields，用于任务快照与审计）。
 * 名称必须与 schema_final.json#PRODUCT_MARKET_MATERIAL 完全一致，测试会逐一断言。
 */
export function buildMarketToolFields(config: MarketConfig, context: { images: string[]; provider: string }): Record<string, unknown> {
    const platform = findPlatform(config.platform);
    const region = findRegion(config.salesRegion);
    const language = MARKET_LANGUAGES.find((entry) => entry.id === config.language);
    const ratio = MARKET_APLUS_RATIOS.find((entry) => entry.id === config.aplusAspectRatio);
    return {
        APlusAspectRatio: config.aplusAspectRatio,
        aspectRatio: config.isCustomAspectRatio ? `${config.customWidth}:${config.customHeight}` : config.aspectRatio,
        brandDNA: {
            primaryColor: config.brandDna.primaryColor,
            fontStyle: config.brandDna.fontStyle,
            tone: config.brandDna.tone.trim(),
        },
        brandKey: {
            platform: platform?.brandKeyValue ?? config.platform,
            salesRegion: region?.brandKeyValue ?? config.salesRegion,
            language: language?.brandKeyValue ?? config.language,
        },
        brandName: config.brandName.trim(),
        coverList: [...config.coverList],
        images: [...context.images],
        isCustomAspectRatio: config.isCustomAspectRatio,
        language: language?.brandKeyValue ?? config.language,
        name: config.projectName.trim() || `${platform?.label ?? config.platform}营销素材`,
        platform: platform?.brandKeyValue ?? config.platform,
        provider: context.provider,
        quality: config.quality,
        resolution: config.resolution,
        salesRegion: region?.brandKeyValue ?? config.salesRegion,
        // 以下为画布侧补充（不冒充 chunk 字段）：模板组合与像素，便于按模块重放
        aplusTemplates: [...config.aplusTemplateIds],
        aplusPixel: ratio && config.aplusAspectRatio !== "custom" ? `${ratio.width}x${ratio.height}` : `${config.customWidth}x${config.customHeight}`,
        aplusCount: config.aplusCount,
    };
}

/* ------------------------------- 快照与指纹 ------------------------------- */

export type MarketSnapshot = {
    fingerprint: string;
    revision: number;
    values: Record<string, unknown>;
};

/** 稳定序列化：键排序，避免对象字面量顺序影响指纹。 */
export function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
    if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
    return `{${entries.join(",")}}`;
}

/** FNV-1a 32 位：只用于指纹，不做安全用途。 */
export function fingerprintOf(value: unknown): string {
    const input = stableStringify(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}

/**
 * 提交瞬间的配置快照：包含真正会进入请求的所有字段（含 provider 与画幅像素），
 * 结果与新配置不一致时 UI 必须显示“来自旧版本”。
 */
export function createMarketSnapshot(
    config: MarketConfig,
    input: { revision?: number | null; images: string[]; provider: string },
): MarketSnapshot {
    const values = {
        config: normalizeConfig(config),
        fields: buildMarketToolFields(config, { images: input.images, provider: input.provider }),
        images: [...input.images],
        provider: input.provider,
    };
    return { fingerprint: fingerprintOf(values), revision: input.revision ?? 0, values };
}

export function isMarketSnapshotStale(
    snapshot: Pick<MarketSnapshot, "fingerprint">,
    config: MarketConfig,
    input: { images: string[]; provider: string },
): boolean {
    return snapshot.fingerprint !== fingerprintOf({
        config: normalizeConfig(config),
        fields: buildMarketToolFields(config, { images: input.images, provider: input.provider }),
        images: [...input.images],
        provider: input.provider,
    });
}

/** provider 代码：本页显式 provider 优先，否则跟随用户当前图片模型。 */
export function resolveProviderCode(config: MarketConfig, imageModel?: string): string {
    return config.provider.trim() || imageModel?.trim() || "";
}
