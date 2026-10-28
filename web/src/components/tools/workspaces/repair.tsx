/**
 * TASK-019：「色差修复」FIX_COLOR 工作区（layout = repair）。
 *
 * 真实边界（与 registry/adapters 一致，不接受演示成功）：
 *  - 修复区域来自画布上真实涂抹的笔画，提交时导出同尺寸 PNG 蒙版；
 *  - 区域色 / 目标色就是 ToolSpec 的 fixColorSegUrl / fixColorUrl，提交前做颜色合法性 + 同色拦截；
 *  - 结果只来自上游返回，`fixColorResultView` 判定过期/失败，绝不补造；
 *  - 本文件按 layout 分发：`RepairWorkspace` 供路由使用，`FixColorWorkspace` 供本页直连。
 *
 * 规格：docs/V1.0/plan_linkfox_navigation/page-specs/12-fix-color.md
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftRight, Paintbrush, Pipette, Redo2, RotateCcw, Sparkles, Undo2 } from "lucide-react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolShell } from "@/components/tools/tool-shell";
import {
    buildFixColorUnit,
    clampCompareSplit,
    createFixColorRunPort,
    exportFixColorMaskPng,
    fixColorResultView,
    runFixColor,
    toFixColorReference,
    type FixColorRun,
} from "@/features/tools/adapters/fix-color";
import { getToolById, toolSpecs } from "@/features/tools/registry";
import {
    FIX_COLOR_BRUSH_MAX,
    FIX_COLOR_BRUSH_MIN,
    FIX_COLOR_BRUSH_PRESETS,
    FIX_COLOR_COMPARE_MODES,
    FIX_COLOR_DEFAULT_REGION_COLOR,
    FIX_COLOR_DEFAULT_TARGET_COLOR,
    FIX_COLOR_LAYOUT,
    FIX_COLOR_PALETTE,
    FIX_COLOR_SLUG,
    FIX_COLOR_TOOL_ID,
    FIX_COLOR_VERSIONS,
    beginFixColorStroke,
    buildFixColorSnapshot,
    clampFixColorBrush,
    clampFixColorFeather,
    colorDeltaE,
    commitFixColorStroke,
    createFixColorHistory,
    createFixColorState,
    describeColorDelta,
    describeFixColorCoverage,
    extendFixColorStroke,
    fixColorCoverage,
    fixColorHistoryState,
    fixColorMaskIsEmpty,
    formatColorInput,
    getFixColorSpec,
    isFixColorSnapshotStale,
    normalizeColorHex,
    parseFixColorDraftValues,
    redoFixColorStroke,
    resetFixColorStrokes,
    serializeFixColorDraftValues,
    undoFixColorStroke,
    validateFixColorInput,
    validateFixColorSource,
    type FixColorCompareMode,
    type FixColorSnapshot,
    type FixColorState,
    type FixColorVersionId,
} from "@/features/tools/registry/fix-color";
import {
    buildHandRepairUnits,
    createHandRepairRunPort,
    exportHandRepairMaskPng,
    handRepairResultView,
    runHandRepairUnits,
    summarizeHandRepairOutcomes,
    toHandRepairReference,
    type HandRepairUnitOutcome,
} from "@/features/tools/adapters/hand-repair";
import {
    HAND_REPAIR_BRUSH_MAX,
    HAND_REPAIR_BRUSH_MIN,
    HAND_REPAIR_BRUSH_PRESETS,
    HAND_REPAIR_OUTPUT_OPTIONS,
    HAND_REPAIR_SLUG,
    HAND_REPAIR_TOOL_ID,
    HAND_REPAIR_UPSTREAM,
    beginHandRepairStroke,
    buildHandRepairSnapshot,
    clampHandRepairBrush,
    commitHandRepairStroke,
    createHandRepairHistory,
    createHandRepairState,
    describeHandRepairCoverage,
    extendHandRepairStroke,
    handRepairDownloadName,
    handRepairHistoryState,
    handRepairMaskIsEmpty,
    handRepairOutputLabel,
    handRepairPersonTypeOptions,
    handRepairSnapshotHash,
    isHandRepairSnapshotStale,
    parseHandRepairDraftValues,
    redoHandRepairStroke,
    resetHandRepairStrokes,
    serializeHandRepairDraftValues,
    undoHandRepairStroke,
    validateHandRepairInput,
    validateHandRepairSource,
    type HandRepairSnapshot,
    type HandRepairState,
} from "@/features/tools/registry/hand-repair";
import type { MaskHistory, MaskStroke } from "@/features/tools/registry/area-repair";
import { cn, randomId } from "@/lib/utils";
import { loadToolAssetRecords, type ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { imageToDataUrl } from "@/services/image-storage";
import { flushToolDrafts, useToolDraftStore } from "@/stores/use-tool-draft-store";

export type RepairWorkspaceProps = { className?: string; toolId?: string };

type UploadedImage = { id: string; name: string; dataUrl: string; width: number; height: number };

const TOOL_ID = FIX_COLOR_TOOL_ID;

/** 从画布指针事件换算成图片像素坐标。 */
function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>, image: UploadedImage) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * image.width : 0;
    const y = rect.height > 0 ? ((event.clientY - rect.top) / rect.height) * image.height : 0;
    return { x: Math.max(0, Math.min(image.width, x)), y: Math.max(0, Math.min(image.height, y)) };
}

