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

/** 严格测量的默认预算：可见标签内打开本地 Blob 通常 1–13ms，5s 足够，且不回写假比例。 */
export const DEFAULT_MEDIA_MEASURE_TIMEOUT_MS = 5_000;

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

/**
 * 严格测量：只认真实解码出的宽高，超时 / 解码失败 / 尺寸为 0 一律返回 null。
 *
 * 为什么不复用 readVideoMeta：readVideoMeta 的 1280×720 兜底是为了「不卡住入库」，
 * 但**不能当作最终尺寸**——VIDEO_CONCAT 后台标签实测把 768×1344（9:16）写成了 1280×720，
 * 画布节点比例整块错。需要真实比例的地方（发画布的二次校正）必须走这里。
 */
export function measureVideoMeta(url: string, timeoutMs: number = DEFAULT_MEDIA_MEASURE_TIMEOUT_MS): Promise<VideoMediaMeta | null> {
    if (typeof document === "undefined") return Promise.resolve(null);
    return new Promise<VideoMediaMeta | null>((resolve) => {
        const video = document.createElement("video");
        let timer: ReturnType<typeof setTimeout> | undefined;
        let settled = false;
        const finish = (meta: VideoMediaMeta | null) => {
            if (settled) return;
            settled = true;
            if (timer !== undefined) clearTimeout(timer);
            video.onloadedmetadata = null;
            video.onerror = null;
            // 及时释放解码资源：后台标签里迟到的元数据不能再回调到已结算的 Promise。
            try {
                video.removeAttribute?.("src");
                video.load?.();
            } catch {
                /* 元素已卸载等情况无需处理 */
            }
            resolve(meta);
        };
        timer = setTimeout(() => finish(null), Math.max(0, timeoutMs));
        video.onloadedmetadata = () => {
            const width = video.videoWidth;
            const height = video.videoHeight;
            if (!width || !height) return finish(null);
            finish({ width, height, durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined });
        };
        video.onerror = () => finish(null);
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
