/**
 * TASK-027：AI_POSTURE「姿势裂变」页面契约 + 纯逻辑（无 React / 无网络）。
 *
 * 事实来源：
 *  - docs/V1.0/plan_linkfox_navigation/page-specs/20-ai-posture.md
 *  - 共享注册表 web/src/features/tools/registry/index.ts#AI_POSTURE（index 20, layout "model", makeType 58）
 *  - 原站 https://www.linkfox.com/draw/ai-posture（实测文案：图片规则 / 姿势库 / 自定义 / 选择姿势（可选）/ 选择生成张数 / 立即生成）
 *
 * 本页与其他「上传 + 提示词 + 结果」工具的区别，全部落在真实状态上：
 *  - 姿势库是**结构化姿势**（id + 英文指令 + 建议标签），选卡片会把姿势写进请求；
 *  - 「自定义」是**文本姿势**，与姿势库选择各自独立保存：来回切 Tab 不互相覆盖草稿；
 *  - 姿势选择可为空 —— 空选择时按张数自动裂变（从姿势库取互不重复的姿势），
 *    因此「1 张模特图 → N 种姿势」是一次提交里 N 个独立请求单元，不是一个笼统的 count；
 *  - 结果按**来源姿势**分组，单组可单独重试，已成功组不重复生成；
 *  - 快照锁定：提交时的姿势/标签/张数指纹与当前不一致 → 结果标记「来自旧版本」。
 */

import { getToolById } from "./index";
import type { FieldSpec, ToolSpec } from "../types";

export const AI_POSTURE_TOOL_ID = "AI_POSTURE";
export const AI_POSTURE_SLUG = "ai-posture";
export const AI_POSTURE_ROUTE = "/tools/product-design/ai-posture";
export const AI_POSTURE_LAYOUT = "model";
export const AI_POSTURE_MAKE_TYPE = 58;
/** 与 stores/use-tool-draft-store 的 toolDraftKey() 同构，避免 registry 反向依赖 store。 */
export const AI_POSTURE_DRAFT_KEY = `tool-draft:v1:${AI_POSTURE_TOOL_ID}`;

/** registry/index.ts#AI_POSTURE.fields 的键集合；少一个都算丢参。 */
export const AI_POSTURE_FIELD_KEYS = ["imageTags", "imageUrl", "outputNum", "prompt"] as const;

/** 原站「选择生成张数 1 / 2 / 3 / 4」——张数即姿势裂变的单元数上限。 */
export const AI_POSTURE_OUTPUT_OPTIONS = [1, 2, 3, 4] as const;
export const AI_POSTURE_MIN_OUTPUT = 1;
export const AI_POSTURE_MAX_OUTPUT = 4;
export const AI_POSTURE_DEFAULT_OUTPUT = 1;

export const AI_POSTURE_PROMPT_MAX = 4000;
export const AI_POSTURE_CUSTOM_POSE_MAX = 4000;
export const AI_POSTURE_TAGS_MAX = 12;
export const AI_POSTURE_TAG_MAX_LENGTH = 24;

/** 原站图片规则：10M 以内，384*384 ~ 4096*4096。 */
export const AI_POSTURE_UPLOAD_LIMITS = {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
    maxBytes: 10 * 1024 * 1024,
    minSide: 384,
    maxSide: 4096,
} as const;
export const AI_POSTURE_UPLOAD_LABEL = "10M以内，384×384 ~ 4096×4096";

export function getAiPostureSpec(): ToolSpec | undefined {
    return getToolById(AI_POSTURE_TOOL_ID);
}

/** 画布/编辑区历史深度上限（撤销/重做只覆盖姿势与标签编辑，不吞源图与张数）。 */
export const AI_POSTURE_HISTORY_LIMIT = 40;

/* ------------------------------------------------------------------ *
 * 姿势库（结构化姿势）
 * ------------------------------------------------------------------ */

export type AiPosturePoseCategory = {
    id: string;
    label: string;
    hint: string;
};

export type AiPosturePose = {
    id: string;
    label: string;
    categoryId: string;
    /** 写进 provider prompt 的英文姿势指令；切换语言不会替换这段事实。 */
    instruction: string;
    /** 建议的图片标签，点选卡片时可直接并入 imageTags。 */
    tags: readonly string[];
};

