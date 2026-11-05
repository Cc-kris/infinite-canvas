import { useEffect, useState } from "react";
import { Download, DownloadCloud, FolderPlus, ImageOff, Images, Loader2, RotateCcw, Send, TriangleAlert } from "lucide-react";

import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { hasUsablePayload } from "@/lib/result-item-kind";
import { pickRicherTaskSnapshot } from "@/lib/task-snapshot";
import { resolveMediaUrl } from "@/services/file-storage";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
import { useToolTaskStore } from "@/stores/use-tool-task-store";

import {
    downloadResultItem,
    downloadResultItems,
    isItemPending,
    resolveToolResultView,
    resultItems,
    saveResultItemToAssets,
    sendResultItemToCanvas,
    summarizeResultItems,
    ToolResultActionError,
    type ToolResultView,
} from "./tool-result-actions";
import { TaskStatusBadge, TaskStatusPanel } from "./task-status";

export * from "./tool-result-actions";

/**
 * TASK-006：工具结果区（空态 / 运行中 / 成功 / 失败共用）。
 *
 * 真实边界：
 * - 只渲染 `ToolTask.result.items` 里真实存在的结果，不生成占位图或假成功；
 * - “保存资产”“发送画布”“下载”走真实存储链路（image-storage / file-storage / 资产库 / 画布 store）；
 * - 二进制被持久化策略剥离（payloadDropped）时按钮禁用并说明原因，不静默失败。
 * - 纯逻辑与副作用在 `tool-result-actions.ts`（单文件行数上限）。
 */

/* ---------------- 组件 ---------------- */

