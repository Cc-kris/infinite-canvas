import { describe, expect, test } from "bun:test";

import type { ToolTask } from "@/services/api/tools/task-machine";

import {
    AI_TEXT_MODE_CATALOG,
    AI_TEXT_RATIO_CATALOG,
    AI_TEXT_SIMPLE_PROMPT_LIMIT,
    AI_TEXT_STYLE_CATALOG,
    AI_TEXT_TOOL_ID,
    aiTextFingerprint,
    aiTextPageCatalogDimensions,
    aiTextStyleLabelCn,
    aiTextTilingFlag,
    AI_TEXT_CATALOG_NOTICE,
    aiTextTilingPreset,
    aiTextTilingPromptLine,
    buildAiTextAutoPrompt,
    buildAiTextPrompt,
    canRedoAiTextPlacement,
    canUndoAiTextPlacement,
    clampAiTextOutputNum,
    clampAiTextPlacement,
    commitAiTextPlacement,
    createAiTextPlacementHistory,
    createAiTextSnapshot,
    createAiTextValues,
    describeAiTextDrift,
    effectiveAiTextPrompt,
    inheritAiTextCase,
    isAiTextAutopromptActive,
    moveAiTextPlacement,
    readAiTextValues,
    redoAiTextPlacement,
    resolveAiTextCatalog,
    scaleAiTextPlacement,
    serializeAiTextValues,
    undoAiTextPlacement,
    validateAiTextState,
    type AiTextValues,
} from "@/features/tools/registry/ai-text";
import {
    AiTextAdapterError,
    aiTextResponseId,
    aiTextResultFromTask,
    aiTextResultNotice,
    assertAiTextInput,
    auditAiTextFields,
    buildAiTextFields,
    buildAiTextInput,
    createAiTextRequestId,
    isAiTextSourceReady,
    retryAiText,
    runAiText,
    validateAiTextSource,
    type AiTextSourceAsset,
} from "@/features/tools/adapters/ai-text";

const values = (patch: Partial<AiTextValues> = {}): AiTextValues =>
    createAiTextValues({
        mode: "pattern",
        editor: "simple",
        aiSimpleTextPrompt: "夏日橘子汽水",
        styles: "vintage",
        stylesCn: "复古",
        tilingPresetId: "grid-2x2",
        ratio: "1:1",
        outputNum: 2,
        sourceAssetId: "asset-1",
        ...patch,
    });

const source = (patch: Partial<AiTextSourceAsset> = {}): AiTextSourceAsset => ({
    assetId: "asset-1",
    dataUrl: "data:image/png;base64,AAAA",
    name: "pod.png",
    mimeType: "image/png",
    bytes: 120_000,
    width: 1200,
    height: 1200,
    ...patch,
});

const task = (patch: Partial<ToolTask> = {}): ToolTask =>
    ({
        id: "task-1",
        toolId: AI_TEXT_TOOL_ID,
        clientOperationId: "op-1",
        status: "succeeded",
        prompt: "p",
        fingerprint: "fp",
        capability: "image",
        sourceAssetIds: ["asset-1"],
        configSnapshot: { capability: "image", model: "img-model", count: 2 },
        attempts: 1,
        pollCount: 1,
        transientFailures: 0,
        createdAt: 1,
        updatedAt: 2,
        result: { items: [], receivedAt: 2 },
        ...patch,
    }) as ToolTask;

const OK_OPTIONS = {
    mode: AI_TEXT_MODE_CATALOG,
    ratio: AI_TEXT_RATIO_CATALOG,
    styles: AI_TEXT_STYLE_CATALOG,
    stylesCn: AI_TEXT_STYLE_CATALOG.map((entry) => ({ id: entry.labelCn, label: entry.labelCn })),
};

const runOptions = { sourceReady: true, modelReady: true, options: OK_OPTIONS } as const;

