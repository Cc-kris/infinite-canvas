import { describe, expect, test } from "bun:test";

import type { BrowserToolInput, SubmitOptions } from "@/services/api/tools/gateway";
import type { ToolTask } from "@/services/api/tools/task-machine";

import {
    ORNAMENT_TEXT_EFFECT_LIMIT,
    ORNAMENT_TEXT_FONTS,
    ORNAMENT_TEXT_FONT_SIZE,
    ORNAMENT_TEXT_TEXT_LIMIT,
    ORNAMENT_TEXT_TOOL_ID,
    applyOrnamentTextLayout,
    buildOrnamentTextEffectLine,
    buildOrnamentTextPrompt,
    canRedoOrnamentTextLayout,
    canUndoOrnamentTextLayout,
    clampOrnamentTextFontSize,
    commitOrnamentTextLayout,
    createOrnamentTextHistory,
    createOrnamentTextSnapshot,
    createOrnamentTextValues,
    describeOrnamentTextDrift,
    normalizeOrnamentTextPosition,
    nudgeOrnamentTextLayout,
    ornamentTextFontLabel,
    ornamentTextFontStack,
    ornamentTextPositionLabel,
    readOrnamentTextValues,
    redoOrnamentTextLayout,
    undoOrnamentTextLayout,
    validateOrnamentTextState,
    type OrnamentTextValues,
} from "@/features/tools/registry/ornament-text";
import {
    OrnamentTextAdapterError,
    assertOrnamentTextInput,
    auditOrnamentTextFields,
    buildOrnamentTextFields,
    buildOrnamentTextInput,
    createOrnamentTextRequestId,
    ornamentTextPreviewNotice,
    ornamentTextResponseId,
    ornamentTextResultFromTask,
    ornamentTextResultNotice,
    retryOrnamentText,
    runOrnamentText,
    type OrnamentTextGatewayLike,
} from "@/features/tools/adapters/ornament-text";

const values = (patch: Partial<OrnamentTextValues> = {}) =>
    createOrnamentTextValues({
        text: "FOREVER",
        effect: "玫瑰金浮雕，边缘镶嵌碎钻",
        fontname: "serif",
        fontSize: 96,
        left: 20,
        right: 80,
        ...patch,
    });

const task = (patch: Partial<ToolTask> = {}): ToolTask =>
    ({
        id: "task-1",
        toolId: ORNAMENT_TEXT_TOOL_ID,
        clientOperationId: "op-1",
        status: "succeeded",
        prompt: "p",
        fingerprint: "fp",
        capability: "image",
        sourceAssetIds: [],
        configSnapshot: { capability: "image", model: "img-model", count: 1 },
        attempts: 1,
        pollCount: 1,
        transientFailures: 0,
        createdAt: 1,
        updatedAt: 2,
        result: { items: [{ id: "img-1", kind: "image", dataUrl: "data:image/png;base64,AAAA" }], receivedAt: 2 },
        ...patch,
    }) as ToolTask;

function fakeGateway(result: ToolTask = task()) {
    const submits: { input: BrowserToolInput; options?: SubmitOptions }[] = [];
    const retries: string[] = [];
    const gateway: OrnamentTextGatewayLike = {
        submit: async (input, options) => {
            submits.push({ input, options });
            return result;
        },
        waitForResult: async () => result,
        retry: async (taskId, input, options) => {
            retries.push(taskId);
            submits.push({ input, options });
            return result;
        },
    };
    return { gateway, submits, retries };
}

