import { getToolById } from "./index";

/**
 * TASK-024：CHANGE_COLOR（一键换色）的页面契约。
 *
 * 事实来源：
 * - docs/V1.0/plan_linkfox_navigation/page-specs/09-change-color.md（原站 https://www.linkfox.com/draw/change-color 的 workspace DOM）
 * - docs/V1.0/plan_linkfox_navigation/tool_specs.json 中 CHANGE_COLOR 的 16 个字段
 *
 * 真实边界（不接受“演示成功”）：
 * - 换色是一次真实的图像编辑请求：源图 + 区域蒙版作为参考图，提示词携带目标色与全部调色/光影参数；
 * - 16 个字段全部由页面状态派生（`buildChangeColorFields`），并整体进入任务快照与指纹，
 *   任何一项漏掉都会被 `assertChangeColorInput` 与快照指纹测出来；
 * - `imageSegUrl`（AI 主体分割）本仓库还没有分割服务，这里**复用区域蒙版**并在 UI 明示，
 *   不伪装成 AI 分割结果；接入分割服务后只需改这一处映射；
 * - `coverList` 属于套图封面，本页没有套图编辑器，固定空数组（结构照常进快照，不编造内容）。
 */

export const CHANGE_COLOR_TOOL_ID = "CHANGE_COLOR";

/** 上游规格里的 16 个字段，顺序与 tool_specs.json 一致；用于“无丢参”校验。 */
export const CHANGE_COLOR_FIELDS = [
    "adjustLight",
    "colorParams",
    "coverList",
    "doInpaint",
    "imageFormat",
    "imageHeight",
    "imageMaskUrl",
    "imageName",
    "imageSegUrl",
    "imageSize",
    "imageTagData",
    "imageUrl",
    "imageWidth",
    "images",
    "name",
    "sourceImageUrl",
] as const;

export type ChangeColorField = (typeof CHANGE_COLOR_FIELDS)[number];

/** 源图与颜色参考图的限制：原站文案“10M以内,jpg/jpeg/png/webp”。 */
export const CHANGE_COLOR_SOURCE_LIMITS = {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
    maxBytes: 10 * 1024 * 1024,
    maxSide: 8192,
} as const;

export const CHANGE_COLOR_REFERENCE_LIMITS = {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
    maxBytes: 10 * 1024 * 1024,
} as const;

/* ============================== 区域 ============================== */

/**
 * 区域选择：原站文案覆盖“衣服、商品、配饰、假发”。
 * `descriptor` 会原样进入提示词，所以措辞必须是模型能理解的具体描述，而不是内部代号。
 */
export const REGION_PRESETS = [
    { id: "full", label: "整图主体", descriptor: "整张图片中的主体对象" },
    { id: "clothing", label: "衣服", descriptor: "人物身上的衣服（衣身与袖子）" },
    { id: "top", label: "上装", descriptor: "人物上身穿着的上装" },
    { id: "bottom", label: "下装", descriptor: "人物下身穿着的裤子或裙子" },
    { id: "shoes", label: "鞋", descriptor: "鞋子（鞋面、鞋带、鞋底）" },
    { id: "bag", label: "包", descriptor: "包体（不含肩带以外的背景）" },
    { id: "accessory", label: "配饰", descriptor: "配饰（帽子、围巾、腰带等小件）" },
    { id: "wig", label: "假发", descriptor: "假发（发丝整体，不含面部皮肤）" },
    { id: "custom", label: "自定义", descriptor: "" },
] as const;

export type RegionPresetId = (typeof REGION_PRESETS)[number]["id"];

export const REGION_CUSTOM_MAX_LENGTH = 40;

export function isRegionPresetId(value: unknown): value is RegionPresetId {
    return typeof value === "string" && REGION_PRESETS.some((preset) => preset.id === value);
}

export function regionPreset(id: RegionPresetId) {
    return REGION_PRESETS.find((preset) => preset.id === id) ?? REGION_PRESETS[0];
}

/** 区域描述：自定义区域必须自己写清楚，否则提示词里没有可换色的对象。 */
export function regionDescriptor(values: Pick<ChangeColorValues, "region" | "customRegion">): string {
    if (values.region === "custom") return values.customRegion.trim();
    return regionPreset(values.region).descriptor;
}

/* ============================== 颜色 ============================== */

