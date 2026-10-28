import { z } from "zod";

/**
 * TASK-018：PRODUCT_REFINE（商品精修）的页面契约。
 *
 * 事实来源：docs/V1.0/plan_linkfox_navigation/page-specs/11-product-refine.md（原站
 * https://www.linkfox.com/draw/product-refine 的 workspace DOM）与 registry/index.ts 的 ToolSpec。
 *
 * 真实边界：
 * - 去背景开关直接映射 provider 字段 `isRmBg`（显式 boolean，不 undefined）；
 * - 自动生图尺寸规则（≤512 → ×4，513–1024 → ×2，>1024 原尺寸）决定真实提交的 `size`；
 * - `ratio` / `color` 是 provider schema 里的真实字段，随源图/用户输入自动绑定；
 * - 精修强度在 provider schema 中没有独立字段（gateway 的 PRODUCT_REFINE.fields 不含 strength），
 *   因此它通过提示词 + 快照参与真实请求与审计，绝不假装是一个被丢弃的 UI 装饰项。
 */

export const PRODUCT_REFINE_TOOL_ID = "PRODUCT_REFINE";

/** 源图硬约束：页面明示 20M 以内、jpg/jpeg/png/webp。 */
export const PRODUCT_REFINE_SOURCE_LIMITS = {
    mimeTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp"] as const,
    maxBytes: 20 * 1024 * 1024,
    minSide: 64,
    maxSide: 4096,
};

/* ============================== 精修模式 ============================== */

export type ProductRefineModeId = "full" | "cutout";

export type ProductRefineMode = {
    id: ProductRefineModeId;
    label: string;
    hint: string;
    /** 真正进入 provider 请求的 isRmBg。 */
    isRmBg: boolean;
    /** 去背景精修会额外产出透明/分段结果。 */
    producesAlpha: boolean;
};

export const PRODUCT_REFINE_MODES: readonly ProductRefineMode[] = [
    {
        id: "full",
        label: "整图精修",
        hint: "保留原始场景，只改善轮廓、光泽、材质与颜色。",
        isRmBg: false,
        producesAlpha: false,
    },
    {
        id: "cutout",
        label: "去背景精修",
        hint: "先移除背景再精修主体，额外产出透明底（及分段结果）。",
        isRmBg: true,
        producesAlpha: true,
    },
];

export function isProductRefineModeId(value: unknown): value is ProductRefineModeId {
    return typeof value === "string" && PRODUCT_REFINE_MODES.some((mode) => mode.id === value);
}

export function productRefineMode(id: ProductRefineModeId): ProductRefineMode {
    return PRODUCT_REFINE_MODES.find((mode) => mode.id === id) ?? PRODUCT_REFINE_MODES[0];
}

/* ============================== 精修强度 ============================== */

export type ProductRefineStrengthId = "light" | "standard" | "strong";

export type ProductRefineStrength = {
    id: ProductRefineStrengthId;
    label: string;
    hint: string;
    /** 进入提示词的强度描述（provider 侧无独立字段）。 */
    instruction: string;
};

export const PRODUCT_REFINE_STRENGTHS: readonly ProductRefineStrength[] = [
    {
        id: "light",
        label: "轻度",
        hint: "只做保守微调，尽量贴近原图观感。",
        instruction: "轻度：仅做保守微调，肤色/底色与原图保持一致，不改变明暗关系与阴影走向。",
    },
    {
        id: "standard",
        label: "标准",
        hint: "默认档位，平衡质感提升与原图一致性。",
        instruction: "标准：在保持原有构图、明暗关系不变的前提下，提升轮廓清晰度、光泽层次与材质细节。",
    },
    {
        id: "strong",
        label: "强力",
        hint: "更明显的质感与颜色强化，适合平铺图/电商主图。",
        instruction: "强力：明显强化轮廓边缘、高光与材质纹理，并按需校正偏色；仍禁止改变商品形状、结构与纹理走向。",
    },
];

export function isProductRefineStrengthId(value: unknown): value is ProductRefineStrengthId {
    return typeof value === "string" && PRODUCT_REFINE_STRENGTHS.some((strength) => strength.id === value);
}

export function productRefineStrength(id: ProductRefineStrengthId): ProductRefineStrength {
    return PRODUCT_REFINE_STRENGTHS.find((strength) => strength.id === id) ?? PRODUCT_REFINE_STRENGTHS[1];
}

