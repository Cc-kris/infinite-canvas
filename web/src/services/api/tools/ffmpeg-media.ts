/**
 * 媒体处理。渲染层只负责取本地字节并上传，真正的转码/拼接/抽音轨由主进程的
 * 本地服务调用原生 ffmpeg 完成，不再加载 FFmpeg.wasm。
 */
import { uploadTempMedia, requestConcatVideo, requestExtractedAudio, requestMuxVideo } from "@/services/api/desktop/capabilities/media";
import { readToolAssetBlob } from "@/services/api/tools/assets";
import { videoConcatTotalMs, type VideoConcatState } from "@/features/tools/registry/video-concat";

export type MediaProcessingErrorCode = "source-unavailable" | "empty-media" | "media-processing-failed" | "translation-pipeline-incomplete";

export class MediaProcessingError extends Error {
    readonly code: MediaProcessingErrorCode;
    constructor(code: MediaProcessingErrorCode, message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = "MediaProcessingError";
        this.code = code;
    }
}

export type VideoTranslationStage = "extract-audio" | "transcribe" | "translate" | "synthesize" | "mux";
export type VideoTranslationProgress = { stage: VideoTranslationStage; message: string };

export type TranscriptionSegment = { startMs: number; endMs: number; text: string };
export type VideoTranscription = { text: string; language?: string; segments?: TranscriptionSegment[] };
export type TranscriptionResult = VideoTranscription & { segments: TranscriptionSegment[] };

export type VideoTranslationPipelinePorts = {
    transcribe: (audio: Blob, sourceLanguage: string) => Promise<TranscriptionResult>;
    translate: (segments: TranscriptionSegment[], sourceLanguage: string, targetLanguage: string) => Promise<TranscriptionSegment[]>;
    synthesize: (text: string, targetLanguage: string) => Promise<Blob>;
};

export type VideoTranslationResult = {
    blob: Blob;
    transcript: VideoTranscription;
    subtitles: string;
};

function mediaError(cause: unknown, fallback = "媒体处理失败，请检查视频编码后重试"): MediaProcessingError {
    if (cause instanceof MediaProcessingError) return cause;
    return new MediaProcessingError("media-processing-failed", cause instanceof Error ? cause.message : fallback, { cause });
}

function fileExtension(mimeType: string) {
    return mimeType.includes("quicktime") ? "mov" : mimeType.includes("webm") ? "webm" : "mp4";
}

function even(value: number) {
    return Math.max(2, Math.round(value / 2) * 2);
}

export function videoConcatDimensions(state: VideoConcatState): { width: number; height: number } {
    const first = state.clips[0];
    const width = first?.width || 0;
    const height = first?.height || 0;
    const [ratioWidth, ratioHeight] = state.videoRatio.split(":").map(Number);
    if (!width || !height || !ratioWidth || !ratioHeight) {
        throw new MediaProcessingError("media-processing-failed", "读不到片段画面尺寸，无法按所选比例合成");
    }
    let outputWidth = width;
    let outputHeight = (width * ratioHeight) / ratioWidth;
    if (outputHeight > height) {
        outputHeight = height;
        outputWidth = (height * ratioWidth) / ratioHeight;
    }
    return { width: even(outputWidth), height: even(outputHeight) };
}

/** 各片段先独立按实际起止时间解码，再按列表顺序 concat；不裁掉后续片段凑固定档。 */
export async function concatenateVideoClips(state: VideoConcatState): Promise<Blob> {
    try {
        videoConcatDimensions(state);
        const clips = [];
        for (const [index, clip] of state.clips.entries()) {
            if (!clip.storageKey) throw new MediaProcessingError("source-unavailable", `「${clip.name}」缺少本地文件，请重新上传`);
            const blob = await readToolAssetBlob(clip.storageKey);
            if (!blob?.size) throw new MediaProcessingError("source-unavailable", `「${clip.name}」本地数据已失效，请重新上传`);
            const uploaded = await uploadTempMedia(blob, `concat-input-${index}.${fileExtension(clip.mimeType)}`);
            clips.push({ id: uploaded.id, name: clip.name, mimeType: clip.mimeType, startMs: clip.startMs, endMs: clip.endMs, width: clip.width, height: clip.height });
        }
        const targetSeconds = typeof state.videoTime === "number" && state.videoTime > 0 ? state.videoTime : 0;
        const result = await requestConcatVideo({ clips, videoTime: targetSeconds, videoRatio: state.videoRatio });
        if (!result.size) throw new MediaProcessingError("empty-media", "合成结果为空，已拒绝返回");
        return result;
    } catch (cause) {
        throw mediaError(cause);
    }
}

