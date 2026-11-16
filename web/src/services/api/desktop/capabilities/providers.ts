import type { AiConfig, VideoHttpConfig } from "@/stores/use-config-store";

import { requestBlob, requestJson, requestStream, DesktopRequestError } from "../http";
import { desktopServiceToken, desktopServiceUrl } from "../runtime";

export type ProviderImageResult = { id: string; dataUrl: string; url?: string };
export type ProviderToolCall = { id: string; type: "function"; function: { name: string; arguments: string }; thoughtSignature?: string };
export type ProviderTextResult = { content: string; toolCalls: ProviderToolCall[] };
export type ProviderVideoResult = { url?: string; storageKey?: string; fileName?: string; mimeType?: string; bytes?: number };
export type ProviderVideoState = { status: "pending" } | { status: "completed"; result: ProviderVideoResult } | { status: "failed"; error: string };
export type ProviderVideoTask = { id: string; provider: "openai" | "gemini" | "http" | "plugin"; model: string };

export type VideoCreatePayload = {
    config: AiConfig;
    model: string;
    taskModel: string;
    prompt: string;
    inlineImages: string[];
    imageFiles: string[];
    videos: Array<{ name: string; type: string; publicUrl?: string; file?: string }>;
    audios: Array<{ name: string; type: string; file?: string }>;
    videoHttp?: VideoHttpConfig;
    translation?: unknown;
};

export async function requestImageGeneration(input: {
    config: AiConfig;
    prompt: string;
    count: number;
    quality: string;
    size: string;
    background: string;
    signal?: AbortSignal;
}): Promise<ProviderImageResult[]> {
    const payload = await requestJson<{ results: ProviderImageResult[] }>("/api/providers/image/generate", {
        method: "POST",
        body: {
            config: input.config,
            prompt: input.prompt,
            count: input.count,
            quality: input.quality,
            size: input.size,
            background: input.background,
        },
        signal: input.signal,
    });
    return payload.results || [];
}

export async function requestImageEdit(input: {
    config: AiConfig;
    prompt: string;
    references: string[];
    count: number;
    quality: string;
    size: string;
    background: string;
    signal?: AbortSignal;
}): Promise<ProviderImageResult[]> {
    const payload = await requestJson<{ results: ProviderImageResult[] }>("/api/providers/image/edit", {
        method: "POST",
        body: {
            config: input.config,
            prompt: input.prompt,
            references: input.references,
            count: input.count,
            quality: input.quality,
            size: input.size,
            background: input.background,
        },
        signal: input.signal,
    });
    return payload.results || [];
}

export async function requestTextChat(input: {
    config: AiConfig;
    messages: unknown[];
    onDelta?: (text: string) => void;
    signal?: AbortSignal;
}): Promise<ProviderTextResult> {
    let result: ProviderTextResult | null = null;
    let streamError = "";
    await requestStream("/api/providers/text/chat", {
        method: "POST",
        body: { config: input.config, messages: input.messages, stream: true },
        signal: input.signal,
        onLine: (line) => {
            let event: { delta?: string; done?: boolean; content?: string; toolCalls?: ProviderToolCall[]; error?: string };
            try {
                event = JSON.parse(line) as typeof event;
            } catch {
                return;
            }
            if (event.error) streamError = event.error;
            else if (event.delta !== undefined) input.onDelta?.(event.delta);
            else if (event.done) result = { content: event.content || "", toolCalls: event.toolCalls || [] };
        },
    });
    if (streamError) throw new Error(streamError);
    if (!result) throw new Error("本地服务没有返回文本结果");
    return result;
}

export async function requestVideoCreate(payload: VideoCreatePayload, files: Array<{ field: string; file: File }>, signal?: AbortSignal): Promise<ProviderVideoTask> {
    const form = new FormData();
    form.set("payload", JSON.stringify(payload));
    files.forEach(({ field, file }) => form.set(field, file, file.name));
    const result = await requestJson<{ task: ProviderVideoTask }>("/api/providers/video/create", { method: "POST", body: form, signal });
    return result.task;
}

export async function requestVideoPoll(input: {
    config: AiConfig;
    videoHttp?: VideoHttpConfig;
    task: ProviderVideoTask;
    signal?: AbortSignal;
}): Promise<ProviderVideoState> {
    const result = await requestJson<{ state: ProviderVideoState }>("/api/providers/video/poll", {
        method: "POST",
        body: { config: input.config, videoHttp: input.videoHttp, task: input.task },
        signal: input.signal,
    });
    return result.state;
}

