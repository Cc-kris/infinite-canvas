/** 链接/视频内容读取与已配置模型分析。读取失败直接报错，不从 URL 猜测内容；解析与模型调用在主进程本地服务完成。 */
import { requestAudioGeneration } from "@/services/api/audio";
import {
    requestContentCopywrite,
    requestContentPage,
    requestContentProductLink,
    requestContentSlices,
    requestContentText,
    requestContentTranscription,
    requestContentVideo,
    requestContentVision,
    type ContentTranscription,
} from "@/services/api/desktop/capabilities/content";
import { uploadTempMedia } from "@/services/api/desktop/capabilities/media";
import { desktopServiceToken, desktopServiceUrl } from "@/services/api/desktop/runtime";
import { fetchExternalBlob } from "@/services/desktop-storage";
import { imageToDataUrl } from "@/services/image-storage";
import { resolveModelRequestConfig, resolveModelScript, type AiConfig } from "@/stores/use-config-store";
import { extractVideoAudio, MediaProcessingError, type TranscriptionResult, type TranscriptionSegment, type VideoTranslationPipelinePorts } from "./ffmpeg-media";
import { requestImageQuestion, type AiTextMessage } from "@/services/api/image";

export class ToolContentAnalysisError extends Error {
    readonly code: string;
    constructor(code: string, message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = "ToolContentAnalysisError";
        this.code = code;
    }
}

export type ProductLinkAnalysis = { title: string; content: string; finalUrl: string; script: string };

const KNOWN_CONTENT_CODES = new Set([
    "invalid-link",
    "aborted",
    "page-unreadable",
    "page-not-html",
    "page-empty",
    "video-unreadable",
    "video-not-file",
    "transcription-unavailable",
    "transcription-failed",
    "transcription-empty",
    "text-model-unavailable",
    "image-unreadable",
    "analysis-empty",
]);

function contentError(error: unknown, fallbackCode: string, fallbackMessage: string) {
    if (error instanceof ToolContentAnalysisError) return error;
    const code = (error as { code?: string } | null)?.code;
    const message = error instanceof Error ? error.message : "";
    return new ToolContentAnalysisError(code && KNOWN_CONTENT_CODES.has(code) ? code : fallbackCode, message || fallbackMessage, { cause: error });
}

function requireHttpUrl(raw: string, message: string) {
    let parsed: URL;
    try {
        parsed = new URL(raw.trim());
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    } catch {
        throw new ToolContentAnalysisError("invalid-link", message);
    }
    return parsed;
}

/** 从网页真实字节取正文。读取在主进程完成；不做第三方镜像回退。 */
export async function readProductPage(url: string, signal?: AbortSignal): Promise<{ title: string; content: string; finalUrl: string }> {
    const parsed = requireHttpUrl(url, "商品链接需以 http:// 或 https:// 开头");
    try {
        return await requestContentPage(parsed.href, signal);
    } catch (error) {
        if (signal?.aborted) throw new ToolContentAnalysisError("aborted", "已取消商品链接读取", { cause: error });
        throw contentError(error, "page-unreadable", "商品页面读取失败：请改用可公开访问的页面");
    }
}

function textModelConfig(config: AiConfig): AiConfig {
    const model = (config.textModel || config.model).trim();
    const resolved = resolveModelRequestConfig(config, model);
    if (!model || !resolved.baseUrl.trim() || !resolved.apiKey.trim()) {
        throw new ToolContentAnalysisError("text-model-unavailable", "请先在模型设置中配置可访问的文本模型（含接口地址与 API Key）");
    }
    return resolved;
}

async function analyzeText(config: AiConfig, instruction: string, content: string, signal?: AbortSignal): Promise<string> {
    const resolved = textModelConfig(config);
    let answer: string;
    try {
        answer = await askTextModel(resolved, "你是商品视频脚本助手。只能使用用户提供的真实内容，缺失的信息明确写未提供，不得根据链接名称或常识编造。直接输出可编辑文本。", `${instruction}\n\n【真实读取内容】\n${content}`, signal);
    } catch (error) {
        throw contentError(error, "analysis-empty", "模型没有返回分析结果");
    }
    if (!answer.trim()) throw new ToolContentAnalysisError("analysis-empty", "模型没有返回分析结果");
    return answer.trim();
}

/** 配置了脚本的文本模型只能在渲染层执行；其余请求统一走本地服务。 */
function askTextModel(config: AiConfig, system: string, userContent: AiTextMessage["content"], signal?: AbortSignal) {
    if (resolveModelScript(config, config.model)) {
        return requestImageQuestion(config, [{ role: "system", content: system }, { role: "user", content: userContent }], () => {}, { signal });
    }
    return requestContentText({ config, system, messages: [{ role: "user", content: userContent }], signal });
}

