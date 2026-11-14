import { ArrowRight, ChevronDown, ChevronUp, CircleQuestionMark, MousePointerClick, Pipette, RotateCcw, WandSparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Link } from "react-router-dom";

import { interactivePointSegmentMask, type SegmentationPoint } from "@/services/api/tools/segmentation";

import { Edit8CanvasToolbar, Edit8Config, Edit8Dropzone, Edit8Empty, Edit8ResultTabs, Edit8UploadCard, edit8GradientButtonClass, edit8OutlineButtonClass } from "@/components/tools/edit8-frame";
import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import { cn } from "@/lib/utils";
import { ToolCases, type ToolCase } from "@/components/tools/tool-cases";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { uploadCaseFiles } from "@/features/tools/case-apply";
import { COLOR_V2_CASES } from "@/features/tools/suite6-cases-data";
import { useRestoredTask } from "@/components/tools/use-restored-task";
import { loadToolAssetRecords, toolAssetLibraryItemsFromAssets, type ToolAssetConstraints, type ToolAssetRecord } from "@/services/api/tools/assets";
import { getPersistedToolGateway } from "@/stores/use-tool-task-store";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { CHANGE_COLOR_V2_ROUTE } from "@/features/tools/registry/change-color-v2";
import { useAssetStore, type ImageAsset, type VideoAsset } from "@/stores/use-asset-store";
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
    MAX_SWATCHES,
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
import { ChangeColorAdapterError, changeColorResultFromTask, isChangeColorSourceUsable, retryChangeColor, runChangeColor, samplePaletteFromImage, type ChangeColorSourceAsset } from "@/features/tools/adapters/change-color";

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

/** 原站输入框：面板底、圆角 4、1px 描边、12px 字（数值框 48×22，见 b9 real form.json）。 */
const fieldClass = "h-[26px] rounded-md border border-border bg-card px-2 text-[12px] leading-none text-foreground outline-none transition focus:border-primary disabled:opacity-60";

const numClass = "h-6 w-[50px] shrink-0 rounded-[4px] border border-border bg-card px-[7px] text-[14px] leading-none tabular-nums text-foreground outline-none transition focus:border-primary disabled:bg-foreground/[0.04] disabled:text-foreground/30";

const ghostButton = "inline-flex h-6 shrink-0 items-center justify-center rounded-md px-2 text-[12px] leading-none text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50";

/** 原站「选择颜色」一行 5 个预设色点（24px 色块 + 32px 白圈），见 linkfox 换色页 DOM。 */
const PRESET_DOTS = ["#EDB393", "#90CCAF", "#88ACEC", "#9285F4", "#EB88A0"] as const;

/** 原站分区重置：通栏 28 高胶囊按钮（圆角 32）。 */
const pillReset =
    "inline-flex h-7 w-full items-center justify-center gap-1 rounded-[32px] border border-border bg-card text-[12px] text-foreground! transition hover:bg-accent disabled:bg-foreground/[0.04] disabled:text-foreground/30!";

/** 配置列折叠分区：原站 antd Collapse（bg-muted 底、圆角 8、标题 12px 弱字、右侧 12px 箭头，收起 ∧ / 展开 ∨）。 */
function ConfigSection({ title, open, onToggle, aside, extra, testId, children }: { title: string; open: boolean; onToggle: () => void; aside?: React.ReactNode; extra?: React.ReactNode; testId?: string; children: React.ReactNode }) {
    return (
        <section className="rounded-[8px] bg-muted" data-testid={testId} data-open={open ? "true" : "false"}>
            <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
                <span className="flex items-center gap-1 text-[12px] leading-[19px] text-muted-foreground!">
                    {title}
                    {extra}
                </span>
                <span className="flex items-center gap-2">
                    {aside ? <span className="text-[11px] leading-5 text-muted-foreground">{aside}</span> : null}
                    {open ? <ChevronDown className="size-3 shrink-0 text-foreground/70" aria-hidden="true" /> : <ChevronUp className="size-3 shrink-0 text-foreground/70" aria-hidden="true" />}
                </span>
            </button>
            {/* 收起时仍保留 DOM（hidden），保证表单值/测试锚点不随折叠丢失。 */}
            <div className={cn("px-4 pb-4 pt-1", !open && "hidden")}>{children}</div>
        </section>
    );
}

