/**
 * TASK-048 结果资产服务：工具结果 → 资产库 / 画布（唯一权威实现）
 *
 * 约束（technical_design / ui_brief / AC-008）：
 * - 只走真实链路：image-storage.uploadImage / file-storage.uploadMediaFile / use-asset-store / canvas-store。
 *   不存在任何“假保存/假成功”分支：0 字节、拉取失败、找不到画布一律失败并给出可读原因。
 * - 字段全量保留：resultId/taskId/toolId/draftRevision/prompt/model/sourceAssetIds/mimeType/bytes/宽高/时长/扩展 metadata
 *   全部写入资产 metadata，并随画布节点 metadata 下发，UI 不需要二次查任务。
 * - 幂等：同一 toolId+taskId+resultId 重复入库只更新同一条资产并 revision+1，不产生重复资产。
 * - 每次写操作返回 undo 句柄（新建→删除；覆盖→恢复快照；画布→摘除节点）。
 * - stale：二进制缺失、来源被替换、草稿版本不一致时，资产/节点必须带 staleReasons。
 * - 能力门禁：resultCapability 是按钮可用性唯一依据（预览/下载/入库/发送画布/播放）。
 */
import type { UploadedImage } from "@/services/image-storage";
import type { StoreMediaOptions, UploadedFile } from "@/services/file-storage";
import type { CanvasNodeData, CanvasNodeMetadata, Position } from "@/types/canvas";
import type { Asset, AssetUpsertResult } from "@/stores/use-asset-store";
import type { ToolTaskResultItem } from "./task-machine";

/* ------------------------------------------------------------------ 类型 */

export type ResultPayloadKind = "image" | "video";

/** 结果项：任务结果字段 + 结果页已有展示/追溯字段，全部透传。 */
export type ResultItem = Pick<ToolTaskResultItem, "id" | "kind" | "dataUrl" | "url" | "mimeType" | "bytes" | "blob" | "payloadDropped"> & {
    title?: string;
    tags?: string[];
    width?: number;
    height?: number;
    durationMs?: number;
    /** 结果生成时的草稿版本快照。 */
    draftRevision?: number;
    /** 上游显式标记过期（例如源文件被替换）。 */
    stale?: boolean;
    metadata?: Record<string, unknown>;
};

export type ResultAssetContext = {
    toolId: string;
    taskId?: string;
    prompt?: string;
    model?: string;
    sourceAssetIds?: string[];
    /** 当前草稿版本；与结果携带版本不同则入库后标记 stale。 */
    draftRevision?: number;
    title?: string;
    tags?: string[];
    note?: string;
    source?: string;
    signal?: AbortSignal;
};

export type ResultAssetErrorCode =
    | "payload-missing"
    | "payload-dropped"
    | "unsupported-kind"
    | "empty-media"
    | "upload-failed"
    | "project-not-found"
    | "canvas-write-failed"
    | "stale-result"
    | "aborted";

export class ResultAssetError extends Error {
    readonly code: ResultAssetErrorCode;
    readonly retryable: boolean;
    readonly resultId?: string;

    constructor(code: ResultAssetErrorCode, message: string, options: { retryable?: boolean; resultId?: string; cause?: unknown } = {}) {
        super(message);
        this.name = "ResultAssetError";
        this.code = code;
        this.retryable = options.retryable ?? false;
        this.resultId = options.resultId;
        if (options.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
    }
}

export const RESULT_STALE_REASONS = ["payload-dropped", "media-missing", "draft-revision-mismatch", "source-replaced"] as const;
export type ResultStaleReason = (typeof RESULT_STALE_REASONS)[number];

export type ResultStaleState = { stale: boolean; reasons: ResultStaleReason[]; message?: string };
export type ResultCapabilityBlocker = { code: ResultAssetErrorCode | ResultStaleReason; message: string };

export type ResultCapability = {
    preview: boolean;
    download: boolean;
    saveAsset: boolean;
    sendCanvas: boolean;
    playable: boolean;
    blockers: ResultCapabilityBlocker[];
};

export type ResultUndoAction =
    | { kind: "none" }
    | { kind: "remove-asset"; assetId: string; key: string; storageKey?: string }
    | { kind: "restore-asset"; asset: Asset }
    | { kind: "remove-canvas-node"; projectId: string; nodeId: string; createdProject: boolean };

/* ------------------------------------------------------------- 纯函数层 */

/** 真实类型以 mimeType 为准：上游把视频塞进 image 槽位时，画布必须建 video 节点。 */
export function resolveResultKind(item: Pick<ResultItem, "kind" | "mimeType">): ResultPayloadKind {
    const mime = (item.mimeType ?? "").toLowerCase();
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("image/")) return "image";
    return item.kind === "video" ? "video" : "image";
}

