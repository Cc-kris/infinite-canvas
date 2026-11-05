import { describe, expect, test } from "bun:test";

import { AI_TEXT_CASES, AI_TEXT_RATIOS, AI_TEXT_STYLES, AI_TEXT_TEMPLATES, createAiTextValues, readAiTextValues, validateAiTextValues } from "@/features/tools/registry/ai-text-v2";
import { buildAiTextModeInput, buildAiTextSimilarInput } from "@/features/tools/adapters/ai-text-v2";

const ref = { id: "r", name: "r.png", type: "image/png", dataUrl: "data:image/png;base64,AA==" };

describe("POD素材契约（对齐 rea 还原的原站 AiText chunk）", () => {
    test("原站目录：15 个模板、18 个风格、9 个比例、24 条案例", () => {
        expect(AI_TEXT_TEMPLATES).toHaveLength(15);
        expect(AI_TEXT_STYLES).toHaveLength(18);
        expect(AI_TEXT_RATIOS.map((r) => r.value)).toEqual(["1:1", "9:16", "16:9", "10:16", "16:10", "2:3", "3:2", "3:4", "4:3"]);
        expect(AI_TEXT_CASES).toHaveLength(24);
        expect(AI_TEXT_TEMPLATES.every((t) => t.prompt.includes("##TEXT##"))).toBe(true);
    });

    test("默认简易模式、首个模板、1:1、4 张", () => {
        const values = createAiTextValues();
        expect(values.mode).toBe("SIMPLE");
        expect(values.templateId).toBe(AI_TEXT_TEMPLATES[0].id);
        expect(values.outputNum).toBe(4);
        expect(validateAiTextValues(values)).toBe("请输入文字内容和创意方向");
    });

    test("简易模式：模板 prompt 替换 ##TEXT##，文生图不带参考图", () => {
        const input = buildAiTextModeInput(createAiTextValues({ simplePrompt: "I love you", simpleRatio: "9:16" }));
        expect(input.references).toEqual([]);
        expect(input.size).toBe("9:16");
        expect(input.count).toBe(4);
        expect(input.prompt).toContain('a vector type Text "I love you"');
        expect(input.fields).toMatchObject({ mode: "SIMPLE", modelId: AI_TEXT_TEMPLATES[0].id, modelName: AI_TEXT_TEMPLATES[0].style, ratio: "9:16", useAutopromptOption: "AUTO", prompt: "I love you", outputNum: 4 });
    });

    test("高阶模式：多选风格写进 prompt 与 styles/stylesCn", () => {
        const input = buildAiTextModeInput(createAiTextValues({ mode: "ADVANCED", advancedPrompt: '"Hi" in shape of heart', styles: ["poster", "anime"], advancedAutoprompt: "OFF" }));
        expect(input.prompt).toContain("Style: poster, anime.");
        expect(input.fields).toMatchObject({ mode: "ADVANCED", styles: ["poster", "anime"], stylesCn: ["海报", "日漫"], useAutopromptOption: "OFF" });
    });

    test("相似裂变：带参考图，相似度按原站字符串提交", () => {
        const input = buildAiTextSimilarInput({ imageUrl: "/__cases/ai-text/cases/3503.webp", prompt: "LOVE", ratio: "10:16", styles: [], variationStrength: 75, autoprompt: "AUTO", outputNum: 4 }, ref);
        expect(input.references).toEqual([ref]);
        expect(input.fields).toMatchObject({ mode: "SIMILAR", variationStrength: "75", imageUrl: "/__cases/ai-text/cases/3503.webp" });
        expect(input.prompt).toContain("非常相似");
    });

    test("草稿脏值收敛", () => {
        expect(readAiTextValues({ mode: "X", styles: ["poster", "nope"], simpleRatio: "5:5", outputNum: 9 })).toMatchObject({ mode: "SIMPLE", styles: ["poster"], simpleRatio: "1:1", outputNum: 4 });
    });

    test("空文字不构建请求", () => {
        expect(() => buildAiTextModeInput(createAiTextValues())).toThrow("请输入文字内容和创意方向");
    });
});
