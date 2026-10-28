/**
 * TASK-020：PRINTING_REPAIR「印花修复」页面契约 + 纯逻辑（无 React / 无网络）。
 *
 * 事实来源：
 *  - docs/V1.0/plan_linkfox_navigation/page-specs/13-printing-repair.md
 *  - docs/V1.0/plan_linkfox_navigation/registry#PRINTING_REPAIR（makeType 29, layout repair）
 *  - 原站 https://www.linkfox.com/draw/printing-repair 的 workspace DOM 证据（page-specs §9 文案摘录）
 *
 * 本页与 AREA_REPAIR / REMOVE_PEN 的区别（同为 repair/mask 家族，但契约不同）：
 *  - 本页是「三步式换印花」：Step1 上传印花有误的商品图 → Step2 上传正确印花 → Step3 在画布上
 *    定位/缩放/旋转印花层，最后一次性提交真实图像编辑请求。没有涂抹蒙版、没有重绘描述。
 *  - 只有第 2 步的正确印花层可以被移动/缩放/旋转（规格 §3）；底图永远是锁定层。
 *  - 重新上传第 1 步（底图）会清空全部步骤；重新上传第 2 步（印花）保留底图但重置变换。
 *
 * 真实边界：印花分割图（stampingFlowerSegUrl）由适配器在本机对第 2 张图做真实像素分析导出，
 * 变换参数（point/rotate/scale）来自画布真实指针/键盘操作，本文件不产生任何“演示结果”。
 */

import { getToolById } from "./index";
import { computeSnapshotHash } from "./area-repair";
import type { ToolSpec } from "../types";

export const PRINTING_REPAIR_TOOL_ID = "PRINTING_REPAIR";
export const PRINTING_REPAIR_SLUG = "printing-repair";
export const PRINTING_REPAIR_ROUTE = "/tools/smart-edit/printing-repair";
export const PRINTING_REPAIR_LAYOUT = "repair" as const;
/** 草稿键与共享约定一致：`tool-draft:v1:<toolId>`（规格 §7）。 */
export const PRINTING_REPAIR_DRAFT_KEY = `tool-draft:v1:${PRINTING_REPAIR_TOOL_ID}`;

/**
 * 两个上传各自的限制（规格 §2「两个上传分别 20M 内」）。
 *
 * 注意：原站实测文案写的是「10M以内」（page-specs §9），而 §2 的控件要求是 20M。
 * 本实现按 §2 的 20M 做校验，界面文案同步显示 20M，避免“提示 10M 但实际放行 20M”的错位；
 * 差异已记录在 reports/TASK-020-report.md 的「未完成或风险」。
 */
export const PRINTING_REPAIR_UPLOAD_LIMITS = {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
    maxBytes: 20 * 1024 * 1024,
    minSide: 32,
    maxSide: 8192,
};

export const PRINTING_REPAIR_UPLOAD_LABEL = "20M以内，jpg/jpeg/png/webp";

/** 三步工作区（规格 §1 / §9 文案）。第 3 步完成前不开放画布。 */
export const PRINTING_REPAIR_STEPS = [
    { id: "wrong-print", title: "消除错误印花", hint: "拖拽 或 点击上传 需要修复的图" },
    { id: "correct-print", title: "导入正确印花", hint: "拖拽 或 点击上传 印花参考" },
    { id: "place-print", title: "调整印花位置", hint: "在画布中调整印花位置，调整完成点击【开始生成】，即可完成修复" },
] as const;

export type PrintingRepairStepId = (typeof PRINTING_REPAIR_STEPS)[number]["id"];

/* ------------------------------------------------------------------ *
 * 控件刻度
 * ------------------------------------------------------------------ */

/** 修复强度：0 = 只贴不融合（保留底图纹理），100 = 完全按印花覆盖。 */
export const PRINTING_REPAIR_STRENGTH = { min: 0, max: 100, step: 5, defaultValue: 70 } as const;
export const PRINTING_REPAIR_ROTATE = { min: -180, max: 180, step: 1, defaultValue: 0 } as const;
/** scale = 1 表示「印花等比完整放入底图画布」的基准尺寸。 */
export const PRINTING_REPAIR_SCALE = { min: 0.05, max: 4, step: 0.01, defaultValue: 1 } as const;
export const PRINTING_REPAIR_SCALE_PRESETS = [0.25, 0.5, 0.75, 1] as const;
export const PRINTING_REPAIR_ROTATE_PRESETS = [-90, -15, 15, 90] as const;

