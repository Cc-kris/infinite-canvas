/**
 * TASK-007：批量任务 store（UI 状态 + 落盘）。
 *
 * 边界：
 * - 所有真实执行都经 `batch-runner` → `useToolTaskStore` 的网关（同一个 ToolTaskGateway 实例），
 *   store 自己不拼请求、不伪造结果；
 * - 落盘只存可复原的编排状态：行文本/字段/并发/预检/结果摘要；参考图 dataUrl 一律不落盘，
 *   刷新后标记 `referencesDetached` 让用户重传，而不是假装还有图；
 * - 报告导出只是把已发生的 outcomes 序列化，不重新执行。
 */
import { nanoid } from "nanoid";
import { create } from "zustand";

import {
    applyTaskToOutcome,
    buildBatchReport,
    clampBatchConcurrency,
    preflightBatch,
    retryBatchRows,
    runBatch,
    selectRetryableRowIds,
    serializeBatchReport,
    summarizeBatchOutcomes,
    type BatchGatewayPort,
    type BatchIssue,
    type BatchPreflight,
    type BatchReportFormat,
    type BatchReportFile,
    type BatchRowInput,
    type BatchRowOutcome,
    type BatchRunRequest,
    type BatchSummary,
} from "@/services/api/tools/batch-runner";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { useConfigStore } from "@/stores/use-config-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";
import type { ReferenceImage } from "@/types/image";

export const BATCH_STORAGE_VERSION = 1 as const;
export const BATCH_INDEX_KEY = "batch-task:v1:index";
export const BATCH_MAX_PERSISTED = 20;

export const batchStorageKey = (batchId: string) => `batch-task:v1:${batchId}`;

export type BatchStorage = {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
};

function memoryStorage(): BatchStorage {
    const map = new Map<string, string>();
    return {
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => {
            map.set(key, value);
        },
        removeItem: (key) => {
            map.delete(key);
        },
    };
}

let fallbackStorage: BatchStorage | null = null;

/** SSR / 私密模式没有 localStorage 时退化为内存存储，不抛错。 */
export function getBatchStorage(): BatchStorage {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
    fallbackStorage ??= memoryStorage();
    return fallbackStorage;
}

export type BatchStatus = "draft" | "blocked" | "ready" | "running" | "completed" | "cancelled";

export type BatchTaskRow = BatchRowInput & {
    /** 内存中的真实参考图（含 dataUrl），不落盘。 */
    references: ReferenceImage[];
    /** 刷新恢复时被剥离的参考图数量；>0 表示需要用户重传。 */
    referencesDetached?: number;
};

export type BatchTask = {
    batchId: string;
    toolId: string;
    concurrency: number;
    sharedFields: Record<string, unknown>;
    rows: BatchTaskRow[];
    preflight: BatchPreflight | null;
    outcomes: BatchRowOutcome[];
    status: BatchStatus;
    startedAt?: number;
    finishedAt?: number;
    aborted?: boolean;
    createdAt: number;
    updatedAt: number;
    lastError?: { code: string; message: string } | null;
};

type PersistedBatch = Omit<BatchTask, "rows" | "outcomes"> & {
    storageVersion: typeof BATCH_STORAGE_VERSION;
    rows: Array<Omit<BatchTaskRow, "references"> & { references: []; referenceNames: string[] }>;
    outcomes: BatchRowOutcome[];
};

export function createBatchTaskRow(patch: Partial<BatchTaskRow> = {}): BatchTaskRow {
    return {
        id: patch.id ?? `row_${nanoid(8)}`,
        label: patch.label ?? "",
        prompt: patch.prompt ?? "",
        references: patch.references ? [...patch.references] : [],
        ...(patch.model ? { model: patch.model } : {}),
        ...(patch.size ? { size: patch.size } : {}),
        ...(patch.quality ? { quality: patch.quality } : {}),
        ...(patch.count !== undefined ? { count: patch.count } : {}),
        ...(patch.fields ? { fields: { ...patch.fields } } : {}),
        enabled: patch.enabled ?? true,
        ...(patch.referencesDetached ? { referencesDetached: patch.referencesDetached } : {}),
    };
}

