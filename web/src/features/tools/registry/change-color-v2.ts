/**
 * CHANGE_COLOR_V2「套图换色」页面契约 + 纯逻辑（无 React / 无网络）。
 *
 * 证据：docs/V1.0/plan_linkfox_navigation/page-specs/03-change-color-v2.md
 *  - 区域：批量图片上传｜颜色选择｜换色部位｜品质｜整套结果
 *  - 颜色来源：本次换色方案（参考图 ≤25）、商品图提色、历史使用颜色
 *  - 换色部位：常用 10 个预设 + 自由文本（0/50）
 *  - 品质：低品质/中品质/高品质
 *  - 整套结果需可一键重做、单张重做、查看本次输入快照、去画布继续/下载
 *
 * 本文件只描述工具自身的输入/快照/校验语义，不复制 LinkFox 的前端或算力区。
 */

import type { ToolSpec } from "../types";
import { getToolById } from "./index";

export const CHANGE_COLOR_V2_TOOL_ID = "CHANGE_COLOR_V2" as const;
export const CHANGE_COLOR_V2_SLUG = "change-color-v2" as const;
export const CHANGE_COLOR_V2_ROUTE = "/tools/ecommerce-suite/change-color-v2" as const;

/** 草稿键与现有 `tool-draft:v1:<toolId>` 约定一致，便于共享草稿存储。 */
export const COLOR_V2_DRAFT_KEY = `tool-draft:v1:${CHANGE_COLOR_V2_TOOL_ID}`;

/** 上限来自页面规格：参考图 25 张、换色部位 50 字、商品图单张 10M。 */
export const COLOR_V2_MAX_SUITE_IMAGES = 12;
export const COLOR_V2_MAX_REFERENCE_IMAGES = 25;
export const COLOR_V2_MAX_REGION_LENGTH = 50;
export const COLOR_V2_MAX_BYTES = 10 * 1024 * 1024;
export const COLOR_V2_MAX_HISTORY_COLORS = 24;

/** 页面「常用」换色部位预设，顺序与规格一致。 */
export const COLOR_REGION_PRESETS = [
    { key: "full-body", label: "全身" },
    { key: "top", label: "上装" },
    { key: "bottom", label: "下装" },
    { key: "shoe-upper", label: "鞋面" },
    { key: "shoe-sole", label: "鞋底" },
    { key: "bag-body", label: "包身" },
    { key: "bag-strap", label: "包带" },
    { key: "shell", label: "外壳" },
    { key: "bottle", label: "瓶身" },
    { key: "watch-band", label: "表带" },
] as const;

export type ColorRegionPresetKey = (typeof COLOR_REGION_PRESETS)[number]["key"];

/** 品质档位映射到共享图像请求的 provider quality（低/中/高，无自造倍率）。 */
export const COLOR_QUALITY_LEVELS = [
    { key: "low", label: "低品质", providerQuality: "low" },
    { key: "medium", label: "中品质", providerQuality: "medium" },
    { key: "high", label: "高品质", providerQuality: "high" },
] as const;

export type ColorQualityKey = (typeof COLOR_QUALITY_LEVELS)[number]["key"];

export type ColorPlanSource = "reference" | "product" | "history";

/**
 * 一个换色方案。参考图方案由参考图承载色值；提色/历史方案带 hex，
 * `sourceAssetId` 记录提色来源，便于「本次输入快照」回溯。
 */
export interface ColorPlan {
    id: string;
    name: string;
    source: ColorPlanSource;
    hex?: string;
    referenceAssetId?: string;
    referenceName?: string;
    sourceAssetId?: string;
    createdAt: number;
}

/** 单图微调：色相偏移/饱和度/明度/上色强度，100 表示保持原值。 */
export interface ColorAdjustment {
    hue: number;
    saturation: number;
    lightness: number;
    strength: number;
}

export const DEFAULT_COLOR_ADJUSTMENT: ColorAdjustment = {
    hue: 0,
    saturation: 100,
    lightness: 100,
    strength: 100,
};

