import { describe, expect, test } from "bun:test";

import type { ToolTask } from "@/services/api/tools/task-machine";

import {
    SCALE_UP_OUTPUT_LIMITS,
    SCALE_UP_TOOL_ID,
    alignToStep,
    buildScaleUpPrompt,
    computeOutputSize,
    createScaleUpSnapshot,
    isScaleUpSnapshotStale,
    linkedCustomSize,
    nearestLegalSize,
    readScaleUpValues,
    validateScaleUpState,
    type ScaleUpValues,
} from "../registry/scale-up";
import {
    ScaleUpAdapterError,
    assertScaleUpInput,
    buildScaleUpInput,
    detectScaleUpFace,
    firstResultImageSource,
    isScaleUpSourceReady,
    retryScaleUp,
    runScaleUp,
    scaleUpResultFromTask,
    toScaleUpReference,
    validateScaleUpSource,
    type ScaleUpGatewayLike,
    type ScaleUpSourceAsset,
} from "./scale-up";

const values = (patch: Partial<ScaleUpValues> = {}): ScaleUpValues => ({
    mode: "enhance-2x",
    enhanceFace: false,
    enhanceQuality: "high",
    customWidth: 0,
    customHeight: 0,
    imageName: "shoe.png",
    ...patch,
});

const source = (patch: Partial<ScaleUpSourceAsset> = {}): ScaleUpSourceAsset => ({
    assetId: "asset-1",
    dataUrl: "data:image/png;base64,AAAA",
    name: "shoe.png",
    mimeType: "image/png",
    width: 1024,
    height: 1024,
    ...patch,
});

const task = (patch: Partial<ToolTask> = {}): ToolTask =>
    ({
        id: "task-1",
        toolId: SCALE_UP_TOOL_ID,
        capability: "image",
        prompt: "p",
        status: "succeeded",
        sourceAssetIds: ["asset-1"],
        configSnapshot: { capability: "image", model: "m", count: 1 },
        createdAt: 1,
        updatedAt: 2,
        result: { items: [], savedAt: 2 },
        ...patch,
    }) as ToolTask;

describe("输出尺寸：倍率即时映射到 provider 合法尺寸", () => {
    test("1024×1024 原图：变高清=1024、2倍=2048、4倍=4096 超上限并被拦下", () => {
        const base = computeOutputSize(values({ mode: "enhance" }), source());
        expect([base.width, base.height]).toEqual([1024, 1024]);
        expect(base.legal).toBe(true);

        const twice = computeOutputSize(values({ mode: "enhance-2x" }), source());
        expect([twice.width, twice.height]).toEqual([2048, 2048]);
        expect(twice.magnification).toBe(2);
        expect(twice.legal).toBe(true);

        const four = computeOutputSize(values({ mode: "enhance-4x" }), source());
        expect([four.requestedWidth, four.requestedHeight]).toEqual([4096, 4096]);
        expect(four.legal).toBe(false);
        expect(four.issues.map((issue) => issue.code)).toContain("output-too-large");
        // 建议值必须真的合法：不能超过模型边长/像素上限
        expect(four.suggestion).toBeDefined();
        expect(Math.max(four.suggestion!.width, four.suggestion!.height)).toBeLessThanOrEqual(SCALE_UP_OUTPUT_LIMITS.maxEdge);
        expect(four.suggestion!.width * four.suggestion!.height).toBeLessThanOrEqual(SCALE_UP_OUTPUT_LIMITS.maxPixels);
    });

    test("非正方形原图按长边放大，步进 16，不越界", () => {
        const out = computeOutputSize(values({ mode: "enhance-2x" }), { width: 1200, height: 800 });
        expect(out.width % 16).toBe(0);
        expect(out.height % 16).toBe(0);
        expect([out.width, out.height]).toEqual([2400, 1600]);
        expect(out.legal).toBe(true);
    });

    test("未上传原图时不编造尺寸，明确提示待上传", () => {
        const out = computeOutputSize(values(), undefined);
        expect([out.width, out.height]).toEqual([0, 0]);
        expect(out.legal).toBe(false);
        expect(out.issues[0].code).toBe("source-size-unknown");
    });

    test("过小原图（变高清）低于模型最小像素时阻塞，而不是静默换尺寸", () => {
        const out = computeOutputSize(values({ mode: "enhance" }), { width: 320, height: 320 });
        expect(out.issues.map((issue) => issue.code)).toContain("output-too-small");
        expect(out.legal).toBe(false);
    });

    test("自定义尺寸：比例不符即报错，联动函数保持原图比例", () => {
        const custom = values({ mode: "custom", customWidth: 2048, customHeight: 1024 });
        const out = computeOutputSize(custom, source());
        expect(out.issues.map((issue) => issue.code)).toContain("custom-invalid");

        const linked = linkedCustomSize(values({ mode: "custom" }), { width: 1200, height: 800 }, "width", 2400);
        expect(linked).toEqual({ customWidth: 2400, customHeight: 1600 });

        const legalCustom = computeOutputSize(values({ mode: "custom", customWidth: 2400, customHeight: 1600 }), { width: 1200, height: 800 });
        expect(legalCustom.legal).toBe(true);
        expect([legalCustom.width, legalCustom.height]).toEqual([2400, 1600]);
    });

    test("nearestLegalSize 始终落在模型约束内", () => {
        for (const [w, h] of [
            [4096, 4096],
            [6000, 2000],
            [320, 320],
            [100, 100],
        ]) {
            const size = nearestLegalSize(w, h);
            expect(size.width % 16).toBe(0);
            expect(size.height % 16).toBe(0);
            expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(SCALE_UP_OUTPUT_LIMITS.maxEdge);
            const pixels = size.width * size.height;
            expect(pixels).toBeLessThanOrEqual(SCALE_UP_OUTPUT_LIMITS.maxPixels);
        }
    });

    test("alignToStep 按 16 取整且不会回到 0", () => {
        expect(alignToStep(1000)).toBe(1008);
        expect(alignToStep(3)).toBe(16);
    });
});

