/**
 * TASK-035：FISSION_LINK「场景裂变链接」页面契约 + 纯逻辑（无 React / 无网络）。
 *
 * 事实来源：
 *  - docs/V1.0/plan_linkfox_navigation/page-specs/28-fission-link.md（证据级别
 *    `supplemental_chunk_design`：原站没有本轮直达 URL，也没有 workspace DOM）；
 *  - docs/V1.0/plan_linkfox_navigation/task_list.md TASK-035 / TC-043 / AC-043；
 *  - registry/index.ts 的 ToolSpec（index 28 / makeType 83 / layout `scene` /
 *    adapter `image` / batchCapable=false / fields = imageUrl + outputNum）；
 *  - services/api/tools/gateway.ts 的 TOOL_ADAPTER_TABLE.FISSION_LINK
 *    （kind=image / requiresReferences=true / fields = imageUrl, outputNum）。
 *
 * 与 PRODUCT_SCENE（场景裂变）的区别（规格 §2/§7 明确要求“不混用契约”）：
 *   - PRODUCT_SCENE 有 mode / sceneKeyword / similarity / ratio / 模型选择，且这些字段
 *     来自真实 workspace DOM；本页只有「参考图片」+「裂变数量」两个字段；
 *   - 本页没有场景描述输入、没有相似度滑杆、没有模型/比例选择——这三样都不属于
 *     FISSION_LINK 的 chunk 字段，硬塞进来就是伪能力，所以这里直接不提供。
 *
 * 契约边界（不接受“演示/模拟成功”）：
 *   - outputNum 在 chunk 里只有 `integer` + 默认 1，**没有范围**。本页把“数量”实现为
 *     **本地请求扇出**：选 N 张就发 N 次真实单图请求（batchCapable=false，且 provider
 *     的 count 语义各渠道不一致），因此 N 的上限是本页的请求上限，不是对上游字段的声明；
 *   - imageUrl 的类型/大小由 provider 校验（规格 §7 原文），页面只做协议与“预览必须加载
 *     成功”的卡口，不伪造 10MB / 384–4096 这类本页没有证据的数字；
 *   - 任何失败都保留错误码与原文，绝不补造图片。
 */

import type { ToolAssetConstraints } from "@/services/api/tools/assets";
import type { ToolSpec } from "@/features/tools/types";
import { computeSnapshotHash } from "./area-repair";
import { getToolById } from "./index";

/* ------------------------------------------------------------------ *
 * 标识
 * ------------------------------------------------------------------ */

export const FISSION_LINK_TOOL_ID = "FISSION_LINK";
export const FISSION_LINK_TITLE = "场景裂变链接";
export const FISSION_LINK_SLUG = "fission-link";
export const FISSION_LINK_CATEGORY = "product-design" as const;
export const FISSION_LINK_ROUTE = "/tools/product-design/fission-link";
export const FISSION_LINK_LAYOUT = "scene" as const;
export const FISSION_LINK_MAKE_TYPE = 83;
export const FISSION_LINK_INDEX = 28;
export const FISSION_LINK_DRAFT_KEY = `tool-draft:v1:${FISSION_LINK_TOOL_ID}`;

/** registry / gateway 都只登记这两个字段；多一个就是契约漂移。 */
export const FISSION_LINK_FIELD_KEYS = ["imageUrl", "outputNum"] as const;
export type FissionLinkFieldKey = (typeof FISSION_LINK_FIELD_KEYS)[number];

/* ------------------------------------------------------------------ *
 * 输入规则
 * ------------------------------------------------------------------ */

/**
 * 参考图片的校验归属。
 *
 * 规格 §7 对 imageUrl 写的是「类型/大小由 provider 校验」，所以本页**不**声明自己的
 * 体积/分辨率上限：这些数字只有 PRODUCT_SCENE 有 DOM 证据。
 */
export const FISSION_LINK_SOURCE_RULE = {
    /** 页面负责的只有协议与可加载性。 */
    pageValidates: ["scheme", "loadable"] as const,
    /** 类型与大小交给当前模型渠道。 */
    providerValidates: ["mime", "bytes", "pixels"] as const,
    /** 规格原文：HTTPS 链接或本地资产 ID。 */
    accepted: ["https-url", "local-asset-id", "data-url", "localhost-dev-url"] as const,
    note: "参考图的类型与大小由当前模型渠道校验（规格 §7）；页面只拦非法协议与加载失败的图。",
} as const;

