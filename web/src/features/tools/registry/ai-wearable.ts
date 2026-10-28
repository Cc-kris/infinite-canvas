import { z } from "zod";

/**
 * TASK-028 / AI_WEARABLE（AI穿戴，makeType 34）——“页面”这一层的事实来源。
 *
 * 证据（只读这些，不搬 LinkFox 前端代码）：
 * - docs/V1.0/plan_linkfox_navigation/page-specs/21-ai-wearable.md（区域、控件、校验、验收、实测文案）
 * - docs/V1.0/plan_linkfox_navigation/tool_specs.json#AI_WEARABLE（13 个字段的控件与校验）
 * - registry/index.ts#AI_WEARABLE（enabled=true / layout=dress / adapter=image / makeType 34）
 * - AI_WEARABLE.json（2026-10-28 页面 DOM 实测：上传限制文案、品类/模特/张数分组、文案摘录）
 * - linkfox-deep-20261027/tools_final.json#AI_WEARABLE（真实字段清单，用于确认 13 字段与 chunk 归属）
 *
 * 明确未确认的部分（不得凭空编造为“来自 chunk”）：
 * - 品类 / 模特类型页签 / 场景页签 / 检测类型的**取值集合**在本地证据里只有页面文案与字段名，
 *   没有 chunk 枚举。因此这里维护的是“页面目录”（page catalog），每个条目都带 `evidence` 标记；
 *   提交只接受目录内的 key（未知即禁用，禁止自由拼接字符串），能力提示里会明确告知未确认来源。
 * - 部位默认蒙版区域是按“模特参考图”归一化坐标给出的默认值，用户必须能拖动/缩放；
 *   默认值只是起点，adapter 会用页面同尺寸 PNG 导出真实蒙版。
 */

export const AI_WEARABLE_TOOL_ID = "AI_WEARABLE";
export const AI_WEARABLE_SLUG = "ai-wearable";
export const AI_WEARABLE_ROUTE = "/tools/product-design/ai-wearable";
export const AI_WEARABLE_MAKE_TYPE = 34;
/** 页面草稿键：page-specs §7「草稿键：tool-draft:v1:AI_WEARABLE」。 */
export const AI_WEARABLE_DRAFT_KEY = "tool-draft:v1:AI_WEARABLE";
/** 草稿 store 里的值槽位。 */
export const AI_WEARABLE_DRAFT_SLOT = "aiWearable";

/* ============================== 上传限制 ============================== */

/** page-specs §9 实测文案：「10M以内，384*384 ~ 4096*4096」。 */
export const WEARABLE_UPLOAD = {
    maxBytes: 10 * 1024 * 1024,
    minSide: 384,
    maxSide: 4096,
    mimeTypes: ["image/png", "image/jpeg", "image/webp"] as const,
    hint: "10M以内，384*384 ~ 4096*4096",
} as const;

/** page-specs §9：「选择生成张数 1 2 3 4」。 */
export const WEARABLE_OUTPUT_OPTIONS = [1, 2, 3, 4] as const;
export const WEARABLE_MAX_OUTPUT = 4;
/** 蒙版椭圆最小面积（占画面比例），低于此值视为退化落位。 */
export const WEARABLE_MIN_REGION_AREA = 0.002;

/* ============================== 目录 ============================== */

/** 目录值来源标记：`page-text` = 页面文案确认；`inferred` = 依行业常识补全，未在 chunk 中确认。 */
export type WearableEvidence = "page-text" | "inferred";

export type WearableRegion = {
    /** 归一化中心点与半径，坐标系 = 对应原图（0..1）。 */
    cx: number;
    cy: number;
    rx: number;
    ry: number;
};

export type WearableFrame = "full" | "upper" | "hand";

export type WearablePartKey =
    | "head"
    | "face"
    | "ear"
    | "neck"
    | "shoulder"
    | "chest"
    | "wrist"
    | "finger"
    | "hand"
    | "waist"
    | "foot";

export type WearablePart = {
    key: WearablePartKey;
    label: string;
    /** 该部位在哪些模特取景下可选（换模特 → 部位过滤）。 */
    frames: readonly WearableFrame[];
    /** 模特参考图归一化坐标下的默认蒙版椭圆。 */
    region: WearableRegion;
    /** 进入提示词的佩戴描述。 */
    prompt: string;
    evidence: WearableEvidence;
};

