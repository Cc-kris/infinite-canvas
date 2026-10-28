import { afterAll, expect, test } from "bun:test";

// 配置/i18n 模块初始化时会碰 localStorage，先注入内存实现（与 tests/model-selection.test.ts 同法）。
const values = new Map<string, string>();
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
    },
});
afterAll(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});

const { defaultConfig } = await import("../src/stores/use-config-store");
const { ToolTaskGateway, TOOL_IDS, TOOL_ADAPTERS, classifyProviderError, createMemoryTaskStore, describeToolExecution, buildToolConfig } = await import(
    "../src/services/api/tools/gateway"
);
const machine = await import("../src/services/api/tools/task-machine");
const taskStore = await import("../src/stores/use-tool-task-store");

const config = {
    ...defaultConfig,
    model: "test-image-model",
    imageModel: "test-image-model",
    videoModel: "test-video-model",
    count: "1",
};

const refImage = { id: "ref-1", name: "ref.png", type: "image/png", dataUrl: "data:image/png;base64,AAA" };
const refVideo = { id: "vid-1", name: "ref.mp4", type: "video/mp4", url: "https://example.test/ref.mp4" };

type Counters = { generate: number; edit: number; createVideo: number; poll: number };

function makeProvider(overrides: Record<string, unknown> = {}) {
    const calls: Counters = { generate: 0, edit: 0, createVideo: 0, poll: 0 };
    const base = {
        async generateImage() {
            calls.generate += 1;
            return [{ id: "img-a", dataUrl: "data:image/png;base64,AAA" }];
        },
        async editImage() {
            calls.edit += 1;
            return [{ id: "img-b", dataUrl: "data:image/png;base64,BBB" }];
        },
        async createVideoTask() {
            calls.createVideo += 1;
            return { id: "upstream-1", provider: "openai" as const, model: "test-video-model" };
        },
        async pollVideoTask() {
            calls.poll += 1;
            return { status: "pending" as const };
        },
        ...overrides,
    };
    return { port: base, calls };
}

function makeGateway(provider: unknown, now: () => number = Date.now) {
    return new ToolTaskGateway({
        getConfig: () => config,
        provider: provider as never,
        store: createMemoryTaskStore(),
        now,
    });
}

const noSleep = async () => {};

/* ---------------- 适配器注册表 ---------------- */

test("39 个工具的适配器全部注册，没有重复 id", () => {
    expect(TOOL_IDS.length).toBe(39);
    expect(new Set(TOOL_IDS).size).toBe(39);
    expect(Object.keys(TOOL_ADAPTERS).length).toBe(39);
});

test("designer 宿主工具登记了能力但不能在网关里执行", () => {
    const descriptor = describeToolExecution("NEW_DESIGNER");
    expect(descriptor.kind).toBe("designer-host");
    expect(descriptor.capability).toBeNull();
    expect(descriptor.executable).toBe(false);
});

test("素材要求来自工具规格（SCALE_UP 要参考图，ORNAMENT_TEXT 不要）", () => {
    expect(describeToolExecution("SCALE_UP").requiresReferences).toBe(true);
    expect(describeToolExecution("ORNAMENT_TEXT").requiresReferences).toBe(false);
    expect(describeToolExecution("VIDEO_CONCAT").requiresVideo).toBe(true);
    expect(describeToolExecution("IMAGE_TO_VIDEO").capability).toBe("video");
});

test("未知工具 id 直接拒绝，不落默认实现", async () => {
    const { port } = makeProvider();
    const gateway = makeGateway(port);
    await expect(gateway.submit({ toolId: "NOT_A_TOOL", prompt: "hi" })).rejects.toThrow(/Unknown tool/);
    expect(gateway.listTasks().length).toBe(0);
});

test("buildToolConfig 用用户配置的模型，工具级 model 覆盖生效，count 收敛到 1..15", () => {
    const adapter = TOOL_ADAPTERS.SCALE_UP;
    const built = buildToolConfig(config as never, adapter.kind, { count: 99 });
    expect(built.model).toBe("test-image-model");
    expect(built.count).toBe("15");
    const overridden = buildToolConfig(config as never, adapter.kind, { model: "other-model", count: 0 });
    expect(overridden.model).toBe("other-model");
    expect(overridden.count).toBe("1");
});

/* ---------------- 校验 ---------------- */

