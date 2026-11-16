import { HttpError, readJson, sendJson } from "../http.mjs";
import { concatenateClips, extractAudio, muxTranslatedVideo } from "../media/ffmpeg.mjs";
import { saveUpload, removeTemp } from "../media/uploads.mjs";

function sendBinary(res, buffer, contentType) {
    res.writeHead(200, { "content-type": contentType, "content-length": buffer.length });
    res.end(buffer);
}

function requireId(value, message) {
    if (!value) throw new HttpError(400, "missing-media", message);
}

export function register(router, ctx) {
    router.post("/api/media/upload", async (req, res, _ctx, url) => {
        const header = req.headers["x-file-name"];
        const name = url.searchParams.get("name") || (header ? decodeURIComponent(String(header)) : "upload.bin");
        const saved = await saveUpload(req, ctx.dataRoot, name);
        if (!saved.bytes) {
            removeTemp(ctx.dataRoot, [saved.id]);
            throw new HttpError(400, "empty-media", "上传文件为空");
        }
        sendJson(res, 200, saved);
    });

    router.post("/api/media/extract-audio", async (req, res) => {
        const body = await readJson(req);
        requireId(body.videoId, "缺少需要提取音轨的视频");
        sendBinary(res, await extractAudio(ctx.dataRoot, body.videoId), "audio/mpeg");
    });

    router.post("/api/media/concat", async (req, res) => {
        const body = await readJson(req);
        if (!Array.isArray(body.clips) || !body.clips.length) throw new HttpError(400, "missing-clips", "请先添加需要合成的视频片段");
        sendBinary(res, await concatenateClips(ctx.dataRoot, body), "video/mp4");
    });

    router.post("/api/media/mux", async (req, res) => {
        const body = await readJson(req);
        requireId(body.videoId, "缺少原片视频");
        requireId(body.audioId, "缺少译制音轨");
        sendBinary(res, await muxTranslatedVideo(ctx.dataRoot, body), "video/mp4");
    });
}
