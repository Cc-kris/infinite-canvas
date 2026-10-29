/**
 * TASK-025：HANDHELD_GOODS「手持商品」适配器。
 *
 * 真实边界（不接受“演示/模拟成功”）：
 *  - 一次生成 = 一次真实图像编辑请求：参考图 = 上传的商品图，注意图 2 = 所选姿势参考；
 *    姿势参考由 registry 的姿势库确定性生成（本地 SVG 示意图），用于把“手持部位/姿势”以图像形式
 *    交给上游，而不是只写进 prompt 文本；
 *  - 任务走共享 TaskGateway（useToolTaskStore.runTool），provider 由用户当前图像模型配置决定；
 *  - outputNum 1–4 → 每个数量一个单元，每个单元就是一次真实请求（本页 batchCapable=false，
 *    因此不合并成一次多图请求，也不在上游失败时补造图片）；
 *  - 上游返回成功但没有图片 → 判 failed（empty-result），绝不补造占位图；
 *  - 结果带 snapshotHash：输入（商品/姿势/场景/张数/检测类型）一变即标记“来自旧版本”。
 *
 * 字段落点见 registry/handheld-goods.ts#HANDHELD_GOODS_FIELD_BINDINGS：
 * 输入 6 个（checkType/imageUrl/modelId/modelTabType/outputNum/sceneTabType/targetOriginUrl 中的
 * 6 个 URL/枚举）+ 输出 2 个（imageResultUrl/targetResultUrl）+ 2 个本页不适用
 * （imageMaskUrl/targetMaskUrl，规格 §2 无蒙版控件，不伪造 URL）。
 */

import { pickResultPanelTask } from "./result-panel";
import {
    HANDHELD_GOODS_TOOL_ID,
    auditHandheldGoodsFields,
    composeHandheldGoodsFields,
    handheldGoodsInstruction,
    handheldGoodsPoseLabel,
    handheldGoodsPoseReferenceUrl,
    handheldGoodsSnapshotHash,
    findHandheldGoodsPose,
    validateHandheldGoodsInput,
    type HandheldGoodsSourceMeta,
    type HandheldGoodsSnapshot,
    type HandheldGoodsState,
} from "../registry/handheld-goods";
import type { BrowserToolInput, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask } from "@/services/api/tools/task-machine";
import type { ReferenceImage } from "@/types/image";

export class HandheldGoodsAdapterError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
        super(message);
        this.name = "HandheldGoodsAdapterError";
        this.code = code;
    }
}

/* ------------------------------------------------------------------ *
 * 参考图
 * ------------------------------------------------------------------ */

export type HandheldGoodsAssetLike = {
    id?: string;
    name?: string;
    url?: string;
    dataUrl?: string;
    type?: string;
    storageKey?: string;
};

/** 把上传的商品资产转成请求参考图；没有可用地址直接抛错，不发空图请求。 */
export function toHandheldGoodsReference(asset: HandheldGoodsAssetLike): ReferenceImage {
    const dataUrl = asset.dataUrl ?? "";
    const url = asset.url ?? "";
    if (!dataUrl && !url) {
        throw new HandheldGoodsAdapterError("product-missing", "商品图缺少可用地址（dataUrl/url 均为空），拒绝提交");
    }
    return {
        id: asset.id ?? `handheld-product-${asset.name ?? "upload"}`,
        name: asset.name ?? "product.png",
        type: asset.type ?? "image/png",
        dataUrl,
        ...(url ? { url } : {}),
        ...(asset.storageKey ? { storageKey: asset.storageKey } : {}),
    };
}

/** 姿势参考图：由姿势库确定性生成（同一姿势永远同一张图，便于快照比对与复现）。 */
export function toHandheldGoodsPoseReference(snapshot: HandheldGoodsSnapshot): ReferenceImage {
    const pose = findHandheldGoodsPose(snapshot.modelId);
    if (!pose) {
        throw new HandheldGoodsAdapterError("pose-missing", "所选手持姿势不在姿势库中，请重新选择姿势");
    }
    return {
        id: `handheld-pose-${pose.id}`,
        name: `${pose.id}.svg`,
        type: "image/svg+xml",
        dataUrl: handheldGoodsPoseReferenceUrl(pose),
    };
}

