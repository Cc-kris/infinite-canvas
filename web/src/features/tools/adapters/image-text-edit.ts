/**
 * TASK-036：IMAGE_TEXT_EDIT（图片文字编辑）真实 provider 适配器。
 *
 * 关键事实（决定本文件为什么这样写）：
 * - 网关只把 `prompt`（+ 参考图）送给 provider，`fields` 仅参与指纹与审计
 *   （services/api/tools/gateway.ts：ToolAdapterInput.fields 注释）。
 *   8 个页面字段里，源图/尺寸/格式/每个框的文本与几何必须全部写进 prompt，否则就是静默丢参。
 * - IMAGE_TEXT_EDIT 的 requiresReferences = true：源图必须作为参考图进入 edit 模式，
 *   否则网关直接抛 references-required；这里不允许“无图片提交”。
 * - resultImageUrl 是输出字段：提交时为空串，成功后由结果回写，禁止预填假地址。
 */

import type { BrowserToolInput, SubmitOptions, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
import type { ReferenceImage } from "@/types/image";

import {
    IMAGE_TEXT_EDIT_TOOL_ID,
    buildImageTextEditPrompt,
    composeImageTextEditFields,
    createImageTextEditSnapshot,
    describeImageTextEditDrift,
    imageTextEditFormat,
    validateImageTextEditState,
    type ImageTextEditIssue,
    type ImageTextEditSnapshot,
    type ImageTextEditValues,
} from "@/features/tools/registry/image-text-edit";

export class ImageTextEditAdapterError extends Error {
    readonly code: string;
    readonly issues: readonly ImageTextEditIssue[];

    constructor(code: string, message: string, issues: readonly ImageTextEditIssue[] = []) {
        super(message);
        this.name = "ImageTextEditAdapterError";
        this.code = code;
        this.issues = issues;
    }
}

/** 请求 id：一次逻辑操作对应一个 id，重试复用，便于日志关联。 */
export function createImageTextEditRequestId(): string {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") return `image-text-${cryptoApi.randomUUID()}`;
    return `image-text-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ------------------------------ 参考图 ------------------------------ */

/** 源图 → 网关参考图。data URL 直接放 dataUrl；http(s) 地址放 url，两者都保留原值。 */
export function toImageTextEditReference(values: ImageTextEditValues): ReferenceImage {
    const source = values.imageUrl.trim();
    const isDataUrl = source.startsWith("data:");
    return {
        id: "image-text-edit-source",
        name: values.imageName.trim() || "source-image",
        type: imageTextEditFormat(values.imageFormat)?.mime ?? "image/png",
        dataUrl: isDataUrl ? source : "",
        url: isDataUrl ? undefined : source || undefined,
    };
}

/* ------------------------------ 请求体 ------------------------------ */

export function buildImageTextEditFields(values: ImageTextEditValues, requestId: string): Record<string, unknown> {
    const snapshot = createImageTextEditSnapshot(values, null, requestId);
    return { ...composeImageTextEditFields(snapshot), requestId };
}

export function buildImageTextEditInput(input: { values: ImageTextEditValues; model?: string; requestId: string; revision?: number | string | null; previousResultUrl?: string }): BrowserToolInput {
    const { values, model, requestId } = input;
    const snapshot = createImageTextEditSnapshot(values, input.revision ?? null, requestId);
    const prompt = buildImageTextEditPrompt({ snapshot, previousResultUrl: input.previousResultUrl });
    return {
        toolId: IMAGE_TEXT_EDIT_TOOL_ID,
        prompt,
        count: 1,
        model: model?.trim() || undefined,
        references: [toImageTextEditReference(values)],
        fields: { ...composeImageTextEditFields(snapshot), requestId },
    };
}

/* ------------------------------ 审计 ------------------------------ */

const collapse = (value: string) => value.replace(/\s+/g, " ").trim();

export type ImageTextEditAudit = {
    requestId: string;
    ok: boolean;
    issues: string[];
    /** prompt 是否真的带上了每个框与每个关键参数（网关只送 prompt，必须在这里坐实）。 */
    promptCarries: { imageName: boolean; dimensions: boolean; format: boolean; boxes: boolean; resultHandoff: boolean };
};

export function auditImageTextEditFields(fields: Record<string, unknown> | undefined, values: ImageTextEditValues, requestId: string, providerPrompt: string): ImageTextEditAudit {
    const actual = fields ?? {};
    const expected = buildImageTextEditFields(values, requestId);
    const issues: string[] = [];

    for (const [key, value] of Object.entries(expected)) {
        if (key === "boxes") continue;
        if (actual[key] !== value) issues.push(`字段 ${key} 期望 ${String(value)}，实际 ${String(actual[key])}`);
    }
    const expectedBoxes = expected.boxes as Array<Record<string, unknown>>;
    const actualBoxes = Array.isArray(actual.boxes) ? (actual.boxes as Array<Record<string, unknown>>) : [];
    if (actualBoxes.length !== expectedBoxes.length) issues.push(`boxes 数量期望 ${expectedBoxes.length}，实际 ${actualBoxes.length}`);
    expectedBoxes.forEach((box, index) => {
        const other = actualBoxes[index] ?? {};
        for (const key of ["id", "text", "x", "y", "width", "height", "fontSize", "fontWeight", "align", "color", "fontId"]) {
            if (other[key] !== box[key]) {
                issues.push(`框 ${index + 1} 的 ${key} 期望 ${String(box[key])}，实际 ${String(other[key])}`);
                break;
            }
        }
    });
    const extra = Object.keys(actual).filter((key) => key !== "requestId" && !(key in expected));
    if (extra.length) issues.push(`出现未声明字段：${extra.join("、")}`);

    const prompt = providerPrompt ?? "";
    const collapsed = collapse(prompt);
    const dimensions = `${values.imageWidth}×${values.imageHeight}`;
    const promptCarries = {
        imageName: Boolean(values.imageName.trim()) && collapsed.includes(collapse(values.imageName)),
        dimensions: Boolean(values.imageWidth && values.imageHeight) && collapsed.includes(dimensions),
        format: Boolean(values.imageFormat) && collapsed.includes(values.imageFormat),
        boxes: values.boxes.length > 0 && values.boxes.every((box) => collapsed.includes(collapse(box.text)) && prompt.includes(`${Math.round(box.x * 10000) / 100}%`) && prompt.includes(`${box.fontSize}`)),
        resultHandoff: !values.resultImageUrl.trim() || collapsed.includes(collapse(values.resultImageUrl)),
    };
    for (const [key, carried] of Object.entries(promptCarries)) {
        if (!carried) issues.push(`prompt 未带上 ${key}`);
    }

    return { requestId, ok: issues.length === 0, issues, promptCarries };
}

/** 提交前守卫：阻断项、字段丢失、prompt 漏参、参考图缺失、数量不为 1，都直接抛错。 */
export function assertImageTextEditInput(input: BrowserToolInput, values: ImageTextEditValues, requestId: string, modelReady = true): void {
    if (input.toolId !== IMAGE_TEXT_EDIT_TOOL_ID) throw new ImageTextEditAdapterError("wrong-tool", `工具应为 ${IMAGE_TEXT_EDIT_TOOL_ID}，实际 ${input.toolId}。`);
    if ((input.count ?? 1) !== 1) throw new ImageTextEditAdapterError("count-fixed", "图片文字编辑单次只输出 1 张，数量字段不可改写。");
    const references = input.references ?? [];
    if (!references.length || !(references[0].dataUrl || references[0].url)) {
        throw new ImageTextEditAdapterError("references-required", "请先上传要编辑文字的图片。");
    }
    const blocking = validateImageTextEditState({ values, modelReady }).filter((issue) => issue.code !== "box-overflow" && issue.code !== "box-missing-glyph");
    if (blocking.length) throw new ImageTextEditAdapterError(blocking[0].code, blocking[0].message, blocking);

    const audit = auditImageTextEditFields(input.fields as Record<string, unknown> | undefined, values, requestId, input.prompt ?? "");
    if (!audit.ok) throw new ImageTextEditAdapterError("audit-failed", audit.issues[0] ?? "请求审计失败。");
}

/* ------------------------------ 运行 ------------------------------ */

export type ImageTextEditGatewayLike = {
    submit: (input: BrowserToolInput, options?: SubmitOptions) => Promise<ToolTask>;
    waitForResult: (taskId: string, options?: WaitOptions) => Promise<ToolTask>;
    retry?: (taskId: string, input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
};

export type RunImageTextEditOptions = {
    gateway: ImageTextEditGatewayLike;
    values: ImageTextEditValues;
    model?: string;
    revision?: number | string | null;
    requestId?: string;
    modelReady?: boolean;
    signal?: AbortSignal;
    onUpdate?: (task: ToolTask) => void;
    wait?: WaitOptions;
};

export type ImageTextEditRun = { task: ToolTask; snapshot: ImageTextEditSnapshot; requestId: string; responseId: string };

const isTerminal = (status: ToolTask["status"]) => status === "succeeded" || status === "failed" || status === "cancelled" || status === "unknown";

function guardRun(options: RunImageTextEditOptions) {
    const requestId = options.requestId ?? createImageTextEditRequestId();
    const input = buildImageTextEditInput({
        values: options.values,
        model: options.model,
        requestId,
        revision: options.revision ?? null,
        previousResultUrl: options.values.resultImageUrl.trim() || undefined,
    });
    assertImageTextEditInput(input, options.values, requestId, options.modelReady ?? true);
    const snapshot = createImageTextEditSnapshot(options.values, options.revision ?? null, requestId);
    return { requestId, input, snapshot };
}

export function imageTextEditResponseId(task: ToolTask | null | undefined): string {
    const raw = (task as unknown as { responseId?: unknown; providerRequestId?: unknown } | null) ?? null;
    const value = raw?.responseId ?? raw?.providerRequestId;
    return typeof value === "string" ? value : "";
}

export async function runImageTextEdit(options: RunImageTextEditOptions): Promise<ImageTextEditRun> {
    const { gateway, signal, onUpdate, wait } = options;
    const { requestId, input, snapshot } = guardRun(options);
    const submitted = await gateway.submit(input, { signal, draftRevision: options.revision ?? null });
    onUpdate?.(submitted);
    const final = isTerminal(submitted.status) ? submitted : await gateway.waitForResult(submitted.id, { ...wait, signal, onUpdate });
    return { task: final, snapshot, requestId, responseId: imageTextEditResponseId(final) };
}

export type RetryImageTextEditOptions = RunImageTextEditOptions & { taskId: string };

/** 同快照重试：重建请求并再次守卫，复用同一 requestId；是否允许重试由网关状态守卫决定。 */
export async function retryImageTextEdit(options: RetryImageTextEditOptions): Promise<ImageTextEditRun> {
    const { gateway, signal, onUpdate, wait, taskId } = options;
    if (!gateway.retry) throw new ImageTextEditAdapterError("retry-unsupported", "当前网关不支持按任务重试。");
    const { requestId, input, snapshot } = guardRun(options);
    const retried = await gateway.retry(taskId, input, { ...wait, signal, onUpdate });
    onUpdate?.(retried);
    const final = isTerminal(retried.status) ? retried : await gateway.waitForResult(retried.id, { ...wait, signal, onUpdate });
    return { task: final, snapshot, requestId, responseId: imageTextEditResponseId(final) };
}

/* ------------------------------ 结果 ------------------------------ */

export type ImageTextEditResult = {
    taskId?: string;
    status: ToolTask["status"] | "idle";
    images: ToolTaskResultItem[];
    error?: string;
    /** 结果对应快照与当前配置不一致时为 true，且 drift 指明维度。 */
    stale: boolean;
    drift: string;
    snapshot?: ImageTextEditSnapshot;
    requestId?: string;
    responseId?: string;
};

/** 结果图地址：优先已入库 url，其次内存 dataUrl；空则返回空串（不编造地址）。 */
export function imageTextEditResultUrl(item: ToolTaskResultItem | undefined): string {
    if (!item) return "";
    return (item.url ?? item.dataUrl ?? "").trim();
}

export function imageTextEditResultFromTask(task: ToolTask | null | undefined, snapshot: ImageTextEditSnapshot, current: ImageTextEditSnapshot, drift?: string): ImageTextEditResult {
    const images = (task?.result?.items ?? []).filter((item) => item.kind === "image");
    return {
        taskId: task?.id,
        status: task?.status ?? "idle",
        images,
        error: task?.error?.message,
        stale: Boolean(task) && (snapshot.fingerprint !== current.fingerprint || Boolean(drift)),
        drift: drift ?? describeImageTextEditDrift(snapshot, current),
        snapshot,
        requestId: snapshot.requestId,
        responseId: imageTextEditResponseId(task),
    };
}

export function imageTextEditResultNotice(result: ImageTextEditResult): string {
    if (!result.taskId) return "尚无结果：上传图片、框选文字框并填写文字后点击“生成图片文字”。";
    if (result.stale) return `当前配置已变化（${result.drift || "配置"}），下方结果来自上一次快照，请重新生成后再使用。`;
    if (result.status === "failed") return result.error ? `生成失败：${result.error}` : "生成失败：上游未返回原因。";
    if (result.status === "unknown") return "任务状态未知：请先查询，确认后再决定是否重试（避免重复扣费）。";
    if (result.status === "running" || result.status === "submitting") return "正在生成，请稍候…";
    if (result.status === "cancelled") return "任务已取消。";
    if (!result.images.length) return "上游报告完成但没有返回图片，按失败处理。";
    return "";
}

/** 换源图 / 改框后旧结果必须显式降级，不能冒充当前配置结果。 */
export function imageTextEditStaleNotice(values: ImageTextEditValues, latest: ImageTextEditSnapshot | null, current: ImageTextEditSnapshot): string {
    if (!latest) return "";
    if (!describeImageTextEditDrift(latest, current)) return "";
    if (!values.boxes.length) return "文字框已清空，下方结果来自旧快照。";
    return "源图或文字框已变更，下方结果来自旧版本，导出前请重新生成。";
}
