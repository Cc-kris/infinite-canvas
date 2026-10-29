import type { ToolTaskResultItem } from "@/services/api/tools/task-machine";

/**
 * 结果项的 `kind` 只由上游成功时写入；外部恢复 / 旧快照里可能只剩 mimeType（或 dataUrl 前缀）。
 *
 * 缺 kind 时按 mimeType 兜底推导：
 *  - 视频结果被当成图片渲染 → `<img src="blob:...video/mp4">` 只能是破图；
 *  - 图片结果被 `kind === "image"` 过滤掉 → 上游明明出图，页面却「成功但无结果」（静默清空）。
 *
 * 这里是唯一推导点，ToolResult / 各工具适配器都必须复用它，避免两边口径分叉。
 */
export function deriveResultKind(
    item: Pick<ToolTaskResultItem, "kind" | "mimeType" | "blob" | "dataUrl">,
): ToolTaskResultItem["kind"] | undefined {
    const mime = (
        item.mimeType ??
        item.blob?.type ??
        (item.dataUrl?.startsWith("data:") ? item.dataUrl.slice(5).split(/[;,]/)[0] : "") ??
        ""
    ).toLowerCase();
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("image/")) return "image";
    return undefined;
}

/** 推导不出或已经对得上时原样返回（保持引用不变，避免无谓重渲染）。 */
export function withDerivedKind<T extends Pick<ToolTaskResultItem, "kind" | "mimeType" | "blob" | "dataUrl">>(item: T): T {
    const derived = deriveResultKind(item);
    if (!derived || item.kind === derived) return item;
    return { ...item, kind: derived };
}

/** 结果项是否真的带着可用载荷（二进制、storageKey、url 或 dataUrl 之一）。 */
export function hasUsablePayload(
    item: Pick<ToolTaskResultItem, "dataUrl" | "url" | "blob" | "storageKey" | "payloadDropped">,
): boolean {
    if (item.payloadDropped) return false;
    return Boolean(item.dataUrl || item.url || item.blob || item.storageKey);
}
