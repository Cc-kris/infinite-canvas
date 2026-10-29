/**
 * TASK-032：PRINT_EXTRACT「印花提取」页面契约 + 纯逻辑（无 React / 无网络）。
 *
 * 事实来源：
 *  - docs/V1.0/plan_linkfox_navigation/page-specs/25-print-extract.md
 *  - docs/V1.0/plan_linkfox_navigation/technical_design.md#PRINT_EXTRACT（layout extract, adapter image）
 *  - docs/V1.0/plan_linkfox_navigation/tool_specs.json `PRINT_EXTRACT`（index 25, makeType 60）
 *  - 原站 https://www.linkfox.com/draw/print-extract 的 workspace DOM 证据（page-specs §9 文案摘录）
 *
 * 字段契约只有两个：`imageUrl`（上传后的签名地址）与 `isTransparent`（显式 boolean）。
 * 本文件只做契约、校验、快照、指纹、批量条目状态与草稿编解码，不接触任何网络与像素。
 */
import { getToolById } from "./index";
import type { ToolSpec } from "../types";

export const PRINT_EXTRACT_TOOL_ID = "PRINT_EXTRACT" as const;
export const PRINT_EXTRACT_TOOL_SLUG = "print-extract" as const;
export const PRINT_EXTRACT_LAYOUT = "extract" as const;
export const PRINT_EXTRACT_ROUTE = "/tools/product-design/print-extract" as const;
export const PRINT_EXTRACT_DRAFT_KEY = `tool-draft:v1:${PRINT_EXTRACT_TOOL_ID}` as const;
export const PRINT_EXTRACT_VERSION = "v1" as const;

/** 规格 §4：只有这两个字段进 provider 请求，逐字段显式，不接受 undefined。 */
export const PRINT_EXTRACT_REQUIRED_FIELDS = ["imageUrl", "isTransparent"] as const;

/** 规格 §4：20M 以内，384*384 ~ 4096*4096，宽高比小于 5。 */
export const PRINT_EXTRACT_SOURCE_LIMITS = {
    maxBytes: 20 * 1024 * 1024,
    minSide: 384,
    maxSide: 4096,
    /** 宽高比必须严格小于 5（长边/短边）。 */
    maxAspect: 5,
    mimeTypes: ["image/png", "image/jpeg", "image/webp"] as const,
    /** 批量上限，与原站 “上传多张图片，开始批量提取” 一致。 */
    maxBatch: 20,
} as const;

/* ------------------------------------------------------------------ *
 * 类型
 * ------------------------------------------------------------------ */

export type PrintExtractIssueCode = "source-missing" | "source-too-large" | "source-type-unsupported" | "source-dimensions-invalid" | "source-too-small" | "source-too-large-dimension" | "source-aspect-invalid" | "transparent-invalid" | "url-missing";

export type PrintExtractIssue = {
    field: "imageUrl" | "isTransparent";
    code: PrintExtractIssueCode;
    message: string;
};

export type PrintExtractSourceMeta = {
    width: number;
    height: number;
    bytes: number;
    mimeType?: string;
};

/** 页面上的源图（单张 / 批量时的一张）。 */
export type PrintExtractSource = PrintExtractSourceMeta & {
    assetId: string;
    name: string;
    url: string;
};

export type PrintExtractOptions = {
    /** 生成透明图：true = 去背景输出透明 PNG；false = 保留原始背景。 */
    isTransparent: boolean;
};

/** 提交快照：与结果一一对应，用于判断结果是否“来自旧版本”。 */
export type PrintExtractSnapshot = PrintExtractOptions & {
    toolId: typeof PRINT_EXTRACT_TOOL_ID;
    sourceAssetId: string;
    sourceName: string;
    sourceUrl: string;
    width: number;
    height: number;
    version: typeof PRINT_EXTRACT_VERSION;
    clientOperationId: string;
    draftRevision: number | null;
};

export type CreatePrintExtractSnapshotInput = {
    source: PrintExtractSource;
    options: PrintExtractOptions;
    draftRevision?: number | null;
    clientOperationId?: string;
    now?: number;
};

/* ------------------------------------------------------------------ *
 * 基础计算
 * ------------------------------------------------------------------ */

let operationSeq = 0;

/** 仅在测试里用于让幂等键可复现。 */
export function resetPrintExtractOperationSeq(): void {
    operationSeq = 0;
}