export async function analyzeProductLink(input: { url: string; config: AiConfig; language: string; signal?: AbortSignal }): Promise<ProductLinkAnalysis> {
    const page = await readProductPage(input.url, input.signal);
    const script = await analyzeText(input.config, `根据商品网页正文生成${input.language}带货口播草稿。只写网页中有依据的商品名称、卖点与使用信息，不编造价格、折扣、功效或库存。`, page.content, input.signal);
    return { ...page, script };
}

export async function requestToolAudioTranscription(input: { config: AiConfig; audio: Blob; sourceLanguage: string; signal?: AbortSignal }): Promise<TranscriptionResult> {
    const selectedModel = input.config.audioModel.trim();
    const config = resolveModelRequestConfig(input.config, selectedModel);
    const model = config.model;
    if (!model || !config.baseUrl.trim() || !config.apiKey.trim()) {
        throw new ToolContentAnalysisError("transcription-unavailable", "请先在模型设置中配置支持语音转录的音频模型；普通 TTS 模型不能代替 ASR");
    }
    if (config.apiFormat !== "openai") {
        throw new ToolContentAnalysisError("transcription-unavailable", "当前所选音频通道未实现语音转录；请配置支持 OpenAI 兼容 /audio/transcriptions 的 ASR 服务");
    }

    let result: ContentTranscription;
    try {
        const uploaded = await uploadTempMedia(input.audio, "source-audio.mp3", input.signal);
        result = await requestContentTranscription({ config, audioId: uploaded.id, sourceLanguage: input.sourceLanguage, mimeType: input.audio.type || "audio/mpeg", signal: input.signal });
    } catch (error) {
        throw contentError(error, "transcription-failed", "语音转录失败，请检查 ASR 服务配置");
    }
    const text = result.text?.trim() ?? "";
    const segments = Array.isArray(result.segments) ? result.segments : [];
    if (!text || !segments.length) throw new ToolContentAnalysisError("transcription-empty", "ASR 没有返回带逐句时间轴的语音文本，无法用于译制");
    return { text, language: result.language, segments };
}

export async function transcribeToolVideo(input: { config: AiConfig; video: Blob; sourceLanguage: string; signal?: AbortSignal }): Promise<TranscriptionResult> {
    try {
        const audio = await extractVideoAudio(input.video);
        return await requestToolAudioTranscription({ ...input, audio });
    } catch (cause) {
        if (cause instanceof ToolContentAnalysisError || cause instanceof MediaProcessingError) throw cause;
        throw new ToolContentAnalysisError("video-unreadable", "无法读取视频音轨", { cause });
    }
}

/** 只读取公开视频文件；分享页 HTML 不会被当作可分析的视频字节。 */
export async function readPublicVideoBlob(url: string, signal?: AbortSignal): Promise<Blob> {
    const parsed = requireHttpUrl(url, "参考视频链接需以 http:// 或 https:// 开头");
    let video: Blob;
    try {
        video = await requestContentVideo(parsed.href, signal);
    } catch (error) {
        throw contentError(error, "video-unreadable", "参考视频读取失败：请确认直链可公开访问");
    }
    if (!video.size) throw new ToolContentAnalysisError("video-unreadable", "链接返回了空视频文件");
    return video;
}

export async function analyzeVideoTranscript(input: { config: AiConfig; transcript: string; targetLanguage: string; signal?: AbortSignal }): Promise<string> {
    if (!input.transcript.trim()) throw new ToolContentAnalysisError("transcript-required", "请先取得参考视频的真实转录文本");
    return analyzeText(input.config, `根据参考视频的真实语音转录，分析其口播结构、卖点顺序与镜头口播配合，并改写为${input.targetLanguage}口播脚本草稿。不要编造转录里没有的商品事实。`, input.transcript, input.signal);
}

function translateSegments(config: AiConfig, segments: TranscriptionSegment[], sourceLanguage: string, targetLanguage: string, signal?: AbortSignal): Promise<TranscriptionSegment[]> {
    return analyzeText(config, `将下列 JSON 数组中每句 text 从${sourceLanguage === "auto" ? "自动识别的源语言" : sourceLanguage}翻译为${targetLanguage}。保持数组顺序、startMs、endMs 完全不变，只输出合法 JSON 数组，不使用代码块。`, JSON.stringify(segments), signal).then((text) => {
        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch (cause) {
            throw new ToolContentAnalysisError("translation-invalid", "文本模型未返回可解析的逐句译文，请重试或检查模型输出", { cause });
        }
        if (!Array.isArray(parsed) || parsed.length !== segments.length || parsed.some((item: unknown, index) => {
            if (!item || typeof item !== "object") return true;
            const candidate = item as Record<string, unknown>;
            return candidate.startMs !== segments[index].startMs || candidate.endMs !== segments[index].endMs || typeof candidate.text !== "string" || !candidate.text.trim();
        })) {
            throw new ToolContentAnalysisError("translation-invalid", "逐句译文与原始时间轴不一致，已停止合成");
        }
        return parsed as TranscriptionSegment[];
    });
}

