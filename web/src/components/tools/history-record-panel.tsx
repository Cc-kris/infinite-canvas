import { useEffect, useState } from "react";
import { History, X } from "lucide-react";

import { ToolHistoryDock } from "@/components/tools/tool-history-dock";
import { cn } from "@/lib/utils";

/**
 * 原站「历史记录」弹窗里的作图分组（工单 cw2 A 项，逐字照抄）。
 * 这三个分组在原站是「素材和灵感」族里的工具入口；本地暂无独立页，
 * 因此这里只做「按分组看历史任务」的切换，不伪造跳转。
 */
export const HISTORY_RECORD_GROUPS = ["场景素材", "相似图裂变", "AI自由绘图"] as const;

export type HistoryRecordGroup = (typeof HISTORY_RECORD_GROUPS)[number];

export type HistoryRecordPanelProps = {
    open: boolean;
    /** 当前工具 id：底部展示本工具的真实历史任务。 */
    toolId: string;
    /** 当前工具名（用于本工具历史分组的标题）。 */
    toolLabel?: string;
    onClose: () => void;
};

/**
 * 历史记录弹窗：左侧作图分组（场景素材 / 相似图裂变 / AI自由绘图），
 * 右侧为该分组的历史任务 + 本工具历史任务，全部来自共享 `ToolHistoryDock`
 * （数据源是落盘的真实任务快照，没有记录就显示空态，不画假图）。
 */
export function HistoryRecordPanel({ open, toolId, toolLabel = "素材贴合", onClose }: HistoryRecordPanelProps) {
    const [group, setGroup] = useState<HistoryRecordGroup>(HISTORY_RECORD_GROUPS[0]);

    useEffect(() => {
        if (!open) return;
        setGroup(HISTORY_RECORD_GROUPS[0]);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="历史记录"
                data-testid="history-record-panel"
                className="flex max-h-[86vh] w-full max-w-[720px] flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_12px_48px_rgba(0,0,0,0.18)]"
            >
                <header className="flex h-[46px] shrink-0 items-center justify-between border-b border-border px-[14px]">
                    <span className="inline-flex items-center gap-1.5 text-[14px] font-medium leading-[22px] text-foreground">
                        <History className="size-4 text-muted-foreground" aria-hidden="true" />
                        历史记录
                    </span>
                    <button
                        type="button"
                        aria-label="关闭"
                        data-testid="history-panel-close"
                        onClick={onClose}
                        className="flex size-6 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                        <X className="size-4" aria-hidden="true" />
                    </button>
                </header>

                <div className="flex min-h-0 flex-1">
                    <div className="flex w-[148px] shrink-0 flex-col gap-1 border-r border-border p-[10px]" role="tablist" aria-label="作图分组">
                        {HISTORY_RECORD_GROUPS.map((item) => {
                            const active = group === item;
                            return (
                                <button
                                    key={item}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    data-testid={`history-group-${item}`}
                                    onClick={() => setGroup(item)}
                                    className={cn(
                                        "flex h-[32px] items-center rounded-md px-2 text-left text-[13px] leading-[20px] transition-colors",
                                        active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                    )}
                                >
                                    {item}
                                </button>
                            );
                        })}
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-[10px]">
                        <p className="mb-2 text-[12px] leading-[18px] text-muted-foreground">{group} · 历史任务</p>
                        <ToolHistoryDock toolId={`history-group:${group}`} limit={5} />
                        <div className="my-3 h-px w-full bg-border" />
                        <p className="mb-2 text-[12px] leading-[18px] text-muted-foreground">{toolLabel} · 历史任务</p>
                        <ToolHistoryDock toolId={toolId} limit={5} />
                    </div>
                </div>
            </div>
        </div>
    );
}
