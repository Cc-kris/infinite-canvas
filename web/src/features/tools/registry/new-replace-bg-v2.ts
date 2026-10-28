/**
 * TASK-022：NEW_REPLACE_BG_V2（商品图 / 商品图设计）的页面契约。
 *
 * 事实来源：
 * - docs/V1.0/plan_linkfox_navigation/page-specs/15-new-replace-bg-v2.md
 *   （页面类型 `scene`，chunk 状态：canvasData / sizeData / imageRecords / bgLayerRef /
 *    goodsLayerRef / bgMaskLayerRef / bgEraseLayerRef / bgExtractLayerRef / lockCutoutModal /
 *    weight=.7 / sceneType=Recommend）
 * - docs/V1.0/plan_linkfox_navigation/tool_specs.json#NEW_REPLACE_BG_V2（makeType 28，layout scene，
 *   无独立 make 字段 → 由场景画布状态序列化）
 *
 * 真实边界（不接受演示成功）：
 * - 本页是「图层合成工作台」，不是「上传 + 提示词 + 结果」的空壳：背景层 / 商品层 / 材质层 / 锁定层
 *   各自有可见与锁定状态，商品层有真实的位置 / 缩放 / 旋转，融合强度与场景类型进入任务快照；
 * - 提交时画布状态被序列化成 canvasData + sizeData + imageRecords 三个真实字段，并同时写进提示词，
 *   因为 provider 侧的 NEW_REPLACE_BG_V2 没有独立 make 字段（见 registry/index.ts `fields: []`）；
 * - 抠图确认 = 真实的前置门禁：要么画主体蒙版（导出 PNG 参与请求），要么商品本身就是带 alpha 的 PNG；
 *   条件不满足时提交按钮保持禁用，绝不"假装已抠图"；
 * - 本模块只做纯逻辑（可 SSR / 可单测），不触碰网络与 DOM。
 */

export const NEW_REPLACE_BG_V2_TOOL_ID = "NEW_REPLACE_BG_V2";
export const NEW_REPLACE_BG_V2_TITLE = "商品图";
export const NEW_REPLACE_BG_V2_ROUTE = "/tools/product-design/new-replace-bg-v2";
export const NEW_REPLACE_BG_V2_DRAFT_KEY = "tool-draft:v1:NEW_REPLACE_BG_V2";

/* ============================== 素材约束 ============================== */

/** 商品图：与页面规格一致（jpg/jpeg/png/webp，20M 内）。 */
export const SCENE_SOURCE_LIMITS = {
    mimeTypes: ["image/png", "image/jpeg", "image/webp"] as const,
    maxBytes: 20 * 1024 * 1024,
    minSide: 64,
    maxSide: 8192,
};

/** 自定义背景图：同一套格式约束，同样 20M。 */
export const SCENE_BACKGROUND_LIMITS = SCENE_SOURCE_LIMITS;

/** 主体蒙版：由页面画布导出的 PNG（白=主体，黑=保留）。 */
export const SCENE_MASK_LIMITS = {
    mimeTypes: ["image/png"] as const,
    maxBytes: 8 * 1024 * 1024,
};

/* ============================== 场景类型 ============================== */

export type SceneTypeId = "recommend" | "custom";

export type SceneTypeOption = {
    id: SceneTypeId;
    label: string;
    hint: string;
};

/** chunk 里 `sceneType=Recommend` 是默认值；`Custom` 是同一枚举的另一态。 */
export const SCENE_TYPES: readonly SceneTypeOption[] = [
    { id: "recommend", label: "推荐场景", hint: "从场景模板里选一个，按商品品类给光线与台面" },
    { id: "custom", label: "自定义背景", hint: "上传自己的背景图，或写清楚要什么场景" },
];

export function isSceneTypeId(value: unknown): value is SceneTypeId {
    return typeof value === "string" && SCENE_TYPES.some((item) => item.id === value);
}

export function sceneType(id: unknown): SceneTypeOption {
    return SCENE_TYPES.find((item) => item.id === id) ?? SCENE_TYPES[0];
}

/* ============================== 场景模板 ============================== */

export type SceneTemplate = {
    id: string;
    label: string;
    hint: string;
    /** 真正进入提示词的场景描述（不是仅展示的标签）。 */
    prompt: string;
};

