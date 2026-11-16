import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { HttpError } from "../http.mjs";
import { fileToken, stateDir } from "./paths.mjs";

function stateFile(ctx, namespace, key) {
    const directory = stateDir(ctx, namespace);
    return path.join(directory, `${fileToken(key)}.json`);
}

export function readState(ctx, namespace, key) {
    const file = stateFile(ctx, namespace, key);
    return existsSync(file) ? readFileSync(file, "utf8") : null;
}

export function writeState(ctx, namespace, key, value) {
    const file = stateFile(ctx, namespace, key);
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(temp, value === undefined || value === null ? "" : String(value));
    renameSync(temp, file);
}

export function deleteState(ctx, namespace, key) {
    const file = stateFile(ctx, namespace, key);
    try {
        rmSync(file, { force: true });
    } catch (error) {
        throw new HttpError(500, "state-delete-failed", `删除本地状态失败：${error?.message || error}`);
    }
}
