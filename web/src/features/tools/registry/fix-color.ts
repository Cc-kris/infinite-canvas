/**
 * TASK-019：FIX_COLOR「色差修复」页面契约 + 纯逻辑（无 React / 无网络）。
 *
 * 事实来源：
 *  - docs/V1.0/plan_linkfox_navigation/page-specs/12-fix-color.md
 *  - docs/V1.0/plan_linkfox_navigation/tool_specs.json#FIX_COLOR（makeType 26, layout repair）
 *  - 原站路由 https://www.linkfox.com/draw/color-diff-repair（evidence 目录中的 FIX_COLOR.json
 *    是旧猜测路由的 404 抓取，只用于纠正记录；字段语义来自 schema/chunk 证据）
 *
 * 字段落点（registry/index.ts#FIX_COLOR）：fixColorSegUrl（区域色）/ fixColorUrl（目标色）/
 * imageUrl（源图）/ imageSegUrl（分区蒙版导出）/ imageName / version；imageResultUrl 只在成功后由
 * 结果资产回填，不参与提交。截图上没有的控件不做（本文件不生成任何占位结果）。
 *
 * 语义说明（证据冲突时的处理，见 report）：
 *  - field_controls 明确 fixColorSegUrl / fixColorUrl 是「ColorPicker + hex 文本 #RRGGBB(/AA)」；
 *    field_schema 里的 "string(URL)" 是通用模板文案，按更具体控件证据落成颜色字符串。
 *  - version 在 chunk 中只有字段名、没有枚举值，因此版本选项是本页自建的产品参数，
 *    每个版本对应明确的校正指令语义（见 FIX_COLOR_VERSIONS），不冒充原站枚举。
 */

import { getToolById } from "./index";
import {
    MASK_BRUSH_DEFAULT,
    MASK_BRUSH_MAX,
    MASK_BRUSH_MIN,
    MASK_COVERAGE_GRID,
    MASK_FEATHER_MAX,
    MASK_FEATHER_MIN,
    appendStrokePoint,
    clampBrushSize,
    clampFeather,
    computeMaskHash,
    computeSnapshotHash,
    coverageRatio,
    createMaskHistory,
    createMaskState,
    createStroke,
    describeCoverage,
    maskCoverage,
    maskHistoryLabel,
    maskIsEmpty,
    normalizePoint,
    pushMaskStroke,
    rasterizeMask,
    redoMaskStroke,
    resetMaskHistory,
    undoMaskStroke,
    type MaskHistory,
    type MaskPoint,
    type MaskState,
    type MaskStroke,
} from "./area-repair";
import type { ToolSpec } from "../types";

export const FIX_COLOR_TOOL_ID = "FIX_COLOR";
export const FIX_COLOR_SLUG = "fix-color";
export const FIX_COLOR_ROUTE = "/tools/smart-edit/fix-color";
export const FIX_COLOR_LAYOUT = "repair" as const;

/** 草稿键（规格 §7）。 */
export const FIX_COLOR_DRAFT_KEY = `tool-draft:v1:${FIX_COLOR_TOOL_ID}`;

export const FIX_COLOR_SOURCE_LIMITS = {
    mimeTypes: ["image/png", "image/jpeg", "image/webp"] as readonly string[],
    maxBytes: 20 * 1024 * 1024,
    maxSide: 8192,
    minSide: 64,
} as const;

export const FIX_COLOR_BRUSH_MIN = MASK_BRUSH_MIN;
export const FIX_COLOR_BRUSH_MAX = MASK_BRUSH_MAX;
export const FIX_COLOR_BRUSH_DEFAULT = MASK_BRUSH_DEFAULT;
export const FIX_COLOR_BRUSH_PRESETS = [15, 35, 60, 100] as const;
export const FIX_COLOR_FEATHER_MIN = MASK_FEATHER_MIN;
export const FIX_COLOR_FEATHER_MAX = MASK_FEATHER_MAX;

