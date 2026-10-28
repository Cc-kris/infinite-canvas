/**
 * 工具「上传源图」的统一判定与归一化。
 *
 * 背景（P0，2026-10-28）：`ToolAssetInput` 上传后的资产记录当次会话的 `url` 是 `blob:`
 * （见 `services/api/tools/assets.ts` 的 `URL.createObjectURL`），只有发送前才会被
 * `imageToDataUrl` 抓成 `data:`。任何「这张源图能不能提交」的判断如果各写一份前缀列表，
 * 就必然出现某几处漏掉 `blob:` —— 表现是**上传明明成功，提交按钮却永久禁用**、
 * 或者**上传后仍提示「请先上传图片」**（真实面包屑：CHANGE_COLOR / PRODUCT_IMAGE_SUITE /
 * SCALE_UP 都踩过）。因此判定与归一化统一收敛到这里，不再在适配器里复制前缀列表。
 *
 * 判定口径（与 provider 参考图能吃的来源一致）：
 *  - `data:`  内联（base64 图片、画布导出的蒙版 PNG）；
 *  - `blob:`  本次会话的对象 URL（上传即用，提交前转 data URL）；
 *  - `http(s)://` 远端可访问地址。
 * 其余一律判为不可用：上游错误页 HTML、JSON 报错片段、空串、相对路径。
 */

/** 上传源图可选择的两条地址：内联 data URL / 对象或远端 URL。 */
export type UploadedImageSource = {
    dataUrl?: string | null;
    url?: string | null;
};

const UPLOADED_IMAGE_PATTERN = /^(?:data:|blob:|https?:\/\/)/i;
const DATA_URL_PATTERN = /^data:/i;
const INLINE_IMAGE_PATTERN = /^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i;
const REMOTE_IMAGE_PATTERN = /^https?:\/\//i;
const BLOB_URL_PATTERN = /^blob:/i;

function compact(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

/** 是否是 provider 参考图能吃的来源（data: / blob: / http(s):）。 */
export function isUsableUploadedImageUrl(value: unknown): value is string {
    return UPLOADED_IMAGE_PATTERN.test(compact(value));
}

/** 是否是内联的 data 图片（`data:image/...`）。 */
export function isInlineImageUrl(value: unknown): value is string {
    return INLINE_IMAGE_PATTERN.test(compact(value));
}

/** 是否是会话内的 blob: 对象 URL（上传后当次会话的形态）。 */
export function isBlobImageUrl(value: unknown): value is string {
    return BLOB_URL_PATTERN.test(compact(value));
}

/** 是否是远端 http(s) 地址（可被服务端直接取用的那种）。 */
export function isRemoteImageUrl(value: unknown): value is string {
    return REMOTE_IMAGE_PATTERN.test(compact(value));
}

/**
 * 取源图可用的第一条地址：优先 `dataUrl`，其次 `url`；都不可用返回 `""`。
 * 适配器的「能不能提交」「reference 从哪取」都必须用这个结果，避免两条路径口径不一致。
 */
export function pickUploadedImageUrl(source?: UploadedImageSource | null): string {
    const dataUrl = compact(source?.dataUrl);
    if (isUsableUploadedImageUrl(dataUrl)) return dataUrl;
    const url = compact(source?.url);
    return isUsableUploadedImageUrl(url) ? url : "";
}

/** 源图是否已经可用（有可被 provider 读取的地址）。 */
export function isUploadedImageReady(source?: UploadedImageSource | null): boolean {
    return Boolean(pickUploadedImageUrl(source));
}

/**
 * ReferenceImage 的地址字段归一化：
 *  - `dataUrl` 只承载真正的 `data:` 内联图（`blob:` 不再冒充 data URL）；
 *  - 非内联来源（`blob:` / `http(s):`）落到 `url`，由 `imageToDataUrl` 在发送前统一转换。
 * 源图不可用时抛 `null`，由调用方给出本工具的报错文案。
 */
export function sourceReferenceUrls(source?: UploadedImageSource | null): { dataUrl: string; url?: string } | null {
    const picked = pickUploadedImageUrl(source);
    if (!picked) return null;
    // 约定：`dataUrl` 保存「这次要发给 provider 的原始地址」（data: 或 blob:/http(s)），
    // 非 data: 时同时把同一个地址写进 `url`。两者都保留是为了让下游 imageToDataUrl
    // 无论按 dataUrl 还是 url 取值都能拿到东西，历史适配器也是这么传的。
    return DATA_URL_PATTERN.test(picked) ? { dataUrl: picked } : { dataUrl: picked, url: picked };
}

/**
 * 只保留可跨会话复用的远端地址（排除 `data:` / `blob:`）。
 * 用于 `realImageUrl` 这类需要服务端按 URL 取图的字段：blob 地址服务端不可达，
 * 传上去只会得到一次必然失败的请求。
 */
export function pickRemoteImageUrl(source?: UploadedImageSource | null): string {
    const url = compact(source?.url);
    return isRemoteImageUrl(url) ? url : "";
}
