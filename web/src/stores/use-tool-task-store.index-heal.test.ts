/**
 * 索引自愈回归（2026-10-29 实测缺口）：
 * 真实 profile 里 localStorage 有 53 个 `tool-task:v1:task-*` 数据键，索引只剩 38 个 id，
 * 于是 15 条真实任务（PRINT_EXTRACT / HANDHELD_GOODS / AI_POSE_GENERATOR / FISSION_LINK /
 * SALE_VIDEO / AI_VIDEO_EDITING）在历史坞里永久不可见。旧 readPersistedTasks 只信索引 → 永不自愈。
 */
// store 的依赖链（gateway → i18n）在模块导入期就会读 localStorage，bun 无 DOM 需先打桩。
// bun 1.4 自带只读的 localStorage 全局，直接赋值会抛 readonly，必须用 defineProperty 覆盖。
{
    const map = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        writable: true,
        value: {
            getItem: (key: string) => map.get(key) ?? null,
            setItem: (key: string, value: string) => {
                map.set(key, value);
            },
            removeItem: (key: string) => {
                map.delete(key);
            },
            key: (index: number) => Array.from(map.keys())[index] ?? null,
            get length() {
                return map.size;
            },
            clear: () => map.clear(),
        },
    });
}

const { describe, expect, test } = (await import("bun:test" as string)) as {
    describe: (name: string, fn: () => void) => void;
    expect: (value: unknown) => {
        toBe: (expected: unknown) => void;
        toEqual: (expected: unknown) => void;
    };
    test: (name: string, fn: () => void) => void;
};

type ToolTaskStorage = {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
    key?: (index: number) => string | null;
    readonly length?: number;
};

const store = (await import("./use-tool-task-store")) as {
    TASK_INDEX_KEY: string;
    TASK_MAX_PERSISTED: number;
    taskStorageKey: (id: string) => string;
    readPersistedTasks: (storage: ToolTaskStorage) => Array<{ id: string; status: string }>;
    healTaskIndex: (storage: ToolTaskStorage) => { added: string[]; removed: string[] };
    persistTask: (task: unknown, storage: ToolTaskStorage) => void;
};

function fakeStorage(entries: Record<string, string> = {}): ToolTaskStorage & { dump: () => Record<string, string> } {
    const map = new Map<string, string>(Object.entries(entries));
    return {
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => {
            map.set(key, value);
        },
        removeItem: (key) => {
            map.delete(key);
        },
        key: (index) => Array.from(map.keys())[index] ?? null,
        get length() {
            return map.size;
        },
        dump: () => Object.fromEntries(map),
    };
}

function task(id: string, toolId: string, status: string, updatedAt: number) {
    return {
        id,
        toolId,
        status,
        capability: "image",
        prompt: `${toolId} 真实任务`,
        createdAt: updatedAt - 10,
        updatedAt,
        attempts: 1,
        pollCount: 0,
        transientFailures: 0,
    };
}

describe("task index self-heal", () => {
    test("索引丢失的真实任务仍能被读回（孤儿）", () => {
        const storage = fakeStorage({
            [store.TASK_INDEX_KEY]: JSON.stringify(["task-b"]),
            [store.taskStorageKey("task-a")]: JSON.stringify(task("task-a", "PRINT_EXTRACT", "unknown", 100)),
            [store.taskStorageKey("task-b")]: JSON.stringify(task("task-b", "IMAGE_TEXT_EDIT", "succeeded", 200)),
        });
        const tasks = store.readPersistedTasks(storage);
        expect(tasks.map((t) => t.id)).toEqual(["task-b", "task-a"]);
    });

    test("healTaskIndex 补回孤儿并剔除空指针 id", () => {
        const storage = fakeStorage({
            [store.TASK_INDEX_KEY]: JSON.stringify(["task-b", "task-ghost"]),
            [store.taskStorageKey("task-a")]: JSON.stringify(task("task-a", "HANDHELD_GOODS", "unknown", 100)),
            [store.taskStorageKey("task-b")]: JSON.stringify(task("task-b", "IMAGE_TEXT_EDIT", "succeeded", 200)),
        });
        const healed = store.healTaskIndex(storage);
        expect(healed.added).toEqual(["task-a"]);
        expect(healed.removed).toEqual(["task-ghost"]);
        expect(JSON.parse(storage.getItem(store.TASK_INDEX_KEY) as string)).toEqual(["task-b", "task-a"]);
    });

    test("无差异时不写索引（幂等）", () => {
        const storage = fakeStorage({
            [store.TASK_INDEX_KEY]: JSON.stringify(["task-a"]),
            [store.taskStorageKey("task-a")]: JSON.stringify(task("task-a", "REPLACE_GOODS", "succeeded", 100)),
        });
        const healed = store.healTaskIndex(storage);
        expect(healed.added.length).toBe(0);
        expect(healed.removed.length).toBe(0);
        expect(storage.getItem(store.TASK_INDEX_KEY)).toBe(JSON.stringify(["task-a"]));
    });

    test("persistTask 不会因为索引失配而丢历史（保留数量 ≥ 实测 53 条）", () => {
        const entries: Record<string, string> = {};
        for (let i = 0; i < 53; i += 1) {
            entries[store.taskStorageKey(`task-${i}`)] = JSON.stringify(task(`task-${i}`, "AI_POSE_GENERATOR", "failed", 1000 + i));
        }
        entries[store.TASK_INDEX_KEY] = JSON.stringify(["task-52"]);
        const storage = fakeStorage(entries);
        store.persistTask(task("task-new", "IMAGE_TEXT_EDIT", "succeeded", 9999), storage);
        const keys = Object.keys(storage.dump()).filter((k) => k.startsWith("tool-task:v1:task-"));
        // 53 条旧任务 + 1 条新任务全部保留（上限 100，不会被 50 的老上限砍掉真实历史）。
        expect(keys.length).toBe(54);
        expect(store.TASK_MAX_PERSISTED >= 54).toBe(true);
        const index = JSON.parse(storage.getItem(store.TASK_INDEX_KEY) as string) as string[];
        expect(index[0]).toBe("task-new");
        expect(index.length).toBe(54);
    });
});

export {};
