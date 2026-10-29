import type { ReferenceImage } from "@/types/image";
import type { AiConfig } from "@/stores/use-config-store";
import type { ProviderPort, WaitOptions, BrowserToolInput } from "@/services/api/tools/gateway";
import { createToolGateway } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
import type { ToolAssetRecord } from "@/services/api/tools/assets";

import {
    IMAGE_TO_VIDEO_TOOL_ID,
    IMAGE_TO_VIDEO_UPLOAD,
    buildImageToVideoPrompt,
    createImageToVideoSnapshot,
    imageToVideoExpectedCount,
    ratioValueOf,
    resolutionValueOf,
    validateImageToVideoState,
    videoTypeOf,
    type ImageToVideoAssetRef,
    type ImageToVideoSnapshot,
    type ImageToVideoValues,
} from "@/features/tools/registry/image-to-video";

/**
 * TASK-041 / IMAGE_TO_VIDEO 运行适配器。
 *
 * 真实边界：
 * - 提交走 `createToolGateway()` → `realProviderPort` → `services/api/video.ts`
 *   （createVideoGenerationTask / pollVideoGenerationTask），不伪造任何成功；
 * - 时长/分辨率/比例/首尾帧模式必须真的进入 provider 请求：通过“合并后的 config”
 *   传给网关（videoSeconds / vquality / size / videoMode），而不是只写进 fields 展示；
 * - fields 只参与指纹与 UI 快照，不当作上游参数。
 */

export type ImageToVideoAdapterErrorCode =
    | "reference-missing"
    | "reference-too-many"
    | "reference-unusable"
    | "first-frame-missing"
    | "last-frame-unusable"
    | "model-missing"
    | "prompt-missing";

export class ImageToVideoAdapterError extends Error {
    readonly code: ImageToVideoAdapterErrorCode;

    constructor(code: ImageToVideoAdapterErrorCode, message: string) {
        super(message);
        this.name = "ImageToVideoAdapterError";
        this.code = code;
    }
}

/** 资产记录 / 草稿恢复后的最小形状（记录与会话对象都能吃）。 */
export type ImageToVideoAssetLike = {
    id?: string;
    name?: string;
    mimeType?: string;
    type?: string;
    url?: string;
    dataUrl?: string;
    storageKey?: string;
    width?: number;
    height?: number;
    bytes?: number;
};

export type ImageToVideoFrameRole = "reference" | "first-frame" | "last-frame";

const ROLE_PREFIX: Record<ImageToVideoFrameRole, string> = {
    reference: "i2v-ref",
    "first-frame": "i2v-first",
    "last-frame": "i2v-last",
};

/**
 * 资产 → ReferenceImage。
 * dataUrl 允许为空：`imageToDataUrl()` 会按 storageKey/url 现场取 Blob 再转 data URL，
 * 因此这里绝不为了“看起来完整”而编造 base64。
 */
export function toImageToVideoReference(asset: ImageToVideoAssetLike, role: ImageToVideoFrameRole = "reference"): ReferenceImage {
    const url = (asset.url ?? "").trim();
    const dataUrl = (asset.dataUrl ?? "").trim();
    const storageKey = (asset.storageKey ?? "").trim();
    if (!url && !dataUrl && !storageKey) {
        throw new ImageToVideoAdapterError(
            role === "last-frame" ? "last-frame-unusable" : role === "first-frame" ? "first-frame-missing" : "reference-unusable",
            `素材「${asset.name ?? asset.id ?? "未命名"}」缺少可用地址（dataUrl/url/storageKey 均为空）`,
        );
    }
    const id = (asset.id ?? "").trim() || `${ROLE_PREFIX[role]}-${(asset.name ?? "upload").replace(/\s+/g, "-")}`;
    return {
        id,
        name: asset.name ?? `${id}.png`,
        type: asset.mimeType ?? asset.type ?? "image/png",
        dataUrl,
        ...(url ? { url } : {}),
        ...(storageKey ? { storageKey } : {}),
    };
}

export function imageToVideoSourceFromRecord(record: ToolAssetRecord): ImageToVideoAssetLike {
    return {
        id: record.id,
        name: record.name,
        mimeType: record.mimeType,
        url: record.url,
        storageKey: record.storageKey,
        width: record.width,
        height: record.height,
        bytes: record.bytes,
    };
}

