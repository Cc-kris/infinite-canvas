/**
 * FISSION_LINK「链接裂变」。按 rea 还原的原站 LinkCard chunk（链接裂变弹窗，width 760）复刻：
 * 裂变来源（自有 Listing 的主副图 / A+）→ 设置裂变目标（新 Listing 数量 + 每条 Listing 的内容）
 * → 图片生成设置 → 选择参考图片 → A+ → 开始生成 N 条 Listing。
 * 原站提交：每条 Listing 一次 create，extendFields = { sourceListingId, selectedImages[{imageUrl,mediaType 1主副/2A+}],
 *   fissionCountMainSub, fissionCountAplus, fissionLinkCount: 1, provider, platform, aplusConfig?{type,count,aspectRatios} }。
 * 本地没有 Listing 库和文案生成：来源图由用户上传，只生成图片，不生成新文案。
 */
import type { BrowserToolInput } from "@/services/api/tools/gateway";
import type { ReferenceImage } from "@/types/image";

export const LISTING_FISSION_TOOL_ID = "FISSION_LINK";
export const LISTING_FISSION_STEPPER = { min: 1, max: 10 } as const;

export const LISTING_FISSION_DELIVERIES = [
    { value: "basic", title: "基础铺货", description: "生成新文案和主副图，不生成 A+", badge: "铺货推荐" },
    { value: "complete", title: "完整 Listing", description: "生成新文案、主副图和 A+" },
    { value: "custom", title: "自定义", description: "自定义参考素材和单图生成倍数" },
] as const;
export type ListingFissionDelivery = (typeof LISTING_FISSION_DELIVERIES)[number]["value"];

export const LISTING_FISSION_APLUS_TYPES = [
    { value: "advanced", label: "高级 A+", description: "横版品牌详情" },
    { value: "advancedPhone", label: "高级&手机 A+", description: "同步生成桌面与手机尺寸" },
    { value: "standard", label: "普通 A+", description: "标准详情模块" },
    { value: "custom", label: "自定义", description: "自定宽高比" },
] as const;
export type ListingFissionAplusType = (typeof LISTING_FISSION_APLUS_TYPES)[number]["value"];

/** 原站 Rt()：A+ 类型 → 比例列表。 */
export function aplusAspectRatios(type: ListingFissionAplusType, width: number, height: number): string[] {
    if (type === "advancedPhone") return ["1464:600", "600:450"];
    if (type === "standard") return ["970:600"];
    if (type === "custom") return [`${width}:${height}`];
    return ["1464:600"];
}

export type ListingFissionValues = {
    title: string;
    delivery: ListingFissionDelivery;
    linkCount: number;
    mainSubCount: number;
    aplusCount: number;
    customAplus: boolean;
    aplusType: ListingFissionAplusType;
    aplusWidth: number;
    aplusHeight: number;
};

/** 原站弹窗打开时的默认值。 */
export const DEFAULT_LISTING_FISSION_VALUES: ListingFissionValues = { title: "", delivery: "basic", linkCount: 1, mainSubCount: 1, aplusCount: 1, customAplus: false, aplusType: "advanced", aplusWidth: 3, aplusHeight: 4 };

const clampStep = (value: unknown, fallback: number) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.min(LISTING_FISSION_STEPPER.max, Math.max(LISTING_FISSION_STEPPER.min, n)) : fallback;
};
const clampRatioSide = (value: unknown, fallback: number) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 1 && n <= 100 ? n : fallback;
};

export function readListingFissionValues(raw?: Record<string, unknown> | null): ListingFissionValues {
    const d = DEFAULT_LISTING_FISSION_VALUES;
    const delivery = LISTING_FISSION_DELIVERIES.some((item) => item.value === raw?.delivery) ? (raw?.delivery as ListingFissionDelivery) : d.delivery;
    const aplusType = LISTING_FISSION_APLUS_TYPES.some((item) => item.value === raw?.aplusType) ? (raw?.aplusType as ListingFissionAplusType) : d.aplusType;
    return {
        title: typeof raw?.title === "string" ? raw.title : "",
        delivery,
        linkCount: clampStep(raw?.linkCount, d.linkCount),
        mainSubCount: clampStep(raw?.mainSubCount, d.mainSubCount),
        aplusCount: clampStep(raw?.aplusCount, d.aplusCount),
        customAplus: raw?.customAplus === true,
        aplusType,
        aplusWidth: clampRatioSide(raw?.aplusWidth, d.aplusWidth),
        aplusHeight: clampRatioSide(raw?.aplusHeight, d.aplusHeight),
    };
}

