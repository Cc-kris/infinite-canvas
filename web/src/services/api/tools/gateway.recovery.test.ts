/**
 * 缺陷回归：刷新后「提交中 / 结果未知」的任务必须收敛到终态。
 *
 * 真实缺陷（CHANGE_COLOR_V2 实测）：任务快照落 localStorage 后，`hydrateAndRecoverToolTasks`
 * 没有调用方；即使调用，`recover()` 对没有 upstreamTaskId 的任务只会写回 unknown，
 * 历史记录于是永久停在「提交中」/「结果未知」，刷新多少次都不动。
 *
 * 现在的约定：
 * - 有 upstreamTaskId → 真的去查上游（poll）；
 * - 没有 upstreamTaskId → 本页请求已随刷新消失，且服务端没有按 clientOperationId 反查的接口，
 *   收敛为终态 failed + error.code=submit-unconfirmed + reconcileRequired；
 * - 收敛不自动重提交（canAutoResubmit 仍为 false），提示用户先确认上游再手动重试。
 *
 * 运行：cd web && bun test src/services/api/tools/gateway.recovery.test.ts
 */
import { expect, test } from "bun:test";

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

const { ToolTaskGateway, createMemoryTaskStore } = await import("./gateway");
const { canAutoResubmit, createTaskRecord, transitionTask } = await import("./task-machine");
type ToolTask = import("./task-machine").ToolTask;

function makeGateway() {
    const store = createMemoryTaskStore();
    const gateway = new ToolTaskGateway({
        getConfig: () => ({ model: "gpt-image-2", imageModel: "gpt-image-2", count: "1" }) as never,
        provider: { generateImage: async () => [], editImage: async () => [] } as never,
        store,
    });
    return { gateway, store };
}

function seed(store: ReturnType<typeof createMemoryTaskStore>, status: "submitting" | "unknown", ageMs = 5 * 60 * 1000): ToolTask {
    const now = Date.now();
    const draft = createTaskRecord({
        toolId: "CHANGE_COLOR_V2",
        capability: "image",
        prompt: "product-watch.jpg · #D9D9D9",
        configSnapshot: { capability: "image", model: "gpt-image-2", apiFormat: "openai", count: "1" },
        at: now - ageMs,
    });
    const submitting = transitionTask(draft, "validating", { at: now - ageMs });
    const next = transitionTask(submitting, "submitting", { at: now - ageMs });
    const task = status === "unknown" ? transitionTask(next, "unknown", { at: now - ageMs }) : next;
    store.set(task);
    return task;
}

test("刷新后「提交中」且无 upstreamTaskId → 收敛为 failed，不自动重提交", async () => {
    const { gateway, store } = makeGateway();
    const seeded = seed(store, "submitting");

    const { plan, task } = await gateway.recover(seeded.id);

    expect(task.status).toBe("failed");
    expect(task.error?.code).toBe("submit-unconfirmed");
    expect(task.error?.retryable).toBe(true);
    expect(task.reconcileRequired).toBe(true);
    expect(task.finishedAt).toBeNumber();
    expect(canAutoResubmit(task)).toBe(false);
    // 计划仍然只表达「需要人工确认」，不是重新提交
    expect(plan.autoResubmit).toBe(false);
    // 收敛结果写回存储，下一次刷新读到的是终态
    expect(store.get(seeded.id)?.status).toBe("failed");
});

test("刷新后「结果未知」且无 upstreamTaskId → 同样收敛为 failed", async () => {
    const { gateway, store } = makeGateway();
    const seeded = seed(store, "unknown", 60 * 1000);

    const { task } = await gateway.recover(seeded.id);

    expect(task.status).toBe("failed");
    expect(task.error?.code).toBe("submit-unconfirmed");
    expect(canAutoResubmit(task)).toBe(false);
});

test("recoverAll 把落盘的所有未完结任务一次性收敛，不留非终态", async () => {
    const { gateway, store } = makeGateway();
    seed(store, "submitting");
    seed(store, "unknown");

    const results = await gateway.recoverAll();

    expect(results).toHaveLength(2);
    expect(results.every((item) => item.task.status === "failed")).toBe(true);
    expect(store.list().every((task) => task.status === "failed")).toBe(true);
});

test("已终态任务不会被 recover 改动", async () => {
    const { gateway, store } = makeGateway();
    const seeded = seed(store, "submitting");
    const failed = transitionTask(seeded, "failed", {
        at: Date.now(),
        error: { code: "http-401", message: "unauthorized", retryable: false },
    });
    store.set(failed);

    const { plan, task } = await gateway.recover(failed.id);

    expect(plan.action).toBe("none");
    expect(task.status).toBe("failed");
    expect(task.error?.code).toBe("http-401");
});