export async function extractVideoAudio(video: Blob): Promise<Blob> {
    if (!video.size) throw new MediaProcessingError("empty-media", "视频文件为空，无法提取音轨");
    try {
        const uploaded = await uploadTempMedia(video, "audio-source.mp4");
        const audio = await requestExtractedAudio(uploaded.id);
        if (!audio.size) throw new MediaProcessingError("empty-media", "没有提取到可识别的音轨");
        return audio.type === "audio/mpeg" ? audio : new Blob([audio], { type: "audio/mpeg" });
    } catch (cause) {
        throw mediaError(cause);
    }
}

/** WebVTT 使用 ASR 返回的真实时间段；译文只替换文字，不改写时间轴。 */
export function buildVideoTranslationSubtitles(segments: readonly TranscriptionSegment[]): string {
    const time = (ms: number) => {
        const value = Math.max(0, Math.round(ms));
        const hours = Math.floor(value / 3_600_000);
        const minutes = Math.floor((value % 3_600_000) / 60_000);
        const seconds = Math.floor((value % 60_000) / 1000);
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(value % 1000).padStart(3, "0")}`;
    };
    if (!segments.length || segments.some((segment) => !segment.text.trim() || segment.startMs < 0 || segment.endMs <= segment.startMs)) {
        throw new MediaProcessingError("translation-pipeline-incomplete", "语音转录没有返回有效的逐句时间轴，无法生成字幕");
    }
    return `WEBVTT\n\n${segments.map((segment, index) => `${index + 1}\n${time(segment.startMs)} --> ${time(segment.endMs)}\n${segment.text.trim()}`).join("\n\n")}\n`;
}

export async function translateVideoPreservingSource(input: {
    video: Blob;
    sourceLanguage: string;
    targetLanguage: string;
    outputRatio?: string;
    ports: VideoTranslationPipelinePorts;
    onProgress?: (progress: VideoTranslationProgress) => void;
}): Promise<VideoTranslationResult> {
    input.onProgress?.({ stage: "extract-audio", message: "正在提取原片音轨" });
    const audio = await extractVideoAudio(input.video);
    input.onProgress?.({ stage: "transcribe", message: "正在转录原片语音" });
    const transcript = await input.ports.transcribe(audio, input.sourceLanguage);
    if (!transcript.text.trim()) throw new MediaProcessingError("translation-pipeline-incomplete", "原片没有转录出语音内容，未生成配音");
    input.onProgress?.({ stage: "translate", message: "正在逐句翻译" });
    const translated = await input.ports.translate(transcript.segments, input.sourceLanguage, input.targetLanguage);
    const subtitles = buildVideoTranslationSubtitles(translated);
    input.onProgress?.({ stage: "synthesize", message: "正在生成目标语言配音" });
    const voice = await input.ports.synthesize(translated.map((segment) => segment.text).join("\n"), input.targetLanguage);
    if (!voice.size) throw new MediaProcessingError("translation-pipeline-incomplete", "配音服务返回了空音频");
    input.onProgress?.({ stage: "mux", message: "正在保留原画面并封装译制音轨与字幕" });
    const blob = await muxTranslatedVideo({ video: input.video, audio: voice, subtitles, outputRatio: input.outputRatio });
    return { blob, transcript: { text: transcript.text, language: transcript.language, segments: translated }, subtitles };
}

async function muxTranslatedVideo(input: { video: Blob; audio: Blob; subtitles: string; outputRatio?: string }): Promise<Blob> {
    try {
        const [video, audio] = await Promise.all([
            uploadTempMedia(input.video, "translation-source.mp4"),
            uploadTempMedia(input.audio, "translation-audio.mp3"),
        ]);
        const result = await requestMuxVideo({ videoId: video.id, audioId: audio.id, subtitles: input.subtitles, outputRatio: input.outputRatio });
        if (!result.size) throw new MediaProcessingError("empty-media", "译制结果为空，已拒绝返回");
        return result;
    } catch (cause) {
        throw mediaError(cause);
    }
}

export const videoConcatDurationMs = videoConcatTotalMs;
