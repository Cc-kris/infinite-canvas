import i18n from "@/i18n";
import { desktopServiceToken, desktopServiceUrl } from "@/services/api/desktop/runtime";
import { requestJson, uploadBlob } from "@/services/api/desktop/http";
import type { WebdavSyncConfig } from "@/stores/use-config-store";

export const WEBDAV_MANIFEST_FILE_NAME = "manifest.json";
const WEBDAV_REQUEST_TIMEOUT_MS = 120000;
const ensuredDirectories = new Set<string>();
const webdavText = (key: string, options?: Record<string, unknown>) => i18n.t(`config.webdav.errors.${key}`, options);

type WebdavStatus = { ok: boolean; status: number; text: () => Promise<string> };

export async function testWebdavConnection(config: WebdavSyncConfig) {
    await ensureWebdavDirectory(config);
    const response = await webdavFetch(config, "", { method: "PROPFIND", headers: { Depth: "0" } });
    if (response.ok || response.status === 207) return;
    await throwWebdavError(response, webdavText("testFailed"));
}

export async function downloadWebdavSyncFile(config: WebdavSyncConfig) {
    return downloadWebdavFile(config, WEBDAV_MANIFEST_FILE_NAME);
}

export async function downloadWebdavFile(config: WebdavSyncConfig, path: string) {
    await ensureWebdavDirectory(config);
    const response = await webdavDownload(config, path);
    if (response.status === 404) return null;
    if (!response.ok) await throwWebdavError(response, webdavText("downloadFailed"));
    const file = await withTimeout(response.blob(), webdavText("downloadTimeout"));
    return file.size ? file : null;
}

export async function uploadWebdavSyncFile(config: WebdavSyncConfig, file: Blob) {
    return uploadWebdavFile(config, WEBDAV_MANIFEST_FILE_NAME, file, "application/json");
}

export async function uploadWebdavFile(config: WebdavSyncConfig, path: string, file: Blob, contentType = "application/octet-stream") {
    if (!file.size) throw new Error(webdavText("emptyUpload"));
    await ensureWebdavDirectory(config);
    await ensureWebdavSubdirectory(config, path);
    const headers = webdavHeaders(config);
    const query = `?url=${encodeURIComponent(buildWebdavUrl(config, path))}&contentType=${encodeURIComponent(contentType)}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
    const response = await uploadBlob<{ ok: boolean; status: number; body: string }>(`/api/storage/webdav/upload${query}`, file, {
        contentType,
        timeoutMs: WEBDAV_REQUEST_TIMEOUT_MS,
    }).catch((error) => {
        throw mapNetworkError(error);
    });
    if (!response.ok) await throwWebdavError({ ok: response.ok, status: response.status, text: async () => response.body }, webdavText("uploadFailed"));
}

async function ensureWebdavDirectory(config: WebdavSyncConfig) {
    assertWebdavConfig(config);
    await ensureWebdavDirectoryPath(config, config.directory);
}

async function ensureWebdavSubdirectory(config: WebdavSyncConfig, path: string) {
    const directory = normalizePath(path).split("/").slice(0, -1).join("/");
    if (!directory) return;
    await ensureWebdavDirectoryPath(config, [config.directory, directory].filter(Boolean).join("/"));
}

async function ensureWebdavDirectoryPath(config: WebdavSyncConfig, directory: string) {
    const parts = normalizePath(directory).split("/").filter(Boolean);
    const cacheKey = `${config.url}:${parts.join("/")}`;
    if (ensuredDirectories.has(cacheKey)) return;
    let path = "";
    for (const part of parts) {
        path = path ? `${path}/${part}` : part;
        const response = await webdavFetch({ ...config, directory: "" }, path, { method: "MKCOL" });
        if (response.ok || ((response.status === 405 || response.status === 423) && (await webdavDirectoryExists(config, path)))) continue;
        await throwWebdavError(response, webdavText("directoryFailed"));
    }
    ensuredDirectories.add(cacheKey);
}

async function webdavDirectoryExists(config: WebdavSyncConfig, path: string) {
    const response = await webdavFetch({ ...config, directory: "" }, path, { method: "PROPFIND", headers: { Depth: "0" } });
    return response.ok || response.status === 207;
}

/** PROPFIND / MKCOL 走服务端返回的状态与文本。 */
async function webdavFetch(config: WebdavSyncConfig, path: string, init: { method: string; headers?: HeadersInit }): Promise<WebdavStatus> {
    try {
        const response = await requestJson<{ status: number; ok: boolean; body: string }>("/api/storage/webdav/request", {
            method: "POST",
            body: { url: buildWebdavUrl(config, path), method: init.method, headers: webdavHeaders(config, init.headers) },
            timeoutMs: WEBDAV_REQUEST_TIMEOUT_MS,
        });
        return { ok: response.ok, status: response.status, text: async () => response.body };
    } catch (error) {
        throw mapNetworkError(error);
    }
}

/** GET 下载：服务端保留上游状态码，404 需要原样返回给同步流程。 */
async function webdavDownload(config: WebdavSyncConfig, path: string): Promise<Response> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), WEBDAV_REQUEST_TIMEOUT_MS);
    try {
        return await fetch(`${desktopServiceUrl()}/api/storage/webdav/download`, {
            method: "POST",
            headers: { authorization: `Bearer ${desktopServiceToken()}`, "content-type": "application/json" },
            body: JSON.stringify({ url: buildWebdavUrl(config, path), method: "GET", headers: webdavHeaders(config) }),
            signal: controller.signal,
        });
    } catch (error) {
        throw mapNetworkError(error);
    } finally {
        window.clearTimeout(timer);
    }
}

function webdavHeaders(config: WebdavSyncConfig, extra?: HeadersInit) {
    const headers: Record<string, string> = {};
    new Headers(extra).forEach((value, key) => {
        headers[key] = value;
    });
    if (config.username || config.password) headers.Authorization = `Basic ${encodeBasicAuth(`${config.username}:${config.password}`)}`;
    return headers;
}

function buildWebdavUrl(config: WebdavSyncConfig, path: string) {
    const baseUrl = config.url.trim().replace(/\/+$/, "");
    const remotePath = [normalizePath(config.directory), normalizePath(path)].filter(Boolean).join("/");
    if (!remotePath) return baseUrl;
    return `${baseUrl}/${remotePath.split("/").map(encodeURIComponent).join("/")}`;
}

function normalizePath(path: string) {
    return path.trim().replace(/^\/+|\/+$/g, "");
}

function assertWebdavConfig(config: WebdavSyncConfig) {
    if (!config.url.trim()) throw new Error(webdavText("urlRequired"));
}

async function throwWebdavError(response: WebdavStatus, fallback: string): Promise<never> {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) throw new Error(webdavText("authenticationFailed"));
    if (response.status === 404) throw new Error(webdavText("pathMissing"));
    throw new Error(webdavText("responseFailed", { fallback, status: response.status, detail: detail ? ` ${detail.slice(0, 120)}` : "" }));
}

function mapNetworkError(error: unknown) {
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) return new Error(webdavText("requestTimeout"));
    if (error instanceof TypeError || (error instanceof Error && /fetch failed|network/i.test(error.message))) return new Error(webdavText("connectionFailed"));
    return error;
}

function encodeBasicAuth(value: string) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
}

function withTimeout<T>(promise: Promise<T>, message: string) {
    return new Promise<T>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error(message)), WEBDAV_REQUEST_TIMEOUT_MS);
        promise.then(resolve, reject).finally(() => window.clearTimeout(timer));
    });
}
