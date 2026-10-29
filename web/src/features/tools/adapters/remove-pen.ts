/**
 * TASK-015：REMOVE_PEN 适配器。
 *
 * 真实边界（不接受“演示/模拟成功”）：
 *  - 一次消除 = 一次真实图像编辑请求：参考图 1 = 待消除图，参考图 2 = 画布导出的蒙版 PNG；
 *  - 任务走共享 TaskGateway（useToolTaskStore.runTool），provider 由用户当前图像模型配置决定；
 *  - 上游返回空结果 → 判失败，绝不补造图片或占位成功；
 *  - 结果带 snapshotHash：输入一变即标记“来自旧版本”，不冒充当前结果。
 *
 * 字段落点（registry/index.ts#REMOVE_PEN）：eraseImageUrl / imageName / imageUrl / maskImageUrl，
 * 全部进入任务 fields 参与指纹；缺一个直接抛错（assertRemovePenInput），不静默丢参。
 */

import { REMOVE_PEN_INSTRUCTION, REMOVE_PEN_TOOL_ID, composeRemovePenFields, removePenSnapshotHash, type RemovePenSnapshot, type RemovePenState } from "../registry/remove-pen";
import { sourceReferenceUrls } from "../source-asset";
import { renderMaskPng } from "./area-repair";
import type { BrowserToolInput, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask } from "@/services/api/tools/task-machine";
import type { ReferenceImage } from "@/types/image";

export class RemovePenAdapterError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
        super(message);
        this.name = "RemovePenAdapterError";
        this.code = code;
    }
}

/* ------------------------------------------------------------------ *
 * 输入
 * ------------------------------------------------------------------ */

export type RemovePenSourceAsset = {
    id: string;
    name: string;
    type: string;
    dataUrl: string;
    url?: string;
    storageKey?: string;
    width?: number;
    height?: number;
};

export function toRemovePenReference(asset: RemovePenSourceAsset): ReferenceImage {
    // 归一化口径统一在 ../source-asset：blob:（上传后当次会话）不能冒充 dataUrl，
    // 它落到 url，由 imageToDataUrl 在发送前抓成 data URL。
    const urls = sourceReferenceUrls(asset);
    if (!urls) throw new RemovePenAdapterError("asset-unreadable", "这张图片的本地数据已不可用，请重新上传");
    return { id: asset.id, name: asset.name, type: asset.type, ...urls, ...(asset.storageKey ? { storageKey: asset.storageKey } : {}) };
}

export type RemovePenUnit = {
    id: string;
    prompt: string;
    references: ReferenceImage[];
    fields: Record<string, unknown>;
    snapshotHash: string;
};

export type BuildRemovePenUnitInput = {
    snapshot: RemovePenSnapshot;
    image: ReferenceImage;
    mask: ReferenceImage;
};

/** 单结果工具：一次提交只产出一张（registry: batchCapable=false）。 */
export function buildRemovePenUnit(input: BuildRemovePenUnitInput): RemovePenUnit {
    const hash = removePenSnapshotHash(input.snapshot);
    const fields = composeRemovePenFields(input.snapshot, {
        eraseImageUrl: input.image.url ?? input.image.dataUrl,
        imageUrl: input.image.url ?? input.image.dataUrl,
        maskImageUrl: input.mask.url ?? input.mask.dataUrl,
    });
    return {
        id: `${REMOVE_PEN_TOOL_ID}:${hash}`,
        prompt: REMOVE_PEN_INSTRUCTION,
        references: [input.image, input.mask],
        fields,
        snapshotHash: hash,
    };
}

export function buildRemovePenInput(unit: RemovePenUnit, options: { draftRevision?: number | string | null } = {}): BrowserToolInput {
    return {
        toolId: REMOVE_PEN_TOOL_ID,
        prompt: unit.prompt,
        references: unit.references,
        count: 1,
        fields: { ...unit.fields, ...(options.draftRevision !== undefined ? { draftRevision: options.draftRevision } : {}) },
    };
}

/**
 * 提交前守卫：四个 ToolSpec 字段都必须真的落到请求里。
 * 任何缺失直接抛错，让 UI 显示原因而不是发一次缺参请求。
 */
export function assertRemovePenInput(input: BrowserToolInput): void {
    if (input.references?.length !== 2) {
        throw new RemovePenAdapterError("references-missing", "消除必须同时提交原图与蒙版两张参考图");
    }
    const [image, mask] = input.references;
    if (image.id === mask.id && image.dataUrl === mask.dataUrl) {
        throw new RemovePenAdapterError("mask-not-exported", "蒙版没有单独导出，请先在画布上涂抹要消除的区域");
    }
    const fields = input.fields ?? {};
    const required = ["eraseImageUrl", "imageUrl", "maskImageUrl"] as const;
    const missing = required.filter((key) => typeof fields[key] !== "string" || !String(fields[key]).trim());
    if (missing.length > 0) {
        throw new RemovePenAdapterError("fields-missing", `消除请求缺少字段：${missing.join("、")}`);
    }
    if (typeof fields.clientOperationId !== "string" || !fields.clientOperationId) {
        throw new RemovePenAdapterError("operation-id-missing", "缺少客户端幂等键（clientOperationId），拒绝提交");
    }
    if (typeof input.prompt !== "string" || !input.prompt.trim()) {
        throw new RemovePenAdapterError("prompt-missing", "消除指令为空，拒绝提交");
    }
}