/* ------------------------------------------------------------------ *
 * 单元与请求
 * ------------------------------------------------------------------ */

export type HandheldGoodsUnit = {
    id: string;
    /** 该单元对应的输出序号（0 起），用于结果排序与命名。 */
    index: number;
    prompt: string;
    references: ReferenceImage[];
    fields: Record<string, unknown>;
    snapshotHash: string;
};

export type BuildHandheldGoodsUnitInput = {
    snapshot: HandheldGoodsSnapshot;
    product: ReferenceImage;
    index?: number;
    total?: number;
};

/**
 * 构建一个生成单元。`index/total` 只影响本地命名与提示词里的张数，不改变快照指纹，
 * 因此同一快照的多张结果仍然共享一个 snapshotHash（它们确实来自同一次配置）。
 */
export function buildHandheldGoodsUnit(input: BuildHandheldGoodsUnitInput): HandheldGoodsUnit {
    const hash = handheldGoodsSnapshotHash(input.snapshot);
    const index = input.index ?? 0;
    const productUrl = input.product.url ?? input.product.dataUrl ?? "";
    const poseRef = toHandheldGoodsPoseReference(input.snapshot);
    const fields = composeHandheldGoodsFields(input.snapshot, {
        imageUrl: productUrl,
        targetOriginUrl: poseRef.url ?? poseRef.dataUrl,
    });
    if (index > 0) fields.outputNum = 1;
    return {
        id: `${HANDHELD_GOODS_TOOL_ID}:${hash}:${index + 1}`,
        index,
        prompt: handheldGoodsInstruction(input.snapshot),
        references: [input.product, poseRef],
        fields,
        snapshotHash: hash,
    };
}

export type BuildHandheldGoodsUnitsInput = BuildHandheldGoodsUnitInput;

/** 张数 1–4 → 1–4 个单元；数量来自快照，不接受 UI 之外的隐含数量。 */
export function buildHandheldGoodsUnits(input: BuildHandheldGoodsUnitsInput): HandheldGoodsUnit[] {
    const total = input.snapshot.outputNum;
    return Array.from({ length: total }, (_, index) =>
        buildHandheldGoodsUnit({ snapshot: input.snapshot, product: input.product, index, total }),
    );
}

export function buildHandheldGoodsInput(unit: HandheldGoodsUnit, options: { draftRevision?: number | string | null } = {}): BrowserToolInput {
    return {
        toolId: HANDHELD_GOODS_TOOL_ID,
        prompt: unit.prompt,
        references: unit.references,
        count: 1,
        fields: {
            ...unit.fields,
            version: String(unit.index + 1),
            clientOperationId: `${HANDHELD_GOODS_TOOL_ID}:${unit.snapshotHash}:${unit.index + 1}`,
            ...(options.draftRevision !== undefined ? { draftRevision: options.draftRevision } : {}),
        },
    };
}

/* ------------------------------------------------------------------ *
 * 提交前守卫
 * ------------------------------------------------------------------ */

function textField(fields: Record<string, unknown>, key: string): string {
    const value = fields[key];
    return typeof value === "string" ? value.trim() : "";
}

/**
 * 提交守卫：输入字段必须真的落到请求里，且商品图与姿势参考都得在。
 * 任何缺失直接抛错（UI 显示原因），不发一次缺参请求。
 */
