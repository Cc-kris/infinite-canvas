/**
 * TASK-020：「印花修复」PRINTING_REPAIR 工作区（layout = repair）。
 *
 * 真实边界（与 registry/adapters 一致，不接受演示成功）：
 *  - 三步真实链路：Step1 印花有误的商品图 → Step2 正确印花 → Step3 在商品图上定位印花；
 *  - 提交时本机对印花做真实像素分割（`derivePrintSegPng`）得到分割图，与两张原图一起发出；
 *  - 结果只来自上游返回，`printingRepairResultView` 判空即失败，绝不补造图片；
 *  - 当前配置一变即把旧结果标记「来自旧版本」，不冒充当前结果。
 *
 * 与 TASK-019（FIX_COLOR）共用 `workspaces/repair.tsx` 的调度约定：本文件导出独立的
 * `PrintingRepairWorkspace`，装配方只需 `toolId === "PRINTING_REPAIR"` 时渲染它。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CircleAlert, Download, Loader2, Move, Redo2, RotateCcw, RotateCw, Sparkles, TriangleAlert, Undo2, ZoomIn, ZoomOut } from "lucide-react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolShell } from "@/components/tools/tool-shell";
import { OrigRail, SMART_EDIT_RAIL } from "@/components/tools/workspaces/orig-rail";
import { saveResultItemToAssets, sendResultItemToCanvas } from "@/components/tools/tool-result-actions";
import { cn, randomId } from "@/lib/utils";
import type { ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";

import {
    buildPrintingRepairUnit,
    createPrintingRepairRunPort,
    derivePrintSegPng,
    printingRepairPreflightIssues,
    printingRepairResultView,
    printingRepairRunFromStoredTask,
    latestPrintingRepairTask,
    retryPrintingRepair,
    runPrintingRepair,
    toPrintingRepairReference,
    type PrintSegResult,
    type PrintingRepairRun,
} from "@/features/tools/adapters/printing-repair";
import {
    PRINTING_REPAIR_COMPARE_MODES,
    PRINTING_REPAIR_DEFAULT_VERSION,
    PRINTING_REPAIR_ROTATE,
    PRINTING_REPAIR_ROTATE_PRESETS,
    PRINTING_REPAIR_SCALE,
    PRINTING_REPAIR_SCALE_PRESETS,
    PRINTING_REPAIR_STEPS,
    PRINTING_REPAIR_STRENGTH,
    PRINTING_REPAIR_TOOL_ID,
    PRINTING_REPAIR_UPLOAD_LABEL,
    PRINTING_REPAIR_UPLOAD_LIMITS,
    PRINTING_REPAIR_VERSION_OPTIONS,
    buildPrintingRepairSnapshot,
    canRedoPrintTransform,
    canUndoPrintTransform,
    clampRotate,
    clampScale,
    clampStrength,
    compareModeLabel,
    compareRegion,
    commitPrintTransform,
    createPrintingRepairTransform,
    createPrintTransformHistory,
    describePrintTransform,
    getPrintingRepairSpec,
    isPrintingRepairSnapshotStale,
    movePrint,
    nudgePrint,
    parsePrintingRepairDraftValues,
    printCoverage,
    printHistoryLabel,
    printingRepairDownloadName,
    printingRepairSnapshotHash,
    redoPrintTransform,
    resetPrintTransform,
    rotatePrint,
    scalePrint,
    serializePrintingRepairDraftValues,
    stepPrintRotate,
    stepPrintScale,
    undoPrintTransform,
    validatePrintingRepairFile,
    validatePrintingRepairInput,
    type PrintingRepairCompareMode,
    type PrintingRepairDraftValues,
    type PrintingRepairHistory,
    type PrintingRepairRegion,
    type PrintingRepairSnapshot,
    type PrintingRepairTransform,
    type PrintingRepairVersion,
} from "@/features/tools/registry/printing-repair";

/* ------------------------------------------------------------------ *
 * 草稿槽位：两个上传器各自独立落盘，互不覆盖 `assetIds`
 * ------------------------------------------------------------------ */

const BASE_SLOT_ID = `${PRINTING_REPAIR_TOOL_ID}:base`;
const PRINT_SLOT_ID = `${PRINTING_REPAIR_TOOL_ID}:print`;

const UPLOAD_CONSTRAINTS = {
    formats: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
    maxBytes: PRINTING_REPAIR_UPLOAD_LIMITS.maxBytes,
};

export type PrintingRepairWorkspaceProps = { className?: string };

type SegState =
    | { status: "idle" }
    | { status: "working" }
    | { status: "ready"; result: PrintSegResult }
    | { status: "failed"; message: string };

