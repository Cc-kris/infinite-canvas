import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { ListingFissionWorkspace } from "@/components/tools/workspaces/listing-fission";
import { DEFAULT_LISTING_FISSION_VALUES, aplusAspectRatios, planListingFission, readListingFissionValues, summarizeListingFission } from "@/features/tools/registry/listing-fission";

const ref = (id: string) => ({ id, name: `${id}.png`, type: "image/png", dataUrl: `blob:${id}`, url: `blob:${id}` });
const v = (patch = {}) => ({ ...DEFAULT_LISTING_FISSION_VALUES, ...patch });

describe("链接裂变（对齐 rea 还原的原站 LinkCard 弹窗）", () => {
    test("A+ 类型比例与原站 Rt() 一致", () => {
        expect(aplusAspectRatios("advanced", 3, 4)).toEqual(["1464:600"]);
        expect(aplusAspectRatios("advancedPhone", 3, 4)).toEqual(["1464:600", "600:450"]);
        expect(aplusAspectRatios("standard", 3, 4)).toEqual(["970:600"]);
        expect(aplusAspectRatios("custom", 3, 4)).toEqual(["3:4"]);
    });

    test("基础铺货：每张主副图 1 张，不含 A+；总数 × 新 Listing 数量", () => {
        expect(summarizeListingFission(v({ linkCount: 3 }), 2, 0, 0)).toEqual({ mainSubPerLink: 2, aplusPerLink: 0, totalImages: 6 });
        const units = planListingFission(v({ linkCount: 2 }), [ref("a"), ref("b")], [], 0);
        expect(units).toHaveLength(4);
        expect(units[0].input.fields).toMatchObject({ fissionCountMainSub: 1, fissionCountAplus: 0, fissionLinkCount: 1, outputNum: 2, selectedImages: [{ imageUrl: "blob:a", mediaType: 1 }, { imageUrl: "blob:b", mediaType: 1 }] });
        expect(new Set(units.map((unit) => unit.input.prompt)).size).toBe(4);
    });

    test("完整 Listing、源无 A+：按 A+ 类型比例用首张主副图生成，带 aplusConfig", () => {
        const units = planListingFission(v({ delivery: "complete", aplusType: "advancedPhone", aplusCount: 2 }), [ref("a")], [], 0);
        const aplus = units.filter((unit) => unit.kind === "aplus");
        expect(aplus.map((unit) => unit.input.size)).toEqual(["1464:600", "1464:600", "600:450", "600:450"]);
        expect(units[0].input.fields).toMatchObject({ outputNum: 5, aplusConfig: { type: "advancedPhone", count: 2, aspectRatios: ["1464:600", "600:450"] } });
    });

    test("自定义：单图倍数生效；源有 A+ 但没选时按原站提示拦截", () => {
        expect(planListingFission(v({ delivery: "custom", mainSubCount: 3 }), [ref("a")], [], 0)).toHaveLength(3);
        expect(() => planListingFission(v({ delivery: "custom", customAplus: true }), [ref("a")], [], 2)).toThrow("请至少选择一张 A+ 图作为生成参考");
        const units = planListingFission(v({ delivery: "custom", customAplus: true, aplusCount: 2 }), [ref("a")], [ref("p")], 1);
        expect(units.filter((unit) => unit.kind === "aplus")).toHaveLength(2);
        expect(units[0].input.fields).toMatchObject({ fissionCountAplus: 2, selectedImages: [{ mediaType: 1 }, { imageUrl: "blob:p", mediaType: 2 }] });
    });

    test("没有主副图不能提交", () => {
        expect(() => planListingFission(v(), [], [], 0)).toThrow("请至少选择一张主副图作为裂变参考");
    });

    test("草稿脏值收敛到 1～10", () => {
        expect(readListingFissionValues({ delivery: "x", linkCount: 99, mainSubCount: 0, aplusType: "y" })).toMatchObject({ delivery: "basic", linkCount: 10, mainSubCount: 1, aplusType: "advanced" });
    });

    test("首屏原站文案", () => {
        const html = renderToStaticMarkup(createElement(ListingFissionWorkspace));
        for (const text of ["裂变来源 · 自有 Listing", "设置裂变目标", "新 Listing 数量", "每条 Listing 的内容", "基础铺货", "铺货推荐", "完整 Listing", "选择参考图片", "请先选择主副图"]) expect(html).toContain(text);
    });
});