describe("目录与证据标记", () => {
    test("provider 目录缺失时回落到页面目录，且能点出仍在用页面目录的维度", () => {
        const catalog = resolveAiTextCatalog({});
        expect(catalog.modes.map((item) => item.id)).toContain("pattern");
        expect(catalog.ratios.map((item) => item.id)).toContain("1:1");
        expect(catalog.styles.map((item) => item.id)).toContain("vintage");
        expect(aiTextPageCatalogDimensions({})).toEqual(["模式", "比例", "风格", "中文风格"]);
        expect(aiTextPageCatalogDimensions({ mode: ["custom"], ratio: ["7:3"] })).toEqual(["风格", "中文风格"]);
    });

    test("provider 目录一旦下发就覆盖同名维度，不再回落", () => {
        const catalog = resolveAiTextCatalog({ mode: [{ id: "x", label: "X 模式" }], ratio: ["5:2"] });
        expect(catalog.modes).toEqual([{ id: "x", label: "X 模式" }]);
        expect(catalog.ratios).toEqual([{ id: "5:2", label: "5:2" }]);
        expect(catalog.modes.map((item) => item.id)).not.toContain("pattern");
    });

    test("英文风格与中文风格同源联动", () => {
        expect(aiTextStyleLabelCn("vintage")).toBe("复古");
        expect(aiTextStyleLabelCn("not-exist")).toBe("");
    });
});

describe("校验：缺图 / 缺模型 / 枚举越界 / 提示词", () => {
    test("完整配置无阻断项", () => {
        expect(validateAiTextState({ values: values(), ...runOptions })).toEqual([]);
    });

    test("缺底图、缺模型各自阻塞", () => {
        const codes = validateAiTextState({ values: values(), sourceReady: false, modelReady: false, options: OK_OPTIONS }).map((issue) => issue.code);
        expect(codes).toContain("source-required");
        expect(codes).toContain("model-missing");
    });

    test("目录为空时回落到页面目录，不产生未知枚举误报", () => {
        const codes = validateAiTextState({ values: values(), sourceReady: true, modelReady: true, options: {} }).map((issue) => issue.code);
        expect(codes).toEqual([]);
        expect(AI_TEXT_CATALOG_NOTICE).toContain("页面目录");
        // 目录下发了别的内容时，页面目录不再兜底，未知枚举必须被点名
        expect(validateAiTextState({ values: values(), sourceReady: true, modelReady: true, options: { mode: ["custom"] } }).map((i) => i.code)).toContain("mode-unknown");
    });

    test("越界枚举被点名", () => {
        const codes = validateAiTextState({ values: values({ mode: "plant", ratio: "7:3", styles: "cyber" }), ...runOptions }).map((issue) => issue.code);
        expect(codes).toContain("mode-unknown");
        expect(codes).toContain("ratio-unknown");
        expect(codes).toContain("styles-unknown");
    });

    test("简易模式必须有文案；完整模式必须有提示词；自动扩写时要求简短描述", () => {
        expect(validateAiTextState({ values: values({ aiSimpleTextPrompt: "  " }), ...runOptions }).map((i) => i.code)).toContain("simple-prompt-required");
        expect(validateAiTextState({ values: values({ editor: "full", prompt: "" }), ...runOptions }).map((i) => i.code)).toContain("prompt-required");
        expect(
            validateAiTextState({ values: values({ editor: "full", prompt: "x", useAutopromptOption: true, aiSimpleTextPrompt: "" }), ...runOptions }).map((i) => i.code),
        ).toContain("simple-prompt-required");
    });

    test("长度与数量区间按真实边界拦截", () => {
        expect(clampAiTextOutputNum(0)).toBe(1);
        expect(clampAiTextOutputNum(99)).toBe(15);
        const tooLong = "字".repeat(AI_TEXT_SIMPLE_PROMPT_LIMIT + 1);
        const codes = validateAiTextState({ values: values({ aiSimpleTextPrompt: tooLong, outputNum: 16 }), ...runOptions }).map((i) => i.code);
        expect(codes).toContain("simple-prompt-too-long");
        expect(codes).toContain("output-range");
    });
});

