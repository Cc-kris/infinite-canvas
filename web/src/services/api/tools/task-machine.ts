/**
 * TASK-005：39 工具共用的任务状态机（纯函数，不做任何 I/O、不生成假结果）。
 *
 * 设计依据 docs/V1.0/plan_linkfox_navigation/technical_design.md §6：
 * - 状态：draft → validating → submitting → running → succeeded | failed | cancelled，另有 unknown（上游结果未知，只能查询不能重提交）。
 * - 提交前生成 clientOperationId，本地任务与幂等键同源；拿到上游 id 后写入 upstreamTaskId。
 * - 轮询 2s × 10 次后改 5s；轮询失败的指数退避 2/4/8/16/30s；心跳 30s，连续 3 次缺失标 unknown。
 * - 默认任务超时 30 分钟，超时后仍保留 upstreamTaskId，供后续查询而不是重新提交。
 *
 * 关键不变量：任何“不确定上游是否已受理”的状态都不得自动重提交（见 planRecovery / canAutoResubmit）。
 */

export type ToolTaskStatus = "draft" | "validating" | "submitting" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";

export type ToolTaskCapability = "image" | "video";

export const TASK_STATUSES: readonly ToolTaskStatus[] = ["draft", "validating", "submitting", "running", "succeeded", "failed", "cancelled", "unknown"];

const TERMINAL_STATUSES: ReadonlySet<ToolTaskStatus> = new Set<ToolTaskStatus>(["succeeded", "failed", "cancelled"]);

/** 已提交但未结束的状态：这些状态下重复提交会直接扣费，必须复用原任务。 */
const ACTIVE_STATUSES: ReadonlySet<ToolTaskStatus> = new Set<ToolTaskStatus>(["submitting", "running", "unknown"]);

const ALLOWED_TRANSITIONS: Record<ToolTaskStatus, readonly ToolTaskStatus[]> = {
    draft: ["validating", "cancelled"],
    validating: ["submitting", "failed", "cancelled"],
    submitting: ["running", "succeeded", "failed", "cancelled", "unknown"],
    running: ["succeeded", "failed", "cancelled", "unknown"],
    unknown: ["running", "succeeded", "failed", "cancelled", "submitting"],
    failed: ["submitting", "cancelled"],
    succeeded: [],
    cancelled: [],
};

export const POLL_INTERVAL_START_MS = 2000;
export const POLL_INTERVAL_LATE_MS = 5000;
export const POLL_INTERVAL_SWITCH_COUNT = 10;
export const POLL_RETRY_BACKOFF_MS: readonly number[] = [2000, 4000, 8000, 16000, 30000];
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const MISSED_HEARTBEATS_BEFORE_UNKNOWN = 3;
export const DEFAULT_TASK_TIMEOUT_MS = 30 * 60 * 1000;
/** 提交请求发出后，在这段时间内还没拿到上游 id，只允许等待，不允许判定失败后重提交。 */
export const SUBMIT_GRACE_MS = 60_000;

export type ToolTaskError = {
    code: string;
    message: string;
    retryable: boolean;
};

export type ToolTaskResultItem = {
    id: string;
    kind: ToolTaskCapability;
    /** 图片结果（data URL）。仅在内存中保留，持久化时会被剥离，避免撑爆 localStorage。 */
    dataUrl?: string;
    /** 视频结果（或已入库图片）的可播放地址。持久化的对象 URL 在刷新后失效，靠 storageKey 还原。 */
    url?: string;
    mimeType?: string;
    bytes?: number;
    /**
     * 结果字节落库后的媒体键（file-storage 的 media_files 仓）。
     * G1：结果字节先入 IndexedDB 再落盘快照，刷新/重进页面后仍能取回真实字节，
     * 不再出现「自报成功但字节已丢」。
     */
    storageKey?: string;
    /** 视频 blob 结果，仅内存可见，持久化时剥离。 */
    blob?: Blob;
    /** 持久化时被剥离了二进制内容（没有 storageKey 兜底时才会置位）。 */
    payloadDropped?: boolean;
    /** 最近一次字节入库失败的可读原因（不伪造成功，只做可见化）。 */
    ingestError?: string;
};

