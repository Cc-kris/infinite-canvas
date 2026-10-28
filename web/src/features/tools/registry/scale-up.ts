import { z } from "zod";

/**
 * TASK-012：SCALE_UP（高清放大）的页面契约。
 *
 * 事实来源：docs/V1.0/plan_linkfox_navigation/page-specs/05-scale-up.md（原站
 * https://www.linkfox.com/draw/quality-increase 的 workspace DOM）与 registry/index.ts 的 ToolSpec。
 *
 * 真实边界：
 * - 输出尺寸不是 UI 装饰字段，它决定提交给 provider 的 `size`；因此这里按
 *   services/api/image.ts 的真实尺寸规则（16 步进 / 边长 ≤3840 / 像素 655360–8294400 / 比例 ≤3）
 *   判定“能否真的按该倍率产出”，不合法就阻塞提交并给出合法建议，绝不悄悄换一个尺寸。
 * - 面部增强/质量增强会同时进入 prompt 与 provider quality 参数；magnification 等先写入任务 fields 参与指纹，
 *   不会成为“看起来生效、实际丢失”的参数（见 adapters/scale-up.ts#assertScaleUpInput 的守卫）。
 */

export const SCALE_UP_TOOL_ID = "SCALE_UP";

/** 页面规格第 2 节的四种模式；magnification=null 表示自定义宽高。 */
export const SCALE_UP_MODES = [
    { id: "enhance", label: "变高清", magnification: 1, hint: "只增强清晰度，输出尺寸与原图一致" },
    { id: "enhance-2x", label: "高清 + 2倍放大", magnification: 2, hint: "输出边长是原图的 2 倍" },
    { id: "enhance-4x", label: "高清 + 4倍放大", magnification: 4, hint: "输出边长是原图的 4 倍" },
    { id: "custom", label: "自定义", magnification: null, hint: "手动输入输出宽高，需保持原图比例" },
] as const;

export type ScaleUpModeId = (typeof SCALE_UP_MODES)[number]["id"];

export const SCALE_UP_QUALITIES = [
    { id: "low", label: "低", providerQuality: "low", hint: "速度优先，细节重建较弱" },
    { id: "medium", label: "中", providerQuality: "medium", hint: "速度与细节平衡" },
    { id: "high", label: "高", providerQuality: "high", hint: "细节最丰富，耗时最长" },
] as const;

export type ScaleUpQualityId = (typeof SCALE_UP_QUALITIES)[number]["id"];

/** 页面文案：支持 jpg、jpeg、png、webp；最大尺寸 4096*4096。 */
export const SCALE_UP_SOURCE_LIMITS = {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
    maxSide: 4096,
    /** 原站未给最小边与体积；沿用仓库默认体积上限，避免把 20M 以上的图塞进浏览器内存。 */
    minSide: 64,
    maxBytes: 20 * 1024 * 1024,
};

/** 与 services/api/image.ts 的 validateImageSize 同源（那边是模块私有常量，这里显式复述并加护栏）。 */
export const SCALE_UP_OUTPUT_LIMITS = {
    step: 16,
    minPixels: 655360,
    maxPixels: 8294400,
    maxEdge: 3840,
    maxRatio: 3,
    /** 自定义尺寸允许的原图比例偏差（取整误差以内）。 */
    ratioTolerance: 0.02,
};

export type ScaleUpValues = {
    mode: ScaleUpModeId;
    enhanceFace: boolean;
    enhanceQuality: ScaleUpQualityId;
    customWidth: number;
    customHeight: number;
    imageName: string;
    sourceAssetId?: string;
};

export const DEFAULT_SCALE_UP_VALUES: ScaleUpValues = {
    mode: "enhance",
    enhanceFace: false,
    enhanceQuality: "high",
    customWidth: 0,
    customHeight: 0,
    imageName: "",
};

export function scaleUpMode(id: ScaleUpModeId) {
    return SCALE_UP_MODES.find((item) => item.id === id) ?? SCALE_UP_MODES[0];
}

export function scaleUpQuality(id: ScaleUpQualityId) {
    return SCALE_UP_QUALITIES.find((item) => item.id === id) ?? SCALE_UP_QUALITIES[SCALE_UP_QUALITIES.length - 1];
}

export function isScaleUpModeId(value: unknown): value is ScaleUpModeId {
    return typeof value === "string" && SCALE_UP_MODES.some((item) => item.id === value);
}

export function isScaleUpQualityId(value: unknown): value is ScaleUpQualityId {
    return typeof value === "string" && SCALE_UP_QUALITIES.some((item) => item.id === value);
}

/* ============================== 尺寸计算 ============================== */

