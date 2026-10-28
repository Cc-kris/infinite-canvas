import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolResult } from "@/components/tools/tool-result";
import { loadToolAssetRecords, type ToolAssetConstraints, type ToolAssetRecord } from "@/services/api/tools/assets";
import { getToolGateway } from "@/services/api/tools/gateway";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";

import {
    ADJUSTMENT_CONTROLS,
    CHANGE_COLOR_REFERENCE_LIMITS,
    CHANGE_COLOR_SOURCE_LIMITS,
    COLOR_CURVES,
    DEFAULT_CHANGE_COLOR_VALUES,
    LIGHT_STRENGTH_LIMITS,
    BALANCE_LIMITS,
    MAX_PALETTE,
    REGION_CUSTOM_MAX_LENGTH,
    REGION_PRESETS,
    addSwatch,
    adjustmentSummary,
    clampToRange,
    colorParamsValue,
    createChangeColorSnapshot,
    hasBlockingIssue,
    imageFormatOf,
    isCurveId,
    isDefaultAdjustment,
    lightSummary,
    normalizeHex,
    readChangeColorValues,
    regionDescriptor,
    removeSwatch,
    snapshotFieldSummary,
    validateChangeColorState,
    validateChangeColorSource,
    type ChangeColorValues,
    type ColorAdjustment,
    type ColorLight,
    type ColorCurveId,
    type RegionPresetId,
} from "@/features/tools/registry/change-color";
import {
    ChangeColorAdapterError,
    changeColorResultFromTask,
    isChangeColorSourceUsable,
    retryChangeColor,
    runChangeColor,
    samplePaletteFromImage,
    type ChangeColorSourceAsset,
} from "@/features/tools/adapters/change-color";

/**
 * TASK-024：CHANGE_COLOR（一键换色）工作区。
 *
 * 页面规格见 docs/V1.0/plan_linkfox_navigation/page-specs/09-change-color.md：
 * 图片上传｜颜色/参考图｜去杂色｜颜色细调｜光影与边缘｜结果。
 * 主路径：上传 → 选区域与目标色 → 去杂色 → 细调颜色与光影边缘 → 生成 → 对比 → 保存。
 *
 * 真实边界：
 * - 区域是用户真的在图上涂抹出来的选区，导出为与原图同尺寸的 PNG 蒙版（未涂时=整图）；
 * - 颜色参考图的色卡来自真实像素采样，不是预设调色板；
 * - 结果只来自真实任务；参数改动后旧结果自报“来自旧版本”；
 * - 生成期间锁定全部配置，避免提交的与看到的不一致。
 */

const TOOL_ID = "CHANGE_COLOR";

const SOURCE_CONSTRAINTS: Partial<ToolAssetConstraints> = {
    mimeTypes: [...CHANGE_COLOR_SOURCE_LIMITS.mimeTypes],
    maxBytes: CHANGE_COLOR_SOURCE_LIMITS.maxBytes,
    maxWidth: CHANGE_COLOR_SOURCE_LIMITS.maxSide,
    maxHeight: CHANGE_COLOR_SOURCE_LIMITS.maxSide,
};

const REFERENCE_CONSTRAINTS: Partial<ToolAssetConstraints> = {
    mimeTypes: [...CHANGE_COLOR_REFERENCE_LIMITS.mimeTypes],
    maxBytes: CHANGE_COLOR_REFERENCE_LIMITS.maxBytes,
};

const inputClass =
    "rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

const primaryButton =
    "inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-50";

const ghostButton =
    "inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-xs text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50";

