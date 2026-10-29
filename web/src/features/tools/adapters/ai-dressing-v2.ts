/**
 * TASK-026：AI_DRESSING_V2 的适配器 —— 蒙版真实导出 → 20 字段合成 → 网关真跑 → 结果判定。
 *
 * 真实边界（不接受「演示成功」）：
 * - 蒙版用 `renderMaskPng` 逐槽位导出与源图同尺寸的 PNG，空蒙版直接抛错，不补造白图；
 * - 提交走共享任务网关的 `runTool`，返回空图片、缺 id 一律判失败；
 * - provider / 模型 取用户当前配置，页面上的 provider 字段是覆盖值（空串=跟随配置）。
 */
import { computeSnapshotHash } from "../registry/area-repair";
import { renderMaskPng, type MaskRenderDeps } from "./area-repair";
import {
    AI_DRESSING_V2_TOOL_ID,
    buildDressingSnapshot,
    composeDressingFields,
    composeDressingPrompt,
    dressingSnapshotHash,
    dressingTag,
    garmentMaskCoverage,
    missingDressingFields,
    slotMeta,
    tabLabel,
    tabSlots,
    validateDressing,
    type DressingFieldKey,
    type DressingSnapshot,
    type DressingValues,
    type GarmentSlotKey,
} from "../registry/ai-dressing-v2";
import type { BrowserToolInput, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask } from "@/services/api/tools/task-machine";
import type { ReferenceImage } from "@/types/image";

export class DressingAdapterError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
        super(message);
        this.name = "DressingAdapterError";
        this.code = code;
    }
}

/* ------------------------------------------------------------------ *
 * 蒙版导出
 * ------------------------------------------------------------------ */

export type DressingMaskRenderDeps = MaskRenderDeps;

export type DressingMaskExport = {
    slot: GarmentSlotKey;
    dataUrl: string;
    width: number;
    height: number;
    coverage: number;
};

/**
 * 逐槽位导出蒙版 PNG：坐标与源图严格同尺寸，落盘/提交都用这份像素。
 * 空蒙版不是「跳过」，而是直接失败——没有蒙版就没有穿衣部位。
 */
export async function renderDressingMasks(
    values: DressingValues,
    deps: DressingMaskRenderDeps = {},
): Promise<Partial<Record<GarmentSlotKey, DressingMaskExport>>> {
    const result: Partial<Record<GarmentSlotKey, DressingMaskExport>> = {};
    for (const slot of tabSlots(values.activeTab)) {
        const garment = values.garments[slot];
        if (!garment.imageUrl.trim()) continue;
        const meta = slotMeta(slot);
        if (garment.mask.strokes.length === 0) {
            throw new DressingAdapterError("mask-empty", `${meta.label}还没有标记穿衣区域：请涂抹或点「整件」`);
        }
        if (!garment.width || !garment.height) {
            throw new DressingAdapterError("image-size-unknown", `${meta.label}缺少图片尺寸，无法导出同尺寸蒙版；请重新上传`);
        }
        const rendered = await renderMaskPng(
            { strokes: garment.mask.strokes, feather: garment.mask.feather, inverted: garment.mask.inverted, autoExpand: garment.mask.autoExpand },
            { width: garment.width, height: garment.height },
            deps,
        );
        if (!rendered.dataUrl || !rendered.dataUrl.startsWith("data:image/")) {
            throw new DressingAdapterError("mask-export-failed", `${meta.label}蒙版导出为空，已阻止提交`);
        }
        result[slot] = {
            slot,
            dataUrl: rendered.dataUrl,
            width: rendered.width,
            height: rendered.height,
            // 覆盖率来自同源栅格化，不是估计值。
            coverage: Number(garmentMaskCoverage(garment).toFixed(4)),
        };
    }
    return result;
}

/* ------------------------------------------------------------------ *
 * 参考图
 * ------------------------------------------------------------------ */

export function toDressingReference(input: { id: string; name: string; dataUrl: string }, id: string): ReferenceImage {
    const dataUrl = input.dataUrl?.trim();
    if (!dataUrl) throw new DressingAdapterError("reference-empty", `${input.name || id} 没有可用的图片地址，请重新上传`);
    return { id, name: input.name || id, type: "image", dataUrl };
}

function garmentReference(garment: { assetId: string; name: string; imageUrl: string }, slot: GarmentSlotKey, index: number): ReferenceImage {
    return toDressingReference(
        { id: garment.assetId || `${slot}-${index}`, name: garment.name || slotMeta(slot).label, dataUrl: garment.imageUrl },
        `${slot}-${index}`,
    );
}

function maskReference(mask: DressingMaskExport, index: number): ReferenceImage {
    return {
        id: `${mask.slot}-mask-${index}`,
        name: `${mask.slot}-mask.png`,
        type: "image",
        dataUrl: mask.dataUrl,
    };
}

/* ------------------------------------------------------------------ *
 * 单元
 * ------------------------------------------------------------------ */

