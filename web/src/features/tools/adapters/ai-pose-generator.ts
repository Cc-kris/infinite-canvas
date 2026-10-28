/**
 * TASK-033：AI_POSE_GENERATOR「AI 姿势生成」适配器（真实 provider 边界，无演示成功）。
 *
 * 一次生成 = **每个场景一个独立的真实图像生成请求**：
 *  - 本页没有源图，只有 prompt + scenePrompts（文字 → 姿势参考图）；
 *  - 一个场景 × outputNum 张，总请求数 = 场景数（无场景时按 1 个默认场景）；
 *  - 场景之间互不影响：某场景失败只重试该场景，成功的场景不会重复生成；
 *  - 上游返回成功但没有图 → failed(empty-result)，绝不补图、不造假成功。
 *
 * 与 AI_POSTURE（TASK-027）的区别：姿势裂变从既有模特图出发，按姿势库出图；
 * 本页从文字出发，场景是「环境/光线/道具」约束，不得改写姿势（见 registry 的冲突词拦截）。
 */

import type { BrowserToolInput } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";

import {
    AI_POSE_GENERATOR_MAX_OUTPUT,
    AI_POSE_GENERATOR_TOOL_ID,
    AI_POSE_SCENE_CONFLICT_PATTERN,
    aiPoseGeneratorSnapshotHashOf,
    auditAiPoseGeneratorFields,
    buildAiPoseGeneratorPrompt,
    buildAiPoseGeneratorSnapshot,
    getAiPoseGeneratorSpec,
    resolveAiPoseGeneratorPlan,
    validateAiPoseGeneratorWorkspace,
    type AiPoseGeneratorFieldMap,
    type AiPoseGeneratorSnapshot,
    type AiPoseGeneratorWorkspace,
} from "@/features/tools/registry/ai-pose-generator";

/* ------------------------------------------------------------------ *
 * 错误
 * ------------------------------------------------------------------ */

export type AiPoseGeneratorAdapterErrorCode =
    | "invalid-input"
    | "tool-mismatch"
    | "prompt-missing"
    | "scene-invalid"
    | "scene-overrides-pose"
    | "fields-missing"
    | "count-invalid"
    | "plan-mismatch"
    | "validation-failed";

export class AiPoseGeneratorAdapterError extends Error {
    readonly code: AiPoseGeneratorAdapterErrorCode;

    constructor(code: AiPoseGeneratorAdapterErrorCode, message: string) {
        super(`${code}: ${message}`);
        this.name = "AiPoseGeneratorAdapterError";
        this.code = code;
    }
}

/* ------------------------------------------------------------------ *
 * 单元：一个场景 × N 张
 * ------------------------------------------------------------------ */

export type AiPoseGeneratorUnit = {
    /** 单元 id：同一场景的重试复用同一个 id，结果归到同一组。 */
    id: string;
    sceneId: string;
    sceneLabel: string;
    /** 该场景要生成的张数（1–4）。 */
    count: number;
    prompt: string;
    fields: AiPoseGeneratorFieldMap;
    snapshot: AiPoseGeneratorSnapshot;
    snapshotHash: string;
    clientOperationId: string;
};

export function aiPoseGeneratorUnitId(sceneId: string): string {
    return `${AI_POSE_GENERATOR_TOOL_ID.toLowerCase()}-${sceneId}`;
}

export type BuildAiPoseGeneratorUnitOptions = {
    workspace: AiPoseGeneratorWorkspace;
    scene: { id: string; label: string; text: string };
    count: number;
    clientOperationId: string;
};

