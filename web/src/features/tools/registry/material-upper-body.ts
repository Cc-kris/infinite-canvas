import { z } from "zod";

/**
 * TASK-037 / MATERIAL_UPPER_BODY（上装换料，makeType 16）——“页面”这一层的事实来源。
 *
 * 证据（只读，不搬 LinkFox 前端代码）：
 * - docs/V1.0/plan_linkfox_navigation/page-specs/30-material-upper-body.md（区域、控件、联动、校验、验收）
 * - docs/V1.0/plan_linkfox_navigation/tool_specs.json#MATERIAL_UPPER_BODY（7 个字段、页面文案、origin=supplemental）
 * - web/src/features/tools/registry/index.ts（page catalog：layout=dress / adapter=image / 字段清单）
 * - web/src/services/api/tools/gateway.ts#TOOL_ADAPTER_TABLE（本工具 7 个字段进指纹；prompt 必填；要求参考图）
 *
 * 证据边界（不虚构）：
 * - 原站该工具无直达 URL（补充工具），material 分类树**未取得 chunk 枚举**；下面的材质大类/子类是
 *   “本地材质目录”，每一项都标注 evidence="inferred"，并且只用于本页内的选择与 prompt 文案，
 *   不冒充 LinkFox 的 categoryIds 真实取值。因此 categoryIds 使用本地稳定 id（`<大类>.<子类>`），
 *   在 adapter 里显式校验，绝不自由拼接未知值。
 * - isMatting 的默认值取 chunk 语义（boolean，required），本页显式落成 false，不用 undefined。
 *
 * 分工：ToolSpec（id/route/fields）仍由 registry/index.ts 持有，本模块不重复声明 id 级 spec，
 * 只提供本页独有的目录、联动、校验、快照与 prompt。
 */

export const MATERIAL_UPPER_BODY_TOOL_ID = "MATERIAL_UPPER_BODY";
export const MATERIAL_UPPER_BODY_ROUTE = "/tools/product-design/material-upper-body";
export const MATERIAL_UPPER_BODY_MAKE_TYPE = 16;
/** 草稿键 `tool-draft:v1:MATERIAL_UPPER_BODY` 的槽位名（草稿 values 内的 key）。 */
export const MATERIAL_UPPER_BODY_DRAFT_SLOT = "materialUpperBody";

/** page-specs §7 的 7 个字段（结果没有独立结果字段，结果走任务 items）。 */
export const MATERIAL_FIELDS = ["categoryIds", "categoryName", "imageName", "imageUrl", "isMatting", "outputNum", "subType"] as const;

/**
 * 上传限制：与原站商品类上传卡一致（10M以内，384*384 ~ 4096*4096，png/jpeg/webp）。
 */
export const MATERIAL_UPLOAD = {
    maxBytes: 10 * 1024 * 1024,
    minSide: 384,
    maxSide: 4096,
    mimeTypes: ["image/png", "image/jpeg", "image/webp"] as const,
    hint: "10M以内，384*384 ~ 4096*4096",
} as const;

/** page-specs §7：「outputNum 默认 1」，范围取模型目录/网关 normalizeCount（1–15），本页收敛到 1–4。 */
export const MATERIAL_OUTPUT_OPTIONS = [1, 2, 3, 4] as const;
export const MATERIAL_MAX_OUTPUT = 4;
export const MATERIAL_DEFAULT_OUTPUT = 1;

/* ============================== 材质目录 ============================== */

export type MaterialEvidence = "inferred";

export type MaterialLeaf = {
    /** 稳定 id 片段，最终 categoryIds 为 `<categoryKey>.<key>`。 */
    key: string;
    label: string;
    /** 面料质感描述，直接进入真实 prompt；不承担“上游枚举”的承诺。 */
    texture: string;
    /** 子类整表默认 inferred，个别项可显式标注。 */
    evidence?: MaterialEvidence;
};

export type MaterialCategory = {
    key: string;
    label: string;
    hint: string;
    leaves: readonly MaterialLeaf[];
    evidence: MaterialEvidence;
};

