/**
 * 工具资产：真实本地文件选择 → 校验（MIME 魔数/大小/像素/时长）→ 写入本地素材库（磁盘）→ 记录可恢复索引。
 *
 * 事实边界（勿误读为“假上传”）：
 * - “上传”落地为 `services/file-storage.ts` 的真实持久化：字节写入 `<userData>/data/media/`，索引存在本地服务的
 *   `app_state/tool_assets` 键里；刷新后由 `loadToolAssetRecords` 重新取回 Blob。
 * - 进度不是定时器伪造的百分比：来自 `Blob.stream()` 真实读取的字节数（loaded/total）。远端传输进度将在
 *   gateway 落地后复用同一 `onProgress` 回调与 `AbortSignal`。
 * - MIME 不只信 `File.type`（可伪造，也可能为空），同时做文件头魔数嗅探；两者大类不一致直接拒绝。
 */
import { nanoid } from "nanoid";

import { readStateText, writeStateText } from "@/services/desktop-storage";
import { ensureStorageMigration } from "@/services/storage-migration";

export type ToolAssetKind = "image" | "video";

export type ToolAssetIssueCode =
    | "empty-file"
    | "too-large"
    | "too-small"
    | "mime-unknown"
    | "mime-not-allowed"
    | "mime-mismatch"
    | "decode-failed"
    | "dimension-too-small"
    | "dimension-too-large"
    | "pixel-limit"
    | "duration-out-of-range"
    | "count-limit"
    | "store-failed"
    | "aborted";

export type ToolAssetIssueMetrics = { width?: number; height?: number; pixels?: number; bytes?: number; durationMs?: number; count?: number; mimeType?: string };

export type ToolAssetIssue = {
    code: ToolAssetIssueCode;
    message: string;
    limit?: ToolAssetIssueMetrics;
    actual?: ToolAssetIssueMetrics;
    detail?: string;
};

export type ToolAssetConstraints = {
    kind: ToolAssetKind;
    mimeTypes: string[];
    maxBytes: number;
    minBytes?: number;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    minPixels?: number;
    maxPixels?: number;
    minDurationMs?: number;
    maxDurationMs?: number;
};

/** 通用图片上限：与页面规格的 jpg/jpeg/png/webp 一致；单工具可覆盖（如 SCALE_UP 上限 4096×4096）。 */
export const DEFAULT_IMAGE_CONSTRAINTS: ToolAssetConstraints = {
    kind: "image",
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
    maxBytes: 20 * 1024 * 1024,
    minBytes: 1,
    minWidth: 64,
    minHeight: 64,
    maxWidth: 8192,
    maxHeight: 8192,
    maxPixels: 40_000_000,
};

export const DEFAULT_VIDEO_CONSTRAINTS: ToolAssetConstraints = {
    kind: "video",
    mimeTypes: ["video/mp4", "video/webm", "video/quicktime"],
    maxBytes: 500 * 1024 * 1024,
    minBytes: 1,
    maxWidth: 4096,
    maxHeight: 4096,
    maxDurationMs: 10 * 60_000,
};

export function resolveToolAssetConstraints(overrides?: Partial<ToolAssetConstraints> | null): ToolAssetConstraints {
    const fallback = overrides?.kind === "video" ? DEFAULT_VIDEO_CONSTRAINTS : DEFAULT_IMAGE_CONSTRAINTS;
    if (!overrides) return { ...fallback, mimeTypes: [...fallback.mimeTypes] };
    return { ...fallback, ...overrides, kind: overrides.kind ?? fallback.kind, mimeTypes: [...(overrides.mimeTypes ?? fallback.mimeTypes)] };
}

export type ToolAssetRecord = {
    id: string;
    kind: ToolAssetKind;
    name: string;
    /** file-storage 持久化键，刷新后据此取回 Blob */
    storageKey: string;
    /** 会话内 object URL（刷新后由 storageKey 重新生成） */
    url: string;
    bytes: number;
    mimeType: string;
    width?: number;
    height?: number;
    durationMs?: number;
    createdAt: string;
    origin: "local" | "library";
};

export type ToolAssetLibraryItem = {
    id: string;
    name: string;
    url: string;
    storageKey?: string;
    kind: ToolAssetKind;
    bytes?: number;
    mimeType?: string;
    width?: number;
    height?: number;
    durationMs?: number;
};

