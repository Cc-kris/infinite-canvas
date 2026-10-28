/**
 * TASK-035：FISSION_LINK「场景裂变链接」适配器（真实 provider，一次生成 = N 次真实请求）。
 *
 * 真实边界（不接受“演示/模拟成功”）：
 *  - 每个变体单元就是一次真实的图像编辑请求：参考图 = 用户粘贴的链接图 / 上传的资产；
 *    provider 由用户当前图像模型配置决定（走共享 TaskGateway，与其它工具同一条链路）；
 *  - 数量 N 是**请求扇出**（batchCapable=false，各渠道 count 语义不一致），因此每个单元
 *    count=1，选 3 张就真的发 3 次；任一请求失败只影响它自己那一格，绝不补造图片；
 *  - 参考图必须能转成 dataUrl（provider 侧统一走 imageToDataUrl），转不出来就抛
 *    `source-unavailable`，把失败原因交给 UI，而不是发一个空参考图去赌“成功”。
 */

import type { ReferenceImage } from "@/types/image";
import type { ToolTask } from "@/services/api/tools/task-machine";
import type { BrowserToolInput, WaitOptions } from "@/services/api/tools/gateway";
import {
    FISSION_LINK_OUTPUT_MAX,
    FISSION_LINK_TOOL_ID,
    auditFissionLinkFields,
    composeFissionLinkFields,
    fissionLinkInstruction,
    fissionLinkSnapshotHash,
    inspectFissionLinkSource,
    normalizeFissionLinkOutputNum,
    type FissionLinkFields,
    type FissionLinkSnapshot,
    type FissionLinkState,
} from "@/features/tools/registry/fission-link";

/* ------------------------------------------------------------------ *
 * 错误
 * ------------------------------------------------------------------ */

export type FissionLinkAdapterErrorCode =
    | "source-missing"
    | "source-unavailable"
    | "source-invalid"
    | "outputNum-invalid"
    | "fields-missing"
    | "fields-unexpected"
    | "prompt-missing"
    | "snapshot-mismatch"
    | "submit-failed";

export class FissionLinkAdapterError extends Error {
    readonly code: FissionLinkAdapterErrorCode;

    constructor(code: FissionLinkAdapterErrorCode, message: string) {
        super(message);
        this.name = "FissionLinkAdapterError";
        this.code = code;
    }
}

/* ------------------------------------------------------------------ *
 * 参考图
 * ------------------------------------------------------------------ */

export type FissionLinkAssetLike = {
    id?: string;
    name?: string;
    url?: string;
    dataUrl?: string;
    type?: string;
    storageKey?: string;
};

/** 上传资产 / 链接图 → 请求参考图；两个地址都空就直接失败，不发空图。 */
export function toFissionLinkReference(asset: FissionLinkAssetLike): ReferenceImage {
    const dataUrl = asset.dataUrl ?? "";
    const url = asset.url ?? "";
    if (!dataUrl && !url) {
        throw new FissionLinkAdapterError("source-missing", "参考图缺少可用地址（dataUrl/url 均为空），拒绝提交");
    }
    return {
        id: asset.id ?? `fission-source-${asset.name ?? "link"}`,
        name: asset.name ?? "reference.png",
        type: asset.type ?? "image/png",
        dataUrl,
        ...(url ? { url } : {}),
        ...(asset.storageKey ? { storageKey: asset.storageKey } : {}),
    };
}

/**
 * 只有链接的输入（没有本地资产）也必须拿到能送进 provider 的 bytes。
 * 失败就报错——CORS / 404 / 私有链接都属于“这张图用不了”，不能静默降级。
 */
export async function resolveFissionLinkReference(source: { url: string; name?: string; type?: string }): Promise<ReferenceImage> {
    const inspection = inspectFissionLinkSource(source.url);
    if (inspection.kind === "invalid") {
        throw new FissionLinkAdapterError("source-invalid", inspection.issue?.message ?? "参考图链接不可用");
    }
    if (inspection.kind === "data") {
        return toFissionLinkReference({ url: inspection.value, dataUrl: inspection.value, name: source.name, type: source.type });
    }
    const { imageToDataUrl } = await import("@/services/image-storage");
    let dataUrl = "";
    try {
        dataUrl = await imageToDataUrl({ url: inspection.value });
    } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误";
        throw new FissionLinkAdapterError("source-unavailable", `参考图读取失败（${message}）：请换一个可公开访问的 HTTPS 链接，或从本地上传`);
    }
    if (!dataUrl) {
        throw new FissionLinkAdapterError("source-unavailable", "参考图读取失败：链接没有返回图片数据，请换链接或本地上传");
    }
    return toFissionLinkReference({ url: inspection.value, dataUrl, name: source.name, type: source.type });
}

