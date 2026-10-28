import { z } from "zod";

import type { ToolSpec } from "../types";

/**
 * TASK-008: PRODUCT_IMAGE_SUITE 页面规格。
 *
 * 证据：docs/V1.0/plan_linkfox_navigation/page-specs/01-product-image-suite.md
 * （区域顺序、文案、枚举、默认 4 张、2500 字上限、上传限制）与 registry/index.ts 的 39 工具表。
 *
 * 边界（见 page-spec §实现边界）：
 * - 只复刻信息架构与操作逻辑；不搬 LinkFox 前端代码、不复制算力区、不保存 LinkFox token。
 * - 所有数量/排版都走本模块的纯函数计算，UI 不得另写一套计数逻辑。
 * - “排版”具体条目来自 provider 目录（chunk），本模块不臆造排版名称：
 *   调用方传入 layoutIds（来自目录）才会按“每种排版一张”重算，否则回落到数量输入。
 */

export const PRODUCT_IMAGE_SUITE_TOOL_ID = "PRODUCT_IMAGE_SUITE";
export const PRODUCT_IMAGE_SUITE_DRAFT_KEY = "tool-draft:v1:PRODUCT_IMAGE_SUITE";
export const PRODUCT_IMAGE_SUITE_MAX_PRODUCT_INFO = 2500;
export const PRODUCT_IMAGE_SUITE_MAX_UNITS_PER_MODULE = 10;
export const PRODUCT_IMAGE_SUITE_MAX_UNITS = 40;
export const PRODUCT_IMAGE_SUITE_DEFAULT_COUNT = 4;

/* -------------------------------- 上传限制 -------------------------------- */

/** 源图限制：jpg/jpeg/png/webp，10M 以内，384×384 ~ 4096×4096，宽高比 ≤ 5。 */
export const SUITE_SOURCE_LIMITS = {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
    maxBytes: 10 * 1024 * 1024,
    minSide: 384,
    maxSide: 4096,
    maxAspectRatio: 5,
    maxCount: 1,
} as const;

/* ------------------------------ 模块（套图组成） ------------------------------ */

export type SuiteModuleKind = "aplus" | "main-sub";

export type SuiteModuleDescriptor = {
    id: string;
    kind: SuiteModuleKind;
    label: string;
    /** 单模块默认张数：页面规格里每个模块都是 4。 */
    defaultCount: number;
};

/** A+ 图设置：单选（生成类型）。 */
export const APLUS_MODULES: readonly SuiteModuleDescriptor[] = [
    { id: "aplus-advanced", kind: "aplus", label: "高级A+", defaultCount: PRODUCT_IMAGE_SUITE_DEFAULT_COUNT },
    { id: "aplus-mobile", kind: "aplus", label: "手机A+", defaultCount: PRODUCT_IMAGE_SUITE_DEFAULT_COUNT },
    { id: "aplus-standard", kind: "aplus", label: "普通A+", defaultCount: PRODUCT_IMAGE_SUITE_DEFAULT_COUNT },
    { id: "aplus-custom-ratio", kind: "aplus", label: "自定比例", defaultCount: PRODUCT_IMAGE_SUITE_DEFAULT_COUNT },
] as const;

/** 主副图设置：多选（生成类型）。 */
export const MAIN_SUB_MODULES: readonly SuiteModuleDescriptor[] = [
    { id: "selling-point", kind: "main-sub", label: "卖点图", defaultCount: PRODUCT_IMAGE_SUITE_DEFAULT_COUNT },
    { id: "white-background", kind: "main-sub", label: "白底图", defaultCount: PRODUCT_IMAGE_SUITE_DEFAULT_COUNT },
    { id: "scene", kind: "main-sub", label: "场景图", defaultCount: PRODUCT_IMAGE_SUITE_DEFAULT_COUNT },
    { id: "closeup", kind: "main-sub", label: "特写图", defaultCount: PRODUCT_IMAGE_SUITE_DEFAULT_COUNT },
    { id: "closeup-white", kind: "main-sub", label: "特写白底图", defaultCount: PRODUCT_IMAGE_SUITE_DEFAULT_COUNT },
] as const;