export type DressingUnit = {
    id: string;
    poseId: string;
    snapshot: DressingSnapshot;
    snapshotHash: string;
    prompt: string;
    fields: Record<DressingFieldKey, unknown>;
    references: ReferenceImage[];
    masks: Partial<Record<GarmentSlotKey, DressingMaskExport>>;
    /** 缺字段（提交前自检结果，空数组才允许发出去）。 */
    missingFields: DressingFieldKey[];
    /** 缺字段导致无法构建参考图时的原因（区别于「字段缺失但可提交」）。 */
    blockedReason?: string;
};

export type BuildDressingUnitOptions = {
    deps?: DressingMaskRenderDeps;
} & ({ poseId: string } | { poseIndex: number });

function pickPose(values: DressingValues, options: BuildDressingUnitOptions) {
    const pose = "poseId" in options
        ? values.poses.find((item) => item.id === options.poseId)
        : values.poses[options.poseIndex];
    if (!pose) throw new DressingAdapterError("pose-missing", "找不到这张模特参考，请重新上传再提交");
    return pose;
}

export async function buildDressingUnit(values: DressingValues, options: BuildDressingUnitOptions): Promise<DressingUnit> {
    const issue = validateDressing(values)[0];
    const pose = pickPose(values, options);
    const snapshot = buildDressingSnapshot({ values, pose });
    const masks = await renderDressingMasks(values, options.deps);

    const references: ReferenceImage[] = [toDressingReference({ id: pose.id, name: pose.name || "模特参考", dataUrl: pose.imageUrl }, `pose-${pose.id}`)];
    let cursor = 0;
    for (const garment of snapshot.garments) {
        references.push(garmentReference(values.garments[garment.slot], garment.slot, cursor));
        const mask = masks[garment.slot];
        if (mask) references.push(maskReference(mask, cursor));
        cursor += 1;
    }

    const maskUrls: Partial<Record<GarmentSlotKey, string>> = {};
    for (const [slot, mask] of Object.entries(masks) as [GarmentSlotKey, DressingMaskExport][]) maskUrls[slot] = mask.dataUrl;

    const fields = composeDressingFields(snapshot, {
        maskUrls,
        images: [],
        coverList: [pose.imageUrl, ...snapshot.garments.map((garment) => garment.imageUrl)],
    });

    const missingFields = missingDressingFields(snapshot, fields);
    return {
        id: `${pose.id}:${computeSnapshotHash(snapshot)}`,
        poseId: pose.id,
        snapshot,
        snapshotHash: dressingSnapshotHash(snapshot),
        prompt: composeDressingPrompt(snapshot),
        fields,
        references,
        masks,
        missingFields,
        blockedReason: issue && issue.level === "error" ? issue.message : undefined,
    };
}

/* ------------------------------------------------------------------ *
 * 提交
 * ------------------------------------------------------------------ */

export type DressingSubmitOptions = {
    /** 工具级模型覆盖；留空跟随用户当前配置。 */
    model?: string;
};

export function buildDressingInput(unit: DressingUnit, options: DressingSubmitOptions = {}): BrowserToolInput {
    if (unit.missingFields.length > 0) {
        throw new DressingAdapterError("fields-missing", `提交被拦下：缺少字段 ${unit.missingFields.join("、")}`);
    }
    if (unit.references.length === 0) {
        throw new DressingAdapterError("references-empty", "没有任何参考图，无法提交");
    }
    const input: BrowserToolInput = {
        toolId: AI_DRESSING_V2_TOOL_ID,
        prompt: unit.prompt,
        references: unit.references,
        count: Number(unit.fields.outputNum) || 1,
        fields: unit.fields,
    };
    if (options.model?.trim()) input.model = options.model.trim();
    return input;
}

/** 运行端口：默认走共享任务网关（useToolTaskStore.runTool）。 */
export interface DressingRunPort {
    run(input: BrowserToolInput, options?: WaitOptions): Promise<ToolTask>;
}

