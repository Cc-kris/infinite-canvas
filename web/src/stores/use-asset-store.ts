import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { localForageStorage } from "@/lib/localforage-storage";
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

const assetStorage: PersistStorage<AssetStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<AssetStore>;
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
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useAssetStore = create<AssetStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            assets: [],
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
                    return { assets };
                }),
            removeAssets: (ids) => {
                const remove = new Set(ids);
                if (remove.size === 0) return;
                set((state) => {
                    const assets = state.assets.filter((asset) => !remove.has(asset.id));
                    get().cleanupImages({ assets });
                    return { assets };
                });
            },
            setAssetStale: (ids, stale) => {
                const targets = new Set(ids);
                if (targets.size === 0) return;
                const now = new Date().toISOString();
                set((state) => ({ assets: state.assets.map((asset) => (targets.has(asset.id) ? ({ ...asset, stale, updatedAt: now } as Asset) : asset)) }));
            },
            replaceAssets: (assets) => set({ assets }),
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
            partialize: (state) => ({ assets: state.assets }) as StorageValue<AssetStore>["state"],
            onRehydrateStorage: () => () => {
                useAssetStore.setState({ hydrated: true });
            },
        },
    ),
);
