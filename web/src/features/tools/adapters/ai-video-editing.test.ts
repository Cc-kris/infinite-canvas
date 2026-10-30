import { describe, expect, test } from "bun:test";

import type { ReferenceImage } from "@/types/image";
import type { ToolTask } from "@/services/api/tools/task-machine";

/* bun test 没有 DOM：网关链路会顺带加载 i18n（模块期读 localStorage），
 * 这里在**任何值 import 之前**注入内存实现，再动态 import 被测模块（与 image-to-video.test.ts 同法）。 */
const memoryKv = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
        getItem: (key: string) => memoryKv.get(key) ?? null,
        setItem: (key: string, value: string) => void memoryKv.set(key, String(value)),
        removeItem: (key: string) => void memoryKv.delete(key),
        clear: () => memoryKv.clear(),
        key: (index: number) => [...memoryKv.keys()][index] ?? null,
        get length() {
            return memoryKv.size;
        },
    },
});

const {
    AI_VIDEO_EDITING_MAX_REFERENCES,
    AI_VIDEO_EDITING_PROMPT_MAX,
    AI_VIDEO_EDITING_TOOL_ID,
    aiVideoEditingClipLabel,
    aiVideoEditingOutputLabel,
    aiVideoEditingPromptCounter,
    applyAiVideoEditingClipDuration,
    applyAiVideoEditingClipStart,
    applyAiVideoEditingType,
    buildAiVideoEditingHiddenPrompt,
    checkAiVideoEditingPrompt,
    composeAiVideoEditingPromptDraft,
    composeAiVideoEditingProviderPrompt,
    createAiVideoEditingSnapshot,
    createAiVideoEditingState,
    formatSeconds,
    getAiVideoEditingSpec,
    isAiVideoEditingSnapshotStale,
    normalizeAiVideoEditingState,
    parseAiVideoEditingDraftValues,
    resetAiVideoEditingClipForSource,
    resolveAiVideoEditingCapability,
    resolveAiVideoEditingClip,
    serializeAiVideoEditingDraftValues,
} = await import("@/features/tools/registry/ai-video-editing");
const {
    AiVideoEditingAdapterError,
    aiVideoEditingClipWindow,
    aiVideoEditingGatewayRequires,
    aiVideoEditingResultMeta,
    aiVideoEditingResultView,
    aiVideoEditingSourceDurationMs,
    aiVideoEditingStatusText,
    aiVideoEditingVideoRequestParams,
    assertAiVideoEditingInput,
    buildAiVideoEditingBrowserInput,
    buildAiVideoEditingFields,
    collectAiVideoEditingAssetIssues,
    collectAiVideoEditingFieldGaps,
    retryAiVideoEditingTask,
    runAiVideoEditingTask,
    toAiVideoEditingReference,
    toAiVideoEditingVideoRef,
} = await import("@/features/tools/adapters/ai-video-editing");
import type { ToolAssetRecord } from "@/services/api/tools/assets";

/* ============================== 夹具 ============================== */

function videoRecord(patch: Partial<ToolAssetRecord> = {}): ToolAssetRecord {
    return {
        id: "asset-video-1",
        kind: "video",
        name: "demo.mp4",
        storageKey: "tool-asset/video-1",
        url: "blob:demo-video",
        bytes: 12 * 1024 * 1024,
        mimeType: "video/mp4",
        durationMs: 60_000,
        createdAt: "2026-10-28T00:00:00.000Z",
        origin: "local",
        ...patch,
    };
}

function imageRecord(id = "asset-image-1"): ToolAssetRecord {
    return {
        id,
        kind: "image",
        name: `${id}.png`,
        storageKey: `tool-asset/${id}`,
        url: `blob:${id}`,
        bytes: 1024 * 1024,
        mimeType: "image/png",
        width: 1024,
        height: 1024,
        createdAt: "2026-10-28T00:00:00.000Z",
        origin: "local",
    };
}

