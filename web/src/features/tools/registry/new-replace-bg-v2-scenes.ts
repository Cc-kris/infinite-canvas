/**
 * 商品图（NEW_REPLACE_BG_V2）「场景参考图」本地数据。
 *
 * 事实来源：原站 /draw/product-home 照片墙 DOM（类目页签 + 卡片标题），图片同源下载到
 * `web/public/__cases/new-replace-bg-v2/scenes/`（`<id>.webp` 场景图，`<id>-goods.webp` 左下角商品示意小图）。
 * 日用百货取前 12 张，其余类目各取 3 张（类目内去重标题）；原站每类实际 30~48 张，本地只放已落盘的部分。
 */

const BASE = "/__cases/new-replace-bg-v2";

/** 原站 16 个类目页签（无「全部」），顺序与文案逐字来自原站。 */
export const PRODUCT_BG_CATEGORIES = [
    "日用百货", "家居家装", "服饰箱包", "美妆个护", "家用电器", "玩具类目", "儿童 & 母婴", "3C数码",
    "办公用品", "运动户外", "工艺/艺术品", "宠物用品", "食品饮料", "医药保健/护理", "汽车用品", "其他",
] as const;

export const DEFAULT_PRODUCT_BG_CATEGORY = PRODUCT_BG_CATEGORIES[0];

/** 原站排序项；本地没有收藏 / 热度数据，只有「智能推荐」（原站顺序）可用。 */
export const PRODUCT_BG_SORTS = ["智能推荐", "按收藏时间", "按素材热度"] as const;

export type ProductBgScene = { id: string; category: string; title: string; image: string; goods: string };

const ROWS: [string, string, string][] = [
    ["daily-01", "日用百货", "桌面-保温杯"],
    ["daily-02", "日用百货", "厨房-搅拌器"],
    ["daily-03", "日用百货", "客厅-毯子"],
    ["daily-04", "日用百货", "厨房-电子秤"],
    ["daily-05", "日用百货", "厨房-电子秤"],
    ["daily-06", "日用百货", "草地-篮子"],
    ["daily-07", "日用百货", "餐桌-杯子"],
    ["daily-08", "日用百货", "餐桌-水壶"],
    ["daily-09", "日用百货", "客厅-书柜"],
    ["daily-10", "日用百货", "餐桌-茶具"],
    ["daily-11", "日用百货", "书架-储物箱"],
    ["daily-12", "日用百货", "餐桌-篮子"],
    ["home-01", "家居家装", "卧室-床"],
    ["home-02", "家居家装", "展台-LED灯"],
    ["home-03", "家居家装", "客厅-收纳篮"],
    ["fashion-01", "服饰箱包", "纯色背景-皮带"],
    ["fashion-02", "服饰箱包", "海滩-太阳镜"],
    ["fashion-03", "服饰箱包", "万圣节-耳环"],
    ["beauty-01", "美妆个护", "湖边-香水"],
    ["beauty-02", "美妆个护", "展台-护肤精华"],
    ["beauty-03", "美妆个护", "浴室-电动牙刷"],
    ["appliance-01", "家用电器", "搅拌机-厨房"],
    ["appliance-02", "家用电器", "电饭煲-厨房"],
    ["appliance-03", "家用电器", "空气净化器-客厅"],
    ["toy-01", "玩具类目", "桌面-毛绒玩具"],
    ["toy-02", "玩具类目", "客厅-玩偶"],
    ["toy-03", "玩具类目", "桌面-玩具"],
    ["baby-01", "儿童 & 母婴", "展台-婴儿连体衣"],
    ["baby-02", "儿童 & 母婴", "纯色背景-婴儿连体衣"],
    ["baby-03", "儿童 & 母婴", "雪地-婴儿车"],
    ["digital-01", "3C数码", "书桌-平板电脑"],
    ["digital-02", "3C数码", "桌面-转换器"],
    ["digital-03", "3C数码", "纯色背景-转换器"],
    ["office-01", "办公用品", "桌面-数字板"],
    ["office-02", "办公用品", "工作台-量具"],
    ["office-03", "办公用品", "工作台-工具"],
    ["outdoor-01", "运动户外", "木桌-钓鱼盒"],
    ["outdoor-02", "运动户外", "露台-火盆"],
    ["outdoor-03", "运动户外", "餐桌-草地"],
    ["craft-01", "工艺/艺术品", "客厅-摆件"],
    ["craft-02", "工艺/艺术品", "客厅-雕塑"],
    ["craft-03", "工艺/艺术品", "花园-雕塑"],
    ["pet-01", "宠物用品", "纯色背景-狗玩具"],
    ["pet-02", "宠物用品", "草地-狗窝"],
    ["pet-03", "宠物用品", "狗狗-户外"],
    ["food-01", "食品饮料", "厨房-调料"],
    ["food-02", "食品饮料", "月饼-餐桌"],
    ["food-03", "食品饮料", "茶叶-展台"],
    ["health-01", "医药保健/护理", "室内-助行器"],
    ["health-02", "医药保健/护理", "保健品-桌面"],
    ["health-03", "医药保健/护理", "保健品-展台"],
    ["auto-01", "汽车用品", "公路-配件"],
    ["auto-02", "汽车用品", "公路-工具"],
    ["auto-03", "汽车用品", "汽车内饰-汽车遮阳板"],
    ["other-01", "其他", "室内-秋千椅"],
    ["other-02", "其他", "纯色背景-三轮摩托车"],
    ["other-03", "其他", "岩石-水晶"],];