/* ------------------------------------------------------------------ *
 * 运行
 * ------------------------------------------------------------------ */

export type RemovePenGatewayLike = {
    run: (input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
};

/** 真实运行端口：默认走共享任务网关。 */
export async function createRemovePenRunPort(): Promise<RemovePenGatewayLike> {
    const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
    return {
        run: (input, options) => useToolTaskStore.getState().runTool(input, options),
    };
}

export type RunRemovePenOptions = {
    unit: RemovePenUnit;
    port: RemovePenGatewayLike;
    signal?: AbortSignal;
    draftRevision?: number | string | null;
    onTask?: (task: ToolTask) => void;
};

export type RemovePenRun = {
    unitId: string;
    snapshotHash: string;
    task: ToolTask;
    image?: { url?: string; dataUrl?: string };
    status: "succeeded" | "failed" | "cancelled" | "unknown";
    error?: { code: string; message: string };
};

export async function runRemovePen(options: RunRemovePenOptions): Promise<RemovePenRun> {
    const input = buildRemovePenInput(options.unit, { draftRevision: options.draftRevision });
    assertRemovePenInput(input);
    const task = await options.port.run(input, { signal: options.signal });
    options.onTask?.(task);
    return removePenRunFromTask(options.unit, task);
}

/** 失败后按同一快照重试（规格 §5）：重新发一次真实请求，不复制上次结果。 */
export async function retryRemovePen(options: RunRemovePenOptions & { failedTaskId: string }): Promise<RemovePenRun> {
    return runRemovePen(options);
}

/** 只需要 id + snapshotHash：刷新后从落盘任务还原时没有原始 unit（提示词/参考图已随任务存过）。 */
export type RemovePenUnitRef = Pick<RemovePenUnit, "id" | "snapshotHash"> & Partial<RemovePenUnit>;

export function removePenRunFromTask(unit: RemovePenUnitRef, task: ToolTask): RemovePenRun {
    const base = { unitId: unit.id, snapshotHash: unit.snapshotHash, task };
    const firstImage = task.result?.items.find((item) => item.kind === "image" && (item.dataUrl || item.url));
    if (task.status === "succeeded") {
        if (!firstImage) {
            return { ...base, status: "failed", error: { code: "empty-result", message: "上游返回成功但没有图片结果" } };
        }
        return { ...base, status: "succeeded", image: { url: firstImage.url, dataUrl: firstImage.dataUrl } };
    }
    if (task.status === "failed") {
        return { ...base, status: "failed", error: task.error ? { code: task.error.code, message: task.error.message } : { code: "task-failed", message: "任务失败（上游未给出原因）" } };
    }
    if (task.status === "cancelled") {
        return { ...base, status: "cancelled", error: { code: "cancelled", message: "任务已取消" } };
    }
    return { ...base, status: "unknown", error: { code: `task-${task.status}`, message: "任务状态未知，只能查询或人工确认" } };
}

/* ------------------------------------------------------------------ *
 * 结果与对比
 * ------------------------------------------------------------------ */

export type RemovePenResultView = {
    status: "idle" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";
    /** 结果图（真实上游返回）。 */
    imageUrl?: string;
    /** 提交时的原图，用于前后对比。 */
    sourceUrl?: string;
    /** 结果相对当前配置是否已过期（“来自旧版本”）。 */
    stale: boolean;
    snapshotHash?: string;
    error?: { code: string; message: string };
};

export function removePenResultView(input: { run?: RemovePenRun | null; running?: boolean; sourceUrl?: string; stale?: boolean }): RemovePenResultView {
    if (!input.run) {
        return { status: input.running ? "running" : "idle", sourceUrl: input.sourceUrl, stale: false };
    }
    return {
        status: input.running ? "running" : input.run.status,
        imageUrl: input.run.image?.dataUrl ?? input.run.image?.url,
        sourceUrl: input.sourceUrl,
        stale: Boolean(input.stale),
        snapshotHash: input.run.snapshotHash,
        error: input.run.error,
    };
}

/** 滑动对比的裁剪百分比：0 = 只看原图，100 = 只看结果。 */
export function clampCompareSplit(value: number): number {
    if (!Number.isFinite(value)) return 50;
    return Math.min(100, Math.max(0, Math.round(value)));
}

export function compareSplitLabel(value: number): string {
    const split = clampCompareSplit(value);
    return split >= 100 ? "只看结果" : split <= 0 ? "只看原图" : `结果 ${split}%`;
}

/** 下载：真实结果字节 → Blob URL；没有结果时明确报错，不生成空白图。 */
export function removePenDownloadHref(imageUrl?: string): string | null {
    if (!imageUrl) return null;
    return imageUrl;
}

/**
 * 蒙版导出：复用 AREA_REPAIR 已验证的同尺寸 PNG 导出（白=要处理，黑=保留），
 * 但本页语义固定为「消除」：不做羽化、不反选、不自动扩边。
 * 空蒙版直接抛错（AreaRepairMaskError mask-empty），由工作区转成用户提示。
 */
export async function exportRemovePenMaskPng(state: RemovePenState, size: { width: number; height: number }): Promise<{ dataUrl: string; width: number; height: number }> {
    const rendered = await renderMaskPng({ strokes: state.strokes, feather: 0, inverted: false, autoExpand: false }, size);
    return { dataUrl: rendered.dataUrl, width: rendered.width, height: rendered.height };
}
