/**
 * TASK-004 单测：真实校验矩阵、真实上传（注入落库实现，验证字节进度/取消/回滚）、资产索引恢复、草稿刷新恢复与多标签冲突。
 * 运行：cd web && bun test src/services/api/tools/assets.test.ts
 */
import { expect, test } from "bun:test";

import {
    DEFAULT_IMAGE_CONSTRAINTS,
    ToolAssetError,
    adoptLibraryAsset,
    loadToolAssetRecords,
    mimeTypeFromFileName,
    normalizeMimeType,
    removeToolAsset,
    sniffMimeType,
    uploadToolAsset,
    validateToolAsset,
    validateToolAssetCount,
    type ToolAssetRecord,
    type ToolAssetRecordStore,
} from "./assets";
import { applyToolDraftPatch, createToolDraft, decideRemoteDraft, loadToolDraft, parseToolDraft, persistToolDraft, toolDraftKey, toolDraftQuarantineKey, type ToolDraft, type ToolDraftStorage } from "../../../stores/use-tool-draft-store";

/* ----------------------------- helpers ----------------------------- */

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function bytesWithHead(head: number[], size = 4096, fill = 0) {
    const bytes = new Uint8Array(size).fill(fill);
    bytes.set(head.slice(0, Math.min(head.length, size)), 0);
    return bytes;
}