/** 原站开关：32×18 圆角轨道，开启主色底（`去除杂色` 默认关闭，见 page-dom aria-checked=false）。 */
function Switch({ checked, disabled, onChange, label, testId, showText }: { checked: boolean; disabled?: boolean; onChange: (next: boolean) => void; label: string; testId?: string; showText?: boolean }) {
    if (showText) {
        /* 原站 ant-switch 轨道内直接写「开启/关闭」(57×22，inner 文字 10px) */
        return (
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                disabled={disabled}
                onClick={() => onChange(!checked)}
                className={cn("relative inline-flex h-[22px] w-[57px] shrink-0 items-center overflow-hidden rounded-full text-[12px] leading-none transition disabled:opacity-50", checked ? "bg-primary text-primary-foreground!" : "bg-foreground/25 text-background!")}
                data-testid={testId}
            >
                {/* 原站 ant-switch-inner：开启时文字在左、关闭时在右，滑块压在另一侧 */}
                <span className={cn("absolute inset-y-0 flex items-center", checked ? "left-[9px]" : "right-[9px]")}>{checked ? "开启" : "关闭"}</span>
                <span className={cn("absolute top-[2px] size-[18px] rounded-full bg-background shadow-sm transition-all", checked ? "right-[2px]" : "left-[2px]")} aria-hidden />
            </button>
        );
    }
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn("relative h-[18px] w-[32px] shrink-0 rounded-full transition disabled:opacity-50", checked ? "bg-primary" : "bg-border")}
            data-testid={testId}
        >
            <span className={cn("absolute top-[2px] size-[14px] rounded-full bg-card shadow-sm transition-all", checked ? "left-[16px]" : "left-[2px]")} />
        </button>
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
    mode = "brush",
    segPoints = [],
    pointMaskDataUrl,
    onChange,
    onPointClick,
}: {
    src: string;
    strokes: Stroke[];
    brush: number;
    disabled?: boolean;
    mode?: "brush" | "point";
    segPoints?: SegmentationPoint[];
    pointMaskDataUrl?: string;
    onChange: (next: Stroke[]) => void;
    onPointClick?: (pt: { x: number; y: number; button: number }) => void;
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
        for (const pt of segPoints) {
            context.beginPath();
            context.fillStyle = pt.mode === "keep" ? "#10b981" : "#ef4444";
            context.arc(pt.x * width, pt.y * height, 6, 0, Math.PI * 2);
            context.fill();
            context.strokeStyle = "#ffffff";
            context.lineWidth = 2;
            context.stroke();
        }
    }, [strokes, segPoints]);

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
            {pointMaskDataUrl ? (
                <img
                    src={pointMaskDataUrl}
                    alt=""
                    aria-hidden
                    className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-35 mix-blend-screen"
                />
            ) : null}
            <canvas
                ref={canvasRef}
                className={`absolute inset-0 h-full w-full touch-none ${disabled ? "cursor-not-allowed" : "cursor-crosshair"}`}
                onPointerDown={(event) => {
                    if (disabled) return;
                    if (mode === "point" && onPointClick) {
                        const rect = event.currentTarget.getBoundingClientRect();
                        const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
                        const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(1, rect.height)));
                        onPointClick({ x, y, button: event.button });
                        return;
                    }
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const stroke: Stroke = { points: [], radius: brush / 200 };
                    drawingRef.current = stroke;
                    setPainting(true);
                    paint(event, stroke);
                }}
                onPointerMove={(event) => {
                    if (!drawingRef.current || disabled || mode === "point") return;
                    paint(event, drawingRef.current);
                }}
                onPointerUp={() => {
                    if (mode === "point") return;
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

function SwatchButton({ hex, active, disabled, onPick, onRemove }: { hex: string; active: boolean; disabled?: boolean; onPick: () => void; onRemove?: () => void }) {
    return (
        <span className="group relative inline-flex">
            <button
                type="button"
                aria-label={`使用颜色 ${hex}`}
                aria-pressed={active}
                disabled={disabled}
                onClick={onPick}
                className={cn("size-6 rounded-md border transition", active ? "border-selected ring-2 ring-selected/30" : "border-border hover:border-selected", "disabled:opacity-50")}
                style={{ backgroundColor: hex }}
                data-swatch={hex}
            />
            {onRemove ? (
                <button
                    type="button"
                    aria-label={`移除收藏色 ${hex}`}
                    disabled={disabled}
                    onClick={onRemove}
                    className="absolute -right-1 -top-1 hidden size-4 items-center justify-center rounded-full bg-foreground text-[10px] leading-none text-primary-foreground group-hover:flex"
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

function AdjustmentSliderGroup({ adjustment, disabled, onChange, onReset }: { adjustment: ColorAdjustment; disabled?: boolean; onChange: (next: ColorAdjustment) => void; onReset: () => void }) {
    return (
        <div className="flex flex-col gap-[10px]" data-testid="change-color-adjustment">
            {ADJUSTMENT_CONTROLS.map((control) => {
                const value = adjustment[control.key];
                return (
                    <div key={control.key} className="flex flex-col gap-[10px]">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[14px] leading-[22px] text-foreground/60">{control.label}</span>
                            <input
                                type="number"
                                min={control.min}
                                max={control.max}
                                step={control.step}
                                value={value}
                                disabled={disabled}
                                aria-label={`${control.label}数值`}
                                data-adjust-value={control.key}
                                onChange={(event) => onChange({ ...adjustment, [control.key]: clampToRange(event.target.value, control, 0) })}
                                className={numClass}
                            />
                        </div>
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
                            className="mx-[5px] h-3 min-w-0 accent-primary"
                        />
                    </div>
                );
            })}
            <span className="sr-only" data-testid="change-color-adjustment-summary">
                {adjustmentSummary(adjustment)}
            </span>
            <button type="button" className={pillReset} disabled={disabled} onClick={onReset} data-testid="change-color-reset-adjust">
                <RotateCcw className="size-3" aria-hidden /> 重置
            </button>
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
                <div className="pointer-events-none absolute inset-y-0 w-px bg-card/90 shadow" style={{ left: `${position}%` }} />
            </div>
            <input type="range" min={0} max={100} value={position} aria-label="前后对比" onChange={(event) => setPosition(Number(event.target.value))} className="w-full accent-primary" data-testid="change-color-compare-range" />
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
    const assets = useAssetStore((state) => state.assets);
    const libraryItems = useMemo(() => assets.filter((asset): asset is ImageAsset | VideoAsset => asset.kind === "image" || asset.kind === "video"), [assets]);
    const library = useMemo(() => toolAssetLibraryItemsFromAssets(libraryItems), [libraryItems]);
    const [resultTab, setResultTab] = useState<"result" | "gallery" | "history">("result");
    /** 优秀案例「做同款」：正在套用的案例 id 与结果提示（套用失败也要能看见原因）。 */
    const [applyingCaseId, setApplyingCaseId] = useState<string | null>(null);
    const [caseNotice, setCaseNotice] = useState("");

    const [values, setValues] = useState<ChangeColorValues>(() => ({ ...DEFAULT_CHANGE_COLOR_VALUES }));
    const [source, setSource] = useState<ChangeColorSourceAsset | undefined>();
    const [restoringSource, setRestoringSource] = useState(false);
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const [maskMode, setMaskMode] = useState<"brush" | "point">("brush");
    const [pointKeepMode, setPointKeepMode] = useState<"keep" | "exclude">("keep");
    const [segPoints, setSegPoints] = useState<SegmentationPoint[]>([]);
    const [pointMaskDataUrl, setPointMaskDataUrl] = useState<string | undefined>();
    const [brush, setBrush] = useState(28);
    const [reference, setReference] = useState<ToolAssetRecord | undefined>();
    const [paletteNote, setPaletteNote] = useState<string | undefined>();
    const [task, setTask] = useState<ToolTask | undefined>();
    const [snapshot, setSnapshot] = useState<ReturnType<typeof createChangeColorSnapshot> | undefined>();
    const [running, setRunning] = useState(false);
    const [runError, setRunError] = useState<string | undefined>();
    const abortRef = useRef<AbortController | null>(null);

    /* valuesRef 保证事件处理器拿到最新值：patchDraft 不能放进 setValues 的更新函数里
       （更新函数可能被 React 在渲染期执行，从而在渲染另一个组件时更新 draft store，
       触发 "Cannot update a component while rendering a different component" 告警）。 */
    const valuesRef = useRef(values);
    valuesRef.current = values;
    const update = useCallback(
        (next: Partial<ChangeColorValues>) => {
            const merged: ChangeColorValues = { ...valuesRef.current, ...next };
            valuesRef.current = merged;
            setValues(merged);
            patchDraft(toolId, {
                values: { changeColor: merged },
                assetIds: [merged.sourceAssetId, merged.referenceAssetId].filter(Boolean) as string[],
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
            if (parsed.referenceAssetId) {
                const { records } = await loadToolAssetRecords([parsed.referenceAssetId]);
                if (!cancelled && records[0]) setReference(records[0]);
            }
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

    const maskReady = strokes.length > 0 || Boolean(pointMaskDataUrl);
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
        () => (source && sourceReady ? createChangeColorSnapshot(values, { source, maskUrl: maskReady ? "brush" : "", referenceUrl: reference?.url }, draft?.revision ?? null) : undefined),
        [values, source, sourceReady, maskReady, reference?.url, draft?.revision],
    );

    const activeTask = useRestoredTask(toolId, task);
    const result = changeColorResultFromTask(activeTask, snapshot, currentSnapshot);
    const beforeImage = source?.dataUrl ?? source?.url;

    const handlePointClick = useCallback(
        ({ x, y, button }: { x: number; y: number; button: number }) => {
            if (!beforeImage) return;
            const mode: "keep" | "exclude" = button === 2 ? "exclude" : pointKeepMode;
            const nextPoints: SegmentationPoint[] = [...segPoints, { x, y, mode }];
            setSegPoints(nextPoints);
            void interactivePointSegmentMask({
                sourceUrl: beforeImage,
                points: nextPoints,
            }).then((res) => {
                setPointMaskDataUrl(res.maskDataUrl);
            });
        },
        [beforeImage, pointKeepMode, segPoints],
    );

    const onSourceChange = useCallback(
        (assetIds: string[], records: ToolAssetRecord[]) => {
            const record = records[0];
            if (!record) {
                setSource(undefined);
                setStrokes([]);
                setSegPoints([]);
                setPointMaskDataUrl(undefined);
                update({ sourceAssetId: "", imageName: "" });
                return;
            }
            const next = sourceFromRecord(record);
            setSource(next);
            setStrokes([]);
            setSegPoints([]);
            setPointMaskDataUrl(undefined);
            update({ sourceAssetId: next.assetId, imageName: next.name ?? "" });
            const check = validateChangeColorSource(next);
            setRunError(check.ok ? undefined : check.message);
        },
        [update],
    );

    /** 「优秀案例」做同款：案例素材真实入库 + 回填源图/目标色，满足“入口必须真实可点”。 */
    const applyCase = useCallback(
        async (item: ToolCase) => {
            setApplyingCaseId(item.id);
            setCaseNotice("");
            try {
                const uploaded = await uploadCaseFiles(item);
                const record = uploaded.source as ToolAssetRecord | ToolAssetRecord[] | undefined;
                if (!record || Array.isArray(record)) throw new Error("该案例缺少可用的商品图");
                const next = sourceFromRecord(record);
                setSource(next);
                setStrokes([]);
                const apply = (item.apply ?? {}) as Record<string, unknown>;
                const colors = Array.isArray(apply.colors) ? (apply.colors as string[]) : [];
                const hex = colors[0];
                update({
                    sourceAssetId: next.assetId,
                    imageName: next.name ?? "",
                    ...(hex ? { targetColor: hex } : {}),
                });
                setRunError(undefined);
                setResultTab("result");
                setCaseNotice(hex ? `已套用案例商品图，目标色 ${hex} 已回填` : "已套用案例商品图");
            } catch (error) {
                setCaseNotice(error instanceof Error ? error.message : "案例套用失败");
            } finally {
                setApplyingCaseId(null);
            }
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
            const maskUrl = pointMaskDataUrl ?? exportMaskPng(strokes, size.width, size.height);
            const run = await runChangeColor({
                gateway: getPersistedToolGateway(),
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
            update({ hasMask: strokes.length > 0 || Boolean(pointMaskDataUrl) });
        } catch (error) {
            const message = error instanceof ChangeColorAdapterError ? error.message : error instanceof Error ? error.message : "生成失败，请重试。";
            setRunError(message);
        } finally {
            abortRef.current = null;
            setRunning(false);
        }
    }, [source, blocked, flushDraft, toolId, maskSize, pointMaskDataUrl, strokes, values, reference?.url, imageModel, modelReady, draft?.revision, update]);

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
                gateway: getPersistedToolGateway(),
                taskId: task.id,
                values,
                source,
                maskUrl: pointMaskDataUrl ?? exportMaskPng(strokes, size.width, size.height),
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
    }, [task, source, maskSize, pointMaskDataUrl, strokes, values, reference?.url, imageModel, modelReady, draft?.revision]);

    const disabled = running;

    // 原站默认：收藏色卡 / 光影优化 / 色彩平衡 / 曲线收起，选择颜色 / 细调颜色效果 / 边缘优化展开。
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        swatches: false,
        color: true,
        adjust: true,
        light: false,
        edge: true,
        balance: false,
        curve: false,
    });
    const toggleSection = useCallback((key: string) => {
        setOpenSections((previous) => ({ ...previous, [key]: !previous[key] }));
    }, []);

    return (
        <div data-testid="change-color-workspace" className={cn("flex h-full min-h-0 flex-col bg-canvas p-[10px]", className)}>
            {/* 原站一键换色（1600×1000）：左面板卡（画布 + 307 配置列）| 右 330 结果卡，间距 10。 */}
            <div data-testid="tool-workspace-columns" data-canvas="true" className="grid min-h-0 flex-1 grid-cols-1 gap-[10px] lg:grid-cols-[minmax(0,1fr)_330px]">
            <div className="flex min-h-0 min-w-0 overflow-hidden rounded-[8px] border border-border bg-card">
            <div data-testid="tool-config-column" className="order-2 flex min-h-0 w-[307px] shrink-0 flex-col">
            <Edit8Config
                className="w-full rounded-none! border-0!"
                data-testid="change-color-config"
                footer={
                    <div className="p-[10px]">
                        <button type="button" className={cn(edit8GradientButtonClass, "w-full gap-1")} disabled={blocked || !sourceReady} title={issues[0]?.message} onClick={() => void onGenerate()} data-testid="change-color-submit">
                            <WandSparkles className="size-3.5" aria-hidden />
                            <span>{running ? "生成中…" : "立即生成"}</span>
                        </button>
                        {running ? (
                            <button type="button" className={cn(ghostButton, "mt-1 w-full")} onClick={onCancel} data-testid="change-color-cancel">
                                取消
                            </button>
                        ) : null}
                        {runError ? (
                            <p className="m-0! mt-1! text-[11px] leading-4 text-destructive" role="alert" data-testid="change-color-run-error">
                                {runError}
                            </p>
                        ) : null}
                        {!runError && issues.length > 0 ? (
                            <ul className={cn("mt-1 flex flex-col gap-0.5", !sourceReady && "sr-only")} data-testid="change-color-issues">
                                {issues.map((issue) => (
                                    <li key={issue.code} className="text-[11px] leading-4 text-muted-foreground">
                                        {issue.message}
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                }
            >
                <div data-testid="change-color-config-grid">
                    <div className="flex flex-col gap-[10px] px-[10px] pt-[10px]">
                <ConfigSection title="收藏色卡" open={openSections.swatches} onToggle={() => toggleSection("swatches")} testId="change-color-swatches">
                    <div className="flex flex-wrap items-center gap-[6px]">
                        {values.swatches.map((hex) => (
                            <SwatchButton key={hex} hex={hex} active={normalizeHex(hex) === normalizeHex(values.targetColor)} disabled={disabled} onPick={() => pickColor(hex)} onRemove={() => update({ swatches: removeSwatch(values.swatches, hex) })} />
                        ))}
                    </div>
                </ConfigSection>

                <ConfigSection title="选择颜色" open={openSections.color} onToggle={() => toggleSection("color")} aside={normalizeHex(values.targetColor)?.slice(0, 7).toUpperCase()} testId="change-color-color">
                    <div className="flex flex-col gap-[10px]">
                        {/* 原站：一行 5 个预设色点 + 彩虹取色器 + 吸管（本地吸管未接入，如实禁用）。 */}
                        <div className="flex items-center gap-1">
                            {PRESET_DOTS.map((hex) => (
                                <button
                                    key={hex}
                                    type="button"
                                    aria-label={`使用颜色 ${hex}`}
                                    aria-pressed={normalizeHex(hex) === normalizeHex(values.targetColor)}
                                    disabled={disabled}
                                    onClick={() => pickColor(hex)}
                                    className={cn("flex size-8 items-center justify-center rounded-full border bg-card shadow-[0_0_1px_rgba(0,0,0,0.3)] transition disabled:opacity-50", normalizeHex(hex) === normalizeHex(values.targetColor) ? "border-selected" : "border-border hover:border-selected")}
                                    data-swatch={hex}
                                >
                                    <span className="size-6 rounded-full" style={{ backgroundColor: hex }} />
                                </button>
                            ))}
                            <label className="relative flex size-8 cursor-pointer items-center justify-center rounded-full border border-border bg-card shadow-[0_0_1px_rgba(0,0,0,0.3)]" title="自定义颜色">
                                <span className="size-6 rounded-full bg-[conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)]" />
                                <input
                                    type="color"
                                    aria-label="选择颜色"
                                    value={normalizeHex(values.targetColor)?.slice(0, 7) ?? "#000000"}
                                    disabled={disabled}
                                    onChange={(event) => pickColor(event.target.value)}
                                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                                    data-testid="change-color-picker"
                                />
                            </label>
                            <button type="button" disabled title="吸管取色：本地暂未接入" className="flex size-8 items-center justify-center rounded-full border border-border bg-foreground/[0.04] text-muted-foreground!">
                                <Pipette className="size-3.5" aria-hidden />
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="size-4 shrink-0 rounded-[4px] border border-border" style={{ backgroundColor: normalizeHex(values.targetColor)?.slice(0, 7) ?? "#000000" }} aria-hidden />
                            <input type="text" aria-label="颜色值" value={values.targetColor} disabled={disabled} onChange={(event) => pickColor(event.target.value)} className={cn(fieldClass, "h-6 min-w-0 flex-1 font-mono")} data-testid="change-color-hex" />
                        </div>
                        {values.palette.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-[6px]" data-testid="change-color-palette">
                                {values.palette.map((hex) => (
                                    <SwatchButton key={hex} hex={hex} active={normalizeHex(hex) === normalizeHex(values.targetColor)} disabled={disabled} onPick={() => pickColor(hex)} />
                                ))}
                            </div>
                        ) : null}

                        {reference ? (
                            <div className="flex items-center gap-2 rounded-[8px] border border-dashed border-border p-2" data-testid="change-color-reference">
                                <img src={reference.url} alt="颜色参考图" className="size-12 shrink-0 rounded-[4px] object-cover" />
                                <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/60">{reference.name}</span>
                                <button type="button" aria-label="移除颜色参考图" disabled={disabled} onClick={() => onReferenceChange([], [])} className="inline-flex size-6 items-center justify-center rounded text-muted-foreground! hover:bg-accent">
                                    <X className="size-3.5" aria-hidden />
                                </button>
                            </div>
                        ) : (
                            <Edit8Dropzone target="颜色参考图" hint="10M以内,jpg/jpeg/png/webp" constraints={REFERENCE_CONSTRAINTS} disabled={disabled} onPick={(record) => onReferenceChange([record.id], [record])} testId="change-color-reference-dropzone" />
                        )}
                        {paletteNote ? (
                            <p className="m-0! text-[11px] leading-4 text-muted-foreground" data-testid="change-color-reference-note">
                                {paletteNote}
                            </p>
                        ) : null}

                        <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1 text-[14px] leading-[22px] text-foreground/60">
                                去除杂色 <CircleQuestionMark className="size-3 text-muted-foreground" aria-label="开启后清除原色噪点" />
                            </span>
                            <Switch checked={values.removeNoise} disabled={disabled} onChange={(next) => update({ removeNoise: next })} label="去除杂色" testId="change-color-noise-switch" showText />
                        </div>
                        <button
                            type="button"
                            className={pillReset}
                            disabled={disabled}
                            onClick={() => {
                                update({ targetColor: DEFAULT_CHANGE_COLOR_VALUES.targetColor, palette: [], removeNoise: false, referenceAssetId: "" });
                                setReference(undefined);
                                setPaletteNote(undefined);
                            }}
                            data-testid="change-color-color-reset"
                        >
                            <RotateCcw className="size-3" aria-hidden /> 重置
                        </button>
                    </div>
                </ConfigSection>

                <ConfigSection title="细调颜色效果" open={openSections.adjust} onToggle={() => toggleSection("adjust")} testId="change-color-adjust">
                    <AdjustmentSliderGroup adjustment={values.adjustment} disabled={disabled} onChange={(next) => update({ adjustment: next })} onReset={() => update({ adjustment: { ...DEFAULT_CHANGE_COLOR_VALUES.adjustment } })} />
                </ConfigSection>

                <ConfigSection title="光影优化" open={openSections.light} onToggle={() => toggleSection("light")} testId="change-color-light">
                    <div className="flex flex-col gap-[10px]">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[14px] leading-[22px] text-foreground/60">根据原图优化光影</span>
                            <Switch checked={values.light.enabled} disabled={disabled} onChange={(next) => update({ light: { ...values.light, enabled: next } })} label="光影优化" testId="change-color-light-enabled" showText />
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
                            className="mx-[5px] h-3 accent-primary"
                            data-testid="change-color-light-strength"
                        />
                        <span className="sr-only" data-testid="change-color-light-summary">
                            {lightSummary(values.light)}
                        </span>
                        <button type="button" className={pillReset} disabled={disabled} onClick={() => update({ light: { ...DEFAULT_CHANGE_COLOR_VALUES.light } })} data-testid="change-color-light-reset">
                            <RotateCcw className="size-3" aria-hidden /> 重置
                        </button>
                    </div>
                </ConfigSection>

                <ConfigSection title="边缘优化" open={openSections.edge} onToggle={() => toggleSection("edge")} testId="change-color-edge-section">
                    <div className="flex flex-col gap-[10px]">
                        {[
                            { key: "edgeRepair" as const, label: "颜色边缘修复" },
                            { key: "edge" as const, label: "边缘优化" },
                        ].map((item) => (
                            <div key={item.key} className="flex items-center justify-between gap-2">
                                <span className="text-[14px] leading-[22px] text-foreground/60">{item.label}</span>
                                <Switch checked={values.light[item.key]} disabled={disabled} onChange={(next) => update({ light: { ...values.light, [item.key]: next } })} label={item.label} testId={`change-color-${item.key}`} showText />
                            </div>
                        ))}
                    </div>
                </ConfigSection>

                <ConfigSection title="色彩平衡" open={openSections.balance} onToggle={() => toggleSection("balance")} testId="change-color-balance-section">
                    <div className="flex flex-col gap-[10px]">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[14px] leading-[22px] text-foreground/60">色彩平衡</span>
                            <input
                                type="number"
                                min={BALANCE_LIMITS.min}
                                max={BALANCE_LIMITS.max}
                                step={BALANCE_LIMITS.step}
                                value={values.light.balance}
                                disabled={disabled}
                                aria-label="色彩平衡数值"
                                onChange={(event) => update({ light: { ...values.light, balance: clampToRange(event.target.value, BALANCE_LIMITS, values.light.balance) } })}
                                className={numClass}
                                data-testid="change-color-balance-value"
                            />
                        </div>
                        <input
                            type="range"
                            min={BALANCE_LIMITS.min}
                            max={BALANCE_LIMITS.max}
                            step={BALANCE_LIMITS.step}
                            value={values.light.balance}
                            disabled={disabled}
                            aria-label="色彩平衡"
                            onChange={(event) => update({ light: { ...values.light, balance: clampToRange(event.target.value, BALANCE_LIMITS, values.light.balance) } })}
                            className="mx-[5px] h-3 accent-primary"
                            data-testid="change-color-balance"
                        />
                    </div>
                </ConfigSection>

                <ConfigSection title="曲线" open={openSections.curve} onToggle={() => toggleSection("curve")} testId="change-color-curve-section">
                    <select
                        className={cn(fieldClass, "h-8 w-full")}
                        value={values.light.curve}
                        disabled={disabled}
                        aria-label="曲线"
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
                </ConfigSection>
                    </div>
                </div>
            </Edit8Config>
            </div>
            <section data-region="canvas" data-testid="tool-main-column" className="order-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-none!">
                {beforeImage ? (
                    <>
                        <Edit8CanvasToolbar>
                            <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
                                <button
                                    type="button"
                                    data-testid="change-color-mode-point"
                                    aria-pressed={maskMode === "point"}
                                    onClick={() => setMaskMode("point")}
                                    className={cn(
                                        "inline-flex h-6 items-center gap-1 rounded px-2 text-[12px]",
                                        maskMode === "point" ? "bg-selected-soft font-medium text-selected" : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    <MousePointerClick className="size-3.5" />
                                    点选区域
                                </button>
                                <button
                                    type="button"
                                    data-testid="change-color-mode-brush"
                                    aria-pressed={maskMode === "brush"}
                                    onClick={() => setMaskMode("brush")}
                                    className={cn(
                                        "inline-flex h-6 items-center gap-1 rounded px-2 text-[12px]",
                                        maskMode === "brush" ? "bg-selected-soft font-medium text-selected" : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    画笔涂抹
                                </button>
                            </div>
                            {maskMode === "point" ? (
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        data-testid="change-color-point-keep"
                                        onClick={() => setPointKeepMode("keep")}
                                        className={cn("h-6 rounded border px-2 text-[11px]", pointKeepMode === "keep" ? "border-selected bg-selected-soft text-selected" : "border-border text-muted-foreground")}
                                    >
                                        + 保留点
                                    </button>
                                    <button
                                        type="button"
                                        data-testid="change-color-point-exclude"
                                        onClick={() => setPointKeepMode("exclude")}
                                        className={cn("h-6 rounded border px-2 text-[11px]", pointKeepMode === "exclude" ? "border-selected bg-selected-soft text-selected" : "border-border text-muted-foreground")}
                                    >
                                        - 排除点
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <span className="text-[12px] text-muted-foreground">画笔</span>
                                    <input
                                        type="range"
                                        min={4}
                                        max={80}
                                        value={brush}
                                        disabled={disabled}
                                        aria-label="画笔大小"
                                        onChange={(event) => setBrush(Number(event.target.value))}
                                        className="h-[22px] w-[112px] accent-primary"
                                        data-testid="change-color-brush"
                                    />
                                    <span className="w-6 text-[12px] tabular-nums text-foreground">{brush}</span>
                                </>
                            )}
                            <span className="ml-2 text-[12px] text-muted-foreground" data-testid="change-color-mask-state">
                                {pointMaskDataUrl
                                    ? `已点选 ${segPoints.length} 个区域锚点`
                                    : strokes.length > 0
                                      ? `已涂 ${strokes.length} 笔选区`
                                      : "未选区域：按整图换色"}
                            </span>
                            <div className="ml-auto flex items-center gap-2">
                                <button type="button" className={ghostButton} disabled={disabled} onClick={() => onSourceChange([], [])} data-testid="change-color-reupload">
                                    重新上传
                                </button>
                                <button
                                    type="button"
                                    className={ghostButton}
                                    disabled={disabled || (strokes.length === 0 && segPoints.length === 0)}
                                    onClick={() => {
                                        if (maskMode === "point" && segPoints.length > 0) {
                                            const next = segPoints.slice(0, -1);
                                            setSegPoints(next);
                                            if (next.length === 0) setPointMaskDataUrl(undefined);
                                            else if (beforeImage) {
                                                void interactivePointSegmentMask({ sourceUrl: beforeImage, points: next }).then((res) => setPointMaskDataUrl(res.maskDataUrl));
                                            }
                                        } else {
                                            setStrokes((previous) => previous.slice(0, -1));
                                        }
                                    }}
                                    data-testid="change-color-mask-undo"
                                >
                                    撤销
                                </button>
                                <button
                                    type="button"
                                    className={ghostButton}
                                    disabled={disabled || (strokes.length === 0 && segPoints.length === 0)}
                                    onClick={() => {
                                        setStrokes([]);
                                        setSegPoints([]);
                                        setPointMaskDataUrl(undefined);
                                    }}
                                    data-testid="change-color-mask-clear"
                                >
                                    清空选区
                                </button>
                            </div>
                        </Edit8CanvasToolbar>
                        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-[10px]">
                            {result.image ? (
                                <div className="flex h-full w-full min-h-0 flex-col gap-2">
                                    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[8px] bg-card/60">
                                        <img src={result.image} alt="换色结果" className="max-h-full max-w-full object-contain" data-testid="change-color-result-image" />
                                    </div>
                                    <CompareSlider before={beforeImage} after={result.image} />
                                </div>
                            ) : (
                                <MaskCanvas
                                    src={beforeImage}
                                    strokes={strokes}
                                    brush={brush}
                                    disabled={disabled}
                                    mode={maskMode}
                                    segPoints={segPoints}
                                    pointMaskDataUrl={pointMaskDataUrl}
                                    onChange={setStrokes}
                                    onPointClick={handlePointClick}
                                />
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex h-full items-center justify-center py-[44px] pl-[49px] pr-20">
                        <div className="w-[660px] max-w-full rounded-[8px] bg-muted p-[10px]">
                            <Edit8UploadCard
                                testId="change-color-source"
                                className="p-5"
                                constraints={SOURCE_CONSTRAINTS}
                                library={library}
                                products
                                disabled={disabled || restoringSource}
                                onPick={(record) => onSourceChange([record.id], [record])}
                                media={<video src="/__cases/change-color/guide-changecolor.mp4" autoPlay muted loop playsInline className="mb-[10px] h-[330px] w-full object-cover" />}
                                heading={
                                    <>
                                        <h2 className="m-0! mb-[10px]! text-[20px] font-normal leading-[31px] text-foreground/85">一键快速上色</h2>
                                        <p className="m-0! mb-5! text-[16px] leading-[25px] text-muted-foreground">立即改变照片中任何物品的颜色，无论是衣服、商品、配饰还是假发！</p>
                                    </>
                                }
                                extraActions={
                                    <Link to={CHANGE_COLOR_V2_ROUTE} className={edit8OutlineButtonClass} data-testid="change-color-batch-entry">
                                        批量一键换色 <ArrowRight className="size-3.5" aria-hidden />
                                    </Link>
                                }
                            />
                        </div>
                    </div>
                )}
            </section>
            </div>
            <section data-region="results" data-testid="change-color-results" className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[8px] bg-canvas">
                <Edit8ResultTabs
                    tabs={[
                        { id: "result", label: "生成结果", testId: "change-color-tab-result" },
                        { id: "gallery", label: "优秀案例", testId: "change-color-tab-gallery" },
                    ]}
                    active={resultTab}
                    onTabChange={(id) => setResultTab(id as typeof resultTab)}
                    onHistory={() => setResultTab("history")}
                    historyActive={resultTab === "history"}
                    historyTestId="change-color-tab-history"
                />
                <div className="flex min-h-0 flex-1 flex-col gap-[10px] overflow-y-auto py-4 pl-4 pr-3">
                    {caseNotice ? (
                        <p className="m-0! rounded-md bg-foreground/[0.04] px-2 py-1 text-[11px] leading-4 text-foreground/70" data-testid="change-color-case-notice">{caseNotice}</p>
                    ) : null}
                    {resultTab === "result" ? (
                        activeTask ? (
                            <ToolResult task={activeTask} toolId={toolId} title="生成结果" sourceUrl={beforeImage} onCancel={onCancel} onRetry={() => void onRetry()} />
                        ) : (
                            <Edit8Empty className="flex-1" lines={["暂无生成结果图", "快在左侧操作物品换色吧~"]} />
                        )
                    ) : null}
                    {resultTab === "gallery" ? (
                        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="change-color-gallery">
                            <ToolCases cases={COLOR_V2_CASES} onApply={(item) => void applyCase(item)} applyingId={applyingCaseId ?? undefined} />
                        </div>
                    ) : null}
                    {resultTab === "history" ? (
                        <div className="min-h-0 flex-1 overflow-y-auto">
                            <ToolTaskHistory
                                toolId={toolId}
                                onSelectTask={(historyTask) => {
                                    setTask(historyTask);
                                    setResultTab("result");
                                }}
                            />
                        </div>
                    ) : null}
                </div>
            </section>
            </div>
        </div>
    );
}

export default ChangeColorWorkspace;
