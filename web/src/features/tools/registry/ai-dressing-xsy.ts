/**
 * TASK-034：AI_DRESSING_XSY（AI试衣XSY）—— 分步试衣的字段契约、步骤推进、校验、快照与字段合成。
 *
 * 事实边界（勿误读）：
 * - 本文件是纯逻辑：不联网、不读写存储、不伪造成片；调用 provider 的只有 adapter。
 * - 17 个字段名逐字来自页面字段契约（27-ai-dressing-xsy.md §7 + gateway.ts 的 AI_DRESSING_XSY 行），
 *   不允许改名、增删。
 * - 本页与 AI 穿衣（AI_DRESSING_V2）的差别是「分步」：模特 → 服装 → 蒙版/姿势 → 生成，
 *   步骤由每步真实校验推进（`step` 字段即当前步骤），不是装饰性进度条。
 * - 上游改动后下游草稿保留但标为「需重确认」（`staleSteps`），不会被当前配置冒充成已完成。
 * - 未知 provider / 未知版本一律判不可执行，禁止自由拼接取值。
 */
import {
    MASK_COVERAGE_GRID,
    MASK_BRUSH_DEFAULT,
    computeMaskHash,
    computeSnapshotHash,
    createMaskState,
    maskCoverage,
    maskIsEmpty,
    rasterizeMask,
    type MaskState,
    type MaskStroke,
} from "./area-repair";

export const AI_DRESSING_XSY_TOOL_ID = "AI_DRESSING_XSY";
export const AI_DRESSING_XSY_SLUG = "ai-dressing-xsy";
export const AI_DRESSING_XSY_ROUTE = "/tools/product-design/ai-dressing-xsy";
export const AI_DRESSING_XSY_LAYOUT = "dress";
export const AI_DRESSING_XSY_TITLE = "AI试衣XSY";

/** 草稿槽位：与 tool-draft:v1:AI_DRESSING_XSY 一起保存，刷新可还原。 */
export const XSY_DRAFT_SLOT = "xsy";

/** 17 个字段严格按字段契约排列（字段名即提交键）。 */
export const AI_DRESSING_XSY_FIELD_KEYS = [
    "downImageUrl",
    "downMaskUrl",
    "downOriginUrl",
    "modelImageUrl",
    "modelPose",
    "modelStyle",
    "modelType",
    "outputNum",
    "provider",
    "step",
    "suitImageUrl",
    "suitMaskUrl",
    "suitOriginUrl",
    "upperImageUrl",
    "upperMaskUrl",
    "upperOriginUrl",
    "version",
] as const;

export type XsyFieldKey = (typeof AI_DRESSING_XSY_FIELD_KEYS)[number];

/* ------------------------------------------------------------------ *
 * 步骤（页面 §3：step 驱动「模特→服装→蒙版/姿势→生成」）
 * ------------------------------------------------------------------ */

export const XSY_STEPS = [
    { id: 1 as const, key: "model", label: "模特", hint: "上传模特图，选定模特类型与风格" },
    { id: 2 as const, key: "garment", label: "服装", hint: "选择上下装或连体，并上传服装图" },
    { id: 3 as const, key: "mask", label: "蒙版/姿势", hint: "逐个槽位标记穿衣区域并确认姿势" },
    { id: 4 as const, key: "generate", label: "生成", hint: "确认快照与张数后生成试穿结果" },
] as const;

export type XsyStepId = (typeof XSY_STEPS)[number]["id"];
export type XsyStepKey = (typeof XSY_STEPS)[number]["key"];

export function xsyStepMeta(step: XsyStepId) {
    return XSY_STEPS.find((item) => item.id === step) ?? XSY_STEPS[0];
}

export function clampXsyStep(value: unknown): XsyStepId {
    const numeric = Math.round(Number(value));
    if (!Number.isFinite(numeric)) return 1;
    if (numeric <= 1) return 1;
    if (numeric >= 4) return 4;
    return numeric as XsyStepId;
}

/* ------------------------------------------------------------------ *
 * Tab / 槽位
 * ------------------------------------------------------------------ */

/** 两个 Tab 的真实语义（与 AI 穿衣一致）：上下装用 upper+down，连体用 suit。 */
export const XSY_TABS = [
    { id: "upper-lower" as const, label: "上下装衣服", slots: ["upper", "down"] as const },
    { id: "suit" as const, label: "连体衣服", slots: ["suit"] as const },
] as const;

export type XsyTab = (typeof XSY_TABS)[number]["id"];

export function xsyTabMeta(tab: XsyTab) {
    return XSY_TABS.find((item) => item.id === tab) ?? XSY_TABS[0];
}

