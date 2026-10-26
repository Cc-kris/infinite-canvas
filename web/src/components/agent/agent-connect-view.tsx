import { useTranslation } from "react-i18next";
import { Button, Input } from "antd";
import { Power } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";

import { AgentRuntimeCards, hasDesktopAgentHub } from "./agent-runtime-cards";

/**
 * 0.27：桌面端仍是「三张卡片 + 状态」；网页端补回手填 Local URL / Token 的直连入口，
 * 让浏览器里也能连上同一套本地 Agent 服务。
 */
export function AgentConnectView({
    theme,
    url,
    token,
    enabled,
    connected,
    activity,
    connectError,
    onUrlChange,
    onTokenChange,
    onConnectWith,
    onAdoptConfig,
    onDisconnect,
}: {
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    url: string;
    token: string;
    enabled: boolean;
    connected: boolean;
    activity: string;
    connectError: string;
    /** 网页端手填的本地服务地址。 */
    onUrlChange: (url: string) => void;
    /** 网页端手填的访问令牌。 */
    onTokenChange: (token: string) => void;
    /** 一键连接：卡片直接给出可用的地址与令牌。 */
    onConnectWith: (url: string, token: string) => void;
    /** 桌面端换发凭据（切运行时重启服务）时只同步地址与令牌，不动已建立的连接。 */
    onAdoptConfig: (url: string, token: string) => void;
    /** 断开连接：清掉网页会话，桌面端同时退出 Agent 进程。 */
    onDisconnect: () => void;
}) {
    const { t } = useTranslation();
    const desktop = hasDesktopAgentHub();
    const statusText = connectError ? t("agent.status.failed") : connected ? activity : enabled ? t("agent.status.connecting") : t("agent.status.disconnected");
    const statusColor = connectError ? "#dc2626" : connected ? "#16a34a" : enabled ? "#d97706" : theme.node.muted;
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
                <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-base font-semibold leading-6">{t("agent.connect.title")}</div>
                        <span
                            className="inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] leading-4"
                            style={{ borderColor: connected || enabled || connectError ? statusColor : theme.node.stroke, color: statusColor }}
                        >
                            <span className="size-1.5 shrink-0 rounded-full" style={{ background: statusColor }} />
                            <span className="truncate">{statusText}</span>
                        </span>
                    </div>
                    <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                        {t("agent.connect.description")}
                    </div>
                </div>

                <AgentRuntimeCards theme={theme} url={url} token={token} connected={connected} onConnectWith={onConnectWith} onAdoptConfig={onAdoptConfig} onDisconnect={onDisconnect} />

                {desktop ? null : (
                    <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: theme.node.stroke }}>
                        <div className="text-sm font-medium leading-5" style={{ color: theme.node.text }}>
                            {t("agent.connect.webConnection")}
                        </div>
                        <div className="text-[11px] leading-4" style={{ color: theme.node.muted }}>
                            {t("agent.connect.autoDiscover")}
                        </div>
                        <Input
                            value={url}
                            placeholder={t("agent.connect.urlPlaceholder")}
                            onChange={(event) => onUrlChange(event.target.value)}
                            aria-label={t("agent.connect.localAddress")}
                        />
                        <Input.Password
                            value={token}
                            placeholder={t("agent.connect.tokenPlaceholder")}
                            onChange={(event) => onTokenChange(event.target.value)}
                            aria-label={t("agent.connect.token")}
                        />
                        <Button
                            block
                            type={connected ? "default" : "primary"}
                            icon={<Power className="size-3.5" />}
                            onClick={() => (connected ? onDisconnect() : onConnectWith(url, token))}
                        >
                            {connected ? t("agent.connect.disconnect") : t("agent.connect.connect")}
                        </Button>
                    </div>
                )}

                {connectError ? (
                    <div className="rounded-md border px-2.5 py-2 text-xs leading-5" style={{ borderColor: "rgba(220,38,38,.35)", color: "#dc2626" }}>
                        {connectError}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