export function hasResultPayload(item: Pick<ResultItem, "blob" | "dataUrl" | "url">): boolean {
    return Boolean(item.blob) || Boolean(item.dataUrl) || Boolean(item.url);
}

const STALE_TEXT: Record<ResultStaleReason, string> = {
    "payload-dropped": "结果文件已被清理，请重新生成",
    "media-missing": "结果媒体已丢失，无法预览或入库",
    "draft-revision-mismatch": "该结果来自旧版本草稿，与当前配置不一致",
    "source-replaced": "源文件已替换，该结果已过期",
};

/** 过期判定：事实（二进制是否在）+ 版本（草稿 revision）+ 上游标记，三者都要暴露。 */
export function resultStaleness(
    item: Pick<ResultItem, "payloadDropped" | "blob" | "dataUrl" | "url" | "draftRevision" | "stale">,
    ctx: { draftRevision?: number } = {},
): ResultStaleState {
    const reasons: ResultStaleReason[] = [];
    if (item.payloadDropped) reasons.push("payload-dropped");
    if (!hasResultPayload(item)) reasons.push("media-missing");
    if (item.stale) reasons.push("source-replaced");
    if (typeof ctx.draftRevision === "number" && typeof item.draftRevision === "number" && ctx.draftRevision !== item.draftRevision) reasons.push("draft-revision-mismatch");
    const unique = Array.from(new Set(reasons));
    return {
        stale: unique.length > 0,
        reasons: unique,
        message: unique.length > 0 ? unique.map((reason) => STALE_TEXT[reason]).join("；") : undefined,
    };
}

/** 能力门禁：按钮 disabled / 菜单遮挡都必须来自这里。 */
export function resultCapability(item: ResultItem, ctx: { draftRevision?: number } = {}): ResultCapability {
    const kind = resolveResultKind(item);
    const hasPayload = hasResultPayload(item);
    const supported = item.kind === "image" || item.kind === "video";
    const usable = supported && hasPayload && !item.payloadDropped;
    const stale = resultStaleness(item, ctx);
    const blockers: ResultCapabilityBlocker[] = [];
    if (!supported) blockers.push({ code: "unsupported-kind", message: `暂不支持的结 果类型：${String(item.kind)}` });
    if (item.payloadDropped) blockers.push({ code: "payload-dropped", message: STALE_TEXT["payload-dropped"] });
    else if (!hasPayload) blockers.push({ code: "media-missing", message: STALE_TEXT["media-missing"] });
    for (const reason of stale.reasons) {
        if (reason === "payload-dropped" || reason === "media-missing") continue;
        blockers.push({ code: reason, message: STALE_TEXT[reason] });
    }
    return {
        preview: usable,
        download: usable,
        saveAsset: usable,
        sendCanvas: usable,
        playable: usable && kind === "video",
        blockers,
    };
}

/** 幂等键：同一任务同一结果重复入库 => 同一条资产（不含 revision，重新生成是新结果）。 */
export function resultAssetKey(item: Pick<ResultItem, "id">, ctx: Pick<ResultAssetContext, "toolId" | "taskId">): string {
    return `tool-result:${ctx.toolId}:${ctx.taskId ?? "task"}:${item.id}`;
}

