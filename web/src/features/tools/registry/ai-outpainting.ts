/**
 * AI_OUTPAINTING「智能扩图」页面契约 + 纯逻辑（无 React / 无网络 / 无 canvas）。
 *
 * 证据：docs/V1.0/plan_linkfox_navigation/page-specs/06-ai-outpainting.md
 *  - 区域：图片上传｜画布/比例扩展｜扩展预览｜生成数量｜结果网格
 *  - 联动：改比例只调整外扩画布、不拉伸原图；拖动原图改变保留区域并更新 mask；
 *          恢复默认尺寸清掉扩展变换；生成前必须确认扩展方向与最终尺寸
 *  - 字段：config / editFlag / width / height / imageConfig / imageExpandUrl / imageName /
 *          imageUrl / maskUrl / originImageUrl / outputNum / prompt / ratio / stageConfig
 *  - 草稿键：tool-draft:v1:AI_OUTPAINTING
 *
 * 这里只描述「扩图几何 + 校验 + 快照」语义，不复制 LinkFox 前端，也不出现算力区。
 */

import type { ToolSpec } from "../types";
import { getToolById } from "./index";

export const AI_OUTPAINTING_TOOL_ID = "AI_OUTPAINTING" as const;
export const AI_OUTPAINTING_SLUG = "ai-outpainting" as const;
export const AI_OUTPAINTING_ROUTE = "/tools/ecommerce-suite/ai-outpainting" as const;

/** 与共享 `tool-draft:v1:<toolId>` 约定一致。 */
export const OUTPAINT_DRAFT_KEY = `tool-draft:v1:${AI_OUTPAINTING_TOOL_ID}`;

/** 规格：prompt 1–4000 字；输出 1–4 张；原站默认「4张」。 */
export const OUTPAINT_MAX_PROMPT = 4000;
export const OUTPAINT_MIN_OUTPUT = 1;
export const OUTPAINT_MAX_OUTPUT = 4;

/** 提示词留空时随请求提交的中性续画描述（原站允许不填，几何信息仍完整）。 */
export const OUTPAINT_EMPTY_PROMPT_FALLBACK = "自然延续原图的场景与质感，接缝处无缝过渡，不新增文字或水印";
export const OUTPAINT_DEFAULT_OUTPUT = 4;

/** 画布边限制：与共享资产校验（384–4096）兼容，同时留出 8px 对齐余量。 */
export const OUTPAINT_MIN_SIDE = 256;
export const OUTPAINT_MAX_SIDE = 4096;
export const OUTPAINT_SIDE_ALIGN = 8;
export const OUTPAINT_MAX_BYTES = 10 * 1024 * 1024;

/** 少于该像素不认为「有外扩」，避免生成一张和原图一样的结果。 */
export const OUTPAINT_MIN_EXPANSION = 8;

/** 拖动原图时至少保留在画布内的比例（防止把原图拖丢后 mask 为空）。 */
export const OUTPAINT_MIN_VISIBLE_RATIO = 0.25;

/** 页面上快速跳转的默认长边。 */
export const OUTPAINT_DEFAULT_LONG_SIDE = 1024;

export type OutpaintRatioKey =
    | "original"
    | "1:1"
    | "4:3"
    | "3:4"
    | "16:9"
    | "9:16"
    | "3:2"
    | "2:3"
    | "21:9"
    | "custom";

export interface OutpaintRatioOption {
    key: OutpaintRatioKey;
    label: string;
    /** `null` 表示比例由原图或宽高输入决定。 */
    value: number | null;
}

/** 顺序按「原站默认 → 常用电商比例 → 自定义」。 */
export const OUTPAINT_RATIOS: readonly OutpaintRatioOption[] = [
    { key: "original", label: "原图比例", value: null },
    { key: "1:1", label: "1:1", value: 1 },
    { key: "4:3", label: "4:3", value: 4 / 3 },
    { key: "3:4", label: "3:4", value: 3 / 4 },
    { key: "16:9", label: "16:9", value: 16 / 9 },
    { key: "9:16", label: "9:16", value: 9 / 16 },
    { key: "3:2", label: "3:2", value: 3 / 2 },
    { key: "2:3", label: "2:3", value: 2 / 3 },
    { key: "21:9", label: "21:9", value: 21 / 9 },
    { key: "custom", label: "自定义", value: null },
] as const;

export interface OutpaintSizePreset {
    id: string;
    label: string;
    longSide: number;
}

export const OUTPAINT_SIZE_PRESETS: readonly OutpaintSizePreset[] = [
    { id: "standard", label: "标准 1024", longSide: 1024 },
    { id: "hd", label: "高清 1536", longSide: 1536 },
    { id: "uhd", label: "2K 2048", longSide: 2048 },
] as const;

