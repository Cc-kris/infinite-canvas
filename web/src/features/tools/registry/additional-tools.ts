import type { ToolCategory } from "../types";
import {
    BATCH_MATTING_MAKE_TYPE,
    PIXEL_TOOL_META,
    WHITE_BACKGROUND_TOOL_ID,
} from "./local-pixel";
import {
    IMAGE_REPLICATION_MAKE_TYPE,
    IMAGE_REPLICATION_TOOL_ID,
} from "./image-replication";

/**
 * 原站额外工具的本地路由契约，不改变固定 39 项证据清单。
 * 白底图没有已核实的原站 makeType，使用本地蒙版合成，不虚构上游编号。
 */
export const additionalToolSpecs = [
    { id: WHITE_BACKGROUND_TOOL_ID, slug: "white-background", title: PIXEL_TOOL_META.WHITE_BACKGROUND.title, category: "ecommerce-suite" as ToolCategory, origin: "original" as const, index: 40, fields: [] },
    { id: IMAGE_REPLICATION_TOOL_ID, slug: "image-replication", title: "爆款图复刻", category: "ecommerce-suite" as ToolCategory, makeType: IMAGE_REPLICATION_MAKE_TYPE, origin: "original" as const, index: 41, fields: [] },
    { id: "BATCH_MATTING", slug: "batch-matting", title: PIXEL_TOOL_META.BATCH_MATTING.title, category: "smart-edit" as ToolCategory, makeType: BATCH_MATTING_MAKE_TYPE, origin: "original" as const, index: 42, fields: [] },
] as const;

export const ADDITIONAL_TOOL_IDS: readonly AdditionalToolId[] = additionalToolSpecs.map((spec) => spec.id);
export type AdditionalToolId = (typeof additionalToolSpecs)[number]["id"];
