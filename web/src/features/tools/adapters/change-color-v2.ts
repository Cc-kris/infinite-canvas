/**
 * CHANGE_COLOR_V2 适配器：把「整套商品图 × 换色方案」拆成可独立重试的最小请求单元，
 * 并给出真实 provider 运行端口（走共享 TaskGateway，不伪造结果）。
 *
 * 设计要点（对照 page-specs/03-change-color-v2.md）：
 *  - 每个单元 = 1 张商品图 + 1 个换色方案 + 该图微调 + 部位/品质 → 1 次真实图像请求；
 *  - 整套一致性由「同一快照 + 同一方案集合」保证，单图微调会被记录并在结果面板标出；
 *  - 部分失败不丢失成功项：返回逐单元 outcome，重试只重跑失败单元；
 *  - 结果携带 snapshotHash，当前输入一变即标记为过期（不冒充新结果）。
 */

import type { BrowserToolInput, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
import type { ToolAssetRecord } from "@/services/api/tools/assets";
import type { ReferenceImage } from "@/types/image";

import {
    CHANGE_COLOR_V2_TOOL_ID,
    COLOR_QUALITY_LEVELS,
    DEFAULT_COLOR_ADJUSTMENT,
    adjustmentKey,
    adjustmentSummary,
    buildColorV2Snapshot,
    describeAdjustment,
    displayImageName,
    normalizeAdjustment,
    normalizeHex,
    planSwatch,
    quantizePalette,
    regionLabel,
    type ColorAdjustment,
    type ColorPlan,
    type ColorQualityKey,
    type ColorV2Snapshot,
    type ColorV2Values,
    type PaletteEntry,
} from "../registry/change-color-v2";

/* ------------------------------------------------------------------ *
 * 输入单元
 * ------------------------------------------------------------------ */

export interface ColorV2ImageInput {
    assetId: string;
    name: string;
    reference: ReferenceImage;
}

export interface ColorV2Unit {
    unitId: string;
    assetId: string;
    imageName: string;
    planId: string;
    planName: string;
    prompt: string;
    references: ReferenceImage[];
    fields: Record<string, unknown>;
    snapshotHash: string;
}

export function colorV2UnitId(assetId: string, planId: string): string {
    return `${assetId}::${planId}`;
}

export function assetRecordToReference(record: ToolAssetRecord): ReferenceImage {
    return {
        id: record.id,
        name: record.name,
        type: record.mimeType || "image/png",
        dataUrl: record.url,
        url: record.url,
        storageKey: record.storageKey,
    };
}

export function buildSuiteImages(records: ToolAssetRecord[], assetIds?: readonly string[]): ColorV2ImageInput[] {
    const byId = new Map(records.map((record) => [record.id, record]));
    const ordered = assetIds
        ? assetIds.map((id) => byId.get(id)).filter((record): record is ToolAssetRecord => Boolean(record))
        : records;
    return ordered.map((record) => ({
        assetId: record.id,
        name: record.name || "未命名商品图",
        reference: assetRecordToReference(record),
    }));
}

/** 方案颜色描述：hex 直接用色值，参考图方案引用参考图，不臆造色值。 */
export function describePlanColor(plan: ColorPlan): string {
    const swatch = planSwatch(plan);
    if (swatch) return `色值 ${swatch}`;
    if (plan.referenceAssetId) return `参考图「${plan.referenceName ?? plan.name}」中的颜色与材质`;
    return `方案「${plan.name}」的颜色`;
}

export interface ColorPromptInput {
    imageName: string;
    plan: ColorPlan;
    region: string;
    adjustment: ColorAdjustment;
    quality: ColorQualityKey;
    planCount: number;
}

/** Prompt 只描述「换哪里、换成什么、什么必须不变」，微调与品质如实写入。 */
export function composeColorV2Prompt(input: ColorPromptInput): string {
    const area = regionLabel(input.region) || "商品主体";
    const quality = COLOR_QUALITY_LEVELS.find((item) => item.key === input.quality) ?? COLOR_QUALITY_LEVELS[1];
    const lines = [
        `对上传商品图「${input.imageName}」做换色：把${area}改成${describePlanColor(input.plan)}。`,
        "保持商品轮廓、结构、缝合线、材质纹理、Logo 位置、光照方向、投影与背景不变；不要增加或删除任何部件。",
        "整张图其余区域保持原样，输出一张与原图同构图、同视角的图片。",
    ];
    const adjustments = describeAdjustment(input.adjustment);
    if (adjustments.length) lines.push(`颜色微调：${adjustments.join("，")}。`);
    if (input.planCount > 1) lines.push("这是同一套图的多个换色方案之一，单次请求只输出该方案的结果。");
    lines.push(`输出品质：${quality.label}。`);
    return lines.join("\n");
}

/** 组装整套请求单元：先图后方案，顺序稳定，便于结果矩阵对齐。 */
export function buildSuiteUnits(input: {
    images: ColorV2ImageInput[];
    values: ColorV2Values;
    snapshotHash: string;
    referenceById?: Map<string, ReferenceImage>;
    /** §7：任务带草稿版本与客户端幂等号，便于审计与去重。 */
    meta?: { draftRevision?: number | string | null; clientOperationId?: string | null };
}): ColorV2Unit[] {
    const units: ColorV2Unit[] = [];
    const meta = input.meta ?? {};
    for (const image of input.images) {
        // `imageName` 是提交键：上传后自动填文件名，用户改过展示名则用展示名。
        const imageName = displayImageName(image.assetId, image.name, input.values.imageNames);
        const adjustment = normalizeAdjustment(input.values.adjustments[image.assetId] ?? DEFAULT_COLOR_ADJUSTMENT);
        for (const plan of input.values.plans) {
            const references: ReferenceImage[] = [image.reference];
            if (plan.referenceAssetId && plan.referenceAssetId !== image.assetId) {
                const fromMap = input.referenceById?.get(plan.referenceAssetId);
                references.push(
                    fromMap ?? {
                        id: plan.referenceAssetId,
                        name: plan.referenceName ?? plan.name,
                        type: "image/png",
                        dataUrl: "",
                    },
                );
            }
            units.push({
                unitId: colorV2UnitId(image.assetId, plan.id),
                assetId: image.assetId,
                imageName,
                planId: plan.id,
                planName: plan.name,
                prompt: composeColorV2Prompt({
                    imageName,
                    plan,
                    region: input.values.region,
                    adjustment,
                    quality: input.values.quality,
                    planCount: input.values.plans.length,
                }),
                references,
                snapshotHash: input.snapshotHash,
                fields: {
                    imageName,
                    imageUrl: image.reference.url ?? "",
                    planId: plan.id,
                    planName: plan.name,
                    planHex: planSwatch(plan) ?? "",
                    referenceAssetId: plan.referenceAssetId ?? "",
                    region: input.values.region,
                    regionLabel: regionLabel(input.values.region),
                    quality: input.values.quality,
                    adjustment,
                    adjustmentKey: adjustmentKey(adjustment),
                    snapshotHash: input.snapshotHash,
                    draftRevision: meta.draftRevision ?? null,
                    clientOperationId: meta.clientOperationId ?? null,
                },
            });
        }
    }
    return units;
}

/** 引用必须可读；缺失时立即报错，不让「空参考」冒充成功。 */
export function assertUnitReferences(unit: ColorV2Unit): ColorV2Unit {
    const missing = unit.references.filter((reference) => !reference.dataUrl && !reference.storageKey && !reference.url);
    if (missing.length) {
        throw new Error(`参考图缺失：${missing.map((item) => item.name || item.id).join("、")}（单元 ${unit.unitId}）`);
    }
    return unit;
}

export function buildUnitInput(unit: ColorV2Unit, quality: ColorQualityKey): BrowserToolInput {
    const level = COLOR_QUALITY_LEVELS.find((item) => item.key === quality) ?? COLOR_QUALITY_LEVELS[1];
    return {
        toolId: CHANGE_COLOR_V2_TOOL_ID,
        prompt: unit.prompt,
        references: unit.references,
        quality: level.providerQuality,
        count: 1,
        fields: unit.fields,
    };
}

/* ------------------------------------------------------------------ *
 * 快照与运行
 * ------------------------------------------------------------------ */

export function buildSuiteFromValues(input: {
    records: ToolAssetRecord[];
    assetIds: readonly string[];
    values: ColorV2Values;
    referenceRecords?: ToolAssetRecord[];
    referenceById?: Map<string, ReferenceImage>;
    meta?: { draftRevision?: number | string | null; clientOperationId?: string | null };
}): { snapshot: ColorV2Snapshot; units: ColorV2Unit[] } {
    const snapshot = buildColorV2Snapshot({ assetIds: input.assetIds, values: input.values });
    const images = buildSuiteImages(input.records, input.assetIds);
    const referenceById = input.referenceById ?? new Map((input.referenceRecords ?? []).map((record) => [record.id, assetRecordToReference(record)]));
    return {
        snapshot,
        units: buildSuiteUnits({ images, values: input.values, snapshotHash: snapshot.hash, referenceById, meta: input.meta }),
    };
}

export type ColorV2UnitStatus = "succeeded" | "failed" | "unknown" | "cancelled";

export interface ColorV2UnitOutcome {
    unitId: string;
    assetId: string;
    planId: string;
    status: ColorV2UnitStatus;
    snapshotHash: string;
    taskId?: string;
    image?: { dataUrl?: string; url?: string; mimeType?: string; storageKey?: string; bytes?: number };
    error?: { code: string; message: string; retryable?: boolean };
}

export function mapTaskToOutcome(unit: ColorV2Unit, task: ToolTask): ColorV2UnitOutcome {
    const base = {
        unitId: unit.unitId,
        assetId: unit.assetId,
        planId: unit.planId,
        snapshotHash: unit.snapshotHash,
        taskId: task.id,
    };
    // 刷新后快照里只剩 storageKey（字节在 IndexedDB media_files），也算有结果图。
    const firstImage = task.result?.items.find(
        (item: ToolTaskResultItem) => item.kind === "image" && (item.dataUrl || item.url || item.storageKey),
    );
    if (task.status === "succeeded") {
        if (!firstImage) {
            return { ...base, status: "failed", error: { code: "empty-result", message: "上游返回成功但没有图片结果", retryable: true } };
        }
        return {
            ...base,
            status: "succeeded",
            image: {
                dataUrl: firstImage.dataUrl,
                url: firstImage.url,
                mimeType: firstImage.mimeType,
                storageKey: firstImage.storageKey,
                bytes: firstImage.bytes,
            },
        };
    }
    if (task.status === "failed") {
        return {
            ...base,
            status: "failed",
            error: task.error
                ? { code: task.error.code, message: task.error.message, retryable: task.error.retryable }
                : { code: "task-failed", message: "任务失败（上游未给出原因）", retryable: true },
        };
    }
    if (task.status === "cancelled") {
        return { ...base, status: "cancelled", error: { code: "cancelled", message: "任务已取消", retryable: false } };
    }
    // running / submitting / unknown：状态未知 ≠ 失败，也不伪造空结果。
    return { ...base, status: "unknown", error: { code: `task-${task.status}`, message: "任务状态未知，只能查询或人工确认", retryable: true } };
}

/** 真实运行端口：默认走共享任务网关（useToolTaskStore.runTool）。 */
export interface ColorV2RunPort {
    run(input: BrowserToolInput, options?: WaitOptions): Promise<ToolTask>;
}

export function createTaskStoreRunPort(): ColorV2RunPort {
    return {
        async run(input, options) {
            const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
            return useToolTaskStore.getState().runTool(input, options);
        },
    };
}

export interface RunSuiteOptions {
    port: ColorV2RunPort;
    quality: ColorQualityKey;
    concurrency?: number;
    signal?: AbortSignal;
    /** §7：写进任务记录的草稿版本（与 unit.fields.draftRevision 同源）。 */
    draftRevision?: number | string | null;
    onOutcome?: (outcome: ColorV2UnitOutcome, unit: ColorV2Unit, completed: number, total: number) => void;
}

/**
 * 按并发上限跑完整套单元；单单元失败不影响其它单元。
 * 取消后不再提交剩余单元，并标为 cancelled（不伪装成失败或成功）。
 */
export async function runColorV2Suite(units: ColorV2Unit[], options: RunSuiteOptions): Promise<ColorV2UnitOutcome[]> {
    const concurrency = Math.max(1, Math.min(6, Math.floor(options.concurrency ?? 3)));
    const outcomes: ColorV2UnitOutcome[] = new Array(units.length);
    let cursor = 0;
    let completed = 0;

    const worker = async () => {
        for (;;) {
            const index = cursor;
            cursor += 1;
            if (index >= units.length) return;
            const unit = units[index];
            if (options.signal?.aborted) {
                outcomes[index] = {
                    unitId: unit.unitId,
                    assetId: unit.assetId,
                    planId: unit.planId,
                    status: "cancelled",
                    snapshotHash: unit.snapshotHash,
                    error: { code: "aborted", message: "已取消，任务未提交", retryable: false },
                };
                continue;
            }
            let outcome: ColorV2UnitOutcome;
            try {
                const task = await options.port.run(buildUnitInput(unit, options.quality), { signal: options.signal, draftRevision: options.draftRevision ?? null });
                outcome = mapTaskToOutcome(unit, task);
            } catch (error) {
                outcome = {
                    unitId: unit.unitId,
                    assetId: unit.assetId,
                    planId: unit.planId,
                    status: "failed",
                    snapshotHash: unit.snapshotHash,
                    error: { code: "run-threw", message: error instanceof Error ? error.message : String(error), retryable: true },
                };
            }
            outcomes[index] = outcome;
            completed += 1;
            options.onOutcome?.(outcome, unit, completed, units.length);
        }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, units.length) }, () => worker()));
    return outcomes;
}

