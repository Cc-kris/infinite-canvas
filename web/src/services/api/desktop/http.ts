import { desktopServiceToken, desktopServiceUrl } from "./runtime";

export type DesktopRequestOptions = {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
    /** Only applied when the caller passes it explicitly. */
    timeoutMs?: number;
};

export type DesktopStreamOptions = DesktopRequestOptions & {
    onChunk?: (chunk: string) => void;
    /** Line callback for SSE (`data:` prefix is stripped) and NDJSON responses. */
    onLine?: (line: string) => void;
};

export class DesktopRequestError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(message: string, status: number, code = "request-failed") {
        super(message);
        this.name = "DesktopRequestError";
        this.status = status;
        this.code = code;
    }
}

function urlOf(path: string) {
    return `${desktopServiceUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

function headersOf(extra?: Record<string, string>) {
    return { authorization: `Bearer ${desktopServiceToken()}`, ...extra };
}

function bodyOf(body: unknown, headers: Record<string, string>) {
    if (body === undefined || body === null) return undefined;
    if (typeof body === "string" || body instanceof Blob || body instanceof FormData || body instanceof ReadableStream) return body as BodyInit;
    headers["content-type"] = headers["content-type"] || "application/json";
    return JSON.stringify(body);
}

function abortScope(signal?: AbortSignal, timeoutMs?: number) {
    if (!timeoutMs) return { signal, dispose: () => undefined };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const forward = () => controller.abort();
    signal?.addEventListener("abort", forward, { once: true });
    return {
        signal: controller.signal,
        dispose: () => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", forward);
        },
    };
}

async function throwIfFailed(response: Response): Promise<never> {
    const text = await response.text().catch(() => "");
    let message = text;
    let code = "request-failed";
    try {
        const payload = JSON.parse(text) as { error?: { code?: string; message?: string } };
        if (payload?.error?.message) message = payload.error.message;
        if (payload?.error?.code) code = payload.error.code;
    } catch {
        /* 非 JSON 错误体直接用原文 */
    }
    throw new DesktopRequestError(message || `本地服务请求失败（HTTP ${response.status}）`, response.status, code);
}

export async function requestJson<T = unknown>(path: string, options: DesktopRequestOptions = {}): Promise<T> {
    const headers = headersOf({ accept: "application/json", ...options.headers });
    const scope = abortScope(options.signal, options.timeoutMs);
    try {
        const response = await fetch(urlOf(path), {
            method: options.method || (options.body === undefined ? "GET" : "POST"),
            headers,
            body: bodyOf(options.body, headers),
            signal: scope.signal,
        });
        if (!response.ok) await throwIfFailed(response);
        if (response.status === 204) return undefined as T;
        const text = await response.text();
        return (text ? JSON.parse(text) : undefined) as T;
    } finally {
        scope.dispose();
    }
}

export async function requestText(path: string, options: DesktopRequestOptions = {}): Promise<string> {
    const headers = headersOf({ accept: "text/plain", ...options.headers });
    const scope = abortScope(options.signal, options.timeoutMs);
    try {
        const response = await fetch(urlOf(path), {
            method: options.method || (options.body === undefined ? "GET" : "POST"),
            headers,
            body: bodyOf(options.body, headers),
            signal: scope.signal,
        });
        if (!response.ok) await throwIfFailed(response);
        return await response.text();
    } finally {
        scope.dispose();
    }
}

export async function requestBlob(path: string, options: DesktopRequestOptions = {}): Promise<Blob> {
    const headers = headersOf(options.headers);
    const scope = abortScope(options.signal, options.timeoutMs);
    try {
        const response = await fetch(urlOf(path), {
            method: options.method || (options.body === undefined ? "GET" : "POST"),
            headers,
            body: bodyOf(options.body, headers),
            signal: scope.signal,
        });
        if (!response.ok) await throwIfFailed(response);
        return await response.blob();
    } finally {
        scope.dispose();
    }
}

/** Streams a response body chunk by chunk; also offers newline-delimited callbacks for SSE/NDJSON. */
export async function requestStream(path: string, options: DesktopStreamOptions = {}): Promise<void> {
    const headers = headersOf({ accept: "text/event-stream, application/x-ndjson, text/plain", ...options.headers });
    const scope = abortScope(options.signal, options.timeoutMs);
    try {
        const response = await fetch(urlOf(path), {
            method: options.method || "POST",
            headers,
            body: bodyOf(options.body, headers),
            signal: scope.signal,
        });
        if (!response.ok) await throwIfFailed(response);
        if (!response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const emitLine = (value: string) => {
            const line = value.replace(/\r$/, "");
            if (!line.trim()) return;
            options.onLine?.(line.startsWith("data:") ? line.slice(5).trimStart() : line);
        };
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            options.onChunk?.(chunk);
            if (!options.onLine) continue;
            buffer += chunk;
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            lines.forEach(emitLine);
        }
        buffer += decoder.decode();
        if (options.onLine) emitLine(buffer);
    } finally {
        scope.dispose();
    }
}

/** Streams a Blob to the service without base64 conversion. */
export async function uploadBlob<T = unknown>(
    path: string,
    blob: Blob,
    options: { filename?: string; contentType?: string; method?: "POST" | "PUT"; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
    const headers = headersOf({
        "content-type": options.contentType || blob.type || "application/octet-stream",
        ...(options.filename ? { "x-file-name": encodeURIComponent(options.filename) } : {}),
        accept: "application/json",
    });
    const scope = abortScope(options.signal, options.timeoutMs);
    try {
        const response = await fetch(urlOf(path), {
            method: options.method || "POST",
            headers,
            body: blob,
            signal: scope.signal,
        });
        if (!response.ok) await throwIfFailed(response);
        const text = await response.text();
        return (text ? JSON.parse(text) : undefined) as T;
    } finally {
        scope.dispose();
    }
}