export const AI_POSTURE_POSE_CATEGORIES: readonly AiPosturePoseCategory[] = [
    { id: "stand", label: "站姿", hint: "正面/叉腰/插兜，适合主图与详情页首屏" },
    { id: "angle", label: "角度", hint: "侧身/背身/低机位，换机位不改动作" },
    { id: "motion", label: "动态", hint: "行走/转身/轻跳，制造画面张力" },
    { id: "sit", label: "坐姿", hint: "高脚凳/坐地，适合长款与配饰" },
] as const;

export const AI_POSTURE_POSES: readonly AiPosturePose[] = [
    {
        id: "stand-front",
        label: "正面站姿",
        categoryId: "stand",
        instruction: "standing straight and facing the camera, arms relaxed naturally at the sides, feet shoulder-width apart",
        tags: ["站姿", "正面", "全身"],
    },
    {
        id: "stand-hip",
        label: "单手叉腰",
        categoryId: "stand",
        instruction: "standing with one hand on the hip and the other arm relaxed, weight shifted onto one leg",
        tags: ["站姿", "叉腰"],
    },
    {
        id: "stand-pocket",
        label: "双手插兜",
        categoryId: "stand",
        instruction: "standing casually with both hands in pockets, shoulders relaxed",
        tags: ["站姿", "插兜"],
    },
    {
        id: "stand-cross",
        label: "双臂交叉",
        categoryId: "stand",
        instruction: "standing with arms crossed over the chest in a confident posture",
        tags: ["站姿", "交叉"],
    },
    {
        id: "angle-side",
        label: "侧身站立",
        categoryId: "angle",
        instruction: "standing in a three-quarter side profile with the head turned toward the camera",
        tags: ["侧身", "回眸"],
    },
    {
        id: "angle-back",
        label: "背身回眸",
        categoryId: "angle",
        instruction: "back to the camera with the head turned over the shoulder, looking back at the viewer",
        tags: ["背身", "回眸"],
    },
    {
        id: "angle-low",
        label: "低机位仰拍",
        categoryId: "angle",
        instruction: "a low camera angle looking up at the model while standing tall",
        tags: ["低机位", "仰拍"],
    },
    {
        id: "motion-walk",
        label: "行走抓拍",
        categoryId: "motion",
        instruction: "caught mid-stride walking toward the camera with a natural arm swing",
        tags: ["动态", "行走"],
    },
    {
        id: "motion-turn",
        label: "转身瞬间",
        categoryId: "motion",
        instruction: "caught mid-turn with hair and clothing following the motion",
        tags: ["动态", "转身"],
    },
    {
        id: "motion-jump",
        label: "轻跳",
        categoryId: "motion",
        instruction: "a light jump with both feet off the ground and arms slightly raised",
        tags: ["动态", "跳跃"],
    },
    {
        id: "sit-stool",
        label: "高脚凳坐姿",
        categoryId: "sit",
        instruction: "sitting on a tall stool with one leg crossed over the other, back straight",
        tags: ["坐姿", "高脚凳"],
    },
    {
        id: "sit-floor",
        label: "坐地",
        categoryId: "sit",
        instruction: "sitting on the floor with legs folded to one side, hands resting on the knee",
        tags: ["坐姿", "坐地"],
    },
] as const;

const POSE_BY_ID = new Map(AI_POSTURE_POSES.map((pose) => [pose.id, pose]));

export function findAiPosturePose(poseId: string): AiPosturePose | undefined {
    return POSE_BY_ID.get(poseId);
}

export function aiPosturePoses(categoryId?: string | null): AiPosturePose[] {
    if (!categoryId) return [...AI_POSTURE_POSES];
    return AI_POSTURE_POSES.filter((pose) => pose.categoryId === categoryId);
}

/* ------------------------------------------------------------------ *
 * 工作区状态
 * ------------------------------------------------------------------ */

export type AiPostureMode = "library" | "custom";

export type AiPostureSource = {
    assetId: string;
    name: string;
    url: string;
    width: number;
    height: number;
};

