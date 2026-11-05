/**
 * IMAGE_CROP「图片裁剪」页面契约 + 纯逻辑（无 React / 无 DOM / 无网络）。
 *
 * 证据：docs/V1.0/plan_linkfox_navigation/page-specs/10-image-crop.md
 *      仓库根 IMAGE_CROP.json（原站 workspace DOM，2026-10-27 抓取）
 *  - 区域：裁剪画布与历史｜尺寸调整｜比例调整｜平台预设｜自定义尺寸
 *  - 控件：自由裁剪、22 个平台卡、目标宽/高、保存自定义尺寸、撤销/重做/重置/重新上传/下载、旋转
 *  - 联动（规格 §3）：选平台同时写入平台 + 比例 + 像素尺寸；手动拖框切成自由裁剪但不删除平台预设；
 *    锁定比例时拖角保持比例；换图重置画布变换；下载使用当前裁剪结果。
 *  - 字段（规格 §7）：activeTab / contentUrl / imageCropUrl / imageFormat / imageHeight / imageSize /
 *    imageUrl / imageWidth / platform / platformTitle / ratio / selectedMode，共 12 个。
 */

export const IMAGE_CROP_TOOL_ID = "IMAGE_CROP" as const;
export const IMAGE_CROP_TOOL_SLUG = "image-crop" as const;
export const IMAGE_CROP_ROUTE = "/tools/smart-edit/image-crop" as const;
export const IMAGE_CROP_LAYOUT = "crop" as const;
export const IMAGE_CROP_DRAFT_KEY = `tool-draft:v1:${IMAGE_CROP_TOOL_ID}` as const;

/** 原站文案：「支持jpg、jpeg、png、webp，10M以内，384*384 ~ 4096*4096」。 */
export const IMAGE_CROP_MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_CROP_MIN_SIDE = 384;
export const IMAGE_CROP_MAX_SIDE = 4096;
export const IMAGE_CROP_BATCH_LIMIT_FREE = 1;
export const IMAGE_CROP_FORMATS = ["image/png", "image/jpeg", "image/webp"] as const;

/** 裁剪框最小归一化边长，避免拖成 0 宽高。 */
export const MIN_RECT_SIDE = 0.02;
/** 比例匹配容差（千分之五）。 */
export const RATIO_TOLERANCE = 0.005;

export type CropOutputFormat = (typeof IMAGE_CROP_FORMATS)[number];
export type CropRotation = 0 | 90 | 180 | 270;
export type CropTab = "size" | "ratio";
/** 归一化裁剪框（相对「旋转后」的图片坐标系，0..1）。 */
export type CropRect = { x: number; y: number; width: number; height: number };
export type CropSize = { width: number; height: number };

export type PlatformPreset = { key: string; title: string; width: number; height: number };

/**
 * 22 个平台预设，顺序与文案取自原站 DOM（IMAGE_CROP.json › text）。
 * 尺寸即该平台主图规格，选中后同时写入 platform / ratio / 目标像素。
 */
