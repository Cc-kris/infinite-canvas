import { describe, expect, test } from "bun:test";
import { create } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";

import { loadResultCanvasDeps, waitForCanvasHydration, type ResultCanvasModules } from "./tool-result-actions";

/* 回归：画布 store 是 zustand persist + IndexedDB 异步水合。
 * 真实缺陷（B4 验收撞到）：发画布在建 project 之后 1s 左右，projects 变回 []，
 * 因为水合完成时用持久化快照整体覆盖了 state，刚 createProject 的项目被静默丢掉。
 * 这里用一个「延迟返回快照」的 storage 精确复现该时序，锁住 loadResultCanvasDeps 必须等水合。 */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type FakeProject = { id: string; title: string; nodes: unknown[]; connections: unknown[] };

function makeStorage(snapshot: FakeProject[] | null, delayMs: number): PersistStorage<FakeCanvasState> {
    return {
        getItem: async () => {
            await sleep(delayMs);
            if (!snapshot) return null;
            return { state: { projects: snapshot, deletedProjects: [] }, version: 0 } as never;
        },
        setItem: async () => {},
        removeItem: async () => {},
    };
}

type FakeCanvasState = {
    projects: FakeProject[];
    deletedProjects: unknown[];
    createProject: (title?: string) => string;
};

function makeCanvasStore(snapshot: FakeProject[] | null, delayMs: number) {
    let seq = 0;
    const store = create<FakeCanvasState>()(
        persist(
            (set, get) => ({
                projects: [],
                deletedProjects: [],
                createProject: (title = "未命名画布") => {
                    const id = `new-${++seq}`;
                    const project: FakeProject = { id, title, nodes: [], connections: [] };
                    set({ projects: [project, ...get().projects] });
                    return id;
                },
            }),
            { name: "fake-canvas-store", storage: makeStorage(snapshot, delayMs) },
        ),
    );
    // 只用到 useCanvasStore 上的 getState/persist/subscribe，够 loadResultCanvasDeps 装配用。
    return { store, canvasStore: { useCanvasStore: store } as unknown as ResultCanvasModules["canvasStore"] };
}

function makeModules(canvasStore: ResultCanvasModules["canvasStore"]) {
    const stub = {} as never;
    return {
        canvasStore,
        factory: stub,
        imageStorage: stub,
        videoApi: stub,
    } as unknown as ResultCanvasModules;
}

const persisted: FakeProject[] = [{ id: "saved-1", title: "已有画布", nodes: [], connections: [] }];

describe("发画布：水合完成前 createProject 不被覆盖", () => {
    test("对照组：不等水合就建项目，会被持久化快照覆盖（缺陷可复现）", async () => {
        const { store } = makeCanvasStore(persisted, 80);
        expect(store.persist.hasHydrated()).toBe(false);

        const id = store.getState().createProject("抢跑建的项目");
        expect(store.getState().projects.some((p) => p.id === id)).toBe(true);

        await sleep(200);

        expect(store.persist.hasHydrated()).toBe(true);
        // 水合把持久化快照整体盖回来：抢跑建的项目消失。
        expect(store.getState().projects.map((p) => p.id)).toEqual(["saved-1"]);
    });

    test("loadResultCanvasDeps 返回即可安全建项目，水合不会吞掉它", async () => {
        const { store, canvasStore } = makeCanvasStore(persisted, 80);

        const deps = await loadResultCanvasDeps(async () => makeModules(canvasStore));

        // 装配返回时水合必须已经完成。
        expect(store.persist.hasHydrated()).toBe(true);
        expect(store.getState().projects.map((p) => p.id)).toEqual(["saved-1"]);

        const id = deps.createProject!("发画布建的项目");
        // 越过原本会被覆盖的时间窗（storage 延迟 80ms）再检查。
        await sleep(200);

        const ids = store.getState().projects.map((p) => p.id);
        expect(ids).toContain(id);
        expect(ids).toContain("saved-1");
    });

    test("已水合时 waitForCanvasHydration 立即返回，不会挂住", async () => {
        const { canvasStore } = makeCanvasStore(persisted, 30);
        await waitForCanvasHydration(canvasStore);
        await waitForCanvasHydration(canvasStore);
        expect(true).toBe(true);
    });

    test("水合未完成时 waitForCanvasHydration 会等到 onFinishHydration", async () => {
        const { store, canvasStore } = makeCanvasStore(persisted, 60);
        expect(store.persist.hasHydrated()).toBe(false);

        await waitForCanvasHydration(canvasStore);

        expect(store.persist.hasHydrated()).toBe(true);
        expect(store.getState().projects.map((p) => p.id)).toEqual(["saved-1"]);
    });

    test("替身 store 没挂 persist 时直接返回，不抛 TypeError", async () => {
        // 纯对象替身（deps 单测/降级路径都长这样）：没有 persist 中间件。
        const plainStore = { useCanvasStore: { getState: () => ({ projects: [] }) } } as unknown as ResultCanvasModules["canvasStore"];

        await waitForCanvasHydration(plainStore);

        const deps = await loadResultCanvasDeps(async () => makeModules(plainStore));
        expect(typeof deps.createProject).toBe("function");
    });

    test("事件竞态：注册监听前刚好水合完成（onFinishHydration 永不再触发）也能返回", async () => {
        // 真实竞态：hasHydrated() 读到 false，随后水合在同一 tick 内完成，
        // 监听注册晚了一步 → onFinishHydration 不会再回调，必须靠注册后的二次判定兜底。
        let hydrated = false;
        const listeners: Array<() => void> = [];
        const fakeBare = {
            useCanvasStore: {
                getState: () => ({ projects: [], createProject: () => "p" }),
                persist: {
                    hasHydrated: () => hydrated,
                    onFinishHydration: (fn: () => void) => {
                        listeners.push(fn);
                        // 注册的这一刻水合刚好完成，且不再派发事件
                        hydrated = true;
                        return () => {};
                    },
                },
            },
        } as unknown as ResultCanvasModules["canvasStore"];

        const firstRead = fakeBare.useCanvasStore.persist!.hasHydrated();
        expect(firstRead).toBe(false);

        await waitForCanvasHydration(fakeBare);

        expect(listeners).toHaveLength(1);
        expect(hydrated).toBe(true);
    });
});
