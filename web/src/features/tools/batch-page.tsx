import { Download, ImagePlus, Loader2, Play, Plus, RotateCcw, Square, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ToolShell } from "@/components/tools/tool-shell";
import { getBatchTools } from "@/features/tools/registry";
import { readFileAsDataUrl } from "@/lib/image-utils";
import { cn } from "@/lib/utils";
import type { BatchRowOutcome } from "@/services/api/tools/batch-runner";
import {
    BATCH_CONCURRENCY_MAX,
    BATCH_CONCURRENCY_MIN,
} from "@/services/api/tools/batch-runner";
import { useBatchTaskStore, type BatchStatus, type BatchTask, type BatchTaskRow } from "@/stores/use-batch-task-store";

/**
 * 批量生图工作台（TASK-007）。
 *
 * 只呈现真实状态：预检结果来自 `preflightBatch`，进度来自 runner 的 onRowUpdate，
 * 没有 outcome 的行一律显示“排队中/未执行”，不伪造百分比，也不在失败时编造结果。
 */

const STATUS_LABEL: Record<BatchStatus, string> = {
    draft: "草稿",
    blocked: "预检未通过",
    ready: "可执行",
    running: "执行中",
    completed: "已结束",
    cancelled: "已取消",
};

const ROW_STATUS_LABEL: Record<BatchRowOutcome["status"], string> = {
    pending: "排队中",
    running: "执行中",
    succeeded: "成功",
    failed: "失败",
    unknown: "结果未知",
    skipped: "已跳过",
    cancelled: "已取消",
};

const ROW_STATUS_TONE: Record<BatchRowOutcome["status"], string> = {
    pending: "text-muted-foreground",
    running: "text-sky-600 dark:text-sky-400",
    succeeded: "text-emerald-600 dark:text-emerald-400",
    failed: "text-red-600 dark:text-red-400",
    unknown: "text-amber-600 dark:text-amber-400",
    skipped: "text-muted-foreground",
    cancelled: "text-muted-foreground",
};

