import type { ReferenceImage } from "@/types/image";

import type { BrowserToolInput, SubmitOptions, ToolExecutionDescriptor, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";

import { pickResultPanelTask } from "./result-panel";
import {
    PRODUCT_SCENE_TOOL_ID,
    buildScenePrompt,
    createSceneSnapshot,
    describeSceneDrift,
    effectiveSceneStrength,
    isSceneModelId,
    linkSceneValues,
    resolveSceneCapability,
    resolveSceneSegmentation,
    sceneModelCard,
    validateSceneSource,
    validateSceneState,
    type SceneCapabilityInput,
    type SceneIssue,
    type SceneModelId,
    type SceneOutput,
    type SceneProviderCapability,
    type SceneSnapshot,
    type SceneSourceAsset,
    type SceneValues,
} from "../registry/product-scene";

/**
 * TASK-024：PRODUCT_SCENE（场景裂变）的真实 provider 适配层。
 *
 * 真实边界（不接受演示成功）：
 * - 提交走 TASK-005 的 ToolTaskGateway.submit → services/api/image.ts；带参考图即图生图（edit）；
 * - 页面上的每一项都落进真实请求：`mode` / `strength` / `sceneKeyword` / `outputNum` /
 *   `sizeType` + `imageOutputWidth|Height` + `ratio` + `size` + `prompt`；
 * - `provider` 取当前渠道真实 apiFormat，不接受自由文本；
 * - `outputNum` 直接决定 provider 的 `count`（网关 normalizeCount 1–15，本页 1–4）；
 * - 提交前 `assertSceneInput` 逐项核对“页面配置已进入请求”，对不上就抛错，绝不降级发请求；
 * - 结果只来自 `task.result.items`，本模块不产生占位图；少图按结果单元标 missing，可单格重试。
 *
 * 已知集成缺口（见 reports/TASK-024-product-scene.md）：
 * - `segImageUrl` / `cutoutProvider` 需要主体分割服务，仓库内暂无；仅在调用方显式提供分割图时提交，
 *   否则如实报告 missing，绝不用原图冒充分割图；
 * - `tool-page.tsx` 未挂载 workspace（共享文件，由负责人接线）。
 */

export type ProductSceneSourceAsset = SceneSourceAsset & {
    /** data URL / blob URL / https URL，任一可用即可提交。 */
    dataUrl?: string;
};

export class ProductSceneAdapterError extends Error {
    readonly code: string;
    readonly issues: SceneIssue[];

    constructor(code: string, message: string, issues: SceneIssue[] = []) {
        super(message);
        this.name = "ProductSceneAdapterError";
        this.code = code;
        this.issues = issues;
    }
}

/* ============================== 源资产 ============================== */

export function sceneSourceFromRecord(record: ToolAssetRecord): ProductSceneSourceAsset {
    return {
        assetId: record.id,
        name: record.name,
        width: record.width,
        height: record.height,
        mimeType: record.mimeType,
        bytes: record.bytes,
        url: record.url,
    };
}

export function isSceneSourceReady(source?: ProductSceneSourceAsset | null): boolean {
    if (!source || !source.assetId.trim()) return false;
    const src = source.dataUrl || source.url || "";
    return src.startsWith("data:image/") || src.startsWith("https://") || src.startsWith("http://") || src.startsWith("blob:");
}

export function toSceneReference(source: ProductSceneSourceAsset): ReferenceImage {
    if (!isSceneSourceReady(source)) {
        throw new ProductSceneAdapterError("source-missing", "请先上传商品场景参考图。");
    }
    return {
        id: source.assetId,
        name: source.name ?? `${source.assetId}.png`,
        type: source.mimeType ?? "image/png",
        dataUrl: source.dataUrl ?? source.url ?? "",
        ...(source.url && !source.url.startsWith("data:") ? { url: source.url } : {}),
    };
}

/**
 * 字段里的图片引用：优先 http(s) URL，其次本地资产 ID（页面规格允许“HTTPS / 本地资产 ID”）。
 * 不把 data URL 塞进 fields —— 它会污染任务指纹，且对上游毫无意义。
 */
export function sceneImageRef(source: ProductSceneSourceAsset): string {
    const url = (source.url ?? "").trim();
    if (url.startsWith("https://") || url.startsWith("http://")) return url;
    return source.assetId;
}

export function validateSceneSourceAsset(source: ProductSceneSourceAsset) {
    const base = validateSceneSource({
        width: source.width,
        height: source.height,
        mimeType: source.mimeType,
        bytes: source.bytes,
    });
    if (!base.ok) return base;
    return { ok: true as const };
}

/* ============================== 能力 ============================== */

export type SceneCapabilityContext = SceneCapabilityInput & {
    /** gateway.describeToolExecution("PRODUCT_SCENE") 的结果；缺省按可执行处理（由调用方保证真实）。 */
    descriptor?: ToolExecutionDescriptor | null;
};

/** 把网关能力描述 + 页面模型卡合并成一份“能提交什么”的能力表。 */
export function sceneCapabilityFromDescriptor(input: SceneCapabilityContext = {}): SceneProviderCapability {
    const descriptor = input.descriptor;
    return resolveSceneCapability({
        ...input,
        executable: input.executable ?? descriptor?.executable ?? true,
    });
}

/* ============================== 请求组装 ============================== */

export type SceneFields = Record<string, string | number | boolean>;

export type BuildSceneInputOptions = {
    values: SceneValues;
    output: SceneOutput;
    capability: SceneProviderCapability;
    source: ProductSceneSourceAsset;
    model?: string;
    draftRevision?: number | string | null;
};

/** 页面 15 个字段 → provider 请求字段；没有真实值就不写，禁止空串占位。 */
export function buildSceneFields(options: BuildSceneInputOptions): SceneFields {
    const { values, output, capability, source } = options;
    const fields: SceneFields = {
        imageName: values.imageName.trim() || source.name || `${source.assetId}.png`,
        imageUrl: sceneImageRef(source),
        originImageUrl: sceneImageRef(source),
        mode: capability.providerMode,
        provider: capability.provider,
        sceneKeyword: values.sceneKeyword.trim(),
        prompt: buildScenePrompt(values, capability),
        strength: effectiveSceneStrength(values, capability),
        sizeType: output.sizeType,
        imageOutputWidth: output.width,
        imageOutputHeight: output.height,
        ratio: output.ratio,
        outputNum: values.outputNum,
    };
    const segmentation = resolveSceneSegmentation({
        segmentationUrl: source.segmentationUrl,
        cutoutProvider: source.cutoutProvider ?? values.cutoutProvider,
    });
    if (!segmentation.missing) {
        if (segmentation.segImageUrl) fields.segImageUrl = segmentation.segImageUrl;
        if (segmentation.cutoutProvider) fields.cutoutProvider = segmentation.cutoutProvider;
    }
    return fields;
}

export function buildSceneInput(options: BuildSceneInputOptions): BrowserToolInput {
    const { values, output, capability, source, model } = options;
    return {
        toolId: PRODUCT_SCENE_TOOL_ID,
        prompt: buildScenePrompt(values, capability),
        references: [toSceneReference(source)],
        count: values.outputNum,
        size: output.requestSize,
        ...(model ? { model } : {}),
        fields: buildSceneFields(options),
    };
}

/**
 * 防丢参守卫：页面上的每一项都要能在请求里找到。
 * 对不上直接抛错，不允许“配置被静默丢弃仍然提交”。
 */
export function assertSceneInput(
    input: BrowserToolInput,
    values: SceneValues,
    output: SceneOutput,
    capability: SceneProviderCapability,
): void {
    const problems: string[] = [];
    const fields = (input.fields ?? {}) as Record<string, unknown>;

    if (input.toolId !== PRODUCT_SCENE_TOOL_ID) problems.push(`toolId 必须是 ${PRODUCT_SCENE_TOOL_ID}`);
    if (input.count !== values.outputNum) problems.push(`生成张数未进入请求（期望 ${values.outputNum}，实际 ${input.count ?? "空"}）`);
    if (input.size !== output.requestSize) problems.push(`输出尺寸未进入请求（期望 ${output.requestSize}，实际 ${input.size ?? "空"}）`);
    if (!(input.references?.length ?? 0)) problems.push("缺少商品场景参考图");
    if (String(fields.mode ?? "") !== capability.providerMode) problems.push(`生成模式未进入请求（期望 ${capability.providerMode}）`);
    if (String(fields.provider ?? "") !== capability.provider) problems.push(`provider 与当前渠道不一致（期望 ${capability.provider || "空"}）`);
    if (Number(fields.strength) !== effectiveSceneStrength(values, capability)) problems.push("背景相似度未进入请求");
    if (String(fields.sceneKeyword ?? "") !== values.sceneKeyword.trim()) problems.push("场景关键词未进入请求");
    if (String(fields.prompt ?? "") !== (input.prompt ?? "")) problems.push("提示词与字段 prompt 不一致");
    if (Number(fields.imageOutputWidth) !== output.width) problems.push("imageOutputWidth 与输出尺寸不一致");
    if (Number(fields.imageOutputHeight) !== output.height) problems.push("imageOutputHeight 与输出尺寸不一致");
    if (String(fields.ratio ?? "") !== output.ratio) problems.push("输出比例未进入请求");
    if (String(fields.sizeType ?? "") !== output.sizeType) problems.push("尺寸类型未进入请求");
    if (Number(fields.outputNum) !== values.outputNum) problems.push("outputNum 字段与张数不一致");
    if (String(fields.imageUrl ?? "") !== String(fields.originImageUrl ?? "")) problems.push("imageUrl 与 originImageUrl 应指向同一参考图");
    if (!input.prompt?.trim()) problems.push("提示词为空");
    if (!input.prompt?.includes(sceneModelLabelOf(values.modelId))) problems.push("提示词未携带生成模型风格");

    if (problems.length) {
        throw new ProductSceneAdapterError("param-dropped", `提交参数校验失败：${problems.join("；")}`);
    }
}

function sceneModelLabelOf(modelId: SceneModelId): string {
    return sceneModelCard(modelId).label;
}

/* ============================== 执行 ============================== */

export type ProductSceneGatewayLike = {
    submit: (input: BrowserToolInput, options?: SubmitOptions) => Promise<ToolTask>;
    waitForResult: (taskId: string, options?: WaitOptions) => Promise<ToolTask>;
    retry?: (taskId: string, input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
};

export type RunProductSceneOptions = {
    gateway: ProductSceneGatewayLike;
    values: SceneValues;
    output: SceneOutput;
    capability: SceneProviderCapability;
    source: ProductSceneSourceAsset;
    model?: string;
    revision?: number | string | null;
    imageModelReady?: boolean;
    signal?: AbortSignal;
    onUpdate?: (task: ToolTask) => void;
    wait?: WaitOptions;
};

export type ProductSceneRun = {
    task: ToolTask;
    snapshot: SceneSnapshot;
    output: SceneOutput;
    capability: SceneProviderCapability;
};

const isTerminal = (status: ToolTask["status"]) => status === "succeeded" || status === "failed" || status === "unknown";

/** 先按 Provider 能力收敛值，再校验、再守卫、最后真实提交。 */
export async function runProductScene(options: RunProductSceneOptions): Promise<ProductSceneRun> {
    const { gateway, output, capability, source, model, revision = null, imageModelReady = true, signal, onUpdate, wait } = options;
    const linked = linkSceneValues(options.values, capability);
    const values = linked.values;

    const issues = validateSceneState({
        values,
        output,
        sourceReady: isSceneSourceReady(source),
        source: { width: source.width, height: source.height },
        imageModelReady,
        capability,
    });
    if (issues.length) throw new ProductSceneAdapterError("invalid-config", issues[0].message, issues);
    const sourceCheck = validateSceneSourceAsset(source);
    if (!sourceCheck.ok) {
        throw new ProductSceneAdapterError("source-invalid", sourceCheck.message ?? "参考图不满足分辨率要求");
    }

    if (linked.changes.length) {
        // 收敛发生了说明页面上还有旧值；这里不静默继续，交给调用方刷新后再提交。
        throw new ProductSceneAdapterError(
            "values-not-linked",
            `配置与当前模型能力不一致，已自动调整：${linked.changes.map((item) => item.reason).join("；")}`,
        );
    }

    const input = buildSceneInput({ values, output, capability, source, model, draftRevision: revision });
    assertSceneInput(input, values, output, capability);
    const snapshot = createSceneSnapshot(values, output, capability, { assetId: source.assetId }, revision);

    const submitted = await gateway.submit(input, { signal, draftRevision: revision });
    onUpdate?.(submitted);
    if (isTerminal(submitted.status)) return { task: submitted, snapshot, output, capability };
    const final = await gateway.waitForResult(submitted.id, { ...wait, signal, onUpdate });
    return { task: final, snapshot, output, capability };
}

export type RetryProductSceneOptions = RunProductSceneOptions & { taskId: string };

/** 同快照重试：输入按当前配置重建并再次守卫，避免“重试”悄悄换参数。 */
export async function retryProductScene(options: RetryProductSceneOptions): Promise<ProductSceneRun> {
    const { gateway, values, output, capability, source, model, revision = null, signal, onUpdate, wait, taskId } = options;
    if (!gateway.retry) throw new ProductSceneAdapterError("retry-unsupported", "当前网关不支持重试。");
    const input = buildSceneInput({ values, output, capability, source, model, draftRevision: revision });
    assertSceneInput(input, values, output, capability);
    const snapshot = createSceneSnapshot(values, output, capability, { assetId: source.assetId }, revision);
    const retried = await gateway.retry(taskId, input, { ...wait, signal, onUpdate });
    onUpdate?.(retried);
    if (isTerminal(retried.status)) return { task: retried, snapshot, output, capability };
    const final = await gateway.waitForResult(retried.id, { ...wait, signal, onUpdate });
    return { task: final, snapshot, output, capability };
}

/** 单格重试：只补缺失的那一张，已成功的结果不重复生成。 */
export async function retrySceneVariant(
    options: Omit<RunProductSceneOptions, "wait"> & { variantIndex: number; wait?: WaitOptions },
): Promise<{ task: ToolTask; requested: number }> {
    const { gateway, values, output, capability, source, model, revision = null, signal, onUpdate, wait, variantIndex } = options;
    const single: SceneOutput = output;
    const input = buildSceneInput({
        values: { ...values, outputNum: 1 },
        output: single,
        capability: { ...capability, outputOptions: [1], maxOutputNum: Math.max(1, capability.maxOutputNum) },
        source,
        model,
        draftRevision: revision,
    });
    assertSceneInput(input, { ...values, outputNum: 1 }, output, { ...capability });
    const submitted = await gateway.submit(input, { signal, draftRevision: revision });
    onUpdate?.(submitted);
    if (isTerminal(submitted.status)) return { task: submitted, requested: variantIndex };
    const final = await gateway.waitForResult(submitted.id, { ...wait, signal, onUpdate });
    return { task: final, requested: variantIndex };
}

/* ============================== 结果 ============================== */

export function sceneResultItems(task?: ToolTask | null): ToolTaskResultItem[] {
    if (!task || task.status !== "succeeded") return [];
    return task.result?.items ?? [];
}

export type SceneVariantStatus = "ready" | "missing" | "pending" | "failed";

export type SceneVariantCell = {
    index: number;
    status: SceneVariantStatus;
    dataUrl?: string;
    itemId?: string;
    message?: string;
};

/**
 * 结果网格：成功按实际张数填充，缺的格子明确标 missing（不复制上一张充数）；
 * 运行中 / 失败按任务状态标 pending / failed，便于只重试失败单元。
 */
export function sceneVariantCells(task: ToolTask | null | undefined, expected: number): SceneVariantCell[] {
    const total = Math.max(1, Math.floor(expected || 1));
    const items = sceneResultItems(task);
    const cells: SceneVariantCell[] = [];
    for (let index = 0; index < total; index += 1) {
        const item = items[index];
        if (item?.dataUrl) {
            cells.push({ index, status: "ready", dataUrl: item.dataUrl, itemId: item.id });
            continue;
        }
        if (!task) {
            cells.push({ index, status: "missing" });
            continue;
        }
        if (task.status === "failed") {
            cells.push({ index, status: "failed", message: task.error?.message ?? "生成失败" });
            continue;
        }
        if (task.status === "unknown") {
            cells.push({ index, status: "failed", message: task.error?.message ?? "上游状态未知，先查询再重试" });
            continue;
        }
        if (task.status === "succeeded") {
            cells.push({ index, status: "missing", message: `上游只返回 ${items.length} 张` });
            continue;
        }
        cells.push({ index, status: "pending" });
    }
    return cells;
}

export function missingSceneVariantIndexes(task: ToolTask | null | undefined, expected: number): number[] {
    if (!task || task.status !== "succeeded") return [];
    return sceneVariantCells(task, expected)
        .filter((cell) => cell.status === "missing")
        .map((cell) => cell.index);
}

export function firstSceneImage(task?: ToolTask | null): string | undefined {
    return sceneResultItems(task)[0]?.dataUrl;
}

export type SceneResultView = {
    count: number;
    expected: number;
    missing: number;
    cells: SceneVariantCell[];
    /** 结果是否来自旧配置（配置已改动）。 */
    stale: string;
    snapshot?: SceneSnapshot;
};

export function sceneResultFromTask(
    task: ToolTask | null | undefined,
    snapshot?: SceneSnapshot | null,
    current?: SceneSnapshot | null,
): SceneResultView {
    const expected = snapshot?.outputNum ?? current?.outputNum ?? 1;
    const items = sceneResultItems(task);
    return {
        count: items.length,
        expected,
        missing: missingSceneVariantIndexes(task, expected).length,
        cells: sceneVariantCells(task, expected),
        stale: describeSceneDrift(snapshot, current),
        snapshot: snapshot ?? undefined,
    };
}

export type SceneExecutionSummary = {
    executable: boolean;
    capability: SceneProviderCapability;
    notes: string[];
};

/** ToolShell 能力提示用：网关描述 + 模型卡合并后的说明。 */
export function summarizeSceneExecution(
    descriptor: ToolExecutionDescriptor | null | undefined,
    input: SceneCapabilityContext = {},
): SceneExecutionSummary {
    const capability = sceneCapabilityFromDescriptor({ ...input, descriptor });
    const notes = [...capability.notices];
    if (descriptor && !descriptor.fields.includes("sceneKeyword")) {
        notes.push("网关字段表缺少 sceneKeyword，关键词只进入提示词");
    }
    return { executable: capability.executable, capability, notes };
}

export { isSceneModelId };


/**
 * 结果区面板用：从落库任务里选「本次该展示的那一条」。
 *
 * 只选择不造数：返回的就是持久化快照里的任务对象（items 含 storageKey 复原的真实字节），
 * 无任务时返回 null —— 页面刷新后结果面板因此仍能挂上共享 ToolResult 与三个动作。
 */
export function productSceneResultPanelTask(
    tasks: readonly ToolTask[],
    toolId: string = PRODUCT_SCENE_TOOL_ID,
): ToolTask | null {
    return pickResultPanelTask(tasks, { toolId, includeLatestWithoutItems: true });
}