/** 区域色 / 目标色的默认值来自常见商品色（白平衡偏差 → 中性白）。 */
export const FIX_COLOR_DEFAULT_REGION_COLOR = "#B79A7C";
export const FIX_COLOR_DEFAULT_TARGET_COLOR = "#A8896A";

export const FIX_COLOR_PALETTE = ["#FFFFFF", "#000000", "#B79A7C", "#A8896A", "#8C8C8C", "#D94F4F", "#3D6BD9", "#3FA35B"] as const;

export const FIX_COLOR_COMPARE_MODES = [
    { id: "slide", label: "推拉对比" },
    { id: "side", label: "并排" },
    { id: "result", label: "只看结果" },
] as const;
export type FixColorCompareMode = (typeof FIX_COLOR_COMPARE_MODES)[number]["id"];

/**
 * 校正版本：切换只重算当前预览并让旧结果标记「来自旧版本」，不删除历史结果（规格 §3）。
 * 每个版本都对应一段真实下发到图像编辑接口的指令语义，不是空标签。
 */
export const FIX_COLOR_VERSIONS = [
    {
        id: "match-region",
        label: "参考匹配",
        hint: "只把涂抹区域的颜色对齐到目标色，保留原明暗与材质",
        instruction: "只把选定区域的颜色对齐到目标参考色，保留原有明暗层次与材质纹理，不动其他区域",
    },
    {
        id: "neutralize",
        label: "色偏中和",
        hint: "按区域平均偏色做整体中和，适合整片偏黄/偏蓝的拍摄色差",
        instruction: "按选定区域的平均偏色做中和校正，消除整体偏黄/偏蓝/偏绿，保持商品本色",
    },
    {
        id: "local-patch",
        label: "局部补色",
        hint: "只修补局部色彩异常（反光、污点引起的异色），边界自然过渡",
        instruction: "只修补选定区域内的局部色彩异常（反光、阴影、污渍导致），边缘与原图自然过渡，不产生拼接痕迹",
    },
] as const;
export type FixColorVersionId = (typeof FIX_COLOR_VERSIONS)[number]["id"];

export function getFixColorVersion(id: string): (typeof FIX_COLOR_VERSIONS)[number] {
    return FIX_COLOR_VERSIONS.find((version) => version.id === id) ?? FIX_COLOR_VERSIONS[0]!;
}

export function getFixColorSpec(): ToolSpec | undefined {
    return getToolById(FIX_COLOR_TOOL_ID);
}

/* ------------------------------------------------------------------ *
 * 颜色
 * ------------------------------------------------------------------ */

export type NormalizedColor = { hex: string; alpha: number; rgb: [number, number, number] };

/**
 * 规范化颜色输入：接受 `#RGB`、`#RRGGBB`、`#RRGGBBAA`（大小写、缺 # 均可）。
 * 无法解析时返回 null —— 调用方必须把 null 显示成字段错误，不能默默用默认值提交。
 */
export function normalizeColorHex(value: unknown): NormalizedColor | null {
    if (typeof value !== "string") return null;
    const raw = value.trim().replace(/^#/, "");
    if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(raw)) return null;
    const expand = (text: string) => text.split("").map((char) => `${char}${char}`).join("");
    const full = raw.length <= 4 ? expand(raw) : raw;
    const r = Number.parseInt(full.slice(0, 2), 16);
    const g = Number.parseInt(full.slice(2, 4), 16);
    const b = Number.parseInt(full.slice(4, 6), 16);
    const alpha = full.length === 8 ? Number.parseInt(full.slice(6, 8), 16) / 255 : 1;
    const hex = `#${full.slice(0, 6).toUpperCase()}`;
    return { hex, alpha: Math.round(alpha * 100) / 100, rgb: [r, g, b] };
}

export function isValidColorHex(value: unknown): boolean {
    return normalizeColorHex(value) !== null;
}

/** 输入框里的弱规范化：解析不了就原样返回，交给校验显示错误。 */
export function formatColorInput(value: string): string {
    const parsed = normalizeColorHex(value);
    return parsed ? parsed.hex : value;
}

