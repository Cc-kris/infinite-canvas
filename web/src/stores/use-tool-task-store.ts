/**
 * 工具任务 store（TASK-005 的 UI/持久化侧）：
 * - 内存态用 zustand，直接实现网关的 `ToolTaskStorePort`；
 * - 落盘只写 `sanitizeTaskForPersist` 之后的快照：剥离 dataUrl/blob，避免 localStorage 撑爆；
 * - 刷新恢复靠 `recoverAll()`：只查询/等待上游，绝不自动重提交（见 gateway.recover）；
 * - 所有真实请求都走 `ToolTaskGateway`，store 自己不发任何 HTTP。
 */
import { create } from "zustand";

import { useConfigStore } from "@/stores/use-config-store";
import {
    createToolGateway,
    type BrowserToolInput,
    type SubmitOptions,
    type ToolTaskGateway,
    type ToolTaskStorePort,
    type WaitOptions,
} from "@/services/api/tools/gateway";
import { sanitizeTaskForPersist, type ToolTask, type ToolTaskResultItem } from "@/services/api/tools/task-machine";
import { resolveMediaUrl, uploadMediaFile } from "@/services/file-storage";

export const TOOL_TASK_STORAGE_VERSION = 1 as const;
export const TASK_INDEX_KEY = "tool-task:v1:index";
export const TASK_MAX_PERSISTED = 50;

export type ToolTaskStorage = {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
};

export const taskStorageKey = (taskId: string) => `tool-task:v1:${taskId}`;