export const PLATFORM_PRESETS: readonly PlatformPreset[] = [
    { key: "amazon", title: "亚马逊", width: 1600, height: 1600 },
    { key: "walmart", title: "沃尔玛", width: 2000, height: 2000 },
    { key: "etsy", title: "Etsy", width: 2000, height: 2000 },
    { key: "mercado", title: "美客多", width: 1200, height: 1200 },
    { key: "ebay", title: "eBay", width: 1600, height: 1600 },
    { key: "temu", title: "Temu", width: 1200, height: 1200 },
    { key: "shopify-square", title: "Shopify 方形", width: 2048, height: 2048 },
    { key: "shopify-landscape", title: "Shopify 横板", width: 2000, height: 1800 },
    { key: "shopify-portrait", title: "Shopify 竖版", width: 1600, height: 2000 },
    { key: "shein", title: "SHEIN", width: 1340, height: 1785 },
    { key: "aliexpress", title: "速卖通", width: 1200, height: 1200 },
    { key: "shopee", title: "Shopee", width: 1080, height: 1080 },
    { key: "lazada", title: "Lazada", width: 1080, height: 1080 },
    { key: "tiktok-shop", title: "Tiktok Shop", width: 1024, height: 1024 },
    { key: "douyin-shop", title: "抖音小店", width: 1024, height: 1024 },
    { key: "taobao", title: "淘宝/天猫", width: 1024, height: 1024 },
    { key: "jd", title: "京东", width: 1024, height: 1024 },
    { key: "wayfair", title: "Wayfair", width: 2000, height: 2000 },
    { key: "cdiscount", title: "Cdiscount", width: 2000, height: 2000 },
    { key: "jumia", title: "Jumia", width: 1024, height: 1024 },
    { key: "rakuten", title: "Rakuten", width: 1024, height: 1024 },
    { key: "wish", title: "Wish", width: 1024, height: 1024 },
] as const;

export type RatioPreset = { id: string; title: string; width: number; height: number };

export const FREE_RATIO_ID = "free" as const;

/**
 * 比例卡：`自由裁剪`（原站实测文案）+ 标准裁剪比例。
 * 说明：原站比例卡以图标渲染，DOM 文本只暴露「自由裁剪」，其余比例为通用裁剪比例集合（推断，非实测文案）。
 */
export const RATIO_PRESETS: readonly RatioPreset[] = [
    { id: "1:1", title: "1:1", width: 1, height: 1 },
    { id: "4:3", title: "4:3", width: 4, height: 3 },
    { id: "3:4", title: "3:4", width: 3, height: 4 },
    { id: "16:9", title: "16:9", width: 16, height: 9 },
    { id: "9:16", title: "9:16", width: 9, height: 16 },
    { id: "3:2", title: "3:2", width: 3, height: 2 },
    { id: "2:3", title: "2:3", width: 2, height: 3 },
    { id: "4:5", title: "4:5", width: 4, height: 5 },
    { id: "5:4", title: "5:4", width: 5, height: 4 },
] as const;

export const CUSTOM_PLATFORM_KEY = "custom";
export const CUSTOM_PLATFORM_TITLE = "自定义尺寸";

export type SavedCustomSize = { id: string; width: number; height: number; savedAt: number };

export type CropCanvasState = {
    /** 归一化裁剪框（旋转后坐标系）。 */
    rect: CropRect;
    rotation: CropRotation;
    flipX: boolean;
    flipY: boolean;
    /** 当前比例 id：free 或 RATIO_PRESETS 的 id。 */
    ratioId: string;
    /** 锁定比例：拖角时保持当前比例。 */
    locked: boolean;
    /** 最近一次选择的平台卡；手动拖框后仍保留（规格 §3：切自由裁剪但不删预设）。 */
    platformKey: string | null;
    platformTitle: string;
    outputWidth: number;
    outputHeight: number;
    format: CropOutputFormat;
    activeTab: CropTab;
    customSizes: SavedCustomSize[];
};

/* ------------------------------- 几何纯函数 ------------------------------- */

export const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);
export const roundPx = (value: number): number => Math.round(value);

/** 旋转后可见尺寸：90/270 交换宽高。 */
export function orientedSize(size: CropSize, rotation: CropRotation): CropSize {
    return rotation === 90 || rotation === 270 ? { width: size.height, height: size.width } : { width: size.width, height: size.height };
}

export function rectAspect(rect: CropRect): number {
    return rect.height <= 0 ? 1 : rect.width / rect.height;
}

/** 归一化 + 保证最小边长 + 不越界。 */
export function normalizeRect(rect: CropRect, minSide: number = MIN_RECT_SIDE): CropRect {
    const width = Math.min(Math.max(rect.width, minSide), 1);
    const height = Math.min(Math.max(rect.height, minSide), 1);
    const x = clamp01(Math.min(rect.x, 1 - width));
    const y = clamp01(Math.min(rect.y, 1 - height));
    return { x, y, width, height };
}

