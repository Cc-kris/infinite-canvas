/**
 * TASK-020：PRINTING_REPAIR 适配器。
 *
 * 真实边界（不接受“演示/模拟成功”）：
 *  - 一次修复 = 一次真实图像编辑请求：参考图 1 = 印花有误的商品图，参考图 2 = 正确印花；
 *  - stampingFlowerSegUrl 不是占位串：由本文件对第 2 张图做真实像素分析（前景/背景分离）后
 *    用 Canvas 导出同尺寸 PNG（白=印花本体，黑=背景），分析失败直接抛错，不伪造；
 *  - 任务走共享 TaskGateway（useToolTaskStore.runTool），provider 由用户当前图像模型配置决定；
 *  - 上游返回成功但没有图片 → 判 failed（empty-result），绝不补造图片或占位成功；
 *  - 结果带 snapshotHash：输入一变即标记“来自旧版本”，不冒充当前结果。
 *
 * 字段落点（registry/index.ts#PRINTING_REPAIR 共 13 个字段）：见 registry/printing-repair.ts
 * PRINTING_REPAIR_FIELD_BINDINGS。除输出字段 imageResultUrl 外，其余 12 个必须在提交时真实出现，
 * 缺一个直接抛错（assertPrintingRepairInput），不静默丢参。
 */

import { PRINTING_REPAIR_TOOL_ID, composePrintingRepairFields, printingRepairInstruction, printingRepairSnapshotHash, printCoverage, validatePrintingRepairInput, type PrintingRepairSnapshot } from "../registry/printing-repair";
import { sourceReferenceUrls } from "../source-asset";
import type { BrowserToolInput, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask } from "@/services/api/tools/task-machine";
import type { ReferenceImage } from "@/types/image";

export class PrintingRepairAdapterError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
        super(message);
        this.name = "PrintingRepairAdapterError";
        this.code = code;
    }
}

/* ------------------------------------------------------------------ *
 * 输入
 * ------------------------------------------------------------------ */

export type PrintingRepairSourceAsset = {
    id: string;
    name: string;
    type: string;
    dataUrl: string;
    url?: string;
    storageKey?: string;
    width?: number;
    height?: number;
};

export function toPrintingRepairReference(asset: PrintingRepairSourceAsset): ReferenceImage {
    const urls = sourceReferenceUrls(asset);
    if (!urls) throw new PrintingRepairAdapterError("asset-unreadable", "这张图片的本地数据已不可用，请重新上传");
    return {
        id: asset.id,
        name: asset.name,
        type: asset.type,
        ...urls,
        ...(asset.storageKey ? { storageKey: asset.storageKey } : {}),
    };
}

/* ------------------------------------------------------------------ *
 * 印花分割：真实像素分析 → 同尺寸 PNG
 * ------------------------------------------------------------------ */

export type PrintSegMode = "background-diff" | "full-rect";

export type PrintSegAnalysis = {
    mask: Uint8ClampedArray;
    coverage: number;
    mode: PrintSegMode;
};

/** 用于分析的边长上限：分割描述的是“印花本体形状”，不需要跟底图同分辨率。 */
export const PRINTING_REPAIR_SEG_MAX_SIDE = 1024;
/** 背景色判定容差（RGB 欧氏距离）。 */
export const PRINTING_REPAIR_SEG_TOLERANCE = 36;
/** 前景像素占比低于该值视为“几乎没有印花”，直接报错而不是提交空蒙版。 */
export const PRINTING_REPAIR_SEG_MIN_COVERAGE = 0.005;
/** 前景占比高于该值视为“印花铺满整张图”，退回整幅矩形蒙版。 */
export const PRINTING_REPAIR_SEG_FULL_COVERAGE = 0.995;

function cornerColor(pixels: Uint8ClampedArray, width: number, height: number, ox: number, oy: number, box: number) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    let count = 0;
    for (let y = oy; y < Math.min(height, oy + box); y += 1) {
        for (let x = ox; x < Math.min(width, ox + box); x += 1) {
            const index = (y * width + x) * 4;
            r += pixels[index];
            g += pixels[index + 1];
            b += pixels[index + 2];
            a += pixels[index + 3];
            count += 1;
        }
    }
    if (!count) return { r: 255, g: 255, b: 255, a: 255 };
    return { r: r / count, g: g / count, b: b / count, a: a / count };
}

