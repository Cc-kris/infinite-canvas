import { randomUUID } from "node:crypto";
import { createWriteStream, mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const ID_PATTERN = /^[a-f0-9-]{36}(?:\.[a-z0-9]{1,10})?$/i;

/** 渲染层把视频/图片以原始字节流上传到这里，处理完成即删除，不进入正式资产库。 */
export function tempDir(dataRoot) {
    const dir = path.join(dataRoot, "tmp");
    mkdirSync(dir, { recursive: true });
    return dir;
}

export async function saveUpload(req, dataRoot, name) {
    const extension = path
        .extname(String(name || ""))
        .toLowerCase()
        .replace(/[^.a-z0-9]/g, "")
        .slice(0, 10);
    const id = `${randomUUID()}${extension}`;
    const target = path.join(tempDir(dataRoot), id);
    await pipeline(req, createWriteStream(target));
    return { id, bytes: statSync(target).size };
}

export function resolveTemp(dataRoot, id) {
    const value = String(id || "");
    if (!ID_PATTERN.test(value)) throw new Error("媒体文件标识无效");
    const target = path.join(tempDir(dataRoot), value);
    const stat = statSync(target, { throwIfNoEntry: false });
    if (!stat?.isFile()) throw new Error("媒体文件不存在或已失效");
    return target;
}

export function removeTemp(dataRoot, ids) {
    for (const id of ids) {
        if (!id) continue;
        try {
            rmSync(path.join(tempDir(dataRoot), path.basename(String(id))), { force: true });
        } catch {
            /* 临时文件清理属于尽力而为 */
        }
    }
}