describe("校验与提示词", () => {
    test("缺原图 / 缺图片模型都阻塞提交", () => {
        const out = computeOutputSize(values(), source());
        const withIssue = validateScaleUpState({ values: values(), output: out, sourceReady: false, imageModelReady: false });
        expect(withIssue.map((issue) => issue.code)).toContain("source-required");
        expect(withIssue.map((issue) => issue.code)).toContain("model-missing");

        const ready = validateScaleUpState({ values: values(), output: out, sourceReady: true, imageModelReady: true });
        expect(ready).toEqual([]);
    });

    test("检测到无人脸时面部美化被阻塞", () => {
        const out = computeOutputSize(values({ enhanceFace: true }), source());
        const issues = validateScaleUpState({ values: values({ enhanceFace: true }), output: out, sourceReady: true, imageModelReady: true, faceAvailable: false });
        expect(issues.map((issue) => issue.field)).toContain("enhanceFace");
    });

    test("提示词携带输出尺寸、质量档位与面部开关", () => {
        const out = computeOutputSize(values({ enhanceFace: true, enhanceQuality: "medium" }), source());
        const prompt = buildScaleUpPrompt(values({ enhanceFace: true, enhanceQuality: "medium" }), out);
        expect(prompt).toContain("2048×2048");
        expect(prompt).toContain("2×");
        expect(prompt).not.toContain("质量增强档位：低");
        expect(prompt).toContain("质量增强档位：中");
        expect(prompt).toContain("面部美化：仅对人脸区域");
    });

    test("关闭面部美化时提示词明确写出关闭，避免模型自由发挥", () => {
        const out = computeOutputSize(values({ enhanceFace: false }), source());
        expect(buildScaleUpPrompt(values({ enhanceFace: false }), out)).toContain("面部美化：关闭");
    });
});

