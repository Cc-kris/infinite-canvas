/**
 * TASK-034：AI_DRESSING_XSY 的适配器 —— 蒙版真实导出 → 17 字段合成 → 网关真跑 → 结果判定。
 *
 * 真实边界（不接受「演示成功」）：
 * - 蒙版用 `renderMaskPng` 逐槽位导出与源图同尺寸 PNG；空蒙版直接抛错，不补造白图；
 * - 提交走共享任务网关的 `runTool`；返回成功但没有图 = 失败，不包装成成功；
 * - provider 取当前模型配置解析结果（页面字段是覆盖值，空串 = 跟随配置）。
 */
import type { BrowserToolInput, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask } from "@/services/api/tools/task-machine";
import type { ReferenceImage } from "@/types/image";

import {
    AI_DRESSING_XSY_FIELD_KEYS,
    AI_DRESSING_XSY_TOOL_ID,
    buildXsyPrompt,
    buildXsySnapshot,
    composeXsyFields,
    firstXsyError,
    validateXsy,
    xsyErrors,
    xsyMissingFields,
    xsyMaskCoverage,
    xsySlotMeta,
    xsySnapshotHash,
    xsyTabMeta,
    xsyTabSlots,
    xsyTag,
    type GarmentSlotKey,
    type XsyCapability,
    type XsyFieldKey,
    type XsySnapshot,
    type XsyStepId,
    type XsyTab,
    type XsyValues,
} from "../registry/ai-dressing-xsy";
import { renderMaskPng, type MaskRenderDeps } from "./area-repair";

export class XsyAdapterError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
        super(message);
        this.name = "XsyAdapterError";
        this.code = code;
    }
}

/* ------------------------------------------------------------------ *
 * 蒙版导出
 * ------------------------------------------------------------------ */

export type XsyMaskRenderDeps = MaskRenderDeps;

export type XsyMaskExport = {
    slot: GarmentSlotKey;
    dataUrl: string;
    width: number;
    height: number;
    coverage: number;
};

/**
 * 逐槽位导出蒙版 PNG：与源图严格同尺寸，提交的就是这份像素。
 * 空蒙版不是「跳过」，而是直接失败——没有蒙版就没有穿衣部位。
 */
export async function renderXsyMasks(
    values: XsyValues,
    deps: XsyMaskRenderDeps = {},
): Promise<Partial<Record<GarmentSlotKey, XsyMaskExport>>> {
    const result: Partial<Record<GarmentSlotKey, XsyMaskExport>> = {};
    for (const slot of xsyTabSlots(values.activeTab)) {
        const garment = values.garments[slot];
        if (!garment.imageUrl.trim()) continue;
        const meta = xsySlotMeta(slot);
        if (garment.mask.strokes.length === 0) {
            throw new XsyAdapterError("mask-empty", `${meta.label}还没有标记穿衣区域：请涂抹或点「整件」`);
        }
        if (!garment.width || !garment.height) {
            throw new XsyAdapterError("image-size-unknown", `${meta.label}缺少图片尺寸，无法导出同尺寸蒙版；请重新上传`);
        }
        const rendered = await renderMaskPng(
            {
                strokes: garment.mask.strokes,
                feather: garment.mask.feather,
                inverted: garment.mask.inverted,
                autoExpand: garment.mask.autoExpand,
            },
            { width: garment.width, height: garment.height },
            deps,
        );
        if (!rendered.dataUrl || !rendered.dataUrl.startsWith("data:image/")) {
            throw new XsyAdapterError("mask-export-failed", `${meta.label}蒙版导出为空，已阻止提交`);
        }
        result[slot] = {
            slot,
            dataUrl: rendered.dataUrl,
            width: rendered.width,
            height: rendered.height,
            coverage: Number((garment.mask.strokes.length ? xsyCoverageOf(values, slot) : 0).toFixed(4)),
        };
    }
    return result;
}

function xsyCoverageOf(values: XsyValues, slot: GarmentSlotKey): number {
    // 覆盖率来自同源栅格化（registry 侧实现），不是估计值。
    return xsyMaskCoverage(values.garments[slot]);
}

/* ------------------------------------------------------------------ *
 * 参考图
 * ------------------------------------------------------------------ */

export function toXsyReference(input: { id: string; name: string; dataUrl: string }, id: string): ReferenceImage {
    const dataUrl = input.dataUrl?.trim();
    if (!dataUrl) throw new XsyAdapterError("reference-empty", `${input.name || id} 没有可用的图片地址，请重新上传`);
    return { id, name: input.name || id, type: "image", dataUrl };
}

function snapshotReference(snapshot: XsySnapshot, id: string, name: string, dataUrl: string): ReferenceImage {
    if (!dataUrl.trim()) throw new XsyAdapterError("reference-empty", `${name} 没有可用的图片地址，请重新上传`);
    return toXsyReference({ id, name, dataUrl }, `${id}-${snapshot.modelPose}`);
}

