/**
 * TASK-021：HAND_REPAIR 适配器。
 *
 * 真实边界（不接受“演示/模拟成功”）：
 *  - 一次生成 = 一次真实图像编辑请求：参考图 1 = 源图，参考图 2 = 画布导出的同尺寸蒙版 PNG；
 *  - 任务走共享 TaskGateway（useToolTaskStore.runTool），provider 由用户当前图像模型配置决定；
 *  - outputNum 1–4 → 拆成 N 个真实单元并发提交（每个单元 1 张），不做“一张图复制四份”；
 *  - 上游返回空结果 → 判失败，绝不补造图片；
 *  - 结果带 snapshotHash：输入一变即标记“来自旧版本”，不冒充当前配置的结果。
 *
 * 字段落点（registry/index.ts#HAND_REPAIR）：imageName / imageUrl / maskUrl / outputNum / personType，
 * 全部进入任务 fields 参与指纹；缺一个直接抛错（assertHandRepairInput），不静默丢参。
 */

import { HAND_REPAIR_TOOL_ID, composeHandRepairFields, composeHandRepairInstruction, handRepairSnapshotHash, type HandRepairSnapshot, type HandRepairState } from "../registry/hand-repair";
import { sourceReferenceUrls } from "../source-asset";
import { renderMaskPng } from "./area-repair";
import type { BrowserToolInput, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask } from "@/services/api/tools/task-machine";
import type { ReferenceImage } from "@/types/image";

export class HandRepairAdapterError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
        super(message);
        this.name = "HandRepairAdapterError";
        this.code = code;
    }
}

/* ------------------------------------------------------------------ *
 * 输入
 * ------------------------------------------------------------------ */

export type HandRepairSourceAsset = {
    id: string;
    name: string;
    type: string;
    dataUrl: string;
    url?: string;
    storageKey?: string;
    width?: number;
    height?: number;
};

export function toHandRepairReference(asset: HandRepairSourceAsset): ReferenceImage {
    const urls = sourceReferenceUrls(asset);
    if (!urls) {
        throw new HandRepairAdapterError("asset-unreadable", "这张图片的本地数据已不可用，请重新上传");
    }
    return {
        id: asset.id,
        name: asset.name,
        type: asset.type,
        ...urls,
        ...(asset.storageKey ? { storageKey: asset.storageKey } : {}),
    };
}

export type HandRepairUnit = {
    id: string;
    /** 第几张（1-based），用于结果排序与“第 2 张失败”这类精确提示。 */
    index: number;
    total: number;
    prompt: string;
    references: ReferenceImage[];
    fields: Record<string, unknown>;
    snapshotHash: string;
};

export type BuildHandRepairUnitsInput = {
    snapshot: HandRepairSnapshot;
    image: ReferenceImage;
    mask: ReferenceImage;
};

/**
 * 一张源图 + 一张蒙版 → N 个单元（N = outputNum）。
 * 每个单元的指令都带人物类型约束；index 只进 unit.id，不进 prompt（避免 prompt 抖动影响指纹）。
 */
export function buildHandRepairUnits(input: BuildHandRepairUnitsInput): HandRepairUnit[] {
    const hash = handRepairSnapshotHash(input.snapshot);
    const prompt = composeHandRepairInstruction(input.snapshot);
    const fields = composeHandRepairFields(input.snapshot, {
        imageUrl: input.image.url ?? input.image.dataUrl,
        maskUrl: input.mask.url ?? input.mask.dataUrl,
    });
    const total = Math.max(1, Math.min(4, Math.round(input.snapshot.outputNum)));
    return Array.from({ length: total }, (_, i) => ({
        id: `${HAND_REPAIR_TOOL_ID}:${hash}:${i + 1}`,
        index: i + 1,
        total,
        prompt,
        references: [input.image, input.mask],
        fields,
        snapshotHash: hash,
    }));
}

