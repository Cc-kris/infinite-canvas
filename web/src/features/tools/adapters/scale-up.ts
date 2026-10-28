import type { ReferenceImage } from "@/types/image";

import type { BrowserToolInput, SubmitOptions, ToolTaskGateway, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";

import { isUploadedImageReady, sourceReferenceUrls } from "../source-asset";

import {
    SCALE_UP_TOOL_ID,
    buildScaleUpPrompt,
    computeOutputSize,
    createScaleUpSnapshot,
    isScaleUpSnapshotStale,
    scaleUpQuality,
    validateScaleUpState,
    type ScaleUpIssue,
    type ScaleUpOutput,
    type ScaleUpSnapshot,
    type ScaleUpValues,
} from "../registry/scale-up";

/**
 * TASK-012：SCALE_UP 的真实 provider 适配层。
 *
 * 真实边界（不接受演示成功）：
 * - 提交走 TASK-005 的 ToolTaskGateway.submit → services/api/image.ts requestEdit（带参考图即图生图）；
 * - 输出尺寸进 provider 的 `size` 参数，质量档位进 `quality`，面部增强进 prompt + fields；
 * - `assertScaleUpInput` 在提交前逐项核对“页面上的配置确实进了请求”，防止静默丢参；
 * - 结果只来自 task.result.items，本模块不产生占位图；失败/未知原样透出，不伪造成功。
 */

export type ScaleUpSourceAsset = {
    assetId: string;
    /** data URL 或 http(s) URL；两者都没有则视为未就绪。 */
    dataUrl?: string;
    url?: string;
    name?: string;
    mimeType?: string;
    bytes?: number;
    width?: number;
    height?: number;
};

export class ScaleUpAdapterError extends Error {
    readonly code: string;
    readonly issues: ScaleUpIssue[];
    constructor(code: string, message: string, issues: ScaleUpIssue[] = []) {
        super(message);
        this.name = "ScaleUpAdapterError";
        this.code = code;
        this.issues = issues;
    }
}

export function isScaleUpSourceReady(source?: ScaleUpSourceAsset | null): boolean {
    if (!source || !source.assetId.trim()) return false;
    // 判定口径统一在 features/tools/source-asset.ts（data: / blob: 当次会话 / http(s)）。
    return isUploadedImageReady(source);
}

export function toScaleUpReference(source: ScaleUpSourceAsset): ReferenceImage {
    const urls = sourceReferenceUrls(source);
    if (!urls || !source.assetId.trim()) throw new ScaleUpAdapterError("source-missing", "请先上传可用的原图。");
    return {
        id: source.assetId,
        name: source.name ?? `${source.assetId}.png`,
        type: source.mimeType ?? "image/png",
        ...urls,
    };
}

/** 源图硬约束：页面规格 jpg/jpeg/png/webp、最大 4096×4096。 */
export function validateScaleUpSource(source: ScaleUpSourceAsset): { ok: true } | { ok: false; code: "mime" | "size" | "dimension"; message: string } {
    const mime = (source.mimeType ?? "").toLowerCase();
    if (mime && !["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(mime)) {
        return { ok: false, code: "mime", message: `不支持 ${mime}，仅支持 jpg、jpeg、png、webp。` };
    }
    if (source.bytes !== undefined && source.bytes > 20 * 1024 * 1024) {
        return { ok: false, code: "size", message: "原图不能超过 20MB。" };
    }
    if (source.width && source.height && (source.width > 4096 || source.height > 4096)) {
        return { ok: false, code: "dimension", message: "原图最大尺寸 4096×4096。" };
    }
    return { ok: true };
}

/* ============================== 请求组装 ============================== */

export type BuildScaleUpInputOptions = {
    values: ScaleUpValues;
    output: ScaleUpOutput;
    source: ScaleUpSourceAsset;
    model?: string;
    draftRevision?: number | string | null;
};

/** 页面配置 → gateway 输入。尺寸走 size（真正生效），其余进 fields（参与指纹、可审计）。 */
export function buildScaleUpInput({ values, output, source, model, draftRevision = null }: BuildScaleUpInputOptions): BrowserToolInput {
    if (!isScaleUpSourceReady(source)) throw new ScaleUpAdapterError("source-missing", "请先上传原图。");
    if (!output.legal) {
        const first = output.issues[0];
        throw new ScaleUpAdapterError("output-invalid", first?.message ?? "输出尺寸不合法。", output.issues);
    }
    const quality = scaleUpQuality(values.enhanceQuality);
    return {
        toolId: SCALE_UP_TOOL_ID,
        prompt: buildScaleUpPrompt(values, output),
        references: [toScaleUpReference(source)],
        ...(model && model.trim() ? { model: model.trim() } : {}),
        size: `${output.width}x${output.height}`,
        quality: quality.providerQuality,
        count: 1,
        fields: buildScaleUpFields(values, output, source, draftRevision),
    };
}

export function buildScaleUpFields(values: ScaleUpValues, output: ScaleUpOutput, source: Pick<ScaleUpSourceAsset, "assetId" | "width" | "height" | "name">, _draftRevision: number | string | null = null): Record<string, unknown> {
    // 只写 gateway TOOL_ADAPTER_TABLE.SCALE_UP 允许的字段，避免出现“声明了却不参与指纹/展示”的死字段。
    return {
        imageUrl: source.assetId,
        imageName: values.imageName || source.name || "",
        magnification: output.magnification,
        enhanceFace: values.enhanceFace,
        enhanceQuality: values.enhanceQuality,
        imageOutputWidth: output.width,
        imageOutputHeight: output.height,
    };
}

/**
 * 防丢参守卫：提交前逐个断言“页面上的配置已进入真实请求”。
 * 任何一项对不上就抛错，绝不带着降级配置发请求。
 */
export function assertScaleUpInput(input: BrowserToolInput, values: ScaleUpValues, output: ScaleUpOutput): void {
    const problems: string[] = [];
    if (input.toolId !== SCALE_UP_TOOL_ID) problems.push(`toolId 必须是 ${SCALE_UP_TOOL_ID}`);
    const expectedSize = `${output.width}x${output.height}`;
    if (input.size !== expectedSize) problems.push(`输出尺寸未生效（期望 ${expectedSize}，实际 ${input.size ?? "空"}）`);
    const expectedQuality = scaleUpQuality(values.enhanceQuality).providerQuality;
    if (input.quality !== expectedQuality) problems.push(`质量档位未生效（期望 ${expectedQuality}，实际 ${input.quality ?? "空"}）`);
    if (input.count !== 1) problems.push("高清放大一次只产出一张");
    const fields = (input.fields ?? {}) as Record<string, unknown>;
    if (fields.enhanceFace !== values.enhanceFace) problems.push("面部美化未进入请求");
    if (Number(fields.magnification) !== output.magnification) problems.push("倍率模式未进入请求");
    if (fields.enhanceQuality !== values.enhanceQuality) problems.push("质量档位未进入请求字段");
    if (Number(fields.imageOutputWidth) !== output.width || Number(fields.imageOutputHeight) !== output.height) {
        problems.push("输出宽高字段与实际尺寸不一致");
    }
    if (!input.prompt?.includes(`${output.width}×${output.height}`)) problems.push("提示词未携带输出尺寸");
    if (!(input.references?.length ?? 0)) problems.push("缺少原图参考");
    if (problems.length) throw new ScaleUpAdapterError("param-dropped", `提交参数校验失败：${problems.join("；")}`);
}

/* ============================== 执行 ============================== */

export type ScaleUpGatewayLike = {
    submit: (input: BrowserToolInput, options?: SubmitOptions) => Promise<ToolTask>;
    waitForResult: (taskId: string, options?: WaitOptions) => Promise<ToolTask>;
    retry?: (taskId: string, input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
};

export type RunScaleUpOptions = {
    gateway: ScaleUpGatewayLike;
    values: ScaleUpValues;
    output: ScaleUpOutput;
    source: ScaleUpSourceAsset;
    model?: string;
    revision?: number | string | null;
    imageModelReady?: boolean;
    signal?: AbortSignal;
    /** 每次任务状态变化回调（submitting → running → succeeded/failed）。 */
    onUpdate?: (task: ToolTask) => void;
    wait?: WaitOptions;
};

export type ScaleUpRun = {
    task: ToolTask;
    snapshot: ScaleUpSnapshot;
    output: ScaleUpOutput;
};

export async function runScaleUp(options: RunScaleUpOptions): Promise<ScaleUpRun> {
    const { gateway, values, output, source, model, revision = null, imageModelReady = true, signal, onUpdate, wait } = options;
    const issues = validateScaleUpState({ values, output, sourceReady: isScaleUpSourceReady(source), imageModelReady });
    if (issues.length) throw new ScaleUpAdapterError("invalid-config", issues[0].message, issues);
    const sourceCheck = validateScaleUpSource(source);
    if (!sourceCheck.ok) throw new ScaleUpAdapterError(sourceCheck.code, sourceCheck.message);

    const input = buildScaleUpInput({ values, output, source, model, draftRevision: revision });
    assertScaleUpInput(input, values, output);
    const snapshot = createScaleUpSnapshot(values, output, { assetId: source.assetId, width: source.width, height: source.height }, revision);

    const submitted = await gateway.submit(input, { signal, draftRevision: revision });
    onUpdate?.(submitted);
    if (submitted.status === "succeeded" || submitted.status === "failed" || submitted.status === "unknown") {
        return { task: submitted, snapshot, output };
    }
    const final = await gateway.waitForResult(submitted.id, { ...wait, signal, onUpdate });
    return { task: final, snapshot, output };
}

export type RetryScaleUpOptions = RunScaleUpOptions & { taskId: string };

/** 同快照重试：输入完全按当前配置重建并再次守卫，避免“重试”实际换了参数。 */
export async function retryScaleUp(options: RetryScaleUpOptions): Promise<ScaleUpRun> {
    const { gateway, values, output, source, model, revision = null, imageModelReady = true, signal, onUpdate, wait, taskId } = options;
    if (!gateway.retry) throw new ScaleUpAdapterError("retry-unsupported", "当前网关不支持按任务重试。");
    const issues = validateScaleUpState({ values, output, sourceReady: isScaleUpSourceReady(source), imageModelReady });
    if (issues.length) throw new ScaleUpAdapterError("invalid-config", issues[0].message, issues);
    const input = buildScaleUpInput({ values, output, source, model, draftRevision: revision });
    assertScaleUpInput(input, values, output);
    const snapshot = createScaleUpSnapshot(values, output, { assetId: source.assetId, width: source.width, height: source.height }, revision);
    const retried = await gateway.retry(taskId, input, { ...wait, signal, onUpdate });
    onUpdate?.(retried);
    if (retried.status === "succeeded" || retried.status === "failed" || retried.status === "unknown") {
        return { task: retried, snapshot, output };
    }
    const final = await gateway.waitForResult(retried.id, { ...wait, signal, onUpdate });
    return { task: final, snapshot, output };
}

/* ============================== 结果 ============================== */

export type ScaleUpResult = {
    taskId?: string;
    status: ToolTask["status"];
    items: ToolTaskResultItem[];
    /** 结果来自旧版本（源图/配置已变更），不能当作当前配置的产物。 */
    stale: boolean;
    error?: { code: string; message: string; retryable: boolean };
};

export function scaleUpResultFromTask(task: ToolTask | undefined, lastSnapshot?: ScaleUpSnapshot, currentSnapshot?: ScaleUpSnapshot): ScaleUpResult {
    return {
        ...(task?.id ? { taskId: task.id } : {}),
        status: task?.status ?? "draft",
        items: task?.result?.items ?? [],
        stale: isScaleUpSnapshotStale(lastSnapshot, currentSnapshot),
        ...(task?.error ? { error: task.error } : {}),
    };
}

/** 结果图与源图做前后对比时用的地址（结果可能是 dataUrl 或已入库 URL）。 */
export function firstResultImageSource(task?: ToolTask | null): string | undefined {
    const item = task?.result?.items.find((entry) => entry.kind === "image" && (entry.dataUrl || entry.url));
    return item?.dataUrl ?? item?.url;
}

/* ============================== 人脸可用性 ============================== */

export type FaceAvailability = "detected" | "absent" | "unavailable";

type FaceDetectorLike = { detect: (image: unknown) => Promise<Array<unknown>> };

/**
 * 面部美化的可用性：浏览器有 FaceDetector 就真检测；没有就返回 unavailable，
 * UI 只提示“由模型判断”，不会因为检测缺失而假装已识别人脸。
 */
export async function detectScaleUpFace(src: string | undefined, detector?: FaceDetectorLike | null): Promise<FaceAvailability> {
    if (!src) return "unavailable";
    const candidate = detector ?? (globalThis as { FaceDetector?: new (options?: { fastMode?: boolean }) => FaceDetectorLike }).FaceDetector;
    if (!candidate) return "unavailable";
    if (typeof Image === "undefined") return "unavailable";
    try {
        const instance = typeof candidate === "function" ? new (candidate as unknown as new (options?: { fastMode?: boolean }) => FaceDetectorLike)({ fastMode: true }) : candidate;
        const image = new Image();
        image.crossOrigin = "anonymous";
        const loaded = await new Promise<boolean>((resolve) => {
            image.onload = () => resolve(true);
            image.onerror = () => resolve(false);
            image.src = src;
        });
        if (!loaded) return "unavailable";
        const faces = await instance.detect(image);
        return faces.length > 0 ? "detected" : "absent";
    } catch {
        return "unavailable";
    }
}
