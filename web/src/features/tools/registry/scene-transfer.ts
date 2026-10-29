/**
 * 场景迁移 `SCENE_TRANSFER` 的页面契约 + 纯逻辑（无 React、无网络）。
 *
 * 事实来源：
 * - docs/V1.0/plan_linkfox_navigation/page-specs/33-scene-transfer.md（证据级别
 *   `supplemental_chunk_design`：原站没有本轮直达 URL / workspace DOM）；
 * - docs/V1.0/plan_linkfox_navigation/technical_design.md TECH-T33；
 * - registry/index.ts 的 ToolSpec（index 33 / makeType 63 / layout `scene` / adapter `image`）；
 * - services/api/tools/gateway.ts 的 TOOL_ADAPTER_TABLE.SCENE_TRANSFER
 *   （kind=image / requiresReferences=true / promptRequired=true /
 *   fields = imageStyleUrl, imageUrl, segImageUrl, similarity）。
 *
 * 与 PRODUCT_SCENE（场景裂变）的区别（规格 §2 明确要求不要混用契约）：
 * - 本页没有 mode / sceneKeyword / ratio / 模型卡 / 张数选择；
 * - 本页是「商品图 + 场景风格参考图」双输入，再叠加相似度，把商品迁移进参考场景风格；
 * - 因此本模块只声明 4 个字段，多一个字段就是契约漂移（见 SCENE_TRANSFER_FIELD_KEYS）。
 *
 * 真实边界（不接受“演示成功”）：
 * - 这里只有契约与派生计算，不发请求、不造结果；一次真实执行见
 *   `@/features/tools/adapters/scene-transfer`。
 * - `similarity` 只影响场景风格的保留强度，且必须原样进入请求提示词，不允许“看不见的默认值”。
 * - `segImageUrl`（商品分割图）本地没有分割服务：只有调用方真的提供了分割图才提交，
 *   绝不拿商品原图冒充分割图（见 `resolveTransferSegmentation`）。
 * - 上游 chunk 把 segImageUrl 标为 required，这里如实保留“未提供”状态并在 UI/快照中标注，
 *   而不是编一个值让接口看起来成功。
 */

import type { ToolAssetConstraints } from "@/services/api/tools/assets";

/* ------------------------------------------------------------------ *
 * 标识
 * ------------------------------------------------------------------ */

export const SCENE_TRANSFER_TOOL_ID = "SCENE_TRANSFER";
export const SCENE_TRANSFER_TITLE = "场景迁移";
export const SCENE_TRANSFER_SLUG = "scene-transfer";
export const SCENE_TRANSFER_CATEGORY = "product-design" as const;
export const SCENE_TRANSFER_ROUTE = "/tools/product-design/scene-transfer";
export const SCENE_TRANSFER_LAYOUT = "scene" as const;
export const SCENE_TRANSFER_MAKE_TYPE = 63;
export const SCENE_TRANSFER_INDEX = 33;
export const SCENE_TRANSFER_DRAFT_KEY = `tool-draft:v1:${SCENE_TRANSFER_TOOL_ID}`;

/** registry / gateway 都只登记这四个字段；多一个就是契约漂移。 */
export const SCENE_TRANSFER_FIELD_KEYS = ["imageStyleUrl", "imageUrl", "segImageUrl", "similarity"] as const;
export type SceneTransferFieldKey = (typeof SCENE_TRANSFER_FIELD_KEYS)[number];

/* ------------------------------------------------------------------ *
 * 输入规则
 * ------------------------------------------------------------------ */

/** 场景风格相似度：0–100，步进 5；默认 70（与原站同类滑杆一致的量纲）。 */
export const SCENE_TRANSFER_SIMILARITY = { min: 0, max: 100, step: 5, defaultValue: 70 } as const;

/** 相似度档位（滑杆旁的快捷档，取值仍落在 0–100）。 */
export const SCENE_TRANSFER_SIMILARITY_PRESETS: readonly { value: number; label: string }[] = [
    { value: 30, label: "轻度" },
    { value: 55, label: "平衡" },
    { value: 80, label: "强风格" },
];

/**
 * 上传约束：格式与体积在本地做硬卡口（避免把不可解码的文件交给上游）；
 * 分辨率/宽高比由 provider 校验（规格 §7「类型/大小由 provider 校验」），
 * 这里不编造 384–4096 这类本页没有证据的数字。
 */
export const SCENE_TRANSFER_SOURCE_LIMITS: ToolAssetConstraints = {
    kind: "image",
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
    maxBytes: 10 * 1024 * 1024,
    minBytes: 1,
};

export const SCENE_TRANSFER_VALUES_SLOT = "sceneTransfer";
/** 草稿里另存一份「本次提交快照」，刷新后右栏仍能显示提交时锁定的输入，而不是空状态。 */
export const SCENE_TRANSFER_SNAPSHOT_SLOT = "sceneTransferSnapshot";