/** 单元 → 网关请求：count=1（N 张由 N 个单元实现，避免上游把 count 当“同图复制”）。 */
export function buildHandRepairInput(unit: HandRepairUnit, options: { draftRevision?: number | string | null } = {}): BrowserToolInput {
    return {
        toolId: HAND_REPAIR_TOOL_ID,
        prompt: unit.prompt,
        references: unit.references,
        count: 1,
        fields: {
            ...unit.fields,
            ...(options.draftRevision !== undefined ? { draftRevision: options.draftRevision } : {}),
        },
    };
}

/**
 * 提交前守卫：五个 ToolSpec 字段都必须真的落到请求里。
 * 任何缺失直接抛错，让 UI 显示原因而不是发一次缺参请求。
 */
export function assertHandRepairInput(input: BrowserToolInput): void {
    if (input.references?.length !== 2) {
        throw new HandRepairAdapterError("references-missing", "手部修复必须同时提交原图与蒙版两张参考图");
    }
    const [image, mask] = input.references;
    if (image.id === mask.id && image.dataUrl === mask.dataUrl) {
        throw new HandRepairAdapterError("mask-not-exported", "蒙版没有单独导出，请先在画布上涂抹手部区域");
    }
    const fields = input.fields ?? {};
    const missing: string[] = [];
    if (typeof fields.imageUrl !== "string" || !fields.imageUrl.trim()) missing.push("imageUrl");
    if (typeof fields.maskUrl !== "string" || !fields.maskUrl.trim()) missing.push("maskUrl");
    if (typeof fields.imageName !== "string") missing.push("imageName");
    if (typeof fields.personType !== "string" || !fields.personType.trim()) missing.push("personType");
    const outputNum = Number(fields.outputNum);
    if (!Number.isInteger(outputNum) || outputNum < 1 || outputNum > 4) missing.push("outputNum");
    if (missing.length > 0) {
        throw new HandRepairAdapterError("fields-missing", `手部修复请求缺少字段：${missing.join("、")}`);
    }
    if (typeof fields.clientOperationId !== "string" || !fields.clientOperationId) {
        throw new HandRepairAdapterError("operation-id-missing", "缺少客户端幂等键（clientOperationId），拒绝提交");
    }
    if (typeof input.prompt !== "string" || !input.prompt.trim()) {
        throw new HandRepairAdapterError("prompt-missing", "修复指令为空，拒绝提交");
    }
}

/* ------------------------------------------------------------------ *
 * 字段覆盖审计（对照 ToolSpec，防止静默丢参）
 * ------------------------------------------------------------------ */

export type HandRepairFieldAudit = {
    toolId: typeof HAND_REPAIR_TOOL_ID;
    specFields: string[];
    represented: Record<string, boolean>;
    missing: string[];
    issues: string[];
};

export function auditHandRepairFields(specFields: readonly string[], unit: HandRepairUnit, snapshot: HandRepairSnapshot): HandRepairFieldAudit {
    const hasImageRef = unit.references.length >= 1;
    const hasMaskRef = unit.references.length >= 2 && unit.references[1]!.id !== unit.references[0]!.id;
    const represented: Record<string, boolean> = {
        imageName: typeof unit.fields.imageName === "string",
        imageUrl: hasImageRef && typeof unit.fields.imageUrl === "string" && String(unit.fields.imageUrl).trim().length > 0,
        maskUrl: hasMaskRef && typeof unit.fields.maskUrl === "string" && String(unit.fields.maskUrl).trim().length > 0,
        outputNum: Number(unit.fields.outputNum) === snapshot.outputNum && unit.total === snapshot.outputNum,
        personType: typeof unit.fields.personType === "string" && unit.fields.personType === snapshot.personType,
    };
    const missing = specFields.filter((field) => !(field in represented));
    const issues: string[] = [];
    for (const field of specFields) {
        if (field in represented && represented[field] === false) issues.push(`字段 ${field} 没有真正进入请求`);
    }
    if (missing.length > 0) issues.push(`适配器未覆盖字段：${missing.join(", ")}`);
    if (!hasMaskRef) issues.push("蒙版没有作为第二张参考图提交");
    return { toolId: HAND_REPAIR_TOOL_ID, specFields: [...specFields], represented, missing, issues };
}

