// 本地 Agent 运行时探测（桌面端与网页版共用同一份实现）。
//
// 之所以单独抽出来：客户端（Electron 主进程）和网页版（Vite dev 中间件）都要回答
// 「这台机器上装了哪些 Agent、版本多少、能不能连」，两边各写一份必然走样。
// 这个模块不依赖 electron，只做文件和进程探测，两边 import 同一份即可。
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CONFIG_DIR = path.join(os.homedir(), ".infinite-canvas");
export const CONFIG_FILE = path.join(CONFIG_DIR, "canvas-agent.json");
export const PID_FILE = path.join(CONFIG_DIR, "agent-server.pid");
export const LOG_FILE = path.join(os.tmpdir(), "infinite-canvas-agent.log");
export const HEALTH_TIMEOUT_MS = 2500;
export const IS_WIN = process.platform === "win32";

export const RUNTIMES = [
    { id: "claude", label: "Claude Code", bin: "claude", mode: "mcp" },
    { id: "codex", label: "Codex", bin: "codex", mode: "mcp" },
    { id: "galley", label: "Galley", bin: "galley", mode: "bridge" },
];

/** 在登录 shell 里执行命令（仅 POSIX）。 */
export function runShell(command, timeout = 20_000) {
    if (IS_WIN) return { ok: false, stdout: "", stderr: "shell unavailable on this platform" };
    const shell = process.env.SHELL || "/bin/zsh";
    const result = spawnSync(shell, ["-lc", command], { encoding: "utf8", timeout });
    return { ok: result.status === 0, stdout: (result.stdout || "").trim(), stderr: (result.stderr || "").trim() };
}

/** 从 Finder / 开始菜单启动的 Electron 只继承极简 PATH，这里补上登录 shell 的 PATH。 */
let loginPathCache = "";
export function loginPath() {
    if (loginPathCache) return loginPathCache;
    let resolved = "";
    if (!IS_WIN) {
        const result = runShell('printf %s "$PATH"', 15_000);
        resolved = result.ok ? result.stdout : "";
    }
    loginPathCache = resolved || process.env.PATH || (IS_WIN ? "" : "/usr/local/bin:/usr/bin:/bin");
    return loginPathCache;
}

export function childEnv(extra = {}) {
    return { ...process.env, ...extra, PATH: loginPath() };
}

function quoteWin(value) {
    const text = String(value);
    return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function runArgs(file, args, timeout = 120_000) {
    let command = file;
    let commandArgs = args;
    if (IS_WIN && /\.(cmd|bat)$/i.test(file)) {
        command = process.env.ComSpec || "cmd.exe";
        commandArgs = ["/d", "/s", "/c", [file, ...args].map(quoteWin).join(" ")];
    }
    const result = spawnSync(command, commandArgs, { encoding: "utf8", timeout, env: childEnv(), windowsHide: true });
    const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    return { ok: result.status === 0, output };
}

/** 可能放着 CLI 的目录：进程 PATH + 登录 PATH + 各平台常见安装位置。 */
export function candidateDirs() {
    const dirs = [];
    const push = (dir) => {
        if (dir && !dirs.includes(dir)) dirs.push(dir);
    };
    for (const dir of String(process.env.PATH || "").split(path.delimiter)) push(dir);
    for (const dir of String(loginPath() || "").split(path.delimiter)) push(dir);
    const home = os.homedir();
    if (IS_WIN) {
        push(path.join(home, "AppData", "Roaming", "npm"));
        push(path.join(home, "AppData", "Local", "pnpm"));
        push(path.join(home, "AppData", "Local", "Programs", "claude"));
        push(path.join(home, ".local", "bin"));
    } else {
        push("/opt/homebrew/bin");
        push("/usr/local/bin");
        push(path.join(home, ".local", "bin"));
        push(path.join(home, ".npm-global", "bin"));
        push(path.join(home, ".bun", "bin"));
        push(path.join(home, ".volta", "bin"));
        push(path.join(home, "Library", "pnpm"));
        const nvmRoot = path.join(home, ".nvm", "versions", "node");
        try {
            for (const version of fs.readdirSync(nvmRoot)) push(path.join(nvmRoot, version, "bin"));
        } catch {
            /* 没装 nvm */
        }
    }
    return dirs;
}

export function executableExtensions() {
    if (!IS_WIN) return [""];
    const exts = String(process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
        .split(";")
        .filter(Boolean)
        .map((ext) => ext.toLowerCase());
    return ["", ...exts];
}

function galleyRecords() {
    const home = os.homedir();
    const records = [path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "galley", "cli-path")];
    if (IS_WIN) records.push(path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "galley", "cli-path"));
    return records;
}

