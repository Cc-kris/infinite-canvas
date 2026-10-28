/**
 * AREA_REPAIR 适配器：把「一张原图 + 一张蒙版 + 一段重绘描述」拆成可独立重试的最小真实请求单元，
 * 并提供真实 provider 运行端口（走共享 TaskGateway，不伪造结果）。
 *
 * 真实边界：
 *  - 每个单元 = 1 次真实图像编辑请求：参考图 1 原图、参考图 2 蒙版；
 *  - 蒙版由画布真实导出 PNG（黑底白区，支持橡皮擦/反选/羽化/自动扩边），像素即 provider 输入；
 *  - 上游返回空数组 → 该单元失败，绝不补造成功或占位图；
 *  - 结果携带 snapshotHash，输入一变即视为旧版本，不冒充当前结果。
 */

import { AREA_REPAIR_TOOL_ID, MASK_AUTO_EXPAND_PX, composeMaskFields } from "../registry/area-repair";
import type { AreaRepairSnapshot, MaskState } from "../registry/area-repair";
import type { BrowserToolInput, ProviderPort, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask } from "@/services/api/tools/task-machine";
import type { ReferenceImage } from "@/types/image";

/* ------------------------------------------------------------------ *
 * 提示词
 * ------------------------------------------------------------------ */

export type AreaRepairPromptInput = {
    prompt: string;
    autoExpand: boolean;
    inverted: boolean;
    index: number;
    total: number;
};

/** 把用户描述 + 蒙版语义写进一次真实编辑请求的提示词。 */
export function composeAreaRepairPrompt(input: AreaRepairPromptInput): string {
    const text = input.prompt.trim();
    const lines = [
        `局部重绘：${text}`,
        "参考图 1 是原图；参考图 2 是蒙版（白色 = 需要重绘的区域，黑色 = 必须保持原样）。",
        "只重绘蒙版白色区域内的内容；区域外的结构、颜色、文字和边缘不能改变；重绘内容要和周围自然衔接。",
        input.autoExpand ? `蒙版已按 ${MASK_AUTO_EXPAND_PX} 像素外扩，用于过渡新旧内容的接缝；外扩部分仍须贴合原图上下文。` : "蒙版未外扩，严格按白色边界重绘。",
        input.inverted ? "本次对蒙版执行过反选，白色区域即最终待重绘区域。" : "",
        input.total > 1 ? `这是同一输入的第 ${input.index}/${input.total} 张变体，请保持同一主体与场景。` : "",
    ];
    return lines.filter((line) => line.length > 0).join("\n");
}

/* ------------------------------------------------------------------ *
 * 蒙版画布导出（真实像素）
 * ------------------------------------------------------------------ */

export type MaskPaintContext = {
    fillStyle: string;
    strokeStyle: string;
    lineWidth: number;
    lineCap: string;
    lineJoin: string;
    filter: string;
    globalCompositeOperation: string;
    fillRect: (x: number, y: number, w: number, h: number) => void;
    beginPath: () => void;
    moveTo: (x: number, y: number) => void;
    lineTo: (x: number, y: number) => void;
    stroke: () => void;
    drawImage: (image: unknown, dx: number, dy: number, dw?: number, dh?: number) => void;
};

export type MaskCanvas = {
    width: number;
    height: number;
    getContext: (type: "2d") => MaskPaintContext | null;
    toDataURL?: (type?: string) => string;
    convertToBlob?: (options?: { type?: string }) => Promise<Blob>;
};

export type MaskRenderDeps = {
    /** 测试注入：仍需真实实现绘制；生产默认 document canvas / OffscreenCanvas。 */
    createCanvas?: (width: number, height: number) => MaskCanvas | null;
};

export type MaskRenderResult = {
    dataUrl: string;
    width: number;
    height: number;
    sourceWidth: number;
    sourceHeight: number;
    scale: number;
};

export class AreaRepairMaskError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
        super(message);
        this.name = "AreaRepairMaskError";
        this.code = code;
    }
}

/** 导出尺寸：最长边不超过 maxSide，等比缩放；蒙版与原图同比例。 */
export function maskRenderSize(width: number, height: number, maxSide = 2048): { width: number; height: number; scale: number } {
    const safeWidth = Math.max(1, Math.round(width));
    const safeHeight = Math.max(1, Math.round(height));
    const longest = Math.max(safeWidth, safeHeight);
    const scale = longest > maxSide ? maxSide / longest : 1;
    return {
        width: Math.max(1, Math.round(safeWidth * scale)),
        height: Math.max(1, Math.round(safeHeight * scale)),
        scale,
    };
}

