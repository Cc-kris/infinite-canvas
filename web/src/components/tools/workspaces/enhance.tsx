import { ArrowRight, Download, History, MoveDownLeft, MoveDownRight, Upload, WandSparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Edit8Dropzone, Edit8Empty, Edit8ResultTabs, Edit8Switch, Edit8UploadCard, edit8GradientButtonClass, edit8OutlineButtonClass } from "@/components/tools/edit8-frame";
import { ToolResult } from "@/components/tools/tool-result";
import { downloadResultItem } from "@/components/tools/tool-result-actions";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { useRestoredTask } from "@/components/tools/use-restored-task";
import {
    loadToolAssetRecords,
    toolAssetLibraryItemsFromAssets,
    type ToolAssetConstraints,
    type ToolAssetRecord,
} from "@/services/api/tools/assets";
import { getPersistedToolGateway } from "@/stores/use-tool-task-store";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { useAssetStore, type ImageAsset, type VideoAsset } from "@/stores/use-asset-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";

import {
    DEFAULT_SCALE_UP_VALUES,
    SCALE_UP_MODES,
    SCALE_UP_QUALITIES,
    SCALE_UP_SOURCE_LIMITS,
    SCALE_UP_TOOL_ID,
    computeOutputSize,
    createScaleUpSnapshot,
    linkedCustomSize,
    outputSizeLabel,
    readScaleUpValues,
    scaleUpMode,
    scaleUpQuality,
    validateScaleUpState,
    type ScaleUpValues,
} from "@/features/tools/registry/scale-up";
import {
    ScaleUpAdapterError,
    detectScaleUpFace,
    firstResultImageSource,
    isScaleUpSourceReady,
    retryScaleUp,
    runScaleUp,
    scaleUpResultFromTask,
    validateScaleUpSource,
    type FaceAvailability,
    type ScaleUpSourceAsset,
} from "@/features/tools/adapters/scale-up";

import {
    DEFAULT_PRODUCT_REFINE_VALUES,
    PRODUCT_REFINE_MODES,
    PRODUCT_REFINE_SOURCE_LIMITS,
    PRODUCT_REFINE_STRENGTHS,
    PRODUCT_REFINE_TOOL_ID,
    computeProductRefineOutput,
    createProductRefineSnapshot,
    describeProductRefineDrift,
    productRefineOutputLabel,
    readProductRefineValues,
    validateProductRefineState,
    type ProductRefineValues,
} from "@/features/tools/registry/product-refine";
import {
    ProductRefineAdapterError,
    firstProductRefineImage,
    isProductRefineSourceReady,
    productRefineResultFromTask,
    retryProductRefine,
    runProductRefine,
    validateProductRefineSource,
    type ProductRefineSourceAsset,
} from "@/features/tools/adapters/product-refine";

/**
 * TASK-012：SCALE_UP（高清放大）工作区。
 *
 * 页面规格见 docs/V1.0/plan_linkfox_navigation/page-specs/05-scale-up.md：
 * 原图上传（jpg/jpeg/png/webp，≤4096）→ 模式（变高清 / 2× / 4× / 自定义宽高）→
 * 面部美化开关 → 质量档位 → 输出尺寸即时重算 → 生成 → 前后对比。
 * 所有结果只来自真实任务；失败/过期如实展示。
 */

const ASSET_CONSTRAINTS: Partial<ToolAssetConstraints> = {
    mimeTypes: [...SCALE_UP_SOURCE_LIMITS.mimeTypes],
    maxBytes: SCALE_UP_SOURCE_LIMITS.maxBytes,
    minWidth: SCALE_UP_SOURCE_LIMITS.minSide,
    minHeight: SCALE_UP_SOURCE_LIMITS.minSide,
    maxWidth: SCALE_UP_SOURCE_LIMITS.maxSide,
    maxHeight: SCALE_UP_SOURCE_LIMITS.maxSide,
};

/** 原站高清放大顶部工具条按钮（antd small default 28 高、圆角 4、12px）。 */
const toolbarButton =
    "inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-[4px] border px-[7px] text-[12px] leading-none transition disabled:cursor-not-allowed disabled:border-border disabled:bg-foreground/[0.04] disabled:text-muted-foreground";

/** 原站浮在两栏顶端的灰色标签（↙ 原图 / 高清放大图 ↘）。 */
const halfTag = "absolute top-[7px] z-10 inline-flex h-[23px] items-center gap-1 rounded-[12px] bg-foreground/10 px-[10px] text-[12px] leading-none text-foreground/70";

/** 商品精修空态示例：原站 slick 轮播「精修前 | 精修后」各 271×300，图片为原站同源文件。 */
const REFINE_EXAMPLES = [1, 2, 3, 4].map((index) => ({
    before: `/__cases/product-refine/product-refine-before-${index}.jpg`,
    after: `/__cases/product-refine/product-refine-after-${index}.jpg`,
}));

