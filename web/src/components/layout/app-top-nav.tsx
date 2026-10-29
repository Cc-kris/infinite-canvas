import { Bot, Menu } from "lucide-react";
import { Tooltip } from "antd";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

import { AppConfigModal } from "@/components/layout/app-config-modal";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { getActiveCategorySlug, getCategoryMenuTools, getToolNavigationCategory, navigationTools, resolveToolNavigation, toolNavigationCategories, type ToolCategorySlug, type ToolNavigationItem } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/use-agent-store";

const HOVER_OPEN_DELAY = 90;
const HOVER_CLOSE_DELAY = 160;

type PendingFocus = "first" | "last" | null;

function categoryTriggerId(prefix: string, slug: ToolCategorySlug) {
    return `${prefix}-trigger-${slug}`;
}

function categoryMenuId(prefix: string, slug: ToolCategorySlug) {
    return `${prefix}-menu-${slug}`;
}

export type ToolsPrimaryNavigationProps = {
    className?: string;
    /** Called after a secondary menu entry is activated (used by the drawer/mobile shell to close itself). */
    onNavigate?: () => void;
};

/**
 * Five primary categories with their 39-tool secondary menus.
 *
 * Behaviour (docs/V1.0/plan_linkfox_navigation/prd.md §3, ui_brief.md §6):
 * - primary click enters the category entry route, hover/focus opens the secondary menu;
 * - secondary entries navigate to `/tools/:category/:toolId`;
 * - ArrowDown/ArrowUp open the menu and move through entries, Home/End jump, Esc closes and returns focus to the trigger, Tab closes;
 * - clicking outside closes the menu.
 */