export type ToolTaskResult = {
    items: ToolTaskResultItem[];
    receivedAt: number;
};

/** 任务配置快照：只保存可复现请求的字段，绝不落盘 baseUrl/apiKey。 */
export type ToolTaskConfigSnapshot = {
    capability: ToolTaskCapability;
    model: string;
    apiFormat?: string;
    size?: string;
    quality?: string;
    count: string;
    /** 视频秒数：页面选择的时长必须随任务落库，否则重试/恢复会退回全局默认时长。 */
    videoSeconds?: string;
    /** 供恢复时判断模型是否仍可用；真实凭据在恢复时从用户配置重新解析。 */
    channelId?: string;
};

export type ToolTask = {
    id: string;
    toolId: string;
    status: ToolTaskStatus;
    /** 幂等键：同一逻辑操作用同一个值，重试不换键。 */
    clientOperationId: string;
    /** 输入指纹：用于拦截重复点击/同参数重复提交。 */
    fingerprint: string;
    capability: ToolTaskCapability;
    prompt: string;
    configSnapshot: ToolTaskConfigSnapshot;
    sourceAssetIds: string[];
    draftRevision?: number | string | null;
    upstreamTaskId?: string;
    upstreamProvider?: string;
    createdAt: number;
    updatedAt: number;
    submittedAt?: number;
    finishedAt?: number;
    /** 第几次提交尝试（同一 clientOperationId 下递增）。 */
    attempts: number;
    pollCount: number;
    transientFailures: number;
    lastPolledAt?: number;
    lastHeartbeatAt?: number;
    error?: ToolTaskError;
    result?: ToolTaskResult;
    /** 上游是否已受理无法确认 → 只能查询/人工确认，禁止自动重提交。 */
    reconcileRequired?: boolean;
    /** 本次返回是命中已有任务（去重），不是新建。 */
    deduplicated?: boolean;
    cancelledByUser?: boolean;
    /**
     * 工具特有的可回放输入快照（如 NEW_DESIGNER 的画布文档草稿）。
     *
     * 只在**没有上游 provider 可重放**的工具里使用：任务落盘后仅凭上游 taskId 恢复不了
     * 用户当时的输入（设计器根本不上传上游），所以必须把可序列化的输入一起存下来，
     * 刷新后才能从历史坞把画布/表单还原回去。只允许放可 JSON 序列化的轻量字段，
     * 二进制（dataUrl/blob）一律不进这里。
     */
    inputSnapshot?: Record<string, unknown>;
};

export type CreateTaskInput = {
    toolId: string;
    capability: ToolTaskCapability;
    prompt: string;
    configSnapshot: ToolTaskConfigSnapshot;
    sourceAssetIds?: string[];
    draftRevision?: number | string | null;
    clientOperationId?: string;
    id?: string;
    fingerprint?: string;
    at?: number;
    inputSnapshot?: Record<string, unknown>;
};

export class TaskTransitionError extends Error {
    readonly from: ToolTaskStatus;
    readonly to: ToolTaskStatus;

    constructor(from: ToolTaskStatus, to: ToolTaskStatus) {
        super(`Illegal tool task transition: ${from} → ${to}`);
        this.name = "TaskTransitionError";
        this.from = from;
        this.to = to;
    }
}

export function isTerminalStatus(status: ToolTaskStatus): boolean {
    return TERMINAL_STATUSES.has(status);
}

export function isActiveStatus(status: ToolTaskStatus): boolean {
    return ACTIVE_STATUSES.has(status);
}

export function canTransition(from: ToolTaskStatus, to: ToolTaskStatus): boolean {
    return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ToolTaskStatus, to: ToolTaskStatus): void {
    if (!canTransition(from, to)) throw new TaskTransitionError(from, to);
}