export interface ColorV2Values {
    plans: ColorPlan[];
    selectedPlanId: string | null;
    selectedAssetId: string | null;
    region: string;
    quality: ColorQualityKey;
    referenceAssetIds: string[];
    /** 按商品图 assetId 记录微调，未记录 = 默认值。 */
    adjustments: Record<string, ColorAdjustment>;
    /** 按商品图 assetId 覆盖展示名（`imageName` 字段的展示名部分），未记录 = 用文件名。 */
    imageNames: Record<string, string>;
    historyColors: string[];
}

export const DEFAULT_COLOR_V2_VALUES: ColorV2Values = {
    plans: [],
    selectedPlanId: null,
    selectedAssetId: null,
    region: "",
    quality: "medium",
    referenceAssetIds: [],
    adjustments: {},
    imageNames: {},
    historyColors: [],
};

export function getChangeColorV2Spec(): ToolSpec {
    const spec = getToolById(CHANGE_COLOR_V2_TOOL_ID);
    if (!spec) throw new Error(`CHANGE_COLOR_V2 spec missing from tool registry`);
    return spec;
}

/* ------------------------------------------------------------------ *
 * 颜色与方案
 * ------------------------------------------------------------------ */

export function normalizeHex(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const text = value.trim().toLowerCase();
    const short = /^#([0-9a-f]{3})$/.exec(text);
    if (short) {
        const [r, g, b] = short[1].split("");
        return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    const long = /^#([0-9a-f]{6})$/.exec(text);
    if (long) return `#${long[1].toUpperCase()}`;
    const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(text);
    if (rgb) {
        const channels = [rgb[1], rgb[2], rgb[3]].map((item) => Math.min(255, Math.max(0, Number(item))));
        return `#${channels.map((item) => item.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
    }
    return undefined;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | undefined {
    const normalized = normalizeHex(hex);
    if (!normalized) return undefined;
    return {
        r: parseInt(normalized.slice(1, 3), 16),
        g: parseInt(normalized.slice(3, 5), 16),
        b: parseInt(normalized.slice(5, 7), 16),
    };
}

/** 粗略色相（0-359），用于「历史使用颜色」排序与色板展示，不做色彩学承诺。 */
export function hueOf(hex: string): number | undefined {
    const rgb = hexToRgb(hex);
    if (!rgb) return undefined;
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (delta === 0) return 0;
    let hue: number;
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    return Math.round(((hue * 60) % 360 + 360) % 360);
}

export function planSwatch(plan: ColorPlan): string | undefined {
    return plan.hex ? normalizeHex(plan.hex) : undefined;
}

export function planLabel(plan: ColorPlan): string {
    const swatch = planSwatch(plan);
    if (swatch) return `${plan.name} ${swatch}`;
    return plan.name;
}

export function regionLabel(value: string): string {
    const preset = COLOR_REGION_PRESETS.find((item) => item.key === value);
    if (preset) return preset.label;
    return value.trim();
}

export function sanityRegion(value: unknown): string {
    if (typeof value !== "string") return "";
    return value.replace(/\s+/g, " ").trim().slice(0, COLOR_V2_MAX_REGION_LENGTH);
}

export function getQualityLevel(key: ColorQualityKey) {
    return COLOR_QUALITY_LEVELS.find((item) => item.key === key) ?? COLOR_QUALITY_LEVELS[1];
}

/** 单图调整为无效值时不信任输入，回落到默认。 */
export function normalizeAdjustment(input: Partial<ColorAdjustment> | undefined): ColorAdjustment {
    const clamp = (value: unknown, min: number, max: number, fallback: number) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return fallback;
        return Math.min(max, Math.max(min, Math.round(num)));
    };
    return {
        hue: clamp(input?.hue, -180, 180, DEFAULT_COLOR_ADJUSTMENT.hue),
        saturation: clamp(input?.saturation, 40, 160, DEFAULT_COLOR_ADJUSTMENT.saturation),
        lightness: clamp(input?.lightness, 40, 160, DEFAULT_COLOR_ADJUSTMENT.lightness),
        strength: clamp(input?.strength, 0, 100, DEFAULT_COLOR_ADJUSTMENT.strength),
    };
}

export function isDefaultAdjustment(adjustment: ColorAdjustment): boolean {
    const normalized = normalizeAdjustment(adjustment);
    return (
        normalized.hue === DEFAULT_COLOR_ADJUSTMENT.hue &&
        normalized.saturation === DEFAULT_COLOR_ADJUSTMENT.saturation &&
        normalized.lightness === DEFAULT_COLOR_ADJUSTMENT.lightness &&
        normalized.strength === DEFAULT_COLOR_ADJUSTMENT.strength
    );
}

export function adjustmentKey(adjustment: ColorAdjustment): string {
    const normalized = normalizeAdjustment(adjustment);
    return `${normalized.hue}/${normalized.saturation}/${normalized.lightness}/${normalized.strength}`;
}

/** 屏显与 Prompt 共用的调整描述，顺序固定便于测试与指纹稳定。 */
export function describeAdjustment(adjustment: ColorAdjustment): string[] {
    const normalized = normalizeAdjustment(adjustment);
    const parts: string[] = [];
    if (normalized.hue !== 0) {
        parts.push(`色相${normalized.hue > 0 ? "+" : ""}${normalized.hue}°`);
    }
    if (normalized.saturation !== 100) {
        const delta = normalized.saturation - 100;
        parts.push(`饱和度${delta > 0 ? "+" : ""}${delta}%`);
    }
    if (normalized.lightness !== 100) {
        const delta = normalized.lightness - 100;
        parts.push(`明度${delta > 0 ? "+" : ""}${delta}%`);
    }
    if (normalized.strength !== 100) {
        parts.push(`上色强度${normalized.strength}%`);
    }
    return parts;
}

export function adjustmentSummary(adjustment: ColorAdjustment): string {
    const parts = describeAdjustment(adjustment);
    return parts.length ? parts.join(" · ") : "默认";
}

/** 稳定指纹：键排序后序列化，保证同输入同快照。 */
export function canonicalize(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
    if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

/** FNV-1a 32 位，仅用于快照/缓存比对，不用于安全场景。 */
export function stableHash(text: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

/* ------------------------------------------------------------------ *
 * 方案创建 / 去重
 * ------------------------------------------------------------------ */

let planSequence = 0;

export function createColorPlan(input: {
    source: ColorPlanSource;
    hex?: string;
    referenceAssetId?: string;
    referenceName?: string;
    sourceAssetId?: string;
    name?: string;
    at?: number;
    id?: string;
}): ColorPlan {
    const hex = input.hex ? normalizeHex(input.hex) : undefined;
    planSequence += 1;
    const base = hex ?? input.referenceAssetId ?? input.sourceAssetId ?? input.source;
    const id = input.id?.trim() || `${input.source}-${stableHash(`${base}:${input.at ?? 0}:${planSequence}`)}`;
    const fallbackName = hex ? `换色 ${hex}` : input.referenceName ?? "参考图方案";
    return {
        id,
        name: input.name?.trim() || fallbackName,
        source: input.source,
        ...(hex ? { hex } : {}),
        ...(input.referenceAssetId ? { referenceAssetId: input.referenceAssetId } : {}),
        ...(input.referenceName ? { referenceName: input.referenceName } : {}),
        ...(input.sourceAssetId ? { sourceAssetId: input.sourceAssetId } : {}),
        createdAt: input.at ?? Date.now(),
    };
}

export function addColorPlan(plans: ColorPlan[], plan: ColorPlan): ColorPlan[] {
    if (plans.length >= COLOR_V2_MAX_REFERENCE_IMAGES) return plans;
    const duplicate = plans.some((item) =>
        plan.hex ? planSwatch(item) === planSwatch(plan) : Boolean(plan.referenceAssetId) && item.referenceAssetId === plan.referenceAssetId,
    );
    if (duplicate) return plans;
    return [...plans, plan];
}

export function removeColorPlan(plans: ColorPlan[], planId: string): ColorPlan[] {
    return plans.filter((plan) => plan.id !== planId);
}

export function toggleReferencePlan(values: ColorV2Values, reference: { assetId: string; name: string; at?: number }): ColorV2Values {
    const existing = values.plans.find((plan) => plan.referenceAssetId === reference.assetId);
    if (existing) {
        const plans = removeColorPlan(values.plans, existing.id);
        return {
            ...values,
            plans,
            selectedPlanId: values.selectedPlanId === existing.id ? plans[0]?.id ?? null : values.selectedPlanId,
            referenceAssetIds: values.referenceAssetIds.filter((id) => id !== reference.assetId),
        };
    }
    const plan = createColorPlan({ source: "reference", referenceAssetId: reference.assetId, referenceName: reference.name, at: reference.at });
    return {
        ...values,
        plans: addColorPlan(values.plans, plan),
        selectedPlanId: plan.id,
        referenceAssetIds: [...values.referenceAssetIds, reference.assetId],
    };
}

export function pushHistoryColor(history: string[], hex: unknown): string[] {
    const normalized = normalizeHex(hex);
    if (!normalized) return history;
    const next = [normalized, ...history.filter((item) => item !== normalized)];
    return next.slice(0, COLOR_V2_MAX_HISTORY_COLORS);
}

/* ------------------------------------------------------------------ *
 * 色板提取（纯计算部分；像素采样在 adapter）
 * ------------------------------------------------------------------ */

export interface PaletteEntry {
    hex: string;
    ratio: number;
    count: number;
}

/**
 * 粗粒度量化：按 4bit/通道 分桶求均值，合并相邻桶，过滤近白/近黑/低饱和背景色。
 * 纯函数，可直接用像素数组测试。
 */
export function quantizePalette(
    pixels: ArrayLike<number>,
    options: { maxColors?: number; stride?: number; skipTransparent?: boolean; minRatio?: number } = {},
): PaletteEntry[] {
    const maxColors = Math.max(1, options.maxColors ?? 6);
    const stride = Math.max(4, options.stride ?? 4);
    const minRatio = options.minRatio ?? 0.01;
    const buckets = new Map<number, { r: number; g: number; b: number; count: number }>();
    let total = 0;

    for (let index = 0; index + 3 < pixels.length; index += stride) {
        const alpha = pixels[index + 3];
        if (options.skipTransparent !== false && alpha < 32) continue;
        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        const bucket = buckets.get(key);
        if (bucket) {
            bucket.r += r;
            bucket.g += g;
            bucket.b += b;
            bucket.count += 1;
        } else {
            buckets.set(key, { r, g, b, count: 1 });
        }
        total += 1;
    }

    if (!total) return [];

    const merged: Array<{ r: number; g: number; b: number; count: number }> = [];
    for (const bucket of buckets.values()) {
        const r = bucket.r / bucket.count;
        const g = bucket.g / bucket.count;
        const b = bucket.b / bucket.count;
        const target = merged.find((item) => {
            const dr = item.r / item.count - r;
            const dg = item.g / item.count - g;
            const db = item.b / item.count - b;
            return Math.sqrt(dr * dr + dg * dg + db * db) < 28;
        });
        if (target) {
            target.r += bucket.r;
            target.g += bucket.g;
            target.b += bucket.b;
            target.count += bucket.count;
        } else {
            merged.push({ ...bucket });
        }
    }

    return merged
        .map((item) => {
            const r = Math.round(item.r / item.count);
            const g = Math.round(item.g / item.count);
            const b = Math.round(item.b / item.count);
            const hex = `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
            return { hex, ratio: item.count / total, count: item.count };
        })
        .filter((item) => item.ratio >= minRatio)
        .sort((a, b) => b.ratio - a.ratio || a.hex.localeCompare(b.hex))
        .slice(0, maxColors);
}

