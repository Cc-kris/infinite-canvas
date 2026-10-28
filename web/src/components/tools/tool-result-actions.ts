import type { UploadedFile } from "@/services/file-storage";
import type { UploadedImage } from "@/services/image-storage";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
import type { Asset } from "@/stores/use-asset-store";
import type { CanvasNodeMetadata } from "@/types/canvas";

/**
 * TASK-006：工具结果区的纯逻辑与真实副作用（无 React）。
 *
 * 与 `tool-result.tsx` 拆分的唯一原因：任务清单要求单文件 ≤350 行。
 * 这里的函数全部可注入依赖，测试无需浏览器环境即可验证真实行为。
 */

export type ToolResultView = "empty" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";

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

export function resultItems(task?: Pick<ToolTask, "result"> | null): ToolTaskResultItem[] {
    return task?.result?.items ?? [];
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

export async function downloadResultItem(
    item: ToolTaskResultItem,
    index: number,
    options: { toolId: string; deps?: DownloadDeps } = { toolId: "tool" },
): Promise<string> {
    assertResultPayload(item);
    const fileName = buildResultFileName(options.toolId, item, index);
    const saveAs = options.deps?.saveAs ?? (await import("file-saver")).saveAs;
    const source = item.blob ?? item.dataUrl ?? item.url;
    if (!source) throw new ToolResultActionError("payload-missing", "上游没有返回可下载的结果文件。");
    saveAs(source, fileName);
    return fileName;
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

export async function saveResultItemToAssets(item: ToolTaskResultItem, index: number, options: SaveToAssetsOptions): Promise<{ assetId: string; kind: "image" | "video" }> {
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

    const stored = await deps.uploadImage(item.dataUrl ?? item.url ?? "");
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

async function loadResultCanvasDeps(): Promise<Partial<ResultCanvasDeps>> {
    const [canvasStore, factory] = await Promise.all([import("@/stores/canvas/use-canvas-store"), import("@/lib/canvas/canvas-node-factory")]);
    return {
        findProject: (projectId) => canvasStore.useCanvasStore.getState().projects.find((project) => project.id === projectId),
        createProject: (title) => canvasStore.useCanvasStore.getState().createProject(title),
        updateProject: (projectId, nodes) => canvasStore.useCanvasStore.getState().updateProject(projectId, { nodes }),
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
};

export async function sendResultItemToCanvas(item: ToolTaskResultItem, options: SendToCanvasOptions): Promise<{ projectId: string; nodeId: string }> {
    assertResultPayload(item);
    const deps: Partial<ResultCanvasDeps> = { ...(await loadResultCanvasDeps()), ...options.deps };
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
            : deps.createNode!("image", position, deps.imageMetadata!(await deps.uploadImage!(item.dataUrl ?? item.url ?? "")));

    deps.updateProject!(projectId, [...nodes, node]);
    return { projectId, nodeId: node.id };
}
