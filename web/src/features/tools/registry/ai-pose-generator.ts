/**
 * TASK-033：AI_POSE_GENERATOR「AI 姿势生成」页面契约 + 纯逻辑（无 React / 无网络）。
 *
 * 事实来源：
 *  - docs/V1.0/plan_linkfox_navigation/page-specs/26-ai-pose-generator.md
 *  - 共享注册表 web/src/features/tools/registry/index.ts#AI_POSE_GENERATOR（index 26, layout "model", makeType 57）
 *  - 上游工具目录 tool_specs.json（origin=supplemental，字段仅 prompt + scenePrompts）
 *
 * 与 AI_POSTURE（TASK-027）的区别：本页**没有源图**，是从文字生成姿势参考；
 * 姿势描述与场景描述分栏编辑，场景只能约束环境/光线/道具，不得改写姿势；
 * 场景可以有多条（scenePrompts 是数组），每条场景都各自出图 —— 结果按场景分组，
 * 单组失败只重试该组，成功的组不会重复生成。
 */

import { getToolById } from "./index";
import type { FieldSpec, ToolSpec } from "../types";

export const AI_POSE_GENERATOR_TOOL_ID = "AI_POSE_GENERATOR";
export const AI_POSE_GENERATOR_SLUG = "ai-pose-generator";
export const AI_POSE_GENERATOR_ROUTE = "/tools/product-design/ai-pose-generator";
export const AI_POSE_GENERATOR_LAYOUT = "model";
export const AI_POSE_GENERATOR_MAKE_TYPE = 57;
/** 与 stores/use-tool-draft-store 的 toolDraftKey() 同构，避免 registry 反向依赖 store。 */
export const AI_POSE_GENERATOR_DRAFT_KEY = `tool-draft:v1:${AI_POSE_GENERATOR_TOOL_ID}`;

/** registry/index.ts#AI_POSE_GENERATOR.fields 的键集合；少一个都算丢参。 */
export const AI_POSE_GENERATOR_FIELD_KEYS = ["prompt", "scenePrompts"] as const;

/** 服务端按 chunk 校验 1–4000；这里取交集（本机也拦）。 */
export const AI_POSE_GENERATOR_PROMPT_MAX = 4000;
export const AI_POSE_GENERATOR_SCENE_MAX = 4000;
/** scenePrompts 是数组，一次最多 6 条场景；配合每场景 1–4 张，总请求 ≤ 24。 */
export const AI_POSE_GENERATOR_SCENES_MAX = 6;
export const AI_POSE_GENERATOR_OUTPUT_OPTIONS = [1, 2, 3, 4] as const;
export const AI_POSE_GENERATOR_MIN_OUTPUT = 1;
export const AI_POSE_GENERATOR_MAX_OUTPUT = 4;
export const AI_POSE_GENERATOR_DEFAULT_OUTPUT = 1;
export const AI_POSE_GENERATOR_MAX_IMAGES = AI_POSE_GENERATOR_SCENES_MAX * AI_POSE_GENERATOR_MAX_OUTPUT;
/** 撤销/重做只覆盖姿势/场景/预设编辑，不吞运行状态与结果。 */
export const AI_POSE_GENERATOR_HISTORY_LIMIT = 40;
/** 用户自定义保存的姿势预设上限。 */
export const AI_POSE_GENERATOR_SAVED_PRESETS_MAX = 12;
export const AI_POSE_GENERATOR_PRESET_LABEL_MAX = 24;

export function getAiPoseGeneratorSpec(): ToolSpec | undefined {
    return getToolById(AI_POSE_GENERATOR_TOOL_ID);
}

/* ------------------------------------------------------------------ *
 * 姿势库（结构化姿势约束）—— 从原站补充工具字段推出的姿势维度
 * ------------------------------------------------------------------ */

export type AiPoseCategory = { id: string; label: string; hint: string };