export const WEARABLE_PARTS: readonly WearablePart[] = [
    { key: "head", label: "头部", frames: ["upper", "full"], region: { cx: 0.5, cy: 0.12, rx: 0.14, ry: 0.11 }, prompt: "佩戴在模特头部", evidence: "inferred" },
    { key: "face", label: "面部", frames: ["upper", "full"], region: { cx: 0.5, cy: 0.16, rx: 0.1, ry: 0.08 }, prompt: "佩戴在模特面部（镜架贴合鼻梁与耳侧）", evidence: "inferred" },
    { key: "ear", label: "耳部", frames: ["upper", "full"], region: { cx: 0.58, cy: 0.18, rx: 0.05, ry: 0.05 }, prompt: "佩戴在模特耳部", evidence: "inferred" },
    { key: "neck", label: "颈部", frames: ["upper", "full"], region: { cx: 0.5, cy: 0.26, rx: 0.09, ry: 0.05 }, prompt: "佩戴在模特颈部", evidence: "inferred" },
    { key: "shoulder", label: "肩部", frames: ["upper", "full"], region: { cx: 0.66, cy: 0.3, rx: 0.12, ry: 0.06 }, prompt: "佩戴/挎在模特肩部", evidence: "inferred" },
    { key: "chest", label: "胸部", frames: ["upper", "full"], region: { cx: 0.5, cy: 0.38, rx: 0.17, ry: 0.1 }, prompt: "佩戴在模特胸前", evidence: "inferred" },
    { key: "wrist", label: "手腕", frames: ["upper", "hand", "full"], region: { cx: 0.3, cy: 0.52, rx: 0.07, ry: 0.05 }, prompt: "佩戴在模特手腕", evidence: "inferred" },
    { key: "finger", label: "手指", frames: ["hand", "full"], region: { cx: 0.26, cy: 0.58, rx: 0.05, ry: 0.04 }, prompt: "佩戴在模特手指", evidence: "inferred" },
    { key: "hand", label: "手部", frames: ["hand", "full"], region: { cx: 0.28, cy: 0.55, rx: 0.09, ry: 0.07 }, prompt: "握持/佩戴在模特手部", evidence: "inferred" },
    { key: "waist", label: "腰部", frames: ["upper", "full"], region: { cx: 0.5, cy: 0.54, rx: 0.16, ry: 0.06 }, prompt: "系在模特腰部", evidence: "inferred" },
    { key: "foot", label: "脚部", frames: ["full"], region: { cx: 0.42, cy: 0.92, rx: 0.1, ry: 0.05 }, prompt: "穿在模特脚部", evidence: "inferred" },
];

export type WearableCategoryKey =
    | "jewelry"
    | "watch"
    | "eyewear"
    | "headwear"
    | "scarf"
    | "gloves"
    | "belt"
    | "footwear"
    | "bag";

export type WearableCategory = {
    key: WearableCategoryKey;
    label: string;
    /** 该品类可选的穿戴部位（品类改变 → 部位收敛）。 */
    parts: readonly WearablePartKey[];
    defaultPart: WearablePartKey;
    /** 进入提示词的商品形态描述。 */
    prompt: string;
    evidence: WearableEvidence;
};

export const WEARABLE_CATEGORIES: readonly WearableCategory[] = [
    { key: "jewelry", label: "首饰", parts: ["ear", "neck", "wrist", "finger"], defaultPart: "neck", prompt: "饰品（保持宝石/金属材质与镶口细节）", evidence: "inferred" },
    { key: "watch", label: "手表", parts: ["wrist"], defaultPart: "wrist", prompt: "手表（保持表盘刻度、表带纹理与朝向）", evidence: "inferred" },
    { key: "eyewear", label: "眼镜", parts: ["face"], defaultPart: "face", prompt: "眼镜（保持镜片通透与镜腿透视）", evidence: "inferred" },
    { key: "headwear", label: "帽饰", parts: ["head"], defaultPart: "head", prompt: "帽饰（保持帽型与头围贴合）", evidence: "inferred" },
    { key: "scarf", label: "围巾", parts: ["neck", "shoulder"], defaultPart: "neck", prompt: "围巾（保持褶皱与面料垂坠）", evidence: "inferred" },
    { key: "gloves", label: "手套", parts: ["hand", "wrist"], defaultPart: "hand", prompt: "手套（保持指节分线与松紧）", evidence: "inferred" },
    { key: "belt", label: "腰带", parts: ["waist"], defaultPart: "waist", prompt: "腰带（保持扣件位置与皮革纹理）", evidence: "inferred" },
    { key: "footwear", label: "鞋履", parts: ["foot"], defaultPart: "foot", prompt: "鞋履（保持着地角度与鞋型）", evidence: "inferred" },
    { key: "bag", label: "包袋", parts: ["shoulder", "hand"], defaultPart: "shoulder", prompt: "包袋（保持包型、肩带长度与五金）", evidence: "inferred" },
];

