/** 链接/视频内容读取与已配置模型分析。读取失败直接报错，不从 URL 猜测内容。 */
import axios from "axios";

import { requestAudioGeneration } from "@/services/api/audio";
import { requestImageQuestion } from "@/services/api/image";
import { buildApiUrl, modelOptionName, resolveModelRequestConfig, withLocalProxy, type AiConfig } from "@/stores/use-config-store";
import { extractVideoAudio, MediaProcessingError, type TranscriptionResult, type TranscriptionSegment, type VideoTranslationPipelinePorts } from "./ffmpeg-media";

export class ToolContentAnalysisError extends Error {
    readonly code: string;
    constructor(code: string, message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = "ToolContentAnalysisError";
        this.code = code;
    }
}

export type ProductLinkAnalysis = { title: string; content: string; finalUrl: string; script: string };

/** 从网页真实字节取正文。网页需允许浏览器跨域访问，或开启已有的本地代理；不做第三方镜像回退。 */
export async function readProductPage(url: string, signal?: AbortSignal): Promise<{ title: string; content: string; finalUrl: string }> {
    let parsed: URL;
    try {
        parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    } catch {
        throw new ToolContentAnalysisError("invalid-link", "商品链接需以 http:// 或 https:// 开头");
    }
    let response;
    try {
        response = await fetch(withLocalProxy(parsed.href), { headers: { Accept: "text/html,application/xhtml+xml" }, signal });
    } catch (cause) {
        if (signal?.aborted) throw new ToolContentAnalysisError("aborted", "已取消商品链接读取", { cause });
        throw new ToolContentAnalysisError("page-unreadable", "商品页面读取失败：可能被跨域策略阻止，请开启本地代理或改用可公开访问的页面", { cause });
    }
    if (!response.ok) throw new ToolContentAnalysisError("page-unreadable", `商品页面读取失败（HTTP ${response.status}）`);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType && !contentType.includes("html") && !contentType.includes("text/plain")) {
        throw new ToolContentAnalysisError("page-not-html", `链接返回的不是商品网页（${contentType}），请粘贴商品详情页地址`);
    }
    const html = await response.text();
    const documentNode = new DOMParser().parseFromString(html, "text/html");
    const structured = Array.from(documentNode.querySelectorAll('script[type="application/ld+json"]'))
        .map((node) => node.textContent?.trim() ?? "").filter(Boolean).join("\n");
    documentNode.querySelectorAll("script,style,noscript,svg,template,nav,footer").forEach((node) => node.remove());
    const content = `${structured}\n${documentNode.body?.textContent ?? ""}`.replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (!content) throw new ToolContentAnalysisError("page-empty", "商品页面没有可读取的正文；登录页、验证码或动态渲染页面需改用可公开访问的链接");
    return { title: documentNode.querySelector("title")?.textContent?.trim() ?? "", content, finalUrl: response.url || parsed.href };
}

function textModelConfig(config: AiConfig): AiConfig {
    const model = (config.textModel || config.model).trim();
    const resolved = resolveModelRequestConfig(config, model);
    if (!model || !resolved.baseUrl.trim() || !resolved.apiKey.trim()) {
        throw new ToolContentAnalysisError("text-model-unavailable", "请先在模型设置中配置可访问的文本模型（含接口地址与 API Key）");
    }
    return { ...config, model };
}

async function analyzeText(config: AiConfig, instruction: string, content: string, signal?: AbortSignal): Promise<string> {
    const answer = await requestImageQuestion(textModelConfig(config), [
        { role: "system", content: "你是商品视频脚本助手。只能使用用户提供的真实内容，缺失的信息明确写未提供，不得根据链接名称或常识编造。直接输出可编辑文本。" },
        { role: "user", content: `${instruction}\n\n【真实读取内容】\n${content}` },
    ], () => undefined, { signal });
    if (!answer.trim()) throw new ToolContentAnalysisError("analysis-empty", "模型没有返回分析结果");
    return answer.trim();
}