/** 撤销/重做只记录「姿势 + 标签」编辑，源图与张数不参与。 */
export type AiPostureEditState = {
    mode: AiPostureMode;
    selectedPoseIds: string[];
    customPose: string;
    imageTags: string[];
};

export type AiPostureHistory = {
    past: AiPostureEditState[];
    future: AiPostureEditState[];
};

export type AiPostureWorkspace = AiPostureEditState & {
    outputNum: number;
    prompt: string;
    categoryId: string | null;
    source: AiPostureSource | null;
    history: AiPostureHistory;
};

export function createAiPostureWorkspace(overrides: Partial<AiPostureWorkspace> = {}): AiPostureWorkspace {
    return {
        mode: "library",
        selectedPoseIds: [],
        customPose: "",
        imageTags: [],
        outputNum: AI_POSTURE_DEFAULT_OUTPUT,
        prompt: "",
        categoryId: null,
        source: null,
        history: { past: [], future: [] },
        ...overrides,
    };
}

function editStateOf(workspace: AiPostureWorkspace): AiPostureEditState {
    return {
        mode: workspace.mode,
        selectedPoseIds: [...workspace.selectedPoseIds],
        customPose: workspace.customPose,
        imageTags: [...workspace.imageTags],
    };
}

function sameEditState(a: AiPostureEditState, b: AiPostureEditState): boolean {
    return (
        a.mode === b.mode &&
        a.customPose === b.customPose &&
        a.selectedPoseIds.length === b.selectedPoseIds.length &&
        a.selectedPoseIds.every((id, index) => id === b.selectedPoseIds[index]) &&
        a.imageTags.length === b.imageTags.length &&
        a.imageTags.every((tag, index) => tag === b.imageTags[index])
    );
}

/** 记录一次可撤销编辑；内容没变就不写历史，避免撤销按一次没反应。 */
function withEdit(workspace: AiPostureWorkspace, next: Partial<AiPostureEditState>): AiPostureWorkspace {
    const current = editStateOf(workspace);
    const merged: AiPostureEditState = { ...current, ...next };
    if (sameEditState(current, merged)) return workspace;
    const past = [...workspace.history.past, current].slice(-AI_POSTURE_HISTORY_LIMIT);
    return { ...workspace, ...merged, history: { past, future: [] } };
}

export function editHistoryLabel(workspace: AiPostureWorkspace): { canUndo: boolean; canRedo: boolean } {
    return { canUndo: workspace.history.past.length > 0, canRedo: workspace.history.future.length > 0 };
}

export function undoPostureEdit(workspace: AiPostureWorkspace): AiPostureWorkspace {
    const previous = workspace.history.past.at(-1);
    if (!previous) return workspace;
    return {
        ...workspace,
        ...previous,
        selectedPoseIds: [...previous.selectedPoseIds],
        imageTags: [...previous.imageTags],
        history: {
            past: workspace.history.past.slice(0, -1),
            future: [editStateOf(workspace), ...workspace.history.future].slice(0, AI_POSTURE_HISTORY_LIMIT),
        },
    };
}

export function redoPostureEdit(workspace: AiPostureWorkspace): AiPostureWorkspace {
    const next = workspace.history.future[0];
    if (!next) return workspace;
    return {
        ...workspace,
        ...next,
        selectedPoseIds: [...next.selectedPoseIds],
        imageTags: [...next.imageTags],
        history: {
            past: [...workspace.history.past, editStateOf(workspace)].slice(-AI_POSTURE_HISTORY_LIMIT),
            future: workspace.history.future.slice(1),
        },
    };
}

/** 姿势库 / 自定义 切换：只切模式，两边的值各自留在原处（不互相覆盖）。 */
export function setAiPostureMode(workspace: AiPostureWorkspace, mode: AiPostureMode): AiPostureWorkspace {
    return withEdit(workspace, { mode });
}

export function setAiPostureCategory(workspace: AiPostureWorkspace, categoryId: string | null): AiPostureWorkspace {
    return { ...workspace, categoryId };
}

