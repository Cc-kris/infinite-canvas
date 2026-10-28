import type { ToolAssetConstraints } from "@/services/api/tools/assets";

/**
 * TASK-024：PRODUCT_SCENE（场景裂变）的页面契约。
 *
 * 事实来源：
 * - docs/V1.0/plan_linkfox_navigation/page-specs/17-product-scene.md（原站
 *   https://www.linkfox.com/draw/product-scene?type=2 的 workspace DOM，证据级别 workspace_dom）；
 * - registry/index.ts 的 ToolSpec（index 17 / makeType 13 / layout "scene" / adapter "image"），
 *   字段表白名单 15 项：cutoutProvider, imageName, imageOutputHeight, imageOutputWidth, imageUrl,
 *   mode, originImageUrl, outputNum, prompt, provider, ratio, sceneKeyword, segImageUrl, sizeType, strength。
 *
 * 真实边界（不接受“演示成功”）：
 * - 这里只有契约与派生计算，不发请求、不造结果；一次真实执行见 `@/features/tools/adapters/product-scene`。
 * - `mode` / `strength` / `sceneKeyword` / `outputNum` / 尺寸 都会原样进入 provider 请求字段，
 *   并参与任务指纹；本模块只负责“页面上看到的 = 实际提交的”。
 * - `provider` 不接受自由文本：取当前模型渠道真实的 apiFormat（openai/gemini/http），
 *   由 adapter 从用户配置里解析后传入，页面不得手填。
 * - `segImageUrl`（主体分割图）没有本地分割服务时不提交空串伪装：见 `resolveSceneSegmentation`。
 * - 智能模式（smart）会隐藏相似度手调，但仍把实际写入的强度值显示出来，避免“看不见的参数被偷偷提交”。
 */

export const PRODUCT_SCENE_TOOL_ID = "PRODUCT_SCENE";
export const PRODUCT_SCENE_TITLE = "场景裂变";
export const PRODUCT_SCENE_ROUTE = "/tools/product-design/product-scene";

/** 原站默认 1 张，可选 1–4 张（页脚「选择生成张数 1 2 3 4」）。 */
export const SCENE_MAX_OUTPUT = 4;
export const SCENE_OUTPUT_OPTIONS: readonly number[] = [1, 2, 3, 4];

/** 场景描述上限：原站计数器 `0 / 100`。 */
export const SCENE_PROMPT_LIMIT = 100;

/** 背景相似度：原站滑杆 0–100；智能模式下由模型决定。 */
export const SCENE_SIMILARITY = { min: 0, max: 100, step: 5, defaultValue: 60 } as const;

/** 智能模式自动写入的强度（页面上会显式展示这个数值）。 */
export const SCENE_SMART_STRENGTH = 60;

/** 自定义尺寸：原站 384*384 ~ 4096*4096，最大宽高比 5，步进 8 便于多数生图模型接受。 */
export const SCENE_CUSTOM_SIZE = { min: 384, max: 4096, step: 8, maxAspect: 5, defaultValue: 1024 } as const;

/** 上传约束：10M以内，分辨率 384*384 ~ 4096*4096（宽高比 5 在 validateSceneSource 里额外校验）。 */
export const SCENE_SOURCE_LIMITS: ToolAssetConstraints = {
    kind: "image",
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
    maxBytes: 10 * 1024 * 1024,
    minBytes: 1,
    minWidth: SCENE_CUSTOM_SIZE.min,
    minHeight: SCENE_CUSTOM_SIZE.min,
    maxWidth: SCENE_CUSTOM_SIZE.max,
    maxHeight: SCENE_CUSTOM_SIZE.max,
    minPixels: SCENE_CUSTOM_SIZE.min * SCENE_CUSTOM_SIZE.min,
    maxPixels: SCENE_CUSTOM_SIZE.max * SCENE_CUSTOM_SIZE.max,
};

/* ============================== 模型卡片 ============================== */

/** 生图模型：原站三张卡「写实 / 简约 / 智能」。 */
export type SceneModelId = "realistic" | "minimal" | "smart";

export type SceneMode = SceneModelId;

