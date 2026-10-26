import { spawn, type ChildProcess } from "node:child_process";

import { AGENT_PROMPT } from "../config.js";
import { createAgentLogWriter } from "../utils/agent-runtime.js";
import { errorMessage } from "../utils/value.js";
import { resolveCommand } from "./runtimes.js";
import type { AgentEmit } from "./types.js";

/** Claude Code 在 Canvas Agent 里是单线程会话，threadId 固定，便于前端复用同一个 chat。 */
export const CLAUDE_THREAD_ID = "claude";
const CLAUDE_BIN = process.env.CLAUDE_BIN || resolveCommand("claude") || "claude";

let currentChild: ChildProcess | null = null;
let currentSessionId = "";

/** 当前 Claude Code 会话 id，用于下一轮 --resume 延续上下文。 */
export function claudeSessionId() {
    return currentSessionId;
}

/** 断开/重置会话时清空 Claude 会话上下文。 */
export function resetClaudeSession() {
    currentSessionId = "";
}

/** 中断正在执行的 Claude 轮次，返回是否真的有进程被终止。 */
export function interruptClaudeTurn() {
    const child = currentChild;
    currentChild = null;
    if (!child || child.killed) return false;
    child.kill("SIGTERM");
    return true;
}

export type ClaudeTurnOptions = {
    prompt: string;
    emit: AgentEmit;
    model?: string;
};

/** 使用 Claude CLI 执行一轮对话，并把 stream-json 归一化成前端认识的 Agent 事件。 */
export function runClaudeTurn({ prompt, emit, model }: ClaudeTurnOptions) {
    const fullPrompt = withAgentPrompt(prompt);
    if (!fullPrompt) return;
    const threadId = CLAUDE_THREAD_ID;
    const turnId = `claude-${Date.now()}`;
    emit("agent_event", { agent: "claude", threadId, turnId, type: "turn.started" });
    const args = buildArgs(fullPrompt, model);
    startChild(args, { emit, threadId, turnId }, 0);
}

/** 组装 Claude CLI 参数：带模型、续接会话与画布 MCP 工具白名单。 */
function buildArgs(prompt: string, model?: string) {
    // --allowedTools 是可变参数选项，会把它后面的位置参数当成工具名吞掉；
    // prompt 必须排在它之前，否则 CLI 报 "Input must be provided"（退出码 1）。
    const args = ["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages"];
    if (model && model !== "default") args.push("--model", model);
    if (currentSessionId) args.push("--resume", currentSessionId);
    args.push(prompt, "--allowedTools", "mcp__infinite-canvas__*");
    return args;
}

type TurnContext = {
    emit: AgentEmit;
    threadId: string;
    turnId: string;
};

/** 启动 claude 进程；续接失败（会话不存在）时退回新会话重试一次。 */
function startChild(args: string[], context: TurnContext, attempt: number) {
    const state = createState(context);
    const usedResume = args.includes("--resume");
    let child: ChildProcess;
    try {
        child = spawn(CLAUDE_BIN, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    } catch (error) {
        context.emit("agent_error", { message: errorMessage(error) });
        context.emit("agent_event", { agent: "claude", threadId: context.threadId, turnId: context.turnId, type: "turn.completed", status: "failed", error: { message: errorMessage(error) } });
        return;
    }
    currentChild = child;
    pipeJsonLines(child, state);
    child.on("close", (code) => {
        if (currentChild === child) currentChild = null;
        state.flushLogs();
        if (usedResume && attempt === 0 && !state.sawResult && !state.sawText) {
            resetClaudeSession();
            const retryArgs = args.filter((value, index) => value !== "--resume" && args[index - 1] !== "--resume");
            startChild(retryArgs, context, attempt + 1);
            return;
        }
        finishTurn(state, code);
    });
}

/** 单轮解析状态：跟踪流式文本块、工具调用与结果，避免重复渲染。 */
function createState(context: TurnContext) {
    const log = createAgentLogWriter((text) => context.emit("agent_log", { text }));
    return {
        ...context,
        textBlocks: new Map<number, { id: string; chars: number }>(),
        toolNames: new Map<string, string>(),
        startedTools: new Set<string>(),
        sawResult: false,
        sawText: false,
        resultText: "",
        flushLogs: () => log.flush(),
        writeLog: (text: string) => log.write(text),
    };
}

type TurnState = ReturnType<typeof createState>;

/** 将 Claude CLI 的 JSON Lines 输出逐行转换成 Agent 事件。 */
function pipeJsonLines(child: ChildProcess, state: TurnState) {
    let buffer = "";
    child.stdout?.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        lines.filter(Boolean).forEach((line) => {
            try {
                handleClaudeMessage(JSON.parse(line) as Record<string, unknown>, state);
            } catch {
                state.emit("agent_log", { text: line });
            }
        });
    });
    child.stderr?.on("data", (chunk) => state.writeLog(chunk.toString()));
    child.on("error", (error) => {
        state.flushLogs();
        state.emit("agent_error", { message: `无法启动 claude：${error.message}` });
    });
}

