import { useEffect, useRef } from "react";

import { hydrateAndRecoverToolTasks, useToolTaskStore } from "@/stores/use-tool-task-store";

/** 同一任务只接力一份等待，避免多个工具页同时挂载时重复轮询。 */
const resuming = new Set<string>();

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
 *
 * 补强（真实缺陷）：`recoverAll` 只向上游探测一次，任务若仍在跑就停在 running，
 * 页面开着也不会再推进——「刷新后丢轮询」。所以对探测后仍在 running 且有
 * upstreamTaskId 的任务再挂一个 waitForResult 接力等待，直到终态。
 */
export function useTaskRecovery(): void {
    const started = useRef(false);
    useEffect(() => {
        if (started.current) return;
        started.current = true;
        void hydrateAndRecoverToolTasks()
            .then((tasks) => {
                for (const task of tasks) {
                    if (task.status !== "running" || !task.upstreamTaskId) continue;
                    if (resuming.has(task.id)) continue;
                    resuming.add(task.id);
                    void useToolTaskStore
                        .getState()
                        .resumeTask(task.id)
                        .catch(() => {
                            // 网络抖动由 waitForResult 内部退避处理；这里只兜底不抛。
                        })
                        .finally(() => resuming.delete(task.id));
                }
            })
            .catch(() => {
                // 恢复失败不影响页面可用：任务仍在本地，下一次挂载会再试。
            });
    }, []);
}