/** 上传约束与 registry 同源，失败信息可定位到具体文件。 */
export function validateImageToVideoSourceSize(asset: ImageToVideoAssetLike): { ok: true } | { ok: false; message: string } {
    const width = asset.width ?? 0;
    const height = asset.height ?? 0;
    if (!width || !height) return { ok: true };
    if (width < IMAGE_TO_VIDEO_UPLOAD.minSide || height < IMAGE_TO_VIDEO_UPLOAD.minSide) {
        return { ok: false, message: `短边需 ≥ ${IMAGE_TO_VIDEO_UPLOAD.minSide}px，当前 ${width}×${height}` };
    }
    if (width > IMAGE_TO_VIDEO_UPLOAD.maxSide || height > IMAGE_TO_VIDEO_UPLOAD.maxSide) {
        return { ok: false, message: `长边需 ≤ ${IMAGE_TO_VIDEO_UPLOAD.maxSide}px，当前 ${width}×${height}` };
    }
    const ratio = width / height;
    if (ratio < IMAGE_TO_VIDEO_UPLOAD.minRatio || ratio > IMAGE_TO_VIDEO_UPLOAD.maxRatio) {
        return { ok: false, message: `宽高比需在 ${IMAGE_TO_VIDEO_UPLOAD.minRatio}～${IMAGE_TO_VIDEO_UPLOAD.maxRatio} 之间，当前 ${ratio.toFixed(2)}` };
    }
    return { ok: true };
}

export type ImageToVideoSources = {
    references?: ImageToVideoAssetLike[];
    firstFrame?: ImageToVideoAssetLike;
    lastFrame?: ImageToVideoAssetLike;
};

/**
 * 素材模式 → 实际发送的参考图有序列表。
 * 首尾帧：首帧在前、尾帧在后（provider 端按顺序映射 first_frame / last_frame）；
 * 参考素材 / 商品链接：按用户上传顺序，最多 9 张。
 */
export function resolveImageToVideoReferences(values: ImageToVideoValues, sources: ImageToVideoSources): ReferenceImage[] {
    if (values.sourceMode === "frames") {
        if (!sources.firstFrame) {
            throw new ImageToVideoAdapterError("first-frame-missing", "首尾帧模式必须先提供首帧图片");
        }
        const refs = [toImageToVideoReference(sources.firstFrame, "first-frame")];
        if (sources.lastFrame) refs.push(toImageToVideoReference(sources.lastFrame, "last-frame"));
        return refs;
    }

    const assets = (sources.references ?? []).slice(0, IMAGE_TO_VIDEO_UPLOAD.maxCount);
    if (assets.length === 0) {
        throw new ImageToVideoAdapterError(
            "reference-missing",
            values.sourceMode === "product-link" ? "商品链接模式仍需至少 1 张参考图" : "参考素材模式至少需要 1 张图",
        );
    }
    if ((sources.references ?? []).length > IMAGE_TO_VIDEO_UPLOAD.maxCount) {
        throw new ImageToVideoAdapterError("reference-too-many", `参考图最多 ${IMAGE_TO_VIDEO_UPLOAD.maxCount} 张，当前 ${sources.references?.length} 张`);
    }
    return assets.map((asset) => toImageToVideoReference(asset, "reference"));
}

/** 页面侧资产校验（与 registry 同一套规则，错误定位到文件）。 */
export function assertImageToVideoSources(values: ImageToVideoValues, sources: ImageToVideoSources): void {
    const checked = [
        ...(values.sourceMode === "frames"
            ? [sources.firstFrame, sources.lastFrame].filter((item): item is ImageToVideoAssetLike => Boolean(item))
            : (sources.references ?? []).slice(0, IMAGE_TO_VIDEO_UPLOAD.maxCount)),
    ];
    for (const asset of checked) {
        const size = validateImageToVideoSourceSize(asset);
        if (!size.ok) {
            throw new ImageToVideoAdapterError("reference-unusable", `${asset.name ?? asset.id ?? "素材"}：${size.message}`);
        }
    }
}

/** 27 字段快照（与 gateway 契约一致）：全部显式赋值，字段缺失时用空值表示“本页不采集”，不用 undefined 混淆。 */
export function buildImageToVideoFields(
    values: ImageToVideoValues,
    references: readonly ReferenceImage[],
    prompt: string,
): Record<string, unknown> {
    const first = references[0];
    const last = references.length > 1 ? references[references.length - 1] : undefined;
    return {
        aspectRatio: values.aspectRatio,
        duration: String(values.duration),
        extension: "mp4",
        fileKey: first?.storageKey ?? "",
        fileName: first?.name ?? "",
        imageInputMode: values.imageInputMode,
        imageList: references.map((item) => ({ id: item.id, name: item.name, url: item.url ?? item.dataUrl ?? "", type: item.type })),
        imageUrl: first?.url ?? first?.dataUrl ?? "",
        isPro: values.isPro,
        language: values.language,
        lastFrameImageUrl: values.sourceMode === "frames" ? last?.url ?? last?.dataUrl ?? "" : "",
        productInfo: values.productInfo.trim(),
        productUrl: values.productUrl.trim(),
        prompt: prompt.trim(),
        promptOptimizer: values.promptOptimizer,
        referenceAudios: [],
        referenceDocument: "",
        referenceVideo: "",
        saleCountry: values.saleCountry,
        size: ratioValueOf(values.aspectRatio),
        sourceImageUrl: first?.url ?? first?.dataUrl ?? "",
        templateKey: values.templateKey,
        templateName: values.templateName,
        thumbUrl: "",
        url: values.productUrl.trim() || first?.url || first?.dataUrl || "",
        videoTime: String(values.duration),
        videoType: values.videoType,
    };
}

