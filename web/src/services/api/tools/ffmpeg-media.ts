/**
 * 浏览器媒体处理。只使用 FFmpeg.wasm，不自行解析 MP4，也不把媒体处理交给生成模型。
 * FFmpeg core-st 资源随应用本地提供，不请求第三方 CDN；许可见 public/ffmpeg/LICENSE.md。
 */
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

import { readToolAssetBlob } from "@/services/api/tools/assets";
import { videoConcatTotalMs, type VideoConcatState } from "@/features/tools/registry/video-concat";

export const FFMPEG_CORE_BASE_URL = "/ffmpeg";

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

export function createFFmpegInstance(): FFmpeg {
    return new FFmpeg();
}

/** 每个媒体操作使用独立 worker，避免共享文件系统，也不增加任务队列或并发上限。 */
export async function loadFFmpeg(): Promise<FFmpeg> {
    const ffmpeg = createFFmpegInstance();
    await ffmpeg.load({
        coreURL: `${FFMPEG_CORE_BASE_URL}/core.js`,
        wasmURL: `${FFMPEG_CORE_BASE_URL}/core.wasm`,
        classWorkerURL: `${FFMPEG_CORE_BASE_URL}/ffmpeg-worker.js`,
    });
    return ffmpeg;
}

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
    const ffmpeg = await loadFFmpeg();
    const jobs: { clip: VideoConcatState["clips"][number]; input: string; output: string }[] = [];
    try {
        const { width, height } = videoConcatDimensions(state);
        for (const [index, clip] of state.clips.entries()) {
            if (!clip.storageKey) throw new MediaProcessingError("source-unavailable", `「${clip.name}」缺少本地文件，请重新上传`);
            const blob = await readToolAssetBlob(clip.storageKey);
            if (!blob?.size) throw new MediaProcessingError("source-unavailable", `「${clip.name}」本地数据已失效，请重新上传`);
            const input = `concat-input-${index}.${fileExtension(clip.mimeType)}`;
            const output = `concat-part-${index}.mp4`;
            jobs.push({ clip, input, output });
            await ffmpeg.writeFile(input, await fetchFile(blob));
            const code = await ffmpeg.exec([
                "-ss", String(clip.startMs / 1000),
                "-i", input,
                "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
                "-t", String((clip.endMs - clip.startMs) / 1000),
                "-map", "0:v:0",
                /* 每段恰好一条音轨：优先原音轨，没有音轨时才选等长静音。 */
                "-map", "0:a:0?", "-map", "1:a:0", "-map", "-0:a:0?",
                "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30`,
                "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-ar", "48000", "-ac", "2",
                "-shortest", output,
            ]);
            if (code !== 0) throw new MediaProcessingError("media-processing-failed", `「${clip.name}」裁剪、解码或音轨对齐失败`);
        }
        const manifest = "concat-manifest.txt";
        await ffmpeg.writeFile(manifest, new TextEncoder().encode(jobs.map((job) => `file '${job.output}'`).join("\n")));
        const output = "concat-result.mp4";
        const targetSeconds = typeof state.videoTime === "number" && state.videoTime > 0 ? state.videoTime : 0;
        const concatArgs = [
            "-f", "concat", "-safe", "0", "-i", manifest,
            ...(targetSeconds > 0 ? ["-t", String(targetSeconds)] : []),
            "-c", "copy", "-movflags", "+faststart", output,
        ];
        const code = await ffmpeg.exec(concatArgs);
        if (code !== 0) throw new MediaProcessingError("media-processing-failed", "片段合成失败，未生成结果");
        const bytes = await ffmpeg.readFile(output);
        if (typeof bytes === "string" || !bytes.byteLength) throw new MediaProcessingError("empty-media", "合成结果为空，已拒绝返回");
        return new Blob([bytes as unknown as BlobPart], { type: "video/mp4" });
    } catch (cause) {
        throw mediaError(cause);
    } finally {
        const files = jobs.flatMap((job) => [job.input, job.output]);
        await Promise.all([...files, "concat-manifest.txt", "concat-result.mp4"].map((file) => ffmpeg.deleteFile(file).catch(() => false)));
        ffmpeg.terminate();
    }
}