export function xsyTabSlots(tab: XsyTab): GarmentSlotKey[] {
    return tab === "suit" ? ["suit"] : ["upper", "down"];
}

export const XSY_SLOTS = [
    {
        id: "upper" as const,
        label: "上装",
        uploadHint: "上传上装正面图，平铺或穿着实拍均可",
        imageKey: "upperImageUrl",
        maskKey: "upperMaskUrl",
        originKey: "upperOriginUrl",
    },
    {
        id: "down" as const,
        label: "下装",
        uploadHint: "上传下装正面图，裤装/裙装均可",
        imageKey: "downImageUrl",
        maskKey: "downMaskUrl",
        originKey: "downOriginUrl",
    },
    {
        id: "suit" as const,
        label: "套装",
        uploadHint: "上传连体衣/套装正面图（连体模式下只看这一件）",
        imageKey: "suitImageUrl",
        maskKey: "suitMaskUrl",
        originKey: "suitOriginUrl",
    },
] as const;

export type GarmentSlotKey = (typeof XSY_SLOTS)[number]["id"];

export function xsySlotMeta(slot: GarmentSlotKey) {
    return XSY_SLOTS.find((item) => item.id === slot) ?? XSY_SLOTS[0];
}

/* ------------------------------------------------------------------ *
 * 页面可见选项（本地预设，非原站实测文案）
 * ------------------------------------------------------------------ */

/** 模特类型：选择器只接受这里的 key，未知值判不可执行。 */
export const XSY_MODEL_TYPES = [
    { id: "studio", label: "棚拍模特", hint: "纯色背景，适合商品主图" },
    { id: "street", label: "街拍模特", hint: "外景光线，适合社媒素材" },
    { id: "custom", label: "自定义模特", hint: "使用自己上传的模特图，不再补充生成" },
] as const;

export type XsyModelType = (typeof XSY_MODEL_TYPES)[number]["id"];

/** 模特风格卡片：选择后写进 modelStyle 字段，并参与提示词。 */
export const XSY_MODEL_STYLES = [
    { id: "clean", label: "干净通勤", hint: "克制姿态、干净光影，突出服装版型" },
    { id: "editorial", label: "杂志大片", hint: "强对比光影，适合品牌视觉" },
    { id: "casual", label: "日常休闲", hint: "自然站姿，贴近真实穿着" },
    { id: "sport", label: "运动机能", hint: "动势姿态，适合运动品类" },
] as const;

export type XsyModelStyle = (typeof XSY_MODEL_STYLES)[number]["id"];

/** 模特姿势：写进 modelPose 字段。 */
export const XSY_MODEL_POSES = [
    { id: "front", label: "正面站立", hint: "全身正面，服装细节最完整" },
    { id: "three-quarter", label: "侧身 3/4", hint: "略带侧身，层次更自然" },
    { id: "walking", label: "行走动势", hint: "有动感，适合外套/长裙" },
    { id: "sitting", label: "坐姿", hint: "坐姿展示，适合下装与鞋履" },
] as const;

export type XsyModelPose = (typeof XSY_MODEL_POSES)[number]["id"];

/** 算法/修复版本：切换只重算当前预览，不删除历史结果。 */
export const XSY_VERSIONS = [
    { id: "v1", label: "标准试衣 v1", hint: "贴合优先，适合平铺服装图" },
    { id: "v2", label: "细节修复 v2", hint: "纹理与边缘修复优先，适合复杂图案" },
] as const;

export type XsyVersion = (typeof XSY_VERSIONS)[number]["id"];

export const XSY_OUTPUT_OPTIONS = [1, 2, 3, 4] as const;
export const XSY_DEFAULT_OUTPUT = 1;

/** 与同族试衣页面一致的素材约束（XSY 原站未给数值，按 ToolSpec provider 约束执行）。 */
export const XSY_UPLOAD_LIMITS = {
    mimeTypes: ["image/png", "image/jpeg", "image/webp"] as const,
    maxBytes: 10 * 1024 * 1024,
    minSide: 384,
    maxSide: 4096,
    label: "10M以内，384*384 ~ 4096*4096",
} as const;

export function xsyModelTypeOf(id: string) {
    return XSY_MODEL_TYPES.find((item) => item.id === id);
}
export function xsyStyleOf(id: string) {
    return XSY_MODEL_STYLES.find((item) => item.id === id);
}
export function xsyPoseOf(id: string) {
    return XSY_MODEL_POSES.find((item) => item.id === id);
}
export function xsyVersionOf(id: string) {
    return XSY_VERSIONS.find((item) => item.id === id);
}

