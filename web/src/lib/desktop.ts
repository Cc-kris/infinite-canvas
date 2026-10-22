/**
 * Bridge exposed by the desktop shell (Electron preload).
 *
 * The desktop app embeds the local forwarding proxy in its main process, so the
 * renderer never has to be configured for it: the proxy URL and the "enabled"
 * flag come from the shell instead of the settings panel.
 */

export type DesktopUpdateStatus = {
    available: boolean;
    currentVersion: string;
    latestVersion: string;
    releaseUrl: string;
    installerName?: string;
    downloadSupported?: boolean;
    /** Release 正文（GitHub release body）。CHANGELOG 漏写当前版本时用它兜底。 */
    notes?: string;
    error?: string;
};

export type DesktopUpdateProgress = {
    percent: number;
    received: number;
    total: number;
};

export type DesktopUpdateResult = {
    path: string;
    bytes: number;
    version: string;
    name: string;
};

export type InfiniteCanvasDesktopBridge = {
    isDesktop: true;
    proxyUrl: string;
    appVersion?: string;
    platform?: string;
    checkUpdate?: () => Promise<DesktopUpdateStatus>;
    downloadUpdate?: () => Promise<DesktopUpdateResult>;
    onUpdateProgress?: (callback: (progress: DesktopUpdateProgress) => void) => () => void;
    openExternal?: (url: string) => Promise<boolean>;
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

/** Version of the installed desktop app; empty string in the browser build. */
export function desktopAppVersion() {
    return getDesktopBridge()?.appVersion || "";
}