describe("提示词：每一项配置都必须真的写进文案", () => {
    test("平铺预设与 provider 布尔位一致", () => {
        expect(aiTextTilingFlag("single")).toBe(false);
        expect(aiTextTilingFlag("grid-2x2")).toBe(true);
        expect(aiTextTilingFlag("nope")).toBe(false);
        expect(aiTextTilingPreset("half-drop-2x2").stagger).toBe(true);
        expect(aiTextTilingPromptLine("half-drop-2x2")).toContain("隔行错半格");
    });

    test("简易模式提示词包含模式、比例、数量、平铺、文案与风格", () => {
        const prompt = buildAiTextPrompt(values());
        expect(prompt).toContain("模式 pattern");
        expect(prompt).toContain("比例 1:1");
        expect(prompt).toContain("输出 2 张");
        expect(prompt).toContain(aiTextTilingPromptLine("grid-2x2"));
        expect(prompt).toContain("夏日橘子汽水");
        expect(prompt).toContain("复古");
        expect(prompt).toContain("vintage");
    });

    test("变化强度文案随开关切换", () => {
        expect(buildAiTextPrompt(values({ variationStrength: true }))).toContain("变化强度：偏高");
        expect(buildAiTextPrompt(values())).toContain("变化强度：默认");
    });

    test("自动扩写：本地生成、可预览、解锁后生效对象切换", () => {
        const auto = values({ useAutopromptOption: true });
        expect(isAiTextAutopromptActive(auto)).toBe(true);
        const expanded = buildAiTextAutoPrompt(auto);
        expect(expanded).toContain("夏日橘子汽水");
        expect(effectiveAiTextPrompt(auto)).toBe(expanded);

        const unlocked = values({ useAutopromptOption: true, autopromptUnlocked: true, editor: "full", prompt: "手写提示词" });
        expect(isAiTextAutopromptActive(unlocked)).toBe(false);
        expect(effectiveAiTextPrompt(unlocked)).toContain("手写提示词");
    });
});