/* ------------------------------------------------------------------ *
 * 值
 * ------------------------------------------------------------------ */

export type XsyGarment = {
    slot: GarmentSlotKey;
    assetId: string;
    name: string;
    imageUrl: string;
    width: number;
    height: number;
    mask: MaskState;
};

export type XsyModelImage = {
    assetId: string;
    name: string;
    imageUrl: string;
    width: number;
    height: number;
};

export type XsyValues = {
    /** 当前步骤（页面 `step` 字段 = 这个值）。 */
    step: XsyStepId;
    /** 已走过但上游被改动、需要重确认的步骤。 */
    staleSteps: XsyStepId[];
    activeTab: XsyTab;
    model: XsyModelImage;
    modelType: XsyModelType;
    modelStyle: XsyModelStyle;
    modelPose: XsyModelPose;
    garments: Record<GarmentSlotKey, XsyGarment>;
    outputNum: number;
    /** 页面上的 provider 覆盖值；空串 = 跟随当前模型配置。 */
    provider: string;
    version: XsyVersion;
};

const numberOr = (value: unknown, fallback: number) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
};
const stringOr = (value: unknown) => (typeof value === "string" ? value : "");

export function createXsyGarment(slot: GarmentSlotKey): XsyGarment {
    return {
        slot,
        assetId: "",
        name: "",
        imageUrl: "",
        width: 0,
        height: 0,
        mask: createMaskState({ brushSize: MASK_BRUSH_DEFAULT }),
    };
}

export function createXsyValues(): XsyValues {
    return {
        step: 1,
        staleSteps: [],
        activeTab: "upper-lower",
        model: { assetId: "", name: "", imageUrl: "", width: 0, height: 0 },
        modelType: "studio",
        modelStyle: "clean",
        modelPose: "front",
        garments: {
            upper: createXsyGarment("upper"),
            down: createXsyGarment("down"),
            suit: createXsyGarment("suit"),
        },
        outputNum: XSY_DEFAULT_OUTPUT,
        provider: "",
        version: "v1",
    };
}

/** 空槽位（清字段时用）：保留 mask 控件默认值，不保留旧笔画。 */
export function resetXsyGarment(slot: GarmentSlotKey): XsyGarment {
    return createXsyGarment(slot);
}

function normalizeMask(raw: unknown): MaskState {
    const record = (raw ?? {}) as Partial<MaskState>;
    const strokes = Array.isArray(record.strokes)
        ? (record.strokes as MaskStroke[]).filter((stroke) => stroke && Array.isArray(stroke.points))
        : [];
    const overrides: Partial<MaskState> = {
        strokes,
        tool: record.tool === "eraser" ? "eraser" : "brush",
        brushSize: numberOr(record.brushSize, MASK_BRUSH_DEFAULT),
        feather: numberOr(record.feather, 0),
        inverted: Boolean(record.inverted),
        autoExpand: Boolean(record.autoExpand),
    };
    return createMaskState(overrides);
}

function normalizeGarment(raw: unknown, slot: GarmentSlotKey): XsyGarment {
    const record = (raw ?? {}) as Partial<XsyGarment>;
    return {
        slot,
        assetId: stringOr(record.assetId),
        name: stringOr(record.name),
        imageUrl: stringOr(record.imageUrl),
        width: numberOr(record.width, 0),
        height: numberOr(record.height, 0),
        mask: normalizeMask(record.mask),
    };
}

/** 草稿 → 值：任何脏数据都收敛到合法值，不抛出（刷新恢复不能炸页面）。 */
export function normalizeXsyValues(raw: unknown): XsyValues {
    const record = (raw ?? {}) as Record<string, unknown>;
    const garmentsRaw = (record.garments ?? {}) as Record<string, unknown>;
    const modelRaw = (record.model ?? {}) as Record<string, unknown>;
    const staleSteps = Array.isArray(record.staleSteps)
        ? (record.staleSteps as unknown[]).map(clampXsyStep).filter((step, index, list) => list.indexOf(step) === index)
        : [];
    const outputNum = numberOr(record.outputNum, XSY_DEFAULT_OUTPUT);
    return {
        step: clampXsyStep(record.step),
        staleSteps,
        activeTab: record.activeTab === "suit" ? "suit" : "upper-lower",
        model: {
            assetId: stringOr(modelRaw.assetId),
            name: stringOr(modelRaw.name),
            imageUrl: stringOr(modelRaw.imageUrl),
            width: numberOr(modelRaw.width, 0),
            height: numberOr(modelRaw.height, 0),
        },
        modelType: (xsyModelTypeOf(stringOr(record.modelType))?.id ?? "studio") as XsyModelType,
        modelStyle: (xsyStyleOf(stringOr(record.modelStyle))?.id ?? "clean") as XsyModelStyle,
        modelPose: (xsyPoseOf(stringOr(record.modelPose))?.id ?? "front") as XsyModelPose,
        garments: {
            upper: normalizeGarment(garmentsRaw.upper, "upper"),
            down: normalizeGarment(garmentsRaw.down, "down"),
            suit: normalizeGarment(garmentsRaw.suit, "suit"),
        },
        outputNum: Math.min(XSY_OUTPUT_OPTIONS[XSY_OUTPUT_OPTIONS.length - 1]!, Math.max(1, Math.round(outputNum))),
        provider: stringOr(record.provider),
        version: (xsyVersionOf(stringOr(record.version))?.id ?? "v1") as XsyVersion,
    };
}

