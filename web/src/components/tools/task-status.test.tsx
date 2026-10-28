import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ToolTaskStatus } from "@/services/api/tools/task-machine";

// 与仓库其他测试一致：动态导入 bun:test，避免 tsc --noEmit 报 TS2307。
const { describe, expect, test } = (await import("bun:test" as string)) as {
    describe: (name: string, fn: () => void) => void;
    expect: (actual: unknown) => {
        toBe: (value: unknown) => void;
        not: { toThrow: () => void };
    };
    test: (name: string, fn: () => void) => void;
};

const { TaskStatusBadge, TASK_STATUS_META, taskStatusMeta } = await import("./task-status");

describe("taskStatusMeta", () => {
    test("合法状态返回自身元信息", () => {
        expect(taskStatusMeta("succeeded")).toBe(TASK_STATUS_META.succeeded);
        expect(taskStatusMeta("failed").tone === "danger").toBe(true);
    });

    test("历史快照里的非法状态兜底到 unknown，不抛错", () => {
        // 真实事故：持久化任务里带着 "success"（并非合法值），TaskStatusBadge 读 undefined.tone 抛错 → 整页白屏
        const legacy = "success" as unknown as ToolTaskStatus;
        expect(() => taskStatusMeta(legacy)).not.toThrow();
        expect(taskStatusMeta(legacy)).toBe(TASK_STATUS_META.unknown);
    });
});

describe("TaskStatusBadge", () => {
    test("非法状态也能渲染（回归：图标缺失曾导致整页白屏）", () => {
        const legacy = "success" as unknown as ToolTaskStatus;
        const html = renderToStaticMarkup(<TaskStatusBadge status={legacy} /> as ReactElement);
        expect(html.includes(TASK_STATUS_META.unknown.label)).toBe(true);
    });
});
