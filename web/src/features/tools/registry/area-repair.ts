/**
 * AREA_REPAIR「局部重绘」页面契约 + 纯逻辑（无 React / 无网络）。
 *
 * 证据：docs/V1.0/plan_linkfox_navigation/page-specs/07-area-repair.md
 *  - 区域：蒙版画布工具栏｜图片上传｜重绘描述｜数量｜结果
 *  - 控件：画笔大小（像素）、自动扩大选择区域、反选、撤销、重做、重置；重绘描述 0/600；输出 1–4
 *  - 状态联动：涂抹生成 maskUrl；反选只反转蒙版；自动扩边改变最终 mask 范围；
 *    撤销/重做只影响笔画；图片替换清空蒙版；描述为空或蒙版为空禁用提交
 *  - 字段契约：autoExpand, imageName, imageUrl, maskUrl, outputNum, prompt
 *
 * 原站实测：画笔默认 35 像素；反选/撤销/重做/重置 在无蒙版时全部 disabled。
 * 本文件只描述本工具自身的输入/快照/校验语义，不复制 LinkFox 前端代码或算力区。
 */

import { getToolById } from "./index";
import type { ToolSpec } from "../types";

export const AREA_REPAIR_TOOL_ID = "AREA_REPAIR";
export const AREA_REPAIR_SLUG = "area-repair";
export const AREA_REPAIR_ROUTE = "/tools/smart-edit/area-repair";
export const AREA_REPAIR_LAYOUT = "mask" as const;
/** 草稿键与共享约定一致：`tool-draft:v1:<toolId>`。 */
export const AREA_REPAIR_DRAFT_KEY = `tool-draft:v1:${AREA_REPAIR_TOOL_ID}`;

/** 画笔：1–200 像素，默认 35（原站输入框实测值）。 */
export const MASK_BRUSH_MIN = 1;
export const MASK_BRUSH_MAX = 200;
export const MASK_BRUSH_DEFAULT = 35;
/** 羽化：0–60 像素，默认 0（不改变原站硬边蒙版行为）。 */
export const MASK_FEATHER_MIN = 0;
export const MASK_FEATHER_MAX = 60;
export const MASK_FEATHER_DEFAULT = 0;
/** 自动扩大选择区域：布尔开关，显式默认 false，绝不 undefined。 */
export const MASK_AUTO_EXPAND_DEFAULT = false;
/** 自动扩边的像素半径（开关打开时用于蒙版导出与覆盖统计）。 */
export const MASK_AUTO_EXPAND_PX = 4;

export const AREA_REPAIR_PROMPT_MAX = 600;
export const AREA_REPAIR_OUTPUT_OPTIONS = [1, 2, 3, 4] as const;
export const AREA_REPAIR_DEFAULT_OUTPUT = 1;
/** 覆盖率采样网格（只看比例，不用它导出蒙版字节）。 */
export const MASK_COVERAGE_GRID = 128;

export type MaskTool = "brush" | "eraser";

/** 归一化坐标（0–1），与图片实际像素解耦，缩放窗口不丢笔画。 */
export type MaskPoint = { x: number; y: number };

export type MaskStroke = {
    id: string;
    tool: MaskTool;
    /** 笔画创建瞬间的笔刷大小（源图像素），后续改笔刷不影响已画笔画。 */
    size: number;
    points: MaskPoint[];
};

export type MaskState = {
    strokes: MaskStroke[];
    tool: MaskTool;
    brushSize: number;
    feather: number;
    inverted: boolean;
    autoExpand: boolean;
};

/** 撤销/重做只影响笔画（规格 §3），其余控件状态独立保存。 */
export type MaskHistory = {
    past: MaskStroke[][];
    present: MaskStroke[];
    future: MaskStroke[][];
};

export type MaskDraftValues = {
    state: MaskState;
    prompt: string;
    outputNum: number;
};

export type AreaRepairIssue = {
    field: "image" | "mask" | "prompt" | "outputNum" | "dimensions";
    message: string;
};

export function getAreaRepairSpec(): ToolSpec {
    const spec = getToolById(AREA_REPAIR_TOOL_ID);
    if (!spec) throw new Error("AREA_REPAIR spec missing from tool registry");
    return spec;
}

/* ------------------------------------------------------------------ *
 * 笔刷与历史
 * ------------------------------------------------------------------ */

export function clampBrushSize(value: unknown): number {
    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed)) return MASK_BRUSH_DEFAULT;
    return Math.min(MASK_BRUSH_MAX, Math.max(MASK_BRUSH_MIN, parsed));
}

export function clampFeather(value: unknown): number {
    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed)) return MASK_FEATHER_DEFAULT;
    return Math.min(MASK_FEATHER_MAX, Math.max(MASK_FEATHER_MIN, parsed));
}

