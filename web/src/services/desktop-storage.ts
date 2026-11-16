import { desktopFileUrl } from "@/services/api/desktop/runtime";
import { requestBlob, requestJson, requestText, uploadBlob, DesktopRequestError } from "@/services/api/desktop/http";

export type DesktopMediaEntry = {
    storageKey: string;
    file: string;
    url: string;
    bytes: number;
    mimeType: string;
    kind: string;
    createdAt?: string;
};

export type DesktopLogRecord = Record<string, unknown> & { id?: string };

type RawMediaEntry = Omit<DesktopMediaEntry, "url"> & { url?: string };

function withFileUrl(entry: RawMediaEntry): DesktopMediaEntry {
    return { ...entry, url: desktopFileUrl(entry.file) };
}

export const STATE_NAMESPACE = "app_state";

export function statePath(key: string) {
    return `/api/storage/state/${STATE_NAMESPACE}/${encodeURIComponent(key)}`;
}

export async function readStateText(key: string): Promise<string | null> {
    try {
        return await requestText(statePath(key));
    } catch (error) {
        if (error instanceof DesktopRequestError && error.status === 404) return null;
        throw error;
    }
}

export async function writeStateText(key: string, value: string) {
    await requestJson(statePath(key), { method: "PUT", body: value, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export async function deleteStateText(key: string) {
    await requestJson(statePath(key), { method: "DELETE" });
}

export async function uploadMediaBlob(key: string, blob: Blob, kind: string, mimeType = blob.type || "application/octet-stream", signal?: AbortSignal) {
    const query = `?key=${encodeURIComponent(key)}&kind=${encodeURIComponent(kind)}&mime=${encodeURIComponent(mimeType)}`;
    const entry = await uploadBlob<RawMediaEntry>(`/api/storage/media${query}`, blob, { contentType: mimeType, signal });
    return withFileUrl(entry);
}

export async function importMediaFromUrl(input: {
    url: string;
    headers?: Record<string, string>;
    mimeType?: string;
    key?: string;
    kind?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
}) {
    const entry = await requestJson<RawMediaEntry>("/api/storage/media/from-url", {
        method: "POST",
        body: input,
        signal: input.signal,
        timeoutMs: input.timeoutMs,
    });
    return withFileUrl(entry);
}

export async function getMediaStatus(key: string) {
    const status = await requestJson<{ exists: boolean } & Partial<RawMediaEntry>>(`/api/storage/media/status?key=${encodeURIComponent(key)}`);
    if (!status.exists || !status.file) return { exists: false, storageKey: key, bytes: 0, mimeType: "" } as const;
    return { ...withFileUrl(status as RawMediaEntry), exists: true } as const;
}

export async function listMediaEntries(prefix = "") {
    const payload = await requestJson<{ items: RawMediaEntry[] }>(`/api/storage/media/list?prefix=${encodeURIComponent(prefix)}`);
    return (payload.items || []).map(withFileUrl);
}

export async function deleteMediaKeys(keys: Iterable<string>) {
    const unique = Array.from(new Set(keys));
    if (!unique.length) return;
    await requestJson("/api/storage/media", { method: "DELETE", body: { keys: unique } });
}

export async function readFileBlob(file: string, signal?: AbortSignal) {
    return requestBlob(`/files/${encodeURIComponent(file)}`, { signal });
}

/** 公网/鉴权地址读字节（不落盘），用于 data URL 转换等渲染层需要。 */
export async function fetchExternalBlob(url: string, options: { headers?: Record<string, string>; timeoutMs?: number; signal?: AbortSignal } = {}) {
    return requestBlob("/api/storage/fetch", {
        method: "POST",
        body: { url, headers: options.headers },
        timeoutMs: options.timeoutMs,
        signal: options.signal,
    });
}

export async function readLogEntries(kind: string) {
    const payload = await requestJson<{ logs: DesktopLogRecord[] }>(`/api/storage/logs/${encodeURIComponent(kind)}`);
    return payload.logs || [];
}

export async function saveLogEntry(kind: string, log: DesktopLogRecord) {
    const id = String(log.id || "").trim();
    if (!id) throw new Error("日志缺少 id");
    await requestJson(`/api/storage/logs/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`, { method: "PUT", body: log });
}

export async function replaceLogEntries(kind: string, logs: DesktopLogRecord[]) {
    await requestJson(`/api/storage/logs/${encodeURIComponent(kind)}`, { method: "PUT", body: { logs } });
}

export async function deleteLogEntries(kind: string, ids: Iterable<string>) {
    await requestJson(`/api/storage/logs/${encodeURIComponent(kind)}`, { method: "DELETE", body: { ids: Array.from(ids) } });
}

export function pluginPath(pluginId: string, key: string) {
    return `/api/storage/plugins/${encodeURIComponent(pluginId)}/${encodeURIComponent(key)}`;
}

export async function readPluginValue<T = unknown>(pluginId: string, key: string): Promise<T | null> {
    try {
        return await requestJson<T>(pluginPath(pluginId, key));
    } catch (error) {
        if (error instanceof DesktopRequestError && error.status === 404) return null;
        throw error;
    }
}

export async function writePluginValue(pluginId: string, key: string, value: unknown) {
    await requestJson(pluginPath(pluginId, key), { method: "PUT", body: JSON.stringify(value ?? null), headers: { "content-type": "application/json" } });
}

export async function deletePluginValue(pluginId: string, key: string) {
    await requestJson(pluginPath(pluginId, key), { method: "DELETE" });
}

export type DesktopStorageUsage = {
    bytes: number;
    files: number;
    quota: null;
    directories: Array<{ name: string; bytes: number; files: number }>;
};

export function readDesktopStorageUsage() {
    return requestJson<DesktopStorageUsage>("/api/storage/usage");
}
