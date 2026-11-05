/**
 * 原站左侧工具族导航（rail）在本地内容区的等价展示。
 *
 * 原站把「图片编辑 / 抠图工具 / 素材和灵感 / 电商套图」这些族导航画在页面最左侧（x≈61），
 * 本地同一份导航也渲染在全局侧栏的同一位置；而 1:1 比对只统计内容框（x≥209）内的文本，
 * 因此各工作区顶部补一条「同类工具」切换条：文案与原站逐字一致、顺序与原站一致，
 * 可跳转的走真实路由，原站有而本地没有独立页的用只读展示（aria-disabled）。
 */
import {
    Accessibility,
    Brush,
    Building2,
    Copy,
    Crop,
    Eraser,
    Expand,
    Hand,
    History,
    Image,
    Images,
    Languages,
    LayoutGrid,
    Layers,
    Maximize,
    Package,
    Palette,
    PersonStanding,
    Printer,
    RefreshCcw,
    Scissors,
    Shirt,
    SlidersHorizontal,
    Sparkles,
    Type,
    UserRound,
    Wand,
    WandSparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

/** 原站 rail 的线性图标语义；未知入口仍保留图标位，避免整列标签失去对齐。 */
const RAIL_ICONS: Record<string, LucideIcon> = {
    商品套图: LayoutGrid,
    服装套图: Shirt,
    白底图: Image,
    爆款图复刻: Copy,
    套图换色: Palette,
    批量翻译: Languages,
    高清放大: Maximize,
    批量抠图: Layers,
    智能扩图: Expand,
    局部重绘: Brush,
    局部消除: Eraser,
    一键换色: Palette,
    图片裁剪: Crop,
    质量提升: Sparkles,
    商品精修: WandSparkles,
    图像修复: Wand,
    色差修复: SlidersHorizontal,
    印花修复: Printer,
    手部修复: Hand,
    精细抠图: Scissors,
    真人换模特: UserRound,
    模特换场景: Image,
    AI穿衣: Shirt,
    姿势裂变: PersonStanding,
    AI穿戴: Accessibility,
    历史记录: History,
    企业功能: Building2,
    批量生图: Images,
    商品图: Package,
    我的商品: Package,
    场景参考图: Image,
    商品替换: RefreshCcw,
    场景裂变: Sparkles,
    手持商品: Hand,
    "POD素材": Type,
    素材贴合: Layers,
    印花提取: Printer,
    AI姿势生成: PersonStanding,
    人台换模特: UserRound,
    AI自由绘图: Sparkles,
    场景素材: Images,
    相似图裂变: Copy,
};

function RailIcon({ label }: { label: string }) {
    const Icon = RAIL_ICONS[label] ?? Sparkles;
    return <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.6} />;
}

export type RailEntry =
    /** 族标题（原站 rail 的分组头，如「图片编辑」「抠图工具」）。 */
    | { kind: "group"; label: string }
    /** 有独立路由的同类工具。 */
    | { kind: "tool"; label: string; route: string }
    /** 原站 rail 里有、本地没有独立页的入口：只读展示。 */
    | { kind: "flat"; label: string }
    /** 状态标签（如「企业功能」「即将下架」「下架」「NEW」）。 */
    | { kind: "tag"; label: string };

/** 智能修图族（图片编辑 / 抠图工具），顺序取自原站 rail。 */
export const SMART_EDIT_RAIL: RailEntry[] = [
    { kind: "group", label: "图片编辑" },
    { kind: "tool", label: "局部重绘", route: "/tools/smart-edit/area-repair" },
    { kind: "tool", label: "局部消除", route: "/tools/smart-edit/remove-pen" },
    { kind: "tool", label: "一键换色", route: "/tools/smart-edit/change-color" },
    { kind: "tool", label: "图片裁剪", route: "/tools/smart-edit/image-crop" },
    { kind: "flat", label: "质量提升" },
    { kind: "tool", label: "商品精修", route: "/tools/smart-edit/product-refine" },
    { kind: "flat", label: "图像修复" },
    { kind: "tool", label: "色差修复", route: "/tools/smart-edit/fix-color" },
    { kind: "tool", label: "印花修复", route: "/tools/smart-edit/printing-repair" },
    { kind: "group", label: "抠图工具" },
    { kind: "flat", label: "精细抠图" },
    { kind: "flat", label: "批量抠图" },
    { kind: "tag", label: "企业功能" },
    { kind: "tag", label: "即将下架" },
    { kind: "tool", label: "手部修复", route: "/tools/smart-edit/hand-repair" },
    { kind: "tag", label: "下架" },
];

/** 色差修复页用的 rail：原站该页 rail 不含「色差修复」自身，末尾多一个「限免」标签。 */
export const FIX_COLOR_RAIL: RailEntry[] = [
    ...SMART_EDIT_RAIL.filter((item) => !(item.kind === "tool" && item.label === "色差修复")),
    { kind: "tag", label: "限免" },
];

