import type { ReferenceImage } from "@/types/image";

import type { BrowserToolInput, SubmitOptions, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";

import {
    AI_WEARABLE_FIELDS,
    AI_WEARABLE_TOOL_ID,
    buildWearablePrompt,
    clampWearableRegion,
    computeWearableOutput,
    createWearableSnapshot,
    isWearableRegionUsable,
    linkWearableValues,
    readWearableValues,
    resolveWearableCapability,
    validateWearableState,
    wearableCategoryOf,
    wearableCheckOf,
    wearableModelTabOf,
    wearablePartOf,
    wearablePartsFor,
    wearableRegionToMaskRect,
    wearableSceneTabOf,
    WEARABLE_UPLOAD,
    type WearableCapability,
    type WearableCapabilityInput,
    type WearableIssue,
    type WearableRegion,
    type WearableSnapshot,
    type WearableValues,
} from "../registry/ai-wearable";

/**
 * AI_WEARABLE 适配器：页面值 → 真实提交 → 结果。没有任何“假装成功”的分支：
 * 缺图、缺蒙版、缺模型、张数超限、字段丢失都会直接抛错并给出定位信息。
 *
 * 提交字段（page-specs §7 的 13 个字段去掉 3 个结果字段）：
 *   checkType / imageMaskUrl / imageUrl / isSecondOperate / modelId /
 *   modelTabType / outputNum / productCategory / sceneTabType /
 *   targetMaskUrl / targetOriginUrl
 * 结果字段 imageResultUrl / targetResultUrl 在任务成功后由结果资产回填（`bindWearableResultFields`）。
 */

export class AiWearableAdapterError extends Error {
    readonly code: string;
    readonly issues: WearableIssue[];

    constructor(code: string, message: string, issues: WearableIssue[] = []) {
        super(message);
        this.name = "AiWearableAdapterError";
        this.code = code;
        this.issues = issues;
    }
}

/* ============================== 源资产 ============================== */

export type WearableSourceAsset = {
    assetId: string;
    name: string;
    width?: number;
    height?: number;
    mimeType?: string;
    bytes?: number;
    url: string;
    dataUrl?: string;
};

export function wearableSourceFromRecord(record: ToolAssetRecord): WearableSourceAsset {
    return {
        assetId: record.id,
        name: record.name,
        width: record.width,
        height: record.height,
        mimeType: record.mimeType,
        bytes: record.bytes,
        url: record.url,
    };
}

export function isWearableSourceReady(source?: WearableSourceAsset | null): boolean {
    if (!source || !source.assetId.trim()) return false;
    const src = source.dataUrl || source.url || "";
    return src.startsWith("data:image/") || src.startsWith("https://") || src.startsWith("http://") || src.startsWith("blob:");
}

export function toWearableReference(source: WearableSourceAsset): ReferenceImage {
    if (!isWearableSourceReady(source)) {
        throw new AiWearableAdapterError("source-missing", "素材不可用，请重新上传。");
    }
    return {
        id: source.assetId,
        name: source.name || `${source.assetId}.png`,
        type: source.mimeType ?? "image/png",
        dataUrl: source.dataUrl ?? source.url ?? "",
        ...(source.url && !source.url.startsWith("data:") ? { url: source.url } : {}),
    };
}

/**
 * 字段里的图片引用：优先 http(s) URL，其次本地资产 ID（页面规格允许「HTTPS / 本地资产 ID」）。
 * data URL 不写进 fields，避免污染任务指纹。
 */
export function wearableImageRef(source: WearableSourceAsset): string {
    const url = (source.url ?? "").trim();
    if (url.startsWith("https://") || url.startsWith("http://")) return url;
    return source.assetId.trim();
}

/** 页面尺寸校验：与 registry 的上传限制同源，失败信息定位到具体文件。 */
export function validateWearableSourceSize(source: WearableSourceAsset): { ok: true } | { ok: false; message: string } {
    const width = source.width ?? 0;
    const height = source.height ?? 0;
    if (!width || !height) return { ok: true };
    if (width < WEARABLE_UPLOAD.minSide || height < WEARABLE_UPLOAD.minSide) {
        return { ok: false, message: `短边需 ≥ ${WEARABLE_UPLOAD.minSide}px，当前 ${width}×${height}` };
    }
    if (width > WEARABLE_UPLOAD.maxSide || height > WEARABLE_UPLOAD.maxSide) {
        return { ok: false, message: `长边需 ≤ ${WEARABLE_UPLOAD.maxSide}px，当前 ${width}×${height}` };
    }
    return { ok: true };
}

/* ============================== 蒙版 ============================== */

/** 蒙版必须是与原图同尺寸的 PNG（page-specs §7「须与原图同尺寸」）。 */
export type WearableMaskSize = { width: number; height: number };

export function wearableMaskSizeFor(source: WearableSourceAsset): WearableMaskSize {
    return { width: Math.round(source.width ?? 1024), height: Math.round(source.height ?? 1024) };
}

export type WearableMaskSpec = ReturnType<typeof wearableRegionToMaskRect> & { region: WearableRegion };

export function wearableMaskSpec(region: WearableRegion, size: WearableMaskSize): WearableMaskSpec {
    const safe = clampWearableRegion(region);
    if (!isWearableRegionUsable(safe)) {
        throw new AiWearableAdapterError("mask-degenerate", "蒙版区域太小，请拉大椭圆后再提交。");
    }
    return { ...wearableRegionToMaskRect(safe, size.width, size.height), region: safe };
}

type CanvasLike = {
    getContext: (type: "2d") => {
        fillStyle: string;
        clearRect: (x: number, y: number, w: number, h: number) => void;
        beginPath: () => void;
        ellipse: (x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number) => void;
        fill: () => void;
    } | null;
    toBlob?: (callback: (blob: Blob | null) => void, type?: string) => void;
    convertToBlob?: () => Promise<Blob>;
};

type CanvasFactory = (size: WearableMaskSize) => CanvasLike | null;

function createBrowserCanvas(size: WearableMaskSize): CanvasLike | null {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    return canvas as unknown as CanvasLike;
}

/**
 * 把椭圆蒙版渲染成 PNG（黑色背景 + 白色椭圆 = 常见 inpaint 蒙版约定）。
 * 无 DOM 时抛 `canvas-unavailable`，绝不返回一个假的空图。
 */
export async function renderWearableMaskBlob(
    region: WearableRegion,
    size: WearableMaskSize,
    createCanvas: CanvasFactory = createBrowserCanvas,
): Promise<Blob> {
    const spec = wearableMaskSpec(region, size);
    const canvas = createCanvas(size);
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
        throw new AiWearableAdapterError("canvas-unavailable", "当前环境无法绘制蒙版（需要浏览器 Canvas）。");
    }
    context.fillStyle = "#000000";
    context.clearRect(0, 0, size.width, size.height);
    context.beginPath();
    context.ellipse(spec.cx, spec.cy, spec.rx, spec.ry, 0, 0, Math.PI * 2);
    context.fillStyle = "#ffffff";
    context.fill();
    if (canvas.convertToBlob) return canvas.convertToBlob();
    if (canvas.toBlob) {
        return new Promise<Blob>((resolve, reject) => {
            canvas.toBlob?.((blob) => (blob ? resolve(blob) : reject(new AiWearableAdapterError("mask-encode-failed", "蒙版 PNG 编码失败。"))), "image/png");
        });
    }
    throw new AiWearableAdapterError("canvas-unavailable", "当前环境无法导出蒙版 PNG。");
}

