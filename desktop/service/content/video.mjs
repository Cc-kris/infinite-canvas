/** 公开视频直链读取：只接受真实视频字节，分享页 HTML 不会被当成视频。 */
import { HttpError } from "../http.mjs";
import { fetchUpstream } from "../providers/shared.mjs";

export async function fetchVideo(ctx, input) {
    let parsed;
    try {
        parsed = new URL(String(input.url || "").trim());
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    } catch {
        throw new HttpError(400, "invalid-link", "参考视频链接需以 http:// 或 https:// 开头");
    }

    let response;
    let scope;
    try {
        ({ response, scope } = await fetchUpstream(ctx, parsed.href, { headers: { accept: "video/*" } }, { signal: input.signal }));
    } catch {
        if (input.signal?.aborted) throw new HttpError(499, "aborted", "已取消参考视频读取");
        throw new HttpError(502, "video-unreadable", "参考视频读取失败：请确认直链可公开访问");
    }
    try {
        if (!response.ok) {
            await response.arrayBuffer().catch(() => undefined);
            throw new HttpError(502, "video-unreadable", `参考视频读取失败（HTTP ${response.status}）`);
        }
        const contentType = String(response.headers.get("content-type") || "").toLowerCase();
        if (contentType && !contentType.startsWith("video/") && !contentType.includes("application/octet-stream")) {
            throw new HttpError(422, "video-not-file", "链接没有返回视频文件；分享页不能当作视频内容分析");
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length) throw new HttpError(422, "video-unreadable", "链接返回了空视频文件");
        return { bytes, mimeType: contentType.split(";")[0].trim() || "video/mp4" };
    } finally {
        scope?.dispose();
    }
}
