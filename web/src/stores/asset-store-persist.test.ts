import { describe, expect, test } from "bun:test";

import {
    ASSET_TOMBSTONE_TTL_MS,
    createMergedAssetStorage,
    mergeAssetSnapshots,
    tombstonesAfterReplace,
    type AssetLike,
    type AssetPersistSnapshot,
    type AssetPersistValue,
} from "./asset-store-persist";

type A = AssetLike & { title: string };

const asset = (id: string, title: string, updatedAt: string): A => ({ id, title, updatedAt, createdAt: "2026-01-01T00:00:00.000Z" });
const snap = (assets: A[], assetTombstones?: Record<string, string>): AssetPersistSnapshot<A> => ({ assets, assetTombstones });

describe("mergeAssetSnapshots", () => {
    test("保留只存在于存储快照里的资产（修掉 last-write-wins）", () => {
        const latest = snap([asset("a", "A", "2026-10-30T01:00:00.000Z")]);
        const incoming = snap([asset("b", "B", "2026-10-30T02:00:00.000Z")]);

        const { snapshot, changed } = mergeAssetSnapshots(latest, incoming);

        expect(snapshot.assets.map((item) => item.id)).toEqual(["a", "b"]);
        expect(changed).toBe(true);
    });

    test("同一 id 时 updatedAt 更新的胜出", () => {
        const latest = snap([asset("a", "old", "2026-10-30T01:00:00.000Z")]);
        const incoming = snap([asset("a", "new", "2026-10-30T02:00:00.000Z")]);

        expect(mergeAssetSnapshots(latest, incoming).snapshot.assets[0].title).toBe("new");
        expect(mergeAssetSnapshots(incoming, latest).snapshot.assets[0].title).toBe("new");
    });

    test("时间相同以本次写入为准", () => {
        const latest = snap([asset("a", "stored", "2026-10-30T01:00:00.000Z")]);
        const incoming = snap([asset("a", "mine", "2026-10-30T01:00:00.000Z")]);

        expect(mergeAssetSnapshots(latest, incoming).snapshot.assets[0].title).toBe("mine");
    });

    test("墓碑阻止已删资产被别的标签复活", () => {
        const now = Date.parse("2026-10-30T03:00:00.000Z");
        const latest = snap([], { a: "2026-10-30T02:00:00.000Z" });
        const incoming = snap([asset("a", "A", "2026-10-30T01:00:00.000Z")]);

        const { snapshot } = mergeAssetSnapshots(latest, incoming, now);

        expect(snapshot.assets).toHaveLength(0);
        expect(snapshot.assetTombstones?.a).toBe("2026-10-30T02:00:00.000Z");
    });

    test("删除后重新新增的同 id 资产能盖过旧墓碑", () => {
        const now = Date.parse("2026-10-30T05:00:00.000Z");
        const latest = snap([], { a: "2026-10-30T02:00:00.000Z" });
        const incoming = snap([asset("a", "A", "2026-10-30T04:00:00.000Z")]);

        const { snapshot } = mergeAssetSnapshots(latest, incoming, now);

        expect(snapshot.assets.map((item) => item.id)).toEqual(["a"]);
    });

    test("过期墓碑会被清理", () => {
        const now = Date.parse("2026-10-30T00:00:00.000Z");
        const old = new Date(now - ASSET_TOMBSTONE_TTL_MS - 1000).toISOString();
        const { snapshot } = mergeAssetSnapshots(snap([], { dead: old }), snap([]), now);

        expect(snapshot.assetTombstones).toEqual({});
    });

    test("没有变化时 changed=false（避免无意义广播）", () => {
        const same = snap([asset("a", "A", "2026-10-30T01:00:00.000Z")]);
        expect(mergeAssetSnapshots(same, same).changed).toBe(false);
    });
});

describe("tombstonesAfterReplace", () => {
    test("被移除的 id 生成墓碑，保留的 id 不生成", () => {
        const current = snap([asset("a", "A", "2026-10-30T01:00:00.000Z"), asset("b", "B", "2026-10-30T01:00:00.000Z")]);
        const tombstones = tombstonesAfterReplace(current, [asset("b", "B", "2026-10-30T01:00:00.000Z")], "2026-10-30T02:00:00.000Z");

        expect(tombstones).toEqual({ a: "2026-10-30T02:00:00.000Z" });
    });
});