describe("请求组装与防丢参", () => {
    test("布尔位显式写入、空文本字段不发送、count 与 outputNum 同源", () => {
        const v = values();
        const input = buildAiTextInput({ values: v, source: source(), model: "img-model", requestId: "req-1" });
        expect(input.toolId).toBe(AI_TEXT_TOOL_ID);
        expect(input.count).toBe(2);
        expect(input.model).toBe("img-model");
        expect(input.fields).toMatchObject({
            mode: "pattern",
            ratio: "1:1",
            outputNum: 2,
            tilingPreset: true,
            useAutopromptOption: false,
            variationStrength: false,
            isCase: false,
            requestId: "req-1",
            aiSimpleTextPrompt: "夏日橘子汽水",
        });
        expect(input.references?.[0]).toMatchObject({ id: "asset-1" });
        expect(() => assertAiTextInput(input, v, "req-1")).not.toThrow();
    });

    test("未填的风格/文案不产生空串字段", () => {
        const fields = buildAiTextFields(values({ styles: " ", stylesCn: "" }), { source: source(), requestId: "r" });
        expect(fields.styles).toBeUndefined();
        expect(fields.stylesCn).toBeUndefined();
        const full = buildAiTextFields(values({ editor: "full", prompt: "only prompt", aiSimpleTextPrompt: "" }), { source: source(), requestId: "r" });
        expect(full.aiSimpleTextPrompt).toBeUndefined();
    });

    test("audit 能点出丢字段 / 改值 / 多字段", () => {
        const v = values();
        const fields = buildAiTextFields(v, { source: source(), requestId: "req-1" });
        expect(auditAiTextFields(fields, v, "req-1").ok).toBe(true);

        const dropped = { ...fields } as Record<string, unknown>;
        delete dropped.tilingPreset;
        const droppedAudit = auditAiTextFields(dropped, v, "req-1");
        expect(droppedAudit.ok).toBe(false);
        expect(droppedAudit.missing).toContain("tilingPreset");

        expect(auditAiTextFields({ ...fields, outputNum: 3 }, v, "req-1").mismatched).toContain("outputNum");
        expect(auditAiTextFields({ ...fields, mystery: 1 }, v, "req-1").unexpected).toContain("mystery");
    });

    test("守卫在发请求前拦住：缺图、丢平铺、丢数量、丢文案", () => {
        const v = values();
        const input = buildAiTextInput({ values: v, source: source(), requestId: "req-1" });
        expect(() => assertAiTextInput({ ...input, references: [] }, v, "req-1")).toThrow(/缺少参考图/);
        expect(() => assertAiTextInput({ ...input, prompt: "no tiling" }, v, "req-1")).toThrow(/平铺规则未进入提示词/);
        expect(() => assertAiTextInput({ ...input, count: 1 }, v, "req-1")).toThrow(/输出数量未进入请求/);
        expect(() => assertAiTextInput({ ...input, prompt: buildAiTextPrompt(v).replace("夏日橘子汽水", "别的") }, v, "req-1")).toThrow(/文字内容未进入提示词/);
        expect(() => assertAiTextInput(input, v, "req-2")).toThrow(/字段不一致/);
    });

    test("源图约束：格式 / 体积 / 边长", () => {
        expect(isAiTextSourceReady(source())).toBe(true);
        expect(isAiTextSourceReady({ assetId: "a" })).toBe(false);
        expect(validateAiTextSource(source({ mimeType: "image/gif" })).ok).toBe(false);
        expect(validateAiTextSource(source({ bytes: 21 * 1024 * 1024 })).ok).toBe(false);
        expect(validateAiTextSource(source({ width: 9000, height: 9000 })).ok).toBe(false);
        expect(validateAiTextSource(source({ width: 32, height: 32 })).ok).toBe(false);
        expect(validateAiTextSource(source({ mimeType: "image/webp" })).ok).toBe(true);
    });

    test("requestId 稳定唯一且可复现", () => {
        expect(createAiTextRequestId(1, 0)).toBe(createAiTextRequestId(1, 0));
        expect(createAiTextRequestId(1, 0)).not.toBe(createAiTextRequestId(1, 0.5));
        expect(createAiTextRequestId(1, 0).startsWith("pod-")).toBe(true);
    });
});

describe("快照：指纹、漂移、草稿", () => {
    test("指纹随每个真实参数变化", () => {
        const base = createAiTextSnapshot(values(), { assetId: "asset-1" }, 1, "req-1");
        const changed = createAiTextSnapshot(values({ tilingPresetId: "grid-3x3" }), { assetId: "asset-1" }, 1, "req-1");
        expect(base.fingerprint).not.toBe(changed.fingerprint);
        expect(base.tilingPreset).toBe(true);
        expect(base.prompt).toBe(buildAiTextPrompt(values()));
        expect(aiTextFingerprint({ ...base, fingerprint: undefined } as never)).toBe(base.fingerprint);
    });

    test("漂移原因逐项可读", () => {
        const before = createAiTextSnapshot(values(), { assetId: "asset-1" }, 1, "req-1");
        const after = createAiTextSnapshot(values({ styles: "minimal", outputNum: 3, ratio: "4:5" }), { assetId: "asset-2" }, 1, "req-1");
        expect(describeAiTextDrift(before, after)).toBe("参考图、风格、输出比例、输出数量、提示词内容");
        expect(describeAiTextDrift(before, undefined)).toBe("");
    });

    test("草稿回落：非法枚举与超界数量被夹回，序列化不含二进制", () => {
        const restored = readAiTextValues({
            mode: "pattern",
            editor: "full",
            tilingPresetId: "weird",
            outputNum: "42",
            aiSimpleTextPrompt: "字".repeat(999),
        });
        expect(restored.tilingPresetId).toBe("single");
        expect(restored.outputNum).toBe(15);
        expect(restored.editor).toBe("full");
        expect(restored.aiSimpleTextPrompt.length).toBe(AI_TEXT_SIMPLE_PROMPT_LIMIT);
        // editor 不在枚举内 → 整包脏草稿丢弃，回到默认值（不半信半疑地沿用）
        const thrown = readAiTextValues({ mode: "pattern", editor: "nope" });
        expect(thrown.mode).toBe("");
        expect(thrown.editor).toBe("simple");
        const serialized = serializeAiTextValues(values());
        expect(serialized).not.toHaveProperty("dataUrl");
        expect(readAiTextValues(serialized)).toMatchObject({ mode: "pattern", tilingPresetId: "grid-2x2", outputNum: 2 });
    });

    test("案例变体：继承配置但不继承文案，且必须新建任务", () => {
        const derived = inheritAiTextCase(values({ outputNum: 4, isCase: false }));
        expect(derived.isCase).toBe(true);
        expect(derived.aiSimpleTextPrompt).toBe("");
        expect(derived.prompt).toBe("");
        expect(derived.outputNum).toBe(1);
        expect(derived.styles).toBe("vintage");
        expect(derived.tilingPresetId).toBe("grid-2x2");
    });
});