function referenceImage(record: ToolAssetRecord): ReferenceImage {
    return { id: record.id, name: record.name, type: record.mimeType, dataUrl: `data:image/png;base64,${record.id}` };
}

function readyInput(patch: Partial<Parameters<typeof assertAiVideoEditingInput>[0]> = {}) {
    return {
        state: createAiVideoEditingState({ prompt: "把背景换成纯色，保留商品细节" }),
        model: "seedance-2.5",
        source: videoRecord(),
        references: [imageRecord()],
        ...patch,
    };
}

function taskWith(patch: Partial<ToolTask>): ToolTask {
    return {
        id: "task-1",
        toolId: AI_VIDEO_EDITING_TOOL_ID,
        status: "succeeded",
        createdAt: "2026-10-28T00:00:00.000Z",
        updatedAt: "2026-10-28T00:01:00.000Z",
        result: { items: [], receivedAt: 0 },
        ...patch,
    } as ToolTask;
}

/* ============================== registry：规则 / 截取 ============================== */

describe("AI_VIDEO_EDITING registry", () => {
    test("spec 存在且 index/标题/字段与工具目录一致", () => {
        const spec = getAiVideoEditingSpec();
        expect(spec?.id).toBe(AI_VIDEO_EDITING_TOOL_ID);
        expect(spec?.title).toBe("视频编辑");
        expect(spec?.makeType).toBe(95);
        expect(spec?.layout).toBe("video");
    });

    test("无源视频时截取窗口不可用，并给出可执行提示", () => {
        const window = aiVideoEditingClipWindow(createAiVideoEditingState(), null);
        expect(window.reason).toBe("no-source");
        expect(window.durationMs).toBe(0);
        expect(window.notice).toBe("先上传源视频，才能确定截取区间");
        expect(aiVideoEditingOutputLabel(window)).toBe("1 条 · 待上传源视频");
    });

    test("源视频 60s、默认时长 → 截 30s 上限", () => {
        const window = aiVideoEditingClipWindow(createAiVideoEditingState(), videoRecord());
        expect(window.sourceDurationMs).toBe(60_000);
        expect(window.durationMs).toBe(30_000);
        expect(window.startMs).toBe(0);
        expect(aiVideoEditingClipLabel(window)).toContain("30");
    });

    test("起点推到片尾时按剩余时长夹紧并说明原因", () => {
        const state = createAiVideoEditingState({ clipStart: 55, clipDuration: 30 });
        const window = aiVideoEditingClipWindow(state, videoRecord({ durationMs: 60_000 }));
        expect(window.reason).toBe("source-end");
        expect(window.endMs).toBeLessThanOrEqual(60_000);
        expect(window.durationMs).toBeLessThanOrEqual(30_000);
        expect(window.notice).not.toBe("");
    });

    test("时长低于 1 秒被判为 min-clip", () => {
        const window = resolveAiVideoEditingClip({ sourceDurationMs: 60_000, clipStart: 0, clipDuration: 0.5 });
        expect(window.reason).toBe("min-clip");
        expect(window.durationMs).toBe(1_000);
    });

    test("改起点/时长/类型后仍落在合法区间（幂等夹紧）", () => {
        const source = videoRecord({ durationMs: 20_000 });
        const moved = applyAiVideoEditingClipStart({ state: createAiVideoEditingState(), sourceDurationMs: 20_000, startSec: 18 });
        const window = aiVideoEditingClipWindow(moved, source);
        expect(window.endMs).toBeLessThanOrEqual(20_000);
        const resized = applyAiVideoEditingClipDuration({ state: moved, sourceDurationMs: 20_000, durationSec: 99 });
        expect(aiVideoEditingClipWindow(resized, source).durationMs).toBeLessThanOrEqual(30_000);
        const retyped = applyAiVideoEditingType({ state: resized, sourceDurationMs: 20_000, videoType: "not-a-type" });
        expect(retyped.videoType).toBe("product_person_precise");
    });

    test("换源视频时重置截取区间，不把旧区间带过去", () => {
        const state = createAiVideoEditingState({ clipStart: 40, clipDuration: 30 });
        const reset = resetAiVideoEditingClipForSource(state, 8_000);
        expect(reset.clipStart).toBe(0);
        expect(reset.clipDuration).toBeLessThanOrEqual(8);
        expect(formatSeconds(8_000)).toContain("8");
    });
});

