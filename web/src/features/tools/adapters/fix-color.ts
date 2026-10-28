/**
 * TASK-019：FIX_COLOR「色差修复」适配器。
 *
 * 真实边界（不接受“演示/模拟成功”）：
 *  - 一次修复 = 一次真实图像编辑请求：参考图 1 = 色差源图，参考图 2 = 画布导出的区域蒙版 PNG；
 *  - 指令由「区域色 → 目标色 + 版本语义」真实拼出（见 buildFixColorPrompt），下发给用户当前图像模型；
 *  - 任务走共享 TaskGateway（useToolTaskStore.runTool），provider 由用户模型配置决定；
 *  - 上游返回空结果 → 判失败，绝不补造图片或占位成功；
 *  - 结果带 snapshotHash：输入一变即标记“来自旧版本”，不冒充当前结果。
 *
 * 字段落点（registry/index.ts#FIX_COLOR）：fixColorSegUrl（区域色）/ fixColorUrl（目标色）/
 * imageName / imageSegUrl（区域蒙版）/ imageUrl（源图）/ version 全部进入任务 fields 参与指纹；
 * imageResultUrl 是结果字段，成功后由结果资产回填，不参与提交。
 */

import { sourceReferenceUrls } from "../source-asset";
import { renderMaskPng } from "./area-repair";
import type { BrowserToolInput, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask } from "@/services/api/tools/task-machine";
import type { ReferenceImage } from "@/types/image";
import { FIX_COLOR_TOOL_ID, describeColorDelta, colorDeltaE, composeFixColorFields, fixColorSnapshotHash, getFixColorVersion, normalizeColorHex, type FixColorSnapshot, type FixColorState } from "../registry/fix-color";

export class FixColorAdapterError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
        super(message);
        this.name = "FixColorAdapterError";
        this.code = code;
    }
}

/* ------------------------------------------------------------------ *
 * 输入
 * ------------------------------------------------------------------ */

export type FixColorSourceAsset = {
    id: string;
    name: string;
    type: string;
    dataUrl: string;
    url?: string;
    storageKey?: string;
    width?: number;
    height?: number;
};

export function toFixColorReference(asset: FixColorSourceAsset): ReferenceImage {
    const urls = sourceReferenceUrls(asset);
    if (!urls) throw new FixColorAdapterError("asset-unreadable", "这张图片的本地数据已不可用，请重新上传");
    return {
        id: asset.id,
        name: asset.name,
        type: asset.type,
        ...urls,
        ...(asset.storageKey ? { storageKey: asset.storageKey } : {}),
    };
}

/** 真实指令：把区域色/目标色/版本语义写成可执行的编辑要求，而不是一句“修色差”。 */
export function buildFixColorPrompt(snapshot: FixColorSnapshot): string {
    const version = getFixColorVersion(snapshot.version);
    const region = normalizeColorHex(snapshot.regionColor)?.hex ?? snapshot.regionColor;
    const target = normalizeColorHex(snapshot.targetColor)?.hex ?? snapshot.targetColor;
    const delta = describeColorDelta(colorDeltaE(region, target));
    return [
        `参考图 1 是待校正的商品图，参考图 2 中白色区域是需要校正的色彩区域。`,
        `把参考图 2 白色区域内偏向 ${region} 的颜色校正到参考色 ${target}（${delta}）。`,
        `${version.instruction}。`,
        `只修改白区内的颜色，保持商品轮廓、文字、logo、纹理与背景不变，不新增或删除任何元素，输出与原图相同尺寸。`,
    ].join("");
}

export type FixColorUnit = {
    id: string;
    prompt: string;
    references: ReferenceImage[];
    fields: Record<string, unknown>;
    snapshotHash: string;
};

export type BuildFixColorUnitInput = {
    snapshot: FixColorSnapshot;
    image: ReferenceImage;
    mask: ReferenceImage;
};

/** 单结果工具：一次提交只产出一张（registry: batchCapable=false）。 */
export function buildFixColorUnit(input: BuildFixColorUnitInput): FixColorUnit {
    const hash = fixColorSnapshotHash(input.snapshot);
    const fields = composeFixColorFields(input.snapshot, {
        imageUrl: input.image.url ?? input.image.dataUrl,
        imageSegUrl: input.mask.url ?? input.mask.dataUrl,
    });
    return {
        id: `${FIX_COLOR_TOOL_ID}:${hash}`,
        prompt: buildFixColorPrompt(input.snapshot),
        references: [input.image, input.mask],
        fields: { ...fields, clientOperationId: input.snapshot.clientOperationId },
        snapshotHash: hash,
    };
}

export function buildFixColorInput(unit: FixColorUnit, options: { draftRevision?: number | string | null } = {}): BrowserToolInput {
    return {
        toolId: FIX_COLOR_TOOL_ID,
        prompt: unit.prompt,
        references: unit.references,
        count: 1,
        fields: { ...unit.fields, ...(options.draftRevision !== undefined ? { draftRevision: options.draftRevision } : {}) },
    };
}

const REQUIRED_FIELDS = ["fixColorSegUrl", "fixColorUrl", "imageName", "imageSegUrl", "imageUrl", "version"] as const;

/**
 * 提交前守卫：ToolSpec 的六个提交字段必须真的落到请求里，缺一个就抛错，
 * 让 UI 说明原因，而不是发一次缺参请求、再拿一个不可解释的失败。
 */
