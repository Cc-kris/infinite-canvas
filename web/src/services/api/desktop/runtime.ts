import { getDesktopBridge, type InfiniteCanvasDesktopBridge } from "@/lib/desktop";

export class DesktopRuntimeError extends Error {
    constructor(message = "本地服务不可用：请重启桌面客户端；如果问题持续出现，请查看应用数据目录下的 main-errors.log。") {
        super(message);
        this.name = "DesktopRuntimeError";
    }
}

function bridge(): InfiniteCanvasDesktopBridge {
    const value = getDesktopBridge();
    if (!value || !value.serviceUrl || !value.serviceToken) throw new DesktopRuntimeError();
    return value;
}

/** Base URL of the local business service, e.g. http://127.0.0.1:23212 */
export function desktopServiceUrl() {
    return bridge().serviceUrl!.replace(/\/+$/, "");
}

export function desktopServiceToken() {
    return bridge().serviceToken!;
}

/** Tokenized URL for <img>/<video>/<audio> sources, which cannot carry an Authorization header. */
export function desktopFileUrl(key: string) {
    const encoded = String(key)
        .replace(/^\/+/, "")
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
    return `${desktopServiceUrl()}/files/${encoded}?token=${encodeURIComponent(desktopServiceToken())}`;
}
