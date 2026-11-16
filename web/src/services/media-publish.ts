/**
 * 本地素材 → 公网可访问 URL。
 *
 * 事实边界：
 * - 视频类上游（sub2api / MiniMax-H3 等）只收**公网 https 直链**：`blob:`、`data:`、`127.0.0.1`
 *   一律被拒（VIDEO6_LIVE_FINDINGS：data URL → 400 "must be a public HTTPS URL"）。
 * - 因此本地文件必须先「发布」成一个上游能拉取的地址。发布动作复用本机素材服务新增的
 *   `POST /__media/upload`（`desktop/service/published-media.mjs`），
 *   它把字节落到本机媒体目录并返回相对路径；公网域名由设置项的「素材公网基址」提供
 *   （本机调试时用 cloudflared 隧道指向本机素材服务端口 23212）。
 * - 本模块只做「字节 → URL」这一件事：不伪造 URL、不在失败时静默降级，失败一律抛
 *   `MediaPublishError`（带可读原因），由调用方决定回退还是报错。
 */
import { getMediaBlob } from "@/services/file-storage";
import type { ReferenceVideo } from "@/types/media";

export type MediaPublishErrorCode =
    | "empty-media"
    | "missing-host"
    | "host-not-public"
    | "media-too-large"
    | "upload-rejected"
    | "upload-failed"
    | "invalid-response";

export class MediaPublishError extends Error {
    code: MediaPublishErrorCode;
    detail?: string;

    constructor(code: MediaPublishErrorCode, message: string, detail?: string) {
        super(message);
        this.name = "MediaPublishError";
        this.code = code;
        this.detail = detail;
    }
}

export type PublishHostOptions = {
    /** 素材托管基址：可以是本机素材服务（http://127.0.0.1:23212）或公网隧道（https://xxx.trycloudflare.com）。 */
    hostBase: string;
    /** 上游只接受 https 时置 true：非 https 基址直接判失败，而不是发出去等 400。 */
    requireHttps?: boolean;
    /** 仅本机回环自测时置 true；默认拒绝本机/私网基址（上游拉不到）。 */
    allowLocalHost?: boolean;
    signal?: AbortSignal;
    /** 注入点，便于单测。 */
    fetchImpl?: typeof fetch;
};

export type PublishedMedia = {
    url: string;
    bytes: number;
    sha256: string;
    mimeType: string;
    cached: boolean;
};

const MAX_MEDIA_BYTES = 200 * 1024 * 1024;
const published = new Map<string, PublishedMedia>();

/** 仅供测试与「清缓存」用。 */
export function clearPublishedMediaCache() {
    published.clear();
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

/** 判断主机名是否只在本机可达（上游一定拉不到）。 */
export function isLocalHostname(hostname: string) {
    const host = hostname.trim().toLowerCase().replace(/\.$/, "");
    if (!host) return true;
    if (LOOPBACK_HOSTS.has(host)) return true;
    if (host.endsWith(".local") || host.endsWith(".localhost") || host.endsWith(".internal")) return true;
    const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (ipv4) {
        const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
        if (a === 10 || a === 127 || a === 0) return true;
        if (a === 192 && b === 168) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 169 && b === 254) return true;
    }
    return false;
}

/** 是否为「上游能拉取」的绝对地址：http(s) 且主机不是本机/私网。 */
export function isPublicMediaUrl(raw?: string): boolean {
    if (!raw) return false;
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        return false;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return !isLocalHostname(parsed.hostname);
}

