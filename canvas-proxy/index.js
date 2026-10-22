#!/usr/bin/env node
import { startProxyServer } from "./server.js";
import { proxyPackage as pkg } from "./server.js";

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

startProxyServer({ port, host })
    .then(() => {
        console.log(`Desktop app auto-starts this proxy; manual address (browser build only): http://${host}:${port}`);
        // Node's fetch ignores proxy env vars unless NODE_USE_ENV_PROXY=1: without this hint a
        // user who does have HTTPS_PROXY exported would silently go direct and see `fetch failed`.
        const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
        if (envProxy && process.env.NODE_USE_ENV_PROXY !== "1") {
            console.warn(
                `Note: ${envProxy} is set but Node's fetch ignores proxy env vars by default.\n` +
                    "      Restart with NODE_USE_ENV_PROXY=1 to send requests through it, or use the desktop app\n" +
                    "      (it follows the system proxy automatically).",
            );
        }
    })
    .catch((error) => {
        console.error(`Failed to start proxy: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    });