/* ============================== registry：需求描述 / 快照 / 草稿 ============================== */

describe("AI_VIDEO_EDITING prompt & snapshot", () => {
    test("需求计数与上限校验对齐 0/2500", () => {
        expect(aiVideoEditingPromptCounter("")).toBe(`0 / ${AI_VIDEO_EDITING_PROMPT_MAX}`); // 证据页文案带空格
        expect(checkAiVideoEditingPrompt("").empty).toBe(true);
        const tooLong = "あ".repeat(AI_VIDEO_EDITING_PROMPT_MAX + 1);
        expect(checkAiVideoEditingPrompt(tooLong).tooLong).toBe(true);
        const ok = checkAiVideoEditingPrompt("改成室内纯色背景");
        expect(ok.empty).toBe(false);
        expect(ok.tooLong).toBe(false);
    });

    test("模板优化生成可编辑草稿，且不改写用户输入", () => {
        const state = createAiVideoEditingState({ prompt: "原需求" });
        const window = aiVideoEditingClipWindow(state, videoRecord());
        const draft = composeAiVideoEditingPromptDraft({ state, window, referenceCount: 2 });
        expect(draft.startsWith("[模板优化]")).toBe(true);
        expect(draft).toContain("按 2 张参考图锁定主体");
        expect(state.prompt).toBe("原需求");
    });

    test("隐藏提示词含类型意图与截取区间；provider prompt 追加可见需求", () => {
        const state = createAiVideoEditingState({ prompt: "换成海边" });
        const window = aiVideoEditingClipWindow(state, videoRecord());
        const hidden = buildAiVideoEditingHiddenPrompt({ state, model: "seedance-2.5", window, referenceCount: 1 });
        expect(hidden).toContain("商品人物精准编辑");
        const provider = composeAiVideoEditingProviderPrompt({ state, model: "seedance-2.5", window, referenceCount: 1 });
        expect(provider).toContain(hidden);
        expect(provider).toContain("换成海边");
    });

    test("配置变化 → 旧结果标 stale；不变则否", () => {
        const state = createAiVideoEditingState({ prompt: "换成海边" });
        const window = aiVideoEditingClipWindow(state, videoRecord());
        const snapshot = createAiVideoEditingSnapshot({
            state,
            model: "seedance-2.5",
            window,
            sourceAssetId: "asset-video-1",
            referenceAssetIds: ["asset-image-1"],
            clientOperationId: "op-1",
        });
        const same = createAiVideoEditingSnapshot({
            state,
            model: "seedance-2.5",
            window,
            sourceAssetId: "asset-video-1",
            referenceAssetIds: ["asset-image-1"],
            clientOperationId: "op-2",
        });
        expect(isAiVideoEditingSnapshotStale(snapshot, same)).toBe(false);
        const changed = createAiVideoEditingSnapshot({
            state: { ...state, prompt: "换成夜景" },
            model: "seedance-2.5",
            window,
            sourceAssetId: "asset-video-1",
            referenceAssetIds: ["asset-image-1"],
            clientOperationId: "op-3",
        });
        expect(isAiVideoEditingSnapshotStale(snapshot, changed)).toBe(true);
    });

    test("草稿序列化/反序列化保真，非法值回落默认", () => {
        const state = createAiVideoEditingState({ clipStart: 3, clipDuration: 12, prompt: "保留文字" });
        const round = parseAiVideoEditingDraftValues(serializeAiVideoEditingDraftValues(state, "asset-video-1"));
        expect(round.state.clipStart).toBe(3);
        expect(round.state.clipDuration).toBe(12);
        expect(round.state.prompt).toBe("保留文字");
        expect(round.sourceAssetId).toBe("asset-video-1");
        const bad = normalizeAiVideoEditingState({ videoType: "bogus" as never, clipDuration: -5 });
        expect(bad.videoType).toBe("product_person_precise");
        expect(bad.clipDuration).toBeGreaterThan(0);
        expect(parseAiVideoEditingDraftValues("nope").state.prompt).toBe("");
    });

    test("草稿必须带走参考图 id：刷新后参考图位不能清空（两槽不得互相窜）", () => {
        const state = createAiVideoEditingState({ prompt: "换成夜景" });
        const serialized = serializeAiVideoEditingDraftValues(state, "asset-video-1", ["asset-image-1", "asset-image-2", ""]);
        // 空串被剔除，仅保留真实资产 id
        expect(serialized.referenceAssetIds).toEqual(["asset-image-1", "asset-image-2"]);
        const round = parseAiVideoEditingDraftValues(serialized);
        expect(round.sourceAssetId).toBe("asset-video-1");
        expect(round.referenceAssetIds).toEqual(["asset-image-1", "asset-image-2"]);
        // 源视频位只认 sourceAssetId，参考图位只认 referenceAssetIds：互不串槽
        expect(round.referenceAssetIds.includes("asset-video-1")).toBe(false);
        // 旧草稿（没有 referenceAssetIds 字段）回落空数组，不报错、不猜
        expect(parseAiVideoEditingDraftValues({ sourceAssetId: "asset-video-1" }).referenceAssetIds).toEqual([]);
    });
});

