import type { ReferenceImage } from "@/types/image";

import type { BrowserToolInput, SubmitOptions, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";

import {
    AI_TEXT_TOOL_ID,
    AI_TEXT_UPLOAD_LIMITS,
    aiTextExpectedOutputs,
    aiTextTilingFlag,
    aiTextTilingPromptLine,
    effectiveAiTextPrompt,
    isAiTextTilingPresetId,
    validateAiTextState,
    type AiTextIssue,
    type AiTextOptionSource,
    type AiTextSnapshot,
    type AiTextValues,
    createAiTextSnapshot,
} from "../registry/ai-text";

/**
 * TASK-029：AI_TEXT（POD素材）的真实 provider 适配层。
 *
 * 真实边界（不接受演示成功）：
 * - 提交走 TASK-005 的 ToolTaskGateway.submit → services/api/image.ts（带参考图即图生图编辑）；
 * - 只写 gateway TOOL_ADAPTER_TABLE.AI_TEXT 声明过的 14 个字段，绝不把 UI 装饰项塞成死字段；
 * - `assertAiTextInput` 在发请求前逐项核对“页面配置确实进了请求”，少一项就抛错；
 * - 结果只来自 task.result.items，本模块不生成占位图，失败/未知原样透出；
 * - `mode` / `ratio` / `styles` 选项来自模型目录，未加载时由 registry 校验直接拦下。
 */

export type AiTextSourceAsset = {
    assetId: string;
    /** data URL 或 http(s) URL；两者都没有视为未就绪。 */
    dataUrl?: string;
    url?: string;
    name?: string;
    mimeType?: string;
    bytes?: number;
    width?: number;
    height?: number;
};

export class AiTextAdapterError extends Error {
    readonly code: string;
    readonly issues: AiTextIssue[];

    constructor(code: string, message: string, issues: AiTextIssue[] = []) {
        super(message);
        this.name = "AiTextAdapterError";
        this.code = code;
        this.issues = issues;
    }
}

export function isAiTextSourceReady(source?: AiTextSourceAsset | null): boolean {
    if (!source || !source.assetId.trim()) return false;
    const src = source.dataUrl || source.url || "";
    return src.startsWith("data:image/") || src.startsWith("https://") || src.startsWith("http://") || src.startsWith("blob:");
}

export function validateAiTextSource(source: AiTextSourceAsset): { ok: true } | { ok: false; code: "mime" | "size" | "dimension"; message: string } {
    const mime = (source.mimeType ?? "").toLowerCase();
    if (mime && !(AI_TEXT_UPLOAD_LIMITS.mimeTypes as readonly string[]).includes(mime)) {
        return { ok: false, code: "mime", message: `不支持 ${mime}，POD 素材仅支持 png、jpeg、webp。` };
    }
    if (source.bytes !== undefined && source.bytes > AI_TEXT_UPLOAD_LIMITS.maxBytes) {
        return { ok: false, code: "size", message: `素材不能超过 ${Math.round(AI_TEXT_UPLOAD_LIMITS.maxBytes / 1024 / 1024)}MB。` };
    }
    if (source.width && source.height) {
        if (Math.max(source.width, source.height) > AI_TEXT_UPLOAD_LIMITS.maxSide) {
            return { ok: false, code: "dimension", message: `素材最大支持 ${AI_TEXT_UPLOAD_LIMITS.maxSide}×${AI_TEXT_UPLOAD_LIMITS.maxSide}。` };
        }
        if (Math.min(source.width, source.height) < AI_TEXT_UPLOAD_LIMITS.minSide) {
            return { ok: false, code: "dimension", message: `素材短边至少 ${AI_TEXT_UPLOAD_LIMITS.minSide}px。` };
        }
    }
    return { ok: true };
}

export function toAiTextReference(source: AiTextSourceAsset): ReferenceImage {
    if (!isAiTextSourceReady(source)) throw new AiTextAdapterError("source-missing", "请先上传 POD 素材底图。");
    return {
        id: source.assetId,
        name: source.name ?? `${source.assetId}.png`,
        type: source.mimeType ?? "image/png",
        dataUrl: source.dataUrl ?? source.url ?? "",
        ...(source.url && !source.url.startsWith("data:") ? { url: source.url } : {}),
    };
}

/* ============================== 请求组装 ============================== */

/** 网关 AI_TEXT 允许的字段（与 TOOL_ADAPTER_TABLE.AI_TEXT 一致）。 */
export const AI_TEXT_ALLOWED_FIELDS = [
    "aiSimpleTextPrompt",
    "imageUrl",
    "isCase",
    "mode",
    "outputNum",
    "prompt",
    "ratio",
    "requestId",
    "responseId",
    "styles",
    "stylesCn",
    "tilingPreset",
    "useAutopromptOption",
    "variationStrength",
] as const;

export function createAiTextRequestId(now: number = Date.now(), random: number = Math.random()): string {
    const suffix = Math.floor(Math.abs(random) * 0xffffffff)
        .toString(36)
        .padStart(6, "0")
        .slice(0, 8);
    return `pod-${now.toString(36)}-${suffix}`;
}

export type BuildAiTextFieldsOptions = {
    source: Pick<AiTextSourceAsset, "assetId" | "url">;
    requestId: string;
    /** 上游返回后回填，用于重试/结果追踪；提交时为空。 */
    responseId?: string;
};

/**
 * 只写上游真实存在的字段：布尔位显式 true/false（不得 undefined），
 * 空的可选文本字段不发送，避免用空串污染指纹。
 */
export function buildAiTextFields(values: AiTextValues, { source, requestId, responseId }: BuildAiTextFieldsOptions): Record<string, unknown> {
    const remote = source.url && !source.url.startsWith("data:") && !source.url.startsWith("blob:") ? source.url : "";
    const fields: Record<string, unknown> = {
        imageUrl: remote || source.assetId,
        isCase: values.isCase === true,
        mode: values.mode,
        outputNum: aiTextExpectedOutputs(values),
        prompt: effectiveAiTextPrompt(values),
        ratio: values.ratio,
        requestId,
        tilingPreset: aiTextTilingFlag(values.tilingPresetId),
        useAutopromptOption: values.useAutopromptOption === true,
        variationStrength: values.variationStrength === true,
    };
    const simple = values.aiSimpleTextPrompt.trim();
    if (simple) fields.aiSimpleTextPrompt = simple;
    if (values.styles.trim()) fields.styles = values.styles.trim();
    if (values.stylesCn.trim()) fields.stylesCn = values.stylesCn.trim();
    if (responseId) fields.responseId = responseId;
    return fields;
}

export type BuildAiTextInputOptions = {
    values: AiTextValues;
    source: AiTextSourceAsset;
    model?: string;
    requestId: string;
    responseId?: string;
    revision?: number | string | null;
};

export function buildAiTextInput({ values, source, model, requestId, responseId, revision = null }: BuildAiTextInputOptions): BrowserToolInput {
    if (!isAiTextSourceReady(source)) throw new AiTextAdapterError("source-missing", "请先上传 POD 素材底图。");
    if (!isAiTextTilingPresetId(values.tilingPresetId)) throw new AiTextAdapterError("tiling-invalid", "平铺预设不在支持列表中。");
    return {
        toolId: AI_TEXT_TOOL_ID,
        prompt: effectiveAiTextPrompt(values),
        references: [toAiTextReference(source)],
        ...(model && model.trim() ? { model: model.trim() } : {}),
        count: aiTextExpectedOutputs(values),
        fields: buildAiTextFields(values, { source, requestId, responseId }),
    };
}

/* ============================== 防丢参审计 ============================== */

export type AiTextAudit = {
    ok: boolean;
    missing: string[];
    unexpected: string[];
    mismatched: string[];
};

function sameValue(expected: unknown, actual: unknown): boolean {
    if (typeof expected === "boolean" || typeof expected === "number") return expected === actual;
    return String(expected ?? "") === String(actual ?? "");
}

/**
 * 逐字段自检：期望值由页面配置推导，实际值取自即将发送的 fields。
 * 任何缺失/多余/不一致都会被点名，防止“控件在页面上但请求里没有”。
 */
export function auditAiTextFields(fields: Record<string, unknown> | undefined, values: AiTextValues, requestId: string): AiTextAudit {
    const actual = fields ?? {};
    const expected: Record<string, unknown> = {
        isCase: values.isCase === true,
        mode: values.mode,
        outputNum: aiTextExpectedOutputs(values),
        prompt: effectiveAiTextPrompt(values),
        ratio: values.ratio,
        requestId,
        tilingPreset: aiTextTilingFlag(values.tilingPresetId),
        useAutopromptOption: values.useAutopromptOption === true,
        variationStrength: values.variationStrength === true,
    };
    if (values.aiSimpleTextPrompt.trim()) expected.aiSimpleTextPrompt = values.aiSimpleTextPrompt.trim();
    if (values.styles.trim()) expected.styles = values.styles.trim();
    if (values.stylesCn.trim()) expected.stylesCn = values.stylesCn.trim();

    const missing: string[] = [];
    const mismatched: string[] = [];
    for (const [key, value] of Object.entries(expected)) {
        if (!(key in actual)) missing.push(key);
        else if (!sameValue(value, actual[key])) mismatched.push(key);
    }
    const allowed = new Set<string>([
        ...AI_TEXT_ALLOWED_FIELDS,
        "imageUrl",
        ...(typeof actual.responseId === "string" && actual.responseId ? ["responseId"] : []),
    ]);
    const unexpected = Object.keys(actual).filter((key) => !allowed.has(key));
    return { ok: !missing.length && !mismatched.length && !unexpected.length, missing, unexpected, mismatched };
}

/** 提交守卫：参数丢失 / 提示词缺配置 / 参考图缺失都在发请求前拦住。 */
export function assertAiTextInput(input: BrowserToolInput, values: AiTextValues, requestId: string): void {
    const problems: string[] = [];
    if (input.toolId !== AI_TEXT_TOOL_ID) problems.push(`toolId 必须是 ${AI_TEXT_TOOL_ID}`);
    if (input.count !== aiTextExpectedOutputs(values)) problems.push(`输出数量未进入请求（期望 ${aiTextExpectedOutputs(values)}）`);
    if (!(input.references?.length ?? 0)) problems.push("缺少参考图");

    const audit = auditAiTextFields((input.fields ?? {}) as Record<string, unknown>, values, requestId);
    if (audit.missing.length) problems.push(`字段丢失：${audit.missing.join("、")}`);
    if (audit.mismatched.length) problems.push(`字段不一致：${audit.mismatched.join("、")}`);
    if (audit.unexpected.length) problems.push(`出现未声明字段：${audit.unexpected.join("、")}`);

    const prompt = input.prompt ?? "";
    if (!prompt.includes(aiTextTilingPromptLine(values.tilingPresetId))) problems.push("平铺规则未进入提示词");
    if (!prompt.includes(`输出 ${aiTextExpectedOutputs(values)} 张`)) problems.push("输出数量未进入提示词");
    if (values.ratio && !prompt.includes(values.ratio)) problems.push("输出比例未进入提示词");
    if (values.mode && !prompt.includes(values.mode)) problems.push("素材模式未进入提示词");
    const text = values.editor === "full" ? values.prompt.trim() : values.aiSimpleTextPrompt.trim();
    if (text && !prompt.includes(text)) problems.push("文字内容未进入提示词");
    if (values.styles.trim() && !prompt.includes(values.styles.trim())) problems.push("英文风格未进入提示词");
    if (values.stylesCn.trim() && !prompt.includes(values.stylesCn.trim())) problems.push("中文风格未进入提示词");

    if (problems.length) throw new AiTextAdapterError("param-dropped", `提交参数校验失败：${problems.join("；")}`);
}

/* ============================== 执行 ============================== */

export type AiTextGatewayLike = {
    submit: (input: BrowserToolInput, options?: SubmitOptions) => Promise<ToolTask>;
    waitForResult: (taskId: string, options?: WaitOptions) => Promise<ToolTask>;
    retry?: (taskId: string, input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
};

export type AiTextRunPort = {
    runTool: (input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
    retryTask?: (taskId: string, input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
};

export type RunAiTextOptions = {
    gateway: AiTextGatewayLike;
    values: AiTextValues;
    source: AiTextSourceAsset;
    model?: string;
    options?: AiTextOptionSource;
    revision?: number | string | null;
    requestId?: string;
    imageModelReady?: boolean;
    signal?: AbortSignal;
    onUpdate?: (task: ToolTask) => void;
    wait?: WaitOptions;
};

export type AiTextRun = { task: ToolTask; snapshot: AiTextSnapshot; requestId: string; responseId: string };

const isTerminal = (status: ToolTask["status"]) =>
    status === "succeeded" || status === "failed" || status === "cancelled" || status === "unknown";

/** 上游响应 id：真实来自任务记录，未拿到就是空串，不编造。 */
export function aiTextResponseId(task?: ToolTask | null): string {
    return task?.upstreamTaskId ?? "";
}

export async function runAiText(options: RunAiTextOptions): Promise<AiTextRun> {
    const { gateway, values, source, model, options: optionSource, revision = null, imageModelReady = true, signal, onUpdate, wait } = options;
    const issues = validateAiTextState({ values, sourceReady: isAiTextSourceReady(source), modelReady: imageModelReady, options: optionSource });
    if (issues.length) throw new AiTextAdapterError("invalid-config", issues[0].message, issues);
    const sourceCheck = validateAiTextSource(source);
    if (!sourceCheck.ok) throw new AiTextAdapterError(sourceCheck.code, sourceCheck.message);

    const requestId = options.requestId ?? createAiTextRequestId();
    const input = buildAiTextInput({ values, source, model, requestId, revision });
    assertAiTextInput(input, values, requestId);
    const snapshot = createAiTextSnapshot(values, { assetId: source.assetId }, revision, requestId);

    const submitted = await gateway.submit(input, { signal, draftRevision: revision });
    onUpdate?.(submitted);
    const final = isTerminal(submitted.status) ? submitted : await gateway.waitForResult(submitted.id, { ...wait, signal, onUpdate });
    return { task: final, snapshot, requestId, responseId: aiTextResponseId(final) };
}

export type RetryAiTextOptions = RunAiTextOptions & { taskId: string };

/**
 * 同快照重试：请求按当前配置重建并再次守卫，且复用同一个 requestId（日志可关联、不制造新请求 id）。
 * 已成功的任务不会被重复提交 —— 由 gateway.retry 的状态守卫保证。
 */
export async function retryAiText(options: RetryAiTextOptions): Promise<AiTextRun> {
    const { gateway, values, source, model, options: optionSource, revision = null, imageModelReady = true, signal, onUpdate, wait, taskId } = options;
    if (!gateway.retry) throw new AiTextAdapterError("retry-unsupported", "当前网关不支持按任务重试。");
    const issues = validateAiTextState({ values, sourceReady: isAiTextSourceReady(source), modelReady: imageModelReady, options: optionSource });
    if (issues.length) throw new AiTextAdapterError("invalid-config", issues[0].message, issues);

    const requestId = options.requestId ?? createAiTextRequestId();
    const input = buildAiTextInput({ values, source, model, requestId, revision });
    assertAiTextInput(input, values, requestId);
    const snapshot = createAiTextSnapshot(values, { assetId: source.assetId }, revision, requestId);

    const retried = await gateway.retry(taskId, input, { ...wait, signal, onUpdate });
    onUpdate?.(retried);
    const final = isTerminal(retried.status) ? retried : await gateway.waitForResult(retried.id, { ...wait, signal, onUpdate });
    return { task: final, snapshot, requestId, responseId: aiTextResponseId(final) };
}

/* ============================== 结果 ============================== */

export type AiTextResult = {
    taskId?: string;
    status: ToolTask["status"] | "idle";
    images: ToolTaskResultItem[];
    stale: boolean;
    drift: string;
    error?: string;
};

export function firstAiTextImage(task?: ToolTask | null): string | undefined {
    const items = task?.result?.items ?? [];
    const image = items.find((item) => item.kind === "image" && (item.dataUrl || item.url));
    return image?.dataUrl || image?.url;
}

export function aiTextResultFromTask(
    task: ToolTask | undefined,
    snapshot: AiTextSnapshot | undefined,
    current: AiTextSnapshot | undefined,
    drift = "",
): AiTextResult {
    const images = (task?.result?.items ?? []).filter((item) => item.kind === "image" && (item.dataUrl || item.url));
    const stale = Boolean(snapshot) && Boolean(current) && snapshot?.fingerprint !== current?.fingerprint;
    return {
        status: task?.status ?? "idle",
        ...(task ? { taskId: task.id } : {}),
        images,
        stale,
        drift: stale ? drift : "",
        ...(task?.error ? { error: task.error.message } : {}),
    };
}

/** 结果区空态/失败态的真实提示：成功但 0 张图 → 明确失败，不补造。 */
export function aiTextResultNotice(result: AiTextResult): string {
    if (result.status === "idle") return "尚无结果：上传素材并完成配置后提交。";
    if (result.status === "failed") return result.error ? `生成失败：${result.error}` : "生成失败：上游未返回原因。";
    if (result.status === "unknown") return "任务状态未知：请先查询，确认后再决定是否重试（避免重复扣费）。";
    if (result.status === "running" || result.status === "submitting") return "正在生成，请稍候…";
    if (result.status === "cancelled") return "任务已取消。";
    if (!result.images.length) return "上游报告完成但没有返回图片，按失败处理。";
    return "";
}
