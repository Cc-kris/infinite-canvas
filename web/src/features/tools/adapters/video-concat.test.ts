import { describe, expect, test } from "bun:test";

import type { ToolTask } from "@/services/api/tools/task-machine";

import {
    VIDEO_CONCAT_FIELD_KEYS,
    assertVideoConcatInput,
    auditVideoConcatFields,
    buildVideoConcatBrowserInput,
    buildVideoConcatFields,
    buildVideoConcatVideoList,
    mapVideoConcatFailure,
    resolveVideoConcatProviderCapability,
    toVideoConcatReferenceImage,
    toVideoConcatReferenceVideo,
    videoConcatResultView,
} from "./video-concat";

import {
    VIDEO_CONCAT_MAX_CLIPS,
    VIDEO_CONCAT_MIN_CLIPS,
    VIDEO_CONCAT_SOURCE_RULE,
    VIDEO_CONCAT_TRIM_MIN_MS,
    applyVideoConcatDraft,
    checkVideoConcatClipSource,
    createVideoConcatSnapshot,
    createVideoConcatState,
    effectiveVideoConcatSeconds,
    isVideoConcatSnapshotStale,
    moveVideoConcatClip,
    normalizeVideoConcatClip,
    parseVideoConcatDraftValues,
    removeVideoConcatClip,
    resetVideoConcatTrim,
    serializeVideoConcatDraftValues,
    trimVideoConcatClip,
    validateVideoConcatState,
    videoConcatClipMs,
    videoConcatOutputLabel,
    videoConcatTotalMs,
    type VideoConcatClip,
    type VideoConcatCover,
} from "../registry/video-concat";

function clip(id: string, durationMs: number, extra: Partial<VideoConcatClip> = {}): VideoConcatClip {
    return normalizeVideoConcatClip({
        id,
        assetId: id,
        name: `${id}.mp4`,
        url: `blob:${id}`,
        mimeType: "video/mp4",
        bytes: 1024,
        durationMs,
        ...extra,
    });
}

const cover: VideoConcatCover = {
    source: "frame",
    url: "data:image/png;base64,AAAA",
    name: "frame-1.png",
    mimeType: "image/png",
    bytes: 2048,
};

function readyState(clips: VideoConcatClip[] = [clip("a", 4000), clip("b", 6000)]) {
    return createVideoConcatState({ clips, cover });
}