export type SceneTransferValues = {
    /** 商品图（字段 imageUrl）— 迁移主体，必须保留商品本体。 */
    imageUrl: string;
    /** 场景风格参考图（字段 imageStyleUrl）。 */
    imageStyleUrl: string;
    /** 商品分割图（字段 segImageUrl）；本地无分割服务时保持空串。 */
    segImageUrl: string;
    /** 场景风格保留强度（字段 similarity），0–100。 */
    similarity: number;
};

export const DEFAULT_SCENE_TRANSFER_VALUES: SceneTransferValues = {
    imageUrl: "",
    imageStyleUrl: "",
    segImageUrl: "",
    similarity: SCENE_TRANSFER_SIMILARITY.defaultValue,
};

export function clampSimilarity(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value);
    const fallback = SCENE_TRANSFER_SIMILARITY.defaultValue;
    if (!Number.isFinite(parsed)) return fallback;
    const clamped = Math.min(SCENE_TRANSFER_SIMILARITY.max, Math.max(SCENE_TRANSFER_SIMILARITY.min, parsed));
    const { step, min } = SCENE_TRANSFER_SIMILARITY;
    return Math.round((clamped - min) / step) * step + min;
}

/** 滑杆文案：数值 + 该档位对场景保留程度的解释（不额外发明语义）。 */
export function similarityLabel(value: number): string {
    const v = clampSimilarity(value);
    if (v <= 30) return `${v}% · 轻度保留参考场景，主要保留商品本身`;
    if (v <= 60) return `${v}% · 平衡：商品与参考场景各占一半`;
    if (v <= 85) return `${v}% · 强保留参考场景的光影与背景风格`;
    return `${v}% · 几乎完全贴合参考场景，商品细节可能被风格化`;
}

export function readSceneTransferValues(raw?: Record<string, unknown> | null): SceneTransferValues {
    const source = raw && typeof raw === "object" ? raw : {};
    const text = (key: string) => (typeof source[key] === "string" ? (source[key] as string) : "");
    return {
        imageUrl: text("imageUrl"),
        imageStyleUrl: text("imageStyleUrl"),
        segImageUrl: text("segImageUrl"),
        similarity: clampSimilarity(source.similarity ?? DEFAULT_SCENE_TRANSFER_VALUES.similarity),
    };
}

export function serializeSceneTransferValues(values: SceneTransferValues): SceneTransferValues {
    return {
        imageUrl: values.imageUrl,
        imageStyleUrl: values.imageStyleUrl,
        segImageUrl: values.segImageUrl,
        similarity: clampSimilarity(values.similarity),
    };
}

/* ------------------------------------------------------------------ *
 * 资产就绪判定
 * ------------------------------------------------------------------ */

export type SceneTransferAssetLike = {
    assetId?: string;
    name?: string;
    url?: string;
    dataUrl?: string;
    width?: number;
    height?: number;
    mimeType?: string;
    bytes?: number;
    /** 形如 `asset:<id>` 的草稿引用只有 id，刷新后需重新解析。 */
    assetRef?: string;
};

/** 有可用地址（dataUrl / https / blob / 本地资产 id）才算有输入；只有 id 时按“待解析”处理。 */
export function hasTransferSource(asset?: SceneTransferAssetLike | null): boolean {
    if (!asset) return false;
    return Boolean(asset.dataUrl || asset.url || asset.assetId || asset.assetRef);
}

/** 可以真正提交：必须有可解码的地址或已解析的本地资产。 */
export function isTransferSourceReady(asset?: SceneTransferAssetLike | null): boolean {
    if (!asset) return false;
    if (asset.dataUrl || asset.url) return true;
    return Boolean(asset.assetId) && Boolean(asset.mimeType);
}

export function describeTransferSource(asset?: SceneTransferAssetLike | null): string {
    if (!asset) return "未选择";
    const size = asset.width && asset.height ? `${asset.width}×${asset.height}` : "";
    return [asset.name, size, asset.mimeType].filter(Boolean).join(" · ") || "未选择";
}

/* ------------------------------------------------------------------ *
 * 商品分割（segImageUrl）
 * ------------------------------------------------------------------ */

export type TransferSegmentation = {
    /** 是否拿到了真实分割图。 */
    provided: boolean;
    segImageUrl?: string;
    /** 面向用户的解释；缺失时说明原因，不掩盖。 */
    message: string;
};

/**
 * 分割图不凭空生成：
 * - 调用方真的提供了分割图 → 原样返回（并进入请求字段 segImageUrl）；
 * - 没有 → provided=false，adapter 不写入 segImageUrl 字段，UI 明确提示。
 */
