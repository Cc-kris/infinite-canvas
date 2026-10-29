import { useMemo } from "react";

import type { ToolTask } from "@/services/api/tools/task-machine";
import { useToolTaskStore } from "@/stores/use-tool-task-store";

/**
 * 刷新后回放：任务 store 水合完成后，把本工具最近一次「成功」任务回放到结果区。
 *
 * 边界（与图片裁剪 crop.tsx 一致）：
 * - 只回放真实持久化任务（store.tasks），不做任何快照注入；
 * - 当前会话已有任务时以当前任务为准，不清空用户的实时状态；
 * - 只取 succeeded，避免把上次失败/取消的旧态当成结果展示。
 */
export function useRestoredTask(toolId: string, current: ToolTask | undefined): ToolTask | undefined {
    const storedTasks = useToolTaskStore((store) => store.tasks);
    return useMemo(() => {
        if (current) return current;
        const own = Object.values(storedTasks)
            .filter((item) => item.toolId === toolId)
            .sort((a, b) => b.updatedAt - a.updatedAt);
        return own.find((item) => item.status === "succeeded");
    }, [current, storedTasks, toolId]);
}