export function resultAssetTitle(item: Pick<ResultItem, "id" | "title">, ctx: Pick<ResultAssetContext, "toolId" | "title">): string {
    return ctx.title?.trim() || item.title?.trim() || `${ctx.toolId} 结果 ${item.id}`;
}

export function describeResultError(error: unknown): { code: string; message: string; retryable: boolean } {
    if (error instanceof ResultAssetError) return { code: error.code, message: error.message, retryable: error.retryable };
    const message = error instanceof Error ? error.message : String(error);
    return { code: "unknown", message: message || "未知错误", retryable: true };
}

/* ------------------------------------------------------------- 依赖注入 */

export type ResultAssetDeps = {
    uploadImage: (input: string, options?: { signal?: AbortSignal }) => Promise<UploadedImage>;
    storeMedia: (input: string | Blob, prefix?: string, options?: StoreMediaOptions) => Promise<UploadedFile>;
    findAssetByKey: (key: string) => Asset | undefined;
    upsertAsset: (asset: Omit<Asset, "id" | "createdAt" | "updatedAt">, options?: { key?: string }) => AssetUpsertResult;
    replaceAsset: (asset: Asset) => void;
    removeAssets: (ids: readonly string[]) => void;
};

export type ResultCanvasDeps = {
    findProject: (projectId: string) => { id: string; nodes: CanvasNodeData[] } | undefined;
    createProject: (title?: string) => string;
    updateProject: (projectId: string, nodes: CanvasNodeData[]) => void;
    removeProjects?: (ids: string[]) => void;
    createNode: (type: "image" | "video", position: Position, metadata?: CanvasNodeMetadata) => CanvasNodeData;
    imageMetadata: (image: UploadedImage) => CanvasNodeMetadata;
    videoMetadata: (video: UploadedFile) => CanvasNodeMetadata;
};

async function loadAssetDeps(): Promise<ResultAssetDeps> {
    const [{ useAssetStore }, imageStorage, fileStorage] = await Promise.all([import("@/stores/use-asset-store"), import("@/services/image-storage"), import("@/services/file-storage")]);
    return {
        uploadImage: (input, options) => imageStorage.uploadImage(input, options),
        storeMedia: fileStorage.uploadMediaFile,
        findAssetByKey: (key) => useAssetStore.getState().assets.find((asset) => asset.metadata?.resultAssetKey === key),
        upsertAsset: (asset, options) => useAssetStore.getState().upsertAsset(asset, options),
        replaceAsset: (asset) => useAssetStore.getState().replaceAsset(asset),
        removeAssets: (ids) => useAssetStore.getState().removeAssets(ids),
    };
}

const ASSET_DEP_KEYS: (keyof ResultAssetDeps)[] = ["uploadImage", "storeMedia", "findAssetByKey", "upsertAsset", "replaceAsset", "removeAssets"];

/** 全量注入时直接使用（测试/嵌入方），避免无谓地拉 zustand/localforage。 */
async function resolveAssetDeps(input: Partial<ResultAssetDeps>): Promise<ResultAssetDeps> {
    if (ASSET_DEP_KEYS.every((key) => typeof input[key] === "function")) return input as ResultAssetDeps;
    return { ...(await loadAssetDeps()), ...input };
}

const CANVAS_DEP_KEYS: (keyof ResultCanvasDeps)[] = ["findProject", "createProject", "updateProject", "createNode", "imageMetadata", "videoMetadata"];

async function resolveCanvasDeps(input: Partial<ResultCanvasDeps>): Promise<ResultCanvasDeps> {
    if (CANVAS_DEP_KEYS.every((key) => typeof input[key] === "function")) return input as ResultCanvasDeps;
    return { ...(await loadCanvasDeps()), ...input };
}

