import { ChevronDown } from "lucide-react";
import { Drawer } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

import { getActiveCategorySlug, getCategoryMenuTools, navigationTools, resolveToolNavigation, toolNavigationCategories, type ToolCategorySlug, type ToolNavigationItem } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";

export type ToolsMobileNavigationProps = {
    /** Called after a link is activated so the host drawer can close itself. */
    onNavigate?: () => void;
    className?: string;
};

function ToolDrawerEntry({ item, withBatchMode, active, onSelect }: { item: ToolNavigationItem; withBatchMode: boolean; active: boolean; onSelect: () => void }) {
    const { t } = useTranslation();
    const Icon = item.icon;
    return (
        <Link
            to={withBatchMode ? `${item.route}?mode=batch` : item.route}
            onClick={onSelect}
            data-testid={`mobile-tools-nav-item-${item.id}`}
            data-active={active ? "true" : "false"}
            data-origin={item.origin}
            className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg border-l-[3px] px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-l-primary bg-accent font-medium text-accent-foreground" : "border-l-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
            )}
        >
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
            {withBatchMode && item.batchCapable ? <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground">{t("toolsNav.badges.batch")}</span> : null}
            {item.origin === "supplemental" ? (
                <span className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground" title={t("toolsNav.supplementalHint")}>
                    {t("toolsNav.badges.supplemental")}
                </span>
            ) : null}
        </Link>
    );
}

/**
 * Mobile content of the five-category navigation: every category is a collapsible group holding its
 * exact secondary entries (39 tools, plus the 12 batch references behind the batch entry).
 */
export function ToolsMobileNavigation({ onNavigate, className }: ToolsMobileNavigationProps) {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const activeCategorySlug = getActiveCategorySlug(pathname);
    const { tool: activeTool } = resolveToolNavigation(pathname);
    const [expanded, setExpanded] = useState<ToolCategorySlug[]>(() => (activeCategorySlug ? [activeCategorySlug] : ["ecommerce-suite"]));

    useEffect(() => {
        if (!activeCategorySlug) return;
        setExpanded((current) => (current.includes(activeCategorySlug) ? current : [...current, activeCategorySlug]));
    }, [activeCategorySlug]);

    const toggle = useCallback((slug: ToolCategorySlug) => {
        setExpanded((current) => (current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]));
    }, []);

    const workspaceLinks = useMemo(() => navigationTools.map((tool) => ({ ...tool, label: t(`navigation.${tool.slug}`) })), [t]);

    return (
        <div className={cn("flex min-h-0 flex-col gap-4", className)} data-testid="tools-nav-mobile">
            <section aria-label={t("toolsNav.primaryNav")} className="space-y-1">
                {toolNavigationCategories.map((category) => {
                    const Icon = category.icon;
                    const isExpanded = expanded.includes(category.slug);
                    const isActive = activeCategorySlug === category.slug;
                    const isBatch = category.slug === "batch-generate";
                    const entries = getCategoryMenuTools(category.slug);
                    const panelId = `mobile-tools-nav-panel-${category.slug}`;
                    return (
                        <div key={category.slug} className="rounded-xl border border-border">
                            <div className="flex items-center gap-1">
                                <Link
                                    to={category.route}
                                    onClick={() => onNavigate?.()}
                                    data-testid={`mobile-tools-nav-category-${category.slug}`}
                                    data-active={isActive ? "true" : "false"}
                                    className={cn(
                                        "flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-l-xl border-l-[3px] px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
                                        isActive ? "border-l-primary bg-accent font-medium text-accent-foreground" : "border-l-transparent text-foreground hover:bg-accent/60",
                                    )}
                                >
                                    <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                                    <span className="min-w-0 flex-1 truncate">{t(category.labelKey)}</span>
                                    <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{t("toolsNav.toolCount", { count: entries.length })}</span>
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => toggle(category.slug)}
                                    aria-expanded={isExpanded}
                                    aria-controls={panelId}
                                    aria-label={t(isExpanded ? "toolsNav.collapseCategory" : "toolsNav.expandCategory", { category: t(category.labelKey) })}
                                    data-testid={`mobile-tools-nav-toggle-${category.slug}`}
                                    className="mr-1 inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <ChevronDown className={cn("size-4 transition-transform", isExpanded && "rotate-180")} aria-hidden />
                                </button>
                            </div>
                            {isExpanded ? (
                                <div id={panelId} className="space-y-0.5 border-t border-border px-1.5 py-1.5">
                                    <p className="px-2 pb-1 pt-0.5 text-[12px] leading-4 text-muted-foreground">{t(category.descriptionKey)}</p>
                                    {entries.map((item) => (
                                        <ToolDrawerEntry key={`${item.id}-${isBatch ? "batch" : "tool"}`} item={item} withBatchMode={isBatch} active={!isBatch && activeTool?.id === item.id} onSelect={() => onNavigate?.()} />
                                    ))}
                                    {isBatch ? <p className="px-2 pb-1 pt-1 text-[12px] leading-4 text-muted-foreground">{t("toolsNav.batchHint")}</p> : null}
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </section>

            <section aria-label={t("toolsNav.workspaceNav")} className="space-y-1 border-t border-border pt-3">
                <h3 className="px-2 pb-1 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">{t("toolsNav.workspaceNav")}</h3>
                {workspaceLinks.map((tool) => {
                    const Icon = tool.icon;
                    const active = pathname === `/${tool.slug}` || pathname.startsWith(`/${tool.slug}/`);
                    return (
                        <Link
                            key={tool.slug}
                            to={`/${tool.slug}`}
                            onClick={() => onNavigate?.()}
                            data-testid={`mobile-workspace-link-${tool.slug}`}
                            className={cn(
                                "flex min-h-11 items-center gap-3 rounded-lg border-l-[3px] px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
                                active ? "border-l-primary bg-accent font-medium text-accent-foreground" : "border-l-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
                            )}
                        >
                            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="min-w-0 flex-1 truncate">{tool.label}</span>
                        </Link>
                    );
                })}
            </section>
        </div>
    );
}

export type MobileNavDrawerProps = {
    open: boolean;
    /** Kept for callers that still pass the previous application nav slug; the drawer derives the active state from the route. */
    activeToolSlug?: string;
    onClose: () => void;
};

export function MobileNavDrawer({ open, onClose }: MobileNavDrawerProps) {
    const { t } = useTranslation();

    return (
        <Drawer title={t("toolsNav.label")} placement="left" size={320} open={open} onClose={onClose} className="md:hidden" styles={{ body: { padding: 16 } }} data-testid="mobile-nav-drawer">
            <div id="mobile-tools-navigation">
                <ToolsMobileNavigation onNavigate={onClose} />
            </div>
        </Drawer>
    );
}
