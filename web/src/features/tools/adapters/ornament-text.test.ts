import { describe, expect, test } from "bun:test";

import {
    ORNAMENT_TEXT_FONTS,
    ORNAMENT_TEXT_TOOL_ID,
    buildOrnamentTextPrompt,
    clampOrnamentTextFontSize,
    createOrnamentTextValues,
    ornamentTextRingFlags,
    parseOrnamentTextPrompt,
    readOrnamentTextValues,
    sanitizeOrnamentText,
    validateOrnamentTextState,
} from "@/features/tools/registry/ornament-text";
import { buildOrnamentTextFields, buildOrnamentTextInput, ornamentTextResultFromTask, runOrnamentText, type OrnamentTextGatewayLike } from "@/features/tools/adapters/ornament-text";
import type { ToolTask } from "@/services/api/tools/task-machine";

const fontRef = { id: "ref", name: "Shelby.png", type: "image/png", dataUrl: "data:image/png;base64,AA==" };

describe("饰品文字契约（对齐 rea 还原的原站 chunk）", () => {
    test("默认值：第一款字体、10pt、两边加环", () => {
        expect(createOrnamentTextValues()).toEqual({ text: "", fontname: "Shelby", fontSize: 10, ring: "both" });
        expect(ORNAMENT_TEXT_FONTS).toHaveLength(30);
    });

    test("文字只保留英文字母，最多 50 个", () => {
        expect(sanitizeOrnamentText("I love 你 2024!")).toBe("Ilove");
        expect(sanitizeOrnamentText("a".repeat(80))).toHaveLength(50);
    });

    test("字号 1–200 取整", () => {
        expect(clampOrnamentTextFontSize(0)).toBe(1);
        expect(clampOrnamentTextFontSize(999)).toBe(200);
        expect(clampOrnamentTextFontSize(12.7)).toBe(12);
    });

    test("挂环位置映射为原站 left/right 布尔", () => {
        expect(ornamentTextRingFlags("both")).toEqual({ left: true, right: true });
        expect(ornamentTextRingFlags("left")).toEqual({ left: true, right: false });
        expect(ornamentTextRingFlags("right")).toEqual({ left: false, right: true });
        expect(ornamentTextRingFlags("none")).toEqual({ left: false, right: false });
    });

    test("草稿脏值收敛：未知字体回落、非法挂环回落", () => {
        expect(readOrnamentTextValues({ text: "abc 1", fontname: "Nope", fontSize: "x", ring: "top" })).toEqual({ text: "abc", fontname: "Shelby", fontSize: 10, ring: "both" });
    });

    test("空文字阻断提交，文案与原站一致", () => {
        expect(validateOrnamentTextState({ values: createOrnamentTextValues() })[0]?.message).toBe("请输入想要生成的文字内容");
    });

    test("提交字段与原站 extendFields 一致，字体预览作为参考图", () => {
        const values = createOrnamentTextValues({ text: "jewelry", fontname: "Aurum", fontSize: 24, ring: "left" });
        expect(buildOrnamentTextFields(values)).toEqual({ prompt: "jewelry", fontname: "Aurum", fontSize: 24, left: true, right: false });
        const input = buildOrnamentTextInput({ values, requestId: "r1", fontReference: fontRef });
        expect(input.toolId).toBe(ORNAMENT_TEXT_TOOL_ID);
        expect(input.references).toEqual([fontRef]);
        expect(input.prompt).toContain('"jewelry"');
        expect(input.prompt).toContain('"Aurum" typeface');
    });

    test("prompt 可反解回参数（再次编辑）", () => {
        for (const ring of ["both", "left", "right", "none"] as const) {
            const values = createOrnamentTextValues({ text: "Mia", fontname: "Caitlyn", fontSize: 33, ring });
            expect(parseOrnamentTextPrompt(buildOrnamentTextPrompt(values))).toEqual(values);
        }
        expect(parseOrnamentTextPrompt("random")).toBeNull();
    });

    test("runOrnamentText 走网关提交并带上字体参考图", async () => {
        let submitted: unknown;
        const task = { id: "t1", status: "succeeded", result: { items: [{ kind: "image", url: "https://x/1.png" }] } } as unknown as ToolTask;
        const gateway: OrnamentTextGatewayLike = {
            submit: async (input) => ((submitted = input), task),
            waitForResult: async () => task,
        };
        const values = createOrnamentTextValues({ text: "Love" });
        const run = await runOrnamentText({ gateway, values, loadFontReference: async () => fontRef });
        expect((submitted as { references: unknown[] }).references).toHaveLength(1);
        expect(run.task.id).toBe("t1");
        const result = ornamentTextResultFromTask(task, values, { ...values, ring: "none" });
        expect(result.stale).toBe(true);
        expect(result.drift).toBe("挂环位置");
        expect(result.images).toHaveLength(1);
    });

    test("空文字不发请求", async () => {
        let called = false;
        const gateway: OrnamentTextGatewayLike = { submit: async () => ((called = true), {} as ToolTask), waitForResult: async () => ({}) as ToolTask };
        await expect(runOrnamentText({ gateway, values: createOrnamentTextValues(), loadFontReference: async () => fontRef })).rejects.toThrow("请输入想要生成的文字内容");
        expect(called).toBe(false);
    });
});