export function createVideoTranslationPipeline(config: AiConfig): VideoTranslationPipelinePorts {
    return {
        transcribe: (audio, sourceLanguage) => requestToolAudioTranscription({ config, audio, sourceLanguage }),
        translate: (segments, sourceLanguage, targetLanguage) => translateSegments(config, segments, sourceLanguage, targetLanguage),
        synthesize: (text) => requestAudioGeneration({ ...config, model: config.audioModel }, text),
    };
}

/* ================================================================== *
 * BE-AI01: 商品图视觉「AI 分析」
 * ================================================================== */

export interface ProductVisionAnalysisResult {
    productName: string;
    categoryId?: string;
    sellingPoints: string[];
    audience: string;
    marketLanguage: string;
    formattedText: string;
}

function absoluteMediaUrl(value: string) {
    const trimmed = value.trim();
    if (!trimmed.startsWith("/files/")) return trimmed;
    return `${desktopServiceUrl()}${trimmed}${trimmed.includes("?") ? "&" : "?"}token=${encodeURIComponent(desktopServiceToken())}`;
}

/** 主进程读不到 blob:/相对地址，先把这类图片转成 data URL；http(s) 与 data URL 原样传递。 */
async function toServerImageUrl(raw?: string): Promise<string> {
    const value = String(raw || "").trim();
    if (!value) return "";
    if (/^(data:|https?:)/i.test(value)) return value;
    const absolute = absoluteMediaUrl(value);
    if (/^https?:/i.test(absolute)) return absolute;
    try {
        return await imageToDataUrl({ url: absolute });
    } catch {
        return absolute;
    }
}

/** 配置了脚本的文本模型：在主进程提示词之外，仍按同一份提示词在渲染层执行脚本。 */
function visionPrompt(input: { currentText?: string; imageUrl?: string; categories?: ReadonlyArray<{ id: string; label: string }> }) {
    const categoryHint = input.categories?.length
        ? `可选类目枚举（categoryId 只能从中选最接近的一项）：${input.categories.map((category) => `${category.id}=${category.label}`).join("、")}。`
        : "";
    const system = [
        "你是资深跨境电商视觉与选品分析师。请观察用户上传的商品图片（及已填写的补充信息），识别商品特征并输出严格 JSON 对象，不要包含代码块标记：",
        '{"productName":"商品名称","categoryId":"匹配的类目id","sellingPoints":["核心卖点1","核心卖点2","核心卖点3"],"audience":"适用人群","marketLanguage":"目标市场语言（如中文/英文）"}',
        categoryHint,
    ]
        .filter(Boolean)
        .join("\n");
    const content: Exclude<AiTextMessage["content"], string> = [
        {
            type: "text",
            text: input.currentText?.trim() ? `请结合这张商品图与以下已有描述分析商品信息：\n${input.currentText.trim()}` : "请分析这张商品图的名称、类目、核心卖点、适用人群与目标市场语言。",
        },
    ];
    if (input.imageUrl?.trim()) content.push({ type: "image_url", image_url: { url: input.imageUrl.trim() } });
    return { system, content };
}

function parseVisionAnswer(raw: string): ProductVisionAnalysisResult | null {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    try {
        const parsed = JSON.parse(cleaned);
        const productName = typeof parsed.productName === "string" ? parsed.productName.trim() : "";
        const sellingPoints = Array.isArray(parsed.sellingPoints) ? parsed.sellingPoints.map((item: unknown) => String(item).trim()).filter(Boolean) : [];
        const audience = typeof parsed.audience === "string" ? parsed.audience.trim() : "";
        const marketLanguage = typeof parsed.marketLanguage === "string" ? parsed.marketLanguage.trim() : "中文";
        const categoryId = typeof parsed.categoryId === "string" ? parsed.categoryId.trim() : undefined;
        const formattedText = [
            productName ? `产品名称：${productName}` : "",
            sellingPoints.length ? `核心卖点：${sellingPoints.join("；")}` : "",
            audience ? `适用人群：${audience}` : "",
            marketLanguage ? `目标市场语言：${marketLanguage}` : "",
        ].filter(Boolean).join("\n");
        return { productName, categoryId, sellingPoints, audience, marketLanguage, formattedText: formattedText || raw.trim() };
    } catch {
        if (!raw.trim()) return null;
        return { productName: "", sellingPoints: [raw.trim()], audience: "", marketLanguage: "中文", formattedText: raw.trim() };
    }
}