export async function renderWearableMaskDataUrl(
    region: WearableRegion,
    size: WearableMaskSize,
    createCanvas: CanvasFactory = createBrowserCanvas,
): Promise<string> {
    const blob = await renderWearableMaskBlob(region, size, createCanvas);
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new AiWearableAdapterError("mask-encode-failed", "蒙版读取失败。"));
        reader.readAsDataURL(blob);
    });
}

/* ============================== 字段 ============================== */

/** 提交时实际下发的 11 个字段（3 个结果字段由结果回填，不参与提交）。 */
export const WEARABLE_SUBMIT_FIELDS = AI_WEARABLE_FIELDS.filter(
    (field) => field !== "imageResultUrl" && field !== "targetResultUrl",
) as readonly string[];

export type WearableMaskRefs = {
    /** 商品图蒙版 PNG 的 HTTPS URL 或本地资产 ID。 */
    productMaskRef: string;
    /** 模特图目标蒙版 PNG 的 HTTPS URL 或本地资产 ID。 */
    targetMaskRef: string;
};

export type BuildWearableFieldsInput = {
    values: WearableValues;
    capability: WearableCapability;
    product: WearableSourceAsset;
    model: WearableSourceAsset;
    masks: WearableMaskRefs;
};

export function buildWearableFields(input: BuildWearableFieldsInput): Record<string, unknown> {
    const { values, capability, product, model, masks } = input;
    const fields: Record<string, unknown> = {
        checkType: wearableCheckOf(values.checkType).key,
        imageUrl: wearableImageRef(product),
        imageMaskUrl: masks.productMaskRef,
        targetOriginUrl: wearableImageRef(model),
        targetMaskUrl: masks.targetMaskRef,
        productCategory: values.productCategory,
        modelTabType: values.modelTabType,
        sceneTabType: values.sceneTabType,
        modelId: values.modelId || capability.modelId,
        outputNum: values.outputNum,
        isSecondOperate: values.isSecondOperate,
    };
    return fields;
}