/** 按宽高比取居中的最大裁剪框。 */
export function rectFromAspect(aspect: number, minSide: number = MIN_RECT_SIDE): CropRect {
    const safeAspect = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
    let width = 1;
    let height = width / safeAspect;
    if (height > 1) {
        height = 1;
        width = height * safeAspect;
    }
    return normalizeRect({ x: (1 - width) / 2, y: (1 - height) / 2, width, height }, minSide);
}

export function moveRect(rect: CropRect, dx: number, dy: number): CropRect {
    return normalizeRect({ ...rect, x: rect.x + dx, y: rect.y + dy });
}

export type CropHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const HANDLE_SIGNS: Record<CropHandle, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
    nw: { x: -1, y: -1 },
    n: { x: 0, y: -1 },
    ne: { x: 1, y: -1 },
    e: { x: 1, y: 0 },
    se: { x: 1, y: 1 },
    s: { x: 0, y: 1 },
    sw: { x: -1, y: 1 },
    w: { x: -1, y: 0 },
};

/**
 * 拖角/拖边缩放。`dx/dy` 为归一化位移。
 * locked=true 时（拖角）先按水平方向求新宽，再按已有比例反推高，保证比例不变。
 */
export function resizeRect(rect: CropRect, handle: CropHandle, dx: number, dy: number, options: { locked?: boolean; minSide?: number } = {}): CropRect {
    const minSide = options.minSide ?? MIN_RECT_SIDE;
    const sign = HANDLE_SIGNS[handle];
    const aspect = rectAspect(rect);
    let left = rect.x;
    let top = rect.y;
    let right = rect.x + rect.width;
    let bottom = rect.y + rect.height;

    if (sign.x === -1) left = clamp01(left + dx);
    if (sign.x === 1) right = clamp01(right + dx);
    if (sign.y === -1) top = clamp01(top + dy);
    if (sign.y === 1) bottom = clamp01(bottom + dy);

    let width = Math.max(minSide, right - left);
    let height = Math.max(minSide, bottom - top);

    if (options.locked && sign.x !== 0 && sign.y !== 0) {
        // 固定对角锚点，按主导位移推导目标框，再以「边界内可容纳的最大同比例框」等比收缩。
        // 收缩必须等比，否则贴边后比例会漂移（规格 §3「锁定比例拖角保持比例」）。
        const anchorX = sign.x === 1 ? rect.x : rect.x + rect.width;
        const anchorY = sign.y === 1 ? rect.y : rect.y + rect.height;
        const availW = sign.x === 1 ? 1 - anchorX : anchorX;
        const availH = sign.y === 1 ? 1 - anchorY : anchorY;
        let lockW = Math.max(minSide, width);
        let lockH = lockW / aspect;
        if (Math.abs(dx) < Math.abs(dy)) {
            lockH = Math.max(minSide, height);
            lockW = lockH * aspect;
        }
        const fit = Math.min(1, availW > 0 ? availW / lockW : 0, availH > 0 ? availH / lockH : 0);
        lockW = Math.max(minSide, lockW * Math.max(0, fit));
        lockH = Math.max(minSide, lockH * Math.max(0, fit));
        left = sign.x === 1 ? anchorX : clamp01(anchorX - lockW);
        right = sign.x === 1 ? clamp01(anchorX + lockW) : anchorX;
        top = sign.y === 1 ? anchorY : clamp01(anchorY - lockH);
        bottom = sign.y === 1 ? clamp01(anchorY + lockH) : anchorY;
        width = right - left;
        height = bottom - top;
    }

    if (left + width > 1) width = 1 - left;
    if (top + height > 1) height = 1 - top;

    return normalizeRect({ x: left, y: top, width, height }, minSide);
}

