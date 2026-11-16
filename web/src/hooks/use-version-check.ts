import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App } from "antd";
import { useTranslation } from "react-i18next";
import { APP_VERSION } from "@/constant/env";
import { desktopAppVersion, getDesktopBridge, type DesktopUpdateProgress } from "@/lib/desktop";
import type { ReleaseInfo } from "@/lib/release";

/** Releases live in this project's own repository; the shell (main process) owns the network call. */
const RELEASE_REPO = "Cc-kris/infinite-canvas";
const releasesPageUrl = `https://github.com/${RELEASE_REPO}/releases`;

export type VersionUpdateInfo = {
    /** A newer desktop release exists in the repository. */
    available: boolean;
    latestVersion: string;
    releaseUrl: string;
    /** False when the release has no installer for this platform. */
    downloadSupported: boolean;
    /** True inside the desktop app: the button can download and launch the installer. */
    canInstall: boolean;
};

function readLocalReleases(): ReleaseInfo[] {
    return __APP_RELEASES__ || [];
}

function toVersionParts(version: string) {
    const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
    return match ? match.slice(1).map(Number) : null;
}

function isNewerVersion(latestVersion: string, currentVersion: string) {
    const latest = toVersionParts(latestVersion);
    const current = toVersionParts(currentVersion);
    if (!latest || !current) return false;
    return latest.some((value, index) => value > current[index] && latest.slice(0, index).every((part, prevIndex) => part === current[prevIndex]));
}

/** 从 Release 正文里提取可读条目：优先列表项，其次正文段落。 */
function notesToItems(notes: string): ReleaseInfo["items"] {
    // 正文末尾会拼上共用的安装步骤（以 --- 分隔），那部分不是更新内容。
    const cut = notes.search(/^-{3,}\s*$/m);
    const body = cut > 0 ? notes.slice(0, cut) : notes;
    const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
    const bullets = lines
        .filter((line) => /^[-*]\s+/.test(line))
        .map((line) => line.replace(/^[-*]\s+/, "").replace(/\*\*/g, "").trim())
        .filter(Boolean);
    const source = bullets.length ? bullets : lines.filter((line) => !line.startsWith("#") && !line.startsWith(">") && line.length > 6);
    return source.slice(0, 12).map((line) => ({ type: "更新", content: line }));
}

/** CHANGELOG 里没有该版本时，用 Release 正文补一条，避免弹窗空白。 */
function withReleaseNotes(list: ReleaseInfo[], remote: { version: string; notes: string }): ReleaseInfo[] {
    if (!remote.notes.trim() || !remote.version) return list;
    if (list.some((item) => item.version === remote.version || item.version === `v${remote.version}`)) return list;
    const items = notesToItems(remote.notes);
    if (!items.length) return list;
    return [{ version: remote.version, date: "", items }, ...list];
}

export function useVersionCheck() {
    const { t } = useTranslation();
    const bridge = useMemo(getDesktopBridge, []);
    const currentVersion = (bridge && desktopAppVersion()) || APP_VERSION;
    const { message } = App.useApp();
    const localReleases = useMemo(readLocalReleases, []);
    /** 最近一次 Release 的正文，供 CHANGELOG 漏写版本时兜底。 */
    const remoteReleaseRef = useRef<{ version: string; notes: string }>({ version: "", notes: "" });
    const [latestVersion, setLatestVersion] = useState(currentVersion);
    const [releases, setReleases] = useState<ReleaseInfo[]>(localReleases);
    const [checking, setChecking] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [progress, setProgress] = useState<DesktopUpdateProgress | null>(null);
    const [releaseUrl, setReleaseUrl] = useState(releasesPageUrl);
    const [downloadSupported, setDownloadSupported] = useState<boolean>(!bridge);
    const [open, setOpen] = useState(false);

    const available = isNewerVersion(latestVersion, currentVersion);
    const hasNewVersion = available;
    const updateInfo: VersionUpdateInfo = {
        available,
        latestVersion,
        releaseUrl,
        downloadSupported,
        canInstall: Boolean(bridge?.downloadUpdate) && downloadSupported,
    };

    const checkLatestVersion = useCallback(async () => {
        // Inside the shell the main process knows the exact installed version and can
        // report which installer this platform needs.
        if (bridge?.checkUpdate) {
            try {
                const status = await bridge.checkUpdate();
                const nextVersion = status?.latestVersion || status?.currentVersion || currentVersion;
                if (status?.releaseUrl) setReleaseUrl(status.releaseUrl);
                setDownloadSupported(Boolean(status?.downloadSupported));
                setLatestVersion(nextVersion);
                remoteReleaseRef.current = { version: nextVersion, notes: String(status?.notes || "") };
                return true;
            } catch {
                return false;
            }
        }
        // 浏览器预览没有 shell IPC，更新信息只来自构建期内置的 CHANGELOG。
        return false;
    }, [bridge, currentVersion]);

    const checkLatestRelease = useCallback(
        async (showMessage = false) => {
            setChecking(true);
            try {
                const ok = await checkLatestVersion();
                // 0.25.7: CHANGELOG 常漏写已发布版本，用 Release 正文补一条，弹窗不再空白。
                setReleases(withReleaseNotes(localReleases, remoteReleaseRef.current));
                if (!ok) throw new Error(t("version.readFailed"));
                if (showMessage) message.success(t("version.updated"));
                return true;
            } catch {
                setLatestVersion(currentVersion);
                setReleases(withReleaseNotes(localReleases, remoteReleaseRef.current));
                if (showMessage) message.error(t("version.updateFailed"));
                return false;
            } finally {
                setChecking(false);
            }
        },
        [checkLatestVersion, currentVersion, localReleases, message, t],
    );

    /** Desktop: download this platform's installer and hand it to the OS. Browser: open the release page. */
    const installUpdate = useCallback(async () => {
        if (!available) return false;
        if (bridge?.downloadUpdate) {
            setDownloading(true);
            setProgress({ percent: 0, received: 0, total: 0 });
            const dispose = bridge.onUpdateProgress?.((next) => setProgress(next));
            try {
                await bridge.downloadUpdate();
                message.success(t("version.updateReady"));
                return true;
            } catch (error) {
                message.error(t("version.updateDownloadFailed", { reason: String((error as Error)?.message || error) }));
                return false;
            } finally {
                dispose?.();
                setDownloading(false);
            }
        }
        if (bridge?.openExternal) {
            await bridge.openExternal(releaseUrl);
            return true;
        }
        window.open(releaseUrl, "_blank", "noopener,noreferrer");
        return true;
    }, [available, bridge, message, releaseUrl, t]);

    useEffect(() => {
        void checkLatestVersion();
    }, [checkLatestVersion]);

    const openReleaseModal = useCallback(() => {
        setOpen(true);
        void checkLatestRelease();
    }, [checkLatestRelease]);

    return {
        open,
        setOpen,
        openReleaseModal,
        latestVersion,
        currentVersion,
        releases,
        checking,
        hasNewVersion,
        updateInfo,
        downloading,
        downloadProgress: progress,
        installUpdate,
        checkLatestRelease,
    };
}
