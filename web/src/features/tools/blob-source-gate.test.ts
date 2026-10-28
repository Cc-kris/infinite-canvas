import { describe, expect, test } from "bun:test";

import { isChangeColorSourceUsable, toChangeColorReference } from "./adapters/change-color";
import { toFixColorReference } from "./adapters/fix-color";
import { toHandRepairReference } from "./adapters/hand-repair";
import { toPrintingRepairReference } from "./adapters/printing-repair";
import { isSuiteSourceReady, toSuiteReference } from "./adapters/product-image-suite";
import { isMarketSourceReady, toMarketReference } from "./adapters/product-market-material";
import { isProductRefineSourceReady, toProductRefineReference } from "./adapters/product-refine";
import { toRemovePenReference } from "./adapters/remove-pen";
import { isScaleUpSourceReady, toScaleUpReference } from "./adapters/scale-up";
import { validateRemovePenInput } from "./registry/remove-pen";

/**
 * P0 回归（2026-10-28，6 个智能编辑工具的「上传源图」门禁）。
 *
 * 真实故障链：工具素材库上传成功后，资产记录当次会话只有 `blob:` 地址
 * （`services/api/tools/assets.ts` 的 `URL.createObjectURL`），`imageToDataUrl` 要到
 * 发请求前才把它抓成 `data:`。每个适配器各写一份前缀列表时，漏掉 `blob:` 的那几个工具
 * 就表现为「上传成功 → 提示仍说请先上传 / 提交按钮永久禁用」。
 *
 * 这些用例只做一件事：**喂纯 blob 源图（dataUrl 为空）**，要求判定为已就绪、
 * 且参考图里带着这个地址交给下游，不得抛「请先上传」。
 */

const BLOB = "blob:http://127.0.0.1:3000/2f0a6a4e-1111-4222-8333-944455556666";
const REMOTE = "https://cdn.example.com/x.png";

describe("P0：blob: 源图必须被 6 个智能编辑工具接受", () => {
    test("REMOVE_PEN：blob 源图可建参考图，且提交前校验不再拦「请先上传」", () => {
        const ref = toRemovePenReference({ id: "a1", name: "a.png", type: "image/png", dataUrl: "", url: BLOB });
        expect(ref.dataUrl).toBe(BLOB);
        expect(ref.url).toBe(BLOB);
        const issues = validateRemovePenInput({ imageUrl: BLOB, maskUrl: "data:image/png;base64,M", maskWidth: 512, maskHeight: 512, imageWidth: 512, imageHeight: 512 });
        expect(issues.some((issue) => issue.field === "image")).toBe(false);
    });

    test("CHANGE_COLOR：blob 源图判定可用并进参考图", () => {
        const source = { assetId: "a2", name: "b.png", mimeType: "image/png", dataUrl: "", url: BLOB };
        expect(isChangeColorSourceUsable(source)).toBe(true);
        expect(toChangeColorReference(source).url).toBe(BLOB);
    });

    test("PRODUCT_REFINE：blob 源图判定可用并进参考图", () => {
        const source = { assetId: "a3", dataUrl: "", url: BLOB };
        expect(isProductRefineSourceReady(source)).toBe(true);
        expect(toProductRefineReference(source).dataUrl).toBe(BLOB);
    });

    test("PRINTING_REPAIR：blob 底图/印花图都能进参考图（不再抛 asset-unreadable）", () => {
        const ref = toPrintingRepairReference({ id: "a4", name: "p.png", type: "image/png", dataUrl: "", url: BLOB, storageKey: "k4" });
        expect(ref.url).toBe(BLOB);
        expect(ref.storageKey).toBe("k4");
    });

    test("HAND_REPAIR：blob 源图能进参考图", () => {
        const ref = toHandRepairReference({ id: "a5", name: "h.png", type: "image/png", dataUrl: "", url: BLOB });
        expect(ref.url).toBe(BLOB);
    });

    test("FIX_COLOR：blob 源图能进参考图", () => {
        const ref = toFixColorReference({ id: "a6", name: "f.png", type: "image/png", dataUrl: "", url: BLOB });
        expect(ref.url).toBe(BLOB);
    });

    test("PRODUCT_IMAGE_SUITE / SCALE_UP：blob 源图判定可用（历史回归点）", () => {
        expect(isSuiteSourceReady({ assetId: "a7", dataUrl: "", url: BLOB })).toBe(true);
        expect(toSuiteReference({ assetId: "a7", dataUrl: "", url: BLOB }).url).toBe(BLOB);
        expect(isScaleUpSourceReady({ assetId: "a8", dataUrl: "", url: BLOB })).toBe(true);
        expect(toScaleUpReference({ assetId: "a8", dataUrl: "", url: BLOB }).url).toBe(BLOB);
    });

    test("PRODUCT_MARKET_MATERIAL：此前后缀列表漏掉 blob:，现已修（报告 §5 点名项）", () => {
        expect(isMarketSourceReady({ assetId: "a9", dataUrl: "", url: BLOB })).toBe(true);
        expect(toMarketReference({ assetId: "a9", dataUrl: "", url: BLOB }).url).toBe(BLOB);
    });

    test("反例：真正没有图片数据时仍然要拦（不能一律放行）", () => {
        expect(isChangeColorSourceUsable({ assetId: "x", dataUrl: "", url: "" })).toBe(false);
        expect(isProductRefineSourceReady({ assetId: "x" })).toBe(false);
        expect(isSuiteSourceReady({ assetId: "x" })).toBe(false);
        expect(isScaleUpSourceReady({ assetId: "x" })).toBe(false);
        expect(isMarketSourceReady({ assetId: "x" })).toBe(false);
        expect(() => toRemovePenReference({ id: "x", name: "x.png", type: "image/png", dataUrl: "", url: "" })).toThrow();
        expect(() => toHandRepairReference({ id: "x", name: "x.png", type: "image/png", dataUrl: "" })).toThrow();
        expect(() => toFixColorReference({ id: "x", name: "x.png", type: "image/png", dataUrl: "" })).toThrow();
        expect(() => toPrintingRepairReference({ id: "x", name: "x.png", type: "image/png", dataUrl: "" })).toThrow();
    });

    test("远端 http(s) 源图保持原样（不能被 blob 修复带偏）", () => {
        expect(toProductRefineReference({ assetId: "r1", url: REMOTE }).dataUrl).toBe(REMOTE);
        expect(toSuiteReference({ assetId: "r2", url: REMOTE }).url).toBe(REMOTE);
    });
});
