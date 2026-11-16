import { HttpError, readBody, readJson, sendError, sendJson } from "../http.mjs";
import { generateAudio } from "../providers/audio.mjs";
import { generateImages } from "../providers/image.mjs";
import { fetchModels } from "../providers/models.mjs";
import { forwardPluginRequest } from "../providers/plugin-http.mjs";
import { UpstreamError } from "../providers/shared.mjs";
import { callTextModel } from "../providers/text.mjs";
import { createVideoTask, pollVideoTask } from "../providers/video.mjs";

function handle(run) {
    return async (req, res, ctx, url) => {
        try {
            await run(req, res, ctx, url);
        } catch (error) {
            if (res.writableEnded || res.destroyed) return;
            if (res.headersSent) return res.end();
            if (error instanceof HttpError) return sendError(res, error.status, error.code, error.message);
            if (error instanceof UpstreamError) return sendError(res, error.status >= 400 && error.status < 600 ? error.status : 502, "upstream-error", error.message);
            console.error("[infinite-canvas:providers]", error);
            return sendError(res, 502, "provider-error", error?.message || "上游请求失败");
        }
    };
}

async function readMultipart(req) {
    const buffer = await readBody(req);
    const contentType = String(req.headers["content-type"] || "");
    if (!contentType.includes("multipart/form-data")) throw new HttpError(400, "invalid-body", "视频请求需要 multipart/form-data");
    return new Response(buffer, { headers: { "content-type": contentType } }).formData();
}

async function toFile(value, fallbackName, fallbackType) {
    if (!value || typeof value.arrayBuffer !== "function") return undefined;
    const bytes = Buffer.from(await value.arrayBuffer());
    return new File([bytes], value.name || fallbackName, { type: value.type || fallbackType || "application/octet-stream" });
}

async function readVideoForm(req) {
    const form = await readMultipart(req);
    const raw = form.get("payload");
    if (typeof raw !== "string") throw new HttpError(400, "invalid-body", "视频请求缺少 payload");
    let payload;
    try {
        payload = JSON.parse(raw);
    } catch {
        throw new HttpError(400, "invalid-json", "视频请求 payload 不是合法 JSON");
    }
    const files = new Map();
    for (const [key, value] of form.entries()) {
        if (key !== "payload" && value && typeof value === "object") files.set(key, value);
    }
    const images = [];
    for (const [index, key] of (payload.imageFiles || []).entries()) {
        const file = await toFile(files.get(key), `image_${index}.png`, "image/png");
        if (file) images.push(file);
    }
    const videos = [];
    for (const [index, entry] of (payload.videos || []).entries()) {
        videos.push({ ...entry, file: entry.file ? await toFile(files.get(entry.file), `video_${index}.mp4`, "video/mp4") : undefined });
    }
    const audios = [];
    for (const [index, entry] of (payload.audios || []).entries()) {
        audios.push({ ...entry, file: entry.file ? await toFile(files.get(entry.file), `audio_${index}.mp3`, "audio/mpeg") : undefined });
    }
    return { payload, images, videos, audios };
}

function writeLine(res, payload) {
    if (res.writableEnded || res.destroyed) return;
    try {
        res.write(`${JSON.stringify(payload)}\n`);
    } catch {
        /* 客户端已断开 */
    }
}

/** 渲染层取消请求时同步中止主进程的上游请求，避免继续生成/计费。 */
function abortOnClose(res) {
    const controller = new AbortController();
    const onClose = () => {
        if (!res.writableEnded) controller.abort();
    };
    res.on("close", onClose);
    return { signal: controller.signal, dispose: () => res.removeListener("close", onClose) };
}

