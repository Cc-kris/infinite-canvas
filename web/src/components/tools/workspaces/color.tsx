import { ChevronDown, Palette } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Link } from "react-router-dom";

import { Edit8Canvas, Edit8CanvasToolbar, Edit8Config, Edit8Page, edit8PrimaryButtonClass } from "@/components/tools/edit8-frame";
import { cn } from "@/lib/utils";
import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
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
import { WatermarkGroupPanel } from "@/components/tools/watermark-group-panel";

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

/** 原站输入框：白底、圆角 4、1px #EDEDF0、12px 字（数值框 48×22，见 b9 real form.json）。 */
const fieldClass = "h-[26px] rounded-md border border-border bg-card px-2 text-[12px] leading-none text-foreground outline-none transition focus:border-primary disabled:opacity-60";

const numClass = "h-[22px] w-[48px] shrink-0 rounded-md border border-border bg-card px-1 text-center text-[12px] leading-none tabular-nums text-foreground outline-none transition focus:border-primary disabled:opacity-60";

const ghostButton = "inline-flex h-6 shrink-0 items-center justify-center rounded-md px-2 text-[12px] leading-none text-foreground transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50";

/** 原站「从本地上传 / 从作品库选择 / 从商品库选择」横向 32px 按钮行（122/116/116 宽）。 */
const canvasUploadRow =
    "w-auto shrink-0 [&_[data-testid=tool-asset-dropzone]]:min-h-0 [&_[data-testid=tool-asset-dropzone]]:w-auto [&_[data-testid=tool-asset-dropzone]]:flex-row [&_[data-testid=tool-asset-dropzone]]:items-center [&_[data-testid=tool-asset-dropzone]]:gap-3 [&_[data-testid=tool-asset-dropzone]]:rounded-none [&_[data-testid=tool-asset-dropzone]]:border-0 [&_[data-testid=tool-asset-dropzone]]:bg-transparent [&_[data-testid=tool-asset-dropzone]]:p-0 [&_[data-testid=tool-asset-dropzone]>span]:h-8 [&_[data-testid=tool-asset-dropzone]>span]:w-[122px] [&_[data-testid=tool-asset-dropzone]>span]:rounded-md [&_[data-testid=tool-asset-dropzone]>span]:text-[14px] [&_[data-testid=tool-asset-dropzone]>div]:w-auto [&_[data-testid=tool-asset-dropzone]>div]:gap-3 [&_[data-testid=tool-asset-dropzone]>div>button]:h-8 [&_[data-testid=tool-asset-dropzone]>div>button]:w-[116px] [&_[data-testid=tool-asset-dropzone]>div>button]:text-[14px]";

/** 配置列「颜色参考图」上传卡：原站 255×120 虚线框。 */
const referenceUploadCard =
    "[&_[data-testid=tool-asset-dropzone]]:min-h-[120px] [&_[data-testid=tool-asset-dropzone]]:gap-2 [&_[data-testid=tool-asset-dropzone]]:p-2 [&_[data-testid=tool-asset-dropzone]>span]:h-6 [&_[data-testid=tool-asset-dropzone]>span]:w-full [&_[data-testid=tool-asset-dropzone]>div>button]:w-[100px]";

