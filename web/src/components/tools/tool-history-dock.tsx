import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Copy, Download, Film, FolderPlus, History, Loader2, RotateCcw, Send, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
import { useToolReplayStore } from "@/stores/use-tool-replay-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";

import { TaskStatusBadge } from "./task-status";
import { downloadResultItem, saveResultItemToAssets, sendResultItemToCanvas } from "./tool-result-actions";
import { formatTaskTime } from "./tool-task-history";

/**
 * B5｜共享「历史任务」面板（一次开发，所有工具页复用）。
 *
 * 边界（不编造）：
 * - 数据源只有 `useToolTaskStore`（应用自己落盘的真实任务快照，刷新后从 localStorage 恢复）；
 * - 显示的是任务本身（状态/时间/提示词/配置快照）与它真实带回来的结果项，不做「一键全部回填」；
 * - 「复用配置」只把该任务的配置快照复制成 JSON 交给用户，绝不冒充自动回填到表单；
 * - 字节已被持久化策略剥离的结果项只提示「原始文件未保留」，不画占位假图。
 */
export type ToolHistoryDockProps = {
    toolId: string;
    className?: string;
    limit?: number;
    /** 任务快照覆盖（测试/SSR 注入点）；生产路径不传，默认读 store。 */
    tasks?: Record<string, ToolTask>;
};

const CONFIG_LABELS: Record<string, string> = {
    capability: "能力",
    model: "模型",
    apiFormat: "接口格式",
    size: "尺寸",
    quality: "质量",
    count: "数量",
    aspectRatio: "比例",
    videoRatio: "视频比例",
    videoTime: "时长",
    videoSeconds: "时长",
    mode: "模式",
    unitCount: "单元数",
    planCount: "方案数",
};

function configEntries(snapshot: unknown): Array<{ key: string; label: string; value: string }> {
    if (!snapshot || typeof snapshot !== "object") return [];
    return Object.entries(snapshot as Record<string, unknown>)
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([key, value]) => ({
            key,
            label: CONFIG_LABELS[key] ?? key,
            value: typeof value === "object" ? JSON.stringify(value) : String(value),
        }));
}

function promptSummary(prompt: string): string {
    const text = (prompt ?? "").replace(/\s+/g, " ").trim();
    if (!text) return "（无提示词）";
    return text.length > 56 ? `${text.slice(0, 56)}…` : text;
}

function itemSource(item: ToolTaskResultItem): string | undefined {
    return item.dataUrl ?? item.url;
}

/** 剪贴板在非安全上下文/无权限时会抛错，退化成临时 textarea + execCommand。 */
async function copyText(text: string): Promise<void> {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "true");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    if (!ok) throw new Error("当前浏览器不允许写剪贴板");
}

type Feedback = { tone: "success" | "error"; text: string } | null;

