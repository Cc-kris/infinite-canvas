import { Readable } from "node:stream";

import { HttpError } from "../http.mjs";

const WEBDAV_REQUEST_TIMEOUT_MS = 120000;

/**
 * 只按现有 120s 预算超时；不监听 req 的 close——上传时请求流读完就会 close，
 * 那会把还在等待上游响应的 fetch 提前中止。
 */
function scope() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBDAV_REQUEST_TIMEOUT_MS);
    return {
        signal: controller.signal,
        dispose: () => clearTimeout(timer),
    };
}

function headersOf(value) {
    return Object.fromEntries(
        Object.entries(value || {})
            .filter(([, item]) => item !== undefined && item !== null)
            .map(([name, item]) => [name, String(item)]),
    );
}

function urlOf(value) {
    const url = String(value || "").trim();
    if (!/^https?:\/\//i.test(url)) throw new HttpError(400, "invalid-webdav-url", "WebDAV 地址需以 http:// 或 https:// 开头");
    return url;
}

/** PROPFIND / MKCOL 这类只需要状态与文本响应的请求。 */
export async function webdavRequest(ctx, req, input) {
    const scopeValue = scope();
    try {
        const response = await ctx.fetch(urlOf(input.url), {
            method: String(input.method || "GET").toUpperCase(),
            headers: headersOf(input.headers),
            signal: scopeValue.signal,
        });
        const body = await response.text().catch(() => "");
        return { status: response.status, ok: response.ok, body };
    } catch (error) {
        throw networkError(error);
    } finally {
        scopeValue.dispose();
    }
}

/** GET 下载：保留上游状态码与字节，交给客户端判断 404 等情况。 */
export async function webdavDownload(ctx, req, input) {
    const scopeValue = scope();
    try {
        return {
            response: await ctx.fetch(urlOf(input.url), {
                method: String(input.method || "GET").toUpperCase(),
                headers: headersOf(input.headers),
                signal: scopeValue.signal,
            }),
            dispose: () => scopeValue.dispose(),
        };
    } catch (error) {
        scopeValue.dispose();
        throw networkError(error);
    }
}

/** PUT 上传：请求体按原始字节转发，不做 base64。 */
export async function webdavUpload(ctx, req, input) {
    const scopeValue = scope();
    try {
        const response = await ctx.fetch(urlOf(input.url), {
            method: "PUT",
            headers: { ...headersOf(input.headers), ...(input.contentType ? { "content-type": String(input.contentType) } : {}) },
            body: Readable.toWeb(req),
            duplex: "half",
            signal: scopeValue.signal,
        });
        const body = await response.text().catch(() => "");
        return { status: response.status, ok: response.ok, body };
    } catch (error) {
        throw networkError(error);
    } finally {
        scopeValue.dispose();
    }
}

function networkError(error) {
    if (error instanceof HttpError) return error;
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    if (timedOut) return new HttpError(504, "webdav-timeout", "WebDAV 请求超时。");
    return new HttpError(502, "webdav-unreachable", `WebDAV 连接失败：${error?.message || error}`);
}

export { WEBDAV_REQUEST_TIMEOUT_MS };
