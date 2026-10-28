import type { ReferenceImage } from "@/types/image";

import type { BrowserToolInput, SubmitOptions, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";

import {
    PRODUCT_IMAGE_SUITE_TOOL_ID,
    buildSuiteToolFields,
    buildSuiteUnits,
    createSuiteSnapshot,
    isSuiteSnapshotStale,
    suiteConfigFingerprint,
    validateSuiteConfig,
    type SuiteConfig,
    type SuiteConfigSnapshot,
    type SuiteUnit,
    type SuiteValidationIssue,
} from "../registry/product-image-suite";

/**
 * TASK-008：PRODUCT_IMAGE_SUITE 的 provider 适配层。
 *
 * 真实边界（不接受演示成功）：
 * - 每个套图单元是一次真实 provider 请求，走 TASK-005 的 ToolTaskGateway.submit：
 *   有参考图 → resolveInvocation 选 edit → services/api/image.ts requestEdit；
 * - 单张失败只影响该单元，其余继续；重试只重提该单元，其它结果不动；
 * - 结果永远来自 task.result.items，本模块不构造占位图；
 * - 保存动作落真实文件存储（file-storage.uploadMediaFile），没有结果就抛错。
 */

/* ============================== 源图 ============================== */

export type SuiteSourceAsset = {
    assetId: string;
    /** data URL 或 http(s) URL；两者都没有则视为未就绪。 */
    dataUrl?: string;
    url?: string;
    name?: string;
    mimeType?: string;
    bytes?: number;
    width?: number;
    height?: number;
};

export class SuiteAdapterError extends Error {
    readonly code: string;
    readonly issues: SuiteValidationIssue[];
    constructor(code: string, message: string, issues: SuiteValidationIssue[] = []) {
        super(message);
        this.name = "SuiteAdapterError";
        this.code = code;
        this.issues = issues;
    }
}

/** 源图就绪判定：必须有可访问地址（data URL / http(s)），且能进 provider 的参考图。 */
export function isSuiteSourceReady(source: SuiteSourceAsset | undefined): boolean {
    if (!source || !source.assetId.trim()) return false;
    const src = source.dataUrl || source.url || "";
    // 工具素材库的当次会话 URL 是 blob:（见 ToolAssetRecord.url），发送前转 data URL，故同样视为已上传。
    return src.startsWith("data:image/") || src.startsWith("https://") || src.startsWith("http://") || src.startsWith("blob:");
}

/** 尺寸/比例/体积的硬约束（页面规格：10M、384×384 ~ 4096×4096、宽高比 ≤ 5）。 */
export function validateSuiteSourceLimits(source: SuiteSourceAsset):
    | { ok: true }
    | { ok: false; code: "size" | "pixels" | "aspect"; message: string } {
    const { width, height, bytes } = source;
    if (bytes !== undefined && bytes > 10 * 1024 * 1024) return { ok: false, code: "size", message: "商品图不能超过 10M。" };
    if (width !== undefined && height !== undefined && width > 0 && height > 0) {
        if (width < 384 || height < 384) return { ok: false, code: "pixels", message: "商品图最小边不能小于 384×384。" };
        if (width > 4096 || height > 4096) return { ok: false, code: "pixels", message: "商品图不能大于 4096×4096。" };
        const ratio = Math.max(width / height, height / width);
        if (ratio > 5) return { ok: false, code: "aspect", message: "商品图宽高比不能超过 5:1。" };
    }
    return { ok: true };
}

export function toSuiteReference(source: SuiteSourceAsset): ReferenceImage {
    if (!isSuiteSourceReady(source)) {
        throw new SuiteAdapterError("source-missing", "请先上传可用的商品图。");
    }
    return {
        id: source.assetId,
        name: source.name ?? `${source.assetId}.png`,
        type: source.mimeType ?? "image/png",
        dataUrl: source.dataUrl ?? source.url ?? "",
        ...(source.url && !source.url.startsWith("data:") ? { url: source.url } : {}),
    };
}

/* ============================== 单元输入 ============================== */

export type SuiteUnitInputOptions = {
    config: SuiteConfig;
    unit: SuiteUnit;
    source: SuiteSourceAsset;
    draftRevision?: number | null;
};

/**
 * 单元 → gateway 输入。每次只生成一张（count=1），套图的“张数”由单元数表达，
 * 这样单张失败可独立重试，也不会把一个模块的结果混成一次请求。
 */
export function buildSuiteUnitInput({ config, unit, source, draftRevision }: SuiteUnitInputOptions): BrowserToolInput {
    const reference = toSuiteReference(source);
    const size = config.ratio;
    return {
        toolId: PRODUCT_IMAGE_SUITE_TOOL_ID,
        prompt: unit.prompt,
        references: [reference],
        model: config.model.trim() || undefined,
        size,
        count: 1,
        fields: {
            ...buildSuiteToolFields(config, source.assetId),
            suiteUnitId: unit.id,
            suiteModule: unit.moduleId,
            suiteLayoutMode: unit.layoutId ? "per-layout" : "quantity",
            suiteLayoutId: unit.layoutId ?? "",
            suiteResolution: config.resolution,
            suiteQuality: config.quality,
            suiteDraftRevision: draftRevision ?? null,
        },
    };
}

/* ============================== 结果结构 ============================== */

export type SuiteUnitStatus = "succeeded" | "failed" | "pending" | "cancelled";

export type SuiteUnitResult = {
    unitId: string;
    moduleId: string;
    moduleLabel: string;
    kind: SuiteUnit["kind"];
    label: string;
    index: number;
    total: number;
    status: SuiteUnitStatus;
    taskId?: string;
    items: ToolTaskResultItem[];
    error?: { code: string; message: string; retryable: boolean };
    attempts: number;
    layoutId?: string;
};

export type SuiteGroupResult = {
    moduleId: string;
    label: string;
    kind: SuiteUnit["kind"];
    units: SuiteUnitResult[];
    total: number;
    succeeded: number;
    failed: number;
    pending: number;
};

export type SuiteRunResult = {
    units: SuiteUnitResult[];
    groups: SuiteGroupResult[];
    snapshot: SuiteConfigSnapshot;
    fingerprint: string;
    revision: number;
    /** 本次真正提交的单元数（用于“至少有一次真实请求”的断言，不是伪造的进度）。 */
    submitted: number;
};

export function unitStatusFromTask(task: ToolTask): SuiteUnitStatus {
    switch (task.status) {
        case "succeeded":
            return "succeeded";
        case "cancelled":
            return "cancelled";
        case "failed":
            return "failed";
        default:
            // submitting / running / unknown：上游是否已产出未定，只能查询，不能当成功。
            return "pending";
    }
}

export function suiteUnitResultFromTask(unit: SuiteUnit, task: ToolTask): SuiteUnitResult {
    const status = unitStatusFromTask(task);
    return {
        unitId: unit.id,
        moduleId: unit.moduleId,
        moduleLabel: unit.moduleLabel,
        kind: unit.kind,
        label: unit.label,
        index: unit.index,
        total: unit.total,
        status,
        taskId: task.id,
        items: status === "succeeded" ? (task.result?.items ?? []) : [],
        ...(task.error ? { error: { code: task.error.code, message: task.error.message, retryable: task.error.retryable } } : {}),
        attempts: task.attempts,
        ...(unit.layoutId ? { layoutId: unit.layoutId } : {}),
    };
}

/** 按模块分组，保持页面顺序（A+ 在前、主副图按勾选顺序）。 */
export function groupSuiteUnits(units: SuiteUnitResult[]): SuiteGroupResult[] {
    const order: string[] = [];
    const buckets = new Map<string, SuiteUnitResult[]>();
    for (const unit of units) {
        if (!buckets.has(unit.moduleId)) {
            buckets.set(unit.moduleId, []);
            order.push(unit.moduleId);
        }
        buckets.get(unit.moduleId)!.push(unit);
    }
    return order.map((moduleId) => {
        const groupUnits = buckets.get(moduleId)!.slice().sort((a, b) => a.index - b.index);
        return {
            moduleId,
            label: groupUnits[0]?.moduleLabel ?? moduleId,
            kind: groupUnits[0]?.kind ?? "main-sub",
            units: groupUnits,
            total: groupUnits.length,
            succeeded: groupUnits.filter((unit) => unit.status === "succeeded").length,
            failed: groupUnits.filter((unit) => unit.status === "failed").length,
            pending: groupUnits.filter((unit) => unit.status === "pending").length,
        };
    });
}

/* ============================== 执行 ============================== */

/** 只依赖真实网关的两个方法；测试可注入同签名实现，但不改变业务语义。 */
export type SuiteGatewayLike = {
    submit: (input: BrowserToolInput, options?: SubmitOptions) => Promise<ToolTask>;
    retry: (taskId: string, input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
};

export type RunSuiteOptions = {
    gateway: SuiteGatewayLike;
    config: SuiteConfig;
    source: SuiteSourceAsset;
    /** 草稿 revision，写进任务便于判断“结果来自旧版本”。 */
    revision?: number | null;
    /** 并发上限，默认 2；套图是多次独立请求，不是一次批量调用。 */
    concurrency?: number;
    signal?: AbortSignal;
    /** 每个单元结束（成功/失败/待定）时回调，供 UI 增量渲染。 */
    onUnit?: (unit: SuiteUnitResult) => void;
    /** 图片模型是否可用；false 时直接拒绝提交（不静默改用其它模型）。 */
    imageModelReady?: boolean;
    wait?: WaitOptions;
};

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let cursor = 0;
    const size = Math.max(1, Math.min(limit, items.length));
    const runners = Array.from({ length: size }, async () => {
        while (cursor < items.length) {
            const index = cursor++;
            results[index] = await worker(items[index]);
        }
    });
    await Promise.all(runners);
    return results;
}

/**
 * 执行整套：先校验（不通过不提交任何请求），再按模块展开单元并真实提交。
 * 部分失败不回滚已完成单元，也不伪造成功。
 */
export async function runSuite(options: RunSuiteOptions): Promise<SuiteRunResult> {
    const { gateway, config, source, revision = null, concurrency = 2, signal, onUnit, imageModelReady = true } = options;
    const issues = validateSuiteConfig(config, { sourceReady: isSuiteSourceReady(source), imageModelReady });
    if (issues.length > 0) {
        throw new SuiteAdapterError("invalid-config", issues[0].message, issues);
    }
    const sourceCheck = validateSuiteSourceLimits(source);
    if (!sourceCheck.ok) throw new SuiteAdapterError(sourceCheck.code, sourceCheck.message);

    const snapshot = createSuiteSnapshot(config, revision ?? 0);
    const units = buildSuiteUnits(config);
    if (units.length === 0) throw new SuiteAdapterError("empty-plan", "当前配置没有可生成的套图单元。");

    const results = await runWithConcurrency(units, concurrency, async (unit) => {
        if (signal?.aborted) throw new SuiteAdapterError("aborted", "已取消本次生成。");
        const input = buildSuiteUnitInput({ config, unit, source, draftRevision: revision });
        try {
            const task = await gateway.submit(input, { signal, draftRevision: revision });
            const result = suiteUnitResultFromTask(unit, task);
            onUnit?.(result);
            return result;
        } catch (error) {
            // 提交期异常（含校验失败/网络）→ 该单元失败，其余单元继续。
            const message = error instanceof Error ? error.message : String(error);
            const result: SuiteUnitResult = {
                unitId: unit.id,
                moduleId: unit.moduleId,
                moduleLabel: unit.moduleLabel,
                kind: unit.kind,
                label: unit.label,
                index: unit.index,
                total: unit.total,
                status: "failed",
                items: [],
                error: { code: "submit-failed", message, retryable: true },
                attempts: 0,
                ...(unit.layoutId ? { layoutId: unit.layoutId } : {}),
            };
            onUnit?.(result);
            return result;
        }
    });

    return {
        units: results,
        groups: groupSuiteUnits(results),
        snapshot,
        fingerprint: snapshot.fingerprint,
        revision: revision ?? 0,
        submitted: results.length,
    };
}

/* ============================== 单张重试 ============================== */

export type RetrySuiteUnitOptions = {
    gateway: SuiteGatewayLike;
    config: SuiteConfig;
    source: SuiteSourceAsset;
    unit: SuiteUnit;
    previous: SuiteUnitResult;
    revision?: number | null;
    wait?: WaitOptions;
};

/**
 * 只重提一张：要求该单元有 taskId（已真实提交过），并且状态允许重试。
 * pending/unknown 的单元只能查询，禁止重提交（避免重复扣费）。
 */
export async function retrySuiteUnit(options: RetrySuiteUnitOptions): Promise<SuiteUnitResult> {
    const { gateway, config, source, unit, previous, revision = null, wait } = options;
    if (!previous.taskId) {
        throw new SuiteAdapterError("no-task", "该单元还没有提交过，不能重试。");
    }
    if (previous.status === "succeeded") {
        throw new SuiteAdapterError("already-succeeded", "该单元已成功，无需重试。");
    }
    if (previous.status === "pending") {
        throw new SuiteAdapterError("pending-unknown", "上游结果未确定，请等待查询结果，不能重复提交。");
    }
    const input = buildSuiteUnitInput({ config, unit, source, draftRevision: revision });
    const task = await gateway.retry(previous.taskId, input, wait);
    return { ...suiteUnitResultFromTask(unit, task), unitId: previous.unitId };
}

/** 结果是否来自旧配置（重新上传源图、改品牌基因后应为 true）。 */
export function suiteResultsStale(run: Pick<SuiteRunResult, "snapshot">, config: SuiteConfig): boolean {
    return isSuiteSnapshotStale(run.snapshot, config);
}

/** 供 UI 展示的汇总：总数 / 成功 / 失败 / 待定。 */
export function summarizeSuiteRun(units: SuiteUnitResult[]): { total: number; succeeded: number; failed: number; pending: number } {
    return {
        total: units.length,
        succeeded: units.filter((unit) => unit.status === "succeeded").length,
        failed: units.filter((unit) => unit.status === "failed").length,
        pending: units.filter((unit) => unit.status === "pending").length,
    };
}

/* ============================== 保存 ============================== */

export type SuiteSavedItem = { storageKey: string; url: string; bytes?: number; mimeType?: string; unitId: string; itemId: string };

export type SuiteSaveDeps = {
    /** 默认走 file-storage.uploadMediaFile（真实落盘 + objectURL）。 */
    upload?: (input: string | Blob, prefix?: string) => Promise<{ url: string; storageKey: string; bytes: number; mimeType: string }>;
};

/**
 * 保存单张结果到素材存储。没有 dataUrl/url 的结果直接报错，绝不生成空占位。
 */
export async function saveSuiteResultItem(item: ToolTaskResultItem, result: SuiteUnitResult, deps: SuiteSaveDeps = {}): Promise<SuiteSavedItem> {
    const payload = item.dataUrl ?? item.url;
    if (!payload) {
        throw new SuiteAdapterError("empty-result", "该结果没有可保存的内容（可能已被持久化策略剥离），请重新生成。");
    }
    const upload = deps.upload ?? (async (input: string | Blob, prefix?: string) => {
        const module = await import("@/services/file-storage");
        return module.uploadMediaFile(input, prefix);
    });
    const uploaded = await upload(payload, `suite-${result.moduleId}`);
    return {
        storageKey: uploaded.storageKey,
        url: uploaded.url,
        bytes: uploaded.bytes,
        mimeType: uploaded.mimeType,
        unitId: result.unitId,
        itemId: item.id,
    };
}

/** 配置指纹透传，UI 判定“结果过期”时不必重新推导。 */
export { suiteConfigFingerprint };
