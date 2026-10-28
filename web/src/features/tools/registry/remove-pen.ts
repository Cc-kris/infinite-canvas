/**
 * TASK-015：REMOVE_PEN「局部消除」页面契约 + 纯逻辑（无 React / 无网络）。
 *
 * 事实来源：
 *  - docs/V1.0/plan_linkfox_navigation/page-specs/08-remove-pen.md
 *  - docs/V1.0/plan_linkfox_navigation/tool_specs.json#REMOVE_PEN（makeType 23, layout mask）
 *  - 原站 https://www.linkfox.com/draw/remove-pen 的 workspace DOM 证据
 *
 * 本页与 AREA_REPAIR（局部重绘）的区别（同一 mask 布局，不同契约）：
 *  - 只有涂抹消除所需控件：画笔大小、重置、撤销、重做、重新上传、开始消除；
 *    没有重绘描述、没有张数/羽化/反选/自动扩边（那些是 AREA_REPAIR 的字段，本页不显示也不提交）。
 *  - 蒙版语义固定：白色 = 要消除的区域，黑色 = 必须原样保留。
 *  - 结果区固定单张，支持下载 / 高清放大接力 / 商品图接力 / 手部修复接力。
 *
 * 真实边界：蒙版由画布真实笔画栅格化导出（同尺寸 PNG），与源图一起作为两张参考图提交给真实
 * 图像编辑接口；本文件不产生任何“演示结果”。字段契约 eraseImageUrl / imageName / imageUrl /
 * maskImageUrl 全部有落点，缺一个就拒发（见 adapters/remove-pen.ts#assertRemovePenInput）。
 */

import { getToolById } from "./index";
import {
    MASK_BRUSH_DEFAULT,
    MASK_BRUSH_MAX,
    MASK_BRUSH_MIN,
    MASK_COVERAGE_GRID,
    appendStrokePoint,
    clampBrushSize,
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
    type MaskStroke,
} from "./area-repair";
import type { ToolSpec } from "../types";

export const REMOVE_PEN_TOOL_ID = "REMOVE_PEN";
export const REMOVE_PEN_SLUG = "remove-pen";
export const REMOVE_PEN_ROUTE = "/tools/smart-edit/remove-pen";
export const REMOVE_PEN_LAYOUT = "mask" as const;
/** 草稿键与共享约定一致：`tool-draft:v1:<toolId>`（规格 §7）。 */
export const REMOVE_PEN_DRAFT_KEY = `tool-draft:v1:${REMOVE_PEN_TOOL_ID}`;

/** 画笔：原站实测默认 35 像素；范围沿用共享蒙版的 1–200。 */
export const REMOVE_PEN_BRUSH_MIN = MASK_BRUSH_MIN;
export const REMOVE_PEN_BRUSH_MAX = MASK_BRUSH_MAX;
export const REMOVE_PEN_BRUSH_DEFAULT = MASK_BRUSH_DEFAULT;
/** 画笔预设（原站工具栏只有大小滑杆，预设是最小点击区的快捷档位）。 */
export const REMOVE_PEN_BRUSH_PRESETS = [15, 35, 60, 100] as const;

/** 源图限制：与共享资产输入同源，超出即在控件旁说明，不只弹通用错误。 */
export const REMOVE_PEN_SOURCE_LIMITS = {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
    minSide: 32,
    maxSide: 8192,
    maxBytes: 20 * 1024 * 1024,
};

/** 结果接力目标：规格 §2「结果可下载、高清放大或继续商品图/手部修复」。 */
export const REMOVE_PEN_HANDOFFS = [
    { id: "scale-up", label: "高清放大", route: "/tools/ecommerce-suite/scale-up", field: "imageUrl" },
    { id: "product-image", label: "商品图", route: "/tools/product-design/new-replace-bg-v2", field: "imageUrl" },
    { id: "hand-repair", label: "手部修复", route: "/tools/smart-edit/hand-repair", field: "imageUrl" },
] as const;

export type RemovePenHandoffId = (typeof REMOVE_PEN_HANDOFFS)[number]["id"];

/**
 * 提交给真实图像编辑接口的指令。
 *
 * 局部消除没有用户提示词（规格 §2「无需提示词」），但底层 provider 的 edit 接口必须带指令，
 * 因此指令是固定的、只描述“删掉蒙版区域并保持其余不变”，不含任何用户可编辑内容。
 */