function fallbackVision(input: { currentText?: string; categories?: ReadonlyArray<{ id: string; label: string }> }): ProductVisionAnalysisResult {
    const text = String(input.currentText || "").trim();
    const lines = text.split(/[\n。；;，,]+/).map((line) => line.trim()).filter(Boolean);
    const sellingPoints = lines.slice(0, 4);
    const categoryId = input.categories?.find((category) => text.includes(category.label))?.id ?? input.categories?.[0]?.id;
    return {
        productName: lines[0] ?? "主推商品",
        categoryId,
        sellingPoints: sellingPoints.length ? sellingPoints : ["质感细节展示", "核心功能突出", "多场景适用"],
        audience: "品质生活及电商目标消费群体",
        marketLanguage: "中文",
        formattedText: [
            lines[0] ? `产品名称：${lines[0]}` : "产品名称：主推商品",
            sellingPoints.length ? `核心卖点：${sellingPoints.join("；")}` : "核心卖点：质感细节展示；核心功能突出；多场景适用",
            "适用人群：品质生活及电商目标消费群体",
            "目标市场语言：中文",
        ].join("\n"),
    };
}

/**
 * 传入已上传商品图的 base64/URL，调用已配置的视觉大模型（Vision LLM）自动识别并回填
 * 商品名称、商品类目、核心卖点、适用人群与目标市场语言。
 */
export async function analyzeProductImageWithVision(input: {
    imageUrl: string;
    currentText?: string;
    categories?: ReadonlyArray<{ id: string; label: string }>;
    config?: AiConfig;
    signal?: AbortSignal;
}): Promise<ProductVisionAnalysisResult> {
    const resolvedConfig = input.config ?? (await import("@/stores/use-config-store")).useConfigStore.getState().config;
    const model = (resolvedConfig.textModel || resolvedConfig.model || "").trim();
    const requestConfig = resolveModelRequestConfig(resolvedConfig, model);
    const imageUrl = await toServerImageUrl(input.imageUrl);
    try {
        if (resolveModelScript(requestConfig, requestConfig.model)) {
            const prompt = visionPrompt({ ...input, imageUrl });
            const raw = await requestImageQuestion(requestConfig, [{ role: "system", content: prompt.system }, { role: "user", content: prompt.content }], () => {}, { signal: input.signal });
            return parseVisionAnswer(raw) ?? fallbackVision(input);
        }
        return await requestContentVision({
            config: requestConfig,
            imageUrl,
            currentText: input.currentText,
            categories: input.categories,
            signal: input.signal,
        });
    } catch (error) {
        throw contentError(error, "vision-failed", "商品图分析失败");
    }
}

/* ================================================================== *
 * BE-AI02: 脚本与提示词「AI 帮写 / 提示词优化」
 * ================================================================== */

export async function generateMarketingCopyWithAI(input: {
    mode: "sale-script" | "video-prompt" | "outpainting-prompt";
    productInfo?: string;
    currentDraft?: string;
    durationSeconds?: number;
    language?: string;
    imageUrl?: string;
    config?: AiConfig;
    signal?: AbortSignal;
}): Promise<string> {
    const resolvedConfig = input.config ?? (await import("@/stores/use-config-store")).useConfigStore.getState().config;
    const model = (resolvedConfig.textModel || resolvedConfig.model || "").trim();
    const requestConfig = resolveModelRequestConfig(resolvedConfig, model);
    const imageUrl = input.imageUrl ? await toServerImageUrl(input.imageUrl) : "";
    try {
        if (resolveModelScript(requestConfig, requestConfig.model)) {
            return await scriptedMarketingCopy(requestConfig, { ...input, imageUrl });
        }
        return await requestContentCopywrite({
            config: requestConfig,
            mode: input.mode,
            productInfo: input.productInfo,
            currentDraft: input.currentDraft,
            durationSeconds: input.durationSeconds,
            language: input.language,
            imageUrl,
            signal: input.signal,
        });
    } catch (error) {
        throw contentError(error, "copywrite-failed", "AI 文案生成失败");
    }
}

