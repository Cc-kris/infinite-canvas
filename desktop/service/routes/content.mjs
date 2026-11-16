import { HttpError, readJson, sendError, sendJson } from "../http.mjs";
import { writeMarketingCopy, analyzeVision } from "../content/analysis.mjs";
import { parseProductLink, readPage } from "../content/pages.mjs";
import { readRemoteJson } from "../content/remote-json.mjs";
import { sliceImage } from "../content/slice.mjs";
import { requestContentText } from "../content/text.mjs";
import { transcribeAudio } from "../content/transcribe.mjs";
import { fetchVideo } from "../content/video.mjs";
import { UpstreamError } from "../providers/shared.mjs";

function handle(run) {
    return async (req, res, ctx) => {
        try {
            await run(req, res, ctx);
        } catch (error) {
            if (res.writableEnded || res.destroyed) return;
            if (res.headersSent) return res.end();
            if (error instanceof HttpError) return sendError(res, error.status, error.code, error.message);
            if (error instanceof UpstreamError) return sendError(res, error.status >= 400 && error.status < 600 ? error.status : 502, "upstream-error", error.message);
            console.error("[infinite-canvas:content]", error);
            return sendError(res, 500, "content-error", error?.message || "内容处理失败");
        }
    };
}

function abortOnClose(res) {
    const controller = new AbortController();
    const onClose = () => {
        if (!res.writableEnded) controller.abort();
    };
    res.on("close", onClose);
    return { signal: controller.signal, dispose: () => res.removeListener("close", onClose) };
}

function sendBinary(res, bytes, contentType) {
    res.writeHead(200, { "content-type": contentType, "content-length": bytes.length, "cache-control": "no-store" });
    res.end(bytes);
}

export function register(router, ctx) {
    router.post(
        "/api/content/page",
        handle(async (req, res) => {
            const body = await readJson(req);
            const abort = abortOnClose(res);
            try {
                sendJson(res, 200, await readPage(ctx, { url: body.url, signal: abort.signal }));
            } finally {
                abort.dispose();
            }
        }),
    );

    router.post(
        "/api/content/product-link",
        handle(async (req, res) => {
            const body = await readJson(req);
            const abort = abortOnClose(res);
            try {
                sendJson(res, 200, await parseProductLink(ctx, { url: body.url, signal: abort.signal }));
            } finally {
                abort.dispose();
            }
        }),
    );

    router.post(
        "/api/content/fetch-json",
        handle(async (req, res) => {
            const body = await readJson(req);
            const abort = abortOnClose(res);
            try {
                sendJson(res, 200, { data: await readRemoteJson(ctx, body, abort.signal) });
            } finally {
                abort.dispose();
            }
        }),
    );

    router.post(
        "/api/content/text",
        handle(async (req, res) => {
            const body = await readJson(req);
            const abort = abortOnClose(res);
            try {
                sendJson(res, 200, { text: await requestContentText(ctx, body, abort.signal) });
            } finally {
                abort.dispose();
            }
        }),
    );

    router.post(
        "/api/content/transcribe",
        handle(async (req, res) => {
            const body = await readJson(req);
            const abort = abortOnClose(res);
            try {
                sendJson(res, 200, await transcribeAudio(ctx, body, abort.signal));
            } finally {
                abort.dispose();
            }
        }),
    );

    router.post(
        "/api/content/fetch-video",
        handle(async (req, res) => {
            const body = await readJson(req);
            const abort = abortOnClose(res);
            try {
                const video = await fetchVideo(ctx, { url: body.url, signal: abort.signal });
                sendBinary(res, video.bytes, video.mimeType);
            } finally {
                abort.dispose();
            }
        }),
    );

    router.post(
        "/api/content/slice",
        handle(async (req, res) => {
            const body = await readJson(req);
            sendJson(res, 200, { modules: await sliceImage(ctx.dataRoot, body) });
        }),
    );

    router.post(
        "/api/content/vision",
        handle(async (req, res) => {
            const body = await readJson(req);
            const abort = abortOnClose(res);
            try {
                sendJson(res, 200, await analyzeVision(ctx, body, abort.signal));
            } finally {
                abort.dispose();
            }
        }),
    );

    router.post(
        "/api/content/copywrite",
        handle(async (req, res) => {
            const body = await readJson(req);
            const abort = abortOnClose(res);
            try {
                sendJson(res, 200, { text: await writeMarketingCopy(ctx, body, abort.signal) });
            } finally {
                abort.dispose();
            }
        }),
    );
}
