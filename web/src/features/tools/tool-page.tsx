import { useCallback, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import i18n from "@/i18n";
import { Navigate, useParams } from "react-router-dom";

import { ToolShell } from "@/components/tools/tool-shell";
import { BatchPage } from "@/features/tools/batch-page";
import { useTaskRecovery } from "@/features/tools/use-task-recovery";
import { ToolSidebar, type ToolSidebarCategory } from "@/components/tools/tool-sidebar";
import NotFound from "@/pages/not-found";

// Registered tool workspaces (TASK-004..TASK-048). Static imports on purpose: the integration map
// must be exhaustive and type-checked, and a broken export has to fail the build instead of
// silently degrading a tool page back to the specification placeholder.
import { ProductImageSuiteWorkspace, ProductMarketMaterialWorkspace } from "@/components/tools/workspaces/suite";
import { DressSuiteWorkspace } from "@/components/tools/workspaces/dress-suite";
import { ColorV2Workspace } from "@/components/tools/workspaces/color-v2";
import { TranslateWorkspace } from "@/components/tools/workspaces/translate";
import { ScaleUpWorkspace, ProductRefineWorkspace } from "@/components/tools/workspaces/enhance";
import { OutpaintWorkspace } from "@/components/tools/workspaces/outpaint";
import { MaskWorkspace, RemovePenWorkspace } from "@/components/tools/workspaces/mask";
import { ChangeColorWorkspace } from "@/components/tools/workspaces/color";
import { CropWorkspace } from "@/components/tools/workspaces/crop";
import { FixColorWorkspace, HandRepairWorkspace } from "@/components/tools/workspaces/repair";
import { PrintingRepairWorkspace } from "@/components/tools/workspaces/printing-repair";
import { SceneWorkspace, SceneTransferWorkspace } from "@/components/tools/workspaces/scene";
import { ListingFissionWorkspace } from "@/components/tools/workspaces/listing-fission";
import { ProductSceneWorkspace } from "@/components/tools/workspaces/scene-fission";
import { ReplaceGoodsWorkspace } from "@/components/tools/workspaces/replace";
import { HandheldGoodsWorkspace } from "@/components/tools/workspaces/handheld-goods";
import { DressingWorkspace } from "@/components/tools/workspaces/dressing";
import { AiPostureWorkspace } from "@/components/tools/workspaces/model";
import { AiPoseGeneratorWorkspace } from "@/components/tools/workspaces/ai-pose-generator";
import { AiWearableWorkspace } from "@/components/tools/workspaces/dress";
import { MaterialPreviewWorkspace } from "@/components/tools/workspaces/material-preview";
import { AiTextStatic } from "@/components/tools/workspaces/ai-text-static";
import { SdsDesignWorkspace } from "@/components/tools/workspaces/pod";
import { OrnamentTextWorkspace } from "@/components/tools/workspaces/text";
import { PrintExtractWorkspace } from "@/components/tools/workspaces/extract";
import { AiDressingXsyWorkspace } from "@/components/tools/workspaces/dressing-xsy";
import { ImageTextEditWorkspace } from "@/components/tools/workspaces/image-text-edit";
import { DesignerWorkspace } from "@/components/tools/workspaces/designer";
import { ImageToVideoWorkspace } from "@/components/tools/workspaces/image-to-video";
import { SaleVideoWorkspace, VideoConcatWorkspace, AiVideoEditingWorkspace, VideoReplicationWorkspace } from "@/components/tools/workspaces/video";
import { VideoTranslationWorkspace } from "@/components/tools/workspaces/video-translation";
import { LocalPixelWorkspace } from "@/components/tools/workspaces/local-pixel";
import { ImageReplicationWorkspace } from "@/components/tools/workspaces/image-replication";
import {
    ADDITIONAL_TOOL_IDS,
    additionalToolSpecs,
    type AdditionalToolId,
} from "./registry/additional-tools";

import { toolSpecs } from "./registry";

/**
 * Route layer for the LinkFox-style tool workspace.
 *
 * Scope of TASK-003: canonical routes, ToolShell, sidebar, responsive + legacy compatibility.
 * Tool execution (upload/draft/task/result) belongs to TASK-004..TASK-048; TASK-INTEGRATE binds
 * every registry id to its real workspace through `TOOL_WORKSPACES`. A tool without a real
 * exported workspace keeps the specification-driven placeholder, which never claims a result.
 */

export const TOOL_CATEGORIES = ["ecommerce-suite", "smart-edit", "batch-generate", "product-design", "ai-video"] as const;
export type ToolCategorySlug = (typeof TOOL_CATEGORIES)[number];

/** The registry may key categories by short evidence names (`suite`, `edit`, `design`, `video`). */
const CATEGORY_ALIASES: Record<string, ToolCategorySlug> = {
    suite: "ecommerce-suite",
    edit: "smart-edit",
    batch: "batch-generate",
    design: "product-design",
    video: "ai-video",
};

const CATEGORY_LABELS: Record<ToolCategorySlug, { zh: string; en: string }> = {
    "ecommerce-suite": { zh: "电商套图", en: "E-commerce suite" },
    "smart-edit": { zh: "智能修图", en: "Smart edit" },
    "batch-generate": { zh: "批量生图", en: "Batch generate" },
    "product-design": { zh: "商品图设计", en: "Product design" },
    "ai-video": { zh: "AI 视频", en: "AI video" },
};

export interface ToolFieldSpec {
    key: string;
    control?: string;
    required?: boolean;
}

export interface ToolCatalogEntry {
    id: string;
    slug: string;
    title: string;
    category: ToolCategorySlug;
    makeType?: number | string;
    layout?: string;
    adapter?: string;
    origin?: "original" | "supplemental";
    enabled?: boolean;
    index?: number;
    fields: ToolFieldSpec[];
}

export interface ToolCatalog {
    entries: ToolCatalogEntry[];
}

export type ToolRouteMatch =
    | { type: "category-default"; category: ToolCategorySlug; toolSlug?: string }
    | { type: "tool"; category: ToolCategorySlug; requestedSlug: string; entry?: ToolCatalogEntry; specPending: boolean }
    | { type: "batch-home" }
    | { type: "batch-detail"; batchId: string }
    | { type: "legacy-redirect"; to: string }
    | { type: "not-found"; reason: "category" | "tool"; value: string };

/**
 * 工具名在数据层是 registry 里的中文字面量（模块加载即固化），界面这里按 id 取
 * `toolsNav.tools.<ID>` 译文；缺失时回落到 registry 原文，不会出现空标题。
 */
export function toolLabel(entry: { id: string; title: string }, language?: string) {
    return i18n.t(`toolsNav.tools.${entry.id}`, { defaultValue: entry.title, lng: language });
}

export function categoryLabel(category: ToolCategorySlug, language?: string) {
    const labels = CATEGORY_LABELS[category];
    return language?.toLowerCase().startsWith("en") ? labels.en : labels.zh;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalizeCategory(value: unknown): ToolCategorySlug | null {
    if (typeof value !== "string") return null;
    const key = value.trim().toLowerCase();
    if ((TOOL_CATEGORIES as readonly string[]).includes(key)) return key as ToolCategorySlug;
    return CATEGORY_ALIASES[key] ?? null;
}

function slugFromId(id: string) {
    return id.toLowerCase().replace(/_/g, "-");
}

function parseFields(value: unknown): ToolFieldSpec[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((field) => {
        const record = asRecord(field);
        if (!record) return [];
        const key = typeof record.key === "string" ? record.key : typeof record.name === "string" ? record.name : undefined;
        if (!key) return [];
        return [
            {
                key,
                control: typeof record.control === "string" ? record.control : undefined,
                required: typeof record.required === "boolean" ? record.required : undefined,
            },
        ];
    });
}

/** Normalises one registry entry; returns null when the value is not a tool spec. */
export function toCatalogEntry(value: unknown): ToolCatalogEntry | null {
    const record = asRecord(value);
    if (!record) return null;
    const rawId = typeof record.id === "string" ? record.id : typeof record.makeTypeId === "string" ? record.makeTypeId : undefined;
    const category = normalizeCategory(record.category ?? record.categorySlug);
    if (!rawId || !category) return null;
    const id = rawId.trim();
    const slug = typeof record.slug === "string" && record.slug.trim() ? record.slug.trim() : slugFromId(id);
    const title = typeof record.title === "string" ? record.title : typeof record.label === "string" ? record.label : id;
    const origin = record.origin === "supplemental" || record.origin === "original" ? record.origin : undefined;
    const makeType = typeof record.makeType === "number" || typeof record.makeType === "string" ? record.makeType : undefined;
    return {
        id,
        slug,
        title,
        category,
        makeType,
        layout: typeof record.layout === "string" ? record.layout : undefined,
        adapter: typeof record.adapter === "string" ? record.adapter : undefined,
        origin,
        enabled: typeof record.enabled === "boolean" ? record.enabled : undefined,
        index: typeof record.index === "number" ? record.index : undefined,
        fields: parseFields(record.fields),
    };
}

function collectCandidates(moduleExports: unknown): unknown[] {
    if (Array.isArray(moduleExports)) return moduleExports;
    const record = asRecord(moduleExports);
    if (!record) return [];
    const candidates: unknown[] = [];
    if (typeof record.id === "string") candidates.push(record);
    for (const value of Object.values(record)) {
        if (Array.isArray(value)) {
            candidates.push(...value);
            continue;
        }
        const nested = asRecord(value);
        if (!nested) continue;
        if (typeof nested.id === "string") candidates.push(nested);
        else candidates.push(...Object.values(nested));
    }
    return candidates;
}

/**
 * Builds the route catalog from registry module exports. Assumption (see report.md):
 * TASK-001 exposes specs as `toolSpecs`/`tools`/`registry` arrays, records keyed by id, or a
 * single spec per module. Unknown shapes are ignored instead of crashing routing.
 */
export function buildToolCatalog(modules: Record<string, unknown>): ToolCatalog {
    const byId = new Map<string, ToolCatalogEntry>();
    for (const moduleExports of Object.values(modules)) {
        for (const candidate of collectCandidates(moduleExports)) {
            const entry = toCatalogEntry(candidate);
            if (entry && !byId.has(entry.id)) byId.set(entry.id, entry);
        }
    }
    const entries = [...byId.values()].sort((a, b) => (a.index ?? 0) - (b.index ?? 0) || a.title.localeCompare(b.title));
    return { entries };
}

let cachedCatalog: ToolCatalog | null = null;

/**
 * Registry seam. The glob stays inside this function so the module stays importable in runtimes
 * without Vite glob support (bun test) as long as a catalog is injected explicitly.
 */
function readRegistryModules(): Record<string, unknown> {
    try {
        // Kept as a literal call so Vite can statically expand it; other runtimes (e.g. bun test)
        // throw here and simply fall back to an empty catalog instead of crashing routing.
        // Test files live next to the specs and import `bun:test`/`node:fs`; they must never enter
        // the browser bundle, hence the negative pattern.
        return import.meta.glob(["./registry/*.ts", "!./registry/*.test.ts"], { eager: true }) as Record<string, unknown>;
    } catch {
        return {};
    }
}

export function getToolCatalog(): ToolCatalog {
    if (!cachedCatalog) cachedCatalog = buildToolCatalog(readRegistryModules());
    return cachedCatalog;
}

function entryMatches(entry: ToolCatalogEntry, value: string) {
    const needle = value.trim().toLowerCase();
    return entry.slug.toLowerCase() === needle || entry.id.toLowerCase() === needle || slugFromId(entry.id) === needle;
}

function findEntry(catalog: ToolCatalog, category: ToolCategorySlug, value: string) {
    return catalog.entries.find((entry) => entry.category === category && entryMatches(entry, value));
}

function defaultToolSlug(catalog: ToolCatalog, category: ToolCategorySlug) {
    return catalog.entries.find((entry) => entry.category === category && entry.enabled !== false)?.slug;
}

/** Pure resolver shared by the route component and the route tests. */
export function resolveToolRoute(params: { category?: string; toolId?: string }, catalog: ToolCatalog): ToolRouteMatch {
    const rawCategory = (params.category ?? "").trim();
    const rawToolId = (params.toolId ?? "").trim();

    if (!rawCategory) {
        return { type: "category-default", category: TOOL_CATEGORIES[0], toolSlug: defaultToolSlug(catalog, TOOL_CATEGORIES[0]) };
    }

    const category = normalizeCategory(rawCategory);

    if (category === "batch-generate") {
        if (!rawToolId) return { type: "batch-home" };
        const entry = findEntry(catalog, category, rawToolId);
        if (entry) return { type: "tool", category, requestedSlug: entry.slug, entry, specPending: false };
        // `/tools/batch-generate/:batchId` shares this segment with batch-category tools.
        return { type: "batch-detail", batchId: rawToolId };
    }

    if (!category) {
        // Legacy deep links such as /tools/scale-up resolve to the canonical category route.
        const legacyEntry = catalog.entries.find((entry) => entryMatches(entry, rawCategory));
        if (legacyEntry && !rawToolId) return { type: "legacy-redirect", to: `/tools/${legacyEntry.category}/${legacyEntry.slug}` };
        return { type: "not-found", reason: "category", value: rawCategory };
    }

    if (!rawToolId) {
        return { type: "category-default", category, toolSlug: defaultToolSlug(catalog, category) };
    }

    const entry = findEntry(catalog, category, rawToolId);
    if (entry) return { type: "tool", category, requestedSlug: entry.slug, entry, specPending: false };

    if (!catalog.entries.some((item) => item.category === category)) {
        // Registry not integrated yet: keep the route usable, but never invent a spec.
        return { type: "tool", category, requestedSlug: rawToolId, specPending: true };
    }

    return { type: "not-found", reason: "tool", value: rawToolId };
}

function buildSidebarCategories(catalog: ToolCatalog, language: string): ToolSidebarCategory[] {
    return TOOL_CATEGORIES.map((category) => ({
        slug: category,
        label: categoryLabel(category, language),
        tools: catalog.entries
            .filter((entry) => entry.category === category)
            .map((entry) => ({ id: entry.id, slug: entry.slug, title: toolLabel(entry, language), origin: entry.origin, enabled: entry.enabled })),
    }));
}

function SpecRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="truncate text-sm tabular-nums">{value}</dd>
        </div>
    );
}

