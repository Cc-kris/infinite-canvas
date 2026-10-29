/**
 * TASK-042 / SALE_VIDEO adapter —— 把页面状态变成一次真实视频请求。
 *
 * 事实边界：
 * - 真实请求经 `useToolTaskStore.runTool` → gateway → provider；本文件不伪造成功、不写死 mock 结果。
 * - `fields` 里带齐 registry 声明的 12 个字段（便于指纹/审计），provider 只消费 `prompt + references + config`。
 * - 商品图约束与原站一致：≤9 张、≤10MB、384²–4096²、宽高比 0.4–2.5、png/jpeg/webp。
 */

import { computeVideoSize } from "@/lib/media-size";
import type { ToolAssetRecord } from "@/services/api/tools/assets";
import type { BrowserToolInput, SubmitOptions, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
import type { ReferenceImage } from "@/types/image";

import {
    SALE_VIDEO_MAX_SOURCES,
    SALE_VIDEO_PROMPT_MAX,
    SALE_VIDEO_RATIOS,
    SALE_VIDEO_SOURCE_RULE,
    SALE_VIDEO_TOOL_ID,
    buildSaleVideoHiddenPrompt,
    checkSaleVideoPrompt,
    composeSaleVideoProviderPrompt,
    createSaleVideoSnapshot,
    findSaleVideoCountry,
    findSaleVideoLanguage,
    findSaleVideoResolution,
    isSaleVideoSnapshotStale,
    type SaleVideoSnapshot,
    type SaleVideoSourceSummary,
    type SaleVideoState,
} from "@/features/tools/registry/sale-video";

export { SALE_VIDEO_TOOL_ID };

/* ============================== 错误 ============================== */

export type SaleVideoErrorCode =
    | "no-source"
    | "too-many-sources"
    | "source-too-large"
    | "source-too-small"
    | "source-ratio"
    | "source-mime"
    | "empty-file"
    | "prompt-empty"
    | "prompt-too-long"
    | "invalid-country"
    | "invalid-language"
    | "invalid-resolution"
    | "invalid-duration"
    | "invalid-ratio"
    | "model-missing"
    | "reference-unavailable";

export class SaleVideoAdapterError extends Error {
    readonly code: SaleVideoErrorCode;

    constructor(code: SaleVideoErrorCode, message: string) {
        super(message);
        this.name = "SaleVideoAdapterError";
        this.code = code;
    }
}

/* ============================== 商品图校验 ============================== */

export type SaleVideoSourceInput = {
    name?: string;
    bytes?: number;
    width?: number;
    height?: number;
    mimeType?: string;
};

export type SaleVideoSourceCheck = { ok: true } | { ok: false; code: SaleVideoErrorCode; message: string };

/** 逐文件校验：错误在控件旁展示（页面规格 §5「格式/尺寸/数量错误在控件旁说明」）。 */
export function checkSaleVideoSource(source: SaleVideoSourceInput): SaleVideoSourceCheck {
    const name = source.name || "图片";
    const mime = (source.mimeType ?? "").toLowerCase();
    if (mime && !SALE_VIDEO_SOURCE_RULE.mimeTypes.includes(mime as (typeof SALE_VIDEO_SOURCE_RULE.mimeTypes)[number])) {
        return { ok: false, code: "source-mime", message: `${name} 格式不支持：仅 png / jpeg / webp` };
    }
    if (typeof source.bytes === "number") {
        if (source.bytes <= 0) return { ok: false, code: "empty-file", message: `${name} 是空文件` };
        if (source.bytes > SALE_VIDEO_SOURCE_RULE.maxBytes) {
            return { ok: false, code: "source-too-large", message: `${name} 超过 10MB（当前 ${(source.bytes / 1024 / 1024).toFixed(1)}MB）` };
        }
    }
    const { width, height } = source;
    if (typeof width === "number" && typeof height === "number" && width > 0 && height > 0) {
        if (width < SALE_VIDEO_SOURCE_RULE.minSide || height < SALE_VIDEO_SOURCE_RULE.minSide) {
            return { ok: false, code: "source-too-small", message: `${name} 尺寸 ${width}×${height}，需要 ≥ 384×384` };
        }
        if (width > SALE_VIDEO_SOURCE_RULE.maxSide || height > SALE_VIDEO_SOURCE_RULE.maxSide) {
            return { ok: false, code: "source-too-small", message: `${name} 尺寸 ${width}×${height}，需要 ≤ 4096×4096` };
        }
        const ratio = width / height;
        if (ratio < SALE_VIDEO_SOURCE_RULE.minRatio || ratio > SALE_VIDEO_SOURCE_RULE.maxRatio) {
            return { ok: false, code: "source-ratio", message: `${name} 宽高比 ${ratio.toFixed(2)}，需在 0.4–2.5 之间` };
        }
    }
    return { ok: true };
}

/** 批量校验：返回每条可读问题，供控件旁与提交前汇总两处复用。 */
export function saleVideoSourceIssues(sources: readonly SaleVideoSourceInput[]): string[] {
    const issues: string[] = [];
    if (sources.length > SALE_VIDEO_MAX_SOURCES) issues.push(`商品图最多 ${SALE_VIDEO_MAX_SOURCES} 张，当前 ${sources.length} 张`);
    sources.forEach((source) => {
        const check = checkSaleVideoSource(source);
        if (!check.ok) issues.push(check.message);
    });
    return issues;
}

export function isSaleVideoSourceReady(record: ToolAssetRecord | null | undefined): record is ToolAssetRecord {
    if (!record) return false;
    return checkSaleVideoSource(record).ok;
}

export function saleVideoSourceSummaries(records: readonly ToolAssetRecord[]): SaleVideoSourceSummary[] {
    return records.map((record) => ({ name: record.name, width: record.width, height: record.height }));
}

/** 资产记录 → 真实参考图（dataUrl 由调用方从本地存储读出，adapter 不直接碰 IndexedDB）。 */
export function toSaleVideoReference(input: {
    id: string;
    name: string;
    dataUrl: string;
    type?: string;
    url?: string;
    storageKey?: string;
}): ReferenceImage {
    if (!input.dataUrl) throw new SaleVideoAdapterError("reference-unavailable", "商品图本地数据不可用，请重新上传");
    return {
        id: input.id,
        name: input.name,
        type: input.type || "image/png",
        dataUrl: input.dataUrl,
        url: input.url,
        storageKey: input.storageKey,
    };
}

/* ============================== 12 个字段 ============================== */

export type SaleVideoImageEntry = { id: string; name: string; url: string; width?: number; height?: number };

export type SaleVideoFieldsInput = {
    state: SaleVideoState;
    model: string;
    sources: readonly SaleVideoImageEntry[];
};

/** registry 声明的 12 个字段一次性落齐，避免「静默丢参」（TC-050 断言）。 */
export function buildSaleVideoFields(input: SaleVideoFieldsInput): Record<string, unknown> {
    const { state, model, sources } = input;
    const hiddenPrompt = buildSaleVideoHiddenPrompt({
        state,
        model,
        sources: sources.map((source) => ({ name: source.name, width: source.width, height: source.height })),
    });
    const images = sources.map((source, index) => ({
        index,
        id: source.id,
        name: source.name,
        url: source.url,
        width: source.width,
        height: source.height,
    }));
    return {
        aspectRatio: state.aspectRatio,
        hiddenPrompt,
        imageList: images,
        imageUrl: sources[0]?.url ?? "",
        isPro: state.isPro,
        language: state.language,
        prompt: state.prompt,
        resolution: state.resolution,
        saleCountry: state.saleCountry,
        videoTime: state.videoTime,
        videoType: model,
        visiblePrompt: state.prompt,
    };
}

/* ============================== 提交前断言 ============================== */

export type SaleVideoInput = {
    state: SaleVideoState;
    model: string;
    prompt: string;
    sources: readonly SaleVideoImageEntry[];
};

/** 提交前在当前页面做的同一份校验；服务端仍按 schema 再校验一次。 */
export function assertSaleVideoInput(input: SaleVideoInput): void {
    const model = input.model.trim();
    if (!model) throw new SaleVideoAdapterError("model-missing", "请先选择视频模型");
    if (!input.sources.length) throw new SaleVideoAdapterError("no-source", "请至少上传 1 张商品图");
    if (input.sources.length > SALE_VIDEO_MAX_SOURCES) {
        throw new SaleVideoAdapterError("too-many-sources", `商品图最多 ${SALE_VIDEO_MAX_SOURCES} 张`);
    }
    const prompt = checkSaleVideoPrompt(input.prompt);
    if (prompt.empty) throw new SaleVideoAdapterError("prompt-empty", "口播提示词不能为空");
    if (prompt.tooLong) throw new SaleVideoAdapterError("prompt-too-long", `口播提示词最多 ${SALE_VIDEO_PROMPT_MAX} 字`);
    if (!findSaleVideoCountry(input.state.saleCountry)) throw new SaleVideoAdapterError("invalid-country", "目标国家/地区不在可选范围");
    if (!findSaleVideoLanguage(input.state.language)) throw new SaleVideoAdapterError("invalid-language", "口播语言不在可选范围");
    if (!findSaleVideoResolution(input.state.resolution)) throw new SaleVideoAdapterError("invalid-resolution", "分辨率只能是 480P / 720P");
    if (![5, 10, 15].includes(input.state.videoTime)) throw new SaleVideoAdapterError("invalid-duration", "时长只能是 5 / 10 / 15 秒");
    if (!SALE_VIDEO_RATIOS.some((ratio) => ratio.value === input.state.aspectRatio)) {
        throw new SaleVideoAdapterError("invalid-ratio", "视频比例不在可选范围");
    }
}

/* ============================== 真实请求 ============================== */

export type SaleVideoBrowserInputArgs = SaleVideoInput & { references: readonly ReferenceImage[] };

/** 组装 gateway 入参：prompt 用「隐藏模板 + 可见脚本」，references 是真实商品图。 */
export function buildSaleVideoBrowserInput(input: SaleVideoBrowserInputArgs): BrowserToolInput {
    assertSaleVideoInput(input);
    if (input.references.length !== input.sources.length) {
        throw new SaleVideoAdapterError("reference-unavailable", "商品图与参考图数量不一致，请重新上传后重试");
    }
    const prompt = composeSaleVideoProviderPrompt({
        state: input.state,
        model: input.model,
        sources: input.sources.map((source) => ({ name: source.name, width: source.width, height: source.height })),
    });
    return {
        toolId: SALE_VIDEO_TOOL_ID,
        prompt,
        references: input.references as ReferenceImage[],
        model: input.model.trim(),
        fields: buildSaleVideoFields(input),
        /* 页内「画幅 / 时长 / 分辨率」必须真的进请求：此前只写进 prompt 文本，
         * 请求沿用了全局配置（6 秒 · 1:1），成片与页面选择不一致。 */
        videoRatio: input.state.aspectRatio,
        videoSeconds: String(input.state.videoTime),
        size: computeVideoSize(input.state.resolution, input.state.aspectRatio),
    };
}

export type SaleVideoGatewayLike = {
    run: (input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
    submit?: (input: BrowserToolInput, options?: SubmitOptions) => Promise<ToolTask>;
};

/** 真实 store 端口：动态 import，避免 adapter 顶层依赖 zustand store。 */
export async function createSaleVideoRunPort(): Promise<SaleVideoGatewayLike> {
    const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
    return {
        run: (input, options) => useToolTaskStore.getState().runTool(input, options),
        submit: (input, options) => useToolTaskStore.getState().submitTool(input, options),
    };
}

export async function runSaleVideoTask(input: {
    browserInput: BrowserToolInput;
    port: SaleVideoGatewayLike;
    draftRevision?: number | null;
    signal?: AbortSignal;
}): Promise<ToolTask> {
    return input.port.run(input.browserInput, {
        draftRevision: input.draftRevision ?? null,
        signal: input.signal,
    });
}

/** 同一快照重试：复用 clientOperationId 语义由 store 的 draftRevision/fingerprint 保证，不换输入。 */
export async function retrySaleVideoTask(input: {
    snapshot: SaleVideoSnapshot;
    browserInput: BrowserToolInput;
    port: SaleVideoGatewayLike;
    signal?: AbortSignal;
}): Promise<ToolTask> {
    return input.port.run(input.browserInput, {
        draftRevision: input.snapshot.draftRevision,
        signal: input.signal,
        dedupe: false,
    });
}

/* ============================== 结果视图 ============================== */

export type SaleVideoResultState = "empty" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";

export type SaleVideoResultView = {
    state: SaleVideoResultState;
    videos: ToolTaskResultItem[];
    message: string;
    stale: boolean;
    /** 结果来自哪次快照（用于「查看本次输入快照」）。 */
    snapshot: SaleVideoSnapshot | null;
};

export function saleVideoResultView(input: {
    task?: ToolTask | null;
    snapshot?: SaleVideoSnapshot | null;
    current?: SaleVideoSnapshot | null;
}): SaleVideoResultView {
    const task = input.task ?? null;
    const snapshot = input.snapshot ?? null;
    const stale = isSaleVideoSnapshotStale(snapshot, input.current ?? null);
    const videos = (task?.result?.items ?? []).filter((item) => item.kind === "video");
    if (!task) return { state: "empty", videos: [], message: "生成结果会出现在这里", stale: false, snapshot: null };
    switch (task.status) {
        case "submitting":
        case "running":
            return { state: "running", videos: [], message: "上游生成中，完成后自动展示", stale, snapshot };
        case "succeeded":
            return videos.length
                ? { state: "succeeded", videos, message: stale ? "结果来自旧版本配置" : "生成成功", stale, snapshot }
                : { state: "failed", videos: [], message: "任务成功但没有可播放视频", stale, snapshot };
        case "failed":
            return { state: "failed", videos: [], message: task.error?.message || "生成失败，可保留配置重试", stale, snapshot };
        case "cancelled":
            return { state: "cancelled", videos: [], message: "已取消；上游可能仍在计费", stale, snapshot };
        case "unknown":
            return { state: "unknown", videos: [], message: "状态未知：请先查询任务再决定是否重试", stale, snapshot };
        default:
            return { state: "empty", videos: [], message: "生成结果会出现在这里", stale: false, snapshot };
    }
}

export function saleVideoStatusText(state: SaleVideoResultState): string {
    switch (state) {
        case "running":
            return "生成中";
        case "succeeded":
            return "已完成";
        case "failed":
            return "失败";
        case "cancelled":
            return "已取消";
        case "unknown":
            return "状态未知";
        default:
            return "待生成";
    }
}

export { createSaleVideoSnapshot, isSaleVideoSnapshotStale };
export type { SaleVideoSnapshot };
