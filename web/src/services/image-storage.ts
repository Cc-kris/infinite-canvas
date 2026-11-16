import { nanoid } from "nanoid";

import i18n from "@/i18n";
import { createImageThumbnail } from "@/lib/image-thumbnail";
import { DesktopRequestError } from "@/services/api/desktop/http";
import { deleteMediaKeys, fetchExternalBlob, getMediaStatus, importMediaFromUrl, listMediaEntries, readFileBlob, readLogEntries, uploadMediaBlob } from "@/services/desktop-storage";

export type UploadedImage = {
    url: string;
    storageKey?: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

const objectUrls = new Map<string, string>();
const previewUrls = new Map<string, string>();
const previewListeners = new Set<() => void>();
const skippedPreviews = new Set<string>();
let previewRevision = 0;
let previewQueue: Promise<unknown> = Promise.resolve();
const IMAGE_DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
const IMAGE_REMOTE_LOAD_TIMEOUT_MS = 10 * 60_000;
const IMAGE_DECODE_TIMEOUT_MS = 10_000;
const IMAGE_RESPONSE_ERROR = "ImageResponseError";
const IMAGE_TIMEOUT_ERROR = "ImageTimeoutError";
const PREVIEW_PREFIX = "preview:";

type ImageReadOptions = { signal?: AbortSignal };

export async function uploadImage(input: string | Blob, options?: ImageReadOptions): Promise<UploadedImage> {
    if (typeof input !== "string") return storeImage(input, options);

    if (/^(blob:|data:)/i.test(input)) {
        return storeImage(await fetchImageBlob(input, options), options);
    }

    try {
        const entry = await importMediaFromUrl({ url: input, key: `image:${nanoid()}`, kind: "image", timeoutMs: IMAGE_DOWNLOAD_TIMEOUT_MS, signal: options?.signal });
        const meta = await loadImageMeta(entry.url, options);
        if (!meta) throw new Error(i18n.t("common.imageReadFailed"));
        objectUrls.set(entry.storageKey, entry.url);
        await storeImagePreview(entry.storageKey, await readFileBlob(entry.file));
        return { url: entry.url, storageKey: entry.storageKey, width: meta.width, height: meta.height, bytes: entry.bytes, mimeType: entry.mimeType.startsWith("image/") ? entry.mimeType : "" };
    } catch (error) {
        if (options?.signal?.aborted) throw abortReason(options.signal);
        // 与旧行为一致：远端不可下载但浏览器能直接显示时，仍返回原地址（bytes=0）。
        const meta = await loadImageMeta(input, options, IMAGE_REMOTE_LOAD_TIMEOUT_MS);
        if (meta) return { url: input, width: meta.width, height: meta.height, bytes: 0, mimeType: "" };
        throw error;
    }
}

async function storeImage(blob: Blob, options?: ImageReadOptions): Promise<UploadedImage> {
    const storageKey = `image:${nanoid()}`;
    const objectUrl = URL.createObjectURL(blob);
    try {
        const meta = await loadImageMeta(objectUrl, options);
        if (!meta) throw new Error(i18n.t("common.imageReadFailed"));
        throwIfAborted(options?.signal);
        const mimeType = blob.type.startsWith("image/") ? blob.type : "application/octet-stream";
        const entry = await uploadMediaBlob(storageKey, blob, "image", mimeType, options?.signal);
        throwIfAborted(options?.signal);
        objectUrls.set(storageKey, entry.url);
        await storeImagePreview(storageKey, blob);
        return { url: entry.url, storageKey, width: meta.width, height: meta.height, bytes: entry.bytes, mimeType: blob.type.startsWith("image/") ? blob.type : "" };
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

async function fetchImageBlob(url: string, options?: ImageReadOptions) {
    if (/^(blob:|data:)/i.test(url)) {
        const controller = new AbortController();
        let timedOut = false;
        const abort = () => controller.abort();
        if (options?.signal?.aborted) abort();
        else options?.signal?.addEventListener("abort", abort, { once: true });
        const timer = window.setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, IMAGE_DOWNLOAD_TIMEOUT_MS);
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw namedError(IMAGE_RESPONSE_ERROR);
            return await response.blob();
        } catch (error) {
            if (timedOut) throw namedError(IMAGE_TIMEOUT_ERROR);
            if (options?.signal?.aborted) throw abortReason(options.signal);
            throw error;
        } finally {
            window.clearTimeout(timer);
            options?.signal?.removeEventListener("abort", abort);
        }
    }
    try {
        return await fetchExternalBlob(url, { timeoutMs: IMAGE_DOWNLOAD_TIMEOUT_MS, signal: options?.signal });
    } catch (error) {
        if (options?.signal?.aborted) throw abortReason(options.signal);
        if (error instanceof DesktopRequestError && (error.status === 504 || error.code === "fetch-timeout")) throw namedError(IMAGE_TIMEOUT_ERROR);
        if (error instanceof DesktopRequestError && error.status >= 400) throw namedError(IMAGE_RESPONSE_ERROR);
        throw error;
    }
}

function loadImageMeta(url: string, options?: ImageReadOptions, timeoutMs = IMAGE_DECODE_TIMEOUT_MS) {
    return new Promise<{ width: number; height: number } | null>((resolve, reject) => {
        if (options?.signal?.aborted) return reject(abortReason(options.signal));
        const image = new Image();
        let settled = false;
        const finish = (value: { width: number; height: number } | null) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            options?.signal?.removeEventListener("abort", abort);
            image.onload = null;
            image.onerror = null;
            resolve(value);
        };
        const abort = () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            image.onload = null;
            image.onerror = null;
            reject(abortReason(options!.signal!));
        };
        const timer = window.setTimeout(() => finish(null), timeoutMs);
        options?.signal?.addEventListener("abort", abort, { once: true });
        image.onload = () => finish(image.naturalWidth && image.naturalHeight ? { width: image.naturalWidth, height: image.naturalHeight } : null);
        image.onerror = () => finish(null);
        image.src = url;
    });
}

