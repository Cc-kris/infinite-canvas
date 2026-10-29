/**
 * TASK-005：39 工具的网关适配层 + 真实 Provider 执行。
 *
 * 真实边界（不接受“演示/模拟成功”）：
 * - 图片：直接调用 `services/api/image.ts` 的 `requestGeneration` / `requestEdit`；
 * - 视频：直接调用 `services/api/video.ts` 的 `createVideoGenerationTask` / `pollVideoGenerationTask`；
 * - 模型取用户当前配置（imageModel / videoModel / model），可用工具级 model 覆盖；
 * - provider 返回空数组、缺任务 id 一律判失败，绝不补造结果。
 *
 * 本文件只做“把 39 个工具的输入翻译成一次真实请求 + 驱动任务状态机”，
 * 素材上传/草稿/结果入库分别属于 TASK-004 / TASK-006 / TASK-048。
 */

import { requestEdit, requestGeneration } from "@/services/api/image";
import {
    createVideoGenerationTask,
    pollVideoGenerationTask,
    type VideoGenerationTask,
    type VideoGenerationTaskState,
} from "@/services/api/video";
import { clampVideoSeconds, computeVideoSize, parseVideoResolution } from "@/lib/media-size";
import { resolveModelChannel, useConfigStore, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

import { getTaskLease, type TaskLeasePort } from "./task-lease";
import {
    canAutoResubmit,
    computeFingerprint,
    createTaskRecord,
    DEFAULT_TASK_TIMEOUT_MS,
    isTerminalStatus,
    MISSED_HEARTBEATS_BEFORE_UNKNOWN,
    nextPollDelayMs,
    normalizePrompt,
    patchTask,
    planRecovery,
    retryBackoffMs,
    transitionTask,
    type RecoveryPlan,
    type ToolTask,
    type ToolTaskCapability,
    type ToolTaskConfigSnapshot,
    type ToolTaskResultItem,
} from "./task-machine";

export type ToolAdapterKind = "image" | "video" | "designer-host";

type ToolAdapterDefinition = {
    kind: ToolAdapterKind;
    requiresReferences: boolean;
    requiresVideo: boolean;
    /** 真实 provider 的 prompt 是必填项，所以 39 个工具都需要一个可见指令提示词。 */
    promptRequired: boolean;
    /** tool_specs.json 里该工具的字段集合（用于字段守卫和 UI 提示，不做字段级校验）。 */
    fields: readonly string[];
};

/**
 * 39 个工具的适配器声明表，来源 docs/V1.0/plan_linkfox_navigation/tool_specs.json。
 * id / kind / 必填素材由该规格推导；不是 39 份复制页面，而是 39 份可独立约束的适配器。
 */
const TOOL_ADAPTER_TABLE = {
    PRODUCT_IMAGE_SUITE: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["imageUrl", "outputNum"] },
    DRESS_WEAR_SET: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["aspectRatio", "brandDNA", "brandKey", "brandName", "coverList", "imageUrl", "images", "language", "name", "needIntelligent", "outputNum", "platform", "provider", "quality", "resolution", "salesRegion"] },
    CHANGE_COLOR_V2: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["imageName", "imageUrl"] },
    IMAGE_TRANSLATION: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["imageName", "imageSegUrl", "imageUrl", "sourceLanguage", "targetLanguage"] },
    SCALE_UP: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["enhanceFace", "enhanceQuality", "imageName", "imageOutputHeight", "imageOutputWidth", "imageUrl", "magnification"] },
    AI_OUTPAINTING: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["config", "editFlag", "height", "imageConfig", "imageExpandUrl", "imageName", "imageUrl", "maskUrl", "originImageUrl", "outputNum", "prompt", "ratio", "sizeSetHeight", "sizeSetName", "sizeSetType", "sizeSetValue", "sizeSetWidth", "stageConfig", "width"] },
    AREA_REPAIR: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["autoExpand", "imageName", "imageUrl", "maskUrl", "outputNum", "prompt"] },
    REMOVE_PEN: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["eraseImageUrl", "imageName", "imageUrl", "maskImageUrl"] },
    CHANGE_COLOR: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["adjustLight", "colorParams", "coverList", "doInpaint", "imageFormat", "imageHeight", "imageMaskUrl", "imageName", "imageSegUrl", "imageSize", "imageTagData", "imageUrl", "imageWidth", "images", "name", "sourceImageUrl"] },
    IMAGE_CROP: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["activeTab", "contentUrl", "imageCropUrl", "imageFormat", "imageHeight", "imageSize", "imageUrl", "imageWidth", "platform", "platformTitle", "ratio", "selectedMode"] },
    PRODUCT_REFINE: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["color", "imageOutputLength", "imageSegUrl", "imageUrl", "imgTransform", "isRmBg", "ratio", "realImageUrl"] },
    FIX_COLOR: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["fixColorSegUrl", "fixColorUrl", "imageName", "imageResultUrl", "imageSegUrl", "imageUrl", "version"] },
    PRINTING_REPAIR: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["config", "height", "imageResultUrl", "imageUrl", "point", "rotate", "scale", "stampingFlowerSegUrl", "stampingFlowerUrl", "targetConfig", "url", "version", "width"] },
    HAND_REPAIR: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["imageName", "imageUrl", "maskUrl", "outputNum", "personType"] },
    NEW_REPLACE_BG_V2: { kind: "image", requiresReferences: false, requiresVideo: false, promptRequired: true, fields: [] },
    REPLACE_GOODS: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["config", "cutoutProvider", "denoiseStrength", "height", "imageName", "imageOutputHeight", "imageOutputWidth", "imageUrl", "lockImageUrl", "maskUrl", "outputNum", "point", "ratio", "rotate", "scale", "sourceImageUrl", "sourceOriginUrl", "targetConfig", "targetImageUrl", "targetOriginUrl", "url", "width"] },
    PRODUCT_SCENE: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["cutoutProvider", "imageName", "imageOutputHeight", "imageOutputWidth", "imageUrl", "mode", "originImageUrl", "outputNum", "prompt", "provider", "ratio", "sceneKeyword", "segImageUrl", "sizeType", "strength"] },
    HANDHELD_GOODS: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["checkType", "imageMaskUrl", "imageResultUrl", "imageUrl", "modelId", "modelTabType", "outputNum", "sceneTabType", "targetMaskUrl", "targetOriginUrl", "targetResultUrl"] },
    AI_DRESSING_V2: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["coverList", "downImageUrl", "downMaskUrl", "downOriginUrl", "genOriRes", "images", "isSecondOperate", "modelPose", "modelPoseList", "modelType", "name", "outputNum", "provider", "suitImageUrl", "suitMaskUrl", "suitOriginUrl", "upperImageUrl", "upperMaskUrl", "upperOriginUrl", "version"] },
    AI_POSTURE: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["imageTags", "imageUrl", "outputNum", "prompt"] },
    AI_WEARABLE: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["checkType", "imageMaskUrl", "imageResultUrl", "imageUrl", "isSecondOperate", "modelId", "modelTabType", "outputNum", "productCategory", "sceneTabType", "targetMaskUrl", "targetOriginUrl", "targetResultUrl"] },
    AI_TEXT: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["aiSimpleTextPrompt", "imageUrl", "isCase", "mode", "outputNum", "prompt", "ratio", "requestId", "responseId", "styles", "stylesCn", "tilingPreset", "useAutopromptOption", "variationStrength"] },
    ORNAMENT_TEXT: { kind: "image", requiresReferences: false, requiresVideo: false, promptRequired: true, fields: ["fontSize", "fontname", "left", "prompt", "right"] },
    SDS_DESIGN: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["imageList", "imageName", "imageUrl", "materialList", "productId"] },
    PRINT_EXTRACT: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["imageUrl", "isTransparent"] },
    AI_POSE_GENERATOR: { kind: "image", requiresReferences: false, requiresVideo: false, promptRequired: true, fields: ["prompt", "scenePrompts"] },
    AI_DRESSING_XSY: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["downImageUrl", "downMaskUrl", "downOriginUrl", "modelImageUrl", "modelPose", "modelStyle", "modelType", "outputNum", "provider", "step", "suitImageUrl", "suitMaskUrl", "suitOriginUrl", "upperImageUrl", "upperMaskUrl", "upperOriginUrl", "version"] },
    FISSION_LINK: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["imageUrl", "outputNum"] },
    IMAGE_TEXT_EDIT: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["boxes", "imageFormat", "imageHeight", "imageName", "imageSize", "imageUrl", "imageWidth", "resultImageUrl"] },
    MATERIAL_UPPER_BODY: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["categoryIds", "categoryName", "imageName", "imageUrl", "isMatting", "outputNum", "subType"] },
    /** designer 宿主由 LinkFox 设计器接管，本仓库只登记能力，执行会抛 adapter-not-executable。 */
    NEW_DESIGNER: { kind: "designer-host", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["designerId", "imageUrl", "isDesignerUse", "onClose", "onDone", "open"] },
    PRODUCT_MARKET_MATERIAL: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["APlusAspectRatio", "aspectRatio", "brandDNA", "brandKey", "brandName", "coverList", "images", "isCustomAspectRatio", "language", "name", "platform", "provider", "quality", "resolution", "salesRegion"] },
    SCENE_TRANSFER: { kind: "image", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["imageStyleUrl", "imageUrl", "segImageUrl", "similarity"] },
    IMAGE_TO_VIDEO: { kind: "video", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["aspectRatio", "duration", "extension", "fileKey", "fileName", "imageInputMode", "imageList", "imageUrl", "isPro", "language", "lastFrameImageUrl", "productInfo", "productUrl", "prompt", "promptOptimizer", "referenceAudios", "referenceDocument", "referenceVideo", "saleCountry", "size", "sourceImageUrl", "templateKey", "templateName", "thumbUrl", "url", "videoTime", "videoType"] },
    SALE_VIDEO: { kind: "video", requiresReferences: true, requiresVideo: false, promptRequired: true, fields: ["aspectRatio", "hiddenPrompt", "imageList", "imageUrl", "isPro", "language", "prompt", "resolution", "saleCountry", "videoTime", "videoType", "visiblePrompt"] },
    VIDEO_REPLICATION: { kind: "video", requiresReferences: true, requiresVideo: true, promptRequired: true, fields: ["analyzeRedisKey", "aspectRatio", "clipEnd", "clipMode", "clipStart", "coverUrl", "duration", "imageSegUrl", "imageUrl", "isPro", "originalVideoId", "originalVideoUrl", "prompt", "promptOptimizer", "ratio", "refImageList", "refVideoName", "refVideoUrl", "resolution", "saleCountry", "sourceVideoDuration", "sourceVideoUrl", "targetLanguage", "videoCoverType", "videoSource", "videoTime", "videoType"] },
    AI_VIDEO_EDITING: { kind: "video", requiresReferences: true, requiresVideo: true, promptRequired: true, fields: ["duration", "outputNum", "prompt", "refImageUrls", "sourceVideoDuration", "sourceVideoUrl", "videoType"] },
    VIDEO_TRANSLATION: { kind: "video", requiresReferences: false, requiresVideo: true, promptRequired: true, fields: ["lipSync", "outputNum", "sourceLanguage", "sourceVideoName", "sourceVideoUrl", "targetLanguage", "videoType"] },
    VIDEO_CONCAT: { kind: "video", requiresReferences: true, requiresVideo: true, promptRequired: true, fields: ["editType", "imageFormat", "imageHeight", "imageSize", "imageUrl", "imageWidth", "videoCoverUrl", "videoList", "videoRatio", "videoTime"] },
} as const satisfies Record<string, ToolAdapterDefinition>;

