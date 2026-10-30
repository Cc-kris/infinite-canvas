/**
 * 资产持久化的跨标签并发保护。
 *
 * 背景（R22-H 记录的风险）：zustand persist 每次 setState 都把「本标签内存里的整份
 * assets 数组」写回 IndexedDB。两个标签各自持有旧快照时，后写的那个会把先写的资产
 * 整条覆盖掉（last-write-wins），字节还在 image_files 里但资产元数据消失。
 *
 * 这里的做法：
 * 1. 写入前先读最新快照，做 id 维度的合并（新的 updatedAt 优先），而不是整份覆盖；
 * 2. 删除用墓碑（tombstone: id -> deletedAt）表达，否则合并会把别的标签删掉的资产复活；
 * 3. 同标签内写入串行化，跨标签用 Web Locks 互斥（Chrome/Edge/Safari 15.4+/Firefox 96+
 *    都有；Electron 里同样可用），这样「读最新-合并-写回」是原子的；
 *    环境没有 Web Locks 时退化为「写后回读校验 + 退避重试」，能把用旧快照覆盖新数据这种
 *    常见情形收敛掉，但两个标签在同一毫秒内同时写仍有极窄的窗口无法彻底消除（已实测记录）；
 * 4. 写入后通过 BroadcastChannel 把合并结果广播给其它标签，让它们的旧快照尽快追平，
 *    避免它们下一次保存再基于过期内存做决策。
 *
 * 纯逻辑（mergeAssetSnapshots）与存储装配（createMergedAssetStorage）分离，便于单测。
 */

export type AssetLike = { id: string; updatedAt?: string; createdAt?: string };

export type AssetPersistSnapshot<TAsset extends AssetLike> = {
    assets: TAsset[];
    /** 资产 id -> 删除时间（ISO）。用于阻止合并把已删资产复活。 */
    assetTombstones?: Record<string, string>;
};

export type AssetPersistValue<TAsset extends AssetLike> = {
    state: AssetPersistSnapshot<TAsset>;
    version?: number;
};

/** 墓碑保留期：过期后清理，避免无限增长（7 天足够覆盖多标签并存窗口）。 */
export const ASSET_TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const timeOf = (value?: string) => {
    if (!value) return 0;
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
};

const assetTime = (asset: AssetLike) => timeOf(asset.updatedAt) || timeOf(asset.createdAt);

function pruneTombstones(tombstones: Record<string, string>, now: number) {
    const next: Record<string, string> = {};
    for (const [id, deletedAt] of Object.entries(tombstones)) {
        const time = timeOf(deletedAt);
        if (time && now - time > ASSET_TOMBSTONE_TTL_MS) continue;
        next[id] = deletedAt;
    }
    return next;
}

function unionTombstones(latest: Record<string, string>, incoming: Record<string, string>) {
    const merged: Record<string, string> = { ...latest };
    for (const [id, deletedAt] of Object.entries(incoming)) {
        if (!merged[id] || timeOf(deletedAt) >= timeOf(merged[id])) merged[id] = deletedAt;
    }
    return merged;
}

function sameSnapshot<TAsset extends AssetLike>(a: AssetPersistSnapshot<TAsset>, b: AssetPersistSnapshot<TAsset>) {
    return JSON.stringify(a.assets) === JSON.stringify(b.assets) && JSON.stringify(a.assetTombstones ?? {}) === JSON.stringify(b.assetTombstones ?? {});
}

/**
 * 把「本标签的写入意图」合并进「存储里的最新快照」。
 *
 * - 同一 id：updatedAt 更新的那份胜出（相等时以本次写入为准，保证本标签刚做的编辑生效）；
 * - 只存在于最新快照里的资产保留（这正是修掉 last-write-wins 的关键）；
 * - 墓碑时间 >= 资产时间时该资产被判定为已删除；
 * - 顺序：先按最新快照顺序，再把本次新增的按原顺序追加，避免列表在标签之间抖动。
 */
export function mergeAssetSnapshots<TAsset extends AssetLike>(
    latest: AssetPersistSnapshot<TAsset>,
    incoming: AssetPersistSnapshot<TAsset>,
    now: number = Date.now(),
): { snapshot: AssetPersistSnapshot<TAsset>; changed: boolean } {
    const tombstones = pruneTombstones(unionTombstones(latest.assetTombstones ?? {}, incoming.assetTombstones ?? {}), now);
    const merged = new Map<string, TAsset>();
    for (const asset of latest.assets ?? []) merged.set(asset.id, asset);

    for (const asset of incoming.assets ?? []) {
        const existing = merged.get(asset.id);
        if (!existing || assetTime(asset) >= assetTime(existing)) merged.set(asset.id, asset);
    }

    const ordered: TAsset[] = [];
    const seen = new Set<string>();
    const push = (asset: TAsset) => {
        if (seen.has(asset.id)) return;
        const deletedAt = tombstones[asset.id];
        if (deletedAt && assetTime(asset) <= timeOf(deletedAt)) return;
        seen.add(asset.id);
        ordered.push(asset);
    };
    for (const asset of latest.assets ?? []) {
        const winner = merged.get(asset.id);
        if (winner) push(winner);
    }
    for (const asset of incoming.assets ?? []) {
        const winner = merged.get(asset.id);
        if (winner) push(winner);
    }

    const snapshot: AssetPersistSnapshot<TAsset> = { assets: ordered, assetTombstones: tombstones };
    const base: AssetPersistSnapshot<TAsset> = { assets: latest.assets ?? [], assetTombstones: latest.assetTombstones ?? {} };
    return { snapshot, changed: !sameSnapshot(base, snapshot) };
}