/** 画布键盘微调：方向键 4px / Shift 20px；[ ] 旋转 5°/15°；+ - 缩放 5%/15%。 */
export const PRINTING_REPAIR_KEY_STEP = { move: 4, moveFast: 20, rotate: 5, rotateFast: 15, scale: 0.05, scaleFast: 0.15 } as const;

/** 变换撤销栈上限（与画布工具的 50 步一致）。 */
export const PRINTING_REPAIR_HISTORY_LIMIT = 50;

export const PRINTING_REPAIR_VERSION_OPTIONS = [
    { id: "v1", label: "标准（结构优先）" },
    { id: "v2", label: "精细（纹理优先）" },
] as const;

export type PrintingRepairVersion = (typeof PRINTING_REPAIR_VERSION_OPTIONS)[number]["id"];
export const PRINTING_REPAIR_DEFAULT_VERSION: PrintingRepairVersion = "v1";

/** 对比模式：规格 §4「检查贴合」+ 任务要求「局部对比」。 */
export const PRINTING_REPAIR_COMPARE_MODES = [
    { id: "region", label: "局部对比" },
    { id: "side-by-side", label: "并排对比" },
    { id: "slider", label: "滑动对比" },
] as const;

export type PrintingRepairCompareMode = (typeof PRINTING_REPAIR_COMPARE_MODES)[number]["id"];

/** 局部对比的放大倍数候选。 */
export const PRINTING_REPAIR_ZOOM_LEVELS = [2, 3, 4] as const;

/* ------------------------------------------------------------------ *
 * 变换模型
 * ------------------------------------------------------------------ */

export type PrintingRepairPoint = { x: number; y: number };
export type PrintingRepairSize = { width: number; height: number };

/**
 * 印花层变换：
 *  - point：印花中心在底图画布中的归一化坐标（0–1，与导出分辨率无关）；
 *  - scale：相对「等比完整放入底图」基准的倍数（1 = 100%）；
 *  - rotate：顺时针角度（-180–180）。
 */
export type PrintingRepairTransform = {
    point: PrintingRepairPoint;
    scale: number;
    rotate: number;
};

export type PrintingRepairRect = { x: number; y: number; width: number; height: number };

export function clampPoint(point: PrintingRepairPoint): PrintingRepairPoint {
    const x = Number.isFinite(point.x) ? Math.min(1, Math.max(0, point.x)) : 0.5;
    const y = Number.isFinite(point.y) ? Math.min(1, Math.max(0, point.y)) : 0.5;
    return { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 };
}

export function clampScale(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return PRINTING_REPAIR_SCALE.defaultValue;
    return Math.min(PRINTING_REPAIR_SCALE.max, Math.max(PRINTING_REPAIR_SCALE.min, Math.round(num * 1000) / 1000));
}

/** 角度归一到 (-180, 180]，撤销后仍能逐字节还原。 */
export function clampRotate(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return PRINTING_REPAIR_ROTATE.defaultValue;
    let angle = Math.round(num * 100) / 100;
    angle %= 360;
    if (angle > 180) angle -= 360;
    if (angle <= -180) angle += 360;
    return angle;
}

export function clampStrength(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return PRINTING_REPAIR_STRENGTH.defaultValue;
    return Math.min(PRINTING_REPAIR_STRENGTH.max, Math.max(PRINTING_REPAIR_STRENGTH.min, Math.round(num)));
}

export function createPrintingRepairTransform(overrides: Partial<PrintingRepairTransform> = {}): PrintingRepairTransform {
    return {
        point: clampPoint(overrides.point ?? { x: 0.5, y: 0.5 }),
        scale: clampScale(overrides.scale ?? PRINTING_REPAIR_SCALE.defaultValue),
        rotate: clampRotate(overrides.rotate ?? PRINTING_REPAIR_ROTATE.defaultValue),
    };
}

/** 100% 基准：印花等比完整放入底图画布时的缩放倍数。 */
export function printFitScale(print: PrintingRepairSize, base: PrintingRepairSize): number {
    if (!print.width || !print.height || !base.width || !base.height) return 1;
    return Math.min(base.width / print.width, base.height / print.height);
}

