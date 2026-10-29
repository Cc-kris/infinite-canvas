import { useEffect, useMemo } from "react";
import { History } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { useToolTaskStore } from "@/stores/use-tool-task-store";

import { TaskStatusBadge } from "./task-status";

/**
 * 工具「历史记录」：把本工具落盘过的任务（localStorage 快照）列出来。
 *
 * 边界（不编造）：
 * - 数据源只有 `useToolTaskStore`（真实任务快照，hydrate 来自 localStorage）；
 * - 二进制被持久化剥离的结果项只显示「原始文件未保留」，不画占位假图；
 * - 需要真实文件时点「查看结果」，交给工作区的真实结果区（能从 URL 取回字节就取回）。
 */
export type ToolTaskHistoryProps = {
    toolId: string;
    className?: string;
    limit?: number;
    /** 选中某条历史任务 → 交给工作区结果区展示真实结果。 */
    onSelectTask?: (task: ToolTask) => void;
    emptyHint?: string;
    /**
     * 任务快照来源覆盖。默认读 `useToolTaskStore`；批量任务页等可以把已经拿到的
     * 快照直接传进来（也让本组件能在 SSR/测试里被确定性渲染）。
     */
    tasks?: Record<string, ToolTask>;
};

function pad2(value: number): string {
    return String(value).padStart(2, "0");
}

/** 固定格式（不依赖运行环境 locale），便于测试与截图比对。 */
export function formatTaskTime(timestamp?: number): string {
    if (!timestamp || !Number.isFinite(timestamp)) return "—";
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function promptSummary(prompt: string): string {
    const text = (prompt ?? "").replace(/\s+/g, " ").trim();
    if (!text) return "（无提示词）";
    return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

function taskHasRecoverableResult(task: ToolTask): boolean {
    return Boolean(task.result?.items.some((item) => Boolean(item.url)));
}

export function ToolTaskHistory({ toolId, className, limit = 8, onSelectTask, emptyHint, tasks: injectedTasks }: ToolTaskHistoryProps) {
    const storeTasks = useToolTaskStore((state) => state.tasks);
    const tasks = injectedTasks ?? storeTasks;
    const hydrated = useToolTaskStore((state) => state.hydrated);
    const hydrate = useToolTaskStore((state) => state.hydrate);

    useEffect(() => {
        if (!hydrated) hydrate();
    }, [hydrated, hydrate]);

    const rows = useMemo(
        () =>
            Object.values(tasks)
                .filter((task) => task.toolId === toolId)
                .sort((left, right) => right.createdAt - left.createdAt)
                .slice(0, limit),
        [tasks, toolId, limit],
    );

    return (
        <div className={cn("rounded-lg border border-border bg-card/40 p-3", className)} data-testid="tool-task-history">
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                    <History aria-hidden="true" className="size-3.5" />
                    历史记录
                </span>
                <span className="text-[11px] text-muted-foreground" data-testid="tool-task-history-count">
                    {rows.length} 条
                </span>
            </div>

            {rows.length === 0 ? (
                <p className="text-[11px] text-muted-foreground" data-testid="tool-task-history-empty">
                    {emptyHint ?? "本工具还没有历史任务；提交一次后会在这里留下记录。"}
                </p>
            ) : (
                <ul className="space-y-2">
                    {rows.map((task) => {
                        const items = task.result?.items ?? [];
                        const thumbs = items.filter((item) => Boolean(item.url)).slice(0, 3);
                        const dropped = items.some((item) => item.payloadDropped);
                        return (
                            <li
                                key={task.id}
                                className="rounded-md border border-border/70 bg-background/60 p-2"
                                data-testid="tool-task-history-item"
                                data-task-id={task.id}
                                data-task-status={task.status}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-mono text-[11px] text-muted-foreground" data-testid="tool-task-history-time">
                                        {formatTaskTime(task.createdAt)}
                                    </span>
                                    <TaskStatusBadge status={task.status} />
                                </div>
                                <p className="mt-1 truncate text-[11px] text-foreground" title={task.prompt}>
                                    {promptSummary(task.prompt)}
                                </p>
                                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                    {task.configSnapshot?.model || "未记录模型"} · {task.capability} · {items.length} 个结果
                                </p>
                                {task.error && (task.status === "failed" || task.status === "unknown") ? (
                                    <p
                                        className={cn(
                                            "mt-1 text-[11px]",
                                            task.status === "unknown" ? "text-amber-600" : "text-red-600",
                                        )}
                                        data-testid="tool-task-history-error"
                                    >
                                        {task.error.message}
                                    </p>
                                ) : null}
                                {thumbs.length > 0 ? (
                                    <div className="mt-1 flex items-center gap-1">
                                        {thumbs.map((item) => (
                                            <img
                                                key={item.id}
                                                src={item.url}
                                                alt="历史结果缩略图"
                                                className="size-10 rounded border border-border object-cover"
                                            />
                                        ))}
                                    </div>
                                ) : null}
                                {dropped && thumbs.length === 0 ? (
                                    <p className="mt-1 text-[11px] text-amber-600" data-testid="tool-task-history-payload-dropped">
                                        原始文件未保留（历史快照只存元数据），如需文件请重新生成。
                                    </p>
                                ) : null}
                                {onSelectTask && taskHasRecoverableResult(task) ? (
                                    <button
                                        type="button"
                                        className="mt-1 rounded border border-border px-2 py-0.5 text-[11px] transition hover:bg-accent"
                                        onClick={() => onSelectTask(task)}
                                        data-testid="tool-task-history-open"
                                    >
                                        查看结果
                                    </button>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