/**
 * 页面配置 → provider 真实参数。
 * 这是本适配器最关键的一步：duration / resolution / ratio / 首尾帧模式必须落到
 * AiConfig 的 videoSeconds / vquality / size / videoMode，否则页面控件就是装饰。
 */
export function buildImageToVideoConfig(config: AiConfig, values: ImageToVideoValues): AiConfig {
    const model = (values.modelId || config.videoModel).trim();
    if (!model) {
        throw new ImageToVideoAdapterError("model-missing", "未选择视频模型：请先在设置里配置可用的视频模型");
    }
    const framesMode = values.sourceMode === "frames";
    return {
        ...config,
        model,
        videoModel: model,
        videoSeconds: String(values.duration),
        vquality: resolutionValueOf(values.resolution),
        size: ratioValueOf(values.aspectRatio),
        // 首尾帧进入 provider 的 frames 模式；其余走 reference 模式。
        videoMode: framesMode ? "frames" : "reference",
    };
}

export type ImageToVideoRunOptions = {
    values: ImageToVideoValues;
    sources: ImageToVideoSources;
    config: AiConfig;
    /** 测试注入的 provider 端口；生产不传，走 realProviderPort。 */
    port?: ProviderPort;
    signal?: AbortSignal;
    draftRevision?: number | string | null;
    onTask?: (task: ToolTask) => void;
    /** 轮询节奏/次数覆盖（生产不传，默认 30 分钟预算）。 */
    wait?: Omit<WaitOptions, "signal" | "draftRevision" | "onUpdate">;
    dedupe?: boolean;
};

export type ImageToVideoRun = {
    task: ToolTask;
    snapshot: ImageToVideoSnapshot;
    prompt: string;
    references: ReferenceImage[];
    model: string;
};

function assetRefs(sources: ImageToVideoSources): ImageToVideoAssetRef[] {
    const map = (asset: ImageToVideoAssetLike | undefined): ImageToVideoAssetRef[] =>
        asset ? [{ id: asset.id ?? "", name: asset.name, width: asset.width, height: asset.height, mimeType: asset.mimeType, bytes: asset.bytes }] : [];
    return [...(sources.references ?? []).map((asset) => ({ id: asset.id ?? "", name: asset.name, width: asset.width, height: asset.height, mimeType: asset.mimeType, bytes: asset.bytes })), ...map(sources.firstFrame), ...map(sources.lastFrame)];
}

/**
 * 提交一次真实视频任务并等待到终态。
 *
 * - 页面校验失败 → 抛 ImageToVideoAdapterError（不发请求，不落假任务）；
 * - 上游失败/超时由网关状态机表达（failed / unknown），本函数不把 unknown 改写成 failed；
 * - 合并后的 config 通过自定义 getConfig 注入，保证时长/比例/清晰度/模式真的发给 provider。
 */