export const MATERIAL_CATEGORIES: readonly MaterialCategory[] = [
    {
        key: "cotton",
        label: "棉质",
        hint: "天然纤维，哑光、纹理细密",
        evidence: "inferred",
        leaves: [
            { key: "plain", label: "平纹棉", texture: "平纹棉布：经纬交织均匀，表面细腻哑光，轻微自然褶皱", evidence: "inferred" },
            { key: "twill", label: "斜纹棉", texture: "斜纹棉布：斜向纹路清晰，布面紧实，垂坠挺括", evidence: "inferred" },
            { key: "washed", label: "水洗棉", texture: "水洗棉：做旧柔和的褪色感，表面有细微磨毛与柔软褶皱", evidence: "inferred" },
            { key: "oxford", label: "牛津纺", texture: "牛津纺：粗支双经单纬，颗粒感明显，衬衫料特有的干爽挺度", evidence: "inferred" },
        ],
    },
    {
        key: "denim",
        label: "牛仔",
        hint: "靛蓝斜纹，硬挺有骨感",
        evidence: "inferred",
        leaves: [
            { key: "light", label: "浅色水洗牛仔", texture: "浅色水洗牛仔：靛蓝褪色层次自然，膝部与缝线处有磨白" },
            { key: "dark", label: "深色原牛", texture: "深色原牛：饱和靛蓝，布面硬挺，落色边缘清晰" },
            { key: "stretch", label: "弹力牛仔", texture: "弹力牛仔：贴合身形，布面细密，回弹柔和" },
        ],
    },
    {
        key: "silk",
        label: "真丝",
        hint: "高光泽、流动感强",
        evidence: "inferred",
        leaves: [
            { key: "satin", label: "真丝缎面", texture: "真丝缎面：高光泽、柔和反光带，垂坠如水，褶皱圆润" },
            { key: "crepe", label: "真丝双绉", texture: "真丝双绉：细腻砂面肌理，光泽内敛，垂感自然" },
            { key: "charmeuse", label: "真丝雪纺缎", texture: "真丝雪纺缎：轻薄半透，光晕柔和，边缘有轻盈飘动感" },
        ],
    },
    {
        key: "leather",
        label: "皮革",
        hint: "硬挺塑形、光泽可调",
        evidence: "inferred",
        leaves: [
            { key: "matte", label: "哑光皮", texture: "哑光皮革：细腻皮纹，无反光，边缘硬挺有结构" },
            { key: "patent", label: "漆皮", texture: "漆皮：镜面高光，强反光带沿廓形分布" },
            { key: "suede", label: "麂皮", texture: "麂皮：绒面哑光，绒毛方向可见，触感柔软" },
        ],
    },
    {
        key: "knit",
        label: "针织",
        hint: "弹性、线圈肌理",
        evidence: "inferred",
        leaves: [
            { key: "rib", label: "罗纹针织", texture: "罗纹针织：竖向线圈脊线清晰，弹性贴合，边缘自然卷边" },
            { key: "cable", label: "麻花针织", texture: "麻花针织：粗针绞花纹路立体，手工感明显" },
            { key: "jersey", label: "平纹针织", texture: "平纹针织：细密平针，表面平整柔软，轻微垂坠" },
        ],
    },
    {
        key: "linen",
        label: "亚麻",
        hint: "粗织、自然褶皱",
        evidence: "inferred",
        leaves: [
            { key: "natural", label: "本色亚麻", texture: "本色亚麻：纱节明显，粗织纹理，自然柔和褶皱" },
            { key: "blend", label: "亚麻混纺", texture: "亚麻混纺：亚麻纹理与柔软手感并存，褶皱减少" },
        ],
    },
    {
        key: "chiffon",
        label: "雪纺",
        hint: "轻薄飘逸、微透",
        evidence: "inferred",
        leaves: [
            { key: "solid", label: "素色雪纺", texture: "素色雪纺：轻薄微透，飘动感强，表面细腻平滑" },
            { key: "printed", label: "印花雪纺", texture: "印花雪纺：轻薄底布上有细腻印花层次，图案随褶皱自然变形" },
        ],
    },
    {
        key: "technical",
        label: "功能性面料",
        hint: "涂层、防风、速干",
        evidence: "inferred",
        leaves: [
            { key: "windproof", label: "防风面料", texture: "防风面料：表面紧密平滑，略带涂层光泽，廓形硬挺" },
            { key: "quickdry", label: "速干面料", texture: "速干面料：细密网感肌理，哑光，轻薄不打褶" },
            { key: "down", label: "羽绒面料", texture: "羽绒面料：绗缝分格饱满，表面细腻防绒，光泽柔润" },
        ],
    },
] as const;

