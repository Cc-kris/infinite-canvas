/**
 * TASK-027：AI_POSTURE「姿势裂变」适配器（真实 provider 边界，无演示成功）。
 *
 * 一次姿势裂变 = **N 个独立的真实图像编辑请求**（N = 本次计划里的姿势数）：
 *  - 每个单元只带「同一张模特图」+ 一个结构化姿势指令（姿势库卡片 或 自定义文本）；
 *  - 张数按单元摊平（见 registry 的 distributePostureOutputs）：总产出精确等于 outputNum，
 *    不是把一个 count=N 的请求伪装成「N 种姿势」；
 *  - 单元之间互不影响：某个姿势失败只重试该单元，已成功的姿势不会重复生成；
 *  - 上游返回成功但没有图 → failed(empty-result)，绝不补图、不造假成功。
 *
 * 与 AI_POSE_GENERATOR（TASK-033，自由提示词生成姿势）的区别：本页的姿势来自
 * 姿势库结构化卡片或自定义文本，且必须做「按来源姿势分组 + 空选择自动裂变」。
 */

import type { BrowserToolInput, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask } from "@/services/api/tools/task-machine";
import type { ReferenceImage } from "@/types/image";

import {
    AI_POSTURE_TOOL_ID,
    AI_POSTURE_MAX_OUTPUT,
    AI_POSTURE_MIN_OUTPUT,
    AI_POSTURE_POSES,
    auditAiPostureFields,
    buildAiPosturePrompt,
    buildAiPostureSnapshot,
    composeAiPostureFields,
    distributePostureOutputs,
    resolveAiPosturePlan,
    validateAiPostureWorkspace,
    type AiPostureFieldMap,
    type AiPosturePose,
    type AiPostureSnapshot,
    type AiPostureWorkspace,
} from "@/features/tools/registry/ai-posture";

/* ------------------------------------------------------------------ *
 * 错误
 * ------------------------------------------------------------------ */

export type AiPostureAdapterErrorCode =
    | "invalid-input"
    | "tool-mismatch"
    | "reference-missing"
    | "prompt-missing"
    | "fields-missing"
    | "count-invalid"
    | "image-url-mismatch"
    | "pose-missing"
    | "validation-failed";

export class AiPostureAdapterError extends Error {
    readonly code: AiPostureAdapterErrorCode;

    constructor(code: AiPostureAdapterErrorCode, message: string) {
        super(`${code}: ${message}`);
        this.name = "AiPostureAdapterError";
        this.code = code;
    }
}

/* ------------------------------------------------------------------ *
 * 单元：一张模特图 × 一个姿势
 * ------------------------------------------------------------------ */

export type AiPostureSourceInput = {
    assetId: string;
    name: string;
    /** 本地可用的 data URL（真实发给 provider 的字节）。 */
    dataUrl: string;
    /** 资产库里的原始地址，只用于快照与 UI 预览。 */
    originUrl: string;
    width: number;
    height: number;
};

export type AiPostureUnit = {
    /** 单元 id：同一姿势的重试复用同一个 id，便于把结果归到同一组。 */
    id: string;
    poseId: string;
    poseLabel: string;
    /** 该姿势要生成的张数（≥1）。 */
    count: number;
    prompt: string;
    fields: AiPostureFieldMap;
    references: ReferenceImage[];
    snapshot: AiPostureSnapshot;
    snapshotHash: string;
    sourceUrl: string;
    clientOperationId: string;
};

export function aiPostureUnitId(poseId: string): string {
    return `${AI_POSTURE_TOOL_ID.toLowerCase()}-${poseId}`;
}

export type BuildAiPostureUnitOptions = {
    workspace: AiPostureWorkspace;
    source: AiPostureSourceInput;
    pose: AiPosturePose;
    count: number;
    clientOperationId: string;
};

/**
 * 生成一个可发送单元。这里的 snapshot 只描述「本次请求真正带着什么」，
 * 所以结果可以严格对回提交时的配置（旧版本标记依赖它）。
 */