/** 安全取值：所有字段都要非空且落在目录内，禁止 undefined 静默落到上游。 */
export function assertWearableInput(
    input: BrowserToolInput,
    options: BuildWearableFieldsInput,
): void {
    const { values, capability, product, model } = options;
    const problems: string[] = [];
    const fields = (input.fields ?? {}) as Record<string, unknown>;
    const keys = Object.keys(fields).sort();
    const expectedKeys = [...WEARABLE_SUBMIT_FIELDS].sort();

    if (input.toolId !== AI_WEARABLE_TOOL_ID) problems.push(`toolId 必须是 ${AI_WEARABLE_TOOL_ID}`);
    if (input.count !== values.outputNum) problems.push(`生成张数未进入请求（期望 ${values.outputNum}，实际 ${input.count ?? "空"}）`);
    if ((input.references?.length ?? 0) !== 2) problems.push(`参考图应为 2 张（商品图 + 模特图），实际 ${input.references?.length ?? 0} 张`);
    if (input.references?.[0]?.id !== product.assetId) problems.push("第 1 张参考图不是当前商品图");
    if (input.references?.[1]?.id !== model.assetId) problems.push("第 2 张参考图不是当前模特图");
    if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
        problems.push(`提交字段集合不符（期望 ${expectedKeys.length} 个：${expectedKeys.join("/")}；实际 ${keys.join("/") || "空"}）`);
    }
    if (String(fields.productCategory ?? "") !== values.productCategory) problems.push("商品品类未进入请求");
    if (String(fields.modelTabType ?? "") !== values.modelTabType) problems.push("模特类型页签未进入请求");
    if (String(fields.sceneTabType ?? "") !== values.sceneTabType) problems.push("场景页签未进入请求");
    if (String(fields.checkType ?? "") !== values.checkType) problems.push("检测类型未进入请求");
    if (Number(fields.outputNum) !== values.outputNum) problems.push("outputNum 字段与张数不一致");
    if (typeof fields.isSecondOperate !== "boolean") problems.push("isSecondOperate 必须是显式布尔值");
    if (String(fields.modelId ?? "") !== (values.modelId || capability.modelId)) problems.push("modelId 未进入请求");
    if (String(fields.imageUrl ?? "") !== wearableImageRef(product)) problems.push("imageUrl 与当前商品图不一致");
    if (String(fields.targetOriginUrl ?? "") !== wearableImageRef(model)) problems.push("targetOriginUrl 与当前模特图不一致");
    if (!String(fields.imageMaskUrl ?? "").trim()) problems.push("缺少商品蒙版 imageMaskUrl");
    if (!String(fields.targetMaskUrl ?? "").trim()) problems.push("缺少目标蒙版 targetMaskUrl");
    if (!input.prompt?.trim()) problems.push("提示词为空");
    if (input.prompt && !input.prompt.includes(wearablePartOf(values.part)?.label ?? "")) problems.push("提示词未携带穿戴部位");

    if (problems.length) {
        throw new AiWearableAdapterError("param-dropped", `提交参数校验失败：${problems.join("；")}`);
    }
}

/* ============================== 执行 ============================== */

