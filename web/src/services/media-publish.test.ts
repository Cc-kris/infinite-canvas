/**
 * media-publish 单测（bun test）：本地素材 → 公网 URL 的判定与失败面。
 *
 * 关键约束（来自主审与实测）：
 * - 上游只认公网 https 直链，所以本机/私网基址必须**默认失败**，不能把 127.0.0.1 交出去；
 * - 上传被拒（413/500）必须抛带 code 的错误，不许返回半成品 URL；
 * - 同 storageKey 重复提交要复用上次结果，避免每次都重传几十 MB。
 */
import { beforeEach, describe, expect, test } from "bun:test";

// bun test 没有浏览器环境：i18n（被 file-storage 间接引入）初始化时会读 localStorage，
// 这里先垫一个最小实现，再动态导入被测模块。
const memoryStore = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => memoryStore.get(key) ?? null,
    setItem: (key: string, value: string) => void memoryStore.set(key, String(value)),
    removeItem: (key: string) => void memoryStore.delete(key),
    clear: () => memoryStore.clear(),
    key: (index: number) => [...memoryStore.keys()][index] ?? null,
    get length() {
        return memoryStore.size;
    },
} as Storage;

const {
    MediaPublishError,
    clearPublishedMediaCache,
    isLocalHostname,
    isPublicMediaUrl,
    publishMediaBlob,
    publishReferenceVideos,
} = await import("./media-publish");

const PUBLIC_BASE = "https://demo-media.trycloudflare.com";

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function videoBlob(bytes = 32) {
    return new Blob([new Uint8Array(bytes).fill(7)], { type: "video/mp4" });
}

beforeEach(() => {
    clearPublishedMediaCache();
});

describe("地址判定", () => {
    test("公网 https 才算可提交，本机/私网/blob/data 一律不算", () => {
        expect(isPublicMediaUrl("https://cdn.example.com/a.mp4")).toBe(true);
        expect(isPublicMediaUrl("https://demo-media.trycloudflare.com/__media/a.mp4")).toBe(true);
        for (const bad of [
            "http://127.0.0.1:23212/__media/a.mp4",
            "http://localhost:3000/a.mp4",
            "http://192.168.1.9/a.mp4",
            "http://10.0.0.5/a.mp4",
            "http://172.20.1.1/a.mp4",
            "https://mac-mini.local/a.mp4",
            "blob:http://localhost:3000/1234",
            "data:video/mp4;base64,AAAA",
            "/__media/a.mp4",
            "",
        ]) {
            expect(isPublicMediaUrl(bad)).toBe(false);
        }
    });

    test("主机名判定覆盖回环、私网、.local 与空值", () => {
        expect(isLocalHostname("127.0.0.1")).toBe(true);
        expect(isLocalHostname("::1")).toBe(true);
        expect(isLocalHostname("192.168.0.2")).toBe(true);
        expect(isLocalHostname("172.31.255.1")).toBe(true);
        expect(isLocalHostname("172.32.0.1")).toBe(false);
        expect(isLocalHostname("printer.local")).toBe(true);
        expect(isLocalHostname("")).toBe(true);
        expect(isLocalHostname("api.cc-ai.xyz")).toBe(false);
    });
});

describe("publishMediaBlob 成功路径", () => {
    test("上传后拼成绝对 https 地址，并带上服务端 sha256/字节数", async () => {
        const calls: { url: string; init: RequestInit }[] = [];
        const fetchImpl = (async (url: string, init: RequestInit) => {
            calls.push({ url, init });
            return jsonResponse({ ok: true, path: "/__media/abc123.mp4", bytes: 32, sha256: "deadbeef", mimeType: "video/mp4" });
        }) as unknown as typeof fetch;

        const result = await publishMediaBlob(
            { blob: videoBlob(32), fileName: "source.mp4", storageKey: "sk-1" },
            { hostBase: `${PUBLIC_BASE}/`, requireHttps: true, fetchImpl },
        );

        expect(result.url).toBe(`${PUBLIC_BASE}/__media/abc123.mp4`);
        expect(result.bytes).toBe(32);
        expect(result.sha256).toBe("deadbeef");
        expect(result.cached).toBe(false);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe(`${PUBLIC_BASE}/__media/upload`);
        expect(calls[0].init.method).toBe("POST");
    });

    test("同 storageKey 第二次直接复用缓存，不再重复上传", async () => {
        let calls = 0;
        const fetchImpl = (async () => {
            calls += 1;
            return jsonResponse({ path: "/__media/xyz.mp4", bytes: 32, sha256: "s", mimeType: "video/mp4" });
        }) as unknown as typeof fetch;

        const first = await publishMediaBlob(
            { blob: videoBlob(), fileName: "a.mp4", storageKey: "sk-cache" },
            { hostBase: PUBLIC_BASE, requireHttps: true, fetchImpl },
        );
        const second = await publishMediaBlob(
            { blob: videoBlob(), fileName: "a.mp4", storageKey: "sk-cache" },
            { hostBase: PUBLIC_BASE, requireHttps: true, fetchImpl },
        );

        expect(calls).toBe(1);
        expect(second.cached).toBe(true);
        expect(second.url).toBe(first.url);
    });
});

