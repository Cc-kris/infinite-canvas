import { describe, expect, test } from "bun:test";

import { createVideoTranslationValues, type VideoTranslationValues } from "@/features/tools/registry/video-translation";
import { runVideoTranslationLocalTask, type VideoTranslationLocalPort } from "./video-translation-local";
import type { VideoTranslationSource } from "./video-translation";
import type { AiConfig } from "@/stores/use-config-store";

const values: VideoTranslationValues = createVideoTranslationValues({ sourceLanguage: "auto", targetLanguage: "en", lipSync: false });
const source: VideoTranslationSource = { assetId: "source", name: "source.mp4", url: "blob:source", storageKey: "source", bytes: 100, mimeType: "video/mp4", durationMs: 5000 };
const config = { textModel: "text", audioModel: "audio" } as AiConfig;

describe("VIDEO_TRANSLATION 原片译制任务", () => {
    test("成功结果来自真实管线 Blob，并保存原转录、译文与字幕", async () => {
        const blob = new Blob(["translated-video"], { type: "video/mp4" });
        const port: VideoTranslationLocalPort = {
            run: async (input) => {
                expect(input.video.size).toBe(4);
                expect(input.ports).toBeDefined();
                return { blob, transcript: { text: "source speech", segments: [{ startMs: 0, endMs: 1000, text: "translated" }] }, subtitles: "WEBVTT\n\ntranslated" };
            },
            save: () => undefined,
        };
        const task = await runVideoTranslationLocalTask({ values, source, video: new Blob(["test"]), config, port });
        expect(task.status).toBe("succeeded");
        expect(task.result?.items[0].blob).toBe(blob);
        expect(task.inputSnapshot?.mode).toBe("source-preserving-translation");
        expect(task.inputSnapshot?.sourceTranscript).toBe("source speech");
        expect(task.configSnapshot.model).toBe("local-ffmpeg");
        expect(task.upstreamTaskId).toBeUndefined();
    });

    test("真实管线空结果也失败，不写入成功任务", async () => {
        const task = await runVideoTranslationLocalTask({
            values, source, video: new Blob(["test"]), config,
            port: { run: async () => ({ blob: new Blob(), transcript: { text: "source", segments: [] }, subtitles: "" }), save: () => undefined },
        });
        expect(task.status).toBe("failed");
        expect(task.result).toBeUndefined();
    });

    test("管线失败保留错误且没有结果", async () => {
        const task = await runVideoTranslationLocalTask({
            values, source, video: new Blob(["test"]), config,
            port: { run: async () => { throw new Error("ASR 未开通"); }, save: () => undefined },
        });
        expect(task.status).toBe("failed");
        expect(task.error?.message).toBe("ASR 未开通");
        expect(task.result).toBeUndefined();
    });

    test("未配置 ASR/TTS 或文本模型时不创建任务", async () => {
        let called = false;
        await expect(runVideoTranslationLocalTask({
            values, source, video: new Blob(["test"]), config: {} as AiConfig,
            port: { run: async () => { called = true; throw new Error(); }, save: () => undefined },
        })).rejects.toThrow("文本模型");
        expect(called).toBe(false);
    });
});