export function assertHandheldGoodsInput(input: BrowserToolInput): void {
    if (!Array.isArray(input.references) || input.references.length !== 2) {
        throw new HandheldGoodsAdapterError("references-missing", "手持商品必须同时提交商品图与姿势参考图");
    }
    if (input.count !== 1) {
        throw new HandheldGoodsAdapterError("count-invalid", "每个生成单元只产出一张图，count 必须为 1");
    }
    const fields = input.fields ?? {};
    const required = [
        ["imageUrl", "缺少商品图地址（imageUrl）"],
        ["targetOriginUrl", "缺少姿势参考地址（targetOriginUrl），请先选择手持姿势"],
        ["modelId", "缺少姿势 ID（modelId）"],
        ["modelTabType", "缺少手持部位（modelTabType）"],
        ["sceneTabType", "缺少场景类型（sceneTabType）"],
        ["checkType", "缺少检测类型（checkType）"],
    ] as const;
    for (const [key, message] of required) {
        if (!textField(fields, key)) throw new HandheldGoodsAdapterError(`${key}-missing`, message);
    }
    const outputNum = Number(fields.outputNum);
    if (!Number.isInteger(outputNum) || outputNum < 1 || outputNum > 4) {
        throw new HandheldGoodsAdapterError("outputNum-invalid", "生成张数必须是 1–4 的整数");
    }
    const audit = auditHandheldGoodsFields(fields);
    if (audit.missing.length > 0) {
        throw new HandheldGoodsAdapterError("fields-missing", `提交载荷缺少字段：${audit.missing.join("、")}`);
    }
    if (audit.unexpected.length > 0) {
        throw new HandheldGoodsAdapterError("fields-unexpected", `提交载荷含未登记字段：${audit.unexpected.join("、")}`);
    }
    const pose = findHandheldGoodsPose(textField(fields, "modelId"));
    if (!pose) {
        throw new HandheldGoodsAdapterError("pose-unknown", "所选姿势不在姿势库中，请重新选择姿势");
    }
    if (typeof input.prompt !== "string" || !input.prompt.trim()) {
        throw new HandheldGoodsAdapterError("prompt-missing", "生成指令为空，拒绝提交");
    }
}

/** 页面级校验（registry）与适配器守卫合并成一次可展示的原因列表。 */
export function handheldGoodsPreflightIssues(
    state: HandheldGoodsState,
    meta: HandheldGoodsSourceMeta & { url?: string },
): string[] {
    const issues = validateHandheldGoodsInput({
        productUrl: meta.url ?? "",
        state,
        source: meta,
    });
    return issues.map((issue) => issue.message);
}

export function handheldGoodsSubmitLabel(state: HandheldGoodsState): string {
    return `${handheldGoodsPoseLabel(state.modelId)} · ${state.outputNum} 张`;
}

/* ------------------------------------------------------------------ *
 * 运行
 * ------------------------------------------------------------------ */

