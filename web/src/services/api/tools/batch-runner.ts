/**
 * TASK-007：批量编排（预检 / 并发上限 / 部分成功 / 单行重试 / 可导出报告）。
 *
 * 真实边界：
 * - 执行只走 `ToolTaskGateway`（submit/wait/retry），本文件不直接调用 provider，也不补造结果；
 * - 预检复用真实 adapter 的 `resolveInvocation` + 用户当前配置，校验失败的行会带真实错误码；
 * - 批量支持集合来自 registry 的 `BATCH_TOOL_IDS`（与 tool_specs.json.batchReferences 同源）；
 * - 部分成功是常态：行失败只写入报告，不让整批 run 抛错；unknown 不等于 failed，单独统计；
 * - 重复行只按内容哈希提示，绝不自动去重（见 technical_design §8）。
 */

import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

import { BATCH_TOOL_IDS, getToolById } from "@/features/tools/registry";
import {
    classifyProviderError,
    getToolAdapter,
    type BrowserToolInput,
    type ToolAdapter,
    type ToolAdapterKind,
    type ToolTaskGateway,
    type WaitOptions,
} from "./gateway";
import type { ToolTask, ToolTaskCapability, ToolTaskResultItem } from "./task-machine";

/* ============================ 常量 ============================ */

export const BATCH_CONCURRENCY_MIN = 1;
export const BATCH_CONCURRENCY_MAX = 5;
export const BATCH_CONCURRENCY_DEFAULT = 3;

/** 批量执行只依赖网关的这三个方法，测试可替换传输层而保留编排逻辑。 */
/**
 * 网关端口：只暴露批量需要的能力。
 * `findTask` 用来在 submit 抛错后找回网关已落库的失败任务，让“单行重试”复用真实 taskId；
 * 找不到就老实重新提交（报告里会没有 taskId，而不是编一个）。
 */
export type BatchGatewayPort = Pick<ToolTaskGateway, "runTool" | "retry" | "getTask"> & {
    findTask?: (match: { toolId: string; since: number }) => ToolTask | undefined;
};

/* ============================ 行输入 ============================ */

/**
 * 一行 = 一次真实工具请求。`id` 在批次内稳定，用于重试/报告定位；
 * `fields` 是该工具独有字段（只参与指纹与 UI，不发送给 provider），
 * 批次级 `sharedFields` 会被逐行合并，行内值优先。
 */
export type BatchRowInput = {
    id: string;
    label?: string;
    prompt?: string;
    references?: ReferenceImage[];
    videos?: ReferenceVideo[];
    audios?: ReferenceAudio[];
    model?: string;
    size?: string;
    quality?: string;
    count?: number;
    fields?: Record<string, unknown>;
    /** 默认 true；显式关闭的行在预检里标为 skipped，不占用并发也不计失败。 */
    enabled?: boolean;
};

export type BatchRunRequest = {
    batchId: string;
    /** canonical toolId（大写 SNAKE_CASE），整批共用；不按行换工具。 */
    toolId: string;
    rows: BatchRowInput[];
    concurrency?: number;
    sharedFields?: Record<string, unknown>;
};

export function clampBatchConcurrency(value?: number): number {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed)) return BATCH_CONCURRENCY_DEFAULT;
    return Math.max(BATCH_CONCURRENCY_MIN, Math.min(BATCH_CONCURRENCY_MAX, parsed));
}

export function isBatchCapableTool(toolId: string): boolean {
    return BATCH_TOOL_IDS.includes(toolId);
}

/** 行 → 真实网关输入：共享字段先铺底，行字段覆盖，内容哈希与提交用同一份数据。 */
export function buildRowBrowserInput(request: BatchRunRequest, row: BatchRowInput): BrowserToolInput {
    return {
        toolId: request.toolId,
        prompt: row.prompt ?? "",
        ...(row.references?.length ? { references: row.references } : {}),
        ...(row.videos?.length ? { videos: row.videos } : {}),
        ...(row.audios?.length ? { audios: row.audios } : {}),
        ...(row.model ? { model: row.model } : {}),
        ...(row.size ? { size: row.size } : {}),
        ...(row.quality ? { quality: row.quality } : {}),
        ...(row.count !== undefined ? { count: row.count } : {}),
        fields: { ...(request.sharedFields ?? {}), ...(row.fields ?? {}) },
    };
}

