import { app, BrowserWindow, dialog, ipcMain, Menu, net, shell } from "electron";

import { registerAgentHub, revalidateConnection, stopAgentServerOnQuit } from "./agent-hub.js";
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, createReadStream, createWriteStream, existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import os from "node:os";
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

/**
 * Electron's net.fetch goes through Chromium, so it honours the OS proxy / PAC / VPN setup.
 * Plain Node fetch (undici) ignores all of that, which is why a Windows install behind a
 * Clash-style "system proxy" used to fail with `fetch failed` while the browser worked.
 */
function systemFetch(input, init) {
    return net.fetch(input, init);
}

/** Direct connection, used when the configured system proxy is unreachable. */
function directFetch(input, init) {
    return fetch(input, init);
}

/**
 * Outbound fetch for main-process HTTP (update checks, installer download): system proxy first,
 * then a direct attempt. Both failures are reported with the underlying network error intact.
 */
async function outboundFetch(input, init) {
    try {
        return await systemFetch(input, init);
    } catch (error) {
        log("request via system proxy failed, retrying directly:", error?.message || error);
        return directFetch(input, init);
    }
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
            proxyServer = await mod.startProxyServer({
                port,
                host: "127.0.0.1",
                // Order matters: Chromium's stack follows the system proxy, undici is the direct fallback.
                transports: [
                    { name: "system", proxyAware: true, fetch: systemFetch },
                    { name: "direct", proxyAware: false, fetch: directFetch },
                ],
            });
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

/** Updates are published as desktop-v* releases in the user's own repository. */
const RELEASE_REPO = "Cc-kris/infinite-canvas";
const RELEASES_API = `https://api.github.com/repos/${RELEASE_REPO}/releases?per_page=30`;
const USER_AGENT = "infinite-canvas-desktop";

function versionParts(version) {
    const match = String(version || "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
    return match ? match.slice(1).map(Number) : null;
}

/** Returns >0 when `a` is newer than `b`. */
function compareVersions(a, b) {
    const left = versionParts(a);
    const right = versionParts(b);
    if (!left || !right) return 0;
    for (let index = 0; index < 3; index += 1) {
        if (left[index] !== right[index]) return left[index] - right[index];
    }
    return 0;
}

/** Latest published desktop release (tag desktop-vX.Y.Z) with its installers. */
async function fetchLatestRelease() {
    const response = await outboundFetch(RELEASES_API, {
        headers: { accept: "application/vnd.github+json", "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`GitHub API responded ${response.status}`);
    const releases = await response.json();
    if (!Array.isArray(releases)) throw new Error("unexpected GitHub API payload");
    for (const release of releases) {
        if (release.draft || release.prerelease) continue;
        const match = /^desktop-v?(\d+\.\d+\.\d+)/.exec(release.tag_name || "");
        if (!match) continue;
        return {
            version: match[1],
            tag: release.tag_name,
            pageUrl: release.html_url,
            assets: (release.assets || []).map((asset) => ({ name: asset.name, url: asset.browser_download_url, size: asset.size })),
        };
    }
    return null;
}

/** Installer that matches this platform, mirroring the electron-builder artifact names. */
function pickInstaller(assets) {
    if (process.platform === "darwin") {
        const arch = process.arch === "arm64" ? "arm64" : "x64";
        return assets.find((asset) => asset.name.endsWith(".dmg") && asset.name.includes(`-mac-${arch}`)) || assets.find((asset) => asset.name.endsWith(".dmg")) || null;
    }
    if (process.platform === "win32") {
        const arch = process.arch === "arm64" ? "arm64" : "x64";
        return (
            assets.find((asset) => asset.name.endsWith(".exe") && /setup/i.test(asset.name) && asset.name.includes(arch)) ||
            assets.find((asset) => asset.name.endsWith(".exe")) ||
            null
        );
    }
    return null;
}

async function downloadInstaller(url, targetPath, onProgress) {
    const response = await outboundFetch(url, { headers: { "user-agent": USER_AGENT }, redirect: "follow", signal: AbortSignal.timeout(30 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error(`download failed with ${response.status}`);
    const total = Number(response.headers.get("content-length") || 0);
    const file = createWriteStream(targetPath);
    let received = 0;
    let lastPercent = -1;
    try {
        for await (const chunk of Readable.fromWeb(response.body)) {
            received += chunk.length;
            if (!file.write(chunk)) await new Promise((resolve) => file.once("drain", resolve));
            const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
            if (percent !== lastPercent) {
                lastPercent = percent;
                onProgress(percent, received, total);
            }
        }
    } finally {
        await new Promise((resolve) => file.end(resolve));
    }
    return received;
}

/** 升级过程的诊断日志：写到 userData/update.log，下次「什么都没发生」时有据可查。 */
function updateLog(...args) {
    const line = `${new Date().toISOString()} ${args.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(" ")}\n`;
    console.log("[infinite-canvas:update]", line.trim());
    try {
        appendFileSync(path.join(app.getPath("userData"), "update.log"), line);
    } catch {
        /* 日志写不进去不影响升级本身 */
    }
}

/** 升级进行中的标记文件：装完重启后用它判断「上次更新到底成没成」。 */
function updateMarkerPath() {
    return path.join(app.getPath("userData"), "update-pending.json");
}

function writeUpdateMarker(info) {
    try {
        writeFileSync(updateMarkerPath(), JSON.stringify(info));
    } catch (error) {
        updateLog("write marker failed:", String(error?.message || error));
    }
}

/** 取出并清掉标记；返回 null 表示没有待确认的升级。 */
function takeUpdateMarker() {
    try {
        const file = updateMarkerPath();
        if (!existsSync(file)) return null;
        const parsed = JSON.parse(readFileSync(file, "utf8"));
        rmSync(file, { force: true });
        return parsed;
    } catch {
        return null;
    }
}

/**
 * 组装 NSIS 静默安装参数。抽成纯函数便于在 mac 上直接跑断言。
 *
 * 两条硬约束（electron-builder 26.15.3 的 assisted 安装器模板）：
 * - 安装范围只认单斜杠 `/allusers` / `/currentuser`（assistedInstaller.nsh 里
 *   `${GetOptions} $R0 "/allusers"`）。写成 `--allusers` 会被整条忽略，安装范围
 *   退回注册表推断，于是「所有用户安装」的机器会被当成当前用户安装。
 * - `/D=` 必须是最后一个参数，且不能加引号：NSIS 取该前缀后的整段原文当路径。
 */
function buildInstallerArgs(installDir, localAppData) {
    const target = String(installDir || "");
    const local = String(localAppData || "").toLowerCase();
    const perUser = Boolean(local) && target.toLowerCase().startsWith(local);
    return ["/S", perUser ? "/currentuser" : "/allusers", "--force-run", `/D=${target}`];
}

/**
 * Windows 升级：静默覆盖安装到「当前正在运行的这个目录」，全程不弹向导。
 *
 * 0.24 只传 /S --force-run，靠 NSIS 自己猜安装位置和权限：装在 D:\Program Files
 * 时会退化成当前用户安装，装出一份平行的新程序，用户点开的还是旧版本。
 * 0.25 起把安装目录钉死成当前 exe 所在目录。
 *
 * 0.25.4：不再用 `powershell Start-Process -Verb RunAs` 预提权。两个原因——
 * 1) 那层 PowerShell 会重新拼引号，含空格的 `/D=C:\Program Files\...` 会被拆坏；
 * 2) UAC 被拒时 PowerShell 直接退出，而调用方 1.2 秒后照旧 app.quit()，
 *    用户看到的就是「点了更新、应用退出了、没有任何后续」。
 * assisted 安装器在静默升级「所有用户安装」时本来就会自己 UAC_RunElevated 再重启
 * 自身，所以这里直接把安装器拉起来，让 NSIS 管权限。
 */
async function installOnWindows(filePath) {
    const installDir = path.dirname(app.getPath("exe"));
    const args = buildInstallerArgs(installDir, process.env.LOCALAPPDATA);
    updateLog(`launch installer=${filePath} args=${JSON.stringify(args)} elevated=${isElevated()}`);
    await new Promise((resolve, reject) => {
        const child = spawn(filePath, args, { detached: true, stdio: "ignore", windowsHide: true });
        child.once("error", (error) => reject(error));
        child.once("spawn", () => {
            updateLog(`installer started pid=${child.pid}`);
            child.unref();
            resolve();
        });
    });
}

/** `net session` 只有管理员能跑通，用它判断当前进程是否已提权（仅用于日志）。 */
function isElevated() {
    const result = spawnSync("net", ["session"], { windowsHide: true, stdio: "ignore" });
    return result.status === 0;
}

/** Launch the downloaded installer, then let it replace the running app. */
async function launchInstaller(filePath, meta = {}) {
    if (process.platform === "darwin") {
        const error = await shell.openPath(filePath);
        if (error) throw new Error(error);
        return;
    }
    // 先落标记再拉安装器：装完重启时用它判断版本有没有真的变。
    writeUpdateMarker({ from: app.getVersion(), to: meta.version || "", at: Date.now() });
    // 安装器都拉不起来就把错误抛回渲染层，别让用户对着一个已经退出的窗口发愣。
    await installOnWindows(filePath);
    setTimeout(() => app.quit(), 1200);
}

/**
 * 上次点了更新、应用退出了，但重启后版本号没变 —— 说明安装器没真正装上。
 * 把「点了更新什么都没发生」变成一次明确告知，并给出手动下载入口。
 */
function reportAbortedUpdate() {
    const marker = takeUpdateMarker();
    if (!marker) return;
    const current = app.getVersion();
    // 版本变了 = 更新成功，静默收尾；版本没变 = 上次没装成。
    if (!marker.from || marker.from !== current) {
        updateLog(`update finished: ${marker.from} -> ${current}`);
        return;
    }
    updateLog(`aborted update detected: from=${marker.from} to=${marker.to}`);
    void (async () => {
        try {
            const { response } = await dialog.showMessageBox({
                type: "warning",
                title: "更新没有装上",
                message: marker.to ? `上次更新到 ${marker.to} 没有完成` : "上次更新没有完成",
                detail: `当前仍是 ${current} 版本：已经下载的安装包没能替换掉现有程序（常见原因是安装时的权限确认被取消）。\n\n可以在这里重新下载安装包，手动运行一次即可完成升级。`,
                buttons: ["打开下载页", "稍后再说"],
                defaultId: 0,
                cancelId: 1,
                noLink: true,
            });
            if (response === 0) await shell.openExternal(`https://github.com/${RELEASE_REPO}/releases/latest`);
        } catch (error) {
            updateLog("aborted update dialog failed:", String(error?.message || error));
        }
    })();
}

function registerUpdateIpc() {
    // 0.23: 本地 Agent 连接卡片（探测 CLI / 拉起服务 / 写入运行时）
    registerAgentHub(ipcMain);

    ipcMain.handle("app:info", () => ({ version: app.getVersion(), platform: process.platform, arch: process.arch }));

    ipcMain.handle("shell:open-external", async (_event, url) => {
        if (typeof url !== "string" || !/^https?:\/\//i.test(url)) throw new Error("unsupported url");
        await shell.openExternal(url);
        return true;
    });

    ipcMain.handle("update:check", async () => {
        const currentVersion = app.getVersion();
        try {
            const release = await fetchLatestRelease();
            if (!release) return { available: false, currentVersion, latestVersion: currentVersion, releaseUrl: `https://github.com/${RELEASE_REPO}/releases` };
            const installer = pickInstaller(release.assets);
            return {
                available: compareVersions(release.version, currentVersion) > 0,
                currentVersion,
                latestVersion: release.version,
                releaseUrl: release.pageUrl,
                installerName: installer ? installer.name : "",
                downloadSupported: Boolean(installer),
            };
        } catch (error) {
            log("update check failed:", error?.message || error);
            return { available: false, currentVersion, latestVersion: currentVersion, releaseUrl: `https://github.com/${RELEASE_REPO}/releases`, error: String(error?.message || error) };
        }
    });

    ipcMain.handle("update:download", async (event) => {
        const release = await fetchLatestRelease();
        if (!release) throw new Error("no release published yet");
        const installer = pickInstaller(release.assets);
        if (!installer) throw new Error(`no installer for ${process.platform}-${process.arch}`);
        const directory = await mkdtemp(path.join(os.tmpdir(), "infinite-canvas-update-"));
        const targetPath = path.join(directory, installer.name);
        event.sender.send("update:progress", { percent: 0, received: 0, total: installer.size || 0 });
        const bytes = await downloadInstaller(installer.url, targetPath, (percent, received, total) => {
            if (!event.sender.isDestroyed()) event.sender.send("update:progress", { percent, received, total });
        });
        // 断流/代理截断时文件是残缺的，NSIS 会直接失败而界面上什么都看不到，
        // 所以在交给系统之前先对一遍字节数。
        if (installer.size && bytes !== installer.size) {
            updateLog(`installer size mismatch: got=${bytes} expected=${installer.size} file=${targetPath}`);
            throw new Error(`installer incomplete: ${bytes}/${installer.size} bytes`);
        }
        updateLog(`downloaded installer=${targetPath} bytes=${bytes} version=${release.version}`);
        await launchInstaller(targetPath, { version: release.version });
        return { path: targetPath, bytes, version: release.version, name: installer.name };
    });
}

// 0.23: 应用菜单只保留系统级入口。
// 0.24: Windows 不再保留「文件」菜单——它会占掉窗口顶部一行、留一条空白，
//       关窗即退出，无需菜单项；macOS 仍保留应用菜单以支持 ⌘Q / ⌘H。
function buildMenu() {
    if (process.platform !== "darwin") {
        Menu.setApplicationMenu(null);
        return;
    }
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: "appMenu", label: app.name }]));
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
        // Windows 的标题栏/任务栏图标取应用图标；显式指定一次，避免落到 Electron 默认图标。
        ...(process.platform === "win32" ? { icon: path.join(process.resourcesPath, "icon.ico") } : {}),
        webPreferences: {
            preload: path.join(here, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            spellcheck: false,
            additionalArguments: [`--infinite-canvas-proxy=${proxyUrl}`, `--infinite-canvas-version=${app.getVersion()}`],
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
        registerUpdateIpc();
        let proxyUrl = "";
        try {
            proxyUrl = await startProxy();
        } catch (error) {
            log("continuing without the local proxy:", error);
        }
        await createWindow(proxyUrl);

        // 上次「点更新 → 退出 → 什么都没发生」的话，这里补一次明确告知。
        reportAbortedUpdate();

        // 上次选了插件方式的，开机静默验一次：不通就自动切运行时，不打扰用户。
        setTimeout(() => {
            void revalidateConnection()
                .then(() => {
                    // 界面可能已经打开，通知它重读一次，避免停留在旧的连接方式上。
                    for (const win of BrowserWindow.getAllWindows()) {
                        if (!win.isDestroyed()) win.webContents.send("agent-hub:changed");
                    }
                })
                .catch((error) => log("agent revalidate failed:", error));
        }, 1500);

        app.on("activate", () => {
            if (BrowserWindow.getAllWindows().length === 0) void createWindow(proxyUrl);
        });
    });

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") app.quit();
    });

    app.on("will-quit", () => {
        // 0.23: 退出应用时一并结束由本应用拉起的 Agent 服务，桌面不留后台进程。
        // 0.24: 清理属于「尽力而为」，任何异常都不能升级成退出时的崩溃弹窗。
        try {
            stopAgentServerOnQuit();
        } catch (error) {
            console.warn("[agent-hub] cleanup failed:", error);
        }
        try {
            proxyServer?.close();
            shellServer?.close();
        } catch {
            /* 端口已释放 */
        }
    });
}
