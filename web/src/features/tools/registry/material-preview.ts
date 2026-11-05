/**
 * MATERIAL_UPPER_BODY「商品预览效果」（makeType 16）。按 rea 还原的原站 PreviewModal chunk 复刻：
 * 素材图 →「素材贴合到商品的效果预览」，可勾「使用原图预览」（不抠图），可选「品类」（SDS 分类树）。
 * 原站提交体：{ type, imageUrl, imageName, subType: 选品类?11:10, outputNum: 4,
 *   extendFields: { categoryIds: 选品类?[id]:[1404,320,296,837], categoryName: 选品类?名称:'t-shirt、马克杯、手提包、毛毯', isMatting } }
 * 品类树原文：docs/V1.0/replica/rea-8tools/api/sds-classification.json（/image/make/listSdsClassification）。
 */
import type { BrowserToolInput } from "@/services/api/tools/gateway";
import type { ReferenceImage } from "@/types/image";

import categories from "./material-preview-categories.json";

export const MATERIAL_PREVIEW_TOOL_ID = "MATERIAL_UPPER_BODY";
export const MATERIAL_PREVIEW_OUTPUT_NUM = 4;

export type MaterialPreviewCategory = { id: number; name: string; children?: MaterialPreviewCategory[] };
export const MATERIAL_PREVIEW_CATEGORIES = categories as MaterialPreviewCategory[];

/** 未选品类时原站的「推荐」组合：短袖T恤 / 马克杯 / 帆布手提袋 / 沙发套，名称原文照录。 */
export const MATERIAL_PREVIEW_RECOMMENDED = { ids: [1404, 320, 296, 837], name: "t-shirt、马克杯、手提包、毛毯" } as const;
const RECOMMENDED_PRODUCTS = ["t-shirt", "马克杯", "手提包", "毛毯"] as const;

export type MaterialPreviewValues = {
    /** 品类叶子 id；undefined = 推荐 */
    categoryId?: number;
    categoryName: string;
    /** 原站默认 true（不勾「使用原图预览」 = 先抠图） */
    isMatting: boolean;
};

export const DEFAULT_MATERIAL_PREVIEW_VALUES: MaterialPreviewValues = { categoryName: "", isMatting: true };

export function readMaterialPreviewValues(raw?: Record<string, unknown> | null): MaterialPreviewValues {
    const id = Number(raw?.categoryId);
    const name = typeof raw?.categoryName === "string" ? raw.categoryName : "";
    const valid = Number.isInteger(id) && id > 0 && name ? { categoryId: id, categoryName: name } : { categoryName: "" };
    return { ...valid, isMatting: raw?.isMatting !== false };
}

/** 原站 extendFields + 顶层字段，原样进指纹。 */
export function buildMaterialPreviewFields(values: MaterialPreviewValues, image: { url: string; name: string }) {
    const picked = values.categoryId !== undefined;
    return {
        imageUrl: image.url,
        imageName: image.name,
        subType: picked ? 11 : 10,
        outputNum: MATERIAL_PREVIEW_OUTPUT_NUM,
        categoryIds: picked ? [values.categoryId] : [...MATERIAL_PREVIEW_RECOMMENDED.ids],
        categoryName: picked ? values.categoryName : MATERIAL_PREVIEW_RECOMMENDED.name,
        isMatting: values.isMatting,
    };
}

function productPrompt(product: string, isMatting: boolean): string {
    const source = isMatting
        ? "First isolate the main artwork/pattern from the reference image and drop its background."
        : "Use the whole reference image as-is, including its background.";
    return `Product mockup: print the reference artwork onto a ${product}. ${source} Keep the artwork's design, colors and proportions unchanged, wrap it naturally to the product surface with realistic fabric/material, lighting and shadows. Clean e-commerce product photo, single product, plain studio background.`;
}

/**
 * 原站一次出 4 张：推荐 = 4 个品类各 1 张；选了品类 = 该品类 4 张。
 * 本地模型同一 prompt 出多张不保证换品类，所以推荐模式拆成 4 个各 1 张的任务，字段与原站提交体一致。
 */
export function buildMaterialPreviewInputs(values: MaterialPreviewValues, reference: ReferenceImage, model?: string): BrowserToolInput[] {
    const fields = buildMaterialPreviewFields(values, { url: reference.url || reference.id, name: reference.name });
    const base = { toolId: MATERIAL_PREVIEW_TOOL_ID, model: model?.trim() || undefined, size: "1:1", references: [reference] };
    if (values.categoryId !== undefined) return [{ ...base, prompt: productPrompt(values.categoryName, values.isMatting), count: MATERIAL_PREVIEW_OUTPUT_NUM, fields }];
    return RECOMMENDED_PRODUCTS.map((product) => ({ ...base, prompt: productPrompt(product, values.isMatting), count: 1, fields }));
}
