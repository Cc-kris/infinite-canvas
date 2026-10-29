/**
 * 真实缺陷回归（2026-10-29 独立复核 `batch_XoWY1VJqvX`）：
 *
 * 同一批次两行都成功、提交只差 9ms，行 1 的结果只有 `blob:` 会话地址 + `storageKey`，
 * 行 2 是 OSS 直链。旧 `collectResultUrls` 只收 http(s) → 行 1 的 `resultUrls` 落盘成 []，
 * 刷新后同一页面「行 1 没图、行 2 有链接」，看起来像丢图/串行。
 * 事实是任务快照里两行结果都在，只是显示地址没按 `storageKey` 重建。
 *
 * 这里锁三件事：
 * 1) 两行各按自己 taskId 的真实结果恢复（prompt/字段不同，不许互相串）；
 * 2) 行序、提交时序、batchId 不被回填改写；
 * 3) 只有真实任务结果才写地址：任务缺失/字节取不回来就保持空，绝不伪造。
 */
import { describe, expect, test } from "bun:test";

import type { BatchRowOutcome } from "@/services/api/tools/batch-runner";
import type { ToolTask } from "@/services/api/tools/task-machine";

/** store 依赖链在模块导入期会读 localStorage；bun 没有 DOM，先补一个可枚举的替身。 */
const local = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
        getItem: (key: string) => local.get(key) ?? null,
        setItem: (key: string, value: string) => void local.set(key, value),
        removeItem: (key: string) => void local.delete(key),
        clear: () => local.clear(),
        key: (index: number) => Array.from(local.keys())[index] ?? null,
        get length() {
            return local.size;
        },
    } as Storage,
});

const batchStore = await import("@/stores/use-batch-task-store");
const taskStore = await import("@/stores/use-tool-task-store");
const { collectResultUrls } = await import("@/services/api/tools/batch-runner");

const BATCH_ID = "batch_XoWY1VJqvX";
const ROW1_TASK = "task-mvtdllw0-dn440l";
const ROW2_TASK = "task-mvtdllwa-4nnit3";
const ROW1_KEY = "tool-result:MOMNo1Dk1a";
const ROW2_KEY = "tool-result:4tmHV06Oon";
const ROW1_BLOB = "blob:http://127.0.0.1:3000/6f1d0a9e";
const ROW1_FRESH = "blob:http://127.0.0.1:3000/fresh-row1";
const ROW2_OSS =
    "https://oss-us.dimenoss.com/images/2026/10/29/1793268247_7ccc9eed5d79e196344c3b00aab00fc3.png";

function task(patch: Partial<ToolTask> & { id: string }): ToolTask {
    return {
        toolId: "DESIGN_BATCH",
        status: "succeeded",
        clientOperationId: `op-${patch.id}`,
        fingerprint: `fp-${patch.id}`,
        capability: "image",
        prompt: "p",
        configSnapshot: { capability: "image", model: "m", count: "1" },
        sourceAssetIds: [],
        createdAt: 1,
        updatedAt: 2,
        attempts: 1,
        pollCount: 0,
        transientFailures: 0,
        ...patch,
    };
}

function outcome(rowId: string, taskId: string | undefined, patch: Partial<BatchRowOutcome> = {}): BatchRowOutcome {
    return {
        rowId,
        status: "succeeded",
        ...(taskId ? { taskId } : {}),
        attempts: 1,
        resultCount: 1,
        resultUrls: [],
        preflightIssues: [],
        duplicates: [],
        deduplicated: false,
        ...patch,
    };
}

/** 真实批次的两行：payload 明确不同（prompt/尺寸/模型都不同）。 */
function realBatch() {
    const rows = [
        batchStore.createBatchTaskRow({
            id: "row_1",
            label: "1",
            prompt: "把商品放到大理石台面上，正面 3/4 侧光，保留包装细节",
            model: "seedream-4",
            size: "1024x1024",
            count: 1,
            fields: { scene: "marble-counter" },
        }),
        batchStore.createBatchTaskRow({
            id: "row_2",
            label: "2",
            prompt: "把同一件商品换成户外草地远景，俯拍 30 度，不要文字",
            model: "seedream-4-fast",
            size: "1536x1024",
            count: 1,
            fields: { scene: "outdoor-grass" },
        }),
    ];
    return {
        ...batchStore.createBatchTask("DESIGN_BATCH", rows),
        batchId: BATCH_ID,
        status: "completed" as const,
        startedAt: 1_793_268_224_000,
        finishedAt: 1_793_268_280_000,
        createdAt: 1_793_268_224_000,
        updatedAt: 1_793_268_280_000,
        // 落盘态：行 1 的 blob 地址被剥离 → []；行 2 是直链 → 保留。
        outcomes: [outcome("row_1", ROW1_TASK), outcome("row_2", ROW2_TASK, { resultUrls: [ROW2_OSS] })],
    };
}