function Section({ title, hint, children, testId }: { title: string; hint?: string; children: React.ReactNode; testId?: string }) {
    return (
        <section className="rounded-lg border border-border bg-card p-3" data-testid={testId}>
            <header className="mb-2 flex items-baseline gap-2">
                <h3 className="text-sm font-medium text-foreground">{title}</h3>
                {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
            </header>
            {children}
        </section>
    );
}

function sourceFromRecord(record: ToolAssetRecord): ChangeColorSourceAsset {
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

/* ------------------------------------------------------------------ *
 * 区域：涂抹选区 → 真实 PNG 蒙版
 * ------------------------------------------------------------------ */

type Stroke = { points: { x: number; y: number }[]; radius: number };

const MASK_BRUSH = { min: 4, max: 120, step: 1 } as const;

/**
 * 在图上涂抹选区：点的坐标按 0..1 归一化，导出时再放大到原图真实像素，
 * 这样无论预览多大，蒙版始终与原图同尺寸（页面规格对 imageMaskUrl 的硬要求）。
 */
function MaskCanvas({
    src,
    strokes,
    brush,
    disabled,
    onChange,
}: {
    src: string;
    strokes: Stroke[];
    brush: number;
    disabled?: boolean;
    onChange: (next: Stroke[]) => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawingRef = useRef<Stroke | null>(null);
    const [painting, setPainting] = useState(false);

    const redraw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d");
        if (!context) return;
        const { width, height } = canvas;
        context.clearRect(0, 0, width, height);
        context.fillStyle = "rgba(37, 99, 235, 0.35)";
        const scale = Math.min(width, height);
        for (const stroke of strokes) {
            context.beginPath();
            for (const point of stroke.points) {
                context.moveTo(point.x * width + stroke.radius * scale, point.y * height);
                context.arc(point.x * width, point.y * height, stroke.radius * scale, 0, Math.PI * 2);
            }
            context.fill();
        }
    }, [strokes]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
        const width = Math.max(1, Math.round(rect.width * dpr));
        const height = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        redraw();
    }, [redraw, src]);

    const paint = useCallback(
        (event: React.PointerEvent<HTMLCanvasElement>, stroke: Stroke) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const x = (event.clientX - rect.left) / Math.max(1, rect.width);
            const y = (event.clientY - rect.top) / Math.max(1, rect.height);
            if (x < 0 || x > 1 || y < 0 || y > 1) return;
            stroke.points.push({ x, y });
            redraw();
            const context = canvas.getContext("2d");
            if (!context) return;
            context.fillStyle = "rgba(37, 99, 235, 0.35)";
            const scale = Math.min(canvas.width, canvas.height);
            context.beginPath();
            context.arc(x * canvas.width, y * canvas.height, stroke.radius * scale, 0, Math.PI * 2);
            context.fill();
        },
        [redraw],
    );

    return (
        <div className="relative overflow-hidden rounded-lg border border-border bg-muted" data-testid="change-color-mask-canvas">
            <img src={src} alt="待换色的原图" className="block h-auto w-full select-none" draggable={false} />
            <canvas
                ref={canvasRef}
                className={`absolute inset-0 h-full w-full touch-none ${disabled ? "cursor-not-allowed" : "cursor-crosshair"}`}
                onPointerDown={(event) => {
                    if (disabled) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const stroke: Stroke = { points: [], radius: brush / 200 };
                    drawingRef.current = stroke;
                    setPainting(true);
                    paint(event, stroke);
                }}
                onPointerMove={(event) => {
                    if (!drawingRef.current || disabled) return;
                    paint(event, drawingRef.current);
                }}
                onPointerUp={() => {
                    const stroke = drawingRef.current;
                    drawingRef.current = null;
                    setPainting(false);
                    if (!stroke || stroke.points.length === 0) return;
                    onChange([...strokes, stroke]);
                }}
                onPointerCancel={() => {
                    drawingRef.current = null;
                    setPainting(false);
                }}
            />
            {painting ? <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">涂抹中…</span> : null}
        </div>
    );
}

/** 导出与原图同尺寸的白色蒙版（未涂选区时=整图，语义明确写进提示词与 UI）。 */
function exportMaskPng(strokes: Stroke[], width: number, height: number): string | undefined {
    if (typeof document === "undefined") return undefined;
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.fillStyle = "#000000";
    context.fillRect(0, 0, w, h);
    context.fillStyle = "#FFFFFF";
    if (strokes.length === 0) {
        context.fillRect(0, 0, w, h);
    } else {
        const scale = Math.min(w, h);
        for (const stroke of strokes) {
            for (const point of stroke.points) {
                context.beginPath();
                context.arc(point.x * w, point.y * h, Math.max(1, stroke.radius * scale), 0, Math.PI * 2);
                context.fill();
            }
        }
    }
    try {
        return canvas.toDataURL("image/png");
    } catch {
        return undefined;
    }
}

/* ------------------------------------------------------------------ *
 * 颜色：收藏色卡 + 选择颜色 + 参考图提色
 * ------------------------------------------------------------------ */

