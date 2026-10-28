/**
 * TASK-021：HAND_REPAIR「手部修复」页面契约 + 纯逻辑（无 React / 无网络）。
 *
 * 事实来源：
 *  - docs/V1.0/plan_linkfox_navigation/page-specs/14-hand-repair.md
 *  - docs/V1.0/plan_linkfox_navigation/registry#HAND_REPAIR（makeType 31, layout repair）
 *  - 原站 https://www.linkfox.com/draw/hand-repair 的 workspace DOM 证据（page-specs §9 文案摘录）
 *
 * 本页与其它 repair 工具的区别（同 layout，不同契约）：
 *  - FIX_COLOR 是「偏色区域 + 目标色」；PRINTING_REPAIR 是「三步贴印花」；
 *    本页只有四组控件：手部蒙版画布（画笔/大小/重置/撤销/重做）、人物类型、生成张数、结果。
 *  - 没有提示词输入框（规格 §2 只要求上述控件）：指令由 composeHandRepairInstruction 依据
 *    人物类型 + 蒙版覆盖率生成，用户不自由拼接 prompt。
 *  - 人物类型是结构约束：成年男性/成年女性/男孩/女孩，随任务快照一起保存。
 *  - 无蒙版不能生成；换源图必须清空蒙版（旧笔画坐标属于上一张图）。
 *
 * 原站状态：菜单把「手部修复」放进「即将下架」分组（key=handRepair, drawType=HAND_REPAIR）。
 * 本项目保留独立工作区并在页面展示「原站即将下架」证据标签，不因下架隐藏工具（规格 §3）。
 *
 * 真实边界：蒙版由画布真实笔画栅格化成同尺寸 PNG，与源图一起作为两张参考图提交真实图像编辑
 * 接口；本文件不产生任何“演示结果”。
 */