describe("video-concat registry · 片段", () => {
    test("裁剪区间被夹到真实时长内，不会出现 end > duration", () => {
        const value = normalizeVideoConcatClip({
            id: "x",
            url: "blob:x",
            mimeType: "video/mp4",
            durationMs: 5000,
            startMs: 4200,
            endMs: 9000,
        });
        expect(value.startMs).toBeLessThanOrEqual(5000 - VIDEO_CONCAT_TRIM_MIN_MS);
        expect(value.endMs).toBe(5000);
    });

    test("裁剪不足 300ms 会被抬到最小区间", () => {
        const value = trimVideoConcatClip(clip("a", 5000), { startMs: 1000, endMs: 1010 });
        expect(value.endMs - value.startMs).toBeGreaterThanOrEqual(VIDEO_CONCAT_TRIM_MIN_MS);
    });

    test("时长未知时 start/end 都为 0，交给校验层阻断", () => {
        const value = clip("a", 0);
        expect(value.durationMs).toBe(0);
        expect(value.startMs).toBe(0);
        expect(value.endMs).toBe(0);
        expect(videoConcatClipMs(value)).toBe(0);
    });

    test("clipMs 按裁剪区间计算而不是整段时长", () => {
        const value = trimVideoConcatClip(clip("a", 10000), { startMs: 2000, endMs: 5000 });
        expect(videoConcatClipMs(value)).toBe(3000);
    });

    test("resetVideoConcatTrim 还原为整段", () => {
        const trimmed = trimVideoConcatClip(clip("a", 8000), { startMs: 1000, endMs: 3000 });
        const reset = resetVideoConcatTrim(trimmed);
        expect(reset.startMs).toBe(0);
        expect(reset.endMs).toBe(8000);
    });

    test("move 交换顺序，越界返回原顺序副本", () => {
        const list = [clip("a", 1000), clip("b", 1000), clip("c", 1000)];
        expect(moveVideoConcatClip(list, 0, 1).map((item) => item.id)).toEqual(["b", "a", "c"]);
        expect(moveVideoConcatClip(list, 2, 1).map((item) => item.id)).toEqual(["a", "b", "c"]);
        expect(moveVideoConcatClip(list, -1, 1).map((item) => item.id)).toEqual(["a", "b", "c"]);
    });

    test("remove 按索引删除，越界不删", () => {
        const list = [clip("a", 1000), clip("b", 1000)];
        expect(removeVideoConcatClip(list, 0).map((item) => item.id)).toEqual(["b"]);
        expect(removeVideoConcatClip(list, 9)).toHaveLength(2);
    });

    test("总时长 = 各片段裁剪时长之和", () => {
        const list = [
            trimVideoConcatClip(clip("a", 5000), { startMs: 0, endMs: 2000 }),
            trimVideoConcatClip(clip("b", 5000), { startMs: 1000, endMs: 4000 }),
        ];
        expect(videoConcatTotalMs(list)).toBe(5000);
    });

    test("auto 时长跟随总时长并四舍五入到整秒", () => {
        expect(effectiveVideoConcatSeconds({ videoTime: "auto", clips: [clip("a", 2400), clip("b", 2400)] })).toBe(5);
        expect(effectiveVideoConcatSeconds({ videoTime: 10, clips: [clip("a", 2400)] })).toBe(10);
        expect(effectiveVideoConcatSeconds({ videoTime: "auto", clips: [] })).toBe(0);
    });

    test("输出文案区分“未添加/时长未知/真实秒数”", () => {
        expect(videoConcatOutputLabel(createVideoConcatState())).toBe("未添加片段");
        expect(videoConcatOutputLabel(createVideoConcatState({ clips: [clip("a", 0)], cover }))).toContain("时长未知");
        expect(videoConcatOutputLabel(readyState())).toContain("2 段");
    });
});

describe("video-concat registry · 源文件校验", () => {
    test("格式不支持直接报 clip-mime", () => {
        expect(checkVideoConcatClipSource({ name: "a.avi", mimeType: "video/x-msvideo", bytes: 10 })?.code).toBe("clip-mime");
    });

    test("超过大小上限报 clip-too-large", () => {
        const issue = checkVideoConcatClipSource({
            name: "big.mp4",
            mimeType: "video/mp4",
            bytes: VIDEO_CONCAT_SOURCE_RULE.maxBytes + 1,
        });
        expect(issue?.code).toBe("clip-too-large");
    });

    test("过短/过长都能识别", () => {
        expect(
            checkVideoConcatClipSource({ name: "s.mp4", mimeType: "video/mp4", bytes: 10, durationMs: 100 })?.code,
        ).toBe("clip-too-short");
        expect(
            checkVideoConcatClipSource({
                name: "l.mp4",
                mimeType: "video/mp4",
                bytes: 10,
                durationMs: VIDEO_CONCAT_SOURCE_RULE.maxClipMs + 1,
            })?.code,
        ).toBe("clip-too-long");
    });

    test("合法片段返回 null（不是伪造 ok 对象）", () => {
        expect(checkVideoConcatClipSource({ name: "a.mp4", mimeType: "video/mp4", bytes: 10, durationMs: 4000 })).toBeNull();
    });
});