async function loadCanvasDeps(): Promise<ResultCanvasDeps> {
    const [{ useCanvasStore }, factory] = await Promise.all([import("@/stores/canvas/use-canvas-store"), import("@/lib/canvas/canvas-node-factory")]);
    return {
        findProject: (projectId) => useCanvasStore.getState().projects.find((project) => project.id === projectId),
        createProject: (title) => useCanvasStore.getState().createProject(title),
        updateProject: (projectId, nodes) => useCanvasStore.getState().updateProject(projectId, { nodes }),
        removeProjects: (ids) => useCanvasStore.getState().deleteProjects(ids),
        createNode: factory.createCanvasNode,
        imageMetadata: factory.imageMetadata,
        videoMetadata: factory.videoMetadata,
    };
}

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw new ResultAssetError("aborted", "操作已取消。", { retryable: true });
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function dedupeTags(tags: readonly (string | undefined)[]) {
    return Array.from(new Set(tags.filter((tag): tag is string => Boolean(tag && tag.trim()))));
}

function assertUsable(item: ResultItem) {
    if (item.kind !== "image" && item.kind !== "video") throw new ResultAssetError("unsupported-kind", `暂不支持的结 果类型：${String(item.kind)}`, { resultId: item.id });
    if (item.payloadDropped) throw new ResultAssetError("payload-dropped", STALE_TEXT["payload-dropped"], { resultId: item.id });
    if (!hasResultPayload(item)) throw new ResultAssetError("payload-missing", STALE_TEXT["media-missing"], { retryable: true, resultId: item.id });
}

/* ------------------------------------------------------------------ 入库 */

export type IngestResultOutcome = {
    ok: true;
    itemId: string;
    assetId: string;
    kind: ResultPayloadKind;
    created: boolean;
    revision: number;
    stale: boolean;
    staleReasons: ResultStaleReason[];
    storageKey?: string;
    undo: ResultUndoAction;
};

export type ResultItemOutcome = { itemId: string; ok: true; result: IngestResultOutcome } | { itemId: string; ok: false; error: { code: string; message: string; retryable: boolean } };

/**
 * 真实入库：图片走 image-storage（缩略图+宽高），视频走 file-storage（mime 嗅探+时长）。
 * 重复入库同一结果 => 更新同一条资产，revision+1，返回可撤销快照。
 */
