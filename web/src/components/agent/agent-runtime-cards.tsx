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
type HubState = { server: { running: boolean; url: string; token: string; error?: string }; runtime: string; runtimes: RuntimeCard[] };

type DesktopBridge = { agentHub?: { list: () => Promise<HubState>; connect: (id: string) => Promise<{ ok: boolean; url?: string; token?: string; runtime?: string; error?: string; warning?: string }>; disconnect: () => Promise<{ ok: boolean }> } };
const bridge = () => (window as unknown as { infiniteCanvasDesktop?: DesktopBridge }).infiniteCanvasDesktop?.agentHub;

const ICONS: Record<RuntimeId, string> = { claude: "Claude Code", codex: "Codex", galley: "Galley" };

/** 0.23：一键连接本地 Agent —— 三张卡片替代原来的手填地址流程。 */
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
    const [notice, setNotice] = useState("");
    const hub = bridge();

    const load = async () => {
        try {
            if (hub) {
                setState(await hub.list());
                setError("");
                return;
            }
            const base = (url || "http://127.0.0.1:17371").replace(/\/$/, "");
            const res = await fetch(`${base}/api/agent/runtimes`, { headers: token ? { "x-canvas-agent-token": token } : {} });
            const body = await res.json();
            if (!body?.ok) throw new Error(body?.error || "unavailable");
            setState({ server: { running: true, url: base, token }, runtime: body.runtime || "", runtimes: body.runtimes || [] });
            setError("");
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    };

    // 地址或 token 就绪后重新探测：首帧可能还没拿到连接信息，不能只跑一次。
    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url, token]);

    const connect = async (runtime: RuntimeCard) => {
        setBusy(runtime.id);
        setError("");
        setNotice("");
        try {
            if (hub) {
                const result = await hub.connect(runtime.id);
                if (!result.ok || !result.url || !result.token) throw new Error(result.error || t("agent.connect.connectFailed"));
                if (result.warning) setNotice(result.warning);
                onConnectWith(result.url, result.token);
            } else {
                const base = (url || "http://127.0.0.1:17371").replace(/\/$/, "");
                const res = await fetch(`${base}/api/agent/runtime`, {
                    method: "POST",
                    headers: { "content-type": "application/json", ...(token ? { "x-canvas-agent-token": token } : {}) },
                    body: JSON.stringify({ runtime: runtime.id }),
                });
                const body = await res.json();
                if (!body?.ok) throw new Error(body?.error || t("agent.connect.connectFailed"));
                onConnectWith(base, token);
            }
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy("");
        }
    };

    /** 断开：桌面端会退出 Agent 进程；网页端同时清掉已建立的会话。 */
    const disconnect = async (runtime: RuntimeCard) => {
        setBusy(runtime.id);
        setError("");
        setNotice("");
        try {
            if (hub) {
                const result = await hub.disconnect();
                if (!result.ok) throw new Error(t("agent.connect.disconnectFailed"));
            } else {
                const base = (url || "http://127.0.0.1:17371").replace(/\/$/, "");
                await fetch(`${base}/api/agent/runtime`, {
                    method: "POST",
                    headers: { "content-type": "application/json", ...(token ? { "x-canvas-agent-token": token } : {}) },
                    body: JSON.stringify({ runtime: "" }),
                });
            }
            onDisconnect();
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy("");
        }
    };

    return (
        <div className="space-y-2">
            {state?.runtimes?.map((runtime) => {
                const active = connected && state.runtime === runtime.id;
                // 识别来源：命令行与桌面版各自独立探测，两者都显示出来，避免「装了却说没装」。
                const sources = [runtime.cliInstalled ? t("agent.connect.cliLabel") : "", runtime.desktop ? t("agent.connect.desktopLabel") : ""].filter(Boolean);
                const detected = sources.length ? `${sources.join(" + ")}${runtime.version ? ` · ${runtime.version}` : ""}` : t("agent.connect.notInstalled");
                const pluginText = runtime.plugin ? (runtime.plugin.ok ? t("agent.connect.pluginInstalled") : t("agent.connect.pluginFallback")) : "";
                return (
                    <div key={runtime.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5" style={{ borderColor: active ? "#f97316" : theme.node.stroke, background: active ? "rgba(249,115,22,.08)" : "transparent" }}>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-sm font-medium leading-5" style={{ color: theme.node.text }}>
                                {ICONS[runtime.id]}
                                {runtime.installed ? <CheckCircle2 className="size-3.5" style={{ color: "#16a34a" }} /> : <CircleSlash className="size-3.5" style={{ color: theme.node.muted }} />}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] leading-4" style={{ color: theme.node.muted }}>
                                <span style={{ color: active ? "#f97316" : undefined, fontWeight: active ? 600 : 400 }}>{active ? t("agent.connect.statusConnected") : t("agent.connect.statusDisconnected")}</span>
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
                                <Button size="small" danger disabled={Boolean(busy)} loading={busy === runtime.id} icon={busy === runtime.id ? <Loader2 className="size-3.5" /> : <Power className="size-3.5" />} onClick={() => disconnect(runtime)}>
                                    {t("agent.connect.disconnect")}
                                </Button>
                            ) : (
                                <Button size="small" type="primary" ghost disabled={!runtime.installed || Boolean(busy)} loading={busy === runtime.id} icon={busy === runtime.id ? <Loader2 className="size-3.5" /> : <PlugZap className="size-3.5" />} onClick={() => connect(runtime)}>
                                    {t("agent.connect.connect")}
                                </Button>
                            )}
                        </Tooltip>
                    </div>
                );
            })}
            {!state && !error ? <div className="text-xs" style={{ color: theme.node.muted }}>{t("agent.connect.detecting")}</div> : null}
            {notice ? (
                <div className="rounded-md border px-2.5 py-2 text-xs leading-5" style={{ borderColor: "rgba(249,115,22,.35)", color: "#b45309" }}>
                    {notice}
                </div>
            ) : null}
            {error ? (
                <div className="rounded-md border px-2.5 py-2 text-xs leading-5" style={{ borderColor: "rgba(220,38,38,.35)", color: "#dc2626" }}>
                    {error}
                </div>
            ) : null}
        </div>
    );
}