export const REMOVE_PEN_INSTRUCTION = [
    "局部消除：参考图 1 是原图，参考图 2 是蒙版（白色 = 需要删除的物体/区域，黑色 = 必须保持不变）。",
    "删除蒙版白色区域内的全部内容，并按周围背景自然补全：保持光照、透视、纹理、阴影和边缘一致。",
    "蒙版以外的像素不得改变：主体、文字、Logo、颜色、构图都保持原样。",
    "不要新增物体，不要改变画幅，不要添加水印。",
].join("\n");

export const REMOVE_PEN_COMPARE_MODES = [
    { id: "side-by-side", label: "并排对比" },
    { id: "slider", label: "滑动对比" },
    { id: "result", label: "只看结果" },
] as const;

export type RemovePenCompareMode = (typeof REMOVE_PEN_COMPARE_MODES)[number]["id"];

/* ------------------------------------------------------------------ *
 * 状态
 * ------------------------------------------------------------------ */

/** 本页只有画笔（规格 §2 没有橡皮）；撤销/重做只影响笔画。 */
export type RemovePenState = {
    strokes: MaskStroke[];
    brushSize: number;
};

export type RemovePenDraftValues = {
    state: RemovePenState;
    imageName: string;
    compareMode: RemovePenCompareMode;
};

export type RemovePenIssue = {
    field: "image" | "mask" | "dimensions" | "source";
    message: string;
};

const BRUSH_ONLY_TOOL = "brush" as const;

export function getRemovePenSpec(): ToolSpec | undefined {
    return getToolById(REMOVE_PEN_TOOL_ID);
}

export function clampRemovePenBrush(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return REMOVE_PEN_BRUSH_DEFAULT;
    return clampBrushSize(Math.round(num));
}

export function createRemovePenState(overrides: Partial<RemovePenState> = {}): RemovePenState {
    return {
        strokes: overrides.strokes ?? [],
        brushSize: clampRemovePenBrush(overrides.brushSize ?? REMOVE_PEN_BRUSH_DEFAULT),
    };
}

/** 蒙版历史复用共享实现，保证撤销/重做语义与 AREA_REPAIR 一致。 */
export function createRemovePenHistory(strokes: MaskStroke[] = []): MaskHistory {
    return createMaskHistory(strokes);
}

/** 起笔：笔刷大小锁定在笔画创建瞬间，之后改大小不影响已画笔画。 */
export function beginRemovePenStroke(state: RemovePenState, point: MaskPoint, id: string): MaskStroke {
    return createStroke(BRUSH_ONLY_TOOL, state.brushSize, normalizePoint(point), id);
}

export function extendRemovePenStroke(stroke: MaskStroke, point: MaskPoint): MaskStroke {
    return appendStrokePoint(stroke, normalizePoint(point));
}

export function commitRemovePenStroke(history: MaskHistory, stroke: MaskStroke): MaskHistory {
    return pushMaskStroke(history, stroke);
}

export const undoRemovePenStroke = undoMaskStroke;
export const redoRemovePenStroke = redoMaskStroke;
export const resetRemovePenStrokes = resetMaskHistory;
export const removePenHistoryState = maskHistoryLabel;

/** 蒙版覆盖率（0–1）：判定“是否真的涂抹过”，也用于工具栏进度文案。 */
export function removePenCoverage(state: RemovePenState): number {
    return maskCoverage({ strokes: state.strokes, inverted: false, autoExpand: false });
}

export function removePenMaskIsEmpty(state: RemovePenState): boolean {
    return maskIsEmpty({ strokes: state.strokes, inverted: false, autoExpand: false });
}

export function describeRemovePenCoverage(state: RemovePenState): string {
    return describeCoverage(removePenCoverage(state));
}

/** 蒙版栅格：白底黑区（白色 = 消除区域），供预览与快照统计共用。 */
export function rasterizeRemovePenMask(state: RemovePenState, width: number, height: number): Uint8Array {
    return rasterizeMask(state.strokes, { width, height, inverted: false, autoExpandPx: 0 });
}

export function removePenMaskRatio(state: RemovePenState): number {
    return coverageRatio(rasterizeRemovePenMask(state, MASK_COVERAGE_GRID, MASK_COVERAGE_GRID));
}

/* ------------------------------------------------------------------ *
 * 校验
 * ------------------------------------------------------------------ */

export type RemovePenInput = {
    imageUrl: string;
    maskUrl: string;
    imageWidth?: number;
    imageHeight?: number;
    maskWidth?: number;
    maskHeight?: number;
};