export function buildAiPostureUnit(options: BuildAiPostureUnitOptions): AiPostureUnit {
    const { workspace, source, pose } = options;
    const count = Math.round(options.count);
    if (!Number.isInteger(count) || count < 1 || count > AI_POSTURE_MAX_OUTPUT) {
        throw new AiPostureAdapterError("count-invalid", `单元张数需在 1–${AI_POSTURE_MAX_OUTPUT} 之间（当前 ${options.count}）`);
    }
    if (!pose || !pose.id) throw new AiPostureAdapterError("pose-missing", "姿势单元缺少姿势标识");
    if (pose.id !== "custom" && !pose.instruction.trim()) {
        throw new AiPostureAdapterError("prompt-missing", `姿势「${pose.label}」没有可发送的姿势指令`);
    }
    if (pose.id === "custom" && !pose.instruction.trim()) {
        throw new AiPostureAdapterError("prompt-missing", "自定义姿势描述为空，无法生成");
    }

    const prompt = buildAiPosturePrompt(workspace, pose);
    const fields = composeAiPostureFields(workspace, { imageUrl: source.originUrl || source.dataUrl, promptOverride: prompt });
    const snapshot = buildAiPostureSnapshot(workspace);
    const references: ReferenceImage[] = [
        {
            id: source.assetId || aiPostureUnitId(pose.id),
            name: source.name || "model.png",
            type: "image",
            dataUrl: source.dataUrl,
            url: source.originUrl || undefined,
        },
    ];

    return {
        id: aiPostureUnitId(pose.id),
        poseId: pose.id,
        poseLabel: pose.label,
        count,
        prompt,
        fields,
        references,
        snapshot,
        snapshotHash: aiPostureSnapshotHashOf(snapshot),
        sourceUrl: source.originUrl || source.dataUrl,
        clientOperationId: options.clientOperationId,
    };
}