function srgbToLinear(channel: number): number {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** CIE76 色差（ΔE*ab）：真实可比的“色差强度”，用于面板提示，不参与 provider 请求。 */
export function colorDeltaE(a: string, b: string): number | null {
    const left = normalizeColorHex(a);
    const right = normalizeColorHex(b);
    if (!left || !right) return null;
    const toLab = ([r, g, bl]: [number, number, number]) => {
        const [R, G, B] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(bl)];
        const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
        const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
        const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
        const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
        const fx = f(x);
        const fy = f(y);
        const fz = f(z);
        return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)] as const;
    };
    const [l1, a1, b1] = toLab(left.rgb);
    const [l2, a2, b2] = toLab(right.rgb);
    return Math.round(Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2) * 10) / 10;
}

export function describeColorDelta(delta: number | null): string {
    if (delta === null) return "颜色待填写";
    if (delta < 1) return `ΔE ${delta} · 肉眼几乎无差别`;
    if (delta < 3) return `ΔE ${delta} · 轻微差异`;
    if (delta < 8) return `ΔE ${delta} · 明显差异`;
    return `ΔE ${delta} · 强色差，需要校正`;
}

/* ------------------------------------------------------------------ *
 * 区域（蒙版）状态
 * ------------------------------------------------------------------ */

/** 本页画笔支持画笔/橡皮，羽化与反选沿用共享蒙版实现。 */
export type FixColorState = MaskState;

export type FixColorDraftValues = {
    state: FixColorState;
    imageName: string;
    version: FixColorVersionId;
    /** fixColorSegUrl：被判定为偏色的区域颜色。 */
    regionColor: string;
    /** fixColorUrl：校正目标颜色。 */
    targetColor: string;
    compareMode: FixColorCompareMode;
};

export type FixColorIssue = {
    field: "image" | "mask" | "color" | "version" | "source" | "dimensions";
    message: string;
};

export function createFixColorState(overrides: Partial<FixColorState> = {}): FixColorState {
    return createMaskState({ autoExpand: false, ...overrides });
}

export function createFixColorHistory(strokes: MaskStroke[] = []): MaskHistory {
    return createMaskHistory(strokes);
}

export function beginFixColorStroke(state: FixColorState, point: MaskPoint, id: string): MaskStroke {
    return createStroke(state.tool, state.brushSize, normalizePoint(point), id);
}

export function extendFixColorStroke(stroke: MaskStroke, point: MaskPoint): MaskStroke {
    return appendStrokePoint(stroke, normalizePoint(point));
}

export function commitFixColorStroke(history: MaskHistory, stroke: MaskStroke): MaskHistory {
    return pushMaskStroke(history, stroke);
}

export const undoFixColorStroke = undoMaskStroke;
export const redoFixColorStroke = redoMaskStroke;
export const resetFixColorStrokes = resetMaskHistory;
export const fixColorHistoryState = maskHistoryLabel;

export function clampFixColorBrush(value: unknown): number {
    return clampBrushSize(Math.round(Number(value)));
}

export function clampFixColorFeather(value: unknown): number {
    return clampFeather(value);
}

export function fixColorCoverage(state: FixColorState): number {
    return maskCoverage(state);
}

export function fixColorMaskIsEmpty(state: FixColorState): boolean {
    return maskIsEmpty(state);
}

export function describeFixColorCoverage(state: FixColorState): string {
    return describeCoverage(fixColorCoverage(state));
}

export function rasterizeFixColorMask(state: FixColorState, width: number, height: number): Uint8Array {
    return rasterizeMask(state.strokes, {
        width,
        height,
        inverted: state.inverted,
        autoExpandPx: state.autoExpand ? 12 : 0,
    });
}

export function fixColorMaskRatio(state: FixColorState): number {
    return coverageRatio(rasterizeFixColorMask(state, MASK_COVERAGE_GRID, MASK_COVERAGE_GRID));
}

/* ------------------------------------------------------------------ *
 * 校验（规格 §3/§7）
 * ------------------------------------------------------------------ */