/** 从当前 assets 推导墓碑：被删掉的 id 记删除时间，仍存在的 id 清掉旧墓碑。 */
export function tombstonesAfterReplace(current: AssetPersistSnapshot<AssetLike>, nextAssets: AssetLike[], deletedAt = new Date().toISOString()) {
    const keep = new Set(nextAssets.map((asset) => asset.id));
    const tombstones: Record<string, string> = {};
    for (const asset of current.assets) {
        if (!keep.has(asset.id)) tombstones[asset.id] = deletedAt;
    }
    return tombstones;
}

type MergedStorageOptions<TAsset extends AssetLike> = {
    /** 读原始快照（不做媒体恢复，纯持久化层）。 */
    read: (name: string) => Promise<AssetPersistValue<TAsset> | null>;
    /** 写原始快照。 */
    write: (name: string, value: AssetPersistValue<TAsset>) => Promise<void>;
    remove: (name: string) => Promise<void>;
    /** 合并结果与存储里的旧快照不同（说明有跨标签内容被吸收）时回调。 */
    onChange?: (snapshot: AssetPersistSnapshot<TAsset>) => void;
    channelName?: string;
    lockName?: string;
    /** 写入回读校验的重试次数（无 Web Locks 时用）。 */
    maxAttempts?: number;
    /** 跨标签互斥用的 LockManager，默认取 navigator.locks（可注入便于测试）。 */
    locks?: Pick<LockManager, "request"> | null;
};

/**
 * 装配一个「读最新-合并-写回」的 persist storage。
 * 返回的对象可直接交给 zustand persist 的 storage 字段（值结构已是 {state, version}）。
 */
export function createMergedAssetStorage<TAsset extends AssetLike>(options: MergedStorageOptions<TAsset>) {
    const { read, write, remove, onChange, maxAttempts = 4 } = options;
    const lockManager = options.locks !== undefined ? options.locks : (typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks ?? null : null);
    const channelName = options.channelName ?? "infinite-canvas:asset_store:sync";
    const lockName = options.lockName ?? "infinite-canvas:asset_store:write";

    let queue: Promise<unknown> = Promise.resolve();
    const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
        const run = queue.then(task, task);
        queue = run.catch(() => undefined);
        return run;
    };

    const withLock = async <T>(task: () => Promise<T>): Promise<T> => {
        if (!lockManager?.request) return task();
        return lockManager.request(lockName, task) as Promise<T>;
    };

    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(channelName) : null;
    if (channel && onChange) {
        channel.onmessage = (event: MessageEvent<AssetPersistSnapshot<TAsset>>) => {
            const snapshot = event.data;
            if (!snapshot || !Array.isArray(snapshot.assets)) return;
            onChange(snapshot);
        };
    }

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const persist = async (name: string, value: AssetPersistValue<TAsset>) => {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const latest = await read(name);
            const { snapshot, changed } = mergeAssetSnapshots(latest?.state ?? { assets: [] }, value.state);
            const nextValue: AssetPersistValue<TAsset> = {
                ...value,
                state: { ...value.state, assets: snapshot.assets, assetTombstones: snapshot.assetTombstones },
            };
            await write(name, nextValue);
            // 有 Web Locks 时这段读改写是互斥的，一次即准；否则回读确认没被别的标签插队改写。
            const stored = await read(name);
            const storedIds = new Set((stored?.state.assets ?? []).map((asset) => asset.id));
            const allPresent = snapshot.assets.every((asset) => storedIds.has(asset.id));
            if (allPresent) {
                if (changed) {
                    onChange?.(snapshot);
                    channel?.postMessage(snapshot);
                }
                return;
            }
            // 没拿到 Web Locks 时，别的标签可能刚好插在「读」和「写」之间。退避后再合并重写，
            // 让两边的写入都有机会把对方的资产吸收进来（总等待 < 200ms，只在冲突时发生）。
            if (attempt < maxAttempts - 1) await sleep(15 * (attempt + 1) + Math.floor(Math.random() * 10));
        }

        // 多次退避后仍被插队：做最后一次「读最新→合并→写」，尽最大努力保住两边的资产。
        const latest = await read(name);
        const { snapshot } = mergeAssetSnapshots(latest?.state ?? { assets: [] }, value.state);
        await write(name, {
            ...value,
            state: { ...value.state, assets: snapshot.assets, assetTombstones: snapshot.assetTombstones },
        });
    };

    return {
        getItem: async (name: string) => read(name),
        setItem: (name: string, value: AssetPersistValue<TAsset>): Promise<void> =>
            enqueue(() => withLock<void>(() => persist(name, value))),
        removeItem: (name: string): Promise<void> => enqueue(() => withLock<void>(() => remove(name))),
        dispose: () => {
            channel?.close();
        },
    };
}
