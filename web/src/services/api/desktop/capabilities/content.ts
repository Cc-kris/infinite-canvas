import type { AiConfig } from "@/stores/use-config-store";

import { requestBlob, requestJson } from "../http";

export type ContentPage = { title: string; content: string; finalUrl: string };
export type ContentProductLink = { title: string; sellingPoints: string[]; images: string[]; finalUrl: string };
export type ContentTranscription = { text: string; language?: string; segments: Array<{ startMs: number; endMs: number; text: string }> };
export type ContentSliceModule = { id: string; label: string; dataUrl: string; width: number; height: number; yStart: number; yEnd: number };

export function requestContentPage(url: string, signal?: AbortSignal) {
    return requestJson<ContentPage>("/api/content/page", { body: { url }, signal });
}

export function requestContentProductLink(url: string, signal?: AbortSignal) {
    return requestJson<ContentProductLink>("/api/content/product-link", { body: { url }, signal });
}

export async function requestContentText(input: { config: AiConfig; messages: unknown[]; system?: string; signal?: AbortSignal }) {
    const payload = await requestJson<{ text: string }>("/api/content/text", {
        body: { config: input.config, messages: input.messages, system: input.system },
        signal: input.signal,
    });
    return payload.text || "";
}

export function requestContentTranscription(input: { config: AiConfig; audioId: string; sourceLanguage: string; mimeType?: string; signal?: AbortSignal }) {
    return requestJson<ContentTranscription>("/api/content/transcribe", {
        body: { config: input.config, audioId: input.audioId, sourceLanguage: input.sourceLanguage, mimeType: input.mimeType },
        signal: input.signal,
    });
}

export function requestContentVideo(url: string, signal?: AbortSignal) {
    return requestBlob("/api/content/fetch-video", { body: { url }, signal });
}

export async function requestContentSlices(imageId: string, maxModules: number | undefined, signal?: AbortSignal) {
    const payload = await requestJson<{ modules: ContentSliceModule[] }>("/api/content/slice", { body: { imageId, maxModules }, signal });
    return payload.modules || [];
}

export function requestContentVision(input: {
    config: AiConfig;
    imageUrl: string;
    currentText?: string;
    categories?: ReadonlyArray<{ id: string; label: string }>;
    signal?: AbortSignal;
}) {
    return requestJson<{ productName: string; categoryId?: string; sellingPoints: string[]; audience: string; marketLanguage: string; formattedText: string }>("/api/content/vision", {
        body: {
            config: input.config,
            imageUrl: input.imageUrl,
            currentText: input.currentText,
            categories: input.categories,
        },
        signal: input.signal,
    });
}

export async function requestContentCopywrite(input: {
    config: AiConfig;
    mode: "sale-script" | "video-prompt" | "outpainting-prompt";
    productInfo?: string;
    currentDraft?: string;
    durationSeconds?: number;
    language?: string;
    imageUrl?: string;
    signal?: AbortSignal;
}) {
    const payload = await requestJson<{ text: string }>("/api/content/copywrite", {
        body: {
            config: input.config,
            mode: input.mode,
            productInfo: input.productInfo,
            currentDraft: input.currentDraft,
            durationSeconds: input.durationSeconds,
            language: input.language,
            imageUrl: input.imageUrl,
        },
        signal: input.signal,
    });
    return payload.text || "";
}