/* ============================ 内容哈希 / 重复提示 ============================ */

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

/** FNV-1a：只用于“重复行提示”和报告定位，不参与网关幂等键。 */
export function hashBatchRowContent(request: BatchRunRequest, row: BatchRowInput): string {
    const input = buildRowBrowserInput(request, row);
    const content = stableStringify({
        toolId: request.toolId,
        prompt: (input.prompt ?? "").trim().replace(/\s+/g, " "),
        references: (input.references ?? []).map((item) => item.storageKey ?? item.url ?? item.id),
        videos: (input.videos ?? []).map((item) => item.storageKey ?? item.url ?? item.id),
        audios: (input.audios ?? []).map((item) => item.storageKey ?? item.url ?? item.id),
        model: input.model ?? "",
        size: input.size ?? "",
        quality: input.quality ?? "",
        count: input.count ?? null,
        fields: input.fields ?? {},
    });
    let hash = 0x811c9dc5;
    for (let index = 0; index < content.length; index += 1) {
        hash ^= content.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}

/* ============================ 预检 ============================ */

export type BatchIssueSeverity = "blocking" | "warning";

export type BatchIssue = {
    code: string;
    message: string;
    severity: BatchIssueSeverity;
    /** 出问题的字段（有字段语义时填写，供 UI 高亮）。 */
    field?: string;
};

export type BatchRowPreflight = {
    rowId: string;
    /** 是否可以真正执行：无 blocking 且未禁用。 */
    runnable: boolean;
    enabled: boolean;
    contentHash: string;
    issues: BatchIssue[];
    /** 与之内容相同的其他行 id（仅提示，不自动去重）。 */
    duplicates: string[];
};

export type BatchPreflight = {
    toolId: string;
    /** 批次级是否可执行（工具可用 + 批量支持 + 模型已配置）。 */
    ok: boolean;
    capability: ToolTaskCapability | null;
    kind: ToolAdapterKind | null;
    issues: BatchIssue[];
    rows: Record<string, BatchRowPreflight>;
    duplicateGroups: string[][];
    totals: { rows: number; runnable: number; blocked: number; skipped: number };
};

export type BatchPreflightDeps = {
    config: AiConfig;
    /** 覆盖批量支持集合（默认 registry.BATCH_TOOL_IDS）。 */
    batchToolIds?: readonly string[];
    getAdapter?: (toolId: string) => ToolAdapter;
};

function requiredModelFor(config: AiConfig, capability: ToolTaskCapability): string {
    return ((capability === "video" ? config.videoModel : config.imageModel) || config.model || "").trim();
}

function errorToIssue(code: string, message: string, severity: BatchIssueSeverity = "blocking"): BatchIssue {
    return { code, message, severity };
}

/** 行级校验直接调用真实 adapter；错误码来自真实 resolveInvocation，不是本地伪造。 */
function validateRowWithAdapter(adapter: ToolAdapter, config: AiConfig, input: BrowserToolInput): BatchIssue[] {
    try {
        adapter.resolveInvocation(input, config);
        return [];
    } catch (error) {
        const classified = classifyProviderError(error);
        return [errorToIssue(classified.code, classified.message)];
    }
}

/**
 * 预检全行：先判工具（未知/不可执行/不支持批量/未配置模型），再逐行走 adapter 校验，
 * 最后给出内容重复提示。任何 blocking 问题只落在对应行或批次级 issues，不抛错。
 */
export function preflightBatch(request: BatchRunRequest, deps: BatchPreflightDeps): BatchPreflight {
    const batchToolIds = deps.batchToolIds ?? BATCH_TOOL_IDS;
    const getAdapter = deps.getAdapter ?? getToolAdapter;
    const issues: BatchIssue[] = [];
    let adapter: ToolAdapter | null = null;

    try {
        adapter = getAdapter(request.toolId);
    } catch (error) {
        const classified = classifyProviderError(error);
        issues.push(errorToIssue(classified.code, classified.message));
    }

    if (adapter) {
        if (!adapter.capability) {
            issues.push(errorToIssue("adapter-not-executable", `${request.toolId} runs inside the LinkFox designer host and cannot be executed by the gateway.`));
        } else if (requiredModelFor(deps.config, adapter.capability) === "") {
            issues.push(errorToIssue(adapter.capability === "video" ? "video-model-required" : "image-model-required", "No model configured for this tool; select a provider model first."));
        }
    }
    if (!batchToolIds.includes(request.toolId)) {
        issues.push(errorToIssue("tool-not-batch-capable", `${request.toolId} is not in the batch support set (tool_specs.json batchReferences).`));
    }

    const globalBlocking = issues.some((issue) => issue.severity === "blocking");
    const rows: Record<string, BatchRowPreflight> = {};
    const hashGroups = new Map<string, string[]>();

    for (const row of request.rows) {
        const contentHash = hashBatchRowContent(request, row);
        hashGroups.set(contentHash, [...(hashGroups.get(contentHash) ?? []), row.id]);
        const enabled = row.enabled !== false;
        const rowIssues: BatchIssue[] = [];

        if (!enabled) {
            rowIssues.push(errorToIssue("row-disabled", "Row is disabled and will be skipped.", "warning"));
        }

        const label = row.label?.trim() || row.id;
        // 有 adapter 时由 adapter 校验给出必填项问题（消息带工具名），这里只兜底无 adapter 的情况，
        // 否则同一条缺失会报两遍。
        if (!adapter) {
            if (!row.references?.length) {
                rowIssues.push(errorToIssue("references-required", `${label} needs at least one source image.`, "blocking"));
            }
            if (!row.videos?.length) {
                rowIssues.push(errorToIssue("video-required", `${label} needs at least one source video.`, "blocking"));
            }
        }

        if (adapter && adapter.capability && enabled && !globalBlocking) {
            rowIssues.push(...validateRowWithAdapter(adapter, deps.config, buildRowBrowserInput(request, row)));
        }

        if (adapter && row.fields) {
            for (const field of Object.keys(row.fields)) {
                if (!adapter.supportsField(field)) {
                    rowIssues.push(errorToIssue("field-not-declared", `${request.toolId} spec does not declare field "${field}"; it is not sent to the provider.`, "warning"));
                }
            }
        }

        rows[row.id] = {
            rowId: row.id,
            runnable: enabled && !rowIssues.some((issue) => issue.severity === "blocking"),
            enabled,
            contentHash,
            issues: rowIssues,
            duplicates: [],
        };
    }

    const duplicateGroups: string[][] = [];
    for (const ids of hashGroups.values()) {
        if (ids.length < 2) continue;
        duplicateGroups.push(ids);
        for (const id of ids) {
            const row = rows[id];
            if (!row) continue;
            row.duplicates = ids.filter((other) => other !== id);
            row.issues.push(errorToIssue("duplicate-content", `Row content is identical to ${row.duplicates.join(", ")}; rows are not deduplicated automatically.`, "warning"));
        }
    }

    const values = Object.values(rows);
    const runnable = values.filter((row) => row.runnable && !globalBlocking).length;

    return {
        toolId: request.toolId,
        // 一行都跑不了时不能显示“可执行”：行级阻断同样会让执行变成空转。
        ok: !globalBlocking && runnable > 0,
        capability: adapter?.capability ?? null,
        kind: adapter?.kind ?? null,
        issues,
        rows,
        duplicateGroups,
        totals: {
            rows: values.length,
            runnable,
            blocked: values.filter((row) => row.enabled && !row.runnable).length,
            skipped: values.filter((row) => !row.enabled).length,
        },
    };
}

/* ============================ 执行 ============================ */

export type BatchRowStatus = "pending" | "skipped" | "running" | "succeeded" | "failed" | "unknown" | "cancelled";

export type BatchRowError = { code: string; message: string; retryable: boolean };

export type BatchRowOutcome = {
    rowId: string;
    status: BatchRowStatus;
    taskId?: string;
    attempts: number;
    startedAt?: number;
    finishedAt?: number;
    durationMs?: number;
    resultCount: number;
    /** 只保留可持久化的播放/下载地址（http/https），dataUrl 不入报告。 */
    resultUrls: string[];
    error?: BatchRowError;
    preflightIssues: BatchIssue[];
    duplicates: string[];
    /** 命中了网关的进行中任务（同内容复用），没有重新扣费。 */
    deduplicated: boolean;
};

export type BatchSummary = {
    total: number;
    succeeded: number;
    failed: number;
    unknown: number;
    cancelled: number;
    skipped: number;
    running: number;
};

export type BatchRunResult = {
    batchId: string;
    toolId: string;
    concurrency: number;
    startedAt: number;
    finishedAt: number;
    aborted: boolean;
    outcomes: BatchRowOutcome[];
    summary: BatchSummary;
};

export type BatchRunDeps = {
    gateway: BatchGatewayPort;
    now?: () => number;
    signal?: AbortSignal;
    /** 行状态变化回调：UI/持久化按此增量更新。 */
    onRowUpdate?: (outcome: BatchRowOutcome) => void;
};

export function emptyRowOutcome(rowId: string, preflight?: BatchRowPreflight): BatchRowOutcome {
    return {
        rowId,
        status: "pending",
        attempts: 0,
        resultCount: 0,
        resultUrls: [],
        preflightIssues: preflight?.issues ?? [],
        duplicates: preflight?.duplicates ?? [],
        deduplicated: false,
    };
}

function summarize(outcomes: BatchRowOutcome[]): BatchSummary {
    const count = (status: BatchRowStatus) => outcomes.filter((item) => item.status === status).length;
    return {
        total: outcomes.length,
        succeeded: count("succeeded"),
        failed: count("failed"),
        unknown: count("unknown"),
        cancelled: count("cancelled"),
        skipped: count("skipped"),
        running: count("running"),
    };
}

export function summarizeBatchOutcomes(outcomes: BatchRowOutcome[]): BatchSummary {
    return summarize(outcomes);
}

function isAbortSignalAborted(signal?: AbortSignal): boolean {
    return Boolean(signal?.aborted);
}

function collectResultUrls(items: ToolTaskResultItem[] | undefined): string[] {
    return (items ?? [])
        .map((item) => item.url)
        .filter((url): url is string => typeof url === "string" && /^https?:\/\//i.test(url));
}

export function applyTaskToOutcome(outcome: BatchRowOutcome, task: ToolTask, now: number): BatchRowOutcome {
    const status: BatchRowStatus =
        task.status === "succeeded" ? "succeeded" : task.status === "cancelled" ? "cancelled" : task.status === "failed" ? "failed" : task.status === "unknown" ? "unknown" : "failed";
    const finishedAt = task.finishedAt ?? now;
    return {
        ...outcome,
        status,
        taskId: task.id,
        attempts: task.attempts,
        finishedAt,
        durationMs: outcome.startedAt !== undefined ? Math.max(0, finishedAt - outcome.startedAt) : undefined,
        resultCount: task.result?.items?.length ?? 0,
        resultUrls: collectResultUrls(task.result?.items),
        error:
            status === "succeeded"
                ? undefined
                : task.error ?? {
                      code: status === "unknown" ? "task-unknown" : status === "cancelled" ? "task-cancelled" : "task-failed",
                      message:
                          status === "unknown"
                              ? "Upstream state is unknown; reconcile before resubmitting."
                              : status === "cancelled"
                                ? "Row was cancelled before completion."
                                : "Task finished without a result.",
                      retryable: status !== "cancelled",
                  },
        deduplicated:Boolean(task.deduplicated) || outcome.deduplicated,
    };
}

/**
 * 单行执行：优先复用网关的 retry（同一 clientOperationId，失败行的显式重试），
 * 无历史任务时走 runTool 全新提交。异常一律收敛成行级 error，不向上抛。
 */
async function executeRow(
    request: BatchRunRequest,
    row: BatchRowInput,
    preflight: BatchPreflight,
    deps: BatchRunDeps,
    previous?: BatchRowOutcome,
): Promise<BatchRowOutcome> {
    const now = deps.now ?? (() => Date.now());
    const input = buildRowBrowserInput(request, row);
    let outcome: BatchRowOutcome = {
        ...emptyRowOutcome(row.id, preflight.rows[row.id]),
        attempts: previous?.attempts ?? 0,
        taskId: previous?.taskId,
        startedAt: now(),
        status: "running",
    };
    deps.onRowUpdate?.(outcome);

    if (isAbortSignalAborted(deps.signal)) {
        outcome = { ...outcome, status: "cancelled", finishedAt: now(), error: { code: "batch-aborted", message: "Batch was cancelled before this row started.", retryable: true } };
        deps.onRowUpdate?.(outcome);
        return outcome;
    }

    /**
     * dedupe:false 是刻意的：批量里的重复行只做提示，用户点“执行”就是每行各发一次真实请求。
     * 若沿用网关默认去重，内容相同的第二行会静默复用第一行的任务（报告里看不到一次真实执行）。
     */
    const waitOptions: WaitOptions = { ...(deps.signal ? { signal: deps.signal } : {}), dedupe: false };
    try {
        const task =
            previous?.taskId && previous.status !== "succeeded"
                ? await deps.gateway.retry(previous.taskId, input, waitOptions)
                : await deps.gateway.runTool(input, waitOptions);
        outcome = applyTaskToOutcome(outcome, task, now());
    } catch (error) {
        const finishedAt = now();
        if ((error as { name?: string } | null)?.name === "AbortError" || isAbortSignalAborted(deps.signal)) {
            outcome = {
                ...outcome,
                status: "cancelled",
                finishedAt,
                durationMs: outcome.startedAt !== undefined ? Math.max(0, finishedAt - outcome.startedAt) : undefined,
                error: { code: "batch-aborted", message: "Batch was cancelled while this row was running.", retryable: true },
            };
        } else {
            const classified = classifyProviderError(error);
            // submit 抛错时网关其实已把失败任务落库；找回真实 taskId，单行重试才能走 gateway.retry。
            const recovered = deps.gateway.findTask?.({ toolId: request.toolId, since: outcome.startedAt ?? finishedAt });
            outcome = {
                ...outcome,
                status: "failed",
                taskId: recovered?.id ?? outcome.taskId,
                attempts: recovered?.attempts ?? outcome.attempts,
                finishedAt,
                durationMs: outcome.startedAt !== undefined ? Math.max(0, finishedAt - outcome.startedAt) : undefined,
                error: recovered?.error
                    ? { code: recovered.error.code, message: recovered.error.message, retryable: recovered.error.retryable ?? classified.retryable }
                    : { code: classified.code, message: classified.message, retryable: classified.retryable },
            };
        }
    }
    deps.onRowUpdate?.(outcome);
    return outcome;
}

/** 有界并发池：worker 数量 = min(并发上限, 待执行行数)，每个 worker 顺序取行。 */
async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
    let cursor = 0;
    const size = Math.max(1, Math.min(concurrency, items.length));
    const runners = Array.from({ length: size }, async () => {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            const item = items[index];
            if (item === undefined) return;
            await worker(item);
        }
    });
    await Promise.all(runners);
}