function SwatchButton({
    hex,
    active,
    disabled,
    onPick,
    onRemove,
}: {
    hex: string;
    active: boolean;
    disabled?: boolean;
    onPick: () => void;
    onRemove?: () => void;
}) {
    return (
        <span className="group relative inline-flex">
            <button
                type="button"
                aria-label={`使用颜色 ${hex}`}
                aria-pressed={active}
                disabled={disabled}
                onClick={onPick}
                className={`h-9 w-9 rounded-md border-2 transition ${active ? "border-primary" : "border-border hover:border-foreground/40"} disabled:opacity-50`}
                style={{ backgroundColor: hex }}
                data-swatch={hex}
            />
            {onRemove ? (
                <button
                    type="button"
                    aria-label={`移除收藏色 ${hex}`}
                    disabled={disabled}
                    onClick={onRemove}
                    className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-foreground text-[10px] leading-none text-background group-hover:flex"
                >
                    ×
                </button>
            ) : null}
        </span>
    );
}

/* ------------------------------------------------------------------ *
 * 滑杆组
 * ------------------------------------------------------------------ */

function AdjustmentSliderGroup({
    adjustment,
    disabled,
    onChange,
    onReset,
}: {
    adjustment: ColorAdjustment;
    disabled?: boolean;
    onChange: (next: ColorAdjustment) => void;
    onReset: () => void;
}) {
    return (
        <div className="flex flex-col gap-2" data-testid="change-color-adjustment">
            {ADJUSTMENT_CONTROLS.map((control) => {
                const value = adjustment[control.key];
                return (
                    <label key={control.key} className="flex items-center gap-2 text-xs text-foreground">
                        <span className="w-12 shrink-0">{control.label}</span>
                        <input
                            type="range"
                            min={control.min}
                            max={control.max}
                            step={control.step}
                            value={value}
                            disabled={disabled}
                            aria-label={control.label}
                            data-adjust={control.key}
                            onChange={(event) => onChange({ ...adjustment, [control.key]: clampToRange(event.target.value, control, 0) })}
                            className="h-9 flex-1 accent-primary"
                        />
                        <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
                            {value > 0 ? `+${value}` : value}
                        </span>
                    </label>
                );
            })}
            <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground" data-testid="change-color-adjustment-summary">
                    {adjustmentSummary(adjustment)}
                </span>
                <button type="button" className={ghostButton} disabled={disabled} onClick={onReset} data-testid="change-color-reset-adjust">
                    重置
                </button>
            </div>
        </div>
    );
}

/** 前后对比：左边原图、右边换色结果，滑块裁切。 */
function CompareSlider({ before, after }: { before: string; after: string }) {
    const [position, setPosition] = useState(50);
    return (
        <div className="flex flex-col gap-2" data-testid="change-color-compare">
            <div className="relative overflow-hidden rounded-lg border border-border">
                <img src={after} alt="换色结果" className="block h-auto w-full" />
                <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
                    <img src={before} alt="原图" className="block h-full w-auto max-w-none" style={{ width: `${(100 / Math.max(position, 1)) * 100}%` }} />
                </div>
                <div className="pointer-events-none absolute inset-y-0 w-px bg-white/90 shadow" style={{ left: `${position}%` }} />
            </div>
            <input
                type="range"
                min={0}
                max={100}
                value={position}
                aria-label="前后对比"
                onChange={(event) => setPosition(Number(event.target.value))}
                className="w-full accent-primary"
                data-testid="change-color-compare-range"
            />
        </div>
    );
}

/* ------------------------------------------------------------------ *
 * 工作区
 * ------------------------------------------------------------------ */