export const AI_POSE_GENERATOR_CATEGORIES: readonly AiPoseCategory[] = [
    { id: "standing", label: "站姿", hint: "正面 / 侧面 / 背面 / 倚靠" },
    { id: "sitting", label: "坐姿", hint: "凳上 / 地面 / 椅上" },
    { id: "motion", label: "动态", hint: "行走 / 跑动 / 转身" },
    { id: "detail", label: "手部与镜头", hint: "手部动作 / 视线 / 景别" },
] as const;

export type AiPosePreset = {
    id: string;
    categoryId: string;
    label: string;
    /** 送给 provider 的英文姿势指令（结构化，不靠用户措辞发挥）。 */
    instruction: string;
    /** 预览用中文说明，不参与请求。 */
    hint: string;
};

export const AI_POSE_GENERATOR_PRESETS: readonly AiPosePreset[] = [
    {
        id: "stand-front",
        categoryId: "standing",
        label: "正面站姿",
        instruction: "standing straight and facing the camera, arms relaxed at the sides, feet shoulder-width apart, full body visible head to toe",
        hint: "标准商品图站姿，肩线正对镜头",
    },
    {
        id: "stand-three-quarter",
        categoryId: "standing",
        label: "3/4 侧身",
        instruction: "standing at a three-quarter angle to the camera, weight on the back leg, one hand resting lightly on the hip",
        hint: "显瘦角度，适合连衣裙/外套",
    },
    {
        id: "stand-back",
        categoryId: "standing",
        label: "背面回眸",
        instruction: "standing with the back to the camera and looking back over the shoulder, arms relaxed",
        hint: "展示背部剪裁与版型",
    },
    {
        id: "stand-lean-wall",
        categoryId: "standing",
        label: "倚墙",
        instruction: "leaning against a plain wall with one foot resting against it, arms crossed loosely at the chest",
        hint: "城市/街头氛围",
    },
    {
        id: "sit-stool",
        categoryId: "sitting",
        label: "高凳坐姿",
        instruction: "sitting upright on a backless stool, knees together, hands resting on the thighs, both feet touching the ground",
        hint: "露出裤装/裙摆线条",
    },
    {
        id: "sit-floor-cross",
        categoryId: "sitting",
        label: "地面盘坐",
        instruction: "sitting cross-legged on the floor, hands resting on the knees, back straight, facing the camera",
        hint: "休闲/家居场景",
    },
    {
        id: "sit-chair-cross",
        categoryId: "sitting",
        label: "翘腿坐姿",
        instruction: "sitting on the edge of a chair with legs crossed at the knee, leaning slightly forward, forearms on the knee",
        hint: "通勤/office 氛围",
    },
    {
        id: "walk",
        categoryId: "motion",
        label: "行走中",
        instruction: "walking forward mid-stride toward the camera, arms swinging naturally, one heel lifting off the ground",
        hint: "动态感，适合风衣/裤装",
    },
    {
        id: "run",
        categoryId: "motion",
        label: "轻跑",
        instruction: "jogging lightly with one foot off the ground, elbows bent and pumping, clothing following the motion",
        hint: "运动线，强调面料弹动",
    },
    {
        id: "turn",
        categoryId: "motion",
        label: "转身瞬间",
        instruction: "captured mid-turn, torso rotating away from the camera while the head turns back, hair and hem following the motion",
        hint: "裙摆/长发飘动",
    },
    {
        id: "hand-pocket",
        categoryId: "detail",
        label: "手插口袋",
        instruction: "one hand in the pocket and the other holding a small prop at chest height, standing still and facing the camera",
        hint: "强调口袋与手部细节",
    },
    {
        id: "hand-face",
        categoryId: "detail",
        label: "手抚面颊",
        instruction: "one hand raised to the face with relaxed fingers near the cheek, the other arm hanging down, looking into the lens",
        hint: "美妆/饰品特写",
    },
];

const PRESET_BY_ID = new Map(AI_POSE_GENERATOR_PRESETS.map((preset) => [preset.id, preset]));

