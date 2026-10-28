import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolResult } from "@/components/tools/tool-result";
import { uploadToolAsset, loadToolAssetRecords, type ToolAssetRecord } from "@/services/api/tools/assets";
import { describeToolExecution, getToolGateway } from "@/services/api/tools/gateway";
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

function Section({ title, hint, children, testId }: { title: string; hint?: string; children: React.ReactNode; testId?: string }) {
    return (
        <section data-testid={testId} className="rounded-2xl border border-border bg-card p-4">
            <header className="mb-2 flex flex-wrap items-baseline justify-between gap-1">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
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

function Segmented<T extends string>({
    label,
    value,
    options,
    onChange,
    disabled,
    testId,
}: {
    label: string;
    value: T;
    options: readonly { key: T; label: string; hint?: string; disabled?: boolean }[];
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
                            {option.label}
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

export function DressWorkspace({ className, toolId = AI_WEARABLE_TOOL_ID }: { className?: string; toolId?: string }) {
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

    const modelOptions = useMemo(() => {
        const names = new Set<string>();
        for (const channel of config.channels) {
            for (const item of channel.models) {
                if (!item.capability || item.capability === "image") names.add(item.name);
            }
        }
        if (imageModel) names.add(imageModel);
        return Array.from(names);
    }, [config.channels, imageModel]);

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
                    gateway: getToolGateway(),
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
    const categoryOptions = useMemo(() => wearableCategoriesFor(values.modelTabType), [values.modelTabType]);

    return (
        <div data-testid="dress-workspace" className={cn("flex flex-col gap-3", className)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-base font-semibold text-foreground">AI穿戴</h2>
                    <p className="text-[11px] text-muted-foreground">选择穿戴区域，上传穿戴物品，快速将物品穿戴上身生成特写图。</p>
                </div>
                <StepBar step={step} />
            </div>

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

            <div className="grid gap-3 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
                {/* 左：输入与配置 */}
                <div className="flex flex-col gap-3">
                    <Section title="1. 上传穿戴商品" hint={WEARABLE_UPLOAD.hint} testId="dress-product-upload">
                        <ToolAssetInput
                            toolId={toolId}
                            title="上传商品图"
                            maxCount={1}
                            disabled={running}
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
                        <p className="mt-2 text-[11px] text-muted-foreground">💡 以模特穿戴效果图作为商品图，会为 AI 提供更好的作图参考。</p>
                        <div className="mt-3">
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
                    </Section>

                    <Section title="2. 商品品类" hint="品类改变可选穿戴部位与模特过滤" testId="dress-category">
                        <Segmented
                            label="穿戴的商品品类"
                            value={values.productCategory}
                            options={categoryOptions.map((category) => ({ key: category.key, label: category.label }))}
                            onChange={(next) => {
                                const category = wearableCategoryOf(next);
                                update({ productCategory: next, part: category?.defaultPart ?? values.part });
                            }}
                            disabled={running}
                            testId="dress-category-options"
                        />
                        <div className="mt-3" data-testid="dress-parts">
                            <p className="mb-1 text-[11px] text-muted-foreground">穿戴部位与模特参考</p>
                            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="穿戴部位">
                                {partOptions.map((option) => {
                                    const active = option.key === values.part;
                                    return (
                                        <button
                                            key={option.key}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            data-part={option.key}
                                            disabled={running || option.disabled}
                                            title={option.hint}
                                            onClick={() =>
                                                update({ part: option.key as WearableValues["part"], targetRegion: defaultTargetRegion(option.key as WearableValues["part"], values.modelTabType) })
                                            }
                                            className={cn(
                                                "min-h-10 rounded-lg border px-3 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                                                active ? "border-primary bg-accent text-foreground" : "border-border bg-background hover:bg-accent",
                                                option.disabled ? "cursor-not-allowed opacity-40" : "",
                                            )}
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="mt-3">
                            <Segmented
                                label="检测类型"
                                value={values.checkType}
                                options={WEARABLE_CHECK_TYPES.map((item) => ({ key: item.key, label: item.label, hint: item.hint }))}
                                onChange={(next) => update({ checkType: next })}
                                disabled={running}
                                testId="dress-check-type"
                            />
                        </div>
                    </Section>

                    <Section title="3. 穿戴模特" hint="换模特不会重新上传商品" testId="dress-model">
                        <Segmented
                            label="模特类型"
                            value={values.modelTabType}
                            options={WEARABLE_MODEL_TABS.map((item) => ({ key: item.key, label: item.label, hint: item.hint }))}
                            onChange={(next) =>
                                update({
                                    modelTabType: next,
                                    part: wearablePartOf(values.part) && wearablePartOptions({ ...values, modelTabType: next }).some((option) => option.key === values.part && !option.disabled) ? values.part : defaultTargetPart(values.productCategory, next),
                                })
                            }
                            disabled={running}
                            testId="dress-model-tabs"
                        />
                        <div className="mt-3">
                            <ToolAssetInput toolId={toolId} title="选择穿戴模特参考图" maxCount={1} disabled={running} onChange={onModelChange} />
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground">Tips：为您的穿戴商品选择与原图角度、部位与画面占比相近的模特参考，生成的效果更好哦！</p>
                        <div className="mt-3">
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
                        <div className="mt-3">
                            <Segmented
                                label="场景类型"
                                value={values.sceneTabType}
                                options={WEARABLE_SCENE_TABS.map((item) => ({ key: item.key, label: item.label }))}
                                onChange={(next) => update({ sceneTabType: next })}
                                disabled={running}
                                testId="dress-scene-tabs"
                            />
                        </div>
                        <label className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={values.isSecondOperate}
                                disabled={running}
                                data-testid="dress-second-operate"
                                onChange={(event) => update({ isSecondOperate: event.target.checked })}
                                className="h-4 w-4"
                            />
                            二次操作（沿用上次结果的模特姿态）
                        </label>
                        <label className="mt-2 block text-[11px] text-muted-foreground">
                            生图模型
                            <select
                                data-testid="dress-model-select"
                                value={values.modelId || imageModel}
                                disabled={running}
                                onChange={(event) => update({ modelId: event.target.value })}
                                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
                            >
                                {modelOptions.length === 0 ? <option value="">未配置模型</option> : null}
                                {modelOptions.map((name) => (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </Section>

                    <Section title="4. 生成张数" hint="1–4 张" testId="dress-output">
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
                                        disabled={running || !capability.outputOptions.includes(count)}
                                        onClick={() => update({ outputNum: count })}
                                        className={cn(
                                            "min-h-10 w-11 rounded-lg border text-xs tabular-nums",
                                            active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent",
                                        )}
                                    >
                                        {count}
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            type="button"
                            data-testid="dress-generate"
                            disabled={blocked}
                            onClick={() => void submit()}
                            className="mt-3 min-h-10 w-full rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
                        >
                            {running ? "生成中…" : `立即生成（${output.label}）`}
                        </button>
                        {running ? (
                            <button type="button" onClick={cancel} data-testid="dress-cancel" className="mt-2 min-h-10 w-full rounded-lg border border-border text-xs">
                                取消本次生成
                            </button>
                        ) : null}
                        {issues.length ? (
                            <ul className="mt-2 list-disc pl-4 text-[11px] text-amber-600" data-testid="dress-issues">
                                {issues.map((issue) => (
                                    <li key={`${issue.code}-${issue.field}`} data-issue={issue.code}>
                                        {issue.message}
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                        {capability.notices.length ? (
                            <ul className="mt-2 list-disc pl-4 text-[11px] text-muted-foreground" data-testid="dress-notices">
                                {capability.notices.map((notice) => (
                                    <li key={notice}>{notice}</li>
                                ))}
                            </ul>
                        ) : null}
                        {runError ? (
                            <p className="mt-2 text-[11px] text-red-600" data-testid="dress-run-error">
                                {runError}
                            </p>
                        ) : null}
                    </Section>
                </div>

                {/* 右：提示词、结果与资产 */}
                <div className="flex min-w-0 flex-col gap-3">
                    <Section title="本次提交快照" hint={`${wearableModelTabOf(values.modelTabType).label} · ${wearableSceneTabOf(values.sceneTabType).label}`} testId="dress-snapshot">
                        <p data-testid="dress-prompt" className="text-[11px] leading-5 text-muted-foreground">
                            {prompt}
                        </p>
                        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <div className="flex justify-between"><dt>主体</dt><dd data-testid="dress-summary">{output.label}</dd></div>
                            <div className="flex justify-between"><dt>商品蒙版</dt><dd>{fmt(productMask.present)}</dd></div>
                            <div className="flex justify-between"><dt>目标蒙版</dt><dd>{fmt(targetMask.present)}</dd></div>
                            <div className="flex justify-between"><dt>模型</dt><dd>{capability.modelReady ? "已配置" : "未配置"}</dd></div>
                        </dl>
                    </Section>

                    <Section title="生成结果" hint={`本次 ${values.outputNum} 张 · 已返回 ${result.cells.filter((cell) => cell.status === "succeeded").length} 张`} testId="dress-results-section">
                        {drift && task ? (
                            <p data-testid="dress-stale" className="mb-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                                配置已变更（{drift}），下面的结果来自上一版配置，请重新生成。
                            </p>
                        ) : null}
                        <VariantGrid cells={result.cells} expected={values.outputNum} running={running} onRetryCell={(index) => void submit(index)} />
                    </Section>

                    <ToolResult task={task} toolId={toolId} title="结果资产" onCancel={running ? cancel : undefined} />
                </div>
            </div>
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