export type SceneModelCard = {
    id: SceneModelId;
    label: string;
    /** 提交给 provider 的 `mode` 值：只来自本表，不允许自由文本。 */
    providerMode: SceneMode;
    /** 相似度交互：manual = 手调滑杆；auto = 智能模式由模型决定。 */
    similarity: "manual" | "auto";
    hint: string;
    /** 写进提示词的风格约束。 */
    promptStyle: string;
};

export const SCENE_MODELS: readonly SceneModelCard[] = [
    {
        id: "realistic",
        label: "写实",
        providerMode: "realistic",
        similarity: "manual",
        hint: "真实光影与材质，背景相似度可手调",
        promptStyle: "写实摄影风格，真实光影、真实材质反射，商品主体清晰可辨",
    },
    {
        id: "minimal",
        label: "简约",
        providerMode: "minimal",
        similarity: "manual",
        hint: "干净克制的场景布置，主体更突出",
        promptStyle: "简约风格，干净背景与少量道具，留白充足，主体突出",
    },
    {
        id: "smart",
        label: "智能",
        providerMode: "smart",
        similarity: "auto",
        hint: "已选择智能模式，将根据模型自动生成场景",
        promptStyle: "智能风格，按模型对商品与场景的最佳理解自动搭建场景",
    },
];

export function sceneModelCard(id: string | undefined | null): SceneModelCard {
    return SCENE_MODELS.find((item) => item.id === id) ?? SCENE_MODELS[0];
}

/* ============================== provider 能力 ============================== */

export type SceneProviderCapability = {
    modelId: SceneModelId;
    /** 实际提交给 provider 的 mode 值。 */
    providerMode: SceneMode;
    /** 实际渠道标识（apiFormat），空表示未配置模型。 */
    provider: string;
    similarity: "manual" | "auto";
    /** auto 模式下页面会展示这个“实际提交的强度”。 */
    similarityValue: number;
    customSize: boolean;
    sceneKeyword: boolean;
    maxOutputNum: number;
    outputOptions: number[];
    /** 网关是否真的能执行本工具（adapter.kind === "image"）。 */
    executable: boolean;
    /** 能力收敛的原因，直接展示给用户，不允许静默改值。 */
    notices: string[];
};

export type SceneCapabilityInput = {
    modelId?: string | null;
    /** 用户当前配置的生图模型（空 = 未配置，提交禁用）。 */
    modelReady?: boolean;
    /** 当前渠道真实标识（apiFormat）。 */
    provider?: string | null;
    /** 网关描述符里的可执行性（registry/index.ts → gateway.describeToolExecution）。 */
    executable?: boolean;
    /** 该渠道/provider 声明的最大出图数（目录未加载时按页面 4 张）。 */
    providerMaxOutputNum?: number | null;
    /** 该渠道是否接受自定义宽高。 */
    providerCustomSize?: boolean | null;
    /** 该渠道是否消费场景关键词字段。 */
    providerSceneKeyword?: boolean | null;
    /** 手动指定的相似度（智能模式下会被自动值覆盖）。 */
    similarityValue?: number;
};

/** 组装“Provider 能力 → 输出数量/尺寸/相似度”的联动结果。纯函数，不做 I/O。 */
export type ResolveSceneCapabilityInput = SceneCapabilityInput;

export function resolveSceneCapability(input: SceneCapabilityInput = {}): SceneProviderCapability {
    const card = sceneModelCard(input.modelId);
    const notices: string[] = [];

    const declaredMax = typeof input.providerMaxOutputNum === "number" && Number.isFinite(input.providerMaxOutputNum) ? Math.floor(input.providerMaxOutputNum) : SCENE_MAX_OUTPUT;
    const cappedMax = Math.max(1, Math.min(SCENE_MAX_OUTPUT, declaredMax));
    if (cappedMax < SCENE_MAX_OUTPUT) {
        notices.push(`当前模型单次最多 ${cappedMax} 张，已按能力收敛可选张数`);
    }
    const outputOptions = SCENE_OUTPUT_OPTIONS.filter((value) => value <= cappedMax);

    const customSize = input.providerCustomSize === false ? false : true;
    if (!customSize) notices.push("当前模型不支持自定义宽高，只能用默认尺寸");

    const sceneKeyword = input.providerSceneKeyword === false ? false : true;
    if (!sceneKeyword) notices.push("当前模型不消费场景关键词字段，关键词仅进入提示词");

    if (input.modelReady === false) notices.push("尚未配置生图模型，无法提交真实生成");
    if (input.executable === false) notices.push("本工具在当前运行时不可执行（网关未接入图片能力）");

    const similarityValue =
        card.similarity === "auto"
            ? SCENE_SMART_STRENGTH
            : clampInt(input.similarityValue ?? SCENE_SIMILARITY.defaultValue, SCENE_SIMILARITY.min, SCENE_SIMILARITY.max);

    return {
        modelId: card.id,
        providerMode: card.providerMode,
        provider: (input.provider ?? "").trim(),
        similarity: card.similarity,
        similarityValue,
        customSize,
        sceneKeyword,
        maxOutputNum: cappedMax,
        outputOptions,
        executable: input.executable !== false,
        notices,
    };
}

