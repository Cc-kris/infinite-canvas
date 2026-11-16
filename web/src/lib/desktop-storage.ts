import type { StateStorage } from "zustand/middleware";

import { deleteStateText, readStateText, writeStateText } from "@/services/desktop-storage";
import { ensureStorageMigration } from "@/services/storage-migration";

/**
 * zustand persist 的磁盘存储适配器。
 * 读取前先等一次性迁移完成，避免旧数据还没导入就被当作空状态。
 */
export const appStateStorage: StateStorage = {
    getItem: async (name) => {
        await ensureStorageMigration();
        return readStateText(name);
    },
    setItem: async (name, value) => {
        await ensureStorageMigration();
        await writeStateText(name, value);
    },
    removeItem: async (name) => {
        await ensureStorageMigration();
        await deleteStateText(name);
    },
};
