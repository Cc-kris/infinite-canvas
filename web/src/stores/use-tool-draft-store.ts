/**
 * 工具草稿：单标签页内即时更新 + 500ms 防抖落盘；多标签页用 BroadcastChannel 广播 + revision CAS 检测冲突。
 *
 * 落盘键：`tool-draft:v1:<toolId>`（与 technical_design §6 一致）。
 * 版本不符（draftVersion !== 1）不迁移，直接搬到 `tool-draft:v1:quarantine:<toolId>` 隔离并提示，避免旧结构污染新表单。
 * 冲突语义：写盘前先读当前落盘 revision；若大于本页 revision，说明其他标签页已写入更新的草稿，
 * 本页不覆盖，暴露 conflict 交由用户选择。CAS 是“读-比-写”，非原子事务，真正的原子化留给后续 IndexedDB 事务层。
 */
import { create } from "zustand";

import { localForageStorage } from "@/lib/localforage-storage";

export const TOOL_DRAFT_VERSION = 1 as const;
export const TOOL_DRAFT_DEBOUNCE_MS = 500;
export const TOOL_DRAFT_CHANNEL_NAME = "infinite-canvas:tool-drafts";

export type ToolDraft = {
    draftVersion: typeof TOOL_DRAFT_VERSION;
    toolId: string;
    values: Record<string, unknown>;
    assetIds: string[];
    updatedAt: string;
    revision: number;
};

export type ToolDraftPatch = { values?: Record<string, unknown>; assetIds?: string[] };
export type ToolDraftConflict = { toolId: string; local: ToolDraft; remote: ToolDraft; at: string };
export type ToolDraftQuarantine = { toolId: string; reason: "version-mismatch" | "invalid"; raw: string; at: string };

export type ToolDraftStorage = {
    getItem: (key: string) => string | null | Promise<string | null>;
    setItem: (key: string, value: string) => unknown;
    removeItem?: (key: string) => unknown;
};

export const toolDraftKey = (toolId: string) => `tool-draft:v1:${toolId}`;
export const toolDraftQuarantineKey = (toolId: string) => `tool-draft:v1:quarantine:${toolId}`;

const nowIso = () => new Date().toISOString();

export function createToolDraft(toolId: string, values: Record<string, unknown> = {}, assetIds: string[] = [], now: () => string = nowIso): ToolDraft {
    return { draftVersion: TOOL_DRAFT_VERSION, toolId, values, assetIds: [...assetIds], updatedAt: now(), revision: 1 };
}

export function applyToolDraftPatch(draft: ToolDraft, patch: ToolDraftPatch, now: () => string = nowIso): ToolDraft {
    return {
        ...draft,
        values: patch.values ? { ...draft.values, ...patch.values } : draft.values,
        assetIds: patch.assetIds ? [...patch.assetIds] : draft.assetIds,
        updatedAt: now(),
        revision: draft.revision + 1,
    };
}

export function isToolDraft(value: unknown, toolId?: string): value is ToolDraft {
    if (!value || typeof value !== "object") return false;
    const draft = value as Partial<ToolDraft>;
    if (draft.draftVersion !== TOOL_DRAFT_VERSION) return false;
    if (typeof draft.toolId !== "string" || (toolId !== undefined && draft.toolId !== toolId)) return false;
    if (!draft.values || typeof draft.values !== "object" || Array.isArray(draft.values)) return false;
    if (!Array.isArray(draft.assetIds) || draft.assetIds.some((id) => typeof id !== "string")) return false;
    if (typeof draft.revision !== "number" || !Number.isFinite(draft.revision) || draft.revision < 1) return false;
    return typeof draft.updatedAt === "string";
}

export type ParsedToolDraft = { status: "empty" | "ok" | "invalid" | "version-mismatch"; draft?: ToolDraft; raw?: string };

export function parseToolDraft(raw: string | null | undefined, toolId: string): ParsedToolDraft {
    if (raw === null || raw === undefined || raw === "") return { status: "empty" };
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { status: "invalid", raw };
    }
    if (parsed && typeof parsed === "object" && (parsed as { draftVersion?: unknown }).draftVersion !== TOOL_DRAFT_VERSION) {
        return { status: "version-mismatch", raw };
    }
    if (!isToolDraft(parsed, toolId)) return { status: "invalid", raw };
    return { status: "ok", draft: parsed, raw };
}