export type WearableGatewayLike = {
    submit: (input: BrowserToolInput, options?: SubmitOptions) => Promise<ToolTask>;
    waitForResult: (taskId: string, options?: WaitOptions) => Promise<ToolTask>;
    retry?: (taskId: string, input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
};

export type RunAiWearableOptions = {
    gateway: WearableGatewayLike;
    values: WearableValues;
    capability: WearableCapability;
    product: WearableSourceAsset;
    model: WearableSourceAsset;
    masks: WearableMaskRefs;
    /** 生图模型覆盖（留空用用户配置）。 */
    modelOverride?: string;
    revision?: number | string | null;
    signal?: AbortSignal;
    onUpdate?: (task: ToolTask) => void;
    wait?: WaitOptions;
};

export type AiWearableRun = {
    task: ToolTask;
    snapshot: WearableSnapshot;
    capability: WearableCapability;
    values: WearableValues;
    changes: string[];
};

const isTerminal = (status: ToolTask["status"]) => status === "succeeded" || status === "failed" || status === "unknown";

function prepare(options: Omit<RunAiWearableOptions, "gateway" | "signal" | "onUpdate" | "wait" | "modelOverride">) {
    const linked = linkWearableValues(options.values);
    const values = linked.values;
    const issues = validateWearableState({
        values,
        capability: options.capability,
        productReady: isWearableSourceReady(options.product),
        modelReady: isWearableSourceReady(options.model),
        productSize: options.product,
        modelSize: options.model,
    });
    if (issues.length) {
        throw new AiWearableAdapterError("validation-failed", issues.map((issue) => issue.message).join("；"), issues);
    }
    const build: BuildWearableFieldsInput = {
        values,
        capability: options.capability,
        product: options.product,
        model: options.model,
        masks: options.masks,
    };
    const prompt = buildWearablePrompt(values, options.capability);
    const input: BrowserToolInput = {
        toolId: AI_WEARABLE_TOOL_ID,
        prompt,
        references: [toWearableReference(options.product), toWearableReference(options.model)],
        count: values.outputNum,
        fields: buildWearableFields(build),
    };
    assertWearableInput(input, build);
    const snapshot = createWearableSnapshot(values, options.capability, options.revision ?? null);
    return { values, changes: linked.changes, input, snapshot, output: computeWearableOutput(values) };
}

/** 先联动收敛 → 再校验 → 防丢参守卫 → 真实提交 → 等结果。 */
export async function runAiWearable(options: RunAiWearableOptions): Promise<AiWearableRun> {
    const { gateway, signal, onUpdate, wait, modelOverride } = options;
    const prepared = prepare(options);
    if (!isWearableRegionUsable(prepared.values.targetRegion) || !isWearableRegionUsable(prepared.values.productRegion)) {
        throw new AiWearableAdapterError("mask-degenerate", "蒙版区域不可用，请重新绘制。");
    }
    const submitted = await gateway.submit(
        { ...prepared.input, ...(modelOverride ? { model: modelOverride } : {}) },
        { signal, draftRevision: prepared.snapshot.revision },
    );
    onUpdate?.(submitted);
    if (isTerminal(submitted.status)) {
        return { task: submitted, snapshot: prepared.snapshot, capability: options.capability, values: prepared.values, changes: prepared.changes };
    }
    const final = await gateway.waitForResult(submitted.id, { ...wait, signal, onUpdate, draftRevision: prepared.snapshot.revision });
    return { task: final, snapshot: prepared.snapshot, capability: options.capability, values: prepared.values, changes: prepared.changes };
}

export type RetryAiWearableOptions = Omit<RunAiWearableOptions, "onUpdate"> & { taskId: string; task: ToolTask };

/** 按“同一配置快照”重试：值来自快照恢复后的 values，不接受临时拼装。 */
export async function retryAiWearable(options: RetryAiWearableOptions): Promise<AiWearableRun> {
    const { gateway, taskId, task } = options;
    if (!gateway.retry) throw new AiWearableAdapterError("retry-unsupported", "当前网关不支持重试，请新建任务。");
    const prepared = prepare(options);
    const retried = await gateway.retry(taskId, { ...prepared.input, ...(options.modelOverride ? { model: options.modelOverride } : {}) }, {
        signal: options.signal,
        draftRevision: prepared.snapshot.revision,
    });
    return { task: retried, snapshot: prepared.snapshot, capability: options.capability, values: prepared.values, changes: prepared.changes };
}

/** 单件重试：结果区某一张失败时只重跑该张，成功后按位置合并，已成功的格子不重复生成。 */
export function mergeWearableVariant(previous: ToolTask, variant: ToolTask, index: number): ToolTask {
    const items = [...(previous.result?.items ?? [])];
    const next = variant.result?.items?.[0];
    if (!next) return previous;
    items[index] = next;
    return {
        ...previous,
        status: variant.status,
        error: variant.error,
        result: { ...(previous.result ?? { kind: "image" as const, items: [] }), items },
    } as ToolTask;
}

/* ============================== 结果 ============================== */

export function wearableResultItems(task?: ToolTask | null): ToolTaskResultItem[] {
    if (!task || !task.result) return [];
    return task.result.items ?? [];
}

export type WearableResultCell = {
    index: number;
    status: "pending" | "succeeded" | "failed";
    item?: ToolTaskResultItem;
};

/** 结果区按“张”渲染：未生成/成功/失败各有状态，部分失败只显示失败格子。 */
export function wearableResultCells(task: ToolTask | undefined, expected: number): WearableResultCell[] {
    const items = wearableResultItems(task);
    const count = Math.max(expected, 0);
    return Array.from({ length: count }, (_, index) => {
        const item = items[index];
        if (item) return { index, status: "succeeded" as const, item };
        if (!task) return { index, status: "pending" as const };
        if (task.status === "failed") return { index, status: "failed" as const };
        if (task.status === "succeeded") return { index, status: "failed" as const };
        return { index, status: "pending" as const };
    });
}

/**
 * 结果字段回填：合成结果同时作为 imageResultUrl（商品侧）与 targetResultUrl（模特侧）。
 * 只在拿到真实结果资产引用后调用，禁止用空串“占位成功”。
 */
export function bindWearableResultFields(resultRef: string): { imageResultUrl: string; targetResultUrl: string } {
    const ref = resultRef.trim();
    if (!ref) throw new AiWearableAdapterError("result-missing", "结果资产为空，无法回填结果字段。");
    return { imageResultUrl: ref, targetResultUrl: ref };
}

export type WearableResultView = {
    cells: WearableResultCell[];
    stale: string | undefined;
    firstResult: ToolTaskResultItem | undefined;
    resultFields: { imageResultUrl: string; targetResultUrl: string } | undefined;
};

export function wearableResultFromTask(
    task: ToolTask | undefined,
    snapshot: WearableSnapshot | undefined,
    current: WearableSnapshot | undefined,
    expected: number,
): WearableResultView {
    const cells = wearableResultCells(task, expected);
    const first = wearableResultItems(task)[0];
    const ref = first?.url ?? "";
    return {
        cells,
        stale: task?.status === "succeeded" ? (snapshot && current && snapshot.hash !== current.hash ? "结果来自旧版本配置" : undefined) : undefined,
        firstResult: first,
        resultFields: ref ? bindWearableResultFields(ref) : undefined,
    };
}

/* ============================== 摘要 ============================== */

export type WearableExecutionSummary = {
    executable: boolean;
    notes: string[];
    capability: WearableCapability;
    /** 提交时会被下发的字段（含结果字段之外的 11 个）。 */
    submitFields: readonly string[];
    missingResultFields: readonly string[];
};

/** 供 Shell/ToolShell 展示“能不能真的提交”：不改任何状态，只汇总证据。 */
export function summarizeWearableExecution(input: WearableCapabilityInput = {}): WearableExecutionSummary {
    const capability = resolveWearableCapability(input);
    const notes = [...capability.notices];
    if (capability.missingFields.length) {
        notes.push(`网关字段表缺少 ${capability.missingFields.join("、")}，这些字段可能不会透传到 provider`);
    }
    const missingResultFields = AI_WEARABLE_FIELDS.filter((field) => field === "imageResultUrl" || field === "targetResultUrl");
    return {
        executable: capability.executable,
        notes,
        capability,
        submitFields: WEARABLE_SUBMIT_FIELDS,
        missingResultFields,
    };
}

/* ============================== 页面展示 ============================== */

export type WearablePartOptionView = { key: string; label: string; disabled: boolean; hint: string };

/** 品类 × 模特页签 → 部位按钮组（不兼容项禁用并给原因，不隐藏）。 */
export function wearablePartOptions(values: WearableValues): WearablePartOptionView[] {
    const category = wearableCategoryOf(values.productCategory);
    const tab = wearableModelTabOf(values.modelTabType);
    const available = new Set(wearablePartsFor(values.productCategory, values.modelTabType).map((part) => part.key));
    return (category?.parts ?? []).map((key) => {
        const part = wearablePartOf(key);
        return {
            key,
            label: part?.label ?? key,
            disabled: !available.has(key),
            hint: available.has(key) ? `${tab.label}可取景` : `「${tab.label}」取景不可用`,
        };
    });
}

export function wearableDraftPreview(values: WearableValues) {
    const category = wearableCategoryOf(values.productCategory);
    const part = wearablePartOf(values.part);
    const tab = wearableModelTabOf(values.modelTabType);
    const scene = wearableSceneTabOf(values.sceneTabType);
    return {
        title: `${category?.label ?? values.productCategory} · ${part?.label ?? values.part}`,
        subtitle: `${tab.label} / ${scene.label}`,
        output: computeWearableOutput(values),
    };
}

export { readWearableValues };
