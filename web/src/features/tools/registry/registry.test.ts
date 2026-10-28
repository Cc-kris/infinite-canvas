import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { canonicalToolRoute, collectToolSpecIssues, toolSpecSchema } from "../types";
import { BATCH_TOOL_IDS, TOOLS, TOOL_CATEGORY_META, TOOL_COUNT, assertToolRegistry, getBatchTools, getCategoryDefaultTool, getEnabledTools, getToolById, getToolByRoute, getToolBySlug, isToolCenterEnabled, parseToolRoute, registryIssues, toolSpecs, toolsByCategory } from "./index";

const repoRoot = resolve(import.meta.dir, "../../../../../");
const evidenceDir = resolve(repoRoot, "docs/V1.0/plan_linkfox_navigation");

type EvidenceTool = {
    id: string;
    index: number;
    label: string;
    categorySlug: string;
    slug: string;
    route: string;
    origin: string;
    layout: string;
    fields: string[];
    field_controls: Record<string, string>;
    field_schema: Record<string, string>;
};

const evidence = JSON.parse(readFileSync(resolve(evidenceDir, "tool_specs.json"), "utf8")) as { tools: EvidenceTool[]; batchReferences: string[] };
const schemaFinal = JSON.parse(readFileSync(resolve(repoRoot, "docs/analysis/assets/linkfox/schema_final.json"), "utf8")) as Record<string, { type_final: number }>;

/** tool_specs.json encodes a required field as `required=是` inside `field_schema`. */
function isRequiredByEvidence(note: string | undefined): boolean {
    return typeof note === "string" && note.includes("required=是");
}

describe("registry vs evidence documents", () => {
    test("keeps 1:1 parity with tool_specs.json (ids, order, titles, routes, fields)", () => {
        expect(TOOL_COUNT).toBe(evidence.tools.length);
        expect(evidence.tools.length).toBe(39);

        const byId = new Map(toolSpecs.map((spec) => [spec.id, spec]));
        for (const tool of evidence.tools) {
            const spec = byId.get(tool.id);
            expect(spec, `missing ${tool.id}`).toBeDefined();
            if (!spec) continue;
            expect(spec.index).toBe(tool.index);
            expect(spec.title).toBe(tool.label);
            expect(spec.category).toBe(tool.categorySlug as typeof spec.category);
            expect(spec.slug).toBe(tool.slug);
            expect(spec.route).toBe(tool.route);
            expect(spec.route).toBe(canonicalToolRoute(spec.category, spec.slug));
            expect(spec.layout).toBe(tool.layout as typeof spec.layout);
            expect(spec.origin).toBe(tool.origin as typeof spec.origin);
            expect(spec.fields.map((field) => field.key)).toEqual(tool.fields);
            expect(spec.makeType).toBe(schemaFinal[tool.id].type_final);
        }
    });

    test("keeps declared defaults only where evidence states them, and required flags exactly", () => {
        const byId = new Map(evidence.tools.map((tool) => [tool.id, tool]));
        let requiredCount = 0;
        let defaultCount = 0;

        for (const spec of toolSpecs) {
            const tool = byId.get(spec.id);
            expect(tool).toBeDefined();
            if (!tool) continue;
            for (const field of spec.fields) {
                const controlNote = tool.field_controls[field.key];
                expect(controlNote, `${spec.id}.${field.key} missing control evidence`).toBeDefined();
                expect(field.required, `${spec.id}.${field.key} required drift`).toBe(isRequiredByEvidence(tool.field_schema[field.key]));
                if (field.required) requiredCount += 1;
                if (field.defaultValue !== undefined) defaultCount += 1;
                if (field.enumSource) expect(["chunk", "model-catalog"]).toContain(field.enumSource);
            }
        }

        expect(requiredCount).toBe(171);
        expect(defaultCount).toBe(33);
        expect(toolSpecs.reduce((sum, spec) => sum + spec.fields.length, 0)).toBe(384);
    });

    test("batch-capable tools match batchReferences.json ordering", () => {
        expect([...BATCH_TOOL_IDS]).toEqual(evidence.batchReferences);
        expect(BATCH_TOOL_IDS.length).toBe(12);
        const batch = getBatchTools();
        expect(batch.map((spec) => spec.id)).toEqual(evidence.batchReferences);
        for (const spec of toolSpecs) {
            expect(spec.batchCapable).toBe(evidence.batchReferences.includes(spec.id));
        }
    });

    test("category metadata mirrors the five navigation categories", () => {
        expect(TOOL_CATEGORY_META.map((meta) => meta.slug)).toEqual(["ecommerce-suite", "smart-edit", "batch-generate", "product-design", "ai-video"]);
        const ownerMeta = TOOL_CATEGORY_META.filter((meta) => meta.ownsTools);
        expect(ownerMeta).toHaveLength(4);

        for (const meta of TOOL_CATEGORY_META) {
            const listed = toolSpecs.filter((spec) => spec.category === meta.slug).length;
            expect(listed).toBe(meta.toolCount);
        }
        // The batch orchestration entrance is a route, never a ToolSpec owner.
        expect(toolSpecs.some((spec) => (spec.category as string) === "batch-generate")).toBe(false);
    });
});

