/** 白底图 / 批量抠图的本地确定性输出契约；不包含自动主体分割。 */
export const WHITE_BACKGROUND_TOOL_ID = "WHITE_BACKGROUND" as const;
export const BATCH_MATTING_TOOL_ID = "BATCH_MATTING" as const;
/** 原站 /draw/batch-matting；独立白底图路由/makeType 尚无证据，不要猜号。 */
export const BATCH_MATTING_ROUTE = "/tools/smart-edit/batch-matting" as const;
export const BATCH_MATTING_MAKE_TYPE = 3 as const;

export type PixelToolId = typeof WHITE_BACKGROUND_TOOL_ID | typeof BATCH_MATTING_TOOL_ID;
export type PixelBackground = "white" | "transparent";
export type PixelMaskSource = "alpha" | "mask";
export type PixelAsset = { id: string; name: string; url: string; width?: number; height?: number };

export const PIXEL_TOOL_META = {
    WHITE_BACKGROUND: { title: "白底图", background: "white", action: "生成白底图" },
    BATCH_MATTING: { title: "批量抠图", background: "transparent", action: "开始抠图" },
} as const satisfies Record<PixelToolId, { title: string; background: PixelBackground; action: string }>;

export function readPixelDraft(value: unknown): { maskIds: Record<string, string> } {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { maskIds: {} };
    const raw = (value as Record<string, unknown>).maskIds;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { maskIds: {} };
    return { maskIds: Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)) };
}

export function pixelInputSnapshot(toolId: PixelToolId, assets: PixelAsset[], maskIds: Record<string, string>) {
    return {
        version: 1,
        background: PIXEL_TOOL_META[toolId].background,
        assets: assets.map(({ id, name, width, height }) => ({ id, name, width, height })),
        maskIds: Object.fromEntries(assets.flatMap((asset) => maskIds[asset.id] ? [[asset.id, maskIds[asset.id]]] : [])),
    };
}

export function readPixelInputSnapshot(value: unknown) {
    if (!value || typeof value !== "object") return null;
    const input = value as Record<string, unknown>;
    if (input.version !== 1 || (input.background !== "white" && input.background !== "transparent") || !Array.isArray(input.assets)) return null;
    const assets = input.assets.flatMap((item): PixelAsset[] => {
        if (!item || typeof item !== "object") return [];
        const asset = item as Record<string, unknown>;
        return typeof asset.id === "string" && typeof asset.name === "string" ? [{ id: asset.id, name: asset.name, url: "", width: typeof asset.width === "number" ? asset.width : undefined, height: typeof asset.height === "number" ? asset.height : undefined }] : [];
    });
    if (assets.length !== input.assets.length) return null;
    const maskIds = readPixelDraft({ maskIds: input.maskIds }).maskIds;
    return { background: input.background as PixelBackground, assets, maskIds };
}