export async function ingestResultAsset(item: ResultItem, ctx: ResultAssetContext, depsInput: Partial<ResultAssetDeps> = {}): Promise<IngestResultOutcome> {
    throwIfAborted(ctx.signal);
    assertUsable(item);

    const deps: ResultAssetDeps = await resolveAssetDeps(depsInput);
    const kind = resolveResultKind(item);
    const stale = resultStaleness(item, ctx);

    let uploaded: UploadedImage | UploadedFile;
    try {
        if (kind === "video") {
            uploaded = await deps.storeMedia(item.blob ?? item.dataUrl ?? item.url ?? "", "video", { mimeType: item.mimeType, signal: ctx.signal });
        } else {
            const source = item.dataUrl ?? item.url;
            if (!source) throw new ResultAssetError("payload-missing", STALE_TEXT["media-missing"], { resultId: item.id });
            uploaded = await deps.uploadImage(source, { signal: ctx.signal });
        }
    } catch (error) {
        if (error instanceof ResultAssetError) throw error;
        if (ctx.signal?.aborted) throw new ResultAssetError("aborted", "入库已取消。", { retryable: true, resultId: item.id, cause: error });
        throw new ResultAssetError("upload-failed", `结果入库失败：${error instanceof Error ? error.message : String(error)}`, { retryable: true, resultId: item.id, cause: error });
    }
    if (!uploaded || !Number.isFinite(uploaded.bytes) || uploaded.bytes <= 0) {
        throw new ResultAssetError("empty-media", "上游返回 0 字节内容，已阻止入库（避免污染资产库）。", { retryable: true, resultId: item.id });
    }

    const key = resultAssetKey(item, ctx);
    const previous = deps.findAssetByKey(key);
    const metadata = compact({
        ...(item.metadata ?? {}),
        resultAssetKey: key,
        resultId: item.id,
        taskId: ctx.taskId,
        toolId: ctx.toolId,
        draftRevision: item.draftRevision ?? ctx.draftRevision,
        prompt: ctx.prompt,
        model: ctx.model,
        sourceAssetIds: ctx.sourceAssetIds,
        mimeType: uploaded.mimeType,
        bytes: uploaded.bytes,
        width: uploaded.width,
        height: uploaded.height,
        durationMs: (uploaded as UploadedFile).durationMs,
        staleReasons: stale.reasons.length > 0 ? stale.reasons : undefined,
        staleMessage: stale.message,
    });

    const base = {
        title: resultAssetTitle(item, ctx),
        coverUrl: uploaded.url,
        tags: dedupeTags([...(item.tags ?? []), ...(ctx.tags ?? [])]),
        source: ctx.source ?? ctx.toolId,
        note: ctx.note,
        stale: stale.stale ? true : undefined,
        metadata,
    };
    const data = {
        storageKey: uploaded.storageKey,
        width: uploaded.width ?? 0,
        height: uploaded.height ?? 0,
        bytes: uploaded.bytes,
        mimeType: uploaded.mimeType,
    };
    const record: Omit<Asset, "id" | "createdAt" | "updatedAt"> =
        kind === "video"
            ? { ...base, kind: "video", data: { ...data, url: uploaded.url, durationMs: (uploaded as UploadedFile).durationMs } }
            : { ...base, kind: "image", data: { ...data, dataUrl: uploaded.url } };

    const upserted = deps.upsertAsset(record, { key });
    const undo: ResultUndoAction = previous
        ? { kind: "restore-asset", asset: previous }
        : { kind: "remove-asset", assetId: upserted.id, key, storageKey: uploaded.storageKey };

    return {
        ok: true,
        itemId: item.id,
        assetId: upserted.id,
        kind,
        created: upserted.created,
        revision: upserted.revision,
        stale: stale.stale,
        staleReasons: stale.reasons,
        storageKey: uploaded.storageKey,
        undo,
    };
}

/* ------------------------------------------------------------------ 撤销 */

export async function undoResultAction(undo: ResultUndoAction, depsInput: Partial<ResultAssetDeps> = {}, canvasInput: Partial<ResultCanvasDeps> = {}): Promise<{ undone: boolean; kind: ResultUndoAction["kind"] }> {
    if (undo.kind === "none") return { undone: false, kind: undo.kind };
    if (undo.kind === "remove-asset") {
        const deps = await resolveAssetDeps(depsInput);
        deps.removeAssets([undo.assetId]);
        return { undone: true, kind: undo.kind };
    }
    if (undo.kind === "restore-asset") {
        const deps = await resolveAssetDeps(depsInput);
        deps.replaceAsset(undo.asset);
        return { undone: true, kind: undo.kind };
    }
    const canvas = await resolveCanvasDeps(canvasInput);
    const project = canvas.findProject(undo.projectId);
    if (!project) throw new ResultAssetError("project-not-found", "目标画布已不存在，无法撤销。");
    const nodes = project.nodes.filter((node) => node.id !== undo.nodeId);
    canvas.updateProject(undo.projectId, nodes);
    if (undo.createdProject && nodes.length === 0) canvas.removeProjects?.([undo.projectId]);
    return { undone: true, kind: undo.kind };
}

/* ------------------------------------------------------------ 批量入库 */

export type BatchIngestOutcome = {
    outcomes: ResultItemOutcome[];
    succeeded: number;
    failed: number;
    created: number;
    updated: number;
    stale: number;
    cancelled: boolean;
};

export type BatchIngestOptions = { concurrency?: number; signal?: AbortSignal; onProgress?: (done: number, total: number) => void; deps?: Partial<ResultAssetDeps> };

