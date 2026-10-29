import { describe, expect, test } from "bun:test";

import type { BatchRowOutcome } from "@/services/api/tools/batch-runner";
import type { ToolTask } from "@/services/api/tools/task-machine";

/** store 的依赖链会读 localStorage；bun 测试环境没有 DOM，先补一个最小实现再动态 import。
 *  bun 1.4 自带只读的 localStorage 全局，直接赋值会抛 readonly，必须用 defineProperty 覆盖。 */
const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
        clear: () => store.clear(),
        key: () => null,
        length: 0,
    } as Storage,
});

const { createBatchTask, createBatchTaskRow, reconcileInterruptedBatch } = await import("@/stores/use-batch-task-store");

function task(overrides: Partial<ToolTask>): ToolTask {
    return {
        id: "task-1",
        toolId: "PRODUCT_IMAGE_SUITE",
        status: "succeeded",
        clientOperationId: "op-1",
        fingerprint: "fp-1",
        capability: "image",
        prompt: "p",
        configSnapshot: { capability: "image", model: "m", count: "1" },
        sourceAssetIds: [],
        createdAt: 1,
        updatedAt: 2,
        attempts: 1,
        pollCount: 0,
        transientFailures: 0,
        ...overrides,
    };
}

function outcome(rowId: string, patch: Partial<BatchRowOutcome> = {}): BatchRowOutcome {
    return {
        rowId,
        status: "running",
        attempts: 1,
        startedAt: 100,
        resultCount: 0,
        resultUrls: [],
        preflightIssues: [],
        duplicates: [],
        deduplicated: false,
        ...patch,
    };
}

describe("reconcileInterruptedBatch", () => {
    test("刷新后：有 taskId 的行回填真实结果，没有 taskId 的行关闭为可重试失败", () => {
        const rows = [createBatchTaskRow({ prompt: "a" }), createBatchTaskRow({ prompt: "b" })];
        const batch = {
            ...createBatchTask("PRODUCT_IMAGE_SUITE", rows),
            status: "running" as const,
            startedAt: 100,
            outcomes: [outcome(rows[0].id, { status: "succeeded", taskId: "task-ok", resultCount: 1, resultUrls: ["https://cdn.example/a.png"] }), outcome(rows[1].id)],
        };

        const reconciled = reconcileInterruptedBatch(batch, {}, 500);

        expect(reconciled.status).toBe("completed");
        expect(reconciled.finishedAt).toBe(500);
        expect(reconciled.outcomes[0]).toMatchObject({ status: "succeeded", resultCount: 1, resultUrls: ["https://cdn.example/a.png"] });
        expect(reconciled.outcomes[1].status).toBe("failed");
        expect(reconciled.outcomes[1].error?.code).toBe("batch-interrupted");
        expect(reconciled.outcomes[1].error?.retryable).toBe(true);
        expect(reconciled.lastError?.code).toBe("batch-interrupted");
    });

    test("刷新后：任务已成功的行按任务真实结果回填，不误报中断", () => {
        const rows = [createBatchTaskRow({ prompt: "a" })];
        const batch = {
            ...createBatchTask("PRODUCT_IMAGE_SUITE", rows),
            status: "running" as const,
            startedAt: 100,
            outcomes: [outcome(rows[0].id, { taskId: "task-ok" })],
        };
        const tasks = {
            "task-ok": task({
                id: "task-ok",
                finishedAt: 400,
                result: { items: [{ id: "i1", kind: "image", url: "https://cdn.example/real.png" }], receivedAt: 400 },
            }),
        };

        const reconciled = reconcileInterruptedBatch(batch, tasks, 500);

        expect(reconciled.status).toBe("completed");
        expect(reconciled.outcomes[0].status).toBe("succeeded");
        expect(reconciled.outcomes[0].resultUrls).toEqual(["https://cdn.example/real.png"]);
        expect(reconciled.lastError).toBeNull();
    });

    test("未中断的批次原样返回（不改 draft/completed）", () => {
        const batch = createBatchTask("PRODUCT_IMAGE_SUITE", [createBatchTaskRow()]);
        expect(reconcileInterruptedBatch(batch, {}, 500)).toBe(batch);
    });
});