test("缺 prompt 的提交被判失败并留痕，且不会调用 provider", async () => {
    const { port, calls } = makeProvider();
    const gateway = makeGateway(port);
    await expect(gateway.submit({ toolId: "PRODUCT_IMAGE_SUITE", prompt: "   ", references: [refImage] })).rejects.toThrow(/prompt/);
    const tasks = gateway.listTasks();
    expect(tasks.length).toBe(1);
    expect(tasks[0].status).toBe("failed");
    expect(tasks[0].error?.code).toBe("prompt-required");
    expect(calls.generate + calls.edit).toBe(0);
});

test("需要参考图的工具缺图时失败，不触发真实请求", async () => {
    const { port, calls } = makeProvider();
    const gateway = makeGateway(port);
    await expect(gateway.submit({ toolId: "SCALE_UP", prompt: "放大" })).rejects.toThrow(/source image/);
    expect(gateway.listTasks()[0].error?.code).toBe("references-required");
    expect(calls.generate).toBe(0);
});

test("需要视频的工具缺视频时失败", async () => {
    const { port } = makeProvider();
    const gateway = makeGateway(port);
    await expect(gateway.submit({ toolId: "VIDEO_TRANSLATION", prompt: "翻译" })).rejects.toThrow(/source video/);
    expect(gateway.listTasks()[0].error?.code).toBe("video-required");
});

/* ---------------- 图片链路 ---------------- */

test("图片生成返回 dataUrl → 任务 succeeded 且带真实结果", async () => {
    const { port, calls } = makeProvider();
    const gateway = makeGateway(port);
    const task = await gateway.runTool({ toolId: "ORNAMENT_TEXT", prompt: "烫金文字" });
    expect(calls.generate).toBe(1);
    expect(calls.edit).toBe(0);
    expect(task.status).toBe("succeeded");
    expect(task.result?.items[0].dataUrl).toBe("data:image/png;base64,AAA");
    expect(task.configSnapshot.model).toBe("test-image-model");
    expect(task.clientOperationId.length).toBeGreaterThan(8);
});

test("带参考图时走 requestEdit 分支", async () => {
    const { port, calls } = makeProvider();
    const gateway = makeGateway(port);
    const task = await gateway.runTool({ toolId: "SCALE_UP", prompt: "放大", references: [refImage] });
    expect(calls.edit).toBe(1);
    expect(calls.generate).toBe(0);
    expect(task.status).toBe("succeeded");
    expect(task.sourceAssetIds).toEqual(["ref-1"]);
});

test("provider 返回空结果 → failed，绝不补造结果", async () => {
    const { port } = makeProvider({ generateImage: async () => [] });
    const gateway = makeGateway(port);
    const task = await gateway.runTool({ toolId: "ORNAMENT_TEXT", prompt: "烫金文字" });
    expect(task.status).toBe("failed");
    expect(task.error?.code).toBe("empty-image-result");
    expect(task.result).toBeUndefined();
});

/* ---------------- 视频链路 ---------------- */

test("视频提交拿到上游 id 后进入 running，轮询到 completed 才 succeeded", async () => {
    let polled = 0;
    const { port, calls } = makeProvider({
        pollVideoTask: async () => {
            polled += 1;
            return polled < 3 ? { status: "pending" as const } : { status: "completed" as const, result: { url: "https://cdn.test/out.mp4", mimeType: "video/mp4" } };
        },
    });
    const gateway = makeGateway(port);
    const submitted = await gateway.submit({ toolId: "IMAGE_TO_VIDEO", prompt: "动起来", references: [refImage] });
    expect(submitted.status).toBe("running");
    expect(submitted.upstreamTaskId).toBe("upstream-1");
    expect(calls.createVideo).toBe(1);

    const finished = await gateway.waitForResult(submitted.id, { sleep: noSleep, pollIntervalMs: 0, maxPolls: 10 });
    expect(finished.status).toBe("succeeded");
    expect(finished.result?.items[0].url).toBe("https://cdn.test/out.mp4");
    expect(finished.pollCount).toBe(3);
});

test("上游明确 failed → 任务 failed，不重试不重提交", async () => {
    const { port, calls } = makeProvider({ pollVideoTask: async () => ({ status: "failed" as const, error: "policy violation" }) });
    const gateway = makeGateway(port);
    const task = await gateway.runTool({ toolId: "IMAGE_TO_VIDEO", prompt: "动起来", references: [refImage] }, { sleep: noSleep, maxPolls: 5 });
    expect(task.status).toBe("failed");
    expect(task.error?.message).toContain("policy violation");
    expect(calls.createVideo).toBe(1);
});

