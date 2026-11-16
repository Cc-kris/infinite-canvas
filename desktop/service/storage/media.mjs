import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync, readdirSync, renameSync, rmSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { HttpError } from "../http.mjs";
import { getMediaEntry, listMediaEntries, recordMediaEntry, removeMediaEntry } from "./media-index.mjs";
import { extensionForMime, hashKey, mediaDir, safeSegment } from "./paths.mjs";

const DEFAULT_MEDIA_FETCH_TIMEOUT_MS = 5 * 60_000;

export function mediaResponse(entry) {
    return {
        storageKey: entry.key,
        file: entry.file,
        url: `/files/${encodeURIComponent(entry.file)}`,
        bytes: entry.bytes,
        mimeType: entry.mimeType,
        kind: entry.kind,
        createdAt: entry.createdAt,
    };
}

export function mediaStatus(ctx, key) {
    const entry = getMediaEntry(ctx, key);
    if (!entry) return { exists: false, storageKey: String(key || ""), bytes: 0, mimeType: "" };
    const file = path.join(mediaDir(ctx), path.basename(entry.file));
    const stat = statSync(file, { throwIfNoEntry: false });
    if (!stat?.isFile()) return { exists: false, storageKey: entry.key, bytes: 0, mimeType: entry.mimeType };
    return { exists: true, ...mediaResponse({ ...entry, bytes: stat.size }) };
}

export function listMedia(ctx, prefix) {
    return { items: listMediaEntries(ctx, prefix).map(mediaResponse) };
}

export function deleteMedia(ctx, keys) {
    const removed = [];
    for (const key of Array.from(new Set(keys || []))) {
        const entry = getMediaEntry(ctx, key);
        if (!entry) continue;
        const file = path.join(mediaDir(ctx), path.basename(entry.file));
        try {
            if (existsSync(file)) unlinkSync(file);
        } catch {
            /* 文件已不在也算删除成功 */
        }
        removeMediaEntry(ctx, key);
        removed.push(key);
    }
    return { removed };
}

export async function storeMediaStream(ctx, input) {
    const key = String(input.key || "").trim();
    if (!key) throw new HttpError(400, "missing-key", "缺少 storageKey");
    const kind = String(input.kind || "file");
    const mimeType = String(input.mimeType || "application/octet-stream").split(";")[0].trim().toLowerCase() || "application/octet-stream";
    const file = `${hashKey(key)}${extensionForMime(mimeType, input.fallbackExtension || ".bin")}`;
    const directory = mediaDir(ctx);
    const target = path.join(directory, safeSegment(file, "文件名"));
    const temp = path.join(directory, `.upload-${randomUUID()}.tmp`);
    try {
        await pipeline(input.readable, createWriteStream(temp));
        const stat = statSync(temp);
        const previous = getMediaEntry(ctx, key);
        renameSync(temp, target);
        if (previous?.file && previous.file !== file) {
            try {
                const old = path.join(directory, path.basename(previous.file));
                if (existsSync(old)) unlinkSync(old);
            } catch {
                /* 旧文件清理失败不影响新文件 */
            }
        }
        const entry = { key, file, bytes: stat.size, mimeType, kind, createdAt: new Date().toISOString() };
        await recordMediaEntry(ctx, entry);
        return mediaResponse(entry);
    } catch (error) {
        try {
            rmSync(temp, { force: true });
        } catch {
            /* 临时文件清理失败不影响错误返回 */
        }
        throw error;
    }
}

export async function storeMediaBuffer(ctx, key, buffer, options = {}) {
    return storeMediaStream(ctx, {
        key,
        kind: options.kind,
        mimeType: options.mimeType,
        fallbackExtension: options.fallbackExtension,
        readable: Readable.from(buffer),
    });
}

export async function importMediaUrl(ctx, input) {
    const url = String(input.url || "").trim();
    if (!/^https?:\/\//i.test(url)) throw new HttpError(400, "invalid-url", "媒体地址需以 http:// 或 https:// 开头");
    const key = String(input.key || "").trim() || `${input.kind || "file"}:${randomUUID()}`;
    const timeoutMs = Number(input.timeoutMs) > 0 ? Number(input.timeoutMs) : DEFAULT_MEDIA_FETCH_TIMEOUT_MS;
    const headers = Object.fromEntries(
        Object.entries(input.headers || {})
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([name, value]) => [name, String(value)]),
    );
    let response;
    try {
        response = await ctx.fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
        const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
        throw new HttpError(timedOut ? 504 : 502, timedOut ? "media-timeout" : "media-fetch-failed", timedOut ? "媒体下载超时，请稍后重试。" : "媒体下载失败，请检查地址是否过期。");
    }
    if (!response.ok) throw new HttpError(response.status, "media-fetch-failed", `媒体下载失败（HTTP ${response.status}）。`);
    if (!response.body) throw new HttpError(502, "media-fetch-failed", "媒体下载失败：响应没有内容。");
    const mimeType = String(input.mimeType || response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() || "application/octet-stream";
    const entry = await storeMediaStream(ctx, {
        key,
        kind: input.kind,
        mimeType,
        readable: Readable.fromWeb(response.body),
    });
    if (!entry.bytes) {
        deleteMedia(ctx, [key]);
        throw new HttpError(502, "media-empty", "上游返回了 0 字节媒体，已拒绝写入。");
    }
    return entry;
}

/** 只转发字节，不落盘：给渲染层把公网图片读成 Blob/data URL。 */
export async function fetchBytes(ctx, input) {
    const url = String(input.url || "").trim();
    if (!/^https?:\/\//i.test(url)) throw new HttpError(400, "invalid-url", "地址需以 http:// 或 https:// 开头");
    const headers = Object.fromEntries(
        Object.entries(input.headers || {})
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([name, value]) => [name, String(value)]),
    );
    const timeoutMs = Number(input.timeoutMs) > 0 ? Number(input.timeoutMs) : DEFAULT_MEDIA_FETCH_TIMEOUT_MS;
    try {
        return await ctx.fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
        const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
        throw new HttpError(timedOut ? 504 : 502, timedOut ? "fetch-timeout" : "fetch-failed", timedOut ? "文件读取超时。" : "文件读取失败。");
    }
}

export function readUsage(ctx) {
    const directories = [];
    let totalBytes = 0;
    let totalFiles = 0;
    for (const entry of readdirSync(ctx.dataRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const scanned = walk(path.join(ctx.dataRoot, entry.name));
        directories.push({ name: entry.name, bytes: scanned.bytes, files: scanned.files });
        totalBytes += scanned.bytes;
        totalFiles += scanned.files;
    }
    for (const entry of readdirSync(ctx.dataRoot, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const stat = statSync(path.join(ctx.dataRoot, entry.name), { throwIfNoEntry: false });
        if (stat?.isFile()) {
            totalBytes += stat.size;
            totalFiles += 1;
        }
    }
    return { bytes: totalBytes, files: totalFiles, quota: null, directories: directories.sort((a, b) => b.bytes - a.bytes) };
}

function walk(directory) {
    let bytes = 0;
    let files = 0;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            const child = walk(target);
            bytes += child.bytes;
            files += child.files;
        } else if (entry.isFile()) {
            bytes += statSync(target, { throwIfNoEntry: false })?.size || 0;
            files += 1;
        }
    }
    return { bytes, files };
}
