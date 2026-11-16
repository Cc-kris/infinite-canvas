/** 图片文字识别与翻译：复用已配置的视觉文本模型，返回归一化文字区域。 */
import { imageToDataUrl } from "@/services/image-storage";
import { resolveModelRequestConfig, useConfigStore } from "@/stores/use-config-store";
import { requestImageQuestion, type AiTextMessage } from "@/services/api/image";

export type RecognizedTextRegion = {
    sourceText: string;
    translatedText?: string;
    /** 相对图片宽高的归一化坐标（0-1，左上角原点）。 */
    x: number;
    y: number;
    width: number;
    height: number;
    textColor?: string;
};

export type ImageTextRecognition = {
    regions: RecognizedTextRegion[];
    detectedLanguage?: string;
};

const clamp01 = (value: unknown) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
};

function parseRegions(raw: string): ImageTextRecognition {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    let parsed: unknown;
    try {
        parsed = JSON.parse(cleaned);
    } catch {
        throw new Error("模型未返回可解析的文字区域，请重试");
    }
    const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const list = Array.isArray(parsed) ? parsed : Array.isArray(record.regions) ? record.regions : [];
    const regions = list
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item) => ({
            sourceText: String(item.sourceText ?? "").trim(),
            translatedText: String(item.translatedText ?? "").trim() || undefined,
            x: clamp01(item.x),
            y: clamp01(item.y),
            width: clamp01(item.width),
            height: clamp01(item.height),
            textColor: /^#[0-9a-f]{6}$/i.test(String(item.textColor ?? "")) ? String(item.textColor) : undefined,
        }))
        .filter((region) => region.sourceText && region.width > 0 && region.height > 0);
    return { regions, detectedLanguage: typeof record.detectedLanguage === "string" ? record.detectedLanguage : undefined };
}

export async function recognizeAndTranslateImageText(input: {
    imageUrl: string;
    sourceLanguage?: string;
    targetLanguage?: string;
    signal?: AbortSignal;
}): Promise<ImageTextRecognition> {
    const config = useConfigStore.getState().config;
    const model = (config.textModel || config.model || "").trim();
    const requestConfig = resolveModelRequestConfig(config, model);
    if (!model || !requestConfig.baseUrl.trim() || !requestConfig.apiKey.trim()) {
        throw new Error("请先在模型设置中配置可访问的视觉文本模型（含接口地址与 API Key）");
    }
    const imageUrl = /^(data:|https?:)/i.test(input.imageUrl) ? input.imageUrl : await imageToDataUrl({ url: input.imageUrl });
    if (!imageUrl) throw new Error("无法读取源图，请重新上传");

    const source = input.sourceLanguage && input.sourceLanguage !== "auto" ? input.sourceLanguage : "自动识别";
    const target = input.targetLanguage || "zh-CN";
    const content: Exclude<AiTextMessage["content"], string> = [
        {
            type: "text",
            text: `识别图中所有可编辑文字，逐条翻译为 ${target}（源语言：${source}）。只输出严格 JSON 对象，不要代码块或解释：\n{"detectedLanguage":"源语言","regions":[{"sourceText":"原文","translatedText":"译文","x":0.1,"y":0.2,"width":0.3,"height":0.05,"textColor":"#111111"}]}\n坐标使用相对图片宽高的 0-1 比例，左上角为原点；textColor 为文字主色的十六进制值。没有文字时返回 {"regions":[]}。`,
        },
        { type: "image_url", image_url: { url: imageUrl } },
    ];
    const raw = await requestImageQuestion(
        requestConfig,
        [
            { role: "system", content: "你是图片文字识别与翻译引擎。只依据图片中真实可见的文字输出结果，不补写、不猜测。" },
            { role: "user", content },
        ],
        () => {},
        { signal: input.signal },
    );
    return parseRegions(raw);
}
