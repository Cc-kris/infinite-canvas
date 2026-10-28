/**
 * AI_OUTPAINTING 适配器：把「画布几何 + 原图 + 蒙版」翻译成一次真实 provider 请求。
 *
 * 真实边界（不伪造成功）：
 *  - 走共享 TaskGateway（`useToolTaskStore.runTool`），
 *  - provider 成功但没有图片 → 判 failed(empty-result)，绝不补造结果；
 *  - 上游状态未知只标 unknown，不当作失败也不当作成功。
 *
 * 已知集成缺口（写进 report，不在本文件里偷偷绕过）：
 *  gateway 的 `ProviderInvocation` 只有 `{prompt, references}`，没有 mask 通道。
 *  所以扩图蒙版以「第 2 张参考图 + fields.maskUrl」提交：蒙版 PNG 的白色区域 = 需要补全的
 *  新增画布，黑色区域 = 必须保持像素不变的原图区域。等 gateway 增加 mask 字段后，
 *  只需把 `buildOutpaintInput` 里的蒙版从 references[1] 挪到独立字段，prompt/几何不变。
 */

import type { ToolAssetRecord } from "@/services/api/tools/assets";
import { uploadToolAsset } from "@/services/api/tools/assets";
import type { BrowserToolInput, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
import type { ReferenceImage } from "@/types/image";

import {
    AI_OUTPAINTING_TOOL_ID,
    buildConfig,
    buildImageConfig,
    buildStageConfig,
    composeOutpaintPrompt,
    geometryHash,
    hashString,
    keepRect,
    maskPlan,
    maskSyncState,
    validateOutpaint,
    withMask,
    type OutpaintValues,
} from "../registry/ai-outpainting";

/* ------------------------------------------------------------------ *
 * 素材
 * ------------------------------------------------------------------ */

export interface OutpaintSource {
    assetId: string;
    name: string;
    reference: ReferenceImage;
    width: number;
    height: number;
}

export function assetRecordToReference(record: ToolAssetRecord): ReferenceImage {
    return {
        id: record.id,
        name: record.name,
        type: record.mimeType || "image/png",
        dataUrl: record.url,
        url: record.url,
        storageKey: record.storageKey,
    };
}

export function assetRecordToSource(record: ToolAssetRecord): OutpaintSource {
    return {
        assetId: record.id,
        name: record.name || "原图",
        reference: assetRecordToReference(record),
        width: Math.round(record.width ?? 0),
        height: Math.round(record.height ?? 0),
    };
}

/** 上传记录缺像素尺寸时，用浏览器解码补齐（只在浏览器环境可用）。 */
export async function measureSourceSize(url: string): Promise<{ width: number; height: number }> {
    if (typeof Image === "undefined") throw new Error("measureSourceSize 需要浏览器环境");
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("原图解码失败"));
        element.src = url;
    });
    return { width: image.naturalWidth, height: image.naturalHeight };
}

export async function ensureSourceSize(source: OutpaintSource): Promise<OutpaintSource> {
    if (source.width > 0 && source.height > 0) return source;
    const src = source.reference.dataUrl || source.reference.url;
    if (!src) return source;
    const size = await measureSourceSize(src);
    return { ...source, ...size };
}

/* ------------------------------------------------------------------ *
 * 蒙版 PNG（白 = 需补全，黑 = 原图保留区）
 * ------------------------------------------------------------------ */

export const MASK_FILL_RGB = "#ffffff";
export const MASK_KEEP_RGB = "#000000";

export interface OutpaintMaskImage {
    blob: Blob;
    width: number;
    height: number;
    geometryHash: string;
}

