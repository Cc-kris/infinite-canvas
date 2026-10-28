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
import { Download, ImagePlus, RotateCcw, RotateCw, Sparkles, Trash2, UploadCloud } from "lucide-react";

import { TaskStatusPanel } from "@/components/tools/task-status";
import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolShell } from "@/components/tools/tool-shell";
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
import { cn } from "@/lib/utils";
import { loadToolAssetRecords, type ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { flushToolDrafts, useToolDraftStore } from "@/stores/use-tool-draft-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";

export type ExtractConfig = { isTransparent: boolean; format: PrintExtractOutputFormat };

const FORMAT_LABEL: Record<PrintExtractOutputFormat, string> = { png: "PNG", jpeg: "JPEG" };

const STATUS_LABEL: Record<PrintExtractItemStatus, string> = {
    idle: "待提取",
    running: "提取中",
    succeeded: "已完成",
    failed: "失败",
};

const STATUS_TONE: Record<PrintExtractItemStatus, string> = {
    idle: "border-border text-muted-foreground",
    running: "border-primary/40 bg-primary/10 text-foreground",
    succeeded: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    failed: "border-destructive/40 bg-destructive/10 text-destructive",
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
    return (
        <section data-testid="print-extract-uploader" className="rounded-lg border border-border bg-card p-3">
            <header className="flex items-start gap-2">
                <UploadCloud className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                    <h2 className="text-sm font-medium">上传需要提取印花的商品图片</h2>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                        20M 以内，分辨率：{PRINT_EXTRACT_SOURCE_LIMITS.minSide} × {PRINT_EXTRACT_SOURCE_LIMITS.minSide} ~ {PRINT_EXTRACT_SOURCE_LIMITS.maxSide} × {PRINT_EXTRACT_SOURCE_LIMITS.maxSide}，宽高比小于 {PRINT_EXTRACT_SOURCE_LIMITS.maxAspect}
                    </p>
                </div>
            </header>
            <ToolAssetInput toolId={PRINT_EXTRACT_TOOL_ID} maxCount={maxCount} title="从本地上传 / 从作品库选择" disabled={disabled} onChange={onAssets} />
            <p className="mt-2 text-[11px] text-muted-foreground">上传多张图片，开始批量提取；每张独立提交与独立状态。</p>
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

    const [items, setItems] = useState<PrintExtractItem[]>([]);
    const [cfg, setCfg] = useState<{ current: ExtractConfig; past: ExtractConfig[]; future: ExtractConfig[] }>({
        current: { isTransparent: false, format: "png" },
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
            subtitle={`快速提取商品中的印花图案 · 20M / ${PRINT_EXTRACT_SOURCE_LIMITS.minSide}–${PRINT_EXTRACT_SOURCE_LIMITS.maxSide} · ${progress}`}
            breadcrumb={<span className="text-[11px] text-muted-foreground">商品图设计 / 印花提取</span>}
            badges={
                <span data-testid="print-extract-real-badge" className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    真实提取 · 上游出图
                </span>
            }
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
                    <button
                        type="button"
                        data-testid="print-extract-reset"
                        onClick={() => {
                            applyConfig({ isTransparent: false, format: "png" });
                            setItems([]);
                            setTasks({});
                            setSnapshots({});
                            setBatch(false);
                            setActiveId(null);
                            setSelectedId(null);
                            setNotice(null);
                        }}
                        className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-accent"
                    >
                        重置
                    </button>
                </>
            }
            sidebar={sidebar}
            sidebarLabel="商品图设计"
        >
            <div data-testid="print-extract-workspace" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0 space-y-3">
                    <ExtractUploader disabled={busy} maxCount={batch ? PRINT_EXTRACT_SOURCE_LIMITS.maxBatch : 1} onAssets={handleAssets} />

                    <div data-testid="print-extract-batch" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <input type="checkbox" checked={batch} disabled={busy} onChange={(event) => setBatch(event.target.checked)} className="size-3.5 accent-[var(--primary)]" />
                            批量提取（多张图各自独立状态）
                        </label>
                        <p data-testid="print-extract-progress" className="text-[11px] text-muted-foreground">
                            {progress}
                        </p>
                    </div>

                    <section className="space-y-2">
                        <header className="flex items-center justify-between">
                            <h2 className="text-sm font-medium">提取结果</h2>
                            <span className="text-[11px] text-muted-foreground">
                                共 {summary.total} 张 · 成功 {summary.succeeded} · 失败 {summary.failed}
                            </span>
                        </header>
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
                        {summary.failed > 0 ? (
                            <button
                                type="button"
                                data-testid="print-extract-retry-failed"
                                disabled={busy}
                                onClick={handleRetryFailed}
                                className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-accent disabled:opacity-40"
                            >
                                <RotateCw className="size-3.5" aria-hidden /> 只重试失败的 {summary.failed} 张
                            </button>
                        ) : null}
                    </section>

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

                    {activeTask ? <ToolResult task={activeTask} toolId={PRINT_EXTRACT_TOOL_ID} title="提取结果" onRetry={() => (activeItem ? void submit([activeItem]) : undefined)} /> : null}
                </div>

                <aside className="space-y-3">
                    <TransparencySwitch
                        value={config.isTransparent}
                        format={config.format}
                        disabled={busy}
                        onValueChange={(next) => applyConfig({ ...config, isTransparent: next })}
                        onFormatChange={(next) => applyConfig({ isTransparent: next === "jpeg" ? false : config.isTransparent, format: next })}
                    />

                    <section className="rounded-lg border border-border bg-card p-3">
                        <h2 className="text-sm font-medium">立即生成</h2>
                        <p data-testid="print-extract-estimate" className="mt-1 text-[11px] leading-5 text-muted-foreground">
                            预计输出 {batch ? summary.idle + summary.failed : Math.min(1, items.length)} 张 {FORMAT_LABEL[config.format]} · 宽高跟随源图
                        </p>
                        <button
                            type="button"
                            data-testid="print-extract-generate"
                            disabled={!canGenerate}
                            onClick={handleGenerate}
                            className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                        >
                            <Sparkles className="size-4" aria-hidden />
                            {busy ? "提取中…" : "立即生成"}
                        </button>
                        {items.length === 0 ? <p className="mt-2 text-[11px] text-muted-foreground">先上传需要提取印花的商品图片。</p> : null}
                        {config.format === "jpeg" && config.isTransparent ? <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">JPEG 不支持透明，已自动关闭透明图。</p> : null}
                    </section>
                </aside>
            </div>
        </ToolShell>
    );
}

/** 布局别名：technical_design 里 `layout: "extract"` 的入口名。 */
export const ExtractWorkspace = PrintExtractWorkspace;

export default PrintExtractWorkspace;
