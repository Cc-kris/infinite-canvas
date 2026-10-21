// 0.23 本地 Agent 连接中枢。
// 桌面端负责：探测 CLI → 拉起内置 canvas-agent 服务 → 安装 MCP 插件 → 写入选中的运行时。
// 网页端只展示卡片并调用 connect / disconnect，用户全程不需要填地址或 token。
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";

const here = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.join(os.homedir(), ".infinite-canvas");
const CONFIG_FILE = path.join(CONFIG_DIR, "canvas-agent.json");
const PID_FILE = path.join(CONFIG_DIR, "agent-server.pid");
const LOG_FILE = path.join(os.tmpdir(), "infinite-canvas-agent.log");
const HEALTH_TIMEOUT_MS = 2500;
const START_TIMEOUT_MS = 30_000;
const IS_WIN = process.platform === "win32";

/** 桌面端内置的单文件 canvas-agent（esbuild 产物）。 */
const AGENT_DIR = app.isPackaged ? path.join(process.resourcesPath, "agent") : path.join(here, "agent");
const AGENT_ENTRY = path.join(AGENT_DIR, "canvas-agent.mjs");

const RUNTIMES = [
    { id: "claude", label: "Claude Code", bin: "claude", mode: "mcp" },
    { id: "codex", label: "Codex", bin: "codex", mode: "mcp" },
    { id: "galley", label: "Galley", bin: "galley", mode: "bridge" },
];

/**
 * 在登录 shell 里执行命令（仅 POSIX）。Windows 没有登录 shell 语义，直接返回失败，
 * 调用方应改用 resolveCommand / runArgs 这类不依赖 shell 的路径。
 */
function runShell(command, timeout = 20_000) {
    if (IS_WIN) return { ok: false, stdout: "", stderr: "shell unavailable on this platform" };
    const shell = process.env.SHELL || "/bin/zsh";
    const result = spawnSync(shell, ["-lc", command], { encoding: "utf8", timeout });
    return { ok: result.status === 0, stdout: (result.stdout || "").trim(), stderr: (result.stderr || "").trim() };
}

/**
 * 从 Finder / 开始菜单启动的 Electron 只继承极简 PATH，找不到 Homebrew / npm 全局命令。
 * POSIX 上取一次登录 shell 的 PATH 缓存起来；Windows 直接用进程 PATH。
 */
let loginPathCache = "";
function loginPath() {
    if (loginPathCache) return loginPathCache;
    let resolved = "";
    if (!IS_WIN) {
        const result = runShell('printf %s "$PATH"', 15_000);
        resolved = result.ok ? result.stdout : "";
    }
    loginPathCache = resolved || process.env.PATH || (IS_WIN ? "" : "/usr/local/bin:/usr/bin:/bin");
    return loginPathCache;
}

/** 子进程环境：补充登录 PATH，保证 codex / claude / galley 能被找到。 */
function childEnv(extra = {}) {
    return { ...process.env, ...extra, PATH: loginPath() };
}

/** Codex 运行在打包环境里没有 node_modules，需要显式告知全局 codex 入口。 */
function codexEnv() {
    const resolved = resolveCommand("codex");
    if (!resolved) return {};
    return { CANVAS_AGENT_CODEX_BIN: resolved };
}

/** Windows 命令行参数：含空格或特殊字符时加引号，否则 cmd.exe 会拆错。 */
function quoteWin(value) {
    const text = String(value);
    return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * 以 argv 形式执行命令，避免手工拼引号出错。
 * Windows 上 npm 装的 CLI 是 .cmd 批处理，必须交给 cmd.exe 才能执行。
 */
function runArgs(file, args, timeout = 120_000) {
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
function candidateDirs() {
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
        // nvm / fnm 装的 node 全局 bin 不在任何固定位置，按版本目录扫一遍
        const nvmRoot = path.join(home, ".nvm", "versions", "node");
        try {
            for (const version of fs.readdirSync(nvmRoot)) push(path.join(nvmRoot, version, "bin"));
        } catch {
            /* 没装 nvm */
        }
    }
    return dirs;
}

/** 可执行后缀：Windows 需要按 PATHEXT 逐个尝试，POSIX 没有后缀。 */
function executableExtensions() {
    if (!IS_WIN) return [""];
    const exts = String(process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
        .split(";")
        .filter(Boolean)
        .map((ext) => ext.toLowerCase());
    return ["", ...exts];
}

/** Galley 桌面版不写 PATH，只把 CLI 绝对路径记在配置文件里。 */
function galleyRecords() {
    const home = os.homedir();
    const records = [path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "galley", "cli-path")];
    if (IS_WIN) records.push(path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "galley", "cli-path"));
    return records;
}

/**
 * 解析某个 CLI 的绝对路径，未安装时返回空串。
 * 这里刻意不依赖 shell：Windows 上根本没有 `command -v`，用 shell 探测会让所有 CLI 误判为未安装。
 */
