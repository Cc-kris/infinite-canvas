import type {
    CapabilityEvaluation,
    ToolCapabilityEvidence,
    ToolCapabilityKey,
    ToolCapabilityRequirement,
    ToolCapabilityState,
} from "@/components/tools/capability-notice";

import { toolSpecs } from "./registry";
import type { ToolSpec } from "./types";

/**
 * TASK-047：39 个工具 × Provider 能力矩阵 + 提交前闸门。
 *
 * 为什么要有这一层：工具表单允许填的东西（蒙版、多图、参考视频、口型、时长、分辨率、出图数量）
 * 并不是每个 Provider 通道都真的接收。旧代码的做法是“接收方静默丢弃”——用户填了、点了提交、
 * 拿到了出图，但那张图根本没用到蒙版。这就是假成功。
 *
 * 本模块做两件事，都是纯函数、无副作用、不依赖 axios/React：
 * 1. `toolCapabilityRequirements(toolId)`：从 registry 的字段定义推导“这个工具本次需要哪些能力”。
 *    required 取字段本身的 required——必填字段代表缺了就做不出来，缺证据必须拦住提交。
 * 2. `providerCapabilities(provider)`：按“传输通道”给出能力证据（supported / unsupported）。
 *    证据只来自本仓库里真实发出的请求体，全部带代码出处；查不到出处的记为 unknown
 *    （= unverified，按不支持处理），绝不默认放行。
 *
 * 判定结果直接喂给 `evaluateToolCapabilities` / `canSubmitWithCapabilities`（capability-notice.tsx），
 * UI 侧不需要再写一套判断。
 */

/* ============================ 1. 字段 → 能力 ============================ */

/** 只认这些字段名，其余字段（标题、语言、品牌词等）不参与能力判定。 */
const MASK_FIELD = /mask/i;
const MULTI_REFERENCE_FIELDS = new Set([
    "images",
    "imageList",
    "coverList",
    "refImageUrls",
    "refImageList",
    "referenceImages",
    "refImages",
    "productImages",
    "goodsImages",
    "suitImages",
    "imageUrls",
]);
const VIDEO_SOURCE_FIELDS = new Set([
    "sourceVideoUrl",
    "videoUrl",
    "refVideoUrl",
    "originalVideoUrl",
    "referenceVideo",
    "sourceVideo",
    "videoList",
    "videos",
]);
const ASPECT_FIELDS = new Set(["aspectRatio", "ratio", "videoRatio", "imageRatio", "outputRatio"]);
const DURATION_FIELDS = new Set(["duration", "videoTime", "seconds"]);
const RESOLUTION_FIELDS = new Set(["resolution", "videoResolution", "imageSize"]);
const OUTPUT_NUM_FIELDS = new Set(["outputNum", "outputNumber", "outputCount"]);
const LIP_SYNC_FIELDS = new Set(["lipSync"]);
/** 单个“参考图”字段：有的话说明这个工具吃图。 */
const SINGLE_IMAGE_FIELDS = new Set([
    "imageUrl",
    "imageSegUrl",
    "imageSplitUrl",
    "sourceImageUrl",
    "productImageUrl",
    "imageResultUrl",
]);

function fieldCapabilityKey(key: string): ToolCapabilityKey | null {
    if (MASK_FIELD.test(key)) return "mask";
    if (VIDEO_SOURCE_FIELDS.has(key)) return "referenceVideo";
    if (LIP_SYNC_FIELDS.has(key)) return "lipSync";
    if (MULTI_REFERENCE_FIELDS.has(key)) return "multiReference";
    if (ASPECT_FIELDS.has(key)) return "aspectRatio";
    if (DURATION_FIELDS.has(key)) return "duration";
    if (RESOLUTION_FIELDS.has(key)) return "resolution";
    if (OUTPUT_NUM_FIELDS.has(key)) return "outputNum";
    if (SINGLE_IMAGE_FIELDS.has(key)) return "imageEdit";
    return null;
}

