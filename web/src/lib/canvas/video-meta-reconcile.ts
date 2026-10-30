/**
 * 画布视频节点「尺寸终态」校正。
 *
 * 背景（VIDEO_CONCAT 实测）：后台标签会把 <video> 的 loadedmetadata 挂起，
 * `readVideoMeta` 到点用 1280×720 兜底放行——入库不能卡死，但**兜底值不是事实**：
 * 同一段 768×1344（9:16）的真实视频，画布节点被写成 1280×720（16:9）。
 *
 * 这里的约定：
 * 1. 兜底值一律不写进节点（`videoMetadata` 只标 `mediaMetaPending`）；
 * 2. 发画布时先用严格测量（`measureVideoMeta`）拿真实宽高，拿到就按真实比例建框；
 * 3. 拿不到就先把节点建出来（pending），随后在标签可见时二次测量并就地校正：
 *    只改 `naturalWidth/naturalHeight` 与框尺寸，位置按中心保持，
 *    以「校正前重新读节点」的方式避免覆盖用户拖拽/改尺寸。
 */
import { fitNodeSize } from "@/lib/canvas/canvas-node-size";
import { measureVideoMeta, type VideoMediaMeta } from "@/services/media-metadata";
import type { CanvasNodeMetadata, Position } from "@/types/canvas";

/** 与 `project.tsx` 的 VIDEO_NODE_MAX_WIDTH 保持同一量级：视频节点只缩不放。 */
export const VIDEO_NODE_FRAME_MAX = 420;

export type VideoNodeFrame = { width: number; height: number };

export type VideoNodeSnapshot = {
    width: number;
    height: number;
    position: Position;
    metadata?: CanvasNodeMetadata;
};

export type VideoNodePatch = {
    width: number;
    height: number;
    position: Position;
    metadata: CanvasNodeMetadata;
};

export type VideoMetaReconcileDeps = {
    readNode: (projectId: string, nodeId: string) => VideoNodeSnapshot | undefined;
    patchNode: (projectId: string, nodeId: string, patch: VideoNodePatch) => void;
    /** 单测注入点：默认走 `measureVideoMeta`（真实解码）。 */
    measure?: (url: string, timeoutMs?: number) => Promise<VideoMediaMeta | null>;
    /** 单测注入点：默认「等标签可见或到点」再重试。 */
    sleep?: (ms: number) => Promise<void>;
};

export type VideoMetaReconcileOptions = {
    /** 测量轮次（后台标签第一轮多半拿不到，需要等可见后再试）。 */
    attempts?: number;
    /** 单轮测量预算。 */
    attemptTimeoutMs?: number;
    /** 轮次间隔（期间一旦标签可见立即重试）。 */
    retryDelayMs?: number;
    /** true = 即使节点没标 pending 也校正（用于修复历史节点）。 */
    force?: boolean;
};

export type VideoMetaReconcileResult =
    | { status: "corrected"; natural: VideoNodeFrame; frame: VideoNodeFrame }
    | { status: "frame-matched"; natural: VideoNodeFrame; frame: VideoNodeFrame }
    | { status: "pending"; attempts: number }
    | { status: "skipped"; reason: "node-missing" | "no-content" | "already-resolved" };

/** 真实宽高 → 画布框尺寸：保持比例、最长边 420、只缩不放。 */
export function videoNodeFrame(natural: { width: number; height: number }, max: number = VIDEO_NODE_FRAME_MAX): VideoNodeFrame {
    const { width, height } = fitNodeSize(natural.width, natural.height, max, max);
    // 取整避免浮点累积出 419.9999 导致 React 反复 resize。
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

/** 建节点后立刻按已测到的真实宽高摆正（没有真实宽高时原样返回，不做猜测）。 */
export function fitVideoNodeToNatural<T extends { width: number; height: number; position: Position; metadata?: CanvasNodeMetadata }>(
    node: T,
    center: Position,
): T {
    const natural = naturalOf(node);
    if (!natural) return node;
    const frame = videoNodeFrame(natural);
    return { ...node, ...frame, position: { x: center.x - frame.width / 2, y: center.y - frame.height / 2 } };
}

function naturalOf(node: { metadata?: CanvasNodeMetadata }): VideoNodeFrame | null {
    const width = node.metadata?.naturalWidth;
    const height = node.metadata?.naturalHeight;
    if (!width || !height || width <= 0 || height <= 0) return null;
    return { width, height };
}

function isSameFrame(a: VideoNodeFrame, b: VideoNodeFrame, tolerance = 1): boolean {
    return Math.abs(a.width - b.width) <= tolerance && Math.abs(a.height - b.height) <= tolerance;
}

/** 默认等待：标签可见就立刻醒，否则到点醒（后台标签里媒体被挂起，只能等可见）。 */
function sleepUntilVisibleOrTimeout(ms: number): Promise<void> {
    if (typeof document === "undefined") return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
    return new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            document.removeEventListener?.("visibilitychange", onVisibilityChange);
            resolve();
        };
        const onVisibilityChange = () => {
            if (!document.hidden) finish();
        };
        const timer = setTimeout(finish, Math.max(0, ms));
        document.addEventListener?.("visibilitychange", onVisibilityChange);
    });
}

/**
 * 把节点的宽高/元数据校正到真实值；幂等：已校正（未标 pending）的节点直接跳过。
 * 返回状态便于验收断言（corrected / frame-matched / pending）。
 */
export async function reconcileVideoNodeMeta(
    projectId: string,
    nodeId: string,
    deps: VideoMetaReconcileDeps,
    options: VideoMetaReconcileOptions = {},
): Promise<VideoMetaReconcileResult> {
    const attempts = Math.max(1, options.attempts ?? 3);
    const attemptTimeoutMs = options.attemptTimeoutMs ?? 2_000;
    const retryDelayMs = options.retryDelayMs ?? 1_500;
    const measure = deps.measure ?? measureVideoMeta;
    const sleep = deps.sleep ?? sleepUntilVisibleOrTimeout;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const node = deps.readNode(projectId, nodeId);
        if (!node) return { status: "skipped", reason: "node-missing" };
        if (!options.force && !node.metadata?.mediaMetaPending) return { status: "skipped", reason: "already-resolved" };
        const url = node.metadata?.content;
        if (!url) return { status: "skipped", reason: "no-content" };

        const meta = await measure(url, attemptTimeoutMs);
        if (meta && meta.width > 0 && meta.height > 0) {
            // 重新读一次：等待期间用户可能拖过节点/改过尺寸，按最新状态算中心。
            const latest = deps.readNode(projectId, nodeId);
            if (!latest) return { status: "skipped", reason: "node-missing" };
            const natural: VideoNodeFrame = { width: meta.width, height: meta.height };
            const frame = videoNodeFrame(natural);
            const sameFrame = isSameFrame(latest, frame);
            const metadata: CanvasNodeMetadata = {
                ...latest.metadata,
                naturalWidth: natural.width,
                naturalHeight: natural.height,
                mediaMetaPending: false,
                ...(meta.durationMs ? { durationMs: meta.durationMs } : {}),
            };
            const position = sameFrame
                ? latest.position
                : { x: latest.position.x + latest.width / 2 - frame.width / 2, y: latest.position.y + latest.height / 2 - frame.height / 2 };
            deps.patchNode(projectId, nodeId, { width: frame.width, height: frame.height, position, metadata });
            return sameFrame ? { status: "frame-matched", natural, frame } : { status: "corrected", natural, frame };
        }

        if (attempt < attempts) await sleep(retryDelayMs);
    }
    return { status: "pending", attempts };
}
