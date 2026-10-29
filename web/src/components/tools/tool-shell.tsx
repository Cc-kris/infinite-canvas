import { PanelLeft } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface ToolShellProps {
    title: string;
    subtitle?: string;
    badges?: ReactNode;
    breadcrumb?: ReactNode;
    actions?: ReactNode;
    notices?: ReactNode;
    /** Rendered at 180px on >=1024px and inside the drawer below that breakpoint. */
    sidebar: ReactNode;
    children: ReactNode;
    sidebarLabel?: string;
    /**
     * 原站工具页没有标题栏/面包屑：表单列直接从页面顶部开始。
     * immersive 时不渲染 header，侧栏仍在，工作台区域撑满高度且去掉外框内边距。
     */
    immersive?: boolean;
    className?: string;
}

/** 标记"当前已在 ToolShell 内"，用于识别工作台内再包一层外壳的写法。 */
const NestedToolShellContext = createContext(false);

/**
 * Shared frame for every canonical tool route: 180px tool sidebar on the left,
 * tool workspace on the right. Below lg the sidebar collapses into a drawer and the
 * workspace keeps the full width so mobile users never get an unusable sliver.
 *
 * 工作台内部若再渲染一次 ToolShell，只保留紧凑标题栏（标题/徽标/操作按钮），
 * 不再挂第二个侧栏与第二个抽屉入口——否则每个工具页都会出现两份
 * `[data-testid=tool-sidebar]`、两个"打开工具列表"按钮。
 */
export function ToolShell({ title, subtitle, badges, breadcrumb, actions, notices, sidebar, children, sidebarLabel = "工具", immersive = false, className }: ToolShellProps) {
    const [navigationOpen, setNavigationOpen] = useState(false);
    const nested = useContext(NestedToolShellContext);

    if (nested) {
        return (
            <div data-testid="tool-workspace-chrome" className={cn("flex min-h-0 min-w-0 flex-1 flex-col gap-3", className)}>
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                            <h2 className="truncate text-sm font-semibold leading-6">{title}</h2>
                            {badges}
                        </div>
                        {subtitle ? <p className="truncate text-xs leading-5 text-muted-foreground">{subtitle}</p> : null}
                    </div>
                    {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
                </div>
                {notices}
                {children}
            </div>
        );
    }

    return (
        <NestedToolShellContext.Provider value={true}>
        <div className={cn("flex h-full min-h-0 flex-col bg-canvas text-foreground", className)}>
            <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3 lg:hidden">
                <button
                    type="button"
                    data-testid="tool-shell-nav-trigger"
                    onClick={() => setNavigationOpen(true)}
                    aria-label={`打开${sidebarLabel}列表`}
                    aria-expanded={navigationOpen}
                    className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <PanelLeft className="size-4" />
                </button>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
                <div className="flex shrink-0 items-center gap-2">{actions}</div>
            </div>

            <div className="flex min-h-0 flex-1">
                <aside data-testid="tool-sidebar" aria-label={`${sidebarLabel}侧栏`} className="hidden w-[180px] shrink-0 overflow-y-auto border-r border-hairline bg-surface lg:block">
                    {sidebar}
                </aside>

                <div className="flex min-w-0 flex-1 flex-col">
                    {immersive ? null : (
                    <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b border-border px-5 py-2">
                        <div className="min-w-0 flex-1">
                            {breadcrumb ? <div className="truncate text-xs leading-5 text-muted-foreground">{breadcrumb}</div> : null}
                            <div className="flex min-w-0 items-center gap-2">
                                <h1 className="truncate text-base font-medium leading-6">{title}</h1>
                                {badges}
                            </div>
                            {subtitle ? <p className="truncate text-xs leading-5 text-muted-foreground">{subtitle}</p> : null}
                        </div>
                        {actions ? <div className="hidden shrink-0 items-center gap-2 lg:flex">{actions}</div> : null}
                    </header>
                    )}

                    {immersive ? null : notices}

                    <main className={cn("min-h-0 flex-1", immersive ? "overflow-hidden bg-canvas p-2.5" : "overflow-y-auto bg-canvas px-5 py-4")}>{children}</main>
                </div>
            </div>

            {navigationOpen ? (
                <div className="fixed inset-0 z-50 flex lg:hidden">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setNavigationOpen(false)} aria-hidden="true" />
                    <div role="dialog" aria-modal="true" aria-label={sidebarLabel} className="relative z-10 flex h-full w-[260px] max-w-[85vw] flex-col border-r border-hairline bg-surface shadow-lg">
                        <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
                            <span className="text-sm font-medium">{sidebarLabel}</span>
                            <button
                                type="button"
                                onClick={() => setNavigationOpen(false)}
                                className="rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                关闭
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto" onClick={() => setNavigationOpen(false)}>
                            {sidebar}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
        </NestedToolShellContext.Provider>
    );
}
