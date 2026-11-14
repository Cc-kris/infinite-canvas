import { randomId } from "@/lib/utils";
import { SCENE_TRANSFORM_LIMITS } from "@/features/tools/registry/new-replace-bg-v2";
import { affineFromTriangles, homographyFromQuad } from "@/features/tools/registry/replace-goods";

export type ProductBgPoint = { x: number; y: number };
export type ProductBgTransform = { scale: number; rotate: number; flipX: boolean; flipY: boolean; quad?: ProductBgPoint[] };
export type ProductBgElement = { id: string; assetId: string; url: string; name: string; x: number; y: number; w: number; ratio: number; transform: ProductBgTransform };
export type ProductBgLayout = {
    sceneId: string;
    elements: ProductBgElement[];
    goodsOnTop: boolean;
    goodsTransform: ProductBgTransform;
    bgTransform: ProductBgTransform;
    bgOffset: ProductBgPoint;
    replacementRegion: ProductBgPoint[];
};

export const DEFAULT_PRODUCT_BG_TRANSFORM: ProductBgTransform = { scale: 1, rotate: 0, flipX: false, flipY: false };
export const DEFAULT_PRODUCT_BG_LAYOUT: ProductBgLayout = {
    sceneId: "",
    elements: [],
    goodsOnTop: true,
    goodsTransform: { ...DEFAULT_PRODUCT_BG_TRANSFORM },
    bgTransform: { ...DEFAULT_PRODUCT_BG_TRANSFORM },
    bgOffset: { x: 0, y: 0 },
    replacementRegion: [],
};

const finite = (value: unknown, fallback: number, min: number, max: number) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};
const point = (value: unknown, fallback: ProductBgPoint) => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return { x: finite(item.x, fallback.x, -1, 2), y: finite(item.y, fallback.y, -1, 2) };
};
export const productBgTransform = (value: unknown): ProductBgTransform => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const quad = Array.isArray(item.quad) && item.quad.length === 4 ? item.quad.map((corner) => point(corner, { x: 0, y: 0 })) : undefined;
    return {
        scale: finite(item.scale, 1, SCENE_TRANSFORM_LIMITS.scale.min, 3),
        rotate: finite(item.rotate, 0, -180, 180),
        flipX: item.flipX === true,
        flipY: item.flipY === true,
        ...(quad ? { quad } : {}),
    };
};

/** 草稿只保存资产 id 和布局，图片字节仍由工具资产库管理。 */
export function parseProductBgLayout(value: unknown): ProductBgLayout {
    const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const elements = Array.isArray(raw.elements) ? raw.elements.flatMap((entry): ProductBgElement[] => {
        if (!entry || typeof entry !== "object") return [];
        const item = entry as Record<string, unknown>;
        if (typeof item.assetId !== "string" || typeof item.url !== "string") return [];
        return [{
            id: typeof item.id === "string" ? item.id : randomId(),
            assetId: item.assetId,
            url: item.url,
            name: typeof item.name === "string" ? item.name : "元素",
            x: finite(item.x, 0.5, -1, 2),
            y: finite(item.y, 0.5, -1, 2),
            w: finite(item.w, 0.3, 0.03, 1.5),
            ratio: finite(item.ratio, 1, 0.01, 100),
            transform: productBgTransform(item.transform),
        }];
    }) : [];
    const region = Array.isArray(raw.replacementRegion) && raw.replacementRegion.length === 4
        ? raw.replacementRegion.map((corner) => point(corner, { x: 0, y: 0 }))
        : [];
    return {
        sceneId: typeof raw.sceneId === "string" ? raw.sceneId : "",
        elements,
        goodsOnTop: raw.goodsOnTop !== false,
        goodsTransform: productBgTransform(raw.goodsTransform),
        bgTransform: productBgTransform(raw.bgTransform),
        bgOffset: point(raw.bgOffset, { x: 0, y: 0 }),
        replacementRegion: region,
    };
}

/** 统一处理四个角的透视拖动。商品与元素预览、导出使用同一组归一化角点。 */
export function moveProductBgCorner(transform: ProductBgTransform, index: number, target: ProductBgPoint): ProductBgTransform {
    if (!transform.quad || index < 0 || index > 3) return transform;
    const quad = transform.quad.map((corner, cornerIndex) => cornerIndex === index ? { x: finite(target.x, corner.x, -1, 2), y: finite(target.y, corner.y, -1, 2) } : corner);
    return { ...transform, quad };
}

export function flipProductBgQuad(transform: ProductBgTransform, axis: "x" | "y"): ProductBgTransform {
    if (!transform.quad) return transform;
    const indices = axis === "x" ? [1, 0, 3, 2] : [3, 2, 1, 0];
    return { ...transform, quad: indices.map((index) => transform.quad![index]!) };
}

export function productBgBaseQuad(transform: ProductBgTransform): ProductBgPoint[] {
    const radians = transform.rotate * Math.PI / 180;
    return [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }].map(({ x, y }) => {
        const px = (x - 0.5) * (transform.flipX ? -transform.scale : transform.scale);
        const py = (y - 0.5) * (transform.flipY ? -transform.scale : transform.scale);
        return { x: 0.5 + px * Math.cos(radians) - py * Math.sin(radians), y: 0.5 + px * Math.sin(radians) + py * Math.cos(radians) };
    });
}

