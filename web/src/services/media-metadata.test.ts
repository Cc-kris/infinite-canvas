import { describe, expect, test } from "bun:test";

import type { AudioMediaMeta, VideoMediaMeta } from "./media-metadata";

/* D2 回归：后台标签会把媒体加载挂起（loadedmetadata 永不触发）。
 * 旧实现没有超时 → 上传永久停在「写入本地库存…」。这里用「永不触发事件的元素」
 * 真实复现那个挂起态，断言到点必须自己兜底 resolve。 */

type FakeMediaElement = {
    tagName: string;
    onloadedmetadata: (() => void) | null;
    onerror: (() => void) | null;
    videoWidth: number;
    videoHeight: number;
    duration: number;
    preload: string;
    src: string;
};

function installFakeDocument(behaviour: "hang" | "metadata" | "error") {
    const created: FakeMediaElement[] = [];
    const original = (globalThis as { document?: unknown }).document;
    const fakeDocument = {
        createElement: (tagName: string) => {
            const element: FakeMediaElement = {
                tagName,
                onloadedmetadata: null,
                onerror: null,
                videoWidth: 0,
                videoHeight: 0,
                duration: Number.NaN,
                preload: "",
                src: "",
            };
            Object.defineProperty(element, "src", {
                configurable: true,
                get: () => "",
                set: () => {
                    if (behaviour === "metadata") {
                        setTimeout(() => {
                            element.videoWidth = 1080;
                            element.videoHeight = 1920;
                            element.duration = 7.42;
                            element.onloadedmetadata?.();
                        }, 5);
                    } else if (behaviour === "error") {
                        setTimeout(() => element.onerror?.(), 5);
                    }
                    /* behaviour === "hang"：后台标签的效果，一个事件都不发。 */
                },
            });
            created.push(element);
            return element;
        },
    };
    Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: fakeDocument });
    return {
        created,
        restore: () => {
            Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: original });
        },
    };
}

describe("媒体元数据读取（D2 后台标签挂起兜底）", () => {
    test("视频 loadedmetadata 永不触发 → 到点用兜底宽高 resolve，并标记 timedOut", async () => {
        const { readVideoMeta } = await import("./media-metadata");
        const fake = installFakeDocument("hang");
        try {
            const startedAt = Date.now();
            const meta: VideoMediaMeta = await readVideoMeta("blob:fake", 30);
            const elapsed = Date.now() - startedAt;
            expect(meta.timedOut).toBe(true);
            expect(meta.width).toBe(1280);
            expect(meta.height).toBe(720);
            expect(meta.durationMs).toBeUndefined();
            expect(elapsed).toBeGreaterThanOrEqual(25);
            expect(elapsed).toBeLessThan(2000);
            /* 兜底后要摘下回调，避免迟到的 loadedmetadata 再改一次结果。 */
            expect(fake.created[0].onloadedmetadata).toBeNull();
        } finally {
            fake.restore();
        }
    });

    test("正常返回 loadedmetadata → 用真实宽高与时长，不标记 timedOut", async () => {
        const { readVideoMeta } = await import("./media-metadata");
        const fake = installFakeDocument("metadata");
        try {
            const meta = await readVideoMeta("blob:fake", 2000);
            expect(meta.width).toBe(1080);
            expect(meta.height).toBe(1920);
            expect(meta.durationMs).toBe(7420);
            expect(meta.timedOut).toBeUndefined();
        } finally {
            fake.restore();
        }
    });

    test("解码失败 onerror → 用兜底宽高放行（元数据只是附加信息，不该卡住入库）", async () => {
        const { readVideoMeta } = await import("./media-metadata");
        const fake = installFakeDocument("error");
        try {
            const meta = await readVideoMeta("blob:fake", 2000);
            expect(meta.width).toBe(1280);
            expect(meta.height).toBe(720);
            expect(meta.timedOut).toBeUndefined();
        } finally {
            fake.restore();
        }
    });

    test("音频挂起 → 到点 resolve 且时长为未知", async () => {
        const { readAudioMeta } = await import("./media-metadata");
        const fake = installFakeDocument("hang");
        try {
            const meta: AudioMediaMeta = await readAudioMeta("blob:fake", 30);
            expect(meta.durationMs).toBeUndefined();
            expect(meta.timedOut).toBe(true);
        } finally {
            fake.restore();
        }
    });

    test("非浏览器环境（无 document）直接返回兜底值，不抛错", async () => {
        const { readAudioMeta, readVideoMeta } = await import("./media-metadata");
        const original = (globalThis as { document?: unknown }).document;
        Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: undefined });
        try {
            expect((await readVideoMeta("blob:fake")).width).toBe(1280);
            expect((await readAudioMeta("blob:fake")).durationMs).toBeUndefined();
        } finally {
            Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: original });
        }
    });
});