export type WearableModelTabKey = "real" | "upper" | "hand" | "full";

export type WearableModelTab = {
    key: WearableModelTabKey;
    label: string;
    frame: WearableFrame;
    /** 页签对部位过滤与提示词的说明。 */
    hint: string;
    evidence: WearableEvidence;
};

/** page-specs §7「modelTabType 模特类型页签；切换只改变模特候选与相关默认配置」。 */
export const WEARABLE_MODEL_TABS: readonly WearableModelTab[] = [
    { key: "real", label: "真人模特", frame: "upper", hint: "默认真人半身，保留原图背景", evidence: "inferred" },
    { key: "hand", label: "手部特写", frame: "hand", hint: "手部/腕部特写，部位收敛为手、腕、指", evidence: "inferred" },
    { key: "upper", label: "半身", frame: "upper", hint: "腰以上取景，适合项链、眼镜、肩包", evidence: "inferred" },
    { key: "full", label: "全身", frame: "full", hint: "全身体位，适合鞋履、腰带、包袋", evidence: "inferred" },
];

export type WearableSceneTabKey = "keep" | "white" | "studio" | "street";

export type WearableSceneTab = {
    key: WearableSceneTabKey;
    label: string;
    prompt: string;
    evidence: WearableEvidence;
};

/** page-specs §7「sceneTabType 场景类型页签；切换只改变场景候选，不重置商品图」。 */
export const WEARABLE_SCENE_TABS: readonly WearableSceneTab[] = [
    { key: "keep", label: "保持原背景", prompt: "沿用模特参考图的原始背景与光线", evidence: "inferred" },
    { key: "white", label: "纯白背景", prompt: "替换为纯白无缝背景，棚拍均匀光", evidence: "inferred" },
    { key: "studio", label: "影棚", prompt: "替换为浅灰影棚背景，柔和主光加轮廓光", evidence: "inferred" },
    { key: "street", label: "街拍", prompt: "替换为自然街拍背景，保留环境透视", evidence: "inferred" },
];

export type WearableCheckType = "none" | "sensitive" | "compliance" | "subject";

export type WearableCheckOption = {
    key: WearableCheckType;
    label: string;
    hint: string;
    evidence: WearableEvidence;
};

/** page-specs §7「checkType 检测类型选择；决定敏感词/合规/主体检测规则」。 */
export const WEARABLE_CHECK_TYPES: readonly WearableCheckOption[] = [
    { key: "none", label: "不检测", hint: "直接提交，由 provider 自行拦截", evidence: "inferred" },
    { key: "sensitive", label: "敏感词检测", hint: "提交前过滤敏感词命中", evidence: "inferred" },
    { key: "compliance", label: "合规检测", hint: "按平台合规规则校验商品与文案", evidence: "inferred" },
    { key: "subject", label: "主体检测", hint: "先确认商品主体与蒙版一致再生成", evidence: "inferred" },
];

/* ============================== 取值 ============================== */

export type WearableValues = {
    checkType: WearableCheckType;
    productCategory: WearableCategoryKey;
    part: WearablePartKey;
    modelTabType: WearableModelTabKey;
    sceneTabType: WearableSceneTabKey;
    /** 生图模型（来自渠道配置的模型目录；空 = 未配置）。 */
    modelId: string;
    outputNum: number;
    isSecondOperate: boolean;
    /** 真实资产 id（草稿只存 id，不存 blob）。 */
    productAssetId: string;
    modelAssetId: string;
    /** 商品图蒙版椭圆（imageMaskUrl 的绘制来源）。 */
    productRegion: WearableRegion;
    /** 模特图目标蒙版椭圆（targetMaskUrl 的绘制来源）。 */
    targetRegion: WearableRegion;
    productName: string;
    modelName: string;
};

export const DEFAULT_WEARABLE_VALUES: WearableValues = {
    checkType: "compliance",
    productCategory: "jewelry",
    part: "neck",
    modelTabType: "real",
    sceneTabType: "keep",
    modelId: "",
    outputNum: 1,
    isSecondOperate: false,
    productAssetId: "",
    modelAssetId: "",
    productRegion: { cx: 0.5, cy: 0.5, rx: 0.4, ry: 0.4 },
    targetRegion: { cx: 0.5, cy: 0.26, rx: 0.09, ry: 0.05 },
    productName: "",
    modelName: "",
};

