import { readDesktopStorageUsage } from "@/services/desktop-storage";

export type IndexedDbStoreUsage = { name: string; records: number; bytes: number };
export type IndexedDbDatabaseUsage = { name: string; version: number; bytes: number; stores: IndexedDbStoreUsage[] };
export type LocalStorageUsage = { usage: number; quota: number | null; contentBytes: number; databases: IndexedDbDatabaseUsage[] };

const DIRECTORY_LABELS: Record<string, string> = {
    state: "状态数据",
    media: "媒体文件",
    logs: "生成日志",
    plugins: "插件数据",
};

export async function readLocalStorageUsage(): Promise<LocalStorageUsage> {
    const usage = await readDesktopStorageUsage();
    const stores = usage.directories.map((item) => ({ name: DIRECTORY_LABELS[item.name] || item.name, records: item.files, bytes: item.bytes }));
    return {
        usage: usage.bytes,
        quota: null,
        contentBytes: usage.bytes,
        databases: [{ name: "本地数据目录", version: 1, bytes: usage.bytes, stores }],
    };
}
