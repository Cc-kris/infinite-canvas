import { Bot, ChevronDown, Menu } from "lucide-react";
import { Button, Tooltip } from "antd";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

import { AppConfigModal } from "@/components/layout/app-config-modal";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { getActiveCategorySlug, getCategoryMenuTools, getToolNavigationCategory, navigationTools, resolveToolNavigation, shellMoreMenuItems, toolNavigationCategories, type ToolCategorySlug, type ToolNavigationItem } from "@/constant/navigation-tools";
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
    const moreTriggerId = `${idPrefix}-more-trigger`;
    const moreMenuId = `${idPrefix}-more-menu`;
    const moreMenuRef = useRef<HTMLDivElement | null>(null);
    const activeCategorySlug = getActiveCategorySlug(pathname);
    const { tool: activeTool } = resolveToolNavigation(pathname);

    const [openSlug, setOpenSlug] = useState<ToolCategorySlug | null>(null);
    const [moreOpen, setMoreOpen] = useState(false);
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

    // 「更多」下拉：点击外部/按 Esc/切换路由都收起。
    useEffect(() => {
        if (!moreOpen) return;
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (moreMenuRef.current?.contains(target)) return;
            if ((event.target as HTMLElement | null)?.closest?.('[data-testid="tools-nav-more-trigger"]')) return;
            setMoreOpen(false);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setMoreOpen(false);
        };
        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [moreOpen]);

    useEffect(() => {
        setMoreOpen(false);
    }, [pathname]);

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
            <nav aria-label={t("toolsNav.primaryNav")} className="hide-scrollbar flex h-full min-w-0 items-stretch overflow-x-auto">
                {/* 原站实测：所有主项之前有独立「首页」链接（x=234/宽 32/16px/与主项同为 30px 间距） */}
                <Link
                    to="/"
                    data-testid="tools-nav-trigger-home"
                    aria-current={pathname === "/" ? "page" : undefined}
                    data-active={pathname === "/" ? "true" : "false"}
                    className={cn(
                        "relative mr-[var(--shell-nav-gap)] flex h-[60px] shrink-0 items-center rounded-none text-[16px]! leading-[25.1429px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        pathname === "/" ? "text-[var(--brand)]!" : "text-black/85! hover:text-[var(--brand)]! dark:text-white/85 dark:hover:text-[var(--brand)]!",
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
                        <div key={category.slug} className="relative mr-[var(--shell-nav-gap)] flex h-full items-stretch last:mr-0" onMouseEnter={() => openMenu(category.slug)} onMouseLeave={scheduleClose}>
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
                                    // 原站实测：无图标、无箭头、无下划线；16px / 行高 25.1429；项间距由父级 30px 提供，选中为品牌紫 #723CF9
                                    "relative flex h-[60px] shrink-0 items-center rounded-none text-[16px]! leading-[25.1429px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                    isActive ? "text-[var(--brand)]!" : "text-black/85! hover:text-[var(--brand)]! dark:text-white/85 dark:hover:text-[var(--brand)]!",
                                )}
                            >
                                <span className="truncate">{t(category.labelKey)}</span>
                                {category.badge ? (
                                    <em
                                        data-testid={`tools-nav-badge-${category.slug}`}
                                        className="ml-0 inline-flex h-4 shrink-0 translate-x-[4px] -translate-y-[7px] items-center rounded-[5px] px-[5px] text-[9px] font-bold not-italic leading-4 text-white [background-image:linear-gradient(135deg,#FF4D6D,#FF7A45)]"
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

                {/* 原站导航末尾还有两个独立外部入口 Skills / Agent（x=832.9 w=37.4、x=900.3 w=42.8，同 16px/30px 间距）。
                    原站指向 skill.linkfox.com / os.linkfox.com，本地无对应路由，故按「原站入口，本地暂未实现」渲染为不可点击项，保持 1:1 视觉。 */}
                {[
                    { key: "skills", label: "Skills" },
                    { key: "agent", label: "Agent" },
                ].map((entry) => (
                    <span
                        key={entry.key}
                        role="link"
                        aria-disabled="true"
                        title={t("toolsNav.moreUnavailable")}
                        data-testid={`tools-nav-external-${entry.key}`}
                        className="mr-[var(--shell-nav-gap)] flex h-[60px] shrink-0 cursor-default items-center text-[16px]! leading-[25.1429px] text-black/85! dark:text-white/85"
                    >
                        {entry.label}
                    </span>
                ))}

                {/* 原站实测：末尾「更多」汇总下拉——触发器含文字 47px（含 10px 下箭头）、面板宽 168px、行高 32px/14px/圆角 4px */}
                <div className="relative mr-[var(--shell-nav-gap)] flex h-full items-stretch last:mr-0" onMouseEnter={() => setMoreOpen(true)} onMouseLeave={() => setMoreOpen(false)}>
                    <button
                        type="button"
                        id={moreTriggerId}
                        aria-haspopup="menu"
                        aria-expanded={moreOpen}
                        aria-controls={moreMenuId}
                        data-testid="tools-nav-more-trigger"
                        onClick={() => setMoreOpen((open) => !open)}
                        onKeyDown={(event) => {
                            if (event.key === "Escape") setMoreOpen(false);
                        }}
                        className="relative flex h-[60px] shrink-0 items-center rounded-none text-[16px]! leading-[25.1429px] text-black/85! outline-none transition-colors hover:text-[var(--brand)]! focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-white/85 dark:hover:text-[var(--brand)]!"
                    >
                        {t("toolsNav.more")}
                        <ChevronDown className="ml-[5px] size-[10px] shrink-0" strokeWidth={3} aria-hidden />
                    </button>
                    {moreOpen ? (
                        <div
                            ref={(node) => {
                                moreMenuRef.current = node;
                            }}
                            id={moreMenuId}
                            role="menu"
                            aria-labelledby={moreTriggerId}
                            data-testid="tools-nav-more-menu"
                            className="absolute left-0 top-[calc(100%+4px)] z-30 w-[168px] rounded-[8px] bg-popover p-1 shadow-[0_6px_16px_rgba(0,0,0,0.08),0_3px_6px_-4px_rgba(0,0,0,0.12),0_9px_28px_8px_rgba(0,0,0,0.05)]"
                        >
                            {shellMoreMenuItems.map((item) => {
                                const label = t(`toolsNav.moreMenu.${item.key}`);
                                return item.localRoute ? (
                                    <Link
                                        key={item.key}
                                        to={item.localRoute}
                                        role="menuitem"
                                        data-testid={`tools-nav-more-item-${item.key}`}
                                        onClick={() => {
                                            setMoreOpen(false);
                                            onNavigate?.();
                                        }}
                                        className="flex h-8 items-center rounded-[4px] text-sm text-black/[0.88]! outline-none transition-colors hover:bg-black/[0.04] focus-visible:bg-black/[0.04] dark:text-white/85! dark:hover:bg-white/10 dark:focus-visible:bg-white/10"
                                    >
                                        {label}
                                    </Link>
                                ) : (
                                    <span
                                        key={item.key}
                                        role="menuitem"
                                        aria-disabled="true"
                                        data-testid={`tools-nav-more-item-${item.key}`}
                                        data-local-route="missing"
                                        title={t("toolsNav.moreUnavailable")}
                                        className="flex h-8 cursor-default items-center rounded-[4px] text-sm text-black/[0.88]! dark:text-white/45!"
                                    >
                                        {label}
                                    </span>
                                );
                            })}
                        </div>
                    ) : null}
                </div>
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
                    <header data-testid="shell-top-nav" className="sticky top-0 z-[7] h-[60px] shrink-0 border-b border-hairline bg-surface">
                        <div className="flex h-full w-full items-stretch justify-between gap-4" style={{ paddingLeft: "var(--shell-pad-left)", paddingRight: "var(--shell-pad-right)" }}>
                            <div className="flex min-w-0 flex-1 items-center">
                                {/* 原站实测：品牌区占位 160px（logo 24→184），随后 50px 间距，导航首项 x=234；<1440 时该间距收为 0 */}
                                <Link to="/" className="flex h-full min-w-[160px] shrink-0 items-center gap-2 text-sm font-semibold leading-none tracking-tight text-stone-950 transition hover:text-stone-600 dark:text-stone-100 dark:hover:text-stone-300">
                                    <img src="/logo.png" alt="" className="size-5 shrink-0 select-none" draggable={false} />
                                    <span className="text-base font-medium">{t("meta.title")}</span>
                                </Link>

                                <button
                                    type="button"
                                    className="ml-3 inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-stone-600 transition hover:text-stone-950 md:hidden dark:text-stone-300 dark:hover:text-white"
                                    onClick={() => setMobileNavOpen(true)}
                                    aria-label={t("topNav.openMenu")}
                                    aria-expanded={mobileNavOpen}
                                    aria-controls="mobile-tools-navigation"
                                    data-testid="tools-nav-mobile-trigger"
                                    title={t("topNav.menu")}
                                >
                                    <Menu className="size-5" />
                                </button>

                                <ToolsPrimaryNavigation className="ml-[var(--shell-nav-offset)] hidden min-w-0 md:flex" />
                            </div>

                            <div className="my-auto flex h-9 shrink-0 items-center justify-end gap-2 whitespace-nowrap">
                                <WorkspaceLinks className="flex justify-center" />
                                <div className="flex items-center justify-between gap-1 rounded-lg bg-accent/70 px-2 py-1">
                                    <span className="text-xs text-accent-foreground">Agent</span>
                                    <Tooltip title={t(panelOpen ? "topNav.closeAgent" : "topNav.openAgent")}>
                                        <Button type="text" size="small" className="!h-7 !w-7 !min-w-7" icon={<Bot className="size-4" />} onClick={togglePanel} aria-label={t(panelOpen ? "topNav.closeAgent" : "topNav.openAgent")} />
                                    </Tooltip>
                                </div>
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