function downloadFile(filename: string, content: string, mimeType: string) {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // 立即回收会让部分浏览器取消下载，延后释放。
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

export interface BatchPageProps {
    batchId?: string;
    sidebar: ReactNode;
}

export function BatchPage({ batchId, sidebar }: BatchPageProps) {
    const hydrated = useBatchTaskStore((state) => state.hydrated);
    const hydrate = useBatchTaskStore((state) => state.hydrate);
    const batches = useBatchTaskStore((state) => state.batches);
    const activeBatchId = useBatchTaskStore((state) => state.activeBatchId);
    const openBatch = useBatchTaskStore((state) => state.openBatch);
    const createBatch = useBatchTaskStore((state) => state.createBatch);
    const setTool = useBatchTaskStore((state) => state.setTool);
    const setConcurrency = useBatchTaskStore((state) => state.setConcurrency);
    const addRow = useBatchTaskStore((state) => state.addRow);
    const appendRowsFromText = useBatchTaskStore((state) => state.appendRowsFromText);
    const updateRow = useBatchTaskStore((state) => state.updateRow);
    const removeRow = useBatchTaskStore((state) => state.removeRow);
    const attachReferences = useBatchTaskStore((state) => state.attachReferences);
    const preflight = useBatchTaskStore((state) => state.preflight);
    const run = useBatchTaskStore((state) => state.run);
    const cancel = useBatchTaskStore((state) => state.cancel);
    const retryRows = useBatchTaskStore((state) => state.retryRows);
    const exportReport = useBatchTaskStore((state) => state.exportReport);

    const [busy, setBusy] = useState<null | "run" | "retry" | "preflight">(null);
    const [bulkText, setBulkText] = useState("");

    useEffect(() => {
        if (!hydrated) hydrate();
    }, [hydrated, hydrate]);

    useEffect(() => {
        if (!hydrated || !batchId) return;
        if (!batches[batchId]) openBatch(batchId);
    }, [hydrated, batchId, batches, openBatch]);

    const batchTools = useMemo(() => getBatchTools(), []);
    const batch: BatchTask | undefined = batchId ? batches[batchId] : batches[activeBatchId ?? ""];

    const outcomesById = useMemo(() => {
        const map = new Map<string, BatchRowOutcome>();
        for (const outcome of batch?.outcomes ?? []) map.set(outcome.rowId, outcome);
        return map;
    }, [batch?.outcomes]);

    const summary = useMemo(() => {
        const counts = { total: 0, done: 0, failed: 0, running: 0, skipped: 0 };
        for (const row of batch?.rows ?? []) {
            counts.total += 1;
            const outcome = outcomesById.get(row.id);
            if (!outcome) continue;
            if (outcome.status === "succeeded") counts.done += 1;
            else if (outcome.status === "failed" || outcome.status === "unknown") counts.failed += 1;
            else if (outcome.status === "running") counts.running += 1;
            else if (outcome.status === "skipped") counts.skipped += 1;
        }
        return counts;
    }, [batch?.rows, outcomesById]);

    const retryableCount = useMemo(
        () =>
            (batch?.outcomes ?? []).filter(
                (outcome) => outcome.status !== "succeeded" && (outcome.error?.retryable ?? outcome.status === "unknown"),
            ).length,
        [batch?.outcomes],
    );

    const running = batch?.status === "running";
    const blockingIssues = (batch?.preflight?.issues ?? []).filter((issue) => issue.severity === "blocking");
    /** 行级阻断单独列出来：不改批次级 ok，但用户必须看得见哪一行会被跳过。 */
    const rowBlockers = Object.entries(batch?.preflight?.rows ?? {}).flatMap(([rowId, row]) =>
        row.issues.filter((issue) => issue.severity === "blocking").map((issue) => ({ rowId, issue })),
    );
    const rowIndexById = new Map((batch?.rows ?? []).map((row, index) => [row.id, index + 1]));
    const blockedRowCount = new Set(rowBlockers.map((item) => item.rowId)).size;
    /** 预检明确未通过时不允许开跑：开跑只会得到一批 skipped，白等一轮。 */
    const preflightBlocked = batch?.preflight ? !batch.preflight.ok : false;

    const handleCreate = (toolId: string) => {
        const created = createBatch(toolId);
        window.history.replaceState(null, "", `/tools/batch-generate/${created.batchId}`);
    };

    const handleRun = async () => {
        if (!batch) return;
        setBusy("run");
        try {
            await run(batch.batchId);
        } finally {
            setBusy(null);
        }
    };

    const handleRetry = async () => {
        if (!batch) return;
        setBusy("retry");
        try {
            await retryRows(batch.batchId);
        } finally {
            setBusy(null);
        }
    };

    const handlePreflight = () => {
        if (!batch) return;
        setBusy("preflight");
        try {
            preflight(batch.batchId);
        } finally {
            setBusy(null);
        }
    };

    const handleExport = (format: "csv" | "json") => {
        if (!batch) return;
        const file = exportReport(batch.batchId, format);
        if (file) downloadFile(file.filename, file.content, file.mimeType);
    };

    const handleBulkAppend = () => {
        if (!batch || !bulkText.trim()) return;
        const added = appendRowsFromText(batch.batchId, bulkText);
        if (added > 0) setBulkText("");
    };

    const headerBadges = batch ? (
        <span
            data-testid="batch-status"
            className={cn(
                "shrink-0 rounded border border-border px-1.5 text-[11px] leading-5",
                batch.status === "blocked" ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
            )}
        >
            {STATUS_LABEL[batch.status]}
        </span>
    ) : null;

    const actions = batch ? (
        <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                并发
                <select
                    aria-label="并发上限"
                    value={batch.concurrency}
                    onChange={(event) => setConcurrency(batch.batchId, Number(event.target.value))}
                    className="h-8 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
                >
                    {Array.from({ length: BATCH_CONCURRENCY_MAX - BATCH_CONCURRENCY_MIN + 1 }, (_, index) => BATCH_CONCURRENCY_MIN + index).map(
                        (value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ),
                    )}
                </select>
            </label>
            <button
                type="button"
                onClick={handlePreflight}
                disabled={running || busy !== null}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs transition hover:bg-accent disabled:opacity-50"
            >
                预检
            </button>
            {running ? (
                <button
                    type="button"
                    onClick={() => cancel(batch.batchId)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs transition hover:bg-accent"
                >
                    <Square className="size-3.5" />
                    取消
                </button>
            ) : (
                <button
                    type="button"
                    onClick={handleRun}
                    disabled={busy !== null || batch.rows.length === 0 || preflightBlocked}
                    title={preflightBlocked ? "预检未通过：先补齐阻断项（参考图/提示词/模型）" : undefined}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                >
                    {busy === "run" ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                    开始执行
                </button>
            )}
            <button
                type="button"
                onClick={handleRetry}
                disabled={running || busy !== null || retryableCount === 0}
                title={retryableCount === 0 ? "没有可重试的行" : `重试 ${retryableCount} 行`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs transition hover:bg-accent disabled:opacity-50"
            >
                {busy === "retry" ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                重试失败行{retryableCount > 0 ? ` (${retryableCount})` : ""}
            </button>
            <button
                type="button"
                onClick={() => handleExport("csv")}
                disabled={!batch.outcomes.length}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs transition hover:bg-accent disabled:opacity-50"
            >
                <Download className="size-3.5" />
                CSV
            </button>
            <button
                type="button"
                onClick={() => handleExport("json")}
                disabled={!batch.outcomes.length}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs transition hover:bg-accent disabled:opacity-50"
            >
                <Download className="size-3.5" />
                JSON
            </button>
        </div>
    ) : null;

    return (
        <ToolShell
            title="批量生图工作台"
            subtitle={`/tools/batch-generate${batchId ? `/${batchId}` : ""}`}
            breadcrumb="批量生图 / 工作台"
            badges={headerBadges}
            actions={actions}
            sidebar={sidebar}
            sidebarLabel="工具"
        >
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
                {!hydrated ? (
                    <p className="text-sm text-muted-foreground">正在恢复本地批次…</p>
                ) : !batch ? (
                    <ToolPicker tools={batchTools} onCreate={handleCreate} />
                ) : (
                    <>
                        <section className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card px-4 py-3">
                            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                                工具
                                <select
                                    aria-label="批量工具"
                                    value={batch.toolId}
                                    onChange={(event) => setTool(batch.batchId, event.target.value)}
                                    disabled={running}
                                    className="h-8 min-w-48 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                                >
                                    {batchTools.map((tool) => (
                                        <option key={tool.id} value={tool.id}>
                                            {tool.title} ({tool.id})
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                <span>行数 {summary.total}</span>
                                <span>成功 {summary.done}</span>
                                <span>失败 {summary.failed}</span>
                                <span>跳过 {summary.skipped}</span>
                                {summary.running > 0 ? <span className="text-sky-600 dark:text-sky-400">进行中 {summary.running}</span> : null}
                            </div>
                            <button
                                type="button"
                                onClick={() => handleCreate(batch.toolId)}
                                className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs transition hover:bg-accent"
                            >
                                <Plus className="size-3.5" />
                                新建批次
                            </button>
                        </section>

                        {batch.lastError ? (
                            <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                                {batch.lastError.code}: {batch.lastError.message}
                            </p>
                        ) : null}

                        {blockingIssues.length > 0 ? (
                            <section data-testid="batch-blocking" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                                <p className="font-medium">预检有 {blockingIssues.length} 个阻塞项，执行不会开始：</p>
                                <ul className="mt-1 list-disc pl-4">
                                    {blockingIssues.map((issue, index) => (
                                        <li key={`${issue.code}-${index}`}>
                                            {issue.code}: {issue.message}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ) : null}

                        {rowBlockers.length > 0 ? (
                            <section data-testid="batch-row-blockers" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                                <p className="font-medium">有 {blockedRowCount} 行的输入还不完整，这些行不会提交：</p>
                                <ul className="mt-1 list-disc pl-4">
                                    {rowBlockers.map(({ rowId, issue }) => (
                                        <li key={`${rowId}-${issue.code}`}>
                                            第 {rowIndexById.get(rowId) ?? "?"} 行 · {issue.code}: {issue.message}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ) : null}

                        {(batch.preflight?.duplicateGroups.length ?? 0) > 0 ? (
                            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                                检测到 {batch.preflight?.duplicateGroups.length} 组内容完全相同的行（
                                {batch.preflight?.duplicateGroups.map((group) => group.join(" / ")).join("；")}
                                ）。批量不会自动去重，确认要重复请求再执行。
                            </p>
                        ) : null}

                        <section className="rounded-lg border border-border bg-card">
                            <header className="flex items-center justify-between border-b border-border px-4 py-2">
                                <h2 className="text-sm font-medium">输入行</h2>
                                <div className="flex items-center gap-2">
                                    <input
                                        value={bulkText}
                                        onChange={(event) => setBulkText(event.target.value)}
                                        placeholder="每行一条提示词，粘贴后添加"
                                        className="h-8 w-64 rounded-md border border-border bg-background px-2 text-xs"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleBulkAppend}
                                        disabled={!bulkText.trim() || running}
                                        className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs transition hover:bg-accent disabled:opacity-50"
                                    >
                                        <Upload className="size-3.5" />
                                        批量添加
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => addRow(batch.batchId)}
                                        disabled={running}
                                        className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs transition hover:bg-accent disabled:opacity-50"
                                    >
                                        <Plus className="size-3.5" />
                                        加一行
                                    </button>
                                </div>
                            </header>
                            <ul className="divide-y divide-border">
                                {batch.rows.map((row, index) => (
                                    <BatchRowEditor
                                        key={row.id}
                                        index={index}
                                        row={row}
                                        outcome={outcomesById.get(row.id)}
                                        disabled={running}
                                        onPatch={(patch) => updateRow(batch.batchId, row.id, patch)}
                                        onRemove={() => removeRow(batch.batchId, row.id)}
                                        onAttach={(references) => attachReferences(batch.batchId, row.id, references, "append")}
                                    />
                                ))}
                                {batch.rows.length === 0 ? (
                                    <li className="px-4 py-6 text-center text-xs text-muted-foreground">还没有输入行，先加一行。</li>
                                ) : null}
                            </ul>
                        </section>

                        <p className="text-[11px] leading-5 text-muted-foreground">
                            并发默认 3（1–5 可调）；每行都是一次独立的真实工具请求，失败不会中断其他行。取消只停止还没开始的行，已提交的任务可在任务面板继续。
                        </p>
                    </>
                )}
            </div>
        </ToolShell>
    );
}

function ToolPicker({ tools, onCreate }: { tools: ReturnType<typeof getBatchTools>; onCreate: (toolId: string) => void }) {
    return (
        <section className="rounded-lg border border-border bg-card px-4 py-4">
            <h2 className="text-sm font-medium">选择可批量工具</h2>
            <p className="mt-1 text-xs text-muted-foreground">引用 12 个支持批量的工具；每个输入行独立排队、独立计费。</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {tools.map((tool) => (
                    <li key={tool.id}>
                        <button
                            type="button"
                            onClick={() => onCreate(tool.id)}
                            className="w-full rounded-md border border-border px-3 py-2 text-left transition hover:bg-accent"
                        >
                            <span className="block text-sm">{tool.title}</span>
                            <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">{tool.id}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}

interface BatchRowEditorProps {
    index: number;
    row: BatchTaskRow;
    outcome?: BatchRowOutcome;
    disabled: boolean;
    onPatch: (patch: Partial<BatchTaskRow>) => void;
    onRemove: () => void;
    onAttach: (references: BatchTaskRow["references"]) => void;
}

function BatchRowEditor({ index, row, outcome, disabled, onPatch, onRemove, onAttach }: BatchRowEditorProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const handleFiles = async (files: FileList | null) => {
        if (!files?.length) return;
        setUploading(true);
        try {
            const loaded = await Promise.all(
                Array.from(files).map(async (file, offset) => ({
                    id: `${row.id}-ref-${Date.now()}-${offset}`,
                    name: file.name,
                    type: file.type || "image/png",
                    dataUrl: await readFileAsDataUrl(file),
                })),
            );
            onAttach(loaded);
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    return (
        <li data-testid={`batch-row-${index}`} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-start gap-3">
                <input
                    type="checkbox"
                    aria-label={`启用第 ${index + 1} 行`}
                    checked={row.enabled !== false}
                    disabled={disabled}
                    onChange={(event) => onPatch({ enabled: event.target.checked })}
                    className="mt-2 size-3.5"
                />
                <span className="mt-1.5 w-6 shrink-0 text-right font-mono text-[11px] text-muted-foreground">{index + 1}</span>
                <div className="min-w-0 flex-1">
                    <textarea
                        aria-label={`第 ${index + 1} 行提示词`}
                        value={row.prompt ?? ""}
                        disabled={disabled}
                        onChange={(event) => onPatch({ prompt: event.target.value })}
                        rows={2}
                        placeholder="这一行要做什么（提示词/指令）"
                        className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => inputRef.current?.click()}
                            disabled={disabled || uploading}
                            className="inline-flex h-7 items-center gap-1 rounded border border-border px-2 text-[11px] transition hover:bg-accent disabled:opacity-50"
                        >
                            {uploading ? <Loader2 className="size-3 animate-spin" /> : <ImagePlus className="size-3" />}
                            参考图
                        </button>
                        <input
                            ref={inputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            hidden
                            onChange={(event) => void handleFiles(event.target.files)}
                        />
                        {row.references.map((reference) => (
                            <span key={reference.id} className="relative inline-flex size-10 overflow-hidden rounded border border-border">
                                <img src={reference.dataUrl} alt={reference.name} className="size-full object-cover" />
                            </span>
                        ))}
                        {row.referencesDetached ? (
                            <span className="text-[11px] text-amber-600 dark:text-amber-400">
                                刷新后有 {row.referencesDetached} 张参考图未恢复，请重新上传
                            </span>
                        ) : null}
                        {outcome ? (
                            <span className={cn("ml-auto text-[11px]", ROW_STATUS_TONE[outcome.status])}>
                                {ROW_STATUS_LABEL[outcome.status]}
                                {outcome.attempts > 0 ? ` · 第 ${outcome.attempts} 次` : ""}
                                {outcome.error ? ` · ${outcome.error.code}` : ""}
                            </span>
                        ) : null}
                    </div>
                    {outcome?.error ? (
                        <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                            {outcome.error.message}
                            {outcome.error.retryable ? "（可重试）" : "（不可重试）"}
                        </p>
                    ) : null}
                    {outcome && outcome.resultUrls.length > 0 ? (
                        <ul className="mt-1 flex flex-wrap gap-2">
                            {outcome.resultUrls.map((url) => (
                                <li key={url}>
                                    <a
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="block size-14 overflow-hidden rounded border border-border"
                                    >
                                        <img src={url} alt="结果" className="size-full object-cover" loading="lazy" />
                                    </a>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                    {outcome && outcome.preflightIssues.length > 0 ? (
                        <ul className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                            {outcome.preflightIssues.map((issue, issueIndex) => (
                                <li key={`${issue.code}-${issueIndex}`}>
                                    {issue.code}: {issue.message}
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </div>
                <button
                    type="button"
                    onClick={onRemove}
                    disabled={disabled}
                    aria-label={`删除第 ${index + 1} 行`}
                    className="mt-1 inline-flex size-7 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                    {disabled ? <X className="size-3.5" /> : <Trash2 className="size-3.5" />}
                </button>
            </div>
        </li>
    );
}