/* ============================== 页面取值 ============================== */

export type ProductRefineValues = {
    mode: ProductRefineModeId;
    strength: ProductRefineStrengthId;
    /** 色彩校正：关闭时 color 为空且不进入请求。 */
    colorEnabled: boolean;
    /** #RRGGBB 或 #RRGGBBAA。 */
    color: string;
    imageName: string;
    sourceAssetId?: string;
};

export const DEFAULT_PRODUCT_REFINE_VALUES: ProductRefineValues = {
    mode: "full",
    strength: "standard",
    colorEnabled: false,
    color: "",
    imageName: "",
};

const HEX_COLOR = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function normalizeHexColor(raw: string): string {
    const value = raw.trim();
    if (!value) return "";
    const withHash = value.startsWith("#") ? value : `#${value}`;
    return HEX_COLOR.test(withHash) ? withHash.toUpperCase() : "";
}

export function isValidHexColor(raw: string): boolean {
    return HEX_COLOR.test(raw.trim());
}

/* ============================== 自动尺寸规则 ============================== */

/** 页面明示规则：原图 ≤512px → 放大 4 倍，513–1024px → 放大 2 倍，>1024px → 原尺寸。 */
export const PRODUCT_REFINE_SCALE_RULES = [
    { maxSide: 512, factor: 4, label: "≤512px → 放大 4 倍" },
    { maxSide: 1024, factor: 2, label: "513~1024px → 放大 2 倍" },
    { maxSide: Number.POSITIVE_INFINITY, factor: 1, label: "＞1024px → 原尺寸" },
] as const;

export type ProductRefineSourceSize = { width?: number; height?: number };

export type ProductRefineIssueCode =
    | "source-required"
    | "source-size-unknown"
    | "model-missing"
    | "color-invalid"
    | "output-invalid"
    | "output-too-large"
    | "output-too-small";

export type ProductRefineIssue = {
    code: ProductRefineIssueCode;
    field: string;
    message: string;
};

export type ProductRefineOutput = {
    /** 自动规则命中的放大倍数。 */
    factor: number;
    /** 命中规则的中文说明，直接展示给用户核对。 */
    ruleLabel: string;
    width: number;
    height: number;
    /** 输出长边（provider 字段 imageOutputLength）。 */
    longEdge: number;
    /** 输出比例（约分后的 "w:h"），provider 字段 ratio。 */
    ratio: string;
    legal: boolean;
    issues: ProductRefineIssue[];
};

export const PRODUCT_REFINE_OUTPUT_LIMITS = {
    maxSide: 4096,
    minSide: 64,
};

export function refineScaleFactor(sourceMaxSide: number): { factor: number; ruleLabel: string } {
    if (!Number.isFinite(sourceMaxSide) || sourceMaxSide <= 0) return { factor: 1, ruleLabel: "待上传原图" };
    const rule = PRODUCT_REFINE_SCALE_RULES.find((item) => sourceMaxSide <= item.maxSide) ?? PRODUCT_REFINE_SCALE_RULES[2];
    return { factor: rule.factor, ruleLabel: rule.label };
}

function gcd(a: number, b: number): number {
    let x = Math.abs(Math.round(a));
    let y = Math.abs(Math.round(b));
    while (y) {
        const next = x % y;
        x = y;
        y = next;
    }
    return x || 1;
}