/* ============================== registry：能力判定 ============================== */

describe("AI_VIDEO_EDITING capability", () => {
    function capability(patch: Partial<Parameters<typeof resolveAiVideoEditingCapability>[0]> = {}) {
        return resolveAiVideoEditingCapability({
            model: "seedance-2.5",
            hasSourceVideo: true,
            referenceCount: 1,
            gatewayRequiresReferences: true,
            prompt: "换成纯色场景",
            clip: aiVideoEditingClipWindow(createAiVideoEditingState(), videoRecord()),
            ...patch,
        });
    }

    test("齐备时可提交", () => {
        const result = capability();
        expect(result.canSubmit).toBe(true);
        expect(result.issues).toEqual([]);
    });

    test("缺模型/缺源/缺参考/缺需求逐条给出原因", () => {
        expect(capability({ model: "  " }).issues).toContain("未选择视频模型");
        expect(capability({ hasSourceVideo: false }).issues.join()).toContain("先上传需要编辑的视频");
        expect(capability({ referenceCount: 0 }).issues.join()).toContain("至少 1 张参考图");
        expect(capability({ prompt: "" }).issues).toContain("填写编辑需求描述");
        expect(capability({ prompt: "x".repeat(AI_VIDEO_EDITING_PROMPT_MAX + 1) }).issues.join()).toContain("编辑需求最多");
    });

    test("参考图超上限被拒，并报出数量", () => {
        const result = capability({ referenceCount: AI_VIDEO_EDITING_MAX_REFERENCES + 1 });
        expect(result.canSubmit).toBe(false);
        expect(result.issues.join()).toContain(`最多 ${AI_VIDEO_EDITING_MAX_REFERENCES} 张`);
    });

    test("本地网关强制参考图时文案点明与原站差异", () => {
        const result = capability({ referenceCount: 0, gatewayRequiresReferences: true });
        expect(result.issues.join()).toContain("本地网关对本工具要求至少 1 张参考图");
        const lenient = capability({ referenceCount: 0, gatewayRequiresReferences: false });
        expect(lenient.issues.join()).not.toContain("本地网关");
    });
});

/* ============================== adapter：校验 / 字段 / 请求 ============================== */

