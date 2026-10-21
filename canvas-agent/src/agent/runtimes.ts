import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** 0.23 起支持的本地 Agent 运行时。 */
export type AgentRuntimeId = "claude" | "codex" | "galley";

export type AgentRuntimeInfo = {
    id: AgentRuntimeId;
    label: string;
    /** 可执行文件名，用于检测是否安装。 */
    bin: string;
    /** mcp = 通过 MCP 插件接入；bridge = 由 canvas-agent 直接驱动会话。 */
    mode: "mcp" | "bridge";
    installed: boolean;
    version: string;
};

const RUNTIMES: Array<Omit<AgentRuntimeInfo, "installed" | "version">> = [
    { id: "claude", label: "Claude Code", bin: "claude", mode: "mcp" },
    { id: "codex", label: "Codex", bin: "codex", mode: "mcp" },
    { id: "galley", label: "Galley", bin: "galley", mode: "bridge" },
];

/** 通过登录 shell 查找命令，保证拿到 Homebrew / npm 全局安装的 CLI。 */
export function resolveCommand(bin: string) {
    if (process.platform === "win32") {
        const result = spawnSync("where", [bin], { encoding: "utf8", windowsHide: true });
        return result.status === 0 ? (result.stdout || "").split(/\r?\n/).filter(Boolean)[0] || "" : "";
    }
    // Galley 桌面版不会把自己写进 PATH，而是把 CLI 绝对路径记在 ~/.config/galley/cli-path。
    if (bin === "galley") {
        const record = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "galley", "cli-path");
        try {
            const recorded = fs.readFileSync(record, "utf8").split(/\r?\n/)[0].trim();
            if (recorded && fs.existsSync(recorded)) return recorded;
        } catch {
            /* 没有桌面版时继续按 PATH 查找 */
        }
    }
    const shell = process.env.SHELL || "/bin/zsh";
    const result = spawnSync(shell, ["-lc", `command -v ${bin}`], { encoding: "utf8", timeout: 8000 });
    return result.status === 0 ? (result.stdout || "").trim().split(/\r?\n/).pop() || "" : "";
}

/** 读取 CLI 版本号首行，失败时返回空串。 */
export function readVersion(bin: string) {
    const path = resolveCommand(bin);
    if (!path) return "";
    const result = spawnSync(path, ["--version"], { encoding: "utf8", timeout: 12000 });
    const text = `${result.stdout || ""}${result.stderr || ""}`.trim().split(/\r?\n/)[0] || "";
    return text.slice(0, 80);
}

/** 探测本机三个 Agent 的安装状态，供连接面板渲染卡片。 */
export function detectRuntimes(): AgentRuntimeInfo[] {
    return RUNTIMES.map((runtime) => {
        const path = resolveCommand(runtime.bin);
        return { ...runtime, installed: Boolean(path), version: path ? readVersion(runtime.bin) : "" };
    });
}

/** 校验任意输入是否为受支持的运行时 id。 */
export function isAgentRuntimeId(value: unknown): value is AgentRuntimeId {
    return value === "claude" || value === "codex" || value === "galley";
}