const categoryKeys = WEARABLE_CATEGORIES.map((item) => item.key) as [WearableCategoryKey, ...WearableCategoryKey[]];
const partKeys = WEARABLE_PARTS.map((item) => item.key) as [WearablePartKey, ...WearablePartKey[]];
const modelTabKeys = WEARABLE_MODEL_TABS.map((item) => item.key) as [WearableModelTabKey, ...WearableModelTabKey[]];
const sceneTabKeys = WEARABLE_SCENE_TABS.map((item) => item.key) as [WearableSceneTabKey, ...WearableSceneTabKey[]];
const checkTypeKeys = WEARABLE_CHECK_TYPES.map((item) => item.key) as [WearableCheckType, ...WearableCheckType[]];

/** 页面同款 schema：前端校验与（将来的）服务端校验共用一份，不做二次手写。 */
export const wearableValuesSchema = z.object({
    checkType: z.enum(checkTypeKeys),
    productCategory: z.enum(categoryKeys),
    part: z.enum(partKeys),
    modelTabType: z.enum(modelTabKeys),
    sceneTabType: z.enum(sceneTabKeys),
    modelId: z.string(),
    outputNum: z.number().int().min(1).max(WEARABLE_MAX_OUTPUT),
    isSecondOperate: z.boolean(),
    productAssetId: z.string(),
    modelAssetId: z.string(),
    productRegion: z.object({ cx: z.number().min(0).max(1), cy: z.number().min(0).max(1), rx: z.number().gt(0).max(1), ry: z.number().gt(0).max(1) }),
    targetRegion: z.object({ cx: z.number().min(0).max(1), cy: z.number().min(0).max(1), rx: z.number().gt(0).max(1), ry: z.number().gt(0).max(1) }),
    productName: z.string(),
    modelName: z.string(),
});

/* ============================== 目录查询 ============================== */

export function wearableCategoryOf(key: string | null | undefined): WearableCategory | undefined {
    return WEARABLE_CATEGORIES.find((item) => item.key === key);
}

export function wearablePartOf(key: string | null | undefined): WearablePart | undefined {
    return WEARABLE_PARTS.find((item) => item.key === key);
}

export function wearableModelTabOf(key: string | null | undefined): WearableModelTab {
    return WEARABLE_MODEL_TABS.find((item) => item.key === key) ?? WEARABLE_MODEL_TABS[0];
}

export function wearableSceneTabOf(key: string | null | undefined): WearableSceneTab {
    return WEARABLE_SCENE_TABS.find((item) => item.key === key) ?? WEARABLE_SCENE_TABS[0];
}

export function wearableCheckOf(key: string | null | undefined): WearableCheckOption {
    return WEARABLE_CHECK_TYPES.find((item) => item.key === key) ?? WEARABLE_CHECK_TYPES[2];
}

/** 品类 × 模特页签 → 可选部位（交集）。部位列表为空说明该页签下这个品类不可穿戴。 */
export function wearablePartsFor(categoryKey: WearableCategoryKey, modelTabKey: WearableModelTabKey): WearablePart[] {
    const category = wearableCategoryOf(categoryKey);
    if (!category) return [];
    const frame = wearableModelTabOf(modelTabKey).frame;
    return WEARABLE_PARTS.filter((part) => category.parts.includes(part.key) && part.frames.includes(frame));
}

/** 模特页签 → 至少有一个可用部位的品类。 */
export function wearableCategoriesFor(modelTabKey: WearableModelTabKey): WearableCategory[] {
    return WEARABLE_CATEGORIES.filter((category) => wearablePartsFor(category.key, modelTabKey).length > 0);
}

/* ============================== 区域 ============================== */

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function clampWearableRegion(region: WearableRegion): WearableRegion {
    const rx = clamp01(Math.abs(region.rx)) || 0.02;
    const ry = clamp01(Math.abs(region.ry)) || 0.02;
    return {
        cx: Math.max(rx, Math.min(1 - rx, clamp01(region.cx))),
        cy: Math.max(ry, Math.min(1 - ry, clamp01(region.cy))),
        rx,
        ry,
    };
}

export function wearableRegionArea(region: WearableRegion): number {
    return Math.PI * region.rx * region.ry;
}

export function isWearableRegionUsable(region: WearableRegion): boolean {
    return wearableRegionArea(clampWearableRegion(region)) >= WEARABLE_MIN_REGION_AREA;
}

