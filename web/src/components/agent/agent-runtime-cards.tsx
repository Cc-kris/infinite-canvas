import { useEffect, useRef, useState } from "react";
import { Button, Input, Tooltip } from "antd";
import { CheckCircle2, CircleSlash, FolderSearch, Loader2, PlugZap, Power } from "lucide-react";
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
    /** 0.26: 实际解析到的可执行文件路径。 */
    path?: string;
    /** 0.26: 用户手选的安装目录（空表示仍按默认位置扫描）。 */
    customPath?: string;
};
type ConnectionMode = "plugin" | "runtime" | "";
type HubState = { server: { running: boolean; url: string; token: string; error?: string }; runtime: string; mode: ConnectionMode; connecting?: { runtime: string; startedAt: number; stage?: string } | null; runtimes: RuntimeCard[] };
type ConnectResult = { ok: boolean; url?: string; token?: string; runtime?: string; mode?: ConnectionMode; error?: string; busy?: boolean };

type DesktopBridge = {
    agentHub?: {
        list: () => Promise<HubState>;
        connect: (id: string) => Promise<ConnectResult>;
        disconnect: () => Promise<{ ok: boolean }>;
        /** 0.26: 弹系统目录选择框。 */
        pickDirectory?: (id: string) => Promise<{ ok: boolean; dir?: string; canceled?: boolean; error?: string }>;
        /** 0.26: 在手选目录里扫描 Agent 并持久化；dir 传空清除。 */
        setRuntimePath?: (id: string, dir: string) => Promise<{ ok: boolean; path?: string; version?: string; error?: string; cleared?: boolean }>;
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
    onAdoptConfig,
    onDisconnect,
}: {
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    url: string;
    token: string;
    connected: boolean;
    /** 用户主动点连接：重新走一遍连接流程。 */
    onConnectWith: (url: string, token: string) => void;
    /** 桌面端换发凭据时只同步地址与令牌，不能动已建立的连接状态。 */
    onAdoptConfig: (url: string, token: string) => void;
    onDisconnect: () => void;
}) {
    const { t } = useTranslation();
    const [state, setState] = useState<HubState | null>(null);
    const [busy, setBusy] = useState<string>("");
    const [error, setError] = useState("");
    // 0.26: 手选安装目录——按运行时分别记录输入框内容与扫描中的状态。
    const [pathDraft, setPathDraft] = useState<Record<string, string>>({});
    const [pathBusy, setPathBusy] = useState<string>("");
    const [pathNotice, setPathNotice] = useState<{ runtime: string; text: string; ok: boolean } | null>(null);
    const hub = bridge();
    // 轮询回调里读到的必须是当前凭据：闭包里的 url/token 可能是上一次渲染的，
    // 那会让「地址已同步」判断永远为真，每 1.5 秒重置一次连接状态。
    const credRef = useRef({ url, token, connected });
    credRef.current = { url, token, connected };
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
            // 注意用 adopt 而不是 onConnectWith：切运行时服务会换新令牌，
            // 用后者会把刚连上的会话打回「连接中」，界面就永远转圈。
            const current = credRef.current;
            if (next.server.running && next.server.url && next.server.token && (next.server.url !== current.url || next.server.token !== current.token)) {
                onAdoptConfig(next.server.url, next.server.token);
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

    /**
     * 0.26: 默认位置扫不到 Agent 时，让用户指一个安装目录。
     * 选完立刻扫描并把命中结果写进配置，成功就刷新卡片（可以直接连）。
     */
    const applyRuntimeDir = async (runtime: RuntimeCard, dir: string) => {
        if (!hub?.setRuntimePath) throw new Error(t("agent.connect.desktopOnly"));
        setPathBusy(runtime.id);
        setPathNotice(null);
        try {
            const result = await hub.setRuntimePath(runtime.id, dir);
            if (!result.ok) throw new Error(result.error || t("agent.connect.pathScanFailed"));
            setPathNotice({
                runtime: runtime.id,
                ok: true,
                text: result.cleared ? t("agent.connect.pathCleared") : t("agent.connect.pathScanned", { path: result.path || dir }),
            });
            setPathDraft((prev) => ({ ...prev, [runtime.id]: result.cleared ? "" : dir }));
            await load();
        } catch (err) {
            setPathNotice({ runtime: runtime.id, ok: false, text: err instanceof Error ? err.message : String(err) });
        } finally {
            setPathBusy("");
        }
    };

    /** 点「选择目录」：系统对话框选文件夹 → 立即扫描。 */
    const chooseRuntimeDir = async (runtime: RuntimeCard) => {
        if (!hub?.pickDirectory) {
            setPathNotice({ runtime: runtime.id, ok: false, text: t("agent.connect.desktopOnly") });
            return;
        }
        try {
            const picked = await hub.pickDirectory(runtime.id);
            if (!picked.ok) {
                if (!picked.canceled) setPathNotice({ runtime: runtime.id, ok: false, text: picked.error || t("agent.connect.pathScanFailed") });
                return;
            }
            if (picked.dir) await applyRuntimeDir(runtime, picked.dir);
        } catch (err) {
            setPathNotice({ runtime: runtime.id, ok: false, text: err instanceof Error ? err.message : String(err) });
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
                const notice = pathNotice?.runtime === runtime.id ? pathNotice : null;
                // 0.26: 没扫到就摆出手选入口；已经手选过的也留着，方便换目录或清除。
                const showPathRow = !runtime.installed || Boolean(runtime.customPath);
                return (
                    <div key={runtime.id} className="space-y-1.5">
                    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5" style={{ borderColor: active ? "#f97316" : theme.node.stroke, background: active ? "rgba(249,115,22,.08)" : "transparent" }}>
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
                        {showPathRow ? (
                            <div className="rounded-lg border border-dashed px-3 py-2" style={{ borderColor: theme.node.stroke }}>
                                <div className="text-[11px] leading-4" style={{ color: theme.node.muted }}>{t("agent.connect.pathHint")}</div>
                                <div className="mt-1.5 flex items-center gap-1.5">
                                    <Input
                                        size="small"
                                        value={pathDraft[runtime.id] ?? runtime.customPath ?? ""}
                                        placeholder={t("agent.connect.pathPlaceholder")}
                                        disabled={pathBusy === runtime.id}
                                        onChange={(event) => setPathDraft((prev) => ({ ...prev, [runtime.id]: event.target.value }))}
                                        onPressEnter={() => {
                                            const dir = (pathDraft[runtime.id] ?? runtime.customPath ?? "").trim();
                                            if (dir) void applyRuntimeDir(runtime, dir);
                                        }}
                                    />
                                    <Tooltip title={t("agent.connect.chooseDirHint")}>
                                        <Button size="small" icon={<FolderSearch className="size-3.5" />} disabled={pathBusy === runtime.id} onClick={() => void chooseRuntimeDir(runtime)}>
                                            {t("agent.connect.chooseDir")}
                                        </Button>
                                    </Tooltip>
                                    <Button
                                        size="small"
                                        type="primary"
                                        ghost
                                        loading={pathBusy === runtime.id}
                                        disabled={!(pathDraft[runtime.id] ?? runtime.customPath ?? "").trim()}
                                        onClick={() => void applyRuntimeDir(runtime, (pathDraft[runtime.id] ?? runtime.customPath ?? "").trim())}
                                    >
                                        {t("agent.connect.scanDir")}
                                    </Button>
                                    {runtime.customPath ? (
                                        <Button size="small" type="text" disabled={pathBusy === runtime.id} onClick={() => void applyRuntimeDir(runtime, "")}>
                                            {t("agent.connect.clearDir")}
                                        </Button>
                                    ) : null}
                                </div>
                                {notice ? (
                                    <div className="mt-1 text-[11px] leading-4" style={{ color: notice.ok ? "#16a34a" : "#dc2626" }}>{notice.text}</div>
                                ) : null}
                            </div>
                        ) : null}
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
