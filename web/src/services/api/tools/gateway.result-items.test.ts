/**
 * B7 缺陷回归：provider 返回的图片结果是 OSS `https://` 地址时，任务结果项必须落成 `url`。
 *
 * 背景：`sanitizeTaskForPersist()` 会把含 `dataUrl` 的项当作二进制剥离并置 `payloadDropped`，
 * 导致刷新/历史回填后结果图无法下载、存资产、发画布。远程地址落 `url` 可完整保留。
 * 运行：cd web && bun test src/services/api/tools/gateway.result-items.test.ts
 */
import { expect, test } from "bun:test";

/**
 * gateway → use-config-store → i18n 在模块期读 localStorage，而 bun test 没有 DOM。
 * 与 batch-runner.test.ts 同款最小实现，动态 import 保证测的是真实网关代码。
 */
const memoryKv = new Map<string, string>();
const localStorageStub = {
    getItem: (key: string) => memoryKv.get(key) ?? null,
    setItem: (key: string, value: string) => {
        memoryKv.set(key, String(value));
    },
    removeItem: (key: string) => {
        memoryKv.delete(key);
    },
    clear: () => memoryKv.clear(),
    key: (index: number) => [...memoryKv.keys()][index] ?? null,
    get length() {
        return memoryKv.size;
    },
};
Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: localStorageStub });

const { imageResultItems, ToolTaskGateway, createMemoryTaskStore } = await import("./gateway");
const { sanitizeTaskForPersist } = await import("./task-machine");
type ToolTask = import("./task-machine").ToolTask;

const OSS = "https://oss-us.dimenoss.com/images/2026/10/29/1793203892_6c7955f59b8ec82c2cc396916a3dffef.png";

test("远程 dataUrl 落成 url，持久化后不丢结果", () => {
    const items = imageResultItems("task-1", [{ id: "r1", dataUrl: OSS }]);
    expect(items).toEqual([{ id: "task-1-0", kind: "image", url: OSS }]);

    const task = { id: "task-1", result: { items, receivedAt: 1 } } as unknown as ToolTask;
    const persisted = sanitizeTaskForPersist(task);
    expect(persisted.result?.items[0]).toEqual({ id: "task-1-0", kind: "image", url: OSS });
    expect(persisted.result?.items[0].payloadDropped).toBeUndefined();
});

test("本地 base64 dataUrl 仍只写 dataUrl（持久化时按原策略剥离）", () => {
    const b64 = "data:image/png;base64,AAAA";
    const items = imageResultItems("task-2", [{ id: "r1", dataUrl: b64 }]);
    expect(items).toEqual([{ id: "task-2-0", kind: "image", dataUrl: b64 }]);

    const task = { id: "task-2", result: { items, receivedAt: 1 } } as unknown as ToolTask;
    const persisted = sanitizeTaskForPersist(task);
    expect(persisted.result?.items[0].payloadDropped).toBe(true);
    expect(persisted.result?.items[0].dataUrl).toBeUndefined();
});

test("多项结果保持顺序与索引", () => {
    const items = imageResultItems("task-3", [
        { id: "a", dataUrl: OSS },
        { id: "b", dataUrl: "data:image/png;base64,BBBB" },
    ]);
    expect(items.map((item) => item.id)).toEqual(["task-3-0", "task-3-1"]);
    expect(items[0].url).toBe(OSS);
    expect(items[1].dataUrl).toBe("data:image/png;base64,BBBB");
});

test("真实网关 submit 链路：OSS 结果在任务里带 url，刷新后仍可下载", async () => {
    const provider = {
        generateImage: async () => [{ id: "upstream-1", dataUrl: OSS }],
        editImage: async () => [{ id: "upstream-1", dataUrl: OSS }],
    };
    const gateway = new ToolTaskGateway({
        getConfig: () => ({ model: "gpt-image-2", imageModel: "gpt-image-2", count: "1" }) as never,
        provider: provider as never,
        store: createMemoryTaskStore(),
    });
    const task = await gateway.submit({
        toolId: "REMOVE_PEN",
        prompt: "remove watermark",
        config: { model: "gpt-image-2" },
        references: [{ id: "ref-1", name: "ref-1.png", type: "image/png", dataUrl: "data:image/png;base64,AAAA" }] as never,
        kind: "image",
        mode: "edit",
    } as never);

    expect(task.status).toBe("succeeded");
    expect(task.result?.items[0]).toEqual({ id: `${task.id}-0`, kind: "image", url: OSS });
    expect(sanitizeTaskForPersist(task).result?.items[0].url).toBe(OSS);
});