describe("createMergedAssetStorage", () => {
    const makeMemoryStore = () => {
        const data = new Map<string, AssetPersistValue<A>>();
        const tick = () => new Promise((resolve) => setTimeout(resolve, 1));
        return {
            data,
            read: async (name: string) => (data.has(name) ? structuredClone(data.get(name)!) : null),
            write: async (name: string, value: AssetPersistValue<A>) => {
                await tick();
                data.set(name, structuredClone(value));
            },
            remove: async (name: string) => { data.delete(name); },
        };
    };

    /** 用互斥模拟 navigator.locks（浏览器里真实存在，bun 环境没有）。 */
    const makeLockManager = (): Pick<LockManager, "request"> => {
        const tails = new Map<string, Promise<unknown>>();
        const request = async (name: string, ...rest: unknown[]): Promise<unknown> => {
            const callback = rest[rest.length - 1] as () => Promise<unknown>;
            const previous = tails.get(name) ?? Promise.resolve();
            const run = previous.then(callback, callback);
            tails.set(name, run.catch(() => undefined));
            return run;
        };
        return { request } as unknown as Pick<LockManager, "request">;
    };

    test("两个标签同时保存各自的资产，最终两份都在（Web Locks 互斥路径）", async () => {
        const store = makeMemoryStore();
        const locks = makeLockManager();
        const tabA = createMergedAssetStorage<A>({ read: store.read, write: store.write, remove: store.remove, locks });
        const tabB = createMergedAssetStorage<A>({ read: store.read, write: store.write, remove: store.remove, locks });

        // 模拟：两个标签都读到空快照后各自新增一条，写入时刻几乎重叠
        await Promise.all([
            tabA.setItem("infinite-canvas:asset_store", { state: snap([asset("a", "A", "2026-10-30T01:00:00.000Z")]), version: 0 }),
            tabB.setItem("infinite-canvas:asset_store", { state: snap([asset("b", "B", "2026-10-30T02:00:00.000Z")]), version: 0 }),
        ]);

        const stored = store.data.get("infinite-canvas:asset_store");
        expect(stored?.state.assets.map((item) => item.id).sort()).toEqual(["a", "b"]);
        tabA.dispose();
        tabB.dispose();
    });

    test("没有 Web Locks 时，用旧快照写入也不会丢掉已落库的资产（实测覆盖的回归场景）", async () => {
        const store = makeMemoryStore();
        // 两个标签各自持有一份过期内存快照，先后写入（真实场景：间隔几十毫秒到几秒）
        const tabA = createMergedAssetStorage<A>({ read: store.read, write: store.write, remove: store.remove, locks: null });
        const tabB = createMergedAssetStorage<A>({ read: store.read, write: store.write, remove: store.remove, locks: null });

        await tabA.setItem("k", { state: snap([asset("a", "A", "2026-10-30T01:00:00.000Z")]), version: 0 });
        await tabB.setItem("k", { state: snap([asset("b", "B", "2026-10-30T02:00:00.000Z")]), version: 0 });

        expect(store.data.get("k")?.state.assets.map((item) => item.id).sort()).toEqual(["a", "b"]);
        tabA.dispose();
        tabB.dispose();
    });

    test("后一次写入不会覆盖前一次已落库的资产", async () => {
        const store = makeMemoryStore();
        const tab = createMergedAssetStorage<A>({ read: store.read, write: store.write, remove: store.remove });

        await tab.setItem("k", { state: snap([asset("a", "A", "2026-10-30T01:00:00.000Z")]), version: 0 });
        // 本标签内存快照过期（只有 b），写入时应从存储里读回 a
        await tab.setItem("k", { state: snap([asset("b", "B", "2026-10-30T02:00:00.000Z")]), version: 0 });

        expect(store.data.get("k")?.state.assets.map((item) => item.id).sort()).toEqual(["a", "b"]);
        tab.dispose();
    });

    test("getItem 返回原始快照，removeItem 清空", async () => {
        const store = makeMemoryStore();
        const tab = createMergedAssetStorage<A>({ read: store.read, write: store.write, remove: store.remove });

        await tab.setItem("k", { state: snap([asset("a", "A", "2026-10-30T01:00:00.000Z")]), version: 0 });
        expect((await tab.getItem("k"))?.state.assets).toHaveLength(1);

        await tab.removeItem("k");
        expect(await tab.getItem("k")).toBeNull();
        tab.dispose();
    });
});
