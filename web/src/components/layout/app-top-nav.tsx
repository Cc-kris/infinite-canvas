import { Bot } from "lucide-react";
import { Tooltip } from "antd";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

import { AppConfigModal } from "@/components/layout/app-config-modal";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { getActiveCategorySlug, toolNavigationCategories, type ToolCategorySlug } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/use-agent-store";

type PrimaryEntry = { key: string; to: string; label: string; active: boolean; badge?: string };

const WORKSPACE_FIRST = ["canvas", "image", "video"] as const;
const WORKSPACE_LAST = ["prompts", "assets", "config"] as const;
const CATEGORY_ORDER: readonly ToolCategorySlug[] = ["ecommerce-suite", "smart-edit", "ai-video", "batch-generate", "product-design"];

/**
 * 顶部一级菜单（单层，无下拉）：我的画布、生图工作台、视频创作台、电商套图、智能修图、AI视频、批量生图、商品图设计、提示词库、我的资产、配置。
 * 各工具分类的二级工具列表只在工具页左侧分类列表里出现，顶部不再重复一套。
 */
export function ToolsPrimaryNavigation({ className }: { className?: string }) {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const navRef = useRef<HTMLElement>(null);
    useEffect(() => {
        const nav = navRef.current;
        if (!nav) return;
        const revealActive = () => nav.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
        const observer = new ResizeObserver(revealActive);
        observer.observe(nav);
        revealActive();
        return () => observer.disconnect();
    }, [pathname]);
    const activeCategory = getActiveCategorySlug(pathname);
    const workspace = (slug: string): PrimaryEntry => ({
        key: slug,
        to: `/${slug}`,
        label: t(`navigation.${slug}`),
        active: pathname === `/${slug}` || pathname.startsWith(`/${slug}/`),
    });
    const entries: PrimaryEntry[] = [
        ...WORKSPACE_FIRST.map(workspace),
        ...CATEGORY_ORDER.map((slug) => {
            const category = toolNavigationCategories.find((item) => item.slug === slug)!;
            return { key: slug, to: category.route, label: t(category.labelKey), active: activeCategory === slug, badge: category.badge ? t(`toolsNav.badges.${category.badge}`) : undefined };
        }),
        ...WORKSPACE_LAST.map(workspace),
    ];
    return (
        <nav ref={navRef} aria-label={t("toolsNav.primaryNav")} data-testid="tools-nav-primary" className={cn("flex min-w-0 items-center gap-1 overflow-x-auto", className)}>
            {entries.map((entry) => (
                <Link
                    key={entry.key}
                    to={entry.to}
                    aria-current={entry.active ? "page" : undefined}
                    data-testid={`tools-nav-trigger-${entry.key}`}
                    data-active={entry.active ? "true" : "false"}
                    className={cn(
                        "flex h-11 shrink-0 items-center rounded-lg px-3 xl:h-9 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                        entry.active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                >
                    {entry.label}
                    {entry.badge ? <em className="ml-1 inline-flex h-4 items-center rounded-full bg-brand/12 px-1.5 text-[10px] font-semibold not-italic leading-4 text-brand">{entry.badge}</em> : null}
                </Link>
            ))}
        </nav>
    );
}

export function AppTopNav() {
    const { t } = useTranslation();
    const { pathname } = useLocation();
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
                    <header data-testid="shell-top-nav" className="sticky top-0 z-[7] shrink-0 border-b border-hairline bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
                        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-x-3 px-3 sm:px-4 lg:px-6 xl:h-14 xl:flex-nowrap">
                            <div className="flex h-14 shrink-0 items-center">
                                <Link
                                    to="/"
                                    className="flex h-9 shrink-0 items-center gap-2 rounded-lg px-2 text-sm font-semibold tracking-tight text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <img src="/logo.png" alt="" className="size-5 shrink-0 select-none" draggable={false} />
                                    <span className="text-sm font-semibold">{t("meta.title")}</span>
                                </Link>

                            </div>

                            <ToolsPrimaryNavigation className="order-last h-12 w-full xl:order-none xl:h-full xl:w-auto xl:flex-1" />

                            <div className="flex h-9 shrink-0 items-center justify-end gap-1 whitespace-nowrap">
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
                                <UserStatusActions showConfig={false} />
                            </div>
                        </div>
                    </header>
                </>
            ) : null}

            <AppConfigModal />
        </>
    );
}