/** 值 → 草稿：蒙版笔画一起序列化，刷新后编辑器状态可还原。 */
export function serializeXsyValues(values: XsyValues): Record<string, unknown> {
    return {
        step: values.step,
        staleSteps: [...values.staleSteps],
        activeTab: values.activeTab,
        model: { ...values.model },
        modelType: values.modelType,
        modelStyle: values.modelStyle,
        modelPose: values.modelPose,
        garments: {
            upper: { ...values.garments.upper, mask: { ...values.garments.upper.mask } },
            down: { ...values.garments.down, mask: { ...values.garments.down.mask } },
            suit: { ...values.garments.suit, mask: { ...values.garments.suit.mask } },
        },
        outputNum: values.outputNum,
        provider: values.provider,
        version: values.version,
    };
}

/* ------------------------------------------------------------------ *
 * 蒙版
 * ------------------------------------------------------------------ */

export function xsyMaskCoverage(garment: Pick<XsyGarment, "mask">): number {
    return maskCoverage(garment.mask);
}

export function xsyMaskEmpty(garment: Pick<XsyGarment, "mask">): boolean {
    return maskIsEmpty(garment.mask);
}

export function xsyMaskAlpha(garment: Pick<XsyGarment, "mask" | "width">): Uint8Array {
    const width = Math.max(1, Math.round(garment.width || 1));
    return rasterizeMask(garment.mask.strokes, {
        width: MASK_COVERAGE_GRID,
        height: MASK_COVERAGE_GRID,
        pixelScale: MASK_COVERAGE_GRID / width,
        inverted: garment.mask.inverted,
        autoExpandPx: garment.mask.autoExpand ? 6 : 0,
    });
}

/** 「整件」：一笔覆盖全图的蒙版，避免让用户手工涂满（覆盖率来自真实栅格化）。 */
export function fillXsyMask(garment: XsyGarment, id: string): XsyGarment {
    const size = Math.max(1, Math.round(garment.width || 1024));
    return {
        ...garment,
        mask: {
            ...garment.mask,
            tool: "brush",
            strokes: [
                {
                    id,
                    tool: "brush",
                    size,
                    points: [
                        { x: 0.5, y: 0 },
                        { x: 0.5, y: 1 },
                    ],
                },
            ],
        },
    };
}

export function clearXsyMask(garment: XsyGarment): XsyGarment {
    return { ...garment, mask: { ...garment.mask, strokes: [] } };
}

/* ------------------------------------------------------------------ *
 * 能力（provider / 版本）
 * ------------------------------------------------------------------ */

export type XsyToolDescriptor = {
    kind?: string | null;
    executable?: boolean;
    fields?: readonly string[];
};

export type XsyCapability = {
    /** 已配置可用的图片模型（workspace 解析后传入）。 */
    modelReady: boolean;
    /** 实际生效的 provider（空串 = 没有解析到）。 */
    provider: string;
    providerSupported: boolean;
    versionSupported: boolean;
    executable: boolean;
    outputMax: number;
    /** 阻断原因（可执行时为空串）。 */
    blockedReason: string;
};