export interface OutpaintSourceSize {
    width: number;
    height: number;
}

/** 扩图几何：画布尺寸 + 原图在画布中的像素位置（原图 1:1 落图，不缩放 = 不拉伸）。 */
export interface OutpaintGeometry extends OutpaintSourceSize {
    canvasWidth: number;
    canvasHeight: number;
    /** 原图左上角在画布坐标系中的位置。 */
    x: number;
    y: number;
}

export interface OutpaintValues {
    sourceAssetId: string | null;
    sourceName: string;
    sourceWidth: number;
    sourceHeight: number;
    ratio: OutpaintRatioKey;
    sizePreset: string;
    width: number;
    height: number;
    /** 原图在画布中的位置（画布像素）。 */
    offsetX: number;
    offsetY: number;
    /** 原图锁定：锁定后拖拽只改画布边界，不允许移动原图。 */
    locked: boolean;
    /** `editFlag`：是否处于画布编辑态（进/出编辑模式自动更新，落库到任务字段）。 */
    editMode: boolean;
    outputNum: number;
    prompt: string;
    maskAssetId: string | null;
    maskUrl: string;
    /** 蒙版对应的几何 hash；与当前几何不一致即视为「蒙版需要重建」。 */
    maskHash: string;
}

export const DEFAULT_OUTPAINT_VALUES: OutpaintValues = {
    sourceAssetId: null,
    sourceName: "",
    sourceWidth: 0,
    sourceHeight: 0,
    ratio: "1:1",
    sizePreset: "standard",
    width: 1024,
    height: 1024,
    offsetX: 0,
    offsetY: 0,
    locked: true,
    editMode: true,
    outputNum: OUTPAINT_DEFAULT_OUTPUT,
    prompt: "",
    maskAssetId: null,
    maskUrl: "",
    maskHash: "",
};

export function getAiOutpaintingSpec(): ToolSpec {
    const spec = getToolById(AI_OUTPAINTING_TOOL_ID);
    if (!spec) throw new Error("AI_OUTPAINTING spec missing from tool registry");
    return spec;
}

/* ------------------------------------------------------------------ *
 * 数值与尺寸
 * ------------------------------------------------------------------ */

export function clampSide(value: unknown, fallback: number = OUTPAINT_DEFAULT_LONG_SIDE): number {
    const num = Number(value);
    // 非数字才回退默认；负数属于“向内拖过头”，应钳到最小边而不是跳回默认值。
    if (!Number.isFinite(num)) return alignSide(fallback);
    return alignSide(Math.min(OUTPAINT_MAX_SIDE, Math.max(OUTPAINT_MIN_SIDE, num)));
}

export function alignSide(value: number): number {
    const aligned = Math.round(Number(value) / OUTPAINT_SIDE_ALIGN) * OUTPAINT_SIDE_ALIGN;
    return Math.min(OUTPAINT_MAX_SIDE, Math.max(OUTPAINT_MIN_SIDE, aligned));
}

export function ratioValue(key: OutpaintRatioKey, source?: OutpaintSourceSize | null): number | null {
    const option = OUTPAINT_RATIOS.find((item) => item.key === key);
    if (option?.value) return option.value;
    if (key === "original") {
        if (source && source.width > 0 && source.height > 0) return source.width / source.height;
        return 1;
    }
    return null;
}

/** 比例 → 目标尺寸（长边固定，短边按比例；8px 对齐，边界钳制）。 */
export function sizeForRatio(
    key: OutpaintRatioKey,
    longSide: number = OUTPAINT_DEFAULT_LONG_SIDE,
    source?: OutpaintSourceSize | null,
): OutpaintSourceSize {
    const ratio = ratioValue(key, source);
    const long = clampSide(longSide);
    if (!ratio || !Number.isFinite(ratio) || ratio <= 0) return { width: long, height: long };
    if (ratio >= 1) return { width: long, height: clampSide(long / ratio) };
    return { width: clampSide(long * ratio), height: long };
}

export function presetById(id: string): OutpaintSizePreset {
    return OUTPAINT_SIZE_PRESETS.find((item) => item.id === id) ?? OUTPAINT_SIZE_PRESETS[0];
}

/* ------------------------------------------------------------------ *
 * 几何联动
 * ------------------------------------------------------------------ */

export function centerOffset(canvasWidth: number, canvasHeight: number, source: OutpaintSourceSize): { x: number; y: number } {
    return {
        x: Math.round((canvasWidth - source.width) / 2),
        y: Math.round((canvasHeight - source.height) / 2),
    };
}

/**
 * 把原图位置钳制在「至少保留 OUTPAINT_MIN_VISIBLE_RATIO 可见」的范围内。
 * 不做缩放，只限制平移 —— 拉伸原图在本页永远不被允许。
 */
