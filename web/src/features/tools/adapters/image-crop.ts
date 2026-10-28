/**
 * IMAGE_CROP 适配器：把「一张源图 + 一个裁剪计划」执行成真实像素结果，并产出真实任务记录。
 *
 * 真实边界（不接受“演示/模拟成功”）：
 *  - 裁剪是确定性像素运算，由 canvas 按 `CropPlan` 真实绘制（旋转/翻转/裁剪/缩放），
 *    产出的 Blob 就是用户下载与入库的那份字节，不做任何占位图；
 *  - 结果必须经 `uploadToolAsset` 真实入库拿到 `storageKey/url` 才判成功；入库失败或绘制失败一律 failed；
 *  - 任务记录走共享状态机 `createTaskRecord → validating → submitting → running → succeeded|failed`，
 *    不得跳过迁移，也不得伪造 succeeded；
 *  - 12 个规格字段（`composeImageCropFields`）全部进入 prompt 与 fingerprint，最终指纹参与幂等去重，
 *    禁止静默丢参。
 *
 * 本文件不直接触碰 DOM：真实绘制通过 `CropRenderer` 端口注入（`createCanvasCropRenderer`），
 * 单测可注入假渲染器验证执行/失败路径，而不会假装跑过 canvas。
 */
import { uploadToolAsset, type ToolAssetRecord } from "@/services/api/tools/assets";
import { computeFingerprint, createTaskRecord, transitionTask, type ToolTask, type ToolTaskResultItem } from "@/services/api/tools/task-machine";

import {
    IMAGE_CROP_TOOL_ID,
    composeImageCropFields,
    cropPlanHash,
    imageCropUnitHash,
    isSnapshotStale,
    validateCropState,
    type CropCanvasState,
    type CropIssue,
    type CropPlan,
    type CropSourceMeta,
    type ImageCropMedia,
    type ImageCropSnapshot,
} from "../registry/image-crop";

/** 裁剪引擎标识：确定性本地像素裁剪，不是模型调用。 */
export const IMAGE_CROP_ENGINE = "in-process-crop" as const;

export type CropBinary = { blob: Blob; dataUrl?: string; width: number; height: number; mimeType: string };

export type CropRenderer = {
    /** 真实绘制：按 plan 从源图产出裁剪后的字节。 */
    render: (sourceUrl: string, plan: CropPlan) => Promise<CropBinary>;
};

export type CropUploader = (blob: Blob, name: string) => Promise<ToolAssetRecord>;

export type CropExecutorDeps = {
    renderer: CropRenderer;
    upload?: CropUploader;
    now?: () => number;
    /** 可选：任务落库（工作台传 useToolTaskStore.upsertTask）。 */
    persist?: (task: ToolTask) => void;
};

/* ------------------------------- prompt / 字段 ------------------------------- */

/** 媒体上下文：字段组装只认 registry 的 ImageCropMedia，避免两套定义漂移。 */
export type ImageCropPromptMedia = ImageCropMedia;

const PROMPT_KEYS = ["activeTab", "contentUrl", "imageCropUrl", "imageFormat", "imageHeight", "imageSize", "imageUrl", "imageWidth", "platform", "platformTitle", "ratio", "selectedMode"] as const;

/**
 * 机器可读配置行：12 个字段以 `key=value` 落进 prompt，任务快照刷新后仍可完整还原（防丢参）。
 * 空格与换行会被 `normalizePrompt` 归并，所以值里不出现空格（URL 已 encode）。
 */
export function buildImageCropPrompt(snapshot: ImageCropSnapshot, media: ImageCropPromptMedia): string {
    const fields = composeImageCropFields(snapshot, media);
    const line = PROMPT_KEYS.map((key) => `${key}=${encodePromptValue(fields[key])}`).join(";");
    return [
        `图片裁剪｜${snapshot.platformTitle} ${snapshot.plan.outputWidth}×${snapshot.plan.outputHeight}`,
        `裁剪框 ${snapshot.plan.sx},${snapshot.plan.sy},${snapshot.plan.sw},${snapshot.plan.sh}`,
        `源图 ${snapshot.sourceName || "未命名"}`,
        `配置 ${line}`,
    ].join("｜");
}

function encodePromptValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return text.replace(/[\s;｜]+/g, (match) => encodeURIComponent(match));
}

