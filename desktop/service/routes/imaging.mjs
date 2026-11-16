import { HttpError, readJson, sendJson } from "../http.mjs";
import { compositeImage } from "../imaging/composite.mjs";
import { autoSegment, pointSegment } from "../imaging/segment.mjs";

function sendBinary(res, buffer) {
    res.writeHead(200, { "content-type": "image/png", "content-length": buffer.length });
    res.end(buffer);
}

function requireSource(body) {
    if (!body.sourceId) throw new HttpError(400, "missing-source", "缺少源图片");
}

export function register(router, ctx) {
    router.post("/api/imaging/auto-segment", async (req, res) => {
        const body = await readJson(req);
        requireSource(body);
        sendJson(res, 200, await autoSegment(ctx.dataRoot, body.sourceId));
    });

    router.post("/api/imaging/point-segment", async (req, res) => {
        const body = await readJson(req);
        requireSource(body);
        if (!Array.isArray(body.points) || !body.points.length) throw new HttpError(400, "missing-points", "请先在图片上点选保留/排除区域");
        sendJson(res, 200, await pointSegment(ctx.dataRoot, body));
    });

    router.post("/api/imaging/composite", async (req, res) => {
        const body = await readJson(req);
        requireSource(body);
        sendBinary(res, await compositeImage(ctx.dataRoot, body));
    });
}