export function ToolHistoryDock({ toolId, className, limit = 12, tasks: injectedTasks }: ToolHistoryDockProps) {
    const storeTasks = useToolTaskStore((state) => state.tasks);
    const hydrated = useToolTaskStore((state) => state.hydrated);
    const hydrate = useToolTaskStore((state) => state.hydrate);

    const tasks = injectedTasks ?? storeTasks;
    const requestReplay = useToolReplayStore((state) => state.requestReplay);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [pending, setPending] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<Feedback>(null);

    useEffect(() => {
        if (!injectedTasks && !hydrated) hydrate();
    }, [hydrated, hydrate, injectedTasks]);

    const rows = useMemo(
        () =>
            Object.values(tasks)
                .filter((task) => task.toolId === toolId)
                .sort((left, right) => right.createdAt - left.createdAt)
                .slice(0, limit),
        [tasks, toolId, limit],
    );

    const runAction = useCallback(
        async (key: string, action: () => Promise<string>) => {
            setPending(key);
            setFeedback(null);
            try {
                const text = await action();
                setFeedback({ tone: "success", text });
            } catch (error) {
                setFeedback({
                    tone: "error",
                    text: error instanceof Error ? error.message : String(error),
                });
            } finally {
                setPending(null);
            }
        },
        [],
    );

    return (
        <section
            className={cn("rounded-lg border border-border bg-card/40 p-3", className)}
            data-testid="tool-history-dock"
            data-tool-id={toolId}
        >
            <header className="mb-2 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                    <History aria-hidden="true" className="size-3.5" />
                    历史任务
                </span>
                <span className="text-[11px] text-muted-foreground" data-testid="tool-history-dock-count">
                    {rows.length} 条
                </span>
            </header>

            {rows.length === 0 ? (
                <p className="text-[11px] text-muted-foreground" data-testid="tool-history-dock-empty">
                    本工具还没有历史任务；提交一次后会在这里留下任务、配置与结果，刷新后仍在。
                </p>
            ) : (
                <ul className="space-y-2">
                    {rows.map((task) => {
                        const items = task.result?.items ?? [];
                        const thumbs = items.filter((item) => item.kind !== "video" && Boolean(item.url ?? item.dataUrl)).slice(0, 3);
                        const dropped = items.some((item) => item.payloadDropped);
                        const videoCount = items.filter((item) => item.kind === "video").length;
                        const expanded = expandedId === task.id;
                        const config = configEntries(task.configSnapshot);
                        return (
                            <li
                                key={task.id}
                                className="rounded-md border border-border/70 bg-background/60 p-2"
                                data-testid="tool-history-dock-item"
                                data-task-id={task.id}
                                data-task-status={task.status}
                            >
                                <button
                                    type="button"
                                    className="flex w-full items-start justify-between gap-2 text-left"
                                    onClick={() => setExpandedId(expanded ? null : task.id)}
                                    aria-expanded={expanded}
                                    data-testid="tool-history-dock-toggle"
                                >
                                    <span className="min-w-0">
                                        <span className="flex items-center gap-1.5">
                                            <span className="font-mono text-[11px] text-muted-foreground" data-testid="tool-history-dock-time">
                                                {formatTaskTime(task.createdAt)}
                                            </span>
                                            <TaskStatusBadge status={task.status} />
                                        </span>
                                        <span className="mt-1 block truncate text-[11px] text-foreground" title={task.prompt}>
                                            {promptSummary(task.prompt)}
                                        </span>
                                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground" data-testid="tool-history-dock-summary">
                                            {task.configSnapshot?.model || "未记录模型"} · {task.capability} · {items.length} 个结果
                                        </span>
                                    </span>
                                    <ChevronDown
                                        aria-hidden="true"
                                        className={cn("mt-0.5 size-3.5 shrink-0 text-muted-foreground transition", expanded && "rotate-180")}
                                    />
                                </button>

                                {thumbs.length > 0 ? (
                                    <div className="mt-1 flex items-center gap-1">
                                        {thumbs.map((item) => (
                                            <img
                                                key={item.id}
                                                src={item.url ?? item.dataUrl}
                                                alt="历史结果缩略图"
                                                className="size-10 rounded border border-border object-cover"
                                            />
                                        ))}
                                    </div>
                                ) : null}

                                {videoCount > 0 ? (
                                    <p className="mt-1 inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground" data-testid="tool-history-dock-video-badge">
                                        <Film aria-hidden="true" className="size-3" />
                                        视频结果 {videoCount} 个
                                    </p>
                                ) : null}

                                {/* 只有真正落盘了输入快照的任务才能回放（NEW_DESIGNER 这类无上游 provider 的工具）。 */}
                                {task.inputSnapshot ? (
                                    <button
                                        type="button"
                                        className="mt-1 inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-foreground transition hover:bg-accent"
                                        title="把这条任务落盘的画布输入送回工作台"
                                        onClick={() => {
                                            requestReplay({ toolId: task.toolId, taskId: task.id, snapshot: task.inputSnapshot as Record<string, unknown> });
                                            setFeedback({ tone: "success", text: `已把 ${formatTaskTime(task.createdAt)} 的画布送回工作台` });
                                        }}
                                        data-testid="tool-history-dock-replay"
                                    >
                                        <RotateCcw aria-hidden="true" className="size-3" />
                                        回放画布
                                    </button>
                                ) : null}

                                {dropped && thumbs.length === 0 ? (
                                    <p className="mt-1 text-[11px] text-amber-600" data-testid="tool-history-dock-payload-dropped">
                                        原始文件未保留（历史快照只存元数据），如需文件请重新生成。
                                    </p>
                                ) : null}

                                {expanded ? (
                                    <div className="mt-2 space-y-2 border-t border-border/60 pt-2" data-testid="tool-history-dock-detail">
                                        <div>
                                            <p className="text-[11px] font-medium text-foreground">配置快照（可复用）</p>
                                            <dl
                                                className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground"
                                                data-testid="tool-history-dock-config"
                                            >
                                                {config.length === 0 ? (
                                                    <dd className="col-span-2">该任务没有记录配置快照。</dd>
                                                ) : (
                                                    config.map((entry) => (
                                                        <div key={entry.key} className="min-w-0">
                                                            <dt className="inline text-muted-foreground">{entry.label}：</dt>
                                                            <dd className="inline truncate text-foreground" title={entry.value}>
                                                                {entry.value}
                                                            </dd>
                                                        </div>
                                                    ))
                                                )}
                                                {task.sourceAssetIds?.length ? (
                                                    <div className="col-span-2 min-w-0">
                                                        <dt className="inline text-muted-foreground">输入素材：</dt>
                                                        <dd className="inline text-foreground" data-testid="tool-history-dock-sources">
                                                            {task.sourceAssetIds.join(", ")}
                                                        </dd>
                                                    </div>
                                                ) : null}
                                            </dl>
                                            <button
                                                type="button"
                                                className="mt-1 inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] transition hover:bg-accent"
                                                onClick={() =>
                                                    runAction(`${task.id}:config`, async () => {
                                                        const payload = JSON.stringify(
                                                            {
                                                                toolId: task.toolId,
                                                                prompt: task.prompt,
                                                                configSnapshot: task.configSnapshot,
                                                                sourceAssetIds: task.sourceAssetIds ?? [],
                                                            },
                                                            null,
                                                            2,
                                                        );
                                                        await copyText(payload);
                                                        return "配置 JSON 已复制到剪贴板";
                                                    })
                                                }
                                                data-testid="tool-history-dock-copy-config"
                                            >
                                                <Copy aria-hidden="true" className="size-3" />
                                                复制配置 JSON
                                            </button>
                                        </div>

                                        <div>
                                            <p className="text-[11px] font-medium text-foreground">结果（{items.length}）</p>
                                            {items.length === 0 ? (
                                                <p className="text-[11px] text-muted-foreground" data-testid="tool-history-dock-no-result">
                                                    该任务没有结果项。
                                                </p>
                                            ) : (
                                                <ul className="mt-1 space-y-1">
                                                    {items.map((item, index) => {
                                                        const source = itemSource(item);
                                                        const actionKey = `${task.id}:${item.id}:${index}`;
                                                        return (
                                                            <li
                                                                key={item.id}
                                                                className="flex items-center gap-2"
                                                                data-testid="tool-history-dock-result"
                                                                data-result-id={item.id}
                                                            >
                                                                {item.kind === "video" && source ? (
                                                                    <video src={source} className="h-10 w-16 rounded border border-border object-cover" muted />
                                                                ) : source ? (
                                                                    <img src={source} alt="结果" className="size-10 rounded border border-border object-cover" />
                                                                ) : (
                                                                    <span className="inline-flex size-10 items-center justify-center rounded border border-dashed border-border text-[10px] text-muted-foreground">
                                                                        无字节
                                                                    </span>
                                                                )}
                                                                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground" title={item.id}>
                                                                    {item.id}
                                                                </span>
                                                                <span className="flex shrink-0 items-center gap-1">
                                                                    <button
                                                                        type="button"
                                                                        className="rounded border border-border p-1 transition hover:bg-accent disabled:opacity-40"
                                                                        title="下载"
                                                                        disabled={pending === `${actionKey}:download`}
                                                                        onClick={() =>
                                                                            runAction(`${actionKey}:download`, async () => {
                                                                                const name = await downloadResultItem(item, index, { toolId: task.toolId });
                                                                                return `已下载 ${name}`;
                                                                            })
                                                                        }
                                                                        data-testid="tool-history-dock-download"
                                                                    >
                                                                        <Download aria-hidden="true" className="size-3" />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="rounded border border-border p-1 transition hover:bg-accent disabled:opacity-40"
                                                                        title="存入资产"
                                                                        disabled={pending === `${actionKey}:save`}
                                                                        onClick={() =>
                                                                            runAction(`${actionKey}:save`, async () => {
                                                                                const saved = await saveResultItemToAssets(item, index, {
                                                                                    toolId: task.toolId,
                                                                                    taskId: task.id,
                                                                                });
                                                                                return `已存入资产库（${saved.kind} · ${saved.assetId}）`;
                                                                            })
                                                                        }
                                                                        data-testid="tool-history-dock-save"
                                                                    >
                                                                        <FolderPlus aria-hidden="true" className="size-3" />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="rounded border border-border p-1 transition hover:bg-accent disabled:opacity-40"
                                                                        title="发送到画布"
                                                                        disabled={pending === `${actionKey}:canvas`}
                                                                        onClick={() =>
                                                                            runAction(`${actionKey}:canvas`, async () => {
                                                                                const sent = await sendResultItemToCanvas(item, {
                                                                                    toolId: task.toolId,
                                                                                    projectTitle: `${task.toolId} 历史结果`,
                                                                                });
                                                                                return `已发送到画布（${sent.projectId} / ${sent.nodeId}）`;
                                                                            })
                                                                        }
                                                                        data-testid="tool-history-dock-canvas"
                                                                    >
                                                                        <Send aria-hidden="true" className="size-3" />
                                                                    </button>
                                                                </span>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            )}
                                        </div>

                                        {task.error ? (
                                            <p className="inline-flex items-start gap-1 text-[11px] text-red-600" data-testid="tool-history-dock-error">
                                                <TriangleAlert aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
                                                {task.error.message}
                                            </p>
                                        ) : null}
                                    </div>
                                ) : null}

                                {expanded && pending ? (
                                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                        <Loader2 aria-hidden="true" className="size-3 animate-spin" />
                                        处理中…
                                    </p>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            )}

            {feedback ? (
                <p
                    className={cn("mt-2 text-[11px]", feedback.tone === "error" ? "text-red-600" : "text-emerald-600")}
                    data-testid="tool-history-dock-feedback"
                    data-tone={feedback.tone}
                >
                    {feedback.text}
                </p>
            ) : null}
        </section>
    );
}

export default ToolHistoryDock;