/* ============================== workspace integration ============================== */

/**
 * Every tool id that ships a real exported workspace. Kept as a literal union so the map below is
 * exhaustive: removing an entry is a type error, and `tool-page.integration.test.tsx` asserts this
 * list equals the registry ids one-for-one (no tool silently loses its workspace).
 */
export const TOOL_WORKSPACE_IDS = [
    "PRODUCT_IMAGE_SUITE",
    "DRESS_WEAR_SET",
    "CHANGE_COLOR_V2",
    "IMAGE_TRANSLATION",
    "SCALE_UP",
    "AI_OUTPAINTING",
    "AREA_REPAIR",
    "REMOVE_PEN",
    "CHANGE_COLOR",
    "IMAGE_CROP",
    "PRODUCT_REFINE",
    "FIX_COLOR",
    "PRINTING_REPAIR",
    "HAND_REPAIR",
    "NEW_REPLACE_BG_V2",
    "REPLACE_GOODS",
    "PRODUCT_SCENE",
    "HANDHELD_GOODS",
    "AI_DRESSING_V2",
    "AI_POSTURE",
    "AI_WEARABLE",
    "AI_TEXT",
    "ORNAMENT_TEXT",
    "SDS_DESIGN",
    "PRINT_EXTRACT",
    "AI_POSE_GENERATOR",
    "AI_DRESSING_XSY",
    "FISSION_LINK",
    "IMAGE_TEXT_EDIT",
    "MATERIAL_UPPER_BODY",
    "NEW_DESIGNER",
    "PRODUCT_MARKET_MATERIAL",
    "SCENE_TRANSFER",
    "IMAGE_TO_VIDEO",
    "SALE_VIDEO",
    "VIDEO_REPLICATION",
    "AI_VIDEO_EDITING",
    "VIDEO_TRANSLATION",
    "VIDEO_CONCAT",
    ...ADDITIONAL_TOOL_IDS,
] as const;

