import { useEffect, useState } from "react";
import { Button, Tooltip } from "antd";
import { CheckCircle2, CircleSlash, Loader2, PlugZap, Power } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";

type RuntimeId = "claude" | "codex" | "galley";
type PluginState = { ok: boolean; at?: string } | null;
type RuntimeCard = {
    id: RuntimeId;
    label: string;
    installed: boolean;
    cliInstalled?: boolean;
    desktop?: boolean;
    desktopLabel?: string;
    version: string;
    mode: "mcp" | "bridge";
    plugin?: PluginState;
};
type ConnectionMode = "plugin" | "runtime" | "";
type HubState = { server: { running: boolean; url: string; token: string; error?: string }; runtime: string; mode: ConnectionMode; connecting?: { runtime: string; startedAt: number; stage?: string } | null; runtimes: RuntimeCard[] };
type ConnectResult = { ok: boolean; url?: string; token?: string; runtime?: string; mode?: ConnectionMode; error?: string; busy?: boolean };

type DesktopBridge = {
    agentHub?: {
        list: () => Promise<HubState>;
        connect: (id: string) => Promise<ConnectResult>;
        disconnect: () => Promise<{ ok: boolean }>;
        onChanged?: (callback: () => void) => () => void;
    };
};
const bridge = () => (window as unknown as { infiniteCanvasDesktop?: DesktopBridge }).infiniteCanvasDesktop?.agentHub;

const ICONS: Record<RuntimeId, string> = { claude: "Claude Code", codex: "Codex", galley: "Galley" };

/**
 * 0.25：本地 Agent 卡片。
 * 连接只有两种真实形态：插件方式（Claude Code / Codex 装 MCP）与运行时方式（返回 url + token）。
 * 桌面端点连接会先试插件，不通就自己切运行时——这里只负责展示结果，不提供任何手动兜底。
 */
