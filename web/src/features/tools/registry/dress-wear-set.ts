import { z } from "zod";

/**
 * TASK-009 / DRESS_WEAR_SET（服装套图，makeType 69）——“页面”这一层的事实来源。
 *
 * 证据（只读这些，不搬 LinkFox 前端代码）：
 * - docs/V1.0/plan_linkfox_navigation/page-specs/02-dress-wear-set.md（区域、控件、校验、验收）
 * - docs/V1.0/plan_linkfox_navigation/tool_specs.json#DRESS_WEAR_SET（字段清单与页面文案）
 * - DRESS_WEAR_SET.json（2026-10-28 页面 DOM 实测：上传限制、场景分组、比例、分辨率、品质、算力文案）
 * - docs/analysis/assets/linkfox/models_catalog.json#image.69（provider / resolution / quality / ratio 目录）
 * - docs/analysis/assets/linkfox/create_payload_product_suite.json（真实提交体里 brandKey/platform/language 的形态）
 *
 * 分工：ToolSpec（id/route/fields）仍由 registry/index.ts 持有，本模块不重复声明 id 级 spec，
 * 只提供本页独有的枚举、限制与 zod schema，避免出现两处真相。
 */

export const DRESS_WEAR_SET_TOOL_ID = "DRESS_WEAR_SET";

/** 上传限制：页面实测文案「最多上传5张图，10M以内，384*384~4096*4096」。 */
export const DRESS_UPLOAD_LIMITS = {
    maxFiles: 5,
    maxBytes: 10 * 1024 * 1024,
    minSide: 384,
    maxSide: 4096,
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
} as const;

/** 商品信息输入上限：页面计数「0 / 2500」。 */
export const DRESS_PRODUCT_INFO_MAX_LENGTH = 2500;

/** 单组输出数量的可编辑上限；与 gateway.normalizeCount 的 1–15 截断保持一致。 */
export const DRESS_SCENE_COUNT_MIN = 1;
export const DRESS_SCENE_COUNT_MAX = 15;

export type DressSceneGroupKey = "main" | "aplus";

export type DressSceneKey = "modelLook" | "lifestyle" | "sellPoint" | "sizeChart" | "whiteBg" | "aplusPro" | "aplusPhone" | "aplusPlain" | "aplusCustom";

export type DressSceneOption = {
    key: DressSceneKey;
    group: DressSceneGroupKey;
    /** 页面实测文案 */
    label: string;
    /** 页面实测默认数量（每项 4） */
    defaultCount: number;
    /** 该组对画面的硬约束，直接进入真实 prompt */
    instruction: string;
};

/** 主副图设置：页面实测「生成类型（多选）模特图/种草图/卖点图/尺码图/白底图」。 */
export const DRESS_MAIN_SCENE_OPTIONS: readonly DressSceneOption[] = [
    {
        key: "modelLook",
        group: "main",
        label: "模特图",
        defaultCount: 4,
        instruction: "生成服装上身效果的主图：真人模特穿着该服装，正面或微侧 3/4 视角，完整呈现版型、长度与面料垂感；保留上传图里的服装颜色、印花、领口与廓形等细节，不得改款。",
    },
    {
        key: "lifestyle",
        group: "main",
        label: "种草图",
        defaultCount: 4,
        instruction: "生成生活方式种草图：模特在真实场景中穿着该服装（通勤街头、居家或咖啡馆），带自然动作与生活氛围，光线柔和；服装细节与上传图一致，画面不出现其他品牌标识。",
    },
    {
        key: "sellPoint",
        group: "main",
        label: "卖点图",
        defaultCount: 4,
        instruction: "生成卖点图：以服装细节特写（面料纹理、走线、拉链、内里、五金）为主画面，配合版式化留白展示卖点信息；不得虚构商品信息里没有的功能。",
    },
    {
        key: "sizeChart",
        group: "main",
        label: "尺码图",
        defaultCount: 4,
        instruction: "生成尺码图：干净背景上的服装平铺或正面展示，配合尺码表版式；尺码数字与文字必须清晰可读、保留用户提供的尺码文字，不得编造未给出的尺码。",
    },
    {
        key: "whiteBg",
        group: "main",
        label: "白底图",
        defaultCount: 4,
        instruction: "生成白底主图：纯白背景、无阴影干扰，服装平铺或隐形模特展示，边缘干净、颜色准确，构图居中留白，符合电商主图规范。",
    },
];

