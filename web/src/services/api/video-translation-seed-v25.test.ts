/**
 * SEED_V25 视频翻译协议层单测。
 *
 * 只测纯函数：参数映射是否与实测契约一致、缺字段/渠道无模型时是否显式阻断、
 * 上游 404 是否归一成同一错误码、状态映射是否「不乐观」。
 *
 * 运行：cd web && bun test src/services/api/video-translation-seed-v25.test.ts
 */
import { expect, test } from "bun:test";

import {
    buildSeedV25TranslationRoute,
    extractSeedV25TaskId,
    extractSeedV25VideoUrl,
    isPublicVideoUrl,
    isSeedV25Model,
    mapSeedV25TaskStatus,
    mapUpstreamModelRejection,
    SEED_V25_MODEL_ID,
    SEED_V25_RESULT_BADGE,
} from "./video-translation-seed-v25";

const READY_FIELDS = {
    sourceLanguage: "auto",
    targetLanguage: "zh-Hans",
    lipSync: false,
    sourceVideoUrl: "https://file-ai.linkfox.com/demo/source.mp4",
    sourceVideoName: "source.mp4",
    outputNum: 1,
};

test("字段齐全 → payload 与实测契约逐字段一致（type=96 / bizType=814 等价字段 / DOUBAO_API / SEED_V25）", () => {
    const route = buildSeedV25TranslationRoute({
        prompt: "把英文台词译成简体中文",
        fields: READY_FIELDS,
        availableModels: ["doubao-seedance-2-5"],
        channelDeclaresModel: true,
    });
    expect(route.status).toBe("ready");
    if (route.status !== "ready") throw new Error("unreachable");
    const p = route.payload;
    expect(p.model).toBe(SEED_V25_MODEL_ID);
    expect(p.type).toBe(96);
    expect(p.videos).toEqual([READY_FIELDS.sourceVideoUrl]);
    expect(p.sourceVideoUrl).toBe(READY_FIELDS.sourceVideoUrl);
    expect(p.sourceLanguage).toBe("auto");
    expect(p.targetLanguage).toBe("zh-Hans");
    expect(p.outputNum).toBe(1);
    expect(p.extendFields).toEqual({
        accountTypes: "DOUBAO_API",
        videoType: "SEED_V25",
        sourceLanguage: "auto",
        targetLanguage: "zh-Hans",
        lipSync: false,
        duration: -1,
        videoTime: -1,
    });
});

test("未选模型时默认就是 SEED_V25（不沿用全局 videoModel）", () => {
    const route = buildSeedV25TranslationRoute({ prompt: "", fields: READY_FIELDS, availableModels: null });
    expect(route.status).toBe("ready");
    if (route.status !== "ready") return;
    expect(route.payload.model).toBe(SEED_V25_MODEL_ID);
});

test("显式选了别的模型 → 阻断，不静默换模型代跑", () => {
    const route = buildSeedV25TranslationRoute({
        selectedModel: "MiniMax-H3",
        prompt: "",
        fields: READY_FIELDS,
        availableModels: null,
    });
    expect(route.status).toBe("blocked");
    if (route.status !== "blocked") return;
    expect(route.code).toBe("seed-v25-model-unavailable");
    expect(route.message).toContain("MiniMax-H3");
    expect(route.message).toContain("不会改用其它模型");
});

test("渠道声明的模型不含 SEED_V25 → 阻断，并把可用模型列给用户", () => {
    const route = buildSeedV25TranslationRoute({
        prompt: "",
        fields: READY_FIELDS,
        availableModels: ["MiniMax-H3", "gpt-image-2"],
        channelDeclaresModel: false,
    });
    expect(route.status).toBe("blocked");
    if (route.status !== "blocked") return;
    expect(route.code).toBe("seed-v25-model-unavailable");
    expect(route.message).toContain("MiniMax-H3");
});

