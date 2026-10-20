// Preload runs with contextIsolation: the renderer only sees this frozen bridge.
const { contextBridge, ipcRenderer } = require("electron");

function readArg(prefix) {
    const arg = process.argv.find((item) => item.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : "";
}

const proxyUrl = readArg("--infinite-canvas-proxy=");
const appVersion = readArg("--infinite-canvas-version=");

contextBridge.exposeInMainWorld("infiniteCanvasDesktop", {
    isDesktop: true,
    proxyUrl,
    appVersion,
    platform: process.platform,
    /** Ask the shell for the newest release in the project's own repository. */
    checkUpdate: () => ipcRenderer.invoke("update:check"),
    /** Download this platform's installer and hand it to the OS. */
    downloadUpdate: () => ipcRenderer.invoke("update:download"),
    /** Progress ticks while downloadUpdate() runs; returns an unsubscribe function. */
    onUpdateProgress: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on("update:progress", listener);
        return () => ipcRenderer.removeListener("update:progress", listener);
    },
    openExternal: (url) => ipcRenderer.invoke("shell:open-external", url),
});
