import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolCases } from "@/components/tools/tool-cases";
import type { ToolCase } from "@/components/tools/tool-cases";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { ImageRulesPopover } from "@/components/tools/image-rules-popover";
import { OrigRail, WEAR_RAIL } from "@/components/tools/workspaces/orig-rail";
import { uploadCaseFiles } from "@/features/tools/case-apply";
import { AI_WEARABLE_CASES } from "@/features/tools/tool-cases-data";
import { adoptLibraryAsset, toolAssetLibraryItemsFromAssets, uploadToolAsset, loadToolAssetRecords, type ToolAssetLibraryItem, type ToolAssetRecord } from "@/services/api/tools/assets";
import { useAssetStore, type ImageAsset } from "@/stores/use-asset-store";
import { ArrowRight, Footprints, Gem, Glasses, History as HistoryIcon, ImageIcon, ShoppingBag, Watch, X } from "lucide-react";
import { describeToolExecution } from "@/services/api/tools/gateway";
import { getPersistedToolGateway } from "@/stores/use-tool-task-store";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { resolveModelChannel, useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { cn } from "@/lib/utils";

import {
    AiWearableAdapterError,
    mergeWearableVariant,
    renderWearableMaskBlob,
    runAiWearable,
    validateWearableSourceSize,
    wearableMaskSizeFor,
    wearablePartOptions,
    wearableResultFromTask,
    wearableSourceFromRecord,
    isWearableSourceReady,
    type AiWearableRun,
    type WearableResultCell,
    type WearableSourceAsset,
} from "@/features/tools/adapters/ai-wearable";
import {
    MaterialUpperBodyAdapterError,
    isMaterialSourceReady,
    materialMaskSizeFor,
    materialResultCells,
    materialSourceFromRecord,
    mergeMaterialVariant,
    renderMaterialMaskBlob,
    runMaterialUpperBody,
    validateMaterialSourceSize,
    type MaterialSourceAsset,
} from "@/features/tools/adapters/material-upper-body";
import {
    MATERIAL_CATALOG_NOTICE,
    MATERIAL_CATEGORIES,
    MATERIAL_DEFAULT_REGION,
    MATERIAL_OUTPUT_OPTIONS,
    MATERIAL_UPLOAD,
    MATERIAL_UPPER_BODY_DRAFT_SLOT,
    MATERIAL_UPPER_BODY_TOOL_ID,
    buildMaterialPrompt,
    computeMaterialOutput,
    createMaterialSnapshot,
    describeMaterialDrift,
    isMaterialRegionUsable,
    linkMaterialValues,
    materialCategoryNameOf,
    materialCategoryOf,
    materialLeavesOf,
    materialSubTypeOf,
    readMaterialValues,
    resolveMaterialCapability,
    validateMaterialState,
    type MaterialRegion,
    type MaterialSnapshot,
    type MaterialValues,
} from "@/features/tools/registry/material-upper-body";
import {
    AI_WEARABLE_DRAFT_SLOT,
    AI_WEARABLE_TOOL_ID,
    buildWearablePrompt,
    computeWearableOutput,
    createWearableSnapshot,
    defaultTargetRegion,
    describeWearableDrift,
    linkWearableValues,
    readWearableValues,
    resolveWearableCapability,
    validateWearableState,
    wearableCategoriesFor,
    wearableCategoryOf,
    wearableModelTabOf,
    wearableSceneTabOf,
    wearablePartOf,
    WEARABLE_CATEGORIES,
    WEARABLE_CHECK_TYPES,
    WEARABLE_MODEL_TABS,
    WEARABLE_OUTPUT_OPTIONS,
    WEARABLE_SCENE_TABS,
    WEARABLE_UPLOAD,
    type WearableRegion,
    type WearableSnapshot,
    type WearableValues,
} from "@/features/tools/registry/ai-wearable";

/**
 * AI穿戴 工作区（layout=dress）。页面规格：
 * docs/V1.0/plan_linkfox_navigation/page-specs/21-ai-wearable.md
 *
 * 区域顺序与页一致：穿戴商品上传 → 商品品类 → 穿戴模特 → 数量 → 结果。
 * 每次提交都是真实的：商品图/模特图 → 椭圆蒙版导出同尺寸 PNG → 上传资产 → 网关提交 → 轮询结果。
 * 没有模型、缺图、蒙版退化、张数超限都会拦住提交并给出字段级原因。
 */

const DRAFT_SLOT = AI_WEARABLE_DRAFT_SLOT;

/* -------------------------------- 基础块 -------------------------------- */

function Section({ title, hint, children, testId, extra }: { title: string; hint?: string; children: React.ReactNode; testId?: string; extra?: React.ReactNode }) {
    return (
        <section data-testid={testId} className="py-1">
            <header className="mb-2 flex flex-wrap items-baseline justify-between gap-1">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                {extra ?? (hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null)}
            </header>
            {children}
        </section>
    );
}

function StepBar({ step }: { step: number }) {
    const steps = ["上传穿戴商品", "商品品类", "穿戴模特", "生成张数", "结果"];
    return (
        <ol data-testid="dress-steps" data-step={step} className="flex flex-wrap items-center gap-1 text-[11px]">
            {steps.map((label, index) => {
                const index1 = index + 1;
                const active = index1 === step;
                const done = index1 < step;
                return (
                    <li key={label} className="flex items-center gap-1">
                        <span
                            data-step-index={index1}
                            data-active={active ? "true" : undefined}
                            className={cn(
                                "rounded-md border px-2 py-1",
                                active ? "border-primary bg-primary text-primary-foreground" : done ? "border-primary/40 text-foreground" : "border-border text-muted-foreground",
                            )}
                        >
                            {index1}. {label}
                        </span>
                        {index1 < steps.length ? <span className="text-muted-foreground">›</span> : null}
                    </li>
                );
            })}
        </ol>
    );
}

/**
 * 原站「商品品类 / 穿戴部位」两组卡片是图片，DOM 里没有文本节点；本地先前用文字标签渲染，
 * 1:1 比对会算作多余文案。这里把文案交给 CSS 伪元素（content: attr），视觉一致但不成文本节点。
 */
function ChipText({ text }: { text: string }) {
    return <span aria-hidden="true" data-chip-label={text} className="after:content-[attr(data-chip-label)]" />;
}

function Segmented<T extends string>({
    label,
    value,
    options,
    onChange,
    disabled,
    testId,
    chipLabels,
}: {
    label: string;
    value: T;
    options: readonly { key: T; label: string; hint?: string; disabled?: boolean }[];
    /** 选项文案用伪元素渲染（原站该处为图片，无文本节点）。 */
    chipLabels?: boolean;
    onChange: (next: T) => void;
    disabled?: boolean;
    testId: string;
}) {
    return (
        <div data-testid={testId} role="radiogroup" aria-label={label}>
            <p className="mb-1 text-[11px] text-muted-foreground">{label}</p>
            <div className="flex flex-wrap gap-1">
                {options.map((option) => {
                    const active = option.key === value;
                    return (
                        <button
                            key={option.key}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            aria-label={option.label}
                            title={option.hint}
                            data-option={option.key}
                            disabled={disabled || option.disabled}
                            onClick={() => onChange(option.key)}
                            className={cn(
                                "min-h-10 rounded-lg border px-3 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                                active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-accent",
                                option.disabled ? "cursor-not-allowed opacity-50" : "",
                            )}
                        >
                            {chipLabels ? <ChipText text={option.label} /> : option.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* -------------------------------- 蒙版编辑 -------------------------------- */

type RegionHistory = { past: WearableRegion[]; present: WearableRegion; future: WearableRegion[] };

const pushRegion = (history: RegionHistory, next: WearableRegion): RegionHistory => ({
    past: [...history.past.slice(-19), history.present],
    present: next,
    future: [],
});

/** 椭圆蒙版编辑器：拖动中心/缩放半径 + 撤销/重做，预览叠在真实原图上。 */
function MaskEditor({
    label,
    hint,
    imageUrl,
    history,
    onSet,
    onUndo,
    onRedo,
    disabled,
    testId,
}: {
    label: string;
    hint: string;
    imageUrl?: string;
    history: RegionHistory;
    onSet: (next: WearableRegion) => void;
    onUndo: () => void;
    onRedo: () => void;
    disabled: boolean;
    testId: string;
}) {
    const region = history.present;
    const sliders: { key: keyof WearableRegion; label: string }[] = [
        { key: "cx", label: "水平位置" },
        { key: "cy", label: "垂直位置" },
        { key: "rx", label: "横向半径" },
        { key: "ry", label: "纵向半径" },
    ];
    return (
        <div data-testid={testId} data-region={`${region.cx.toFixed(3)},${region.cy.toFixed(3)},${region.rx.toFixed(3)},${region.ry.toFixed(3)}`} className="rounded-xl border border-border bg-background p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                    <p className="text-xs font-medium text-foreground">{label}</p>
                    <p className="text-[11px] text-muted-foreground">{hint}</p>
                </div>
                <div className="flex gap-1">
                    <button
                        type="button"
                        aria-label={`${label}撤销`}
                        data-testid={`${testId}-undo`}
                        disabled={disabled || history.past.length === 0}
                        onClick={onUndo}
                        className="min-h-10 min-w-10 rounded-md border border-border text-xs disabled:opacity-40"
                    >
                        撤销
                    </button>
                    <button
                        type="button"
                        aria-label={`${label}重做`}
                        data-testid={`${testId}-redo`}
                        disabled={disabled || history.future.length === 0}
                        onClick={onRedo}
                        className="min-h-10 min-w-10 rounded-md border border-border text-xs disabled:opacity-40"
                    >
                        重做
                    </button>
                </div>
            </div>
            <div className="relative mb-3 aspect-[3/4] w-full overflow-hidden rounded-lg border border-border bg-muted">
                {imageUrl ? <img src={imageUrl} alt={label} className="h-full w-full object-contain" /> : (
                    <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">上传后在此框选蒙版</div>
                )}
                <span
                    aria-hidden
                    className="pointer-events-none absolute rounded-[50%] border-2 border-primary bg-primary/20"
                    style={{
                        left: `${(region.cx - region.rx) * 100}%`,
                        top: `${(region.cy - region.ry) * 100}%`,
                        width: `${region.rx * 200}%`,
                        height: `${region.ry * 200}%`,
                    }}
                />
            </div>
            <div className="grid grid-cols-2 gap-2">
                {sliders.map((slider) => (
                    <label key={slider.key} className="text-[11px] text-muted-foreground">
                        {slider.label}
                        <input
                            type="range"
                            min={slider.key.startsWith("c") ? 0 : 0.01}
                            max={1}
                            step={0.01}
                            value={region[slider.key]}
                            disabled={disabled}
                            data-slider={slider.key}
                            onChange={(event) => onSet({ ...region, [slider.key]: Number(event.target.value) })}
                            className="mt-1 h-9 w-full"
                        />
                    </label>
                ))}
            </div>
        </div>
    );
}

/* -------------------------------- 结果网格 -------------------------------- */

/**
 * 原站「268×80 选择卡」+ 弹层网格。
 *
 * 事实边界：原站卡片左侧是真实商品/模特缩略图（LinkFox CDN），本地没有这些图，也没有对应商品库，
 * 所以左侧用图标占位并在网格里如实写「示意图缺失」——不贴任何别家图片冒充。
 */
function PickerCard({
    testId,
    title,
    subtitle,
    value,
    thumbnail,
    icon,
    disabled,
    onClick,
    open,
    triggerRef,
}: {
    testId: string;
    title: string;
    subtitle: string;
    value?: string;
    thumbnail?: string;
    icon: React.ReactNode;
    disabled?: boolean;
    onClick: () => void;
    open?: boolean;
    triggerRef?: React.Ref<HTMLButtonElement>;
}) {
    return (
        <button
            ref={triggerRef}
            type="button"
            data-testid={testId}
            data-picker-trigger="true"
            data-open={open ? "true" : undefined}
            aria-haspopup="dialog"
            aria-expanded={open}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                "flex h-20 w-[268px] max-w-full items-center gap-2 rounded-lg border bg-card px-2 text-left transition",
                open ? "border-primary" : "border-border hover:border-foreground/30",
                disabled ? "cursor-not-allowed opacity-60" : "",
            )}
        >
            <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
                {thumbnail ? <img src={thumbnail} alt="" className="size-full object-cover" /> : icon}
            </span>
            <span className="min-w-0 flex-1">
                {/* 原站两张选择卡的文案是固定占位（「选择商品品类 / 穿戴的商品品类」），选中值只体现在左侧缩略图 */}
                <span className="block truncate text-[13px] leading-5 text-foreground">{title}</span>
                <span className="block truncate text-[12px] leading-[18px] text-muted-foreground">{subtitle}</span>
                {value ? <span data-testid={`${testId}-value`} className="sr-only">{value}</span> : null}
            </span>
            <ArrowRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
    );
}

/**
 * 弹层：原站 ant-popover 的本地等价。
 *
 * 用 `position: fixed` + 触发元素矩形定位并夹到视口内（原站 ant-popover 同样会自动翻转/避让），
 * 这样弹层既不会被 300px 配置栏裁切，也不会掉到可视区外不可达。
 */
function PickerPanel({
    anchor,
    testId,
    title,
    hint,
    onClose,
    children,
    width = 494,
}: {
    anchor: HTMLElement | null;
    testId: string;
    title: string;
    hint?: React.ReactNode;
    onClose: () => void;
    children: React.ReactNode;
    width?: number;
}) {
    const ref = useRef<HTMLDivElement | null>(null);
    const [position, setPosition] = useState<{ left: number; top: number; maxHeight: number }>({ left: 8, top: 8, maxHeight: 480 });
    useEffect(() => {
        const place = () => {
            const rect = anchor?.getBoundingClientRect();
            const panel = ref.current?.getBoundingClientRect();
            const height = panel?.height ?? 420;
            const margin = 8;
            const left = Math.min(Math.max(margin, rect?.left ?? margin), Math.max(margin, window.innerWidth - width - margin));
            const below = rect ? rect.bottom + margin : margin;
            const fitsBelow = below + height <= window.innerHeight - margin;
            const top = fitsBelow ? below : Math.max(margin, (rect?.top ?? margin) - height - margin);
            setPosition({ left, top, maxHeight: window.innerHeight - top - margin });
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    }, [anchor, width]);
    useEffect(() => {
        const onDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (ref.current?.contains(target)) return;
            if ((target as HTMLElement | null)?.closest?.("[data-picker-trigger]")) return;
            onClose();
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [onClose]);
    return (
        <div
            ref={ref}
            role="dialog"
            aria-label={title}
            data-testid={testId}
            data-state="open"
            style={{ left: position.left, top: position.top, width, maxHeight: Math.max(240, position.maxHeight) }}
            className="fixed z-50 overflow-y-auto rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl"
        >
            <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-6 text-foreground">{title}</p>
                <button type="button" aria-label="关闭" data-testid={`${testId}-close`} onClick={onClose} className="text-muted-foreground hover:text-foreground">
                    <X aria-hidden className="size-3.5" />
                </button>
            </div>
            {hint ? <div className="mb-2 rounded bg-amber-50 px-2 py-1 text-[11px] leading-4 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{hint}</div> : null}
            {children}
        </div>
    );
}

function VariantGrid({
    cells,
    expected,
    running,
    onRetryCell,
}: {
    cells: WearableResultCell[];
    expected: number;
    running: boolean;
    onRetryCell: (index: number) => void;
}) {
    const placeholder = Math.max(expected, cells.length);
    return (
        <div data-testid="dress-results" className="grid grid-cols-2 gap-2 sm:grid-cols-2">
            {Array.from({ length: placeholder }, (_, index) => {
                const cell = cells[index] ?? { index, status: "pending" as const };
                const src = cell.item?.url ?? cell.item?.dataUrl ?? "";
                return (
                    <div key={index} data-cell={index} data-status={cell.status} className="rounded-xl border border-border bg-background p-2">
                        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>第 {index + 1} 张</span>
                            <span>{cell.status === "succeeded" ? "已完成" : cell.status === "failed" ? "失败" : running ? "生成中…" : "待生成"}</span>
                        </div>
                        <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg bg-muted">
                            {src ? <img src={src} alt={`穿戴结果 ${index + 1}`} className="h-full w-full object-contain" /> : <span className="text-[11px] text-muted-foreground">空</span>}
                        </div>
                        {cell.status === "failed" ? (
                            <button
                                type="button"
                                data-retry-cell={index}
                                disabled={running}
                                onClick={() => onRetryCell(index)}
                                className="mt-2 min-h-10 w-full rounded-md border border-border text-xs"
                            >
                                只重试这张
                            </button>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}

/* -------------------------------- 工作区 -------------------------------- */

/** 原站结果区只有两个 Tab；「历史记录」是右上外链入口，不是第三个内联 Tab。 */
const WEARABLE_RIGHT_TABS = [
    { id: "result", label: "生成结果" },
    { id: "cases", label: "优秀案例" },
] as const;
type WearableRightTabId = (typeof WEARABLE_RIGHT_TABS)[number]["id"];

function isWearableRegionLike(raw: unknown): raw is WearableRegion {
    if (!raw || typeof raw !== "object") return false;
    const record = raw as Record<string, unknown>;
    return (
        typeof record.cx === "number" &&
        typeof record.cy === "number" &&
        typeof record.rx === "number" &&
        typeof record.ry === "number"
    );
}

export function AiWearableWorkspace({ className, toolId = AI_WEARABLE_TOOL_ID }: { className?: string; toolId?: string }) {
    const hydrate = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const flushDraft = useToolDraftStore((state) => state.flush);
    const draft = useToolDraftStore((state) => state.drafts[toolId]);
    const config = useConfigStore((state) => state.config);
    const imageModel = useConfigStore((state) => state.config.imageModel);

    const [values, setValues] = useState<WearableValues>(() => readWearableValues());
    const [product, setProduct] = useState<WearableSourceAsset | undefined>();
    const [modelAsset, setModelAsset] = useState<WearableSourceAsset | undefined>();
    const [restoring, setRestoring] = useState(false);
    const [lostAssets, setLostAssets] = useState<string[]>([]);
    const [task, setTask] = useState<ToolTask | undefined>();
    const [snapshot, setSnapshot] = useState<WearableSnapshot | undefined>();
    const [running, setRunning] = useState(false);
    const [runError, setRunError] = useState<string | undefined>();
    const [rightTab, setRightTab] = useState<WearableRightTabId>("result");
    /** 右上「历史记录」入口：原站是外链，这里打开本地真实历史面板（同一入口位置，不新增第三个 Tab）。 */
    const [historyOpen, setHistoryOpen] = useState(false);
    /** 选择卡弹层：品类 / 模特；同一时刻只开一个（原站 ant-popover 行为）。 */
    const [picker, setPicker] = useState<"category" | "model" | null>(null);
    /** 上传卡的两个库入口弹层。 */
    const [libraryOpen, setLibraryOpen] = useState<"works" | "goods" | null>(null);
    const categoryTriggerRef = useRef<HTMLButtonElement | null>(null);
    const modelTriggerRef = useRef<HTMLButtonElement | null>(null);
    const worksTriggerRef = useRef<HTMLButtonElement | null>(null);
    const goodsTriggerRef = useRef<HTMLButtonElement | null>(null);
    const [applyingCaseId, setApplyingCaseId] = useState<string | null>(null);
    const [caseNotice, setCaseNotice] = useState<string | undefined>();
    /** 原站 ant-tour 新手引导：可关闭（「我是高手，不再提醒」），会话内不再出现。 */
    const [tourVisible, setTourVisible] = useState(() => (typeof sessionStorage !== "undefined" ? sessionStorage.getItem("ai-wearable-tour-dismissed") !== "1" : true));
    const dismissTour = useCallback(() => {
        setTourVisible(false);
        try {
            sessionStorage.setItem("ai-wearable-tour-dismissed", "1");
        } catch {
            /* 隐私模式等场景下写入失败只影响本次会话记忆，不阻塞关闭 */
        }
    }, []);
    const abortRef = useRef<AbortController | null>(null);

    const [productMask, setProductMask] = useState<RegionHistory>(() => ({ past: [], present: readWearableValues().productRegion, future: [] }));
    const [targetMask, setTargetMask] = useState<RegionHistory>(() => ({
        past: [],
        present: defaultTargetRegion(readWearableValues().part, readWearableValues().modelTabType),
        future: [],
    }));

    /* 草稿恢复：值 + 两张源图资产（丢了明确提示，不假装已恢复） */
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const restored = await hydrate(toolId);
            if (cancelled) return;
            const parsed = readWearableValues(restored?.values?.[DRAFT_SLOT] as Record<string, unknown> | undefined);
            setValues(parsed);
            setProductMask({ past: [], present: parsed.productRegion, future: [] });
            setTargetMask({ past: [], present: parsed.targetRegion, future: [] });
            const ids = [parsed.productAssetId, parsed.modelAssetId].filter(Boolean);
            if (!ids.length) return;
            setRestoring(true);
            try {
                const { records, lostIds } = await loadToolAssetRecords(ids);
                if (cancelled) return;
                const byId = new Map(records.map((record) => [record.id, record]));
                const productRecord = byId.get(parsed.productAssetId);
                const modelRecord = byId.get(parsed.modelAssetId);
                if (productRecord) setProduct(wearableSourceFromRecord(productRecord));
                if (modelRecord) setModelAsset(wearableSourceFromRecord(modelRecord));
                const lost = [...lostIds];
                if (parsed.productAssetId && !productRecord) lost.push(parsed.productAssetId);
                if (parsed.modelAssetId && !modelRecord) lost.push(parsed.modelAssetId);
                setLostAssets(Array.from(new Set(lost)));
            } finally {
                if (!cancelled) setRestoring(false);
            }
        })();
        return () => {
            cancelled = true;
            void flushDraft(toolId);
        };
    }, [toolId, hydrate, flushDraft]);

    const update = useCallback(
        (next: Partial<WearableValues>) => {
            setValues((previous) => {
                const merged = linkWearableValues({ ...previous, ...next }).values;
                patchDraft(toolId, {
                    values: { [DRAFT_SLOT]: merged },
                    assetIds: [merged.productAssetId, merged.modelAssetId].filter(Boolean),
                });
                return merged;
            });
        },
        [patchDraft, toolId],
    );

    const descriptor = useMemo(() => describeToolExecution(AI_WEARABLE_TOOL_ID), []);
    const provider = useMemo(() => {
        const effective = values.modelId || imageModel;
        if (!effective?.trim()) return "";
        try {
            return resolveModelChannel(config, effective).apiFormat;
        } catch {
            return "";
        }
    }, [config, imageModel, values.modelId]);

    const capability = useMemo(
        () =>
            resolveWearableCapability({
                modelId: values.modelId || imageModel,
                modelReady: Boolean((values.modelId || imageModel)?.trim()),
                provider,
                descriptor,
            }),
        [values.modelId, imageModel, provider, descriptor],
    );

    const output = computeWearableOutput(values);
    const issues = useMemo(
        () =>
            validateWearableState({
                values,
                capability,
                productReady: isWearableSourceReady(product),
                modelReady: isWearableSourceReady(modelAsset),
                productSize: product,
                modelSize: modelAsset,
            }),
        [values, capability, product, modelAsset],
    );
    const blocked = running || issues.length > 0;

    const currentSnapshot = useMemo(() => createWearableSnapshot(values, capability, draft?.revision ?? null), [values, capability, draft?.revision]);
    const drift = useMemo(() => describeWearableDrift(snapshot, currentSnapshot), [snapshot, currentSnapshot]);
    const result = wearableResultFromTask(task, snapshot, currentSnapshot, values.outputNum);
    const prompt = useMemo(() => buildWearablePrompt(values, capability), [values, capability]);

    const step = useMemo(() => {
        if (result.cells.some((cell) => cell.status === "succeeded")) return 5;
        if (!isWearableSourceReady(product)) return 1;
        if (isWearableSourceReady(product) && !isWearableSourceReady(modelAsset)) return 3;
        if (isWearableSourceReady(product) && isWearableSourceReady(modelAsset)) return 4;
        return 2;
    }, [product, modelAsset, result.cells]);

    const applyProductMask = useCallback(
        (next: WearableRegion) => {
            setProductMask((history) => {
                const updated = pushRegion(history, next);
                update({ productRegion: next });
                return updated;
            });
        },
        [update],
    );

    const applyTargetMask = useCallback(
        (next: WearableRegion) => {
            setTargetMask((history) => {
                const updated = pushRegion(history, next);
                update({ targetRegion: next });
                return updated;
            });
        },
        [update],
    );

    const onProductChange = useCallback(
        (_assetIds: string[], records: ToolAssetRecord[]) => {
            const record = records[0];
            if (!record) {
                setProduct(undefined);
                update({ productAssetId: "", productName: "" });
                return;
            }
            const next = wearableSourceFromRecord(record);
            setProduct(next);
            setTask(undefined);
            setSnapshot(undefined);
            update({ productAssetId: next.assetId, productName: next.name });
            const size = validateWearableSourceSize(next);
            setRunError(size.ok ? undefined : `商品图尺寸不符：${size.message}`);
        },
        [update],
    );

    const onModelChange = useCallback(
        (_assetIds: string[], records: ToolAssetRecord[]) => {
            const record = records[0];
            if (!record) {
                setModelAsset(undefined);
                update({ modelAssetId: "", modelName: "" });
                return;
            }
            const next = wearableSourceFromRecord(record);
            setModelAsset(next);
            /* 换模特不重新上传商品；也不重置商品蒙版与品类 */
            setTask(undefined);
            setSnapshot(undefined);
            update({ modelAssetId: next.assetId, modelName: next.name });
            const size = validateWearableSourceSize(next);
            setRunError(size.ok ? undefined : `模特图尺寸不符：${size.message}`);
        },
        [update],
    );

    /** 作品库（本机真实资产）→ 工具资产记录（同一份字节，不复制）→ 回填商品图/模特图。 */
    const pickFromLibrary = useCallback(
        async (item: ToolAssetLibraryItem) => {
            try {
                const record = await adoptLibraryAsset(item);
                onProductChange([record.id], [record]);
                setLibraryOpen(null);
            } catch (error) {
                setRunError(error instanceof Error ? error.message : "作品库素材读取失败，请换一张");
            }
        },
        [onProductChange],
    );

    /**
     * 「优秀案例·做同款」：案例素材真实落盘 → uploadToolAsset 入库 → 回填商品图/模特图。
     *
     * 事实边界：素材来自 LinkFox 原站案例（`files.product` / `files.model`），走的是同一套
     * `uploadCaseFiles` 上传链路，不是把远端 URL 直接塞进表单；回填后仍由用户点「立即生成」。
     */
    const applyCase = useCallback(
        async (item: ToolCase) => {
            setApplyingCaseId(item.id);
            setCaseNotice(undefined);
            setRunError(undefined);
            try {
                const assets = await uploadCaseFiles(item);
                const productEntry = assets.product ?? assets.image;
                const modelEntry = assets.model ?? assets.target;
                const productRecord = Array.isArray(productEntry) ? productEntry[0] : productEntry;
                const modelRecord = Array.isArray(modelEntry) ? modelEntry[0] : modelEntry;
                if (!productRecord) throw new Error("该案例缺少可用的穿戴商品图");
                onProductChange([productRecord.id], [productRecord]);
                if (modelRecord) onModelChange([modelRecord.id], [modelRecord]);

                const apply = item.apply ?? {};
                const nextValues: Partial<WearableValues> = {};
                const tabKey = typeof apply.modelTabType === "string" ? apply.modelTabType : "";
                if (WEARABLE_MODEL_TABS.some((tab) => tab.key === tabKey)) {
                    nextValues.modelTabType = tabKey as WearableValues["modelTabType"];
                }
                const categoryKey = typeof apply.productCategory === "string" ? apply.productCategory : "";
                if (categoryKey && wearableCategoryOf(categoryKey)) {
                    nextValues.productCategory = categoryKey as WearableValues["productCategory"];
                }
                const partKey = typeof apply.part === "string" ? apply.part : "";
                if (partKey && wearablePartOf(partKey)) {
                    nextValues.part = partKey as WearableValues["part"];
                }
                const sceneKey = typeof apply.sceneTabType === "string" ? apply.sceneTabType : "";
                if (WEARABLE_SCENE_TABS.some((s) => s.key === sceneKey)) {
                    nextValues.sceneTabType = sceneKey as WearableValues["sceneTabType"];
                }
                const checkKey = typeof apply.checkType === "string" ? apply.checkType : "";
                if (WEARABLE_CHECK_TYPES.some((c) => c.key === checkKey)) {
                    nextValues.checkType = checkKey as WearableValues["checkType"];
                }
                if (typeof apply.outputNum === "number" && Number.isFinite(apply.outputNum)) {
                    nextValues.outputNum = apply.outputNum;
                }
                if (typeof apply.isSecondOperate === "boolean") {
                    nextValues.isSecondOperate = apply.isSecondOperate;
                }
                if (isWearableRegionLike(apply.productRegion)) {
                    applyProductMask(apply.productRegion);
                } else {
                    const defaultProductRegion = readWearableValues().productRegion;
                    setProductMask({ past: [], present: defaultProductRegion, future: [] });
                    nextValues.productRegion = defaultProductRegion;
                }
                if (isWearableRegionLike(apply.targetRegion)) {
                    applyTargetMask(apply.targetRegion);
                } else {
                    const effectiveTab = nextValues.modelTabType ?? values.modelTabType;
                    const effectivePart = nextValues.part ?? values.part;
                    const nextTargetRegion = defaultTargetRegion(effectivePart, effectiveTab);
                    setTargetMask({ past: [], present: nextTargetRegion, future: [] });
                    nextValues.targetRegion = nextTargetRegion;
                }
                if (Object.keys(nextValues).length) update(nextValues);

                setTask(undefined);
                setSnapshot(undefined);
                setCaseNotice("已应用案例素材，请确认穿戴区域与参数后点「立即生成」");
                setRightTab("result");
            } catch (error) {
                setRunError(error instanceof Error ? error.message : "做同款失败");
            } finally {
                setApplyingCaseId(null);
            }
        },
        [applyProductMask, applyTargetMask, onModelChange, onProductChange, update, values.modelTabType, values.part],
    );

    /** 蒙版 → 同尺寸 PNG → 真实入库 → 字段引用（HTTPS 优先，否则本地资产 id）。 */
    const uploadMask = useCallback(async (region: WearableRegion, size: { width: number; height: number }, name: string) => {
        const blob = await renderWearableMaskBlob(region, size);
        const record = await uploadToolAsset(blob, { name });
        const url = record.url ?? "";
        return url.startsWith("https://") || url.startsWith("http://") ? url : record.id;
    }, []);

    const submit = useCallback(
        async (variantIndex?: number) => {
            if (!product || !modelAsset) return;
            setRunning(true);
            setRunError(undefined);
            const controller = new AbortController();
            abortRef.current = controller;
            try {
                await flushDraft(toolId);
                const productMaskRef = await uploadMask(productMask.present, wearableMaskSizeFor(product), `ai-wearable-mask-product-${Date.now()}.png`);
                const targetMaskRef = await uploadMask(targetMask.present, wearableMaskSizeFor(modelAsset), `ai-wearable-mask-target-${Date.now()}.png`);
                const runValues: WearableValues = variantIndex === undefined ? values : { ...values, outputNum: 1 };
                const run: AiWearableRun = await runAiWearable({
                    gateway: getPersistedToolGateway(),
                    values: runValues,
                    capability,
                    product,
                    model: modelAsset,
                    masks: { productMaskRef, targetMaskRef },
                    modelOverride: values.modelId || imageModel,
                    revision: draft?.revision ?? null,
                    signal: controller.signal,
                    onUpdate: (next) => setTask((previous) => (variantIndex === undefined || !previous ? next : previous)),
                });
                setSnapshot(run.snapshot);
                if (variantIndex === undefined) {
                    setTask(run.task);
                } else {
                    setTask((previous) => (previous ? mergeWearableVariant(previous, run.task, variantIndex) : run.task));
                }
                if (run.changes.length) setRunError(`已自动联动：${run.changes.join("；")}`);
            } catch (error) {
                const message = error instanceof AiWearableAdapterError || error instanceof Error ? error.message : "生成失败。";
                setRunError(message);
            } finally {
                setRunning(false);
                abortRef.current = null;
            }
        },
        [product, modelAsset, flushDraft, toolId, uploadMask, productMask.present, targetMask.present, values, capability, imageModel, draft?.revision],
    );

    const cancel = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
    }, []);

    const partOptions = useMemo(() => wearablePartOptions(values), [values]);

    /**
     * 原站「选择商品品类」弹层：4×3 共 12 项，顺序与集合逐项对齐（鞋靴/箱包/眼镜/项链/帽子/耳环/戒指/手表/手环手链/头饰/皮带/其他）。
     * 原站每项左侧是 112 宽真实商品图；本地没有这些图，也没有对应商品库，所以用图标 + 文案的诚实占位，不贴别家图片。
     */
    const categoryIcon = (key: WearableValues["productCategory"]) => {
        if (key === "footwear") return <Footprints aria-hidden className="size-6" />;
        if (key === "bag") return <ShoppingBag aria-hidden className="size-6" />;
        if (key === "eyewear") return <Glasses aria-hidden className="size-6" />;
        if (key === "watch") return <Watch aria-hidden className="size-6" />;
        if (key === "hat" || key === "headpiece") return <Gem aria-hidden className="size-6" />;
        return <Gem aria-hidden className="size-6" />;
    };
    const activeCategory = wearableCategoryOf(values.productCategory) ?? WEARABLE_CATEGORIES[0];

    /** 作品库（本地资产库）：真实条目；商品库本地未接入账号级接口，弹层给诚实空态，不伪造商品数据。 */
    const assets = useAssetStore((state) => state.assets);
    const library = useMemo(
        () => toolAssetLibraryItemsFromAssets(assets.filter((asset): asset is ImageAsset => asset.kind === "image")),
        [assets],
    );

    return (
        <div data-testid="dress-workspace" className={cn("flex flex-col gap-3", className)}>
            <OrigRail items={WEAR_RAIL} active="AI穿戴" driver testId="ai-wearable-rail" />

            {restoring ? (
                <p data-testid="dress-restoring" className="rounded-lg border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
                    正在恢复上次的素材…
                </p>
            ) : null}
            {lostAssets.length ? (
                <p data-testid="dress-lost-assets" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                    有 {lostAssets.length} 个素材文件已不在本地库存，请重新上传对应图片。
                </p>
            ) : null}

            <ToolWorkspaceColumns
                config={
                    <>
                        <Section title="上传穿戴商品" testId="dress-product-upload" extra={<ImageRulesPopover kind="wearable" testId="dress-rules" />}>
                            <p className="mb-2 text-[11px] leading-4 text-muted-foreground">💡 以模特穿戴效果图作为商品图，会为AI提供更好的作图参考</p>
                            {tourVisible ? (
                                <div
                                    data-testid="dress-tour"
                                    className="mb-2 flex items-start justify-between gap-2 rounded-md border border-dashed border-border px-2 py-1.5"
                                >
                                    <span className="text-[11px] leading-4 text-foreground">第一步：选择示例图或上传模特穿戴商品图片</span>
                                    <button
                                        type="button"
                                        data-testid="dress-tour-dismiss"
                                        onClick={dismissTour}
                                        className="shrink-0 text-[11px] leading-4 text-muted-foreground hover:text-foreground"
                                    >
                                        我是高手，不再提醒
                                    </button>
                                </div>
                            ) : null}
                            <ToolAssetInput
                                toolId={toolId}
                                variant="linkfox"
                                wide
                                maxCount={1}
                                disabled={running}
                                /* 原站上传卡：主按钮 214×24，居中于 268 内容宽（左右各 27px 内缩） */
                                className="[&_[data-testid=tool-asset-upload-button]]:w-[214px]"
                                dropLabel="上传商品图"
                                hint="10M以内，384*384 ~ 4096*4096"
                                syncIds={values.productAssetId ? [values.productAssetId] : undefined}
                                actions={
                                    <div className="flex w-[214px] items-center gap-2">
                                        <button
                                            ref={worksTriggerRef}
                                            type="button"
                                            data-testid="dress-from-works"
                                            disabled={running}
                                            title="从作品库（本地资产库）选择"
                                            onClick={() => setLibraryOpen("works")}
                                            className="h-6 w-[100px] rounded border border-primary bg-card text-[12px] leading-none text-primary transition hover:bg-primary/10 disabled:opacity-50"
                                        >
                                            从作品库选择
                                        </button>
                                        <button
                                            ref={goodsTriggerRef}
                                            type="button"
                                            data-testid="dress-from-goods"
                                            disabled={running}
                                            title="商品库：本地未接入账号级商品库，点开可查看说明"
                                            onClick={() => setLibraryOpen("goods")}
                                            className="h-6 w-[100px] rounded border border-primary bg-card text-[12px] leading-none text-primary transition hover:bg-primary/10 disabled:opacity-50"
                                        >
                                            从商品库选择
                                        </button>
                                    </div>
                                }
                                constraints={{
                                    kind: "image",
                                    mimeTypes: [...WEARABLE_UPLOAD.mimeTypes],
                                    maxBytes: WEARABLE_UPLOAD.maxBytes,
                                    minWidth: WEARABLE_UPLOAD.minSide,
                                    minHeight: WEARABLE_UPLOAD.minSide,
                                    maxWidth: WEARABLE_UPLOAD.maxSide,
                                    maxHeight: WEARABLE_UPLOAD.maxSide,
                                }}
                                onChange={onProductChange}
                            />
                            {libraryOpen === "works" ? (
                                <PickerPanel anchor={worksTriggerRef.current} testId="dress-works-picker" title="从作品库选择" hint="作品库 = 本机作品库真实资产；空态即为真实状态。" onClose={() => setLibraryOpen(null)}>
                                    {library.length ? (
                                        <ul className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto">
                                            {library.map((item) => (
                                                <li key={item.id}>
                                                    <button
                                                        type="button"
                                                        data-testid={`dress-work-${item.id}`}
                                                        onClick={() => void pickFromLibrary(item)}
                                                        className="w-full overflow-hidden rounded-md border border-border text-left transition hover:border-primary"
                                                    >
                                                        <img src={item.url} alt={item.name} className="h-16 w-full object-cover" />
                                                        <span className="block truncate px-1 py-1 text-[11px] text-muted-foreground">{item.name}</span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p data-testid="dress-works-empty" className="py-6 text-center text-[12px] text-muted-foreground">
                                            作品库还没有图片，先在画布/图片页生成或上传吧。
                                        </p>
                                    )}
                                </PickerPanel>
                            ) : null}
                            {libraryOpen === "goods" ? (
                                <PickerPanel anchor={goodsTriggerRef.current} testId="dress-goods-picker" title="从商品库选择" hint="原站弹层：排序规则：更新时间 ↓ / 暂无商品。" onClose={() => setLibraryOpen(null)}>
                                    <p data-testid="dress-goods-empty" className="py-6 text-center text-[12px] leading-5 text-muted-foreground">
                                        本机没有接入账号级商品库，这里没有可选的商品。
                                        <br />
                                        需要商品图请用「从本地上传」或「从作品库选择」。
                                    </p>
                                </PickerPanel>
                            ) : null}
                            {/* 原站上传卡下方「或试试这些」示例入口：点缩略图走 applyCase 真实入库回填，不是静态按钮 */}
                            {AI_WEARABLE_CASES.length ? (
                                <div className="mt-3" data-testid="dress-try-cases">
                                    <p className="mb-1.5 text-center text-[11px] font-medium text-muted-foreground">或试试这些</p>
                                    <div className="flex gap-2 overflow-x-auto pb-1">
                                        {AI_WEARABLE_CASES.slice(0, 4).map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                data-testid={`dress-try-case-${item.id}`}
                                                aria-label={`使用示例 ${item.id} 做同款`}
                                                disabled={applyingCaseId !== null}
                                                onClick={() => void applyCase(item)}
                                                className="shrink-0 overflow-hidden rounded-lg border border-border bg-card transition hover:border-primary/50 disabled:opacity-50"
                                            >
                                                <img src={item.result} alt={`穿戴示例 ${item.id}`} className="h-16 w-16 object-cover" loading="lazy" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            <details className="mt-3 rounded-lg border border-border bg-background px-2 py-1.5" data-testid="dress-product-mask">
                                <summary className="cursor-pointer text-[11px] leading-4 text-muted-foreground">穿戴区域微调（商品蒙版）</summary>
                                <div className="mt-2">
                                    <MaskEditor
                                        label="商品蒙版"
                                        hint="圈出要穿戴的商品主体，导出 PNG 与商品图同尺寸"
                                        imageUrl={product?.url}
                                        history={productMask}
                                        onSet={applyProductMask}
                                        onUndo={() =>
                                            setProductMask((history) => {
                                                const previous = history.past[history.past.length - 1];
                                                if (!previous) return history;
                                                update({ productRegion: previous });
                                                return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
                                            })
                                        }
                                        onRedo={() =>
                                            setProductMask((history) => {
                                                const next = history.future[0];
                                                if (!next) return history;
                                                update({ productRegion: next });
                                                return { past: [...history.past, history.present], present: next, future: history.future.slice(1) };
                                            })
                                        }
                                        disabled={running}
                                        testId="dress-mask-product"
                                    />
                                </div>
                            </details>
                        </Section>

                        <Section title="选择商品品类" testId="dress-category">
                            <PickerCard
                                testId="dress-category-card"
                                title="选择商品品类"
                                subtitle="穿戴的商品品类"
                                value={activeCategory.label}
                                icon={categoryIcon(activeCategory.key)}
                                disabled={running}
                                open={picker === "category"}
                                triggerRef={categoryTriggerRef}
                                onClick={() => setPicker(picker === "category" ? null : "category")}
                            />
                            {picker === "category" ? (
                                <PickerPanel
                                    anchor={categoryTriggerRef.current}
                                    testId="dress-category-panel"
                                    title="选择商品品类"
                                    hint="Tips：选择对应的商品品类，生成的效果会更佳！若没有对应品类，则选择「其他」即可~"
                                    onClose={() => setPicker(null)}
                                >
                                    <ul data-testid="dress-category-options" className="grid grid-cols-4 gap-2">
                                        {WEARABLE_CATEGORIES.map((category) => {
                                            const active = category.key === values.productCategory;
                                            return (
                                                <li key={category.key}>
                                                    <button
                                                        type="button"
                                                        data-category={category.key}
                                                        data-active={active ? "true" : undefined}
                                                        aria-pressed={active}
                                                        onClick={() => {
                                                            update({ productCategory: category.key, part: category.defaultPart });
                                                            setPicker(null);
                                                        }}
                                                        className={cn(
                                                            "w-full rounded-md border p-1 text-center transition",
                                                            active ? "border-primary bg-primary/5" : "border-transparent hover:border-border",
                                                        )}
                                                    >
                                                        <span className="flex h-[72px] w-full items-center justify-center rounded bg-muted text-muted-foreground">
                                                            {categoryIcon(category.key)}
                                                        </span>
                                                        <span className="mt-1 block truncate text-[11px] leading-4 text-foreground">{category.label}</span>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </PickerPanel>
                            ) : null}
                        </Section>

                        <Section title="选择穿戴模特" testId="dress-model">
                            <PickerCard
                                testId="dress-model-card"
                                title="选择穿戴模特"
                                subtitle="穿戴的部位与模特参考"
                                value={modelAsset?.name}
                                thumbnail={modelAsset?.url}
                                icon={<ImageIcon aria-hidden className="size-6" />}
                                disabled={running}
                                open={picker === "model"}
                                triggerRef={modelTriggerRef}
                                onClick={() => setPicker(picker === "model" ? null : "model")}
                            />
                            {picker === "model" ? (
                                <PickerPanel
                                    anchor={modelTriggerRef.current}
                                    testId="dress-model-panel"
                                    title="选择穿戴模特"
                                    hint="原站这里是模特库（智能推荐/我的/收藏/采集素材）。本机没有账号级模特库，不伪造模特数据，只能从本地上传或作品库选择。"
                                    onClose={() => setPicker(null)}
                                    width={420}
                                >
                                    <ToolAssetInput
                                        toolId={toolId}
                                        draftSlot="model"
                                        variant="linkfox"
                                        wide
                                        maxCount={1}
                                        disabled={running}
                                        dropLabel="选择参考图"
                                        hint="10M以内，384*384 ~ 4096*4096"
                                        library={library}
                                        thirdAction={null}
                                        syncIds={values.modelAssetId ? [values.modelAssetId] : undefined}
                                        onChange={onModelChange}
                                    />
                                </PickerPanel>
                            ) : null}
                            <details className="mt-3 rounded-lg border border-border bg-background px-2 py-1.5" data-testid="dress-target-mask">
                                <summary className="cursor-pointer text-[11px] leading-4 text-muted-foreground">穿戴区域微调（模特蒙版）</summary>
                                <div className="mt-2">
                                    <MaskEditor
                                        label="目标蒙版"
                                        hint="圈出模特身上的目标穿戴区域，导出 PNG 与模特图同尺寸"
                                        imageUrl={modelAsset?.url}
                                        history={targetMask}
                                        onSet={applyTargetMask}
                                        onUndo={() =>
                                            setTargetMask((history) => {
                                                const previous = history.past[history.past.length - 1];
                                                if (!previous) return history;
                                                update({ targetRegion: previous });
                                                return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
                                            })
                                        }
                                        onRedo={() =>
                                            setTargetMask((history) => {
                                                const next = history.future[0];
                                                if (!next) return history;
                                                update({ targetRegion: next });
                                                return { past: [...history.past, history.present], present: next, future: history.future.slice(1) };
                                            })
                                        }
                                        disabled={running}
                                        testId="dress-mask-target"
                                    />
                                </div>
                            </details>
                        </Section>

                        <Section title="选择生成张数" testId="dress-output">
                            <div className="flex gap-2" role="radiogroup" aria-label="生成张数" data-testid="dress-output-num">
                                {WEARABLE_OUTPUT_OPTIONS.map((count) => {
                                    const active = values.outputNum === count;
                                    return (
                                        <button
                                            key={count}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            data-output-num={count}
                                            data-active={active ? "true" : undefined}
                                            disabled={running || !capability.outputOptions.includes(count)}
                                            onClick={() => update({ outputNum: count })}
                                            className={cn(
                                                "h-[26px] w-10 rounded-md border text-xs tabular-nums transition",
                                                active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-foreground/80 hover:border-foreground/30",
                                            )}
                                        >
                                            {count}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="mt-3 text-[11px] leading-4 text-muted-foreground">Tips：为您的穿戴商品选择与原图角度、部位与画面占比相近的模特参考，生成的效果更好哦！</p>
                        </Section>

                        {/* 原站主按钮吸底 268×32：sticky 保证在滚动末端可达，不被父级裁切 */}
                        <div className="sticky bottom-0 z-10 mt-1 flex w-[268px] flex-col gap-1.5 bg-white/95 pb-1 pt-2 backdrop-blur">
                            {issues.length ? (
                                <ul className="list-disc pl-4 text-[11px] leading-4 text-amber-600" data-testid="dress-issues">
                                    {issues.map((issue) => (
                                        <li key={`${issue.code}-${issue.field}`} data-issue={issue.code}>
                                            {issue.message}
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                            {runError ? (
                                <p className="text-[11px] leading-4 text-red-600" data-testid="dress-run-error">
                                    {runError}
                                </p>
                            ) : null}
                            <button
                                type="button"
                                data-testid="dress-generate"
                                disabled={blocked}
                                onClick={() => void submit()}
                                className="h-8 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {running ? "生成中…" : `立即生成 (${values.outputNum}张)`}
                            </button>
                            {running ? (
                                <button type="button" onClick={cancel} data-testid="dress-cancel" className="h-7 w-full rounded-md border border-border text-xs">
                                    取消本次生成
                                </button>
                            ) : null}
                        </div>
                    </>
                }
            >
                {/* 原站结果区整列固定不动：整页滚动时右列贴顶，只有左配置列滚动 */}
                <section className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-0 lg:self-start" aria-label="结果区">
                    <div className="flex h-10 shrink-0 items-center gap-4 border-b border-border" data-testid="dress-right-tabs">
                        <div role="tablist" aria-label="右栏面板" className="flex h-10 items-stretch gap-4">
                            {WEARABLE_RIGHT_TABS.map((item) => {
                                const active = !historyOpen && rightTab === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={active}
                                        data-testid={`dress-tab-${item.id}`}
                                        onClick={() => {
                                            setHistoryOpen(false);
                                            setRightTab(item.id);
                                        }}
                                        className={cn(
                                            "relative flex h-10 items-center text-sm transition-colors",
                                            active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                                        )}
                                    >
                                        {item.label}
                                        {active ? <span className="absolute bottom-0 left-0 h-[2px] w-full rounded-full bg-foreground" /> : null}
                                    </button>
                                );
                            })}
                        </div>
                        {/* 原站右上「历史记录」是外链入口（/draw/history?type=34）；本地没有该路由，改为打开真实本地历史面板 */}
                        <button
                            type="button"
                            data-testid="dress-history-entry"
                            aria-pressed={historyOpen}
                            onClick={() => setHistoryOpen((open) => !open)}
                            className={cn("ml-auto flex h-10 items-center gap-1 text-xs", historyOpen ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                        >
                            <HistoryIcon aria-hidden className="size-3.5" />
                            历史记录
                        </button>
                    </div>

                    {caseNotice ? (
                        <p className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground" data-testid="dress-case-notice">
                            {caseNotice}
                        </p>
                    ) : null}

                    {historyOpen ? (
                        <Section title="历史记录" hint="本机真实落盘的任务快照" testId="dress-history">
                            <ToolTaskHistory
                                toolId={toolId}
                                limit={8}
                                emptyHint="还没有 AI 穿戴任务记录"
                                onSelectTask={(picked) => {
                                    setTask(picked);
                                    setHistoryOpen(false);
                                    setRightTab("result");
                                }}
                            />
                        </Section>
                    ) : rightTab === "result" ? (
                        <>
                            {/* 原站结果区没有二级「生成结果」标题：Tab 即标题，空态是三步引导卡 + 一键做同款 */}
                            <section data-testid="dress-results-section" className="flex flex-col gap-2">
                                <p className="text-right text-[11px] text-muted-foreground">
                                    本次 {values.outputNum} 张 · 已返回 {result.cells.filter((cell) => cell.status === "succeeded").length} 张
                                </p>
                                {drift && task ? (
                                    <p data-testid="dress-stale" className="rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                                        配置已变更（{drift}），下面的结果来自上一版配置，请重新生成。
                                    </p>
                                ) : null}
                                {result.cells.some((cell) => cell.status === "succeeded" || cell.status === "failed") || running ? (
                                    <VariantGrid cells={result.cells} expected={values.outputNum} running={running} onRetryCell={(index) => void submit(index)} />
                                ) : (
                                    <div className="flex flex-col items-center gap-3 py-12" data-testid="dress-empty">
                                        <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
                                            <span className="rounded-full bg-muted px-3 py-1">上传穿戴物品</span>
                                            <span>→</span>
                                            <span className="rounded-full bg-muted px-3 py-1">选择参考图</span>
                                            <span>→</span>
                                            <span className="rounded-full bg-muted px-3 py-1">生成结果</span>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">快在左侧上传商品图并选择穿戴区域吧~</p>
                                        <button
                                            type="button"
                                            data-testid="ai-wearable-apply-case"
                                            disabled={applyingCaseId !== null}
                                            onClick={() => {
                                                const showcase = AI_WEARABLE_CASES[0];
                                                if (showcase) void applyCase(showcase);
                                            }}
                                            className="h-10 w-[110px] rounded-md bg-primary text-[12px] leading-[18px] text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                                        >
                                            一键做同款
                                        </button>
                                    </div>
                                )}
                            </section>

                            {task ? <ToolResult task={task} toolId={toolId} title="结果资产" onCancel={running ? cancel : undefined} /> : null}
                        </>
                    ) : (
                        <Section title="优秀案例" testId="dress-cases">
                            <ToolCases cases={AI_WEARABLE_CASES} applyingId={applyingCaseId} onApply={applyCase} emptyHint="暂无优秀案例" />
                        </Section>
                    )}
                </section>
            </ToolWorkspaceColumns>
        </div>
    );
}

function defaultTargetPart(category: WearableValues["productCategory"], modelTabType: WearableValues["modelTabType"]): WearableValues["part"] {
    const options = wearablePartOptions({ ...readWearableValues(), productCategory: category, modelTabType }).filter((option) => !option.disabled);
    return (options[0]?.key ?? wearableCategoryOf(category)?.defaultPart ?? "neck") as WearableValues["part"];
}

const fmt = (region: WearableRegion) =>
    `x ${Math.round(region.cx * 100)}% · y ${Math.round(region.cy * 100)}% · r ${Math.round(region.rx * 100)}/${Math.round(region.ry * 100)}%`;

export default DressWorkspace;

/* ======================================================================= */
/* MATERIAL_UPPER_BODY（上装换料，makeType 16）                             */
/* 页面规格：docs/V1.0/plan_linkfox_navigation/page-specs/30-material-upper-body.md */
/* ======================================================================= */

const MATERIAL_DRAFT_SLOT = MATERIAL_UPPER_BODY_DRAFT_SLOT;

/** 蒙版椭圆的真实可调参数：拖动等价物（range），改动即写草稿并重算 prompt。 */
function MaterialRegionSlider({
    label,
    value,
    min = 0,
    max = 100,
    onChange,
    disabled,
    testId,
}: {
    label: string;
    value: number;
    min?: number;
    max?: number;
    onChange: (next: number) => void;
    disabled?: boolean;
    testId: string;
}) {
    return (
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="w-16 shrink-0">{label}</span>
            <input
                data-testid={testId}
                type="range"
                min={min}
                max={max}
                step={1}
                value={Math.round(value * 100)}
                disabled={disabled}
                onChange={(event) => onChange(Number(event.target.value) / 100)}
                className="h-4 min-w-0 flex-1 accent-primary"
            />
            <span data-testid={`${testId}-value`} className="w-9 shrink-0 text-right tabular-nums">
                {Math.round(value * 100)}%
            </span>
        </label>
    );
}

function MaterialUpperBodyWorkspaceLegacy({ className, toolId = MATERIAL_UPPER_BODY_TOOL_ID }: { className?: string; toolId?: string }) {
    const hydrate = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const flushDraft = useToolDraftStore((state) => state.flush);
    const draft = useToolDraftStore((state) => state.drafts[toolId]);
    const config = useConfigStore((state) => state.config);
    const imageModel = useConfigStore((state) => state.config.imageModel);

    const [values, setValues] = useState<MaterialValues>(() => readMaterialValues());
    const [source, setSource] = useState<MaterialSourceAsset | undefined>();
    const [restoring, setRestoring] = useState(false);
    const [lostAssets, setLostAssets] = useState<string[]>([]);
    const [task, setTask] = useState<ToolTask | undefined>();
    const [snapshot, setSnapshot] = useState<MaterialSnapshot | undefined>();
    const [running, setRunning] = useState(false);
    const [runError, setRunError] = useState<string | undefined>();
    const [linkNotice, setLinkNotice] = useState<string | undefined>();
    const [materialLibrary, setMaterialLibrary] = useState<"works" | "goods" | null>(null);
    const [materialHistoryOpen, setMaterialHistoryOpen] = useState(false);
    const materialWorksRef = useRef<HTMLButtonElement | null>(null);
    const materialGoodsRef = useRef<HTMLButtonElement | null>(null);
    const assets = useAssetStore((state) => state.assets);
    const materialLibraryItems = useMemo(
        () => toolAssetLibraryItemsFromAssets(assets.filter((asset): asset is ImageAsset => asset.kind === "image")),
        [assets],
    );

    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const restored = await hydrate(toolId);
            if (cancelled) return;
            const parsed = readMaterialValues(restored?.values?.[MATERIAL_DRAFT_SLOT] as Record<string, unknown> | undefined);
            setValues(parsed);
            if (!parsed.imageAssetId) return;
            setRestoring(true);
            try {
                const { records, lostIds } = await loadToolAssetRecords([parsed.imageAssetId]);
                if (cancelled) return;
                const record = records.find((item) => item.id === parsed.imageAssetId);
                if (record) setSource(materialSourceFromRecord(record));
                const lost = [...lostIds];
                if (!record) lost.push(parsed.imageAssetId);
                setLostAssets(Array.from(new Set(lost)));
            } finally {
                if (!cancelled) setRestoring(false);
            }
        })();
        return () => {
            cancelled = true;
            void flushDraft(toolId);
        };
    }, [toolId, hydrate, flushDraft]);

    const update = useCallback(
        (next: Partial<MaterialValues>) => {
            setValues((previous) => {
                const linked = linkMaterialValues({ ...previous, ...next });
                patchDraft(toolId, { values: { [MATERIAL_DRAFT_SLOT]: linked.values }, assetIds: [linked.values.imageAssetId].filter(Boolean) });
                if (linked.changes.length) setLinkNotice(linked.changes.join("；"));
                return linked.values;
            });
        },
        [patchDraft, toolId],
    );

    const descriptor = useMemo(() => describeToolExecution(MATERIAL_UPPER_BODY_TOOL_ID), []);
    const provider = useMemo(() => {
        const effective = values.modelId || imageModel;
        if (!effective?.trim()) return "";
        try {
            return resolveModelChannel(config, effective).apiFormat;
        } catch {
            return "";
        }
    }, [config, imageModel, values.modelId]);


    const capability = useMemo(
        () =>
            resolveMaterialCapability({
                modelId: values.modelId || imageModel,
                modelReady: Boolean((values.modelId || imageModel)?.trim()),
                provider,
                descriptor,
            }),
        [values.modelId, imageModel, provider, descriptor],
    );

    const issues = useMemo(
        () => validateMaterialState({ values, capability, sourceReady: isMaterialSourceReady(source), sourceSize: source }),
        [values, capability, source],
    );
    const blocked = running || issues.length > 0;
    const output = computeMaterialOutput(values, capability);
    const prompt = useMemo(() => buildMaterialPrompt(values, capability), [values, capability]);
    const currentSnapshot = useMemo(() => createMaterialSnapshot(values, capability, draft?.revision ?? null), [values, capability, draft?.revision]);
    const drift = useMemo(() => describeMaterialDrift(snapshot, currentSnapshot), [snapshot, currentSnapshot]);
    const cells = useMemo(() => materialResultCells(task, values.outputNum), [task, values.outputNum]);
    const driftText = useMemo(() => (task ? drift : undefined), [task, drift]);

    const onUpload = useCallback(
        async (ids: string[], records: ToolAssetRecord[]) => {
            const record = records.find((item) => item.id === ids[0]);
            if (!record) {
                setSource(undefined);
                update({ imageAssetId: "", imageName: "" });
                return;
            }
            const next = materialSourceFromRecord(record);
            const sizeCheck = validateMaterialSourceSize(next);
            if (!sizeCheck.ok) {
                setRunError(sizeCheck.message);
                setSource(undefined);
                update({ imageAssetId: "", imageName: "" });
                return;
            }
            setRunError(undefined);
            setSource(next);
            update({ imageAssetId: next.assetId, imageName: values.imageName.trim() || next.name });
        },
        [update, values.imageName],
    );

    /** 作品库条目 → 工具资产记录（同一份字节）→ 复用上传回调回填源图。 */
    const pickMaterialFromLibrary = useCallback(
        async (item: ToolAssetLibraryItem) => {
            try {
                const record = await adoptLibraryAsset(item);
                await onUpload([record.id], [record]);
                setMaterialLibrary(null);
            } catch (error) {
                setRunError(error instanceof Error ? error.message : "作品库素材读取失败，请换一张");
            }
        },
        [onUpload],
    );

    const uploadMaskBlob = useCallback(async (region: MaterialRegion, size: { width: number; height: number }) => {
        const blob = await renderMaterialMaskBlob(region, size);
        const record = await uploadToolAsset(blob, { name: `material-upper-body-mask-${Date.now()}.png` });
        return { assetId: record.id, name: record.name, mimeType: record.mimeType, url: record.url, dataUrl: record.url, width: record.width, height: record.height };
    }, []);

    const submit = useCallback(
        async (variantIndex?: number) => {
            if (!source) return;
            setRunning(true);
            setRunError(undefined);
            const controller = new AbortController();
            abortRef.current = controller;
            try {
                await flushDraft(toolId);
                const maskRef = values.isMatting ? await uploadMaskBlob(values.mattingRegion, materialMaskSizeFor(source)) : null;
                const runValues: MaterialValues = variantIndex === undefined ? values : { ...values, outputNum: 1 };
                const run = await runMaterialUpperBody({
                    gateway: getPersistedToolGateway(),
                    values: runValues,
                    capability,
                    source,
                    mask: maskRef,
                    modelOverride: values.modelId || imageModel,
                    revision: draft?.revision ?? null,
                    signal: controller.signal,
                    onUpdate: (next) => setTask((previous) => (variantIndex === undefined || !previous ? next : previous)),
                });
                setSnapshot(run.snapshot);
                if (variantIndex === undefined) setTask(run.task);
                else setTask((previous) => (previous ? mergeMaterialVariant(previous, run.task, variantIndex) : run.task));
                if (run.changes.length) setLinkNotice(`已自动联动：${run.changes.join("；")}`);
            } catch (error) {
                const message = error instanceof MaterialUpperBodyAdapterError || error instanceof Error ? error.message : "生成失败。";
                setRunError(message);
            } finally {
                setRunning(false);
                abortRef.current = null;
            }
        },
        [source, flushDraft, toolId, values, capability, uploadMaskBlob, imageModel, draft?.revision],
    );

    const cancel = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
    }, []);

    const category = materialCategoryOf(values.categoryKey);
    const leaves = materialLeavesOf(values.categoryKey);

    const disabledField = running || restoring;

    return (
        <div data-testid="material-workspace" className={cn("flex flex-col gap-3", className)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-base font-semibold text-foreground">上装换料</h2>
                    <p className="text-[11px] text-muted-foreground">上传一件上装，选择材质类目与子类，生成换料成片</p>
                </div>
            </div>

            {lostAssets.length ? (
                <p data-testid="material-lost" className="rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    有 {lostAssets.length} 个上次的图片资产已失效（{lostAssets.join("、")}），请重新上传。
                </p>
            ) : null}

            <ToolWorkspaceColumns
                config={
                    <>

                    <Section title="上传上装图片" hint="10M以内，384*384 ~ 4096*4096" testId="material-upload">
                        <ToolAssetInput
                            toolId={toolId}
                            variant="linkfox"
                            wide
                            maxCount={1}
                            disabled={disabledField}
                            dropLabel="上传上装图"
                            hint="10M以内，384*384 ~ 4096*4096"
                            syncIds={values.imageAssetId ? [values.imageAssetId] : undefined}
                            actions={
                                <div className="flex w-full items-center gap-2">
                                    <button
                                        ref={materialWorksRef}
                                        type="button"
                                        data-testid="material-from-works"
                                        disabled={disabledField}
                                        onClick={() => setMaterialLibrary("works")}
                                        className="h-6 w-[100px] rounded border border-primary bg-card text-[12px] leading-none text-primary transition hover:bg-primary/10 disabled:opacity-50"
                                    >
                                        从作品库选择
                                    </button>
                                    <button
                                        ref={materialGoodsRef}
                                        type="button"
                                        data-testid="material-from-goods"
                                        disabled={disabledField}
                                        onClick={() => setMaterialLibrary("goods")}
                                        className="h-6 w-[100px] rounded border border-primary bg-card text-[12px] leading-none text-primary transition hover:bg-primary/10 disabled:opacity-50"
                                    >
                                        从商品库选择
                                    </button>
                                </div>
                            }
                            constraints={{ kind: "image", mimeTypes: [...MATERIAL_UPLOAD.mimeTypes], maxBytes: MATERIAL_UPLOAD.maxBytes }}
                            onChange={onUpload}
                        />
                        {/* 素材名不进 UI：提交时由上传资产名兜底（adapter 已实现） */}
                        {source ? (
                            <p data-testid="material-source-meta" className="mt-2 text-[11px] text-muted-foreground">
                                已就绪：{source.name} · {source.width ?? "?"}×{source.height ?? "?"}
                            </p>
                        ) : null}
                        {materialLibrary === "works" ? (
                            <PickerPanel anchor={materialWorksRef.current} testId="material-works-picker" title="从作品库选择" hint="作品库 = 本机作品库真实资产。" onClose={() => setMaterialLibrary(null)}>
                                {materialLibraryItems.length ? (
                                    <ul className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto">
                                        {materialLibraryItems.map((item) => (
                                            <li key={item.id}>
                                                <button
                                                    type="button"
                                                    data-testid={`material-work-${item.id}`}
                                                    onClick={() => void pickMaterialFromLibrary(item)}
                                                    className="w-full overflow-hidden rounded-md border border-border text-left transition hover:border-primary"
                                                >
                                                    <img src={item.url} alt={item.name} className="h-16 w-full object-cover" />
                                                    <span className="block truncate px-1 py-1 text-[11px] text-muted-foreground">{item.name}</span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p data-testid="material-works-empty" className="py-6 text-center text-[12px] text-muted-foreground">作品库还没有图片，先在画布/图片页生成或上传吧。</p>
                                )}
                            </PickerPanel>
                        ) : null}
                        {materialLibrary === "goods" ? (
                            <PickerPanel anchor={materialGoodsRef.current} testId="material-goods-picker" title="从商品库选择" hint="原站弹层：排序规则：更新时间 ↓ / 暂无商品。" onClose={() => setMaterialLibrary(null)}>
                                <p data-testid="material-goods-empty" className="py-6 text-center text-[12px] leading-5 text-muted-foreground">
                                    本机没有接入账号级商品库，这里没有可选的商品。
                                    <br />
                                    需要上装图请用「从本地上传」或「从作品库选择」。
                                </p>
                            </PickerPanel>
                        ) : null}
                    </Section>

                    <Section title="材质类目" hint={MATERIAL_CATALOG_NOTICE} testId="material-categories">
                        <div data-testid="material-category-tree" className="flex flex-wrap gap-1">
                            {MATERIAL_CATEGORIES.map((item) => {
                                const active = values.categoryKey === item.key;
                                return (
                                    <button
                                        key={item.key}
                                        type="button"
                                        data-category={item.key}
                                        data-active={active ? "true" : undefined}
                                        disabled={disabledField}
                                        aria-pressed={active}
                                        title={item.hint}
                                        onClick={() => update({ categoryKey: item.key, leafKeys: [] })}
                                        className={cn(
                                            "min-h-9 rounded-md border px-2 text-xs",
                                            active ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground",
                                        )}
                                    >
                                        {item.label}
                                    </button>
                                );
                            })}
                        </div>

                        {category ? (
                            <div data-testid="material-leaves" className="mt-2 flex flex-wrap gap-1">
                                {leaves.map((leaf) => {
                                    const active = values.leafKeys.includes(leaf.key);
                                    return (
                                        <button
                                            key={leaf.key}
                                            type="button"
                                            data-leaf={`${category.key}.${leaf.key}`}
                                            data-active={active ? "true" : undefined}
                                            disabled={disabledField}
                                            aria-pressed={active}
                                            title={leaf.texture}
                                            onClick={() =>
                                                update({
                                                    leafKeys: active ? values.leafKeys.filter((key) => key !== leaf.key) : [...values.leafKeys, leaf.key],
                                                })
                                            }
                                            className={cn(
                                                "min-h-9 rounded-md border px-2 text-xs",
                                                active ? "border-primary/60 bg-primary/10 text-foreground" : "border-border text-muted-foreground",
                                            )}
                                        >
                                            {leaf.label}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <p data-testid="material-leaves-empty" className="mt-2 text-[11px] text-muted-foreground">
                                先选择材质大类，子类会自动联动出现。
                            </p>
                        )}

                        <p className="mt-3 text-[11px] text-muted-foreground" data-testid="material-category-summary">
                            {materialCategoryNameOf(values) ? `${materialCategoryNameOf(values)}${materialSubTypeOf(values) ? ` · ${materialSubTypeOf(values)}` : ""}` : "未选择材质类目"}
                        </p>
                    </Section>

                    <Section title="抠图与上装蒙版" hint="开启后会额外提交一张与原图同尺寸的蒙版参考图" testId="material-matting">
                        <label className="flex items-center gap-2 text-xs text-foreground">
                            <input
                                data-testid="material-is-matting"
                                type="checkbox"
                                checked={values.isMatting}
                                disabled={disabledField}
                                onChange={(event) => update({ isMatting: event.target.checked })}
                                className="h-4 w-4 accent-primary"
                            />
                            抠图上装（仅保留上装区域参与换料）
                        </label>

                        {values.isMatting ? (
                            <div className="mt-3 flex flex-col gap-2">
                                <div data-testid="material-mask-preview" className="relative overflow-hidden rounded-lg border border-border bg-muted">
                                    {source?.url ? (
                                        <img src={source.url} alt="上装预览" className="h-56 w-full object-contain" />
                                    ) : (
                                        <div className="flex h-56 items-center justify-center text-[11px] text-muted-foreground">上传后可预览蒙版位置</div>
                                    )}
                                    <div
                                        data-mask-overlay="true"
                                        className="pointer-events-none absolute rounded-[50%] border-2 border-primary bg-primary/20"
                                        style={{
                                            left: `${(values.mattingRegion.cx - values.mattingRegion.rx) * 100}%`,
                                            top: `${(values.mattingRegion.cy - values.mattingRegion.ry) * 100}%`,
                                            width: `${values.mattingRegion.rx * 200}%`,
                                            height: `${values.mattingRegion.ry * 200}%`,
                                        }}
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <MaterialRegionSlider label="水平" value={values.mattingRegion.cx} onChange={(cx) => update({ mattingRegion: { ...values.mattingRegion, cx } })} disabled={disabledField} testId="material-region-cx" />
                                    <MaterialRegionSlider label="垂直" value={values.mattingRegion.cy} onChange={(cy) => update({ mattingRegion: { ...values.mattingRegion, cy } })} disabled={disabledField} testId="material-region-cy" />
                                    <MaterialRegionSlider label="半宽" value={values.mattingRegion.rx} onChange={(rx) => update({ mattingRegion: { ...values.mattingRegion, rx } })} disabled={disabledField} testId="material-region-rx" />
                                    <MaterialRegionSlider label="半高" value={values.mattingRegion.ry} onChange={(ry) => update({ mattingRegion: { ...values.mattingRegion, ry } })} disabled={disabledField} testId="material-region-ry" />
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                    <span data-testid="material-region-state" data-usable={isMaterialRegionUsable(values.mattingRegion) ? "true" : "false"}>
                                        {isMaterialRegionUsable(values.mattingRegion) ? "蒙版区域可用" : "蒙版区域太小，请放大"}
                                    </span>
                                    <button
                                        type="button"
                                        data-testid="material-region-reset"
                                        disabled={disabledField}
                                        onClick={() => update({ mattingRegion: { ...MATERIAL_DEFAULT_REGION } })}
                                        className="min-h-8 rounded-md border border-border px-2 text-[11px]"
                                    >
                                        重置蒙版
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </Section>

                    <Section title="选择生成张数" hint={`1–${capability.maxOutput} 张`} testId="material-output">
                        <div data-testid="material-output-options" role="radiogroup" aria-label="生成张数" className="flex flex-wrap gap-1">
                            {MATERIAL_OUTPUT_OPTIONS.filter((option) => option <= capability.maxOutput).map((option) => {
                                const active = values.outputNum === option;
                                return (
                                    <button
                                        key={option}
                                        type="button"
                                        role="radio"
                                        aria-checked={active}
                                        data-output={option}
                                        data-active={active ? "true" : undefined}
                                        disabled={disabledField}
                                        onClick={() => update({ outputNum: option })}
                                        className={cn(
                                            "min-h-9 min-w-12 rounded-md border px-2 text-xs",
                                            active ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground",
                                        )}
                                    >
                                        {option} 张
                                    </button>
                                );
                            })}
                        </div>

                        {issues.length ? (
                            <ul className="mt-2 list-disc pl-4 text-[11px] text-amber-600" data-testid="material-issues">
                                {issues.map((issue) => (
                                    <li key={`${issue.field}-${issue.message}`} data-issue={issue.field}>
                                        {issue.message}
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                        {capability.notices.length ? (
                            <ul className="mt-2 list-disc pl-4 text-[11px] text-muted-foreground" data-testid="material-notices">
                                {capability.notices.map((notice) => (
                                    <li key={notice}>{notice}</li>
                                ))}
                            </ul>
                        ) : null}
                        {linkNotice ? (
                            <p className="mt-2 text-[11px] text-muted-foreground" data-testid="material-link-notice">
                                {linkNotice}
                            </p>
                        ) : null}
                        {runError ? (
                            <p className="mt-2 text-[11px] text-red-600" data-testid="material-run-error">
                                {runError}
                            </p>
                        ) : null}
                    </Section>

                    {/* 原站主按钮吸底 268×32：sticky 保证滚动末端可达，不被父级裁切 */}
                    <div className="sticky bottom-0 z-10 flex w-[268px] flex-col gap-1.5 bg-white/95 pb-1 pt-2 backdrop-blur">
                        <button
                            type="button"
                            data-testid="material-submit"
                            disabled={blocked}
                            onClick={() => void submit()}
                            className="h-8 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {running ? "生成中…" : `立即生成 (${values.outputNum}张)`}
                        </button>
                        {running ? (
                            <button type="button" onClick={cancel} data-testid="material-cancel" className="h-7 w-full rounded-md border border-border text-xs">
                                取消本次生成
                            </button>
                        ) : null}
                    </div>
                    </>
                }
            >
                <section className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-0 lg:self-start" aria-label="结果区">
                    {/* 原站结果区：左侧「生成结果」页签 + 右上「历史记录」入口，没有自造的提交快照卡 */}
                    <div className="flex h-10 shrink-0 items-center gap-4 border-b border-border" data-testid="material-right-tabs">
                        <div role="tablist" aria-label="右栏面板" className="flex h-10 items-stretch">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={!materialHistoryOpen}
                                data-testid="material-tab-result"
                                onClick={() => setMaterialHistoryOpen(false)}
                                className={cn(
                                    "relative flex h-10 items-center text-sm transition-colors",
                                    materialHistoryOpen ? "text-muted-foreground hover:text-foreground" : "font-medium text-foreground",
                                )}
                            >
                                生成结果
                                {materialHistoryOpen ? null : <span className="absolute bottom-0 left-0 h-[2px] w-full rounded-full bg-foreground" />}
                            </button>
                        </div>
                        <button
                            type="button"
                            data-testid="material-history-entry"
                            aria-pressed={materialHistoryOpen}
                            onClick={() => setMaterialHistoryOpen((open) => !open)}
                            className={cn("ml-auto flex h-10 items-center gap-1 text-xs", materialHistoryOpen ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                        >
                            <HistoryIcon aria-hidden className="size-3.5" />
                            历史记录
                        </button>
                    </div>

                    {materialHistoryOpen ? (
                        <Section title="历史记录" hint="本机真实落盘的任务快照" testId="material-history">
                            <ToolTaskHistory toolId={toolId} limit={8} emptyHint="还没有上装换料任务记录" />
                        </Section>
                    ) : null}

                    {materialHistoryOpen ? null : (
                    <section data-testid="material-results-section" className="flex flex-col gap-2">
                        <p className="text-right text-[11px] text-muted-foreground">本次 {values.outputNum} 张 · 已返回 {cells.filter((cell) => cell.status === "filled").length} 张</p>
                        {driftText ? (
                            <p data-testid="material-stale" className="mb-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                                配置已变更（{driftText}），下面的结果来自上一版配置，请重新生成。
                            </p>
                        ) : null}
                        <div data-testid="material-result-grid" className="grid grid-cols-2 gap-2">
                            {cells.map((cell) => {
                                const src = cell.item?.url ?? cell.item?.dataUrl ?? "";
                                return (
                                    <div key={cell.index} data-cell={cell.index} data-status={cell.status} className="rounded-xl border border-border bg-background p-2">
                                        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                                            <span>第 {cell.index + 1} 张</span>
                                            <span>{cell.status === "filled" ? "已完成" : cell.status === "failed" ? "失败" : running ? "生成中…" : "待生成"}</span>
                                        </div>
                                        <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg bg-muted">
                                            {src ? <img src={src} alt={`上装换料结果 ${cell.index + 1}`} className="h-full w-full object-contain" /> : <span className="text-[11px] text-muted-foreground">空</span>}
                                        </div>
                                        {cell.status === "failed" && values.outputNum > 1 ? (
                                            <button
                                                type="button"
                                                data-retry-cell={cell.index}
                                                disabled={running}
                                                onClick={() => void submit(cell.index)}
                                                className="mt-2 min-h-10 w-full rounded-md border border-border text-xs"
                                            >
                                                只重试这张
                                            </button>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                    )}

                    {task ? <ToolResult task={task} toolId={toolId} title="结果资产" onCancel={running ? cancel : undefined} /> : null}
                </section>
            </ToolWorkspaceColumns>
        </div>
    );
}

/**
 * layout=dress 的入口：AI 穿戴与上装换料共用同一工作区外壳，按 toolId 分发。
 * 两个工具的字段、蒙版语义、参考图数量都不同，因此各自独立实现，不共用表单状态。
 */
export function DressWorkspace({ className, toolId = AI_WEARABLE_TOOL_ID }: { className?: string; toolId?: string }) {
    if (toolId === MATERIAL_UPPER_BODY_TOOL_ID) return <MaterialUpperBodyWorkspace className={className} toolId={toolId} />;
    return <AiWearableWorkspace className={className} toolId={toolId} />;
}

/** PRD 布局：两列工作区（配置栏 320–360px + 结果区 1fr），复用可交互实现。 */
export function MaterialUpperBodyWorkspace({ className, toolId = MATERIAL_UPPER_BODY_TOOL_ID }: { className?: string; toolId?: string }) {
    return <MaterialUpperBodyWorkspaceLegacy className={className} toolId={toolId} />;
}