test("渠道目录不可枚举（sub2api 返回空 data）时放行到上游，由 404 收敛而非乐观假设", () => {
    const route = buildSeedV25TranslationRoute({
        prompt: "",
        fields: READY_FIELDS,
        availableModels: [],
        channelDeclaresModel: undefined,
    });
    expect(route.status).toBe("ready");
});

test("源视频不是公网地址 → 阻断（blob:/127.0.0.1 一律不放行）", () => {
    for (const url of ["blob:http://localhost/abc", "http://127.0.0.1:23210/a.mp4", "http://10.0.0.8/a.mp4", ""]) {
        const route = buildSeedV25TranslationRoute({
            prompt: "",
            fields: { ...READY_FIELDS, sourceVideoUrl: url },
            availableModels: null,
        });
        expect(route.status).toBe("blocked");
        if (route.status !== "blocked") continue;
        expect(route.code).toBe("seed-v25-source-video-required");
    }
    expect(isPublicVideoUrl("https://cdn.example.com/a.mp4")).toBe(true);
});

test("目标语言缺失/为 auto → 阻断（不猜语言）", () => {
    const route = buildSeedV25TranslationRoute({
        prompt: "",
        fields: { ...READY_FIELDS, targetLanguage: "" },
        availableModels: null,
    });
    expect(route.status).toBe("blocked");
    if (route.status !== "blocked") return;
    expect(route.code).toBe("seed-v25-invalid-field");
});

test("上游 404 model_not_found → 归一成和本地闸门相同的错误码", () => {
    const blocked = mapUpstreamModelRejection(
        404,
        '{"error":{"code":"model_not_found","message":"Model \\"doubao-seedance-2-5\\" is not available for this group","type":"invalid_request_error"}}',
    );
    expect(blocked?.code).toBe("seed-v25-model-unavailable");
    expect(blocked?.message).toContain("不会退回其它视频模型");
    // 普通 500 不误判成模型未开通
    expect(mapUpstreamModelRejection(500, "internal error")).toBeNull();
    expect(mapUpstreamModelRejection(400, "prompt is required")).toBeNull();
});

test("模型 id 归一：容忍 models/ 前缀与大小写", () => {
    expect(isSeedV25Model("doubao-seedance-2-5")).toBe(true);
    expect(isSeedV25Model("  DOUBAO-Seedance-2-5 ")).toBe(true);
    expect(isSeedV25Model("models/seedance-2-5")).toBe(true);
    expect(isSeedV25Model("MiniMax-H3")).toBe(false);
});

test("状态映射不乐观：没见过的状态判 unknown，绝不判成功", () => {
    expect(mapSeedV25TaskStatus("queued")).toBe("submitted");
    expect(mapSeedV25TaskStatus("RUNNING")).toBe("running");
    expect(mapSeedV25TaskStatus("completed")).toBe("succeeded");
    expect(mapSeedV25TaskStatus("failed")).toBe("failed");
    expect(mapSeedV25TaskStatus("something_new")).toBe("unknown");
    expect(mapSeedV25TaskStatus(undefined)).toBe("unknown");
});

test("结果/任务 id 解析覆盖契约里的几种写法，取不到就返回空串（不编造）", () => {
    expect(extractSeedV25VideoUrl({ data: { url: "https://x/a.mp4" } })).toBe("https://x/a.mp4");
    expect(extractSeedV25VideoUrl({ output: ["https://x/b.mp4"] })).toBe("");
    expect(extractSeedV25TaskId({ task_id: "t-1" })).toBe("t-1");
    expect(extractSeedV25TaskId({ nope: 1 })).toBe("");
});

test("结果徽标必须带「未验证翻译」，不允许出现「翻译完成」", () => {
    expect(SEED_V25_RESULT_BADGE.label).toContain("未验证翻译");
    expect(SEED_V25_RESULT_BADGE.note).toContain("人工确认");
    expect(`${SEED_V25_RESULT_BADGE.label}${SEED_V25_RESULT_BADGE.note}`).not.toContain("翻译完成");
});
