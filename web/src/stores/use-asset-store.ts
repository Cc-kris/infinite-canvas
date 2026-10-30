import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { localForageStorage } from "@/lib/localforage-storage";
import {
    createMergedAssetStorage,
    tombstonesAfterReplace,
    type AssetPersistSnapshot,
    type AssetPersistValue,
} from "@/stores/asset-store-persist";
import { cleanupUnusedImages, ensureImagePreview, previewUrlFor, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { cleanupUnusedMedia, resolveMediaUrl } from "@/services/file-storage";

export type AssetKind = "text" | "image" | "video";
export type TextAsset = AssetBase<"text"> & { data: { content: string } };
export type ImageAsset = AssetBase<"image"> & { data: { dataUrl: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type VideoAsset = AssetBase<"video"> & { data: { url: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string; durationMs?: number } };
export type Asset = TextAsset | ImageAsset | VideoAsset;

type AssetBase<T extends AssetKind> = {
    id: string;
    kind: T;
    title: string;
    coverUrl: string;
    tags: string[];
    source?: string;
    note?: string;
    createdAt: string;
    updatedAt: string;
    /** 同一结果重复入库时递增；用于追溯"这是第几次落库"，不是生成次数。 */
    revision?: number;
    /** 结果来自旧草稿版本、或底层媒体已丢失；UI 必须显式提示，不能当可用结果。 */
    stale?: boolean;
    metadata?: Record<string, unknown>;
};

export type AssetUpsertResult = { id: string; created: boolean; revision: number };

type AssetStore = {
    hydrated: boolean;
    assets: Asset[];
    /** 资产 id -> 删除时间（ISO）。跨标签合并时用来阻止"复活"已删资产，见 stores/asset-store-persist.ts。 */
    assetTombstones: Record<string, string>;
    addAsset: (asset: Omit<Asset, "id" | "createdAt" | "updatedAt">) => string;
    /** 幂等入库：同一 key（结果指纹）只保留一条资产，重复入库只更新内容并递增 revision。 */
    upsertAsset: (asset: Omit<Asset, "id" | "createdAt" | "updatedAt">, options?: { key?: string }) => AssetUpsertResult;
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => void;
    /** 用快照覆盖资产（撤销重复入库时恢复旧内容，不递增 revision）。 */
    replaceAsset: (asset: Asset) => void;
    removeAsset: (id: string) => void;
    removeAssets: (ids: readonly string[]) => void;
    setAssetStale: (ids: readonly string[], stale: boolean) => void;
    replaceAssets: (assets: Asset[]) => void;
    cleanupImages: (extra?: unknown) => void;
};

export function assetResultKey(asset: Pick<Asset, "metadata">) {
    const key = asset.metadata?.resultAssetKey;
    if (typeof key === "string" && key !== "") return key;
    // 历史资产未写 resultAssetKey（旧版本只落 toolId/taskId/resultItemId），
    // 按同一口径推导，否则同一结果会被判定为「新资产」而重复入库。
    const meta = asset.metadata as Record<string, unknown> | undefined;
    const toolId = typeof meta?.toolId === "string" ? meta.toolId : "";
    const resultId =
        typeof meta?.resultId === "string" ? meta.resultId : typeof meta?.resultItemId === "string" ? meta.resultItemId : "";
    if (!toolId || !resultId) return undefined;
    const taskId = typeof meta?.taskId === "string" && meta.taskId !== "" ? meta.taskId : "task";
    return `tool-result:${toolId}:${taskId}:${resultId}`;
}

// 卡片用缩略图渲染，自定义封面（远程地址或单独上传的封面）保持原样。
export function assetCoverUrl(asset: Asset) {
    const own = asset.kind === "image" ? asset.data.dataUrl : "";
    const cover = asset.coverUrl || own;
    return asset.kind === "image" && cover === own ? previewUrlFor(asset.data.storageKey) || cover : cover;
}

const ASSET_STORE_KEY = "infinite-canvas:asset_store";

// 持久化写路径：先读存储里的最新快照，按 id 合并后再写回（见 stores/asset-store-persist.ts）。
// 直接用 JSON.stringify 整份覆盖会让后保存的标签抹掉另一个标签刚存的资产。
const mergedAssetStorage = createMergedAssetStorage<Asset>({
    read: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        return JSON.parse(value) as AssetPersistValue<Asset>;
    },
    write: async (name, value) => {
        await localForageStorage.setItem(name, JSON.stringify(value));
    },
    remove: async (name) => {
        await localForageStorage.removeItem(name);
    },
    onChange: (snapshot) => applyExternalAssetSnapshot(snapshot),
});

/** 别的标签写入后合并出的结果：只在本标签内存确实落后时才整体替换，避免自我循环写入。 */
function applyExternalAssetSnapshot(snapshot: AssetPersistSnapshot<Asset>) {
    const store = useAssetStore;
    if (!store) return;
    const current = store.getState();
    if (JSON.stringify(current.assets) === JSON.stringify(snapshot.assets)) return;
    store.setState({ assets: snapshot.assets, assetTombstones: snapshot.assetTombstones ?? {} });
    // 其它标签上传的图片在本标签还没有缩略图，补一次（失败不影响主流程）。
    for (const asset of snapshot.assets) {
        if (asset.kind === "image" && asset.data.storageKey) void ensureImagePreview(asset.data.storageKey);
    }
}

const assetStorage: PersistStorage<AssetStore> = {
    getItem: async (name) => {
        const stored = await mergedAssetStorage.getItem(name);
        if (!stored) return null;
        const parsed = stored as unknown as StorageValue<AssetStore>;
        parsed.state.assets = await Promise.all(
            parsed.state.assets.map(async (asset) => {
                if (asset.kind === "video" && asset.data.storageKey) {
                    // storageKey 有值但 blob 读不出来 => 视频已丢失，必须落 stale 而不是静默留一个打不开的地址。
                    const url = await resolveMediaUrl(asset.data.storageKey, "");
                    return { ...asset, stale: url ? asset.stale : true, data: { ...asset.data, url: url || asset.data.url } };
                }
                if (asset.kind !== "image") return asset;
                if (asset.data.storageKey) {
                    void ensureImagePreview(asset.data.storageKey);
                    const resolved = await resolveImageUrl(asset.data.storageKey, "");
                    return {
                        ...asset,
                        stale: resolved ? asset.stale : true,
                        coverUrl: asset.coverUrl.startsWith("blob:") ? resolved || asset.coverUrl : asset.coverUrl,
                        data: { ...asset.data, dataUrl: resolved || asset.data.dataUrl },
                    };
                }
                if (!asset.data.dataUrl.startsWith("data:image/")) return asset;
                const image = await uploadImage(asset.data.dataUrl);
                return { ...asset, coverUrl: asset.coverUrl.startsWith("data:image/") ? image.url : asset.coverUrl, data: { ...asset.data, dataUrl: image.url, storageKey: image.storageKey, bytes: image.bytes, mimeType: image.mimeType } };
            }),
        );
        return parsed;
    },
    setItem: (name, value) =>
        mergedAssetStorage.setItem(name, value as unknown as AssetPersistValue<Asset>) as unknown as Promise<void>,
    removeItem: (name) => mergedAssetStorage.removeItem(name) as unknown as Promise<void>,
};

export const useAssetStore = create<AssetStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            assets: [],
            assetTombstones: {},
            addAsset: (asset) => {
                const now = new Date().toISOString();
                const id = nanoid();
                set((state) => ({ assets: [{ ...asset, id, createdAt: now, updatedAt: now, revision: asset.revision ?? 1 } as Asset, ...state.assets] }));
                return id;
            },
            upsertAsset: (asset, options) => {
                const key = options?.key;
                const existing = key ? get().assets.find((item) => assetResultKey(item) === key) : undefined;
                const now = new Date().toISOString();
                if (!existing) {
                    const id = nanoid();
                    const revision = asset.revision ?? 1;
                    set((state) => ({ assets: [{ ...asset, id, createdAt: now, updatedAt: now, revision } as Asset, ...state.assets] }));
                    return { id, created: true, revision };
                }
                const revision = (existing.revision ?? 1) + 1;
                // 保留 createdAt 与稳定的 metadata.resultAssetKey；新内容覆盖其余字段。
                set((state) => ({
                    assets: state.assets.map((item) =>
                        item.id === existing.id ? ({ ...existing, ...asset, id: existing.id, createdAt: existing.createdAt, updatedAt: now, revision } as Asset) : item,
                    ),
                }));
                return { id: existing.id, created: false, revision };
            },
            replaceAsset: (asset) => set((state) => ({ assets: state.assets.map((item) => (item.id === asset.id ? asset : item)) })),
            updateAsset: (id, patch) =>
                set((state) => ({
                    assets: state.assets.map((asset) => (asset.id === id ? ({ ...asset, ...patch, updatedAt: new Date().toISOString() } as Asset) : asset)),
                })),
            removeAsset: (id) =>
                set((state) => {
                    const assets = state.assets.filter((asset) => asset.id !== id);
                    get().cleanupImages({ assets });
                    // 记墓碑：否则别的标签（内存里还有这条资产）下次保存会把它合并回来。
                    return { assets, assetTombstones: { ...state.assetTombstones, [id]: new Date().toISOString() } };
                }),
            removeAssets: (ids) => {
                const remove = new Set(ids);
                if (remove.size === 0) return;
                set((state) => {
                    const assets = state.assets.filter((asset) => !remove.has(asset.id));
                    get().cleanupImages({ assets });
                    const deletedAt = new Date().toISOString();
                    const assetTombstones = { ...state.assetTombstones };
                    for (const id of remove) assetTombstones[id] = deletedAt;
                    return { assets, assetTombstones };
                });
            },
            setAssetStale: (ids, stale) => {
                const targets = new Set(ids);
                if (targets.size === 0) return;
                const now = new Date().toISOString();
                set((state) => ({ assets: state.assets.map((asset) => (targets.has(asset.id) ? ({ ...asset, stale, updatedAt: now } as Asset) : asset)) }));
            },
            replaceAssets: (assets) =>
                set((state) => {
                    const now = new Date().toISOString();
                    const tombstoneOf = state.assetTombstones;
                    // 快照恢复可能把刚删掉的资产又加回来：把它的 updatedAt 顶到当前时间，
                    // 否则合并时会因为时间戳早于墓碑而被判定为"已删除"。
                    const revived = assets.map((asset) => {
                        const deletedAt = tombstoneOf[asset.id];
                        if (!deletedAt) return asset;
                        const stamp = Date.parse(asset.updatedAt || asset.createdAt || "");
                        return stamp && stamp > Date.parse(deletedAt) ? asset : { ...asset, updatedAt: now };
                    });
                    const tombstones = tombstonesAfterReplace({ assets: state.assets }, revived, now);
                    // 保留仍是墓碑、或本轮新增删除的条目；被恢复的 id 从墓碑里清掉。
                    const assetTombstones: Record<string, string> = {};
                    for (const [id, deletedAt] of Object.entries(tombstoneOf)) {
                        if (!assets.some((asset) => asset.id === id)) assetTombstones[id] = deletedAt;
                    }
                    return { assets: revived, assetTombstones: { ...assetTombstones, ...tombstones } };
                }),
            cleanupImages: (extra) => {
                window.setTimeout(async () => {
                    const { useCanvasStore } = await import("@/stores/canvas/use-canvas-store");
                    await cleanupUnusedImages({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
                    await cleanupUnusedMedia({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
                }, 0);
            },
        }),
        {
            name: ASSET_STORE_KEY,
            storage: assetStorage,
            partialize: (state) => ({ assets: state.assets, assetTombstones: state.assetTombstones }) as StorageValue<AssetStore>["state"],
            onRehydrateStorage: () => () => {
                useAssetStore.setState({ hydrated: true });
            },
        },
    ),
);
