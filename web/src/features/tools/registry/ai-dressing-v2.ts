/**
 * TASK-026：AI_DRESSING_V2（AI 穿衣）—— 字段契约、Tab 语义、校验、快照与字段合成。
 *
 * 事实边界（勿误读）：
 * - 本文件是纯逻辑：不联网、不读写存储、不伪造成片；调用 provider 的只有 adapter。
 * - 20 个字段名逐字来自页面证据（AI_DRESSING_V2.json 的字段契约），不允许改名或省略；
 * - 两个 Tab 的真实语义：`上下装衣服` 用 upper 与 down 槽位，`连体衣服` 用 suit 槽位；
 *   切 Tab 只改变「参与生成」的服装槽位，另一 Tab 的草稿不丢（回归测试覆盖）；
 * - 蒙版不是装饰：每个服装槽位的 mask 必须真实涂抹（或点「整件」）才能提交，
 *   栅格覆盖率为 0 一律判未标记（与 area-repair 的 maskIsEmpty 同源实现）。
 */
import { getToolById } from "./index";
import {
    MASK_COVERAGE_GRID,
    computeMaskHash,
    computeSnapshotHash,
    createMaskState,
    maskCoverage,
    maskIsEmpty,
    rasterizeMask,
    type MaskState,
    type MaskStroke,
} from "./area-repair";
import type { ToolSpec } from "../types";

export const AI_DRESSING_V2_TOOL_ID = "AI_DRESSING_V2";
export const AI_DRESSING_V2_SLUG = "ai-dressing-v2";
export const AI_DRESSING_V2_ROUTE = "/tools/product-design/ai-dressing-v2";
export const AI_DRESSING_V2_LAYOUT = "dress";
export const AI_DRESSING_V2_TITLE = "AI穿衣";

/** 20 个字段严格按页面字段契约排列（字段名即提交键）。 */
export const AI_DRESSING_V2_FIELD_KEYS = [
    "coverList",
    "downImageUrl",
    "downMaskUrl",
    "downOriginUrl",
    "genOriRes",
    "images",
    "isSecondOperate",
    "modelPose",
    "modelPoseList",
    "modelType",
    "name",
    "outputNum",
    "provider",
    "suitImageUrl",
    "suitMaskUrl",
    "suitOriginUrl",
    "upperImageUrl",
    "upperMaskUrl",
    "upperOriginUrl",
    "version",
] as const;

export type DressingFieldKey = (typeof AI_DRESSING_V2_FIELD_KEYS)[number];

/* ------------------------------------------------------------------ *
 * 页面可见常量（与证据一致，改动需同步页面证据）
 * ------------------------------------------------------------------ */

/** Tabs：控件证据里的两个 Tab 名。 */
export const DRESSING_TABS = [
    { id: "upper-lower", label: "上下装衣服", slots: ["upper", "down"] as const },
    { id: "suit", label: "连体衣服", slots: ["suit"] as const },
] as const;

export type DressingTab = (typeof DRESSING_TABS)[number]["id"];

