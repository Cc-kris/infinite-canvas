import { afterAll, beforeEach, expect, mock, test } from "bun:test";

/**
 * 回归守卫：带源视频/音频的视频请求，必须走 multipart。
 *
 * 现场缺陷（2026-10-28，AI_VIDEO_EDITING 真实验收）：
 * 中转域（api.cc-ai.xyz）+ 源视频 → `jsonFirst = inlineImages || prefersJsonFirst(baseUrl)`
 * 判定为 true，先发一个**只有文本字段**的 JSON；上游 404 不属于 400/415/422，
 * 逻辑直接抛错、不再补发 multipart → 源视频与参考图全部没到上游，
 * 页面上「视频编辑」静默退化成「文生视频」。本文件锁住修复后的行为。
 */

// 配置/i18n 模块初始化会碰 localStorage，先注入内存实现（与 tests/gateway.test.ts 同法）。
const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => void values.set(key, String(value)),
        removeItem: (key: string) => void values.delete(key),
        clear: () => values.clear(),
        key: (index: number) => [...values.keys()][index] ?? null,
        get length() {
            return values.size;
        },
    },
});

type Post = { url: string; payload: unknown };

const posts: Post[] = [];
const axios = (await import("axios")).default;
const originalPost = axios.post;

// 拦截 axios：记录每次提交的 payload 形态（FormData / JSON），并按需返回任务 id。
axios.post = (async (url: string, payload: unknown) => {
    posts.push({ url, payload });
    return { data: { id: "upstream-video-task-1" } };
}) as typeof originalPost;

const { createVideoGenerationTask, planVideoSubmitPayloads } = await import(
    "../src/services/api/video"
);
const { defaultConfig } = await import("../src/stores/use-config-store");

const RELAY_BASE_URL = "https://api.cc-ai.xyz";

function relayConfig() {
    return {
        ...defaultConfig,
        model: "default::grok-imagine-video",
        videoModel: "default::grok-imagine-video",
        channels: [
            {
                id: "default",
                name: "relay",
                baseUrl: RELAY_BASE_URL,
                apiKey: "test-key",
                apiFormat: "openai" as const,
                models: [{ name: "grok-imagine-video", capability: "video" as const }],
            },
        ],
    };
}

const SOURCE_VIDEO = {
    name: "06-result-video.mp4",
    type: "video/mp4",
    url: "data:video/mp4;base64,AAAAIGZ0eXBpc29t",
};

beforeEach(() => {
    posts.length = 0;
});

afterAll(() => {
    axios.post = originalPost;
});

test("planVideoSubmitPayloads：带 videos/audios 时只发 multipart", () => {
    expect(
        planVideoSubmitPayloads({ inlineImages: false, mediaOnlyInMultipart: true, relayHost: true }),
    ).toEqual({ order: ["multipart"] });
    // 即使能内联图片也不能先发 JSON：源视频进不了 JSON 体。
    expect(
        planVideoSubmitPayloads({ inlineImages: true, mediaOnlyInMultipart: true, relayHost: false }),
    ).toEqual({ order: ["multipart"] });
});

test("planVideoSubmitPayloads：无媒体时保留 JSON 优先的回退能力", () => {
    expect(
        planVideoSubmitPayloads({ inlineImages: false, mediaOnlyInMultipart: false, relayHost: true }),
    ).toEqual({ order: ["json", "multipart"] });
    expect(
        planVideoSubmitPayloads({ inlineImages: false, mediaOnlyInMultipart: false, relayHost: false }),
    ).toEqual({ order: ["multipart", "json"] });
});

test("源视频提交：第一个请求就是 multipart，且携带 video[] 与提示词", async () => {
    const task = await createVideoGenerationTask(relayConfig(), "把视频里的产品替换成参考图中的耳机", [], {
        videos: [SOURCE_VIDEO],
    });

    expect(task).toEqual({ id: "upstream-video-task-1", provider: "openai", model: "default::grok-imagine-video" });
    expect(posts.length).toBe(1);
    const payload = posts[0].payload;
    expect(payload instanceof FormData).toBe(true);
    const form = payload as FormData;
    expect(form.get("prompt")).toBe("把视频里的产品替换成参考图中的耳机");
    const video = form.get("video[]");
    expect(video instanceof File).toBe(true);
    expect((video as File).name).toBe("06-result-video.mp4");
    // 源视频必须真的上传，而不是变成一段没有画面的纯文本请求。
    expect(String(form.get("prompt")).length).toBeGreaterThan(0);
});