type ClaudeBlock = { type?: string; id?: string; name?: string; text?: string; input?: unknown; tool_use_id?: string; content?: unknown; is_error?: boolean };

/** 处理一条 Claude stream-json 消息。 */
function handleClaudeMessage(payload: Record<string, unknown>, state: TurnState) {
    const type = String(payload.type || "");
    if (type === "system" && payload.subtype === "init") {
        onInit(payload, state);
        return;
    }
    if (type === "stream_event") {
        onStreamEvent(payload.event as Record<string, unknown> | undefined, state);
        return;
    }
    if (type === "assistant") {
        const message = payload.message as { id?: string; content?: ClaudeBlock[] } | undefined;
        (message?.content || []).forEach((block, index) => onAssistantBlock(block, index, message?.id || "", state));
        return;
    }
    if (type === "user") {
        const message = payload.message as { content?: ClaudeBlock[] } | undefined;
        (message?.content || []).forEach((block) => onToolResult(block, state));
        return;
    }
    if (type === "result") onResult(payload, state);
}

/** 首帧 init 带上 session_id 与 MCP 连接状态，这里回写会话上下文并同步 MCP 面板。 */
function onInit(payload: Record<string, unknown>, state: TurnState) {
    const sessionId = String(payload.session_id || "");
    if (sessionId) currentSessionId = sessionId;
    const servers = Array.isArray(payload.mcp_servers) ? (payload.mcp_servers as Array<{ name?: string; status?: string }>) : [];
    servers.forEach((server) => {
        const name = String(server.name || "");
        if (!name) return;
        const status = String(server.status || "");
        state.emit("agent_bootstrap", {
            type: "mcp.startup",
            phase: "preheat",
            threadId: state.threadId,
            name,
            status: status === "connected" ? "ready" : status === "failed" ? "failed" : "starting",
            error: status === "failed" ? "MCP 服务未连接" : null,
        });
    });
    state.emit("agent_log", { text: `Claude session ${sessionId || "-"} · ${servers.length} MCP` });
}

/** 流式增量：文本按 content block 累积，工具调用在开始时先占位。 */
function onStreamEvent(event: Record<string, unknown> | undefined, state: TurnState) {
    if (!event) return;
    const index = Number(event.index) || 0;
    if (event.type === "content_block_start") {
        const block = event.content_block as ClaudeBlock | undefined;
        if (block?.type === "tool_use" && block.id) startTool(block.id, String(block.name || ""), state);
        return;
    }
    if (event.type !== "content_block_delta") return;
    const delta = event.delta as { type?: string; text?: string } | undefined;
    if (delta?.type !== "text_delta" || !delta.text) return;
    const id = textBlockId(index, state);
    state.textBlocks.get(index)!.chars += delta.text.length;
    state.sawText = true;
    state.emit("agent_event", { agent: "claude", threadId: state.threadId, turnId: state.turnId, type: "item.updated", item: { id, type: "agent_message", delta: delta.text } });
}

/** 完整 assistant 消息：补发最终文本（与流式同 id），并登记工具调用。 */
function onAssistantBlock(block: ClaudeBlock, index: number, messageId: string, state: TurnState) {
    if (block.type === "text") {
        const text = String(block.text || "");
        const streamed = state.textBlocks.get(index);
        if (!text.trim() && !streamed?.chars) return;
        const id = streamed && streamed.chars ? streamed.id : `claude-msg-${messageId || state.turnId}-${index}`;
        state.sawText = true;
        state.emit("agent_event", { agent: "claude", threadId: state.threadId, turnId: state.turnId, type: "item.completed", item: { id, type: "agent_message", text } });
        return;
    }
    if (block.type === "tool_use" && block.id) startTool(block.id, String(block.name || ""), state);
}

