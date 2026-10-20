/**
 * Bridge exposed by the desktop shell (Electron preload).
 *
 * The desktop app embeds the local forwarding proxy in its main process, so the
 * renderer never has to be configured for it: the proxy URL and the "enabled"
 * flag come from the shell instead of the settings panel.
 */
export type InfiniteCanvasDesktopBridge = {
    isDesktop: true;
    proxyUrl: string;
    appVersion?: string;
    platform?: string;
};

declare global {
    interface Window {
        infiniteCanvasDesktop?: InfiniteCanvasDesktopBridge;
    }
}

export function getDesktopBridge(): InfiniteCanvasDesktopBridge | null {
    if (typeof window === "undefined") return null;
    const bridge = window.infiniteCanvasDesktop;
    return bridge && bridge.isDesktop ? bridge : null;
}

/** True when the page runs inside the packaged desktop app rather than a browser. */
export function isDesktopApp() {
    return getDesktopBridge() !== null;
}

/** Proxy address served by the desktop shell, empty string in the browser build. */
export function desktopProxyUrl() {
    return getDesktopBridge()?.proxyUrl || "";
}