/** 裁剪框像素尺寸（旋转后坐标系）。 */
export function rectToPixels(rect: CropRect, oriented: CropSize): CropSize {
    return { width: Math.max(1, roundPx(rect.width * oriented.width)), height: Math.max(1, roundPx(rect.height * oriented.height)) };
}

/** 自由比例：输出像素随裁剪框实时同步（规格 §3「自由比例和输出尺寸同步」）。 */
export function outputSizeForRect(rect: CropRect, oriented: CropSize): CropSize {
    return rectToPixels(rect, oriented);
}

/** 输出尺寸改一边、另一边按当前裁剪框比例同步，避免拉伸变形。 */
export function syncOutputSize(current: CropSize, edited: "width" | "height", value: number, aspect: number): CropSize {
    const safeAspect = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
    const next = Math.max(1, roundPx(value));
    if (edited === "width") return { width: next, height: Math.max(1, roundPx(next / safeAspect)) };
    return { width: Math.max(1, roundPx(next * safeAspect)), height: next };
}

/** 找出与给定宽高匹配的比例 id，找不到返回 free。 */
export function matchRatioId(width: number, height: number, tolerance: number = RATIO_TOLERANCE): string {
    if (width <= 0 || height <= 0) return FREE_RATIO_ID;
    const aspect = width / height;
    for (const preset of RATIO_PRESETS) {
        if (Math.abs(preset.width / preset.height - aspect) <= tolerance) return preset.id;
    }
    return FREE_RATIO_ID;
}

export function findPlatform(key: string | null): PlatformPreset | undefined {
    if (!key) return undefined;
    return PLATFORM_PRESETS.find((preset) => preset.key === key);
}

export function findRatio(id: string): RatioPreset | undefined {
    return RATIO_PRESETS.find((preset) => preset.id === id);
}

/* ------------------------------- 状态与联动 ------------------------------- */

/** 像素宽高比 → 归一化裁剪框宽高比（rect 坐标以「旋转后」图片为 0..1 基准）。 */
export function pixelsToNormalizedAspect(pixelAspect: number, oriented: CropSize): number {
    const w = Math.max(1, oriented.width);
    const h = Math.max(1, oriented.height);
    return (pixelAspect * h) / w;
}

/** 按像素宽高比取居中的最大裁剪框。 */
export function rectForPixelAspect(pixelAspect: number, oriented: CropSize, minSide: number = MIN_RECT_SIDE): CropRect {
    return rectFromAspect(pixelsToNormalizedAspect(pixelAspect, oriented), minSide);
}

/** 裁剪框的真实像素宽高比。 */
export function rectPixelAspect(rect: CropRect, oriented: CropSize): number {
    const w = Math.max(1, rect.width * oriented.width);
    const h = Math.max(1, rect.height * oriented.height);
    return w / h;
}

export function createCropState(source?: CropSize): CropCanvasState {
    const size = source && source.width > 0 && source.height > 0 ? source : { width: 1024, height: 1024 };
    const full: CropRect = { x: 0, y: 0, width: 1, height: 1 };
    return {
        rect: full,
        rotation: 0,
        flipX: false,
        flipY: false,
        ratioId: matchRatioId(size.width, size.height),
        locked: true,
        platformKey: null,
        platformTitle: "",
        outputWidth: Math.max(1, roundPx(size.width)),
        outputHeight: Math.max(1, roundPx(size.height)),
        format: "image/png",
        activeTab: "size",
        customSizes: [],
    };
}

/** 换图（重新上传）：重置画布变换与裁剪框，保留格式/页签/自定义尺寸（规格 §3「换图重置画布变换」）。 */
export function resetForNewSource(state: CropCanvasState, source: CropSize): CropCanvasState {
    const fresh = createCropState(source);
    return { ...fresh, format: state.format, activeTab: state.activeTab, customSizes: state.customSizes, locked: state.locked };
}

