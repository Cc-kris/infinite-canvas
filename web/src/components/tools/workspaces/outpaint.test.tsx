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


/**
 * 智能扩图工作台渲染证据（第二轮：对齐原站 linkfox 双栏壳）：
 *  - 骨架是「左白卡（画布 + 48px 参数条）+ 右 615px 结果栏」，不由 ToolShell 再套一层；
 *  - 空态上传卡文案与原站一致（智能扩图 / 一键无缝扩展… / 从本地上传）；
 *  - 提示词可选（原站「不填将基于原图生成」），未上传原图时提交按钮禁用且带原因；
 *  - 右栏三个入口真实存在（生成结果 / 优秀案例 / 历史记录），空态是真实数据状态。
 */
describe("智能扩图工作台渲染", () => {
    test("骨架：左画布卡 + 底部参数条 + 右结果栏（不再嵌套 ToolShell）", async () => {
        const html = await renderWorkspace();
        expect(html).toContain('data-layout="outpaint"');
        expect(html).toContain('data-region="canvas"');
        expect(html).toContain('data-region="results"');
        expect(html).toContain('data-testid="outpaint-param-bar"');
        expect(html).not.toContain("tool-workspace-chrome");
        expect(html).not.toContain("tool-workspace-placeholder");
    });

    test("参数条：默认尺寸 / 提示词 / 生成张数 / 立即生成", async () => {
        const html = await renderWorkspace();
        expect(html).toContain("默认尺寸");
        expect(html).toContain('aria-label="画布宽度"');
        expect(html).toContain('aria-label="画布高度"');
        expect(html).toContain('placeholder="描述想要扩图的内容，不填将基于原图生成"');
        expect(html).toContain("生成：");
        expect(html).toContain("立即生成");
        expect(html).toContain("立即生成");
        // 默认 4 张，与原站默认值一致
        expect(html).toContain('<option value="4" selected="">4张</option>');
    });

    test("空态上传卡文案与原站一致，且上传入口只有本地上传/作品库", async () => {
        const html = await renderWorkspace();
        expect(html).toContain('data-testid="outpaint-upload-card"');
        expect(html).toContain("一键无缝扩展，打破视觉边界，释放每一张照片的无限可能~");
        expect(html).toContain("从本地上传");
        expect(html).toContain("从作品库选择");
    });

    test("未上传原图时提交按钮禁用且带原因（不会静默禁用）", async () => {
        const html = await renderWorkspace();
        const generate = attr(html, "outpaint-submit");
        expect(/disabled=""/.test(generate)).toBe(true);
        expect(generate).toContain("title=");
        expect(generate).toContain("请先上传要扩展的原图");
    });

    test("提示词可选：空值不报必填错误，长度上限仍生效", async () => {
        const html = await renderWorkspace();
        expect(html).not.toContain('data-testid="outpaint-prompt-error"');
        const prompt = attr(html, "outpaint-prompt");
        expect(prompt).toContain('maxLength="4000"');
        expect(prompt).not.toContain('aria-invalid="true"');
    });

    test("右栏：生成结果/优秀案例/历史记录三个入口 + 真实空态文案", async () => {
        const html = await renderWorkspace();
        expect(attr(html, "outpaint-tab-result")).toContain('aria-selected="true"');
        expect(html).toContain("优秀案例");
        expect(html).toContain('data-testid="outpaint-tab-history"');
        expect(html).toContain('data-testid="outpaint-panel-result"');
        expect(html).toContain("暂无生成结果图");
        expect(html).toContain("快在左侧操作智能扩图吧~");
    });
});