function defaultCreateCanvas(width: number, height: number): MaskCanvas | null {
    if (typeof document !== "undefined") {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        return canvas as unknown as MaskCanvas;
    }
    const Offscreen = (globalThis as { OffscreenCanvas?: new (w: number, h: number) => MaskCanvas }).OffscreenCanvas;
    if (typeof Offscreen === "function") return new Offscreen(width, height);
    return null;
}

async function canvasToDataUrl(canvas: MaskCanvas): Promise<string> {
    if (typeof canvas.toDataURL === "function") {
        const url = canvas.toDataURL("image/png");
        if (!url || url === "data:,") {
            throw new AreaRepairMaskError("mask-export-failed", "蒙版导出为空，请重试或换浏览器");
        }
        return url;
    }
    if (typeof canvas.convertToBlob === "function") {
        const blob = await canvas.convertToBlob({ type: "image/png" });
        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.onerror = () => reject(new AreaRepairMaskError("mask-export-failed", "蒙版导出失败"));
            reader.readAsDataURL(blob);
        });
    }
    throw new AreaRepairMaskError("mask-export-unsupported", "当前画布不支持导出 PNG");
}

/**
 * 蒙版 PNG：白 = 待重绘区域，黑 = 保持原样。
 * 橡皮擦用背景色覆盖；反选用 difference 合成做像素取反；羽化用真实 blur 滤镜。
 */
export async function renderMaskPng(state: Pick<MaskState, "strokes" | "feather" | "inverted" | "autoExpand">, size: { width: number; height: number }, deps: MaskRenderDeps = {}): Promise<MaskRenderResult> {
    if (state.strokes.length === 0) {
        throw new AreaRepairMaskError("mask-empty", "蒙版为空，请先在图片上涂抹需要重绘的区域");
    }
    // 规格 §7 要求蒙版与原图同尺寸：maxSide 取原图长边 → scale 恒为 1，不做等比缩小。
    const maxSide = Math.max(1, Math.round(Math.max(size.width, size.height)));
    const target = maskRenderSize(size.width, size.height, maxSide);
    if (target.width * target.height > 40_000_000) {
        throw new AreaRepairMaskError("mask-too-large", `原图过大（${target.width}×${target.height}），蒙版需与原图同尺寸，请先压缩到 4000 万像素以内`);
    }
    const createCanvas = deps.createCanvas ?? defaultCreateCanvas;
    const canvas = createCanvas(target.width, target.height);
    if (!canvas) {
        throw new AreaRepairMaskError("canvas-unavailable", "当前环境没有 Canvas，无法导出蒙版；请在浏览器中打开本工具");
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new AreaRepairMaskError("canvas-unavailable", "无法获取 2D 画布上下文，蒙版没有导出");
    }

    const background = state.inverted ? "#ffffff" : "#000000";
    const paint = state.inverted ? "#000000" : "#ffffff";
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const expand = state.autoExpand ? MASK_AUTO_EXPAND_PX : 0;
    const scale = target.scale;
    for (const stroke of state.strokes) {
        ctx.strokeStyle = stroke.tool === "eraser" ? background : paint;
        ctx.lineWidth = Math.max(1, (stroke.size + expand * 2) * scale);
        const points = stroke.points;
        ctx.beginPath();
        ctx.moveTo(points[0].x * target.width, points[0].y * target.height);
        if (points.length === 1) {
            ctx.lineTo(points[0].x * target.width + 0.01, points[0].y * target.height);
        } else {
            for (let i = 1; i < points.length; i += 1) {
                ctx.lineTo(points[i].x * target.width, points[i].y * target.height);
            }
        }
        ctx.stroke();
    }

    // 反选：黑白互换（difference 合成对纯黑白即取反）。
    if (state.inverted) {
        ctx.globalCompositeOperation = "difference";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, target.width, target.height);
        ctx.globalCompositeOperation = "source-over";
    }

    let output: MaskCanvas = canvas;
    if (state.feather > 0) {
        const feathered = createCanvas(target.width, target.height);
        const fctx = feathered?.getContext("2d");
        if (!feathered || !fctx) {
            throw new AreaRepairMaskError("canvas-unavailable", "无法创建羽化画布，蒙版没有导出");
        }
        fctx.fillStyle = background;
        fctx.fillRect(0, 0, target.width, target.height);
        fctx.filter = `blur(${Math.max(1, state.feather * scale)}px)`;
        fctx.drawImage(canvas, 0, 0, target.width, target.height);
        fctx.filter = "none";
        output = feathered;
    }

    return {
        dataUrl: await canvasToDataUrl(output),
        width: target.width,
        height: target.height,
        sourceWidth: Math.max(1, Math.round(size.width)),
        sourceHeight: Math.max(1, Math.round(size.height)),
        scale: target.scale,
    };
}

