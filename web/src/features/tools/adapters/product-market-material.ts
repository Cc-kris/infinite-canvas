import type { ReferenceImage } from "@/types/image";

import type { BrowserToolInput, SubmitOptions, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";

import {
    PRODUCT_MARKET_MATERIAL_TOOL_ID,
    buildMarketToolFields,
    buildMarketUnits,
    createMarketSnapshot,
    isMarketSnapshotStale,
    MARKET_UPLOAD_LIMITS,
    validateMarketConfig,
    type MarketConfig,
    type MarketSnapshot,
    type MarketUnit,
    type MarketValidationIssue,
} from "../registry/product-market-material";

/**
 * TASK-039：PRODUCT_MARKET_MATERIAL（商品营销素材，makeType 64）的 provider 适配层。
 *
 * 真实边界（与 TASK-008 套图同构，不伪造进度）：
 * - 每个“营销模块的第 N 屏”就是一次真实 provider 请求，走 ToolTaskGateway.submit →
 *   带参考图时 resolveInvocation 选 edit → services/api/image.ts requestEdit；
 * - 商品多图全部作为参考图提交（目录 refImageCount=5，超出由 validateMarketConfig 拦下）；
 * - 单屏失败只影响该屏，其余继续；重试只重提该屏；
 * - 结果永远来自 task.result.items，本模块不构造占位图；
 * - 保存落真实文件存储，没有内容就抛错。
 */

/* ============================== 源图 ============================== */

export type MarketSourceAsset = {
    assetId: string;
    /** data URL 或 http(s) URL；都没有视为未就绪。 */
    dataUrl?: string;
    url?: string;
    name?: string;
    mimeType?: string;
    bytes?: number;
    width?: number;
    height?: number;
};

export class MarketAdapterError extends Error {
    readonly code: string;
    readonly issues: MarketValidationIssue[];
    constructor(code: string, message: string, issues: MarketValidationIssue[] = []) {
        super(message);
        this.name = "MarketAdapterError";
        this.code = code;
        this.issues = issues;
    }
}

/** 源图就绪：必须有可访问地址（data URL / http(s)），否则不能进 provider 参考图。 */
export function isMarketSourceReady(source: MarketSourceAsset | undefined): boolean {
    if (!source || !source.assetId.trim()) return false;
    const src = source.dataUrl || source.url || "";
    return src.startsWith("data:image/") || src.startsWith("https://") || src.startsWith("http://");
}

/** 与页面约束一致：10M、384–4096px、宽高比 ≤ 5:1。 */
export function validateMarketSourceLimits(source: MarketSourceAsset):
    | { ok: true }
    | { ok: false; code: "size" | "pixels" | "aspect"; message: string } {
    const { width, height, bytes } = source;
    if (bytes !== undefined && bytes > MARKET_UPLOAD_LIMITS.maxBytes) {
        return { ok: false, code: "size", message: "商品图不能超过 10M。" };
    }
    if (width !== undefined && height !== undefined && width > 0 && height > 0) {
        if (width < MARKET_UPLOAD_LIMITS.minSide || height < MARKET_UPLOAD_LIMITS.minSide) {
            return { ok: false, code: "pixels", message: "商品图最小边不能小于 384×384。" };
        }
        if (width > MARKET_UPLOAD_LIMITS.maxSide || height > MARKET_UPLOAD_LIMITS.maxSide) {
            return { ok: false, code: "pixels", message: "商品图不能大于 4096×4096。" };
        }
        const ratio = Math.max(width / height, height / width);
        if (ratio > MARKET_UPLOAD_LIMITS.maxAspectRatio) {
            return { ok: false, code: "aspect", message: "商品图宽高比不能超过 5:1。" };
        }
    }
    return { ok: true };
}

export function toMarketReference(source: MarketSourceAsset): ReferenceImage {
    if (!isMarketSourceReady(source)) {
        throw new MarketAdapterError("source-missing", "请先上传可用的商品图。");
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
 * 只保留有效源图并按配置顺序排列：覆盖 coverList 的顺序，
 * 缺图直接抛错（不静默降级成单图，否则生成结果与用户看到的不一致）。
 */
export function resolveMarketSources(config: MarketConfig, sources: MarketSourceAsset[]): MarketSourceAsset[] {
    const byId = new Map(sources.map((source) => [source.assetId, source]));
    const ordered: MarketSourceAsset[] = [];
    for (const assetId of config.sourceAssetIds) {
        const source = byId.get(assetId);
        if (!source) throw new MarketAdapterError("source-missing", "有商品图未加载，请刷新后重试。");
        if (!isMarketSourceReady(source)) throw new MarketAdapterError("source-not-ready", "商品图尚未完成入库，请等待上传结束。");
        const limits = validateMarketSourceLimits(source);
        if (!limits.ok) throw new MarketAdapterError(limits.code, limits.message);
        ordered.push(source);
    }
    if (ordered.length === 0) throw new MarketAdapterError("source-missing", "请先上传商品图。");
    return ordered;
}

/* ============================== 单元输入 ============================== */

export type MarketUnitInputOptions = {
    config: MarketConfig;
    unit: MarketUnit;
    sources: MarketSourceAsset[];
    provider: string;
    draftRevision?: number | null;
};

/**
 * 每一屏一次请求（count=1）：这样单屏失败可独立重试，也不会把多个模块结果混成一次请求。
 * fields 用 chunk 的 15 个真实字段（+3 个画布侧补充字段），供任务快照与审计。
 */
export function buildMarketUnitInput({ config, unit, sources, provider, draftRevision }: MarketUnitInputOptions): BrowserToolInput {
    const references = sources.map((source) => toMarketReference(source));
    const size = config.isCustomAspectRatio ? `${config.customWidth}x${config.customHeight}` : config.aspectRatio;
    return {
        toolId: PRODUCT_MARKET_MATERIAL_TOOL_ID,
        prompt: unit.prompt,
        references,
        model: config.model.trim() || undefined,
        size,
        quality: config.quality,
        count: 1,
        fields: {
            ...buildMarketToolFields(config, { images: sources.map((source) => source.assetId), provider }),
            marketUnitId: unit.id,
            marketModule: unit.moduleId,
            marketPixel: unit.width > 0 && unit.height > 0 ? `${unit.width}x${unit.height}` : size,
            marketDraftRevision: draftRevision ?? null,
        },
    };
}

/* ============================== 结果结构 ============================== */

export type MarketUnitStatus = "succeeded" | "failed" | "pending" | "cancelled";

export type MarketUnitResult = {
    unitId: string;
    moduleId: string;
    moduleLabel: string;
    label: string;
    index: number;
    total: number;
    status: MarketUnitStatus;
    taskId?: string;
    items: ToolTaskResultItem[];
    error?: { code: string; message: string; retryable: boolean };
    attempts: number;
    width: number;
    height: number;
};

export type MarketGroupResult = {
    moduleId: string;
    label: string;
    units: MarketUnitResult[];
    total: number;
    succeeded: number;
    failed: number;
    pending: number;
};

export type MarketRunResult = {
    units: MarketUnitResult[];
    groups: MarketGroupResult[];
    snapshot: MarketSnapshot;
    fingerprint: string;
    revision: number;
    /** 本次真正提交的屏数（用于“至少有一次真实请求”的断言）。 */
    submitted: number;
};

export function unitStatusFromTask(task: ToolTask): MarketUnitStatus {
    switch (task.status) {
        case "succeeded":
            return "succeeded";
        case "cancelled":
            return "cancelled";
        case "failed":
            return "failed";
        default:
            // submitting / running / unknown：上游是否产出未定，只能查询。
            return "pending";
    }
}

export function marketUnitResultFromTask(unit: MarketUnit, task: ToolTask): MarketUnitResult {
    const status = unitStatusFromTask(task);
    return {
        unitId: unit.id,
        moduleId: unit.moduleId,
        moduleLabel: unit.moduleLabel,
        label: unit.label,
        index: unit.index,
        total: unit.total,
        status,
        taskId: task.id,
        items: status === "succeeded" ? (task.result?.items ?? []) : [],
        ...(task.error ? { error: { code: task.error.code, message: task.error.message, retryable: task.error.retryable } } : {}),
        attempts: task.attempts,
        width: unit.width,
        height: unit.height,
    };
}

/** 按营销模块分组（输出按模块分组是页面硬要求）。 */
export function groupMarketUnits(units: MarketUnitResult[]): MarketGroupResult[] {
    const groups: MarketGroupResult[] = [];
    for (const unit of units) {
        let group = groups.find((item) => item.moduleId === unit.moduleId);
        if (!group) {
            group = { moduleId: unit.moduleId, label: unit.moduleLabel, units: [], total: 0, succeeded: 0, failed: 0, pending: 0 };
            groups.push(group);
        }
        group.units.push(unit);
        group.total += 1;
        if (unit.status === "succeeded") group.succeeded += 1;
        else if (unit.status === "failed") group.failed += 1;
        else group.pending += 1;
    }
    return groups;
}

/* ============================== 网关边界 ============================== */

export type MarketGatewayLike = {
    submit(input: BrowserToolInput, options?: SubmitOptions): Promise<ToolTask>;
    waitForResult?(taskId: string, options?: WaitOptions): Promise<ToolTask>;
    retry?(taskId: string, input: BrowserToolInput, options?: WaitOptions): Promise<ToolTask>;
};

export type RunMarketOptions = {
    gateway: MarketGatewayLike;
    config: MarketConfig;
    sources: MarketSourceAsset[];
    provider: string;
    revision?: number | null;
    signal?: AbortSignal;
    wait?: WaitOptions;
    onUnit?: (result: MarketUnitResult) => void;
};

/**
 * 主执行：先按页面规则校验（非法就抛，绝不带脏数据提交），再逐屏真实提交。
 * 任何一屏抛错都收敛成该屏 failed，其它屏继续。
 */
export async function runMarketMaterial(options: RunMarketOptions): Promise<MarketRunResult> {
    const { gateway, config, sources, provider, revision = null, signal, wait, onUnit } = options;
    const issues = validateMarketConfig(config, { sourceReadyCount: sources.filter((source) => isMarketSourceReady(source)).length });
    if (issues.length > 0) {
        throw new MarketAdapterError("validation-failed", issues[0].message, issues);
    }
    const resolved = resolveMarketSources(config, sources);
    const snapshot = createMarketSnapshot(config, { revision, images: resolved.map((source) => source.assetId), provider });
    const units = buildMarketUnits(config);

    const results: MarketUnitResult[] = [];
    for (const unit of units) {
        if (signal?.aborted) break;
        const input = buildMarketUnitInput({ config, unit, sources: resolved, provider, draftRevision: revision });
        try {
            const submittedTask = await gateway.submit(input, { signal, draftRevision: revision });
            const task = gateway.waitForResult && submittedTask.status !== "succeeded" && submittedTask.status !== "failed"
                ? await gateway.waitForResult(submittedTask.id, { ...wait, signal, draftRevision: revision })
                : submittedTask;
            const result = marketUnitResultFromTask(unit, task);
            results.push(result);
            onUnit?.(result);
        } catch (error) {
            const message = error instanceof Error ? error.message : "提交失败";
            const result: MarketUnitResult = {
                unitId: unit.id,
                moduleId: unit.moduleId,
                moduleLabel: unit.moduleLabel,
                label: unit.label,
                index: unit.index,
                total: unit.total,
                status: "failed",
                items: [],
                error: { code: "submit-failed", message, retryable: true },
                attempts: 0,
                width: unit.width,
                height: unit.height,
            };
            results.push(result);
            onUnit?.(result);
        }
    }

    return {
        units: results,
        groups: groupMarketUnits(results),
        snapshot,
        fingerprint: snapshot.fingerprint,
        revision: revision ?? 0,
        submitted: results.length,
    };
}

/* ============================== 单屏重试 ============================== */

export type RetryMarketUnitOptions = {
    gateway: MarketGatewayLike;
    config: MarketConfig;
    sources: MarketSourceAsset[];
    provider: string;
    unit: MarketUnit;
    previous: MarketUnitResult;
    revision?: number | null;
    wait?: WaitOptions;
};

/**
 * 只重提一屏：要求该屏有 taskId（真实提交过）且状态允许。
 * pending/unknown 只能查询，禁止重提交（避免重复扣费）。
 */
export async function retryMarketUnit(options: RetryMarketUnitOptions): Promise<MarketUnitResult> {
    const { gateway, config, sources, provider, unit, previous, revision = null, wait } = options;
    if (!previous.taskId) throw new MarketAdapterError("no-task", "该屏还没有提交过，不能重试。");
    if (previous.status === "succeeded") throw new MarketAdapterError("already-succeeded", "该屏已成功，无需重试。");
    if (previous.status === "pending") throw new MarketAdapterError("pending-unknown", "上游结果未确定，请先查询结果，不能重复提交。");
    if (!gateway.retry) throw new MarketAdapterError("retry-unsupported", "当前网关不支持重试。");
    const resolved = resolveMarketSources(config, sources);
    const input = buildMarketUnitInput({ config, unit, sources: resolved, provider, draftRevision: revision });
    const task = await gateway.retry(previous.taskId, input, { ...wait, draftRevision: revision });
    return { ...marketUnitResultFromTask(unit, task), unitId: previous.unitId };
}

/** 结果是否来自旧配置（换图/改平台/改品牌基因后应为 true）。 */
export function marketResultsStale(
    run: Pick<MarketRunResult, "snapshot">,
    config: MarketConfig,
    input: { images: string[]; provider: string },
): boolean {
    return isMarketSnapshotStale(run.snapshot, config, input);
}

export function summarizeMarketRun(units: MarketUnitResult[]): { total: number; succeeded: number; failed: number; pending: number } {
    return {
        total: units.length,
        succeeded: units.filter((unit) => unit.status === "succeeded").length,
        failed: units.filter((unit) => unit.status === "failed").length,
        pending: units.filter((unit) => unit.status === "pending").length,
    };
}

/* ============================== 保存 ============================== */

export type MarketSavedItem = {
    storageKey: string;
    url: string;
    bytes?: number;
    mimeType?: string;
    unitId: string;
    itemId: string;
};

export type MarketSaveDeps = {
    /** 默认走 file-storage.uploadMediaFile（真实落盘 + objectURL）。 */
    upload?: (input: string | Blob, prefix?: string) => Promise<{ url: string; storageKey: string; bytes: number; mimeType: string }>;
};

/** 保存单张结果到素材存储；没有 dataUrl/url 就报错，绝不生成空占位。 */
export async function saveMarketResultItem(
    item: ToolTaskResultItem,
    result: MarketUnitResult,
    deps: MarketSaveDeps = {},
): Promise<MarketSavedItem> {
    const payload = item.dataUrl ?? item.url;
    if (!payload) {
        throw new MarketAdapterError("empty-result", "该结果没有可保存的内容（可能已被持久化策略剥离），请重新生成。");
    }
    const upload = deps.upload ?? (async (input: string | Blob, prefix?: string) => {
        const module = await import("@/services/file-storage");
        return module.uploadMediaFile(input, prefix);
    });
    const uploaded = await upload(payload, `market-${result.moduleId}`);
    return {
        storageKey: uploaded.storageKey,
        url: uploaded.url,
        bytes: uploaded.bytes,
        mimeType: uploaded.mimeType,
        unitId: result.unitId,
        itemId: item.id,
    };
}