export function ToolsPrimaryNavigation({ className, onNavigate }: ToolsPrimaryNavigationProps) {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const idPrefix = useId();
    const activeCategorySlug = getActiveCategorySlug(pathname);
    const { tool: activeTool } = resolveToolNavigation(pathname);

    const [openSlug, setOpenSlug] = useState<ToolCategorySlug | null>(null);
    const [focusTick, setFocusTick] = useState(0);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const triggerRefs = useRef(new Map<ToolCategorySlug, HTMLAnchorElement>());
    const menuRefs = useRef(new Map<ToolCategorySlug, HTMLDivElement>());
    const openSlugRef = useRef<ToolCategorySlug | null>(null);
    const pendingFocusRef = useRef<PendingFocus>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearTimer = useCallback(() => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const openMenu = useCallback(
        (slug: ToolCategorySlug, focus: PendingFocus = null) => {
            clearTimer();
            pendingFocusRef.current = focus;
            setOpenSlug(slug);
            if (focus) setFocusTick((tick) => tick + 1);
        },
        [clearTimer],
    );

    const scheduleClose = useCallback(() => {
        clearTimer();
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            setOpenSlug(null);
        }, HOVER_CLOSE_DELAY);
    }, [clearTimer]);

    const closeMenu = useCallback(
        (restoreFocus = false) => {
            clearTimer();
            const current = openSlugRef.current;
            if (restoreFocus && current) triggerRefs.current.get(current)?.focus();
            setOpenSlug(null);
        },
        [clearTimer],
    );

    useEffect(() => {
        openSlugRef.current = openSlug;
    }, [openSlug]);

    useEffect(() => () => clearTimer(), [clearTimer]);

    // Focus the first/last secondary entry after a keyboard-initiated open.
    useEffect(() => {
        if (!openSlug) return;
        const focus = pendingFocusRef.current;
        pendingFocusRef.current = null;
        if (!focus) return;
        const menu = menuRefs.current.get(openSlug);
        const entries = menu ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
        if (!entries.length) return;
        (focus === "last" ? entries[entries.length - 1] : entries[0]).focus();
    }, [openSlug, focusTick]);

    // Click-outside and global Escape while a secondary menu is open.
    useEffect(() => {
        if (!openSlug) return;
        const handlePointerDown = (event: PointerEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) setOpenSlug(null);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") closeMenu(true);
        };
        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [closeMenu, openSlug]);

    // Route changes never keep a stale open menu behind.
    useEffect(() => {
        setOpenSlug(null);
    }, [pathname]);

    const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLAnchorElement>, slug: ToolCategorySlug) => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            openMenu(slug, "first");
            return;
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            openMenu(slug, "last");
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            closeMenu(true);
        }
    };

    const handleEntryKeyDown = (event: React.KeyboardEvent<HTMLElement>, slug: ToolCategorySlug) => {
        const menu = menuRefs.current.get(slug);
        const entries = menu ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
        if (!entries.length) return;
        const index = entries.indexOf(event.currentTarget);
        if (event.key === "ArrowDown") {
            event.preventDefault();
            entries[(index + 1) % entries.length]?.focus();
            return;
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            entries[(index - 1 + entries.length) % entries.length]?.focus();
            return;
        }
        if (event.key === "Home") {
            event.preventDefault();
            entries[0]?.focus();
            return;
        }
        if (event.key === "End") {
            event.preventDefault();
            entries[entries.length - 1]?.focus();
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            closeMenu(true);
            return;
        }
        if (event.key === "Tab") {
            setOpenSlug(null);
        }
    };

    return (
        <div
            ref={containerRef}
            className={cn("relative flex h-full items-stretch", className)}
            data-testid="tools-nav-primary"
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpenSlug(null);
            }}
        >
            <nav aria-label={t("toolsNav.primaryNav")} className="hide-scrollbar flex h-full min-w-0 items-center gap-1 overflow-x-auto">
                {/* 原站实测：所有主项之前有独立「首页」链接（x=234/宽 32/16px/与主项同为 30px 间距） */}
                <Link
                    to="/"
                    data-testid="tools-nav-trigger-home"
                    aria-current={pathname === "/" ? "page" : undefined}
                    data-active={pathname === "/" ? "true" : "false"}
                    className={cn(
                        "relative flex h-9 shrink-0 items-center rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                        pathname === "/" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                >
                    {t("toolsNav.home")}
                </Link>
                {toolNavigationCategories.map((category) => {
                    const Icon = category.icon;
                    const isOpen = openSlug === category.slug;
                    const isActive = activeCategorySlug === category.slug;
                    const entries = getCategoryMenuTools(category.slug);
                    const isBatch = category.slug === "batch-generate";
                    return (
                        <div key={category.slug} className="relative flex h-full items-center" onMouseEnter={() => openMenu(category.slug)} onMouseLeave={scheduleClose}>
                            <Link
                                ref={(node) => {
                                    if (node) triggerRefs.current.set(category.slug, node);
                                    else triggerRefs.current.delete(category.slug);
                                }}
                                to={category.route}
                                id={categoryTriggerId(idPrefix, category.slug)}
                                aria-haspopup="menu"
                                aria-expanded={isOpen}
                                aria-controls={categoryMenuId(idPrefix, category.slug)}
                                aria-current={isActive ? "page" : undefined}
                                data-testid={`tools-nav-trigger-${category.slug}`}
                                data-active={isActive ? "true" : "false"}
                                onFocus={() => openMenu(category.slug)}
                                onClick={() => onNavigate?.()}
                                onKeyDown={(event) => handleTriggerKeyDown(event, category.slug)}
                                className={cn(
                                    "relative flex h-9 shrink-0 items-center rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                                    isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                                )}
                            >
                                <span className="truncate">{t(category.labelKey)}</span>
                                {category.badge ? (
                                    <em
                                        data-testid={`tools-nav-badge-${category.slug}`}
                                        className="ml-1 inline-flex h-4 shrink-0 items-center rounded-full bg-brand/12 px-1.5 text-[10px] font-semibold not-italic leading-4 text-brand"
                                    >
                                        {t(`toolsNav.badges.${category.badge}`)}
                                    </em>
                                ) : null}
                            </Link>

                            {isOpen ? (
                                <div
                                    ref={(node) => {
                                        if (node) menuRefs.current.set(category.slug, node);
                                        else menuRefs.current.delete(category.slug);
                                    }}
                                    id={categoryMenuId(idPrefix, category.slug)}
                                    role="menu"
                                    aria-labelledby={categoryTriggerId(idPrefix, category.slug)}
                                    data-testid={`tools-nav-menu-${category.slug}`}
                                    className="absolute left-0 top-full z-30 w-[280px] rounded-xl border border-border bg-card p-2 shadow-lg"
                                >
                                    <div className="flex items-baseline justify-between gap-2 px-2 pb-1.5 pt-1">
                                        <span className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">{t(category.labelKey)}</span>
                                        <span className="text-[12px] tabular-nums text-muted-foreground">{t("toolsNav.toolCount", { count: entries.length })}</span>
                                    </div>
                                    <div className="max-h-[min(70vh,520px)] overflow-y-auto">
                                        {entries.map((item) => (
                                            <ToolMenuEntry
                                                key={`${item.id}-${isBatch ? "batch" : "tool"}`}
                                                item={item}
                                                withBatchMode={isBatch}
                                                batchBadge={isBatch}
                                                active={!isBatch && activeTool?.id === item.id}
                                                onSelect={() => {
                                                    closeMenu(false);
                                                    onNavigate?.();
                                                }}
                                                onKeyDown={(event) => handleEntryKeyDown(event, category.slug)}
                                            />
                                        ))}
                                    </div>
                                    <div className="mt-1 border-t border-border pt-1">
                                        <Link
                                            to={category.route}
                                            role="menuitem"
                                            tabIndex={-1}
                                            data-testid={`tools-nav-category-entry-${category.slug}`}
                                            onClick={() => {
                                                closeMenu(false);
                                                onNavigate?.();
                                            }}
                                            onKeyDown={(event) => handleEntryKeyDown(event, category.slug)}
                                            className="flex min-h-10 items-center rounded-lg px-2 text-sm text-muted-foreground outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
                                        >
                                            {isBatch ? t("toolsNav.batchEntry") : t("toolsNav.categoryEntry", { category: t(category.labelKey) })}
                                        </Link>
                                    </div>
                                    {isBatch ? <p className="px-2 pb-1 pt-1 text-[12px] leading-4 text-muted-foreground">{t("toolsNav.batchHint")}</p> : null}
                                </div>
                            ) : null}
                        </div>
                    );
                })}

            </nav>
        </div>
    );
}

type ToolMenuEntryProps = {
    item: ToolNavigationItem;
    active: boolean;
    withBatchMode: boolean;
    batchBadge: boolean;
    onSelect: () => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
};

function ToolMenuEntry({ item, active, withBatchMode, batchBadge, onSelect, onKeyDown }: ToolMenuEntryProps) {
    const { t } = useTranslation();
    const Icon = item.icon;
    return (
        <Link
            to={withBatchMode ? `${item.route}?mode=batch` : item.route}
            role="menuitem"
            tabIndex={-1}
            data-testid={`tools-nav-item-${item.id}`}
            data-active={active ? "true" : "false"}
            data-origin={item.origin}
            onKeyDown={onKeyDown}
            onClick={onSelect}
            className={cn(
                "flex min-h-10 items-center gap-2.5 rounded-lg px-2 text-sm outline-none transition focus-visible:bg-accent focus-visible:text-accent-foreground",
                active ? "bg-accent font-medium text-accent-foreground" : "text-foreground hover:bg-accent hover:text-accent-foreground",
            )}
        >
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
            {batchBadge && item.batchCapable ? <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground">{t("toolsNav.badges.batch")}</span> : null}
            {item.origin === "supplemental" ? (
                <span className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground" title={t("toolsNav.supplementalHint")}>
                    {t("toolsNav.badges.supplemental")}
                </span>
            ) : null}
        </Link>
    );
}

/** Compact shortcuts that keep the pre-existing product routes reachable next to the five tool categories. */
function WorkspaceLinks({ className }: { className?: string }) {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    return (
        <nav aria-label={t("toolsNav.workspaceNav")} className={cn("items-center gap-0.5", className)}>
            {navigationTools.map((tool) => {
                const Icon = tool.icon;
                const active = pathname === `/${tool.slug}` || pathname.startsWith(`/${tool.slug}/`);
                const label = t(`navigation.${tool.slug}`);
                return (
                    <Tooltip key={tool.slug} title={label}>
                        <Link
                            to={`/${tool.slug}`}
                            aria-label={label}
                            aria-current={active ? "page" : undefined}
                            data-testid={`workspace-link-${tool.slug}`}
                            className={cn(
                                "inline-flex size-9 items-center justify-center rounded-lg outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
                                active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                            )}
                        >
                            <Icon className="size-4" />
                        </Link>
                    </Tooltip>
                );
            })}
        </nav>
    );
}

export function AppTopNav() {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const autoConnectRef = useRef(false);
    const agentToken = useAgentStore((state) => state.token);
    const agentEnabled = useAgentStore((state) => state.enabled);
    const agentConnected = useAgentStore((state) => state.connected);
    const connectAgent = useAgentStore((state) => state.connectAgent);
    const togglePanel = useAgentStore((state) => state.togglePanel);
    const panelOpen = useAgentStore((state) => state.panelOpen);
    const hideHeader = /^\/canvas\/[^/]+/.test(pathname);

    useEffect(() => {
        if (autoConnectRef.current || agentEnabled || agentConnected || !agentToken.trim()) return;
        autoConnectRef.current = true;
        connectAgent({ silent: true });
    }, [agentConnected, agentEnabled, agentToken, connectAgent]);

    return (
        <>
            {!hideHeader ? (
                <>
                    <header data-testid="shell-top-nav" className="sticky top-0 z-[7] h-14 shrink-0 border-b border-hairline bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
                        <div className="mx-auto flex h-full w-full max-w-[1600px] items-center justify-between gap-3 px-3 sm:px-4 lg:px-6">
                            <div className="flex min-w-0 flex-1 items-center gap-1">
                                <Link
                                    to="/"
                                    className="flex h-9 shrink-0 items-center gap-2 rounded-lg px-2 text-sm font-semibold tracking-tight text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <img src="/logo.png" alt="" className="size-5 shrink-0 select-none" draggable={false} />
                                    <span className="text-sm font-semibold">{t("meta.title")}</span>
                                </Link>

                                <button
                                    type="button"
                                    className="ml-1 inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground xl:hidden"
                                    onClick={() => setMobileNavOpen(true)}
                                    aria-label={t("topNav.openMenu")}
                                    aria-expanded={mobileNavOpen}
                                    aria-controls="mobile-tools-navigation"
                                    data-testid="tools-nav-mobile-trigger"
                                    title={t("topNav.menu")}
                                >
                                    <Menu className="size-5" />
                                </button>

                                <ToolsPrimaryNavigation className="ml-2 hidden min-w-0 xl:flex" />
                            </div>

                            <div className="flex h-9 shrink-0 items-center justify-end gap-1 whitespace-nowrap">
                                <WorkspaceLinks className="hidden items-center gap-1 lg:flex" />
                                <span className="mx-1 hidden h-5 w-px bg-border lg:block" aria-hidden />
                                <Tooltip title={t(panelOpen ? "topNav.closeAgent" : "topNav.openAgent")}>
                                    <button
                                        type="button"
                                        onClick={togglePanel}
                                        aria-label={t(panelOpen ? "topNav.closeAgent" : "topNav.openAgent")}
                                        aria-pressed={panelOpen}
                                        data-testid="top-nav-agent-toggle"
                                        className={cn(
                                            "inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                                            panelOpen ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                                        )}
                                    >
                                        <Bot className="size-4" />
                                    </button>
                                </Tooltip>
                                <UserStatusActions />
                            </div>
                        </div>
                    </header>
                </>
            ) : null}

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={getActiveCategorySlug(pathname)} onClose={() => setMobileNavOpen(false)} />
            <AppConfigModal />
        </>
    );
}
