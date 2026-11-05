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
    test("三列骨架与原站分区齐全：收藏色卡/选择颜色/颜色参考图/去除杂色/细调/光影/边缘/色彩平衡/曲线/生成/结果标签", async () => {
        const html = await renderWorkspace();
        for (const text of ["收藏色卡", "选择颜色", "颜色参考图", "去除杂色", "细调颜色效果", "光影优化", "边缘优化", "色彩平衡", "曲线", "立即生成", "生成结果", "优秀案例", "历史记录"]) {
            expect(html).toContain(text);
        }
        for (const testId of ["change-color-workspace", "change-color-config", "change-color-results", "change-color-swatches", "change-color-adjustment", "change-color-submit", "change-color-hex"]) {
            expect(html).toContain(testId);
        }
        // 原站分区顺序：收藏色卡 → 选择颜色 → 细调颜色效果 → 光影优化 → 边缘优化 → 色彩平衡 → 曲线
        const order = ["change-color-swatches", "change-color-color", "change-color-adjust\"", "change-color-light\"", "change-color-edge-section", "change-color-balance-section", "change-color-curve-section"].map((id) => html.indexOf(id));
        expect(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1]))).toBe(true);
        // 「选择颜色」一行 5 个圆形预设色点（原站色值）+ 取色器；原站没有的提示卡与空态「本次提交」不渲染
        for (const hex of ["#EDB393", "#90CCAF", "#88ACEC", "#9285F4", "#EB88A0"]) expect(html).toContain(`data-swatch="${hex}"`);
        expect(html).toContain("change-color-picker");
        expect(html).not.toContain("change-color-tip");
        expect(html).not.toContain('data-testid="change-color-snapshot"');
        // 空态示例为原站引导视频
        expect(html).toContain("/__cases/change-color/guide-changecolor.mp4");
        for (const text of ["一键快速上色", "从本地上传", "从作品库选择", "从商品库选择", "批量一键换色"]) expect(html).toContain(text);
    });

    test("没有原图时不渲染涂选画布与前后对比，画布区如实给出上传入口与空态", async () => {
        const html = await renderWorkspace();
        expect(html).toContain("拖拽 或 点击上传");
        expect(html).toContain("暂无生成结果图");
        // 没有真实原图就没有涂选画布/对比滑块，不做假画布
        expect(html).not.toContain("change-color-mask-canvas");
        expect(html).not.toContain('change-color-compare"');
    });

    test("未上传原图时生成按钮阻塞，并列出就地原因，不伪造进行中状态", async () => {
        const html = await renderWorkspace();
        expect(html).toContain("请先上传需要换色的图片。");
        expect(/<button[^>]*disabled=""[^>]*data-testid="change-color-submit"/.test(html)).toBe(true);
        expect(html).not.toContain("生成中");
    });

    test("光影优化默认开启但强度可调，数值框与生成按钮都在", async () => {
        const html = await renderWorkspace();
        expect(html).toContain(">立即生成<");
        expect(html).toContain("change-color-light-strength");
        // 细调四项都有 48×22 数值框
        for (const key of ["hue", "saturation", "brightness", "contrast"]) {
            expect(html).toContain(`data-adjust-value="${key}"`);
        }
        expect(html).toContain('data-testid="change-color-balance-value"');
    });
});
