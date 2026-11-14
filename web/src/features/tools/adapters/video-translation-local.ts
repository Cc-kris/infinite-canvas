/** VIDEO_TRANSLATION 原片译制：ASR / 文本翻译 / TTS / 字幕封装，不经过视频生成模型。 */
import { createVideoTranslationPipeline, transcribeToolVideo } from "@/services/api/tools/content-analysis";
import { translateVideoPreservingSource, type VideoTranslationProgress, type VideoTranslationStage } from "@/services/api/tools/ffmpeg-media";
import { computeFingerprint, createTaskRecord, transitionTask, type ToolTask } from "@/services/api/tools/task-machine";
import type { AiConfig } from "@/stores/use-config-store";
import { VIDEO_TRANSLATION_TOOL_ID, videoTranslationFingerprint, type VideoTranslationValues } from "@/features/tools/registry/video-translation";
import type { VideoTranslationSource } from "./video-translation";
import { checkVideoTranslationSource } from "./video-translation";

export { transcribeToolVideo };
export type { VideoTranslationProgress, VideoTranslationStage };

export type VideoTranslationLocalPort = {
    run: typeof translateVideoPreservingSource;
    save: (task: ToolTask) => void;
};

export async function createVideoTranslationLocalPort(): Promise<VideoTranslationLocalPort> {
    const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
    return { run: translateVideoPreservingSource, save: (task) => useToolTaskStore.getState().upsertTask(task) };
}

export function checkVideoTranslationPipelineConfig(config: AiConfig): string[] {
    const blockers: string[] = [];
    if (!(config.textModel || config.model).trim()) blockers.push("请配置文本模型用于逐句翻译");
    if (!config.audioModel.trim()) blockers.push("请配置音频模型：ASR 使用 /audio/transcriptions，TTS 使用 /audio/speech");
    return blockers;
}

export async function runVideoTranslationLocalTask(input: {
    values: VideoTranslationValues;
    source: VideoTranslationSource;
    video: Blob;
    config: AiConfig;
    port: VideoTranslationLocalPort;
    draftRevision?: number | string | null;
    onProgress?: (progress: VideoTranslationProgress) => void;
}): Promise<ToolTask> {
    const pipelineBlockers = checkVideoTranslationPipelineConfig(input.config);
    if (pipelineBlockers.length) throw new Error(pipelineBlockers[0]);
    const sourceIssue = checkVideoTranslationSource(input.source).find((issue) => issue.severity === "block");
    if (sourceIssue) throw new Error(sourceIssue.message);
    const count = Math.max(1, Math.min(4, Math.round(Number(input.values.outputNum) || 1)));
    const ratio = input.values.outputRatio || "source";
    const values = { ...input.values, outputNum: count, outputRatio: ratio };
    if (!input.video.size) throw new Error("原视频为空，无法开始译制");
    let task = createTaskRecord({
        toolId: VIDEO_TRANSLATION_TOOL_ID,
        capability: "video",
        prompt: `保留原片画面：${values.sourceLanguage} → ${values.targetLanguage}（ASR / 翻译 / TTS / 字幕）`,
        configSnapshot: { capability: "video", model: "local-ffmpeg", count: String(count), aspectRatio: ratio },
        sourceAssetIds: [input.source.assetId],
        draftRevision: input.draftRevision,
        fingerprint: computeFingerprint({
            toolId: VIDEO_TRANSLATION_TOOL_ID,
            capability: "video",
            prompt: videoTranslationFingerprint(values),
            configSnapshot: { capability: "video", model: "local-ffmpeg", count: String(count), aspectRatio: ratio },
            sourceAssetIds: [input.source.assetId],
        }),
    });
    try {
        for (const status of ["validating", "submitting", "running"] as const) {
            task = transitionTask(task, status, status === "submitting" ? { attempts: 1 } : undefined);
            input.port.save(task);
        }
        const result = await input.port.run({
            video: input.video,
            sourceLanguage: values.sourceLanguage,
            targetLanguage: values.targetLanguage,
            outputRatio: ratio,
            ports: createVideoTranslationPipeline(input.config),
            onProgress: input.onProgress,
        });
        if (!result.blob.size) throw new Error("译制管线返回了空视频");
        const items = Array.from({ length: count }, (_, idx) => ({
            id: `${task.id}-video-${idx + 1}`,
            kind: "video" as const,
            blob: result.blob,
            mimeType: result.blob.type || "video/mp4",
            bytes: result.blob.size,
        }));
        task = transitionTask(task, "succeeded", {
            result: { items, receivedAt: Date.now() },
            inputSnapshot: {
                mode: values.mode || "standard",
                sourceLanguage: values.sourceLanguage,
                targetLanguage: values.targetLanguage,
                outputRatio: ratio,
                outputNum: count,
                sourceTranscript: result.transcript.text,
                translatedSegments: result.transcript.segments,
                subtitles: result.subtitles,
            },
        });
        input.port.save(task);
        return task;
    } catch (cause) {
        task = transitionTask(task, "failed", {
            error: {
                code: typeof cause === "object" && cause && "code" in cause ? String(cause.code) : "translation-pipeline-incomplete",
                message: cause instanceof Error ? cause.message : "原片译制失败",
                retryable: false,
            },
        });
        input.port.save(task);
        return task;
    }
}