export function resolveXsyCapability(input: {
    modelId?: string;
    provider?: string;
    version?: string;
    descriptor?: XsyToolDescriptor;
}): XsyCapability {
    const provider = (input.provider ?? "").trim();
    const version = input.version ?? "";
    const modelReady = Boolean((input.modelId ?? "").trim());
    const versionSupported = Boolean(xsyVersionOf(version));
    const executable = input.descriptor?.executable !== false && (input.descriptor?.kind ?? "image") === "image";
    const outputMax = XSY_OUTPUT_OPTIONS[XSY_OUTPUT_OPTIONS.length - 1]!;
    const reasons: string[] = [];
    if (!modelReady) reasons.push("还没有选择可用的图片模型");
    if (!provider) reasons.push("模型没有解析到 provider，无法提交");
    if (!versionSupported) reasons.push(`未登记的算法版本「${version}」，不能提交`);
    if (!executable) reasons.push("该工具在当前网关没有可执行适配");
    return {
        modelReady,
        provider,
        providerSupported: provider.length > 0,
        versionSupported,
        executable,
        outputMax,
        blockedReason: reasons.join("；"),
    };
}

/* ------------------------------------------------------------------ *
 * 校验
 * ------------------------------------------------------------------ */

export type XsyIssueCode =
    | "model-missing"
    | "model-size-unknown"
    | "model-type-unknown"
    | "style-unknown"
    | "pose-unknown"
    | "garment-missing"
    | "garment-size-unknown"
    | "mask-empty"
    | "mask-too-small"
    | "output-invalid"
    | "provider-missing"
    | "version-unknown";

export type XsyIssue = {
    code: XsyIssueCode;
    level: "error" | "warning";
    step: XsyStepId;
    field: XsyFieldKey | "modelImage" | "garments";
    message: string;
};

/** 该槽位是否参与本次生成（Tab 决定）。 */
export function xsySlotActive(values: Pick<XsyValues, "activeTab">, slot: GarmentSlotKey): boolean {
    return xsyTabSlots(values.activeTab).includes(slot);
}

function modelIssues(values: XsyValues): XsyIssue[] {
    const issues: XsyIssue[] = [];
    if (!values.model.imageUrl.trim()) {
        issues.push({ code: "model-missing", level: "error", step: 1, field: "modelImageUrl", message: "请先上传模特图（第 1 步）" });
    } else if (!values.model.width || !values.model.height) {
        issues.push({ code: "model-size-unknown", level: "error", step: 1, field: "modelImageUrl", message: "模特图缺少尺寸，请重新上传" });
    }
    if (!xsyModelTypeOf(values.modelType)) {
        issues.push({ code: "model-type-unknown", level: "error", step: 1, field: "modelType", message: "模特类型不在可选目录内" });
    }
    if (!xsyStyleOf(values.modelStyle)) {
        issues.push({ code: "style-unknown", level: "error", step: 1, field: "modelStyle", message: "模特风格不在可选目录内" });
    }
    return issues;
}

function garmentIssues(values: XsyValues): XsyIssue[] {
    const issues: XsyIssue[] = [];
    for (const slot of xsyTabSlots(values.activeTab)) {
        const meta = xsySlotMeta(slot);
        const garment = values.garments[slot];
        if (!garment.imageUrl.trim()) {
            issues.push({ code: "garment-missing", level: "error", step: 2, field: meta.imageKey, message: `请上传${meta.label}图（第 2 步）` });
            continue;
        }
        if (!garment.width || !garment.height) {
            issues.push({ code: "garment-size-unknown", level: "error", step: 2, field: meta.imageKey, message: `${meta.label}缺少尺寸，请重新上传` });
        }
    }
    return issues;
}

function maskIssues(values: XsyValues): XsyIssue[] {
    const issues: XsyIssue[] = [];
    for (const slot of xsyTabSlots(values.activeTab)) {
        const meta = xsySlotMeta(slot);
        const garment = values.garments[slot];
        if (!garment.imageUrl.trim()) continue;
        if (xsyMaskEmpty(garment)) {
            issues.push({ code: "mask-empty", level: "error", step: 3, field: meta.maskKey, message: `${meta.label}还没有标记穿衣区域：请涂抹或点「整件」` });
            continue;
        }
        if (xsyMaskCoverage(garment) < 0.002) {
            issues.push({ code: "mask-too-small", level: "warning", step: 3, field: meta.maskKey, message: `${meta.label}蒙版覆盖过小，结果可能只改动局部` });
        }
    }
    if (!xsyPoseOf(values.modelPose)) {
        issues.push({ code: "pose-unknown", level: "error", step: 3, field: "modelPose", message: "模特姿势不在可选目录内" });
    }
    return issues;
}

