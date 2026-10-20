// Preload runs with contextIsolation: the renderer only sees this frozen bridge.
const { contextBridge } = require("electron");

const prefix = "--infinite-canvas-proxy=";
const proxyArg = process.argv.find((arg) => arg.startsWith(prefix));
const proxyUrl = proxyArg ? proxyArg.slice(prefix.length) : "";

contextBridge.exposeInMainWorld("infiniteCanvasDesktop", {
    isDesktop: true,
    proxyUrl,
    appVersion: process.versions.electron,
});
