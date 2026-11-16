import { readFile } from "node:fs/promises";

import { Jimp } from "jimp";

import { removeTemp, resolveTemp } from "../media/uploads.mjs";

function assertRealSubjectMask(pixels) {
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

function maskFromImage(pixels, source) {
    const mask = new Uint8ClampedArray(pixels);
    if (source === "alpha") {
        assertRealSubjectMask(mask);
        return mask;
    }
    let hasAlpha = false;
    for (let index = 3; index < mask.length; index += 4) {
        if (pixels[index] < 255) {
            hasAlpha = true;
            break;
        }
    }
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

function compositeSubjectPixels(source, mask, background) {
    if (source.length !== mask.length || source.length % 4 !== 0 || source.length === 0) throw new Error("原图与蒙版尺寸不一致，无法合成。");
    const output = new Uint8ClampedArray(source);
    for (let index = 0; index < output.length; index += 4) {
        const alpha = mask[index + 3] / 255;
        const originalAlpha = source[index + 3] / 255;
        if (background === "transparent") {
            output[index + 3] = Math.round(source[index + 3] * alpha);
        } else {
            // 图片解码回来的是非预乘 RGBA；按原图不透明度与蒙版覆盖率合成纯白底。
            for (let channel = 0; channel < 3; channel += 1) {
                output[index + channel] = Math.round(source[index + channel] * originalAlpha * alpha + 255 * (1 - originalAlpha * alpha));
            }
            output[index + 3] = 255;
        }
    }
    return output;
}

async function loadImage(filePath) {
    const image = await Jimp.read(await readFile(filePath));
    return { image, width: Math.max(1, image.bitmap.width || 1), height: Math.max(1, image.bitmap.height || 1) };
}

function pixelsOf(image) {
    return new Uint8ClampedArray(image.bitmap.data);
}

export async function compositeImage(dataRoot, { sourceId, maskId, background }) {
    const source = await loadImage(resolveTemp(dataRoot, sourceId));
    try {
        const sourcePixels = pixelsOf(source.image);
        let maskPixels;
        if (maskId) {
            const mask = await loadImage(resolveTemp(dataRoot, maskId));
            if (mask.width !== source.width || mask.height !== source.height) {
                mask.image.resize({ w: source.width, h: source.height });
            }
            maskPixels = maskFromImage(pixelsOf(mask.image), "mask");
        } else {
            maskPixels = maskFromImage(sourcePixels, "alpha");
        }
        const result = compositeSubjectPixels(sourcePixels, maskPixels, background === "transparent" ? "transparent" : "white");
        if (background === "transparent") assertRealSubjectMask(result);
        const output = new Jimp({ width: source.width, height: source.height, data: Buffer.from(result.buffer, result.byteOffset, result.byteLength) });
        return output.getBuffer("image/png");
    } finally {
        removeTemp(dataRoot, [sourceId, maskId]);
    }
}
