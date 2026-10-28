import { afterAll, describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

/**
 * TASK-INTEGRATE evidence: every registry tool id must mount its real exported workspace through
 * `/tools/:category/:toolId`, and nothing else about the route layer may change (batch routes,
 * category home/default redirect, sidebar, 404, feature flags, spec placeholder fallback).
 *
 * No DOM harness exists in this repo, so route bodies are rendered with react-dom/server and the
 * assertions run on the produced markup; route resolution is asserted directly as pure output.
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

await import("@/i18n");

const {
    buildToolCatalog,
    isRegistryBackedEntry,
    resolveToolRoute,
    resolveToolWorkspace,
    TOOL_CATEGORIES,
    TOOL_WORKSPACES,
    TOOL_WORKSPACE_IDS,
    ToolRouteView,
} = await import("./tool-page");
const { toolSpecs } = await import("./registry");

const catalog = buildToolCatalog({ "./registry/index.ts": { toolSpecs } });

function render(element: ReactElement, path: string) {
    return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>);
}

function renderTool(category: string, slug: string) {
    return render(<ToolRouteView catalog={catalog} category={category} toolId={slug} />, `/tools/${category}/${slug}`);
}

afterAll(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});

describe("TASK-INTEGRATE workspace map", () => {
    test("maps exactly the registry tool ids, with no duplicates and no extras", () => {
        const registryIds = toolSpecs.map((spec) => spec.id);
        expect(new Set(registryIds).size).toBe(registryIds.length);
        expect(new Set(TOOL_WORKSPACE_IDS).size).toBe(TOOL_WORKSPACE_IDS.length);
        const mappedIds: string[] = [...TOOL_WORKSPACE_IDS];
        expect(mappedIds.sort()).toEqual([...registryIds].sort());
        expect(Object.keys(TOOL_WORKSPACES).sort()).toEqual([...TOOL_WORKSPACE_IDS].sort());
    });

    test("resolves a real workspace for every registry entry at its canonical route", () => {
        const missing: string[] = [];
        for (const spec of toolSpecs) {
            const match = resolveToolRoute({ category: spec.category, toolId: spec.slug }, catalog);
            if (match.type !== "tool") {
                missing.push(`${spec.id}: route resolved to ${match.type}`);
                continue;
            }
            if (!isRegistryBackedEntry(match.entry)) missing.push(`${spec.id}: entry is not registry-backed`);
            if (!resolveToolWorkspace(match.entry)) missing.push(`${spec.id}: no workspace renderer`);
        }
        expect(missing).toEqual([]);
    });

    test("renders the workspace markup instead of the specification placeholder for every tool", () => {
        const failures: string[] = [];
        for (const spec of toolSpecs) {
            const html = renderTool(spec.category, spec.slug);
            if (!html.includes('data-testid="tool-workspace"')) failures.push(`${spec.id}: no workspace wrapper`);
            if (html.includes('data-testid="tool-workspace-placeholder"')) failures.push(`${spec.id}: still placeholder`);
            if (!html.includes(`data-tool-id="${spec.id}"`)) failures.push(`${spec.id}: wrapper tool id mismatch`);
            // A workspace always renders real controls; the placeholder only had two disabled buttons.
            if (html.includes("生成（适配器未接入）")) failures.push(`${spec.id}: placeholder generate button leaked`);
        }
        expect(failures).toEqual([]);
    });

    test("NEW_DESIGNER renders the designer workspace, not a gateway placeholder", () => {
        const html = renderTool("product-design", "new-designer");
        expect(html).toContain('data-tool-id="NEW_DESIGNER"');
        expect(html).toContain('data-testid="designer-export"');
        expect(html).not.toContain('data-testid="tool-workspace-placeholder"');
        expect(html).not.toContain("设计器宿主未打开");
    });

    test("keeps the legacy slug and id aliases pointing at the same workspace", () => {
        const bySlug = render(<ToolRouteView catalog={catalog} category="ai-video" toolId="video-concat" />, "/tools/ai-video/video-concat");
        const byId = render(<ToolRouteView catalog={catalog} category="ai-video" toolId="VIDEO_CONCAT" />, "/tools/ai-video/video-concat");
        expect(bySlug).toContain('data-tool-id="VIDEO_CONCAT"');
        expect(byId).toContain('data-tool-id="VIDEO_CONCAT"');
    });
});

describe("TASK-INTEGRATE unchanged route contract", () => {
    test("category routes still resolve to the first enabled tool", () => {
        // `batch-generate` is a category slug in the sidebar, but it owns the batch workspace.
        for (const category of TOOL_CATEGORIES.filter((item) => item !== "batch-generate")) {
            const match = resolveToolRoute({ category }, catalog);
            expect(match.type).toBe("category-default");
            const expected = catalog.entries.find((entry) => entry.category === category && entry.enabled !== false)?.slug;
            expect(match.type === "category-default" ? match.toolSlug : undefined).toBe(expected);
        }
    });

    test("batch orchestration routes stay separate from tool detail", () => {
        expect(resolveToolRoute({ category: "batch-generate" }, catalog).type).toBe("batch-home");
        const detail = resolveToolRoute({ category: "batch-generate", toolId: "batch-2024" }, catalog);
        expect(detail.type).toBe("batch-detail");
        const html = renderTool("batch-generate", "batch-2024");
        expect(html).not.toContain('data-testid="tool-workspace"');
    });

    test("unknown category and unknown tool still 404", () => {
        expect(resolveToolRoute({ category: "nope" }, catalog).type).toBe("not-found");
        expect(resolveToolRoute({ category: "ecommerce-suite", toolId: "nope" }, catalog).type).toBe("not-found");
        expect(renderTool("ecommerce-suite", "nope")).not.toContain('data-testid="tool-workspace"');
    });

    test("sidebar keeps every category and expands the active category's tools", () => {
        for (const category of TOOL_CATEGORIES) {
            const first = catalog.entries.find((entry) => entry.category === category);
            if (!first) continue;
            const html = renderTool(category, first.slug);
            // Every category entry stays reachable, collapsed ones keep their count-only grouping.
            for (const slug of TOOL_CATEGORIES) expect(html).toContain(`/tools/${slug}`);
            // Only the active category lists its tools; that is the TASK-003 sidebar contract.
            for (const spec of toolSpecs.filter((item) => item.category === category)) {
                expect(html).toContain(`/tools/${spec.category}/${spec.slug}`);
            }
        }
    });

    test("feature flag: a disabled leading tool is skipped by the category default", () => {
        const flagged = buildToolCatalog({
            "./registry/index.ts": {
                toolSpecs: [
                    { ...toolSpecs.find((spec) => spec.id === "SCALE_UP")!, enabled: false },
                    { ...toolSpecs.find((spec) => spec.id === "AI_OUTPAINTING")! },
                ],
            },
        });
        const match = resolveToolRoute({ category: "ecommerce-suite" }, flagged);
        expect(match.type).toBe("category-default");
        expect(match.type === "category-default" ? match.toolSlug : undefined).toBe("ai-outpainting");
    });

    test("a catalog entry that disagrees with the registry keeps the specification placeholder", () => {
        const drifted = buildToolCatalog({
            "./registry/index.ts": {
                toolSpecs: [{ ...toolSpecs.find((spec) => spec.id === "SCALE_UP")!, makeType: 1, slug: "scale-up" }],
            },
        });
        const match = resolveToolRoute({ category: "ecommerce-suite", toolId: "scale-up" }, drifted);
        expect(match.type).toBe("tool");
        expect(resolveToolWorkspace(match.type === "tool" ? match.entry : undefined)).toBeUndefined();
        const html = render(<ToolRouteView catalog={drifted} category="ecommerce-suite" toolId="scale-up" />, "/tools/ecommerce-suite/scale-up");
        expect(html).toContain('data-testid="tool-workspace-placeholder"');
    });

    test("a tool id with no registry spec still renders the pending-spec placeholder", () => {
        const empty = buildToolCatalog({});
        const match = resolveToolRoute({ category: "ecommerce-suite", toolId: "future-tool" }, empty);
        expect(match.type).toBe("tool");
        expect(match.type === "tool" ? match.specPending : false).toBe(true);
        expect(resolveToolWorkspace(match.type === "tool" ? match.entry : undefined)).toBeUndefined();
    });
});