/** 读草稿：版本不符/损坏则原样搬到隔离键，返回 quarantine 供 UI 提示。 */
export async function loadToolDraft(toolId: string, storage: ToolDraftStorage = localForageStorage, now: () => string = nowIso): Promise<{ draft?: ToolDraft; quarantine?: ToolDraftQuarantine }> {
    const raw = await storage.getItem(toolDraftKey(toolId));
    const parsed = parseToolDraft(raw, toolId);
    if (parsed.status === "ok") return { draft: parsed.draft };
    if (parsed.status === "empty") return {};
    if (parsed.raw !== undefined) await storage.setItem(toolDraftQuarantineKey(toolId), parsed.raw);
    await storage.removeItem?.(toolDraftKey(toolId));
    return { quarantine: { toolId, reason: parsed.status === "version-mismatch" ? "version-mismatch" : "invalid", raw: parsed.raw ?? "", at: now() } };
}

export type ToolDraftPersistResult = { status: "written"; draft: ToolDraft } | { status: "conflict"; remote: ToolDraft };

/** 写盘 CAS：落盘 revision 不小于本页且内容不同则判冲突；内容完全一致视为已写入（幂等）。 */
export async function persistToolDraft(toolId: string, draft: ToolDraft, storage: ToolDraftStorage = localForageStorage): Promise<ToolDraftPersistResult> {
    const current = parseToolDraft(await storage.getItem(toolDraftKey(toolId)), toolId);
    if (current.status === "ok" && current.draft) {
        const remote = current.draft;
        const sameContent = remote.revision === draft.revision && JSON.stringify([remote.values, remote.assetIds]) === JSON.stringify([draft.values, draft.assetIds]);
        if (sameContent) return { status: "written", draft: remote };
        if (remote.revision >= draft.revision) return { status: "conflict", remote };
    }
    await storage.setItem(toolDraftKey(toolId), JSON.stringify(draft));
    return { status: "written", draft };
}

export type RemoteDraftDecision = "adopt" | "conflict" | "ignore";

/** 收到其他标签页广播后的处理：本页有未落盘修改且远端更新 → 冲突；否则采纳。 */
export function decideRemoteDraft(local: ToolDraft | undefined, remote: ToolDraft, localDirty: boolean): RemoteDraftDecision {
    if (!isToolDraft(remote)) return "ignore";
    if (remote.toolId !== (local?.toolId ?? remote.toolId)) return "ignore";
    if (!local) return "adopt";
    if (remote.revision <= local.revision) return "ignore";
    return localDirty ? "conflict" : "adopt";
}

/* ------------------------------------------------------------------ *
 * Zustand store
 * ------------------------------------------------------------------ */

type ToolDraftState = {
    drafts: Record<string, ToolDraft>;
    dirty: Record<string, boolean>;
    hydrated: Record<string, boolean>;
    conflicts: Record<string, ToolDraftConflict>;
    quarantined: Record<string, ToolDraftQuarantine>;
    hydrate: (toolId: string) => Promise<ToolDraft | undefined>;
    patch: (toolId: string, patch: ToolDraftPatch) => void;
    flush: (toolId: string) => Promise<ToolDraftPersistResult | undefined>;
    acceptRemote: (toolId: string, remote: ToolDraft) => void;
    resolveConflict: (toolId: string, choice: "local" | "remote") => Promise<void>;
    reset: (toolId: string) => Promise<void>;
};

const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const flushedRevisions = new Map<string, number>();

type DraftChannel = { postMessage: (message: unknown) => void; close: () => void };
let channel: DraftChannel | null = null;

function getChannel(): DraftChannel | null {
    if (channel) return channel;
    if (typeof BroadcastChannel === "undefined") return null;
    const instance = new BroadcastChannel(TOOL_DRAFT_CHANNEL_NAME);
    channel = {
        postMessage: (message) => instance.postMessage(message),
        close: () => instance.close(),
    };
    instance.onmessage = (event: MessageEvent) => {
        const payload = event.data as { type?: string; draft?: ToolDraft } | null;
        if (!payload || payload.type !== "draft-written" || !isToolDraft(payload.draft)) return;
        const remote = payload.draft;
        const state = useToolDraftStore.getState();
        const decision = decideRemoteDraft(state.drafts[remote.toolId], remote, Boolean(state.dirty[remote.toolId]));
        if (decision === "adopt") state.acceptRemote(remote.toolId, remote);
        if (decision === "conflict") {
            useToolDraftStore.setState((previous) => ({
                conflicts: { ...previous.conflicts, [remote.toolId]: { toolId: remote.toolId, local: previous.drafts[remote.toolId] ?? remote, remote, at: nowIso() } },
            }));
        }
    };
    return channel;
}