function resolveCommand(bin) {
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

/** 读 CLI 版本号，失败返回空串（只用于展示，不参与判断）。 */
function readCliVersion(file) {
    if (!file) return "";
    const result = runArgs(file, ["--version"], 15_000);
    return result.output.split(/\r?\n/)[0].slice(0, 80);
}

/**
 * 桌面端探测：CLI 不是唯一入口，装了桌面版也应该认。
 * 只探测确实存在的位置，找不到就返回未安装，不做任何猜测性提示。
 */
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

function detectDesktopApp(id) {
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


function readAgentConfig() {
    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
        return { url: String(config.url || ""), token: String(config.token || ""), runtime: String(config.runtime || "") };
    } catch {
        return { url: "", token: "", runtime: "" };
    }
}

async function probeServer(url) {
    if (!url) return { running: false };
    try {
        const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
        if (!res.ok) return { running: false };
        return { running: true, health: await res.json().catch(() => ({})) };
    } catch {
        return { running: false };
    }
}

/** 读上次记录的服务 pid；文件不存在或内容损坏都按「没有」处理，绝不抛异常。 */
function readPid() {
    try {
        const pid = Number(fs.readFileSync(PID_FILE, "utf8").trim());
        return Number.isInteger(pid) && pid > 0 ? pid : 0;
    } catch {
        return 0;
    }
}

function writePid(pid) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(PID_FILE, String(pid), { mode: 0o600 });
}

/** 判断某个 pid 是否仍是我们启动的 canvas-agent 服务。 */
function isOurAgent(pid) {
    if (!pid) return false;
    if (IS_WIN) {
        // Windows 没有 ps，用 tasklist 查进程名：服务是 Electron 以 node 模式跑的。
        const result = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true });
        return result.status === 0 && /node\.exe|Infinite Canvas\.exe|"electron\.exe"/i.test(result.stdout || "");
    }
    const result = spawnSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
    return result.status === 0 && /canvas-agent\.mjs|c\/canvas-agent|canvas-agent$/.test(result.stdout || "");
}

