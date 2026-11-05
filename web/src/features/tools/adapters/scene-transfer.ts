import type { ReferenceImage } from "@/types/image";

import type { BrowserToolInput, SubmitOptions, ToolExecutionDescriptor, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";

import {
    SCENE_TRANSFER_FIELD_KEYS,
    SCENE_TRANSFER_TOOL_ID,
    buildTransferPrompt,
    clampSimilarity,
    similarityField,
    createSceneTransferSnapshot,
    describeTransferDrift,
    hasTransferSource,
    isTransferSourceReady,
    resolveTransferSegmentation,
    validateSceneTransferState,
    type SceneTransferAssetLike,
    type SceneTransferIssue,
    type SceneTransferSnapshot,
    type SceneTransferValues,
    type TransferSegmentation,
} from "@/features/tools/registry/scene-transfer";

/**
 * `SCENE_TRANSFER`（场景迁移）的真实 provider 适配层。
 *
 * 真实边界（不接受“演示成功”）：
 * - 提交走共享 ToolTaskGateway.submit → services/api/image.ts；带参考图即图生图（edit），
 *   provider 由用户当前图像模型决定，本模块不指定、不伪造渠道；
 * - 一次提交 = 一次真实请求（count 固定 1，页面没有张数字段）；
 * - 参考图顺序 = [商品图, 场景风格参考图, (可选)商品分割图]，提示词里逐条写明，
 *   保证“哪张是商品”不是靠上游猜；
 * - `similarity` 原样进入提示词（提示词由 registry 的 buildTransferPrompt 生成），
 *   并在 fields 里留下同值用于指纹；提交前 assertTransferInput 逐项比对，不一致就抛错；
 * - 没有分割服务时不写 segImageUrl，也不拿商品原图冒充；
 * - 结果只来自 task.result.items，本模块不产生占位图。
 */

/* ------------------------------------------------------------------ *
 * 错误
 * ------------------------------------------------------------------ */

export class SceneTransferAdapterError extends Error {
    readonly code: string;
    readonly issues: SceneTransferIssue[];

    constructor(code: string, message: string, issues: SceneTransferIssue[] = []) {
        super(message);
        this.name = "SceneTransferAdapterError";
        this.code = code;
        this.issues = issues;
    }
}

/* ------------------------------------------------------------------ *
 * 资产 → 参考图
 * ------------------------------------------------------------------ */

export type SceneTransferAsset = SceneTransferAssetLike & {
    id?: string;
    name?: string;
    type?: string;
    dataUrl?: string;
    url?: string;
    storageKey?: string;
};

function assetAddress(asset: SceneTransferAsset): string {
    return (asset.dataUrl ?? "").trim() || (asset.url ?? "").trim();
}

export function toTransferReference(asset: SceneTransferAsset, role: string): ReferenceImage {
    const address = assetAddress(asset);
    if (!address) {
        throw new SceneTransferAdapterError("source-missing", `${role}缺少可读地址（dataUrl/url 均为空），拒绝提交`);
    }
    return {
        id: asset.id ?? asset.assetId ?? `${SCENE_TRANSFER_TOOL_ID}-${role}`,
        name: asset.name ?? `${role}.png`,
        type: asset.type ?? asset.mimeType ?? "image/png",
        dataUrl: address.startsWith("data:") ? address : asset.dataUrl ?? "",
        ...(address.startsWith("data:") ? {} : { url: address }),
        ...(asset.storageKey ? { storageKey: asset.storageKey } : {}),
    };
}

/**
 * 字段里的图片引用：优先 http(s) URL，其次本地资产 ID（规格 §7 允许“HTTPS / 本地资产 ID”）。
 * data URL 不进 fields——它只污染指纹，对上游没有意义。
 */
export function transferImageRef(asset: SceneTransferAsset): string {
    const url = (asset.url ?? "").trim();
    if (url.startsWith("https://") || url.startsWith("http://")) return url;
    return asset.assetId ?? asset.id ?? "";
}

/* ------------------------------------------------------------------ *
 * 请求构造
 * ------------------------------------------------------------------ */

export type BuildTransferInputArgs = {
    values: SceneTransferValues;
    product: SceneTransferAsset;
    style: SceneTransferAsset;
    /** 只有真实分割图才进请求；缺省按 registry 的判定走。 */
    segmentation?: TransferSegmentation;
    /** 分割图资产本身：用来取真实字节；缺省时 segmentation.segImageUrl 必须是可读 URL。 */
    segAsset?: SceneTransferAsset | null;
    model?: string;
    draftRevision?: number | string | null;
};

export type TransferFields = Record<string, unknown>;

/** fields 只放真实值：没有分割图就没有 segImageUrl 键，绝不用空串占位伪装字段齐全。 */
export function buildTransferFields(args: {
    values: SceneTransferValues;
    product: SceneTransferAsset;
    style: SceneTransferAsset;
    segmentation: TransferSegmentation;
    /** 分割图的引用串（http(s) 链接或本地资产 ID）；缺省回落到 segmentation.segImageUrl。 */
    segRef?: string;
}): TransferFields {
    const fields: TransferFields = {
        imageUrl: transferImageRef(args.product),
        imageStyleUrl: transferImageRef(args.style),
        similarity: similarityField(args.values.similarity),
    };
    if (args.segmentation.provided) {
        const segRef = (args.segRef ?? "").trim() || (args.segmentation.segImageUrl ?? "");
        if (segRef) fields.segImageUrl = segRef;
    }
    return fields;
}

export function buildTransferInput(args: BuildTransferInputArgs): BrowserToolInput {
    const segmentation =
        args.segmentation ?? resolveTransferSegmentation({ segImageUrl: args.values.segImageUrl });
    const references: ReferenceImage[] = [
        toTransferReference(args.product, "商品图"),
        toTransferReference(args.style, "场景风格参考图"),
    ];
    const segAsset = args.segAsset ?? null;
    let segRef = "";
    if (segmentation.provided) {
        if (segAsset) {
            references.push(toTransferReference(segAsset, "商品分割图"));
            segRef = transferImageRef(segAsset);
        } else if (segmentation.segImageUrl && /^(https?:|data:|blob:)/.test(segmentation.segImageUrl)) {
            references.push(
                toTransferReference(
                    {
                        id: `${SCENE_TRANSFER_TOOL_ID}-seg`,
                        name: "seg.png",
                        type: "image/png",
                        dataUrl: segmentation.segImageUrl,
                        url: segmentation.segImageUrl,
                    },
                    "商品分割图",
                ),
            );
            segRef = segmentation.segImageUrl;
        }
    }
    return {
        toolId: SCENE_TRANSFER_TOOL_ID,
        prompt: buildTransferPrompt(args.values, segmentation),
        references,
        count: 1,
        fields: buildTransferFields({
            values: args.values,
            product: args.product,
            style: args.style,
            segmentation,
            segRef,
        }),
        ...(args.model ? { model: args.model } : {}),
    };
}

/* ------------------------------------------------------------------ *
 * 提交守卫
 * ------------------------------------------------------------------ */

function referenceKey(ref: ReferenceImage): string {
    return (ref.dataUrl || ref.url || "").slice(0, 128);
}

/**
 * 提交前核对“页面配置 == 请求”，任一项对不上就抛错而不是降级发送：
 * 相似度被吞、参考图顺序颠倒、丢图、多图，都是真实问题。
 */
export function assertTransferInput(
    input: BrowserToolInput,
    args: { values: SceneTransferValues; segmentation: TransferSegmentation; productRef?: string; styleRef?: string },
): void {
    const problems: string[] = [];
    const similarity = clampSimilarity(args.values.similarity);

    if (!input.prompt || !input.prompt.includes(`similarity = ${similarity}%`)) {
        problems.push(`提示词缺少 similarity=${similarity}% 的真实约束`);
    }
    const references = input.references ?? [];
    const expectedCount = args.segmentation.provided ? 3 : 2;
    if (references.length !== expectedCount) {
        problems.push(`参考图数量应为 ${expectedCount} 张（商品 + 场景风格${args.segmentation.provided ? " + 分割图" : ""}），实际 ${references.length} 张`);
    }
    if (input.count !== 1) problems.push("本页只提交 1 张，count 必须为 1");

    const fields = (input.fields ?? {}) as TransferFields;
    if (fields.similarity !== similarity / 100) problems.push("fields.similarity 与页面相似度不一致");
    if (!fields.imageUrl) problems.push("fields.imageUrl 缺失（商品图没有进入请求字段）");
    if (!fields.imageStyleUrl) problems.push("fields.imageStyleUrl 缺失（场景风格参考图没有进入请求字段）");
    if (args.segmentation.provided) {
        if (!fields.segImageUrl) problems.push("已提供分割图但 fields.segImageUrl 缺失");
    } else if ("segImageUrl" in fields) {
        problems.push("未提供分割图却写入了 segImageUrl（不接受占位值）");
    }
    if (args.productRef && fields.imageUrl !== args.productRef) problems.push("fields.imageUrl 与页面商品图不一致");
    if (args.styleRef && fields.imageStyleUrl !== args.styleRef) problems.push("fields.imageStyleUrl 与页面风格图不一致");

    const fieldKeys = Object.keys(fields).filter((key) => (SCENE_TRANSFER_FIELD_KEYS as readonly string[]).includes(key));
    if (fieldKeys.length < (args.segmentation.provided ? 4 : 3)) {
        problems.push("提交字段少于本页契约要求的字段");
    }

    if (problems.length) {
        throw new SceneTransferAdapterError("request-mismatch", problems.join("；"));
    }
}

/* ------------------------------------------------------------------ *
 * 执行
 * ------------------------------------------------------------------ */

export type SceneTransferGateway = {
    submit: (input: BrowserToolInput, options?: SubmitOptions) => Promise<ToolTask>;
    waitForResult?: (taskId: string, options?: WaitOptions) => Promise<ToolTask>;
    retry?: (taskId: string, input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
    /** 取消运行中的任务；共享网关实现（useToolTaskStore 端口），测试端口可不实现。 */
    cancel?: (taskId: string) => ToolTask;
};

export type RunSceneTransferOptions = {
    gateway: SceneTransferGateway;
    values: SceneTransferValues;
    product: SceneTransferAsset;
    style: SceneTransferAsset;
    /** 可选：真实分割图资产（本地无分割服务，只有用户主动提供时才有）。 */
    segAsset?: SceneTransferAsset | null;
    model?: string;
    revision?: number | string | null;
    /** 网关能力描述；缺省按可执行处理。 */
    descriptor?: ToolExecutionDescriptor | null;
    imageModelReady?: boolean;
    signal?: AbortSignal;
    wait?: Omit<WaitOptions, "signal">;
    onUpdate?: (task: ToolTask) => void;
};

export type SceneTransferRun = {
    task: ToolTask;
    snapshot: SceneTransferSnapshot;
};

const isTerminal = (status: ToolTask["status"]) => status === "succeeded" || status === "failed" || status === "unknown";

function prepareRun(options: RunSceneTransferOptions) {
    const { values, product, style, descriptor, segAsset } = options;
    // 只有拿到真实可读地址才算“提供了分割图”，资产 ID 不能冒充图片地址。
    const segAddress = segAsset ? (segAsset.dataUrl ?? "").trim() || (segAsset.url ?? "").trim() : "";
    const segmentation = resolveTransferSegmentation({ segImageUrl: segAddress });
    const issues = validateSceneTransferState({
        values,
        productReady: hasTransferSource(product) && isTransferSourceReady(product),
        styleReady: hasTransferSource(style) && isTransferSourceReady(style),
        imageModelReady: options.imageModelReady ?? true,
        executable: descriptor ? descriptor.executable : undefined,
        segmentation,
    });
    if (issues.length) {
        throw new SceneTransferAdapterError("invalid-config", issues[0].message, issues);
    }
    const productRef = transferImageRef(product);
    const styleRef = transferImageRef(style);
    if (!productRef) {
        throw new SceneTransferAdapterError("source-missing", "商品图缺少可提交的引用（需要 http(s) 链接或本地资产 ID）");
    }
    if (!styleRef) {
        throw new SceneTransferAdapterError("source-missing", "场景风格参考图缺少可提交的引用（需要 http(s) 链接或本地资产 ID）");
    }
    const input = buildTransferInput({
        values,
        product,
        style,
        segmentation,
        segAsset: segAsset ?? null,
        model: options.model,
        draftRevision: options.revision ?? null,
    });
    assertTransferInput(input, { values, segmentation, productRef, styleRef });
    const snapshot = createSceneTransferSnapshot({
        values,
        product: { assetId: product.assetId ?? product.id ?? "", name: product.name, url: product.url, dataUrl: product.dataUrl },
        style: { assetId: style.assetId ?? style.id ?? "", name: style.name, url: style.url, dataUrl: style.dataUrl },
        segmentation,
        revision: options.revision ?? null,
    });
    return { input, snapshot, segmentation };
}

export async function runSceneTransfer(options: RunSceneTransferOptions): Promise<SceneTransferRun> {
    const { gateway, revision = null, signal, wait, onUpdate } = options;
    const { input, snapshot } = prepareRun(options);
    const submitted = await gateway.submit(input, { signal, draftRevision: revision });
    onUpdate?.(submitted);
    if (isTerminal(submitted.status)) return { task: submitted, snapshot };
    if (!gateway.waitForResult) {
        throw new SceneTransferAdapterError("wait-unsupported", "网关不支持轮询结果，任务已提交但无法等待完成");
    }
    const final = await gateway.waitForResult(submitted.id, { ...wait, signal, onUpdate });
    return { task: final, snapshot };
}

export type RetrySceneTransferOptions = RunSceneTransferOptions & { taskId: string };

/** 同配置重试：按当前页面状态重建请求并再次守卫，避免“重试”悄悄换参数。 */
export async function retrySceneTransfer(options: RetrySceneTransferOptions): Promise<SceneTransferRun> {
    const { gateway, taskId, revision = null, signal, wait, onUpdate } = options;
    if (!gateway.retry) throw new SceneTransferAdapterError("retry-unsupported", "当前网关不支持重试");
    const { input, snapshot } = prepareRun(options);
    const retried = await gateway.retry(taskId, input, { ...wait, signal, onUpdate });
    onUpdate?.(retried);
    if (isTerminal(retried.status)) return { task: retried, snapshot };
    if (!gateway.waitForResult) return { task: retried, snapshot };
    const final = await gateway.waitForResult(retried.id, { ...wait, signal, onUpdate });
    return { task: final, snapshot };
}

/* ------------------------------------------------------------------ *
 * 结果
 * ------------------------------------------------------------------ */

export type SceneTransferCell = {
    index: number;
    status: "ready" | "missing" | "failed" | "pending";
    url?: string;
    message?: string;
};

export function sceneTransferItems(task?: ToolTask | null): ToolTaskResultItem[] {
    if (!task || task.status !== "succeeded") return [];
    return task.result?.items ?? [];
}

/** 结果单元：成功只认 result.items；失败/缺失如实标注，不补占位图。 */
export function sceneTransferCells(task?: ToolTask | null): SceneTransferCell[] {
    if (!task) return [];
    if (task.status === "failed") {
        return [{ index: 0, status: "failed", message: task.error?.message ?? "生成失败" }];
    }
    if (task.status === "cancelled") {
        return [{ index: 0, status: "failed", message: "任务已取消" }];
    }
    if (task.status === "unknown") {
        return [{ index: 0, status: "pending", message: "上游状态未知，尚未拿到结果" }];
    }
    if (task.status !== "succeeded") {
        return [{ index: 0, status: "pending", message: "生成中" }];
    }
    const items = sceneTransferItems(task);
    if (!items.length) {
        return [{ index: 0, status: "missing", message: "上游未返回图片（不接受占位图）" }];
    }
    return items.map((item, index) => {
        const url = item.url ?? item.dataUrl ?? "";
        return url
            ? { index, status: "ready" as const, url }
            : { index, status: "missing" as const, message: "该结果没有可用地址" };
    });
}

export type SceneTransferResultView = {
    cells: SceneTransferCell[];
    ready: number;
    stale: string;
    snapshot?: SceneTransferSnapshot;
    segmentationNotice: string;
};

export function sceneTransferResultFromTask(
    task?: ToolTask | null,
    snapshot?: SceneTransferSnapshot | null,
    current?: SceneTransferSnapshot | null,
): SceneTransferResultView {
    const cells = sceneTransferCells(task);
    return {
        cells,
        ready: cells.filter((cell) => cell.status === "ready").length,
        stale: describeTransferDrift(snapshot, current),
        snapshot: snapshot ?? undefined,
        segmentationNotice: snapshot && !snapshot.segmentationProvided
            ? "本次提交没有 segImageUrl（本地无分割服务），结果为整图级迁移"
            : "",
    };
}

/* ------------------------------------------------------------------ *
 * 能力说明
 * ------------------------------------------------------------------ */

export type SceneTransferExecutionSummary = {
    executable: boolean;
    notes: string[];
};

/** 页面用来显示“为什么不能提交”的说明；不做任何成功假设。 */
export function summarizeTransferExecution(
    descriptor: ToolExecutionDescriptor | null | undefined,
): SceneTransferExecutionSummary {
    const notes: string[] = [];
    if (!descriptor) {
        return { executable: true, notes: ["未拿到网关能力描述，按已注册适配器处理"] };
    }
    if (!descriptor.executable) notes.push("当前部署的可执行能力为空：图像渠道未配置");
    const missing = SCENE_TRANSFER_FIELD_KEYS.filter((key) => !descriptor.fields.includes(key));
    if (missing.length) notes.push(`网关字段表缺少 ${missing.join("、")}，这些字段不会进入上游契约`);
    return { executable: descriptor.executable, notes };
}
