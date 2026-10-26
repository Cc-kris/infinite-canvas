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
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("image decode failed"));
        image.src = src;
    });
}

export async function shrinkInlineImage(dataUrl: string, maxEdge = INLINE_IMAGE_MAX_EDGE): Promise<string> {
    if (!dataUrl.startsWith("data:image/")) return dataUrl;
    try {
        const image = await loadImageElement(dataUrl);
        const naturalWidth = image.naturalWidth || image.width;
        const naturalHeight = image.naturalHeight || image.height;
        const scale = Math.min(1, maxEdge / Math.max(naturalWidth, naturalHeight));
        if (scale === 1 && dataUrl.length <= INLINE_IMAGE_MAX_CHARS) return dataUrl;
        const width = Math.max(1, Math.round(naturalWidth * scale));
        const height = Math.max(1, Math.round(naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return dataUrl;
        context.fillStyle = "#fff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
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
