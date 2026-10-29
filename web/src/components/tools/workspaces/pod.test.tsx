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

async function renderSds(): Promise<string> {
    const React = await import("react");
    const { SdsDesignWorkspace } = await import("./pod");
    return renderToStaticMarkup(React.createElement(SdsDesignWorkspace) as ReactElement);
}

describe("素材贴合工作台渲染（SDS_DESIGN）", () => {
    test("三区齐全：舞台卡 / 参数列 / 结果面板，且带布局标记", async () => {
        const html = await renderSds();
        expect(html).toContain('data-tool-workspace="sds-design"');
        expect(html).toContain('data-variant="sds-1to1"');
        expect(html).toContain("素材贴合");
        expect(html).toContain("选择颜色");
        expect(html).toContain("素材操作");
        expect(html).toContain("生成结果");
        expect(html).toContain("优秀案例");
        expect(html).toContain("历史记录");
    });

    test("空态文案来自真实状态，不编造结果图", async () => {
        const html = await renderSds();
        expect(html).toContain("暂无生成结果图");
        expect(html).toContain("快在左侧操作素材贴合吧");
        expect(html).toContain("上传素材后在这里预览贴合效果");
        // 未提交时不应出现结果标题之外的假数据
        expect(html).not.toContain("生成中");
    });

    test("未上传素材时生成按钮阻塞，并给出可执行提示", async () => {
        const html = await renderSds();
        expect(html).toContain("立即生成");
        expect(html).toContain("至少上传 1 个素材后才能贴合");
        expect(/<button[^>]*disabled=""[^>]*>立即生成<\/button>/.test(html)).toBe(true);
    });

    test("上传入口真实存在：舞台上传按钮 + 产品选择卡片", async () => {
        const html = await renderSds();
        expect(html).toContain("上传素材");
        expect(html).toContain("选择产品进行素材贴合");
        // 两个隐藏 file input 分别承接素材与商品图
        expect((html.match(/type="file"/g) ?? []).length).toBe(2);
        expect(html).toContain('accept="image/png,image/jpeg,image/webp"');
    });

    test("只去品牌：不出现 LinkFox 品牌文案", async () => {
        const html = await renderSds();
        const lower = html.toLowerCase();
        expect(lower).not.toContain("linkfox");
        expect(html).not.toContain("领狐");
    });

    test("优秀案例：数据来自 SDS_DESIGN_CASES，商品图与素材槽位齐全", async () => {
        const { SDS_DESIGN_CASES } = await import("@/features/tools/tool-cases-data");
        expect(SDS_DESIGN_CASES.length).toBe(18);
        // 真实数据事实：18 条里 9 条只带商品图（materials 为空数组），其余带 1~4 张素材。
        const counts = SDS_DESIGN_CASES.map((item) => {
            const files = (item.apply?.files ?? {}) as Record<string, unknown>;
            const product = files.product;
            const materials = files.materials;
            const productOk = typeof product === "string" && product.startsWith("/__cases/sds-design/");
            const materialsOk =
                Array.isArray(materials) &&
                materials.every((url) => typeof url === "string" && url.startsWith("/__cases/sds-design/"));
            return productOk && materialsOk ? (materials as unknown[]).length : -1;
        });
        expect(counts.filter((value) => value < 0).length).toBe(0);
        expect(counts.filter((value) => value > 0).length).toBe(9);
        expect(counts.filter((value) => value === 0).length).toBe(9);
    });

    test("优秀案例画廊：真实渲染案例卡片与「做同款」入口", async () => {
        const React = await import("react");
        const { ToolCases } = await import("@/components/tools/tool-cases");
        const { SDS_DESIGN_CASES } = await import("@/features/tools/tool-cases-data");
        const html = renderToStaticMarkup(
            React.createElement(ToolCases, {
                cases: SDS_DESIGN_CASES,
                applyingId: null,
                onApply: async () => {},
            }) as ReactElement,
        );
        expect(html).toContain("做同款");
        expect(html).toContain(SDS_DESIGN_CASES[0].result);
        expect((html.match(/data-testid="tool-case-apply"/g) ?? []).length).toBe(SDS_DESIGN_CASES.length);
    });
});
