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
    // 工作台内仍有 react-router 的 Link（局部消除结果接力），需要 Router 上下文；真实页面里由路由树提供。
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

    test("涂抹工具齐全：画笔 / 大小 / 自动扩边 / 反选 / 撤销 / 重做 / 重置", async () => {
        const html = await renderWorkspace();
        // 原站工具栏只有「画笔」文字标签（无橡皮切换），实现为静态 mask-tool-label
        for (const testId of ["mask-tool-label", "mask-brush-size", "mask-auto-expand", "mask-invert", "mask-undo", "mask-redo", "mask-reset", "mask-brush-presets"]) {
            expect(html).toContain(`data-testid="${testId}"`);
        }
        // 原站「大小：」是 InputNumber + 预设下箭头，不是长滑杆（差异 7）
        expect(html).not.toContain('type="range"');
        for (const text of ["画笔", "大小：", "像素", "自动扩大选择区域", "反选", "撤销", "重做", "重置"]) expect(html).toContain(text);
        // 原站 2026-10-29 面板无「羽化」控件（A 列表无此项，C 列表要求其默认值 0 不出现）
        expect(html).not.toContain("mask-feather");
        expect(html).not.toContain("羽化");
    });

    test("未上传原图 / 未涂抹时不编造可提交状态：按钮阻塞、无结果、无进行中", async () => {
        const html = await renderWorkspace();
        // 属性顺序不稳定，两种顺序都算阻塞
        const submitDisabled = /data-testid="area-repair-submit"[^>]*disabled=""/.test(html) || /disabled=""[^>]*data-testid="area-repair-submit"/.test(html);
        expect(submitDisabled).toBe(true);
        expect(html).not.toContain("生成中");
        expect(html).not.toContain('data-testid="area-repair-results"');
        // 原站 2026-10-29 文案：「暂无生成结果图」（real/AREA_REPAIR/text.txt）
        expect(html).toContain("暂无生成结果图");
        // 原站空态不展示校验清单（C 列表要求这三句不出现），提示改由上传卡引导承担
        expect(html).not.toContain("请先上传要重绘的图片");
        expect(html).not.toContain("请先在图片上涂抹需要重绘的区域");
        expect(html).not.toContain("请填写重绘描述");
    });

    test("默认值与结果列同原站：张数默认 2、自动扩大默认开、结果栏是右侧独立列", async () => {
        const html = await renderWorkspace();
        // 原站 `_imgCountItem _active_` 在「2」（AREA_REPAIR 差异 5）
        expect(/<button(?=[^>]*aria-pressed="true")(?=[^>]*>\s*2\s*<)[^>]*>/.test(html)).toBe(true);
        // 原站 switch 默认 checked（差异 6）
        expect(/data-testid="mask-auto-expand"[^>]*checked=""/.test(html)).toBe(true);
        // 结果栏在右侧独立列（300px），不是画布下方通栏（差异 1/3）
        expect(html).toContain('data-testid="tool-workspace-columns"');
        expect(html).toContain("lg:grid-cols-[minmax(0,1fr)_240px_300px]");
        expect(html).toContain('data-testid="area-repair-history-entry"');
    });

    test("空蒙版给出涂抹指引与覆盖率，而不是空白画布", async () => {
        const html = await renderWorkspace();
        // 原站 2026-10-29 两行引导（real/AREA_REPAIR/text.txt 第 48-49 行），旧断言已下线
        expect(html).toContain("上传图片，涂抹需要改变的区域并输入想要改变的内容");
        expect(html).toContain("即可重新对该区域进行绘制");
        // 覆盖率标签仅在已涂抹（maskRatio > 0）时渲染，空蒙版不出现「尚未涂抹」
        expect(html).not.toContain('data-testid="mask-coverage"');
        expect(html).not.toContain("尚未涂抹");
        // 没有原图时不应出现蒙版画布（画布依赖真实尺寸）
        expect(html).not.toContain('data-testid="mask-canvas"');
    });
});

/**
 * 结果动作 1:1 证据：原站每张结果都能「下载」，HAND_REPAIR 同类结果还有 存库 / 发画布，
 * 这里直接渲染真实的 AreaRepairResultCard 组件，断言三个动作都在、文件名带源图名与张号。
 */
async function renderResultCard(overrides: Record<string, unknown> = {}): Promise<string> {
    const React = await import("react");
    const { AreaRepairResultCard } = await import("./mask");
    const outcome = {
        unitId: "unit-1",
        index: 1,
        total: 2,
        status: "succeeded",
        snapshotHash: "hash",
        image: { url: "https://example.invalid/result-1.png", mimeType: "image/png" },
        ...overrides,
    };
    return renderToStaticMarkup(
        React.createElement(
            "ul",
            null,
            React.createElement(AreaRepairResultCard as never, {
                outcome,
                imageName: "product-watch.jpg",
                onSave: () => undefined,
                onSend: () => undefined,
            }),
        ) as ReactElement,
    );
}

