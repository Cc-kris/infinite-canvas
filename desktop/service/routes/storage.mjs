import { Readable } from "node:stream";

import { HttpError, readJson, readText, sendError, sendJson } from "../http.mjs";
import { deleteMedia, fetchBytes, importMediaUrl, listMedia, mediaStatus, readUsage, storeMediaStream } from "../storage/media.mjs";
import { deleteLogs, listLogs, replaceLogs, upsertLog } from "../storage/logs.mjs";
import { completeMigration, migrationStatus, writeBackup } from "../storage/migration.mjs";
import { deletePluginValue, readPluginValue, writePluginValue } from "../storage/plugins.mjs";
import { deleteState, readState, writeState } from "../storage/state.mjs";
import { webdavDownload, webdavRequest, webdavUpload } from "../storage/webdav.mjs";

/** P4：渲染层持久化统一走磁盘目录；所有接口都必须先通过 index.mjs 的 token 校验。 */
export function register(router) {
    router.get("/api/storage/migration/status", (req, res, ctx) => sendJson(res, 200, migrationStatus(ctx)));
    router.post("/api/storage/migration/backup", async (req, res, ctx) => sendJson(res, 200, writeBackup(ctx, await readJson(req))));
    router.post("/api/storage/migration/complete", async (req, res, ctx) => sendJson(res, 200, completeMigration(ctx, await readJson(req))));

    router.get("/api/storage/usage", (req, res, ctx) => sendJson(res, 200, readUsage(ctx)));

    router.post("/api/storage/media", async (req, res, ctx, url) => {
        const key = url.searchParams.get("key") || "";
        const kind = url.searchParams.get("kind") || "file";
        const mimeType = url.searchParams.get("mime") || req.headers["content-type"] || "application/octet-stream";
        const entry = await storeMediaStream(ctx, { key, kind, mimeType, readable: req });
        sendJson(res, 200, entry);
    });
    router.post("/api/storage/media/from-url", async (req, res, ctx) => {
        const entry = await importMediaUrl(ctx, await readJson(req));
        sendJson(res, 200, entry);
    });
    router.get("/api/storage/media/status", (req, res, ctx, url) => sendJson(res, 200, mediaStatus(ctx, url.searchParams.get("key") || "")));
    router.get("/api/storage/media/list", (req, res, ctx, url) => sendJson(res, 200, listMedia(ctx, url.searchParams.get("prefix") || "")));
    router.delete("/api/storage/media", async (req, res, ctx) => {
        const body = await readJson(req);
        sendJson(res, 200, deleteMedia(ctx, body.keys));
    });
    router.post("/api/storage/fetch", async (req, res, ctx) => {
        const upstream = await fetchBytes(ctx, await readJson(req));
        if (!upstream.ok) {
            const text = await upstream.text().catch(() => "");
            let message = text || `文件读取失败（HTTP ${upstream.status}）`;
            try {
                const payload = JSON.parse(text);
                message = payload?.error?.message || payload?.message || message;
            } catch {
                /* 非 JSON 错误体直接用原文 */
            }
            return sendError(res, upstream.status, "fetch-failed", message.slice(0, 300));
        }
        res.writeHead(200, {
            "content-type": upstream.headers.get("content-type") || "application/octet-stream",
            "cache-control": "no-store",
        });
        if (!upstream.body) return res.end();
        Readable.fromWeb(upstream.body)
            .on("error", () => res.destroy())
            .pipe(res);
    });

    router.get("/api/storage/state/*", (req, res, ctx, url) => {
        const [namespace, key] = statePath(url.pathname);
        const value = readState(ctx, namespace, key);
        if (value === null) return sendError(res, 404, "state-not-found", "本地状态不存在");
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
        res.end(value);
    });
    router.put("/api/storage/state/*", async (req, res, ctx, url) => {
        const [namespace, key] = statePath(url.pathname);
        writeState(ctx, namespace, key, await readText(req));
        sendJson(res, 200, { ok: true });
    });
    router.delete("/api/storage/state/*", (req, res, ctx, url) => {
        const [namespace, key] = statePath(url.pathname);
        deleteState(ctx, namespace, key);
        sendJson(res, 200, { ok: true });
    });

    router.get("/api/storage/logs/*", async (req, res, ctx, url) => {
        const [kind] = logPath(url.pathname);
        sendJson(res, 200, await listLogs(ctx, kind));
    });
    router.put("/api/storage/logs/*", async (req, res, ctx, url) => {
        const [kind, id] = logPath(url.pathname);
        const body = await readJson(req);
        if (!id && Array.isArray(body.logs)) return sendJson(res, 200, await replaceLogs(ctx, kind, body.logs));
        if (!id) return sendError(res, 400, "missing-log-id", "缺少日志 id");
        sendJson(res, 200, await upsertLog(ctx, kind, id, body));
    });
    router.delete("/api/storage/logs/*", async (req, res, ctx, url) => {
        const [kind] = logPath(url.pathname);
        sendJson(res, 200, await deleteLogs(ctx, kind, (await readJson(req)).ids));
    });

    router.get("/api/storage/plugins/*", (req, res, ctx, url) => {
        const [pluginId, key] = pluginPath(url.pathname);
        const result = readPluginValue(ctx, pluginId, key);
        if (!result) return sendError(res, 404, "plugin-value-not-found", "插件存储值不存在");
        sendJson(res, 200, result.value);
    });
    router.put("/api/storage/plugins/*", async (req, res, ctx, url) => {
        const [pluginId, key] = pluginPath(url.pathname);
        sendJson(res, 200, writePluginValue(ctx, pluginId, key, await readText(req)));
    });
    router.delete("/api/storage/plugins/*", (req, res, ctx, url) => {
        const [pluginId, key] = pluginPath(url.pathname);
        sendJson(res, 200, deletePluginValue(ctx, pluginId, key));
    });

    router.post("/api/storage/webdav/request", async (req, res, ctx) => sendJson(res, 200, await webdavRequest(ctx, req, await readJson(req))));
    router.post("/api/storage/webdav/download", async (req, res, ctx) => {
        const result = await webdavDownload(ctx, req, await readJson(req));
        const upstream = result.response;
        res.writeHead(upstream.status, {
            "content-type": upstream.headers.get("content-type") || "application/octet-stream",
            "cache-control": "no-store",
        });
        if (!upstream.body) {
            result.dispose();
            return res.end();
        }
        const stream = Readable.fromWeb(upstream.body);
        stream.on("error", () => {
            result.dispose();
            res.destroy();
        });
        stream.on("end", result.dispose);
        res.on("close", result.dispose);
        stream.pipe(res);
    });
    router.post("/api/storage/webdav/upload", async (req, res, ctx, url) => {
        const headers = parseHeaders(url.searchParams.get("headers"));
        const result = await webdavUpload(ctx, req, {
            url: url.searchParams.get("url") || "",
            headers,
            contentType: url.searchParams.get("contentType") || "",
        });
        sendJson(res, 200, result);
    });
}

