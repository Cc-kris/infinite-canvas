/**
 * TASK-032：「印花提取」PRINT_EXTRACT 工作区（layout = extract）。
 *
 * 规格：docs/V1.0/plan_linkfox_navigation/page-specs/25-print-extract.md
 *  - 三个独有区域：商品图上传（ExtractUploader）｜透明图开关（TransparencySwitch）｜提取结果（AssetResultGrid）；
 *  - 20M / 384–4096 / 宽高比 < 5，支持批量，批量时每张独立状态；
 *  - 透明开关决定是否去背景，并与导出格式联动（JPEG 不允许透明）；
 *  - 结果只来自上游真实返回；换图清结果、配置变更后旧结果标“来自旧版本”；
 *  - 任务锁定提交快照，支持下载 / 入库 / 发送画布 / 单结果重试 / 查看本次输入快照。
 *
 * 真实边界：本文件不做任何像素伪造或“演示成功”，提交走 adapters/print-extract 的真实网关端口。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Download, ImagePlus, Loader2, RotateCcw, RotateCw, Sparkles, Trash2 } from "lucide-react";

import { TaskStatusPanel } from "@/components/tools/task-status";
import { ToolResult } from "@/components/tools/tool-result";
import { printExtractResultPanelTask } from "@/features/tools/adapters/print-extract";
import { ToolShell } from "@/components/tools/tool-shell";
import { OrigRail, PRINT_EXTRACT_RAIL } from "@/components/tools/workspaces/orig-rail";
import { buildPrintExtractUnit, printExtractPreflightIssues, printExtractSourceReference, runPrintExtract } from "@/features/tools/adapters/print-extract";
import { getToolById, toolSpecs } from "@/features/tools/registry";
import {
    PRINT_EXTRACT_SOURCE_LIMITS,
    PRINT_EXTRACT_TOOL_ID,
    PRINT_EXTRACT_TOOL_SLUG,
    applyPrintExtractItemResult,
    createPrintExtractItems,
    createPrintExtractSnapshot,
    describePrintExtractProgress,
    normalizePrintExtractOptions,
    parsePrintExtractDraftValues,
    printExtractDownloadName,
    printExtractDraftValues,
    printExtractIssuesText,
    printExtractSnapshotHash,
    summarizePrintExtractItems,
    validatePrintExtractSource,
    type PrintExtractItem,
    type PrintExtractItemStatus,
    type PrintExtractOutputFormat,
    type PrintExtractSnapshot,
    type PrintExtractSource,
} from "@/features/tools/registry/print-extract";
import { cn, randomId } from "@/lib/utils";
import { adoptLibraryAsset, loadToolAssetRecords, toolAssetLibraryItemsFromAssets, ToolAssetError, uploadToolAsset, type ToolAssetLibraryItem, type ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { useAssetStore, type ImageAsset, type VideoAsset } from "@/stores/use-asset-store";
import { flushToolDrafts, useToolDraftStore } from "@/stores/use-tool-draft-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";
import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";

export type ExtractConfig = { isTransparent: boolean; format: PrintExtractOutputFormat };

const FORMAT_LABEL: Record<PrintExtractOutputFormat, string> = { png: "PNG", jpeg: "JPEG" };

/** 上传约束：与原站提示一致（20M / 384–4096 / 宽高比 < 5 / jpg、png、webp）。 */
const EXTRACT_UPLOAD_CONSTRAINTS = {
    kind: "image" as const,
    mimeTypes: [...PRINT_EXTRACT_SOURCE_LIMITS.mimeTypes],
    maxBytes: PRINT_EXTRACT_SOURCE_LIMITS.maxBytes,
    minWidth: PRINT_EXTRACT_SOURCE_LIMITS.minSide,
    minHeight: PRINT_EXTRACT_SOURCE_LIMITS.minSide,
    maxWidth: PRINT_EXTRACT_SOURCE_LIMITS.maxSide,
    maxHeight: PRINT_EXTRACT_SOURCE_LIMITS.maxSide,
};

const STATUS_LABEL: Record<PrintExtractItemStatus, string> = {
    idle: "待提取",
    running: "提取中",
    succeeded: "已完成",
    failed: "失败",
    unknown: "结果未知",
};

const STATUS_TONE: Record<PrintExtractItemStatus, string> = {
    idle: "border-border text-muted-foreground",
    running: "border-primary/40 bg-primary/10 text-foreground",
    succeeded: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    failed: "border-destructive/40 bg-destructive/10 text-destructive",
    unknown: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

function decodeSize(url: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error("图片解码失败，请换一张图"));
        image.src = url;
    });
}

function triggerDownload(url: string, name: string): void {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.rel = "noopener";
    anchor.click();
}

function fileExtension(format: PrintExtractOutputFormat): string {
    return format === "jpeg" ? "jpg" : "png";
}

/* ------------------------------------------------------------------ *
 * 专用组件 1：商品图上传
 * ------------------------------------------------------------------ */

