import { Link, NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

export interface ToolSidebarTool {
    id: string;
    slug: string;
    title: string;
    origin?: "original" | "supplemental";
    enabled?: boolean;
}

export interface ToolSidebarCategory {
    slug: string;
    label: string;
    tools: ToolSidebarTool[];
}

export interface ToolSidebarProps {
    categories: ToolSidebarCategory[];
    activeCategory: string;
    activeToolSlug?: string;
    supplementalLabel?: string;
    emptyLabel?: string;
    onNavigate?: () => void;
    className?: string;
}

/**
 * Canonical tool navigation. Width and scroll behaviour are owned by ToolShell so the
 * same markup can be reused inside the mobile drawer.
 */
export function ToolSidebar({ categories, activeCategory, activeToolSlug, supplementalLabel = "补充", emptyLabel = "该分类尚无已注册工具", onNavigate, className }: ToolSidebarProps) {
    return (
        <nav aria-label="工具" className={cn("flex h-full flex-col gap-5 overflow-y-auto px-2 py-3", className)}>
            {categories.map((category) => {
                const isActiveCategory = category.slug === activeCategory;
                return (
                    <div key={category.slug} className="min-w-0">
                        <Link
                            to={`/tools/${category.slug}`}
                            onClick={onNavigate}
                            className={cn(
                                "flex h-8 items-center gap-2 rounded-md px-2 text-xs font-medium uppercase tracking-wide transition",
                                isActiveCategory ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            <span className="truncate">{category.label}</span>
                            <span className="ml-auto shrink-0 tabular-nums text-[11px] text-muted-foreground">{category.tools.length}</span>
                        </Link>
                        {isActiveCategory ? (
                            category.tools.length > 0 ? (
                                <ul className="mt-1 flex flex-col gap-0.5">
                                    {category.tools.map((tool) => (
                                        <li key={tool.id} className="min-w-0">
                                            <NavLink
                                                to={`/tools/${category.slug}/${tool.slug}`}
                                                end
                                                onClick={onNavigate}
                                                data-tool-id={tool.id}
                                                data-active={tool.slug === activeToolSlug ? "true" : undefined}
                                                className={({ isActive }) =>
                                                    cn(
                                                        "flex h-9 items-center gap-2 rounded-md border-l-[3px] px-2 text-sm transition",
                                                        isActive
                                                            ? "border-primary bg-accent font-medium text-foreground"
                                                            : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                                                        tool.enabled === false && "opacity-60",
                                                    )
                                                }
                                            >
                                                <span className="truncate">{tool.title}</span>
                                                {tool.origin === "supplemental" ? (
                                                    <span className="ml-auto shrink-0 rounded border border-border px-1 text-[10px] leading-4 text-muted-foreground">{supplementalLabel}</span>
                                                ) : null}
                                            </NavLink>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="mt-1 px-2 text-xs leading-5 text-muted-foreground">{emptyLabel}</p>
                            )
                        ) : null}
                    </div>
                );
            })}
        </nav>
    );
}
