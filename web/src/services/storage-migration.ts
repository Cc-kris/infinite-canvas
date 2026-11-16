import { getDesktopBridge } from "@/lib/desktop";
import { requestJson } from "@/services/api/desktop/http";
import { replaceLogEntries, uploadMediaBlob, writePluginValue, writeStateText } from "@/services/desktop-storage";

type AnyRecord = Record<string, unknown>;

const LEGACY_DB = "infinite-canvas";
const LEGACY_PLUGIN_DB = "infinite-canvas-plugins";
const LEGACY_LOCAL_KEYS = ["infinite-canvas:ai_config_store", "infinite-canvas:theme_store", "infinite-canvas:prompt_source_store_v2"];
const BACKUP_VERSION = 1;

type StoreStat = { name: string; records: number; bytes: number };
type DatabaseStat = { name: string; stores: StoreStat[] };
type LegacyStore = Pick<LocalForage, "iterate">;
type Snapshot = {
    databases: DatabaseStat[];
    appState: Array<{ key: string; value: string }>;
    localStorage: Array<{ key: string; value: string }>;
    logs: Record<string, AnyRecord[]>;
    plugins: Array<{ pluginId: string; key: string; value: unknown }>;
    media: { records: number; bytes: number };
};

let migrationPromise: Promise<boolean> | null = null;

/** 首次启动把旧 IndexedDB / localStorage 导入磁盘；成功后写 .migrated，失败保留旧数据且不写标记。 */
export function ensureStorageMigration(): Promise<boolean> {
    if (!migrationPromise) migrationPromise = runMigration().catch((error) => {
        reportMigrationError(error);
        return false;
    });
    return migrationPromise;
}

async function runMigration() {
    const bridge = getDesktopBridge();
    if (!bridge) return true;
    if (!bridge.serviceUrl || !bridge.serviceToken) {
        reportMigrationError(new Error("本地服务未启动，本次未执行数据迁移"));
        return false;
    }
    const status = await requestJson<{ migrated: boolean; backupPath?: string }>("/api/storage/migration/status");
    if (status.migrated) return true;

    const snapshot = await readLegacySnapshot();
    if (!snapshot.databases.length && !snapshot.localStorage.length) {
        await requestJson("/api/storage/migration/complete", { method: "POST", body: { backupPath: "" } });
        return true;
    }

    const backup = await requestJson<{ path: string }>("/api/storage/migration/backup", {
        method: "POST",
        body: {
            version: BACKUP_VERSION,
            databases: snapshot.databases,
            localStorage: snapshot.localStorage.map((item) => ({ key: item.key, bytes: byteLength(item.value) })),
            appState: snapshot.appState.map((item) => ({ key: item.key, bytes: byteLength(item.value) })),
            logs: Object.fromEntries(Object.entries(snapshot.logs).map(([kind, logs]) => [kind, logs.length])),
            plugins: snapshot.plugins.map((item) => ({ pluginId: item.pluginId, key: item.key })),
            media: snapshot.media,
        },
    });

    try {
        await importLegacyMedia();
        await writeSnapshot(snapshot);
        await requestJson("/api/storage/migration/complete", { method: "POST", body: { backupPath: backup.path } });
    } catch (error) {
        reportMigrationError(error, backup.path);
        return false;
    }
    return true;
}

/** 第一遍只读元信息与小数据，用于先落备份清单。 */
async function readLegacySnapshot(): Promise<Snapshot> {
    const localforage = await loadLocalforage();
    const snapshot: Snapshot = { databases: [], appState: [], localStorage: [], logs: {}, plugins: [], media: { records: 0, bytes: 0 } };

    for (const database of await listDatabases()) {
        const stores = await storeNames(database);
        if (!stores.length) continue;
        const stats: DatabaseStat = { name: database, stores: [] };
        for (const store of stores) {
            const instance = localforage.createInstance({ name: database, storeName: store });
            if (database === LEGACY_DB && store === "app_state") {
                await instance.iterate<string, void>((value, key) => {
                    if (typeof value === "string") snapshot.appState.push({ key, value });
                });
            }
            if (database === LEGACY_DB && store === "image_generation_logs") snapshot.logs["image-generation"] = await collectLogs(instance);
            if (database === LEGACY_DB && store === "video_generation_logs") snapshot.logs["video-generation"] = await collectLogs(instance);
            if (database === LEGACY_PLUGIN_DB) {
                await instance.iterate((value, key) => {
                    snapshot.plugins.push({ pluginId: store, key, value });
                });
            }
            const stat = await storeStat(instance);
            stats.stores.push({ name: store, ...stat });
            if (isMediaStore(store)) {
                snapshot.media.records += stat.records;
                snapshot.media.bytes += stat.bytes;
            }
        }
        snapshot.databases.push(stats);
    }

    for (const key of LEGACY_LOCAL_KEYS) {
        const value = safeLocalStorageGet(key);
        if (value !== null) snapshot.localStorage.push({ key, value });
    }
    return snapshot;
}