/** 单应矩阵使用归一化角点；CSS 的位移和透视分母必须换算成当前图层的实际像素。 */
export function productBgPerspectiveMatrix(quad: ProductBgPoint[], width: number, height: number): string {
    const matrix = homographyFromQuad({ topLeft: quad[0]!, topRight: quad[1]!, bottomRight: quad[2]!, bottomLeft: quad[3]! });
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    return `matrix3d(${matrix[0]},${matrix[3]},0,${matrix[6]! / w},${matrix[1]},${matrix[4]},0,${matrix[7]! / h},0,0,1,0,${matrix[2]! * w},${matrix[5]! * h},0,${matrix[8]})`;
}

/** 仿射一次绘制，透视逐行采样；预览与导出共用同一四角数据。 */
export function drawProductBgLayer(context: CanvasRenderingContext2D, image: CanvasImageSource, width: number, height: number, transform: ProductBgTransform, mask?: CanvasImageSource) {
    const quad = transform.quad;
    if (!quad) {
        drawProductBgLayer(context, image, width, height, { ...transform, quad: productBgBaseQuad(transform) }, mask);
        return;
    }
    const matrix = homographyFromQuad({ topLeft: quad[0]!, topRight: quad[1]!, bottomRight: quad[2]!, bottomLeft: quad[3]! });
    const project = (x: number, y: number) => {
        const w = matrix[6]! * x + matrix[7]! * y + matrix[8]!;
        return { x: (matrix[0]! * x + matrix[1]! * y + matrix[2]!) / w * width, y: (matrix[3]! * x + matrix[4]! * y + matrix[5]!) / w * height };
    };
    const draw = (source: [ProductBgPoint, ProductBgPoint, ProductBgPoint], destination: [ProductBgPoint, ProductBgPoint, ProductBgPoint], outline: ProductBgPoint[]) => {
        const affine = affineFromTriangles(source, destination);
        context.save();
        context.beginPath();
        outline.forEach((point, corner) => corner ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
        context.closePath();
        context.clip();
        context.setTransform(affine.a, affine.b, affine.d, affine.e, affine.c, affine.f);
        context.drawImage(image, 0, 0, width, height);
        if (mask) {
            context.globalCompositeOperation = "destination-in";
            context.drawImage(mask, 0, 0, width, height);
        }
        context.restore();
    };
    if (Math.abs(matrix[6]!) < 1e-9 && Math.abs(matrix[7]!) < 1e-9) {
        const corners = [project(0, 0), project(1, 0), project(1, 1), project(0, 1)];
        draw([{ x: 0, y: 0 }, { x: width, y: 0 }, { x: 0, y: height }], [corners[0]!, corners[1]!, corners[3]!], corners);
        return;
    }
    /* 每行按同一单应矩阵贴图；两三角形拼接会在透视对角线产生错误接缝。 */
    for (let row = 0; row < height; row += 1) {
        const y0 = row / height;
        const y1 = (row + 1) / height;
        const topLeft = project(0, y0);
        const topRight = project(1, y0);
        const bottomLeft = project(0, y1);
        const bottomRight = project(1, y1);
        const destination: [ProductBgPoint, ProductBgPoint, ProductBgPoint] = [topLeft, bottomRight, bottomLeft];
        draw([{ x: 0, y: row }, { x: width, y: row + 1 }, { x: 0, y: row + 1 }], destination, [topLeft, topRight, bottomRight, bottomLeft]);
    }
}

/** 原图 → 已按商品蒙版抠好的真实像素。黑白蒙版按亮度转 alpha，透明蒙版沿用 alpha。 */
export function cutoutProductBgImage(image: CanvasImageSource, mask: CanvasImageSource | undefined, width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0, width, height);
    if (mask) {
        const layer = document.createElement("canvas");
        layer.width = width;
        layer.height = height;
        const maskContext = layer.getContext("2d", { willReadFrequently: true })!;
        maskContext.drawImage(mask, 0, 0, width, height);
        const pixels = maskContext.getImageData(0, 0, width, height);
        for (let index = 0; index < pixels.data.length; index += 4) {
            const alpha = pixels.data[index + 3]!;
            const luminance = Math.round((pixels.data[index]! + pixels.data[index + 1]! + pixels.data[index + 2]!) / 3 * alpha / 255);
            pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = 255;
            pixels.data[index + 3] = luminance;
        }
        maskContext.putImageData(pixels, 0, 0);
        context.globalCompositeOperation = "destination-in";
        context.drawImage(layer, 0, 0);
    }
    return canvas;
}

export function defaultProductBgRegion(): ProductBgPoint[] {
    return [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.75, y: 0.75 }, { x: 0.25, y: 0.75 }];
}

export function drawProductBgReplacementRegion(context: CanvasRenderingContext2D, region: ProductBgPoint[], width: number, height: number) {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    const path = new Path2D();
    region.forEach((point, index) => index ? path.lineTo(point.x * width, point.y * height) : path.moveTo(point.x * width, point.y * height));
    path.closePath();
    context.fillStyle = "#000";
    context.fill(path);
}