describe("平铺预览：落位与撤销重做", () => {
    test("越界坐标与缩放被夹住", () => {
        expect(clampAiTextPlacement({ x: -1, y: 2, scale: 9 })).toEqual({ x: 0, y: 1, scale: 1.4 });
        expect(moveAiTextPlacement({ x: 0.5, y: 0.5, scale: 1 }, -1, 0).x).toBe(0);
        expect(scaleAiTextPlacement({ x: 0.5, y: 0.5, scale: 0.4 }, -1).scale).toBe(0.4);
    });

    test("提交/撤销/重做保持历史一致", () => {
        let history = createAiTextPlacementHistory();
        expect(canUndoAiTextPlacement(history)).toBe(false);
        history = commitAiTextPlacement(history, { x: 0.2, y: 0.3, scale: 1 });
        history = commitAiTextPlacement(history, { x: 0.6, y: 0.7, scale: 1.2 });
        expect(canUndoAiTextPlacement(history)).toBe(true);
        history = undoAiTextPlacement(history);
        expect(history.present).toEqual({ x: 0.2, y: 0.3, scale: 1 });
        expect(canRedoAiTextPlacement(history)).toBe(true);
        history = redoAiTextPlacement(history);
        expect(history.present).toEqual({ x: 0.6, y: 0.7, scale: 1.2 });
        // 相同落位不写历史
        const unchanged = commitAiTextPlacement(history, { x: 0.6, y: 0.7, scale: 1.2 });
        expect(unchanged).toBe(history);
    });
});