export function register(router) {
    router.post(
        "/api/providers/image/generate",
        handle(async (req, res, ctx) => {
            const body = await readJson(req);
            const abort = abortOnClose(res);
            try {
                const results = await generateImages(ctx, { ...body, signal: abort.signal });
                sendJson(res, 200, { results });
            } finally {
                abort.dispose();
            }
        }),
    );

    router.post(
        "/api/providers/image/edit",
        handle(async (req, res, ctx) => {
            const body = await readJson(req);
            const abort = abortOnClose(res);
            try {
                const results = await generateImages(ctx, { ...body, references: body.references || [], signal: abort.signal });
                sendJson(res, 200, { results });
            } finally {
                abort.dispose();
            }
        }),
    );

    router.post(
        "/api/providers/text/chat",
        handle(async (req, res, ctx) => {
            const body = await readJson(req);
            const config = body.config || {};
            const messages = body.messages || [];
            const options = { tools: body.tools || [], toolChoice: body.toolChoice || "auto" };
            if (!body.stream) {
                const result = await callTextModel(ctx, config, messages, options);
                return sendJson(res, 200, result);
            }
            res.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" });
            const controller = new AbortController();
            const onClose = () => {
                if (!res.writableEnded) controller.abort();
            };
            res.on("close", onClose);
            try {
                const result = await callTextModel(ctx, config, messages, {
                    ...options,
                    signal: controller.signal,
                    onDelta: (text) => writeLine(res, { delta: text }),
                });
                writeLine(res, { done: true, content: result.content, toolCalls: result.toolCalls });
            } catch (error) {
                if (!controller.signal.aborted) writeLine(res, { error: error?.message || "文本请求失败" });
            } finally {
                res.removeListener("close", onClose);
                res.end();
            }
        }),
    );

    router.post(
        "/api/providers/video/create",
        handle(async (req, res, ctx) => {
            const { payload, images, videos, audios } = await readVideoForm(req);
            const abort = abortOnClose(res);
            try {
                const task = await createVideoTask(ctx, {
                    config: { ...payload.config, model: payload.config?.model || payload.model },
                    videoHttp: payload.videoHttp,
                    model: payload.model,
                    taskModel: payload.taskModel,
                    prompt: payload.prompt,
                    inlineImages: payload.inlineImages || [],
                    images,
                    videos,
                    audios,
                    translation: payload.translation,
                    signal: abort.signal,
                });
                sendJson(res, 200, { task });
            } finally {
                abort.dispose();
            }
        }),
    );

    router.post(
        "/api/providers/video/poll",
        handle(async (req, res, ctx) => {
            const body = await readJson(req);
            const abort = abortOnClose(res);
            try {
                const state = await pollVideoTask(ctx, { config: body.config || {}, videoHttp: body.videoHttp, task: body.task || {}, signal: abort.signal });
                sendJson(res, 200, { state });
            } finally {
                abort.dispose();
            }
        }),
    );

    router.post(
        "/api/providers/audio/generate",
        handle(async (req, res, ctx) => {
            const body = await readJson(req);
            const abort = abortOnClose(res);
            try {
                const { bytes, mimeType } = await generateAudio(ctx, { ...body, signal: abort.signal });
                res.writeHead(200, { "content-type": mimeType, "content-length": bytes.length, "cache-control": "no-store" });
                res.end(Buffer.from(bytes));
            } finally {
                abort.dispose();
            }
        }),
    );

    router.post(
        "/api/providers/models",
        handle(async (req, res, ctx) => {
            const body = await readJson(req);
            const models = await fetchModels(ctx, body);
            sendJson(res, 200, { models });
        }),
    );

    router.post(
        "/api/providers/plugin/request",
        handle(async (req, res, ctx, url) => {
            const target = url.searchParams.get("url") || "";
            const method = (url.searchParams.get("method") || "GET").toUpperCase();
            const responseType = url.searchParams.get("responseType") || "json";
            let headers = {};
            try {
                const encoded = url.searchParams.get("headers");
                if (encoded) headers = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
            } catch {
                throw new HttpError(400, "invalid-headers", "插件请求头不是合法 JSON");
            }
            const contentType = String(req.headers["content-type"] || "");
            const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req);
            const abort = abortOnClose(res);
            try {
                const result = await forwardPluginRequest(ctx, { target, url: target, method, headers, contentType, body, responseType, signal: abort.signal });
                if (result.bytes) {
                    res.setHeader("access-control-expose-headers", "x-upstream-status,x-upstream-content-type,content-type,content-length");
                    res.writeHead(200, {
                        "content-type": result.contentType,
                        "content-length": result.bytes.length,
                        "x-upstream-status": String(result.status),
                        "x-upstream-content-type": result.contentType,
                    });
                    return res.end(Buffer.from(result.bytes));
                }
                sendJson(res, 200, { status: result.status, data: result.data });
            } finally {
                abort.dispose();
            }
        }),
    );
}