/** 结束整棵进程树（服务进程 + 它拉起的 codex / claude / galley 子进程）。 */
function killTree(pid) {
    if (!pid) return;
    if (IS_WIN) {
        // /T 连子进程一起杀，避免留下 codex 之类孤儿进程
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

/** 拉起内置服务：Electron 自带 Node 运行单文件产物，用户无需安装任何依赖。 */
async function ensureServer() {
    const config = readAgentConfig();
    if ((await probeServer(config.url)).running) return { ...config, started: false };
    if (!fs.existsSync(AGENT_ENTRY)) throw new Error("内置 Agent 服务缺失，请重新安装应用");

    const log = fs.openSync(LOG_FILE, "a");
    const child = spawn(process.execPath, [AGENT_ENTRY], {
        cwd: AGENT_DIR,
        detached: true,
        stdio: ["ignore", log, log],
        env: childEnv({
            ELECTRON_RUN_AS_NODE: "1",
            CANVAS_AGENT_ENTRY: AGENT_ENTRY,
            CANVAS_AGENT_INSTRUCTIONS: path.join(AGENT_DIR, "agent-instructions.md"),
            ...codexEnv(),
        }),
    });
    child.unref();
    if (child.pid) writePid(child.pid);

    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        const next = readAgentConfig();
        if ((await probeServer(next.url)).running) return { ...next, started: true };
        if (child.exitCode !== null && child.exitCode !== 0) break;
    }
    throw new Error(`本地 Agent 服务启动失败，详见 ${LOG_FILE}`);
}

async function setRuntime(config, runtime) {
    const res = await fetch(`${config.url}/api/agent/runtime`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-canvas-agent-token": config.token },
        body: JSON.stringify({ runtime }),
        signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) throw new Error(body.error || `写入运行时失败（HTTP ${res.status}）`);
    return body;
}

const PLUGIN_STATE_FILE = path.join(CONFIG_DIR, "agent-plugins.json");

/** 记录各运行时上次插件安装结果，供卡片显示「插件已装 / 直接运行」。 */
function readPluginState() {
    try {
        const raw = JSON.parse(fs.readFileSync(PLUGIN_STATE_FILE, "utf8"));
        return raw && typeof raw === "object" ? raw : {};
    } catch {
        return {};
    }
}

function writePluginState(runtime, ok, output) {
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
 * 安装 MCP 插件（幂等）。桌面端的分发形态是单文件产物，
 * 所以注册的命令必须是「Electron 以 Node 模式运行该产物」。
 * 失败不算致命：会退化为「直接运行 Agent」的原有方式。
 */
function ensureMcp(runtime) {
    const spec = RUNTIMES.find((item) => item.id === runtime);
    if (!spec || spec.mode !== "mcp") return { ok: true, skipped: true, output: "" };
    const bin = resolveCommand(spec.bin);
    if (!bin) return { ok: false, output: `${spec.label} 未安装` };
    if (!fs.existsSync(AGENT_ENTRY)) return { ok: false, output: "内置 Agent 入口缺失" };

    const serverArgv = [process.execPath, AGENT_ENTRY, "mcp"];
    const envs = ["ELECTRON_RUN_AS_NODE=1", `CANVAS_AGENT_ENTRY=${AGENT_ENTRY}`];

    if (spec.id === "claude") {
        runArgs(bin, ["mcp", "remove", "infinite-canvas"], 30_000);
        const args = ["mcp", "add", "infinite-canvas", "-s", "user"];
        for (const env of envs) args.push("-e", env);
        args.push("--", ...serverArgv);
        return runArgs(bin, args);
    }

    runArgs(bin, ["mcp", "remove", "infinite-canvas"], 30_000);
    const args = ["mcp", "add", "infinite-canvas"];
    for (const env of envs) args.push("--env", env);
    args.push("--", ...serverArgv);
    return runArgs(bin, args);
}

export async function listRuntimes() {
    const config = readAgentConfig();
    const server = await probeServer(config.url);
    const pluginState = readPluginState();
    const runtimes = RUNTIMES.map((runtime) => {
        const resolved = resolveCommand(runtime.bin);
        const desktop = detectDesktopApp(runtime.id);
        return {
            id: runtime.id,
            label: runtime.label,
            installed: Boolean(resolved) || desktop.installed,
            cliInstalled: Boolean(resolved),
            cliPath: resolved,
            desktop: desktop.installed,
            desktopPath: desktop.path,
            desktopLabel: desktop.label,
            version: resolved ? readCliVersion(resolved) : "",
            mode: runtime.mode,
            plugin: pluginState[runtime.id] || null,
        };
    });
    return {
        server: { running: server.running, url: server.running ? config.url : "", token: server.running ? config.token : "", error: server.running ? "" : "" },
        runtime: server.running ? config.runtime : "",
        runtimes,
    };
}

/** 一键连接：拉起服务 → 写运行时 → 装插件（失败自动降级为直接运行）。 */
export async function connectRuntime(runtime) {
    const spec = RUNTIMES.find((item) => item.id === runtime);
    if (!spec) return { ok: false, error: "unknown runtime" };
    const cli = resolveCommand(spec.bin);
    const desktop = detectDesktopApp(spec.id);
    if (!cli && !desktop.installed) {
        return { ok: false, error: `未检测到 ${spec.label}，请先安装它的命令行或桌面版`, runtime };
    }

    let config;
    try {
        config = await ensureServer();
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error), runtime };
    }

    // 先让服务记住运行时，网页即可立刻连上；插件只是增强路径。
    await setRuntime(config, spec.id);

    const mcp = ensureMcp(spec.id);
    const fallback = !mcp.ok;
    writePluginState(spec.id, mcp.ok, mcp.output);
    if (fallback) fs.writeFileSync(path.join(CONFIG_DIR, "agent-fallback.log"), `${new Date().toISOString()}\n${mcp.output}\n`, { mode: 0o600 });
    return {
        ok: true,
        url: config.url,
        token: config.token,
        runtime: spec.id,
        mode: fallback ? "cli" : spec.mode,
        started: config.started,
        cli: Boolean(cli),
        desktop: desktop.installed,
        warning: !cli && desktop.installed ? `只检测到 ${spec.label} 桌面版，未找到命令行，插件未安装（已直接连通）` : fallback ? `${spec.label} 插件安装失败，已改用直接运行方式` : "",
    };
}

/** 断开连接：退出 canvas-agent 以及它拉起的 Agent 子进程。 */
export async function disconnectRuntime() {
    const config = readAgentConfig();
    const pid = readPid();
    if (isOurAgent(pid)) {
        killTree(pid);
        for (let i = 0; i < 20 && (await probeServer(config.url)).running; i += 1) await new Promise((resolve) => setTimeout(resolve, 150));
    }
    try {
        fs.rmSync(PID_FILE, { force: true });
    } catch {
        /* 忽略 */
    }
    const running = (await probeServer(config.url)).running;
    if (running) {
        // 服务不是本次启动的（例如用户在终端手动跑的），至少清空运行时。
        await setRuntime(config, "").catch(() => {});
    }
    return { ok: !running, running, runtime: "" };
}

export function registerAgentHub(ipcMain) {
    ipcMain.handle("agent-hub:list", () => listRuntimes());
    ipcMain.handle("agent-hub:connect", (_event, runtime) => connectRuntime(String(runtime || "")));
    ipcMain.handle("agent-hub:disconnect", () => disconnectRuntime());
}

/** 应用退出时一并收掉后台 Agent 服务，避免残留进程。 */
export function stopAgentServerOnQuit() {
    const pid = readPid();
    if (isOurAgent(pid)) killTree(pid);
}