function namedError(name: string) {
    const error = new Error(i18n.t("common.imageReadFailed"));
    error.name = name;
    return error;
}

function abortReason(signal: AbortSignal) {
    return signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError");
}

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw abortReason(signal);
}

export async function resolveImageUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const status = await getMediaStatus(storageKey);
    if (!status.exists || !("url" in status)) return fallback;
    objectUrls.set(storageKey, status.url);
    return status.url;
}

export async function getImageBlob(storageKey: string) {
    const status = await getMediaStatus(storageKey);
    if (!status.exists || !("file" in status) || !status.file) return null;
    return readFileBlob(status.file);
}

export function previewUrlFor(storageKey?: string) {
    return storageKey ? previewUrls.get(storageKey) : undefined;
}

export function subscribeImagePreviews(listener: () => void) {
    previewListeners.add(listener);
    return () => {
        previewListeners.delete(listener);
    };
}

export function getImagePreviewRevision() {
    return previewRevision;
}

export async function ensureImagePreview(storageKey?: string) {
    if (!storageKey) return undefined;
    const cached = previewUrls.get(storageKey);
    if (cached) return cached;
    if (skippedPreviews.has(storageKey)) return undefined;
    const stored = await getMediaStatus(previewStorageKey(storageKey)).catch(() => null);
    if (stored?.exists && "url" in stored) return cacheImagePreview(storageKey, stored.url);
    queueImagePreview(storageKey);
    return undefined;
}

// 缩略图生成排成一队，避免一次打开大量图片时同时解码。
function queueImagePreview(storageKey: string) {
    previewQueue = previewQueue
        .then(async () => {
            const original = await getImageBlob(storageKey);
            if (original) await storeImagePreview(storageKey, original);
        })
        .catch(() => undefined);
}

async function storeImagePreview(storageKey: string, original: Blob) {
    const preview = await createImageThumbnail(original).catch(() => undefined);
    if (!preview) {
        skippedPreviews.add(storageKey);
        return undefined;
    }
    const entry = await uploadMediaBlob(previewStorageKey(storageKey), preview, "preview", preview.type || "image/webp").catch(() => null);
    if (!entry) return undefined;
    return cacheImagePreview(storageKey, entry.url);
}

function cacheImagePreview(storageKey: string, url: string) {
    previewUrls.set(storageKey, url);
    previewRevision += 1;
    previewListeners.forEach((listener) => listener());
    return url;
}

async function deleteImagePreview(storageKey: string) {
    previewUrls.delete(storageKey);
    skippedPreviews.delete(storageKey);
    await deleteMediaKeys([previewStorageKey(storageKey)]).catch(() => undefined);
}

export async function setImageBlob(storageKey: string, blob: Blob) {
    const entry = await uploadMediaBlob(storageKey, blob, "image", blob.type || "application/octet-stream");
    await deleteImagePreview(storageKey);
    await storeImagePreview(storageKey, blob);
    objectUrls.set(storageKey, entry.url);
    return entry.url;
}

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string }, options?: ImageReadOptions) {
    const url = image.dataUrl || (await resolveImageUrl(image.storageKey, image.url || ""));
    if (!url || url.startsWith("data:")) return url;
    return blobToDataUrl(await fetchImageBlob(url, options));
}

export async function deleteStoredImages(keys: Iterable<string>) {
    const unique = Array.from(new Set(keys));
    for (const key of unique) {
        objectUrls.delete(key);
        previewUrls.delete(key);
        skippedPreviews.delete(key);
    }
    await deleteMediaKeys([...unique, ...unique.map(previewStorageKey)]);
}

export async function cleanupUnusedImages(usedData: unknown) {
    const usedKeys = collectImageStorageKeys(usedData);
    const [imageLogs, videoLogs] = await Promise.all([readLogEntries("image-generation"), readLogEntries("video-generation")]);
    collectImageStorageKeys({ logs: [imageLogs, videoLogs] }, usedKeys);

    const entries = await listMediaEntries();
    const unused = entries
        .filter((entry) => entry.kind === "image" && !usedKeys.has(entry.storageKey))
        .map((entry) => entry.storageKey);
    const orphanPreviews = entries
        .filter((entry) => entry.storageKey.startsWith(PREVIEW_PREFIX) && !usedKeys.has(entry.storageKey.slice(PREVIEW_PREFIX.length)))
        .map((entry) => entry.storageKey);

    await deleteStoredImages(unused);
    await deleteMediaKeys(orphanPreviews);
}

export function collectImageStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.startsWith("image:")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectImageStorageKeys(child, keys)) : collectImageStorageKeys(item, keys)));
    return keys;
}

function previewStorageKey(storageKey: string) {
    return `${PREVIEW_PREFIX}${storageKey}`;
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error(i18n.t("common.imageReadFailed")));
        reader.readAsDataURL(blob);
    });
}
