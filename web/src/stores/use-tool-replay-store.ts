/**
 * 历史任务「回放」信箱（跨组件，不落盘）。
 *
 * 历史坞只能读到任务快照，真正把画布/表单还原回工作台的是工作台组件本身。两者之间
 * 不直接互引（dock 是通用组件，不能 import 每个工具），用一个极小的内存信箱解耦：
 *
 *   历史坞 ── requestReplay(toolId, taskId, snapshot) ──▶ store
 *   工作台 ── useEffect 订阅 pending[toolId] ── 还原后 consumeReplay(toolId)
 *
 * 只允许投递**真实落盘任务自带的 inputSnapshot**，不接受手写/伪造快照（禁止注入历史）。
 */
import { create } from "zustand";

export type ToolReplayRequest = {
    toolId: string;
    taskId: string;
    snapshot: Record<string, unknown>;
    requestedAt: number;
};

type ToolReplayState = {
    pending: Record<string, ToolReplayRequest | undefined>;
    requestReplay: (request: Omit<ToolReplayRequest, "requestedAt"> & { requestedAt?: number }) => void;
    /** 取走并清除（工作台消费一次即失效，避免重复覆盖用户后来的编辑）。 */
    consumeReplay: (toolId: string) => ToolReplayRequest | null;
    clearReplay: (toolId: string) => void;
};

export const useToolReplayStore = create<ToolReplayState>((set, get) => ({
    pending: {},

    requestReplay: ({ toolId, taskId, snapshot, requestedAt }) => {
        if (!toolId || !taskId || !snapshot) return;
        set((state) => ({
            pending: { ...state.pending, [toolId]: { toolId, taskId, snapshot, requestedAt: requestedAt ?? Date.now() } },
        }));
    },

    consumeReplay: (toolId) => {
        const current = get().pending[toolId];
        if (!current) return null;
        set((state) => {
            const next = { ...state.pending };
            delete next[toolId];
            return { pending: next };
        });
        return current;
    },

    clearReplay: (toolId) => {
        set((state) => {
            const next = { ...state.pending };
            delete next[toolId];
            return { pending: next };
        });
    },
}));
