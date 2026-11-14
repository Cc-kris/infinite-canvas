import { describe, expect, test } from "bun:test";

import { buildVideoTranslationSubtitles, MediaProcessingError, videoConcatDimensions } from "./ffmpeg-media";
import { createVideoConcatState, normalizeVideoConcatClip } from "@/features/tools/registry/video-concat";

describe("FFmpeg 媒体处理纯函数", () => {
    test("拼接输出按所选比例完整容纳首帧，不拉伸画面", () => {
        const state = createVideoConcatState({ videoRatio: "1:1", clips: [normalizeVideoConcatClip({ id: "a", url: "blob:a", width: 1920, height: 1080, durationMs: 2000 })] });
        expect(videoConcatDimensions(state)).toEqual({ width: 1080, height: 1080 });
    });

    test("字幕严格使用 ASR 时间段与逐句译文", () => {
        const value = buildVideoTranslationSubtitles([{ startMs: 500, endMs: 2500, text: "真实译文" }]);
        expect(value).toContain("00:00:00.500 --> 00:00:02.500");
        expect(value).toContain("真实译文");
    });

    test("缺逐句时间轴时明确阻断", () => {
        expect(() => buildVideoTranslationSubtitles([])).toThrow(MediaProcessingError);
        expect(() => buildVideoTranslationSubtitles([{ startMs: 100, endMs: 100, text: "无时长" }])).toThrow("时间轴");
    });
});
