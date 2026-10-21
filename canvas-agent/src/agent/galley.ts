import { spawn } from "node:child_process";

import { AGENT_PROMPT } from "../config.js";
import { errorMessage } from "../utils/value.js";
import { resolveCommand } from "./runtimes.js";
import type { AgentEmit } from "./types.js";

/** Galley 是编排型 Agent：canvas-agent 通过 CLI 建会话并轮询结果。 */
const GALLEY_BIN = process.env.GALLEY_BIN || resolveCommand("galley") || "galley";
const POLL_INTERVAL_MS = 1500;
const TIMEOUT_MS = Number(process.env.GALLEY_TURN_TIMEOUT_MS) || 15 * 60 * 1000;

/** 无 MCP 的运行时通过围栏代码块回传画布操作，这里统一声明协议。 */
const OPS_PROTOCOL = [
    "",
    "## 画布操作输出协议（重要）",
    "你无法直接调用 MCP 工具。需要修改画布时，在回答里追加一个 ```canvas-ops 代码块，内容为 JSON 数组，元素形如：",
    '```canvas-ops',
    '[{ "type": "add_text_nodes", "items": [{ "text": "示例" }] }]',
    "```",
    "可用 type 与 MCP 工具同名语义：add_node / add_text_nodes / update_node / delete_nodes / create_image_prompt_flow / create_generation_flow。",
    "不需要改画布时不要输出该代码块。",
].join("\n");

type GalleyTurnOptions = {
    prompt: string;
    emit: AgentEmit;
    /** 复用 CanvasSession.callTool，把文本里的操作真正落到网页。 */
    callTool: (name: string, input: unknown) => Promise<unknown>;
};

/** 用 Galley CLI 跑一轮对话，并把结果与画布操作回传给网页。 */
export async function runGalleyTurn({ prompt, emit, callTool }: GalleyTurnOptions) {
    if (!prompt.trim()) return;
    const threadId = "galley";
    const turnId = `galley-${Date.now()}`;
    emit("agent_event", { agent: "galley", threadId, turnId, type: "turn.started" });
    try {
        const sessionId = await createSession(`${AGENT_PROMPT}\n${OPS_PROTOCOL}\n\n用户请求：${prompt}`);
        emit("agent_log", { text: `Galley session: ${sessionId}` });
        const text = await waitForAnswer(sessionId);
        const { clean, ops } = extractOps(text);
        if (ops.length) {
            try {
                await callTool("canvas_apply_ops", { ops });
            } catch (error) {
                emit("agent_log", { text: `画布操作失败：${errorMessage(error)}` });
            }
        }
        emit("agent_event", {
            agent: "galley",
            threadId,
            turnId,
            type: "item.completed",
            item: { id: `galley-${Date.now()}`, type: "agent_message", text: clean },
        });
        emit("agent_done", { agent: "galley", code: 0 });
    } catch (error) {
        emit("agent_error", { message: errorMessage(error) });
        emit("agent_done", { agent: "galley", code: 1 });
    }
}

/** 新建 Galley 会话，返回会话 id。 */
async function createSession(task: string) {
    const output = await runCli(["session", "new", "--supervisor", "canvas-agent", task]);
    const line = output.split(/\r?\n/).filter(Boolean).pop() || "{}";
    const payload = JSON.parse(line) as { session?: { id?: string }; error?: string; message?: string };
    const id = payload.session?.id;
    if (!id) throw new Error(payload.message || payload.error || "Galley 会话创建失败");
    return id;
}

/** 轮询会话直到出现本轮助手回复。 */
async function waitForAnswer(sessionId: string) {
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
        const output = await runCli(["session", "show", sessionId, "--tail=10"]);
        const messages = output
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => {
                try {
                    return JSON.parse(line) as { role?: string; content?: string; turnIndex?: number };
                } catch {
                    return null;
                }
            })
            .filter(Boolean) as Array<{ role?: string; content?: string; turnIndex?: number }>;
        const answer = messages.filter((item) => item.role === "agent" && String(item.content || "").trim()).pop();
        if (answer?.content) return answer.content;
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error("Galley 会话超时未返回结果");
}

/** 执行一条 galley CLI 命令并收集 stdout。 */
function runCli(args: string[]) {
    return new Promise<string>((resolve, reject) => {
        const child = spawn(GALLEY_BIN, args, { stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32", windowsHide: true });
        let out = "";
        let err = "";
        child.stdout?.on("data", (chunk) => (out += chunk.toString()));
        child.stderr?.on("data", (chunk) => (err += chunk.toString()));
        child.on("error", (error) => reject(new Error(`无法启动 galley：${error.message}`)));
        child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err.trim() || `galley 退出码 ${code}`))));
    });
}

/** 从回答中拆出 canvas-ops 代码块。 */
export function extractOps(text: string) {
    const ops: unknown[] = [];
    const clean = text.replace(/```canvas-ops\s*([\s\S]*?)```/g, (_match, body: string) => {
        try {
            const parsed = JSON.parse(body.trim());
            if (Array.isArray(parsed)) ops.push(...parsed);
            else if (parsed && typeof parsed === "object") ops.push(parsed);
        } catch {
            /* 解析失败时保留原文，交给用户判断 */
        }
        return "";
    });
    return { clean: clean.trim(), ops };
}
