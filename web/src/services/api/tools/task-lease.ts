/**
 * 跨标签任务租约（修复 recoverAll 误关他人 in-flight 任务的竞态）。
 *
 * 真实缺陷（lf_pose_real_generate，2026-10-29，证据见
 * docs/V1.0/plan_linkfox_navigation/evidence/suite-design-realgen-20261029/RESULTS.json）：
 * 任务 A 在标签页 1 里真实提交（HTTP 请求在飞行中，还没有 upstreamTaskId），
 * 此时在标签页 2 里打开任意工具页 → `recoverAll()` 读到 localStorage 里那条
 * `submitting` 快照，判定「本页请求已随刷新消失」→ 直接 `closeUnconfirmed()`
 * 写成 failed / submit-unconfirmed。标签页 1 的真实结果回来后才把记录改回 succeeded
 * （task-mvtczxwo-e1d1w0 在 +18s 被误关、+50s 才成功；task-mvtd45nv-y7cum6 同批）。
 * 如果标签页 1 先被关掉，这条真实任务就永久停在「需人工确认」。
 *
 * 解法：谁在真跑任务，谁就在 localStorage 里持有一个租约（心跳续期）。
 * 恢复时只要租约还是新鲜的、且不属于本页，就说明别的标签页正在处理这条任务，
 * 本页必须什么都不做（不改状态、不查询、不关闭），等它自己结束或租约过期后再接管。
 *
 * 租约只表达「有人正在推进这条任务」，不参与任务状态机，也绝不代表任务成功。
 */

export const TASK_LEASE_PREFIX = "tool-task:v1:lease:";
/** 续期间隔：远小于 TTL，允许丢一两次心跳。 */
export const LEASE_HEARTBEAT_MS = 10_000;
/** 租约有效期：持有者崩溃/被强杀后，最多这么久其他标签页即可接管。 */
export const LEASE_TTL_MS = 45_000;

export type TaskLeaseRecord = {
    taskId: string;
    /** 持有者页面实例 id（每次页面加载都不同，刷新后就是新的持有者）。 */
    ownerId: string;
    heartbeatAt: number;
};

export type TaskLeaseStorage = {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
};

export type TaskLeasePort = {
    readonly ownerId: string;
    readonly ttlMs: number;
    /** 声明本页开始推进这条任务（覆盖别人的陈旧租约，只在明确要干活时调用）。 */
    claim(taskId: string, at?: number): void;
    /** 心跳续期（内部按 LEASE_HEARTBEAT_MS 节流，轮询里可以每次都调）。 */
    renew(taskId: string, at?: number): void;
    /** 任务结束/本页放弃推进时释放。 */
    release(taskId: string): void;
    read(taskId: string): TaskLeaseRecord | null;
    /** 存在新鲜租约（无论谁的）。 */
    isLive(taskId: string, at?: number): boolean;
    /** 存在新鲜租约，且持有者是别的标签页 → 本页不得改动这条任务。 */
    isLiveElsewhere(taskId: string, at?: number): boolean;
    /** 释放本页持有的全部租约（页面卸载时调用）。 */
    releaseAll(): void;
};

export const taskLeaseKey = (taskId: string) => `${TASK_LEASE_PREFIX}${taskId}`;