export function aiPosePresets(categoryId: string | null = null): AiPosePreset[] {
    if (!categoryId) return [...AI_POSE_GENERATOR_PRESETS];
    return AI_POSE_GENERATOR_PRESETS.filter((preset) => preset.categoryId === categoryId);
}

export function findAiPosePreset(presetId: string): AiPosePreset | undefined {
    return PRESET_BY_ID.get(presetId);
}

/* ------------------------------------------------------------------ *
 * 工作区状态
 * ------------------------------------------------------------------ */

export type AiPoseScene = {
    /** 场景 id 稳定可复用：重试同一场景复用同一个 id。 */
    id: string;
    text: string;
};

export type AiPoseSavedPreset = {
    id: string;
    label: string;
    posePrompt: string;
    /** 保存时的场景快照（只存文本，恢复时重建 id）。 */
    scenes: string[];
    savedAt: number;
};

/** 历史只记录可编辑配置，不含运行状态/结果/上传。 */
type AiPoseEditableState = {
    posePrompt: string;
    scenes: AiPoseScene[];
    selectedPresetIds: string[];
    savedPresets: AiPoseSavedPreset[];
    outputNum: number;
};

export type AiPoseGeneratorWorkspace = AiPoseEditableState & {
    history: { past: AiPoseEditableState[]; future: AiPoseEditableState[] };
};

export type AiPoseGeneratorInit = Partial<AiPoseEditableState>;

let sceneSeq = 0;

/** 场景 id：可注入确定性工厂（测试用），默认自增 + 随机后缀，避免与恢复的草稿撞车。 */
export function newAiPoseSceneId(): string {
    sceneSeq += 1;
    return `scene-${Date.now().toString(36)}-${sceneSeq}`;
}

export function createAiPoseGeneratorWorkspace(init: AiPoseGeneratorInit = {}): AiPoseGeneratorWorkspace {
    const outputNum = clampOutputNum(init.outputNum);
    return {
        posePrompt: (init.posePrompt ?? "").slice(0, AI_POSE_GENERATOR_PROMPT_MAX),
        scenes: (init.scenes ?? []).map((scene) => ({ id: scene.id || newAiPoseSceneId(), text: scene.text.slice(0, AI_POSE_GENERATOR_SCENE_MAX) })),
        selectedPresetIds: [...(init.selectedPresetIds ?? [])].filter((id) => PRESET_BY_ID.has(id)),
        savedPresets: (init.savedPresets ?? []).slice(0, AI_POSE_GENERATOR_SAVED_PRESETS_MAX),
        outputNum,
        history: { past: [], future: [] },
    };
}

export function clampOutputNum(value: unknown): number {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) return AI_POSE_GENERATOR_DEFAULT_OUTPUT;
    return Math.min(AI_POSE_GENERATOR_MAX_OUTPUT, Math.max(AI_POSE_GENERATOR_MIN_OUTPUT, Math.round(numeric)));
}

function editableOf(workspace: AiPoseGeneratorWorkspace): AiPoseEditableState {
    return {
        posePrompt: workspace.posePrompt,
        scenes: workspace.scenes.map((scene) => ({ ...scene })),
        selectedPresetIds: [...workspace.selectedPresetIds],
        savedPresets: workspace.savedPresets.map((preset) => ({ ...preset, scenes: [...preset.scenes] })),
        outputNum: workspace.outputNum,
    };
}

/** 每次编辑都推入历史；撤销/重做按快照回放，不重算任何派生状态。 */
function withEdit(workspace: AiPoseGeneratorWorkspace, patch: Partial<AiPoseEditableState>): AiPoseGeneratorWorkspace {
    const past = [...workspace.history.past, editableOf(workspace)].slice(-AI_POSE_GENERATOR_HISTORY_LIMIT);
    return { ...workspace, ...patch, history: { past, future: [] } };
}