/** 快照指纹：与 registry 的 aiPostureSnapshotHash 同一算法，但作用于已冻结的快照。 */
function aiPostureSnapshotHashOf(snapshot: AiPostureSnapshot): string {
    const canonical = JSON.stringify(snapshot);
    let hash = 2166136261;
    for (let index = 0; index < canonical.length; index += 1) {
        hash ^= canonical.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `ap_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/* ------------------------------------------------------------------ *
 * 计划：姿势 → 单元（张数摊平）
 * ------------------------------------------------------------------ */

export type AiPosturePlanUnitsOptions = {
    workspace: AiPostureWorkspace;
    source: AiPostureSourceInput;
    /** 客户端操作 id 工厂，测试可注入确定性实现。 */
    nextClientOperationId: () => string;
};

/** 把「选中的姿势 / 自定义 / 空选择自动裂变」摊成真实请求单元列表。 */
export function planAiPostureUnits(options: AiPosturePlanUnitsOptions): AiPostureUnit[] {
    const { workspace, source } = options;
    const plan = resolveAiPosturePlan(workspace);
    const counts = distributePostureOutputs(workspace.outputNum, plan.poses.length);
    return plan.poses.map((pose, index) =>
        buildAiPostureUnit({
            workspace,
            source,
            pose,
            count: counts[index] ?? 1,
            clientOperationId: options.nextClientOperationId(),
        }),
    );
}

/* ------------------------------------------------------------------ *
 * 请求构造 + 守卫
 * ------------------------------------------------------------------ */

export function buildAiPostureInput(
    unit: AiPostureUnit,
    options: { draftRevision?: number | string | null } = {},
): BrowserToolInput {
    return {
        toolId: AI_POSTURE_TOOL_ID,
        prompt: unit.prompt,
        references: unit.references,
        count: unit.count,
        // 约定：draftRevision 放在 fields 里（与 REPLACE_GOODS 等工具一致），BrowserToolInput 顶层没有该字段。
        fields: {
            ...unit.fields,
            ...(options.draftRevision !== undefined && options.draftRevision !== null ? { draftRevision: options.draftRevision } : {}),
        },
    };
}

/** 提交前守卫：缺参考图、空 prompt、字段缺失、张数越界都在本机先拦。 */
export function assertAiPostureInput(input: BrowserToolInput): void {
    if (input.toolId !== AI_POSTURE_TOOL_ID) {
        throw new AiPostureAdapterError("tool-mismatch", `期望 ${AI_POSTURE_TOOL_ID}，实际 ${input.toolId}`);
    }
    const references = input.references ?? [];
    if (references.length === 0) throw new AiPostureAdapterError("reference-missing", "缺少模特参考图");
    if (references.some((reference) => !reference.dataUrl && !reference.url)) {
        throw new AiPostureAdapterError("reference-missing", "模特参考图没有可发送的字节或地址");
    }
    if (!input.prompt || !input.prompt.trim()) throw new AiPostureAdapterError("prompt-missing", "姿势指令为空");

    const count = Number(input.count ?? 1);
    if (!Number.isInteger(count) || count < AI_POSTURE_MIN_OUTPUT || count > AI_POSTURE_MAX_OUTPUT) {
        throw new AiPostureAdapterError("count-invalid", `单元张数需为 ${AI_POSTURE_MIN_OUTPUT}–${AI_POSTURE_MAX_OUTPUT} 的整数`);
    }

    const fields = (input.fields ?? {}) as Record<string, unknown>;
    const missing = auditAiPostureFields(fields);
    if (missing.length > 0) {
        throw new AiPostureAdapterError("fields-missing", `请求缺少字段：${missing.join(", ")}`);
    }
    const imageUrl = String(fields.imageUrl ?? "");
    if (!imageUrl.trim()) throw new AiPostureAdapterError("fields-missing", "imageUrl 为空");
    const matchesReference = references.some(
        (reference) => reference.url === imageUrl || reference.dataUrl === imageUrl || (reference.url && imageUrl.endsWith(reference.url)),
    );
    if (!matchesReference) {
        throw new AiPostureAdapterError("image-url-mismatch", "imageUrl 与参考图不一致，说明字段被串改");
    }
}

/** 页面级总守卫：工作区校验 + 单元覆盖度（总张数必须等于 outputNum）。 */
export function assertAiPostureWorkspace(
    workspace: AiPostureWorkspace,
    context: { sourceReady?: boolean; sourceWidth?: number; sourceHeight?: number } = {},
): void {
    const issues = validateAiPostureWorkspace(workspace, context);
    if (issues.length > 0) {
        throw new AiPostureAdapterError("validation-failed", issues.map((issue) => issue.message).join("；"));
    }
    if (workspace.mode === "library" && workspace.selectedPoseIds.length > 0) {
        const unknown = workspace.selectedPoseIds.filter((id) => !AI_POSTURE_POSES.some((pose) => pose.id === id));
        if (unknown.length > 0) {
            throw new AiPostureAdapterError("pose-missing", `未知姿势：${unknown.join(", ")}`);
        }
    }
}

/** 计划自检：总张数必须精确等于 outputNum，且每个单元 ≥1。 */
export function auditAiPosturePlan(units: readonly AiPostureUnit[], outputNum: number): string[] {
    const problems: string[] = [];
    if (units.length === 0) problems.push("计划为空：没有可提交的姿势单元");
    const total = units.reduce((sum, unit) => sum + unit.count, 0);
    if (total !== outputNum) problems.push(`单元张数合计 ${total} ≠ 生成张数 ${outputNum}`);
    for (const unit of units) {
        if (unit.count < 1) problems.push(`姿势「${unit.poseLabel}」张数为 0`);
        if (!unit.prompt.trim()) problems.push(`姿势「${unit.poseLabel}」指令为空`);
    }
    const poseIds = new Set(units.map((unit) => unit.poseId));
    if (poseIds.size !== units.length) problems.push("同一姿势在计划里出现了多个单元");
    return problems;
}

/* ------------------------------------------------------------------ *
 * 运行端口（共享 TaskGateway；失败不造假）
 * ------------------------------------------------------------------ */

export type AiPostureRunPort = {
    run: (input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
};

export type AiPostureUnitOutcome = {
    unit: AiPostureUnit;
    status: "succeeded" | "failed" | "cancelled" | "unknown";
    task?: ToolTask;
    images: { url?: string; dataUrl?: string }[];
    error?: { code: string; message: string };
};

/** 任务 → 单元结果。上游成功但无图 → failed(empty-result)，绝不补图。 */
export function aiPostureOutcomeFromTask(unit: AiPostureUnit, task: ToolTask): AiPostureUnitOutcome {
    const base: AiPostureUnitOutcome = { unit, status: "unknown", task, images: [] };
    const images = (task.result?.items ?? [])
        .filter((item) => item.kind === "image" && (item.dataUrl || item.url))
        .map((item) => ({ url: item.url, dataUrl: item.dataUrl }));

    if (task.status === "succeeded") {
        if (images.length === 0) {
            return { ...base, status: "failed", images, error: { code: "empty-result", message: `姿势「${unit.poseLabel}」返回成功但没有图片` } };
        }
        return { ...base, status: "succeeded", images };
    }
    if (task.status === "failed") {
        return {
            ...base,
            status: "failed",
            images,
            error: task.error ? { code: task.error.code, message: task.error.message } : { code: "task-failed", message: "任务失败（上游未给出原因）" },
        };
    }
    if (task.status === "cancelled") return { ...base, status: "cancelled", images, error: { code: "cancelled", message: "任务已取消" } };
    return { ...base, status: "unknown", images, error: { code: `task-${task.status}`, message: "任务状态未知，只能查询或人工确认，禁止盲目重提" } };
}

export async function runAiPostureUnit(
    port: AiPostureRunPort,
    unit: AiPostureUnit,
    options: { draftRevision?: number | string | null; signal?: AbortSignal } = {},
): Promise<AiPostureUnitOutcome> {
    const input = buildAiPostureInput(unit, { draftRevision: options.draftRevision });
    assertAiPostureInput(input);
    const task = await port.run(input, { signal: options.signal, draftRevision: options.draftRevision });
    return aiPostureOutcomeFromTask(unit, task);
}

/** 单单元重试：复用同一份单元快照（同一姿势、同一指令），不复制上次结果。 */
export async function retryAiPostureUnit(
    port: AiPostureRunPort,
    unit: AiPostureUnit,
    options: { draftRevision?: number | string | null; signal?: AbortSignal } = {},
): Promise<AiPostureUnitOutcome> {
    return runAiPostureUnit(port, unit, options);
}

export type AiPosturePlanRunOptions = {
    draftRevision?: number | string | null;
    signal?: AbortSignal;
    /** 每完成一个单元回调一次，UI 可以逐组点亮（部分失败也能立即看到）。 */
    onUnitOutcome?: (outcome: AiPostureUnitOutcome, index: number) => void;
    /** 已成功的单元（例如上一次部分失败）——本次跳过，不重复生成。 */
    skipUnitIds?: readonly string[];
};

/**
 * 顺序执行计划（provider 侧有并发/配额限制，串行最稳）。
 * 单元失败不影响后续单元：这就是「部分失败」的真实语义。
 */
export async function runAiPosturePlan(
    port: AiPostureRunPort,
    units: readonly AiPostureUnit[],
    options: AiPosturePlanRunOptions = {},
): Promise<AiPostureUnitOutcome[]> {
    const skip = new Set(options.skipUnitIds ?? []);
    const outcomes: AiPostureUnitOutcome[] = [];
    for (const [index, unit] of units.entries()) {
        if (options.signal?.aborted) {
            outcomes.push({ unit, status: "cancelled", images: [], error: { code: "cancelled", message: "已取消" } });
            continue;
        }
        if (skip.has(unit.id)) continue;
        let outcome: AiPostureUnitOutcome;
        try {
            outcome = await runAiPostureUnit(port, unit, { draftRevision: options.draftRevision, signal: options.signal });
        } catch (error) {
            outcome = {
                unit,
                status: "failed",
                images: [],
                error: {
                    code: error instanceof AiPostureAdapterError ? error.code : "submit-failed",
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
export function failedAiPostureUnits(outcomes: readonly AiPostureUnitOutcome[]): AiPostureUnit[] {
    return outcomes.filter((outcome) => outcome.status === "failed" || outcome.status === "unknown").map((outcome) => outcome.unit);
}

/* ------------------------------------------------------------------ *
 * 结果视图（按来源姿势分组 + 旧版本标记）
 * ------------------------------------------------------------------ */

export type AiPostureResultViewItem = {
    poseId: string;
    poseLabel: string;
    url?: string;
    dataUrl?: string;
};

export type AiPostureResultViewGroup = {
    poseId: string;
    label: string;
    status: "idle" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";
    unitId: string;
    items: AiPostureResultViewItem[];
    error?: { code: string; message: string };
    /** 该组结果相对当前配置是否过期（“来自旧版本”）。 */
    stale: boolean;
    canRetry: boolean;
};

export type AiPostureResultView = {
    status: "idle" | "running" | "succeeded" | "failed" | "partial" | "cancelled" | "unknown";
    groups: AiPostureResultViewGroup[];
    totalImages: number;
    stale: boolean;
    snapshotHash?: string;
};

export function aiPostureResultView(options: {
    units: readonly AiPostureUnit[];
    outcomes: readonly AiPostureUnitOutcome[];
    currentHash?: string | null;
    running?: boolean;
}): AiPostureResultView {
    const { units, outcomes, running } = options;
    if (units.length === 0) return { status: "idle", groups: [], totalImages: 0, stale: false };

    const byUnit = new Map(outcomes.map((outcome) => [outcome.unit.id, outcome]));
    const currentHash = options.currentHash ?? units[0]?.snapshotHash ?? null;

    const groups: AiPostureResultViewGroup[] = units.map((unit) => {
        const outcome = byUnit.get(unit.id);
        if (!outcome) {
            return {
                poseId: unit.poseId,
                label: unit.poseLabel,
                status: running ? "running" : "idle",
                unitId: unit.id,
                items: [],
                stale: false,
                canRetry: false,
            };
        }
        return {
            poseId: unit.poseId,
            label: unit.poseLabel,
            status: outcome.status,
            unitId: unit.id,
            items: outcome.images.map((image) => ({ poseId: unit.poseId, poseLabel: unit.poseLabel, url: image.url, dataUrl: image.dataUrl })),
            error: outcome.error,
            stale: Boolean(currentHash) && currentHash !== unit.snapshotHash,
            canRetry: outcome.status === "failed" || outcome.status === "unknown",
        };
    });

    const totalImages = groups.reduce((sum, group) => sum + group.items.length, 0);
    const succeeded = groups.filter((group) => group.status === "succeeded").length;
    const failed = groups.filter((group) => group.status === "failed" || group.status === "unknown").length;
    const cancelled = groups.filter((group) => group.status === "cancelled").length;

    let status: AiPostureResultView["status"];
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