const SCAN_MAX_DEPTH = 5;
const SCAN_MAX_ENTRIES = 20000;
const SCAN_SKIP_DIRS = new Set(["node_modules", ".git", ".cache", "$recycle.bin", "system volume information", "winsxs", "windowspowershell"]);

export function readAgentPaths() {
    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
        const raw = config && typeof config.agentPaths === "object" && config.agentPaths ? config.agentPaths : {};
        const result = {};
        for (const id of ["claude", "codex", "galley"]) {
            if (typeof raw[id] === "string" && raw[id]) result[id] = raw[id];
        }
        return result;
    } catch {
        return {};
    }
}

export function scanDirForBin(dir, bin) {
    const start = path.resolve(String(dir || "").trim().replace(/^"|"$/g, ""));
    if (!start) return "";
    let stats;
    try {
        stats = fs.statSync(start);
    } catch {
        return "";
    }
    const wanted = executableExtensions().map((ext) => `${bin}${ext}`.toLowerCase());
    if (stats.isFile()) {
        const name = path.basename(start).toLowerCase();
        return name.replace(/\.(exe|cmd|bat|ps1)$/, "") === bin.toLowerCase() ? start : "";
    }
    if (!stats.isDirectory()) return "";
    const queue = [[start, 0]];
    let visited = 0;
    while (queue.length && visited < SCAN_MAX_ENTRIES) {
        const [current, depth] = queue.shift();
        let entries;
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            continue;
        }
        visited += entries.length;
        for (const entry of entries) {
            if (entry.isFile() && wanted.includes(entry.name.toLowerCase())) return path.join(current, entry.name);
        }
        if (depth >= SCAN_MAX_DEPTH) continue;
        for (const entry of entries) {
            if (entry.isDirectory() && !SCAN_SKIP_DIRS.has(entry.name.toLowerCase())) queue.push([path.join(current, entry.name), depth + 1]);
        }
    }
    return "";
}

export function resolveCommand(bin) {
    const custom = readAgentPaths()[bin];
    if (custom) {
        const hit = scanDirForBin(custom, bin);
        if (hit) return hit;
    }
    if (bin === "galley") {
        for (const record of galleyRecords()) {
            try {
                const recorded = fs.readFileSync(record, "utf8").split(/\r?\n/)[0].trim();
                if (recorded && fs.existsSync(recorded)) return recorded;
            } catch {
                /* 没有桌面版时继续按 PATH 查找 */
            }
        }
    }
    const extensions = executableExtensions();
    for (const dir of candidateDirs()) {
        for (const ext of extensions) {
            const candidate = path.join(dir, `${bin}${ext}`);
            try {
                if (fs.statSync(candidate).isFile()) return candidate;
            } catch {
                /* 不存在，继续找 */
            }
        }
    }
    return "";
}

const CLI_VERSION_TTL_MS = 10 * 60_000;
export const cliVersionCache = new Map();

export function readCliVersion(file) {
    if (!file) return "";
    const hit = cliVersionCache.get(file);
    if (hit && Date.now() - hit.at < CLI_VERSION_TTL_MS) return hit.version;
    const result = runArgs(file, ["--version"], 5_000);
    const version = result.output.split(/\r?\n/)[0].slice(0, 80);
    cliVersionCache.set(file, { version, at: Date.now() });
    return version;
}

const DESKTOP_APPS = {
    claude: {
        label: "Claude 桌面版",
        mac: ["/Applications/Claude.app"],
        win: ["AppData/Local/AnthropicClaude/Claude.exe", "AppData/Local/Programs/Claude/Claude.exe"],
    },
    codex: {
        label: "Codex 桌面版",
        mac: ["/Applications/Codex.app"],
        win: ["AppData/Local/Programs/Codex/Codex.exe"],
    },
    galley: {
        label: "Galley 桌面版",
        mac: ["/Applications/Galley.app"],
        win: ["AppData/Local/Programs/Galley/Galley.exe", "AppData/Local/Galley/Galley.exe"],
    },
};