/** 多选姿势卡片；再次点击取消。未选任何姿势时提交后会按张数自动裂变。 */
export function toggleAiPosturePose(workspace: AiPostureWorkspace, poseId: string): AiPostureWorkspace {
    if (!POSE_BY_ID.has(poseId)) return workspace;
    const has = workspace.selectedPoseIds.includes(poseId);
    const selectedPoseIds = has
        ? workspace.selectedPoseIds.filter((id) => id !== poseId)
        : [...workspace.selectedPoseIds, poseId];
    return withEdit(workspace, { selectedPoseIds });
}

export function clearAiPosturePoses(workspace: AiPostureWorkspace): AiPostureWorkspace {
    return withEdit(workspace, { selectedPoseIds: [] });
}

export function setAiPostureCustomPose(workspace: AiPostureWorkspace, customPose: string): AiPostureWorkspace {
    return withEdit(workspace, { customPose: customPose.slice(0, AI_POSTURE_CUSTOM_POSE_MAX) });
}

/**
 * 点选姿势卡片时把建议标签并入 imageTags（去重 + 长度上限）。
 * 取消姿势**不会**删标签：标签是用户可以继续手工维护的独立输入。
 */
export function applyPoseTags(workspace: AiPostureWorkspace, poseId: string): AiPostureWorkspace {
    const pose = POSE_BY_ID.get(poseId);
    if (!pose) return workspace;
    return setAiPostureTags(workspace, [...workspace.imageTags, ...pose.tags]);
}

export function setAiPostureTags(workspace: AiPostureWorkspace, tags: readonly string[]): AiPostureWorkspace {
    const seen = new Set<string>();
    const imageTags: string[] = [];
    for (const raw of tags) {
        const tag = normalizeAiPostureTag(raw);
        if (!tag) continue;
        const key = tag.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        imageTags.push(tag);
        if (imageTags.length >= AI_POSTURE_TAGS_MAX) break;
    }
    return withEdit(workspace, { imageTags });
}

export function normalizeAiPostureTag(raw: string): string {
    return raw.replace(/\s+/g, " ").trim().slice(0, AI_POSTURE_TAG_MAX_LENGTH);
}

export function addAiPostureTag(workspace: AiPostureWorkspace, raw: string): AiPostureWorkspace {
    const tag = normalizeAiPostureTag(raw);
    if (!tag) return workspace;
    return setAiPostureTags(workspace, [...workspace.imageTags, tag]);
}

export function removeAiPostureTag(workspace: AiPostureWorkspace, index: number): AiPostureWorkspace {
    return setAiPostureTags(
        workspace,
        workspace.imageTags.filter((_, i) => i !== index),
    );
}

export function setAiPostureOutputNum(workspace: AiPostureWorkspace, outputNum: number): AiPostureWorkspace {
    const value = Math.round(outputNum);
    if (!Number.isFinite(value)) return workspace;
    const clamped = Math.min(AI_POSTURE_MAX_OUTPUT, Math.max(AI_POSTURE_MIN_OUTPUT, value));
    return { ...workspace, outputNum: clamped };
}

export function setAiPosturePrompt(workspace: AiPostureWorkspace, prompt: string): AiPostureWorkspace {
    return { ...workspace, prompt: prompt.slice(0, AI_POSTURE_PROMPT_MAX) };
}

export function setAiPostureSource(workspace: AiPostureWorkspace, source: AiPostureSource | null): AiPostureWorkspace {
    return { ...workspace, source };
}

/* ------------------------------------------------------------------ *
 * 姿势裂变计划：选中姿势 或 自动裂变
 * ------------------------------------------------------------------ */

export type AiPosturePlan = {
    /** 本次真正要发出去的姿势（顺序稳定）。

     *  - 选了卡片：按用户选择顺序；
     *  - 自定义：单元素虚拟姿势（id = "custom"）；
     *  - 都没选：按张数从姿势库自动取互不重复的姿势（自动裂变）。
     */
    poses: AiPosturePose[];
    /** 姿势来自哪条路径，直接驱动 UI 文案与结果分组标题。 */
    origin: "library" | "custom" | "auto";
    /** 自定义模式下用户写的文本。 */
    customPose: string;
};