const pngBytes = (size = 4096) => bytesWithHead(PNG_HEAD, size);
const gifBytes = () => bytesWithHead([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 2048);
const mp4Bytes = (brand = "isom") => {
    const bytes = bytesWithHead([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], 4096);
    bytes.set(Array.from(brand).map((char) => char.charCodeAt(0)), 8);
    return bytes;
};
const webmBytes = () => bytesWithHead([0x1a, 0x45, 0xdf, 0xa3], 4096);
const htmlBytes = () => bytesWithHead(Array.from("<html><body>x</body></html>").map((char) => char.charCodeAt(0)), 512);

function makeFile(name: string, bytes: Uint8Array, type: string) {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return new File([buffer], name, { type });
}

function memoryRecordStore(): ToolAssetRecordStore & { map: Map<string, ToolAssetRecord> } {
    const map = new Map<string, ToolAssetRecord>();
    return {
        map,
        get: async (id) => map.get(id) ?? null,
        set: async (record) => {
            map.set(record.id, record);
        },
        remove: async (id) => {
            map.delete(id);
        },
        list: async () => [...map.values()],
    };
}

function memoryDraftStorage(initial: Record<string, string> = {}): ToolDraftStorage & { map: Map<string, string> } {
    const map = new Map(Object.entries(initial));
    return {
        map,
        getItem: async (key) => map.get(key) ?? null,
        setItem: async (key, value) => {
            map.set(key, value);
        },
        removeItem: async (key) => {
            map.delete(key);
        },
    };
}

const storedBlob = (blob: Blob) => ({ storageKey: `tool-asset:${blob.size}`, url: `blob:tool-${blob.size}`, bytes: blob.size, mimeType: blob.type });

/* --------------------------- 格式/MIME ---------------------------- */

test("sniffMimeType 按文件头识别 png/jpeg/webp/gif/mp4/mov/webm，未知返回 undefined", () => {
    expect(sniffMimeType(pngBytes())).toBe("image/png");
    expect(sniffMimeType(bytesWithHead([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMimeType(bytesWithHead([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
    expect(sniffMimeType(gifBytes())).toBe("image/gif");
    expect(sniffMimeType(mp4Bytes("isom"))).toBe("video/mp4");
    expect(sniffMimeType(mp4Bytes("qt  "))).toBe("video/quicktime");
    expect(sniffMimeType(webmBytes())).toBe("video/webm");
    expect(sniffMimeType(htmlBytes())).toBeUndefined();
    expect(sniffMimeType(null)).toBeUndefined();
});

test("normalizeMimeType / mimeTypeFromFileName 覆盖 jpg 别名与常见扩展名", () => {
    expect(normalizeMimeType("IMAGE/JPG; charset=x")).toBe("image/jpeg");
    expect(normalizeMimeType("")).toBe("");
    expect(mimeTypeFromFileName("a.JPEG")).toBe("image/jpeg");
    expect(mimeTypeFromFileName("a.mov")).toBe("video/quicktime");
    expect(mimeTypeFromFileName("a.unknown")).toBe("");
});

/* ----------------------------- 校验矩阵 ---------------------------- */

test("validateToolAsset 合法图片通过", () => {
    expect(validateToolAsset({ name: "a.png", bytes: 4096, declaredMime: "image/png", sniffedMime: "image/png", width: 1024, height: 768 }, DEFAULT_IMAGE_CONSTRAINTS)).toBeNull();
});

test("validateToolAsset 拒绝空文件/超大/不支持格式", () => {
    expect(validateToolAsset({ name: "a.png", bytes: 0, declaredMime: "image/png" }, DEFAULT_IMAGE_CONSTRAINTS)?.code).toBe("empty-file");
    expect(validateToolAsset({ name: "a.png", bytes: DEFAULT_IMAGE_CONSTRAINTS.maxBytes + 1, declaredMime: "image/png" }, DEFAULT_IMAGE_CONSTRAINTS)?.code).toBe("too-large");
    expect(validateToolAsset({ name: "a.gif", bytes: 2048, declaredMime: "image/gif", sniffedMime: "image/gif" }, DEFAULT_IMAGE_CONSTRAINTS)?.code).toBe("mime-not-allowed");
    expect(validateToolAsset({ name: "a.bin", bytes: 10, declaredMime: "", sniffedMime: "" }, DEFAULT_IMAGE_CONSTRAINTS)?.code).toBe("mime-unknown");
});

test("validateToolAsset 声明类型与文件头大类不符时拒绝（防改扩展名）", () => {
    const issue = validateToolAsset({ name: "fake.png", bytes: 2048, declaredMime: "image/png", sniffedMime: "image/gif", width: 100, height: 100 }, DEFAULT_IMAGE_CONSTRAINTS);
    expect(issue?.code).toBe("mime-mismatch");
    expect(issue?.actual?.mimeType).toBe("image/gif");
});

test("validateToolAsset 覆盖尺寸/像素/解码失败", () => {
    const scaleUp = { ...DEFAULT_IMAGE_CONSTRAINTS, maxWidth: 4096, maxHeight: 4096 };
    expect(validateToolAsset({ name: "a.png", bytes: 4096, declaredMime: "image/png", sniffedMime: "image/png", width: 4097, height: 1024 }, scaleUp)?.code).toBe("dimension-too-large");
    expect(validateToolAsset({ name: "a.png", bytes: 4096, declaredMime: "image/png", sniffedMime: "image/png", width: 32, height: 32 }, DEFAULT_IMAGE_CONSTRAINTS)?.code).toBe("dimension-too-small");
    expect(validateToolAsset({ name: "a.png", bytes: 4096, declaredMime: "image/png", sniffedMime: "image/png" }, DEFAULT_IMAGE_CONSTRAINTS)?.code).toBe("decode-failed");
    const pixelCapped = { ...DEFAULT_IMAGE_CONSTRAINTS, maxPixels: 1_000_000 };
    expect(validateToolAsset({ name: "a.png", bytes: 4096, declaredMime: "image/png", sniffedMime: "image/png", width: 2000, height: 2000 }, pixelCapped)?.code).toBe("pixel-limit");
});

test("validateToolAsset 视频时长上限生效", () => {
    const video = { kind: "video" as const, mimeTypes: ["video/mp4"], maxBytes: 1024 * 1024, maxDurationMs: 30_000 };
    expect(validateToolAsset({ name: "a.mp4", bytes: 4096, declaredMime: "video/mp4", sniffedMime: "video/mp4", width: 1280, height: 720, durationMs: 31_000 }, video)?.code).toBe("duration-out-of-range");
    expect(validateToolAsset({ name: "a.mp4", bytes: 4096, declaredMime: "video/mp4", sniffedMime: "video/mp4", width: 1280, height: 720, durationMs: 30_000 }, video)).toBeNull();
});

test("validateToolAssetCount 达上限返回 count-limit", () => {
    expect(validateToolAssetCount(4, 5)).toBeNull();
    expect(validateToolAssetCount(5, 5)?.code).toBe("count-limit");
    expect(validateToolAssetCount(5, undefined)).toBeNull();
});

/* ----------------------------- 真实上传 ---------------------------- */

test("uploadToolAsset 真实读取字节、上报进度、落库并写索引", async () => {
    const records = memoryRecordStore();
    const progress: Array<{ phase: string; ratio: number; loaded: number }> = [];
    const storeCalls: Array<{ size: number; type: string; prefix: string }> = [];
    let storedBlobType = "";

    const record = await uploadToolAsset(makeFile("goods.png", pngBytes(64 * 1024), "image/png"), {
        constraints: DEFAULT_IMAGE_CONSTRAINTS,
        onProgress: (value) => progress.push({ phase: value.phase, ratio: value.ratio, loaded: value.loaded }),
        deps: {
            recordStore: records,
            store: async (blob, prefix) => {
                storedBlobType = blob.type;
                storeCalls.push({ size: blob.size, type: blob.type, prefix });
                return storedBlob(blob);
            },
            readDimensions: async () => ({ width: 1600, height: 1200 }),
        },
    });

    expect(storeCalls).toHaveLength(1);
    expect(storeCalls[0].prefix).toBe("tool-asset");
    expect(storeCalls[0].size).toBe(64 * 1024);
    expect(storedBlobType).toBe("image/png");
    expect(record.width).toBe(1600);
    expect(record.height).toBe(1200);
    expect(record.mimeType).toBe("image/png");
    expect(record.bytes).toBe(64 * 1024);
    expect(record.origin).toBe("local");
    expect(records.map.get(record.id)?.storageKey).toBe(record.storageKey);

    const phases = progress.map((entry) => entry.phase);
    expect(phases[0]).toBe("reading");
    expect(phases).toContain("storing");
    expect(phases[phases.length - 1]).toBe("done");
    const readingRatios = progress.filter((entry) => entry.phase === "reading").map((entry) => entry.ratio);
    expect(readingRatios.length).toBeGreaterThan(0);
    for (let index = 1; index < readingRatios.length; index += 1) expect(readingRatios[index]).toBeGreaterThanOrEqual(readingRatios[index - 1]);
    expect(readingRatios[readingRatios.length - 1]).toBe(1);
});

test("uploadToolAsset 以文件头为准（空 File.type 时仍能识别 PNG 并落库为 image/png）", async () => {
    const records = memoryRecordStore();
    const record = await uploadToolAsset(makeFile("no-mime", pngBytes(8192), ""), {
        deps: { recordStore: records, store: async (blob) => storedBlob(blob), readDimensions: async () => ({ width: 800, height: 600 }) },
    });
    expect(record.mimeType).toBe("image/png");
    expect(record.name).toBe("no-mime");
});

test("uploadToolAsset 拒绝改名文件（扩展名 png、真实 GIF）", async () => {
    const records = memoryRecordStore();
    let stored = false;
    let error: unknown;
    try {
        await uploadToolAsset(makeFile("renamed.png", gifBytes(), "image/png"), {
            deps: {
                recordStore: records,
                store: async (blob) => {
                    stored = true;
                    return storedBlob(blob);
                },
                readDimensions: async () => ({ width: 800, height: 600 }),
            },
        });
    } catch (caught) {
        error = caught;
    }
    expect(error).toBeInstanceOf(ToolAssetError);
    expect((error as ToolAssetError).code).toBe("mime-mismatch");
    expect(stored).toBe(false);
    expect(records.map.size).toBe(0);
});

test("uploadToolAsset 超出大小上限时在读取前失败（不上报 reading 进度、不落库）", async () => {
    const progress: string[] = [];
    let stored = false;
    let error: unknown;
    try {
        await uploadToolAsset(makeFile("big.png", pngBytes(2048), "image/png"), {
            constraints: { ...DEFAULT_IMAGE_CONSTRAINTS, maxBytes: 1024 },
            onProgress: (value) => progress.push(value.phase),
            deps: {
                store: async (blob) => {
                    stored = true;
                    return storedBlob(blob);
                },
                readDimensions: async () => ({ width: 1000, height: 1000 }),
            },
        });
    } catch (caught) {
        error = caught;
    }
    expect((error as ToolAssetError).code).toBe("too-large");
    expect(stored).toBe(false);
    expect(progress).toHaveLength(0);
});

test("uploadToolAsset 取消：读取中断报 aborted，且不落库", async () => {
    const controller = new AbortController();
    let stored = false;
    let error: unknown;
    try {
        await uploadToolAsset(makeFile("cancel.png", pngBytes(256 * 1024), "image/png"), {
            signal: controller.signal,
            onProgress: () => controller.abort(),
            deps: {
                store: async (blob) => {
                    stored = true;
                    return storedBlob(blob);
                },
                readDimensions: async () => ({ width: 1000, height: 1000 }),
            },
        });
    } catch (caught) {
        error = caught;
    }
    expect((error as ToolAssetError).code).toBe("aborted");
    expect(stored).toBe(false);
});

test("uploadToolAsset 落库后才取消：回滚已写入的 storageKey", async () => {
    const controller = new AbortController();
    const removed: string[][] = [];
    let error: unknown;
    try {
        await uploadToolAsset(makeFile("late.png", pngBytes(4096), "image/png"), {
            signal: controller.signal,
            deps: {
                store: async (blob) => {
                    controller.abort();
                    return { ...storedBlob(blob), storageKey: "tool-asset:late" };
                },
                removeStored: async (keys) => {
                    removed.push(keys);
                },
                readDimensions: async () => ({ width: 1200, height: 900 }),
            },
        });
    } catch (caught) {
        error = caught;
    }
    expect((error as ToolAssetError).code).toBe("aborted");
    expect(removed).toEqual([["tool-asset:late"]]);
});

test("uploadToolAsset 预先取消的 signal 直接拒绝", async () => {
    const controller = new AbortController();
    controller.abort();
    let error: unknown;
    try {
        await uploadToolAsset(makeFile("x.png", pngBytes(4096), "image/png"), { signal: controller.signal });
    } catch (caught) {
        error = caught;
    }
    expect((error as ToolAssetError).code).toBe("aborted");
});

test("uploadToolAsset 落库失败转成 store-failed", async () => {
    let error: unknown;
    try {
        await uploadToolAsset(makeFile("x.png", pngBytes(4096), "image/png"), {
            deps: {
                store: async () => {
                    throw new Error("QuotaExceededError");
                },
                readDimensions: async () => ({ width: 1200, height: 900 }),
            },
        });
    } catch (caught) {
        error = caught;
    }
    expect((error as ToolAssetError).code).toBe("store-failed");
    expect((error as ToolAssetError).message).toContain("本地库存");
});

/* --------------------------- 资产索引/恢复 -------------------------- */

test("loadToolAssetRecords 从索引恢复并重签 URL，丢失的 id 单独返回", async () => {
    const records = memoryRecordStore();
    const base: ToolAssetRecord = { id: "a1", kind: "image", name: "a.png", storageKey: "tool-asset:a1", url: "blob:old", bytes: 10, mimeType: "image/png", createdAt: "2026-10-28T00:00:00.000Z", origin: "local" };
    await records.set(base);
    await records.set({ ...base, id: "a2", storageKey: "tool-asset:a2" });

    const { records: restored, lostIds } = await loadToolAssetRecords(["a1", "a2", "missing"], {
        store: records,
        resolveUrl: async (storageKey) => (storageKey === "tool-asset:a1" ? "blob:fresh-a1" : storageKey === "tool-asset:a2" ? "blob:fresh-a2" : ""),
    });

    expect(restored.map((record) => record.id)).toEqual(["a1", "a2"]);
    expect(restored[0].url).toBe("blob:fresh-a1");
    expect(lostIds).toEqual(["missing"]);
});

test("loadToolAssetRecords：Blob 已被清理时把 id 归入 lostIds", async () => {
    const records = memoryRecordStore();
    await records.set({ id: "gone", kind: "image", name: "gone.png", storageKey: "tool-asset:gone", url: "blob:gone", bytes: 1, mimeType: "image/png", createdAt: "2026-10-28T00:00:00.000Z", origin: "local" });
    const { records: restored, lostIds } = await loadToolAssetRecords(["gone"], { store: records, resolveUrl: async () => "" });
    expect(restored).toHaveLength(0);
    expect(lostIds).toEqual(["gone"]);
});

test("removeToolAsset 同时清理索引与底层 Blob", async () => {
    const records = memoryRecordStore();
    await records.set({ id: "r1", kind: "image", name: "r.png", storageKey: "tool-asset:r1", url: "blob:r1", bytes: 1, mimeType: "image/png", createdAt: "2026-10-28T00:00:00.000Z", origin: "local" });
    const removedKeys: string[][] = [];
    await removeToolAsset({ id: "r1", storageKey: "tool-asset:r1", url: "blob:r1" }, { store: records, removeStored: async (keys) => { removedKeys.push(keys); } });
    expect(records.map.has("r1")).toBe(false);
    expect(removedKeys).toEqual([["tool-asset:r1"]]);
});

test("adoptLibraryAsset 复用资产库 storageKey，缺少键时拒绝", async () => {
    const records = memoryRecordStore();
    const record = await adoptLibraryAsset({ id: "lib-1", name: "作品图", url: "blob:lib", storageKey: "image:lib-1", kind: "image", bytes: 22, mimeType: "image/png" }, { store: records, newId: () => "adopted-1", now: () => "2026-10-28T01:00:00.000Z" });
    expect(record.id).toBe("adopted-1");
    expect(record.origin).toBe("library");
    expect(record.storageKey).toBe("image:lib-1");
    expect(records.map.get("adopted-1")?.name).toBe("作品图");

    await expect(adoptLibraryAsset({ id: "lib-2", name: "无键", url: "blob:x", kind: "image" }, { store: records })).rejects.toThrow();
});

/* ---------------------------- 草稿 / 多标签 -------------------------- */

test("草稿 patch 递增 revision 并写入值/资产 id", () => {
    const created = createToolDraft("SCALE_UP", { scale: "2k" }, ["a1"], () => "2026-10-28T02:00:00.000Z");
    expect(created.revision).toBe(1);
    const patched = applyToolDraftPatch(created, { values: { face: true }, assetIds: ["a1", "a2"] }, () => "2026-10-28T02:00:01.000Z");
    expect(patched.revision).toBe(2);
    expect(patched.values).toEqual({ scale: "2k", face: true });
    expect(patched.assetIds).toEqual(["a1", "a2"]);
    expect(patched.updatedAt).toBe("2026-10-28T02:00:01.000Z");
});

test("parseToolDraft 区分空/正常/损坏/版本不符", () => {
    expect(parseToolDraft(null, "SCALE_UP").status).toBe("empty");
    expect(parseToolDraft("{not json", "SCALE_UP").status).toBe("invalid");
    expect(parseToolDraft(JSON.stringify({ draftVersion: 0, toolId: "SCALE_UP" }), "SCALE_UP").status).toBe("version-mismatch");
    const good = createToolDraft("SCALE_UP");
    expect(parseToolDraft(JSON.stringify(good), "SCALE_UP").status).toBe("ok");
    expect(parseToolDraft(JSON.stringify(good), "CHANGE_COLOR").status).toBe("invalid");
});

test("loadToolDraft 把版本不符的旧草稿搬进隔离键，不载入当前表单", async () => {
    const legacy = JSON.stringify({ draftVersion: 0, toolId: "SCALE_UP", prompt: "old" });
    const storage = memoryDraftStorage({ [toolDraftKey("SCALE_UP")]: legacy });
    const result = await loadToolDraft("SCALE_UP", storage);
    expect(result.draft).toBeUndefined();
    expect(result.quarantine?.reason).toBe("version-mismatch");
    expect(storage.map.get(toolDraftQuarantineKey("SCALE_UP"))).toBe(legacy);
    expect(storage.map.has(toolDraftKey("SCALE_UP"))).toBe(false);
});

test("刷新恢复：persist 后重新 load 得到同样的 values / assetIds / revision", async () => {
    const storage = memoryDraftStorage();
    const draft = applyToolDraftPatch(createToolDraft("PRODUCT_IMAGE_SUITE", { prompt: "商品信息" }, ["a1", "a2"]), { values: { layout: "高级" } });
    const written = await persistToolDraft("PRODUCT_IMAGE_SUITE", draft, storage);
    expect(written.status).toBe("written");

    const reloaded = await loadToolDraft("PRODUCT_IMAGE_SUITE", storage);
    expect(reloaded.draft?.values).toEqual({ prompt: "商品信息", layout: "高级" });
    expect(reloaded.draft?.assetIds).toEqual(["a1", "a2"]);
    expect(reloaded.draft?.revision).toBe(draft.revision);
});

test("多标签冲突：落盘 revision 更新时不覆盖，返回 remote", async () => {
    const storage = memoryDraftStorage();
    const base = createToolDraft("SCALE_UP", { scale: "1k" }, []);
    const tabA = applyToolDraftPatch(base, { values: { scale: "2k" } });
    const tabB = applyToolDraftPatch(base, { values: { face: true } });
    expect((await persistToolDraft("SCALE_UP", tabA, storage)).status).toBe("written");

    const result = await persistToolDraft("SCALE_UP", tabB, storage);
    expect(result.status).toBe("conflict");
    if (result.status === "conflict") expect(result.remote.values).toEqual({ scale: "2k" });
    const onDisk = JSON.parse(storage.map.get(toolDraftKey("SCALE_UP")) as string) as ToolDraft;
    expect(onDisk.values).toEqual({ scale: "2k" });
});

test("decideRemoteDraft：无本地则采纳，旧版本忽略，本地脏则冲突", () => {
    const remote: ToolDraft = { ...createToolDraft("SCALE_UP", {}, []), revision: 3 };
    expect(decideRemoteDraft(undefined, remote, false)).toBe("adopt");
    expect(decideRemoteDraft({ ...remote, revision: 3 }, remote, true)).toBe("ignore");
    expect(decideRemoteDraft({ ...remote, revision: 2 }, remote, true)).toBe("conflict");
    expect(decideRemoteDraft({ ...remote, revision: 2 }, remote, false)).toBe("adopt");
});