/**
 * 纯函数像素分析（可单测，不依赖 Canvas）：
 *  - 四角 8×8 采样得到背景色；四角透明 → 走 alpha 通道判定（PNG 透明底印花）；
 *  - 与背景色距离 > 容差的像素算作印花本体；
 *  - 结果白=印花、黑=背景，尺寸与分析尺寸一致。
 */
export function analyzePrintPixels(pixels: Uint8ClampedArray, width: number, height: number, options: { tolerance?: number } = {}): PrintSegAnalysis {
    if (!width || !height || pixels.length !== width * height * 4) {
        throw new PrintingRepairAdapterError("seg-invalid-pixels", "印花参考的像素数据不完整，无法生成分割图");
    }
    const tolerance = options.tolerance ?? PRINTING_REPAIR_SEG_TOLERANCE;
    const box = Math.max(2, Math.min(8, Math.floor(Math.min(width, height) / 8) || 2));
    const corners = [
        cornerColor(pixels, width, height, 0, 0, box),
        cornerColor(pixels, width, height, Math.max(0, width - box), 0, box),
        cornerColor(pixels, width, height, 0, Math.max(0, height - box), box),
        cornerColor(pixels, width, height, Math.max(0, width - box), Math.max(0, height - box), box),
    ];
    const transparentBackground = corners.every((corner) => corner.a < 16);
    const bg = corners.reduce((acc, corner) => ({ r: acc.r + corner.r / 4, g: acc.g + corner.g / 4, b: acc.b + corner.b / 4 }), { r: 0, g: 0, b: 0 });

    const mask = new Uint8ClampedArray(width * height * 4);
    let foreground = 0;
    for (let index = 0; index < width * height; index += 1) {
        const offset = index * 4;
        const alpha = pixels[offset + 3];
        let isForeground: boolean;
        if (transparentBackground) {
            isForeground = alpha > 16;
        } else {
            const dr = pixels[offset] - bg.r;
            const dg = pixels[offset + 1] - bg.g;
            const db = pixels[offset + 2] - bg.b;
            isForeground = alpha > 16 && Math.sqrt(dr * dr + dg * dg + db * db) > tolerance;
        }
        if (isForeground) foreground += 1;
        const value = isForeground ? 255 : 0;
        mask[offset] = value;
        mask[offset + 1] = value;
        mask[offset + 2] = value;
        mask[offset + 3] = 255;
    }
    const coverage = foreground / (width * height);
    if (coverage > PRINTING_REPAIR_SEG_FULL_COVERAGE) {
        mask.fill(255);
        return { mask, coverage: 1, mode: "full-rect" };
    }
    if (coverage < PRINTING_REPAIR_SEG_MIN_COVERAGE) {
        throw new PrintingRepairAdapterError("seg-empty", "这张印花参考里没有识别出印花内容，请换一张主体清晰、背景干净的印花图");
    }
    return { mask, coverage, mode: "background-diff" };
}

export type PrintSegDeps = {
    /** 测试注入：拿到原图像素与分析尺寸。 */
    readPixels?: (src: string, maxSide: number) => Promise<{ pixels: Uint8ClampedArray; width: number; height: number }>;
    /** 测试注入：把 mask 像素编码成 PNG dataUrl。 */
    encodePng?: (mask: Uint8ClampedArray, width: number, height: number) => Promise<string>;
};

export type PrintSegResult = {
    dataUrl: string;
    width: number;
    height: number;
    coverage: number;
    mode: PrintSegMode;
};

export function segAnalysisSize(width: number, height: number, maxSide = PRINTING_REPAIR_SEG_MAX_SIDE) {
    const long = Math.max(1, width, height);
    const factor = Math.min(1, maxSide / long);
    return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)) };
}

