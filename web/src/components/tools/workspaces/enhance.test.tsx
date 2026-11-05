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
    const { MemoryRouter } = await import("react-router-dom");
    const { default: Workspace } = await import("./enhance");
    // 工作区底部的 OrigRail 用 react-router Link，需要 Router 上下文（与 mask/color 测试同法）。
    return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Workspace) as ReactElement) as ReactElement);
}

describe("高清放大工作台渲染", () => {
    test("分区齐全：上传 / 模式 / 面部美化 / 生成 / 两栏对照 / 结果空态", async () => {
        const html = await renderWorkspace();
        for (const text of ["图片高清放大", "放大清晰不失真，细节更丰富", "变高清", "面部美化：", "立即生成", "下载图片", "历史记录", "原图", "高清放大后", "高清放大图", "暂无结果图", "请在左侧上传图片后，进行图片高清放大操作"]) {
            expect(html).toContain(text);
        }
        // 原站空态卡：示例前后图 + 从本地上传 / 从作品库选择 / 批量高清放大
        for (const text of ["/__cases/scale-up/upscale-before.png", "/__cases/scale-up/upscale-after.png", "从本地上传", "从作品库选择", "批量高清放大"]) expect(html).toContain(text);
        // 原站 2026-10-29 面板无这些小标题（C 列表要求消失）；也没有独立的 300px 结果列
        for (const gone of ["放大模式", "增强选项", "质量增强档位", "倍率：1×", "w-[620px]"]) expect(html).not.toContain(gone);
    });

    test("四种模式按页面规格渲染，并标注 4096 上限", async () => {
        const html = await renderWorkspace();
        for (const mode of ["变高清", "高清 + 2倍放大", "高清 + 4倍放大", "自定义"]) expect(html).toContain(mode);
        // 原站无三档质量选择（C 列表），保留 4096 上限提示
        expect(html).toContain("最大尺寸: 4096*4096");
    });

    test("未上传原图时不编造输出尺寸，生成按钮阻塞且没有伪造进行中状态", async () => {
        const html = await renderWorkspace();
        // 原站空态不显示输出尺寸；阻塞原因挂在按钮 title 上
        expect(html).not.toContain("scale-up-output-size");
        expect(html).toContain("请先上传原图");
        expect(/<button[^>]*disabled=""[^>]*data-testid="scale-up-generate"/.test(html)).toBe(true);
        expect(html).not.toContain("生成中");
        // 未上传时不渲染前后对比（对比需要真实原图与真实结果）
        expect(html).not.toContain("scale-up-compare");
    });
});

describe("商品精修工作台渲染", () => {
    async function renderRefine(): Promise<string> {
        const React = await import("react");
        const { MemoryRouter } = await import("react-router-dom");
        const { ProductRefineWorkspace } = await import("./enhance");
        return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(ProductRefineWorkspace) as ReactElement) as ReactElement);
    }

    test("原站三列：画布空态示例 + 配置（精修模式 / 上传 / 尺寸规则 / 开始精修）+ 结果空态，没有 4 格槽位条", async () => {
        const html = await renderRefine();
        for (const text of ["商品精修", "一键提升商品质感", "上传图片", "从作品库选择", "精修模式", "整图精修", "去背景精修", "上传待精修的商品图", "20M以内，jpg/jpeg/png/webp", "默认生图尺寸规则", "开始精修", "生成结果", "历史记录", "暂无生成结果图"]) {
            expect(html).toContain(text);
        }
        expect(html).toContain("/__cases/product-refine/product-refine-before-1.jpg");
        expect(html).toContain("/__cases/product-refine/product-refine-after-1.jpg");
        expect(html).not.toContain("refine-compare-preview");
        expect(/<button[^>]*disabled=""[^>]*data-testid="refine-generate"/.test(html)).toBe(true);
    });
});
