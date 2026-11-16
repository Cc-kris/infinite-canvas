import { readFile } from "node:fs/promises";

import { Jimp } from "jimp";

import { removeTemp, resolveTemp } from "../media/uploads.mjs";

function colorDistanceSq(r1, g1, b1, r2, g2, b2) {
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    return dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
}

async function loadPixels(filePath) {
    const image = await Jimp.read(await readFile(filePath));
    const width = Math.max(1, image.bitmap.width || 1);
    const height = Math.max(1, image.bitmap.height || 1);
    return { width, height, data: new Uint8ClampedArray(image.bitmap.data) };
}

async function encodePng(width, height, data) {
    const image = new Jimp({ width, height, data: Buffer.from(data.buffer, data.byteOffset, data.byteLength) });
    return image.getBuffer("image/png");
}

function dataUrl(buffer) {
    return `data:image/png;base64,${buffer.toString("base64")}`;
}

/** BE-SEG01：基于边缘背景采样 + 连通域泛洪的自动主体分割。 */
export async function autoSegment(dataRoot, sourceId) {
    const source = await loadPixels(resolveTemp(dataRoot, sourceId));
    try {
        const { width, height, data } = source;
        const totalPixels = width * height;

        let transparentCount = 0;
        let opaqueCount = 0;
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] < 128) transparentCount++;
            else opaqueCount++;
        }

        const alphaMask = new Uint8ClampedArray(totalPixels);
        if (transparentCount > totalPixels * 0.02 && opaqueCount > totalPixels * 0.02) {
            for (let p = 0; p < totalPixels; p++) alphaMask[p] = data[p * 4 + 3];
        } else {
            const borderSamples = [];
            const stepX = Math.max(1, Math.floor(width / 32));
            const stepY = Math.max(1, Math.floor(height / 32));
            for (let x = 0; x < width; x += stepX) {
                const topIdx = x * 4;
                const botIdx = ((height - 1) * width + x) * 4;
                borderSamples.push([data[topIdx], data[topIdx + 1], data[topIdx + 2]]);
                borderSamples.push([data[botIdx], data[botIdx + 1], data[botIdx + 2]]);
            }
            for (let y = 0; y < height; y += stepY) {
                const leftIdx = y * width * 4;
                const rightIdx = (y * width + (width - 1)) * 4;
                borderSamples.push([data[leftIdx], data[leftIdx + 1], data[leftIdx + 2]]);
                borderSamples.push([data[rightIdx], data[rightIdx + 1], data[rightIdx + 2]]);
            }

            let meanR = 255;
            let meanG = 255;
            let meanB = 255;
            if (borderSamples.length > 0) {
                meanR = borderSamples.reduce((acc, sample) => acc + sample[0], 0) / borderSamples.length;
                meanG = borderSamples.reduce((acc, sample) => acc + sample[1], 0) / borderSamples.length;
                meanB = borderSamples.reduce((acc, sample) => acc + sample[2], 0) / borderSamples.length;
            }

            const visited = new Uint8Array(totalPixels);
            const isBg = new Uint8Array(totalPixels);
            const queue = new Int32Array(totalPixels);
            let head = 0;
            let tail = 0;
            const thresholdSq = 42 * 42;

            const tryEnqueue = (x, y) => {
                if (x < 0 || x >= width || y < 0 || y >= height) return;
                const idx = y * width + x;
                if (visited[idx]) return;
                visited[idx] = 1;
                const p = idx * 4;
                if (colorDistanceSq(data[p], data[p + 1], data[p + 2], meanR, meanG, meanB) <= thresholdSq) {
                    isBg[idx] = 1;
                    queue[tail++] = idx;
                }
            };

            for (let x = 0; x < width; x++) {
                tryEnqueue(x, 0);
                tryEnqueue(x, height - 1);
            }
            for (let y = 0; y < height; y++) {
                tryEnqueue(0, y);
                tryEnqueue(width - 1, y);
            }

            while (head < tail) {
                const curr = queue[head++];
                const cx = curr % width;
                const cy = (curr - cx) / width;
                tryEnqueue(cx - 1, cy);
                tryEnqueue(cx + 1, cy);
                tryEnqueue(cx, cy - 1);
                tryEnqueue(cx, cy + 1);
            }

            let fgCount = 0;
            for (let i = 0; i < totalPixels; i++) {
                if (isBg[i]) {
                    alphaMask[i] = 0;
                } else {
                    alphaMask[i] = 255;
                    fgCount++;
                }
            }

            if (fgCount < totalPixels * 0.05 || fgCount > totalPixels * 0.96) {
                const cx = width / 2;
                const cy = height / 2;
                const rx = width * 0.38;
                const ry = height * 0.4;
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const dx = (x - cx) / rx;
                        const dy = (y - cy) / ry;
                        alphaMask[y * width + x] = dx * dx + dy * dy <= 1 ? 255 : 0;
                    }
                }
            }
        }

        const maskPixels = new Uint8ClampedArray(totalPixels * 4);
        const cutoutPixels = new Uint8ClampedArray(totalPixels * 4);
        for (let i = 0; i < totalPixels; i++) {
            const a = alphaMask[i];
            const p = i * 4;
            maskPixels[p] = a;
            maskPixels[p + 1] = a;
            maskPixels[p + 2] = a;
            maskPixels[p + 3] = 255;

            cutoutPixels[p] = data[p];
            cutoutPixels[p + 1] = data[p + 1];
            cutoutPixels[p + 2] = data[p + 2];
            cutoutPixels[p + 3] = Math.round((data[p + 3] * a) / 255);
        }

        const [maskBuffer, cutoutBuffer] = await Promise.all([encodePng(width, height, maskPixels), encodePng(width, height, cutoutPixels)]);
        return { maskDataUrl: dataUrl(maskBuffer), cutoutDataUrl: dataUrl(cutoutBuffer), width, height };
    } finally {
        removeTemp(dataRoot, [sourceId]);
    }
}