export type MaterialCategoryKey = (typeof MATERIAL_CATEGORIES)[number]["key"];

export const MATERIAL_CATEGORY_KEYS = MATERIAL_CATEGORIES.map((category) => category.key) as readonly MaterialCategoryKey[];

export const MATERIAL_CATEGORY_BY_KEY: Readonly<Record<string, MaterialCategory>> = Object.fromEntries(
    MATERIAL_CATEGORIES.map((category) => [category.key, category]),
);

export function materialCategoryOf(key: string): MaterialCategory | undefined {
    return MATERIAL_CATEGORY_BY_KEY[key];
}

export function materialLeavesOf(categoryKey: string): readonly MaterialLeaf[] {
    return materialCategoryOf(categoryKey)?.leaves ?? [];
}

/** categoryIds 里的稳定 id：`<大类>.<子类>`；未命中目录返回 undefined（禁止自由拼接）。 */
export function materialLeafId(categoryKey: string, leafKey: string): string | undefined {
    const leaf = materialLeavesOf(categoryKey).find((item) => item.key === leafKey);
    return leaf ? `${categoryKey}.${leaf.key}` : undefined;
}

export function materialLeafByCategoryId(id: string): { category: MaterialCategory; leaf: MaterialLeaf } | undefined {
    const [categoryKey, leafKey] = id.split(".");
    if (!categoryKey || !leafKey) return undefined;
    const category = materialCategoryOf(categoryKey);
    const leaf = category?.leaves.find((item) => item.key === leafKey);
    if (!category || !leaf) return undefined;
    return { category, leaf };
}

export const MATERIAL_CATALOG_NOTICE =
    "材质类目为本地目录：大类 + 子类共同决定换料效果，只接受目录内取值。";

/* ============================== 上装蒙版区域 ============================== */

/** 归一化椭圆（相对原图宽高），用于「上装蒙版」预览与抠图导出。 */
export type MaterialRegion = { cx: number; cy: number; rx: number; ry: number };

/** 默认覆盖画面上半部躯干：中心略高于画面中线，横向约 2/3 宽。 */
export const MATERIAL_DEFAULT_REGION: MaterialRegion = { cx: 0.5, cy: 0.34, rx: 0.32, ry: 0.27 };

/** 蒙版最小面积占比（椭圆面积/整图），低于它视为退化，禁止提交。 */
export const MATERIAL_MIN_REGION_AREA = 0.02;

const clamp01 = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

export function clampMaterialRegion(region: Partial<MaterialRegion> | null | undefined): MaterialRegion {
    const source = region ?? {};
    const cx = clamp01(source.cx ?? MATERIAL_DEFAULT_REGION.cx);
    const cy = clamp01(source.cy ?? MATERIAL_DEFAULT_REGION.cy);
    const rx = Math.min(clamp01(source.rx ?? MATERIAL_DEFAULT_REGION.rx), Math.min(cx, 1 - cx));
    const ry = Math.min(clamp01(source.ry ?? MATERIAL_DEFAULT_REGION.ry), Math.min(cy, 1 - cy));
    return { cx, cy, rx, ry };
}

export function materialRegionArea(region: MaterialRegion): number {
    return Math.PI * region.rx * region.ry;
}

