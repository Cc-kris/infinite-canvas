/**
 * 上游模型请求的公共能力：URL/鉴权头构造、超时与取消、错误解析、网关重试。
 * 所有请求都走 ctx.fetch（主进程注入的系统代理 fetch），渲染层不再直连上游。
 */

export const TRANSIENT_GATEWAY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525]);

export class UpstreamError extends Error {
    constructor(message, status = 0, detail = "") {
        super(message);
        this.name = "UpstreamError";
        this.status = status;
        this.detail = detail;
    }
}

export function isRecord(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function stringValue(value) {
    return typeof value === "string" ? value : "";
}

/** 与渲染层 readApiErrorMessage 等价：兼容 {msg} / {message} / {error:{message}} / 序列化 JSON / HTML。 */
export function readApiErrorMessage(value) {
    if (!value) return "";
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            const inner = readApiErrorMessage(parsed) || value;
            if (inner === value && typeof parsed === "object" && Object.keys(parsed).length === 0) return "";
            return inner;
        } catch {
            if (/<[a-z][\s\S]*>/i.test(value)) return `上游返回了 HTML 错误页：${value.slice(0, 80)}...`;
            return value;
        }
    }
    if (typeof value !== "object") return "";
    const payload = value;
    const errorMsg = typeof payload.error === "string" ? payload.error : payload.error?.message;
    return readApiErrorMessage(payload.msg) || readApiErrorMessage(payload.message) || readApiErrorMessage(errorMsg) || readApiErrorMessage(payload.detail) || "";
}

export function statusMessage(status) {
    if (status === 401 || status === 403) return "认证失败，请检查 API Key";
    if (status === 429) return "请求过于频繁，请稍后重试";
    if (status === 404) return "接口不存在";
    if (status === 502) return "上游网关错误";
    if (status === 503) return "上游服务繁忙";
    return status ? `请求失败（HTTP ${status}）` : "";
}

export function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || "").trim().replace(/\/+$/, "");
}

/** 渠道 baseUrl → 完整接口地址（baseUrl 已含 /v1 时不再重复拼）。 */
export function buildApiUrl(baseUrl, path) {
    const normalized = normalizeBaseUrl(baseUrl);
    const apiBase = normalized.toLowerCase().endsWith("/v1") ? normalized : `${normalized}/v1`;
    return `${apiBase}${path}`;
}

export function geminiBaseUrl(baseUrl) {
    const normalized = normalizeBaseUrl(baseUrl);
    const lower = normalized.toLowerCase();
    return lower.endsWith("/v1") || lower.endsWith("/v1beta") ? normalized : `${normalized}/v1beta`;
}