/* ------------------------------------------------------------------ *
 * 重试 / 分组 / 一致性
 * ------------------------------------------------------------------ */

export function retryableUnits(units: ColorV2Unit[], outcomes: ColorV2UnitOutcome[]): ColorV2Unit[] {
    const byId = new Map(outcomes.map((outcome) => [outcome.unitId, outcome]));
    return units.filter((unit) => {
        const outcome = byId.get(unit.unitId);
        return !outcome || outcome.status === "failed" || outcome.status === "unknown";
    });
}

export function mergeOutcomes(previous: ColorV2UnitOutcome[], next: ColorV2UnitOutcome[]): ColorV2UnitOutcome[] {
    const merged = new Map(previous.map((outcome) => [outcome.unitId, outcome]));
    for (const outcome of next) merged.set(outcome.unitId, outcome);
    return [...merged.values()];
}

export interface PlanComparisonRow {
    planId: string;
    planName: string;
    hex?: string;
    total: number;
    succeeded: number;
    failed: number;
    unknown: number;
    /** 该方案在整套商品图上的完成比例（不是“已全部完成”的替身）。 */
    ratio: number;
}

/** 统一对比矩阵的行汇总：列为商品图，由 UI 用 outcomes 拼装。 */
export function summarizeByPlan(units: ColorV2Unit[], outcomes: ColorV2UnitOutcome[]): PlanComparisonRow[] {
    const byId = new Map(outcomes.map((outcome) => [outcome.unitId, outcome]));
    const rows = new Map<string, PlanComparisonRow>();
    for (const unit of units) {
        const row =
            rows.get(unit.planId) ??
            {
                planId: unit.planId,
                planName: unit.planName,
                hex: typeof unit.fields.planHex === "string" && unit.fields.planHex ? unit.fields.planHex : undefined,
                total: 0,
                succeeded: 0,
                failed: 0,
                unknown: 0,
                ratio: 0,
            };
        row.total += 1;
        const status = byId.get(unit.unitId)?.status;
        if (status === "succeeded") row.succeeded += 1;
        else if (status === "failed" || status === "cancelled") row.failed += 1;
        else row.unknown += 1;
        rows.set(unit.planId, row);
    }
    return [...rows.values()].map((row) => ({ ...row, ratio: row.total ? row.succeeded / row.total : 0 }));
}