export function isMaterialRegionUsable(region: MaterialRegion): boolean {
    const safe = clampMaterialRegion(region);
    if (safe.rx <= 0 || safe.ry <= 0) return false;
    return materialRegionArea(safe) >= MATERIAL_MIN_REGION_AREA;
}

/* ============================== 取值 ============================== */

export type MaterialValues = {
    /** 当前材质大类（"" = 未选，生成禁用）。 */
    categoryKey: MaterialCategoryKey | "";
    /** 已选子类（多选，顺序即用户点选顺序；subType 取第一个）。 */
    leafKeys: string[];
    /** 抠图开关：chunk 语义为 boolean + required，默认 false。 */
    isMatting: boolean;
    /** 上装蒙版区域（isMatting 开启时用于预览/导出真实 PNG）。 */
    mattingRegion: MaterialRegion;
    outputNum: number;
    /** 真实资产 id（草稿只存 id，不存 blob）。 */
    imageAssetId: string;
    /** 上传后自动填入的展示名，可编辑。 */
    imageName: string;
    /** 生图模型（来自渠道配置；空 = 跟随用户默认）。 */
    modelId: string;
};

export const DEFAULT_MATERIAL_VALUES: MaterialValues = {
    categoryKey: "",
    leafKeys: [],
    isMatting: false,
    mattingRegion: MATERIAL_DEFAULT_REGION,
    outputNum: MATERIAL_DEFAULT_OUTPUT,
    imageAssetId: "",
    imageName: "",
    modelId: "",
};

/** 当前生效子类（subType 字段值）：多选时取第一个，未选为空串。 */
export function materialSubTypeOf(values: Pick<MaterialValues, "leafKeys">): string {
    return values.leafKeys[0] ?? "";
}

/** categoryIds 字段值：多选叶子 id 逗号串；无法命中目录的 id 会被剔除而不是原样提交。 */
export function materialCategoryIdsOf(values: Pick<MaterialValues, "categoryKey" | "leafKeys">): string {
    return values.leafKeys
        .map((leafKey) => materialLeafId(values.categoryKey, leafKey))
        .filter((id): id is string => Boolean(id))
        .join(",");
}

/** categoryName 字段值：由分类选择器显示，不手填内部值。 */
export function materialCategoryNameOf(values: Pick<MaterialValues, "categoryKey" | "leafKeys">): string {
    const category = materialCategoryOf(values.categoryKey);
    if (!category) return "";
    const labels = values.leafKeys.map((leafKey) => category.leaves.find((leaf) => leaf.key === leafKey)?.label).filter((label): label is string => Boolean(label));
    return labels.length ? `${category.label} / ${labels.join(" / ")}` : "";
}

export const materialValuesSchema = z.object({
    categoryKey: z.string().max(32),
    leafKeys: z.array(z.string().max(32)).max(8),
    isMatting: z.boolean(),
    mattingRegion: z.object({ cx: z.number(), cy: z.number(), rx: z.number(), ry: z.number() }),
    outputNum: z.number().int().min(1).max(MATERIAL_MAX_OUTPUT),
    imageAssetId: z.string(),
    imageName: z.string().max(200),
    modelId: z.string().max(120),
});

export type MaterialIssue = { field: (typeof MATERIAL_FIELDS)[number] | "mattingRegion" | "modelId"; message: string };

const asString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

