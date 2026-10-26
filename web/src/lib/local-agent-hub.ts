/**
 * 网页版 Agent 桥接垫片。
 *
 * 桌面端由 Electron preload 注入 window.infiniteCanvasDesktop.agentHub，网页版没人注入，
 * 于是连接页退化成「手填 Local URL + token」。这里在 dev server 提供了本机 hub
 * （web/vite-plugins/local-agent-hub.ts）的前提下补一层**逐方法同形**的垫片：
 *
 *   list / connect / disconnect / pickDirectory / setRuntimePath / onChanged
 *
 * 六个方法与 desktop/preload.cjs 的 agentHub 一一对应，返回字段也一致（运行时探测本身
 * 由 desktop/agent-detect.js 提供，客户端与网页端同一份实现）。前端组件因此不需要分叉，
 * 断开连接后卡片仍旧显示已安装的 CLI 与版本，而不是退回手填入口。
 *
 * 探活失败（远端部署 / 没有 hub 中间件）时什么都不装，调用方照旧走手填入口。
 */

type HubState = {
    server: { running: boolean; url: string; token: string; error?: string };
    runtime: string;
    mode: "plugin" | "runtime" | "";
    connecting?: { runtime: string; startedAt: number; stage?: string } | null;
    runtimes: unknown[];
};

type DesktopHost = {
    infiniteCanvasDesktop?: {
        agentHub?: unknown;
        isDesktop?: boolean;
        appVersion?: string;
        platform?: string;
        [key: string]: unknown;
    };
};

const endpoint = (path: string) => `/__canvas-hub${path}`;

const readState = async (): Promise<HubState & { ok?: boolean; localHub?: boolean }> => {
    const res = await fetch(endpoint("/state"), { cache: "no-store" });
    if (!res.ok) throw new Error(`local hub HTTP ${res.status}`);
    return (await res.json()) as HubState & { ok?: boolean; localHub?: boolean };
};

const post = async (path: string, body: Record<string, unknown> = {}) => {
    const res = await fetch(endpoint(path), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`local hub HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
};

/** 返回 true 表示本机 hub 可用，垫片已安装。 */
export async function installLocalAgentHub() {
    const host = window as unknown as DesktopHost;
    if (host.infiniteCanvasDesktop?.agentHub) return true;
    try {
        const state = await readState();
        if (!state.localHub) return false;
        host.infiniteCanvasDesktop = {
            ...(host.infiniteCanvasDesktop || {}),
            isDesktop: false,
            agentHub: {
                list: async () => {
                    const body = await readState();
                    return {
                        server: body.server,
                        runtime: body.runtime,
                        mode: body.mode,
                        connecting: body.connecting ?? null,
                        runtimes: body.runtimes || [],
                    };
                },
                connect: async (id: string) => (await post("/connect", { runtime: id })) as never,
                disconnect: async () => (await post("/disconnect")) as never,
                // 原生目录选择框由中间件调用宿主 OS 弹出（与桌面版 dialog 同一个交互）。
                pickDirectory: async (id: string) => (await post("/pick-dir", { runtime: id })) as never,
                setRuntimePath: async (id: string, dir: string) => (await post("/path", { runtime: id, dir })) as never,
                /**
                 * 桌面端的 onChanged 由主进程推送；网页端没有推送通道，
                 * 用 2s 轮询 /state 并在快照变化时回调，语义等价（返回取消订阅函数）。
                 */
                onChanged: (callback: () => void) => {
                    let last = "";
                    let stopped = false;
                    const tick = async () => {
                        if (stopped) return;
                        try {
                            const body = await readState();
                            const snapshot = JSON.stringify({
                                server: body.server?.running,
                                runtime: body.runtime,
                                mode: body.mode,
                                connecting: body.connecting ?? null,
                                runtimes: body.runtimes,
                            });
                            if (last && snapshot !== last) callback();
                            last = snapshot;
                        } catch {
                            /* 中间件短暂不可用时静默重试 */
                        }
                        if (!stopped) window.setTimeout(tick, 2000);
                    };
                    void tick();
                    return () => {
                        stopped = true;
                    };
                },
            },
        };
        return true;
    } catch {
        return false;
    }
}