/** 选平台：同时写入 platform / platformTitle / ratio / 目标像素，并把裁剪框切到该比例（规格 §3）。 */
export function applyPlatformPreset(state: CropCanvasState, key: string, source: CropSize): CropCanvasState {
    const preset = findPlatform(key);
    if (!preset) return state;
    const oriented = orientedSize(source, state.rotation);
    return {
        ...state,
        platformKey: preset.key,
        platformTitle: preset.title,
        ratioId: matchRatioId(preset.width, preset.height),
        rect: rectForPixelAspect(preset.width / preset.height, oriented),
        outputWidth: preset.width,
        outputHeight: preset.height,
    };
}

/** 选比例卡：只改裁剪框比例与输出像素，保留最近一次平台预设（切自由裁剪不删预设）。 */
export function applyRatioPreset(state: CropCanvasState, ratioId: string, source: CropSize): CropCanvasState {
    const oriented = orientedSize(source, state.rotation);
    if (ratioId === FREE_RATIO_ID) {
        const pixels = rectToPixels(state.rect, oriented);
        return { ...state, ratioId: FREE_RATIO_ID, outputWidth: pixels.width, outputHeight: pixels.height };
    }
    const preset = findRatio(ratioId);
    if (!preset) return state;
    const rect = rectForPixelAspect(preset.width / preset.height, oriented);
    const pixels = rectToPixels(rect, oriented);
    return { ...state, ratioId: preset.id, rect, outputWidth: pixels.width, outputHeight: pixels.height };
}

/** 拖动裁剪框：切成自由裁剪，但保留平台预设（规格 §3「手动拖框切为自由裁剪但不删除预设」）。 */
export function applyRectDrag(state: CropCanvasState, rect: CropRect, source: CropSize): CropCanvasState {
    const normalized = normalizeRect(rect);
    const oriented = orientedSize(source, state.rotation);
    const pixels = rectToPixels(normalized, oriented);
    return {
        ...state,
        rect: normalized,
        ratioId: FREE_RATIO_ID,
        outputWidth: pixels.width,
        outputHeight: pixels.height,
    };
}

/** 旋转/翻转：裁剪框按当前比例重新居中（变换后坐标系已变），输出像素同步重算。 */
export function applyRotation(state: CropCanvasState, rotation: CropRotation, source: CropSize): CropCanvasState {
    const oriented = orientedSize(source, rotation);
    const ratioPreset = findRatio(state.ratioId);
    const pixelAspect = ratioPreset ? ratioPreset.width / ratioPreset.height : rectPixelAspect(state.rect, orientedSize(source, state.rotation));
    const rect = rectForPixelAspect(pixelAspect, oriented);
    const pixels = rectToPixels(rect, oriented);
    return { ...state, rotation, rect, outputWidth: pixels.width, outputHeight: pixels.height };
}

export function applyFlip(state: CropCanvasState, axis: "x" | "y"): CropCanvasState {
    return axis === "x" ? { ...state, flipX: !state.flipX } : { ...state, flipY: !state.flipY };
}

/** 目标尺寸输入：宽度/高度任一改动，另一边按裁剪框真实比例同步，避免拉伸变形。 */
export function applyOutputSize(state: CropCanvasState, edited: "width" | "height", value: number, source: CropSize): CropCanvasState {
    const oriented = orientedSize(source, state.rotation);
    const next = syncOutputSize({ width: state.outputWidth, height: state.outputHeight }, edited, value, rectPixelAspect(state.rect, oriented));
    return { ...state, outputWidth: next.width, outputHeight: next.height };
}

/** 保存自定义尺寸（原站「保存自定义尺寸」），同一宽高去重。 */
export function saveCustomSize(state: CropCanvasState, now: number = Date.now()): CropCanvasState {
    const width = state.outputWidth;
    const height = state.outputHeight;
    if (state.customSizes.some((item) => item.width === width && item.height === height)) return state;
    return { ...state, customSizes: [...state.customSizes, { id: `custom-${width}x${height}`, width, height, savedAt: now }] };
}