export function clampOffset(
    values: Pick<OutpaintValues, "width" | "height" | "sourceWidth" | "sourceHeight">,
    offset: { x: number; y: number },
): { x: number; y: number } {
    if (values.sourceWidth <= 0 || values.sourceHeight <= 0) {
        return { x: Math.round(offset.x), y: Math.round(offset.y) };
    }
    const visibleW = Math.max(1, Math.round(values.sourceWidth * OUTPAINT_MIN_VISIBLE_RATIO));
    const visibleH = Math.max(1, Math.round(values.sourceHeight * OUTPAINT_MIN_VISIBLE_RATIO));
    const minX = -values.sourceWidth + visibleW;
    const maxX = values.width - visibleW;
    const minY = -values.sourceHeight + visibleH;
    const maxY = values.height - visibleH;
    const x = Math.min(Math.max(Math.round(offset.x), Math.min(minX, maxX)), Math.max(minX, maxX));
    const y = Math.min(Math.max(Math.round(offset.y), Math.min(minY, maxY)), Math.max(minY, maxY));
    return { x, y };
}

/** 切换到某个比例：只改画布尺寸并重新安放原图，绝不缩放原图。 */
export function applyRatio(values: OutpaintValues, ratio: OutpaintRatioKey, longSide?: number): OutpaintValues {
    const source = { width: values.sourceWidth, height: values.sourceHeight };
    const preset = presetById(values.sizePreset);
    const size = sizeForRatio(ratio, longSide ?? preset.longSide, source);
    const next = { ...values, ratio, width: size.width, height: size.height };
    const offset = values.sourceWidth > 0 ? clampOffset(next, { x: values.offsetX, y: values.offsetY }) : { x: 0, y: 0 };
    const originalFits =
        values.sourceWidth > 0 &&
        offset.x >= 0 &&
        offset.y >= 0 &&
        offset.x + values.sourceWidth <= next.width &&
        offset.y + values.sourceHeight <= next.height;
    const placed = originalFits ? offset : centerOffset(next.width, next.height, source);
    return { ...next, offsetX: placed.x, offsetY: placed.y, sizePreset: values.sizePreset };
}

export function applySizePreset(values: OutpaintValues, presetId: string): OutpaintValues {
    const preset = presetById(presetId);
    return applyRatio({ ...values, sizePreset: preset.id }, values.ratio, preset.longSide);
}

/** 手动改宽：比例不为 custom 时高度跟着比例走（尺寸与比例同步）。 */
export function applyWidth(values: OutpaintValues, width: number): OutpaintValues {
    const nextWidth = clampSide(width);
    const ratio = ratioValue(values.ratio, values);
    if (!ratio) {
        const next = { ...values, width: nextWidth, sizePreset: "custom" };
        return { ...next, ...offsetTo(next, { x: values.offsetX, y: values.offsetY }) };
    }
    const next = { ...values, width: nextWidth, height: clampSide(nextWidth / ratio), sizePreset: "custom" };
    return { ...next, ...offsetTo(next, { x: values.offsetX, y: values.offsetY }) };
}

/** 手动改高：同上，宽度跟着比例走。 */
export function applyHeight(values: OutpaintValues, height: number): OutpaintValues {
    const nextHeight = clampSide(height);
    const ratio = ratioValue(values.ratio, values);
    if (!ratio) {
        const next = { ...values, height: nextHeight, sizePreset: "custom" };
        return { ...next, ...offsetTo(next, { x: values.offsetX, y: values.offsetY }) };
    }
    const next = { ...values, height: nextHeight, width: clampSide(nextHeight * ratio), sizePreset: "custom" };
    return { ...next, ...offsetTo(next, { x: values.offsetX, y: values.offsetY }) };
}

function offsetTo(values: OutpaintValues, offset: { x: number; y: number }): { offsetX: number; offsetY: number } {
    const clamped = clampOffset(values, offset);
    return { offsetX: clamped.x, offsetY: clamped.y };
}

export type OutpaintEdge = "left" | "right" | "top" | "bottom";

/**
 * 拖拽扩图边界：`delta` 为画布像素（正数 = 向外扩）。
 * 拖左/上边界时同步平移原图坐标，保证原图在画布中的视觉位置不动。
 */
export function expandEdge(values: OutpaintValues, edge: OutpaintEdge, delta: number): OutpaintValues {
    const amount = Math.round(Number.isFinite(delta) ? delta : 0);
    if (!amount) return values;
    if (edge === "left") {
        const width = clampSide(values.width + amount);
        const applied = width - values.width;
        const next = { ...values, width, offsetX: values.offsetX + applied };
        return { ...next, offsetX: clampOffset(next, { x: next.offsetX, y: next.offsetY }).x };
    }
    if (edge === "right") {
        return { ...values, width: clampSide(values.width + amount) };
    }
    if (edge === "top") {
        const height = clampSide(values.height + amount);
        const applied = height - values.height;
        const next = { ...values, height, offsetY: values.offsetY + applied };
        return { ...next, offsetY: clampOffset(next, { x: next.offsetX, y: next.offsetY }).y };
    }
    return { ...values, height: clampSide(values.height + amount) };
}