/**
 * 跑一批：预检不可执行的行直接 skipped（带 issues），其余按并发上限执行。
 * 返回完整 outcomes（顺序与请求行一致）与统计；部分失败不抛错。
 */
export async function runBatch(request: BatchRunRequest, preflight: BatchPreflight, deps: BatchRunDeps): Promise<BatchRunResult> {
    const now = deps.now ?? (() => Date.now());
    const concurrency = clampBatchConcurrency(request.concurrency);
    const startedAt = now();
    const outcomes = new Map<string, BatchRowOutcome>();

    for (const row of request.rows) {
        const rowPreflight = preflight.rows[row.id];
        if (!preflight.ok || !rowPreflight?.runnable) {
            const skipped: BatchRowOutcome = {
                ...emptyRowOutcome(row.id, rowPreflight),
                status: "skipped",
                finishedAt: startedAt,
                durationMs: 0,
                error: preflight.ok
                    ? undefined
                    : { code: preflight.issues.find((issue) => issue.severity === "blocking")?.code ?? "batch-blocked", message: preflight.issues.find((issue) => issue.severity === "blocking")?.message ?? "Batch preflight blocked execution.", retryable: false },
            };
            outcomes.set(row.id, skipped);
            deps.onRowUpdate?.(skipped);
        } else {
            outcomes.set(row.id, emptyRowOutcome(row.id, rowPreflight));
        }
    }

    const queue = request.rows.filter((row) => outcomes.get(row.id)?.status === "pending");
    let aborted = false;

    await runWithConcurrency(queue, concurrency, async (row) => {
        if (isAbortSignalAborted(deps.signal)) {
            const rowPreflight = preflight.rows[row.id];
            const cancelled: BatchRowOutcome = {
                ...emptyRowOutcome(row.id, rowPreflight),
                status: "cancelled",
                finishedAt: now(),
                error: { code: "batch-aborted", message: "Batch was cancelled before this row started.", retryable: true },
            };
            outcomes.set(row.id, cancelled);
            deps.onRowUpdate?.(cancelled);
            aborted = true;
            return;
        }
        const executed = await executeRow(request, row, preflight, deps);
        outcomes.set(row.id, executed);
        if (executed.status === "cancelled") aborted = true;
    });

    const ordered = request.rows.map((row) => outcomes.get(row.id) ?? emptyRowOutcome(row.id));
    const finishedAt = now();
    return {
        batchId: request.batchId,
        toolId: request.toolId,
        concurrency,
        startedAt,
        finishedAt,
        aborted: aborted || isAbortSignalAborted(deps.signal),
        outcomes: ordered,
        summary: summarize(ordered),
    };
}

