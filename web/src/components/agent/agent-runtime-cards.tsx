import { useEffect, useState } from "react";
import { Button, Tooltip } from "antd";
import { CheckCircle2, CircleSlash, Loader2, PlugZap, Power } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";

type RuntimeId = "claude" | "codex" | "galley";
type RuntimeCard = { id: RuntimeId; label: string; installed: boolean; version: string; mode: "mcp" | "bridge" };
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
                return;
            }
            const base = (url || "http://127.0.0.1:17371").replace(/\/$/, "");
            const res = await fetch(`${base}/api/agent/runtimes`, { headers: token ? { "x-canvas-agent-token": token } : {} });
            const body = await res.json();
            if (!body?.ok) throw new Error(body?.error || "unavailable");
            setState({ server: { running: true, url: base, token }, runtime: body.runtime || "", runtimes: body.runtimes || [] });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
                                <span className="truncate">{runtime.installed ? runtime.version || t("agent.connect.installed") : t("agent.connect.notInstalled")}</span>
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