/** 印花层在底图坐标系里的像素尺寸（含 scale）。 */
export function printLayerSize(transform: PrintingRepairTransform, print: PrintingRepairSize, base: PrintingRepairSize): PrintingRepairSize {
    const fit = printFitScale(print, base);
    const factor = fit * clampScale(transform.scale);
    return { width: print.width * factor, height: print.height * factor };
}

/** 印花层在底图像素坐标里的矩形（未旋转，中心对齐 point）。 */
export function printLayerRect(transform: PrintingRepairTransform, print: PrintingRepairSize, base: PrintingRepairSize): PrintingRepairRect {
    const size = printLayerSize(transform, print, base);
    const center = clampPoint(transform.point);
    return {
        x: center.x * base.width - size.width / 2,
        y: center.y * base.height - size.height / 2,
        width: size.width,
        height: size.height,
    };
}

/** 旋转后的四个角（用于“是否贴合/是否出界”的判定与预览热点）。 */
export function printLayerCorners(transform: PrintingRepairTransform, print: PrintingRepairSize, base: PrintingRepairSize): PrintingRepairPoint[] {
    const rect = printLayerRect(transform, print, base);
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const rad = (clampRotate(transform.rotate) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return [
        { x: -rect.width / 2, y: -rect.height / 2 },
        { x: rect.width / 2, y: -rect.height / 2 },
        { x: rect.width / 2, y: rect.height / 2 },
        { x: -rect.width / 2, y: rect.height / 2 },
    ].map((corner) => ({ x: cx + corner.x * cos - corner.y * sin, y: cy + corner.x * sin + corner.y * cos }));
}

/** 印花层与底图的交叠比例（0–1）：=100% 时印花完全落在底图内。 */
export function printCoverage(transform: PrintingRepairTransform, print: PrintingRepairSize, base: PrintingRepairSize): number {
    if (!base.width || !base.height) return 0;
    const corners = printLayerCorners(transform, print, base);
    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);
    const left = Math.max(0, Math.min(...xs));
    const right = Math.min(base.width, Math.max(...xs));
    const top = Math.max(0, Math.min(...ys));
    const bottom = Math.min(base.height, Math.max(...ys));
    if (right <= left || bottom <= top) return 0;
    const printArea = Math.abs((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)));
    if (!printArea) return 0;
    return Math.min(1, ((right - left) * (bottom - top)) / printArea);
}

/** 拖动：像素位移换算为归一化位移（画布与导出分辨率解耦）。 */
export function movePrint(transform: PrintingRepairTransform, delta: { dx: number; dy: number }, base: PrintingRepairSize): PrintingRepairTransform {
    const width = Math.max(1, base.width);
    const height = Math.max(1, base.height);
    return createPrintingRepairTransform({
        ...transform,
        point: { x: transform.point.x + delta.dx / width, y: transform.point.y + delta.dy / height },
    });
}

export function scalePrint(transform: PrintingRepairTransform, nextScale: number): PrintingRepairTransform {
    return createPrintingRepairTransform({ ...transform, scale: nextScale });
}

export function rotatePrint(transform: PrintingRepairTransform, nextRotate: number): PrintingRepairTransform {
    return createPrintingRepairTransform({ ...transform, rotate: nextRotate });
}

/** 键盘方向键微调（4px / Shift 20px），返回新变换而不是原地修改。 */
export function nudgePrint(transform: PrintingRepairTransform, direction: "left" | "right" | "up" | "down", base: PrintingRepairSize, fast = false): PrintingRepairTransform {
    const step = fast ? PRINTING_REPAIR_KEY_STEP.moveFast : PRINTING_REPAIR_KEY_STEP.move;
    const delta = {
        left: { dx: -step, dy: 0 },
        right: { dx: step, dy: 0 },
        up: { dx: 0, dy: -step },
        down: { dx: 0, dy: step },
    }[direction];
    return movePrint(transform, delta, base);
}

/** 键盘 +/- 缩放：每次 ±5%（Shift ±15%）。 */
export function stepPrintScale(transform: PrintingRepairTransform, direction: "in" | "out", fast = false): PrintingRepairTransform {
    const step = fast ? PRINTING_REPAIR_KEY_STEP.scaleFast : PRINTING_REPAIR_KEY_STEP.scale;
    return scalePrint(transform, transform.scale + (direction === "in" ? step : -step));
}

