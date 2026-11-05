import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Expectation = { toBe: (expected: unknown) => void; toContain: (expected: string) => void; not: { toContain: (expected: string) => void } };

// 与 suite.test.tsx 同法：动态导入 bun:test，避免 tsc 报 TS2307。
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

async function render(load: () => Promise<{ default: unknown }>): Promise<string> {
    const React = await import("react");
    const { MemoryRouter } = await import("react-router-dom");
    const { default: Workspace } = await load();
    return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Workspace as () => ReactElement)) as ReactElement);
}

const dots = (html: string) => html.split('data-testid="tool-case-guide-dot"').length - 1;

/** 电商套图族空态与原站 1:1（2026-11-05 原站只读实测，见 docs/V1.0/e2e-1to1/20261105/agents/agent-lf-suite.md）。 */
describe("电商套图族空态", () => {
    test("服装套图：上传卡内或试试这些 + 生成结果/优秀案例页签 + 3 案例轮播；无自造步骤条与优秀案例分区", async () => {
        const html = await render(() => import("./dress-suite"));
        expect(html).toContain("或试试这些");
        expect(html).toContain('data-testid="dress-suite-sample-clothing-suite-sample-2"');
        expect(html).toContain('data-testid="dress-suite-tab-cases"');
        expect(html).toContain("上传服装图");
        expect(dots(html)).toBe(3);
        expect(html).not.toContain("我是高手，不再提醒");
        expect(html).not.toContain("还没有结果。上传服装图");
    });

    test("套图换色：单张案例轮播（卡内标题 + 6 个分页点），无数字分页与结果区上传卡", async () => {
        const html = await render(() => import("./color-v2"));
        expect(html).toContain("上传整套商品图，批量生成多色变体结果");
        expect(html).toContain('data-testid="tool-case-guide"');
        expect(dots(html)).toBe(6);
        expect(html).not.toContain('data-testid="color-v2-pagination"');
        expect(html).not.toContain("第一步：上传 1 张需要换色的商品图片");
    });

    test("批量翻译：只有「生成结果」页签 + 历史记录入口，空态是静态示意海报，无空折叠行", async () => {
        const html = await render(async () => ({ default: (await import("./translate")).TranslateWorkspace }));
        expect(html).toContain('data-testid="translate-tab-result"');
        expect(html).not.toContain('data-testid="translate-tab-history"');
        expect(html).toContain('data-testid="translate-history-link"');
        expect(html).toContain("/__cases/image-translation/poster-translation.png");
        expect(html).toContain("快速翻译成多语言，快速上架");
        expect(html).not.toContain('aria-label="校对"');
        expect(html).not.toContain('aria-label="更多"');
    });
});
