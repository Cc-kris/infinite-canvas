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
        // 0.25.8: Windows 安装包把程序放在 %LOCALAPPDATA%\Programs\<App>\ 这一层，
        // 只扫 Programs 本身会漏掉，所以这里连同 Program Files 一起补上，
        // 再由 resolveCommand 额外下探一层同名子目录。
        const programFiles = process.env.ProgramFiles || process.env.PROGRAMFILES || "C:\\Program Files";
        const programFilesX86 = process.env["ProgramFiles(x86)"] || process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
        dirs.push(
            path.join(local, "Programs"),
            local,
            path.join(local, "pnpm"),
            path.join(home, "AppData", "Roaming", "npm"),
            programFiles,
            programFilesX86,
        );
    } else {
        dirs.push("/opt/homebrew/bin", "/usr/local/bin", path.join(home, ".local", "bin"), path.join(home, ".bun", "bin"), path.join(home, ".npm-global", "bin"));
    }
    return [...new Set(dirs)];
}

/**
 * Galley 桌面版不会把自己写进 PATH，而是首次启动时把 CLI 绝对路径写进发现文件。
 * 路径随平台不同：Windows 是 %APPDATA%\galley\cli-path，macOS / Linux 是
 * ~/.config/galley/cli-path（Galley 的 PRD §12.2 契约）。
 */
export function galleyDiscoveryFiles() {
    const files: string[] = [];
    if (IS_WIN) {
        for (const base of [process.env.APPDATA, process.env.LOCALAPPDATA]) {
            if (base) files.push(path.join(base, "galley", "cli-path"));
        }
    }
    const configBase = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
    files.push(path.join(configBase, "galley", "cli-path"));
    return [...new Set(files)];
}

/** 读 Galley 发现文件首行，拿到 CLI 绝对路径；文件缺失或路径失效返回空串。 */
function readGalleyRecord() {
    for (const record of galleyDiscoveryFiles()) {
        try {
            const recorded = fs.readFileSync(record, "utf8").split(/\r?\n/)[0].trim().replace(/^"|"$/g, "");
            if (recorded && fs.existsSync(recorded)) return recorded;
        } catch {
            /* 没有这个记录文件，换下一个位置 */
        }
    }
    return "";
}

/** 不依赖 shell 直接扫 PATH，避免 Windows / 无登录 shell 环境下探测失败。 */
export function resolveCommand(bin: string) {
    if (bin === "galley") {
        const recorded = readGalleyRecord();
        if (recorded) return recorded;
    }
    const names = IS_WIN ? [`${bin}.exe`, `${bin}.cmd`, `${bin}.bat`, bin] : [bin];
    for (const dir of searchDirs()) {
        for (const name of names) {
            // 直接放在该目录，或放在同名应用子目录下（%LOCALAPPDATA%\Programs\Galley\galley.exe）。
            // 子目录名大小写在不同版本里不一样（Galley / galley），按小写比对，不依赖文件系统是否忽略大小写。
            for (const candidate of [path.join(dir, name), ...appSubdirs(dir, bin).map((sub) => path.join(sub, name))]) {
                try {
                    if (fs.statSync(candidate).isFile()) return candidate;
                } catch {
                    /* 该位置没有这个命令，继续找 */
                }
            }
        }
    }
    return "";
}

/** 在 dir 下找名字（忽略大小写）等于 bin 的一级子目录，用于覆盖 Programs\<App>\<bin> 这种安装布局。 */
function appSubdirs(dir: string, bin: string) {
    try {
        return fs
            .readdirSync(dir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && entry.name.toLowerCase() === bin.toLowerCase())
            .map((entry) => path.join(dir, entry.name));
    } catch {
        return [];
    }
}

/** 探测桌面版是否安装（Claude / Codex / Galley 的 GUI 版）。 */
export function detectDesktopApp(id: AgentRuntimeId) {
    const home = os.homedir();
    const candidates = IS_WIN
        ? {
              claude: [`${process.env.LOCALAPPDATA || ""}\\AnthropicClaude\\Claude.exe`, `${process.env.PROGRAMFILES || ""}\\Claude\\Claude.exe`],
              codex: [`${process.env.LOCALAPPDATA || ""}\\Programs\\Codex\\Codex.exe`],
              // Galley 的 Windows 安装目录随安装方式不同（NSIS 默认在 %LOCALAPPDATA%，也可装到 Program Files），
              // 只认 %LOCALAPPDATA%\Programs\Galley 会把已装好的用户误报成「未安装」。
              galley: [
                  `${process.env.LOCALAPPDATA || ""}\\Programs\\Galley\\Galley.exe`,
                  `${process.env.LOCALAPPDATA || ""}\\Galley\\Galley.exe`,
                  `${process.env.PROGRAMFILES || process.env.ProgramFiles || ""}\\Galley\\Galley.exe`,
                  `${process.env["ProgramFiles(x86)"] || ""}\\Galley\\Galley.exe`,
              ].filter(Boolean),
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
        // Galley 的 CLI 随桌面版一起发布，找到 CLI 就说明桌面版装过；个别安装路径没覆盖到时不误报「未安装」。
        const desktopInstalled = desktop.installed || (runtime.id === "galley" && Boolean(cliPath));
        return {
            ...runtime,
            installed: Boolean(cliPath) || desktopInstalled,
            cliInstalled: Boolean(cliPath),
            desktop: desktopInstalled,
            desktopPath: desktop.path || (desktopInstalled && cliPath ? path.dirname(cliPath) : ""),
            version: cliPath ? readVersion(runtime.bin) : "",
        };
    });
}

/** 校验任意输入是否为受支持的运行时 id。 */
export function isAgentRuntimeId(value: unknown): value is AgentRuntimeId {
    return value === "claude" || value === "codex" || value === "galley";
}