export type ToolId = keyof typeof TOOL_ADAPTER_TABLE;

export const TOOL_IDS = Object.keys(TOOL_ADAPTER_TABLE) as ToolId[];

export type ToolAdapterInput = {
    prompt?: string;
    references?: ReferenceImage[];
    videos?: ReferenceVideo[];
    audios?: ReferenceAudio[];
    /** 工具级模型覆盖；留空则用用户配置的 imageModel / videoModel。 */
    model?: string;
    size?: string;
    quality?: string;
    count?: number;
    /** 工具独有字段（套图组合、平台、语言…）；只参与指纹与 UI 展示，不发送给 provider。 */
    fields?: Record<string, unknown>;
    /**
     * 视频请求的参数覆盖（仅视频工具用；缺省时沿用全局配置）。
     * seconds：输出秒数（整数秒字符串）；ratio：画幅（如 "16:9"），size 由 ratio + 分辨率档位推导。
     * 存在的意义：视频编辑必须跟随「截取区间 / 源视频画幅」，不能沿用全局 6 秒 · 1:1。
     */
    videoSeconds?: string;
    videoRatio?: string;
};

export type ImageInvocation = {
    kind: "image";
    mode: "generate" | "edit";
    prompt: string;
    references: ReferenceImage[];
    config: AiConfig;
};

export type VideoInvocation = {
    kind: "video";
    prompt: string;
    references: ReferenceImage[];
    videos: ReferenceVideo[];
    audios: ReferenceAudio[];
    config: AiConfig;
};

export type ProviderInvocation = ImageInvocation | VideoInvocation;