/** 单元快照只描述「本次请求真正带着什么」，结果可严格对回提交时配置。 */
export function buildAiPoseGeneratorUnit(options: BuildAiPoseGeneratorUnitOptions): AiPoseGeneratorUnit {
    const { workspace, scene } = options;
    const count = Math.round(options.count);
    if (!Number.isInteger(count) || count < 1 || count > AI_POSE_GENERATOR_MAX_OUTPUT) {
        throw new AiPoseGeneratorAdapterError(
            "count-invalid",
            `场景「${scene.label}」张数需在 1–${AI_POSE_GENERATOR_MAX_OUTPUT} 之间（当前 ${options.count}）`,
        );
    }
    if (!workspace.posePrompt.trim()) {
        throw new AiPoseGeneratorAdapterError("prompt-missing", "姿势描述为空，无法生成");
    }
    if (AI_POSE_SCENE_CONFLICT_PATTERN.test(scene.text)) {
        throw new AiPoseGeneratorAdapterError(
            "scene-overrides-pose",
            `场景「${scene.label}」里出现改写姿势的措辞，场景只能描述环境/光线/道具`,
        );
    }

    const prompt = buildAiPoseGeneratorPrompt(workspace, scene.text);
    const snapshot = buildAiPoseGeneratorSnapshot(workspace);
    const fields: AiPoseGeneratorFieldMap = {
        prompt,
        scenePrompts: snapshot.scenes,
    };

    return {
        id: aiPoseGeneratorUnitId(scene.id),
        sceneId: scene.id,
        sceneLabel: scene.label,
        count,
        prompt,
        fields,
        snapshot,
        snapshotHash: aiPoseGeneratorSnapshotHashOf(snapshot),
        clientOperationId: options.clientOperationId,
    };
}

/* ------------------------------------------------------------------ *
 * 计划：场景 → 单元
 * ------------------------------------------------------------------ */

export type AiPoseGeneratorPlanOptions = {
    workspace: AiPoseGeneratorWorkspace;
    /** 客户端操作 id 工厂，测试可注入确定性实现。 */
    nextClientOperationId: () => string;
};

export function planAiPoseGeneratorUnits(options: AiPoseGeneratorPlanOptions): AiPoseGeneratorUnit[] {
    const plan = resolveAiPoseGeneratorPlan(options.workspace);
    return plan.scenes.map((scene, index) =>
        buildAiPoseGeneratorUnit({
            workspace: options.workspace,
            scene,
            count: plan.counts[index] ?? 1,
            clientOperationId: options.nextClientOperationId(),
        }),
    );
}

/** 计划自检：单元数/张数合计必须与页面显示的总产出一致，否则禁止提交。 */
export function assertAiPoseGeneratorPlan(
    units: readonly AiPoseGeneratorUnit[],
    expected: { scenes: number; outputNum: number; total: number },
): void {
    const problems: string[] = [];
    if (units.length === 0) problems.push("计划为空：没有可提交的场景单元");
    if (units.length !== expected.scenes) problems.push(`单元数 ${units.length} ≠ 场景数 ${expected.scenes}`);
    const total = units.reduce((sum, unit) => sum + unit.count, 0);
    if (total !== expected.total) problems.push(`单元张数合计 ${total} ≠ 总产出 ${expected.total}`);
    for (const unit of units) {
        if (unit.count !== expected.outputNum) problems.push(`单元「${unit.sceneLabel}」张数 ${unit.count} ≠ 每场景张数 ${expected.outputNum}`);
        if (!unit.prompt.trim()) problems.push(`单元「${unit.sceneLabel}」prompt 为空`);
        const missing = auditAiPoseGeneratorFields(unit.fields as unknown as Record<string, unknown>);
        if (missing.length > 0) problems.push(`单元「${unit.sceneLabel}」丢参：${missing.join(", ")}`);
        if (unit.snapshot.scenes.length !== expected.scenes) {
            problems.push(`单元「${unit.sceneLabel}」快照场景数 ${unit.snapshot.scenes.length} ≠ ${expected.scenes}`);
        }
    }
    if (problems.length > 0) {
        throw new AiPoseGeneratorAdapterError("plan-mismatch", problems.join("；"));
    }
}

/* ------------------------------------------------------------------ *
 * 请求构造 + 守卫
 * ------------------------------------------------------------------ */

export function buildAiPoseGeneratorInput(
    unit: AiPoseGeneratorUnit,
    options: { draftRevision?: number | string | null } = {},
): BrowserToolInput {
    return {
        toolId: AI_POSE_GENERATOR_TOOL_ID,
        prompt: unit.prompt,
        count: unit.count,
        // 本页无源图：references 显式为空，不伪造参考图。
        references: [],
        fields: {
            prompt: unit.fields.prompt,
            scenePrompts: unit.fields.scenePrompts,
            sceneId: unit.sceneId,
            draftRevision: options.draftRevision ?? null,
        },
    } as BrowserToolInput;
}