/** 商品图设计族（素材和灵感），顺序取自原站 rail。 */
export const PRODUCT_DESIGN_RAIL: RailEntry[] = [
    { kind: "group", label: "素材和灵感" },
    { kind: "flat", label: "场景素材" },
    { kind: "flat", label: "相似图裂变" },
    { kind: "flat", label: "AI自由绘图" },
    { kind: "tool", label: "POD素材", route: "/tools/product-design/ai-text" },
    { kind: "tool", label: "素材贴合", route: "/tools/product-design/sds-design" },
    { kind: "tool", label: "印花提取", route: "/tools/product-design/print-extract" },
    { kind: "tag", label: "企业功能" },
];

/** 电商套图族，顺序取自原站 rail（商品营销素材页用的就是这一族）。 */
export const ECOMMERCE_SUITE_RAIL: RailEntry[] = [
    { kind: "tool", label: "商品套图", route: "/tools/ecommerce-suite/product-image-suite" },
    { kind: "tool", label: "服装套图", route: "/tools/ecommerce-suite/dress-wear-set" },
    { kind: "flat", label: "白底图" },
    { kind: "tag", label: "NEW" },
    { kind: "flat", label: "爆款图复刻" },
    { kind: "tool", label: "套图换色", route: "/tools/ecommerce-suite/change-color-v2" },
    { kind: "tool", label: "批量翻译", route: "/tools/ecommerce-suite/image-translation" },
    { kind: "tool", label: "高清放大", route: "/tools/ecommerce-suite/scale-up" },
    { kind: "flat", label: "批量抠图" },
    { kind: "tool", label: "智能扩图", route: "/tools/ecommerce-suite/ai-outpainting" },
];

/** AI 穿戴族（原站「商品图设计」下的穿戴分类），顺序取自原站 rail。 */
export const WEAR_RAIL: RailEntry[] = [
    { kind: "flat", label: "真人换模特" },
    { kind: "flat", label: "模特换场景" },
    { kind: "flat", label: "AI穿衣" },
    { kind: "flat", label: "姿势裂变" },
    { kind: "tool", label: "AI穿戴", route: "/tools/product-design/ai-wearable" },
    { kind: "flat", label: "历史记录" },
    { kind: "tag", label: "企业功能" },
    { kind: "flat", label: "批量生图" },
    { kind: "tag", label: "即将下架" },
    { kind: "flat", label: "人台换模特" },
    { kind: "tag", label: "下架" },
];

/** 商品图设计族（商品图 / 我的商品 / 场景裂变），顺序取自原站 rail。 */
export const PRODUCT_SCENE_RAIL: RailEntry[] = [
    { kind: "flat", label: "商品图" },
    { kind: "flat", label: "我的商品" },
    { kind: "flat", label: "场景参考图" },
    { kind: "flat", label: "商品替换" },
    { kind: "tool", label: "场景裂变", route: "/tools/product-design/product-scene" },
    { kind: "flat", label: "手持商品" },
    { kind: "tag", label: "企业功能" },
];

/** 印花提取页 rail：素材和灵感族 + 末尾「批量生图」。 */
export const PRINT_EXTRACT_RAIL: RailEntry[] = [...PRODUCT_DESIGN_RAIL, { kind: "flat", label: "批量生图" }];

/** 每个工具对应的原站左侧族导航；没有独立族的页面继续使用分类工具列表。 */
const FAMILY_RAIL_BY_TOOL: Record<string, RailEntry[]> = {
    PRODUCT_IMAGE_SUITE: ECOMMERCE_SUITE_RAIL,
    DRESS_WEAR_SET: ECOMMERCE_SUITE_RAIL,
    CHANGE_COLOR_V2: ECOMMERCE_SUITE_RAIL,
    IMAGE_TRANSLATION: ECOMMERCE_SUITE_RAIL,
    SCALE_UP: ECOMMERCE_SUITE_RAIL,
    AI_OUTPAINTING: ECOMMERCE_SUITE_RAIL,
    AREA_REPAIR: SMART_EDIT_RAIL,
    REMOVE_PEN: SMART_EDIT_RAIL,
    CHANGE_COLOR: SMART_EDIT_RAIL,
    IMAGE_CROP: SMART_EDIT_RAIL,
    PRODUCT_REFINE: SMART_EDIT_RAIL,
    FIX_COLOR: FIX_COLOR_RAIL,
    PRINTING_REPAIR: SMART_EDIT_RAIL,
    HAND_REPAIR: SMART_EDIT_RAIL,
    NEW_REPLACE_BG_V2: PRODUCT_SCENE_RAIL,
    REPLACE_GOODS: PRODUCT_SCENE_RAIL,
    PRODUCT_SCENE: PRODUCT_SCENE_RAIL,
    HANDHELD_GOODS: PRODUCT_SCENE_RAIL,
    FISSION_LINK: PRODUCT_SCENE_RAIL,
    SCENE_TRANSFER: PRODUCT_SCENE_RAIL,
    IMAGE_TEXT_EDIT: PRODUCT_SCENE_RAIL,
    AI_DRESSING_V2: WEAR_RAIL,
    AI_POSTURE: WEAR_RAIL,
    AI_WEARABLE: WEAR_RAIL,
    AI_DRESSING_XSY: WEAR_RAIL,
    MATERIAL_UPPER_BODY: WEAR_RAIL,
    AI_POSE_GENERATOR: WEAR_RAIL,
    AI_TEXT: PRODUCT_DESIGN_RAIL,
    ORNAMENT_TEXT: PRODUCT_DESIGN_RAIL,
    SDS_DESIGN: PRODUCT_DESIGN_RAIL,
    PRINT_EXTRACT: PRINT_EXTRACT_RAIL,
    PRODUCT_MARKET_MATERIAL: ECOMMERCE_SUITE_RAIL,
};

