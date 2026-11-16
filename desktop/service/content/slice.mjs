/** 详情长图智能切分：jimp 读取像素，按行亮度方差寻找水平留白分割线。 */
import { readFile } from "node:fs/promises";

import { Jimp } from "jimp";

import { HttpError } from "../http.mjs";
import { resolveTemp, removeTemp } from "../media/uploads.mjs";

async function dataUrlOf(image) {
    return `data:image/png;base64,${(await image.getBuffer("image/png")).toString("base64")}`;
}

export async function sliceImage(dataRoot, input) {
    const maxModules = Math.max(2, Math.min(input.maxModules ?? 6, 12));
    const filePath = resolveTemp(dataRoot, input.imageId);
    try {
        let image;
        try {
            image = await Jimp.read(await readFile(filePath));
        } catch {
            throw new HttpError(422, "image-unreadable", "无法加载长图进行智能切分");
        }
        const width = image.bitmap.width || 800;
        const height = image.bitmap.height || 1200;
        if (height <= width * 1.35) {
            return [{ id: "slice-1", label: "模块 1（整图）", dataUrl: await dataUrlOf(image), width, height, yStart: 0, yEnd: height }];
        }

        const pixels = image.bitmap.data;
        const targetSliceHeight = Math.max(Math.round(width * 0.75), Math.ceil(height / maxModules));
        const minSliceHeight = Math.max(160, Math.round(targetSliceHeight * 0.55));
        const cuts = [0];
        let currentY = 0;

        while (currentY + targetSliceHeight < height && cuts.length < maxModules) {
            const idealY = currentY + targetSliceHeight;
            const searchStart = Math.max(currentY + minSliceHeight, idealY - Math.round(targetSliceHeight * 0.25));
            const searchEnd = Math.min(height - minSliceHeight, idealY + Math.round(targetSliceHeight * 0.25));

            let bestY = idealY;
            let lowestVariance = Number.POSITIVE_INFINITY;
            for (let y = searchStart; y <= searchEnd; y += 2) {
                let sum = 0;
                let sumSq = 0;
                const sampleCount = Math.min(64, width);
                const step = Math.max(1, Math.floor(width / sampleCount));
                let count = 0;
                for (let x = 0; x < width; x += step) {
                    const index = (y * width + x) * 4;
                    const lum = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
                    sum += lum;
                    sumSq += lum * lum;
                    count += 1;
                }
                const mean = sum / Math.max(1, count);
                const variance = sumSq / Math.max(1, count) - mean * mean;
                if (variance < lowestVariance) {
                    lowestVariance = variance;
                    bestY = y;
                }
            }
            cuts.push(bestY);
            currentY = bestY;
        }
        cuts.push(height);

        const modules = [];
        for (let index = 0; index < cuts.length - 1; index += 1) {
            const yStart = cuts[index];
            const yEnd = cuts[index + 1];
            const sliceHeight = Math.max(1, yEnd - yStart);
            const sliceData = Buffer.alloc(width * sliceHeight * 4);
            Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength).copy(sliceData, 0, yStart * width * 4, yEnd * width * 4);
            const slice = new Jimp({ width, height: sliceHeight, data: sliceData });
            modules.push({
                id: `slice-${index + 1}`,
                label: `模块 ${index + 1}（${width}×${sliceHeight}）`,
                dataUrl: await dataUrlOf(slice),
                width,
                height: sliceHeight,
                yStart,
                yEnd,
            });
        }
        return modules;
    } finally {
        removeTemp(dataRoot, [input.imageId]);
    }
}
