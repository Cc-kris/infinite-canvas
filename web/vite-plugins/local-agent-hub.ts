import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

/**
 * 网页版的本机 Agent 中枢（仅在 dev / preview 生效）。
 *
 * 桌面版由 Electron 主进程跑 desktop/agent-hub.js：探测 CLI → 拉起 canvas-agent →
 * 写运行时 → 把 url + token 交给页面。浏览器做不到这些，所以在「dev server 跑在本机」
 * 这个前提下，把同一套能力搬进 vite 中间件；前端据此装一层与桌面端同形的 agentHub 垫片，
 * 连接界面和使用路径与客户端完全一致，用户不再需要手填 Local URL / token。
 *
 * 安全边界：
 * - 只接受回环地址来的请求（dev server 常常 --host 0.0.0.0，token 不能外泄给局域网）；
 * - 只接受 localhost / 127.0.0.1 的 Origin；
 * - 生产构建（远端站点）没有这层中间件，前端探测失败后回落原有手填入口。
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../..");
const CONFIG_DIR = path.join(os.homedir(), ".infinite-canvas");
const CONFIG_FILE = path.join(CONFIG_DIR, "canvas-agent.json");
const PID_FILE = path.join(CONFIG_DIR, "agent-server.pid");
const LOG_FILE = path.join(os.tmpdir(), "infinite-canvas-agent.log");
const DEFAULT_PORT = 17371;
const HEALTH_TIMEOUT_MS = 2500;
const START_TIMEOUT_MS = 30_000;

const RUNTIMES = [
    { id: "claude", label: "Claude Code", bin: "claude", mode: "mcp" },
    { id: "codex", label: "Codex", bin: "codex", mode: "mcp" },
    { id: "galley", label: "Galley", bin: "galley", mode: "bridge" },
];

type AgentConfig = { url: string; token: string; runtime?: string; mode?: string; origins?: string[] };

const readConfig = (): AgentConfig => {
    try {
        const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as Partial<AgentConfig>;
        return {
            url: String(raw.url || `http://127.0.0.1:${DEFAULT_PORT}`),
            token: String(raw.token || ""),
            runtime: raw.runtime,
            mode: raw.mode,
            origins: raw.origins,
        };
    } catch {
        return { url: `http://127.0.0.1:${DEFAULT_PORT}`, token: "" };
    }
};

const probe = async (url: string) => {
    if (!url) return false;
    try {
        const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
        return res.ok;
    } catch {
        return false;
    }
};

/** dev server 的 node 进程直接拉起 agent 产物；cwd 落到 agent 目录，方便它解析同目录资源。 */
const spawnAgent = (entry: string) => {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    const log = fs.openSync(LOG_FILE, "a");
    const child = spawn(process.execPath, [entry], {
        cwd: path.dirname(entry),
        detached: true,
        stdio: ["ignore", log, log],
        env: { ...process.env, CANVAS_AGENT_INSTRUCTIONS: path.join(path.dirname(entry), "agent-instructions.md") },
    });
    child.unref();
    if (child.pid) fs.writeFileSync(PID_FILE, String(child.pid), { mode: 0o600 });
    return child;
};

/** 拉起服务：并发调用共用同一次启动，避免两个请求抢端口、互相覆盖 token。 */
let ensureTask: Promise<AgentConfig & { started: boolean }> | null = null;
const ensureServer = (entry: string) => {
    ensureTask ||= ensureServerOnce(entry).finally(() => {
        ensureTask = null;
    });
    return ensureTask;
};

async function ensureServerOnce(entry: string): Promise<AgentConfig & { started: boolean }> {
    const current = readConfig();
    if (await probe(current.url)) return { ...current, started: false };
    if (!fs.existsSync(entry)) throw new Error(`内置 Agent 服务缺失：${entry}`);

    const child = spawnAgent(entry);
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        const next = readConfig();
        if (await probe(next.url)) return { ...next, started: true };
        if (child.exitCode !== null && child.exitCode !== 0) break;
    }
    throw new Error(`本地 Agent 服务启动失败，详见 ${LOG_FILE}`);
}

const agentJson = async <T,>(config: AgentConfig, pathname: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(`${config.url}${pathname}`, {
        ...init,
        headers: { "content-type": "application/json", "x-canvas-agent-token": config.token, ...(init?.headers || {}) },
        signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
    if (!res.ok || body?.ok === false) throw new Error(body?.error || `本地服务返回 HTTP ${res.status}`);
    return body;
};

const emptyRuntimes = () =>
    RUNTIMES.map((item) => ({ ...item, installed: false, cliInstalled: false, desktop: false, version: "", path: "", customPath: "", plugin: null }));

const listState = async () => {
    const config = readConfig();
    if (!(await probe(config.url))) {
        return { server: { running: false, url: "", token: "", error: "" }, runtime: "", mode: "", connecting: null, runtimes: emptyRuntimes() };
    }
    const body = await agentJson<{ runtime?: string; runtimes?: unknown[] }>(config, "/api/agent/runtimes").catch(() => ({ runtimes: [] as unknown[] }));
    return {
        server: { running: true, url: config.url, token: config.token, error: "" },
        runtime: String(body.runtime || config.runtime || ""),
        mode: config.mode === "plugin" ? "plugin" : config.mode === "runtime" ? "runtime" : "",
        connecting: null,
        runtimes: body.runtimes || [],
    };
};

const writeMode = (mode: string) => {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...readConfig(), mode }, null, 2), { mode: 0o600 });
    } catch {
        /* 写不进去只影响卡片上的「插件/运行时」标注 */
    }
};

