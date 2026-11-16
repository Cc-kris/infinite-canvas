import { requestBlob, uploadBlob } from "../http";

export type TempMedia = { id: string; bytes: number };

export type ConcatClipInput = {
    id: string;
    name: string;
    mimeType: string;
    startMs: number;
    endMs: number;
    width?: number;
    height?: number;
};

export function uploadTempMedia(blob: Blob, name: string, signal?: AbortSignal) {
    return uploadBlob<TempMedia>(`/api/media/upload?name=${encodeURIComponent(name)}`, blob, { filename: name, signal });
}

export function requestExtractedAudio(videoId: string, signal?: AbortSignal) {
    return requestBlob("/api/media/extract-audio", { body: { videoId }, signal });
}

export function requestConcatVideo(
    input: { clips: ConcatClipInput[]; videoTime: number; videoRatio: string },
    signal?: AbortSignal,
) {
    return requestBlob("/api/media/concat", { body: input, signal });
}

export function requestMuxVideo(
    input: { videoId: string; audioId: string; subtitles: string; outputRatio?: string },
    signal?: AbortSignal,
) {
    return requestBlob("/api/media/mux", { body: input, signal });
}
