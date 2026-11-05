import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Expectation = {
    toBe: (expected: unknown) => void;
    toContain: (expected: string) => void;
    toMatch: (expected: RegExp) => void;
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
    // writable 必须为 true：其它测试文件会直接给自己装 localStorage 桩，
    // 只读属性会让它们抛 "Attempted to assign to readonly property"。
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
    const { default: Workspace } = await import("./suite");
    // 工作区内的 Link（家族 rail/案例卡）需要 Router 上下文，与 mask/outpaint 测试同法。
    return renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(Workspace) as ReactElement) as ReactElement,
    );
}

describe("商品套图工作台渲染", () => {
    test("分区齐全：商品图 / 商品信息 / 品牌与合规行卡 / 模型行 / 生成内容 / 提交区", async () => {
        const html = await renderWorkspace();
        for (const text of ["多视角白底商品", "商品类目", "商品信息", "品牌与合规", "智能品牌基因", "智能合规检查", "LF智能模型 G-2.5 Sunburst", "A+图", "主副图", "生成比例", "开始生成"]) {
            expect(html).toContain(text);
        }
    });

    test("枚举与限制按原站文案渲染（最多16张、10M、384–4096px、5 比例、3 档分辨率）", async () => {
        const html = await renderWorkspace();
        // 原站 2026-11-02 上传卡限制行逐字（report.md 实测）
        expect(html).toContain("最多上传16张图，10M以内，384*384~4096*4096，最大宽高比5");
        // 16 张 与 multiple 一起生效（原站 input[type=file] multiple=true）
        expect(html).toContain('multiple=""');
        for (const ratio of ["1:1", "3:4", "4:3", "2:3", "3:2"]) expect(html).toContain(ratio);
        // 模型行与原站一致默认折叠：行内只显示「2K · 中品质」，1K/2K/4K 在弹层里（展开才渲染）。
        expect(html).toContain("2K · 中品质");
        expect(html).toContain("LF智能模型 G-2.5 Sunburst");
        // 生成内容与原站一致默认折叠：行内只有摘要（A+ 图/主副图 + 类型 + 张数），模块清单在展开区里。
        expect(html).toContain("高级A+（1464×600） 4张");
        expect(html).toContain("卖点图 4张");
        expect(html).toContain("配置A+图");
        expect(html).toContain("配置主副图");
    });

    test("商品信息区：向导是弹窗入口（不插入快捷词），AI分析未上传时禁用", async () => {
        const html = await renderWorkspace();
        expect(html).toContain('data-testid="suite-guide"');
        expect(html).toContain('aria-haspopup="dialog"');
        // 只插入快捷词的本地做法已删除
        expect(html).not.toContain("核心卖点：");
        expect(html).not.toContain("尺码规格");
        // 未上传商品图时 AI分析 与原站一致为禁用态
        expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="suite-ai-analyze"/);
        // 字数计数仍是原站口径
        expect(html).toContain("0 / 2500");
    });

    test("商品类目是可搜索级联入口（不是原生 select）", async () => {
        const html = await renderWorkspace();
        expect(html).toContain('role="combobox"');
        expect(html).toContain('data-testid="suite-category"');
        expect(html).not.toContain("<select");
    });

    test("本地自造已移除：无公告条、无第三个历史 tab、无内嵌历史任务列表", async () => {
        const html = await renderWorkspace();
        expect(html).not.toContain("全能模型 2 已升级为 2.1");
        expect(html).not.toContain("白底图精修与裂变已上线");
        expect(html).not.toContain('data-testid="suite-promo-left"');
        expect(html).not.toContain('data-testid="suite-promo-result"');
        expect(html).not.toContain('data-testid="suite-tab-history"');
        expect(html).not.toContain('data-testid="suite-panel-history"');
        // 历史只保留原站式外链入口位
        expect(html).toContain('data-testid="suite-tab-history-link"');
    });

    test("未上传商品图时给出真实校验提示且按钮禁用，而不是伪造可生成", async () => {
        const html = await renderWorkspace();
        expect(html).toContain("请先上传商品图");
        expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="suite-generate"/);
        expect(html).not.toContain("生成中");
        // 校验原因同时挂在按钮 title 上（原站无图时点击走校验）
        expect(html).toContain('title="请先上传商品图（jpg / png / webp，10M 以内）。"');
    });
});

describe("商品营销素材刷新还原（F 边界：成功结果刷新即消失）", () => {
    test("按单元 prompt 对齐任务还原结果；同 prompt 取最新；状态如实映射", async () => {
        const React = await import("react");
        void React;
        const suite = await import("./suite");
        const registry = await import("@/features/tools/registry/product-market-material");
        const adapter = await import("@/features/tools/adapters/product-market-material");
        const config = registry.createDefaultMarketConfig();
        const planned = registry.buildMarketUnits(config);
        const target = planned[0];
        expect(Boolean(target)).toBe(true);
        const task = {
            id: "task-restore-1",
            toolId: registry.PRODUCT_MARKET_MATERIAL_TOOL_ID,
            prompt: target.prompt,
            status: "succeeded",
            createdAt: 2,
            result: { items: [{ id: "item-1", kind: "image", url: "https://example.com/a.png" }], receivedAt: 2 },
        } as never;
        const older = { ...(task as Record<string, unknown>), id: "task-restore-0", createdAt: 1, status: "failed" } as never;
        const restored = suite.restoreMarketUnitsFromTasks(config, { a: older, b: task }, registry.PRODUCT_MARKET_MATERIAL_TOOL_ID);
        expect(restored.length).toBe(1);
        expect(restored[0].unitId).toBe(target.id);
        expect(restored[0].taskId).toBe("task-restore-1");
        expect(restored[0].status).toBe("succeeded");
        expect(restored[0].items.length).toBe(1);
        void adapter;
    });
});