/**
 * 本地上传仍然要过资产库的通用图片上限（这是仓储约束，不是本页规则）。
 * 来源：services/api/tools/assets.ts 的 DEFAULT_IMAGE_CONSTRAINTS。
 */
export const FISSION_LINK_UPLOAD_CONSTRAINTS: ToolAssetConstraints = {
    kind: "image",
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
    maxBytes: 20 * 1024 * 1024,
    minBytes: 1,
};

export const FISSION_LINK_OUTPUT_MIN = 1;
/**
 * chunk 未给出 outputNum 范围；4 是本页「一次最多发起 4 个真实请求」的扇出上限。
 * provider 目录如果能给出更小的上限，用 resolveFissionLinkOutputRange 收窄。
 */
export const FISSION_LINK_OUTPUT_MAX = 4;
export const FISSION_LINK_OUTPUT_FALLBACK = 1;

export function resolveFissionLinkOutputRange(catalogMax?: number | null): { min: number; max: number } {
    const raw = typeof catalogMax === "number" && Number.isFinite(catalogMax) ? Math.floor(catalogMax) : FISSION_LINK_OUTPUT_MAX;
    const max = Math.min(FISSION_LINK_OUTPUT_MAX, Math.max(FISSION_LINK_OUTPUT_MIN, raw));
    return { min: FISSION_LINK_OUTPUT_MIN, max };
}

export function fissionLinkOutputOptions(max = FISSION_LINK_OUTPUT_MAX): number[] {
    const range = resolveFissionLinkOutputRange(max);
    return Array.from({ length: range.max - range.min + 1 }, (_, index) => range.min + index);
}

/** 把任意输入（草稿、URL 参数、输入框）收敛成合法整数；越界钳制而不是静默丢弃。 */
export function normalizeFissionLinkOutputNum(value: unknown, max = FISSION_LINK_OUTPUT_MAX): number {
    const range = resolveFissionLinkOutputRange(max);
    const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.trim()) : NaN;
    if (!Number.isFinite(numeric)) return Math.min(FISSION_LINK_OUTPUT_FALLBACK, range.max);
    const rounded = Math.round(numeric);
    return Math.min(range.max, Math.max(range.min, rounded));
}

/* ------------------------------------------------------------------ *
 * 参考图来源
 * ------------------------------------------------------------------ */

export type FissionLinkSourceKind = "remote" | "dev-remote" | "data" | "asset" | "invalid";

export type FissionLinkSourceIssue = { code: string; message: string };

export type FissionLinkSourceInspection = {
    kind: FissionLinkSourceKind;
    /** 用户原始输入（已 trim）。 */
    raw: string;
    /** 远端 URL / data URL / 资产 ID；invalid 时为空串。 */
    value: string;
    https: boolean;
    issue?: FissionLinkSourceIssue;
};

const ASSET_ID_PATTERN = /^(?:asset|storage|toolasset)[:_-][A-Za-z0-9._:-]{3,}$/i;
const DEV_URL_PATTERN = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?#]|$)/i;

/**
 * 规格 §3：粘贴合法图片链接后加载预览才可提交。
 * 这里只判断“这是什么”，是否真的能加载由 <img> 的 load/error 事件决定（见 workspace）。
 */
export function inspectFissionLinkSource(raw: string): FissionLinkSourceInspection {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) {
        return {
            kind: "invalid",
            raw: "",
            value: "",
            https: false,
            issue: { code: "source-empty", message: "请粘贴图片链接，或从本地上传一张参考图" },
        };
    }
    if (/^data:image\/(png|jpe?g|webp);base64,/i.test(trimmed)) {
        return { kind: "data", raw: trimmed, value: trimmed, https: true };
    }
    if (/^https:\/\/\S+$/i.test(trimmed)) {
        return { kind: "remote", raw: trimmed, value: trimmed, https: true };
    }
    if (DEV_URL_PATTERN.test(trimmed)) {
        // 本地开发栈（vite 代理 / localhost 资产服务）走 http，页面必须显式标注不安全协议。
        return { kind: "dev-remote", raw: trimmed, value: trimmed, https: false };
    }
    if (/^http:\/\//i.test(trimmed)) {
        return {
            kind: "invalid",
            raw: trimmed,
            value: "",
            https: false,
            issue: { code: "source-insecure", message: "只接受 HTTPS 图片链接（本地开发地址除外），请把 http:// 换成 https://" },
        };
    }
    if (ASSET_ID_PATTERN.test(trimmed)) {
        return { kind: "asset", raw: trimmed, value: trimmed, https: true };
    }
    if (/^[A-Za-z0-9][A-Za-z0-9._:-]{5,}$/.test(trimmed) && !trimmed.includes("://")) {
        return { kind: "asset", raw: trimmed, value: trimmed, https: true };
    }
    return {
        kind: "invalid",
        raw: trimmed,
        value: "",
        https: false,
        issue: { code: "source-malformed", message: "这不是可识别的图片链接或本地资产 ID，请检查后重试" },
    };
}