export const PRODUCT_BG_SCENES: readonly ProductBgScene[] = ROWS.map(([id, category, title]) => ({
    id,
    category,
    title,
    image: `${BASE}/scenes/${id}.webp`,
    goods: `${BASE}/scenes/${id}-goods.webp`,
}));

/** 原站搜索在当前类目内按标题过滤；类目为空表示「全部」（编辑器参考图抽屉）。 */
export function filterProductBgScenes(category: string | null, keyword: string): ProductBgScene[] {
    const query = keyword.trim().toLowerCase();
    return PRODUCT_BG_SCENES.filter((item) => (!category || item.category === category) && (!query || item.title.toLowerCase().includes(query)));
}

/** 「或试试这些」6 张示例：原图用于展示，抠好的透明图直接作为商品进入编辑器（与原站一致，不弹抠图）。 */
export const PRODUCT_BG_EXAMPLES = [1, 2, 3, 4, 5, 6].map((index) => ({
    id: `example-${index}`,
    image: `${BASE}/examples/product-${index}.webp`,
    cutout: `${BASE}/examples/cutout-${index}.webp`,
}));

export const PRODUCT_BG_GUIDE_VIDEO = `${BASE}/guide-ai-product.mp4`;

/** 原站第二步页签「商品合成 / 商品替换」与说明文案。 */
export const PRODUCT_BG_MODES = [
    { id: "compose", label: "商品合成", hint: "将您的商品合成至选中的场景图中。" },
    { id: "replace", label: "商品替换", hint: "以您的商品替换参考图中的商品。" },
] as const;

export type ProductBgMode = (typeof PRODUCT_BG_MODES)[number]["id"];

/**
 * 选中场景 → adapter 现有字段：场景图作为自定义背景（bgAssetId，进参考图），
 * 场景标题与合成方式写进 customPrompt（adapter 会原样进提示词）。
 */
export function productBgScenePrompt(title: string, mode: ProductBgMode): string {
    const action = mode === "replace" ? "以商品替换参考图中的商品" : "将商品合成至参考图场景中";
    return `参考图场景「${title}」：${action}，保留参考图的场景、光线与构图`;
}

export function productBgModeOf(customPrompt: string): ProductBgMode {
    return customPrompt.includes("以商品替换参考图中的商品") ? "replace" : "compose";
}