/** 原站 L：完整 Listing，或自定义且勾了「同时生成 A+」。 */
export const generatesAplus = (values: ListingFissionValues) => values.delivery === "complete" || (values.delivery === "custom" && values.customAplus);
/** 原站 b：只有自定义模式可改单图倍数，其余固定 1。 */
const mainSubMultiplier = (values: ListingFissionValues) => (values.delivery === "custom" ? values.mainSubCount : 1);

export type ListingFissionSummary = { mainSubPerLink: number; aplusPerLink: number; totalImages: number };

/** 原站 ye / be / Se：每条主副图张数、每条 A+ 张数、总图片数。 */
export function summarizeListingFission(values: ListingFissionValues, selectedMain: number, selectedAplus: number, sourceAplus: number): ListingFissionSummary {
    const aplusRefs = generatesAplus(values) ? (sourceAplus > 0 ? selectedAplus : aplusAspectRatios(values.aplusType, values.aplusWidth, values.aplusHeight).length) : 0;
    const mainSubPerLink = selectedMain * mainSubMultiplier(values);
    const aplusPerLink = aplusRefs * values.aplusCount;
    return { mainSubPerLink, aplusPerLink, totalImages: (mainSubPerLink + aplusPerLink) * values.linkCount };
}

export type ListingFissionUnit = { link: number; kind: "main" | "aplus"; label: string; input: BrowserToolInput };

/**
 * 拆成真实请求单元：每条 Listing × 每张参考图 × 倍数各 1 张；源无 A+ 时按每个比例用首张主副图生成 A+。
 * prompt 带 Listing/序号，避免同指纹请求被网关去重合并。
 */
export function planListingFission(values: ListingFissionValues, main: ReferenceImage[], aplus: ReferenceImage[], sourceAplusCount: number, model?: string): ListingFissionUnit[] {
    if (!main.length) throw new Error("请至少选择一张主副图作为裂变参考");
    const withAplus = generatesAplus(values);
    if (withAplus && sourceAplusCount > 0 && !aplus.length) throw new Error("请至少选择一张 A+ 图作为生成参考");
    const ratios = withAplus && !sourceAplusCount ? aplusAspectRatios(values.aplusType, values.aplusWidth, values.aplusHeight) : [];
    const selectedImages = [...main.map((ref) => ({ imageUrl: ref.url || ref.id, mediaType: 1 })), ...(withAplus ? aplus.map((ref) => ({ imageUrl: ref.url || ref.id, mediaType: 2 })) : [])];
    const summary = summarizeListingFission(values, main.length, aplus.length, sourceAplusCount);
    const fields = {
        imageUrl: selectedImages[0].imageUrl,
        outputNum: summary.mainSubPerLink + summary.aplusPerLink,
        selectedImages,
        fissionCountMainSub: mainSubMultiplier(values),
        fissionCountAplus: withAplus ? values.aplusCount : 0,
        fissionLinkCount: 1,
        ...(ratios.length ? { aplusConfig: { type: values.aplusType, count: values.aplusCount, aspectRatios: ratios } } : {}),
    };
    const title = values.title.trim();
    const about = title ? ` The product listing is titled "${title}".` : "";
    const base = { toolId: LISTING_FISSION_TOOL_ID, model: model?.trim() || undefined, count: 1, fields };
    const units: ListingFissionUnit[] = [];
    for (let link = 1; link <= values.linkCount; link += 1) {
        main.forEach((ref, index) => {
            for (let n = 1; n <= mainSubMultiplier(values); n += 1) {
                units.push({ link, kind: "main", label: `主副图 ${index + 1}-${n}`, input: { ...base, references: [ref], prompt: `E-commerce listing image variation (new listing ${link}, image ${index + 1}, variant ${n}). Keep the exact same product, shape, colors, logo and key selling point of the reference image, but create a fresh composition, background and layout suitable for a new marketplace listing.${about}` } });
            }
        });
        aplus.forEach((ref, index) => {
            if (!withAplus) return;
            for (let n = 1; n <= values.aplusCount; n += 1) {
                units.push({ link, kind: "aplus", label: `A+ ${index + 1}-${n}`, input: { ...base, references: [ref], prompt: `Amazon A+ content module variation (new listing ${link}, module ${index + 1}, variant ${n}). Keep the product and the module's information structure, refresh the visual design, background and typography layout.${about}` } });
            }
        });
        ratios.forEach((ratio) => {
            for (let n = 1; n <= values.aplusCount; n += 1) {
                units.push({ link, kind: "aplus", label: `A+ ${ratio}-${n}`, input: { ...base, size: ratio, references: [main[0]], prompt: `Amazon A+ content banner (${ratio}, new listing ${link}, variant ${n}) for the product in the reference image: wide brand-story layout with product hero shot, clean background and space for short headline and selling points.${about}` } });
            }
        });
    }
    return units;
}