/** 键盘 [ ] 旋转：每次 ±5°（Shift ±15°）。 */
export function stepPrintRotate(transform: PrintingRepairTransform, direction: "ccw" | "cw", fast = false): PrintingRepairTransform {
    const step = fast ? PRINTING_REPAIR_KEY_STEP.rotateFast : PRINTING_REPAIR_KEY_STEP.rotate;
    return rotatePrint(transform, transform.rotate + (direction === "cw" ? step : -step));
}

/* ------------------------------------------------------------------ *
 * 撤销 / 重做（只有印花层变换进栈，底图与印花上传不进栈）
 * ------------------------------------------------------------------ */

export type PrintingRepairHistory = {
    past: PrintingRepairTransform[];
    present: PrintingRepairTransform;
    future: PrintingRepairTransform[];
};

export function createPrintTransformHistory(present: PrintingRepairTransform = createPrintingRepairTransform()): PrintingRepairHistory {
    return { past: [], present, future: [] };
}

export function commitPrintTransform(history: PrintingRepairHistory, next: PrintingRepairTransform): PrintingRepairHistory {
    const normalized = createPrintingRepairTransform(next);
    if (printTransformSignature(normalized) === printTransformSignature(history.present)) return history;
    const past = [...history.past, history.present].slice(-PRINTING_REPAIR_HISTORY_LIMIT);
    return { past, present: normalized, future: [] };
}

export function undoPrintTransform(history: PrintingRepairHistory): PrintingRepairHistory {
    if (history.past.length === 0) return history;
    const past = history.past.slice(0, -1);
    const present = history.past[history.past.length - 1];
    return { past, present, future: [history.present, ...history.future].slice(0, PRINTING_REPAIR_HISTORY_LIMIT) };
}

export function redoPrintTransform(history: PrintingRepairHistory): PrintingRepairHistory {
    if (history.future.length === 0) return history;
    const [present, ...future] = history.future;
    return { past: [...history.past, history.present].slice(-PRINTING_REPAIR_HISTORY_LIMIT), present, future };
}

export function resetPrintTransform(history: PrintingRepairHistory): PrintingRepairHistory {
    return commitPrintTransform(history, createPrintingRepairTransform());
}

export function canUndoPrintTransform(history: PrintingRepairHistory): boolean {
    return history.past.length > 0;
}

export function canRedoPrintTransform(history: PrintingRepairHistory): boolean {
    return history.future.length > 0;
}

export function printHistoryLabel(history: PrintingRepairHistory): string {
    return `撤销 ${history.past.length} / 重做 ${history.future.length}`;
}

export function printTransformSignature(transform: PrintingRepairTransform): string {
    const point = clampPoint(transform.point);
    return `${point.x.toFixed(4)},${point.y.toFixed(4)}|${clampScale(transform.scale).toFixed(3)}|${clampRotate(transform.rotate).toFixed(2)}`;
}

export function describePrintTransform(transform: PrintingRepairTransform): string {
    const point = clampPoint(transform.point);
    return `位置 ${(point.x * 100).toFixed(1)}% / ${(point.y * 100).toFixed(1)}% · 缩放 ${(clampScale(transform.scale) * 100).toFixed(0)}% · 旋转 ${clampRotate(transform.rotate).toFixed(0)}°`;
}

/* ------------------------------------------------------------------ *
 * 校验
 * ------------------------------------------------------------------ */

export type PrintingRepairIssue = {
    field: "base" | "print" | "seg" | "placement" | "strength" | "file";
    message: string;
};

export type PrintingRepairFileInfo = { name?: string; mimeType?: string; bytes?: number; width?: number; height?: number };