export type ToolAdapter = Readonly<{
    toolId: ToolId;
    kind: ToolAdapterKind;
    capability: ToolTaskCapability | null;
    requiresReferences: boolean;
    requiresVideo: boolean;
    promptRequired: boolean;
    fields: readonly string[];
    supportsField(field: string): boolean;
    resolveInvocation(input: ToolAdapterInput, config: AiConfig): ProviderInvocation;
}>;

export class ToolGatewayError extends Error {
    readonly code: string;
    readonly retryable: boolean;

    constructor(code: string, message: string, retryable = false) {
        super(message);
        this.name = "ToolGatewayError";
        this.code = code;
        this.retryable = retryable;
    }
}

function normalizeCount(value: unknown, fallback: string): string {
    const parsed = Math.floor(Math.abs(Number(value ?? fallback)));
    return String(Math.max(1, Math.min(15, Number.isFinite(parsed) && parsed > 0 ? parsed : 1)));
}

/** 用户配置 + 工具级覆盖 → 一次真实请求的 config。model 必须是用户配置里真实存在的模型值。 */
export function buildToolConfig(config: AiConfig, kind: ToolAdapterKind, input: ToolAdapterInput): AiConfig {
    const selected = (input.model ?? "").trim() || (kind === "video" ? config.videoModel : config.imageModel) || config.model;
    const model = (selected ?? "").trim();
    if (!model) {
        throw new ToolGatewayError(kind === "video" ? "video-model-required" : "image-model-required", "No model configured for this tool; select a provider model first.");
    }
    return {
        ...config,
        model,
        count: normalizeCount(input.count, config.count),
        ...(input.size ? { size: input.size } : {}),
        ...(input.quality ? { quality: input.quality } : {}),
        /* 视频工具的参数覆盖：seconds 直接替换；ratio 按当前分辨率档位换算成像素尺寸，
         * provider 端再把 size 反推回 ratio，两者因此始终一致。 */
        ...(input.videoSeconds && /^\d+$/.test(input.videoSeconds.trim()) ? { videoSeconds: clampVideoSeconds(input.videoSeconds) } : {}),
        ...(!input.size && input.videoRatio?.trim()
            ? { size: computeVideoSize(parseVideoResolution(config.vquality), input.videoRatio.trim()) }
            : {}),
    };
}

export function buildConfigSnapshot(config: AiConfig, capability: ToolTaskCapability): ToolTaskConfigSnapshot {
    let channelId: string | undefined;
    try {
        channelId = resolveModelChannel(config, config.model)?.id;
    } catch {
        channelId = undefined;
    }
    return {
        capability,
        model: config.model,
        apiFormat: config.apiFormat,
        size: config.size || undefined,
        quality: config.quality || undefined,
        count: config.count,
        ...(config.videoSeconds ? { videoSeconds: String(config.videoSeconds) } : {}),
        channelId,
    };
}

/** 恢复/重试时用快照里的可复现字段覆盖当前配置；凭据永远取当前用户配置。 */
export function applyConfigSnapshot(config: AiConfig, snapshot: ToolTaskConfigSnapshot): AiConfig {
    const model = (snapshot.model ?? "").trim();
    if (!model) throw new ToolGatewayError("model-missing", "Saved task has no model; re-select a model before retrying.");
    return {
        ...config,
        model,
        count: snapshot.count || config.count,
        ...(snapshot.size ? { size: snapshot.size } : {}),
        ...(snapshot.quality ? { quality: snapshot.quality } : {}),
        ...(snapshot.videoSeconds ? { videoSeconds: snapshot.videoSeconds } : {}),
    };
}

function createToolAdapter(toolId: ToolId): ToolAdapter {
    const definition = TOOL_ADAPTER_TABLE[toolId];
    const capability: ToolTaskCapability | null = definition.kind === "video" ? "video" : definition.kind === "image" ? "image" : null;
    return {
        toolId,
        kind: definition.kind,
        capability,
        requiresReferences: definition.requiresReferences,
        requiresVideo: definition.requiresVideo,
        promptRequired: definition.promptRequired,
        fields: definition.fields,
        supportsField: (field: string) => (definition.fields as readonly string[]).includes(field),
        resolveInvocation(input: ToolAdapterInput, config: AiConfig): ProviderInvocation {
            if (!capability) {
                throw new ToolGatewayError("adapter-not-executable", `${toolId} runs inside the LinkFox designer host, not in the local image/video gateway.`);
            }
            const prompt = normalizePrompt(input.prompt ?? "");
            if (definition.promptRequired && !prompt) throw new ToolGatewayError("prompt-required", "This tool needs a prompt before it can call the provider.");
            const references = input.references ?? [];
            if (definition.requiresReferences && references.length === 0) throw new ToolGatewayError("references-required", `${toolId} needs at least one source image.`);
            const videos = input.videos ?? [];
            if (definition.requiresVideo && videos.length === 0) throw new ToolGatewayError("video-required", `${toolId} needs at least one source video.`);
            const toolConfig = buildToolConfig(config, definition.kind, input);
            if (capability === "video") {
                return { kind: "video", prompt, references, videos, audios: input.audios ?? [], config: toolConfig };
            }
            return { kind: "image", mode: references.length ? "edit" : "generate", prompt, references, config: toolConfig };
        },
    };
}

/** 39 个工具的适配器注册表：调用方按 toolId 取用，未知 id 直接报错，不落默认实现。 */
export const TOOL_ADAPTERS: Record<ToolId, ToolAdapter> = Object.fromEntries(TOOL_IDS.map((toolId) => [toolId, createToolAdapter(toolId)])) as Record<ToolId, ToolAdapter>;

export function getToolAdapter(toolId: string): ToolAdapter {
    const adapter = TOOL_ADAPTERS[toolId as ToolId];
    if (!adapter) throw new ToolGatewayError("unknown-tool", `Unknown tool: ${toolId}`);
    return adapter;
}

export function resolveToolInvocation(toolId: string, input: ToolAdapterInput, config: AiConfig): ProviderInvocation {
    return getToolAdapter(toolId).resolveInvocation(input, config);
}

export type ToolExecutionDescriptor = {
    toolId: ToolId;
    kind: ToolAdapterKind;
    capability: ToolTaskCapability | null;
    executable: boolean;
    requiresReferences: boolean;
    requiresVideo: boolean;
    fields: readonly string[];
};

/** 供 ToolShell / 能力提示使用的静态能力描述（TASK-006 消费）。 */
export function describeToolExecution(toolId: string): ToolExecutionDescriptor {
    const adapter = getToolAdapter(toolId);
    return {
        toolId: adapter.toolId,
        kind: adapter.kind,
        capability: adapter.capability,
        executable: adapter.capability !== null,
        requiresReferences: adapter.requiresReferences,
        requiresVideo: adapter.requiresVideo,
        fields: adapter.fields,
    };
}