/** 收藏色卡默认值（真实 hex，不是占位文案）；用户增删后随草稿保存。 */
export const DEFAULT_SWATCHES = [
    "#111111",
    "#FFFFFF",
    "#8C8C8C",
    "#B3261E",
    "#E2703A",
    "#F1C40F",
    "#2E7D32",
    "#1F6FB2",
    "#4A2C8F",
    "#F2D6C4",
    "#D4AF37",
    "#33475B",
] as const;

export const MAX_SWATCHES = 24;
export const MAX_PALETTE = 8;

const HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isHexColor(value: unknown): value is string {
    return typeof value === "string" && HEX_PATTERN.test(value.trim());
}

/** #RGB / #RRGGBB / #RRGGBBAA → #RRGGBB（alpha 由 colorParams 单独保留，避免两种写法混淆）。 */
export function normalizeHex(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const raw = value.trim();
    if (!HEX_PATTERN.test(raw)) return null;
    const body = raw.slice(1);
    if (body.length === 3) return `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`.toUpperCase();
    return `#${body.slice(0, 6)}`.toUpperCase();
}

/** `#RRGGBBAA` 写法（colorParams 允许 8 位）；默认 alpha 为 FF。 */
export function colorParamsValue(hex: string): string {
    const normalized = normalizeHex(hex) ?? "#000000";
    return `${normalized}FF`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const normalized = normalizeHex(hex);
    if (!normalized) return null;
    return {
        r: Number.parseInt(normalized.slice(1, 3), 16),
        g: Number.parseInt(normalized.slice(3, 5), 16),
        b: Number.parseInt(normalized.slice(5, 7), 16),
    };
}

