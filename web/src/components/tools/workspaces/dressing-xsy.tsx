import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolResult } from "@/components/tools/tool-result";
import { describeToolExecution } from "@/services/api/tools/gateway";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { loadToolAssetRecords, type ToolAssetRecord } from "@/services/api/tools/assets";
import { cn } from "@/lib/utils";
import { resolveModelChannel, useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import {
    buildXsyInput,
    buildXsyUnit,
    createXsyRunPort,
    mapXsyTaskToOutcome,
    type XsyOutcome,
    type XsyUnit,
} from "@/features/tools/adapters/ai-dressing-xsy";
import type { MaskStroke } from "@/features/tools/registry/area-repair";
import {
    AI_DRESSING_XSY_FIELD_KEYS,
    AI_DRESSING_XSY_TOOL_ID,
    XSY_DRAFT_SLOT,
    XSY_MODEL_POSES,
    XSY_MODEL_STYLES,
    XSY_MODEL_TYPES,
    XSY_OUTPUT_OPTIONS,
    XSY_SLOTS,
    XSY_STEPS,
    XSY_TABS,
    XSY_VERSIONS,
    applyXsyEdit,
    buildXsyPrompt,
    buildXsySnapshot,
    clearXsyMask,
    createXsyValues,
    fillXsyMask,
    normalizeXsyValues,
    resolveXsyCapability,
    revisitXsyStep,
    serializeXsyValues,
    switchXsyTab,
    validateXsy,
    xsyErrors,
    xsyEstimate,
    xsyMaskCoverage,
    xsySlotActive,
    xsySlotMeta,
    xsySnapshotHash,
    xsyStepMeta,
    xsyStepStates,
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

function XsySection({ title, hint, step, children, testId }: { title: string; hint?: string; step?: XsyStepId; children: React.ReactNode; testId?: string }) {
    return (
        <section data-testid={testId} data-step={step} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3">
                <h3 className="text-sm font-medium text-foreground">
                    {step ? <span className="mr-1 text-muted-foreground">{step}.</span> : null}
                    {title}
                </h3>
                {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
            </div>
            <div className="space-y-3">{children}</div>
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
                                active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
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

function XsyStepBar({ states, onSelect, disabled }: { states: ReturnType<typeof xsyStepStates>; onSelect: (step: XsyStepId) => void; disabled: boolean }) {
    return (
        <div data-testid="xsy-steps" className="rounded-xl border border-border bg-card p-3">
            <ol className="flex flex-wrap gap-2">
                {states.map((state) => (
                    <li key={state.step} className="flex-1">
                        <button
                            type="button"
                            data-step={state.step}
                            data-status={state.status}
                            disabled={disabled || state.locked}
                            title={state.hint}
                            onClick={() => onSelect(state.step)}
                            className={cn(
                                "w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors disabled:opacity-40",
                                state.status === "active" && "border-primary bg-primary/10 text-primary",
                                state.status === "done" && "border-emerald-500/50 bg-emerald-500/5 text-emerald-600",
                                state.status === "stale" && "border-amber-500/60 bg-amber-500/5 text-amber-600",
                                state.status === "pending" && "border-border text-muted-foreground",
                            )}
                        >
                            <span className="block font-medium">
                                {state.step}. {state.label}
                            </span>
                            <span className="mt-0.5 block text-[10px] opacity-80">
                                {state.status === "done"
                                    ? "已就绪"
                                    : state.status === "stale"
                                      ? "需重确认"
                                      : state.status === "active"
                                        ? "进行中"
                                        : state.errors > 0
                                          ? `${state.errors} 项待补`
                                          : state.locked
                                            ? "先完成前序步骤"
                                            : "未开始"}
                            </span>
                        </button>
                    </li>
                ))}
            </ol>
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

/* -------------------------------- 工作区 -------------------------------- */

type MaskHistory = { past: MaskStroke[][]; future: MaskStroke[][] };

export function AiDressingXsyWorkspace({ className, toolId = AI_DRESSING_XSY_TOOL_ID }: { className?: string; toolId?: string }) {
    const hydrate = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const flushDraft = useToolDraftStore((state) => state.flush);
    const draft = useToolDraftStore((state) => state.drafts[toolId]);
    const config = useConfigStore((state) => state.config);
    const imageModel = useConfigStore((state) => state.config.imageModel);

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
    const abortRef = useRef<AbortController | null>(null);

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
    const stepStates = useMemo(() => xsyStepStates(values, capability), [values, capability]);
    const estimate = useMemo(() => xsyEstimate(values), [values]);
    const prompt = useMemo(() => buildXsyPrompt(buildXsySnapshot(values, { provider })), [values, provider]);
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

    const goto = useCallback(
        (step: XsyStepId) => {
            setValues((previous) => {
                const next = revisitXsyStep(previous, step);
                persist(next);
                return next;
            });
        },
        [persist],
    );

    const next = useCallback(() => {
        setValues((previous) => {
            const currentErrors = xsyErrors(validateXsy(previous, capability)).filter((issue) => issue.step === previous.step);
            if (currentErrors.length > 0) {
                setRunError(currentErrors[0]!.message);
                return previous;
            }
            setRunError(undefined);
            const target = Math.min(4, previous.step + 1) as XsyStepId;
            const advanced = revisitXsyStep(previous, target);
            persist(advanced);
            return advanced;
        });
    }, [capability, persist]);

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
    const stepMeta = xsyStepMeta(values.step);
    const images = outcome?.images ?? [];
    const fieldsReady = unit ? Object.values(unit.fields).filter((value) => String(value ?? "").trim().length > 0).length : 0;

    return (
        <div data-testid="xsy-workspace" data-step={values.step} data-tab={values.activeTab} className={cn("flex flex-col gap-3", className)}>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3">
                <div>
                    <p className="text-sm font-medium text-foreground">AI试衣XSY · 分步试衣</p>
                    <p className="text-[11px] text-muted-foreground">
                        第 {values.step} 步 / 共 {XSY_STEPS.length} 步 · {stepMeta.label} — {stepMeta.hint}
                    </p>
                </div>
                <div className="text-right">
                    <p data-testid="xsy-estimate" className="text-xs text-foreground">
                        {estimate.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground">参考图 {estimate.referenceCount} 张 · 模型 {effectiveModel || "未选择"}</p>
                </div>
            </div>

            <XsyStepBar states={stepStates} onSelect={goto} disabled={running} />

            {lostAssets.length > 0 ? (
                <p data-testid="xsy-lost-assets" className="rounded-lg border border-amber-500/50 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-600">
                    草稿里的 {lostAssets.length} 个素材已不在资产库（{lostAssets.join("、")}），请重新上传后再生成。
                </p>
            ) : null}

            {restoring ? <p className="text-[11px] text-muted-foreground">正在恢复草稿与素材…</p> : null}

            {errors.length > 0 ? (
                <ul data-testid="xsy-issues" className="space-y-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                    {errors.slice(0, 4).map((issue) => (
                        <li key={`${issue.code}-${issue.field}`} data-issue={issue.code}>
                            · 第 {issue.step} 步：{issue.message}
                        </li>
                    ))}
                </ul>
            ) : null}

            {/* 1. 模特图 + 类型/风格 */}
            <XsySection title="模特图" hint="模特图决定身份、姿态与光照；之后只替换服装部位" step={1} testId="xsy-step-model">
                <ToolAssetInput toolId={toolId} title="选择模特图" maxCount={1} disabled={running} onChange={onModelChange} />
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
                <XsySegmented
                    label="模特类型"
                    value={values.modelType}
                    options={XSY_MODEL_TYPES}
                    onChange={(next) => edit({ modelType: next }, 1)}
                    disabled={running}
                    testId="xsy-model-types"
                />
                <XsySegmented
                    label="模特风格"
                    value={values.modelStyle}
                    options={XSY_MODEL_STYLES}
                    onChange={(next) => edit({ modelStyle: next }, 1)}
                    disabled={running}
                    testId="xsy-model-styles"
                />
                <button
                    type="button"
                    data-testid="xsy-next-model"
                    disabled={running}
                    onClick={next}
                    className="min-h-10 rounded-md border border-border px-4 text-xs"
                >
                    下一步：服装
                </button>
            </XsySection>

            {/* 2. 分步服装上传 */}
            <XsySection title="分步服装上传" hint="上下装模式需要上装与下装；连体模式只看一件套装" step={2} testId="xsy-step-garment">
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
                                values.activeTab === tab.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                            )}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

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
                <button type="button" data-testid="xsy-next-garment" disabled={running} onClick={next} className="min-h-10 rounded-md border border-border px-4 text-xs">
                    下一步：蒙版/姿势
                </button>
            </XsySection>

            {/* 3. 蒙版 + 姿势 */}
            <XsySection title="蒙版与姿势" hint="涂出该件服装在模特图上的区域；白=替换，黑=保持原样" step={3} testId="xsy-step-mask">
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
                <XsySegmented
                    label="模特姿势"
                    value={values.modelPose}
                    options={XSY_MODEL_POSES}
                    onChange={(next) => edit({ modelPose: next }, 3)}
                    disabled={running}
                    testId="xsy-model-poses"
                />
                <button type="button" data-testid="xsy-next-mask" disabled={running} onClick={next} className="min-h-10 rounded-md border border-border px-4 text-xs">
                    下一步：生成
                </button>
            </XsySection>

            {/* 4. 生成 */}
            <XsySection title="生成设置" hint="张数与算法版本只影响本次提交，不会删除历史结果" step={4} testId="xsy-step-generate">
                <XsySegmented
                    label="生成张数"
                    value={String(values.outputNum)}
                    options={XSY_OUTPUT_OPTIONS.map((count) => ({ id: String(count), label: `${count} 张` }))}
                    onChange={(next) => edit({ outputNum: Number(next) }, 4)}
                    disabled={running}
                    testId="xsy-output"
                />
                <XsySegmented
                    label="算法/修复版本"
                    value={values.version}
                    options={XSY_VERSIONS}
                    onChange={(next) => edit({ version: next }, 4)}
                    disabled={running}
                    testId="xsy-version"
                />
                <div data-testid="xsy-prompt" className="max-h-32 overflow-auto rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                    {prompt}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        data-testid="xsy-submit"
                        disabled={blocked}
                        onClick={() => void submit()}
                        className="min-h-10 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground disabled:opacity-40"
                    >
                        {running ? "正在生成…" : `生成 ${estimate.count} 张试穿图`}
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
                {runError ? (
                    <p data-testid="xsy-run-error" role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
                        {runError}
                    </p>
                ) : null}
            </XsySection>

            {/* 结果 */}
            <XsySection title="试穿结果" hint="结果显示在下方；结果与提交快照不一致时会标注旧配置" testId="xsy-results">
                {stale ? (
                    <p data-testid="xsy-stale" className="rounded-lg border border-amber-500/50 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-600">
                        配置已改动，下面的结果来自提交时的旧版本配置。
                    </p>
                ) : null}
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
                        {running ? "正在生成，结果会出现在这里…" : "还没有结果：完成前 4 步后点「生成」"}
                    </p>
                )}

                <ToolResult task={task} toolId={toolId} title="试衣结果操作" onCancel={cancel} />

                {unit ? (
                    <div data-testid="xsy-field-audit" className="rounded-lg border border-border bg-muted/20 p-3">
                        <p className="mb-1 text-[11px] text-muted-foreground">
                            字段自检：{fieldsReady}/{AI_DRESSING_XSY_FIELD_KEYS.length} 已取值 · 快照 {unit.snapshotHash.slice(0, 8)}
                        </p>
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                            {AI_DRESSING_XSY_FIELD_KEYS.map((key) => (
                                <div key={key} className="flex justify-between gap-2">
                                    <dt className="truncate">{key}</dt>
                                    <dd data-field={key} className="shrink-0 font-mono">
                                        {String(unit.fields[key] ?? "").trim() ? "✓" : "—"}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                ) : null}
            </XsySection>

            <p className="text-[10px] text-muted-foreground">
                当前蒙版是否为空由真实栅格化覆盖率判定；参考图 = 模特 1 张 + 服装 1 张 + 同尺寸蒙版 1 张（每件）。
            </p>
        </div>
    );
}

export default AiDressingXsyWorkspace;
