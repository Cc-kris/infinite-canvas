import { describe, expect, test } from "bun:test";

import {
    VIDEO_REPLICATION_FIELD_KEYS,
    VIDEO_REPLICATION_IMAGE_MIME_TYPES,
    VideoReplicationAdapterError,
    assertVideoReplicationInput,
    auditVideoReplicationFields,
    buildVideoReplicationBrowserInput,
    buildVideoReplicationFields,
    checkVideoReplicationClip,
    checkVideoReplicationReference,
    checkVideoReplicationVideo,
    toVideoReplicationVideoRef,
    videoReplicationFingerprint,
    videoReplicationMissingHints,
    videoReplicationResultView,
} from "@/features/tools/adapters/video-replication";
import {
    VIDEO_REPLICATION_PROMPT_LIMIT,
    VIDEO_REPLICATION_TOOL_ID,
    VIDEO_REPLICATION_VIDEO_LIMITS,
    composeVideoReplicationScriptDraft,
    createVideoReplicationValues,
    effectiveVideoReplicationSeconds,
    normalizeVideoReplicationClip,
    serializeVideoReplicationDraftValues,
    validateVideoReplicationState,
    videoReplicationClipReady,
    videoReplicationPromptCounter,
    videoReplicationPromptSegments,
    type VideoReplicationValues,
} from "@/features/tools/registry/video-replication";

const MB = 1024 * 1024;

function values(patch: Partial<VideoReplicationValues> = {}): VideoReplicationValues {
    return createVideoReplicationValues({ prompt: "夏季新款纯棉短袖，透气不闷汗。", sourceVideoDuration: 28, ...patch });
}

describe("registry：默认值与草稿", () => {
    test("默认值与原站契约一致", () => {
        const defaults = createVideoReplicationValues();
        expect(defaults.sourceMode).toBe("upload");
        expect(defaults.clipMode).toBe("auto");
        expect(defaults.resolution).toBe("720P");
        expect(defaults.videoTime).toBe("auto");
        expect(defaults.ratio).toBe("9:16");
        expect(defaults.saleCountry).toBe("US");
        expect(defaults.targetLanguage).toBe("en");
        expect(defaults.promptOptimizer).toBe(false);
        expect(defaults.refImageAssetIds).toEqual([]);
    });

    test("序列化/反序列化往返保持全部字段", () => {
        const source = values({ resolution: "1080P", ratio: "16:9", saleCountry: "JP", targetLanguage: "ja" });
        const restored = serializeVideoReplicationDraftValues(source);
        const parsed = JSON.parse(JSON.stringify(restored));
        expect(parsed.resolution).toBe("1080P");
        expect(parsed.ratio).toBe("16:9");
        expect(parsed.saleCountry).toBe("JP");
        expect(parsed.targetLanguage).toBe("ja");
    });
});

describe("registry：片段截取", () => {
    test("无原始时长时给出 5 秒最小可提交片段", () => {
        const clip = normalizeVideoReplicationClip(0, 0, 0);
        expect(clip.seconds).toBe(VIDEO_REPLICATION_VIDEO_LIMITS.clipMinSeconds);
        expect(clip.start).toBe(0);
    });

    test("片段上限收敛到 30 秒", () => {
        const clip = normalizeVideoReplicationClip(0, 100, 600);
        expect(clip.seconds).toBe(VIDEO_REPLICATION_VIDEO_LIMITS.clipMaxSeconds);
    });

    test("起点不能顶出原片尾部", () => {
        const clip = normalizeVideoReplicationClip(118, 120, 120);
        expect(clip.end).toBe(120);
        expect(clip.start).toBeLessThanOrEqual(115.1);
        expect(clip.seconds).toBeLessThanOrEqual(5.1);
    });

    test("原片不足 5 秒时 clipReady 必须为 false", () => {
        const short = values({ sourceVideoDuration: 4, clipMode: "manual", clipStart: 0, clipEnd: 4 });
        expect(videoReplicationClipReady(short)).toBe(false);
        const check = checkVideoReplicationClip(short);
        expect(check.ok).toBe(false);
    });

    test("合法片段 clipReady 为 true", () => {
        const ok = values({ clipMode: "manual", clipStart: 2, clipEnd: 10, sourceVideoDuration: 30 });
        expect(videoReplicationClipReady(ok)).toBe(true);
        expect(checkVideoReplicationClip(ok).ok).toBe(true);
    });

    test("Auto 时长跟随片段，固定时长优先", () => {
        const auto = values({ clipMode: "auto", clipStart: 0, clipEnd: 8, sourceVideoDuration: 8 });
        expect(effectiveVideoReplicationSeconds(auto)).toBe(8);
        const fixed = values({ videoTime: "10", clipStart: 0, clipEnd: 8, sourceVideoDuration: 8 });
        expect(effectiveVideoReplicationSeconds(fixed)).toBe(10);
    });
});