describe("页面契约：取值归一化", () => {
    test("左右定位夹紧到 0–100 且保留最小宽度", () => {
        expect(normalizeOrnamentTextPosition(-10, 40)).toEqual({ left: 0, right: 40 });
        expect(normalizeOrnamentTextPosition(60, 130)).toEqual({ left: 60, right: 100 });
        const collapsed = normalizeOrnamentTextPosition(50, 50);
        expect(collapsed.right - collapsed.left).toBeGreaterThanOrEqual(3);
        expect(normalizeOrnamentTextPosition(30, 30.04)).toEqual({ left: 30, right: 33 });
    });

    test("字号夹紧并保留 1 位小数，脏值不进入提交路径", () => {
        expect(clampOrnamentTextFontSize(0)).toBe(ORNAMENT_TEXT_FONT_SIZE.min);
        expect(clampOrnamentTextFontSize(9999)).toBe(ORNAMENT_TEXT_FONT_SIZE.max);
        expect(clampOrnamentTextFontSize(96.049)).toBe(96);
        expect(clampOrnamentTextFontSize(Number.NaN)).toBe(ORNAMENT_TEXT_FONT_SIZE.min);
    });

    test("草稿恢复容忍脏值：超长截断、非法字体回落、位置归一", () => {
        const restored = readOrnamentTextValues({
            text: "字".repeat(ORNAMENT_TEXT_TEXT_LIMIT + 20),
            effect: "e".repeat(ORNAMENT_TEXT_EFFECT_LIMIT + 20),
            fontname: "   ",
            fontSize: 10000,
            left: 90,
            right: 10,
        });
        expect(restored.text.length).toBe(ORNAMENT_TEXT_TEXT_LIMIT);
        expect(restored.effect.length).toBe(ORNAMENT_TEXT_EFFECT_LIMIT);
        expect(restored.fontname).toBe("serif");
        expect(restored.fontSize).toBe(ORNAMENT_TEXT_FONT_SIZE.max);
        expect(restored.left).toBeLessThan(restored.right);
        expect(readOrnamentTextValues(undefined).text).toBe("");
    });

    test("位置文案按中心点判定，字体栈未知值回落衬线", () => {
        expect(ornamentTextPositionLabel({ left: 5, right: 25 })).toBe("偏左");
        expect(ornamentTextPositionLabel({ left: 40, right: 60 })).toBe("居中");
        expect(ornamentTextPositionLabel({ left: 70, right: 90 })).toBe("偏右");
        expect(ornamentTextFontStack("display")).toContain("Impact");
        expect(ornamentTextFontStack("unknown-font")).toBe(ORNAMENT_TEXT_FONTS[0].cssStack);
        expect(ornamentTextFontLabel("unknown-font")).toContain("自定义");
        expect(ornamentTextPreviewNotice(values({ fontname: "unknown-font" }))).toContain("原样透传");
    });
});

describe("校验：阻断项必须点名且可执行", () => {
    test("五项必填/区间各自有独立错误码", () => {
        const codes = (patch: Partial<OrnamentTextValues>, modelReady = true) =>
            validateOrnamentTextState({ values: values(patch), modelReady }).map((issue) => issue.code);

        expect(codes({ text: "  " })).toContain("text-required");
        expect(codes({ text: "字".repeat(ORNAMENT_TEXT_TEXT_LIMIT + 1) })).toContain("text-too-long");
        expect(codes({ effect: "e".repeat(ORNAMENT_TEXT_EFFECT_LIMIT + 1) })).toContain("effect-too-long");
        expect(codes({ fontname: "" })).toContain("font-required");
        expect(codes({ fontname: "f".repeat(65) })).toContain("font-too-long");
        expect(codes({ fontSize: ORNAMENT_TEXT_FONT_SIZE.max + 1 })).toContain("font-size-range");
        expect(codes({ left: 60, right: 61 })).toContain("position-range");
        expect(codes({}, false)).toContain("model-missing");
    });

    test("合法配置没有任何阻断项", () => {
        expect(validateOrnamentTextState({ values: values(), modelReady: true })).toEqual([]);
    });
});

