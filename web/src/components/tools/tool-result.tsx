import { useEffect, useState } from "react";
import {
    Columns2,
    Download,
    DownloadCloud,
    Eraser,
    Expand,
    FolderPlus,
    ImageOff,
    Images,
    Loader2,
    Maximize2,
    RotateCcw,
    Send,
    Sparkles,
    TriangleAlert,
    Video,
    WandSparkles,
    X,
} from "lucide-react";

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
    handoffResultItemToTool,
    isItemPending,
    resolveToolResultView,
    resultItems,
    saveResultItemToAssets,
    sendResultItemToCanvas,
    summarizeResultItems,
    ToolResultActionError,
    type ToolHandoffTargetId,
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
    handoff?: typeof handoffResultItemToTool;
};

export type ToolResultProps = {
    task?: ToolTask | null;
    toolId?: string;
    title?: string;
    projectId?: string;
    projectTitle?: string;
    /** 原图地址（提供时启用前后对比滑杆） */
    beforeImageUrl?: string;
    actions?: ToolResultActionOverrides;
    onCancel?: () => void;
    onRetry?: () => void;
    /** 一键做同款回调（未提供时回退为重试/复刻当前配置） */
    onMakeSame?: (item: ToolTaskResultItem, index: number) => void;
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

/** 通用前后对比滑杆（可在卡片内或大图预览弹窗内切换）。 */
export function ToolResultCompareSlider({
    before,
    after,
    beforeLabel = "原图",
    afterLabel = "生成后",
    testId = "tool-result-compare-slider",
}: {
    before: string;
    after: string;
    beforeLabel?: string;
    afterLabel?: string;
    testId?: string;
}) {
    const [position, setPosition] = useState(50);
    return (
        <div className="flex flex-col gap-2" data-testid={testId}>
            <div className="relative overflow-hidden rounded-lg border border-border bg-muted/30">
                <img src={after} alt={afterLabel} className="block h-auto max-h-[520px] w-full object-contain" />
                <img
                    src={before}
                    alt={beforeLabel}
                    className="absolute inset-0 h-full w-full object-contain"
                    style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
                />
                <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${position}%` }} />
                <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/65 px-1.5 py-0.5 text-[11px] text-white">{beforeLabel}</span>
                <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/65 px-1.5 py-0.5 text-[11px] text-white">{afterLabel}</span>
            </div>
            <input
                type="range"
                min={0}
                max={100}
                value={position}
                aria-label="前后对比滑杆"
                onChange={(event) => setPosition(Number(event.target.value))}
                className="w-full accent-primary"
                data-testid={`${testId}-range`}
            />
        </div>
    );
}

export function ToolResult({
    task: taskProp,
    toolId = "tool",
    title,
    projectId,
    projectTitle,
    beforeImageUrl,
    actions,
    onCancel,
    onRetry,
    onMakeSame,
    onRetryItem,
    retryItemHint,
    now,
    className,
    emptyTitle,
    emptyHint,
}: ToolResultProps) {
    const { t } = useTranslation();
    const resolvedTitle = title ?? t("toolChrome.result.title");
    const resolvedEmptyTitle = emptyTitle ?? t("toolChrome.result.emptyTitle");
    const resolvedEmptyHint = emptyHint ?? t("toolChrome.result.emptyHint");
    const liveTask = useToolTaskStore((state) => (taskProp?.id ? state.tasks[taskProp.id] : undefined));
    const task = pickRicherTaskSnapshot(taskProp, liveTask);
    const view = resolveToolResultView(task);
    const items = resultItems(task);
    const summary = summarizeResultItems(items);
    const [pending, setPending] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    const download = actions?.download ?? downloadResultItem;
    const saveToAssets = actions?.saveToAssets ?? saveResultItemToAssets;
    const sendToCanvas = actions?.sendToCanvas ?? sendResultItemToCanvas;
    const handoff = actions?.handoff ?? handoffResultItemToTool;
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

    const lightboxItem = lightboxIndex !== null ? items[lightboxIndex] : undefined;

    return (
        <section data-testid="tool-result" data-view={view} className={cn("space-y-3 rounded-xl border border-border bg-card p-4", className)}>
            <header className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">{resolvedTitle}</h2>
                {task ? (
                    view === "succeeded" && summary.total === 0 ? (
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
                    <ul className="grid grid-cols-1 gap-[10px] sm:grid-cols-2 xl:grid-cols-3">
                        {items.map((item, index) => (
                            <ResultTile
                                key={item.id}
                                item={item}
                                index={index}
                                toolId={toolId}
                                taskId={task?.id}
                                projectId={projectId}
                                projectTitle={projectTitle}
                                beforeImageUrl={beforeImageUrl}
                                pending={pending}
                                download={download}
                                saveToAssets={saveToAssets}
                                sendToCanvas={sendToCanvas}
                                handoff={handoff}
                                onPreview={() => setLightboxIndex(index)}
                                onMakeSame={onMakeSame ?? (onRetry ? () => onRetry() : undefined)}
                                onRetryItem={onRetryItem}
                                retryItemHint={retryItemHint}
                                run={run}
                            />
                        ))}
                    </ul>
                )
            ) : null}

            {lightboxItem && lightboxIndex !== null ? (
                <ResultLightboxModal
                    item={lightboxItem}
                    index={lightboxIndex}
                    total={items.length}
                    beforeImageUrl={beforeImageUrl}
                    onClose={() => setLightboxIndex(null)}
                    onPrev={lightboxIndex > 0 ? () => setLightboxIndex(lightboxIndex - 1) : undefined}
                    onNext={lightboxIndex < items.length - 1 ? () => setLightboxIndex(lightboxIndex + 1) : undefined}
                    onDownload={() =>
                        void run(`download-${lightboxIndex}`, async () =>
                            t("toolChrome.result.downloaded", { name: await download(lightboxItem, lightboxIndex, { toolId }) }),
                        )
                    }
                />
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
    beforeImageUrl?: string;
    pending: string | null;
    download: typeof downloadResultItem;
    saveToAssets: typeof saveResultItemToAssets;
    sendToCanvas: typeof sendResultItemToCanvas;
    handoff: typeof handoffResultItemToTool;
    onPreview: () => void;
    onMakeSame?: (item: ToolTaskResultItem, index: number) => void;
    onRetryItem?: (item: ToolTaskResultItem, index: number) => void | Promise<void>;
    retryItemHint?: string;
    run: (key: string, action: () => Promise<string>) => Promise<void>;
};

function ResultTile({
    item,
    index,
    toolId,
    taskId,
    projectId,
    projectTitle,
    beforeImageUrl,
    pending,
    download,
    saveToAssets,
    sendToCanvas,
    handoff,
    onPreview,
    onMakeSame,
    onRetryItem,
    retryItemHint,
    run,
}: ResultTileProps) {
    const { t } = useTranslation();
    const blobUrl = useBlobUrl(item.blob);
    const storedUrl = useStoredResultUrl(item.storageKey, item.dataUrl ?? item.url ?? blobUrl);
    const src = item.dataUrl ?? item.url ?? blobUrl ?? storedUrl;
    const dropped = !hasUsablePayload(item);
    const busy = isItemPending(pending, index);
    const [comparing, setComparing] = useState(false);

    const runHandoff = (target: ToolHandoffTargetId) =>
        run(`handoff-${target}-${index}`, async () => {
            const res = await handoff(item, index, target, { sourceToolId: toolId });
            return `已带图进入「${res.label}」`;
        });

    return (
        <li
            data-testid={`tool-result-item-${index}`}
            data-kind={item.kind}
            data-dropped={dropped}
            className="group relative overflow-hidden rounded-xl border border-border bg-background"
        >
            <div className="relative flex min-h-[180px] w-full items-center justify-center bg-muted/40">
                {dropped ? (
                    <span className="flex flex-col items-center gap-1 px-3 py-8 text-center text-[11px] text-muted-foreground">
                        <ImageOff aria-hidden="true" className="size-5" />
                        {item.payloadDropped ? "刷新后原始文件未保留，无法预览" : "上游未返回该结果的文件"}
                    </span>
                ) : item.kind === "video" ? (
                    <video data-testid="tool-result-video" src={src} controls playsInline preload="metadata" className="block h-auto max-h-[520px] w-full object-contain" />
                ) : comparing && beforeImageUrl && src ? (
                    <div className="w-full p-2">
                        <ToolResultCompareSlider before={beforeImageUrl} after={src} testId={`tool-result-compare-${index}`} />
                    </div>
                ) : (
                    <img
                        data-testid="tool-result-image"
                        src={src}
                        alt={`结果 ${index + 1}`}
                        loading="lazy"
                        onClick={onPreview}
                        className="block h-auto max-h-[520px] w-full cursor-zoom-in object-contain"
                    />
                )}

                {/* 右上角悬停快捷浮层：大图预览 + 前后对比 + 存入资产库/发送画布次级图标 */}
                {!dropped ? (
                    <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <button
                            type="button"
                            onClick={onPreview}
                            title="大图预览"
                            data-testid={`tool-result-preview-${index}`}
                            className="inline-flex size-7 items-center justify-center rounded-md bg-black/65 text-white transition hover:bg-black/80"
                        >
                            <Maximize2 aria-hidden="true" className="size-3.5" />
                        </button>
                        {item.kind === "image" && beforeImageUrl ? (
                            <button
                                type="button"
                                onClick={() => setComparing((prev) => !prev)}
                                aria-pressed={comparing}
                                title="前后对比"
                                data-testid={`tool-result-compare-toggle-${index}`}
                                className={cn(
                                    "inline-flex size-7 items-center justify-center rounded-md text-white transition",
                                    comparing ? "bg-selected" : "bg-black/65 hover:bg-black/80",
                                )}
                            >
                                <Columns2 aria-hidden="true" className="size-3.5" />
                            </button>
                        ) : null}
                    </div>
                ) : null}
            </div>

            {/* 卡片操作栏：主操作（继续修图/去背景/高清放大/做同款/下载）+ 次级动作图标（存资产/发画布） */}
            <div className="flex flex-wrap items-center gap-1 border-t border-border/60 bg-card/90 px-2 py-1.5">
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

                {item.kind === "image" ? (
                    <>
                        <button
                            type="button"
                            disabled={dropped || busy}
                            onClick={() => void runHandoff("REMOVE_PEN")}
                            data-testid={`tool-result-handoff-edit-${index}`}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <WandSparkles aria-hidden="true" className="size-3" />
                            继续修图
                        </button>
                        <button
                            type="button"
                            disabled={dropped || busy}
                            onClick={() => void runHandoff("WHITE_BACKGROUND")}
                            data-testid={`tool-result-handoff-matting-${index}`}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Eraser aria-hidden="true" className="size-3" />
                            去背景
                        </button>
                        <button
                            type="button"
                            disabled={dropped || busy}
                            onClick={() => void runHandoff("SCALE_UP")}
                            data-testid={`tool-result-handoff-upscale-${index}`}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Expand aria-hidden="true" className="size-3" />
                            高清放大
                        </button>
                        <button
                            type="button"
                            disabled={dropped || busy}
                            onClick={() => void runHandoff("IMAGE_TO_VIDEO")}
                            data-testid={`tool-result-handoff-video-${index}`}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Video aria-hidden="true" className="size-3" />
                            生成视频
                        </button>
                    </>
                ) : null}

                {onMakeSame ? (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => onMakeSame(item, index)}
                        data-testid={`tool-result-make-same-${index}`}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Sparkles aria-hidden="true" className="size-3" />
                        一键做同款
                    </button>
                ) : null}

                <div className="ml-auto flex items-center gap-1">
                    <button
                        type="button"
                        disabled={dropped || busy}
                        title={t("toolChrome.result.saveAsset")}
                        onClick={() =>
                            run(`save-${index}`, async () => t("toolChrome.result.savedToAssets", { id: (await saveToAssets(item, index, { toolId, taskId })).assetId }))
                        }
                        data-testid={`tool-result-save-${index}`}
                        className="inline-flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <FolderPlus aria-hidden="true" className="size-3.5" />
                        <span className="sr-only">{t("toolChrome.result.saveAsset")}</span>
                    </button>
                    <button
                        type="button"
                        disabled={dropped || busy}
                        title={t("toolChrome.result.sendCanvas")}
                        onClick={() =>
                            run(`canvas-${index}`, async () =>
                                t("toolChrome.result.sentToCanvas", {
                                    id: (await sendToCanvas(item, { toolId, projectId, projectTitle })).projectId,
                                }),
                            )
                        }
                        data-testid={`tool-result-canvas-${index}`}
                        className="inline-flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Send aria-hidden="true" className="size-3.5" />
                        <span className="sr-only">{t("toolChrome.result.sendCanvas")}</span>
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
            </div>
        </li>
    );
}

function ResultLightboxModal({
    item,
    index,
    total,
    beforeImageUrl,
    onClose,
    onPrev,
    onNext,
    onDownload,
}: {
    item: ToolTaskResultItem;
    index: number;
    total: number;
    beforeImageUrl?: string;
    onClose: () => void;
    onPrev?: () => void;
    onNext?: () => void;
    onDownload: () => void;
}) {
    const blobUrl = useBlobUrl(item.blob);
    const storedUrl = useStoredResultUrl(item.storageKey, item.dataUrl ?? item.url ?? blobUrl);
    const src = item.dataUrl ?? item.url ?? blobUrl ?? storedUrl;
    const [compareMode, setCompareMode] = useState(false);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={`结果 ${index + 1} 大图预览`}
            data-testid="tool-result-lightbox"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
            onClick={onClose}
        >
            <div
                className="relative flex max-h-[90vh] w-full max-w-4xl flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                    <span className="text-sm font-medium text-foreground">
                        结果预览（{index + 1} / {total}）
                    </span>
                    <div className="flex items-center gap-2">
                        {item.kind === "image" && beforeImageUrl ? (
                            <button
                                type="button"
                                onClick={() => setCompareMode((prev) => !prev)}
                                data-testid="tool-result-lightbox-compare"
                                className={cn(
                                    "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition",
                                    compareMode ? "border-selected bg-selected-soft text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                                )}
                            >
                                <Columns2 aria-hidden="true" className="size-3.5" />
                                前后对比
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={onDownload}
                            data-testid="tool-result-lightbox-download"
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition hover:opacity-90"
                        >
                            <Download aria-hidden="true" className="size-3.5" />
                            下载
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="关闭预览"
                            data-testid="tool-result-lightbox-close"
                            className="inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                            <X aria-hidden="true" className="size-4" />
                        </button>
                    </div>
                </div>

                <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
                    {item.kind === "video" ? (
                        <video src={src} controls autoPlay playsInline className="max-h-[75vh] max-w-full rounded-lg object-contain" />
                    ) : compareMode && beforeImageUrl && src ? (
                        <div className="w-full max-w-2xl">
                            <ToolResultCompareSlider before={beforeImageUrl} after={src} testId="tool-result-lightbox-slider" />
                        </div>
                    ) : (
                        <img src={src} alt={`结果 ${index + 1}`} className="max-h-[75vh] max-w-full rounded-lg object-contain" />
                    )}
                </div>

                {total > 1 ? (
                    <div className="flex items-center justify-between pt-1">
                        <button
                            type="button"
                            disabled={!onPrev}
                            onClick={onPrev}
                            className="rounded-md border border-border px-3 py-1 text-xs disabled:opacity-40"
                        >
                            上一张
                        </button>
                        <button
                            type="button"
                            disabled={!onNext}
                            onClick={onNext}
                            className="rounded-md border border-border px-3 py-1 text-xs disabled:opacity-40"
                        >
                            下一张
                        </button>
                    </div>
                ) : null}
            </div>
        </div>
    );
}


