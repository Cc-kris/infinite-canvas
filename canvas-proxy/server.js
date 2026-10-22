#!/usr/bin/env node
/**
 * Reusable Infinite Canvas forwarding proxy server.
 *
 * Exported so the desktop app can embed the proxy in its own process instead of
 * spawning `npx @basketikun/canvas-proxy`.
 */
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { Readable } from "node:stream";

const pkg = createRequire(import.meta.url)("./package.json");

const CORS_HEADERS = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "*",
    "access-control-allow-headers": "*",
    "access-control-expose-headers": "*",
    "access-control-max-age": "86400",
};

/** Headers that describe the hop to this proxy rather than the upstream request. */
const SKIP_REQUEST_HEADERS = new Set(["host", "connection", "content-length", "accept-encoding", "origin", "referer", "sec-fetch-dest", "sec-fetch-mode", "sec-fetch-site"]);
/** fetch() already decoded and re-framed the body, so the upstream framing headers no longer apply. */
const SKIP_RESPONSE_HEADERS = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"]);

function readArg(args, name, fallback) {
    const index = args.indexOf(`--${name}`);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}

function readTarget(url) {
    const raw = url.slice(1);
    // decodeURI undoes the escaping browsers apply to the path while keeping intentional encodeURIComponent escapes.
    let target = raw;
    try {
        target = decodeURI(raw);
    } catch {
        // Malformed escape sequence: forward the raw form instead of failing.
    }
    // Some clients collapse the "//" in the embedded target URL, so restore it before parsing.
    target = target.replace(/^(https?:)\/*/i, "$1//");
    return /^https?:\/\/[^/]/i.test(target) ? target : "";
}

function requestHeaders(req) {
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
        if (SKIP_REQUEST_HEADERS.has(key) || value === undefined) continue;
        headers[key] = Array.isArray(value) ? value.join(", ") : value;
    }
    return headers;
}

function responseHeaders(upstream) {
    const headers = { ...CORS_HEADERS };
    upstream.headers.forEach((value, key) => {
        if (SKIP_RESPONSE_HEADERS.has(key) || key.startsWith("access-control-")) return;
        headers[key] = value;
    });
    return headers;
}

function sendJson(res, status, payload) {
    res.writeHead(status, { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(payload));
}

function logForward(method, target, outcome, startedAt) {
    console.log(`${new Date().toLocaleTimeString()} ${method} ${target} -> ${outcome} ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

/**
 * Outbound transports, tried in order. The desktop app injects Electron's net.fetch first
 * because plain Node fetch (undici) ignores the OS proxy settings entirely: on Windows a
 * Clash/V2Ray "system proxy" leaves undici dialling the API directly, which shows up as
 * `fetch failed` (DNS) or a ten-minute hang (silent drop).
 */
let fetchCandidates = [{ name: "node", proxyAware: false, fetch: (input, init) => globalThis.fetch(input, init) }];
/** How long the upstream may stay silent before we give up on the request headers. */
let headerTimeoutMs = Number(process.env.CANVAS_PROXY_HEADER_TIMEOUT_MS) || 180_000;

export function setFetchCandidates(candidates) {
    const usable = (candidates || []).filter((item) => typeof item?.fetch === "function");
    if (!usable.length) return;
    fetchCandidates = usable.map((item) => ({ name: item.name || "fetch", proxyAware: Boolean(item.proxyAware), fetch: item.fetch }));
}

/** Backwards-compatible single-transport hook. */
export function setFetchImpl(impl, name = "custom") {
    if (typeof impl !== "function") return;
    setFetchCandidates([{ name, fetch: impl }]);
}

export function setHeaderTimeout(ms) {
    if (Number.isFinite(ms) && ms > 0) headerTimeoutMs = ms;
}

class UpstreamTimeoutError extends Error {
    constructor(ms) {
        super(`upstream sent no response headers within ${Math.round(ms / 1000)}s`);
        this.name = "UpstreamTimeoutError";
        this.code = "ETIMEDOUT";
    }
}

/** Chromium reports failures as `net::ERR_*` inside the error message. */
const CHROMIUM_NET_ERROR = /net::(ERR_[A-Z_]+)/;

/** Human explanation + actionable advice per failure code, so the UI never shows a bare `fetch failed`. */
const FAILURE_HINTS = {
    ENOTFOUND: ["域名解析失败", "接口域名解析不出来，通常是网络不通或代理没走对；请确认代理已启动，必要时切换为全局/TUN 模式"],
    EAI_AGAIN: ["DNS 查询超时", "DNS 无响应，请检查网络或代理的 DNS 设置"],
    ERR_NAME_NOT_RESOLVED: ["域名解析失败", "接口域名解析不出来，通常是网络不通或代理没走对；请确认代理已启动，必要时切换为全局/TUN 模式"],
    ECONNREFUSED: ["连接被拒绝", "目标端口没有服务在监听，请确认接口地址与端口填写正确"],
    ERR_CONNECTION_REFUSED: ["连接被拒绝", "目标端口没有服务在监听，请确认接口地址与端口填写正确"],
    ECONNRESET: ["连接被重置", "连接被中途切断，常见于网络干扰；请更换代理节点或开启全局模式后重试"],
    ERR_CONNECTION_RESET: ["连接被重置", "连接被中途切断，常见于网络干扰；请更换代理节点或开启全局模式后重试"],
    ERR_CONNECTION_CLOSED: ["连接被对方关闭", "服务端或中间网络提前断开，请稍后重试或更换接口地址"],
    ETIMEDOUT: ["连接超时", "网络握手超时，通常是代理不通或线路被限制；请检查代理状态与节点"],
    UND_ERR_CONNECT_TIMEOUT: ["连接超时", "网络握手超时，通常是代理不通或线路被限制；请检查代理状态与节点"],
    ERR_CONNECTION_TIMED_OUT: ["连接超时", "网络握手超时，通常是代理不通或线路被限制；请检查代理状态与节点"],
    ERR_TIMED_OUT: ["连接超时", "网络握手超时，通常是代理不通或线路被限制；请检查代理状态与节点"],
    EHOSTUNREACH: ["主机不可达", "网络路由不可达，请检查网络连接"],
    ENETUNREACH: ["网络不可达", "当前网络不可用，请检查网络连接"],
    ERR_ADDRESS_UNREACHABLE: ["主机不可达", "网络路由不可达，请检查网络连接"],
    ERR_INTERNET_DISCONNECTED: ["本机网络已断开", "请检查网络连接后重试"],
    ERR_PROXY_CONNECTION_FAILED: ["系统代理不可用", "系统代理（Clash/V2Ray 等）没有运行或端口不对；请启动代理，或关闭系统代理后重试"],
    ERR_TUNNEL_CONNECTION_FAILED: ["代理隧道建立失败", "代理拒绝为这个域名建立隧道，请检查代理规则（是否走了 DIRECT）"],
    ERR_MANDATORY_PROXY_CONFIGURATION_FAILED: ["读取系统代理配置失败", "请在系统中关闭代理后重试"],
    ERR_CERT_AUTHORITY_INVALID: ["HTTPS 证书校验失败", "证书被替换，通常是代理软件的 HTTPS 解密未受信任；请关闭解密或安装其根证书"],
    ERR_CERT_COMMON_NAME_INVALID: ["HTTPS 证书域名不匹配", "可能是代理软件做了中间人，请检查代理的 HTTPS 解密设置"],
    ERR_SSL_PROTOCOL_ERROR: ["TLS 握手失败", "代理或中间网络破坏了 TLS，请更换节点后重试"],
    ERR_HTTP2_PROTOCOL_ERROR: ["HTTP/2 协议错误", "代理对 HTTP/2 支持有问题，请尝试更换节点"],
    ERR_TOO_MANY_REDIRECTS: ["重定向次数过多", "接口地址可能填成了网页地址，请确认填的是 API Base URL"],
};

function readFailureCode(error) {
    const chromium = CHROMIUM_NET_ERROR.exec(error?.message || "") || CHROMIUM_NET_ERROR.exec(error?.cause?.message || "");
    if (chromium) return chromium[1];
    const cause = error?.cause;
    return cause?.code || error?.code || (error?.name === "AbortError" ? "ABORTED" : "");
}

/** Flatten an outbound failure into { channel, code, message } for logs and the 502 body. */
function describeFailure(channel, error) {
    const cause = error?.cause;
    return {
        channel,
        code: readFailureCode(error),
        message: cause?.message || error?.message || String(error),
    };
}

function failureMessage(host, attempts) {
    // The direct attempt is the honest measure of upstream reachability: a proxy-specific
    // failure (ERR_PROXY_CONNECTION_FAILED) must not mask "the domain does not resolve".
    const first = attempts.find((item) => item.channel === "direct") || attempts[0];
    if (!first) return `无法连接 ${host}：请求在上游发起前就被中断（客户端取消或代理内部错误）。建议：重试一次；若持续出现，请把日志反馈给开发者`;
    const [label, advice] = FAILURE_HINTS[first.code] || [first.code ? "请求失败" : "请求失败", "请检查网络与接口地址后重试"];
    const suffix = first.code ? `（${first.code}）` : "";
    const tried = attempts.map((item) => `${item.channel === "system" ? "系统代理" : item.channel === "direct" ? "直连" : item.channel}${item.code ? `:${item.code}` : ""}`).join(" / ");
    const detail = attempts.length > 1 ? `；已尝试 ${tried}` : "";
    return `无法连接 ${host}：${label}${suffix}。建议：${advice}${detail}`;
}

function hostOf(target) {
    try {
        return new URL(target).host;
    } catch {
        return target;
    }
}

function isLoopbackTarget(target) {
    try {
        const host = new URL(target).hostname;
        return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
    } catch {
        return false;
    }
}

/**
 * Try every transport until one returns response headers. Retrying is safe because the body
 * is only streamed after a transport succeeded, so the client never receives partial output.
 */
/** Statuses that usually mean "this exit node is not allowed", not "your request is wrong". */
const PROXY_REJECTED_STATUSES = new Set([403, 407, 451]);

async function fetchUpstream(target, init, isAborted) {
    const ordered = isLoopbackTarget(target)
        ? [...fetchCandidates].sort((a, b) => Number(a.proxyAware) - Number(b.proxyAware))
        : fetchCandidates;
    const attempts = [];
    // The first transport gets the full budget, a fallback only what is left of the total
    // (1.5x), so a black-holed proxy cannot turn one request into two full timeouts.
    const deadline = Date.now() + headerTimeoutMs * 1.5;
    for (const candidate of ordered) {
        if (isAborted()) break;
        const budget = Math.max(2000, Math.min(headerTimeoutMs, deadline - Date.now()));
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new UpstreamTimeoutError(budget)), budget);
        try {
            const response = await candidate.fetch(target, { ...init, signal: controller.signal });
            // A VPN exit can itself be rejected by the API (domestic relays routinely block
            // foreign IPs with 403). Trying the direct route costs nothing here: no request
            // has been billed yet and no response body has been sent to the client.
            const hasNext = ordered[ordered.indexOf(candidate) + 1] !== undefined;
            if (hasNext && candidate.proxyAware && PROXY_REJECTED_STATUSES.has(response.status)) {
                attempts.push({
                    channel: candidate.name,
                    code: `HTTP_${response.status}`,
                    message: `proxied request answered HTTP ${response.status}`,
                });
                try {
                    await response.body?.cancel();
                } catch {
                    // Nothing to release.
                }
                continue;
            }
            return { response, candidate, controller, attempts };
        } catch (error) {
            attempts.push(describeFailure(candidate.name, error));
        } finally {
            clearTimeout(timer);
        }
    }
    return { response: null, attempts };
}