export interface SuiteConsistency {
    /** 方案集合是否覆盖到每张商品图（矩阵完整、无重无漏）。 */
    completeMatrix: boolean;
    /** 与该方案默认微调不一致的商品图，需人工确认是否仍算「同色」。 */
    deviatingUnits: Array<{ unitId: string; assetId: string; planId: string; summary: string }>;
    succeededUnits: number;
    totalUnits: number;
}

export function auditSuiteConsistency(units: ColorV2Unit[], outcomes: ColorV2UnitOutcome[]): SuiteConsistency {
    const succeeded = new Set(outcomes.filter((outcome) => outcome.status === "succeeded").map((outcome) => outcome.unitId));
    const assets = new Set(units.map((unit) => unit.assetId));
    const plans = new Set(units.map((unit) => unit.planId));
    const deviatingUnits = units
        .filter((unit) => {
            const adjustment = unit.fields.adjustment as ColorAdjustment | undefined;
            return adjustment ? adjustmentKey(adjustment) !== adjustmentKey(DEFAULT_COLOR_ADJUSTMENT) : false;
        })
        .map((unit) => ({
            unitId: unit.unitId,
            assetId: unit.assetId,
            planId: unit.planId,
            summary: adjustmentSummary(unit.fields.adjustment as ColorAdjustment),
        }));
    return {
        completeMatrix: units.length > 0 && units.length === assets.size * plans.size,
        deviatingUnits,
        succeededUnits: succeeded.size,
        totalUnits: units.length,
    };
}