/* ------------------------------------------------------------------ *
 * 单元与请求
 * ------------------------------------------------------------------ */

export type FissionLinkUnit = {
    id: string;
    /** 变体序号（0 起），决定提示词里的“第 n 个变体”、结果排序与命名。 */
    index: number;
    prompt: string;
    references: ReferenceImage[];
    fields: FissionLinkFields;
    snapshotHash: string;
    sourceUrl: string;
};

export type BuildFissionLinkUnitInput = {
    snapshot: FissionLinkSnapshot;
    source: ReferenceImage;
    index?: number;
    total?: number;
};

/**
 * 构建一个变体单元。`index/total` 只影响提示词与本地命名，不进指纹：
 * 同一快照的 N 张结果确实来自同一次配置，理应共享 snapshotHash。
 */
export function buildFissionLinkUnit(input: BuildFissionLinkUnitInput): FissionLinkUnit {
    const index = input.index ?? 0;
    const total = input.total ?? normalizeFissionLinkOutputNum(input.snapshot.outputNum);
    const sourceUrl = input.source.url ?? input.source.dataUrl ?? input.snapshot.sourceUrl;
    if (!sourceUrl) {
        throw new FissionLinkAdapterError("source-missing", "参考图没有可用地址，拒绝构建请求");
    }
    return {
        id: `${FISSION_LINK_TOOL_ID}-${input.snapshot.clientOperationId}-${index + 1}`,
        index,
        prompt: fissionLinkInstruction(input.snapshot, index, total),
        references: [input.source],
        // 每个单元只向上游要 1 张：真实请求数 = 作业数量，不靠 count 猜渠道语义。
        fields: composeFissionLinkFields({ imageUrl: sourceUrl, outputNum: 1 }),
        snapshotHash: fissionLinkSnapshotHash(input.snapshot),
        sourceUrl,
    };
}

export function buildFissionLinkUnits(input: { snapshot: FissionLinkSnapshot; source: ReferenceImage }): FissionLinkUnit[] {
    const total = normalizeFissionLinkOutputNum(input.snapshot.outputNum);
    return Array.from({ length: total }, (_, index) => buildFissionLinkUnit({ ...input, index, total }));
}

export function buildFissionLinkInput(unit: FissionLinkUnit, options: { draftRevision?: number | string | null } = {}): BrowserToolInput {
    return {
        toolId: FISSION_LINK_TOOL_ID,
        prompt: unit.prompt,
        references: unit.references,
        count: 1,
        fields: unit.fields,
    };
}

/** 提交前守卫：字段缺失/越界/多余一律拒绝，绝不把半截载荷发出去。 */
export function assertFissionLinkInput(input: BrowserToolInput): void {
    const fields = (input.fields ?? {}) as Record<string, unknown>;
    const imageUrl = fields.imageUrl;
    if (typeof imageUrl !== "string" || !imageUrl.trim()) {
        throw new FissionLinkAdapterError("source-missing", "缺少参考图地址（imageUrl）");
    }
    const audit = auditFissionLinkFields(fields);
    if (audit.missing.length > 0) {
        throw new FissionLinkAdapterError("fields-missing", `提交载荷缺少字段：${audit.missing.join("、")}`);
    }
    if (audit.unexpected.length > 0) {
        throw new FissionLinkAdapterError("fields-unexpected", `提交载荷含未登记字段：${audit.unexpected.join("、")}`);
    }
    const outputNum = Number(fields.outputNum);
    if (!Number.isInteger(outputNum) || outputNum < 1 || outputNum > FISSION_LINK_OUTPUT_MAX) {
        throw new FissionLinkAdapterError("outputNum-invalid", `单次请求数量必须是 1–${FISSION_LINK_OUTPUT_MAX} 的整数`);
    }
    if (!input.references || input.references.length === 0) {
        throw new FissionLinkAdapterError("source-missing", "缺少参考图：本页必须有一张源图");
    }
    if (typeof input.prompt !== "string" || !input.prompt.trim()) {
        throw new FissionLinkAdapterError("prompt-missing", "生成指令为空，拒绝提交");
    }
    if (input.count !== undefined && input.count !== 1) {
        throw new FissionLinkAdapterError("outputNum-invalid", "本页每个单元只请求 1 张（数量由单元扇出实现）");
    }
}