function RefineExampleCarousel() {
    const [index, setIndex] = useState(0);
    const item = REFINE_EXAMPLES[index];
    return (
        <div data-testid="refine-example" className="relative grid h-[300px] w-full shrink-0 grid-cols-2">
            {[
                { src: item.before, label: "精修前", tag: "bg-[rgba(45,45,51,0.5)]" },
                { src: item.after, label: "精修后", tag: "bg-black/60" },
            ].map((side) => (
                <figure key={side.label} className="relative m-0 h-full overflow-hidden">
                    <img src={side.src} alt={side.label} className="size-full object-cover" draggable={false} />
                    <span className={cn("absolute left-3 top-3 rounded-full px-3 py-1 text-[14px] leading-5 text-white shadow-[0_0_4px_rgba(0,0,0,0.1)]", side.tag)}>{side.label}</span>
                </figure>
            ))}
            <div className="absolute inset-x-0 bottom-[5px] flex justify-center gap-[10px]" role="tablist" aria-label="示例分页">
                {REFINE_EXAMPLES.map((example, i) => (
                    <button
                        key={example.before}
                        type="button"
                        role="tab"
                        aria-selected={i === index}
                        aria-label={`示例 ${i + 1}`}
                        onClick={() => setIndex(i)}
                        className={cn("h-[6px] rounded-full transition-all", i === index ? "w-[22px] bg-white" : "w-[6px] bg-white/50")}
                    />
                ))}
            </div>
        </div>
    );
}

const inputClass =
    "rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground outline-none focus:border-foreground/40";

function sourceFromRecord(record: ToolAssetRecord): ScaleUpSourceAsset {
    return {
        assetId: record.id,
        dataUrl: record.url,
        url: record.url,
        name: record.name,
        mimeType: record.mimeType,
        bytes: record.bytes,
        width: record.width,
        height: record.height,
    };
}

/** 前后对比：拖动滑块裁切“处理后”，左边是原图。 */
function CompareSlider({ before, after, testIdPrefix = "scale-up", labels }: { before: string; after: string; testIdPrefix?: string; labels?: { before: string; after: string } }) {
    const [position, setPosition] = useState(50);
    const afterLabel = labels?.after ?? "放大后";
    const beforeLabel = labels?.before ?? "原图";
    return (
        <div className="flex flex-col gap-2" data-testid={`${testIdPrefix}-compare`}>
            <div className="relative overflow-hidden rounded-lg border border-border">
                <img src={after} alt={afterLabel} className="block w-full" data-testid={`${testIdPrefix}-compare-after`} />
                <img
                    src={before}
                    alt={beforeLabel}
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
                    data-testid={`${testIdPrefix}-compare-before`}
                />
                <div className="pointer-events-none absolute inset-y-0 w-px bg-card/90 shadow" style={{ left: `${position}%` }} />
            </div>
            <input
                type="range"
                min={0}
                max={100}
                value={position}
                aria-label="前后对比"
                onChange={(event) => setPosition(Number(event.target.value))}
                className="w-full"
                data-testid={`${testIdPrefix}-compare-range`}
            />
            <p className="text-[11px] text-muted-foreground">
                左为{beforeLabel} {position}% · 右为{afterLabel}
            </p>
        </div>
    );
}

