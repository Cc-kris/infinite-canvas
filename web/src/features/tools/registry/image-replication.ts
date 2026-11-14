import type { ReferenceImage } from "@/types/image";
import type { BrowserToolInput, ToolExecutionDescriptor } from "@/services/api/tools/gateway";
import type { ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask } from "@/services/api/tools/task-machine";

/** 原站 /draw/image-replication；不要与 PRODUCT_MARKET_MATERIAL(makeType=64) 混用。 */
export const IMAGE_REPLICATION_TOOL_ID = "IMAGE_REPLICATION" as const;
export const IMAGE_REPLICATION_MAKE_TYPE = 88 as const;
export const IMAGE_REPLICATION_ROUTE = "/tools/ecommerce-suite/image-replication" as const;
export const IMAGE_REPLICATION_VALUES_SLOT = "imageReplication" as const;
export const IMAGE_REPLICATION_SNAPSHOT_SLOT = "imageReplicationSnapshot" as const;

export type ReplicationMode = "aplus" | "main";
export type ReplicationValues = {
    mode: ReplicationMode;
    quality: "1K" | "2K" | "4K";
    count: number;
    market: string;
    language: string;
    productInfo: string;
};

export const REPLICATION_MARKETS = [
    { id: "US", label: "US（美国）" },
    { id: "UK", label: "UK（英国）" },
    { id: "DE", label: "DE（德国）" },
    { id: "FR", label: "FR（法国）" },
    { id: "JP", label: "JP（日本）" },
    { id: "ES", label: "ES（西班牙）" },
    { id: "BR", label: "BR（巴西）" },
    { id: "SE", label: "SE（东南亚）" },
] as const;

export const REPLICATION_LANGUAGES = [
    "英语",
    "日语",
    "德语",
    "法语",
    "西班牙语",
    "葡萄牙语",
    "中文",
] as const;

export const DEFAULT_REPLICATION_VALUES: ReplicationValues = { mode: "aplus", quality: "1K", count: 1, market: "US", language: "英语", productInfo: "" };

export function readReplicationValues(value: unknown): ReplicationValues {
    const input = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<ReplicationValues> : {};
    const validMarket = REPLICATION_MARKETS.some((m) => m.id === input.market) ? String(input.market) : "";
    const validLanguage = (REPLICATION_LANGUAGES as readonly string[]).includes(String(input.language)) ? String(input.language) : "";
    return {
        mode: input.mode === "main" ? "main" : "aplus",
        quality: input.quality === "2K" || input.quality === "4K" ? input.quality : "1K",
        count: [1, 2, 3, 4].includes(Number(input.count)) ? Number(input.count) : 1,
        market: validMarket,
        language: validLanguage,
        productInfo: typeof input.productInfo === "string" ? input.productInfo.slice(0, 2500) : "",
    };
}

export function replicationPrompt(values: ReplicationValues): string {
    return [
        "参考白底商品图与版式参考图，复刻电商图片的版式与视觉结构，保留真实商品的外观、颜色、材质、标识与包装文字。",
        values.mode === "aplus" ? "生成适合 A+ 长图的营销版面，不要虚构商品功能或认证。" : "生成电商主副图营销版面，不要虚构商品功能或认证。",
        `目标市场：${values.market}；画面文案语言：${values.language}；输出分辨率：${values.quality}。`,
        values.productInfo.trim() ? `商品信息：${values.productInfo.trim()}` : "",
    ].filter(Boolean).join("\n");
}

export function buildReplicationInput(values: ReplicationValues, products: ReferenceImage[], layout: ReferenceImage, model?: string): BrowserToolInput {
    if (!products.length) throw new Error("请上传白底商品图。");
    if (!layout.dataUrl && !layout.url) throw new Error("请上传参考版式图。");
    if (!values.market || !values.language) throw new Error("请选择目标市场与文案语言。");
    return {
        toolId: IMAGE_REPLICATION_TOOL_ID,
        prompt: replicationPrompt(values),
        references: [...products, { ...layout, name: "版式参考图" }],
        count: values.count,
        quality: values.quality,
        ...(model ? { model } : {}),
        fields: {
            mode: values.mode,
            quality: values.quality,
            count: values.count,
            market: values.market,
            language: values.language,
            productInfo: values.productInfo,
            productAssetIds: products.map((item) => item.id),
            layoutAssetId: layout.id,
            // 未接入原站链接抓取、A+ 长图切分，不发送这些能力的虚假参数。
        },
    };
}

export function replicationReference(record: ToolAssetRecord, role = "商品图"): ReferenceImage {
    return { id: record.id, name: record.name || role, type: record.mimeType, dataUrl: "", url: record.url, storageKey: record.storageKey };
}

export type ReplicationInputSnapshot = {
    version: 1;
    values: ReplicationValues;
    productAssetIds: string[];
    layoutAssetId: string;
    model?: string;
};

export function createReplicationSnapshot(values: ReplicationValues, products: ToolAssetRecord[], layout: ToolAssetRecord, model?: string): ReplicationInputSnapshot {
    return { version: 1, values: { ...values }, productAssetIds: products.map((record) => record.id), layoutAssetId: layout.id, ...(model ? { model } : {}) };
}

export function readReplicationSnapshot(value: unknown): ReplicationInputSnapshot | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const input = value as Record<string, unknown>;
    const ids = Array.isArray(input.productAssetIds) ? input.productAssetIds.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
    if (input.version !== 1 || !ids.length || typeof input.layoutAssetId !== "string" || !input.layoutAssetId) return null;
    return {
        version: 1,
        values: readReplicationValues(input.values),
        productAssetIds: ids,
        layoutAssetId: input.layoutAssetId,
        ...(typeof input.model === "string" && input.model ? { model: input.model } : {}),
    };
}

/** 历史只认真实任务快照；这里只组请求，不生成或补造结果。 */
export function replicationInputFromTask(task: ToolTask, products: ToolAssetRecord[], layout: ToolAssetRecord, descriptor?: ToolExecutionDescriptor): BrowserToolInput {
    const saved = readReplicationSnapshot(task.inputSnapshot);
    if (!saved) throw new Error("这条历史没有可恢复的完整输入。");
    if (descriptor && !descriptor.executable) throw new Error("当前网关尚未注册爆款图复刻，不能提交。");
    if (products.length !== saved.productAssetIds.length || products.some((record, index) => record.id !== saved.productAssetIds[index]) || layout.id !== saved.layoutAssetId) {
        throw new Error("部分原始素材已不存在，请重新选择后再生成。");
    }
    return buildReplicationInput(saved.values, products.map((record) => replicationReference(record)), replicationReference(layout, "版式参考图"), saved.model);
}