function scheduleFlush(toolId: string) {
    const existing = flushTimers.get(toolId);
    if (existing) clearTimeout(existing);
    flushTimers.set(
        toolId,
        setTimeout(() => {
            flushTimers.delete(toolId);
            void useToolDraftStore.getState().flush(toolId);
        }, TOOL_DRAFT_DEBOUNCE_MS),
    );
}

export const useToolDraftStore = create<ToolDraftState>((set, get) => ({
    drafts: {},
    dirty: {},
    hydrated: {},
    conflicts: {},
    quarantined: {},

    hydrate: async (toolId) => {
        if (get().hydrated[toolId]) return get().drafts[toolId];
        const { draft, quarantine } = await loadToolDraft(toolId);
        set((state) => ({
            hydrated: { ...state.hydrated, [toolId]: true },
            drafts: draft ? { ...state.drafts, [toolId]: draft } : state.drafts,
            quarantined: quarantine ? { ...state.quarantined, [toolId]: quarantine } : state.quarantined,
        }));
        return draft ?? get().drafts[toolId];
    },

    patch: (toolId, patch) => {
        const current = get().drafts[toolId] ?? createToolDraft(toolId);
        const next = applyToolDraftPatch(current, patch);
        set((state) => ({ drafts: { ...state.drafts, [toolId]: next }, dirty: { ...state.dirty, [toolId]: true } }));
        scheduleFlush(toolId);
    },

    flush: async (toolId) => {
        const draft = get().drafts[toolId];
        if (!draft) return undefined;
        if (flushedRevisions.get(toolId) === draft.revision) return { status: "written", draft };
        const result = await persistToolDraft(toolId, draft);
        if (result.status === "conflict") {
            set((state) => ({ conflicts: { ...state.conflicts, [toolId]: { toolId, local: draft, remote: result.remote, at: nowIso() } } }));
            return result;
        }
        flushedRevisions.set(toolId, draft.revision);
        set((state) => ({ dirty: { ...state.dirty, [toolId]: false } }));
        getChannel()?.postMessage({ type: "draft-written", draft });
        return result;
    },

    acceptRemote: (toolId, remote) => {
        flushedRevisions.set(toolId, remote.revision);
        set((state) => {
            const conflicts = { ...state.conflicts };
            delete conflicts[toolId];
            return { drafts: { ...state.drafts, [toolId]: remote }, dirty: { ...state.dirty, [toolId]: false }, conflicts };
        });
    },

    resolveConflict: async (toolId, choice) => {
        const conflict = get().conflicts[toolId];
        if (!conflict) return;
        if (choice === "remote") {
            get().acceptRemote(toolId, conflict.remote);
            return;
        }
        const merged: ToolDraft = { ...conflict.local, revision: conflict.remote.revision + 1, updatedAt: nowIso() };
        set((state) => ({
            drafts: { ...state.drafts, [toolId]: merged },
            dirty: { ...state.dirty, [toolId]: true },
            conflicts: Object.fromEntries(Object.entries(state.conflicts).filter(([key]) => key !== toolId)),
        }));
        const result = await persistToolDraft(toolId, merged);
        if (result.status === "written") {
            flushedRevisions.set(toolId, merged.revision);
            set((state) => ({ dirty: { ...state.dirty, [toolId]: false } }));
            getChannel()?.postMessage({ type: "draft-written", draft: merged });
        }
    },

    reset: async (toolId) => {
        const timer = flushTimers.get(toolId);
        if (timer) clearTimeout(timer);
        flushTimers.delete(toolId);
        flushedRevisions.delete(toolId);
        set((state) => {
            const drafts = { ...state.drafts };
            const conflicts = { ...state.conflicts };
            delete drafts[toolId];
            delete conflicts[toolId];
            return { drafts, conflicts, dirty: { ...state.dirty, [toolId]: false } };
        });
        await localForageStorage.removeItem?.(toolDraftKey(toolId));
    },
}));

/** 组件卸载/切工具时把未落盘的草稿立即写入，避免 500ms 窗口内丢数据。 */
export async function flushToolDrafts(toolIds?: string[]) {
    const state = useToolDraftStore.getState();
    const ids = toolIds ?? Object.keys(state.drafts);
    await Promise.all(ids.map((toolId) => state.flush(toolId)));
}