/**
 * 部位默认目标区域：以部位在“半身”取景下的默认椭圆为基准，按模特页签取景缩放。
 * `hand` 特写放大 2.2×（围绕部位中心），`full` 整体缩小 0.75×，`upper`/`real` 原值。
 */
export function defaultTargetRegion(partKey: WearablePartKey, modelTabKey: WearableModelTabKey): WearableRegion {
    const part = wearablePartOf(partKey) ?? WEARABLE_PARTS[0];
    const frame = wearableModelTabOf(modelTabKey).frame;
    const scale = frame === "hand" ? 2.2 : frame === "full" ? 0.75 : 1;
    return clampWearableRegion({ cx: part.region.cx, cy: part.region.cy, rx: part.region.rx * scale, ry: part.region.ry * scale });
}

/** region → PNG 像素（蒙版导出用，保持与原图同尺寸）。 */
export function wearableRegionToMaskRect(region: WearableRegion, width: number, height: number) {
    const safe = clampWearableRegion(region);
    return {
        cx: Math.round(safe.cx * width),
        cy: Math.round(safe.cy * height),
        rx: Math.max(1, Math.round(safe.rx * width)),
        ry: Math.max(1, Math.round(safe.ry * height)),
        width,
        height,
    };
}

/* ============================== 联动 ============================== */

export type WearableLinkResult = { values: WearableValues; changes: string[] };

/**
 * 页面第 3 节联动：品类 → 部位可选集；模特页签 → 部位过滤与默认蒙版；
 * 换模特不重新上传商品（这里根本不触碰 productAssetId）。
 */
export function linkWearableValues(input: WearableValues): WearableLinkResult {
    const changes: string[] = [];
    const values: WearableValues = { ...input };

    const parts = wearablePartsFor(values.productCategory, values.modelTabType);
    if (!parts.length) {
        const fallback = wearableCategoriesFor(values.modelTabType)[0];
        if (fallback) {
            changes.push(`「${wearableModelTabOf(values.modelTabType).label}」下没有 ${wearableCategoryOf(values.productCategory)?.label ?? values.productCategory} 可穿戴，已切到「${fallback.label}」`);
            values.productCategory = fallback.key;
            values.part = fallback.defaultPart;
        }
    } else if (!parts.some((part) => part.key === values.part)) {
        const fallback = parts.find((part) => part.key === wearableCategoryOf(values.productCategory)?.defaultPart) ?? parts[0];
        changes.push(`部位「${wearablePartOf(values.part)?.label ?? values.part}」不在当前品类/模特可选范围内，已切到「${fallback.label}」`);
        values.part = fallback.key;
    }

    if (!WEARABLE_OUTPUT_OPTIONS.includes(values.outputNum as (typeof WEARABLE_OUTPUT_OPTIONS)[number])) {
        changes.push(`生成张数收敛为 ${WEARABLE_OUTPUT_OPTIONS[0]} 张`);
        values.outputNum = WEARABLE_OUTPUT_OPTIONS[0];
    }

    values.targetRegion = clampWearableRegion(values.targetRegion);
    values.productRegion = clampWearableRegion(values.productRegion);
    return { values, changes };
}

/* ============================== 能力 ============================== */

export type WearableDescriptorLike = {
    executable?: boolean;
    fields?: readonly string[];
};

export type WearableCapabilityInput = {
    modelId?: string | null;
    /** 用户当前配置的生图模型（空 = 未配置，提交禁用）。 */
    modelReady?: boolean;
    /** 当前渠道真实标识（apiFormat）。 */
    provider?: string | null;
    /** 网关描述符（registry/index.ts → gateway.describeToolExecution）。 */
    descriptor?: WearableDescriptorLike | null;
    /** 渠道声明的最大出图数。 */
    providerMaxOutputNum?: number | null;
};

export type WearableCapability = {
    executable: boolean;
    provider: string;
    modelId: string;
    modelReady: boolean;
    outputOptions: number[];
    maxOutput: number;
    notices: string[];
    /** 网关字段表是否覆盖 13 个页面字段（缺哪个就列哪个）。 */
    missingFields: string[];
};

/** 页面 13 个字段（page-specs §7）。 */
export const AI_WEARABLE_FIELDS = [
    "checkType",
    "imageMaskUrl",
    "imageResultUrl",
    "imageUrl",
    "isSecondOperate",
    "modelId",
    "modelTabType",
    "outputNum",
    "productCategory",
    "sceneTabType",
    "targetMaskUrl",
    "targetOriginUrl",
    "targetResultUrl",
] as const;