/** 第二遍才把 Blob 逐个流式写入磁盘，避免一次性把全部媒体读进内存。 */
async function importLegacyMedia() {
    const localforage = await loadLocalforage();
    const databases = await listDatabases();
    for (const database of databases) {
        if (!isMediaDatabase(database)) continue;
        for (const store of await storeNames(database)) {
            const instance = localforage.createInstance({ name: database, storeName: store });
            // localforage 的 iterate 不等待回调返回的 Promise（返回非 undefined 还会中断遍历），
            // 所以先同步收集 Blob，再逐个上传。
            const blobs: Array<{ key: string; blob: Blob; kind: string }> = [];
            await instance.iterate((value, key) => {
                if (store === "image_previews") {
                    const preview = value as { blob?: Blob } | null;
                    if (preview?.blob) blobs.push({ key: `preview:${key}`, blob: preview.blob, kind: "preview" });
                    return;
                }
                if (value instanceof Blob && value.size > 0) blobs.push({ key, blob: value, kind: mediaKind(key) });
            });
            for (const item of blobs) {
                await uploadMediaBlob(item.key, item.blob, item.kind, item.blob.type || (item.kind === "preview" ? "image/webp" : "application/octet-stream"));
            }
        }
    }
}

async function writeSnapshot(snapshot: Snapshot) {
    for (const item of snapshot.appState) await writeStateText(item.key, item.value);
    for (const item of snapshot.localStorage) await writeStateText(item.key, item.value);
    for (const [kind, logs] of Object.entries(snapshot.logs)) {
        if (logs.length) await replaceLogEntries(kind, logs);
    }
    for (const item of snapshot.plugins) await writePluginValue(item.pluginId, item.key, item.value);
}

function mediaKind(key: string) {
    const prefix = key.split(":")[0];
    if (prefix === "image") return "image";
    if (prefix === "video" || prefix === "video-reference") return "video";
    if (prefix === "audio" || prefix === "audio-reference") return "audio";
    return "file";
}

function isMediaDatabase(database: string) {
    return database === LEGACY_DB;
}

function isMediaStore(store: string) {
    return store === "media_files" || store === "image_files" || store === "image_previews";
}

async function listDatabases() {
    const api = indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> };
    try {
        const list = await api.databases?.();
        if (Array.isArray(list)) return list.map((item) => item.name || "").filter(Boolean);
    } catch {
        /* 部分环境不支持 databases()，退回逐个打开 */
    }
    const fallback = [];
    for (const name of [LEGACY_DB, LEGACY_PLUGIN_DB]) {
        if ((await storeNames(name)).length) fallback.push(name);
    }
    return fallback;
}

function storeNames(database: string): Promise<string[]> {
    return new Promise((resolve) => {
        const request = indexedDB.open(database);
        // 库不存在时 open 会触发建库；直接中止，避免迁移探测多出空数据库。
        request.onupgradeneeded = () => request.transaction?.abort();
        request.onerror = () => resolve([]);
        request.onsuccess = () => {
            const db = request.result;
            const names = Array.from(db.objectStoreNames);
            db.close();
            resolve(names);
        };
    });
}

async function storeStat(instance: LegacyStore) {
    let records = 0;
    let bytes = 0;
    await instance.iterate((value) => {
        records += 1;
        bytes += valueBytes(value);
    });
    return { records, bytes };
}

async function collectLogs(instance: LegacyStore) {
    const logs: AnyRecord[] = [];
    await instance.iterate((value) => {
        if (value && typeof value === "object") logs.push(value as AnyRecord);
    });
    return logs;
}

function valueBytes(value: unknown) {
    if (value instanceof Blob) return value.size;
    if (value instanceof ArrayBuffer) return value.byteLength;
    if (ArrayBuffer.isView(value)) return value.byteLength;
    return byteLength(typeof value === "string" ? value : JSON.stringify(value) || "");
}

function byteLength(value: string) {
    return new TextEncoder().encode(value).byteLength;
}

function safeLocalStorageGet(key: string) {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

async function loadLocalforage() {
    const module = await import("localforage");
    return module.default;
}

function reportMigrationError(error: unknown, backupPath = "") {
    const detail = error instanceof Error ? error.message : String(error);
    const message = `本地数据迁移失败：${detail}${backupPath ? `（备份清单：${backupPath}）` : ""}。旧数据仍保留在浏览器存储中，可重启应用重试。`;
    console.error("[infinite-canvas:storage]", message, error);
    try {
        showBanner(message);
    } catch {
        /* 横幅只是提示，不能反过来影响启动流程 */
    }
}

function showBanner(message: string) {
    if (typeof document === "undefined") return;
    const mount = () => {
        const banner = document.createElement("div");
        banner.textContent = message;
        banner.style.cssText = [
            "position:fixed",
            "inset:0 0 auto 0",
            "z-index:2147483647",
            "padding:10px 16px",
            "background:#7f1d1d",
            "color:#fff",
            "font:13px/1.5 -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif",
            "white-space:pre-wrap",
            "box-shadow:0 2px 8px rgba(0,0,0,.25)",
        ].join(";");
        (document.body || document.documentElement).appendChild(banner);
    };
    // store 在模块初始化时就会触发迁移，此时 body 可能还没解析出来。
    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount, { once: true });
}