export class ToolAssetError extends Error {
    readonly issue: ToolAssetIssue;
    readonly code: ToolAssetIssueCode;

    constructor(toolIssue: ToolAssetIssue) {
        super(toolIssue.message);
        this.name = "ToolAssetError";
        this.issue = toolIssue;
        this.code = toolIssue.code;
    }
}

const MIME_LABELS: Record<string, string> = { "image/png": "PNG", "image/jpeg": "JPG", "image/webp": "WebP", "image/gif": "GIF", "video/mp4": "MP4", "video/webm": "WebM", "video/quicktime": "MOV" };

export function formatMimeList(mimeTypes: string[]) {
    return mimeTypes.map((type) => MIME_LABELS[type] ?? type).join(" / ");
}

export function formatBytesLabel(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }
    return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function describeToolAssetIssue(toolIssue: Pick<ToolAssetIssue, "code" | "limit" | "actual" | "detail">): string {
    switch (toolIssue.code) {
        case "empty-file":
            return "文件为空，无法上传";
        case "too-large": {
            const limit = toolIssue.limit?.bytes;
            const actual = toolIssue.actual?.bytes;
            return `文件过大：${formatBytesLabel(Number(actual) || 0)}，上限 ${formatBytesLabel(Number(limit) || 0)}`;
        }
        case "too-small":
            return `文件过小：${formatBytesLabel(Number(toolIssue.actual?.bytes) || 0)}`;
        case "mime-unknown":
            return "无法识别文件类型，请确认文件未损坏";
        case "mime-not-allowed":
            return `不支持的格式${toolIssue.actual?.mimeType ? `：${toolIssue.actual.mimeType}` : ""}${toolIssue.detail ? `，仅支持 ${toolIssue.detail}` : ""}`;
        case "mime-mismatch":
            return `文件内容与扩展名不符（实际为 ${toolIssue.actual?.mimeType || "未知格式"}），已拒绝`;
        case "decode-failed":
            return "图片/视频无法解析，可能已损坏";
        case "dimension-too-small":
            return `尺寸过小：${toolIssue.actual?.width ?? 0}×${toolIssue.actual?.height ?? 0}，至少 ${toolIssue.limit?.width ?? 0}×${toolIssue.limit?.height ?? 0}`;
        case "dimension-too-large":
            return `尺寸过大：${toolIssue.actual?.width ?? 0}×${toolIssue.actual?.height ?? 0}，上限 ${toolIssue.limit?.width ?? 0}×${toolIssue.limit?.height ?? 0}`;
        case "pixel-limit":
            return `像素总量超限：${((Number(toolIssue.actual?.pixels) || 0) / 1_000_000).toFixed(1)}MP，上限 ${((Number(toolIssue.limit?.pixels) || 0) / 1_000_000).toFixed(1)}MP`;
        case "duration-out-of-range":
            return `视频时长不符：${Math.round((Number(toolIssue.actual?.durationMs) || 0) / 1000)}s，上限 ${Math.round((Number(toolIssue.limit?.durationMs) || 0) / 1000)}s`;
        case "count-limit":
            return `数量已达上限（${toolIssue.limit?.count ?? 0}）`;
        case "store-failed":
            return "写入本地库存失败，请检查浏览器存储空间后重试";
        case "aborted":
            return "已取消上传";
        default:
            return toolIssue.detail || "上传失败";
    }
}

function makeIssue(code: ToolAssetIssueCode, extra: Omit<ToolAssetIssue, "code" | "message"> = {}): ToolAssetIssue {
    return { code, message: describeToolAssetIssue({ code, ...extra }), ...extra };
}

export function normalizeMimeType(mimeType?: string | null) {
    const value = String(mimeType || "")
        .trim()
        .toLowerCase()
        .split(";")[0];
    if (!value) return "";
    if (value === "image/jpg" || value === "image/pjpeg") return "image/jpeg";
    return value;
}

export function mimeTypeFromFileName(name?: string | null) {
    const ext = String(name || "")
        .toLowerCase()
        .match(/\.([a-z0-9]+)$/)?.[1];
    switch (ext) {
        case "png":
            return "image/png";
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "webp":
            return "image/webp";
        case "gif":
            return "image/gif";
        case "mp4":
        case "m4v":
            return "video/mp4";
        case "webm":
            return "video/webm";
        case "mov":
            return "video/quicktime";
        default:
            return "";
    }
}

