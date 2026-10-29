/**
 * 跨标签 recoverAll 竞态回归（真实缺陷：lf_pose_real_generate，2026-10-29）。
 *
 * 现场（证据 docs/V1.0/plan_linkfox_navigation/evidence/suite-design-realgen-20261029/RESULTS.json）：
 * 标签页 1 正在真实提交（HTTP 在飞行中、还没有 upstreamTaskId），标签页 2 打开任意工具页
 * → recoverAll() 把这条「提交中」当成刷新遗留 → closeUnconfirmed() 写成 failed/submit-unconfirmed。
 * 实测 task-mvtczxwo-e1d1w0 在 +18s 被误关，+50s 真实响应回来才改回 succeeded；
 * task-mvtd45nv-y7cum6 同批。若标签页 1 先被关，真实任务就永久停在「需人工确认」。
 *
 * 现在的约定：
 * - 真正在跑任务的标签页持有租约（心跳续期），别的标签页看到新鲜租约 → 只读不改，不查询、不关闭；
 * - 持有者崩溃/被关 → 租约 TTL 过期后，下一次恢复照旧接管，不牺牲原有的收敛能力（可续查）；
 * - 落盘快照比本页内存新（原标签页已经写成功）→ 以落盘为准，绝不用旧状态覆盖新终态。
 *
 * 运行：cd web && bun test src/services/api/tools/gateway.cross-tab-recovery.test.ts
 */
import { expect, test } from "bun:test";

import {
    LEASE_TTL_MS,
    createTaskLease,
    type TaskLeaseStorage,
} from "./task-lease";
import { canAutoResubmit, createTaskRecord, transitionTask, type ToolTask } from "./task-machine";

// gateway 依赖链会加载 i18n（读 localStorage），所以先给全局替身再动态导入。
const kv = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
        getItem: (key: string) => kv.get(key) ?? null,
        setItem: (key: string, value: string) => {
            kv.set(key, String(value));
        },
        removeItem: (key: string) => {
            kv.delete(key);
        },
        clear: () => kv.clear(),
        key: (index: number) => [...kv.keys()][index] ?? null,
        get length() {
            return kv.size;
        },
    },
});

const { ToolTaskGateway, createMemoryTaskStore } = await import("./gateway");
type ToolTaskGateway = import("./gateway").ToolTaskGateway;

function memoryStorage(): TaskLeaseStorage & { dump: Map<string, string> } {
    const dump = new Map<string, string>();
    return {
        dump,
        getItem: (key) => dump.get(key) ?? null,
        setItem: (key, value) => {
            dump.set(key, String(value));
        },
        removeItem: (key) => {
            dump.delete(key);
        },
    };
}

/** 两个「标签页」共享同一份 localStorage 视图，各自有独立 ownerId 与时钟。 */
function tabs(nowRef: { at: number }) {
    const storage = memoryStorage();
    const clock = () => nowRef.at;
    const tabA = createTaskLease({ storage, ownerId: "page-a", now: clock });
    const tabB = createTaskLease({ storage, ownerId: "page-b", now: clock });
    return { storage, tabA, tabB, clock };
}

const config = () => ({ model: "gpt-image-2", imageModel: "gpt-image-2", count: "1" }) as never;

function makeGateway(lease: ReturnType<typeof createTaskLease>, nowRef: { at: number }) {
    const store = createMemoryTaskStore();
    const polls: string[] = [];
    const gateway = new ToolTaskGateway({
        getConfig: config,
        provider: {
            generateImage: async () => [],
            editImage: async () => [],
            createVideoTask: async () => {
                throw new Error("must not resubmit");
            },
            getVideoTask: async (id: string) => {
                polls.push(id);
                return { id, state: "running", progress: 0 };
            },
        } as never,
        store,
        lease,
        now: () => nowRef.at,
    });
    return { gateway, store, polls };
}

function seedTask(
    store: ReturnType<typeof createMemoryTaskStore>,
    status: "submitting" | "unknown",
    at: number,
): ToolTask {
    const draft = createTaskRecord({
        toolId: "AI_POSE_GENERATOR",
        capability: "image",
        prompt: "pose-suite.jpg",
        configSnapshot: { capability: "image", model: "gpt-image-2", apiFormat: "openai", count: "1" },
        at,
    });
    const validating = transitionTask(draft, "validating", { at });
    const submitting = transitionTask(validating, "submitting", { at });
    const task = status === "unknown" ? transitionTask(submitting, "unknown", { at }) : submitting;
    store.set(task);
    return task;
}

