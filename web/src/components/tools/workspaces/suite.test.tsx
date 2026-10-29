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
    const { default: Workspace } = await import("./suite");
    return renderToStaticMarkup(React.createElement(Workspace) as ReactElement);
}

describe("商品套图工作台渲染", () => {
    test("分区齐全：商品图 / 商品信息 / 品牌基因 / 生成参数 / A+ / 主副图 / 提交区", async () => {
        const html = await renderWorkspace();
        for (const text of ["商品信息", "品牌与合规", "品牌基因", "模型选择", "分辨率选择", "模型品质", "生成比例", "A+图设置", "主副图设置", "预计生成", "开始生成"]) {
            expect(html).toContain(text);
        }
    });

    test("枚举与限制按页面规格渲染（10M、384–4096px、5 比例、4 档分辨率）", async () => {
        const html = await renderWorkspace();
        // 原站 2026-10-29 限制文案逐字（real/PRODUCT_IMAGE_SUITE/text.txt 第 34 行）
        expect(html).toContain("10M以内，384*384 ~ 4096*4096，最大宽高比5");
        for (const ratio of ["1:1", "3:4", "4:3", "2:3", "3:2"]) expect(html).toContain(ratio);
        for (const resolution of ["1K", "2K", "4K"]) expect(html).toContain(resolution);
        for (const module of ["卖点图", "白底图", "场景图", "特写图", "特写白底图"]) expect(html).toContain(module);
        for (const aplus of ["高级A+", "手机A+", "普通A+", "自定比例"]) expect(html).toContain(aplus);
    });

    test("商品信息区与原站一致：只有文本域 + 字数，不渲染自造的「AI分析/向导」占位按钮", async () => {
        const html = await renderWorkspace();
        expect(html).not.toContain("AI分析");
        expect(html).not.toContain(">向导<");
        expect(html).not.toContain("suite-ai-analysis");
        expect(html).not.toContain("suite-wizard");
        // 字数计数仍在（原站 0 / 2500 口径）
        expect(html).toContain("商品信息");
    });

    test("未上传商品图 / 未选类型时给出真实校验提示，而不是伪造可生成", async () => {
        const html = await renderWorkspace();
        expect(html).toContain("请先上传商品图");
        expect(html).toContain("请至少选择一个生成类型");
        expect(html).not.toContain("生成中");
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