/** 唯一的任务写入入口：非法迁移直接抛错，避免 UI 与网关各自拼状态。 */
export function transitionTask(task: ToolTask, next: ToolTaskStatus, patch?: Partial<ToolTask> & { at?: number }): ToolTask {
    assertTransition(task.status, next);
    const at = patch?.at ?? Date.now();
    const { at: _at, ...rest } = patch ?? {};
    const nextTask: ToolTask = {
        ...task,
        ...rest,
        status: next,
        updatedAt: at,
    };
    if (next === "succeeded" || next === "failed" || next === "cancelled") nextTask.finishedAt = at;
    if (next === "submitting") nextTask.submittedAt = at;
    return nextTask;
}

/** 不改变状态的字段更新（轮询计数、心跳、上游 id…）；状态迁移必须走 transitionTask。 */
export function patchTask(task: ToolTask, patch: Partial<ToolTask>, at: number = Date.now()): ToolTask {
    return { ...task, ...patch, status: task.status, updatedAt: at };
}

export function newClientOperationId(): string {
    const cryptoApi = typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
    if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
    return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizePrompt(prompt: string): string {
    return String(prompt ?? "")
        .trim()
        .replace(/\s+/g, " ");
}

const SORTED_ARRAY_KEYS = new Set(["sourceAssetIds", "referenceIds", "videoIds", "audioIds"]);

function canonicalize(value: unknown, key?: string): unknown {
    if (Array.isArray(value)) {
        const items = value.map((item) => canonicalize(item));
        if (key && SORTED_ARRAY_KEYS.has(key)) return [...items].sort();
        return items;
    }
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        const sorted: Record<string, unknown> = {};
        for (const entryKey of Object.keys(record).sort()) {
            if (record[entryKey] === undefined) continue;
            sorted[entryKey] = canonicalize(record[entryKey], entryKey);
        }
        return sorted;
    }
    return value;
}

export function canonicalJson(value: unknown): string {
    return JSON.stringify(canonicalize(value));
}

/** FNV-1a 32×2：稳定、无依赖，够用来做“同参数重复提交”判定。 */
export function hashString(input: string): string {
    let a = 0x811c9dc5;
    let b = 0x01000193;
    for (let index = 0; index < input.length; index += 1) {
        const code = input.charCodeAt(index);
        a = (a ^ code) >>> 0;
        a = Math.imul(a, 0x01000193) >>> 0;
        b = (b + code * (index + 1)) >>> 0;
        b = Math.imul(b ^ (b >>> 7), 0x85ebca6b) >>> 0;
    }
    return `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

export function computeFingerprint(parts: {
    toolId: string;
    prompt: string;
    capability: ToolTaskCapability;
    configSnapshot: ToolTaskConfigSnapshot;
    sourceAssetIds?: string[];
    fields?: Record<string, unknown>;
}): string {
    return hashString(
        canonicalJson({
            toolId: parts.toolId,
            capability: parts.capability,
            prompt: normalizePrompt(parts.prompt),
            model: parts.configSnapshot.model,
            size: parts.configSnapshot.size ?? "",
            quality: parts.configSnapshot.quality ?? "",
            count: parts.configSnapshot.count,
            sourceAssetIds: parts.sourceAssetIds ?? [],
            fields: parts.fields ?? {},
        }),
    );
}

export function createTaskRecord(input: CreateTaskInput): ToolTask {
    const at = input.at ?? Date.now();
    const sourceAssetIds = input.sourceAssetIds ?? [];
    return {
        id: input.id ?? `task-${at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        toolId: input.toolId,
        status: "draft",
        clientOperationId: input.clientOperationId?.trim() || newClientOperationId(),
        fingerprint:
            input.fingerprint ??
            computeFingerprint({
                toolId: input.toolId,
                prompt: input.prompt,
                capability: input.capability,
                configSnapshot: input.configSnapshot,
                sourceAssetIds,
            }),
        capability: input.capability,
        prompt: input.prompt,
        configSnapshot: input.configSnapshot,
        sourceAssetIds,
        draftRevision: input.draftRevision ?? null,
        createdAt: at,
        updatedAt: at,
        attempts: 0,
        pollCount: 0,
        transientFailures: 0,
        ...(input.inputSnapshot ? { inputSnapshot: input.inputSnapshot } : {}),
    };
}

