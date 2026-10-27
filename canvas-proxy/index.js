#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { startProxyServer } from "./server.js";
import { proxyPackage as pkg } from "./server.js";
import { createDirectFetch, detectSystemProxy } from "./system-proxy.js";

function readArg(args, name, fallback) {
    const index = args.indexOf(`--${name}`);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
    console.log(`${pkg.name} v${pkg.version}\n\nUsage: npx ${pkg.name}@latest [--port 23210] [--host 127.0.0.1]\n\nForwards http://<host>:<port>/<full-target-url> to <full-target-url> with permissive CORS headers.`);
    process.exit(0);
}

const port = Number(readArg(args, "port", process.env.PORT || 23210));
const host = readArg(args, "host", process.env.HOST || "127.0.0.1");

/**
 * Node reads NODE_USE_ENV_PROXY only at startup (assigning it later does nothing), so when the OS
 * has a proxy configured we restart ourselves with the variable pointing at it. Skipping this is
 * what made the proxy dial every API directly — which still "works", but throttles large image
 * responses badly (~30 KB/s direct vs ~2 MB/s through the proxy on the same upstream).
 */
const systemProxy = detectSystemProxy();
const envProxyActive = Boolean(systemProxy) && process.env.NODE_USE_ENV_PROXY === "1";

if (systemProxy && !envProxyActive && process.env.CANVAS_PROXY_SYSTEM_PROXY_REEXEC !== "1") {
    console.log(`system proxy detected (${systemProxy.source}: ${systemProxy.url}) — restarting through it`);
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...args], {
        stdio: "inherit",
        env: {
            ...process.env,
            NODE_USE_ENV_PROXY: "1",
            HTTPS_PROXY: systemProxy.url,
            HTTP_PROXY: systemProxy.url,
            ALL_PROXY: systemProxy.url,
            CANVAS_PROXY_SYSTEM_PROXY_REEXEC: "1",
        },
    });
    child.on("exit", (code, signal) => process.exit(signal ? 1 : code ?? 0));
    child.on("error", (error) => {
        console.error(`failed to restart through ${systemProxy.url}: ${error?.message || error}`);
        process.exit(1);
    });
} else {
    // System proxy first (Chromium/undici via env), plain Node HTTPS direct as the fallback: a proxy
    // that is up but blocks the API (403) must not take the app down with it.
    const transports = envProxyActive
        ? [
              { name: "system", proxyAware: true, fetch: (input, init) => globalThis.fetch(input, init) },
              { name: "direct", proxyAware: false, fetch: createDirectFetch() },
          ]
        : undefined;

    startProxyServer({ port, host, transports })
        .then(() => {
            if (!systemProxy) {
                console.log("no system proxy found; outbound requests go direct (set CANVAS_PROXY_DISABLE_SYSTEM_PROXY=1 to silence this detection)");
            }
            console.log(`Desktop app auto-starts this proxy; manual address (browser build only): http://${host}:${port}`);
        })
        .catch((error) => {
            console.error(`Failed to start proxy: ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
        });
}