export function normalizeOutputNum(value: unknown): number {
    const parsed = Math.round(Number(value));
    return (AREA_REPAIR_OUTPUT_OPTIONS as readonly number[]).includes(parsed) ? parsed : AREA_REPAIR_DEFAULT_OUTPUT;
}

export function normalizePoint(point: MaskPoint): MaskPoint {
    const clamp = (value: number) => Math.min(1, Math.max(0, Math.round(value * 10000) / 10000));
    return { x: clamp(Number(point.x) || 0), y: clamp(Number(point.y) || 0) };
}

export function createMaskState(overrides: Partial<MaskState> = {}): MaskState {
    return {
        strokes: [],
        tool: "brush",
        brushSize: MASK_BRUSH_DEFAULT,
        feather: MASK_FEATHER_DEFAULT,
        inverted: false,
        autoExpand: MASK_AUTO_EXPAND_DEFAULT,
        ...overrides,
    };
}

export function createMaskHistory(strokes: MaskStroke[] = []): MaskHistory {
    return { past: [], present: [...strokes], future: [] };
}

export function createStroke(tool: MaskTool, size: number, point: MaskPoint, id: string): MaskStroke {
    return { id, tool, size: clampBrushSize(size), points: [normalizePoint(point)] };
}

/** 采样：距离过近的点不入库，避免刷新后草稿体积爆炸。 */
export function appendStrokePoint(stroke: MaskStroke, point: MaskPoint, minDistance = 0.0015): MaskStroke {
    const next = normalizePoint(point);
    const last = stroke.points[stroke.points.length - 1];
    if (last) {
        const dx = next.x - last.x;
        const dy = next.y - last.y;
        if (Math.hypot(dx, dy) < minDistance) return stroke;
    }
    return { ...stroke, points: [...stroke.points, next] };
}

export function pushMaskStroke(history: MaskHistory, stroke: MaskStroke): MaskHistory {
    if (stroke.points.length === 0) return history;
    return { past: [...history.past, history.present], present: [...history.present, stroke], future: [] };
}

export function undoMaskStroke(history: MaskHistory): MaskHistory {
    if (history.past.length === 0) return history;
    const past = history.past.slice(0, -1);
    const present = history.past[history.past.length - 1];
    return { past, present, future: [history.present, ...history.future] };
}

export function redoMaskStroke(history: MaskHistory): MaskHistory {
    if (history.future.length === 0) return history;
    const [next, ...future] = history.future;
    return { past: [...history.past, history.present], present: next, future };
}

/** 重置 = 清空全部笔画，但仍可撤销（不破坏用户工作）。 */
export function resetMaskHistory(history: MaskHistory): MaskHistory {
    if (history.present.length === 0) return history;
    return { past: [...history.past, history.present], present: [], future: [] };
}

export function maskHistoryLabel(history: MaskHistory): { canUndo: boolean; canRedo: boolean; strokeCount: number } {
    return { canUndo: history.past.length > 0, canRedo: history.future.length > 0, strokeCount: history.present.length };
}

/* ------------------------------------------------------------------ *
 * 蒙版栅格化（纯函数）：笔刷叠加、橡皮擦除、自动扩边、反选
 * ------------------------------------------------------------------ */

export type RasterizeOptions = {
    /** 采样网格宽高（像素） */
    width: number;
    height: number;
    /** 源图像素 → 网格像素的缩放比（网格宽 / 源图宽） */
    pixelScale?: number;
    inverted?: boolean;
    /** 自动扩边半径（源图像素） */
    autoExpandPx?: number;
};

function stampDisc(grid: Uint8Array, width: number, height: number, cx: number, cy: number, radius: number, value: number) {
    const r = Math.max(0.5, radius);
    const minX = Math.max(0, Math.floor(cx - r));
    const maxX = Math.min(width - 1, Math.ceil(cx + r));
    const minY = Math.max(0, Math.floor(cy - r));
    const maxY = Math.min(height - 1, Math.ceil(cy + r));
    const r2 = r * r;
    for (let y = minY; y <= maxY; y += 1) {
        const dy = y + 0.5 - cy;
        for (let x = minX; x <= maxX; x += 1) {
            const dx = x + 0.5 - cx;
            if (dx * dx + dy * dy <= r2) grid[y * width + x] = value;
        }
    }
}

/** 圆形结构元的膨胀；用于「自动扩大选择区域」，与导出时的线宽补偿语义一致。 */
function dilate(grid: Uint8Array, width: number, height: number, radius: number): Uint8Array {
    const r = Math.floor(radius);
    if (r <= 0) return grid;
    const out = new Uint8Array(grid.length);
    const offsets: Array<[number, number]> = [];
    for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
            if (dx * dx + dy * dy <= r * r) offsets.push([dx, dy]);
        }
    }
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            if (grid[y * width + x] === 0) continue;
            for (const [dx, dy] of offsets) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                out[ny * width + nx] = 255;
            }
        }
    }
    return out;
}

