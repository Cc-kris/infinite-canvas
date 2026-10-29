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
import { reclaimRecoverableResultItems, isDurableResultUrl, sanitizeTaskForPersist, type ToolTask, type ToolTaskResultItem } from "@/services/api/tools/task-machine";
import { resolveMediaUrl, uploadMediaFile } from "@/services/file-storage";

export const TOOL_TASK_STORAGE_VERSION = 1 as const;
export const TASK_INDEX_KEY = "tool-task:v1:index";
const TASK_KEY_PREFIX = "tool-task:v1:";
const TASK_INDEX_ID = "index";
/**
 * 保留最近多少条任务。原先 50，实测真实 profile 已累积 53 条（2026-10-29 只读勘察），
 * 一旦索引自愈把孤儿任务并回来，裁剪就会立刻删掉最老的真实任务（含失败/超时记录），
 * 因此放宽到 100：快照只有 storageKey/bytes（KB 级），localStorage 5MB 完全够。
 */
export const TASK_MAX_PERSISTED = 100;

export type ToolTaskStorage = {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
    /** 键枚举：用于索引自愈。缺省（纯内存替身）时退回「只信任索引」。 */
    key?: (index: number) => string | null;
    readonly length?: number;
};

export const taskStorageKey = (taskId: string) => `${TASK_KEY_PREFIX}${taskId}`;

/**
 * 扫描存储里**实际存在**的任务数据键（不看索引）。
 *
 * 真实缺陷（2026-10-29 只读勘察）：localStorage 里有 53 个 `tool-task:v1:task-*` 数据键，
 * 索引却只剩 38 个 id —— 15 条真实任务（PRINT_EXTRACT/HANDHELD_GOODS/AI_POSE_GENERATOR/
 * FISSION_LINK/SALE_VIDEO/AI_VIDEO_EDITING）因此在历史坞里永久不可见。
 * 索引与数据键一旦失配（写索引时配额报错、旧版本重置索引等），旧代码只信索引 → 永远不修复。
 */
export function scanPersistedTaskIds(storage: ToolTaskStorage = getTaskStorage()): string[] {
    if (typeof storage.key !== "function" || typeof storage.length !== "number") return [];
    const ids: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key || !key.startsWith(TASK_KEY_PREFIX)) continue;
        const id = key.slice(TASK_KEY_PREFIX.length);
        if (!id || id === TASK_INDEX_ID) continue;
        ids.push(id);
    }
    return ids;
}

