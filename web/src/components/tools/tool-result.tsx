import { useEffect, useState } from "react";
import { Download, DownloadCloud, FolderPlus, ImageOff, Images, Loader2, RotateCcw, Send, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";

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

export function ToolResult({ task, toolId = "tool", title = "生成结果", projectId, projectTitle, actions, onCancel, onRetry, onRetryItem, retryItemHint, now, className, emptyTitle = "还没有生成结果", emptyHint = "填好参数并提交后，结果会出现在这里，可预览、下载、存入资产库或发送到画布。" }: ToolResultProps) {
    const view = resolveToolResultView(task);
    const items = resultItems(task);
    const summary = summarizeResultItems(items);
    const [pending, setPending] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

    const download = actions?.download ?? downloadResultItem;
    const saveToAssets = actions?.saveToAssets ?? saveResultItemToAssets;
    const sendToCanvas = actions?.sendToCanvas ?? sendResultItemToCanvas;
    const downloadableIndexes = items.map((item, index) => ({ item, index })).filter(({ item }) => !item.payloadDropped && Boolean(item.blob ?? item.dataUrl ?? item.url)).map(({ index }) => index);
    const canDownloadAll = view === "succeeded" && summary.total > 1 && downloadableIndexes.length > 1;

    const run = async (key: string, action: () => Promise<string>) => {
        setPending(key);
        setFeedback(null);
        try {
            setFeedback({ tone: "success", text: await action() });
        } catch (error) {
            setFeedback({ tone: "error", text: error instanceof Error ? error.message : "操作失败，请重试" });
        } finally {
            setPending(null);
        }
    };

    return (
        <section data-testid="tool-result" data-view={view} className={cn("space-y-3 rounded-xl border border-border bg-card p-4", className)}>
            <header className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">{title}</h2>
                {task ? (
                    view === "succeeded" && summary.total === 0 ? (
                        // 边界：任务状态成功但没有结果项 = 无结果，不能顶着绿色「已完成」。
                        <span
                            data-testid="tool-result-empty-badge"
                            data-tone="warning"
                            className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
                        >
                            <TriangleAlert aria-hidden="true" className="size-3.5" />
                            无结果
                        </span>
                    ) : (
                        <TaskStatusBadge status={task.status} />
                    )
                ) : null}
                {view === "succeeded" ? (
                    <span className="ml-auto text-xs text-muted-foreground" data-testid="tool-result-summary">
                        共 {summary.total} 个结果{summary.videos > 0 ? ` · 视频 ${summary.videos}` : ""}
                        {summary.images > 0 ? ` · 图片 ${summary.images}` : ""}
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
                    <p>{emptyTitle}</p>
                    <p className="mt-1 text-xs">{emptyHint}</p>
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
    const blobUrl = useBlobUrl(item.blob);
    const src = item.dataUrl ?? item.url ?? blobUrl;
    const dropped = !src || item.payloadDropped;
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
                    onClick={() => run(`download-${index}`, async () => `已下载 ${await download(item, index, { toolId })}`)}
                    data-testid={`tool-result-download-${index}`}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Download aria-hidden="true" className="size-3.5" />
                    下载
                </button>
                <button
                    type="button"
                    disabled={dropped || busy}
                    onClick={() => run(`save-${index}`, async () => `已保存到资产库（${(await saveToAssets(item, index, { toolId, taskId })).assetId}）`)}
                    data-testid={`tool-result-save-${index}`}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <FolderPlus aria-hidden="true" className="size-3.5" />
                    存入资产
                </button>
                <button
                    type="button"
                    disabled={dropped || busy}
                    onClick={() => run(`canvas-${index}`, async () => `已发送到画布（${(await sendToCanvas(item, { toolId, projectId, projectTitle })).projectId}）`)}
                    data-testid={`tool-result-canvas-${index}`}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Send aria-hidden="true" className="size-3.5" />
                    发送画布
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
                        {busy ? "重试中…" : "重试这张"}
                    </button>
                ) : null}
            </div>
        </li>
    );
}