describe("video-concat registry · 目录级校验", () => {
    test("没有片段报 no-clips", () => {
        const issues = validateVideoConcatState({ state: createVideoConcatState(), model: "m" });
        expect(issues.map((issue) => issue.code)).toContain("no-clips");
    });

    test("只有 1 段报 too-few-clips（下限确实是 2）", () => {
        const issues = validateVideoConcatState({ state: createVideoConcatState({ clips: [clip("a", 4000)], cover }), model: "m" });
        expect(issues.map((issue) => issue.code)).toContain("too-few-clips");
        expect(VIDEO_CONCAT_MIN_CLIPS).toBe(2);
    });

    test("超过上限报 too-many-clips", () => {
        const clips = Array.from({ length: VIDEO_CONCAT_MAX_CLIPS + 1 }, (_, index) => clip(`c${index}`, 2000));
        const issues = validateVideoConcatState({ state: createVideoConcatState({ clips, cover }), model: "m" });
        expect(issues.map((issue) => issue.code)).toContain("too-many-clips");
    });

    test("同一资产加两次报 duplicate-clip", () => {
        const first = clip("a", 4000);
        const issues = validateVideoConcatState({ state: createVideoConcatState({ clips: [first, first], cover }), model: "m" });
        expect(issues.map((issue) => issue.code)).toContain("duplicate-clip");
    });

    test("时长读不到报 clip-duration-unknown（不猜值提交）", () => {
        const issues = validateVideoConcatState({
            state: createVideoConcatState({ clips: [clip("a", 0), clip("b", 4000)], cover }),
            model: "m",
        });
        expect(issues.map((issue) => issue.code)).toContain("clip-duration-unknown");
    });

    test("缺封面 / 缺模型各自给一条阻断", () => {
        const noCover = validateVideoConcatState({ state: createVideoConcatState({ clips: [clip("a", 4000), clip("b", 4000)] }), model: "m" });
        expect(noCover.map((issue) => issue.code)).toContain("cover-missing");
        const noModel = validateVideoConcatState({ state: readyState(), model: "  " });
        expect(noModel.map((issue) => issue.code)).toContain("model-missing");
    });

    test("完整状态零问题（说明字段名与阈值自洽）", () => {
        expect(validateVideoConcatState({ state: readyState(), model: "veo-3" })).toHaveLength(0);
    });
});

describe("video-concat registry · 快照与草稿", () => {
    const built = () =>
        createVideoConcatSnapshot({
            state: readyState(),
            model: " veo-3 ",
            draftRevision: 7,
            clientOperationId: "op-1",
        });

    test("快照记录真实秒数、裁剪区间与去空格的模型名", () => {
        const snapshot = built();
        expect(snapshot.model).toBe("veo-3");
        expect(snapshot.videoTime).toBe(10);
        expect(snapshot.clips).toHaveLength(2);
        expect(snapshot.clips[0]).toEqual({ assetId: "a", startMs: 0, endMs: 4000, durationMs: 4000 });
        expect(snapshot.draftRevision).toBe(7);
    });

    test("比例/时长/裁剪/封面任一变化都判定过期", () => {
        const snapshot = built();
        const same = built();
        expect(isVideoConcatSnapshotStale(snapshot, same)).toBe(false);

        const ratioChanged = createVideoConcatSnapshot({
            state: { ...readyState(), videoRatio: "16:9" },
            model: "veo-3",
            clientOperationId: "op-1",
        });
        expect(isVideoConcatSnapshotStale(snapshot, ratioChanged)).toBe(true);

        const trimmed = createVideoConcatSnapshot({
            state: readyState([trimVideoConcatClip(clip("a", 4000), { startMs: 500, endMs: 1000 }), clip("b", 6000)]),
            model: "veo-3",
            clientOperationId: "op-1",
        });
        expect(isVideoConcatSnapshotStale(snapshot, trimmed)).toBe(true);
    });

    test("草稿只存稳定事实：资产 id + 裁剪区间，不含 blob url", () => {
        const draft = serializeVideoConcatDraftValues(readyState());
        expect(draft.trims).toEqual([
            { assetId: "a", startMs: 0, endMs: 4000 },
            { assetId: "b", startMs: 0, endMs: 6000 },
        ]);
        expect(JSON.stringify(draft)).not.toContain("blob:");
    });

    test("草稿解析对非法输入整体丢弃", () => {
        expect(parseVideoConcatDraftValues({ videoRatio: 123 })).toBeNull();
        expect(parseVideoConcatDraftValues(null)).toBeNull();
        const parsed = parseVideoConcatDraftValues({
            videoRatio: "16:9",
            videoTime: 10,
            clips: [{ assetId: "a", startMs: 0, endMs: 1000 }],
            coverSource: "frame",
        });
        expect(parsed?.videoRatio).toBe("16:9");
        expect(parsed?.trims).toHaveLength(1);
    });

    test("草稿裁剪按资产 id 对齐，时长仍以真实 metadata 为准", () => {
        const draft = parseVideoConcatDraftValues({
            videoRatio: "9:16",
            clips: [{ assetId: "a", startMs: 1000, endMs: 99_000 }],
        });
        const applied = applyVideoConcatDraft([clip("a", 4000), clip("b", 3000)], draft);
        expect(applied[0].startMs).toBe(1000);
        expect(applied[0].endMs).toBe(4000);
        expect(applied[1].endMs).toBe(3000);
    });
});