/** 配置列折叠分区（原站 43px 标题行，展开后带内容）。 */
function ConfigSection({ title, open, onToggle, aside, testId, children }: { title: string; open: boolean; onToggle: () => void; aside?: React.ReactNode; testId?: string; children: React.ReactNode }) {
    return (
        <section className="border-b border-border last:border-b-0" data-testid={testId} data-open={open ? "true" : "false"}>
            <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between gap-2 px-[16px] py-[7px] text-left">
                <span className="text-[12px] font-medium leading-5 text-foreground">{title}</span>
                <span className="flex items-center gap-2">
                    {aside ? <span className="text-[11px] leading-5 text-muted-foreground">{aside}</span> : null}
                    <ChevronDown className={cn("size-[14px] shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
                </span>
            </button>
            {open ? <div className="px-[16px] pb-[8px]">{children}</div> : null}
        </section>
    );
}

/** 原站开关：32×18 圆角轨道，开启紫底（`去除杂色` 默认关闭，见 page-dom aria-checked=false）。 */
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
                className={cn("relative inline-flex h-[22px] w-[57px] shrink-0 items-center rounded-full text-[11px] leading-none text-primary-foreground transition disabled:opacity-50", checked ? "bg-primary" : "bg-border")}
                data-testid={testId}
            >
                {/* 原站 ant-switch-inner：轨道内同时存在「开启」「关闭」两词，滑块遮住其一 */}
                <span className="relative z-10 flex w-full items-center justify-between px-[8px]">
                    <span>开启</span>
                    <span>关闭</span>
                </span>
                <span className={cn("absolute top-[2px] z-20 size-[18px] rounded-full bg-card shadow-sm transition-all", checked ? "right-[2px]" : "left-[2px]")} aria-hidden />
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
function MaskCanvas({ src, strokes, brush, disabled, onChange }: { src: string; strokes: Stroke[]; brush: number; disabled?: boolean; onChange: (next: Stroke[]) => void }) {
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
            {painting ? <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-primary-foreground">涂抹中…</span> : null}
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
                className={cn("size-6 rounded-md border transition", active ? "border-primary ring-2 ring-primary/25" : "border-border hover:border-primary/60", "disabled:opacity-50")}
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
        <div className="flex flex-col gap-[6px]" data-testid="change-color-adjustment">
            {ADJUSTMENT_CONTROLS.map((control) => {
                const value = adjustment[control.key];
                return (
                    <div key={control.key} className="flex items-center gap-2">
                        <span className="w-[56px] shrink-0 text-[12px] leading-[22px] text-foreground">{control.label}</span>
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
                            className="h-[22px] min-w-0 flex-1 accent-primary"
                        />
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
                );
            })}
            <div className="flex items-center justify-between gap-2 pt-[2px]">
                <span className="text-[11px] leading-5 text-muted-foreground" data-testid="change-color-adjustment-summary">
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
                <div className="pointer-events-none absolute inset-y-0 w-px bg-card/90 shadow" style={{ left: `${position}%` }} />
            </div>
            <input type="range" min={0} max={100} value={position} aria-label="前后对比" onChange={(event) => setPosition(Number(event.target.value))} className="w-full accent-primary" data-testid="change-color-compare-range" />
        </div>
    );
}

/* ------------------------------------------------------------------ *
 * 工作区
 * ------------------------------------------------------------------ */

/** 智能修图家族导航：原站左栏工具树（图片编辑 / 局部重绘 / … / 下架）+ 算力 + 驱动状态。 */
const IMAGE_FAMILY_NAV = [
    "图片编辑",
    "局部重绘",
    "局部消除",
    "一键换色",
    "图片裁剪",
    "质量提升",
    "商品精修",
    "图像修复",
    "色差修复",
    "印花修复",
    "抠图工具",
    "精细抠图",
    "批量抠图",
    "企业功能",
    "即将下架",
    "手部修复",
    "下架",
];

export function ImageFamilyNav({ active }: { active: string }) {
    return (
        <nav className="flex flex-wrap items-center gap-1" aria-label="智能修图系列" data-testid="image-family-nav">
            {IMAGE_FAMILY_NAV.map((label) => (
                <span
                    key={label}
                    className={cn(
                        "rounded-md border px-1.5 py-[2px] text-[11px] leading-4",
                        label === active
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground",
                    )}
                >
                    {label}
                </span>
            ))}
            <span className="ml-auto flex items-center gap-2 text-[11px] leading-4 text-muted-foreground">
                <span className="rounded-md border border-border px-1.5 py-[2px]">250</span>
                <span>ljq_driver: 已连接</span>
            </span>
        </nav>
    );
}

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

    const [values, setValues] = useState<ChangeColorValues>(() => ({ ...DEFAULT_CHANGE_COLOR_VALUES }));
    const [source, setSource] = useState<ChangeColorSourceAsset | undefined>();
    const [restoringSource, setRestoringSource] = useState(false);
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const [brush, setBrush] = useState(28);
    const [reference, setReference] = useState<ToolAssetRecord | undefined>();
    const [paletteNote, setPaletteNote] = useState<string | undefined>();
    /** 原站结果列顶部的「上传颜色参考图」提示卡，点「知道了」后本次会话内不再出现。 */
    const [tipOpen, setTipOpen] = useState(true);
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
        () => (source && sourceReady ? createChangeColorSnapshot(values, { source, maskUrl: maskReady ? "brush" : "", referenceUrl: reference?.url }, draft?.revision ?? null) : undefined),
        [values, source, sourceReady, maskReady, reference?.url, draft?.revision],
    );

    const activeTask = useRestoredTask(toolId, task);
    const result = changeColorResultFromTask(activeTask, snapshot, currentSnapshot);
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
                gateway: getPersistedToolGateway(),
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

    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        swatches: true,
        color: true,
        adjust: true,
        light: true,
        edge: true,
    });
    const toggleSection = useCallback((key: string) => {
        setOpenSections((previous) => ({ ...previous, [key]: !previous[key] }));
    }, []);

    return (
        <Edit8Page toolId={toolId} className={className} data-testid="change-color-workspace">
            {/* ---------------- 画布列 ---------------- */}
            <Edit8Canvas>
                {beforeImage ? (
                    <>
                        <Edit8CanvasToolbar>
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
                            <span className="ml-2 text-[12px] text-muted-foreground" data-testid="change-color-mask-state">
                                {strokes.length > 0 ? `已涂 ${strokes.length} 笔选区` : "未涂选区：按整图换色"}
                            </span>
                            <div className="ml-auto flex items-center gap-2">
                                <button type="button" className={ghostButton} disabled={disabled || strokes.length === 0} onClick={() => setStrokes((previous) => previous.slice(0, -1))} data-testid="change-color-mask-undo">
                                    撤销
                                </button>
                                <button type="button" className={ghostButton} disabled={disabled || strokes.length === 0} onClick={() => setStrokes([])} data-testid="change-color-mask-clear">
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
                                <MaskCanvas src={beforeImage} strokes={strokes} brush={brush} disabled={disabled} onChange={setStrokes} />
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex h-full items-center justify-center p-[10px]">
                        <div className="flex w-[660px] max-w-full flex-col items-center rounded-[8px] bg-card px-[30px] py-[38px] text-center shadow-[0_2px_12px_rgba(31,31,44,0.06)]" data-testid="change-color-source">
                            <h2 className="text-[24px] font-semibold leading-[31px] text-foreground">一键快速上色</h2>
                            <p className="mt-[8px] max-w-[600px] text-[15px] leading-[25px] text-muted-foreground">立即改变照片中任何物品的颜色，无论是衣服、商品、配饰还是假发！</p>
                            <div className="mt-[22px] flex flex-wrap items-start justify-center gap-3">
                                <ToolAssetInput toolId={toolId} constraints={SOURCE_CONSTRAINTS} maxCount={1} disabled={disabled || restoringSource} library={library} onChange={onSourceChange} className={canvasUploadRow} variant="linkfox" title="" uploadLabel="从本地上传" />
                                <button
                                    type="button"
                                    disabled
                                    title="批量一键换色：本地暂未接入批量队列"
                                    className="h-8 w-[138px] shrink-0 rounded-md border border-border bg-card text-[14px] leading-none text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
                                    data-testid="change-color-batch-entry"
                                >
                                    批量一键换色
                                </button>
                            </div>
                            <p className="mt-[14px] text-[12px] leading-[17px] text-muted-foreground">10M以内,jpg/jpeg/png/webp</p>
                        </div>
                    </div>
                )}
            </Edit8Canvas>

            {/* ---------------- 配置列 ---------------- */}
            <Edit8Config
                className="w-[600px]"
                data-testid="change-color-config"
                footer={
                    <div className="border-t border-border p-[10px]">
                        <button type="button" className={edit8PrimaryButtonClass} disabled={blocked || !sourceReady} onClick={() => void onGenerate()} data-testid="change-color-submit">
                            <span>{running ? "生成中…" : "立即生成"}</span>
                            {!running ? <span className="ml-1 text-[11px] leading-none opacity-80">(10算力)</span> : null}
                        </button>
                        {running ? (
                            <button type="button" className={cn(ghostButton, "mt-1 w-full")} onClick={onCancel} data-testid="change-color-cancel">
                                取消
                            </button>
                        ) : null}
                        {runError ? (
                            <p className="mt-1 text-[11px] leading-4 text-destructive" role="alert" data-testid="change-color-run-error">
                                {runError}
                            </p>
                        ) : null}
                        {!runError && issues.length > 0 ? (
                            <ul className="mt-1 flex flex-col gap-0.5" data-testid="change-color-issues">
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
                    <div className="px-[12px]">
                        <ImageFamilyNav active="一键换色" />
                    </div>
                    <div className="columns-2 gap-x-[8px] px-[12px] [&>*]:mb-[6px] [&>*]:break-inside-avoid">
                <ConfigSection title="收藏色卡" open={openSections.swatches} onToggle={() => toggleSection("swatches")} testId="change-color-swatches">
                    <div className="flex flex-wrap items-center gap-[6px]">
                        {values.swatches.map((hex) => (
                            <SwatchButton key={hex} hex={hex} active={normalizeHex(hex) === normalizeHex(values.targetColor)} disabled={disabled} onPick={() => pickColor(hex)} onRemove={() => update({ swatches: removeSwatch(values.swatches, hex) })} />
                        ))}
                    </div>
                </ConfigSection>

                <ConfigSection title="选择颜色" open={openSections.color} onToggle={() => toggleSection("color")} aside={normalizeHex(values.targetColor)?.slice(0, 7).toUpperCase()} testId="change-color-color">
                    <div className="flex flex-col gap-[10px]">
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                aria-label="选择颜色"
                                value={normalizeHex(values.targetColor)?.slice(0, 7) ?? "#000000"}
                                disabled={disabled}
                                onChange={(event) => pickColor(event.target.value)}
                                className="h-[26px] w-[40px] shrink-0 rounded-md border border-border bg-card"
                                data-testid="change-color-picker"
                            />
                            <input type="text" aria-label="颜色值" value={values.targetColor} disabled={disabled} onChange={(event) => pickColor(event.target.value)} className={cn(fieldClass, "w-[104px] font-mono")} data-testid="change-color-hex" />
                            {values.palette.length > 0 ? (
                                <div className="flex flex-wrap items-center gap-[6px]" data-testid="change-color-palette">
                                    {values.palette.map((hex) => (
                                        <SwatchButton key={hex} hex={hex} active={normalizeHex(hex) === normalizeHex(values.targetColor)} disabled={disabled} onPick={() => pickColor(hex)} />
                                    ))}
                                </div>
                            ) : null}
                        </div>

                        <ToolAssetInput
                            toolId={`${toolId}-reference`}
                            constraints={REFERENCE_CONSTRAINTS}
                            maxCount={1}
                            disabled={disabled}
                            library={library}
                            onChange={onReferenceChange}
                            uploadLabel="拖拽 或 点击上传 颜色参考图"
                            variant="linkfox"
                            wide
                            className={referenceUploadCard}
                        />
                        {paletteNote ? (
                            <p className="text-[11px] leading-4 text-muted-foreground" data-testid="change-color-reference-note">
                                {paletteNote}
                            </p>
                        ) : null}

                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] leading-[22px] text-foreground">去除杂色</span>
                            <Switch checked={values.removeNoise} disabled={disabled} onChange={(next) => update({ removeNoise: next })} label="去除杂色" testId="change-color-noise-switch" showText />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] leading-[22px] text-muted-foreground" data-testid="change-color-color-summary">
                                {values.removeNoise ? "已开启：清除原色噪点" : "关闭：保留原色噪点"}
                            </span>
                            <button
                                type="button"
                                className={cn(ghostButton, "h-[28px] w-[88px] border border-border")}
                                disabled={disabled}
                                onClick={() => {
                                    update({ targetColor: DEFAULT_CHANGE_COLOR_VALUES.targetColor, palette: [], removeNoise: false, referenceAssetId: "" });
                                    setReference(undefined);
                                    setPaletteNote(undefined);
                                }}
                                data-testid="change-color-color-reset"
                            >
                                重置
                            </button>
                        </div>
                    </div>
                </ConfigSection>

                <ConfigSection title="细调颜色效果" open={openSections.adjust} onToggle={() => toggleSection("adjust")} testId="change-color-adjust">
                    <AdjustmentSliderGroup adjustment={values.adjustment} disabled={disabled} onChange={(next) => update({ adjustment: next })} onReset={() => update({ adjustment: { ...DEFAULT_CHANGE_COLOR_VALUES.adjustment } })} />
                </ConfigSection>

                <ConfigSection title="光影优化" open={openSections.light} onToggle={() => toggleSection("light")} testId="change-color-light">
                    <div className="flex flex-col gap-[8px]">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] leading-[22px] text-foreground">光影优化</span>
                            <Switch checked={values.light.enabled} disabled={disabled} onChange={(next) => update({ light: { ...values.light, enabled: next } })} label="光影优化" testId="change-color-light-enabled" />
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
                            className="h-[22px] w-full accent-primary"
                            data-testid="change-color-light-strength"
                        />
                        <div className="flex flex-col gap-[6px]">
                            {[
                                { key: "edge" as const, label: "边缘优化" },
                                { key: "edgeRepair" as const, label: "颜色边缘修复" },
                            ].map((item) => (
                                <div key={item.key} className="flex items-center justify-between gap-2">
                                    <span className="text-[12px] leading-[22px] text-foreground">{item.label}</span>
                                    <Switch checked={values.light[item.key]} disabled={disabled} onChange={(next) => update({ light: { ...values.light, [item.key]: next } })} label={item.label} testId={`change-color-${item.key}`} />
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-[2px]">
                            <span className="text-[11px] leading-5 text-muted-foreground" data-testid="change-color-light-summary">
                                {lightSummary(values.light)}
                            </span>
                            <button type="button" className={ghostButton} disabled={disabled} onClick={() => update({ light: { ...DEFAULT_CHANGE_COLOR_VALUES.light } })} data-testid="change-color-light-reset">
                                重置
                            </button>
                        </div>
                    </div>
                </ConfigSection>

                <ConfigSection title="边缘优化" open={openSections.edge} onToggle={() => toggleSection("edge")} testId="change-color-edge">
                    <div className="flex flex-col gap-[8px]">
                        <div className="flex items-center gap-2">
                            <span className="w-[56px] shrink-0 text-[12px] leading-[22px] text-foreground">色彩平衡</span>
                            <input
                                type="range"
                                min={BALANCE_LIMITS.min}
                                max={BALANCE_LIMITS.max}
                                step={BALANCE_LIMITS.step}
                                value={values.light.balance}
                                disabled={disabled}
                                aria-label="色彩平衡"
                                onChange={(event) => update({ light: { ...values.light, balance: clampToRange(event.target.value, BALANCE_LIMITS, values.light.balance) } })}
                                className="h-[22px] min-w-0 flex-1 accent-primary"
                                data-testid="change-color-balance"
                            />
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
                        <div className="flex items-center gap-2">
                            <span className="w-[56px] shrink-0 text-[12px] leading-[22px] text-foreground">曲线</span>
                            <select
                                className={cn(fieldClass, "min-w-0 flex-1")}
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
                        </div>
                    </div>
                </ConfigSection>
                    </div>
                </div>
            {/* 原站面板底部：管理水印分组（共 N/20 个 · 默认 · ＋ 新增水印分组） */}
            <WatermarkGroupPanel />
            </Edit8Config>

            {/* ---------------- 结果列 ---------------- */}
            <section data-region="results" data-testid="change-color-results" className="flex w-[332px] shrink-0 flex-col overflow-hidden rounded-[8px] bg-muted">
                <div role="tablist" className="flex h-[42px] shrink-0 items-center gap-5 px-[13px]">
                    {[
                        { id: "result", label: "生成结果" },
                        { id: "gallery", label: "优秀案例" },
                        { id: "history", label: "历史记录" },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={resultTab === tab.id}
                            onClick={() => setResultTab(tab.id as typeof resultTab)}
                            className={cn("relative h-[42px] text-[12px] leading-none transition", resultTab === tab.id ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}
                            data-testid={`change-color-tab-${tab.id}`}
                        >
                            {tab.label}
                            {resultTab === tab.id ? <span className="absolute bottom-[9px] left-1/2 h-[2px] w-[16px] -translate-x-1/2 rounded-full bg-primary" /> : null}
                        </button>
                    ))}
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-[10px] overflow-y-auto px-[10px] pb-[10px]">
                    {/* 原站结果列顶部提示卡：14px 文案 + 右下白底「知道了」(58×24)。原站 254×128，x1541/y271 */}
                    {tipOpen ? (
                        <div className="shrink-0 rounded-[8px] bg-card px-[12px] pb-[10px] pt-[12px]" data-testid="change-color-tip">
                            <p className="text-[14px] leading-[22px] text-foreground">支持上传颜色参考图，生成效果色差更小</p>
                            <div className="mt-3 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setTipOpen(false)}
                                    data-testid="change-color-tip-dismiss"
                                    className="flex h-6 items-center justify-center rounded-lg bg-card px-[8px] text-[14px] leading-none text-foreground transition hover:bg-muted"
                                >
                                    知道了
                                </button>
                            </div>
                        </div>
                    ) : null}
                    <div className="flex min-h-0 flex-1 flex-col rounded-[8px] bg-card">
                        {resultTab === "result" ? <ToolResult task={activeTask} toolId={toolId} title="生成结果" emptyTitle="暂无生成结果图" emptyHint="快在左侧操作物品换色吧~" onCancel={onCancel} onRetry={() => void onRetry()} /> : null}
                        {resultTab === "gallery" ? (
                            <div className="flex flex-1 items-center justify-center p-4 text-center" data-testid="change-color-gallery">
                                <p className="text-[12px] leading-5 text-muted-foreground">优秀案例来自社区灵感库，本地暂未接入社区数据。</p>
                            </div>
                        ) : null}
                        {resultTab === "history" ? (
                            <div className="min-h-0 flex-1 overflow-y-auto p-2">
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

                    <div className="rounded-[8px] bg-card p-[10px]">
                        <button type="button" className="flex w-full items-center justify-between gap-2 text-[12px] leading-5 text-foreground" onClick={() => setShowSnapshot((previous) => !previous)} data-testid="change-color-snapshot-toggle">
                            <span>本次提交</span>
                            <span className="text-[11px] text-muted-foreground">{showSnapshot ? "收起参数" : "查看参数"}</span>
                        </button>
                        <p className="mt-1 text-[11px] leading-4 text-muted-foreground" data-testid="change-color-snapshot">
                            {currentSnapshot ? snapshotFieldSummary(currentSnapshot.fields) : "上传图片后可查看"}
                        </p>
                        {showSnapshot && currentSnapshot ? (
                            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted/60 p-2 text-[10px] leading-relaxed text-muted-foreground" data-testid="change-color-snapshot-body">
                                {JSON.stringify(currentSnapshot.fields, null, 2)}
                            </pre>
                        ) : null}
                    </div>
                </div>
            </section>
        </Edit8Page>
    );
}

export default ChangeColorWorkspace;