/** 只有失败/未知/取消/预检跳过的行可以再次执行；成功行绝不重跑。 */
export function isRowRetryable(outcome: BatchRowOutcome): boolean {
    return outcome.status === "failed" || outcome.status === "unknown" || outcome.status === "cancelled" || outcome.status === "skipped";
}

export function selectRetryableRowIds(outcomes: BatchRowOutcome[]): string[] {
    return outcomes.filter(isRowRetryable).map((outcome) => outcome.rowId);
}

export type BatchRetryResult = {
    outcomes: BatchRowOutcome[];
    retried: string[];
    summary: BatchSummary;
};

/**
 * 单行/失败行重试：只执行 `rowIds`，其余行原样保留。
 * 有历史任务 → gateway.retry（同 clientOperationId）；没有 → 重新 runTool。
 */
export async function retryBatchRows(
    request: BatchRunRequest,
    preflight: BatchPreflight,
    previousOutcomes: BatchRowOutcome[],
    rowIds: string[],
    deps: BatchRunDeps,
): Promise<BatchRetryResult> {
    const concurrency = clampBatchConcurrency(request.concurrency);
    const previousById = new Map(previousOutcomes.map((outcome) => [outcome.rowId, outcome]));
    const targets = rowIds
        .map((rowId) => request.rows.find((row) => row.id === rowId))
        .filter((row): row is BatchRowInput => Boolean(row))
        .filter((row) => previousById.has(row.id) && isRowRetryable(previousById.get(row.id) as BatchRowOutcome));

    const executed = new Map<string, BatchRowOutcome>();

    await runWithConcurrency(targets, concurrency, async (row) => {
        const executedRow = await executeRow(request, row, preflight, deps, previousById.get(row.id));
        executed.set(row.id, executedRow);
    });

    const outcomes = previousOutcomes.map((outcome) => executed.get(outcome.rowId) ?? outcome);
    return {
        outcomes,
        retried: targets.map((row) => row.id),
        summary: summarize(outcomes),
    };
}