/** 草稿/外部输入 → 合法值：只接受目录内取值；未知值回退默认，不做静默拼接。 */
export function readMaterialValues(raw?: Record<string, unknown> | null): MaterialValues {
    if (!raw) return { ...DEFAULT_MATERIAL_VALUES, mattingRegion: { ...MATERIAL_DEFAULT_REGION } };
    const categoryKey =
        typeof raw.categoryKey === "string" && MATERIAL_CATEGORY_BY_KEY[raw.categoryKey] ? (raw.categoryKey as MaterialCategoryKey) : "";
    const allowedLeaves = materialLeavesOf(categoryKey).map((leaf) => leaf.key);
    const leafKeys = Array.isArray(raw.leafKeys) ? raw.leafKeys.filter((key): key is string => typeof key === "string" && allowedLeaves.includes(key)) : [];
    const outputNum = typeof raw.outputNum === "number" && Number.isFinite(raw.outputNum) ? Math.floor(raw.outputNum) : MATERIAL_DEFAULT_OUTPUT;
    return {
        categoryKey,
        leafKeys: Array.from(new Set(leafKeys)),
        isMatting: raw.isMatting === true,
        mattingRegion: clampMaterialRegion((raw.mattingRegion ?? {}) as Partial<MaterialRegion>),
        outputNum: Math.max(1, Math.min(MATERIAL_MAX_OUTPUT, outputNum)),
        imageAssetId: asString(raw.imageAssetId),
        imageName: asString(raw.imageName),
        modelId: asString(raw.modelId),
    };
}

export type MaterialLinkResult = { values: MaterialValues; changes: string[] };

/**
 * 联动收敛（page-specs §3「类目选择联动子类」）：
 * - 大类未选 → 子类清空；
 * - 大类已选但子类不属于该大类 → 收敛到该大类第一个子类（并说明原因）；
 * - 张数落在 1–4；蒙版区域夹到画面内。
 * 返回 changes 供 UI 明示“已自动联动了什么”，不静默改值。
 */
export function linkMaterialValues(input: MaterialValues): MaterialLinkResult {
    const changes: string[] = [];
    const categoryKey = materialCategoryOf(input.categoryKey) ? input.categoryKey : "";
    if (!categoryKey) {
        if (input.categoryKey) changes.push("材质大类不在本地目录内，已清空");
        if (input.leafKeys.length) changes.push("未选材质大类，已清空子类");
        return {
            values: { ...input, categoryKey: "", leafKeys: [], mattingRegion: clampMaterialRegion(input.mattingRegion) },
            changes,
        };
    }
    const leaves = materialLeavesOf(categoryKey);
    const kept = input.leafKeys.filter((key) => leaves.some((leaf) => leaf.key === key));
    let leafKeys = Array.from(new Set(kept));
    if (kept.length !== input.leafKeys.length) {
        changes.push(`子类不属于「${materialCategoryOf(categoryKey)?.label}」，已剔除 ${input.leafKeys.length - kept.length} 项`);
    }
    if (!leafKeys.length) {
        leafKeys = [leaves[0].key];
        changes.push(`已自动选中子类「${leaves[0].label}」`);
    }
    const outputNum = Math.max(1, Math.min(MATERIAL_MAX_OUTPUT, Math.floor(Number.isFinite(input.outputNum) ? input.outputNum : MATERIAL_DEFAULT_OUTPUT)));
    if (outputNum !== input.outputNum) changes.push(`生成张数收敛为 ${outputNum} 张`);
    return { values: { ...input, categoryKey, leafKeys, outputNum, mattingRegion: clampMaterialRegion(input.mattingRegion) }, changes };
}

/* ============================== 能力 ============================== */

export type MaterialDescriptorLike = { executable?: boolean; fields?: readonly string[] };

export type MaterialCapabilityInput = {
    /** 用户当前配置的生图模型（空 = 未配置，提交禁用）。 */
    modelReady?: boolean;
    provider?: string | null;
    modelId?: string | null;
    /** 网关描述符（gateway.describeToolExecution）。 */
    descriptor?: MaterialDescriptorLike | null;
    /** 渠道声明的最大出图数。 */
    providerMaxOutputNum?: number | null;
};

export type MaterialCapability = {
    executable: boolean;
    provider: string;
    modelId: string;
    modelReady: boolean;
    outputOptions: number[];
    maxOutput: number;
    notices: string[];
    /** 网关字段表未覆盖的页面字段。 */
    missingFields: string[];
};