export function createDressingRunPort(): DressingRunPort {
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

export type DressingUnitStatus = "pending" | "succeeded" | "failed" | "cancelled" | "unknown";

export type DressingImage = { dataUrl?: string; url?: string; mimeType?: string };

export type DressingUnitOutcome = {
    unitId: string;
    poseId: string;
    snapshotHash: string;
    status: DressingUnitStatus;
    taskId?: string;
    images: DressingImage[];
    error?: { code: string; message: string; retryable?: boolean };
};

function taskImages(task: ToolTask): DressingImage[] {
    const items = task.result?.items ?? [];
    return items
        .filter((item) => item.kind === "image" && (item.dataUrl || item.url))
        .map((item) => ({ dataUrl: item.dataUrl, url: item.url, mimeType: item.mimeType }));
}

/** 上游「成功但没有图」= 失败；绝不把空结果包装成成功。 */
export function mapDressingTaskToOutcome(unit: DressingUnit, task: ToolTask): DressingUnitOutcome {
    const base = { unitId: unit.id, poseId: unit.poseId, snapshotHash: unit.snapshotHash, taskId: task.id };
    const images = taskImages(task);
    if (task.status === "succeeded") {
        if (images.length === 0) {
            return { ...base, status: "failed", images: [], error: { code: "empty-result", message: "上游返回成功但没有图片结果", retryable: true } };
        }
        return { ...base, status: "succeeded", images };
    }
    if (task.status === "failed") {
        return {
            ...base,
            status: "failed",
            images,
            error: task.error
                ? { code: task.error.code, message: task.error.message, retryable: task.error.retryable }
                : { code: "task-failed", message: "任务失败（上游未给出原因）", retryable: true },
        };
    }
    if (task.status === "cancelled") {
        return { ...base, status: "cancelled", images, error: { code: "cancelled", message: "任务已取消", retryable: false } };
    }
    return { ...base, status: "unknown", images, error: { code: `task-${task.status}`, message: "任务状态未知，只能查询或人工确认", retryable: true } };
}

export async function runDressingUnit(port: DressingRunPort, unit: DressingUnit, options: WaitOptions = {}): Promise<DressingUnitOutcome> {
    const input = buildDressingInput(unit);
    try {
        const task = await port.run(input, options);
        return mapDressingTaskToOutcome(unit, task);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            unitId: unit.id,
            poseId: unit.poseId,
            snapshotHash: unit.snapshotHash,
            status: "failed",
            images: [],
            error: { code: error instanceof DressingAdapterError ? error.code : "submit-failed", message, retryable: true },
        };
    }
}

/* ------------------------------------------------------------------ *
 * 结果视图（刷新后仍能判断是否为旧快照）
 * ------------------------------------------------------------------ */

export type DressingResultView = {
    status: DressingUnitStatus;
    images: DressingImage[];
    stale: boolean;
    snapshotHash: string;
    error?: DressingUnitOutcome["error"];
    /** 结果区标题：让用户看清这是哪个 Tab / 哪一版输入跑出来的。 */
    caption: string;
};

export function dressingResultView(
    outcome: DressingUnitOutcome,
    options: { currentHash?: string; tab?: DressingValues["activeTab"] } = {},
): DressingResultView {
    const currentHash = options.currentHash ?? outcome.snapshotHash;
    const tag = options.tab ? dressingTag(options.tab, outcome.poseId) : dressingTag("upper-lower", outcome.poseId);
    return {
        status: outcome.status,
        images: outcome.images,
        stale: currentHash !== outcome.snapshotHash,
        snapshotHash: outcome.snapshotHash,
        error: outcome.error,
        caption: options.tab ? `${tabLabel(options.tab)}｜${tag}` : tag,
    };
}

/** 结果区顶部的一行摘要（不复述成功，只说事实）。 */
export function describeDressingOutcome(outcome: DressingUnitOutcome): string {
    switch (outcome.status) {
        case "succeeded":
            return `已生成 ${outcome.images.length} 张`;
        case "failed":
            return outcome.error ? `失败：${outcome.error.message}` : "失败";
        case "cancelled":
            return "已取消";
        case "unknown":
            return "状态未知：任务可能还在上游运行，请稍后再查";
        default:
            return "进行中";
    }
}

const PANEL_RUNNING_STATUSES: ReadonlySet<ToolTask["status"]> = new Set<ToolTask["status"]>([
    "draft",
    "validating",
    "submitting",
    "running",
]);

function hasDeliverableImage(task: ToolTask): boolean {
    return (task.result?.items ?? []).some((item) =>
        Boolean(item.storageKey || item.dataUrl || item.url || item.blob),
    );
}

/**
 * 结果面板视图：把本页真实任务的结果项聚合成一个 `ToolTask`，交给共享 `ToolResult` 渲染。
 *
 * 为什么需要它：结果区原来只渲染本次会话的内存 outcomes，刷新后即使任务快照里的结果项
 * 已由 storageKey 复原出真实字节，页面上也没有标准结果面板（三动作入口随之消失）。
 * 这里**只做视图聚合**：items 原样引用真实任务的结果项（含 hydrate 复原的字节），
 * 不新建任务、不伪造/改写结果；没有结果项时返回 null。
 */
export function dressingResultPanelTask(tasks: readonly ToolTask[]): ToolTask | null {
    if (tasks.length === 0) return null;
    const ordered = [...tasks].sort((a, b) => a.createdAt - b.createdAt);
    const latest = ordered[ordered.length - 1];
    const items = ordered.flatMap((task) => task.result?.items ?? []);
    if (items.length === 0) return null;
    const receivedAt = ordered.reduce((acc, task) => Math.max(acc, task.result?.receivedAt ?? 0), 0);
    const status: ToolTask["status"] = ordered.some((task) => PANEL_RUNNING_STATUSES.has(task.status))
        ? "running"
        : ordered.some(hasDeliverableImage)
          ? "succeeded"
          : latest.status;
    return {
        ...latest,
        result: { items, receivedAt: receivedAt || latest.result?.receivedAt || latest.updatedAt },
        status,
    };
}