export function AgentRuntimeCards({
    theme,
    url,
    token,
    connected,
    onConnectWith,
    onDisconnect,
}: {
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    url: string;
    token: string;
    connected: boolean;
    onConnectWith: (url: string, token: string) => void;
    onDisconnect: () => void;
}) {
    const { t } = useTranslation();
    const [state, setState] = useState<HubState | null>(null);
    const [busy, setBusy] = useState<string>("");
    const [error, setError] = useState("");
    const hub = bridge();
    // 「谁在连接中」以主进程为准：面板被关掉重开、组件重挂载都不会丢锁，
    // 本地 busy 只负责自己点下去那一下的即时反馈。
    const serverBusy = state?.connecting?.runtime || "";
    const serverStage = state?.connecting?.stage || "";
    const locked = Boolean(busy) || Boolean(serverBusy);

    const load = async () => {
        if (!hub) {
            setError(t("agent.connect.desktopOnly"));
            return;
        }
        try {
            const next = await hub.list();
            setState(next);
            setError("");
            // 后台静默拉起服务后界面还拿着空的地址，这里补上，用户不需要点任何按钮。
            if (next.server.running && next.server.url && next.server.token && (next.server.url !== url || next.server.token !== token)) {
                onConnectWith(next.server.url, next.server.token);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    };

    // 地址或 token 就绪后重新探测：首帧可能还没拿到连接信息，不能只跑一次。
    // 主进程静默切换连接方式后也会发事件，收到即重新读一次，界面跟着变。
    useEffect(() => {
        void load();
        const off = bridge()?.onChanged?.(() => void load());
        return () => off?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url, token]);

    // 主进程还在连接时定时重读：事件可能因窗口重建而错过，轮询保证锁最终会解。
    useEffect(() => {
        if (!serverBusy) return;
        const timer = window.setInterval(() => void load(), 1500);
        return () => window.clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serverBusy]);

    /** 点连接：桌面端内部决定走插件还是运行时，成功后直接把可用连接交给面板。 */
    const connect = async (runtime: RuntimeCard) => {
        setBusy(runtime.id);
        setError("");
        try {
            if (!hub) throw new Error(t("agent.connect.desktopOnly"));
            const result = await hub.connect(runtime.id);
            if (!result.ok || !result.url || !result.token) throw new Error(result.error || t("agent.connect.connectFailed"));
            onConnectWith(result.url, result.token);
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy("");
        }
    };

    /** 断开：桌面端会退出 Agent 进程。 */
    const disconnect = async () => {
        setBusy("disconnect");
        setError("");
        try {
            if (!hub) throw new Error(t("agent.connect.desktopOnly"));
            const result = await hub.disconnect();
            if (!result.ok) throw new Error(t("agent.connect.disconnectFailed"));
            onDisconnect();
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy("");
        }
    };

    const modeLabel = (mode: ConnectionMode) => (mode === "plugin" ? t("agent.connect.modePlugin") : mode === "runtime" ? t("agent.connect.modeRuntime") : "");

    return (
        <div className="space-y-2">
            {state?.runtimes?.map((runtime) => {
                const active = connected && state.runtime === runtime.id;
                // 识别来源：命令行与桌面版各自独立探测，两者都显示出来，避免「装了却说没装」。
                const sources = [runtime.cliInstalled ? t("agent.connect.cliLabel") : "", runtime.desktop ? t("agent.connect.desktopLabel") : ""].filter(Boolean);
                const detected = sources.length ? `${sources.join(" + ")}${runtime.version ? ` · ${runtime.version}` : ""}` : t("agent.connect.notInstalled");
                const pluginText = runtime.mode === "mcp" && runtime.plugin ? (runtime.plugin.ok ? t("agent.connect.pluginInstalled") : t("agent.connect.pluginFallback")) : "";
                return (
                    <div key={runtime.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5" style={{ borderColor: active ? "#f97316" : theme.node.stroke, background: active ? "rgba(249,115,22,.08)" : "transparent" }}>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-sm font-medium leading-5" style={{ color: theme.node.text }}>
                                {ICONS[runtime.id]}
                                {runtime.installed ? <CheckCircle2 className="size-3.5" style={{ color: "#16a34a" }} /> : <CircleSlash className="size-3.5" style={{ color: theme.node.muted }} />}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] leading-4" style={{ color: theme.node.muted }}>
                                <span style={{ color: active ? "#f97316" : undefined, fontWeight: active ? 600 : 400 }}>{active ? t("agent.connect.statusConnected") : t("agent.connect.statusDisconnected")}</span>
                                {active && modeLabel(state.mode) ? (
                                    <>
                                        <span>·</span>
                                        <span className="shrink-0" style={{ color: "#16a34a" }}>
                                            {modeLabel(state.mode)}
                                        </span>
                                    </>
                                ) : null}
                                <span>·</span>
                                <span className="truncate">{detected}</span>
                                {pluginText ? (
                                    <>
                                        <span>·</span>
                                        <span className="truncate" style={{ color: runtime.plugin?.ok ? "#16a34a" : theme.node.muted }}>{pluginText}</span>
                                    </>
                                ) : null}
                            </div>
                        </div>
                        <Tooltip title={!runtime.installed ? t("agent.connect.notInstalledHint") : ""}>
                            {active ? (
                                <Button size="small" danger disabled={locked} loading={busy === "disconnect"} icon={busy === "disconnect" ? <Loader2 className="size-3.5" /> : <Power className="size-3.5" />} onClick={() => disconnect()}>
                                    {t("agent.connect.disconnect")}
                                </Button>
                            ) : (
                                <Button size="small" type="primary" ghost disabled={!runtime.installed || locked} loading={busy === runtime.id || serverBusy === runtime.id} icon={busy === runtime.id || serverBusy === runtime.id ? <Loader2 className="size-3.5" /> : <PlugZap className="size-3.5" />} onClick={() => connect(runtime)}>
                                    {t("agent.connect.connect")}
                                </Button>
                            )}
                        </Tooltip>
                    </div>
                );
            })}
            {serverBusy && !error ? (
                <div className="text-xs" style={{ color: theme.node.muted }}>
                    {t("agent.connect.connectingLock", { name: state?.runtimes?.find((item) => item.id === serverBusy)?.label || serverBusy })}
                    {serverStage ? ` · ${t(`agent.connect.stage.${serverStage}`)}` : ""}
                </div>
            ) : null}
            {!state && !error ? <div className="text-xs" style={{ color: theme.node.muted }}>{t("agent.connect.detecting")}</div> : null}
            {error ? (
                <div className="rounded-md border px-2.5 py-2 text-xs leading-5" style={{ borderColor: "rgba(220,38,38,.35)", color: "#dc2626" }}>
                    {error}
                </div>
            ) : null}
        </div>
    );
}