/* ------------------------------------------------------------------ *
 * 边界键盘微调（40×40px 热区 + 键盘可达，见页面规格 §6）
 * ------------------------------------------------------------------ */

/** 方向键每次微调 8px（与 OUTPAINT_SIDE_ALIGN 对齐，不会产生非对齐尺寸）。 */
export const OUTPAINT_KEYBOARD_STEP = 8;
/** Shift + 方向键大步长。 */
export const OUTPAINT_KEYBOARD_STEP_LARGE = 64;

/**
 * 把「边界 + 按键」翻译成 `expandEdge` 的像素增量。
 * 语义：方向键移动的是那条边本身（按 ← 就是把这条边往左推），外扩方向由边决定。
 *   左边界的 ← = 外扩(+step)，→ = 收回(-step)；
 *   右边界的 → = 外扩(+step)，← = 收回(-step)；上下同理。
 * 交叉轴按键返回 0（按 ↑ 不应该改变左边界），避免手滑误改。
 */
export function edgeKeyboardDelta(edge: OutpaintEdge, key: string, shift = false): number {
    const step = shift ? OUTPAINT_KEYBOARD_STEP_LARGE : OUTPAINT_KEYBOARD_STEP;
    const horizontal = edge === "left" || edge === "right";
    const moveSign = horizontal
        ? key === "ArrowLeft"
            ? -1
            : key === "ArrowRight"
              ? 1
              : 0
        : key === "ArrowUp"
          ? -1
          : key === "ArrowDown"
            ? 1
            : 0;
    if (!moveSign) return 0;
    // 左/上边界的「向外」是坐标负方向；右/下边界是正方向。
    const outward = edge === "left" || edge === "top" ? -1 : 1;
    return moveSign * outward * step;
}

/** 某条边的当前外扩像素（键盘/辅助技术读到的值，超出画布记 0）。 */
export function edgeExpansion(values: OutpaintValues, edge: OutpaintEdge): number {
    return expansionOf(values)[edge];
}

/* ------------------------------------------------------------------ *
 * TransformHistory：撤销 / 重做（只记录几何与锁定变换，不记录打字）
 * ------------------------------------------------------------------ */

export const OUTPAINT_HISTORY_LIMIT = 50;

export interface OutpaintHistory {
    past: OutpaintValues[];
    present: OutpaintValues;
    future: OutpaintValues[];
}

/** 参与「可撤销」的字段：比例/尺寸/原图位置/锁定/编辑态。prompt 打字不进入历史。 */
export function transformSignature(
    values: Pick<OutpaintValues, "ratio" | "sizePreset" | "width" | "height" | "offsetX" | "offsetY" | "locked" | "editMode">,
): string {
    return [
        values.ratio,
        values.sizePreset,
        values.width,
        values.height,
        values.offsetX,
        values.offsetY,
        values.locked ? 1 : 0,
        values.editMode ? 1 : 0,
    ].join("|");
}

export function createOutpaintHistory(values: OutpaintValues): OutpaintHistory {
    return { past: [], present: values, future: [] };
}

/**
 * 记录一次变更：
 *  - 几何/锁定发生变化 → 入栈（可撤销），并清空 redo 分支；
 *  - 只改 prompt / 数量 / 蒙版等服务端字段 → 原地替换 present，不产生撤销步。
 */
export function pushOutpaintHistory(history: OutpaintHistory, next: OutpaintValues): OutpaintHistory {
    if (transformSignature(history.present) === transformSignature(next)) {
        return { ...history, present: next };
    }
    const past = [...history.past, history.present].slice(-OUTPAINT_HISTORY_LIMIT);
    return { past, present: next, future: [] };
}

export function canUndoOutpaint(history: OutpaintHistory): boolean {
    return history.past.length > 0;
}

export function canRedoOutpaint(history: OutpaintHistory): boolean {
    return history.future.length > 0;
}

