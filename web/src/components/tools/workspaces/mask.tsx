import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Download, Hand, History, Image as ImageIcon, Paintbrush, Redo2, RotateCcw, Scaling, Undo2, Upload, WandSparkles } from "lucide-react";

import { Edit8Chip, Edit8Empty, Edit8ResultTabs, Edit8Switch, Edit8UploadCard, edit8GradientButtonClass } from "@/components/tools/edit8-frame";
import { ToolTaskHistory, formatTaskTime } from "@/components/tools/tool-task-history";
import { TaskStatusPanel } from "@/components/tools/task-status";
import { downloadResultItem, saveResultItemToAssets, sendResultItemToCanvas } from "@/components/tools/tool-result-actions";
import { buildAreaRepairUnits, createAreaRepairRunPort, renderMaskPng, runAreaRepairUnits, type AreaRepairUnit, type AreaRepairUnitOutcome } from "@/features/tools/adapters/area-repair";
import { getToolById } from "@/features/tools/registry";
import {
    AREA_REPAIR_DEFAULT_OUTPUT,
    AREA_REPAIR_OUTPUT_OPTIONS,
    AREA_REPAIR_PROMPT_MAX,
    AREA_REPAIR_TOOL_ID,
    areaRepairDownloadName,
    MASK_BRUSH_MAX,
    MASK_BRUSH_MIN,
    appendStrokePoint,
    buildAreaRepairSnapshot,
    clampBrushSize,
    createMaskHistory,
    createMaskState,
    createStroke,
    describeCoverage,
    isSnapshotStale,
    maskCoverage,
    maskHistoryLabel,
    maskIsEmpty,
    normalizeOutputNum,
    normalizePoint,
    parseMaskDraftValues,
    snapshotHash,
    pushMaskStroke,
    redoMaskStroke,
    resetMaskHistory,
    serializeMaskDraftValues,
    undoMaskStroke,
    validateAreaRepairInput,
    type AreaRepairSnapshot,
    type MaskHistory,
    type MaskState,
    type MaskStroke,
} from "@/features/tools/registry/area-repair";
import { clampCompareSplit, exportRemovePenMaskPng, removePenResultItem, removePenResultView, removePenRunFromTask, removePenTaskHasResult, type RemovePenRun } from "@/features/tools/adapters/remove-pen";
import {
    REMOVE_PEN_BRUSH_MAX,
    REMOVE_PEN_BRUSH_MIN,
    REMOVE_PEN_BRUSH_PRESETS,
    REMOVE_PEN_COMPARE_MODES,
    REMOVE_PEN_HANDOFFS,
    REMOVE_PEN_TOOL_ID,
    buildRemovePenHandoff,
    buildRemovePenSnapshot,
    clampRemovePenBrush,
    isRemovePenSnapshotStale,
    parseRemovePenDraftValues,
    removePenDownloadName,
    removePenMaskIsEmpty,
    serializeRemovePenDraftValues,
    undoRemovePenStroke,
    redoRemovePenStroke,
    resetRemovePenStrokes,
    validateRemovePenInput,
    validateRemovePenSource,
    beginRemovePenStroke,
    commitRemovePenStroke,
    createRemovePenHistory,
    createRemovePenState,
    extendRemovePenStroke,
    removePenHistoryState,
    type RemovePenCompareMode,
    type RemovePenSnapshot,
} from "@/features/tools/registry/remove-pen";
import { cn, randomId } from "@/lib/utils";
import { adoptLibraryAsset, loadToolAssetRecords, toolAssetLibraryItemsFromAssets, uploadToolAsset, type ToolAssetLibraryItem, type ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
import { imageToDataUrl } from "@/services/image-storage";
import { resolveMediaUrl } from "@/services/file-storage";
import { useAssetStore, type ImageAsset, type VideoAsset } from "@/stores/use-asset-store";
import { flushToolDrafts, useToolDraftStore } from "@/stores/use-tool-draft-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";

export type MaskWorkspaceProps = { className?: string };

type UploadedImage = { id: string; name: string; dataUrl: string; width: number; height: number };

const TOOL_ID = AREA_REPAIR_TOOL_ID;

/** 原站「大小：35 像素 ⌄」下拉里的预设档位（外观 1:1，选值仍写回真实 brushSize）。 */
const MASK_BRUSH_PRESETS = [15, 35, 60, 100] as const;

/** 局部消除「或试试这些」：原站同源 4 张示例（cdn uploadExample29~32），点击后真实入库并载入画布。 */
const REMOVE_PEN_SAMPLES = [
    { id: "scene", name: "示例 1", src: "/__cases/remove-pen/uploadExample29.jpg" },
    { id: "street", name: "示例 2", src: "/__cases/remove-pen/uploadExample30.jpg" },
    { id: "goods", name: "示例 3", src: "/__cases/remove-pen/uploadExample31.jpg" },
    { id: "print", name: "示例 4", src: "/__cases/remove-pen/uploadExample32.jpg" },
] as const;

/** 原站局部消除工具条接力按钮的图标（高清放大 / 商品图 / 手部修复）。 */
const HANDOFF_ICONS = { "scale-up": Scaling, "product-image": ImageIcon, "hand-repair": Hand } as const;
function HandoffIcon({ id }: { id: string }) {
    const Icon = HANDOFF_ICONS[id as keyof typeof HANDOFF_ICONS];
    return Icon ? <Icon className="size-3" aria-hidden /> : null;
}

/**
 * AREA_REPAIR 局部重绘工作区。
 *
 * 真实边界：蒙版是画布上真实绘制的笔画（画笔/橡皮/羽化/反选/自动扩边），提交时导出成同尺寸 PNG，
 * 与原图一起作为两张参考图发给真实图像编辑接口；结果只来自上游返回，不补造。
 */
export type AreaRepairResultCardProps = {
    outcome: AreaRepairUnitOutcome;
    imageName?: string;
    pending?: string | null;
    onSave?: (outcome: AreaRepairUnitOutcome) => void;
    onSend?: (outcome: AreaRepairUnitOutcome) => void;
};

/**
 * 单张结果卡片：图片 + 存库 / 发画布 / 下载。
 * 与原站「下载」以及 HAND_REPAIR 的结果动作保持 1:1，不额外造按钮。
 */
export function AreaRepairResultCard({ outcome, imageName = "", pending = null, onSave, onSend }: AreaRepairResultCardProps) {
    const src = outcome.image?.dataUrl || outcome.image?.url || "";
    const ready = outcome.status === "succeeded" && Boolean(src);
    return (
        <li data-testid={`area-repair-result-${outcome.index}`} className="overflow-hidden rounded border border-border">
            {ready ? (
                <a href={src} target="_blank" rel="noreferrer" className="block">
                    <img src={src} alt={`结果 ${outcome.index}`} className="block h-auto w-full" />
                </a>
            ) : (
                <div className="flex h-20 items-center justify-center px-2 text-center text-[10px] text-muted-foreground">
                    {outcome.status === "cancelled" ? "已取消" : (outcome.error?.message ?? "未返回图片")}
                </div>
            )}
            <p className="border-t border-border px-1.5 py-1 text-[10px] text-muted-foreground">
                #{outcome.index} · {outcome.status}
            </p>
            {ready ? (
                <span className="flex flex-wrap items-center gap-2 border-t border-border px-1.5 py-1 text-[10px] text-muted-foreground">
                    <button
                        type="button"
                        data-testid={`area-repair-save-${outcome.index}`}
                        disabled={pending !== null || !onSave}
                        onClick={() => onSave?.(outcome)}
                        className="underline-offset-2 hover:underline disabled:opacity-50"
                    >
                        存库
                    </button>
                    <button
                        type="button"
                        data-testid={`area-repair-send-${outcome.index}`}
                        disabled={pending !== null || !onSend}
                        onClick={() => onSend?.(outcome)}
                        className="underline-offset-2 hover:underline disabled:opacity-50"
                    >
                        发画布
                    </button>
                    <a
                        data-testid={`area-repair-download-${outcome.index}`}
                        href={src}
                        download={areaRepairDownloadName(imageName, outcome.index)}
                        className="underline-offset-2 hover:underline"
                    >
                        下载
                    </a>
                </span>
            ) : null}
        </li>
    );
}

type AreaRepairHistoryResultProps = {
    task: ToolTask;
    pending: string | null;
    feedback: string | null;
    onBack: () => void;
    onDownload: (item: ToolTaskResultItem, index: number) => void;
    onSave: (item: ToolTaskResultItem, index: number) => void;
    onSend: (item: ToolTaskResultItem, index: number) => void;
};

/**
 * 历史任务的结果区回填：只渲染任务快照里真实存在的 result.items。
 * - 有 url/dataUrl 才给图与动作，字节已被持久化剥离的项显式写「原始文件未保留」；
 * - 下载/存库/发画布复用当前结果的同一套真实动作，不回退到假数据。
 */
export function AreaRepairHistoryResult({ task, pending, feedback, onBack, onDownload, onSave, onSend }: AreaRepairHistoryResultProps) {
    const items = task.result?.items ?? [];
    return (
        <div data-testid="area-repair-history-result">
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">
                    历史任务 · {formatTaskTime(task.createdAt)} · {task.status}
                </span>
                <button
                    type="button"
                    data-testid="area-repair-history-back"
                    onClick={onBack}
                    className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                >
                    返回本次结果
                </button>
            </div>
            {items.length === 0 ? (
                <p data-testid="area-repair-history-empty" className="rounded border border-border p-3 text-[11px] text-muted-foreground">
                    这条任务没有结果快照
                </p>
            ) : (
                <ul data-testid="area-repair-history-results" className="grid grid-cols-1 gap-2">
                    {items.map((item, index) => {
                        const src = item.dataUrl || item.url || "";
                        return (
                            <li key={item.id || index} data-testid={`area-repair-history-result-${index + 1}`} className="overflow-hidden rounded border border-border">
                                {src ? (
                                    <a href={src} target="_blank" rel="noreferrer" className="block">
                                        <img src={src} alt={`历史结果 ${index + 1}`} className="block h-auto w-full" />
                                    </a>
                                ) : (
                                    <div className="flex h-20 items-center justify-center px-2 text-center text-[10px] text-muted-foreground">原始文件未保留</div>
                                )}
                                <p className="border-t border-border px-1.5 py-1 text-[10px] text-muted-foreground">
                                    #{index + 1} · {task.status}
                                </p>
                                {src ? (
                                    <span className="flex flex-wrap items-center gap-2 border-t border-border px-1.5 py-1 text-[10px] text-muted-foreground">
                                        <button
                                            type="button"
                                            data-testid={`area-repair-history-download-${index + 1}`}
                                            disabled={pending !== null}
                                            onClick={() => onDownload(item, index)}
                                            className="underline-offset-2 hover:underline disabled:opacity-50"
                                        >
                                            下载
                                        </button>
                                        <button
                                            type="button"
                                            data-testid={`area-repair-history-save-${index + 1}`}
                                            disabled={pending !== null}
                                            onClick={() => onSave(item, index)}
                                            className="underline-offset-2 hover:underline disabled:opacity-50"
                                        >
                                            存库
                                        </button>
                                        <button
                                            type="button"
                                            data-testid={`area-repair-history-send-${index + 1}`}
                                            disabled={pending !== null}
                                            onClick={() => onSend(item, index)}
                                            className="underline-offset-2 hover:underline disabled:opacity-50"
                                        >
                                            发画布
                                        </button>
                                    </span>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            )}
            {feedback ? (
                <p data-testid="area-repair-history-feedback" className="mt-2 text-[11px] text-muted-foreground">
                    {feedback}
                </p>
            ) : null}
        </div>
    );
}

export function MaskWorkspace({ className }: MaskWorkspaceProps = {}) {
    const spec = useMemo(() => getToolById(TOOL_ID), []);
    // 作品库：真实接入本地资产库，供上传卡「从作品库选择」（原站文案 §9）。
    const assets = useAssetStore((store) => store.assets);
    const library = useMemo(
        () => toolAssetLibraryItemsFromAssets(assets.filter((asset): asset is ImageAsset | VideoAsset => asset.kind === "image" || asset.kind === "video")),
        [assets],
    );
    const patchDraft = useToolDraftStore((state) => state.patch);
    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const conflict = useToolDraftStore((state) => state.conflicts[TOOL_ID]);

    const [state, setState] = useState<MaskState>(() => createMaskState());
    const [history, setHistory] = useState<MaskHistory>(() => createMaskHistory());
    const [prompt, setPrompt] = useState("");
    const [outputNum, setOutputNum] = useState<number>(AREA_REPAIR_DEFAULT_OUTPUT);
    const [image, setImage] = useState<UploadedImage | null>(null);
    const [hydrated, setHydrated] = useState(false);
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const [outcomes, setOutcomes] = useState<AreaRepairUnitOutcome[]>([]);
    const [tasks, setTasks] = useState<ToolTask[]>([]);
    const [runSnapshot, setRunSnapshot] = useState<AreaRepairSnapshot | null>(null);
    const [resultPending, setResultPending] = useState<string | null>(null);
    const [resultFeedback, setResultFeedback] = useState<string | null>(null);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const stateRef = useRef(state);
    const historyRef = useRef(history);
    const imageRef = useRef<UploadedImage | null>(null);
    const promptRef = useRef(prompt);
    const outputRef = useRef(outputNum);
    const drawingRef = useRef<MaskStroke | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const persist = useCallback(
        (next: MaskState) => {
            patchDraft(TOOL_ID, {
                values: serializeMaskDraftValues({
                    state: next,
                    prompt: promptRef.current,
                    outputNum: outputRef.current,
                }),
                assetIds: imageRef.current ? [imageRef.current.id] : [],
            });
        },
        [patchDraft],
    );

    /** 笔画历史是唯一真源：撤销/重做/重置都走这里，并同步草稿。 */
    const applyHistory = useCallback(
        (next: MaskHistory) => {
            historyRef.current = next;
            setHistory(next);
            const merged: MaskState = { ...stateRef.current, strokes: next.present };
            stateRef.current = merged;
            setState(merged);
            persist(merged);
        },
        [persist],
    );

    /** 控件改动（笔刷/羽化/反选/自动扩边）：只动控件，不动已画笔画。 */
    const commit = useCallback(
        (patch: Partial<MaskState>) => {
            const merged: MaskState = { ...stateRef.current, ...patch };
            stateRef.current = merged;
            setState(merged);
            persist(merged);
        },
        [persist],
    );

    const adoptImage = useCallback(
        async (record: ToolAssetRecord) => {
            // 幂等：同一资产重复回调（草稿恢复 effect 再次触发）不清空已画笔画。
            if (imageRef.current?.id === record.id) return;
            const dataUrl = await imageToDataUrl({ storageKey: record.storageKey, url: record.url });
            if (!dataUrl) {
                setNotice("这张图片的本地数据已不可用，请重新上传");
                return;
            }
            const size = await new Promise<{ width: number; height: number }>((resolve) => {
                const probe = new window.Image();
                probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
                probe.onerror = () => resolve({ width: 0, height: 0 });
                probe.src = dataUrl;
            });
            if (!size.width || !size.height) {
                setNotice("无法读取图片尺寸，请换一张图片");
                return;
            }
            const next: UploadedImage = {
                id: record.id,
                name: record.name,
                dataUrl,
                width: record.width || size.width,
                height: record.height || size.height,
            };
            imageRef.current = next;
            setImage(next);
            // 换图 = 原蒙版坐标失效，必须清空（规格 §3）。
            const cleared = createMaskHistory();
            historyRef.current = cleared;
            setHistory(cleared);
            const merged: MaskState = { ...stateRef.current, strokes: [] };
            stateRef.current = merged;
            setState(merged);
            setOutcomes([]);
            setRunSnapshot(null);
            setNotice("");
            persist(merged);
        },
        [persist],
    );

    // 草稿恢复：笔画/控件/描述/张数来自 draft.values，图片由 draft.assetIds 取回真实字节。
    useEffect(() => {
        let alive = true;
        void (async () => {
            const draft = await hydrateDraft(TOOL_ID);
            if (!alive) return;
            const parsed = parseMaskDraftValues(draft?.values);
            stateRef.current = parsed.state;
            historyRef.current = createMaskHistory(parsed.state.strokes);
            promptRef.current = parsed.prompt;
            outputRef.current = parsed.outputNum;
            setState(parsed.state);
            setHistory(historyRef.current);
            setPrompt(parsed.prompt);
            setOutputNum(parsed.outputNum);
            setHydrated(true);
            const ids = draft?.assetIds ?? [];
            if (ids.length > 0) {
                const { records } = await loadToolAssetRecords(ids);
                if (alive && records[0]) await adoptImage(records[0]);
            }
        })();
        return () => {
            alive = false;
        };
    }, [hydrateDraft, adoptImage]);

    useEffect(() => () => abortRef.current?.abort(), []);
    useEffect(() => {
        if (hydrated) void flushToolDrafts([TOOL_ID]);
    }, [hydrated, state, prompt, outputNum]);

    /** 蒙版预览：真实 canvas 绘制，反选时整图铺色、笔画挖空。 */
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !imageRef.current) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);
        const inverted = stateRef.current.inverted;
        const sourceWidth = imageRef.current.width || width;
        const ratio = width / sourceWidth;
        if (inverted) {
            ctx.globalCompositeOperation = "source-over";
            ctx.fillStyle = "rgba(255,255,255,0.34)";
            ctx.fillRect(0, 0, width, height);
        }
        const strokes = drawingRef.current ? [...historyRef.current.present, drawingRef.current] : historyRef.current.present;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (const stroke of strokes) {
            const erases = inverted ? stroke.tool === "brush" : stroke.tool === "eraser";
            ctx.globalCompositeOperation = erases ? "destination-out" : "source-over";
            ctx.strokeStyle = "rgba(255,255,255,0.55)";
            ctx.lineWidth = Math.max(1, stroke.size * ratio);
            const points = stroke.points;
            ctx.beginPath();
            ctx.moveTo(points[0].x * width, points[0].y * height);
            if (points.length === 1) ctx.lineTo(points[0].x * width + 0.01, points[0].y * height);
            for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x * width, points[i].y * height);
            ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !image) return;
        const longest = Math.max(image.width, image.height);
        const ratio = longest > 1400 ? 1400 / longest : 1;
        canvas.width = Math.max(1, Math.round(image.width * ratio));
        canvas.height = Math.max(1, Math.round(image.height * ratio));
        draw();
    }, [image, history, state.inverted, draw]);

    const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return normalizePoint({
            x: (event.clientX - rect.left) / Math.max(1, rect.width),
            y: (event.clientY - rect.top) / Math.max(1, rect.height),
        });
    };

    const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!imageRef.current || busy) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drawingRef.current = createStroke(stateRef.current.tool, stateRef.current.brushSize, pointFromEvent(event), randomId());
        draw();
    };

    const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawingRef.current) return;
        const next = appendStrokePoint(drawingRef.current, pointFromEvent(event));
        if (next === drawingRef.current) return;
        drawingRef.current = next;
        draw();
    };

    const endStroke = () => {
        const stroke = drawingRef.current;
        drawingRef.current = null;
        if (!stroke) return;
        applyHistory(pushMaskStroke(historyRef.current, stroke));
    };

    const maskRatio = useMemo(() => maskCoverage(state), [state]);
    const historyLabel = useMemo(() => maskHistoryLabel(history), [history]);
    const issues = useMemo(
        () =>
            validateAreaRepairInput({
                imageUrl: image?.dataUrl ?? "",
                maskUrl: maskIsEmpty(state) ? "" : "drawn",
                prompt,
                outputNum,
            }),
        [image, state, prompt, outputNum],
    );
    const currentSnapshot = useMemo(
        () =>
            buildAreaRepairSnapshot({
                imageAssetId: image?.id ?? "",
                imageName: image?.name ?? "",
                imageWidth: image?.width ?? 0,
                imageHeight: image?.height ?? 0,
                state,
                prompt,
                outputNum,
            }),
        [image, state, prompt, outputNum],
    );
    const stale = runSnapshot ? isSnapshotStale(runSnapshot, currentSnapshot) : false;
    const latestTask = tasks.length > 0 ? tasks[tasks.length - 1] : null;

    /**
     * 规格职责：当前提交的请求单元列表（张数拆分后的每一次真实编辑请求）。
     * 失败单元只重试失败的张，不重复生成已成功结果（规格 §5 部分失败）。
     */
    const [pendingUnits, setPendingUnits] = useState<AreaRepairUnit[]>([]);

    const runUnits = useCallback(
        async (units: AreaRepairUnit[], controller: AbortController) => {
            const real = createAreaRepairRunPort();
            const port = {
                async run(input: Parameters<typeof real.run>[0], options?: Parameters<typeof real.run>[1]) {
                    const task = await real.run(input, options);
                    setTasks((prev) => [...prev, task]);
                    return task;
                },
            };
            return runAreaRepairUnits(units, {
                port,
                concurrency: 1,
                signal: controller.signal,
                onOutcome: (outcome) => {
                    setOutcomes((prev) => {
                        const next = prev.slice();
                        next[outcome.index - 1] = outcome;
                        return next.filter((item): item is AreaRepairUnitOutcome => Boolean(item));
                    });
                },
            });
        },
        [],
    );

    /** 部分失败恢复：只重跑失败的单元，已成功结果原样保留，不重复生成。 */
    const retryFailedUnits = useCallback(async () => {
        const failed = pendingUnits.filter((unit) => {
            const outcome = outcomes.find((item) => item.unitId === unit.id);
            return outcome ? outcome.status === "failed" : false;
        });
        if (failed.length === 0 || busy) return;
        setBusy(true);
        setNotice("");
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const results = await runUnits(failed, controller);
            const failedCount = results.filter((item) => item.status === "failed").length;
            setNotice(failedCount === 0 ? `重试完成：${results.length} 张已返回` : `仍有 ${failedCount} 张失败，可再次重试`);
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "重试失败，请重试");
        } finally {
            setBusy(false);
            abortRef.current = null;
        }
    }, [pendingUnits, outcomes, busy, runUnits]);

    const hasFailedUnits = pendingUnits.some((unit) => outcomes.find((item) => item.unitId === unit.id)?.status === "failed");

    /** 提交：导出同尺寸蒙版 → 校验 → 逐单元真实请求。 */
    const submit = useCallback(async () => {
        if (busy) return;
        const current = imageRef.current;
        if (!current) {
            setNotice("请先上传要重绘的图片");
            return;
        }
        if (maskIsEmpty(stateRef.current)) {
            setNotice("蒙版为空：请先在图片上涂抹需要重绘的区域");
            return;
        }
        setBusy(true);
        setNotice("");
        setOutcomes([]);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const mask = await renderMaskPng(stateRef.current, { width: current.width, height: current.height });
            const problems = validateAreaRepairInput({
                imageUrl: current.dataUrl,
                maskUrl: mask.dataUrl,
                prompt: promptRef.current,
                outputNum: outputRef.current,
                imageWidth: current.width,
                imageHeight: current.height,
                maskWidth: mask.width,
                maskHeight: mask.height,
            });
            if (problems.length > 0) {
                setNotice(problems.map((issue) => issue.message).join("；"));
                return;
            }
            const snapshot = buildAreaRepairSnapshot({
                imageAssetId: current.id,
                imageName: current.name,
                imageWidth: current.width,
                imageHeight: current.height,
                state: stateRef.current,
                prompt: promptRef.current,
                outputNum: outputRef.current,
            });
            const units = buildAreaRepairUnits({
                snapshot,
                image: { id: current.id, name: current.name, type: "image/png", dataUrl: current.dataUrl },
                mask: { id: `mask-${snapshot.maskHash}`, name: "mask.png", type: "image/png", dataUrl: mask.dataUrl },
            });
            const audit = auditFields(units);
            if (audit.length > 0) {
                setNotice(audit.join("；"));
                return;
            }
            setPendingUnits(units);
            setRunSnapshot(snapshot);
            // 同一通道并发提交会互相拖住（实测并发 2 时两个单元都停在 submitting），逐张串行提交；
            // 每张完成就回流到结果区，用户不必等到全部结束才看到图。
            const results = await runUnits(units, controller);
            setOutcomes(results);
            const ok = results.filter((item) => item.status === "succeeded").length;
            const failed = results.filter((item) => item.status === "failed").length;
            setNotice(failed === 0 ? `完成：${ok} 张结果已返回` : `完成 ${ok} 张，失败 ${failed} 张；失败单元可按原参数重试`);
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "提交失败，请重试");
        } finally {
            setBusy(false);
            abortRef.current = null;
        }
    }, [busy, runUnits]);

    function auditFields(units: ReturnType<typeof buildAreaRepairUnits>) {
        const specKeys = spec?.fields.map((field) => field.key) ?? [];
        const missing = specKeys.filter((key) => !(key in units[0].fields) && key !== "imageUrl" && key !== "maskUrl" && key !== "prompt");
        const issuesOut: string[] = [];
        if (missing.length > 0) issuesOut.push(`提交字段缺失：${missing.join("、")}`);
        if (units[0].references.length !== 2) issuesOut.push("蒙版没有作为第二张参考图提交");
        return issuesOut;
    }

    const coverageLabel = describeCoverage(maskRatio);

    const toResultItem = useCallback((outcome: AreaRepairUnitOutcome): ToolTaskResultItem => {
        const dataUrl = outcome.image?.dataUrl;
        const url = outcome.image?.url;
        return dataUrl
            ? { id: `${TOOL_ID}-result-${outcome.index}`, kind: "image", dataUrl, mimeType: outcome.image?.mimeType ?? "image/png" }
            : { id: `${TOOL_ID}-result-${outcome.index}`, kind: "image", url, mimeType: outcome.image?.mimeType ?? "image/png" };
    }, []);

    const runResultAction = useCallback(async (key: string, action: () => Promise<string>) => {
        setResultPending(key);
        setResultFeedback(null);
        try {
            setResultFeedback(await action());
        } catch (error) {
            setResultFeedback(error instanceof Error ? error.message : "操作失败，请重试");
        } finally {
            setResultPending(null);
        }
    }, []);

    const [resultTab, setResultTab] = useState<"result" | "history">("result");
    /** 历史记录里点「查看结果」选中的任务：结果区回填它的真实结果项（字节仍在才可下载/存库/发画布）。 */
    const [restoredTask, setRestoredTask] = useState<ToolTask | null>(null);

    return (
        <div
            data-tool={TOOL_ID}
            data-layout="linkfox-edit8"
            data-testid="area-repair-workspace"
            data-workspace-columns="area-repair"
            className={cn("flex h-full min-h-0 flex-col gap-[10px] bg-canvas p-2.5 text-foreground", className)}
        >
            {/* 原站（1600×1000 实测）：画布（40px 工具条）| 配置 240（面板卡 + 卡外「立即生成」）| 结果 300，间距 10。 */}
            <div data-testid="tool-workspace-columns" data-canvas="true" data-config-side="right" className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-[10px] lg:grid-cols-[minmax(0,1fr)_240px_300px]">
                <section data-region="canvas" data-testid="tool-main-column" className="flex min-h-0 min-w-0 flex-col overflow-hidden border border-border">
                    <div className="flex h-10 shrink-0 flex-wrap items-center gap-[10px] bg-card px-5 text-xs text-foreground" data-testid="mask-toolbar">
                        <span className="inline-flex h-6 items-center gap-1 text-[14px] leading-[22px] text-foreground/85" data-testid="mask-tool-label">
                            <Paintbrush className="size-3.5" aria-hidden />
                            <span>画笔</span>
                        </span>

                        {/* 原站「大小：InputNumber + 下拉预设 + 像素」：不铺长滑杆，只保留 number 输入与预设下拉。 */}
                        <label className="flex items-center gap-1 text-[12px] text-foreground/60">
                            <span>大小：</span>
                            <span className="inline-flex h-6 items-center gap-1 rounded-[4px] border border-border bg-card pl-[7px] pr-1">
                            <input
                                type="number"
                                data-testid="mask-brush-size"
                                min={MASK_BRUSH_MIN}
                                max={MASK_BRUSH_MAX}
                                value={state.brushSize}
                                onChange={(event) => commit({ brushSize: clampBrushSize(event.target.value) })}
                                className="h-[22px] w-[22px] appearance-none bg-transparent px-0 text-[12px] tabular-nums text-foreground outline-none [&::-webkit-inner-spin-button]:appearance-none"
                                aria-label="画笔大小像素"
                            />
                            <span className="text-muted-foreground">像素</span>
                            <span className="relative inline-flex size-3 items-center justify-center" data-testid="mask-brush-presets">
                                <ChevronDown className="pointer-events-none size-3 text-muted-foreground" aria-hidden />
                                <select
                                    value={state.brushSize}
                                    disabled={busy}
                                    onChange={(event) => commit({ brushSize: clampBrushSize(event.target.value) })}
                                    aria-label="画笔大小预设"
                                    className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
                                >
                                    {MASK_BRUSH_PRESETS.map((preset) => (
                                        <option key={preset} value={preset}>
                                            {preset}
                                        </option>
                                    ))}
                                </select>
                            </span>
                            </span>
                        </label>

                        <label className="flex items-center gap-0 text-[12px] leading-[19px] text-foreground/60">
                            <span>自动扩大选择区域：</span>
                            <Edit8Switch testId="mask-auto-expand" label="自动扩大选择区域" checked={state.autoExpand} onChange={(next) => commit({ autoExpand: next })} />
                        </label>

                        <button
                            type="button"
                            data-testid="mask-invert"
                            aria-pressed={state.inverted}
                            disabled={historyLabel.strokeCount === 0}
                            onClick={() => commit({ inverted: !state.inverted })}
                            className={cn("h-7 rounded-[4px] px-[7px] text-[12px] leading-none disabled:text-foreground/30!", state.inverted ? "bg-accent font-medium text-foreground!" : "text-foreground hover:bg-accent")}
                        >
                            反选
                        </button>
                        <button
                            type="button"
                            data-testid="mask-undo"
                            disabled={!historyLabel.canUndo}
                            onClick={() => applyHistory(undoMaskStroke(historyRef.current))}
                            className="inline-flex h-7 items-center gap-1 rounded-[4px] px-[7px] text-[12px] leading-none text-foreground transition hover:bg-accent disabled:text-foreground/30!"
                        >
                            <Undo2 className="size-3.5" aria-hidden />
                            <span>撤销</span>
                        </button>
                        <button
                            type="button"
                            data-testid="mask-redo"
                            disabled={!historyLabel.canRedo}
                            onClick={() => applyHistory(redoMaskStroke(historyRef.current))}
                            className="inline-flex h-7 items-center gap-1 rounded-[4px] px-[7px] text-[12px] leading-none text-foreground transition hover:bg-accent disabled:text-foreground/30!"
                        >
                            <Redo2 className="size-3.5" aria-hidden />
                            <span>重做</span>
                        </button>
                        <button
                            type="button"
                            data-testid="mask-reset"
                            disabled={historyLabel.strokeCount === 0}
                            onClick={() => applyHistory(resetMaskHistory(historyRef.current))}
                            className="inline-flex h-7 items-center gap-1 rounded-[4px] px-[7px] text-[12px] leading-none text-foreground transition hover:bg-accent disabled:text-foreground/30!"
                        >
                            <RotateCcw className="size-3.5" aria-hidden />
                            <span>重置</span>
                        </button>
                        {image ? (
                            <button
                                type="button"
                                data-testid="mask-reupload"
                                disabled={busy}
                                onClick={() => {
                                    imageRef.current = null;
                                    setImage(null);
                                    setOutcomes([]);
                                    setRunSnapshot(null);
                                    applyHistory(createMaskHistory());
                                }}
                                className="inline-flex h-7 items-center gap-1 rounded-[4px] px-[7px] text-[12px] leading-none text-foreground transition hover:bg-accent disabled:text-foreground/30!"
                            >
                                <Upload className="size-3.5" aria-hidden />
                                <span>重新上传</span>
                            </button>
                        ) : null}
                        {maskRatio > 0 ? (
                            <span data-testid="mask-coverage" className="ml-1 text-[11px] text-muted-foreground">
                                {coverageLabel}
                            </span>
                        ) : null}
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
                        {image ? (
                            <div className="mx-auto w-full max-w-[920px] overflow-hidden rounded-lg bg-[repeating-conic-gradient(#00000008_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
                                <div className="relative">
                                    <img src={image.dataUrl} alt={`待重绘原图 ${image.name}`} className="block h-auto w-full select-none" draggable={false} />
                                    <canvas
                                        ref={canvasRef}
                                        data-testid="mask-canvas"
                                        onPointerDown={onPointerDown}
                                        onPointerMove={onPointerMove}
                                        onPointerUp={endStroke}
                                        onPointerCancel={endStroke}
                                        onPointerLeave={(event) => {
                                            if (event.buttons === 0) endStroke();
                                        }}
                                        className={cn("absolute inset-0 size-full touch-none", busy ? "cursor-wait" : "cursor-crosshair")}
                                        aria-label="蒙版涂抹画布"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="flex h-full min-h-[500px] items-center justify-center">
                                <div data-testid="area-repair-empty" className="w-[542px] max-w-full rounded-[8px] bg-muted p-[10px]">
                                    <Edit8UploadCard
                                        layout="stacked"
                                        products
                                        className="gap-[10px] bg-muted p-4"
                                        library={library}
                                        disabled={busy}
                                        onPick={(record) => void adoptImage(record)}
                                        media={<video src="/__cases/area-repair/guide-area-repair.mp4" poster="/__cases/area-repair/guide-area-repair.jpg" autoPlay muted loop playsInline className="h-[249px] w-full object-cover" />}
                                        heading={
                                            <>
                                                <h2 className="m-0! text-[22px] font-normal leading-[30px] text-foreground/85">局部重绘</h2>
                                                <p className="m-0! mb-[10px]! text-[14px] leading-[22px] text-muted-foreground">
                                                    上传图片，涂抹需要改变的区域并输入想要改变的内容，
                                                    <br />
                                                    即可重新对该区域进行绘制
                                                </p>
                                            </>
                                        }
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                <div data-testid="tool-config-column" className="flex min-h-0 min-w-0 flex-col">
                <div data-testid="area-repair-config" className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto rounded-[8px] bg-card">
                    <div className="px-4 py-[10px]">
                        <p className="m-0! mb-[10px]! text-[12px] leading-[22px] text-muted-foreground">
                            重绘描述<span className="text-destructive">*</span>
                        </p>
                        <textarea
                            id="area-repair-prompt"
                            data-testid="area-repair-prompt"
                            value={prompt}
                            maxLength={AREA_REPAIR_PROMPT_MAX}
                            disabled={busy}
                            onChange={(event) => {
                                const next = event.target.value.slice(0, AREA_REPAIR_PROMPT_MAX);
                                promptRef.current = next;
                                setPrompt(next);
                                persist(stateRef.current);
                            }}
                            placeholder="请补充重绘画面中想要出现的内容，支持中英文，例如：加一个包，卷发，微笑，眼睛睁大等。"
                            className="h-[120px] w-full resize-y rounded-[6px] border border-border bg-card px-[11px] py-1 text-[14px] leading-[22px] text-foreground outline-none transition placeholder:text-muted-foreground/70 hover:border-primary focus:border-primary"
                        />
                        <p className="m-0! text-right text-[14px] leading-[22px] tabular-nums text-muted-foreground">
                            {prompt.length} / {AREA_REPAIR_PROMPT_MAX}
                        </p>
                    </div>

                    <div className="px-4 py-[10px]">
                        <p className="m-0! mb-[6px]! text-[12px] leading-[22px] text-muted-foreground">生成张数</p>
                        <div className="flex items-center gap-[10px]" data-testid="area-repair-output-num">
                            {AREA_REPAIR_OUTPUT_OPTIONS.map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    aria-pressed={outputNum === option}
                                    disabled={busy}
                                    onClick={() => {
                                        const next = normalizeOutputNum(option);
                                        outputRef.current = next;
                                        setOutputNum(next);
                                        persist(stateRef.current);
                                    }}
                                    className={cn("h-[26px] rounded-[6px] border px-4 text-[12px] leading-none transition disabled:opacity-50", outputNum === option ? "border-selected bg-selected-soft text-foreground!" : "border-border bg-card text-foreground/70! hover:border-selected")}
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                    </div>

                    {image && issues.length > 0 ? (
                        <div className="px-[16px] py-2">
                            <ul data-testid="area-repair-issues" className="space-y-0.5 text-[11px] leading-4 text-amber-700 dark:text-amber-300">
                                {issues.map((issue) => (
                                    <li key={issue.field}>{issue.message}</li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

                    {conflict ? (
                        <p className="mx-[16px] my-2 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] leading-4 text-amber-700 dark:text-amber-300">草稿在其他标签页被修改，本页未覆盖；刷新可载入最新草稿。</p>
                    ) : null}
                    {notice ? (
                        <p data-testid="area-repair-notice" className="mx-[16px] my-2 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] leading-4 text-amber-700 dark:text-amber-300">
                            {notice}
                        </p>
                    ) : null}

                    {latestTask ? (
                        <div className="px-[16px] py-2">
                            <TaskStatusPanel task={latestTask} onRetry={hasFailedUnits ? () => void retryFailedUnits() : undefined} />
                        </div>
                    ) : null}
                </div>
                <button
                    type="button"
                    data-testid="area-repair-submit"
                    disabled={busy || issues.length > 0}
                    title={image ? `将生成 ${outputNum} 张` : "上传图片后可生成"}
                    onClick={() => void submit()}
                    className={cn(edit8GradientButtonClass, "mt-[10px] w-full gap-1")}
                >
                    <WandSparkles className="size-3.5" aria-hidden />
                    <span>{busy ? "生成中…" : "立即生成"}</span>
                </button>
                </div>

                <section data-testid="area-repair-result-column" data-region="results" className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[8px] bg-canvas">
                    {/* 原站「历史记录」是右上外链（/draw/history?type=32），不是第二个 Tab。 */}
                    <Edit8ResultTabs
                        tabs={[{ id: "result", label: "生成结果" }]}
                        active={resultTab === "result" ? "result" : ""}
                        onTabChange={() => setResultTab("result")}
                        onHistory={() => setResultTab("history")}
                        historyActive={resultTab === "history"}
                        historyTestId="area-repair-history-entry"
                    />
                    <div className="min-h-0 flex-1 overflow-y-auto py-4 pl-4 pr-3">
                    {resultTab === "history" ? (
                        <ToolTaskHistory
                            toolId={TOOL_ID}
                            limit={8}
                            emptyHint="暂无历史记录"
                            onSelectTask={(task) => {
                                setRestoredTask(task);
                                setResultFeedback(null);
                                setResultTab("result");
                            }}
                        />
                    ) : restoredTask ? (
                        <AreaRepairHistoryResult
                            task={restoredTask}
                            pending={resultPending}
                            feedback={resultFeedback}
                            onBack={() => {
                                setRestoredTask(null);
                                setResultFeedback(null);
                            }}
                            onDownload={(item, index) =>
                                void runResultAction(`history-download-${index}`, async () => `已下载 ${await downloadResultItem(item, index, { toolId: TOOL_ID })}`)
                            }
                            onSave={(item, index) =>
                                void runResultAction(`history-save-${index}`, async () => {
                                    await saveResultItemToAssets(item, index, {
                                        toolId: TOOL_ID,
                                        taskId: restoredTask.id,
                                        title: `历史结果 ${index + 1}`,
                                        source: "area-repair",
                                    });
                                    return `第 ${index + 1} 张已存入资产库`;
                                })
                            }
                            onSend={(item, index) =>
                                void runResultAction(`history-send-${index}`, async () => {
                                    const sent = await sendResultItemToCanvas(item, { toolId: TOOL_ID });
                                    return `第 ${index + 1} 张已发到画布 ${sent.projectId}`;
                                })
                            }
                        />
                    ) : outcomes.length === 0 ? (
                        <Edit8Empty lines={["暂无生成结果图"]} />
                    ) : (
                        <>
                            <ul data-testid="area-repair-results" className="grid grid-cols-1 gap-2">
                                {outcomes.map((outcome) => (
                                    <AreaRepairResultCard
                                        key={outcome.unitId}
                                        outcome={outcome}
                                        imageName={image?.name ?? ""}
                                        pending={resultPending}
                                        onSave={(item) => {
                                            void runResultAction(`save-${item.index}`, async () => {
                                                await saveResultItemToAssets(toResultItem(item), item.index - 1, {
                                                    toolId: TOOL_ID,
                                                    taskId: item.taskId,
                                                    title: `${image?.name ?? "局部重绘"} 第 ${item.index} 张`,
                                                    source: "area-repair",
                                                });
                                                return `第 ${item.index} 张已存入资产库`;
                                            });
                                        }}
                                        onSend={(item) => {
                                            void runResultAction(`send-${item.index}`, async () => {
                                                const sent = await sendResultItemToCanvas(toResultItem(item), { toolId: TOOL_ID });
                                                return `第 ${item.index} 张已发到画布 ${sent.projectId}`;
                                            });
                                        }}
                                    />
                                ))}
                            </ul>
                            {resultFeedback ? (
                                <p data-testid="area-repair-result-feedback" className="mt-2 text-[11px] text-muted-foreground">
                                    {resultFeedback}
                                </p>
                            ) : null}
                        </>
                    )}
                    </div>
                </section>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ *
 * TASK-015：REMOVE_PEN「局部消除」工作区
 *
 * 与 AREA_REPAIR（局部重绘）共用 mask 布局，但契约完全不同：
 *  - 只显示消除所需控件：画笔大小 / 重置 / 撤销 / 重做 / 重新上传 / 开始消除；
 *  - 没有重绘描述、张数、羽化、反选、自动扩边（这些字段本页不渲染也不提交）；
 *  - 涂抹预览用红色半透明覆盖层，导出蒙版仍是白区=消除、黑区=保留；
 *  - 结果固定单张，提供并排/滑动前后对比、下载、高清放大/商品图/手部修复接力。
 *
 * 真实边界：蒙版由画布真实笔画导出同尺寸 PNG，与原图一起作为两张参考图提交真实图像编辑接口；
 * 上游无结果即失败，不补造图片。
 * ------------------------------------------------------------------ */

export type RemovePenWorkspaceProps = { className?: string };

const REMOVE_PEN_ID = REMOVE_PEN_TOOL_ID;

export function RemovePenWorkspace({ className }: RemovePenWorkspaceProps = {}) {
    // 作品库：真实接入本地资产库，供上传卡「从作品库选择」（原站文案 §9）。
    const assets = useAssetStore((store) => store.assets);
    const library = useMemo(
        () => toolAssetLibraryItemsFromAssets(assets.filter((asset): asset is ImageAsset | VideoAsset => asset.kind === "image" || asset.kind === "video")),
        [assets],
    );
    const patchDraft = useToolDraftStore((store) => store.patch);
    const hydrateDraft = useToolDraftStore((store) => store.hydrate);
    const hydrated = useToolDraftStore((store) => store.hydrated[REMOVE_PEN_ID]);
    const conflict = useToolDraftStore((store) => store.conflicts[REMOVE_PEN_ID]);

    const [state, setState] = useState(() => createRemovePenState());
    const [history, setHistory] = useState(() => createRemovePenHistory());
    const [image, setImage] = useState<UploadedImage | null>(null);
    const [compareMode, setCompareMode] = useState<RemovePenCompareMode>("side-by-side");
    const [split, setSplit] = useState(50);
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const [run, setRun] = useState<RemovePenRun | null>(null);
    const [runSnapshot, setRunSnapshot] = useState<RemovePenSnapshot | null>(null);
    const [resultPending, setResultPending] = useState(false);
    const [resultNotice, setResultNotice] = useState("");
    const [sampleLoading, setSampleLoading] = useState<string | null>(null);
    const [historyOpen, setHistoryOpen] = useState(false);

    /* ---------------- 刷新恢复：落盘任务 → 结果区 ----------------
     * 结果区原先只认本会话 run：整页刷新后 outcomes 归零 → 结果空白，
     * 下载/存资产库/发画布三动作全部点不到（历史坞里明明有真实结果）。
     * 这里 hydrate 任务库，取最近一条带图片地址的 REMOVE_PEN 成功任务，
     * 用 removePenRunFromTask 还原成同一种 run，三动作继续吃真实字节；没有字节就不标成功，绝不补造图。
     */
    const storedTasks = useToolTaskStore((store) => store.tasks);
    const tasksHydrated = useToolTaskStore((store) => store.hydrated);
    const hydrateTasks = useToolTaskStore((store) => store.hydrate);
    const [pickedTask, setPickedTask] = useState<ToolTask | null>(null);
    useEffect(() => {
        if (!tasksHydrated) hydrateTasks();
    }, [tasksHydrated, hydrateTasks]);

    const restoredTask = useMemo(() => {
        if (run) return null;
        if (pickedTask) return pickedTask;
        const candidates = Object.values(storedTasks).filter((task) => removePenTaskHasResult(task));
        candidates.sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0));
        return candidates[0] ?? null;
    }, [run, pickedTask, storedTasks]);

    const restoredRun = useMemo<RemovePenRun | null>(() => {
        if (!restoredTask) return null;
        return removePenRunFromTask({ id: restoredTask.id, snapshotHash: restoredTask.id }, restoredTask);
    }, [restoredTask]);

    /** 本会话结果优先；没有就从落盘任务回填。 */
    const activeRun = run ?? restoredRun;

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const imageRef = useRef<UploadedImage | null>(null);
    const stateRef = useRef(state);
    const historyRef = useRef(history);
    const drawingRef = useRef<MaskStroke | null>(null);
    const compareRef = useRef(compareMode);
    const assetRef = useRef<ToolAssetRecord | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const persist = useCallback(
        (nextState: typeof state, nextCompare: RemovePenCompareMode, record: ToolAssetRecord | null) => {
            patchDraft(REMOVE_PEN_ID, {
                values: serializeRemovePenDraftValues({
                    state: nextState,
                    imageName: imageRef.current?.name ?? "",
                    compareMode: nextCompare,
                }),
                assetIds: record ? [record.id] : [],
            });
        },
        [patchDraft],
    );

    /** 笔画历史是唯一真源：撤销/重做/重置都只动笔画，画笔大小独立保存。 */
    const applyHistory = useCallback(
        (next: MaskHistory) => {
            historyRef.current = next;
            setHistory(next);
            const merged = { ...stateRef.current, strokes: next.present };
            stateRef.current = merged;
            setState(merged);
            persist(merged, compareRef.current, assetRef.current);
        },
        [persist],
    );

    const commitBrush = useCallback(
        (brushSize: number) => {
            const merged = { ...stateRef.current, brushSize: clampRemovePenBrush(brushSize) };
            stateRef.current = merged;
            setState(merged);
            persist(merged, compareRef.current, assetRef.current);
        },
        [persist],
    );

    const commitCompare = useCallback(
        (mode: RemovePenCompareMode) => {
            compareRef.current = mode;
            setCompareMode(mode);
            persist(stateRef.current, mode, assetRef.current);
        },
        [persist],
    );

    /** 刷新恢复：草稿笔画 + 资产索引 → 重新拿到真实图片字节。 */
    useEffect(() => {
        if (hydrated) return;
        void (async () => {
            const draft = await hydrateDraft(REMOVE_PEN_ID);
            const values = parseRemovePenDraftValues(draft?.values ?? {});
            historyRef.current = createRemovePenHistory(values.state.strokes);
            stateRef.current = values.state;
            setHistory(historyRef.current);
            setState(values.state);
            compareRef.current = values.compareMode;
            setCompareMode(values.compareMode);
            const assetId = draft?.assetIds?.[0];
            if (!assetId) return;
            const { records, lostIds } = await loadToolAssetRecords([assetId]);
            const record = records[0];
            if (!record) {
                if (lostIds.length > 0) setNotice("上次的图片已不在本地资产库，请重新上传（草稿笔画已保留）。");
                return;
            }
            assetRef.current = record;
            const dataUrl = await imageToDataUrl({ storageKey: record.storageKey, url: record.url });
            if (!dataUrl) {
                setNotice("上次的图片字节不可用，请重新上传。");
                return;
            }
            const size = await new Promise<{ width: number; height: number }>((resolve) => {
                const probe = new window.Image();
                probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
                probe.onerror = () => resolve({ width: 0, height: 0 });
                probe.src = dataUrl;
            });
            if (!size.width || !size.height) {
                setNotice("无法读取上次图片的尺寸，请重新上传。");
                return;
            }
            const restored: UploadedImage = { id: record.id, name: record.name, dataUrl, width: size.width, height: size.height };
            imageRef.current = restored;
            setImage(restored);
        })();
    }, [hydrateDraft, hydrated]);

    /** 涂抹预览：真实笔画绘制在图片之上（红色半透明 = 将被消除）。 */
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const current = imageRef.current;
        if (!canvas || !current) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);
        const ratio = width / Math.max(1, current.width);
        const strokes = drawingRef.current ? [...historyRef.current.present, drawingRef.current] : historyRef.current.present;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(255, 60, 60, 0.45)";
        ctx.fillStyle = "rgba(255, 60, 60, 0.45)";
        for (const stroke of strokes) {
            if (stroke.points.length === 0) continue;
            const points = stroke.points;
            ctx.lineWidth = Math.max(1, stroke.size * ratio);
            ctx.beginPath();
            ctx.moveTo(points[0]!.x * width, points[0]!.y * height);
            if (points.length === 1) {
                ctx.arc(points[0]!.x * width, points[0]!.y * height, Math.max(1, (stroke.size * ratio) / 2), 0, Math.PI * 2);
                ctx.fill();
                continue;
            }
            for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i]!.x * width, points[i]!.y * height);
            ctx.stroke();
        }
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !image) return;
        const longest = Math.max(image.width, image.height);
        const ratio = longest > 1400 ? 1400 / longest : 1;
        canvas.width = Math.max(1, Math.round(image.width * ratio));
        canvas.height = Math.max(1, Math.round(image.height * ratio));
        draw();
    }, [image, history, draw]);

    const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return normalizePoint({
            x: (event.clientX - rect.left) / Math.max(1, rect.width),
            y: (event.clientY - rect.top) / Math.max(1, rect.height),
        });
    };

    const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!imageRef.current || busy) return;
        const stroke = beginRemovePenStroke(stateRef.current, pointFromEvent(event), randomId());
        drawingRef.current = stroke;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        draw();
    };

    const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const stroke = drawingRef.current;
        if (!stroke) return;
        drawingRef.current = extendRemovePenStroke(stroke, pointFromEvent(event));
        draw();
    };

    const onPointerUp = () => {
        const stroke = drawingRef.current;
        if (!stroke) return;
        drawingRef.current = null;
        applyHistory(commitRemovePenStroke(historyRef.current, stroke));
    };

    const undo = () => applyHistory(undoRemovePenStroke(historyRef.current));
    const redo = () => applyHistory(redoRemovePenStroke(historyRef.current));
    const reset = () => applyHistory(resetRemovePenStrokes(historyRef.current));

    const adoptImage = useCallback(
        async (record: ToolAssetRecord) => {
            // 幂等：同一资产重复回调不清空已画笔画。
            if (assetRef.current?.id === record.id && imageRef.current) return;
            assetRef.current = record;
            const dataUrl = await imageToDataUrl({ storageKey: record.storageKey, url: record.url });
            if (!dataUrl) {
                setNotice("这张图片的本地数据已不可用，请重新上传");
                return;
            }
            const size = await new Promise<{ width: number; height: number }>((resolve) => {
                const probe = new window.Image();
                probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
                probe.onerror = () => resolve({ width: 0, height: 0 });
                probe.src = dataUrl;
            });
            if (!size.width || !size.height) {
                setNotice("无法读取图片尺寸，请换一张图片");
                return;
            }
            const sourceIssues = validateRemovePenSource({ name: record.name, bytes: record.bytes, width: size.width, height: size.height });
            if (sourceIssues.length > 0) {
                setNotice(sourceIssues.map((issue) => issue.message).join("；"));
                return;
            }
            const next: UploadedImage = { id: record.id, name: record.name, dataUrl, width: size.width, height: size.height };
            imageRef.current = next;
            setImage(next);
            // 换图必须清空蒙版：旧笔画坐标属于上一张图（规格 §3）。
            const cleared = createRemovePenState({ brushSize: stateRef.current.brushSize });
            historyRef.current = createRemovePenHistory([]);
            stateRef.current = cleared;
            setHistory(historyRef.current);
            setState(cleared);
            setRun(null);
            setRunSnapshot(null);
            setNotice(sourceIssues.length ? sourceIssues.map((issue) => issue.message).join("；") : "");
            persist(cleared, compareRef.current, record);
        },
        [persist],
    );

    /** 「或试试这些」：示例素材是仓库内真实文件，走真实入库再载入，不伪造画布。 */
    const applySample = useCallback(
        async (sample: (typeof REMOVE_PEN_SAMPLES)[number]) => {
            if (busy || sampleLoading) return;
            setSampleLoading(sample.id);
            setNotice("");
            try {
                const response = await fetch(sample.src);
                if (!response.ok) throw new Error(`示例素材读取失败（HTTP ${response.status}）`);
                const blob = await response.blob();
                const mime = blob.type || "image/png";
                const file = new File([blob], `remove-pen-sample-${sample.id}.${mime.split("/")[1] || "png"}`, { type: mime });
                const record = await uploadToolAsset(file);
                await adoptImage(record);
                setNotice(`已载入示例「${sample.name}」，涂抹要消除的区域后点「开始消除」`);
            } catch (error) {
                setNotice(error instanceof Error ? error.message : "示例素材载入失败");
            } finally {
                setSampleLoading(null);
            }
        },
        [adoptImage, busy, sampleLoading],
    );

    const historyLabel = useMemo(() => removePenHistoryState(history), [history]);
    const issues = useMemo(
        () =>
            validateRemovePenInput({
                imageUrl: image?.dataUrl ?? "",
                maskUrl: removePenMaskIsEmpty(state) ? "" : "drawn",
            }),
        [image, state],
    );
    const currentSnapshot = useMemo(
        () =>
            buildRemovePenSnapshot({
                imageAssetId: image?.id ?? "",
                imageName: image?.name ?? "",
                imageWidth: image?.width ?? 0,
                imageHeight: image?.height ?? 0,
                state,
                clientOperationId: "preview",
            }),
        [image, state],
    );
    const stale = runSnapshot ? isRemovePenSnapshotStale(runSnapshot, currentSnapshot) : false;
    const view = useMemo(() => removePenResultView({ run: activeRun, running: busy, sourceUrl: image?.dataUrl, stale }), [activeRun, busy, image, stale]);

    /**
     * 结果字节回读：刷新后快照只剩 storageKey（dataUrl 被剥、url 是失效 blob:），
     * 这里按 storageKey 从 media_files 取回真实字节的对象 URL 供渲染与接力。
     * 只读真实存在的字节，取不到就保持空（不造图）。
     */
    const resultStorageKey = activeRun?.image?.storageKey;
    const [storedResultUrl, setStoredResultUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!resultStorageKey) {
            setStoredResultUrl(null);
            return;
        }
        let cancelled = false;
        void resolveMediaUrl(resultStorageKey)
            .then((url) => {
                if (!cancelled) setStoredResultUrl(url || null);
            })
            .catch(() => {
                if (!cancelled) setStoredResultUrl(null);
            });
        return () => {
            cancelled = true;
        };
    }, [resultStorageKey]);

    /* ---------------- 结果动作：存入资产库 / 发送画布 ---------------- */

    /** 只把本次真实返回的结果包装成结果项；storageKey 必须带出去，刷新后三动作才吃得到真实字节。 */
    const resultItem = useCallback(
        (): ToolTaskResultItem | null => removePenResultItem(activeRun, REMOVE_PEN_ID, storedResultUrl ?? undefined),
        [activeRun, storedResultUrl],
    );

    const saveResult = useCallback(async () => {
        const item = resultItem();
        if (!item) {
            setResultNotice("没有可保存的真实结果，请先完成一次消除。");
            return;
        }
        setResultPending(true);
        try {
            const saved = await saveResultItemToAssets(item, 0, {
                toolId: REMOVE_PEN_ID,
                title: `${image?.name ?? "remove-pen"} 消除结果`,
                source: "局部消除",
            });
            setResultNotice(`已存入资产库（${saved.assetId.slice(0, 8)}）`);
        } catch (error) {
            setResultNotice(error instanceof Error ? error.message : "存入资产库失败");
        } finally {
            setResultPending(false);
        }
    }, [image?.name, resultItem]);

    const sendResult = useCallback(async () => {
        const item = resultItem();
        if (!item) {
            setResultNotice("没有可发送的真实结果，请先完成一次消除。");
            return;
        }
        setResultPending(true);
        try {
            const sent = await sendResultItemToCanvas(item, { toolId: REMOVE_PEN_ID });
            setResultNotice(`已发送画布（项目 ${sent.projectId.slice(0, 8)} · 节点 ${sent.nodeId.slice(0, 8)}）`);
        } catch (error) {
            setResultNotice(error instanceof Error ? error.message : "发送画布失败");
        } finally {
            setResultPending(false);
        }
    }, [resultItem]);
    const resultUrl = view.imageUrl ?? storedResultUrl ?? undefined;

    /** 提交：导出同尺寸蒙版 → 校验字段 → 一次真实图像编辑请求。 */
    const submit = useCallback(async () => {
        if (busy) return;
        const current = imageRef.current;
        if (!current) {
            setNotice("请先上传需要消除的图片");
            return;
        }
        if (removePenMaskIsEmpty(stateRef.current)) {
            setNotice("请先用画笔涂抹要消除的区域，白色蒙版为空时无法提交");
            return;
        }
        setBusy(true);
        setNotice("");
        try {
            const mask = await exportRemovePenMaskPng(stateRef.current, { width: current.width, height: current.height });
            const problems = validateRemovePenInput({
                imageUrl: current.dataUrl,
                maskUrl: mask.dataUrl,
                imageWidth: current.width,
                imageHeight: current.height,
                maskWidth: mask.width,
                maskHeight: mask.height,
            });
            if (problems.length > 0) {
                setNotice(problems.map((issue) => issue.message).join("；"));
                return;
            }
            const snapshot = buildRemovePenSnapshot({
                imageAssetId: current.id,
                imageName: current.name,
                imageWidth: current.width,
                imageHeight: current.height,
                state: stateRef.current,
                maskWidth: mask.width,
                maskHeight: mask.height,
                maskDataUrl: mask.dataUrl,
                draftRevision: useToolDraftStore.getState().drafts[REMOVE_PEN_ID]?.revision ?? null,
                clientOperationId: randomId(),
            });
            setRunSnapshot(snapshot);
            const controller = new AbortController();
            abortRef.current = controller;
            const { buildRemovePenUnit, createRemovePenRunPort, runRemovePen, toRemovePenReference } = await import("@/features/tools/adapters/remove-pen");
            const record = assetRef.current;
            const imageRefInput = toRemovePenReference({
                id: current.id,
                name: current.name,
                type: record?.mimeType ?? "image/png",
                dataUrl: current.dataUrl,
                ...(record?.url ? { url: record.url } : {}),
                ...(record?.storageKey ? { storageKey: record.storageKey } : {}),
            });
            const maskReference = {
                id: `${current.id}-mask`,
                name: "remove-pen-mask.png",
                type: "image/png",
                dataUrl: mask.dataUrl,
            };
            const unit = buildRemovePenUnit({ snapshot, image: imageRefInput, mask: maskReference });
            const port = await createRemovePenRunPort();
            const nextRun = await runRemovePen({
                unit,
                port,
                signal: controller.signal,
                draftRevision: snapshot.draftRevision,
            });
            setRun(nextRun);
            if (nextRun.status !== "succeeded") {
                setNotice(nextRun.error?.message ?? "消除没有返回结果，请按原参数重试");
            }
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "消除失败，请稍后再试");
        } finally {
            setBusy(false);
            abortRef.current = null;
        }
    }, [busy]);

    const uploadCard = (
        <div className="rounded-[8px] bg-muted p-[10px]">
            <Edit8UploadCard
                testId="remove-pen-upload-card"
                layout="stacked"
                products
                className="gap-[10px] bg-muted"
                library={library}
                disabled={busy}
                onPick={(record) => void adoptImage(record)}
                media={<video src="/__cases/remove-pen/guide-remove-pen.mp4" autoPlay muted loop playsInline className="mt-[10px] h-[333px] w-full object-cover" />}
                heading={
                    <>
                        <h2 className="m-0! text-[22px] font-normal leading-[30px] text-foreground/85">局部消除</h2>
                        <p className="m-0! mb-[10px]! text-[14px] leading-[22px] text-muted-foreground">上传需要消除的图片，使用画笔涂抹即可实现一键消除</p>
                    </>
                }
                footer={
                    <>
                        {/* 原站「或试试这些」= 分隔线 + 4 张 40×40 示例缩略图（原站同源），点击即真实载入。 */}
                        <div className="flex w-[364px] max-w-full items-center gap-4 pt-[10px]" data-testid="remove-pen-try-these">
                            <span className="h-px flex-1 bg-border" />
                            <span className="text-[12px] font-medium leading-[15px] text-muted-foreground">或试试这些</span>
                            <span className="h-px flex-1 bg-border" />
                        </div>
                        <div className="flex items-center justify-center gap-5 pb-[15px] pt-[10px]">
                            {REMOVE_PEN_SAMPLES.map((sample) => (
                                <button
                                    key={sample.id}
                                    type="button"
                                    data-testid={`remove-pen-sample-${sample.id}`}
                                    disabled={busy || sampleLoading !== null}
                                    title={`试用${sample.name}`}
                                    onClick={() => void applySample(sample)}
                                    className="size-10 overflow-hidden rounded-[4px] transition hover:ring-2 hover:ring-selected disabled:opacity-50"
                                >
                                    <img src={sample.src} alt={sample.name} className="size-full object-cover" draggable={false} />
                                </button>
                            ))}
                        </div>
                        {sampleLoading ? <p className="m-0! pb-2 text-center text-[11px] text-muted-foreground">正在载入示例素材…</p> : null}
                    </>
                }
            />
        </div>
    );

    return (
        <div
            data-tool={REMOVE_PEN_ID}
            data-layout="linkfox-edit8"
            data-testid="remove-pen-workspace"
            data-workspace-columns="remove-pen"
            data-canvas="true"
            data-config-side="none"
            className={cn("flex h-full min-h-0 flex-col bg-canvas p-[10px] text-foreground", className)}
        >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[8px]">
            {/* 原站（1600×1000）：48px 工具条（1px 边、圆角 8 8 0 0）左右各半 + 画布；空态卡 520 宽居中；结果动作常驻工具条。 */}
            <div className="flex h-12 shrink-0 items-center rounded-t-[8px] border border-border bg-card px-3 text-xs text-foreground shadow-sm" data-testid="remove-pen-toolbar">
                <div className="flex min-w-0 flex-1 items-center gap-[10px] pr-[10px]">
                <span className="inline-flex h-6 items-center gap-1 text-[14px] leading-[22px] text-foreground/85">
                    <Paintbrush className="size-3.5" aria-hidden />
                    <span>画笔</span>
                </span>

                <label className="flex items-center gap-1 text-[12px] text-foreground/60">
                    <span>大小：</span>
                    <span className="inline-flex h-6 items-center gap-1 rounded-[4px] border border-border bg-card pl-[7px] pr-1">
                    <input
                        type="number"
                        data-testid="remove-pen-brush-size"
                        min={REMOVE_PEN_BRUSH_MIN}
                        max={REMOVE_PEN_BRUSH_MAX}
                        value={state.brushSize}
                        onChange={(event) => commitBrush(Number(event.target.value))}
                        className="h-[22px] w-[22px] bg-transparent px-0 text-[12px] tabular-nums text-foreground outline-none [&::-webkit-inner-spin-button]:appearance-none"
                        aria-label="画笔大小像素"
                    />
                    <span className="text-muted-foreground">像素</span>
                    <span className="relative inline-flex size-3 items-center justify-center" data-testid="remove-pen-brush-presets">
                        <ChevronDown className="pointer-events-none size-3 text-muted-foreground" aria-hidden />
                        <select
                            value={state.brushSize}
                            disabled={busy}
                            onChange={(event) => commitBrush(Number(event.target.value))}
                            aria-label="画笔大小预设"
                            className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
                        >
                            {REMOVE_PEN_BRUSH_PRESETS.map((preset) => (
                                <option key={preset} value={preset}>
                                    {preset}
                                </option>
                            ))}
                        </select>
                    </span>
                    </span>
                </label>

                <button
                    type="button"
                    data-testid="remove-pen-reset-mask"
                    disabled={historyLabel.strokeCount === 0 || busy}
                    onClick={reset}
                    className="inline-flex h-7 items-center gap-1 rounded-[4px] px-[7px] text-[12px] text-foreground hover:bg-accent disabled:text-foreground/30!"
                >
                    <RotateCcw className="size-3" aria-hidden /> <span>重置</span>
                </button>
                <button
                    type="button"
                    data-testid="remove-pen-undo"
                    disabled={!historyLabel.canUndo || busy}
                    onClick={undo}
                    className="inline-flex h-7 items-center gap-1 rounded-[4px] px-[7px] text-[12px] text-foreground hover:bg-accent disabled:text-foreground/30!"
                >
                    <Undo2 className="size-3" aria-hidden /> <span>撤销</span>
                </button>
                <button
                    type="button"
                    data-testid="remove-pen-redo"
                    disabled={!historyLabel.canRedo || busy}
                    onClick={redo}
                    className="inline-flex h-7 items-center gap-1 rounded-[4px] px-[7px] text-[12px] text-foreground hover:bg-accent disabled:text-foreground/30!"
                >
                    <Redo2 className="size-3" aria-hidden /> <span>重做</span>
                </button>
                <button
                    type="button"
                    data-testid="remove-pen-reset-image"
                    disabled={!image || busy}
                    onClick={() => {
                        imageRef.current = null;
                        assetRef.current = null;
                        setImage(null);
                        const cleared = createRemovePenState({ brushSize: stateRef.current.brushSize });
                        historyRef.current = createRemovePenHistory([]);
                        stateRef.current = cleared;
                        setHistory(historyRef.current);
                        setState(cleared);
                        setRun(null);
                        setRunSnapshot(null);
                        patchDraft(REMOVE_PEN_ID, { values: serializeRemovePenDraftValues({ state: cleared, imageName: "", compareMode: compareRef.current }), assetIds: [] });
                    }}
                    className="inline-flex h-7 items-center gap-1 rounded-[4px] px-[7px] text-[12px] text-foreground hover:bg-accent disabled:text-foreground/30!"
                >
                    <Upload className="size-3" aria-hidden /> <span>重新上传</span>
                </button>
                </div>

                <div className="flex min-w-0 flex-1 items-center gap-[10px] pl-[10px]">

                {/* 结果动作常驻工具条：未出结果时「下载图片」等保持原位禁用，不隐藏、不另起区块。 */}
                <button
                    type="button"
                    data-testid="remove-pen-submit"
                    disabled={busy || issues.length > 0}
                    onClick={() => void submit()}
                    title={image ? issues[0]?.message : "请先上传需要消除的图片"}
                    className={cn(edit8GradientButtonClass, "h-7 gap-1 text-[12px]")}
                >
                    <WandSparkles className="size-3.5" aria-hidden />
                    <span>{busy ? "消除中…" : "开始消除"}</span>
                </button>
                {resultUrl ? (
                    <a
                        data-testid="remove-pen-download"
                        href={resultUrl}
                        download={removePenDownloadName(image?.name ?? "remove-pen")}
                        className="inline-flex h-7 items-center gap-1 rounded-[4px] border border-border bg-card px-[7px] text-[12px] text-foreground! hover:bg-accent"
                    >
                        <Download className="size-3" aria-hidden /> 下载图片
                    </a>
                ) : (
                    <button
                        type="button"
                        data-testid="remove-pen-download"
                        disabled
                        className="inline-flex h-7 items-center gap-1 rounded-[4px] border border-border bg-card px-[7px] text-[12px] text-foreground! hover:bg-accent disabled:bg-foreground/[0.04] disabled:text-foreground/30!"
                    >
                        <Download className="size-3" aria-hidden /> 下载图片
                    </button>
                )}
                {REMOVE_PEN_HANDOFFS.map((handoff) =>
                    resultUrl ? (
                        <Link
                            key={handoff.id}
                            data-testid={`remove-pen-handoff-${handoff.id}`}
                            to={buildRemovePenHandoff(handoff.id, resultUrl).route}
                            state={{ handoff: { from: REMOVE_PEN_ID, field: handoff.field, value: resultUrl } }}
                            className="inline-flex h-7 items-center gap-1 rounded-[4px] border border-border bg-card px-[7px] text-[12px] text-foreground! hover:bg-accent"
                        >
                            <HandoffIcon id={handoff.id} />
                            {handoff.label}
                        </Link>
                    ) : (
                        <button
                            key={handoff.id}
                            type="button"
                            data-testid={`remove-pen-handoff-${handoff.id}`}
                            disabled
                            className="inline-flex h-7 items-center gap-1 rounded-[4px] border border-border bg-card px-[7px] text-[12px] text-foreground! hover:bg-accent disabled:bg-foreground/[0.04] disabled:text-foreground/30!"
                        >
                            <HandoffIcon id={handoff.id} />
                            {handoff.label}
                        </button>
                    ),
                )}
                {/* 原站「历史记录」在工具条右端；本地没有独立历史页，用同一任务库的真实历史面板承接。 */}
                <button
                    type="button"
                    data-testid="remove-pen-history"
                    aria-pressed={historyOpen}
                    onClick={() => setHistoryOpen((value) => !value)}
                    className={cn(
                        "ml-auto! inline-flex h-7 shrink-0 items-center gap-1 text-[12px] text-muted-foreground! hover:text-foreground!",
                        historyOpen && "font-medium text-foreground!",
                    )}
                >
                    <History className="size-3" aria-hidden />
                    历史记录
                </button>
                </div>
            </div>

            {/* 原站局部消除没有配置列（工具条通栏 + 画布内结果），所以这里是单列主区。 */}
            <div data-testid="tool-main-column" className="min-h-0 flex-1 overflow-y-auto rounded-none!">
                {historyOpen ? (
                    <div className="p-4" data-testid="remove-pen-history-panel">
                        <ToolTaskHistory
                            toolId={REMOVE_PEN_ID}
                            limit={10}
                            emptyHint="暂无历史任务"
                            onSelectTask={(task) => {
                                setPickedTask(task);
                                setHistoryOpen(false);
                            }}
                        />
                    </div>
                ) : null}
                {!historyOpen && (conflict || notice) ? (
                    <div className="flex flex-col gap-1 px-4 pt-2 text-[11px]">
                        {conflict ? <p className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300">草稿在其他标签页被修改，本页未覆盖；刷新可载入最新草稿。</p> : null}
                        {notice ? (
                            <p data-testid="remove-pen-notice" className="rounded-md bg-card px-2 py-1 text-muted-foreground">
                                {notice}
                            </p>
                        ) : null}
                    </div>
                ) : null}

                {historyOpen ? null : image ? (
                    <div className="flex flex-col gap-3 p-4">
                        <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-lg bg-[repeating-conic-gradient(#00000008_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
                            <img src={image.dataUrl} alt="待消除原图" className="block max-h-[520px] w-auto max-w-full select-none" draggable={false} />
                            <canvas
                                ref={canvasRef}
                                data-testid="remove-pen-canvas"
                                aria-label="涂抹画布"
                                onPointerDown={onPointerDown}
                                onPointerMove={onPointerMove}
                                onPointerUp={onPointerUp}
                                onPointerCancel={onPointerUp}
                                className="absolute inset-0 size-full cursor-crosshair touch-none"
                            />
                        </div>
                        {issues.length > 0 ? (
                            <ul data-testid="remove-pen-issues" className="mx-auto w-fit rounded-lg bg-card p-2 text-[11px] text-muted-foreground">
                                {issues.map((issue) => (
                                    <li key={issue.field}>· {issue.message}</li>
                                ))}
                            </ul>
                        ) : null}

                        {/* 结果区常驻：无结果时保留空态与动作位，不隐藏、不搬到画布下方。 */}
                        <div data-testid="remove-pen-result" className="mx-auto flex w-fit max-w-full flex-col gap-2 rounded-lg border border-border bg-card p-3">
                            {view.status === "running" ? <p className="text-[11px] text-muted-foreground">正在等待真实结果…</p> : null}
                            {view.error && view.status !== "running" ? (
                                <p data-testid="remove-pen-error" className="rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
                                    {view.error.message}（诊断码：{view.error.code}）
                                </p>
                            ) : null}
                            {activeRun?.task ? <TaskStatusPanel task={activeRun.task} /> : null}
                            {resultUrl ? (
                                <>
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-[12px] font-medium text-foreground">前后对比</p>
                                        <div className="flex items-center gap-1">
                                            {REMOVE_PEN_COMPARE_MODES.map((mode) => (
                                                <button
                                                    key={mode.id}
                                                    type="button"
                                                    data-testid={`remove-pen-compare-${mode.id}`}
                                                    aria-pressed={compareMode === mode.id}
                                                    onClick={() => commitCompare(mode.id)}
                                                    className={cn(
                                                        "h-[24px] rounded-md border px-2 text-[11px] leading-none transition",
                                                        compareMode === mode.id ? "border-border bg-accent font-medium text-foreground" : "border-border bg-card text-foreground hover:bg-accent",
                                                    )}
                                                >
                                                    {mode.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {compareMode === "slider" && image ? (
                                        <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded border border-border">
                                            <img src={image.dataUrl} alt="原图" className="block max-h-[520px] w-auto max-w-full select-none" draggable={false} />
                                            <img
                                                src={resultUrl}
                                                alt="消除结果"
                                                className="absolute inset-0 size-full object-fill"
                                                style={{ clipPath: `inset(0 0 0 ${100 - clampCompareSplit(split)}%)` }}
                                                draggable={false}
                                            />
                                            <input
                                                type="range"
                                                min={0}
                                                max={100}
                                                value={clampCompareSplit(split)}
                                                onChange={(event) => setSplit(Number(event.target.value))}
                                                aria-label="前后对比滑动"
                                                className="absolute inset-x-2 bottom-2 accent-primary"
                                            />
                                        </div>
                                    ) : compareMode === "side-by-side" && image ? (
                                        <div data-testid="remove-pen-compare" className="grid grid-cols-2 gap-2">
                                            <figure>
                                                <img src={image.dataUrl} alt="原图" className="block w-full rounded border border-border object-contain" draggable={false} />
                                                <figcaption className="mt-1 text-center text-[10px] text-muted-foreground">原图</figcaption>
                                            </figure>
                                            <figure>
                                                <img src={resultUrl} alt="消除结果" className="block w-full rounded border border-border object-contain" draggable={false} />
                                                <figcaption className="mt-1 text-center text-[10px] text-muted-foreground">消除后</figcaption>
                                            </figure>
                                        </div>
                                    ) : (
                                        <img src={resultUrl} alt="消除结果" className="mx-auto block max-h-[520px] w-auto max-w-full rounded border border-border" draggable={false} />
                                    )}
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            data-testid="remove-pen-save"
                                            disabled={resultPending}
                                            onClick={() => void saveResult()}
                                            className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {resultPending ? "处理中…" : "存入资产"}
                                        </button>
                                        <button
                                            type="button"
                                            data-testid="remove-pen-send"
                                            disabled={resultPending}
                                            onClick={() => void sendResult()}
                                            className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {resultPending ? "处理中…" : "发送画布"}
                                        </button>
                                        {resultNotice ? (
                                            <p data-testid="remove-pen-result-feedback" className="text-[11px] text-muted-foreground">{resultNotice}</p>
                                        ) : null}
                                    </div>
                                </>
                            ) : (
                                <p className="text-[11px] text-muted-foreground">暂无消除结果图：涂抹要消除的区域后点「开始消除」。</p>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex min-h-full flex-col items-center justify-center gap-4 px-4 py-6">
                        <div className="w-full max-w-[540px] [&_[data-testid=remove-pen-upload-card]]:mx-auto [&_[data-testid=remove-pen-upload-card]]:max-w-[520px]">{uploadCard}</div>
                    </div>
                )}
            </div>
            </div>
        </div>
    );
}

export default MaskWorkspace;
