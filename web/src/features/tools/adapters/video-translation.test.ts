import { describe, expect, test } from "bun:test";

import {
    buildVideoTranslationBrowserInput,
    checkVideoTranslationCapability,
    checkVideoTranslationSource,
    composeVideoTranslationPrompt,
    auditVideoTranslationPrompt,
    auditVideoTranslationFields,
    retryVideoTranslationTask,
    runVideoTranslationTask,
    videoTranslationResultView,
    type VideoTranslationGatewayLike,
    type VideoTranslationSource,
} from "@/features/tools/adapters/video-translation";
import {
    VIDEO_TRANSLATION_AUTO_SOURCE,
    VIDEO_TRANSLATION_DEFAULT_TARGET,
    VIDEO_TRANSLATION_FIELD_ORDER,
    VIDEO_TRANSLATION_OUTPUT_OPTIONS,
    VIDEO_TRANSLATION_SOURCE_RULE,
    VIDEO_TRANSLATION_SUPPORTED_OUTPUT,
    applyVideoTranslationSource,
    createVideoTranslationSnapshot,
    createVideoTranslationValues,
    getVideoTranslationSpec,
    normalizeVideoTranslationOutput,
    parseVideoTranslationDraftValues,
    serializeVideoTranslationDraftValues,
} from "@/features/tools/registry/video-translation";
import type { ToolTask } from "@/services/api/tools/task-machine";

const MB = 1024 * 1024;

function source(patch: Partial<VideoTranslationSource> = {}): VideoTranslationSource {
    return {
        assetId: "asset-1",
        name: "demo.mp4",
        mimeType: "video/mp4",
        url: "blob:demo",
        storageKey: "assets/demo.mp4",
        bytes: 4 * MB,
        durationMs: 8_000,
        ...patch,
    } as VideoTranslationSource;
}

function task(patch: Partial<ToolTask> = {}): ToolTask {
    return { id: "task-1", status: "running", ...patch } as unknown as ToolTask;
}

describe("VIDEO_TRANSLATION registry：字段与默认值", () => {
    test("registry 声明 7 个 provider 字段，与适配器字段顺序一致", () => {
        const spec = getVideoTranslationSpec();
        expect(spec).toBeDefined();
        const names = (spec?.fields ?? []).map((field) => field.key).sort();
        expect(names).toEqual([...VIDEO_TRANSLATION_FIELD_ORDER].sort());
        expect(VIDEO_TRANSLATION_FIELD_ORDER).toHaveLength(7);
    });

    test("页面默认：源语言自动识别、目标语言英语、口型同步开启、输出 1 条", () => {
        const values = createVideoTranslationValues();
        expect(values.sourceLanguage).toBe(VIDEO_TRANSLATION_AUTO_SOURCE.id);
        expect(values.targetLanguage).toBe(VIDEO_TRANSLATION_DEFAULT_TARGET);
        expect(values.lipSync).toBe(true);
        expect(values.outputNum).toBe(1);
        expect(values.mode).toBe("standard");
    });

    test("原视频规则：MP4/MOV、100MB、2–30 秒", () => {
        expect(VIDEO_TRANSLATION_SOURCE_RULE.mimeTypes).toEqual(["video/mp4", "video/quicktime"]);
        expect(VIDEO_TRANSLATION_SOURCE_RULE.maxBytes).toBe(100 * MB);
        expect(VIDEO_TRANSLATION_SOURCE_RULE.minSeconds).toBe(2);
        expect(VIDEO_TRANSLATION_SOURCE_RULE.maxSeconds).toBe(30);
    });

    test("输出数量越界会被夹到 1–4，上游仅支持 1 条原生输出", () => {
        expect(normalizeVideoTranslationOutput(0)).toBe(1);
        expect(normalizeVideoTranslationOutput(9)).toBe(Math.max(...VIDEO_TRANSLATION_OUTPUT_OPTIONS));
        expect(VIDEO_TRANSLATION_SUPPORTED_OUTPUT).toBe(1);
    });

    test("显式源语言与目标语言相同时退回自动识别", () => {
        const values = createVideoTranslationValues({ sourceLanguage: "zh", targetLanguage: "zh" });
        expect(values.sourceLanguage).toBe("auto");
    });
});