/* ------------------------------------------------------------------ *
 * 请求单元
 * ------------------------------------------------------------------ */

export type AreaRepairUnit = {
    id: string;
    index: number;
    total: number;
    prompt: string;
    references: ReferenceImage[];
    /** 进入任务指纹与快照的显式字段，保证无静默丢参。 */
    fields: Record<string, unknown>;
    snapshotHash: string;
};

export type AreaRepairUnitInput = {
    snapshot: AreaRepairSnapshot;
    image: ReferenceImage;
    mask: ReferenceImage;
};

export function areaRepairUnitHash(snapshot: AreaRepairSnapshot): string {
    return `${snapshot.imageAssetId}:${snapshot.maskHash}:${snapshot.prompt}:${snapshot.outputNum}:${snapshot.autoExpand}:${snapshot.inverted}:${snapshot.feather}`;
}

export function areaRepairUnitId(snapshotHash: string, index: number): string {
    return `${AREA_REPAIR_TOOL_ID}:${snapshotHash}:${index}`;
}

/** 每个单元 = 同一原图 + 同一蒙版的一次独立重绘，数量由 outputNum 决定。 */
export function buildAreaRepairUnits(input: AreaRepairUnitInput): AreaRepairUnit[] {
    const total = input.snapshot.outputNum;
    const hash = areaRepairUnitHash(input.snapshot);
    return Array.from({ length: total }, (_, index) => ({
        id: areaRepairUnitId(hash, index + 1),
        index: index + 1,
        total,
        prompt: composeAreaRepairPrompt({
            prompt: input.snapshot.prompt,
            autoExpand: input.snapshot.autoExpand,
            inverted: input.snapshot.inverted,
            index: index + 1,
            total,
        }),
        references: [input.image, input.mask],
        fields: composeMaskFields(input.snapshot),
        snapshotHash: hash,
    }));
}

export function buildAreaRepairInput(unit: AreaRepairUnit): BrowserToolInput {
    return {
        toolId: AREA_REPAIR_TOOL_ID,
        prompt: unit.prompt,
        references: unit.references,
        count: 1,
        fields: unit.fields,
    };
}

export type AreaRepairFieldAudit = {
    toolId: string;
    specFields: readonly string[];
    represented: Record<string, boolean>;
    missing: string[];
    issues: string[];
};

/**
 * 字段守卫：ToolSpec 的每个字段都必须在单元里落到实处（字段值、参考图或导出蒙版）。
 * 缺失即进 issues，由调用方拒发，绝不静默丢参。
 */
export function auditAreaRepairFields(specFields: readonly string[], input: { snapshot: AreaRepairSnapshot; unit: AreaRepairUnit }): AreaRepairFieldAudit {
    const { snapshot, unit } = input;
    const hasImageRef = unit.references.length >= 1;
    const hasMaskRef = unit.references.length >= 2;
    const represented: Record<string, boolean> = {
        autoExpand: unit.fields.autoExpand === snapshot.autoExpand,
        imageName: Boolean(unit.fields.imageName) || snapshot.imageName.length === 0,
        imageUrl: hasImageRef,
        maskUrl: hasMaskRef,
        outputNum: unit.fields.outputNum === snapshot.outputNum && unit.total === snapshot.outputNum,
        prompt: unit.prompt.includes(snapshot.prompt) && snapshot.prompt.length > 0,
    };
    const missing = specFields.filter((field) => !(field in represented));
    const issues: string[] = [];
    for (const field of specFields) {
        if (field in represented && represented[field] === false) issues.push(`字段 ${field} 没有真正进入请求`);
    }
    if (missing.length > 0) issues.push(`适配器未覆盖字段：${missing.join(", ")}`);
    if (!hasMaskRef) issues.push("蒙版没有作为第二张参考图提交");
    return { toolId: AREA_REPAIR_TOOL_ID, specFields, represented, missing, issues };
}