/** 按当前几何渲染蒙版 PNG；画布尺寸与原图位置必须和提交快照完全一致。 */
export async function renderMaskPng(values: OutpaintValues): Promise<OutpaintMaskImage> {
    const plan = maskPlan(values);
    if (!plan.keep) throw new Error("原图不在画布内，无法生成蒙版");
    if (typeof document === "undefined") throw new Error("renderMaskPng 需要浏览器环境");

    const canvas = document.createElement("canvas");
    canvas.width = plan.canvasWidth;
    canvas.height = plan.canvasHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器不支持 2D 画布，无法生成蒙版");

    context.fillStyle = MASK_FILL_RGB;
    context.fillRect(0, 0, plan.canvasWidth, plan.canvasHeight);
    context.fillStyle = MASK_KEEP_RGB;
    context.fillRect(plan.keep.x, plan.keep.y, plan.keep.width, plan.keep.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("蒙版 PNG 导出失败");
    return { blob, width: plan.canvasWidth, height: plan.canvasHeight, geometryHash: plan.geometryHash };
}

export interface MaskUploadDeps {
    upload?: (blob: Blob, name: string) => Promise<ToolAssetRecord>;
}

/** 生成并入库蒙版，返回带 maskUrl/maskHash 的 values（供草稿与任务字段复用）。 */
export async function ensureOutpaintMask(values: OutpaintValues, deps: MaskUploadDeps = {}): Promise<OutpaintValues> {
    const rendered = await renderMaskPng(values);
    const name = `outpaint-mask-${rendered.width}x${rendered.height}-${rendered.geometryHash}.png`;
    const upload = deps.upload ?? ((blob: Blob, fileName: string) => uploadToolAsset(blob, { name: fileName }));
    const record = await upload(rendered.blob, name);
    return withMask(values, { maskUrl: record.url, maskAssetId: record.id });
}

export function maskReferenceOf(mask: { url: string; storageKey?: string; id?: string }): ReferenceImage {
    return {
        id: mask.id ?? "outpaint-mask",
        name: "outpaint-mask.png",
        type: "image/png",
        dataUrl: mask.url,
        url: mask.url,
        storageKey: mask.storageKey,
    };
}

/* ------------------------------------------------------------------ *
 * 请求
 * ------------------------------------------------------------------ */

export interface OutpaintMaskRef {
    url: string;
    id?: string;
    storageKey?: string;
}

export interface BuildOutpaintInputArgs {
    values: OutpaintValues;
    source: OutpaintSource;
    mask: OutpaintMaskRef | null;
}

function ratioFieldOf(values: OutpaintValues): string {
    if (values.ratio === "custom") return `${values.width}:${values.height}`;
    return values.ratio;
}

/**
 * 组装一次真实请求：references[0]=原图，references[1]=蒙版；
 * 字段与 gateway AI_OUTPAINTING 声明表对齐（sizeSet* 属于尺码表，本页不渲染也不伪造）。
 */
export function buildOutpaintInput(args: BuildOutpaintInputArgs): BrowserToolInput {
    const { values, source, mask } = args;
    const issues = validateOutpaint(values);
    if (issues.length) {
        throw new Error(`扩图参数不完整：${issues.map((issue) => issue.message).join("；")}`);
    }
    if (!source.reference?.dataUrl && !source.reference?.url) {
        throw new Error("原图缺少可读取的地址，无法提交");
    }
    if (!mask?.url) {
        throw new Error("缺少扩图蒙版，无法提交");
    }
    if (maskSyncState(values) === "stale") {
        throw new Error("蒙版与当前画布几何不一致，请重新生成蒙版后再提交");
    }

    const prompt = composeOutpaintPrompt({ values, userPrompt: values.prompt });
    const sourceUrl = source.reference.dataUrl || source.reference.url;
    const references: ReferenceImage[] = [source.reference, maskReferenceOf(mask)];

    return {
        toolId: AI_OUTPAINTING_TOOL_ID,
        prompt,
        references,
        count: values.outputNum,
        fields: {
            config: buildConfig(values),
            editFlag: values.editMode,
            width: values.width,
            height: values.height,
            ratio: ratioFieldOf(values),
            outputNum: values.outputNum,
            prompt,
            imageUrl: sourceUrl,
            originImageUrl: sourceUrl,
            imageName: source.name,
            maskUrl: mask.url,
            imageConfig: buildImageConfig(values),
            /** 输出字段：提交时为空占位，成功后由结果面板写回第一张结果地址。 */
            imageExpandUrl: "",
            stageConfig: buildStageConfig(values),
        },
    };
}

/* ------------------------------------------------------------------ *
 * 运行
 * ------------------------------------------------------------------ */

export interface OutpaintRunPort {
    run(input: BrowserToolInput, options?: WaitOptions): Promise<ToolTask>;
}

export function createTaskStoreRunPort(): OutpaintRunPort {
    return {
        async run(input, options) {
            const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
            return useToolTaskStore.getState().runTool(input, options);
        },
    };
}

export interface RunOutpaintOptions {
    port: OutpaintRunPort;
    signal?: AbortSignal;
    onTask?: (task: ToolTask) => void;
}

export async function runOutpaint(input: BrowserToolInput, options: RunOutpaintOptions): Promise<ToolTask> {
    try {
        return await options.port.run(input, { signal: options.signal });
    } catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
    }
}

/* ------------------------------------------------------------------ *
 * 快照 / 结果
 * ------------------------------------------------------------------ */

export interface OutpaintSnapshot {
    hash: string;
    sourceAssetId: string | null;
    geometryHash: string;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    outputNum: number;
    prompt: string;
    maskUrl: string;
}