function memoryStorage(): ToolTaskStorage {
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

let fallbackStorage: ToolTaskStorage | null = null;

/** SSR / 私密模式下没有 localStorage 时退化为内存存储，不抛错。 */
export function getTaskStorage(): ToolTaskStorage {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
    fallbackStorage ??= memoryStorage();
    return fallbackStorage;
}

function isToolTask(value: unknown): value is ToolTask {
    if (!value || typeof value !== "object") return false;
    const task = value as Partial<ToolTask>;
    return typeof task.id === "string" && typeof task.toolId === "string" && typeof task.status === "string" && typeof task.createdAt === "number";
}

/** 读取最近持久化的任务；损坏条目跳过而不是整批丢弃。 */
export function readPersistedTasks(storage: ToolTaskStorage = getTaskStorage()): ToolTask[] {
    const rawIndex = storage.getItem(TASK_INDEX_KEY);
    if (!rawIndex) return [];
    let ids: unknown;
    try {
        ids = JSON.parse(rawIndex);
    } catch {
        return [];
    }
    if (!Array.isArray(ids)) return [];
    const tasks: ToolTask[] = [];
    for (const id of ids) {
        if (typeof id !== "string") continue;
        const raw = storage.getItem(taskStorageKey(id));
        if (!raw) continue;
        try {
            const parsed: unknown = JSON.parse(raw);
            if (isToolTask(parsed)) tasks.push(parsed);
        } catch {
            continue;
        }
    }
    return tasks.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function persistTask(task: ToolTask, storage: ToolTaskStorage = getTaskStorage()): void {
    const sanitized = sanitizeTaskForPersist(task);
    try {
        const others = readPersistedTasks(storage)
            .map((item) => item.id)
            .filter((id) => id !== task.id);
        const nextIds = [task.id, ...others].slice(0, TASK_MAX_PERSISTED);
        storage.setItem(taskStorageKey(task.id), JSON.stringify(sanitized));
        storage.setItem(TASK_INDEX_KEY, JSON.stringify(nextIds));
        // 被索引裁掉的任务同步删除数据键，避免无上限增长。
        const keep = new Set(nextIds);
        for (const droppedId of others) {
            if (!keep.has(droppedId)) storage.removeItem(taskStorageKey(droppedId));
        }
    } catch {
        // 配额不足/隐私模式：落盘失败不阻断生成流程，内存态仍可用。
    }
}

export function forgetPersistedTask(taskId: string, storage: ToolTaskStorage = getTaskStorage()): void {
    try {
        storage.removeItem(taskStorageKey(taskId));
        const ids = readPersistedTasks(storage)
            .map((item) => item.id)
            .filter((id) => id !== taskId);
        storage.setItem(TASK_INDEX_KEY, JSON.stringify(ids));
    } catch {
        // ignore
    }
}

export type ToolTaskState = {
    tasks: Record<string, ToolTask>;
    hydrated: boolean;
    upsertTask: (task: ToolTask) => void;
    removeTask: (taskId: string) => void;
    hydrate: (storage?: ToolTaskStorage) => void;
    /** 提交并推进到终态（图片一次请求；视频轮询）。返回最终任务，失败不抛错，看 status/error。 */
    runTool: (input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
    submitTool: (input: BrowserToolInput, options?: SubmitOptions) => Promise<ToolTask>;
    cancelTask: (taskId: string) => void;
    retryTask: (taskId: string, input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
    recoverAll: (options?: WaitOptions) => Promise<ToolTask[]>;
    reset: () => void;
};

let gatewayInstance: ToolTaskGateway | null = null;

/* ---------------- G1：结果字节落库（真实字节缺口修复） ----------------
 * 结果项从上游拿到的是 dataUrl（图片）/blob（视频），内存态之外一律不留；
 * 旧行为落盘时直接剥离 → 刷新后结果"看着成功却点不动"。这里改成：
 *   1) 收到成功结果就把字节写进 media_files（IndexedDB），记住 storageKey；
 *   2) 落盘快照保留 storageKey/bytes/mimeType，字节缺口变成可追溯；
 *   3) hydrate 时用 storageKey 重建对象 URL，下载/存资产/发画布继续可用。
 */

const RESULT_MEDIA_PREFIX = "tool-result";
/** 同一任务同一次结果只入库一次（轮询会把同一个 task 反复 upsert）。 */
const ingestingKeys = new Set<string>();

function resultIngestKey(task: ToolTask) {
    return `${task.id}:${task.result?.receivedAt ?? 0}`;
}

function needsIngest(item: ToolTaskResultItem) {
    return !item.storageKey && Boolean(item.dataUrl || item.blob);
}

export function hasPendingResultMedia(task: ToolTask): boolean {
    return Boolean(task.result?.items.some(needsIngest));
}

/** 把结果项的真实字节写进 IndexedDB，返回带 storageKey 的新任务（不改原对象）。 */
export async function ingestResultMedia(task: ToolTask): Promise<ToolTask> {
    if (!task.result || !hasPendingResultMedia(task)) return task;
    const items = await Promise.all(
        task.result.items.map(async (item) => {
            if (!needsIngest(item)) return item;
            const source = item.blob ?? item.dataUrl;
            if (!source) return item;
            try {
                const stored = await uploadMediaFile(source, RESULT_MEDIA_PREFIX, { mimeType: item.mimeType });
                // 内存态保留原 dataUrl/blob（共享结果动作优先用它们），只额外记住落库键与字节数。
                return {
                    ...item,
                    storageKey: stored.storageKey,
                    url: item.url ?? stored.url,
                    bytes: stored.bytes,
                    mimeType: item.mimeType ?? stored.mimeType,
                    payloadDropped: false,
                };
            } catch {
                // 入库失败不伪造成功：保留原字节（内存态仍可下载），落盘时会标记 payloadDropped。
                return item;
            }
        }),
    );
    return { ...task, result: { ...task.result, items } };
}

/** hydrate 后把 storageKey 还原成可用的对象 URL（对象 URL 不过夜）。 */
export async function restoreResultMediaUrls(task: ToolTask): Promise<ToolTask> {
    if (!task.result) return task;
    let changed = false;
    const items = await Promise.all(
        task.result.items.map(async (item) => {
            if (!item.storageKey) return item;
            const url = await resolveMediaUrl(item.storageKey, item.url ?? "");
            if (!url || url === item.url) return item;
            changed = true;
            return { ...item, url };
        }),
    );
    return changed ? { ...task, result: { ...task.result, items } } : task;
}

/** upsert 时异步补做入库：成功后再写一次 store（此时已无待入库字节，不会递归）。 */
async function ingestResultMediaIntoStore(task: ToolTask) {
    if (!hasPendingResultMedia(task)) return;
    const key = resultIngestKey(task);
    if (ingestingKeys.has(key)) return;
    ingestingKeys.add(key);
    try {
        const ingested = await ingestResultMedia(task);
        const current = useToolTaskStore.getState().tasks[task.id];
        if (!current || current.result?.receivedAt !== task.result?.receivedAt) return;
        if (!hasPendingResultMedia(ingested)) useToolTaskStore.getState().upsertTask(ingested);
    } finally {
        ingestingKeys.delete(key);
    }
}

/** hydrate 后异步恢复某个已落盘任务的媒体地址。 */
async function restorePersistedTaskMedia(taskId: string) {
    const current = useToolTaskStore.getState().tasks[taskId];
    if (!current) return;
    const restored = await restoreResultMediaUrls(current);
    if (restored === current) return;
    const latest = useToolTaskStore.getState().tasks[taskId];
    if (!latest || latest.result?.receivedAt !== current.result?.receivedAt) return;
    useToolTaskStore.getState().upsertTask(restored);
}


/** 网关 + 任务端口都指向本 store，保证 UI 与执行器看到同一份状态。 */
function getGateway(): ToolTaskGateway {
    if (gatewayInstance) return gatewayInstance;
    const port: ToolTaskStorePort = {
        get: (taskId) => useToolTaskStore.getState().tasks[taskId],
        set: (task) => useToolTaskStore.getState().upsertTask(task),
        remove: (taskId) => useToolTaskStore.getState().removeTask(taskId),
        list: () => Object.values(useToolTaskStore.getState().tasks),
    };
    gatewayInstance = createToolGateway({ store: port, getConfig: () => useConfigStore.getState().config });
    return gatewayInstance;
}

export const useToolTaskStore = create<ToolTaskState>((set, get) => ({
    tasks: {},
    hydrated: false,

    upsertTask: (task) => {
        set((state) => ({ tasks: { ...state.tasks, [task.id]: task } }));
        persistTask(task);
        void ingestResultMediaIntoStore(task);
    },

    removeTask: (taskId) => {
        set((state) => {
            const next = { ...state.tasks };
            delete next[taskId];
            return { tasks: next };
        });
        forgetPersistedTask(taskId);
    },

    hydrate: (storage) => {
        if (get().hydrated) return;
        const persisted = readPersistedTasks(storage ?? getTaskStorage());
        set((state) => {
            const tasks = { ...state.tasks };
            for (const task of persisted) tasks[task.id] = tasks[task.id] ?? task;
            return { tasks, hydrated: true };
        });
        // 快照里的对象 URL 早就失效：按 storageKey 从 IndexedDB 复原真实字节地址。
        for (const task of persisted) void restorePersistedTaskMedia(task.id);
    },

    submitTool: async (input, options) => {
        const task = await getGateway().submit(input, options);
        return task;
    },

    runTool: async (input, options) => {
        const gateway = getGateway();
        const submitted = await gateway.submit(input, options);
        if (submitted.status === "succeeded" || submitted.status === "failed" || submitted.status === "cancelled") return submitted;
        return gateway.waitForResult(submitted.id, {
            ...options,
            onUpdate: (task) => {
                get().upsertTask(task);
                options?.onUpdate?.(task);
            },
        });
    },

    cancelTask: (taskId) => {
        getGateway().cancel(taskId);
    },

    retryTask: async (taskId, input, options) => getGateway().retry(taskId, input, options),

    recoverAll: async (options) => {
        const results = await getGateway().recoverAll(options);
        return results.map((item) => item.task);
    },

    reset: () => {
        set({ tasks: {}, hydrated: false });
    },
}));

/** 页面挂载时调用：先 hydrate 落盘快照，再对未完结任务做一次查询式恢复。 */
export async function hydrateAndRecoverToolTasks(options?: WaitOptions): Promise<ToolTask[]> {
    const store = useToolTaskStore.getState();
    store.hydrate();
    return store.recoverAll(options);
}
