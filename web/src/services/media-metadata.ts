/**
 * 媒体元数据读取（视频宽高/时长、音频时长）。
 *
 * 为什么单独成文件并带超时：
 * - 页面在后台标签时，Chrome 会挂起媒体元素加载，`loadedmetadata` 可能永不触发；
 *   旧实现只挂 onloadedmetadata/onerror，没有 timeout，上传会永久停在「写入本地库存…」且无报错
 *   （AI_VIDEO_EDITING 验收已证实：同一 Blob 在标签置前后 1–13ms 内正常）。
 * - 元数据只是展示/校验用的附加信息，读不到时用兜底值放行，不能让它卡死入库。
 */

/** 默认 10s：与 assets 侧同类实现（15s）同一量级，足够慢网络；后台标签场景下到点兜底。 */
export const DEFAULT_MEDIA_METADATA_TIMEOUT_MS = 10_000;

export type VideoMediaMeta = { width: number; height: number; durationMs?: number; timedOut?: boolean };
export type AudioMediaMeta = { durationMs?: number; timedOut?: boolean };

const FALLBACK_VIDEO_WIDTH = 1280;
const FALLBACK_VIDEO_HEIGHT = 720;

/** 读视频元数据；超时/出错按兜底值 resolve（timedOut=true 便于验收与日志区分）。 */
export function readVideoMeta(url: string, timeoutMs: number = DEFAULT_MEDIA_METADATA_TIMEOUT_MS): Promise<VideoMediaMeta> {
    if (typeof document === "undefined") {
        return Promise.resolve({ width: FALLBACK_VIDEO_WIDTH, height: FALLBACK_VIDEO_HEIGHT, timedOut: true });
    }
    return new Promise<VideoMediaMeta>((resolve) => {
        const video = document.createElement("video");
        let timer: ReturnType<typeof setTimeout> | undefined;
        let settled = false;
        const finish = (timedOut: boolean) => {
            if (settled) return;
            settled = true;
            if (timer !== undefined) clearTimeout(timer);
            video.onloadedmetadata = null;
            video.onerror = null;
            resolve({
                width: video.videoWidth || FALLBACK_VIDEO_WIDTH,
                height: video.videoHeight || FALLBACK_VIDEO_HEIGHT,
                durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined,
                ...(timedOut ? { timedOut: true } : {}),
            });
        };
        timer = setTimeout(() => finish(true), Math.max(0, timeoutMs));
        video.onloadedmetadata = () => finish(false);
        video.onerror = () => finish(false);
        video.preload = "metadata";
        video.src = url;
    });
}

/** 读音频时长；超时/出错按「时长未知」resolve。 */
export function readAudioMeta(url: string, timeoutMs: number = DEFAULT_MEDIA_METADATA_TIMEOUT_MS): Promise<AudioMediaMeta> {
    if (typeof document === "undefined") {
        return Promise.resolve({ timedOut: true });
    }
    return new Promise<AudioMediaMeta>((resolve) => {
        const audio = document.createElement("audio");
        let timer: ReturnType<typeof setTimeout> | undefined;
        let settled = false;
        const finish = (timedOut: boolean) => {
            if (settled) return;
            settled = true;
            if (timer !== undefined) clearTimeout(timer);
            audio.onloadedmetadata = null;
            audio.onerror = null;
            resolve({
                durationMs: Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : undefined,
                ...(timedOut ? { timedOut: true } : {}),
            });
        };
        timer = setTimeout(() => finish(true), Math.max(0, timeoutMs));
        audio.onloadedmetadata = () => finish(false);
        audio.onerror = () => finish(false);
        audio.preload = "metadata";
        audio.src = url;
    });
}
