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
    })
    .catch((error) => {
        console.error(`Failed to start proxy: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    });