/** 从 prompt 还原 12 字段（验收用：证明提交参数没有被静默丢弃）。 */
export function parseImageCropPrompt(prompt: string): Record<string, string> {
    const marker = prompt.indexOf("配置 ");
    if (marker < 0) return {};
    const line = prompt.slice(marker + 3);
    const out: Record<string, string> = {};
    for (const chunk of line.split(";")) {
        const eq = chunk.indexOf("=");
        if (eq <= 0) continue;
        const key = chunk.slice(0, eq).trim();
        const value = chunk.slice(eq + 1).trim();
        if (!(PROMPT_KEYS as readonly string[]).includes(key)) continue;
        out[key] = safeDecode(value);
    }
    return out;
}

function safeDecode(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

/** 提交前的真实校验：源图能力边界 + 输出像素边界，问题定位到具体字段。 */
export function guardImageCropRequest(state: CropCanvasState, source: CropSourceMeta | null | undefined): CropIssue[] {
    return validateCropState(state, source ?? null);
}

/* ------------------------------- 计划构建 ------------------------------- */

export type ImageCropRequest = {
    snapshot: ImageCropSnapshot;
    plan: CropPlan;
    prompt: string;
    fields: Record<string, unknown>;
    sourceAssetId: string;
    fingerprint: string;
};

export function buildImageCropRequest(input: { snapshot: ImageCropSnapshot; media: ImageCropPromptMedia }): ImageCropRequest {
    const plan = input.snapshot.plan;
    const fields = composeImageCropFields(input.snapshot, input.media);
    const prompt = buildImageCropPrompt(input.snapshot, input.media);
    const fingerprint = computeFingerprint({
        toolId: IMAGE_CROP_TOOL_ID,
        capability: "image",
        prompt,
        configSnapshot: { capability: "image", model: IMAGE_CROP_ENGINE, count: "1" },
        sourceAssetIds: input.snapshot.sourceAssetId ? [input.snapshot.sourceAssetId] : [],
        fields,
    });
    return { snapshot: input.snapshot, plan, prompt, fields, sourceAssetId: input.snapshot.sourceAssetId, fingerprint };
}

/* ------------------------------- 执行 ------------------------------- */

export type CropRunResult = { task: ToolTask; asset?: ToolAssetRecord; dataUrl?: string };

const defaultUploader: CropUploader = (blob, name) => uploadToolAsset(blob, { name });

/**
 * 真实执行一次裁剪：
 * draft → validating → submitting → running →（绘制 + 入库）→ succeeded / failed。
 * 任何一步失败都返回 failed 任务并保留源资产与配置，供同快照重试。
 */
export async function runImageCrop(
    input: { request: ImageCropRequest; sourceUrl: string; draftRevision?: number | string | null },
    deps: CropExecutorDeps,
): Promise<CropRunResult> {
    const now = deps.now ?? (() => Date.now());
    const upload = deps.upload ?? defaultUploader;
    const { request } = input;

    let task = createTaskRecord({
        toolId: IMAGE_CROP_TOOL_ID,
        capability: "image",
        prompt: request.prompt,
        configSnapshot: { capability: "image", model: IMAGE_CROP_ENGINE, count: "1", size: `${request.plan.outputWidth}x${request.plan.outputHeight}` },
        sourceAssetIds: request.sourceAssetId ? [request.sourceAssetId] : [],
        draftRevision: input.draftRevision ?? null,
        fingerprint: request.fingerprint,
        at: now(),
    });
    task = transitionTask(task, "validating", { at: now() });
    task = transitionTask(task, "submitting", { at: now() });
    task = transitionTask(task, "running", { at: now() });
    deps.persist?.(task);

    let binary: CropBinary;
    try {
        binary = await deps.renderer.render(input.sourceUrl, request.plan);
        if (!binary?.blob || binary.blob.size === 0) {
            throw new Error("裁剪渲染返回空图像");
        }
    } catch (error) {
        const failed = transitionTask(task, "failed", {
            at: now(),
            error: { code: "crop-render-failed", message: messageOf(error), retryable: true },
        });
        deps.persist?.(failed);
        return { task: failed };
    }

    const fileName = cropFileHint(request.snapshot, binary.mimeType);
    let asset: ToolAssetRecord | undefined;
    try {
        asset = await upload(binary.blob, fileName);
        if (!asset?.id || !asset.url) throw new Error("资产入库未返回可用地址");
    } catch (error) {
        const failed = transitionTask(task, "failed", {
            at: now(),
            error: { code: "asset-upload-failed", message: messageOf(error), retryable: true },
        });
        deps.persist?.(failed);
        return { task: failed };
    }

    const item: ToolTaskResultItem = {
        id: `crop-${cropPlanHash(request.plan)}`,
        kind: "image",
        dataUrl: binary.dataUrl,
        url: asset.url,
        mimeType: binary.mimeType,
        bytes: binary.blob.size,
    };
    const succeeded = transitionTask(task, "succeeded", {
        at: now(),
        upstreamProvider: IMAGE_CROP_ENGINE,
        result: { items: [item], receivedAt: now() },
    });
    deps.persist?.(succeeded);
    return { task: succeeded, asset, dataUrl: binary.dataUrl };
}

function messageOf(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    return typeof error === "string" ? error : "未知错误";
}

function cropFileHint(snapshot: ImageCropSnapshot, mimeType: string): string {
    const base = (snapshot.sourceName || "image").replace(/\.[^.]+$/, "");
    const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
    return `${base}-${snapshot.plan.outputWidth}x${snapshot.plan.outputHeight}.${ext}`;
}

/** 结果是否来自旧配置（换图/改尺寸后旧结果不得冒充当前结果，规格 §3）。 */
export function isResultStale(snapshot: ImageCropSnapshot, current: ImageCropSnapshot): boolean {
    return isSnapshotStale(snapshot, current);
}

export { imageCropUnitHash, cropPlanHash };

/* ------------------------------- 真实绘制 ------------------------------- */

type Canvas2D = {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
};

function makeCanvas(width: number, height: number): Canvas2D {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("当前环境无法创建 2D 画布，裁剪不可用");
    return { canvas, ctx };
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.decoding = "async";
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("源图加载失败，可能是地址不可访问或跨域受限"));
        image.src = src;
    });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) resolve(blob);
                else reject(new Error(`导出 ${mimeType} 失败`));
            },
            mimeType,
            quality,
        );
    });
}