function submitIssues(values: XsyValues, capability: XsyCapability): XsyIssue[] {
    const issues: XsyIssue[] = [];
    if (!capability.modelReady || !capability.providerSupported) {
        issues.push({ code: "provider-missing", level: "error", step: 4, field: "provider", message: capability.blockedReason || "没有可用的图片模型" });
    }
    if (!capability.versionSupported) {
        issues.push({ code: "version-unknown", level: "error", step: 4, field: "version", message: `未登记的算法版本「${values.version}」` });
    }
    if (!XSY_OUTPUT_OPTIONS.includes(values.outputNum as (typeof XSY_OUTPUT_OPTIONS)[number])) {
        issues.push({
            code: "output-invalid",
            level: "error",
            step: 4,
            field: "outputNum",
            message: `生成张数需为 ${XSY_OUTPUT_OPTIONS.join("/")}，当前 ${values.outputNum}`,
        });
    }
    return issues;
}

/** 单步校验：步骤推进和提交前自检共用同一份规则。 */
export function validateXsyStep(values: XsyValues, step: XsyStepId, capability: XsyCapability): XsyIssue[] {
    if (step === 1) return modelIssues(values);
    if (step === 2) return garmentIssues(values);
    if (step === 3) return maskIssues(values);
    return submitIssues(values, capability);
}

export function validateXsy(values: XsyValues, capability: XsyCapability): XsyIssue[] {
    return XSY_STEPS.flatMap((step) => validateXsyStep(values, step.id, capability));
}

export function xsyErrors(issues: XsyIssue[]): XsyIssue[] {
    return issues.filter((issue) => issue.level === "error");
}

export function firstXsyError(issues: XsyIssue[]): XsyIssue | undefined {
    return issues.find((issue) => issue.level === "error");
}

/* ------------------------------------------------------------------ *
 * 步骤状态与推进
 * ------------------------------------------------------------------ */

export type XsyStepStatus = "done" | "stale" | "active" | "pending";

export type XsyStepState = {
    step: XsyStepId;
    key: XsyStepKey;
    label: string;
    hint: string;
    status: XsyStepStatus;
    /** 该步的阻断错误数（warning 不计）。 */
    errors: number;
    /** 访问该步是否被前序步骤拦住。 */
    locked: boolean;
};

/**
 * 步骤条状态：done = 该步无阻断错误；stale = 上游改过、需要重确认；active = 当前步；
 * 其余 pending。locked 表示前序步骤还有错，不能跳过去。
 */
export function xsyStepStates(values: XsyValues, capability: XsyCapability): XsyStepState[] {
    return XSY_STEPS.map((step) => {
        const errors = xsyErrors(validateXsyStep(values, step.id, capability)).length;
        const earlierBlocked = XSY_STEPS.some(
            (earlier) => earlier.id < step.id && xsyErrors(validateXsyStep(values, earlier.id, capability)).length > 0,
        );
        const stale = values.staleSteps.includes(step.id);
        // 当前所在的步永远是 active（哪怕它有错要修）；其他步有错才是 pending。
        const status: XsyStepStatus =
            values.step === step.id ? "active" : errors > 0 ? "pending" : stale ? "stale" : "done";
        return {
            step: step.id,
            key: step.key,
            label: step.label,
            hint: step.hint,
            errors,
            locked: earlierBlocked,
            status,
        };
    });
}

export function xsyProgressLabel(values: XsyValues, capability: XsyCapability): string {
    const states = xsyStepStates(values, capability);
    const done = states.filter((state) => state.status === "done" || state.status === "active").length;
    const stale = states.filter((state) => state.status === "stale").length;
    const base = `${done}/${states.length} 步就绪`;
    return stale > 0 ? `${base} · ${stale} 步需重确认` : base;
}

/** 上游改动：下游步骤保留草稿但标为需重确认（页面 §3 联动基线）。 */
export function markXsyStepsStale(values: XsyValues, fromStep: XsyStepId): XsyValues {
    const next = new Set<XsyStepId>(values.staleSteps);
    for (const step of XSY_STEPS) if (step.id > fromStep) next.add(step.id);
    return { ...values, staleSteps: Array.from(next).sort() as XsyStepId[] };
}

/** 访问某步 = 重新确认该步（清掉它的 stale 标记，规则不因此放宽）。 */
export function revisitXsyStep(values: XsyValues, step: XsyStepId): XsyValues {
    return { ...values, step, staleSteps: values.staleSteps.filter((item) => item !== step) };
}

export type XsyAdvanceResult = { ok: true; values: XsyValues } | { ok: false; issues: XsyIssue[] };

/** 前进一步：当前步有阻断错误就原地不动，并回传字段级原因。 */
export function advanceXsyStep(values: XsyValues, capability: XsyCapability): XsyAdvanceResult {
    const issues = xsyErrors(validateXsyStep(values, values.step, capability));
    if (issues.length > 0) return { ok: false, issues };
    const nextStep = Math.min(4, values.step + 1) as XsyStepId;
    return { ok: true, values: revisitXsyStep(values, nextStep) };
}