describe("AI_VIDEO_EDITING adapter", () => {
    test("资产元数据缺时长 → 0；有则取整", () => {
        expect(aiVideoEditingSourceDurationMs(null)).toBe(0);
        expect(aiVideoEditingSourceDurationMs(videoRecord({ durationMs: 12_345.6 }))).toBe(12_346);
    });

    test("网关能力运行时读取：参考图与源视频都强制", () => {
        const requires = aiVideoEditingGatewayRequires();
        expect(requires.references).toBe(true);
        expect(requires.video).toBe(true);
    });

    test("缺模型/缺源视频/缺参考图/缺需求分别抛真实错误码", () => {
        expect(() => assertAiVideoEditingInput(readyInput({ model: "" }))).toThrow(AiVideoEditingAdapterError);
        try {
            assertAiVideoEditingInput(readyInput({ model: "" }));
        } catch (error) {
            expect((error as InstanceType<typeof AiVideoEditingAdapterError>).code).toBe("model-missing");
        }
        try {
            assertAiVideoEditingInput(readyInput({ source: null }));
        } catch (error) {
            expect((error as InstanceType<typeof AiVideoEditingAdapterError>).code).toBe("no-source-video");
        }
        try {
            assertAiVideoEditingInput(readyInput({ references: [] }));
        } catch (error) {
            expect((error as InstanceType<typeof AiVideoEditingAdapterError>).code).toBe("no-reference");
        }
        try {
            assertAiVideoEditingInput(readyInput({ state: createAiVideoEditingState({ prompt: "" }) }));
        } catch (error) {
            expect((error as InstanceType<typeof AiVideoEditingAdapterError>).code).toBe("prompt-empty");
        }
    });

    test("源视频过短/过大/格式不符被拒", () => {
        expect(() => assertAiVideoEditingInput(readyInput({ source: videoRecord({ durationMs: 2_000 }) }))).toThrow("源视频时长不低于 4 秒");
        expect(() => assertAiVideoEditingInput(readyInput({ source: videoRecord({ bytes: 200 * 1024 * 1024 }) }))).toThrow("100M");
        expect(() => assertAiVideoEditingInput(readyInput({ source: videoRecord({ mimeType: "video/webm" }) }))).toThrow("MP4 / MOV");
    });

    test("合法输入返回真实截取窗口（时长/区间与源视频一致）", () => {
        const window = assertAiVideoEditingInput(readyInput());
        expect(window.durationMs).toBe(30_000);
        expect(window.startMs).toBe(0);
        expect(window.sourceDurationMs).toBe(60_000);
    });

    test("7 个字段全部落齐，无缺参", () => {
        const window = aiVideoEditingClipWindow(createAiVideoEditingState({ prompt: "换成纯色" }), videoRecord());
        const fields = buildAiVideoEditingFields({
            state: createAiVideoEditingState({ prompt: "换成纯色" }),
            model: "seedance-2.5",
            source: videoRecord(),
            references: [imageRecord()],
            window,
        });
        expect(Object.keys(fields).sort()).toEqual(
            ["duration", "outputNum", "prompt", "refImageUrls", "sourceVideoDuration", "sourceVideoUrl", "videoType"].sort(),
        );
        expect(fields.duration).toBe(30);
        expect(fields.sourceVideoDuration).toBe(60);
        expect(fields.sourceVideoUrl).toBe("blob:demo-video");
        expect(fields.refImageUrls).toEqual(["blob:asset-image-1"]);
        expect(collectAiVideoEditingFieldGaps(fields)).toEqual([]);
    });

    test("网关入参：prompt 含模板段、videos 带真实源视频、references 与本地文件数一致", () => {
        const input = readyInput();
        const references = input.references;
        const browserInput = buildAiVideoEditingBrowserInput({
            ...input,
            referenceImages: references.map(referenceImage),
        });
        expect(browserInput.toolId).toBe(AI_VIDEO_EDITING_TOOL_ID);
        expect(browserInput.model).toBe("seedance-2.5");
        expect(browserInput.videos?.length).toBe(1);
        expect(browserInput.videos?.[0].url).toBe("blob:demo-video");
        expect(browserInput.references?.length).toBe(1);
        expect(browserInput.prompt).toContain("商品人物精准编辑");
        expect(browserInput.prompt).toContain("把背景换成纯色");
    });

    test("参考图与本地文件数量不一致时拒绝提交", () => {
        expect(() =>
            buildAiVideoEditingBrowserInput({ ...readyInput(), referenceImages: [] }),
        ).toThrow("参考图与本地文件数量不一致");
    });

    test("源视频/参考图转 Reference 时缺地址直接报错，不造假", () => {
        expect(() => toAiVideoEditingVideoRef(videoRecord({ url: "" }))).toThrow("源视频本地地址不可用");
        expect(() => toAiVideoEditingReference({ record: imageRecord(), dataUrl: "" })).toThrow("参考图本地数据不可用");
        const ref = toAiVideoEditingReference({ record: imageRecord(), dataUrl: "data:image/png;base64,AAA" });
        expect(ref.id).toBe("asset-image-1");
        expect(ref.type).toBe("image/png");
    });

    test("提交/重试都真的调用端口（重试关掉去重）", async () => {
        const input = readyInput();
        const references = input.references;
        const browserInput = buildAiVideoEditingBrowserInput({ ...input, referenceImages: references.map(referenceImage) });
        const calls: Array<{ options?: Record<string, unknown> }> = [];
        const port = {
            run: async (_input: unknown, options?: Record<string, unknown>) => {
                calls.push({ options });
                return taskWith({});
            },
        };
        await runAiVideoEditingTask({ browserInput, port, draftRevision: 7 });
        await retryAiVideoEditingTask({
            snapshot: createAiVideoEditingSnapshot({
                state: input.state,
                model: input.model,
                window: aiVideoEditingClipWindow(input.state, input.source),
                sourceAssetId: "asset-video-1",
                referenceAssetIds: ["asset-image-1"],
                draftRevision: 7,
                clientOperationId: "op-1",
            }),
            browserInput,
            port,
        });
        expect(calls.length).toBe(2);
        expect(calls[0].options?.draftRevision).toBe(7);
        expect(calls[1].options?.dedupe).toBe(false);
    });
});