export const SUITE_MODULES: readonly SuiteModuleDescriptor[] = [...APLUS_MODULES, ...MAIN_SUB_MODULES];

export const APLUS_MODULE_IDS = APLUS_MODULES.map((module) => module.id);
export const MAIN_SUB_MODULE_IDS = MAIN_SUB_MODULES.map((module) => module.id);

export function findSuiteModule(id: string): SuiteModuleDescriptor | undefined {
    return SUITE_MODULES.find((module) => module.id === id);
}

/* --------------------------------- 枚举 --------------------------------- */

/** “选择排版”为单选：每种排版生成一张 / 无文字模式。 */
export const SUITE_LAYOUT_MODES = [
    { id: "per-layout", label: "每种排版生成一张" },
    { id: "no-text", label: "无文字模式" },
] as const;
export type SuiteLayoutMode = (typeof SUITE_LAYOUT_MODES)[number]["id"];

export const SUITE_RESOLUTIONS = ["1K", "2K", "4K"] as const;
export type SuiteResolution = (typeof SUITE_RESOLUTIONS)[number];

/** 模型品质：低/中/高/超高/最大。tier 只进入 Prompt 与快照，不冒充 provider 的 quality 参数。 */
export const SUITE_QUALITIES = [
    { id: "low", label: "低品质", tier: 1 },
    { id: "medium", label: "中品质", tier: 2 },
    { id: "high", label: "高品质", tier: 3 },
    { id: "ultra", label: "超高品质", tier: 4 },
    { id: "max", label: "最大品质", tier: 5 },
] as const;
export type SuiteQuality = (typeof SUITE_QUALITIES)[number]["id"];

export const SUITE_RATIOS = [
    { id: "1:1", label: "1:1" },
    { id: "3:4", label: "3:4" },
    { id: "4:3", label: "4:3" },
    { id: "2:3", label: "2:3" },
    { id: "3:2", label: "3:2" },
] as const;
export type SuiteRatio = (typeof SUITE_RATIOS)[number]["id"];

export const SUITE_FONT_STYLES = [
    { id: "modern", label: "现代无衬线" },
    { id: "classic", label: "经典衬线" },
    { id: "bold", label: "粗体强调" },
] as const;
export type SuiteFontStyle = (typeof SUITE_FONT_STYLES)[number]["id"];

/* --------------------------------- 配置 --------------------------------- */

export type SuiteBrandConfig = {
    /** 智能品牌基因：开启后主色/字体风格才参与 Prompt。 */
    smartBrand: boolean;
    primaryColor: string;
    fontStyle: SuiteFontStyle | "";
};

/** 合规词库来自目录（chunk），这里只保存用户的选择结果。 */
export type SuiteComplianceConfig = {
    sensitiveWordLexiconId: string;
    replacementWordLexiconId: string;
};

export type SuiteConfig = {
    /** 商品图资产 id（TASK-004 上传返回）。 */
    sourceAssetId: string;
    /** 商品信息 ≤ 2500 字。 */
    productInfo: string;
    brand: SuiteBrandConfig;
    compliance: SuiteComplianceConfig;
    resolution: SuiteResolution;
    quality: SuiteQuality;
    ratio: SuiteRatio;
    /** A+ 图生成类型（单选，空 = 不生成 A+）。 */
    aplusModuleId: string;
    aplusCount: number;
    aplusLayoutMode: SuiteLayoutMode;
    aplusLayoutIds: string[];
    /** 主副图生成类型（多选，空 = 不生成主副图）。 */
    mainSubModuleIds: string[];
    mainSubCounts: Record<string, number>;
    mainSubLayoutMode: SuiteLayoutMode;
    mainSubLayoutIds: string[];
    /** 空 = 使用当前用户配置的图片模型。 */
    model: string;
};

const countSchema = z.number().int().min(1).max(PRODUCT_IMAGE_SUITE_MAX_UNITS_PER_MODULE);

