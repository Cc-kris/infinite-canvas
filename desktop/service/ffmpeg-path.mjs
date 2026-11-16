import { existsSync } from "node:fs";
import path from "node:path";

/**
 * 原生 ffmpeg 路径：打包后取 extraResources/bin/<platform>-<arch>，
 * 开发环境回退到 ffmpeg-static 安装的二进制。
 */
export async function resolveFfmpegBinary() {
    if (process.env.INFINITE_CANVAS_FFMPEG) return process.env.INFINITE_CANVAS_FFMPEG;
    if (process.resourcesPath) {
        const bundled = path.join(process.resourcesPath, "bin", `${process.platform}-${process.arch}`, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
        if (existsSync(bundled)) return bundled;
    }
    const mod = await import("ffmpeg-static");
    return mod.default || mod;
}