/** 与主进程 content/analysis.mjs 保持同一份提示词与无模型兜底。 */
async function scriptedMarketingCopy(
    config: AiConfig,
    input: { mode: "sale-script" | "video-prompt" | "outpainting-prompt"; productInfo?: string; currentDraft?: string; durationSeconds?: number; language?: string; imageUrl?: string; signal?: AbortSignal },
) {
    const instructions = {
        "sale-script": `请根据商品信息生成一段约 ${input.durationSeconds ?? 15} 秒的${input.language ?? "中文"}电商带货短视频口播脚本与分镜画面提示词（含黄金前3秒痛点引入、核心卖点展示、使用场景与收尾转化引导）。直接输出脚本正文，不要寒暄。`,
        "video-prompt": `请将以下视频创意或画面描述优化为专业、细节丰富的 AI 视频生成提示词（包含主体动作、镜头运镜、光影氛围与材质细节，输出语言：${input.language ?? "中文"}）。直接输出优化后的提示词正文。`,
        "outpainting-prompt": "请根据原图画面与补充词，生成适合智能扩图（Outpainting）的四周延展背景与光影衔接描述词。直接输出精炼提示词。",
    };
    const userText = [input.productInfo?.trim(), input.currentDraft?.trim()].filter(Boolean).join("\n") || "电商主推商品展示";
    const content: Exclude<AiTextMessage["content"], string> = [{ type: "text", text: `${instructions[input.mode]}\n\n【输入信息】\n${userText}` }];
    if (input.imageUrl) content.push({ type: "image_url", image_url: { url: input.imageUrl } });
    const answer = await requestImageQuestion(
        config,
        [
            { role: "system", content: "你是专业的电商视觉导演与 AI 提示词工程师。直接输出最终可用的脚本或提示词文本。" },
            { role: "user", content },
        ],
        () => {},
        { signal: input.signal },
    );
    if (answer.trim()) return answer.trim();

    const seed = [input.productInfo?.trim(), input.currentDraft?.trim()].filter(Boolean).join("，") || "精选电商好物";
    if (input.mode === "sale-script") {
        return `【0-3s 吸睛开场】近景特写展示${seed}细节，自然光柔和打亮主体。\n【3-10s 卖点演绎】中景多角度展示核心卖点与真实使用状态，运镜平稳推进。\n【10-${input.durationSeconds ?? 15}s 转化收尾】全身/全景定格展示整体质感，引导下单体验。`;
    }
    if (input.mode === "outpainting-prompt") return `${seed}，自然延展画面边缘环境与桌面光影，保持透视与色调一致，高清细节`;
    return `${seed}，商业摄影级布光，主体清晰稳定，平稳推轨镜头，自然景深，高画质细节呈现`;
}

/* ================================================================== *
 * BE-LNK01 & BE-LNK02: 电商商品链接解析 & A+ 长图智能切分
 * ================================================================== */

export interface EcommerceProductLinkData {
    title: string;
    sellingPoints: string[];
    images: string[];
    finalUrl: string;
}

/**
 * 解析电商商品详情页，提取标题、五点描述/卖点以及主图/A+长图 URL 列表。
 */
export async function parseEcommerceProductLink(url: string, signal?: AbortSignal): Promise<EcommerceProductLinkData> {
    const parsed = requireHttpUrl(url, "商品链接需以 http:// 或 https:// 开头");
    try {
        return await requestContentProductLink(parsed.href, signal);
    } catch (error) {
        if (signal?.aborted) throw new ToolContentAnalysisError("aborted", "已取消商品链接读取", { cause: error });
        throw contentError(error, "page-unreadable", "商品页面读取失败：请使用可公开访问的商品链接");
    }
}

export interface SlicedImageModule {
    id: string;
    label: string;
    dataUrl: string;
    width: number;
    height: number;
    yStart: number;
    yEnd: number;
}

/**
 * BE-LNK02: 对上传的详情长图按留白/视觉边界或固定比例切分为独立模块卡片。
 */
export async function sliceLongProductImage(
    imageUrl: string,
    options?: { maxModules?: number },
): Promise<SlicedImageModule[]> {
    const source = absoluteMediaUrl(imageUrl);
    let blob: Blob;
    try {
        // http(s) 由本地服务转发，避免渲染层被远端 CORS 挡住；data:/blob: 直接读。
        blob = /^https?:/i.test(source) ? await fetchExternalBlob(source) : await (await fetch(source)).blob();
    } catch {
        throw new Error("无法加载长图进行智能切分");
    }
    if (!blob.size) throw new Error("无法加载长图进行智能切分");
    const uploaded = await uploadTempMedia(blob, "product-long-image.png");
    return requestContentSlices(uploaded.id, options?.maxModules);
}