describe("video-concat adapter · 通道能力（证据来自真实分支）", () => {
    test("openai 通道：多段参考视频声明支持且不阻断", () => {
        const capability = resolveVideoConcatProviderCapability({ model: "sora-2", apiFormat: "openai" });
        expect(capability.channel).toBe("openai");
        expect(capability.blocked).toBe(false);
        expect(capability.evidence.multiReference).toBe("supported");
    });

    test("gemini 通道：只发 videos[0]，阻断并给出 maxInputVideos=1", () => {
        const capability = resolveVideoConcatProviderCapability({ model: "veo-3", apiFormat: "gemini" });
        expect(capability.blocked).toBe(true);
        expect(capability.maxInputVideos).toBe(1);
        expect(capability.blockers[0]).toContain("第 1 段");
    });

    test("http 通道：提交模板没有 videos 字段，阻断且 maxInputVideos=0", () => {
        const capability = resolveVideoConcatProviderCapability({ model: "kling", apiFormat: "http" });
        expect(capability.blocked).toBe(true);
        expect(capability.maxInputVideos).toBe(0);
    });

    test("插件脚本与未知通道都按“无证据”阻断，不默认支持", () => {
        expect(resolveVideoConcatProviderCapability({ model: "x", apiFormat: "openai", hasPluginScript: true }).blocked).toBe(true);
        const unknown = resolveVideoConcatProviderCapability({ model: "x" });
        expect(unknown.channel).toBe("unknown");
        expect(unknown.blocked).toBe(true);
        expect(unknown.evidence.multiReference).toBe("unknown");
    });

    test("没选模型时直接阻断", () => {
        const capability = resolveVideoConcatProviderCapability({ model: "   " });
        expect(capability.blocked).toBe(true);
        expect(capability.blockers[0]).toContain("模型");
    });
});

describe("video-concat adapter · 字段与请求", () => {
    test("10 个 registry 字段一次落齐，审计无缺失", () => {
        const state = readyState();
        const fields = buildVideoConcatFields({ state, model: "veo-3" });
        expect(Object.keys(fields).sort()).toEqual([...VIDEO_CONCAT_FIELD_KEYS].sort());
        expect(auditVideoConcatFields(fields)).toHaveLength(0);
    });

    test("缺封面时审计能指出 videoCoverUrl（不静默通过）", () => {
        const fields = buildVideoConcatFields({ state: createVideoConcatState({ clips: [clip("a", 4000)] }), model: "veo-3" });
        expect(auditVideoConcatFields(fields)).toContain("videoCoverUrl");
    });

    test("videoList 保留顺序与裁剪信息", () => {
        const list = buildVideoConcatVideoList([
            trimVideoConcatClip(clip("a", 4000), { startMs: 0, endMs: 2000 }),
            clip("b", 3000),
        ]);
        expect(list.map((item) => item.index)).toEqual([1, 2]);
        expect(list[0].seconds).toBe(2);
        expect(list[1].endMs).toBe(3000);
    });

    test("浏览器入参：prompt 写清段数、封面与比例，references=封面，videos=片段", () => {
        const input = buildVideoConcatBrowserInput({ state: readyState(), model: "veo-3" });
        expect(input.toolId).toBe("VIDEO_CONCAT");
        expect(input.references).toHaveLength(1);
        expect(input.videos).toHaveLength(2);
        expect(input.prompt).toContain("2 段");
        expect(input.prompt).toContain("9:16");
        expect(input.fields?.videoCoverUrl).toBe(cover.url);
    });

    test("封面为上传图时 referenceImage 用 url 而不是空 dataUrl", () => {
        const image = toVideoConcatReferenceImage({
            source: "upload",
            url: "https://cdn.example.com/c.png",
            storageKey: "media:cover",
            name: "c.png",
            mimeType: "image/png",
            bytes: 4096,
        });
        expect(image.dataUrl).toBe("");
        expect(image.url).toBe("https://cdn.example.com/c.png");
        expect(image.storageKey).toBe("media:cover");
    });

    test("片段转参考视频时保留 storageKey（provider 侧据此取真实 Blob）", () => {
        const video = toVideoConcatReferenceVideo(clip("a", 4000, { storageKey: "media:a" }));
        expect(video.storageKey).toBe("media:a");
        expect(video.durationMs).toBe(4000);
    });

    test("submit 前断言：缺封面抛 cover-missing，缺模型抛 model-missing", () => {
        expect(() =>
            assertVideoConcatInput({ state: createVideoConcatState({ clips: [clip("a", 4000), clip("b", 4000)] }), model: "veo-3" }),
        ).toThrow(/封面/);
        expect(() => assertVideoConcatInput({ state: readyState(), model: "" })).toThrow(/模型/);
    });

    test("submit 前断言：通道阻断时抛对应 code，而不是放过", () => {
        let code = "";
        try {
            assertVideoConcatInput({ state: readyState(), model: "veo-3" });
        } catch (error) {
            code = (error as { code?: string }).code ?? "";
        }
        expect(code).toBe("channel-unverified");

        let geminiCode = "";
        try {
            assertVideoConcatInput({
                state: readyState(),
                model: "veo-3",
                capability: resolveVideoConcatProviderCapability({ model: "veo-3", apiFormat: "gemini" }),
            });
        } catch (error) {
            geminiCode = (error as { code?: string }).code ?? "";
        }
        expect(geminiCode).toBe("channel-single-video-only");
    });

    test("合法状态 + openai 能力可正常通过断言", () => {
        expect(() =>
            assertVideoConcatInput({
                state: readyState(),
                model: "sora-2",
                capability: resolveVideoConcatProviderCapability({ model: "sora-2", apiFormat: "openai" }),
            }),
        ).not.toThrow();
    });
});