/** 批量入库：并发上限 + 部分成功；单条失败不影响其它条目，绝不整体回滚冒充成功。 */
export async function ingestResultBatch(items: readonly ResultItem[], ctx: ResultAssetContext, options: BatchIngestOptions = {}): Promise<BatchIngestOutcome> {
    const total = items.length;
    const outcomes: (ResultItemOutcome | undefined)[] = new Array(total);
    const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, 6));
    let cursor = 0;
    let done = 0;
    let cancelled = false;

    const worker = async () => {
        while (cursor < total) {
            if ((options.signal ?? ctx.signal)?.aborted) {
                cancelled = true;
                return;
            }
            const index = cursor++;
            const item = items[index];
            try {
                const result = await ingestResultAsset(item, { ...ctx, signal: options.signal ?? ctx.signal }, options.deps ?? {});
                outcomes[index] = { itemId: item.id, ok: true, result };
            } catch (error) {
                outcomes[index] = { itemId: item.id, ok: false, error: describeResultError(error) };
            } finally {
                done += 1;
                options.onProgress?.(done, total);
            }
        }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));

    const settled = outcomes.map(
        (outcome, index) => outcome ?? ({ itemId: items[index].id, ok: false, error: { code: "aborted", message: "批量入库已取消。", retryable: true } } satisfies ResultItemOutcome),
    );
    return {
        outcomes: settled,
        succeeded: settled.filter((outcome) => outcome.ok).length,
        failed: settled.filter((outcome) => !outcome.ok).length,
        created: settled.filter((outcome) => outcome.ok && outcome.result.created).length,
        updated: settled.filter((outcome) => outcome.ok && !outcome.result.created).length,
        stale: settled.filter((outcome) => outcome.ok && outcome.result.stale).length,
        cancelled,
    };
}

/* -------------------------------------------------------------- 发送画布 */

/** 新节点放在现有内容右侧，不重叠；空画布从原点开始。 */
export function nextResultNodePosition(nodes: readonly CanvasNodeData[]): Position {
    if (nodes.length === 0) return { x: 0, y: 0 };
    const right = nodes.reduce((max, node) => Math.max(max, node.position.x + node.width), Number.NEGATIVE_INFINITY);
    const top = nodes.reduce((min, node) => Math.min(min, node.position.y), Number.POSITIVE_INFINITY);
    return { x: right + 80, y: top };
}

export type SendResultOptions = {
    /** 媒体落库依赖（默认走真实 image/file storage）。 */
    assets?: Partial<ResultAssetDeps>;
    projectId?: string;
    projectTitle?: string;
    position?: Position;
    /** 严格模式：过期结果直接拒绝发送（默认允许发送但节点标记 stale）。 */
    rejectStale?: boolean;
    deps?: Partial<ResultCanvasDeps>;
};

export type SendResultOutcome = {
    projectId: string;
    nodeId: string;
    kind: ResultPayloadKind;
    stale: boolean;
    staleReasons: ResultStaleReason[];
    undo: ResultUndoAction;
};

