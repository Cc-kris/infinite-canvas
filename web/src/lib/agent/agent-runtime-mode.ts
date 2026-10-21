import { fetchAgentRuntimeConfig } from "@/services/api/canvas-agent";

/** 画布侧 Agent 后端运行时；codex 走原生 MCP 会话，claude/galley 由 canvas-agent 直接驱动 CLI。 */
export type AgentRuntimeMode = "codex" | "claude" | "galley";

let cache: { key: string; promise: Promise<AgentRuntimeMode>; value: AgentRuntimeMode } | null = null;

function toMode(runtime: string, mode?: string): AgentRuntimeMode {
    if (mode === "bridge" || runtime === "claude" || runtime === "galley") return runtime === "galley" ? "galley" : "claude";
    return "codex";
}

/** 读取当前连接的运行时，缓存一次避免每个请求都打 /config。 */
export function resolveAgentRuntime(endpoint: string, token: string): Promise<AgentRuntimeMode> {
    const key = `${endpoint}\u0000${token}`;
    if (cache?.key === key) return cache.promise;
    const promise = fetchAgentRuntimeConfig(endpoint, token)
        .then((data) => toMode(String(data.runtime || ""), data.mode))
        .catch(() => "codex" as AgentRuntimeMode);
    cache = { key, promise, value: "codex" };
    void promise.then((value) => {
        if (cache?.key === key) cache.value = value;
    });
    return promise;
}

/** 同步读取已解析的运行时，用于气泡标题等纯展示位置。 */
export function currentAgentRuntime(): AgentRuntimeMode {
    return cache?.value || "codex";
}

/** 断开或切换连接时清掉缓存，避免沿用上一条连接的运行时。 */
export function resetAgentRuntimeCache() {
    cache = null;
}

/** 运行时展示名，聊天气泡与提示文案共用。 */
export function agentRuntimeLabel(runtime: AgentRuntimeMode = currentAgentRuntime()) {
    if (runtime === "claude") return "Claude Code";
    if (runtime === "galley") return "Galley";
    return "Codex";
}