describe("VIDEO_TRANSLATION：语言联动", () => {
    test("选择与目标相同的源语言时，目标语言自动切换", () => {
        const base = createVideoTranslationValues({ targetLanguage: "en" });
        const { values, targetChanged } = applyVideoTranslationSource(base, "en");
        expect(targetChanged).toBe(true);
        expect(values.sourceLanguage).toBe("en");
        expect(values.targetLanguage).not.toBe("en");
    });

    test("切换回自动识别不触发联动", () => {
        const base = createVideoTranslationValues({ sourceLanguage: "ja", targetLanguage: "en" });
        const { values, targetChanged } = applyVideoTranslationSource(base, "auto");
        expect(targetChanged).toBe(false);
        expect(values.targetLanguage).toBe("en");
    });
});

describe("VIDEO_TRANSLATION：草稿读写", () => {
    test("草稿往返保持关键配置", () => {
        const values = createVideoTranslationValues({
            sourceLanguage: "ja",
            targetLanguage: "zh",
            lipSync: false,
            outputNum: 2,
            mode: "advanced",
            sourceVideoName: "a.mp4",
            sourceVideoDurationMs: 12_000,
        });
        const restored = parseVideoTranslationDraftValues(serializeVideoTranslationDraftValues(values));
        expect(restored.sourceLanguage).toBe("ja");
        expect(restored.targetLanguage).toBe("zh");
        expect(restored.lipSync).toBe(false);
        expect(restored.outputNum).toBe(2);
        expect(restored.mode).toBe("advanced");
        expect(restored.sourceVideoName).toBe("a.mp4");
        expect(restored.sourceVideoDurationMs).toBe(12_000);
    });

    test("脏草稿回落到默认值而不是报错", () => {
        const restored = parseVideoTranslationDraftValues({ targetLanguage: "klingon", lipSync: "yes" });
        expect(restored.targetLanguage).toBe(VIDEO_TRANSLATION_DEFAULT_TARGET);
        expect(restored.lipSync).toBe(true);
        expect(restored.sourceLanguage).toBe("auto");
    });
});

describe("VIDEO_TRANSLATION：原视频校验", () => {
    test("未上传时提示先上传", () => {
        expect(checkVideoTranslationSource(null)).toEqual([
            { code: "no-source", message: "请先上传需要翻译的原视频", severity: "block" },
        ]);
    });

    test("合法视频无问题", () => {
        expect(checkVideoTranslationSource(source())).toEqual([]);
    });

    test("非 MP4/MOV 被拒", () => {
        const issues = checkVideoTranslationSource(source({ mimeType: "video/webm" }));
        expect(issues.map((item) => item.code)).toContain("source-mime");
    });

    test("超过 100MB 被拒", () => {
        const issues = checkVideoTranslationSource(source({ bytes: 101 * MB }));
        expect(issues.map((item) => item.code)).toContain("source-too-large");
    });

    test("时长越界只提示（spec 写的是建议），读不到时长才拦", () => {
        expect(checkVideoTranslationSource(source({ durationMs: 1_500 })).map((i) => i.code)).toContain("source-too-short");
        expect(checkVideoTranslationSource(source({ durationMs: 31_000 })).map((i) => i.code)).toContain("source-too-long");
        expect(checkVideoTranslationSource(source({ durationMs: 0 })).map((i) => i.code)).toContain("source-duration-unknown");
        // spec 只把 2–30 秒写成「建议」：时长越界仅提示，不阻断提交
        expect(checkVideoTranslationSource(source({ durationMs: 1_500 })).every((i) => i.severity === "notice")).toBe(true);
        expect(checkVideoTranslationSource(source({ durationMs: 31_000 })).every((i) => i.severity === "notice")).toBe(true);
        // 格式 / 体积 / 读不到时长 仍然是硬拦截
        expect(checkVideoTranslationSource(source({ mimeType: "video/webm" }))[0].severity).toBe("block");
        expect(checkVideoTranslationSource(source({ bytes: 200 * 1024 * 1024 }))[0].severity).toBe("block");
        expect(checkVideoTranslationSource(source({ durationMs: 0 }))[0].severity).toBe("block");
    });
});