/** 自动裂变候选：避开用户已选过的姿势，再按张数补齐；已选为空时从第一个开始。 */
export function autoFissionPoses(count: number, exclude: readonly string[] = []): AiPosturePose[] {
    const used = new Set(exclude);
    const picks: AiPosturePose[] = [];
    for (const pose of AI_POSTURE_POSES) {
        if (used.has(pose.id)) continue;
        picks.push(pose);
        if (picks.length >= count) break;
    }
    // 张数超过库容量（当前 12 > 4，理论上不会走到）时循环补齐，保证单元数等于张数。
    let cursor = 0;
    while (picks.length < count && AI_POSTURE_POSES.length > 0) {
        picks.push(AI_POSTURE_POSES[cursor % AI_POSTURE_POSES.length]!);
        cursor += 1;
    }
    return picks;
}

export function resolveAiPosturePlan(workspace: AiPostureWorkspace): AiPosturePlan {
    if (workspace.mode === "custom") {
        const customPose = workspace.customPose.trim();
        const pose: AiPosturePose = {
            id: "custom",
            label: customPose ? truncateLabel(customPose) : "自定义姿势",
            categoryId: "custom",
            instruction: customPose,
            tags: [],
        };
        return { poses: [pose], origin: "custom", customPose };
    }
    if (workspace.selectedPoseIds.length > 0) {
        const poses = workspace.selectedPoseIds.flatMap((id) => {
            const pose = POSE_BY_ID.get(id);
            return pose ? [pose] : [];
        });
        if (poses.length > 0) return { poses, origin: "library", customPose: workspace.customPose.trim() };
    }
    return {
        poses: autoFissionPoses(workspace.outputNum, workspace.selectedPoseIds),
        origin: "auto",
        customPose: workspace.customPose.trim(),
    };
}

function truncateLabel(text: string): string {
    const singleLine = text.replace(/\s+/g, " ").trim();
    return singleLine.length > 12 ? `${singleLine.slice(0, 12)}…` : singleLine;
}

/**
 * 把「张数」摊到每个姿势上：总张数必须精确等于 outputNum，
 * 余数从前往后每单元 +1，不丢也不多生成。
 */