describe("adapter：资产校验", () => {
    test("参考视频只收 MP4/MOV 且 ≤100MB", () => {
        expect(checkVideoReplicationVideo({ name: "a.mp4", mimeType: "video/mp4", bytes: MB }).ok).toBe(true);
        expect(checkVideoReplicationVideo({ name: "a.avi", mimeType: "video/x-msvideo", bytes: MB }).ok).toBe(false);
        expect(checkVideoReplicationVideo({ name: "a.mp4", mimeType: "video/mp4", bytes: 200 * MB }).ok).toBe(false);
    });

    test("商品图 MIME 白名单与尺寸/大小边界", () => {
        expect(VIDEO_REPLICATION_IMAGE_MIME_TYPES).toContain("image/webp");
        const okImage = { name: "p.png", mimeType: "image/png", bytes: MB, width: 800, height: 800 };
        expect(checkVideoReplicationReference(okImage).ok).toBe(true);
        expect(checkVideoReplicationReference({ ...okImage, mimeType: "image/gif" }).ok).toBe(false);
        expect(checkVideoReplicationReference({ ...okImage, width: 100, height: 100 }).ok).toBe(false);
    });

    test("无本地地址的资产不能转成 ReferenceVideo", () => {
        const record = {
            id: "asset-1",
            kind: "video" as const,
            name: "a.mp4",
            storageKey: "k1",
            url: "",
            bytes: MB,
            mimeType: "video/mp4",
            createdAt: 1,
            origin: "upload" as const,
        };
        expect(() => toVideoReplicationVideoRef(record)).toThrow(VideoReplicationAdapterError);
    });
});

describe("adapter：字段契约与提示词", () => {
    const video = {
        assetId: "asset-1",
        name: "ref.mp4",
        url: "blob:ref",
        storageKey: "k1",
        mimeType: "video/mp4",
        bytes: 3 * MB,
        durationMs: 28_000,
    };

    test("27 字段全部产出且审计通过", () => {
        const fields = buildVideoReplicationFields({
            values: values(),
            video,
            references: [{ id: "img-1", name: "p.png", url: "blob:p", width: 800, height: 800 }],
        });
        for (const key of VIDEO_REPLICATION_FIELD_KEYS) {
            expect(key in fields).toBe(true);
        }
        const audit = auditVideoReplicationFields(fields);
        expect(audit.missing).toEqual([]);
        expect(audit.ok).toBe(true);
        expect(fields.imageSegUrl).toBe("");
        expect(fields.videoCoverType).toBe("");
        expect(fields.sourceVideoDuration).toBe(28);
    });

    test("缺字段必须被审计抓出来", () => {
        const fields = buildVideoReplicationFields({ values: values(), video, references: [] });
        delete (fields as Record<string, unknown>).ratio;
        const audit = auditVideoReplicationFields(fields);
        expect(audit.ok).toBe(false);
        expect(audit.missing).toContain("ratio");
    });

    test("提示词覆盖每个页面参数段", () => {
        const segments = videoReplicationPromptSegments(values({ ratio: "16:9", resolution: "1080P" }));
        expect(segments.text).toContain("16:9");
        expect(segments.text).toContain("1080P");
        expect(segments.text.length).toBeGreaterThan(20);
    });

    test("脚本草稿受字数上限约束", () => {
        const draft = composeVideoReplicationScriptDraft({ values: values() });
        expect(draft.length).toBeGreaterThan(0);
        const long = values({ prompt: "长".repeat(VIDEO_REPLICATION_PROMPT_LIMIT + 50) });
        const counter = videoReplicationPromptCounter(long);
        expect(counter.over).toBe(true);
    });

    test("模型缺失直接抛 model-missing", () => {
        expect(() =>
            assertVideoReplicationInput({
                values: values(),
                model: "   ",
                video,
                references: [{ id: "img-1", name: "p.png", url: "blob:p" }],
            }),
        ).toThrow(/模型/);
    });
});