export const suiteConfigSchema = z.object({
    sourceAssetId: z.string().default(""),
    productInfo: z.string().max(PRODUCT_IMAGE_SUITE_MAX_PRODUCT_INFO).default(""),
    brand: z
        .object({
            smartBrand: z.boolean().default(false),
            primaryColor: z.string().default(""),
            fontStyle: z.union([z.enum(["modern", "classic", "bold"]), z.literal("")]).default(""),
        })
        .default({ smartBrand: false, primaryColor: "", fontStyle: "" }),
    compliance: z
        .object({
            sensitiveWordLexiconId: z.string().default(""),
            replacementWordLexiconId: z.string().default(""),
        })
        .default({ sensitiveWordLexiconId: "", replacementWordLexiconId: "" }),
    resolution: z.enum(SUITE_RESOLUTIONS).default("2K"),
    quality: z.enum(["low", "medium", "high", "ultra", "max"]).default("high"),
    ratio: z.enum(["1:1", "3:4", "4:3", "2:3", "3:2"]).default("1:1"),
    aplusModuleId: z.string().default(""),
    aplusCount: countSchema.default(PRODUCT_IMAGE_SUITE_DEFAULT_COUNT),
    aplusLayoutMode: z.enum(["per-layout", "no-text"]).default("no-text"),
    aplusLayoutIds: z.array(z.string()).default([]),
    mainSubModuleIds: z.array(z.string()).default([]),
    mainSubCounts: z.record(z.string(), countSchema).default({}),
    mainSubLayoutMode: z.enum(["per-layout", "no-text"]).default("no-text"),
    mainSubLayoutIds: z.array(z.string()).default([]),
    model: z.string().default(""),
});

export function createDefaultSuiteConfig(overrides: Partial<SuiteConfig> = {}): SuiteConfig {
    return { ...suiteConfigSchema.parse({}), ...overrides };
}

