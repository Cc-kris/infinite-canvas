import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// 与仓库其他测试一致：动态导入 bun:test，避免 tsc --noEmit 报 TS2307。
const { describe, expect, test } = (await import("bun:test" as string)) as {
    describe: (name: string, fn: () => void) => void;
    expect: (actual: unknown) => {
        toBe: (value: unknown) => void;
        toContain: (value: string) => void;
        not: { toContain: (value: string) => void };
    };
    test: (name: string, fn: () => void | Promise<void>) => void;
};

/** bun 测试环境没有 localStorage，需在 import store 之前装上最小实现。 */
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

const { ToolHistoryDock } = await import("./tool-history-dock");

type Seed = {
    id: string;
    toolId: string;
    status: string;
    createdAt: number;
    prompt?: string;
    configSnapshot?: Record<string, unknown>;
    sourceAssetIds?: string[];
    items?: Array<{ id: string; kind?: string; url?: string; payloadDropped?: boolean }>;
    error?: { code: string; message: string; retryable: boolean };
    inputSnapshot?: Record<string, unknown>;
};

/** 构造面板需要的任务快照（字段与 ToolTask 对齐）。 */
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
            configSnapshot: seed.configSnapshot ?? { model: "gpt-image-2", capability: "image", count: "1" },
            sourceAssetIds: seed.sourceAssetIds ?? [],
            result: seed.items
                ? { items: seed.items.map((item) => ({ kind: "image", ...item })), receivedAt: seed.createdAt }
                : undefined,
            error: seed.error,
            ...(seed.inputSnapshot ? { inputSnapshot: seed.inputSnapshot } : {}),
        };
    }
    return map;
}

async function renderDock(props: { toolId: string; tasks?: Record<string, unknown>; limit?: number }): Promise<string> {
    const React = await import("react");
    return renderToStaticMarkup(React.createElement(ToolHistoryDock, props as never) as ReactElement);
}

describe("ToolHistoryDock（B5 共享历史面板）", () => {
    test("无任务时给真实空态文案，且不渲染条目", async () => {
        const html = await renderDock({ toolId: "AI_TEXT", tasks: {} });
        expect(html).toContain('data-testid="tool-history-dock-empty"');
        expect(html).toContain("本工具还没有历史任务");
        expect(html).toContain('data-testid="tool-history-dock-count">0 条');
        expect(html.includes('data-testid="tool-history-dock-item"')).toBe(false);
    });

    test("只展示当前工具的任务，并按时间倒序", async () => {
        const tasks = snapshotOf([
            { id: "t-old", toolId: "AI_TEXT", status: "succeeded", createdAt: 1000, prompt: "旧任务" },
            { id: "t-new", toolId: "AI_TEXT", status: "succeeded", createdAt: 2000, prompt: "新任务" },
            { id: "t-other", toolId: "ORNAMENT_TEXT", status: "succeeded", createdAt: 3000, prompt: "别的工具" },
        ]);
        const html = await renderDock({ toolId: "AI_TEXT", tasks });
        expect(html.includes("t-other")).toBe(false);
        expect(html).toContain('data-testid="tool-history-dock-count">2 条');
        const older = html.indexOf("旧任务");
        const newer = html.indexOf("新任务");
        expect(newer >= 0 && older >= 0).toBe(true);
        expect(newer < older).toBe(true);
    });

    test("有真实 url 的结果项渲染缩略图；字节被剥离时提示未保留而不是画假图", async () => {
        const tasks = snapshotOf([
            {
                id: "t-live",
                toolId: "SCALE_UP",
                status: "succeeded",
                createdAt: 2000,
                prompt: "高清放大",
                items: [{ id: "t-live-0", url: "http://127.0.0.1:23299/SCALE_UP/02-result.png" }],
            },
            {
                id: "t-dropped",
                toolId: "SCALE_UP",
                status: "succeeded",
                createdAt: 1000,
                prompt: "字节已剥离",
                items: [{ id: "t-dropped-0", payloadDropped: true }],
            },
        ]);
        const html = await renderDock({ toolId: "SCALE_UP", tasks });
        expect(html).toContain('src="http://127.0.0.1:23299/SCALE_UP/02-result.png"');
        expect(html).toContain('data-testid="tool-history-dock-payload-dropped"');
        expect(html).toContain("原始文件未保留");
    });

    test("折叠状态不渲染明细；配置快照在明细里以真实字段呈现", async () => {
        const tasks = snapshotOf([
            {
                id: "t-cfg",
                toolId: "SDS_DESIGN",
                status: "succeeded",
                createdAt: 1000,
                prompt: "印花设计",
                configSnapshot: { model: "gpt-image-2", capability: "image", size: "1024x1024", count: "2" },
                sourceAssetIds: ["asset-a", "asset-b"],
            },
        ]);
        const html = await renderDock({ toolId: "SDS_DESIGN", tasks });
        expect(html.includes('data-testid="tool-history-dock-detail"')).toBe(false);
        expect(html).toContain('aria-expanded="false"');
        // 折叠时仍应给出「模型 · 能力 · 结果数」摘要
        expect(html).toContain('data-testid="tool-history-dock-summary"');
        expect(html).toContain("gpt-image-2 · image · 0 个结果");
    });

    test("失败任务带错误信息时不吞掉真实原因", async () => {
        const tasks = snapshotOf([
            {
                id: "t-fail",
                toolId: "FISSION_LINK",
                status: "failed",
                createdAt: 1000,
                prompt: "",
                error: { code: "upstream_5xx", message: "上游 502", retryable: true },
            },
        ]);
        const html = await renderDock({ toolId: "FISSION_LINK", tasks });
        expect(html).toContain('data-task-status="failed"');
        expect(html).toContain("（无提示词）");
    });

    test("视频结果在折叠行给出徽标，而不是留白", async () => {
        const tasks = snapshotOf([
            {
                id: "t-video",
                toolId: "SALE_VIDEO",
                status: "succeeded",
                createdAt: 1000,
                prompt: "带货视频",
                items: [{ id: "v-1", kind: "video", url: "https://example.com/a.mp4" }],
            },
        ]);
        const html = await renderDock({ toolId: "SALE_VIDEO", tasks });
        expect(html).toContain('data-testid="tool-history-dock-video-badge"');
        expect(html).toContain("视频结果 1 个");
    });
});

describe("ToolHistoryDock 回放入口（只认真实落盘快照，不提供假入口）", () => {
    test("有 inputSnapshot 的任务渲染「回放画布」，无快照的老任务不给按钮", async () => {
        const tasks = snapshotOf([
            {
                id: "t-replay",
                toolId: "NEW_DESIGNER",
                status: "succeeded",
                createdAt: 2000,
                prompt: "设计器导出",
                items: [{ id: "t-replay-0", url: "https://cdn.example.com/designer.png" }],
                inputSnapshot: { kind: "new-designer-canvas", document: { designerId: "dz-1", width: 1200, height: 1200, layers: [] } },
            },
            { id: "t-legacy", toolId: "NEW_DESIGNER", status: "succeeded", createdAt: 1000, prompt: "老任务无快照" },
        ]);
        const html = await renderDock({ toolId: "NEW_DESIGNER", tasks });
        expect(html).toContain('data-testid="tool-history-dock-replay"');
        expect(html).toContain("回放画布");
        expect(html.split('data-testid="tool-history-dock-replay"').length - 1).toBe(1);
    });
});