/** A+ 图设置：页面实测「生成类型（单选）高级A+/手机A+/普通A+/自定比例」。 */
export const DRESS_APLUS_SCENE_OPTIONS: readonly DressSceneOption[] = [
    {
        key: "aplusPro",
        group: "aplus",
        label: "高级A+",
        defaultCount: 4,
        instruction: "生成高级 A+ 模块：宽幅生活方式构图，模特与服装为主体，模块内预留标题与利益点文本区，整体按品牌主色与字体风格统一。",
    },
    {
        key: "aplusPhone",
        group: "aplus",
        label: "手机A+",
        defaultCount: 4,
        instruction: "生成手机端 A+ 模块：竖版构图，主体偏中上，文字区留白清晰，保证小屏可读，服装细节不被裁切。",
    },
    {
        key: "aplusPlain",
        group: "aplus",
        label: "普通A+",
        defaultCount: 4,
        instruction: "生成普通 A+ 模块：标准图文排版，一张主图配一段利益点文本区，背景简洁，模特与服装自然融合。",
    },
    {
        key: "aplusCustom",
        group: "aplus",
        label: "自定比例",
        defaultCount: 4,
        instruction: "生成自定比例 A+ 模块：按用户选择的比例构图，主体居中、四周留出安全边距，避免文字压到模特脸部与服装关键细节。",
    },
];

export const DRESS_SCENE_OPTIONS: readonly DressSceneOption[] = [...DRESS_MAIN_SCENE_OPTIONS, ...DRESS_APLUS_SCENE_OPTIONS];

export const DRESS_SCENE_BY_KEY: Readonly<Record<DressSceneKey, DressSceneOption>> = Object.fromEntries(DRESS_SCENE_OPTIONS.map((option) => [option.key, option])) as Readonly<Record<DressSceneKey, DressSceneOption>>;

/** 页面实测比例（1:1 / 3:4 / 4:3 / 2:3 / 3:2）；「更多」由模型目录补齐。 */
export const DRESS_BASE_ASPECT_RATIOS = ["1:1", "3:4", "4:3", "2:3", "3:2"] as const;

/** 页面实测分辨率 1K / 2K / 4K。 */
export const DRESS_RESOLUTIONS = ["1K", "2K", "4K"] as const;

/** 页面实测品质文案 → gateway/`services/api/image.ts` 接受的 quality 枚举。 */
export const DRESS_QUALITY_OPTIONS: readonly { value: string; label: string }[] = [
    { value: "low", label: "低品质" },
    { value: "medium", label: "中品质" },
    { value: "high", label: "高品质" },
    { value: "xhigh", label: "超高品质" },
    { value: "max", label: "最大品质" },
];

export const DRESS_DEFAULT_QUALITY = "medium";

export type DressProviderOption = {
    /** 模型目录里的 apiCode，即真实请求的模型标识 */
    code: string;
    name: string;
    /** 模型目录 supportedResolutions；空数组表示目录未给出，只能跟随用户配置 */
    resolutions: readonly string[];
    /** 模型目录 supportedQualities；空数组表示该模型无品质档位 */
    qualities: readonly string[];
    ratios: readonly string[];
};

/**
 * models_catalog.json#image["69"] 原样落地（页面「模型选择」下拉的真实目录）。
 * 目录里没有的品质/分辨率一律不出现在 UI，避免拼接出不存在的档位。
 */
export const DRESS_PROVIDERS: readonly DressProviderOption[] = [
    {
        code: "GPT_2_5_IMAGE",
        name: "LF智能模型 G-2.5 Sunburst",
        resolutions: ["1K", "2K", "4K"],
        qualities: ["low", "medium", "high", "xhigh", "max"],
        ratios: ["1:1", "3:4", "4:3", "2:3", "3:2", "9:16", "16:9", "4:5", "5:4", "21:9", "9:21"],
    },
    {
        code: "GEMINI_NANO_BANANA_2_1",
        name: "LF全能模型 2.1",
        resolutions: ["1K", "2K", "4K"],
        qualities: [],
        ratios: ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "16:9", "9:16", "21:9"],
    },
    {
        code: "GPT_2_5_F_IMAGE",
        name: "LF智能模型 G-2.5 Flare",
        resolutions: ["1K", "2K", "4K"],
        qualities: ["low", "medium", "high", "xhigh", "max"],
        ratios: ["1:1", "3:4", "4:3", "2:3", "3:2", "9:16", "16:9", "4:5", "5:4", "21:9", "9:21"],
    },
    {
        code: "GPT_2_IMAGE",
        name: "LF智能模型 G-2",
        resolutions: ["1K", "2K", "4K"],
        qualities: ["low", "medium", "high"],
        ratios: ["1:1", "3:4", "4:3", "2:3", "3:2", "9:16", "16:9", "4:5", "5:4", "21:9", "9:21"],
    },
    {
        code: "GEMINI_FLASH_PRO",
        name: "LF全能模型 Pro",
        resolutions: ["1K", "2K", "4K"],
        qualities: [],
        ratios: ["1:1", "16:9", "9:16", "3:4", "4:3", "3:2", "2:3", "4:5", "5:4", "21:9"],
    },
    {
        code: "GEMINI_31_FLASH_LITE",
        name: "LF全能模型 Lite",
        resolutions: ["1K"],
        qualities: [],
        ratios: ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
    },
    {
        code: "SEEDREAM5_PRO",
        name: "Seedream 5.0 Pro",
        resolutions: ["1K", "2K"],
        qualities: [],
        ratios: ["1:1", "3:4", "4:3", "9:16", "16:9", "3:2", "2:3", "21:9"],
    },
    {
        code: "WAN2_7",
        name: "Wan 2.7",
        resolutions: ["1K", "2K"],
        qualities: [],
        ratios: ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "16:9", "9:16", "21:9"],
    },
];