export function createBatchTask(toolId: string, rows: BatchTaskRow[] = [createBatchTaskRow()]): BatchTask {
    const at = Date.now();
    return {
        batchId: `batch_${nanoid(10)}`,
        toolId,
        concurrency: clampBatchConcurrency(undefined),
        sharedFields: {},
        rows,
        preflight: null,
        outcomes: [],
        status: "draft",
        createdAt: at,
        updatedAt: at,
        lastError: null,
    };
}

export function batchToRunRequest(batch: BatchTask): BatchRunRequest {
    return {
        batchId: batch.batchId,
        toolId: batch.toolId,
        concurrency: batch.concurrency,
        sharedFields: batch.sharedFields,
        rows: batch.rows,
    };
}

/** 落盘前剥离 dataUrl/blob：只保留能证明“做过什么”的元数据。 */
export function sanitizeBatchForPersist(batch: BatchTask): PersistedBatch {
    return {
        storageVersion: BATCH_STORAGE_VERSION,
        batchId: batch.batchId,
        toolId: batch.toolId,
        concurrency: batch.concurrency,
        sharedFields: batch.sharedFields,
        preflight: batch.preflight,
        status: batch.status,
        startedAt: batch.startedAt,
        finishedAt: batch.finishedAt,
        aborted: batch.aborted,
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt,
        lastError: batch.lastError ?? null,
        rows: batch.rows.map((row) => {
            const { references, ...rest } = row;
            return { ...rest, references: [] as [], referenceNames: references.map((item) => item.name) };
        }),
        outcomes: batch.outcomes.map((outcome) => ({ ...outcome, resultUrls: [...outcome.resultUrls] })),
    };
}

function isPersistedBatch(value: unknown): value is PersistedBatch {
    if (!value || typeof value !== "object") return false;
    const batch = value as Partial<PersistedBatch>;
    return (
        batch.storageVersion === BATCH_STORAGE_VERSION &&
        typeof batch.batchId === "string" &&
        typeof batch.toolId === "string" &&
        Array.isArray(batch.rows) &&
        Array.isArray(batch.outcomes)
    );
}

export function parsePersistedBatch(raw: string | null): BatchTask | null {
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!isPersistedBatch(parsed)) return null;
        return {
            ...parsed,
            rows: parsed.rows.map((row) => {
                const { referenceNames, ...rest } = row as typeof row & { referenceNames?: string[] };
                return {
                    ...rest,
                    references: [],
                    ...(referenceNames?.length ? { referencesDetached: referenceNames.length } : {}),
                };
            }),
        };
    } catch {
        return null;
    }
}

function readIndex(storage: BatchStorage): string[] {
    try {
        const parsed: unknown = JSON.parse(storage.getItem(BATCH_INDEX_KEY) ?? "[]");
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
    } catch {
        return [];
    }
}

function persistBatch(batch: BatchTask, storage: BatchStorage = getBatchStorage()): void {
    storage.setItem(batchStorageKey(batch.batchId), JSON.stringify(sanitizeBatchForPersist(batch)));
    const index = [batch.batchId, ...readIndex(storage).filter((id) => id !== batch.batchId)];
    const kept = index.slice(0, BATCH_MAX_PERSISTED);
    for (const dropped of index.slice(BATCH_MAX_PERSISTED)) storage.removeItem(batchStorageKey(dropped));
    storage.setItem(BATCH_INDEX_KEY, JSON.stringify(kept));
}

function forgetPersistedBatch(batchId: string, storage: BatchStorage = getBatchStorage()): void {
    storage.removeItem(batchStorageKey(batchId));
    storage.setItem(BATCH_INDEX_KEY, JSON.stringify(readIndex(storage).filter((id) => id !== batchId)));
}

/** 批量执行与工具任务共用同一个网关实例，行任务才会出现在任务面板并可被 retry 复用。 */
function defaultGatewayPort(): BatchGatewayPort {
    return {
        runTool: (input, options) => useToolTaskStore.getState().runTool(input, options),
        retry: (taskId, input, options) => useToolTaskStore.getState().retryTask(taskId, input, options),
        getTask: (taskId) => useToolTaskStore.getState().tasks[taskId],
        findTask: ({ toolId, since }) => {
            const tasks = Object.values(useToolTaskStore.getState().tasks);
            const candidates = tasks.filter(
                (task) => task.toolId === toolId && (task.status === "failed" || task.status === "unknown") && task.updatedAt >= since,
            );
            candidates.sort((left, right) => right.updatedAt - left.updatedAt);
            return candidates[0];
        },
    };
}

