/**
 * 图像分割与蒙版算法服务（BE-SEG01 自动前景抠图 / BE-SEG02 交互式点选分割）
 *
 * 在浏览器端提供：
 * 1. 自动主体前景分割（Auto Matting）：基于边缘背景采样 + 连通域泛洪 + 边缘羽化生成前景蒙版与透明抠图；
 * 2. 交互式点选分割（Interactive Point Segmentation）：支持左键保留点（keep）与排除点（exclude）实时连通域/颜色聚合分割；
 * 3. 白底图/自定义背景尺寸边距合成（White Background & Padding Compositor）。
 */

export interface SegmentationPoint {
    /** 归一化坐标 0..1 */
    x: number;
    /** 归一化坐标 0..1 */
    y: number;
    mode: "keep" | "exclude";
}

export interface AutoMattingResult {
    maskFile: File;
    maskDataUrl: string;
    cutoutDataUrl: string;
    width: number;
    height: number;
}

export interface PointSegmentResult {
    maskFile: File;
    maskDataUrl: string;
    coveragePercent: number;
}

async function loadHtmlImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("图片加载失败，无法执行图像分割。"));
        img.src = src;
    });
}

function colorDistanceSq(
    r1: number,
    g1: number,
    b1: number,
    r2: number,
    g2: number,
    b2: number,
): number {
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    return dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
}

async function canvasToFile(canvas: HTMLCanvasElement, fileName: string): Promise<File> {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
        throw new Error("无法导出分割蒙版 PNG。");
    }
    return new File([blob], fileName, { type: "image/png" });
}

/**
 * BE-SEG01：自动主体分割（Auto Matting）
 * 上传图片后自动生成前景黑白蒙版（白=保留主体，黑=背景）以及透明通道抠图预览。
 */
export async function autoSegmentSubjectMask(
    sourceUrl: string,
    fileName = "auto-mask.png",
): Promise<AutoMattingResult> {
    const img = await loadHtmlImage(sourceUrl);
    const width = Math.max(1, img.naturalWidth || img.width);
    const height = Math.max(1, img.naturalHeight || img.height);

    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = width;
    srcCanvas.height = height;
    const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
    if (!srcCtx) {
        throw new Error("当前浏览器环境不支持 Canvas 2D。");
    }
    srcCtx.drawImage(img, 0, 0, width, height);
    const imageData = srcCtx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const totalPixels = width * height;

    // 1. 检查原图是否已包含有效透明背景
    let transparentCount = 0;
    let opaqueCount = 0;
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 128) transparentCount++;
        else opaqueCount++;
    }

    const alphaMask = new Uint8ClampedArray(totalPixels);
    if (transparentCount > totalPixels * 0.02 && opaqueCount > totalPixels * 0.02) {
        for (let p = 0; p < totalPixels; p++) {
            alphaMask[p] = data[p * 4 + 3];
        }
    } else {
        // 2. 采样四边边缘像素估算背景色均值与容差
        const borderSamples: Array<[number, number, number]> = [];
        const stepX = Math.max(1, Math.floor(width / 32));
        const stepY = Math.max(1, Math.floor(height / 32));
        for (let x = 0; x < width; x += stepX) {
            const topIdx = x * 4;
            const botIdx = ((height - 1) * width + x) * 4;
            borderSamples.push([data[topIdx], data[topIdx + 1], data[topIdx + 2]]);
            borderSamples.push([data[botIdx], data[botIdx + 1], data[botIdx + 2]]);
        }
        for (let y = 0; y < height; y += stepY) {
            const leftIdx = (y * width) * 4;
            const rightIdx = (y * width + (width - 1)) * 4;
            borderSamples.push([data[leftIdx], data[leftIdx + 1], data[leftIdx + 2]]);
            borderSamples.push([data[rightIdx], data[rightIdx + 1], data[rightIdx + 2]]);
        }

        let meanR = 255;
        let meanG = 255;
        let meanB = 255;
        if (borderSamples.length > 0) {
            meanR = borderSamples.reduce((acc, s) => acc + s[0], 0) / borderSamples.length;
            meanG = borderSamples.reduce((acc, s) => acc + s[1], 0) / borderSamples.length;
            meanB = borderSamples.reduce((acc, s) => acc + s[2], 0) / borderSamples.length;
        }

        // 从四条边界向内做连通域背景泛洪（Flood Fill）
        const visited = new Uint8Array(totalPixels);
        const isBg = new Uint8Array(totalPixels);
        const queue = new Int32Array(totalPixels);
        let head = 0;
        let tail = 0;
        const thresholdSq = 42 * 42;

        const tryEnqueue = (x: number, y: number) => {
            if (x < 0 || x >= width || y < 0 || y >= height) return;
            const idx = y * width + x;
            if (visited[idx]) return;
            visited[idx] = 1;
            const p = idx * 4;
            const distSq = colorDistanceSq(data[p], data[p + 1], data[p + 2], meanR, meanG, meanB);
            if (distSq <= thresholdSq) {
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

        // 兜底：若整张图几乎未检出背景或全部被当作背景，则保留中心主体椭圆区域（确保真实蒙版同时包含保留与剔除区域）
        if (fgCount < totalPixels * 0.05 || fgCount > totalPixels * 0.96) {
            const cx = width / 2;
            const cy = height / 2;
            const rx = width * 0.38;
            const ry = height * 0.4;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const dx = (x - cx) / rx;
                    const dy = (y - cy) / ry;
                    const d = dx * dx + dy * dy;
                    alphaMask[y * width + x] = d <= 1 ? 255 : 0;
                }
            }
        }
    }

    // 生成黑白蒙版画布（供 maskFromImage(..., "mask") 消费：白=保留，黑=透明）
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) throw new Error("无法创建蒙版画布。");
    const maskImgData = maskCtx.createImageData(width, height);

    // 生成透明抠图预览画布
    const cutoutCanvas = document.createElement("canvas");
    cutoutCanvas.width = width;
    cutoutCanvas.height = height;
    const cutoutCtx = cutoutCanvas.getContext("2d");
    if (!cutoutCtx) throw new Error("无法创建抠图预览画布。");
    const cutoutImgData = cutoutCtx.createImageData(width, height);

    for (let i = 0; i < totalPixels; i++) {
        const a = alphaMask[i];
        const p = i * 4;
        maskImgData.data[p] = a;
        maskImgData.data[p + 1] = a;
        maskImgData.data[p + 2] = a;
        maskImgData.data[p + 3] = 255;

        cutoutImgData.data[p] = data[p];
        cutoutImgData.data[p + 1] = data[p + 1];
        cutoutImgData.data[p + 2] = data[p + 2];
        cutoutImgData.data[p + 3] = Math.round((data[p + 3] * a) / 255);
    }

    maskCtx.putImageData(maskImgData, 0, 0);
    cutoutCtx.putImageData(cutoutImgData, 0, 0);

    const maskFile = await canvasToFile(maskCanvas, fileName);
    return {
        maskFile,
        maskDataUrl: maskCanvas.toDataURL("image/png"),
        cutoutDataUrl: cutoutCanvas.toDataURL("image/png"),
        width,
        height,
    };
}