/** 输出比例只由真实源图尺寸推导，不提供“随便选比例”的假控件。 */
export function outputRatioLabel(width: number, height: number): string {
    if (width <= 0 || height <= 0) return "待上传原图";
    const divisor = gcd(width, height);
    return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

export function computeProductRefineOutput(source?: ProductRefineSourceSize | null): ProductRefineOutput {
    const sourceWidth = Math.max(0, Math.round(Number(source?.width ?? 0)));
    const sourceHeight = Math.max(0, Math.round(Number(source?.height ?? 0)));
    const hasSource = sourceWidth > 0 && sourceHeight > 0;
    const { factor, ruleLabel } = refineScaleFactor(Math.max(sourceWidth, sourceHeight));
    const width = hasSource ? Math.round(sourceWidth * factor) : 0;
    const height = hasSource ? Math.round(sourceHeight * factor) : 0;
    const issues: ProductRefineIssue[] = [];

    if (!hasSource) {
        issues.push({ code: "source-size-unknown", field: "source", message: "上传原图后才能按自动规则算出输出尺寸。" });
    } else {
        if (Math.max(width, height) > PRODUCT_REFINE_OUTPUT_LIMITS.maxSide) {
            issues.push({
                code: "output-too-large",
                field: "source",
                message: `按自动规则放大后长边 ${Math.max(width, height)}px 超过 ${PRODUCT_REFINE_OUTPUT_LIMITS.maxSide}px 上限，请先压缩原图。`,
            });
        }
        if (Math.min(width, height) < PRODUCT_REFINE_OUTPUT_LIMITS.minSide) {
            issues.push({
                code: "output-too-small",
                field: "source",
                message: `原图短边过小（输出 ${width}×${height}），请上传更清晰的商品图。`,
            });
        }
    }

    return {
        factor,
        ruleLabel,
        width,
        height,
        longEdge: Math.max(width, height),
        ratio: outputRatioLabel(width, height),
        legal: issues.length === 0,
        issues,
    };
}

export function productRefineOutputLabel(output: ProductRefineOutput): string {
    if (output.width <= 0 || output.height <= 0) return "待上传原图";
    return `${output.width}×${output.height}`;
}

/* ============================== 校验 / 提示词 ============================== */

export function validateProductRefineState(input: {
    values: ProductRefineValues;
    output: ProductRefineOutput;
    sourceReady: boolean;
    imageModelReady: boolean;
}): ProductRefineIssue[] {
    const issues: ProductRefineIssue[] = [];
    if (!input.sourceReady) issues.push({ code: "source-required", field: "source", message: "请先上传待精修的商品图。" });
    if (!input.imageModelReady) {
        issues.push({ code: "model-missing", field: "model", message: "未配置可用的图片模型，请先在设置里选择。" });
    }
    if (input.values.colorEnabled) {
        const color = input.values.color.trim();
        if (!color) issues.push({ code: "color-invalid", field: "color", message: "已开启色彩校正，请填写目标色值。" });
        else if (!isValidHexColor(color)) {
            issues.push({ code: "color-invalid", field: "color", message: "色值需为 #RRGGBB 或 #RRGGBBAA。" });
        }
    }
    issues.push(...input.output.issues.filter((issue) => input.sourceReady || issue.code !== "source-size-unknown"));
    return issues;
}

export function hasProductRefineBlockingIssue(issues: readonly ProductRefineIssue[]): boolean {
    return issues.some((issue) => issue.code !== "source-size-unknown");
}

/** 预计产物数量：整图精修 1 张；去背景精修在透明底之外可能带分段结果，所以只承诺主结果 1 张。 */
export function productRefineExpectedCount(values: ProductRefineValues): number {
    return values.mode === "cutout" ? 1 : 1;
}

export function buildProductRefinePrompt(values: ProductRefineValues, output: ProductRefineOutput): string {
    const mode = productRefineMode(values.mode);
    const strength = productRefineStrength(values.strength);
    const size = output.width > 0 ? `${output.width}×${output.height}` : "与原图一致";
    const lines = [
        `对给定商品图做精修：输出尺寸 ${size}（自动规则 ${output.ruleLabel}，比例 ${output.ratio}）。`,
        "只改善商品的轮廓、光泽、材质与颜色：保持商品结构、造型、纹理走向、Logo 与文字内容完全不变，不新增或删除部件。",
        `精修模式：${mode.label}。${mode.hint}`,
    ];
    if (mode.isRmBg) {
        lines.push("背景处理：移除背景，主体边缘保持干净、无残留杂边与灰边，输出透明底。");
    } else {
        lines.push("背景处理：保留原始背景与场景，不替换、不改色、不虚化。");
    }
    lines.push(`精修强度：${strength.instruction}`);
    if (values.colorEnabled && values.color.trim()) {
        lines.push(`颜色校正：把商品主色向 ${normalizeHexColor(values.color) || values.color.trim()} 校正，仅调整偏色与白平衡，不改变材质与明暗结构。`);
    } else {
        lines.push("颜色校正：关闭，仅做自然还原，不主动改变色相。");
    }
    return lines.join("\n");
}

/* ============================== 草稿 / 快照 ============================== */

const valuesSchema = z.object({
    mode: z.string().optional(),
    strength: z.string().optional(),
    colorEnabled: z.boolean().optional(),
    color: z.string().optional(),
    imageName: z.string().optional(),
    sourceAssetId: z.string().optional(),
});

/** 草稿恢复：非法枚举回落到默认值，不用脏值污染提交。 */
export function readProductRefineValues(raw: unknown): ProductRefineValues {
    const parsed = valuesSchema.safeParse(raw ?? {});
    const data = parsed.success ? parsed.data : {};
    const color = typeof data.color === "string" ? data.color : "";
    return {
        mode: isProductRefineModeId(data.mode) ? data.mode : DEFAULT_PRODUCT_REFINE_VALUES.mode,
        strength: isProductRefineStrengthId(data.strength) ? data.strength : DEFAULT_PRODUCT_REFINE_VALUES.strength,
        colorEnabled: data.colorEnabled === true,
        color: isValidHexColor(color) ? normalizeHexColor(color) : "",
        imageName: typeof data.imageName === "string" ? data.imageName : "",
        ...(typeof data.sourceAssetId === "string" && data.sourceAssetId ? { sourceAssetId: data.sourceAssetId } : {}),
    };
}

export type ProductRefineSnapshot = {
    toolId: typeof PRODUCT_REFINE_TOOL_ID;
    mode: ProductRefineModeId;
    isRmBg: boolean;
    strength: ProductRefineStrengthId;
    color: string;
    width: number;
    height: number;
    ratio: string;
    sourceAssetId: string;
    sourceWidth: number;
    sourceHeight: number;
    revision: number | string | null;
    fingerprint: string;
};

export function productRefineFingerprint(input: Omit<ProductRefineSnapshot, "fingerprint" | "toolId">): string {
    const parts = [
        "PRODUCT_REFINE",
        input.mode,
        input.isRmBg ? "rmbg" : "keep-bg",
        input.strength,
        input.color || "no-color",
        `${input.width}x${input.height}`,
        input.ratio,
        input.sourceAssetId,
        `${input.sourceWidth}x${input.sourceHeight}`,
        String(input.revision ?? ""),
    ];
    const joined = parts.join("|");
    let hash = 2166136261;
    for (let index = 0; index < joined.length; index += 1) {
        hash ^= joined.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `refine-${(hash >>> 0).toString(16)}`;
}

export function createProductRefineSnapshot(
    values: ProductRefineValues,
    output: ProductRefineOutput,
    source: { assetId: string } & ProductRefineSourceSize,
    revision: number | string | null = null,
): ProductRefineSnapshot {
    const mode = productRefineMode(values.mode);
    const base = {
        mode: values.mode,
        isRmBg: mode.isRmBg,
        strength: values.strength,
        color: values.colorEnabled ? normalizeHexColor(values.color) || values.color.trim() : "",
        width: output.width,
        height: output.height,
        ratio: output.ratio,
        sourceAssetId: source.assetId,
        sourceWidth: Number(source.width ?? 0),
        sourceHeight: Number(source.height ?? 0),
        revision,
    };
    return { toolId: PRODUCT_REFINE_TOOL_ID, ...base, fingerprint: productRefineFingerprint(base) };
}

/** 结果是否来自旧配置（换图/改模式/改强度后不能冒充当前结果）。 */
export function isProductRefineSnapshotStale(
    snapshot: ProductRefineSnapshot | undefined,
    current: ProductRefineSnapshot | undefined,
): boolean {
    if (!snapshot) return false;
    if (!current) return true;
    return snapshot.fingerprint !== current.fingerprint;
}

/** 本次结果相对当前配置的差异说明，用于“来自旧版本”提示。 */
export function describeProductRefineDrift(
    snapshot: ProductRefineSnapshot | undefined,
    current: ProductRefineSnapshot | undefined,
): string {
    if (!snapshot || !current) return "";
    const reasons: string[] = [];
    if (snapshot.sourceAssetId !== current.sourceAssetId) reasons.push("源图");
    if (snapshot.mode !== current.mode) reasons.push("精修模式");
    if (snapshot.strength !== current.strength) reasons.push("精修强度");
    if (snapshot.color !== current.color) reasons.push("色彩配置");
    if (snapshot.width !== current.width || snapshot.height !== current.height) reasons.push("输出尺寸");
    return reasons.join("、");
}
