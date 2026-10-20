import { app, BrowserWindow, Menu, shell } from "electron";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

/** Renderer bundle: built by `pnpm --dir web build`, shipped as an extra resource. */
const rendererDir = isDev ? path.resolve(here, "../web/dist") : path.join(process.resourcesPath, "renderer");
/** Proxy module: shared with the npm package, shipped as an extra resource. */
const proxyEntry = isDev ? path.resolve(here, "../canvas-proxy/server.js") : path.join(process.resourcesPath, "proxy", "server.js");

/** Fixed ports keep the renderer origin (and therefore IndexedDB) stable across launches. */
const SHELL_PORT = 23211;
const PROXY_PORT = 23210;
const PORT_SCAN = 12;

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".wasm": "application/wasm",
    ".txt": "text/plain; charset=utf-8",
};

/** @type {import("node:http").Server | null} */
let proxyServer = null;
/** @type {import("node:http").Server | null} */
let shellServer = null;

function log(...args) {
    console.log("[infinite-canvas]", ...args);
}

/** Probe an already running canvas-proxy so a second copy never fights for the port. */
async function detectRunningProxy(port) {
    const url = `http://127.0.0.1:${port}`;
    try {
        const response = await fetch(`${url}/`, { signal: AbortSignal.timeout(1200) });
        if (!response.ok) return null;
        const payload = await response.json();
        return payload?.app === "infinite-canvas" && payload?.proxy ? url : null;
    } catch {
        return null;
    }
}

/** Reuse a proxy that is already listening, otherwise start the bundled one. */
async function startProxy() {
    for (let offset = 0; offset < PORT_SCAN; offset += 1) {
        const port = PROXY_PORT + offset;
        const existing = await detectRunningProxy(port);
        if (existing) {
            log(`reusing local proxy at ${existing}`);
            return existing;
        }
        try {
            const mod = await import(pathToFileURL(proxyEntry).href);
            proxyServer = await mod.startProxyServer({ port, host: "127.0.0.1" });
            const url = `http://127.0.0.1:${port}`;
            log(`local proxy started at ${url}`);
            return url;
        } catch (error) {
            if (error?.code !== "EADDRINUSE") {
                log("proxy start failed:", error);
                throw error;
            }
        }
    }
    throw new Error("no free port for the local proxy");
}

/** Serve the built renderer over http so history routing and IndexedDB behave like the web build. */
function serveRenderer() {
    return new Promise((resolve, reject) => {
        const server = createServer((req, res) => {
            const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
            const decoded = decodeURIComponent(requestUrl.pathname);
            let filePath = path.join(rendererDir, path.normalize(decoded));
            if (!filePath.startsWith(rendererDir)) {
                res.writeHead(403).end("forbidden");
                return;
            }
            if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
                // SPA fallback: unknown paths are client-side routes.
                filePath = path.join(rendererDir, "index.html");
            }
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, {
                "content-type": MIME_TYPES[ext] || "application/octet-stream",
                "cache-control": ext === ".html" ? "no-store" : "public, max-age=31536000",
            });
            createReadStream(filePath)
                .on("error", () => res.destroy())
                .pipe(res);
        });

        const listen = (port, attempt = 0) => {
            server.once("error", (error) => {
                if (error.code === "EADDRINUSE" && attempt < PORT_SCAN) listen(port + 1, attempt + 1);
                else reject(error);
            });
            server.listen(port, "127.0.0.1", () => {
                shellServer = server;
                const address = server.address();
                const url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : port}`;
                log(`renderer served at ${url}`);
                resolve(url);
            });
        };
        listen(SHELL_PORT);
    });
}

function buildMenu() {
    const template = [
        ...(process.platform === "darwin" ? [{ role: "appMenu", label: app.name }] : []),
        {
            label: "视图",
            submenu: [
                { role: "reload", label: "重新加载" },
                { role: "forceReload", label: "强制重新加载" },
                { role: "toggleDevTools", label: "开发者工具" },
                { type: "separator" },
                { role: "resetZoom", label: "实际大小" },
                { role: "zoomIn", label: "放大" },
                { role: "zoomOut", label: "缩小" },
                { type: "separator" },
                { role: "togglefullscreen", label: "全屏" },
            ],
        },
        { role: "editMenu", label: "编辑" },
        { role: "windowMenu", label: "窗口" },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow(proxyUrl) {
    const appUrl = await serveRenderer();
    const window = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 960,
        minHeight: 640,
        backgroundColor: "#0b0b0c",
        title: "无限画布",
        webPreferences: {
            preload: path.join(here, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            spellcheck: false,
            additionalArguments: [`--infinite-canvas-proxy=${proxyUrl}`],
        },
    });

    // Keep the app window on the internal renderer; anything else opens in the system browser.
    window.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:/i.test(url)) void shell.openExternal(url);
        return { action: "deny" };
    });

    await window.loadURL(appUrl);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on("second-instance", () => {
        const [window] = BrowserWindow.getAllWindows();
        if (window) {
            if (window.isMinimized()) window.restore();
            window.focus();
        }
    });

    void app.whenReady().then(async () => {
        app.setName("无限画布");
        buildMenu();
        let proxyUrl = "";
        try {
            proxyUrl = await startProxy();
        } catch (error) {
            log("continuing without the local proxy:", error);
        }
        await createWindow(proxyUrl);

        app.on("activate", () => {
            if (BrowserWindow.getAllWindows().length === 0) void createWindow(proxyUrl);
        });
    });

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") app.quit();
    });

    app.on("will-quit", () => {
        proxyServer?.close();
        shellServer?.close();
    });
}
