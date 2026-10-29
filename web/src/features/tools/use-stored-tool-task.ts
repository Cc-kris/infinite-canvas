import { useEffect } from "react";

import { useToolTaskStore } from "@/stores/use-tool-task-store";

import { latestStoredTask } from "./stored-tool-task";

/**
 * 落盘任务回填：页面挂载时 hydrate 任务库，并返回该工具最近一条落盘任务。
 *
 * 用法（工作台）：
 * ```ts
 * const storedTask = useStoredToolTask(TOOL_ID);
 * useEffect(() => {
 *     if (!task && storedTask) setTask(storedTask);
 * }, [storedTask, task]);
 * ```
 * 只在本会话还没有任务时回填，不覆盖用户刚提交的结果。
 */
export function useStoredToolTask(toolId: string) {
    const tasks = useToolTaskStore((state) => state.tasks);
    const hydrated = useToolTaskStore((state) => state.hydrated);
    const hydrate = useToolTaskStore((state) => state.hydrate);

    useEffect(() => {
        if (!hydrated) hydrate();
    }, [hydrated, hydrate]);

    // 直接按 store 派生：hydrate 之后 store 还会用 storageKey 重建对象 URL（对象 URL 不过夜），
    // 派生而不是拷贝一次，才能拿到重建后的可播放地址。
    return latestStoredTask(tasks, toolId);
}
