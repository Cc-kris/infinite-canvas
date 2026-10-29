import { describe, expect, test } from "bun:test";

import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";

import { pickResultPanelTask } from "./result-panel";

function task(overrides: Partial<ToolTask> & { id: string; status: ToolTask["status"] }): ToolTask {
    return {
        toolId: "HANDHELD_GOODS",
        clientOperationId: `op-${overrides.id}`,
        fingerprint: `fp-${overrides.id}`,
        capability: "image",
        prompt: "",
        configSnapshot: {} as ToolTask["configSnapshot"],
        createdAt: 1,
        updatedAt: 1,
        ...overrides,
    } as ToolTask;
}

const item = (id: string): ToolTaskResultItem => ({
    id,
    kind: "image",
    storageKey: `tool-result:${id}`,
    bytes: 1024,
    mimeType: "image/png",
});

describe("结果面板任务选择（只选择，不造数）", () => {
    test("没有任务时返回 null，绝不补造", () => {
        expect(pickResultPanelTask([], { toolId: "HANDHELD_GOODS" })).toBeNull();
    });

    test("只认本工具的任务，别的工具一律忽略", () => {
        const other = task({ id: "a", status: "succeeded", toolId: "PRINT_EXTRACT", result: { items: [item("x")], receivedAt: 1 } });
        expect(pickResultPanelTask([other], { toolId: "HANDHELD_GOODS" })).toBeNull();
    });

    test("多条落库任务时取最近一条带真实结果项的，且原样引用该任务对象", () => {
        const older = task({
            id: "older",
            status: "succeeded",
            createdAt: 10,
            result: { items: [item("o1")], receivedAt: 10 },
        });
        const newerFailed = task({ id: "newer-failed", status: "failed", createdAt: 20 });
        const picked = pickResultPanelTask([older, newerFailed], { toolId: "HANDHELD_GOODS" });
        expect(picked?.id).toBe("older");
        expect(picked).toBe(older);
        expect(picked?.result?.items[0].storageKey).toBe("tool-result:o1");
    });

    test("最新一条仍在跑时优先展示它，避免旧结果盖住进行中的任务", () => {
        const done = task({ id: "done", status: "succeeded", createdAt: 10, result: { items: [item("d1")], receivedAt: 10 } });
        const running = task({ id: "running", status: "running", createdAt: 20 });
        expect(pickResultPanelTask([done, running], { toolId: "HANDHELD_GOODS" })?.id).toBe("running");
    });

    test("includeLatestWithoutItems=true 时失败任务也挂面板，false 时不挂", () => {
        const failed = task({ id: "failed", status: "failed", createdAt: 5 });
        expect(pickResultPanelTask([failed], { toolId: "HANDHELD_GOODS", includeLatestWithoutItems: true })?.id).toBe("failed");
        expect(pickResultPanelTask([failed], { toolId: "HANDHELD_GOODS" })).toBeNull();
    });

    test("payloadDropped 且无 storageKey/url 的条目不算可交付", () => {
        const dropped = task({
            id: "dropped",
            status: "succeeded",
            createdAt: 10,
            result: { items: [{ id: "p", kind: "image", payloadDropped: true }], receivedAt: 10 },
        });
        expect(pickResultPanelTask([dropped], { toolId: "HANDHELD_GOODS" })).toBeNull();
    });
});