describe("adapter：提交入参与结果视图", () => {
    const video = { assetId: "asset-1", name: "ref.mp4", url: "blob:ref", durationMs: 28_000 };
    const videoRef = { id: "asset-1", name: "ref.mp4", type: "video/mp4", url: "blob:ref" };
    const referenceImages = [{ id: "img-1", name: "p.png", url: "blob:p", type: "image/png" }] as never;

    test("gateway 入参带齐 prompt/references/videos/size", () => {
        const input = buildVideoReplicationBrowserInput({
            values: values(),
            model: "seedance-1.0-pro",
            video,
            references: [{ id: "img-1", name: "p.png", url: "blob:p" }],
            referenceImages,
            videoRef,
        });
        expect(input.toolId).toBe(VIDEO_REPLICATION_TOOL_ID);
        expect(input.model).toBe("seedance-1.0-pro");
        expect(input.size).toBe("9:16");
        expect(input.videos).toHaveLength(1);
        expect(input.fields?.prompt).toBe(input.prompt);
    });

    test("指纹随配置变化", () => {
        const base = videoReplicationFingerprint(values());
        expect(videoReplicationFingerprint(values())).toBe(base);
        expect(videoReplicationFingerprint(values({ ratio: "1:1" }))).not.toBe(base);
    });

    test("无任务时结果视图为 idle", () => {
        const view = videoReplicationResultView({ values: values() });
        expect(view.status).toBe("idle");
        expect(view.videos).toEqual([]);
        expect(view.stale).toBe(false);
    });

    test("配置变更后旧结果被标记 stale", () => {
        const submitted = videoReplicationFingerprint(values());
        const task = { id: "t1", toolId: VIDEO_REPLICATION_TOOL_ID, status: "succeeded", result: { items: [] } };
        const view = videoReplicationResultView({
            task: task as never,
            values: values({ ratio: "1:1" }),
            submittedFingerprint: submitted,
        });
        expect(view.stale).toBe(true);
        expect(view.message).toContain("旧配置");
    });

    test("缺口提示按顺序给出可执行动作", () => {
        const hints = videoReplicationMissingHints({ values: values(), videoReady: false, referenceCount: 0 });
        expect(hints.some((hint) => hint.includes("参考视频"))).toBe(true);
        const link = videoReplicationMissingHints({
            values: values({ sourceMode: "link" }),
            videoReady: false,
            referenceCount: 0,
        });
        expect(link.some((hint) => hint.includes("链接解析未接入"))).toBe(true);
    });
});

describe("registry：提交前校验", () => {
    const emptySource = { videoReady: false, linkResolved: false, referenceCount: 0, referenceIssues: [] };

    test("本地上传未就绪必须阻断", () => {
        const issues = validateVideoReplicationState(values(), emptySource);
        expect(issues.map((issue) => issue.code)).toContain("source-missing");
    });

    test("链接模式未解析必须阻断（不假装成功）", () => {
        const issues = validateVideoReplicationState(
            values({ sourceMode: "link", videoLink: "https://www.tiktok.com/@x/video/1" }),
            { ...emptySource, linkResolved: false },
        );
        expect(issues.map((issue) => issue.code)).toContain("link-unresolved");
    });

    test("商品图超过 6 张必须阻断", () => {
        const issues = validateVideoReplicationState(values(), { ...emptySource, videoReady: true, referenceCount: 7 });
        expect(issues.map((issue) => issue.code)).toContain("references-overflow");
    });

    test("脚本为空必须阻断", () => {
        const issues = validateVideoReplicationState(values({ prompt: "" }), {
            ...emptySource,
            videoReady: true,
            referenceCount: 1,
        });
        expect(issues.map((issue) => issue.code)).toContain("prompt-missing");
    });

    test("全量就绪时无阻断项", () => {
        const issues = validateVideoReplicationState(values(), {
            ...emptySource,
            videoReady: true,
            referenceCount: 1,
        });
        expect(issues).toEqual([]);
    });
});
