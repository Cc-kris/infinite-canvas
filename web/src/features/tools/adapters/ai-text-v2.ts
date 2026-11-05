/**
 * AI_TEXT（POD素材）真实 provider 适配器（对齐 rea 还原的原站提交体）。
 * 简易/高阶模式走文生图；相似裂变把选中的结果/案例图作参考图走图生图。
 */
import type { BrowserToolInput } from "@/services/api/tools/gateway";
import type { ReferenceImage } from "@/types/image";

import {
    AI_TEXT_TOOL_ID,
    activeAiTextPrompt,
    aiTextStylesCn,
    aiTextTemplate,
    buildAiTextExtendFields,
    buildAiTextProviderPrompt,
    validateAiTextValues,
    type AiTextSimilarValues,
    type AiTextValues,
} from "@/features/tools/registry/ai-text-v2";

export class AiTextV2Error extends Error {
    constructor(readonly code: string, message: string) {
        super(message);
        this.name = "AiTextV2Error";
    }
}

export function buildAiTextModeInput(values: AiTextValues, model?: string): BrowserToolInput {
    const error = validateAiTextValues(values);
    if (error) throw new AiTextV2Error("prompt-required", error);
    const simple = values.mode === "SIMPLE";
    const prompt = activeAiTextPrompt(values);
    return {
        toolId: AI_TEXT_TOOL_ID,
        prompt: buildAiTextProviderPrompt({
            mode: values.mode,
            prompt,
            templatePrompt: simple ? aiTextTemplate(values.templateId).prompt : undefined,
            styles: simple ? [] : values.styles,
            autoprompt: simple ? values.simpleAutoprompt : values.advancedAutoprompt,
        }),
        model: model?.trim() || undefined,
        size: simple ? values.simpleRatio : values.advancedRatio,
        count: values.outputNum,
        references: [],
        fields: { prompt, outputNum: values.outputNum, ...buildAiTextExtendFields(values) },
    };
}

export function buildAiTextSimilarInput(values: AiTextSimilarValues, reference: ReferenceImage, model?: string): BrowserToolInput {
    if (!values.prompt.trim()) throw new AiTextV2Error("prompt-required", "请输入文字内容和创意方向");
    return {
        toolId: AI_TEXT_TOOL_ID,
        prompt: buildAiTextProviderPrompt({ mode: "SIMILAR", prompt: values.prompt, styles: values.styles, autoprompt: values.autoprompt, variationStrength: values.variationStrength }),
        model: model?.trim() || undefined,
        size: values.ratio,
        count: values.outputNum,
        references: [reference],
        fields: {
            prompt: values.prompt.trim(),
            outputNum: values.outputNum,
            imageUrl: values.imageUrl,
            mode: "SIMILAR",
            ratio: values.ratio,
            styles: [...values.styles],
            stylesCn: aiTextStylesCn(values.styles),
            useAutopromptOption: values.autoprompt,
            variationStrength: String(values.variationStrength),
        },
    };
}

/** 参考图：同源图片（案例 / 结果 blob / dataURL）读成 dataURL。 */
export async function aiTextReferenceFromUrl(url: string, name = "reference.png"): Promise<ReferenceImage> {
    const response = await fetch(url);
    if (!response.ok) throw new AiTextV2Error("reference-fetch", `参考图读取失败（${response.status}）`);
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
    return { id: `ai-text-ref-${Date.now().toString(36)}`, name, type: blob.type || "image/png", dataUrl };
}
