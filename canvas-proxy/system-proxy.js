/**
 * OS proxy detection for the standalone canvas-proxy.
 *
 * Node's fetch (undici) ignores the OS proxy entirely, and it only honours `NODE_USE_ENV_PROXY`
 * when that variable exists *before* the process starts (setting it at runtime is a no-op, which
 * is why index.js restarts itself instead of assigning it here).
 *
 * Why this matters beyond "fetch failed": a direct connection can still work but get throttled.
 * Measured on a 2 MB base64 image response — direct ~30 KB/s (60-97 s), through the system
 * proxy ~2 MB/s (24-26 s). Without this module the standalone proxy silently took the slow path
 * whenever the OS proxy had no matching env var.
 */
import { execFileSync } from "node:child_process";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import process from "node:process";

const PROXY_ENV_KEYS = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"];

/** undici's env-proxy agent only speaks HTTP(S) proxies, so SOCKS-only settings are unusable here. */
function normalizeProxyUrl(raw) {
    const value = String(raw || "").trim();
    if (!value) return "";
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
    if (/^socks/i.test(withScheme)) return "";
    try {
        const parsed = new URL(withScheme);
        return parsed.origin;
    } catch {
        return "";
    }
}

function fromEnv(env) {
    for (const key of PROXY_ENV_KEYS) {
        const url = normalizeProxyUrl(env[key]);
        if (url) return { url, source: key.toLowerCase(), noProxy: env.NO_PROXY || env.no_proxy || "" };
    }
    return null;
}

/** `scutil --proxy` prints a dictionary: `HTTPProxy : 127.0.0.1`, `HTTPPort : 7890`, ... */
function fromMacSystem() {
    let output = "";
    try {
        output = execFileSync("scutil", ["--proxy"], { encoding: "utf8", timeout: 2000 });
    } catch {
        return null;
    }
    const field = (name) => {
        const match = new RegExp(`^\\s*${name}\\s*:\\s*(.+)$`, "m").exec(output);
        return match ? match[1].trim() : "";
    };
    const enabled = (flag) => field(flag) !== "0" && field(flag) !== "";
    const build = (scheme, enableKey, hostKey, portKey) => {
        if (!enabled(enableKey)) return "";
        const host = field(hostKey);
        const port = field(portKey);
        return host && port ? `${scheme}://${host}:${port}` : "";
    };
    const url = build("http", "HTTPSEnable", "HTTPSProxy", "HTTPSPort") || build("http", "HTTPEnable", "HTTPProxy", "HTTPPort");
    return url ? { url, source: "macos system proxy", noProxy: "" } : null;
}

/** Windows keeps the setting in the registry; `ProxyServer` may be `host:port` or per-protocol. */
function fromWindowsSystem() {
    let output = "";
    try {
        output = execFileSync(
            "reg",
            ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"],
            { encoding: "utf8", timeout: 3000, windowsHide: true },
        );
    } catch {
        return null;
    }
    const valueOf = (name) => {
        const match = new RegExp(`${name}\\s+REG_\\w+\\s+(.+)`, "i").exec(output);
        return match ? match[1].trim() : "";
    };
    if (valueOf("ProxyEnable") !== "0x1") return null;
    const raw = valueOf("ProxyServer");
    if (!raw) return null;
    const perProtocol = /https=([^;\s]+)/i.exec(raw);
    const url = normalizeProxyUrl(perProtocol ? perProtocol[1] : raw);
    return url ? { url, source: "windows system proxy", noProxy: valueOf("ProxyOverride") } : null;
}

/**
 * Resolve the proxy the OS/browser would use.
 * @param {{ env?: Record<string, string | undefined> }} [options]
 * @returns {{ url: string, source: string, noProxy: string } | null}
 */
export function detectSystemProxy({ env = process.env } = {}) {
    // Escape hatch for users who really want the throttled direct path (or a broken proxy client).
    if (env.CANVAS_PROXY_DISABLE_SYSTEM_PROXY === "1") return null;
    const envHit = fromEnv(env);
    if (envHit) return envHit;
    if (process.platform === "darwin") return fromMacSystem();
    if (process.platform === "win32") return fromWindowsSystem();
    return null;
}

function headerObject(raw) {
    const headers = {};
    if (!raw) return headers;
    if (typeof raw.forEach === "function" && !Array.isArray(raw)) {
        raw.forEach((value, key) => {
            headers[key] = value;
        });
        return headers;
    }
    for (const [key, value] of Object.entries(raw)) headers[key] = Array.isArray(value) ? value.join(", ") : String(value);
    return headers;
}

/**
 * A `fetch` that always dials the target directly, bypassing the process-wide env proxy.
 * Registered as the fallback transport, so a proxy that is up but blocks the API (403) or dies
 * mid-flight still leaves the app working — just slower.
 */
export function createDirectFetch() {
    return function directFetch(input, init = {}) {
        const url = new URL(typeof input === "string" ? input : input.url || String(input));
        const mod = url.protocol === "http:" ? http : https;
        return new Promise((resolve, reject) => {
            const request = mod.request(
                {
                    protocol: url.protocol,
                    hostname: url.hostname,
                    port: url.port || undefined,
                    path: `${url.pathname}${url.search}`,
                    method: init.method || "GET",
                    headers: headerObject(init.headers),
                },
                (response) => {
                    // Redirects are not followed here: API base URLs answer directly, and a silent
                    // follow would hide a misconfigured base URL behind an unexpected 200.
                    resolve(
                        new Response(Readable.toWeb(response), {
                            status: response.statusCode || 0,
                            statusText: response.statusMessage || "",
                            headers: response.headers,
                        }),
                    );
                },
            );
            request.on("error", reject);
            if (init.signal) {
                const onAbort = () => request.destroy(new Error("request aborted"));
                if (init.signal.aborted) onAbort();
                else init.signal.addEventListener("abort", onAbort, { once: true });
            }
            const body = init.body;
            if (body === undefined || body === null) request.end();
            else if (typeof body === "string" || Buffer.isBuffer(body) || body instanceof Uint8Array) request.end(body);
            else request.end(String(body));
        });
    };
}
