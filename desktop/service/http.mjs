import { createReadStream, statSync } from "node:fs";
import path from "node:path";

export const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".jsonl": "application/x-ndjson; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".wasm": "application/wasm",
    ".txt": "text/plain; charset=utf-8",
};

export class HttpError extends Error {
    constructor(status, code, message) {
        super(message);
        this.name = "HttpError";
        this.status = status;
        this.code = code;
    }
}

export function sendJson(res, status, payload) {
    const body = Buffer.from(JSON.stringify(payload));
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": body.length });
    res.end(body);
}

export function sendError(res, status, code, message) {
    sendJson(res, status, { error: { code, message } });
}

export async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return Buffer.concat(chunks);
}

export async function readText(req) {
    return (await readBody(req)).toString("utf8");
}

export async function readJson(req) {
    const text = await readText(req);
    if (!text.trim()) return {};
    try {
        return JSON.parse(text);
    } catch {
        throw new HttpError(400, "invalid-json", "请求体不是合法 JSON");
    }
}

export function contentLength(req) {
    const value = Number(req.headers["content-length"]);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

/** 允许的 Origin 之外一律拒绝，避免网页通过本机服务读取数据。无 Origin（curl/主进程）放行。 */
export function applyCors(req, res, allowedOrigin) {
    const origin = req.headers.origin;
    if (!origin) return true;
    if (!allowedOrigin || origin !== allowedOrigin) return false;
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-headers", "authorization,content-type,x-file-name");
    res.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("access-control-expose-headers", "content-length,content-range,content-type");
    res.setHeader("vary", "origin");
    return true;
}

export function serveFile(req, res, pathname, roots) {
    const relative = decodeURIComponent(pathname.slice("/files/".length));
    const candidates = roots.map((root) => resolveInside(root, relative)).filter(Boolean);
    const filePath = candidates.find((candidate) => statSync(candidate, { throwIfNoEntry: false })?.isFile());
    if (!filePath) return sendError(res, 404, "file-not-found", "文件不存在");

    const stat = statSync(filePath);
    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    const range = parseRange(req.headers.range, stat.size);
    res.setHeader("content-type", contentType);
    res.setHeader("accept-ranges", "bytes");
    res.setHeader("cache-control", "no-cache");
    if (req.method === "HEAD") {
        res.writeHead(200, { "content-length": stat.size });
        return res.end();
    }
    if (!range) {
        res.writeHead(200, { "content-length": stat.size });
        return createReadStream(filePath).on("error", () => res.destroy()).pipe(res);
    }
    if (range === "invalid") {
        res.writeHead(416, { "content-range": `bytes */${stat.size}` });
        return res.end();
    }
    res.writeHead(206, {
        "content-length": range.end - range.start + 1,
        "content-range": `bytes ${range.start}-${range.end}/${stat.size}`,
    });
    createReadStream(filePath, { start: range.start, end: range.end })
        .on("error", () => res.destroy())
        .pipe(res);
}

function resolveInside(root, relative) {
    const target = path.resolve(root, path.normalize(relative));
    const base = path.resolve(root);
    return target === base || target.startsWith(`${base}${path.sep}`) ? target : null;
}

function parseRange(header, size) {
    if (!header) return null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match) return "invalid";
    const [, rawStart, rawEnd] = match;
    if (!rawStart && !rawEnd) return "invalid";
    const start = rawStart ? Number(rawStart) : Math.max(0, size - Number(rawEnd));
    const end = rawStart && rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return "invalid";
    return { start, end };
}