describe("VIDEO_TRANSLATION：能力门禁", () => {
    test("口型同步默认开启且没有能力声明时阻断提交", () => {
        const report = checkVideoTranslationCapability(createVideoTranslationValues());
        expect(report.evidence.lipSync).toBe("unsupported");
        expect(report.blockers[0]).toContain("口型同步");
    });

    test("关闭口型同步后不再阻断，只记录降级说明", () => {
        const report = checkVideoTranslationCapability(createVideoTranslationValues({ lipSync: false }));
        expect(report.blockers).toEqual([]);
        expect(report.degradations.some((text) => text.includes("口型同步"))).toBe(true);
    });

    test("输出数量超过渠道能力时阻断", () => {
        const report = checkVideoTranslationCapability(createVideoTranslationValues({ lipSync: false, outputNum: 3 }));
        expect(report.blockers.some((text) => text.includes("只能返回 1 条视频"))).toBe(true);
    });
});

describe("VIDEO_TRANSLATION：提示词覆盖与字段完整性", () => {
    test("提示词逐项覆盖页面选项（审计无缺失）", () => {
        const values = createVideoTranslationValues({ sourceLanguage: "ja", targetLanguage: "zh", mode: "advanced" });
        const prompt = composeVideoTranslationPrompt(values).text;
        expect(auditVideoTranslationPrompt(prompt, values)).toEqual([]);
    });

    test("口型同步开关会改变提示词内容", () => {
        const on = composeVideoTranslationPrompt(createVideoTranslationValues({ lipSync: true })).text;
        const off = composeVideoTranslationPrompt(createVideoTranslationValues({ lipSync: false })).text;
        expect(on).not.toBe(off);
        expect(on).toContain("口型同步：开启");
        expect(off).toContain("口型同步：关闭");
    });

    test("7 个 provider 字段都有值，缺一个会被审计出来", () => {
        const fields = buildVideoTranslationInputFields();
        expect(auditVideoTranslationFields(fields)).toEqual([]);
        expect(auditVideoTranslationFields({ ...fields, targetLanguage: "" })).toEqual(["targetLanguage"]);
    });
});

function buildVideoTranslationInputFields() {
    const values = createVideoTranslationValues();
    return {
        lipSync: values.lipSync,
        outputNum: values.outputNum,
        sourceLanguage: values.sourceLanguage,
        sourceVideoName: "demo.mp4",
        sourceVideoUrl: "blob:demo",
        targetLanguage: values.targetLanguage,
        videoType: values.videoType,
    };
}

describe("VIDEO_TRANSLATION：构建真实请求", () => {
    test("缺少模型/原视频直接报错", () => {
        expect(() =>
            buildVideoTranslationBrowserInput({ values: createVideoTranslationValues(), source: source(), model: " " }),
        ).toThrow("请先选择视频模型");
        expect(() =>
            buildVideoTranslationBrowserInput({ values: createVideoTranslationValues({ lipSync: false }), source: null, model: "m" }),
        ).toThrow("请先上传需要翻译的原视频");
    });

    test("口型同步开启但无能力声明时拒绝提交（不静默丢参）", () => {
        expect(() =>
            buildVideoTranslationBrowserInput({ values: createVideoTranslationValues({ lipSync: true }), source: source(), model: "m" }),
        ).toThrow("口型同步");
    });

    test("关闭口型同步后请求携带 7 个字段、1 条参考视频与完整提示词", () => {
        const values = createVideoTranslationValues({ lipSync: false, targetLanguage: "zh" });
        const input = buildVideoTranslationBrowserInput({ values, source: source(), model: "video-model" });
        expect(input.toolId).toBe("VIDEO_TRANSLATION");
        expect(input.model).toBe("video-model");
        expect(input.videos).toHaveLength(1);
        expect(input.videos?.[0]?.url).toBe("blob:demo");
        expect(Object.keys(input.fields ?? {}).sort()).toEqual([...VIDEO_TRANSLATION_FIELD_ORDER].sort());
        expect(auditVideoTranslationPrompt(input.prompt ?? "", values)).toEqual([]);
    });
});