/** 同一能力命中多个字段时，只要有一个必填就算必填。 */
function mergeRequirement(list: ToolCapabilityRequirement[], next: ToolCapabilityRequirement) {
    const existing = list.find((item) => item.key === next.key);
    if (!existing) {
        list.push({ ...next });
        return;
    }
    if (next.required) existing.required = true;
    if (next.note && !existing.note?.includes(next.note)) {
        existing.note = existing.note ? `${existing.note}；${next.note}` : next.note;
    }
}

/**
 * 从 registry 字段推导工具能力需求。
 * 规则：
 * - mask 一律 required:false —— 现有所有 Provider 通道都没有蒙版参数，代码是把蒙版当成
 *   第二张参考图塞进去（adapters/*.ts 的 `references: [image, mask]`），效果会变，
 *   属于必须用户确认的降级，而不是“支持蒙版”。
 * - multiReference 一律 required:false —— 只有一张参考图也能出结果，多图是增强。
 * - 其余能力跟随字段的 required。
 */
export function capabilityRequirementsForSpec(spec: ToolSpec): ToolCapabilityRequirement[] {
    const requirements: ToolCapabilityRequirement[] = [];
    let hasImageInput = false;
    let multiImageFields = 0;

    for (const field of spec.fields) {
        const key = fieldCapabilityKey(field.key);
        if (!key) continue;
        if (key === "imageEdit") hasImageInput = true;
        if (key === "multiReference") multiImageFields += 1;

        if (key === "mask") {
            mergeRequirement(requirements, {
                key,
                required: false,
                note: "通道没有蒙版参数，蒙版会作为额外参考图提交，局部效果可能不精确。",
            });
            continue;
        }
        if (key === "multiReference") {
            mergeRequirement(requirements, {
                key,
                required: false,
                note: "多图参考不可用时会只用第一张图。",
            });
            continue;
        }
        mergeRequirement(requirements, { key, required: Boolean(field.required) });
    }

    // 图片类工具本质上都是“参考图编辑/图生图”，即便字段名没进白名单也要算一条。
    if (spec.adapter === "image" || hasImageInput) {
        mergeRequirement(requirements, { key: "imageEdit", required: spec.adapter === "image" || hasImageInput });
    }
    // 视频工具里有两张以上参考图输入 → 多图参考是常态需求（但仍是可选能力）。
    if (multiImageFields >= 2) {
        mergeRequirement(requirements, { key: "multiReference", required: false, note: "多图参考不可用时会只用第一张图。" });
    }
    return requirements;
}

export function toolCapabilityRequirements(toolId: string): ToolCapabilityRequirement[] {
    const spec = toolSpecs.find((item) => item.id === toolId);
    if (!spec) throw new Error(`unknown tool: ${toolId}`);
    return capabilityRequirementsForSpec(spec);
}

/* ============================ 2. Provider 证据 ============================ */

/**
 * 传输通道描述。apiFormat 决定走哪段代码，kind 决定证据表。
 * videoTransport 只在 kind=video 时生效。
 */
export type ProviderDescriptor = {
    kind: "image" | "video";
    apiFormat: "openai" | "gemini" | "http" | "plugin" | "unknown";
    /** http 通道的能力由用户的请求体模板决定：模板里出现 {{images}} 才算真能传图。 */
    httpBodyTemplate?: string;
};

const ALL_UNKNOWN: ToolCapabilityState = "unknown";

function evidence(entries: Partial<Record<ToolCapabilityKey, ToolCapabilityState>>): ToolCapabilityEvidence {
    return entries;
}

