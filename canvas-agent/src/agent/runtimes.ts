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
    cliInstalled?: boolean;
    desktop?: boolean;
    desktopPath?: string;
};

const RUNTIMES: Array<Omit<AgentRuntimeInfo, "installed" | "version">> = [
    { id: "claude", label: "Claude Code", bin: "claude", mode: "mcp" },
    { id: "codex", label: "Codex", bin: "codex", mode: "mcp" },
    { id: "galley", label: "Galley", bin: "galley", mode: "bridge" },
];

const IS_WIN = process.platform === "win32";

/** PATH 里额外补充常见安装目录，覆盖从 GUI 启动时 PATH 过短的情况。 */
function searchDirs() {
    const home = os.homedir();
    const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
    if (IS_WIN) {
        const local = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
        dirs.push(path.join(local, "Programs"), path.join(local, "pnpm"), path.join(home, "AppData", "Roaming", "npm"));
    } else {
        dirs.push("/opt/homebrew/bin", "/usr/local/bin", path.join(home, ".local", "bin"), path.join(home, ".bun", "bin"), path.join(home, ".npm-global", "bin"));
    }
    return [...new Set(dirs)];
}

/** 不依赖 shell 直接扫 PATH，避免 Windows / 无登录 shell 环境下探测失败。 */
export function resolveCommand(bin: string) {
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
    const names = IS_WIN ? [`${bin}.exe`, `${bin}.cmd`, `${bin}.bat`, bin] : [bin];
    for (const dir of searchDirs()) {
        for (const name of names) {
            const candidate = path.join(dir, name);
            try {
                if (fs.statSync(candidate).isFile()) return candidate;
            } catch {
                /* 该目录没有这个命令，继续找 */
            }
        }
    }
    return "";
}

/** 探测桌面版是否安装（Claude / Codex / Galley 的 GUI 版）。 */
export function detectDesktopApp(id: AgentRuntimeId) {
    const home = os.homedir();
    const candidates = IS_WIN
        ? {
              claude: [`${process.env.LOCALAPPDATA || ""}\\AnthropicClaude\\Claude.exe`, `${process.env.PROGRAMFILES || ""}\\Claude\\Claude.exe`],
              codex: [`${process.env.LOCALAPPDATA || ""}\\Programs\\Codex\\Codex.exe`],
              galley: [`${process.env.LOCALAPPDATA || ""}\\Programs\\Galley\\Galley.exe`],
          }
        : {
              claude: ["/Applications/Claude.app"],
              codex: ["/Applications/Codex.app"],
              galley: ["/Applications/Galley.app"],
          };
    const list = (candidates[id] || []).filter(Boolean);
    const found = list.find((candidate) => candidate && fs.existsSync(candidate));
    return { installed: Boolean(found), path: found || "" };
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
        const cliPath = resolveCommand(runtime.bin);
        const desktop = detectDesktopApp(runtime.id);
        return {
            ...runtime,
            installed: Boolean(cliPath) || desktop.installed,
            cliInstalled: Boolean(cliPath),
            desktop: desktop.installed,
            desktopPath: desktop.path,
            version: cliPath ? readVersion(runtime.bin) : "",
        };
    });
}

/** 校验任意输入是否为受支持的运行时 id。 */
export function isAgentRuntimeId(value: unknown): value is AgentRuntimeId {
    return value === "claude" || value === "codex" || value === "galley";
}