test("租约语义：别的标签持有 → isLiveElsewhere；本页持有 → isLive 且不算 elsewhere", () => {
    const nowRef = { at: 1_000_000 };
    const { tabA, tabB } = tabs(nowRef);

    tabA.claim("task-1", nowRef.at);

    expect(tabA.isLive("task-1", nowRef.at)).toBe(true);
    expect(tabA.isLiveElsewhere("task-1", nowRef.at)).toBe(false);
    expect(tabB.isLiveElsewhere("task-1", nowRef.at)).toBe(true);

    // 过期（超过 TTL）后任何人都不再认为有人在跑
    expect(tabB.isLiveElsewhere("task-1", nowRef.at + LEASE_TTL_MS + 1)).toBe(false);
    expect(tabA.isLive("task-1", nowRef.at + LEASE_TTL_MS + 1)).toBe(false);

    // 本页并未持有该租约（A 持有）：release 不能把别人的活租约删掉
    tabB.release("task-1");
    expect(tabB.isLiveElsewhere("task-1", nowRef.at)).toBe(true);

    tabA.release("task-1");
    expect(tabB.isLiveElsewhere("task-1", nowRef.at)).toBe(false);
});

test("新标签遇到另一标签真实 in-flight 的「提交中」任务：不关闭、不改状态、不查询", async () => {
    const nowRef = { at: 2_000_000 };
    const { tabA, tabB } = tabs(nowRef);
    const { gateway: gatewayB, store: storeB, polls } = makeGateway(tabB, nowRef);

    // 标签页 A：已经发出请求（submitting + 新鲜租约），还没有 upstreamTaskId
    const task = seedTask(storeB, "submitting", nowRef.at - 60_000);
    tabA.claim(task.id, nowRef.at);

    const { plan, task: recovered } = await gatewayB.recover(task.id);

    expect(plan.action).toBe("wait");
    expect(plan.reason).toBe("active-in-other-tab");
    expect(plan.autoResubmit).toBe(false);
    expect(recovered.status).toBe("submitting");
    expect(recovered.error).toBeUndefined();
    expect(storeB.get(task.id)?.status).toBe("submitting");
    expect(polls).toHaveLength(0);
    // 租约没被抢：A 仍然是持有者
    expect(tabA.isLive(task.id, nowRef.at)).toBe(true);
});

test("租约过期后（持有者崩溃/被关）恢复照旧接管：收敛为 submit-unconfirmed，不重提交", async () => {
    const nowRef = { at: 3_000_000 };
    const { tabA, tabB } = tabs(nowRef);
    const { gateway: gatewayB, store: storeB } = makeGateway(tabB, nowRef);

    const task = seedTask(storeB, "submitting", nowRef.at - 60_000);
    tabA.claim(task.id, nowRef.at);

    // 心跳停了 → 超过 TTL
    nowRef.at += LEASE_TTL_MS + 5_000;

    const { plan, task: recovered } = await gatewayB.recover(task.id);

    expect(plan.reason).toBe("submit-uncertain");
    expect(recovered.status).toBe("failed");
    expect(recovered.error?.code).toBe("submit-unconfirmed");
    expect(recovered.reconcileRequired).toBe(true);
    expect(canAutoResubmit(recovered)).toBe(false);
    expect(storeB.get(task.id)?.status).toBe("failed");
});

test("本页自己持有的租约不算「别的标签」：不阻断本页恢复", async () => {
    const nowRef = { at: 4_000_000 };
    const { tabA } = tabs(nowRef);
    const { gateway, store } = makeGateway(tabA, nowRef);

    const task = seedTask(store, "submitting", nowRef.at - 60_000);
    tabA.claim(task.id, nowRef.at);

    const { plan, task: recovered } = await gateway.recover(task.id);

    expect(plan.reason).toBe("submit-uncertain");
    expect(recovered.status).toBe("failed");
});

test("recoverAll 混合场景：只收敛没人管的，活跃标签的任务原样保留", async () => {
    const nowRef = { at: 5_000_000 };
    const { tabA, tabB } = tabs(nowRef);
    const { gateway: gatewayB, store: storeB } = makeGateway(tabB, nowRef);

    const inflightElsewhere = seedTask(storeB, "submitting", nowRef.at - 90_000);
    tabA.claim(inflightElsewhere.id, nowRef.at);
    const orphan = seedTask(storeB, "submitting", nowRef.at - 90_000);

    const results = await gatewayB.recoverAll();
    const byId = new Map(results.map((item) => [item.task.id, item.task]));

    expect(byId.get(inflightElsewhere.id)?.status).toBe("submitting");
    expect(byId.get(orphan.id)?.status).toBe("failed");
    expect(byId.get(orphan.id)?.error?.code).toBe("submit-unconfirmed");
    expect(storeB.get(inflightElsewhere.id)?.status).toBe("submitting");
    expect(storeB.get(orphan.id)?.status).toBe("failed");
});

