import { requestBlob, requestJson, uploadBlob } from "../http";

export type TempImage = { id: string; bytes: number };

export type SegmentationPointInput = { x: number; y: number; mode: "keep" | "exclude" };

export type AutoSegmentResponse = { maskDataUrl: string; cutoutDataUrl: string; width: number; height: number };

export type PointSegmentResponse = { maskDataUrl: string; coveragePercent: number };

export async function uploadImageSource(url: string, name: string, signal?: AbortSignal) {
    let blob: Blob;
    try {
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error();
        blob = await response.blob();
    } catch {
        throw new Error("图片加载失败，无法执行图像分割。");
    }
    if (!blob.size) throw new Error("图片为空，无法执行图像分割。");
    return uploadBlob<TempImage>(`/api/media/upload?name=${encodeURIComponent(name)}`, blob, { filename: name, signal });
}

export function requestAutoSegment(sourceId: string, fileName: string, signal?: AbortSignal) {
    return requestJson<AutoSegmentResponse>("/api/imaging/auto-segment", { body: { sourceId, fileName }, signal });
}

export function requestPointSegment(sourceId: string, points: SegmentationPointInput[], tolerance: number, signal?: AbortSignal) {
    return requestJson<PointSegmentResponse>("/api/imaging/point-segment", { body: { sourceId, points, tolerance }, signal });
}

export function requestCompositeSubject(sourceId: string, maskId: string | undefined, background: "white" | "transparent", signal?: AbortSignal) {
    return requestBlob("/api/imaging/composite", { body: { sourceId, maskId, background }, signal });
}