/* ------------------------------------------------------------------ *
 * 运行
 * ------------------------------------------------------------------ */

export type HandRepairUnitStatus = "pending" | "succeeded" | "failed" | "cancelled" | "unknown";

export type HandRepairUnitOutcome = {
    unitId: string;
    index: number;
    total: number;
    status: HandRepairUnitStatus;
    snapshotHash: string;
    taskId?: string;
    image?: { dataUrl?: string; url?: string; mimeType?: string };
    error?: { code: string; message: string; retryable?: boolean };
};

export function mapHandRepairTaskToOutcome(unit: HandRepairUnit, task: ToolTask): HandRepairUnitOutcome {
    const base = { unitId: unit.id, index: unit.index, total: unit.total, snapshotHash: unit.snapshotHash, taskId: task.id };
    const firstImage = task.result?.items.find((item) => item.kind === "image" && (item.dataUrl || item.url));
    if (task.status === "succeeded") {
        if (!firstImage) {
            return { ...base, status: "failed", error: { code: "empty-result", message: "上游返回成功但没有图片结果", retryable: true } };
        }
        return { ...base, status: "succeeded", image: { dataUrl: firstImage.dataUrl, url: firstImage.url, mimeType: firstImage.mimeType } };
    }
    if (task.status === "failed") {
        return {
            ...base,
            status: "failed",
            error: task.error ? { code: task.error.code, message: task.error.message, retryable: task.error.retryable } : { code: "task-failed", message: "任务失败（上游未给出原因）", retryable: true },
        };
    }
    if (task.status === "cancelled") {
        return { ...base, status: "cancelled", error: { code: "cancelled", message: "任务已取消", retryable: false } };
    }
    return {
        ...base,
        status: "unknown",
        error: { code: `task-${task.status}`, message: "任务状态未知，只能查询或人工确认", retryable: true },
    };
}

/** 真实运行端口：默认走共享任务网关（useToolTaskStore.runTool）。 */
export interface HandRepairRunPort {
    run(input: BrowserToolInput, options?: WaitOptions): Promise<ToolTask>;
}

export function createHandRepairRunPort(): HandRepairRunPort {
    return {
        async run(input, options) {
            const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
            return useToolTaskStore.getState().runTool(input, options);
        },
    };
}

export type RunHandRepairOptions = {
    port: HandRepairRunPort;
    concurrency?: number;
    signal?: AbortSignal;
    draftRevision?: number | string | null;
    onOutcome?: (outcome: HandRepairUnitOutcome, unit: HandRepairUnit, completed: number, total: number) => void;
};