/** 对比滑块的 0–1 归一化钳制（registry 的 clampSplit01 用百分数域，这里单独一套）。 */
function clampSplit01(value: number): number {
    if (!Number.isFinite(value)) return 0.5;
    return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

function percent(value: number, digits = 0) {
    return `${(value * 100).toFixed(digits)}%`;
}

/**
 * 结果动作条：下载（原站 1:1）+ 存入资产库 + 发送画布。
 *
 * 与 HAND_REPAIR / AREA_REPAIR 的结果动作一致：只有真实结果存在时才渲染；动作本身走
 * `tool-result-actions` 的真实副作用（上传到图片存储 + 资产库 / 画布节点），不在这里造数据。
 */
export type PrintingRepairResultActionsProps = {
    imageUrl: string;
    imageName?: string;
    pending?: boolean;
    notice?: string | null;
    onSave?: () => void;
    onSend?: () => void;
};

export function PrintingRepairResultActions({ imageUrl, imageName = "", pending = false, notice = null, onSave, onSend }: PrintingRepairResultActionsProps) {
    return (
        <div className="space-y-1">
            <span className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <button
                    type="button"
                    data-testid="printing-repair-save"
                    disabled={pending || !onSave}
                    onClick={() => onSave?.()}
                    className="underline-offset-2 hover:underline disabled:opacity-50"
                >
                    存入资产
                </button>
                <button
                    type="button"
                    data-testid="printing-repair-send"
                    disabled={pending || !onSend}
                    onClick={() => onSend?.()}
                    className="underline-offset-2 hover:underline disabled:opacity-50"
                >
                    发送画布
                </button>
                <a
                    href={imageUrl}
                    download={printingRepairDownloadName(imageName)}
                    data-testid="printing-repair-download"
                    className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                >
                    <Download aria-hidden="true" className="size-3.5" />
                    下载结果
                </a>
            </span>
            {notice ? (
                <p data-testid="printing-repair-result-feedback" className="text-[11px] text-muted-foreground">
                    {notice}
                </p>
            ) : null}
        </div>
    );
}

function StepBadge({ index, active }: { index: number; active: boolean }) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold",
                active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
            )}
        >
            {index}
        </span>
    );
}

function StepCard({
    step,
    title,
    hint,
    active,
    done,
    className,
    children,
}: {
    step: number;
    title: string;
    hint?: string;
    active: boolean;
    done: boolean;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <section
            data-testid={`printing-repair-step-${step}`}
            data-state={done ? "done" : active ? "active" : "pending"}
            className={cn("rounded-2xl border bg-card p-4", active ? "border-primary/60" : "border-border", className)}
        >
            <header className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold">{title}</h2>
                    {hint ? <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{hint}</p> : null}
                </div>
                {done ? <span className="text-[11px] text-emerald-600">已完成</span> : null}
            </header>
            <div className="mt-3">{children}</div>
        </section>
    );
}

function IssueList({ issues, testId = "printing-repair-issues" }: { issues: string[]; testId?: string }) {
    if (!issues.length) return null;
    return (
        <ul data-testid={testId} className="space-y-1 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            {issues.map((issue) => (
                <li key={issue} className="flex items-start gap-1.5">
                    <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                    <span>{issue}</span>
                </li>
            ))}
        </ul>
    );
}

/**
 * Step 3 画布：底图在底层，印花层按归一化中心点/缩放/旋转叠在上面，只有印花层可拖动。
 * 坐标全部归一化（0..1），因此与图片真实像素尺寸解耦。
 */
function PrintStage({
    baseUrl,
    printUrl,
    transform,
    disabled,
    onDrag,
    onWheelScale,
    onKeyNudge,
}: {
    baseUrl: string;
    printUrl: string;
    transform: PrintingRepairTransform;
    disabled: boolean;
    onDrag: (delta: { dx: number; dy: number }) => void;
    onWheelScale: (direction: "in" | "out") => void;
    onKeyNudge: (direction: "left" | "right" | "up" | "down", fast: boolean) => void;
}) {
    const stageRef = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef<{ x: number; y: number } | null>(null);
    const [dragging, setDragging] = useState(false);

    const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        if (disabled) return;
        dragRef.current = { x: event.clientX, y: event.clientY };
        setDragging(true);
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        const start = dragRef.current;
        const box = stageRef.current?.getBoundingClientRect();
        if (!start || !box || !box.width || !box.height) return;
        const dx = (event.clientX - start.x) / box.width;
        const dy = (event.clientY - start.y) / box.height;
        dragRef.current = { x: event.clientX, y: event.clientY };
        if (dx || dy) onDrag({ dx, dy });
    };

    const endDrag = () => {
        dragRef.current = null;
        setDragging(false);
    };

    const layerStyle = {
        left: `${transform.point.x * 100}%`,
        top: `${transform.point.y * 100}%`,
        transform: `translate(-50%, -50%) rotate(${transform.rotate}deg) scale(${transform.scale})`,
    } as const;

    return (
        <div
            ref={stageRef}
            data-testid="printing-repair-stage"
            tabIndex={0}
            role="application"
            aria-label="印花定位画布：方向键微调，Shift 加速，滚轮缩放"
            className={cn(
                "relative aspect-square w-full select-none overflow-hidden rounded-xl border border-border bg-[repeating-conic-gradient(#f4f4f5_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px] outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                disabled && "opacity-70",
            )}
            onWheel={(event) => {
                if (disabled) return;
                event.preventDefault();
                onWheelScale(event.deltaY > 0 ? "out" : "in");
            }}
            onKeyDown={(event) => {
                if (disabled) return;
                const fast = event.shiftKey;
                const map: Record<string, "left" | "right" | "up" | "down"> = {
                    ArrowLeft: "left",
                    ArrowRight: "right",
                    ArrowUp: "up",
                    ArrowDown: "down",
                };
                const direction = map[event.key];
                if (!direction) return;
                event.preventDefault();
                onKeyNudge(direction, fast);
            }}
        >
            <img src={baseUrl} alt="印花有误的商品图" data-testid="printing-repair-base-image" className="pointer-events-none absolute inset-0 size-full object-contain" draggable={false} />
            <div
                data-testid="printing-repair-print-layer"
                data-dragging={dragging ? "true" : "false"}
                className={cn("absolute max-w-none cursor-grab active:cursor-grabbing", dragging && "cursor-grabbing")}
                style={layerStyle}
                onPointerDown={startDrag}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
            >
                <img src={printUrl} alt="正确印花图层" className="size-full max-h-[45vw] object-contain drop-shadow" draggable={false} />
                <span className="pointer-events-none absolute inset-0 rounded border border-dashed border-primary/70" aria-hidden="true" />
            </div>
        </div>
    );
}

