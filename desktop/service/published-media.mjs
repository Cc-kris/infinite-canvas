import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { once } from "node:events";
import path from "node:path";

import { sendJson } from "./http.mjs";

/**
 * 素材发布通道：本机字节 → 公网可访问 URL。
 *
 * 上游视频接口只接受公网 https 直链，blob:/data:/127.0.0.1 一律拿不到。这里保留原
 * canvas-proxy 的 `POST /__media/upload` + `GET /__media/<file>` 协议，由设置里的
 * 「素材公网基址」把 23212 端口经隧道暴露给上游。路径不做 token 校验：上游/隧道请求
 * 不带 token，但仍只监听回环地址，且文件只能落在 <dataRoot>/published。
 */
const MEDIA_PREFIX = "/__media";
const MAX_BYTES = 200 * 1024 * 1024;
const EXT_BY_MIME = {
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/mp4": "m4a",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
};
const MIME_BY_EXT = Object.fromEntries(Object.entries(EXT_BY_MIME).map(([mime, ext]) => [ext, mime]));

function cors(res) {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "GET,HEAD,POST,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type,x-media-name");
    res.setHeader("access-control-expose-headers", "content-length,content-range,content-type");
    res.setHeader("access-control-max-age", "86400");
}

function mediaDir(ctx) {
    const dir = path.join(ctx.dataRoot, "published");
    mkdirSync(dir, { recursive: true });
    return dir;
}

function extensionOf(req) {
    const declared = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (EXT_BY_MIME[declared]) return EXT_BY_MIME[declared];
    const raw = String(req.headers["x-media-name"] || "");
    let name = raw;
    try {
        name = decodeURIComponent(raw);
    } catch {
        /* 非法的百分号转义按原文取扩展名 */
    }
    const ext = path.extname(name).replace(".", "").toLowerCase();
    return MIME_BY_EXT[ext] ? ext : "bin";
}

function mediaFile(ctx, name) {
    const safe = String(name || "").replace(/[^a-zA-Z0-9._-]/g, "");
    if (!safe || safe.startsWith(".")) return "";
    return path.join(mediaDir(ctx), safe);
}

async function handleUpload(req, res, ctx) {
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > MAX_BYTES) {
        req.resume();
        return sendJson(res, 413, { error: `文件超过上限 ${Math.round(MAX_BYTES / 1024 / 1024)}MB`, bytes: declared });
    }
    const dir = mediaDir(ctx);
    const tempPath = path.join(dir, `.upload-${randomUUID()}`);
    const hash = createHash("sha256");
    const output = createWriteStream(tempPath);
    let bytes = 0;
    let tooLarge = false;
    try {
        for await (const chunk of req) {
            bytes += chunk.length;
            if (bytes > MAX_BYTES) {
                tooLarge = true;
                continue;
            }
            hash.update(chunk);
            if (!output.write(chunk)) await once(output, "drain");
        }
        await new Promise((resolve) => output.end(resolve));
    } catch (error) {
        output.destroy();
        rmSync(tempPath, { force: true });
        return sendJson(res, 400, { error: `读取上传内容失败：${error?.message || error}` });
    }
    if (tooLarge) {
        rmSync(tempPath, { force: true });
        return sendJson(res, 413, { error: `文件超过上限 ${Math.round(MAX_BYTES / 1024 / 1024)}MB`, bytes });
    }
    if (!bytes) {
        rmSync(tempPath, { force: true });
        return sendJson(res, 400, { error: "上传内容为空" });
    }
    const sha256 = hash.digest("hex");
    const fileName = `${sha256.slice(0, 32)}.${extensionOf(req)}`;
    const target = path.join(dir, fileName);
    try {
        if (existsSync(target)) rmSync(tempPath, { force: true });
        else renameSync(tempPath, target);
    } catch (error) {
        rmSync(tempPath, { force: true });
        return sendJson(res, 500, { error: `写入素材目录失败：${error?.message || error}` });
    }
    sendJson(res, 200, {
        ok: true,
        path: `${MEDIA_PREFIX}/${fileName}`,
        bytes,
        mimeType: MIME_BY_EXT[path.extname(fileName).slice(1)] || "application/octet-stream",
        sha256,
    });
}

function parseRange(header, size) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || "").trim());
    if (!match) return null;
    const [, rawStart, rawEnd] = match;
    if (!rawStart && !rawEnd) return "invalid";
    const start = rawStart ? Number(rawStart) : Math.max(0, size - Number(rawEnd));
    const end = rawStart && rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return "invalid";
    return { start, end };
}

function handleRead(req, res, ctx, rawName) {
    let name = rawName;
    try {
        name = decodeURIComponent(rawName);
    } catch {
        /* 保留原文，交给白名单过滤 */
    }
    const file = mediaFile(ctx, name);
    if (!file || !existsSync(file)) return sendJson(res, 404, { error: "素材不存在", name });
    const size = statSync(file).size;
    const ext = path.extname(file).slice(1);
    res.setHeader("content-type", MIME_BY_EXT[ext] || "application/octet-stream");
    res.setHeader("accept-ranges", "bytes");
    res.setHeader("cache-control", "public, max-age=86400, immutable");
    const range = parseRange(req.headers.range, size);
    if (range === "invalid") {
        res.writeHead(416, { "content-range": `bytes */${size}` });
        return res.end();
    }
    if (range) {
        res.writeHead(206, { "content-range": `bytes ${range.start}-${range.end}/${size}`, "content-length": range.end - range.start + 1 });
        if (req.method === "HEAD") return res.end();
        return createReadStream(file, { start: range.start, end: range.end }).pipe(res);
    }
    res.writeHead(200, { "content-length": size });
    if (req.method === "HEAD") return res.end();
    return createReadStream(file).pipe(res);
}

/** 返回 true 表示该请求已由素材通道处理。 */
export async function handlePublishedMedia(req, res, url, ctx) {
    cors(res);
    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return true;
    }
    const rest = url.pathname.slice(MEDIA_PREFIX.length).replace(/^\//, "");
    if (rest === "upload" && req.method === "POST") {
        await handleUpload(req, res, ctx);
        return true;
    }
    if (rest && (req.method === "GET" || req.method === "HEAD")) {
        handleRead(req, res, ctx, rest);
        return true;
    }
    sendJson(res, 404, { error: "未知的素材路由", hint: "POST /__media/upload；GET /__media/<file>" });
    return true;
}