/* ------------------------------------------------------------------ *
 * 运行
 * ------------------------------------------------------------------ */

export type FissionLinkGatewayLike = {
    run: (input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
};

/** 真实运行端口：默认走共享任务网关（provider 由用户当前图像模型配置决定）。 */
export async function createFissionLinkRunPort(): Promise<FissionLinkGatewayLike> {
    const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
    return {
        run: (input, options) => useToolTaskStore.getState().runTool(input, options),
    };
}

export type FissionLinkRunStatus = "succeeded" | "failed" | "cancelled" | "unknown";

export type FissionLinkRun = {
    unitId: string;
    index: number;
    snapshotHash: string;
    task: ToolTask;
    image?: { url?: string; dataUrl?: string };
    status: FissionLinkRunStatus;
    error?: { code: string; message: string };
};

export function fissionLinkRunFromTask(unit: FissionLinkUnit, task: ToolTask): FissionLinkRun {
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
        return { ...base, status: "cancelled", error: { code: "cancelled", message: "已取消（上游任务可能仍在计费）" } };
    }
    return {
        ...base,
        status: "unknown",
        error: task.error ? { code: task.error.code, message: task.error.message } : { code: "task-unknown", message: "上游状态未知，只能查询或人工确认" },
    };
}

export type RunFissionLinkUnitOptions = {
    port: FissionLinkGatewayLike;
    signal?: AbortSignal;
    draftRevision?: number | string | null;
    onTask?: (task: ToolTask) => void;
};

export async function runFissionLinkUnit(unit: FissionLinkUnit, options: RunFissionLinkUnitOptions): Promise<FissionLinkRun> {
    const input = buildFissionLinkInput(unit, { draftRevision: options.draftRevision });
    assertFissionLinkInput(input);
    const task = await options.port.run(input, {
        signal: options.signal,
        draftRevision: options.draftRevision ?? null,
        dedupe: false,
        onUpdate: options.onTask,
    });
    return fissionLinkRunFromTask(unit, task);
}

/** 单格重试：沿用同一 unit（同提示词/同参考图），重新发一次真实请求。 */
export async function retryFissionLinkUnit(unit: FissionLinkUnit, options: RunFissionLinkUnitOptions): Promise<FissionLinkRun> {
    return runFissionLinkUnit(unit, options);
}

export type RunFissionLinkOptions = {
    units: readonly FissionLinkUnit[];
    port: FissionLinkGatewayLike;
    signal?: AbortSignal;
    draftRevision?: number | string | null;
    /** 并发请求数；默认 2，避免一次性打满渠道限额。 */
    concurrency?: number;
    onUnitTask?: (unit: FissionLinkUnit, task: ToolTask) => void;
    onUnitDone?: (run: FissionLinkRun) => void;
};

/** 把“连请求都没发出去”的异常也变成一条可展示的失败单元（工作台重试用）。 */
export const fissionLinkFailedRun = failedRunFor;

function failedRunFor(unit: FissionLinkUnit, error: unknown): FissionLinkRun {
    const message = error instanceof Error ? error.message : "提交失败";
    const code = error instanceof FissionLinkAdapterError ? error.code : "submit-failed";
    const retryable = code !== "source-missing" && code !== "source-invalid" && code !== "source-unavailable";
    return {
        unitId: unit.id,
        index: unit.index,
        snapshotHash: unit.snapshotHash,
        task: {
            id: unit.id,
            toolId: FISSION_LINK_TOOL_ID,
            status: "failed",
            clientOperationId: unit.id,
            fingerprint: unit.snapshotHash,
            capability: "image",
            prompt: unit.prompt,
            configSnapshot: { capability: "image", model: "unknown", count: "1" },
            sourceAssetIds: (unit.references ?? []).map((item) => item.id),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            attempts: 0,
            pollCount: 0,
            transientFailures: 0,
            error: { code, message, retryable },
        },
        status: "failed",
        error: { code, message },
    };
}

