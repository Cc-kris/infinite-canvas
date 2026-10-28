import type { ReferenceImage } from "@/types/image";

import type { BrowserToolInput, SubmitOptions, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";

import {
    SDS_DESIGN_TOOL_ID,
    SDS_MATERIAL_COUNT,
    SDS_UPLOAD_LIMITS,
    buildSdsPrompt,
    createSdsSnapshot,
    isSdsReady,
    sdsColorOption,
    sdsExpectedOutputCount,
    sdsPlacementLine,
    sdsTilingPreset,
    validateSdsDesignState,
    type SdsIssue,
    type SdsMaterial,
    type SdsSnapshot,
    type SdsValues,
} from "../registry/sds-design";

/**
 * TASK-031：SDS_DESIGN（素材贴合）真实 provider 适配层。
 *
 * 真实边界（不接受演示成功）：
 * - 提交走 TASK-005 的 ToolTaskGateway（带参考图即图生图编辑），图片真实上传：references[0] 是商品底图，其后是素材；
 * - 网关只把 prompt + references 发给模型（fields 仅参与指纹/审计），所以贴合几何、平铺、颜色、商品 id 通过
 *   `buildSdsPrompt` 的确定性文案下发，并由 `assertSdsDesignInput` 逐行核对“页面上看到的就是发出去的”；
 * - fields 严格只有 gateway TOOL_ADAPTER_TABLE.SDS_DESIGN 声明的 5 个字段，不塞 UI 装饰位；
 * - 结果只来自 task.result.items：本模块不生成占位图；成功但 0 张 → 明确按失败处理；
 * - 输出与素材一一对应：结果槽位按提交快照的素材顺序配对，缺哪一张就明确标出，可只补缺失的那几张。
 */

export type SdsSourceAsset = {
    assetId: string;
    dataUrl?: string;
    url?: string;
    name?: string;
    mimeType?: string;
    bytes?: number;
    width?: number;
    height?: number;
};

export class SdsAdapterError extends Error {
    readonly code: string;
    readonly issues: SdsIssue[];

    constructor(code: string, message: string, issues: SdsIssue[] = []) {
        super(message);
        this.name = "SdsAdapterError";
        this.code = code;
        this.issues = issues;
    }
}

export type SdsAssetRole = "material" | "product";

const ROLE_LABEL: Record<SdsAssetRole, string> = { material: "素材", product: "商品图" };

export function isSdsSourceReady(source?: SdsSourceAsset | null): boolean {
    if (!source || !source.assetId.trim()) return false;
    const src = source.dataUrl || source.url || "";
    return src.startsWith("data:image/") || src.startsWith("https://") || src.startsWith("http://") || src.startsWith("blob:");
}

export function validateSdsSource(
    source: SdsSourceAsset,
    role: SdsAssetRole = "material",
): { ok: true } | { ok: false; code: "mime" | "size" | "dimension"; message: string } {
    const label = ROLE_LABEL[role];
    const mime = (source.mimeType ?? "").toLowerCase();
    if (mime && !(SDS_UPLOAD_LIMITS.mimeTypes as readonly string[]).includes(mime)) {
        return { ok: false, code: "mime", message: `${label}不支持 ${mime}，仅支持 png、jpeg、webp。` };
    }
    if (source.bytes !== undefined && source.bytes > SDS_UPLOAD_LIMITS.maxBytes) {
        return { ok: false, code: "size", message: `${label}不能超过 ${Math.round(SDS_UPLOAD_LIMITS.maxBytes / 1024 / 1024)}MB。` };
    }
    if (source.width && source.height) {
        if (Math.max(source.width, source.height) > SDS_UPLOAD_LIMITS.maxSide) {
            return { ok: false, code: "dimension", message: `${label}最大支持 ${SDS_UPLOAD_LIMITS.maxSide}×${SDS_UPLOAD_LIMITS.maxSide}。` };
        }
        if (Math.min(source.width, source.height) < SDS_UPLOAD_LIMITS.minSide) {
            return { ok: false, code: "dimension", message: `${label}短边至少 ${SDS_UPLOAD_LIMITS.minSide}px。` };
        }
    }
    return { ok: true };
}

export function toSdsReference(source: SdsSourceAsset, role: SdsAssetRole): ReferenceImage {
    if (!isSdsSourceReady(source)) throw new SdsAdapterError("source-missing", `${ROLE_LABEL[role]}尚未就绪，请重新上传。`);
    return {
        id: source.assetId,
        name: source.name ?? `${source.assetId}.png`,
        type: source.mimeType ?? "image/png",
        dataUrl: source.dataUrl ?? source.url ?? "",
        ...(source.url && !source.url.startsWith("data:") ? { url: source.url } : {}),
    };
}

/* ============================== 字段组装 ============================== */

/** 网关 SDS_DESIGN 允许的字段（与 TOOL_ADAPTER_TABLE.SDS_DESIGN 完全一致）。 */
export const SDS_DESIGN_ALLOWED_FIELDS = ["imageList", "imageName", "imageUrl", "materialList", "productId"] as const;

export function createSdsRequestId(now: number = Date.now(), random: number = Math.random()): string {
    const suffix = Math.floor(Math.abs(random) * 0xffffffff)
        .toString(36)
        .padStart(6, "0")
        .slice(0, 8);
    return `sds-${now.toString(36)}-${suffix}`;
}

function remoteUrl(asset: { url?: string; assetId: string }): string {
    const url = asset.url ?? "";
    return url && !url.startsWith("data:") && !url.startsWith("blob:") ? url : asset.assetId;
}

export function buildSdsImageList(materials: readonly SdsMaterial[]): Array<Record<string, unknown>> {
    return materials.map((material, index) => ({
        assetId: material.assetId,
        order: index,
        name: material.name,
        url: remoteUrl(material),
        ...(material.width ? { width: material.width } : {}),
        ...(material.height ? { height: material.height } : {}),
    }));
}

/** 每个素材一条 placement：位置/缩放/旋转/平铺，顺序与 imageList 一致。 */
export function buildSdsMaterialList(materials: readonly SdsMaterial[]): Array<Record<string, unknown>> {
    return materials.map((material, index) => ({
        assetId: material.assetId,
        order: index,
        name: material.name,
        x: material.placement.x,
        y: material.placement.y,
        scale: material.placement.scale,
        rotation: material.placement.rotation,
        tilingPresetId: material.tilingPresetId,
    }));
}

/** 只写 5 个契约字段：图片列表、素材名、主素材地址、贴合列表、商品 id。 */
export function buildSdsDesignFields(values: SdsValues): Record<string, unknown> {
    const materials = values.materials;
    const first = materials[0];
    return {
        imageList: buildSdsImageList(materials),
        imageName: values.imageName.trim() || (first?.name ?? ""),
        imageUrl: first ? remoteUrl(first) : "",
        materialList: buildSdsMaterialList(materials),
        productId: values.product?.assetId ?? "",
    };
}

export type BuildSdsDesignInputOptions = {
    values: SdsValues;
    model?: string;
    revision?: number | string | null;
    /** 只提交这些素材（用于“部分失败后补生成”）；缺省为全部。 */
    materialIndexes?: readonly number[];
};

function subsetValues(values: SdsValues, indexes?: readonly number[]): SdsValues {
    if (!indexes) return values;
    const materials = indexes.map((index) => values.materials[index]).filter((material): material is SdsMaterial => Boolean(material));
    return { ...values, materials, selectedMaterialId: materials[0]?.assetId ?? null };
}

export function buildSdsDesignInput({ values, model, revision = null, materialIndexes }: BuildSdsDesignInputOptions): BrowserToolInput {
    const selected = subsetValues(values, materialIndexes);
    if (!selected.product || !isSdsSourceReady(selected.product)) {
        throw new SdsAdapterError("product-missing", "请先选择/上传商品图。");
    }
    if (!selected.materials.length) throw new SdsAdapterError("material-missing", "请至少上传 1 个素材。");
    if (selected.materials.length > SDS_MATERIAL_COUNT.max) {
        throw new SdsAdapterError("material-too-many", `素材最多 ${SDS_MATERIAL_COUNT.max} 个。`);
    }
    for (const material of selected.materials) {
        if (!isSdsSourceReady(material)) throw new SdsAdapterError("material-missing", `素材「${material.name}」尚未就绪。`);
    }
    const references = [toSdsReference(selected.product, "product"), ...selected.materials.map((material) => toSdsReference(material, "material"))];
    return {
        toolId: SDS_DESIGN_TOOL_ID,
        prompt: buildSdsPrompt(selected),
        references,
        ...(model && model.trim() ? { model: model.trim() } : {}),
        count: sdsExpectedOutputCount(selected),
        fields: buildSdsDesignFields(selected),
    };
}

/* ============================== 防丢参审计 ============================== */

export type SdsFieldAudit = {
    ok: boolean;
    missing: string[];
    unexpected: string[];
    mismatched: string[];
};

function sameValue(expected: unknown, actual: unknown): boolean {
    if (typeof expected === "number" || typeof expected === "boolean") return expected === actual;
    return JSON.stringify(expected ?? null) === JSON.stringify(actual ?? null);
}

/** 逐字段自检：期望值由页面状态推导，实际值取自即将发送的 fields。 */
export function auditSdsDesignFields(fields: Record<string, unknown> | undefined, values: SdsValues): SdsFieldAudit {
    const actual = fields ?? {};
    const expected = buildSdsDesignFields(values);
    const allowed = new Set<string>(SDS_DESIGN_ALLOWED_FIELDS);
    const missing = SDS_DESIGN_ALLOWED_FIELDS.filter((field) => !(field in actual));
    const unexpected = Object.keys(actual).filter((key) => !allowed.has(key));
    const mismatched = SDS_DESIGN_ALLOWED_FIELDS.filter((field) => field in actual && !sameValue(expected[field], actual[field]));
    return { ok: !missing.length && !mismatched.length && !unexpected.length, missing, unexpected, mismatched };
}

/** 提交守卫：字段丢失/几何丢失/图片没带上，都在发请求前拦住。 */
export function assertSdsDesignInput(input: BrowserToolInput, values: SdsValues): void {
    const problems: string[] = [];
    const count = sdsExpectedOutputCount(values);
    if (input.toolId !== SDS_DESIGN_TOOL_ID) problems.push(`toolId 必须是 ${SDS_DESIGN_TOOL_ID}`);
    if (input.count !== count) problems.push(`输出数量未进入请求（期望 ${count}）`);
    const refs = input.references ?? [];
    if (refs.length !== values.materials.length + 1) problems.push(`参考图数量应为 商品图 + ${values.materials.length} 个素材，实际 ${refs.length}`);
    if (values.product && refs[0]?.id !== values.product.assetId) problems.push("商品图未排在参考图第一位");

    const audit = auditSdsDesignFields((input.fields ?? {}) as Record<string, unknown>, values);
    if (audit.missing.length) problems.push(`字段丢失：${audit.missing.join("、")}`);
    if (audit.mismatched.length) problems.push(`字段不一致：${audit.mismatched.join("、")}`);
    if (audit.unexpected.length) problems.push(`出现未声明字段：${audit.unexpected.join("、")}`);

    const prompt = input.prompt ?? "";
    if (values.product && !prompt.includes(values.product.assetId)) problems.push("商品 ID 未进入提示词");
    if (!prompt.includes(sdsColorOption(values.colorId).label)) problems.push("颜色未进入提示词");
    if (!prompt.includes(`输出 ${count} 张`)) problems.push("输出数量未进入提示词");
    values.materials.forEach((material, index) => {
        const line = sdsPlacementLine(material, index);
        if (!prompt.includes(line)) problems.push(`第 ${index + 1} 个素材的贴合参数未进入提示词`);
        if (!prompt.includes(sdsTilingPreset(material.tilingPresetId).label)) problems.push(`第 ${index + 1} 个素材的平铺方式未进入提示词`);
    });

    if (problems.length) throw new SdsAdapterError("param-dropped", `提交参数校验失败：${problems.join("；")}`);
}

/* ============================== 执行 ============================== */

export type SdsGatewayLike = {
    submit: (input: BrowserToolInput, options?: SubmitOptions) => Promise<ToolTask>;
    waitForResult: (taskId: string, options?: WaitOptions) => Promise<ToolTask>;
    retry?: (taskId: string, input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
};

export type SdsRunOptions = {
    gateway: SdsGatewayLike;
    values: SdsValues;
    model?: string;
    revision?: number | string | null;
    requestId?: string;
    imageModelReady?: boolean;
    /** 只跑这些素材（部分失败补生成）。 */
    materialIndexes?: readonly number[];
    signal?: AbortSignal;
    onUpdate?: (task: ToolTask) => void;
    wait?: WaitOptions;
};

export type SdsRun = { task: ToolTask; snapshot: SdsSnapshot; requestId: string; responseId: string };

const isTerminal = (status: ToolTask["status"]) =>
    status === "succeeded" || status === "failed" || status === "cancelled" || status === "unknown";

export function sdsResponseId(task?: ToolTask | null): string {
    return task?.upstreamTaskId ?? "";
}

function guardRun(values: SdsValues, imageModelReady: boolean): SdsValues {
    const issues = validateSdsDesignState({ values, hasModel: imageModelReady });
    const blocking = issues.filter((issue) => issue.code !== "model-missing" || !imageModelReady);
    if (blocking.length) throw new SdsAdapterError("invalid-config", blocking[0].message, blocking);
    for (const material of values.materials) {
        const check = validateSdsSource(material, "material");
        if (!check.ok) throw new SdsAdapterError(check.code, check.message);
    }
    if (values.product) {
        const check = validateSdsSource(values.product, "product");
        if (!check.ok) throw new SdsAdapterError(check.code, check.message);
    }
    if (!isSdsReady(values, true)) throw new SdsAdapterError("invalid-config", "页面配置未通过校验，无法提交。");
    return values;
}

export async function runSdsDesign(options: SdsRunOptions): Promise<SdsRun> {
    const { gateway, values, model, revision = null, imageModelReady = true, signal, onUpdate, wait } = options;
    const selected = subsetValues(values, options.materialIndexes);
    guardRun(selected, imageModelReady);

    const requestId = options.requestId ?? createSdsRequestId();
    const input = buildSdsDesignInput({ values: selected, model, revision });
    assertSdsDesignInput(input, selected);
    const snapshot = createSdsSnapshot(selected, { revision, requestId });

    const submitted = await gateway.submit(input, { signal, draftRevision: revision });
    onUpdate?.(submitted);
    const final = isTerminal(submitted.status) ? submitted : await gateway.waitForResult(submitted.id, { ...wait, signal, onUpdate });
    return { task: final, snapshot, requestId, responseId: sdsResponseId(final) };
}

export type RetrySdsDesignOptions = SdsRunOptions & { taskId: string };

/** 同快照重试：请求按当前配置重建并再次守卫，复用同一个 requestId。 */
export async function retrySdsDesign(options: RetrySdsDesignOptions): Promise<SdsRun> {
    const { gateway, values, model, revision = null, imageModelReady = true, signal, onUpdate, wait, taskId } = options;
    if (!gateway.retry) throw new SdsAdapterError("retry-unsupported", "当前网关不支持按任务重试。");
    const selected = subsetValues(values, options.materialIndexes);
    guardRun(selected, imageModelReady);

    const requestId = options.requestId ?? createSdsRequestId();
    const input = buildSdsDesignInput({ values: selected, model, revision });
    assertSdsDesignInput(input, selected);
    const snapshot = createSdsSnapshot(selected, { revision, requestId });

    const retried = await gateway.retry(taskId, input, { ...wait, signal, onUpdate });
    onUpdate?.(retried);
    const final = isTerminal(retried.status) ? retried : await gateway.waitForResult(retried.id, { ...wait, signal, onUpdate });
    return { task: final, snapshot, requestId, responseId: sdsResponseId(final) };
}

/* ============================== 结果与槽位 ============================== */

export type SdsResultSlot = {
    index: number;
    assetId: string;
    name: string;
    /** 该素材对应的输出图；上游少给就是 undefined（不补造）。 */
    item?: ToolTaskResultItem;
};

export type SdsResult = {
    taskId?: string;
    status: ToolTask["status"] | "idle";
    slots: SdsResultSlot[];
    images: ToolTaskResultItem[];
    missingIndexes: number[];
    stale: boolean;
    drift: string;
    error?: string;
};

/**
 * 输出与素材一一对应：按快照顺序把 result.items 配对到槽位。
 * 上游多给/少给都保留真实数量，缺的槽位显式标出，不复制图片凑数。
 */
export function sdsResultSlots(task: ToolTask | undefined, snapshot: SdsSnapshot | undefined): SdsResultSlot[] {
    const items = (task?.result?.items ?? []).filter((item) => item.kind === "image" && (item.dataUrl || item.url));
    const materials = snapshot?.materials ?? [];
    return materials.map((material, index) => ({
        index,
        assetId: material.assetId,
        name: material.name,
        ...(items[index] ? { item: items[index] } : {}),
    }));
}

export function sdsMissingIndexes(slots: readonly SdsResultSlot[]): number[] {
    return slots.filter((slot) => !slot.item).map((slot) => slot.index);
}

/** 补生成计划：只重跑缺图的素材序号；全部拿到则返回空数组。 */
export function sdsRepairIndexes(result: Pick<SdsResult, "missingIndexes" | "status">): number[] {
    if (result.status !== "succeeded") return [];
    return result.missingIndexes;
}

export type SdsRunPair = { task?: ToolTask; snapshot?: SdsSnapshot };

export function sdsDesignResultFromTask(
    task: ToolTask | undefined,
    snapshot: SdsSnapshot | undefined,
    current: SdsSnapshot | undefined,
    drift = "",
): SdsResult {
    const slots = sdsResultSlots(task, snapshot);
    const images = (task?.result?.items ?? []).filter((item) => item.kind === "image" && (item.dataUrl || item.url));
    const stale = Boolean(snapshot) && Boolean(current) && snapshot?.fingerprint !== current?.fingerprint;
    return {
        status: task?.status ?? "idle",
        ...(task ? { taskId: task.id } : {}),
        slots,
        images,
        missingIndexes: task?.status === "succeeded" ? sdsMissingIndexes(slots) : [],
        stale,
        drift: stale ? drift : "",
        ...(task?.error ? { error: task.error.message } : {}),
    };
}

/** 结果区空态/失败态真实提示：成功但 0 张或少于素材数 → 明确说明缺几张，不补造。 */
export function sdsDesignResultNotice(result: SdsResult): string {
    if (result.status === "idle") return "暂无生成结果图：在左侧上传素材并选择商品后提交。";
    if (result.status === "failed") return result.error ? `生成失败：${result.error}` : "生成失败：上游未返回原因。";
    if (result.status === "unknown") return "任务状态未知：请先查询，确认后再决定是否重试（避免重复扣费）。";
    if (result.status === "running" || result.status === "submitting") return "正在贴合，请稍候…";
    if (result.status === "cancelled") return "任务已取消。";
    if (!result.images.length) return "上游报告完成但没有返回图片，按失败处理。";
    if (result.missingIndexes.length) {
        return `上游只返回了 ${result.images.length} 张，缺 ${result.missingIndexes.length} 张（第 ${result.missingIndexes.map((index) => index + 1).join("、")} 个素材），可只补生成缺失部分。`;
    }
    return "";
}

export function firstSdsImage(task?: ToolTask | null): string | undefined {
    const image = (task?.result?.items ?? []).find((item) => item.kind === "image" && (item.dataUrl || item.url));
    return image?.dataUrl || image?.url;
}