export function geminiModelName(model) {
    return String(model || "").trim().replace(/^models\//, "");
}

export function geminiApiUrl(config, action) {
    const base = geminiBaseUrl(config.baseUrl);
    return action ? `${base}/models/${encodeURIComponent(geminiModelName(config.model))}:${action}` : `${base}/models`;
}

export function openAiHeaders(config, contentType) {
    return { Authorization: `Bearer ${config.apiKey}`, ...(contentType ? { "Content-Type": contentType } : {}) };
}

export function geminiHeaders(config) {
    return { "x-goog-api-key": config.apiKey, "Content-Type": "application/json" };
}

export function withSystemPrompt(config, prompt) {
    const systemPrompt = String(config.systemPrompt || "").trim();
    return systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
}

/** 合并调用方取消信号与显式超时；不传 timeout 时不加任何预算。 */
export function abortScope(signal, timeoutMs) {
    if (!signal && !timeoutMs) return { signal: undefined, timedOut: false, dispose: () => undefined };
    const controller = new AbortController();
    let timedOut = false;
    let timer = null;
    const forward = () => controller.abort(signal.reason);
    if (signal?.aborted) controller.abort(signal.reason);
    else signal?.addEventListener("abort", forward, { once: true });
    if (timeoutMs) {
        timer = setTimeout(() => {
            timedOut = true;
            controller.abort(new Error("request timeout"));
        }, timeoutMs);
        timer.unref?.();
    }
    return {
        signal: controller.signal,
        get timedOut() {
            return timedOut;
        },
        dispose() {
            if (timer) clearTimeout(timer);
            signal?.removeEventListener("abort", forward);
        },
    };
}

export function isTimeoutError(error) {
    const name = error?.name || "";
    if (name === "TimeoutError") return true;
    const message = String(error?.message || "");
    return /timeout of \d+ms exceeded|request timeout/i.test(message);
}

export function isAbortError(error) {
    return error?.name === "AbortError" || error?.code === "ABORT_ERR";
}

async function networkError(error, scope) {
    if (scope?.timedOut) return new UpstreamError("请求超时，请稍后重试", 0);
    if (isAbortError(error)) return error;
    return new UpstreamError(`网络请求失败：${error?.message || error}`, 0);
}

export async function readResponseText(response) {
    try {
        return await response.text();
    } catch {
        return "";
    }
}

export async function upstreamErrorFromResponse(response, fallback = "请求失败") {
    const text = await readResponseText(response);
    const message = readApiErrorMessage(text) || statusMessage(response.status) || fallback;
    return new UpstreamError(message, response.status, text.slice(0, 300));
}

/** 返回原始 Response；调用方负责消费 body 后调用 scope.dispose()。 */
export async function fetchUpstream(ctx, url, init = {}, options = {}) {
    const scope = abortScope(options.signal, options.timeoutMs);
    try {
        const response = await ctx.fetch(url, { ...init, signal: scope.signal });
        return { response, scope };
    } catch (error) {
        scope.dispose();
        throw await networkError(error, scope);
    }
}

export async function requestUpstreamJson(ctx, url, options = {}) {
    const { method = "GET", headers, body, signal, timeoutMs, fallback } = options;
    const { response, scope } = await fetchUpstream(ctx, url, { method, headers, body }, { signal, timeoutMs });
    try {
        if (!response.ok) throw await upstreamErrorFromResponse(response, fallback);
        const text = await response.text();
        if (!text.trim()) return {};
        try {
            return JSON.parse(text);
        } catch {
            throw new UpstreamError(`上游返回了非 JSON 响应：${text.slice(0, 120)}`, response.status);
        }
    } finally {
        scope.dispose();
    }
}

export async function requestUpstreamText(ctx, url, options = {}) {
    const { method = "GET", headers, body, signal, timeoutMs, fallback } = options;
    const { response, scope } = await fetchUpstream(ctx, url, { method, headers, body }, { signal, timeoutMs });
    try {
        if (!response.ok) throw await upstreamErrorFromResponse(response, fallback);
        return await response.text();
    } finally {
        scope.dispose();
    }
}

export async function requestUpstreamBlob(ctx, url, options = {}) {
    const { method = "GET", headers, body, signal, timeoutMs, fallback } = options;
    const { response, scope } = await fetchUpstream(ctx, url, { method, headers, body }, { signal, timeoutMs });
    try {
        if (!response.ok) throw await upstreamErrorFromResponse(response, fallback);
        const bytes = new Uint8Array(await response.arrayBuffer());
        return { bytes, response };
    } finally {
        scope.dispose();
    }
}

export function isGatewayHtmlError(response) {
    if (response.ok) return false;
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html")) return false;
    return response.status === 400 || response.status === 408 || response.status === 429 || response.status >= 500;
}

export function requestStatus(error) {
    return typeof error?.status === "number" ? error.status : undefined;
}

export function isTransientGatewayError(error) {
    if (isTimeoutError(error) || isAbortError(error)) return false;
    const status = requestStatus(error);
    if (status) return TRANSIENT_GATEWAY_STATUSES.has(status);
    return error instanceof UpstreamError && !error.status;
}

/** 网关 5xx / 连接被掐：退避重试；超时不重试（上游可能已受理并计费）。 */
export async function withGatewayRetry(run, attempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await run();
        } catch (error) {
            lastError = error;
            if (!isTransientGatewayError(error) || attempt === attempts) throw error;
            await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 800 : 2000));
        }
    }
    throw lastError;
}

export function dataUrlToBlob(dataUrl, fallbackType = "application/octet-stream") {
    const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(String(dataUrl || ""));
    if (!match) return null;
    const mimeType = match[1] || fallbackType;
    const payload = match[2] || "";
    if (!dataUrl.includes(";base64,")) return new Blob([decodeURIComponent(payload)], { type: mimeType });
    return new Blob([Buffer.from(payload, "base64")], { type: mimeType });
}

export function dataUrlParts(dataUrl) {
    const match = /^data:([^;,]+)?;base64,(.*)$/s.exec(String(dataUrl || ""));
    return match ? { mimeType: match[1] || "application/octet-stream", data: match[2] || "" } : null;
}