test("轮询连续 3 次网络失败 → unknown（只能查询，不重提交）", async () => {
    const { port, calls } = makeProvider({
        pollVideoTask: async () => {
            throw new Error("Failed to fetch");
        },
    });
    const gateway = makeGateway(port);
    const submitted = await gateway.submit({ toolId: "IMAGE_TO_VIDEO", prompt: "动起来", references: [refImage] });
    let task = submitted;
    for (let i = 0; i < 3; i += 1) task = await gateway.poll(submitted.id);
    expect(task.status).toBe("unknown");
    expect(task.reconcileRequired).toBe(true);
    expect(task.transientFailures).toBe(3);
    expect(calls.createVideo).toBe(1);
});

test("等待超时 → unknown 且保留 upstreamTaskId，不判失败", async () => {
    const { port } = makeProvider();
    const gateway = makeGateway(port, () => 1_000);
    const submitted = await gateway.submit({ toolId: "IMAGE_TO_VIDEO", prompt: "动起来", references: [refImage] });
    const timedOut = await gateway.waitForResult(submitted.id, { sleep: noSleep, timeoutMs: 0 });
    expect(timedOut.status).toBe("unknown");
    expect(timedOut.error?.code).toBe("task-timeout");
    expect(timedOut.upstreamTaskId).toBe("upstream-1");
});

test("页面刷新恢复：未完结任务只查询，不自动重提交", async () => {
    const { port, calls } = makeProvider();
    const gateway = makeGateway(port);
    const submitted = await gateway.submit({ toolId: "IMAGE_TO_VIDEO", prompt: "动起来", references: [refImage] });
    const { plan, task } = await gateway.recover(submitted.id);
    expect(plan.action).toBe("poll");
    expect(task.status).toBe("running");
    expect(calls.createVideo).toBe(1);
});

/* ---------------- 幂等 / 重试 ---------------- */

test("同参数重复提交复用运行中的任务，只调用一次 provider", async () => {
    const { port, calls } = makeProvider();
    const gateway = makeGateway(port);
    const input = { toolId: "IMAGE_TO_VIDEO", prompt: "动起来", references: [refImage] };
    const first = await gateway.submit(input);
    const second = await gateway.submit(input);
    expect(second.id).toBe(first.id);
    expect(second.deduplicated).toBe(true);
    expect(calls.createVideo).toBe(1);
});

test("失败后人工重试沿用任务记录、递增 attempts、换新上游 id", async () => {
    let attempt = 0;
    const { port, calls } = makeProvider({
        generateImage: async () => {
            attempt += 1;
            if (attempt === 1) throw new Error("invalid parameter: bad size");
            return [{ id: "img-ok", dataUrl: "data:image/png;base64,CCC" }];
        },
    });
    const gateway = makeGateway(port);
    const input = { toolId: "ORNAMENT_TEXT", prompt: "烫金文字" };
    const failed = await gateway.runTool(input);
    expect(failed.status).toBe("failed");
    expect(failed.attempts).toBe(1);

    const retried = await gateway.retry(failed.id, input);
    expect(retried.id).toBe(failed.id);
    expect(retried.attempts).toBe(2);
    expect(retried.status).toBe("succeeded");
    expect(retried.result?.items[0].dataUrl).toBe("data:image/png;base64,CCC");
    expect(attempt).toBe(2);
});

test("运行中的任务不允许重试（必须先取消）", async () => {
    const { port } = makeProvider();
    const gateway = makeGateway(port);
    const input = { toolId: "IMAGE_TO_VIDEO", prompt: "动起来", references: [refImage] };
    const submitted = await gateway.submit(input);
    await expect(gateway.retry(submitted.id, input)).rejects.toThrow(/cancel it before retrying/);
});

/* ---------------- 错误分类 ---------------- */

test("429/5xx 与非确定性网络错误不判死，4xx 判确定性失败", () => {
    expect(classifyProviderError({ response: { status: 429 } }).retryable).toBe(true);
    expect(classifyProviderError({ response: { status: 400 } }).definitive).toBe(true);
    expect(classifyProviderError(new Error("请求超时")).definitive).toBe(false);
    expect(classifyProviderError(new Error("接口地址不存在（404）")).definitive).toBe(true);
});

