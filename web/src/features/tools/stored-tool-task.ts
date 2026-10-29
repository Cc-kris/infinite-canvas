import type { ToolTask } from "@/services/api/tools/task-machine";

/**
 * 该工具最近一条落盘任务（刷新/重进页面后回填结果区用）。
 *
 * 事实边界：
 * - 任务与结果字节都在库里（use-tool-task-store + media_files/storageKey），
 *   只是工作台一直用「本会话 state」渲染结果区，刷新后 state 归零 → 结果区空白、
 *   下载/存资产/发画布全部点不到。
 * - 这里只做「取最近一条」，不做补造：任务原样返回（failed 也返回，让结果区
 *   显示真实失败原因），结果项为空时由调用方的 resultView 降级为 failed。
 */
export function latestStoredTask(
    tasks: Record<string, ToolTask> | undefined | null,
    toolId: string,
): ToolTask | null {
    if (!tasks) return null;
    let latest: ToolTask | null = null;
    let latestAt = Number.NEGATIVE_INFINITY;
    for (const task of Object.values(tasks)) {
        if (!task || task.toolId !== toolId) continue;
        const at = task.submittedAt ?? task.createdAt ?? task.updatedAt ?? 0;
        if (at >= latestAt) {
            latest = task;
            latestAt = at;
        }
    }
    return latest;
}