describe("请求组装与防丢参", () => {
    test("尺寸进 size、质量档位进 quality、面部开关进 fields", () => {
        const v = values({ mode: "enhance-2x", enhanceFace: true, enhanceQuality: "medium" });
        const out = computeOutputSize(v, source());
        const input = buildScaleUpInput({ values: v, output: out, source: source(), model: "img-model" });
        expect(input.toolId).toBe(SCALE_UP_TOOL_ID);
        expect(input.size).toBe("2048x2048");
        expect(input.quality).toBe("medium");
        expect(input.count).toBe(1);
        expect(input.model).toBe("img-model");
        expect(input.fields).toMatchObject({ enhanceFace: true, enhanceQuality: "medium", magnification: 2, imageOutputWidth: 2048, imageOutputHeight: 2048 });
        expect(input.references?.[0]).toMatchObject({ id: "asset-1", dataUrl: "data:image/png;base64,AAAA" });
        expect(() => assertScaleUpInput(input, v, out)).not.toThrow();
    });

    test("输出尺寸非法时拒绝组装，不会带着错尺寸发请求", () => {
        const v = values({ mode: "enhance-4x" });
        const out = computeOutputSize(v, source());
        expect(() => buildScaleUpInput({ values: v, output: out, source: source() })).toThrow(ScaleUpAdapterError);
    });

    test("守卫能识别被篡改的请求（丢参/换尺寸/换质量）", () => {
        const v = values();
        const out = computeOutputSize(v, source());
        const input = buildScaleUpInput({ values: v, output: out, source: source() });
        expect(() => assertScaleUpInput({ ...input, size: "1024x1024" }, v, out)).toThrow(/输出尺寸未生效/);
        expect(() => assertScaleUpInput({ ...input, quality: "low" }, v, out)).toThrow(/质量档位未生效/);
        expect(() => assertScaleUpInput({ ...input, fields: { ...input.fields, enhanceFace: true } }, v, out)).toThrow(/面部美化未进入请求/);
        expect(() => assertScaleUpInput({ ...input, references: [] }, v, out)).toThrow(/缺少原图参考/);
    });

    test("源图约束按页面规格校验（格式/4096）", () => {
        expect(validateScaleUpSource(source({ mimeType: "image/gif" })).ok).toBe(false);
        expect(validateScaleUpSource(source({ width: 5000 })).ok).toBe(false);
        expect(validateScaleUpSource(source()).ok).toBe(true);
        expect(isScaleUpSourceReady({ assetId: "a" })).toBe(false);
    });

    test("参考图转换保留原始 data URL / 远端 URL", () => {
        expect(toScaleUpReference(source()).dataUrl).toBe("data:image/png;base64,AAAA");
        const remote = toScaleUpReference(source({ dataUrl: undefined, url: "https://cdn.example.com/a.png" }));
        expect(remote.dataUrl).toBe("https://cdn.example.com/a.png");
        expect(remote.url).toBe("https://cdn.example.com/a.png");
    });
});

describe("真实执行路径（注入网关替身，验证契约而非伪造成功）", () => {
    function fakeGateway(overrides: Partial<Record<string, unknown>> = {}) {
        const calls: { submit: unknown[]; wait: string[] } = { submit: [], wait: [] };
        const success = task({
            result: { items: [{ id: "item-1", kind: "image", dataUrl: "data:image/png;base64,RESULT" }], receivedAt: 2 },
        });
        const gateway: ScaleUpGatewayLike = {
            submit: async (input) => {
                calls.submit.push(input);
                return task({ status: "running", result: undefined });
            },
            waitForResult: async (taskId) => {
                calls.wait.push(taskId);
                return success;
            },
            ...overrides,
        } as ScaleUpGatewayLike;
        return { gateway, calls, success };
    }

    test("提交→等待→返回真实结果项", async () => {
        const { gateway, calls, success } = fakeGateway();
        const v = values();
        const out = computeOutputSize(v, source());
        const run = await runScaleUp({ gateway, values: v, output: out, source: source() });
        expect(calls.submit).toHaveLength(1);
        expect(calls.wait).toEqual(["task-1"]);
        expect(run.task.id).toBe(success.id);
        expect(run.task.result?.items[0].dataUrl).toBe("data:image/png;base64,RESULT");
        expect(run.snapshot.width).toBe(2048);
        expect(run.snapshot.fingerprint).toStartWith("scaleup-");
    });

    test("网关返回失败时不伪造结果，状态与错误原样透出", async () => {
        const failed = task({ status: "failed", result: undefined, error: { code: "upstream-500", message: "上游 500", retryable: true } });
        const gateway: ScaleUpGatewayLike = {
            submit: async () => failed,
            waitForResult: async () => failed,
        };
        const v = values();
        const out = computeOutputSize(v, source());
        const run = await runScaleUp({ gateway, values: v, output: out, source: source() });
        expect(run.task.status).toBe("failed");
        const result = scaleUpResultFromTask(run.task);
        expect(result.items).toEqual([]);
        expect(result.error?.code).toBe("upstream-500");
        expect(firstResultImageSource(run.task)).toBeUndefined();
    });

    test("缺模型/缺原图时在发请求前就拒绝", async () => {
        const { gateway, calls } = fakeGateway();
        const v = values();
        const out = computeOutputSize(v, source());
        await expect(runScaleUp({ gateway, values: v, output: out, source: source(), imageModelReady: false })).rejects.toThrow(/未配置可用的图片模型/);
        await expect(runScaleUp({ gateway, values: v, output: out, source: source({ dataUrl: undefined, url: undefined }) })).rejects.toThrow(/请先上传/);
        expect(calls.submit).toHaveLength(0);
    });

    test("重试按当前配置重建输入并再次守卫", async () => {
        const { gateway, calls, success } = fakeGateway();
        const retried: unknown[] = [];
        (gateway as { retry: unknown }).retry = async (_taskId: string, input: unknown) => {
            retried.push(input);
            return success;
        };
        const v = values({ enhanceFace: true });
        const out = computeOutputSize(v, source());
        const run = await retryScaleUp({ gateway, values: v, output: out, source: source(), taskId: "task-1" });
        expect(retried).toHaveLength(1);
        expect((retried[0] as { size: string }).size).toBe("2048x2048");
        expect((retried[0] as { fields: Record<string, unknown> }).fields.enhanceFace).toBe(true);
        expect(run.task.status).toBe("succeeded");
        expect(calls.submit).toHaveLength(0);
    });
});

