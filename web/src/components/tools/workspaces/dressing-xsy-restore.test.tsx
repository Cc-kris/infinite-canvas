import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Expectation = {
    toBe: (expected: unknown) => void;
    toContain: (expected: string) => void;
    not: { toContain: (expected: string) => void };
};

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
        clear: () => values.clear(),
        key: (index: number) => Array.from(values.keys())[index] ?? null,
        get length() {
            return values.size;
        },
    },
});

/**
 * 刷新恢复回归（真实跑批 2026-10-29 暴露）：
 * 任务已持久化、历史坞里有 1 条「已完成」，但工作区结果区只读内存里的 outcome，
 * 刷新后结果区空白，下载/存资产/发画布全都没了。
 * 修复点 = 结果图在 outcome 为空时回落到持久化任务里的图（xsyDisplayImages）。
 */
describe("AI 试衣 XSY 刷新恢复", () => {
    test("刷新后（outcome 为空）结果图回落到持久化任务里的图", async () => {
        const { xsyDisplayImages } = await import("@/features/tools/adapters/ai-dressing-xsy");
        const restored = [{ url: "blob:http://127.0.0.1:3000/restored-result", mimeType: "image/png" }];
        expect(xsyDisplayImages(undefined, restored)).toBe(restored);
        expect(xsyDisplayImages([], restored)).toBe(restored);
    });

    test("本会话已有真实结果时以实时结果为准，不被旧任务覆盖", async () => {
        const { xsyDisplayImages } = await import("@/features/tools/adapters/ai-dressing-xsy");
        const live = [{ url: "blob:http://127.0.0.1:3000/live-result" }];
        const restored = [{ url: "blob:http://127.0.0.1:3000/old-result" }];
        expect(xsyDisplayImages(live, restored)).toBe(live);
    });

    test("工作台首屏没有结果时不编造结果区/下载入口", async () => {
        const React = await import("react");
        const { MemoryRouter } = await import("react-router-dom");
        const { default: Workspace } = await import("./dressing-xsy");
        const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Workspace)) as ReactElement);
        expect(html).toContain('data-testid="xsy-result-empty"');
        expect(html).toContain('data-testid="tool-result-empty"');
        expect(html).not.toContain('data-testid="tool-result-download-0"');
    });
});
