/**
 * D1 联动回归：ingestResultMedia 必须把「原任务渠道」的鉴权头交给 uploadMediaFile。
 *
 * 这里只替换最外层的 file-storage（IndexedDB 写盘在 bun 里没有），
 * 鉴权解析、任务快照、以及「谁传给谁」全部走真实实现。
 */
import type { AiConfig } from "@/stores/use-config-store";
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

const { describe, expect, mock, test } = await import("bun:test");

type Captured = { input: string | Blob; prefix?: string; options?: { headers?: Record<string, string> } };
const captured: Captured[] = [];

mock.module("@/services/file-storage", () => ({
    uploadMediaFile: async (input: string | Blob, prefix?: string, options?: Captured["options"]) => {
        captured.push({ input, prefix, options });
        return { url: "blob:stored", storageKey: `${prefix ?? "file"}:test`, bytes: 12, mimeType: "video/mp4" };
    },
    getMediaBlob: async () => undefined,
    resolveMediaUrl: async () => "",
    setMediaBlob: async () => undefined,
    listTaskResultMedia: async () => [],
}));

const { defaultConfig, useConfigStore } = await import("@/stores/use-config-store");
const { ingestResultMedia } = await import("@/stores/use-tool-task-store");

const config = {
    ...defaultConfig,
    channels: [
        {
            id: "default",
            name: "默认",
            baseUrl: "https://default.example.com/v1",
            apiKey: "default-key",
            apiFormat: "openai",
            models: [{ name: "gpt-image-2", capability: "image" }],
        },
        {
            id: "sub2",
            name: "Sub2",
            baseUrl: "https://sub2.example.com",
            apiKey: "sub2-key",
            apiFormat: "openai",
            models: [{ name: "MiniMax-H3", capability: "video" }],
        },
    ],
} as unknown as AiConfig;

function taskWith(url: string) {
    return {
        id: "task-d1",
        toolId: "VIDEO_TRANSLATION",
        status: "succeeded",
        clientOperationId: "op-1",
        fingerprint: "fp-1",
        capability: "video",
        prompt: "translate",
        configSnapshot: { capability: "video", model: "MiniMax-H3", channelId: "sub2", apiFormat: "openai", count: "1" },
        sourceAssetIds: [],
        createdAt: 1,
        updatedAt: 1,
        result: { receivedAt: 2, items: [{ id: "item-1", kind: "video", url, mimeType: "video/mp4" }] },
    } as never;
}

describe("ingestResultMedia 鉴权透传", () => {
    test("渠道 content 地址：入库请求带 Bearer（凭据只在本次请求头里）", async () => {
        useConfigStore.setState({ config });
        captured.length = 0;
        await ingestResultMedia(taskWith("https://sub2.example.com/v1/videos/vid_r27/content"));
        expect(captured).toHaveLength(1);
        expect(captured[0].options?.headers).toEqual({ Authorization: "Bearer sub2-key" });
    });

    test("公网/CDN 地址：入库请求不带任何鉴权头", async () => {
        useConfigStore.setState({ config });
        captured.length = 0;
        await ingestResultMedia(taskWith("https://cdn.example.net/out/vid_r27.mp4"));
        expect(captured).toHaveLength(1);
        expect(captured[0].options?.headers).toBeUndefined();
    });

    test("结果面板保存到资产库：同样按原任务渠道带 Bearer", async () => {
        useConfigStore.setState({ config });
        const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
        const source = "https://sub2.example.com/v1/videos/vid_r27/content";
        useToolTaskStore.setState({ tasks: { "task-d1": taskWith(source) } } as never);

        const { ingestResultAsset } = await import("@/services/api/tools/result-assets");
        const seen: Array<Record<string, string> | undefined> = [];
        const asset = { id: "a1", createdAt: 1, updatedAt: 1, kind: "video" as const, title: "", data: { url: "blob:x", storageKey: "k", mimeType: "video/mp4", bytes: 12 } };
        const deps = {
            uploadImage: async () => {
                throw new Error("视频结果不应走图片上传");
            },
            storeMedia: async (_input: string | Blob, _prefix?: string, options?: { headers?: Record<string, string> }) => {
                seen.push(options?.headers);
                return { url: "blob:x", storageKey: "k", bytes: 12, mimeType: "video/mp4" };
            },
            findAssetByKey: () => undefined,
            upsertAsset: (next: object) => ({ asset: { ...asset, ...next }, created: true, revision: 1 }),
            replaceAsset: () => undefined,
            removeAssets: () => undefined,
        };
        const outcome = await ingestResultAsset(
            { id: "i1", kind: "video", url: source, mimeType: "video/mp4" } as never,
            { toolId: "VIDEO_TRANSLATION", taskId: "task-d1" },
            deps as never,
        );
        expect(outcome.ok).toBe(true);
        expect(seen).toEqual([{ Authorization: "Bearer sub2-key" }]);
    });
});
