import type { ToolCase } from "@/components/tools/tool-cases";
import { uploadToolAsset, type ToolAssetRecord } from "@/services/api/tools/assets";

/**
 * 「做同款」素材入库：把案例里真实落盘的输入素材（`apply.files`）读成 File 再写入资产库。
 *
 * 事实边界：
 * - 素材来源是 LinkFox 原站案例的真实输入图，已按同源字节落在 `web/public/__cases/<tool>/`；
 * - 任一素材读取失败直接抛错（不静默跳过、不用占位图），由调用方展示错误；
 * - 返回顺序与 `apply.files` 的键一致，调用方按槽位（source / product / model / garment / materials）取用。
 */
export async function uploadCaseFiles(item: ToolCase): Promise<Record<string, ToolAssetRecord>> {
    const files = (item.apply && (item.apply.files as unknown)) as Record<string, unknown> | undefined;
    const out: Record<string, ToolAssetRecord> = {};
    if (!files) return out;

    for (const [slot, value] of Object.entries(files)) {
        const urls = (Array.isArray(value) ? value : [value]).filter(
            (entry): entry is string => typeof entry === "string" && entry.length > 0,
        );
        if (!urls.length) continue;
        const records: ToolAssetRecord[] = [];
        for (const url of urls) {
            records.push(await uploadCaseFile(url, `linkfox-case-${item.id}-${slot}`));
        }
        if (records.length === 1) out[slot] = records[0];
        else (out as Record<string, unknown>)[slot] = records;
    }
    return out;
}

/** 单个素材：fetch → File → 资产库。文件名保留原扩展名，MIME 以响应头为准。 */
export async function uploadCaseFile(url: string, baseName: string): Promise<ToolAssetRecord> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`案例素材读取失败（${url} → HTTP ${response.status}）`);
    const blob = await response.blob();
    const mime = blob.type || "image/webp";
    const ext = mime.split("/")[1]?.split("+")[0] || "webp";
    const file = new File([blob], `${baseName}.${ext}`, { type: mime });
    return uploadToolAsset(file);
}