export function assertFixColorInput(input: BrowserToolInput): void {
    if (input.references?.length !== 2) {
        throw new FixColorAdapterError("references-missing", "色差修复需要两张参考图（源图 + 区域蒙版），当前不完整");
    }
    const fields = input.fields ?? {};
    for (const field of REQUIRED_FIELDS) {
        const value = fields[field];
        if (typeof value !== "string" || !value.trim()) {
            throw new FixColorAdapterError(`field-missing:${field}`, `缺少字段 ${field}，拒绝提交`);
        }
    }
    if (!normalizeColorHex(fields.fixColorSegUrl) || !normalizeColorHex(fields.fixColorUrl)) {
        throw new FixColorAdapterError("color-invalid", "区域色或目标色不是合法 #RRGGBB(#AA) 颜色，拒绝提交");
    }
    if (typeof fields.clientOperationId !== "string" || !fields.clientOperationId.trim()) {
        throw new FixColorAdapterError("operation-id-missing", "缺少客户端幂等键（clientOperationId），拒绝提交");
    }
    if (typeof input.prompt !== "string" || !input.prompt.trim()) {
        throw new FixColorAdapterError("prompt-missing", "校正指令为空，拒绝提交");
    }
}

/* ------------------------------------------------------------------ *
 * 运行
 * ------------------------------------------------------------------ */

export type FixColorGatewayLike = {
    run: (input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
};

/** 真实运行端口：默认走共享任务网关。 */
export async function createFixColorRunPort(): Promise<FixColorGatewayLike> {
    const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
    return {
        run: (input, options) => useToolTaskStore.getState().runTool(input, options),
    };
}

export type RunFixColorOptions = {
    unit: FixColorUnit;
    port: FixColorGatewayLike;
    signal?: AbortSignal;
    draftRevision?: number | string | null;
    onTask?: (task: ToolTask) => void;
};

export type FixColorRun = {
    unitId: string;
    snapshotHash: string;
    task: ToolTask;
    image?: { url?: string; dataUrl?: string };
    status: "succeeded" | "failed" | "cancelled" | "unknown";
    error?: { code: string; message: string };
};

export async function runFixColor(options: RunFixColorOptions): Promise<FixColorRun> {
    const input = buildFixColorInput(options.unit, { draftRevision: options.draftRevision });
    assertFixColorInput(input);
    const task = await options.port.run(input, { signal: options.signal });
    options.onTask?.(task);
    return fixColorRunFromTask(options.unit, task);
}

/** 失败后按同一快照重试（规格 §5）：重新发一次真实请求，不复制上次结果。 */
export async function retryFixColor(options: RunFixColorOptions & { failedTaskId: string }): Promise<FixColorRun> {
    return runFixColor(options);
}

export function fixColorRunFromTask(unit: FixColorUnit, task: ToolTask): FixColorRun {
    const base = { unitId: unit.id, snapshotHash: unit.snapshotHash, task };
    const firstImage = task.result?.items.find((item) => item.kind === "image" && (item.dataUrl || item.url));
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
            error: task.error ? { code: task.error.code, message: task.error.message } : { code: "task-failed", message: "任务失败（上游未给出原因）" },
        };
    }
    if (task.status === "cancelled") {
        return { ...base, status: "cancelled", error: { code: "cancelled", message: "任务已取消" } };
    }
    return { ...base, status: "unknown", error: { code: `task-${task.status}`, message: "任务状态未知，只能查询或人工确认" } };
}

/* ------------------------------------------------------------------ *
 * 蒙版导出 / 结果视图
 * ------------------------------------------------------------------ */

/** 区域蒙版导出：复用共享同尺寸 PNG 渲染（白 = 待校正，黑 = 保留），羽化与反选按页面状态生效。 */
export async function exportFixColorMaskPng(state: Pick<FixColorState, "strokes" | "feather" | "inverted" | "autoExpand">, size: { width: number; height: number }): Promise<{ dataUrl: string; width: number; height: number }> {
    const rendered = await renderMaskPng({ strokes: state.strokes, feather: state.feather, inverted: state.inverted, autoExpand: state.autoExpand }, size);
    return { dataUrl: rendered.dataUrl, width: rendered.width, height: rendered.height };
}

export function clampCompareSplit(value: number): number {
    if (!Number.isFinite(value)) return 50;
    return Math.min(100, Math.max(0, Math.round(value)));
}

export type FixColorResultView = {
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

export function fixColorResultView(input: { run?: FixColorRun | null; running?: boolean; sourceUrl?: string; stale?: boolean }): FixColorResultView {
    if (!input.run) {
        return { status: input.running ? "running" : "idle", sourceUrl: input.sourceUrl, stale: false };
    }
    return {
        status: input.running ? "running" : input.run.status,
        imageUrl: input.run.image?.url ?? input.run.image?.dataUrl,
        sourceUrl: input.sourceUrl,
        stale: input.stale ?? false,
        snapshotHash: input.run.snapshotHash,
        error: input.run.error,
    };
}

/** 结果文件名：带上原图名，避免一串 hash。 */
export function fixColorDownloadName(imageName: string, index = 1): string {
    const base = (imageName || "fix-color")
        .replace(/\.[^.]+$/, "")
        .replace(/[\\/:*?"<>|]+/g, "-")
        .slice(0, 60);
    const suffix = index > 1 ? `-${index}` : "";
    return `${base || "fix-color"}-color-fixed${suffix}.png`;
}