async function defaultReadPixels(src: string, maxSide: number) {
    if (typeof document === "undefined") {
        throw new PrintingRepairAdapterError("canvas-unavailable", "当前环境没有 Canvas，无法生成印花分割图；请在浏览器中打开本工具");
    }
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.crossOrigin = "anonymous";
        element.onload = () => resolve(element);
        element.onerror = () => reject(new PrintingRepairAdapterError("seg-decode-failed", "印花参考解码失败，请重新上传"));
        element.src = src;
    });
    const size = segAnalysisSize(image.naturalWidth || image.width, image.naturalHeight || image.height, maxSide);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new PrintingRepairAdapterError("canvas-unavailable", "无法获取 2D 画布上下文，印花分割图没有导出");
    ctx.drawImage(image, 0, 0, size.width, size.height);
    const data = ctx.getImageData(0, 0, size.width, size.height);
    return { pixels: data.data, width: size.width, height: size.height };
}

async function defaultEncodePng(mask: Uint8ClampedArray, width: number, height: number) {
    if (typeof document === "undefined") {
        throw new PrintingRepairAdapterError("canvas-unavailable", "当前环境没有 Canvas，无法导出印花分割图；请在浏览器中打开本工具");
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new PrintingRepairAdapterError("canvas-unavailable", "无法获取 2D 画布上下文，印花分割图没有导出");
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(mask);
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
}

/**
 * 导出印花分割图：真实解码 → 真实像素判定 → 真实 PNG 字节。
 * 任何一步失败都抛 PrintingRepairAdapterError，由工作区转成人话提示。
 */
export async function derivePrintSegPng(printDataUrl: string, deps: PrintSegDeps = {}): Promise<PrintSegResult> {
    if (!printDataUrl) throw new PrintingRepairAdapterError("print-missing", "请先上传正确的印花参考（Step 2）");
    const readPixels = deps.readPixels ?? defaultReadPixels;
    const encodePng = deps.encodePng ?? defaultEncodePng;
    const { pixels, width, height } = await readPixels(printDataUrl, PRINTING_REPAIR_SEG_MAX_SIDE);
    const analysis = analyzePrintPixels(pixels, width, height);
    const dataUrl = await encodePng(analysis.mask, width, height);
    if (!dataUrl.startsWith("data:image/png")) {
        throw new PrintingRepairAdapterError("seg-encode-failed", "印花分割图编码失败，没有拿到 PNG 字节");
    }
    return { dataUrl, width, height, coverage: analysis.coverage, mode: analysis.mode };
}

/* ------------------------------------------------------------------ *
 * 单元与请求
 * ------------------------------------------------------------------ */

export type PrintingRepairUnit = {
    id: string;
    prompt: string;
    references: ReferenceImage[];
    fields: Record<string, unknown>;
    snapshotHash: string;
};

export type BuildPrintingRepairUnitInput = {
    snapshot: PrintingRepairSnapshot;
    base: ReferenceImage;
    print: ReferenceImage;
    segDataUrl: string;
};

/** 单结果工具：一次提交只产出一张（registry: batchCapable=false）。 */
export function buildPrintingRepairUnit(input: BuildPrintingRepairUnitInput): PrintingRepairUnit {
    const hash = printingRepairSnapshotHash(input.snapshot);
    const baseUrl = input.base.url ?? input.base.dataUrl ?? "";
    const fields = composePrintingRepairFields(input.snapshot, {
        imageUrl: baseUrl,
        stampingFlowerUrl: input.print.url ?? input.print.dataUrl ?? "",
        stampingFlowerSegUrl: input.segDataUrl,
        url: baseUrl,
    });
    return {
        id: `${PRINTING_REPAIR_TOOL_ID}:${hash}`,
        prompt: printingRepairInstruction(input.snapshot),
        references: [input.base, input.print],
        fields,
        snapshotHash: hash,
    };
}

export function buildPrintingRepairInput(unit: PrintingRepairUnit, options: { draftRevision?: number | string | null } = {}): BrowserToolInput {
    return {
        toolId: PRINTING_REPAIR_TOOL_ID,
        prompt: unit.prompt,
        references: unit.references,
        count: 1,
        fields: { ...unit.fields, ...(options.draftRevision !== undefined ? { draftRevision: options.draftRevision } : {}) },
    };
}

function urlField(fields: Record<string, unknown>, key: string): string {
    const value = fields[key];
    return typeof value === "string" ? value.trim() : "";
}

/**
 * 提交前守卫：12 个输入字段必须真的落到请求里，且定位参数必须自洽。
 * 任何缺失直接抛错，让 UI 显示原因而不是发一次缺参请求。
 */
export function assertPrintingRepairInput(input: BrowserToolInput): void {
    if (input.references?.length !== 2) {
        throw new PrintingRepairAdapterError("references-missing", "印花修复必须同时提交商品图与印花参考两张图");
    }
    if (input.count !== 1) {
        throw new PrintingRepairAdapterError("count-invalid", "印花修复是单结果工具，产物数量必须为 1");
    }
    const fields = input.fields ?? {};
    const required = [
        ["imageUrl", "缺少待修复的商品图地址（imageUrl）"],
        ["stampingFlowerUrl", "缺少印花参考地址（stampingFlowerUrl）"],
        ["stampingFlowerSegUrl", "缺少印花分割图（stampingFlowerSegUrl）"],
        ["url", "缺少来源地址（url）"],
    ] as const;
    for (const [key, message] of required) {
        if (!urlField(fields, key)) throw new PrintingRepairAdapterError(`${key}-missing`, message);
    }
    const point = fields.point as { x?: unknown; y?: unknown } | undefined;
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
        throw new PrintingRepairAdapterError("point-invalid", "印花定位坐标缺失或不合法（需为 0–1 的归一化坐标）");
    }
    const rotate = Number(fields.rotate);
    if (!Number.isFinite(rotate)) throw new PrintingRepairAdapterError("rotate-invalid", "缺少印花旋转角度");
    const scale = Number(fields.scale);
    if (!Number.isFinite(scale) || scale <= 0) throw new PrintingRepairAdapterError("scale-invalid", "缺少印花缩放比例");
    if (!fields.config || typeof fields.config !== "object") throw new PrintingRepairAdapterError("config-missing", "缺少结构化配置（config）");
    if (!fields.targetConfig || typeof fields.targetConfig !== "object") throw new PrintingRepairAdapterError("target-config-missing", "缺少目标对象配置（targetConfig）");
    if (!Number.isFinite(Number(fields.width)) || Number(fields.width) <= 0) throw new PrintingRepairAdapterError("width-invalid", "输出宽度缺失或不合法");
    if (!Number.isFinite(Number(fields.height)) || Number(fields.height) <= 0) throw new PrintingRepairAdapterError("height-invalid", "输出高度缺失或不合法");
    if (typeof fields.version !== "string" || !fields.version) throw new PrintingRepairAdapterError("version-missing", "缺少修复版本（version）");
    if (typeof fields.clientOperationId !== "string" || !fields.clientOperationId) {
        throw new PrintingRepairAdapterError("operation-id-missing", "缺少客户端幂等键（clientOperationId），拒绝提交");
    }
    if (typeof input.prompt !== "string" || !input.prompt.trim()) {
        throw new PrintingRepairAdapterError("prompt-missing", "修复指令为空，拒绝提交");
    }
    // 印花必须真的落在底图上：完全出界等于凭空生成。
    // 尺寸来自 targetConfig（画布与印花本体），与请求本身同源，不额外假设。
    const target = fields.targetConfig as { canvas?: { width?: unknown; height?: unknown }; print?: { width?: unknown; height?: unknown } } | undefined;
    const canvasSize = { width: Number(target?.canvas?.width), height: Number(target?.canvas?.height) };
    const printSize = { width: Number(target?.print?.width), height: Number(target?.print?.height) };
    if (canvasSize.width > 0 && canvasSize.height > 0 && printSize.width > 0 && printSize.height > 0) {
        const coverage = printCoverage({ point: { x, y }, scale, rotate }, printSize, canvasSize);
        if (coverage <= 0) throw new PrintingRepairAdapterError("placement-outside", "印花层完全在底图之外，请先调整位置");
    }
}

