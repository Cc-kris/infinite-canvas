/** 远端提示词源：主进程 fetch（走系统代理），渲染层不再直连第三方地址。 */
import { HttpError } from "../http.mjs";

export async function readRemoteJson(ctx, input, signal) {
    let url;
    try {
        url = new URL(String(input.url || "").trim());
    } catch {
        throw new HttpError(400, "invalid-link", "提示词源地址不合法");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new HttpError(400, "invalid-link", "提示词源地址需以 http:// 或 https:// 开头");

    let response;
    try {
        response = await ctx.fetch(url.href, { headers: { accept: "application/json" }, signal });
    } catch (error) {
        if (signal?.aborted) throw new HttpError(499, "aborted", "已取消提示词源读取");
        throw new HttpError(502, "fetch-failed", `提示词源读取失败：${error?.message || error}`);
    }
    if (!response.ok) throw new HttpError(response.status, "fetch-failed", `提示词源读取失败（HTTP ${response.status}）`);
    try {
        return await response.json();
    } catch {
        throw new HttpError(422, "invalid-json", "提示词源返回的不是合法 JSON");
    }
}