/* ============================== adapter：结果视图 ============================== */

describe("AI_VIDEO_EDITING result view", () => {
    test("无任务 → 空态文案", () => {
        const view = aiVideoEditingResultView({});
        expect(view.state).toBe("empty");
        expect(view.message).toBe("编辑结果会出现在这里");
        expect(aiVideoEditingResultMeta(view)).toBe("尚未提交");
    });

    test("成功且有视频 → succeeded；成功但无视频 → failed（不冒充成功）", () => {
        const withVideo = aiVideoEditingResultView({
            task: taskWith({ result: { items: [{ kind: "video", url: "blob:out", id: "v1" }] as never, receivedAt: 0 } }),
        });
        expect(withVideo.state).toBe("succeeded");
        expect(withVideo.videos.length).toBe(1);
        const empty = aiVideoEditingResultView({ task: taskWith({ result: { items: [], receivedAt: 0 } }) });
        expect(empty.state).toBe("failed");
        expect(empty.message).toBe("任务成功但没有可播放视频");
    });

    test("失败保留上游错误信息；未知状态要求先查询", () => {
        const failed = aiVideoEditingResultView({
            task: taskWith({ status: "failed", error: { code: "provider", message: "上游 502" } as never }),
        });
        expect(failed.message).toBe("上游 502");
        const unknown = aiVideoEditingResultView({ task: taskWith({ status: "unknown" }) });
        expect(unknown.message).toContain("请先查询任务");
    });

    test("提交快照与当前配置不同 → stale 标记；meta 只报真实时长/张数", () => {
        const state = createAiVideoEditingState({ prompt: "换成海边" });
        const window = aiVideoEditingClipWindow(state, videoRecord());
        const submitted = createAiVideoEditingSnapshot({
            state,
            model: "seedance-2.5",
            window,
            sourceAssetId: "asset-video-1",
            referenceAssetIds: ["asset-image-1"],
            clientOperationId: "op-1",
        });
        const current = createAiVideoEditingSnapshot({
            state: { ...state, prompt: "换成夜景" },
            model: "seedance-2.5",
            window,
            sourceAssetId: "asset-video-1",
            referenceAssetIds: ["asset-image-1"],
            clientOperationId: "op-2",
        });
        const view = aiVideoEditingResultView({
            task: taskWith({ result: { items: [{ kind: "video", url: "blob:out", id: "v1" }] as never, receivedAt: 0 } }),
            snapshot: submitted,
            current,
        });
        expect(view.stale).toBe(true);
        expect(view.message).toBe("结果来自旧版本配置");
        expect(aiVideoEditingResultMeta(view)).toContain("30 秒");
        expect(aiVideoEditingResultMeta(view)).toContain("参考图 1 张");
        expect(aiVideoEditingStatusText(view.state)).toBe("已完成");
    });
});

