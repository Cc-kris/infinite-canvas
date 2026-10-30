/**
 * 媒体取件的渠道鉴权解析（r28 修复 D1）。
 *
 * 背景（bd71498f 报告）：视频任务成功后，结果项地址常是渠道 API 自身的中转端点
 * （sub2api 的 `/v1/videos/<id>/content`）。轮询侧 `services/api/video.ts` 用
 * `aiHeaders(config)` 带鉴权，但结果入库走通用媒体下载（file-storage），历史实现是匿名 GET
 * → 401 `API_KEY_REQUIRED`。任务快照只存 model/channelId（禁止存凭据），所以入库时必须
 * **按原任务渠道**从当前用户配置重新解析 apiKey/apiBase。
 *
 * 安全规则（宁缺勿滥）：
 * - 只在 URL 属于渠道 API 的 **origin + API 路径前缀**时附带 `Authorization: Bearer <key>`；
 * - 公网/CDN/对象存储（换域，或同域但不在 API 前缀下）一律不带凭据，绝不把 key 发给第三方；
 * - `blob:`/`data:`/`file:` 等本地地址不联网，永不附加；
 * - 渠道查不到或没有 apiKey → 不附加（宁可 401 报错，也不拿别的渠道 key 试）；
 * - 凭据只活在本次请求的 header 里：不进日志、不进快照、不落盘。
 */
import { decodeChannelModel, useConfigStore, type AiConfig, type ModelChannel } from "@/stores/use-config-store";
import type { ToolTaskConfigSnapshot } from "@/services/api/tools/task-machine";

export type MediaAuthChannel = Pick<ModelChannel, "baseUrl" | "apiKey"> & { id?: string; apiFormat?: string; models?: { name: string }[] };

const AUTHORIZATION = "Authorization";

/** 本地地址：不联网，也永远不该带凭据。 */
export function isLocalMediaUrl(url: string) {
    return /^(?:blob:|data:|file:)/i.test((url ?? "").trim());
}

function parseHttpUrl(value: string) {
    try {
        const url = new URL(value.trim());
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        return url;
    } catch {
        return null;
    }
}

/**
 * 渠道 API 的「路径前缀」集合。
 *
 * - baseUrl 带路径（`https://host/api` 或 `https://host/v1`）时，该路径本身就是 API 根；
 * - baseUrl 只有域名时，API 根是 `/v1/`（OpenAI 兼容默认）。
 *
 * 用「前缀 + 目录分隔」判定，保证 `/v1/videos/x` 命中而 `/v1evil/x` 不命中。
 */
function channelApiPrefixes(baseUrl: string): { origin: string; prefixes: string[] } | null {
    const parsed = parseHttpUrl(baseUrl);
    if (!parsed) return null;
    const path = parsed.pathname.replace(/\/+$/, "");
    if (!path) return { origin: parsed.origin, prefixes: ["/v1/"] };
    const prefixes = [`${path}/`];
    if (!/\/v1$/i.test(path)) prefixes.push(`${path}/v1/`);
    return { origin: parsed.origin, prefixes };
}

/** 该地址是否是渠道自己的 API 端点（而非公网/CDN/第三方）。 */
export function isChannelMediaUrl(url: string, baseUrl: string) {
    if (!url || isLocalMediaUrl(url)) return false;
    const target = parseHttpUrl(url);
    const api = channelApiPrefixes(baseUrl ?? "");
    if (!target || !api) return false;
    if (target.origin !== api.origin) return false;
    const path = `${target.pathname.replace(/\/+$/, "")}/`;
    return api.prefixes.some((prefix) => path.startsWith(prefix));
}

/**
 * 取该 URL 需要的鉴权头；不需要/无法安全判定时返回 `undefined`。
 *
 * `apiFormat === "gemini"` 的渠道用 query 参数鉴权，Bearer 头没有意义，这里不加。
 */
export function channelMediaHeaders(url: string, channel?: MediaAuthChannel | null): Record<string, string> | undefined {
    if (!channel || channel.apiFormat === "gemini") return undefined;
    const apiKey = (channel.apiKey ?? "").trim();
    if (!apiKey) return undefined;
    if (!isChannelMediaUrl(url, channel.baseUrl ?? "")) return undefined;
    return { [AUTHORIZATION]: `Bearer ${apiKey}` };
}

/** 按任务快照的 model/channelId 找原渠道；找不到就是找不到，绝不回退到默认渠道。 */
export function resolveMediaAuthChannel(config: AiConfig, snapshot?: Pick<ToolTaskConfigSnapshot, "model" | "channelId"> | null): MediaAuthChannel | null {
    const model = (snapshot?.model ?? "").trim();
    const channels = Array.isArray(config?.channels) ? config.channels : [];
    if (!channels.length) return null;
    const channelId = (snapshot?.channelId ?? "").trim();
    if (channelId) return channels.find((channel) => channel.id === channelId) ?? null;
    if (!model) return null;
    const decoded = decodeChannelModel(model);
    if (decoded) return channels.find((channel) => channel.id === decoded.channelId) ?? null;
    return channels.find((channel) => (channel.models ?? []).some((item) => item.name === model)) ?? null;
}

/**
 * 结果入库/媒体下载用的鉴权头：按**原任务渠道**解析，凭据只从当前用户配置读取。
 *
 * @param config 显式传入便于测试；生产调用默认读当前配置。
 */
export function taskMediaHeaders(
    url: string,
    task?: { configSnapshot?: Pick<ToolTaskConfigSnapshot, "model" | "channelId"> | null } | null,
    config?: AiConfig,
): Record<string, string> | undefined {
    if (!url || isLocalMediaUrl(url)) return undefined;
    const current = config ?? useConfigStore.getState().config;
    const channel = resolveMediaAuthChannel(current, task?.configSnapshot);
    return channelMediaHeaders(url, channel);
}

/**
 * 按任务 id 解析鉴权头（结果面板「保存到资产库 / 发送画布」只知道 taskId）。
 *
 * 懒加载任务 store，且任何异常都退化为「不带头」：媒体取件失败会走原有的
 * 可读错误路径，绝不能因为查不到任务而把保存流程整体打断。
 */
export async function taskMediaHeadersById(url: string, taskId?: string): Promise<Record<string, string> | undefined> {
    if (!url || !taskId || isLocalMediaUrl(url)) return undefined;
    try {
        const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
        return taskMediaHeaders(url, useToolTaskStore.getState().tasks[taskId] ?? null);
    } catch {
        return undefined;
    }
}