/** 请求守卫：工具必须匹配、字段必须齐全、张数必须合法（禁止静默丢参）。 */
export function assertAiPoseGeneratorInput(input: BrowserToolInput): void {
    if (input.toolId !== AI_POSE_GENERATOR_TOOL_ID) {
        throw new AiPoseGeneratorAdapterError("tool-mismatch", `工具不匹配：${input.toolId} ≠ ${AI_POSE_GENERATOR_TOOL_ID}`);
    }
    const prompt = (input as { prompt?: unknown }).prompt;
    if (typeof prompt !== "string" || !prompt.trim()) {
        throw new AiPoseGeneratorAdapterError("prompt-missing", "发送前 prompt 为空");
    }
    const count = (input as { count?: unknown }).count;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > AI_POSE_GENERATOR_MAX_OUTPUT) {
        throw new AiPoseGeneratorAdapterError("count-invalid", `发送前张数非法：${String(count)}`);
    }
    const fields = (input as { fields?: Record<string, unknown> }).fields ?? {};
    const missing = auditAiPoseGeneratorFields(fields);
    if (missing.length > 0) {
        throw new AiPoseGeneratorAdapterError("fields-missing", `发送前字段不完整：${missing.join(", ")}`);
    }
    const scenes = fields.scenePrompts;
    if (Array.isArray(scenes) && scenes.some((text) => typeof text === "string" && AI_POSE_SCENE_CONFLICT_PATTERN.test(text))) {
        throw new AiPoseGeneratorAdapterError("scene-overrides-pose", "发送前检测到场景描述改写姿势");
    }
}

/** 工作区守卫：把页面校验结果原样变成适配器错误，避免 UI 绕过校验直接提交。 */
export function assertAiPoseGeneratorWorkspace(workspace: AiPoseGeneratorWorkspace): void {
    const issues = validateAiPoseGeneratorWorkspace(workspace);
    if (issues.length === 0) return;
    const code: AiPoseGeneratorAdapterErrorCode = issues.some((issue) => issue.code === "scene-overrides-pose")
        ? "scene-overrides-pose"
        : "validation-failed";
    throw new AiPoseGeneratorAdapterError(code, issues.map((issue) => issue.message).join("；"));
}

/* ------------------------------------------------------------------ *
 * 运行
 * ------------------------------------------------------------------ */

export type AiPoseGeneratorRunPort = {
    run(input: BrowserToolInput, options?: { signal?: AbortSignal; draftRevision?: number | string | null }): Promise<ToolTask>;
};

export type AiPoseGeneratorUnitOutcome = {
    unit: AiPoseGeneratorUnit;
    status: "succeeded" | "failed" | "cancelled" | "unknown";
    task?: ToolTask;
    images: { url?: string; dataUrl?: string }[];
    error?: { code: string; message: string };
};

/** 任务 → 单元结果。上游成功但无图 → failed(empty-result)，绝不补图。 */
export function aiPoseGeneratorOutcomeFromTask(unit: AiPoseGeneratorUnit, task: ToolTask): AiPoseGeneratorUnitOutcome {
    const base: AiPoseGeneratorUnitOutcome = { unit, status: "unknown", task, images: [] };
    const images = (task.result?.items ?? [])
        .filter((item) => item.kind === "image" && (item.dataUrl || item.url))
        .map((item) => ({ url: item.url, dataUrl: item.dataUrl }));

    if (task.status === "succeeded") {
        if (images.length === 0) {
            return {
                ...base,
                status: "failed",
                images,
                error: { code: "empty-result", message: `场景「${unit.sceneLabel}」返回成功但没有图片` },
            };
        }
        return { ...base, status: "succeeded", images };
    }
    if (task.status === "failed") {
        return {
            ...base,
            status: "failed",
            images,
            error: task.error
                ? { code: task.error.code, message: task.error.message }
                : { code: "task-failed", message: "任务失败（上游未给出原因）" },
        };
    }
    if (task.status === "cancelled") return { ...base, status: "cancelled", images, error: { code: "cancelled", message: "任务已取消" } };
    return {
        ...base,
        status: "unknown",
        images,
        error: { code: `task-${task.status}`, message: "任务状态未知，只能查询或人工确认，禁止盲目重提" },
    };
}

