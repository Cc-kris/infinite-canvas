import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChevronDown, ChevronRight } from "lucide-react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolCases, type ToolCase } from "@/components/tools/tool-cases";
import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import { ToolResult } from "@/components/tools/tool-result";
import { useRestoredTask } from "@/components/tools/use-restored-task";
import { uploadCaseFiles } from "@/features/tools/case-apply";
import { AI_DRESSING_V2_CASES } from "@/features/tools/tool-cases-data";
import { describeToolExecution } from "@/services/api/tools/gateway";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { loadToolAssetRecords, toolAssetLibraryItemsFromAssets, type ToolAssetRecord } from "@/services/api/tools/assets";
import { useAssetStore, type ImageAsset, type VideoAsset } from "@/stores/use-asset-store";
import { cn } from "@/lib/utils";
import { resolveModelChannel, useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import {
    buildXsyInput,
    buildXsyUnit,
    createXsyRunPort,
    mapXsyTaskToOutcome,
    xsyDisplayImages,
    type XsyImage,
    type XsyOutcome,
    type XsyUnit,
} from "@/features/tools/adapters/ai-dressing-xsy";
import type { MaskStroke } from "@/features/tools/registry/area-repair";
import {
    AI_DRESSING_XSY_FIELD_KEYS,
    AI_DRESSING_XSY_TOOL_ID,
    XSY_DRAFT_SLOT,
    XSY_OUTPUT_OPTIONS,
    XSY_RULES,
    XSY_SLOTS,
    XSY_TABS,
    XSY_UPLOAD_LIMITS,
    applyXsyEdit,
    clearXsyMask,
    createXsyValues,
    fillXsyMask,
    normalizeXsyValues,
    resolveXsyCapability,
    serializeXsyValues,
    switchXsyTab,
    validateXsy,
    xsyErrors,
    xsyEstimate,
    xsyMaskCoverage,
    xsySlotActive,
    xsySlotMeta,
    xsySnapshotHash,
    XSY_STEP_LENGTH,
    xsyTabMeta,
    xsyTabSlots,
    type GarmentSlotKey,
    type XsyCapability,
    type XsyStepId,
    type XsyTab,
    type XsyValues,
} from "@/features/tools/registry/ai-dressing-xsy";

/**
 * AI试衣XSY 工作区（layout=dress）。页面规格：
 * docs/V1.0/plan_linkfox_navigation/page-specs/27-ai-dressing-xsy.md
 *
 * 区域顺序与页面一致：步骤状态 → 模特图/风格/姿势 → 分步服装上传（上下装/连体）→ 蒙版 → 生成 → 结果。
 * 每一次提交都是真实的：蒙版在同尺寸画布上涂抹 → 导出同尺寸 PNG → 合成 17 字段 → 网关提交 → 真实结果。
 * 没有模型、缺图、蒙版为空、张数越界都会拦住提交并给出字段级原因。
 */

/* -------------------------------- 基础块 -------------------------------- */

function XsySection({ title, hint, step, children, testId, current, onOpen }: { title: string; hint?: string; step?: XsyStepId; children: React.ReactNode; testId?: string; current?: XsyStepId; onOpen?: () => void }) {
    // 原站是单屏配置：步骤卡默认只展开当前步，其余折叠成一行标题，点击才展开，避免整页被 4 步撑高。
    const collapsible = Boolean(step && current !== undefined);
    const open = !collapsible || current === step;
    return (
        <section data-testid={testId} data-step={step} data-open={open} className="rounded-xl border border-border bg-card p-4">
            <div className={open ? "mb-3" : "flex items-center gap-2"}>
                <button
                    type="button"
                    disabled={!collapsible}
                    aria-expanded={open}
                    onClick={() => onOpen?.()}
                    className={cn("flex min-w-0 flex-1 items-center gap-1 text-left", collapsible && "cursor-pointer")}
                >
                    <h3 className="text-sm font-medium text-foreground">
                        {step ? <span className="mr-1 text-muted-foreground">{step}.</span> : null}
                        {title}
                    </h3>
                    {collapsible ? (
                        <ChevronRight aria-hidden className={cn("ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
                    ) : null}
                </button>
            </div>
            {open ? (
                <>
                    {hint ? <p className="mb-2 text-[11px] text-muted-foreground">{hint}</p> : null}
                    <div className="space-y-3">{children}</div>
                </>
            ) : null}
        </section>
    );
}

function XsySegmented<T extends string>({
    label,
    value,
    options,
    onChange,
    disabled,
    testId,
}: {
    label: string;
    value: T;
    options: readonly { id: T; label: string; hint?: string }[];
    onChange: (next: T) => void;
    disabled?: boolean;
    testId: string;
}) {
    return (
        <div data-testid={testId} role="radiogroup" aria-label={label}>
            <p className="mb-1 text-[11px] text-muted-foreground">{label}</p>
            <div className="flex flex-wrap gap-1">
                {options.map((option) => {
                    const active = option.id === value;
                    return (
                        <button
                            key={option.id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            data-option={option.id}
                            title={option.hint}
                            disabled={disabled}
                            onClick={() => onChange(option.id)}
                            className={cn(
                                "min-h-10 rounded-md border px-3 text-xs transition-colors disabled:opacity-40",
                                active ? "border-selected bg-selected-soft text-selected" : "border-border text-muted-foreground hover:text-foreground",
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

/* -------------------------------- 蒙版画布 -------------------------------- */

/** 读取图片真实尺寸（提交前校验与蒙版导出都依赖它，不猜默认值）。 */
function measureImage(url: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        if (typeof Image === "undefined") {
            reject(new Error("当前环境不支持读取图片尺寸"));
            return;
        }
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error("图片加载失败，无法读取尺寸"));
        image.src = url;
    });
}

const strokeWidthFor = (size: number, canvasWidth: number) => Math.max(1, (size / 1024) * canvasWidth);

/**
 * 真实涂抹蒙版：指针事件写入归一化笔画，画布按原图比例渲染。
 * 这里画出来的就是提交给 provider 的像素来源（同尺寸导出在 adapter 完成）。
 */
function XsyMaskCanvas({
    imageUrl,
    strokes,
    brushSize,
    tool,
    disabled,
    onStroke,
    testId,
}: {
    imageUrl: string;
    strokes: MaskStroke[];
    brushSize: number;
    tool: "brush" | "eraser";
    disabled: boolean;
    onStroke: (stroke: MaskStroke) => void;
    testId: string;
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const [drawing, setDrawing] = useState<{ points: { x: number; y: number }[] } | null>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const wrap = wrapRef.current;
        if (!wrap) return;
        const sync = () => setSize({ width: wrap.clientWidth, height: wrap.clientHeight });
        sync();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(sync);
        observer.observe(wrap);
        return () => observer.disconnect();
    }, [imageUrl]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const width = Math.max(1, Math.round(size.width));
        const height = Math.max(1, Math.round(size.height));
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, width, height);
        const paint = (points: { x: number; y: number }[], stroke: MaskStroke) => {
            if (points.length === 0) return;
            ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
            ctx.strokeStyle = "rgba(56,189,248,0.55)";
            ctx.fillStyle = "rgba(56,189,248,0.55)";
            ctx.lineWidth = strokeWidthFor(stroke.size, width);
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            points.forEach((point, index) => {
                const x = point.x * width;
                const y = point.y * height;
                if (index === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            if (points.length === 1) {
                const point = points[0]!;
                ctx.arc(point.x * width, point.y * height, ctx.lineWidth / 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.stroke();
            }
        };
        for (const stroke of strokes) paint(stroke.points, stroke);
        if (drawing) paint(drawing.points, { id: "preview", tool, size: brushSize, points: drawing.points });
        ctx.globalCompositeOperation = "source-over";
    }, [strokes, drawing, size, brushSize, tool]);

    const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return undefined;
        return {
            x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
            y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
        };
    };

    const commit = (points: { x: number; y: number }[]) => {
        if (points.length === 0) return;
        onStroke({ id: `stroke-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, tool, size: brushSize, points });
    };

    return (
        <div ref={wrapRef} data-testid={testId} data-strokes={strokes.length} className="relative aspect-[3/4] w-full overflow-hidden rounded-lg border border-border bg-muted">
            {imageUrl ? <img src={imageUrl} alt="服装原图" className="absolute inset-0 h-full w-full object-contain" /> : null}
            <canvas
                data-testid={`${testId}-canvas`}
                className={cn("absolute inset-0 h-full w-full touch-none", disabled ? "cursor-not-allowed" : tool === "eraser" ? "cursor-cell" : "cursor-crosshair")}
                onPointerDown={(event) => {
                    if (disabled) return;
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    const next = point(event);
                    if (next) setDrawing({ points: [next] });
                }}
                onPointerMove={(event) => {
                    if (disabled || !drawing) return;
                    const next = point(event);
                    if (!next) return;
                    setDrawing({ points: [...drawing.points, next] });
                }}
                onPointerUp={() => {
                    if (!drawing) return;
                    commit(drawing.points);
                    setDrawing(null);
                }}
                onPointerLeave={() => {
                    if (!drawing) return;
                    commit(drawing.points);
                    setDrawing(null);
                }}
            />
        </div>
    );
}

const fmtCoverage = (coverage: number) => `${(coverage * 100).toFixed(1)}%`;

/* -------------------------------- 图片规则浮层 -------------------------------- */

const XSY_RULES_TITLE = "请按规则上传多件服装图，以达到最佳效果";
const XSY_RULES_SPEC = "支持jpg、jpeg、png、webp，10M以内，图片边长范围：384 ~ 4096，最大宽高比5";
const XSY_RULES_WARN = "请勿上传以下错误图片，会极大影响生成效果";

/**
 * 「图片规则」按钮 + 规则浮层（与 image-rules-popover 同一套交互：点击弹出、点外/ESC 关闭）。
 * 正向示例卡的「试一试」会真实跳到示例对应的槽位/模式；错误示例提示禁止上传的类型。
 */
function XsyRulesPopover({
    disabled,
    onTrySample,
    testId = "xsy-rules",
}: {
    disabled?: boolean;
    onTrySample: (target: (typeof XSY_RULES.samples)[number]["target"]) => void;
    testId?: string;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLSpanElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    return (
        <span ref={rootRef} className="relative inline-flex">
            <button
                type="button"
                data-testid={`${testId}-trigger`}
                aria-expanded={open}
                disabled={disabled}
                onClick={() => setOpen((previous) => !previous)}
                className="text-[12px] leading-[18px] text-muted-foreground underline-offset-2 transition hover:text-foreground hover:underline disabled:opacity-40"
            >
                图片规则
            </button>
            {open ? (
                <div
                    role="dialog"
                    aria-label="图片规则"
                    data-state="open"
                    data-testid={`${testId}-popover`}
                    className="absolute left-0 top-[22px] z-50 w-[420px] rounded-lg border border-border bg-popover p-3 text-[12px] leading-[18px] text-popover-foreground shadow-lg"
                >
                    <p className="font-medium text-foreground">{XSY_RULES_TITLE}</p>
                    <p className="mt-1 text-muted-foreground">{XSY_RULES_SPEC}</p>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                        {XSY_RULES.samples.map((sample) => (
                            <div key={sample.id} className="flex flex-col items-center gap-1">
                                <div className="flex h-[58px] w-full items-center justify-center rounded-md border border-border bg-muted/40 px-1 text-center text-[10px] leading-[13px] text-muted-foreground">
                                    {sample.label}
                                </div>
                                <button
                                    type="button"
                                    data-testid={`${testId}-try-${sample.target}`}
                                    onClick={() => {
                                        onTrySample(sample.target);
                                        setOpen(false);
                                    }}
                                    className="rounded border border-border px-1 text-[10px] leading-[16px] text-muted-foreground transition hover:text-foreground"
                                >
                                    试一试
                                </button>
                            </div>
                        ))}
                    </div>
                    <p className="mt-3 font-medium text-foreground">{XSY_RULES_WARN}</p>
                    <div className="mt-1 grid grid-cols-3 gap-x-2 gap-y-1 text-[11px] leading-4 text-muted-foreground">
                        {XSY_RULES.errors.map((error) => (
                            <span key={error} data-testid={`${testId}-error`} className="rounded border border-dashed border-border px-1 py-[2px]">
                                {error}
                            </span>
                        ))}
                    </div>
                </div>
            ) : null}
        </span>
    );
}

/* -------------------------------- 工作区 -------------------------------- */

type MaskHistory = { past: MaskStroke[][]; future: MaskStroke[][] };

/** 原站上传约束（XSY_RULES_SPEC 同源）：走 ToolAssetInput constraints 真实校验，不只写文案。 */
const XSY_UPLOAD_CONSTRAINTS = {
    kind: "image" as const,
    mimeTypes: [...XSY_UPLOAD_LIMITS.mimeTypes],
    maxBytes: XSY_UPLOAD_LIMITS.maxBytes,
    minWidth: XSY_UPLOAD_LIMITS.minSide,
    minHeight: XSY_UPLOAD_LIMITS.minSide,
    maxWidth: XSY_UPLOAD_LIMITS.maxSide,
    maxHeight: XSY_UPLOAD_LIMITS.maxSide,
};

export function AiDressingXsyWorkspace({ className, toolId = AI_DRESSING_XSY_TOOL_ID }: { className?: string; toolId?: string }) {
    const hydrate = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const flushDraft = useToolDraftStore((state) => state.flush);
    const draft = useToolDraftStore((state) => state.drafts[toolId]);
    const config = useConfigStore((state) => state.config);
    const imageModel = useConfigStore((state) => state.config.imageModel);
    // 作品库（本地资产库）：上传卡上的「从作品库选择」从真实资产列表读取，不伪造商品库入口。
    const assets = useAssetStore((state) => state.assets);
    const library = useMemo(
        () => toolAssetLibraryItemsFromAssets(assets.filter((asset): asset is ImageAsset | VideoAsset => asset.kind === "image" || asset.kind === "video")),
        [assets],
    );

    const [values, setValues] = useState<XsyValues>(() => createXsyValues());
    const [histories, setHistories] = useState<Partial<Record<GarmentSlotKey, MaskHistory>>>({});
    const [restoring, setRestoring] = useState(false);
    const [lostAssets, setLostAssets] = useState<string[]>([]);
    const [task, setTask] = useState<ToolTask | undefined>();
    const [unit, setUnit] = useState<XsyUnit | undefined>();
    const [outcome, setOutcome] = useState<XsyOutcome | undefined>();
    const [submittedFingerprint, setSubmittedFingerprint] = useState<string>("");
    const [running, setRunning] = useState(false);
    const [runError, setRunError] = useState<string | undefined>();
    const [tourVisible, setTourVisible] = useState(true);
    const [applyingCaseId, setApplyingCaseId] = useState<string | null>(null);
    const [caseNotice, setCaseNotice] = useState<string | undefined>();
    const abortRef = useRef<AbortController | null>(null);

    /* OrigRail 内部用 react-router Link；SSR 单测无 Router 上下文，故挂载后再渲染（同 dressing.tsx） */
    const [railReady, setRailReady] = useState(false);
    useEffect(() => {
        setRailReady(true);
    }, []);

    /* 草稿恢复：值 + 图片资产；资产丢了明确提示，不假装已恢复。 */
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const restored = await hydrate(toolId);
            if (cancelled) return;
            const parsed = normalizeXsyValues(restored?.values?.[XSY_DRAFT_SLOT] as Record<string, unknown> | undefined);
            setValues(parsed);
            const ids = [parsed.model.assetId, ...XSY_SLOTS.map((slot) => parsed.garments[slot.id].assetId)].filter(Boolean);
            if (ids.length === 0) return;
            setRestoring(true);
            try {
                const { records, lostIds } = await loadToolAssetRecords(ids);
                if (cancelled) return;
                setLostAssets(lostIds);
                const byId = new Map(records.map((record) => [record.id, record]));
                setValues((previous) => {
                    const next: XsyValues = { ...previous, model: { ...previous.model }, garments: { ...previous.garments } };
                    const modelRecord = byId.get(previous.model.assetId);
                    if (modelRecord) {
                        next.model = { ...next.model, imageUrl: modelRecord.url ?? next.model.imageUrl, name: modelRecord.name, width: modelRecord.width ?? next.model.width, height: modelRecord.height ?? next.model.height };
                    }
                    for (const slot of XSY_SLOTS) {
                        const record = byId.get(previous.garments[slot.id].assetId);
                        if (!record) continue;
                        next.garments[slot.id] = {
                            ...next.garments[slot.id],
                            imageUrl: record.url ?? next.garments[slot.id].imageUrl,
                            name: record.name,
                            width: record.width ?? next.garments[slot.id].width,
                            height: record.height ?? next.garments[slot.id].height,
                        };
                    }
                    return next;
                });
            } finally {
                if (!cancelled) setRestoring(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [hydrate, toolId]);

    const descriptor = useMemo(() => {
        try {
            return describeToolExecution(AI_DRESSING_XSY_TOOL_ID);
        } catch {
            return undefined;
        }
    }, []);

    const effectiveModel = values.provider.trim() || (imageModel ?? "");
    const provider = useMemo(() => {
        if (!effectiveModel.trim()) return "";
        try {
            return resolveModelChannel(config, effectiveModel).apiFormat;
        } catch {
            return "";
        }
    }, [config, effectiveModel]);

    const capability = useMemo<XsyCapability>(
        () =>
            resolveXsyCapability({
                modelId: effectiveModel,
                provider,
                version: values.version,
                descriptor,
            }),
        [effectiveModel, provider, values.version, descriptor],
    );

    const issues = useMemo(() => validateXsy(values, capability), [values, capability]);
    const errors = useMemo(() => xsyErrors(issues), [issues]);
    const estimate = useMemo(() => xsyEstimate(values), [values]);
    const currentFingerprint = useMemo(() => JSON.stringify(serializeXsyValues(values)) + `|${provider}`, [values, provider]);
    const stale = Boolean(submittedFingerprint) && submittedFingerprint !== currentFingerprint;
    const blocked = running || errors.length > 0;

    const persist = useCallback(
        (next: XsyValues) => {
            patchDraft(toolId, {
                values: { [XSY_DRAFT_SLOT]: serializeXsyValues(next) },
                assetIds: [next.model.assetId, ...XSY_SLOTS.map((slot) => next.garments[slot.id].assetId)].filter(Boolean),
            });
        },
        [patchDraft, toolId],
    );

    /** 任何编辑都写草稿，并把下游步骤标为需重确认（联动基线）。 */
    const edit = useCallback(
        (patch: Partial<XsyValues>, changedStep: XsyStepId) => {
            setValues((previous) => {
                const next = applyXsyEdit(previous, patch, changedStep);
                persist(next);
                return next;
            });
        },
        [persist],
    );

    const setMask = useCallback(
        (slot: GarmentSlotKey, mutate: (garment: XsyValues["garments"][GarmentSlotKey]) => XsyValues["garments"][GarmentSlotKey]) => {
            setValues((previous) => {
                const garment = mutate(previous.garments[slot]);
                const next = applyXsyEdit(previous, { garments: { ...previous.garments, [slot]: garment } }, 3);
                persist(next);
                return next;
            });
        },
        [persist],
    );

    const commitStrokes = useCallback(
        (slot: GarmentSlotKey, strokes: MaskStroke[]) => {
            setHistories((previous) => {
                const history = previous[slot] ?? { past: [], future: [] };
                const current = values.garments[slot].mask.strokes;
                return { ...previous, [slot]: { past: [...history.past.slice(-19), current], future: [] } };
            });
            setMask(slot, (garment) => ({ ...garment, mask: { ...garment.mask, strokes } }));
        },
        [setMask, values.garments],
    );

    const undo = useCallback(
        (slot: GarmentSlotKey) => {
            const history = histories[slot];
            if (!history || history.past.length === 0) return;
            const previousStrokes = history.past[history.past.length - 1]!;
            const current = values.garments[slot].mask.strokes;
            setHistories((state) => ({
                ...state,
                [slot]: { past: history.past.slice(0, -1), future: [current, ...history.future].slice(0, 20) },
            }));
            setMask(slot, (garment) => ({ ...garment, mask: { ...garment.mask, strokes: previousStrokes } }));
        },
        [histories, setMask, values.garments],
    );

    const redo = useCallback(
        (slot: GarmentSlotKey) => {
            const history = histories[slot];
            if (!history || history.future.length === 0) return;
            const nextStrokes = history.future[0]!;
            const current = values.garments[slot].mask.strokes;
            setHistories((state) => ({
                ...state,
                [slot]: { past: [...history.past.slice(-19), current], future: history.future.slice(1) },
            }));
            setMask(slot, (garment) => ({ ...garment, mask: { ...garment.mask, strokes: nextStrokes } }));
        },
        [histories, setMask, values.garments],
    );

    const onModelChange = useCallback(
        (_assetIds: string[], records: ToolAssetRecord[]) => {
            const record = records[0];
            if (!record) {
                edit({ model: { assetId: "", name: "", imageUrl: "", width: 0, height: 0 } }, 1);
                return;
            }
            setTask(undefined);
            setOutcome(undefined);
            edit({ model: { assetId: record.id, name: record.name, imageUrl: record.url ?? "", width: record.width ?? 0, height: record.height ?? 0 } }, 1);
            if (!record.width || !record.height) {
                void measureImage(record.url ?? "")
                    .then((size) => edit({ model: { assetId: record.id, name: record.name, imageUrl: record.url ?? "", ...size } }, 1))
                    .catch(() => setRunError("模特图尺寸读取失败，请重新上传"));
            }
        },
        [edit],
    );

    const onGarmentChange = useCallback(
        (slot: GarmentSlotKey, records: ToolAssetRecord[]) => {
            const record = records[0];
            const meta = xsySlotMeta(slot);
            if (!record) {
                setMask(slot, (garment) => ({ ...garment, assetId: "", name: "", imageUrl: "", width: 0, height: 0, mask: { ...garment.mask, strokes: [] } }));
                return;
            }
            setTask(undefined);
            setOutcome(undefined);
            setHistories((state) => ({ ...state, [slot]: { past: [], future: [] } }));
            setMask(slot, (garment) => ({
                ...garment,
                assetId: record.id,
                name: record.name,
                imageUrl: record.url ?? "",
                width: record.width ?? 0,
                height: record.height ?? 0,
                mask: { ...garment.mask, strokes: [] },
            }));
            if (!record.width || !record.height) {
                void measureImage(record.url ?? "")
                    .then((size) => setMask(slot, (garment) => ({ ...garment, ...size })))
                    .catch(() => setRunError(`${meta.label}尺寸读取失败，请重新上传`));
            }
        },
        [setMask],
    );

    /**
     * 「或试试这些」做同款：案例素材（LinkFox 原站 AI穿衣案例的真实输入图）走
     * uploadCaseFiles 真实入库后回填本页槽位。槽位映射只用证据能确认的类别：
     * 连体/裙装/泳衣等 → suit（连体 Tab）；上装语义（含「抹胸-长裤」「短袖-长裤」
     * 这类组合，案例只有一张服装图时不猜造下装）→ upper 并保留上下装 Tab。
     * 回填后仍由用户点「生成」，不自动提交。
     */
    const applyCase = useCallback(
        async (item: ToolCase) => {
            setApplyingCaseId(item.id);
            setCaseNotice(undefined);
            setRunError(undefined);
            try {
                const assets = await uploadCaseFiles(item);
                const model = assets.model;
                const garment = assets.garment;
                if (!model || Array.isArray(model)) throw new Error("该案例缺少单张模特图，无法适配本页。");
                if (!garment || Array.isArray(garment)) throw new Error("该案例缺少单张服装图，无法适配本页。");
                const style = typeof item.apply?.modelStyle === "string" ? item.apply.modelStyle : "";
                const slot: GarmentSlotKey = /(?:连体|连衣裙|泳衣|吊带)/u.test(style) ? "suit" : "upper";
                const needTab: XsyTab = slot === "suit" ? "suit" : "upper-lower";
                // 先切 Tab 再回填：switchXsyTab 会清掉另一个 Tab 的槽位，顺序反了会丢刚回填的图。
                if (values.activeTab !== needTab) {
                    setValues((previous) => {
                        const next = switchXsyTab(previous, needTab);
                        persist(next);
                        return next;
                    });
                }
                onModelChange([model.id], [model]);
                onGarmentChange(slot, [garment]);
                setCaseNotice(`已应用案例素材（${style || item.id}），请确认蒙版与姿势后点「生成」`);
            } catch (error) {
                setRunError(error instanceof Error ? error.message : "做同款失败");
            } finally {
                setApplyingCaseId(null);
            }
        },
        [onGarmentChange, onModelChange, persist, values.activeTab],
    );

    /** 「试一试」：跳到示例对应的槽位所在 Tab（模特示例只滚动到模特区），真实落到本页控件。 */
    const trySample = useCallback(
        (target: (typeof XSY_RULES.samples)[number]["target"]) => {
            if (target === "model") {
                document.querySelector('[data-testid="xsy-step-model"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
            }
            const needTab: XsyTab = target === "suit" ? "suit" : "upper-lower";
            if (values.activeTab !== needTab) {
                setValues((previous) => {
                    const next = switchXsyTab(previous, needTab);
                    persist(next);
                    return next;
                });
            }
            // 切 Tab 后槽位要等下一帧渲染出来，直接 querySelector 可能扑空。
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    document.querySelector(`[data-testid="xsy-slot-${target}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                });
            });
        },
        [persist, values.activeTab],
    );

    /**
     * 真实提交：蒙版同尺寸导出 → 17 字段合成 → 网关执行。
     * 任何一步不成立都直接报错，绝不显示「生成成功」。
     */
    const submit = useCallback(async () => {
        if (running) return;
        setRunning(true);
        setRunError(undefined);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            await flushDraft(toolId);
            const builtUnit = await buildXsyUnit(values, { capability, provider });
            persist(values);
            const builtTask = await createXsyRunPort().run(buildXsyInput(builtUnit, { model: effectiveModel }), { signal: controller.signal });
            setUnit(builtUnit);
            setTask(builtTask);
            setSubmittedFingerprint(currentFingerprint);
            setOutcome(mapXsyTaskToOutcome(builtUnit, builtTask));
        } catch (error) {
            const message = error instanceof Error ? error.message : "生成失败";
            setRunError(message);
        } finally {
            setRunning(false);
            abortRef.current = null;
        }
    }, [running, flushDraft, toolId, values, capability, provider, effectiveModel, persist, currentFingerprint]);

    const cancel = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
    }, []);

    const activeSlots = xsyTabSlots(values.activeTab);
    /**
     * 刷新恢复：任务快照由 store 从 localStorage/IndexedDB 还原（storageKey → 新的对象 URL），
     * 但本工作区的 outcome 只活在内存里，所以结果区必须以恢复出来任务的为准，
     * 否则刷新后「历史里有结果、结果区却空且没有下载/存资产/发画布」。
     */
    const activeTask = useRestoredTask(toolId, task);
    const restoredImages = useMemo<XsyImage[]>(() => {
        const items = activeTask?.result?.items ?? [];
        return items
            .filter((item) => item.kind === "image" && (item.url || item.dataUrl))
            .map((item) => ({ url: item.url, dataUrl: item.dataUrl, mimeType: item.mimeType }));
    }, [activeTask]);
    const images = xsyDisplayImages(outcome?.images, restoredImages);
    const fieldsReady = unit ? Object.values(unit.fields).filter((value) => String(value ?? "").trim().length > 0).length : 0;

    return (
        <div data-testid="xsy-workspace" data-step={values.step} data-tab={values.activeTab} className={cn("flex flex-col gap-3", className)}>
            <ToolWorkspaceColumns
                className="min-h-0 flex-1"
                config={
                    <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                            <p data-testid="xsy-estimate" className="text-xs text-foreground">
                                {estimate.label}
                            </p>
                            <XsyRulesPopover disabled={running} onTrySample={trySample} />
                        </div>
                    </div>
                    <p data-testid="xsy-slogan" className="text-[11px] leading-4 text-muted-foreground">
                        无需约模特，上传服装正面图，一键生成衣服上身效果~
                    </p>
                    {tourVisible ? (
                        <div
                            data-testid="xsy-tour"
                            className="flex items-start justify-between gap-2 rounded-[6px] border border-dashed border-border px-2 py-1.5"
                        >
                            <span className="text-[11px] leading-4 text-muted-foreground">
                                第一步：选择示例图或上传平铺服装图片（支持仅上传上/下装图）
                            </span>
                            <button
                                type="button"
                                data-testid="xsy-tour-dismiss"
                                onClick={() => setTourVisible(false)}
                                className="shrink-0 text-[11px] leading-4 text-muted-foreground hover:text-foreground"
                            >
                                我是高手，不再提醒
                            </button>
                        </div>
                    ) : null}


            {lostAssets.length > 0 ? (
                <p data-testid="xsy-lost-assets" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
                    草稿里的 {lostAssets.length} 个素材已不在资产库（{lostAssets.join("、")}），请重新上传后再生成。
                </p>
            ) : null}

            {restoring ? <p className="text-[11px] text-muted-foreground">正在恢复草稿与素材…</p> : null}

            {errors.length > 0 ? (
                <ul data-testid="xsy-issues" className="space-y-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                    {errors.slice(0, 4).map((issue) => (
                        <li key={`${issue.code}-${issue.field}`} data-issue={issue.code}>
                            · {issue.message}
                        </li>
                    ))}
                </ul>
            ) : null}

            {/* 2. 分步服装上传 */}
            <div role="tablist" aria-label="服装模式" className="flex gap-1">
                {XSY_TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        data-tab={tab.id}
                        aria-selected={values.activeTab === tab.id}
                        disabled={running}
                        onClick={() =>
                            setValues((previous) => {
                                const nextValues = switchXsyTab(previous, tab.id as XsyTab);
                                persist(nextValues);
                                return nextValues;
                            })
                        }
                        className={cn(
                            "min-h-10 rounded-md border px-3 text-xs",
                            values.activeTab === tab.id ? "border-border bg-accent text-foreground" : "border-border text-muted-foreground",
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <XsySection title="上传服装" testId="xsy-step-garment">
                {activeSlots.map((slot) => {
                    const meta = xsySlotMeta(slot);
                    const garment = values.garments[slot];
                    return (
                        <div key={slot} data-testid={`xsy-slot-${slot}`} className="rounded-lg border border-border p-3">
                            <p className="text-xs font-medium text-foreground">{meta.label}</p>
                            <p className="mb-2 text-[11px] text-muted-foreground">{meta.uploadHint}</p>
                            <ToolAssetInput
                                toolId={toolId}
                                title={`选择${meta.label}图`}
                                maxCount={1}
                                disabled={running}
                                constraints={XSY_UPLOAD_CONSTRAINTS}
                                dropLabel={slot === "down" ? "拖拽/粘贴 或 上传下装正面图" : slot === "upper" ? "拖拽/粘贴 或 上传上装正面图" : undefined}
                                hint={XSY_UPLOAD_LIMITS.label}
                                library={library}
                                onChange={(_ids, records) => onGarmentChange(slot, records)}
                            />
                            {garment.imageUrl ? (
                                <p data-testid={`xsy-slot-${slot}-size`} className="mt-1 text-[11px] text-muted-foreground">
                                    尺寸 {garment.width || "?"}×{garment.height || "?"} · 蒙版覆盖 {fmtCoverage(xsyMaskCoverage(garment))}
                                </p>
                            ) : null}
                        </div>
                    );
                })}
            </XsySection>

            {/* 1. 模特图 + 类型/风格 */}
            <XsySection title="选择穿衣模特" hint="穿衣的部位与模特参考" testId="xsy-step-model">
                <p className="text-[11px] leading-4 text-muted-foreground">上传我的穿衣模特图</p>
                <ToolAssetInput
                    toolId={toolId}
                    title="选择模特图"
                    maxCount={1}
                    disabled={running}
                    constraints={XSY_UPLOAD_CONSTRAINTS}
                    hint={XSY_UPLOAD_LIMITS.label}
                    library={library}
                    onChange={onModelChange}
                />
                {values.model.imageUrl ? (
                    <div className="flex gap-2">
                        <img src={values.model.imageUrl} alt="模特图" className="h-28 w-20 rounded-md border border-border object-cover" />
                        <div className="text-[11px] text-muted-foreground">
                            <p data-testid="xsy-model-size">
                                尺寸 {values.model.width || "?"}×{values.model.height || "?"}
                            </p>
                            <p>{values.model.name || "未命名素材"}</p>
                        </div>
                    </div>
                ) : null}
            </XsySection>

            {/* 3. 蒙版 + 姿势 */}
            <XsySection title="编辑穿衣区域" hint="涂出该件服装在模特图上的区域；白=替换，黑=保持原样" testId="xsy-step-mask">
                <p className="text-[11px] leading-4 text-muted-foreground" data-testid="xsy-part-reference">
                    穿衣的部位与模特参考
                </p>
                {values.model.imageUrl ? (
                    <div className="flex items-center gap-2">
                        <img src={values.model.imageUrl} alt="模特参考" className="h-16 w-12 rounded-md border border-border object-cover" />
                        <p className="text-[11px] leading-4 text-muted-foreground">以第 1 步的模特图为准，蒙版区域会被替换为上传服装</p>
                    </div>
                ) : null}
                {activeSlots.map((slot) => {
                    const meta = xsySlotMeta(slot);
                    const garment = values.garments[slot];
                    const history = histories[slot];
                    return (
                        <div key={slot} data-testid={`xsy-mask-${slot}`} className="rounded-lg border border-border p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <div>
                                    <p className="text-xs font-medium text-foreground">{meta.label}蒙版</p>
                                    <p className="text-[11px] text-muted-foreground">
                                        覆盖 {fmtCoverage(xsyMaskCoverage(garment))} · {garment.mask.strokes.length} 笔
                                    </p>
                                </div>
                                <div className="flex gap-1">
                                    <button type="button" data-testid={`xsy-mask-${slot}-undo`} disabled={running || !history || history.past.length === 0} onClick={() => undo(slot)} className="min-h-10 min-w-10 rounded-md border border-border text-xs disabled:opacity-40">
                                        撤销
                                    </button>
                                    <button type="button" data-testid={`xsy-mask-${slot}-redo`} disabled={running || !history || history.future.length === 0} onClick={() => redo(slot)} className="min-h-10 min-w-10 rounded-md border border-border text-xs disabled:opacity-40">
                                        重做
                                    </button>
                                </div>
                            </div>
                            <XsyMaskCanvas
                                testId={`xsy-mask-${slot}-canvas-wrap`}
                                imageUrl={garment.imageUrl}
                                strokes={garment.mask.strokes}
                                brushSize={garment.mask.brushSize}
                                tool={garment.mask.tool}
                                disabled={running || !garment.imageUrl}
                                onStroke={(stroke) => commitStrokes(slot, [...garment.mask.strokes, stroke])}
                            />
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <XsySegmented
                                    label="画笔/橡皮"
                                    value={garment.mask.tool}
                                    options={[
                                        { id: "brush" as const, label: "涂抹" },
                                        { id: "eraser" as const, label: "橡皮" },
                                    ]}
                                    onChange={(tool) => setMask(slot, (current) => ({ ...current, mask: { ...current.mask, tool } }))}
                                    disabled={running}
                                    testId={`xsy-mask-${slot}-tool`}
                                />
                                <button type="button" data-testid={`xsy-mask-${slot}-fill`} disabled={running || !garment.imageUrl} onClick={() => commitStrokes(slot, fillXsyMask(garment, `fill-${Date.now()}`).mask.strokes)} className="min-h-10 rounded-md border border-border px-3 text-xs disabled:opacity-40">
                                    整件
                                </button>
                                <button type="button" data-testid={`xsy-mask-${slot}-clear`} disabled={running || garment.mask.strokes.length === 0} onClick={() => commitStrokes(slot, clearXsyMask(garment).mask.strokes)} className="min-h-10 rounded-md border border-border px-3 text-xs disabled:opacity-40">
                                    清空
                                </button>
                            </div>
                            <label className="mt-2 block text-[11px] text-muted-foreground">
                                笔刷粗细 {garment.mask.brushSize}px
                                <input
                                    type="range"
                                    min={4}
                                    max={240}
                                    step={2}
                                    value={garment.mask.brushSize}
                                    disabled={running}
                                    data-testid={`xsy-mask-${slot}-brush`}
                                    onChange={(event) => setMask(slot, (current) => ({ ...current, mask: { ...current.mask, brushSize: Number(event.target.value) } }))}
                                    className="mt-1 h-9 w-full"
                                />
                            </label>
                        </div>
                    );
                })}
            </XsySection>

            {/* 4. 生成 */}
            <XsySection title="步长" testId="xsy-step-generate">
                <div data-testid="xsy-step-length">
                    <input
                        type="range"
                        aria-label="步长"
                        min={XSY_STEP_LENGTH.min}
                        max={XSY_STEP_LENGTH.max}
                        value={values.stepLength}
                        disabled={running}
                        onChange={(event) => edit({ stepLength: Number(event.target.value) }, 4)}
                        className="w-full accent-[var(--selected)]"
                    />
                    <div className="relative h-4 text-[12px]">
                        {XSY_STEP_LENGTH.marks.map((mark) => (
                            <span
                                key={mark}
                                className={cn("absolute -translate-x-1/2", values.stepLength === mark ? "text-foreground" : "text-muted-foreground")}
                                style={{ left: `${((mark - XSY_STEP_LENGTH.min) / (XSY_STEP_LENGTH.max - XSY_STEP_LENGTH.min)) * 100}%` }}
                            >
                                {mark}
                            </span>
                        ))}
                    </div>
                </div>
                <XsySegmented
                    label="生成张数"
                    value={String(values.outputNum)}
                    options={XSY_OUTPUT_OPTIONS.map((count) => ({ id: String(count), label: `${count} 张` }))}
                    onChange={(next) => edit({ outputNum: Number(next) }, 4)}
                    disabled={running}
                    testId="xsy-output"
                />
            </XsySection>

                    {/* 原站：生成按钮常驻配置列底部，不随步骤折叠隐藏 */}
                    <div data-testid="xsy-submit-bar" className="sticky bottom-0 z-10 mt-auto border-t border-border bg-card/95 pb-1 pt-2 backdrop-blur">
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                data-testid="xsy-submit"
                                disabled={blocked}
                                onClick={() => void submit()}
                                className="min-h-10 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground disabled:opacity-40"
                            >
                                {running ? "正在生成…" : "立即生成"}
                            </button>
                            {running ? (
                                <button type="button" data-testid="xsy-cancel" onClick={cancel} className="min-h-10 rounded-md border border-border px-3 text-xs">
                                    取消
                                </button>
                            ) : null}
                            <span data-testid="xsy-gate" className="text-[11px] text-muted-foreground">
                                {blocked ? `提交被拦下：${errors[0]?.message ?? capability.blockedReason ?? "配置不完整"}` : "自检通过，可提交"}
                            </span>
                        </div>
                        {runError ? <p data-testid="xsy-run-error" role="alert" className="mt-1 text-[11px] text-destructive">{runError}</p> : null}
                    </div>

                    </>
                }
            >
                <section className="flex min-w-0 flex-col gap-3" aria-label="结果区">
            {/* 结果 */}
            <XsySection title="试穿结果" testId="xsy-results">
                {outcome?.status === "failed" && outcome.error ? (
                    <p data-testid="xsy-outcome-error" role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
                        生成失败（{outcome.error.code}）：{outcome.error.message}
                        {outcome.error.retryable ? "，可直接重试" : "，请先调整配置"}
                    </p>
                ) : null}
                {images.length > 0 ? (
                    <div data-testid="xsy-result-grid" className="grid grid-cols-2 gap-2">
                        {images.map((image, index) => {
                            const src = image.url ?? image.dataUrl ?? "";
                            return (
                                <figure key={`${image.url ?? index}`} className="rounded-lg border border-border bg-background p-2">
                                    <img src={src} alt={`试穿结果 ${index + 1}`} className="aspect-[3/4] w-full rounded-md object-contain" />
                                    <figcaption className="mt-1 text-[10px] text-muted-foreground">
                                        第 {index + 1} 张 · {xsyTabMeta(values.activeTab).label}
                                    </figcaption>
                                </figure>
                            );
                        })}
                    </div>
                ) : (
                    <p data-testid="xsy-result-empty" className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[11px] text-muted-foreground">
                        {running ? "正在生成，结果会出现在这里…" : "暂无生成结果图"}
                    </p>
                )}

                {caseNotice ? (
                    <p data-testid="xsy-case-notice" className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                        {caseNotice}
                    </p>
                ) : null}

                {/* 或试试这些：LinkFox 原站 AI穿衣案例（与 AI 穿衣同源素材），做同款真实入库回填 */}
                <div data-testid="xsy-cases">
                    <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">或试试这些</p>
                    <div className="grid grid-cols-3 gap-1.5">
                        {AI_DRESSING_V2_CASES.slice(0, 6).map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                data-testid={`xsy-case-${item.id}`}
                                disabled={applyingCaseId === item.id}
                                onClick={() => void applyCase(item)}
                                className="group relative aspect-square overflow-hidden rounded-md border border-border/70 disabled:opacity-60"
                            >
                                <img src={item.result} alt={`优秀案例-${item.id}`} className="size-full object-cover" loading="lazy" />
                                <span className="absolute inset-x-0 bottom-0 bg-foreground/60 py-0.5 text-center text-[10px] leading-4 text-background">
                                    {applyingCaseId === item.id ? "正在应用…" : "一键做同款"}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                <ToolResult task={activeTask} toolId={toolId} title="试衣结果操作" onCancel={cancel} />
            </XsySection>
                </section>
            </ToolWorkspaceColumns>
        </div>
    );
}

export default AiDressingXsyWorkspace;
