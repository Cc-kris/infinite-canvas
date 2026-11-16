import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resolveFfmpegBinary } from "../ffmpeg-path.mjs";
import { removeTemp, resolveTemp } from "./uploads.mjs";

function even(value) {
    return Math.max(2, Math.round(value / 2) * 2);
}

function concatDimensions(clips, videoRatio) {
    const first = clips[0];
    const width = Number(first?.width) || 0;
    const height = Number(first?.height) || 0;
    const [ratioWidth, ratioHeight] = String(videoRatio || "").split(":").map(Number);
    if (!width || !height || !ratioWidth || !ratioHeight) {
        throw new Error("读不到片段画面尺寸，无法按所选比例合成");
    }
    let outputWidth = width;
    let outputHeight = (width * ratioHeight) / ratioWidth;
    if (outputHeight > height) {
        outputHeight = height;
        outputWidth = (height * ratioWidth) / ratioHeight;
    }
    return { width: even(outputWidth), height: even(outputHeight) };
}

async function runFfmpeg(args, cwd) {
    const binary = await resolveFfmpegBinary();
    return new Promise((resolve, reject) => {
        const child = spawn(binary, args, { cwd, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
        let stderr = "";
        child.stderr.on("data", (chunk) => {
            stderr = `${stderr}${chunk}`.slice(-4000);
        });
        child.once("error", reject);
        child.once("close", (code) => resolve({ code, stderr }));
    });
}

async function readResult(workDir, name, emptyMessage) {
    const bytes = await readFile(path.join(workDir, name));
    if (!bytes.byteLength) throw new Error(emptyMessage);
    return bytes;
}

/** 各片段先独立按实际起止时间解码，再按列表顺序 concat；不裁掉后续片段凑固定档。 */
export async function concatenateClips(dataRoot, { clips, videoTime, videoRatio }) {
    if (!Array.isArray(clips) || !clips.length) throw new Error("请先添加需要合成的视频片段");
    const { width, height } = concatDimensions(clips, videoRatio);
    const work = await mkdtemp(path.join(os.tmpdir(), "infinite-canvas-concat-"));
    const ids = clips.map((clip) => clip.id);
    try {
        const outputs = [];
        for (const [index, clip] of clips.entries()) {
            const input = resolveTemp(dataRoot, clip.id);
            const output = `concat-part-${index}.mp4`;
            outputs.push(output);
            const { code } = await runFfmpeg(
                [
                    "-ss", String(Number(clip.startMs) / 1000),
                    "-i", input,
                    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
                    "-t", String((Number(clip.endMs) - Number(clip.startMs)) / 1000),
                    "-map", "0:v:0",
                    /* 每段恰好一条音轨：优先原音轨，没有音轨时才选等长静音。 */
                    "-map", "0:a:0?", "-map", "1:a:0", "-map", "-0:a:0?",
                    "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30`,
                    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-ar", "48000", "-ac", "2",
                    "-shortest", output,
                ],
                work,
            );
            if (code !== 0) throw new Error(`「${clip.name || "片段"}」裁剪、解码或音轨对齐失败`);
        }
        const manifest = "concat-manifest.txt";
        await writeFile(path.join(work, manifest), outputs.map((output) => `file '${output}'`).join("\n"));
        const targetSeconds = typeof videoTime === "number" && videoTime > 0 ? videoTime : 0;
        const { code } = await runFfmpeg(
            ["-f", "concat", "-safe", "0", "-i", manifest, ...(targetSeconds > 0 ? ["-t", String(targetSeconds)] : []), "-c", "copy", "-movflags", "+faststart", "concat-result.mp4"],
            work,
        );
        if (code !== 0) throw new Error("片段合成失败，未生成结果");
        return await readResult(work, "concat-result.mp4", "合成结果为空，已拒绝返回");
    } finally {
        await rm(work, { recursive: true, force: true });
        removeTemp(dataRoot, ids);
    }
}

export async function extractAudio(dataRoot, videoId) {
    const work = await mkdtemp(path.join(os.tmpdir(), "infinite-canvas-audio-"));
    try {
        const input = resolveTemp(dataRoot, videoId);
        const { code } = await runFfmpeg(["-i", input, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "audio-source.mp3"], work);
        if (code !== 0) throw new Error("原片音轨提取失败，请确认视频含有可解码的音频");
        return await readResult(work, "audio-source.mp3", "没有提取到可识别的音轨");
    } finally {
        await rm(work, { recursive: true, force: true });
        removeTemp(dataRoot, [videoId]);
    }
}

function targetDimensionsForRatio(ratio) {
    if (!ratio || ratio === "source") return null;
    if (ratio === "9:16") return { width: 720, height: 1280 };
    if (ratio === "16:9") return { width: 1280, height: 720 };
    if (ratio === "1:1") return { width: 1080, height: 1080 };
    const [rw, rh] = String(ratio).split(":").map(Number);
    if (!rw || !rh) return null;
    return rw >= rh ? { width: 1280, height: even((1280 * rh) / rw) } : { width: even((1280 * rw) / rh), height: 1280 };
}

export async function muxTranslatedVideo(dataRoot, { videoId, audioId, subtitles, outputRatio }) {
    const work = await mkdtemp(path.join(os.tmpdir(), "infinite-canvas-mux-"));
    const ids = [videoId, audioId];
    try {
        const video = resolveTemp(dataRoot, videoId);
        const audio = resolveTemp(dataRoot, audioId);
        await writeFile(path.join(work, "translation-subtitles.vtt"), String(subtitles || ""));
        const targetDims = targetDimensionsForRatio(outputRatio);
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
        const { code } = await runFfmpeg(
            [
                "-i", video, "-i", audio, "-i", "translation-subtitles.vtt",
                "-map", "0:v:0", "-map", "1:a:0", "-map", "2:0",
                ...videoArgs, "-c:a", "aac", "-c:s", "mov_text",
                "-metadata:s:s:0", "language=und", "-disposition:s:0", "default",
                "-movflags", "+faststart", "translation-result.mp4",
            ],
            work,
        );
        if (code !== 0) throw new Error("原片画面与译制音轨封装失败");
        return await readResult(work, "translation-result.mp4", "译制结果为空，已拒绝返回");
    } finally {
        await rm(work, { recursive: true, force: true });
        removeTemp(dataRoot, ids);
    }
}