/* ------------------------------------------------------------------ *
 * 商品图提色（真实像素采样）
 * ------------------------------------------------------------------ */

export interface SamplePaletteOptions {
    maxColors?: number;
    sampleSize?: number;
    crossOrigin?: string;
}

/** 用 canvas 采样商品图主色；环境不支持时抛错（UI 引导改用参考图），绝不返回编造色板。 */
export async function sampleImagePalette(url: string, options: SamplePaletteOptions = {}): Promise<PaletteEntry[]> {
    if (typeof document === "undefined" || typeof HTMLCanvasElement === "undefined") {
        throw new Error("当前环境不支持画布取样，请改用参考图方案");
    }
    if (!url) throw new Error("缺少可读取的图片地址");
    const image = await loadImage(url, options.crossOrigin);
    const sampleSize = Math.max(16, Math.min(256, Math.floor(options.sampleSize ?? 96)));
    const scale = Math.min(1, sampleSize / Math.max(image.width || sampleSize, image.height || sampleSize));
    const width = Math.max(1, Math.round((image.width || sampleSize) * scale));
    const height = Math.max(1, Math.round((image.height || sampleSize) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("无法创建画布上下文，提色不可用");
    context.drawImage(image, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);
    return quantizePalette(data, { maxColors: options.maxColors ?? 6, stride: 4 });
}

function loadImage(url: string, crossOrigin?: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        if (crossOrigin) image.crossOrigin = crossOrigin;
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("图片读取失败（可能是跨域限制）"));
        image.src = url;
    });
}

/** 色板 → 商品图提色方案（hex 已归一化；去重由 registry 负责）。 */
export function paletteToPlans(palette: PaletteEntry[], input: { assetId: string; assetName?: string; at?: number }): ColorPlan[] {
    return palette
        .map((entry) => normalizeHex(entry.hex))
        .filter((hex): hex is string => Boolean(hex))
        .map((hex) => ({
            id: `product-${input.assetId}-${hex.slice(1).toLowerCase()}`,
            name: `${input.assetName ? `${input.assetName} · ` : ""}${hex}`,
            source: "product" as const,
            hex,
            sourceAssetId: input.assetId,
            createdAt: input.at ?? Date.now(),
        }));
}
