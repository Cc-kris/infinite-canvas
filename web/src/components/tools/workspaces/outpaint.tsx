/**
 * TASK-013 AI_OUTPAINTING「智能扩图」工作区。
 *
 * 页面结构（对照 page-specs/06-ai-outpainting.md）：
 *  1 上传原图 → 2 画布/比例扩展 → 3 扩展预览与内容描述 → 4 生成数量 → 结果
 *
 * 真实边界：
 *  - 画布上的每一次拖拽都只改「画布尺寸 / 原图偏移」，绝不缩放原图（等比 1:1 像素保留）；
 *  - 提交前按当前几何真实渲染 PNG 蒙版并入库，蒙版几何 hash 与画布几何必须一致；
 *  - 结果来自真实 TaskGateway，成功但无图 → 失败，不补造占位图；
 *  - 输入一变，旧结果立即标记为过期（不冒充新结果）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AlertTriangle,
    ArrowLeftRight,
    ImagePlus,
    Loader2,
    Lock,
    LockOpen,
    Maximize2,
    Move,
    RefreshCw,
    Redo2,
    RotateCcw,
    Sparkles,
    Undo2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { getToolById } from "@/features/tools/registry";
import {
    AI_OUTPAINTING_TOOL_ID,
    OUTPAINT_DEFAULT_OUTPUT,
    OUTPAINT_MAX_OUTPUT,
    OUTPAINT_MAX_PROMPT,
    OUTPAINT_MIN_OUTPUT,
    OUTPAINT_RATIOS,
    OUTPAINT_SIZE_PRESETS,
    applyHeight,
    applyRatio,
    applySizePreset,
    applySource,
    applyWidth,
    canRedoOutpaint,
    canSubmitOutpaint,
    canUndoOutpaint,
    composeOutpaintPrompt,
    createOutpaintHistory,
    edgeExpansion,
    edgeKeyboardDelta,
    expandEdge,
    expansionOf,
    expansionSummary,
    expansionTotal,
    geometryHash,
    keepRect,
    maskSyncState,
    moveOriginal,
    parseOutpaintValues,
    pushOutpaintHistory,
    redoOutpaint,
    resetOutpaintTransform,
    toggleLock,
    undoOutpaint,
    validateOutpaint,
    type OutpaintEdge,
    type OutpaintHistory,
    type OutpaintRatioKey,
    type OutpaintValues,
} from "@/features/tools/registry/ai-outpainting";
import {
    assertMaskGeometry,
    assetRecordToSource,
    buildOutpaintSnapshot,
    isOutpaintStale,
    buildOutpaintInput,
    createTaskStoreRunPort,
    ensureOutpaintMask,
    ensureSourceSize,
    mapOutpaintTask,
    runOutpaint,
    type OutpaintOutcome,
    type OutpaintSource,
} from "@/features/tools/adapters/ai-outpainting";
import { AI_OUTPAINTING_CASES } from "@/features/tools/tool-cases-data";
import { loadToolAssetRecords, uploadToolAsset } from "@/services/api/tools/assets";
import type { ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";

import { ToolAssetInput } from "../tool-asset-input";
import { ToolCases, type ToolCase } from "../tool-cases";
import { ToolResult } from "../tool-result";
import { ToolShell } from "../tool-shell";
import { ToolTaskHistory } from "../tool-task-history";

export type OutpaintWorkspaceProps = { className?: string };

/* ------------------------------------------------------------------ *
 * 小组件
 * ------------------------------------------------------------------ */

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
    return (
        <section id={id} className="rounded-lg border border-border bg-card">
            <header className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2">
                <h2 className="text-xs font-semibold">{title}</h2>
                {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
            </header>
            <div className="space-y-2.5 p-3">{children}</div>
        </section>
    );
}

function Chip({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            aria-pressed={active}
            className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition",
                active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
        >
            {children}
        </button>
    );
}

function NumberField({ label, value, min, max, step, disabled, onChange }: { label: string; value: number; min: number; max: number; step?: number; disabled?: boolean; onChange: (next: number) => void }) {
    return (
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="shrink-0">{label}</span>
            <input
                type="number"
                value={value}
                min={min}
                max={max}
                step={step ?? 1}
                disabled={disabled}
                onChange={(event) => onChange(Number(event.target.value))}
                className="w-20 rounded border border-border bg-background px-2 py-1 text-right text-xs text-foreground disabled:opacity-50"
            />
        </label>
    );
}

