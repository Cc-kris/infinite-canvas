import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Expectation = {
    toBe: (expected: unknown) => void;
    toBeGreaterThan: (expected: number) => void;
    toContain: (expected: string) => void;
    not: { toContain: (expected: string) => void };
};

// 与 suite.test.tsx / enhance.test.tsx 一致：仓库未装 bun 类型包，动态导入避免 tsc 报 TS2307。
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

/**
 * TASK-014 局部重绘工作台的渲染证据：没有 DOM 测试环境，用 react-dom/server 渲染真实组件，
 * 断言页面规格要求的涂抹工具条、描述/张数表单、结果区与阻塞状态都在（跑渲染，不是读源码）。
 */
async function renderWorkspace(): Promise<string> {
    const React = await import("react");
    const { MemoryRouter } = await import("react-router");
    const { default: Workspace } = await import("./mask");
    // 工作台带「本页路由」链接，需要 Router 上下文；真实页面里由路由树提供，测试里用 MemoryRouter 顶替。
    return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Workspace)) as ReactElement);
}

describe("局部重绘工作台渲染", () => {
    test("分区齐全：涂抹画布 / 重绘描述 / 生成张数 / 结果", async () => {
        const html = await renderWorkspace();
        for (const text of ["重绘描述", "生成张数", "结果", "立即生成"]) expect(html).toContain(text);
        for (const id of ["area-repair-workspace", "mask-toolbar", "area-repair-prompt", "area-repair-output-num"]) {
            expect(html).toContain(`data-testid="${id}"`);
        }
        expect(html).toContain("涂抹需要改变的区域");
    });

    test("涂抹工具齐全：画笔 / 橡皮 / 羽化 / 自动扩边 / 反选 / 撤销 / 重做 / 重置", async () => {
        const html = await renderWorkspace();
        for (const testId of ["mask-tool-brush", "mask-tool-eraser", "mask-brush-size", "mask-feather", "mask-auto-expand", "mask-invert", "mask-undo", "mask-redo", "mask-reset"]) {
            expect(html).toContain(`data-testid="${testId}"`);
        }
        for (const text of ["画笔", "橡皮", "羽化", "撤销", "重做", "重置"]) expect(html).toContain(text);
    });

    test("未上传原图 / 未涂抹时不编造可提交状态：按钮阻塞、无结果、无进行中", async () => {
        const html = await renderWorkspace();
        // 属性顺序不稳定，两种顺序都算阻塞
        const submitDisabled = /data-testid="area-repair-submit"[^>]*disabled=""/.test(html) || /disabled=""[^>]*data-testid="area-repair-submit"/.test(html);
        expect(submitDisabled).toBe(true);
        expect(html).not.toContain("生成中");
        expect(html).not.toContain('data-testid="area-repair-results"');
        expect(html).toContain("还没有结果");
        expect(html).toContain("请先上传要重绘的图片");
        expect(html).toContain("请先在图片上涂抹需要重绘的区域");
        expect(html).toContain("请填写重绘描述");
    });

    test("空蒙版给出涂抹指引与覆盖率，而不是空白画布", async () => {
        const html = await renderWorkspace();
        expect(html).toContain("上传图片后即可在图上涂抹需要重绘的区域");
        expect(html).toContain("蒙版随原图一起发给模型");
        expect(html).toContain('data-testid="mask-coverage"');
        expect(html).toContain("尚未涂抹");
        // 没有原图时不应出现蒙版画布（画布依赖真实尺寸）
        expect(html).not.toContain('data-testid="mask-canvas"');
    });
});