describe("真实执行：run / retry / 结果", () => {
    const makeGateway = (overrides: Partial<Parameters<typeof runAiText>[0]["gateway"]> = {}) => {
        const submitted: Record<string, unknown>[] = [];
        const retried: Record<string, unknown>[] = [];
        const gateway = {
            submit: async (input: Record<string, unknown>) => {
                submitted.push(input);
                return task({ status: "succeeded", result: { items: [{ id: "i1", kind: "image", dataUrl: "data:image/png;base64,AAAA" }], receivedAt: 3 } });
            },
            waitForResult: async () => task(),
            retry: async (_taskId: string, input: Record<string, unknown>) => {
                retried.push(input);
                return task({ id: "task-2" });
            },
            ...overrides,
        };
        return { gateway: gateway as never, submitted, retried };
    };

    test("提交即终态：返回任务、快照与响应 id", async () => {
        const { gateway, submitted } = makeGateway();
        const run = await runAiText({ gateway, values: values(), source: source(), model: "img-model", options: OK_OPTIONS, revision: 2 });
        expect(submitted).toHaveLength(1);
        expect(run.task.status).toBe("succeeded");
        expect(run.responseId).toBe("");
        expect(run.snapshot.revision).toBe(2);
        expect(run.snapshot.outputNum).toBe(2);
    });

    test("配置不合法时在提交前抛错，不发请求", async () => {
        const { gateway, submitted } = makeGateway();
        await expect(runAiText({ gateway, values: values({ mode: "" }), source: source(), model: "m", options: OK_OPTIONS })).rejects.toThrow(AiTextAdapterError);
        await expect(runAiText({ gateway, values: values(), source: { assetId: "a" }, model: "m", options: OK_OPTIONS })).rejects.toThrow(/请先上传/);
        expect(submitted).toHaveLength(0);
    });

    test("提交后仍在跑 → 等待终态；失败任务把上游错误原样透出", async () => {
        const pending = task({ status: "running" });
        const failed = task({ status: "failed", error: { code: "upstream", message: "上游 500", retryable: true } });
        const { gateway } = makeGateway({ submit: async () => pending, waitForResult: async () => failed });
        const run = await runAiText({ gateway, values: values(), source: source(), model: "m", options: OK_OPTIONS });
        expect(run.task.status).toBe("failed");
        expect(aiTextResultNotice(aiTextResultFromTask(run.task, run.snapshot, run.snapshot))).toBe("生成失败：上游 500");
    });

    test("retry 复用同 requestId 并再次守卫；网关不支持时明确报错", async () => {
        const { gateway, submitted, retried } = makeGateway();
        const run = await retryAiText({ gateway, values: values(), source: source(), model: "m", options: OK_OPTIONS, taskId: "task-1", requestId: "req-fixed" });
        expect(run.task.id).toBe("task-2");
        expect(submitted).toHaveLength(0);
        expect((retried[0].fields as Record<string, unknown>).requestId).toBe("req-fixed");
        const noRetry = { submit: async () => task(), waitForResult: async () => task() } as never;
        await expect(retryAiText({ gateway: noRetry, values: values(), source: source(), model: "m", options: OK_OPTIONS, taskId: "t" })).rejects.toThrow(/不支持按任务重试/);
    });

    test("结果：0 张图按失败处理，旧快照标记 stale", () => {
        const snap = createAiTextSnapshot(values(), { assetId: "asset-1" }, 1, "r");
        const empty = aiTextResultFromTask(task({ result: { items: [], receivedAt: 1 } }), snap, snap);
        expect(empty.stale).toBe(false);
        expect(aiTextResultNotice(empty)).toContain("按失败处理");

        const drift = createAiTextSnapshot(values({ ratio: "4:5" }), { assetId: "asset-1" }, 1, "r");
        const stale = aiTextResultFromTask(task(), snap, drift, describeAiTextDrift(snap, drift));
        expect(stale.stale).toBe(true);
        expect(stale.drift).toBe("输出比例、提示词内容");

        expect(aiTextResultNotice(aiTextResultFromTask(undefined, snap, snap))).toContain("尚无结果");
        expect(aiTextResultNotice(aiTextResultFromTask(task({ status: "unknown" }), snap, snap))).toContain("状态未知");
        expect(aiTextResponseId(task({ upstreamTaskId: "up-9" }))).toBe("up-9");
    });
});

describe("工作区渲染（无网络、无假结果）", () => {
    test("首屏渲染出三块区域与阻断态按钮", async () => {
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
        const { PodMaterialWorkspace } = await import("@/components/tools/workspaces/pod");
        const tree = React.createElement(MemoryRouter, null, React.createElement(PodMaterialWorkspace));
        const html = renderToStaticMarkup(tree);
        expect(html).toContain("POD 素材");
        expect(html).toContain("上传底图（参考图）");
        expect(html).toContain("平铺预览");
        expect(html).toContain("生成 POD 素材");
        // 未上传、未选模式 → 提交按钮必须禁用
        expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*生成 POD 素材/);
        expect(html).toContain("页面目录取值");
    });
});