export function distributePostureOutputs(total: number, poseCount: number): number[] {
    if (poseCount <= 0) return [];
    const safeTotal = Math.max(0, Math.round(total));
    const base = Math.floor(safeTotal / poseCount);
    const remainder = safeTotal % poseCount;
    return Array.from({ length: poseCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

/* ------------------------------------------------------------------ *
 * prompt 合成（结构化姿势 → provider 指令）
 * ------------------------------------------------------------------ */

export type AiPosturePromptOptions = {
    /** 模特图之外的补充描述（保留人物一致性最重要）。 */
    extra?: string;
};

export function buildAiPosturePrompt(
    workspace: AiPostureWorkspace,
    pose: AiPosturePose,
    options: AiPosturePromptOptions = {},
): string {
    const plan = resolveAiPosturePlan(workspace);
    const lines: string[] = [];
    lines.push("Keep the same person as the reference model image: identical face, hair, body proportions and skin tone.");
    if (pose.id === "custom") {
        lines.push(`Change only the pose to: ${plan.customPose || "a natural, relaxed standing pose"}.`);
    } else {
        lines.push(`Change only the pose to: ${pose.instruction}.`);
    }
    lines.push("Keep the original outfit, garment details and colors unchanged; do not add or remove clothing.");
    if (workspace.imageTags.length > 0) {
        lines.push(`Image tags to respect: ${workspace.imageTags.join(", ")}.`);
    }
    const extra = (options.extra ?? workspace.prompt).trim();
    if (extra) lines.push(extra);
    lines.push("Photorealistic full-body fashion photo, natural lighting, sharp focus, no text, no watermark.");
    return lines.join(" ");
}

/* ------------------------------------------------------------------ *
 * 校验
 * ------------------------------------------------------------------ */

export type AiPostureIssueCode =
    | "source-missing"
    | "asset-size"
    | "asset-too-small"
    | "custom-pose-empty"
    | "custom-pose-too-long"
    | "output-num"
    | "tags-too-many"
    | "tag-too-long"
    | "prompt-too-long"
    | "prompt-empty";

export type AiPostureIssue = { code: AiPostureIssueCode; message: string };

export type AiPostureValidationContext = {
    /** 源资产是否已成功入库并有可用 URL。 */
    sourceReady?: boolean;
    sourceWidth?: number;
    sourceHeight?: number;
};

export function validateAiPostureWorkspace(
    workspace: AiPostureWorkspace,
    context: AiPostureValidationContext = {},
): AiPostureIssue[] {
    const issues: AiPostureIssue[] = [];

    if (!workspace.source) {
        issues.push({ code: "source-missing", message: "请先上传模特姿势图（拖拽/粘贴或从本地选择）" });
    } else if (context.sourceReady === false) {
        issues.push({ code: "source-missing", message: "模特图尚未入库完成，请等待上传结束后重试" });
    }

    const width = context.sourceWidth ?? workspace.source?.width ?? 0;
    const height = context.sourceHeight ?? workspace.source?.height ?? 0;
    if (workspace.source && (!width || !height)) {
        issues.push({ code: "asset-size", message: "图片尺寸读取失败，请重新上传模特图" });
    } else if (workspace.source && (width < AI_POSTURE_UPLOAD_LIMITS.minSide || height < AI_POSTURE_UPLOAD_LIMITS.minSide)) {
        issues.push({
            code: "asset-too-small",
            message: `模特图最短边需 ≥ ${AI_POSTURE_UPLOAD_LIMITS.minSide}px（当前 ${width}×${height}）`,
        });
    }

    if (workspace.mode === "custom") {
        const customPose = workspace.customPose.trim();
        if (!customPose) {
            issues.push({ code: "custom-pose-empty", message: "自定义模式下请填写姿势描述，或切回姿势库" });
        } else if (workspace.customPose.length > AI_POSTURE_CUSTOM_POSE_MAX) {
            issues.push({ code: "custom-pose-too-long", message: `姿势描述最多 ${AI_POSTURE_CUSTOM_POSE_MAX} 字` });
        }
    }

    if (
        !Number.isInteger(workspace.outputNum) ||
        workspace.outputNum < AI_POSTURE_MIN_OUTPUT ||
        workspace.outputNum > AI_POSTURE_MAX_OUTPUT
    ) {
        issues.push({
            code: "output-num",
            message: `生成张数需在 ${AI_POSTURE_MIN_OUTPUT}–${AI_POSTURE_MAX_OUTPUT} 之间（当前 ${workspace.outputNum}）`,
        });
    }

    if (workspace.imageTags.length > AI_POSTURE_TAGS_MAX) {
        issues.push({ code: "tags-too-many", message: `图片标签最多 ${AI_POSTURE_TAGS_MAX} 个` });
    }
    if (workspace.imageTags.some((tag) => tag.length > AI_POSTURE_TAG_MAX_LENGTH)) {
        issues.push({ code: "tag-too-long", message: `单个标签最多 ${AI_POSTURE_TAG_MAX_LENGTH} 字` });
    }
    if (workspace.prompt.length > AI_POSTURE_PROMPT_MAX) {
        issues.push({ code: "prompt-too-long", message: `补充描述最多 ${AI_POSTURE_PROMPT_MAX} 字` });
    }

    return issues;
}

/* ------------------------------------------------------------------ *
 * 字段合成（4 个 registry 字段，一个都不能少）
 * ------------------------------------------------------------------ */

export type AiPostureFieldMap = {
    imageTags: string;
    imageUrl: string;
    outputNum: number;
    prompt: string;
};

/** imageTags 在 wire 上是字符串（原站 imageTags 为 upload/text 型），用逗号拼接而非 JSON。 */
export function serializeAiPostureTags(tags: readonly string[]): string {
    return tags.join(",");
}

export function parseAiPostureTags(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw.map((item) => String(item));
    if (typeof raw !== "string") return [];
    return raw
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
}

export function composeAiPostureFields(
    workspace: AiPostureWorkspace,
    options: { imageUrl?: string; promptOverride?: string } = {},
): AiPostureFieldMap {
    const imageUrl = options.imageUrl ?? workspace.source?.url ?? "";
    return {
        imageTags: serializeAiPostureTags(workspace.imageTags),
        imageUrl,
        outputNum: workspace.outputNum,
        prompt: options.promptOverride ?? buildAiPosturePrompt(workspace, resolveAiPosturePlan(workspace).poses[0] ?? AI_POSTURE_POSES[0]!),
    };
}

/** 字段守卫：返回缺失/非法字段名，供提交前拦截（禁止静默丢参）。 */
export function auditAiPostureFields(fields: Record<string, unknown>): string[] {
    const missing: string[] = [];
    for (const key of AI_POSTURE_FIELD_KEYS) {
        if (!(key in fields)) {
            missing.push(key);
            continue;
        }
        const value = fields[key];
        if (key === "outputNum") {
            const numeric = typeof value === "number" ? value : Number(value);
            if (!Number.isInteger(numeric) || numeric < AI_POSTURE_MIN_OUTPUT || numeric > AI_POSTURE_MAX_OUTPUT) {
                missing.push(key);
            }
            continue;
        }
        if (key === "imageTags") {
            // 标签可以为空（可选字段），但必须是字符串而不是 undefined。
            if (typeof value !== "string") missing.push(key);
            continue;
        }
        if (typeof value !== "string" || !value.trim()) missing.push(key);
    }
    return missing;
}

/* ------------------------------------------------------------------ *
 * 快照（提交锁定 + 旧版本标记）
 * ------------------------------------------------------------------ */

export type AiPostureSnapshot = {
    sourceAssetId: string;
    sourceUrl: string;
    mode: AiPostureMode;
    selectedPoseIds: string[];
    customPose: string;
    imageTags: string[];
    outputNum: number;
    prompt: string;
    poses: { id: string; label: string; count: number }[];
};

export function buildAiPostureSnapshot(workspace: AiPostureWorkspace): AiPostureSnapshot {
    const plan = resolveAiPosturePlan(workspace);
    const counts = distributePostureOutputs(workspace.outputNum, plan.poses.length);
    return {
        sourceAssetId: workspace.source?.assetId ?? "",
        sourceUrl: workspace.source?.url ?? "",
        mode: workspace.mode,
        selectedPoseIds: [...workspace.selectedPoseIds],
        customPose: workspace.customPose,
        imageTags: [...workspace.imageTags],
        outputNum: workspace.outputNum,
        prompt: workspace.prompt,
        poses: plan.poses.map((pose, index) => ({ id: pose.id, label: pose.label, count: counts[index] ?? 0 })),
    };
}

/** 稳定指纹：影响请求结果的输入全部入哈希，顺序敏感的数组保持顺序。 */
export function aiPostureSnapshotHash(workspace: AiPostureWorkspace): string {
    const snapshot = buildAiPostureSnapshot(workspace);
    const canonical = JSON.stringify(snapshot);
    let hash = 2166136261;
    for (let index = 0; index < canonical.length; index += 1) {
        hash ^= canonical.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `ap_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function isAiPostureResultStale(submittedHash: string | null, workspace: AiPostureWorkspace): boolean {
    if (!submittedHash) return false;
    return submittedHash !== aiPostureSnapshotHash(workspace);
}

/* ------------------------------------------------------------------ *
 * 草稿往返（切 Tab / 刷新都不互相覆盖）
 * ------------------------------------------------------------------ */

export function serializeAiPostureDraftValues(workspace: AiPostureWorkspace): Record<string, unknown> {
    return {
        mode: workspace.mode,
        selectedPoseIds: [...workspace.selectedPoseIds],
        customPose: workspace.customPose,
        imageTags: [...workspace.imageTags],
        outputNum: workspace.outputNum,
        prompt: workspace.prompt,
        categoryId: workspace.categoryId,
        sourceAssetId: workspace.source?.assetId ?? "",
        sourceName: workspace.source?.name ?? "",
        sourceUrl: workspace.source?.url ?? "",
        sourceWidth: workspace.source?.width ?? 0,
        sourceHeight: workspace.source?.height ?? 0,
    };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

export function parseAiPostureDraftValues(raw: unknown): AiPostureWorkspace | null {
    if (!isRecord(raw)) return null;
    const mode: AiPostureMode = raw.mode === "custom" ? "custom" : "library";
    const selectedPoseIds = Array.isArray(raw.selectedPoseIds)
        ? raw.selectedPoseIds.filter((id): id is string => typeof id === "string" && POSE_BY_ID.has(id))
        : [];
    const customPose = typeof raw.customPose === "string" ? raw.customPose.slice(0, AI_POSTURE_CUSTOM_POSE_MAX) : "";
    const imageTags = Array.isArray(raw.imageTags)
        ? raw.imageTags.filter((tag): tag is string => typeof tag === "string").slice(0, AI_POSTURE_TAGS_MAX)
        : [];
    const outputNumRaw = typeof raw.outputNum === "number" ? raw.outputNum : Number(raw.outputNum);
    const outputNum = Number.isFinite(outputNumRaw)
        ? Math.min(AI_POSTURE_MAX_OUTPUT, Math.max(AI_POSTURE_MIN_OUTPUT, Math.round(outputNumRaw)))
        : AI_POSTURE_DEFAULT_OUTPUT;
    const prompt = typeof raw.prompt === "string" ? raw.prompt.slice(0, AI_POSTURE_PROMPT_MAX) : "";
    const categoryId =
        typeof raw.categoryId === "string" && AI_POSTURE_POSE_CATEGORIES.some((category) => category.id === raw.categoryId)
            ? raw.categoryId
            : null;
    const sourceUrl = typeof raw.sourceUrl === "string" ? raw.sourceUrl : "";
    const sourceAssetId = typeof raw.sourceAssetId === "string" ? raw.sourceAssetId : "";
    const source =
        sourceUrl && sourceAssetId
            ? {
                  assetId: sourceAssetId,
                  name: typeof raw.sourceName === "string" ? raw.sourceName : "",
                  url: sourceUrl,
                  width: typeof raw.sourceWidth === "number" ? raw.sourceWidth : Number(raw.sourceWidth) || 0,
                  height: typeof raw.sourceHeight === "number" ? raw.sourceHeight : Number(raw.sourceHeight) || 0,
              }
            : null;

    // 空草稿（用户第一次进入）不算可恢复状态，交回 createAiPostureWorkspace 的默认值。
    const hasContent = selectedPoseIds.length > 0 || customPose.trim() || imageTags.length > 0 || source;
    if (!hasContent && mode === "library") return null;

    return createAiPostureWorkspace({
        mode,
        selectedPoseIds,
        customPose,
        imageTags,
        outputNum,
        prompt,
        categoryId,
        source,
    });
}

/* ------------------------------------------------------------------ *
 * 结果分组（按来源姿势）
 * ------------------------------------------------------------------ */

export type AiPostureResultItem = {
    poseId: string;
    url: string;
    [key: string]: unknown;
};

export type AiPostureResultGroup<T extends AiPostureResultItem> = {
    poseId: string;
    label: string;
    items: T[];
};

/** 结果按来源姿势分组，顺序跟随本次计划（不是接口返回顺序）。 */
export function groupAiPostureResults<T extends AiPostureResultItem>(
    items: readonly T[],
    plan: readonly { id: string; label: string }[],
): AiPostureResultGroup<T>[] {
    const groups = new Map<string, AiPostureResultGroup<T>>();
    for (const pose of plan) {
        groups.set(pose.id, { poseId: pose.id, label: pose.label, items: [] });
    }
    for (const item of items) {
        const group = groups.get(item.poseId);
        if (group) {
            group.items.push(item);
            continue;
        }
        groups.set(item.poseId, {
            poseId: item.poseId,
            label: findAiPosturePose(item.poseId)?.label ?? item.poseId,
            items: [item],
        });
    }
    return [...groups.values()].filter((group) => group.items.length > 0);
}

/** 字段规格自检：注册表字段必须与页面契约一一对应（供测试与诊断使用）。 */
export function aiPostureFieldSpecs(): FieldSpec[] {
    return getAiPostureSpec()?.fields ?? [];
}
