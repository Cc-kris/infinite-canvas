import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Expectation = {
    toBe: (expected: unknown) => void;
    toBeGreaterThan: (expected: number) => void;
    toBeLessThan: (expected: number) => void;
    toContain: (expected: string) => void;
    not: { toContain: (expected: string) => void };
};

// 与 mask.test.tsx / suite.test.tsx 一致：仓库未装 bun 类型包，动态导入避免 tsc 报 TS2307。
const { describe, expect, test } = (await import("bun:test" as string)) as {
    describe: (name: string, fn: () => void) => void;
    expect: (actual: unknown) => Expectation;
    test: (name: string, fn: () => void) => void;
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
 * IMAGE_CROP 1:1 还原的渲染证据（跑真实组件渲染，不是读源码）：
 * 画布顶部通栏工具条 / 居中 535 空态卡 / 右侧 250 配置栏 / 更多弹层收纳 / 历史记录入口。
 */
async function renderWorkspace(): Promise<string> {
    const React = await import("react");
    const { MemoryRouter } = await import("react-router");
    const { CropWorkspace } = await import("./crop");
    return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(CropWorkspace)) as ReactElement);
}

const disabled = (html: string, testId: string) => new RegExp(`<button(?=[^>]*data-testid="${testId}")(?=[^>]*disabled="")[^>]*>`).test(html);

describe("图片裁剪 · 画布顶部通栏工具条", () => {
    test("单行工具条：左 重置/撤销/重做/重新上传，右 下载图片+限免/真人换模特2.0/更多/历史记录", async () => {
        const html = await renderWorkspace();
        expect(html).toContain('data-testid="crop-toolbar"');
        for (const id of ["crop-reset", "crop-undo", "crop-redo", "crop-reupload", "crop-download", "crop-related-dressing", "crop-more", "crop-history"]) {
            expect(html).toContain(`data-testid="${id}"`);
        }
        // 原站右段顺序：下载图片（带限免红标）→ 真人换模特2.0 → 更多 → 历史记录
        const toolbar = html.slice(html.indexOf('data-testid="crop-toolbar"'), html.indexOf('data-testid="crop-empty"') > 0 ? html.indexOf('data-testid="crop-empty"') : undefined);
        expect(toolbar).toContain("下载图片");
        expect(toolbar).toContain('data-testid="crop-free-badge"');
        expect(toolbar).toContain("限免");
        expect(toolbar).toContain("真人换模特2.0");
        expect(toolbar).toContain("历史记录");
        expect(toolbar.indexOf("下载图片")).toBeGreaterThan(toolbar.indexOf("重新上传"));
        expect(toolbar.indexOf("真人换模特2.0")).toBeGreaterThan(toolbar.indexOf("下载图片"));
        expect(toolbar.indexOf("历史记录")).toBeGreaterThan(toolbar.indexOf("真人换模特2.0"));
    });

    test("无源图时 重置/撤销/重做/重新上传/下载图片 与原站一致保持禁用", async () => {
        const html = await renderWorkspace();
        for (const id of ["crop-reset", "crop-undo", "crop-redo", "crop-reupload", "crop-download"]) {
            expect(disabled(html, id)).toBe(true);
        }
    });

    test("工具条不再塞进壳层 actions：根布局是通栏工具条 + 画布列/配置列", async () => {
        const html = await renderWorkspace();
        expect(html).toContain('data-testid="crop-workspace"');
        expect(html).toContain('data-testid="tool-workspace-columns"');
        expect(html).toContain('data-testid="tool-main-column"');
        expect(html).toContain('data-testid="tool-config-column"');
        // 工具条在画布列内部（通栏），不是页头右上角
        expect(html.indexOf('data-testid="crop-toolbar"')).toBeLessThan(html.indexOf('data-testid="crop-empty"'));
        expect(html.indexOf('data-testid="tool-main-column"')).toBeLessThan(html.indexOf('data-testid="crop-toolbar"'));
    });
});

describe("图片裁剪 · 居中 559 空态上传面板", () => {
    test("面板 559 宽，含原站示例图（自带四角裁剪框）+ 标题/副标题", async () => {
        const html = await renderWorkspace();
        expect(html).toContain('data-testid="crop-empty"');
        expect(html).toContain("max-w-[559px]");
        // 示例图是原站 image-crop-upload-tour.jpg 原样落盘，不是占位色块；四角裁剪框画在图里，不再叠一层自造框
        expect(html).toContain("/__cases/image-crop/upload-tour.jpg");
        expect(html).toContain('data-testid="crop-empty-sample"');
        expect(html).not.toContain('data-testid="crop-empty-frame"');
        expect(html).toContain("图片裁剪");
        expect(html).toContain("上传图片，裁剪图片为任意尺寸/比例");
    });

    test("437×30 紫主按钮 + 作品库/商品库两按钮 + 拖拽粘贴与格式提示", async () => {
        const html = await renderWorkspace();
        expect(html).toContain("max-w-[437px]");
        expect(html).toContain("从本地上传");
        expect(html).toContain("从作品库选择");
        expect(html).toContain("从商品库选择");
        expect(html).toContain("拖拽/粘贴");
        expect(html).toContain("免费限单张，付费解锁 100 张批量上传");
        expect(html).toContain("支持jpg、jpeg、png、webp");
        expect(html).toContain("384*384 ~ 4096*4096");
    });

    test("真实上传通道仍在：隐藏 file input 保持 crop-nv-accept 的 testid", async () => {
        const html = await renderWorkspace();
        expect(html).toContain('data-testid="tool-asset-file-input"');
        expect(html).toContain('type="file"');
        expect(html).toContain('accept="image/png,image/jpeg,image/webp"');
    });
});