export type FixColorInput = {
    imageUrl: string;
    maskUrl: string;
    regionColor: string;
    targetColor: string;
    version: string;
    imageWidth?: number;
    imageHeight?: number;
    maskWidth?: number;
    maskHeight?: number;
};

export function validateFixColorInput(input: FixColorInput): FixColorIssue[] {
    const issues: FixColorIssue[] = [];
    if (!input.imageUrl.trim()) issues.push({ field: "image", message: "请先上传需要校正的色差图" });
    if (!input.maskUrl.trim()) issues.push({ field: "mask", message: "请先涂抹需要校正的色彩区域（空区域无法定位色差）" });
    const region = normalizeColorHex(input.regionColor);
    const target = normalizeColorHex(input.targetColor);
    if (!region) issues.push({ field: "color", message: "区域颜色必须是 #RRGGBB 或 #RRGGBBAA" });
    if (!target) issues.push({ field: "color", message: "目标颜色必须是 #RRGGBB 或 #RRGGBBAA" });
    if (region && target && region.hex === target.hex) {
        issues.push({ field: "color", message: "目标颜色与区域颜色相同，处理后不会有任何变化" });
    }
    if (!FIX_COLOR_VERSIONS.some((version) => version.id === input.version)) {
        issues.push({ field: "version", message: `未知校正版本：${input.version || "(空)"}` });
    }
    const hasImageSize = Boolean(input.imageWidth && input.imageHeight);
    const hasMaskSize = Boolean(input.maskWidth && input.maskHeight);
    if (hasImageSize && hasMaskSize && (input.imageWidth !== input.maskWidth || input.imageHeight !== input.maskHeight)) {
        issues.push({
            field: "dimensions",
            message: `区域蒙版必须与原图同尺寸（原图 ${input.imageWidth}×${input.imageHeight}，蒙版 ${input.maskWidth}×${input.maskHeight}）`,
        });
    }
    return issues;
}

export type FixColorSourceInfo = { name?: string; mimeType?: string; bytes?: number; width?: number; height?: number };

export function validateFixColorSource(source: FixColorSourceInfo): FixColorIssue[] {
    const issues: FixColorIssue[] = [];
    const limits = FIX_COLOR_SOURCE_LIMITS;
    if (source.mimeType && !limits.mimeTypes.includes(source.mimeType)) {
        issues.push({ field: "source", message: `只支持 ${limits.mimeTypes.join(" / ")}，当前是 ${source.mimeType}` });
    }
    if (typeof source.bytes === "number" && source.bytes > limits.maxBytes) {
        issues.push({ field: "source", message: `图片不能超过 ${Math.round(limits.maxBytes / 1024 / 1024)}MB，当前 ${(source.bytes / 1024 / 1024).toFixed(1)}MB` });
    }
    if (source.width && source.height) {
        const longSide = Math.max(source.width, source.height);
        if (longSide > limits.maxSide) issues.push({ field: "source", message: `长边不能超过 ${limits.maxSide}px，当前 ${longSide}px` });
        if (Math.min(source.width, source.height) < limits.minSide) {
            issues.push({ field: "source", message: `短边不能小于 ${limits.minSide}px，当前 ${Math.min(source.width, source.height)}px` });
        }
    }
    return issues;
}

/* ------------------------------------------------------------------ *
 * 快照（提交后锁定本次配置，输入一变即标记旧版本）
 * ------------------------------------------------------------------ */

export type FixColorSnapshot = {
    toolId: typeof FIX_COLOR_TOOL_ID;
    imageAssetId: string;
    imageName: string;
    imageWidth: number;
    imageHeight: number;
    maskHash: string;
    maskCoverage: number;
    strokeCount: number;
    feather: number;
    inverted: boolean;
    regionColor: string;
    targetColor: string;
    version: FixColorVersionId;
    draftRevision?: number | string | null;
    clientOperationId: string;
};

export type FixColorSnapshotInput = {
    imageAssetId?: string;
    imageName?: string;
    imageWidth?: number;
    imageHeight?: number;
    state: FixColorState;
    regionColor: string;
    targetColor: string;
    version: FixColorVersionId;
    /** 导出后的蒙版 dataUrl：只取内容摘要，避免超长串污染任务指纹。 */
    maskDataUrl?: string;
    draftRevision?: number | string | null;
    clientOperationId: string;
};