const connect = async (entry: string, runtime: string) => {
    const spec = RUNTIMES.find((item) => item.id === runtime);
    if (!spec) return { ok: false, error: `未知的运行时：${runtime}`, runtime };
    let config: AgentConfig & { started: boolean };
    try {
        config = await ensureServer(entry);
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error), runtime };
    }
    // 与桌面版一致：没装就明确告诉用户装什么，而不是假装连上。
    const before = await agentJson<{ runtimes?: Array<{ id: string; installed: boolean }> }>(config, "/api/agent/runtimes").catch(() => ({ runtimes: [] }));
    if (!before.runtimes?.find((item) => item.id === runtime)?.installed) {
        return { ok: false, error: `未检测到 ${spec.label}，请先安装它的命令行或桌面版`, runtime };
    }
    try {
        await agentJson(config, "/api/agent/runtime", { method: "POST", body: JSON.stringify({ runtime }) });
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error), runtime };
    }
    // 网页侧不往本机 CLI 写 MCP 配置，直接走「运行时驱动 CLI」，功能等价。
    writeMode("runtime");
    return { ok: true, url: config.url, token: config.token, runtime, mode: "runtime", started: config.started };
};

const disconnect = async () => {
    const config = readConfig();
    try {
        const pid = Number(fs.readFileSync(PID_FILE, "utf8").trim());
        if (Number.isFinite(pid) && pid > 0) {
            process.kill(pid, "SIGTERM");
            for (let i = 0; i < 20 && (await probe(config.url)); i += 1) await new Promise((resolve) => setTimeout(resolve, 150));
        }
    } catch {
        /* pid 文件不存在或进程已退出 */
    }
    fs.rmSync(PID_FILE, { force: true });
    const running = await probe(config.url);
    if (running) await agentJson(config, "/api/agent/runtime", { method: "POST", body: JSON.stringify({ runtime: "" }) }).catch(() => {});
    writeMode("");
    return { ok: !running, running, runtime: "" };
};

/** 只对本机开放：dev server 常常 --host 0.0.0.0，这层 token 不能给局域网。 */
const isLoopback = (req: IncomingMessage) => {
    const address = req.socket.remoteAddress || "";
    if (!(address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1")) return false;
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
        const { hostname } = new URL(origin);
        return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
    } catch {
        return false;
    }
};

const readBody = (req: IncomingMessage) =>
    new Promise<Record<string, unknown>>((resolve) => {
        let raw = "";
        req.on("data", (chunk) => {
            raw += chunk;
            if (raw.length > 64 * 1024) req.destroy();
        });
        req.on("end", () => {
            try {
                resolve(JSON.parse(raw || "{}") as Record<string, unknown>);
            } catch {
                resolve({});
            }
        });
    });

/** canvas-agent 产物：仓库内构建产物优先，其次桌面版内置单文件产物。 */
const resolveEntry = () => {
    const candidates = [path.join(REPO_ROOT, "canvas-agent/dist/index.js"), path.join(REPO_ROOT, "desktop/agent/canvas-agent.mjs")];
    return candidates.find((file) => fs.existsSync(file)) || candidates[0];
};

export function localAgentHub(): Plugin {
    const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = new URL(req.url || "/", "http://127.0.0.1");
        if (!url.pathname.startsWith("/__canvas-hub")) return next();
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.setHeader("cache-control", "no-store");
        const origin = req.headers.origin;
        if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
        if (!isLoopback(req)) {
            res.statusCode = 403;
            res.end(JSON.stringify({ ok: false, error: "local hub is loopback only" }));
            return;
        }
        const entry = resolveEntry();
        try {
            if (req.method === "GET" && url.pathname === "/__canvas-hub/state") {
                res.end(JSON.stringify({ ok: true, localHub: true, ...(await listState()) }));
                return;
            }
            if (req.method === "POST" && url.pathname === "/__canvas-hub/connect") {
                const body = await readBody(req);
                res.end(JSON.stringify(await connect(entry, String(body.runtime || ""))));
                return;
            }
            if (req.method === "POST" && url.pathname === "/__canvas-hub/disconnect") {
                res.end(JSON.stringify(await disconnect()));
                return;
            }
            if (req.method === "POST" && url.pathname === "/__canvas-hub/path") {
                const body = await readBody(req);
                const config = await ensureServer(entry);
                const result = await agentJson(config, "/api/agent/runtime-path", { method: "POST", body: JSON.stringify({ runtime: body.runtime, dir: body.dir }) });
                res.end(JSON.stringify({ ok: true, ...result }));
                return;
            }
            res.statusCode = 404;
            res.end(JSON.stringify({ ok: false, error: "unknown hub route" }));
        } catch (error) {
            res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
        }
    };
    return {
        name: "local-agent-hub",
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                void handle(req, res, next);
            });
        },
        configurePreviewServer(server) {
            server.middlewares.use((req, res, next) => {
                void handle(req, res, next);
            });
        },
    };
}
