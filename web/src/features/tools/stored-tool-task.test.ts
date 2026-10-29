import { describe, expect, test } from "bun:test";

import type { ToolTask } from "@/services/api/tools/task-machine";

import { latestStoredTask } from "./stored-tool-task";

function task(overrides: Partial<ToolTask> & { id: string; toolId: string }): ToolTask {
    return {
        status: "succeeded",
        capability: "video",
        createdAt: 0,
        updatedAt: 0,
        ...overrides,
    } as unknown as ToolTask;
}

describe("latestStoredTask（刷新后结果回填的数据源）", () => {
    test("只取本工具最近一条，别的工具不参与", () => {
        const tasks = {
            a: task({ id: "task-a", toolId: "AI_VIDEO_EDITING", submittedAt: 10 }),
            b: task({ id: "task-b", toolId: "AI_VIDEO_EDITING", submittedAt: 30 }),
            c: task({ id: "task-c", toolId: "VIDEO_REPLICATION", submittedAt: 99 }),
        };
        expect(latestStoredTask(tasks, "AI_VIDEO_EDITING")?.id).toBe("task-b");
        expect(latestStoredTask(tasks, "VIDEO_TRANSLATION")).toBeNull();
        expect(latestStoredTask(undefined, "AI_VIDEO_EDITING")).toBeNull();
    });

    test("失败任务也返回（结果区显示真实失败原因，不伪造成功）", () => {
        const failed = task({
            id: "task-failed",
            toolId: "IMAGE_TO_VIDEO",
            status: "failed",
            submittedAt: 5,
            error: { code: "provider-rejected", message: "upstream 500" },
        } as never);
        const latest = latestStoredTask({ f: failed }, "IMAGE_TO_VIDEO");
        expect(latest?.id).toBe("task-failed");
        expect(latest?.status).toBe("failed");
        expect(latest?.error?.message).toBe("upstream 500");
    });

    test("缺 submittedAt 时按 createdAt 排序，不会误取更早的任务", () => {
        const older = task({ id: "old", toolId: "VIDEO_TRANSLATION", createdAt: 100, updatedAt: 900 });
        const newer = task({ id: "new", toolId: "VIDEO_TRANSLATION", createdAt: 200, updatedAt: 300 });
        expect(latestStoredTask({ older, newer }, "VIDEO_TRANSLATION")?.id).toBe("new");
    });
});