export async function runAiPoseGeneratorUnit(
    port: AiPoseGeneratorRunPort,
    unit: AiPoseGeneratorUnit,
    options: { draftRevision?: number | string | null; signal?: AbortSignal } = {},
): Promise<AiPoseGeneratorUnitOutcome> {
    const input = buildAiPoseGeneratorInput(unit, { draftRevision: options.draftRevision });
    assertAiPoseGeneratorInput(input);
    const task = await port.run(input, { signal: options.signal, draftRevision: options.draftRevision });
    return aiPoseGeneratorOutcomeFromTask(unit, task);
}

/** 单场景重试：复用同一份单元快照（同一 prompt/张数），不复制上次结果。 */
export async function retryAiPoseGeneratorUnit(
    port: AiPoseGeneratorRunPort,
    unit: AiPoseGeneratorUnit,
    options: { draftRevision?: number | string | null; signal?: AbortSignal } = {},
): Promise<AiPoseGeneratorUnitOutcome> {
    return runAiPoseGeneratorUnit(port, unit, options);
}

export type AiPoseGeneratorPlanRunOptions = {
    draftRevision?: number | string | null;
    signal?: AbortSignal;
    /** 每个单元结束回调一次：部分失败也能立刻看到成功组。 */
    onUnitOutcome?: (outcome: AiPoseGeneratorUnitOutcome, index: number) => void;
    /** 已成功的单元 id（上一次部分失败）——本次跳过，不重复生成。 */
    skipUnitIds?: readonly string[];
};

/**
 * 顺序执行计划（provider 侧有并发/配额限制，串行最稳）。
 * 单元失败不影响后续单元：这就是「部分失败」的真实语义。
 */
export async function runAiPoseGeneratorPlan(
    port: AiPoseGeneratorRunPort,
    units: readonly AiPoseGeneratorUnit[],
    options: AiPoseGeneratorPlanRunOptions = {},
): Promise<AiPoseGeneratorUnitOutcome[]> {
    const skip = new Set(options.skipUnitIds ?? []);
    const outcomes: AiPoseGeneratorUnitOutcome[] = [];
    for (const [index, unit] of units.entries()) {
        if (options.signal?.aborted) {
            outcomes.push({ unit, status: "cancelled", images: [], error: { code: "cancelled", message: "已取消" } });
            continue;
        }
        if (skip.has(unit.id)) continue;
        let outcome: AiPoseGeneratorUnitOutcome;
        try {
            outcome = await runAiPoseGeneratorUnit(port, unit, { draftRevision: options.draftRevision, signal: options.signal });
        } catch (error) {
            outcome = {
                unit,
                status: "failed",
                images: [],
                error: {
                    code: error instanceof AiPoseGeneratorAdapterError ? error.code : "submit-failed",
                    message: error instanceof Error ? error.message : String(error),
                },
            };
        }
        outcomes.push(outcome);
        options.onUnitOutcome?.(outcome, index);
    }
    return outcomes;
}

/** 只重试失败/未知的单元（成功的不重复生成）。 */
export function failedAiPoseGeneratorUnits(outcomes: readonly AiPoseGeneratorUnitOutcome[]): AiPoseGeneratorUnit[] {
    return outcomes.filter((outcome) => outcome.status === "failed" || outcome.status === "unknown").map((outcome) => outcome.unit);
}

/* ------------------------------------------------------------------ *
 * 结果视图（按场景分组 + 旧版本标记）
 * ------------------------------------------------------------------ */

export type AiPoseGeneratorResultViewItem = {
    sceneId: string;
    sceneLabel: string;
    url?: string;
    dataUrl?: string;
};