export function nextPollDelayMs(pollCount: number): number {
    return pollCount >= POLL_INTERVAL_SWITCH_COUNT ? POLL_INTERVAL_LATE_MS : POLL_INTERVAL_START_MS;
}

/** attempt 从 1 开始；退避上限 30s。 */
export function retryBackoffMs(attempt: number): number {
    const index = Math.min(Math.max(Math.floor(attempt) - 1, 0), POLL_RETRY_BACKOFF_MS.length - 1);
    return POLL_RETRY_BACKOFF_MS[index];
}

export function missedHeartbeats(task: ToolTask, now: number): number {
    if (!task.lastHeartbeatAt) return 0;
    const elapsed = now - task.lastHeartbeatAt;
    if (elapsed <= HEARTBEAT_INTERVAL_MS) return 0;
    return Math.floor(elapsed / HEARTBEAT_INTERVAL_MS);
}

export function isTaskExpired(task: ToolTask, now: number, timeoutMs: number = DEFAULT_TASK_TIMEOUT_MS): boolean {
    return now - (task.submittedAt ?? task.createdAt) > timeoutMs;
}

export type RecoveryAction = "none" | "wait" | "poll" | "reconcile";

export type RecoveryReason =
    | "terminal"
    | "not-submitted"
    | "awaiting-upstream-id"
    | "poll-upstream"
    | "poll-after-unknown"
    | "submit-uncertain"
    | "image-running-without-upstream-id"
    | "expired-query-upstream"
    | "manual-retry-required"
    /** 另一个标签页正在推进这条任务（活跃租约）：本页只读不改。 */
    | "active-in-other-tab";

export type RecoveryPlan = {
    action: RecoveryAction;
    reason: RecoveryReason;
    /** 需要服务端按 clientOperationId 反查（本项目当前没有这个接口 → 只能人工确认，见 report.md）。 */
    requiresServerLookup: boolean;
    /** 恢复路径永远不允许自动重提交。 */
    autoResubmit: false;
};

/**
 * 刷新/断网后如何继续这个任务。
 * 只会返回“等待上游 id / 查询上游 / 标记待人工确认”，不会返回“重新提交”。
 */
export function planRecovery(task: ToolTask, now: number = Date.now(), timeoutMs: number = DEFAULT_TASK_TIMEOUT_MS): RecoveryPlan {
    const base = { autoResubmit: false as const };
    if (isTerminalStatus(task.status)) return { ...base, action: "none", reason: "terminal", requiresServerLookup: false };
    if (task.status === "draft" || task.status === "validating") return { ...base, action: "none", reason: "not-submitted", requiresServerLookup: false };

    if (isTaskExpired(task, now, timeoutMs)) {
        return task.upstreamTaskId
            ? { ...base, action: "reconcile", reason: "expired-query-upstream", requiresServerLookup: false }
            : { ...base, action: "reconcile", reason: "manual-retry-required", requiresServerLookup: true };
    }

    if (task.status === "submitting") {
        if (task.upstreamTaskId) return { ...base, action: "poll", reason: "poll-upstream", requiresServerLookup: false };
        const submittedAt = task.submittedAt ?? task.updatedAt;
        if (now - submittedAt < SUBMIT_GRACE_MS) return { ...base, action: "wait", reason: "awaiting-upstream-id", requiresServerLookup: false };
        return { ...base, action: "reconcile", reason: "submit-uncertain", requiresServerLookup: true };
    }

    if (task.status === "running") {
        if (task.upstreamTaskId) return { ...base, action: "poll", reason: "poll-upstream", requiresServerLookup: false };
        if (task.capability === "image") return { ...base, action: "reconcile", reason: "image-running-without-upstream-id", requiresServerLookup: true };
        return { ...base, action: "wait", reason: "awaiting-upstream-id", requiresServerLookup: false };
    }

    // unknown
    if (task.upstreamTaskId) return { ...base, action: "poll", reason: "poll-after-unknown", requiresServerLookup: false };
    return { ...base, action: "reconcile", reason: "manual-retry-required", requiresServerLookup: true };
}

