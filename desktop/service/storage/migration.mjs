import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { HttpError } from "../http.mjs";

function markerPath(ctx) {
    return path.join(ctx.dataRoot, ".migrated");
}

export function migrationStatus(ctx) {
    const file = markerPath(ctx);
    if (!existsSync(file)) return { migrated: false, backupPath: "" };
    try {
        const marker = JSON.parse(readFileSync(file, "utf8"));
        return { migrated: true, backupPath: marker.backupPath || "", migratedAt: marker.migratedAt || "" };
    } catch {
        return { migrated: true, backupPath: "", migratedAt: "" };
    }
}

/** 只保存清单与元信息；原 IndexedDB 与已写入的媒体文件都保留，不做二次复制。 */
export function writeBackup(ctx, manifest) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(ctx.dataRoot, `backup-indexeddb-${stamp}.json`);
    try {
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify({ ...manifest, app: "infinite-canvas", exportedAt: new Date().toISOString() }, null, 2));
    } catch (error) {
        throw new HttpError(500, "backup-failed", `备份 IndexedDB 清单失败：${error?.message || error}`);
    }
    return { path: file };
}

export function completeMigration(ctx, input) {
    const file = markerPath(ctx);
    const payload = { migratedAt: new Date().toISOString(), backupPath: String(input?.backupPath || "") };
    try {
        writeFileSync(file, JSON.stringify(payload));
    } catch (error) {
        throw new HttpError(500, "migration-marker-failed", `写入迁移标记失败：${error?.message || error}`);
    }
    return { ok: true, ...payload };
}