export function listToolExecutions(): ToolExecutionDescriptor[] {
    return TOOL_IDS.map((toolId) => describeToolExecution(toolId));
}

/* ============================ 错误分类 ============================ */

const TIMEOUT_PATTERNS: readonly RegExp[] = [
    /timeout/i,
    /timed out/i,
    /超时/,
    /ETIMEDOUT/,
    /ECONNABORTED/,
    /ECONNRESET/,
    /network/i,
    /网络/,
    /Failed to fetch/i,
    /Load failed/i,
    /socket hang up/i,
];

/** 明确“请求没发出去/被上游拒绝且肯定没产出”的消息特征。 */
const DEFINITIVE_PATTERNS: readonly RegExp[] = [
    /请先配置/,
    /鉴权失败/,
    /接口地址不存在/,
    /没有返回图片/,
    /未返回图片/,
    /未知格式的数据/,
    /无法识别的图片响应/,
    /格式错误/,
    /请使用其他渠道/,
    /暂不支持该模型/,
    /Gemini 拒绝了本次请求/,
    /图像尺寸|图像比例|图像宽高比|图像总像素/,
    /api ?key/i,
    /unauthorized/i,
    /forbidden/i,
    /invalid[ _-]?(request|parameter|body|json)/i,
    /not found/i,
    /no image/i,
];

/** 这些状态下“结果未知”才是合法表达。 */
const ALLOWED_UNKNOWN_FROM: ReadonlySet<string> = new Set(["submitting", "running", "unknown"]);
/** 图片单次请求的本地上限：超时就把任务收敛成可重试终态，避免永远停在「提交中」。 */
const IMAGE_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
/** 明确表示“肯定没有产出”的 HTTP 状态。 */
const DEFINITIVE_STATUS = new Set([400, 401, 403, 404, 405, 413, 415, 422]);

/** 明确表示“可再等一次”的 HTTP 状态。 */
const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 507, 509]);

export type ProviderErrorClass = {
    /** 是否值得再查询/再等待。 */
    retryable: boolean;
    /** 是否确定上游没有产生结果；false 代表“结果未知”，只能查询或人工确认。 */
    definitive: boolean;
    status?: number;
    code: string;
    message: string;
};

function readHttpStatus(error: unknown): number | undefined {
    const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
    if (typeof status === "number") return status;
    // 图片链路会把 axios 错误压成带状态码文案的 Error（如“网关错误（502）”），从这里回收状态码。
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    const matched = /[（(]\s*(\d{3})\s*[)）]/.exec(message) ?? /status\s*[:=]?\s*(\d{3})/i.exec(message);
    if (!matched) return undefined;
    const parsed = Number(matched[1]);
    return Number.isFinite(parsed) ? parsed : undefined;
}

/** 文案里明确表示“请求被拒/服务繁忙”的特征（没有状态码时兜底）。 */
const TRANSIENT_PATTERNS: readonly RegExp[] = [
    /限流/,
    /额度不足/,
    /rate ?limit/i,
    /服务繁忙/,
    /服务暂时不可用/,
    /网关错误/,
    /bad gateway/i,
    /service unavailable/i,
];

export function classifyProviderError(error: unknown): ProviderErrorClass {
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    const status = readHttpStatus(error);

    if (error instanceof ToolGatewayError) {
        return { retryable: error.retryable, definitive: true, code: error.code, message: error.message };
    }
    if (status && DEFINITIVE_STATUS.has(status)) {
        return { retryable: false, definitive: true, status, code: `http-${status}`, message };
    }
    if (status && TRANSIENT_STATUS.has(status)) {
        return { retryable: true, definitive: false, status, code: `http-${status}`, message };
    }
    if (TIMEOUT_PATTERNS.some((pattern) => pattern.test(message))) {
        return { retryable: true, definitive: false, status, code: "timeout-or-network", message };
    }
    if (TRANSIENT_PATTERNS.some((pattern) => pattern.test(message))) {
        return { retryable: true, definitive: false, status, code: "provider-busy", message };
    }
    if (status && status >= 400 && status < 500) {
        return { retryable: false, definitive: true, status, code: `http-${status}`, message };
    }
    if (DEFINITIVE_PATTERNS.some((pattern) => pattern.test(message))) {
        return { retryable: false, definitive: true, status, code: "provider-rejected", message };
    }
    // 剩余情况：请求可能已被上游受理，只是响应没拿到 → 保守判为“结果未知”。
    return { retryable: true, definitive: false, status, code: "unclassified", message };
}

/* ============================ 真实 Provider ============================ */

export type ProviderImageResult = { id: string; dataUrl: string; /** 上游同时给出的持久地址（https），有则必须落盘保留。 */ url?: string };

const REMOTE_URL_PATTERN = /^https?:\/\//i;

/**
 * 把 provider 的图片结果翻译成任务结果项。
 *
 * B7 缺陷修复：上游（cc-ai / gpt-image-2 等）返回的 `dataUrl` 往往就是 OSS `https://` 地址，
 * 并不是二进制。原来的映射只写 `dataUrl`，而 `sanitizeTaskForPersist()` 见到 `dataUrl` 就按
 * 「二进制」剥离并置 `payloadDropped: true`，于是刷新/历史回填后结果图再也下载不了、
 * 存不进资产库、发不到画布。远程地址本身可以落盘，写成 `url` 即可完整保留。
 */
export function imageResultItems(taskId: string, results: ProviderImageResult[]): ToolTaskResultItem[] {
    return results.map((item, index) => {
        const base = { id: `${taskId}-${index}`, kind: "image" as const };
        if (typeof item.dataUrl === "string" && REMOTE_URL_PATTERN.test(item.dataUrl)) {
            return { ...base, url: item.dataUrl };
        }
        // b64 渲染 + 远程地址并存时两者都留：快照只剥 dataUrl，url 让刷新后仍能重新取字节。
        if (typeof item.url === "string" && REMOTE_URL_PATTERN.test(item.url)) {
            return { ...base, dataUrl: item.dataUrl, url: item.url };
        }
        return { ...base, dataUrl: item.dataUrl };
    });
}

/** provider 端口：生产实现直连真实接口；测试只替换此端口，绝不替换业务状态机。 */
export type ProviderPort = {
    generateImage(config: AiConfig, prompt: string, signal?: AbortSignal): Promise<ProviderImageResult[]>;
    editImage(config: AiConfig, prompt: string, references: ReferenceImage[], signal?: AbortSignal): Promise<ProviderImageResult[]>;
    createVideoTask(
        config: AiConfig,
        prompt: string,
        references: ReferenceImage[],
        videos: ReferenceVideo[],
        audios: ReferenceAudio[],
        signal?: AbortSignal,
    ): Promise<VideoGenerationTask>;
    pollVideoTask(config: AiConfig, task: VideoGenerationTask, signal?: AbortSignal): Promise<VideoGenerationTaskState>;
};

