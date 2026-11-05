/**
 * ORNAMENT_TEXT（饰品文字）真实 provider 适配器。
 *
 * - 字段与原站提交体一致：prompt（文字内容）+ extendFields { fontname, fontSize, left, right }。
 * - 网关只把 prompt（+ 参考图）送给 provider：字体用所选字体的原站预览图（SVG 光栅化为 PNG）作参考图，
 *   挂环与字号写进 prompt。图像模型不认识字体名，没有参考图就无法贴近原站字体。
 */

import type { BrowserToolInput, SubmitOptions, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
import type { ReferenceImage } from "@/types/image";

import {
    ORNAMENT_TEXT_TOOL_ID,
    buildOrnamentTextPrompt,
    clampOrnamentTextFontSize,
    createOrnamentTextSnapshot,
    describeOrnamentTextDrift,
    ornamentTextFont,
    ornamentTextRingFlags,
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

export function createOrnamentTextRequestId(): string {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") return `ornament-${cryptoApi.randomUUID()}`;
    return `ornament-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 原站 extendFields 结构 + prompt。 */
export function buildOrnamentTextFields(values: OrnamentTextValues): Record<string, unknown> {
    return { prompt: values.text, fontname: values.fontname, fontSize: clampOrnamentTextFontSize(values.fontSize), ...ornamentTextRingFlags(values.ring) };
}

/** 把字体预览 SVG 画到白底画布上，导出 PNG 参考图（浏览器内执行）。 */
export async function ornamentFontReference(fontname: string): Promise<ReferenceImage> {
    const font = ornamentTextFont(fontname);
    if (!font) throw new OrnamentTextAdapterError("font-unknown", `未知字体：${fontname}`);
    const image = new Image();
    image.src = font.image;
    await image.decode();
    const width = 1024;
    const height = Math.round((width * (image.naturalHeight || 1)) / (image.naturalWidth || 1));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.max(256, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new OrnamentTextAdapterError("canvas-unavailable", "浏览器不支持 Canvas，无法生成字体参考图。");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, (canvas.height - height) / 2, width, height);
    return { id: `ornament-font-${font.style}`, name: `${font.style}.png`, type: "image/png", dataUrl: canvas.toDataURL("image/png") };
}

export function buildOrnamentTextInput(input: { values: OrnamentTextValues; model?: string; requestId: string; fontReference?: ReferenceImage }): BrowserToolInput {
    const { values, model, requestId, fontReference } = input;
    return {
        toolId: ORNAMENT_TEXT_TOOL_ID,
        prompt: buildOrnamentTextPrompt(values),
        count: 1,
        model: model?.trim() || undefined,
        references: fontReference ? [fontReference] : [],
        fields: { ...buildOrnamentTextFields(values), requestId },
    };
}

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
    /** 字体参考图；默认在浏览器里由字体预览光栅化，测试可注入。 */
    loadFontReference?: (fontname: string) => Promise<ReferenceImage>;
    signal?: AbortSignal;
    onUpdate?: (task: ToolTask) => void;
    wait?: WaitOptions;
};

export type OrnamentTextRun = { task: ToolTask; snapshot: OrnamentTextSnapshot; requestId: string; responseId: string };

const isTerminal = (status: ToolTask["status"]) => status === "succeeded" || status === "failed" || status === "cancelled" || status === "unknown";

export function ornamentTextResponseId(task?: ToolTask | null): string {
    return task?.upstreamTaskId ?? "";
}

async function prepare(options: RunOrnamentTextOptions) {
    const issues = validateOrnamentTextState({ values: options.values, modelReady: options.modelReady ?? true });
    if (issues.length) throw new OrnamentTextAdapterError("invalid-config", issues[0].message, issues);
    const requestId = options.requestId ?? createOrnamentTextRequestId();
    const fontReference = await (options.loadFontReference ?? ornamentFontReference)(options.values.fontname);
    const input = buildOrnamentTextInput({ values: options.values, model: options.model, requestId, fontReference });
    const snapshot = createOrnamentTextSnapshot(options.values, options.revision ?? null, requestId);
    return { requestId, input, snapshot };
}

export async function runOrnamentText(options: RunOrnamentTextOptions): Promise<OrnamentTextRun> {
    const { gateway, signal, onUpdate, wait } = options;
    const { requestId, input, snapshot } = await prepare(options);
    const submitted = await gateway.submit(input, { signal, draftRevision: options.revision ?? null });
    onUpdate?.(submitted);
    const final = isTerminal(submitted.status) ? submitted : await gateway.waitForResult(submitted.id, { ...wait, signal, onUpdate });
    return { task: final, snapshot, requestId, responseId: ornamentTextResponseId(final) };
}

export async function retryOrnamentText(options: RunOrnamentTextOptions & { taskId: string }): Promise<OrnamentTextRun> {
    const { gateway, signal, onUpdate, wait, taskId } = options;
    if (!gateway.retry) throw new OrnamentTextAdapterError("retry-unsupported", "当前网关不支持按任务重试。");
    const { requestId, input, snapshot } = await prepare(options);
    const retried = await gateway.retry(taskId, input, { ...wait, signal, onUpdate });
    onUpdate?.(retried);
    const final = isTerminal(retried.status) ? retried : await gateway.waitForResult(retried.id, { ...wait, signal, onUpdate });
    return { task: final, snapshot, requestId, responseId: ornamentTextResponseId(final) };
}

export type OrnamentTextResult = {
    taskId?: string;
    status: ToolTask["status"] | "idle";
    images: ToolTaskResultItem[];
    error?: string;
    stale: boolean;
    drift: string;
};

export function ornamentTextResultFromTask(task: ToolTask | null | undefined, snapshot: OrnamentTextValues, current: OrnamentTextValues): OrnamentTextResult {
    const drift = describeOrnamentTextDrift(snapshot, current);
    return {
        taskId: task?.id,
        status: task?.status ?? "idle",
        images: (task?.result?.items ?? []).filter((item) => item.kind === "image"),
        error: task?.error?.message,
        stale: Boolean(task) && Boolean(drift),
        drift,
    };
}