const runningBatches = new Map<string, AbortController>();

export type BatchState = {
    batches: Record<string, BatchTask>;
    activeBatchId: string | null;
    hydrated: boolean;

    hydrate: (storage?: BatchStorage) => void;
    openBatch: (batchId: string) => BatchTask | null;
    createBatch: (toolId: string, rows?: BatchTaskRow[]) => BatchTask;
    setTool: (batchId: string, toolId: string) => void;
    setConcurrency: (batchId: string, concurrency: number) => void;
    replaceRows: (batchId: string, rows: BatchTaskRow[]) => void;
    addRow: (batchId: string, patch?: Partial<BatchTaskRow>) => BatchTaskRow | null;
    /** 粘贴多行文本：每行一条 prompt，空行忽略，行号进 label。 */
    appendRowsFromText: (batchId: string, text: string) => number;
    updateRow: (batchId: string, rowId: string, patch: Partial<BatchTaskRow>) => void;
    removeRow: (batchId: string, rowId: string) => void;
    attachReferences: (batchId: string, rowId: string, references: ReferenceImage[], mode?: "replace" | "append") => void;
    setSharedFields: (batchId: string, fields: Record<string, unknown>) => void;
    resetBatch: (batchId: string) => void;
    deleteBatch: (batchId: string) => void;

    preflight: (batchId: string) => BatchPreflight | null;
    run: (batchId: string, options?: { gateway?: BatchGatewayPort }) => Promise<BatchTask | null>;
    cancel: (batchId: string) => void;
    retryRows: (batchId: string, rowIds?: string[], options?: { gateway?: BatchGatewayPort }) => Promise<BatchTask | null>;
    exportReport: (batchId: string, format: BatchReportFormat) => BatchReportFile | null;
    summary: (batchId: string) => BatchSummary | null;
    reset: () => void;
};

function touch(batch: BatchTask, patch: Partial<BatchTask>): BatchTask {
    return { ...batch, ...patch, updatedAt: Date.now() };
}

/**
 * 刷新/崩溃后收敛被中断的批次。
 *
 * 执行器只活在内存里，刷新后 running 行的 Promise 已经不存在：
 * - 有 taskId 且任务已终态 → 用任务真实结果回填（成功结果、失败原因都不丢）；
 * - 没有 taskId 或任务仍在跑 → 关闭为可重试失败，绝不假装成功，也不让批次永久卡在 running。
 */
export function reconcileInterruptedBatch(
    batch: BatchTask,
    tasks: Record<string, ToolTask>,
    at: number,
): BatchTask {
    if (batch.status !== "running") return batch;

    const byRow = new Map(batch.outcomes.map((outcome) => [outcome.rowId, outcome]));
    const outcomes: BatchRowOutcome[] = batch.rows.map((row) => {
        const existing = byRow.get(row.id);
        if (existing && existing.status !== "pending" && existing.status !== "running") return existing;
        const task = existing?.taskId ? tasks[existing.taskId] : undefined;
        if (task && task.status !== "submitting" && task.status !== "validating" && task.status !== "running") {
            return applyTaskToOutcome(existing ?? emptyOutcome(row, at), task, at);
        }
        const base = existing ?? emptyOutcome(row, at);
        return {
            ...base,
            status: "failed",
            finishedAt: at,
            durationMs: base.startedAt !== undefined ? Math.max(0, at - base.startedAt) : undefined,
            error: {
                code: "batch-interrupted",
                message:
                    "页面刷新中断了这次批量执行；本行没有可反查的任务 ID，重试前请先到服务商后台确认是否已受理。",
                retryable: true,
            },
        };
    });
    const changed = batch.outcomes.length !== outcomes.length || outcomes.some((outcome, index) => outcome !== batch.outcomes[index]);
    if (!changed) {
        return touch(batch, { status: "completed", finishedAt: at });
    }
    return touch(batch, {
        outcomes,
        status: "completed",
        finishedAt: at,
        aborted: false,
        lastError: outcomes.some((outcome) => outcome.error?.code === "batch-interrupted")
            ? { code: "batch-interrupted", message: "页面刷新中断了批量执行；未完成的行已关闭为可重试失败。" }
            : null,
    });
}