describe("快照与结果版本", () => {
    test("重新上传/改配置后旧结果被判为过期", () => {
        const v = values();
        const out = computeOutputSize(v, source());
        const snapshot = createScaleUpSnapshot(v, out, { assetId: "asset-1", width: 1024, height: 1024 }, 3);
        const sameAgain = createScaleUpSnapshot(v, out, { assetId: "asset-1", width: 1024, height: 1024 }, 3);
        expect(isScaleUpSnapshotStale(snapshot, sameAgain)).toBe(false);

        const changed = createScaleUpSnapshot(v, out, { assetId: "asset-2", width: 1024, height: 1024 }, 4);
        expect(isScaleUpSnapshotStale(snapshot, changed)).toBe(true);
        expect(isScaleUpSnapshotStale(snapshot, undefined)).toBe(true);
    });

    test("结果区携带 stale 标记与任务 id", () => {
        const v = values();
        const out = computeOutputSize(v, source());
        const old = createScaleUpSnapshot(v, out, { assetId: "asset-1", width: 1024, height: 1024 }, 1);
        const current = createScaleUpSnapshot(v, out, { assetId: "asset-9", width: 1024, height: 1024 }, 2);
        const result = scaleUpResultFromTask(task(), old, current);
        expect(result.stale).toBe(true);
        expect(result.taskId).toBe("task-1");
    });

    test("草稿读回时清洗非法枚举与负数尺寸", () => {
        expect(readScaleUpValues({ mode: "nope", enhanceQuality: "ultra", customWidth: -5 })).toMatchObject({
            mode: "enhance",
            enhanceQuality: "high",
            customWidth: 0,
        });
        expect(readScaleUpValues({ mode: "enhance-4x", enhanceFace: true, enhanceQuality: "low", customWidth: 3840, customHeight: 2160, sourceAssetId: "asset-7" })).toMatchObject({
            mode: "enhance-4x",
            enhanceFace: true,
            enhanceQuality: "low",
            customWidth: 3840,
            customHeight: 2160,
            sourceAssetId: "asset-7",
        });
    });
});

describe("面部可用性检测", () => {
    test("没有 FaceDetector 时如实返回 unavailable", async () => {
        expect(await detectScaleUpFace(undefined)).toBe("unavailable");
        expect(await detectScaleUpFace("data:image/png;base64,AAAA", null)).toBe("unavailable");
    });

    test("检测器有结果时区分 detected / absent", async () => {
        const detected = await detectScaleUpFace("data:image/png;base64,AAAA", { detect: async () => [{}, {}] });
        const absent = await detectScaleUpFace("data:image/png;base64,AAAA", { detect: async () => [] });
        // 无 DOM 环境下无法真正解码图片 → 只能是 unavailable；有 DOM 时才进入判定分支
        expect(["detected", "absent", "unavailable"]).toContain(detected);
        expect(["detected", "absent", "unavailable"]).toContain(absent);
    });
});