/** 提交前校验（规格 §7）：源图、蒙版、蒙版与原图同尺寸，全部在控件旁说明。 */
export function validateRemovePenInput(input: RemovePenInput): RemovePenIssue[] {
    const issues: RemovePenIssue[] = [];
    if (!input.imageUrl.trim()) issues.push({ field: "image", message: "请先上传需要消除的图片" });
    if (!input.maskUrl.trim()) issues.push({ field: "mask", message: "请先在图片上涂抹要消除的区域" });
    const hasImageSize = Boolean(input.imageWidth && input.imageHeight);
    const hasMaskSize = Boolean(input.maskWidth && input.maskHeight);
    if (hasImageSize && hasMaskSize && (input.imageWidth !== input.maskWidth || input.imageHeight !== input.maskHeight)) {
        issues.push({
            field: "dimensions",
            message: `蒙版必须与原图同尺寸（原图 ${input.imageWidth}×${input.imageHeight}，蒙版 ${input.maskWidth}×${input.maskHeight}）`,
        });
    }
    return issues;
}

export type RemovePenSourceInfo = { name?: string; mimeType?: string; bytes?: number; width?: number; height?: number };

export function validateRemovePenSource(source: RemovePenSourceInfo): RemovePenIssue[] {
    const issues: RemovePenIssue[] = [];
    const limits = REMOVE_PEN_SOURCE_LIMITS;
    if (source.mimeType && !(limits.mimeTypes as readonly string[]).includes(source.mimeType)) {
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
 * 快照
 * ------------------------------------------------------------------ */

export type RemovePenSnapshot = {
    toolId: typeof REMOVE_PEN_TOOL_ID;
    imageAssetId: string;
    imageName: string;
    imageWidth: number;
    imageHeight: number;
    maskHash: string;
    maskCoverage: number;
    strokeCount: number;
    brushSize: number;
    maskWidth: number;
    maskHeight: number;
    /** 任务元数据（技术设计 §TECH-T08）：草稿版本 + 客户端幂等键。 */
    draftRevision: number | string | null;
    clientOperationId: string;
    model?: string;
};

export type RemovePenSnapshotInput = {
    imageAssetId?: string;
    imageName?: string;
    imageWidth?: number;
    imageHeight?: number;
    state: RemovePenState;
    /**
     * 已导出的蒙版尺寸。必须等于原图尺寸（规格 §7）；未导出时按原图尺寸占位，
     * 由 validateRemovePenInput 在提交时拦截。
     */
    maskWidth?: number;
    maskHeight?: number;
    /** 导出后的蒙版 dataUrl：只取内容摘要，不把字节写进快照。 */
    maskDataUrl?: string;
    draftRevision?: number | string | null;
    clientOperationId: string;
    model?: string;
};

export function buildRemovePenSnapshot(input: RemovePenSnapshotInput): RemovePenSnapshot {
    const imageWidth = Math.max(0, Math.round(input.imageWidth ?? 0));
    const imageHeight = Math.max(0, Math.round(input.imageHeight ?? 0));
    return {
        toolId: REMOVE_PEN_TOOL_ID,
        imageAssetId: input.imageAssetId ?? "",
        imageName: input.imageName ?? "",
        imageWidth,
        imageHeight,
        maskHash: computeMaskHash({ strokes: input.state.strokes, feather: 0, autoExpand: false, inverted: false }, input.maskDataUrl),
        maskCoverage: removePenCoverage(input.state),
        strokeCount: input.state.strokes.length,
        brushSize: clampRemovePenBrush(input.state.brushSize),
        maskWidth: Math.max(0, Math.round(input.maskWidth ?? imageWidth)),
        maskHeight: Math.max(0, Math.round(input.maskHeight ?? imageHeight)),
        draftRevision: input.draftRevision ?? null,
        clientOperationId: input.clientOperationId,
        ...(input.model ? { model: input.model } : {}),
    };
}

/** 快照指纹：不含 clientOperationId，重试同一输入时仍判定为同一版本。 */
export function removePenSnapshotHash(snapshot: RemovePenSnapshot): string {
    return computeSnapshotHash({
        toolId: snapshot.toolId,
        imageAssetId: snapshot.imageAssetId,
        imageName: snapshot.imageName,
        imageWidth: snapshot.imageWidth,
        imageHeight: snapshot.imageHeight,
        maskHash: snapshot.maskHash,
        maskCoverage: snapshot.maskCoverage,
        strokeCount: snapshot.strokeCount,
        brushSize: snapshot.brushSize,
        maskWidth: snapshot.maskWidth,
        maskHeight: snapshot.maskHeight,
        draftRevision: snapshot.draftRevision,
        model: snapshot.model ?? null,
    });
}

/** 当前输入与提交快照不同 → 结果标为“来自旧版本”，不冒充当前配置结果（规格 §3）。 */
export function isRemovePenSnapshotStale(snapshot: RemovePenSnapshot | null, current: RemovePenSnapshot | null): boolean {
    if (!snapshot || !current) return false;
    return removePenSnapshotHash(snapshot) !== removePenSnapshotHash(current);
}

/* ------------------------------------------------------------------ *
 * 草稿
 * ------------------------------------------------------------------ */

function parseRemovePenStrokes(raw: unknown): MaskStroke[] {
    if (!Array.isArray(raw)) return [];
    const strokes: MaskStroke[] = [];
    raw.forEach((item, index) => {
        if (!item || typeof item !== "object") return;
        const record = item as Record<string, unknown>;
        const points = Array.isArray(record.points) ? record.points : [];
        const parsed = points
            .filter((point): point is Record<string, unknown> => Boolean(point) && typeof point === "object")
            .map((point) => normalizePoint({ x: Number(point.x), y: Number(point.y) }))
            .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
        if (parsed.length === 0) return;
        strokes.push({
            id: typeof record.id === "string" && record.id ? record.id : `stroke-${index}`,
            // 本页只有画笔：任何异常的 eraser 笔画都按画笔读取，避免“看不见的擦除”丢失蒙版。
            tool: BRUSH_ONLY_TOOL,
            size: clampRemovePenBrush(record.size),
            points: parsed,
        });
    });
    return strokes;
}

export function parseRemovePenDraftValues(values: Record<string, unknown> = {}): RemovePenDraftValues {
    const compare = REMOVE_PEN_COMPARE_MODES.some((mode) => mode.id === values.compareMode) ? (values.compareMode as RemovePenCompareMode) : "side-by-side";
    return {
        state: createRemovePenState({
            strokes: parseRemovePenStrokes(values.strokes),
            brushSize: clampRemovePenBrush(values.brushSize),
        }),
        imageName: typeof values.imageName === "string" ? values.imageName : "",
        compareMode: compare,
    };
}

export function serializeRemovePenDraftValues(draft: RemovePenDraftValues): Record<string, unknown> {
    return {
        strokes: draft.state.strokes,
        brushSize: clampRemovePenBrush(draft.state.brushSize),
        imageName: draft.imageName,
        compareMode: draft.compareMode,
    };
}

/* ------------------------------------------------------------------ *
 * 字段与接力
 * ------------------------------------------------------------------ */

/**
 * ToolSpec 四个字段的落点（缺一即拒发）：
 *  - eraseImageUrl：待消除图（第 1 张参考图）
 *  - imageUrl：原图（用于前后对比与结果对照，同一资产）
 *  - maskImageUrl：画布导出的蒙版 PNG（第 2 张参考图）
 *  - imageName：上传后的展示名（可编辑）
 */
export function composeRemovePenFields(snapshot: RemovePenSnapshot, urls: { eraseImageUrl: string; imageUrl: string; maskImageUrl: string }): Record<string, unknown> {
    return {
        eraseImageUrl: urls.eraseImageUrl,
        imageUrl: urls.imageUrl,
        maskImageUrl: urls.maskImageUrl,
        imageName: snapshot.imageName,
        maskHash: snapshot.maskHash,
        maskCoverage: snapshot.maskCoverage,
        strokeCount: snapshot.strokeCount,
        brushSize: snapshot.brushSize,
        draftRevision: snapshot.draftRevision,
        clientOperationId: snapshot.clientOperationId,
    };
}

export function removePenHandoff(id: RemovePenHandoffId) {
    return REMOVE_PEN_HANDOFFS.find((handoff) => handoff.id === id);
}

/** 结果接力：把当前结果作为目标工具的输入（规格 §3「高清放大把当前结果作为新工具输入」）。 */
export function buildRemovePenHandoff(id: RemovePenHandoffId, resultUrl: string): { route: string; field: string; value: string } {
    const handoff = removePenHandoff(id);
    if (!handoff) throw new Error(`未知的接力目标：${id}`);
    if (!resultUrl) throw new Error("当前没有可接力的结果图片");
    return { route: handoff.route, field: handoff.field, value: resultUrl };
}

/** 结果文件名：下载时带上原图名，避免一串 hash。 */
export function removePenDownloadName(imageName: string, index = 1): string {
    const base = (imageName || "remove-pen").replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60);
    const suffix = index > 1 ? `-${index}` : "";
    return `${base || "remove-pen"}-erased${suffix}.png`;
}