/* ------------------------------------------------------------------ *
 * 单元
 * ------------------------------------------------------------------ */

export type XsyUnit = {
    id: string;
    tab: XsyTab;
    step: XsyStepId;
    snapshot: XsySnapshot;
    snapshotHash: string;
    prompt: string;
    fields: Record<XsyFieldKey, unknown>;
    references: ReferenceImage[];
    masks: Partial<Record<GarmentSlotKey, XsyMaskExport>>;
    /** 缺字段（提交前自检结果，空数组才允许发出去）。 */
    missingFields: XsyFieldKey[];
};

export type BuildXsyUnitOptions = {
    capability: XsyCapability;
    /** 页面 provider 为空时，用当前模型配置解析出的 provider 填入快照。 */
    provider?: string;
    deps?: XsyMaskRenderDeps;
    /** 单元 id 生成器（测试可注入稳定值）。 */
    newId?: () => string;
};

/** 有蒙版 URL 的快照（真实导出后回填，绝不用占位串）。 */
export function withXsyMaskUrls(snapshot: XsySnapshot, masks: Partial<Record<GarmentSlotKey, XsyMaskExport>>): XsySnapshot {
    return {
        ...snapshot,
        garments: snapshot.garments.map((garment) => {
            const mask = masks[garment.slot];
            if (!mask) return garment;
            return {
                ...garment,
                maskUrl: mask.dataUrl,
                maskCoverage: mask.coverage,
                width: garment.width || mask.width,
                height: garment.height || mask.height,
            };
        }),
    };
}

/**
 * 构建提交单元：先按同一份规则全量校验，再真实导出蒙版、合成 17 字段、组参考图。
 * 任何一步不成立都抛错，不做「部分成功」。
 */
export async function buildXsyUnit(values: XsyValues, options: BuildXsyUnitOptions): Promise<XsyUnit> {
    const issues = xsyErrors(validateXsy(values, options.capability));
    const blocking = firstXsyError(issues);
    if (blocking) throw new XsyAdapterError(blocking.code, blocking.message);

    const provider = (options.provider ?? "").trim() || values.provider.trim() || options.capability.provider;
    if (!provider) throw new XsyAdapterError("provider-missing", "没有解析到 provider，无法提交");

    const masks = await renderXsyMasks(values, options.deps);
    const snapshot = withXsyMaskUrls(buildXsySnapshot(values, { provider }), masks);
    const missingFields = xsyMissingFields(snapshot);
    if (missingFields.length > 0) {
        throw new XsyAdapterError("fields-missing", `提交被拦下：缺少字段 ${missingFields.join("、")}`);
    }
    const fields = composeXsyFields(snapshot);
    const unknownKeys = Object.keys(fields).filter((key) => !(AI_DRESSING_XSY_FIELD_KEYS as readonly string[]).includes(key));
    if (unknownKeys.length > 0 || Object.keys(fields).length !== AI_DRESSING_XSY_FIELD_KEYS.length) {
        throw new XsyAdapterError("fields-contract", `字段契约不一致：多出 ${unknownKeys.join("、") || "无"}，共 ${Object.keys(fields).length} 个`);
    }

    const references: ReferenceImage[] = [
        snapshotReference(snapshot, "model", "模特图", snapshot.modelImageUrl),
    ];
    for (const garment of snapshot.garments) {
        const meta = xsySlotMeta(garment.slot);
        references.push(snapshotReference(snapshot, `${garment.slot}-garment`, `${meta.label}图`, garment.imageUrl));
    }
    for (const garment of snapshot.garments) {
        references.push(
            toXsyReference(
                { id: `${garment.slot}-mask`, name: `${garment.slot}-mask.png`, dataUrl: garment.maskUrl },
                `${garment.slot}-mask-${snapshot.modelPose}`,
            ),
        );
    }

    const snapshotHash = xsySnapshotHash(snapshot);
    return {
        id: options.newId ? options.newId() : `xsy-${snapshotHash}`,
        tab: snapshot.tab,
        step: snapshot.step,
        snapshot,
        snapshotHash,
        prompt: buildXsyPrompt(snapshot),
        fields,
        references,
        masks,
        missingFields,
    };
}

/* ------------------------------------------------------------------ *
 * 提交
 * ------------------------------------------------------------------ */

export type XsySubmitOptions = { model?: string };

export function buildXsyInput(unit: XsyUnit, options: XsySubmitOptions = {}): BrowserToolInput {
    if (unit.missingFields.length > 0) {
        throw new XsyAdapterError("fields-missing", `提交被拦下：缺少字段 ${unit.missingFields.join("、")}`);
    }
    if (unit.references.length === 0) {
        throw new XsyAdapterError("references-empty", "没有任何参考图，无法提交");
    }
    const input: BrowserToolInput = {
        toolId: AI_DRESSING_XSY_TOOL_ID,
        prompt: unit.prompt,
        references: unit.references,
        count: Number(unit.fields.outputNum) || 1,
        fields: unit.fields,
    };
    if (options.model?.trim()) input.model = options.model.trim();
    return input;
}