export function setAiPosePrompt(workspace: AiPoseGeneratorWorkspace, posePrompt: string): AiPoseGeneratorWorkspace {
    const next = posePrompt.slice(0, AI_POSE_GENERATOR_PROMPT_MAX);
    if (next === workspace.posePrompt) return workspace;
    return withEdit(workspace, { posePrompt: next });
}

export function toggleAiPosePreset(workspace: AiPoseGeneratorWorkspace, presetId: string): AiPoseGeneratorWorkspace {
    if (!PRESET_BY_ID.has(presetId)) return workspace;
    const selected = workspace.selectedPresetIds.includes(presetId)
        ? workspace.selectedPresetIds.filter((id) => id !== presetId)
        : [...workspace.selectedPresetIds, presetId];
    return withEdit(workspace, { selectedPresetIds: selected });
}

export function clearAiPosePresets(workspace: AiPoseGeneratorWorkspace): AiPoseGeneratorWorkspace {
    if (workspace.selectedPresetIds.length === 0) return workspace;
    return withEdit(workspace, { selectedPresetIds: [] });
}

export function addAiPoseScene(workspace: AiPoseGeneratorWorkspace, text = ""): AiPoseGeneratorWorkspace {
    if (workspace.scenes.length >= AI_POSE_GENERATOR_SCENES_MAX) return workspace;
    return withEdit(workspace, { scenes: [...workspace.scenes, { id: newAiPoseSceneId(), text: text.slice(0, AI_POSE_GENERATOR_SCENE_MAX) }] });
}

export function updateAiPoseScene(workspace: AiPoseGeneratorWorkspace, sceneId: string, text: string): AiPoseGeneratorWorkspace {
    const next = text.slice(0, AI_POSE_GENERATOR_SCENE_MAX);
    if (!workspace.scenes.some((scene) => scene.id === sceneId && scene.text !== next)) return workspace;
    return withEdit(workspace, {
        scenes: workspace.scenes.map((scene) => (scene.id === sceneId ? { ...scene, text: next } : scene)),
    });
}

export function removeAiPoseScene(workspace: AiPoseGeneratorWorkspace, sceneId: string): AiPoseGeneratorWorkspace {
    if (!workspace.scenes.some((scene) => scene.id === sceneId)) return workspace;
    return withEdit(workspace, { scenes: workspace.scenes.filter((scene) => scene.id !== sceneId) });
}

/** 场景顺序会改变「场景 → 单元」的对应关系，所以必须可调。 */
export function moveAiPoseScene(workspace: AiPoseGeneratorWorkspace, sceneId: string, delta: number): AiPoseGeneratorWorkspace {
    const index = workspace.scenes.findIndex((scene) => scene.id === sceneId);
    if (index < 0) return workspace;
    const target = index + delta;
    if (target < 0 || target >= workspace.scenes.length) return workspace;
    const scenes = [...workspace.scenes];
    const [moved] = scenes.splice(index, 1);
    scenes.splice(target, 0, moved!);
    return withEdit(workspace, { scenes });
}

export function setAiPoseOutputNum(workspace: AiPoseGeneratorWorkspace, outputNum: number): AiPoseGeneratorWorkspace {
    const next = clampOutputNum(outputNum);
    if (next === workspace.outputNum) return workspace;
    return withEdit(workspace, { outputNum: next });
}

/* ------------------------------------------------------------------ *
 * 可保存的姿势预设（本页「保存姿势预设」）
 * ------------------------------------------------------------------ */