/** 上传失败在控件旁说明（规格 §5）：格式/大小/尺寸逐项给出原因。 */
export function validatePrintingRepairFile(file: PrintingRepairFileInfo, slot: "base" | "print" = "base"): PrintingRepairIssue[] {
    const issues: PrintingRepairIssue[] = [];
    const limits = PRINTING_REPAIR_UPLOAD_LIMITS;
    const label = slot === "base" ? "需要修复的图" : "印花参考";
    if (file.mimeType && !(limits.mimeTypes as readonly string[]).includes(file.mimeType)) {
        issues.push({ field: "file", message: `${label}只支持 ${limits.mimeTypes.join(" / ")}，当前是 ${file.mimeType}` });
    }
    if (typeof file.bytes === "number" && file.bytes > limits.maxBytes) {
        issues.push({ field: "file", message: `${label}不能超过 ${Math.round(limits.maxBytes / 1024 / 1024)}MB，当前 ${(file.bytes / 1024 / 1024).toFixed(1)}MB` });
    }
    if (file.width && file.height) {
        const longSide = Math.max(file.width, file.height);
        const shortSide = Math.min(file.width, file.height);
        if (longSide > limits.maxSide) issues.push({ field: "file", message: `${label}长边不能超过 ${limits.maxSide}px，当前 ${longSide}px` });
        if (shortSide < limits.minSide) issues.push({ field: "file", message: `${label}短边不能小于 ${limits.minSide}px，当前 ${shortSide}px` });
    }
    return issues;
}

export type PrintingRepairInputState = {
    baseUrl: string;
    printUrl: string;
    segUrl: string;
    transform: PrintingRepairTransform;
    base?: PrintingRepairSize;
    print?: PrintingRepairSize;
    strength: number;
};

/**
 * 提交前校验（规格 §7）：底图 / 印花 / 分割图 / 定位参数必须在提交前齐备，
 * 印花必须与底图有交叠，否则提交等于凭空生成，直接拦下。
 */
export function validatePrintingRepairInput(state: PrintingRepairInputState): PrintingRepairIssue[] {
    const issues: PrintingRepairIssue[] = [];
    if (!state.baseUrl?.trim()) issues.push({ field: "base", message: "请先上传印花有误的图片（Step 1）" });
    if (!state.printUrl?.trim()) issues.push({ field: "print", message: "请先上传正确的印花参考（Step 2）" });
    if (!state.segUrl?.trim()) issues.push({ field: "seg", message: "印花分割图尚未生成，请重新上传印花参考" });
    const strength = clampStrength(state.strength);
    if (strength < PRINTING_REPAIR_STRENGTH.min || strength > PRINTING_REPAIR_STRENGTH.max) {
        issues.push({ field: "strength", message: `修复强度必须在 ${PRINTING_REPAIR_STRENGTH.min}–${PRINTING_REPAIR_STRENGTH.max} 之间` });
    }
    if (state.base && state.print) {
        if (printCoverage(state.transform, state.print, state.base) <= 0) {
            issues.push({ field: "placement", message: "印花层完全落在底图之外，请先调整位置/缩放" });
        }
    }
    return issues;
}

/* ------------------------------------------------------------------ *
 * 快照（提交后锁定，不被后续编辑改写）
 * ------------------------------------------------------------------ */

export type PrintingRepairSnapshot = {
    toolId: typeof PRINTING_REPAIR_TOOL_ID;
    baseAssetId: string;
    baseName: string;
    baseWidth: number;
    baseHeight: number;
    printAssetId: string;
    printName: string;
    printWidth: number;
    printHeight: number;
    point: PrintingRepairPoint;
    rotate: number;
    scale: number;
    strength: number;
    version: PrintingRepairVersion;
    /** 目标输出尺寸（registry 的 width/height 字段）。 */
    width: number;
    height: number;
    segHash: string;
    segCoverage: number;
    segWidth: number;
    segHeight: number;
    draftRevision: number | string | null;
    clientOperationId: string;
    model?: string;
};

export type PrintingRepairSnapshotInput = {
    baseAssetId?: string;
    baseName?: string;
    baseWidth?: number;
    baseHeight?: number;
    printAssetId?: string;
    printName?: string;
    printWidth?: number;
    printHeight?: number;
    transform: PrintingRepairTransform;
    strength: number;
    version?: PrintingRepairVersion;
    /** 目标输出尺寸；缺省等于底图尺寸。 */
    output?: Partial<PrintingRepairSize>;
    /** 本机导出的印花分割图（dataUrl 只取摘要，不把字节写进快照）。 */
    segDataUrl?: string;
    segCoverage?: number;
    segWidth?: number;
    segHeight?: number;
    draftRevision?: number | string | null;
    clientOperationId: string;
    model?: string;
};

