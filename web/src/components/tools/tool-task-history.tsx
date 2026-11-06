import { useEffect, useMemo } from "react";
import { History } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
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
     * 即使任务没有可复用结果也允许选中（此时按钮文案是「回填表单」）。
     * 默认关闭：只有明确要在工作区里把历史参数还原成表单的工具才打开。
     */
    selectWithoutResult?: boolean;
    /** 空态极简：不渲染「N 条」计数与空态提示（原站这两个工具的历史区空态无文案）。默认关闭。 */
    minimalEmpty?: boolean;
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

/**
 * 结果项「可定位」判定：url 是当前可渲染地址，storageKey 是磁盘定位符（刷新后由 store 还原 url）。
 *
 * 旧实现只看 url：刷新后 url 被剥离、只剩 storageKey 的健康任务会被历史坞误判成
 * 「原始文件未保留」，不给「查看结果」入口 → 下载/存资产/发画布三动作在历史里不可达
 * （CHANGE_COLOR_V2 旧任务 BLOCKED_NO_LOCATOR 的直接原因之一）。
 */
function hasResultLocator(item: ToolTaskResultItem): boolean {
    return Boolean(item.url || item.storageKey);
}

function taskHasRecoverableResult(task: ToolTask): boolean {
    return Boolean(task.result?.items.some(hasResultLocator));
}

export function ToolTaskHistory({ toolId, className, limit = 8, onSelectTask, emptyHint, selectWithoutResult = false, minimalEmpty = false, tasks: injectedTasks }: ToolTaskHistoryProps) {
    const { t } = useTranslation();
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
                    {t("toolChrome.historyTitle")}
                </span>
                {minimalEmpty && rows.length === 0 ? null : (
                    <span className="text-[11px] text-muted-foreground" data-testid="tool-task-history-count">
                        {t("toolChrome.historyCount", { count: rows.length })}
                    </span>
                )}
            </div>

            {rows.length === 0 ? (
                minimalEmpty ? null : (
                    <p className="text-[11px] text-muted-foreground" data-testid="tool-task-history-empty">
                        {emptyHint ?? t("toolChrome.historyEmpty")}
                    </p>
                )
            ) : (
                <ul className="space-y-2">
                    {rows.map((task) => {
                        const items = task.result?.items ?? [];
                        const thumbs = items.filter((item) => Boolean(item.url)).slice(0, 3);
                        const dropped = items.some((item) => item.payloadDropped && !hasResultLocator(item));
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
                                    {promptSummary(task.prompt) || t("toolChrome.historyNoPrompt")}
                                </p>
                                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                    {task.configSnapshot?.model || t("toolChrome.historyNoModel")} · {task.capability} ·{" "}
                                    {t("toolChrome.historyResults", { count: items.length })}
                                </p>
                                {task.error && (task.status === "failed" || task.status === "unknown") ? (
                                    <p
                                        className={cn(
                                            "mt-1 text-[11px]",
                                            task.status === "unknown" ? "text-amber-600 dark:text-amber-400" : "text-destructive",
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
                                    <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400" data-testid="tool-task-history-payload-dropped">
                                        {t("toolChrome.historyDropped")}
                                    </p>
                                ) : null}
                                {onSelectTask && (selectWithoutResult || taskHasRecoverableResult(task)) ? (
                                    <button
                                        type="button"
                                        className="mt-1 rounded border border-border px-2 py-0.5 text-[11px] transition hover:bg-accent"
                                        onClick={() => onSelectTask(task)}
                                        data-testid="tool-task-history-open"
                                    >
                                        {taskHasRecoverableResult(task)
                                            ? t("toolChrome.historyView")
                                            : t("toolChrome.historyRefill")}
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