export function resolveWearableCapability(input: WearableCapabilityInput = {}): WearableCapability {
    const notices: string[] = [];
    const declaredMax =
        typeof input.providerMaxOutputNum === "number" && Number.isFinite(input.providerMaxOutputNum)
            ? Math.floor(input.providerMaxOutputNum)
            : WEARABLE_MAX_OUTPUT;
    const maxOutput = Math.max(1, Math.min(WEARABLE_MAX_OUTPUT, declaredMax));
    if (maxOutput < WEARABLE_MAX_OUTPUT) {
        notices.push(`当前模型单次最多 ${maxOutput} 张，已按能力收敛可选张数`);
    }
    const outputOptions = WEARABLE_OUTPUT_OPTIONS.filter((value) => value <= maxOutput);
    const missingFields = input.descriptor?.fields
        ? AI_WEARABLE_FIELDS.filter((field) => !(input.descriptor as { fields: readonly string[] }).fields.includes(field))
        : [];
    if (missingFields.length) {
        notices.push(`网关字段表缺少 ${missingFields.join("、")}，这些字段可能不会透传到 provider`);
    }
    const modelReady = Boolean(input.modelReady);
    if (!modelReady) notices.push("尚未配置生图模型，无法提交真实生成");
    if (input.descriptor?.executable === false) notices.push("本工具在当前运行时不可执行（网关未接入图片能力）");
    notices.push("品类 / 模特页签 / 场景 / 检测类型为页面目录取值，chunk 枚举未确认，仅接受目录内取值");

    return {
        executable: input.descriptor?.executable !== false && modelReady,
        provider: input.provider ?? "",
        modelId: input.modelId ?? "",
        modelReady,
        outputOptions: outputOptions.length ? outputOptions : [1],
        maxOutput,
        notices,
        missingFields,
    };
}

/* ============================== 提示词 / 产物 ============================== */

export function buildWearablePrompt(values: WearableValues, capability: WearableCapability): string {
    const category = wearableCategoryOf(values.productCategory) ?? WEARABLE_CATEGORIES[0];
    const part = wearablePartOf(values.part) ?? WEARABLE_PARTS[0];
    const tab = wearableModelTabOf(values.modelTabType);
    const scene = wearableSceneTabOf(values.sceneTabType);
    const parts = [
        `把参考图中的${category.prompt}${part.prompt}，与模特参考图合成特写级穿戴效果。`,
        `模特取景：${tab.label}（${tab.hint}）。`,
        `场景：${scene.prompt}。`,
        "保持商品的颜色、材质、文字与 Logo 完全一致；按目标蒙版区域落位，透视、遮挡、接触阴影与高光随模特姿态变化。",
        "不要改变模特身份、体型与服装，不要新增未提供的商品，不要改变商品数量。",
    ];
    if (values.isSecondOperate) parts.push("这是二次操作：沿用上一次结果的模特姿态，只调整穿戴商品与落位。");
    if (!capability.modelReady) parts.push("（当前未配置生图模型，仅预览提示词。）");
    return parts.join(" ");
}

export type WearableOutput = {
    count: number;
    label: string;
    partLabel: string;
    categoryLabel: string;
};

/** 提交按钮旁的「产物数量/预计输出」，不显示原站算力。 */
export function computeWearableOutput(values: WearableValues): WearableOutput {
    const part = wearablePartOf(values.part) ?? WEARABLE_PARTS[0];
    const category = wearableCategoryOf(values.productCategory) ?? WEARABLE_CATEGORIES[0];
    return {
        count: values.outputNum,
        label: `${values.outputNum} 张 · ${category.label} · ${part.label}`,
        partLabel: part.label,
        categoryLabel: category.label,
    };
}

/* ============================== 校验 ============================== */

export type WearableIssueCode =
    | "product-missing"
    | "product-size"
    | "product-mask-degenerate"
    | "model-missing"
    | "model-size"
    | "target-mask-degenerate"
    | "part-incompatible"
    | "output-num-unsupported"
    | "model-not-ready"
    | "provider-not-executable";

export type WearableIssue = { code: WearableIssueCode; field: string; message: string };

export type ValidateWearableInput = {
    values: WearableValues;
    capability: WearableCapability;
    productReady: boolean;
    modelReady: boolean;
    productSize?: { width?: number; height?: number } | null;
    modelSize?: { width?: number; height?: number } | null;
};