describe("提示词：每个参数都必须真的写进文案", () => {
    test("文字、字体、字号、左右定位、效果描述逐项出现", () => {
        const prompt = buildOrnamentTextPrompt(values({ text: "永 恒", fontname: "script", fontSize: 128, left: 12, right: 88 }));
        expect(prompt).toContain("永 恒");
        expect(prompt).toContain("script");
        expect(prompt).toContain("128");
        expect(prompt).toContain("12%");
        expect(prompt).toContain("88%");
        expect(prompt).toContain("玫瑰金浮雕，边缘镶嵌碎钻");
        expect(buildOrnamentTextEffectLine(values())).toContain("玫瑰金浮雕");
    });

    test("无效果描述时不编造效果，写明保持原材质", () => {
        const prompt = buildOrnamentTextPrompt(values({ effect: "  " }));
        expect(prompt).toContain("无额外效果描述");
        expect(buildOrnamentTextEffectLine(values({ effect: "" }))).toContain("保持原材质");
    });

    test("浮点抖动不会改变落进 prompt 的数字", () => {
        const prompt = buildOrnamentTextPrompt(values({ left: 18.000000000000004, right: 82.00000000000001, fontSize: 96.00000000000001 }));
        expect(prompt).toContain("18%");
        expect(prompt).toContain("82%");
        expect(prompt).toContain("字号：96。");
    });
});

describe("请求体：字段齐全、无未声明字段、无静默丢参", () => {
    test("fields 精确等于页面目录的 5 个字段", () => {
        const fields = buildOrnamentTextFields(values());
        expect(Object.keys(fields).sort()).toEqual(["fontSize", "fontname", "left", "prompt", "right"]);
        expect(fields.fontSize).toBe(96);
        expect(fields.prompt).toBe("FOREVER");
    });

    test("input 固定单张、无参考图、带 requestId", () => {
        const input = buildOrnamentTextInput({ values: values(), model: "ch:img", requestId: "req-1", revision: 3 });
        expect(input.toolId).toBe(ORNAMENT_TEXT_TOOL_ID);
        expect(input.count).toBe(1);
        expect(input.references).toEqual([]);
        expect(input.model).toBe("ch:img");
        expect((input.fields as Record<string, unknown>).requestId).toBe("req-1");
    });

    test("审计通过；一旦某参数没进 prompt 或字段被改写就点名", () => {
        const requestId = "req-1";
        const input = buildOrnamentTextInput({ values: values(), requestId });
        const ok = auditOrnamentTextFields(input.fields as Record<string, unknown>, values(), requestId, input.prompt ?? "");
        expect(ok.ok).toBe(true);
        expect(ok.issues).toEqual([]);
        expect(ok.promptCarries).toEqual({ text: true, fontname: true, fontSize: true, left: true, right: true, effect: true });

        // provider prompt 漏掉字体 → 点名 fontname（这是网关只送 prompt、不送 fields 的真实风险）
        const thinPrompt = "饰品文字效果图：文字内容「FOREVER」";
        const thinAudit = auditOrnamentTextFields(input.fields as Record<string, unknown>, values(), requestId, thinPrompt);
        expect(thinAudit.ok).toBe(false);
        expect(thinAudit.issues.some((issue) => issue.includes("fontname"))).toBe(true);
        expect(thinAudit.issues.some((issue) => issue.includes("left"))).toBe(true);

        const tamperedFont = { ...(input.fields as Record<string, unknown>), fontname: "sans-serif" };
        const audit = auditOrnamentTextFields(tamperedFont, values(), requestId, input.prompt ?? "");
        expect(audit.ok).toBe(false);
        expect(audit.issues.some((issue) => issue.includes("fontname"))).toBe(true);

        const extraField = { ...(input.fields as Record<string, unknown>), secret: 1 };
        expect(auditOrnamentTextFields(extraField, values(), requestId, input.prompt ?? "").issues.some((issue) => issue.includes("未声明字段"))).toBe(true);
    });

    test("守卫拦截：错工具、数量改写、带参考图、非法配置", () => {
        const requestId = "req-1";
        const input = buildOrnamentTextInput({ values: values(), requestId });
        expect(() => assertOrnamentTextInput({ ...input, toolId: "AI_TEXT" }, values(), requestId)).toThrow(OrnamentTextAdapterError);
        expect(() => assertOrnamentTextInput({ ...input, count: 2 }, values(), requestId)).toThrow(/单次只输出 1 张/);
        expect(() => assertOrnamentTextInput({ ...input, references: [{ id: "a", url: "https://x" }] as never }, values(), requestId)).toThrow(/不接收参考图/);
        expect(() => assertOrnamentTextInput({ ...input, fields: { ...(input.fields as Record<string, unknown>), left: 19 } }, values(), requestId)).toThrow(/字段 left/);
        expect(() => assertOrnamentTextInput({ ...input, prompt: "只有文字 FOREVER" }, values(), requestId)).toThrow(/fontname/);
        expect(() => assertOrnamentTextInput(input, values({ text: "  " }), requestId)).toThrow(/饰品文字内容/);
    });

    test("requestId 唯一且带前缀", () => {
        const a = createOrnamentTextRequestId();
        const b = createOrnamentTextRequestId();
        expect(a.startsWith("ornament-")).toBe(true);
        expect(a).not.toBe(b);
    });
});