/**
 * 证据出处（全部可在本仓库核对）：
 * - openai 图片：`image.ts#requestOpenAIImages/editImages` → POST /images/edits 追加多个 `image[]`，
 *   参数只有 model/prompt/n/size/quality/background，没有 mask → mask unsupported。
 * - gemini 图片：`image.ts#requestGeminiImagesOnce` → parts 循环塞入全部参考图，并用 count 循环发多请求
 *   → multiReference / outputNum supported；`geminiImageConfig` 用 imageConfig.aspectRatio + imageSize。
 * - openai 视频：`video.ts#createOpenAIVideoTask` → 追加 `image[]`/`video[]`/`audio[]` 全部素材，
 *   但 body 里没有 n → 一次只能出一片（outputNum unsupported）。
 * - gemini 视频：`video.ts#createGeminiVideoTask` → non-frames 模式把全部图塞进 `referenceImages`，
 *   `instance.video`/`instance.audio` 只取第 1 个；没有出片数量参数。
 * - http 视频：`video.ts#createHttpVideoTask` 的 values 只暴露 images/seconds/ratio/resolution，
 *   没有 videos/audios/lipSync → 按模板占位符判定。
 * - plugin：`video.ts#createPluginVideoTask` 把 images/videos/audios + seconds/size/resolution/ratio
 *   全量交给脚本 → 这些能力视为可用（脚本自己决定怎么用），lipSync/mask 没有对应参数。
 */
export function providerCapabilities(provider: ProviderDescriptor): ToolCapabilityEvidence {
    if (provider.apiFormat === "unknown") return evidence({});

    if (provider.apiFormat === "plugin") {
        return evidence({
            imageEdit: "supported",
            multiReference: "supported",
            referenceVideo: "supported",
            aspectRatio: "supported",
            duration: "supported",
            resolution: "supported",
            outputNum: "supported",
            mask: "unsupported",
            lipSync: "unsupported",
        });
    }

    if (provider.apiFormat === "http") {
        const template = (provider.httpBodyTemplate || "").toLowerCase();
        const has = (placeholder: string) => template.includes(`{{${placeholder.toLowerCase()}}}`);
        // 模板没写占位符 = 这个字段根本没进请求体，按不支持处理。
        return evidence({
            imageEdit: has("images") ? "supported" : "unsupported",
            multiReference: has("images") ? "supported" : "unsupported",
            referenceVideo: has("videos") ? "supported" : "unsupported",
            duration: has("seconds") || has("duration") ? "supported" : "unsupported",
            aspectRatio: has("ratio") || has("aspectratio") ? "supported" : "unsupported",
            resolution: has("resolution") ? "supported" : "unsupported",
            outputNum: has("n") || has("num") ? "supported" : "unsupported",
            lipSync: "unsupported",
            mask: "unsupported",
        });
    }

    if (provider.apiFormat === "openai") {
        if (provider.kind === "image") {
            return evidence({
                imageEdit: "supported",
                multiReference: "supported",
                aspectRatio: "supported",
                resolution: "supported",
                outputNum: "supported",
                mask: "unsupported",
                referenceVideo: "unsupported",
                lipSync: "unsupported",
                duration: "unsupported",
            });
        }
        return evidence({
            imageEdit: "supported",
            multiReference: "supported",
            referenceVideo: "supported",
            aspectRatio: "supported",
            duration: "supported",
            resolution: "supported",
            outputNum: "unsupported",
            lipSync: "unsupported",
            mask: "unsupported",
        });
    }

    // gemini
    if (provider.kind === "image") {
        return evidence({
            imageEdit: "supported",
            multiReference: "supported",
            aspectRatio: "supported",
            resolution: "supported",
            outputNum: "supported",
            mask: "unsupported",
            referenceVideo: "unsupported",
            lipSync: "unsupported",
            duration: "unsupported",
        });
    }
    return evidence({
        imageEdit: "supported",
        multiReference: "supported",
        referenceVideo: "supported",
        aspectRatio: "supported",
        duration: "supported",
        resolution: "supported",
        outputNum: "unsupported",
        lipSync: "unsupported",
        mask: "unsupported",
    });
}

/* ============================ 3. 判定与闸门 ============================ */

export type ToolCapabilityVerdict = {
    toolId: string;
    requirements: ToolCapabilityRequirement[];
    evidence: ToolCapabilityEvidence;
    evaluation: CapabilityEvaluation;
};

/** 纯判定，不做副作用：UI 用它渲染提示，提交前用它做闸门。 */
export function evaluateToolProvider(toolId: string, provider: ProviderDescriptor): ToolCapabilityVerdict {
    const requirements = toolCapabilityRequirements(toolId);
    const providerEvidence = providerCapabilities(provider);
    return {
        toolId,
        requirements,
        evidence: providerEvidence,
        evaluation: evaluateCapabilityRequirements(requirements, providerEvidence),
    };
}