const sizeIssue = (size: { width?: number; height?: number } | null | undefined): string | undefined => {
    const width = size?.width ?? 0;
    const height = size?.height ?? 0;
    if (!width || !height) return undefined;
    if (width < WEARABLE_UPLOAD.minSide || height < WEARABLE_UPLOAD.minSide) {
        return `短边需 ≥ ${WEARABLE_UPLOAD.minSide}px，当前 ${width}×${height}`;
    }
    if (width > WEARABLE_UPLOAD.maxSide || height > WEARABLE_UPLOAD.maxSide) {
        return `长边需 ≤ ${WEARABLE_UPLOAD.maxSide}px，当前 ${width}×${height}`;
    }
    return undefined;
};

export function validateWearableState(input: ValidateWearableInput): WearableIssue[] {
    const issues: WearableIssue[] = [];
    const { values, capability } = input;

    if (!input.productReady) {
        issues.push({ code: "product-missing", field: "imageUrl", message: "请先上传穿戴商品图（模特穿戴效果图更好）" });
    }
    if (!input.modelReady) {
        issues.push({ code: "model-missing", field: "targetOriginUrl", message: "请先上传或选择穿戴模特参考图" });
    }
    const productSize = sizeIssue(input.productSize);
    if (productSize) issues.push({ code: "product-size", field: "imageUrl", message: `商品图尺寸不符：${productSize}` });
    const modelSize = sizeIssue(input.modelSize);
    if (modelSize) issues.push({ code: "model-size", field: "targetOriginUrl", message: `模特图尺寸不符：${modelSize}` });

    if (!isWearableRegionUsable(values.productRegion)) {
        issues.push({ code: "product-mask-degenerate", field: "imageMaskUrl", message: "商品蒙版太小，请拉大椭圆或重画" });
    }
    if (!isWearableRegionUsable(values.targetRegion)) {
        issues.push({ code: "target-mask-degenerate", field: "targetMaskUrl", message: "目标穿戴区域太小，请拉大椭圆或重画" });
    }
    const parts = wearablePartsFor(values.productCategory, values.modelTabType);
    if (!parts.some((part) => part.key === values.part)) {
        issues.push({
            code: "part-incompatible",
            field: "part",
            message: `「${wearableCategoryOf(values.productCategory)?.label ?? values.productCategory}」在「${wearableModelTabOf(values.modelTabType).label}」下不能穿戴在「${wearablePartOf(values.part)?.label ?? values.part}」`,
        });
    }
    if (!capability.outputOptions.includes(values.outputNum)) {
        issues.push({ code: "output-num-unsupported", field: "outputNum", message: `当前模型只支持 ${capability.outputOptions.join("/")} 张` });
    }
    if (!capability.modelReady) {
        issues.push({ code: "model-not-ready", field: "modelId", message: "未配置生图模型，无法提交真实生成" });
    } else if (!capability.executable) {
        issues.push({ code: "provider-not-executable", field: "modelId", message: "当前运行时不支持该工具的真实生成" });
    }
    return issues;
}

/* ============================== 快照 ============================== */

export type WearableSnapshot = {
    toolId: string;
    revision: number | string | null;
    provider: string;
    modelId: string;
    productCategory: WearableCategoryKey;
    part: WearablePartKey;
    modelTabType: WearableModelTabKey;
    sceneTabType: WearableSceneTabKey;
    checkType: WearableCheckType;
    outputNum: number;
    isSecondOperate: boolean;
    productAssetId: string;
    modelAssetId: string;
    productRegion: WearableRegion;
    targetRegion: WearableRegion;
    prompt: string;
    hash: string;
};

const stableRegion = (region: WearableRegion) => {
    const safe = clampWearableRegion(region);
    return { cx: Number(safe.cx.toFixed(4)), cy: Number(safe.cy.toFixed(4)), rx: Number(safe.rx.toFixed(4)), ry: Number(safe.ry.toFixed(4)) };
};