export type AreaRepairUnitStatus = "pending" | "succeeded" | "failed" | "cancelled" | "unknown";

export type AreaRepairUnitOutcome = {
    unitId: string;
    index: number;
    total: number;
    status: AreaRepairUnitStatus;
    snapshotHash: string;
    taskId?: string;
    image?: { dataUrl?: string; url?: string; mimeType?: string };
    error?: { code: string; message: string; retryable?: boolean };
};

export function mapAreaRepairTaskToOutcome(unit: AreaRepairUnit, task: ToolTask): AreaRepairUnitOutcome {
    const base = {
        unitId: unit.id,
        index: unit.index,
        total: unit.total,
        snapshotHash: unit.snapshotHash,
        taskId: task.id,
    };
    const firstImage = task.result?.items.find((item) => item.kind === "image" && (item.dataUrl || item.url));
    if (task.status === "succeeded") {
        if (!firstImage) {
            return {
                ...base,
                status: "failed",
                error: { code: "empty-result", message: "上游返回成功但没有图片结果", retryable: true },
            };
        }
        return {
            ...base,
            status: "succeeded",
            image: { dataUrl: firstImage.dataUrl, url: firstImage.url, mimeType: firstImage.mimeType },
        };
    }
    if (task.status === "failed") {
        return {
            ...base,
            status: "failed",
            error: task.error ? { code: task.error.code, message: task.error.message, retryable: task.error.retryable } : { code: "task-failed", message: "任务失败（上游未给出原因）", retryable: true },
        };
    }
    if (task.status === "cancelled") {
        return { ...base, status: "cancelled", error: { code: "cancelled", message: "任务已取消", retryable: false } };
    }
    return {
        ...base,
        status: "unknown",
        error: { code: `task-${task.status}`, message: "任务状态未知，只能查询或人工确认", retryable: true },
    };
}

/** 真实运行端口：默认走共享任务网关（useToolTaskStore.runTool）。 */
export interface AreaRepairRunPort {
    run(input: BrowserToolInput, options?: WaitOptions): Promise<ToolTask>;
}

export function createAreaRepairRunPort(): AreaRepairRunPort {
    return {
        async run(input, options) {
            const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
            return useToolTaskStore.getState().runTool(input, options);
        },
    };
}

export type RunAreaRepairOptions = {
    port: AreaRepairRunPort;
    concurrency?: number;
    signal?: AbortSignal;
    onOutcome?: (outcome: AreaRepairUnitOutcome, unit: AreaRepairUnit, completed: number, total: number) => void;
};

/** 并发跑完所有单元；单单元失败不影响其它单元，取消后剩余单元标 cancelled。 */
export async function runAreaRepairUnits(units: AreaRepairUnit[], options: RunAreaRepairOptions): Promise<AreaRepairUnitOutcome[]> {
    const concurrency = Math.max(1, Math.min(4, Math.floor(options.concurrency ?? 2)));
    const outcomes: AreaRepairUnitOutcome[] = new Array(units.length);
    let cursor = 0;
    let completed = 0;
    let cancelled = false;

    const worker = async () => {
        for (;;) {
            const index = cursor;
            cursor += 1;
            if (index >= units.length) return;
            const unit = units[index];
            if (cancelled || options.signal?.aborted) {
                outcomes[index] = {
                    unitId: unit.id,
                    index: unit.index,
                    total: unit.total,
                    status: "cancelled",
                    snapshotHash: unit.snapshotHash,
                    error: { code: "cancelled", message: "已取消，该单元没有提交", retryable: false },
                };
                continue;
            }
            try {
                const task = await options.port.run(buildAreaRepairInput(unit), { signal: options.signal });
                const outcome = mapAreaRepairTaskToOutcome(unit, task);
                outcomes[index] = outcome;
                completed += 1;
                options.onOutcome?.(outcome, unit, completed, units.length);
            } catch (error) {
                if (options.signal?.aborted) cancelled = true;
                const message = error instanceof Error ? error.message : String(error);
                const outcome: AreaRepairUnitOutcome = {
                    unitId: unit.id,
                    index: unit.index,
                    total: unit.total,
                    status: options.signal?.aborted ? "cancelled" : "failed",
                    snapshotHash: unit.snapshotHash,
                    error: { code: "submit-failed", message, retryable: true },
                };
                outcomes[index] = outcome;
                completed += 1;
                options.onOutcome?.(outcome, unit, completed, units.length);
            }
        }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, units.length) }, () => worker()));
    return outcomes;
}
