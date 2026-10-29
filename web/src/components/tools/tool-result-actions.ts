import type { UploadedFile } from "@/services/file-storage";
import type { UploadedImage } from "@/services/image-storage";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
import { withDerivedKind } from "@/lib/result-item-kind";
import type { Asset } from "@/stores/use-asset-store";
import type { CanvasNodeMetadata } from "@/types/canvas";

/**
 * TASK-006：工具结果区的纯逻辑与真实副作用（无 React）。
 *
 * 与 `tool-result.tsx` 拆分的唯一原因：任务清单要求单文件 ≤350 行。
 * 这里的函数全部可注入依赖，测试无需浏览器环境即可验证真实行为。
 */

export type ToolResultView = "empty" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";

/**
 * 结果卡单卡动作的 pending key 形如 `download-3` / `save-0` / `canvas-12` / `retry-10`。
 *
 * 曾经用 `pending.endsWith("-" + index)` 判定某张卡是否 busy，`retry-10` 会同时命中第 0 张
 * （`"retry-10".endsWith("-0") === true`），导致一张卡在忙、另一张被误锁死。这里按最后一段
 * 精确解析索引，busy 只落真正被点击的那张。
 */
export type ResultActionPending = { action: string; index: number };

export function parseResultActionKey(pending: string | null | undefined): ResultActionPending | null {
    if (!pending) return null;
    const at = pending.lastIndexOf("-");
    if (at <= 0 || at === pending.length - 1) return null;
    const index = Number(pending.slice(at + 1));
    if (!Number.isInteger(index) || index < 0) return null;
    return { action: pending.slice(0, at), index };
}

export function isItemPending(pending: string | null | undefined, index: number): boolean {
    const parsed = parseResultActionKey(pending);
    return Boolean(parsed && parsed.index === index);
}

export function resolveToolResultView(task?: Pick<ToolTask, "status"> | null): ToolResultView {
    if (!task) return "empty";
    switch (task.status) {
        case "submitting":
        case "running":
            return "running";
        case "succeeded":
            return "succeeded";
        case "failed":
            return "failed";
        case "cancelled":
            return "cancelled";
        case "unknown":
            return "unknown";
        case "draft":
        case "validating":
        default:
            return "empty";
    }
}

/**
 * 结果项 `kind` 的兜底推导放在 `@/lib/result-item-kind`：
 * 结果区、各工具适配器（如 REPLACE_GOODS 的结果提取）必须共用同一份口径，
 * 否则一边按 mime 推导、一边只认 `kind === "image"`，就会出现「上游已出图但结果区空」。
 */
export function resultItems(task?: Pick<ToolTask, "result"> | null): ToolTaskResultItem[] {
    return (task?.result?.items ?? []).map(withDerivedKind);
}

export type ResultSummary = { total: number; images: number; videos: number; dropped: number };

export function summarizeResultItems(items: readonly ToolTaskResultItem[]): ResultSummary {
    return {
        total: items.length,
        images: items.filter((item) => item.kind === "image").length,
        videos: items.filter((item) => item.kind === "video").length,
        dropped: items.filter((item) => item.payloadDropped || (!item.dataUrl && !item.url && !item.blob)).length,
    };
}

function extensionFromMime(mimeType?: string) {
    if (!mimeType) return undefined;
    const normalized = mimeType.split(";")[0].trim().toLowerCase();
    if (normalized === "image/jpeg" || normalized === "image/jpg") return "jpg";
    if (normalized === "image/webp") return "webp";
    if (normalized === "image/gif") return "gif";
    if (normalized === "image/avif") return "avif";
    if (normalized === "video/webm") return "webm";
    if (normalized === "video/quicktime") return "mov";
    const match = /^(?:image|video)\/([a-z0-9.+-]+)$/.exec(normalized);
    return match?.[1];
}

export function buildResultFileName(toolId: string, item: Pick<ToolTaskResultItem, "kind" | "mimeType" | "dataUrl">, index: number): string {
    const prefix = (toolId || "tool").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tool";
    const dataUrlExt = item.dataUrl?.startsWith("data:") ? extensionFromMime(item.dataUrl.slice(5).split(/[;,]/)[0]) : undefined;
    const extension = extensionFromMime(item.mimeType) ?? dataUrlExt ?? (item.kind === "video" ? "mp4" : "png");
    return `${prefix}-result-${index + 1}.${extension}`;
}