export const realProviderPort: ProviderPort = {
    async generateImage(config, prompt, signal) {
        return requestGeneration(config, prompt, { signal });
    },
    async editImage(config, prompt, references, signal) {
        return requestEdit(config, prompt, references, { signal });
    },
    async createVideoTask(config, prompt, references, videos, audios, signal) {
        return createVideoGenerationTask(config, prompt, references, { videos, audios, signal });
    },
    async pollVideoTask(config, task, signal) {
        return pollVideoGenerationTask(config, task, { signal });
    },
};

/* ============================ 任务存储 ============================ */

export type ToolTaskStorePort = {
    get(taskId: string): ToolTask | undefined;
    set(task: ToolTask): void;
    remove(taskId: string): void;
    list(): ToolTask[];
    /**
     * 只读最新落盘快照（可选）。
     *
     * 跨标签竞态：标签页 B 在 hydrate 时就拿到了「提交中」的内存副本，标签页 A 之后
     * 才把真实结果写成 succeeded。B 若用陈旧内存去收敛，会把 A 的成功记录覆盖成失败。
     * 恢复前先取落盘最新版本，比内存新就以落盘为准（见 recover 里的 latestTask）。
     */
    readPersisted?(taskId: string): ToolTask | null;
};

export function createMemoryTaskStore(): ToolTaskStorePort {
    const tasks = new Map<string, ToolTask>();
    return {
        get: (taskId) => tasks.get(taskId),
        set: (task) => {
            tasks.set(task.id, task);
        },
        remove: (taskId) => {
            tasks.delete(taskId);
        },
        list: () => Array.from(tasks.values()),
    };
}

/* ============================ 网关 ============================ */

export type BrowserToolInput = ToolAdapterInput & { toolId: string };

export type SubmitOptions = {
    signal?: AbortSignal;
    /** 命中同指纹的未完成任务时直接复用，不再发起一次真实请求。 */
    dedupe?: boolean;
    draftRevision?: number | string | null;
};

export type WaitOptions = SubmitOptions & {
    pollIntervalMs?: number;
    /** 默认 30 分钟；超时后任务标 unknown，不等同于上游失败。 */
    timeoutMs?: number;
    /** 轮询次数上限，主要给测试用。 */
    maxPolls?: number;
    /** 覆盖 sleep 实现，测试里注入假时钟，业务逻辑不变。 */
    sleep?: (ms: number) => Promise<void>;
    /** 每次任务状态变化回调，供 store 同步 UI。 */
    onUpdate?: (task: ToolTask) => void;
};

export type GatewayDeps = {
    getConfig: () => AiConfig;
    provider?: ProviderPort;
    store?: ToolTaskStorePort;
    now?: () => number;
    /**
     * 跨标签任务租约。缺省用 localStorage 共享租约；显式传 null 表示不做跨标签协调
     * （纯内存场景/测试）。
     */
    lease?: TaskLeasePort | null;
};

export class ToolTaskGateway {
    private readonly getConfig: () => AiConfig;
    private readonly provider: ProviderPort;
    private readonly store: ToolTaskStorePort;
    private readonly now: () => number;
    private readonly lease: TaskLeasePort | null;

    constructor(deps: GatewayDeps) {
        this.getConfig = deps.getConfig;
        this.provider = deps.provider ?? realProviderPort;
        this.store = deps.store ?? createMemoryTaskStore();
        this.now = deps.now ?? (() => Date.now());
        this.lease = deps.lease === undefined ? getTaskLease() : deps.lease;
    }

    /* -------------------------- 跨标签租约（内部） -------------------------- */

    /** 本页开始真正推进这条任务。 */
    private claimLease(taskId: string): void {
        this.lease?.claim(taskId, this.now());
    }

    /** 任务已到终态/未知：本页不再推进，让别的标签页可以接手查询。 */
    private releaseLease(task: ToolTask): void {
        if (isTerminalStatus(task.status) || task.status === "unknown") this.lease?.release(task.id);
    }

    /** 请求在飞行中时续租约（图片请求可能几十秒，超过 TTL 就会被别的标签页误判为“没人管”）。 */
    private async whileLeased<T>(taskId: string, run: () => Promise<T>): Promise<T> {
        const lease = this.lease;
        if (!lease) return run();
        lease.claim(taskId, this.now());
        const intervalMs = Math.max(1000, Math.floor(lease.ttlMs / 3));
        const timer = setInterval(() => lease.renew(taskId, this.now()), intervalMs);
        try {
            return await run();
        } finally {
            clearInterval(timer);
        }
    }

    /** 别的标签页正在处理（租约新鲜且不属于本页）→ 本页不得改动这条任务。 */
    private heldByAnotherTab(taskId: string): boolean {
        return Boolean(this.lease?.isLiveElsewhere(taskId, this.now()));
    }

    listTasks(): ToolTask[] {
        return this.store.list();
    }

    getTask(taskId: string): ToolTask | undefined {
        return this.store.get(taskId);
    }

    clearTask(taskId: string): void {
        this.store.remove(taskId);
    }