/**
 * 与 capability-notice.tsx 的 evaluateToolCapabilities 同一套语义，
 * 但在这里内联一份，避免纯逻辑模块 import 到 React 组件（测试与 node 端可直接用）。
 * 语义：supported 放行；unsupported + required → blocker；unsupported + 可选 → degradation；
 * 没有证据（unknown）→ unverified，一律拦住。
 */
export function evaluateCapabilityRequirements(
    requirements: readonly ToolCapabilityRequirement[],
    evidence: ToolCapabilityEvidence,
): CapabilityEvaluation {
    const issues: CapabilityEvaluation["issues"] = [];
    const supported: ToolCapabilityKey[] = [];

    for (const requirement of requirements) {
        const state = evidence[requirement.key] ?? "unknown";
        const required = requirement.required ?? true;
        const label = requirement.label ?? requirement.key;

        if (state === "supported") {
            supported.push(requirement.key);
            continue;
        }
        const severity = state === "unknown" ? "unverified" : required ? "blocker" : "degradation";
        issues.push({
            key: requirement.key,
            label,
            state,
            severity,
            title: severity === "blocker" ? "当前模型不支持必需能力" : severity === "unverified" ? "能力未核实" : "将以降级方式执行",
            detail: requirement.note ?? "",
            required,
        });
    }

    const blockedKeys = issues.filter((issue) => issue.severity !== "degradation").map((issue) => issue.key);
    return {
        issues,
        blocked: blockedKeys.length > 0,
        blockedKeys,
        degradations: issues.filter((issue) => issue.severity === "degradation").map((issue) => issue.key),
        unverified: issues.filter((issue) => issue.severity === "unverified").map((issue) => issue.key),
        supported,
    };
}

/** 提交闸门：没有 blocker/unverified，且降级项都被用户显式接受。 */
export function canSubmitTool(toolId: string, provider: ProviderDescriptor, accepted: readonly ToolCapabilityKey[] = []): boolean {
    const { evaluation } = evaluateToolProvider(toolId, provider);
    if (evaluation.blocked) return false;
    return evaluation.degradations.every((key) => accepted.includes(key));
}

/**
 * 服务层用的硬闸门：直接抛错（UI 已被拦时不会走到这里，但批量执行/脚本入口可能绕过 UI）。
 * 错误信息里点名是哪个能力、哪个模型，避免用户对着“请求失败”猜。
 */
export class ToolCapabilityError extends Error {
    readonly toolId: string;
    readonly keys: ToolCapabilityKey[];

    constructor(toolId: string, keys: ToolCapabilityKey[], message: string) {
        super(message);
        this.name = "ToolCapabilityError";
        this.toolId = toolId;
        this.keys = keys;
    }
}

export function assertToolProvider(toolId: string, provider: ProviderDescriptor, accepted: readonly ToolCapabilityKey[] = []): void {
    const { evaluation } = evaluateToolProvider(toolId, provider);
    const blocking = evaluation.issues.filter((issue) => issue.severity !== "degradation");
    const unaccepted = evaluation.issues.filter((issue) => issue.severity === "degradation" && !accepted.includes(issue.key));
    if (!blocking.length && !unaccepted.length) return;
    const list = [...blocking, ...unaccepted];
    throw new ToolCapabilityError(
        toolId,
        list.map((issue) => issue.key),
        `${toolId} 当前模型缺少能力：${list.map((issue) => `${issue.label}(${issue.state})`).join("、")}。请改选模型或移除相关输入，不要静默忽略。`,
    );
}

/** 供测试与调试：全量工具的覆盖情况。 */
export function capabilityCoverage(): { total: number; covered: string[]; missing: string[] } {
    const covered: string[] = [];
    const missing: string[] = [];
    for (const spec of toolSpecs) {
        (capabilityRequirementsForSpec(spec).length ? covered : missing).push(spec.id);
    }
    return { total: toolSpecs.length, covered, missing };
}
