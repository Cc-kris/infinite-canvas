import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import type { ToolCatalog } from "@/features/tools/tool-page";

type Expectation = {
    toBe: (expected: unknown) => void;
    toEqual: (expected: unknown) => void;
    toContain: (expected: string) => void;
    toMatchObject: (expected: object) => void;
    toHaveLength: (expected: number) => void;
    not: { toContain: (expected: string) => void };
};

// The runtime ships no bun type package, so the runner is imported dynamically with an explicit
// contract; a static `bun:test` import would add a TS2307 to `tsc --noEmit`.
const { afterAll, describe, expect, test } = (await import("bun:test" as string)) as {
    afterAll: (fn: () => void) => void;
    describe: (name: string, fn: () => void) => void;
    expect: (actual: unknown) => Expectation;
    test: (name: string, fn: () => void | Promise<void>) => void;
};

/**
 * TASK-003 route + shell evidence (TC-002/AC-002 scaffolding).
 * The repo has no DOM test harness, so the shell and route bodies are rendered with
 * react-dom/server and asserted on real markup; pure route resolution is asserted directly.
 */

// i18n reads localStorage while initialising the locale.
const storage = new Map<string, string>();
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
    },
});
afterAll(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});

await import("@/i18n");

const { ToolShell } = await import("./tool-shell");
const { ToolSidebar } = await import("./tool-sidebar");
const { buildToolCatalog, ToolRouteView, resolveToolRoute, TOOL_CATEGORIES } = await import("@/features/tools/tool-page");

const catalog: ToolCatalog = buildToolCatalog({
    "./registry/index.ts": {
        toolSpecs: [
            { id: "PRODUCT_IMAGE_SUITE", category: "suite", label: "商品套图", slug: "product-image-suite", index: 1, layout: "suite", adapter: "image", origin: "original", makeType: 11, fields: [{ key: "imageUrl", control: "Upload", required: true }] },
            { id: "SCALE_UP", category: "ecommerce-suite", label: "高清放大", slug: "scale-up", index: 2, layout: "enhance", adapter: "image", fields: [{ key: "imageUrl", control: "Upload", required: true }, { key: "resolution", control: "Radio" }] },
        ],
    },
    "./registry/design.ts": {
        AI_TEXT: { id: "AI_TEXT", category: "design", label: "AI 文字", origin: "supplemental", fields: [] },
    },
});

const emptyCatalog: ToolCatalog = { entries: [] };

function render(node: ReactElement, path = "/tools") {
    return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);
}

describe("ToolShell", () => {
    test("keeps a 180px sidebar on desktop and collapses it below lg", () => {
        const html = render(
            <ToolShell title="高清放大" sidebar={<div>sidebar-body</div>}>
                <div>workspace-body</div>
            </ToolShell>,
        );
        expect(html).toContain('data-testid="tool-sidebar"');
        expect(html).toContain("w-[180px]");
        // Infinite Canvas card language: rounded surface card, hidden below lg.
        expect(html).toContain("hidden w-[180px] shrink-0 overflow-y-auto rounded-xl border border-hairline bg-surface shadow-sm lg:block");
        expect(html).toContain("sidebar-body");
        expect(html).toContain("workspace-body");
        // mobile entry point for the drawer instead of an unusable sliver of sidebar
        expect(html).toContain("lg:hidden");
        expect(html).toContain("打开工具列表");
    });

    test("renders title, breadcrumb and disabled-free actions slot", () => {
        const html = render(
            <ToolShell title="商品套图" subtitle="/tools/ecommerce-suite/product-image-suite" breadcrumb="电商套图 / 商品套图" actions={<button type="button">动作</button>} sidebar={null}>
                <div>body</div>
            </ToolShell>,
        );
        expect(html).toContain("商品套图");
        expect(html).toContain("电商套图 / 商品套图");
        expect(html).toContain("/tools/ecommerce-suite/product-image-suite");
        expect(html).toContain("动作");
    });
});

describe("ToolSidebar", () => {
    test("links canonical urls and marks the active tool", () => {
        const html = render(
            <ToolSidebar
                categories={[
                    { slug: "ecommerce-suite", label: "电商套图", tools: [{ id: "SCALE_UP", slug: "scale-up", title: "高清放大" }] },
                    { slug: "product-design", label: "商品图设计", tools: [{ id: "AI_TEXT", slug: "ai-text", title: "AI 文字", origin: "supplemental" }] },
                ]}
                activeCategory="ecommerce-suite"
                activeToolSlug="scale-up"
            />,
            "/tools/ecommerce-suite/scale-up",
        );
        expect(html).toContain('href="/tools/ecommerce-suite/scale-up"');
        expect(html).toContain('aria-current="page"');
        // 画布设计系统选中态：accent 底 + accent-foreground 文字
        expect(html).toContain("bg-accent font-medium text-accent-foreground");
        expect(html).toContain("rounded-lg");
        expect(html).toContain("h-10");
        // 侧栏只列当前分类，避免跨分类噪声
        expect(html).not.toContain('href="/tools/product-design/ai-text"');
        // 底部免责声明页脚
        expect(html).toContain("免责声明");
    });

    test("labels supplemental tools with a neutral badge", () => {
        const html = render(
            <ToolSidebar categories={[{ slug: "product-design", label: "商品图设计", tools: [{ id: "AI_TEXT", slug: "ai-text", title: "AI 文字", origin: "supplemental" }] }]} activeCategory="product-design" />,
            "/tools/product-design/ai-text",
        );
        expect(html).toContain("补充");
    });
});