    /**
     * 提交一次真实请求。校验失败会留下一条 failed 任务（可审计），并抛出 ToolGatewayError。
     * 图片：一次请求即结果；视频：拿到上游任务 id 后进入 running，由 poll/wait 推进。
     */
    async submit(input: BrowserToolInput, options: SubmitOptions = {}): Promise<ToolTask> {
        const adapter = getToolAdapter(input.toolId);
        if (!adapter.capability) {
            throw new ToolGatewayError("adapter-not-executable", `${input.toolId} is a designer-host tool and cannot run in the image/video gateway.`);
        }
        const capability = adapter.capability;
        const config = this.getConfig();
        const prompt = normalizePrompt(input.prompt ?? "");
        const sourceAssetIds = [...(input.references ?? []).map((item) => item.id), ...(input.videos ?? []).map((item) => item.id)];

        let invocation: ProviderInvocation;
        let snapshot: ToolTaskConfigSnapshot;
        try {
            invocation = adapter.resolveInvocation(input, config);
            snapshot = buildConfigSnapshot(invocation.config, capability);
        } catch (error) {
            const classified = classifyProviderError(error);
            const failed = this.recordFailure(
                transitionTask(
                    createTaskRecord({
                    toolId: adapter.toolId,
                    capability,
                    prompt,
                    configSnapshot: {
                        capability,
                        model: (input.model ?? "").trim() || (capability === "video" ? config.videoModel : config.imageModel) || config.model,
                        apiFormat: config.apiFormat,
                        count: config.count,
                    },
                    sourceAssetIds,
                    draftRevision: options.draftRevision ?? null,
                    at: this.now(),
                }),
                    "validating",
                    { at: this.now() },
                ),
                classified,
                { definitive: true },
            );
            this.store.set(failed);
            throw error instanceof ToolGatewayError ? error : new ToolGatewayError(classified.code, classified.message, false);
        }

        const fingerprint = computeFingerprint({
            toolId: adapter.toolId,
            prompt,
            capability,
            configSnapshot: snapshot,
            sourceAssetIds,
            fields: input.fields,
        });

        if (options.dedupe !== false) {
            const duplicate = this.store
                .list()
                .find((task) => task.fingerprint === fingerprint && !isTerminalStatus(task.status));
            if (duplicate) {
                const marked = patchTask({ ...duplicate, deduplicated: true }, {}, this.now());
                this.store.set(marked);
                return marked;
            }
        }

        const record = createTaskRecord({
            toolId: adapter.toolId,
            capability,
            prompt,
            configSnapshot: snapshot,
            sourceAssetIds,
            draftRevision: options.draftRevision ?? null,
            fingerprint,
            at: this.now(),
        });
        let task = transitionTask(record, "validating", { at: this.now() });
        task = transitionTask(task, "submitting", { at: this.now(), attempts: 1 });
        this.store.set(task);
        // 从「本页真的发出请求」这一刻起持有租约：别的标签页打开时不能把这条任务当孤儿关掉。
        this.claimLease(task.id);

        if (capability === "image") {
            const executed = await this.executeImage(task, invocation as ImageInvocation, options);
            this.releaseLease(executed);
            return executed;
        }
        const executed = await this.executeVideoCreate(task, invocation as VideoInvocation, options);
        this.releaseLease(executed);
        return executed;
    }

    /** 单步轮询：推进一次任务状态（视频）；图片没有查询接口，只能报 unknown。 */
    async poll(taskId: string, options: SubmitOptions = {}): Promise<ToolTask> {
        const task = this.requireTask(taskId);
        if (isTerminalStatus(task.status)) return task;
        if (task.capability !== "video" || !task.upstreamTaskId) {
            const unknown = transitionTask(task, "unknown", {
                at: this.now(),
                reconcileRequired: true,
                error: {
                    code: "no-query-api",
                    message: "This provider exposes no query endpoint; the submitted result cannot be reconciled automatically.",
                    retryable: true,
                },
            });
            this.store.set(unknown);
            return unknown;
        }

        const config = this.resolveTaskConfig(task);
        const upstream: VideoGenerationTask = {
            id: task.upstreamTaskId,
            provider: (task.upstreamProvider as VideoGenerationTask["provider"]) ?? "openai",
            model: task.configSnapshot.model,
        };

        try {
            const state = await this.provider.pollVideoTask(config, upstream, options.signal);
            const polledAt = this.now();
            if (state.status === "pending") {
                const next = patchTask(
                    task,
                    {
                        pollCount: task.pollCount + 1,
                        lastPolledAt: polledAt,
                        lastHeartbeatAt: polledAt,
                        transientFailures: 0,
                    },
                    polledAt,
                );
                this.store.set(next);
                return next;
            }
            if (state.status === "completed") {
                const item: ToolTaskResultItem = {
                    id: `${task.id}-0`,
                    kind: "video",
                    ...(state.result.url ? { url: state.result.url } : {}),
                    ...(state.result.mimeType ? { mimeType: state.result.mimeType } : {}),
                    ...(state.result.blob ? { blob: state.result.blob } : {}),
                };
                if (!item.url && !item.blob) {
                    const failed = this.recordFailure(task, { code: "empty-video-result", message: "Provider reported completion but returned no playable video.", retryable: true, definitive: true }, { definitive: true });
                    return failed;
                }
                const succeeded = transitionTask(task, "succeeded", {
                    at: polledAt,
                    pollCount: task.pollCount + 1,
                    lastPolledAt: polledAt,
                    lastHeartbeatAt: polledAt,
                    transientFailures: 0,
                    result: { items: [item], receivedAt: polledAt },
                    error: undefined,
                });
                this.store.set(succeeded);
                return succeeded;
            }
            const failed = this.recordFailure(
                task,
                { code: "provider-failed", message: state.error || "Provider reported the task as failed.", retryable: false, definitive: true },
                { definitive: true, at: polledAt },
            );
            return failed;
        } catch (error) {
            const classified = classifyProviderError(error);
            const polledAt = this.now();
            const failures = task.transientFailures + 1;
            if (classified.definitive) {
                return this.recordFailure(task, classified, { definitive: true, at: polledAt });
            }
            if (failures >= MISSED_HEARTBEATS_BEFORE_UNKNOWN) {
                const unknown = transitionTask(task, "unknown", {
                    at: polledAt,
                    transientFailures: failures,
                    pollCount: task.pollCount + 1,
                    lastPolledAt: polledAt,
                    reconcileRequired: true,
                    error: { code: classified.code, message: classified.message, retryable: true },
                });
                this.store.set(unknown);
                return unknown;
            }
            const next = patchTask(
                task,
                {
                    transientFailures: failures,
                    pollCount: task.pollCount + 1,
                    lastPolledAt: polledAt,
                    error: { code: classified.code, message: classified.message, retryable: true },
                },
                polledAt,
            );
            this.store.set(next);
            return next;
        }
    }

    /** 连续轮询到终态；超时→unknown（不当作失败），heartbeat 缺失 3 次→unknown。 */
    async waitForResult(taskId: string, options: WaitOptions = {}): Promise<ToolTask> {
        const current = this.latestTask(taskId);
        if (isTerminalStatus(current.status)) return current;
        // 另一个标签页正在跑这条任务：不抢租约、不重复轮询，交给它推进；本页稍后再查。
        if (this.heldByAnotherTab(taskId)) return current;
        // 等待期间持有租约：别的标签页打开时不会把这条「正在跑」的任务当成孤儿。
        this.claimLease(taskId);
        try {
            return await this.waitForResultLeased(taskId, options);
        } finally {
            this.lease?.release(taskId);
        }
    }