export type ScaleUpIssueCode =
    | "source-required"
    | "source-size-unknown"
    | "output-too-large"
    | "output-too-small"
    | "output-ratio"
    | "custom-invalid"
    | "model-missing";

export type ScaleUpIssue = { code: ScaleUpIssueCode; field: keyof ScaleUpValues | "source" | "model"; message: string };

export type ScaleUpOutput = {
    mode: ScaleUpModeId;
    /** 1 / 2 / 4；自定义模式为实际倍率（按原图边长计算）。 */
    magnification: number;
    requestedWidth: number;
    requestedHeight: number;
    /** 交给 provider 的尺寸（16 步进后的请求值）；不合法时仍然展示请求值，由 issue 说明原因。 */
    width: number;
    height: number;
    legal: boolean;
    /** 同一比例下最接近的合法尺寸，供“一键调整”。 */
    suggestion?: { width: number; height: number };
    issues: ScaleUpIssue[];
};

export function alignToStep(value: number, step: number = SCALE_UP_OUTPUT_LIMITS.step): number {
    const safe = Number.isFinite(value) ? value : 0;
    return Math.max(step, Math.round(safe / step) * step);
}

export function outputSizeIssues(width: number, height: number): ScaleUpIssue[] {
    const issues: ScaleUpIssue[] = [];
    const limits = SCALE_UP_OUTPUT_LIMITS;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
        return [{ code: "custom-invalid", field: "customWidth", message: "输出宽高必须是正整数。" }];
    }
    if (width % limits.step !== 0 || height % limits.step !== 0) {
        issues.push({ code: "custom-invalid", field: "customWidth", message: `输出宽高必须是 ${limits.step} 的整数倍（模型要求）。` });
    }
    if (Math.max(width, height) > limits.maxEdge) {
        issues.push({ code: "output-too-large", field: "customWidth", message: `最长边不能超过 ${limits.maxEdge}px（当前模型上限）。` });
    }
    if (Math.max(width, height) / Math.min(width, height) > limits.maxRatio) {
        issues.push({ code: "output-ratio", field: "customWidth", message: `输出宽高比不能超过 ${limits.maxRatio}:1。` });
    }
    const pixels = width * height;
    if (pixels > limits.maxPixels) {
        issues.push({ code: "output-too-large", field: "customWidth", message: `总像素不能超过 ${limits.maxPixels}（约 2880×2880）。` });
    }
    if (pixels < limits.minPixels) {
        issues.push({ code: "output-too-small", field: "customWidth", message: `总像素不能低于 ${limits.minPixels}（约 1024×640）。` });
    }
    return issues;
}

/** 保持比例前提下，缩/放到最近的合法尺寸（16 步进、边长与像素均满足）。 */
export function nearestLegalSize(width: number, height: number): { width: number; height: number } {
    const limits = SCALE_UP_OUTPUT_LIMITS;
    const safeW = Math.max(1, Number.isFinite(width) ? width : 1);
    const safeH = Math.max(1, Number.isFinite(height) ? height : 1);
    const ratio = safeW / safeH;
    const clampRatio = Math.min(Math.max(ratio, 1 / limits.maxRatio), limits.maxRatio);
    let w = alignToStep(safeW);
    let h = alignToStep(safeH);
    let factor = 1;
    if (Math.max(w, h) > limits.maxEdge) factor = Math.min(factor, limits.maxEdge / Math.max(w, h));
    if (w * h > limits.maxPixels) factor = Math.min(factor, Math.sqrt(limits.maxPixels / (w * h)));
    if (w * h < limits.minPixels) factor = Math.max(factor, Math.sqrt(limits.minPixels / (w * h)));
    w = alignToStep(w * factor);
    h = alignToStep(h * factor);
    // 步进取整后可能重新越界：按边界再收一次。
    if (Math.max(w, h) > limits.maxEdge) {
        if (w >= h) {
            w = limits.maxEdge - (limits.maxEdge % limits.step);
            h = alignToStep(w / clampRatio);
        } else {
            h = limits.maxEdge - (limits.maxEdge % limits.step);
            w = alignToStep(h * clampRatio);
        }
    }
    while (w * h > limits.maxPixels && Math.min(w, h) > limits.step) {
        w -= limits.step;
        h -= limits.step;
    }
    while (w * h < limits.minPixels) {
        w += limits.step;
        h = alignToStep(w / clampRatio);
        if (Math.max(w, h) > limits.maxEdge) break;
    }
    return { width: w, height: h };
}

export type ScaleUpSourceSize = { width?: number; height?: number };

