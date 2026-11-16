import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const indexes = new Map();
const writes = new Map();

function indexPath(ctx) {
    return path.join(ctx.dataRoot, "media-index.json");
}

function indexFor(ctx) {
    const cached = indexes.get(ctx.dataRoot);
    if (cached) return cached;
    const index = new Map();
    try {
        const file = indexPath(ctx);
        if (existsSync(file)) {
            const parsed = JSON.parse(readFileSync(file, "utf8"));
            for (const [key, value] of Object.entries(parsed || {})) {
                if (value && typeof value === "object") index.set(key, value);
            }
        }
    } catch (error) {
        console.error("[infinite-canvas:storage] media index unreadable:", error?.message || error);
    }
    indexes.set(ctx.dataRoot, index);
    return index;
}

/** 索引写入串行化，并用临时文件替换，避免异常退出留下半个 JSON。 */
function persist(ctx) {
    const previous = writes.get(ctx.dataRoot) || Promise.resolve();
    const next = previous
        .catch(() => undefined)
        .then(() => {
            const file = indexPath(ctx);
            const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
            const payload = Object.fromEntries(indexFor(ctx));
            writeFileSync(temp, JSON.stringify(payload, null, 2));
            renameSync(temp, file);
        });
    writes.set(ctx.dataRoot, next);
    return next;
}

export function getMediaEntry(ctx, key) {
    return indexFor(ctx).get(String(key)) || null;
}

export function listMediaEntries(ctx, prefix = "") {
    const text = String(prefix || "");
    return Array.from(indexFor(ctx).values())
        .filter((entry) => !text || entry.key.startsWith(text))
        .sort((a, b) => a.key.localeCompare(b.key));
}

export function recordMediaEntry(ctx, entry) {
    indexFor(ctx).set(entry.key, entry);
    return persist(ctx);
}

export function removeMediaEntry(ctx, key) {
    indexFor(ctx).delete(String(key));
    return persist(ctx);
}