/** 场景推荐层的真实模板集合；每项都带可执行的场景描述。 */
export const SCENE_TEMPLATES: readonly SceneTemplate[] = [
    {
        id: "studio-white",
        label: "影棚白底",
        hint: "干净纯白，适合主图",
        prompt: "干净的纯白影棚背景，柔和顶光与轻微接地阴影，商品居中，商业产品摄影",
    },
    {
        id: "marble-counter",
        label: "大理石台面",
        hint: "香化 / 饰品常用",
        prompt: "浅灰白大理石台面，背景米色墙，柔光侧逆光，台面反射自然，极简质感",
    },
    {
        id: "wood-table",
        label: "原木桌面",
        hint: "家居 / 食品",
        prompt: "浅色原木桌面与米白墙面，窗外自然光，木纹清晰，生活化暖调",
    },
    {
        id: "outdoor-grass",
        label: "户外草地",
        hint: "户外 / 运动",
        prompt: "户外草地与柔和阳光，背景虚化的树木与天空，自然投影，清爽通透",
    },
    {
        id: "living-room",
        label: "家居客厅",
        hint: "大件商品",
        prompt: "现代简约客厅，浅灰沙发与木质边几，落地窗自然光，空间纵深感",
    },
    {
        id: "bathroom-shelf",
        label: "浴室台面",
        hint: "个护 / 洗护",
        prompt: "浴室石材台面与磨砂玻璃背景，水滴质感，冷调柔光，干净通透",
    },
    {
        id: "gradient-color",
        label: "纯色渐变",
        hint: "电商海报",
        prompt: "低饱和渐变背景，中心柔光晕圈，无杂物，商品边缘干净",
    },
    {
        id: "holiday",
        label: "节日氛围",
        hint: "礼赠场景",
        prompt: "节日氛围背景，暖色灯光与轻微散景装饰，商品位于画面中心偏下，喜庆不杂乱",
    },
];

export function sceneTemplate(id: unknown): SceneTemplate | undefined {
    return typeof id === "string" ? SCENE_TEMPLATES.find((item) => item.id === id) : undefined;
}

/** 自定义场景描述上限（与原站同类文本框一致，避免超长提示词被截断）。 */
export const MAX_CUSTOM_SCENE_PROMPT = 200;

/* ============================== 输出规格 ============================== */

export const SCENE_OUTPUT_RATIOS = ["1:1", "4:5", "3:4", "16:9", "9:16"] as const;
export type SceneOutputRatio = (typeof SCENE_OUTPUT_RATIOS)[number];

export function isSceneOutputRatio(value: unknown): value is SceneOutputRatio {
    return typeof value === "string" && (SCENE_OUTPUT_RATIOS as readonly string[]).includes(value);
}

const RATIO_SIZES: Record<SceneOutputRatio, { width: number; height: number }> = {
    "1:1": { width: 1024, height: 1024 },
    "4:5": { width: 1024, height: 1280 },
    "3:4": { width: 960, height: 1280 },
    "16:9": { width: 1280, height: 720 },
    "9:16": { width: 720, height: 1280 },
};

/** 结果数量 = 结果网格的格子数；页面按 1 / 2 / 4 排布。 */
export const SCENE_OUTPUT_COUNTS = [1, 2, 4] as const;
export const DEFAULT_SCENE_OUTPUT_COUNT = 1;

export type SceneOutput = {
    ratio: SceneOutputRatio;
    width: number;
    height: number;
    count: number;
    label: string;
    legal: boolean;
    issues: { code: string; message: string }[];
};

export function computeSceneOutput(ratio: unknown, count: unknown): SceneOutput {
    const safeRatio: SceneOutputRatio = isSceneOutputRatio(ratio) ? ratio : "1:1";
    const size = RATIO_SIZES[safeRatio];
    const parsed = Math.floor(Math.abs(Number(count)));
    const safeCount = (SCENE_OUTPUT_COUNTS as readonly number[]).includes(parsed) ? parsed : DEFAULT_SCENE_OUTPUT_COUNT;
    const issues: { code: string; message: string }[] = [];
    if (!isSceneOutputRatio(ratio)) issues.push({ code: "ratio-invalid", message: "请选择输出比例。" });
    if (!(SCENE_OUTPUT_COUNTS as readonly number[]).includes(parsed)) {
        issues.push({ code: "count-invalid", message: "结果数量只能选 1 / 2 / 4。" });
    }
    return {
        ratio: safeRatio,
        width: size.width,
        height: size.height,
        count: safeCount,
        label: `${safeRatio} · ${size.width}×${size.height} · ${safeCount} 张`,
        legal: issues.length === 0,
        issues,
    };
}