test("图片接口超时 → unknown（不判死、不自动重提交），需人工确认", async () => {
    const { port } = makeProvider({
        generateImage: async () => {
            throw new Error("生图请求超时，接口长时间没有返回，请稍后重试或更换渠道");
        },
    });
    const gateway = makeGateway(port);
    const task = await gateway.runTool({ toolId: "ORNAMENT_TEXT", prompt: "烫金文字" });
    expect(task.status).toBe("unknown");
    expect(task.error?.code).toBe("timeout-or-network");
    expect(task.reconcileRequired).toBe(true);
    expect(machine.canAutoResubmit(task)).toBe(false);
});

test("鉴权失败等确定性错误 → failed，可人工重试", async () => {
    const { port } = makeProvider({
        generateImage: async () => {
            throw new Error("鉴权失败，请检查 API Key、套餐权限或模型权限");
        },
    });
    const gateway = makeGateway(port);
    const task = await gateway.runTool({ toolId: "ORNAMENT_TEXT", prompt: "烫金文字" });
    expect(task.status).toBe("failed");
    // 确定性失败也不自动重提交（auto 只对 draft/validating 生效），但允许用户手动重试。
    expect(machine.canAutoResubmit(task)).toBe(false);
    const retried = await gateway.retry(task.id, { toolId: "ORNAMENT_TEXT", prompt: "烫金文字" });
    expect(retried.attempts).toBe(2);
});

/* ---------------- 状态机 ---------------- */

test("非法状态迁移直接抛错", () => {
    const record = machine.createTaskRecord({
        toolId: "SCALE_UP",
        capability: "image",
        prompt: "p",
        configSnapshot: { capability: "image", model: "m", count: "1" },
    });
    const done = machine.transitionTask(machine.transitionTask(machine.transitionTask(record, "validating"), "submitting"), "succeeded");
    expect(() => machine.transitionTask(done, "running")).toThrow(/Illegal tool task transition/);
});

test("指纹对 prompt/素材/模型敏感", () => {
    const base = { toolId: "SCALE_UP", prompt: "a", capability: "image" as const, configSnapshot: { capability: "image" as const, model: "m", count: "1" } };
    const one = machine.computeFingerprint(base);
    expect(machine.computeFingerprint({ ...base, prompt: "b" })).not.toBe(one);
    expect(machine.computeFingerprint({ ...base, sourceAssetIds: ["ref-1"] })).not.toBe(one);
    expect(machine.computeFingerprint({ ...base, configSnapshot: { ...base.configSnapshot, model: "m2" } })).not.toBe(one);
    expect(machine.computeFingerprint(base)).toBe(one);
});

/* ---------------- 持久化 ---------------- */

function memoryStorage() {
    const map = new Map<string, string>();
    return {
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => void map.set(key, value),
        removeItem: (key: string) => void map.delete(key),
    };
}

test("落盘剥离 dataUrl/blob，恢复时标记 payloadDropped", () => {
    const storage = memoryStorage();
    const task = {
        ...machine.createTaskRecord({
            toolId: "ORNAMENT_TEXT",
            capability: "image",
            prompt: "p",
            configSnapshot: { capability: "image", model: "m", count: "1" },
        }),
        status: "succeeded" as const,
        result: { items: [{ id: "i0", kind: "image" as const, dataUrl: "data:image/png;base64,AAA" }], receivedAt: 1 },
    };
    taskStore.persistTask(task, storage);
    const raw = storage.getItem(taskStore.taskStorageKey(task.id)) ?? "";
    expect(raw).not.toContain("data:image");
    expect(raw).not.toContain("base64");
    const restored = taskStore.readPersistedTasks(storage);
    expect(restored.length).toBe(1);
    expect(restored[0].result?.items[0].payloadDropped).toBe(true);
    expect(restored[0].result?.items[0].dataUrl).toBeUndefined();
});

test("落盘索引可裁剪，删除任务后索引同步", () => {
    const storage = memoryStorage();
    for (let i = 0; i < 3; i += 1) {
        const task = machine.createTaskRecord({
            toolId: "ORNAMENT_TEXT",
            capability: "image",
            prompt: `p${i}`,
            configSnapshot: { capability: "image", model: "m", count: "1" },
            id: `task-${i}`,
            at: 1_000 + i,
        });
        taskStore.persistTask(task, storage);
    }
    expect(taskStore.readPersistedTasks(storage).length).toBe(3);
    taskStore.forgetPersistedTask("task-1", storage);
    const left = taskStore.readPersistedTasks(storage).map((task) => task.id).sort();
    expect(left).toEqual(["task-0", "task-2"]);
});