export type ToolWorkspaceId = (typeof TOOL_WORKSPACE_IDS)[number] | AdditionalToolId;

/**
 * Renders the workspace body. Implemented as a plain factory (not a component) so the route layer
 * can pick it at runtime; factories must only return elements, never call hooks themselves.
 */
export type ToolWorkspaceRenderer = (context: { toolId: ToolWorkspaceId }) => ReactNode;

/**
 * NEW_DESIGNER is a host: the designer validates `open` plus both callbacks before it may compose.
 * The tool page owns no persistence of its own, so the callbacks stay inert here — the designer
 * workspace still performs the real canvas composition, upload and draft restore on its own.
 */
function NewDesignerHostWorkspace() {
    const handleClose = useCallback(() => undefined, []);
    const handleDone = useCallback(() => undefined, []);
    return <DesignerWorkspace open onClose={handleClose} onDone={handleDone} />;
}

/** Tool id → real workspace. Static and exhaustive; TASK-INTEGRATE. */
export const TOOL_WORKSPACES: Record<ToolWorkspaceId, ToolWorkspaceRenderer> = {
    PRODUCT_IMAGE_SUITE: () => <ProductImageSuiteWorkspace />,
    DRESS_WEAR_SET: ({ toolId }) => <DressSuiteWorkspace toolId={toolId} />,
    CHANGE_COLOR_V2: () => <ColorV2Workspace />,
    IMAGE_TRANSLATION: () => <TranslateWorkspace />,
    SCALE_UP: () => <ScaleUpWorkspace />,
    AI_OUTPAINTING: () => <OutpaintWorkspace />,
    AREA_REPAIR: () => <MaskWorkspace />,
    REMOVE_PEN: () => <RemovePenWorkspace />,
    CHANGE_COLOR: () => <ChangeColorWorkspace />,
    IMAGE_CROP: () => <CropWorkspace />,
    PRODUCT_REFINE: () => <ProductRefineWorkspace />,
    FIX_COLOR: () => <FixColorWorkspace />,
    PRINTING_REPAIR: () => <PrintingRepairWorkspace />,
    HAND_REPAIR: () => <HandRepairWorkspace />,
    NEW_REPLACE_BG_V2: () => <SceneWorkspace />,
    REPLACE_GOODS: () => <ReplaceGoodsWorkspace />,
    PRODUCT_SCENE: ({ toolId }) => <ProductSceneWorkspace toolId={toolId} />,
    HANDHELD_GOODS: () => <HandheldGoodsWorkspace />,
    AI_DRESSING_V2: () => <DressingWorkspace />,
    AI_POSTURE: () => <AiPostureWorkspace />,
    AI_WEARABLE: ({ toolId }) => <AiWearableWorkspace toolId={toolId} />,
    AI_TEXT: () => <AiTextStatic />,
    ORNAMENT_TEXT: () => <OrnamentTextWorkspace />,
    SDS_DESIGN: () => <SdsDesignWorkspace />,
    PRINT_EXTRACT: () => <PrintExtractWorkspace />,
    AI_POSE_GENERATOR: () => <AiPoseGeneratorWorkspace />,
    AI_DRESSING_XSY: ({ toolId }) => <AiDressingXsyWorkspace toolId={toolId} />,
    FISSION_LINK: () => <ListingFissionWorkspace />,
    IMAGE_TEXT_EDIT: () => <ImageTextEditWorkspace />,
    MATERIAL_UPPER_BODY: () => <MaterialPreviewWorkspace />,
    NEW_DESIGNER: () => <NewDesignerHostWorkspace />,
    PRODUCT_MARKET_MATERIAL: () => <ProductMarketMaterialWorkspace />,
    SCENE_TRANSFER: ({ toolId }) => <SceneTransferWorkspace toolId={toolId} />,
    IMAGE_TO_VIDEO: ({ toolId }) => <ImageToVideoWorkspace toolId={toolId} />,
    SALE_VIDEO: () => <SaleVideoWorkspace />,
    VIDEO_REPLICATION: () => <VideoReplicationWorkspace />,
    AI_VIDEO_EDITING: () => <AiVideoEditingWorkspace />,
    VIDEO_TRANSLATION: () => <VideoTranslationWorkspace />,
    VIDEO_CONCAT: () => <VideoConcatWorkspace />,
    WHITE_BACKGROUND: () => <LocalPixelWorkspace toolId="WHITE_BACKGROUND" />,
    IMAGE_REPLICATION: () => <ImageReplicationWorkspace />,
    BATCH_MATTING: () => <LocalPixelWorkspace toolId="BATCH_MATTING" />,
};