/** 倍率切换 → 即时重算输出尺寸与限制。纯函数，UI 每次渲染直接调用。 */
export function computeOutputSize(values: ScaleUpValues, source?: ScaleUpSourceSize): ScaleUpOutput {
    const mode = scaleUpMode(values.mode);
    const issues: ScaleUpIssue[] = [];
    const sourceWidth = Number(source?.width ?? 0);
    const sourceHeight = Number(source?.height ?? 0);
    const hasSource = sourceWidth > 0 && sourceHeight > 0;

    let requestedWidth: number;
    let requestedHeight: number;
    let magnification: number;

    if (values.mode === "custom") {
        requestedWidth = Number(values.customWidth) || 0;
        requestedHeight = Number(values.customHeight) || 0;
        const base = hasSource ? Math.max(sourceWidth, sourceHeight) : 0;
        magnification = base > 0 ? Number((Math.max(requestedWidth, requestedHeight) / base).toFixed(2)) : 0;
        if (!hasSource) issues.push({ code: "source-size-unknown", field: "source", message: "上传原图后才能校验自定义尺寸。" });
        else {
            const requestedRatio = requestedWidth > 0 && requestedHeight > 0 ? requestedWidth / requestedHeight : 0;
            const sourceRatio = sourceWidth / sourceHeight;
            if (requestedRatio > 0 && Math.abs(requestedRatio / sourceRatio - 1) > SCALE_UP_OUTPUT_LIMITS.ratioTolerance) {
                issues.push({
                    code: "custom-invalid",
                    field: "customWidth",
                    message: `自定义尺寸需保持原图比例 ${sourceWidth}×${sourceHeight}（拖宽会自动联动高度）。`,
                });
            }
        }
    } else {
        magnification = mode.magnification ?? 1;
        requestedWidth = hasSource ? alignToStep(sourceWidth * magnification) : 0;
        requestedHeight = hasSource ? alignToStep(sourceHeight * magnification) : 0;
        if (!hasSource) issues.push({ code: "source-size-unknown", field: "source", message: "上传原图后即可看到本次输出尺寸。" });
    }

    const width = hasSource ? alignToStep(requestedWidth) : 0;
    const height = hasSource ? alignToStep(requestedHeight) : 0;
    const sizeIssues = hasSource && width > 0 && height > 0 ? outputSizeIssues(width, height) : [];
    const allIssues = [...issues, ...sizeIssues];
    const suggestion = allIssues.some((issue) => issue.code === "output-too-large" || issue.code === "output-too-small") ? nearestLegalSize(width, height) : undefined;

    return {
        mode: values.mode,
        magnification,
        requestedWidth,
        requestedHeight,
        width,
        height,
        legal: allIssues.length === 0,
        ...(suggestion && (suggestion.width !== width || suggestion.height !== height) ? { suggestion } : {}),
        issues: allIssues,
    };
}

/** 自定义模式下改一边，另一边按原图比例联动（并做 16 步进）。 */
export function linkedCustomSize(values: ScaleUpValues, source: ScaleUpSourceSize | undefined, edge: "width" | "height", next: number) {
    const sourceWidth = Number(source?.width ?? 0);
    const sourceHeight = Number(source?.height ?? 0);
    const ratio = sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : 1;
    const aligned = alignToStep(next);
    return edge === "width" ? { customWidth: aligned, customHeight: alignToStep(aligned / ratio) } : { customWidth: alignToStep(aligned * ratio), customHeight: aligned };
}

/* ============================== 校验 / 提示词 ============================== */

export function hasScaleUpBlockingIssue(issues: readonly ScaleUpIssue[]): boolean {
    // 尺寸未算出来（未上传）属于未就绪；尺寸非法、缺模型属于硬阻塞。
    return issues.some((issue) => issue.code !== "source-size-unknown");
}

export function validateScaleUpState(input: {
    values: ScaleUpValues;
    output: ScaleUpOutput;
    sourceReady: boolean;
    imageModelReady: boolean;
    faceAvailable?: boolean;
}): ScaleUpIssue[] {
    const issues: ScaleUpIssue[] = [];
    if (!input.sourceReady) issues.push({ code: "source-required", field: "source", message: "请先上传原图。" });
    if (!input.imageModelReady) issues.push({ code: "model-missing", field: "model", message: "未配置可用的图片模型，请先在设置里选择。" });
    issues.push(...input.output.issues.filter((issue) => input.sourceReady || issue.code !== "source-size-unknown"));
    if (input.values.enhanceFace && input.faceAvailable === false) {
        issues.push({ code: "custom-invalid", field: "enhanceFace", message: "该图片未检测到人脸，面部美化不可用。" });
    }
    return issues;
}

/** 预计产物数量：高清放大一次请求一张。 */
export function scaleUpExpectedCount(): number {
    return 1;
}