/* ============================ 报告 ============================ */

export type BatchReportFormat = "json" | "csv";

export type BatchReportRow = {
    rowId: string;
    label: string;
    /** 提示词入报告（CSV 也带），归档时能看出每一行到底请求了什么。 */
    prompt: string | null;
    status: BatchRowStatus;
    taskId: string | null;
    attempts: number;
    durationMs: number | null;
    resultCount: number;
    resultUrls: string[];
    errorCode: string | null;
    errorMessage: string | null;
    retryable: boolean;
    deduplicated: boolean;
    duplicates: string[];
    preflightIssues: BatchIssue[];
};

export type BatchReport = {
    reportVersion: 1;
    batchId: string;
    toolId: string;
    generatedAt: string;
    concurrency: number;
    startedAt: number | null;
    finishedAt: number | null;
    aborted: boolean;
    summary: BatchSummary;
    duplicates: string[][];
    preflightIssues: BatchIssue[];
    rows: BatchReportRow[];
};

export type BatchReportSource = {
    request: BatchRunRequest;
    preflight: BatchPreflight;
    outcomes: BatchRowOutcome[];
    concurrency?: number;
    startedAt?: number;
    finishedAt?: number;
    aborted?: boolean;
    now?: () => number;
};

export function buildBatchReport(source: BatchReportSource): BatchReport {
    const now = source.now ?? (() => Date.now());
    const rowsById = new Map(source.request.rows.map((row) => [row.id, row]));
    return {
        reportVersion: 1,
        batchId: source.request.batchId,
        toolId: source.request.toolId,
        generatedAt: new Date(now()).toISOString(),
        concurrency: clampBatchConcurrency(source.concurrency ?? source.request.concurrency),
        startedAt: source.startedAt ?? null,
        finishedAt: source.finishedAt ?? null,
        aborted: source.aborted ?? false,
        summary: summarize(source.outcomes),
        duplicates: source.preflight.duplicateGroups,
        preflightIssues: source.preflight.issues,
        rows: source.outcomes.map((outcome) => {
            const row = rowsById.get(outcome.rowId);
            return {
                rowId: outcome.rowId,
                label: row?.label?.trim() || outcome.rowId,
                prompt: row?.prompt?.trim() ? row.prompt.trim() : null,
                status: outcome.status,
                taskId: outcome.taskId ?? null,
                attempts: outcome.attempts,
                durationMs: outcome.durationMs ?? null,
                resultCount: outcome.resultCount,
                resultUrls: [...outcome.resultUrls],
                errorCode: outcome.error?.code ?? null,
                errorMessage: outcome.error?.message ?? null,
                retryable: outcome.error?.retryable ?? isRowRetryable(outcome),
                deduplicated: outcome.deduplicated,
                duplicates: [...outcome.duplicates],
                preflightIssues: [...outcome.preflightIssues],
            };
        }),
    };
}