async function forward(req, res, target) {
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
    let clientGone = Boolean(req.socket?.destroyed);
    // `req` emits "close" as soon as its body has been consumed, which is not a disconnect —
    // only the socket tells us the client really went away.
    const socket = req.socket;
    const onSocketClose = () => {
        clientGone = true;
    };
    socket?.on("close", onSocketClose);
    const isAborted = () => clientGone || res.writableEnded;
    const { response: upstream, candidate, controller, attempts } = await fetchUpstream(
        target,
        { method: req.method, headers: requestHeaders(req), body, redirect: "follow" },
        isAborted,
    );
    if (!upstream) {
        const failure = new Error(failureMessage(hostOf(target), attempts));
        failure.attempts = attempts;
        throw failure;
    }
    if (attempts.length) {
        console.log(`  retried via ${candidate.name} after ${attempts.map((item) => `${item.channel}:${item.code || item.message}`).join(", ")}`);
    }
    // Logged as soon as the status line arrives, so a long SSE stream still shows up immediately.
    res.writeHead(upstream.status, responseHeaders(upstream));
    if (!upstream.body) {
        res.end();
        return upstream.status;
    }
    // Streamed so that SSE responses (text generation) reach the browser chunk by chunk.
    const stream = Readable.fromWeb(upstream.body);
    res.on("close", () => {
        stream.destroy();
        try {
            controller.abort();
        } catch {
            // Already finished.
        }
    });
    stream.pipe(res);
    res.on("finish", () => socket?.off("close", onSocketClose));
    return upstream.status;
}