export function buildScaleUpPrompt(values: ScaleUpValues, output: ScaleUpOutput): string {
    const quality = scaleUpQuality(values.enhanceQuality);
    const size = output.width > 0 ? `${output.width}×${output.height}` : "与原图一致";
    const lines = [
        `对给定图片做高清放大与细节增强：输出尺寸 ${size}（${output.magnification ? `${output.magnification}×` : "自定义"}）。`,
        "严格保持原始构图、主体位置与比例，不新增、不删除、不改写画面内容；只提升清晰度、边缘锐度与纹理细节，抑制噪点与压缩伪影，避免过度锐化、光晕与塑料感。",
        `质量增强档位：${quality.label}（${quality.hint}）。`,
    ];
    if (values.enhanceFace) {
        lines.push("面部美化：仅对人脸区域做细节重建与皮肤纹理修复，保持人物身份特征与表情不变，不改变尺寸与构图。");
    } else {
        lines.push("面部美化：关闭，不做人脸专属处理。");
    }
    return lines.join("\n");
}

/* ============================== 草稿 / 快照 ============================== */

const valuesSchema = z.object({
    mode: z.string().optional(),
    enhanceFace: z.boolean().optional(),
    enhanceQuality: z.string().optional(),
    customWidth: z.number().optional(),
    customHeight: z.number().optional(),
    imageName: z.string().optional(),
    sourceAssetId: z.string().optional(),
});

const positive = (value: unknown) => {
    const parsed = Math.floor(Number(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/** 草稿恢复：非法枚举回落到默认值，不用脏值污染提交。 */
export function readScaleUpValues(raw: unknown): ScaleUpValues {
    const parsed = valuesSchema.safeParse(raw ?? {});
    const data = parsed.success ? parsed.data : {};
    return {
        mode: isScaleUpModeId(data.mode) ? data.mode : DEFAULT_SCALE_UP_VALUES.mode,
        enhanceFace: data.enhanceFace === true,
        enhanceQuality: isScaleUpQualityId(data.enhanceQuality) ? data.enhanceQuality : DEFAULT_SCALE_UP_VALUES.enhanceQuality,
        customWidth: positive(data.customWidth),
        customHeight: positive(data.customHeight),
        imageName: typeof data.imageName === "string" ? data.imageName : "",
        ...(typeof data.sourceAssetId === "string" && data.sourceAssetId ? { sourceAssetId: data.sourceAssetId } : {}),
    };
}

export type ScaleUpSnapshot = {
    toolId: typeof SCALE_UP_TOOL_ID;
    mode: ScaleUpModeId;
    magnification: number;
    width: number;
    height: number;
    enhanceFace: boolean;
    enhanceQuality: ScaleUpQualityId;
    sourceAssetId: string;
    sourceWidth: number;
    sourceHeight: number;
    revision: number | string | null;
    fingerprint: string;
};

export function scaleUpFingerprint(input: Omit<ScaleUpSnapshot, "fingerprint" | "toolId">): string {
    const parts = [
        "SCALE_UP",
        input.mode,
        String(input.magnification),
        `${input.width}x${input.height}`,
        input.enhanceFace ? "face" : "no-face",
        input.enhanceQuality,
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
    return `scaleup-${(hash >>> 0).toString(16)}`;
}

export type ScaleUpSnapshotSource = { assetId: string } & ScaleUpSourceSize;

export function createScaleUpSnapshot(
    values: ScaleUpValues,
    output: ScaleUpOutput,
    source: ScaleUpSnapshotSource,
    revision: number | string | null = null,
): ScaleUpSnapshot {
    const base = {
        mode: values.mode,
        magnification: output.magnification,
        width: output.width,
        height: output.height,
        enhanceFace: values.enhanceFace,
        enhanceQuality: values.enhanceQuality,
        sourceAssetId: source.assetId,
        sourceWidth: Number(source.width ?? 0),
        sourceHeight: Number(source.height ?? 0),
        revision,
    };
    return { toolId: SCALE_UP_TOOL_ID, ...base, fingerprint: scaleUpFingerprint(base) };
}

/** 结果是否来自旧版本（重新上传/改配置后不能冒充当前结果）。 */
export function isScaleUpSnapshotStale(snapshot: ScaleUpSnapshot | undefined, current: ScaleUpSnapshot | undefined): boolean {
    if (!snapshot) return false;
    if (!current) return true;
    return snapshot.fingerprint !== current.fingerprint;
}

export function outputSizeLabel(output: ScaleUpOutput): string {
    if (output.width <= 0 || output.height <= 0) return "待上传原图";
    return `${output.width}×${output.height}`;
}