export function applyCustomSize(state: CropCanvasState, id: string, source: CropSize): CropCanvasState {
    const preset = state.customSizes.find((item) => item.id === id);
    if (!preset) return state;
    const oriented = orientedSize(source, state.rotation);
    return {
        ...state,
        rect: rectForPixelAspect(preset.width / preset.height, oriented),
        ratioId: matchRatioId(preset.width, preset.height),
        outputWidth: preset.width,
        outputHeight: preset.height,
        platformKey: null,
        platformTitle: CUSTOM_PLATFORM_TITLE,
    };
}

/* ------------------------------- 计划与校验 ------------------------------- */

export type CropPlan = {
    sourceWidth: number;
    sourceHeight: number;
    rotation: CropRotation;
    flipX: boolean;
    flipY: boolean;
    orientedWidth: number;
    orientedHeight: number;
    /** 旋转后坐标系中的像素裁剪框。 */
    sx: number;
    sy: number;
    sw: number;
    sh: number;
    outputWidth: number;
    outputHeight: number;
    format: CropOutputFormat;
    mimeType: CropOutputFormat;
    quality: number;
};

/** 把归一化状态换算成可复现的像素计划（真实绘制参数）。 */
export function planImageCrop(state: CropCanvasState, source: CropSize): CropPlan {
    const oriented = orientedSize(source, state.rotation);
    const rect = normalizeRect(state.rect);
    const sw = Math.min(oriented.width, Math.max(1, roundPx(rect.width * oriented.width)));
    const sh = Math.min(oriented.height, Math.max(1, roundPx(rect.height * oriented.height)));
    const sx = Math.min(Math.max(0, roundPx(rect.x * oriented.width)), oriented.width - sw);
    const sy = Math.min(Math.max(0, roundPx(rect.y * oriented.height)), oriented.height - sh);
    return {
        sourceWidth: source.width,
        sourceHeight: source.height,
        rotation: state.rotation,
        flipX: state.flipX,
        flipY: state.flipY,
        orientedWidth: oriented.width,
        orientedHeight: oriented.height,
        sx,
        sy,
        sw,
        sh,
        outputWidth: Math.max(1, roundPx(state.outputWidth)),
        outputHeight: Math.max(1, roundPx(state.outputHeight)),
        format: state.format,
        mimeType: state.format,
        quality: state.format === "image/png" ? 1 : 0.92,
    };
}

export function cropPlanHash(plan: CropPlan): string {
    return [plan.sourceWidth, plan.sourceHeight, plan.rotation, plan.flipX ? "fx" : "-", plan.flipY ? "fy" : "-", plan.sx, plan.sy, plan.sw, plan.sh, plan.outputWidth, plan.outputHeight, plan.format].join(":");
}

export type CropIssueCode = "no-source" | "source-too-small" | "source-too-large" | "source-too-heavy" | "output-too-small" | "output-too-large" | "unsupported-format";

export type CropIssue = { code: CropIssueCode; message: string; field?: "imageUrl" | "imageWidth" | "imageHeight" | "imageSize" | "imageFormat" };

export type CropSourceMeta = { width: number; height: number; bytes: number; mimeType: string };

