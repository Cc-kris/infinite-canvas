import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";

import { applyCors, HttpError, sendError, sendJson, serveFile } from "./http.mjs";
import { handlePublishedMedia } from "./published-media.mjs";
import { createRouter } from "./router.mjs";
import { register as registerProviders } from "./routes/providers.mjs";
import { register as registerContent } from "./routes/content.mjs";
import { register as registerMedia } from "./routes/media.mjs";
import { register as registerImaging } from "./routes/imaging.mjs";
import { register as registerStorage } from "./routes/storage.mjs";

const ROUTE_MODULES = [registerProviders, registerContent, registerMedia, registerImaging, registerStorage];

/**
 * 主进程本地业务服务。只监听回环地址，所有业务接口都要求启动时生成的随机 token；
 * 渲染层通过 preload 拿到 url + token，业务实现由 routes/ 下各能力模块注册。
 */
export async function createService(options = {}) {
    const {
        host = "127.0.0.1",
        port = 23212,
        portScan = 12,
        token,
        dataRoot,
        allowedOrigin = "",
        fetchImpl = globalThis.fetch,
        version = "",
    } = options;
    if (!token) throw new Error("app service requires a token");
    if (!dataRoot) throw new Error("app service requires a dataRoot");

    mkdirSync(dataRoot, { recursive: true });
    const router = createRouter();
    const ctx = {
        token,
        dataRoot,
        allowedOrigin,
        version,
        fetch: (...args) => fetchImpl(...args),
    };
    for (const register of ROUTE_MODULES) register(router, ctx);

    const server = createServer((req, res) => {
        handleRequest(req, res, router, ctx).catch((error) => {
            if (error instanceof HttpError) return sendError(res, error.status, error.code, error.message);
            console.error("[infinite-canvas:service]", error);
            if (!res.headersSent) sendError(res, 500, "internal-error", error?.message || "本地服务内部错误");
            else res.destroy();
        });
    });

    const actualPort = await listenWithScan(server, host, port, portScan);
    return {
        url: `http://${host}:${actualPort}`,
        port: actualPort,
        close: () =>
            new Promise((resolve) => {
                server.closeAllConnections?.();
                server.close(() => resolve());
            }),
    };
}

async function handleRequest(req, res, router, ctx) {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    // 素材发布通道由公网隧道回拉，不能要求 renderer Origin 或 token；仍只监听回环地址。
    if (url.pathname === "/__media" || url.pathname.startsWith("/__media/")) {
        return handlePublishedMedia(req, res, url, ctx);
    }
    if (!applyCors(req, res, ctx.allowedOrigin)) {
        req.resume();
        return sendError(res, 403, "origin-not-allowed", "请求来源不被本地服务信任");
    }
    if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
    }
    if (url.pathname === "/health") {
        if (req.method !== "GET") return sendError(res, 405, "method-not-allowed", "只支持 GET");
        return sendJson(res, 200, { ok: true, app: "infinite-canvas-service", version: ctx.version });
    }
    const protectedPath = url.pathname.startsWith("/api/") || url.pathname.startsWith("/files/");
    if (!protectedPath) return sendError(res, 404, "not-found", "接口不存在");
    if (!authorized(req, url, ctx.token)) {
        req.resume();
        return sendError(res, 401, "unauthorized", "本地服务 token 无效");
    }
    if (url.pathname.startsWith("/files/")) {
        if (req.method !== "GET" && req.method !== "HEAD") return sendError(res, 405, "method-not-allowed", "只支持 GET/HEAD");
        return serveFile(req, res, url.pathname, [path.join(ctx.dataRoot, "media"), path.join(ctx.dataRoot, "assets")]);
    }
    const handler = router.match(req.method, url.pathname);
    if (!handler) return sendError(res, 404, "not-found", "接口不存在");
    return handler(req, res, ctx, url);
}

function authorized(req, url, token) {
    const header = String(req.headers.authorization || "");
    const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
    const provided = bearer || url.searchParams.get("token") || "";
    if (provided.length !== token.length) return false;
    return timingSafeEqual(Buffer.from(provided), Buffer.from(token));
}

function listenWithScan(server, host, port, portScan) {
    return new Promise((resolve, reject) => {
        let offset = 0;
        const attempt = () => {
            const onError = (error) => {
                server.removeListener("listening", onListening);
                if (error?.code === "EADDRINUSE" && offset < portScan - 1) {
                    offset += 1;
                    attempt();
                } else {
                    reject(error);
                }
            };
            const onListening = () => {
                server.removeListener("error", onError);
                const address = server.address();
                resolve(typeof address === "object" && address ? address.port : port + offset);
            };
            server.once("error", onError);
            server.once("listening", onListening);
            server.listen(port + offset, host);
        };
        attempt();
    });
}
