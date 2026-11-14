import { describe, expect, test } from "bun:test";

import {
    DEFAULT_REPLICATION_VALUES,
    IMAGE_REPLICATION_TOOL_ID,
    buildReplicationInput,
    createReplicationSnapshot,
    readReplicationSnapshot,
    readReplicationValues,
    replicationPrompt,
} from "@/features/tools/registry/image-replication";
import type { ToolAssetRecord } from "@/services/api/tools/assets";

const record = (id: string): ToolAssetRecord => ({
    id, name: `${id}.png`, kind: "image", storageKey: `tool-asset:${id}`, url: `blob:${id}`,
    bytes: 100, mimeType: "image/png", createdAt: "2026-01-01T00:00:00.000Z", origin: "local",
});

describe("IMAGE_REPLICATION 独立页面契约", () => {
    test("保留原站默认值和 1–4 张选项，商品信息不超过 2500 字", () => {
        expect(DEFAULT_REPLICATION_VALUES).toEqual({ mode: "aplus", quality: "1K", count: 1, market: "US", language: "英语", productInfo: "" });
        expect(readReplicationValues({ mode: "main", quality: "4K", count: 4, productInfo: "a".repeat(2600) }).productInfo.length).toBe(2500);
        expect(readReplicationValues({ count: 5 }).count).toBe(1);
        expect(readReplicationValues({ market: "unknown" }).market).toBe("");
    });

    test("商品图在前、版式参考图在后，所有页面参数真实进入请求", () => {
        const values = { ...DEFAULT_REPLICATION_VALUES, mode: "main" as const, quality: "2K" as const, count: 3, productInfo: "纯棉材质" };
        const products = [{ id: "product-1", name: "商品.png", type: "image/png", dataUrl: "", url: "blob:product" }];
        const layout = { id: "layout-1", name: "版式.png", type: "image/png", dataUrl: "", url: "blob:layout" };
        const input = buildReplicationInput(values, products, layout, "configured-model");
        expect(input.toolId).toBe(IMAGE_REPLICATION_TOOL_ID);
        expect(input.references?.map((item) => item.id)).toEqual(["product-1", "layout-1"]);
        expect(input.references?.[1].name).toBe("版式参考图");
        expect(input.count).toBe(3);
        expect(input.quality).toBe("2K");
        expect(input.model).toBe("configured-model");
        expect(input.fields).toMatchObject({ mode: "main", market: "US", language: "英语", productInfo: "纯棉材质" });
        expect(input.prompt).toContain("主副图");
        expect(input.prompt).not.toContain("链接解析");
    });

    test("缺商品图、缺版式图、缺市场语言均拒绝提交", () => {
        const product = { id: "p", name: "p", type: "image/png", dataUrl: "", url: "blob:p" };
        const layout = { id: "l", name: "l", type: "image/png", dataUrl: "", url: "blob:l" };
        expect(() => buildReplicationInput(DEFAULT_REPLICATION_VALUES, [], layout)).toThrow("白底商品图");
        expect(() => buildReplicationInput(DEFAULT_REPLICATION_VALUES, [product], { ...layout, url: "" })).toThrow("参考版式图");
        expect(() => buildReplicationInput({ ...DEFAULT_REPLICATION_VALUES, market: "" }, [product], layout)).toThrow("目标市场");
    });

    test("历史快照仅保存参数与持久素材 ID，不保存运行时 URL", () => {
        const snapshot = createReplicationSnapshot(DEFAULT_REPLICATION_VALUES, [record("p1"), record("p2")], record("layout"), "model");
        expect(JSON.stringify(snapshot)).not.toContain("blob:");
        expect(readReplicationSnapshot(snapshot)).toEqual(snapshot);
        expect(readReplicationSnapshot({ version: 1, productAssetIds: [], layoutAssetId: "layout" })).toBeNull();
    });

    test("提示词要求保留真实商品，不虚构功能或认证", () => {
        expect(replicationPrompt(DEFAULT_REPLICATION_VALUES)).toContain("保留真实商品");
        expect(replicationPrompt(DEFAULT_REPLICATION_VALUES)).toContain("不要虚构商品功能或认证");
    });
});