/** 结果失效判定用的来源身份：换图必须让旧结果变旧，而不是装作还是同一张。 */
export function fissionLinkSourceKey(inspection: FissionLinkSourceInspection): string {
    return inspection.kind === "invalid" ? "" : `${inspection.kind}:${inspection.value}`;
}

/* ------------------------------------------------------------------ *
 * 页面状态 / 快照
 * ------------------------------------------------------------------ */

export type FissionLinkState = {
    /** 绑定 `imageUrl`。 */
    imageUrl: string;
    /** 绑定 `outputNum`：本地请求扇出数量。 */
    outputNum: number;
};

export function createFissionLinkState(overrides: Partial<FissionLinkState> = {}): FissionLinkState {
    return {
        imageUrl: overrides.imageUrl ?? "",
        outputNum: normalizeFissionLinkOutputNum(overrides.outputNum ?? FISSION_LINK_OUTPUT_FALLBACK),
    };
}

export type FissionLinkSnapshot = {
    toolId: string;
    sourceKind: FissionLinkSourceKind;
    /** 提交时的参考图地址（远端 URL / data URL / 资产 ID 解析后的地址）。 */
    sourceUrl: string;
    /** 上传资产 id；纯 URL 输入为空串。 */
    sourceAssetId: string;
    sourceName: string;
    sourceWidth: number;
    sourceHeight: number;
    /** 作业级数量：等于真实请求数。 */
    outputNum: number;
    version: number;
    draftRevision: number | string | null;
    clientOperationId: string;
    model?: string;
};

export type BuildFissionLinkSnapshotInput = {
    sourceKind: FissionLinkSourceKind;
    sourceUrl: string;
    sourceAssetId?: string;
    sourceName?: string;
    sourceWidth?: number;
    sourceHeight?: number;
    outputNum: number;
    version?: number;
    draftRevision?: number | string | null;
    clientOperationId: string;
    model?: string;
};

export function buildFissionLinkSnapshot(input: BuildFissionLinkSnapshotInput): FissionLinkSnapshot {
    return {
        toolId: FISSION_LINK_TOOL_ID,
        sourceKind: input.sourceKind,
        sourceUrl: input.sourceUrl,
        sourceAssetId: input.sourceAssetId ?? "",
        sourceName: input.sourceName ?? "",
        sourceWidth: input.sourceWidth ?? 0,
        sourceHeight: input.sourceHeight ?? 0,
        outputNum: normalizeFissionLinkOutputNum(input.outputNum),
        version: input.version ?? 1,
        draftRevision: input.draftRevision ?? null,
        clientOperationId: input.clientOperationId,
        model: input.model,
    };
}

export type FissionLinkSnapshotIdentity = Pick<
    FissionLinkSnapshot,
    "sourceUrl" | "sourceAssetId" | "sourceWidth" | "sourceHeight" | "outputNum" | "version" | "model"
>;

/** 指纹只覆盖“会让结果变样”的输入；客户端操作 id / 草稿版本不参与。 */
export function fissionLinkSnapshotHash(snapshot: FissionLinkSnapshotIdentity): string {
    return computeSnapshotHash({
        toolId: FISSION_LINK_TOOL_ID,
        sourceUrl: snapshot.sourceUrl,
        sourceAssetId: snapshot.sourceAssetId,
        sourceWidth: snapshot.sourceWidth,
        sourceHeight: snapshot.sourceHeight,
        outputNum: snapshot.outputNum,
        version: snapshot.version ?? 1,
        model: snapshot.model ?? "",
    });
}

/** 规格 §5：提交后改参数，旧结果标旧、不可当新结果用。 */
export function isFissionLinkSnapshotStale(
    previous: FissionLinkSnapshotIdentity | null | undefined,
    current: FissionLinkSnapshotIdentity | null | undefined,
): boolean {
    if (!previous || !current) return false;
    return fissionLinkSnapshotHash(previous) !== fissionLinkSnapshotHash(current);
}

/* ------------------------------------------------------------------ *
 * 指令 / 字段
 * ------------------------------------------------------------------ */