export type ResultCanvasNode = { id: string; type: string; title: string; position: { x: number; y: number }; width: number; height: number };

/** 新节点放在已有节点右侧，保持 160px 间距；画布为空时放在原点附近。 */
export function nextCanvasNodePosition(nodes: readonly ResultCanvasNode[]): { x: number; y: number } {
    if (nodes.length === 0) return { x: 320, y: 240 };
    const right = Math.max(...nodes.map((node) => node.position.x + node.width));
    const first = nodes[0];
    return { x: right + 160 + 140, y: first.position.y + first.height / 2 };
}

export type ToolResultActionReason = "payload-dropped" | "payload-missing" | "project-not-found";

export class ToolResultActionError extends Error {
    readonly reason: ToolResultActionReason;
    constructor(reason: ToolResultActionReason, message: string) {
        super(message);
        this.name = "ToolResultActionError";
        this.reason = reason;
    }
}

export function assertResultPayload(item: Pick<ToolTaskResultItem, "payloadDropped" | "dataUrl" | "url" | "blob">): void {
    if (item.payloadDropped) {
        throw new ToolResultActionError("payload-dropped", "结果字节已被持久化策略剥离（刷新后不保留原始文件），请重新生成后再保存。");
    }
    if (!item.dataUrl && !item.url && !item.blob) {
        throw new ToolResultActionError("payload-missing", "上游没有返回可用的结果文件。");
    }
}

/* ---------------- 下载 ---------------- */

export type DownloadDeps = { saveAs?: (data: Blob | string, filename: string) => void };

/**
 * 刷新后快照里的 `url` 常是上一次会话的 `blob:` 对象 URL，早已失效（fetch 直接 Failed to fetch）。
 * 只要结果项带 `storageKey`，就以 IndexedDB 里的真实字节为准；`http(s)` 地址仍然保留可复核性，
 * 不因为本地缓存存在就改变上游地址语义。
 */
export function isDurableResultSource(url?: string): url is string {
    return Boolean(url && /^(https?:|data:)/i.test(url));
}

async function readStoredResultBlob(storageKey: string): Promise<Blob | null> {
    const { getMediaBlob } = await import("@/services/file-storage");
    return getMediaBlob(storageKey);
}

/** 图片入库 / 发画布前的真实来源：blob → dataUrl → storageKey(本地字节) → 持久 URL。 */
export async function resolveResultUploadSource(item: ToolTaskResultItem): Promise<string | Blob> {
    if (item.blob) return item.blob;
    if (item.dataUrl) return item.dataUrl;
    if (item.storageKey && !isDurableResultSource(item.url)) {
        const stored = await readStoredResultBlob(item.storageKey).catch(() => null);
        if (stored) return stored;
    }
    return item.url ?? "";
}

export async function downloadResultItem(
    item: ToolTaskResultItem,
    index: number,
    options: { toolId: string; deps?: DownloadDeps } = { toolId: "tool" },
): Promise<string> {
    assertResultPayload(item);
    const fileName = buildResultFileName(options.toolId, item, index);
    const saveAs = options.deps?.saveAs ?? (await import("file-saver")).saveAs;
    // 直接 saveAs 一个失效的 blob: URL 会下载出 0 字节/报错；有 storageKey 时必须先取回真实字节。
    const direct = item.blob ?? item.dataUrl ?? (isDurableResultSource(item.url) ? item.url : undefined);
    const source = direct ?? (await resolveResultBlob(item));
    saveAs(source, fileName);
    return fileName;
}

/**
 * 批量下载：多张结果必须「一次手势一次下载」，否则浏览器会拦截第 2 个及之后的自动下载
 * （实测：连续三次 saveAs 只落地第一个文件，界面却以为都成功了 —— 这就是假成功）。
 *
 * 做法：先把每张结果真正取成字节（blob / dataUrl / url 都归一为 Blob），
 * 再多张打包成一个 ZIP 下载；只有一张时保持单文件下载。
 * 单张失败不静默：返回 skipped 明细，由调用方展示真实原因；绝不生成占位文件。
 */