export function buildPrintingRepairSnapshot(input: PrintingRepairSnapshotInput): PrintingRepairSnapshot {
    const baseWidth = Math.max(0, Math.round(input.baseWidth ?? 0));
    const baseHeight = Math.max(0, Math.round(input.baseHeight ?? 0));
    const transform = createPrintingRepairTransform(input.transform);
    const width = Math.max(0, Math.round(input.output?.width ?? baseWidth));
    const height = Math.max(0, Math.round(input.output?.height ?? baseHeight));
    return {
        toolId: PRINTING_REPAIR_TOOL_ID,
        baseAssetId: input.baseAssetId ?? "",
        baseName: input.baseName ?? "",
        baseWidth,
        baseHeight,
        printAssetId: input.printAssetId ?? "",
        printName: input.printName ?? "",
        printWidth: Math.max(0, Math.round(input.printWidth ?? 0)),
        printHeight: Math.max(0, Math.round(input.printHeight ?? 0)),
        point: transform.point,
        rotate: transform.rotate,
        scale: transform.scale,
        strength: clampStrength(input.strength),
        version: input.version ?? PRINTING_REPAIR_DEFAULT_VERSION,
        width: width || baseWidth,
        height: height || baseHeight,
        segHash: computeSnapshotHash({ seg: input.segDataUrl ?? null }),
        segCoverage: Math.min(1, Math.max(0, input.segCoverage ?? 0)),
        segWidth: Math.max(0, Math.round(input.segWidth ?? 0)),
        segHeight: Math.max(0, Math.round(input.segHeight ?? 0)),
        draftRevision: input.draftRevision ?? null,
        clientOperationId: input.clientOperationId,
        model: input.model,
    };
}

/** 快照指纹：只包含会影响产出的输入，编辑后与提交时的指纹不一致即“来自旧版本”。 */
export function printingRepairSnapshotHash(snapshot: PrintingRepairSnapshot): string {
    return computeSnapshotHash({
        toolId: snapshot.toolId,
        baseAssetId: snapshot.baseAssetId,
        baseWidth: snapshot.baseWidth,
        baseHeight: snapshot.baseHeight,
        printAssetId: snapshot.printAssetId,
        printWidth: snapshot.printWidth,
        printHeight: snapshot.printHeight,
        point: snapshot.point,
        rotate: snapshot.rotate,
        scale: snapshot.scale,
        strength: snapshot.strength,
        version: snapshot.version,
        width: snapshot.width,
        height: snapshot.height,
        segHash: snapshot.segHash,
    });
}

export function isPrintingRepairSnapshotStale(previous: PrintingRepairSnapshot | null, current: PrintingRepairSnapshot | null): boolean {
    if (!previous || !current) return false;
    return printingRepairSnapshotHash(previous) !== printingRepairSnapshotHash(current);
}

/* ------------------------------------------------------------------ *
 * 提交载荷（registry 13 个字段全部有落点）
 * ------------------------------------------------------------------ */

/**
 * 每个 ToolSpec 字段在本页的落点。`output` 表示由任务结果回填（imageResultUrl），
 * 其余字段都必须在提交时真实出现在请求里 —— 缺一个就拒发（见 adapters/printing-repair.ts）。
 */
export type PrintingRepairFieldBinding = { field: string; kind: "input" | "output"; control: string };

export const PRINTING_REPAIR_FIELD_BINDINGS: readonly PrintingRepairFieldBinding[] = [
    { field: "config", kind: "input", control: "strength/version 生成的结构化配置" },
    { field: "height", kind: "input", control: "number（输出高度）" },
    { field: "imageResultUrl", kind: "output", control: "任务成功后由结果资产回填" },
    { field: "imageUrl", kind: "input", control: "upload（Step 1 底图）" },
    { field: "point", kind: "input", control: "画布拖拽/方向键产生的归一化中心" },
    { field: "rotate", kind: "input", control: "旋转控件/手势" },
    { field: "scale", kind: "input", control: "缩放控件/手势" },
    { field: "stampingFlowerSegUrl", kind: "input", control: "本机印花分割导出 PNG" },
    { field: "stampingFlowerUrl", kind: "input", control: "upload（Step 2 印花参考）" },
    { field: "targetConfig", kind: "input", control: "画布位置/尺寸/角度结构" },
    { field: "url", kind: "input", control: "底图来源地址（上传后写入）" },
    { field: "version", kind: "input", control: "select（修复版本）" },
    { field: "width", kind: "input", control: "number（输出宽度）" },
] as const;