/* ============================== 页面值 ============================== */

export type SceneSizeType = "default" | "custom";

export type SceneValues = {
    modelId: SceneModelId;
    /** 背景相似度（0–100）。智能模式下由能力决定实际提交值。 */
    similarity: number;
    /** 场景描述（可选，0–100）。 */
    prompt: string;
    /** 场景关键词，逗号分隔，进入 `sceneKeyword` 字段。 */
    sceneKeyword: string;
    sizeType: SceneSizeType;
    customWidth: number;
    customHeight: number;
    outputNum: number;
    sourceAssetId: string;
    imageName: string;
    /** 抠图引擎映射（`cutoutProvider`）；没有抠图链路时为空。 */
    cutoutProvider: string;
    /** 主体分割图资产 id（`segImageUrl`）；调用方显式提供才提交。 */
    segAssetId: string;
};

export const DEFAULT_SCENE_VALUES: SceneValues = {
    modelId: "realistic",
    similarity: SCENE_SIMILARITY.defaultValue,
    prompt: "",
    sceneKeyword: "",
    sizeType: "default",
    customWidth: SCENE_CUSTOM_SIZE.defaultValue,
    customHeight: SCENE_CUSTOM_SIZE.defaultValue,
    outputNum: 1,
    sourceAssetId: "",
    imageName: "",
    cutoutProvider: "",
    segAssetId: "",
};

export type SceneSourceAsset = {
    assetId: string;
    name?: string;
    width?: number;
    height?: number;
    mimeType?: string;
    bytes?: number;
    /** 会话内可访问的 URL（blob/objectURL）；空表示刷新后需要重新取回。 */
    url?: string;
    /** 主体分割图 URL（调用方显式提供，例如透明底或外部抠图结果）。 */
    segmentationUrl?: string;
    /** 抠图引擎标识（`cutoutProvider`），没有分割图时必须为空。 */
    cutoutProvider?: string;
};

/* ============================== 输出尺寸 ============================== */

export type SceneOutput = {
    sizeType: SceneSizeType;
    width: number;
    height: number;
    /** 归约后的比例标签，例如 "3:4"。 */
    ratio: string;
    /** 交给 provider 的 size 字符串，例如 "1024x1368"。 */
    requestSize: string;
    /** 展示用文案。 */
    label: string;
    /** 默认尺寸命中的比例档位；自定义时不参与。 */
    preset?: string;
};

const DEFAULT_SCENE_PRESETS: readonly { ratio: string; width: number; height: number }[] = [
    { ratio: "1:1", width: 1024, height: 1024 },
    { ratio: "4:5", width: 1024, height: 1280 },
    { ratio: "5:4", width: 1280, height: 1024 },
    { ratio: "3:4", width: 1024, height: 1365 },
    { ratio: "4:3", width: 1365, height: 1024 },
    { ratio: "9:16", width: 864, height: 1536 },
    { ratio: "16:9", width: 1536, height: 864 },
    { ratio: "2:3", width: 1024, height: 1536 },
    { ratio: "3:2", width: 1536, height: 1024 },
];

export function gcd(a: number, b: number): number {
    let x = Math.abs(Math.round(a));
    let y = Math.abs(Math.round(b));
    while (y) {
        [x, y] = [y, x % y];
    }
    return x || 1;
}