export function ExtractUploader({ disabled, maxCount, onAssets }: { disabled: boolean; maxCount: number; onAssets: (assetIds: string[], records: ToolAssetRecord[]) => void }) {
    const assets = useAssetStore((state) => state.assets);
    const library = useMemo(
        () => toolAssetLibraryItemsFromAssets(assets.filter((asset): asset is ImageAsset | VideoAsset => asset.kind === "image" || asset.kind === "video")),
        [assets],
    );
    const [records, setRecords] = useState<ToolAssetRecord[]>([]);
    const [pending, setPending] = useState<Array<{ key: string; name: string; ratio: number }>>([]);
    const [notice, setNotice] = useState("");
    const [dragging, setDragging] = useState(false);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const recordsRef = useRef<ToolAssetRecord[]>([]);
    const pendingRef = useRef<Array<{ key: string; name: string; ratio: number }>>([]);

    const emit = useCallback(
        (next: ToolAssetRecord[]) => {
            recordsRef.current = next;
            setRecords(next);
            onAssets(
                next.map((record) => record.id),
                next,
            );
        },
        [onAssets],
    );

    const pickFiles = useCallback(
        async (files: File[]) => {
            if (disabled || !files.length) return;
            for (const file of files) {
                if (recordsRef.current.length + pendingRef.current.length >= maxCount) {
                    setNotice(`最多 ${maxCount} 张，先移除一张再上传`);
                    break;
                }
                const key = randomId();
                const entry = { key, name: file.name, ratio: 0 };
                pendingRef.current = [...pendingRef.current, entry];
                setPending(pendingRef.current);
                try {
                    const record = await uploadToolAsset(file, {
                        constraints: EXTRACT_UPLOAD_CONSTRAINTS,
                        onProgress: (progress) => {
                            pendingRef.current = pendingRef.current.map((item) => (item.key === key ? { ...item, ratio: progress.ratio } : item));
                            setPending(pendingRef.current);
                        },
                    });
                    setNotice("");
                    emit([...recordsRef.current.filter((item) => item.id !== record.id), record]);
                } catch (error) {
                    setNotice(error instanceof ToolAssetError ? error.issue.message : "上传失败，请重试");
                } finally {
                    pendingRef.current = pendingRef.current.filter((item) => item.key !== key);
                    setPending(pendingRef.current);
                }
            }
        },
        [disabled, emit, maxCount],
    );

    const adopt = useCallback(
        async (item: ToolAssetLibraryItem) => {
            setLibraryOpen(false);
            if (recordsRef.current.length >= maxCount) {
                setNotice(`最多 ${maxCount} 张，先移除一张再上传`);
                return;
            }
            try {
                const record = await adoptLibraryAsset(item);
                emit([...recordsRef.current, record]);
            } catch {
                setNotice("作品库素材读取失败，请换一张");
            }
        },
        [emit, maxCount],
    );

    const remove = useCallback(
        (id: string) => {
            emit(recordsRef.current.filter((record) => record.id !== id));
        },
        [emit],
    );

    const thumbs = records.length ? records : [];

    return (
        <section data-testid="print-extract-uploader" className="rounded-lg bg-card p-[10px]">
            <div
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-label="上传需要提取印花的商品图片"
                onClick={() => !disabled && inputRef.current?.click()}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        if (!disabled) inputRef.current?.click();
                    }
                }}
                onDragOver={(event) => {
                    event.preventDefault();
                    if (!disabled) setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    void pickFiles(Array.from(event.dataTransfer?.files ?? []));
                }}
                className={cn(
                    "flex h-[148px] w-full cursor-pointer flex-col items-center justify-center gap-[6px] rounded-lg border border-dashed px-3 text-center transition",
                    dragging ? "border-primary bg-primary/5" : "border-border bg-black/[0.02]",
                    disabled && "cursor-not-allowed opacity-60",
                )}
            >
                <ImagePlus className="size-[22px] text-muted-foreground" aria-hidden />
                <p className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)]">上传需要提取印花的商品图片</p>
                <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() => inputRef.current?.click()}
                        className="h-6 w-[108px] rounded-md bg-primary text-[12px] leading-none text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                    >
                        从本地上传
                    </button>
                    <button
                        type="button"
                        disabled={disabled || !library.length}
                        title={library.length ? "从作品库（资产库）选择" : "资产库暂时没有可用图片"}
                        onClick={() => setLibraryOpen((open) => !open)}
                        className="h-6 w-[100px] rounded-md border border-border bg-card text-[12px] leading-none text-muted-foreground transition hover:border-border disabled:opacity-50"
                    >
                        从作品库选择
                    </button>
                </div>
                <p className="text-[12px] leading-[19px] text-muted-foreground">
                    20M以内，分辨率：{PRINT_EXTRACT_SOURCE_LIMITS.minSide} * {PRINT_EXTRACT_SOURCE_LIMITS.minSide} ~ {PRINT_EXTRACT_SOURCE_LIMITS.maxSide} * {PRINT_EXTRACT_SOURCE_LIMITS.maxSide}，宽高比小于{PRINT_EXTRACT_SOURCE_LIMITS.maxAspect}
                </p>
            </div>
            <input
                ref={inputRef}
                type="file"
                accept={PRINT_EXTRACT_SOURCE_LIMITS.mimeTypes.join(",")}
                multiple={maxCount > 1}
                className="hidden"
                data-testid="tool-asset-file-input"
                onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    event.target.value = "";
                    void pickFiles(files);
                }}
            />

            {libraryOpen ? (
                <div className="mt-2 max-h-40 overflow-auto rounded-lg border border-border bg-card p-1">
                    {library.length ? (
                        library.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => void adopt(item)}
                                className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-[11px] text-muted-foreground hover:bg-border"
                            >
                                <img src={item.url} alt="" className="size-8 shrink-0 rounded object-cover" />
                                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                            </button>
                        ))
                    ) : (
                        <p className="px-2 py-2 text-[11px] text-muted-foreground">作品库还没有可用图片</p>
                    )}
                </div>
            ) : null}

            {thumbs.length ? (
                <div className="mt-2 flex flex-wrap gap-2" data-testid="print-extract-selected">
                    {thumbs.map((record) => (
                        <div key={record.id} className="group relative size-[50px] rounded-lg border border-border bg-card p-[5px]">
                            <img src={record.url} alt={record.name} className="size-[38px] rounded-md object-cover" />
                            <button
                                type="button"
                                aria-label={`移除 ${record.name}`}
                                onClick={() => remove(record.id)}
                                className="absolute -right-1 -top-1 hidden size-4 items-center justify-center rounded-full bg-black/70 text-[10px] text-white group-hover:flex"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="mt-2">
                    <div className="flex items-center gap-2 text-[12px] text-[rgba(0,0,0,0.3)]">
                        <span className="h-px flex-1 bg-border" />
                        <span>或试试这些</span>
                        <span className="h-px flex-1 bg-border" />
                    </div>
                    <div className="mt-2 flex gap-[10px]">
                        {[0, 1, 2, 3].map((index) => (
                            <button
                                key={index}
                                type="button"
                                disabled={disabled}
                                aria-label={`示例图 ${index + 1}`}
                                onClick={() => inputRef.current?.click()}
                                className="flex size-[50px] items-center justify-center rounded-lg border border-border bg-card p-[5px] text-muted-foreground transition hover:border-border disabled:opacity-50"
                            >
                                <ImagePlus className="size-[22px]" aria-hidden />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {pending.length ? (
                <ul className="mt-2 space-y-1" data-testid="print-extract-upload-progress">
                    {pending.map((item) => (
                        <li key={item.key} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <Loader2 className="size-3 animate-spin" aria-hidden />
                            <span className="min-w-0 flex-1 truncate">{item.name}</span>
                            <span>{Math.round(item.ratio * 100)}%</span>
                        </li>
                    ))}
                </ul>
            ) : null}

            {notice ? (
                <p role="alert" data-testid="print-extract-upload-notice" className="mt-2 text-[11px] text-destructive">
                    {notice}
                </p>
            ) : null}
        </section>
    );
}

/* ------------------------------------------------------------------ *
 * 专用组件 2：透明图开关（与导出格式联动）
 * ------------------------------------------------------------------ */

export function TransparencySwitch({
    value,
    format,
    disabled,
    onValueChange,
    onFormatChange,
}: {
    value: boolean;
    format: PrintExtractOutputFormat;
    disabled: boolean;
    onValueChange: (next: boolean) => void;
    onFormatChange: (next: PrintExtractOutputFormat) => void;
}) {
    const locked = disabled || format === "jpeg";
    return (
        <section data-testid="print-extract-transparency" className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <h2 className="text-sm font-medium">生成透明图</h2>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{format === "jpeg" ? "JPEG 不支持透明背景，需切换为 PNG" : value ? "去背景并输出透明 PNG" : "保留原始背景，输出不透底图片"}</p>
                </div>
                <button
                    type="button"
                    role="switch"
                    data-testid="print-extract-transparency-toggle"
                    aria-checked={value && format === "png"}
                    aria-label="生成透明图"
                    disabled={locked}
                    onClick={() => onValueChange(!value)}
                    className={cn(
                        "inline-flex h-6 w-11 shrink-0 items-center rounded-full border px-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        value && format === "png" ? "border-primary bg-primary" : "border-border bg-muted",
                        locked && "cursor-not-allowed opacity-50",
                    )}
                >
                    <span className={cn("size-5 rounded-full bg-background shadow transition-transform", value && format === "png" ? "translate-x-5" : "translate-x-0")} />
                </button>
            </div>
            <p data-testid="print-extract-transparency-state" className="mt-2 text-[11px] font-medium text-foreground">
                {value && format === "png" ? "开启" : "关闭"}
            </p>
            <div className="mt-3 flex items-center gap-1" role="group" aria-label="导出格式">
                {(["png", "jpeg"] as const).map((item) => (
                    <button
                        key={item}
                        type="button"
                        data-testid={`print-extract-format-${item}`}
                        aria-pressed={format === item}
                        disabled={disabled}
                        onClick={() => onFormatChange(item)}
                        className={cn(
                            "min-h-9 flex-1 rounded-md border px-2 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            format === item ? "border-primary bg-accent text-foreground" : "border-border text-muted-foreground hover:bg-accent",
                        )}
                    >
                        导出 {FORMAT_LABEL[item]}
                    </button>
                ))}
            </div>
        </section>
    );
}

/* ------------------------------------------------------------------ *
 * 专用组件 3：提取结果（原图 vs 结果对比，逐张独立状态）
 * ------------------------------------------------------------------ */

export function AssetResultGrid({
    items,
    selectedId,
    busyId,
    format,
    onSelect,
    onRemove,
    onRetry,
    onDownload,
}: {
    items: PrintExtractItem[];
    selectedId: string | null;
    busyId: string | null;
    format: PrintExtractOutputFormat;
    onSelect: (id: string) => void;
    onRemove: (id: string) => void;
    onRetry: (id: string) => void;
    onDownload: (item: PrintExtractItem, index: number) => void;
}) {
    if (items.length === 0) {
        return (
            <div data-testid="print-extract-empty" className="flex h-56 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-center">
                <ImagePlus className="size-6 text-muted-foreground" aria-hidden />
                <p className="text-sm text-muted-foreground">快速提取商品中的印花图案</p>
                <p className="text-[11px] text-muted-foreground">上传商品图后点击“立即生成”</p>
            </div>
        );
    }

    return (
        <div data-testid="print-extract-grid" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item, index) => {
                const active = selectedId === item.id;
                const running = item.status === "running" || busyId === item.id;
                const showResult = item.status === "succeeded" && Boolean(item.resultUrl);
                return (
                    <article
                        key={item.id}
                        data-testid={`print-extract-card-${index}`}
                        data-status={item.status}
                        data-stale={item.stale ? "true" : "false"}
                        className={cn("group overflow-hidden rounded-lg border bg-card transition", active ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-primary/40")}
                    >
                        <button
                            type="button"
                            aria-label={`选择 ${item.name}`}
                            aria-pressed={active}
                            onClick={() => onSelect(item.id)}
                            className="flex w-full items-center gap-2 border-b border-border px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <span className={cn("rounded border px-1.5 py-0.5 text-[10px]", STATUS_TONE[item.status])}>{STATUS_LABEL[item.status]}</span>
                            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{item.name}</span>
                            {item.stale ? (
                                <span data-testid={`print-extract-stale-${index}`} className="shrink-0 rounded border border-amber-500/40 bg-amber-500/10 px-1 text-[10px] text-amber-700 dark:text-amber-300">
                                    来自旧版本
                                </span>
                            ) : null}
                        </button>

                        <div className="grid grid-cols-2 gap-px bg-border">
                            <figure className="relative bg-muted/40">
                                <img src={item.url} alt={`${item.name} 原图`} className="aspect-square w-full object-contain" loading="lazy" />
                                <figcaption className="absolute bottom-1 left-1 rounded bg-background/85 px-1 text-[10px] text-muted-foreground">原图</figcaption>
                            </figure>
                            <figure className="relative bg-[conic-gradient(from_90deg,#e5e7eb_0deg_90deg,#fff_90deg_180deg,#e5e7eb_180deg_270deg,#fff_270deg_360deg)] bg-[length:14px_14px]">
                                {running ? (
                                    <div className="flex aspect-square w-full items-center justify-center text-[11px] text-muted-foreground">提取中…</div>
                                ) : showResult ? (
                                    <img src={item.resultUrl} alt={`${item.name} 印花提取结果`} className="aspect-square w-full object-contain" loading="lazy" />
                                ) : item.status === "unknown" ? (
                                    <div data-testid={`print-extract-unknown-${index}`} className="flex aspect-square w-full flex-col items-center justify-center gap-1 px-2 text-center text-[11px] text-amber-700 dark:text-amber-300">
                                        <span>结果未知</span>
                                        <span className="text-[10px] text-muted-foreground">上游是否受理无法确认，请人工确认后再重提</span>
                                    </div>
                                ) : (
                                    <div className="flex aspect-square w-full items-center justify-center px-2 text-center text-[11px] text-muted-foreground">{item.status === "failed" ? "本张失败，可单独重试" : "待提取"}</div>
                                )}
                                <figcaption className="absolute bottom-1 left-1 rounded bg-background/85 px-1 text-[10px] text-muted-foreground">结果</figcaption>
                            </figure>
                        </div>

                        {item.error ? (
                            <p data-testid={`print-extract-error-${index}`} className="border-t border-border px-2 py-1.5 text-[11px] text-destructive">
                                {item.error}
                            </p>
                        ) : null}

                        <div className="flex items-center justify-end gap-1 border-t border-border px-1.5 py-1">
                            {showResult ? (
                                <button type="button" onClick={() => onDownload(item, index + 1)} className="inline-flex min-h-8 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground">
                                    <Download className="size-3.5" aria-hidden /> 下载 {FORMAT_LABEL[format]}
                                </button>
                            ) : null}
                            {item.status === "failed" ? (
                                <button
                                    type="button"
                                    data-testid={`print-extract-retry-${index}`}
                                    disabled={running}
                                    onClick={() => onRetry(item.id)}
                                    className="inline-flex min-h-8 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                                >
                                    <RotateCw className="size-3.5" aria-hidden /> 重试本张
                                </button>
                            ) : null}
                            <button
                                type="button"
                                aria-label={`移除 ${item.name}`}
                                disabled={running}
                                onClick={() => onRemove(item.id)}
                                className="inline-flex min-h-8 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                            >
                                <Trash2 className="size-3.5" aria-hidden />
                            </button>
                        </div>
                    </article>
                );
            })}
        </div>
    );
}

/* ------------------------------------------------------------------ *
 * 页面
 * ------------------------------------------------------------------ */

function relatedTools() {
    return toolSpecs.filter((spec) => spec.category === "product-design" && spec.enabled).slice(0, 12);
}

export function PrintExtractWorkspace() {
    const spec = getToolById(PRINT_EXTRACT_TOOL_ID);
    const draft = useToolDraftStore((state) => state.drafts[PRINT_EXTRACT_TOOL_ID]);
    const patchDraft = useToolDraftStore((state) => state.patch);

    // 结果面板只认落库任务：刷新后由 hydrate 用 storageKey 复原真实字节，再交给共享 ToolResult。
    const storedTasks = useToolTaskStore((state) => state.tasks);
    const tasksHydrated = useToolTaskStore((state) => state.hydrated);
    const hydrateTasks = useToolTaskStore((state) => state.hydrate);
    const toolTasks = useMemo(
        () => Object.values(storedTasks).filter((task) => task.toolId === PRINT_EXTRACT_TOOL_ID),
        [storedTasks],
    );
    const persistedPanelTask = useMemo(() => printExtractResultPanelTask(toolTasks), [toolTasks]);

    useEffect(() => {
        if (!tasksHydrated) hydrateTasks();
    }, [tasksHydrated, hydrateTasks]);

    const [items, setItems] = useState<PrintExtractItem[]>([]);
    const [cfg, setCfg] = useState<{ current: ExtractConfig; past: ExtractConfig[]; future: ExtractConfig[] }>({
        current: { isTransparent: true, format: "png" },
        past: [],
        future: [],
    });
    const config = cfg.current;
    const [batch, setBatch] = useState(false);
    const [hydrated, setHydrated] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [tasks, setTasks] = useState<Record<string, ToolTask>>({});
    const [snapshots, setSnapshots] = useState<Record<string, PrintExtractSnapshot>>({});
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [tab, setTab] = useState<"result" | "history">("result");
    const [showSnapshot, setShowSnapshot] = useState(false);
    const busyRef = useRef(false);

    const draftRevision = draft?.revision ?? null;
    const summary = useMemo(() => summarizePrintExtractItems(items), [items]);
    const progress = useMemo(() => describePrintExtractProgress(items), [items]);
    const activeItem = items.find((item) => item.id === activeId) ?? null;
    const activeTask = activeId ? tasks[activeId] : undefined;
    const activeSnapshot = activeId ? snapshots[activeId] : undefined;
    const issueList = useMemo(() => items.slice(0, 1).flatMap((item) => validatePrintExtractSource({ width: item.width, height: item.height, bytes: item.bytes, mimeType: item.mimeType })), [items]);

    /* 草稿恢复：只恢复配置 + 资产 id，再从资产索引取回真实地址与尺寸。 */
    useEffect(() => {
        let alive = true;
        void (async () => {
            const values = parsePrintExtractDraftValues(useToolDraftStore.getState().drafts[PRINT_EXTRACT_TOOL_ID]?.values);
            if (values) {
                setCfg({ current: { isTransparent: values.format === "jpeg" ? false : values.isTransparent, format: values.format }, past: [], future: [] });
                setBatch(values.batch);
                if (values.assetIds.length > 0) {
                    const { records } = await loadToolAssetRecords(values.assetIds);
                    const sources = (
                        await Promise.all(
                            records.map(async (record): Promise<PrintExtractSource | null> => {
                                const url = record.url;
                                if (!url) return null;
                                const size = record.width && record.height ? { width: record.width, height: record.height } : await decodeSize(url).catch(() => null);
                                if (!size) return null;
                                return { assetId: record.id, name: record.name, url, bytes: record.bytes, mimeType: record.mimeType, ...size };
                            }),
                        )
                    ).filter((source): source is PrintExtractSource => source !== null);
                    if (alive) setItems(createPrintExtractItems(sources));
                }
            }
            if (alive) setHydrated(true);
        })();
        return () => {
            alive = false;
        };
    }, []);

    /* 草稿落盘：配置 + 资产顺序（不含二进制）。 */
    useEffect(() => {
        if (!hydrated) return;
        patchDraft(PRINT_EXTRACT_TOOL_ID, {
            values: { ...printExtractDraftValues({ isTransparent: config.isTransparent, format: config.format, batch, items }) },
            assetIds: items.map((item) => item.assetId),
        });
    }, [hydrated, config, batch, items, patchDraft]);

    const applyConfig = useCallback((next: ExtractConfig) => {
        setCfg((value) => {
            if (value.current.isTransparent === next.isTransparent && value.current.format === next.format) return value;
            return { current: next, past: [...value.past, value.current].slice(-20), future: [] };
        });
    }, []);

    const undo = useCallback(() => {
        setCfg((value) => {
            const previous = value.past[value.past.length - 1];
            if (!previous) return value;
            return { current: previous, past: value.past.slice(0, -1), future: [value.current, ...value.future].slice(0, 20) };
        });
    }, []);

    const redo = useCallback(() => {
        setCfg((value) => {
            const next = value.future[0];
            if (!next) return value;
            return { current: next, past: [...value.past, value.current].slice(-20), future: value.future.slice(1) };
        });
    }, []);

    const upsertTask = useCallback((next: ToolTask) => {
        const key = next.clientOperationId || next.id;
        setTasks((value) => ({ ...value, [key]: next }));
    }, []);

    const applyItem = useCallback((id: string, patch: Parameters<typeof applyPrintExtractItemResult>[1]) => {
        setItems((value) => value.map((item) => (item.id === id ? applyPrintExtractItemResult(item, patch) : item)));
    }, []);

    /* 上传：真实入库后的记录 → 源图条目；替换/新增都保持顺序，已存在的不重建。 */
    const handleAssets = useCallback(
        (assetIds: string[], records: ToolAssetRecord[]) => {
            setNotice(null);
            void (async () => {
                const known = new Set(items.map((item) => item.assetId));
                const incoming = records.filter((record) => assetIds.includes(record.id) || !assetIds.length);
                const sources = (
                    await Promise.all(
                        incoming.map(async (record): Promise<PrintExtractSource | null> => {
                            if (known.has(record.id) && assetIds.length === 0) return null;
                            const url = record.url;
                            if (!url) return null;
                            const size = record.width && record.height ? { width: record.width, height: record.height } : await decodeSize(url).catch(() => null);
                            if (!size) {
                                setNotice(`${record.name}：图片解码失败，请换一张图`);
                                return null;
                            }
                            return { assetId: record.id, name: record.name, url, bytes: record.bytes, mimeType: record.mimeType, ...size };
                        }),
                    )
                ).filter((source): source is PrintExtractSource => source !== null);
                if (sources.length === 0) return;
                setItems((value) => {
                    const kept = assetIds.length ? value.filter((item) => assetIds.includes(item.assetId)) : value.filter((item) => !sources.some((source) => source.assetId === item.assetId));
                    return createPrintExtractItems([...kept, ...sources]);
                });
                setBatch((value) => value || sources.length > 1);
            })();
        },
        [items],
    );

    const submit = useCallback(
        async (targets: PrintExtractItem[]) => {
            if (busyRef.current || targets.length === 0) return;
            busyRef.current = true;
            setBusy(true);
            setNotice(null);
            try {
                for (const target of targets) {
                    const options = normalizePrintExtractOptions({ isTransparent: config.isTransparent });
                    const preflight = printExtractPreflightIssues({ ...options, width: target.width, height: target.height }, target);
                    if (preflight.length > 0) {
                        applyItem(target.id, { status: "failed", error: preflight.join("；") });
                        continue;
                    }
                    applyItem(target.id, { status: "running" });
                    setActiveId(target.id);
                    setSelectedId(target.id);
                    try {
                        const snapshot = createPrintExtractSnapshot({ source: target, options, draftRevision });
                        const unit = buildPrintExtractUnit({ snapshot, source: printExtractSourceReference(target) });
                        const { task, view } = await runPrintExtract({ unit, snapshot, draftRevision }, { persist: upsertTask });
                        setTasks((value) => ({ ...value, [target.id]: task }));
                        setSnapshots((value) => ({ ...value, [target.id]: snapshot }));
                        if (view.status === "succeeded" && view.imageUrl) {
                            applyItem(target.id, { status: "succeeded", resultUrl: view.imageUrl, snapshotHash: view.snapshotHash });
                        } else if (view.status === "running") {
                            applyItem(target.id, { status: "running", snapshotHash: view.snapshotHash });
                        } else if (view.status === "unknown") {
                            // 不能标 failed（会误导用户以为没扣费），也不能标 running（永远转圈）。
                            applyItem(target.id, {
                                status: "unknown",
                                snapshotHash: view.snapshotHash,
                                error: view.error ?? "任务状态未知：无法确认上游是否受理，请先人工确认后再决定是否重提",
                            });
                        } else {
                            applyItem(target.id, {
                                status: "failed",
                                snapshotHash: view.snapshotHash,
                                error: view.error ?? "提取失败，未获得图片",
                            });
                        }
                    } catch (error) {
                        applyItem(target.id, { status: "failed", error: error instanceof Error ? error.message : "提取失败" });
                    }
                }
            } finally {
                busyRef.current = false;
                setBusy(false);
                await flushToolDrafts([PRINT_EXTRACT_TOOL_ID]);
            }
        },
        [applyItem, config.isTransparent, draftRevision, upsertTask],
    );

    const handleGenerate = useCallback(() => {
        const targets = batch ? items.filter((item) => item.status === "idle" || item.status === "failed") : items.slice(0, 1);
        const pending = targets.filter((item) => item.status !== "running");
        void submit(pending);
    }, [batch, items, submit]);

    const handleRetryFailed = useCallback(() => {
        void submit(items.filter((item) => item.status === "failed"));
    }, [items, submit]);

    const handleDownload = useCallback(
        (item: PrintExtractItem, index: number) => {
            if (!item.resultUrl) return;
            const base = printExtractDownloadName(item.name, index).replace(/\.png$/, "");
            triggerDownload(item.resultUrl, `${base}.${fileExtension(config.format)}`);
        },
        [config.format],
    );

    const handleRemove = useCallback((id: string) => {
        setItems((value) => value.filter((item) => item.id !== id));
        setTasks((value) => {
            const next = { ...value };
            delete next[id];
            return next;
        });
        setSnapshots((value) => {
            const next = { ...value };
            delete next[id];
            return next;
        });
        setActiveId((value) => (value === id ? null : value));
        setSelectedId((value) => (value === id ? null : value));
    }, []);

    const currentHash = (item: PrintExtractItem) => printExtractSnapshotHash({ sourceAssetId: item.assetId, isTransparent: config.isTransparent, width: item.width, height: item.height });

    const staleItems = items.filter((item) => Boolean(item.snapshotHash) && item.snapshotHash !== currentHash(item));
    const canGenerate = items.length > 0 && !busy && (batch ? items.some((item) => item.status === "idle" || item.status === "failed") : true);

    const sidebar = (
        <nav aria-label="商品图设计工具" className="flex flex-col gap-1">
            {relatedTools().map((tool) => (
                <Link key={tool.id} to={tool.route} className={cn("rounded px-2 py-1 text-[11px] transition hover:bg-accent", tool.id === PRINT_EXTRACT_TOOL_ID ? "bg-accent font-medium text-foreground" : "text-muted-foreground")}>
                    {tool.title}
                </Link>
            ))}
        </nav>
    );

    return (
        <ToolShell
            title={spec?.title ?? "印花提取"}
            subtitle={`快速提取商品中的印花图案 · 20M / ${PRINT_EXTRACT_SOURCE_LIMITS.minSide}–${PRINT_EXTRACT_SOURCE_LIMITS.maxSide}${progress ? ` · ${progress}` : ""}`}
            breadcrumb={<span className="text-[11px] text-muted-foreground">商品图设计 / 印花提取</span>}
            notices={
                <>
                    {notice ? (
                        <p data-testid="print-extract-notice" className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            {notice}
                        </p>
                    ) : null}
                    {issueList.length > 0 ? (
                        <p data-testid="print-extract-source-issue" className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                            {printExtractIssuesText(issueList)}
                        </p>
                    ) : null}
                    {staleItems.length > 0 ? (
                        <p data-testid="print-extract-stale-banner" className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                            有 {staleItems.length} 张结果来自旧版本（配置或源图已变更），如需当前配置请重新生成。
                        </p>
                    ) : null}
                </>
            }
            actions={
                <>
                    <button
                        type="button"
                        data-testid="print-extract-undo"
                        onClick={undo}
                        disabled={cfg.past.length === 0}
                        className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-accent disabled:opacity-40"
                    >
                        <RotateCcw className="size-3.5" aria-hidden /> 撤销
                    </button>
                    <button
                        type="button"
                        data-testid="print-extract-redo"
                        onClick={redo}
                        disabled={cfg.future.length === 0}
                        className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-accent disabled:opacity-40"
                    >
                        <RotateCw className="size-3.5" aria-hidden /> 重做
                    </button>
                </>
            }
            sidebar={sidebar}
            sidebarLabel="商品图设计"
        >
            <OrigRail items={PRINT_EXTRACT_RAIL} active="印花提取" driver testId="print-extract-rail" label="商品图设计" />
            <div data-testid="print-extract-workspace" className="min-h-[596px]">
                <ToolWorkspaceColumns
                    config={(
                        <div data-testid="print-extract-config" className="flex flex-col rounded-lg border border-border bg-card">
                    <div className="flex-1 space-y-3 px-4 py-4">
                        <ExtractUploader disabled={busy} maxCount={batch ? PRINT_EXTRACT_SOURCE_LIMITS.maxBatch : 1} onAssets={handleAssets} />

                        <button
                            type="button"
                            data-testid="print-extract-batch"
                            aria-pressed={batch}
                            disabled={busy}
                            onClick={() => setBatch((value) => !value)}
                            className={cn(
                                "flex h-8 w-full items-center justify-center gap-1 rounded-md border border-primary text-xs transition disabled:opacity-50",
                                batch ? "bg-primary text-primary-foreground" : "bg-card text-primary hover:bg-primary/10",
                            )}
                        >
                            <ImagePlus className="size-3.5" aria-hidden />
                            <span>上传多张图片，开始批量提取</span>
                        </button>

                        <div className="flex h-9 items-center justify-between border-t border-border pt-2">
                            <span className="text-xs text-muted-foreground">生成透明图</span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={config.isTransparent}
                                aria-label="生成透明图"
                                data-testid="print-extract-transparent"
                                disabled={busy}
                                onClick={() => applyConfig({ isTransparent: !config.isTransparent, format: !config.isTransparent ? "png" : config.format })}
                                className={cn(
                                    "flex h-[22px] w-[86px] items-center justify-center gap-1.5 rounded-full text-[10px] leading-none transition disabled:opacity-50",
                                    config.isTransparent ? "bg-primary text-primary-foreground" : "bg-muted-foreground/50 text-primary-foreground",
                                )}
                            >
                                <span className={config.isTransparent ? "font-medium" : "opacity-60"}>开启</span>
                                <span className={config.isTransparent ? "opacity-60" : "font-medium"}>关闭</span>
                            </button>
                        </div>
                    </div>

                    <div className="border-t-[3px] border-border bg-card px-4 py-2">
                        <button
                            type="button"
                            data-testid="print-extract-generate"
                            disabled={!canGenerate}
                            onClick={handleGenerate}
                            className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-md bg-primary text-[13px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                            <span>立即生成</span>
                        </button>
                    </div>
                        </div>
                    )}
                >
                    <section className="flex min-w-0 flex-col rounded-lg border border-border bg-card">
                    <div className="flex h-[42px] shrink-0 items-center gap-5 rounded-tr-lg bg-card px-3">
                        <button
                            type="button"
                            data-testid="print-extract-tab-result"
                            aria-pressed={tab === "result"}
                            onClick={() => setTab("result")}
                            className={cn("text-sm transition", tab === "result" ? "font-medium text-primary" : "text-muted-foreground hover:text-foreground")}
                        >
                            生成结果
                        </button>
                        <button
                            type="button"
                            data-testid="print-extract-tab-history"
                            aria-pressed={tab === "history"}
                            onClick={() => setTab("history")}
                            className={cn("flex items-center gap-1 text-xs transition", tab === "history" ? "text-primary" : "text-muted-foreground hover:text-foreground")}
                        >
                            历史记录
                            {items.some((item) => item.status === "succeeded") ? <span className="rounded bg-primary/10 px-1 text-[11px] text-primary">{items.filter((item) => item.status === "succeeded").length}</span> : null}
                        </button>
                        <div className="ml-auto flex items-center gap-2">
                            {summary.failed > 0 ? (
                                <button
                                    type="button"
                                    data-testid="print-extract-retry-failed"
                                    disabled={busy}
                                    onClick={handleRetryFailed}
                                    className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11px] text-muted-foreground hover:bg-accent disabled:opacity-40"
                                >
                                    <RotateCw className="size-3" aria-hidden /> 只重试失败的 {summary.failed} 张
                                </button>
                            ) : null}
                            
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
                        <h2 className="sr-only">生成结果</h2>
                        {tab === "result" ? (
                            items.length === 0 && !persistedPanelTask ? (
                                <div data-testid="print-extract-empty" className="flex h-full min-h-[420px] items-center justify-center">
                                    <div className="flex h-[300px] w-[460px] max-w-full flex-col items-center justify-center gap-2 rounded-xl bg-card text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                                        <ImagePlus className="size-9 text-primary" aria-hidden />
                                        <p className="text-xl font-medium text-foreground">印花提取</p>
                                        <p className="text-base text-muted-foreground">快速提取商品中的印花图案</p>
                                    </div>
                                </div>
                            ) : (
                                <section className="space-y-3">
                                    <AssetResultGrid
                                        items={items}
                                        selectedId={selectedId}
                                        busyId={busy ? activeId : null}
                                        format={config.format}
                                        onSelect={setSelectedId}
                                        onRemove={handleRemove}
                                        onRetry={(id) => {
                                            const target = items.find((item) => item.id === id);
                                            if (target) void submit([target]);
                                        }}
                                        onDownload={handleDownload}
                                    />
                                    {activeTask ? (
                                        <section className="space-y-2">
                                            <TaskStatusPanel task={activeTask} onRetry={() => (activeItem ? void submit([activeItem]) : undefined)} />
                                            <details open={showSnapshot} onToggle={(event) => setShowSnapshot((event.target as HTMLDetailsElement).open)} data-testid="print-extract-snapshot" className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
                                                <summary className="cursor-pointer text-muted-foreground">查看本次输入快照</summary>
                                                {activeSnapshot ? (
                                                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                                        <dt>源图</dt>
                                                        <dd className="truncate text-foreground">{activeSnapshot.sourceName}</dd>
                                                        <dt>尺寸</dt>
                                                        <dd className="text-foreground">
                                                            {activeSnapshot.width} × {activeSnapshot.height}
                                                        </dd>
                                                        <dt>透明图</dt>
                                                        <dd className="text-foreground">{activeSnapshot.isTransparent ? "开启" : "关闭"}</dd>
                                                        <dt>幂等键</dt>
                                                        <dd className="truncate text-foreground">{activeSnapshot.clientOperationId}</dd>
                                                        <dt>指纹</dt>
                                                        <dd className="truncate text-foreground">{activeItem ? currentHash(activeItem) : "-"}</dd>
                                                    </dl>
                                                ) : (
                                                    <p className="mt-2 text-[11px] text-muted-foreground">还没有提交过快照。</p>
                                                )}
                                            </details>
                                        </section>
                                    ) : null}
                                    {activeTask || persistedPanelTask ? (
                                        <div
                                            data-testid="print-extract-result-panel"
                                            data-tool-id={PRINT_EXTRACT_TOOL_ID}
                                            data-task-id={(activeTask ?? persistedPanelTask)!.id}
                                            data-task-status={(activeTask ?? persistedPanelTask)!.status}
                                        >
                                            <ToolResult
                                                task={(activeTask ?? persistedPanelTask)!}
                                                toolId={PRINT_EXTRACT_TOOL_ID}
                                                title="生成结果"
                                                onRetry={() => (activeItem ? void submit([activeItem]) : undefined)}
                                            />
                                        </div>
                                    ) : null}
                                </section>
                            )
                        ) : (
                            <ul data-testid="print-extract-history" className="space-y-2">
                                {items.filter((item) => item.status === "succeeded").length === 0 ? (
                                    <li className="rounded-lg bg-card px-4 py-8 text-center text-xs text-muted-foreground">暂无历史记录，生成成功后会自动留档。</li>
                                ) : (
                                    items
                                        .filter((item) => item.status === "succeeded")
                                        .map((item, index) => (
                                            <li key={item.id} className="flex items-center gap-3 rounded-lg bg-card px-3 py-2">
                                                <img src={item.resultUrl ?? item.url} alt={item.name} className="size-10 rounded border border-border object-cover" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-xs text-foreground">{item.name}</p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {item.width} × {item.height} · {item.snapshotHash ? "已留档" : "本地产出"}
                                                    </p>
                                                </div>
                                                <button type="button" className="text-[11px] text-primary" onClick={() => handleDownload(item, index)}>
                                                    下载
                                                </button>
                                            </li>
                                        ))
                                )}
                            </ul>
                        )}
                    </div>
                </section>
                </ToolWorkspaceColumns>
            </div>
        </ToolShell>
    );
}

/** 布局别名：technical_design 里 `layout: "extract"` 的入口名。 */
export const ExtractWorkspace = PrintExtractWorkspace;

export default PrintExtractWorkspace;
