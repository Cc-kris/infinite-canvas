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
import { sanitizeTaskForPersist, type ToolTask } from "@/services/api/tools/task-machine";

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