/** 运行端口：默认走共享任务网关（useToolTaskStore.runTool）。 */
export interface XsyRunPort {
    run(input: BrowserToolInput, options?: WaitOptions): Promise<ToolTask>;
}

export function createXsyRunPort(): XsyRunPort {
    return {
        async run(input, options) {
            const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
            return useToolTaskStore.getState().runTool(input, options);
        },
    };
}

/* ------------------------------------------------------------------ *
 * 结果
 * ------------------------------------------------------------------ */

export type XsyUnitStatus = "pending" | "succeeded" | "failed" | "cancelled" | "unknown";

export type XsyImage = { dataUrl?: string; url?: string; mimeType?: string };

export type XsyOutcome = {
    unitId: string;
    tab: XsyTab;
    step: XsyStepId;
    snapshotHash: string;
    status: XsyUnitStatus;
    taskId?: string;
    images: XsyImage[];
    error?: { code: string; message: string; retryable?: boolean };
};

function taskImages(task: ToolTask): XsyImage[] {
    const items = task.result?.items ?? [];
    return items
        .filter((item) => item.kind === "image" && (item.dataUrl || item.url))
        .map((item) => ({ dataUrl: item.dataUrl, url: item.url, mimeType: item.mimeType }));
}

/** 上游「成功但没有图」= 失败；绝不把空结果包装成成功。 */
export function mapXsyTaskToOutcome(unit: XsyUnit, task: ToolTask): XsyOutcome {
    const base = { unitId: unit.id, tab: unit.tab, step: unit.step, snapshotHash: unit.snapshotHash, taskId: task.id };
    const images = taskImages(task);
    if (task.status === "succeeded") {
        if (images.length === 0) {
            return { ...base, status: "failed", images: [], error: { code: "empty-result", message: "上游返回成功但没有图，按失败处理", retryable: true } };
        }
        return { ...base, status: "succeeded", images };
    }
    if (task.status === "cancelled") return { ...base, status: "cancelled", images };
    if (task.status === "unknown") {
        return {
            ...base,
            status: "unknown",
            images,
            error: { code: "unknown", message: "任务结果未知，请先查询任务状态再决定是否重试", retryable: false },
        };
    }
    if (task.status === "failed") {
        const message = task.error?.message || "任务失败";
        return { ...base, status: "failed", images, error: { code: task.error?.code || "submit-failed", message, retryable: task.error?.retryable ?? true } };
    }
    return { ...base, status: "pending", images };
}

export type XsyResultView = {
    stale: boolean;
    status: XsyUnitStatus;
    caption: string;
    images: XsyImage[];
};

/**
 * 结果图来源：本会话内存里有实时结果就用实时结果；否则回落到持久化任务的图。
 *
 * 刷新恢复（2026-10-29 真实跑批暴露）：任务已由 store 从 localStorage/IndexedDB 还原，
 * 但工作区的 outcome 只活在内存里，若不回落，历史坞显示「已完成 1 条」而结果区空白，
 * 下载/存资产/发画布全都没入口。
 */
export function xsyDisplayImages(outcomeImages: XsyImage[] | undefined, restoredImages: XsyImage[]): XsyImage[] {
    return outcomeImages && outcomeImages.length > 0 ? outcomeImages : restoredImages;
}

/** 结果是否属于当前快照（页面 §4：结果必须与提交快照一致，旧结果要标注）。 */
export function xsyResultView(outcome: XsyOutcome, options: { currentHash: string; tab?: XsyTab }): XsyResultView {
    const tab = options.tab ?? outcome.tab;
    const stale = outcome.snapshotHash !== options.currentHash;
    return {
        stale,
        status: outcome.status,
        images: outcome.images,
        caption: `${xsyTabMeta(tab).label} · ${xsyTag(tab, outcome.step)}${stale ? " · 来自旧版本配置" : ""}`,
    };
}

export type RunXsyOptions = {
    port?: XsyRunPort;
    model?: string;
    wait?: WaitOptions;
};

/** 提交并等待结果：只用真实端口，失败按真实状态回传。 */
export async function runXsyUnit(unit: XsyUnit, options: RunXsyOptions = {}): Promise<XsyOutcome> {
    const port = options.port ?? createXsyRunPort();
    try {
        const task = await port.run(buildXsyInput(unit, { model: options.model }), options.wait);
        return mapXsyTaskToOutcome(unit, task);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            unitId: unit.id,
            tab: unit.tab,
            step: unit.step,
            snapshotHash: unit.snapshotHash,
            status: "failed",
            images: [],
            error: { code: error instanceof XsyAdapterError ? error.code : "submit-failed", message, retryable: true },
        };
    }
}