/** 客户端幂等键：同一页面会话内单调递增，不依赖 crypto（离线/测试环境同样可用）。 */
export function createPrintExtractOperationId(now: number = Date.now()): string {
    operationSeq += 1;
    return `${PRINT_EXTRACT_TOOL_SLUG}-${now.toString(36)}-${operationSeq.toString(36)}`;
}

export function printExtractAspect(width: number, height: number): number {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return Number.POSITIVE_INFINITY;
    return Math.max(width, height) / Math.min(width, height);
}

/** `isTransparent` 必须是显式 boolean；缺失/异常一律归一为 false 并在校验里暴露。 */
export function normalizePrintExtractOptions(input: { isTransparent?: unknown } = {}): PrintExtractOptions {
    return { isTransparent: input.isTransparent === true };
}

/* ------------------------------------------------------------------ *
 * 校验
 * ------------------------------------------------------------------ */

function issue(field: PrintExtractIssue["field"], code: PrintExtractIssueCode, message: string): PrintExtractIssue {
    return { field, code, message };
}

/** 上传阶段校验（尺寸/体积/格式/宽高比）。 */
export function validatePrintExtractSource(meta: PrintExtractSourceMeta | null | undefined): PrintExtractIssue[] {
    if (!meta) return [issue("imageUrl", "source-missing", "请先上传需要提取印花的商品图片")];
    const issues: PrintExtractIssue[] = [];
    const { maxBytes, minSide, maxSide, maxAspect, mimeTypes } = PRINT_EXTRACT_SOURCE_LIMITS;

    if (!Number.isFinite(meta.bytes) || meta.bytes <= 0) {
        issues.push(issue("imageUrl", "source-dimensions-invalid", "无法读取图片体积，请重新上传"));
    } else if (meta.bytes > maxBytes) {
        issues.push(issue("imageUrl", "source-too-large", `图片超过 ${Math.round(maxBytes / 1024 / 1024)}M，请压缩后重试`));
    }

    if (meta.mimeType && !(mimeTypes as readonly string[]).includes(meta.mimeType)) {
        issues.push(issue("imageUrl", "source-type-unsupported", `仅支持 ${mimeTypes.map((type) => type.replace("image/", "").toUpperCase()).join(" / ")}`));
    }

    const width = meta.width;
    const height = meta.height;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        issues.push(issue("imageUrl", "source-dimensions-invalid", "图片宽高读取失败，请换一张图"));
        return issues;
    }
    if (Math.min(width, height) < minSide) {
        issues.push(issue("imageUrl", "source-too-small", `分辨率需 ≥ ${minSide} × ${minSide}，当前 ${Math.round(width)} × ${Math.round(height)}`));
    }
    if (Math.max(width, height) > maxSide) {
        issues.push(issue("imageUrl", "source-too-large-dimension", `分辨率需 ≤ ${maxSide} × ${maxSide}，当前 ${Math.round(width)} × ${Math.round(height)}`));
    }
    if (printExtractAspect(width, height) >= maxAspect) {
        issues.push(issue("imageUrl", "source-aspect-invalid", `宽高比需小于 ${maxAspect}，当前 ${printExtractAspect(width, height).toFixed(2)}`));
    }
    return issues;
}

/** 显式 boolean 校验：undefined / 字符串 / 数字都判非法，绝不隐式兜底成 false。 */
export function validatePrintExtractTransparent(value: unknown): PrintExtractIssue[] {
    if (typeof value !== "boolean") {
        return [issue("isTransparent", "transparent-invalid", "生成透明图开关必须显式取 true 或 false")];
    }
    return [];
}

/** 页面级校验（上传态 + 提交态共用）。 */
export function validatePrintExtractInput(input: { source?: PrintExtractSourceMeta | null; imageUrl?: string; isTransparent?: unknown }): PrintExtractIssue[] {
    const issues = validatePrintExtractSource(input.source ?? null);
    if (typeof input.imageUrl === "string" && !input.imageUrl.trim()) {
        issues.push(issue("imageUrl", "url-missing", "图片地址为空，请重新上传"));
    }
    issues.push(...validatePrintExtractTransparent(input.isTransparent));
    return issues;
}

export function printExtractIssuesText(issues: PrintExtractIssue[]): string {
    return issues.map((item) => item.message).join("；");
}