export type DownloadBatchResult = {
    mode: "single" | "zip";
    /** 真正取到字节并写入下载物的文件名。 */
    downloaded: string[];
    /** 取字节失败的条目（含原因），不隐瞒。 */
    skipped: Array<{ index: number; reason: string }>;
    /** mode=zip 时的压缩包文件名。 */
    fileName?: string;
};

async function resolveResultBlob(item: ToolTaskResultItem): Promise<Blob> {
    const source = item.blob ?? item.dataUrl ?? item.url;
    if (!source && !item.storageKey) throw new ToolResultActionError("payload-missing", "上游没有返回可下载的结果文件。");
    if (item.blob) return item.blob;
    if (item.dataUrl) return sourceBlob(item.dataUrl, item.mimeType);
    if (item.storageKey) {
        const stored = await readStoredResultBlob(item.storageKey).catch(() => null);
        if (stored) return stored;
    }
    if (!item.url) throw new ToolResultActionError("payload-missing", "结果字节已不在本地，也没有可访问的地址。");
    const response = await fetch(item.url);
    if (!response.ok) throw new ToolResultActionError("payload-missing", `结果文件读取失败（HTTP ${response.status}）`);
    return response.blob();
}

function sourceBlob(source: string, mimeType?: string): Blob {
    const [head, body] = source.split(",", 2);
    const mime = head.slice(5).split(";")[0] || mimeType || "application/octet-stream";
    if (head.includes(";base64")) {
        const binary = atob(body);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(body)], { type: mime });
}

export async function downloadResultItems(
    items: readonly ToolTaskResultItem[],
    options: { toolId: string; indexes?: readonly number[]; deps?: DownloadDeps } = { toolId: "tool" },
): Promise<DownloadBatchResult> {
    const indexes = options.indexes ?? items.map((_, index) => index);
    const saveAs = options.deps?.saveAs ?? (await import("file-saver")).saveAs;
    const batch: DownloadBatchResult = { mode: "single", downloaded: [], skipped: [] };
    const files: Array<{ name: string; data: Blob }> = [];
    for (const index of indexes) {
        const item = items[index];
        if (!item) {
            batch.skipped.push({ index, reason: "结果项不存在" });
            continue;
        }
        try {
            assertResultPayload(item);
            const data = await resolveResultBlob(item);
            files.push({ name: buildResultFileName(options.toolId, item, index), data });
            batch.downloaded.push(files[files.length - 1].name);
        } catch (error) {
            batch.skipped.push({ index, reason: error instanceof Error ? error.message : "下载失败" });
        }
    }
    if (files.length === 0) return batch;
    if (files.length === 1) {
        saveAs(files[0].data, files[0].name);
        return batch;
    }
    const { createZip } = await import("@/lib/zip");
    const zip = await createZip(files.map((file) => ({ name: file.name, data: file.data })));
    const fileName = `${options.toolId.toLowerCase().replace(/_/g, "-")}-results-${files.length}.zip`;
    saveAs(zip, fileName);
    batch.mode = "zip";
    batch.fileName = fileName;
    return batch;
}

/* ---------------- 保存到资产库 ---------------- */

export type ResultAssetDeps = {
    uploadImage: (input: string | Blob) => Promise<UploadedImage>;
    storeVideo: (result: { blob?: Blob; url?: string; mimeType?: string }) => Promise<UploadedFile>;
    addAsset: (asset: Omit<Asset, "id" | "createdAt" | "updatedAt">) => string;
};

async function loadResultAssetDeps(): Promise<ResultAssetDeps> {
    const [imageStorage, videoApi, assetStore] = await Promise.all([
        import("@/services/image-storage"),
        import("@/services/api/video"),
        import("@/stores/use-asset-store"),
    ]);
    return {
        uploadImage: imageStorage.uploadImage,
        storeVideo: videoApi.storeGeneratedVideo,
        addAsset: (asset) => assetStore.useAssetStore.getState().addAsset(asset),
    };
}

export type SaveToAssetsOptions = {
    toolId: string;
    taskId?: string;
    title?: string;
    source?: string;
    deps?: Partial<ResultAssetDeps>;
};

/**
 * 刷新后视频结果只剩 storageKey（blob: URL 已失效、item.blob 不驻留内存）：
 * 存资产/发画布前先按 storageKey 还原真实字节，避免把死链 blob: 地址交给 storeVideo。
 */
