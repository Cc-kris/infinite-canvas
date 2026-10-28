import i18n from "@/i18n";
import type { ReferenceImage } from "@/types/image";

export function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return "";
    }
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDuration(ms: number) {
    const value = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(value / 60);
    const seconds = value % 60;
    return minutes ? i18n.t("common.durationMinutes", { minutes, seconds: String(seconds).padStart(2, "0") }) : i18n.t("common.durationSeconds", { seconds });
}

export function getDataUrlByteSize(dataUrl: string) {
    const base64 = dataUrl.split(",", 2)[1];
    if (!base64) {
        return 0;
    }
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error(i18n.t("common.imageReadFailed")));
        reader.readAsDataURL(file);
    });
}

export function readImageMeta(dataUrl: string) {
    return new Promise<{ width: number; height: number; mimeType: string }>((resolve) => {
        const image = new Image();
        const done = () => resolve({ width: image.naturalWidth || 1024, height: image.naturalHeight || 1024, mimeType: dataUrl.match(/^data:([^;]+)/)?.[1] || "image/png" });
        image.onload = done;
        image.onerror = done;
        setTimeout(done, 3000);
        image.src = dataUrl;
    });
}

/** data URL 有两种载荷：`;base64,`（位图）与百分号编码/纯文本（SVG 示意图）。
 * 旧实现一律 atob，遇到 SVG 会抛 "Failed to execute 'atob'"，把请求构建错误伪装成上游未知状态。 */
export function dataUrlToFile(image: ReferenceImage) {
    const dataUrl = image.dataUrl || "";
    const commaIndex = dataUrl.indexOf(",");
    if (!dataUrl.startsWith("data:") || commaIndex < 0) {
        throw new Error(`参考图不是 data URL，无法作为文件提交：${dataUrl.slice(0, 32) || "(empty)"}`);
    }
    const header = dataUrl.slice(0, commaIndex);
    const payload = dataUrl.slice(commaIndex + 1);
    const mimeType = header.match(/^data:([^;,]+)/)?.[1] || image.type || "image/png";
    const isBase64 = /;base64/i.test(header);
    const bytes = isBase64 ? base64ToBytes(payload, mimeType) : new TextEncoder().encode(safeDecode(payload));
    return new File([bytes], image.name || "reference.png", { type: mimeType });
}

function base64ToBytes(payload: string, mimeType: string) {
    const cleaned = payload.replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
        throw new Error(`参考图 base64 载荷包含非法字符（${mimeType}）`);
    }
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

function safeDecode(payload: string) {
    try {
        return decodeURIComponent(payload);
    } catch {
        return payload;
    }
}