/** 真实发送画布：先落库媒体（节点只引用 storageKey/objectURL），再建节点写回 project。 */
export async function sendResultToCanvas(item: ResultItem, ctx: ResultAssetContext, options: SendResultOptions = {}): Promise<SendResultOutcome> {
    throwIfAborted(ctx.signal);
    assertUsable(item);

    const stale = resultStaleness(item, ctx);
    if (options.rejectStale && stale.stale) throw new ResultAssetError("stale-result", stale.message ?? "结果已过期，无法发送画布。", { resultId: item.id });

    const deps = await resolveCanvasDeps(options.deps ?? {});
    const media = await resolveAssetDeps(options.assets ?? {});
    const kind = resolveResultKind(item);

    let projectId = options.projectId;
    let nodes: CanvasNodeData[] = [];
    let createdProject = false;
    if (projectId) {
        const project = deps.findProject(projectId);
        if (!project) throw new ResultAssetError("project-not-found", "目标画布已不存在，请重新选择画布。");
        nodes = project.nodes;
    } else {
        projectId = deps.createProject(options.projectTitle ?? `${ctx.toolId} 结果`);
        createdProject = true;
        nodes = deps.findProject(projectId)?.nodes ?? [];
    }

    let metadata: CanvasNodeMetadata;
    let bytes: number;
    try {
        if (kind === "video") {
            const stored = await media.storeMedia(item.blob ?? item.dataUrl ?? item.url ?? "", "video", { mimeType: item.mimeType, signal: ctx.signal });
            bytes = stored.bytes;
            metadata = deps.videoMetadata(stored);
        } else {
            const source = item.dataUrl ?? item.url;
            if (!source) throw new ResultAssetError("payload-missing", STALE_TEXT["media-missing"], { resultId: item.id });
            const stored = await media.uploadImage(source, { signal: ctx.signal });
            bytes = stored.bytes;
            metadata = deps.imageMetadata(stored);
        }
    } catch (error) {
        if (createdProject) deps.removeProjects?.([projectId]);
        if (error instanceof ResultAssetError) throw error;
        throw new ResultAssetError("upload-failed", `发送画布失败：${error instanceof Error ? error.message : String(error)}`, { retryable: true, resultId: item.id, cause: error });
    }
    if (!bytes || bytes <= 0) {
        if (createdProject) deps.removeProjects?.([projectId]);
        throw new ResultAssetError("empty-media", "上游返回 0 字节内容，已阻止发送画布。", { retryable: true, resultId: item.id });
    }

    // 结果追溯字段写进节点 metadata（CanvasNodeMetadata 无索引签名，按记录透传）。
    const trace = compact({
        toolId: ctx.toolId,
        taskId: ctx.taskId,
        resultId: item.id,
        resultAssetKey: resultAssetKey(item, ctx),
        draftRevision: item.draftRevision ?? ctx.draftRevision,
        staleReasons: stale.reasons.length > 0 ? stale.reasons.join(",") : undefined,
        staleMessage: stale.message,
    });
    const node = deps.createNode(kind, options.position ?? nextResultNodePosition(nodes), {
        ...metadata,
        prompt: ctx.prompt ?? metadata.prompt,
        model: ctx.model ?? metadata.model,
        ...(trace as unknown as CanvasNodeMetadata),
    });
    node.title = resultAssetTitle(item, ctx);
    try {
        deps.updateProject(projectId, [...nodes, node]);
    } catch (error) {
        if (createdProject) deps.removeProjects?.([projectId]);
        throw new ResultAssetError("canvas-write-failed", "画布写入失败，未新增节点。", { retryable: true, resultId: item.id, cause: error });
    }
    return {
        projectId,
        nodeId: node.id,
        kind,
        stale: stale.stale,
        staleReasons: stale.reasons,
        undo: { kind: "remove-canvas-node", projectId, nodeId: node.id, createdProject },
    };
}

/* ------------------------------------------------------------ UI 集成门面 */

/** 结果页唯一入口：能力门禁 + 入库 + 批量 + 发送画布 + 撤销收成一组，UI 不再各自拼装。 */
export function createResultAssetActions(ctx: ResultAssetContext) {
    return {
        capability: (item: ResultItem) => resultCapability(item, ctx),
        save: (item: ResultItem, deps?: Partial<ResultAssetDeps>) => ingestResultAsset(item, ctx, deps),
        saveBatch: (items: readonly ResultItem[], options?: BatchIngestOptions) => ingestResultBatch(items, ctx, options),
        send: (item: ResultItem, options?: SendResultOptions) => sendResultToCanvas(item, ctx, options),
        undo: (undo: ResultUndoAction, deps?: Partial<ResultAssetDeps>, canvasDeps?: Partial<ResultCanvasDeps>) => undoResultAction(undo, deps, canvasDeps),
    };
}