/** 服务端按同一 schema 再校验时用的输入字段清单（输出字段除外）。 */
export const PRINTING_REPAIR_REQUIRED_FIELDS = PRINTING_REPAIR_FIELD_BINDINGS.filter((binding) => binding.kind === "input").map((binding) => binding.field);

/** registry 的字段集合与本页落点的差集：非空即表示“静默丢参”，测试会断言为空。 */
export function missingPrintingRepairFieldBindings(specFields: readonly string[]): { unbound: string[]; extra: string[] } {
    const bound = new Set(PRINTING_REPAIR_FIELD_BINDINGS.map((binding) => binding.field));
    const spec = new Set(specFields);
    return {
        unbound: [...spec].filter((field) => !bound.has(field)).sort(),
        extra: [...bound].filter((field) => !spec.has(field)).sort(),
    };
}

export function printingRepairConfig(snapshot: PrintingRepairSnapshot): Record<string, unknown> {
    return {
        mode: "print-transfer",
        strength: snapshot.strength,
        rotate: snapshot.rotate,
        scale: snapshot.scale,
        version: snapshot.version,
        width: snapshot.width,
        height: snapshot.height,
    };
}

export function printingRepairTargetConfig(snapshot: PrintingRepairSnapshot): Record<string, unknown> {
    return {
        point: { x: snapshot.point.x, y: snapshot.point.y },
        rotate: snapshot.rotate,
        scale: snapshot.scale,
        canvas: { width: snapshot.baseWidth, height: snapshot.baseHeight },
        print: { width: snapshot.printWidth, height: snapshot.printHeight },
        strength: snapshot.strength,
    };
}

/** 提交到真实图像编辑接口的指令（与快照绑定，随强度变化）。 */
export function printingRepairInstruction(snapshot: Pick<PrintingRepairSnapshot, "strength" | "rotate" | "scale" | "point">): string {
    const strength = clampStrength(snapshot.strength);
    const strengthLine =
        strength >= 90
            ? "覆盖强度：极高，按印花参考完全替换原有印花（保留材质褶皱与光照）。"
            : strength >= 60
              ? "覆盖强度：高，印花参考为主体，保留商品表面的褶皱、光影与透视。"
              : strength >= 30
                ? "覆盖强度：中，印花与商品原有明暗融合，允许底层纹理透出。"
                : "覆盖强度：低，仅轻微叠印，商品原有表面细节保持主导。";
    return [
        "印花修复：参考图 1 是印花有误的商品图（底图，必须保留商品形状、褶皱、光影、透视与文字），参考图 2 是正确印花。",
        `将参考图 2 的印花贴合到参考图 1 的指定位置：中心点 (${(snapshot.point.x * 100).toFixed(1)}%, ${(snapshot.point.y * 100).toFixed(1)}%)，缩放 ${(clampScale(snapshot.scale) * 100).toFixed(0)}%，旋转 ${clampRotate(snapshot.rotate).toFixed(0)}°。`,
        "先移除底图原有的错误印花（按周围布料自然补全），再按上述位置/角度/比例贴上正确印花，边缘贴合、不开裂、不重复。",
        strengthLine,
        "不要改变商品外形、画幅、背景与镜头；不要新增物体、文字或水印；输出分辨率与底图一致。",
    ].join("\n");
}

export function composePrintingRepairFields(
    snapshot: PrintingRepairSnapshot,
    urls: { imageUrl: string; stampingFlowerUrl: string; stampingFlowerSegUrl: string; url?: string },
): Record<string, unknown> {
    return {
        imageUrl: urls.imageUrl,
        stampingFlowerUrl: urls.stampingFlowerUrl,
        stampingFlowerSegUrl: urls.stampingFlowerSegUrl,
        url: urls.url ?? urls.imageUrl,
        point: { x: snapshot.point.x, y: snapshot.point.y },
        rotate: snapshot.rotate,
        scale: snapshot.scale,
        config: printingRepairConfig(snapshot),
        targetConfig: printingRepairTargetConfig(snapshot),
        width: snapshot.width,
        height: snapshot.height,
        version: snapshot.version,
        draftRevision: snapshot.draftRevision,
        clientOperationId: snapshot.clientOperationId,
    };
}

/* ------------------------------------------------------------------ *
 * 局部对比
 * ------------------------------------------------------------------ */

export type PrintingRepairRegion = { x: number; y: number; width: number; height: number };