export function resolveMaterialCapability(input: MaterialCapabilityInput = {}): MaterialCapability {
    const notices: string[] = [];
    const declaredMax =
        typeof input.providerMaxOutputNum === "number" && Number.isFinite(input.providerMaxOutputNum)
            ? Math.floor(input.providerMaxOutputNum)
            : MATERIAL_MAX_OUTPUT;
    const maxOutput = Math.max(1, Math.min(MATERIAL_MAX_OUTPUT, declaredMax));
    if (maxOutput < MATERIAL_MAX_OUTPUT) notices.push(`当前模型单次最多 ${maxOutput} 张，已按能力收敛可选张数`);
    const outputOptions = MATERIAL_OUTPUT_OPTIONS.filter((value) => value <= maxOutput);
    const missingFields = input.descriptor?.fields ? MATERIAL_FIELDS.filter((field) => !(input.descriptor as { fields: readonly string[] }).fields.includes(field)) : [];
    if (missingFields.length) notices.push(`网关字段表缺少 ${missingFields.join("、")}，这些字段不会透传到 provider`);
    const modelReady = Boolean(input.modelReady);
    if (!modelReady) notices.push("尚未配置生图模型，无法提交真实生成");
    if (input.descriptor?.executable === false) notices.push("本工具在当前运行时不可执行（网关未接入图片能力）");
    notices.push(MATERIAL_CATALOG_NOTICE);
    return {
        executable: input.descriptor?.executable !== false && modelReady,
        provider: input.provider ?? "",
        modelId: input.modelId ?? "",
        modelReady,
        outputOptions: outputOptions.length ? outputOptions : [1],
        maxOutput,
        notices,
        missingFields,
    };
}

/* ============================== 校验 ============================== */

export type ValidateMaterialInput = {
    values: MaterialValues;
    capability: MaterialCapability;
    /** 上装图是否已入库且可读。 */
    sourceReady: boolean;
    /** 输入尺寸（用于提示“蒙版与原图同尺寸”）。 */
    sourceSize?: { width?: number; height?: number } | null;
};

/** 提交前页面校验：缺什么就定位到哪个字段，不在提交后才发现。 */
export function validateMaterialState(input: ValidateMaterialInput): MaterialIssue[] {
    const issues: MaterialIssue[] = [];
    const { values, capability, sourceReady } = input;

    if (!sourceReady) issues.push({ field: "imageUrl", message: "请先上传上装图片（10M以内，384*384 ~ 4096*4096）" });
    if (!values.imageName.trim()) issues.push({ field: "imageName", message: "图片名称不能为空（上传后会自动填入，可编辑）" });
    if (!materialCategoryOf(values.categoryKey)) issues.push({ field: "categoryIds", message: "请选择材质大类" });
    else if (!values.leafKeys.length) issues.push({ field: "subType", message: "请选择材质子类" });
    if (!Number.isInteger(values.outputNum) || values.outputNum < 1 || values.outputNum > capability.maxOutput) {
        issues.push({ field: "outputNum", message: `生成张数必须是 1-${capability.maxOutput} 的整数` });
    }
    if (values.isMatting && !isMaterialRegionUsable(values.mattingRegion)) {
        issues.push({ field: "mattingRegion", message: "上装蒙版区域太小或超出画面，请拖动/放大后再提交" });
    }
    if (!capability.executable) issues.push({ field: "modelId", message: capability.modelReady ? "当前网关不可执行本工具" : "请先在配置中选择生图模型" });
    return issues;
}

/* ============================== 快照与漂移 ============================== */

export type MaterialSnapshot = {
    revision: number | string | null;
    categoryIds: string;
    categoryName: string;
    subType: string;
    isMatting: boolean;
    outputNum: number;
    imageAssetId: string;
    imageName: string;
    mattingRegion: MaterialRegion;
    prompt: string;
};