describe("运行：真实网关端口，无假成功", () => {
    test("提交一次、带回 draftRevision、响应 id 只取真实值", async () => {
        const { gateway, submits } = fakeGateway(task({ upstreamTaskId: "up-7" }));
        const run = await runOrnamentText({ gateway, values: values(), model: "img-model", revision: 5, requestId: "req-9" });
        expect(submits).toHaveLength(1);
        expect(submits[0].options?.draftRevision).toBe(5);
        const fields = submits[0].input.fields as Record<string, unknown>;
        expect(fields.requestId).toBe("req-9");
        expect(submits[0].input.prompt).toContain("玫瑰金浮雕");
        expect(run.responseId).toBe("up-7");
        expect(ornamentTextResponseId(null)).toBe("");
        expect(run.snapshot.fingerprint).toContain(ORNAMENT_TEXT_TOOL_ID);
        expect(run.snapshot.revision).toBe(5);
    });

    test("非法配置在发请求前就抛错", async () => {
        const { gateway, submits } = fakeGateway();
        await expect(runOrnamentText({ gateway, values: values({ text: "" }) })).rejects.toThrow(/饰品文字内容/);
        await expect(runOrnamentText({ gateway, values: values(), modelReady: false })).rejects.toThrow(/图片模型/);
        expect(submits).toHaveLength(0);
    });

    test("重试复用同一 requestId；网关不支持重试时明确报错", async () => {
        const { gateway, retries, submits } = fakeGateway();
        const run = await retryOrnamentText({ gateway, values: values(), taskId: "task-1", requestId: "req-r" });
        expect(retries).toEqual(["task-1"]);
        expect((submits[0].input.fields as Record<string, unknown>).requestId).toBe("req-r");
        expect(run.requestId).toBe("req-r");

        const noRetry: OrnamentTextGatewayLike = { submit: async () => task(), waitForResult: async () => task() };
        await expect(retryOrnamentText({ gateway: noRetry, values: values(), taskId: "task-1" })).rejects.toThrow(/不支持按任务重试/);
    });
});