describe("structural integrity", () => {
    test("registryIssues() is empty and no spec silently violates the schema", () => {
        expect(registryIssues()).toEqual([]);
        expect(() => assertToolRegistry()).not.toThrow();
        for (const spec of toolSpecs) expect(collectToolSpecIssues(spec, spec.id)).toEqual([]);
    });

    test("ids, indexes, routes and makeTypes are unique and contiguous", () => {
        const ids = new Set(toolSpecs.map((spec) => spec.id));
        const routes = new Set(toolSpecs.map((spec) => spec.route));
        const makeTypes = new Set(toolSpecs.map((spec) => spec.makeType));
        expect(ids.size).toBe(TOOL_COUNT);
        expect(routes.size).toBe(TOOL_COUNT);
        expect(makeTypes.size).toBe(TOOL_COUNT);
        expect([...toolSpecs].map((spec) => spec.index).sort((a, b) => a - b)).toEqual(Array.from({ length: TOOL_COUNT }, (_, i) => i + 1));
    });

    test("every spec round-trips through the zod contract", () => {
        for (const spec of toolSpecs) expect(toolSpecSchema.parse(spec)).toEqual(spec);
    });

    test("page-state tool is documented instead of faking make fields", () => {
        const spec = getToolById("NEW_REPLACE_BG_V2");
        expect(spec).toBeDefined();
        expect(spec?.fields).toEqual([]);
        // technical_design.md keeps this page on the image adapter (canvas state drives submit).
        expect(spec?.adapter).toBe("image");
        expect(spec?.layout).toBe("scene");
        expect(spec?.notes ?? "").toContain("页面");
        expect(evidence.tools.find((tool) => tool.id === "NEW_REPLACE_BG_V2")?.fields).toEqual([]);
    });

    test("the only layer-composition workbench is wired to the designer-host adapter", () => {
        const hosts = toolSpecs.filter((spec) => spec.adapter === "designer-host");
        expect(hosts.map((spec) => spec.id)).toEqual(["NEW_DESIGNER"]);
        expect(hosts[0].layout).toBe("designer");
        expect(hosts[0].category).toBe("product-design");
        expect(toolSpecs.filter((spec) => spec.adapter === "video").map((spec) => spec.id)).toHaveLength(6);
    });
});

