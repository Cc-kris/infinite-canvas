import localforage from "localforage";
import { nanoid } from "nanoid";

import { withLocalProxy } from "@/stores/use-config-store";

export type UploadedFile = { url: string; storageKey: string; bytes: number; mimeType: string; width?: number; height?: number; durationMs?: number };

export type StoreMediaOptions = {
    /** 上游声明的 MIME（结果项常常只有 mimeType，没有真实 Blob.type）。 */
    mimeType?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
};

export type MediaStoreErrorCode = "empty-input" | "empty-blob" | "fetch-failed" | "aborted" | "timeout";

/** 媒体落库失败：code 供上层区分“可重试网络失败”和“空结果/空字节伪成功”。 */
export class MediaStoreError extends Error {
    readonly code: MediaStoreErrorCode;

    constructor(code: MediaStoreErrorCode, message: string, options?: { cause?: unknown }) {
        super(message);
        this.name = "MediaStoreError";
        this.code = code;
        if (options?.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
    }
}

export type StoredMediaStatus = { exists: boolean; bytes: number; mimeType: string; blob?: Blob };

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "media_files" });
const objectUrls = new Map<string, string>();
const DEFAULT_MEDIA_FETCH_TIMEOUT_MS = 5 * 60_000;

export async function uploadMediaFile(input: string | Blob, prefix = "file", options: StoreMediaOptions = {}): Promise<UploadedFile> {
    throwIfAborted(options.signal);
    if (typeof input === "string" && input.trim() === "") throw new MediaStoreError("empty-input", "媒体地址为空，无法入库。");
    const raw = typeof input === "string" ? await fetchMediaBlob(input, options) : input;
    if (!raw || raw.size === 0) throw new MediaStoreError("empty-blob", "上游返回了 0 字节媒体，已拒绝写入资产库。");

    const mimeType = await resolveMediaMime(raw, options.mimeType);
    const blob = mimeType && mimeType !== raw.type ? new Blob([raw], { type: mimeType }) : raw;
    const storageKey = `${prefix}:${nanoid()}`;
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    const meta = mimeType.startsWith("video/") ? await readVideoMeta(url) : mimeType.startsWith("audio/") ? await readAudioMeta(url) : {};
    return { url, storageKey, bytes: blob.size, mimeType: mimeType || "application/octet-stream", ...meta };
}

/** 真实下载媒体（带超时/取消）；非 2xx 直接判失败，绝不把错误页当结果入库。 */
export async function fetchMediaBlob(url: string, options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<Blob> {
    throwIfAborted(options.signal);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_MEDIA_FETCH_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    try {
        const response = await fetch(withLocalProxy(url), { signal: controller.signal });
        if (!response.ok) throw new MediaStoreError("fetch-failed", `媒体下载失败（HTTP ${response.status}）。`);
        return await response.blob();
    } catch (error) {
        if (error instanceof MediaStoreError) throw error;
        if (options.signal?.aborted) throw new MediaStoreError("aborted", "已取消媒体下载。", { cause: error });
        if (controller.signal.aborted) throw new MediaStoreError("timeout", "媒体下载超时，请稍后重试。", { cause: error });
        throw new MediaStoreError("fetch-failed", "媒体下载失败，请检查地址是否过期。", { cause: error });
    } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener("abort", onAbort);
    }
}

/** 资产过期判定：storageKey 存在但 blob 已丢失 => 结果不可再用。 */
export async function mediaStorageStatus(storageKey?: string): Promise<StoredMediaStatus> {
    if (!storageKey) return { exists: false, bytes: 0, mimeType: "" };
    const blob = await store.getItem<Blob>(storageKey);
    if (!blob) return { exists: false, bytes: 0, mimeType: "" };
    return { exists: true, bytes: blob.size, mimeType: blob.type, blob };
}

/** 上游常给出空 Blob.type；用魔数补齐，避免画布节点渲染成 application/octet-stream。 */
export function sniffMediaMime(head: Uint8Array): string | undefined {
    const ascii = (start: number, length: number) => String.fromCharCode(...Array.from(head.slice(start, start + length)));
    if (head.length >= 12 && ascii(4, 4) === "ftyp") {
        const brand = ascii(8, 4).toLowerCase();
        if (brand.startsWith("qt")) return "video/quicktime";
        if (brand.startsWith("avif") || brand.startsWith("avis")) return "image/avif";
        if (brand.startsWith("heic") || brand.startsWith("heix")) return "image/heic";
        return "video/mp4";
    }
    if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "video/webm";
    if (head.length >= 4 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image/png";
    if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
    if (head.length >= 12 && ascii(0, 4) === "RIFF") {
        const kind = ascii(8, 4);
        if (kind === "WEBP") return "image/webp";
        if (kind === "WAVE") return "audio/wav";
    }
    if (head.length >= 3 && ascii(0, 3) === "ID3") return "audio/mpeg";
    if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xf6) === 0xf0) return "audio/aac";
    if (head.length >= 6 && ascii(0, 6) === "OggS") return "audio/ogg";
    return undefined;
}

async function resolveMediaMime(blob: Blob, hint?: string): Promise<string> {
    const declared = normalizeMime(hint) || normalizeMime(blob.type);
    if (declared && declared !== "application/octet-stream") return declared;
    const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    return sniffMediaMime(head) ?? declared ?? "application/octet-stream";
}

function normalizeMime(value?: string) {
    if (!value) return "";
    return value.split(";")[0].trim().toLowerCase();
}

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw new MediaStoreError("aborted", "已取消媒体入库。");
}

export async function resolveMediaUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const blob = await store.getItem<Blob>(storageKey);
    if (!blob) return fallback;
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function getMediaBlob(storageKey: string) {
    return store.getItem<Blob>(storageKey);
}

export async function setMediaBlob(storageKey: string, blob: Blob) {
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function deleteStoredMedia(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            const url = objectUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            objectUrls.delete(key);
            await store.removeItem(key);
        }),
    );
}

export async function cleanupUnusedMedia(usedData: unknown) {
    const usedKeys = collectMediaStorageKeys(usedData);
    const unused: string[] = [];
    await store.iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.push(key);
    });
    await Promise.all(unused.map((key) => store.removeItem(key)));
}

export function collectMediaStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.includes(":")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectMediaStorageKeys(child, keys)) : collectMediaStorageKeys(item, keys)));
    return keys;
}

function readVideoMeta(url: string) {
    return new Promise<{ width: number; height: number; durationMs?: number }>((resolve) => {
        const video = document.createElement("video");
        const done = () => resolve({ width: video.videoWidth || 1280, height: video.videoHeight || 720, durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined });
        video.onloadedmetadata = done;
        video.onerror = done;
        video.src = url;
    });
}

function readAudioMeta(url: string) {
    return new Promise<{ durationMs?: number }>((resolve) => {
        const audio = document.createElement("audio");
        const done = () => resolve({ durationMs: Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : undefined });
        audio.onloadedmetadata = done;
        audio.onerror = done;
        audio.src = url;
    });
}