export function createMaterialSnapshot(values: MaterialValues, capability: MaterialCapability, revision: number | string | null): MaterialSnapshot {
    return {
        revision,
        categoryIds: materialCategoryIdsOf(values),
        categoryName: materialCategoryNameOf(values),
        subType: materialSubTypeOf(values),
        isMatting: values.isMatting,
        outputNum: values.outputNum,
        imageAssetId: values.imageAssetId,
        imageName: values.imageName,
        mattingRegion: { ...values.mattingRegion },
        prompt: buildMaterialPrompt(values, capability),
    };
}

const sameRegion = (a: MaterialRegion, b: MaterialRegion) =>
    Math.abs(a.cx - b.cx) < 0.001 && Math.abs(a.cy - b.cy) < 0.001 && Math.abs(a.rx - b.rx) < 0.001 && Math.abs(a.ry - b.ry) < 0.001;

/** 结果是否“来自旧版本”：先比源图，再比配置项，逐项给人类可读原因。 */
export function describeMaterialDrift(snapshot: MaterialSnapshot | undefined, current: MaterialSnapshot | undefined): string | undefined {
    if (!snapshot || !current) return undefined;
    if (snapshot.imageAssetId !== current.imageAssetId) return "上装图片已更换";
    if (snapshot.categoryIds !== current.categoryIds) return "材质类目已改变";
    if (snapshot.isMatting !== current.isMatting) return "抠图开关已改变";
    if (snapshot.isMatting && !sameRegion(snapshot.mattingRegion, current.mattingRegion)) return "上装蒙版区域已改变";
    if (snapshot.outputNum !== current.outputNum) return "生成张数已改变";
    if (snapshot.prompt !== current.prompt) return "换料指令已改变";
    return undefined;
}

/* ============================== Prompt ============================== */

/** 真实提交给 provider 的指令：只换面料，保留版型；抠图开启时说明输入已是透明背景上装。 */
export function buildMaterialPrompt(values: MaterialValues, capability?: MaterialCapability): string {
    const category = materialCategoryOf(values.categoryKey);
    const leaf = category?.leaves.find((item) => item.key === values.leafKeys[0]);
    const textures = values.leafKeys
        .map((key) => category?.leaves.find((item) => item.key === key))
        .filter((item): item is MaterialLeaf => Boolean(item))
        .map((item) => item.texture);

    const lines = [
        "任务：上装换料（只替换上装面料材质，保留原版型）。",
        category && leaf ? `目标材质：${category.label} / ${values.leafKeys.map((key) => category.leaves.find((item) => item.key === key)?.label).filter(Boolean).join(" + ")}。` : "目标材质：未指定。",
        textures.length ? `面料质感要求：${textures.join("；")}。` : "",
        "必须保留：廓形与版型、领型、袖型与袖长、衣长、肩线与腰线位置、门襟与车缝走向、纽扣/拉链/口袋/印花与 logo 的位置和比例；不得改款、不得新增装饰、不得改变穿着姿态。",
        "替换要求：仅在面料区域生成符合上述质感的新材质，褶皱、垂坠与光影随新面料自然变化，边缘干净贴合原有轮廓，接缝处不出现错位。",
        values.isMatting
            ? "输入说明：已按上装蒙版抠图（透明背景），请在抠出的上装区域内换料，不得补画背景或下装；输出保持透明背景或纯色中性背景。"
            : "输入说明：原图为完整商品图，请在保留人物/背景关系的前提下只改上装面料。",
        "画面要求：电商产品图质感，主体完整入画，不裁切关键细节，不新增水印或文字。",
        capability?.modelReady === false ? "（模型尚未配置，本条仅作预览，无法提交）" : "",
    ];
    return lines.filter(Boolean).join("\n");
}

/** 提交按钮旁的产物说明（不显示任何算力/积分文案）。 */
export function computeMaterialOutput(values: MaterialValues, capability?: MaterialCapability): { expected: number; label: string } {
    const expected = Math.max(1, Math.min(capability?.maxOutput ?? MATERIAL_MAX_OUTPUT, Math.floor(values.outputNum) || 1));
    return { expected, label: `本次将生成 ${expected} 张换料结果` };
}