describe("DESIGN_BATCH 刷新后行结果恢复", () => {
    test("两行各按自己的任务结果恢复：行 1 走 storageKey，行 2 用直链（payload 不同不串行）", async () => {
        const batch = realBatch();
        const resolved: string[] = [];
        const tasks: Record<string, ToolTask> = {
            [ROW1_TASK]: task({
                id: ROW1_TASK,
                prompt: batch.rows[0].prompt,
                createdAt: 1_793_268_224_785,
                finishedAt: 1_793_268_260_000,
                result: {
                    items: [{ id: "i-row1", kind: "image", url: ROW1_BLOB, storageKey: ROW1_KEY }],
                    receivedAt: 1_793_268_260_000,
                },
            }),
            [ROW2_TASK]: task({
                id: ROW2_TASK,
                prompt: batch.rows[1].prompt,
                createdAt: 1_793_268_224_794,
                finishedAt: 1_793_268_270_000,
                // 真实形状：任务项本身只有会话 blob + storageKey，直链只在 outcome 里。
                result: {
                    items: [{ id: "i-row2", kind: "image", url: "blob:http://127.0.0.1:3000/1d8bc456", storageKey: ROW2_KEY }],
                    receivedAt: 1_793_268_270_000,
                },
            }),
        };

        const restored = await batchStore.restoreBatchRowResults(batch, tasks, async (key) => {
            resolved.push(key);
            return key === ROW1_KEY ? ROW1_FRESH : null;
        });

        // 只按真实 storageKey 取字节，没有拿行 2 的 key 去解析行 1。
        expect(resolved).toEqual([ROW1_KEY]);
        expect(restored.outcomes.map((item) => item.rowId)).toEqual(["row_1", "row_2"]);
        expect(restored.outcomes[0].resultUrls).toEqual([ROW1_FRESH]);
        expect(restored.outcomes[1].resultUrls).toEqual([ROW2_OSS]);
        expect(restored.outcomes.map((item) => item.resultCount)).toEqual([1, 1]);
        // 提交时序/行序/批次标识原样保留。
        expect(restored.batchId).toBe(BATCH_ID);
        expect(restored.updatedAt).toBe(batch.updatedAt);
        expect(restored.rows.map((row) => row.prompt)).toEqual(batch.rows.map((row) => row.prompt));
        expect(restored.rows[0].prompt).not.toBe(restored.rows[1].prompt);
        expect(restored.rows[0].size).not.toBe(restored.rows[1].size);
    });

    test("部分结果恢复：一行任务缺失时保持原样，不借用另一行结果", async () => {
        const batch = realBatch();
        const tasks: Record<string, ToolTask> = {
            [ROW1_TASK]: task({
                id: ROW1_TASK,
                result: { items: [{ id: "i-row1", kind: "image", url: ROW1_BLOB, storageKey: ROW1_KEY }], receivedAt: 10 },
            }),
            // 行 2 的任务快照在本地被清掉/从未落盘。
        };

        const restored = await batchStore.restoreBatchRowResults(batch, tasks, async () => ROW1_FRESH);

        expect(restored.outcomes[0].resultUrls).toEqual([ROW1_FRESH]);
        expect(restored.outcomes[1].resultUrls).toEqual([ROW2_OSS]);
        expect(restored.outcomes[1].resultCount).toBe(1);
        expect(restored.outcomes[1].taskId).toBe(ROW2_TASK);
    });

    test("任务有结果项但字节取不回来：不伪造地址、不退回死 blob，原样返回", async () => {
        const batch = realBatch();
        const tasks: Record<string, ToolTask> = {
            [ROW1_TASK]: task({
                id: ROW1_TASK,
                result: { items: [{ id: "i-row1", kind: "image", url: ROW1_BLOB, storageKey: ROW1_KEY }], receivedAt: 10 },
            }),
            [ROW2_TASK]: task({
                id: ROW2_TASK,
                result: { items: [{ id: "i-row2", kind: "image", url: ROW2_OSS }], receivedAt: 11 },
            }),
        };

        const restored = await batchStore.restoreBatchRowResults(batch, tasks, async () => null);

        expect(restored.outcomes[0].resultUrls).toEqual([]);
        expect(restored.outcomes[0].resultCount).toBe(1);
        // 行 2 已是直链，回填结果与落盘一致 → 整个批次不需要改。
        expect(restored).toBe(batch);
    });

    test("落盘剥离会话 blob、保留直链（刷新后才能按 storageKey 重建）", () => {
        const batch = realBatch();
        const withSession = {
            ...batch,
            outcomes: [{ ...batch.outcomes[0], resultUrls: [ROW1_FRESH] }, batch.outcomes[1]],
        };
        const persisted = batchStore.sanitizeBatchForPersist(withSession);

        expect(persisted.outcomes[0].resultUrls).toEqual([]);
        expect(persisted.outcomes[1].resultUrls).toEqual([ROW2_OSS]);
        expect(persisted.rows[0].references).toEqual([]);
        expect(persisted.rows[0].referenceNames).toEqual([]);
        // 运行期仍要能显示本轮结果：blob 只在显式 includeSession 时进显示地址。
        const items = [{ id: "i", kind: "image" as const, url: ROW1_FRESH }];
        expect(collectResultUrls(items)).toEqual([]);
        expect(collectResultUrls(items, { includeSession: true })).toEqual([ROW1_FRESH]);
    });

    test("fresh reload：hydrate 按任务快照回填并写回本地，索引有历史列表消费", async () => {
        local.clear();
        batchStore.useBatchTaskStore.getState().reset();
        taskStore.useToolTaskStore.getState().reset();

        const batch = realBatch();
        const tasks: Record<string, ToolTask> = {
            [ROW1_TASK]: task({
                id: ROW1_TASK,
                // 用直链模拟“任务快照里真实存在的结果”，避免测试依赖 IndexedDB。
                result: { items: [{ id: "i-row1", kind: "image", url: ROW2_OSS.replace("_7c", "_aa") }], receivedAt: 10 },
            }),
            [ROW2_TASK]: task({
                id: ROW2_TASK,
                result: { items: [{ id: "i-row2", kind: "image", url: ROW2_OSS }], receivedAt: 11 },
            }),
        };
        local.set(`${batchStore.BATCH_INDEX_KEY}`, JSON.stringify([BATCH_ID]));
        local.set(`batch-task:v1:${BATCH_ID}`, JSON.stringify(batchStore.sanitizeBatchForPersist(batch)));
        local.set(taskStore.TASK_INDEX_KEY, JSON.stringify([ROW1_TASK, ROW2_TASK]));
        for (const item of Object.values(tasks)) {
            local.set(taskStore.taskStorageKey(item.id), JSON.stringify(item));
        }

        // bun 没有 window，getBatchStorage() 会退化成模块内存存储；这里显式注入同一份存储。
        const storage = globalThis.localStorage;
        batchStore.useBatchTaskStore.getState().hydrate(storage, storage);

        const deadline = Date.now() + 2_000;
        while (batchStore.useBatchTaskStore.getState().batches[BATCH_ID]?.outcomes[0]?.resultUrls.length === 0) {
            if (Date.now() > deadline) throw new Error("hydrate 后行 1 结果未回填");
            await new Promise((resolve) => setTimeout(resolve, 10));
        }

        const hydrated = batchStore.useBatchTaskStore.getState().batches[BATCH_ID];
        expect(hydrated.outcomes[0].resultUrls).toEqual([ROW2_OSS.replace("_7c", "_aa")]);
        expect(hydrated.outcomes[1].resultUrls).toEqual([ROW2_OSS]);
        // 回填写回本地：第二次刷新不会又丢。
        const persisted = JSON.parse(local.get(`batch-task:v1:${BATCH_ID}`) as string);
        expect(persisted.outcomes[0].resultUrls).toEqual([ROW2_OSS.replace("_7c", "_aa")]);

        // 索引不是只写不读：历史列表按最近更新排序，行序不变。
        const older = { ...batch, batchId: "batch_older", updatedAt: batch.updatedAt - 1 };
        const history = batchStore.sortBatchesForHistory({ [BATCH_ID]: hydrated, batch_older: older });
        expect(history.map((item) => item.batchId)).toEqual([BATCH_ID, "batch_older"]);
        expect(history[0].rows.map((row) => row.id)).toEqual(["row_1", "row_2"]);
    });
});