/* ============================== 图层与变换 ============================== */

export const SCENE_LAYER_IDS = ["bg", "goods", "material", "lock"] as const;
export type SceneLayerId = (typeof SCENE_LAYER_IDS)[number];

export type SceneLayerMeta = { id: SceneLayerId; label: string; hint: string; role: string };

export const SCENE_LAYERS: readonly SceneLayerMeta[] = [
    { id: "bg", label: "背景层", hint: "场景模板或自定义背景，决定光线与台面", role: "background" },
    { id: "goods", label: "商品层", hint: "抠图后的商品主体，可拖动 / 缩放 / 旋转", role: "subject" },
    { id: "material", label: "材质层", hint: "台面材质与接触阴影，跟着背景走", role: "material" },
    { id: "lock", label: "锁定层", hint: "锁住的区域不参与重绘，保护商品轮廓", role: "protection" },
];

export function sceneLayerMeta(id: SceneLayerId): SceneLayerMeta {
    return SCENE_LAYERS.find((item) => item.id === id) ?? SCENE_LAYERS[0];
}

export type SceneLayerState = { visible: boolean; locked: boolean };
export type SceneLayers = Record<SceneLayerId, SceneLayerState>;

export const DEFAULT_SCENE_LAYERS: SceneLayers = {
    bg: { visible: true, locked: false },
    goods: { visible: true, locked: false },
    material: { visible: true, locked: false },
    lock: { visible: true, locked: true },
};

/** 商品层变换：位置为画布归一化坐标（0~1，指中心点），缩放倍率与旋转角度。 */
export type SceneTransform = { x: number; y: number; scale: number; rotate: number };

export const SCENE_TRANSFORM_LIMITS = {
    position: { min: 0, max: 1 },
    scale: { min: 0.05, max: 2 },
    rotate: { min: -180, max: 180 },
};

export const DEFAULT_SCENE_TRANSFORM: SceneTransform = { x: 0.5, y: 0.56, scale: 1, rotate: 0 };

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

/** 越界值夹取而不是静默丢弃：滑杆/草稿脏值都回到合法区间。 */
export function clampSceneTransform(input: Partial<SceneTransform> | undefined, fallback: SceneTransform = DEFAULT_SCENE_TRANSFORM): SceneTransform {
    return {
        x: clampNumber(input?.x, SCENE_TRANSFORM_LIMITS.position.min, SCENE_TRANSFORM_LIMITS.position.max, fallback.x),
        y: clampNumber(input?.y, SCENE_TRANSFORM_LIMITS.position.min, SCENE_TRANSFORM_LIMITS.position.max, fallback.y),
        scale: clampNumber(input?.scale, SCENE_TRANSFORM_LIMITS.scale.min, SCENE_TRANSFORM_LIMITS.scale.max, fallback.scale),
        rotate: clampNumber(input?.rotate, SCENE_TRANSFORM_LIMITS.rotate.min, SCENE_TRANSFORM_LIMITS.rotate.max, fallback.rotate),
    };
}

export function roundSceneTransform(transform: SceneTransform): SceneTransform {
    return {
        x: Number(transform.x.toFixed(3)),
        y: Number(transform.y.toFixed(3)),
        scale: Number(transform.scale.toFixed(2)),
        rotate: Number(transform.rotate.toFixed(1)),
    };
}

export function transformSummary(transform: SceneTransform): string {
    const rounded = roundSceneTransform(transform);
    return `位置 ${Math.round(rounded.x * 100)}% / ${Math.round(rounded.y * 100)}%，缩放 ${Math.round(rounded.scale * 100)}%，旋转 ${rounded.rotate}°`;
}

/* ============================== 融合强度 ============================== */

export const SCENE_WEIGHT_LIMITS = { min: 0, max: 1, step: 0.05 };
/** chunk 里的默认 weight=.7。 */
export const DEFAULT_SCENE_WEIGHT = 0.7;

export function clampSceneWeight(value: unknown): number {
    const clamped = clampNumber(value, SCENE_WEIGHT_LIMITS.min, SCENE_WEIGHT_LIMITS.max, DEFAULT_SCENE_WEIGHT);
    return Number((Math.round(clamped / SCENE_WEIGHT_LIMITS.step) * SCENE_WEIGHT_LIMITS.step).toFixed(2));
}

export function sceneWeightLabel(value: number): string {
    if (value <= 0.25) return "弱（更贴合原图）";
    if (value <= 0.55) return "中（保留商品细节）";
    if (value <= 0.8) return "偏强（更融入场景）";
    return "强（场景主导）";
}