const REGISTRY_SPECS = new Map([...toolSpecs, ...additionalToolSpecs].map((spec) => [spec.id, spec]));

/**
 * FE-G04：所有工具的历史记录统一收敛到工作区右栏顶部的「历史记录」Tab（或无历史区的工具保持静默），
 * 页面底部不再挂载共享 `ToolHistoryDock`。
 */
export const WORKSPACE_OWN_HISTORY: ReadonlySet<string> = new Set(TOOL_WORKSPACE_IDS);

/**
 * 原站 39 个工具页都没有「无限画布式」页面标题栏、面包屑或 `/tools/...` 路由串；
 * 标题由各自的配置列/工作区承担。所有工具统一使用沉浸式工作区，避免在每页重复自造页头。
 */
export const IMMERSIVE_TOOL_IDS: ReadonlySet<string> = new Set<string>(TOOL_WORKSPACE_IDS);

/**
 * A workspace is bound to the registry's canonical ToolSpec, not to a bare id from URL params.
 * The entry must agree with the registry on id, slug, category and makeType; an entry that only
 * looks similar (an injected/partial catalog) keeps the spec placeholder instead of mounting a
 * workspace whose adapter would then disagree with the route it was rendered on.
 */
export function isRegistryBackedEntry(entry?: ToolCatalogEntry): entry is ToolCatalogEntry {
    if (!entry) return false;
    const spec = REGISTRY_SPECS.get(entry.id);
    if (!spec) return false;
    return spec.slug === entry.slug && spec.category === entry.category && String(spec.makeType) === String(entry.makeType);
}

