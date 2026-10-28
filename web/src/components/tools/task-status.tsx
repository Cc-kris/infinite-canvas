import { AlertTriangle, Ban, CheckCircle2, CircleDashed, Clock3, Loader2, RotateCcw, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ToolTask, ToolTaskError, ToolTaskStatus } from "@/services/api/tools/task-machine";

/**
 * TASK-006：任务状态的唯一展示层。
 *
 * 数据全部来自 TASK-005 的 `ToolTask`（真实状态机），这里不推断、不补造状态：
 * - 未知/待人工确认的任务不会渲染“重试”按钮，避免重复扣费（technical_design §6）；
 * - 计时只用 `submittedAt/createdAt/finishedAt`，没有就显示“—”，不假装有进度百分比。
 */

export type TaskStatusTone = "neutral" | "progress" | "success" | "danger" | "warning";

export type TaskStatusMeta = {
    status: ToolTaskStatus;
    label: string;
    hint: string;
    tone: TaskStatusTone;
    terminal: boolean;
};

export const TASK_STATUS_META: Record<ToolTaskStatus, TaskStatusMeta> = {
    draft: { status: "draft", label: "草稿", hint: "尚未提交", tone: "neutral", terminal: false },
    validating: { status: "validating", label: "校验中", hint: "正在校验输入与能力", tone: "progress", terminal: false },
    submitting: { status: "submitting", label: "提交中", hint: "请求已发出，等待上游受理", tone: "progress", terminal: false },
    running: { status: "running", label: "生成中", hint: "上游处理中，可以离开页面稍后回来", tone: "progress", terminal: false },
    succeeded: { status: "succeeded", label: "已完成", hint: "结果已返回", tone: "success", terminal: true },
    failed: { status: "failed", label: "失败", hint: "上游返回失败", tone: "danger", terminal: true },
    cancelled: { status: "cancelled", label: "已取消", hint: "已取消，没有继续调用上游", tone: "neutral", terminal: true },
    unknown: { status: "unknown", label: "结果未知", hint: "无法确认上游是否受理，只能查询或人工确认", tone: "warning", terminal: false },
};

const TONE_CLASS: Record<TaskStatusTone, string> = {
    neutral: "border-stone-300 bg-stone-100 text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200",
    progress: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200",
    success: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    danger: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
    warning: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
};

export function taskStatusMeta(status: ToolTaskStatus): TaskStatusMeta {
    // 历史快照/外部注入可能带来非法状态值，兜底到 unknown 而不是抛错（否则整页被 ErrorBoundary 干掉）
    return TASK_STATUS_META[status] ?? TASK_STATUS_META.unknown;
}

