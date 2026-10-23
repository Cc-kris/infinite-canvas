import { spawn } from "node:child_process";

import { AGENT_PROMPT } from "../config.js";
import { errorMessage } from "../utils/value.js";
import { resolveCommand } from "./runtimes.js";
import type { AgentEmit } from "./types.js";

/**
 * Galley 是编排型 Agent：canvas-agent 通过 CLI 建会话并轮询结果。
 * 路径每次调用时现算：CLI 可能在画布启动之后才装好，模块加载时缓存会一直失败。
 */
function galleyBin() {
    return process.env.GALLEY_BIN || resolveCommand("galley");
}
const POLL_INTERVAL_MS = 1500;
const TIMEOUT_MS = Number(process.env.GALLEY_TURN_TIMEOUT_MS) || 15 * 60 * 1000;

/** 当前 Galley 会话 id：同一画布对话复用，才能像 Codex 那样保持上下文。 */
let currentSessionId = "";
/** 当前会话创建时用的模型（displayName）；换模型要新建会话，因为 Galley 的模型在会话创建时固定。 */
let currentSessionModel = "";
/** 本轮是否已被用户中断：轮询线程据此提前退出，不再等满 15 分钟。 */
let interrupted = false;

/** 断开/重置会话时清空 Galley 会话上下文。 */
export function resetGalleySession() {
    currentSessionId = "";
    currentSessionModel = "";
}

/** 当前 Galley 会话 id（调试与日志用）。 */
export function galleySessionId() {
    return currentSessionId;
}

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
    /** 用户在画布侧选的模型（`galley llm list` 的 displayName）。 */
    model?: string;
};

/** 用 Galley CLI 跑一轮对话，并把结果与画布操作回传给网页。 */
export async function runGalleyTurn({ prompt, emit, callTool, model }: GalleyTurnOptions) {
    if (!prompt.trim()) return;
    const threadId = "galley";
    const turnId = `galley-${Date.now()}`;
    interrupted = false;
    emit("agent_event", { agent: "galley", threadId, turnId, type: "turn.started" });
    try {
        const task = `${AGENT_PROMPT}\n${OPS_PROTOCOL}\n\n用户请求：${prompt}`;
        const { sessionId, baseline } = await dispatch(task, model, emit);
        const text = await waitForAnswer(sessionId, baseline);
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
        emit("agent_event", { agent: "galley", threadId, turnId, type: "turn.completed", status: "completed" });
        emit("agent_done", { agent: "galley", code: 0 });
    } catch (error) {
        const message = errorMessage(error);
        emit("agent_error", { message });
        emit("agent_event", { agent: "galley", threadId, turnId, type: "turn.completed", status: "failed", error: { message } });
        emit("agent_done", { agent: "galley", code: 1 });
    }
}

/**
 * 把这一轮任务投给 Galley：已有会话就 `session send` 续接（保留上下文），
 * 没有会话或会话已失效才 `session new`。返回本轮起点，用来区分新回复与历史。
 */
async function dispatch(task: string, model: string | undefined, emit: AgentEmit) {
    // 0.25.7: Galley 的模型在会话创建时固定，换模型必须新建会话，否则选择不生效。
    const wanted = model && model !== "default" ? model : "";
    if (currentSessionId && currentSessionModel !== wanted) {
        emit("agent_log", { text: `模型已切换为 ${wanted || "跟随 Galley"}，新建 Galley 会话` });
        resetGalleySession();
    }
    if (currentSessionId) {
        const baseline = await lastTurnIndex(currentSessionId);
        try {
            await runCli(["session", "send", currentSessionId, task]);
            emit("agent_log", { text: `Galley session: ${currentSessionId}（续接）` });
            return { sessionId: currentSessionId, baseline };
        } catch (error) {
            emit("agent_log", { text: `Galley 续接失败，改为新会话：${errorMessage(error)}` });
            currentSessionId = "";
        }
    }
    const sessionId = await createSession(task, model);
    currentSessionId = sessionId;
    currentSessionModel = model && model !== "default" ? model : "";
    emit("agent_log", { text: `Galley session: ${sessionId}` });
    // 新会话首轮回复的 turnIndex 就是 0，起点必须取 -1，否则永远等不到。
    return { sessionId, baseline: -1 };
}

/** 中断当前 Galley 轮次；返回是否真的发出了停止指令。 */
export async function interruptGalleyTurn() {
    if (!currentSessionId) return false;
    interrupted = true;
    try {
        await runCli(["session", "stop", currentSessionId]);
        return true;
    } catch {
        return false;
    }
}