export function isAbsoluteHttpUrl(raw?: string): boolean {
    if (!raw) return false;
    try {
        const parsed = new URL(raw);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
}

/** 把 `base` 与 `path` 拼成绝对地址，容忍 base 结尾多余斜杠。 */
function joinBase(base: string, pathText: string) {
    const normalized = base.trim().replace(/\/+$/, "");
    const suffix = pathText.startsWith("/") ? pathText : `/${pathText}`;
    return `${normalized}${suffix}`;
}

function cacheKeyOf(input: { storageKey?: string; fileName: string; bytes: number }) {
    return input.storageKey ? `sk:${input.storageKey}` : `f:${input.fileName}:${input.bytes}`;
}

function guessExtension(fileName: string, mimeType: string) {
    const fromName = /\.([a-z0-9]{1,8})$/i.exec(fileName)?.[1];
    if (fromName) return fromName.toLowerCase();
    if (/mp4/.test(mimeType)) return "mp4";
    if (/webm/.test(mimeType)) return "webm";
    if (/quicktime/.test(mimeType)) return "mov";
    if (/mpeg/.test(mimeType)) return "mp3";
    return "bin";
}

/**
 * 把一段媒体字节发布成公网可访问 URL（同内容/同 storageKey 会复用上次结果）。
 *
 * @throws MediaPublishError 任何一个环节不成立都不会返回「假 URL」。
 */
export async function publishMediaBlob(
    input: {
        blob: Blob;
        fileName: string;
        storageKey?: string;
    },
    options: PublishHostOptions,
): Promise<PublishedMedia> {
    const { blob, fileName } = input;
    if (!blob || blob.size === 0) throw new MediaPublishError("empty-media", "素材为空，无法上传");
    if (blob.size > MAX_MEDIA_BYTES) {
        throw new MediaPublishError("media-too-large", `素材超过 ${Math.round(MAX_MEDIA_BYTES / 1024 / 1024)}MB，无法上传`);
    }
    const hostBase = options.hostBase?.trim();
    if (!hostBase) {
        throw new MediaPublishError("missing-host", "未配置素材公网基址：本地素材需要先上传到可公网访问的地址");
    }
    if (!isAbsoluteHttpUrl(hostBase)) {
        throw new MediaPublishError("missing-host", `素材公网基址不是合法的 http(s) 地址：${hostBase}`);
    }
    const hostUrl = new URL(hostBase);
    if (options.requireHttps && hostUrl.protocol !== "https:") {
        throw new MediaPublishError(
            "host-not-public",
            "上游只接受公网 https 视频地址，但素材公网基址是 http：请填写 https 隧道域名",
            hostBase,
        );
    }
    // 硬约束：本机/私网基址拼出来的地址上游一定拉不到，默认直接失败，
    // 绝不把 127.0.0.1 之类的地址交给上游「试一下」。
    if (isLocalHostname(hostUrl.hostname) && !options.allowLocalHost) {
        throw new MediaPublishError(
            "host-not-public",
            "素材公网基址指向本机/私网，上游无法访问：请填写公网隧道域名（例如 cloudflared 的 https://xxx.trycloudflare.com）",
            hostBase,
        );
    }

    const key = cacheKeyOf({ storageKey: input.storageKey, fileName, bytes: blob.size });
    const hit = published.get(key);
    if (hit) return { ...hit, cached: true };

    const mimeType = blob.type || "application/octet-stream";
    const uploadName = fileName || `media.${guessExtension(fileName, mimeType)}`;
    const doFetch = options.fetchImpl ?? fetch;
    let response: Response;
    try {
        response = await doFetch(joinBase(hostBase, "/__media/upload"), {
            method: "POST",
            headers: {
                "content-type": mimeType,
                "x-media-name": encodeURIComponent(uploadName),
            },
            body: blob,
            signal: options.signal,
        });
    } catch (error) {
        if (options.signal?.aborted) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw new MediaPublishError("upload-failed", `素材上传失败：${message}`);
    }
    const text = await response.text().catch(() => "");
    if (!response.ok) {
        throw new MediaPublishError("upload-rejected", `素材上传被拒绝（HTTP ${response.status}）`, text.slice(0, 300));
    }
    let payload: { path?: string; bytes?: number; sha256?: string; mimeType?: string } | null = null;
    try {
        payload = text ? (JSON.parse(text) as { path?: string; bytes?: number; sha256?: string; mimeType?: string }) : null;
    } catch {
        payload = null;
    }
    if (!payload?.path) {
        throw new MediaPublishError("invalid-response", "素材上传响应缺少 path 字段", text.slice(0, 300));
    }
    const url = joinBase(hostBase, payload.path);
    if (!isAbsoluteHttpUrl(url)) {
        throw new MediaPublishError("invalid-response", `素材上传返回的地址不可用：${url}`);
    }
    const result: PublishedMedia = {
        url,
        bytes: payload.bytes ?? blob.size,
        sha256: payload.sha256 ?? "",
        mimeType: payload.mimeType ?? mimeType,
        cached: false,
    };
    published.set(key, result);
    return result;
}

/** 读取参考视频的字节（优先磁盘素材库里的 storageKey，其次 blob/网络地址）。 */
async function readVideoBlob(video: ReferenceVideo, options: { signal?: AbortSignal }) {
    const stored = video.storageKey ? await getMediaBlob(video.storageKey) : null;
    if (stored && stored.size > 0) return stored;
    if (!video.url) return null;
    try {
        const response = await fetch(video.url, { signal: options.signal });
        if (!response.ok) return null;
        const blob = await response.blob();
        return blob.size > 0 ? blob : null;
    } catch {
        // blob: 已失效 / 跨域被拒：交给调用方按「拿不到字节」处理，不吞成别的原因。
        return null;
    }
}

export type VideoPublishResult = {
    /** 与入参一一对应的可提交视频地址。 */
    urls: string[];
    /** 真正被上传的次数（公网地址直接复用不计）。 */
    uploaded: number;
    /** 直接复用的公网地址数量。 */
    reused: number;
};

/**
 * 把一组参考视频变成上游可拉取的 URL 列表：已经是公网地址的原样保留，本地的先发布。
 *
 * @throws MediaPublishError 只要有一个本地视频发布不出来就整体失败（不静默丢参）。
 */
export async function publishReferenceVideos(
    videos: ReferenceVideo[],
    options: PublishHostOptions,
): Promise<VideoPublishResult> {
    const urls: string[] = [];
    let uploaded = 0;
    let reused = 0;
    for (const video of videos) {
        if (isPublicMediaUrl(video.url)) {
            urls.push(video.url);
            reused += 1;
            continue;
        }
        const blob = await readVideoBlob(video, options);
        if (!blob) {
            throw new MediaPublishError("empty-media", `参考视频「${video.name || video.id}」没有可用的本地字节`);
        }
        const publishedMedia = await publishMediaBlob(
            { blob, fileName: video.name || `${video.id}.mp4`, storageKey: video.storageKey },
            options,
        );
        urls.push(publishedMedia.url);
        uploaded += 1;
    }
    return { urls, uploaded, reused };
}
