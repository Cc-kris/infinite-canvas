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
    /** 0.23 本地 Agent：列出 / 一键连接 / 断开。 */
    agentHub: {
        list: () => ipcRenderer.invoke("agent-hub:list"),
        connect: (runtime) => ipcRenderer.invoke("agent-hub:connect", runtime),
        disconnect: () => ipcRenderer.invoke("agent-hub:disconnect"),
        /** 0.26 默认位置扫不到时，弹系统目录选择框。 */
        pickDirectory: (runtime) => ipcRenderer.invoke("agent-hub:pick-dir", runtime),
        /** 0.26 在用户手选的目录里扫描并持久化；dir 传空清除。 */
        setRuntimePath: (runtime, dir) => ipcRenderer.invoke("agent-hub:set-path", runtime, dir),
        /** 0.25 主进程静默升级连接方式后通知界面刷新；返回取消订阅函数。 */
        onChanged: (callback) => {
            const listener = () => callback();
            ipcRenderer.on("agent-hub:changed", listener);
            return () => ipcRenderer.removeListener("agent-hub:changed", listener);
        },
    },
});
