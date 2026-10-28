import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Expectation = {
    toBe: (expected: unknown) => void;
    toContain: (expected: string) => void;
    not: { toContain: (expected: string) => void };
};

// 运行时未装 bun 类型包，按 tool-shell.test.tsx 的做法动态导入，避免 tsc --noEmit 报 TS2307。
const { describe, expect, test } = (await import("bun:test" as string)) as {
    describe: (name: string, fn: () => void) => void;
    expect: (actual: unknown) => Expectation;
    test: (name: string, fn: () => void | Promise<void>) => void;
};

/**
 * TASK-008 工作台的渲染证据：仓库没有 DOM 测试环境，用 react-dom/server 渲染真实标记
 * 断言页面规格要求的分区、枚举、限制文案与校验提示都在（不是读源码，而是跑渲染）。
 */
const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
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
    const { default: Workspace } = await import("./suite");
    return renderToStaticMarkup(React.createElement(Workspace) as ReactElement);
}

describe("商品套图工作台渲染", () => {
    test("分区齐全：商品图 / 商品信息 / 品牌基因 / 生成参数 / A+ / 主副图 / 提交区", async () => {
        const html = await renderWorkspace();
        for (const text of ["商品图", "商品信息", "品牌基因", "生成参数", "A+ 图", "主副图", "预计生成", "开始生成"]) {
            expect(html).toContain(text);
        }
    });

    test("枚举与限制按页面规格渲染（10M、384–4096px、5 比例、4 档分辨率）", async () => {
        const html = await renderWorkspace();
        expect(html).toContain("JPG/PNG/WEBP · ≤10M · 384–4096px · 宽高比 ≤5:1");
        for (const ratio of ["1:1", "3:4", "4:3", "2:3", "3:2"]) expect(html).toContain(ratio);
        for (const resolution of ["1K", "2K", "4K"]) expect(html).toContain(resolution);
        for (const module of ["卖点图", "白底图", "场景图", "特写图", "特写白底图"]) expect(html).toContain(module);
        for (const aplus of ["高级A+", "手机A+", "普通A+", "自定比例"]) expect(html).toContain(aplus);
    });

    test("未上传商品图 / 未选类型时给出真实校验提示，而不是伪造可生成", async () => {
        const html = await renderWorkspace();
        expect(html).toContain("请先上传商品图");
        expect(html).toContain("请至少选择一个生成类型");
        expect(html).not.toContain("生成中");
    });
});