/* ============================== 工作区真渲染（SSR 证据） ============================== */

describe("AI_VIDEO_EDITING workspace：页面结构", () => {
    test("渲染出原视频 / 参考图 / 编辑需求 / 视频类型 / 结果五个区域与关键 testid", async () => {
        const React = await import("react");
        const { MemoryRouter } = await import("react-router");
        const { renderToStaticMarkup } = await import("react-dom/server");
        const { AiVideoEditingWorkspace } = await import("@/components/tools/workspaces/video");
        const html = renderToStaticMarkup(
            React.createElement(MemoryRouter, null, React.createElement(AiVideoEditingWorkspace)) as never,
        );

        expect(html).toContain("上传需要编辑的视频");
        expect(html).toContain("上传参考图");
        expect(html).toContain("视频类型");
        expect(html).toContain("视频编辑结果");
        expect(html).toContain(`0 / ${AI_VIDEO_EDITING_PROMPT_MAX}`);
        expect(html).toContain('data-testid="ai-video-editing-clip-label"');
        expect(html).toContain('data-testid="ai-video-editing-prompt"');
        expect(html).toContain('data-testid="ai-video-editing-optimize"');
        expect(html).toContain('data-testid="ai-video-editing-submit"');
        expect(html).toContain('data-testid="ai-video-editing-blocked"');
        expect(html).toContain('data-testid="ai-video-editing-hidden-prompt"');
        // 无源视频/参考图/模型时不可提交，且给出真实阻塞原因
        expect(html).toContain('data-testid="ai-video-editing-submit"');
        expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="ai-video-editing-submit"/);
        expect(html).toContain("先上传需要编辑的视频");
    });
});

/* ============================== D4：视频参数跟随截取区间 / 画幅 ============================== */

describe("AI_VIDEO_EDITING D4 视频请求参数", () => {
    function windowFor(durationSec: number, source: ToolAssetRecord) {
        return aiVideoEditingClipWindow(createAiVideoEditingState({ clipStart: 0, clipDuration: durationSec }), source);
    }

    test("横屏源视频 + 7.3 秒截取 → seconds 向上取整为 8，ratio 跟随 1920x1080", () => {
        const source = videoRecord({ width: 1920, height: 1080 });
        const params = aiVideoEditingVideoRequestParams({ window: windowFor(7.3, source), source });
        expect(params.seconds).toBe("8");
        expect(params.ratio).toBe("16:9");
    });

    test("竖屏源视频 → ratio 9:16；截取过短按 4 秒下限兜底", () => {
        const source = videoRecord({ width: 1080, height: 1920, durationMs: 20_000 });
        const params = aiVideoEditingVideoRequestParams({ window: windowFor(2.1, source), source });
        expect(params.ratio).toBe("9:16");
        expect(params.seconds).toBe("4");
    });

    test("源视频宽高未知 → 不瞎猜 ratio（保持全局配置），seconds 仍按截取区间", () => {
        const source = videoRecord({ width: undefined, height: undefined });
        const params = aiVideoEditingVideoRequestParams({ window: windowFor(12, source), source });
        expect(params.ratio).toBeUndefined();
        expect(params.seconds).toBe("12");
    });

    test("browserInput 真的带上 videoSeconds/videoRatio（gateway 才能覆盖全局 6 秒 · 1:1）", () => {
        const source = videoRecord({ width: 1920, height: 1080 });
        const input = readyInput({
            source,
            state: createAiVideoEditingState({ prompt: "把背景换成纯色，保留商品细节", clipDuration: 9 }),
        });
        const browserInput = buildAiVideoEditingBrowserInput({ ...input, referenceImages: [referenceImage(imageRecord())] });
        expect(browserInput.videoSeconds).toBe("9");
        expect(browserInput.videoRatio).toBe("16:9");
    });
});

