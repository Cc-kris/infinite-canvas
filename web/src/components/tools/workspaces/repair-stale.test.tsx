export {};

type Expectation = { toBe: (expected: unknown) => void };

// 与 crop.test.tsx 一致：仓库未装 bun 类型包，动态导入避免 tsc 报 TS2307。
const { describe, expect, test } = (await import("bun:test" as string)) as {
    describe: (name: string, fn: () => void) => void;
    expect: (actual: unknown) => Expectation;
    test: (name: string, fn: () => void | Promise<void>) => void;
};

const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => void values.set(key, value),
        removeItem: (key: string) => void values.delete(key),
        clear: () => void values.clear(),
        key: (index: number) => Array.from(values.keys())[index] ?? null,
        get length() {
            return values.size;
        },
    },
});

/** 手部修复「来自旧版本输入」误报：提交后未改输入时不得判为过期。 */
describe("HAND_REPAIR 结果过期判定", () => {
    const image = { id: "asset-1", name: "hand.png", dataUrl: "data:image/png;base64,AAAA", width: 1024, height: 1024 };

    test("提交后未改输入不判过期；改输入才判过期", async () => {
        const { handRepairInputFingerprint } = await import("./repair");
        const { buildHandRepairSnapshot, createHandRepairState, isHandRepairSnapshotStale } = await import(
            "@/features/tools/registry/hand-repair"
        );
        const state = {
            ...createHandRepairState(),
            strokes: [{ id: "s1", tool: "brush" as const, size: 40, points: [{ x: 0.2, y: 0.3 }, { x: 0.4, y: 0.5 }] }],
        };

        // 回归：完整提交快照带 maskDataUrl / draftRevision / clientOperationId，和预览比必然不等。
        const commitSnapshot = buildHandRepairSnapshot({
            imageAssetId: image.id,
            imageName: image.name,
            imageWidth: image.width,
            imageHeight: image.height,
            state,
            maskDataUrl: "data:image/png;base64,MASK",
            draftRevision: 3,
            clientOperationId: "op-1",
        });
        expect(isHandRepairSnapshotStale(commitSnapshot, handRepairInputFingerprint(image, state))).toBe(true);

        // 修复后：提交时记录的是输入指纹，草稿 revision 递增等提交期变化不影响判定。
        const runSnapshot = handRepairInputFingerprint(image, state);
        expect(isHandRepairSnapshotStale(runSnapshot, handRepairInputFingerprint(image, { ...state }))).toBe(false);
        expect(isHandRepairSnapshotStale(runSnapshot, handRepairInputFingerprint(image, { ...state, outputNum: state.outputNum + 1 }))).toBe(true);
        expect(isHandRepairSnapshotStale(runSnapshot, handRepairInputFingerprint({ ...image, id: "asset-2" }, state))).toBe(true);
    });
});
