import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Expectation = {
    toBe: (expected: unknown) => void;
    toContain: (expected: string) => void;
    not: { toContain: (expected: string) => void };
};

// 与 suite.test.tsx / enhance.test.tsx 保持一致：仓库未装 bun 类型包，动态导入避免 tsc --noEmit 报 TS2307。
const { describe, expect, test } = (await import("bun:test" as string)) as {
    describe: (name: string, fn: () => void) => void;
    expect: (actual: unknown) => Expectation;
    test: (name: string, fn: () => void | Promise<void>) => void;
};

/**
 * TASK-013 智能扩图工作台的渲染证据（AC-021）：
 * 仓库没有 DOM 测试环境，用 react-dom/server 渲染真实组件，断言
 *  - 页面分区是本页独有的「原图 / 扩展画布 / 生成」，不是通用任务卡片；
 *  - 四条拖拽边界真实存在，且带 role=slider + aria-valuenow（40px 热区 + 键盘微调）；
 *  - 原图默认锁定、未上传时生成按钮禁用（不会伪造可生成状态）；
 *  - 撤销/重做按钮存在且初始禁用（历史栈为空）。
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
    const { OutpaintWorkspace } = await import("./outpaint");
    return renderToStaticMarkup(React.createElement(OutpaintWorkspace) as ReactElement);
}

function attr(html: string, testId: string): string {
    // React 会重排属性顺序（role/aria/disabled 在 data-testid 之前），必须抓整个标签。
    const match = new RegExp(`<[a-z][^>]*data-testid="${testId}"[^>]*>`).exec(html);
    return match ? match[0] : "";
}

describe("智能扩图工作台渲染", () => {
    test("本页独有分区齐全：原图 / 扩展画布 / 生成", async () => {
        const html = await renderWorkspace();
        expect(html).toContain("1 · 原图");
        expect(html).toContain("2 · 扩展画布");
        expect(html).toContain("3 · 生成");
        expect(html).toContain("画布比例（只扩画布，不拉伸原图）");
        expect(html).toContain("尺寸档");
        expect(html).not.toContain("tool-workspace-placeholder");
    });

    test("四条拖拽边界存在，且都是可聚焦的 slider（键盘可达）", async () => {
        const html = await renderWorkspace();
        for (const edge of ["left", "right", "top", "bottom"]) {
            const handle = attr(html, `outpaint-edge-${edge}`);
            expect(handle).toContain('role="slider"');
            expect(handle).toContain("tabindex=\"0\"");
            expect(handle).toContain("aria-valuenow=");
            expect(handle).toContain("data-expansion=");
        }
        // 40px 热区（命中区域要求 ≥ 40px）
        expect(html).toContain("w-10");
        expect(html).toContain("h-10");
    });

    test("原图默认锁定，未上传时提示与禁用态正确", async () => {
        const html = await renderWorkspace();
        expect(html).toContain("原图已锁定");
        expect(html).toContain("先上传一张原图");
        expect(html).toContain("请先上传要扩展的原图");
        const generate = attr(html, "outpaint-submit");
        expect(/disabled=""/.test(generate)).toBe(true);
        expect(html).not.toContain("生成中");
    });

    test("撤销/重做按钮存在且初始禁用（历史栈为空）", async () => {
        const html = await renderWorkspace();
        expect(/disabled=""/.test(attr(html, "outpaint-undo"))).toBe(true);
        expect(/disabled=""/.test(attr(html, "outpaint-redo"))).toBe(true);
        expect(html).toContain("⌘/Ctrl+Z");
    });

    test("新增区域内容为空时，必填提示内联可见，且禁用按钮带原因（不会静默禁用）", async () => {
        const html = await renderWorkspace();
        expect(html).toContain("新增区域内容（必填）");
        expect(attr(html, "outpaint-prompt-error")).toContain('data-testid="outpaint-prompt-error"');
        expect(html).toContain("请描述扩展区域要补什么");
        const generate = attr(html, "outpaint-submit");
        expect(/disabled=""/.test(generate)).toBe(true);
        expect(generate).toContain("title=");
    });

    test("画布尺寸与蒙版状态同步展示（未生成蒙版时不冒充已同步）", async () => {        const html = await renderWorkspace();
        const canvas = attr(html, "outpaint-canvas");
        expect(canvas).toContain("data-width=");
        expect(canvas).toContain("data-height=");
        expect(html).toContain("蒙版");
        expect(html).toContain("未生成");
        expect(html).not.toContain("已同步");
    });

    test("结果区下方有本工具历史记录面板（真实任务快照，非原站外链）", async () => {
        const html = await renderWorkspace();
        expect(html).toContain('data-testid="tool-task-history"');
        expect(html).toContain("历史记录");
        // 空态是真实数据状态：没有历史任务时直说，不画占位记录
        expect(html).toContain('data-testid="tool-task-history-empty"');
    });
});