function blobToDataUrl(blob: Blob): Promise<string | undefined> {
    if (typeof FileReader === "undefined") return Promise.resolve(undefined);
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : undefined);
        reader.onerror = () => resolve(undefined);
        reader.readAsDataURL(blob);
    });
}

/**
 * 真实 canvas 裁剪：源图 → 旋转/翻转到 oriented 画布 → 按裁剪框取像素 → 缩放到目标尺寸 → 导出 Blob。
 * 每一步都是真像素运算，未做任何“假成功”兜底。
 */
export function createCanvasCropRenderer(): CropRenderer {
    return {
        async render(sourceUrl, plan) {
            const image = await loadImageElement(sourceUrl);
            const { canvas: orientedCanvas, ctx: orientedCtx } = makeCanvas(plan.orientedWidth, plan.orientedHeight);

            orientedCtx.save();
            if (plan.rotation === 90) {
                orientedCtx.translate(plan.orientedWidth, 0);
                orientedCtx.rotate(Math.PI / 2);
            } else if (plan.rotation === 180) {
                orientedCtx.translate(plan.orientedWidth, plan.orientedHeight);
                orientedCtx.rotate(Math.PI);
            } else if (plan.rotation === 270) {
                orientedCtx.translate(0, plan.orientedHeight);
                orientedCtx.rotate(-Math.PI / 2);
            }
            orientedCtx.drawImage(image, 0, 0, plan.sourceWidth, plan.sourceHeight);
            orientedCtx.restore();

            let stage = orientedCanvas;
            if (plan.flipX || plan.flipY) {
                const flipped = makeCanvas(plan.orientedWidth, plan.orientedHeight);
                flipped.ctx.save();
                flipped.ctx.translate(plan.flipX ? plan.orientedWidth : 0, plan.flipY ? plan.orientedHeight : 0);
                flipped.ctx.scale(plan.flipX ? -1 : 1, plan.flipY ? -1 : 1);
                flipped.ctx.drawImage(orientedCanvas, 0, 0);
                flipped.ctx.restore();
                stage = flipped.canvas;
            }

            const { canvas: outCanvas, ctx: outCtx } = makeCanvas(plan.outputWidth, plan.outputHeight);
            if (plan.mimeType === "image/jpeg") {
                outCtx.fillStyle = "#ffffff";
                outCtx.fillRect(0, 0, plan.outputWidth, plan.outputHeight);
            }
            outCtx.imageSmoothingEnabled = true;
            outCtx.imageSmoothingQuality = plan.outputWidth < plan.sw ? "high" : "medium";
            outCtx.drawImage(stage, plan.sx, plan.sy, plan.sw, plan.sh, 0, 0, plan.outputWidth, plan.outputHeight);

            const blob = await canvasToBlob(outCanvas, plan.mimeType, plan.quality);
            const dataUrl = await blobToDataUrl(blob);
            return { blob, dataUrl, width: plan.outputWidth, height: plan.outputHeight, mimeType: blob.type || plan.mimeType };
        },
    };
}