/** 草稿（TASK-004 tool-draft）里的 values 形状 → 配置；非法字段回落到默认值并给出 issues。 */
export function readSuiteConfig(values: Record<string, unknown> | undefined): { config: SuiteConfig; issues: string[] } {
    const parsed = suiteConfigSchema.safeParse(values ?? {});
    if (parsed.success) return { config: parsed.data, issues: [] };
    return {
        config: createDefaultSuiteConfig(),
        issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`),
    };
}

/* ------------------------------- 数量与计划 ------------------------------- */

export type SuiteModulePlan = {
    moduleId: string;
    kind: SuiteModuleKind;
    label: string;
    count: number;
    layoutMode: SuiteLayoutMode;
    layoutIds: string[];
    /** 计数来源：排版条目数，或数量输入。 */
    countSource: "layout" | "quantity";
};

function clampCount(value: number): number {
    if (!Number.isFinite(value)) return 1;
    return Math.min(PRODUCT_IMAGE_SUITE_MAX_UNITS_PER_MODULE, Math.max(1, Math.round(value)));
}

/**
 * 数量与排版共同决定产物数：
 * - 选了排版（layoutIds 非空）→ 每种排版生成一张；
 * - 未选排版 → 按数量生成（官方排版随机）。
 */
export function resolveModuleCount(input: { count: number; layoutMode: SuiteLayoutMode; layoutIds: string[] }): {
    count: number;
    countSource: "layout" | "quantity";
} {
    const layoutIds = input.layoutIds.filter((id) => id.trim().length > 0);
    if (input.layoutMode === "per-layout" && layoutIds.length > 0) {
        return { count: Math.min(layoutIds.length, PRODUCT_IMAGE_SUITE_MAX_UNITS_PER_MODULE), countSource: "layout" };
    }
    return { count: clampCount(input.count), countSource: "quantity" };
}

/** 按页面顺序（A+ 在前、主副图在后）展开模块计划；取消勾选的模块不出现。 */
export function buildSuiteModulePlan(config: SuiteConfig): SuiteModulePlan[] {
    const plans: SuiteModulePlan[] = [];
    const aplus = config.aplusModuleId ? findSuiteModule(config.aplusModuleId) : undefined;
    if (aplus && aplus.kind === "aplus") {
        const resolved = resolveModuleCount({ count: config.aplusCount, layoutMode: config.aplusLayoutMode, layoutIds: config.aplusLayoutIds });
        plans.push({
            moduleId: aplus.id,
            kind: "aplus",
            label: aplus.label,
            count: resolved.count,
            layoutMode: config.aplusLayoutMode,
            layoutIds: config.aplusLayoutIds,
            countSource: resolved.countSource,
        });
    }
    for (const module of MAIN_SUB_MODULES) {
        if (!config.mainSubModuleIds.includes(module.id)) continue;
        const resolved = resolveModuleCount({
            count: config.mainSubCounts[module.id] ?? module.defaultCount,
            layoutMode: config.mainSubLayoutMode,
            layoutIds: config.mainSubLayoutIds,
        });
        plans.push({
            moduleId: module.id,
            kind: "main-sub",
            label: module.label,
            count: resolved.count,
            layoutMode: config.mainSubLayoutMode,
            layoutIds: config.mainSubLayoutIds,
            countSource: resolved.countSource,
        });
    }
    return plans;
}

export type SuiteUnit = {
    /** 同一次运行内稳定的单元 id：模块 + 序号。重试沿用同一个 id。 */
    id: string;
    moduleId: string;
    kind: SuiteModuleKind;
    moduleLabel: string;
    index: number;
    total: number;
    label: string;
    layoutId?: string;
    prompt: string;
};

/** 展开为可提交单元：每个模块的每张图是一个独立 provider 任务。 */
export function buildSuiteUnits(config: SuiteConfig): SuiteUnit[] {
    const units: SuiteUnit[] = [];
    for (const plan of buildSuiteModulePlan(config)) {
        const layoutIds = plan.countSource === "layout" ? plan.layoutIds.slice(0, plan.count) : [];
        for (let index = 1; index <= plan.count; index += 1) {
            const layoutId = layoutIds[index - 1];
            units.push({
                id: `${plan.moduleId}#${index}`,
                moduleId: plan.moduleId,
                kind: plan.kind,
                moduleLabel: plan.label,
                index,
                total: plan.count,
                label: `${plan.label} ${index}/${plan.count}`,
                layoutId,
                prompt: buildSuiteUnitPrompt(config, { plan, index, layoutId }),
            });
        }
    }
    return units;
}

export function suiteExpectedCount(config: SuiteConfig): number {
    return buildSuiteModulePlan(config).reduce((sum, plan) => sum + plan.count, 0);
}

/* --------------------------------- Prompt -------------------------------- */

function qualityLabel(quality: SuiteQuality): string {
    return SUITE_QUALITIES.find((entry) => entry.id === quality)?.label ?? quality;
}

function layoutInstruction(plan: SuiteModulePlan, layoutId: string | undefined): string {
    if (plan.layoutMode === "no-text") return "无文字模式：画面不出现任何文字、水印或 logo。";
    if (layoutId) return `排版：${layoutId}（该排版一张，保持版式比例与留白）。`;
    return "排版：未指定，按官方排版随机选一套。";
}

/**
 * 单元 Prompt 是唯一进入 provider 的指令来源：
 * 商品信息、品牌基因、合规替换、尺寸/比例/品质、模块语义都在这里落地。
 */