/* ------------------------------------------------------------------ *
 * 画布编辑器：原图 1:1 摆放 + 四边拖拽扩图
 * ------------------------------------------------------------------ */

const EDGE_HANDLE: Record<OutpaintEdge, string> = {
    // 命中区域 ≥ 40px（页面规格 §6 可点区域），可见的只有贴边 2px 的引导线。
    left: "left-0 top-0 bottom-0 w-10 cursor-ew-resize",
    right: "right-0 top-0 bottom-0 w-10 cursor-ew-resize",
    top: "left-0 right-0 top-0 h-10 cursor-ns-resize",
    bottom: "left-0 right-0 bottom-0 h-10 cursor-ns-resize",
};

const EDGE_LABEL: Record<OutpaintEdge, string> = {
    left: "左",
    right: "右",
    top: "上",
    bottom: "下",
};

function OutpaintCanvas({
    values,
    sourceUrl,
    disabled,
    onChange,
}: {
    values: OutpaintValues;
    sourceUrl?: string;
    disabled?: boolean;
    onChange: (next: OutpaintValues) => void;
}) {
    const boxRef = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef<{ mode: "move" | "edge"; edge?: OutpaintEdge; startX: number; startY: number; scale: number; base: OutpaintValues } | null>(null);
    const [dragging, setDragging] = useState(false);

    const scaleOf = useCallback(() => {
        const rect = boxRef.current?.getBoundingClientRect();
        if (!rect || !values.width) return 1;
        return rect.width / values.width;
    }, [values.width]);

    const begin = useCallback(
        (mode: "move" | "edge", edge?: OutpaintEdge) => (event: React.PointerEvent) => {
            if (disabled) return;
            if (mode === "move" && values.locked) return;
            event.preventDefault();
            event.stopPropagation();
            (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
            dragRef.current = { mode, edge, startX: event.clientX, startY: event.clientY, scale: scaleOf(), base: values };
            setDragging(true);
        },
        [disabled, scaleOf, values],
    );

    const move = useCallback(
        (event: React.PointerEvent) => {
            const drag = dragRef.current;
            if (!drag) return;
            const scale = drag.scale || 1;
            const dx = Math.round((event.clientX - drag.startX) / scale);
            const dy = Math.round((event.clientY - drag.startY) / scale);
            if (drag.mode === "move") {
                onChange(moveOriginal(drag.base, dx, dy));
                return;
            }
            if (!drag.edge) return;
            if (drag.edge === "left") onChange(expandEdge(drag.base, "left", -dx));
            else if (drag.edge === "right") onChange(expandEdge(drag.base, "right", dx));
            else if (drag.edge === "top") onChange(expandEdge(drag.base, "top", -dy));
            else onChange(expandEdge(drag.base, "bottom", dy));
        },
        [onChange],
    );

    const end = useCallback((event: React.PointerEvent) => {
        if (!dragRef.current) return;
        (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
        dragRef.current = null;
        setDragging(false);
    }, []);

    /** 边界键盘微调：←/→ 移动左右边，↑/↓ 移动上下边，Shift 为 64px 大步。 */
    const onEdgeKeyDown = useCallback(
        (edge: OutpaintEdge) => (event: React.KeyboardEvent) => {
            if (disabled) return;
            const delta = edgeKeyboardDelta(edge, event.key, event.shiftKey);
            if (!delta) return;
            event.preventDefault();
            onChange(expandEdge(values, edge, delta));
        },
        [disabled, onChange, values],
    );

    const percent = (value: number, total: number) => (total > 0 ? `${(value / total) * 100}%` : "0%");
    const keep = keepRect(values);
    const hasExpansion = expansionTotal(values) > 0;

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="rounded border border-border px-1.5 py-0.5 font-mono">
                    {values.width} × {values.height}
                </span>
                <span>原图 {values.sourceWidth} × {values.sourceHeight}</span>
                {hasExpansion ? <span className="text-amber-600 dark:text-amber-400">新增 {expansionSummary(values)}</span> : <span>未扩展</span>}
                <span className="ml-auto inline-flex items-center gap-1">
                    {values.locked ? <Lock className="size-3" /> : <Move className="size-3" />}
                    {values.locked ? "原图已锁定" : "可拖动原图"}
                </span>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-2">
                <div
                    ref={boxRef}
                    data-testid="outpaint-canvas"
                    data-width={values.width}
                    data-height={values.height}
                    style={{ aspectRatio: `${values.width} / ${values.height}` }}
                    className={cn(
                        "relative mx-auto w-full max-w-full select-none overflow-hidden rounded border border-dashed border-border bg-[repeating-conic-gradient(#0000000d_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]",
                        dragging && "ring-2 ring-primary/40",
                    )}
                    onPointerMove={move}
                    onPointerUp={end}
                    onPointerCancel={end}
                >
                    {sourceUrl ? (
                        <img
                            src={sourceUrl}
                            alt={values.sourceName || "原图"}
                            draggable={false}
                            data-testid="outpaint-source"
                            onPointerDown={begin("move")}
                            style={{
                                left: percent(values.offsetX, values.width),
                                top: percent(values.offsetY, values.height),
                                width: percent(values.sourceWidth, values.width),
                                height: percent(values.sourceHeight, values.height),
                            }}
                            className={cn("absolute rounded-sm object-cover shadow-sm", values.locked ? "cursor-not-allowed" : "cursor-move")}
                        />
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
                            <ImagePlus className="size-6 opacity-60" />
                            先上传一张原图
                        </div>
                    )}

                    {keep ? (
                        <div
                            aria-hidden="true"
                            style={{
                                left: percent(keep.x, values.width),
                                top: percent(keep.y, values.height),
                                width: percent(keep.width, values.width),
                                height: percent(keep.height, values.height),
                            }}
                            className="pointer-events-none absolute border border-emerald-500/70"
                        />
                    ) : null}

                    {(Object.keys(EDGE_HANDLE) as OutpaintEdge[]).map((edge) => (
                        <div
                            key={edge}
                            role="slider"
                            tabIndex={disabled ? -1 : 0}
                            aria-label={`扩展${EDGE_LABEL[edge]}边界（方向键微调，Shift 加速）`}
                            aria-orientation={edge === "left" || edge === "right" ? "horizontal" : "vertical"}
                            aria-valuemin={0}
                            aria-valuemax={4096}
                            aria-valuenow={edgeExpansion(values, edge)}
                            aria-disabled={disabled || undefined}
                            data-testid={`outpaint-edge-${edge}`}
                            data-expansion={edgeExpansion(values, edge)}
                            onPointerDown={begin("edge", edge)}
                            onKeyDown={onEdgeKeyDown(edge)}
                            className={cn(
                                "absolute z-10 bg-primary/0 outline-none transition hover:bg-primary/20 focus-visible:bg-primary/20",
                                EDGE_HANDLE[edge],
                                disabled && "pointer-events-none opacity-50",
                            )}
                        >
                            <span
                                className={cn(
                                    "pointer-events-none absolute rounded-full bg-primary/50",
                                    edge === "left" || edge === "right"
                                        ? "left-1/2 top-1/2 h-8 w-0.5 -translate-x-1/2 -translate-y-1/2"
                                        : "left-1/2 top-1/2 h-0.5 w-8 -translate-x-1/2 -translate-y-1/2",
                                )}
                            />
                        </div>
                    ))}
                </div>
            </div>

            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <ArrowLeftRight className="size-3" />
                拖四边扩画布（原图像素不缩放）；解锁后可拖动原图改变保留区域。
            </p>
        </div>
    );
}

/* ------------------------------------------------------------------ *
 * 页面
 * ------------------------------------------------------------------ */

const STEPS: Array<{ key: "upload" | "edit" | "ready"; label: string; hint: string }> = [
    { key: "upload", label: "1 · 上传原图", hint: "支持 JPG / PNG / WebP" },
    { key: "edit", label: "2 · 扩展画布", hint: "拖边扩图、调比例与尺寸" },
    { key: "ready", label: "3 · 生成", hint: "确认方向与最终尺寸" },
];

export function OutpaintWorkspace({ className }: OutpaintWorkspaceProps = {}) {
    const spec = useMemo(() => getToolById(AI_OUTPAINTING_TOOL_ID), []);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const conflict = useToolDraftStore((state) => state.conflicts[AI_OUTPAINTING_TOOL_ID]);

    const [history, setHistory] = useState<OutpaintHistory>(() => createOutpaintHistory(parseOutpaintValues(undefined)));
    const values = history.present;
    const [sourceRecord, setSourceRecord] = useState<ToolAssetRecord | null>(null);
    const [task, setTask] = useState<ToolTask | null>(null);
    const [outcome, setOutcome] = useState<OutpaintOutcome | null>(null);
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const [hydrated, setHydrated] = useState(false);
    /** B6：右栏与原站一致的三个页签（生成结果 / 优秀案例 / 历史记录）。 */
    const [rightTab, setRightTab] = useState<"result" | "cases" | "history">("result");
    const [applyingCaseId, setApplyingCaseId] = useState<string | null>(null);

    const historyRef = useRef(history);
    const valuesRef = useRef(values);
    const abortRef = useRef<AbortController | null>(null);

    /** 所有几何/锁定变更都经过 history，保证撤销栈与 draft 永远一致。 */
    const commit = useCallback(
        (next: OutpaintValues) => {
            const nextHistory = pushOutpaintHistory(historyRef.current, next);
            historyRef.current = nextHistory;
            valuesRef.current = nextHistory.present;
            setHistory(nextHistory);
            patchDraft(AI_OUTPAINTING_TOOL_ID, { values: nextHistory.present as unknown as Record<string, unknown> });
        },
        [patchDraft],
    );

    const applyHistory = useCallback(
        (step: (current: OutpaintHistory) => OutpaintHistory, message: string) => {
            const nextHistory = step(historyRef.current);
            if (nextHistory === historyRef.current) return;
            historyRef.current = nextHistory;
            valuesRef.current = nextHistory.present;
            setHistory(nextHistory);
            patchDraft(AI_OUTPAINTING_TOOL_ID, { values: nextHistory.present as unknown as Record<string, unknown> });
            setNotice(message);
        },
        [patchDraft],
    );

    const undo = useCallback(() => applyHistory(undoOutpaint, "已撤销上一步几何调整"), [applyHistory]);
    const redo = useCallback(() => applyHistory(redoOutpaint, "已重做几何调整"), [applyHistory]);

    // 键盘：Cmd/Ctrl+Z 撤销，Shift+Cmd/Ctrl+Z 或 Ctrl+Y 重做；输入框内不拦截。
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const meta = event.metaKey || event.ctrlKey;
            if (!meta) return;
            const target = event.target as HTMLElement | null;
            const tag = target?.tagName?.toLowerCase();
            if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
            const key = event.key.toLowerCase();
            if (key === "z" && !event.shiftKey) {
                event.preventDefault();
                undo();
            } else if ((key === "z" && event.shiftKey) || key === "y") {
                event.preventDefault();
                redo();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [redo, undo]);

    // 草稿恢复：几何 + 提示词 + 输出数量全部来自 draft.values；原图记录从资产索引取回。
    useEffect(() => {
        let alive = true;
        void (async () => {
            const draft = await hydrateDraft(AI_OUTPAINTING_TOOL_ID);
            if (!alive) return;
            const restored = parseOutpaintValues(draft?.values);
            const restoredHistory = createOutpaintHistory(restored);
            historyRef.current = restoredHistory;
            valuesRef.current = restored;
            setHistory(restoredHistory);
            setHydrated(true);
            if (restored.sourceAssetId) {
                const { records } = await loadToolAssetRecords([restored.sourceAssetId]);
                if (alive && records[0]) setSourceRecord(records[0]);
            }
        })();
        return () => {
            alive = false;
        };
    }, [hydrateDraft]);

    useEffect(() => () => abortRef.current?.abort(), []);

    const issues = useMemo(() => validateOutpaint(values), [values]);
    const blocking = useMemo(() => issues.filter((issue) => issue.field !== "prompt"), [issues]);
    // prompt 是必填项（自动文案服务未接入），但提示区只展示几何类阻塞，
    // 因此这里单独取出来在输入框下方提示，避免"按钮禁用却没有任何原因"。
    const promptIssue = useMemo(() => issues.find((issue) => issue.field === "prompt") ?? null, [issues]);
    const submitReady = canSubmitOutpaint(values) && Boolean(sourceRecord) && !busy;
    const submitBlockedReason = submitReady
        ? undefined
        : promptIssue?.message ?? blocking[0]?.message ?? (sourceRecord ? "提交中…" : "请先上传要扩展的原图");
    const maskState = maskSyncState(values);
    const expansion = useMemo(() => expansionOf(values), [values]);
    const snapshot = useMemo(() => buildOutpaintSnapshot(values), [values]);
    const stale = isOutpaintStale(outcome, values);
    const promptPreview = useMemo(() => composeOutpaintPrompt({ values, userPrompt: values.prompt }), [values]);
    const stage = !values.sourceAssetId ? "upload" : expansionTotal(values) > 0 ? "ready" : "edit";

    /* ---------------- 原图 ---------------- */

    const onSourceChange = useCallback(
        async (assetIds: string[], records: ToolAssetRecord[]) => {
            const record = records[0];
            if (!assetIds.length || !record) {
                setSourceRecord(null);
                const cleared: OutpaintValues = {
                    ...valuesRef.current,
                    sourceAssetId: null,
                    sourceName: "",
                    sourceWidth: 0,
                    sourceHeight: 0,
                    maskAssetId: null,
                    maskUrl: "",
                    maskHash: "",
                };
                commit(cleared);
                return;
            }
            const source: OutpaintSource = await ensureSourceSize(assetRecordToSource(record));
            setSourceRecord(record);
            commit(applySource(valuesRef.current, { assetId: source.assetId, name: source.name, width: source.width, height: source.height }));
            setTask(null);
            setOutcome(null);
            setNotice(`已载入原图 ${source.width} × ${source.height}，画布按原图尺寸 1:1 摆放`);
        },
        [commit],
    );

    /* ---------------- 提交 ---------------- */

    /* ---------------- 优秀案例 → 做同款（真实回填） ---------------- */

    const applyCase = useCallback(
        async (item: ToolCase) => {
            const param = item.params[0];
            if (!param) {
                setNotice("该案例缺少输入素材，无法回填");
                return;
            }
            setApplyingCaseId(item.id);
            try {
                const response = await fetch(param.src);
                if (!response.ok) throw new Error(`案例素材读取失败（HTTP ${response.status}）`);
                const blob = await response.blob();
                const file = new File([blob], `linkfox-case-${item.id}.${(blob.type.split("/")[1] || "jpg")}`, {
                    type: blob.type || "image/jpeg",
                });
                const record = await uploadToolAsset(file);
                await onSourceChange([record.id], [record]);
                const apply = item.apply;
                if (apply) {
                    const ratioKey =
                        typeof apply.ratio === "string" && OUTPAINT_RATIOS.some((option) => option.key === apply.ratio)
                            ? (apply.ratio as OutpaintRatioKey)
                            : null;
                    commit({
                        ...valuesRef.current,
                        ...(typeof apply.prompt === "string" ? { prompt: apply.prompt } : {}),
                        ...(ratioKey ? { ratio: ratioKey } : {}),
                        ...(typeof apply.sizePreset === "string" ? { sizePreset: apply.sizePreset } : {}),
                        ...(typeof apply.outputNum === "number" ? { outputNum: apply.outputNum } : {}),
                    });
                }
                setNotice(`已做同款：原图（素材 ${record.id.slice(0, 6)}…）与提示词已回填，可直接生成`);
            } catch (error) {
                setNotice(error instanceof Error ? `做同款失败：${error.message}` : "做同款失败");
            } finally {
                setApplyingCaseId(null);
            }
        },
        [commit, onSourceChange],
    );

    const submit = useCallback(async () => {
        if (busy) return;
        const current = valuesRef.current;
        const found = validateOutpaint(current);
        if (found.length) {
            setNotice(found[0].message);
            return;
        }
        if (!sourceRecord) {
            setNotice("请先上传原图");
            return;
        }
        const controller = new AbortController();
        abortRef.current = controller;
        setBusy(true);
        setNotice("正在按当前几何渲染蒙版并提交…");
        try {
            assertMaskGeometry(current);
            const source = await ensureSourceSize(assetRecordToSource(sourceRecord));
            const withMask = await ensureOutpaintMask(current);
            commit(withMask);
            const input = buildOutpaintInput({
                values: withMask,
                source,
                mask: { url: withMask.maskUrl, id: withMask.maskAssetId ?? undefined },
            });
            setNotice("已提交，等待上游真实返回…");
            const result = await runOutpaint(input, { port: createTaskStoreRunPort(), signal: controller.signal });
            setTask(result);
            const outcome = mapOutpaintTask(withMask, result);
            setOutcome(outcome);
            if (outcome.status === "succeeded") setNotice(`生成完成：${outcome.images.length} 张`);
            else if (outcome.status === "failed") setNotice(`生成失败：${outcome.error?.message ?? "上游未返回图片"}`);
            else if (outcome.status === "cancelled") setNotice("已取消");
            else setNotice("上游结果未定，可稍后重试（不按失败处理）");
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "提交失败，请重试");
        } finally {
            setBusy(false);
            abortRef.current = null;
        }
    }, [busy, commit, sourceRecord]);

    const cancel = useCallback(() => {
        abortRef.current?.abort();
        if (task) void import("@/stores/use-tool-task-store").then(({ useToolTaskStore }) => useToolTaskStore.getState().cancelTask(task.id));
        setNotice("已请求取消");
    }, [task]);

    /**
     * 单张重试：真实再发一次上游请求（数量固定 1 张），成功后只替换该下标的结果项，
     * 其余结果原样保留 —— 不做「整批重来」也不伪造新图。
     */
    const retryItem = useCallback(
        async (_item: ToolTaskResultItem, index: number) => {
            if (busy) throw new Error("当前有任务在跑，请等它结束后再重试");
            const current = valuesRef.current;
            const found = validateOutpaint(current);
            if (found.length) throw new Error(found[0].message);
            if (!sourceRecord) throw new Error("请先上传原图");
            if (!task) throw new Error("当前没有可替换的结果");
            setBusy(true);
            setNotice(`正在重试第 ${index + 1} 张…`);
            try {
                const source = await ensureSourceSize(assetRecordToSource(sourceRecord));
                const withMask = await ensureOutpaintMask(current);
                commit(withMask);
                const input = buildOutpaintInput({
                    values: { ...withMask, outputNum: 1 },
                    source,
                    mask: { url: withMask.maskUrl, id: withMask.maskAssetId ?? undefined },
                });
                const fresh = await runOutpaint(input, { port: createTaskStoreRunPort() });
                const replacement = fresh.result?.items?.[0];
                if (!replacement) throw new Error("上游没有返回新的结果图，已保留原结果");
                const items = [...(task.result?.items ?? [])];
                while (items.length < index) items.push(replacement);
                items[index] = replacement;
                const merged: ToolTask = {
                    ...task,
                    status: "succeeded",
                    updatedAt: Date.now(),
                    result: { items, receivedAt: Date.now() },
                };
                useToolTaskStore.getState().upsertTask(merged);
                setTask(merged);
                setOutcome(mapOutpaintTask(withMask, merged));
                setNotice(`第 ${index + 1} 张已重试完成（其余 ${items.length - 1} 张保留原结果）`);
            } finally {
                setBusy(false);
            }
        },
        [busy, commit, sourceRecord, task],
    );

    /* ---------------- 渲染 ---------------- */

    return (
        <ToolShell
            className={className}
            title={spec?.title ?? "智能扩图"}
            subtitle="在原图四周扩展画布：原图像素 1:1 保留，拖边/调比例只改画布与保留区域，生成前按当前几何渲染蒙版"
            badges={
                <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {spec ? `makeType ${spec.makeType}` : AI_OUTPAINTING_TOOL_ID}
                </span>
            }
            actions={
                <button
                    type="button"
                    data-testid="outpaint-submit"
                    disabled={!submitReady}
                    title={submitBlockedReason}
                    onClick={() => void submit()}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {busy ? "生成中…" : "开始扩图"}
                </button>
            }
            notices={
                <>
                    {conflict ? (
                        <div className="flex items-center gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="size-3.5" />
                            草稿在其它标签页被修改，当前以本页为准。
                        </div>
                    ) : null}
                    {notice ? (
                        <div data-testid="outpaint-notice" className="rounded border border-border bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
                            {notice}
                        </div>
                    ) : null}
                    {blocking.length ? (
                        <div data-testid="outpaint-blocking" className="rounded border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
                            {blocking[0].message}
                        </div>
                    ) : null}
                    {stale ? (
                        <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                            画布/参数已变更，下方结果为上一次输入的结果（已过期），请重新生成。
                        </div>
                    ) : null}
                </>
            }
            sidebar={
                <div className="space-y-3 p-3">
                    <p className="text-[11px] font-medium text-muted-foreground">扩图流程</p>
                    <ol className="space-y-1.5">
                        {STEPS.map((step) => {
                            const active = stage === step.key;
                            return (
                                <li
                                    key={step.key}
                                    className={cn(
                                        "rounded border px-2 py-1.5 text-[11px]",
                                        active ? "border-primary/60 bg-primary/5 text-foreground" : "border-border text-muted-foreground",
                                    )}
                                >
                                    <div className="font-medium">{step.label}</div>
                                    <div className="text-[10px] opacity-80">{step.hint}</div>
                                </li>
                            );
                        })}
                    </ol>
                    <div className="space-y-1 rounded border border-border p-2 text-[11px] text-muted-foreground">
                        <div className="flex justify-between">
                            <span>最终尺寸</span>
                            <span className="font-mono text-foreground">
                                {values.width}×{values.height}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span>新增像素</span>
                            <span className={expansionTotal(values) > 0 ? "text-foreground" : ""}>{expansionSummary(values)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>蒙版</span>
                            <span className={maskState === "synced" ? "text-emerald-600 dark:text-emerald-400" : ""}>
                                {maskState === "synced" ? "已同步" : maskState === "stale" ? "已过期" : "未生成"}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span>几何 hash</span>
                            <span className="font-mono">{geometryHash(values).slice(0, 8)}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            disabled={!canUndoOutpaint(history) || busy}
                            onClick={undo}
                            title="撤销几何调整（⌘/Ctrl+Z）"
                            data-testid="outpaint-undo"
                            className="flex flex-1 items-center justify-center gap-1 rounded border border-border px-2 py-1.5 text-[11px] transition hover:bg-accent disabled:opacity-40"
                        >
                            <Undo2 className="size-3" />
                            撤销
                        </button>
                        <button
                            type="button"
                            disabled={!canRedoOutpaint(history) || busy}
                            onClick={redo}
                            title="重做（⇧⌘/Ctrl+Z）"
                            data-testid="outpaint-redo"
                            className="flex flex-1 items-center justify-center gap-1 rounded border border-border px-2 py-1.5 text-[11px] transition hover:bg-accent disabled:opacity-40"
                        >
                            <Redo2 className="size-3" />
                            重做
                        </button>
                    </div>
                    <button
                        type="button"
                        disabled={!values.sourceAssetId}
                        onClick={() => commit(resetOutpaintTransform(valuesRef.current))}
                        className="flex w-full items-center justify-center gap-1 rounded border border-border px-2 py-1.5 text-[11px] transition hover:bg-accent disabled:opacity-40"
                    >
                        <RotateCcw className="size-3" />
                        恢复默认尺寸
                    </button>
                </div>
            }
        >
            <div className="grid min-h-0 gap-3 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="min-w-0 space-y-3">
                    <Section id="source" title="1 · 原图" hint={`≤ 10MB，1 张`}>
                        <ToolAssetInput
                            toolId={AI_OUTPAINTING_TOOL_ID}
                            maxCount={1}
                            disabled={busy}
                            title="上传原图"
                            onChange={(assetIds, records) => void onSourceChange(assetIds, records)}
                        />
                        {values.sourceName ? (
                            <p className="truncate text-[11px] text-muted-foreground" data-testid="outpaint-source-name">
                                当前原图：{values.sourceName}
                            </p>
                        ) : null}
                    </Section>

                    <Section id="canvas" title="2 · 扩展画布" hint={values.sourceAssetId ? `${values.width}×${values.height}` : "先上传原图"}>
                        <OutpaintCanvas values={values} sourceUrl={sourceRecord?.url} disabled={busy} onChange={commit} />

                        <div className="space-y-1.5">
                            <p className="text-[11px] text-muted-foreground">画布比例（只扩画布，不拉伸原图）</p>
                            <div className="flex flex-wrap gap-1.5">
                                {OUTPAINT_RATIOS.map((option) => (
                                    <Chip
                                        key={option.key}
                                        active={values.ratio === option.key}
                                        onClick={() => commit(applyRatio(valuesRef.current, option.key as OutpaintRatioKey))}
                                        title={option.label}
                                    >
                                        {option.label}
                                    </Chip>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] text-muted-foreground">尺寸档</span>
                            {OUTPAINT_SIZE_PRESETS.map((preset) => (
                                <Chip key={preset.id} active={values.sizePreset === preset.id} onClick={() => commit(applySizePreset(valuesRef.current, preset.id))}>
                                    {preset.label}
                                </Chip>
                            ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <NumberField label="宽" value={values.width} min={256} max={4096} step={8} disabled={busy} onChange={(next) => commit(applyWidth(valuesRef.current, next))} />
                            <NumberField label="高" value={values.height} min={256} max={4096} step={8} disabled={busy} onChange={(next) => commit(applyHeight(valuesRef.current, next))} />
                            <button
                                type="button"
                                onClick={() => commit(toggleLock(valuesRef.current))}
                                className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] transition hover:bg-accent"
                            >
                                {values.locked ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
                                {values.locked ? "解锁原图" : "锁定原图"}
                            </button>
                        </div>
                    </Section>

                    <Section id="prompt" title="3 · 新增区域内容（必填）" hint={`${values.prompt.length}/${OUTPAINT_MAX_PROMPT}`}>
                        <textarea
                            value={values.prompt}
                            maxLength={OUTPAINT_MAX_PROMPT}
                            disabled={busy}
                            aria-invalid={promptIssue ? true : undefined}
                            aria-required
                            onChange={(event) => commit({ ...valuesRef.current, prompt: event.target.value })}
                            placeholder="描述新增画布区域要出现什么，例如：延续灰色水泥地面与柔和侧光，右侧补出完整的产品阴影"
                            rows={3}
                            className="w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        {promptIssue ? (
                            <p data-testid="outpaint-prompt-error" id="outpaint-prompt-error" className="text-[11px] leading-4 text-destructive">
                                {promptIssue.message}
                            </p>
                        ) : null}
                        <details className="rounded border border-border bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
                            <summary className="cursor-pointer select-none">查看提交给上游的完整描述（几何自动带入）</summary>
                            <pre className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[10px] leading-4">{promptPreview}</pre>
                        </details>
                    </Section>
                </div>

                <div className="min-w-0 space-y-3">
                    <Section id="count" title="4 · 生成数量" hint={`${OUTPAINT_MIN_OUTPUT}-${OUTPAINT_MAX_OUTPUT} 张`}>
                        <div className="flex flex-wrap gap-1.5">
                            {Array.from({ length: OUTPAINT_MAX_OUTPUT - OUTPAINT_MIN_OUTPUT + 1 }, (_, index) => OUTPAINT_MIN_OUTPUT + index).map((count) => (
                                <Chip key={count} active={values.outputNum === count} onClick={() => commit({ ...valuesRef.current, outputNum: count })}>
                                    {count} 张
                                </Chip>
                            ))}
                        </div>
                        <button
                            type="button"
                            data-testid="outpaint-submit-inline"
                            disabled={!submitReady}
                            title={submitBlockedReason}
                            aria-describedby={promptIssue ? "outpaint-prompt-error" : undefined}
                            onClick={() => void submit()}
                            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                            {busy ? "生成中…" : `生成 ${values.outputNum} 张扩图`}
                        </button>
                        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Maximize2 className="size-3" />
                            提交快照 {snapshot.hash.slice(0, 8)} · 默认 {OUTPAINT_DEFAULT_OUTPUT} 张
                        </p>
                    </Section>

                    <div className="flex items-center gap-4 border-b border-border pb-1.5" role="tablist" aria-label="右栏页签">
                        {([
                            { key: "result", label: "生成结果" },
                            { key: "cases", label: "优秀案例" },
                            { key: "history", label: "历史记录" },
                        ] as const).map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                role="tab"
                                aria-selected={rightTab === item.key}
                                data-testid={`outpaint-tab-${item.key}`}
                                onClick={() => setRightTab(item.key)}
                                className={
                                    rightTab === item.key
                                        ? "relative text-xs font-medium text-[#723CF9] after:absolute after:-bottom-[7px] after:left-0 after:h-[2px] after:w-full after:rounded-full after:bg-[#723CF9]"
                                        : "text-xs text-muted-foreground transition-colors hover:text-foreground"
                                }
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>

                    <div role="tabpanel" hidden={rightTab !== "result"} data-testid="outpaint-panel-result">
                        <ToolResult
                        task={task}
                        toolId={AI_OUTPAINTING_TOOL_ID}
                        title="扩图结果"
                        onCancel={busy ? cancel : undefined}
                        onRetry={() => void submit()}
                        onRetryItem={retryItem}
                        retryItemHint="只重试这一张：会再向上游发起 1 次生成，其余结果保持不变"
                    />
                    </div>

                    <div role="tabpanel" hidden={rightTab !== "cases"} data-testid="outpaint-panel-cases">
                        <ToolCases cases={AI_OUTPAINTING_CASES} applyingId={applyingCaseId} onApply={applyCase} />
                    </div>

                    <div role="tabpanel" hidden={rightTab !== "history"} data-testid="outpaint-panel-history">
                        <ToolTaskHistory
                        toolId={AI_OUTPAINTING_TOOL_ID}
                        limit={6}
                        emptyHint="本工具还没有历史任务；提交一次后会在这里留下记录。"
                        onSelectTask={(selected) => {
                            setTask(selected);
                            setNotice("已载入历史任务结果（几何以当时提交快照为准）");
                        }}
                    />
                    </div>

                    <div className="flex items-start gap-1.5 rounded border border-border bg-muted/30 px-2 py-1.5 text-[10px] leading-4 text-muted-foreground">
                        <RefreshCw className="mt-0.5 size-3 shrink-0" />
                        <span>蒙版以第 2 张参考图随请求提交（当前网关未提供独立 mask 通道），字段里同时保留 maskUrl 便于排查。</span>
                    </div>
                </div>
            </div>
        </ToolShell>
    );
}