    private async waitForResultLeased(taskId: string, options: WaitOptions = {}): Promise<ToolTask> {
        const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
        const timeoutMs = options.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
        const startedAt = this.now();
        let task = this.requireTask(taskId);
        let polls = 0;

        while (!isTerminalStatus(task.status)) {
            if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
            if (task.status === "unknown") return task;
            if (this.now() - startedAt >= timeoutMs) {
                const expired = transitionTask(task, "unknown", {
                    at: this.now(),
                    reconcileRequired: true,
                    error: { code: "task-timeout", message: "Task exceeded the wait budget; upstream state is unknown, not failed.", retryable: true },
                });
                this.store.set(expired);
                options.onUpdate?.(expired);
                return expired;
            }
            if (options.maxPolls !== undefined && polls >= options.maxPolls) return task;

            const before = task;
            task = await this.poll(taskId, options);
            polls += 1;
            if (task !== before) options.onUpdate?.(task);
            if (isTerminalStatus(task.status) || task.status === "unknown") return task;

            const backoff = task.transientFailures > 0 ? retryBackoffMs(task.transientFailures) : nextPollDelayMs(task.pollCount);
            await sleep(Math.max(backoff, options.pollIntervalMs ?? 0));
        }
        return task;
    }

    /** 提交 + 等待到终态；图片一次请求即终态，视频走轮询。 */
    async runTool(input: BrowserToolInput, options: WaitOptions = {}): Promise<ToolTask> {
        const task = await this.submit(input, options);
        if (isTerminalStatus(task.status)) return task;
        return this.waitForResult(task.id, options);
    }

    cancel(taskId: string): ToolTask {
        const task = this.requireTask(taskId);
        if (isTerminalStatus(task.status)) return task;
        const cancelled = transitionTask(task, "cancelled", {
            at: this.now(),
            cancelledByUser: true,
            ...(task.upstreamTaskId
                ? {
                      error: {
                          code: "cancelled-by-user",
                          message: "Cancelled locally; the upstream job may still finish and bill.",
                          retryable: true,
                      },
                  }
                : {}),
        });
        this.store.set(cancelled);
        this.releaseLease(cancelled);
        return cancelled;
    }

    /**
     * 人工重试：必须重新给出输入（prompt/素材），沿用同一条任务记录并递增 attempts，
     * 绝不因为“结果未知”自动重提交。
     */
    async retry(taskId: string, input: BrowserToolInput, options: WaitOptions = {}): Promise<ToolTask> {
        const previous = this.requireTask(taskId);
        if (!isTerminalStatus(previous.status) && previous.status !== "unknown") {
            throw new ToolGatewayError("task-not-retryable", `Task ${taskId} is ${previous.status}; cancel it before retrying.`);
        }
        const adapter = getToolAdapter(input.toolId);
        if (!adapter.capability) throw new ToolGatewayError("adapter-not-executable", `${input.toolId} cannot run in the image/video gateway.`);
        const config = this.getConfig();
        const invocation = adapter.resolveInvocation(input, config);
        const snapshot = buildConfigSnapshot(invocation.config, adapter.capability);
        const prompt = normalizePrompt(input.prompt ?? "");
        const sourceAssetIds = [...(input.references ?? []).map((item) => item.id), ...(input.videos ?? []).map((item) => item.id)];

        let task = transitionTask(
            {
                ...previous,
                status: "draft",
                prompt,
                configSnapshot: snapshot,
                sourceAssetIds,
                fingerprint: computeFingerprint({ toolId: adapter.toolId, prompt, capability: adapter.capability, configSnapshot: snapshot, sourceAssetIds, fields: input.fields }),
                error: undefined,
                result: undefined,
                upstreamTaskId: undefined,
                upstreamProvider: undefined,
                reconcileRequired: undefined,
                finishedAt: undefined,
                pollCount: 0,
                transientFailures: 0,
                cancelledByUser: undefined,
            },
            "validating",
            { at: this.now() },
        );
        task = transitionTask(task, "submitting", { at: this.now(), attempts: previous.attempts + 1 });
        this.store.set(task);

        const executed = adapter.capability === "image" ? await this.executeImage(task, invocation as ImageInvocation, options) : await this.executeVideoCreate(task, invocation as VideoInvocation, options);
        if (isTerminalStatus(executed.status)) return executed;
        return this.waitForResult(executed.id, options);
    }

    /**
     * 刷新页面后恢复：只查询/等待，不自动重提交；需要人工确认的返回计划本身。
     *
     * 跨标签约定：另一个标签页仍在推进这条任务（租约新鲜）时，本页只读不改，
     * 避免把别人真实的 in-flight 提交误关成 submit-unconfirmed。
     */
    async recover(taskId: string, options: WaitOptions = {}): Promise<{ plan: RecoveryPlan; task: ToolTask }> {
        const task = this.latestTask(taskId);
        const now = this.now();
        if (!isTerminalStatus(task.status) && this.heldByAnotherTab(task.id)) {
            return {
                plan: { action: "wait", reason: "active-in-other-tab", requiresServerLookup: false, autoResubmit: false },
                task,
            };
        }
        const plan = planRecovery(task, now, options.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS);
        if (plan.action === "poll") {
            this.claimLease(task.id);
            const polled = await this.poll(taskId, options);
            this.releaseLease(polled);
            return { plan, task: polled };
        }
        // 已终态 / 还没提交（draft、validating）：没有可恢复的动作，原样返回。
        if (plan.action === "none") return { plan, task };
        /**
         * 刷新/重开页面时，本页发起的 HTTP 请求已经不存在了：
         * - 有 upstreamTaskId → 上面走 poll，真的去查上游；
         * - 没有 upstreamTaskId（计划是 wait / reconcile）→ 这个任务再也不会自己推进。
         * 旧行为把它写成 unknown 后就没下文了，历史里永远「提交中」/「结果未知」。
         * 现在收敛成终态 failed + reconcileRequired：不自动重提交，但用户能看见、能手动重试，
         * 且明确提示「上游可能已受理，重试前先确认」。
         */
        if (!task.upstreamTaskId) {
            const closed = this.closeUnconfirmed(
                task,
                "submit-unconfirmed",
                "页面刷新中断了这次请求，本服务无法反查上游是否已受理。已关闭为失败；重试前请先到服务商后台确认，避免重复计费。",
            );
            return { plan, task: closed };
        }
        if (plan.action === "reconcile") {
            const unknown = transitionTask(task, "unknown", {
                at: this.now(),
                reconcileRequired: true,
                ...(task.error ? {} : { error: { code: plan.reason, message: "Upstream acceptance could not be verified after reload.", retryable: true } }),
            });
            this.store.set(unknown);
            return { plan, task: unknown };
        }
        return { plan, task };
    }

    /**
     * 无法确认上游是否受理（刷新中断 / 本地请求超时）：收敛到终态 failed。
     * 不自动重提交（canAutoResubmit 仍是 false），只是把「无法收敛的非终态」变成
     * 「用户可见、可手动重试的终态」，由人决定是否重试。
     */
    private closeUnconfirmed(task: ToolTask, code: string, message: string): ToolTask {
        const at = this.now();
        const next = transitionTask(task, "failed", {
            at,
            reconcileRequired: true,
            error: { code, message, retryable: true },
        });
        this.store.set(next);
        return next;
    }