export function buildSuiteUnitPrompt(
    config: SuiteConfig,
    input: { plan: SuiteModulePlan; index: number; layoutId?: string },
): string {
    const { plan, index, layoutId } = input;
    const parts: string[] = [];
    const kindText =
        plan.kind === "aplus"
            ? `A+ 详情页模块（${plan.label}）第 ${index}/${plan.count} 屏`
            : `商品主副图（${plan.label}）第 ${index}/${plan.count} 张`;
    parts.push(`基于上传的商品图生成 ${kindText}。`);
    parts.push("保持商品本体形状、颜色、材质纹理、logo 与文字标识不变，不得臆造未出现的配件或赠品。");
    parts.push(`输出比例 ${config.ratio}，分辨率 ${config.resolution}，品质 ${qualityLabel(config.quality)}。`);
    parts.push(layoutInstruction(plan, layoutId));
    const info = config.productInfo.trim();
    parts.push(info ? `商品信息：${info}` : "商品信息：未填写，仅依据商品图推断外观卖点，不编造参数。");
    if (config.brand.smartBrand) {
        const brandBits: string[] = [];
        if (config.brand.primaryColor.trim()) brandBits.push(`主色 ${config.brand.primaryColor.trim()}`);
        if (config.brand.fontStyle) {
            const font = SUITE_FONT_STYLES.find((entry) => entry.id === config.brand.fontStyle);
            if (font) brandBits.push(`字体风格 ${font.label}`);
        }
        parts.push(brandBits.length ? `品牌基因：${brandBits.join("，")}。` : "品牌基因：已启用，未指定主色与字体。");
    }
    if (config.compliance.sensitiveWordLexiconId || config.compliance.replacementWordLexiconId) {
        parts.push("合规：命中敏感词时按替换词库改写文案，不出现绝对化用语与医疗功效承诺。");
    }
    return parts.join("\n");
}

/* --------------------------------- 校验 --------------------------------- */

export type SuiteValidationIssue = {
    field: string;
    code:
        | "source-missing"
        | "product-info-too-long"
        | "module-missing"
        | "count-out-of-range"
        | "unit-limit"
        | "quality-missing"
        | "capability-missing";
    message: string;
};

export type SuiteValidationContext = {
    /** 源图是否已就绪（有 assetId 且有可访问 dataUrl/url）。 */
    sourceReady: boolean;
    /** 用户当前是否配置了可用的图片模型。 */
    imageModelReady: boolean;
};

export function validateSuiteConfig(config: SuiteConfig, context: SuiteValidationContext): SuiteValidationIssue[] {
    const issues: SuiteValidationIssue[] = [];
    if (!config.sourceAssetId.trim() || !context.sourceReady) {
        issues.push({ field: "sourceAssetId", code: "source-missing", message: "请先上传商品图（jpg / png / webp，10M 以内）。" });
    }
    if (config.productInfo.length > PRODUCT_IMAGE_SUITE_MAX_PRODUCT_INFO) {
        issues.push({
            field: "productInfo",
            code: "product-info-too-long",
            message: `商品信息最多 ${PRODUCT_IMAGE_SUITE_MAX_PRODUCT_INFO} 字，当前 ${config.productInfo.length} 字。`,
        });
    }
    if (!context.imageModelReady) {
        issues.push({ field: "model", code: "capability-missing", message: "当前没有可用的图片模型，请先在设置里配置模型频道。" });
    }
    const plan = buildSuiteModulePlan(config);
    if (plan.length === 0) {
        issues.push({ field: "aplusModuleId", code: "module-missing", message: "请至少选择一个生成类型：A+ 图或主副图。" });
    }
    if (config.aplusModuleId && !findSuiteModule(config.aplusModuleId)) {
        issues.push({ field: "aplusModuleId", code: "module-missing", message: `未知的 A+ 生成类型：${config.aplusModuleId}` });
    }
    for (const moduleId of config.mainSubModuleIds) {
        if (!findSuiteModule(moduleId)) {
            issues.push({ field: "mainSubModuleIds", code: "module-missing", message: `未知的主副图类型：${moduleId}` });
        }
    }
    for (const entry of plan) {
        if (entry.count < 1 || entry.count > PRODUCT_IMAGE_SUITE_MAX_UNITS_PER_MODULE) {
            issues.push({
                field: entry.moduleId,
                code: "count-out-of-range",
                message: `${entry.label} 数量需在 1–${PRODUCT_IMAGE_SUITE_MAX_UNITS_PER_MODULE} 之间。`,
            });
        }
    }
    const total = plan.reduce((sum, entry) => sum + entry.count, 0);
    if (total > PRODUCT_IMAGE_SUITE_MAX_UNITS) {
        issues.push({ field: "aplusModuleId", code: "unit-limit", message: `单次套图最多 ${PRODUCT_IMAGE_SUITE_MAX_UNITS} 张，当前 ${total} 张。` });
    }
    return issues;
}