export type AiPoseGeneratorResultViewGroup = {
    sceneId: string;
    label: string;
    status: "idle" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";
    unitId: string;
    items: AiPoseGeneratorResultViewItem[];
    error?: { code: string; message: string };
    /** 该组结果相对当前配置是否过期（“来自旧版本”）。 */
    stale: boolean;
    canRetry: boolean;
};

export type AiPoseGeneratorResultView = {
    status: "idle" | "running" | "succeeded" | "failed" | "partial" | "cancelled" | "unknown";
    groups: AiPoseGeneratorResultViewGroup[];
    totalImages: number;
    stale: boolean;
    snapshotHash?: string;
};

export function aiPoseGeneratorResultView(options: {
    units: readonly AiPoseGeneratorUnit[];
    outcomes: readonly AiPoseGeneratorUnitOutcome[];
    currentHash?: string | null;
    running?: boolean;
}): AiPoseGeneratorResultView {
    const { units, outcomes, running } = options;
    if (units.length === 0) return { status: "idle", groups: [], totalImages: 0, stale: false };

    const byUnit = new Map(outcomes.map((outcome) => [outcome.unit.id, outcome]));
    const currentHash = options.currentHash ?? units[0]?.snapshotHash ?? null;

    const groups: AiPoseGeneratorResultViewGroup[] = units.map((unit) => {
        const outcome = byUnit.get(unit.id);
        if (!outcome) {
            return {
                sceneId: unit.sceneId,
                label: unit.sceneLabel,
                status: running ? "running" : "idle",
                unitId: unit.id,
                items: [],
                stale: false,
                canRetry: false,
            };
        }
        return {
            sceneId: unit.sceneId,
            label: unit.sceneLabel,
            status: outcome.status,
            unitId: unit.id,
            items: outcome.images.map((image) => ({
                sceneId: unit.sceneId,
                sceneLabel: unit.sceneLabel,
                url: image.url,
                dataUrl: image.dataUrl,
            })),
            error: outcome.error,
            stale: Boolean(currentHash) && currentHash !== unit.snapshotHash,
            canRetry: outcome.status === "failed" || outcome.status === "unknown",
        };
    });

    const totalImages = groups.reduce((sum, group) => sum + group.items.length, 0);
    const succeeded = groups.filter((group) => group.status === "succeeded").length;
    const failed = groups.filter((group) => group.status === "failed" || group.status === "unknown").length;
    const cancelled = groups.filter((group) => group.status === "cancelled").length;

    let status: AiPoseGeneratorResultView["status"];
    if (running) status = "running";
    else if (groups.every((group) => group.status === "succeeded")) status = "succeeded";
    else if (succeeded > 0 && failed > 0) status = "partial";
    else if (failed > 0) status = "failed";
    else if (cancelled > 0) status = "cancelled";
    else status = "idle";

    return {
        status,
        groups,
        totalImages,
        stale: groups.some((group) => group.stale),
        snapshotHash: currentHash ?? undefined,
    };
}

/**
 * 结果项 → 通用结果动作载荷（存入资产 / 发送画布 / 下载共用）。
 *
 * 结果区用自己的分组视图渲染，但落库/上画布必须走与 `ToolResult` 相同的载荷结构；
 * data URL 与远端 URL 只保留一个（`saveResultItemToAssets` 优先取 dataUrl）。
 */
export function aiPoseGeneratorResultItem(item: AiPoseGeneratorResultViewItem, index: number): ToolTaskResultItem {
    const id = `${AI_POSE_GENERATOR_TOOL_ID}-result-${index + 1}`;
    const dataUrl = item.dataUrl ?? (item.url?.startsWith("data:") ? item.url : undefined);
    const base: ToolTaskResultItem = { id, kind: "image", mimeType: "image/png" };
    return dataUrl ? { ...base, dataUrl } : { ...base, url: item.url };
}

/** 字段规格自检：注册表字段必须与请求字段一一对应（供测试与诊断使用）。 */
export function aiPoseGeneratorAdapterFieldKeys(): string[] {
    return (getAiPoseGeneratorSpec()?.fields ?? []).map((field) => field.key);
}