/** 编辑某一层的值：只标下游 stale，不删除下游草稿。 */
export function applyXsyEdit(values: XsyValues, patch: Partial<XsyValues>, changedStep: XsyStepId): XsyValues {
    const merged = normalizeXsyValues({ ...serializeXsyValues(values), ...patch });
    return markXsyStepsStale(merged, changedStep);
}

/**
 * 切换上下装/连体：清掉另一个 Tab 的冲突槽位字段（图片、尺寸、蒙版一起清），
 * 并把服装之后的步骤标为需重确认。
 */
export function switchXsyTab(values: XsyValues, tab: XsyTab): XsyValues {
    if (tab === values.activeTab) return values;
    const next: XsyValues = { ...values, activeTab: tab, garments: { ...values.garments } };
    if (tab === "suit") {
        next.garments.upper = resetXsyGarment("upper");
        next.garments.down = resetXsyGarment("down");
    } else {
        next.garments.suit = resetXsyGarment("suit");
    }
    return markXsyStepsStale({ ...next, step: values.step < 2 ? 2 : values.step }, 2);
}

/* ------------------------------------------------------------------ *
 * 快照
 * ------------------------------------------------------------------ */

export type XsySnapshotGarment = {
    slot: GarmentSlotKey;
    assetId: string;
    name: string;
    imageUrl: string;
    originUrl: string;
    maskUrl: string;
    maskHash: string;
    maskCoverage: number;
    width: number;
    height: number;
};

export type XsySnapshot = {
    toolId: typeof AI_DRESSING_XSY_TOOL_ID;
    tab: XsyTab;
    step: XsyStepId;
    modelImageUrl: string;
    modelAssetId: string;
    modelStyle: string;
    modelPose: string;
    modelType: string;
    version: string;
    provider: string;
    outputNum: number;
    garments: XsySnapshotGarment[];
};

/**
 * 快照：提交即锁定，之后改配置只影响下一稿。
 * `maskUrl` 由 adapter 在真实导出蒙版后回填（本函数不造假 URL）。
 */
export function buildXsySnapshot(values: XsyValues, options: { provider?: string } = {}): XsySnapshot {
    return {
        toolId: AI_DRESSING_XSY_TOOL_ID,
        tab: values.activeTab,
        step: values.step,
        modelImageUrl: values.model.imageUrl,
        modelAssetId: values.model.assetId,
        modelStyle: values.modelStyle,
        modelPose: values.modelPose,
        modelType: values.modelType,
        version: values.version,
        provider: options.provider ?? values.provider,
        outputNum: values.outputNum,
        garments: xsyTabSlots(values.activeTab).map((slot) => {
            const garment = values.garments[slot];
            return {
                slot,
                assetId: garment.assetId,
                name: garment.name,
                imageUrl: garment.imageUrl,
                originUrl: garment.imageUrl,
                maskUrl: "",
                maskHash: computeMaskHash(garment.mask),
                maskCoverage: Number(xsyMaskCoverage(garment).toFixed(4)),
                width: garment.width,
                height: garment.height,
            };
        }),
    };
}

export function xsySnapshotHash(snapshot: XsySnapshot): string {
    return computeSnapshotHash({
        toolId: snapshot.toolId,
        tab: snapshot.tab,
        model: snapshot.modelImageUrl,
        style: snapshot.modelStyle,
        pose: snapshot.modelPose,
        type: snapshot.modelType,
        version: snapshot.version,
        provider: snapshot.provider,
        outputNum: snapshot.outputNum,
        garments: snapshot.garments.map((garment) => ({
            slot: garment.slot,
            image: garment.imageUrl,
            mask: garment.maskHash,
            maskUrl: garment.maskUrl,
        })),
    });
}

/** 结果标签：刷新后据此判断「这条结果属于哪份快照」。 */
export function xsyTag(tab: XsyTab, step: XsyStepId): string {
    return `[AI_DRESSING_XSY/tab:${tab}/step:${step}]`;
}

/* ------------------------------------------------------------------ *
 * 字段合成
 * ------------------------------------------------------------------ */

function slotField(snapshot: XsySnapshot, slot: GarmentSlotKey, pick: (garment: XsySnapshotGarment) => string): string {
    const garment = snapshot.garments.find((item) => item.slot === slot);
    return garment ? pick(garment) : "";
}