/** 提交前校验：源图能力边界 + 输出像素边界（规格 §2 文案 + §7 字段校验）。 */
export function validateCropState(state: CropCanvasState, source?: CropSourceMeta | null): CropIssue[] {
    const issues: CropIssue[] = [];
    if (!source || source.width <= 0 || source.height <= 0) {
        issues.push({ code: "no-source", message: "请先上传图片", field: "imageUrl" });
        return issues;
    }
    const minSide = Math.min(source.width, source.height);
    const maxSide = Math.max(source.width, source.height);
    if (minSide < IMAGE_CROP_MIN_SIDE || maxSide > IMAGE_CROP_MAX_SIDE) {
        issues.push({ code: minSide < IMAGE_CROP_MIN_SIDE ? "source-too-small" : "source-too-large", message: `源图需在 ${IMAGE_CROP_MIN_SIDE}×${IMAGE_CROP_MIN_SIDE} ~ ${IMAGE_CROP_MAX_SIDE}×${IMAGE_CROP_MAX_SIDE} 之间`, field: "imageWidth" });
    }
    if (source.bytes > IMAGE_CROP_MAX_BYTES) {
        issues.push({ code: "source-too-heavy", message: "源图需小于 10MB", field: "imageSize" });
    }
    if (!IMAGE_CROP_FORMATS.includes(source.mimeType as CropOutputFormat)) {
        issues.push({ code: "unsupported-format", message: "仅支持 jpg / jpeg / png / webp", field: "imageFormat" });
    }
    const { outputWidth, outputHeight } = state;
    if (outputWidth <= 0 || outputHeight <= 0) {
        issues.push({ code: "output-too-small", message: "目标尺寸必须为正整数", field: "imageWidth" });
    } else if (Math.min(outputWidth, outputHeight) < 64 || Math.max(outputWidth, outputHeight) > IMAGE_CROP_MAX_SIDE) {
        issues.push({ code: "output-too-large", message: `目标尺寸需在 64 ~ ${IMAGE_CROP_MAX_SIDE}px 之间`, field: "imageHeight" });
    }
    return issues;
}

/* ------------------------------- 快照与字段 ------------------------------- */

export type ImageCropSnapshot = {
    toolId: typeof IMAGE_CROP_TOOL_ID;
    sourceAssetId: string;
    sourceName: string;
    sourceUrl: string;
    plan: CropPlan;
    platform: string;
    platformTitle: string;
    ratio: string;
    selectedMode: CropTab;
    planHash: string;
};

export type ImageCropSnapshotInput = {
    sourceAssetId: string;
    sourceName: string;
    sourceUrl: string;
    source: CropSize;
    state: CropCanvasState;
};

export function createImageCropSnapshot(input: ImageCropSnapshotInput): ImageCropSnapshot {
    const plan = planImageCrop(input.state, input.source);
    return {
        toolId: IMAGE_CROP_TOOL_ID,
        sourceAssetId: input.sourceAssetId,
        sourceName: input.sourceName,
        sourceUrl: input.sourceUrl,
        plan,
        platform: input.state.platformKey ?? CUSTOM_PLATFORM_KEY,
        platformTitle: input.state.platformTitle || CUSTOM_PLATFORM_TITLE,
        ratio: input.state.ratioId,
        selectedMode: input.state.activeTab,
        planHash: cropPlanHash(plan),
    };
}

export function imageCropUnitHash(snapshot: ImageCropSnapshot): string {
    return `${snapshot.sourceAssetId}:${snapshot.planHash}:${snapshot.platform}:${snapshot.ratio}`;
}

/** 结果由旧配置产生（换图/改尺寸后旧结果不能冒充当前结果，规格 §3）。 */
export function isSnapshotStale(snapshot: ImageCropSnapshot, current: ImageCropSnapshot): boolean {
    return imageCropUnitHash(snapshot) !== imageCropUnitHash(current);
}

export type ImageCropMedia = {
    imageUrl: string;
    contentUrl?: string;
    imageCropUrl?: string;
    imageSize?: number;
};