function RegionCompare({
    baseUrl,
    resultUrl,
    split,
    mode,
    region,
    onSplit,
}: {
    baseUrl: string;
    resultUrl: string;
    split: number;
    mode: PrintingRepairCompareMode;
    region?: PrintingRepairRegion;
    onSplit: (next: number) => void;
}) {
    if (mode === "region") {
        const factor = region && region.width > 0 ? 1 / region.width : 1;
        const originX = region ? (region.x + region.width / 2) * 100 : 50;
        const originY = region ? (region.y + region.height / 2) * 100 : 50;
        const zoomStyle = { transform: `scale(${factor.toFixed(3)})`, transformOrigin: `${originX.toFixed(2)}% ${originY.toFixed(2)}%` } as const;
        return (
            <div data-testid="printing-repair-compare" data-mode="region" className="space-y-2">
                <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
                    <img src={baseUrl} alt="修复前（局部放大）" className="absolute inset-0 size-full object-contain" style={zoomStyle} />
                    <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 0 0 ${(split * 100).toFixed(2)}%)` }}>
                        <img src={resultUrl} alt="修复后（局部放大）" className="absolute inset-0 size-full object-contain" style={zoomStyle} />
                    </div>
                    <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary" style={{ left: `${(split * 100).toFixed(2)}%` }} aria-hidden="true" />
                </div>
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="shrink-0">局部对比 · {factor.toFixed(0)}×</span>
                    <input
                        data-testid="printing-repair-split"
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(split * 100)}
                        onChange={(event) => onSplit(clampSplit01(Number(event.target.value) / 100))}
                        className="w-full accent-primary"
                    />
                </label>
            </div>
        );
    }
    if (mode === "side-by-side") {
        return (
            <div data-testid="printing-repair-compare" data-mode="side-by-side" className="grid gap-2 sm:grid-cols-2">
                <figure className="overflow-hidden rounded-xl border border-border">
                    <img src={baseUrl} alt="修复前" className="w-full object-contain" />
                    <figcaption className="border-t border-border px-3 py-1 text-[11px] text-muted-foreground">修复前</figcaption>
                </figure>
                <figure className="overflow-hidden rounded-xl border border-border">
                    <img src={resultUrl} alt="修复后" className="w-full object-contain" />
                    <figcaption className="border-t border-border px-3 py-1 text-[11px] text-muted-foreground">修复后</figcaption>
                </figure>
            </div>
        );
    }
    return (
        <div data-testid="printing-repair-compare" data-mode="slider" className="space-y-2">
            <div className="relative overflow-hidden rounded-xl border border-border">
                <img src={baseUrl} alt="修复前" className="block w-full object-contain" />
                <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 0 0 ${(split * 100).toFixed(2)}%)` }}>
                    <img src={resultUrl} alt="修复后" className="block w-full object-contain" />
                </div>
                <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary" style={{ left: `${(split * 100).toFixed(2)}%` }} aria-hidden="true" />
            </div>
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="shrink-0">滑动对比</span>
                <input
                    data-testid="printing-repair-split"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(split * 100)}
                    onChange={(event) => onSplit(clampSplit01(Number(event.target.value) / 100))}
                    className="w-full accent-primary"
                />
                <span className="w-10 shrink-0 text-right tabular-nums">{percent(split, 0)}</span>
            </label>
        </div>
    );
}

/* ------------------------------------------------------------------ *
 * 主工作区
 * ------------------------------------------------------------------ */

