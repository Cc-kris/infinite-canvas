import { nanoid } from "nanoid";

import { DesktopRequestError } from "@/services/api/desktop/http";
import { deleteMediaKeys, getMediaStatus, importMediaFromUrl, listMediaEntries, readFileBlob, uploadMediaBlob } from "@/services/desktop-storage";

import { readAudioMeta, readVideoMeta } from "./media-metadata";

export type UploadedFile = { url: string; storageKey: string; bytes: number; mimeType: string; width?: number; height?: number; durationMs?: number; /** true = 宽高来自超时兜底而非真实解码（发画布时必须二次校正，见 lib/canvas/video-meta-reconcile）。 */ timedOut?: boolean };

export type StoreMediaOptions = {
    /** 上游声明的 MIME（结果项常常只有 mimeType，没有真实 Blob.type）。 */
    mimeType?: string;
    /**
     * 取件请求头。只有「原任务渠道 API 端点」才需要（结果 URL 可能是
     * `/v1/videos/<id>/content` 这类需鉴权的中转地址）；公网/CDN 由调用方不传。
     */
    headers?: Record<string, string>;
    signal?: AbortSignal;
    timeoutMs?: number;
    /** 调用方已探测好的元数据：给定则不再对同一 Blob 二次探测（避免重复等待超时）。 */
    knownMeta?: { width?: number; height?: number; durationMs?: number };
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

const objectUrls = new Map<string, string>();
const DEFAULT_MEDIA_FETCH_TIMEOUT_MS = 5 * 60_000;

export async function uploadMediaFile(input: string | Blob, prefix = "file", options: StoreMediaOptions = {}): Promise<UploadedFile> {
    throwIfAborted(options.signal);
    if (typeof input === "string" && input.trim() === "") throw new MediaStoreError("empty-input", "媒体地址为空，无法入库。");

    if (typeof input === "string" && !/^(blob:|data:)/i.test(input)) {
        const entry = await importFromUrl(input, prefix, options);
        return withMediaMeta(entry, options);
    }

    const raw = typeof input === "string" ? await fetchMediaBlob(input, options) : input;
    if (!raw || raw.size === 0) throw new MediaStoreError("empty-blob", "上游返回了 0 字节媒体，已拒绝写入资产库。");
    const mimeType = await resolveMediaMime(raw, options.mimeType);
    const blob = mimeType && mimeType !== raw.type ? new Blob([raw], { type: mimeType }) : raw;
    const storageKey = `${prefix}:${nanoid()}`;
    const entry = await uploadMediaBlob(storageKey, blob, mediaKindOf(prefix), mimeType || "application/octet-stream", options.signal).catch((error) => {
        throw mapStoreError(error, options.signal);
    });
    objectUrls.set(storageKey, entry.url);
    return withMediaMeta({ storageKey: entry.storageKey, url: entry.url, bytes: entry.bytes, mimeType: entry.mimeType }, options);
}

async function importFromUrl(url: string, prefix: string, options: StoreMediaOptions) {
    try {
        return await importMediaFromUrl({
            url,
            headers: options.headers,
            mimeType: options.mimeType,
            key: `${prefix}:${nanoid()}`,
            kind: mediaKindOf(prefix),
            timeoutMs: options.timeoutMs ?? DEFAULT_MEDIA_FETCH_TIMEOUT_MS,
            signal: options.signal,
        });
    } catch (error) {
        throw mapStoreError(error, options.signal);
    }
}

async function withMediaMeta(entry: { storageKey: string; url: string; bytes: number; mimeType: string }, options: StoreMediaOptions): Promise<UploadedFile> {
    const mimeType = entry.mimeType || options.mimeType || "application/octet-stream";
    const meta = options.knownMeta && Object.keys(options.knownMeta).length > 0
        ? options.knownMeta
        : mimeType.startsWith("video/") ? await readVideoMeta(entry.url) : mimeType.startsWith("audio/") ? await readAudioMeta(entry.url) : {};
    return { url: entry.url, storageKey: entry.storageKey, bytes: entry.bytes, mimeType, ...meta };
}

/** 真实下载媒体（带超时/取消）；非 2xx 直接判失败，绝不把错误页当结果入库。 */
export async function fetchMediaBlob(url: string, options: { timeoutMs?: number; signal?: AbortSignal; headers?: Record<string, string> } = {}): Promise<Blob> {
    throwIfAborted(options.signal);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_MEDIA_FETCH_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    try {
        const response = await fetch(url, { signal: controller.signal, headers: options.headers });
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

/** 资产过期判定：storageKey 存在但磁盘文件已丢失 => 结果不可再用。 */
export async function mediaStorageStatus(storageKey?: string): Promise<StoredMediaStatus> {
    if (!storageKey) return { exists: false, bytes: 0, mimeType: "" };
    const status = await getMediaStatus(storageKey);
    if (!status.exists) return { exists: false, bytes: 0, mimeType: "" };
    return { exists: true, bytes: status.bytes, mimeType: status.mimeType || "" };
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

function mediaKindOf(prefix: string) {
    if (prefix.startsWith("image")) return "image";
    if (prefix.startsWith("video")) return "video";
    if (prefix.startsWith("audio")) return "audio";
    return "file";
}

function mapStoreError(error: unknown, signal?: AbortSignal) {
    if (error instanceof MediaStoreError) return error;
    if (signal?.aborted) return new MediaStoreError("aborted", "已取消媒体入库。", { cause: error });
    if (error instanceof DesktopRequestError) {
        if (error.code === "media-timeout" || error.status === 504) return new MediaStoreError("timeout", "媒体下载超时，请稍后重试。", { cause: error });
        if (error.code === "media-empty") return new MediaStoreError("empty-blob", "上游返回了 0 字节媒体，已拒绝写入资产库。", { cause: error });
        return new MediaStoreError("fetch-failed", error.message, { cause: error });
    }
    if (error instanceof DOMException && error.name === "AbortError") return new MediaStoreError("aborted", "已取消媒体入库。", { cause: error });
    return new MediaStoreError("fetch-failed", error instanceof Error ? error.message : "媒体下载失败，请检查地址是否过期。", { cause: error });
}

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw new MediaStoreError("aborted", "已取消媒体入库。");
}

export async function resolveMediaUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const status = await getMediaStatus(storageKey);
    if (!status.exists || !("url" in status)) return fallback;
    objectUrls.set(storageKey, status.url);
    return status.url;
}

export async function getMediaBlob(storageKey: string) {
    const status = await getMediaStatus(storageKey);
    if (!status.exists || !("file" in status) || !status.file) return null;
    return readFileBlob(status.file);
}

/**
 * 结果字节的 provenance 反查：按 `tool-result:<taskId>:<index>:` 前缀扫磁盘索引。
 *
 * 动机（2026-10-29 复核）：落盘快照在入库完成前就被写出（payloadDropped），若此刻刷新，
 * 任务只剩「成功但无字节」。而字节其实已经或正在写进媒体目录，只是 storageKey 没来得及回写。
 * 旧键名 `tool-result:<nanoid>` 不含任务信息 → 这些真实字节永远无法归属回任务。
 * 新键名带任务 id 与结果项序号，刷新后可按前缀把真实字节重新挂回对应 item（不构造任何字节）。
 */
export async function listTaskResultMedia(taskId: string): Promise<Array<{ storageKey: string; index: number; bytes: number; mimeType: string }>> {
    const prefix = `tool-result:${taskId}:`;
    const entries = await listMediaEntries(prefix);
    const found: Array<{ storageKey: string; index: number; bytes: number; mimeType: string }> = [];
    for (const entry of entries) {
        const index = Number(entry.storageKey.slice(prefix.length).split(":")[0]);
        if (!Number.isInteger(index) || index < 0 || entry.bytes <= 0) continue;
        found.push({ storageKey: entry.storageKey, index, bytes: entry.bytes, mimeType: entry.mimeType || "application/octet-stream" });
    }
    return found.sort((a, b) => a.index - b.index);
}

export async function setMediaBlob(storageKey: string, blob: Blob) {
    const entry = await uploadMediaBlob(storageKey, blob, mediaKindOf(storageKey), blob.type || "application/octet-stream");
    objectUrls.set(storageKey, entry.url);
    return entry.url;
}

export async function deleteStoredMedia(keys: Iterable<string>) {
    const unique = Array.from(new Set(keys));
    for (const key of unique) objectUrls.delete(key);
    await deleteMediaKeys(unique);
}

export async function cleanupUnusedMedia(usedData: unknown) {
    const usedKeys = collectMediaStorageKeys(usedData);
    const entries = await listMediaEntries();
    const unused = entries
        .filter((entry) => entry.kind !== "image" && entry.kind !== "preview" && !usedKeys.has(entry.storageKey))
        .map((entry) => entry.storageKey);
    await deleteStoredMedia(unused);
}

export function collectMediaStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.includes(":")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectMediaStorageKeys(child, keys)) : collectMediaStorageKeys(item, keys)));
    return keys;
}

/* readVideoMeta / readAudioMeta：见 services/media-metadata.ts
 * （带超时兜底，避免后台标签挂起媒体加载时上传永久卡在「写入本地库存…」）。 */