function memoryLeaseStorage(): TaskLeaseStorage {
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

export function newTaskLeaseOwnerId(): string {
    const cryptoApi = typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
    const random = cryptoApi?.randomUUID ? cryptoApi.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `page-${random}`;
}

export type TaskLeaseOptions = {
    storage?: TaskLeaseStorage;
    ownerId?: string;
    ttlMs?: number;
    heartbeatMs?: number;
    /** 时钟注入，测试用。 */
    now?: () => number;
};

export function createTaskLease(options: TaskLeaseOptions = {}): TaskLeasePort {
    const storage = options.storage ?? memoryLeaseStorage();
    const ownerId = options.ownerId ?? newTaskLeaseOwnerId();
    const ttlMs = options.ttlMs ?? LEASE_TTL_MS;
    const heartbeatMs = options.heartbeatMs ?? LEASE_HEARTBEAT_MS;
    const now = options.now ?? (() => Date.now());
    /** 本页持有的租约 → 上次写入时间（用于节流）。 */
    const owned = new Map<string, number>();

    const read = (taskId: string): TaskLeaseRecord | null => {
        let raw: string | null = null;
        try {
            raw = storage.getItem(taskLeaseKey(taskId));
        } catch {
            return null;
        }
        if (!raw) return null;
        try {
            const parsed: unknown = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") return null;
            const record = parsed as Partial<TaskLeaseRecord>;
            if (record.taskId !== taskId || typeof record.ownerId !== "string" || typeof record.heartbeatAt !== "number") return null;
            return { taskId, ownerId: record.ownerId, heartbeatAt: record.heartbeatAt };
        } catch {
            return null;
        }
    };

    const write = (taskId: string, at: number) => {
        const record: TaskLeaseRecord = { taskId, ownerId, heartbeatAt: at };
        try {
            storage.setItem(taskLeaseKey(taskId), JSON.stringify(record));
        } catch {
            // 配额/隐私模式：租约写不进去就当没有，恢复逻辑会退化到旧行为（不能因此阻塞任务）。
        }
        owned.set(taskId, at);
    };

    const claim = (taskId: string, at: number = now()) => write(taskId, at);

    const renew = (taskId: string, at: number = now()) => {
        const last = owned.get(taskId);
        if (last !== undefined && at - last < heartbeatMs) return;
        write(taskId, at);
    };

    const release = (taskId: string) => {
        owned.delete(taskId);
        // 只删自己写的租约：本页的 claim 可能已被别的标签页抢占，
        // 此时直接 removeItem 会把别人正在用的活租约清掉。
        const record = read(taskId);
        if (record && record.ownerId !== ownerId) return;
        try {
            storage.removeItem(taskLeaseKey(taskId));
        } catch {
            // ignore
        }
    };

    const isLive = (taskId: string, at: number = now()) => {
        const record = read(taskId);
        if (!record) return false;
        const age = at - record.heartbeatAt;
        return age >= 0 && age <= ttlMs;
    };

    return {
        ownerId,
        ttlMs,
        claim,
        renew,
        release,
        read,
        isLive,
        isLiveElsewhere: (taskId, at = now()) => {
            const record = read(taskId);
            if (!record || record.ownerId === ownerId) return false;
            const age = at - record.heartbeatAt;
            return age >= 0 && age <= ttlMs;
        },
        releaseAll: () => {
            for (const taskId of [...owned.keys()]) release(taskId);
        },
    };
}

let defaultLease: TaskLeasePort | null = null;
let unloadHookInstalled = false;

/**
 * 浏览器内的共享租约：用 localStorage 让同源标签页互相看见。
 * 无 localStorage（SSR / 私密模式 / bun 测试未注入）时返回 null，
 * 恢复逻辑退回「没有跨标签信息」的旧行为，而不是直接跳过所有任务。
 */
export function getTaskLease(): TaskLeasePort | null {
    if (typeof localStorage === "undefined" || !localStorage) return null;
    if (!defaultLease) defaultLease = createTaskLease({ storage: localStorage });
    if (!unloadHookInstalled && typeof window !== "undefined" && typeof window.addEventListener === "function") {
        unloadHookInstalled = true;
        // 正常关闭/刷新时立刻释放租约：刷新后同一标签页可以马上接管自己的任务，
        // 不必等 TTL（否则刷新后 45s 内历史记录会停在「提交中」）。
        const releaseAll = () => defaultLease?.releaseAll();
        window.addEventListener("pagehide", releaseAll);
        window.addEventListener("beforeunload", releaseAll);
    }
    return defaultLease;
}
