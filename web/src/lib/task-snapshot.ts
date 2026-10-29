import type { ToolTask } from "@/services/api/tools/task-machine";

/**
 * 结果项「可复原程度」：storageKey 表示字节已落 IndexedDB（刷新后仍能读），
 * 远程 http(s) url 次之，内存 blob/dataUrl 只在当前会话有效。
 */
function payloadScore(task: ToolTask | null | undefined): number {
    return (task?.result?.items ?? []).reduce((sum, item) => {
        if (item.storageKey) return sum + 3;
        if (item.url && /^https?:\/\//i.test(item.url)) return sum + 2;
        if (item.url || item.dataUrl || item.blob) return sum + 1;
        return sum;
    }, 0);
}

/**
 * 共享结果区取「更完整」的那份任务快照。
 *
 * 事实边界：工作台把任务存在本地 state 里（提交/轮询/单张重试都写它），而任务库在 hydrate 后
 * 会异步把 `storageKey` 还原成新的对象 URL（`restoreResultMediaUrls`）。本地 state 是 hydrate
 * 完成前拷的一份，之后就再也没被更新 —— 刷新后结果卡看到的是「没有 url」的旧副本，
 * 于是明明字节在库也判成「上游未返回该结果的文件」、下载/存资产/发画布全灰。
 *
 * 这里只做选择，不构造任何数据：同一任务优先取 updatedAt 更新的那份；
 * 时间戳相同（自愈不改 updatedAt）时取结果载荷更完整的那份。
 */
export function pickRicherTaskSnapshot(
    local: ToolTask | null | undefined,
    live: ToolTask | null | undefined,
): ToolTask | null {
    if (!local) return live ?? null;
    if (!live || live.id !== local.id) return local;
    const localAt = local.updatedAt ?? 0;
    const liveAt = live.updatedAt ?? 0;
    if (liveAt !== localAt) return liveAt > localAt ? live : local;
    return payloadScore(live) > payloadScore(local) ? live : local;
}
