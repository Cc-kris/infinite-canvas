import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

// 第二跳的判定与 npx 独立运行时共用同一份实现，网页端不另写一套。
import { detectSystemProxy } from "../../canvas-proxy/system-proxy.js";

/**
 * 网页版的本地转发代理（仅 dev / preview 生效）。
 *
 * 桌面端由 Electron 主进程 import canvas-proxy 并在进程内起服务；浏览器做不到，
 * 所以在「dev server 跑在本机」这个前提下由 vite 拉起同一个 canvas-proxy 子进程，
 * 页面那侧探测 23210 就能探到，行为与客户端一致，用户不必再手动跑命令。
 *
 * 两跳在这里各归各位：
 *   ① 浏览器 → 127.0.0.1:23210：由这个插件保证 23210 上有代理在跑；
 *   ② 127.0.0.1:23210 → 上游：插件先探测系统代理，有就以 NODE_USE_ENV_PROXY=1 交给子进程，
 *      没有就让子进程直连——「需要就跳，不需要就不跳」。
 *
 * 之所以由插件来做第②跳的探测，而不是让子进程自己重启：index.js 的重启是「父进程退出、
 * 子进程接管」，那样 vite 手上只剩一个已退出的 pid，dev server 关掉时收不了尾。
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const PROXY_ENTRY = path.resolve(here, "../../canvas-proxy/index.js");
const PROXY_PORT = 23210;
const READY_TIMEOUT_MS = 8000;

type IdentityPayload = {
    app?: string;
    proxy?: string;
    version?: string;
    transports?: string[];
    route?: string | null;
};

/** 根路径回的是自己的身份信息，用它兼做「这个端口上是不是我们的代理」的判据。 */
async function readIdentity(url: string): Promise<IdentityPayload | null> {
    try {
        const response = await fetch(`${url}/`, { signal: AbortSignal.timeout(1200) });
        if (!response.ok) return null;
        const payload = (await response.json()) as IdentityPayload;
        return payload?.app === "infinite-canvas" && payload?.proxy ? payload : null;
    } catch {
        return null;
    }
}

async function waitForIdentity(url: string, deadline: number): Promise<IdentityPayload | null> {
    for (;;) {
        const payload = await readIdentity(url);
        if (payload) return payload;
        if (Date.now() > deadline) return null;
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
}

export function localProxy(): Plugin {
    let child: ChildProcess | null = null;

    return {
        name: "local-canvas-proxy",
        apply: "serve",
        async configureServer(server) {
            const url = `http://127.0.0.1:${PROXY_PORT}`;

            const existing = await readIdentity(url);
            if (existing) {
                server.config.logger.info(`[proxy] reusing ${existing.proxy} v${existing.version} at ${url}`);
                return;
            }

            // 第二跳：有系统代理就走，没有就直连。判定结果直接进子进程环境变量。
            const systemProxy = process.env.CANVAS_PROXY_DISABLE_SYSTEM_PROXY === "1" ? null : detectSystemProxy();
            const env: NodeJS.ProcessEnv = { ...process.env };
            if (systemProxy) {
                // Node 只在进程启动时读这个变量；子进程是新建的，所以这里设置是有效的。
                env.NODE_USE_ENV_PROXY = "1";
                env.HTTPS_PROXY = systemProxy.url;
                env.HTTP_PROXY = systemProxy.url;
                env.ALL_PROXY = systemProxy.url;
                env.CANVAS_PROXY_SYSTEM_PROXY_REEXEC = "1";
            }

            child = spawn(process.execPath, [PROXY_ENTRY, "--port", String(PROXY_PORT), "--host", "127.0.0.1"], {
                stdio: ["ignore", "pipe", "pipe"],
                env,
            });
            const prefix = `[proxy] ${systemProxy ? `outbound via ${systemProxy.source} ${systemProxy.url}` : "outbound direct (no system proxy)"}`;
            server.config.logger.info(prefix);

            const forward = (chunk: Buffer) => {
                const text = chunk.toString().trimEnd();
                if (text) server.config.logger.info(`[proxy] ${text}`);
            };
            child.stdout?.on("data", forward);
            child.stderr?.on("data", forward);

            const identity = await waitForIdentity(url, Date.now() + READY_TIMEOUT_MS);
            if (!identity) {
                server.config.logger.warn(`[proxy] not ready at ${url}; page falls back to direct connections`);
                child.kill();
                child = null;
                return;
            }
            server.config.logger.info(`[proxy] ready at ${url} (transports: ${identity.transports?.join(", ") || "?"})`);

            const stop = () => {
                if (!child) return;
                child.kill();
                child = null;
            };
            server.httpServer?.once("close", () => {
                if (!child) return;
                server.config.logger.info("[proxy] shutting down with the dev server");
                stop();
            });
            process.once("exit", stop);
        },
    };
}
