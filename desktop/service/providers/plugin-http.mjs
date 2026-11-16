/** 插件脚本 HTTP 转发：脚本仍在渲染层执行，但所有网络请求由主进程发出。 */
import { readApiErrorMessage, readResponseText, statusMessage, UpstreamError } from "./shared.mjs";

function assertHttpUrl(raw) {
    let url;
    try {
        url = new URL(String(raw || ""));
    } catch {
        throw new UpstreamError("插件请求地址不合法");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new UpstreamError("插件请求只支持 http/https 地址");
    return url.href;
}

export async function forwardPluginRequest(ctx, input) {
    const url = assertHttpUrl(input.url);
    const method = String(input.method || "GET").toUpperCase();
    const headers = { ...(input.headers || {}) };
    if (input.contentType && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) headers["content-type"] = input.contentType;
    const hasBody = method !== "GET" && method !== "HEAD" && input.body && input.body.length > 0;

    let response;
    try {
        response = await ctx.fetch(url, {
            method,
            headers,
            body: hasBody ? input.body : undefined,
            signal: input.signal,
        });
    } catch (error) {
        if (error?.name === "AbortError") throw error;
        throw new UpstreamError(`插件请求失败：${error?.message || error}`, 0);
    }

    const responseType = input.responseType || "json";
    const status = response.status;
    if (responseType === "blob" || responseType === "arraybuffer") {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!response.ok) throw new UpstreamError(readApiErrorMessage(new TextDecoder().decode(bytes.slice(0, 400))) || statusMessage(status) || "插件请求失败", status);
        return { status, bytes, contentType: response.headers.get("content-type") || "application/octet-stream" };
    }

    const text = await readResponseText(response);
    let data = text;
    if (responseType !== "text") {
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = text;
        }
    }
    if (!response.ok) throw new UpstreamError(readApiErrorMessage(data) || statusMessage(status) || "插件请求失败", status);
    return { status, data };
}