import { getToolById } from "./index";
import {
    MASK_BRUSH_DEFAULT,
    MASK_BRUSH_MAX,
    MASK_BRUSH_MIN,
    appendStrokePoint,
    clampBrushSize,
    computeMaskHash,
    computeSnapshotHash,
    coverageRatio,
    createMaskHistory,
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

export const HAND_REPAIR_TOOL_ID = "HAND_REPAIR";
export const HAND_REPAIR_SLUG = "hand-repair";
export const HAND_REPAIR_ROUTE = "/tools/smart-edit/hand-repair";
export const HAND_REPAIR_LAYOUT = "repair" as const;
/** 草稿键与共享约定一致：`tool-draft:v1:<toolId>`（规格 §7）。 */
export const HAND_REPAIR_DRAFT_KEY = `tool-draft:v1:${HAND_REPAIR_TOOL_ID}`;

/* ------------------------------------------------------------------ *
 * 原站「即将下架」证据
 * ------------------------------------------------------------------ */

/**
 * 原站菜单里 handRepair 位于 `willBeDeprecated` 分组，label 旁带「下架」标记，
 * path=/draw/hand-repair，drawType=HAND_REPAIR（见 evidence/page-dom + 侧边栏 bundle 摘录）。
 * 本项目照实标注，但仍按独立工具实现（规格 §2「原站菜单标下架但路由仍显示工作区」）。
 */
export const HAND_REPAIR_UPSTREAM = {
    menuGroup: "willBeDeprecated",
    menuGroupLabel: "即将下架",
    menuLabel: "手部修复",
    badge: "原站即将下架",
    upstreamPath: "/draw/hand-repair",
    note: "原站菜单已把「手部修复」归入「即将下架」分组；本项目保留该工具的独立工作区与真实生成链路。",
} as const;

/* ------------------------------------------------------------------ *
 * 人物类型（结构约束）
 * ------------------------------------------------------------------ */

export type HandRepairPersonTypeOption = {
    value: string;
    label: string;
    /** 传给图像模型的英文结构约束；不是 UI 文案。 */
    instruction: string;
};

/**
 * 证据枚举（page-specs §9「成年男性 / 成年女性 / 男孩 / 女孩」）。
 * ToolSpec 标了 enumSource=model-catalog：当模型目录真的给出枚举时以目录为准（见
 * handRepairPersonTypeOptions），目录里没有的项一律禁用而不是静默换成别的值。
 */
export const HAND_REPAIR_PERSON_TYPES: readonly HandRepairPersonTypeOption[] = [
    { value: "adult-male", label: "成年男性", instruction: "adult male hands" },
    { value: "adult-female", label: "成年女性", instruction: "adult female hands" },
    { value: "boy", label: "男孩", instruction: "a boy's hands" },
    { value: "girl", label: "女孩", instruction: "a girl's hands" },
] as const;

export const HAND_REPAIR_PERSON_TYPE_VALUES = HAND_REPAIR_PERSON_TYPES.map((option) => option.value);
export const HAND_REPAIR_DEFAULT_PERSON_TYPE = "adult-male";

export function isHandRepairPersonType(value: unknown): value is string {
    return typeof value === "string" && HAND_REPAIR_PERSON_TYPE_VALUES.includes(value);
}

export function resolveHandRepairPersonType(value: unknown): string {
    return isHandRepairPersonType(value) ? value : HAND_REPAIR_DEFAULT_PERSON_TYPE;
}

export function handRepairPersonTypeOption(value: unknown): HandRepairPersonTypeOption {
    return HAND_REPAIR_PERSON_TYPES.find((option) => option.value === value) ?? HAND_REPAIR_PERSON_TYPES[0]!;
}

export type HandRepairCatalogEntry = { value: string; label?: string };

/**
 * 选项解析：给模型目录就按目录过滤（目录缺项 → 该项禁用，不猜一个替代值）；
 * 没有目录时退回证据枚举，保证首屏可操作但校验仍然严格。
 */
export function handRepairPersonTypeOptions(catalog?: readonly HandRepairCatalogEntry[] | null): Array<HandRepairPersonTypeOption & { disabled: boolean; reason?: string }> {
    const known = catalog?.filter((entry) => typeof entry?.value === "string" && entry.value.trim()) ?? [];
    if (known.length === 0) {
        return HAND_REPAIR_PERSON_TYPES.map((option) => ({ ...option, disabled: false }));
    }
    const byValue = new Map(known.map((entry) => [entry.value, entry]));
    return HAND_REPAIR_PERSON_TYPES.map((option) => {
        const hit = byValue.get(option.value);
        if (!hit) return { ...option, disabled: true, reason: "模型目录未提供该人物类型" };
        return { ...option, label: hit.label?.trim() || option.label, disabled: false };
    });
}

/* ------------------------------------------------------------------ *
 * 数量与画笔
 * ------------------------------------------------------------------ */

export const HAND_REPAIR_OUTPUT_OPTIONS = [1, 2, 3, 4] as const;
export const HAND_REPAIR_DEFAULT_OUTPUT = 1;

export function normalizeHandRepairOutputNum(value: unknown): number {
    const num = typeof value === "string" ? Number(value) : typeof value === "number" ? value : Number.NaN;
    if (!Number.isFinite(num)) return HAND_REPAIR_DEFAULT_OUTPUT;
    return Math.min(HAND_REPAIR_OUTPUT_OPTIONS[HAND_REPAIR_OUTPUT_OPTIONS.length - 1]!, Math.max(HAND_REPAIR_OUTPUT_OPTIONS[0]!, Math.round(num)));
}

export const HAND_REPAIR_BRUSH_MIN = MASK_BRUSH_MIN;
export const HAND_REPAIR_BRUSH_MAX = MASK_BRUSH_MAX;
export const HAND_REPAIR_BRUSH_DEFAULT = MASK_BRUSH_DEFAULT;
/** 最小点击区 40×40px 的快捷档位（规格 §6）。 */
export const HAND_REPAIR_BRUSH_PRESETS = [15, 35, 60, 100] as const;

export function clampHandRepairBrush(value: unknown): number {
    const num = typeof value === "string" ? Number(value) : typeof value === "number" ? value : Number.NaN;
    if (!Number.isFinite(num)) return HAND_REPAIR_BRUSH_DEFAULT;
    return clampBrushSize(Math.round(num));
}

/** 源图限制：与共享资产输入同源，超限在控件旁说明，不只弹通用错误。 */
export const HAND_REPAIR_SOURCE_LIMITS = {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
    minSide: 32,
    maxSide: 8192,
    maxBytes: 20 * 1024 * 1024,
} as const;

export const HAND_REPAIR_SOURCE_LABEL = "20M以内，jpg/jpeg/png/webp";

export function getHandRepairSpec(): ToolSpec | undefined {
    return getToolById(HAND_REPAIR_TOOL_ID);
}

/* ------------------------------------------------------------------ *
 * 状态 / 历史
 * ------------------------------------------------------------------ */

export type HandRepairState = {
    strokes: MaskStroke[];
    brushSize: number;
    personType: string;
    outputNum: number;
};

const BRUSH_ONLY_TOOL = "brush" as const;

export function createHandRepairState(overrides: Partial<HandRepairState> = {}): HandRepairState {
    return {
        strokes: overrides.strokes ?? [],
        brushSize: clampHandRepairBrush(overrides.brushSize ?? HAND_REPAIR_BRUSH_DEFAULT),
        personType: resolveHandRepairPersonType(overrides.personType),
        outputNum: normalizeHandRepairOutputNum(overrides.outputNum ?? HAND_REPAIR_DEFAULT_OUTPUT),
    };
}

/** 蒙版历史复用共享实现，撤销/重做语义与 AREA_REPAIR/REMOVE_PEN 一致。 */
export function createHandRepairHistory(strokes: MaskStroke[] = []): MaskHistory {
    return createMaskHistory(strokes);
}

export function beginHandRepairStroke(state: HandRepairState, point: MaskPoint, id: string): MaskStroke {
    return createStroke(BRUSH_ONLY_TOOL, state.brushSize, normalizePoint(point), id);
}

export function extendHandRepairStroke(stroke: MaskStroke, point: MaskPoint): MaskStroke {
    return appendStrokePoint(stroke, normalizePoint(point));
}

export function commitHandRepairStroke(history: MaskHistory, stroke: MaskStroke): MaskHistory {
    return pushMaskStroke(history, stroke);
}

export const undoHandRepairStroke = undoMaskStroke;
export const redoHandRepairStroke = redoMaskStroke;
export const resetHandRepairStrokes = resetMaskHistory;
export const handRepairHistoryState = maskHistoryLabel;

/** 蒙版覆盖率（0–1）：判定“是否真的涂抹过”，也用于工具栏进度文案。 */
export function handRepairCoverage(state: Pick<HandRepairState, "strokes">): number {
    return maskCoverage({ strokes: state.strokes, inverted: false, autoExpand: false });
}

export function handRepairMaskIsEmpty(state: Pick<HandRepairState, "strokes">): boolean {
    return maskIsEmpty({ strokes: state.strokes, inverted: false, autoExpand: false });
}

export function describeHandRepairCoverage(state: Pick<HandRepairState, "strokes">): string {
    return describeCoverage(handRepairCoverage(state));
}

/** 蒙版栅格（白 = 修复区域），供覆盖率与快照统计共用。 */
export function rasterizeHandRepairMask(state: Pick<HandRepairState, "strokes">, width: number, height: number): Uint8Array {
    return rasterizeMask(state.strokes, { width, height, inverted: false, autoExpandPx: 0 });
}

export function handRepairMaskRatio(state: Pick<HandRepairState, "strokes">, grid = 128): number {
    return coverageRatio(rasterizeHandRepairMask(state, grid, grid));
}

/* ------------------------------------------------------------------ *
 * 校验
 * ------------------------------------------------------------------ */

export type HandRepairIssue = { field: string; message: string };

export type HandRepairInput = {
    imageUrl: string;
    maskUrl: string;
    personType?: string;
    outputNum?: number | string;
    imageWidth?: number;
    imageHeight?: number;
    maskWidth?: number;
    maskHeight?: number;
};

/** 提交前校验（规格 §3/§7）：源图、蒙版、同尺寸、人物类型、张数，全部在控件旁说明。 */
export function validateHandRepairInput(input: HandRepairInput): HandRepairIssue[] {
    const issues: HandRepairIssue[] = [];
    if (!input.imageUrl.trim()) issues.push({ field: "image", message: "请先上传需要修复手部的图片" });
    if (!input.maskUrl.trim()) issues.push({ field: "mask", message: "请先在图片上涂抹畸形的手部区域，空蒙版无法生成" });
    if (input.personType !== undefined && !isHandRepairPersonType(input.personType)) {
        issues.push({ field: "personType", message: "请选择人物类型（成年男性/成年女性/男孩/女孩）" });
    }
    const outputNum = normalizeHandRepairOutputNum(input.outputNum);
    const raw = typeof input.outputNum === "string" ? Number(input.outputNum) : input.outputNum;
    if (input.outputNum !== undefined && (!Number.isFinite(Number(raw)) || !Number.isInteger(Number(raw)) || outputNum !== Number(raw))) {
        issues.push({ field: "outputNum", message: "生成张数只能是 1–4 的整数" });
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

export type HandRepairSourceInfo = { name?: string; mimeType?: string; bytes?: number; width?: number; height?: number };

export function validateHandRepairSource(source: HandRepairSourceInfo): HandRepairIssue[] {
    const issues: HandRepairIssue[] = [];
    const limits = HAND_REPAIR_SOURCE_LIMITS;
    if (source.mimeType && !(limits.mimeTypes as readonly string[]).includes(source.mimeType)) {
        issues.push({ field: "source", message: `只支持 ${limits.mimeTypes.join(" / ")}，当前是 ${source.mimeType}` });
    }
    if (typeof source.bytes === "number" && source.bytes > limits.maxBytes) {
        issues.push({ field: "source", message: `图片不能超过 ${Math.round(limits.maxBytes / 1024 / 1024)}MB，当前 ${(source.bytes / 1024 / 1024).toFixed(1)}MB` });
    }
    if ((typeof source.width === "number" && !(source.width > 0)) || (typeof source.height === "number" && !(source.height > 0))) {
        issues.push({ field: "source", message: "无法读取图片尺寸，请重新选择这张图片" });
    }
    if (source.width && source.height) {
        const longSide = Math.max(source.width, source.height);
        const shortSide = Math.min(source.width, source.height);
        if (longSide > limits.maxSide) issues.push({ field: "source", message: `长边不能超过 ${limits.maxSide}px，当前 ${longSide}px` });
        if (shortSide < limits.minSide) issues.push({ field: "source", message: `短边不能小于 ${limits.minSide}px，当前 ${shortSide}px` });
    }
    return issues;
}

/* ------------------------------------------------------------------ *
 * 快照
 * ------------------------------------------------------------------ */

export type HandRepairSnapshot = {
    toolId: typeof HAND_REPAIR_TOOL_ID;
    imageAssetId: string;
    imageName: string;
    imageWidth: number;
    imageHeight: number;
    maskHash: string;
    maskCoverage: number;
    strokeCount: number;
    brushSize: number;
    personType: string;
    outputNum: number;
    draftRevision: number | string | null;
    clientOperationId: string;
};

export type HandRepairSnapshotInput = {
    imageAssetId?: string;
    imageName?: string;
    imageWidth?: number;
    imageHeight?: number;
    state: Pick<HandRepairState, "strokes" | "brushSize" | "personType" | "outputNum">;
    /** 导出后的蒙版 dataUrl；只取内容摘要，不把字节写进快照。 */
    maskDataUrl?: string;
    draftRevision?: number | string | null;
    clientOperationId?: string;
};

export function buildHandRepairSnapshot(input: HandRepairSnapshotInput): HandRepairSnapshot {
    return {
        toolId: HAND_REPAIR_TOOL_ID,
        imageAssetId: input.imageAssetId ?? "",
        imageName: input.imageName ?? "",
        imageWidth: input.imageWidth ?? 0,
        imageHeight: input.imageHeight ?? 0,
        maskHash: computeMaskHash({ strokes: input.state.strokes, feather: 0, autoExpand: false, inverted: false }, input.maskDataUrl),
        maskCoverage: handRepairCoverage(input.state),
        strokeCount: input.state.strokes.length,
        brushSize: clampHandRepairBrush(input.state.brushSize),
        personType: resolveHandRepairPersonType(input.state.personType),
        outputNum: normalizeHandRepairOutputNum(input.state.outputNum),
        draftRevision: input.draftRevision ?? null,
        clientOperationId: input.clientOperationId ?? "pending",
    };
}

export function handRepairSnapshotHash(snapshot: HandRepairSnapshot): string {
    return computeSnapshotHash(snapshot);
}

/** 当前输入与提交快照不同 → 结果标记「来自旧版本」，不冒充当前配置的结果。 */
export function isHandRepairSnapshotStale(snapshot: HandRepairSnapshot | null, current: HandRepairSnapshot | null): boolean {
    if (!snapshot || !current) return false;
    return handRepairSnapshotHash(snapshot) !== handRepairSnapshotHash(current);
}

/* ------------------------------------------------------------------ *
 * 草稿
 * ------------------------------------------------------------------ */

export type HandRepairDraftValues = {
    state: HandRepairState;
    imageName: string;
};

function parseHandRepairStrokes(raw: unknown): MaskStroke[] {
    if (!Array.isArray(raw)) return [];
    const strokes: MaskStroke[] = [];
    for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        const points = Array.isArray(record.points) ? record.points : [];
        const parsed = points
            .map((point) => {
                if (!point || typeof point !== "object") return null;
                const p = point as Record<string, unknown>;
                return typeof p.x === "number" && typeof p.y === "number" ? normalizePoint({ x: p.x, y: p.y }) : null;
            })
            .filter((point): point is MaskPoint => point !== null);
        if (parsed.length === 0) continue;
        strokes.push({
            id: typeof record.id === "string" ? record.id : `stroke-${strokes.length}`,
            tool: record.tool === "eraser" ? "eraser" : "brush",
            size: clampHandRepairBrush(record.size),
            points: parsed,
        });
    }
    return strokes;
}

export function parseHandRepairDraftValues(values: Record<string, unknown>): HandRepairDraftValues {
    return {
        state: createHandRepairState({
            strokes: parseHandRepairStrokes(values.strokes),
            brushSize: clampHandRepairBrush(values.brushSize),
            personType: resolveHandRepairPersonType(values.personType),
            outputNum: normalizeHandRepairOutputNum(values.outputNum),
        }),
        imageName: typeof values.imageName === "string" ? values.imageName : "",
    };
}

export function serializeHandRepairDraftValues(draft: HandRepairDraftValues): Record<string, unknown> {
    return {
        strokes: draft.state.strokes,
        brushSize: clampHandRepairBrush(draft.state.brushSize),
        personType: resolveHandRepairPersonType(draft.state.personType),
        outputNum: normalizeHandRepairOutputNum(draft.state.outputNum),
        imageName: draft.imageName,
    };
}

/* ------------------------------------------------------------------ *
 * 指令与字段落点
 * ------------------------------------------------------------------ */

/**
 * 本页没有提示词输入框（规格 §2）。指令由人物类型 + 覆盖率确定，保证同一快照 → 同一 prompt，
 * 幂等指纹才稳定（task-machine 的 computeFingerprint 会包含 prompt）。
 */
export function composeHandRepairInstruction(snapshot: Pick<HandRepairSnapshot, "personType">): string {
    const option = handRepairPersonTypeOption(snapshot.personType);
    return [
        `Repair the hand anatomy inside the white mask region and keep everything else pixel-identical.`,
        `Reconstruct correct finger count, joints and proportions for ${option.instruction}.`,
        `Match the existing skin tone, lighting, perspective and image resolution; do not restyle, recolor or crop the photo.`,
    ].join(" ");
}

/**
 * ToolSpec 五个字段的落点（缺一即拒发）：
 *  - imageName：上传后的展示名（可编辑）
 *  - imageUrl：源图（第 1 张参考图）
 *  - maskUrl：画布导出的同尺寸蒙版 PNG（第 2 张参考图）
 *  - personType：人物类型（结构约束，随快照保存）
 *  - outputNum：生成张数（1–4）
 */
export function composeHandRepairFields(
    snapshot: HandRepairSnapshot,
    urls: { imageUrl: string; maskUrl: string },
): Record<string, unknown> {
    return {
        imageName: snapshot.imageName,
        imageUrl: urls.imageUrl,
        maskUrl: urls.maskUrl,
        personType: snapshot.personType,
        outputNum: snapshot.outputNum,
        maskHash: snapshot.maskHash,
        maskCoverage: snapshot.maskCoverage,
        strokeCount: snapshot.strokeCount,
        brushSize: snapshot.brushSize,
        draftRevision: snapshot.draftRevision,
        clientOperationId: snapshot.clientOperationId,
    };
}

/** 下载文件名：带上原图名，避免一串 hash。 */
export function handRepairDownloadName(imageName: string, index = 1): string {
    const base = (imageName || "hand-repair").replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60);
    const suffix = index > 1 ? `-${index}` : "";
    return `${base || "hand-repair"}-hand-fixed${suffix}.png`;
}

export function handRepairOutputLabel(outputNum: number): string {
    const n = normalizeHandRepairOutputNum(outputNum);
    return `预计输出 ${n} 张`;
}
