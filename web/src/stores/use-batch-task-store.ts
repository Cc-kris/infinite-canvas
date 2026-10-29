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
import { resolveMediaUrl } from "@/services/file-storage";
import { useConfigStore } from "@/stores/use-config-store";
import { useToolTaskStore, type ToolTaskStorage } from "@/stores/use-tool-task-store";
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
        // 会话内的 blob: 地址落盘即失效，写进去只会让刷新后显示成破图；真实地址由 storageKey 重建。
        outcomes: batch.outcomes.map((outcome) => ({
            ...outcome,
            resultUrls: outcome.resultUrls.filter((url) => /^https?:\/\//i.test(url)),
        })),
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

/* ---------------- F 边界续：刷新后行结果按任务真实结果重建 ----------------
 * 实测缺口（2026-10-29 独立复核 batch_XoWY1VJqvX）：
 * 同一批次两行都成功，但行 1 的结果只挂在 `blob:`（会话内地址）+ `storageKey`，
 * 行 2 是 OSS 直链。`collectResultUrls` 只收 http(s) → 行 1 的 resultUrls 落盘成 []，
 * 刷新后同一页面上行 1 无图、行 2 有链接，看起来像“丢图/串行”。
 * 事实是任务记录里两行结果都在，只有显示地址没 rebuild。这里按每行自己的 taskId
 * 去任务快照里取 items：直链直接用，本地落库结果用 storageKey 从 IndexedDB 重建对象 URL。
 * 不重跑、不补造：任务缺失/取不到字节就保持空，绝不编一个地址出来。
 */
export type BatchMediaResolver = (storageKey: string) => Promise<string | null>;

const defaultBatchMediaResolver: BatchMediaResolver = async (storageKey) => {
    const url = await resolveMediaUrl(storageKey, "");
    return url.length > 0 ? url : null;
};

function sameStrings(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * 用任务快照重建批次行结果（刷新后调用；也可在任务终态推送时增量调用）。
 *
 * - 行序、outcome 序、batchId、时间戳原样保留（提交时序不被回填改写）；
 * - 只有真实任务结果才会写 resultCount/resultUrls；任务没有结果的行原样返回；
 * - 返回同一对象表示无需改动，调用方可据此跳过落盘。
 */
export async function restoreBatchRowResults(
    batch: BatchTask,
    tasks: Record<string, ToolTask>,
    resolve: BatchMediaResolver = defaultBatchMediaResolver,
): Promise<BatchTask> {
    if (batch.outcomes.length === 0) return batch;

    let changed = false;
    const outcomes: BatchRowOutcome[] = [];
    for (const outcome of batch.outcomes) {
        const task = outcome.taskId ? tasks[outcome.taskId] : undefined;
        const items = task?.result?.items ?? [];
        if (items.length === 0) {
            outcomes.push(outcome);
            continue;
        }

        // 已有可持久直链且数量对得上：保留原样。
        // 别把行 2 这种 OSS 链接降级成会话级 blob —— 那会让“刷新后可分享的链接”变成一次性地址。
        const durable =
            outcome.resultUrls.length > 0 &&
            outcome.resultUrls.every((url) => /^https?:\/\//i.test(url));
        if (durable && outcome.resultCount === items.length) {
            outcomes.push(outcome);
            continue;
        }

        const urls: string[] = [];
        const push = (url: string | null | undefined) => {
            if (!url || urls.includes(url)) return;
            urls.push(url);
        };
        for (const item of items) {
            // 统一成 string：避免 `string | undefined` 在分支里被收窄成 never。
            const raw = typeof item.url === "string" ? item.url : "";
            // 1) 上游直链最稳（刷新/换设备都在）；
            if (/^https?:\/\//i.test(raw)) {
                push(raw);
                continue;
            }
            // 2) 本地落库结果：按 storageKey 从 IndexedDB 重新取字节；
            if (item.storageKey) {
                const restored = await resolve(item.storageKey).catch(() => null);
                // 取不回来就不退回会话里的 blob:（刷新后已是死链，只会显示破图）。
                if (restored) push(restored);
                continue;
            }
            // 3) 没有 storageKey 的老任务：blob: 地址是唯一线索，同标签页里还能用。
            if (raw.startsWith("blob:")) push(raw);
        }

        if (urls.length === 0) {
            // 任务有结果项却拿不到地址（字节被清掉等）：保留原样，不伪造。
            if (outcome.resultCount === items.length) {
                outcomes.push(outcome);
                continue;
            }
            changed = true;
            outcomes.push({ ...outcome, resultCount: items.length });
            continue;
        }
        if (outcome.resultCount === items.length && sameStrings(outcome.resultUrls, urls)) {
            outcomes.push(outcome);
            continue;
        }
        changed = true;
        outcomes.push({ ...outcome, resultCount: items.length, resultUrls: urls });
    }

    if (!changed) return batch;
    return { ...batch, outcomes };
}

/** 批次历史列表（刷新后的批次索引就是这里的唯一消费方）：最近更新在前，批内行序不变。 */
export function sortBatchesForHistory(batches: Record<string, BatchTask>): BatchTask[] {
    return Object.values(batches).sort((left, right) => right.updatedAt - left.updatedAt);
}

let restoringResults: Promise<void> | null = null;
let toolTaskUnsubscribe: (() => void) | null = null;
/** 最近一次 hydrate 用的存储：回填结果也要写回同一处。 */
let activeBatchStorage: BatchStorage | null = null;

/** 对所有已 hydrate 的批次做一次结果回填；并发调用复用同一次执行。 */
function restoreAllBatchResults(storage: BatchStorage = activeBatchStorage ?? getBatchStorage()): Promise<void> {
    if (restoringResults) return restoringResults;
    restoringResults = (async () => {
        try {
            for (const batchId of Object.keys(useBatchTaskStore.getState().batches)) {
                const before = useBatchTaskStore.getState().batches[batchId];
                if (!before) continue;
                const tasks = useToolTaskStore.getState().tasks;
                const next = await restoreBatchRowResults(before, tasks);
                if (next === before) continue;
                const current = useBatchTaskStore.getState().batches[batchId];
                // 回填期间用户重跑/改了批次就别覆盖（updatedAt 变了）。
                if (!current || current.updatedAt !== before.updatedAt) continue;
                useBatchTaskStore.setState((state) => ({ batches: { ...state.batches, [batchId]: next } }));
                persistBatch(next, storage);
            }
        } finally {
            restoringResults = null;
        }
    })();
    return restoringResults;
}

/**
 * 任务快照晚于批次 hydrate 才补齐字节地址（`restorePersistedTaskMedia` 是异步的），
 * 所以订阅任务 store：任务表一变就重算行结果。回填只写批次，不会反过来触发任务变更。
 */
function watchToolTaskUpdates(): void {
    if (toolTaskUnsubscribe) return;
    toolTaskUnsubscribe = useToolTaskStore.subscribe((state, prev) => {
        if (state.tasks === prev.tasks) return;
        if (!useBatchTaskStore.getState().hydrated) return;
        void restoreAllBatchResults();
    });
}

export type BatchState = {
    batches: Record<string, BatchTask>;
    activeBatchId: string | null;
    hydrated: boolean;

    /** taskStorage 只给测试/嵌入场景注入任务快照来源；生产一律走默认 localStorage。 */
    hydrate: (storage?: BatchStorage, taskStorage?: ToolTaskStorage) => void;
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

    hydrate: (storage, taskStorage) => {
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
        useToolTaskStore.getState().hydrate(taskStorage);
        // 刷新/崩溃会中断内存里的执行器：running 状态必须收敛，否则批次永远卡在“取消/重试”不可用的状态。
        const tasks = useToolTaskStore.getState().tasks;
        for (const batchId of Object.keys(batches)) {
            const reconciled = reconcileInterruptedBatch(batches[batchId], tasks, Date.now());
            if (reconciled === batches[batchId]) continue;
            batches[batchId] = reconciled;
            persistBatch(reconciled, target);
        }
        set({ batches, hydrated: true });
        // 行结果地址：http 直链随快照落盘，blob: 已死 → 这里按任务 storageKey 重建。
        activeBatchStorage = target;
        watchToolTaskUpdates();
        void restoreAllBatchResults();
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