export function rgbToHex(r: number, g: number, b: number): string {
    const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
    return `#${[r, g, b].map((channel) => clamp(channel).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** 色卡去重用的感知距离（加权欧氏，足够区分肉眼可见差异，不引入额外依赖）。 */
export function colorDistance(a: string, b: string): number {
    const first = hexToRgb(a);
    const second = hexToRgb(b);
    if (!first || !second) return Number.POSITIVE_INFINITY;
    const dr = first.r - second.r;
    const dg = first.g - second.g;
    const db = first.b - second.b;
    return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}

export function addSwatch(swatches: readonly string[], hex: string): string[] {
    const normalized = normalizeHex(hex);
    if (!normalized) return [...swatches];
    if (swatches.some((item) => colorDistance(item, normalized) < 12)) return [...swatches];
    return [normalized, ...swatches].slice(0, MAX_SWATCHES);
}

export function removeSwatch(swatches: readonly string[], hex: string): string[] {
    const normalized = normalizeHex(hex);
    return swatches.filter((item) => normalizeHex(item) !== normalized);
}

/* ============================== 细调 / 光影 ============================== */

export const ADJUSTMENT_LIMITS = {
    hue: { min: -180, max: 180, step: 1 },
    saturation: { min: -100, max: 100, step: 1 },
    brightness: { min: -100, max: 100, step: 1 },
    contrast: { min: -100, max: 100, step: 1 },
} as const;

export type ColorAdjustment = { hue: number; saturation: number; brightness: number; contrast: number };

export const DEFAULT_ADJUSTMENT: ColorAdjustment = { hue: 0, saturation: 0, brightness: 0, contrast: 0 };

export const ADJUSTMENT_CONTROLS = [
    { key: "hue", label: "色调", ...ADJUSTMENT_LIMITS.hue },
    { key: "saturation", label: "饱和度", ...ADJUSTMENT_LIMITS.saturation },
    { key: "brightness", label: "亮度", ...ADJUSTMENT_LIMITS.brightness },
    { key: "contrast", label: "对比度", ...ADJUSTMENT_LIMITS.contrast },
] as const;

export const COLOR_CURVES = [
    { id: "linear", label: "线性", descriptor: "保持线性色调响应，不做曲线压缩" },
    { id: "soft", label: "柔光", descriptor: "轻微提亮中间调，保留高光细节" },
    { id: "s-curve", label: "S 曲线", descriptor: "加大中间调对比，暗部更暗、亮部更亮" },
    { id: "hard", label: "强对比", descriptor: "强对比曲线，边缘与褶皱更硬朗" },
] as const;

export type ColorCurveId = (typeof COLOR_CURVES)[number]["id"];

export function isCurveId(value: unknown): value is ColorCurveId {
    return typeof value === "string" && COLOR_CURVES.some((curve) => curve.id === value);
}

export function curveDescriptor(id: ColorCurveId): string {
    return (COLOR_CURVES.find((curve) => curve.id === id) ?? COLOR_CURVES[0]).descriptor;
}

export const LIGHT_STRENGTH_LIMITS = { min: 0, max: 100, step: 1 } as const;
export const BALANCE_LIMITS = { min: -100, max: 100, step: 1 } as const;

export type ColorLight = {
    enabled: boolean;
    strength: number;
    edge: boolean;
    edgeRepair: boolean;
    balance: number;
    curve: ColorCurveId;
};

export const DEFAULT_LIGHT: ColorLight = {
    enabled: true,
    strength: 50,
    edge: true,
    edgeRepair: false,
    balance: 0,
    curve: "linear",
};

export function clampToRange(value: unknown, range: { min: number; max: number }, fallback: number): number {
    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(range.min, Math.min(range.max, parsed));
}

/** 细调是否等同于“不动”：UI 用它决定是否显示“默认（无微调）”。 */
export function isDefaultAdjustment(adjustment: ColorAdjustment): boolean {
    return (
        adjustment.hue === DEFAULT_ADJUSTMENT.hue &&
        adjustment.saturation === DEFAULT_ADJUSTMENT.saturation &&
        adjustment.brightness === DEFAULT_ADJUSTMENT.brightness &&
        adjustment.contrast === DEFAULT_ADJUSTMENT.contrast
    );
}

export function adjustmentSummary(adjustment: ColorAdjustment): string {
    if (isDefaultAdjustment(adjustment)) return "默认（无微调）";
    return ADJUSTMENT_CONTROLS.filter((control) => adjustment[control.key] !== 0)
        .map((control) => `${control.label} ${adjustment[control.key] > 0 ? "+" : ""}${adjustment[control.key]}`)
        .join(" · ");
}

export function isDefaultLight(light: ColorLight): boolean {
    return (
        light.enabled === DEFAULT_LIGHT.enabled &&
        light.strength === DEFAULT_LIGHT.strength &&
        light.edge === DEFAULT_LIGHT.edge &&
        light.edgeRepair === DEFAULT_LIGHT.edgeRepair &&
        light.balance === DEFAULT_LIGHT.balance &&
        light.curve === DEFAULT_LIGHT.curve
    );
}

export function lightSummary(light: ColorLight): string {
    const parts = [light.enabled ? `光影优化 ${light.strength}` : "光影优化 关闭"];
    parts.push(light.edge ? "边缘优化 开" : "边缘优化 关");
    parts.push(light.edgeRepair ? "颜色边缘修复 开" : "颜色边缘修复 关");
    if (light.balance !== 0) parts.push(`色彩平衡 ${light.balance > 0 ? "+" : ""}${light.balance}`);
    if (light.curve !== "linear") parts.push(`曲线 ${(COLOR_CURVES.find((curve) => curve.id === light.curve) ?? COLOR_CURVES[0]).label}`);
    return parts.join(" · ");
}

/** `adjustLight` 字段的原始写法：开关 + 强度（关闭时不带强度，避免下游误读）。 */
export function adjustLightValue(light: ColorLight): string {
    return light.enabled ? `on:${light.strength}` : "off";
}

/* ============================== 值 ============================== */

export type ChangeColorValues = {
    region: RegionPresetId;
    customRegion: string;
    /** 目标色，统一 #RRGGBB；空串表示还没选色。 */
    targetColor: string;
    /** 收藏色卡（可增删，随草稿保存）。 */
    swatches: string[];
    /** 颜色参考图提取出来的色卡（来自真实像素采样）。 */
    palette: string[];
    /** 颜色参考图资产 id（可选）。 */
    referenceAssetId?: string;
    removeNoise: boolean;
    adjustment: ColorAdjustment;
    light: ColorLight;
    doInpaint: boolean;
    /** 任务名称（`name` 字段），默认沿用文件名。 */
    taskName: string;
    imageName: string;
    /** 上次的源图 id；仅用于草稿恢复。 */
    sourceAssetId?: string;
    /** 上次是否画过区域蒙版 —— 蒙版本体是 base64，绝不进草稿。 */
    hasMask: boolean;
};

export const DEFAULT_CHANGE_COLOR_VALUES: ChangeColorValues = {
    region: "clothing",
    customRegion: "",
    targetColor: "",
    swatches: [...DEFAULT_SWATCHES],
    palette: [],
    removeNoise: true,
    adjustment: { ...DEFAULT_ADJUSTMENT },
    light: { ...DEFAULT_LIGHT },
    doInpaint: false,
    taskName: "",
    imageName: "",
    hasMask: false,
};

/* ============================== 校验 ============================== */

export type ChangeColorIssueCode =
    | "source-required"
    | "image-model-required"
    | "color-required"
    | "color-invalid"
    | "region-required"
    | "mask-required"
    | "reference-invalid";

export type ChangeColorIssue = { code: ChangeColorIssueCode; field: string; message: string };

export type ChangeColorSourceMeta = {
    assetId: string;
    name?: string;
    mimeType?: string;
    bytes?: number;
    width?: number;
    height?: number;
    dataUrl?: string;
    url?: string;
};

export function isChangeColorSourceReady(source: ChangeColorSourceMeta | undefined): boolean {
    return Boolean(source?.assetId && (source.dataUrl || source.url));
}

export function imageFormatOf(mimeType: string | undefined, name: string | undefined): "png" | "jpeg" | "webp" {
    const mime = (mimeType ?? "").toLowerCase();
    if (mime.includes("png")) return "png";
    if (mime.includes("webp")) return "webp";
    if (mime.includes("jpeg") || mime.includes("jpg")) return "jpeg";
    const ext = (name ?? "").toLowerCase().split(".").pop();
    if (ext === "png") return "png";
    if (ext === "webp") return "webp";
    return "jpeg";
}

/** 源图限制在控件旁就地说明（格式/大小/边长），不只弹一个通用错误。 */
export function validateChangeColorSource(source: ChangeColorSourceMeta): { ok: boolean; code?: string; message?: string } {
    const mime = (source.mimeType ?? "").toLowerCase();
    if (mime && !(CHANGE_COLOR_SOURCE_LIMITS.mimeTypes as readonly string[]).includes(mime)) {
        return { ok: false, code: "mime", message: `只支持 JPG / PNG / WEBP，当前是 ${mime || "未知格式"}。` };
    }
    if (typeof source.bytes === "number" && source.bytes > CHANGE_COLOR_SOURCE_LIMITS.maxBytes) {
        return { ok: false, code: "bytes", message: `文件超过 10M（${(source.bytes / 1024 / 1024).toFixed(1)}M），请压缩后重试。` };
    }
    const maxSide = CHANGE_COLOR_SOURCE_LIMITS.maxSide;
    if ((source.width ?? 0) > maxSide || (source.height ?? 0) > maxSide) {
        return { ok: false, code: "side", message: `边长不能超过 ${maxSide}px（当前 ${source.width}×${source.height}）。` };
    }
    return { ok: true };
}

/**
 * 提交前校验。
 * - 源图 / 模型 / 目标色 / 区域是硬阻塞；
 * - 局部重绘（doInpaint）必须真的有一块选区，否则拒绝提交，而不是把整图当蒙版发出去；
 * - 参考图只做类型检查（像素采样失败不阻塞，UI 会说明）。
 */
export function validateChangeColorState(input: {
    values: ChangeColorValues;
    sourceReady: boolean;
    imageModelReady: boolean;
    maskReady: boolean;
}): ChangeColorIssue[] {
    const issues: ChangeColorIssue[] = [];
    if (!input.sourceReady) issues.push({ code: "source-required", field: "imageUrl", message: "请先上传需要换色的图片。" });
    if (!input.imageModelReady) issues.push({ code: "image-model-required", field: "model", message: "未配置图片模型，先到设置里选择模型。" });

    const { targetColor } = input.values;
    if (!targetColor.trim()) issues.push({ code: "color-required", field: "colorParams", message: "请选择颜色或上传颜色参考图提色。" });
    else if (!normalizeHex(targetColor)) {
        issues.push({ code: "color-invalid", field: "colorParams", message: "颜色需为 #RRGGBB 或 #RRGGBBAA，例如 #B3261E。" });
    }

    if (input.values.region === "custom" && !input.values.customRegion.trim()) {
        issues.push({ code: "region-required", field: "region", message: "自定义区域需要写清楚要换色的对象（例如“外套的翻领”）。" });
    }
    if (input.values.doInpaint && !input.maskReady) {
        issues.push({ code: "mask-required", field: "imageMaskUrl", message: "局部重绘已开启，请在图片上涂出要重绘的区域（或关闭局部重绘）。" });
    }
    return issues;
}

export function hasBlockingIssue(issues: readonly ChangeColorIssue[]): boolean {
    return issues.length > 0;
}

/* ============================== 字段与快照 ============================== */

export type ChangeColorFieldSource = {
    source: ChangeColorSourceMeta;
    /** 真实导出/生成的区域蒙版（PNG data URL 或已上传资产 URL）；为空表示只有整图默认蒙版。 */
    maskUrl?: string;
    /** 颜色参考图 URL（可选，进入 `images`）。 */
    referenceUrl?: string;
};

/**
 * 16 个字段的唯一来源：页面状态 → 上游字段。任何 UI 改动都必须回到这里，
 * 否则 `assertChangeColorInput` 会因为“字段缺失/不一致”直接失败。
 */
export function buildChangeColorFields(values: ChangeColorValues, input: ChangeColorFieldSource): Record<ChangeColorField, unknown> {
    const { source } = input;
    const imageUrl = source.dataUrl ?? source.url ?? "";
    const maskUrl = input.maskUrl ?? "";
    const width = Number(source.width ?? 0);
    const height = Number(source.height ?? 0);
    const bytes = Number(source.bytes ?? 0);
    const imageTagData = {
        width,
        height,
        format: imageFormatOf(source.mimeType, source.name),
        bytes,
        region: values.region,
        regionText: regionDescriptor(values),
        targetColor: normalizeHex(values.targetColor) ?? "",
    };

    return {
        adjustLight: adjustLightValue(values.light),
        colorParams: colorParamsValue(values.targetColor),
        // 本页没有套图编辑器：不编造封面，空数组如实进快照。
        coverList: [],
        doInpaint: values.doInpaint,
        imageFormat: imageFormatOf(source.mimeType, source.name),
        imageHeight: height,
        imageMaskUrl: maskUrl,
        imageName: values.imageName || source.name || "",
        // 未接入 AI 主体分割：如实复用区域蒙版（UI 明示，见 report.md）。
        imageSegUrl: maskUrl,
        imageSize: bytes,
        imageTagData,
        imageUrl,
        imageWidth: width,
        images: input.referenceUrl ? [input.referenceUrl] : [],
        name: values.taskName.trim() || values.imageName || source.name || "一键换色任务",
        sourceImageUrl: imageUrl,
    };
}

export type ChangeColorSnapshot = {
    toolId: typeof CHANGE_COLOR_TOOL_ID;
    fields: Record<string, unknown>;
    region: RegionPresetId;
    targetColor: string;
    adjustment: ColorAdjustment;
    light: ColorLight;
    removeNoise: boolean;
    doInpaint: boolean;
    sourceAssetId: string;
    revision: number | string | null;
    fingerprint: string;
};

/** 稳定序列化：键排序后再拼接，避免同一份配置算出两个指纹。 */
function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
    if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}

export function changeColorFingerprint(snapshot: Omit<ChangeColorSnapshot, "fingerprint" | "toolId">): string {
    const joined = stableStringify({
        fields: snapshot.fields,
        region: snapshot.region,
        targetColor: snapshot.targetColor,
        adjustment: snapshot.adjustment,
        light: snapshot.light,
        removeNoise: snapshot.removeNoise,
        doInpaint: snapshot.doInpaint,
        sourceAssetId: snapshot.sourceAssetId,
        revision: snapshot.revision ?? null,
    });
    let hash = 2166136261;
    for (let index = 0; index < joined.length; index += 1) {
        hash ^= joined.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `changecolor-${(hash >>> 0).toString(16)}`;
}

/** 快照在“提交那一刻”生成：换色 + 调色 + 光影合并成一次，后续改动只影响下一稿。 */
export function createChangeColorSnapshot(
    values: ChangeColorValues,
    input: ChangeColorFieldSource,
    revision: number | string | null = null,
): ChangeColorSnapshot {
    const fields = buildChangeColorFields(values, input);
    const base = {
        fields: fields as Record<string, unknown>,
        region: values.region,
        targetColor: normalizeHex(values.targetColor) ?? "",
        adjustment: { ...values.adjustment },
        light: { ...values.light },
        removeNoise: values.removeNoise,
        doInpaint: values.doInpaint,
        sourceAssetId: input.source.assetId,
        revision,
    };
    return { toolId: CHANGE_COLOR_TOOL_ID, ...base, fingerprint: changeColorFingerprint(base) };
}

/** 结果是否来自旧版本配置（换源图/改色/改区域后不能冒充当前结果）。 */
export function isChangeColorSnapshotStale(
    snapshot: ChangeColorSnapshot | undefined,
    current: ChangeColorSnapshot | undefined,
): boolean {
    if (!snapshot) return false;
    if (!current) return true;
    return snapshot.fingerprint !== current.fingerprint;
}

export function snapshotFieldSummary(fields: Record<string, unknown>): string {
    const color = typeof fields.colorParams === "string" ? fields.colorParams : "";
    const size = `${fields.imageWidth ?? 0}×${fields.imageHeight ?? 0}`;
    const mask = typeof fields.imageMaskUrl === "string" && fields.imageMaskUrl ? "有" : "无";
    return `${color || "未选色"} · ${size} · 蒙版${mask}`;
}

/* ============================== 草稿 ============================== */

const str = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);

/** 草稿恢复：脏值一律回落到默认，绝不用非法枚举/越界滑杆去污染下一次提交。 */
export function readChangeColorValues(raw: unknown): ChangeColorValues {
    const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const adjustmentRaw = record.adjustment && typeof record.adjustment === "object" ? (record.adjustment as Record<string, unknown>) : {};
    const lightRaw = record.light && typeof record.light === "object" ? (record.light as Record<string, unknown>) : {};
    const swatchesRaw = Array.isArray(record.swatches) ? record.swatches : [];
    const paletteRaw = Array.isArray(record.palette) ? record.palette : [];

    const swatches = swatchesRaw
        .map((item) => normalizeHex(item))
        .filter((item): item is string => Boolean(item))
        .slice(0, MAX_SWATCHES);

    return {
        region: isRegionPresetId(record.region) ? record.region : DEFAULT_CHANGE_COLOR_VALUES.region,
        customRegion: str(record.customRegion).slice(0, REGION_CUSTOM_MAX_LENGTH),
        targetColor: normalizeHex(record.targetColor) ?? "",
        swatches: swatches.length ? swatches : [...DEFAULT_SWATCHES],
        palette: paletteRaw
            .map((item) => normalizeHex(item))
            .filter((item): item is string => Boolean(item))
            .slice(0, MAX_PALETTE),
        ...(str(record.referenceAssetId) ? { referenceAssetId: str(record.referenceAssetId) } : {}),
        removeNoise: record.removeNoise !== false,
        adjustment: {
            hue: clampToRange(adjustmentRaw.hue, ADJUSTMENT_LIMITS.hue, 0),
            saturation: clampToRange(adjustmentRaw.saturation, ADJUSTMENT_LIMITS.saturation, 0),
            brightness: clampToRange(adjustmentRaw.brightness, ADJUSTMENT_LIMITS.brightness, 0),
            contrast: clampToRange(adjustmentRaw.contrast, ADJUSTMENT_LIMITS.contrast, 0),
        },
        light: {
            enabled: lightRaw.enabled !== false,
            strength: clampToRange(lightRaw.strength, LIGHT_STRENGTH_LIMITS, DEFAULT_LIGHT.strength),
            edge: lightRaw.edge !== false,
            edgeRepair: lightRaw.edgeRepair === true,
            balance: clampToRange(lightRaw.balance, BALANCE_LIMITS, 0),
            curve: isCurveId(lightRaw.curve) ? lightRaw.curve : DEFAULT_LIGHT.curve,
        },
        doInpaint: record.doInpaint === true,
        taskName: str(record.taskName),
        imageName: str(record.imageName),
        ...(str(record.sourceAssetId) ? { sourceAssetId: str(record.sourceAssetId) } : {}),
        // 蒙版本体不进草稿；只记“画过”，恢复时明确提示需要重画。
        hasMask: record.hasMask === true,
    };
}

/** 本页规格（供工作区标题/路由断言使用，不复制 index.ts 的数据）。 */
export function changeColorSpec() {
    return getToolById(CHANGE_COLOR_TOOL_ID);
}
