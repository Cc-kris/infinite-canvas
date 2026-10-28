import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// 与仓库其他测试一致：动态导入 bun:test，避免 tsc --noEmit 报 TS2307。
const { describe, expect, test } = (await import("bun:test" as string)) as {
    describe: (name: string, fn: () => void) => void;
    expect: (actual: unknown) => {
        toBe: (value: unknown) => void;
        toContain: (value: string) => void;
    };
    test: (name: string, fn: () => void | Promise<void>) => void;
};

/**
 * bun 测试环境没有 localStorage，而 store/i18n 在模块加载期就会读取它。
 * 提供最小内存实现，必须在 import store 之前执行。
 */
function installMemoryStorage(key: string) {
    const bag = new Map<string, string>();
    const storage = {
        getItem: (name: string) => bag.get(name) ?? null,
        setItem: (name: string, value: string) => void bag.set(name, String(value)),
        removeItem: (name: string) => void bag.delete(name),
        clear: () => bag.clear(),
        key: (index: number) => Array.from(bag.keys())[index] ?? null,
        get length() {
            return bag.size;
        },
    };
    Object.defineProperty(globalThis, key, { value: storage, configurable: true, writable: true });
}

installMemoryStorage("localStorage");
installMemoryStorage("sessionStorage");

const { ToolTaskHistory, formatTaskTime } = await import("./tool-task-history");

type Seed = {
    id: string;
    toolId: string;
    status: string;
    createdAt: number;
    prompt?: string;
    items?: Array<{ id: string; kind: string; url?: string; payloadDropped?: boolean }>;
};

/** 构造 history 需要的任务快照（字段与 ToolTask 对齐，多余的 result 结构保持真实形状）。 */
function snapshotOf(seeds: Seed[]): Record<string, unknown> {
    const map: Record<string, unknown> = {};
    for (const seed of seeds) {
        map[seed.id] = {
            id: seed.id,
            toolId: seed.toolId,
            status: seed.status,
            createdAt: seed.createdAt,
            updatedAt: seed.createdAt,
            prompt: seed.prompt ?? "",
            capability: "image",
            configSnapshot: { model: "gpt-image-2" },
            result: seed.items
                ? { items: seed.items.map((item) => item.kind ? item : { ...item, kind: "image" }) }
                : undefined,
        };
    }
    return map;
}

async function renderHistory(props: {
    toolId: string;
    tasks?: Record<string, unknown>;
    onSelectTask?: (task: unknown) => void;
}): Promise<string> {
    const React = await import("react");
    return renderToStaticMarkup(React.createElement(ToolTaskHistory, props as never) as ReactElement);
}

describe("工具历史记录", () => {
    test("没有历史任务时如实提示，不编造条目", async () => {
        const html = await renderHistory({ toolId: "change-color", tasks: {} });
        expect(html).toContain("本工具还没有历史任务");
        expect(html).toContain("0 条");
        expect(html.includes("tool-task-history-item")).toBe(false);
    });

    test("只列本工具的任务，并按时间倒序", async () => {
        const tasks = snapshotOf([
            { id: "t-old", toolId: "change-color", status: "succeeded", createdAt: 1000, prompt: "旧任务" },
            { id: "t-new", toolId: "change-color", status: "succeeded", createdAt: 2000, prompt: "新任务" },
            { id: "t-other", toolId: "product-refine", status: "succeeded", createdAt: 3000, prompt: "别的工具" },
        ]);
        const html = await renderHistory({ toolId: "change-color", tasks });
        expect(html).toContain("新任务");
        expect(html).toContain("旧任务");
        expect(html.includes("别的工具")).toBe(false);
        expect(html.indexOf("新任务") < html.indexOf("旧任务")).toBe(true);
        expect(html).toContain("2 条");
    });

    test("有可回取 URL 的结果才给缩略图与「查看结果」，二进制被剥离时如实说明", async () => {
        const tasks = snapshotOf([
            {
                id: "t-url",
                toolId: "change-color",
                status: "succeeded",
                createdAt: 2000,
                prompt: "带 URL 结果",
                items: [{ id: "i1", kind: "image", url: "https://example.com/result.png" }],
            },
            {
                id: "t-dropped",
                toolId: "change-color",
                status: "succeeded",
                createdAt: 1000,
                prompt: "只剩元数据",
                items: [{ id: "i2", kind: "image", payloadDropped: true }],
            },
        ]);
        const html = await renderHistory({ toolId: "change-color", tasks, onSelectTask: () => undefined });
        expect(html).toContain("https://example.com/result.png");
        // 只有能回取 URL 的那条才有「查看结果」
        expect(html.split("查看结果").length - 1).toBe(1);
        expect(html).toContain("原始文件未保留");
    });

    test("limit 生效，最多只渲染 N 条", async () => {
        const tasks = snapshotOf(
            Array.from({ length: 5 }, (_, index) => ({
                id: `t-${index}`,
                toolId: "change-color",
                status: "succeeded",
                createdAt: 1000 + index,
                prompt: `任务 ${index}`,
            })),
        );
        const html = await renderHistory({ toolId: "change-color", tasks, limit: 2 } as never);
        expect(html.split("tool-task-history-item").length - 1).toBe(2);
        expect(html).toContain("任务 4");
        expect(html.includes("任务 0")).toBe(false);
    });

    test("时间格式固定，不依赖 locale", () => {
        expect(formatTaskTime(0)).toBe("—");
        expect(formatTaskTime(1_790_000_000_000).length).toBe(16);
    });
});