export function ratioLabel(width: number, height: number): string {
    if (!width || !height) return "";
    const divisor = gcd(width, height);
    return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function snapToStep(value: number): number {
    return Math.max(SCENE_CUSTOM_SIZE.min, Math.round(value / SCENE_CUSTOM_SIZE.step) * SCENE_CUSTOM_SIZE.step);
}

/** 与源图比例最接近的默认尺寸档位。源图比例未知时给 1:1。 */
export function nearestScenePreset(width?: number, height?: number) {
    if (!width || !height) return DEFAULT_SCENE_PRESETS[0];
    const target = width / height;
    let best = DEFAULT_SCENE_PRESETS[0];
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const preset of DEFAULT_SCENE_PRESETS) {
        const delta = Math.abs(Math.log(preset.width / preset.height) - Math.log(target));
        if (delta < bestDelta) {
            best = preset;
            bestDelta = delta;
        }
    }
    return best;
}

/**
 * 计算本次提交的真实尺寸。自定义尺寸即使越界也照实返回（由校验给出说明），
 * 不在这里偷偷改成合法值——否则用户看到的和提交的不是同一个请求。
 */
export function computeSceneOutput(values: SceneValues, source?: Pick<SceneSourceAsset, "width" | "height"> | null): SceneOutput {
    if (values.sizeType === "custom") {
        const width = Math.round(Number(values.customWidth) || 0);
        const height = Math.round(Number(values.customHeight) || 0);
        return {
            sizeType: "custom",
            width,
            height,
            ratio: ratioLabel(width, height),
            requestSize: width > 0 && height > 0 ? `${width}x${height}` : "",
            label: width > 0 && height > 0 ? `${width} × ${height}（${ratioLabel(width, height)}）` : "未填写自定义尺寸",
        };
    }
    const preset = nearestScenePreset(source?.width, source?.height);
    return {
        sizeType: "default",
        width: preset.width,
        height: preset.height,
        ratio: preset.ratio,
        requestSize: `${preset.width}x${preset.height}`,
        label: `${preset.width} × ${preset.height}（${preset.ratio}）`,
        preset: preset.ratio,
    };
}

/* ============================== 联调：值收敛 ============================== */

export type SceneLinkChange = { field: string; from: unknown; to: unknown; reason: string };

export type SceneLinkResult = { values: SceneValues; changes: SceneLinkChange[] };

/**
 * 能力联动：把不符合当前 Provider 能力的值收敛到可提交范围，并给出每一条改动的原因。
 * 页面把 changes 直接显示出来，禁止静默改值。
 */
export function linkSceneValues(values: SceneValues, capability: SceneProviderCapability): SceneLinkResult {
    const next: SceneValues = { ...values };
    const changes: SceneLinkChange[] = [];

    const modelCard = sceneModelCard(values.modelId);
    if (modelCard.id !== values.modelId) {
        changes.push({ field: "modelId", from: values.modelId, to: modelCard.id, reason: "未知模型卡片，回落到写实" });
        next.modelId = modelCard.id;
    }

    const allowed = capability.outputOptions;
    if (allowed.length > 0 && !allowed.includes(next.outputNum)) {
        const fallback = allowed.includes(1) ? 1 : allowed[0];
        changes.push({
            field: "outputNum",
            from: next.outputNum,
            to: fallback,
            reason: `当前模型可选张数为 ${allowed.join("/")}，已从默认值收敛`,
        });
        next.outputNum = fallback;
    }

    if (!capability.customSize && next.sizeType === "custom") {
        changes.push({ field: "sizeType", from: "custom", to: "default", reason: "当前模型不支持自定义宽高" });
        next.sizeType = "default";
    }

    if (!capability.sceneKeyword && next.sceneKeyword.trim()) {
        // 关键词仍会进入提示词，但不再提交到自己的字段，避免被上游静默忽略。
        changes.push({ field: "sceneKeyword", from: next.sceneKeyword, to: next.sceneKeyword, reason: "当前模型不消费 sceneKeyword 字段，关键词只进入提示词" });
    }

    if (capability.similarity === "auto") {
        const effective = effectiveSceneStrength(next, capability);
        if (next.similarity !== effective) {
            changes.push({ field: "similarity", from: next.similarity, to: effective, reason: "智能模式由模型自动决定场景相似度" });
            next.similarity = effective;
        }
    } else {
        const clamped = clampInt(next.similarity, SCENE_SIMILARITY.min, SCENE_SIMILARITY.max);
        if (clamped !== next.similarity) {
            changes.push({ field: "similarity", from: next.similarity, to: clamped, reason: "相似度范围 0–100" });
            next.similarity = clamped;
        }
    }

    if (next.prompt.length > SCENE_PROMPT_LIMIT) {
        changes.push({
            field: "prompt",
            from: `${next.prompt.length} 字`,
            to: `${SCENE_PROMPT_LIMIT} 字`,
            reason: `场景描述上限 ${SCENE_PROMPT_LIMIT} 字`,
        });
        next.prompt = next.prompt.slice(0, SCENE_PROMPT_LIMIT);
    }

    return { values: next, changes };
}