function emptyOutcome(row: BatchTaskRow, at: number): BatchRowOutcome {
    return {
        rowId: row.id,
        status: "failed",
        attempts: 0,
        startedAt: at,
        finishedAt: at,
        resultCount: 0,
        resultUrls: [],
        preflightIssues: [],
        duplicates: [],
        deduplicated: false,
    };
}

export const useBatchTaskStore = create<BatchState>((set, get) => ({
    batches: {},
    activeBatchId: null,
    hydrated: false,

    hydrate: (storage) => {
        if (get().hydrated) return;
        const target = storage ?? getBatchStorage();
        const index = readIndex(target);
        const batches: Record<string, BatchTask> = { ...get().batches };
        for (const batchId of index) {
            if (batches[batchId]) continue;
            const batch = parsePersistedBatch(target.getItem(batchStorageKey(batchId)));
            if (batch) batches[batchId] = batch;
        }
        // 刷新后任务网关也要有任务，failed 行才能走 gateway.retry 而不是重新扣费。
        useToolTaskStore.getState().hydrate();
        // 刷新/崩溃会中断内存里的执行器：running 状态必须收敛，否则批次永远卡在“取消/重试”不可用的状态。
        const tasks = useToolTaskStore.getState().tasks;
        for (const batchId of Object.keys(batches)) {
            const reconciled = reconcileInterruptedBatch(batches[batchId], tasks, Date.now());
            if (reconciled === batches[batchId]) continue;
            batches[batchId] = reconciled;
            persistBatch(reconciled, target);
        }
        set({ batches, hydrated: true });
    },

    openBatch: (batchId) => {
        const batch = get().batches[batchId] ?? null;
        if (batch) set({ activeBatchId: batchId });
        return batch;
    },

    createBatch: (toolId, rows) => {
        const batch = createBatchTask(toolId, rows ?? [createBatchTaskRow()]);
        set((state) => ({ batches: { ...state.batches, [batch.batchId]: batch }, activeBatchId: batch.batchId }));
        persistBatch(batch);
        return batch;
    },

    setTool: (batchId, toolId) => {
        set((state) => {
            const batch = state.batches[batchId];
            if (!batch) return state;
            const next = touch(batch, { toolId, preflight: null, status: "draft" });
            persistBatch(next);
            return { batches: { ...state.batches, [batchId]: next } };
        });
    },

    setConcurrency: (batchId, concurrency) => {
        set((state) => {
            const batch = state.batches[batchId];
            if (!batch) return state;
            const next = touch(batch, { concurrency: clampBatchConcurrency(concurrency) });
            persistBatch(next);
            return { batches: { ...state.batches, [batchId]: next } };
        });
    },

    replaceRows: (batchId, rows) => {
        set((state) => {
            const batch = state.batches[batchId];
            if (!batch) return state;
            const next = touch(batch, { rows, preflight: null, outcomes: [], status: "draft", finishedAt: undefined });
            persistBatch(next);
            return { batches: { ...state.batches, [batchId]: next } };
        });
    },

    addRow: (batchId, patch) => {
        const batch = get().batches[batchId];
        if (!batch) return null;
        const row = createBatchTaskRow(patch);
        const next = touch(batch, { rows: [...batch.rows, row], preflight: null, status: "draft" });
        set((state) => ({ batches: { ...state.batches, [batchId]: next } }));
        persistBatch(next);
        return row;
    },

    appendRowsFromText: (batchId, text) => {
        const batch = get().batches[batchId];
        if (!batch) return 0;
        const lines = text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        if (lines.length === 0) return 0;
        const base = batch.rows.length;
        const rows = lines.map((line, offset) => createBatchTaskRow({ label: `#${base + offset + 1}`, prompt: line }));
        const next = touch(batch, { rows: [...batch.rows, ...rows], preflight: null, status: "draft" });
        set((state) => ({ batches: { ...state.batches, [batchId]: next } }));
        persistBatch(next);
        return rows.length;
    },

    updateRow: (batchId, rowId, patch) => {
        set((state) => {
            const batch = state.batches[batchId];
            if (!batch) return state;
            const rows = batch.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row));
            const next = touch(batch, { rows, preflight: null, status: batch.status === "running" ? batch.status : "draft" });
            persistBatch(next);
            return { batches: { ...state.batches, [batchId]: next } };
        });
    },

    removeRow: (batchId, rowId) => {
        const batch = get().batches[batchId];
        if (!batch) return;
        const next = touch(batch, {
            rows: batch.rows.filter((row) => row.id !== rowId),
            preflight: null,
            outcomes: batch.outcomes.filter((outcome) => outcome.rowId !== rowId),
            status: "draft",
        });
        set((state) => ({ batches: { ...state.batches, [batchId]: next } }));
        persistBatch(next);
    },

    attachReferences: (batchId, rowId, references, mode = "replace") => {
        set((state) => {
            const batch = state.batches[batchId];
            if (!batch) return state;
            const rows = batch.rows.map((row) => {
                if (row.id !== rowId) return row;
                const merged = mode === "append" ? [...row.references, ...references] : [...references];
                return { ...row, references: merged, referencesDetached: undefined };
            });
            const next = touch(batch, { rows, preflight: null, status: batch.status === "running" ? batch.status : "draft" });
            persistBatch(next);
            return { batches: { ...state.batches, [batchId]: next } };
        });
    },

    setSharedFields: (batchId, fields) => {
        const batch = get().batches[batchId];
        if (!batch) return;
        const next = touch(batch, { sharedFields: { ...fields }, preflight: null, status: "draft" });
        set((state) => ({ batches: { ...state.batches, [batchId]: next } }));
        persistBatch(next);
    },

    resetBatch: (batchId) => {
        const batch = get().batches[batchId];
        if (!batch) return;
        const next = touch(batch, { outcomes: [], preflight: null, status: "draft", startedAt: undefined, finishedAt: undefined, aborted: undefined, lastError: null });
        set((state) => ({ batches: { ...state.batches, [batchId]: next } }));
        persistBatch(next);
    },

    deleteBatch: (batchId) => {
        runningBatches.get(batchId)?.abort();
        runningBatches.delete(batchId);
        set((state) => {
            const batches = { ...state.batches };
            delete batches[batchId];
            return { batches, activeBatchId: state.activeBatchId === batchId ? null : state.activeBatchId };
        });
        forgetPersistedBatch(batchId);
    },

    preflight: (batchId) => {
        const batch = get().batches[batchId];
        if (!batch) return null;
        const result = preflightBatch(batchToRunRequest(batch), { config: useConfigStore.getState().config });
        const next = touch(batch, { preflight: result, status: result.ok ? (batch.status === "running" ? "running" : "ready") : "blocked" });
        set((state) => ({ batches: { ...state.batches, [batchId]: next } }));
        persistBatch(next);
        return result;
    },

    run: async (batchId, options) => {
        const batch = get().batches[batchId];
        if (!batch) return null;
        if (runningBatches.has(batchId)) return batch;
        if (batch.rows.length === 0) {
            const next = touch(batch, { lastError: { code: "batch-empty", message: "Batch has no rows." }, status: "blocked" });
            set((state) => ({ batches: { ...state.batches, [batchId]: next } }));
            persistBatch(next);
            return next;
        }

        const request = batchToRunRequest(batch);
        const preflight = preflightBatch(request, { config: useConfigStore.getState().config });
        const initialOutcomes: BatchRowOutcome[] = batch.rows.map((row) => {
            const rowPreflight = preflight.rows[row.id];
            return {
                rowId: row.id,
                status: preflight.ok && rowPreflight?.runnable ? "pending" : "skipped",
                attempts: 0,
                resultCount: 0,
                resultUrls: [],
                preflightIssues: rowPreflight?.issues ?? [],
                duplicates: rowPreflight?.duplicates ?? [],
                deduplicated: false,
            };
        });
        const started: BatchTask = touch(batch, {
            preflight,
            outcomes: initialOutcomes,
            status: preflight.ok ? "running" : "blocked",
            startedAt: Date.now(),
            finishedAt: undefined,
            aborted: undefined,
            lastError: preflight.ok ? null : { code: preflight.issues.find((issue) => issue.severity === "blocking")?.code ?? "batch-blocked", message: preflight.issues.find((issue) => issue.severity === "blocking")?.message ?? "Batch preflight blocked execution." },
        });
        set((state) => ({ batches: { ...state.batches, [batchId]: started } }));
        persistBatch(started);
        if (!preflight.ok) return started;

        const controller = new AbortController();
        runningBatches.set(batchId, controller);
        try {
            const result = await runBatch(request, preflight, {
                gateway: options?.gateway ?? defaultGatewayPort(),
                signal: controller.signal,
                onRowUpdate: (outcome) => {
                    let next: BatchTask | undefined;
                    set((state) => {
                        const current = state.batches[batchId];
                        if (!current) return state;
                        // 行级结果即时落盘：刷新/崩溃后成功结果与失败原因都还在（outcome 里不含 dataUrl）。
                        next = { ...current, outcomes: [...current.outcomes.filter((item) => item.rowId !== outcome.rowId), outcome] };
                        return { batches: { ...state.batches, [batchId]: next } };
                    });
                    if (next) persistBatch(next);
                },
            });
            const finished: BatchTask = touch(get().batches[batchId] ?? started, {
                outcomes: result.outcomes,
                status: result.aborted ? "cancelled" : "completed",
                finishedAt: result.finishedAt,
                aborted: result.aborted,
            });
            set((state) => ({ batches: { ...state.batches, [batchId]: finished } }));
            persistBatch(finished);
            return finished;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const failed = touch(get().batches[batchId] ?? started, {
                status: "cancelled",
                finishedAt: Date.now(),
                lastError: { code: "batch-run-failed", message },
            });
            set((state) => ({ batches: { ...state.batches, [batchId]: failed } }));
            persistBatch(failed);
            return failed;
        } finally {
            runningBatches.delete(batchId);
        }
    },

    cancel: (batchId) => {
        runningBatches.get(batchId)?.abort();
    },

    retryRows: async (batchId, rowIds, options) => {
        const batch = get().batches[batchId];
        if (!batch) return null;
        const targets = rowIds ?? selectRetryableRowIds(batch.outcomes);
        if (targets.length === 0) return batch;

        const request = batchToRunRequest(batch);
        const preflight = preflightBatch(request, { config: useConfigStore.getState().config });
        const result = await retryBatchRows(request, preflight, batch.outcomes, targets, {
            gateway: options?.gateway ?? defaultGatewayPort(),
            onRowUpdate: (outcome) => {
                let next: BatchTask | undefined;
                set((state) => {
                    const current = state.batches[batchId];
                    if (!current) return state;
                    next = { ...current, outcomes: [...current.outcomes.filter((item) => item.rowId !== outcome.rowId), outcome] };
                    return { batches: { ...state.batches, [batchId]: next } };
                });
                if (next) persistBatch(next);
            },
        });
        const next = touch(get().batches[batchId] ?? batch, {
            preflight,
            outcomes: result.outcomes,
            status: "completed",
            finishedAt: Date.now(),
            aborted: false,
            lastError: null,
        });
        set((state) => ({ batches: { ...state.batches, [batchId]: next } }));
        persistBatch(next);
        return next;
    },

    exportReport: (batchId, format) => {
        const batch = get().batches[batchId];
        if (!batch) return null;
        const report = buildBatchReport({
            request: batchToRunRequest(batch),
            preflight: batch.preflight ?? preflightBatch(batchToRunRequest(batch), { config: useConfigStore.getState().config }),
            outcomes: batch.outcomes,
            concurrency: batch.concurrency,
            startedAt: batch.startedAt,
            finishedAt: batch.finishedAt,
            aborted: batch.aborted,
        });
        return serializeBatchReport(report, format);
    },

    summary: (batchId) => {
        const batch = get().batches[batchId];
        if (!batch || batch.outcomes.length === 0) return null;
        return summarizeBatchOutcomes(batch.outcomes);
    },

    reset: () => set({ batches: {}, activeBatchId: null, hydrated: false }),
}));