export function buildOutpaintSnapshot(values: OutpaintValues): OutpaintSnapshot {
    return {
        hash: outpaintSnapshotHash(values),
        sourceAssetId: values.sourceAssetId,
        geometryHash: geometryHash(values),
        width: values.width,
        height: values.height,
        offsetX: values.offsetX,
        offsetY: values.offsetY,
        outputNum: values.outputNum,
        prompt: values.prompt.trim(),
        maskUrl: values.maskUrl,
    };
}

export function outpaintSnapshotHash(values: OutpaintValues): string {
    return hashString(
        [
            values.sourceAssetId ?? "",
            geometryHash(values),
            values.outputNum,
            values.prompt.trim(),
            values.maskUrl,
        ].join("|"),
    );
}

export type OutpaintStatus = "succeeded" | "failed" | "unknown" | "cancelled";

export interface OutpaintImage {
    url?: string;
    dataUrl?: string;
    mimeType?: string;
    width?: number;
    height?: number;
}

export interface OutpaintOutcome {
    status: OutpaintStatus;
    snapshotHash: string;
    taskId?: string;
    images: OutpaintImage[];
    primary?: OutpaintImage;
    /** 对应字段 imageExpandUrl：第一张结果的地址（没有结果时留空，不填占位图）。 */
    imageExpandUrl?: string;
    error?: { code: string; message: string; retryable?: boolean };
}

export function mapOutpaintTask(values: OutpaintValues, task: ToolTask): OutpaintOutcome {
    const base = { snapshotHash: outpaintSnapshotHash(values), taskId: task.id };
    const images: OutpaintImage[] = (task.result?.items ?? [])
        .filter((item: ToolTaskResultItem) => item.kind === "image" && (item.dataUrl || item.url))
        .map((item) => ({ url: item.url, dataUrl: item.dataUrl, mimeType: item.mimeType }));

    if (task.status === "succeeded") {
        if (!images.length) {
            return {
                ...base,
                status: "failed",
                images: [],
                error: { code: "empty-result", message: "上游返回成功但没有图片结果", retryable: true },
            };
        }
        return {
            ...base,
            status: "succeeded",
            images,
            primary: images[0],
            imageExpandUrl: images[0].url ?? images[0].dataUrl,
        };
    }
    if (task.status === "failed") {
        return {
            ...base,
            status: "failed",
            images,
            error: task.error
                ? { code: task.error.code, message: task.error.message, retryable: task.error.retryable }
                : { code: "task-failed", message: "任务失败（上游未给出原因）", retryable: true },
        };
    }
    if (task.status === "cancelled") {
        return { ...base, status: "cancelled", images, error: { code: "cancelled", message: "任务已取消", retryable: false } };
    }
    return {
        ...base,
        status: "unknown",
        images,
        error: { code: `task-${task.status}`, message: "任务状态未知，请稍后查询或人工确认", retryable: true },
    };
}

/** 结果过期判定：当前输入与生成时的快照 hash 不一致即过期（不冒充新结果）。 */
export function isOutpaintStale(outcome: OutpaintOutcome | null | undefined, values: OutpaintValues): boolean {
    if (!outcome) return false;
    return outcome.snapshotHash !== outpaintSnapshotHash(values);
}

export function isRetryableOutcome(outcome: OutpaintOutcome | null | undefined): boolean {
    if (!outcome) return false;
    if (outcome.status === "succeeded") return false;
    return outcome.error?.retryable !== false;
}

/** 重建原图请求（换色/扩图共用的“原图 + 蒙版”双参考约束在这里集中说明一次）。 */
export function describeOutpaintRequest(input: BrowserToolInput): string {
    const references = input.references ?? [];
    return [
        `references=${references.length}（原图 1 + 蒙版 ${Math.max(0, references.length - 1)}）`,
        `count=${input.count ?? 1}`,
        `prompt=${(input.prompt ?? "").length} 字`,
        `geometry=${String((input.fields?.config as { geometryHash?: string } | undefined)?.geometryHash ?? "—")}`,
    ].join(" · ");
}

/** 蒙版几何自检：确保 keep 区域落在画布内（UI 在提交前调用，避免提交坏蒙版）。 */
export function assertMaskGeometry(values: OutpaintValues): void {
    const keep = keepRect(values);
    if (!keep) throw new Error("原图完全在画布外，无法生成蒙版");
    if (keep.x < 0 || keep.y < 0 || keep.x + keep.width > values.width || keep.y + keep.height > values.height) {
        throw new Error("蒙版保留区域超出画布边界");
    }
}