function useBlobUrl(blob?: Blob): string | undefined {
    const [url, setUrl] = useState<string>();
    useEffect(() => {
        if (!blob || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
        const objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [blob]);
    return url;
}

/**
 * 刷新后快照里只剩 `storageKey`（url 是上一次会话的 blob:，早已失效）。
 * 这里按 key 从 IndexedDB 取真实字节并复原可播放/可预览的地址，绝不构造任何内容。
 */
function useStoredResultUrl(storageKey?: string, fallback?: string): string | undefined {
    const [url, setUrl] = useState<string>();
    // 只有远程/data URL 才能直接使用；刷新后残留的 blob: 地址已经失效，
    // 即使存在也应按 storageKey 从 IndexedDB 取回真实字节。
    const fallbackUsable = Boolean(fallback && !fallback.startsWith("blob:"));
    useEffect(() => {
        if (!storageKey || fallbackUsable) {
            setUrl(undefined);
            return;
        }
        let cancelled = false;
        void resolveMediaUrl(storageKey)
            .then((resolved) => {
                if (!cancelled && resolved) setUrl(resolved);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [storageKey, fallback]);
    return url;
}

export type ToolResultActionOverrides = {
    download?: typeof downloadResultItem;
    saveToAssets?: typeof saveResultItemToAssets;
    sendToCanvas?: typeof sendResultItemToCanvas;
};

export type ToolResultProps = {
    task?: ToolTask | null;
    toolId?: string;
    title?: string;
    projectId?: string;
    projectTitle?: string;
    actions?: ToolResultActionOverrides;
    onCancel?: () => void;
    onRetry?: () => void;
    /**
     * 单张重试：真实再发一次上游请求，成功后只替换这一格（其余结果不动）。
     * 未传时不渲染「重试」——不做点了没反应的假按钮。
     */
    onRetryItem?: (item: ToolTaskResultItem, index: number) => void | Promise<void>;
    /** 单张重试的副作用提示（例如「重试会再消耗一次生成」）。 */
    retryItemHint?: string;
    now?: number;
    className?: string;
    /** 空态标题/说明（默认通用文案；工具页可传原站同款文案）。 */
    emptyTitle?: string;
    emptyHint?: string;
};

export function ToolResult({ task: taskProp, toolId = "tool", title, projectId, projectTitle, actions, onCancel, onRetry, onRetryItem, retryItemHint, now, className, emptyTitle, emptyHint }: ToolResultProps) {
    const { t } = useTranslation();
    const resolvedTitle = title ?? t("toolChrome.result.title");
    const resolvedEmptyTitle = emptyTitle ?? t("toolChrome.result.emptyTitle");
    const resolvedEmptyHint = emptyHint ?? t("toolChrome.result.emptyHint");
    // 任务库在 hydrate 后会把 storageKey 复原成新的对象 URL；工作台本地 state 是更早的副本，
    // 只用它会把「字节在库」误判成「文件丢了」。取更完整的那份快照（不改数据来源）。
    const liveTask = useToolTaskStore((state) => (taskProp?.id ? state.tasks[taskProp.id] : undefined));
    const task = pickRicherTaskSnapshot(taskProp, liveTask);
    const view = resolveToolResultView(task);
    const items = resultItems(task);
    const summary = summarizeResultItems(items);
    const [pending, setPending] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

    const download = actions?.download ?? downloadResultItem;
    const saveToAssets = actions?.saveToAssets ?? saveResultItemToAssets;
    const sendToCanvas = actions?.sendToCanvas ?? sendResultItemToCanvas;
    const downloadableIndexes = items.map((item, index) => ({ item, index })).filter(({ item }) => hasUsablePayload(item)).map(({ index }) => index);
    const canDownloadAll = view === "succeeded" && summary.total > 1 && downloadableIndexes.length > 1;

    const run = async (key: string, action: () => Promise<string>) => {
        setPending(key);
        setFeedback(null);
        try {
            setFeedback({ tone: "success", text: await action() });
        } catch (error) {
            setFeedback({ tone: "error", text: error instanceof Error ? error.message : t("toolChrome.result.actionFailed") });
        } finally {
            setPending(null);
        }
    };

    return (
        <section data-testid="tool-result" data-view={view} className={cn("space-y-3 rounded-xl border border-border bg-card p-4", className)}>
            <header className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">{resolvedTitle}</h2>
                {task ? (
                    view === "succeeded" && summary.total === 0 ? (
                        // 边界：任务状态成功但没有结果项 = 无结果，不能顶着绿色「已完成」。
                        <span
                            data-testid="tool-result-empty-badge"
                            data-tone="warning"
                            className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
                        >
                            <TriangleAlert aria-hidden="true" className="size-3.5" />
                            {t("toolChrome.result.noResult")}
                        </span>
                    ) : (
                        <TaskStatusBadge status={task.status} />
                    )
                ) : null}
                {view === "succeeded" ? (
                    <span className="ml-auto text-xs text-muted-foreground" data-testid="tool-result-summary">
                        {t("toolChrome.result.total", { total: summary.total })}
                        {summary.videos > 0 ? t("toolChrome.result.videos", { count: summary.videos }) : ""}
                        {summary.images > 0 ? t("toolChrome.result.images", { count: summary.images }) : ""}
                    </span>
                ) : null}
                {canDownloadAll ? (
                    <button
                        type="button"
                        disabled={pending !== null}
                        data-testid="tool-result-download-all"
                        onClick={() =>
                            run("download-all", async () => {
                                const batch = await downloadResultItems(items, { toolId, indexes: downloadableIndexes });
                                if (!batch.downloaded.length) throw new Error(`全部下载失败：${batch.skipped[0]?.reason ?? "没有可下载的结果"}`);
                                const failed = batch.skipped.length ? `，${batch.skipped.length} 张失败（${batch.skipped[0].reason}）` : "";
                                return batch.mode === "zip"
                                    ? `已打包下载 ${batch.downloaded.length} 张结果（${batch.fileName}）${failed}`
                                    : `已下载 ${batch.downloaded.length} 张结果${failed}`;
                            })
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <DownloadCloud aria-hidden="true" className="size-3.5" />
                        全部下载（{downloadableIndexes.length}）
                    </button>
                ) : null}
            </header>

            {view === "empty" ? (
                <div data-testid="tool-result-empty" className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    <Images aria-hidden="true" className="mx-auto mb-2 size-6 opacity-60" />
                    <p>{resolvedEmptyTitle}</p>
                    <p className="mt-1 text-xs">{resolvedEmptyHint}</p>
                </div>
            ) : null}

            {view === "running" && task ? (
                <div className="space-y-3" data-testid="tool-result-running">
                    <TaskStatusPanel task={task} now={now} onCancel={onCancel} />
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                        正在等待上游真实返回，请勿重复提交；离开页面后任务仍会继续轮询。
                    </p>
                </div>
            ) : null}

            {view === "failed" && task ? (
                <div className="space-y-2" data-testid="tool-result-failed">
                    <TaskStatusPanel task={task} now={now} onRetry={onRetry} />
                    <p className="text-xs text-muted-foreground">失败不会产生可用结果；诊断码可用于排查 Provider 侧问题。</p>
                </div>
            ) : null}

            {view === "cancelled" && task ? (
                <div className="space-y-2" data-testid="tool-result-cancelled">
                    <TaskStatusPanel task={task} now={now} />
                    <p className="text-xs text-muted-foreground">已停止等待，没有继续消耗额度；如需要结果请重新提交。</p>
                </div>
            ) : null}

            {view === "unknown" && task ? (
                <div className="space-y-2" data-testid="tool-result-unknown">
                    <TaskStatusPanel task={task} now={now} />
                    <p className="text-xs text-muted-foreground">结果未知时不会自动重试，避免上游已受理导致的重复扣费。</p>
                </div>
            ) : null}

            {view === "succeeded" ? (
                summary.total === 0 ? (
                    <div data-testid="tool-result-empty-payload" className="flex flex-wrap items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                        <span className="flex-1">任务标记为成功，但上游没有返回任何结果项；不会用占位内容冒充结果。</span>
                        {onRetry ? (
                            <button
                                type="button"
                                data-testid="tool-result-empty-retry"
                                onClick={onRetry}
                                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-400 bg-background px-2 py-1 text-[11px] font-medium text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700 dark:text-amber-100 dark:hover:bg-amber-900"
                            >
                                <RotateCcw aria-hidden="true" className="size-3.5" />
                                重新生成
                            </button>
                        ) : null}
                    </div>
                ) : (
                    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {items.map((item, index) => (
                            <ResultTile
                                key={item.id}
                                item={item}
                                index={index}
                                toolId={toolId}
                                taskId={task?.id}
                                projectId={projectId}
                                projectTitle={projectTitle}
                                pending={pending}
                                download={download}
                                saveToAssets={saveToAssets}
                                sendToCanvas={sendToCanvas}
                                onRetryItem={onRetryItem}
                                retryItemHint={retryItemHint}
                                run={run}
                            />
                        ))}
                    </ul>
                )
            ) : null}

            {feedback ? (
                <p
                    role="status"
                    data-testid="tool-result-feedback"
                    data-tone={feedback.tone}
                    className={cn("rounded-lg px-3 py-2 text-xs", feedback.tone === "success" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200")}
                >
                    {feedback.text}
                </p>
            ) : null}
        </section>
    );
}

type ResultTileProps = {
    item: ToolTaskResultItem;
    index: number;
    toolId: string;
    taskId?: string;
    projectId?: string;
    projectTitle?: string;
    pending: string | null;
    download: typeof downloadResultItem;
    saveToAssets: typeof saveResultItemToAssets;
    sendToCanvas: typeof sendResultItemToCanvas;
    onRetryItem?: (item: ToolTaskResultItem, index: number) => void | Promise<void>;
    retryItemHint?: string;
    run: (key: string, action: () => Promise<string>) => Promise<void>;
};

function ResultTile({ item, index, toolId, taskId, projectId, projectTitle, pending, download, saveToAssets, sendToCanvas, onRetryItem, retryItemHint, run }: ResultTileProps) {
    const { t } = useTranslation();
    const blobUrl = useBlobUrl(item.blob);
    const storedUrl = useStoredResultUrl(item.storageKey, item.dataUrl ?? item.url ?? blobUrl);
    const src = item.dataUrl ?? item.url ?? blobUrl ?? storedUrl;
    // storageKey 存在＝字节已落 IndexedDB：刷新后没有 url 也照样可下载/存资产/发画布，不能判成「上游未返回文件」。
    const dropped = !hasUsablePayload(item);
    const busy = isItemPending(pending, index);

    return (
        <li data-testid={`tool-result-item-${index}`} data-kind={item.kind} data-dropped={dropped} className="overflow-hidden rounded-xl border border-border bg-background">
            <div className="flex aspect-video items-center justify-center bg-stone-100 dark:bg-stone-900">
                {dropped ? (
                    <span className="flex flex-col items-center gap-1 px-3 text-center text-[11px] text-muted-foreground">
                        <ImageOff aria-hidden="true" className="size-5" />
                        {item.payloadDropped ? "刷新后原始文件未保留，无法预览" : "上游未返回该结果的文件"}
                    </span>
                ) : item.kind === "video" ? (
                    <video data-testid="tool-result-video" src={src} controls playsInline preload="metadata" className="h-full w-full object-contain" />
                ) : (
                    <img data-testid="tool-result-image" src={src} alt={`结果 ${index + 1}`} loading="lazy" className="h-full w-full object-contain" />
                )}
            </div>
            <div className="flex flex-wrap gap-1.5 p-2">
                <button
                    type="button"
                    disabled={dropped || busy}
                    onClick={() => run(`download-${index}`, async () => t("toolChrome.result.downloaded", { name: await download(item, index, { toolId }) }))}
                    data-testid={`tool-result-download-${index}`}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Download aria-hidden="true" className="size-3.5" />
                    {t("toolChrome.result.download")}
                </button>
                <button
                    type="button"
                    disabled={dropped || busy}
                    onClick={() =>
                        run(`save-${index}`, async () => t("toolChrome.result.savedToAssets", { id: (await saveToAssets(item, index, { toolId, taskId })).assetId }))
                    }
                    data-testid={`tool-result-save-${index}`}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <FolderPlus aria-hidden="true" className="size-3.5" />
                    {t("toolChrome.result.saveAsset")}
                </button>
                <button
                    type="button"
                    disabled={dropped || busy}
                    onClick={() =>
                        run(`canvas-${index}`, async () =>
                            t("toolChrome.result.sentToCanvas", {
                                id: (await sendToCanvas(item, { toolId, projectId, projectTitle })).projectId,
                            }),
                        )
                    }
                    data-testid={`tool-result-canvas-${index}`}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Send aria-hidden="true" className="size-3.5" />
                    {t("toolChrome.result.sendCanvas")}
                </button>
                {onRetryItem ? (
                    <button
                        type="button"
                        disabled={busy}
                        title={retryItemHint}
                        onClick={() =>
                            run(`retry-${index}`, async () => {
                                await onRetryItem(item, index);
                                return `第 ${index + 1} 张已重新生成并替换`;
                            })
                        }
                        data-testid={`tool-result-retry-${index}`}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <RotateCcw aria-hidden="true" className="size-3.5" />
                        {busy ? t("toolChrome.result.retrying") : t("toolChrome.result.retryItem")}
                    </button>
                ) : null}
            </div>
        </li>
    );
}