/* ============================== 抠图确认 ============================== */

export type SceneCutoutMode = "mask" | "transparent";

export const SCENE_CUTOUT_MODES: readonly { id: SceneCutoutMode; label: string; hint: string }[] = [
    { id: "mask", label: "画主体蒙版", hint: "在原图上涂出商品主体，蒙版 PNG 随请求一起提交" },
    { id: "transparent", label: "已是透明底 PNG", hint: "商品图本身带 alpha 通道，直接作为商品层" },
];

export function isSceneCutoutMode(value: unknown): value is SceneCutoutMode {
    return typeof value === "string" && SCENE_CUTOUT_MODES.some((item) => item.id === value);
}

export type CutoutReadiness = {
    mode: SceneCutoutMode;
    /** 抠图门禁是否真正满足（不是"用户点过按钮"）。 */
    ready: boolean;
    /** 未满足时的原因，用于就地提示。 */
    reason?: string;
    code?: "cutout-mask-missing" | "cutout-transparent-required" | "cutout-unconfirmed";
};

export type CutoutEvidence = {
    maskReady?: boolean;
    /** UI 真实解码像素后检测到的 alpha 通道。 */
    goodsHasAlpha?: boolean;
    confirmed?: boolean;
};

/** 抠图确认：先看素材证据，再看用户确认，两层都过才放行。 */
export function resolveCutoutReadiness(mode: SceneCutoutMode, evidence: CutoutEvidence): CutoutReadiness {
    const safeMode: SceneCutoutMode = isSceneCutoutMode(mode) ? mode : "mask";
    if (safeMode === "mask" && !evidence.maskReady) {
        return { mode: safeMode, ready: false, code: "cutout-mask-missing", reason: "请先在商品图上涂出主体，生成蒙版后再确认抠图。" };
    }
    if (safeMode === "transparent" && !evidence.goodsHasAlpha) {
        return { mode: safeMode, ready: false, code: "cutout-transparent-required", reason: "当前商品图没有透明通道，请换透明底 PNG 或改用蒙版抠图。" };
    }
    if (!evidence.confirmed) {
        return { mode: safeMode, ready: false, code: "cutout-unconfirmed", reason: "请核对抠图边缘后点击「确认抠图」。" };
    }
    return { mode: safeMode, ready: true };
}

/* ============================== 页面值 ============================== */

export type NewReplaceBgValues = {
    sceneType: SceneTypeId;
    templateId: string;
    customPrompt: string;
    weight: number;
    ratio: SceneOutputRatio;
    outputNum: number;
    transform: SceneTransform;
    layers: SceneLayers;
    cutoutMode: SceneCutoutMode;
    cutoutConfirmed: boolean;
    lockCutout: boolean;
    withMaterial: boolean;
    goodsAssetId: string;
    goodsName: string;
    bgAssetId: string;
    maskAssetId: string;
};

export const DEFAULT_NEW_REPLACE_BG_VALUES: NewReplaceBgValues = {
    sceneType: "recommend",
    templateId: SCENE_TEMPLATES[0].id,
    customPrompt: "",
    weight: DEFAULT_SCENE_WEIGHT,
    ratio: "1:1",
    outputNum: DEFAULT_SCENE_OUTPUT_COUNT,
    transform: { ...DEFAULT_SCENE_TRANSFORM },
    layers: {
        bg: { ...DEFAULT_SCENE_LAYERS.bg },
        goods: { ...DEFAULT_SCENE_LAYERS.goods },
        material: { ...DEFAULT_SCENE_LAYERS.material },
        lock: { ...DEFAULT_SCENE_LAYERS.lock },
    },
    cutoutMode: "mask",
    cutoutConfirmed: false,
    lockCutout: true,
    withMaterial: true,
    goodsAssetId: "",
    goodsName: "",
    bgAssetId: "",
    maskAssetId: "",
};

function readLayers(raw: unknown): SceneLayers {
    const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const result = {} as SceneLayers;
    for (const id of SCENE_LAYER_IDS) {
        const candidate = record[id] && typeof record[id] === "object" ? (record[id] as Record<string, unknown>) : {};
        result[id] = {
            visible: typeof candidate.visible === "boolean" ? candidate.visible : DEFAULT_SCENE_LAYERS[id].visible,
            locked: typeof candidate.locked === "boolean" ? candidate.locked : DEFAULT_SCENE_LAYERS[id].locked,
        };
    }
    return result;
}

