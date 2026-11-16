import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { HttpError } from "../http.mjs";

/** 磁盘文件名只接受单段、非空的普通名字；`..`/分隔符一律拒绝。 */
export function safeSegment(value, label = "路径") {
    const text = String(value ?? "");
    if (!text || text === "." || text === ".." || text.includes("..") || /[\\/]/.test(text)) {
        throw new HttpError(400, "invalid-path", `${label}不合法`);
    }
    return text;
}

/** 文件名用的键编码：斜杠等分隔符会被编码成单段，`..` 也不会构成目录穿越。 */
export function fileToken(value, label = "存储键") {
    const text = String(value ?? "");
    if (!text) throw new HttpError(400, "invalid-path", `${label}不合法`);
    return encodeURIComponent(text);
}

export function hashKey(key) {
    return createHash("sha1").update(String(key)).digest("hex");
}

const MIME_EXTENSIONS = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
    "image/heic": ".heic",
    "image/svg+xml": ".svg",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/mp4": ".m4a",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/ogg": ".ogg",
    "application/json": ".json",
    "text/plain": ".txt",
};

export function extensionForMime(value, fallback = ".bin") {
    const mime = String(value || "").split(";")[0].trim().toLowerCase();
    return MIME_EXTENSIONS[mime] || fallback;
}

export function dataDir(ctx, ...parts) {
    const dir = path.join(ctx.dataRoot, ...parts);
    mkdirSync(dir, { recursive: true });
    return dir;
}

export function mediaDir(ctx) {
    return dataDir(ctx, "media");
}

export function stateDir(ctx, namespace) {
    return dataDir(ctx, "state", safeSegment(namespace, "存储命名空间"));
}

export function logsDir(ctx, kind) {
    return dataDir(ctx, "logs", safeSegment(kind, "日志类型"));
}

export function pluginsDir(ctx, pluginId) {
    return dataDir(ctx, "plugins", fileToken(pluginId, "插件 id"));
}

export function inside(root, relative) {
    const target = path.resolve(root, relative);
    const base = path.resolve(root);
    return target === base || target.startsWith(`${base}${path.sep}`) ? target : null;
}