export function createProxyServer() {
    return createServer((req, res) => {
        if (req.method === "OPTIONS") {
            res.writeHead(204, CORS_HEADERS);
            res.end();
            return;
        }
        const target = readTarget(req.url || "/");
        if (!target) {
            sendJson(res, 200, {
                app: "infinite-canvas",
                proxy: pkg.name,
                version: pkg.version,
                transports: fetchCandidates.map((item) => item.name),
                usage: "/<full-target-url>",
            });
            return;
        }
        const startedAt = Date.now();
        const method = req.method || "GET";
        forward(req, res, target)
            .then((status) => logForward(method, target, status, startedAt))
            .catch((error) => {
                const reason = error instanceof Error ? error.message : String(error);
                logForward(method, target, `failed (${reason})`, startedAt);
                if (res.headersSent) {
                    res.destroy();
                    return;
                }
                const attempts = Array.isArray(error?.attempts) ? error.attempts : [];
                const primary = attempts.find((item) => item.channel === "direct") || attempts[0];
                sendJson(res, 502, {
                    // Shown verbatim by the app, so it carries the cause in plain language.
                    error: reason,
                    host: hostOf(target),
                    code: primary?.code || "",
                    attempts,
                });
            });
    });
}


/**
 * Start the proxy on the given host/port.
 * @param {{ port?: number, host?: string, transports?: { name?: string, fetch: Function, proxyAware?: boolean }[] }} [options]
 * @returns {Promise<import("node:http").Server>}
 */
export function startProxyServer({ port = 23210, host = "127.0.0.1", transports } = {}) {
    if (Array.isArray(transports) && transports.length) setFetchCandidates(transports);
    return new Promise((resolve, reject) => {
        const server = createProxyServer();
        server.once("error", reject);
        server.listen(port, host, () => {
            server.off("error", reject);
            console.log(`${pkg.name} v${pkg.version} listening on http://${host}:${port} (transports: ${fetchCandidates.map((item) => item.name).join(", ")})`);
            resolve(server);
        });
    });
}

/** Repeatedly start the proxy, moving to the next port when one is already taken. */
export async function startProxyServerWithFallback({ port = 23210, host = "127.0.0.1", attempts = 10, transports } = {}) {
    for (let offset = 0; offset < attempts; offset += 1) {
        try {
            const server = await startProxyServer({ port: port + offset, host, transports });
            return { server, port: port + offset, url: `http://${host}:${port + offset}` };
        } catch (error) {
            if (error?.code !== "EADDRINUSE" || offset === attempts - 1) throw error;
        }
    }
    throw new Error("unable to start proxy");
}

export { pkg as proxyPackage };
