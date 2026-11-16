import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { HttpError } from "../http.mjs";
import { fileToken, pluginsDir } from "./paths.mjs";

function pluginFile(ctx, pluginId, key) {
    const directory = pluginsDir(ctx, pluginId);
    return path.join(directory, `${fileToken(key, "插件存储键")}.json`);
}

export function readPluginValue(ctx, pluginId, key) {
    const file = pluginFile(ctx, pluginId, key);
    if (!existsSync(file)) return null;
    const text = readFileSync(file, "utf8");
    try {
        return { value: JSON.parse(text) };
    } catch {
        return { value: text };
    }
}

export function writePluginValue(ctx, pluginId, key, text) {
    let value;
    try {
        value = JSON.parse(text);
    } catch {
        throw new HttpError(400, "invalid-json", "插件存储值必须是合法 JSON");
    }
    const file = pluginFile(ctx, pluginId, key);
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(temp, JSON.stringify(value));
    renameSync(temp, file);
    return { ok: true };
}

export function deletePluginValue(ctx, pluginId, key) {
    rmSync(pluginFile(ctx, pluginId, key), { force: true });
    return { ok: true };
}