/** 稳定哈希：FNV-1a 32 位，仅用于判断「结果是否来自当前配置」。 */
export function wearableSnapshotHash(input: Pick<WearableSnapshot, Exclude<keyof WearableSnapshot, "hash" | "toolId" | "revision">>): string {
    const seed = JSON.stringify({
        provider: input.provider,
        modelId: input.modelId,
        productCategory: input.productCategory,
        part: input.part,
        modelTabType: input.modelTabType,
        sceneTabType: input.sceneTabType,
        checkType: input.checkType,
        outputNum: input.outputNum,
        isSecondOperate: input.isSecondOperate,
        productAssetId: input.productAssetId,
        modelAssetId: input.modelAssetId,
        productRegion: input.productRegion,
        targetRegion: input.targetRegion,
        prompt: input.prompt,
    });
    let hash = 0x811c9dc5;
    for (let index = 0; index < seed.length; index += 1) {
        hash ^= seed.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}

export function createWearableSnapshot(
    values: WearableValues,
    capability: WearableCapability,
    revision: number | string | null = null,
): WearableSnapshot {
    const prompt = buildWearablePrompt(values, capability);
    const base = {
        provider: capability.provider,
        modelId: values.modelId || capability.modelId,
        productCategory: values.productCategory,
        part: values.part,
        modelTabType: values.modelTabType,
        sceneTabType: values.sceneTabType,
        checkType: values.checkType,
        outputNum: values.outputNum,
        isSecondOperate: values.isSecondOperate,
        productAssetId: values.productAssetId,
        modelAssetId: values.modelAssetId,
        productRegion: stableRegion(values.productRegion),
        targetRegion: stableRegion(values.targetRegion),
        prompt,
    };
    return { toolId: AI_WEARABLE_TOOL_ID, revision, ...base, hash: wearableSnapshotHash(base) };
}

export function describeWearableDrift(snapshot: WearableSnapshot | undefined, current: WearableSnapshot | undefined): string | undefined {
    if (!snapshot || !current) return undefined;
    if (snapshot.hash === current.hash) return undefined;
    if (snapshot.productAssetId !== current.productAssetId) return "当前商品图与生成时不同";
    if (snapshot.modelAssetId !== current.modelAssetId) return "当前模特图与生成时不同";
    if (snapshot.productCategory !== current.productCategory) return "商品品类已改变";
    if (snapshot.part !== current.part) return "穿戴部位已改变";
    if (snapshot.targetRegion.cx !== current.targetRegion.cx || snapshot.targetRegion.cy !== current.targetRegion.cy) {
        return "目标蒙版位置已改变";
    }
    if (snapshot.outputNum !== current.outputNum) return "生成张数已改变";
    return "当前配置与生成时的快照不一致";
}

/* ============================== 草稿 ============================== */

const num = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

const region = (raw: unknown, fallback: WearableRegion): WearableRegion => {
    if (!raw || typeof raw !== "object") return { ...fallback };
    const record = raw as Record<string, unknown>;
    return clampWearableRegion({
        cx: num(record.cx, fallback.cx),
        cy: num(record.cy, fallback.cy),
        rx: num(record.rx, fallback.rx),
        ry: num(record.ry, fallback.ry),
    });
};

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

/** 草稿/外部输入 → 合法值：只接受目录内 key，未知值回退默认；不做静默拼接。 */
export function readWearableValues(raw?: Record<string, unknown> | null): WearableValues {
    if (!raw) return { ...DEFAULT_WEARABLE_VALUES };
    const productCategory = pick(raw.productCategory, categoryKeys, DEFAULT_WEARABLE_VALUES.productCategory);
    const modelTabType = pick(raw.modelTabType, modelTabKeys, DEFAULT_WEARABLE_VALUES.modelTabType);
    const part = pick(raw.part, partKeys, wearableCategoryOf(productCategory)?.defaultPart ?? DEFAULT_WEARABLE_VALUES.part);
    return {
        checkType: pick(raw.checkType, checkTypeKeys, DEFAULT_WEARABLE_VALUES.checkType),
        productCategory,
        part,
        modelTabType,
        sceneTabType: pick(raw.sceneTabType, sceneTabKeys, DEFAULT_WEARABLE_VALUES.sceneTabType),
        modelId: typeof raw.modelId === "string" ? raw.modelId : "",
        outputNum: Math.max(1, Math.min(WEARABLE_MAX_OUTPUT, Math.floor(num(raw.outputNum, 1)))),
        isSecondOperate: raw.isSecondOperate === true,
        productAssetId: typeof raw.productAssetId === "string" ? raw.productAssetId : "",
        modelAssetId: typeof raw.modelAssetId === "string" ? raw.modelAssetId : "",
        productRegion: region(raw.productRegion, DEFAULT_WEARABLE_VALUES.productRegion),
        targetRegion: region(raw.targetRegion, defaultTargetRegion(part, modelTabType)),
        productName: typeof raw.productName === "string" ? raw.productName : "",
        modelName: typeof raw.modelName === "string" ? raw.modelName : "",
    };
}
