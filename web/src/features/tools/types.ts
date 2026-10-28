import { z } from "zod";

/**
 * Shared contracts for the LinkFox-style tool workspace (TASK-001).
 *
 * Evidence: docs/V1.0/plan_linkfox_navigation/{tool-matrix.md,tool_specs.json,technical_design.md#ToolSpec}
 * and docs/analysis/assets/linkfox/schema_final.json (`type_final` is the wire-level makeType).
 *
 * The registry never fabricates upstream capability: a field only carries `required`/`defaultValue`
 * when the evidence states it, and `control` falls back to `unspecified` when no evidence exists.
 */

/** Navigation categories. `batch-generate` is an orchestration entry, it owns no ToolSpec. */
export const TOOL_CATEGORIES = ["ecommerce-suite", "smart-edit", "batch-generate", "product-design", "ai-video"] as const;
export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

/** Categories that own tools (everything except the batch orchestration entrance). */
export const TOOL_OWNER_CATEGORIES = ["ecommerce-suite", "smart-edit", "product-design", "ai-video"] as const;
export type ToolOwnerCategory = (typeof TOOL_OWNER_CATEGORIES)[number];

/** The 17 page layouts from technical_design.md. */
export const TOOL_LAYOUTS = [
    "suite",
    "color",
    "translate",
    "enhance",
    "outpaint",
    "mask",
    "crop",
    "repair",
    "scene",
    "replace",
    "model",
    "dress",
    "pod",
    "text",
    "extract",
    "designer",
    "video",
] as const;
export type ToolLayout = (typeof TOOL_LAYOUTS)[number];

/** Runtime adapter families. `designer-host` embeds a layer-composition workbench. */
export const TOOL_ADAPTERS = ["image", "video", "designer-host"] as const;
export type ToolAdapter = (typeof TOOL_ADAPTERS)[number];

/** Tool provenance in the upstream draw menu. */
export const TOOL_ORIGINS = ["original", "supplemental"] as const;
export type ToolOrigin = (typeof TOOL_ORIGINS)[number];

/**
 * Field controls available to the shared form renderer.
 * `unspecified` means the evidence does not pin a control; adapters must resolve it before submit.
 */
export const FIELD_CONTROLS = ["upload", "asset-list", "number", "select", "ratio", "text", "textarea", "boolean", "mask", "color", "json", "unspecified"] as const;
export type FieldControl = (typeof FIELD_CONTROLS)[number];

/** Where an enumerated option list must come from. Never hardcode enum options in the UI. */
export const FIELD_ENUM_SOURCES = ["chunk", "model-catalog"] as const;
export type FieldEnumSource = (typeof FIELD_ENUM_SOURCES)[number];

export interface FieldSpec {
    key: string;
    control: FieldControl;
    required: boolean;
    /** Only set when the evidence states a literal default. */
    defaultValue?: string | number | boolean;
    /** Set when options must be loaded from a chunk or the model catalog instead of being hardcoded. */
    enumSource?: FieldEnumSource;
    /** Extra constraint copied from the evidence (type/shape), consumed by the adapter's validator. */
    providerRule?: string;
}

export interface ToolSpec {
    /** Upstream make type id, uppercase snake case, unique across the registry. */
    id: string;
    /** 1-based matrix index (tool-matrix.md ordering). */
    index: number;
    /** Chinese display title from the evidence. */
    title: string;
    category: ToolOwnerCategory;
    /** Kebab-case canonical slug, unique inside its category. */
    slug: string;
    /** Canonical absolute route, always `/tools/<category>/<slug>`. */
    route: string;
    /** Wire-level makeType (`type_final` in schema_final.json). */
    makeType: number;
    origin: ToolOrigin;
    layout: ToolLayout;
    adapter: ToolAdapter;
    /** True when the batch orchestration entry may reference this tool. */
    batchCapable: boolean;
    /** False removes the tool from navigation without deleting its spec. */
    enabled: boolean;
    fields: FieldSpec[];
    /** Evidence caveat, e.g. a tool whose fields live in page state instead of make params. */
    notes?: string;
}

/** Canonical route builder; the registry tests assert every stored route equals this. */
export function canonicalToolRoute(category: ToolOwnerCategory, slug: string): string {
    return `/tools/${category}/${slug}`;
}

export const fieldSpecSchema = z.object({
    key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/, "field key must be an identifier"),
    control: z.enum(FIELD_CONTROLS),
    required: z.boolean(),
    defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
    enumSource: z.enum(FIELD_ENUM_SOURCES).optional(),
    providerRule: z.string().min(1).optional(),
});

export const toolCategorySchema = z.enum(TOOL_CATEGORIES);
export const toolOwnerCategorySchema = z.enum(TOOL_OWNER_CATEGORIES);
export const toolLayoutSchema = z.enum(TOOL_LAYOUTS);
export const toolAdapterSchema = z.enum(TOOL_ADAPTERS);
export const toolOriginSchema = z.enum(TOOL_ORIGINS);

export const toolSpecSchema = z
    .object({
        id: z.string().regex(/^[A-Z][A-Z0-9_]*$/, "tool id must be UPPER_SNAKE_CASE"),
        index: z.number().int().min(1).max(39),
        title: z.string().min(1),
        category: toolOwnerCategorySchema,
        slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case"),
        route: z.string().regex(/^\/tools\/[a-z0-9-]+\/[a-z0-9-]+$/, "route must be canonical"),
        makeType: z.number().int().positive(),
        origin: toolOriginSchema,
        layout: toolLayoutSchema,
        adapter: toolAdapterSchema,
        batchCapable: z.boolean(),
        enabled: z.boolean(),
        fields: z.array(fieldSpecSchema),
        notes: z.string().min(1).optional(),
    })
    .superRefine((spec, ctx) => {
        const expectedRoute = canonicalToolRoute(spec.category, spec.slug);
        if (spec.route !== expectedRoute) {
            ctx.addIssue({ code: "custom", path: ["route"], message: `route must be ${expectedRoute}` });
        }
        const seen = new Set<string>();
        for (const [position, field] of spec.fields.entries()) {
            if (seen.has(field.key)) {
                ctx.addIssue({ code: "custom", path: ["fields", position, "key"], message: `duplicate field ${field.key}` });
            }
            seen.add(field.key);
        }
    });

export type ToolSpecInput = z.input<typeof toolSpecSchema>;

/** Parse + validate one spec; throws on evidence drift. Used by adapters and the registry tests. */
export function parseToolSpec(value: unknown): ToolSpec {
    return toolSpecSchema.parse(value);
}

/** Validate without throwing; returns human readable issues for diagnostics. */
export function collectToolSpecIssues(value: unknown, label = "tool"): string[] {
    const result = toolSpecSchema.safeParse(value);
    if (result.success) return [];
    return result.error.issues.map((issue) => `${label}${issue.path.length ? `.${issue.path.join(".")}` : ""}: ${issue.message}`);
}