export const DRESS_DEFAULT_PROVIDER = "GPT_2_5_IMAGE";

/**
 * 平台 / 销售地区 / 语言：真实提交体（create_payload_product_suite.json）只给出一组样例
 * `platform=亚马逊, salesRegion=美国, language=英语`。证据不足以枚举全量字典，
 * 因此这里只放“已实测值”作为建议，取值本身仍是字符串（adapter 做非空与长度校验），
 * 缺口见 report.md（需 LinkFox 品牌字典接口补全枚举）。
 */
export const DRESS_PLATFORM_SUGGESTIONS = ["亚马逊", "独立站", "TikTok Shop", "Shopee"] as const;
export const DRESS_REGION_SUGGESTIONS = ["美国", "英国", "德国", "日本"] as const;
export const DRESS_LANGUAGE_SUGGESTIONS = ["英语", "德语", "日语", "中文"] as const;

export const DRESS_BRAND_MODES = ["smart", "custom"] as const;
export type DressBrandMode = (typeof DRESS_BRAND_MODES)[number];

export const DRESS_LIMITS = {
    maxFiles: DRESS_UPLOAD_LIMITS.maxFiles,
    maxBytes: DRESS_UPLOAD_LIMITS.maxBytes,
    minSide: DRESS_UPLOAD_LIMITS.minSide,
    maxSide: DRESS_UPLOAD_LIMITS.maxSide,
    productInfoMaxLength: DRESS_PRODUCT_INFO_MAX_LENGTH,
    countMin: DRESS_SCENE_COUNT_MIN,
    countMax: DRESS_SCENE_COUNT_MAX,
} as const;

export const dressSceneSelectionSchema = z.object({
    checked: z.boolean(),
    count: z.number().int().min(DRESS_SCENE_COUNT_MIN).max(DRESS_SCENE_COUNT_MAX),
});

/**
 * 草稿/表单的持久化 schema（values 是 Record<string, unknown>，读回时必须逐字段校验）。
 * 只做结构校验；跨字段约束在 adapter.validateDressWearSet 里统一给出可定位的问题。
 */
export const dressWearSetValuesSchema = z.object({
    productInfo: z.string().max(DRESS_PRODUCT_INFO_MAX_LENGTH),
    platform: z.string(),
    salesRegion: z.string(),
    language: z.string(),
    brandMode: z.enum(DRESS_BRAND_MODES),
    brandName: z.string(),
    brandColor: z.string(),
    brandFont: z.string(),
    complianceCheck: z.boolean(),
    sensitiveLibrary: z.string(),
    replacementLibrary: z.string(),
    provider: z.string(),
    resolution: z.string(),
    quality: z.string(),
    aspectRatio: z.string(),
    layoutEach: z.boolean(),
    noText: z.boolean(),
    mainScenes: z.object({
        modelLook: dressSceneSelectionSchema,
        lifestyle: dressSceneSelectionSchema,
        sellPoint: dressSceneSelectionSchema,
        sizeChart: dressSceneSelectionSchema,
        whiteBg: dressSceneSelectionSchema,
    }),
    aplusScenes: z.object({
        aplusPro: dressSceneSelectionSchema,
        aplusPhone: dressSceneSelectionSchema,
        aplusPlain: dressSceneSelectionSchema,
        aplusCustom: dressSceneSelectionSchema,
    }),
});

export type DressWearSetFormValues = z.infer<typeof dressWearSetValuesSchema>;

export function dressProviderByCode(code: string): DressProviderOption | undefined {
    return DRESS_PROVIDERS.find((provider) => provider.code === code);
}

/** 模型目录支持的品质档位（未列出即返回空数组，UI 据此禁用品质选择）。 */
export function dressQualityOptionsFor(providerCode: string): readonly { value: string; label: string }[] {
    const provider = dressProviderByCode(providerCode);
    if (!provider || provider.qualities.length === 0) return [];
    return DRESS_QUALITY_OPTIONS.filter((option) => provider.qualities.includes(option.value));
}

/** 模型目录支持的分辨率（与页面 1K/2K/4K 取交集，顺序保持页面顺序）。 */
export function dressResolutionOptionsFor(providerCode: string): readonly string[] {
    const provider = dressProviderByCode(providerCode);
    if (!provider || provider.resolutions.length === 0) return [];
    return DRESS_RESOLUTIONS.filter((resolution) => provider.resolutions.includes(resolution));
}

/** 模型目录支持的比例：页面基础比例 + 目录里的「更多」。 */
export function dressAspectRatioOptionsFor(providerCode: string): readonly string[] {
    const provider = dressProviderByCode(providerCode);
    const extra = provider ? provider.ratios : [];
    const merged = [...DRESS_BASE_ASPECT_RATIOS, ...extra];
    return Array.from(new Set(merged));
}