/** 页面级校验（registry）与适配器守卫合并成一次可展示的原因列表。 */
export function printingRepairPreflightIssues(snapshot: PrintingRepairSnapshot, urls: { baseUrl: string; printUrl: string; segUrl: string }): string[] {
    const issues = validatePrintingRepairInput({
        baseUrl: urls.baseUrl,
        printUrl: urls.printUrl,
        segUrl: urls.segUrl,
        transform: { point: snapshot.point, scale: snapshot.scale, rotate: snapshot.rotate },
        base: { width: snapshot.baseWidth, height: snapshot.baseHeight },
        print: { width: snapshot.printWidth, height: snapshot.printHeight },
        strength: snapshot.strength,
    });
    return issues.map((issue) => issue.message);
}

/* ------------------------------------------------------------------ *
 * 运行
 * ------------------------------------------------------------------ */

export type PrintingRepairGatewayLike = {
    run: (input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
};

/** 真实运行端口：默认走共享任务网关。 */
export async function createPrintingRepairRunPort(): Promise<PrintingRepairGatewayLike> {
    const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
    return {
        run: (input, options) => useToolTaskStore.getState().runTool(input, options),
    };
}

export type RunPrintingRepairOptions = {
    unit: PrintingRepairUnit;
    port: PrintingRepairGatewayLike;
    signal?: AbortSignal;
    draftRevision?: number | string | null;
    onTask?: (task: ToolTask) => void;
};

export type PrintingRepairRun = {
    unitId: string;
    snapshotHash: string;
    task: ToolTask;
    image?: { url?: string; dataUrl?: string };
    status: "succeeded" | "failed" | "cancelled" | "unknown";
    error?: { code: string; message: string };
};

export async function runPrintingRepair(options: RunPrintingRepairOptions): Promise<PrintingRepairRun> {
    const input = buildPrintingRepairInput(options.unit, { draftRevision: options.draftRevision });
    assertPrintingRepairInput(input);
    const task = await options.port.run(input, { signal: options.signal });
    options.onTask?.(task);
    return printingRepairRunFromTask(options.unit, task);
}

/** 失败后按同一快照重试：重新发一次真实请求，不复制上次结果。 */
export async function retryPrintingRepair(options: RunPrintingRepairOptions): Promise<PrintingRepairRun> {
    return runPrintingRepair(options);
}

export function printingRepairRunFromTask(unit: PrintingRepairUnit, task: ToolTask): PrintingRepairRun {
    const base = { unitId: unit.id, snapshotHash: unit.snapshotHash, task };
    const firstImage = task.result?.items.find((item) => item.kind === "image" && (item.dataUrl || item.url));
    if (task.status === "succeeded") {
        if (!firstImage) {
            return { ...base, status: "failed", error: { code: "empty-result", message: "上游返回成功但没有图片结果" } };
        }
        return { ...base, status: "succeeded", image: { url: firstImage.url, dataUrl: firstImage.dataUrl } };
    }
    if (task.status === "failed") {
        return { ...base, status: "failed", error: task.error ? { code: task.error.code, message: task.error.message } : { code: "task-failed", message: "任务失败（上游未给出原因）" } };
    }
    if (task.status === "cancelled") {
        return { ...base, status: "cancelled", error: { code: "cancelled", message: "任务已取消" } };
    }
    return { ...base, status: "unknown", error: { code: `task-${task.status}`, message: "任务状态未知，只能查询或人工确认" } };
}

/* ------------------------------------------------------------------ *
 * 结果视图
 * ------------------------------------------------------------------ */

export type PrintingRepairResultView = {
    status: "idle" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";
    /** 结果图（真实上游返回）。 */
    imageUrl?: string;
    /** 提交时的商品图，用于局部/并排对比。 */
    sourceUrl?: string;
    /** 结果相对当前配置是否已过期（“来自旧版本”）。 */
    stale: boolean;
    snapshotHash?: string;
    error?: { code: string; message: string };
};

export function printingRepairResultView(input: { run?: PrintingRepairRun | null; running?: boolean; sourceUrl?: string; stale?: boolean }): PrintingRepairResultView {
    if (!input.run) {
        return { status: input.running ? "running" : "idle", sourceUrl: input.sourceUrl, stale: Boolean(input.stale) };
    }
    return {
        status: input.running ? "running" : input.run.status,
        imageUrl: input.run.image?.dataUrl ?? input.run.image?.url,
        sourceUrl: input.sourceUrl,
        stale: Boolean(input.stale),
        snapshotHash: input.run.snapshotHash,
        error: input.run.error,
    };
}