async function hydrateResultItemBytes(item: ToolTaskResultItem): Promise<ToolTaskResultItem> {
    if (item.kind !== "video" || item.blob || !item.storageKey) return item;
    const stored = await readStoredResultBlob(item.storageKey).catch(() => null);
    if (!stored) return item;
    return { ...item, blob: stored, mimeType: item.mimeType || stored.type || "video/mp4" };
}

export async function saveResultItemToAssets(item: ToolTaskResultItem, index: number, options: SaveToAssetsOptions): Promise<{ assetId: string; kind: "image" | "video" }> {
    item = await hydrateResultItemBytes(item);
    assertResultPayload(item);
    const deps: ResultAssetDeps = { ...(await loadResultAssetDeps()), ...options.deps };
    const title = options.title ?? `${options.toolId} 结果 ${index + 1}`;
    const metadata = { toolId: options.toolId, taskId: options.taskId, resultItemId: item.id };

    if (item.kind === "video") {
        const stored = await deps.storeVideo({ blob: item.blob, url: item.url, mimeType: item.mimeType });
        const assetId = deps.addAsset({
            kind: "video",
            title,
            coverUrl: stored.url,
            tags: [],
            source: options.source ?? "工具结果",
            data: {
                url: stored.url,
                storageKey: stored.storageKey,
                width: stored.width ?? 0,
                height: stored.height ?? 0,
                bytes: stored.bytes,
                mimeType: stored.mimeType || item.mimeType || "video/mp4",
            },
            metadata,
        });
        return { assetId, kind: "video" };
    }

    // 历史结果在刷新后往往只剩 storageKey（url 是失效的 blob:），必须优先用真实字节，
    // 否则 uploadImage("") 会以「读取图片失败」收场 —— 存资产/发画布全部不可用。
    const stored = await deps.uploadImage(await resolveResultUploadSource(item));
    const assetId = deps.addAsset({
        kind: "image",
        title,
        coverUrl: stored.url,
        tags: [],
        source: options.source ?? "工具结果",
        data: {
            dataUrl: stored.url,
            storageKey: stored.storageKey,
            width: stored.width,
            height: stored.height,
            bytes: stored.bytes,
            mimeType: stored.mimeType,
        },
        metadata,
    });
    return { assetId, kind: "image" };
}

/* ---------------- 发送到画布 ---------------- */

export type ResultCanvasDeps = {
    findProject: (projectId: string) => { id: string; nodes: ResultCanvasNode[] } | undefined;
    createProject: (title?: string) => string;
    updateProject: (projectId: string, nodes: ResultCanvasNode[]) => void;
    uploadImage: (input: string | Blob) => Promise<UploadedImage>;
    storeVideo: (result: { blob?: Blob; url?: string; mimeType?: string }) => Promise<UploadedFile>;
    createNode: (type: "image" | "video", position: { x: number; y: number }, metadata: CanvasNodeMetadata) => ResultCanvasNode;
    imageMetadata: (image: UploadedImage) => CanvasNodeMetadata;
    videoMetadata: (video: UploadedFile) => CanvasNodeMetadata;
};

/** 默认装配所需的四个模块，抽成类型便于单测注入替身（真实模块依赖 IndexedDB/axios，纯 Node 下不可直接加载）。 */
export type ResultCanvasModules = {
    canvasStore: typeof import("@/stores/canvas/use-canvas-store");
    factory: typeof import("@/lib/canvas/canvas-node-factory");
    imageStorage: typeof import("@/services/image-storage");
    videoApi: typeof import("@/services/api/video");
};

async function importResultCanvasModules(): Promise<ResultCanvasModules> {
    const [canvasStore, factory, imageStorage, videoApi] = await Promise.all([
        import("@/stores/canvas/use-canvas-store"),
        import("@/lib/canvas/canvas-node-factory"),
        import("@/services/image-storage"),
        import("@/services/api/video"),
    ]);
    return { canvasStore, factory, imageStorage, videoApi };
}

