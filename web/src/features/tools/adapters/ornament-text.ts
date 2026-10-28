/**
 * TASK-030：ORNAMENT_TEXT（饰品文字）真实 provider 适配器。
 *
 * 关键事实（决定本文件为什么这样写）：
 * - 网关只把 `prompt`（+ 参考图）送给 provider，`fields` 仅参与指纹与审计
 *   （见 services/api/tools/gateway.ts ToolAdapterInput.fields 注释）。
 *   所以 5 个页面参数必须**全部写进 prompt**，否则就是静默丢参。
 * - ORNAMENT_TEXT 不要求参考图（requiresReferences=false），走文生图 generate 模式。
 * - prompt 长度与 fontname 类型在上游未取证，因此提交前显式校验，不合法直接抛错、不发请求。
 */

import type { BrowserToolInput, SubmitOptions, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";

import {
    ORNAMENT_TEXT_FONT_SIZE,
    ORNAMENT_TEXT_TEXT_LIMIT,
    ORNAMENT_TEXT_TOOL_ID,
    buildOrnamentTextPrompt,
    createOrnamentTextSnapshot,
    clampOrnamentTextFontSize,
    describeOrnamentTextDrift,
    normalizeOrnamentTextPosition,
    ornamentTextFont,
    validateOrnamentTextState,
    type OrnamentTextIssue,
    type OrnamentTextSnapshot,
    type OrnamentTextValues,
} from "@/features/tools/registry/ornament-text";

export class OrnamentTextAdapterError extends Error {
    readonly code: string;
    readonly issues: readonly OrnamentTextIssue[];

    constructor(code: string, message: string, issues: readonly OrnamentTextIssue[] = []) {
        super(message);
        this.name = "OrnamentTextAdapterError";
        this.code = code;
        this.issues = issues;
    }
}

/** 请求 id：一次逻辑操作对应一个 id，重试复用，方便日志关联。 */
export function createOrnamentTextRequestId(): string {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") return `ornament-${cryptoApi.randomUUID()}`;
    return `ornament-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ------------------------------ 请求体 ------------------------------ */

/** 与 registry/index.ts 的 page catalog 字段一一对应，不额外发明字段。 */
export function buildOrnamentTextFields(values: OrnamentTextValues): Record<string, unknown> {
    const { left, right } = normalizeOrnamentTextPosition(values.left, values.right);
    return {
        fontSize: clampOrnamentTextFontSize(values.fontSize),
        fontname: values.fontname.trim(),
        left,
        prompt: values.text.trim(),
        right,
    };
}

export function buildOrnamentTextInput(input: {
    values: OrnamentTextValues;
    model?: string;
    requestId: string;
    revision?: number | string | null;
}): BrowserToolInput {
    const { values, model, requestId } = input;
    const prompt = buildOrnamentTextPrompt(values);
    return {
        toolId: ORNAMENT_TEXT_TOOL_ID,
        prompt,
        count: 1,
        model: model?.trim() || undefined,
        references: [],
        fields: { ...buildOrnamentTextFields(values), requestId },
    };
}

/* ------------------------------ 审计 ------------------------------ */

export type OrnamentTextAudit = {
    requestId: string;
    ok: boolean;
    issues: string[];
    /** prompt 是否真的带上了每个参数（网关只送 prompt，必须在这里坐实）。 */
    promptCarries: { text: boolean; fontname: boolean; fontSize: boolean; left: boolean; right: boolean; effect: boolean };
};

/**
 * 审计请求。
 *
 * 注意：网关字段 `prompt` 是页面目录里的「饰品文字内容」（短文本，只放文字本身），
 * 真正送给 provider 的是 `input.prompt`（buildOrnamentTextPrompt 的长文案）。
 * 因此必须显式传入 providerPrompt，否则会把「文字没进 prompt」误判成「参数没进 prompt」。
 */
export function auditOrnamentTextFields(
    fields: Record<string, unknown> | undefined,
    values: OrnamentTextValues,
    requestId: string,
    providerPrompt: string,
): OrnamentTextAudit {
    const actual = fields ?? {};
    const expected = buildOrnamentTextFields(values);
    const issues: string[] = [];

    for (const [key, value] of Object.entries(expected)) {
        if (actual[key] !== value) issues.push(`字段 ${key} 期望 ${String(value)}，实际 ${String(actual[key])}`);
    }
    if (actual.requestId !== requestId) issues.push(`requestId 未写入请求（期望 ${requestId}）`);
    const extra = Object.keys(actual).filter((key) => key !== "requestId" && !(key in expected));
    if (extra.length) issues.push(`出现未声明字段：${extra.join("、")}`);

    const promptText = providerPrompt ?? "";
    const promptCarries = {
        text: Boolean(values.text.trim()) && promptText.includes(values.text.trim()),
        fontname: Boolean(values.fontname.trim()) && promptText.includes(values.fontname.trim()),
        fontSize: promptText.includes(`${clampOrnamentTextFontSize(values.fontSize)}`),
        left: promptText.includes(`${normalizeOrnamentTextPosition(values.left, values.right).left}%`),
        right: promptText.includes(`${normalizeOrnamentTextPosition(values.left, values.right).right}%`),
        effect: Boolean(values.effect.trim()) && promptText.includes(values.effect.trim()),
    };
    for (const [key, carried] of Object.entries(promptCarries)) {
        if (!carried) issues.push(`prompt 未带上 ${key} 参数`);
    }

    return { requestId, ok: issues.length === 0, issues, promptCarries };
}

/** 提交前守卫：参数非法 / 字段丢失 / prompt 漏参 / 数量不为 1，都直接抛错，绝不“假成功”。 */
export function assertOrnamentTextInput(input: BrowserToolInput, values: OrnamentTextValues, requestId: string): void {
    if (input.toolId !== ORNAMENT_TEXT_TOOL_ID) throw new OrnamentTextAdapterError("wrong-tool", `工具应为 ${ORNAMENT_TEXT_TOOL_ID}，实际 ${input.toolId}。`);
    if ((input.count ?? 1) !== 1) throw new OrnamentTextAdapterError("count-fixed", "饰品文字单次只输出 1 张，数量字段不可改写。");
    if ((input.references ?? []).length > 0) throw new OrnamentTextAdapterError("references-unsupported", "本工具不接收参考图，请勿携带参考图提交。");

    const text = values.text.trim();
    if (!text) throw new OrnamentTextAdapterError("text-required", "请先填写饰品文字内容。");
    if (text.length > ORNAMENT_TEXT_TEXT_LIMIT) throw new OrnamentTextAdapterError("text-too-long", `文字内容最多 ${ORNAMENT_TEXT_TEXT_LIMIT} 字。`);
    if (!values.fontname.trim()) throw new OrnamentTextAdapterError("font-required", "请选择或填写字体名。");
    if (!Number.isFinite(values.fontSize) || values.fontSize < ORNAMENT_TEXT_FONT_SIZE.min || values.fontSize > ORNAMENT_TEXT_FONT_SIZE.max) {
        throw new OrnamentTextAdapterError("font-size-range", `字号需在 ${ORNAMENT_TEXT_FONT_SIZE.min}–${ORNAMENT_TEXT_FONT_SIZE.max} 之间。`);
    }

    const audit = auditOrnamentTextFields(input.fields as Record<string, unknown> | undefined, values, requestId, input.prompt ?? "");
    if (!audit.ok) throw new OrnamentTextAdapterError("audit-failed", audit.issues[0] ?? "请求审计失败。");
}

/* ------------------------------ 运行 ------------------------------ */

export type OrnamentTextGatewayLike = {
    submit: (input: BrowserToolInput, options?: SubmitOptions) => Promise<ToolTask>;
    waitForResult: (taskId: string, options?: WaitOptions) => Promise<ToolTask>;
    retry?: (taskId: string, input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
};

export type RunOrnamentTextOptions = {
    gateway: OrnamentTextGatewayLike;
    values: OrnamentTextValues;
    model?: string;
    revision?: number | string | null;
    requestId?: string;
    modelReady?: boolean;
    signal?: AbortSignal;
    onUpdate?: (task: ToolTask) => void;
    wait?: WaitOptions;
};

export type OrnamentTextRun = { task: ToolTask; snapshot: OrnamentTextSnapshot; requestId: string; responseId: string };

const isTerminal = (status: ToolTask["status"]) => status === "succeeded" || status === "failed" || status === "cancelled" || status === "unknown";

/** 上游响应 id：只取任务记录里的真实值，没拿到就是空串。 */
export function ornamentTextResponseId(task?: ToolTask | null): string {
    return task?.upstreamTaskId ?? "";
}

function guardRun(options: RunOrnamentTextOptions) {
    const issues = validateOrnamentTextState({ values: options.values, modelReady: options.modelReady ?? true });
    if (issues.length) throw new OrnamentTextAdapterError("invalid-config", issues[0].message, issues);
    const requestId = options.requestId ?? createOrnamentTextRequestId();
    const input = buildOrnamentTextInput({ values: options.values, model: options.model, requestId, revision: options.revision ?? null });
    assertOrnamentTextInput(input, options.values, requestId);
    const snapshot = createOrnamentTextSnapshot(options.values, options.revision ?? null, requestId);
    return { requestId, input, snapshot };
}

export async function runOrnamentText(options: RunOrnamentTextOptions): Promise<OrnamentTextRun> {
    const { gateway, signal, onUpdate, wait } = options;
    const { requestId, input, snapshot } = guardRun(options);
    const submitted = await gateway.submit(input, { signal, draftRevision: options.revision ?? null });
    onUpdate?.(submitted);
    const final = isTerminal(submitted.status) ? submitted : await gateway.waitForResult(submitted.id, { ...wait, signal, onUpdate });
    return { task: final, snapshot, requestId, responseId: ornamentTextResponseId(final) };
}

export type RetryOrnamentTextOptions = RunOrnamentTextOptions & { taskId: string };

/** 同快照重试：重建请求并再次守卫，复用同一 requestId；是否允许重试由网关状态守卫决定。 */
export async function retryOrnamentText(options: RetryOrnamentTextOptions): Promise<OrnamentTextRun> {
    const { gateway, signal, onUpdate, wait, taskId } = options;
    if (!gateway.retry) throw new OrnamentTextAdapterError("retry-unsupported", "当前网关不支持按任务重试。");
    const { requestId, input, snapshot } = guardRun(options);
    const retried = await gateway.retry(taskId, input, { ...wait, signal, onUpdate });
    onUpdate?.(retried);
    const final = isTerminal(retried.status) ? retried : await gateway.waitForResult(retried.id, { ...wait, signal, onUpdate });
    return { task: final, snapshot, requestId, responseId: ornamentTextResponseId(final) };
}

/* ------------------------------ 结果 ------------------------------ */

export type OrnamentTextResult = {
    taskId?: string;
    status: ToolTask["status"] | "idle";
    images: ToolTaskResultItem[];
    error?: string;
    /** 结果对应快照与当前配置不一致时为 true，且 drift 指明维度。 */
    stale: boolean;
    drift: string;
    snapshot?: OrnamentTextSnapshot;
    requestId?: string;
};

export function ornamentTextResultFromTask(task: ToolTask | null | undefined, snapshot: OrnamentTextSnapshot, current: OrnamentTextSnapshot, drift?: string): OrnamentTextResult {
    const images = (task?.result?.items ?? []).filter((item) => item.kind === "image");
    return {
        taskId: task?.id,
        status: task?.status ?? "idle",
        images,
        error: task?.error?.message,
        stale: Boolean(task) && (snapshot.fingerprint !== current.fingerprint || Boolean(drift)),
        drift: drift ?? describeOrnamentTextDrift(snapshot, current),
        snapshot,
        requestId: snapshot.requestId,
    };
}

export function ornamentTextResultNotice(result: OrnamentTextResult): string {
    if (!result.taskId) return "尚无结果：填写文字内容并点击“生成饰品文字”。";
    if (result.stale) return `当前参数已变化（${result.drift || "配置"}），下方结果来自上一次快照，请重新生成后再使用。`;
    if (result.status === "failed") return result.error ? `生成失败：${result.error}` : "生成失败：上游未返回原因。";
    if (result.status === "unknown") return "任务状态未知：请先查询，确认后再决定是否重试（避免重复扣费）。";
    if (result.status === "running" || result.status === "submitting") return "正在生成，请稍候…";
    if (result.status === "cancelled") return "任务已取消。";
    if (!result.images.length) return "上游报告完成但没有返回图片，按失败处理。";
    return "";
}

/** 预览已知差异提示：字体族在上游可能被替换，界面必须说清楚。 */
export function ornamentTextPreviewNotice(values: OrnamentTextValues): string {
    const font = ornamentTextFont(values.fontname);
    return font ? `预览字族：${font.label}；上游若替换字族不会回写本地配置。` : "当前字体名不在本地预览字族内，预览回落到衬线字体，fontname 仍原样透传。";
}