/** 工具开始执行：先渲染运行中的条目，结果到达后再补结论。 */
function startTool(id: string, name: string, state: TurnState) {
    state.toolNames.set(id, name);
    if (state.startedTools.has(id)) return;
    state.startedTools.add(id);
    state.emit("agent_event", {
        agent: "claude",
        threadId: state.threadId,
        turnId: state.turnId,
        type: "item.started",
        item: { id, type: "mcp_tool_call", tool: name, arguments: {}, status: "inProgress" },
    });
}

/** 工具结果：用同 id 收尾，前端会把运行中条目更新为完成/失败。 */
function onToolResult(block: ClaudeBlock, state: TurnState) {
    if (block.type !== "tool_result" || !block.tool_use_id) return;
    const id = block.tool_use_id;
    const name = state.toolNames.get(id) || "";
    const result = toolResultText(block.content);
    const failed = Boolean(block.is_error);
    state.emit("agent_event", {
        agent: "claude",
        threadId: state.threadId,
        turnId: state.turnId,
        type: "item.completed",
        item: { id, type: "mcp_tool_call", tool: name, status: failed ? "failed" : "completed", result, ...(failed ? { error: { message: result || "工具执行失败" } } : {}) },
    });
}

/** 结束帧 result：补一条最终文本、上报用量并结束本轮。 */
function onResult(payload: Record<string, unknown>, state: TurnState) {
    state.sawResult = true;
    state.resultText = String(payload.result || "");
    const usage = payload.usage as { input_tokens?: number; cache_read_input_tokens?: number; output_tokens?: number } | undefined;
    if (usage) {
        state.emit("agent_event", {
            agent: "claude",
            threadId: state.threadId,
            turnId: state.turnId,
            type: "usage.updated",
            usage: { input_tokens: usage.input_tokens || 0, cached_input_tokens: usage.cache_read_input_tokens || 0, output_tokens: usage.output_tokens || 0 },
        });
    }
    const failed = String(payload.subtype || "") !== "success" && String(payload.subtype || "") !== "" ? String(payload.subtype || "") : "";
    if (failed) {
        state.emit("agent_event", { agent: "claude", threadId: state.threadId, turnId: state.turnId, type: "turn.completed", status: "failed", error: { message: state.resultText || failed } });
        return;
    }
    if (!state.sawText && state.resultText.trim()) {
        state.emit("agent_event", { agent: "claude", threadId: state.threadId, turnId: state.turnId, type: "item.completed", item: { id: `claude-${state.turnId}-final`, type: "agent_message", text: state.resultText } });
    }
    state.emit("agent_event", { agent: "claude", threadId: state.threadId, turnId: state.turnId, type: "turn.completed", status: "completed" });
}

/** 进程退出：兜底结束本轮，避免前端一直处于等待状态。 */
function finishTurn(state: TurnState, code: number | null) {
    if (!state.sawResult) {
        const failed = code !== 0;
        if (failed && !state.sawText) {
            state.emit("agent_error", { message: `Claude 退出码 ${code ?? -1}，请检查 claude CLI 是否可用` });
        }
        state.emit("agent_event", { agent: "claude", threadId: state.threadId, turnId: state.turnId, type: "turn.completed", status: failed ? "failed" : "completed", ...(failed ? { error: { message: `Claude 退出码 ${code ?? -1}` } } : {}) });
    }
    state.emit("agent_done", { agent: "claude", code });
}

/** 文本块 id 在整轮内稳定，流式增量与最终消息共用同一个 id。 */
function textBlockId(index: number, state: TurnState) {
    const existing = state.textBlocks.get(index);
    if (existing) return existing.id;
    const id = `claude-${state.turnId}-text-${index}`;
    state.textBlocks.set(index, { id, chars: 0 });
    return id;
}

/** 工具结果可能是字符串或内容块数组，统一压成纯文本。 */
function toolResultText(content: unknown) {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return content ? JSON.stringify(content) : "";
    return content
        .map((item) => {
            const block = item as { type?: string; text?: string };
            if (block?.type === "text") return String(block.text || "");
            return "";
        })
        .filter(Boolean)
        .join("\n");
}

/** 为 Claude CLI 请求拼接 Canvas Agent 指令。 */
function withAgentPrompt(prompt: string) {
    return prompt.trim() ? `${AGENT_PROMPT}\n\n用户请求：${prompt}` : "";
}