test("落盘快照比本页内存新：以落盘为准，不用旧 submitting 覆盖别人的成功", async () => {
    const nowRef = { at: 6_000_000 };
    const { tabA, tabB } = tabs(nowRef);
    const { gateway: gatewayB, store: storeB } = makeGateway(tabB, nowRef);

    const stale = seedTask(storeB, "submitting", nowRef.at - 120_000);
    // 原标签页已经写完成功（只进了 localStorage，本页内存还是旧的）
    const succeeded = transitionTask(stale, "succeeded", {
        at: nowRef.at - 1_000,
        result: { items: [], receivedAt: nowRef.at - 1_000 },
    });
    storeB.readPersisted = () => succeeded;
    tabA.release(stale.id);

    const { plan, task } = await gatewayB.recover(stale.id);

    expect(plan.action).toBe("none");
    expect(task.status).toBe("succeeded");
    expect(storeB.get(stale.id)?.status).toBe("succeeded");
});

test("未知任务被别人持有：只读不改，也不替它轮询上游", async () => {
    const nowRef = { at: 7_000_000 };
    const { tabA, tabB } = tabs(nowRef);
    const { gateway: gatewayB, store: storeB, polls } = makeGateway(tabB, nowRef);

    const task = seedTask(storeB, "unknown", nowRef.at - 60_000);
    tabA.claim(task.id, nowRef.at);

    const { plan, task: recovered } = await gatewayB.recover(task.id);

    expect(plan.reason).toBe("active-in-other-tab");
    expect(recovered.status).toBe("unknown");
    expect(polls).toHaveLength(0);
    expect(storeB.get(task.id)?.status).toBe("unknown");
});

test("未知任务没人持有：仍按原约定收敛，不重提交", async () => {
    const nowRef = { at: 8_000_000 };
    const { tabB } = tabs(nowRef);
    const { gateway: gatewayB, store: storeB } = makeGateway(tabB, nowRef);

    const task = seedTask(storeB, "unknown", nowRef.at - 60_000);

    const { task: recovered } = await gatewayB.recover(task.id);

    expect(recovered.status).toBe("failed");
    expect(recovered.error?.code).toBe("submit-unconfirmed");
    expect(canAutoResubmit(recovered)).toBe(false);
});

test("真实复现：A 标签提交仍在飞行中 → B 标签新开页面恢复，不误关；A 的结果照常落地", async () => {
    const nowRef = { at: 9_000_000 };
    const { tabA, tabB } = tabs(nowRef);
    const shared = createMemoryTaskStore();
    const polls: string[] = [];

    const control: { release?: (value: unknown) => void } = {};
    const pendingImage = new Promise<unknown>((resolve) => {
        control.release = resolve;
    });

    const gatewayA = new ToolTaskGateway({
        getConfig: config,
        provider: {
            generateImage: () => pendingImage,
            editImage: () => pendingImage,
        } as never,
        store: shared,
        lease: tabA,
        now: () => nowRef.at,
    });
    const gatewayB = new ToolTaskGateway({
        getConfig: config,
        provider: {
            generateImage: async () => [],
            editImage: async () => [],
            getVideoTask: async (id: string) => {
                polls.push(id);
                return { id, state: "running", progress: 0 };
            },
        } as never,
        store: shared,
        lease: tabB,
        now: () => nowRef.at,
    });

    // 标签页 A：真实提交，provider 还没返回（请求在飞行中，没有 upstreamTaskId）
    const inflight = gatewayA.submit({
        toolId: "AI_POSE_GENERATOR",
        prompt: "pose-suite-inflight.jpg",
    } as never);

    // 让出事件循环，等到 submitting 写进共享 store（同一浏览器的 localStorage 视图）
    await new Promise((resolve) => setTimeout(resolve, 0));
    const submitting = shared.list().find((task) => task.status === "submitting");
    expect(submitting).toBeDefined();

    // 标签页 B：等价于此刻新开一个工具页 → hydrate + recoverAll
    const recovered = await gatewayB.recoverAll();

    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.plan.reason).toBe("active-in-other-tab");
    expect(shared.get(submitting!.id)?.status).toBe("submitting");
    expect(shared.get(submitting!.id)?.error).toBeUndefined();
    expect(polls).toHaveLength(0);

    // A 的真实响应回来 → 该任务照常成功（不是被 B 关成 submit-unconfirmed）
    control.release?.([{ dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" }]);
    const settled = await inflight;
    expect(settled.status).toBe("succeeded");
    expect(shared.get(settled.id)?.status).toBe("succeeded");
    // A 到终态后释放租约，B 之后再恢复也不会再动它
    expect(tabB.isLiveElsewhere(settled.id, nowRef.at)).toBe(false);
});
