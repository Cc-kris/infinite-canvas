import type { ToolTask } from "@/services/api/tools/task-machine";

/**
 * 结果面板的落库任务选择（多工具共用）。
 *
 * 为什么需要它：PRODUCT_SCENE / HANDHELD_GOODS / PRINT_EXTRACT 的结果区原先只渲染本次会话的
 * 内存态（提交回调里的 `setTask` / `runs` / `tasks`），刷新后即使任务快照已落盘、结果项已由
 * `storageKey` 复原出真实字节，页面上也没有标准结果面板，下载 / 存资产 / 发画布三个入口随之消失。
 *
 * 本函数**只做选择与视图聚合**：返回的任务就是落盘快照里的那个对象，items 原样引用，
 * 不新建任务、不伪造字节、不改写状态；没有任何任务时返回 null。
 */

const RUNNING_STATUSES: ReadonlySet<ToolTask["status"]> = new Set<ToolTask["status"]>([
    "draft",
    "validating",
    "submitting",
    "running",
]);

export type ResultPanelPickOptions = {
    /** 只在本工具的任务里选（同一页面可能挂多个工具）。 */
    toolId: string;
    /**
     * 没有可交付结果项时，是否仍把最近一次任务挂到面板上。
     * 打开时可让「失败 / 运行中」的真实状态在刷新后仍可见（避免面板静默消失），
     * 但绝不因此显示成功态或占位图。
     */
    includeLatestWithoutItems?: boolean;
};

function hasDeliverableItem(task: ToolTask): boolean {
    return (task.result?.items ?? []).some((item) =>
        Boolean(item.storageKey || item.dataUrl || item.url || item.blob),
    );
}

/** 按创建时间升序排好的本工具任务。 */
export function scopedToolTasks(tasks: readonly ToolTask[], toolId: string): ToolTask[] {
    return tasks.filter((task) => task.toolId === toolId).sort((a, b) => a.createdAt - b.createdAt);
}

export function pickResultPanelTask(tasks: readonly ToolTask[], options: ResultPanelPickOptions): ToolTask | null {
    const scoped = scopedToolTasks(tasks, options.toolId);
    if (scoped.length === 0) return null;

    const latest = scoped[scoped.length - 1];
    // 最新一次还在跑 → 面板跟最新，避免旧成功结果盖住「正在生成」。
    if (RUNNING_STATUSES.has(latest.status)) return latest;

    for (let index = scoped.length - 1; index >= 0; index -= 1) {
        if (hasDeliverableItem(scoped[index])) return scoped[index];
    }

    return options.includeLatestWithoutItems ? latest : null;
}