export function PrintingRepairWorkspace({ className }: PrintingRepairWorkspaceProps = {}) {
    const spec = useMemo(() => getPrintingRepairSpec(), []);
    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);

    const [draftReady, setDraftReady] = useState(false);
    const [base, setBase] = useState<ToolAssetRecord | null>(null);
    const [print, setPrint] = useState<ToolAssetRecord | null>(null);
    const [history, setHistory] = useState<PrintingRepairHistory>(() => createPrintTransformHistory());
    const [strength, setStrength] = useState<number>(PRINTING_REPAIR_STRENGTH.defaultValue);
    const [version, setVersion] = useState<PrintingRepairVersion>(PRINTING_REPAIR_DEFAULT_VERSION);
    const [compareMode, setCompareMode] = useState<PrintingRepairCompareMode>("region");
    const [split, setSplit] = useState(0.5);
    const [seg, setSeg] = useState<SegState>({ status: "idle" });
    const [run, setRun] = useState<PrintingRepairRun | null>(null);
    const [running, setRunning] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [lastSnapshot, setLastSnapshot] = useState<PrintingRepairSnapshot | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    /** 结果动作（存入资产 / 发送画布）进行中与结果提示，避免连点重复入库/重复建项目。 */
    const [resultPending, setResultPending] = useState(false);
    const [resultNotice, setResultNotice] = useState<string | null>(null);
    /** 原站结果区顶部两个页签（生成结果 / 历史记录）。 */
    const [resultTab, setResultTab] = useState<"result" | "history">("result");

    const revisionRef = useRef<number | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const transform = history.present;

    /* ---------------- 草稿：恢复 → 回写 ---------------- */

    useEffect(() => {
        let alive = true;
        void (async () => {
            const draft = await hydrateDraft(PRINTING_REPAIR_TOOL_ID);
            if (!alive) return;
            revisionRef.current = draft?.revision ?? null;
            const values = parsePrintingRepairDraftValues(draft?.values ?? {});
            setHistory(createPrintTransformHistory(values.transform));
            setStrength(values.strength);
            setVersion(values.version);
            setCompareMode(values.compareMode);
            setDraftReady(true);
        })();
        return () => {
            alive = false;
        };
    }, [hydrateDraft]);

    /* 结果回填：任务与结果字节都在库里，刷新/重进后按最近一条落盘任务还原结果区，
     * 否则「生成成功 → 刷新 → 结果空白」，下载/存资产/发画布全部点不到。 */
    const storeTasks = useToolTaskStore((state) => state.tasks);
    const tasksHydrated = useToolTaskStore((state) => state.hydrated);
    const hydrateTasks = useToolTaskStore((state) => state.hydrate);
    const restoredRun = useRef(false);
    useEffect(() => {
        if (!tasksHydrated) hydrateTasks();
    }, [tasksHydrated, hydrateTasks]);
    useEffect(() => {
        if (!draftReady || !tasksHydrated || restoredRun.current) return;
        if (run && run.task) {
            restoredRun.current = true;
            return;
        }
        const latest = latestPrintingRepairTask(storeTasks, PRINTING_REPAIR_TOOL_ID);
        if (!latest) return;
        restoredRun.current = true;
        const restored = printingRepairRunFromStoredTask(latest);
        setRun(restored);
        if (restored.status !== "succeeded") {
            setNotice(restored.error?.message ?? "上游没有返回可用结果，请重试");
        }
    }, [draftReady, run, storeTasks, tasksHydrated]);

    useEffect(() => {
        if (!draftReady) return;
        const values: PrintingRepairDraftValues = {
            transform,
            strength,
            version,
            compareMode,
            output: { width: base?.width ?? 0, height: base?.height ?? 0 },
            baseName: base?.name ?? "",
            printName: print?.name ?? "",
        };
        patchDraft(PRINTING_REPAIR_TOOL_ID, { values: serializePrintingRepairDraftValues(values) });
    }, [base, compareMode, draftReady, patchDraft, print, strength, transform, version]);

    /* ---------------- 印花分割图：真实像素分析 ---------------- */

    useEffect(() => {
        if (!print) {
            setSeg({ status: "idle" });
            return;
        }
        let alive = true;
        setSeg({ status: "working" });
        void (async () => {
            try {
                const { imageToDataUrl } = await import("@/services/image-storage");
                const dataUrl = await imageToDataUrl({ storageKey: print.storageKey, url: print.url });
                if (!dataUrl) throw new Error("印花参考的本地数据已不可用，请重新上传");
                const result = await derivePrintSegPng(dataUrl);
                if (alive) setSeg({ status: "ready", result });
            } catch (error) {
                if (alive) setSeg({ status: "failed", message: error instanceof Error ? error.message : "印花分割失败" });
            }
        })();
        return () => {
            alive = false;
        };
    }, [print]);

    /* ---------------- Step 1 / Step 2 上传语义（规格 §3） ---------------- */

    const handleBaseChange = useCallback((ids: string[], records: ToolAssetRecord[]) => {
        const next = records[0] ?? null;
        const changed = (next?.id ?? null) !== (base?.id ?? null);
        setBase(next);
        if (!next || changed) {
            // 换→清空后续全部内容：印花、分割图、定位、结果都依赖旧底图。
            setPrint(null);
            setSeg({ status: "idle" });
            setHistory(resetPrintTransform(createPrintTransformHistory(createPrintingRepairTransform())));
            setRun(null);
            setSubmitError(null);
            setLastSnapshot(null);
            setNotice(next ? "已更换 Step 1 商品图，请重新上传印花并重新定位" : null);
        }
    }, [base]);

    const handlePrintChange = useCallback((ids: string[], records: ToolAssetRecord[]) => {
        const next = records[0] ?? null;
        const changed = (next?.id ?? null) !== (print?.id ?? null);
        setPrint(next);
        if (changed) {
            // 换印花只重置定位，底图保留（规格 §3）。
            setHistory(resetPrintTransform(history));
            setRun(null);
            setSubmitError(null);
            setLastSnapshot(null);
        }
    }, [history, print]);

    /* ---------------- 定位操作 ---------------- */

    const baseSize = useMemo(() => ({ width: base?.width ?? 0, height: base?.height ?? 0 }), [base]);
    const applyTransform = useCallback((next: PrintingRepairTransform) => {
        setHistory((current) => commitPrintTransform(current, next));
    }, []);

    const undo = useCallback(() => setHistory((current) => undoPrintTransform(current)), []);
    const redo = useCallback(() => setHistory((current) => redoPrintTransform(current)), []);
    const resetTransform = useCallback(() => setHistory((current) => resetPrintTransform(current)), []);

    /* ---------------- 预检与提交 ---------------- */

    const preflightIssues = useMemo(() => {
        if (!base || !print) return [];
        const issues: string[] = [];
        if (seg.status === "working") issues.push("正在分析印花分割图…");
        if (seg.status === "failed") issues.push(`印花分割图生成失败：${seg.message}`);
        if (seg.status === "idle") issues.push("印花分割图尚未生成，请重新上传印花参考");
        if (baseSize.width > 0 && baseSize.height > 0) {
            const printSize = { width: print.width ?? baseSize.width, height: print.height ?? baseSize.height };
            if (printCoverage(transform, printSize, baseSize) <= 0) issues.push("印花层完全在商品图之外，请先拖回画面内");
        }
        return issues;
    }, [base, baseSize, print, seg, transform]);

    const issues = useMemo(() => {
        const list = validatePrintingRepairInput({
            baseUrl: base?.url ?? "",
            printUrl: print?.url ?? "",
            segUrl: seg.status === "ready" ? seg.result.dataUrl : "",
            transform,
            base: baseSize.width > 0 ? baseSize : undefined,
            print: print?.width && print?.height ? { width: print.width, height: print.height } : undefined,
            strength,
        }).map((issue) => issue.message);
        if (!list.length) return preflightIssues;
        return [...list, ...preflightIssues];
    }, [base, baseSize, preflightIssues, print, seg, strength, transform]);

    const stale = useMemo(() => {
        if (!run || !lastSnapshot) return false;
        const current = base && print ? buildPrintingRepairSnapshot({
            baseAssetId: base.id,
            baseName: base.name,
            baseWidth: base.width,
            baseHeight: base.height,
            printAssetId: print.id,
            printName: print.name,
            printWidth: print.width,
            printHeight: print.height,
            transform,
            strength,
            version,
            output: { width: base.width, height: base.height },
            segDataUrl: seg.status === "ready" ? seg.result.dataUrl : undefined,
            segCoverage: seg.status === "ready" ? seg.result.coverage : undefined,
            segWidth: seg.status === "ready" ? seg.result.width : undefined,
            segHeight: seg.status === "ready" ? seg.result.height : undefined,
            draftRevision: revisionRef.current,
            clientOperationId: lastSnapshot.clientOperationId,
        }) : null;
        return isPrintingRepairSnapshotStale(lastSnapshot, current);
    }, [base, lastSnapshot, print, run, seg, strength, transform, version]);

    const view = useMemo(
        () => printingRepairResultView({ run, running, sourceUrl: base?.url, stale }),
        [base, run, running, stale],
    );

    /* ---------------- 结果动作：存入资产库 / 发送画布 ---------------- */

    /**
     * 取本次真实结果的 item：优先复用任务里的第一张图片结果（保留 dataUrl / url / mimeType），
     * 退化为 run.image；两者都没有就是没有结果，动作直接拒绝，不造占位图。
     */
    const resultItem = useCallback((): ToolTaskResultItem | null => {
        const fromTask = run?.task?.result?.items?.find((item) => item.kind === "image" && (item.dataUrl || item.url || item.blob));
        if (fromTask) return fromTask;
        const src = run?.image?.dataUrl ?? run?.image?.url ?? "";
        if (!src) return null;
        return {
            id: `${run?.task?.id ?? "printing-repair"}-0`,
            kind: "image",
            dataUrl: src.startsWith("data:") ? src : undefined,
            url: src.startsWith("data:") ? undefined : src,
            mimeType: "image/png",
        };
    }, [run]);

    const saveResult = useCallback(async () => {
        const item = resultItem();
        if (!item) {
            setResultNotice("没有可存入的结果图：请先完成一次真实修复");
            return;
        }
        setResultPending(true);
        setResultNotice(null);
        try {
            const saved = await saveResultItemToAssets(item, 0, {
                toolId: PRINTING_REPAIR_TOOL_ID,
                taskId: run?.task?.id,
                title: `${base?.name ?? "印花修复"} 修复结果`,
                source: "printing-repair",
            });
            setResultNotice(`已存入资产库（${saved.assetId.slice(0, 8)}）`);
        } catch (error) {
            setResultNotice(error instanceof Error ? error.message : "存入资产库失败");
        } finally {
            setResultPending(false);
        }
    }, [base, resultItem, run]);

    const sendResult = useCallback(async () => {
        const item = resultItem();
        if (!item) {
            setResultNotice("没有可发送的结果图：请先完成一次真实修复");
            return;
        }
        setResultPending(true);
        setResultNotice(null);
        try {
            const sent = await sendResultItemToCanvas(item, { toolId: PRINTING_REPAIR_TOOL_ID });
            setResultNotice(`已发送画布（项目 ${sent.projectId.slice(0, 8)} · 节点 ${sent.nodeId.slice(0, 8)}）`);
        } catch (error) {
            setResultNotice(error instanceof Error ? error.message : "发送画布失败");
        } finally {
            setResultPending(false);
        }
    }, [resultItem]);

    const submit = useCallback(async () => {
        if (running || !base || !print || seg.status !== "ready") return;
        setRunning(true);
        setSubmitError(null);
        setResultNotice(null);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const { imageToDataUrl } = await import("@/services/image-storage");
            const [baseDataUrl, printDataUrl] = await Promise.all([
                imageToDataUrl({ storageKey: base.storageKey, url: base.url }),
                imageToDataUrl({ storageKey: print.storageKey, url: print.url }),
            ]);
            if (!baseDataUrl || !printDataUrl) throw new Error("图片本地数据已不可用，请重新上传");
            const snapshot = buildPrintingRepairSnapshot({
                baseAssetId: base.id,
                baseName: base.name,
                baseWidth: base.width,
                baseHeight: base.height,
                printAssetId: print.id,
                printName: print.name,
                printWidth: print.width,
                printHeight: print.height,
                transform,
                strength,
                version,
                output: { width: base.width, height: base.height },
                segDataUrl: seg.result.dataUrl,
                segCoverage: seg.result.coverage,
                segWidth: seg.result.width,
                segHeight: seg.result.height,
                draftRevision: revisionRef.current,
                clientOperationId: randomId(),
            });
            const blockers = printingRepairPreflightIssues(snapshot, {
                baseUrl: baseDataUrl,
                printUrl: printDataUrl,
                segUrl: seg.result.dataUrl,
            });
            if (blockers.length) throw new Error(blockers[0]);
            const unit = buildPrintingRepairUnit({
                snapshot,
                base: toPrintingRepairReference({ id: base.id, name: base.name, type: base.mimeType, dataUrl: baseDataUrl, url: base.url, storageKey: base.storageKey, width: base.width, height: base.height }),
                print: toPrintingRepairReference({ id: print.id, name: print.name, type: print.mimeType, dataUrl: printDataUrl, url: print.url, storageKey: print.storageKey, width: print.width, height: print.height }),
                segDataUrl: seg.result.dataUrl,
            });
            const port = await createPrintingRepairRunPort();
            const next = await runPrintingRepair({ unit, port, signal: controller.signal, draftRevision: revisionRef.current });
            setRun(next);
            setLastSnapshot(snapshot);
            setNotice(next.status === "succeeded" ? null : next.error?.message ?? "上游没有返回可用结果，请重试");
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : "提交失败，请重试");
        } finally {
            abortRef.current = null;
            setRunning(false);
        }
    }, [base, print, running, seg, strength, transform, version]);

    const retry = useCallback(async () => {
        if (running || !lastSnapshot || !base || !print || seg.status !== "ready") return;
        setRunning(true);
        setSubmitError(null);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const { imageToDataUrl } = await import("@/services/image-storage");
            const [baseDataUrl, printDataUrl] = await Promise.all([
                imageToDataUrl({ storageKey: base.storageKey, url: base.url }),
                imageToDataUrl({ storageKey: print.storageKey, url: print.url }),
            ]);
            if (!baseDataUrl || !printDataUrl) throw new Error("图片本地数据已不可用，请重新上传");
            const unit = buildPrintingRepairUnit({
                snapshot: lastSnapshot,
                base: toPrintingRepairReference({ id: base.id, name: base.name, type: base.mimeType, dataUrl: baseDataUrl, url: base.url, storageKey: base.storageKey, width: base.width, height: base.height }),
                print: toPrintingRepairReference({ id: print.id, name: print.name, type: print.mimeType, dataUrl: printDataUrl, url: print.url, storageKey: print.storageKey, width: print.width, height: print.height }),
                segDataUrl: seg.result.dataUrl,
            });
            const port = await createPrintingRepairRunPort();
            const next = await retryPrintingRepair({ unit, port, signal: controller.signal, draftRevision: revisionRef.current });
            setRun(next);
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : "重试失败");
        } finally {
            abortRef.current = null;
            setRunning(false);
        }
    }, [base, lastSnapshot, print, running, seg]);

    const blocked = running || !base || !print || seg.status !== "ready";

    /* ---------------- 渲染 ---------------- */

    const sidebar = (
        <div className="space-y-2 text-sm">
            <p className="px-2 text-xs font-medium text-muted-foreground">同分类工具</p>
            <Link to="/tools/smart-edit/area-repair" className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-accent">
                <span>局部重绘</span>
                <ArrowRight aria-hidden="true" className="size-3.5 opacity-60" />
            </Link>
            <Link to="/tools/smart-edit/fix-color" className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-accent">
                <span>色差修复</span>
                <ArrowRight aria-hidden="true" className="size-3.5 opacity-60" />
            </Link>
            <p className="mt-3 px-2 text-[11px] leading-4 text-muted-foreground">
                上传上限：{PRINTING_REPAIR_UPLOAD_LABEL}
            </p>
        </div>
    );

    return (
        <ToolShell
            className={className}
            title={spec?.title ?? "印花修复"}
            subtitle="上传印花有误的图片，将正确的印花调整并覆盖，即可完成修复"
            sidebar={sidebar}
        >
            <div data-testid="printing-repair-workspace" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4">
                    <p className="rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">
                        💡 小贴士：您可以调整印花的大小并将其置于合适的位置！看看怎么操作？
                    </p>
                    <StepCard step={1} title="Step 1：消除错误印花" active={!base} done={Boolean(base)}>
                        <ToolAssetInput
                            toolId={BASE_SLOT_ID}
                            variant="linkfox"
                            dropLabel="拖拽 或 点击上传 需要修复的图"
                            hint="10M以内，jpg/jpeg/png/webp"
                            maxCount={1}
                            constraints={UPLOAD_CONSTRAINTS}
                            onChange={handleBaseChange}
                        />
                    </StepCard>

                    <StepCard step={2} title="Step 2：导入正确印花" active={Boolean(base) && !print} done={Boolean(print)}>
                        <ToolAssetInput
                            toolId={PRINT_SLOT_ID}
                            variant="linkfox"
                            dropLabel="拖拽 或 点击上传 印花参考"
                            hint="10M以内，jpg/jpeg/png/webp"
                            maxCount={1}
                            constraints={UPLOAD_CONSTRAINTS}
                            disabled={!base}
                            onChange={handlePrintChange}
                        />
                        {seg.status === "working" ? (
                            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                                正在分析印花分割图…
                            </p>
                        ) : null}
                        {seg.status === "ready" ? (
                            <p data-testid="printing-repair-seg" className="mt-2 text-[11px] text-muted-foreground">
                                分割图已生成 · 印花占比 {percent(seg.result.coverage, 1)} · {seg.result.width}×{seg.result.height}
                                {seg.result.mode === "full-rect" ? "（整图模式：背景透明时自动采用）" : ""}
                            </p>
                        ) : null}
                        {seg.status === "failed" ? (
                            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-destructive">
                                <CircleAlert aria-hidden="true" className="size-3.5" />
                                {seg.message}
                            </p>
                        ) : null}
                    </StepCard>

                    <StepCard step={3} title="Step 3：调整印花位置" hint="在左侧画布中调整印花位置，调整完成点击【开始生成】，即可完成修复" active={Boolean(print)} done={false}>
                        {base && print ? (
                            <div className="space-y-3">
                                <PrintStage
                                    baseUrl={base.url}
                                    printUrl={print.url}
                                    transform={transform}
                                    disabled={running}
                                    onDrag={(delta) => applyTransform(movePrint(transform, delta, baseSize))}
                                    onWheelScale={(direction) => applyTransform(stepPrintScale(transform, direction, false))}
                                    onKeyNudge={(direction, fast) => applyTransform(nudgePrint(transform, direction, baseSize, fast))}
                                />
                                <div className="flex flex-wrap items-center gap-2">
                                    <button type="button" onClick={undo} disabled={!canUndoPrintTransform(history)} data-testid="printing-repair-undo" className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs disabled:opacity-50">
                                        <Undo2 aria-hidden="true" className="size-3.5" />撤销
                                    </button>
                                    <button type="button" onClick={redo} disabled={!canRedoPrintTransform(history)} data-testid="printing-repair-redo" className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs disabled:opacity-50">
                                        <Redo2 aria-hidden="true" className="size-3.5" />重做
                                    </button>
                                    <button type="button" onClick={resetTransform} data-testid="printing-repair-reset" className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs">
                                        <RotateCcw aria-hidden="true" className="size-3.5" />重置
                                    </button>
                                    <span data-testid="printing-repair-transform-label" className="ml-auto text-[11px] text-muted-foreground">{printHistoryLabel(history)}</span>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <label className="space-y-1 text-[11px] text-muted-foreground">
                                        <span className="flex items-center justify-between"><span className="inline-flex items-center gap-1"><ZoomOut aria-hidden="true" className="size-3.5" />缩放</span><span className="tabular-nums text-foreground">{percent(clampScale(transform.scale), 0)}</span></span>
                                        <input data-testid="printing-repair-scale" type="range" min={PRINTING_REPAIR_SCALE.min} max={PRINTING_REPAIR_SCALE.max} step={PRINTING_REPAIR_SCALE.step} value={transform.scale} onChange={(event) => applyTransform(scalePrint(transform, Number(event.target.value)))} className="w-full accent-primary" />
                                        <span className="flex gap-1">
                                            {PRINTING_REPAIR_SCALE_PRESETS.map((preset) => (
                                                <button key={preset} type="button" onClick={() => applyTransform(scalePrint(transform, preset))} className="rounded border border-border px-1.5 py-0.5 text-[11px]">{percent(preset, 0)}</button>
                                            ))}
                                        </span>
                                    </label>
                                    <label className="space-y-1 text-[11px] text-muted-foreground">
                                        <span className="flex items-center justify-between"><span className="inline-flex items-center gap-1"><RotateCw aria-hidden="true" className="size-3.5" />旋转</span><span className="tabular-nums text-foreground">{clampRotate(transform.rotate).toFixed(0)}°</span></span>
                                        <input data-testid="printing-repair-rotate" type="range" min={PRINTING_REPAIR_ROTATE.min} max={PRINTING_REPAIR_ROTATE.max} step={PRINTING_REPAIR_ROTATE.step} value={transform.rotate} onChange={(event) => applyTransform(rotatePrint(transform, Number(event.target.value)))} className="w-full accent-primary" />
                                        <span className="flex gap-1">
                                            {PRINTING_REPAIR_ROTATE_PRESETS.map((preset) => (
                                                <button key={preset} type="button" onClick={() => applyTransform(rotatePrint(transform, preset))} className="rounded border border-border px-1.5 py-0.5 text-[11px]">{preset}°</button>
                                            ))}
                                            <button type="button" onClick={() => applyTransform(stepPrintRotate(transform, "ccw", true))} className="rounded border border-border px-1.5 py-0.5 text-[11px]">-90</button>
                                            <button type="button" onClick={() => applyTransform(stepPrintRotate(transform, "cw", true))} className="rounded border border-border px-1.5 py-0.5 text-[11px]">+90</button>
                                        </span>
                                    </label>
                                </div>
                                <p data-testid="printing-repair-transform-detail" className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                    <Move aria-hidden="true" className="size-3.5" />
                                    {describePrintTransform(transform)} · 画面覆盖 {percent(printCoverage(transform, { width: print.width ?? 1, height: print.height ?? 1 }, baseSize.width > 0 ? baseSize : { width: 1, height: 1 }), 1)}
                                </p>
                                <div className="flex flex-wrap gap-1.5 text-[11px]">
                                    {PRINTING_REPAIR_STEPS.map((step) => (
                                        <span key={step.id} className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">{step.title}</span>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <p data-testid="printing-repair-stage-empty" className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[11px] text-muted-foreground">
                             </p>
                        )}
                    </StepCard>
                </div>

                <div data-region="config" className="space-y-3">
                    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
                        <button
                            type="button"
                            title={[...issues, ...(submitError ? [submitError] : []), ...(notice ? [notice] : [])].join("；") || undefined}
                            data-testid="printing-repair-submit"
                            onClick={() => void submit()}
                            disabled={blocked || issues.length > 0}
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                        >
                            {running ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Sparkles aria-hidden="true" className="size-4" />}
                            <span>{running ? "修复中…" : "立即生成"}</span>
                        </button>
                        <p className="mt-1.5 text-center text-[11px] text-muted-foreground">限免</p>
                    </section>

                    <section data-testid="printing-repair-result" className="space-y-2 rounded-2xl border border-border bg-card p-4">
                        <div className="flex items-center gap-1 border-b border-border pb-1">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={resultTab === "result"}
                                data-testid="printing-repair-tab-result"
                                onClick={() => setResultTab("result")}
                                className={
                                    resultTab === "result"
                                        ? "rounded-md px-2 py-1 text-sm font-semibold text-foreground"
                                        : "rounded-md px-2 py-1 text-sm text-muted-foreground transition hover:text-foreground"
                                }
                            >
                                生成结果
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={resultTab === "history"}
                                data-testid="printing-repair-tab-history"
                                onClick={() => setResultTab("history")}
                                className={
                                    resultTab === "history"
                                        ? "rounded-md px-2 py-1 text-sm font-semibold text-foreground"
                                        : "rounded-md px-2 py-1 text-sm text-muted-foreground transition hover:text-foreground"
                                }
                            >
                                历史记录
                            </button>
                            {stale ? (
                                <span data-testid="printing-repair-stale" className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">来自旧版本</span>
                            ) : null}
                        </div>
                        {resultTab === "history" ? (
                            <p data-testid="printing-repair-history-empty" className="text-[11px] text-muted-foreground">
                                暂无历史记录
                            </p>
                        ) : view.imageUrl && base?.url ? (
                            <>
                                <RegionCompare baseUrl={base.url} resultUrl={view.imageUrl} split={split} mode={compareMode} region={compareRegion(transform)} onSplit={(next) => setSplit(clampSplit01(next))} />
                                <p data-testid="printing-repair-region" className="text-[11px] text-muted-foreground">
                                    局部范围：印花中心周围 {percent(compareRegion(transform).width, 0)} 画面
                                </p>
                                <PrintingRepairResultActions
                                    imageUrl={view.imageUrl}
                                    imageName={base.name}
                                    pending={resultPending}
                                    notice={resultNotice}
                                    onSave={() => void saveResult()}
                                    onSend={() => void sendResult()}
                                />
                            </>
                        ) : (
                            <button
                                type="button"
                                data-testid="printing-repair-result-empty"
                                onClick={() => setResultTab("result")}
                                className="w-full rounded-lg px-1 py-6 text-left text-[11px] leading-5 text-muted-foreground transition hover:text-foreground"
                            >
                                {running ? "正在修复…" : view.status === "failed" ? view.error?.message ?? "上游没有返回结果" : "暂无生成结果图"}
                            </button>
                        )}
                        {view.status !== "succeeded" && run ? (
                            <button type="button" data-testid="printing-repair-retry" onClick={() => void retry()} disabled={running} className="rounded-lg border border-border px-2 py-1 text-[11px] disabled:opacity-50">重试</button>
                        ) : null}
                    </section>

                    {run?.task ? <ToolResult task={run.task as ToolTask} toolId={PRINTING_REPAIR_TOOL_ID} title="上游返回" /> : null}
                    {/* 原站族导航在页面最左（x≈61），本地被内容框裁掉：在参数栏底部等价还原，顺序与原站一致 */}
                    <OrigRail items={SMART_EDIT_RAIL} active="印花修复" driver testId="printing-repair-family-rail" label="图片编辑" />
                </div>
            </div>
        </ToolShell>
    );
}

export default PrintingRepairWorkspace;