/**
 * 单次真实请求的提示词。
 *
 * 商品身份（形状/材质/Logo/文字/包装）必须保持，允许变化的只有场景：背景、道具、
 * 光线、机位与氛围。这样“场景裂变”才是裂变场景而不是重新画一个商品。
 */
export function fissionLinkInstruction(snapshot: Pick<FissionLinkSnapshot, "sourceName">, index = 0, total = 1): string {
    const subject = snapshot.sourceName?.trim() ? `the product in the reference image "${snapshot.sourceName.trim()}"` : "the product in the reference image";
    const variant = total > 1 ? ` This is scene variant ${index + 1} of ${total}; make it clearly different from the other variants.` : "";
    return [
        `Keep ${subject} exactly as it is: same silhouette, same proportions, same material and surface finish, same logo, same printed text, same packaging.`,
        "Do not restyle, repaint, recolor, relabel, add or remove any part of the product. The product must stay the hero and fully visible, not cropped or occluded.",
        "Change only the surrounding scene: build a new, believable commercial or lifestyle setting with different background, props, floor/surface, light direction and camera distance appropriate to the product.",
        `The result must look like a real photograph of the same product shot in that new scene.${variant}`,
    ].join(" ");
}

/**
 * 提交给上游的字段。
 *
 * `outputNum` 在这里永远是本次请求要的图片数；本页每个 unit 只发一次单图请求，
 * 所以 adapter 传 1，作业级数量记在 snapshot.outputNum 里（= 请求数）。
 */
export function composeFissionLinkFields(input: { imageUrl: string; outputNum: number }): FissionLinkFields {
    return {
        imageUrl: input.imageUrl,
        outputNum: normalizeFissionLinkOutputNum(input.outputNum),
    };
}

export type FissionLinkFields = Record<string, string | number | boolean>;

export type FissionLinkFieldAudit = {
    missing: string[];
    unexpected: string[];
};

export function auditFissionLinkFields(fields: Record<string, unknown>): FissionLinkFieldAudit {
    const keys = Object.keys(fields).filter((key) => fields[key] !== undefined);
    const missing = FISSION_LINK_FIELD_KEYS.filter((key) => !keys.includes(key));
    const unexpected = keys.filter((key) => !(FISSION_LINK_FIELD_KEYS as readonly string[]).includes(key));
    return { missing, unexpected };
}

/* ------------------------------------------------------------------ *
 * 草稿
 * ------------------------------------------------------------------ */

export type FissionLinkDraftValues = {
    imageUrl?: string;
    outputNum?: number;
};

export function serializeFissionLinkDraft(state: FissionLinkState): FissionLinkDraftValues {
    return { imageUrl: state.imageUrl, outputNum: normalizeFissionLinkOutputNum(state.outputNum) };
}

/** 草稿只恢复“输入”，不恢复“预览已加载”：刷新后必须重新加载才能提交（规格 §5）。 */
export function parseFissionLinkDraft(values: unknown): FissionLinkState {
    const record = (values ?? {}) as Record<string, unknown>;
    return createFissionLinkState({
        imageUrl: typeof record.imageUrl === "string" ? record.imageUrl : "",
        outputNum: record.outputNum as number | undefined,
    });
}

/* ------------------------------------------------------------------ *
 * 提交校验
 * ------------------------------------------------------------------ */

export type FissionLinkPreviewState = "idle" | "loading" | "ready" | "error";

export type FissionLinkIssue = {
    code: string;
    field: "imageUrl" | "outputNum" | "executable";
    message: string;
};

export type ValidateFissionLinkSubmitInput = {
    state: FissionLinkState;
    preview: FissionLinkPreviewState;
    /** 来自 describeToolExecution(FISSION_LINK).executable。 */
    executable?: boolean;
};

export function validateFissionLinkSubmit(input: ValidateFissionLinkSubmitInput): FissionLinkIssue[] {
    const issues: FissionLinkIssue[] = [];
    if (input.executable === false) {
        issues.push({
            code: "adapter-not-executable",
            field: "executable",
            message: "当前图像渠道未就绪：请先在设置里配置可用的图像模型，再提交",
        });
    }

    const inspection = inspectFissionLinkSource(input.state.imageUrl);
    if (inspection.issue) {
        issues.push({ code: inspection.issue.code, field: "imageUrl", message: inspection.issue.message });
    } else if (input.preview === "loading") {
        issues.push({ code: "source-loading", field: "imageUrl", message: "参考图还在加载，等预览出来再提交" });
    } else if (input.preview === "error") {
        issues.push({ code: "source-unreachable", field: "imageUrl", message: "这张参考图加载失败：请确认链接可公开访问，或改为本地上传" });
    } else if (input.preview !== "ready") {
        issues.push({ code: "source-not-ready", field: "imageUrl", message: "链接还没有成功加载成预览图，不能提交" });
    }

    const range = resolveFissionLinkOutputRange();
    const outputNum = input.state.outputNum;
    if (!Number.isInteger(outputNum) || outputNum < range.min || outputNum > range.max) {
        issues.push({
            code: "outputNum-invalid",
            field: "outputNum",
            message: `裂变数量必须是 ${range.min}–${range.max} 的整数`,
        });
    }
    return issues;
}

