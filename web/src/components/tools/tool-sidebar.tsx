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
    /** Kept for API compat: the reference layout lists every tool, grouped by hairline dividers. */
    activeCategory?: string;
    activeToolSlug?: string;
    supplementalLabel?: string;
    emptyLabel?: string;
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
 * Reference layout (linkfox tool page, 1908x781): flat list of every tool, 40px rows,
 * 16px labels starting 44px from the left edge (18px inset + 16px icon + 10px gap),
 * rgba(0,0,0,.6) text with the active row in brand purple #723CF9 and 1px #E6E6E7
 * dividers between groups — no group captions.
 */
export function ToolSidebar({ categories, activeToolSlug, supplementalLabel = "补充", emptyLabel = "该分类尚无已注册工具", onNavigate, className }: ToolSidebarProps) {
    return (
        <nav aria-label="工具" className={cn("flex h-full flex-col overflow-y-auto", className)}>
            {categories.map((category, index) => {
                return (
                    <div key={category.slug} className="min-w-0">
                        {index > 0 ? <div aria-hidden="true" className="my-2 h-px bg-hairline" /> : null}
                        <Link to={`/tools/${category.slug}`} onClick={onNavigate} className="sr-only">
                            {category.label}
                        </Link>
                        {category.tools.length > 0 ? (
                            <ul className="flex flex-col">
                                {category.tools.map((tool) => (
                                    <li key={tool.id} className="min-w-0">
                                        <NavLink
                                            to={`/tools/${category.slug}/${tool.slug}`}
                                            end
                                            onClick={onNavigate}
                                            data-tool-id={tool.id}
                                            data-active={tool.slug === activeToolSlug ? "true" : undefined}
                                            style={{ color: tool.slug === activeToolSlug ? "var(--brand)" : "rgba(0, 0, 0, 0.6)" }}
                                            className={cn(
                                                "flex h-10 items-center gap-2.5 pl-[18px] pr-3 text-base leading-5 transition-colors hover:opacity-80",
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
                                ))}
                            </ul>
                        ) : (
                            <p className="px-[18px] py-2 text-xs leading-5 text-black/45 dark:text-white/45">{emptyLabel}</p>
                        )}
                    </div>
                );
            })}
        </nav>
    );
}