/** 以印花中心为中心的局部放大区域（归一化，含边界裁剪）。 */
export function compareRegion(transform: PrintingRepairTransform, zoom = PRINTING_REPAIR_ZOOM_LEVELS[1]): PrintingRepairRegion {
    const size = Math.round(Math.min(1, Math.max(1 / 8, 1 / Math.max(1, zoom))) * 10000) / 10000;
    const point = clampPoint(transform.point);
    const half = size / 2;
    const x = Math.min(1 - size, Math.max(0, point.x - half));
    const y = Math.min(1 - size, Math.max(0, point.y - half));
    return { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000, width: size, height: size };
}

/** 归一化区域 → 底图像素裁剪矩形（CSS 预览与导出共用同一套算法）。 */
export function regionCropRect(region: PrintingRepairRegion, base: PrintingRepairSize): PrintingRepairRect {
    return {
        x: Math.round(region.x * base.width),
        y: Math.round(region.y * base.height),
        width: Math.max(1, Math.round(region.width * base.width)),
        height: Math.max(1, Math.round(region.height * base.height)),
    };
}

export function clampCompareSplit(value: number): number {
    if (!Number.isFinite(value)) return 50;
    return Math.min(100, Math.max(0, Math.round(value)));
}

export function compareModeLabel(mode: PrintingRepairCompareMode): string {
    return PRINTING_REPAIR_COMPARE_MODES.find((item) => item.id === mode)?.label ?? "局部对比";
}

export function printingRepairDownloadName(baseName: string, index = 1): string {
    const base = (baseName || "printing-repair").replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60);
    const suffix = index > 1 ? `-${index}` : "";
    return `${base || "printing-repair"}-print-fixed${suffix}.png`;
}

/* ------------------------------------------------------------------ *
 * 草稿（刷新恢复）
 * ------------------------------------------------------------------ */

export type PrintingRepairDraftValues = {
    transform: PrintingRepairTransform;
    strength: number;
    version: PrintingRepairVersion;
    compareMode: PrintingRepairCompareMode;
    output: { width: number; height: number };
    baseName: string;
    printName: string;
};

export function parsePrintingRepairDraftValues(values: Record<string, unknown> = {}): PrintingRepairDraftValues {
    const transformInput = values.transform && typeof values.transform === "object" ? (values.transform as Record<string, unknown>) : {};
    const pointInput = transformInput.point && typeof transformInput.point === "object" ? (transformInput.point as Record<string, unknown>) : {};
    const outputInput = values.output && typeof values.output === "object" ? (values.output as Record<string, unknown>) : {};
    const version = PRINTING_REPAIR_VERSION_OPTIONS.some((option) => option.id === values.version) ? (values.version as PrintingRepairVersion) : PRINTING_REPAIR_DEFAULT_VERSION;
    const compareMode = PRINTING_REPAIR_COMPARE_MODES.some((mode) => mode.id === values.compareMode)
        ? (values.compareMode as PrintingRepairCompareMode)
        : "region";
    const width = Number(outputInput.width);
    const height = Number(outputInput.height);
    return {
        transform: createPrintingRepairTransform({
            point: { x: Number(pointInput.x), y: Number(pointInput.y) },
            scale: Number(transformInput.scale),
            rotate: Number(transformInput.rotate),
        }),
        strength: clampStrength(values.strength),
        version,
        compareMode,
        output: {
            width: Number.isFinite(width) ? Math.max(0, Math.round(width)) : 0,
            height: Number.isFinite(height) ? Math.max(0, Math.round(height)) : 0,
        },
        baseName: typeof values.baseName === "string" ? values.baseName : "",
        printName: typeof values.printName === "string" ? values.printName : "",
    };
}

export function serializePrintingRepairDraftValues(draft: PrintingRepairDraftValues): Record<string, unknown> {
    return {
        transform: { point: { x: draft.transform.point.x, y: draft.transform.point.y }, scale: draft.transform.scale, rotate: draft.transform.rotate },
        strength: draft.strength,
        version: draft.version,
        compareMode: draft.compareMode,
        output: { width: draft.output.width, height: draft.output.height },
        baseName: draft.baseName,
        printName: draft.printName,
    };
}

export function getPrintingRepairSpec(): ToolSpec | undefined {
    return getToolById(PRINTING_REPAIR_TOOL_ID);
}