describe("结果：状态与漂移都不掩盖", () => {
    test("快照与当前配置不一致时点名漂移维度", () => {
        const snap = createOrnamentTextSnapshot(values(), 1, "req-1");
        const current = createOrnamentTextSnapshot(values({ fontname: "display", fontSize: 120 }), 2, "req-2");
        expect(describeOrnamentTextDrift(snap, current)).toBe("字体、字号");
        const result = ornamentTextResultFromTask(task(), snap, current);
        expect(result.stale).toBe(true);
        expect(result.drift).toBe("字体、字号");
        expect(ornamentTextResultNotice(result)).toContain("上一次快照");
    });

    test("各状态提示互不混淆，未知状态不误报失败", () => {
        const snap = createOrnamentTextSnapshot(values(), 1, "req-1");
        expect(ornamentTextResultNotice(ornamentTextResultFromTask(undefined, snap, snap))).toContain("尚无结果");
        expect(ornamentTextResultNotice(ornamentTextResultFromTask(task({ status: "unknown" }), snap, snap))).toContain("状态未知");
        expect(ornamentTextResultNotice(ornamentTextResultFromTask(task({ status: "running" }), snap, snap))).toContain("正在生成");
        expect(ornamentTextResultNotice(ornamentTextResultFromTask(task({ status: "failed", error: { code: "x", message: "模型拒绝", retryable: false, code2: undefined } as never }), snap, snap))).toContain("模型拒绝");
        expect(ornamentTextResultNotice(ornamentTextResultFromTask(task({ result: { items: [], receivedAt: 2 } }), snap, snap))).toContain("没有返回图片");
        expect(ornamentTextResultNotice(ornamentTextResultFromTask(task(), snap, snap))).toBe("");
        expect(ornamentTextResultFromTask(task(), snap, snap).images).toHaveLength(1);
    });
});

describe("布局历史：拖动/键盘可撤销重做", () => {
    test("提交同值不产生历史噪声；撤销重做闭环", () => {
        let history = createOrnamentTextHistory(values());
        expect(canUndoOrnamentTextLayout(history)).toBe(false);
        history = commitOrnamentTextLayout(history, { left: 20, right: 80, fontSize: 96 });
        expect(canUndoOrnamentTextLayout(history)).toBe(false);

        history = commitOrnamentTextLayout(history, { left: 30, right: 90, fontSize: 96 });
        expect(canUndoOrnamentTextLayout(history)).toBe(true);
        expect(history.present.left).toBe(30);

        history = undoOrnamentTextLayout(history);
        expect(history.present).toEqual({ left: 20, right: 80, fontSize: 96 });
        expect(canRedoOrnamentTextLayout(history)).toBe(true);

        history = redoOrnamentTextLayout(history);
        expect(history.present.left).toBe(30);
    });

    test("方向键平移保持宽度并夹在边界内", () => {
        const moved = nudgeOrnamentTextLayout({ left: 20, right: 80, fontSize: 96 }, 5);
        expect(moved).toEqual({ left: 25, right: 85, fontSize: 96 });
        const clamped = nudgeOrnamentTextLayout({ left: 20, right: 80, fontSize: 96 }, -50);
        expect(clamped.left).toBe(0);
        expect(clamped.right).toBe(60);
        const applied = applyOrnamentTextLayout(values(), { left: 5, right: 45, fontSize: 400 });
        expect(applied.fontSize).toBe(400);
        expect(applied.left).toBe(5);
    });
});

describe("工作区渲染（无网络、无假结果）", () => {
    test("首屏渲染出文字/预览/结果三块区域，空文字时提交禁用", async () => {
        const store = new Map<string, string>();
        Object.defineProperty(globalThis, "localStorage", {
            configurable: true,
            value: {
                getItem: (key: string) => store.get(key) ?? null,
                setItem: (key: string, value: string) => void store.set(key, value),
                removeItem: (key: string) => void store.delete(key),
                clear: () => store.clear(),
            },
        });
        const React = await import("react");
        const { renderToStaticMarkup } = await import("react-dom/server");
        const { MemoryRouter } = await import("react-router-dom");
        const { OrnamentTextWorkspace } = await import("@/components/tools/workspaces/text");
        const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(OrnamentTextWorkspace)));
        expect(html).toContain("饰品文字");
        expect(html).toContain("饰品文字内容");
        expect(html).toContain("字体与字号");
        expect(html).toContain("左右定位");
        expect(html).toContain("效果预览");
        expect(html).toContain("文字框列表");
        expect(html).toContain("生成饰品文字");
        // 未填文字 → 提交按钮必须禁用
        expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*生成饰品文字/);
        expect(html).toContain("预览字族");
    });
});