describe("video-concat adapter · 失败与结果", () => {
    test("已知错误码映射为用户下一步动作", () => {
        const failure = mapVideoConcatFailure({ code: "channel-single-video-only" });
        expect(failure.retryable).toBe(false);
        expect(failure.nextStep).toContain("多段");
    });

    test("空结果码 retryable=true（提示先查询，不重复提交）", () => {
        const failure = mapVideoConcatFailure({ code: "empty-video-result" });
        expect(failure.retryable).toBe(true);
        expect(failure.nextStep).toContain("查询");
    });

    test("未知错误码保留上游原文，不改写成成功", () => {
        const failure = mapVideoConcatFailure({ code: "weird-code", message: "上游说：区域不支持" });
        expect(failure.message).toBe("上游说：区域不支持");
        expect(failure.code).toBe("weird-code");
    });

    test("无任务时结果视图是“尚未提交”，不带任何伪造产物", () => {
        const view = videoConcatResultView(null);
        expect(view.statusText).toBe("尚未提交");
        expect(view.videoUrl).toBeNull();
        expect(view.itemCount).toBe(0);
    });

    test("成功任务取真实视频 url 并给出耗时", () => {
        const view = videoConcatResultView({
            status: "succeeded",
            createdAt: 1000,
            finishedAt: 6000,
            result: { items: [{ kind: "video", url: "https://cdn/x.mp4" }] },
        } as unknown as ToolTask);
        expect(view.statusText).toBe("已完成");
        expect(view.videoUrl).toBe("https://cdn/x.mp4");
        expect(view.totalMs).toBe(5000);
    });

    test("上游报告成功但没有视频 → 明确说没返回视频，不冒充完成产物", () => {
        const view = videoConcatResultView({
            status: "succeeded",
            result: { items: [{ kind: "image", url: "https://cdn/x.png" }] },
        } as unknown as ToolTask);
        expect(view.videoUrl).toBeNull();
        expect(view.statusText).toContain("没有返回视频");
    });

    test("失败任务把 error 转成可执行提示；等待中显示生成中", () => {
        const failed = videoConcatResultView({
            status: "failed",
            error: { code: "provider-busy", message: "busy", retryable: true },
        } as unknown as ToolTask);
        expect(failed.failure?.code).toBe("provider-busy");
        const running = videoConcatResultView({ status: "running" } as unknown as ToolTask);
        expect(running.statusText).toBe("生成中");
    });
});
