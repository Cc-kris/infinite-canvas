/**
 * VIDEO_TRANSLATION → SEED_V25 网关集成回归。
 *
 * 只替换 provider 端口（假上游），业务状态机、路由解析、字段映射全部走真实代码。
 * 断言两件事：
 *   1. 渠道没开通 SEED_V25 → 提交前就阻断，provider 一次都没被调用（不静默换模型代跑）；
 *   2. 渠道开通了 → 上游收到的是 type=96 + extendFields{DOUBAO_API, SEED_V25} 的翻译请求体。
 *
 * 运行：cd web && ~/.bun/bin/bun test src/services/api/tools/gateway.video-translation-seed-v25.test.ts
 */
import { expect, test } from "bun:test";

const memoryKv = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
        getItem: (key: string) => memoryKv.get(key) ?? null,
        setItem: (key: string, value: string) => void memoryKv.set(key, String(value)),
        removeItem: (key: string) => void memoryKv.delete(key),
        clear: () => memoryKv.clear(),
        key: (index: number) => [...memoryKv.keys()][index] ?? null,
        get length() {
            return memoryKv.size;
        },
    },
});

const { ToolTaskGateway, createMemoryTaskStore } = await import("./gateway");
const { ToolGatewayError } = await import("./gateway");

const SOURCE_URL = "https://file-ai.linkfox.com/demo/source.mp4";

function makeConfig(models: string[]) {
    return {
        model: "gpt-image-2",
        imageModel: "gpt-image-2",
        videoModel: "MiniMax-H3",
        count: "1",
        apiFormat: "openai",
        baseUrl: "https://relay.example.com",
        apiKey: "test-key",
        channels: [
            {
                id: "c1",
                name: "c1",
                baseUrl: "https://relay.example.com",
                apiKey: "test-key",
                apiFormat: "openai",
                models: models.map((name) => ({ name, capability: "video" })),
            },
        ],
    };
}

function makeGateway(models: string[]) {
    const store = createMemoryTaskStore();
    const calls: Array<{ config: { model: string }; options?: unknown }> = [];
    const gateway = new ToolTaskGateway({
        getConfig: () => makeConfig(models) as never,
        provider: {
            generateImage: async () => [],
            editImage: async () => [],
            createVideoTask: async (config: never, _prompt: string, _refs: never, _videos: never, _audios: never, _signal: never, options?: unknown) => {
                calls.push({ config: config as { model: string }, options });
                return { id: "up-1", provider: "openai" as const, model: "doubao-seedance-2-5" };
            },
            pollVideoTask: async () => ({ status: "pending" as const }),
        } as never,
        store,
    });
    return { gateway, store, calls };
}

const INPUT = {
    toolId: "VIDEO_TRANSLATION" as const,
    prompt: "把英文台词译成简体中文",
    videos: [{ id: "v1", name: "source.mp4", type: "video/mp4", url: SOURCE_URL }],
    fields: { sourceLanguage: "auto", targetLanguage: "zh-Hans", lipSync: false },
};

test("渠道只有 MiniMax-H3 → 提交前阻断，且 provider 一次都没被调用", async () => {
    const { gateway, store, calls } = makeGateway(["MiniMax-H3"]);
    let code = "";
    try {
        await gateway.submit(INPUT as never);
    } catch (error) {
        expect(error).toBeInstanceOf(ToolGatewayError);
        code = (error as InstanceType<typeof ToolGatewayError>).code;
    }
    expect(code).toBe("seed-v25-model-unavailable");
    expect(calls.length).toBe(0);
    const tasks = store.list();
    expect(tasks.length).toBe(1);
    expect(tasks[0].status).toBe("failed");
    expect(tasks[0].error?.code).toBe("seed-v25-model-unavailable");
});

test("默认模型就是 SEED_V25，且上游收到 type=96 + extendFields(DOUBAO_API/SEED_V25)", async () => {
    const { gateway, calls } = makeGateway(["doubao-seedance-2-5"]);
    const task = await gateway.submit(INPUT as never);
    expect(task.status).toBe("running");
    expect(task.upstreamTaskId).toBe("up-1");
    expect(calls.length).toBe(1);
    const options = calls[0].options as { translation?: Record<string, any> } | undefined;
    const translation = options?.translation;
    expect(translation).toBeObject();
    expect(translation!.model).toBe("doubao-seedance-2-5");
    expect(translation!.type).toBe(96);
    expect(translation!.sourceVideoUrl).toBe(SOURCE_URL);
    expect(translation!.targetLanguage).toBe("zh-Hans");
    expect(translation!.extendFields).toEqual({
        accountTypes: "DOUBAO_API",
        videoType: "SEED_V25",
        sourceLanguage: "auto",
        targetLanguage: "zh-Hans",
        lipSync: false,
        duration: -1,
        videoTime: -1,
    });
});

test("显式指定别的视频模型 → 阻断（不允许借用 MiniMax 代跑却标 SEED_V25）", async () => {
    const { gateway, calls } = makeGateway(["doubao-seedance-2-5"]);
    let code = "";
    try {
        await gateway.submit({ ...INPUT, model: "MiniMax-H3" } as never);
    } catch (error) {
        code = (error as InstanceType<typeof ToolGatewayError>).code;
    }
    expect(code).toBe("seed-v25-model-unavailable");
    expect(calls.length).toBe(0);
});

test("源视频没有公网地址 → 阻断，不把 blob 地址塞给上游", async () => {
    const { gateway, calls } = makeGateway(["doubao-seedance-2-5"]);
    let code = "";
    try {
        await gateway.submit({
            ...INPUT,
            videos: [{ id: "v1", name: "local.mp4", type: "video/mp4", url: "blob:http://127.0.0.1:3000/abc" }],
        } as never);
    } catch (error) {
        code = (error as InstanceType<typeof ToolGatewayError>).code;
    }
    expect(code).toBe("seed-v25-source-video-required");
    expect(calls.length).toBe(0);
});