export function undoOutpaint(history: OutpaintHistory): OutpaintHistory {
    if (!history.past.length) return history;
    const previous = history.past[history.past.length - 1];
    // 撤销只回退几何，不丢当前 prompt / 蒙版：把这些「非几何字段」从 present 带回去。
    const restored: OutpaintValues = {
        ...previous,
        prompt: history.present.prompt,
        outputNum: history.present.outputNum,
        sourceAssetId: history.present.sourceAssetId,
        sourceName: history.present.sourceName,
        sourceWidth: history.present.sourceWidth,
        sourceHeight: history.present.sourceHeight,
        maskAssetId: history.present.maskAssetId,
        maskUrl: history.present.maskUrl,
        maskHash: history.present.maskHash,
    };
    return {
        past: history.past.slice(0, -1),
        present: restored,
        future: [history.present, ...history.future].slice(0, OUTPAINT_HISTORY_LIMIT),
    };
}

export function redoOutpaint(history: OutpaintHistory): OutpaintHistory {
    if (!history.future.length) return history;
    const [next, ...rest] = history.future;
    const restored: OutpaintValues = {
        ...next,
        prompt: history.present.prompt,
        outputNum: history.present.outputNum,
        sourceAssetId: history.present.sourceAssetId,
        sourceName: history.present.sourceName,
        sourceWidth: history.present.sourceWidth,
        sourceHeight: history.present.sourceHeight,
        maskAssetId: history.present.maskAssetId,
        maskUrl: history.present.maskUrl,
        maskHash: history.present.maskHash,
    };
    return {
        past: [...history.past, history.present].slice(-OUTPAINT_HISTORY_LIMIT),
        present: restored,
        future: rest,
    };
}

/** 拖动原图改变保留区域；锁定状态下直接拒绝（返回原对象，便于 UI 判断）。 */
export function moveOriginal(values: OutpaintValues, dx: number, dy: number): OutpaintValues {
    if (values.locked) return values;
    const next = { ...values, ...offsetTo(values, { x: values.offsetX + dx, y: values.offsetY + dy }) };
    return next;
}

export function toggleLock(values: OutpaintValues, locked?: boolean): OutpaintValues {
    return { ...values, locked: locked ?? !values.locked };
}

/** 恢复默认尺寸：清掉扩展变换，回到原图尺寸、原图比例、原图居中。 */
export function resetOutpaintTransform(values: OutpaintValues): OutpaintValues {
    const source = { width: values.sourceWidth, height: values.sourceHeight };
    if (!source.width || !source.height) {
        return {
            ...values,
            ratio: "original",
            width: OUTPAINT_DEFAULT_LONG_SIDE,
            height: OUTPAINT_DEFAULT_LONG_SIDE,
            offsetX: 0,
            offsetY: 0,
            sizePreset: "custom",
        };
    }
    const width = clampSide(source.width);
    const height = clampSide(source.height);
    return {
        ...values,
        ratio: "original",
        sizePreset: "custom",
        width,
        height,
        offsetX: 0,
        offsetY: 0,
    };
}

