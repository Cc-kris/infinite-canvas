import { useEffect, useRef } from "react";

import { getTaskLease, LEASE_TTL_MS } from "@/services/api/tools/task-lease";
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
 *
 * 跨标签（真实缺陷，lf_pose_real_generate 2026-10-29）：另一个标签页正在真实推进
 * 某条任务时，本页 recoverAll 返回的是「只读不改」的结果（其余标签的 in-flight
 * 提交不能被关成 submit-unconfirmed）。这类任务等租约过期左右再查一次，避免
 * 本页永远停在旧状态。
 */
export function useTaskRecovery(): void {
    const started = useRef(false);
    useEffect(() => {
        if (started.current) return;
        started.current = true;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let retried = false;

        const runOnce = async () => {
            const tasks = await hydrateAndRecoverToolTasks();
            const lease = getTaskLease();
            const deferred: string[] = [];
            for (const task of tasks) {
                if (task.status === "running" && task.upstreamTaskId) {
                    if (lease?.isLiveElsewhere(task.id, Date.now())) {
                        deferred.push(task.id);
                        continue;
                    }
                    if (resuming.has(task.id)) continue;
                    resuming.add(task.id);
                    void useToolTaskStore
                        .getState()
                        .resumeTask(task.id)
                        .catch(() => {
                            // 网络抖动由 waitForResult 内部退避处理；这里只兜底不抛。
                        })
                        .finally(() => resuming.delete(task.id));
                    continue;
                }
                // 未到终态但被别的标签持有：本页不改，稍后再查一次。
                if (lease?.isLiveElsewhere(task.id, Date.now())) deferred.push(task.id);
            }
            if (deferred.length > 0 && !retried) {
                retried = true;
                retryTimer = setTimeout(() => {
                    retryTimer = null;
                    void useToolTaskStore
                        .getState()
                        .recoverAll()
                        .then((refreshed) => {
                            for (const task of refreshed) {
                                if (task.status !== "running" || !task.upstreamTaskId) continue;
                                if (lease?.isLiveElsewhere(task.id, Date.now())) continue;
                                if (resuming.has(task.id)) continue;
                                resuming.add(task.id);
                                void useToolTaskStore
                                    .getState()
                                    .resumeTask(task.id)
                                    .finally(() => resuming.delete(task.id));
                            }
                        })
                        .catch(() => {
                            // 同样只兜底：下一次挂载会再试。
                        });
                }, LEASE_TTL_MS + 5000);
            }
        };

        void runOnce().catch(() => {
            // 恢复失败不影响页面可用：任务仍在本地，下一次挂载会再试。
        });

        return () => {
            if (retryTimer) clearTimeout(retryTimer);
        };
    }, []);
}