/**
 * 草稿容错收口：未知键丢弃、枚举回落到安全值、越界数值夹取。
 * 蒙版本体（data URL）不进草稿，只保留资产 id。
 */
export function readNewReplaceBgValues(raw: unknown): NewReplaceBgValues {
    const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const sceneTypeId = isSceneTypeId(record.sceneType) ? record.sceneType : DEFAULT_NEW_REPLACE_BG_VALUES.sceneType;
    const template = sceneTemplate(record.templateId);
    const customPrompt = typeof record.customPrompt === "string" ? record.customPrompt.slice(0, MAX_CUSTOM_SCENE_PROMPT) : "";
    return {
        sceneType: sceneTypeId,
        templateId: template?.id ?? (sceneTypeId === "custom" ? "" : DEFAULT_NEW_REPLACE_BG_VALUES.templateId),
        customPrompt,
        weight: clampSceneWeight(record.weight),
        ratio: isSceneOutputRatio(record.ratio) ? record.ratio : DEFAULT_NEW_REPLACE_BG_VALUES.ratio,
        outputNum: (SCENE_OUTPUT_COUNTS as readonly number[]).includes(Number(record.outputNum))
            ? Number(record.outputNum)
            : DEFAULT_NEW_REPLACE_BG_VALUES.outputNum,
        transform: clampSceneTransform(record.transform as Partial<SceneTransform> | undefined),
        layers: readLayers(record.layers),
        cutoutMode: isSceneCutoutMode(record.cutoutMode) ? record.cutoutMode : "mask",
        cutoutConfirmed: record.cutoutConfirmed === true,
        lockCutout: record.lockCutout !== false,
        withMaterial: record.withMaterial !== false,
        goodsAssetId: typeof record.goodsAssetId === "string" ? record.goodsAssetId : "",
        goodsName: typeof record.goodsName === "string" ? record.goodsName.slice(0, 120) : "",
        bgAssetId: typeof record.bgAssetId === "string" ? record.bgAssetId : "",
        maskAssetId: typeof record.maskAssetId === "string" ? record.maskAssetId : "",
    };
}

/* ============================== 校验 ============================== */

export type NewReplaceBgIssue = { code: string; field: string; message: string };

export type NewReplaceBgValidationInput = {
    values: NewReplaceBgValues;
    output: SceneOutput;
    goodsReady: boolean;
    cutout: CutoutReadiness;
    imageModelReady: boolean;
};

export function validateNewReplaceBgState({ values, output, goodsReady, cutout, imageModelReady }: NewReplaceBgValidationInput): NewReplaceBgIssue[] {
    const issues: NewReplaceBgIssue[] = [];
    if (!goodsReady) issues.push({ code: "goods-missing", field: "goodsAssetId", message: "请先上传商品图。" });
    if (!cutout.ready) issues.push({ code: cutout.code ?? "cutout-unconfirmed", field: "cutoutConfirmed", message: cutout.reason ?? "请先完成抠图确认。" });

    if (values.sceneType === "recommend") {
        if (!sceneTemplate(values.templateId)) issues.push({ code: "template-missing", field: "templateId", message: "请选择场景模板。" });
    } else {
        const prompt = values.customPrompt.trim();
        if (!prompt && !values.bgAssetId) issues.push({ code: "custom-scene-missing", field: "customPrompt", message: "自定义场景需要填写场景描述或上传背景图。" });
        if (prompt.length > MAX_CUSTOM_SCENE_PROMPT) issues.push({ code: "custom-scene-too-long", field: "customPrompt", message: `场景描述最多 ${MAX_CUSTOM_SCENE_PROMPT} 字。` });
    }

    if (!values.layers.goods.visible) issues.push({ code: "goods-layer-hidden", field: "layers.goods", message: "商品层被隐藏，场景图里不会有商品主体。" });
    if (values.layers.bg.locked && values.layers.goods.locked && values.sceneType === "custom") {
        issues.push({ code: "all-layers-locked", field: "layers", message: "背景层与商品层都被锁定，本次合成无法调整，请解锁一层。" });
    }

    for (const issue of output.issues) issues.push({ ...issue, field: "output" });
    if (!imageModelReady) issues.push({ code: "model-missing", field: "model", message: "尚未配置图片模型，无法生成。" });
    return issues;
}

/* ============================== 提示词 ============================== */

/** 场景描述：模板优先，自定义透传用户原文。 */
export function resolveSceneDescription(values: NewReplaceBgValues): string {
    if (values.sceneType === "custom") return values.customPrompt.trim();
    return sceneTemplate(values.templateId)?.prompt ?? "";
}

