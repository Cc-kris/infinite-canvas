import {
    Accessibility,
    Crop,
    Eraser,
    Expand,
    Images,
    Languages,
    LayoutGrid,
    Maximize,
    PaintBucket,
    Palette,
    PenOff,
    Printer,
    Shirt,
    Sparkles,
    Type,
    Video,
    Wand,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
    /** When set, only this category's tools are listed (reference behaviour, verified live). */
    activeCategory?: string;
    activeToolSlug?: string;
    supplementalLabel?: string;
    emptyLabel?: string;
    disclaimerLabel?: string;
    onNavigate?: () => void;
    className?: string;
}

/**
 * Icon per tool id, mirroring the reference sidebar (16px line icons, 10px gap to label).
 * Unknown ids fall back to a neutral grid glyph so new tools never render icon-less.
 */
const TOOL_ICONS: Record<string, LucideIcon> = {
    PRODUCT_IMAGE_SUITE: LayoutGrid,
    DRESS_WEAR_SET: Shirt,
    CHANGE_COLOR_V2: Palette,
    IMAGE_TRANSLATION: Languages,
    SCALE_UP: Maximize,
    AI_OUTPAINTING: Expand,
    BACKGROUND_REMOVAL: Eraser,
    AI_TEXT: Type,
    AI_IMAGE_EDIT: Wand,
    CUTOUT: Crop,
    FILL: PaintBucket,
    RETOUCH: PenOff,
    TRY_ON: Accessibility,
    PRINT: Printer,
    GALLERY: Images,
    VIDEO_GENERATE: Video,
};

function ToolIcon({ id }: { id: string }) {
    const Icon = TOOL_ICONS[id] ?? Sparkles;
    return <Icon aria-hidden="true" className="size-4 shrink-0 text-current" strokeWidth={1.6} />;
}

/**
 * Canonical tool navigation. Width and scroll behaviour are owned by ToolShell so the
 * same markup can be reused inside the mobile drawer.
 *
 * Reference layout (linkfox tool page, 1908x781, verified live): the rail lists only the
 * tools of the active category — 40px rows, 16px labels starting 46px from the left edge
 * (18px inset + 16px icon + 10px gap), rgba(0,0,0,.6) text, active row in brand purple
 * #723CF9 over a rgba(141,52,249,.05) tint, 1px rgba(5,5,5,.06) dividers between groups
 * and a 12px #D0D2D6 「免责声明」 footer pinned to the bottom.
 */
export function ToolSidebar({
    categories,
    activeCategory,
    activeToolSlug,
    supplementalLabel = "补充",
    emptyLabel = "该分类尚无已注册工具",
    disclaimerLabel = "免责声明",
    onNavigate,
    className,
}: ToolSidebarProps) {
    // Reference behaviour: the rail is scoped to the active category. Fall back to the
    // full list only when the active category is unknown (e.g. legacy/unknown routes).
    const scoped = activeCategory ? categories.filter((category) => category.slug === activeCategory) : [];
    const visibleCategories = scoped.length > 0 ? scoped : categories;
    return (
        <nav aria-label="工具" className={cn("flex h-full flex-col overflow-y-auto", className)}>
            {visibleCategories.map((category, index) => {
                return (
                    <div key={category.slug} className="min-w-0">
                        {index > 0 ? <div aria-hidden="true" className="my-2 h-px bg-[rgba(5,5,5,0.06)] dark:bg-white/10" /> : null}
                        <Link to={`/tools/${category.slug}`} onClick={onNavigate} className="sr-only">
                            {category.label}
                        </Link>
                        {category.tools.length > 0 ? (
                            <ul className="flex flex-col">
                                {category.tools.map((tool) => {
                                    const active = tool.slug === activeToolSlug;
                                    return (
                                    <li key={tool.id} className="min-w-0">
                                        <NavLink
                                            to={`/tools/${category.slug}/${tool.slug}`}
                                            end
                                            onClick={onNavigate}
                                            data-tool-id={tool.id}
                                            data-active={active ? "true" : undefined}
                                            style={
                                                active
                                                    ? { color: "var(--brand)", backgroundColor: "rgba(141, 52, 249, 0.05)" }
                                                    : { color: "rgba(0, 0, 0, 0.6)" }
                                            }
                                            className={cn(
                                                "flex h-10 items-center gap-2.5 pl-[18px] pr-3 text-base leading-5 transition-colors hover:opacity-80 dark:text-white/60",
                                                tool.enabled === false && "opacity-60",
                                            )}
                                        >
                                            <ToolIcon id={tool.id} />
                                            <span className="truncate">{tool.title}</span>
                                            {tool.origin === "supplemental" ? (
                                                <span className="ml-auto shrink-0 rounded border border-hairline px-1 text-[10px] leading-4 text-black/45 dark:border-white/15 dark:text-white/45">
                                                    {supplementalLabel}
                                                </span>
                                            ) : null}
                                        </NavLink>
                                    </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <p className="px-[18px] py-2 text-xs leading-5 text-black/45 dark:text-white/45">{emptyLabel}</p>
                        )}
                    </div>
                );
            })}
            <div className="mt-auto select-none pb-3 pt-6 text-center text-xs leading-4 text-[#D0D2D6] dark:text-white/25">{disclaimerLabel}</div>
        </nav>
    );
}