describe("VIDEO_TRANSLATION：提交与重试", () => {
    test("提交走 dedupe=true，重试走 dedupe=false", async () => {
        const calls: Array<{ dedupe?: boolean }> = [];
        const port: VideoTranslationGatewayLike = {
            run: async (_input, options) => {
                calls.push({ dedupe: options?.dedupe });
                return task({ status: "running" });
            },
        };
        const browserInput = buildVideoTranslationBrowserInput({
            values: createVideoTranslationValues({ lipSync: false }),
            source: source(),
            model: "m",
        });
        await runVideoTranslationTask({ browserInput, port, draftRevision: 3 });
        await retryVideoTranslationTask({ browserInput, port, draftRevision: 3 });
        expect(calls).toEqual([{ dedupe: true }, { dedupe: false }]);
    });
});

describe("VIDEO_TRANSLATION：结果视图", () => {
    const values = createVideoTranslationValues({ lipSync: false, targetLanguage: "zh" });
    const snapshot = createVideoTranslationSnapshot(values, undefined as never, 4);

    test("未提交时为空态", () => {
        const view = videoTranslationResultView({ task: null, snapshot: null, current: values });
        expect(view.state).toBe("idle");
    });

    test("运行中显示状态文案", () => {
        const view = videoTranslationResultView({ task: task({ status: "running" }), snapshot, current: values });
        expect(view.state).toBe("running");
        expect(view.stale).toBe(false);
    });

    test("成功后返回 1 条视频即视为完整", () => {
        const view = videoTranslationResultView({
            task: task({ status: "succeeded", result: { items: [{ id: "v1", kind: "video", url: "blob:out" }] } as never }),
            snapshot,
            current: values,
        });
        expect(view.state).toBe("succeeded");
        expect(view.videos).toHaveLength(1);
        expect(view.outputMatched).toBe(true);
    });

    test("成功但没有视频按失败处理", () => {
        const view = videoTranslationResultView({ task: task({ status: "succeeded", result: { items: [] } as never }), snapshot, current: values });
        expect(view.state).toBe("failed");
        expect(view.outputMatched).toBe(false);
    });

    test("改配置后旧结果标记为 stale", () => {
        const view = videoTranslationResultView({
            task: task({ status: "succeeded", result: { items: [{ id: "v1", kind: "video", url: "blob:out" }] } as never }),
            snapshot,
            current: { ...values, targetLanguage: "ja" },
        });
        expect(view.stale).toBe(true);
    });
});

describe("VIDEO_TRANSLATION workspace：页面结构", () => {
    test("渲染出六个区域与关键控件文案", async () => {
        const globalRecord = globalThis as unknown as { localStorage?: unknown };
        if (!globalRecord.localStorage) {
            const values = new Map<string, string>();
            globalRecord.localStorage = {
                getItem: (key: string) => values.get(key) ?? null,
                setItem: (key: string, value: string) => void values.set(key, value),
                removeItem: (key: string) => void values.delete(key),
                clear: () => values.clear(),
            };
        }

        const { renderToStaticMarkup } = await import("react-dom/server");
        const { createElement } = await import("react");
        const { VideoTranslationWorkspace } = await import(
            "@/components/tools/workspaces/video-translation"
        );

        const html = renderToStaticMarkup(createElement(VideoTranslationWorkspace, {}));

        // 六个区域
        expect(html).toContain("原视频");
        expect(html).toContain("源语言 → 需要翻译的语言");
        expect(html).toContain("口型同步");
        expect(html).toContain("模式与输出");
        expect(html).toContain("视频模型");
        expect(html).toContain("生成结果");
        // 真实约束与默认值（来自 registry，不是写死在 JSX 里）
        expect(html).toContain("MP4");
        expect(html).toContain("2–30 秒");
        expect(html).toContain("100MB");
        expect(html).toContain("自动识别");
        expect(html).toContain("英语");
        expect(html).toContain('data-testid="video-translation-config"');
    });
});