/**
 * 提交给 provider 的提示词。NEW_REPLACE_BG_V2 没有独立 make 字段，
 * 因此场景类型 / 强度 / 图层策略 / 商品变换必须逐项出现在提示词里，才能真的影响结果。
 */
export function buildNewReplaceBgPrompt(values: NewReplaceBgValues, output: SceneOutput): string {
    const type = sceneType(values.sceneType);
    const description = resolveSceneDescription(values);
    const parts: string[] = [];
    parts.push(`把商品放进新的场景背景里，保持商品本体不变（不改变形状、logo、颜色和材质）。`);
    parts.push(`场景类型：${type.label}。`);
    if (description) parts.push(`场景描述：${description}。`);
    if (values.sceneType === "recommend" && values.templateId) {
        parts.push(`场景模板：${sceneTemplate(values.templateId)?.label ?? values.templateId}。`);
    }
    parts.push(
        `融合强度 ${Math.round(values.weight * 100)}%（${sceneWeightLabel(values.weight)}）：强度越高商品越融入场景光线与投影，但商品细节必须保留。`,
    );
    const rounded = roundSceneTransform(values.transform);
    parts.push(
        `商品位置：画面横向 ${Math.round(rounded.x * 100)}%、纵向 ${Math.round(rounded.y * 100)}%；缩放 ${Math.round(rounded.scale * 100)}%；旋转 ${rounded.rotate}°。`,
    );
    parts.push(values.lockCutout ? "锁定商品轮廓：商品边缘与主体内部不重绘。" : "允许重绘商品附近的环境过渡。");
    const hidden = SCENE_LAYER_IDS.filter((id) => !values.layers[id].visible).map((id) => sceneLayerMeta(id).label);
    if (hidden.length) parts.push(`隐藏图层：${hidden.join("、")}。`);
    if (!values.withMaterial) parts.push("不生成台面材质与接触阴影。");
    if (values.layers.lock.locked) parts.push("锁定层区域保持一致，不加入新的装饰物。");
    parts.push(`输出画布 ${output.width}×${output.height}（${output.ratio}），共 ${output.count} 张。`);
    return parts.join("\n");
}

/* ============================== 序列化字段 ============================== */

export type SceneSizeData = {
    width: number;
    height: number;
    ratio: SceneOutputRatio;
    count: number;
    unit: "px";
    layers: number;
};

export function buildSceneSizeData(values: NewReplaceBgValues, output: SceneOutput): SceneSizeData {
    return {
        width: output.width,
        height: output.height,
        ratio: output.ratio,
        // 以真正下发的 count 为准，避免页面控件与请求数量各说各话
        count: output.count,
        unit: "px",
        layers: SCENE_LAYER_IDS.filter((id) => values.layers[id].visible).length,
    };
}

export type SceneCanvasLayer = {
    id: SceneLayerId;
    role: string;
    visible: boolean;
    locked: boolean;
};

export type SceneCanvasData = {
    version: 1;
    sceneType: SceneTypeId;
    templateId: string;
    weight: number;
    ratio: SceneOutputRatio;
    width: number;
    height: number;
    goods: SceneTransform;
    lockCutout: boolean;
    withMaterial: boolean;
    layers: SceneCanvasLayer[];
};

/** 合成画布 → canvasData（真实请求字段之一）。 */
export function buildSceneCanvasData(values: NewReplaceBgValues, output: SceneOutput): SceneCanvasData {
    return {
        version: 1,
        sceneType: values.sceneType,
        templateId: values.sceneType === "recommend" ? values.templateId : "",
        weight: values.weight,
        ratio: output.ratio,
        width: output.width,
        height: output.height,
        goods: roundSceneTransform(values.transform),
        lockCutout: values.lockCutout,
        withMaterial: values.withMaterial,
        layers: SCENE_LAYER_IDS.map((id) => ({
            id,
            role: sceneLayerMeta(id).role,
            visible: values.layers[id].visible,
            locked: values.layers[id].locked,
        })),
    };
}

export type SceneImageRecord = {
    layer: SceneLayerId;
    assetId: string;
    name: string;
    role: string;
};

