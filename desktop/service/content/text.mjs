/** 内容能力的文本模型调用：配置由渲染层解析好，主进程只负责发请求。 */
import { HttpError } from "../http.mjs";
import { callTextModel } from "../providers/text.mjs";

export async function requestContentText(ctx, body, signal) {
    const config = body.config || {};
    if (!String(config.model || "").trim() || !String(config.baseUrl || "").trim() || !String(config.apiKey || "").trim()) {
        throw new HttpError(400, "text-model-unavailable", "请先在模型设置中配置可访问的文本模型（含接口地址与 API Key）");
    }
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const withSystem = body.system ? [{ role: "system", content: String(body.system) }, ...messages] : messages;
    const result = await callTextModel(ctx, config, withSystem, { signal });
    return result.content || "";
}