/** 读取可选模型：直接复用 Galley 自己的模型库，避免画布侧硬编码一份。 */
export async function listGalleyModels() {
    const output = await runCli(["llm", "list"]);
    const rows = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .flatMap((line) => {
            try {
                return [JSON.parse(line) as { name?: string; key?: string; displayName?: string; isCurrent?: boolean }];
            } catch {
                return [];
            }
        });
    const data = rows
        .map((row) => {
            const name = String(row.displayName || row.name || "").trim();
            if (!name) return null;
            return {
                id: String(row.key || name),
                model: name,
                displayName: name,
                defaultReasoningEffort: "medium",
                supportedReasoningEfforts: [] as Array<{ reasoningEffort: string }>,
                isDefault: Boolean(row.isCurrent),
            };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;
    return {
        data: [
            { id: "default", model: "default", displayName: "跟随 Galley 当前模型", defaultReasoningEffort: "medium", supportedReasoningEfforts: [], isDefault: !rows.some((row) => row.isCurrent) },
            ...data,
        ],
    };
}

/** 新建 Galley 会话，返回会话 id。 */
async function createSession(task: string, model?: string) {
    const args = ["session", "new", "--supervisor", "canvas-agent"];
    if (model && model !== "default") args.push("--llm", model);
    args.push(task);
    const output = await runCli(args);
    const line = output.split(/\r?\n/).filter(Boolean).pop() || "{}";
    const payload = JSON.parse(line) as { session?: { id?: string }; error?: string; message?: string };
    const id = payload.session?.id;
    if (!id) throw new Error(payload.message || payload.error || "Galley 会话创建失败");
    return id;
}

/** 会话最后一轮的 turnIndex；没有历史返回 0。 */
async function lastTurnIndex(sessionId: string) {
    const messages = await showMessages(sessionId, 4);
    return messages.reduce((max, item) => Math.max(max, Number(item.turnIndex) || 0), 0);
}

/** 轮询会话直到出现本轮助手回复（turnIndex 超过本轮起点才算新回复）。 */
async function waitForAnswer(sessionId: string, baseline: number) {
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (interrupted) throw new Error("已停止本轮 Galley 任务");
        const messages = await showMessages(sessionId, 8);
        const answer = messages
            .filter((item) => item.role === "agent" && String(item.content || "").trim() && (Number(item.turnIndex) || 0) > baseline)
            .pop();
        if (answer?.content) return answer.content;
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error("Galley 会话超时未返回结果");
}

type GalleyMessage = { id?: string; role?: string; content?: string; turnIndex?: number };

/** 读取会话尾部若干条消息；以 NDJSON 逐行返回。 */
async function showMessages(sessionId: string, tail: number): Promise<GalleyMessage[]> {
    const output = await runCli(["session", "show", sessionId, "--tail", String(tail)]);
    return output
        .split(/\r?\n/)
        .filter(Boolean)
        .flatMap((line) => {
            try {
                return [JSON.parse(line) as GalleyMessage];
            } catch {
                return [];
            }
        });
}

/** Windows 的 cmd 用系统代码页（中文环境是 GBK）输出，直接按 UTF-8 解会变成乱码。 */
function decodeOutput(buffer: Buffer) {
    if (!buffer.length) return "";
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
        try {
            return new TextDecoder("gbk").decode(buffer);
        } catch {
            return buffer.toString("latin1");
        }
    }
}

/** 把 cmd 的本地化报错换成用户能照做的建议。 */
function friendlyCliError(detail: string) {
    if (/不是内部或外部命令|is not recognized as an internal or external command/i.test(detail)) {
        return "未找到 Galley 命令行工具（galley.exe）。请先打开一次 Galley 桌面版（首次启动会登记 CLI 位置），或在设置里重新连接 Agent。";
    }
    return detail;
}

/** 执行一条 galley CLI 命令并收集 stdout。 */
function runCli(args: string[]) {
    return new Promise<string>((resolve, reject) => {
        const bin = galleyBin();
        if (!bin) {
            reject(new Error("未找到 Galley 命令行工具（galley.exe）。请先打开一次 Galley 桌面版（首次启动会登记 CLI 位置），或设置环境变量 GALLEY_BIN 指向 galley.exe。"));
            return;
        }
        // Windows 上只有 .cmd / .bat 需要经过 shell；.exe 直接 spawn，避免路径含空格时被 cmd 拆开。
        const useShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(bin);
        const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], shell: useShell, windowsHide: true });
        const out: Buffer[] = [];
        const errOut: Buffer[] = [];
        child.stdout?.on("data", (chunk: Buffer) => out.push(chunk));
        child.stderr?.on("data", (chunk: Buffer) => errOut.push(chunk));
        child.on("error", (error) => reject(new Error(`无法启动 Galley：${error.message}`)));
        child.on("close", (code) => {
            if (code === 0) {
                resolve(decodeOutput(Buffer.concat(out)));
                return;
            }
            reject(new Error(friendlyCliError(decodeOutput(Buffer.concat(errOut)).trim()) || `galley 退出码 ${code}`));
        });
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
    // Galley 会在回答末尾附 <next-suggestion> 标签，画布侧不需要。
    const withoutSuggestion = clean.replace(/<next-suggestion>[\s\S]*?<\/next-suggestion>/gi, "").trim();
    return { clean: withoutSuggestion, ops };
}