export function resolveTransferSegmentation(input: { segImageUrl?: string } = {}): TransferSegmentation {
    const segImageUrl = (input.segImageUrl ?? "").trim();
    if (segImageUrl) {
        return { provided: true, segImageUrl, message: "已提供商品分割图，按分割边界迁移背景" };
    }
    return {
        provided: false,
        message: "未提供商品分割图：本地没有分割服务，不会用商品原图冒充 segImageUrl",
    };
}

/* ------------------------------------------------------------------ *
 * 提示词
 * ------------------------------------------------------------------ */

/** 参考图顺序在提示词里写死，避免“哪张是商品”靠猜。 */
export function describeTransferReferences(input: { segmentation: boolean }): string[] {
    const lines = [
        "第 1 张参考图 = 商品图：保留商品本体的形态、材质、logo、纹理与颜色，不得改写商品",
        "第 2 张参考图 = 场景风格参考图：只迁移它的场景氛围、光影、背景与配色风格",
    ];
    if (input.segmentation) {
        lines.push("第 3 张参考图 = 商品分割图：商品按该分割边界保留，其余区域完全替换为参考场景");
    }
    return lines;
}

/**
 * 提示词完全由页面真实值派生：相似度数值、是否带分割图都写进文本，
 * 保证“用户看到的配置 = 实际提交的约束”。
 */
export function buildTransferPrompt(values: SceneTransferValues, segmentation: TransferSegmentation): string {
    const similarity = clampSimilarity(values.similarity);
    return [
        "把商品迁移到参考场景风格中，输出一张可直接商用的商品场景图。",
        ...describeTransferReferences({ segmentation: segmentation.provided }),
        `场景风格保留强度 similarity = ${similarity}%（0% 只借一点氛围，100% 几乎完全贴合参考场景）。`,
        segmentation.provided
            ? "按分割图边界分离商品与背景，不改变商品本体。"
            : "没有分割图时不要假设已经分割，只做整图级迁移，并保持商品边界自然。",
        "不要添加参考图里不存在的文字、水印或道具；商品保持可识别的真实外观。",
    ].join("\n");
}

/* ------------------------------------------------------------------ *
 * 校验
 * ------------------------------------------------------------------ */

export type SceneTransferIssueCode =
    | "product-missing"
    | "style-missing"
    | "similarity-invalid"
    | "model-missing"
    | "not-executable"
    | "segmentation-missing";

export type SceneTransferIssue = { code: SceneTransferIssueCode; field: string; message: string };

export type ValidateSceneTransferInput = {
    values: SceneTransferValues;
    productReady: boolean;
    styleReady: boolean;
    /** 当前是否配置了可用的图像模型（来自用户配置，不是页面自由文本）。 */
    imageModelReady: boolean;
    /** 网关能力描述；缺省视为可执行。 */
    executable?: boolean;
    /** 分割图缺失是否阻断提交。默认 false：上游字段缺失会在结果/快照中标注，不静默造假。 */
    requireSegmentation?: boolean;
    segmentation?: TransferSegmentation;
};

export function validateSceneTransferState(input: ValidateSceneTransferInput): SceneTransferIssue[] {
    const issues: SceneTransferIssue[] = [];
    if (input.executable === false) {
        issues.push({ code: "not-executable", field: "", message: "当前工具在当前部署下不可执行（网关未注册图像适配器）" });
    }
    if (!input.productReady) {
        issues.push({ code: "product-missing", field: "imageUrl", message: "请上传或选择商品图（字段 imageUrl）" });
    }
    if (!input.styleReady) {
        issues.push({ code: "style-missing", field: "imageStyleUrl", message: "请上传或选择场景风格参考图（字段 imageStyleUrl）" });
    }
    const similarity = input.values.similarity;
    if (
        !Number.isFinite(similarity) ||
        similarity < SCENE_TRANSFER_SIMILARITY.min ||
        similarity > SCENE_TRANSFER_SIMILARITY.max
    ) {
        issues.push({
            code: "similarity-invalid",
            field: "similarity",
            message: `相似度必须在 ${SCENE_TRANSFER_SIMILARITY.min}–${SCENE_TRANSFER_SIMILARITY.max} 之间`,
        });
    }
    if (!input.imageModelReady) {
        issues.push({ code: "model-missing", field: "", message: "还没有选择可用的图像模型，先在配置里选一个渠道模型" });
    }
    if (input.requireSegmentation && !(input.segmentation?.provided ?? false)) {
        issues.push({
            code: "segmentation-missing",
            field: "segImageUrl",
            message: input.segmentation?.message ?? "缺少商品分割图（字段 segImageUrl）",
        });
    }
    return issues;
}

/* ------------------------------------------------------------------ *
 * 快照
 * ------------------------------------------------------------------ */