/** 只读索引里的 id 列表；损坏/缺省一律当空表。 */
export function readTaskIndexIds(storage: ToolTaskStorage = getTaskStorage()): string[] {
    const rawIndex = storage.getItem(TASK_INDEX_KEY);
    if (!rawIndex) return [];
    try {
        const ids: unknown = JSON.parse(rawIndex);
        if (!Array.isArray(ids)) return [];
        return ids.filter((id): id is string => typeof id === "string" && id.length > 0);
    } catch {
        return [];
    }
}

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
        key: (index) => Array.from(map.keys())[index] ?? null,
        get length() {
            return map.size;
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
    // 索引 + 实际数据键取并集：索引可能落后（失配）而不是权威。
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const id of [...readTaskIndexIds(storage), ...scanPersistedTaskIds(storage)]) {
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
    }
    const tasks: ToolTask[] = [];
    for (const id of ids) {
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

/** 单条任务的最新落盘快照（跨标签恢复用：比内存新就以它为准）。 */
export function readPersistedTask(taskId: string, storage: ToolTaskStorage = getTaskStorage()): ToolTask | null {
    try {
        const raw = storage.getItem(taskStorageKey(taskId));
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        return isToolTask(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * 把索引与真实数据键对齐（幂等；无差异时零写入）。
 *
 * - 索引里指向已删除数据键的 id → 剔除；
 * - 有数据键但索引里没有的任务（孤儿）→ 补回索引，历史坞刷新后即可见。
 */
export function healTaskIndex(storage: ToolTaskStorage = getTaskStorage()): { added: string[]; removed: string[] } {
    const indexed = readTaskIndexIds(storage);
    const scanned = scanPersistedTaskIds(storage);
    const scannedSet = new Set(scanned);
    const indexedSet = new Set(indexed);
    const added = scanned.filter((id) => !indexedSet.has(id));
    const removed = indexed.filter((id) => !scannedSet.has(id));
    if (added.length === 0 && removed.length === 0) return { added, removed };
    try {
        const ordered = readPersistedTasks(storage)
            .slice(0, TASK_MAX_PERSISTED)
            .map((task) => task.id);
        storage.setItem(TASK_INDEX_KEY, JSON.stringify(ordered));
    } catch {
        // 配额不足：索引保持原样，下一次挂载再试。
    }
    return { added, removed };
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
    /**
     * 刷新后接力等待：只查询/等待上游，不重提交（见 gateway.waitForResult）。
     * recoverAll 只做一次探测；仍在 running 且有 upstreamTaskId 的任务靠这里推进到终态。
     */
    resumeTask: (taskId: string, options?: WaitOptions) => Promise<ToolTask>;
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

/** 只有远程地址可抓（http(s)）。blob:/data: 由 uploadMediaFile 直接处理；asset: 等本地键跳过。 */
function isFetchableResultUrl(url?: string): url is string {
    return isDurableResultUrl(url);
}

function needsIngest(item: ToolTaskResultItem) {
    return !item.storageKey && Boolean(item.dataUrl || item.blob || isFetchableResultUrl(item.url));
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
            const source = item.blob ?? item.dataUrl ?? (isFetchableResultUrl(item.url) ? item.url : undefined);
            if (!source) return item;
            try {
                const stored = await uploadMediaFile(source, RESULT_MEDIA_PREFIX, { mimeType: item.mimeType });
                // 内存态保留原 dataUrl/blob（共享结果动作优先用它们），只额外记住落库键与字节数。
                return {
                    ...item,
                    storageKey: stored.storageKey,
                    // 有持久远程地址时优先保留它：刷新后 storageKey 丢了还能按地址重新入库。
                    url: isFetchableResultUrl(item.url) ? item.url : stored.url,
                    bytes: stored.bytes,
                    mimeType: item.mimeType ?? stored.mimeType,
                    payloadDropped: false,
                    ingestError: undefined,
                };
            } catch (error) {
                // 入库失败不伪造成功：保留原字节/远程地址，只把原因写进快照，便于刷新后重试与排查。
                return { ...item, ingestError: error instanceof Error ? error.message : String(error) };
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
        // 拿到 storageKey 或失败原因变化时才回写（轮询会反复 upsert 同一任务，不能无限自激）。
        const changed = (ingested.result?.items ?? []).some((item, index) => {
            const before = task.result?.items[index];
            return item.storageKey !== before?.storageKey || item.ingestError !== before?.ingestError;
        });
        if (changed) useToolTaskStore.getState().upsertTask(ingested);
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


/** hydrate 后的自愈：先回收可恢复的 payloadDropped，再补做缺失的真实字节入库，最后还原对象 URL。 */
async function healPersistedTaskMedia(taskId: string) {
    const current = useToolTaskStore.getState().tasks[taskId];
    if (!current) return;
    if (hasPendingResultMedia(current)) await ingestResultMediaIntoStore(current);
    await restorePersistedTaskMedia(taskId);
}


/** 网关 + 任务端口都指向本 store，保证 UI 与执行器看到同一份状态。 */
function getGateway(): ToolTaskGateway {
    if (gatewayInstance) return gatewayInstance;
    const port: ToolTaskStorePort = {
        get: (taskId) => useToolTaskStore.getState().tasks[taskId],
        set: (task) => useToolTaskStore.getState().upsertTask(task),
        remove: (taskId) => useToolTaskStore.getState().removeTask(taskId),
        list: () => Object.values(useToolTaskStore.getState().tasks),
        readPersisted: (taskId) => readPersistedTask(taskId),
    };
    gatewayInstance = createToolGateway({ store: port, getConfig: () => useConfigStore.getState().config });
    return gatewayInstance;
}

/**
 * 取「写进本 store」的网关（与 runTool 同一个实例）。
 * 批量工作台（套图/换色等）直接调 adapter 时也必须用它，否则任务只存在网关的内存端口里：
 * 历史记录永远 0 条、刷新后结果与任务全部丢失。
 */
export function getPersistedToolGateway(): ToolTaskGateway {
    return getGateway();
}

export const useToolTaskStore = create<ToolTaskState>((set, get) => ({
    tasks: {},
    hydrated: false,

    upsertTask: (task) => {
        /**
         * 拒绝旧快照回退：跨标签时本页内存可能是 hydrate 时的副本，
         * 别的标签已经把同一任务推进到更新的状态（succeeded/新 upstreamTaskId 等），
         * 旧对象写回去会把真实结果覆盖掉。
         */
        const current = get().tasks[task.id];
        if (current && current.updatedAt > task.updatedAt) return;
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
        const target = storage ?? getTaskStorage();
        // 先自愈索引（补回丢索引的真实任务、剔除指向空键的 id），再按索引+实际键取快照。
        healTaskIndex(target);
        const persisted = readPersistedTasks(target);
        set((state) => {
            const tasks = { ...state.tasks };
            // 旧快照把「有持久 url / 已有 storageKey」的结果误标成 payloadDropped，这里按事实回收。
            for (const task of persisted) tasks[task.id] = reclaimRecoverableResultItems(tasks[task.id] ?? task);
            return { tasks, hydrated: true };
        });
        // 快照里的对象 URL 早就失效：按 storageKey 从 IndexedDB 复原真实字节地址；
        // 只有远程地址没有字节的历史任务，这里补做一次真实入库（拿到 storageKey 才算持久化）。
        for (const task of persisted) void healPersistedTaskMedia(task.id);
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

    resumeTask: async (taskId, options) => {
        const task = await getGateway().waitForResult(taskId, {
            ...options,
            onUpdate: (next) => {
                get().upsertTask(next);
                options?.onUpdate?.(next);
            },
        });
        return task;
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
