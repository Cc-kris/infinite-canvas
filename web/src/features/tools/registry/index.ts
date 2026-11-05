import {
    canonicalToolRoute,
    collectToolSpecIssues,
    type FieldControl,
    type FieldSpec,
    type ToolCategory,
    type ToolOwnerCategory,
    type ToolSpec,
} from "../types";

/**
 * The single 39-tool registry (TASK-001).
 *
 * Generated from the reviewed evidence, then committed as source of truth:
 * - docs/V1.0/plan_linkfox_navigation/tool_specs.json (ids, order, categories, fields, batch references)
 * - docs/analysis/assets/linkfox/schema_final.json (`type_final` -> makeType)
 * - docs/V1.0/plan_linkfox_navigation/technical_design.md (layout + adapter per TECH-Txx)
 *
 * Do not hand-edit single entries without updating the evidence; registry.test.ts re-reads the
 * evidence files and fails on drift.
 */

type FieldOptions = Omit<FieldSpec, "key" | "control" | "required">;

const REQUIRED = true;

/** Field shorthand: f(key, control, required, options). */
function f(key: string, control: FieldControl, required = false, options: FieldOptions = {}): FieldSpec {
    return { key, control, required, ...options };
}

export const toolSpecs: readonly ToolSpec[] = [
    {
        id: "PRODUCT_IMAGE_SUITE",
        index: 1,
        title: "商品套图",
        category: "ecommerce-suite" as ToolOwnerCategory,
        slug: "product-image-suite",
        route: "/tools/ecommerce-suite/product-image-suite",
        makeType: 71,
        origin: "original",
        layout: "suite",
        adapter: "image",
        batchCapable: true,
        enabled: true,
        fields: [f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("outputNum", "number", REQUIRED, { defaultValue: 1, providerRule: "integer" })],
    },
    {
        id: "DRESS_WEAR_SET",
        index: 2,
        title: "服装套图",
        category: "ecommerce-suite" as ToolOwnerCategory,
        slug: "dress-wear-set",
        route: "/tools/ecommerce-suite/dress-wear-set",
        makeType: 69,
        origin: "original",
        layout: "suite",
        adapter: "image",
        batchCapable: true,
        enabled: true,
        fields: [f("aspectRatio", "ratio", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" }), f("brandDNA", "unspecified"), f("brandKey", "unspecified"), f("brandName", "unspecified"), f("coverList", "asset-list", false, { providerRule: "array/object" }), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("images", "asset-list"), f("language", "unspecified"), f("name", "unspecified"), f("needIntelligent", "boolean", REQUIRED, { defaultValue: false, providerRule: "boolean" }), f("outputNum", "number", REQUIRED, { defaultValue: 1, providerRule: "integer" }), f("platform", "unspecified"), f("provider", "unspecified"), f("quality", "select", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" }), f("resolution", "unspecified", REQUIRED, { providerRule: "string enum" }), f("salesRegion", "unspecified")],
    },
    {
        id: "CHANGE_COLOR_V2",
        index: 3,
        title: "套图换色",
        category: "ecommerce-suite" as ToolOwnerCategory,
        slug: "change-color-v2",
        route: "/tools/ecommerce-suite/change-color-v2",
        makeType: 93,
        origin: "original",
        layout: "color",
        adapter: "image",
        batchCapable: false,
        enabled: true,
        fields: [f("imageName", "upload"), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" })],
    },
    {
        id: "IMAGE_TRANSLATION",
        index: 4,
        title: "批量翻译",
        category: "ecommerce-suite" as ToolOwnerCategory,
        slug: "image-translation",
        route: "/tools/ecommerce-suite/image-translation",
        makeType: 45,
        origin: "original",
        layout: "translate",
        adapter: "image",
        batchCapable: true,
        enabled: true,
        fields: [f("imageName", "upload"), f("imageSegUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("sourceLanguage", "select", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" }), f("targetLanguage", "select", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" })],
    },
    {
        id: "SCALE_UP",
        index: 5,
        title: "高清放大",
        category: "ecommerce-suite" as ToolOwnerCategory,
        slug: "scale-up",
        route: "/tools/ecommerce-suite/scale-up",
        makeType: 7,
        origin: "original",
        layout: "enhance",
        adapter: "image",
        batchCapable: true,
        enabled: true,
        fields: [f("enhanceFace", "unspecified"), f("enhanceQuality", "unspecified"), f("imageName", "upload"), f("imageOutputHeight", "upload"), f("imageOutputWidth", "upload"), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("magnification", "unspecified")],
    },
    {
        id: "AI_OUTPAINTING",
        index: 6,
        title: "智能扩图",
        category: "ecommerce-suite" as ToolOwnerCategory,
        slug: "ai-outpainting",
        route: "/tools/ecommerce-suite/ai-outpainting",
        makeType: 25,
        origin: "original",
        layout: "outpaint",
        adapter: "image",
        batchCapable: true,
        enabled: true,
        fields: [f("config", "unspecified"), f("editFlag", "unspecified"), f("height", "number"), f("imageConfig", "upload"), f("imageExpandUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("imageName", "upload"), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("maskUrl", "mask", REQUIRED, { providerRule: "string(URL)" }), f("originImageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("outputNum", "number", REQUIRED, { defaultValue: 1, providerRule: "integer" }), f("prompt", "textarea", false, { providerRule: "string" }), f("ratio", "ratio", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" }), f("sizeSetHeight", "unspecified"), f("sizeSetName", "unspecified"), f("sizeSetType", "unspecified"), f("sizeSetValue", "unspecified"), f("sizeSetWidth", "unspecified"), f("stageConfig", "unspecified"), f("width", "number")],
    },
    {
        id: "AREA_REPAIR",
        index: 7,
        title: "局部重绘",
        category: "smart-edit" as ToolOwnerCategory,
        slug: "area-repair",
        route: "/tools/smart-edit/area-repair",
        makeType: 32,
        origin: "original",
        layout: "mask",
        adapter: "image",
        batchCapable: true,
        enabled: true,
        fields: [f("autoExpand", "boolean", REQUIRED, { defaultValue: false, providerRule: "boolean" }), f("imageName", "upload"), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("maskUrl", "mask", REQUIRED, { providerRule: "string(URL)" }), f("outputNum", "number", REQUIRED, { defaultValue: 1, providerRule: "integer" }), f("prompt", "textarea", false, { providerRule: "string" })],
    },
    {
        id: "REMOVE_PEN",
        index: 8,
        title: "局部消除",
        category: "smart-edit" as ToolOwnerCategory,
        slug: "remove-pen",
        route: "/tools/smart-edit/remove-pen",
        makeType: 23,
        origin: "original",
        layout: "mask",
        adapter: "image",
        batchCapable: false,
        enabled: true,
        fields: [f("eraseImageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("imageName", "upload"), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("maskImageUrl", "upload", REQUIRED, { providerRule: "string(URL)" })],
    },
    {
        id: "CHANGE_COLOR",
        index: 9,
        title: "一键换色",
        category: "smart-edit" as ToolOwnerCategory,
        slug: "change-color",
        route: "/tools/smart-edit/change-color",
        makeType: 19,
        origin: "original",
        layout: "color",
        adapter: "image",
        batchCapable: true,
        enabled: true,
        fields: [f("adjustLight", "unspecified"), f("colorParams", "color"), f("coverList", "asset-list", false, { providerRule: "array/object" }), f("doInpaint", "unspecified"), f("imageFormat", "upload"), f("imageHeight", "upload"), f("imageMaskUrl", "mask", REQUIRED, { providerRule: "string(URL)" }), f("imageName", "upload"), f("imageSegUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("imageSize", "upload"), f("imageTagData", "upload"), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("imageWidth", "upload"), f("images", "asset-list"), f("name", "unspecified"), f("sourceImageUrl", "upload", REQUIRED, { providerRule: "string(URL)" })],
    },
    {
        id: "IMAGE_CROP",
        index: 10,
        title: "图片裁剪",
        category: "smart-edit" as ToolOwnerCategory,
        slug: "image-crop",
        route: "/tools/smart-edit/image-crop",
        makeType: 67,
        origin: "original",
        layout: "crop",
        adapter: "image",
        batchCapable: true,
        enabled: true,
        fields: [f("activeTab", "unspecified"), f("contentUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("imageCropUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("imageFormat", "upload"), f("imageHeight", "upload"), f("imageSize", "upload"), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("imageWidth", "upload"), f("platform", "unspecified"), f("platformTitle", "unspecified"), f("ratio", "ratio", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" }), f("selectedMode", "unspecified")],
    },
    {
        id: "PRODUCT_REFINE",
        index: 11,
        title: "商品精修",
        category: "smart-edit" as ToolOwnerCategory,
        slug: "product-refine",
        route: "/tools/smart-edit/product-refine",
        makeType: 56,
        origin: "original",
        layout: "enhance",
        adapter: "image",
        batchCapable: true,
        enabled: true,
        fields: [f("color", "color"), f("imageOutputLength", "upload"), f("imageSegUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("imgTransform", "unspecified"), f("isRmBg", "boolean", REQUIRED, { defaultValue: false, providerRule: "boolean" }), f("ratio", "ratio", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" }), f("realImageUrl", "upload", REQUIRED, { providerRule: "string(URL)" })],
    },
    {
        id: "FIX_COLOR",
        index: 12,
        title: "色差修复",
        category: "smart-edit" as ToolOwnerCategory,
        slug: "fix-color",
        route: "/tools/smart-edit/fix-color",
        makeType: 26,
        origin: "original",
        layout: "repair",
        adapter: "image",
        batchCapable: false,
        enabled: true,
        fields: [f("fixColorSegUrl", "color", REQUIRED, { providerRule: "string(URL)" }), f("fixColorUrl", "color", REQUIRED, { providerRule: "string(URL)" }), f("imageName", "upload"), f("imageResultUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("imageSegUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("version", "unspecified")],
    },
    {
        id: "PRINTING_REPAIR",
        index: 13,
        title: "印花修复",
        category: "smart-edit" as ToolOwnerCategory,
        slug: "printing-repair",
        route: "/tools/smart-edit/printing-repair",
        makeType: 29,
        origin: "original",
        layout: "repair",
        adapter: "image",
        batchCapable: false,
        enabled: true,
        fields: [f("config", "unspecified"), f("height", "number"), f("imageResultUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("point", "unspecified"), f("rotate", "unspecified"), f("scale", "unspecified"), f("stampingFlowerSegUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("stampingFlowerUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("targetConfig", "unspecified"), f("url", "upload"), f("version", "unspecified"), f("width", "number")],
    },
    {
        id: "HAND_REPAIR",
        index: 14,
        title: "手部修复",
        category: "smart-edit" as ToolOwnerCategory,
        slug: "hand-repair",
        route: "/tools/smart-edit/hand-repair",
        makeType: 31,
        origin: "original",
        layout: "repair",
        adapter: "image",
        batchCapable: false,
        enabled: true,
        fields: [f("imageName", "upload"), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("maskUrl", "mask", REQUIRED, { providerRule: "string(URL)" }), f("outputNum", "number", REQUIRED, { defaultValue: 1, providerRule: "integer" }), f("personType", "select", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" })],
    },
    {
        id: "NEW_REPLACE_BG_V2",
        index: 15,
        title: "商品图",
        category: "product-design" as ToolOwnerCategory,
        slug: "new-replace-bg-v2",
        route: "/tools/product-design/new-replace-bg-v2",
        makeType: 28,
        origin: "original",
        layout: "scene",
        adapter: "image",
        batchCapable: false,
        enabled: true,
        fields: [],
        notes: "无独立 make 字段：提交由页面图层合成状态序列化（page-specs/15-new-replace-bg-v2.md）。",
    },
    {
        id: "REPLACE_GOODS",
        index: 16,
        title: "商品替换",
        category: "product-design" as ToolOwnerCategory,
        slug: "replace-goods",
        route: "/tools/product-design/replace-goods",
        makeType: 12,
        origin: "original",
        layout: "replace",
        adapter: "image",
        batchCapable: false,
        enabled: true,
        fields: [f("config", "unspecified"), f("cutoutProvider", "unspecified"), f("denoiseStrength", "unspecified"), f("height", "number"), f("imageName", "upload"), f("imageOutputHeight", "upload"), f("imageOutputWidth", "upload"), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("lockImageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("maskUrl", "mask", REQUIRED, { providerRule: "string(URL)" }), f("outputNum", "number", REQUIRED, { defaultValue: 1, providerRule: "integer" }), f("point", "unspecified"), f("ratio", "ratio", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" }), f("rotate", "unspecified"), f("scale", "unspecified"), f("sourceImageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("sourceOriginUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("targetConfig", "unspecified"), f("targetImageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("targetOriginUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("url", "upload"), f("width", "number")],
    },
    {
        id: "PRODUCT_SCENE",
        index: 17,
        title: "场景裂变",
        category: "product-design" as ToolOwnerCategory,
        slug: "product-scene",
        route: "/tools/product-design/product-scene",
        makeType: 13,
        origin: "original",
        layout: "scene",
        adapter: "image",
        batchCapable: true,
        enabled: true,
        fields: [f("cutoutProvider", "unspecified"), f("imageName", "upload"), f("imageOutputHeight", "upload"), f("imageOutputWidth", "upload"), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("mode", "select", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" }), f("originImageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("outputNum", "number", REQUIRED, { defaultValue: 1, providerRule: "integer" }), f("prompt", "textarea", false, { providerRule: "string" }), f("provider", "unspecified"), f("ratio", "ratio", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" }), f("sceneKeyword", "unspecified"), f("segImageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("sizeType", "unspecified"), f("strength", "unspecified")],
    },
    {
        id: "HANDHELD_GOODS",
        index: 18,
        title: "手持商品",
        category: "product-design" as ToolOwnerCategory,
        slug: "handheld-goods",
        route: "/tools/product-design/handheld-goods",
        makeType: 49,
        origin: "original",
        layout: "model",
        adapter: "image",
        batchCapable: false,
        enabled: true,
        fields: [f("checkType", "unspecified"), f("imageMaskUrl", "mask", REQUIRED, { providerRule: "string(URL)" }), f("imageResultUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("modelId", "select", false, { enumSource: "model-catalog" }), f("modelTabType", "unspecified"), f("outputNum", "number", REQUIRED, { defaultValue: 1, providerRule: "integer" }), f("sceneTabType", "unspecified"), f("targetMaskUrl", "mask", REQUIRED, { providerRule: "string(URL)" }), f("targetOriginUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("targetResultUrl", "upload", REQUIRED, { providerRule: "string(URL)" })],
    },
    {
        id: "AI_DRESSING_V2",
        index: 19,
        title: "AI穿衣",
        category: "product-design" as ToolOwnerCategory,
        slug: "ai-dressing-v2",
        route: "/tools/product-design/ai-dressing-v2",
        makeType: 24,
        origin: "original",
        layout: "dress",
        adapter: "image",
        batchCapable: false,
        enabled: true,
        fields: [f("coverList", "asset-list", false, { providerRule: "array/object" }), f("downImageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("downMaskUrl", "mask", REQUIRED, { providerRule: "string(URL)" }), f("downOriginUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("genOriRes", "unspecified"), f("images", "asset-list"), f("isSecondOperate", "boolean", REQUIRED, { defaultValue: false, providerRule: "boolean" }), f("modelPose", "unspecified"), f("modelPoseList", "unspecified", false, { providerRule: "array/object" }), f("modelType", "select", false, { enumSource: "model-catalog" }), f("name", "unspecified"), f("outputNum", "number", REQUIRED, { defaultValue: 1, providerRule: "integer" }), f("provider", "unspecified"), f("suitImageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("suitMaskUrl", "mask", REQUIRED, { providerRule: "string(URL)" }), f("suitOriginUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("upperImageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("upperMaskUrl", "mask", REQUIRED, { providerRule: "string(URL)" }), f("upperOriginUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("version", "unspecified")],
    },
    {
        id: "AI_POSTURE",
        index: 20,
        title: "姿势裂变",
        category: "product-design" as ToolOwnerCategory,
        slug: "ai-posture",
        route: "/tools/product-design/ai-posture",
        makeType: 58,
        origin: "original",
        layout: "model",
        adapter: "image",
        batchCapable: false,
        enabled: true,
        fields: [f("imageTags", "upload"), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("outputNum", "number", REQUIRED, { defaultValue: 1, providerRule: "integer" }), f("prompt", "textarea", false, { providerRule: "string" })],
    },
    {
        id: "AI_WEARABLE",
        index: 21,
        title: "AI穿戴",
        category: "product-design" as ToolOwnerCategory,
        slug: "ai-wearable",
        route: "/tools/product-design/ai-wearable",
        makeType: 34,
        origin: "original",
        layout: "dress",
        adapter: "image",
        batchCapable: false,
        enabled: true,
        fields: [f("checkType", "unspecified"), f("imageMaskUrl", "mask", REQUIRED, { providerRule: "string(URL)" }), f("imageResultUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("isSecondOperate", "boolean", REQUIRED, { defaultValue: false, providerRule: "boolean" }), f("modelId", "select", false, { enumSource: "model-catalog" }), f("modelTabType", "unspecified"), f("outputNum", "number", REQUIRED, { defaultValue: 4, providerRule: "integer" }), f("productCategory", "unspecified"), f("sceneTabType", "unspecified"), f("targetMaskUrl", "mask", REQUIRED, { providerRule: "string(URL)" }), f("targetOriginUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("targetResultUrl", "upload", REQUIRED, { providerRule: "string(URL)" })],
    },
    {
        id: "AI_TEXT",
        index: 22,
        title: "POD素材",
        category: "product-design" as ToolOwnerCategory,
        slug: "ai-text",
        route: "/tools/product-design/ai-text",
        makeType: 14,
        origin: "original",
        layout: "pod",
        adapter: "image",
        batchCapable: true,
        enabled: true,
        fields: [f("aiSimpleTextPrompt", "textarea"), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("isCase", "boolean", REQUIRED, { defaultValue: false, providerRule: "boolean" }), f("mode", "select", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" }), f("outputNum", "number", REQUIRED, { defaultValue: 1, providerRule: "integer" }), f("prompt", "textarea", false, { providerRule: "string" }), f("ratio", "ratio", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" }), f("requestId", "unspecified"), f("responseId", "unspecified"), f("styles", "select", false, { enumSource: "model-catalog" }), f("stylesCn", "select", false, { enumSource: "model-catalog" }), f("tilingPreset", "boolean"), f("useAutopromptOption", "unspecified", REQUIRED, { defaultValue: false, providerRule: "boolean" }), f("variationStrength", "boolean")],
    },
    {
        id: "ORNAMENT_TEXT",
        index: 23,
        title: "饰品文字",
        category: "product-design" as ToolOwnerCategory,
        slug: "ornament-text",
        route: "/tools/product-design/ornament-text",
        makeType: 17,
        origin: "original",
        layout: "text",
        adapter: "image",
        batchCapable: false,
        enabled: true,
        fields: [f("fontSize", "number"), f("fontname", "unspecified"), f("left", "unspecified"), f("prompt", "textarea", false, { providerRule: "string" }), f("right", "unspecified")],
    },
    {
        id: "SDS_DESIGN",
        index: 24,
        title: "素材贴合",
        category: "product-design" as ToolOwnerCategory,
        slug: "sds-design",
        route: "/tools/product-design/sds-design",
        makeType: 22,
        origin: "original",
        layout: "pod",
        adapter: "image",
        batchCapable: false,
        enabled: true,
        fields: [f("imageList", "asset-list", false, { providerRule: "array/object" }), f("imageName", "upload"), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("materialList", "unspecified", false, { providerRule: "array/object" }), f("productId", "unspecified")],
    },
    {
        id: "PRINT_EXTRACT",
        index: 25,
        title: "印花提取",
        category: "product-design" as ToolOwnerCategory,
        slug: "print-extract",
        route: "/tools/product-design/print-extract",
        makeType: 60,
        origin: "original",
        layout: "extract",
        adapter: "image",
        batchCapable: false,
        enabled: true,
        fields: [f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("isTransparent", "boolean", REQUIRED, { defaultValue: false, providerRule: "boolean" })],
    },
    {
        id: "AI_POSE_GENERATOR",
        index: 26,
        title: "AI姿势生成",
        category: "product-design" as ToolOwnerCategory,
        slug: "ai-pose-generator",
        route: "/tools/product-design/ai-pose-generator",
        makeType: 57,
        origin: "supplemental",
        layout: "model",
        adapter: "image",
        batchCapable: false,
        enabled: true,
        fields: [f("prompt", "textarea", false, { providerRule: "string" }), f("scenePrompts", "textarea", false, { providerRule: "array/object" })],
    },
    {
        id: "AI_DRESSING_XSY",
        index: 27,
        title: "AI试衣XSY",
        category: "product-design" as ToolOwnerCategory,
        slug: "ai-dressing-xsy",
        route: "/tools/product-design/ai-dressing-xsy",
        makeType: 39,
        origin: "supplemental",
        layout: "dress",
        adapter: "image",
        batchCapable: false,
        enabled: true,
        fields: [f("downImageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("downMaskUrl", "mask", REQUIRED, { providerRule: "string(URL)" }), f("downOriginUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("modelImageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("modelPose", "unspecified"), f("modelStyle", "unspecified"), f("modelType", "select", false, { enumSource: "model-catalog" }), f("outputNum", "number", REQUIRED, { defaultValue: 1, providerRule: "integer" }), f("provider", "unspecified"), f("step", "unspecified"), f("suitImageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("suitMaskUrl", "mask", REQUIRED, { providerRule: "string(URL)" }), f("suitOriginUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("upperImageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("upperMaskUrl", "mask", REQUIRED, { providerRule: "string(URL)" }), f("upperOriginUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("version", "unspecified")],
    },
    {
        id: "FISSION_LINK",
        index: 28,
        title: "链接裂变",
        category: "product-design" as ToolOwnerCategory,
        slug: "fission-link",
        route: "/tools/product-design/fission-link",
        makeType: 83,
        origin: "supplemental",
        layout: "scene",
        adapter: "image",
        batchCapable: false,
        enabled: true,
        fields: [f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("outputNum", "number", REQUIRED, { defaultValue: 1, providerRule: "integer" })],
    },
    {
        id: "IMAGE_TEXT_EDIT",
        index: 29,
        title: "图片文字编辑",
        category: "product-design" as ToolOwnerCategory,
        slug: "image-text-edit",
        route: "/tools/product-design/image-text-edit",
        makeType: 78,
        origin: "supplemental",
        layout: "text",
        adapter: "image",
        batchCapable: false,
        enabled: true,
        fields: [f("boxes", "unspecified"), f("imageFormat", "upload"), f("imageHeight", "upload"), f("imageName", "upload"), f("imageSize", "upload"), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("imageWidth", "upload"), f("resultImageUrl", "upload", REQUIRED, { providerRule: "string(URL)" })],
    },
    {
        id: "MATERIAL_UPPER_BODY",
        index: 30,
        title: "商品预览效果",
        category: "product-design" as ToolOwnerCategory,
        slug: "material-upper-body",
        route: "/tools/product-design/material-upper-body",
        makeType: 16,
        origin: "supplemental",
        layout: "dress",
        adapter: "image",
        batchCapable: false,
        enabled: true,
        fields: [f("categoryIds", "unspecified"), f("categoryName", "unspecified"), f("imageName", "upload"), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("isMatting", "boolean", REQUIRED, { defaultValue: false, providerRule: "boolean" }), f("outputNum", "number", REQUIRED, { defaultValue: 1, providerRule: "integer" }), f("subType", "unspecified")],
    },
    {
        id: "NEW_DESIGNER",
        index: 31,
        title: "商品图设计器",
        category: "product-design" as ToolOwnerCategory,
        slug: "new-designer",
        route: "/tools/product-design/new-designer",
        makeType: 99,
        origin: "supplemental",
        layout: "designer",
        adapter: "designer-host",
        batchCapable: false,
        enabled: true,
        fields: [f("designerId", "unspecified"), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("isDesignerUse", "boolean", REQUIRED, { defaultValue: false, providerRule: "boolean" }), f("onClose", "unspecified", REQUIRED, { providerRule: "callback" }), f("onDone", "unspecified", REQUIRED, { providerRule: "callback" }), f("open", "unspecified", REQUIRED, { defaultValue: false, providerRule: "boolean" })],
    },
    {
        id: "PRODUCT_MARKET_MATERIAL",
        index: 32,
        title: "商品营销素材",
        category: "product-design" as ToolOwnerCategory,
        slug: "product-market-material",
        route: "/tools/product-design/product-market-material",
        makeType: 64,
        origin: "supplemental",
        layout: "suite",
        adapter: "image",
        batchCapable: false,
        enabled: true,
        fields: [f("APlusAspectRatio", "unspecified"), f("aspectRatio", "ratio", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" }), f("brandDNA", "unspecified"), f("brandKey", "unspecified"), f("brandName", "unspecified"), f("coverList", "asset-list", false, { providerRule: "array/object" }), f("images", "asset-list"), f("isCustomAspectRatio", "boolean", REQUIRED, { defaultValue: false, providerRule: "boolean" }), f("language", "unspecified"), f("name", "unspecified"), f("platform", "unspecified"), f("provider", "unspecified"), f("quality", "select", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" }), f("resolution", "unspecified", REQUIRED, { providerRule: "string enum" }), f("salesRegion", "unspecified")],
    },
    {
        id: "SCENE_TRANSFER",
        index: 33,
        title: "场景迁移",
        category: "product-design" as ToolOwnerCategory,
        slug: "scene-transfer",
        route: "/tools/product-design/scene-transfer",
        makeType: 63,
        origin: "supplemental",
        layout: "scene",
        adapter: "image",
        batchCapable: false,
        enabled: true,
        fields: [f("imageStyleUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("segImageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("similarity", "unspecified")],
    },
    {
        id: "IMAGE_TO_VIDEO",
        index: 34,
        title: "图转视频",
        category: "ai-video" as ToolOwnerCategory,
        slug: "image-to-video",
        route: "/tools/ai-video/image-to-video",
        makeType: 30,
        origin: "original",
        layout: "video",
        adapter: "video",
        batchCapable: true,
        enabled: true,
        fields: [f("aspectRatio", "ratio", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" }), f("duration", "number"), f("extension", "unspecified"), f("fileKey", "unspecified"), f("fileName", "unspecified"), f("imageInputMode", "upload"), f("imageList", "asset-list", false, { providerRule: "array/object" }), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("isPro", "boolean", REQUIRED, { defaultValue: false, providerRule: "boolean" }), f("language", "unspecified"), f("lastFrameImageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("productInfo", "unspecified"), f("productUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("prompt", "textarea", false, { providerRule: "string" }), f("promptOptimizer", "unspecified"), f("referenceAudios", "upload"), f("referenceDocument", "upload"), f("referenceVideo", "upload"), f("saleCountry", "unspecified"), f("size", "json"), f("sourceImageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("templateKey", "unspecified"), f("templateName", "unspecified"), f("thumbUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("url", "upload"), f("videoTime", "upload"), f("videoType", "select", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" })],
    },
    {
        id: "SALE_VIDEO",
        index: 35,
        title: "带货口播",
        category: "ai-video" as ToolOwnerCategory,
        slug: "sale-video",
        route: "/tools/ai-video/sale-video",
        makeType: 73,
        origin: "original",
        layout: "video",
        adapter: "video",
        batchCapable: false,
        enabled: true,
        fields: [f("aspectRatio", "ratio", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" }), f("hiddenPrompt", "textarea"), f("imageList", "asset-list", false, { providerRule: "array/object" }), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("isPro", "boolean", REQUIRED, { defaultValue: false, providerRule: "boolean" }), f("language", "unspecified"), f("prompt", "textarea", false, { providerRule: "string" }), f("resolution", "unspecified", REQUIRED, { providerRule: "string enum" }), f("saleCountry", "unspecified"), f("videoTime", "upload"), f("videoType", "select", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" }), f("visiblePrompt", "textarea")],
    },
    {
        id: "VIDEO_REPLICATION",
        index: 36,
        title: "视频复刻",
        category: "ai-video" as ToolOwnerCategory,
        slug: "video-replication",
        route: "/tools/ai-video/video-replication",
        makeType: 89,
        origin: "original",
        layout: "video",
        adapter: "video",
        batchCapable: false,
        enabled: true,
        fields: [f("analyzeRedisKey", "unspecified"), f("aspectRatio", "ratio", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" }), f("clipEnd", "unspecified"), f("clipMode", "unspecified"), f("clipStart", "unspecified"), f("coverUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("duration", "number"), f("imageSegUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("isPro", "boolean", REQUIRED, { defaultValue: false, providerRule: "boolean" }), f("originalVideoId", "upload"), f("originalVideoUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("prompt", "textarea", false, { providerRule: "string" }), f("promptOptimizer", "unspecified"), f("ratio", "ratio", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" }), f("refImageList", "upload", false, { providerRule: "array/object" }), f("refVideoName", "upload"), f("refVideoUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("resolution", "unspecified", REQUIRED, { providerRule: "string enum" }), f("saleCountry", "unspecified"), f("sourceVideoDuration", "upload"), f("sourceVideoUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("targetLanguage", "select", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" }), f("videoCoverType", "upload"), f("videoSource", "upload"), f("videoTime", "upload"), f("videoType", "select", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" })],
    },
    {
        id: "AI_VIDEO_EDITING",
        index: 37,
        title: "视频编辑",
        category: "ai-video" as ToolOwnerCategory,
        slug: "ai-video-editing",
        route: "/tools/ai-video/ai-video-editing",
        makeType: 95,
        origin: "original",
        layout: "video",
        adapter: "video",
        batchCapable: false,
        enabled: true,
        fields: [f("duration", "number"), f("outputNum", "number", REQUIRED, { defaultValue: 1, providerRule: "integer" }), f("prompt", "textarea", false, { providerRule: "string" }), f("refImageUrls", "upload", false, { providerRule: "array/object" }), f("sourceVideoDuration", "upload"), f("sourceVideoUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("videoType", "select", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" })],
    },
    {
        id: "VIDEO_TRANSLATION",
        index: 38,
        title: "视频翻译",
        category: "ai-video" as ToolOwnerCategory,
        slug: "video-translation",
        route: "/tools/ai-video/video-translation",
        makeType: 96,
        origin: "original",
        layout: "video",
        adapter: "video",
        batchCapable: false,
        enabled: true,
        fields: [f("lipSync", "boolean", REQUIRED, { defaultValue: true, providerRule: "boolean" }), f("outputNum", "number", REQUIRED, { defaultValue: 1, providerRule: "integer" }), f("sourceLanguage", "select", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" }), f("sourceVideoName", "upload"), f("sourceVideoUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("targetLanguage", "select", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" }), f("videoType", "select", REQUIRED, { enumSource: "model-catalog", providerRule: "string enum" })],
    },
    {
        id: "VIDEO_CONCAT",
        index: 39,
        title: "视频拼接",
        category: "ai-video" as ToolOwnerCategory,
        slug: "video-concat",
        route: "/tools/ai-video/video-concat",
        makeType: 52,
        origin: "supplemental",
        layout: "video",
        adapter: "video",
        batchCapable: false,
        enabled: true,
        fields: [f("editType", "unspecified"), f("imageFormat", "upload"), f("imageHeight", "upload"), f("imageSize", "upload"), f("imageUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("imageWidth", "upload"), f("videoCoverUrl", "upload", REQUIRED, { providerRule: "string(URL)" }), f("videoList", "asset-list", false, { providerRule: "array/object" }), f("videoRatio", "upload"), f("videoTime", "upload")],
    },
];

/** Alias kept for consumers that expect the matrix name. */
export const TOOLS = toolSpecs;

export const TOOL_COUNT = toolSpecs.length;

export const TOOL_CENTER_FLAG = "VITE_FEATURE_LINKFOX_TOOLS" as const;

export type ToolCenterEnv = Partial<Record<typeof TOOL_CENTER_FLAG, string>>;

export interface ToolCategoryMeta {
    slug: ToolCategory;
    labelZh: string;
    labelEn: string;
    ownsTools: boolean;
    /** Number of specs in this category (0 for orchestration-only entrances). */
    toolCount: number;
}

export const TOOL_CATEGORY_META: readonly ToolCategoryMeta[] = [
    { slug: "ecommerce-suite", labelZh: "电商套图", labelEn: "E-commerce suite", ownsTools: true, toolCount: 6 },
    { slug: "smart-edit", labelZh: "智能修图", labelEn: "Smart edit", ownsTools: true, toolCount: 8 },
    { slug: "batch-generate", labelZh: "批量生图", labelEn: "Batch generate", ownsTools: false, toolCount: 0 },
    { slug: "product-design", labelZh: "商品图设计", labelEn: "Product design", ownsTools: true, toolCount: 19 },
    { slug: "ai-video", labelZh: "AI 视频", labelEn: "AI video", ownsTools: true, toolCount: 6 },
];

/** Tools referenced by the batch orchestration entrance (order = evidence order). */
export const BATCH_TOOL_IDS: readonly string[] = ["PRODUCT_IMAGE_SUITE", "DRESS_WEAR_SET", "IMAGE_TRANSLATION", "SCALE_UP", "AI_OUTPAINTING", "AREA_REPAIR", "CHANGE_COLOR", "IMAGE_CROP", "PRODUCT_REFINE", "PRODUCT_SCENE", "AI_TEXT", "IMAGE_TO_VIDEO"];

const byId = new Map<string, ToolSpec>();
const byRoute = new Map<string, ToolSpec>();
const byCategory = new Map<ToolOwnerCategory, ToolSpec[]>();

for (const spec of toolSpecs) {
    byId.set(spec.id, spec);
    byRoute.set(spec.route, spec);
    const bucket = byCategory.get(spec.category);
    if (bucket) bucket.push(spec);
    else byCategory.set(spec.category, [spec]);
}

export const toolsById: ReadonlyMap<string, ToolSpec> = byId;
export const toolsByRoute: ReadonlyMap<string, ToolSpec> = byRoute;
export const toolsByCategory: ReadonlyMap<ToolOwnerCategory, readonly ToolSpec[]> = byCategory;

export function getToolById(id: string): ToolSpec | undefined {
    return byId.get(id);
}

export function getToolBySlug(category: ToolOwnerCategory, slug: string): ToolSpec | undefined {
    return byRoute.get(canonicalToolRoute(category, slug));
}

export function getToolByRoute(route: string): ToolSpec | undefined {
    // Router links normalize with a trailing slash; keep one canonical key.
    const normalized = route.length > 1 && route.endsWith("/") ? route.slice(0, -1) : route;
    return byRoute.get(normalized);
}

export function listToolsByCategory(category: ToolOwnerCategory): readonly ToolSpec[] {
    return byCategory.get(category) ?? [];
}

export function getCategoryDefaultTool(category: ToolOwnerCategory): ToolSpec | undefined {
    return listToolsByCategory(category).find((spec) => spec.enabled);
}

/**
 * Splits `/tools/<category>/<slug>` without touching the DOM (safe in tests and workers).
 * Returns null for non-tool paths, unknown categories and category-only paths.
 */
export function parseToolRoute(path: string): { category: ToolOwnerCategory; slug: string; tool?: ToolSpec } | null {
    const match = /^\/tools\/([a-z0-9-]+)\/([a-z0-9-]+)\/?$/.exec(path);
    if (!match) return null;
    const category = match[1] as ToolOwnerCategory;
    if (!TOOL_CATEGORY_META.some((meta) => meta.slug === category && meta.ownsTools)) return null;
    const tool = getToolBySlug(category, match[2]);
    return { category, slug: match[2], tool };
}

/**
 * Feature flag for the whole tool center. Rollback switch: set `VITE_FEATURE_LINKFOX_TOOLS=false`.
 * Unset means enabled (the registry itself stays the source of truth, per-tool `enabled` still applies).
 */
export function isToolCenterEnabled(env?: ToolCenterEnv): boolean {
    const raw = env?.[TOOL_CENTER_FLAG] ?? readBuildEnv(TOOL_CENTER_FLAG);
    if (raw === undefined || raw === "") return true;
    return !["0", "false", "off", "disabled", "no"].includes(raw.trim().toLowerCase());
}

function readBuildEnv(key: string): string | undefined {
    try {
        const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
        const value = env?.[key];
        return typeof value === "string" ? value : undefined;
    } catch {
        return undefined;
    }
}

/** Tools visible in navigation: flag on + per-tool enabled. */
export function getEnabledTools(env?: ToolCenterEnv): readonly ToolSpec[] {
    if (!isToolCenterEnabled(env)) return [];
    return toolSpecs.filter((spec) => spec.enabled);
}

/** Batch reference resolution; unknown ids are dropped instead of producing dead links. */
export function getBatchTools(): readonly ToolSpec[] {
    return BATCH_TOOL_IDS.flatMap((id) => {
        const tool = byId.get(id);
        return tool && tool.batchCapable ? [tool] : [];
    });
}

/** Structural + cross-entry diagnostics; empty array means the registry is coherent. */
export function registryIssues(): string[] {
    const issues: string[] = [];
    const seenIds = new Set<string>();
    const seenIndexes = new Set<number>();
    const seenRoutes = new Set<string>();
    const seenMakeTypes = new Set<number>();

    for (const spec of toolSpecs) {
        issues.push(...collectToolSpecIssues(spec, spec.id));
        if (seenIds.has(spec.id)) issues.push(`duplicate tool id: ${spec.id}`);
        if (seenIndexes.has(spec.index)) issues.push(`duplicate tool index: ${spec.index}`);
        if (seenRoutes.has(spec.route)) issues.push(`duplicate tool route: ${spec.route}`);
        if (seenMakeTypes.has(spec.makeType)) issues.push(`duplicate makeType: ${spec.makeType} (${spec.id})`);
        seenIds.add(spec.id);
        seenIndexes.add(spec.index);
        seenRoutes.add(spec.route);
        seenMakeTypes.add(spec.makeType);
    }

    for (let expected = 1; expected <= toolSpecs.length; expected += 1) {
        if (!seenIndexes.has(expected)) issues.push(`missing tool index: ${expected}`);
    }

    for (const id of BATCH_TOOL_IDS) {
        const tool = byId.get(id);
        if (!tool) issues.push(`batch reference to unknown tool: ${id}`);
        else if (!tool.batchCapable) issues.push(`batch reference to non-batch tool: ${id}`);
    }

    return issues;
}

export function assertToolRegistry(): void {
    const issues = registryIssues();
    if (issues.length > 0) throw new Error(`invalid tool registry:\n${issues.join("\n")}`);
}