export function buildFixColorSnapshot(input: FixColorSnapshotInput): FixColorSnapshot {
    const state = input.state;
    return {
        toolId: FIX_COLOR_TOOL_ID,
        imageAssetId: input.imageAssetId ?? "",
        imageName: input.imageName ?? "",
        imageWidth: input.imageWidth ?? 0,
        imageHeight: input.imageHeight ?? 0,
        maskHash: computeMaskHash(state, input.maskDataUrl),
        maskCoverage: Math.round(maskCoverage(state) * 10000) / 10000,
        strokeCount: state.strokes.length,
        feather: clampFeather(state.feather),
        inverted: state.inverted === true,
        regionColor: normalizeColorHex(input.regionColor)?.hex ?? input.regionColor,
        targetColor: normalizeColorHex(input.targetColor)?.hex ?? input.targetColor,
        version: getFixColorVersion(input.version).id,
        draftRevision: input.draftRevision ?? null,
        clientOperationId: input.clientOperationId,
    };
}

export function fixColorSnapshotHash(snapshot: FixColorSnapshot): string {
    return computeSnapshotHash(snapshot);
}

/** 当前配置与提交快照不一致 → 结果只代表旧版本（规格 §3）。 */
export function isFixColorSnapshotStale(snapshot: FixColorSnapshot | null, current: FixColorSnapshot | null): boolean {
    if (!snapshot || !current) return false;
    return fixColorSnapshotHash(snapshot) !== fixColorSnapshotHash(current);
}

/** 提交时要带的 ToolSpec 字段（imageResultUrl 是结果字段，成功后回填，不在此列）。 */
export function composeFixColorFields(
    snapshot: FixColorSnapshot,
    urls: { imageUrl: string; imageSegUrl: string },
): Record<string, unknown> {
    return {
        fixColorSegUrl: snapshot.regionColor,
        fixColorUrl: snapshot.targetColor,
        imageName: snapshot.imageName,
        imageSegUrl: urls.imageSegUrl,
        imageUrl: urls.imageUrl,
        version: snapshot.version,
    };
}

/* ------------------------------------------------------------------ *
 * 草稿
 * ------------------------------------------------------------------ */

export function parseFixColorDraftValues(values: Record<string, unknown> = {}): FixColorDraftValues {
    const strokes = Array.isArray(values.strokes) ? (values.strokes as MaskStroke[]) : [];
    const state = createFixColorState({
        strokes: strokes.filter((stroke) => stroke && Array.isArray(stroke.points) && stroke.points.length > 0),
        tool: values.tool === "eraser" ? "eraser" : "brush",
        brushSize: clampFixColorBrush(values.brushSize),
        feather: clampFixColorFeather(values.feather),
        inverted: values.inverted === true,
    });
    return {
        state,
        imageName: typeof values.imageName === "string" ? values.imageName : "",
        version: getFixColorVersion(typeof values.version === "string" ? values.version : "").id,
        regionColor: normalizeColorHex(values.regionColor)?.hex ?? FIX_COLOR_DEFAULT_REGION_COLOR,
        targetColor: normalizeColorHex(values.targetColor)?.hex ?? FIX_COLOR_DEFAULT_TARGET_COLOR,
        compareMode: (FIX_COLOR_COMPARE_MODES.find((mode) => mode.id === values.compareMode)?.id ?? "slide") as FixColorCompareMode,
    };
}

export function serializeFixColorDraftValues(draft: FixColorDraftValues): Record<string, unknown> {
    return {
        strokes: draft.state.strokes,
        tool: draft.state.tool,
        brushSize: draft.state.brushSize,
        feather: draft.state.feather,
        inverted: draft.state.inverted,
        imageName: draft.imageName,
        version: draft.version,
        regionColor: draft.regionColor,
        targetColor: draft.targetColor,
        compareMode: draft.compareMode,
    };
}