/**
 * 是否允许“自动”重提交。只有确定上游没有受理（failed 且非 timeout/network）才允许；
 * cancelled 由用户显式触发，也要由用户再次确认。
 */
export function canAutoResubmit(task: ToolTask): boolean {
    // 只有从未真正发出的任务（draft/validating）可以自动进入提交；
    // submitting/running/unknown 一律只能查询或人工确认。
    return task.status === "draft" || task.status === "validating";
}

/**
 * 持久化前剥离二进制内容：localStorage 放不下 dataUrl/Blob。
 *
 * G1：字节已落 IDB（item.storageKey 存在）时**不算丢**——保留 storageKey/bytes/mimeType/url，
 * 不置 payloadDropped，刷新后仍可下载/存资产/发画布；只有既没 storageKey 也没字节时才是真缺失。
 */
/** 只有 http(s) 是刷新后还能再取的持久地址；blob:/data: 随标签页销毁。 */
export function isDurableResultUrl(url?: string): url is string {
    return typeof url === "string" && /^https?:\/\//i.test(url.trim());
}

export function sanitizeTaskForPersist(task: ToolTask): ToolTask {
    if (!task.result) return task;
    const items = task.result.items.map((item) => {
        const { blob: _blob, dataUrl: _dataUrl, url: rawUrl, ...rest } = item;
        // H4 修复：对象 URL（blob:）刷新后必然失效，落盘时必须丢掉，否则刷新后拿到的是死链接。
        const url = isDurableResultUrl(rawUrl) ? rawUrl.trim() : undefined;
        const kept: ToolTaskResultItem = url ? { ...rest, url } : { ...rest };
        // 字节已在 IDB（storageKey）或仍有可再取的远程地址 → 不算丢，刷新后仍可下载/存资产/发画布。
        // 只在原本被误标 payloadDropped 时清除标记：干净快照不该平添字段（否则快照 diff/断言噪音）。
        if (item.storageKey || url) return item.payloadDropped ? { ...kept, payloadDropped: false } : kept;
        // 只有内存字节（dataUrl/blob）且没落库 → 才是真丢。
        if (item.dataUrl || item.blob) return { ...kept, payloadDropped: true };
        return item.payloadDropped ? { ...kept, payloadDropped: true } : kept;
    });
    return { ...task, result: { ...task.result, items } };
}

/**
 * 历史快照自愈：旧版本把「有持久 url 但未入库」的结果误标成 payloadDropped，
 * 或者入库失败后被标成 payloadDropped。这里按事实回收可恢复项，让动作门禁恢复可用。
 */
export function reclaimRecoverableResultItems(task: ToolTask): ToolTask {
    if (!task.result) return task;
    let changed = false;
    const items = task.result.items.map((item) => {
        if (!item.payloadDropped) return item;
        if (!item.storageKey && !isDurableResultUrl(item.url)) return item;
        changed = true;
        return { ...item, payloadDropped: false };
    });
    return changed ? { ...task, result: { ...task.result, items: [...items] } } : task;
}

export function sameSubmission(task: ToolTask, fingerprint: string, clientOperationId: string): boolean {
    return task.fingerprint === fingerprint || task.clientOperationId === clientOperationId;
}
