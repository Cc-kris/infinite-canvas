/**
 * VIDEO_TRANSLATION → SEED_V25（doubao-seedance-2-5）真实路由的协议层。
 *
 * 为什么单独成文件：这一层只做「参数映射 + 状态/结果映射 + 显式阻断」，不碰 HTTP、不碰 React，
 * 因此可以被单测覆盖，也可以被 gateway 在提交前当作纯函数闸门使用。
 *
 * 契约来源（实测证据，见 docs/V1.0/plan_linkfox_navigation/reports/vt-protocol-r27/REPORT.md）：
 *   - makeType = 96（VIDEO_TRANSLATION），bizType = 814
 *   - 顶层：sourceVideoUrl / sourceVideoName / sourceLanguage / targetLanguage / lipSync / outputNum / type
 *   - extendFields：accountTypes = DOUBAO_API，videoType = SEED_V25，duration = -1，videoTime = -1
 *   - type96 目录里 SEED_V25 = Seedance 2.5（isDefault；480/720/1080P；5–30s；9:16|16:9）
 *
 * 诚实边界（不许写进 UI 文案的承诺）：
 *   - 上游没有「逐句翻译」「烧字幕」字段，只有 language + lipSync 引导；成片语言质量需人工确认。
 *   - 当前渠道（sub2api）的模型分组里没有 doubao-seedance-2-5：实测 POST /v1/videos 返回
 *     404 model_not_found "Model \"doubao-seedance-2-5\" is not available for this group"。
 *     所以本模块最重要的职责之一就是把「选了 SEED_V25 但渠道没有」变成**显式阻断**，
 *     绝不允许静默退回 MiniMax-H3 却仍然对外标称 SEED_V25。
 */

/** 目标模型（用户可见的模型值，也是渠道里应有的模型 id）。 */
export const SEED_V25_MODEL_ID = "doubao-seedance-2-5";
/** LinkFox 侧的视频类型枚举值。 */
export const SEED_V25_VIDEO_TYPE = "SEED_V25";
/** LinkFox 侧的账号类型枚举值。 */
export const SEED_V25_ACCOUNT_TYPE = "DOUBAO_API";
/** 视频翻译的 makeType / bizType（实测）。 */
export const VIDEO_TRANSLATION_MAKE_TYPE = 96;
export const VIDEO_TRANSLATION_BIZ_TYPE = 814;

/** SEED_V25 在目录里的能力边界（用于校验用户选项，不做静默纠正）。 */
export const SEED_V25_CAPABILITY = {
    resolutions: ["480P", "720P", "1080P"],
    minSeconds: 5,
    maxSeconds: 30,
    ratios: ["9:16", "16:9"],
} as const;

export type SeedV25TranslationFields = {
    /** 源语言 id：`auto` 表示自动识别。 */
    sourceLanguage: string;
    /** 目标语言 id。 */
    targetLanguage: string;
    /** 口型同步：只在用户显式开启时为 true。 */
    lipSync: boolean;
    sourceVideoUrl: string;
    sourceVideoName: string;
    /** 输出条数；当前渠道一次只返回 1 条。 */
    outputNum: number;
};

/** 送上游的请求体（已按契约命名，除 model/prompt/videos 外全部是翻译专用字段）。 */
export type SeedV25TranslationPayload = {
    model: string;
    prompt: string;
    videos: string[];
    type: number;
    outputNum: number;
    sourceVideoUrl: string;
    sourceVideoName: string;
    sourceLanguage: string;
    targetLanguage: string;
    lipSync: boolean;
    extendFields: {
        accountTypes: string;
        videoType: string;
        sourceLanguage: string;
        targetLanguage: string;
        lipSync: boolean;
        duration: number;
        videoTime: number;
    };
};

export type SeedV25RouteBlocked = {
    status: "blocked";
    /** 机器可读原因，直接进任务 error.code。 */
    code: "seed-v25-model-unavailable" | "seed-v25-source-video-required" | "seed-v25-invalid-field";
    /** 用户可见文案：说清楚「现在的渠道没有这个模型」以及下一步怎么做。 */
    message: string;
    details: Record<string, unknown>;
};

export type SeedV25RouteReady = { status: "ready"; payload: SeedV25TranslationPayload };
export type SeedV25Route = SeedV25RouteReady | SeedV25RouteBlocked;

