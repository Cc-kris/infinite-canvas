/**
 * 内联参考图瘦身（画布与工作台共用，2026-10-26 实测结论）。
 *
 * sub2api / Cloudflare 这一层处理内联图的成本随 base64 体积线性上升：
 *   1.5MB 请求体 ≈ 70s，1.9MB ≈ 70~104s，2.8MB ≈ 90~128s 后被 Cloudflare 524，4MB→524，5MB→502。
 * 而画布节点里的原图通常是 1.8~2.3MB 的 PNG，直接内联必然超时。
 * 所以任何把参考图塞进 JSON 的地方，都要先走这里：最长边 1280 的 JPEG，把请求体压到几百 KB。
 */

export const INLINE_IMAGE_MAX_EDGE = 1280;
export const INLINE_IMAGE_MAX_CHARS = 500_000;

function loadImageElement(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        // 解码预算：坏掉的 blob:/超大 data URL 有可能既不 onload 也不 onerror，
        // 那样整个提交链路（内联参考图）会永久悬挂。超时就当解码失败，走调用方的兜底。
        const timer = setTimeout(() => reject(new Error("image decode timeout")), 10_000);
        image.onload = () => {
            clearTimeout(timer);
            resolve(image);
        };
        image.onerror = () => {
            clearTimeout(timer);
            reject(new Error("image decode failed"));
        };
        image.src = src;
    });
}

/** SVG（本地示意图）必须光栅化：上游图生图接口只接受位图，且其 data URL 是百分号编码而非 base64。 */
function isNonRasterDataUrl(dataUrl: string) {
    return /^data:image\/svg\+xml/i.test(dataUrl);
}

export async function shrinkInlineImage(dataUrl: string, maxEdge = INLINE_IMAGE_MAX_EDGE): Promise<string> {
    if (!dataUrl.startsWith("data:image/")) return dataUrl;
    const mustRasterize = isNonRasterDataUrl(dataUrl);
    try {
        const image = await loadImageElement(dataUrl);
        const naturalWidth = image.naturalWidth || image.width;
        const naturalHeight = image.naturalHeight || image.height;
        const scale = Math.min(1, maxEdge / Math.max(naturalWidth, naturalHeight));
        if (!mustRasterize && scale === 1 && dataUrl.length <= INLINE_IMAGE_MAX_CHARS) return dataUrl;
        const width = Math.max(1, Math.round(naturalWidth * scale));
        const height = Math.max(1, Math.round(naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return dataUrl;
        // SVG 示意图可能有透明背景，用白色垫底并在 PNG/JPEG 之间按需选择
        context.fillStyle = "#fff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        if (mustRasterize) return canvas.toDataURL("image/png");
        let output = canvas.toDataURL("image/jpeg", 0.86);
        if (output.length > INLINE_IMAGE_MAX_CHARS) output = canvas.toDataURL("image/jpeg", 0.7);
        return output;
    } catch {
        return dataUrl;
    }
}

export function shrinkInlineImages(dataUrls: string[], maxEdge = INLINE_IMAGE_MAX_EDGE): Promise<string[]> {
    return Promise.all(dataUrls.map((dataUrl) => shrinkInlineImage(dataUrl, maxEdge)));
}