export interface OutpaintExpansion {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

/** 各方向外扩像素（原图超出画布的方向记 0，因为不是「扩展」而是被裁掉）。 */
export function expansionOf(values: OutpaintValues): OutpaintExpansion {
    return {
        left: Math.max(0, Math.round(values.offsetX)),
        top: Math.max(0, Math.round(values.offsetY)),
        right: Math.max(0, Math.round(values.width - values.offsetX - values.sourceWidth)),
        bottom: Math.max(0, Math.round(values.height - values.offsetY - values.sourceHeight)),
    };
}

export function expansionTotal(values: OutpaintValues): number {
    const e = expansionOf(values);
    return e.left + e.top + e.right + e.bottom;
}

export type OutpaintDirection = "left" | "right" | "top" | "bottom";

const DIRECTION_LABEL: Record<OutpaintDirection, string> = { left: "左", right: "右", top: "上", bottom: "下" };

export function expansionDirections(values: OutpaintValues): Array<{ key: OutpaintDirection; label: string; pixels: number }> {
    const e = expansionOf(values);
    return (["top", "bottom", "left", "right"] as const)
        .map((key) => ({ key, label: DIRECTION_LABEL[key], pixels: e[key] }))
        .filter((item) => item.pixels >= OUTPAINT_MIN_EXPANSION);
}

export function expansionSummary(values: OutpaintValues): string {
    const directions = expansionDirections(values);
    if (!directions.length) return "无外扩（原图已覆盖画布）";
    return directions.map((item) => `${item.label} ${item.pixels}px`).join(" · ");
}

/* ------------------------------------------------------------------ *
 * 蒙版几何（与比例/尺寸/原图位置同步）
 * ------------------------------------------------------------------ */

export interface OutpaintKeepRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface OutpaintMaskPlan {
    canvasWidth: number;
    canvasHeight: number;
    /** 保留区域（原图落在画布内的部分）。 */
    keep: OutpaintKeepRect | null;
    geometryHash: string;
}

/** 保留矩形 = 原图矩形 ∩ 画布矩形；两者不重叠时返回 null。 */
export function keepRect(values: OutpaintValues): OutpaintKeepRect | null {
    const left = Math.max(0, values.offsetX);
    const top = Math.max(0, values.offsetY);
    const right = Math.min(values.width, values.offsetX + values.sourceWidth);
    const bottom = Math.min(values.height, values.offsetY + values.sourceHeight);
    const width = Math.round(right - left);
    const height = Math.round(bottom - top);
    if (width <= 0 || height <= 0) return null;
    return { x: Math.round(left), y: Math.round(top), width, height };
}

export function geometryOf(values: OutpaintValues): OutpaintGeometry {
    return {
        canvasWidth: values.width,
        canvasHeight: values.height,
        x: values.offsetX,
        y: values.offsetY,
        width: values.sourceWidth,
        height: values.sourceHeight,
    };
}

/** 32-bit FNV-1a：几何 hash 只需要稳定、可比较，不做密码学承诺。 */
export function hashString(input: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}

export function geometryHash(values: OutpaintValues): string {
    return hashString(`${values.width}x${values.height}|${values.offsetX},${values.offsetY}|${values.sourceWidth}x${values.sourceHeight}`);
}

export function maskPlan(values: OutpaintValues): OutpaintMaskPlan {
    return {
        canvasWidth: values.width,
        canvasHeight: values.height,
        keep: keepRect(values),
        geometryHash: geometryHash(values),
    };
}

export type OutpaintMaskSync = "missing" | "stale" | "synced";

export function maskSyncState(values: OutpaintValues): OutpaintMaskSync {
    if (!values.maskUrl && !values.maskAssetId) return "missing";
    if (values.maskHash !== geometryHash(values)) return "stale";
    return "synced";
}

export function withMask(
    values: OutpaintValues,
    input: { maskUrl: string; maskAssetId?: string | null },
): OutpaintValues {
    return {
        ...values,
        maskUrl: input.maskUrl,
        maskAssetId: input.maskAssetId ?? null,
        maskHash: geometryHash(values),
    };
}

/* ------------------------------------------------------------------ *
 * 校验
 * ------------------------------------------------------------------ */

export type OutpaintIssueField =
    | "imageUrl"
    | "ratio"
    | "width"
    | "height"
    | "offset"
    | "canvas"
    | "outputNum"
    | "prompt"
    | "maskUrl";

export interface OutpaintIssue {
    field: OutpaintIssueField;
    code: string;
    message: string;
}

export function sanitizePrompt(value: unknown): string {
    if (typeof value !== "string") return "";
    return value.replace(/\r\n/g, "\n").slice(0, OUTPAINT_MAX_PROMPT);
}

export function validateOutpaint(values: OutpaintValues): OutpaintIssue[] {
    const issues: OutpaintIssue[] = [];
    if (!values.sourceAssetId) {
        issues.push({ field: "imageUrl", code: "source-missing", message: "请先上传要扩展的原图" });
    }
    if (values.sourceWidth <= 0 || values.sourceHeight <= 0) {
        issues.push({ field: "imageUrl", code: "source-size-unknown", message: "读不到原图像素尺寸，请重新上传（或换一张图）" });
    }
    if (values.width < OUTPAINT_MIN_SIDE || values.width > OUTPAINT_MAX_SIDE) {
        issues.push({ field: "width", code: "width-range", message: `画布宽度需在 ${OUTPAINT_MIN_SIDE}–${OUTPAINT_MAX_SIDE}px` });
    }
    if (values.height < OUTPAINT_MIN_SIDE || values.height > OUTPAINT_MAX_SIDE) {
        issues.push({ field: "height", code: "height-range", message: `画布高度需在 ${OUTPAINT_MIN_SIDE}–${OUTPAINT_MAX_SIDE}px` });
    }
    const ratio = ratioValue(values.ratio, values);
    if (ratio && values.ratio !== "custom" && values.ratio !== "original") {
        const actual = values.width / values.height;
        const tolerance = Math.max(0.01, ratio * 0.01);
        if (Math.abs(actual - ratio) > tolerance) {
            issues.push({ field: "ratio", code: "ratio-mismatch", message: "宽高与所选比例不一致，请重新选择比例或尺寸" });
        }
    }
    if (!Number.isInteger(values.outputNum) || values.outputNum < OUTPAINT_MIN_OUTPUT || values.outputNum > OUTPAINT_MAX_OUTPUT) {
        issues.push({
            field: "outputNum",
            code: "output-range",
            message: `生成数量需为 ${OUTPAINT_MIN_OUTPUT}–${OUTPAINT_MAX_OUTPUT} 的整数`,
        });
    }
    if (!Number.isFinite(values.offsetX) || !Number.isFinite(values.offsetY)) {
        issues.push({ field: "offset", code: "offset-invalid", message: "原图位置无效，请点「恢复默认尺寸」重来" });
    }
    const total = expansionTotal(values);
    if (total < OUTPAINT_MIN_EXPANSION) {
        issues.push({
            field: "canvas",
            code: "no-expansion",
            message: "当前画布没有外扩区域：拉大画布边界，或缩小原图占位（原图本身不会被缩放）",
        });
    }
    if (!keepRect(values)) {
        issues.push({ field: "canvas", code: "keep-empty", message: "原图已完全移出画布，请把它拖回画布内" });
    }
    // 提示词与原站一致：可选。留空时由 composeOutpaintPrompt 补一句中性的续画描述（几何仍完整提交）。
    const prompt = values.prompt.trim();
    if (prompt.length > OUTPAINT_MAX_PROMPT) {
        issues.push({ field: "prompt", code: "prompt-too-long", message: `扩展内容最多 ${OUTPAINT_MAX_PROMPT} 字` });
    }
    return issues;
}

export function canSubmitOutpaint(values: OutpaintValues): boolean {
    return validateOutpaint(values).length === 0;
}

/* ------------------------------------------------------------------ *
 * Prompt 与结构化字段
 * ------------------------------------------------------------------ */

export interface OutpaintPromptInput {
    values: OutpaintValues;
    /** 用户填写的扩展区域内容。 */
    userPrompt: string;
}

/**
 * Prompt 是「结构化几何 + 用户内容」的合成，几何数字全部来自当前状态，
 * 保证提交快照与画布所见一致；不写死任何模型或算力信息。
 */
export function composeOutpaintPrompt(input: OutpaintPromptInput): string {
    const { values } = input;
    const keep = keepRect(values);
    const directions = expansionDirections(values);
    const lines: string[] = [];
    lines.push(`把这张图片向外扩展到 ${values.width}×${values.height}（${ratioLabel(values)}），保持原图内容不变。`);
    lines.push(
        `原图 ${values.sourceWidth}×${values.sourceHeight} 位于画布 (${values.offsetX}, ${values.offsetY})，` +
            `其覆盖区域${keep ? ` (${keep.x}, ${keep.y}) ${keep.width}×${keep.height}` : "（已移出画布）"} 必须保持像素级不变：不拉伸、不裁切、不改颜色。`,
    );
    lines.push(directions.length ? `新增画布区域：${expansionSummary(values)}。` : "画布当前没有新增区域，请只做无缝补全。");
    const content = input.userPrompt.trim() || OUTPAINT_EMPTY_PROMPT_FALLBACK;
    lines.push(`新增区域内容：${content}`);
    lines.push("接缝处自然过渡，透视、光照、纹理与原图一致；不要添加原图不存在的文字或水印。");
    return lines.join("\n");
}

export function ratioLabel(values: Pick<OutpaintValues, "ratio" | "width" | "height" | "sourceWidth" | "sourceHeight">): string {
    if (values.ratio === "original") {
        return `原图比例 ${values.sourceWidth}×${values.sourceHeight}`;
    }
    if (values.ratio === "custom") return `自定义 ${values.width}×${values.height}`;
    return values.ratio;
}

/** 结构化 `imageConfig`：比例 / 尺寸 / 数量（页面控件直接生成，不自由拼接）。 */
export interface OutpaintImageConfig {
    ratio: string;
    width: number;
    height: number;
    outputNum: number;
    /** 画布工具不提供品质档位时保持 undefined，避免伪造 provider 参数。 */
    quality?: string;
}

export function buildImageConfig(values: OutpaintValues): OutpaintImageConfig {
    return {
        ratio: values.ratio === "custom" ? `${values.width}:${values.height}` : values.ratio,
        width: values.width,
        height: values.height,
        outputNum: values.outputNum,
    };
}

/** 结构化 `config`：本次扩图全部几何与交互状态。 */
export interface OutpaintConfig {
    ratio: string;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    sourceWidth: number;
    sourceHeight: number;
    expansion: OutpaintExpansion;
    expansionDirections: string[];
    locked: boolean;
    editFlag: boolean;
    outputNum: number;
    geometryHash: string;
    maskSync: OutpaintMaskSync;
}

export function buildConfig(values: OutpaintValues): OutpaintConfig {
    return {
        ratio: values.ratio,
        width: values.width,
        height: values.height,
        offsetX: values.offsetX,
        offsetY: values.offsetY,
        sourceWidth: values.sourceWidth,
        sourceHeight: values.sourceHeight,
        expansion: expansionOf(values),
        expansionDirections: expansionDirections(values).map((item) => item.key),
        locked: values.locked,
        editFlag: values.editMode,
        outputNum: values.outputNum,
        geometryHash: geometryHash(values),
        maskSync: maskSyncState(values),
    };
}

export type OutpaintStage = "upload" | "edit" | "ready" | "running";

export interface OutpaintStageConfig {
    step: OutpaintStage;
    hasSource: boolean;
    hasExpansion: boolean;
    maskSynced: boolean;
    locked: boolean;
    editFlag: boolean;
    geometryHash: string;
}

export function buildStageConfig(values: OutpaintValues, options: { running?: boolean } = {}): OutpaintStageConfig {
    const hasSource = Boolean(values.sourceAssetId) && values.sourceWidth > 0 && values.sourceHeight > 0;
    const hasExpansion = expansionTotal(values) >= OUTPAINT_MIN_EXPANSION;
    const step: OutpaintStage = options.running
        ? "running"
        : !hasSource
          ? "upload"
          : hasExpansion && canSubmitOutpaint(values)
            ? "ready"
            : "edit";
    return {
        step,
        hasSource,
        hasExpansion,
        maskSynced: maskSyncState(values) === "synced",
        locked: values.locked,
        editFlag: values.editMode,
        geometryHash: geometryHash(values),
    };
}

/** 与 registry 中 AI_OUTPAINTING 的字段集合对齐（含尺码表字段：本页不渲染，避免伪造控件）。 */
export const OUTPAINT_FIELD_KEYS = [
    "config",
    "editFlag",
    "height",
    "imageConfig",
    "imageExpandUrl",
    "imageName",
    "imageUrl",
    "maskUrl",
    "originImageUrl",
    "outputNum",
    "prompt",
    "ratio",
    "stageConfig",
    "width",
] as const;

/* ------------------------------------------------------------------ *
 * 草稿解析
 * ------------------------------------------------------------------ */

function pickString(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
}

function pickNumber(value: unknown, fallback: number): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

export function parseOutpaintValues(raw: unknown): OutpaintValues {
    const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const ratio = OUTPAINT_RATIOS.some((item) => item.key === record.ratio)
        ? (record.ratio as OutpaintRatioKey)
        : DEFAULT_OUTPAINT_VALUES.ratio;
    const sourceWidth = Math.max(0, Math.round(pickNumber(record.sourceWidth, 0)));
    const sourceHeight = Math.max(0, Math.round(pickNumber(record.sourceHeight, 0)));
    const values: OutpaintValues = {
        sourceAssetId: typeof record.sourceAssetId === "string" && record.sourceAssetId ? record.sourceAssetId : null,
        sourceName: pickString(record.sourceName),
        sourceWidth,
        sourceHeight,
        ratio,
        sizePreset: pickString(record.sizePreset, "standard"),
        width: clampSide(pickNumber(record.width, OUTPAINT_DEFAULT_LONG_SIDE)),
        height: clampSide(pickNumber(record.height, OUTPAINT_DEFAULT_LONG_SIDE)),
        offsetX: Math.round(pickNumber(record.offsetX, 0)),
        offsetY: Math.round(pickNumber(record.offsetY, 0)),
        locked: record.locked !== false,
        editMode: record.editMode !== false,
        outputNum: (() => {
            const num = Math.round(pickNumber(record.outputNum, OUTPAINT_DEFAULT_OUTPUT));
            return Math.min(OUTPAINT_MAX_OUTPUT, Math.max(OUTPAINT_MIN_OUTPUT, num));
        })(),
        prompt: sanitizePrompt(record.prompt),
        maskAssetId: typeof record.maskAssetId === "string" && record.maskAssetId ? record.maskAssetId : null,
        maskUrl: pickString(record.maskUrl),
        maskHash: pickString(record.maskHash),
    };
    if (sourceWidth <= 0 || sourceHeight <= 0) return values;
    const clamped = clampOffset(values, { x: values.offsetX, y: values.offsetY });
    return { ...values, offsetX: clamped.x, offsetY: clamped.y };
}

/** 上传新原图：几何回到「原图尺寸 + 原图居中」，旧蒙版与旧结果必须失效。 */
export function applySource(
    values: OutpaintValues,
    source: { assetId: string; name: string; width: number; height: number },
): OutpaintValues {
    const width = clampSide(source.width || OUTPAINT_DEFAULT_LONG_SIDE);
    const height = clampSide(source.height || OUTPAINT_DEFAULT_LONG_SIDE);
    const next: OutpaintValues = {
        ...values,
        sourceAssetId: source.assetId,
        sourceName: source.name,
        sourceWidth: Math.round(source.width) || width,
        sourceHeight: Math.round(source.height) || height,
        ratio: "original",
        sizePreset: "custom",
        width,
        height,
        offsetX: 0,
        offsetY: 0,
        maskAssetId: null,
        maskUrl: "",
        maskHash: "",
    };
    return next;
}