/* ------------------------------------------------------------------ *
 * 快照 / 指纹
 * ------------------------------------------------------------------ */

function fnv1a(value: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}

/** 决定结果的“配置指纹”：只包含会影响产物的字段（源图 + 透明度），不含提交元数据。 */
export function printExtractConfigSignature(snapshot: PrintExtractOptions & { sourceAssetId: string; width: number; height: number; version?: string }): string {
    return [snapshot.sourceAssetId, snapshot.isTransparent ? "transparent" : "opaque", `${Math.round(snapshot.width)}x${Math.round(snapshot.height)}`, snapshot.version ?? PRINT_EXTRACT_VERSION].join("|");
}

export function printExtractSnapshotHash(snapshot: PrintExtractOptions & { sourceAssetId: string; width: number; height: number; version?: string }): string {
    const signature = printExtractConfigSignature(snapshot);
    return `${fnv1a(signature)}${fnv1a([...signature].reverse().join(""))}`;
}

export function createPrintExtractSnapshot(input: CreatePrintExtractSnapshotInput): PrintExtractSnapshot {
    const options = normalizePrintExtractOptions(input.options);
    return {
        toolId: PRINT_EXTRACT_TOOL_ID,
        sourceAssetId: input.source.assetId,
        sourceName: input.source.name,
        sourceUrl: input.source.url,
        width: input.source.width,
        height: input.source.height,
        isTransparent: options.isTransparent,
        version: PRINT_EXTRACT_VERSION,
        clientOperationId: input.clientOperationId ?? createPrintExtractOperationId(input.now),
        draftRevision: input.draftRevision ?? null,
    };
}

/** 结果是否“来自旧版本”：当前配置指纹 ≠ 提交时指纹。 */
export function isPrintExtractSnapshotStale(submitted: PrintExtractSnapshot | null | undefined, current: (PrintExtractOptions & { sourceAssetId: string; width: number; height: number }) | null | undefined): boolean {
    if (!submitted || !current) return false;
    return printExtractSnapshotHash(submitted) !== printExtractSnapshotHash(current);
}

/* ------------------------------------------------------------------ *
 * 批量条目（每张图独立状态，绝不互相顶替）
 * ------------------------------------------------------------------ */

/**
 * 单张提取卡的落地状态。
 *
 * `unknown` 是必须单独存在的：上游没有回执 / 等待超预算时，任务既不是「还在跑」也不是「失败」，
 * 只能人工确认（见 task-machine 的 unknown 语义：不允许自动重提交，避免重复扣费）。
 * 曾经把 unknown 归到 running，卡片上的「提取中」会永远转下去。
 */
export type PrintExtractItemStatus = "idle" | "running" | "succeeded" | "failed" | "unknown";

export type PrintExtractItem = PrintExtractSource & {
    id: string;
    status: PrintExtractItemStatus;
    /** 上游返回的提取结果地址；只有真实返回才会被写入。 */
    resultUrl?: string;
    error?: string;
    /** 该结果对应的提交指纹。 */
    snapshotHash?: string;
    /** 结果与当前配置不一致。 */
    stale?: boolean;
};

export function createPrintExtractItem(source: PrintExtractSource): PrintExtractItem {
    return { ...source, id: source.assetId || `${source.name}@${source.url}`, status: "idle" };
}

export function createPrintExtractItems(sources: PrintExtractSource[]): PrintExtractItem[] {
    const seen = new Set<string>();
    const items: PrintExtractItem[] = [];
    for (const source of sources) {
        const item = createPrintExtractItem(source);
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
        if (items.length >= PRINT_EXTRACT_SOURCE_LIMITS.maxBatch) break;
    }
    return items;
}

export function applyPrintExtractItemResult(item: PrintExtractItem, patch: { status: PrintExtractItemStatus; resultUrl?: string; error?: string; snapshotHash?: string; stale?: boolean }): PrintExtractItem {
    return {
        ...item,
        status: patch.status,
        resultUrl: patch.resultUrl ?? (patch.status === "succeeded" ? item.resultUrl : undefined),
        error: patch.error,
        snapshotHash: patch.snapshotHash ?? item.snapshotHash,
        stale: patch.stale ?? false,
    };
}

export function summarizePrintExtractItems(items: PrintExtractItem[]): {
    total: number;
    idle: number;
    running: number;
    succeeded: number;
    failed: number;
    unknown: number;
} {
    const summary = { total: items.length, idle: 0, running: 0, succeeded: 0, failed: 0, unknown: 0 };
    for (const item of items) {
        summary[item.status] += 1;
    }
    return summary;
}