/** 默认装配：缺 uploadImage/storeVideo 会让“发送画布”报“画布依赖不可用”。 */
/**
 * 画布 store 走 zustand persist + IndexedDB(localForage) 异步水合，且首次使用才懒加载。
 * 若在“水合完成前”createProject，随后的 rehydrate 会用持久化快照整体覆盖 state，刚建的项目/node 会被静默丢掉
 * （实测：createProject 返回 id，1.5s 后 projects 变回 []）。发画布前必须等水合完成。
 */
export async function waitForCanvasHydration(canvasStore: ResultCanvasModules["canvasStore"]): Promise<void> {
    const store = canvasStore?.useCanvasStore as (typeof canvasStore)["useCanvasStore"] | undefined;
    // 单测/降级替身可能没有挂 persist 中间件：此时没有水合可言，直接返回（不抛 TypeError）。
    if (!store || !store.persist) return;
    if (store.persist.hasHydrated()) return;
    await new Promise<void>((resolve) => {
        const unsub = store.persist.onFinishHydration(() => {
            unsub();
            resolve();
        });
        // 兜底：事件注册前水合恰好完成
        if (store.persist.hasHydrated()) {
            unsub();
            resolve();
        }
    });
}

export async function loadResultCanvasDeps(loadModules: () => Promise<ResultCanvasModules> = importResultCanvasModules): Promise<Partial<ResultCanvasDeps>> {
    const { canvasStore, factory, imageStorage, videoApi } = await loadModules();
    await waitForCanvasHydration(canvasStore);
    return {
        findProject: (projectId) => canvasStore.useCanvasStore.getState().projects.find((project) => project.id === projectId),
        createProject: (title) => canvasStore.useCanvasStore.getState().createProject(title),
        updateProject: (projectId, nodes) => canvasStore.useCanvasStore.getState().updateProject(projectId, { nodes }),
        // 结果入库依赖：与 loadResultAssetDeps 同源，缺了这两个函数“发送画布”必然报“画布依赖不可用”。
        uploadImage: (input) => imageStorage.uploadImage(input),
        storeVideo: (result) => videoApi.storeGeneratedVideo(result),
        createNode: factory.createCanvasNode,
        imageMetadata: factory.imageMetadata,
        videoMetadata: factory.videoMetadata,
    };
}

export type SendToCanvasOptions = {
    toolId: string;
    projectId?: string;
    projectTitle?: string;
    deps?: Partial<ResultCanvasDeps>;
    /** 单测注入点：替换默认依赖装配，生产路径不要传。 */
    loadDeps?: () => Promise<Partial<ResultCanvasDeps>>;
};

export async function sendResultItemToCanvas(item: ToolTaskResultItem, options: SendToCanvasOptions): Promise<{ projectId: string; nodeId: string }> {
    item = await hydrateResultItemBytes(item);
    assertResultPayload(item);
    const deps: Partial<ResultCanvasDeps> = { ...(await (options.loadDeps ?? loadResultCanvasDeps)()), ...options.deps };
    if (typeof deps.findProject !== "function" || typeof deps.createProject !== "function") {
        throw new Error("画布依赖不可用：findProject, createProject");
    }

    let projectId = options.projectId;
    let nodes: ResultCanvasNode[] = [];
    if (projectId) {
        const project = deps.findProject(projectId);
        if (!project) throw new ToolResultActionError("project-not-found", "目标画布已不存在，请重新选择画布。");
        nodes = project.nodes;
    } else {
        projectId = deps.createProject(options.projectTitle ?? `${options.toolId} 结果`);
        nodes = deps.findProject(projectId)?.nodes ?? [];
    }

    const importDeps: Array<keyof ResultCanvasDeps> = ["updateProject", "uploadImage", "storeVideo", "createNode", "imageMetadata", "videoMetadata"];
    const missing = importDeps.filter((key) => typeof deps[key] !== "function");
    if (missing.length > 0) throw new Error(`画布依赖不可用：${missing.join(", ")}`);

    const position = nextCanvasNodePosition(nodes);
    const node =
        item.kind === "video"
            ? deps.createNode!("video", position, deps.videoMetadata!(await deps.storeVideo!({ blob: item.blob, url: item.url, mimeType: item.mimeType })))
            : deps.createNode!("image", position, deps.imageMetadata!(await deps.uploadImage!(await resolveResultUploadSource(item))));

    deps.updateProject!(projectId, [...nodes, node]);
    return { projectId, nodeId: node.id };
}