/** BE-SEG02：保留点/排除点按颜色连通域生成选区蒙版。 */
export async function pointSegment(dataRoot, { sourceId, points, tolerance }) {
    const source = await loadPixels(resolveTemp(dataRoot, sourceId));
    try {
        const { width, height, data } = source;
        const totalPixels = width * height;
        const toleranceValue = tolerance === undefined ? 38 : Number(tolerance);
        const thresholdSq = toleranceValue * toleranceValue;
        const mask = new Uint8Array(totalPixels);
        const excluded = new Uint8Array(totalPixels);

        const floodFromSeed = (normX, normY, target) => {
            const sx = Math.min(width - 1, Math.max(0, Math.round(normX * width)));
            const sy = Math.min(height - 1, Math.max(0, Math.round(normY * height)));
            const startIdx = sy * width + sx;
            const sp = startIdx * 4;
            const seedR = data[sp];
            const seedG = data[sp + 1];
            const seedB = data[sp + 2];

            const visited = new Uint8Array(totalPixels);
            const queue = new Int32Array(totalPixels);
            let head = 0;
            let tail = 0;

            visited[startIdx] = 1;
            target[startIdx] = 1;
            queue[tail++] = startIdx;

            while (head < tail) {
                const curr = queue[head++];
                const cx = curr % width;
                const cy = (curr - cx) / width;
                const neighbors = [
                    [cx - 1, cy],
                    [cx + 1, cy],
                    [cx, cy - 1],
                    [cx, cy + 1],
                ];
                for (const [nx, ny] of neighbors) {
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                    const nIdx = ny * width + nx;
                    if (visited[nIdx]) continue;
                    visited[nIdx] = 1;
                    const np = nIdx * 4;
                    if (colorDistanceSq(data[np], data[np + 1], data[np + 2], seedR, seedG, seedB) <= thresholdSq) {
                        target[nIdx] = 1;
                        queue[tail++] = nIdx;
                    }
                }
            }
        };

        const keepPoints = (points || []).filter((point) => point.mode === "keep");
        const excludePoints = (points || []).filter((point) => point.mode === "exclude");
        for (const point of excludePoints) floodFromSeed(point.x, point.y, excluded);
        for (const point of keepPoints) floodFromSeed(point.x, point.y, mask);

        const out = new Uint8ClampedArray(totalPixels * 4);
        let selectedCount = 0;
        for (let i = 0; i < totalPixels; i++) {
            const active = mask[i] === 1 && excluded[i] === 0;
            if (active) selectedCount++;
            const value = active ? 255 : 0;
            const p = i * 4;
            out[p] = value;
            out[p + 1] = value;
            out[p + 2] = value;
            out[p + 3] = 255;
        }

        return {
            maskDataUrl: dataUrl(await encodePng(width, height, out)),
            coveragePercent: Math.round((selectedCount / totalPixels) * 100),
        };
    } finally {
        removeTemp(dataRoot, [sourceId]);
    }
}
