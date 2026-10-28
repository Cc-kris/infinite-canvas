import type { ReferenceImage } from "@/types/image";

import type { BrowserToolInput, SubmitOptions, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";

import {
    PRODUCT_REFINE_TOOL_ID,
    buildProductRefinePrompt,
    computeProductRefineOutput,
    createProductRefineSnapshot,
    isValidHexColor,
    normalizeHexColor,
    outputRatioLabel,
    productRefineMode,
    productRefineStrength,
    validateProductRefineState,
    type ProductRefineIssue,
    type ProductRefineOutput,
    type ProductRefineSnapshot,
    type ProductRefineValues,
} from "../registry/product-refine";

import { isUploadedImageReady, pickRemoteImageUrl, sourceReferenceUrls } from "../source-asset";

/**
 * TASK-018：PRODUCT_REFINE 的真实 provider 适配层。
 *
 * 真实边界（不接受演示成功）：
 * - 提交走 TASK-005 的 ToolTaskGateway.submit → services/api/image.ts（带参考图即图生图编辑）；
 * - 去背景 → provider 字段 `isRmBg`；自动放大规则 → `size`；比例 → `ratio`；色彩 → `color`；
 * - `assertProductRefineInput` 在提交前逐项核对“页面上的配置确实进了请求”，任何一项丢失直接抛错；
 * - 结果只来自 task.result.items；本模块不产生占位图，失败/未知原样透出。
 *
 * 已知集成缺口（见 docs/V1.0/plan_linkfox_navigation/reports/TASK-018-product-refine.md）：
 * provider schema 的 `imageSegUrl`（AI 主体分割结果）需要仓库内尚不存在的分割服务，
 * 因此仅在调用方显式带入分段资产时才写入；绝不伪造一个 URL 充数。
 */

export type ProductRefineSourceAsset = {
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

export class ProductRefineAdapterError extends Error {
    readonly code: string;
    readonly issues: ProductRefineIssue[];

    constructor(code: string, message: string, issues: ProductRefineIssue[] = []) {
        super(message);
        this.name = "ProductRefineAdapterError";
        this.code = code;
        this.issues = issues;
    }
}

export function isProductRefineSourceReady(source?: ProductRefineSourceAsset | null): boolean {
    if (!source || !source.assetId.trim()) return false;
    // 判定口径统一在 features/tools/source-asset.ts（data: / blob: / http(s)）。
    return isUploadedImageReady(source);
}

export function toProductRefineReference(source: ProductRefineSourceAsset): ReferenceImage {
    const urls = sourceReferenceUrls(source);
    if (!urls || !source.assetId.trim()) {
        throw new ProductRefineAdapterError("source-missing", "请先上传待精修的商品图。");
    }
    return {
        id: source.assetId,
        name: source.name ?? `${source.assetId}.png`,
        type: source.mimeType ?? "image/png",
        ...urls,
    };
}

/** 源图硬约束：页面明示 20M 以内、jpg/jpeg/png/webp。 */
export function validateProductRefineSource(source: ProductRefineSourceAsset): { ok: true } | { ok: false; code: "mime" | "size" | "dimension"; message: string } {
    const mime = (source.mimeType ?? "").toLowerCase();
    if (mime && !["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(mime)) {
        return { ok: false, code: "mime", message: `不支持 ${mime}，仅支持 jpg、jpeg、png、webp。` };
    }
    if (source.bytes !== undefined && source.bytes > 20 * 1024 * 1024) {
        return { ok: false, code: "size", message: "商品图不能超过 20MB。" };
    }
    if (source.width && source.height && (source.width > 8192 || source.height > 8192)) {
        return { ok: false, code: "dimension", message: "商品图最大支持 8192×8192。" };
    }
    return { ok: true };
}

/* ============================== 请求组装 ============================== */

export type BuildProductRefineInputOptions = {
    values: ProductRefineValues;
    output: ProductRefineOutput;
    source: ProductRefineSourceAsset;
    model?: string;
    /** 调用方显式提供的 AI 主体分割结果（仓库当前无分割服务，默认不带）。 */
    segmentationUrl?: string;
    draftRevision?: number | string | null;
};

export function buildProductRefineInput({ values, output, source, model, segmentationUrl, draftRevision = null }: BuildProductRefineInputOptions): BrowserToolInput {
    if (!isProductRefineSourceReady(source)) {
        throw new ProductRefineAdapterError("source-missing", "请先上传待精修的商品图。");
    }
    if (!output.legal) {
        const first = output.issues[0];
        throw new ProductRefineAdapterError("output-invalid", first?.message ?? "输出尺寸不合法。", output.issues);
    }
    return {
        toolId: PRODUCT_REFINE_TOOL_ID,
        prompt: buildProductRefinePrompt(values, output),
        references: [toProductRefineReference(source)],
        ...(model && model.trim() ? { model: model.trim() } : {}),
        size: `${output.width}x${output.height}`,
        count: 1,
        fields: buildProductRefineFields(values, output, source, segmentationUrl, draftRevision),
    };
}

export function buildProductRefineFields(
    values: ProductRefineValues,
    output: ProductRefineOutput,
    source: Pick<ProductRefineSourceAsset, "assetId" | "url" | "name">,
    segmentationUrl?: string,
    _draftRevision: number | string | null = null,
): Record<string, unknown> {
    // 只写 gateway TOOL_ADAPTER_TABLE.PRODUCT_REFINE 允许的字段，避免声明了却不参与指纹的死字段。
    const mode = productRefineMode(values.mode);
    // 服务端只能按 URL 取图：data:/blob: 一律不写成 realImageUrl（见 features/tools/source-asset.ts）。
    const remote = pickRemoteImageUrl(source);
    const fields: Record<string, unknown> = {
        imageUrl: source.assetId,
        realImageUrl: remote || source.assetId,
        // isRmBg 必须显式 boolean（页面规格：不得 undefined）
        isRmBg: mode.isRmBg,
        ratio: output.ratio,
        imageOutputLength: output.longEdge,
    };
    if (values.colorEnabled) {
        fields.color = normalizeHexColor(values.color) || values.color.trim();
    }
    if (segmentationUrl && mode.isRmBg) {
        fields.imageSegUrl = segmentationUrl;
    }
    return fields;
}

/**
 * 防丢参守卫：提交前逐个断言“页面上的配置已进入真实请求”。
 * 对不上就抛错，绝不带着降级配置发请求。
 */
export function assertProductRefineInput(input: BrowserToolInput, values: ProductRefineValues, output: ProductRefineOutput): void {
    const problems: string[] = [];
    const mode = productRefineMode(values.mode);
    const strength = productRefineStrength(values.strength);
    if (input.toolId !== PRODUCT_REFINE_TOOL_ID) problems.push(`toolId 必须是 ${PRODUCT_REFINE_TOOL_ID}`);
    const expectedSize = `${output.width}x${output.height}`;
    if (input.size !== expectedSize) problems.push(`自动尺寸规则未生效（期望 ${expectedSize}，实际 ${input.size ?? "空"}）`);
    if (input.count !== 1) problems.push("商品精修一次只产出一张主结果");
    const fields = (input.fields ?? {}) as Record<string, unknown>;
    if (fields.isRmBg !== mode.isRmBg) problems.push(`去背景开关未进入请求（期望 ${mode.isRmBg}）`);
    if (String(fields.ratio ?? "") !== output.ratio) problems.push(`输出比例未进入请求（期望 ${output.ratio}）`);
    if (Number(fields.imageOutputLength) !== output.longEdge) problems.push("输出长边字段与自动尺寸不一致");
    if (values.colorEnabled) {
        const expectedColor = normalizeHexColor(values.color) || values.color.trim();
        if (!isValidHexColor(values.color)) problems.push("色彩校正色值不合法");
        if (String(fields.color ?? "").toUpperCase() !== expectedColor.toUpperCase()) problems.push("色彩校正未进入请求");
    } else if (fields.color !== undefined) {
        problems.push("未开启色彩校正却带了 color 字段");
    }
    if (!input.prompt?.includes(strength.instruction)) problems.push("精修强度未进入请求提示词");
    if (!input.prompt?.includes(`${output.width}×${output.height}`)) problems.push("提示词未携带输出尺寸");
    if (!input.prompt?.includes(mode.label)) problems.push("提示词未携带精修模式");
    if (!(input.references?.length ?? 0)) problems.push("缺少商品图参考");
    if (problems.length) {
        throw new ProductRefineAdapterError("param-dropped", `提交参数校验失败：${problems.join("；")}`);
    }
}

/* ============================== 执行 ============================== */

export type ProductRefineGatewayLike = {
    submit: (input: BrowserToolInput, options?: SubmitOptions) => Promise<ToolTask>;
    waitForResult: (taskId: string, options?: WaitOptions) => Promise<ToolTask>;
    retry?: (taskId: string, input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
};

export type RunProductRefineOptions = {
    gateway: ProductRefineGatewayLike;
    values: ProductRefineValues;
    output: ProductRefineOutput;
    source: ProductRefineSourceAsset;
    model?: string;
    segmentationUrl?: string;
    revision?: number | string | null;
    imageModelReady?: boolean;
    signal?: AbortSignal;
    onUpdate?: (task: ToolTask) => void;
    wait?: WaitOptions;
};

export type ProductRefineRun = {
    task: ToolTask;
    snapshot: ProductRefineSnapshot;
    output: ProductRefineOutput;
};

const isTerminal = (status: ToolTask["status"]) => status === "succeeded" || status === "failed" || status === "unknown";

export async function runProductRefine(options: RunProductRefineOptions): Promise<ProductRefineRun> {
    const { gateway, values, output, source, model, segmentationUrl, revision = null, imageModelReady = true, signal, onUpdate, wait } = options;
    const issues = validateProductRefineState({ values, output, sourceReady: isProductRefineSourceReady(source), imageModelReady });
    if (issues.length) throw new ProductRefineAdapterError("invalid-config", issues[0].message, issues);
    const sourceCheck = validateProductRefineSource(source);
    if (!sourceCheck.ok) throw new ProductRefineAdapterError(sourceCheck.code, sourceCheck.message);

    const input = buildProductRefineInput({ values, output, source, model, segmentationUrl, draftRevision: revision });
    assertProductRefineInput(input, values, output);
    const snapshot = createProductRefineSnapshot(values, output, { assetId: source.assetId, width: source.width, height: source.height }, revision);

    const submitted = await gateway.submit(input, { signal, draftRevision: revision });
    onUpdate?.(submitted);
    if (isTerminal(submitted.status)) return { task: submitted, snapshot, output };
    const final = await gateway.waitForResult(submitted.id, { ...wait, signal, onUpdate });
    return { task: final, snapshot, output };
}

export type RetryProductRefineOptions = RunProductRefineOptions & { taskId: string };

/** 同快照重试：输入按当前配置重建并再次守卫，避免“重试”悄悄换了参数。 */
export async function retryProductRefine(options: RetryProductRefineOptions): Promise<ProductRefineRun> {
    const { gateway, values, output, source, model, segmentationUrl, revision = null, imageModelReady = true, signal, onUpdate, wait, taskId } = options;
    if (!gateway.retry) throw new ProductRefineAdapterError("retry-unsupported", "当前网关不支持按任务重试。");
    const issues = validateProductRefineState({ values, output, sourceReady: isProductRefineSourceReady(source), imageModelReady });
    if (issues.length) throw new ProductRefineAdapterError("invalid-config", issues[0].message, issues);
    const input = buildProductRefineInput({ values, output, source, model, segmentationUrl, draftRevision: revision });
    assertProductRefineInput(input, values, output);
    const snapshot = createProductRefineSnapshot(values, output, { assetId: source.assetId, width: source.width, height: source.height }, revision);
    const retried = await gateway.retry(taskId, input, { ...wait, signal, onUpdate });
    onUpdate?.(retried);
    if (isTerminal(retried.status)) return { task: retried, snapshot, output };
    const final = await gateway.waitForResult(retried.id, { ...wait, signal, onUpdate });
    return { task: final, snapshot, output };
}

/* ============================== 结果 ============================== */

export type ProductRefineResult = {
    taskId?: string;
    status: ToolTask["status"] | "idle";
    images: ToolTaskResultItem[];
    stale: boolean;
    drift: string;
    error?: string;
};

export function firstProductRefineImage(task?: ToolTask | null): string | undefined {
    const items = task?.result?.items ?? [];
    const image = items.find((item) => item.kind === "image" && (item.dataUrl || item.url));
    return image?.dataUrl || image?.url;
}

export function productRefineResultFromTask(task: ToolTask | undefined, snapshot: ProductRefineSnapshot | undefined, current: ProductRefineSnapshot | undefined, drift = ""): ProductRefineResult {
    const items = (task?.result?.items ?? []).filter((item) => item.kind === "image" && (item.dataUrl || item.url));
    const stale = Boolean(snapshot) && Boolean(current) && snapshot?.fingerprint !== current?.fingerprint;
    return {
        status: task?.status ?? "idle",
        ...(task ? { taskId: task.id } : {}),
        images: items,
        stale,
        drift: stale ? drift : "",
        ...(task?.error ? { error: task.error.message } : {}),
    };
}

/** 输出尺寸与比例的独立重算入口，供 UI 在源图变化时展示（不依赖 React）。 */
export function recomputeProductRefineOutput(source?: ProductRefineSourceAsset | null): ProductRefineOutput {
    return computeProductRefineOutput(source ? { width: source.width, height: source.height } : undefined);
}

export { outputRatioLabel };