function decode(value) {
    return decodeURIComponent(value || "");
}

function statePath(pathname) {
    const rest = pathname.slice("/api/storage/state/".length);
    const [namespace, key] = rest.split("/");
    if (!namespace || !key) throw new HttpError(400, "invalid-state-path", "本地状态路径不完整");
    return [decode(namespace), decode(key)];
}

function logPath(pathname) {
    const rest = pathname.slice("/api/storage/logs/".length);
    const [kind, id] = rest.split("/");
    if (!kind) throw new HttpError(400, "invalid-log-path", "日志类型不能为空");
    return [decode(kind), id ? decode(id) : ""];
}

function pluginPath(pathname) {
    const rest = pathname.slice("/api/storage/plugins/".length);
    const separator = rest.indexOf("/");
    if (separator <= 0 || separator === rest.length - 1) throw new HttpError(400, "invalid-plugin-path", "插件存储路径不完整");
    return [decode(rest.slice(0, separator)), decode(rest.slice(separator + 1))];
}

function parseHeaders(value) {
    if (!value) return {};
    try {
        // URLSearchParams 已经解码过一次，这里直接解析 JSON，避免含 % 的值被二次解码。
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        throw new HttpError(400, "invalid-headers", "WebDAV 请求头不是合法 JSON");
    }
}
