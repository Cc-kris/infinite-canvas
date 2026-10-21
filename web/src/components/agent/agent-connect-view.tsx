import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";

import { AgentRuntimeCards } from "./agent-runtime-cards";

/**
 * 0.25：连接页只保留「三张卡片 + 状态」。
 * 不再提供手填 Local URL / Token 的网页兜底——桌面端会自己完成插件安装与降级。
 */
export function AgentConnectView({
    theme,
    url,
    token,
    enabled,
    connected,
    activity,
    connectError,
    onConnectWith,
    onDisconnect,
}: {
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    url: string;
    token: string;
    enabled: boolean;
    connected: boolean;
    activity: string;
    connectError: string;
    /** 一键连接：卡片直接给出可用的地址与令牌。 */
    onConnectWith: (url: string, token: string) => void;
    /** 断开连接：清掉网页会话，桌面端同时退出 Agent 进程。 */
    onDisconnect: () => void;
}) {
    const { t } = useTranslation();
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

                <AgentRuntimeCards theme={theme} url={url} token={token} connected={connected} onConnectWith={onConnectWith} onDisconnect={onDisconnect} />

                {connectError ? (
                    <div className="rounded-md border px-2.5 py-2 text-xs leading-5" style={{ borderColor: "rgba(220,38,38,.35)", color: "#dc2626" }}>
                        {connectError}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