    /** 恢复所有未完结任务（页面初始化时调用）。 */
    async recoverAll(options: WaitOptions = {}): Promise<Array<{ plan: RecoveryPlan; task: ToolTask }>> {
        const pending = this.store.list().filter((task) => !isTerminalStatus(task.status));
        const results: Array<{ plan: RecoveryPlan; task: ToolTask }> = [];
        for (const task of pending) {
            results.push(await this.recover(task.id, options));
        }
        return results;
    }

    /* ---------------------------- 内部执行 ---------------------------- */

    private async executeImage(task: ToolTask, invocation: ImageInvocation, options: SubmitOptions): Promise<ToolTask> {
        /**
         * 图片是一次性 HTTP 请求：没有本地超时的话，代理/上游挂住会让任务永远停在「提交中」，
         * 刷新后也没有 upstreamTaskId 可查。加一个上限，超时收敛为可重试的终态。
         */
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), IMAGE_REQUEST_TIMEOUT_MS);
        const outerSignal = options.signal;
        const onOuterAbort = () => controller.abort();
        if (outerSignal) {
            if (outerSignal.aborted) controller.abort();
            else outerSignal.addEventListener("abort", onOuterAbort);
        }
        try {
            const results = await this.whileLeased(task.id, () =>
                invocation.mode === "edit"
                    ? this.provider.editImage(invocation.config, invocation.prompt, invocation.references, controller.signal)
                    : this.provider.generateImage(invocation.config, invocation.prompt, controller.signal),
            );
            if (results.length === 0) {
                return this.recordFailure(
                    task,
                    { code: "empty-image-result", message: "Provider returned no image.", retryable: true, definitive: true },
                    { definitive: true },
                );
            }
            const receivedAt = this.now();
            const succeeded = transitionTask(task, "succeeded", {
                at: receivedAt,
                result: {
                    items: imageResultItems(task.id, results),
                    receivedAt,
                },
                error: undefined,
            });
            this.store.set(succeeded);
            return succeeded;
        } catch (error) {
            // 本地超时（而不是用户取消）→ 上游可能已受理但拿不到结果：收敛终态并提示先确认。
            if (controller.signal.aborted && !outerSignal?.aborted) {
                return this.closeUnconfirmed(
                    task,
                    "submit-timeout",
                    `出图请求超过 ${Math.round(IMAGE_REQUEST_TIMEOUT_MS / 60000)} 分钟没有返回，无法确认上游是否已受理。已关闭为失败；重试前请先确认，避免重复计费。`,
                );
            }
            const classified = classifyProviderError(error);
            return this.recordFailure(task, classified, { definitive: classified.definitive });
        } finally {
            clearTimeout(timer);
            outerSignal?.removeEventListener("abort", onOuterAbort);
        }
    }

    private async executeVideoCreate(task: ToolTask, invocation: VideoInvocation, options: SubmitOptions): Promise<ToolTask> {
        try {
            const upstream = await this.whileLeased(task.id, () =>
                this.provider.createVideoTask(
                    invocation.config,
                    invocation.prompt,
                    invocation.references,
                    invocation.videos,
                    invocation.audios,
                    options.signal,
                ),
            );
            if (!upstream?.id) {
                return this.recordFailure(
                    task,
                    { code: "missing-upstream-id", message: "Provider did not return a video task id.", retryable: true, definitive: false },
                    { definitive: false },
                );
            }
            const at = this.now();
            const running = transitionTask(task, "running", {
                at,
                upstreamTaskId: upstream.id,
                upstreamProvider: upstream.provider,
                lastHeartbeatAt: at,
            });
            this.store.set(running);
            return running;
        } catch (error) {
            const classified = classifyProviderError(error);
            return this.recordFailure(task, classified, { definitive: classified.definitive });
        }
    }

    private recordFailure(
        task: ToolTask,
        classified: { code: string; message: string; retryable: boolean; definitive?: boolean },
        options: { definitive: boolean; at?: number },
    ): ToolTask {
        const at = options.at ?? this.now();
        // “结果未知”必须用 unknown 表达，而不是 failed：unknown 不允许自动重提交，只允许查询或人工确认。
        const target = options.definitive ? "failed" : "unknown";
        const next =
            target === "unknown" && !ALLOWED_UNKNOWN_FROM.has(task.status)
                ? transitionTask(task, "failed", {
                      at,
                      error: { code: classified.code, message: classified.message, retryable: classified.retryable },
                      reconcileRequired: true,
                  })
                : transitionTask(task, target, {
                      at,
                      error: { code: classified.code, message: classified.message, retryable: classified.retryable },
                      ...(options.definitive ? {} : { reconcileRequired: true }),
                  });
        this.store.set(next);
        return next;
    }

    private resolveTaskConfig(task: ToolTask): AiConfig {
        return applyConfigSnapshot(this.getConfig(), task.configSnapshot);
    }

    private requireTask(taskId: string): ToolTask {
        const task = this.store.get(taskId);
        if (!task) throw new ToolGatewayError("unknown-task", `Unknown tool task: ${taskId}`);
        return task;
    }

    /**
     * 取「最新」任务：落盘快照比内存新时以落盘为准。
     *
     * 竞态现场：本标签页 hydrate 到 submitting 后，原标签页把真实结果写成了 succeeded；
     * 若本页拿陈旧内存继续收敛，就会用旧状态覆盖别人已经到达的终态。
     */
    private latestTask(taskId: string): ToolTask {
        const memory = this.store.get(taskId);
        const persisted = this.store.readPersisted?.(taskId) ?? null;
        if (persisted && (!memory || persisted.updatedAt > memory.updatedAt)) {
            this.store.set(persisted);
            return persisted;
        }
        if (!memory) throw new ToolGatewayError("unknown-task", `Unknown tool task: ${taskId}`);
        return memory;
    }
}

let sharedGateway: ToolTaskGateway | null = null;

/** 浏览器内共享网关：模型/凭据实时读用户配置，任务存内存（持久化由 TASK-048 接管）。 */
export function createToolGateway(deps?: Partial<GatewayDeps>): ToolTaskGateway {
    const getConfig = deps?.getConfig ?? (() => useConfigStore.getState().config);
    return new ToolTaskGateway({ ...deps, getConfig });
}

export function getToolGateway(): ToolTaskGateway {
    if (!sharedGateway) sharedGateway = createToolGateway();
    return sharedGateway;
}

export { canAutoResubmit, isTerminalStatus, planRecovery };
