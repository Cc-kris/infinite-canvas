/**
 * TASK-032：PRINT_EXTRACT「印花提取」适配器。
 *
 * 真实边界（不接受“演示/模拟成功”）：
 *  - 一次提取 = 一次真实图片编辑请求：参考图就是用户上传的商品图，prompt 由快照生成；
 *  - 字段只有契约里的 `imageUrl` + 显式 boolean `isTransparent`（外加来源 `url`），缺一项即抛错，
 *    绝不静默补默认值再去请求上游；
 *  - 上游返回成功但没有图片 → 结果视为 failed（empty-result），不补造图、不占位成“成功”；
 *  - 任务走共享 TaskGateway（useToolTaskStore.runTool），provider 由用户当前图像模型配置决定。
 *
 * 规格：docs/V1.0/plan_linkfox_navigation/page-specs/25-print-extract.md
 */
import { pickResultPanelTask } from "./result-panel";
import {
    PRINT_EXTRACT_TOOL_ID,
    PRINT_EXTRACT_VERSION,
    composePrintExtractFields,
    printExtractInstruction,
    printExtractSnapshotHash,
    validatePrintExtractInput,
    type PrintExtractIssue,
    type PrintExtractOptions,
    type PrintExtractSnapshot,
} from "@/features/tools/registry/print-extract";
import type { BrowserToolInput, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask } from "@/services/api/tools/task-machine";
import type { ReferenceImage } from "@/types/image";

export const PRINT_EXTRACT_ADAPTER_KIND = "image" as const;

export class PrintExtractAdapterError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
        super(message);
        this.name = "PrintExtractAdapterError";
        this.code = code;
    }
}

/* ------------------------------------------------------------------ *
 * 单元 / 请求
 * ------------------------------------------------------------------ */

export type PrintExtractUnit = {
    id: string;
    prompt: string;
    references: ReferenceImage[];
    fields: Record<string, unknown>;
    snapshotHash: string;
};

export type BuildPrintExtractUnitInput = {
    snapshot: PrintExtractSnapshot;
    /** 用户上传的商品图（真实资产记录转成的引用）。 */
    source: ReferenceImage;
};

export function buildPrintExtractUnit(input: BuildPrintExtractUnitInput): PrintExtractUnit {
    const hash = printExtractSnapshotHash(input.snapshot);
    const sourceUrl = (input.source.url ?? input.source.dataUrl ?? "").trim();
    const fields = {
        ...composePrintExtractFields({ isTransparent: input.snapshot.isTransparent === true }, { imageUrl: sourceUrl, url: input.snapshot.sourceUrl || sourceUrl }),
        clientOperationId: input.snapshot.clientOperationId,
    };
    return {
        id: `${PRINT_EXTRACT_TOOL_ID}:${hash}`,
        prompt: printExtractInstruction({ isTransparent: input.snapshot.isTransparent === true, width: input.snapshot.width, height: input.snapshot.height }),
        references: [input.source],
        fields,
        snapshotHash: hash,
    };
}

export function buildPrintExtractInput(unit: PrintExtractUnit, options: { draftRevision?: number | string | null } = {}): BrowserToolInput {
    return {
        toolId: PRINT_EXTRACT_TOOL_ID,
        prompt: unit.prompt,
        references: unit.references,
        count: 1,
        fields: {
            ...unit.fields,
            printExtractVersion: PRINT_EXTRACT_VERSION,
            clientOperationId: (unit.fields.clientOperationId as string | undefined) ?? unit.id,
            ...(options.draftRevision !== undefined && options.draftRevision !== null ? { draftRevision: options.draftRevision } : {}),
        },
    };
}

function textField(fields: Record<string, unknown>, key: string): string {
    const value = fields[key];
    return typeof value === "string" ? value.trim() : "";
}

/**
 * 提交前守卫：契约两字段必须真的落到请求里，且都是显式值。
 * 任何缺失/类型错误直接抛错，让 UI 显示原因，而不是发一次缺参请求。
 */
export function assertPrintExtractInput(input: BrowserToolInput): void {
    if (!Array.isArray(input.references) || input.references.length !== 1) {
        throw new PrintExtractAdapterError("references-missing", "印花提取必须且只能提交一张商品图");
    }
    if (input.count !== 1) {
        throw new PrintExtractAdapterError("count-invalid", "印花提取是单结果工具，单次产物数量必须为 1");
    }
    const fields = input.fields ?? {};
    if (!textField(fields, "imageUrl")) {
        throw new PrintExtractAdapterError("imageUrl-missing", "缺少商品图地址（imageUrl）");
    }
    if (typeof fields.isTransparent !== "boolean") {
        throw new PrintExtractAdapterError("isTransparent-invalid", "生成透明图开关必须显式取 true 或 false");
    }
    if (typeof input.prompt !== "string" || !input.prompt.trim()) {
        throw new PrintExtractAdapterError("prompt-missing", "提取指令为空，拒绝提交");
    }
    if (!textField(fields, "clientOperationId")) {
        throw new PrintExtractAdapterError("operation-id-missing", "缺少客户端幂等键（clientOperationId），拒绝提交");
    }
}

/** 页面级校验（registry）与适配器守卫合并成一次可展示的原因列表。 */
export function printExtractPreflightIssues(snapshot: PrintExtractOptions & { width: number; height: number }, source: { bytes: number; width: number; height: number; mimeType?: string; url?: string } | null | undefined): string[] {
    const issues: PrintExtractIssue[] = validatePrintExtractInput({
        source: source ? { bytes: source.bytes, width: source.width, height: source.height, mimeType: source.mimeType } : null,
        imageUrl: source?.url ?? "",
        isTransparent: snapshot.isTransparent,
    });
    return issues.map((item) => item.message);
}