export function rasterizeMask(strokes: MaskStroke[], options: RasterizeOptions): Uint8Array {
    const width = Math.max(1, Math.round(options.width));
    const height = Math.max(1, Math.round(options.height));
    const pixelScale = options.pixelScale && options.pixelScale > 0 ? options.pixelScale : 1;
    const grid = new Uint8Array(width * height);
    for (const stroke of strokes) {
        if (stroke.points.length === 0) continue;
        const radius = Math.max(0.5, (stroke.size * pixelScale) / 2);
        const value = stroke.tool === "eraser" ? 0 : 255;
        const points = stroke.points.map((point) => ({ x: point.x * width, y: point.y * height }));
        stampDisc(grid, width, height, points[0].x, points[0].y, radius, value);
        for (let i = 1; i < points.length; i += 1) {
            const from = points[i - 1];
            const to = points[i];
            const distance = Math.hypot(to.x - from.x, to.y - from.y);
            const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.5)));
            for (let step = 1; step <= steps; step += 1) {
                const t = step / steps;
                stampDisc(grid, width, height, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, radius, value);
            }
        }
    }
    const expanded = options.autoExpandPx ? dilate(grid, width, height, options.autoExpandPx * pixelScale) : grid;
    if (!options.inverted) return expanded;
    const inverted = new Uint8Array(expanded.length);
    for (let i = 0; i < expanded.length; i += 1) inverted[i] = 255 - expanded[i];
    return inverted;
}

export function coverageRatio(alpha: Uint8Array): number {
    if (alpha.length === 0) return 0;
    let covered = 0;
    for (let i = 0; i < alpha.length; i += 1) if (alpha[i]! > 0) covered += 1;
    return covered / alpha.length;
}

/** 覆盖率（0–1），用于「已涂抹 x% 区域」提示与快照。 */
export function maskCoverage(state: Pick<MaskState, "strokes" | "inverted" | "autoExpand">): number {
    if (state.strokes.length === 0) return 0;
    const alpha = rasterizeMask(state.strokes, {
        width: MASK_COVERAGE_GRID,
        height: MASK_COVERAGE_GRID,
        inverted: state.inverted,
        autoExpandPx: state.autoExpand ? MASK_AUTO_EXPAND_PX : 0,
    });
    return coverageRatio(alpha);
}

/** 蒙版是否为空：按真实栅格结果判断（擦除到全空也算空）。 */
export function maskIsEmpty(state: Pick<MaskState, "strokes" | "inverted" | "autoExpand">): boolean {
    if (state.strokes.length === 0) return true;
    return maskCoverage(state) <= 0;
}

export function describeCoverage(ratio: number): string {
    if (ratio <= 0) return "尚未涂抹";
    if (ratio >= 1) return "覆盖全图";
    return `已涂抹 ${(ratio * 100).toFixed(1)}% 区域`;
}

/* ------------------------------------------------------------------ *
 * 校验与快照
 * ------------------------------------------------------------------ */

export type AreaRepairInput = {
    imageUrl: string;
    maskUrl: string;
    prompt: string;
    outputNum: number;
    imageWidth?: number;
    imageHeight?: number;
    maskWidth?: number;
    maskHeight?: number;
};