describe("publishMediaBlob 失败路径（不许静默降级）", () => {
    const cases: { name: string; run: () => Promise<unknown>; code: string }[] = [
        {
            name: "空素材",
            run: () => publishMediaBlob({ blob: new Blob([]), fileName: "a.mp4" }, { hostBase: PUBLIC_BASE }),
            code: "empty-media",
        },
        {
            name: "未配置基址",
            run: () => publishMediaBlob({ blob: videoBlob(), fileName: "a.mp4" }, { hostBase: "  " }),
            code: "missing-host",
        },
        {
            name: "本机基址（127.0.0.1 不许交上游）",
            run: () => publishMediaBlob({ blob: videoBlob(), fileName: "a.mp4" }, { hostBase: "http://127.0.0.1:23212" }),
            code: "host-not-public",
        },
        {
            name: "http 基址但上游要求 https",
            run: () =>
                publishMediaBlob(
                    { blob: videoBlob(), fileName: "a.mp4" },
                    { hostBase: "http://media.example.com", requireHttps: true },
                ),
            code: "host-not-public",
        },
        {
            name: "上传被拒 413",
            run: () =>
                publishMediaBlob(
                    { blob: videoBlob(), fileName: "a.mp4" },
                    {
                        hostBase: PUBLIC_BASE,
                        fetchImpl: (async () =>
                            jsonResponse({ error: "media too large", limit: 1024 }, 413)) as unknown as typeof fetch,
                    },
                ),
            code: "upload-rejected",
        },
        {
            name: "响应缺 path",
            run: () =>
                publishMediaBlob(
                    { blob: videoBlob(), fileName: "a.mp4" },
                    {
                        hostBase: PUBLIC_BASE,
                        fetchImpl: (async () => jsonResponse({ ok: true })) as unknown as typeof fetch,
                    },
                ),
            code: "invalid-response",
        },
        {
            name: "网络直接失败",
            run: () =>
                publishMediaBlob(
                    { blob: videoBlob(), fileName: "a.mp4" },
                    {
                        hostBase: PUBLIC_BASE,
                        fetchImpl: (async () => {
                            throw new Error("ECONNREFUSED");
                        }) as unknown as typeof fetch,
                    },
                ),
            code: "upload-failed",
        },
    ];

    for (const item of cases) {
        test(item.name, async () => {
            let caught: unknown;
            try {
                await item.run();
            } catch (error) {
                caught = error;
            }
            expect(caught).toBeInstanceOf(MediaPublishError);
            expect((caught as { code?: string }).code).toBe(item.code);
        });
    }
});

describe("publishReferenceVideos", () => {
    test("公网地址原样复用，不触发上传", async () => {
        let calls = 0;
        const result = await publishReferenceVideos(
            [
                { id: "v1", name: "a.mp4", type: "video/mp4", url: "https://cdn.example.com/a.mp4" },
                { id: "v2", name: "b.mp4", type: "video/mp4", url: "http://127.0.0.1:23212/__media/b.mp4" , storageKey: undefined },
            ].slice(0, 1),
            {
                hostBase: PUBLIC_BASE,
                requireHttps: true,
                fetchImpl: (async () => {
                    calls += 1;
                    return jsonResponse({ path: "/__media/x.mp4" });
                }) as unknown as typeof fetch,
            },
        );
        expect(calls).toBe(0);
        expect(result.urls).toEqual(["https://cdn.example.com/a.mp4"]);
        expect(result.reused).toBe(1);
        expect(result.uploaded).toBe(0);
    });

    test("本机地址但没有本地字节 → 明确报错，不返回空 URL", async () => {
        let caught: unknown;
        try {
            await publishReferenceVideos(
                [{ id: "v3", name: "local.mp4", type: "video/mp4", url: "blob:http://localhost:3000/dead" }],
                { hostBase: PUBLIC_BASE, requireHttps: true },
            );
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(MediaPublishError);
        expect((caught as { code?: string }).code).toBe("empty-media");
    });
});
