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

import { useTranslation } from "react-i18next";

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
 * Visual language follows the Infinite Canvas design system: the rail lists the tools of the
 * active category as rounded rows (40px) with muted labels, an accent hover surface and an
 * accent-filled active row, grouped by hairline dividers, with a muted 「免责声明」 footer
 * pinned to the bottom.
 */
export function ToolSidebar({
    categories,
    activeCategory,
    activeToolSlug,
    supplementalLabel,
    emptyLabel,
    disclaimerLabel,
    onNavigate,
    className,
}: ToolSidebarProps) {
    const { t } = useTranslation();
    // Reference behaviour: the rail is scoped to the active category. Fall back to the
    // full list only when the active category is unknown (e.g. legacy/unknown routes).
    const scoped = activeCategory ? categories.filter((category) => category.slug === activeCategory) : [];
    const visibleCategories = scoped.length > 0 ? scoped : categories;
    return (
        <nav aria-label="工具" className={cn("flex h-full flex-col overflow-y-auto", className)}>
            {visibleCategories.map((category, index) => {
                return (
                    <div key={category.slug} className="min-w-0 px-2">
                        {index > 0 ? <div aria-hidden="true" className="my-1.5 h-px bg-hairline" /> : null}
                        <Link to={`/tools/${category.slug}`} onClick={onNavigate} className="sr-only">
                            {category.label}
                        </Link>
                        {category.tools.length > 0 ? (
                            <ul className="flex flex-col gap-0.5 py-1">
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
                                            className={cn(
                                                "flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm leading-5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                                                active
                                                    ? "bg-accent font-medium text-accent-foreground"
                                                    : "text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground",
                                                tool.enabled === false && "opacity-60",
                                            )}
                                        >
                                            <ToolIcon id={tool.id} />
                                            <span className="truncate">{tool.title}</span>
                                            {tool.origin === "supplemental" ? (
                                                <span className="ml-auto shrink-0 rounded border border-hairline px-1 text-[10px] leading-4 text-muted-foreground">
                                                    {supplementalLabel ?? t("toolsNav.badges.supplemental")}
                                                </span>
                                            ) : null}
                                        </NavLink>
                                    </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <p className="px-2.5 py-2 text-xs leading-5 text-muted-foreground">{emptyLabel ?? t("toolsNav.emptyCategory", { defaultValue: "该分类尚无已注册工具" })}</p>
                        )}
                    </div>
                );
            })}
            {/* 原站 rail 底部固定「免责声明」入口；本地保留同名说明位，不链接站外。 */}
            <p className="mt-auto px-2 py-3 text-[11px] leading-4 text-muted-foreground">免责声明</p>
        </nav>
    );
}
