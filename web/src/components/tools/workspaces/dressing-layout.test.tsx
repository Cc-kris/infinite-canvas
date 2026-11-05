/**
 * AI_DRESSING_V2 工作区布局回归（直接测试 dressing.tsx）。
 *
 * 对照原站 `draw/ai-dressing`（1600×1000）：
 * - 左配置 300 + 右结果 1100：走共享 ToolWorkspaceColumns，配置列在左，结果在右；
 * - 配置栏是单列 268 上传卡（上装 / 下装纵排），不再三列横排向导；
 * - 「选择生成张数」默认 4；「立即生成」固定在配置栏底部（不随内容滚动）；
 * - 不再有自造的「预计输出 N 张」「第一步：…/我是高手，不再提醒」文案。
 */
import { describe, expect, test } from "bun:test";

async function renderWorkspace(): Promise<string> {
    const [{ renderToStaticMarkup }, React, workspace] = await Promise.all([
        import("react-dom/server"),
        import("react"),
        import("@/components/tools/workspaces/dressing"),
    ]);
    return renderToStaticMarkup(React.createElement(workspace.DressingWorkspace) as Parameters<typeof renderToStaticMarkup>[0]);
}

describe("AI 穿衣 · 工作区布局", () => {
    test("左配置 + 右结果两列，配置列在左", async () => {
        const html = await renderWorkspace();
        expect(html).toContain('data-testid="tool-workspace-columns"');
        expect(html).toContain('data-config-side="left"');
        // 结果区在自己的列里，不再被塞进 300px 侧栏：结果页签与提交按钮分处两个列。
        expect(html.indexOf('data-testid="dressing-submit"')).toBeLessThan(html.indexOf('data-testid="dressing-result-tab-result"'));
    });

    test("上传卡单列纵排：上装、下装各一张卡，没有三列向导", async () => {
        const html = await renderWorkspace();
        expect(html).toContain('data-testid="dressing-garment-upper"');
        expect(html).toContain('data-testid="dressing-garment-down"');
        // 原站的「从商品库选择」在两张服装卡上都在（本地是共享上传条的第三个按钮）。
        expect(html.split("从商品库选择").length - 1).toBe(2);
        // 模特参考是原站那张可展开的行卡，默认收起。
        expect(html).toContain('data-testid="dressing-model-card"');
        expect(html).not.toContain('data-testid="dressing-pose-list"');
    });

    test("张数默认 4，立即生成固定在底部", async () => {
        const html = await renderWorkspace();
        expect(html).toMatch(/data-testid="dressing-output-4"[^>]*aria-pressed="true"/);
        expect(html).toMatch(/data-testid="dressing-output-1"[^>]*aria-pressed="false"/);
        expect(html).toContain('data-testid="dressing-submit-bar"');
    });

    test("自造文案已移除", async () => {
        const html = await renderWorkspace();
        for (const removed of ["预计输出", "我是高手", "第一步：选择示例图", "上传平铺服装图"]) {
            expect(html).not.toContain(removed);
        }
    });
});