export function buildSceneImageRecords(
    values: NewReplaceBgValues,
    extra: { goodsName?: string; bgName?: string; maskName?: string } = {},
): SceneImageRecord[] {
    const records: SceneImageRecord[] = [];
    if (values.goodsAssetId) records.push({ layer: "goods", assetId: values.goodsAssetId, name: extra.goodsName || values.goodsName || "goods", role: "subject" });
    if (values.bgAssetId) records.push({ layer: "bg", assetId: values.bgAssetId, name: extra.bgName || "background", role: "background" });
    if (values.maskAssetId) records.push({ layer: "lock", assetId: values.maskAssetId, name: extra.maskName || "mask", role: "protection" });
    return records;
}

/* ============================== 步骤条 ============================== */

export type SceneStepId = "upload" | "cutout" | "scene" | "result";
export type SceneStepStatus = "done" | "active" | "todo";

export type SceneStep = { id: SceneStepId; label: string; status: SceneStepStatus; hint: string };

export function sceneSteps(input: { goodsReady: boolean; cutoutReady: boolean; sceneReady: boolean; hasResult: boolean }): SceneStep[] {
    const upload: SceneStepStatus = input.goodsReady ? "done" : "active";
    const cutout: SceneStepStatus = !input.goodsReady ? "todo" : input.cutoutReady ? "done" : "active";
    const scene: SceneStepStatus = !input.cutoutReady ? "todo" : input.sceneReady ? "done" : "active";
    const result: SceneStepStatus = !input.sceneReady ? "todo" : input.hasResult ? "done" : "active";
    return [
        { id: "upload", label: "上传商品", status: upload, hint: "jpg / png / webp，20M 以内" },
        { id: "cutout", label: "抠图确认", status: cutout, hint: "涂主体蒙版或使用透明底 PNG" },
        { id: "scene", label: "场景模板 / 自定义", status: scene, hint: "模板或自定义背景 + 融合强度" },
        { id: "result", label: "结果网格", status: result, hint: "生成后按网格展示并可保存" },
    ];
}

/* ============================== 快照 ============================== */

export type NewReplaceBgSnapshot = {
    toolId: string;
    sceneType: SceneTypeId;
    templateId: string;
    customPrompt: string;
    weight: number;
    ratio: SceneOutputRatio;
    width: number;
    height: number;
    count: number;
    goods: SceneTransform;
    layers: SceneLayers;
    cutoutMode: SceneCutoutMode;
    lockCutout: boolean;
    withMaterial: boolean;
    goodsAssetId: string;
    bgAssetId: string;
    maskAssetId: string;
    revision: number | string | null;
    fingerprint: string;
};

