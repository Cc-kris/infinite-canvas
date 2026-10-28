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
    // 工作台带「本页路由」链接，需要 Router 上下文；真实页面里由路由树提供，测试里用 MemoryRouter 顶替。
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

    test("涂抹工具齐全：画笔 / 橡皮 / 羽化 / 自动扩边 / 反选 / 撤销 / 重做 / 重置", async () => {
        const html = await renderWorkspace();
        for (const testId of ["mask-tool-brush", "mask-tool-eraser", "mask-brush-size", "mask-feather", "mask-auto-expand", "mask-invert", "mask-undo", "mask-redo", "mask-reset"]) {
            expect(html).toContain(`data-testid="${testId}"`);
        }
        for (const text of ["画笔", "橡皮", "羽化", "撤销", "重做", "重置"]) expect(html).toContain(text);
    });

    test("未上传原图 / 未涂抹时不编造可提交状态：按钮阻塞、无结果、无进行中", async () => {
        const html = await renderWorkspace();
        // 属性顺序不稳定，两种顺序都算阻塞
        const submitDisabled = /data-testid="area-repair-submit"[^>]*disabled=""/.test(html) || /disabled=""[^>]*data-testid="area-repair-submit"/.test(html);
        expect(submitDisabled).toBe(true);
        expect(html).not.toContain("生成中");
        expect(html).not.toContain('data-testid="area-repair-results"');
        expect(html).toContain("还没有结果");
        expect(html).toContain("请先上传要重绘的图片");
        expect(html).toContain("请先在图片上涂抹需要重绘的区域");
        expect(html).toContain("请填写重绘描述");
    });

    test("空蒙版给出涂抹指引与覆盖率，而不是空白画布", async () => {
        const html = await renderWorkspace();
        expect(html).toContain("上传图片后即可在图上涂抹需要重绘的区域");
        expect(html).toContain("蒙版随原图一起发给模型");
        expect(html).toContain('data-testid="mask-coverage"');
        expect(html).toContain("尚未涂抹");
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
    test("没有真实结果时不给 存库 / 发画布 / 下载，也不伪造进行中", async () => {
        const html = await renderRemovePenWorkspace();
        for (const testId of ["remove-pen-save", "remove-pen-send", "remove-pen-download"]) {
            expect(html).not.toContain(`data-testid="${testId}"`);
        }
        expect(html).not.toContain("已存入资产库");
        expect(html).not.toContain("已发送画布");
        expect(html).toContain("还没有结果");
    });

    test("未上传原图时提交阻塞并给出原因", async () => {
        const html = await renderRemovePenWorkspace();
        const submitDisabled =
            /data-testid="remove-pen-submit"[^>]*disabled=""/.test(html) ||
            /disabled=""[^>]*data-testid="remove-pen-submit"/.test(html);
        expect(submitDisabled).toBe(true);
        expect(html).toContain("请先上传需要消除的图片");
        expect(html).not.toContain("消除中");
    });
});