/* ------------------------------------------------------------------ *
 * 状态解析 / 校验 / 快照
 * ------------------------------------------------------------------ */

/** 提交字段 `imageName` 的展示名：优先用户改过的展示名，否则回落文件名（与上传区展示一致）。 */
export function displayImageName(assetId: string, fallback: string | undefined, imageNames?: Readonly<Record<string, string>>): string {
    const custom = imageNames?.[assetId];
    if (custom && custom.trim()) return custom.trim();
    return fallback ?? "未命名商品图";
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parsePlan(raw: unknown): ColorPlan | undefined {
    const record = asRecord(raw);
    const id = typeof record.id === "string" ? record.id : "";
    const source = record.source;
    if (!id || (source !== "reference" && source !== "product" && source !== "history")) return undefined;
    const hex = normalizeHex(record.hex);
    const referenceAssetId = typeof record.referenceAssetId === "string" ? record.referenceAssetId : undefined;
    if (source === "reference" && !referenceAssetId) return undefined;
    if (source !== "reference" && !hex) return undefined;
    return {
        id,
        name: typeof record.name === "string" && record.name.trim() ? record.name : hex ?? "参考图方案",
        source,
        ...(hex ? { hex } : {}),
        ...(referenceAssetId ? { referenceAssetId } : {}),
        ...(typeof record.referenceName === "string" ? { referenceName: record.referenceName } : {}),
        ...(typeof record.sourceAssetId === "string" ? { sourceAssetId: record.sourceAssetId } : {}),
        createdAt: Number.isFinite(Number(record.createdAt)) ? Number(record.createdAt) : 0,
    };
}

/** 容错解析草稿里的存储值：脏数据被丢弃，绝不抛错阻塞页面。 */
export function parseColorV2Values(raw: unknown): ColorV2Values {
    const record = asRecord(raw);
    const plans = Array.isArray(record.plans) ? record.plans.map(parsePlan).filter((plan): plan is ColorPlan => Boolean(plan)) : [];
    const planIds = new Set(plans.map((plan) => plan.id));
    const adjustments: Record<string, ColorAdjustment> = {};
    for (const [key, value] of Object.entries(asRecord(record.adjustments))) {
        adjustments[key] = normalizeAdjustment(value as Partial<ColorAdjustment>);
    }
    const historyColors = Array.isArray(record.historyColors)
        ? record.historyColors
              .map((item) => normalizeHex(item))
              .filter((item): item is string => Boolean(item))
              .slice(0, COLOR_V2_MAX_HISTORY_COLORS)
        : [];
    const quality = COLOR_QUALITY_LEVELS.some((item) => item.key === record.quality) ? (record.quality as ColorQualityKey) : "medium";
    const imageNames: Record<string, string> = {};
    for (const [key, value] of Object.entries(asRecord(record.imageNames))) {
        const text = sanityRegion(value);
        if (key && text) imageNames[key] = text;
    }
    const referenceAssetIds = Array.isArray(record.referenceAssetIds)
        ? record.referenceAssetIds.filter((item): item is string => typeof item === "string").slice(0, COLOR_V2_MAX_REFERENCE_IMAGES)
        : plans.map((plan) => plan.referenceAssetId).filter((item): item is string => Boolean(item));
    const selectedPlanId = typeof record.selectedPlanId === "string" && planIds.has(record.selectedPlanId) ? record.selectedPlanId : plans[0]?.id ?? null;
    return {
        plans,
        selectedPlanId,
        selectedAssetId: typeof record.selectedAssetId === "string" ? record.selectedAssetId : null,
        region: sanityRegion(record.region),
        quality,
        referenceAssetIds,
        adjustments,
        imageNames,
        historyColors,
    };
}

export interface ColorV2Issue {
    field: "suite" | "plans" | "region" | "quality" | "references";
    message: string;
}

export interface ColorV2StateInput {
    assetIds: readonly string[];
    values: ColorV2Values;
}

/** 提交前校验；任何 issue 都必须阻断生成，禁止“假装成功”。 */
export function validateColorV2State(input: ColorV2StateInput): ColorV2Issue[] {
    const issues: ColorV2Issue[] = [];
    const assetIds = input.assetIds.filter((id) => Boolean(id));
    if (!assetIds.length) issues.push({ field: "suite", message: "请先上传整套商品图（至少 1 张）" });
    if (assetIds.length > COLOR_V2_MAX_SUITE_IMAGES) {
        issues.push({ field: "suite", message: `整套商品图最多 ${COLOR_V2_MAX_SUITE_IMAGES} 张，当前 ${assetIds.length} 张` });
    }
    if (new Set(assetIds).size !== assetIds.length) issues.push({ field: "suite", message: "商品图存在重复项" });
    if (!input.values.plans.length) issues.push({ field: "plans", message: "请选择或添加至少 1 个换色方案" });
    if (input.values.plans.length > COLOR_V2_MAX_REFERENCE_IMAGES) {
        issues.push({ field: "plans", message: `换色方案最多 ${COLOR_V2_MAX_REFERENCE_IMAGES} 个` });
    }
    for (const plan of input.values.plans) {
        if (plan.source === "reference" && !plan.referenceAssetId) {
            issues.push({ field: "references", message: `方案「${plan.name}」缺少参考图` });
        }
        if (plan.source !== "reference" && !planSwatch(plan)) {
            issues.push({ field: "plans", message: `方案「${plan.name}」缺少有效色值` });
        }
    }
    const referenceIds = new Set(input.values.referenceAssetIds);
    for (const plan of input.values.plans) {
        if (plan.referenceAssetId && !referenceIds.has(plan.referenceAssetId)) {
            issues.push({ field: "references", message: `方案「${plan.name}」的参考图不在本次参考图集合中` });
        }
    }
    if (referenceIds.size > COLOR_V2_MAX_REFERENCE_IMAGES) {
        issues.push({ field: "references", message: `参考图最多 ${COLOR_V2_MAX_REFERENCE_IMAGES} 张` });
    }
    if (input.values.region.trim().length > COLOR_V2_MAX_REGION_LENGTH) {
        issues.push({ field: "region", message: `换色部位最多 ${COLOR_V2_MAX_REGION_LENGTH} 字` });
    }
    if (!COLOR_QUALITY_LEVELS.some((item) => item.key === input.values.quality)) {
        issues.push({ field: "quality", message: "品质档位无效" });
    }
    return issues;
}

export function estimatedOutputCount(assetCount: number, planCount: number): number {
    if (assetCount <= 0 || planCount <= 0) return 0;
    return assetCount * planCount;
}

export interface ColorV2Snapshot {
    hash: string;
    assetIds: string[];
    plans: ColorPlan[];
    region: string;
    quality: ColorQualityKey;
    adjustments: Record<string, ColorAdjustment>;
    referenceAssetIds: string[];
    /** 本次提交使用的展示名（`imageName`）；改了展示名也算配置变更。 */
    imageNames: Record<string, string>;
    createdAt: number;
}

/**
 * 本次输入快照：生成时冻结，结果面板据此判断「当前设置是否已偏离本次结果」。
 * 只包含真正影响输出的字段（不含选中态）。
 */
export function buildColorV2Snapshot(input: ColorV2StateInput, at: number = Date.now()): ColorV2Snapshot {
    const assetIds = [...input.assetIds];
    const adjustments: Record<string, ColorAdjustment> = {};
    for (const assetId of assetIds) {
        const adjustment = input.values.adjustments[assetId];
        if (adjustment && !isDefaultAdjustment(adjustment)) adjustments[assetId] = normalizeAdjustment(adjustment);
    }
    const imageNames: Record<string, string> = {};
    for (const assetId of assetIds) {
        const name = input.values.imageNames[assetId]?.trim();
        if (name) imageNames[assetId] = name;
    }
    const plans = input.values.plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        source: plan.source,
        ...(plan.hex ? { hex: planSwatch(plan) } : {}),
        ...(plan.referenceAssetId ? { referenceAssetId: plan.referenceAssetId } : {}),
        ...(plan.referenceName ? { referenceName: plan.referenceName } : {}),
        ...(plan.sourceAssetId ? { sourceAssetId: plan.sourceAssetId } : {}),
        createdAt: plan.createdAt,
    }));
    const region = input.values.region.trim();
    const quality = input.values.quality;
    const referenceAssetIds = input.values.referenceAssetIds.filter((id) => plans.some((plan) => plan.referenceAssetId === id));
    const hash = stableHash(
        canonicalize({
            assetIds,
            plans,
            region,
            quality,
            adjustments,
            referenceAssetIds,
            imageNames,
        }),
    );
    return {
        hash,
        assetIds,
        plans,
        region,
        quality,
        adjustments,
        referenceAssetIds,
        imageNames,
        createdAt: at,
    };
}

export function snapshotMatchesHash(snapshot: ColorV2Snapshot, hash: string | undefined | null): boolean {
    return Boolean(hash) && snapshot.hash === hash;
}

/** 结果是否过期：套图/方案/部位/品质/微调任一变更都算偏离。 */
export function isSnapshotStale(current: ColorV2Snapshot, resultHash: string | undefined | null): boolean {
    return !snapshotMatchesHash(current, resultHash);
}
