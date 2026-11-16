/**
 * Bridge exposed by the desktop shell (Electron preload).
 *
 * Business capabilities live in the main-process app service; the renderer only
 * receives the service address and its per-launch token.
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
    appVersion?: string;
    /** Local business service (127.0.0.1) and its per-launch token. */
    serviceUrl?: string;
    serviceToken?: string;
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

/** Version of the installed desktop app; empty string in the browser build. */
export function desktopAppVersion() {
    return getDesktopBridge()?.appVersion || "";
}