/** /v1/models 或渠道目录里拿到的模型 id（容忍 `models/` 前缀与大小写差异）。 */
export function normalizeModelId(value: string): string {
    return (value || "").trim().replace(/^models\//i, "").toLowerCase();
}

export function isSeedV25Model(value: string): boolean {
    const id = normalizeModelId(value);
    return id === SEED_V25_MODEL_ID || id === "seedance-2-5" || id === "seedance2.5" || id === "seedance-2.5";
}

/** 只有公网 http(s) 地址上游才拉得到；blob:/data:/内网地址一律视为不可用（不静默改成别的源）。 */
export function isPublicVideoUrl(url: string): boolean {
    const value = (url || "").trim();
    if (!/^https?:\/\//i.test(value)) return false;
    try {
        const host = new URL(value).hostname.toLowerCase();
        if (host === "localhost" || host === "0.0.0.0" || host === "[::1]") return false;
        if (/^127\./.test(host)) return false;
        if (/^10\./.test(host)) return false;
        if (/^192\.168\./.test(host)) return false;
        if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
        return true;
    } catch {
        return false;
    }
}

/** 语言 id 归一：空值视为自动识别；不做「猜语言」。 */
export function normalizeTranslationLanguage(value: string): string {
    const id = (value || "").trim();
    return id || "auto";
}

/**
 * 把工具页字段 + 模型选择，映射成「真实上游要的请求体」，或者在不可能成立时显式阻断。
 *
 * `availableModels` 传当前渠道真实可用的模型 id 列表；传 null 表示「无法枚举」（例如 sub2api
 * 的 /v1/models 返回 {"data":[]}）。此时不做「有就放行」的乐观假设——由 modelRejectedByUpstream
 * 在上游 404 时把任务收敛为同一错误码，两条路径的错误文案保持一致。
 */
export function buildSeedV25TranslationRoute(input: {
    /** 用户在工具页选的模型；留空表示用工具默认（SEED_V25）。 */
    selectedModel?: string;
    prompt: string;
    fields: Partial<SeedV25TranslationFields> | undefined;
    /** 当前渠道声明的模型 id 列表；null = 渠道不公开目录。 */
    availableModels: readonly string[] | null;
    /** 渠道声明的模型是否覆盖了 SEED_V25（目录可为 null 时由调用方按目录来源判断）。 */
    channelDeclaresModel?: boolean;
}): SeedV25Route {
    const fields = input.fields || {};
    const selected = (input.selectedModel || "").trim();
    const targetModel = selected || SEED_V25_MODEL_ID;

    // 1) 模型必须是 SEED_V25 家族：选了别的模型就不该走翻译路由（由调用方决定走不通就报错）。
    if (!isSeedV25Model(targetModel)) {
        return {
            status: "blocked",
            code: "seed-v25-model-unavailable",
            message:
                `视频翻译需要 SEED_V25（${SEED_V25_MODEL_ID}）模型，当前选择的是「${targetModel}」。` +
                "请在设置里选用 SEED_V25 后再提交，本工具不会改用其它模型代跑。",
            details: { selectedModel: targetModel, expectedModel: SEED_V25_MODEL_ID },
        };
    }

    // 2) 渠道可用性：能枚举就按枚举判定；不能枚举则放行到上游，由真实 404 收敛（见 mapUpstreamModelRejection）。
    if (input.availableModels && input.availableModels.length > 0) {
        const has = input.availableModels.some((m) => isSeedV25Model(m));
        if (!has) {
            return {
                status: "blocked",
                code: "seed-v25-model-unavailable",
                message:
                    `当前渠道没有 ${SEED_V25_MODEL_ID}（SEED_V25）。` +
                    `渠道可用模型：${input.availableModels.slice(0, 8).join("、")}。` +
                    "请换成支持 SEED_V25 的渠道，或在渠道里开通该模型；本工具不会退回其它视频模型。",
                details: { expectedModel: SEED_V25_MODEL_ID, availableModels: input.availableModels.slice(0, 40) },
            };
        }
    } else if (input.channelDeclaresModel === false) {
        return {
            status: "blocked",
            code: "seed-v25-model-unavailable",
            message:
                `当前渠道未开通 ${SEED_V25_MODEL_ID}（SEED_V25），无法发起视频翻译。` +
                "请换成支持 SEED_V25 的渠道或在渠道里开通该模型；本工具不会退回其它视频模型。",
            details: { expectedModel: SEED_V25_MODEL_ID },
        };
    }

    // 3) 源视频：上游只认可下载地址，本地 blob 必须先发布成公网地址（由调用方完成并回填）。
    const sourceVideoUrl = (fields.sourceVideoUrl || "").trim();
    if (!sourceVideoUrl || !isPublicVideoUrl(sourceVideoUrl)) {
        return {
            status: "blocked",
            code: "seed-v25-source-video-required",
            message:
                "视频翻译需要可公网下载的源视频地址（上游按 URL 拉源片）。" +
                "当前源视频还没有公网地址，请先上传素材或配置媒体中转后再提交。",
            details: { sourceVideoUrl: sourceVideoUrl || null },
        };
    }

    // 4) 必填字段校验：缺一个都不猜（目标语言错了整条成片都废）。
    const targetLanguage = normalizeTranslationLanguage(fields.targetLanguage || "");
    if (targetLanguage === "auto") {
        return {
            status: "blocked",
            code: "seed-v25-invalid-field",
            message: "视频翻译必须显式选择目标语言；没有目标语言时上游会退回源头语言。",
            details: { field: "targetLanguage" },
        };
    }
    const sourceLanguage = normalizeTranslationLanguage(fields.sourceLanguage || "");
    const sourceVideoName = (fields.sourceVideoName || "").trim() || fileNameFromUrl(sourceVideoUrl);
    const outputNum = Number.isFinite(Number(fields.outputNum)) ? Math.max(1, Math.min(1, Number(fields.outputNum))) : 1;

    return {
        status: "ready",
        payload: {
            model: SEED_V25_MODEL_ID,
            prompt: input.prompt || "",
            videos: [sourceVideoUrl],
            type: VIDEO_TRANSLATION_MAKE_TYPE,
            outputNum,
            sourceVideoUrl,
            sourceVideoName,
            sourceLanguage,
            targetLanguage,
            lipSync: fields.lipSync === true,
            extendFields: {
                accountTypes: SEED_V25_ACCOUNT_TYPE,
                videoType: SEED_V25_VIDEO_TYPE,
                sourceLanguage,
                targetLanguage,
                lipSync: fields.lipSync === true,
                // 翻译由上游整段处理，时长/时间点交给上游（-1 = 不裁剪）。
                duration: -1,
                videoTime: -1,
            },
        },
    };
}

function fileNameFromUrl(url: string): string {
    try {
        const path = new URL(url).pathname;
        const name = path.split("/").filter(Boolean).pop();
        return name || "source.mp4";
    } catch {
        return "source.mp4";
    }
}

/**
 * 上游把模型拒了（sub2api 实测：404 model_not_found "not available for this group"）时，
 * 归一成和本地闸门完全一致的错误码/文案，避免用户看到两套说法。
 */
export function mapUpstreamModelRejection(status: number | undefined, message: string): SeedV25RouteBlocked | null {
    const text = message || "";
    const rejected = status === 404 || status === 400 || status === 403
        ? /model_not_found|not available for this group|model.*not.*(found|available|support)|不支持.*模型/i.test(text)
        : false;
    if (!rejected) return null;
    return {
        status: "blocked",
        code: "seed-v25-model-unavailable",
        message:
            `上游拒绝了模型 ${SEED_V25_MODEL_ID}（SEED_V25）：${text.split("\n")[0].slice(0, 200)}。` +
            "说明当前渠道没有开通该模型；本工具不会退回其它视频模型代跑。",
        details: { expectedModel: SEED_V25_MODEL_ID, upstreamStatus: status ?? null },
    };
}

/* ============================ 状态 / 结果映射 ============================ */

export type SeedV25TaskStatus = "submitted" | "running" | "succeeded" | "failed" | "unknown";

/** 上游任务状态（不同中转命名不一，这里显式列全，未列出的判 unknown，绝不乐观判成功）。 */
const STATUS_MAP: Record<string, SeedV25TaskStatus> = {
    queued: "submitted",
    pending: "submitted",
    submitted: "submitted",
    created: "submitted",
    waiting: "submitted",
    running: "running",
    processing: "running",
    in_progress: "running",
    generating: "running",
    succeeded: "succeeded",
    success: "succeeded",
    completed: "succeeded",
    done: "succeeded",
    finished: "succeeded",
    failed: "failed",
    failure: "failed",
    error: "failed",
    cancelled: "failed",
    canceled: "failed",
    expired: "failed",
};

export function mapSeedV25TaskStatus(raw: unknown): SeedV25TaskStatus {
    const key = String(raw ?? "").trim().toLowerCase();
    return STATUS_MAP[key] || "unknown";
}

/** 结果视频地址：只认 http(s)/blob/data 或本地 content 路由，不拼猜。 */
export function extractSeedV25VideoUrl(raw: unknown): string {
    const data = raw as Record<string, any> | null;
    if (!data || typeof data !== "object") return "";
    const candidates = [
        data.url,
        data.video_url,
        data.output,
        data.result_url,
        data.result?.url,
        data.result?.video_url,
        data.data?.url,
        data.data?.video_url,
        data.data?.output,
        data.data?.[0]?.url,
        data.content?.video_url,
        data.content?.url,
        Array.isArray(data.output) ? data.output[0]?.url : undefined,
        Array.isArray(data.videos) ? (typeof data.videos[0] === "string" ? data.videos[0] : data.videos[0]?.url) : undefined,
    ];
    for (const item of candidates) {
        if (typeof item === "string" && item.trim()) return item.trim();
    }
    return "";
}

/** 上游任务 id：契约里 `id`/`task_id`/`data.id` 都出现过，取第一个非空。 */
export function extractSeedV25TaskId(raw: unknown): string {
    const data = raw as Record<string, any> | null;
    if (!data || typeof data !== "object") return "";
    const candidates = [data.id, data.task_id, data.taskId, data.data?.id, data.data?.task_id, data.data?.taskId];
    for (const item of candidates) {
        if (typeof item === "string" && item.trim()) return item.trim();
    }
    return "";
}

/**
 * 成片说明（给 UI 徽标用）：SEED_V25 只有 language + lipSync 引导，没有逐句翻译与字幕烧录，
 * 所以结果永远带「未验证翻译」的诚实标注，不允许写「翻译完成」。
 */
export const SEED_V25_RESULT_BADGE = {
    label: "SEED_V25 译制草稿 · 未验证翻译",
    note: "语言由上游按目标语言引导生成，未做逐句对齐与人工校验；请人工确认语言与口型。",
} as const;