describe("图片裁剪 · 右侧 270 参数面板", () => {
    test("参数面板 270px（原站实测 x1310..1580，布局检查要求 240–360），Tab 尺寸调整/比例调整 齐全", async () => {
        const html = await renderWorkspace();
        expect(html).toContain("lg:grid-cols-[minmax(0,1fr)_270px]");
        expect(html).toContain('data-testid="tool-config-column"');
        expect(html).toContain('data-testid="crop-tab-size"');
        expect(html).toContain('data-testid="crop-tab-ratio"');
        expect(html).toContain("尺寸调整");
        expect(html).toContain("比例调整");
        // 尺寸调整默认选中
        expect(/<button(?=[^>]*data-testid="crop-tab-size")(?=[^>]*aria-selected="true")/.test(html)).toBe(true);
    });

    test("尺寸页：可搜索单列平台列表（自由裁剪 + 22 平台，16px 色块图标 + 右对齐 W×H，max-h 346）", async () => {
        const html = await renderWorkspace();
        expect(html).toContain('data-testid="crop-platform-search"');
        expect(html).toContain('placeholder="搜索平台名称"');
        expect(html).toContain('data-testid="crop-size-free"');
        expect(html).toContain("自由裁剪");
        expect(html).toContain("max-h-[346px]");
        const platforms = html.match(/data-testid="crop-platform-(?!search)[a-z-]+"/g) ?? [];
        expect(platforms.length).toBe(22);
        for (const key of ["amazon", "walmart", "etsy", "shein", "taobao", "wish"]) {
            expect(html).toContain(`data-testid="crop-platform-${key}"`);
        }
        // 每行右侧是 W × H
        expect(html).toContain("1600 × 1600");
        expect(html).toContain("1340 × 1785");
        // 16px 色块图标
        expect(html).toContain("inline-block size-4 shrink-0 rounded-[3px]");
    });

    test("底部目标尺寸默认 1024×1024 + 保存自定义尺寸 + 四角旋转/翻转", async () => {
        const html = await renderWorkspace();
        expect(html).toContain('data-testid="crop-output-width"');
        expect(html).toContain('data-testid="crop-output-height"');
        expect(/data-testid="crop-output-width"[^>]*value="1024"/.test(html)).toBe(true);
        expect(/data-testid="crop-output-height"[^>]*value="1024"/.test(html)).toBe(true);
        expect(html).toContain('data-testid="crop-output-summary"');
        expect(html).toContain("1024×1024");
        expect(html).toContain("目标尺寸");
        expect(html).toContain('data-testid="crop-save-custom"');
        expect(html).toContain("保存自定义尺寸");
        for (const id of ["crop-rotate-ccw", "crop-rotate-cw", "crop-flip-x", "crop-flip-y"]) expect(html).toContain(`data-testid="${id}"`);
        expect(html).toContain("逆时针旋转90°");
        expect(html).toContain("顺时针旋转90°");
        expect(html).toContain("水平翻转");
        expect(html).toContain("垂直翻转");
        // 无源图时旋转/翻转不可用（原站同样 disabled）
        for (const id of ["crop-rotate-ccw", "crop-rotate-cw", "crop-flip-x", "crop-flip-y"]) expect(disabled(html, id)).toBe(true);
    });
});

describe("图片裁剪 · 比例调整页与原站文案", () => {
    test("7 个比例行带中文场景说明，顺序同原站", async () => {
        const { CROP_RATIO_ROWS } = await import("./crop");
        expect(CROP_RATIO_ROWS.length).toBe(7);
        expect(CROP_RATIO_ROWS.map((row) => `${row.id} ${row.note}`).join("|")).toBe(
            ["1:1 正方形", "2:3 单反相机（竖图）", "3:2 单反相机（横图）", "3:4 标准屏幕（竖图）", "4:3 标准屏幕（横图）", "9:16 视频（竖屏）", "16:9 视频（横屏）"].join("|"),
        );
    });

    test("比例页有搜索比例与原图比例入口（默认尺寸页不渲染，切页后才出现）", async () => {
        const html = await renderWorkspace();
        // 默认在尺寸调整页：比例页专属控件不应抢占尺寸页
        expect(html).not.toContain('data-testid="crop-ratio-search"');
        expect(html).not.toContain('data-testid="crop-ratio-original"');
    });
});

describe("图片裁剪 · 更多弹层与历史记录", () => {
    test("输出格式/锁定比例/开始裁剪默认不占主流程，只从工具条「更多」进入", async () => {
        const html = await renderWorkspace();
        expect(html).toContain('data-testid="crop-more"');
        expect(html).not.toContain('data-testid="crop-more-panel"');
        expect(html).not.toContain('data-testid="crop-format"');
        expect(html).not.toContain('data-testid="crop-lock-ratio"');
        expect(html).not.toContain('data-testid="crop-submit"');
    });

    test("历史记录走工具条右侧入口的真实面板，页内不再有历史卡", async () => {
        const html = await renderWorkspace();
        expect(html).toContain('data-testid="crop-history"');
        // 默认不渲染历史面板（点击工具条入口才挂载 ToolTaskHistory）
        expect(html).not.toContain('data-testid="crop-history-panel"');
        expect(html).not.toContain('data-testid="tool-task-history"');
    });

    test("页内不再重复渲染同类工具 rail 与 H1 区", async () => {
        const html = await renderWorkspace();
        expect(html).not.toContain('data-testid="crop-family-rail"');
        expect(html).not.toContain("<h1");
    });
});