export function validateAreaRepairInput(input: AreaRepairInput): AreaRepairIssue[] {
    const issues: AreaRepairIssue[] = [];
    if (!input.imageUrl.trim()) issues.push({ field: "image", message: "请先上传要重绘的图片" });
    if (!input.maskUrl.trim()) issues.push({ field: "mask", message: "请先在图片上涂抹需要重绘的区域" });
    const prompt = input.prompt.trim();
    if (!prompt) issues.push({ field: "prompt", message: "请填写重绘描述" });
    if (input.prompt.length > AREA_REPAIR_PROMPT_MAX) {
        issues.push({ field: "prompt", message: `重绘描述最多 ${AREA_REPAIR_PROMPT_MAX} 字，当前 ${input.prompt.length} 字` });
    }
    if (!(AREA_REPAIR_OUTPUT_OPTIONS as readonly number[]).includes(Math.round(Number(input.outputNum)))) {
        issues.push({ field: "outputNum", message: "生成张数只能是 1–4" });
    }
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

export type AreaRepairSnapshot = {
    toolId: typeof AREA_REPAIR_TOOL_ID;
    imageAssetId: string;
    imageName: string;
    imageWidth: number;
    imageHeight: number;
    maskHash: string;
    maskCoverage: number;
    strokeCount: number;
    feather: number;
    autoExpand: boolean;
    inverted: boolean;
    prompt: string;
    outputNum: number;
    model?: string;
};

export type AreaRepairSnapshotInput = {
    imageAssetId?: string;
    imageName?: string;
    imageWidth?: number;
    imageHeight?: number;
    state: Pick<MaskState, "strokes" | "feather" | "autoExpand" | "inverted">;
    prompt: string;
    outputNum: number;
    model?: string;
    /** 导出后的蒙版 dataUrl；只取其内容摘要，不把字节写进快照。 */
    maskDataUrl?: string;
};

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

/** djb2：稳定、够短，纯前端一次提交内自洽（与 change-color-v2 同族做法）。 */
export function computeSnapshotHash(parts: unknown): string {
    const text = stableStringify(parts);
    let hash = 5381;
    for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
    return hash.toString(36);
}

export function computeMaskHash(state: Pick<MaskState, "strokes" | "feather" | "autoExpand" | "inverted">, maskDataUrl?: string): string {
    return computeSnapshotHash({
        strokes: state.strokes.map((stroke) => [stroke.tool, stroke.size, stroke.points.map((point) => [point.x, point.y])]),
        feather: state.feather,
        autoExpand: state.autoExpand,
        inverted: state.inverted,
        maskDataUrl: maskDataUrl ?? null,
    });
}

export function buildAreaRepairSnapshot(input: AreaRepairSnapshotInput): AreaRepairSnapshot {
    return {
        toolId: AREA_REPAIR_TOOL_ID,
        imageAssetId: input.imageAssetId ?? "",
        imageName: input.imageName ?? "",
        imageWidth: input.imageWidth ?? 0,
        imageHeight: input.imageHeight ?? 0,
        maskHash: computeMaskHash(input.state, input.maskDataUrl),
        maskCoverage: maskCoverage(input.state),
        strokeCount: input.state.strokes.length,
        feather: input.state.feather,
        autoExpand: input.state.autoExpand,
        inverted: input.state.inverted,
        prompt: input.prompt.trim(),
        outputNum: normalizeOutputNum(input.outputNum),
        ...(input.model ? { model: input.model } : {}),
    };
}

export function snapshotHash(snapshot: AreaRepairSnapshot): string {
    return computeSnapshotHash(snapshot);
}

/** 当前输入与提交快照是否已经不同（不同就标记「旧版本结果」，不冒充当前结果）。 */
export function isSnapshotStale(snapshot: AreaRepairSnapshot | null, current: AreaRepairSnapshot | null): boolean {
    if (!snapshot || !current) return false;
    return snapshotHash(snapshot) !== snapshotHash(current);
}

/* ------------------------------------------------------------------ *
 * 草稿解析 / 序列化
 * ------------------------------------------------------------------ */

function parseStrokes(raw: unknown): MaskStroke[] {
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
            tool: record.tool === "eraser" ? "eraser" : "brush",
            size: clampBrushSize(record.size),
            points: parsed,
        });
    });
    return strokes;
}

export function parseMaskDraftValues(values: Record<string, unknown> = {}): MaskDraftValues {
    const state = createMaskState({
        strokes: parseStrokes(values.strokes),
        tool: values.tool === "eraser" ? "eraser" : "brush",
        brushSize: clampBrushSize(values.brushSize),
        feather: clampFeather(values.feather),
        inverted: values.inverted === true,
        autoExpand: typeof values.autoExpand === "boolean" ? values.autoExpand : MASK_AUTO_EXPAND_DEFAULT,
    });
    const prompt = typeof values.prompt === "string" ? values.prompt.slice(0, AREA_REPAIR_PROMPT_MAX) : "";
    return { state, prompt, outputNum: normalizeOutputNum(values.outputNum) };
}

/** 提交时显式带上的 ToolSpec 字段（与 registry 的 fields 一一对应，缺失会在 adapter 里报错）。 */
export function composeMaskFields(snapshot: AreaRepairSnapshot): Record<string, unknown> {
    return {
        autoExpand: snapshot.autoExpand,
        imageName: snapshot.imageName,
        /** 蒙版不入指纹原文，只带内容摘要，避免超长 dataUrl 污染任务指纹。 */
        maskHash: snapshot.maskHash,
        maskCoverage: snapshot.maskCoverage,
        inverted: snapshot.inverted,
        feather: snapshot.feather,
        strokeCount: snapshot.strokeCount,
        outputNum: snapshot.outputNum,
    };
}

export function serializeMaskDraftValues(draft: MaskDraftValues): Record<string, unknown> {
    return {
        strokes: draft.state.strokes,
        tool: draft.state.tool,
        brushSize: draft.state.brushSize,
        feather: draft.state.feather,
        inverted: draft.state.inverted,
        autoExpand: draft.state.autoExpand,
        prompt: draft.prompt,
        outputNum: normalizeOutputNum(draft.outputNum),
    };
}