/** 17 个字段一次性合成：未参与本 Tab 的槽位按契约给空串（由 adapter 判缺失）。 */
export function composeXsyFields(snapshot: XsySnapshot): Record<XsyFieldKey, unknown> {
    return {
        downImageUrl: slotField(snapshot, "down", (garment) => garment.imageUrl),
        downMaskUrl: slotField(snapshot, "down", (garment) => garment.maskUrl),
        downOriginUrl: slotField(snapshot, "down", (garment) => garment.originUrl),
        modelImageUrl: snapshot.modelImageUrl,
        modelPose: snapshot.modelPose,
        modelStyle: snapshot.modelStyle,
        modelType: snapshot.modelType,
        outputNum: snapshot.outputNum,
        provider: snapshot.provider,
        step: snapshot.step,
        suitImageUrl: slotField(snapshot, "suit", (garment) => garment.imageUrl),
        suitMaskUrl: slotField(snapshot, "suit", (garment) => garment.maskUrl),
        suitOriginUrl: slotField(snapshot, "suit", (garment) => garment.originUrl),
        upperImageUrl: slotField(snapshot, "upper", (garment) => garment.imageUrl),
        upperMaskUrl: slotField(snapshot, "upper", (garment) => garment.maskUrl),
        upperOriginUrl: slotField(snapshot, "upper", (garment) => garment.originUrl),
        version: snapshot.version,
    };
}

/** 提交前自检：只检查参与本 Tab 的槽位，未参与的空串不算缺失。 */
export function xsyMissingFields(snapshot: XsySnapshot): XsyFieldKey[] {
    const missing: XsyFieldKey[] = [];
    if (!snapshot.modelImageUrl.trim()) missing.push("modelImageUrl");
    if (!String(snapshot.modelStyle).trim()) missing.push("modelStyle");
    if (!String(snapshot.modelPose).trim()) missing.push("modelPose");
    if (!String(snapshot.modelType).trim()) missing.push("modelType");
    if (!String(snapshot.version).trim()) missing.push("version");
    for (const garment of snapshot.garments) {
        const meta = xsySlotMeta(garment.slot);
        if (!garment.imageUrl.trim()) missing.push(meta.imageKey);
        if (!garment.maskUrl.trim()) missing.push(meta.maskKey);
        if (!garment.originUrl.trim()) missing.push(meta.originKey);
    }
    return missing;
}

/* ------------------------------------------------------------------ *
 * 提示词与产物预估
 * ------------------------------------------------------------------ */

export function buildXsyPrompt(snapshot: XsySnapshot): string {
    const style = xsyStyleOf(snapshot.modelStyle);
    const pose = xsyPoseOf(snapshot.modelPose);
    const type = xsyModelTypeOf(snapshot.modelType);
    const version = xsyVersionOf(snapshot.version);
    const garments = snapshot.garments
        .filter((garment) => garment.imageUrl.trim())
        .map((garment) => {
            const meta = xsySlotMeta(garment.slot);
            return `${meta.label}（${garment.width || "?"}×${garment.height || "?"}，蒙版 ${(garment.maskCoverage * 100).toFixed(1)}%）`;
        });
    return [
        "按分步试衣流程生成试穿效果：",
        `模特图 ${snapshot.modelImageUrl ? "已提供" : "缺失"}；模特类型 ${type?.label ?? snapshot.modelType}；风格 ${style?.label ?? snapshot.modelStyle}；姿势 ${pose?.label ?? snapshot.modelPose}。`,
        `服装：${garments.length > 0 ? garments.join("、") : "未提供"}。`,
        "每个服装槽位附一张同尺寸蒙版（白=该部位穿戴区域），只在蒙版区域替换为上传服装，保持模特身份、姿态、光照与画面构图不变；",
        "服装纹理、褶皱与版型需与上传图一致，不要新增图案或改变颜色。",
        `算法版本 ${version?.label ?? snapshot.version}；输出 ${snapshot.outputNum} 张。`,
        xsyTag(snapshot.tab, snapshot.step),
    ].join("");
}

export type XsyEstimate = {
    count: number;
    label: string;
    /** 需要提交的参考图数量：模特 1 + 服装 n + 蒙版 n。 */
    referenceCount: number;
};

export function xsyEstimate(values: XsyValues): XsyEstimate {
    const garments = xsyTabSlots(values.activeTab).filter((slot) => values.garments[slot].imageUrl.trim());
    const count = Math.min(XSY_OUTPUT_OPTIONS[XSY_OUTPUT_OPTIONS.length - 1]!, Math.max(1, Math.round(values.outputNum) || 1));
    return {
        count,
        label: `${xsyTabMeta(values.activeTab).label} · 预计输出 ${count} 张`,
        referenceCount: 1 + garments.length * 2,
    };
}