export async function extractVideoAudio(video: Blob): Promise<Blob> {
    if (!video.size) throw new MediaProcessingError("empty-media", "视频文件为空，无法提取音轨");
    const ffmpeg = await loadFFmpeg();
    try {
        await ffmpeg.writeFile("audio-source.mp4", await fetchFile(video));
        const code = await ffmpeg.exec(["-i", "audio-source.mp4", "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "audio-source.mp3"]);
        if (code !== 0) throw new MediaProcessingError("media-processing-failed", "原片音轨提取失败，请确认视频含有可解码的音频");
        const bytes = await ffmpeg.readFile("audio-source.mp3");
        if (typeof bytes === "string" || !bytes.byteLength) throw new MediaProcessingError("empty-media", "没有提取到可识别的音轨");
        return new Blob([bytes as unknown as BlobPart], { type: "audio/mpeg" });
    } catch (cause) {
        throw mediaError(cause);
    } finally {
        await Promise.all(["audio-source.mp4", "audio-source.mp3"].map((file) => ffmpeg.deleteFile(file).catch(() => false)));
        ffmpeg.terminate();
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

function targetDimensionsForRatio(ratio?: string): { width: number; height: number } | null {
    if (!ratio || ratio === "source") return null;
    if (ratio === "9:16") return { width: 720, height: 1280 };
    if (ratio === "16:9") return { width: 1280, height: 720 };
    if (ratio === "1:1") return { width: 1080, height: 1080 };
    const [rw, rh] = ratio.split(":").map(Number);
    if (!rw || !rh) return null;
    return rw >= rh ? { width: 1280, height: even((1280 * rh) / rw) } : { width: even((1280 * rw) / rh), height: 1280 };
}

async function muxTranslatedVideo(input: { video: Blob; audio: Blob; subtitles: string; outputRatio?: string }): Promise<Blob> {
    const ffmpeg = await loadFFmpeg();
    try {
        await ffmpeg.writeFile("translation-source.mp4", await fetchFile(input.video));
        await ffmpeg.writeFile("translation-audio.mp3", await fetchFile(input.audio));
        await ffmpeg.writeFile("translation-subtitles.vtt", new TextEncoder().encode(input.subtitles));
        const targetDims = targetDimensionsForRatio(input.outputRatio);
        const videoArgs = targetDims
            ? [
                  "-vf",
                  `scale=${targetDims.width}:${targetDims.height}:force_original_aspect_ratio=decrease,pad=${targetDims.width}:${targetDims.height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`,
                  "-c:v",
                  "libx264",
                  "-preset",
                  "veryfast",
                  "-pix_fmt",
                  "yuv420p",
              ]
            : ["-c:v", "copy"];
        const code = await ffmpeg.exec([
            "-i", "translation-source.mp4", "-i", "translation-audio.mp3", "-i", "translation-subtitles.vtt",
            "-map", "0:v:0", "-map", "1:a:0", "-map", "2:0",
            ...videoArgs, "-c:a", "aac", "-c:s", "mov_text",
            "-metadata:s:s:0", "language=und", "-disposition:s:0", "default",
            "-movflags", "+faststart", "translation-result.mp4",
        ]);
        if (code !== 0) throw new MediaProcessingError("media-processing-failed", "原片画面与译制音轨封装失败");
        const bytes = await ffmpeg.readFile("translation-result.mp4");
        if (typeof bytes === "string" || !bytes.byteLength) throw new MediaProcessingError("empty-media", "译制结果为空，已拒绝返回");
        return new Blob([bytes as unknown as BlobPart], { type: "video/mp4" });
    } catch (cause) {
        throw mediaError(cause);
    } finally {
        await Promise.all(["translation-source.mp4", "translation-audio.mp3", "translation-subtitles.vtt", "translation-result.mp4"].map((file) => ffmpeg.deleteFile(file).catch(() => false)));
        ffmpeg.terminate();
    }
}

export const videoConcatDurationMs = videoConcatTotalMs;
