import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { MaterialPreviewWorkspace } from "@/components/tools/workspaces/material-preview";
import { DEFAULT_MATERIAL_PREVIEW_VALUES, MATERIAL_PREVIEW_CATEGORIES, buildMaterialPreviewFields, buildMaterialPreviewInputs, readMaterialPreviewValues } from "@/features/tools/registry/material-preview";

const ref = { id: "a1", name: "pattern.png", type: "image/png", dataUrl: "blob:x", url: "blob:x" };

function countLeaves(nodes: typeof MATERIAL_PREVIEW_CATEGORIES): number {
    return nodes.reduce((sum, node) => sum + (node.children?.length ? countLeaves(node.children) : 1), 0);
}

describe("商品预览效果（对齐 rea 还原的原站 PreviewModal）", () => {
    test("品类树来自原站 listSdsClassification，推荐 4 个 id 都在树里", () => {
        expect(countLeaves(MATERIAL_PREVIEW_CATEGORIES)).toBe(470);
        const ids = new Set<number>();
        const walk = (nodes: typeof MATERIAL_PREVIEW_CATEGORIES) => nodes.forEach((node) => (ids.add(node.id), node.children && walk(node.children)));
        walk(MATERIAL_PREVIEW_CATEGORIES);
        expect([1404, 320, 296, 837].every((id) => ids.has(id))).toBe(true);
    });

    test("默认：推荐品类 + 抠图，字段与原站提交体一致", () => {
        expect(buildMaterialPreviewFields(DEFAULT_MATERIAL_PREVIEW_VALUES, { url: "u", name: "n" })).toEqual({
            imageUrl: "u",
            imageName: "n",
            subType: 10,
            outputNum: 4,
            categoryIds: [1404, 320, 296, 837],
            categoryName: "t-shirt、马克杯、手提包、毛毯",
            isMatting: true,
        });
    });

    test("推荐模式拆成 4 个品类各 1 张；选品类后 1 个任务 4 张", () => {
        const recommended = buildMaterialPreviewInputs(DEFAULT_MATERIAL_PREVIEW_VALUES, ref);
        expect(recommended.map((input) => input.count)).toEqual([1, 1, 1, 1]);
        expect(recommended[1].prompt).toContain("马克杯");
        const picked = buildMaterialPreviewInputs({ categoryId: 320, categoryName: "马克杯", isMatting: false }, ref);
        expect(picked).toHaveLength(1);
        expect(picked[0].count).toBe(4);
        expect(picked[0].fields).toMatchObject({ subType: 11, categoryIds: [320], categoryName: "马克杯", isMatting: false });
        expect(picked[0].prompt).toContain("as-is");
    });

    test("草稿脏值收敛", () => {
        expect(readMaterialPreviewValues({ categoryId: "x", categoryName: 3, isMatting: "no" })).toEqual({ categoryName: "", isMatting: true });
        expect(readMaterialPreviewValues({ categoryId: 320, categoryName: "马克杯", isMatting: false })).toEqual({ categoryId: 320, categoryName: "马克杯", isMatting: false });
    });

    test("首屏：原站文案「素材贴合到商品的效果预览 / 使用原图预览 / 品类：推荐」", () => {
        const html = renderToStaticMarkup(createElement(MaterialPreviewWorkspace));
        for (const text of ["素材贴合到商品的效果预览", "使用原图预览", "品类：", "推荐", "立即生成"]) expect(html).toContain(text);
    });
});
