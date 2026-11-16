import { existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { fileToken, logsDir } from "./paths.mjs";

const chains = new Map();

/** 同一类日志的读改写串行化，避免多窗口同时写日志时互相覆盖。 */
function serialized(ctx, kind, run) {
    const id = `${ctx.dataRoot}:${kind}`;
    const previous = chains.get(id) || Promise.resolve();
    const next = previous.catch(() => undefined).then(run);
    chains.set(
        id,
        next.catch(() => undefined),
    );
    return next;
}

function monthOf(log) {
    const raw = log?.createdAt;
    const date = typeof raw === "number" ? new Date(raw) : typeof raw === "string" ? new Date(raw) : new Date();
    const time = Number.isNaN(date.getTime()) ? new Date() : date;
    return `${time.getUTCFullYear()}-${String(time.getUTCMonth() + 1).padStart(2, "0")}`;
}

function readLogs(ctx, kind) {
    const directory = logsDir(ctx, kind);
    if (!existsSync(directory)) return [];
    const logs = [];
    for (const name of readdirSync(directory).filter((item) => item.endsWith(".jsonl")).sort()) {
        const file = path.join(directory, name);
        for (const line of readFileSync(file, "utf8").split("\n")) {
            const text = line.trim();
            if (!text) continue;
            try {
                const value = JSON.parse(text);
                if (value && typeof value === "object") logs.push(value);
            } catch {
                console.error(`[infinite-canvas:storage] ignored malformed log line in ${kind}/${name}`);
            }
        }
    }
    return logs;
}

function writeLogs(ctx, kind, logs) {
    const directory = logsDir(ctx, kind);
    for (const name of readdirSync(directory).filter((item) => item.endsWith(".jsonl"))) {
        rmSync(path.join(directory, name), { force: true });
    }
    const groups = new Map();
    for (const log of logs) {
        const month = monthOf(log);
        if (!groups.has(month)) groups.set(month, []);
        groups.get(month).push(log);
    }
    for (const [month, items] of groups) {
        const file = path.join(directory, `${month}.jsonl`);
        const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
        writeFileSync(temp, `${items.map((item) => JSON.stringify(item)).join("\n")}\n`);
        renameSync(temp, file);
    }
}

export function listLogs(ctx, kind) {
    return serialized(ctx, kind, () => ({ logs: readLogs(ctx, kind) }));
}

export function upsertLog(ctx, kind, id, log) {
    fileToken(id, "日志 id");
    return serialized(ctx, kind, () => {
        const value = log && typeof log === "object" ? { ...log, id: log.id || id } : { id };
        const logs = readLogs(ctx, kind);
        const index = logs.findIndex((item) => item.id === value.id);
        if (index >= 0) logs[index] = value;
        else logs.push(value);
        writeLogs(ctx, kind, logs);
        return { ok: true };
    });
}

export function replaceLogs(ctx, kind, logs) {
    return serialized(ctx, kind, () => {
        const items = (Array.isArray(logs) ? logs : []).filter((item) => item && typeof item === "object");
        writeLogs(ctx, kind, items);
        return { ok: true, count: items.length };
    });
}

export function deleteLogs(ctx, kind, ids) {
    const removing = new Set((Array.isArray(ids) ? ids : []).map(String));
    return serialized(ctx, kind, () => {
        const logs = readLogs(ctx, kind).filter((item) => !removing.has(String(item.id)));
        writeLogs(ctx, kind, logs);
        return { ok: true, removed: removing.size };
    });
}