export type SceneTransferSnapshot = {
    toolId: typeof SCENE_TRANSFER_TOOL_ID;
    revision: number | string | null;
    /** 本次提交的商品资产（用于“来自旧版本”判定）。 */
    productAssetId: string;
    styleAssetId: string;
    segAssetId: string;
    imageUrl: string;
    imageStyleUrl: string;
    segImageUrl: string;
    similarity: number;
    segmentationProvided: boolean;
    prompt: string;
    fieldKeys: readonly string[];
    capturedAt: string;
};

export type CreateSceneTransferSnapshotInput = {
    values: SceneTransferValues;
    product: SceneTransferAssetLike;
    style: SceneTransferAssetLike;
    segmentation: TransferSegmentation;
    revision?: number | string | null;
    now?: () => string;
};

export function createSceneTransferSnapshot(input: CreateSceneTransferSnapshotInput): SceneTransferSnapshot {
    const values = serializeSceneTransferValues(input.values);
    const now = input.now ?? (() => new Date().toISOString());
    return {
        toolId: SCENE_TRANSFER_TOOL_ID,
        revision: input.revision ?? null,
        productAssetId: input.product.assetId ?? "",
        styleAssetId: input.style.assetId ?? "",
        segAssetId: input.segmentation.provided ? (input.segmentation.segImageUrl ?? "") : "",
        imageUrl: values.imageUrl,
        imageStyleUrl: values.imageStyleUrl,
        segImageUrl: input.segmentation.provided ? (input.segmentation.segImageUrl ?? "") : "",
        similarity: values.similarity,
        segmentationProvided: input.segmentation.provided,
        prompt: buildTransferPrompt(values, input.segmentation),
        fieldKeys: SCENE_TRANSFER_FIELD_KEYS,
        capturedAt: now(),
    };
}

/**
 * 从草稿 slot 恢复提交快照：形状不对直接返回 undefined，
 * 不让坏数据半真半假地渲染「本次提交快照」。
 */
export function restoreSceneTransferSnapshot(raw: unknown): SceneTransferSnapshot | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const source = raw as Partial<SceneTransferSnapshot>;
    if (source.toolId !== SCENE_TRANSFER_TOOL_ID) return undefined;
    if (typeof source.capturedAt !== "string" || !source.capturedAt) return undefined;
    if (typeof source.imageUrl !== "string" || typeof source.imageStyleUrl !== "string") return undefined;
    if (typeof source.similarity !== "number" || !Number.isFinite(source.similarity)) return undefined;
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    return {
        toolId: SCENE_TRANSFER_TOOL_ID,
        revision: typeof source.revision === "number" || typeof source.revision === "string" ? source.revision : null,
        productAssetId: text(source.productAssetId),
        styleAssetId: text(source.styleAssetId),
        segAssetId: text(source.segAssetId),
        imageUrl: source.imageUrl,
        imageStyleUrl: source.imageStyleUrl,
        segImageUrl: text(source.segImageUrl),
        similarity: clampSimilarity(source.similarity),
        segmentationProvided: source.segmentationProvided === true,
        prompt: text(source.prompt),
        fieldKeys: Array.isArray(source.fieldKeys)
            ? source.fieldKeys.filter((key): key is string => typeof key === "string")
            : SCENE_TRANSFER_FIELD_KEYS,
        capturedAt: source.capturedAt,
    };
}

/** 结果是否来自旧配置：任一关键输入变了就如实说明，不能冒充当前配置的结果。 */
export function describeTransferDrift(
    snapshot?: SceneTransferSnapshot | null,
    current?: SceneTransferSnapshot | null,
): string {
    if (!snapshot || !current) return "";
    const changed: string[] = [];
    if (snapshot.imageUrl !== current.imageUrl) changed.push("商品图");
    if (snapshot.imageStyleUrl !== current.imageStyleUrl) changed.push("场景风格参考图");
    if (snapshot.segImageUrl !== current.segImageUrl) changed.push("商品分割图");
    if (snapshot.similarity !== current.similarity) changed.push(`相似度（${snapshot.similarity}% → ${current.similarity}%）`);
    if (!changed.length) return "";
    return `以下配置在上次提交后已改动：${changed.join("、")}。当前结果来自旧配置，需要重新提交。`;
}

/* ------------------------------------------------------------------ *
 * 提交摘要
 * ------------------------------------------------------------------ */

export function describeTransferPlan(values: SceneTransferValues, segmentation: TransferSegmentation): string {
    const parts = [`产物 1 张`, `相似度 ${clampSimilarity(values.similarity)}%`];
    parts.push(segmentation.provided ? "按分割边界迁移" : "整图迁移（未提供分割图）");
    return parts.join(" · ");
}