describe("tool catalog", () => {
    test("normalises registry exports, category aliases and derived slugs", () => {
        expect(catalog.entries).toHaveLength(3);
        const suite = catalog.entries.find((entry) => entry.id === "PRODUCT_IMAGE_SUITE");
        expect(suite?.category).toBe("ecommerce-suite");
        expect(suite?.title).toBe("商品套图");
        expect(suite?.makeType).toBe(11);
        expect(suite?.fields).toHaveLength(1);
        expect(suite?.fields[0]).toMatchObject({ key: "imageUrl", control: "Upload", required: true });
        expect(catalog.entries.find((entry) => entry.id === "AI_TEXT")?.slug).toBe("ai-text");
    });

    test("exposes the five canonical categories in brief order", () => {
        expect([...TOOL_CATEGORIES]).toEqual(["ecommerce-suite", "smart-edit", "batch-generate", "product-design", "ai-video"]);
    });
});

describe("resolveToolRoute", () => {
    test("resolves canonical /tools/:category/:toolId", () => {
        const match = resolveToolRoute({ category: "ecommerce-suite", toolId: "scale-up" }, catalog);
        expect(match).toMatchObject({ type: "tool", category: "ecommerce-suite", requestedSlug: "scale-up", specPending: false });
        expect(match.type === "tool" ? match.entry?.id : undefined).toBe("SCALE_UP");
    });

    test("accepts a tool id as well as a slug", () => {
        expect(resolveToolRoute({ category: "ecommerce-suite", toolId: "SCALE_UP" }, catalog)).toMatchObject({ type: "tool", requestedSlug: "scale-up" });
    });

    test("/tools/:category redirects to the category default tool", () => {
        expect(resolveToolRoute({ category: "ecommerce-suite" }, catalog)).toEqual({ type: "category-default", category: "ecommerce-suite", toolSlug: "product-image-suite" });
        expect(resolveToolRoute({}, catalog)).toEqual({ type: "category-default", category: "ecommerce-suite", toolSlug: "product-image-suite" });
    });

    test("legacy /tools/:toolSlug redirects to the canonical route", () => {
        expect(resolveToolRoute({ category: "scale-up" }, catalog)).toEqual({ type: "legacy-redirect", to: "/tools/ecommerce-suite/scale-up" });
    });

    test("unknown category and unknown tool both produce 404", () => {
        expect(resolveToolRoute({ category: "not-a-category" }, catalog)).toMatchObject({ type: "not-found", reason: "category" });
        expect(resolveToolRoute({ category: "ecommerce-suite", toolId: "nope" }, catalog)).toMatchObject({ type: "not-found", reason: "tool" });
    });

    test("batch orchestration routes stay separate from tool detail", () => {
        expect(resolveToolRoute({ category: "batch-generate" }, catalog)).toEqual({ type: "batch-home" });
        expect(resolveToolRoute({ category: "batch-generate", toolId: "batch-123" }, catalog)).toEqual({ type: "batch-detail", batchId: "batch-123" });
    });

    test("empty registry keeps the route reachable but flags the spec as pending", () => {
        const match = resolveToolRoute({ category: "ecommerce-suite", toolId: "scale-up" }, emptyCatalog);
        expect(match).toMatchObject({ type: "tool", specPending: true });
        // no default tool is invented, so the category page renders instead of looping on a redirect
        expect(resolveToolRoute({ category: "ecommerce-suite" }, emptyCatalog)).toEqual({ type: "category-default", category: "ecommerce-suite", toolSlug: undefined });
    });
});

describe("ToolRouteView", () => {
    test("renders the spec-driven placeholder without claiming a result", () => {
        const html = render(<ToolRouteView catalog={catalog} category="ecommerce-suite" toolId="scale-up" />, "/tools/ecommerce-suite/scale-up");
        expect(html).toContain("规格驱动占位工作区");
        expect(html).toContain("高清放大");
        expect(html).toContain("imageUrl");
        expect(html).toContain("resolution");
        expect(html).toContain("2 个字段");
        expect(html).toContain("生成（适配器未接入）");
        expect(html).toContain("disabled");
        expect(html).toContain("结果区：空状态");
        expect(html).not.toContain("生成成功");
        expect(html).not.toContain("100%");
        expect(html).toContain('data-spec-pending="false"');
    });

    test("labels a missing spec instead of faking fields", () => {
        const html = render(<ToolRouteView catalog={emptyCatalog} category="ecommerce-suite" toolId="scale-up" />, "/tools/ecommerce-suite/scale-up");
        expect(html).toContain("ToolSpec 尚未接入");
        expect(html).toContain('data-spec-pending="true"');
        expect(html).toContain("不会发起生成");
    });

    test("renders 404 for invalid category and invalid tool", () => {
        expect(render(<ToolRouteView catalog={catalog} category="nope" />, "/tools/nope")).toContain("404");
        expect(render(<ToolRouteView catalog={catalog} category="ecommerce-suite" toolId="nope" />, "/tools/ecommerce-suite/nope")).toContain("404");
    });

    test("renders the batch workspace for batch routes", () => {
        expect(render(<ToolRouteView catalog={catalog} category="batch-generate" />, "/tools/batch-generate")).toContain("批量生图工作台");
        const detail = render(<ToolRouteView catalog={catalog} category="batch-generate" toolId="batch-123" />, "/tools/batch-generate/batch-123");
        expect(detail).toContain("batch-123");
        expect(detail).not.toContain("进度 100%");
    });

    test("renders the category home when no default tool is registered", () => {
        const html = render(<ToolRouteView catalog={emptyCatalog} category="smart-edit" />, "/tools/smart-edit");
        expect(html).toContain("分类首页");
        expect(html).toContain("尚无已注册工具");
    });
});
