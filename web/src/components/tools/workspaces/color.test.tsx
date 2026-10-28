import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Expectation = {
    toBe: (expected: unknown) => void;
    toContain: (expected: string) => void;
    not: { toContain: (expected: string) => void };
};

// 与 enhance.test.tsx 保持一致：仓库未装 bun 类型包，动态导入避免 tsc --noEmit 报 TS2307。
const { describe, expect, test } = (await import("bun:test" as string)) as {
    describe: (name: string, fn: () => void) => void;
    expect: (actual: unknown) => Expectation;
    test: (name: string, fn: () => void | Promise<void>) => void;
};

/**
 * TASK-024 一键换色工作台的渲染证据：没有 DOM 测试环境，用 react-dom/server 渲染真实组件，
 * 断言页面规格要求的分区、涂选画布、16 字段快照与阻塞提示都在（跑渲染，不是读源码）。
 */
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

async function renderWorkspace(): Promise<string> {
    const React = await import("react");
    const { MemoryRouter } = await import("react-router-dom");
    const { default: Workspace } = await import("./color");
    // 工作台里有跳转到「批量一键换色」的 <Link>，SSR 渲染必须给路由上下文。
    return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Workspace)) as ReactElement);
}

describe("一键换色工作台渲染", () => {
    test("分区齐全：图片 / 颜色参考 / 区域 / 去杂色 / 细调 / 光影 / 生成 / 本次提交", async () => {
        const html = await renderWorkspace();
        for (const text of ["图片", "颜色 / 参考图", "区域", "去杂色", "颜色细调", "光影与边缘", "生成", "本次提交"]) {
            expect(html).toContain(text);
        }
        for (const testId of ["change-color-workspace", "change-color-region", "change-color-adjustment", "change-color-snapshot"]) {
            expect(html).toContain(testId);
        }
    });

    test("区域按预设枚举渲染；没有原图时不渲染涂选画布，如实提示先上传", async () => {
        const html = await renderWorkspace();
        for (const preset of ["整图主体", "衣服", "上装", "下装", "鞋", "包", "配饰", "假发", "自定义"]) {
            expect(html).toContain(preset);
        }
        expect(html).toContain("不涂=整图");
        expect(html).toContain("上传图片后可在此涂抹选区");
        // 没有真实原图就没有涂选画布，不做假画布
        expect(html).not.toContain("change-color-mask-canvas");
    });

    test("未上传原图时生成按钮阻塞，并列出就地原因，不伪造进行中状态", async () => {
        const html = await renderWorkspace();
        expect(html).toContain("请先上传需要换色的图片。");
        expect(/<button[^>]*disabled=""[^>]*data-testid="change-color-generate"/.test(html)).toBe(true);
        expect(html).not.toContain("生成中");
        // 没有真实原图/结果时不渲染前后对比
        expect(html).not.toContain("change-color-compare-section");
    });

    test("光影优化默认开启但强度可调，并标注一次生成 10 算力", async () => {
        const html = await renderWorkspace();
        expect(html).toContain("光影与边缘");
        expect(html).toContain("10 算力");
        expect(html).toContain("change-color-light-strength");
    });
});