/** 原站「商品替换 → 高级自定义 → 保留遮挡物」说明。adapter 没有独立字段，开启时写进 customPrompt。 */
export const PRODUCT_BG_OCCLUSION_HINT = "提取商品主体前的遮挡物置于画面最顶层，保留原图的遮挡关系。";
const OCCLUSION_PROMPT = "；保留遮挡物：提取参考图中商品主体前的遮挡物置于画面最顶层，保留原图的遮挡关系";

export function productBgOcclusionOf(customPrompt: string): boolean {
    return customPrompt.includes(OCCLUSION_PROMPT);
}

/** 参考图标题 + 合成方式 + 保留遮挡物（只在商品替换下生效）→ customPrompt。 */
export function productBgPrompt(title: string, mode: ProductBgMode, occlusion: boolean): string {
    return productBgScenePrompt(title, mode) + (mode === "replace" && occlusion ? OCCLUSION_PROMPT : "");
}

export function productBgTitleOf(customPrompt: string): string {
    return /「(.+?)」/.exec(customPrompt)?.[1] ?? "";
}

/** 原站编辑器参考图抽屉页签，顺序与文案逐字来自原站。 */
export const PRODUCT_BG_DRAWER_TABS = ["智能推荐", "预设", "我的", "收藏", "历史", "采集"] as const;
export type ProductBgDrawerTab = (typeof PRODUCT_BG_DRAWER_TABS)[number];

/** 智能推荐「场景：」筛选项（原站文案）；本地场景图没有室内/室外等属性标注，只能「全部」。 */
export const PRODUCT_BG_SCENE_FILTERS = ["全部", "室内", "室外", "节日活动", "简单背景", "工作场所", "休闲场所", "运动场所", "自然环境"] as const;

/** 预设页签的三个下拉（原站文案）；本地只标注了品类，场景 / 视角保持「全部」。 */
export const PRODUCT_BG_PRESET_CATEGORIES = ["全部", "3C数码", "日用百货", "美妆个护", "服饰箱包", "家居家装", "家用电器", "钟表首饰", "食品饮料", "母婴产品"] as const;
export const PRODUCT_BG_PRESET_SCENES = ["全部", "纯色", "展台", "简约", "礼物", "自然", "户外", "运动", "鲜花", "节日"] as const;
export const PRODUCT_BG_PRESET_VIEWS = ["全部", "水平拍摄", "倾斜30°拍摄", "倾斜45°拍摄", "垂直俯拍"] as const;
export const DEFAULT_PRODUCT_BG_PRESET_CATEGORY = "美妆个护";

/**
 * 预设背景图：原站编辑器「预设」页签每个品类的前 12 张（不足 12 张取全部），去重后 43 张，
 * 512 宽 webp 落在 `presets/preset-<nn>.webp`。下面是每个品类在原站列表里的顺序。
 */
const PRESET_ROWS: Record<string, number[]> = {
    "3C数码": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    日用百货: [1, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
    美妆个护: [1, 13, 14, 15, 16, 17, 18, 24, 25, 26, 27, 28],
    服饰箱包: [1, 13, 14, 15, 16, 17, 18, 19, 29, 30, 31, 32],
    家居家装: [24, 33, 34],
    家用电器: [17, 28, 33, 35, 36],
    钟表首饰: [17, 18, 19, 25, 28, 29, 30, 31, 32, 37, 38, 39],
    食品饮料: [17, 18, 19, 20, 21, 22, 23, 33, 40, 41, 42, 43],
    母婴产品: [1],
};

export type ProductBgPreset = { id: string; image: string };

const presetOf = (index: number): ProductBgPreset => {
    const id = `preset-${String(index).padStart(2, "0")}`;
    return { id, image: `${BASE}/presets/${id}.webp` };
};

export function filterProductBgPresets(category: string): ProductBgPreset[] {
    const ids = category === "全部" ? [...new Set(Object.values(PRESET_ROWS).flat())] : (PRESET_ROWS[category] ?? []);
    return ids.map(presetOf);
}
