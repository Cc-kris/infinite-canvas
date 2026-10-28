import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Expectation = {
    toBe: (expected: unknown) => void;
    toContain: (expected: string) => void;
    not: { toContain: (expected: string) => void };
};

// 与 suite.test.tsx 保持一致：仓库未装 bun 类型包，动态导入避免 tsc --noEmit 报 TS2307。
const { describe, expect, test } = (await import("bun:test" as string)) as {
    describe: (name: string, fn: () => void) => void;
    expect: (actual: unknown) => Expectation;
    test: (name: string, fn: () => void | Promise<void>) => void;
};

/**
 * TASK-012 高清放大工作台的渲染证据：没有 DOM 测试环境，用 react-dom/server 渲染真实组件，
 * 断言页面规格要求的分区、模式枚举、限制文案与阻塞提示都在（跑渲染，不是读源码）。
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
    const { default: Workspace } = await import("./enhance");
    return renderToStaticMarkup(React.createElement(Workspace) as ReactElement);
}

describe("高清放大工作台渲染", () => {
    test("分区齐全：原图 / 放大模式 / 增强选项 / 生成 / 结果", async () => {
        const html = await renderWorkspace();
        for (const text of ["原图", "放大模式", "增强选项", "面部美化", "质量增强档位", "输出尺寸", "开始放大"]) {
            expect(html).toContain(text);
        }
    });

    test("四种模式与三档质量按页面规格渲染，并标注 4096 上限", async () => {
        const html = await renderWorkspace();
        for (const mode of ["变高清", "高清 + 2倍放大", "高清 + 4倍放大", "自定义"]) expect(html).toContain(mode);
        for (const quality of ["低", "中", "高"]) expect(html).toContain(quality);
        expect(html).toContain(`JPG/PNG/WEBP · ≤4096×4096`);
    });

    test("未上传原图时不编造输出尺寸，生成按钮阻塞且没有伪造进行中状态", async () => {
        const html = await renderWorkspace();
        expect(html).toContain("待上传原图");
        expect(html).toContain("请先上传原图");
        expect(/<button[^>]*disabled=""[^>]*data-testid="scale-up-generate"/.test(html)).toBe(true);
        expect(html).not.toContain("生成中");
        // 未上传时不渲染前后对比（对比需要真实原图与真实结果）
        expect(html).not.toContain("scale-up-compare");
    });
});
