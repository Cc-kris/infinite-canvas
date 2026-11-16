import { requestCompositeSubject, uploadImageSource } from "@/services/api/desktop/capabilities/imaging";
import type { PixelBackground, PixelMaskSource } from "@/features/tools/registry/local-pixel";

export type PixelSurface = {
    width: number;
    height: number;
    getContext(type: "2d", options?: { willReadFrequently?: boolean }): CanvasRenderingContext2D | null;
    toBlob?(callback: (blob: Blob | null) => void, type?: string): void;
    convertToBlob?(options: { type: string }): Promise<Blob>;
};

export type PixelCompositor = {
    load(source: string): Promise<CanvasImageSource & { width: number; height: number }>;
    surface(width: number, height: number): PixelSurface;
};

export function compositeSubjectPixels(source: Uint8ClampedArray, mask: Uint8ClampedArray, background: PixelBackground): Uint8ClampedArray {
    if (source.length !== mask.length || source.length % 4 !== 0 || source.length === 0) throw new Error("原图与蒙版尺寸不一致，无法合成。");
    const output = new Uint8ClampedArray(source);
    for (let index = 0; index < output.length; index += 4) {
        const alpha = mask[index + 3] / 255;
        const originalAlpha = source[index + 3] / 255;
        if (background === "transparent") {
            output[index + 3] = Math.round(source[index + 3] * alpha);
        } else {
            // Canvas 读回的是非预乘 RGBA；按原图不透明度与蒙版覆盖率合成纯白底。
            for (let channel = 0; channel < 3; channel += 1) {
                output[index + channel] = Math.round(source[index + channel] * originalAlpha * alpha + 255 * (1 - originalAlpha * alpha));
            }
            output[index + 3] = 255;
        }
    }
    return output;
}

export function assertRealSubjectMask(pixels: Uint8ClampedArray): void {
    let retained = false;
    let removed = false;
    for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) retained = true;
        if (pixels[index] < 255) removed = true;
        if (retained && removed) return;
    }
    if (!retained) throw new Error("蒙版没有保留区域，请先涂出需要保留的主体。");
    if (!removed) throw new Error("没有识别到透明背景；请先编辑蒙版，不要把原图当作抠图结果。");
}

export function maskFromImage(pixels: Uint8ClampedArray, source: PixelMaskSource): Uint8ClampedArray {
    const mask = new Uint8ClampedArray(pixels);
    if (source === "alpha") {
        assertRealSubjectMask(mask);
        return mask;
    }
    let hasAlpha = false;
    for (let index = 3; index < mask.length; index += 4) if (pixels[index] < 255) { hasAlpha = true; break; }
    if (hasAlpha) {
        assertRealSubjectMask(mask);
        return mask;
    }
    // 仅用户明确上传/编辑器确认的黑白图按亮度解释；普通原图绝不走此分支。
    for (let index = 0; index < mask.length; index += 4) {
        mask[index + 3] = Math.round(pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722);
    }
    assertRealSubjectMask(mask);
    return mask;
}

function pixelsOf(surface: PixelSurface, image: CanvasImageSource): Uint8ClampedArray {
    const context = surface.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("当前浏览器无法读取图片像素。");
    context.drawImage(image, 0, 0, surface.width, surface.height);
    return context.getImageData(0, 0, surface.width, surface.height).data;
}

async function encodePng(surface: PixelSurface): Promise<Blob> {
    if (surface.convertToBlob) return surface.convertToBlob({ type: "image/png" });
    const blob = await new Promise<Blob | null>((resolve) => surface.toBlob?.(resolve, "image/png"));
    if (!blob || blob.size === 0) throw new Error("PNG 导出失败。");
    return blob;
}

/** 真实蒙版 → 透明 PNG / #fff 白底 PNG；没有蒙版时抛错，不调用生图模型。 */
export async function compositeSubjectImage(input: { sourceUrl: string; maskUrl?: string; background: PixelBackground }, compositor?: PixelCompositor): Promise<Blob> {
    if (!compositor) return compositeInService(input);
    const image = await compositor.load(input.sourceUrl);
    const width = Math.round(image.width);
    const height = Math.round(image.height);
    if (width < 1 || height < 1) throw new Error("图片尺寸无效。");
    const sourceSurface = compositor.surface(width, height);
    const sourcePixels = pixelsOf(sourceSurface, image);
    const maskPixels = input.maskUrl
        ? maskFromImage(pixelsOf(compositor.surface(width, height), await compositor.load(input.maskUrl)), "mask")
        : maskFromImage(sourcePixels, "alpha");
    const output = compositor.surface(width, height);
    const context = output.getContext("2d");
    if (!context) throw new Error("当前浏览器无法创建 PNG 画布。");
    const result = compositeSubjectPixels(sourcePixels, maskPixels, input.background);
    if (input.background === "transparent") assertRealSubjectMask(result);
    const imageData = context.createImageData(width, height);
    imageData.data.set(result);
    context.putImageData(imageData, 0, 0);
    return encodePng(output);
}

async function compositeInService(input: { sourceUrl: string; maskUrl?: string; background: PixelBackground }): Promise<Blob> {
    const source = await uploadImageSource(input.sourceUrl, "pixel-source.png");
    const mask = input.maskUrl ? await uploadImageSource(input.maskUrl, "pixel-mask.png") : undefined;
    const blob = await requestCompositeSubject(source.id, mask?.id, input.background);
    if (!blob.size) throw new Error("PNG 导出失败。");
    return blob;
}
