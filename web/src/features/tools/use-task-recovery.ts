import { useEffect, useRef } from "react";

import { hydrateAndRecoverToolTasks } from "@/stores/use-tool-task-store";

/**
 * 工具页挂载时恢复落盘任务。
 *
 * 背景（真实缺陷）：任务快照写进 localStorage，但 `hydrateAndRecoverToolTasks`
 * 一直没有调用方 → 刷新后「提交中」「结果未知」的任务只会被原样读回来，
 * 没有任何代码去查询上游或收敛终态，历史记录永远停在那两个状态。
 *
 * 这里挂一次：hydrate 落盘快照 → 对未完结任务做一次查询式恢复
 * （有 upstreamTaskId 的去轮询；没有的反查不了，收敛成终态 failed + 提示先确认）。
 * 恢复不会自动重提交（见 task-machine.canAutoResubmit）。
 */
export function useTaskRecovery(): void {
    const started = useRef(false);
    useEffect(() => {
        if (started.current) return;
        started.current = true;
        void hydrateAndRecoverToolTasks().catch(() => {
            // 恢复失败不影响页面可用：任务仍在本地，下一次挂载会再试。
        });
    }, []);
}
