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

test("刷新后「提交中」且无 upstreamTaskId、请求从未发出 → 收敛为 failed/submit-not-dispatched，不吓人也不自动重提交", async () => {
    const { gateway, store } = makeGateway();
    const seeded = seed(store, "submitting");

    const { plan, task } = await gateway.recover(seeded.id);

    expect(task.status).toBe("failed");
    expect(task.error?.code).toBe("submit-not-dispatched");
    expect(task.error?.retryable).toBe(true);
    // 请求根本没发出去 → 不需要人工去服务商后台对账
    expect(task.reconcileRequired).toBe(false);
    expect(task.finishedAt).toBeNumber();
    expect(canAutoResubmit(task)).toBe(false);
    expect(plan.autoResubmit).toBe(false);
    expect(store.get(seeded.id)?.status).toBe("failed");
});

test("刷新后「提交中」但请求已发出（有 dispatchedAt）→ 才是 failed/submit-unconfirmed + 要求人工确认", async () => {
    const { gateway, store } = makeGateway();
    const seeded = seed(store, "submitting");
    store.set({ ...seeded, dispatchedAt: seeded.submittedAt });

    const { task } = await gateway.recover(seeded.id);

    expect(task.status).toBe("failed");
    expect(task.error?.code).toBe("submit-unconfirmed");
    expect(task.reconcileRequired).toBe(true);
    expect(canAutoResubmit(task)).toBe(false);
});

test("刷新发生在提交宽限期内（<60s）→ 只等待，不抢先结案", async () => {
    const { gateway, store } = makeGateway();
    const seeded = seed(store, "submitting", 10 * 1000);

    const { plan, task } = await gateway.recover(seeded.id);

    expect(plan.action).toBe("wait");
    expect(task.status).toBe("submitting");
    expect(task.error).toBeUndefined();
    expect(store.get(seeded.id)?.status).toBe("submitting");
});

test("刷新后「结果未知」且无 upstreamTaskId → 同样收敛为 failed", async () => {
    const { gateway, store } = makeGateway();
    const seeded = seed(store, "unknown", 60 * 1000);

    const { task } = await gateway.recover(seeded.id);

    expect(task.status).toBe("failed");
    expect(task.error?.code).toBe("submit-not-dispatched");
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

/**
 * 缺陷回归：刷新后有 upstreamTaskId 的视频任务，`recoverAll` 只探测一次就返回 running，
 * 页面开着也不会再推进（历史永远停在「生成中」）。接力 `waitForResult` 必须走到终态，
 * 且全程不重提交（不产生第二次计费）。
 */
test("刷新后仍在跑的视频任务：探测一次后接力等待到终态，且不重提交", async () => {
    const store = createMemoryTaskStore();
    const calls = { create: 0, poll: 0 };
    const provider = {
        createVideoTask: async () => {
            calls.create += 1;
            throw new Error("recovery must not resubmit");
        },
        pollVideoTask: async () => {
            calls.poll += 1;
            return calls.poll < 2
                ? { status: "pending" as const }
                : { status: "completed" as const, result: { url: "https://cdn.example.com/out.mp4", mimeType: "video/mp4" } };
        },
    };
    const gateway = new ToolTaskGateway({
        getConfig: () => ({ model: "MiniMax-H3", apiFormat: "openai", count: "1" }) as never,
        provider: provider as never,
        store,
    });

    const now = Date.now();
    const draft = createTaskRecord({
        toolId: "SALE_VIDEO",
        capability: "video",
        prompt: "sale-video prompt",
        configSnapshot: { capability: "video", model: "MiniMax-H3", apiFormat: "openai", count: "1", size: "720x1280", videoSeconds: "5" },
        at: now,
    });
    const running = transitionTask(
        transitionTask(transitionTask(draft, "validating", { at: now }), "submitting", { at: now }),
        "running",
        {
            at: now,
            upstreamTaskId: "up-reload-1",
            upstreamProvider: "http",
            lastHeartbeatAt: now,
        },
    );
    store.set(running);

    // 1) 刷新恢复：只探测一次，任务仍未完结
    const recovered = await gateway.recoverAll({ maxPolls: 1 });
    expect(recovered).toHaveLength(1);
    expect(recovered[0].task.status).toBe("running");

    // 2) 接力等待：推进到终态
    const final = await gateway.waitForResult(running.id, { pollIntervalMs: 0 });
    expect(final.status).toBe("succeeded");
    expect(final.result?.items?.[0]?.url).toBe("https://cdn.example.com/out.mp4");
    expect(store.get(running.id)?.status).toBe("succeeded");
    expect(calls.create).toBe(0);
});

test("过期（>30 分钟）的「结果未知」视频任务：必须按 upstreamTaskId 真查上游，而不是再标一次 unknown", async () => {
    const store = createMemoryTaskStore();
    const calls = { create: 0, poll: 0 };
    const provider = {
        createVideoTask: async () => {
            calls.create += 1;
            throw new Error("recovery must not resubmit");
        },
        pollVideoTask: async () => {
            calls.poll += 1;
            return { status: "completed" as const, result: { url: "https://cdn.example.com/expired.mp4", mimeType: "video/mp4" } };
        },
    };
    const gateway = new ToolTaskGateway({
        getConfig: () => ({ model: "MiniMax-H3", apiFormat: "openai", count: "1" }) as never,
        provider: provider as never,
        store,
    });

    // 真实缺陷复现条件：提交时间已超过 DEFAULT_TASK_TIMEOUT_MS(30min)，任务状态 unknown、有 upstreamTaskId
    const stale = Date.now() - 14 * 60 * 60 * 1000;
    const draft = createTaskRecord({
        toolId: "VIDEO_CONCAT",
        capability: "video",
        prompt: "concat 2 clips",
        configSnapshot: { capability: "video", model: "MiniMax-H3", apiFormat: "openai", count: "1", size: "720x1280", videoSeconds: "13" },
        at: stale,
    });
    const running = transitionTask(
        transitionTask(transitionTask(draft, "validating", { at: stale }), "submitting", { at: stale }),
        "running",
        { at: stale, upstreamTaskId: "up-stale-1", upstreamProvider: "http", lastHeartbeatAt: stale },
    );
    const unknown = transitionTask(running, "unknown", { at: stale });
    store.set(unknown);

    const { plan, task } = await gateway.recover(unknown.id);

    expect(plan.action).toBe("poll");
    expect(plan.reason).toBe("expired-query-upstream");
    expect(calls.poll).toBe(1);
    expect(calls.create).toBe(0);
    expect(task.status).toBe("succeeded");
    expect(task.result?.items?.[0]?.url).toBe("https://cdn.example.com/expired.mp4");
    expect(store.get(unknown.id)?.status).toBe("succeeded");
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
