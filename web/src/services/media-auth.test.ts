/**
 * D1 回归（bd71498f）：视频结果字节的渠道鉴权。
 *
 * 真实缺口：任务成功后结果地址是渠道 API 中转端点 `/v1/videos/<id>/content`，
 * 轮询侧带 Bearer 能查状态，结果入库却匿名 GET → 401 `API_KEY_REQUIRED`。
 *
 * 覆盖：需鉴权 content / 公网 CDN 不带头 / 同域非 API 路径不带头 / 无 key 不带头 /
 * 渠道非默认取自己的 key / 渠道已删除不回退默认 / blob:data: 不带头 / gemini 不用 Bearer。
 * 其中「真实 HTTP」用例起本地 server，真跑 fetchMediaBlob：匿名 401 → 带任务渠道头 200。
 */
import type { AiConfig, ModelChannel } from "@/stores/use-config-store";
{
    const map = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        writable: true,
        value: {
            getItem: (key: string) => map.get(key) ?? null,
            setItem: (key: string, value: string) => {
                map.set(key, value);
            },
            removeItem: (key: string) => {
                map.delete(key);
            },
            key: (index: number) => Array.from(map.keys())[index] ?? null,
            get length() {
                return map.size;
            },
            clear: () => map.clear(),
        },
    });
}

const { afterAll, describe, expect, test } = await import("bun:test");
const { defaultConfig } = await import("@/stores/use-config-store");
const { channelMediaHeaders, isChannelMediaUrl, taskMediaHeaders } = await import("./media-auth");
const { fetchMediaBlob } = await import("./file-storage");

const defaultChannel: ModelChannel = {
    id: "default",
    name: "默认",
    baseUrl: "https://default.example.com/v1",
    apiKey: "default-key",
    apiFormat: "openai",
    models: [{ name: "gpt-image-2", capability: "image" }],
};

function channel(overrides: Partial<ModelChannel> & Pick<ModelChannel, "id" | "baseUrl" | "apiKey">): ModelChannel {
    return { name: overrides.id, apiFormat: "openai", models: [{ name: "MiniMax-H3", capability: "video" }], ...overrides };
}

function configWith(channels: ModelChannel[]): AiConfig {
    return { ...defaultConfig, channels } as AiConfig;
}

const snapshot = { capability: "video", model: "MiniMax-H3", channelId: "sub2", count: "1", apiFormat: "openai" } as const;
const sub2 = channel({ id: "sub2", baseUrl: "https://sub2.example.com", apiKey: "sub2-key" });
const contentUrl = "https://sub2.example.com/v1/videos/vid_r27/content";