/** 规格 §7 的 12 个字段，一次组装，禁止页面各处自由拼接。 */
export function composeImageCropFields(snapshot: ImageCropSnapshot, media: ImageCropMedia): Record<string, unknown> {
    return {
        activeTab: snapshot.selectedMode,
        contentUrl: media.contentUrl ?? snapshot.sourceUrl,
        imageCropUrl: media.imageCropUrl ?? "",
        imageFormat: snapshot.plan.mimeType,
        imageHeight: snapshot.plan.outputHeight,
        imageSize: media.imageSize ?? 0,
        imageUrl: media.imageUrl || snapshot.sourceUrl,
        imageWidth: snapshot.plan.outputWidth,
        platform: snapshot.platform,
        platformTitle: snapshot.platformTitle,
        ratio: snapshot.ratio,
        selectedMode: snapshot.selectedMode,
    };
}

/* ------------------------------- 草稿 ------------------------------- */

/** 草稿 values：只放可复现的配置，不放二进制。 */
export function imageCropDraftValues(state: CropCanvasState, sourceAssetId: string | null): Record<string, unknown> {
    return {
        sourceAssetId,
        rect: state.rect,
        rotation: state.rotation,
        flipX: state.flipX,
        flipY: state.flipY,
        ratioId: state.ratioId,
        locked: state.locked,
        platformKey: state.platformKey,
        platformTitle: state.platformTitle,
        outputWidth: state.outputWidth,
        outputHeight: state.outputHeight,
        format: state.format,
        activeTab: state.activeTab,
        customSizes: state.customSizes,
    };
}

const asNumber = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const asBool = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);

export type ParsedCropDraft = { state: CropCanvasState; sourceAssetId: string | null };

/** 反序列化草稿：任何非法值回落默认，绝不让坏草稿把页面打崩。 */
export function parseImageCropDraftValues(values: Record<string, unknown> | null | undefined): ParsedCropDraft | null {
    if (!values || typeof values !== "object") return null;
    const base = createCropState();
    const rawRect = values.rect as Partial<CropRect> | undefined;
    const rect = rawRect
        ? normalizeRect({ x: asNumber(rawRect.x, base.rect.x), y: asNumber(rawRect.y, base.rect.y), width: asNumber(rawRect.width, base.rect.width), height: asNumber(rawRect.height, base.rect.height) })
        : base.rect;
    const rotationRaw = asNumber(values.rotation, 0);
    const rotation: CropRotation = rotationRaw === 90 || rotationRaw === 180 || rotationRaw === 270 ? rotationRaw : 0;
    const format = IMAGE_CROP_FORMATS.includes(values.format as CropOutputFormat) ? (values.format as CropOutputFormat) : base.format;
    const activeTab: CropTab = values.activeTab === "ratio" ? "ratio" : "size";
    const ratioId = typeof values.ratioId === "string" && (values.ratioId === FREE_RATIO_ID || findRatio(values.ratioId)) ? values.ratioId : base.ratioId;
    const customSizes = Array.isArray(values.customSizes)
        ? values.customSizes
              .filter((item): item is SavedCustomSize => Boolean(item) && typeof item === "object" && typeof (item as SavedCustomSize).id === "string" && Number.isFinite((item as SavedCustomSize).width) && Number.isFinite((item as SavedCustomSize).height))
              .map((item) => ({ id: item.id, width: Math.max(1, Math.round(item.width)), height: Math.max(1, Math.round(item.height)), savedAt: asNumber(item.savedAt, 0) }))
        : [];
    return {
        state: {
            rect,
            rotation,
            flipX: asBool(values.flipX, false),
            flipY: asBool(values.flipY, false),
            ratioId,
            locked: asBool(values.locked, true),
            platformKey: typeof values.platformKey === "string" ? values.platformKey : null,
            platformTitle: typeof values.platformTitle === "string" ? values.platformTitle : "",
            outputWidth: Math.max(1, Math.round(asNumber(values.outputWidth, base.outputWidth))),
            outputHeight: Math.max(1, Math.round(asNumber(values.outputHeight, base.outputHeight))),
            format,
            activeTab,
            customSizes,
        },
        sourceAssetId: typeof values.sourceAssetId === "string" && values.sourceAssetId ? values.sourceAssetId : null,
    };
}