export function saveAiPosePreset(workspace: AiPoseGeneratorWorkspace, label: string, now = Date.now()): AiPoseGeneratorWorkspace {
    const trimmed = label.trim().slice(0, AI_POSE_GENERATOR_PRESET_LABEL_MAX);
    if (!trimmed) return workspace;
    const preset: AiPoseSavedPreset = {
        id: `saved-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        label: trimmed,
        posePrompt: workspace.posePrompt,
        scenes: workspace.scenes.map((scene) => scene.text),
        savedAt: now,
    };
    const savedPresets = [...workspace.savedPresets, preset].slice(-AI_POSE_GENERATOR_SAVED_PRESETS_MAX);
    return withEdit(workspace, { savedPresets });
}

export function removeAiPosePreset(workspace: AiPoseGeneratorWorkspace, presetId: string): AiPoseGeneratorWorkspace {
    if (!workspace.savedPresets.some((preset) => preset.id === presetId)) return workspace;
    return withEdit(workspace, { savedPresets: workspace.savedPresets.filter((preset) => preset.id !== presetId) });
}

/** 应用已保存预设：覆盖姿势描述与场景列表（覆盖是有意的，且可撤销）。 */
export function applyAiPosePreset(workspace: AiPoseGeneratorWorkspace, presetId: string): AiPoseGeneratorWorkspace {
    const preset = workspace.savedPresets.find((item) => item.id === presetId);
    if (!preset) return workspace;
    return withEdit(workspace, {
        posePrompt: preset.posePrompt,
        scenes: preset.scenes.map((text) => ({ id: newAiPoseSceneId(), text })),
    });
}

/* ------------------------------------------------------------------ *
 * 撤销 / 重做
 * ------------------------------------------------------------------ */

export function aiPoseHistoryLabel(workspace: AiPoseGeneratorWorkspace): { canUndo: boolean; canRedo: boolean } {
    return { canUndo: workspace.history.past.length > 0, canRedo: workspace.history.future.length > 0 };
}

export function undoAiPoseEdit(workspace: AiPoseGeneratorWorkspace): AiPoseGeneratorWorkspace {
    const past = workspace.history.past;
    if (past.length === 0) return workspace;
    const previous = past[past.length - 1]!;
    return {
        ...workspace,
        ...previous,
        history: { past: past.slice(0, -1), future: [editableOf(workspace), ...workspace.history.future].slice(0, AI_POSE_GENERATOR_HISTORY_LIMIT) },
    };
}

export function redoAiPoseEdit(workspace: AiPoseGeneratorWorkspace): AiPoseGeneratorWorkspace {
    const future = workspace.history.future;
    if (future.length === 0) return workspace;
    const next = future[0]!;
    return {
        ...workspace,
        ...next,
        history: { past: [...workspace.history.past, editableOf(workspace)].slice(-AI_POSE_GENERATOR_HISTORY_LIMIT), future: future.slice(1) },
    };
}

/* ------------------------------------------------------------------ *
 * 计划：场景 → 单元（每场景 outputNum 张）
 * ------------------------------------------------------------------ */

export type AiPosePlanScene = { id: string; label: string; text: string };

export type AiPoseGeneratorPlan = {
    scenes: AiPosePlanScene[];
    /** 每个场景要生成的张数。 */
    counts: number[];
    total: number;
};

/**
 * 没有场景时按 1 个「默认场景」出图（不是空计划），这样纯姿势描述也能生成；
 * 有场景时每个场景各自出 outputNum 张，总产出 = 场景数 × 张数。
 */
export function resolveAiPoseGeneratorPlan(workspace: AiPoseGeneratorWorkspace): AiPoseGeneratorPlan {
    const scenes: AiPosePlanScene[] =
        workspace.scenes.length === 0
            ? [{ id: "default", label: "默认场景", text: "" }]
            : workspace.scenes.map((scene, index) => ({
                  id: scene.id,
                  label: scene.text.trim() ? `场景 ${index + 1} · ${scene.text.trim().replace(/\s+/g, " ").slice(0, 14)}` : `场景 ${index + 1}`,
                  text: scene.text,
              }));
    const counts = scenes.map(() => workspace.outputNum);
    return { scenes, counts, total: counts.reduce((sum, count) => sum + count, 0) };
}

/* ------------------------------------------------------------------ *
 * prompt 合成：姿势约束优先，场景只能约束环境
 * ------------------------------------------------------------------ */

export const AI_POSE_SCENE_CONFLICT_PATTERN =
    /(change|different|another)\s+(the\s+)?pose|换个?姿势|改变?姿势|调整?姿势|改成?(坐|站|躺|蹲|跪)|sitting\s+down|lying\s+down|kneel/i;

/** 场景描述里出现改写姿势的字眼 → 明确拦截（场景不能覆盖姿势约束）。 */
export function aiPoseSceneConflicts(text: string): boolean {
    return AI_POSE_SCENE_CONFLICT_PATTERN.test(text);
}

export function buildAiPoseGeneratorPrompt(
    workspace: AiPoseGeneratorWorkspace,
    sceneText = "",
): string {
    const lines: string[] = [];
    lines.push("Create a full-body pose reference photo of a single fashion model.");
    const posePrompt = workspace.posePrompt.trim();
    const presetInstructions = workspace.selectedPresetIds
        .map((id) => PRESET_BY_ID.get(id)?.instruction)
        .filter((instruction): instruction is string => Boolean(instruction));
    if (posePrompt) lines.push(`Pose: ${posePrompt}`);
    if (presetInstructions.length > 0) lines.push(`Additional pose constraints: ${presetInstructions.join("; ")}.`);
    if (!posePrompt && presetInstructions.length === 0) {
        lines.push("Pose: natural, relaxed standing pose, full body visible.");
    }
    lines.push("Framing: head to toe, 50mm lens, eye level, single subject, no crop.");
    const scene = sceneText.trim();
    if (scene) {
        lines.push(`Scene directives (environment, props, background and lighting only): ${scene}`);
    } else {
        lines.push("Scene directives: plain studio backdrop, soft even lighting, neutral floor.");
    }
    lines.push(
        "Hard rule: scene directives must never change the body pose, limb positions, head angle or the direction the model faces.",
    );
    lines.push("Keep wardrobe and body proportions consistent; photorealistic, sharp focus, no text, no watermark, no collage.");
    return lines.join(" ");
}

/* ------------------------------------------------------------------ *
 * 校验
 * ------------------------------------------------------------------ */

export type AiPoseGeneratorIssueCode =
    | "pose-prompt-empty"
    | "pose-prompt-too-long"
    | "scene-empty"
    | "scene-too-long"
    | "scene-too-many"
    | "scene-overrides-pose"
    | "output-num"
    | "image-budget";

export type AiPoseGeneratorIssue = { code: AiPoseGeneratorIssueCode; message: string };

export function validateAiPoseGeneratorWorkspace(workspace: AiPoseGeneratorWorkspace): AiPoseGeneratorIssue[] {
    const issues: AiPoseGeneratorIssue[] = [];
    if (!workspace.posePrompt.trim()) {
        issues.push({ code: "pose-prompt-empty", message: "请先填写姿势描述（无姿势描述不能生成）" });
    } else if (workspace.posePrompt.length > AI_POSE_GENERATOR_PROMPT_MAX) {
        issues.push({ code: "pose-prompt-too-long", message: `姿势描述最多 ${AI_POSE_GENERATOR_PROMPT_MAX} 字` });
    }

    if (workspace.scenes.length > AI_POSE_GENERATOR_SCENES_MAX) {
        issues.push({ code: "scene-too-many", message: `场景最多 ${AI_POSE_GENERATOR_SCENES_MAX} 条（当前 ${workspace.scenes.length}）` });
    }
    workspace.scenes.forEach((scene, index) => {
        if (!scene.text.trim()) issues.push({ code: "scene-empty", message: `场景 ${index + 1} 内容为空，请补充或删除该条` });
        if (scene.text.length > AI_POSE_GENERATOR_SCENE_MAX) {
            issues.push({ code: "scene-too-long", message: `场景 ${index + 1} 超过 ${AI_POSE_GENERATOR_SCENE_MAX} 字` });
        }
        if (aiPoseSceneConflicts(scene.text)) {
            issues.push({
                code: "scene-overrides-pose",
                message: `场景 ${index + 1} 里出现改写姿势的措辞，场景只能描述环境/光线/道具，请删除相关描述`,
            });
        }
    });

    if (!Number.isInteger(workspace.outputNum) || workspace.outputNum < AI_POSE_GENERATOR_MIN_OUTPUT || workspace.outputNum > AI_POSE_GENERATOR_MAX_OUTPUT) {
        issues.push({
            code: "output-num",
            message: `每个场景张数需在 ${AI_POSE_GENERATOR_MIN_OUTPUT}–${AI_POSE_GENERATOR_MAX_OUTPUT} 之间（当前 ${workspace.outputNum}）`,
        });
    } else {
        const total = resolveAiPoseGeneratorPlan(workspace).total;
        if (total > AI_POSE_GENERATOR_MAX_IMAGES) {
            issues.push({ code: "image-budget", message: `总产出 ${total} 张超过上限 ${AI_POSE_GENERATOR_MAX_IMAGES}` });
        }
    }

    return issues;
}

/* ------------------------------------------------------------------ *
 * 字段合成（prompt + scenePrompts，一个都不能少）
 * ------------------------------------------------------------------ */

export type AiPoseGeneratorFieldMap = {
    prompt: string;
    scenePrompts: string[];
};

export function composeAiPoseGeneratorFields(
    workspace: AiPoseGeneratorWorkspace,
    options: { promptOverride?: string; sceneText?: string; scenePrompts?: readonly string[] } = {},
): AiPoseGeneratorFieldMap {
    const sceneText = options.sceneText ?? workspace.scenes[0]?.text ?? "";
    const scenePrompts = options.scenePrompts ?? workspace.scenes.map((scene) => scene.text);
    return {
        prompt: options.promptOverride ?? buildAiPoseGeneratorPrompt(workspace, sceneText),
        scenePrompts: [...scenePrompts],
    };
}

/** 字段守卫：返回缺失/非法字段名（禁止静默丢参）。 */
export function auditAiPoseGeneratorFields(fields: Record<string, unknown>): string[] {
    const missing: string[] = [];
    for (const key of AI_POSE_GENERATOR_FIELD_KEYS) {
        const value = fields[key];
        if (value === undefined || value === null) {
            missing.push(key);
            continue;
        }
        if (key === "prompt") {
            if (typeof value !== "string" || !value.trim()) missing.push(key);
            continue;
        }
        if (key === "scenePrompts") {
            if (!Array.isArray(value)) {
                missing.push(key);
                continue;
            }
            if (value.some((item) => typeof item !== "string")) missing.push(key);
        }
    }
    return missing;
}

/* ------------------------------------------------------------------ *
 * 快照（提交锁定 + 旧版本标记）
 * ------------------------------------------------------------------ */

export type AiPoseGeneratorSnapshot = {
    posePrompt: string;
    presetIds: string[];
    scenes: string[];
    outputNum: number;
    counts: number[];
};

export function buildAiPoseGeneratorSnapshot(workspace: AiPoseGeneratorWorkspace): AiPoseGeneratorSnapshot {
    const plan = resolveAiPoseGeneratorPlan(workspace);
    return {
        posePrompt: workspace.posePrompt,
        presetIds: [...workspace.selectedPresetIds],
        scenes: plan.scenes.map((scene) => scene.text),
        outputNum: workspace.outputNum,
        counts: plan.counts,
    };
}

/** 稳定指纹：影响请求结果的输入全部入哈希，场景顺序敏感。 */
export function aiPoseGeneratorSnapshotHash(workspace: AiPoseGeneratorWorkspace): string {
    return aiPoseGeneratorSnapshotHashOf(buildAiPoseGeneratorSnapshot(workspace));
}

/** 对已冻结的快照算指纹（适配器复用，保证与页面同一算法）。 */
export function aiPoseGeneratorSnapshotHashOf(snapshot: AiPoseGeneratorSnapshot): string {
    const canonical = JSON.stringify(snapshot);
    let hash = 2166136261;
    for (let index = 0; index < canonical.length; index += 1) {
        hash ^= canonical.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `ag_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function isAiPoseGeneratorResultStale(submittedHash: string | null, workspace: AiPoseGeneratorWorkspace): boolean {
    if (!submittedHash) return false;
    return submittedHash !== aiPoseGeneratorSnapshotHash(workspace);
}

/* ------------------------------------------------------------------ *
 * 草稿往返（刷新/切页都不丢配置）
 * ------------------------------------------------------------------ */

export function serializeAiPoseGeneratorDraftValues(workspace: AiPoseGeneratorWorkspace): Record<string, unknown> {
    return {
        posePrompt: workspace.posePrompt,
        scenes: workspace.scenes.map((scene) => ({ id: scene.id, text: scene.text })),
        selectedPresetIds: [...workspace.selectedPresetIds],
        savedPresets: workspace.savedPresets.map((preset) => ({ ...preset, scenes: [...preset.scenes] })),
        outputNum: workspace.outputNum,
    };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

export function parseAiPoseGeneratorDraftValues(raw: unknown): AiPoseGeneratorWorkspace | null {
    if (!isRecord(raw)) return null;

    const posePrompt = typeof raw.posePrompt === "string" ? raw.posePrompt.slice(0, AI_POSE_GENERATOR_PROMPT_MAX) : "";
    const scenes = Array.isArray(raw.scenes)
        ? raw.scenes
              .map((item) => {
                  if (typeof item === "string") return { id: newAiPoseSceneId(), text: item.slice(0, AI_POSE_GENERATOR_SCENE_MAX) };
                  if (!isRecord(item)) return null;
                  return {
                      id: typeof item.id === "string" && item.id ? item.id : newAiPoseSceneId(),
                      text: typeof item.text === "string" ? item.text.slice(0, AI_POSE_GENERATOR_SCENE_MAX) : "",
                  };
              })
              .filter((item): item is AiPoseScene => item !== null)
              .slice(0, AI_POSE_GENERATOR_SCENES_MAX)
        : [];
    const selectedPresetIds = Array.isArray(raw.selectedPresetIds)
        ? raw.selectedPresetIds.filter((id): id is string => typeof id === "string" && PRESET_BY_ID.has(id))
        : [];
    const savedPresets = Array.isArray(raw.savedPresets)
        ? raw.savedPresets
              .filter(isRecord)
              .map((item) => ({
                  id: typeof item.id === "string" ? item.id : `saved-${Math.random().toString(36).slice(2, 8)}`,
                  label: typeof item.label === "string" ? item.label.slice(0, AI_POSE_GENERATOR_PRESET_LABEL_MAX) : "",
                  posePrompt: typeof item.posePrompt === "string" ? item.posePrompt.slice(0, AI_POSE_GENERATOR_PROMPT_MAX) : "",
                  scenes: Array.isArray(item.scenes)
                      ? item.scenes.filter((text): text is string => typeof text === "string").slice(0, AI_POSE_GENERATOR_SCENES_MAX)
                      : [],
                  savedAt: typeof item.savedAt === "number" ? item.savedAt : 0,
              }))
              .filter((preset) => preset.label.length > 0)
              .slice(0, AI_POSE_GENERATOR_SAVED_PRESETS_MAX)
        : [];

    const hasContent = Boolean(posePrompt.trim()) || scenes.length > 0 || savedPresets.length > 0;
    if (!hasContent) return null;

    return createAiPoseGeneratorWorkspace({
        posePrompt,
        scenes,
        selectedPresetIds,
        savedPresets,
        outputNum: typeof raw.outputNum === "number" ? raw.outputNum : undefined,
    });
}

/** 字段规格自检：注册表字段必须与页面契约一一对应（供测试与诊断使用）。 */
export function aiPoseGeneratorFieldSpecs(): FieldSpec[] {
    return getAiPoseGeneratorSpec()?.fields ?? [];
}