export function detectDesktopApp(id) {
    const spec = DESKTOP_APPS[id];
    if (!spec) return { installed: false, path: "", label: "" };
    const home = os.homedir();
    const candidates = (IS_WIN ? spec.win : spec.mac) || [];
    for (const candidate of candidates) {
        const target = candidate.startsWith("/") ? candidate : path.join(home, candidate);
        if (fs.existsSync(target)) return { installed: true, path: target, label: spec.label };
    }
    return { installed: false, path: "", label: spec.label };
}

export function readAgentConfig() {
    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
        return { ...config, url: String(config.url || ""), token: String(config.token || ""), runtime: String(config.runtime || ""), mode: config.mode === "plugin" ? "plugin" : config.mode === "runtime" ? "runtime" : "" };
    } catch {
        return { url: "", token: "", runtime: "", mode: "" };
    }
}

export function writeAgentConfig(patch) {
    const next = { ...readAgentConfig(), ...patch };
    try {
        fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
    } catch {
        /* 配置写失败不影响本次连接 */
    }
    return next;
}

export async function probeServer(url) {
    if (!url) return { running: false };
    try {
        const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
        if (!res.ok) return { running: false };
        return { running: true, health: await res.json().catch(() => ({})) };
    } catch {
        return { running: false };
    }
}

export function readPid() {
    try {
        const pid = Number(fs.readFileSync(PID_FILE, "utf8").trim());
        return Number.isInteger(pid) && pid > 0 ? pid : 0;
    } catch {
        return 0;
    }
}

export function writePid(pid) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(PID_FILE, String(pid), { mode: 0o600 });
}

export function isOurAgent(pid) {
    if (!pid) return false;
    if (IS_WIN) {
        const result = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true });
        return result.status === 0 && /node\.exe|Infinite Canvas\.exe|"electron\.exe"/i.test(result.stdout || "");
    }
    const result = spawnSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
    return result.status === 0 && /canvas-agent\.mjs|canvas-agent\/dist\/index\.js|canvas-agent$/.test(result.stdout || "");
}

export function killTree(pid) {
    if (!pid) return;
    if (IS_WIN) {
        spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
        return;
    }
    const children = spawnSync("pgrep", ["-P", String(pid)], { encoding: "utf8" });
    for (const child of (children.stdout || "").split(/\s+/).filter(Boolean)) killTree(Number(child));
    try {
        process.kill(pid, "SIGTERM");
    } catch {
        /* 进程已退出 */
    }
}

const PLUGIN_STATE_FILE = path.join(CONFIG_DIR, "agent-plugins.json");

export function readPluginState() {
    try {
        const raw = JSON.parse(fs.readFileSync(PLUGIN_STATE_FILE, "utf8"));
        return raw && typeof raw === "object" ? raw : {};
    } catch {
        return {};
    }
}

export function writePluginState(runtime, ok, output) {
    const state = readPluginState();
    state[runtime] = { ok, at: new Date().toISOString(), output: String(output || "").slice(-500) };
    try {
        fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
        fs.writeFileSync(PLUGIN_STATE_FILE, JSON.stringify(state), { mode: 0o600 });
    } catch {
        /* 状态记录失败不影响连接本身 */
    }
}

/**
 * 与客户端 listRuntimes() 完全同构的卡片数据。
 * 关键：服务没起来时照样报「已安装 / 版本号」，卡片才和客户端长得一样。
 */
export async function listRuntimes(connecting = null) {
    const config = readAgentConfig();
    const server = await probeServer(config.url);
    const pluginState = readPluginState();
    const customPaths = readAgentPaths();
    const runtimes = RUNTIMES.map((runtime) => {
        const resolved = resolveCommand(runtime.bin);
        const desktop = detectDesktopApp(runtime.id);
        return {
            id: runtime.id,
            label: runtime.label,
            installed: Boolean(resolved) || desktop.installed,
            cliInstalled: Boolean(resolved),
            cliPath: resolved,
            path: resolved,
            customPath: customPaths[runtime.id] || "",
            desktop: desktop.installed,
            desktopPath: desktop.path,
            desktopLabel: desktop.label,
            version: resolved ? readCliVersion(resolved) : "",
            mode: runtime.mode,
            plugin: pluginState[runtime.id] || null,
        };
    });
    return {
        server: { running: server.running, url: server.running ? config.url : "", token: server.running ? config.token : "", error: "" },
        runtime: server.running ? config.runtime : "",
        mode: config.mode || "",
        connecting: connecting || null,
        runtimes,
    };
}

export { spawn };