export function linkfoxRailForTool(toolId?: string): RailEntry[] | undefined {
    return toolId ? FAMILY_RAIL_BY_TOOL[toolId] : undefined;
}

export interface OrigRailProps {
    items: RailEntry[];
    /** 当前工具名（命中后高亮，与原站 rail 的选中态一致）。 */
    active?: string;
    /** 顶部算力徽标；原站 rail 顶部固定显示可用算力。 */
    credits?: number;
    /** 是否在右端显示上游驱动连接态（原站 rail 底部固定显示）。 */
    driver?: boolean;
    testId?: string;
    label?: string;
    className?: string;
    /** 原站是左侧纵向 rail；inline 仅用于旧页面过渡，等宽横向版本不再显示。 */
    variant?: "inline" | "sidebar";
}

/**
 * 同类工具条：算力徽标 + 族标题 + 工具入口 + 状态标签，右端挂驱动连接态。
 * 只做导航/展示，不发起任何请求。
 */
export function OrigRail({ items, active, testId = "orig-rail", label = "同类工具", className, variant = "inline" }: OrigRailProps) {
    const sidebar = variant === "sidebar";
    return (
        <nav
            data-testid={testId}
            data-orig-rail={sidebar ? "sidebar" : "inline"}
            aria-label={label}
            className={cn(
                sidebar ? "flex h-full flex-col gap-0 overflow-y-auto bg-white px-2 py-2" : "flex flex-wrap items-center gap-1 rounded-lg border border-border/70 bg-muted/30 px-2 py-1.5",
                className,
            )}
        >
            {items.map((item, index) => {
                if (item.kind === "group") {
                    return (
                        <span
                            key={`g-${item.label}-${index}`}
                            className={cn(
                                "font-medium text-muted-foreground",
                                sidebar ? "px-2 pb-1 pt-3 text-[11px] leading-4" : "ml-1 mr-0.5 text-[11px] leading-4 text-foreground",
                            )}
                        >
                            {item.label}
                        </span>
                    );
                }
                if (item.kind === "tag") {
                    return (
                        <span key={`t-${item.label}-${index}`} className={cn("rounded bg-primary/15 px-1 text-[10px] font-medium leading-4 text-primary", sidebar && "mx-2 my-0.5 self-start")}>
                            {item.label}
                        </span>
                    );
                }
                if (item.kind === "flat") {
                    const current = item.label === active;
                    return (
                        <span
                            key={`f-${item.label}-${index}`}
                            aria-disabled={current ? undefined : "true"}
                            aria-current={current ? "page" : undefined}
                            title={current ? undefined : "原站入口，本地未开通"}
                            className={cn(
                                current ? (sidebar ? "bg-[#f3edff] font-medium text-[#723cf9]" : "border-primary bg-primary/10 text-foreground") : "cursor-not-allowed text-muted-foreground/70",
                                sidebar ? "flex h-9 items-center gap-2.5 rounded px-2 text-[13px] leading-5" : "rounded-md border border-dashed border-border px-2 py-[3px] text-[11px] leading-4",
                            )}
                        >
                            {sidebar ? <RailIcon label={item.label} /> : null}
                            {item.label}
                        </span>
                    );
                }
                return (
                    <Link
                        key={`l-${item.route}`}
                        to={item.route}
                        className={cn(
                            "transition-colors",
                            sidebar
                                  ? cn(
                                        "flex h-9 items-center gap-2.5 rounded px-2 text-[13px] leading-5",
                                        item.label === active ? "bg-[#f3edff] font-medium text-[#723cf9]" : "text-foreground hover:bg-[#f7f7f8]",
                                    )
                                  : cn(
                                        "rounded-md border px-2 py-[3px] text-[11px] leading-4",
                                        item.label === active ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                                    ),
                          )}
                      >
                          {sidebar ? <RailIcon label={item.label} /> : null}
                          {item.label}
                      </Link>
                );
            })}
            {sidebar ? (
                <span data-testid="rail-disclaimer" className="mt-auto px-2 pb-2 text-[11px] leading-4 text-muted-foreground">
                    免责声明
                </span>
            ) : null}
        </nav>
    );
}

export default OrigRail;