/** 秒级可读时长，避免把毫秒原样丢给用户。 */
export function formatElapsed(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return "—";
    const totalSeconds = Math.floor(ms / 1000);
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export type TaskTiming = {
    elapsedMs: number;
    elapsedLabel: string;
    running: boolean;
    pollCount: number;
};

/** 终态用 finishedAt 结算；未结束用 now（调用方可注入，测试不依赖真实时钟）。 */
export function describeTaskTiming(task: Pick<ToolTask, "status" | "createdAt" | "updatedAt" | "submittedAt" | "finishedAt" | "pollCount">, now: number = Date.now()): TaskTiming {
    const startedAt = task.submittedAt ?? task.createdAt ?? task.updatedAt;
    const endedAt = task.finishedAt ?? now;
    const elapsedMs = startedAt ? Math.max(0, endedAt - startedAt) : Number.NaN;
    return {
        elapsedMs,
        elapsedLabel: formatElapsed(elapsedMs),
        running: !taskStatusMeta(task.status).terminal,
        pollCount: task.pollCount ?? 0,
    };
}

export type TaskErrorSummary = {
    title: string;
    detail: string;
    code?: string;
    retryable: boolean;
};

export function describeTaskError(error?: ToolTaskError): TaskErrorSummary | null {
    if (!error) return null;
    return {
        title: "任务失败",
        detail: error.message || "上游没有返回可理解的错误信息",
        code: error.code,
        retryable: Boolean(error.retryable),
    };
}

export type TaskNotice = { tone: "warning" | "neutral"; title: string; detail: string };

/** 只在真的需要人工介入时提示；不把“未知”伪装成失败或成功。 */
export function describeTaskNotice(task: Pick<ToolTask, "status" | "reconcileRequired" | "cancelledByUser" | "deduplicated" | "upstreamTaskId">): TaskNotice | null {
    if (task.reconcileRequired) {
        return {
            tone: "warning",
            title: "需要人工确认",
            detail: "请求可能已被上游受理，为避免重复扣费不会自动重发。请用上游任务编号核对后再决定。",
        };
    }
    if (task.deduplicated) {
        return { tone: "neutral", title: "复用了已有任务", detail: "相同参数的任务还在进行中，本次没有再次发起真实请求。" };
    }
    if (task.cancelledByUser && task.status === "cancelled") {
        return { tone: "neutral", title: "你已取消", detail: "已完成的调用无法回滚，但不会再继续轮询。" };
    }
    if (task.status === "unknown" && !task.upstreamTaskId) {
        return {
            tone: "warning",
            title: "上游未给出任务编号",
            detail: "无法查询进度，只能人工确认上游是否已受理；请勿直接重复提交。",
        };
    }
    return null;
}

const STATUS_ICON: Record<ToolTaskStatus, typeof CircleDashed> = {
    draft: CircleDashed,
    validating: Loader2,
    submitting: Loader2,
    running: Loader2,
    succeeded: CheckCircle2,
    failed: XCircle,
    cancelled: Ban,
    unknown: AlertTriangle,
};

export function TaskStatusBadge({ status, className }: { status: ToolTaskStatus; className?: string }) {
    const meta = taskStatusMeta(status);
    // 与 meta 同样兜底：历史快照可能带非法状态值，缺图标会渲染 undefined 组件直接白屏
    const Icon = (STATUS_ICON as Record<string, typeof AlertTriangle>)[status] ?? AlertTriangle;
    const spinning = status === "validating" || status === "submitting" || status === "running";
    return (
        <span
            data-testid="tool-task-status"
            data-status={status}
            data-tone={meta.tone}
            title={meta.hint}
            className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium", TONE_CLASS[meta.tone], className)}
        >
            <Icon aria-hidden="true" className={cn("size-3.5", spinning && "animate-spin")} />
            {meta.label}
        </span>
    );
}

export type TaskStatusPanelProps = {
    task: Pick<ToolTask, "status" | "createdAt" | "updatedAt" | "submittedAt" | "finishedAt" | "pollCount" | "error" | "reconcileRequired" | "cancelledByUser" | "deduplicated" | "upstreamTaskId">;
    now?: number;
    onCancel?: () => void;
    onRetry?: () => void;
    className?: string;
};

export function TaskStatusPanel({ task, now, onCancel, onRetry, className }: TaskStatusPanelProps) {
    const meta = taskStatusMeta(task.status);
    const timing = describeTaskTiming(task, now);
    const error = describeTaskError(task.error);
    const notice = describeTaskNotice(task);
    const canCancel = Boolean(onCancel) && (task.status === "submitting" || task.status === "running" || task.status === "unknown");
    // failed 才允许显式重试；unknown/reconcileRequired 必须人工确认，绝不提供“再提交一次”。
    const canRetry = Boolean(onRetry) && task.status === "failed" && !task.reconcileRequired;

    return (
        <div data-testid="tool-task-panel" data-status={task.status} className={cn("rounded-xl border border-border bg-card p-3 text-sm", className)}>
            <div className="flex flex-wrap items-center gap-2">
                <TaskStatusBadge status={task.status} />
                <span className="text-xs text-muted-foreground">{meta.hint}</span>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground" data-testid="tool-task-timing">
                    {timing.elapsedLabel}
                    {timing.pollCount > 0 ? ` · 轮询 ${timing.pollCount} 次` : ""}
                </span>
            </div>

            {error ? (
                <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200" data-testid="tool-task-error">
                    <p className="font-medium">{error.title}</p>
                    <p className="mt-0.5 break-words">{error.detail}</p>
                    <p className="mt-1 text-[11px] opacity-80">
                        诊断码：{error.code ?? "unknown"} · {error.retryable ? "可按原参数重试" : "该错误不建议直接重试"}
                    </p>
                </div>
            ) : null}

            {notice ? (
                <div
                    className={cn(
                        "mt-2 rounded-lg border p-2 text-xs",
                        notice.tone === "warning"
                            ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
                            : "border-border bg-muted text-muted-foreground",
                    )}
                    data-testid="tool-task-notice"
                >
                    <p className="font-medium">{notice.title}</p>
                    <p className="mt-0.5">{notice.detail}</p>
                </div>
            ) : null}

            {canCancel || canRetry ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    {canCancel ? (
                        <button
                            type="button"
                            onClick={onCancel}
                            data-testid="tool-task-cancel"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <Clock3 aria-hidden="true" className="size-3.5" />
                            停止等待
                        </button>
                    ) : null}
                    {canRetry ? (
                        <button
                            type="button"
                            onClick={onRetry}
                            data-testid="tool-task-retry"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <RotateCcw aria-hidden="true" className="size-3.5" />
                            重试
                        </button>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