describe("渠道鉴权判定", () => {
    test("需鉴权的 content 端点：按原任务渠道带 Bearer（不是默认渠道 key）", () => {
        const headers = taskMediaHeaders(contentUrl, { configSnapshot: snapshot }, configWith([defaultChannel, sub2]));
        expect(headers).toEqual({ Authorization: "Bearer sub2-key" });
    });

    test("baseUrl 自带 /v1：仍命中 content 端点", () => {
        const channelWithV1 = channel({ id: "sub2", baseUrl: "https://sub2.example.com/v1", apiKey: "sub2-key" });
        expect(channelMediaHeaders(contentUrl, channelWithV1)).toEqual({ Authorization: "Bearer sub2-key" });
    });

    test("公网/CDN（换域）绝不带凭据", () => {
        const cdnUrl = "https://cdn.example.net/out/vid_r27.mp4";
        expect(taskMediaHeaders(cdnUrl, { configSnapshot: snapshot }, configWith([defaultChannel, sub2]))).toBeUndefined();
    });

    test("同域但不在 API 前缀下的路径（对象存储/静态目录）绝不带凭据", () => {
        expect(isChannelMediaUrl("https://sub2.example.com/files/vid.mp4", "https://sub2.example.com")).toBe(false);
        expect(isChannelMediaUrl("https://sub2.example.com/v1evil/vid.mp4", "https://sub2.example.com")).toBe(false);
        expect(taskMediaHeaders("https://sub2.example.com/files/vid.mp4", { configSnapshot: snapshot }, configWith([defaultChannel, sub2]))).toBeUndefined();
    });

    test("渠道没有 API Key：不带头（保留真实 401，不伪装修复）", () => {
        const keyless = channel({ id: "sub2", baseUrl: "https://sub2.example.com", apiKey: "" });
        expect(taskMediaHeaders(contentUrl, { configSnapshot: snapshot }, configWith([defaultChannel, keyless]))).toBeUndefined();
    });

    test("渠道非默认：用该渠道自己的 key 与 baseUrl", () => {
        const other = channel({ id: "other", baseUrl: "https://other.example.com", apiKey: "other-key" });
        const headers = taskMediaHeaders("https://other.example.com/v1/videos/abc/content", { configSnapshot: { ...snapshot, channelId: "other" } }, configWith([defaultChannel, sub2, other]));
        expect(headers).toEqual({ Authorization: "Bearer other-key" });
    });

    test("快照里的渠道已被删除：不回退默认渠道（宁可报错，不拿错 key 试）", () => {
        const headers = taskMediaHeaders("https://default.example.com/v1/videos/abc/content", { configSnapshot: { ...snapshot, channelId: "ghost" } }, configWith([defaultChannel, sub2]));
        expect(headers).toBeUndefined();
    });

    test("老快照无 channelId：按 model 名匹配到唯一渠道", () => {
        const headers = taskMediaHeaders(contentUrl, { configSnapshot: { model: "MiniMax-H3" } }, configWith([defaultChannel, sub2]));
        expect(headers).toEqual({ Authorization: "Bearer sub2-key" });
    });

    test("blob:/data: 本地地址不下发任何凭据", () => {
        expect(isChannelMediaUrl("blob:https://sub2.example.com/abc", "https://sub2.example.com")).toBe(false);
        expect(taskMediaHeaders("data:video/mp4;base64,AAAA", { configSnapshot: snapshot }, configWith([defaultChannel, sub2]))).toBeUndefined();
    });

    test("gemini 渠道用 query 鉴权，不附加 Bearer", () => {
        const gemini = channel({ id: "sub2", baseUrl: "https://sub2.example.com", apiKey: "sub2-key", apiFormat: "gemini" });
        expect(taskMediaHeaders(contentUrl, { configSnapshot: snapshot }, configWith([defaultChannel, gemini]))).toBeUndefined();
    });
});

describe("真实 HTTP 链路（本地 server，真实 fetchMediaBlob）", () => {
    const videoBytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
    const seen: (string | null)[] = [];
    const server = Bun.serve({
        port: 0,
        fetch(request) {
            const authorization = request.headers.get("authorization");
            seen.push(authorization);
            if (!new URL(request.url).pathname.endsWith("/content")) return new Response("not found", { status: 404 });
            if (authorization !== "Bearer sub2-key") return new Response("API_KEY_REQUIRED", { status: 401 });
            return new Response(videoBytes, { headers: { "content-type": "video/mp4" } });
        },
    });

    afterAll(() => {
        server.stop(true);
    });

    test("匿名 GET → 401；带任务渠道头 → 200 且字节完整", async () => {
        const baseUrl = `http://127.0.0.1:${server.port}`;
        const localChannel = channel({ id: "sub2", baseUrl, apiKey: "sub2-key" });
        const cfg = configWith([defaultChannel, localChannel]);
        const url = `${baseUrl}/v1/videos/vid_r27/content`;

        let anonymousError = "";
        try {
            await fetchMediaBlob(url, { timeoutMs: 5_000 });
        } catch (error) {
            anonymousError = error instanceof Error ? error.message : String(error);
        }
        expect(anonymousError).toContain("401");

        const headers = taskMediaHeaders(url, { configSnapshot: snapshot }, cfg);
        expect(headers).toEqual({ Authorization: "Bearer sub2-key" });

        const blob = await fetchMediaBlob(url, { timeoutMs: 5_000, headers });
        expect(blob.size).toBe(videoBytes.length);
        expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual(Array.from(videoBytes));
        // server 实际收到的头：先匿名（null），后带 Bearer。
        expect(seen).toEqual([null, "Bearer sub2-key"]);
    });
});
