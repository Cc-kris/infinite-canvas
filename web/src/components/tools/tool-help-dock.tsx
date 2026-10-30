import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * 工具页右下角常驻客服浮窗（原站 linkfox.com/draw/* 的「操作咨询 / 产品教程 / 需要协助吗？」面板）。
 *
 * 原站实测：位于视口右侧固定位置，整体约 101×90，包含两个入口按钮与一张咨询卡。
 * 这里按同样的文案与层级还原，点击后展开对应面板，保证入口真实可点（不是死按钮）。
 */
const CONSULT_ITEMS = [
    {
        key: "consult",
        label: "操作咨询",
        title: "操作咨询",
        body: "选择要咨询的工具，客服会带着该工具的操作步骤联系你。",
    },
    {
        key: "tutorial",
        label: "产品教程",
        title: "产品教程",
        body: "从上传素材到生成结果，每个工具都有分步教程与示例。",
    },
] as const;

export function ToolHelpDock({ className }: { className?: string }) {
    const [openKey, setOpenKey] = useState<string | null>(null);
    const active = CONSULT_ITEMS.find((item) => item.key === openKey) ?? null;

    return (
        <div className={cn("fixed bottom-6 right-2 z-40 flex w-[101px] flex-col items-stretch gap-1", className)} data-testid="tool-help-dock">
            {active ? (
                <div role="dialog" aria-label={active.title} className="absolute bottom-0 right-[calc(100%+8px)] w-[240px] rounded-xl border border-hairline bg-surface p-3 shadow-lg">
                    <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{active.title}</span>
                        <button type="button" onClick={() => setOpenKey(null)} className="rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                            关闭
                        </button>
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground">{active.body}</p>
                </div>
            ) : null}

            {CONSULT_ITEMS.map((item) => (
                <button
                    key={item.key}
                    type="button"
                    aria-expanded={openKey === item.key}
                    onClick={() => setOpenKey((prev) => (prev === item.key ? null : item.key))}
                    className={cn(
                        "rounded-lg border border-hairline bg-surface px-2 py-1.5 text-xs leading-5 text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        openKey === item.key ? "bg-accent text-accent-foreground" : "",
                    )}
                >
                    {item.label}
                </button>
            ))}

            <button
                type="button"
                onClick={() => setOpenKey((prev) => (prev === "help" ? null : "help"))}
                aria-expanded={openKey === "help"}
                className="rounded-lg border border-hairline bg-surface px-2 py-1.5 text-left text-xs leading-4 text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <span className="block">需要协助吗？</span>
                <span className="block">点击此处咨询</span>
                <span className="block">客服，快速解决问题！</span>
            </button>
        </div>
    );
}