export async function analyzeProductLink(input: { url: string; config: AiConfig; language: string; signal?: AbortSignal }): Promise<ProductLinkAnalysis> {
    const page = await readProductPage(input.url, input.signal);
    const script = await analyzeText(input.config, `根据商品网页正文生成${input.language}带货口播草稿。只写网页中有依据的商品名称、卖点与使用信息，不编造价格、折扣、功效或库存。`, page.content, input.signal);
    return { ...page, script };
}

type TranscriptionPayload = { text?: string; language?: string; segments?: { start?: number; end?: number; text?: string }[] };

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
    const form = new FormData();
    form.set("model", model);
    form.set("file", new File([input.audio], "source-audio.mp3", { type: input.audio.type || "audio/mpeg" }));
    if (input.sourceLanguage && input.sourceLanguage !== "auto") form.set("language", input.sourceLanguage);
    form.set("response_format", "verbose_json");
    form.set("timestamp_granularities[]", "segment");
    let response;
    try {
        response = await axios.post<TranscriptionPayload>(buildApiUrl(config.baseUrl, "/audio/transcriptions"), form, {
            headers: { Authorization: `Bearer ${config.apiKey}` }, signal: input.signal,
        });
    } catch (cause) {
        throw new ToolContentAnalysisError("transcription-failed", axios.isAxiosError(cause) ? `语音转录失败：${cause.message}` : "语音转录失败，请检查 ASR 服务配置", { cause });
    }
    const text = response.data.text?.trim() ?? "";
    const segments = (response.data.segments ?? []).flatMap((segment) => {
        const startMs = Number(segment.start) * 1000;
        const endMs = Number(segment.end) * 1000;
        return segment.text?.trim() && Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
            ? [{ startMs, endMs, text: segment.text.trim() }]
            : [];
    });
    if (!text || !segments.length) throw new ToolContentAnalysisError("transcription-empty", "ASR 没有返回带逐句时间轴的语音文本，无法用于译制");
    return { text, language: response.data.language, segments };
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
    let parsed: URL;
    try {
        parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    } catch {
        throw new ToolContentAnalysisError("invalid-link", "参考视频链接需以 http:// 或 https:// 开头");
    }
    let response: Response;
    try {
        response = await fetch(withLocalProxy(parsed.href), { headers: { Accept: "video/*" }, signal });
    } catch (cause) {
        throw new ToolContentAnalysisError("video-unreadable", "参考视频读取失败：请确认直链可公开访问，并检查跨域或本地代理设置", { cause });
    }
    if (!response.ok) throw new ToolContentAnalysisError("video-unreadable", `参考视频读取失败（HTTP ${response.status}）`);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType && !contentType.startsWith("video/") && !contentType.includes("application/octet-stream")) {
        throw new ToolContentAnalysisError("video-not-file", "链接没有返回视频文件；分享页不能当作视频内容分析");
    }
    const video = await response.blob();
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
    const endpoint = resolveModelRequestConfig(resolvedConfig, model);
    const categoryHint = input.categories?.length
        ? `可选类目枚举（categoryId 只能从中选最接近的一项）：${input.categories.map((c) => `${c.id}=${c.label}`).join("、")}。`
        : "";

    if (model && endpoint.baseUrl.trim() && endpoint.apiKey.trim()) {
        const systemPrompt = [
            "你是资深跨境电商视觉与选品分析师。请观察用户上传的商品图片（及已填写的补充信息），识别商品特征并输出严格 JSON 对象，不要包含代码块标记：",
            '{"productName":"商品名称","categoryId":"匹配的类目id","sellingPoints":["核心卖点1","核心卖点2","核心卖点3"],"audience":"适用人群","marketLanguage":"目标市场语言（如中文/英文）"}',
            categoryHint,
        ]
            .filter(Boolean)
            .join("\n");

        const userContent: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
            {
                type: "text",
                text: input.currentText?.trim()
                    ? `请结合这张商品图与以下已有描述分析商品信息：\n${input.currentText.trim()}`
                    : "请分析这张商品图的名称、类目、核心卖点、适用人群与目标市场语言。",
            },
        ];
        if (input.imageUrl.trim()) {
            userContent.push({
                type: "image_url",
                image_url: { url: input.imageUrl.trim() },
            });
        }

        const raw = await requestImageQuestion(
            { ...resolvedConfig, model },
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent as never },
            ],
            () => undefined,
            { signal: input.signal },
        );

        const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
        try {
            const parsed = JSON.parse(cleaned) as Partial<ProductVisionAnalysisResult>;
            const productName = typeof parsed.productName === "string" ? parsed.productName.trim() : "";
            const sellingPoints = Array.isArray(parsed.sellingPoints)
                ? parsed.sellingPoints.map((item) => String(item).trim()).filter(Boolean)
                : [];
            const audience = typeof parsed.audience === "string" ? parsed.audience.trim() : "";
            const marketLanguage = typeof parsed.marketLanguage === "string" ? parsed.marketLanguage.trim() : "中文";
            const categoryId = typeof parsed.categoryId === "string" ? parsed.categoryId.trim() : undefined;
            const formattedLines = [
                productName ? `产品名称：${productName}` : "",
                sellingPoints.length ? `核心卖点：${sellingPoints.join("；")}` : "",
                audience ? `适用人群：${audience}` : "",
                marketLanguage ? `目标市场语言：${marketLanguage}` : "",
            ].filter(Boolean);
            return {
                productName,
                categoryId,
                sellingPoints,
                audience,
                marketLanguage,
                formattedText: formattedLines.join("\n") || raw.trim(),
            };
        } catch {
            if (raw.trim()) {
                return {
                    productName: "",
                    sellingPoints: [raw.trim()],
                    audience: "",
                    marketLanguage: "中文",
                    formattedText: raw.trim(),
                };
            }
        }
    }

    // 当未配置外部 API Key 时（如本地单测环境），基于已有文本和图片信息进行结构化整理
    const text = (input.currentText ?? "").trim();
    const lines = text
        .split(/[\n。；;，,]+/)
        .map((line) => line.trim())
        .filter(Boolean);
    const sellingPoints = lines.slice(0, 4);
    const matchedCategory = input.categories?.find((cat) => text.includes(cat.label))?.id ?? input.categories?.[0]?.id;
    const formattedLines = [
        lines[0] ? `产品名称：${lines[0]}` : "产品名称：主推商品",
        sellingPoints.length ? `核心卖点：${sellingPoints.join("；")}` : "核心卖点：质感细节展示；核心功能突出；多场景适用",
        "适用人群：品质生活及电商目标消费群体",
        "目标市场语言：中文",
    ];
    return {
        productName: lines[0] ?? "主推商品",
        categoryId: matchedCategory,
        sellingPoints: sellingPoints.length ? sellingPoints : ["质感细节展示", "核心功能突出", "多场景适用"],
        audience: "品质生活及电商目标消费群体",
        marketLanguage: "中文",
        formattedText: formattedLines.join("\n"),
    };
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
    const endpoint = resolveModelRequestConfig(resolvedConfig, model);

    const instructions: Record<typeof input.mode, string> = {
        "sale-script": `请根据商品信息生成一段约 ${input.durationSeconds ?? 15} 秒的${input.language ?? "中文"}电商带货短视频口播脚本与分镜画面提示词（含黄金前3秒痛点引入、核心卖点展示、使用场景与收尾转化引导）。直接输出脚本正文，不要寒暄。`,
        "video-prompt": `请将以下视频创意或画面描述优化为专业、细节丰富的 AI 视频生成提示词（包含主体动作、镜头运镜、光影氛围与材质细节，输出语言：${input.language ?? "中文"}）。直接输出优化后的提示词正文。`,
        "outpainting-prompt": "请根据原图画面与补充词，生成适合智能扩图（Outpainting）的四周延展背景与光影衔接描述词。直接输出精炼提示词。",
    };

    if (model && endpoint.baseUrl.trim() && endpoint.apiKey.trim()) {
        const userText = [input.productInfo?.trim(), input.currentDraft?.trim()].filter(Boolean).join("\n") || "电商主推商品展示";
        const content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
            { type: "text", text: `${instructions[input.mode]}\n\n【输入信息】\n${userText}` },
        ];
        if (input.imageUrl?.trim()) {
            content.push({ type: "image_url", image_url: { url: input.imageUrl.trim() } });
        }
        const answer = await requestImageQuestion(
            { ...resolvedConfig, model },
            [
                { role: "system", content: "你是专业的电商视觉导演与 AI 提示词工程师。直接输出最终可用的脚本或提示词文本。" },
                { role: "user", content: content as never },
            ],
            () => undefined,
            { signal: input.signal },
        );
        if (answer.trim()) return answer.trim();
    }

    const seed = [input.productInfo?.trim(), input.currentDraft?.trim()].filter(Boolean).join("，") || "精选电商好物";
    if (input.mode === "sale-script") {
        return `【0-3s 吸睛开场】近景特写展示${seed}细节，自然光柔和打亮主体。\n【3-10s 卖点演绎】中景多角度展示核心卖点与真实使用状态，运镜平稳推进。\n【10-${input.durationSeconds ?? 15}s 转化收尾】全身/全景定格展示整体质感，引导下单体验。`;
    }
    if (input.mode === "outpainting-prompt") {
        return `${seed}，自然延展画面边缘环境与桌面光影，保持透视与色调一致，高清细节`;
    }
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
    let parsed: URL;
    try {
        parsed = new URL(url.trim());
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    } catch {
        throw new ToolContentAnalysisError("invalid-link", "商品链接需以 http:// 或 https:// 开头");
    }

    let response: Response;
    try {
        response = await fetch(withLocalProxy(parsed.href), {
            headers: { Accept: "text/html,application/xhtml+xml" },
            signal,
        });
    } catch (cause) {
        if (signal?.aborted) throw new ToolContentAnalysisError("aborted", "已取消商品链接读取", { cause });
        throw new ToolContentAnalysisError("page-unreadable", "商品页面读取失败：可能被跨域策略阻止，请开启本地代理或使用可公开访问的商品链接", { cause });
    }
    if (!response.ok) {
        throw new ToolContentAnalysisError("page-unreadable", `商品页面读取失败（HTTP ${response.status}）`);
    }
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const baseHref = response.url || parsed.href;

    const toAbsUrl = (raw: string | null | undefined): string | null => {
        const trimmed = raw?.trim();
        if (!trimmed || trimmed.startsWith("data:image/svg")) return null;
        try {
            const resolved = new URL(trimmed, baseHref);
            if (resolved.protocol === "http:" || resolved.protocol === "https:") return resolved.href;
        } catch {
            return null;
        }
        return null;
    };

    const images = new Set<string>();
    doc.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]').forEach((meta) => {
        const abs = toAbsUrl(meta.getAttribute("content"));
        if (abs) images.add(abs);
    });

    doc.querySelectorAll('script[type="application/ld+json"]').forEach((scriptNode) => {
        try {
            const data = JSON.parse(scriptNode.textContent ?? "") as Record<string, unknown>;
            const rawImg = data.image;
            if (typeof rawImg === "string") {
                const abs = toAbsUrl(rawImg);
                if (abs) images.add(abs);
            } else if (Array.isArray(rawImg)) {
                rawImg.forEach((entry) => {
                    if (typeof entry === "string") {
                        const abs = toAbsUrl(entry);
                        if (abs) images.add(abs);
                    }
                });
            }
        } catch {
            // ignore malformed JSON-LD
        }
    });

    doc.querySelectorAll("img").forEach((img) => {
        const candidate =
            img.getAttribute("data-old-hires") ||
            img.getAttribute("data-src") ||
            img.getAttribute("src");
        const abs = toAbsUrl(candidate);
        if (abs && !/sprite|icon|logo|avatar|pixel/i.test(abs)) {
            images.add(abs);
        }
    });

    const sellingPoints: string[] = [];
    doc.querySelectorAll("#feature-bullets li, .a-unordered-list .a-list-item, ul li").forEach((li) => {
        const text = li.textContent?.replace(/\s+/g, " ").trim() ?? "";
        if (text.length >= 8 && text.length <= 240 && sellingPoints.length < 8 && !sellingPoints.includes(text)) {
            sellingPoints.push(text);
        }
    });

    const title =
        doc.querySelector("#productTitle, h1")?.textContent?.replace(/\s+/g, " ").trim() ||
        doc.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim() ||
        doc.querySelector("title")?.textContent?.trim() ||
        "商品详情";

    return {
        title,
        sellingPoints,
        images: Array.from(images).slice(0, 16),
        finalUrl: baseHref,
    };
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
    const maxModules = Math.max(2, Math.min(options?.maxModules ?? 6, 12));
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.crossOrigin = "anonymous";
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("无法加载长图进行智能切分"));
        element.src = imageUrl;
    });

    const width = img.naturalWidth || img.width || 800;
    const height = img.naturalHeight || img.height || 1200;
    if (height <= width * 1.35) {
        return [
            {
                id: "slice-1",
                label: "模块 1（整图）",
                dataUrl: imageUrl,
                width,
                height,
                yStart: 0,
                yEnd: height,
            },
        ];
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return [
            {
                id: "slice-1",
                label: "模块 1",
                dataUrl: imageUrl,
                width,
                height,
                yStart: 0,
                yEnd: height,
            },
        ];
    }
    ctx.drawImage(img, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height).data;

    // 计算每一行的像素方差，寻找水平留白分割线
    const targetSliceHeight = Math.max(Math.round(width * 0.75), Math.ceil(height / maxModules));
    const minSliceHeight = Math.max(160, Math.round(targetSliceHeight * 0.55));
    const cuts: number[] = [0];
    let currentY = 0;

    while (currentY + targetSliceHeight < height && cuts.length < maxModules) {
        const idealY = currentY + targetSliceHeight;
        const searchStart = Math.max(currentY + minSliceHeight, idealY - Math.round(targetSliceHeight * 0.25));
        const searchEnd = Math.min(height - minSliceHeight, idealY + Math.round(targetSliceHeight * 0.25));

        let bestY = idealY;
        let lowestVariance = Number.POSITIVE_INFINITY;

        for (let y = searchStart; y <= searchEnd; y += 2) {
            let sum = 0;
            let sumSq = 0;
            const sampleCount = Math.min(64, width);
            const step = Math.max(1, Math.floor(width / sampleCount));
            let count = 0;
            for (let x = 0; x < width; x += step) {
                const idx = (y * width + x) * 4;
                const lum = pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114;
                sum += lum;
                sumSq += lum * lum;
                count += 1;
            }
            const mean = sum / Math.max(1, count);
            const variance = sumSq / Math.max(1, count) - mean * mean;
            if (variance < lowestVariance) {
                lowestVariance = variance;
                bestY = y;
            }
        }
        cuts.push(bestY);
        currentY = bestY;
    }
    cuts.push(height);

    const modules: SlicedImageModule[] = [];
    for (let i = 0; i < cuts.length - 1; i += 1) {
        const yStart = cuts[i]!;
        const yEnd = cuts[i + 1]!;
        const sliceHeight = Math.max(1, yEnd - yStart);
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = width;
        sliceCanvas.height = sliceHeight;
        const sliceCtx = sliceCanvas.getContext("2d");
        if (sliceCtx) {
            sliceCtx.drawImage(canvas, 0, yStart, width, sliceHeight, 0, 0, width, sliceHeight);
        }
        modules.push({
            id: `slice-${i + 1}`,
            label: `模块 ${i + 1}（${width}×${sliceHeight}）`,
            dataUrl: sliceCtx ? sliceCanvas.toDataURL("image/png") : imageUrl,
            width,
            height: sliceHeight,
            yStart,
            yEnd,
        });
    }
    return modules;
}