/** 服装槽位：每个槽位对应 3 个字段（Image/Mask/Origin）。 */
export const DRESSING_SLOTS = [
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

export type GarmentSlotKey = (typeof DRESSING_SLOTS)[number]["id"];

export function slotMeta(slot: GarmentSlotKey) {
    return DRESSING_SLOTS.find((item) => item.id === slot)!;
}

/** 上传约束：页面写明「10M以内，384*384 ~ 4096*4096」。 */
export const DRESSING_UPLOAD_LIMITS = {
    mimeTypes: ["image/png", "image/jpeg", "image/webp"] as const,
    maxBytes: 10 * 1024 * 1024,
    minSide: 384,
    maxSide: 4096,
    label: "10M以内，384*384 ~ 4096*4096",
} as const;

/** 页面「选择生成张数」1–4；默认 1（不做无证据的默认值推断）。 */
export const DRESSING_OUTPUT_OPTIONS = [1, 2, 3, 4] as const;
export const DRESSING_DEFAULT_OUTPUT = 1;
/** 一次提交的模特参考上限：与生成张数上限一致，避免任务爆炸。 */
export const DRESSING_MAX_POSES = 4;
/** 蒙版覆盖率低于该值视为「几乎没涂」，与 area-repair 的空蒙版判定对齐。 */
export const DRESSING_MIN_MASK_COVERAGE = 0.005;
export const DRESSING_PROMPT_MAX = 900;
export const DRESSING_NAME_MAX = 40;

export const DRESSING_VERSION_OPTIONS = [{ id: "v2", label: "V2（本页）" }] as const;
export const DRESSING_DEFAULT_VERSION = "v2";
/** provider 由用户在页面上选择；空字符串表示「跟随当前配置」，不再臆造具体厂商。 */
export const DRESSING_DEFAULT_PROVIDER = "";
export const DRESSING_MODEL_TYPES = [
    { id: "adult", label: "成人模特" },
    { id: "kid", label: "儿童模特" },
] as const;
export type DressingModelType = (typeof DRESSING_MODEL_TYPES)[number]["id"];
export const DRESSING_DEFAULT_MODEL_TYPE: DressingModelType = "adult";

export function getDressingSpec(): ToolSpec {
    const spec = getToolById(AI_DRESSING_V2_TOOL_ID);
    if (!spec) throw new Error("AI_DRESSING_V2 spec missing from tool registry");
    return spec;
}

/* ------------------------------------------------------------------ *
 * 取值模型
 * ------------------------------------------------------------------ */

export type GarmentDraft = {
    slot: GarmentSlotKey;
    /** 资产库 id（uploadToolAsset 返回）；空串表示用户直接填了 URL。 */
    assetId: string;
    name: string;
    imageUrl: string;
    originUrl: string;
    width: number;
    height: number;
    mask: MaskState;
    /** 蒙版笔画历史（撤销/重做只影响笔画）。 */
    past: MaskStroke[][];
    future: MaskStroke[][];
};

export type ModelPoseDraft = {
    id: string;
    assetId: string;
    name: string;
    imageUrl: string;
    width: number;
    height: number;
};

export type DressingValues = {
    activeTab: DressingTab;
    /** 三个槽位常驻，切 Tab 只决定谁参与提交 —— 另一 Tab 的草稿因此不丢。 */
    garments: Record<GarmentSlotKey, GarmentDraft>;
    poses: ModelPoseDraft[];
    activePoseId: string;
    outputNum: number;
    genOriRes: boolean;
    isSecondOperate: boolean;
    name: string;
    version: string;
    provider: string;
    modelType: DressingModelType;
};

export function createGarment(slot: GarmentSlotKey): GarmentDraft {
    return {
        slot,
        assetId: "",
        name: "",
        imageUrl: "",
        originUrl: "",
        width: 0,
        height: 0,
        mask: createMaskState(),
        past: [],
        future: [],
    };
}

export function createDressingValues(): DressingValues {
    return {
        activeTab: "upper-lower",
        garments: {
            upper: createGarment("upper"),
            down: createGarment("down"),
            suit: createGarment("suit"),
        },
        poses: [],
        activePoseId: "",
        outputNum: DRESSING_DEFAULT_OUTPUT,
        genOriRes: false,
        isSecondOperate: false,
        name: "",
        version: DRESSING_DEFAULT_VERSION,
        provider: DRESSING_DEFAULT_PROVIDER,
        modelType: DRESSING_DEFAULT_MODEL_TYPE,
    };
}

export function normalizeTab(value: unknown): DressingTab {
    return DRESSING_TABS.some((tab) => tab.id === value) ? (value as DressingTab) : "upper-lower";
}

export function normalizeSlot(value: unknown): GarmentSlotKey | null {
    return DRESSING_SLOTS.some((slot) => slot.id === value) ? (value as GarmentSlotKey) : null;
}

export function normalizeOutputNum(value: unknown): number {
    const parsed = Math.round(Number(value));
    return (DRESSING_OUTPUT_OPTIONS as readonly number[]).includes(parsed) ? parsed : DRESSING_DEFAULT_OUTPUT;
}

export function normalizeVersion(value: unknown): string {
    const text = typeof value === "string" ? value.trim() : "";
    return DRESSING_VERSION_OPTIONS.some((option) => option.id === text) ? text : DRESSING_DEFAULT_VERSION;
}

export function normalizeModelType(value: unknown): DressingModelType {
    return DRESSING_MODEL_TYPES.some((item) => item.id === value) ? (value as DressingModelType) : DRESSING_DEFAULT_MODEL_TYPE;
}

/** 该 Tab 真正参与提交的槽位（顺序即参考资料顺序）。 */
export function tabSlots(tab: DressingTab): GarmentSlotKey[] {
    const found = DRESSING_TABS.find((item) => item.id === tab);
    return found ? [...found.slots] : ["upper", "down"];
}

export function tabLabel(tab: DressingTab): string {
    return DRESSING_TABS.find((item) => item.id === tab)?.label ?? tab;
}

/** 已上传（有真实地址）的服装槽位。 */
export function filledSlots(values: DressingValues, tab: DressingTab = values.activeTab): GarmentSlotKey[] {
    return tabSlots(tab).filter((slot) => Boolean(values.garments[slot]?.imageUrl?.trim()));
}

/**
 * 切 Tab：只改 activeTab，三个槽位的草稿原样保留。
 * 这是规格里「未适用 Tab 的字段不参与提交、但草稿不丢」的唯一实现点。
 */
export function switchTab(values: DressingValues, tab: DressingTab): DressingValues {
    if (values.activeTab === tab) return values;
    return { ...values, activeTab: normalizeTab(tab) };
}

export function activePose(values: DressingValues): ModelPoseDraft | undefined {
    return values.poses.find((pose) => pose.id === values.activePoseId) ?? values.poses[0];
}

/* ------------------------------------------------------------------ *
 * 蒙版
 * ------------------------------------------------------------------ */

/** 覆盖率（0–1）：走 area-repair 同源栅格化，按源图像素缩放笔刷。 */
export function garmentMaskCoverage(draft: GarmentDraft): number {
    if (draft.mask.strokes.length === 0) return 0;
    return maskCoverage(draft.mask);
}

export function garmentMaskEmpty(draft: GarmentDraft): boolean {
    if (draft.mask.strokes.length === 0) return true;
    return maskIsEmpty(draft.mask) || garmentMaskCoverage(draft) < DRESSING_MIN_MASK_COVERAGE;
}

/** 「整件」快捷键：一条竖向贯穿的粗笔画，真实覆盖整张图（不是假装涂满）。 */
export function fullCoverStroke(draft: GarmentDraft, id: string): MaskStroke {
    const size = Math.max(1, Math.round(draft.width || 1024));
    return {
        id,
        tool: "brush",
        size,
        points: [
            { x: 0.5, y: 0 },
            { x: 0.5, y: 1 },
        ],
    };
}

export function fillGarmentMask(draft: GarmentDraft, id: string): GarmentDraft {
    const stroke = fullCoverStroke(draft, id);
    return {
        ...draft,
        mask: { ...draft.mask, strokes: [...draft.mask.strokes, stroke] },
        past: [...draft.past, draft.mask.strokes],
        future: [],
    };
}

/** 蒙版覆盖率矩阵（提交前自检用；分辨率与 area-repair 一致）。 */
export function garmentMaskAlpha(draft: GarmentDraft): Uint8Array {
    const width = Math.max(1, Math.round(draft.width || 1));
    return rasterizeMask(draft.mask.strokes, {
        width: MASK_COVERAGE_GRID,
        height: MASK_COVERAGE_GRID,
        pixelScale: MASK_COVERAGE_GRID / width,
        inverted: draft.mask.inverted,
        autoExpandPx: draft.mask.autoExpand ? 6 : 0,
    });
}

export function garmentMaskHash(draft: GarmentDraft): string {
    return computeMaskHash(draft.mask);
}

/* ------------------------------------------------------------------ *
 * 校验
 * ------------------------------------------------------------------ */

export type DressingIssue = {
    code:
        | "garment-missing"
        | "garment-image-missing"
        | "garment-image-invalid"
        | "garment-resolution"
        | "garment-mask-empty"
        | "pose-missing"
        | "pose-limit"
        | "pose-invalid"
        | "output-num-invalid";
    level: "error" | "warning";
    /** 与 UI 的 data-field 对齐：`upper.image` / `upper.mask` / `poses` / `outputNum`。 */
    field: string;
    message: string;
};

export function validateDressing(values: DressingValues): DressingIssue[] {
    const issues: DressingIssue[] = [];
    const slots = tabSlots(values.activeTab);
    const filled = filledSlots(values);

    if (filled.length === 0) {
        issues.push({
            code: "garment-missing",
            level: "error",
            field: "garments",
            message:
                values.activeTab === "suit"
                    ? "连体衣服模式需要先上传套装正面图"
                    : "上下装模式至少要上传上装或下装中的一件正面图",
        });
    }

    for (const slot of slots) {
        const garment = values.garments[slot];
        const meta = slotMeta(slot);
        if (!garment.imageUrl.trim()) continue;
        if (!garment.assetId && !/^(data:|blob:|https?:)/.test(garment.imageUrl)) {
            issues.push({
                code: "garment-image-missing",
                level: "error",
                field: `${slot}.image`,
                message: `${meta.label}图片地址不可读，请重新上传`,
            });
        }
        if (garment.width && garment.height) {
            const side = Math.min(garment.width, garment.height);
            const longest = Math.max(garment.width, garment.height);
            if (side < DRESSING_UPLOAD_LIMITS.minSide || longest > DRESSING_UPLOAD_LIMITS.maxSide) {
                issues.push({
                    code: "garment-resolution",
                    level: "error",
                    field: `${slot}.image`,
                    message: `${meta.label}尺寸 ${garment.width}×${garment.height} 超出 ${DRESSING_UPLOAD_LIMITS.label}`,
                });
            }
        }
        if (garmentMaskEmpty(garment)) {
            issues.push({
                code: "garment-mask-empty",
                level: "error",
                field: `${slot}.mask`,
                message: `${meta.label}还没标记穿衣区域：请涂抹服装部位，或点「整件」`,
            });
        }
    }

    if (values.poses.length === 0) {
        issues.push({ code: "pose-missing", level: "error", field: "poses", message: "请先上传穿衣的模特参考图" });
    }
    if (values.poses.length > DRESSING_MAX_POSES) {
        issues.push({
            code: "pose-limit",
            level: "error",
            field: "poses",
            message: `模特参考最多 ${DRESSING_MAX_POSES} 张，当前 ${values.poses.length} 张`,
        });
    }
    for (const pose of values.poses) {
        if (!pose.imageUrl.trim()) {
            issues.push({ code: "pose-invalid", level: "error", field: "poses", message: `模特参考「${pose.name || pose.id}」没有可用图片` });
        }
    }
    if (activePose(values) === undefined && values.poses.length > 0) {
        issues.push({ code: "pose-invalid", level: "error", field: "poses", message: "请选择一张模特参考作为生成输入" });
    }
    if (!(DRESSING_OUTPUT_OPTIONS as readonly number[]).includes(values.outputNum)) {
        issues.push({
            code: "output-num-invalid",
            level: "error",
            field: "outputNum",
            message: `生成张数只能是 ${DRESSING_OUTPUT_OPTIONS.join("/")}`,
        });
    }

    return issues;
}

export function dressingIssuesByField(issues: DressingIssue[], field: string): DressingIssue[] {
    return issues.filter((issue) => issue.field === field);
}

export function firstDressingError(issues: DressingIssue[]): DressingIssue | undefined {
    return issues.find((issue) => issue.level === "error");
}

/* ------------------------------------------------------------------ *
 * 快照
 * ------------------------------------------------------------------ */

export type DressingGarmentSnapshot = {
    slot: GarmentSlotKey;
    label: string;
    assetId: string;
    name: string;
    imageUrl: string;
    originUrl: string;
    width: number;
    height: number;
    maskCoverage: number;
    maskHash: string;
    strokeCount: number;
};

export type DressingSnapshot = {
    toolId: string;
    tab: DressingTab;
    /** 参与提交的槽位（顺序稳定，作为参考图层序）。 */
    garments: DressingGarmentSnapshot[];
    /** 本次任务的模特参考（modelPose）。 */
    poseId: string;
    poseName: string;
    poseImageUrl: string;
    poseWidth: number;
    poseHeight: number;
    /** 全部模特参考的顺序（modelPoseList）。 */
    poseList: string[];
    outputNum: number;
    genOriRes: boolean;
    isSecondOperate: boolean;
    name: string;
    version: string;
    provider: string;
    modelType: DressingModelType;
};

export type DressingSnapshotInput = {
    values: DressingValues;
    pose: ModelPoseDraft;
};

/** 只有参与提交的槽位进快照 —— 这正是「切 Tab 后不适用字段被清理」的落地。 */
export function buildDressingSnapshot({ values, pose }: DressingSnapshotInput): DressingSnapshot {
    const garments = filledSlots(values).map<DressingGarmentSnapshot>((slot) => {
        const garment = values.garments[slot];
        const meta = slotMeta(slot);
        return {
            slot,
            label: meta.label,
            assetId: garment.assetId,
            name: garment.name,
            imageUrl: garment.imageUrl,
            originUrl: garment.originUrl,
            width: garment.width,
            height: garment.height,
            maskCoverage: Number(garmentMaskCoverage(garment).toFixed(4)),
            maskHash: garmentMaskHash(garment),
            strokeCount: garment.mask.strokes.length,
        };
    });

    return {
        toolId: AI_DRESSING_V2_TOOL_ID,
        tab: values.activeTab,
        garments,
        poseId: pose.id,
        poseName: pose.name,
        poseImageUrl: pose.imageUrl,
        poseWidth: pose.width,
        poseHeight: pose.height,
        poseList: values.poses.map((item) => item.id),
        outputNum: normalizeOutputNum(values.outputNum),
        genOriRes: values.genOriRes,
        isSecondOperate: values.isSecondOperate,
        name: values.name.trim().slice(0, DRESSING_NAME_MAX),
        version: normalizeVersion(values.version),
        provider: values.provider.trim(),
        modelType: normalizeModelType(values.modelType),
    };
}

export function dressingSnapshotHash(snapshot: DressingSnapshot): string {
    return computeSnapshotHash({
        tab: snapshot.tab,
        garments: snapshot.garments.map((garment) => [
            garment.slot,
            garment.assetId,
            garment.imageUrl,
            garment.width,
            garment.height,
            garment.maskHash,
        ]),
        pose: [snapshot.poseId, snapshot.poseImageUrl],
        poseList: snapshot.poseList,
        outputNum: snapshot.outputNum,
        genOriRes: snapshot.genOriRes,
        version: snapshot.version,
        modelType: snapshot.modelType,
    });
}

export function isDressingSnapshotStale(snapshot: DressingSnapshot, currentHash: string): boolean {
    return dressingSnapshotHash(snapshot) !== currentHash;
}

/* ------------------------------------------------------------------ *
 * 字段合成（20 个字段一个不少）
 * ------------------------------------------------------------------ */

export type DressingFieldExtras = {
    /** 提交前渲染出的蒙版 PNG（dataURL / 远端 URL），按槽位索引。 */
    maskUrls: Partial<Record<GarmentSlotKey, string>>;
    /** 结果图占位（提交时为空数组，由真实任务回填）。 */
    images?: string[];
    /** 本次生成引用到的封面图（模特 + 服装）。 */
    coverList?: string[];
};

function garmentValue(snapshot: DressingSnapshot, slot: GarmentSlotKey, pick: (garment: DressingGarmentSnapshot) => string): string {
    const garment = snapshot.garments.find((item) => item.slot === slot);
    if (!garment) return "";
    return pick(garment);
}

export function composeDressingFields(snapshot: DressingSnapshot, extras: DressingFieldExtras): Record<DressingFieldKey, unknown> {
    const coverList = extras.coverList ?? [snapshot.poseImageUrl, ...snapshot.garments.map((garment) => garment.imageUrl)];
    return {
        coverList,
        downImageUrl: garmentValue(snapshot, "down", (garment) => garment.imageUrl),
        downMaskUrl: extras.maskUrls.down ?? "",
        downOriginUrl: garmentValue(snapshot, "down", (garment) => garment.originUrl || garment.imageUrl),
        genOriRes: snapshot.genOriRes,
        images: extras.images ?? [],
        isSecondOperate: snapshot.isSecondOperate,
        modelPose: snapshot.poseId,
        modelPoseList: snapshot.poseList,
        modelType: snapshot.modelType,
        name: snapshot.name,
        outputNum: snapshot.outputNum,
        provider: snapshot.provider,
        suitImageUrl: garmentValue(snapshot, "suit", (garment) => garment.imageUrl),
        suitMaskUrl: extras.maskUrls.suit ?? "",
        suitOriginUrl: garmentValue(snapshot, "suit", (garment) => garment.originUrl || garment.imageUrl),
        upperImageUrl: garmentValue(snapshot, "upper", (garment) => garment.imageUrl),
        upperMaskUrl: extras.maskUrls.upper ?? "",
        upperOriginUrl: garmentValue(snapshot, "upper", (garment) => garment.originUrl || garment.imageUrl),
        version: snapshot.version,
    };
}

/** 只校验「本次 Tab 适用」的字段；不适用槽位保持空串是合法的。 */
export function requiredDressingFields(snapshot: DressingSnapshot): DressingFieldKey[] {
    const keys: DressingFieldKey[] = ["genOriRes", "isSecondOperate", "modelPose", "modelPoseList", "modelType", "outputNum", "version"];
    for (const garment of snapshot.garments) {
        const meta = slotMeta(garment.slot);
        keys.push(meta.imageKey, meta.maskKey, meta.originKey);
    }
    return keys;
}

export function missingDressingFields(snapshot: DressingSnapshot, fields: Record<DressingFieldKey, unknown>): DressingFieldKey[] {
    return requiredDressingFields(snapshot).filter((key) => {
        const value = fields[key];
        if (Array.isArray(value)) return value.length === 0 && key !== "modelPoseList";
        if (typeof value === "boolean") return false;
        if (typeof value === "number") return !Number.isFinite(value) || (key === "outputNum" && value <= 0);
        return typeof value !== "string" || value.trim() === "";
    });
}

/* ------------------------------------------------------------------ *
 * 提示词
 * ------------------------------------------------------------------ */

export function dressingTag(tab: DressingTab, poseId: string): string {
    return `[AI_DRESSING v2/pose:${poseId || "none"}/tab:${tab}]`;
}

export function dressingUnitTag(snapshot: DressingSnapshot): string {
    return dressingTag(snapshot.tab, snapshot.poseId);
}

export function composeDressingPrompt(snapshot: DressingSnapshot): string {
    const order: string[] = ["第 1 张是穿衣模特参考，保持模特身份、肤色、体型、姿势与镜头不变。"];
    let index = 2;
    for (const garment of snapshot.garments) {
        order.push(`第 ${index} 张是${garment.label}正面图；随后同名 -mask.png 的白色区域就是${garment.label}需要贴合的部位。`);
        index += 1;
    }
    const parts = [
        dressingUnitTag(snapshot),
        order.join(""),
        snapshot.garments.length > 1 ? "上装与下装必须同时穿上，接缝处自然过渡，不要只换其中一件。" : "",
        "服装的版型、面料、纹理、颜色、纽扣与印花必须严格来自参考图，不得重新设计或改款。",
        "蒙版白色区域外的模特皮肤、头发、手部与背景不得改动；蒙版内按真实人体结构重算褶皱与受光。",
        snapshot.genOriRes ? "输出保持模特参考的原始分辨率与构图。" : "输出统一为纵向 3:4 全身构图，模特完整入画。",
        snapshot.modelType === "kid" ? "模特为儿童，比例与姿态需符合儿童体型。" : "",
        snapshot.name ? `成片命名：${snapshot.name}。` : "",
        `输出 ${snapshot.outputNum} 张。`,
    ];
    return parts
        .filter(Boolean)
        .join("")
        .slice(0, DRESSING_PROMPT_MAX);
}

/* ------------------------------------------------------------------ *
 * 单位（一次提交 = 一张模特参考）
 * ------------------------------------------------------------------ */

export type DressingUnitPlan = {
    poseId: string;
    poseName: string;
    outputNum: number;
};

/** 每个模特参考一个任务单元；输出张数按单元各自计。 */
export function planDressingUnits(values: DressingValues): DressingUnitPlan[] {
    const pose = activePose(values);
    if (!pose) return [];
    return [{ poseId: pose.id, poseName: pose.name, outputNum: normalizeOutputNum(values.outputNum) }];
}

export function estimateDressingOutput(values: DressingValues): number {
    return planDressingUnits(values).reduce((total, unit) => total + unit.outputNum, 0);
}

/* ------------------------------------------------------------------ *
 * 草稿序列化（刷新后原样恢复，蒙版笔画与撤销栈都在）
 * ------------------------------------------------------------------ */

export type DressingDraftPayload = {
    values: DressingValues;
};

function normalizeMaskState(raw: unknown): MaskState {
    const record = (raw ?? {}) as Partial<MaskState>;
    const strokes = Array.isArray(record.strokes)
        ? (record.strokes as MaskStroke[]).filter((stroke) => stroke && Array.isArray(stroke.points))
        : [];
    // 注意：不能用 `brushSize: undefined` 覆盖默认值 —— 展开赋值会把 undefined 写进去。
    const overrides: Partial<MaskState> = {
        strokes,
        tool: record.tool === "eraser" ? "eraser" : "brush",
        inverted: Boolean(record.inverted),
        autoExpand: Boolean(record.autoExpand),
    };
    if (Number.isFinite(record.brushSize)) overrides.brushSize = Number(record.brushSize);
    if (Number.isFinite(record.feather)) overrides.feather = Number(record.feather);
    return createMaskState(overrides);
}

function normalizeGarment(raw: unknown, slot: GarmentSlotKey): GarmentDraft {
    const record = (raw ?? {}) as Partial<GarmentDraft>;
    return {
        slot,
        assetId: typeof record.assetId === "string" ? record.assetId : "",
        name: typeof record.name === "string" ? record.name : "",
        imageUrl: typeof record.imageUrl === "string" ? record.imageUrl : "",
        originUrl: typeof record.originUrl === "string" ? record.originUrl : "",
        width: Number(record.width) || 0,
        height: Number(record.height) || 0,
        mask: normalizeMaskState(record.mask),
        past: Array.isArray(record.past) ? (record.past as MaskStroke[][]) : [],
        future: Array.isArray(record.future) ? (record.future as MaskStroke[][]) : [],
    };
}

export function normalizeDressingValues(raw: unknown): DressingValues {
    const base = createDressingValues();
    if (!raw || typeof raw !== "object") return base;
    const record = raw as Partial<DressingValues> & { garments?: Record<string, unknown> };
    const garments = {
        upper: normalizeGarment(record.garments?.upper, "upper"),
        down: normalizeGarment(record.garments?.down, "down"),
        suit: normalizeGarment(record.garments?.suit, "suit"),
    };
    const poses = Array.isArray(record.poses)
        ? record.poses
              .filter((pose): pose is ModelPoseDraft => Boolean(pose && typeof pose === "object" && typeof pose.id === "string"))
              .slice(0, DRESSING_MAX_POSES)
              .map((pose) => ({
                  id: pose.id,
                  assetId: typeof pose.assetId === "string" ? pose.assetId : "",
                  name: typeof pose.name === "string" ? pose.name : "",
                  imageUrl: typeof pose.imageUrl === "string" ? pose.imageUrl : "",
                  width: Number(pose.width) || 0,
                  height: Number(pose.height) || 0,
              }))
        : [];
    const activePoseId = typeof record.activePoseId === "string" && poses.some((pose) => pose.id === record.activePoseId)
        ? record.activePoseId
        : poses[0]?.id ?? "";

    return {
        activeTab: normalizeTab(record.activeTab),
        garments,
        poses,
        activePoseId,
        outputNum: normalizeOutputNum(record.outputNum),
        genOriRes: Boolean(record.genOriRes),
        isSecondOperate: Boolean(record.isSecondOperate),
        name: typeof record.name === "string" ? record.name.slice(0, DRESSING_NAME_MAX) : "",
        version: normalizeVersion(record.version),
        provider: typeof record.provider === "string" ? record.provider : DRESSING_DEFAULT_PROVIDER,
        modelType: normalizeModelType(record.modelType),
    };
}

export function serializeDressingValues(values: DressingValues): Record<string, unknown> {
    return {
        ...values,
        garments: {
            upper: values.garments.upper,
            down: values.garments.down,
            suit: values.garments.suit,
        },
    };
}