export function newReplaceBgFingerprint(input: Omit<NewReplaceBgSnapshot, "fingerprint" | "toolId">): string {
    const parts = [
        input.sceneType,
        input.templateId,
        input.customPrompt,
        String(input.weight),
        input.ratio,
        `${input.width}x${input.height}`,
        String(input.count),
        `${input.goods.x},${input.goods.y},${input.goods.scale},${input.goods.rotate}`,
        SCENE_LAYER_IDS.map((id) => `${id}:${input.layers[id].visible ? 1 : 0}${input.layers[id].locked ? 1 : 0}`).join("/"),
        input.cutoutMode,
        input.lockCutout ? "lock" : "free",
        input.withMaterial ? "material" : "no-material",
        input.goodsAssetId,
        input.bgAssetId,
        input.maskAssetId,
        String(input.revision ?? ""),
    ].join("|");
    let hash = 2166136261;
    for (let index = 0; index < parts.length; index += 1) {
        hash ^= parts.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `scene-${(hash >>> 0).toString(16)}`;
}

export function createNewReplaceBgSnapshot(
    values: NewReplaceBgValues,
    output: SceneOutput,
    revision: number | string | null = null,
): NewReplaceBgSnapshot {
    const base = {
        sceneType: values.sceneType,
        templateId: values.sceneType === "recommend" ? values.templateId : "",
        customPrompt: values.sceneType === "custom" ? values.customPrompt.trim() : "",
        weight: values.weight,
        ratio: output.ratio,
        width: output.width,
        height: output.height,
        count: values.outputNum,
        goods: roundSceneTransform(values.transform),
        layers: values.layers,
        cutoutMode: values.cutoutMode,
        lockCutout: values.lockCutout,
        withMaterial: values.withMaterial,
        goodsAssetId: values.goodsAssetId,
        bgAssetId: values.bgAssetId,
        maskAssetId: values.maskAssetId,
        revision,
    };
    return { toolId: NEW_REPLACE_BG_V2_TOOL_ID, ...base, fingerprint: newReplaceBgFingerprint(base) };
}

export function isNewReplaceBgSnapshotStale(
    snapshot: NewReplaceBgSnapshot | undefined,
    current: NewReplaceBgSnapshot | undefined,
): boolean {
    if (!snapshot) return false;
    if (!current) return true;
    return snapshot.fingerprint !== current.fingerprint;
}

/** 结果"来自旧版本"的具体原因，避免只给一句笼统提示。 */
export function describeNewReplaceBgDrift(
    snapshot: NewReplaceBgSnapshot | undefined,
    current: NewReplaceBgSnapshot | undefined,
): string {
    if (!snapshot || !current) return "";
    const reasons: string[] = [];
    if (snapshot.goodsAssetId !== current.goodsAssetId) reasons.push("商品图");
    if (snapshot.bgAssetId !== current.bgAssetId) reasons.push("背景图");
    if (snapshot.maskAssetId !== current.maskAssetId) reasons.push("主体蒙版");
    if (snapshot.sceneType !== current.sceneType) reasons.push("场景类型");
    if (snapshot.templateId !== current.templateId) reasons.push("场景模板");
    if (snapshot.customPrompt !== current.customPrompt) reasons.push("自定义场景");
    if (snapshot.weight !== current.weight) reasons.push("融合强度");
    if (snapshot.ratio !== current.ratio || snapshot.width !== current.width || snapshot.height !== current.height) reasons.push("输出规格");
    if (snapshot.count !== current.count) reasons.push("结果数量");
    if (JSON.stringify(snapshot.goods) !== JSON.stringify(current.goods)) reasons.push("商品位置");
    if (JSON.stringify(snapshot.layers) !== JSON.stringify(current.layers)) reasons.push("图层状态");
    if (snapshot.cutoutMode !== current.cutoutMode) reasons.push("抠图方式");
    return reasons.join("、");
}

/* ============================== 图层重置 ============================== */

export function resetSceneLayer(values: NewReplaceBgValues, layer: SceneLayerId): NewReplaceBgValues {
    const next: NewReplaceBgValues = { ...values, layers: { ...values.layers, [layer]: { ...DEFAULT_SCENE_LAYERS[layer] } } };
    if (layer === "goods") next.transform = { ...DEFAULT_SCENE_TRANSFORM };
    if (layer === "bg") {
        next.withMaterial = true;
        if (values.sceneType === "custom" && !values.customPrompt.trim()) next.bgAssetId = "";
    }
    if (layer === "lock") next.lockCutout = true;
    return next;
}

export function resetSceneTransform(values: NewReplaceBgValues): NewReplaceBgValues {
    return { ...values, transform: { ...DEFAULT_SCENE_TRANSFORM } };
}

/* ============================== 撤销 / 重做 ============================== */

/** 画布工具必须支持撤销/重做（page-specs/15 §6）：只回放画布参数，不回放资产上传。 */
export type SceneHistory = { past: NewReplaceBgValues[]; future: NewReplaceBgValues[] };

export const SCENE_HISTORY_LIMIT = 30;

export function createSceneHistory(): SceneHistory {
    return { past: [], future: [] };
}

/** 记录一次修改：新分支出现时清空 future，并裁剪到上限。 */
export function pushSceneHistory(history: SceneHistory, previous: NewReplaceBgValues): SceneHistory {
    const past = [...history.past, previous].slice(-SCENE_HISTORY_LIMIT);
    return { past, future: [] };
}

/**
 * 前进/后退一步。返回 `next` 为空表示没有可撤销/可重做的步骤（此时 history 原样返回）。
 */
export function stepSceneHistory(
    history: SceneHistory,
    current: NewReplaceBgValues,
    direction: "undo" | "redo",
): { next?: NewReplaceBgValues; history: SceneHistory } {
    const from = direction === "undo" ? history.past : history.future;
    const to = direction === "undo" ? history.future : history.past;
    if (from.length === 0) return { history };
    const target = from[from.length - 1];
    return {
        next: target,
        history: {
            past: direction === "undo" ? from.slice(0, -1) : [...to, current].slice(-SCENE_HISTORY_LIMIT),
            future: direction === "undo" ? [...to, current].slice(-SCENE_HISTORY_LIMIT) : from.slice(0, -1),
        },
    };
}

export function sceneHistoryState(history: SceneHistory): { canUndo: boolean; canRedo: boolean; past: number; future: number } {
    return { canUndo: history.past.length > 0, canRedo: history.future.length > 0, past: history.past.length, future: history.future.length };
}