/** 并发跑完所有单元；单单元失败不影响其它单元，取消后剩余单元标 cancelled。 */
export async function runHandRepairUnits(units: HandRepairUnit[], options: RunHandRepairOptions): Promise<HandRepairUnitOutcome[]> {
    const concurrency = Math.max(1, Math.min(4, Math.floor(options.concurrency ?? 2)));
    const outcomes: HandRepairUnitOutcome[] = new Array(units.length);
    let cursor = 0;
    let completed = 0;
    let cancelled = false;

    const worker = async () => {
        for (;;) {
            const index = cursor;
            cursor += 1;
            const unit = units[index];
            if (!unit) return;
            if (cancelled || options.signal?.aborted) {
                const outcome: HandRepairUnitOutcome = {
                    unitId: unit.id,
                    index: unit.index,
                    total: unit.total,
                    status: "cancelled",
                    snapshotHash: unit.snapshotHash,
                    error: { code: "cancelled", message: "任务已取消", retryable: false },
                };
                outcomes[index] = outcome;
                completed += 1;
                options.onOutcome?.(outcome, unit, completed, units.length);
                continue;
            }
            let outcome: HandRepairUnitOutcome;
            try {
                assertHandRepairInput(buildHandRepairInput(unit, { draftRevision: options.draftRevision }));
                const task = await options.port.run(buildHandRepairInput(unit, { draftRevision: options.draftRevision }));
                outcome = mapHandRepairTaskToOutcome(unit, task);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const code = error instanceof HandRepairAdapterError ? error.code : "run-failed";
                outcome = {
                    unitId: unit.id,
                    index: unit.index,
                    total: unit.total,
                    status: "failed",
                    snapshotHash: unit.snapshotHash,
                    error: { code, message, retryable: true },
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
 * 结果视图
 * ------------------------------------------------------------------ */

export type HandRepairResultView = {
    status: "idle" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";
    images: Array<{ url: string; index: number }>;
    sourceUrl?: string;
    stale: boolean;
    snapshotHash?: string;
    errors: string[];
};

/**
 * 只用真实结果构造视图：成功张数 = 真拿到图的结果数；失败原因逐条保留（含“第 2 张”），
 * 不把部分成功伪装成全成功，也不为空结果补占位图。
 */
export function handRepairResultView(input: { outcomes?: HandRepairUnitOutcome[]; running?: boolean; sourceUrl?: string; stale?: boolean; snapshotHash?: string }): HandRepairResultView {
    const outcomes = input.outcomes ?? [];
    const images = outcomes
        .filter((outcome) => outcome.status === "succeeded" && (outcome.image?.dataUrl || outcome.image?.url))
        .sort((a, b) => a.index - b.index)
        .map((outcome) => ({ url: (outcome.image?.dataUrl ?? outcome.image?.url) as string, index: outcome.index }));
    const errors = outcomes
        .filter((outcome) => outcome.status !== "succeeded")
        .sort((a, b) => a.index - b.index)
        .map((outcome) => `第 ${outcome.index} 张：${outcome.error?.message ?? "未拿到结果"}`);
    const status: HandRepairResultView["status"] = input.running
        ? "running"
        : outcomes.length === 0
          ? "idle"
          : images.length === outcomes.length
            ? "succeeded"
            : images.length > 0
              ? "failed"
              : outcomes.some((outcome) => outcome.status === "unknown")
                ? "unknown"
                : outcomes.every((outcome) => outcome.status === "cancelled")
                  ? "cancelled"
                  : "failed";
    return {
        status,
        images,
        sourceUrl: input.sourceUrl,
        stale: Boolean(input.stale),
        snapshotHash: input.snapshotHash,
        errors,
    };
}

export function summarizeHandRepairOutcomes(outcomes: HandRepairUnitOutcome[]): string {
    if (outcomes.length === 0) return "还没有结果";
    const ok = outcomes.filter((outcome) => outcome.status === "succeeded").length;
    return `成功 ${ok}/${outcomes.length} 张`;
}

/** 下载地址：真实结果字节，没有结果返回 null（不生成空白图）。 */
export function handRepairDownloadHref(imageUrl?: string): string | null {
    return imageUrl ? imageUrl : null;
}

/**
 * 蒙版导出：复用 AREA_REPAIR 已验证的同尺寸 PNG 导出（白=要修复，黑=保留）。
 * 本页语义固定：不羽化、不反选、不自动扩边。空蒙版直接抛回 mask-empty 由工作区转提示。
 */
export async function exportHandRepairMaskPng(state: Pick<HandRepairState, "strokes">, size: { width: number; height: number }): Promise<{ dataUrl: string; width: number; height: number }> {
    const rendered = await renderMaskPng({ strokes: state.strokes, feather: 0, inverted: false, autoExpand: false }, size);
    return { dataUrl: rendered.dataUrl, width: rendered.width, height: rendered.height };
}