describe("schema rejects drifted evidence", () => {
    const base = toolSpecs[0];

    test("rejects unknown categories, layouts and adapters", () => {
        expect(toolSpecSchema.safeParse({ ...base, category: "misc" }).success).toBe(false);
        expect(toolSpecSchema.safeParse({ ...base, layout: "dashboard" }).success).toBe(false);
        expect(toolSpecSchema.safeParse({ ...base, adapter: "canvas" }).success).toBe(false);
        expect(toolSpecSchema.safeParse({ ...base, origin: "third-party" }).success).toBe(false);
    });

    test("rejects a route that disagrees with category+slug", () => {
        const issues = collectToolSpecIssues({ ...base, route: "/tools/wrong/path" }, "drift");
        expect(issues.some((issue) => issue.includes("route must be"))).toBe(true);
    });

    test("rejects duplicate field keys and malformed identifiers", () => {
        const duplicated = { ...base, fields: [base.fields[0], base.fields[0]] };
        expect(collectToolSpecIssues(duplicated).some((issue) => issue.includes("duplicate field"))).toBe(true);
        expect(collectToolSpecIssues({ ...base, fields: [{ key: "1bad", control: "text", required: false }] }).length).toBeGreaterThan(0);
        expect(collectToolSpecIssues({ ...base, fields: [{ key: "ok", control: "slider", required: false }] }).length).toBeGreaterThan(0);
    });

    test("rejects a non-positive makeType and an out-of-range index", () => {
        expect(toolSpecSchema.safeParse({ ...base, makeType: 0 }).success).toBe(false);
        expect(toolSpecSchema.safeParse({ ...base, index: 0 }).success).toBe(false);
        expect(toolSpecSchema.safeParse({ ...base, index: TOOL_COUNT + 1 }).success).toBe(false);
    });
});

describe("lookup helpers", () => {
    test("id / slug / route lookups resolve the same spec", () => {
        for (const spec of toolSpecs) {
            expect(getToolById(spec.id)).toBe(spec);
            expect(getToolBySlug(spec.category, spec.slug)).toBe(spec);
            expect(getToolByRoute(spec.route)).toBe(spec);
            expect(getToolByRoute(`${spec.route}/`)).toBe(spec);
        }
        expect(getToolById("NOPE")).toBeUndefined();
        expect(getToolByRoute("/tools/nope/nope")).toBeUndefined();
    });

    test("category listing preserves matrix order and default tool is the first entry", () => {
        for (const [category, tools] of toolsByCategory) {
            expect(tools.length).toBeGreaterThan(0);
            const indexes = tools.map((spec) => spec.index);
            expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
            expect(getCategoryDefaultTool(category)).toBe(tools[0]);
            expect(tools[0].route).toBe(`/tools/${category}/${tools[0].slug}`);
        }
        expect(getCategoryDefaultTool("batch-generate" as never)).toBeUndefined();
    });

    test("parseToolRoute understands canonical, trailing-slash and legacy paths", () => {
        const spec = toolSpecs[0];
        expect(parseToolRoute(spec.route)?.tool).toBe(spec);
        expect(parseToolRoute(`${spec.route}/`)?.tool).toBe(spec);
        // Category landings are resolved by the page layer, not by the tool registry.
        expect(parseToolRoute(`/tools/${spec.category}`)).toBeNull();
        expect(parseToolRoute("/tools/batch-generate")).toBeNull();
        expect(parseToolRoute("/tools/ecommerce-suite/not-a-tool")).toEqual({ category: "ecommerce-suite", slug: "not-a-tool", tool: undefined });
        expect(parseToolRoute("/tools/unknown/thing")).toBeNull();
        expect(parseToolRoute("not-a-route")).toBeNull();
    });
});

describe("feature flag and rollout switch", () => {
    test("defaults to enabled and honours an explicit kill switch", () => {
        expect(isToolCenterEnabled({ VITE_FEATURE_LINKFOX_TOOLS: "" })).toBe(true);
        expect(isToolCenterEnabled({ VITE_FEATURE_LINKFOX_TOOLS: "true" })).toBe(true);
        for (const off of ["0", "false", "off", "disabled", "no", " FALSE "]) {
            expect(isToolCenterEnabled({ VITE_FEATURE_LINKFOX_TOOLS: off })).toBe(false);
        }
    });

    test("getEnabledTools drops disabled specs without deleting them", () => {
        const enabled = getEnabledTools({ VITE_FEATURE_LINKFOX_TOOLS: "true" });
        expect(enabled.map((spec) => spec.id)).toEqual(toolSpecs.filter((spec) => spec.enabled).map((spec) => spec.id));
        expect(getEnabledTools({ VITE_FEATURE_LINKFOX_TOOLS: "false" })).toEqual([]);
        expect(TOOLS).toBe(toolSpecs);
    });
});
