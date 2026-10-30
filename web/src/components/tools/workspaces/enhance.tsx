import { modelLabel } from "@/lib/model-label";
import { OrigRail, SMART_EDIT_RAIL } from "@/components/tools/workspaces/orig-rail";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
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
    productRefineMode,
    productRefineOutputLabel,
    productRefineStrength,
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
import { WatermarkGroupPanel } from "@/components/tools/watermark-group-panel";

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

/** 原站面板里的分区没有标题行（如放大模式、增强选项、生成），title 可省略。 */
function Section({ title, hint, children }: { title?: string; hint?: string; children: React.ReactNode }) {
    return (
        <section className="rounded-lg border border-stone-200 bg-card/60 p-2 dark:border-stone-800 dark:bg-stone-900/40">
            {title || hint ? (
                <header className="mb-2 flex items-baseline gap-2">
                    {title ? <h3 className="text-sm font-medium text-stone-800 dark:text-stone-100">{title}</h3> : null}
                    {hint ? <span className="text-[11px] text-stone-500 dark:text-stone-400">{hint}</span> : null}
                </header>
            ) : null}
            {children}
        </section>
    );
}

const inputClass =
    "rounded-md border border-stone-200 bg-card px-2 py-1 text-xs text-stone-800 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100";

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
/** 原站左栏顶部的前后对比卡：原图/高清放大后（商品精修为 精修前/精修后）+ 结果槽位 1..N。 */
function ComparePreviewCard({
    beforeLabel,
    afterLabel,
    beforeUrl,
    slots = 1,
    testId,
}: {
    beforeLabel: string;
    afterLabel: string;
    beforeUrl?: string;
    slots?: number;
    testId: string;
}) {
    const [tab, setTab] = useState<"before" | "after">("before");
    return (
        <div className="rounded-lg border border-stone-200 bg-card p-2 dark:border-stone-800 dark:bg-stone-900/40" data-testid={testId}>
            <div className="flex items-center gap-1" role="tablist" aria-label="前后对比">
                {[
                    { id: "before" as const, label: beforeLabel },
                    { id: "after" as const, label: afterLabel },
                ].map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === item.id}
                        data-testid={`${testId}-tab-${item.id}`}
                        onClick={() => setTab(item.id)}
                        className={`rounded px-2 py-1 text-[11px] leading-none transition ${
                            tab === item.id
                                ? "bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900"
                                : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                        }`}
                    >
                        {item.label}
                    </button>
                ))}
            </div>
            <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${slots}, minmax(0, 1fr))` }}>
                {Array.from({ length: slots }, (_, index) => (
                    <div
                        key={index}
                        className="relative flex aspect-square items-center justify-center overflow-hidden rounded border border-dashed border-stone-300 bg-stone-50 dark:border-stone-700 dark:bg-stone-900"
                    >
                        {tab === "before" && beforeUrl ? (
                            <img src={beforeUrl} alt={`${beforeLabel} ${index + 1}`} className="size-full object-cover" />
                        ) : (
                            <span aria-hidden className="size-4 rounded-[2px] bg-stone-200 dark:bg-stone-700" />
                        )}
                        {slots > 1 ? (
                            <span className="absolute left-1 top-1 rounded bg-black/50 px-1 text-[10px] leading-4 text-white">{index + 1}</span>
                        ) : null}
                    </div>
                ))}
            </div>
        </div>
    );
}

function CompareSlider({ before, after, testIdPrefix = "scale-up", labels }: { before: string; after: string; testIdPrefix?: string; labels?: { before: string; after: string } }) {
    const [position, setPosition] = useState(50);
    const afterLabel = labels?.after ?? "放大后";
    const beforeLabel = labels?.before ?? "原图";
    return (
        <div className="flex flex-col gap-2" data-testid={`${testIdPrefix}-compare`}>
            <div className="relative overflow-hidden rounded-lg border border-stone-200 dark:border-stone-700">
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
            <p className="text-[11px] text-stone-500">
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

    const [values, setValues] = useState<ScaleUpValues>(() => ({ ...DEFAULT_SCALE_UP_VALUES }));
    const [source, setSource] = useState<ScaleUpSourceAsset | undefined>();
    const [restoringSource, setRestoringSource] = useState(false);
    const [faceAvailability, setFaceAvailability] = useState<FaceAvailability>("unavailable");
    const [task, setTask] = useState<ToolTask | undefined>();
    const [snapshot, setSnapshot] = useState<ReturnType<typeof createScaleUpSnapshot> | undefined>();
    const [running, setRunning] = useState(false);
    const [runError, setRunError] = useState<string | undefined>();
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
        <div className={`flex flex-col gap-3 ${className ?? ""}`} data-tool="scale-up">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                {/* 左栏：配置（上传 / 参数 / 生成动作 / 水印分组） */}
                <div className="flex flex-col gap-2">
                <nav
                    aria-label="电商套图"
                    className="flex flex-wrap items-center gap-1 rounded-md border border-stone-200 bg-card/60 px-2 py-1 text-[11px] text-stone-500 dark:border-stone-800 dark:bg-stone-900/40 dark:text-stone-400"
                    data-testid="scale-up-nav-strip"
                >
                    <span className="mr-1 font-medium text-stone-700 dark:text-stone-200">250</span>
                    {["商品套图", "服装套图", "爆款图复刻", "NEW", "套图换色", "批量翻译", "批量抠图", "智能扩图"].map((label) => (
                        <span key={label} className={cn("rounded px-1.5 py-0.5", label === "NEW" ? "text-primary" : "")}>
                            {label}
                        </span>
                    ))}
                    <span className="ml-auto text-[11px] text-emerald-600 dark:text-emerald-400" data-testid="scale-up-driver">ljq_driver: 已连接</span>
                </nav>
                <Section>
                    {/* 原站左栏顶部：原图 / 高清放大后 前后对比卡（无结果时为空槽位） */}
                    <div className="mb-1.5 grid grid-cols-2 gap-2" data-testid="scale-up-mirror-slots">
                        <div className="flex h-10 items-center justify-center rounded-md border border-dashed border-stone-300 text-[11px] text-stone-500 dark:border-stone-700 dark:text-stone-400">
                            <span>原图</span>
                        </div>
                        <div className="flex h-10 items-center justify-center rounded-md border border-dashed border-stone-300 text-[11px] text-stone-500 dark:border-stone-700 dark:text-stone-400">
                            <span>高清放大后</span>
                        </div>
                    </div>
                    {/* 原站空态：图片高清放大（H2，420 宽居中）+ 副标题 + 三个上传入口 + 拖拽/格式/尺寸提示 */}
                    <header className="mb-2 text-center">
                        <h2 className="text-[15px] font-semibold text-stone-800 dark:text-stone-100">图片高清放大</h2>
                        <h3 className="mt-1 text-xs text-stone-500 dark:text-stone-400">放大清晰不失真，细节更丰富</h3>
                    </header>
                    <ToolAssetInput
                        toolId={toolId}
                        constraints={ASSET_CONSTRAINTS}
                        maxCount={1}
                        disabled={running}
                        variant="linkfox"
                        title=""
                        wide
                        dropLabel="拖拽图片到此处"
                        uploadLabel="从本地上传"
                        hint={
                            <>
                                <span>支持jpg、jpeg、png、webp格式，</span>
                                <br />
                                <span>
                                    最大尺寸: {SCALE_UP_SOURCE_LIMITS.maxSide}*{SCALE_UP_SOURCE_LIMITS.maxSide}
                                </span>
                            </>
                        }
                        thirdAction={
                            <button
                                type="button"
                                data-testid="scale-up-batch"
                                disabled
                                title="批量高清放大：批量队列未接入（PARTIAL）"
                                className="h-6 w-[100px] rounded-md border border-primary text-[12px] leading-none text-primary disabled:opacity-50"
                            >
                                批量高清放大
                            </button>
                        }
                        onChange={onSourceChange}
                    />
                    {restoringSource ? <p className="mt-2 text-[11px] text-stone-500">正在恢复上次的原图…</p> : null}
                    {!source && values.sourceAssetId && !restoringSource ? (
                        <p className="mt-2 text-[11px] text-amber-600">上次的原图已失效，请重新选择。</p>
                    ) : null}
                    {sourceIssue && !sourceIssue.ok ? <p className="mt-2 text-[11px] text-red-600">{sourceIssue.message}</p> : null}
                    {source?.width && source?.height ? (
                        <p className="mt-2 text-[11px] text-stone-500" data-testid="scale-up-source-size">
                            原图 {source.width}×{source.height}
                        </p>
                    ) : null}
                </Section>

                <Section>
                    <div className="flex flex-wrap gap-2" data-testid="scale-up-modes">
                        {SCALE_UP_MODES.map((mode) => {
                            const active = values.mode === mode.id;
                            return (
                                <button
                                    key={mode.id}
                                    type="button"
                                    data-mode={mode.id}
                                    aria-pressed={active}
                                    disabled={running}
                                    onClick={() => onModeChange(mode.id)}
                                    className={`rounded-md border px-2 py-1 text-xs ${
                                        active
                                            ? "border-stone-800 bg-stone-800 text-white dark:border-stone-200 dark:bg-stone-200 dark:text-stone-900"
                                            : "border-stone-200 text-stone-700 hover:border-stone-400 dark:border-stone-700 dark:text-stone-200"
                                    }`}
                                >
                                    {mode.label}
                                </button>
                            );
                        })}
                    </div>
                    <p className="mt-2 text-[11px] text-stone-500">{scaleUpMode(values.mode).hint}</p>

                    {values.mode === "custom" ? (
                        <div className="mt-2 flex items-center gap-2 text-xs" data-testid="scale-up-custom-size">
                            <input
                                type="number"
                                aria-label="输出宽度"
                                value={values.customWidth || ""}
                                disabled={!source || running}
                                onChange={(event) => update(linkedCustomSize(values, source, "width", Number(event.target.value)))}
                                className={`${inputClass} w-20`}
                            />
                            <span className="text-stone-500">×</span>
                            <input
                                type="number"
                                aria-label="输出高度"
                                value={values.customHeight || ""}
                                disabled={!source || running}
                                onChange={(event) => update(linkedCustomSize(values, source, "height", Number(event.target.value)))}
                                className={`${inputClass} w-20`}
                            />
                        </div>
                    ) : null}

                    <dl className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-stone-600 dark:text-stone-300">
                        <div>
                            输出尺寸：
                            <span className="font-medium" data-testid="scale-up-output-size">
                                {outputSizeLabel(output)}
                            </span>
                        </div>
                    </dl>

                    {output.suggestion ? (
                        <button
                            type="button"
                            className="mt-2 text-[11px] text-blue-600 underline"
                            onClick={() => update({ mode: "custom", ...output.suggestion })}
                            data-testid="scale-up-apply-suggestion"
                        >
                            改用合法尺寸 {output.suggestion.width}×{output.suggestion.height}
                        </button>
                    ) : null}

                    {output.issues
                        .filter((issue) => issue.code !== "source-size-unknown")
                        .map((issue) => (
                            <p key={`${issue.code}-${issue.field}`} className="mt-1 text-[11px] text-red-600">
                                {issue.message}
                            </p>
                        ))}
                </Section>

                {/* 原站把「面部美化：+ 重新上传」放在模式同一横排右侧（y=131/132），这里保持一行内联 */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-card/60 px-3 py-2 dark:border-stone-800 dark:bg-stone-900/40">
                    <label className="flex items-center gap-2 text-xs text-stone-700 dark:text-stone-200">
                        <span>面部美化：</span>
                        <input
                            type="checkbox"
                            checked={values.enhanceFace}
                            disabled={running || faceAvailability === "absent"}
                            onChange={(event) => update({ enhanceFace: event.target.checked })}
                            data-testid="scale-up-enhance-face"
                        />
                        <span className="text-[11px] text-stone-500 dark:text-stone-400" data-testid="scale-up-face-state">
                            {faceAvailability === "detected"
                                ? "已检测到人脸"
                                : faceAvailability === "absent"
                                  ? "未检测到人脸，不可用"
                                  : null}
                        </span>
                    </label>
                    <button
                        type="button"
                        disabled={running || !source}
                        onClick={() => onSourceChange([], [])}
                        data-testid="scale-up-reupload"
                        className="text-xs text-blue-600 underline disabled:cursor-not-allowed disabled:text-stone-400 disabled:no-underline"
                    >
                        重新上传
                    </button>
                </div>

                <Section>
                    {blocking.length > 0 ? (
                        <ul className="mb-2 list-disc pl-4 text-[11px] text-amber-600" data-testid="scale-up-issues">
                            {blocking.map((issue) => (
                                <li key={`${issue.code}-${issue.field}`}>{issue.message}</li>
                            ))}
                        </ul>
                    ) : null}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={blocked}
                            onClick={() => void onGenerate()}
                            data-testid="scale-up-generate"
                            className="h-8 flex-1 rounded-md bg-stone-800 px-3 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-stone-200 dark:text-stone-900"
                        >
                            {running ? "生成中…" : "立即生成"}
                        </button>
                        <span className="text-[11px] text-stone-500 dark:text-stone-400">(20算力)</span>
                    </div>
                    {/* 原站「立即生成」下方紧跟同宽「下载图片」按钮（319×28，outlined，无结果时 disabled，#d9d9d9 边框 + rgba(0,0,0,0.04) 底） */}
                    <button
                        type="button"
                        disabled={!resultImage || running}
                        onClick={() => void onDownloadImage()}
                        data-testid="scale-up-download-image"
                        className="mt-2 flex h-7 w-full items-center justify-center rounded-md border border-border bg-black/[0.04] text-[12px] leading-none text-muted-foreground/70 transition enabled:bg-card enabled:text-foreground disabled:cursor-not-allowed"
                    >
                        下载图片
                    </button>
                    {runError ? (
                        <p className="mt-2 text-[11px] text-red-600" data-testid="scale-up-run-error">
                            {runError}
                        </p>
                    ) : null}
                </Section>
                    {/* 原站左栏底部：管理水印分组（共 N/20 个 · 默认 · ＋ 新增水印分组） */}
                    <WatermarkGroupPanel />
                </div>

                {/* 右栏：结果（原站在右侧画布区，不与配置纵向堆叠） */}
                <div className="flex flex-col gap-3">
                    {result.stale ? (
                        <p className="rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" data-testid="scale-up-stale">
                            原图或参数已变更，下面的结果来自上一版配置，请重新生成。
                        </p>
                    ) : null}

                    <ToolResult
                        task={activeTask}
                        toolId={toolId}
                        title="高清放大图"
                        emptyTitle="暂无结果图"
                        emptyHint="请在左侧上传图片后，进行图片高清放大操作"
                        onCancel={onCancel}
                        onRetry={onRetry}
                    />

            {resultImage && (source?.dataUrl || source?.url) ? (
                <Section>
                    <CompareSlider
                        before={source.dataUrl ?? source.url ?? ""}
                        after={resultImage}
                        labels={{ before: "原图", after: "高清放大后" }}
                    />
                </Section>
            ) : null}
                </div>
            </div>
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
    const mode = productRefineMode(values.mode);
    const strength = productRefineStrength(values.strength);

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
        <div className={`flex flex-col gap-3 ${className ?? ""}`} data-tool="product-refine">
            <OrigRail items={SMART_EDIT_RAIL} active="商品精修" driver testId="product-refine-rail" />
            <div className="grid gap-3 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                {/* 左栏：配置（上传 / 参数 / 精修动作 / 水印分组） */}
                <div className="flex flex-col gap-3">
                <Section>
                    {/* 原站空态：一键提升商品质感（H2）+ 副标题 + 上传区 + 尺寸规则提示 */}
                    <header className="mb-2 text-center">
                        <h2 className="text-[15px] font-semibold text-stone-800 dark:text-stone-100">一键提升商品质感</h2>
                        <h3 className="mt-1 text-xs text-stone-500 dark:text-stone-400">改善商品的轮廓，光泽、材质与颜色等</h3>
                    </header>
                    <ToolAssetInput
                        toolId={toolId}
                        constraints={REFINE_ASSET_CONSTRAINTS}
                        maxCount={1}
                        disabled={running}
                        library={library}
                        variant="linkfox"
                        title="上传待精修的商品图"
                        uploadLabel="上传图片"
                        dropLabel="拖拽 或 点击上传 需要修复的图"
                        hint="20M以内，jpg/jpeg/png/webp"
                        thirdAction={null}
                        onChange={onSourceChange}
                    />
                    {restoringSource ? <p className="mt-2 text-[11px] text-stone-500">正在恢复上次的商品图…</p> : null}
                    {!source && values.sourceAssetId && !restoringSource ? (
                        <p className="mt-2 text-[11px] text-amber-600">上次的商品图已失效，请重新选择。</p>
                    ) : null}
                    {sourceIssue && !sourceIssue.ok ? <p className="mt-2 text-[11px] text-red-600">{sourceIssue.message}</p> : null}
                    {source?.width && source?.height ? (
                        <p className="mt-2 text-[11px] text-stone-500" data-testid="refine-source-size">
                            原图 {source.width}×{source.height}
                        </p>
                    ) : null}
                </Section>

                <Section title="精修模式">
                    <div className="flex flex-wrap gap-2" data-testid="refine-modes" role="radiogroup" aria-label="精修模式">
                        {PRODUCT_REFINE_MODES.map((item) => {
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
                                    className={`min-h-9 rounded-md border px-2 py-1 text-xs ${
                                        active
                                            ? "border-stone-800 bg-stone-800 text-white dark:border-stone-200 dark:bg-stone-200 dark:text-stone-900"
                                            : "border-stone-200 text-stone-700 hover:border-stone-400 dark:border-stone-700 dark:text-stone-200"
                                    }`}
                                >
                                    {item.label}
                                </button>
                            );
                        })}
                    </div>
                    <p className="mt-2 text-[11px] text-stone-500">💡默认生图尺寸规则：原图尺寸≤512px → 放大 4 倍，513~1024px → 放大 2 倍，＞1024px → 原尺寸</p>

                    {blocking.length > 0 ? (
                        <ul className="mt-2 list-disc pl-4 text-[11px] text-amber-600" data-testid="refine-issues">
                            {blocking.map((issue) => (
                                <li key={`${issue.code}-${issue.field}`}>{issue.message}</li>
                            ))}
                        </ul>
                    ) : null}
                    <div className="mt-2 flex items-center gap-2">
                        <button
                            type="button"
                            disabled={blocked}
                            onClick={() => void onGenerate()}
                            data-testid="refine-generate"
                            className="h-8 flex-1 rounded-md bg-stone-800 px-3 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-stone-200 dark:text-stone-900"
                        >
                            {running ? "精修中…" : "开始精修"}
                        </button>
                        <span
                            className="rounded border border-red-300 px-1 text-[11px] leading-5 text-red-500 dark:border-red-800"
                            data-testid="refine-free-badge"
                        >
                            限免
                        </span>
                    </div>
                    <p className="mt-2 text-[11px] text-stone-500" data-testid="refine-expected-count">
                        预计产出 1 张主结果{mode.producesAlpha ? "，并附带透明底/分段结果" : ""}
                    </p>
                    {runError ? (
                        <p className="mt-2 text-[11px] text-red-600" data-testid="refine-run-error">
                            {runError}
                        </p>
                    ) : null}
                </Section>
                    {/* 原站面板底部：管理水印分组（共 N/20 个 · 默认 · ＋ 新增水印分组） */}
                    <WatermarkGroupPanel />
                </div>

                {/* 右栏：结果（原站在右侧画布区，不与配置纵向堆叠） */}
                <div className="flex flex-col gap-3">
                    {/* 原站结果区顶部：精修前 / 精修后 切换 + 1~4 槽位 */}
                    <ComparePreviewCard
                        testId="refine-compare-preview"
                        beforeLabel="精修前"
                        afterLabel="精修后"
                        beforeUrl={source?.dataUrl ?? source?.url}
                        slots={4}
                    />

                    {result.stale ? (
                <p
                    className="rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                    data-testid="refine-stale"
                >
                    原图或配置已变更（{result.drift || "参数"}），下面的结果来自上一版配置，请重新精修。
                </p>
            ) : null}

            <div className="flex items-center gap-1 border-b border-stone-200 dark:border-stone-700" role="tablist" aria-label="结果区">
                <button
                    type="button"
                    role="tab"
                    aria-selected={resultTab === "result"}
                    className={`-mb-px border-b-2 px-2 py-1 text-xs transition ${
                        resultTab === "result" ? "border-stone-900 font-medium text-stone-900 dark:border-stone-100 dark:text-stone-100" : "border-transparent text-stone-500 hover:text-stone-800"
                    }`}
                    onClick={() => setResultTab("result")}
                    data-testid="refine-tab-result"
                >
                    生成结果
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={resultTab === "history"}
                    className={`-mb-px border-b-2 px-2 py-1 text-xs transition ${
                        resultTab === "history" ? "border-stone-900 font-medium text-stone-900 dark:border-stone-100 dark:text-stone-100" : "border-transparent text-stone-500 hover:text-stone-800"
                    }`}
                    onClick={() => setResultTab("history")}
                    data-testid="refine-tab-history"
                >
                    历史记录
                </button>
            </div>

            {resultTab === "result" ? (
                <ToolResult
                    task={activeTask}
                    toolId={toolId}
                    title="生成结果"
                    emptyTitle="暂无生成结果图"
                    emptyHint=""
                    onCancel={onCancel}
                    onRetry={onRetry}
                />
            ) : (
                <ToolTaskHistory
                    toolId={toolId}
                    minimalEmpty
                    onSelectTask={(historyTask) => {
                        setTask(historyTask);
                        setResultTab("result");
                    }}
                />
            )}

            {resultImage && (source?.dataUrl || source?.url) ? (
                <Section title="前后对比" hint="拖动滑块查看细节">
                    <CompareSlider
                        before={source.dataUrl ?? source.url ?? ""}
                        after={resultImage}
                        testIdPrefix="refine"
                        labels={{ before: "精修前", after: "精修后" }}
                    />
                </Section>
            ) : null}
                </div>
            </div>
        </div>
    );
}

export default ScaleUpWorkspace;