export function ChangeColorWorkspace({ className }: { className?: string }) {
    const toolId = TOOL_ID;
    const hydrate = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const flushDraft = useToolDraftStore((state) => state.flush);
    const draft = useToolDraftStore((state) => state.drafts[toolId]);
    const imageModel = useConfigStore((state) => state.config.imageModel);

    const [values, setValues] = useState<ChangeColorValues>(() => ({ ...DEFAULT_CHANGE_COLOR_VALUES }));
    const [source, setSource] = useState<ChangeColorSourceAsset | undefined>();
    const [restoringSource, setRestoringSource] = useState(false);
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const [brush, setBrush] = useState(28);
    const [reference, setReference] = useState<ToolAssetRecord | undefined>();
    const [paletteNote, setPaletteNote] = useState<string | undefined>();
    const [task, setTask] = useState<ToolTask | undefined>();
    const [snapshot, setSnapshot] = useState<ReturnType<typeof createChangeColorSnapshot> | undefined>();
    const [running, setRunning] = useState(false);
    const [runError, setRunError] = useState<string | undefined>();
    const [showSnapshot, setShowSnapshot] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    const update = useCallback(
        (next: Partial<ChangeColorValues>) => {
            setValues((previous) => {
                const merged: ChangeColorValues = { ...previous, ...next };
                patchDraft(toolId, {
                    values: { changeColor: merged },
                    assetIds: [merged.sourceAssetId, merged.referenceAssetId].filter(Boolean) as string[],
                });
                return merged;
            });
        },
        [patchDraft, toolId],
    );

    /* 草稿恢复：值 + 上次原图；图丢了要求重选，蒙版要重画，都不假装已恢复 */
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const restored = await hydrate(toolId);
            if (cancelled) return;
            const parsed = readChangeColorValues(restored?.values?.changeColor as Record<string, unknown> | undefined);
            setValues(parsed);
            if (parsed.hasMask) setPaletteNote("上次的区域选区不会保存（蒙版是图片），请重新涂抹。");
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

    const maskReady = strokes.length > 0;
    const sourceReady = Boolean(source && isChangeColorSourceUsable(source));
    const modelReady = Boolean(imageModel?.trim());

    const issues = useMemo(
        () =>
            validateChangeColorState({
                values,
                sourceReady,
                imageModelReady: modelReady,
                maskReady,
            }),
        [values, sourceReady, modelReady, maskReady],
    );
    const blocked = running || hasBlockingIssue(issues);

    const currentSnapshot = useMemo(
        () =>
            source && sourceReady
                ? createChangeColorSnapshot(
                      values,
                      { source, maskUrl: maskReady ? "brush" : "", referenceUrl: reference?.url },
                      draft?.revision ?? null,
                  )
                : undefined,
        [values, source, sourceReady, maskReady, reference?.url, draft?.revision],
    );

    const result = changeColorResultFromTask(task, snapshot, currentSnapshot);
    const beforeImage = source?.dataUrl ?? source?.url;

    const onSourceChange = useCallback(
        (assetIds: string[], records: ToolAssetRecord[]) => {
            const record = records[0];
            if (!record) {
                setSource(undefined);
                setStrokes([]);
                update({ sourceAssetId: "", imageName: "" });
                return;
            }
            const next = sourceFromRecord(record);
            setSource(next);
            setStrokes([]);
            update({ sourceAssetId: next.assetId, imageName: next.name ?? "" });
            const check = validateChangeColorSource(next);
            setRunError(check.ok ? undefined : check.message);
        },
        [update],
    );

    const onReferenceChange = useCallback(
        (assetIds: string[], records: ToolAssetRecord[]) => {
            const record = records[0];
            if (!record) {
                setReference(undefined);
                update({ referenceAssetId: "", palette: [] });
                setPaletteNote(undefined);
                return;
            }
            setReference(record);
            update({ referenceAssetId: record.id });
            void samplePaletteFromImage(record.url).then((picked) => {
                if (picked.length === 0) {
                    setPaletteNote("参考图没取到颜色（图片可能无法在当前浏览器解码），请直接选色。");
                    return;
                }
                setPaletteNote(`已从参考图取到 ${picked.length} 个颜色，点色卡即可使用。`);
                setValues((previous) => {
                    const merged: ChangeColorValues = {
                        ...previous,
                        palette: picked.slice(0, MAX_PALETTE),
                        targetColor: picked[0],
                    };
                    patchDraft(toolId, {
                        values: { changeColor: merged },
                        assetIds: [merged.sourceAssetId, merged.referenceAssetId].filter(Boolean) as string[],
                    });
                    return merged;
                });
            });
        },
        [update, patchDraft, toolId],
    );

    const pickColor = useCallback(
        (hex: string) => {
            const normalized = normalizeHex(hex);
            if (!normalized) return;
            update({ targetColor: normalized });
        },
        [update],
    );

    /** 真实像素尺寸决定蒙版尺寸：优先源图元数据，其次图片自身尺寸。 */
    const maskSize = useCallback(() => {
        if (source?.width && source?.height) return { width: source.width, height: source.height };
        const image = typeof Image !== "undefined" ? new Image() : undefined;
        if (image && beforeImage) {
            image.src = beforeImage;
            if (image.naturalWidth > 0 && image.naturalHeight > 0) return { width: image.naturalWidth, height: image.naturalHeight };
        }
        return { width: 1024, height: 1024 };
    }, [source?.width, source?.height, beforeImage]);

    const onGenerate = useCallback(async () => {
        if (!source || blocked) return;
        setRunning(true);
        setRunError(undefined);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            await flushDraft(toolId);
            const size = maskSize();
            const maskUrl = exportMaskPng(strokes, size.width, size.height);
            const run = await runChangeColor({
                gateway: getToolGateway(),
                values,
                source,
                maskUrl,
                referenceUrl: reference?.url,
                model: imageModel,
                imageModelReady: modelReady,
                revision: draft?.revision ?? null,
                signal: controller.signal,
                onUpdate: setTask,
            });
            setTask(run.task);
            setSnapshot(run.snapshot);
            update({ hasMask: strokes.length > 0 });
        } catch (error) {
            const message = error instanceof ChangeColorAdapterError ? error.message : error instanceof Error ? error.message : "生成失败，请重试。";
            setRunError(message);
        } finally {
            abortRef.current = null;
            setRunning(false);
        }
    }, [source, blocked, flushDraft, toolId, maskSize, strokes, values, reference?.url, imageModel, modelReady, draft?.revision, update]);

    const onCancel = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        setRunning(false);
    }, []);

    const onRetry = useCallback(async () => {
        if (!task || !source) return;
        setRunning(true);
        setRunError(undefined);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const size = maskSize();
            const run = await retryChangeColor({
                gateway: getToolGateway(),
                taskId: task.id,
                values,
                source,
                maskUrl: exportMaskPng(strokes, size.width, size.height),
                referenceUrl: reference?.url,
                model: imageModel,
                imageModelReady: modelReady,
                revision: draft?.revision ?? null,
                signal: controller.signal,
                onUpdate: setTask,
            });
            setTask(run.task);
            setSnapshot(run.snapshot);
        } catch (error) {
            setRunError(error instanceof ChangeColorAdapterError ? error.message : error instanceof Error ? error.message : "重试失败。");
        } finally {
            abortRef.current = null;
            setRunning(false);
        }
    }, [task, source, maskSize, strokes, values, reference?.url, imageModel, modelReady, draft?.revision]);

    const disabled = running;

    return (
        <div className={className} data-testid="change-color-workspace">
            <div className="grid gap-3 lg:grid-cols-[minmax(320px,420px)_1fr]">
                {/* ---------------- 配置区 ---------------- */}
                <div className="flex flex-col gap-3">
                    <Section title="图片" hint="JPG / PNG / WEBP，≤10M" testId="change-color-source">
                        <ToolAssetInput
                            toolId={toolId}
                            constraints={SOURCE_CONSTRAINTS}
                            maxCount={1}
                            disabled={disabled}
                            onChange={onSourceChange}
                        />
                        {restoringSource ? <p className="mt-1 text-[11px] text-muted-foreground">正在恢复上次的图片…</p> : null}
                        {source ? (
                            <p className="mt-1 text-[11px] text-muted-foreground" data-testid="change-color-source-meta">
                                {source.name} · {source.width ?? "?"}×{source.height ?? "?"} · {imageFormatOf(source.mimeType, source.name).toUpperCase()}
                            </p>
                        ) : null}
                        <label className="mt-2 flex flex-col gap-1 text-[11px] text-muted-foreground">
                            任务名称
                            <input
                                className={inputClass}
                                value={values.taskName}
                                disabled={disabled}
                                placeholder={values.imageName || "一键换色任务"}
                                onChange={(event) => update({ taskName: event.target.value })}
                                data-testid="change-color-task-name"
                            />
                        </label>
                    </Section>

                    <Section title="颜色 / 参考图" hint="选择颜色后全图或选区按此色调改写" testId="change-color-color">
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                aria-label="选择颜色"
                                value={normalizeHex(values.targetColor)?.slice(0, 7) ?? "#000000"}
                                disabled={disabled}
                                onChange={(event) => pickColor(event.target.value)}
                                className="h-9 w-12 shrink-0 rounded-md border border-border bg-background"
                                data-testid="change-color-input"
                            />
                            <input
                                className={`${inputClass} w-24 shrink-0 font-mono uppercase`}
                                value={values.targetColor}
                                disabled={disabled}
                                placeholder="#B3261E"
                                onChange={(event) => update({ targetColor: event.target.value })}
                                data-testid="change-color-hex"
                            />
                            <button
                                type="button"
                                className={ghostButton}
                                disabled={disabled || !normalizeHex(values.targetColor)}
                                onClick={() => update({ swatches: addSwatch(values.swatches, values.targetColor) })}
                                data-testid="change-color-favorite"
                            >
                                收藏色卡
                            </button>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground" data-testid="change-color-target-label">
                            {values.targetColor ? `目标色 ${normalizeHex(values.targetColor) ?? values.targetColor}` : "尚未选择颜色"}
                        </p>

                        <p className="mt-3 text-[11px] text-muted-foreground">收藏色卡</p>
                        <div className="mt-1 flex flex-wrap gap-1.5" data-testid="change-color-swatches">
                            {values.swatches.map((hex) => (
                                <SwatchButton
                                    key={hex}
                                    hex={hex}
                                    active={normalizeHex(hex) === normalizeHex(values.targetColor)}
                                    disabled={disabled}
                                    onPick={() => pickColor(hex)}
                                    onRemove={() => update({ swatches: removeSwatch(values.swatches, hex) })}
                                />
                            ))}
                        </div>

                        {values.palette.length > 0 ? (
                            <>
                                <p className="mt-3 text-[11px] text-muted-foreground">参考图提色</p>
                                <div className="mt-1 flex flex-wrap gap-1.5" data-testid="change-color-palette">
                                    {values.palette.map((hex) => (
                                        <SwatchButton key={hex} hex={hex} active={normalizeHex(hex) === normalizeHex(values.targetColor)} disabled={disabled} onPick={() => pickColor(hex)} />
                                    ))}
                                </div>
                            </>
                        ) : null}

                        <div className="mt-3">
                            <p className="mb-1 text-[11px] text-muted-foreground">颜色参考图（可选）</p>
                            <ToolAssetInput toolId={toolId} constraints={REFERENCE_CONSTRAINTS} maxCount={1} disabled={disabled} onChange={onReferenceChange} />
                            {paletteNote ? (
                                <p className="mt-1 text-[11px] text-muted-foreground" data-testid="change-color-palette-note">
                                    {paletteNote}
                                </p>
                            ) : null}
                        </div>
                    </Section>

                    <Section title="区域" hint="涂选要换色的对象；不涂=整图" testId="change-color-region">
                        <div className="flex flex-wrap gap-1.5">
                            {REGION_PRESETS.map((preset) => (
                                <button
                                    key={preset.id}
                                    type="button"
                                    aria-pressed={values.region === preset.id}
                                    disabled={disabled}
                                    onClick={() => update({ region: preset.id })}
                                    className={`rounded-full border px-2.5 py-1 text-xs transition ${
                                        values.region === preset.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-accent"
                                    } disabled:opacity-50`}
                                    data-region={preset.id}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                        {values.region === "custom" ? (
                            <input
                                className={`${inputClass} mt-2 w-full`}
                                maxLength={REGION_CUSTOM_MAX_LENGTH}
                                value={values.customRegion}
                                disabled={disabled}
                                placeholder="描述要换色的对象，例如“外套的翻领”"
                                onChange={(event) => update({ customRegion: event.target.value })}
                                data-testid="change-color-region-custom"
                            />
                        ) : null}
                        <p className="mt-1 text-[11px] text-muted-foreground" data-testid="change-color-region-label">
                            当前区域：{regionDescriptor(values)}
                        </p>

                        {beforeImage ? (
                            <div className="mt-2 flex flex-col gap-2">
                                <MaskCanvas src={beforeImage} strokes={strokes} brush={brush} disabled={disabled} onChange={setStrokes} />
                                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                    笔刷
                                    <input
                                        type="range"
                                        min={MASK_BRUSH.min}
                                        max={MASK_BRUSH.max}
                                        step={MASK_BRUSH.step}
                                        value={brush}
                                        disabled={disabled}
                                        aria-label="笔刷大小"
                                        onChange={(event) => setBrush(Number(event.target.value))}
                                        className="flex-1 accent-primary"
                                    />
                                    <span className="w-8 text-right tabular-nums">{brush}</span>
                                </label>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] text-muted-foreground" data-testid="change-color-mask-state">
                                        {strokes.length > 0 ? `已涂 ${strokes.length} 笔选区` : "未涂选区：按整图换色"}
                                    </span>
                                    <div className="flex gap-2">
                                        <button type="button" className={ghostButton} disabled={disabled || strokes.length === 0} onClick={() => setStrokes((previous) => previous.slice(0, -1))} data-testid="change-color-mask-undo">
                                            撤销
                                        </button>
                                        <button type="button" className={ghostButton} disabled={disabled || strokes.length === 0} onClick={() => setStrokes([])} data-testid="change-color-mask-clear">
                                            清空选区
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p className="mt-2 text-[11px] text-muted-foreground">上传图片后可在此涂抹选区。</p>
                        )}
                    </Section>
                </div>

                {/* ---------------- 右侧：去杂色 / 细调 / 光影 / 生成 / 结果 ---------------- */}
                <div className="flex flex-col gap-3">
                    <Section title="去杂色" hint="去掉换色后残留的原色噪点" testId="change-color-noise">
                        <div className="flex items-center gap-3 text-xs text-foreground">
                            {[
                                { id: "on", label: "开启", value: true },
                                { id: "off", label: "关闭", value: false },
                            ].map((option) => (
                                <label key={option.id} className="flex items-center gap-1">
                                    <input
                                        type="radio"
                                        name="change-color-noise"
                                        checked={values.removeNoise === option.value}
                                        disabled={disabled}
                                        onChange={() => update({ removeNoise: option.value })}
                                        data-testid={`change-color-noise-${option.id}`}
                                    />
                                    {option.label}
                                </label>
                            ))}
                        </div>
                    </Section>

                    <Section title="颜色细调" hint="空值=不调整" testId="change-color-adjust">
                        <AdjustmentSliderGroup
                            adjustment={values.adjustment}
                            disabled={disabled}
                            onChange={(next) => update({ adjustment: next })}
                            onReset={() => update({ adjustment: { ...DEFAULT_CHANGE_COLOR_VALUES.adjustment } })}
                        />
                    </Section>

                    <Section title="光影与边缘" hint="光影 / 边缘 / 颜色边缘修复 / 色彩平衡 / 曲线" testId="change-color-light">
                        <div className="flex flex-col gap-2 text-xs text-foreground">
                            <div className="flex items-center justify-between gap-2">
                                <label className="flex items-center gap-1">
                                    <input
                                        type="checkbox"
                                        checked={values.light.enabled}
                                        disabled={disabled}
                                        onChange={(event) => update({ light: { ...values.light, enabled: event.target.checked } })}
                                        data-testid="change-color-light-enabled"
                                    />
                                    光影优化
                                </label>
                                <span className="text-[11px] text-muted-foreground">{values.light.enabled ? `强度 ${values.light.strength}` : "关闭"}</span>
                            </div>
                            <input
                                type="range"
                                min={LIGHT_STRENGTH_LIMITS.min}
                                max={LIGHT_STRENGTH_LIMITS.max}
                                step={LIGHT_STRENGTH_LIMITS.step}
                                value={values.light.strength}
                                disabled={disabled || !values.light.enabled}
                                aria-label="光影强度"
                                onChange={(event) => update({ light: { ...values.light, strength: clampToRange(event.target.value, LIGHT_STRENGTH_LIMITS, values.light.strength) } })}
                                className="h-9 accent-primary"
                                data-testid="change-color-light-strength"
                            />
                            <div className="mt-1 flex flex-col gap-2">
                                {[
                                    { key: "edge" as const, label: "边缘优化" },
                                    { key: "edgeRepair" as const, label: "颜色边缘修复" },
                                ].map((item) => (
                                    <label key={item.key} className="flex items-center justify-between gap-2">
                                        <span>{item.label}</span>
                                        <input
                                            type="checkbox"
                                            checked={values.light[item.key]}
                                            disabled={disabled}
                                            onChange={(event) => update({ light: { ...values.light, [item.key]: event.target.checked } })}
                                            data-testid={`change-color-${item.key}`}
                                        />
                                    </label>
                                ))}
                                <label className="flex items-center justify-between gap-2">
                                    <span>色彩平衡</span>
                                    <input
                                        type="range"
                                        min={BALANCE_LIMITS.min}
                                        max={BALANCE_LIMITS.max}
                                        step={BALANCE_LIMITS.step}
                                        value={values.light.balance}
                                        disabled={disabled}
                                        aria-label="色彩平衡"
                                        onChange={(event) => update({ light: { ...values.light, balance: clampToRange(event.target.value, BALANCE_LIMITS, values.light.balance) } })}
                                        className="w-40 accent-primary"
                                        data-testid="change-color-balance"
                                    />
                                </label>
                                <label className="flex items-center justify-between gap-2">
                                    <span>曲线</span>
                                    <select
                                        className={inputClass}
                                        value={values.light.curve}
                                        disabled={disabled}
                                        onChange={(event) => {
                                            const next = event.target.value;
                                            if (isCurveId(next)) update({ light: { ...values.light, curve: next as ColorCurveId } });
                                        }}
                                        data-testid="change-color-curve"
                                    >
                                        {COLOR_CURVES.map((curve) => (
                                            <option key={curve.id} value={curve.id}>
                                                {curve.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] text-muted-foreground" data-testid="change-color-light-summary">
                                        {lightSummary(values.light)}
                                    </span>
                                    <button
                                        type="button"
                                        className={ghostButton}
                                        disabled={disabled}
                                        onClick={() => update({ light: { ...DEFAULT_CHANGE_COLOR_VALUES.light } })}
                                        data-testid="change-color-reset-light"
                                    >
                                        重置
                                    </button>
                                </div>
                            </div>
                        </div>
                    </Section>

                    <Section title="生成" hint={`模型：${imageModel?.trim() || "未配置"} · 1 张`} testId="change-color-submit">
                        {issues.length > 0 ? (
                            <ul className="mb-2 list-disc pl-4 text-[11px] text-amber-600" data-testid="change-color-issues">
                                {issues.map((issue) => (
                                    <li key={`${issue.code}-${issue.field}`}>{issue.message}</li>
                                ))}
                            </ul>
                        ) : null}
                        <button type="button" disabled={blocked} onClick={() => void onGenerate()} className={`${primaryButton} w-full`} data-testid="change-color-generate">
                            {running ? "生成中…（10 算力）" : "立即生成（10 算力）"}
                        </button>
                        {runError ? (
                            <p className="mt-2 text-[11px] text-red-600" data-testid="change-color-run-error">
                                {runError}
                            </p>
                        ) : null}
                    </Section>

                    {result.stale ? (
                        <p className="rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" data-testid="change-color-stale">
                            原图或参数已变更，下面的结果来自上一版配置，请重新生成。
                        </p>
                    ) : null}

                    <ToolResult task={task} toolId={toolId} title="生成结果" onCancel={onCancel} onRetry={() => void onRetry()} />

                    {result.image && beforeImage ? (
                        <Section title="前后对比" hint="拖动滑块查看细节" testId="change-color-compare-section">
                            <CompareSlider before={beforeImage} after={result.image} />
                        </Section>
                    ) : null}

                    <Section title="本次提交" hint="上游 16 个字段的快照" testId="change-color-snapshot">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-muted-foreground">
                                {currentSnapshot ? snapshotFieldSummary(currentSnapshot.fields) : "上传图片后可查看"}
                            </span>
                            <button type="button" className={ghostButton} onClick={() => setShowSnapshot((previous) => !previous)} data-testid="change-color-snapshot-toggle">
                                {showSnapshot ? "收起参数" : "查看参数"}
                            </button>
                        </div>
                        {showSnapshot && currentSnapshot ? (
                            <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-2 text-[10px] leading-relaxed text-muted-foreground" data-testid="change-color-snapshot-body">
                                {JSON.stringify(currentSnapshot.fields, null, 2)}
                            </pre>
                        ) : null}
                    </Section>
                </div>
            </div>
        </div>
    );
}

export default ChangeColorWorkspace;