const CSV_HEADERS = [
    "row_id",
    "label",
    "prompt",
    "status",
    "task_id",
    "attempts",
    "duration_ms",
    "result_count",
    "result_urls",
    "error_code",
    "error_message",
    "retryable",
    "deduplicated",
    "duplicate_rows",
    "preflight_issues",
] as const;

/** 防 CSV 公式注入：Excel 会把 =、+、-、@ 开头的单元格当公式执行。 */
function csvCell(value: string | number | boolean | null): string {
    if (value === null) return "";
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

export function reportToCsv(report: BatchReport): string {
    const lines = [CSV_HEADERS.join(",")];
    for (const row of report.rows) {
        lines.push(
            [
                csvCell(row.rowId),
                csvCell(row.label),
                csvCell(row.prompt),
                csvCell(row.status),
                csvCell(row.taskId),
                csvCell(row.attempts),
                csvCell(row.durationMs),
                csvCell(row.resultCount),
                csvCell(row.resultUrls.join(" | ")),
                csvCell(row.errorCode),
                csvCell(row.errorMessage),
                csvCell(row.retryable),
                csvCell(row.deduplicated),
                csvCell(row.duplicates.join(" | ")),
                csvCell(row.preflightIssues.map((issue) => `${issue.code}:${issue.message}`).join(" | ")),
            ].join(","),
        );
    }
    return `${lines.join("\n")}\n`;
}

export type BatchReportFile = { filename: string; mimeType: string; content: string };

function safeFilenamePart(value: string): string {
    return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "batch";
}

/** 生成可直接下载的报告（CSV/JSON），文件名含 batchId 与时间戳，便于归档。 */
export function serializeBatchReport(report: BatchReport, format: BatchReportFormat): BatchReportFile {
    const stamp = report.generatedAt.replace(/[:.]/g, "-");
    const base = `batch-${safeFilenamePart(report.batchId)}-${stamp}`;
    if (format === "csv") {
        return { filename: `${base}.csv`, mimeType: "text/csv;charset=utf-8", content: reportToCsv(report) };
    }
    return { filename: `${base}.json`, mimeType: "application/json;charset=utf-8", content: `${JSON.stringify(report, null, 2)}\n` };
}

/** 批次里实际可用的工具标题（UI 下拉用），只列 registry 中启用且支持批量的工具。 */
export function listBatchToolOptions(): Array<{ id: string; title: string }> {
    return BATCH_TOOL_IDS.map((id) => {
        const spec = getToolById(id);
        return { id, title: spec?.title ?? id };
    });
}