export async function runImageToVideo(options: ImageToVideoRunOptions): Promise<ImageToVideoRun> {
    const { values, sources, config } = options;
    const issues = validateImageToVideoState(values, {
        references: assetRefs(sources),
        firstFrame: sources.firstFrame
            ? { id: sources.firstFrame.id ?? "", name: sources.firstFrame.name, width: sources.firstFrame.width, height: sources.firstFrame.height }
            : undefined,
        lastFrame: sources.lastFrame
            ? { id: sources.lastFrame.id ?? "", name: sources.lastFrame.name, width: sources.lastFrame.width, height: sources.lastFrame.height }
            : undefined,
    });
    if (issues.blockers.length > 0) {
        throw new ImageToVideoAdapterError("prompt-missing", issues.blockers.join("；"));
    }

    assertImageToVideoSources(values, sources);
    const references = resolveImageToVideoReferences(values, sources);
    const prompt = buildImageToVideoPrompt(values);
    if (!prompt.trim()) {
        throw new ImageToVideoAdapterError("prompt-missing", "提示词为空：模板描述与自定义描述都不可用时拒绝提交");
    }
    const mergedConfig = buildImageToVideoConfig(config, values);
    const fields = buildImageToVideoFields(values, references, prompt);
    const snapshot = createImageToVideoSnapshot(values);

    const gateway = createToolGateway({
        getConfig: () => mergedConfig,
        ...(options.port ? { provider: options.port } : {}),
    });

    const input: BrowserToolInput = {
        toolId: IMAGE_TO_VIDEO_TOOL_ID,
        prompt,
        references,
        model: mergedConfig.model,
        size: mergedConfig.size,
        quality: values.resolution,
        count: imageToVideoExpectedCount(),
        fields,
    };

    const task = await gateway.runTool(input, {
        signal: options.signal,
        dedupe: options.dedupe ?? false,
        draftRevision: options.draftRevision ?? null,
        ...(options.wait ?? {}),
        onUpdate: (next) => options.onTask?.(next),
    });

    return { task, snapshot, prompt, references, model: mergedConfig.model };
}

/** 任务结果项：一个任务只产出一个视频。 */
export function imageToVideoResultItems(task?: ToolTask | null): ToolTaskResultItem[] {
    return task?.result?.items ?? [];
}

export type ImageToVideoResultCell = {
    index: number;
    status: "filled" | "pending" | "failed";
    item: ToolTaskResultItem | null;
};

/**
 * 结果区按“期望 1 个视频”铺格子：
 * 成功但没 URL → failed（不允许空结果冒充成功）；运行中 → pending；失败 → failed 并保留错误位。
 */
export function imageToVideoResultCell(task?: ToolTask | null): ImageToVideoResultCell {
    const item = imageToVideoResultItems(task)[0] ?? null;
    if (!task) return { index: 0, status: "pending", item: null };
    if (task.status === "succeeded") {
        /* 刷新后 url/blob 都会被剥离，字节仍在 IndexedDB（storageKey）——这同样可播放/可下载，
         * 不能因为内存里的 url 没了就误报「上游返回为空」。只有 storageKey 也没有、或被标 payloadDropped 才算缺。 */
        const playable = Boolean(item?.url || item?.blob || (item?.storageKey && !item?.payloadDropped));
        return { index: 0, status: playable ? "filled" : "failed", item };
    }
    if (task.status === "failed" || task.status === "cancelled" || task.status === "unknown") {
        return { index: 0, status: "failed", item };
    }
    return { index: 0, status: "pending", item };
}

/** 结果区文案：状态 + 与当前配置是否一致（旧版本结果不能冒充当前配置）。 */
export function describeImageToVideoResult(input: {
    task?: ToolTask | null;
    snapshot?: ImageToVideoSnapshot;
    drift: readonly string[];
}): { tone: "empty" | "running" | "succeeded" | "failed" | "stale"; title: string; detail: string } {
    const { task, snapshot, drift } = input;
    if (!task) {
        return {
            tone: "empty",
            title: "还没有生成结果",
            detail: "配置素材、视频类型和时长后点击生成；结果区只展示真实任务产出。",
        };
    }
    const stale = drift.length > 0;
    const driftText = stale ? `当前配置已变更（${drift.join("、")}），下方结果来自旧版本快照 ${snapshot?.hash ?? ""}。` : "";
    if (task.status === "succeeded") {
        const cell = imageToVideoResultCell(task);
        if (cell.status !== "filled") {
            return { tone: "failed", title: "任务标记成功但没有可播放视频", detail: "已记录上游返回为空，可查看快照后重试。" };
        }
        return {
            tone: stale ? "stale" : "succeeded",
            title: stale ? "结果来自旧版本配置" : "视频生成完成",
            detail: driftText || `模型 ${task.configSnapshot.model} · ${task.pollCount} 次轮询`,
        };
    }
    if (task.status === "failed" || task.status === "cancelled") {
        return {
            tone: "failed",
            title: task.status === "cancelled" ? "任务已取消" : "任务失败",
            detail: [task.error?.message, driftText].filter(Boolean).join(" ") || "上游未返回原因，可按同一快照重试。",
        };
    }
    if (task.status === "unknown") {
        return {
            tone: "failed",
            title: "任务状态未知",
            detail: "网关无法确认上游是否已产出，先查询再决定是否重试，避免重复计费。",
        };
    }
    return {
        tone: "running",
        title: "正在生成视频",
        detail: [stale ? driftText : "", `已轮询 ${task.pollCount} 次`].filter(Boolean).join(" "),
    };
}
