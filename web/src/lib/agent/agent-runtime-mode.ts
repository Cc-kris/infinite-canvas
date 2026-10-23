import { fetchAgentRuntimeConfig } from "@/services/api/canvas-agent";

/** 画布侧 Agent 后端运行时；codex 走原生 MCP 会话，claude/galley 由 canvas-agent 直接驱动 CLI。 */
export type AgentRuntimeMode = "codex" | "claude" | "galley";

let cache: { key: string; promise: Promise<AgentRuntimeMode>; value: AgentRuntimeMode } | null = null;
function toMode(runtime: string, mode?: string): AgentRuntimeMode {
    if (mode === "bridge" || runtime === "claude" || runtime === "galley") return runtime === "galley" ? "galley" : "claude";
    return "codex";
}

/**
 * 读取当前连接的运行时，缓存一次避免每个请求都打 /config。
 * 0.26: 解析失败不再落缓存——以前失败也兜底成 codex 并缓存，后续请求就永远按 codex 走，
 * 换成 Claude / Galley 后模型列表和会话都会错位。force 用于切换运行时后强制重读。
 */
export function resolveAgentRuntime(endpoint: string, token: string, force = false): Promise<AgentRuntimeMode> {
    const key = `${endpoint}\u0000${token}`;
    if (!force && cache?.key === key) return cache.promise;
    const promise = fetchAgentRuntimeConfig(endpoint, token).then((data) => {
        if (!data?.ok) throw new Error("runtime config unavailable");
        const mode = toMode(String(data.runtime || ""), data.mode);
        if (cache?.key === key) cache.value = mode;
        return mode;
    });
    cache = { key, promise, value: cache?.key === key ? cache.value : "codex" };
    void promise.catch(() => {
        // 失败就丢掉缓存，下次重新问一次，绝不把错误结论固化下来。
        if (cache?.key === key) cache = null;
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
