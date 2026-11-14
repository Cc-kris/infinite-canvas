import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolCases } from "@/components/tools/tool-cases";
import type { ToolCase } from "@/components/tools/tool-cases";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { ImageRulesPopover } from "@/components/tools/image-rules-popover";
import { uploadCaseFile, uploadCaseFiles } from "@/features/tools/case-apply";
import { AI_WEARABLE_CASES, AI_WEARABLE_GUIDE_CASES, DESIGN_TRY_DEMOS } from "@/features/tools/tool-cases-data";
import { ToolCaseGuide } from "@/components/tools/tool-case-guide";
import { DESIGN_GUIDE_PORTRAIT, DESIGN_ICON_FEATURE, DESIGN_UPLOAD_DROPZONE, DESIGN_UPLOAD_PANEL, TryDemoStrip, UploadPanelIcon } from "@/components/tools/workspaces/design-demo";
import { adoptLibraryAsset, toolAssetLibraryItemsFromAssets, uploadToolAsset, loadToolAssetRecords, type ToolAssetLibraryItem, type ToolAssetRecord } from "@/services/api/tools/assets";
import { useAssetStore, type ImageAsset } from "@/stores/use-asset-store";
import { ChevronRight, Footprints, Gem, Glasses, History as HistoryIcon, ImageIcon, ShoppingBag, SlidersHorizontal, Watch, X } from "lucide-react";
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
                                active ? "border-border bg-accent font-medium text-foreground" : done ? "border-foreground/30 text-foreground" : "border-border text-muted-foreground",
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
                                active ? "border-selected bg-selected-soft text-selected" : "border-border bg-background text-foreground hover:bg-accent",
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
                "flex w-[268px] max-w-full items-center gap-[10px] rounded-[6px] border bg-muted p-[10px] text-left transition",
                open ? "border-selected" : "border-border hover:border-selected",
                disabled ? "cursor-not-allowed opacity-60" : "",
            )}
        >
            <span className="flex h-[58px] w-[58px] shrink-0 items-center justify-center overflow-hidden rounded-[4px] text-muted-foreground">
                {thumbnail ? <img src={thumbnail} alt="" className="size-full object-contain" /> : icon}
            </span>
            <span className="min-w-0 flex-1">
                {/* 原站两张选择卡的文案是固定占位（「选择商品品类 / 穿戴的商品品类」），选中值只体现在左侧缩略图 */}
                <span className="block truncate text-[14px] leading-[22px] text-foreground/70">{title}</span>
                <span className="block truncate text-[12px] leading-[18px] text-muted-foreground">{subtitle}</span>
                {value ? <span data-testid={`${testId}-value`} className="sr-only">{value}</span> : null}
            </span>
            <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
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
            {hint ? <div className="mb-2 rounded bg-amber-500/10 px-2 py-1 text-[11px] leading-4 text-amber-700 dark:text-amber-300">{hint}</div> : null}
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
    /** 微调穿戴位置弹窗（商品蒙版 + 目标蒙版）。 */
    const [positionModalOpen, setPositionModalOpen] = useState(false);
    /** 上传卡的两个库入口弹层。 */
    const [libraryOpen, setLibraryOpen] = useState<"works" | "goods" | null>(null);
    const categoryTriggerRef = useRef<HTMLButtonElement | null>(null);
    const modelTriggerRef = useRef<HTMLButtonElement | null>(null);
    const worksTriggerRef = useRef<HTMLButtonElement | null>(null);
    const goodsTriggerRef = useRef<HTMLButtonElement | null>(null);
    const [applyingCaseId, setApplyingCaseId] = useState<string | null>(null);
    const [caseNotice, setCaseNotice] = useState<string | undefined>();
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

    /** 「或试试这些」：原站示例图真实入库，作为穿戴商品图。 */
    const [demoBusy, setDemoBusy] = useState<string | null>(null);
    const pickDemo = useCallback(
        async (src: string) => {
            setDemoBusy(src);
            setRunError(undefined);
            try {
                const record = await uploadCaseFile(src, "linkfox-demo-wearable");
                onProductChange([record.id], [record]);
            } catch (error) {
                setRunError(error instanceof Error ? error.message : "示例图载入失败");
            } finally {
                setDemoBusy(null);
            }
        },
        [onProductChange],
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
            {restoring ? (
                <p data-testid="dress-restoring" className="rounded-lg border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
                    正在恢复上次的素材…
                </p>
            ) : null}
            {lostAssets.length ? (
                <p data-testid="dress-lost-assets" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
                    有 {lostAssets.length} 个素材文件已不在本地库存，请重新上传对应图片。
                </p>
            ) : null}

            <ToolWorkspaceColumns
                className="lg:h-[calc(100dvh-56px)]"
                config={
                    <div className="flex h-full min-h-0 flex-col overflow-y-auto rounded-[8px] bg-card px-4 pt-[10px]">
                        <section data-testid="dress-product-upload">
                            <p className="text-[12px] leading-[19px] text-muted-foreground">上传穿戴商品</p>
                            <p className="mt-[10px] text-[12px] leading-[19px] text-muted-foreground">💡 以<span className="text-foreground">模特穿戴效果图</span>作为商品图，会为AI提供更好的作图参考</p>
                            <div className={cn(DESIGN_UPLOAD_PANEL, "mt-[10px]")}>
                            <UploadPanelIcon />
                            <div className="absolute right-[18px] top-[14px] z-30">
                                <ImageRulesPopover kind="wearable" testId="dress-rules" />
                            </div>
                            <ToolAssetInput
                                toolId={toolId}
                                variant="linkfox"
                                wide
                                maxCount={1}
                                disabled={running}
                                /* 原站上传卡：虚线框 196 高，主按钮 214×24，居中于 268 内容宽（左右各 27px 内缩） */
                                className={cn(DESIGN_UPLOAD_DROPZONE, "[&_[data-testid=tool-asset-upload-button]]:w-[214px]")}
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
                                            className="h-6 w-[100px] rounded border border-border bg-background text-[12px] leading-none text-foreground transition hover:bg-accent disabled:opacity-50"
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
                                            className="h-6 w-[100px] rounded border border-border bg-background text-[12px] leading-none text-foreground transition hover:bg-accent disabled:opacity-50"
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
                            <TryDemoStrip demos={DESIGN_TRY_DEMOS.wearable} busySrc={demoBusy} disabled={running} onPick={(src) => void pickDemo(src)} />
                            </div>
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
                                                        className="w-full overflow-hidden rounded-md border border-border text-left transition hover:border-selected"
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
                        </section>

                        {/* 原站「选择商品品类」：12px 标题 + 灰底行卡（缩略图 58×58） */}
                        <section data-testid="dress-category" className="space-y-[10px] pt-[15px]">
                            <p className="text-[12px] leading-[19px] text-muted-foreground">选择商品品类</p>
                            <PickerCard
                                testId="dress-category-card"
                                title="选择商品品类"
                                subtitle="穿戴的商品品类"
                                value={activeCategory.label}
                                thumbnail="/__cases/design-common/image_general.webp"
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
                                                            active ? "border-selected bg-selected-soft" : "border-transparent hover:border-border",
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
                        </section>

                        <section data-testid="dress-model" className="space-y-[10px] pt-[15px]">
                            <div className="flex items-center justify-between">
                                <p className="text-[12px] leading-[19px] text-muted-foreground">选择穿戴模特</p>
                                {(product || modelAsset) ? (
                                    <button
                                        type="button"
                                        data-testid="dress-open-position-modal"
                                        onClick={() => setPositionModalOpen(true)}
                                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                                    >
                                        <SlidersHorizontal className="size-3" aria-hidden />
                                        微调穿戴位置
                                    </button>
                                ) : null}
                            </div>
                            <PickerCard
                                testId="dress-model-card"
                                title="选择穿戴模特"
                                subtitle="穿戴的部位与模特参考"
                                value={modelAsset?.name}
                                thumbnail={modelAsset?.url ?? DESIGN_ICON_FEATURE}
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
                                    hint="支持上传模特参考图或从作品库选择。"
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
                        </section>

                        <section data-testid="dress-output" className="pt-[15px]">
                            <p className="mb-[10px] text-[12px] leading-[22px] text-muted-foreground">选择生成张数</p>
                            <div className="flex gap-[10px]" role="radiogroup" aria-label="生成张数" data-testid="dress-output-num">
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
                                                active ? "border-selected bg-selected-soft text-selected" : "border-border bg-card text-foreground/80 hover:border-foreground/30",
                                            )}
                                        >
                                            {count}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="mt-[10px] px-1 text-[12px] leading-[19px] text-muted-foreground">
                                Tips：为您的穿戴商品选择与原图<span className="text-foreground">角度、部位与画面占比</span>相近的模特参考，生成的效果更好哦！
                            </p>
                        </section>

                        {/* 原站主按钮吸底 268×32：sticky 保证在滚动末端可达，不被父级裁切 */}
                        <div className="sticky bottom-0 z-10 mt-auto flex w-[268px] flex-col gap-1.5 bg-card pb-1 pt-2">
                            {issues.length ? (
                                <ul className="list-disc pl-4 text-[11px] leading-4 text-amber-600 dark:text-amber-400" data-testid="dress-issues">
                                    {issues.map((issue) => (
                                        <li key={`${issue.code}-${issue.field}`} data-issue={issue.code}>
                                            {issue.message}
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                            {runError ? (
                                <p className="text-[11px] leading-4 text-destructive" data-testid="dress-run-error">
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
                    </div>
                }
            >
                {/* 原站结果区整列固定不动：整页滚动时右列贴顶，只有左配置列滚动 */}
                <section className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-y-auto rounded-[8px]" aria-label="结果区">
                    <div className="flex h-10 shrink-0 items-center gap-4 border-b border-border bg-card px-4" data-testid="dress-right-tabs">
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
                        <section data-testid="dress-results-section" className="flex flex-1 flex-col gap-2 px-4 pb-4">
                            {task ? (
                                <ToolResult
                                    task={task}
                                    toolId={toolId}
                                    title="生成结果"
                                    sourceUrl={product?.url}
                                    onCancel={running ? cancel : undefined}
                                />
                            ) : result.cells.some((cell) => cell.status === "succeeded" || cell.status === "failed") || running ? (
                                <VariantGrid cells={result.cells} expected={values.outputNum} running={running} onRetryCell={(index) => void submit(index)} />
                            ) : (
                                <div className="flex min-h-[calc(100dvh-160px)] pt-[42px] flex-1 flex-col items-center justify-center" data-testid="dress-empty">
                                    <ToolCaseGuide
                                        className={DESIGN_GUIDE_PORTRAIT}
                                        title="选择穿戴区域，上传穿戴物品，快速将物品穿戴上身生成特写图"
                                        cases={AI_WEARABLE_GUIDE_CASES}
                                        applyingId={applyingCaseId}
                                        onApply={applyCase}
                                    />
                                </div>
                            )}
                        </section>
                    ) : (
                        <Section title="优秀案例" testId="dress-cases">
                            <ToolCases cases={AI_WEARABLE_CASES} applyingId={applyingCaseId} onApply={applyCase} emptyHint="暂无优秀案例" />
                        </Section>
                    )}
                </section>
            </ToolWorkspaceColumns>

            {positionModalOpen ? (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="微调穿戴位置"
                    data-testid="dress-position-modal"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onClick={() => setPositionModalOpen(false)}
                >
                    <div
                        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-border px-4 py-3">
                            <div>
                                <h3 className="text-sm font-medium">微调穿戴位置</h3>
                                <p className="text-[11px] text-muted-foreground">调整商品主体区域与模特身上的穿戴目标区域</p>
                            </div>
                            <button
                                type="button"
                                aria-label="关闭微调穿戴位置弹窗"
                                onClick={() => setPositionModalOpen(false)}
                                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                                <X className="size-4" />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 grid gap-4 overflow-y-auto p-4 sm:grid-cols-2">
                            <MaskEditor
                                label="商品蒙版"
                                hint="圈出要穿戴的商品主体"
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
                            <MaskEditor
                                label="目标蒙版"
                                hint="圈出模特身上的目标穿戴区域"
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
                        <div className="flex items-center justify-end border-t border-border px-4 py-3">
                            <button
                                type="button"
                                onClick={() => setPositionModalOpen(false)}
                                className="h-8 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                            >
                                完成
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
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

/** layout=dress 的入口：AI 穿戴。 */
export function DressWorkspace({ className, toolId = AI_WEARABLE_TOOL_ID }: { className?: string; toolId?: string }) {
    return <AiWearableWorkspace className={className} toolId={toolId} />;
}