/** Real workspace for an entry, or undefined when the tool still needs the placeholder. */
export function resolveToolWorkspace(entry?: ToolCatalogEntry): ToolWorkspaceRenderer | undefined {
    if (!isRegistryBackedEntry(entry)) return undefined;
    const id = entry.id as ToolWorkspaceId;
    return Object.prototype.hasOwnProperty.call(TOOL_WORKSPACES, id) ? TOOL_WORKSPACES[id] : undefined;
}

function WorkspacePlaceholder({ entry, requestedSlug, specPending, category }: { entry?: ToolCatalogEntry; requestedSlug: string; specPending: boolean; category: ToolCategorySlug }) {
    return (
        <div className="flex flex-col gap-4" data-testid="tool-workspace-placeholder" data-spec-pending={specPending ? "true" : "false"}>
            <section className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3">
                <h2 className="text-sm font-medium">{specPending ? "规格驱动占位工作区｜ToolSpec 尚未接入" : "规格驱动占位工作区"}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {specPending
                        ? `路由 /tools/${category}/${requestedSlug} 已按 canonical 规则命中，但未检测到该工具的 ToolSpec（注册表由 TASK-001 提供）。本页只展示路由与壳层状态，不会上传、不会发起生成、不会显示任何结果。`
                        : "表单、上传、任务与结果组件由 TASK-004 起的适配器接入。当前页面只按 ToolSpec 展示字段契约，不会发起生成，也没有可展示的生成结果。"}
                </p>
            </section>

            <div className="grid gap-4 xl:grid-cols-[minmax(320px,360px)_minmax(0,1fr)]">
                <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
                    <h2 className="text-sm font-medium">规格摘要</h2>
                    <dl className="grid grid-cols-2 gap-3">
                        <SpecRow label="Tool id" value={entry?.id ?? requestedSlug} />
                        <SpecRow label="slug" value={entry?.slug ?? requestedSlug} />
                        <SpecRow label="category" value={category} />
                        <SpecRow label="layout" value={entry?.layout ?? "未声明"} />
                        <SpecRow label="adapter" value={entry?.adapter ?? "未声明"} />
                        <SpecRow label="makeType" value={entry?.makeType === undefined ? "未声明" : String(entry.makeType)} />
                    </dl>
                    <div className="mt-1 flex flex-col gap-2">
                        <button type="button" disabled className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground opacity-50" title="执行适配器尚未接入，点击不会产生任何任务">
                            生成（适配器未接入）
                        </button>
                        <button type="button" disabled className="h-9 rounded-lg border border-border px-4 text-sm text-muted-foreground opacity-60">
                            保存资产（未接入）
                        </button>
                        <p className="text-xs leading-5 text-muted-foreground">按钮禁用是契约的一部分：没有适配器就没有任务，也不存在可伪造的成功状态。</p>
                    </div>
                </section>

                <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-2">
                        <h2 className="text-sm font-medium">字段契约</h2>
                        <span className="text-xs tabular-nums text-muted-foreground">{entry?.fields.length ?? 0} 个字段</span>
                    </div>
                    {entry && entry.fields.length > 0 ? (
                        <ul className="flex flex-col divide-y divide-border text-sm">
                            {entry.fields.map((field) => (
                                <li key={field.key} className="flex items-center gap-3 py-2">
                                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{field.key}</span>
                                    <span className="shrink-0 text-xs text-muted-foreground">{field.control ?? "控件未声明"}</span>
                                    <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">{field.required ? "必填" : "可选"}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs leading-5 text-muted-foreground">尚无字段契约。字段必须来自真实 ToolSpec，这里不会生成占位字段。</p>
                    )}
                    <div className="mt-auto rounded-md border border-dashed border-border px-3 py-6 text-center text-xs leading-5 text-muted-foreground">结果区：空状态。尚未运行任何任务。</div>
                </section>
            </div>
        </div>
    );
}

function CategoryHome({ category, catalog, sidebar }: { category: ToolCategorySlug; catalog: ToolCatalog; sidebar: ReactNode }) {
    const { i18n } = useTranslation();
    const tools = catalog.entries.filter((entry) => entry.category === category);
    return (
        <ToolShell title={categoryLabel(category, i18n.language)} subtitle={`/tools/${category}`} breadcrumb={i18n.t("toolsNav.breadcrumbRoot", { defaultValue: "工具 / 分类" })} sidebar={sidebar}>
            <section className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-sm font-medium">分类首页</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {tools.length > 0 ? "选择左侧工具进入 canonical 工具页；此页不执行任务。" : "该分类尚无已注册工具，注册表（TASK-001）接入后会自动出现在左侧工具栏。"}
                </p>
                {tools.length > 0 ? (
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {tools.map((entry) => (
                            <li key={entry.id}>
                                <a href={`/tools/${category}/${entry.slug}`} className="flex h-11 items-center justify-between gap-2 rounded-md border border-border px-3 text-sm transition hover:bg-accent">
                                    <span className="truncate">{entry.title}</span>
                                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{entry.slug}</span>
                                </a>
                            </li>
                        ))}
                    </ul>
                ) : null}
            </section>
        </ToolShell>
    );
}

export interface ToolRouteViewProps {
    catalog: ToolCatalog;
    category?: string;
    toolId?: string;
}

/** Route body, exported so tests can drive it with an explicit catalog. */
export function ToolRouteView({ catalog, category, toolId }: ToolRouteViewProps) {
    const { i18n } = useTranslation();
    const match = useMemo(() => resolveToolRoute({ category, toolId }, catalog), [catalog, category, toolId]);
    const sidebarCategories = useMemo(() => buildSidebarCategories(catalog, i18n.language), [catalog, i18n.language]);
    const activeCategory = normalizeCategory(category ?? "") ?? TOOL_CATEGORIES[0];
    const activeToolSlug = match.type === "tool" ? match.requestedSlug : undefined;
    const sidebar = <ToolSidebar categories={sidebarCategories} activeCategory={activeCategory} activeToolSlug={activeToolSlug} />;

    switch (match.type) {
        case "legacy-redirect":
            return <Navigate to={match.to} replace />;
        case "category-default":
            if (!match.toolSlug) return <CategoryHome category={match.category} catalog={catalog} sidebar={sidebar} />;
            return <Navigate to={`/tools/${match.category}/${match.toolSlug}`} replace />;
        case "batch-home":
            return <BatchPage sidebar={sidebar} />;
        case "batch-detail":
            return <BatchPage batchId={match.batchId} sidebar={sidebar} />;
        case "not-found":
            return <NotFound />;
        case "tool": {
            const title = match.entry ? toolLabel(match.entry, i18n.language) : match.requestedSlug;
            const workspace = resolveToolWorkspace(match.entry);
            return (
                <ToolShell
                    title={title}
                    subtitle={
                        IMMERSIVE_TOOL_IDS.has(match.entry?.id ?? "")
                            ? undefined
                            : `/tools/${match.category}/${match.requestedSlug}`
                    }
                    breadcrumb={
                        IMMERSIVE_TOOL_IDS.has(match.entry?.id ?? "")
                            ? undefined
                            : `${categoryLabel(match.category, i18n.language)} / ${title}`
                    }
                    immersive={IMMERSIVE_TOOL_IDS.has(match.entry?.id ?? "")}
                    badges={
                        match.specPending ? (
                            <span className="shrink-0 rounded border border-border px-1.5 text-[11px] leading-5 text-muted-foreground">{i18n.t("toolsNav.badges.specPending", { defaultValue: "规格未接入" })}</span>
                        ) : match.entry?.origin === "supplemental" ? (
                            <span className="shrink-0 rounded border border-border px-1.5 text-[11px] leading-5 text-muted-foreground">{i18n.t("toolsNav.badges.supplemental")}</span>
                        ) : null
                    }
                    sidebar={sidebar}
                >
                    {workspace && match.entry ? (
                        <div data-testid="tool-workspace" data-workspace="ready" data-tool-id={match.entry.id} className={IMMERSIVE_TOOL_IDS.has(match.entry.id) ? "h-full min-h-0 min-w-0" : "min-w-0"}>
                            {workspace({ toolId: match.entry.id as ToolWorkspaceId })}
                        </div>
                    ) : (
                        <WorkspacePlaceholder entry={match.entry} requestedSlug={match.requestedSlug} specPending={match.specPending} category={match.category} />
                    )}
                </ToolShell>
            );
        }
    }
}

export default function ToolPage() {
    const params = useParams<{ category?: string; toolId?: string }>();
    const catalog = useMemo(() => getToolCatalog(), []);
    // 刷新后把落盘任务收敛到终态（否则「提交中 / 结果未知」会永久停留）。
    useTaskRecovery();
    return <ToolRouteView catalog={catalog} category={params.category} toolId={params.toolId} />;
}
