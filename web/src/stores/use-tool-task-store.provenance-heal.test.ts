/**
 * 结果字节持久化共同根因回归（2026-10-29 r14h 复核后修复）：
 *
 * 现场：CCV2 / REMOVE_PEN 有真实 succeeded 任务（task-mvsc4fyg-qobp8k 等），
 * 但快照里 result.items 只剩 `{ id, kind, payloadDropped: true }`，IndexedDB 里也没有可归属的字节。
 * 三条链路分别丢了同一份真实字节：
 *   1) mapper（image.ts / gateway）上游同时给 b64 与 https 时只留 b64 → 刷新后无地址；
 *   2) 入库键名 `tool-result:<nanoid>` 不含任务信息 → 快照被剥后无法按 provenance 反查；
 *   3) upsert 允许同 receivedAt 的无 storageKey 副本覆盖已入库项 → 字节在盘上却查不到。
 *
 * 运行：cd web && bun test src/stores/use-tool-task-store.provenance-heal.test.ts
 */
const memoryKv = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
        getItem: (key: string) => memoryKv.get(key) ?? null,
        setItem: (key: string, value: string) => {
            memoryKv.set(key, String(value));
        },
        removeItem: (key: string) => {
            memoryKv.delete(key);
        },
        clear: () => memoryKv.clear(),
        key: (index: number) => [...memoryKv.keys()][index] ?? null,
        get length() {
            return memoryKv.size;
        },
    },
});

import { expect, test } from "bun:test";

const { healResultMediaByProvenance, mergeWithoutStorageKeyDowngrade } = await import("./use-tool-task-store");
const { imageResultItems } = await import("@/services/api/tools/gateway");
const { sanitizeTaskForPersist } = await import("@/services/api/tools/task-machine");
type ToolTask = import("@/services/api/tools/task-machine").ToolTask;

const OSS = "https://oss-us.dimenoss.com/images/2026/10/29/1793203892_6c7955f59b8ec82c2cc396916a3dffef.png";

function taskWith(items: Array<Record<string, unknown>>, receivedAt = 7): ToolTask {
    return { id: "task-provenance", status: "succeeded", result: { items, receivedAt } } as unknown as ToolTask;
}

test("上游同时给 b64 与 https 时两个来源都保留，快照剥离后仍有可再取的地址", () => {
    const items = imageResultItems("task-x", [{ id: "r1", dataUrl: "data:image/png;base64,AAAA", url: OSS }]);
    expect(items).toEqual([{ id: "task-x-0", kind: "image", dataUrl: "data:image/png;base64,AAAA", url: OSS }]);

    const persisted = sanitizeTaskForPersist(taskWith(items));
    // dataUrl 被剥（避免 localStorage 撑爆），但持久地址必须留住且不能被误标为丢字节。
    expect(persisted.result?.items[0].dataUrl).toBeUndefined();
    expect(persisted.result?.items[0].url).toBe(OSS);
    expect(persisted.result?.items[0].payloadDropped).toBeFalsy();
});

test("快照被剥成 payloadDropped 后，按 taskId provenance 从 IndexedDB 找回真实字节", async () => {
    const stripped = taskWith([{ id: "task-provenance-0", kind: "image", payloadDropped: true }]);
    const healed = await healResultMediaByProvenance(stripped, async (taskId) =>
        taskId === "task-provenance"
            ? [{ storageKey: "tool-result:task-provenance:0:abc123", index: 0, bytes: 850_799, mimeType: "image/png" }]
            : [],
    );
    expect(healed?.result?.items[0]).toEqual({
        id: "task-provenance-0",
        kind: "image",
        storageKey: "tool-result:task-provenance:0:abc123",
        bytes: 850_799,
        mimeType: "image/png",
        payloadDropped: false,
    });
});

test("IDB 里没有真实字节时不伪造，自愈保持空操作", async () => {
    const stripped = taskWith([{ id: "task-provenance-0", kind: "image", payloadDropped: true }]);
    const healed = await healResultMediaByProvenance(stripped, async () => []);
    expect(healed).toBeNull();
});

test("同一结果里已有 storageKey 不会被无 storageKey 的副本降级覆盖", () => {
    const current = taskWith([{ id: "i0", kind: "image", storageKey: "tool-result:task-provenance:0:abc123", bytes: 850_799 }]);
    const incoming = taskWith([{ id: "i0", kind: "image", payloadDropped: true }]);
    const merged = mergeWithoutStorageKeyDowngrade(current, incoming);
    expect(merged.result?.items[0].storageKey).toBe("tool-result:task-provenance:0:abc123");
    expect(merged.result?.items[0].bytes).toBe(850_799);
    expect(merged.result?.items[0].payloadDropped).toBe(false);
});

test("不同结果批次（receivedAt 不同）不做合并，保留新结果", () => {
    const current = taskWith([{ id: "i0", kind: "image", storageKey: "old" }], 1);
    const incoming = taskWith([{ id: "i0", kind: "image", payloadDropped: true }], 2);
    expect(mergeWithoutStorageKeyDowngrade(current, incoming)).toBe(incoming);
});