export type HandheldGoodsGatewayLike = {
    run: (input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
};

/** 真实运行端口：默认走共享任务网关（provider 由用户当前图像模型配置决定）。 */
export async function createHandheldGoodsRunPort(): Promise<HandheldGoodsGatewayLike> {
    const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
    return {
        run: (input, options) => useToolTaskStore.getState().runTool(input, options),
    };
}

export type HandheldGoodsRun = {
    unitId: string;
    index: number;
    snapshotHash: string;
    task: ToolTask;
    image?: { url?: string; dataUrl?: string };
    status: "succeeded" | "failed" | "cancelled" | "unknown";
    error?: { code: string; message: string };
};

export function handheldGoodsRunFromTask(unit: HandheldGoodsUnit, task: ToolTask): HandheldGoodsRun {
    const base = { unitId: unit.id, index: unit.index, snapshotHash: unit.snapshotHash, task };
    const firstImage = task.result?.items?.find((item) => item.kind === "image" && (item.dataUrl || item.url));
    if (task.status === "succeeded") {
        if (!firstImage) {
            return { ...base, status: "failed", error: { code: "empty-result", message: "上游返回成功但没有图片结果" } };
        }
        return { ...base, status: "succeeded", image: { url: firstImage.url, dataUrl: firstImage.dataUrl } };
    }
    if (task.status === "failed") {
        return {
            ...base,
            status: "failed",
            error: task.error
                ? { code: task.error.code, message: task.error.message }
                : { code: "task-failed", message: "任务失败（上游未给出原因）" },
        };
    }
    if (task.status === "cancelled") {
        return { ...base, status: "cancelled", error: { code: "cancelled", message: "任务已取消" } };
    }
    return { ...base, status: "unknown", error: { code: `task-${task.status}`, message: "任务状态未知，只能查询或人工确认" } };
}

export type RunHandheldGoodsUnitOptions = {
    unit: HandheldGoodsUnit;
    port: HandheldGoodsGatewayLike;
    signal?: AbortSignal;
    draftRevision?: number | string | null;
    onTask?: (task: ToolTask) => void;
};

export async function runHandheldGoodsUnit(options: RunHandheldGoodsUnitOptions): Promise<HandheldGoodsRun> {
    const input = buildHandheldGoodsInput(options.unit, { draftRevision: options.draftRevision });
    assertHandheldGoodsInput(input);
    const task = await options.port.run(input, { signal: options.signal });
    options.onTask?.(task);
    return handheldGoodsRunFromTask(options.unit, task);
}

/** 失败后按同一快照重试：重新发一次真实请求，不复制上次结果。 */
export async function retryHandheldGoodsUnit(options: RunHandheldGoodsUnitOptions): Promise<HandheldGoodsRun> {
    return runHandheldGoodsUnit(options);
}

export type RunHandheldGoodsOptions = {
    units: HandheldGoodsUnit[];
    port: HandheldGoodsGatewayLike;
    signal?: AbortSignal;
    draftRevision?: number | string | null;
    /** 同时在飞的上游请求数上限；本页默认 2，避免一次点击打爆算力。 */
    concurrency?: number;
    onUnitTask?: (index: number, task: ToolTask) => void;
    onUnitDone?: (run: HandheldGoodsRun) => void;
};

/**
 * 顺序 + 有限并发的真实请求：任一张失败不影响其余张（结果区按张显示状态），
 * 中止信号到达后不再发起新的单元。
 */
export async function runHandheldGoods(options: RunHandheldGoodsOptions): Promise<HandheldGoodsRun[]> {
    const limit = Math.max(1, Math.min(options.concurrency ?? 2, options.units.length || 1));
    const runs: HandheldGoodsRun[] = [];
    let cursor = 0;

    const worker = async () => {
        for (;;) {
            if (options.signal?.aborted) return;
            const current = cursor;
            cursor += 1;
            const unit = options.units[current];
            if (!unit) return;
            try {
                const run = await runHandheldGoodsUnit({
                    unit,
                    port: options.port,
                    signal: options.signal,
                    draftRevision: options.draftRevision,
                    onTask: (task) => options.onUnitTask?.(current, task),
                });
                runs[current] = run;
                options.onUnitDone?.(run);
            } catch (error) {
                // 请求根本没发出去（守卫/网络前失败）：保留原因，不让整批静默成功。
                const message = error instanceof Error ? error.message : "提交失败";
                const code = error instanceof HandheldGoodsAdapterError ? error.code : "submit-failed";
                const failed: HandheldGoodsRun = {
                    unitId: unit.id,
                    index: unit.index,
                    snapshotHash: unit.snapshotHash,
                    task: {
                        id: unit.id,
                        toolId: HANDHELD_GOODS_TOOL_ID,
                        status: "failed",
                        clientOperationId: unit.id,
                        fingerprint: unit.snapshotHash,
                        capability: "image",
                        prompt: unit.prompt,
                        configSnapshot: { capability: "image", model: "unknown", count: "1" },
                        sourceAssetIds: [],
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        attempts: 0,
                        pollCount: 0,
                        transientFailures: 0,
                        error: { code, message, retryable: code !== "product-missing" && code !== "pose-missing" },
                    },
                    status: "failed",
                    error: { code, message },
                };
                runs[current] = failed;
                options.onUnitDone?.(failed);
            }
        }
    };

    await Promise.all(Array.from({ length: limit }, () => worker()));
    return runs.slice(0, options.units.length);
}

/* ------------------------------------------------------------------ *
 * 结果与字段回填
 * ------------------------------------------------------------------ */

/** 输出字段：成功后写 imageResultUrl / targetResultUrl（首张），其余张按顺序进结果网格。 */
export function handheldGoodsOutputFields(runs: readonly HandheldGoodsRun[]): { imageResultUrl?: string; targetResultUrl?: string } {
    const first = runs.find((run) => run.status === "succeeded" && (run.image?.url || run.image?.dataUrl));
    if (!first) return {};
    const url = first.image?.url ?? first.image?.dataUrl ?? "";
    return { imageResultUrl: url, targetResultUrl: url };
}

export type HandheldGoodsResultItem = {
    index: number;
    url?: string;
    stale: boolean;
    status: HandheldGoodsRun["status"];
    error?: { code: string; message: string };
};

export type HandheldGoodsResultView = {
    status: "idle" | "running" | "succeeded" | "partial" | "failed" | "cancelled" | "unknown";
    items: HandheldGoodsResultItem[];
    /** 成功张数 / 请求张数。 */
    succeeded: number;
    requested: number;
    stale: boolean;
    /** 提交时的商品图，用于并排对比。 */
    sourceUrl?: string;
    error?: { code: string; message: string };
};

/**
 * 结果视图：明确区分 空 / 生成中 / 全部成功 / 部分成功 / 全部失败 / 已取消 / 未知，
 * 并把“来自旧版本”的过期标记透传到每张结果上。
 */
export function handheldGoodsResultView(input: {
    runs?: readonly HandheldGoodsRun[] | null;
    running?: boolean;
    requested?: number;
    sourceUrl?: string;
    stale?: boolean;
}): HandheldGoodsResultView {
    const runs = input.runs ?? [];
    const items: HandheldGoodsResultItem[] = runs.map((run) => ({
        index: run.index,
        url: run.image?.dataUrl ?? run.image?.url,
        stale: Boolean(input.stale),
        status: run.status,
        error: run.error,
    }));
    const succeeded = items.filter((item) => item.status === "succeeded").length;
    const requested = input.requested ?? runs.length;
    let status: HandheldGoodsResultView["status"] = "idle";
    if (input.running) {
        status = "running";
    } else if (runs.length === 0) {
        status = "idle";
    } else if (succeeded === runs.length && succeeded > 0) {
        status = "succeeded";
    } else if (succeeded > 0) {
        status = "partial";
    } else if (runs.some((run) => run.status === "cancelled")) {
        status = "cancelled";
    } else if (runs.some((run) => run.status === "unknown")) {
        status = "unknown";
    } else {
        status = "failed";
    }
    const firstError = runs.find((run) => run.error)?.error;
    return {
        status,
        items,
        succeeded,
        requested,
        stale: Boolean(input.stale),
        sourceUrl: input.sourceUrl,
        error: firstError,
    };
}

/** 结果区文案（真实状态，不美化）。 */
export function handheldGoodsStatusText(view: HandheldGoodsResultView): string {
    switch (view.status) {
        case "idle":
            return "还没有生成结果";
        case "running":
            return `正在生成 ${view.succeeded}/${view.requested} 张…`;
        case "succeeded":
            return `已生成 ${view.succeeded} 张`;
        case "partial":
            return `${view.succeeded}/${view.requested} 张成功，其余失败可单独重试`;
        case "cancelled":
            return "已取消（上游任务可能仍在计费）";
        case "unknown":
            return "上游状态未知，只能查询或人工确认";
        default:
            return view.error?.message ?? "生成失败";
    }
}

/** 结果区面板用：从落库任务里选「本次该展示的那一条」（只选择，不造数据）。 */
export function handheldGoodsResultPanelTask(tasks: readonly ToolTask[]): ToolTask | null {
    return pickResultPanelTask(tasks, { toolId: HANDHELD_GOODS_TOOL_ID, includeLatestWithoutItems: true });
}