export async function requestAudioGeneration(input: {
    config: AiConfig;
    prompt: string;
    voice: string;
    format: string;
    speed: string;
    instructions: string;
    signal?: AbortSignal;
}): Promise<Blob> {
    return requestBlob("/api/providers/audio/generate", {
        method: "POST",
        body: {
            config: input.config,
            prompt: input.prompt,
            voice: input.voice,
            format: input.format,
            speed: input.speed,
            instructions: input.instructions,
        },
        signal: input.signal,
    });
}

export async function requestModels(input: { baseUrl: string; apiKey: string; apiFormat: string }): Promise<string[]> {
    const result = await requestJson<{ models: string[] }>("/api/providers/models", { method: "POST", body: input });
    return result.models || [];
}

export type PluginResponseType = "json" | "blob" | "text" | "arraybuffer";

function base64Json(value: unknown) {
    const bytes = new TextEncoder().encode(JSON.stringify(value || {}));
    let binary = "";
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
}

function escapeFormName(value: string) {
    return value.replace(/"/g, '\\"').replace(/\r?\n/g, " ");
}

/** 浏览器 FormData 的 boundary 不在 JS 里可见；自己序列化，服务端才能原样转发。 */
function serializeFormData(form: FormData) {
    const boundary = `----InfiniteCanvasForm${crypto.randomUUID().replace(/-/g, "")}`;
    const parts: BlobPart[] = [];
    for (const [name, value] of form.entries()) {
        if (typeof value === "string") {
            parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${escapeFormName(name)}"\r\n\r\n${value}\r\n`);
            continue;
        }
        const filename = escapeFormName(value.name || "blob");
        parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${escapeFormName(name)}"; filename="${filename}"\r\nContent-Type: ${value.type || "application/octet-stream"}\r\n\r\n`, value, "\r\n");
    }
    parts.push(`--${boundary}--\r\n`);
    return { body: new Blob(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

function bodyOfPluginRequest(body: unknown, headers: Record<string, string>) {
    if (body === undefined || body === null) return { body: undefined, contentType: "" };
    if (typeof FormData !== "undefined" && body instanceof FormData) {
        const serialized = serializeFormData(body);
        return { body: serialized.body, contentType: serialized.contentType };
    }
    if (typeof body === "string") return { body, contentType: "text/plain; charset=utf-8" };
    if (body instanceof Blob) return { body, contentType: body.type || "application/octet-stream" };
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return { body: body as BodyInit, contentType: "application/octet-stream" };
    if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
        return { body: JSON.stringify(body), contentType: "application/json" };
    }
    return { body: JSON.stringify(body), contentType: "" };
}

function pluginError(status: number, data: unknown): Error {
    const message =
        typeof data === "string" && data
            ? data
            : data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string"
              ? String((data as { message: string }).message)
              : `上游请求失败（HTTP ${status}）`;
    const error = new Error(message) as Error & { status?: number; response?: { status: number; data: unknown } };
    error.name = "PluginRequestError";
    error.status = status;
    error.response = { status, data };
    return error;
}

export async function pluginRequest(input: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: unknown;
    responseType?: PluginResponseType;
    signal?: AbortSignal;
}): Promise<unknown> {
    const headers = { ...input.headers };
    const { body, contentType } = bodyOfPluginRequest(input.body, headers);
    if (contentType && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) headers["content-type"] = contentType;
    const responseType = input.responseType || "json";
    const query = new URLSearchParams({
        url: input.url,
        method: input.method,
        headers: base64Json(headers),
        responseType,
    });
    const response = await fetch(`${desktopServiceUrl()}/api/providers/plugin/request?${query}`, {
        method: "POST",
        headers: { authorization: `Bearer ${desktopServiceToken()}` },
        body: body as BodyInit | undefined,
        signal: input.signal,
    });
    if (responseType === "blob" || responseType === "arraybuffer") {
        if (!response.ok) throw new DesktopRequestError(await response.text().catch(() => ""), response.status);
        const bytes = await response.arrayBuffer();
        return responseType === "blob" ? new Blob([bytes], { type: response.headers.get("x-upstream-content-type") || "application/octet-stream" }) : bytes;
    }
    if (!response.ok) throw new DesktopRequestError(await response.text().catch(() => ""), response.status);
    const payload = (await response.json()) as { status: number; data: unknown };
    if (payload.status >= 400) throw pluginError(payload.status, payload.data);
    return payload.data;
}
