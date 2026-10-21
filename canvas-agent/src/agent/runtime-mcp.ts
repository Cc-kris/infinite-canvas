import { execFile } from "node:child_process";

import { resolveCommand } from "./runtimes.js";

/** 单个运行时的 MCP 服务状态，供画布面板展示。 */
export type RuntimeMcpServer = {
    name: string;
    status: "ready" | "failed";
    detail: string;
};

const CLAUDE_BIN = process.env.CLAUDE_BIN || resolveCommand("claude") || "claude";
const ANSI = /\u001b\[[0-9;]*m/g;

/** 运行 CLI 并合并输出；健康检查失败时 CLI 会返回非零码，但正文仍是有效清单。 */
function runClaude(argv: string[], timeoutMs = 30000) {
    return new Promise<string>((resolve, reject) => {
        execFile(CLAUDE_BIN, argv, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, env: process.env }, (error, stdout, stderr) => {
            const text = `${stdout || ""}${stderr || ""}`.trim();
            if (text) return resolve(text);
            if (error) return reject(error);
            resolve(text);
        });
    });
}

/** 解析 `claude mcp list` 的文本输出：`name: command - ✔ Connected` / `- ✘ Failed to connect — 原因`。 */
export function parseClaudeMcpList(text: string): RuntimeMcpServer[] {
    const servers: RuntimeMcpServer[] = [];
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.replace(ANSI, "").trim();
        // 服务名在前，冒号后才是命令与状态；`Checking MCP server health...` 这类提示没有冒号，直接跳过。
        const head = line.match(/^([^:]+):\s+(.+)$/);
        if (!head) continue;
        const name = head[1].trim();
        const rest = head[2];
        const mark = rest.match(/(✔|✓|✘|✗)\s*(.*)$/);
        const ready = mark ? /^[✔✓]$/.test(mark[1]) : false;
        const detail = (mark ? mark[2] : rest).replace(/^[—-]\s*/, "").trim();
        servers.push({ name, status: ready ? "ready" : "failed", detail: detail || (ready ? "已连接" : "连接失败") });
    }
    return servers;
}

/** 读取 Claude Code 当前配置的 MCP 服务清单（含健康检查结果）。 */
export async function listClaudeMcpServers() {
    const output = await runClaude(["mcp", "list"]);
    return parseClaudeMcpList(output);
}