export function ScaleUpWorkspace({ className }: { className?: string }) {
    const toolId = SCALE_UP_TOOL_ID;
    const hydrate = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const flushDraft = useToolDraftStore((state) => state.flush);
    const draft = useToolDraftStore((state) => state.drafts[toolId]);
    const imageModel = useConfigStore((state) => state.config.imageModel);
    // 作品库（本地资产库）：「从作品库选择」读真实资产列表，不伪造原站商品库。
    const assets = useAssetStore((state) => state.assets);
    const library = useMemo(
        () => toolAssetLibraryItemsFromAssets(assets.filter((asset): asset is ImageAsset | VideoAsset => asset.kind === "image" || asset.kind === "video")),
        [assets],
    );

    const [values, setValues] = useState<ScaleUpValues>(() => ({ ...DEFAULT_SCALE_UP_VALUES }));
    const [source, setSource] = useState<ScaleUpSourceAsset | undefined>();
    const [restoringSource, setRestoringSource] = useState(false);
    const [faceAvailability, setFaceAvailability] = useState<FaceAvailability>("unavailable");
    const [task, setTask] = useState<ToolTask | undefined>();
    const [snapshot, setSnapshot] = useState<ReturnType<typeof createScaleUpSnapshot> | undefined>();
    const [running, setRunning] = useState(false);
    const [runError, setRunError] = useState<string | undefined>();
    const [historyOpen, setHistoryOpen] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    /* 草稿恢复：值与上次原图 id；图丢了就明确要求重选，不假装已恢复 */
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const restored = await hydrate(toolId);
            if (cancelled) return;
            const parsed = readScaleUpValues(restored?.values?.scaleUp as Record<string, unknown> | undefined);
            setValues(parsed);
            const assetId = parsed.sourceAssetId;
            if (!assetId) return;
            setRestoringSource(true);
            try {
                const { records } = await loadToolAssetRecords([assetId]);
                if (cancelled) return;
                const record = records[0];
                if (record) setSource(sourceFromRecord(record));
            } finally {
                if (!cancelled) setRestoringSource(false);
            }
        })();
        return () => {
            cancelled = true;
            void flushDraft(toolId);
        };
    }, [toolId, hydrate, flushDraft]);

    const update = useCallback(
        (next: Partial<ScaleUpValues>) => {
            setValues((previous) => {
                const merged: ScaleUpValues = { ...previous, ...next };
                patchDraft(toolId, {
                    values: { scaleUp: merged },
                    assetIds: merged.sourceAssetId ? [merged.sourceAssetId] : [],
                });
                return merged;
            });
        },
        [patchDraft, toolId],
    );

    const output = useMemo(() => computeOutputSize(values, source), [values, source]);
    const issues = useMemo(
        () =>
            validateScaleUpState({
                values,
                output,
                sourceReady: isScaleUpSourceReady(source),
                imageModelReady: Boolean(imageModel?.trim()),
                ...(faceAvailability === "absent" ? { faceAvailable: false } : {}),
            }),
        [values, output, source, imageModel, faceAvailability],
    );
    const blocking = issues.filter((issue) => issue.code !== "source-size-unknown");
    const sourceIssue = source ? validateScaleUpSource(source) : undefined;
    const blocked = running || blocking.length > 0 || (sourceIssue ? !sourceIssue.ok : false);

    const currentSnapshot = useMemo(
        () =>
            source && output.width > 0 && output.height > 0
                ? createScaleUpSnapshot(values, output, { assetId: source.assetId, width: source.width, height: source.height }, draft?.revision ?? null)
                : undefined,
        [values, output, source, draft?.revision],
    );
    const activeTask = useRestoredTask(toolId, task);
    const result = scaleUpResultFromTask(activeTask, snapshot, currentSnapshot);
    const resultImage = firstResultImageSource(activeTask);

    /** 「下载图片」走与结果卡同一个下载链路（真实落盘文件名由 buildResultFileName 生成）。 */
    const onDownloadImage = useCallback(async () => {
        if (!resultImage) return;
        try {
            await downloadResultItem({ id: `${toolId}-download`, kind: "image", dataUrl: resultImage }, 0, { toolId });
        } catch (error) {
            setRunError(error instanceof Error ? error.message : "下载失败。");
        }
    }, [resultImage, toolId]);

    const onSourceChange = useCallback(
        (assetIds: string[], records: ToolAssetRecord[]) => {
            const record = records[0];
            if (!record) {
                setSource(undefined);
                update({ sourceAssetId: "" });
                setFaceAvailability("unavailable");
                return;
            }
            const next = sourceFromRecord(record);
            setSource(next);
            update({ sourceAssetId: next.assetId, imageName: next.name ?? "" });
            const limits = validateScaleUpSource(next);
            setRunError(limits.ok ? undefined : limits.message);
            void detectScaleUpFace(next.dataUrl ?? next.url).then(setFaceAvailability);
        },
        [update],
    );

    const onModeChange = useCallback(
        (mode: ScaleUpValues["mode"]) => {
            if (mode !== "custom") {
                update({ mode });
                return;
            }
            const base = source?.width && source?.height ? { width: source.width, height: source.height } : undefined;
            if (!base) {
                update({ mode });
                return;
            }
            update({ mode, ...linkedCustomSize({ ...values, mode }, base, "width", base.width * 2) });
        },
        [update, source, values],
    );

    const onGenerate = useCallback(async () => {
        if (!source) return;
        setRunning(true);
        setRunError(undefined);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            await flushDraft(toolId);
            const run = await runScaleUp({
                gateway: getPersistedToolGateway(),
                values,
                output,
                source,
                model: imageModel,
                revision: draft?.revision ?? null,
                imageModelReady: Boolean(imageModel?.trim()),
                signal: controller.signal,
                onUpdate: setTask,
            });
            setTask(run.task);
            setSnapshot(run.snapshot);
        } catch (error) {
            setRunError(error instanceof ScaleUpAdapterError || error instanceof Error ? error.message : "生成失败。");
        } finally {
            setRunning(false);
            abortRef.current = null;
        }
    }, [values, output, source, imageModel, draft?.revision, flushDraft, toolId]);

    const onRetry = useCallback(async () => {
        if (!source || !task) return;
        setRunning(true);
        setRunError(undefined);
        try {
            const run = await retryScaleUp({
                gateway: getPersistedToolGateway(),
                values,
                output,
                source,
                model: imageModel,
                revision: draft?.revision ?? null,
                imageModelReady: Boolean(imageModel?.trim()),
                taskId: task.id,
                onUpdate: setTask,
            });
            setTask(run.task);
            setSnapshot(run.snapshot);
        } catch (error) {
            setRunError(error instanceof Error ? error.message : "重试失败。");
        } finally {
            setRunning(false);
        }
    }, [values, output, source, imageModel, draft?.revision, task]);

    const onCancel = useCallback(() => {
        abortRef.current?.abort();
        setRunning(false);
    }, []);

    /* ------------------------------ 视图 ------------------------------ */
    return (
        <div className={cn("relative flex h-full min-h-0 min-w-0 flex-col bg-canvas p-[10px]", className)} data-tool="scale-up" data-layout="scale-up-toolbar">
            {/* 原站高清放大（1600×1000）：圆角 8 主区 = 40px 工具条 + 左原图 / 右高清放大图两栏等宽。 */}
            <div data-testid="tool-main-column" className="flex min-h-0 flex-1 flex-col overflow-hidden ring-1 ring-border">
            <div data-testid="scale-up-toolbar" className="flex h-10 shrink-0 items-center gap-[10px] bg-card pl-[10px] pr-5">
                <div className="flex min-w-0 flex-1 items-center gap-[10px]" data-testid="scale-up-modes">
                    {SCALE_UP_MODES.map((mode) => {
                        const active = values.mode === mode.id;
                        return (
                            <button
                                key={mode.id}
                                type="button"
                                data-mode={mode.id}
                                aria-pressed={active}
                                disabled={running || !source}
                                onClick={() => onModeChange(mode.id)}
                                className={cn(toolbarButton, mode.id === "custom" && "w-[112px]", active ? "border-selected bg-selected-soft text-foreground" : "border-border bg-card text-foreground hover:border-selected")}
                            >
                                {mode.label}
                            </button>
                        );
                    })}
                    <label className={cn("flex items-center gap-0 text-[12px] leading-[19px] text-foreground/60", (!source || running) && "text-muted-foreground")}>
                        面部美化：
                        <Edit8Switch
                            checked={values.enhanceFace}
                            disabled={running || faceAvailability === "absent" || !source}
                            onChange={(next) => update({ enhanceFace: next })}
                            label="面部美化"
                            testId="scale-up-enhance-face"
                        />
                    </label>
                    <span className="h-4 w-px bg-border" aria-hidden />
                    <button
                        type="button"
                        disabled={running || !source}
                        onClick={() => onSourceChange([], [])}
                        data-testid="scale-up-reupload"
                        className={cn(toolbarButton, "border-transparent text-foreground hover:bg-accent disabled:border-transparent disabled:bg-transparent")}
                    >
                        <Upload className="size-3" aria-hidden />
                        重新上传
                    </button>
                </div>
                <div className="flex w-[43%] shrink-0 items-center gap-[10px] pl-5">
                    <button
                        type="button"
                        disabled={blocked}
                        title={blocking[0]?.message}
                        onClick={() => void onGenerate()}
                        data-testid="scale-up-generate"
                        className={cn(edit8GradientButtonClass, "h-7 min-w-0 flex-[225] gap-1 text-[12px]")}
                    >
                        <WandSparkles className="size-3.5" aria-hidden />
                        {running ? "生成中…" : "立即生成"}
                    </button>
                    <button
                        type="button"
                        disabled={!resultImage || running}
                        onClick={() => void onDownloadImage()}
                        data-testid="scale-up-download-image"
                        className={cn(toolbarButton, "min-w-0 flex-[241] border-border bg-card text-foreground hover:bg-accent")}
                    >
                        <Download className="size-3" aria-hidden />
                        下载图片
                    </button>
                    <button
                        type="button"
                        data-testid="scale-up-history"
                        onClick={() => setHistoryOpen((open) => !open)}
                        className="inline-flex shrink-0 items-center gap-1 text-[12px] leading-[19px] text-muted-foreground hover:text-foreground"
                    >
                        <History className="size-3" aria-hidden /> 历史记录
                    </button>
                </div>
            </div>
            {runError ? <p className="shrink-0 bg-card px-[10px] pb-1 text-[12px] text-destructive" data-testid="scale-up-run-error">{runError}</p> : null}

            <div data-testid="tool-workspace-columns" data-canvas="true" className="flex min-h-0 flex-1">
                <section data-region="before" className="relative flex min-h-0 min-w-0 flex-1 flex-col border-r border-border">
                    <span className={cn(halfTag, "right-3")}>
                        <MoveDownLeft className="size-3" aria-hidden /> 原图
                    </span>
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-5">
                        {source ? (
                            <>
                                <img src={source.dataUrl ?? source.url} alt="原图" className="max-h-full w-auto max-w-full object-contain" />
                                <p className="mt-2 text-[12px] text-foreground/60" data-testid="scale-up-expected-count">原图 {`${source.width ?? "?"}×${source.height ?? "?"}`}</p>
                            </>
                        ) : (
                            <Edit8UploadCard
                                testId="scale-up-upload-card"
                                className="w-[420px] pb-5 shadow-sm"
                                constraints={ASSET_CONSTRAINTS}
                                library={library}
                                disabled={running || restoringSource}
                                onPick={(record) => onSourceChange([record.id], [record])}
                                media={
                                    <div className="relative h-[288px] w-full shrink-0">
                                        <img src="/__cases/scale-up/upscale-after.png" alt="高清放大后" className="size-full" draggable={false} />
                                        <span className="absolute right-[6px] top-[6px] rounded-[12px] bg-black/80 px-[10px] text-[12px] leading-5 text-white">高清放大后</span>
                                        <div className="absolute left-px top-px h-[81px] w-[100px] overflow-hidden rounded-[12px] border-[3px] border-white">
                                            <img src="/__cases/scale-up/upscale-before.png" alt="原图" className="size-full" draggable={false} />
                                            <span className="absolute right-[3px] top-[3px] rounded-[12px] bg-black/80 px-[10px] text-[12px] leading-5 text-white">原图</span>
                                        </div>
                                    </div>
                                }
                                heading={
                                    <>
                                        <h2 className="m-0! pt-5 text-[26px] font-semibold leading-[41px] text-foreground">图片高清放大</h2>
                                        <p className="m-0! mb-3! text-[20px] leading-[31px] text-muted-foreground">放大清晰不失真，细节更丰富</p>
                                    </>
                                }
                                extraActions={
                                    <button type="button" disabled title="批量高清放大：本地暂未接入批量队列" className={edit8OutlineButtonClass} data-testid="scale-up-batch-entry">
                                        批量高清放大 <ArrowRight className="size-3.5" aria-hidden />
                                    </button>
                                }
                                hint={
                                    <div className="mt-3 text-[14px] leading-[22px] text-muted-foreground [&>p]:m-0!">
                                        <p>拖拽图片到此处</p>
                                        <p>支持jpg、jpeg、png、webp格式，</p>
                                        <p>最大尺寸: {SCALE_UP_SOURCE_LIMITS.maxSide}*{SCALE_UP_SOURCE_LIMITS.maxSide}</p>
                                    </div>
                                }
                            />
                        )}
                        {restoringSource ? <p className="mt-2 text-[12px] text-foreground/60">正在恢复上次的原图…</p> : null}
                        {source && values.mode === "custom" ? (
                            <div className="mt-3 flex items-center justify-center gap-2 text-xs" data-testid="scale-up-custom-size">
                                <input type="number" aria-label="输出宽度" value={values.customWidth || ""} disabled={running} onChange={(event) => update(linkedCustomSize(values, source, "width", Number(event.target.value)))} className={`${inputClass} w-20`} />
                                <span className="text-foreground/60">×</span>
                                <input type="number" aria-label="输出高度" value={values.customHeight || ""} disabled={running} onChange={(event) => update(linkedCustomSize(values, source, "height", Number(event.target.value)))} className={`${inputClass} w-20`} />
                            </div>
                        ) : null}
                        {source && blocking.length > 0 ? (
                            <ul className="mt-3 list-disc pl-4 text-[12px] text-amber-700 dark:text-amber-300" data-testid="scale-up-issues">
                                {blocking.map((issue) => (
                                    <li key={`${issue.code}-${issue.field}`}>{issue.message}</li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                </section>

                <aside data-testid="scale-up-result-column" data-region="after" className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                    <span className={cn(halfTag, "left-[13px]")}>
                        高清放大图 <MoveDownRight className="size-3" aria-hidden />
                    </span>
                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
                        {activeTask ? (
                            <>
                                <p className="m-0! mb-2! pt-6 text-[12px] text-foreground/60">
                                    输出尺寸：<span className="text-foreground" data-testid="scale-up-output-size">{outputSizeLabel(output)}</span>
                                </p>
                                <ToolResult task={activeTask} toolId={toolId} title="高清放大图" onCancel={onCancel} onRetry={onRetry} />
                                {result.stale ? <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300" data-testid="scale-up-stale">原图或参数已变更，下面的结果来自上一版配置，请重新生成。</p> : null}
                            </>
                        ) : (
                            <Edit8Empty large lines={source ? [`输出尺寸：${outputSizeLabel(output)}`, "点击「立即生成」进行图片高清放大"] : ["暂无结果图", "请在左侧上传图片后，进行图片高清放大操作"]} />
                        )}
                    </div>
                </aside>
            </div>
            </div>

            {historyOpen ? (
                <div data-testid="scale-up-history-panel" className="absolute inset-y-0 right-0 z-20 flex w-[360px] flex-col border-l border-border bg-background p-3 shadow-xl">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium">历史记录</span>
                        <button type="button" onClick={() => setHistoryOpen(false)} className="text-xs text-muted-foreground">关闭</button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <ToolTaskHistory toolId={toolId} minimalEmpty onSelectTask={(historyTask) => { setTask(historyTask); setHistoryOpen(false); }} />
                    </div>
                </div>
            ) : null}
        </div>
    );
}

/* ==================================================================== */
/* TASK-018：PRODUCT_REFINE（商品精修）                                  */
/* ==================================================================== */

const REFINE_ASSET_CONSTRAINTS: Partial<ToolAssetConstraints> = {
    mimeTypes: [...PRODUCT_REFINE_SOURCE_LIMITS.mimeTypes],
    maxBytes: PRODUCT_REFINE_SOURCE_LIMITS.maxBytes,
    minWidth: PRODUCT_REFINE_SOURCE_LIMITS.minSide,
    minHeight: PRODUCT_REFINE_SOURCE_LIMITS.minSide,
    maxWidth: PRODUCT_REFINE_SOURCE_LIMITS.maxSide,
    maxHeight: PRODUCT_REFINE_SOURCE_LIMITS.maxSide,
};

function refineSourceFromRecord(record: ToolAssetRecord): ProductRefineSourceAsset {
    return {
        assetId: record.id,
        dataUrl: record.url,
        url: record.url,
        name: record.name,
        mimeType: record.mimeType,
        bytes: record.bytes,
        width: record.width,
        height: record.height,
    };
}

/**
 * TASK-018：PRODUCT_REFINE（商品精修）工作区。
 *
 * 页面规格见 docs/V1.0/plan_linkfox_navigation/page-specs/11-product-refine.md：
 * 商品图上传（20M 内，jpg/jpeg/png/webp）→ 精修模式（整图 / 去背景）→ 精修强度 →
 * 自动尺寸规则（≤512 ×4、513–1024 ×2、>1024 原尺寸）→ 色彩校正 → 精修 → 前后对比。
 * 精修强度、去背景、比例与色彩配置集中在同一「精修配置」面板里，逐项进入真实请求。
 */
export function ProductRefineWorkspace({ className }: { className?: string }) {
    const toolId = PRODUCT_REFINE_TOOL_ID;
    const hydrate = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const flushDraft = useToolDraftStore((state) => state.flush);
    const draft = useToolDraftStore((state) => state.drafts[toolId]);
    const imageModel = useConfigStore((state) => state.config.imageModel);
    const assets = useAssetStore((state) => state.assets);
    const libraryItems = useMemo(
        () => assets.filter((asset): asset is ImageAsset | VideoAsset => asset.kind === "image" || asset.kind === "video"),
        [assets],
    );
    const library = useMemo(() => toolAssetLibraryItemsFromAssets(libraryItems), [libraryItems]);
    const [resultTab, setResultTab] = useState<"result" | "history">("result");

    const [values, setValues] = useState<ProductRefineValues>(() => ({ ...DEFAULT_PRODUCT_REFINE_VALUES }));
    const [source, setSource] = useState<ProductRefineSourceAsset | undefined>();
    const [restoringSource, setRestoringSource] = useState(false);
    const [task, setTask] = useState<ToolTask | undefined>();
    const [snapshot, setSnapshot] = useState<ReturnType<typeof createProductRefineSnapshot> | undefined>();
    const [running, setRunning] = useState(false);
    const [runError, setRunError] = useState<string | undefined>();
    const abortRef = useRef<AbortController | null>(null);

    /* 草稿恢复：值与上次商品图 id；图丢了就明确要求重选，不假装已恢复 */
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const restored = await hydrate(toolId);
            if (cancelled) return;
            const parsed = readProductRefineValues(restored?.values?.productRefine as Record<string, unknown> | undefined);
            setValues(parsed);
            const assetId = parsed.sourceAssetId;
            if (!assetId) return;
            setRestoringSource(true);
            try {
                const { records } = await loadToolAssetRecords([assetId]);
                if (cancelled) return;
                const record = records[0];
                if (record) setSource(refineSourceFromRecord(record));
            } finally {
                if (!cancelled) setRestoringSource(false);
            }
        })();
        return () => {
            cancelled = true;
            void flushDraft(toolId);
        };
    }, [toolId, hydrate, flushDraft]);

    const update = useCallback(
        (next: Partial<ProductRefineValues>) => {
            setValues((previous) => {
                const merged: ProductRefineValues = { ...previous, ...next };
                patchDraft(toolId, {
                    values: { productRefine: merged },
                    assetIds: merged.sourceAssetId ? [merged.sourceAssetId] : [],
                });
                return merged;
            });
        },
        [patchDraft, toolId],
    );

    const output = useMemo(() => computeProductRefineOutput(source), [source]);
    const issues = useMemo(
        () =>
            validateProductRefineState({
                values,
                output,
                sourceReady: isProductRefineSourceReady(source),
                imageModelReady: Boolean(imageModel?.trim()),
            }),
        [values, output, source, imageModel],
    );
    const blocking = issues.filter((issue) => issue.code !== "source-size-unknown");
    const sourceIssue = source ? validateProductRefineSource(source) : undefined;
    const blocked = running || blocking.length > 0 || (sourceIssue ? !sourceIssue.ok : false);

    const currentSnapshot = useMemo(
        () =>
            source && output.width > 0 && output.height > 0
                ? createProductRefineSnapshot(
                      values,
                      output,
                      { assetId: source.assetId, width: source.width, height: source.height },
                      draft?.revision ?? null,
                  )
                : undefined,
        [values, output, source, draft?.revision],
    );
    const drift = useMemo(
        () => describeProductRefineDrift(snapshot, currentSnapshot),
        [snapshot, currentSnapshot],
    );
    const activeTask = useRestoredTask(toolId, task);
    const result = productRefineResultFromTask(activeTask, snapshot, currentSnapshot, drift);
    const resultImage = firstProductRefineImage(activeTask);

    const onSourceChange = useCallback(
        (assetIds: string[], records: ToolAssetRecord[]) => {
            const record = records[0];
            if (!record) {
                setSource(undefined);
                setTask(undefined);
                setSnapshot(undefined);
                update({ sourceAssetId: "" });
                return;
            }
            const next = refineSourceFromRecord(record);
            setSource(next);
            /* 替换商品图 → 旧精修结果不能继续冒充当前结果 */
            setTask(undefined);
            setSnapshot(undefined);
            update({ sourceAssetId: next.assetId, imageName: next.name ?? "" });
            const limits = validateProductRefineSource(next);
            setRunError(limits.ok ? undefined : limits.message);
        },
        [update],
    );

    const onGenerate = useCallback(async () => {
        if (!source) return;
        setRunning(true);
        setRunError(undefined);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            await flushDraft(toolId);
            const run = await runProductRefine({
                gateway: getPersistedToolGateway(),
                values,
                output,
                source,
                model: imageModel,
                revision: draft?.revision ?? null,
                imageModelReady: Boolean(imageModel?.trim()),
                signal: controller.signal,
                onUpdate: setTask,
            });
            setTask(run.task);
            setSnapshot(run.snapshot);
        } catch (error) {
            setRunError(
                error instanceof ProductRefineAdapterError || error instanceof Error ? error.message : "精修失败。",
            );
        } finally {
            setRunning(false);
            abortRef.current = null;
        }
    }, [values, output, source, imageModel, draft?.revision, flushDraft, toolId]);

    const onRetry = useCallback(async () => {
        if (!source || !task) return;
        setRunning(true);
        setRunError(undefined);
        try {
            const run = await retryProductRefine({
                gateway: getPersistedToolGateway(),
                values,
                output,
                source,
                model: imageModel,
                revision: draft?.revision ?? null,
                imageModelReady: Boolean(imageModel?.trim()),
                taskId: task.id,
                onUpdate: setTask,
            });
            setTask(run.task);
            setSnapshot(run.snapshot);
        } catch (error) {
            setRunError(error instanceof Error ? error.message : "重试失败。");
        } finally {
            setRunning(false);
        }
    }, [values, output, source, imageModel, draft?.revision, task]);

    const onCancel = useCallback(() => {
        abortRef.current?.abort();
        setRunning(false);
    }, []);

    /* ------------------------------ 视图 ------------------------------ */
    return (
        <div className={cn("flex h-full min-h-0 flex-col overflow-hidden bg-canvas p-[10px]", className)} data-tool="product-refine" data-layout="refine-three-column">
            {/* 原站商品精修（1600×1000）：画布 | 配置 240（面板卡 + 卡外「开始精修」）| 结果 300，列间距 10。 */}
            <div data-testid="tool-workspace-columns" data-canvas="true" className="grid min-h-0 flex-1 grid-cols-1 gap-[10px] lg:grid-cols-[minmax(0,1fr)_240px_300px]">
                <section data-region="canvas" data-testid="tool-main-column" className="flex min-h-0 min-w-0 flex-col items-center justify-center overflow-y-auto border border-border p-5">
                    {source ? (
                        <div className="flex max-h-full flex-col items-center gap-3">
                            <img src={source.dataUrl ?? source.url} alt="待精修商品图" className="max-h-[640px] w-auto max-w-full rounded-[8px] object-contain" />
                            <button type="button" disabled={running} onClick={() => onSourceChange([], [])} className={edit8OutlineButtonClass} data-testid="refine-reupload">
                                重新上传
                            </button>
                        </div>
                    ) : (
                        <Edit8UploadCard
                            testId="refine-upload-card"
                            className="w-[542px] pb-6"
                            constraints={REFINE_ASSET_CONSTRAINTS}
                            library={library}
                            disabled={running || restoringSource}
                            uploadLabel="上传图片"
                            onPick={(record) => onSourceChange([record.id], [record])}
                            media={<RefineExampleCarousel />}
                            heading={
                                <>
                                    <h2 className="m-0! mt-[10px]! text-[20px] font-normal leading-[31px] text-foreground">商品精修</h2>
                                    <p className="m-0! mb-5! mt-[10px]! px-10 text-[16px] leading-[19px] text-muted-foreground">
                                        一键提升商品质感
                                        <br />
                                        改善商品的轮廓，光泽、材质与颜色等
                                    </p>
                                </>
                            }
                        />
                    )}
                </section>
                <aside data-region="config" data-testid="tool-config-column" className="flex min-h-0 w-[240px] min-w-0 shrink-0 flex-col">
                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[8px] bg-card">
                        <div className="flex flex-1 flex-col">
                <div className="px-3 py-[10px]">
                    <p className="m-0! text-[12px] leading-[22px] text-muted-foreground">精修模式</p>
                    <div className="mt-[10px] flex" data-testid="refine-modes" role="radiogroup" aria-label="精修模式">
                        {PRODUCT_REFINE_MODES.map((item, index) => {
                            const active = values.mode === item.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={active}
                                    data-mode={item.id}
                                    disabled={running}
                                    onClick={() => update({ mode: item.id })}
                                    className={cn(
                                        "relative h-8 flex-1 border bg-card px-[15px] text-[14px] leading-[30px] transition disabled:opacity-50",
                                        index === 0 ? "rounded-l-[6px]" : "-ml-px rounded-r-[6px]",
                                        active ? "z-10 border-selected bg-selected-soft text-foreground" : "border-border text-foreground hover:bg-accent",
                                    )}
                                >
                                    {item.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="px-3 py-[10px]">
                    <p className="m-0! mb-[10px]! text-[12px] leading-[22px] text-muted-foreground">上传待精修的商品图</p>
                    <Edit8Dropzone target="需要修复的图" hint="20M以内，jpg/jpeg/png/webp" constraints={REFINE_ASSET_CONSTRAINTS} disabled={running} onPick={(record) => onSourceChange([record.id], [record])} testId="refine-dropzone" />
                    {restoringSource ? <p className="mt-2 text-[11px] text-foreground/60">正在恢复上次的商品图…</p> : null}
                    {!source && values.sourceAssetId && !restoringSource ? <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">上次的商品图已失效，请重新选择。</p> : null}
                    {sourceIssue && !sourceIssue.ok ? <p className="mt-2 text-[11px] text-destructive">{sourceIssue.message}</p> : null}
                    {source?.width && source?.height ? (
                        <p className="m-0! mt-2! text-[11px] leading-4 text-foreground/60" data-testid="refine-output-size">
                            原图 {source.width}×{source.height} · 预计输出 {productRefineOutputLabel(output)}（{output.ruleLabel}）
                        </p>
                    ) : null}
                </div>
                <p className="m-0! mt-auto! px-2 pb-[10px] text-center text-[12px] leading-[19px] text-muted-foreground">💡默认生图尺寸规则：原图尺寸≤512px → 放大 4 倍，513~1024px → 放大 2 倍，＞1024px → 原尺寸</p>
                        </div>
                    </div>
                    <div className="mt-2 shrink-0">
                        {source && blocking.length > 0 ? (
                            <ul className="mb-2 list-disc pl-4 text-[11px] text-amber-700 dark:text-amber-300" data-testid="refine-issues">
                                {blocking.map((issue) => (<li key={`${issue.code}-${issue.field}`}>{issue.message}</li>))}
                            </ul>
                        ) : null}
                        <button type="button" disabled={blocked} title={blocking[0]?.message} onClick={() => void onGenerate()} data-testid="refine-generate" className={cn(edit8GradientButtonClass, "w-full gap-1 text-[12px]")}>
                            <WandSparkles className="size-3.5" aria-hidden />
                            {running ? "精修中…" : "开始精修"}
                        </button>
                        {runError ? <p className="mt-2 text-[11px] text-destructive" data-testid="refine-run-error">{runError}</p> : null}
                    </div>
                </aside>
                <section data-testid="change-color-results" data-region="results" className="flex min-h-0 w-[300px] min-w-0 shrink-0 flex-col overflow-hidden rounded-[8px] bg-canvas">
                    <Edit8ResultTabs
                        tabs={[{ id: "result", label: "生成结果", testId: "refine-tab-result" }]}
                        active={resultTab === "history" ? "" : "result"}
                        onTabChange={() => setResultTab("result")}
                        onHistory={() => setResultTab((tab) => (tab === "history" ? "result" : "history"))}
                        historyActive={resultTab === "history"}
                        historyTestId="refine-tab-history"
                    />
                    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-4 pl-4 pr-3">
                        {result.stale ? (
                            <p className="rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300" data-testid="refine-stale">
                                原图或配置已变更（{result.drift || "参数"}），下面的结果来自上一版配置，请重新精修。
                            </p>
                        ) : null}
                        {resultTab === "history" ? (
                            <ToolTaskHistory
                                toolId={toolId}
                                minimalEmpty
                                onSelectTask={(historyTask) => {
                                    setTask(historyTask);
                                    setResultTab("result");
                                }}
                            />
                        ) : activeTask ? (
                            <ToolResult task={activeTask} toolId={toolId} title="生成结果" onCancel={onCancel} onRetry={onRetry} />
                        ) : (
                            <Edit8Empty lines={["暂无生成结果图"]} />
                        )}
                        {resultTab === "result" && resultImage && (source?.dataUrl || source?.url) ? (
                            <div className="rounded-[8px] bg-card p-2">
                                <CompareSlider before={source.dataUrl ?? source.url ?? ""} after={resultImage} testIdPrefix="refine" labels={{ before: "精修前", after: "精修后" }} />
                            </div>
                        ) : null}
                    </div>
                </section>
            </div>
        </div>
    );
}

export default ScaleUpWorkspace;