/* ============================== D3：失效素材提交前拦截 ============================== */

describe("AI_VIDEO_EDITING D3 素材本地字节校验", () => {
    test("本地 Blob 读不到 → 报出具体素材名与重新上传指引", async () => {
        const issues = await collectAiVideoEditingAssetIssues([videoRecord(), imageRecord()], async () => null);
        expect(issues.length).toBe(2);
        expect(issues[0]).toContain("demo.mp4");
        expect(issues[0]).toContain("源视频");
        expect(issues[1]).toContain("asset-image-1.png");
        expect(issues[1]).toContain("参考图");
        expect(issues[0]).toContain("重新上传");
    });

    test("本地 Blob 存在 → 无阻塞项；空 Blob 视为失效", async () => {
        const blob = new Blob(["x"]);
        expect(await collectAiVideoEditingAssetIssues([videoRecord()], async () => blob)).toEqual([]);
        const issues = await collectAiVideoEditingAssetIssues([videoRecord()], async () => new Blob([]));
        expect(issues.length).toBe(1);
        expect(issues[0]).toContain("demo.mp4");
    });

    test("读取抛错（IndexedDB 被清理）也算失效，不吞异常", async () => {
        const issues = await collectAiVideoEditingAssetIssues([videoRecord()], async () => {
            throw new Error("NotFoundError");
        });
        expect(issues.length).toBe(1);
        expect(issues[0]).toContain("重新上传");
    });
});

/* ================== D2 补充：源视频已上传但时长读不出来 ================== */

describe("AI_VIDEO_EDITING D2 时长未知", () => {
    const hungSource = {
        id: "asset-1",
        toolId: AI_VIDEO_EDITING_TOOL_ID,
        kind: "sourceVideo",
        name: "hung.mp4",
        storageKey: "k1",
        url: "blob:u1",
        bytes: 1024,
        mimeType: "video/mp4",
        width: 1344,
        height: 768,
        durationMs: 0,
        createdAt: 0,
    } as never;

    test("有时长未知的源视频时不再谎称「待上传源视频」，而是提示读不到时长", () => {
        const window = aiVideoEditingClipWindow(createAiVideoEditingState(), hungSource);
        expect(window.reason).toBe("unknown-duration");
        expect(aiVideoEditingClipLabel(window)).toBe("时长未知");
        expect(aiVideoEditingOutputLabel(window)).toBe("1 条 · 时长未知");
        expect(window.notice).toContain("读不到时长");
    });

    test("时长未知 → 拒绝提交，并给出可操作原因（不能拿 0 秒去发请求）", () => {
        const window = aiVideoEditingClipWindow(createAiVideoEditingState(), hungSource);
        const capability = resolveAiVideoEditingCapability({
            model: "grok-imagine-video",
            hasSourceVideo: true,
            clip: window,
            referenceCount: 1,
            prompt: "把产品换成参考图里的耳机",
            gatewayRequiresReferences: true,
        });
        expect(capability.canSubmit).toBe(false);
        expect(capability.issues.join("|")).toContain("时长读取失败");
        expect(capability.missingFields).toContain("sourceVideoDuration");
    });

    test("还没上传源视频时仍是「待上传源视频」，两种状态不混淆", () => {
        const window = aiVideoEditingClipWindow(createAiVideoEditingState(), null);
        expect(window.reason).toBe("no-source");
        expect(aiVideoEditingClipLabel(window)).toBe("待上传源视频");
    });
});
