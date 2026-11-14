import {
    Boxes,
    Brush,
    Captions,
    Clapperboard,
    Combine,
    Contrast,
    Copy,
    Crop,
    Eraser,
    FileText,
    Film,
    Frame,
    ImagePlus,
    Images,
    Languages,
    Layers,
    LayoutGrid,
    LayoutTemplate,
    Maximize2,
    Merge,
    Move3d,
    Package,
    Palette,
    PanelsTopLeft,
    PenTool,
    PersonStanding,
    Pipette,
    Repeat,
    ScanText,
    Scissors,
    Settings2,
    Shirt,
    Sparkles,
    SquarePen,
    Sticker,
    Type,
    UserCog,
    UserRound,
    Users,
    Video,
    Wand2,
    WandSparkles,
    type LucideIcon,
} from "lucide-react";

/**
 * Legacy application navigation (canvas / image / video / prompts / assets / config).
 * Kept for existing pages (`src/pages/home/index.tsx` uses `navigationTools[0]`).
 */
export const navigationTools = [
    {
        slug: "canvas",
        icon: Maximize2,
    },
    {
        slug: "image",
        icon: ImagePlus,
    },
    {
        slug: "video",
        icon: Video,
    },
    {
        slug: "prompts",
        icon: FileText,
    },
    {
        slug: "assets",
        icon: Images,
    },
    {
        slug: "config",
        icon: Settings2,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];

/** Tool categories of the LinkFox five-category navigation, in canonical display order. */
export const toolCategorySlugs = ["ecommerce-suite", "smart-edit", "batch-generate", "product-design", "ai-video"] as const;

export type ToolCategorySlug = (typeof toolCategorySlugs)[number];

/** Internal short key used by `tool_specs.json` (`suite` / `edit` / `batch` / `design` / `video`). */
export type ToolCategoryKey = "suite" | "edit" | "batch" | "design" | "video";

/** `original` = present in the five LinkFox draw menus; `supplemental` = added relationship (neutral badge, never a warning colour). */
export type ToolOrigin = "original" | "supplemental";

/** The 39 canonical tool type ids of `docs/V1.0/plan_linkfox_navigation/tool_specs.json`. */
export type ToolId =
    | "PRODUCT_IMAGE_SUITE"
    | "DRESS_WEAR_SET"
    | "CHANGE_COLOR_V2"
    | "IMAGE_TRANSLATION"
    | "SCALE_UP"
    | "AI_OUTPAINTING"
    | "AREA_REPAIR"
    | "REMOVE_PEN"
    | "CHANGE_COLOR"
    | "IMAGE_CROP"
    | "PRODUCT_REFINE"
    | "FIX_COLOR"
    | "PRINTING_REPAIR"
    | "HAND_REPAIR"
    | "NEW_REPLACE_BG_V2"
    | "REPLACE_GOODS"
    | "PRODUCT_SCENE"
    | "HANDHELD_GOODS"
    | "AI_DRESSING_V2"
    | "AI_POSTURE"
    | "AI_WEARABLE"
    | "AI_TEXT"
    | "ORNAMENT_TEXT"
    | "SDS_DESIGN"
    | "PRINT_EXTRACT"
    | "AI_POSE_GENERATOR"
    | "AI_DRESSING_XSY"
    | "FISSION_LINK"
    | "IMAGE_TEXT_EDIT"
    | "MATERIAL_UPPER_BODY"
    | "NEW_DESIGNER"
    | "PRODUCT_MARKET_MATERIAL"
    | "SCENE_TRANSFER"
    | "IMAGE_TO_VIDEO"
    | "SALE_VIDEO"
    | "VIDEO_REPLICATION"
    | "AI_VIDEO_EDITING"
    | "VIDEO_TRANSLATION"
    | "VIDEO_CONCAT"
    | "WHITE_BACKGROUND"
    | "IMAGE_REPLICATION"
    | "BATCH_MATTING";

export type ToolNavigationItem = {
    /** Upstream `type` of the tool, unique across the registry. */
    id: ToolId;
    category: ToolCategorySlug;
    categoryKey: ToolCategoryKey;
    /** URL segment of the tool inside its category. */
    slug: string;
    /** Canonical route `/tools/:category/:toolId`. */
    route: string;
    origin: ToolOrigin;
    batchCapable: boolean;
    icon: LucideIcon;
    /** i18n key of the localized label, e.g. `toolsNav.tools.PRODUCT_IMAGE_SUITE`. */
    labelKey: string;
};

/**
 * 主项右上角小徽标，取值对齐原站实测的两种：`智能修图` 的「新模型」与 `AI视频` 的「HOT」。
 * 角标沿用画布品牌色：品牌色半透明底 + 品牌色文字，10px/600。
 */
export type ToolNavigationBadge = "newModel" | "hot";

export type ToolNavigationCategory = {
    slug: ToolCategorySlug;
    key: ToolCategoryKey;
    icon: LucideIcon;
    /** Category entry route; `batch-generate` is an orchestration page, the others redirect to their default tool. */
    route: string;
    toolIds: ToolId[];
    labelKey: string;
    descriptionKey: string;
    /** 可选主项徽标，渲染在原站相同位置（见 {@link ToolNavigationCategory} 注释）。 */
    badge?: ToolNavigationBadge;
};

export const toolNavigationItems: readonly ToolNavigationItem[] = [
    {
        id: "PRODUCT_IMAGE_SUITE",
        category: "ecommerce-suite",
        categoryKey: "suite",
        slug: "product-image-suite",
        route: "/tools/ecommerce-suite/product-image-suite",
        origin: "original",
        batchCapable: true,
        icon: Images,
        labelKey: "toolsNav.tools.PRODUCT_IMAGE_SUITE",
    },
    {
        id: "DRESS_WEAR_SET",
        category: "ecommerce-suite",
        categoryKey: "suite",
        slug: "dress-wear-set",
        route: "/tools/ecommerce-suite/dress-wear-set",
        origin: "original",
        batchCapable: true,
        icon: Shirt,
        labelKey: "toolsNav.tools.DRESS_WEAR_SET",
    },
    {
        id: "WHITE_BACKGROUND",
        category: "ecommerce-suite",
        categoryKey: "suite",
        slug: "white-background",
        route: "/tools/ecommerce-suite/white-background",
        origin: "original",
        batchCapable: false,
        icon: SquarePen,
        labelKey: "toolsNav.tools.WHITE_BACKGROUND",
    },
    {
        id: "IMAGE_REPLICATION",
        category: "ecommerce-suite",
        categoryKey: "suite",
        slug: "image-replication",
        route: "/tools/ecommerce-suite/image-replication",
        origin: "original",
        batchCapable: false,
        icon: Copy,
        labelKey: "toolsNav.tools.IMAGE_REPLICATION",
    },
    {
        id: "CHANGE_COLOR_V2",
        category: "ecommerce-suite",
        categoryKey: "suite",
        slug: "change-color-v2",
        route: "/tools/ecommerce-suite/change-color-v2",
        origin: "original",
        batchCapable: false,
        icon: Palette,
        labelKey: "toolsNav.tools.CHANGE_COLOR_V2",
    },
    {
        id: "IMAGE_TRANSLATION",
        category: "ecommerce-suite",
        categoryKey: "suite",
        slug: "image-translation",
        route: "/tools/ecommerce-suite/image-translation",
        origin: "original",
        batchCapable: true,
        icon: Languages,
        labelKey: "toolsNav.tools.IMAGE_TRANSLATION",
    },
    {
        id: "SCALE_UP",
        category: "ecommerce-suite",
        categoryKey: "suite",
        slug: "scale-up",
        route: "/tools/ecommerce-suite/scale-up",
        origin: "original",
        batchCapable: true,
        icon: Maximize2,
        labelKey: "toolsNav.tools.SCALE_UP",
    },
    {
        id: "AI_OUTPAINTING",
        category: "ecommerce-suite",
        categoryKey: "suite",
        slug: "ai-outpainting",
        route: "/tools/ecommerce-suite/ai-outpainting",
        origin: "original",
        batchCapable: true,
        icon: Frame,
        labelKey: "toolsNav.tools.AI_OUTPAINTING",
    },
    {
        id: "BATCH_MATTING",
        category: "smart-edit",
        categoryKey: "edit",
        slug: "batch-matting",
        route: "/tools/smart-edit/batch-matting",
        origin: "original",
        batchCapable: false,
        icon: Scissors,
        labelKey: "toolsNav.tools.BATCH_MATTING",
    },
    {
        id: "AREA_REPAIR",
        category: "smart-edit",
        categoryKey: "edit",
        slug: "area-repair",
        route: "/tools/smart-edit/area-repair",
        origin: "original",
        batchCapable: true,
        icon: Brush,
        labelKey: "toolsNav.tools.AREA_REPAIR",
    },
    {
        id: "REMOVE_PEN",
        category: "smart-edit",
        categoryKey: "edit",
        slug: "remove-pen",
        route: "/tools/smart-edit/remove-pen",
        origin: "original",
        batchCapable: false,
        icon: Eraser,
        labelKey: "toolsNav.tools.REMOVE_PEN",
    },
    {
        id: "CHANGE_COLOR",
        category: "smart-edit",
        categoryKey: "edit",
        slug: "change-color",
        route: "/tools/smart-edit/change-color",
        origin: "original",
        batchCapable: true,
        icon: Pipette,
        labelKey: "toolsNav.tools.CHANGE_COLOR",
    },
    {
        id: "IMAGE_CROP",
        category: "smart-edit",
        categoryKey: "edit",
        slug: "image-crop",
        route: "/tools/smart-edit/image-crop",
        origin: "original",
        batchCapable: true,
        icon: Crop,
        labelKey: "toolsNav.tools.IMAGE_CROP",
    },
    {
        id: "PRODUCT_REFINE",
        category: "smart-edit",
        categoryKey: "edit",
        slug: "product-refine",
        route: "/tools/smart-edit/product-refine",
        origin: "original",
        batchCapable: true,
        icon: Sparkles,
        labelKey: "toolsNav.tools.PRODUCT_REFINE",
    },
    {
        id: "FIX_COLOR",
        category: "smart-edit",
        categoryKey: "edit",
        slug: "fix-color",
        route: "/tools/smart-edit/fix-color",
        origin: "original",
        batchCapable: false,
        icon: Contrast,
        labelKey: "toolsNav.tools.FIX_COLOR",
    },
    {
        id: "PRINTING_REPAIR",
        category: "smart-edit",
        categoryKey: "edit",
        slug: "printing-repair",
        route: "/tools/smart-edit/printing-repair",
        origin: "original",
        batchCapable: false,
        icon: PenTool,
        labelKey: "toolsNav.tools.PRINTING_REPAIR",
    },
    {
        id: "HAND_REPAIR",
        category: "smart-edit",
        categoryKey: "edit",
        slug: "hand-repair",
        route: "/tools/smart-edit/hand-repair",
        origin: "original",
        batchCapable: false,
        icon: WandSparkles,
        labelKey: "toolsNav.tools.HAND_REPAIR",
    },
    {
        id: "NEW_REPLACE_BG_V2",
        category: "product-design",
        categoryKey: "design",
        slug: "new-replace-bg-v2",
        route: "/tools/product-design/new-replace-bg-v2",
        origin: "original",
        batchCapable: false,
        icon: ImagePlus,
        labelKey: "toolsNav.tools.NEW_REPLACE_BG_V2",
    },
    {
        id: "REPLACE_GOODS",
        category: "product-design",
        categoryKey: "design",
        slug: "replace-goods",
        route: "/tools/product-design/replace-goods",
        origin: "original",
        batchCapable: false,
        icon: Boxes,
        labelKey: "toolsNav.tools.REPLACE_GOODS",
    },
    {
        id: "PRODUCT_SCENE",
        category: "product-design",
        categoryKey: "design",
        slug: "product-scene",
        route: "/tools/product-design/product-scene",
        origin: "original",
        batchCapable: true,
        icon: LayoutGrid,
        labelKey: "toolsNav.tools.PRODUCT_SCENE",
    },
    {
        id: "HANDHELD_GOODS",
        category: "product-design",
        categoryKey: "design",
        slug: "handheld-goods",
        route: "/tools/product-design/handheld-goods",
        origin: "original",
        batchCapable: false,
        icon: UserRound,
        labelKey: "toolsNav.tools.HANDHELD_GOODS",
    },
    {
        id: "AI_DRESSING_V2",
        category: "product-design",
        categoryKey: "design",
        slug: "ai-dressing-v2",
        route: "/tools/product-design/ai-dressing-v2",
        origin: "original",
        batchCapable: false,
        icon: PersonStanding,
        labelKey: "toolsNav.tools.AI_DRESSING_V2",
    },
    {
        id: "AI_POSTURE",
        category: "product-design",
        categoryKey: "design",
        slug: "ai-posture",
        route: "/tools/product-design/ai-posture",
        origin: "original",
        batchCapable: false,
        icon: Move3d,
        labelKey: "toolsNav.tools.AI_POSTURE",
    },
    {
        id: "AI_WEARABLE",
        category: "product-design",
        categoryKey: "design",
        slug: "ai-wearable",
        route: "/tools/product-design/ai-wearable",
        origin: "original",
        batchCapable: false,
        icon: Shirt,
        labelKey: "toolsNav.tools.AI_WEARABLE",
    },
    {
        id: "AI_TEXT",
        category: "product-design",
        categoryKey: "design",
        slug: "ai-text",
        route: "/tools/product-design/ai-text",
        origin: "original",
        batchCapable: true,
        icon: Type,
        labelKey: "toolsNav.tools.AI_TEXT",
    },
    {
        id: "ORNAMENT_TEXT",
        category: "product-design",
        categoryKey: "design",
        slug: "ornament-text",
        route: "/tools/product-design/ornament-text",
        origin: "original",
        batchCapable: false,
        icon: Sticker,
        labelKey: "toolsNav.tools.ORNAMENT_TEXT",
    },
    {
        id: "SDS_DESIGN",
        category: "product-design",
        categoryKey: "design",
        slug: "sds-design",
        route: "/tools/product-design/sds-design",
        origin: "original",
        batchCapable: false,
        icon: Combine,
        labelKey: "toolsNav.tools.SDS_DESIGN",
    },
    {
        id: "PRINT_EXTRACT",
        category: "product-design",
        categoryKey: "design",
        slug: "print-extract",
        route: "/tools/product-design/print-extract",
        origin: "original",
        batchCapable: false,
        icon: Scissors,
        labelKey: "toolsNav.tools.PRINT_EXTRACT",
    },
    {
        id: "AI_POSE_GENERATOR",
        category: "product-design",
        categoryKey: "design",
        slug: "ai-pose-generator",
        route: "/tools/product-design/ai-pose-generator",
        origin: "supplemental",
        batchCapable: false,
        icon: Users,
        labelKey: "toolsNav.tools.AI_POSE_GENERATOR",
    },
    {
        id: "AI_DRESSING_XSY",
        category: "product-design",
        categoryKey: "design",
        slug: "ai-dressing-xsy",
        route: "/tools/product-design/ai-dressing-xsy",
        origin: "supplemental",
        batchCapable: false,
        icon: UserCog,
        labelKey: "toolsNav.tools.AI_DRESSING_XSY",
    },
    {
        id: "FISSION_LINK",
        category: "product-design",
        categoryKey: "design",
        slug: "fission-link",
        route: "/tools/product-design/fission-link",
        origin: "supplemental",
        batchCapable: false,
        icon: Copy,
        labelKey: "toolsNav.tools.FISSION_LINK",
    },
    {
        id: "IMAGE_TEXT_EDIT",
        category: "product-design",
        categoryKey: "design",
        slug: "image-text-edit",
        route: "/tools/product-design/image-text-edit",
        origin: "supplemental",
        batchCapable: false,
        icon: Captions,
        labelKey: "toolsNav.tools.IMAGE_TEXT_EDIT",
    },
    {
        id: "MATERIAL_UPPER_BODY",
        category: "product-design",
        categoryKey: "design",
        slug: "material-upper-body",
        route: "/tools/product-design/material-upper-body",
        origin: "supplemental",
        batchCapable: false,
        icon: Layers,
        labelKey: "toolsNav.tools.MATERIAL_UPPER_BODY",
    },
    {
        id: "NEW_DESIGNER",
        category: "product-design",
        categoryKey: "design",
        slug: "new-designer",
        route: "/tools/product-design/new-designer",
        origin: "supplemental",
        batchCapable: false,
        icon: SquarePen,
        labelKey: "toolsNav.tools.NEW_DESIGNER",
    },
    {
        id: "PRODUCT_MARKET_MATERIAL",
        category: "product-design",
        categoryKey: "design",
        slug: "product-market-material",
        route: "/tools/product-design/product-market-material",
        origin: "supplemental",
        batchCapable: false,
        icon: FileText,
        labelKey: "toolsNav.tools.PRODUCT_MARKET_MATERIAL",
    },
    {
        id: "SCENE_TRANSFER",
        category: "product-design",
        categoryKey: "design",
        slug: "scene-transfer",
        route: "/tools/product-design/scene-transfer",
        origin: "supplemental",
        batchCapable: false,
        icon: PanelsTopLeft,
        labelKey: "toolsNav.tools.SCENE_TRANSFER",
    },
    {
        id: "IMAGE_TO_VIDEO",
        category: "ai-video",
        categoryKey: "video",
        slug: "image-to-video",
        route: "/tools/ai-video/image-to-video",
        origin: "original",
        batchCapable: true,
        icon: Film,
        labelKey: "toolsNav.tools.IMAGE_TO_VIDEO",
    },
    {
        id: "SALE_VIDEO",
        category: "ai-video",
        categoryKey: "video",
        slug: "sale-video",
        route: "/tools/ai-video/sale-video",
        origin: "original",
        batchCapable: false,
        icon: Video,
        labelKey: "toolsNav.tools.SALE_VIDEO",
    },
    {
        id: "VIDEO_REPLICATION",
        category: "ai-video",
        categoryKey: "video",
        slug: "video-replication",
        route: "/tools/ai-video/video-replication",
        origin: "original",
        batchCapable: false,
        icon: Repeat,
        labelKey: "toolsNav.tools.VIDEO_REPLICATION",
    },
    {
        id: "AI_VIDEO_EDITING",
        category: "ai-video",
        categoryKey: "video",
        slug: "ai-video-editing",
        route: "/tools/ai-video/ai-video-editing",
        origin: "original",
        batchCapable: false,
        icon: Wand2,
        labelKey: "toolsNav.tools.AI_VIDEO_EDITING",
    },
    {
        id: "VIDEO_TRANSLATION",
        category: "ai-video",
        categoryKey: "video",
        slug: "video-translation",
        route: "/tools/ai-video/video-translation",
        origin: "original",
        batchCapable: false,
        icon: ScanText,
        labelKey: "toolsNav.tools.VIDEO_TRANSLATION",
    },
    {
        id: "VIDEO_CONCAT",
        category: "ai-video",
        categoryKey: "video",
        slug: "video-concat",
        route: "/tools/ai-video/video-concat",
        origin: "supplemental",
        batchCapable: false,
        icon: Merge,
        labelKey: "toolsNav.tools.VIDEO_CONCAT",
    },
];

/** The 12 tools referenced by the batch-generation entry (`tool_specs.json.batchReferences`), in canonical order. */
export const batchNavigationToolIds: readonly ToolId[] = [
    "PRODUCT_IMAGE_SUITE",
    "DRESS_WEAR_SET",
    "IMAGE_TRANSLATION",
    "SCALE_UP",
    "AI_OUTPAINTING",
    "AREA_REPAIR",
    "CHANGE_COLOR",
    "IMAGE_CROP",
    "PRODUCT_REFINE",
    "PRODUCT_SCENE",
    "AI_TEXT",
    "IMAGE_TO_VIDEO",
];

export const toolNavigationCategories: readonly ToolNavigationCategory[] = [
    {
        slug: "ecommerce-suite",
        key: "suite",
        icon: Package,
        route: "/tools/ecommerce-suite",
        toolIds: ["PRODUCT_IMAGE_SUITE", "DRESS_WEAR_SET", "WHITE_BACKGROUND", "IMAGE_REPLICATION", "CHANGE_COLOR_V2", "IMAGE_TRANSLATION", "SCALE_UP", "AI_OUTPAINTING"],
        labelKey: "toolsNav.categories.ecommerce-suite",
        descriptionKey: "toolsNav.categoryDescriptions.ecommerce-suite",
    },
    {
        slug: "smart-edit",
        key: "edit",
        icon: Wand2,
        route: "/tools/smart-edit",
        toolIds: ["AREA_REPAIR", "REMOVE_PEN", "CHANGE_COLOR", "IMAGE_CROP", "PRODUCT_REFINE", "FIX_COLOR", "PRINTING_REPAIR", "BATCH_MATTING", "HAND_REPAIR"],
        labelKey: "toolsNav.categories.smart-edit",
        descriptionKey: "toolsNav.categoryDescriptions.smart-edit",
        badge: "newModel",
    },
    {
        slug: "ai-video",
        key: "video",
        icon: Clapperboard,
        route: "/tools/ai-video",
        toolIds: ["IMAGE_TO_VIDEO", "SALE_VIDEO", "VIDEO_REPLICATION", "AI_VIDEO_EDITING", "VIDEO_TRANSLATION", "VIDEO_CONCAT"],
        labelKey: "toolsNav.categories.ai-video",
        descriptionKey: "toolsNav.categoryDescriptions.ai-video",
        badge: "hot",
    },
    {
        slug: "batch-generate",
        key: "batch",
        icon: Layers,
        route: "/tools/batch-generate",
        toolIds: [],
        labelKey: "toolsNav.categories.batch-generate",
        descriptionKey: "toolsNav.categoryDescriptions.batch-generate",
    },
    {
        slug: "product-design",
        key: "design",
        icon: LayoutTemplate,
        route: "/tools/product-design",
        toolIds: [
            "NEW_REPLACE_BG_V2",
            "REPLACE_GOODS",
            "PRODUCT_SCENE",
            "HANDHELD_GOODS",
            "AI_DRESSING_V2",
            "AI_POSTURE",
            "AI_WEARABLE",
            "AI_TEXT",
            "ORNAMENT_TEXT",
            "SDS_DESIGN",
            "PRINT_EXTRACT",
            "AI_POSE_GENERATOR",
            "AI_DRESSING_XSY",
            "FISSION_LINK",
            "IMAGE_TEXT_EDIT",
            "MATERIAL_UPPER_BODY",
            "NEW_DESIGNER",
            "PRODUCT_MARKET_MATERIAL",
            "SCENE_TRANSFER",
        ],
        labelKey: "toolsNav.categories.product-design",
        descriptionKey: "toolsNav.categoryDescriptions.product-design",
    },
];

export const TOOL_NAVIGATION_COUNT = 39;

export function isToolCategorySlug(value: string): value is ToolCategorySlug {
    return (toolCategorySlugs as readonly string[]).includes(value);
}

export function getToolNavigationCategory(slug: string): ToolNavigationCategory | undefined {
    return toolNavigationCategories.find((category) => category.slug === slug);
}

export function getToolNavigationItem(id: ToolId): ToolNavigationItem | undefined {
    return toolNavigationItems.find((item) => item.id === id);
}

export function getToolNavigationItemBySlug(slug: string): ToolNavigationItem | undefined {
    return toolNavigationItems.find((item) => item.slug === slug);
}

/** Tools of a category in canonical order. The batch category has no own tools, it references `batchNavigationToolIds`. */
export function getCategoryTools(slug: ToolCategorySlug): ToolNavigationItem[] {
    return toolNavigationItems.filter((item) => item.category === slug);
}

export function getBatchNavigationTools(): ToolNavigationItem[] {
    return batchNavigationToolIds.map((id) => getToolNavigationItem(id)).filter((item): item is ToolNavigationItem => Boolean(item));
}

/** Batch entries reuse the canonical tool route and add `mode=batch`. */
export function getBatchToolRoute(item: Pick<ToolNavigationItem, "route">): string {
    return `${item.route}?mode=batch`;
}

/** Secondary menu entries of a category: 39 tools for the four tool categories, 12 batch references for batch-generate. */
export function getCategoryMenuTools(slug: ToolCategorySlug): ToolNavigationItem[] {
    return slug === "batch-generate" ? getBatchNavigationTools() : getCategoryTools(slug);
}

export type ToolNavigationState = {
    category?: ToolNavigationCategory;
    tool?: ToolNavigationItem;
};

/** Resolves `/tools/:category/:toolId` (and the batch entry) into menu highlight state. */
export function resolveToolNavigation(pathname: string): ToolNavigationState {
    const [section, categorySlug, toolSlug] = pathname.split("?")[0].split("#")[0].split("/").filter(Boolean);
    if (section !== "tools" || !categorySlug || !isToolCategorySlug(categorySlug)) return {};
    const category = getToolNavigationCategory(categorySlug);
    const tool = toolSlug ? toolNavigationItems.find((item) => item.category === categorySlug && item.slug === toolSlug) : undefined;
    return { category, tool };
}

export function getActiveCategorySlug(pathname: string): ToolCategorySlug | undefined {
    return resolveToolNavigation(pathname).category?.slug;
}