/* --------------------------- 快照 / 指纹 / 字段 --------------------------- */

/** 生成相关字段（不含 UI 展开状态），用于判断结果是否来自旧配置。 */
export function suiteGenerationFields(config: SuiteConfig): Record<string, unknown> {
    return {
        sourceAssetId: config.sourceAssetId,
        productInfo: config.productInfo.trim(),
        brand: config.brand,
        compliance: config.compliance,
        resolution: config.resolution,
        quality: config.quality,
        ratio: config.ratio,
        aplusModuleId: config.aplusModuleId,
        aplusCount: config.aplusCount,
        aplusLayoutMode: config.aplusLayoutMode,
        aplusLayoutIds: [...config.aplusLayoutIds].sort(),
        mainSubModuleIds: [...config.mainSubModuleIds].sort(),
        mainSubCounts: Object.fromEntries(Object.entries(config.mainSubCounts).sort(([a], [b]) => a.localeCompare(b))),
        mainSubLayoutMode: config.mainSubLayoutMode,
        mainSubLayoutIds: [...config.mainSubLayoutIds].sort(),
        model: config.model,
    };
}

/** 稳定指纹：键序无关，用于判重与“结果是否过期”。 */
export function suiteConfigFingerprint(config: SuiteConfig): string {
    const canonical = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(canonical);
        if (value && typeof value === "object") {
            return Object.fromEntries(
                Object.entries(value as Record<string, unknown>)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, entry]) => [key, canonical(entry)]),
            );
        }
        return value;
    };
    return JSON.stringify(canonical(suiteGenerationFields(config)));
}

export type SuiteConfigSnapshot = {
    revision: number;
    fingerprint: string;
    capturedAt: number;
    fields: Record<string, unknown>;
};

export function createSuiteSnapshot(config: SuiteConfig, revision: number, now = Date.now()): SuiteConfigSnapshot {
    return { revision, fingerprint: suiteConfigFingerprint(config), capturedAt: now, fields: suiteGenerationFields(config) };
}

export function isSuiteSnapshotStale(snapshot: SuiteConfigSnapshot | undefined, config: SuiteConfig): boolean {
    if (!snapshot) return true;
    return snapshot.fingerprint !== suiteConfigFingerprint(config);
}

/**
 * 提交给 gateway 的工具字段（TOOL_ADAPTER_TABLE.PRODUCT_IMAGE_SUITE.fields = imageUrl / outputNum）。
 * imageUrl 用源图资产 id 占位引用，outputNum 是本次套图单元总量。
 */
export function buildSuiteToolFields(config: SuiteConfig, sourceRef: string): { imageUrl: string; outputNum: number } {
    return { imageUrl: sourceRef, outputNum: suiteExpectedCount(config) };
}

/* --------------------------------- ToolSpec -------------------------------- */

/** 与 registry/index.ts 中的 PRODUCT_IMAGE_SUITE 条目一一对应（测试里断言相等）。 */
export const PRODUCT_IMAGE_SUITE_SPEC: ToolSpec = {
    id: PRODUCT_IMAGE_SUITE_TOOL_ID,
    index: 1,
    title: "商品套图",
    category: "ecommerce-suite",
    slug: "product-image-suite",
    route: "/tools/ecommerce-suite/product-image-suite",
    makeType: 71,
    origin: "original",
    layout: "suite",
    adapter: "image",
    batchCapable: true,
    enabled: true,
    fields: [
        { key: "imageUrl", control: "upload", required: true, providerRule: "string(URL)" },
        { key: "outputNum", control: "number", required: true, defaultValue: 1, providerRule: "integer" },
    ],
};
