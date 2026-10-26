// 插件（MCP）安装与联通测试的单一实现。
//
// 客户端主进程（desktop/agent-hub.js，经 Electron 运行）和网页 dev server
// （web/vite-plugins/local-agent-hub.ts）都从这里 import，避免两端各写一套、渐渐长歪。
// 本文件只依赖 Node 标准库与 agent-detect.js，不含任何 Electron API。
import fs from "node:fs";
import path from "node:path";
import { RUNTIMES, childEnv, resolveCommand, runArgs, spawn } from "./agent-detect.js";

/**
 * 安装 MCP 插件（幂等）。
 * 注册的命令统一为「当前 node 可执行文件以 Node 模式运行 canvas-agent 产物」：
 * 客户端是 Electron 以 Node 模式跑，网页端是 dev server 的 node 直接跑，argv 形状一致。
 */
export function ensureMcp(runtime, { agentEntry, execPath = process.execPath } = {}) {
    const spec = RUNTIMES.find((item) => item.id === runtime);
    if (!spec || spec.mode !== "mcp") return { ok: true, skipped: true, output: "" };
    const bin = resolveCommand(spec.bin);
    if (!bin) return { ok: false, output: `${spec.label} 未安装` };
    if (!agentEntry || !fs.existsSync(agentEntry)) return { ok: false, output: "内置 Agent 入口缺失" };

    const serverArgv = [execPath, agentEntry, "mcp"];
    const envs = ["ELECTRON_RUN_AS_NODE=1", `CANVAS_AGENT_ENTRY=${agentEntry}`];

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

/**
 * 插件联通测试：真的把 MCP 服务拉起来走一遍 initialize → tools/list → tools/call。
 * 只有进程能启动、协议能握手、工具能调用，才算「插件方式可用」；
 * 任何一步失败都返回 ok:false，调用方据此无声降级到运行时方式。
 */
export function probeMcpServer({ agentEntry, agentDir, execPath = process.execPath, timeout = 9000 } = {}) {
    return new Promise((resolve) => {
        if (!agentEntry || !fs.existsSync(agentEntry)) return resolve({ ok: false, output: "内置 Agent 入口缺失" });
        const child = spawn(execPath, [agentEntry, "mcp"], {
            cwd: agentDir || path.dirname(agentEntry),
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true,
            env: childEnv({ ELECTRON_RUN_AS_NODE: "1", CANVAS_AGENT_ENTRY: agentEntry }),
        });
        let buffer = "";
        let noise = "";
        let finished = false;
        const done = (result) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            try {
                child.stdin.end();
                child.kill();
            } catch {
                /* 进程已退出 */
            }
            resolve(result);
        };
        const send = (message) => {
            try {
                child.stdin.write(`${JSON.stringify(message)}\n`);
            } catch {
                /* stdin 已关闭，等超时兜底 */
            }
        };
        const timer = setTimeout(() => done({ ok: false, output: `握手超时：${noise.slice(-200)}` }), timeout);

        child.stdout.on("data", (chunk) => {
            buffer += chunk.toString("utf8");
            for (;;) {
                const index = buffer.indexOf("\n");
                if (index < 0) break;
                const line = buffer.slice(0, index).trim();
                buffer = buffer.slice(index + 1);
                if (!line) continue;
                let message;
                try {
                    message = JSON.parse(line);
                } catch {
                    noise += line;
                    continue;
                }
                if (message.id === 1 && message.result) {
                    // 握手成功，取一次工具清单，再真实调用一个只读工具。
                    send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
                    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
                } else if (message.id === 2) {
                    const tools = Array.isArray(message.result?.tools) ? message.result.tools.length : 0;
                    if (!tools) return done({ ok: false, output: "MCP 服务未返回任何工具" });
                    send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "canvas_get_state", arguments: {} } });
                } else if (message.id === 3) {
                    if (message.error) {
                        // 服务在跑、工具能调用，只是此刻没有画布页面在线——插件本身是通的。
                        const text = String(message.error.message || "");
                        if (/没有已连接画布|not connected/i.test(text)) return done({ ok: true, degraded: true, output: "MCP 就绪（画布页面未就绪）" });
                        return done({ ok: false, output: `工具调用失败：${text.slice(0, 200)}` });
                    }
                    return done({ ok: true, degraded: false, output: "MCP 就绪，工具调用成功" });
                } else if (message.id === 1 && message.error) {
                    return done({ ok: false, output: `握手被拒：${JSON.stringify(message.error).slice(0, 200)}` });
                }
            }
        });
        child.stderr.on("data", (chunk) => {
            noise += chunk.toString("utf8").slice(-500);
        });
        child.on("error", (error) => done({ ok: false, output: `无法启动 MCP 服务：${error instanceof Error ? error.message : String(error)}` }));
        child.on("exit", (code) => done({ ok: false, output: `MCP 进程退出（${code}）：${noise.slice(-200)}` }));

        // MCP stdio 传输用换行分隔的 JSON-RPC，不需要 Content-Length 头。
        send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "canvas-desktop", version: "0.25.0" } } });
    });
}

/** 判断某个运行时是否真的能用插件方式：注册在案 + 握手通过。 */
export async function verifyPlugin(runtime, options = {}) {
    const spec = RUNTIMES.find((item) => item.id === runtime);
    if (!spec) return { ok: false, output: "未知运行时" };
    if (spec.mode !== "mcp") return { ok: false, output: `${spec.label} 通过运行时方式连接` };
    const bin = resolveCommand(spec.bin);
    if (!bin) return { ok: false, output: `${spec.label} 命令行未安装` };
    const listed = runArgs(bin, ["mcp", "list"], 20_000);
    if (!/infinite-canvas/.test(listed.output)) return { ok: false, output: `插件未注册到 ${spec.label}` };
    return probeMcpServer(options);
}

/**
 * 尝试用插件方式接通某个运行时：装插件 → 验证 → 返回 mode。
 * 失败不抛错，由调用方降级到「直接运行」。
 */
export async function setupPlugin(runtime, options = {}, report = () => {}) {
    const spec = RUNTIMES.find((item) => item.id === runtime);
    if (!spec || spec.mode !== "mcp") return { ok: false, mode: "", detail: "" };
    report("plugin");
    const mcp = ensureMcp(runtime, options);
    const verified = mcp.ok ? await verifyPlugin(runtime, options) : { ok: false, output: mcp.output };
    return { ok: Boolean(verified.ok), mode: verified.ok ? "plugin" : "", detail: verified.output || mcp.output || "" };
}