/**
 * 扇出执行：concurrency 个 worker 拉取 units，逐格回调。
 * 单格失败不会中断其它格（部分失败可单独重试），全部失败也不谎报成功。
 */
export async function runFissionLink(options: RunFissionLinkOptions): Promise<FissionLinkRun[]> {
    const limit = Math.max(1, Math.min(options.concurrency ?? 2, options.units.length || 1));
    const runs: FissionLinkRun[] = new Array(options.units.length);
    let cursor = 0;

    const worker = async () => {
        while (true) {
            const current = cursor;
            cursor += 1;
            const unit = options.units[current];
            if (!unit) return;
            if (options.signal?.aborted) {
                const aborted: FissionLinkRun = { ...failedRunFor(unit, new FissionLinkAdapterError("submit-failed", "已取消")), status: "cancelled" };
                runs[current] = aborted;
                options.onUnitDone?.(aborted);
                continue;
            }
            try {
                const run = await runFissionLinkUnit(unit, {
                    port: options.port,
                    signal: options.signal,
                    draftRevision: options.draftRevision,
                    onTask: (task) => options.onUnitTask?.(unit, task),
                });
                runs[current] = run;
                options.onUnitDone?.(run);
            } catch (error) {
                const failed = failedRunFor(unit, error);
                runs[current] = failed;
                options.onUnitDone?.(failed);
            }
        }
    };

    await Promise.all(Array.from({ length: limit }, () => worker()));
    return runs.slice(0, options.units.length);
}

/* ------------------------------------------------------------------ *
 * 结果汇总
 * ------------------------------------------------------------------ */

export type FissionLinkResultStatus = "idle" | "running" | "succeeded" | "partial" | "failed" | "cancelled" | "unknown";

export type FissionLinkResultView = {
    status: FissionLinkResultStatus;
    requested: number;
    succeeded: number;
    failed: number;
    firstImageUrl?: string;
    error?: { code: string; message: string };
};

export function fissionLinkResultView(input: {
    runs: readonly (FissionLinkRun | undefined)[];
    requested: number;
    running?: boolean;
}): FissionLinkResultView {
    const runs = input.runs.filter((run): run is FissionLinkRun => Boolean(run));
    const succeededRuns = runs.filter((run) => run.status === "succeeded");
    const failedRuns = runs.filter((run) => run.status === "failed");
    const cancelled = runs.filter((run) => run.status === "cancelled");
    const unknown = runs.filter((run) => run.status === "unknown");
    const first = succeededRuns.find((run) => run.image?.url || run.image?.dataUrl);
    const base = {
        requested: input.requested,
        succeeded: succeededRuns.length,
        failed: failedRuns.length,
        firstImageUrl: first?.image?.url ?? first?.image?.dataUrl,
    };
    if (!runs.length) return { status: input.running ? "running" : "idle", ...base };
    if (input.running) return { status: "running", ...base };
    if (succeededRuns.length === 0) {
        if (cancelled.length === runs.length) return { status: "cancelled", ...base, error: cancelled[0]?.error };
        if (unknown.length > 0 && failedRuns.length === 0) return { status: "unknown", ...base, error: unknown[0]?.error };
        return { status: "failed", ...base, error: failedRuns[0]?.error };
    }
    if (failedRuns.length > 0 || cancelled.length > 0 || unknown.length > 0) return { status: "partial", ...base };
    return { status: "succeeded", ...base };
}

export function fissionLinkStatusText(view: FissionLinkResultView): string {
    switch (view.status) {
        case "idle":
            return "还没有结果：粘贴参考图 → 选裂变数量 → 生成";
        case "running":
            return `正在生成：已返回 ${view.succeeded}/${view.requested} 张`;
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

/** 页面入参 → 单元（含链接不可用时的失败原因），UI 不需要知道构建细节。 */
export function fissionLinkPreflightIssues(state: FissionLinkState, source?: { url?: string; dataUrl?: string }): string[] {
    const issues: string[] = [];
    if (!state.imageUrl.trim() && !source?.url && !source?.dataUrl) issues.push("请先粘贴图片链接或上传一张参考图");
    if (!Number.isInteger(state.outputNum) || state.outputNum < 1 || state.outputNum > FISSION_LINK_OUTPUT_MAX) {
        issues.push(`裂变数量必须是 1–${FISSION_LINK_OUTPUT_MAX} 的整数`);
    }
    return issues;
}