describe("局部重绘结果动作", () => {
    test("成功结果同时给出 存库 / 发画布 / 下载，且下载文件名带源图名与张号", async () => {
        const html = await renderResultCard();
        for (const testId of ["area-repair-result-1", "area-repair-save-1", "area-repair-send-1", "area-repair-download-1"]) {
            expect(html).toContain(`data-testid="${testId}"`);
        }
        for (const text of ["存库", "发画布", "下载"]) expect(html).toContain(text);
        expect(html).toContain('download="product-watch-repainted.png"');
        expect(html).toContain('href="https://example.invalid/result-1.png"');
        expect(html).toContain('alt="结果 1"');
    });

    test("第 2 张起的下载文件名带张号，避免同名覆盖", async () => {
        const html = await renderResultCard({ index: 3, unitId: "unit-3" });
        expect(html).toContain('download="product-watch-repainted-3.png"');
    });

    test("失败结果不编造动作，只给出上游错误", async () => {
        const html = await renderResultCard({
            status: "failed",
            image: undefined,
            error: { code: "UPSTREAM_FAILED", message: "上游网关 401" },
        });
        expect(html).toContain("上游网关 401");
        expect(html).toContain("#1 · failed");
        expect(html).not.toContain("area-repair-save-1");
        expect(html).not.toContain("area-repair-send-1");
        expect(html).not.toContain("area-repair-download-1");
    });

    test("下载文件名过滤非法字符并兜底", async () => {
        const { areaRepairDownloadName } = await import("@/features/tools/registry/area-repair");
        expect(areaRepairDownloadName("a/b:c*.png", 1)).toBe("a-b-c--repainted.png");
        expect(areaRepairDownloadName("", 1)).toBe("area-repair-repainted.png");
        expect(areaRepairDownloadName("x.jpg", 2)).toBe("x-repainted-2.png");
    });
});

/** 有 DOM 才渲染结果区，所以静态渲染只能验证「没有结果时不出现动作、不编造进行中」。 */
async function renderRemovePenWorkspace(): Promise<string> {
    const React = await import("react");
    const { MemoryRouter } = await import("react-router");
    const { RemovePenWorkspace } = await import("./mask");
    return renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(RemovePenWorkspace as never)) as ReactElement,
    );
}

describe("局部消除结果动作", () => {
    test("没有真实结果时不编造结果，但「下载图片」动作位常驻且禁用（原站结果动作不隐藏）", async () => {
        const html = await renderRemovePenWorkspace();
        for (const testId of ["remove-pen-save", "remove-pen-send"]) {
            expect(html).not.toContain(`data-testid="${testId}"`);
        }
        // 原站工具条上「下载图片 / 高清放大 / 商品图 / 手部修复」顺序固定，未出结果时 disabled 而不是消失
        expect(html).toContain('data-testid="remove-pen-download"');
        const downloadDisabled =
            /data-testid="remove-pen-download"[^>]*disabled=""/.test(html) ||
            /disabled=""[^>]*data-testid="remove-pen-download"/.test(html) ||
            /<button(?=[^>]*data-testid="remove-pen-download")(?=[^>]*disabled="")[^>]*>/.test(html);
        expect(downloadDisabled).toBe(true);
        expect(html).not.toContain("已存入资产库");
        expect(html).not.toContain("已发送画布");
        expect(html).toContain("上传需要消除的图片，使用画笔涂抹即可实现一键消除");
    });

    test("工具条为画布顶部通栏单行，上传卡居中 520、示例区有真实缩略图", async () => {
        const html = await renderRemovePenWorkspace();
        for (const testId of ["remove-pen-toolbar", "remove-pen-upload-card", "remove-pen-brush-size", "remove-pen-brush-presets", "remove-pen-try-these"]) {
            expect(html).toContain(`data-testid="${testId}"`);
        }
        // 画笔大小还原为 number + 预设下拉，不再有长滑杆
        expect(html).not.toContain('data-testid="remove-pen-brush-range"');
        // 上传卡 520 宽
        expect(html).toContain("max-w-[520px]");
        // 「或试试这些」必须有真实示例图（复用仓库案例素材），不能是空区
        for (const id of ["remove-pen-sample-scene", "remove-pen-sample-street", "remove-pen-sample-goods", "remove-pen-sample-print"]) {
            expect(html).toContain(`data-testid="${id}"`);
        }
        expect(html).toContain("/__cases/");
        // 结果动作与历史入口常驻工具条
        expect(html).toContain("历史记录");
    });

    test("未上传原图时提交阻塞，且「重新上传」与原站一致保持禁用", async () => {
        const html = await renderRemovePenWorkspace();
        const submitDisabled =
            /data-testid="remove-pen-submit"[^>]*disabled=""/.test(html) ||
            /disabled=""[^>]*data-testid="remove-pen-submit"/.test(html);
        expect(submitDisabled).toBe(true);
        // 原站初始「重新上传」disabled（REMOVE_PEN 差异 6 的后半段）
        const resetDisabled =
            /data-testid="remove-pen-reset-image"[^>]*disabled=""/.test(html) ||
            /disabled=""[^>]*data-testid="remove-pen-reset-image"/.test(html);
        expect(resetDisabled).toBe(true);
        // 阻塞原因由原站上传引导承担（组件内不会预先弹「请先上传需要消除的图片」notice）
        expect(html).toContain("上传需要消除的图片，使用画笔涂抹即可实现一键消除");
        expect(html).not.toContain("消除中");
    });
});