/** 实际提交给 provider 的强度值：智能模式用能力给定的自动值。 */
export function effectiveSceneStrength(values: SceneValues, capability: SceneProviderCapability): number {
    return capability.similarity === "auto" ? capability.similarityValue : clampInt(values.similarity, SCENE_SIMILARITY.min, SCENE_SIMILARITY.max);
}

/* ============================== 提示词 ============================== */

function splitKeywords(raw: string): string[] {
    return raw
        .split(/[,，、;；\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 12);
}

/** 组装提交给 provider 的提示词：模型风格 + 场景关键词 + 用户描述 + 相似度约束。 */
export function buildScenePrompt(values: SceneValues, capability: SceneProviderCapability): string {
    const card = sceneModelCard(values.modelId);
    const keywords = splitKeywords(values.sceneKeyword);
    const strength = effectiveSceneStrength(values, capability);
    const parts: string[] = [];
    parts.push(`基于参考图中的商品主体生成新的商品场景图；${card.promptStyle}。`);
    if (keywords.length) parts.push(`场景关键词：${keywords.join("、")}。`);
    const description = values.prompt.trim();
    if (description) parts.push(`场景描述：${description}`);
    if (capability.similarity === "auto") {
        parts.push("背景相似度由模型自动决定，保持商品主体在画面中的相对位置与朝向。");
    } else {
        parts.push(`背景与参考场景的相似度约 ${strength}%（0 = 完全重构，100 = 几乎复刻）。`);
    }
    parts.push("保持商品外观、颜色、材质、文字与 Logo 不变，不要新增商品，不要改变商品数量。");
    return parts.join(" ");
}

/* ============================== 校验 ============================== */

export type SceneIssueCode =
    | "source-missing"
    | "source-size"
    | "source-aspect"
    | "prompt-too-long"
    | "custom-size-range"
    | "custom-size-aspect"
    | "output-num-unsupported"
    | "model-not-ready"
    | "provider-not-executable"
    | "segmentation-missing";

export type SceneIssue = { code: SceneIssueCode; field: string; message: string };

export type ValidateSceneStateInput = {
    values: SceneValues;
    output: SceneOutput;
    sourceReady: boolean;
    source?: Pick<SceneSourceAsset, "width" | "height"> | null;
    imageModelReady: boolean;
    capability: SceneProviderCapability;
};

export function validateSceneState(input: ValidateSceneStateInput): SceneIssue[] {
    const issues: SceneIssue[] = [];
    const { values, output, capability } = input;

    if (!input.sourceReady) {
        issues.push({ code: "source-missing", field: "sourceAssetId", message: "请先上传商品场景参考图" });
    }
    if (!input.imageModelReady) {
        issues.push({ code: "model-not-ready", field: "provider", message: "未配置生图模型，无法提交真实生成" });
    }
    if (!capability.executable) {
        issues.push({ code: "provider-not-executable", field: "provider", message: "当前运行时不支持该工具的真实生成" });
    }
    if (values.prompt.length > SCENE_PROMPT_LIMIT) {
        issues.push({ code: "prompt-too-long", field: "prompt", message: `场景描述最多 ${SCENE_PROMPT_LIMIT} 字，当前 ${values.prompt.length} 字` });
    }
    if (!capability.outputOptions.includes(values.outputNum)) {
        issues.push({
            code: "output-num-unsupported",
            field: "outputNum",
            message: `当前模型只支持 ${capability.outputOptions.join("/")} 张`,
        });
    }
    if (values.sizeType === "custom") {
        const { width, height } = output;
        const inRange =
            width >= SCENE_CUSTOM_SIZE.min &&
            width <= SCENE_CUSTOM_SIZE.max &&
            height >= SCENE_CUSTOM_SIZE.min &&
            height <= SCENE_CUSTOM_SIZE.max;
        if (!inRange) {
            issues.push({
                code: "custom-size-range",
                field: "customWidth",
                message: `自定义尺寸需在 ${SCENE_CUSTOM_SIZE.min}–${SCENE_CUSTOM_SIZE.max} 之间，当前 ${width}×${height}`,
            });
        } else {
            const aspect = Math.max(width / height, height / width);
            if (aspect > SCENE_CUSTOM_SIZE.maxAspect) {
                issues.push({
                    code: "custom-size-aspect",
                    field: "customWidth",
                    message: `最大宽高比为 ${SCENE_CUSTOM_SIZE.maxAspect}，当前 ${aspect.toFixed(2)}`,
                });
            }
        }
    }
    return issues;
}

export type SceneSourceIssue = { ok: boolean; message?: string };

/** 源图约束：分辨率区间 + 最大宽高比。宽高未知时不拦截，交给上传管线自己的像素校验。 */
export function validateSceneSource(source?: Pick<SceneSourceAsset, "width" | "height" | "mimeType" | "bytes"> | null): SceneSourceIssue {
    if (!source) return { ok: false, message: "请先上传商品场景参考图" };
    if (source.mimeType && !SCENE_SOURCE_LIMITS.mimeTypes.includes(source.mimeType)) {
        return { ok: false, message: `仅支持 ${SCENE_SOURCE_LIMITS.mimeTypes.map((item) => item.replace("image/", "")).join("/")}` };
    }
    if (typeof source.bytes === "number" && source.bytes > SCENE_SOURCE_LIMITS.maxBytes) {
        return { ok: false, message: "图片超过 10M" };
    }
    const { width, height } = source;
    if (width && height) {
        if (width < SCENE_CUSTOM_SIZE.min || height < SCENE_CUSTOM_SIZE.min) {
            return { ok: false, message: `分辨率需 ≥ ${SCENE_CUSTOM_SIZE.min}×${SCENE_CUSTOM_SIZE.min}` };
        }
        if (width > SCENE_CUSTOM_SIZE.max || height > SCENE_CUSTOM_SIZE.max) {
            return { ok: false, message: `分辨率需 ≤ ${SCENE_CUSTOM_SIZE.max}×${SCENE_CUSTOM_SIZE.max}` };
        }
        const aspect = Math.max(width / height, height / width);
        if (aspect > SCENE_CUSTOM_SIZE.maxAspect) {
            return { ok: false, message: `最大宽高比为 ${SCENE_CUSTOM_SIZE.maxAspect}，当前 ${aspect.toFixed(2)}` };
        }
    }
    return { ok: true };
}

/** 主体分割图：没有分割服务时不提交假的 segImageUrl。 */
export function resolveSceneSegmentation(source?: Pick<SceneSourceAsset, "segmentationUrl" | "cutoutProvider"> | null): {
    segImageUrl?: string;
    cutoutProvider?: string;
    missing: boolean;
    reason?: string;
} {
    const url = (source?.segmentationUrl ?? "").trim();
    if (!url) {
        return { missing: true, reason: "当前环境未接入主体分割服务，segImageUrl 不会提交（不会用原图冒充分割图）" };
    }
    return { segImageUrl: url, cutoutProvider: (source?.cutoutProvider ?? "").trim() || undefined, missing: false };
}

/* ============================== 草稿解析 ============================== */

function num(value: unknown, fallback: number): number {
    const parsed = typeof value === "string" ? Number(value) : value;
    return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : fallback;
}

function str(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
}

export function isSceneModelId(value: unknown): value is SceneModelId {
    return SCENE_MODELS.some((item) => item.id === value);
}

export function readSceneValues(raw?: Record<string, unknown> | null): SceneValues {
    if (!raw) return { ...DEFAULT_SCENE_VALUES };
    return {
        modelId: isSceneModelId(raw.modelId) ? raw.modelId : DEFAULT_SCENE_VALUES.modelId,
        similarity: clampInt(num(raw.similarity, DEFAULT_SCENE_VALUES.similarity), SCENE_SIMILARITY.min, SCENE_SIMILARITY.max),
        prompt: str(raw.prompt, DEFAULT_SCENE_VALUES.prompt).slice(0, SCENE_PROMPT_LIMIT),
        sceneKeyword: str(raw.sceneKeyword, DEFAULT_SCENE_VALUES.sceneKeyword),
        sizeType: raw.sizeType === "custom" ? "custom" : "default",
        customWidth: clampInt(num(raw.customWidth, DEFAULT_SCENE_VALUES.customWidth), SCENE_CUSTOM_SIZE.min, SCENE_CUSTOM_SIZE.max),
        customHeight: clampInt(num(raw.customHeight, DEFAULT_SCENE_VALUES.customHeight), SCENE_CUSTOM_SIZE.min, SCENE_CUSTOM_SIZE.max),
        outputNum: Math.max(1, Math.min(SCENE_MAX_OUTPUT, Math.floor(num(raw.outputNum, DEFAULT_SCENE_VALUES.outputNum)))),
        sourceAssetId: str(raw.sourceAssetId, ""),
        imageName: str(raw.imageName, ""),
        cutoutProvider: str(raw.cutoutProvider, ""),
        segAssetId: str(raw.segAssetId, ""),
    };
}

/* ============================== 快照 ============================== */

export type SceneSnapshot = {
    toolId: string;
    revision: number | string | null;
    modelId: SceneModelId;
    provider: string;
    mode: SceneMode;
    strength: number;
    sceneKeyword: string;
    prompt: string;
    sizeType: SceneSizeType;
    width: number;
    height: number;
    ratio: string;
    outputNum: number;
    sourceAssetId: string;
};

export function createSceneSnapshot(
    values: SceneValues,
    output: SceneOutput,
    capability: SceneProviderCapability,
    source?: Pick<SceneSourceAsset, "assetId"> | null,
    revision: number | string | null = null,
): SceneSnapshot {
    return {
        toolId: PRODUCT_SCENE_TOOL_ID,
        revision,
        modelId: values.modelId,
        provider: capability.provider,
        mode: capability.providerMode,
        strength: effectiveSceneStrength(values, capability),
        sceneKeyword: splitKeywords(values.sceneKeyword).join("、"),
        prompt: values.prompt.trim(),
        sizeType: output.sizeType,
        width: output.width,
        height: output.height,
        ratio: output.ratio,
        outputNum: values.outputNum,
        sourceAssetId: source?.assetId ?? values.sourceAssetId,
    };
}

/** 结果只对“提交时的快照”负责：配置变了就明确说明结果来自旧版本。 */
export function describeSceneDrift(snapshot?: SceneSnapshot | null, current?: SceneSnapshot | null): string {
    if (!snapshot || !current) return "";
    const reasons: string[] = [];
    if (snapshot.sourceAssetId !== current.sourceAssetId) reasons.push("参考图");
    if (snapshot.modelId !== current.modelId) reasons.push("模型");
    if (snapshot.mode !== current.mode) reasons.push("生成模式");
    if (snapshot.strength !== current.strength) reasons.push("背景相似度");
    if (snapshot.sceneKeyword !== current.sceneKeyword) reasons.push("场景关键词");
    if (snapshot.prompt !== current.prompt) reasons.push("场景描述");
    if (snapshot.sizeType !== current.sizeType) reasons.push("尺寸类型");
    if (snapshot.width !== current.width || snapshot.height !== current.height) reasons.push("输出尺寸");
    if (snapshot.outputNum !== current.outputNum) reasons.push("生成张数");
    return reasons.join("、");
}

/* ============================== 小工具 ============================== */

export function clampInt(value: number, min: number, max: number): number {
    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed)) return min;
    return Math.max(min, Math.min(max, parsed));
}

export function sceneOutputOptionLabel(count: number): string {
    return `${count} 张`;
}

/** 提交按钮旁的产物说明（不显示原站算力，只说明真实产物）。 */
export function describeSceneProduct(output: SceneOutput, count: number): string {
    return `将生成 ${count} 张 ${output.width}×${output.height}（${output.ratio}）场景变体`;
}

export { splitKeywords as splitSceneKeywords, snapToStep as snapSceneSize };
