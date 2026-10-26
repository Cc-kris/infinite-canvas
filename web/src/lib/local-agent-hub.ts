/**
 * 网页版 Agent 桥接垫片。
 *
 * 桌面端由 Electron 注入 window.infiniteCanvasDesktop.agentHub；网页版没人注入，
 * 于是连接页退化成「手填 Local URL + token」。这里在 dev server 提供了本机 hub
 * （web/vite-plugins/local-agent-hub.ts）的前提下补一层同形垫片，让连接界面、
 * 连接流程、断连行为与桌面客户端完全一致。
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

const endpoint = (path: string) => `/__canvas-hub${path}`;

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
    const host = window as unknown as { infiniteCanvasDesktop?: { agentHub?: unknown; isDesktop?: boolean } };
    if (host.infiniteCanvasDesktop?.agentHub) return true;
    try {
        const res = await fetch(endpoint("/state"), { cache: "no-store" });
        if (!res.ok) return false;
        const state = (await res.json()) as HubState & { ok?: boolean; localHub?: boolean };
        if (!state.localHub) return false;
        host.infiniteCanvasDesktop = {
            ...(host.infiniteCanvasDesktop || {}),
            isDesktop: false,
            agentHub: {
                list: async () => {
                    const next = await fetch(endpoint("/state"), { cache: "no-store" });
                    if (!next.ok) throw new Error(`local hub HTTP ${next.status}`);
                    const body = (await next.json()) as HubState & { ok?: boolean };
                    return { server: body.server, runtime: body.runtime, mode: body.mode, connecting: body.connecting ?? null, runtimes: body.runtimes || [] };
                },
                connect: async (id: string) => (await post("/connect", { runtime: id })) as never,
                disconnect: async () => (await post("/disconnect")) as never,
                // 浏览器弹不出系统目录框：返回 canceled，卡片会保留手填输入框。
                pickDirectory: async () => ({ ok: false, canceled: true }),
                setRuntimePath: async (id: string, dir: string) => (await post("/path", { runtime: id, dir })) as never,
            },
        };
        return true;
    } catch {
        return false;
    }
}
