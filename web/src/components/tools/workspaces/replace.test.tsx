import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Expectation = {
    toBe: (expected: unknown) => void;
    toBeGreaterThan: (expected: number) => void;
    toContain: (expected: string) => void;
    not: { toContain: (expected: string) => void };
};

// 与 suite.test.tsx / mask.test.tsx 一致：仓库未装 bun 类型包，动态导入避免 tsc --noEmit 报 TS2307。
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
 * 商品替换（REPLACE_GOODS）对照原站 product-replacement 的骨架证据。
 *
 * 原站形态：大画布 + 底部横向参数条（生成尺寸 / 场景变化程度 / 张数 / 立即生成）+ 右侧 300 结果列。
 * 这里用 react-dom/server 渲染真实组件，断言：
 *  - 参数条在画布列里（不是塞进 300 结果列）；
 *  - 结果列只有 生成结果 / 优秀案例 / 历史记录 三个入口；
 *  - 上一版的自造块（键盘快捷键面板、锁定覆盖读数、多商品分步标题、重复导航）已删除；
 *  - 真实链路仍在：上传 input、四角拖动句柄、蒙版画笔、SKU 页签、提交按钮。
 */
async function renderWorkspace(): Promise<string> {
    const React = await import("react");
    const { MemoryRouter } = await import("react-router-dom");
    const { ReplaceGoodsWorkspace } = await import("./replace");
    // 工作区的「优秀案例 / 历史记录」依赖 router + zustand 上下文（与 mask/outpaint 测试同法）。
    return renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(ReplaceGoodsWorkspace) as ReactElement) as ReactElement,
    );
}

/** 拆出「画布列」与「结果列」两段 HTML：结果列由 configSide="right" 排在 DOM 末尾。 */
function columns(html: string): { main: string; config: string } {
    const split = html.indexOf('data-testid="tool-config-column"');
    return { main: html.slice(0, split), config: html.slice(split) };
}

describe("商品替换工作区（对齐原站：画布 + 底部参数条 + 右侧结果列）", () => {
    test("参数条在画布列底部，画布是主区", async () => {
        const html = await renderWorkspace();
        const { main } = columns(html);
        expect(html).toContain('data-testid="tool-workspace-columns"');
        expect(html).toContain('data-config-side="right"');
        expect(html).toContain('data-testid="replace-goods-param-bar"');
        expect(main).toContain("生成尺寸");
        expect(main).toContain("参考图场景变化程度");
        expect(main).toContain('data-testid="replace-goods-scene-change-none"');
        expect(main).toContain('data-testid="replace-goods-scene-change-high"');
        expect(main).toContain('data-testid="replace-goods-output-1"');
        expect(main).toContain('data-testid="replace-goods-output-4"');
        expect(main).toContain('data-testid="replace-goods-submit"');
        expect(main).toContain('data-testid="replace-goods-canvas"');
    });

    test("结果列是 300 右列，只有生成结果 / 优秀案例 / 历史记录三个入口", async () => {
        const html = await renderWorkspace();
        const { config } = columns(html);
        expect(config).toContain('data-testid="replace-goods-tab-result"');
        expect(config).toContain('data-testid="replace-goods-tab-cases"');
        expect(config).toContain('data-testid="replace-goods-tab-history"');
        // 参数不再塞进结果列
        expect(config).not.toContain('data-testid="replace-goods-param-bar"');
        expect(config).not.toContain("生成尺寸");
        expect(config).not.toContain("去噪强度");
        expect(config).not.toContain("蒙版笔刷");
        // 原站空态文案
        expect(config).toContain("暂无生成结果图");
    });

    test("上一版自造块已删除（键盘面板 / 锁定覆盖读数 / 多商品分步 / 重复导航）", async () => {
        const html = await renderWorkspace();
        expect(html).not.toContain("键盘快捷键");
        expect(html).not.toContain("工具快捷键");
        expect(html).not.toContain("锁定覆盖");
        expect(html).not.toContain("多商品批量替换");
        expect(html).not.toContain("Step 2");
        expect(html).not.toContain("上一张");
        expect(html).not.toContain("场景变化与输出");
        expect(html).not.toContain("中心点");
        // 这份提示只保留原站那一句
        expect(html.split("温馨提示").length - 1).toBe(1);
        expect(html.split("上传参考图，一键替换商品").length - 1).toBe(1);
    });

    test("真实链路保留：上传 input / 空画布 / 蒙版画笔 / SKU 页签 / 提交", async () => {
        const html = await renderWorkspace();
        expect(html).toContain('type="file"');
        expect(html).toContain('accept="image/jpeg,image/png,image/webp"');
        // 未上传时画布是真实空态（四角句柄只在有场景图时渲染，见截图验收）
        expect(html).toContain('data-testid="replace-goods-canvas"');
        expect(html).toContain('data-testid="replace-goods-canvas-empty"');
        expect(html).toContain('data-testid="replace-goods-tool-warp"');
        expect(html).toContain('data-testid="replace-goods-tool-mask"');
        expect(html).toContain('data-testid="replace-goods-tool-eraser"');
        expect(html).toContain('data-testid="replace-goods-brush"');
        expect(html).toContain('data-testid="replace-goods-clear-mask"');
        expect(html).toContain('data-testid="replace-goods-sku-tabs"');
        expect(html).toContain('data-testid="replace-goods-sku-add"');
        expect(html).toContain("立即生成");
    });
});