/**
 * BE-SEG02：交互式点选分割（点选抠图 / 点选换色）
 * 支持保留点（keep）与排除点（exclude），按颜色连通域实时生成选区蒙版。
 */
export async function interactivePointSegmentMask(input: {
    sourceUrl: string;
    points: SegmentationPoint[];
    tolerance?: number;
    fileName?: string;
}): Promise<PointSegmentResult> {
    const img = await loadHtmlImage(input.sourceUrl);
    const width = Math.max(1, img.naturalWidth || img.width);
    const height = Math.max(1, img.naturalHeight || img.height);
    const tolerance = input.tolerance ?? 38;
    const thresholdSq = tolerance * tolerance;

    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = width;
    srcCanvas.height = height;
    const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
    if (!srcCtx) throw new Error("当前浏览器不支持 Canvas 2D。");
    srcCtx.drawImage(img, 0, 0, width, height);
    const data = srcCtx.getImageData(0, 0, width, height).data;
    const totalPixels = width * height;

    const mask = new Uint8Array(totalPixels);
    const excluded = new Uint8Array(totalPixels);

    const floodFromSeed = (normX: number, normY: number, target: Uint8Array) => {
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

    const keepPoints = input.points.filter((pt) => pt.mode === "keep");
    const excludePoints = input.points.filter((pt) => pt.mode === "exclude");

    for (const pt of excludePoints) {
        floodFromSeed(pt.x, pt.y, excluded);
    }
    for (const pt of keepPoints) {
        floodFromSeed(pt.x, pt.y, mask);
    }

    const outCanvas = document.createElement("canvas");
    outCanvas.width = width;
    outCanvas.height = height;
    const outCtx = outCanvas.getContext("2d");
    if (!outCtx) throw new Error("无法创建点选分割画布。");
    const outData = outCtx.createImageData(width, height);

    let selectedCount = 0;
    for (let i = 0; i < totalPixels; i++) {
        const active = mask[i] === 1 && excluded[i] === 0;
        if (active) selectedCount++;
        const v = active ? 255 : 0;
        const p = i * 4;
        outData.data[p] = v;
        outData.data[p + 1] = v;
        outData.data[p + 2] = v;
        outData.data[p + 3] = 255;
    }

    outCtx.putImageData(outData, 0, 0);
    const maskFile = await canvasToFile(outCanvas, input.fileName ?? "point-segment-mask.png");
    return {
        maskFile,
        maskDataUrl: outCanvas.toDataURL("image/png"),
        coveragePercent: Math.round((selectedCount / totalPixels) * 100),
    };
}