/* ------------------------------------------------------------------ *
 * 运行
 * ------------------------------------------------------------------ */

export type PrintExtractRunPort = {
    run: (input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
};

/** 真实运行端口：默认走共享任务网关。 */
export async function createPrintExtractRunPort(): Promise<PrintExtractRunPort> {
    const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
    return {
        run: (input, options) => useToolTaskStore.getState().runTool(input, options),
    };
}

export type RunPrintExtractInput = {
    unit: PrintExtractUnit;
    snapshot: PrintExtractSnapshot;
    draftRevision?: number | null;
};

export type RunPrintExtractDeps = {
    port?: PrintExtractRunPort;
    /** 每次状态变化写回任务库（默认不写）。 */
    persist?: (task: ToolTask) => void;
    options?: Omit<WaitOptions, "onUpdate">;
};

export type RunPrintExtractResult = {
    task: ToolTask;
    view: PrintExtractResultView;
};

export function printExtractResultView(task: ToolTask, snapshot: Pick<PrintExtractSnapshot, "sourceAssetId" | "sourceUrl" | "isTransparent" | "width" | "height">): PrintExtractResultView {
    const snapshotHash = printExtractSnapshotHash({
        sourceAssetId: snapshot.sourceAssetId,
        isTransparent: snapshot.isTransparent === true,
        width: snapshot.width,
        height: snapshot.height,
    });
    if (task.status === "submitting" || task.status === "running") {
        return { status: "running", sourceUrl: snapshot.sourceUrl, stale: false, snapshotHash };
    }
    if (task.status === "unknown") {
        // 上游没回执 / 等待超预算：既不等于「还在跑」，也不等于失败。
        // 把 unknown 归成 running 会让卡片永远停在「提取中」，且会诱导用户重复提交（重复扣费）。
        return {
            status: "unknown",
            sourceUrl: snapshot.sourceUrl,
            stale: false,
            snapshotHash,
            error: task.error?.message ?? "任务状态未知：无法确认上游是否受理，只能查询或人工确认，请勿直接重复提交",
        };
    }
    if (task.status === "cancelled") {
        return { status: "cancelled", sourceUrl: snapshot.sourceUrl, stale: false, snapshotHash, error: task.error?.message };
    }
    if (task.status === "failed") {
        return {
            status: "failed",
            sourceUrl: snapshot.sourceUrl,
            stale: false,
            snapshotHash,
            error: task.error?.message ?? "上游返回失败，未产出图片",
        };
    }
    const items = task.result?.items ?? [];
    const image = items.find((item) => Boolean(item.dataUrl || item.url));
    if (!image) {
        // 上游 status=succeeded 但没有图：判失败，绝不补造。
        return {
            status: "failed",
            sourceUrl: snapshot.sourceUrl,
            stale: false,
            snapshotHash,
            error: "上游返回成功但没有图片（empty-result），请重试或更换模型",
        };
    }
    return {
        status: "succeeded",
        imageUrl: image.dataUrl ?? image.url,
        sourceUrl: snapshot.sourceUrl,
        stale: false,
        snapshotHash,
    };
}

export type PrintExtractResultView = {
    status: "running" | "succeeded" | "failed" | "cancelled" | "unknown";
    imageUrl?: string;
    sourceUrl: string;
    stale: boolean;
    snapshotHash: string;
    error?: string;
};

/** 一次真实提取：守卫 → 端口请求 → 结果判定。失败不改写成功。 */
export async function runPrintExtract(input: RunPrintExtractInput, deps: RunPrintExtractDeps = {}): Promise<RunPrintExtractResult> {
    const request = buildPrintExtractInput(input.unit, { draftRevision: input.draftRevision ?? input.snapshot.draftRevision });
    assertPrintExtractInput(request);
    const port = deps.port ?? (await createPrintExtractRunPort());
    const task = await port.run(request, {
        ...deps.options,
        draftRevision: input.draftRevision ?? input.snapshot.draftRevision,
        onUpdate: (next) => deps.persist?.(next),
    });
    deps.persist?.(task);
    return { task, view: printExtractResultView(task, input.snapshot) };
}

/** 资产记录 → provider 参考图；优先用真实 url，data: 前缀才写进 dataUrl，绝不编造 base64。 */
export function printExtractSourceReference(source: { assetId: string; name: string; url: string; mimeType?: string }): ReferenceImage {
    const isDataUrl = source.url.startsWith("data:");
    return {
        id: source.assetId,
        name: source.name,
        type: source.mimeType ?? "image/png",
        dataUrl: isDataUrl ? source.url : "",
        url: source.url,
    };
}

/** 结果是否“来自旧版本”：提交指纹 ≠ 当前指纹。 */
export function isPrintExtractResultStale(snapshotHash: string | undefined, current: PrintExtractOptions & { sourceAssetId: string; width: number; height: number }): boolean {
    if (!snapshotHash) return false;
    return snapshotHash !== printExtractSnapshotHash(current);
}

/** 结果区面板用：从落库任务里选「本次该展示的那一条」（只选择，不造数据）。 */
export function printExtractResultPanelTask(tasks: readonly ToolTask[]): ToolTask | null {
    return pickResultPanelTask(tasks, { toolId: PRINT_EXTRACT_TOOL_ID, includeLatestWithoutItems: true });
}