export function describePrintExtractProgress(items: PrintExtractItem[]): string {
    const summary = summarizePrintExtractItems(items);
    if (summary.total === 0) return "尚未上传商品图";
    if (summary.running > 0) return `提取中 ${summary.running}/${summary.total}`;
    if (summary.failed > 0) return `完成 ${summary.succeeded} · 失败 ${summary.failed}`;
    if (summary.unknown > 0) return `完成 ${summary.succeeded} · 结果未知 ${summary.unknown}（需人工确认）`;
    if (summary.succeeded === summary.total) return `已完成 ${summary.succeeded} 张`;
    return `待提取 ${summary.idle} 张`;
}

/* ------------------------------------------------------------------ *
 * 指令 / 字段 / 命名
 * ------------------------------------------------------------------ */

/** 交给 provider 的真实指令：只描述“提取印花”，不描述如何伪造像素。 */
export function printExtractInstruction(snapshot: PrintExtractOptions & { width: number; height: number }): string {
    const background = snapshot.isTransparent ? "Remove the product and its background entirely; keep only the printed artwork with a fully transparent background." : "Keep the printed artwork on its original neutral background; do not invent new props.";
    return [
        "Extract the printed artwork (the print/graphic) from the provided product photo.",
        `Output a single flat image of the print at ${Math.round(snapshot.width)}x${Math.round(snapshot.height)} pixels, straightened, with the original colors and no product texture, folds or shadows.`,
        background,
        "Do not add text, logos or decorative elements that are not visible in the source print.",
    ].join(" ");
}

/** 落库字段：契约两项 + 来源地址，全部显式，便于网关按字段校验。 */
export function composePrintExtractFields(snapshot: PrintExtractOptions, urls: { imageUrl: string; url?: string }): Record<string, unknown> {
    return {
        imageUrl: urls.imageUrl,
        url: urls.url ?? urls.imageUrl,
        isTransparent: snapshot.isTransparent === true,
        printExtractVersion: PRINT_EXTRACT_VERSION,
    };
}

export function printExtractDownloadName(baseName: string, index = 1): string {
    const base = (baseName || PRINT_EXTRACT_TOOL_SLUG)
        .replace(/\.[^.]+$/, "")
        .replace(/[\\/:*?"<>|]+/g, "-")
        .slice(0, 60);
    const suffix = index > 1 ? `-${index}` : "";
    return `${base || PRINT_EXTRACT_TOOL_SLUG}-print${suffix}.png`;
}

/* ------------------------------------------------------------------ *
 * 草稿（只存配置 + 资产 id，二进制不进草稿）
 * ------------------------------------------------------------------ */

export type PrintExtractOutputFormat = "png" | "jpeg";

export type PrintExtractDraftValues = {
    isTransparent: boolean;
    format: PrintExtractOutputFormat;
    batch: boolean;
    assetIds: string[];
};

export function printExtractDraftValues(input: { isTransparent: boolean; format: PrintExtractOutputFormat; batch: boolean; items: Array<{ assetId: string }> }): PrintExtractDraftValues {
    return {
        isTransparent: input.isTransparent === true,
        format: input.format === "jpeg" ? "jpeg" : "png",
        batch: input.batch === true,
        assetIds: input.items.map((item) => item.assetId).filter((id) => Boolean(id)),
    };
}

export function parsePrintExtractDraftValues(values: Record<string, unknown> | null | undefined): PrintExtractDraftValues | null {
    if (!values || typeof values !== "object") return null;
    const isTransparent = values.isTransparent;
    const format = values.format;
    const batch = values.batch;
    const assetIds = values.assetIds;
    if (typeof isTransparent !== "boolean" && typeof format !== "string" && typeof batch !== "boolean" && !Array.isArray(assetIds)) return null;
    return {
        isTransparent: isTransparent === true,
        format: format === "jpeg" ? "jpeg" : "png",
        batch: batch === true,
        assetIds: Array.isArray(assetIds) ? assetIds.filter((id): id is string => typeof id === "string" && Boolean(id)) : [],
    };
}

export function getPrintExtractSpec(): ToolSpec | undefined {
    return getToolById(PRINT_EXTRACT_TOOL_ID);
}