export function FixColorWorkspace({ className }: RepairWorkspaceProps = {}) {
    const spec = useMemo(() => getFixColorSpec(), []);
    const siblings = useMemo(
        () => toolSpecs.filter((tool) => tool.layout === FIX_COLOR_LAYOUT && tool.id !== TOOL_ID),
        [],
    );
    const patchDraft = useToolDraftStore((store) => store.patch);
    const hydrateDraft = useToolDraftStore((store) => store.hydrate);

    const [image, setImage] = useState<UploadedImage | null>(null);
    const imageRef = useRef<UploadedImage | null>(null);
    const [state, setState] = useState<FixColorState>(() => createFixColorState());
    const stateRef = useRef(state);
    const [history, setHistory] = useState<MaskHistory>(() => createFixColorHistory());
    const historyRef = useRef(history);
    const [regionColor, setRegionColor] = useState(FIX_COLOR_DEFAULT_REGION_COLOR);
    const regionColorRef = useRef(regionColor);
    const [targetColor, setTargetColor] = useState(FIX_COLOR_DEFAULT_TARGET_COLOR);
    const targetColorRef = useRef(targetColor);
    const [version, setVersion] = useState<FixColorVersionId>(FIX_COLOR_VERSIONS[0].id);
    const versionRef = useRef(version);
    const [compareMode, setCompareMode] = useState<FixColorCompareMode>("slide");
    const compareModeRef = useRef(compareMode);
    const [split, setSplit] = useState(50);
    const [run, setRun] = useState<FixColorRun | null>(null);
    const [task, setTask] = useState<ToolTask | null>(null);
    const [runSnapshot, setRunSnapshot] = useState<FixColorSnapshot | null>(null);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [hydrated, setHydrated] = useState(false);
    const drawingRef = useRef<MaskStroke | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        stateRef.current = state;
        historyRef.current = history;
        regionColorRef.current = regionColor;
        targetColorRef.current = targetColor;
        versionRef.current = version;
        compareModeRef.current = compareMode;
    }, [state, history, regionColor, targetColor, version, compareMode]);

    const persist = useCallback(
        (
            nextState: FixColorState,
            next: { regionColor?: string; targetColor?: string; version?: FixColorVersionId; compareMode?: FixColorCompareMode; imageName?: string },
        ) => {
            patchDraft(TOOL_ID, {
                values: serializeFixColorDraftValues({
                    state: nextState,
                    imageName: next.imageName ?? imageRef.current?.name ?? "",
                    version: next.version ?? versionRef.current,
                    regionColor: next.regionColor ?? regionColorRef.current,
                    targetColor: next.targetColor ?? targetColorRef.current,
                    compareMode: next.compareMode ?? compareModeRef.current,
                }),
                assetIds: imageRef.current ? [imageRef.current.id] : [],
            });
        },
        [patchDraft],
    );

    /* ---------------- 恢复草稿：刷新后继续（规格 §5） ---------------- */

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const draft = await hydrateDraft(TOOL_ID);
            if (cancelled) return;
            const parsed = parseFixColorDraftValues(draft?.values ?? {});
            setState(parsed.state);
            stateRef.current = parsed.state;
            const nextHistory = createFixColorHistory(parsed.state.strokes);
            setHistory(nextHistory);
            historyRef.current = nextHistory;
            setRegionColor(parsed.regionColor);
            setTargetColor(parsed.targetColor);
            setVersion(parsed.version);
            setCompareMode(parsed.compareMode);
            setHydrated(true);
            const ids = draft?.assetIds ?? [];
            if (ids.length > 0) {
                const { records } = await loadToolAssetRecords(ids);
                const record = records[0];
                if (cancelled || !record) return;
                const dataUrl = await imageToDataUrl({ storageKey: record.storageKey, url: record.url });
                if (cancelled || !dataUrl) return;
                const size = await new Promise<{ width: number; height: number }>((resolve) => {
                    const probe = new window.Image();
                    probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
                    probe.onerror = () => resolve({ width: record.width ?? 0, height: record.height ?? 0 });
                    probe.src = dataUrl;
                });
                const restored = { id: record.id, name: record.name, dataUrl, width: size.width, height: size.height };
                imageRef.current = restored;
                setImage(restored);
            }
        })();
        return () => {
            cancelled = true;
            void flushToolDrafts();
        };
    }, [hydrateDraft]);

    /* ---------------- 画布：真实笔画 ---------------- */

    const draw = useCallback((strokes: MaskStroke[]) => {
        const canvas = canvasRef.current;
        const current = imageRef.current;
        if (!canvas || !current) return;
        if (canvas.width !== current.width || canvas.height !== current.height) {
            canvas.width = current.width;
            canvas.height = current.height;
        }
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const stroke of strokes) {
            if (stroke.points.length === 0) continue;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.strokeStyle = stroke.tool === "eraser" ? "rgba(0,0,0,1)" : "rgba(239,68,68,0.45)";
            ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
            ctx.lineWidth = Math.max(1, stroke.size);
            ctx.beginPath();
            ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
            for (const point of stroke.points.slice(1)) ctx.lineTo(point.x, point.y);
            if (stroke.points.length === 1) ctx.lineTo(stroke.points[0].x + 0.01, stroke.points[0].y + 0.01);
            ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";
    }, []);

    useEffect(() => {
        if (!image) return;
        draw(state.strokes);
    }, [image, state.strokes, draw]);

    const applyHistory = (next: MaskHistory) => {
        setHistory(next);
        historyRef.current = next;
        setState((prev) => ({ ...prev, strokes: next.present }));
        stateRef.current = { ...stateRef.current, strokes: next.present };
        persist({ ...stateRef.current, strokes: next.present }, {});
    };

    const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const current = imageRef.current;
        if (!current || busy) return;
        const stroke = beginFixColorStroke(stateRef.current, pointFromEvent(event, current), randomId());
        drawingRef.current = stroke;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        draw([...stateRef.current.strokes, stroke]);
    };

    const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const current = imageRef.current;
        const stroke = drawingRef.current;
        if (!current || !stroke) return;
        const next = extendFixColorStroke(stroke, pointFromEvent(event, current));
        drawingRef.current = next;
        draw([...stateRef.current.strokes, next]);
    };

    const finishStroke = () => {
        const stroke = drawingRef.current;
        drawingRef.current = null;
        if (!stroke) return;
        applyHistory(commitFixColorStroke(historyRef.current, stroke));
    };

    const undo = () => applyHistory(undoFixColorStroke(historyRef.current));
    const redo = () => applyHistory(redoFixColorStroke(historyRef.current));
    const resetMask = () => applyHistory(resetFixColorStrokes(historyRef.current));

    const setBrush = (value: number) => {
        const size = clampFixColorBrush(value);
        setState((prev) => ({ ...prev, brushSize: size }));
        stateRef.current = { ...stateRef.current, brushSize: size };
        persist({ ...stateRef.current, brushSize: size }, {});
    };

    const setToolMode = (tool: "brush" | "eraser") => {
        setState((prev) => ({ ...prev, tool }));
        stateRef.current = { ...stateRef.current, tool };
        persist({ ...stateRef.current, tool }, {});
    };

    /* ---------------- 上传 ---------------- */

    const adoptRecord = useCallback(
        async (record: ToolAssetRecord | null) => {
            if (!record) {
                imageRef.current = null;
                setImage(null);
                return;
            }
            const dataUrl = await imageToDataUrl({ storageKey: record.storageKey, url: record.url });
            if (!dataUrl) {
                setNotice("这张图片的本地数据已不可用，请重新上传");
                return;
            }
            const size = await new Promise<{ width: number; height: number }>((resolve) => {
                const probe = new window.Image();
                probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
                probe.onerror = () => resolve({ width: record.width ?? 0, height: record.height ?? 0 });
                probe.src = dataUrl;
            });
            const next = { id: record.id, name: record.name, dataUrl, width: size.width, height: size.height };
            const issues = validateFixColorSource({
                name: next.name,
                mimeType: record.mimeType,
                bytes: record.bytes,
                width: next.width,
                height: next.height,
            });
            if (issues.length > 0) {
                setNotice(issues[0].message);
                return;
            }
            setNotice(null);
            imageRef.current = next;
            setImage(next);
            persist(stateRef.current, { imageName: next.name });
        },
        [persist],
    );

    /* ---------------- 颜色 ---------------- */

    const colorDelta = useMemo(() => colorDeltaE(regionColor, targetColor), [regionColor, targetColor]);
    const currentSnapshot = useMemo<FixColorSnapshot | null>(() => {
        if (!image) return null;
        return buildFixColorSnapshot({
            imageAssetId: image.id,
            imageName: image.name,
            imageWidth: image.width,
            imageHeight: image.height,
            state,
            regionColor,
            targetColor,
            version,
            clientOperationId: "preview",
        });
    }, [image, state, regionColor, targetColor, version]);
    const stale = runSnapshot ? isFixColorSnapshotStale(runSnapshot, currentSnapshot) : false;
    const view = useMemo(
        () => fixColorResultView({ run, running: busy, sourceUrl: image?.dataUrl, stale }),
        [run, busy, image, stale],
    );

    /* ---------------- 提交 ---------------- */

    const submit = useCallback(async () => {
        const current = imageRef.current;
        if (!current) {
            setNotice("请先上传需要校正的色差图");
            return;
        }
        if (fixColorMaskIsEmpty(stateRef.current)) {
            setNotice("请先涂抹需要校正的色彩区域");
            return;
        }
        setBusy(true);
        setNotice(null);
        try {
            const mask = await exportFixColorMaskPng(stateRef.current, { width: current.width, height: current.height });
            const issues = validateFixColorInput({
                imageUrl: current.dataUrl,
                maskUrl: mask.dataUrl,
                regionColor: regionColorRef.current,
                targetColor: targetColorRef.current,
                version: versionRef.current,
                imageWidth: current.width,
                imageHeight: current.height,
                maskWidth: mask.width,
                maskHeight: mask.height,
            });
            if (issues.length > 0) {
                setNotice(issues[0].message);
                return;
            }
            const snapshot = buildFixColorSnapshot({
                imageAssetId: current.id,
                imageName: current.name,
                imageWidth: current.width,
                imageHeight: current.height,
                state: stateRef.current,
                regionColor: regionColorRef.current,
                targetColor: targetColorRef.current,
                version: versionRef.current,
                maskDataUrl: mask.dataUrl,
                draftRevision: useToolDraftStore.getState().drafts[TOOL_ID]?.revision ?? null,
                clientOperationId: randomId(),
            });
            const unit = buildFixColorUnit({
                snapshot,
                image: toFixColorReference({
                    id: current.id,
                    name: current.name,
                    type: "image/png",
                    dataUrl: current.dataUrl,
                    width: current.width,
                    height: current.height,
                }),
                mask: { id: `${TOOL_ID}-mask`, name: "mask.png", type: "image/png", dataUrl: mask.dataUrl },
            });
            setRunSnapshot(snapshot);
            const port = await createFixColorRunPort();
            const result = await runFixColor({
                unit,
                port,
                draftRevision: snapshot.draftRevision,
                onTask: (next) => setTask(next),
            });
            setRun(result);
            setTask(result.task);
            if (result.status !== "succeeded") {
                setNotice(result.error?.message ?? "上游没有返回可用的修复结果");
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "提交失败，请稍后重试";
            setNotice(message);
        } finally {
            setBusy(false);
        }
    }, []);

    const busyBlocked = busy || !image;

    return (
        <ToolShell
            className={className}
            title={spec?.title ?? "色差修复"}
            subtitle="涂抹偏色区域，指定目标色，按真实图像模型完成校正"
            badges={<span className="text-[11px] text-muted-foreground">智能修图 · 单图输出</span>}
            breadcrumb={<span className="text-[11px] text-muted-foreground">智能修图 / 色差修复</span>}
            sidebar={
                <nav className="flex flex-col gap-1 p-2 text-xs">
                    <span className="px-2 py-1 font-medium text-foreground">修复</span>
                    {siblings.map((tool) => (
                        <Link
                            key={tool.id}
                            to={tool.route}
                            className="rounded px-2 py-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                        >
                            {tool.title}
                        </Link>
                    ))}
                </nav>
            }
        >
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="flex min-w-0 flex-col gap-3">
                    <section className="rounded-lg border border-border bg-card p-3">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-sm font-medium">色差源图</h2>
                            {image ? (
                                <button
                                    type="button"
                                    data-testid="fix-color-reset-image"
                                    className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                                    onClick={() => {
                                        imageRef.current = null;
                                        setImage(null);
                                        setRun(null);
                                        setTask(null);
                                    }}
                                >
                                    更换图片
                                </button>
                            ) : null}
                        </div>
                        <ToolAssetInput
                            toolId={TOOL_ID}
                            maxCount={1}
                            title="上传色差图"
                            disabled={busy}
                            onChange={(_ids, records) => {
                                void adoptRecord(records[0] ?? null);
                            }}
                        />
                        {image ? (
                            <p className="mt-2 text-[11px] text-muted-foreground">
                                {image.name} · {image.width}×{image.height}
                            </p>
                        ) : null}
                    </section>

                    <section className="rounded-lg border border-border bg-card p-3" data-testid="fix-color-mask-panel">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                                <button
                                    type="button"
                                    aria-pressed={state.tool === "brush"}
                                    onClick={() => setToolMode("brush")}
                                    className={cn(
                                        "rounded px-2 py-1 text-[11px] transition",
                                        state.tool === "brush" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    画笔
                                </button>
                                <button
                                    type="button"
                                    aria-pressed={state.tool === "eraser"}
                                    onClick={() => setToolMode("eraser")}
                                    className={cn(
                                        "rounded px-2 py-1 text-[11px] transition",
                                        state.tool === "eraser" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    橡皮
                                </button>
                            </div>
                            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                笔刷
                                <input
                                    type="range"
                                    min={FIX_COLOR_BRUSH_MIN}
                                    max={FIX_COLOR_BRUSH_MAX}
                                    value={state.brushSize}
                                    onChange={(event) => setBrush(Number(event.target.value))}
                                    className="w-28"
                                    aria-label="笔刷大小"
                                />
                                <span className="tabular-nums text-foreground">{state.brushSize}px</span>
                            </label>
                            <div className="flex items-center gap-1">
                                {FIX_COLOR_BRUSH_PRESETS.map((preset) => (
                                    <button
                                        key={preset}
                                        type="button"
                                        onClick={() => setBrush(preset)}
                                        className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
                                    >
                                        {preset}
                                    </button>
                                ))}
                            </div>
                            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                羽化
                                <input
                                    type="range"
                                    min={0}
                                    max={30}
                                    value={state.feather}
                                    onChange={(event) => {
                                        const feather = clampFixColorFeather(Number(event.target.value));
                                        setState((prev) => ({ ...prev, feather }));
                                        stateRef.current = { ...stateRef.current, feather };
                                        persist({ ...stateRef.current, feather }, {});
                                    }}
                                    className="w-20"
                                    aria-label="羽化"
                                />
                            </label>
                            <div className="ml-auto flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={undo}
                                    disabled={history.past.length === 0}
                                    className="inline-flex size-7 items-center justify-center rounded border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40"
                                    aria-label="撤销"
                                >
                                    <Undo2 className="size-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={redo}
                                    disabled={history.future.length === 0}
                                    className="inline-flex size-7 items-center justify-center rounded border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40"
                                    aria-label="重做"
                                >
                                    <Redo2 className="size-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={resetMask}
                                    className="inline-flex size-7 items-center justify-center rounded border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
                                    aria-label="清空涂抹"
                                >
                                    <RotateCcw className="size-3.5" />
                                </button>
                                <span className="ml-1 text-[11px] text-muted-foreground">
                                    已涂 {fixColorHistoryState(history).strokeCount} 笔
                                </span>
                            </div>
                        </div>

                        <div className="mt-3 rounded-md border border-dashed border-border bg-muted/30 p-2">
                            {image ? (
                                <div className="relative mx-auto w-fit max-w-full">
                                    <img src={image.dataUrl} alt="色差源图" className="block max-h-[62vh] w-auto max-w-full select-none" draggable={false} />
                                    <canvas
                                        ref={canvasRef}
                                        data-testid="fix-color-mask-canvas"
                                        className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                                        onPointerDown={onPointerDown}
                                        onPointerMove={onPointerMove}
                                        onPointerUp={finishStroke}
                                        onPointerCancel={finishStroke}
                                        onPointerLeave={finishStroke}
                                    />
                                </div>
                            ) : (
                                <p className="py-10 text-center text-xs text-muted-foreground">先上传色差图，再在图中涂抹需要校正的区域</p>
                            )}
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground" data-testid="fix-color-coverage">
                            {describeFixColorCoverage(state)} · 覆盖率 {Math.round(fixColorCoverage(state) * 100)}%
                        </p>
                    </section>

                    {view.imageUrl ? (
                        <section className="rounded-lg border border-border bg-card p-3">
                            <h2 className="text-sm font-medium">结果对比</h2>
                            {stale ? (
                                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">参数已改动，下面这张图来自旧版本，请重新提交。</p>
                            ) : null}
                            <div className="mt-2 flex items-center gap-2">
                                {FIX_COLOR_COMPARE_MODES.map((mode) => (
                                    <button
                                        key={mode.id}
                                        type="button"
                                        aria-pressed={compareMode === mode.id}
                                        onClick={() => {
                                            setCompareMode(mode.id);
                                            compareModeRef.current = mode.id;
                                            persist(stateRef.current, { compareMode: mode.id });
                                        }}
                                        className={cn(
                                            "rounded border px-2 py-1 text-[11px] transition",
                                            compareMode === mode.id
                                                ? "border-primary bg-accent text-foreground"
                                                : "border-border text-muted-foreground hover:text-foreground",
                                        )}
                                    >
                                        {mode.label}
                                    </button>
                                ))}
                            </div>
                            <div className="relative mt-2 overflow-hidden rounded-md border border-border">
                                <img src={view.imageUrl} alt="校正结果" className="block w-full" />
                                {compareMode === "slide" && view.sourceUrl ? (
                                    <>
                                        <div className="absolute inset-0 overflow-hidden" style={{ width: `${split}%` }}>
                                            <img src={view.sourceUrl} alt="原图" className="block h-full w-full object-cover" />
                                        </div>
                                        <div className="absolute inset-y-0 w-px bg-white/80" style={{ left: `${split}%` }} />
                                    </>
                                ) : null}
                            </div>
                            {compareMode === "slide" ? (
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={split}
                                    onChange={(event) => setSplit(clampCompareSplit(Number(event.target.value)))}
                                    className="mt-2 w-full"
                                    aria-label="对比分割线"
                                />
                            ) : null}
                        </section>
                    ) : null}
                </div>

                <aside className="flex min-w-0 flex-col gap-3">
                    <section className="rounded-lg border border-border bg-card p-3" data-testid="fix-color-color-panel">
                        <h2 className="text-sm font-medium">颜色</h2>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                            区域色 = 图上被判定偏色的颜色（fixColorSegUrl）；目标色 = 校正后应达到的颜色（fixColorUrl）。
                        </p>
                        <div className="mt-3 flex flex-col gap-3">
                            <ColorField
                                label="区域颜色"
                                value={regionColor}
                                disabled={busy}
                                onChange={(next) => {
                                    setRegionColor(next);
                                    regionColorRef.current = next;
                                    persist(stateRef.current, { regionColor: next });
                                }}
                            />
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] text-muted-foreground">
                                    色差 {describeColorDelta(colorDelta)}
                                </span>
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
                                    onClick={() => {
                                        const nextRegion = targetColor;
                                        const nextTarget = regionColor;
                                        setRegionColor(nextRegion);
                                        setTargetColor(nextTarget);
                                        regionColorRef.current = nextRegion;
                                        targetColorRef.current = nextTarget;
                                        persist(stateRef.current, { regionColor: nextRegion, targetColor: nextTarget });
                                    }}
                                >
                                    <ArrowLeftRight className="size-3" />
                                    交换
                                </button>
                            </div>
                            <ColorField
                                label="目标颜色"
                                value={targetColor}
                                disabled={busy}
                                onChange={(next) => {
                                    setTargetColor(next);
                                    targetColorRef.current = next;
                                    persist(stateRef.current, { targetColor: next });
                                }}
                            />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-1">
                            {FIX_COLOR_PALETTE.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    title={color}
                                    aria-label={`取色 ${color}`}
                                    onClick={() => {
                                        setTargetColor(color);
                                        targetColorRef.current = color;
                                        persist(stateRef.current, { targetColor: color });
                                    }}
                                    className="size-5 rounded border border-border"
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                            <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Pipette className="size-3" />
                                点色块设为目标色
                            </span>
                        </div>
                    </section>

                    <section className="rounded-lg border border-border bg-card p-3">
                        <h2 className="text-sm font-medium">修复版本</h2>
                        <div className="mt-2 flex flex-col gap-1">
                            {FIX_COLOR_VERSIONS.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    aria-pressed={version === item.id}
                                    onClick={() => {
                                        setVersion(item.id);
                                        versionRef.current = item.id;
                                        persist(stateRef.current, { version: item.id });
                                    }}
                                    className={cn(
                                        "rounded border px-2 py-1.5 text-left transition",
                                        version === item.id
                                            ? "border-primary bg-accent"
                                            : "border-border hover:bg-accent/60",
                                    )}
                                >
                                    <span className="block text-xs text-foreground">{item.label}</span>
                                    <span className="mt-0.5 block text-[11px] text-muted-foreground">{item.hint}</span>
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-lg border border-border bg-card p-3">
                        <button
                            type="button"
                            data-testid="fix-color-submit"
                            disabled={busyBlocked}
                            onClick={() => void submit()}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                        >
                            <Sparkles className="size-4" />
                            {busy ? "修复中…" : "开始修复"}
                        </button>
                        {notice ? (
                            <p className="mt-2 text-[11px] text-red-600 dark:text-red-400" data-testid="fix-color-notice">
                                {notice}
                            </p>
                        ) : null}
                        {!hydrated ? <p className="mt-2 text-[11px] text-muted-foreground">正在恢复上次的草稿…</p> : null}
                        <p className="mt-2 text-[11px] text-muted-foreground">
                            提交会真实调用当前图像模型；未返回图片即判失败，不会用占位图代替。
                        </p>
                    </section>

                    <ToolResult
                        task={task}
                        toolId={TOOL_ID}
                        title="色差修复结果"
                        onRetry={() => void submit()}
                    />
                </aside>
            </div>
        </ToolShell>
    );
}

/** 颜色输入：色板 + hex 文本双通道，非法输入即时提示，不静默改写。 */
function ColorField({
    label,
    value,
    disabled,
    onChange,
}: {
    label: string;
    value: string;
    disabled?: boolean;
    onChange: (next: string) => void;
}) {
    const [draft, setDraft] = useState(value);
    useEffect(() => setDraft(value), [value]);
    const parsed = normalizeColorHex(value);
    return (
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            {label}
            <div className="flex items-center gap-2">
                <input
                    type="color"
                    value={parsed ? parsed.hex.slice(0, 7) : "#000000"}
                    disabled={disabled}
                    onChange={(event) => onChange(formatColorInput(event.target.value))}
                    className="size-8 cursor-pointer rounded border border-border bg-transparent p-0.5"
                    aria-label={`${label}取色器`}
                />
                <input
                    type="text"
                    value={draft}
                    disabled={disabled}
                    spellCheck={false}
                    onChange={(event) => {
                        const next = event.target.value;
                        setDraft(next);
                        if (normalizeColorHex(next)) onChange(formatColorInput(next));
                    }}
                    onBlur={() => setDraft(value)}
                    className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
                    aria-label={`${label}十六进制`}
                />
            </div>
            {normalizeColorHex(draft) ? null : (
                <span className="text-[11px] text-red-600 dark:text-red-400">需要 #RRGGBB 或 #RRGGBBAA</span>
            )}
        </label>
    );
}

/**
 * TASK-021：「手部修复」HAND_REPAIR 工作区（layout = repair）。
 *
 * 真实边界（与 registry/adapters 一致，不接受演示成功）：
 *  - 修复区域来自画布上真实涂抹的笔画，提交时导出与原图同尺寸的 PNG 蒙版；
 *  - 人物类型（成年男性/成年女性/男孩/女孩）与生成张数写进任务快照，不自由拼 prompt；
 *  - 无蒙版 / 无源图 → 提交按钮 disabled 且控件旁说明原因，不发缺参请求；
 *  - 结果只来自上游返回，handRepairResultView 判定部分失败/过期，绝不补造图片；
 *  - 原站已把本工具归入「即将下架」，页面照实标注证据，但工作区与真实链路仍然可用。
 *
 * 规格：docs/V1.0/plan_linkfox_navigation/page-specs/14-hand-repair.md
 */
export function HandRepairWorkspace({ className }: RepairWorkspaceProps = {}) {
    const spec = getToolById(HAND_REPAIR_TOOL_ID);
    const patchDraft = useToolDraftStore((store) => store.patch);
    const hydrateDraft = useToolDraftStore((store) => store.hydrate);

    const [image, setImage] = useState<UploadedImage | null>(null);
    const imageRef = useRef<UploadedImage | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawingRef = useRef<MaskStroke | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const [state, setState] = useState<HandRepairState>(() => createHandRepairState());
    const stateRef = useRef<HandRepairState>(state);
    const [history, setHistory] = useState<MaskHistory>(() => createHandRepairHistory([]));
    const historyRef = useRef<MaskHistory>(history);
    const [hydrated, setHydrated] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [outcomes, setOutcomes] = useState<HandRepairUnitOutcome[]>([]);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [runSnapshot, setRunSnapshot] = useState<HandRepairSnapshot | null>(null);

    const commitState = useCallback(
        (next: HandRepairState, asset: UploadedImage | null) => {
            stateRef.current = next;
            setState(next);
            patchDraft(HAND_REPAIR_TOOL_ID, {
                values: serializeHandRepairDraftValues({ state: next, imageName: asset?.name ?? "" }),
                assetIds: asset ? [asset.id] : [],
            });
        },
        [patchDraft],
    );

    /* ---------------- 恢复草稿 ---------------- */

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const draft = await hydrateDraft(HAND_REPAIR_TOOL_ID);
            if (cancelled) return;
            const parsed = parseHandRepairDraftValues(draft?.values ?? {});
            stateRef.current = parsed.state;
            setState(parsed.state);
            const nextHistory = createHandRepairHistory(parsed.state.strokes);
            historyRef.current = nextHistory;
            setHistory(nextHistory);
            setHydrated(true);
            const ids = draft?.assetIds ?? [];
            if (ids.length === 0) return;
            const { records } = await loadToolAssetRecords(ids);
            const record = records[0];
            if (cancelled || !record) return;
            const dataUrl = await imageToDataUrl({ storageKey: record.storageKey, url: record.url });
            if (cancelled || !dataUrl) return;
            const restored: UploadedImage = {
                id: record.id,
                name: record.name,
                dataUrl,
                width: record.width ?? 0,
                height: record.height ?? 0,
            };
            imageRef.current = restored;
            setImage(restored);
        })();
        return () => {
            cancelled = true;
            void flushToolDrafts();
        };
    }, [hydrateDraft]);

    /* ---------------- 画布：真实笔画（归一化坐标） ---------------- */

    const draw = useCallback((strokes: MaskStroke[]) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(239, 68, 68, 0.45)";
        ctx.fillStyle = "rgba(239, 68, 68, 0.45)";
        const current = imageRef.current;
        const scale = current && current.width > 0 ? canvas.width / current.width : 1;
        for (const stroke of strokes) {
            if (stroke.points.length === 0) continue;
            ctx.lineWidth = Math.max(1, stroke.size * scale);
            ctx.beginPath();
            ctx.moveTo(stroke.points[0]!.x * canvas.width, stroke.points[0]!.y * canvas.height);
            if (stroke.points.length === 1) {
                ctx.arc(stroke.points[0]!.x * canvas.width, stroke.points[0]!.y * canvas.height, Math.max(1, (stroke.size * scale) / 2), 0, Math.PI * 2);
                ctx.fill();
                continue;
            }
            for (let i = 1; i < stroke.points.length; i += 1) {
                ctx.lineTo(stroke.points[i]!.x * canvas.width, stroke.points[i]!.y * canvas.height);
            }
            ctx.stroke();
        }
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        const current = image;
        if (!canvas || !current) return;
        const longest = Math.max(current.width, current.height);
        const ratio = longest > 1400 ? 1400 / longest : 1;
        canvas.width = Math.max(1, Math.round(current.width * ratio));
        canvas.height = Math.max(1, Math.round(current.height * ratio));
        draw(state.strokes);
    }, [image, state.strokes, draw]);

    const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left) / Math.max(1, rect.width),
            y: (event.clientY - rect.top) / Math.max(1, rect.height),
        };
    };

    const applyHistory = (next: MaskHistory) => {
        historyRef.current = next;
        setHistory(next);
        commitState({ ...stateRef.current, strokes: next.present }, imageRef.current);
    };

    const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!imageRef.current || busy) return;
        const stroke = beginHandRepairStroke(stateRef.current, pointFromEvent(event), randomId());
        drawingRef.current = stroke;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        draw([...historyRef.current.present, stroke]);
    };

    const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const stroke = drawingRef.current;
        if (!stroke) return;
        const next = extendHandRepairStroke(stroke, pointFromEvent(event));
        drawingRef.current = next;
        draw([...historyRef.current.present, next]);
    };

    const finishStroke = () => {
        const stroke = drawingRef.current;
        drawingRef.current = null;
        if (!stroke) return;
        applyHistory(commitHandRepairStroke(historyRef.current, stroke));
    };

    const undo = () => applyHistory(undoHandRepairStroke(historyRef.current));
    const redo = () => applyHistory(redoHandRepairStroke(historyRef.current));
    const resetMask = () => applyHistory(resetHandRepairStrokes(historyRef.current));

    const historyState = handRepairHistoryState(history);
    const maskEmpty = useMemo(() => handRepairMaskIsEmpty(state), [state]);
    const coverageLabel = useMemo(() => describeHandRepairCoverage(state), [state]);

    /* ---------------- 换图 / 上传 ---------------- */

    const adoptImage = useCallback(
        async (record: ToolAssetRecord) => {
            const dataUrl = await imageToDataUrl({ storageKey: record.storageKey, url: record.url });
            if (!dataUrl) {
                setNotice("这张图片的本地数据已不可用，请重新上传");
                return;
            }
            const size = await new Promise<{ width: number; height: number }>((resolve) => {
                const probe = new window.Image();
                probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
                probe.onerror = () => resolve({ width: record.width ?? 0, height: record.height ?? 0 });
                probe.src = dataUrl;
            });
            if (!size.width || !size.height) {
                setNotice("无法读取图片尺寸，请换一张图片");
                return;
            }
            const issues = validateHandRepairSource({ name: record.name, mimeType: record.mimeType, bytes: record.bytes, width: size.width, height: size.height });
            if (issues.length > 0) {
                setNotice(issues.map((issue) => issue.message).join("；"));
                return;
            }
            // 换图必须清空蒙版：旧笔画坐标属于上一张图（规格 §3）。
            const nextImage: UploadedImage = { id: record.id, name: record.name, dataUrl, width: size.width, height: size.height };
            imageRef.current = nextImage;
            setImage(nextImage);
            setOutcomes([]);
            setRunSnapshot(null);
            setNotice(null);
            const emptyHistory = resetHandRepairStrokes(createHandRepairHistory([]));
            historyRef.current = emptyHistory;
            setHistory(emptyHistory);
            commitState({ ...stateRef.current, strokes: [] }, nextImage);
        },
        [commitState],
    );

    /* ---------------- 快照 / 结果视图 ---------------- */

    const currentSnapshot = useMemo(() => {
        if (!image) return null;
        return buildHandRepairSnapshot({
            imageAssetId: image.id,
            imageName: image.name,
            imageWidth: image.width,
            imageHeight: image.height,
            state,
            clientOperationId: "preview",
        });
    }, [image, state]);

    const stale = runSnapshot && currentSnapshot ? isHandRepairSnapshotStale(runSnapshot, currentSnapshot) : false;
    const view = useMemo(
        () => handRepairResultView({ outcomes, running: busy, sourceUrl: image?.dataUrl, stale }),
        [outcomes, busy, image, stale],
    );

    /* ---------------- 提交 ---------------- */

    const submit = useCallback(async () => {
        const current = imageRef.current;
        if (!current) {
            setNotice("请先上传需要修复手部的图片");
            return;
        }
        if (handRepairMaskIsEmpty(stateRef.current)) {
            setNotice("请先在图片上涂抹畸形的手部区域，空蒙版无法生成");
            return;
        }
        setBusy(true);
        setNotice(null);
        setOutcomes([]);
        setProgress({ done: 0, total: stateRef.current.outputNum });
        abortRef.current = new AbortController();
        try {
            const mask = await exportHandRepairMaskPng(stateRef.current, { width: current.width, height: current.height });
            const issues = validateHandRepairInput({
                imageUrl: current.dataUrl,
                maskUrl: mask.dataUrl,
                personType: stateRef.current.personType,
                outputNum: stateRef.current.outputNum,
                imageWidth: current.width,
                imageHeight: current.height,
                maskWidth: mask.width,
                maskHeight: mask.height,
            });
            if (issues.length > 0) {
                setNotice(issues.map((issue) => issue.message).join("；"));
                return;
            }
            const snapshot = buildHandRepairSnapshot({
                imageAssetId: current.id,
                imageName: current.name,
                imageWidth: current.width,
                imageHeight: current.height,
                state: stateRef.current,
                maskDataUrl: mask.dataUrl,
                draftRevision: useToolDraftStore.getState().drafts[HAND_REPAIR_TOOL_ID]?.revision ?? null,
                clientOperationId: randomId(),
            });
            const units = buildHandRepairUnits({
                snapshot,
                image: toHandRepairReference({
                    id: current.id,
                    name: current.name,
                    type: "image/png",
                    dataUrl: current.dataUrl,
                    width: current.width,
                    height: current.height,
                }),
                mask: { id: `${HAND_REPAIR_TOOL_ID}-mask`, name: "mask.png", type: "image/png", dataUrl: mask.dataUrl },
            });
            setRunSnapshot(snapshot);
            const port = createHandRepairRunPort();
            const result = await runHandRepairUnits(units, {
                port,
                draftRevision: snapshot.draftRevision,
                signal: abortRef.current.signal,
                onOutcome: (outcome, _unit, done, total) => {
                    setOutcomes((prev) => {
                        const next = [...prev];
                        next[outcome.index - 1] = outcome;
                        return next;
                    });
                    setProgress({ done, total });
                },
            });
            setOutcomes(result);
            const summary = handRepairResultView({ outcomes: result, snapshotHash: handRepairSnapshotHash(snapshot) });
            if (summary.images.length < result.length) {
                setNotice(summary.errors.join("；") || "上游没有返回完整的修复结果");
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "提交失败，请稍后重试";
            setNotice(message);
        } finally {
            setBusy(false);
            setProgress(null);
        }
    }, []);

    const repairSiblings = useMemo(() => toolSpecs.filter((tool) => tool.layout === "repair"), []);
    const personTypes = useMemo(() => handRepairPersonTypeOptions(null), []);
    const submitBlocked = busy || !image || maskEmpty;

    return (
        <div data-testid="hand-repair-workspace" className="h-full min-h-0">
            <ToolShell
                className={className}
                title={spec?.title ?? "手部修复"}
                subtitle="涂抹畸形的手部区域，选择人物类型，按真实图像模型重画"
                badges={
                    <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span
                            data-testid="hand-repair-deprecated"
                            title={HAND_REPAIR_UPSTREAM.note}
                            className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
                        >
                            {HAND_REPAIR_UPSTREAM.badge}
                        </span>
                        <span>智能修图 · 最多 4 张</span>
                    </span>
                }
                breadcrumb={<span className="text-[11px] text-muted-foreground">智能修图 / 手部修复</span>}
                actions={
                    <button
                        type="button"
                        data-testid="hand-repair-submit"
                        disabled={submitBlocked}
                        onClick={() => void submit()}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Sparkles className="size-3.5" aria-hidden />
                        {busy ? (progress ? `生成中 ${progress.done}/${progress.total}` : "生成中…") : "开始生成"}
                    </button>
                }
                notices={
                    <>
                        {notice ? (
                            <p data-testid="hand-repair-notice" className="mb-2 rounded border border-red-300 bg-red-50 px-2 py-1.5 text-[11px] text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                                {notice}
                            </p>
                        ) : null}
                        {!hydrated ? <p className="mb-2 text-[11px] text-muted-foreground">正在恢复上次的草稿…</p> : null}
                    </>
                }
                sidebar={
                    <nav className="flex flex-col gap-0.5 p-2" aria-label="修复工具">
                        {repairSiblings.map((tool) => (
                            <Link
                                key={tool.id}
                                to={tool.route}
                                aria-current={tool.id === HAND_REPAIR_TOOL_ID ? "page" : undefined}
                                className={cn(
                                    "truncate rounded px-2 py-1.5 text-xs",
                                    tool.id === HAND_REPAIR_TOOL_ID ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                                )}
                            >
                                {tool.title}
                            </Link>
                        ))}
                        <Link to={spec?.route ?? HAND_REPAIR_SLUG} className="mt-2 px-2 text-[11px] text-muted-foreground underline-offset-2 hover:underline">
                            返回工具页
                        </Link>
                    </nav>
                }
            >
                <div className="grid min-h-0 gap-3 overflow-y-auto p-3 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="flex min-w-0 flex-col gap-3">
                        <section className="rounded-lg border border-border bg-card p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                                    <Paintbrush className="size-3.5" aria-hidden /> 涂抹手部区域
                                </p>
                                <span data-testid="hand-repair-coverage" className="text-[11px] text-muted-foreground">
                                    {coverageLabel}｜红色覆盖只是预览，导出为白色蒙版
                                </span>
                            </div>
                            <div className="mt-2 rounded-md border border-dashed border-border bg-muted/30 p-2">
                                {image ? (
                                    <div className="relative mx-auto w-fit max-w-full">
                                        <img src={image.dataUrl} alt="待修复原图" className="block max-h-[520px] w-auto max-w-full select-none" draggable={false} />
                                        <canvas
                                            ref={canvasRef}
                                            data-testid="hand-repair-canvas"
                                            aria-label="手部涂抹画布"
                                            onPointerDown={onPointerDown}
                                            onPointerMove={onPointerMove}
                                            onPointerUp={finishStroke}
                                            onPointerCancel={finishStroke}
                                            className="absolute inset-0 size-full cursor-crosshair touch-none"
                                        />
                                    </div>
                                ) : (
                                    <p data-testid="hand-repair-empty-source" className="py-16 text-center text-xs text-muted-foreground">
                                        先上传一张手部畸形的图片，再把畸形的手涂满。
                                    </p>
                                )}
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                    画笔
                                    <input
                                        data-testid="hand-repair-brush"
                                        type="range"
                                        min={HAND_REPAIR_BRUSH_MIN}
                                        max={HAND_REPAIR_BRUSH_MAX}
                                        value={state.brushSize}
                                        disabled={!image || busy}
                                        onChange={(event) => commitState({ ...stateRef.current, brushSize: clampHandRepairBrush(event.target.value) }, imageRef.current)}
                                        className="w-28"
                                    />
                                    <span className="w-8 font-mono text-foreground">{state.brushSize}px</span>
                                </label>
                                {HAND_REPAIR_BRUSH_PRESETS.map((preset) => (
                                    <button
                                        key={preset}
                                        type="button"
                                        disabled={!image || busy}
                                        onClick={() => commitState({ ...stateRef.current, brushSize: clampHandRepairBrush(preset) }, imageRef.current)}
                                        className={cn(
                                            "rounded border border-border px-1.5 py-0.5 text-[11px]",
                                            state.brushSize === preset ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                                        )}
                                    >
                                        {preset}
                                    </button>
                                ))}
                                <span className="mx-1 h-4 w-px bg-border" aria-hidden />
                                <button
                                    type="button"
                                    data-testid="hand-repair-undo"
                                    disabled={!historyState.canUndo || busy}
                                    onClick={undo}
                                    className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent disabled:opacity-40"
                                >
                                    <Undo2 className="size-3" aria-hidden /> 撤销
                                </button>
                                <button
                                    type="button"
                                    data-testid="hand-repair-redo"
                                    disabled={!historyState.canRedo || busy}
                                    onClick={redo}
                                    className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent disabled:opacity-40"
                                >
                                    <Redo2 className="size-3" aria-hidden /> 重做
                                </button>
                                <button
                                    type="button"
                                    data-testid="hand-repair-reset"
                                    disabled={historyState.strokeCount === 0 || busy}
                                    onClick={resetMask}
                                    className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent disabled:opacity-40"
                                >
                                    <RotateCcw className="size-3" aria-hidden /> 重置
                                </button>
                                {maskEmpty ? (
                                    <span data-testid="hand-repair-mask-empty" className="text-[11px] text-amber-700 dark:text-amber-300">
                                        蒙版为空：空蒙版无法生成
                                    </span>
                                ) : null}
                            </div>
                        </section>

                        <section className="rounded-lg border border-border bg-card p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-medium text-foreground">生成结果</p>
                                <span data-testid="hand-repair-summary" className="text-[11px] text-muted-foreground">
                                    {summarizeHandRepairOutcomes(outcomes)}
                                    {stale ? "｜来自旧版本输入" : ""}
                                </span>
                            </div>
                            {view.status === "running" ? (
                                <p className="mt-3 text-[11px] text-muted-foreground">
                                    正在提交真实请求{progress ? `（${progress.done}/${progress.total}）` : ""}…
                                </p>
                            ) : null}
                            {view.images.length > 0 ? (
                                <div data-testid="hand-repair-results" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    {view.images.map((item) => (
                                        <figure key={item.index} className="overflow-hidden rounded border border-border bg-muted/20">
                                            <img src={item.url} alt={`手部修复结果 ${item.index}`} className="block w-full object-contain" />
                                            <figcaption className="flex items-center justify-between px-1.5 py-1 text-[11px] text-muted-foreground">
                                                <span>第 {item.index} 张</span>
                                                <a href={item.url} download={handRepairDownloadName(image?.name ?? "", item.index)} className="underline-offset-2 hover:underline">
                                                    下载
                                                </a>
                                            </figcaption>
                                        </figure>
                                    ))}
                                </div>
                            ) : view.status !== "running" ? (
                                <p className="mt-3 text-[11px] text-muted-foreground">还没有结果。涂好手部并选择人物类型后点「开始生成」。</p>
                            ) : null}
                            {view.errors.length > 0 ? (
                                <ul data-testid="hand-repair-errors" className="mt-2 space-y-1 text-[11px] text-red-700 dark:text-red-300">
                                    {view.errors.map((error) => (
                                        <li key={error}>{error}</li>
                                    ))}
                                </ul>
                            ) : null}
                        </section>
                    </div>

                    <aside className="flex min-w-0 flex-col gap-3">
                        <section className="rounded-lg border border-border bg-card p-3">
                            <p className="text-xs font-medium text-foreground">上传原图</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">JPG / PNG / WebP，手部畸形的原图效果最好。</p>
                            {image ? (
                                <div className="mt-2 flex items-center justify-between gap-2 rounded border border-border bg-muted/30 px-2 py-1.5">
                                    <span className="min-w-0 truncate text-[11px] text-foreground">{image.name}</span>
                                    <ToolAssetInput toolId={HAND_REPAIR_TOOL_ID} maxCount={1} title="更换图片" disabled={busy} onChange={(_ids, records) => { void adoptImage(records[0]!); }} />
                                </div>
                            ) : (
                                <ToolAssetInput toolId={HAND_REPAIR_TOOL_ID} maxCount={1} title="上传图片" disabled={busy} onChange={(_ids, records) => { void adoptImage(records[0]!); }} />
                            )}
                            {image ? <p className="mt-1 text-[11px] text-muted-foreground">换图会清空已涂抹的蒙版。</p> : null}
                        </section>

                        <section className="rounded-lg border border-border bg-card p-3">
                            <p className="text-xs font-medium text-foreground">人物类型</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">用于约束重画的手部结构与年龄性别特征。</p>
                            <div className="mt-2 grid grid-cols-2 gap-1.5">
                                {personTypes.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        data-testid="hand-repair-person-type"
                                        data-value={option.value}
                                        disabled={option.disabled || busy}
                                        aria-pressed={state.personType === option.value}
                                        title={option.reason}
                                        onClick={() => commitState({ ...stateRef.current, personType: option.value }, imageRef.current)}
                                        className={cn(
                                            "rounded border px-2 py-1.5 text-[11px]",
                                            state.personType === option.value ? "border-primary bg-primary/10 font-medium text-foreground" : "border-border text-muted-foreground hover:bg-accent",
                                            option.disabled ? "opacity-40" : "",
                                        )}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-lg border border-border bg-card p-3">
                            <p className="text-xs font-medium text-foreground">生成张数</p>
                            <div className="mt-2 flex items-center gap-1">
                                {HAND_REPAIR_OUTPUT_OPTIONS.map((count) => (
                                    <button
                                        key={count}
                                        type="button"
                                        data-testid="hand-repair-output-num"
                                        data-value={count}
                                        disabled={busy}
                                        aria-pressed={state.outputNum === count}
                                        onClick={() => commitState({ ...stateRef.current, outputNum: count }, imageRef.current)}
                                        className={cn(
                                            "min-w-8 rounded border border-border px-2 py-1 text-[11px]",
                                            state.outputNum === count ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                                        )}
                                    >
                                        {count}
                                    </button>
                                ))}
                            </div>
                            <p data-testid="hand-repair-output-label" className="mt-2 text-[11px] text-muted-foreground">
                                {handRepairOutputLabel(state.outputNum)}（每张都是独立真实请求）
                            </p>
                        </section>

                        <section className="rounded-lg border border-border bg-card p-3">
                            <p className="text-xs font-medium text-foreground">提交前检查</p>
                            <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
                                <li>{image ? "✓" : "·"} 已上传原图</li>
                                <li>{maskEmpty ? "·" : "✓"} 已涂抹手部区域</li>
                                <li>✓ 人物类型：{personTypes.find((option) => option.value === state.personType)?.label ?? state.personType}</li>
                                <li>✓ 生成张数：{state.outputNum}</li>
                            </ul>
                            <p className="mt-2 text-[11px] text-muted-foreground">{HAND_REPAIR_UPSTREAM.note}</p>
                        </section>
                    </aside>
                </div>
            </ToolShell>
        </div>
    );
}


export function RepairWorkspace({ toolId = FIX_COLOR_TOOL_ID, className }: RepairWorkspaceProps = {}) {
    if (toolId === FIX_COLOR_TOOL_ID) return <FixColorWorkspace className={className} />;
    if (toolId === HAND_REPAIR_TOOL_ID) return <HandRepairWorkspace className={className} />;
    const spec = getToolById(toolId);
    return (
        <div className={cn("mx-auto max-w-2xl p-6 text-sm", className)}>
            <h1 className="text-base font-medium">{spec?.title ?? toolId}</h1>
            <p className="mt-2 text-muted-foreground">
                「{spec?.title ?? toolId}」的修复工作区尚未接入，本页不会用通用占位卡片冒充可用。
            </p>
            <Link to={spec?.route ?? FIX_COLOR_SLUG} className="mt-3 inline-block text-xs underline-offset-2 hover:underline">
                返回工具页
            </Link>
        </div>
    );
}

export default RepairWorkspace;
