import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Eraser, Paintbrush, Redo2, RotateCcw, Sparkles, Undo2 } from "lucide-react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolShell } from "@/components/tools/tool-shell";
import { TaskStatusPanel } from "@/components/tools/task-status";
import { saveResultItemToAssets, sendResultItemToCanvas } from "@/components/tools/tool-result-actions";
import { buildAreaRepairUnits, createAreaRepairRunPort, renderMaskPng, runAreaRepairUnits, type AreaRepairUnitOutcome } from "@/features/tools/adapters/area-repair";
import { getToolById, toolSpecs } from "@/features/tools/registry";
import {
    AREA_REPAIR_DEFAULT_OUTPUT,
    AREA_REPAIR_OUTPUT_OPTIONS,
    AREA_REPAIR_PROMPT_MAX,
    AREA_REPAIR_SLUG,
    AREA_REPAIR_TOOL_ID,
    areaRepairDownloadName,
    MASK_BRUSH_MAX,
    MASK_BRUSH_MIN,
    MASK_FEATHER_MAX,
    MASK_FEATHER_MIN,
    appendStrokePoint,
    buildAreaRepairSnapshot,
    clampBrushSize,
    clampFeather,
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
import { clampCompareSplit, exportRemovePenMaskPng, removePenResultView, removePenRunFromTask, runRemovePen, type RemovePenRun } from "@/features/tools/adapters/remove-pen";
import {
    REMOVE_PEN_BRUSH_MAX,
    REMOVE_PEN_BRUSH_MIN,
    REMOVE_PEN_BRUSH_PRESETS,
    REMOVE_PEN_COMPARE_MODES,
    REMOVE_PEN_HANDOFFS,
    REMOVE_PEN_SLUG,
    REMOVE_PEN_TOOL_ID,
    buildRemovePenHandoff,
    buildRemovePenSnapshot,
    clampRemovePenBrush,
    describeRemovePenCoverage,
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
import { loadToolAssetRecords, type ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
import { imageToDataUrl } from "@/services/image-storage";
import { flushToolDrafts, useToolDraftStore } from "@/stores/use-tool-draft-store";

export type MaskWorkspaceProps = { className?: string };

type UploadedImage = { id: string; name: string; dataUrl: string; width: number; height: number };

const TOOL_ID = AREA_REPAIR_TOOL_ID;

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

export function MaskWorkspace({ className }: MaskWorkspaceProps = {}) {
    const spec = useMemo(() => getToolById(TOOL_ID), []);
    const siblings = useMemo(() => toolSpecs.filter((tool) => tool.layout === "mask" && tool.id !== TOOL_ID), []);
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
            setRunSnapshot(snapshot);
            const real = createAreaRepairRunPort();
            const port = {
                async run(input: Parameters<typeof real.run>[0], options?: Parameters<typeof real.run>[1]) {
                    const task = await real.run(input, options);
                    setTasks((prev) => [...prev, task]);
                    return task;
                },
            };
            // 同一通道并发提交会互相拖住（实测并发 2 时两个单元都停在 submitting），逐张串行提交；
            // 每张完成就回流到结果区，用户不必等到全部结束才看到图。
            const results = await runAreaRepairUnits(units, {
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
    }, [busy]);

    function auditFields(units: ReturnType<typeof buildAreaRepairUnits>) {
        const specKeys = spec?.fields.map((field) => field.key) ?? [];
        const missing = specKeys.filter((key) => !(key in units[0].fields) && key !== "imageUrl" && key !== "maskUrl" && key !== "prompt");
        const issuesOut: string[] = [];
        if (missing.length > 0) issuesOut.push(`提交字段缺失：${missing.join("、")}`);
        if (units[0].references.length !== 2) issuesOut.push("蒙版没有作为第二张参考图提交");
        return issuesOut;
    }

    const retryUnit = useCallback(async () => {
        setNotice("重试会以当前参数重新提交全部张数，避免同一批结果混用不同输入。");
        await submit();
    }, [submit]);

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

    return (
        <ToolShell
            className={className}
            title={spec?.title ?? "局部重绘"}
            subtitle="涂抹需要改变的区域并填写重绘描述，只重绘蒙版内内容；原图与结果并排可对照"
            badges={<span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">{spec ? `makeType ${spec.makeType}` : AREA_REPAIR_TOOL_ID}</span>}
            actions={
                <button
                    type="button"
                    data-testid="area-repair-submit"
                    disabled={busy || issues.length > 0}
                    onClick={() => void submit()}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Sparkles className="size-3.5" aria-hidden />
                    {busy ? "生成中…" : "立即生成"}
                </button>
            }
            notices={
                <>
                    {conflict ? <p className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">草稿在其他标签页被修改，本页未覆盖；刷新可载入最新草稿。</p> : null}
                    {notice ? (
                        <p data-testid="area-repair-notice" className="rounded border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                            {notice}
                        </p>
                    ) : null}
                    {stale ? <p className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">输入已变更：当前展示的是上一次提交的结果，不代表当前参数。</p> : null}
                </>
            }
            sidebar={
                <nav className="flex flex-col gap-1 p-2 text-xs">
                    <span className="px-2 py-1 font-medium text-foreground">局部重绘</span>
                    {siblings.map((tool) => (
                        <Link key={tool.id} to={tool.route} className="rounded px-2 py-1 text-muted-foreground transition hover:bg-accent hover:text-foreground">
                            {tool.title}
                        </Link>
                    ))}
                    <Link to={`/tools/smart-edit/${AREA_REPAIR_SLUG}`} className="mt-2 px-2 py-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline">
                        本页路由
                    </Link>
                </nav>
            }
        >
            <div data-testid="area-repair-workspace" className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                {/* 左：蒙版画布 */}
                <section className="flex min-w-0 flex-col gap-3">
                    <div data-testid="mask-toolbar" className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
                        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                            <button
                                type="button"
                                data-testid="mask-tool-brush"
                                aria-pressed={state.tool === "brush"}
                                onClick={() => commit({ tool: "brush" })}
                                className={cn("inline-flex items-center gap-1 rounded px-2 py-1 text-[11px]", state.tool === "brush" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                            >
                                <Paintbrush className="size-3.5" aria-hidden />
                                画笔
                            </button>
                            <button
                                type="button"
                                data-testid="mask-tool-eraser"
                                aria-pressed={state.tool === "eraser"}
                                onClick={() => commit({ tool: "eraser" })}
                                className={cn("inline-flex items-center gap-1 rounded px-2 py-1 text-[11px]", state.tool === "eraser" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                            >
                                <Eraser className="size-3.5" aria-hidden />
                                橡皮
                            </button>
                        </div>

                        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            大小
                            <input
                                type="range"
                                data-testid="mask-brush-size"
                                min={MASK_BRUSH_MIN}
                                max={MASK_BRUSH_MAX}
                                value={state.brushSize}
                                onChange={(event) => commit({ brushSize: clampBrushSize(event.target.value) })}
                                className="w-24 accent-primary"
                                aria-label="画笔大小"
                            />
                            <input
                                type="number"
                                min={MASK_BRUSH_MIN}
                                max={MASK_BRUSH_MAX}
                                value={state.brushSize}
                                onChange={(event) => commit({ brushSize: clampBrushSize(event.target.value) })}
                                className="w-14 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground"
                                aria-label="画笔大小像素"
                            />
                            像素
                        </label>

                        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            羽化
                            <input
                                type="range"
                                data-testid="mask-feather"
                                min={MASK_FEATHER_MIN}
                                max={MASK_FEATHER_MAX}
                                value={state.feather}
                                onChange={(event) => commit({ feather: clampFeather(event.target.value) })}
                                className="w-20 accent-primary"
                                aria-label="羽化"
                            />
                            <span className="tabular-nums text-foreground">{state.feather}</span>
                        </label>

                        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <input type="checkbox" data-testid="mask-auto-expand" checked={state.autoExpand} onChange={(event) => commit({ autoExpand: event.target.checked })} className="size-3.5 accent-primary" />
                            自动扩大选择区域
                        </label>

                        <button
                            type="button"
                            data-testid="mask-invert"
                            aria-pressed={state.inverted}
                            disabled={historyLabel.strokeCount === 0}
                            onClick={() => commit({ inverted: !state.inverted })}
                            className={cn("rounded border border-border px-2 py-1 text-[11px] disabled:opacity-40", state.inverted ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                        >
                            反选
                        </button>
                        <button
                            type="button"
                            data-testid="mask-undo"
                            disabled={!historyLabel.canUndo}
                            onClick={() => applyHistory(undoMaskStroke(historyRef.current))}
                            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent disabled:opacity-40"
                        >
                            <Undo2 className="size-3.5" aria-hidden />
                            撤销
                        </button>
                        <button
                            type="button"
                            data-testid="mask-redo"
                            disabled={!historyLabel.canRedo}
                            onClick={() => applyHistory(redoMaskStroke(historyRef.current))}
                            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent disabled:opacity-40"
                        >
                            <Redo2 className="size-3.5" aria-hidden />
                            重做
                        </button>
                        <button
                            type="button"
                            data-testid="mask-reset"
                            disabled={historyLabel.strokeCount === 0}
                            onClick={() => applyHistory(resetMaskHistory(historyRef.current))}
                            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent disabled:opacity-40"
                        >
                            <RotateCcw className="size-3.5" aria-hidden />
                            重置
                        </button>

                        <span data-testid="mask-coverage" className="ml-auto text-[11px] text-muted-foreground">
                            {historyLabel.strokeCount} 笔 · 覆盖 {coverageLabel}
                        </span>
                    </div>

                    <div className="relative overflow-hidden rounded-lg border border-border bg-[repeating-conic-gradient(#00000008_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
                        {image ? (
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
                        ) : (
                            <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
                                <p>上传图片后即可在图上涂抹需要重绘的区域</p>
                                <p>涂抹范围会作为蒙版随原图一起发给模型</p>
                            </div>
                        )}
                    </div>
                </section>

                {/* 右：上传 / 描述 / 结果 */}
                <aside className="flex min-w-0 flex-col gap-3">
                    <div className="rounded-lg border border-border bg-card p-3">
                        <ToolAssetInput
                            toolId={TOOL_ID}
                            title="上传图片"
                            maxCount={1}
                            disabled={busy}
                            onChange={(_ids, records) => {
                                const record = records[records.length - 1];
                                if (record) void adoptImage(record);
                            }}
                        />
                        {image ? (
                            <p className="mt-2 truncate text-[11px] text-muted-foreground">
                                {image.name} · {image.width}×{image.height}
                            </p>
                        ) : null}
                    </div>

                    <div className="rounded-lg border border-border bg-card p-3">
                        <label htmlFor="area-repair-prompt" className="flex items-center justify-between text-xs font-medium text-foreground">
                            <span>
                                重绘描述 <span className="text-destructive">*</span>
                            </span>
                            <span className="text-[11px] font-normal text-muted-foreground tabular-nums">
                                {prompt.length} / {AREA_REPAIR_PROMPT_MAX}
                            </span>
                        </label>
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
                            placeholder="例如：把涂抹区域换成米色针织沙发，保留原有光影和地面阴影"
                            className="mt-2 h-24 w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />

                        <p className="mt-3 text-xs font-medium text-foreground">生成张数</p>
                        <div className="mt-1.5 flex items-center gap-1" data-testid="area-repair-output-num">
                            {AREA_REPAIR_OUTPUT_OPTIONS.map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    disabled={busy}
                                    aria-pressed={outputNum === option}
                                    onClick={() => {
                                        const next = normalizeOutputNum(option);
                                        outputRef.current = next;
                                        setOutputNum(next);
                                        persist(stateRef.current);
                                    }}
                                    className={cn("min-w-8 rounded border border-border px-2 py-1 text-[11px] transition", outputNum === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                                >
                                    {option}
                                </button>
                            ))}
                        </div>

                        {issues.length > 0 ? (
                            <ul data-testid="area-repair-issues" className="mt-2 space-y-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                                {issues.map((issue) => (
                                    <li key={issue.field}>{issue.message}</li>
                                ))}
                            </ul>
                        ) : null}
                    </div>

                    {latestTask ? (
                        <div className="rounded-lg border border-border bg-card p-2">
                            <TaskStatusPanel task={latestTask} onRetry={() => void retryUnit()} />
                        </div>
                    ) : null}

                    <div className="rounded-lg border border-border bg-card p-3">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-foreground">结果</p>
                            <span className="text-[11px] text-muted-foreground">{outcomes.length} 张</span>
                        </div>
                        {outcomes.length === 0 ? (
                            <p className="mt-2 text-[11px] text-muted-foreground">还没有结果。完成涂抹 + 描述后点「立即生成」。</p>
                        ) : (
                            <ul data-testid="area-repair-results" className="mt-2 grid grid-cols-2 gap-2">
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
                        )}
                        {resultFeedback ? (
                            <p data-testid="area-repair-result-feedback" className="mt-2 text-[11px] text-muted-foreground">
                                {resultFeedback}
                            </p>
                        ) : null}
                    </div>
                </aside>
            </div>
        </ToolShell>
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
    const spec = useMemo(() => getToolById(REMOVE_PEN_ID), []);
    const siblings = useMemo(() => toolSpecs.filter((tool) => tool.layout === "mask" && tool.id !== REMOVE_PEN_ID), []);
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

    const coverageLabel = useMemo(() => describeRemovePenCoverage(state), [state]);
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
    const view = useMemo(() => removePenResultView({ run, running: busy, sourceUrl: image?.dataUrl, stale }), [run, busy, image, stale]);

    /* ---------------- 结果动作：存入资产库 / 发送画布 ---------------- */

    /** 只把本次真实返回的结果包装成结果项；没有 url 就是没有结果，动作直接拒绝，不造占位图。 */
    const resultItem = useCallback((): ToolTaskResultItem | null => {
        const url = view.imageUrl;
        if (!url) return null;
        return {
            id: `${REMOVE_PEN_ID}-${run?.snapshotHash ?? "result"}`,
            kind: "image",
            ...(url.startsWith("data:") ? { dataUrl: url } : { url }),
            mimeType: "image/png",
        };
    }, [run?.snapshotHash, view.imageUrl]);

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
    const resultUrl = view.imageUrl;

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

    return (
        <ToolShell
            className={className}
            title={spec?.title ?? "局部消除"}
            subtitle="上传需要消除的图片，使用画笔涂抹即可一键消除；结果与原图可前后对比"
            badges={<span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">{spec ? `makeType ${spec.makeType}` : REMOVE_PEN_ID}</span>}
            actions={
                <button
                    type="button"
                    data-testid="remove-pen-submit"
                    disabled={busy || issues.length > 0}
                    onClick={() => void submit()}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Sparkles className="size-3.5" aria-hidden />
                    {busy ? "消除中…" : "开始消除"}
                </button>
            }
            notices={
                <>
                    {conflict ? <p className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">草稿在其他标签页被修改，本页未覆盖；刷新可载入最新草稿。</p> : null}
                    {notice ? (
                        <p data-testid="remove-pen-notice" className="rounded border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                            {notice}
                        </p>
                    ) : null}
                    {stale ? (
                        <p className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                            涂抹或图片已变更：下面是上一次提交的结果，不代表当前涂抹区域。
                        </p>
                    ) : null}
                </>
            }
            sidebar={
                <nav className="flex flex-col gap-1 p-2 text-xs">
                    <span className="px-2 py-1 font-medium text-foreground">局部消除</span>
                    {siblings.map((tool) => (
                        <Link key={tool.id} to={tool.route} className="rounded px-2 py-1 text-muted-foreground transition hover:bg-accent hover:text-foreground">
                            {tool.title}
                        </Link>
                    ))}
                    <Link to={`/tools/smart-edit/${REMOVE_PEN_SLUG}`} className="mt-2 px-2 py-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline">
                        本页路由
                    </Link>
                </nav>
            }
        >
            <div data-testid="remove-pen-workspace" className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="flex min-w-0 flex-col gap-3">
                    <section className="rounded-lg border border-border bg-card p-3">
                        <p className="text-xs font-medium text-foreground">需要消除的图片</p>
                        <div className="mt-2">
                            <ToolAssetInput
                                toolId={REMOVE_PEN_ID}
                                title={image ? "重新上传" : "上传图片（之后可重新上传）"}
                                maxCount={1}
                                disabled={busy}
                                onChange={(_ids, records) => {
                                    const record = records[records.length - 1];
                                    if (record) void adoptImage(record);
                                }}
                            />
                        </div>
                        {image ? <p className="mt-2 truncate text-[11px] text-muted-foreground">{image.name} · {image.width}×{image.height}</p> : null}
                        {image ? (
                            <button
                                type="button"
                                data-testid="remove-pen-reset-image"
                                className="mt-2 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
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
                            >
                                重新上传（清空涂抹）
                            </button>
                        ) : null}
                    </section>

                    <section className="rounded-lg border border-border bg-card p-3">
                        <p className="text-xs font-medium text-foreground">画笔</p>
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>大小</span>
                            <input
                                type="range"
                                data-testid="remove-pen-brush-range"
                                min={REMOVE_PEN_BRUSH_MIN}
                                max={REMOVE_PEN_BRUSH_MAX}
                                value={state.brushSize}
                                onChange={(event) => commitBrush(Number(event.target.value))}
                                className="min-w-0 flex-1 accent-primary"
                                aria-label="画笔大小"
                            />
                            <input
                                type="number"
                                min={REMOVE_PEN_BRUSH_MIN}
                                max={REMOVE_PEN_BRUSH_MAX}
                                value={state.brushSize}
                                onChange={(event) => commitBrush(Number(event.target.value))}
                                className="w-14 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground"
                                aria-label="画笔大小像素"
                            />
                            像素
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                            {REMOVE_PEN_BRUSH_PRESETS.map((size) => (
                                <button
                                    key={size}
                                    type="button"
                                    aria-pressed={state.brushSize === size}
                                    onClick={() => commitBrush(size)}
                                    className={cn("rounded border border-border px-1.5 py-0.5 text-[11px]", state.brushSize === size ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                                >
                                    {size}
                                </button>
                            ))}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <button type="button" data-testid="remove-pen-undo" disabled={!historyLabel.canUndo || busy} onClick={undo} className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground disabled:opacity-40">
                                <Undo2 className="size-3" aria-hidden /> 撤销
                            </button>
                            <button type="button" data-testid="remove-pen-redo" disabled={!historyLabel.canRedo || busy} onClick={redo} className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground disabled:opacity-40">
                                <Redo2 className="size-3" aria-hidden /> 重做
                            </button>
                            <button type="button" data-testid="remove-pen-reset-mask" disabled={historyLabel.strokeCount === 0 || busy} onClick={reset} className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground disabled:opacity-40">
                                <RotateCcw className="size-3" aria-hidden /> 重置
                            </button>
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                            已涂抹 {historyLabel.strokeCount} 笔 · {coverageLabel}
                        </p>
                    </section>

                    {issues.length > 0 ? (
                        <ul data-testid="remove-pen-issues" className="rounded-lg border border-border bg-card p-3 text-[11px] text-muted-foreground">
                            {issues.map((issue) => (
                                <li key={issue.field}>· {issue.message}</li>
                            ))}
                        </ul>
                    ) : null}
                </aside>

                <div className="flex min-w-0 flex-col gap-3">
                    <section className="rounded-lg border border-border bg-card p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                                <Paintbrush className="size-3.5" aria-hidden /> 涂抹消除区域
                            </p>
                            <span className="text-[11px] text-muted-foreground">白色蒙版 = 要消除的区域；红色覆盖只是预览</span>
                        </div>
                        <div className="mt-2 rounded-md border border-dashed border-border bg-muted/30 p-2">
                            {image ? (
                                <div className="relative mx-auto w-fit max-w-full">
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
                            ) : (
                                <p className="py-16 text-center text-xs text-muted-foreground">先上传需要消除的图片，再用画笔涂抹要去掉的物体或瑕疵。</p>
                            )}
                        </div>
                    </section>

                    <section className="rounded-lg border border-border bg-card p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-medium text-foreground">前后对比</p>
                            <div className="flex items-center gap-1">
                                {REMOVE_PEN_COMPARE_MODES.map((mode) => (
                                    <button
                                        key={mode.id}
                                        type="button"
                                        data-testid={`remove-pen-compare-${mode.id}`}
                                        aria-pressed={compareMode === mode.id}
                                        onClick={() => commitCompare(mode.id)}
                                        className={cn("rounded border border-border px-1.5 py-0.5 text-[11px]", compareMode === mode.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                                    >
                                        {mode.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {view.status === "running" ? <p className="mt-3 text-[11px] text-muted-foreground">正在提交真实请求并等待结果…</p> : null}
                        {view.error && view.status !== "running" ? (
                            <p data-testid="remove-pen-error" className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1.5 text-[11px] text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                                {view.error.message}（诊断码：{view.error.code}）
                            </p>
                        ) : null}

                        {run?.task ? <TaskStatusPanel className="mt-3" task={run.task} /> : null}

                        {resultUrl && image ? (
                            <div className="mt-3">
                                {compareMode === "slider" ? (
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
                                ) : compareMode === "side-by-side" ? (
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

                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <a
                                        data-testid="remove-pen-download"
                                        href={resultUrl}
                                        download={removePenDownloadName(image.name)}
                                        className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
                                    >
                                        下载图片
                                    </a>
                                    {REMOVE_PEN_HANDOFFS.map((handoff) => (
                                        <Link
                                            key={handoff.id}
                                            data-testid={`remove-pen-handoff-${handoff.id}`}
                                            to={buildRemovePenHandoff(handoff.id, resultUrl).route}
                                            state={{ handoff: { from: REMOVE_PEN_ID, field: handoff.field, value: resultUrl } }}
                                            className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
                                        >
                                            {handoff.label}
                                        </Link>
                                    ))}
                                </div>
                                <p className="mt-1 text-[10px] text-muted-foreground">接力会把当前结果作为目标工具的输入（通过路由 handoff state 传递）。</p>

                                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
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
                            </div>
                        ) : view.status !== "running" ? (
                            <p className="mt-3 text-[11px] text-muted-foreground">还没有结果。涂抹要消除的区域后点「开始消除」。</p>
                        ) : null}
                    </section>
                </div>
            </div>
        </ToolShell>
    );
}

export default MaskWorkspace;