/** 文件头嗅探：返回容器真实类型；未知返回 undefined。 */
export function sniffMimeType(bytes: Uint8Array | ArrayBuffer | null | undefined): string | undefined {
    if (!bytes) return undefined;
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const at = (index: number) => view[index] ?? -1;
    const ascii = (start: number, length: number) => Array.from({ length }, (_, offset) => at(start + offset)).map((code) => (code >= 32 && code <= 127 ? String.fromCharCode(code) : " ")).join("");
    if (view.length >= 8 && at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47 && at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a) return "image/png";
    if (view.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
    if (view.length >= 4 && at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38) return "image/gif";
    if (view.length >= 12 && at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50) return "image/webp";
    if (view.length >= 8 && at(4) === 0x66 && at(5) === 0x74 && at(6) === 0x79 && at(7) === 0x70) return ascii(8, 4) === "qt  " ? "video/quicktime" : "video/mp4";
    if (view.length >= 4 && at(0) === 0x1a && at(1) === 0x45 && at(2) === 0xdf && at(3) === 0xa3) return "video/webm";
    return undefined;
}

export type ToolAssetInputMeta = {
    name?: string;
    bytes: number;
    declaredMime?: string;
    sniffedMime?: string;
    width?: number;
    height?: number;
    durationMs?: number;
};

type SizeOnlyConstraints = Pick<ToolAssetConstraints, "kind" | "mimeTypes" | "maxBytes" | "minBytes">;

/** 大小检查：读取文件前即可判定，避免把超大文件读进内存。 */
function checkSize(input: ToolAssetInputMeta, constraints: SizeOnlyConstraints): ToolAssetIssue | null {
    const bytes = Number(input.bytes) || 0;
    if (bytes <= 0) return makeIssue("empty-file", { actual: { bytes } });
    if (Number.isFinite(constraints.maxBytes) && bytes > constraints.maxBytes) return makeIssue("too-large", { limit: { bytes: constraints.maxBytes }, actual: { bytes } });
    if (constraints.minBytes !== undefined && bytes < constraints.minBytes) return makeIssue("too-small", { limit: { bytes: constraints.minBytes }, actual: { bytes } });
    return null;
}

/** 类型检查：以文件头为准；声明与文件头不一致优先报 mismatch（改名/伪造扩展名）。 */
function checkMime(input: ToolAssetInputMeta, constraints: SizeOnlyConstraints): ToolAssetIssue | null {
    const declared = normalizeMimeType(input.declaredMime);
    const sniffed = normalizeMimeType(input.sniffedMime);
    const fromName = mimeTypeFromFileName(input.name);
    const resolved = sniffed || declared || fromName;
    if (!resolved) return makeIssue("mime-unknown");
    if (declared && sniffed && declared !== sniffed) return makeIssue("mime-mismatch", { actual: { mimeType: sniffed } });
    if (!constraints.mimeTypes.map(normalizeMimeType).includes(resolved)) return makeIssue("mime-not-allowed", { actual: { mimeType: resolved }, detail: formatMimeList(constraints.mimeTypes) });
    return null;
}

function checkContainer(input: ToolAssetInputMeta, constraints: SizeOnlyConstraints): ToolAssetIssue | null {
    return checkSize(input, constraints) ?? checkMime(input, constraints);
}

/**
 * 纯校验：不读磁盘、不发请求。顺序固定（空 → 大小 → 类型 → 尺寸/像素 → 时长），提示稳定可测。
 */
export function validateToolAsset(input: ToolAssetInputMeta, constraints: ToolAssetConstraints): ToolAssetIssue | null {
    const containerIssue = checkContainer(input, constraints);
    if (containerIssue) return containerIssue;

    const width = Number(input.width) || 0;
    const height = Number(input.height) || 0;
    const hasSize = width > 0 && height > 0;
    if (constraints.kind === "image" && !hasSize) return makeIssue("decode-failed", { detail: "无法读取图片尺寸" });
    if (hasSize) {
        if (constraints.minWidth && width < constraints.minWidth) return makeIssue("dimension-too-small", { limit: { width: constraints.minWidth, height: constraints.minHeight ?? 0 }, actual: { width, height } });
        if (constraints.minHeight && height < constraints.minHeight) return makeIssue("dimension-too-small", { limit: { width: constraints.minWidth ?? 0, height: constraints.minHeight }, actual: { width, height } });
        if (constraints.maxWidth && width > constraints.maxWidth) return makeIssue("dimension-too-large", { limit: { width: constraints.maxWidth, height: constraints.maxHeight ?? 0 }, actual: { width, height } });
        if (constraints.maxHeight && height > constraints.maxHeight) return makeIssue("dimension-too-large", { limit: { width: constraints.maxWidth ?? 0, height: constraints.maxHeight }, actual: { width, height } });
        const pixels = width * height;
        if (constraints.maxPixels && pixels > constraints.maxPixels) return makeIssue("pixel-limit", { limit: { pixels: constraints.maxPixels }, actual: { pixels } });
        if (constraints.minPixels && pixels < constraints.minPixels) return makeIssue("pixel-limit", { limit: { pixels: constraints.minPixels }, actual: { pixels } });
    }
    const durationMs = Number(input.durationMs) || 0;
    if (durationMs > 0) {
        if (constraints.maxDurationMs && durationMs > constraints.maxDurationMs) return makeIssue("duration-out-of-range", { limit: { durationMs: constraints.maxDurationMs }, actual: { durationMs } });
        if (constraints.minDurationMs && durationMs < constraints.minDurationMs) return makeIssue("duration-out-of-range", { limit: { durationMs: constraints.minDurationMs }, actual: { durationMs } });
    }
    return null;
}

export function validateToolAssetCount(currentCount: number, maxCount?: number) {
    if (!maxCount || maxCount < 1) return null;
    if (currentCount >= maxCount) return makeIssue("count-limit", { limit: { count: maxCount }, actual: { count: currentCount } });
    return null;
}

export type ToolAssetUploadProgress = { phase: "reading" | "storing" | "done"; loaded: number; total: number; ratio: number };

export type StoredToolAssetBlob = { storageKey: string; url: string; bytes: number; mimeType: string; width?: number; height?: number; durationMs?: number };

export type ToolAssetUploadDeps = {
    /** 真实落库实现，默认 `file-storage.uploadMediaFile`（磁盘素材库）。 */
    store?: (blob: Blob, prefix: string) => Promise<StoredToolAssetBlob>;
    recordStore?: ToolAssetRecordStore;
    readDimensions?: (blob: Blob, mimeType: string) => Promise<{ width?: number; height?: number; durationMs?: number } | null>;
    removeStored?: (storageKeys: string[]) => Promise<void>;
    now?: () => string;
    newId?: () => string;
};

export type ToolAssetUploadOptions = {
    name?: string;
    constraints?: ToolAssetConstraints;
    signal?: AbortSignal;
    onProgress?: (progress: ToolAssetUploadProgress) => void;
    deps?: ToolAssetUploadDeps;
    /** 取消后若已落库，是否回滚（默认回滚，避免孤儿数据）。 */
    cleanupOnAbort?: boolean;
    origin?: ToolAssetRecord["origin"];
};

const CHUNK_SNIFF_BYTES = 32;

function throwIfAborted(signal: AbortSignal | undefined) {
    if (signal?.aborted) throw new ToolAssetError(makeIssue("aborted"));
}

async function defaultStore(blob: Blob, prefix: string, meta?: { width?: number; height?: number; durationMs?: number }): Promise<StoredToolAssetBlob> {
    const { uploadMediaFile } = await import("@/services/file-storage");
    const stored = await uploadMediaFile(blob, prefix, meta ? { knownMeta: meta } : undefined);
    return { storageKey: stored.storageKey, url: stored.url, bytes: stored.bytes, mimeType: stored.mimeType, width: stored.width, height: stored.height, durationMs: stored.durationMs };
}

async function defaultRemoveStored(storageKeys: string[]) {
    if (!storageKeys.length) return;
    const { deleteStoredMedia } = await import("@/services/file-storage");
    await deleteStoredMedia(storageKeys);
}

/** 图片/视频元数据读取：图片优先 createImageBitmap（不创建 DOM），视频用 video 元素 metadata。 */
export async function readToolAssetDimensions(blob: Blob, mimeType: string): Promise<{ width?: number; height?: number; durationMs?: number } | null> {
    if (mimeType.startsWith("image/")) {
        if (typeof createImageBitmap === "function") {
            try {
                const bitmap = await createImageBitmap(blob);
                const size = { width: bitmap.width, height: bitmap.height };
                bitmap.close?.();
                if (size.width > 0 && size.height > 0) return size;
            } catch {
                /* 落到 <img> 兜底 */
            }
        }
        if (typeof document === "undefined" || typeof Image === "undefined") return null;
        const url = URL.createObjectURL(blob);
        try {
            return await new Promise((resolve) => {
                const image = new Image();
                const done = () => resolve(image.naturalWidth && image.naturalHeight ? { width: image.naturalWidth, height: image.naturalHeight } : null);
                image.onload = done;
                image.onerror = done;
                setTimeout(done, 10_000);
                image.src = url;
            });
        } finally {
            URL.revokeObjectURL(url);
        }
    }
    if (mimeType.startsWith("video/")) {
        if (typeof document === "undefined") return null;
        const url = URL.createObjectURL(blob);
        try {
            return await new Promise((resolve) => {
                const video = document.createElement("video");
                const done = () => resolve({ width: video.videoWidth || undefined, height: video.videoHeight || undefined, durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined });
                video.onloadedmetadata = done;
                video.onerror = done;
                setTimeout(done, 15_000);
                video.src = url;
            });
        } finally {
            URL.revokeObjectURL(url);
        }
    }
    return null;
}

/** 分块读取：进度 = 真实已读字节；每块前检查 AbortSignal。 */
async function readBlobChunks(blob: Blob, signal: AbortSignal | undefined, onProgress?: (progress: ToolAssetUploadProgress) => void) {
    const total = blob.size;
    if (typeof blob.stream !== "function") {
        throwIfAborted(signal);
        onProgress?.({ phase: "reading", loaded: total, total, ratio: total ? 1 : 0 });
        const buffer = new Uint8Array(await blob.arrayBuffer());
        return { blob, head: buffer.subarray(0, CHUNK_SNIFF_BYTES), loaded: total };
    }
    const reader = blob.stream().getReader();
    const parts: BlobPart[] = [];
    let headBuffer = new Uint8Array(0);
    let loaded = 0;
    try {
        for (;;) {
            throwIfAborted(signal);
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            parts.push(value);
            loaded += value.byteLength;
            if (headBuffer.byteLength < CHUNK_SNIFF_BYTES) {
                const slice = value.subarray(0, Math.min(CHUNK_SNIFF_BYTES - headBuffer.byteLength, value.byteLength));
                const merged = new Uint8Array(headBuffer.byteLength + slice.byteLength);
                merged.set(headBuffer, 0);
                merged.set(slice, headBuffer.byteLength);
                headBuffer = merged;
            }
            onProgress?.({ phase: "reading", loaded, total, ratio: total ? Math.min(1, loaded / total) : 0 });
        }
    } catch (error) {
        await reader.cancel().catch(() => undefined);
        throw error;
    }
    return { blob: new Blob(parts, { type: blob.type }), head: headBuffer, loaded };
}

/**
 * 真实上传：读取（带进度/取消）→ 魔数/大小/像素/时长校验 → 落库 → 写资产索引。
 * 失败不留在库中；取消时若已落库则回滚。
 */
export async function uploadToolAsset(source: File | Blob, options: ToolAssetUploadOptions = {}): Promise<ToolAssetRecord> {
    const deps = options.deps ?? {};
    const now = deps.now ?? (() => new Date().toISOString());
    const newId = deps.newId ?? (() => nanoid());
    const fileName = options.name ?? (source as File).name ?? "";
    const declaredMime = normalizeMimeType((source as File).type);
    const constraints = resolveToolAssetConstraints(options.constraints);
    const containerOnly: SizeOnlyConstraints = { kind: constraints.kind, mimeTypes: constraints.mimeTypes, maxBytes: constraints.maxBytes, minBytes: constraints.minBytes };

    // 先做零成本的大小/声明类型拦截，避免把超大文件读进内存。
    const preflight = checkSize({ name: fileName, bytes: source.size, declaredMime }, containerOnly);
    if (preflight) throw new ToolAssetError(preflight);

    throwIfAborted(options.signal);
    const { blob, head, loaded } = await readBlobChunks(source, options.signal, options.onProgress);
    throwIfAborted(options.signal);

    const sniffedMime = sniffMimeType(head);
    const containerIssue = checkContainer({ name: fileName, bytes: loaded || blob.size, declaredMime, sniffedMime }, containerOnly);
    if (containerIssue) throw new ToolAssetError(containerIssue);

    const mimeType = sniffedMime || declaredMime || mimeTypeFromFileName(fileName) || "application/octet-stream";
    const sized = new Blob([blob], { type: mimeType });
    const readDimensions = deps.readDimensions ?? readToolAssetDimensions;
    const dimensions = await readDimensions(sized, mimeType);
    throwIfAborted(options.signal);
    const dimensionIssue = validateToolAsset({ name: fileName, bytes: sized.size, declaredMime: mimeType, sniffedMime, width: dimensions?.width, height: dimensions?.height, durationMs: dimensions?.durationMs }, constraints);
    if (dimensionIssue) throw new ToolAssetError(dimensionIssue);

    options.onProgress?.({ phase: "storing", loaded: sized.size, total: sized.size, ratio: 1 });
    let stored: StoredToolAssetBlob;
    try {
        const storeMeta = mimeType.startsWith("video/")
            ? { width: dimensions?.width, height: dimensions?.height, durationMs: dimensions?.durationMs }
            : undefined;
        stored = await (deps.store ?? defaultStore)(sized, "tool-asset", storeMeta);
    } catch (error) {
        if (options.signal?.aborted) throw new ToolAssetError(makeIssue("aborted"));
        throw new ToolAssetError(makeIssue("store-failed", { detail: error instanceof Error ? error.message : String(error) }));
    }

    if (options.signal?.aborted) {
        if (options.cleanupOnAbort !== false) await (deps.removeStored ?? defaultRemoveStored)([stored.storageKey]).catch(() => undefined);
        throw new ToolAssetError(makeIssue("aborted"));
    }

    const stamp = now();
    const record: ToolAssetRecord = {
        id: newId(),
        kind: mimeType.startsWith("video/") ? "video" : "image",
        name: fileName || `asset-${stamp.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
        storageKey: stored.storageKey,
        url: stored.url,
        bytes: stored.bytes || sized.size,
        mimeType: stored.mimeType || mimeType,
        width: dimensions?.width ?? stored.width,
        height: dimensions?.height ?? stored.height,
        durationMs: dimensions?.durationMs ?? stored.durationMs,
        createdAt: stamp,
        origin: options.origin ?? "local",
    };
    await saveToolAssetRecord(record, deps.recordStore);
    options.onProgress?.({ phase: "done", loaded: record.bytes, total: record.bytes, ratio: 1 });
    return record;
}

/* ------------------------------------------------------------------ *
 * 资产索引（刷新恢复 / 多窗口共享同一份磁盘状态）
 * ------------------------------------------------------------------ */

export type ToolAssetRecordStore = {
    get: (id: string) => Promise<ToolAssetRecord | null>;
    set: (record: ToolAssetRecord) => Promise<void>;
    remove: (id: string) => Promise<void>;
    list: () => Promise<ToolAssetRecord[]>;
};

const TOOL_ASSET_STATE_KEY = "tool_assets";

let recordStore: ToolAssetRecordStore | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();

async function loadRecords(): Promise<Record<string, ToolAssetRecord>> {
    await ensureStorageMigration();
    const text = await readStateText(TOOL_ASSET_STATE_KEY);
    if (!text) return {};
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

/** 读-改-写串行执行，避免并发上传互相覆盖索引。 */
function updateRecords(mutate: (records: Record<string, ToolAssetRecord>) => void) {
    const task = writeQueue.then(async () => {
        const records = await loadRecords();
        mutate(records);
        await writeStateText(TOOL_ASSET_STATE_KEY, JSON.stringify(records));
    });
    writeQueue = task.catch(() => undefined);
    return task;
}

function createRecordStore(): ToolAssetRecordStore {
    return {
        get: async (id) => (await loadRecords())[id] ?? null,
        set: (record) => updateRecords((records) => void (records[record.id] = record)),
        remove: (id) => updateRecords((records) => void delete records[id]),
        list: async () => Object.values(await loadRecords()),
    };
}

export async function getToolAssetRecordStore(): Promise<ToolAssetRecordStore> {
    return (recordStore ??= createRecordStore());
}

export async function saveToolAssetRecord(record: ToolAssetRecord, store?: ToolAssetRecordStore) {
    await (store ?? (await getToolAssetRecordStore())).set(record);
}

/**
 * 刷新后恢复：索引只存元数据，Blob 由 storageKey 从 file-storage 重新取回并生成新的 object URL。
 * 索引缺失或 Blob 丢失的记录跳过并回传 lostIds，调用方据此剪掉草稿里的失效 id。
 */
export async function loadToolAssetRecords(ids: string[], options: { store?: ToolAssetRecordStore; resolveUrl?: (storageKey: string) => Promise<string> } = {}): Promise<{ records: ToolAssetRecord[]; lostIds: string[] }> {
    if (!ids.length) return { records: [], lostIds: [] };
    const store = options.store ?? (await getToolAssetRecordStore());
    const resolveUrl = options.resolveUrl ?? (async (storageKey: string) => (await import("@/services/file-storage")).resolveMediaUrl(storageKey));
    const records: ToolAssetRecord[] = [];
    const lostIds: string[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        const record = await store.get(id).catch(() => null);
        if (!record?.storageKey) {
            lostIds.push(id);
            continue;
        }
        const url = await resolveUrl(record.storageKey).catch(() => "");
        if (!url) {
            lostIds.push(id);
            continue;
        }
        records.push({ ...record, url });
    }
    return { records, lostIds };
}

/** 读取本地资产真实字节（下载、送画布、再次提交都要用 Blob，不能只拿 URL）。 */
export async function readToolAssetBlob(storageKey: string): Promise<Blob | null> {
    if (!storageKey) return null;
    const { getMediaBlob } = await import("@/services/file-storage");
    return (await getMediaBlob(storageKey)) ?? null;
}

export async function removeToolAsset(record: Pick<ToolAssetRecord, "id" | "storageKey" | "url">, options: { store?: ToolAssetRecordStore; removeStored?: (keys: string[]) => Promise<void> } = {}) {
    if (record.url?.startsWith("blob:")) URL.revokeObjectURL(record.url);
    await (options.store ?? (await getToolAssetRecordStore())).remove(record.id).catch(() => undefined);
    await (options.removeStored ?? defaultRemoveStored)([record.storageKey]).catch(() => undefined);
}

/** 资产库（作品/商品库）条目 → 统一输入项；保留 storageKey，提交时取真实字节。 */
export function toolAssetLibraryItemsFromAssets(
    assets: Array<{ id: string; kind: string; title: string; coverUrl: string; data?: { url?: string; storageKey?: string; bytes?: number; mimeType?: string; width?: number; height?: number } }>,
): ToolAssetLibraryItem[] {
    return assets
        .filter((asset) => asset.kind === "image" || asset.kind === "video")
        .map((asset) => ({
            id: asset.id,
            name: asset.title || asset.id,
            url: asset.data?.url || asset.coverUrl,
            storageKey: asset.data?.storageKey,
            kind: asset.kind === "video" ? "video" : "image",
            bytes: asset.data?.bytes,
            mimeType: asset.data?.mimeType,
            width: asset.data?.width,
            height: asset.data?.height,
        }));
}

/** 资产库条目入库为工具资产记录（复用同一 Blob，不再复制字节）。 */
export async function adoptLibraryAsset(item: ToolAssetLibraryItem, options: { store?: ToolAssetRecordStore; now?: () => string; newId?: () => string } = {}): Promise<ToolAssetRecord> {
    if (!item.storageKey) throw new ToolAssetError(makeIssue("store-failed", { detail: "资产库条目缺少 storageKey，无法在工具中复用" }));
    const record: ToolAssetRecord = {
        id: options.newId?.() ?? nanoid(),
        kind: item.kind,
        name: item.name,
        storageKey: item.storageKey,
        url: item.url,
        bytes: item.bytes ?? 0,
        mimeType: item.mimeType ?? (item.kind === "video" ? "video/mp4" : "image/png"),
        width: item.width,
        height: item.height,
        durationMs: item.durationMs,
        createdAt: options.now?.() ?? new Date().toISOString(),
        origin: "library",
    };
    await saveToolAssetRecord(record, options.store);
    return record;
}