/** 规格 §3：数量决定变体组 → 数量 = 真实请求数。 */
export function fissionLinkPlan(snapshot: Pick<FissionLinkSnapshot, "outputNum">): { requests: number; label: string } {
    const requests = normalizeFissionLinkOutputNum(snapshot.outputNum);
    return { requests, label: `将发起 ${requests} 次真实请求（每张一次）` };
}

export function fissionLinkSubmitLabel(state: FissionLinkState, pending = false): string {
    if (pending) return "生成中…";
    const count = normalizeFissionLinkOutputNum(state.outputNum);
    // 原站 CTA 形如「立即生成 (40算力)」；多张时把扇出量写进文案，避免用户误以为是打包价。
    return count > 1 ? `立即生成 ${count} 张 (40算力/张)` : "立即生成 (40算力)";
}

/* ------------------------------------------------------------------ *
 * 契约自检
 * ------------------------------------------------------------------ */

export type FissionLinkContractReport = {
    ok: boolean;
    issues: string[];
    spec?: ToolSpec;
};

/**
 * 注册表契约自检：index.ts 的 ToolSpec 一旦漂移（字段增减 / makeType / 路由 / layout /
 * batchCapable），这里有明确报错，而不是让页面静默走偏。
 */
export function checkFissionLinkContract(): FissionLinkContractReport {
    const spec = getToolById(FISSION_LINK_TOOL_ID);
    if (!spec) return { ok: false, issues: [`registry 缺少 ${FISSION_LINK_TOOL_ID}`] };

    const issues: string[] = [];
    if (spec.makeType !== FISSION_LINK_MAKE_TYPE) issues.push(`makeType=${spec.makeType}，期望 ${FISSION_LINK_MAKE_TYPE}`);
    if (spec.route !== FISSION_LINK_ROUTE) issues.push(`route=${spec.route}，期望 ${FISSION_LINK_ROUTE}`);
    if (spec.layout !== FISSION_LINK_LAYOUT) issues.push(`layout=${spec.layout}，期望 ${FISSION_LINK_LAYOUT}`);
    if (spec.adapter !== "image") issues.push(`adapter=${spec.adapter}，期望 image`);
    if (spec.category !== FISSION_LINK_CATEGORY) issues.push(`category=${spec.category}，期望 ${FISSION_LINK_CATEGORY}`);
    if (spec.batchCapable) issues.push("batchCapable 必须为 false（规格未登记本页批量能力）");
    if (spec.title !== FISSION_LINK_TITLE) issues.push(`title=${spec.title}，期望 ${FISSION_LINK_TITLE}`);

    const keys = spec.fields.map((field) => field.key);
    const expected = [...FISSION_LINK_FIELD_KEYS];
    const missing = expected.filter((key) => !keys.includes(key));
    const extra = keys.filter((key) => !expected.includes(key as FissionLinkFieldKey));
    if (missing.length) issues.push(`字段缺失：${missing.join("、")}`);
    if (extra.length) issues.push(`字段超出本页契约：${extra.join("、")}`);

    const imageField = spec.fields.find((field) => field.key === "imageUrl");
    const outputField = spec.fields.find((field) => field.key === "outputNum");
    if (!imageField?.required) issues.push("imageUrl 必须 required=true");
    if (outputField?.defaultValue !== 1) issues.push(`outputNum 默认值应为 1，实际 ${String(outputField?.defaultValue)}`);

    return { ok: issues.length === 0, issues, spec };
}

export function getFissionLinkSpec(): ToolSpec | undefined {
    return getToolById(FISSION_LINK_TOOL_ID);
}

export function fissionLinkOutputLabel(count: number): string {
    const value = normalizeFissionLinkOutputNum(count);
    return value === 1 ? "1 张（单次请求）" : `${value} 张（${value} 次请求）`;
}
