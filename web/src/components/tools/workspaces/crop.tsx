/**
 * IMAGE_CROP「图片裁剪」工作台（TASK-017）。
 *
 * 对照证据：page-specs/10-image-crop.md + 原站 IMAGE_CROP.json
 *  - 左侧：真实图片 + 可拖拽/键盘微调的裁剪框（旋转/翻转后坐标一致）
 *  - 右侧：尺寸调整｜比例调整 双页签、平台预设卡、目标宽高、保存自定义尺寸
 *  - 顶部：撤销/重做/重置/重新上传/下载图片
 *  - 底部：任务状态 + 结果（复用 ToolResult，真实入库资产可直接下载/进作品库）
 * 所有配置写入规格 §7 的 12 个字段，提交时进 prompt 与输入指纹，杜绝丢参。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Crop as CropIcon, Download, FlipHorizontal2, FlipVertical2, Lock, Redo2, RotateCcw, RotateCw, Undo2, Unlock, Upload } from "lucide-react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolShell } from "@/components/tools/tool-shell";
import { OrigRail, SMART_EDIT_RAIL } from "@/components/tools/workspaces/orig-rail";
import { TaskStatusPanel } from "@/components/tools/task-status";
import { guardImageCropRequest, buildImageCropRequest, createCanvasCropRenderer, runImageCrop } from "@/features/tools/adapters/image-crop";
import { getToolById, toolSpecs } from "@/features/tools/registry";
import {
    FREE_RATIO_ID,
    IMAGE_CROP_FORMATS,
    IMAGE_CROP_MAX_BYTES,
    IMAGE_CROP_TOOL_SLUG,
    IMAGE_CROP_TOOL_ID,
    PLATFORM_PRESETS,
    RATIO_PRESETS,
    applyCustomSize,
    applyFlip,
    applyOutputSize,
    applyPlatformPreset,
    applyRatioPreset,
    applyRectDrag,
    applyRotation,
    clamp01,
    createCropState,
    createImageCropSnapshot,
    imageCropDraftValues,
    isSnapshotStale,
    moveRect,
    orientedSize,
    parseImageCropDraftValues,
    rectToPixels,
    resetForNewSource,
    resizeRect,
    saveCustomSize,
    validateCropState,
    type CropCanvasState,
    type CropHandle,
    type CropOutputFormat,
    type CropRotation,
    type CropSize,
    type ImageCropSnapshot,
} from "@/features/tools/registry/image-crop";
import { loadToolAssetRecords, type ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { cn } from "@/lib/utils";
import { flushToolDrafts, useToolDraftStore } from "@/stores/use-tool-draft-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";
import { WatermarkGroupPanel } from "@/components/tools/watermark-group-panel";

type SourceImage = { assetId: string; name: string; url: string; bytes: number; mimeType: string; size: CropSize };

const FORMAT_LABEL: Record<CropOutputFormat, string> = { "image/png": "PNG", "image/jpeg": "JPG", "image/webp": "WebP" };

function decodeSize(url: string): Promise<CropSize> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error("图片解码失败，请换一张图"));
        image.src = url;
    });
}

export function CropWorkspace() {
    const spec = useMemo(() => getToolById(IMAGE_CROP_TOOL_ID), []);
    const siblings = useMemo(() => toolSpecs.filter((tool) => tool.layout === "crop" && tool.id !== IMAGE_CROP_TOOL_ID), []);
    const patchDraft = useToolDraftStore((store) => store.patch);
    const hydrateDraft = useToolDraftStore((store) => store.hydrate);
    const upsertTask = useToolTaskStore((store) => store.upsertTask);
    const tasksHydrated = useToolTaskStore((store) => store.hydrated);
    const hydrateTasks = useToolTaskStore((store) => store.hydrate);
    const storedTasks = useToolTaskStore((store) => store.tasks);

    const [source, setSource] = useState<SourceImage | null>(null);
    const [state, setState] = useState<CropCanvasState>(() => createCropState());
    const [undoStack, setUndoStack] = useState<CropCanvasState[]>([]);
    const [redoStack, setRedoStack] = useState<CropCanvasState[]>([]);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [task, setTask] = useState<ToolTask | null>(null);
    const [submitted, setSubmitted] = useState<ImageCropSnapshot | null>(null);
    /** 重新上传/换图后不再回放上一次任务结果（用户已明确开始新一次裁剪）。 */
    const [restoredDismissed, setRestoredDismissed] = useState(false);
    const renderer = useRef(createCanvasCropRenderer());

    const size = source?.size ?? { width: 1, height: 1 };
    const issues = guardImageCropRequest(state, source ? { width: size.width, height: size.height, bytes: source.bytes, mimeType: source.mimeType } : null);
    const canSubmit = Boolean(source) && issues.length === 0 && !busy;

    /** 所有配置变更统一走这里：记录撤销栈 + 落草稿。 */
    const commit = useCallback(
        (next: CropCanvasState | ((current: CropCanvasState) => CropCanvasState)) => {
            setState((current) => {
                const value = typeof next === "function" ? next(current) : next;
                if (value === current) return current;
                setUndoStack((stack) => [...stack.slice(-49), current]);
                setRedoStack([]);
                return value;
            });
        },
        [],
    );

    // 草稿落盘：配置 + 源资产 id（二进制不进草稿）
    useEffect(() => {
        patchDraft(IMAGE_CROP_TOOL_ID, { values: imageCropDraftValues(state, source?.assetId ?? null), assetIds: source ? [source.assetId] : [] });
    }, [patchDraft, state, source]);

    // 首次挂载：恢复草稿配置与源图（草稿只存配置 + 资产 id，二进制从资产库取回）
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const draft = await hydrateDraft(IMAGE_CROP_TOOL_ID);
            if (cancelled) return;
            const parsed = parseImageCropDraftValues(draft?.values ?? null);
            if (!parsed) return;
            setState(parsed.state);
            if (!parsed.sourceAssetId) return;
            const { records } = await loadToolAssetRecords([parsed.sourceAssetId]);
            const record = records[0];
            if (!record || cancelled) return;
            const restored = await hydrateSource(record);
            if (!cancelled) setSource(restored);
        })().catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [hydrateDraft]);

    // 任务 store 水合：让「刷新后结果复用」成立（此前只有历史面板会 hydrate）
    useEffect(() => {
        if (!tasksHydrated) hydrateTasks();
    }, [hydrateTasks, tasksHydrated]);

    async function hydrateSource(record: ToolAssetRecord): Promise<SourceImage> {
        const url = record.url;
        const decoded = await decodeSize(url);
        return { assetId: record.id, name: record.name ?? "源图", url, bytes: record.bytes ?? 0, mimeType: record.mimeType ?? "image/png", size: decoded };
    }

    async function onAssetChange(assetIds: string[], records: ToolAssetRecord[]) {
        setNotice(null);
        const record = records[records.length - 1];
        if (!assetIds.length || !record) {
            setSource(null);
            return;
        }
        try {
            const next = await hydrateSource(record);
            setSource(next);
            // 换图：重置画布变换与裁剪框，保留格式/页签/自定义尺寸（规格 §3）
            setState((current) => resetForNewSource(current, next.size));
            setUndoStack([]);
            setRedoStack([]);
            setSubmitted(null);
            setRestoredDismissed(false);
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "图片读取失败");
        }
    }

    const submit = useCallback(async () => {
        if (!source || busy) return;
        const blocked = guardImageCropRequest(state, { width: size.width, height: size.height, bytes: source.bytes, mimeType: source.mimeType });
        if (blocked.length > 0) {
            setNotice(blocked.map((issue) => issue.message).join("；"));
            return;
        }
        setBusy(true);
        setNotice(null);
        try {
            const snapshot = createImageCropSnapshot({ sourceAssetId: source.assetId, sourceName: source.name, sourceUrl: source.url, source: size, state });
            const request = buildImageCropRequest({ snapshot, media: { imageUrl: source.url, imageSize: source.bytes, imageCropUrl: "" } });
            const revision = useToolDraftStore.getState().drafts[IMAGE_CROP_TOOL_ID]?.revision ?? null;
            const result = await runImageCrop({ request, sourceUrl: source.url, draftRevision: revision }, { renderer: renderer.current, persist: upsertTask });
            setTask(result.task);
            setSubmitted(snapshot);
            setNotice(result.task.status === "succeeded" ? "裁剪完成，结果已入资产库" : (result.task.error?.message ?? "裁剪失败，可按原参数重试"));
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "提交失败，请重试");
        } finally {
            setBusy(false);
            void flushToolDrafts();
        }
    }, [busy, size, source, state, upsertTask]);

    /** 重新上传：清空源图与画布变换，回到上传态（保留格式/页签/自定义尺寸）。 */
    const reupload = useCallback(() => {
        setSource(null);
        setState((current) => ({ ...createCropState(), format: current.format, activeTab: current.activeTab, customSizes: current.customSizes }));
        setUndoStack([]);
        setRedoStack([]);
        setSubmitted(null);
        setTask(null);
        setRestoredDismissed(true);
        setNotice("已清空当前图片，请重新上传");
    }, []);

    /** 下载图片：导出「当前」裁剪结果真实字节（与提交走同一 renderer），不是上次任务的旧图。 */
    const downloadCurrent = useCallback(async () => {
        if (!source || busy) return;
        const blocked = guardImageCropRequest(state, { width: size.width, height: size.height, bytes: source.bytes, mimeType: source.mimeType });
        if (blocked.length > 0) {
            setNotice(blocked.map((issue) => issue.message).join("；"));
            return;
        }
        setBusy(true);
        setNotice(null);
        try {
            const snapshot = createImageCropSnapshot({ sourceAssetId: source.assetId, sourceName: source.name, sourceUrl: source.url, source: size, state });
            const request = buildImageCropRequest({ snapshot, media: { imageUrl: source.url, imageSize: source.bytes, imageCropUrl: "" } });
            const binary = await renderer.current.render(source.url, request.plan);
            const ext = (binary.mimeType.split("/")[1] ?? "png").replace("jpeg", "jpg");
            const href = URL.createObjectURL(binary.blob);
            const anchor = document.createElement("a");
            anchor.href = href;
            anchor.download = `crop-${snapshot.plan.outputWidth}x${snapshot.plan.outputHeight}.${ext}`;
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(href), 2000);
            setNotice(`已导出当前裁剪结果 ${snapshot.plan.outputWidth}×${snapshot.plan.outputHeight}`);
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "导出失败，请重试");
        } finally {
            setBusy(false);
        }
    }, [busy, size, source, state]);

    // 刷新后复用：任务 store 水合完成后，把本工具最近一次成功任务回放到结果区
    const restoredTask = useMemo(() => {
        const own = Object.values(storedTasks).filter((item) => item.toolId === IMAGE_CROP_TOOL_ID);
        const sorted = own.sort((a, b) => b.updatedAt - a.updatedAt);
        return sorted.find((item) => item.status === "succeeded") ?? sorted[0] ?? null;
    }, [storedTasks]);
    const activeTask = useMemo(() => {
        if (task) return task;
        if (restoredDismissed || !restoredTask) return null;
        const taskSources = restoredTask.sourceAssetIds ?? [];
        // 只有「同源」结果才回放；换了图（源资产不同）时隐藏旧结果，避免误解
        if (source && taskSources.length > 0 && !taskSources.includes(source.assetId)) return null;
        return restoredTask;
    }, [restoredDismissed, restoredTask, source, task]);

    const stale = submitted ? isSnapshotStale(submitted, createImageCropSnapshot({ sourceAssetId: source?.assetId ?? "", sourceName: source?.name ?? "", sourceUrl: source?.url ?? "", source: size, state })) : false;
    const cropPixels = rectToPixels(state.rect, orientedSize(size, state.rotation));

    return (
        <ToolShell
            title="图片裁剪"
            subtitle="上传图片，裁剪图片为任何尺寸/比例"
            badges={
                <>
                    <span data-testid="crop-free-badge" className="rounded border border-primary/40 px-2 py-0.5 text-[11px] text-primary">限免</span>
                    {/* 原站 A#25：裁剪页顶部紧随「限免」的关联能力入口 */}
                    <Link
                        to="/tools/smart-edit/ai-dressing"
                        data-testid="crop-related-dressing"
                        className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
                    >
                        真人换模特2.0
                    </Link>
                </>
            }
            breadcrumb={<span className="text-[11px] text-muted-foreground">智能修图 / 图片裁剪</span>}
            notices={
                notice ? (
                    <p data-testid="crop-notice" className="rounded border border-border bg-muted px-3 py-2 text-xs text-foreground">
                        {notice}
                    </p>
                ) : null
            }
            actions={
                <div className="flex items-center gap-1">
                    <IconButton testId="crop-undo" label="撤销" disabled={undoStack.length === 0} onClick={() => { const prev = undoStack[undoStack.length - 1]; setUndoStack((s) => s.slice(0, -1)); setRedoStack((s) => [...s, state]); setState(prev); }}>
                        <Undo2 className="size-3.5" aria-hidden />
                    </IconButton>
                    <IconButton testId="crop-redo" label="重做" disabled={redoStack.length === 0} onClick={() => { const next = redoStack[redoStack.length - 1]; setRedoStack((s) => s.slice(0, -1)); setUndoStack((s) => [...s, state]); setState(next); }}>
                        <Redo2 className="size-3.5" aria-hidden />
                    </IconButton>
                    <IconButton testId="crop-reset" label="重置" disabled={!source} onClick={() => commit(createCropState(size))}>
                        <RotateCcw className="size-3.5" aria-hidden />
                    </IconButton>
                    <IconButton testId="crop-rotate" label="旋转 90°" showLabel={false} disabled={!source} onClick={() => commit((current) => applyRotation(current, ((current.rotation + 90) % 360) as CropRotation, size))}>
                        <RotateCw className="size-3.5" aria-hidden />
                    </IconButton>
                    <IconButton testId="crop-flip-x" label="水平翻转" showLabel={false} disabled={!source} onClick={() => commit(applyFlip(state, "x"))}>
                        <FlipHorizontal2 className="size-3.5" aria-hidden />
                    </IconButton>
                    <IconButton testId="crop-flip-y" label="垂直翻转" showLabel={false} disabled={!source} onClick={() => commit(applyFlip(state, "y"))}>
                        <FlipVertical2 className="size-3.5" aria-hidden />
                    </IconButton>
                    <IconButton testId="crop-reupload" label="重新上传" disabled={!source} onClick={reupload}>
                        <Upload className="size-3.5" aria-hidden />
                    </IconButton>
                    <button
                        type="button"
                        data-testid="crop-download"
                        aria-label="下载图片"
                        disabled={!source || busy}
                        onClick={() => void downloadCurrent()}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                    >
                        <Download className="size-3.5" aria-hidden />
                        <span>下载图片</span>
                    </button>
                </div>
            }
            sidebar={
                <nav className="flex flex-col gap-1 p-2 text-xs">
                    <span className="px-2 py-1 font-medium text-foreground">图片裁剪</span>
                    {siblings.map((tool) => (
                        <Link key={tool.id} to={tool.route} className="rounded px-2 py-1 text-muted-foreground transition hover:bg-accent hover:text-foreground">
                            {tool.title}
                        </Link>
                    ))}
                    <Link to={`/tools/smart-edit/${IMAGE_CROP_TOOL_SLUG}`} className="mt-2 px-2 py-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline">
                        本页路由
                    </Link>
                </nav>
            }
        >
            <div data-testid="crop-workspace" className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                <section className="flex min-w-0 flex-col gap-3">
                    {source ? (
                        <CropCanvas
                            url={source.url}
                            state={state}
                            onRectChange={(rect) => commit(applyRectDrag(state, rect, size))}
                            onRotate={() => commit(applyRotation(state, ((state.rotation + 90) % 360) as CropRotation, size))}
                        />
                    ) : (
                        <div data-testid="crop-empty" className="flex h-[320px] shrink-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card p-8 text-center">
                            <CropIcon className="size-8 text-muted-foreground" aria-hidden />
                            <p className="text-sm font-medium">或 拖拽/粘贴 图片到此处（免费限单张，付费解锁 100 张批量上传）</p>
                            <p className="text-xs text-muted-foreground">
                                支持jpg、jpeg、png、webp，{Math.round(IMAGE_CROP_MAX_BYTES / 1024 / 1024)}M以内，384*384 ~ 4096*4096
                            </p>
                        </div>
                    )}
                    <ToolAssetInput toolId={IMAGE_CROP_TOOL_ID} maxCount={1} title="上传图片" variant="linkfox" uploadLabel="从本地上传" onChange={onAssetChange} disabled={busy} />
                    {/* 原站族导航在页面最左（x≈61），本地被内容框裁掉：在画布下方等价还原，顺序与原站一致 */}
                    <OrigRail items={SMART_EDIT_RAIL} active="图片裁剪" driver testId="crop-family-rail" label="图片编辑" />
                    {/* 原站面板底部：管理水印分组（共 N/20 个 · 默认 · ＋ 新增水印分组） */}
                    <WatermarkGroupPanel />
                    {source ? (
                        <p className="text-[11px] text-muted-foreground">
                            {source.name} · {size.width}×{size.height} · 裁剪区 {cropPixels.width}×{cropPixels.height} → 输出 {state.outputWidth}×{state.outputHeight}
                        </p>
                    ) : null}
                    {activeTask ? (
                        <>
                            {stale ? <p data-testid="crop-stale" className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">配置已变更：下方展示的是上一次提交的结果，不代表当前参数。</p> : null}
                            <TaskStatusPanel task={activeTask} />
                            <ToolResult task={activeTask} toolId={IMAGE_CROP_TOOL_ID} title="裁剪结果" onRetry={submit} />
                        </>
                    ) : null}
                </section>

                <aside className="flex min-w-0 flex-col gap-3">
                    {/* 尺寸调整 / 比例调整 */}
                    <div className="rounded-lg border border-border bg-card p-2">
                        <div className="flex gap-1" role="tablist" aria-label="裁剪方式">
                            {(["size", "ratio"] as const).map((tab) => (
                                <button
                                    key={tab}
                                    type="button"
                                    role="tab"
                                    data-testid={`crop-tab-${tab}`}
                                    aria-selected={state.activeTab === tab}
                                    onClick={() => commit({ ...state, activeTab: tab })}
                                    className={cn("flex-1 rounded px-2 py-1 text-[11px]", state.activeTab === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                                >
                                    {tab === "size" ? "尺寸调整" : "比例调整"}
                                </button>
                            ))}
                        </div>

                        {state.activeTab === "size" ? (
                            <div className="mt-2 space-y-2">
                                {/* 原站「尺寸调整」页签首位就是「自由裁剪」尺寸卡（236×40，默认选中）；点它=按原图比例自由框选 */}
                                <button
                                    type="button"
                                    data-testid="crop-size-free"
                                    aria-pressed={state.ratioId === FREE_RATIO_ID}
                                    onClick={() => commit(applyRatioPreset(state, FREE_RATIO_ID, size))}
                                    className={cn(
                                        "flex h-10 w-full items-center justify-between gap-2 rounded-md border px-3 text-left text-xs transition",
                                        state.ratioId === FREE_RATIO_ID ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:bg-accent",
                                    )}
                                >
                                    <span>自由裁剪</span>
                                    <span className="text-[11px] text-muted-foreground">{state.ratioId === FREE_RATIO_ID ? `${state.outputWidth}×${state.outputHeight}` : "自由裁剪"}</span>
                                </button>
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-foreground">目标尺寸</span>
                                    <span className="text-[11px] text-muted-foreground" data-testid="crop-output-summary">
                                        {source ? `${state.outputWidth}×${state.outputHeight}` : ""}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <PixelField label="宽" testId="crop-output-width" value={state.outputWidth} onChange={(value) => commit(applyOutputSize(state, "width", value, size))} />
                                    <PixelField label="高" testId="crop-output-height" value={state.outputHeight} onChange={(value) => commit(applyOutputSize(state, "height", value, size))} />
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        data-testid="crop-save-custom"
                                        onClick={() => commit(saveCustomSize(state))}
                                        className="flex-1 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
                                    >
                                        保存自定义尺寸
                                    </button>
                                    <button
                                        type="button"
                                        data-testid="crop-lock-ratio"
                                        aria-pressed={state.locked}
                                        onClick={() => commit({ ...state, locked: !state.locked })}
                                        className={cn("inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px]", state.locked ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                                    >
                                        {state.locked ? <Lock className="size-3" aria-hidden /> : <Unlock className="size-3" aria-hidden />}
                                        锁定比例
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-1" data-testid="crop-custom-sizes">
                                    {state.customSizes.length === 0 ? null : (
                                        state.customSizes.map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => commit(applyCustomSize(state, item.id, size))}
                                                className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                                            >
                                                {item.width}×{item.height}
                                            </button>
                                        ))
                                    )}
                                </div>
                                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                    输出格式
                                    <select
                                        data-testid="crop-format"
                                        value={state.format}
                                        onChange={(event) => commit({ ...state, format: event.target.value as CropOutputFormat })}
                                        className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground"
                                    >
                                        {IMAGE_CROP_FORMATS.map((format) => (
                                            <option key={format} value={format}>
                                                {FORMAT_LABEL[format]}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        ) : (
                            <div className="mt-2 grid grid-cols-3 gap-1" data-testid="crop-ratios">
                                <RatioCard active={state.ratioId === FREE_RATIO_ID} label="自由裁剪" onClick={() => commit(applyRatioPreset(state, FREE_RATIO_ID, size))} testId="crop-ratio-free" />
                                {RATIO_PRESETS.map((preset) => (
                                    <RatioCard
                                        key={preset.id}
                                        active={state.ratioId === preset.id}
                                        label={preset.title}
                                        ratio={{ width: preset.width, height: preset.height }}
                                        testId={`crop-ratio-${preset.id}`}
                                        onClick={() => commit(applyRatioPreset(state, preset.id, size))}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 平台预设 */}
                    <div className="rounded-lg border border-border bg-card p-2">
                        <div className="mt-2 grid grid-cols-3 gap-1" data-testid="crop-platforms">
                            {PLATFORM_PRESETS.map((preset) => (
                                <button
                                    key={preset.key}
                                    type="button"
                                    data-testid={`crop-platform-${preset.key}`}
                                    aria-pressed={state.platformKey === preset.key}
                                    onClick={() => commit(applyPlatformPreset(state, preset.key, size))}
                                    className={cn(
                                        "flex items-center justify-between gap-1 rounded border px-1.5 py-0.5 text-left text-[11px] transition",
                                        state.platformKey === preset.key ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                                    )}
                                >
                                    <span className="block truncate">{preset.title}</span>
                                    <span className="block shrink-0 text-[10px] text-muted-foreground">
                                        {preset.width} × {preset.height}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        type="button"
                        data-testid="crop-submit"
                        disabled={!canSubmit}
                        onClick={() => void submit()}
                        className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <Download className="size-4" aria-hidden />
                        {busy ? "裁剪中…" : "开始裁剪"}
                    </button>
                    {issues.length > 0 ? (
                        <ul data-testid="crop-issues" className="space-y-1 text-[11px] text-amber-700 dark:text-amber-300">
                            {issues.map((issue) => (
                                <li key={issue.code}>· {issue.message}</li>
                            ))}
                        </ul>
                    ) : null}
                </aside>
            </div>
        </ToolShell>
    );
}

function IconButton({ label, testId, disabled, onClick, showLabel = true, children }: { label: string; testId: string; disabled?: boolean; onClick: () => void; showLabel?: boolean; children: React.ReactNode }) {
    return (
        <button
            type="button"
            data-testid={testId}
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                "inline-flex h-7 items-center justify-center gap-1 rounded border border-border text-[12px] leading-none text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40",
                showLabel ? "px-2" : "w-7 px-0",
            )}
        >
            {children}
            {/* 原站工具栏：撤销/重做/重置/重新上传 带文案，旋转/翻转 仅图标（title 提供可访问名） */}
            {showLabel ? <span>{label}</span> : null}
        </button>
    );
}

function PixelField({ label, testId, value, onChange }: { label: string; testId: string; value: number; onChange: (value: number) => void }) {
    return (
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span>{label}</span>
            <input
                type="number"
                data-testid={testId}
                min={1}
                aria-label={label}
                value={value}
                onChange={(event) => onChange(Math.max(1, Math.round(Number(event.target.value) || 0)))}
                className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground"
            />
        </label>
    );
}

function RatioCard({ label, ratio, active, testId, onClick }: { label: string; ratio?: { width: number; height: number }; active: boolean; testId: string; onClick: () => void }) {
    return (
        <button
            type="button"
            data-testid={testId}
            aria-label={label}
            aria-pressed={active}
            title={label}
            onClick={onClick}
            className={cn(
                "flex flex-col items-center justify-center gap-1 rounded border px-1 py-1 text-[11px]",
                ratio ? "h-12" : "",
                active ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
        >
            {/* 原站比例卡是图形化方框（无文字），文案仅用于 title / 无障碍名 */}
            {ratio ? <span aria-hidden className="block rounded-[2px] border border-current" style={{ width: `${Math.round(24 * (ratio.width / ratio.height))}px`, height: "24px" }} /> : null}
            {ratio ? null : <span>{label}</span>}
        </button>
    );
}

/** 真实图片 + 裁剪框：指针拖拽 & 键盘方向键微调，坐标始终落在旋转后的图片上。 */
function CropCanvas({ url, state, onRectChange, onRotate }: { url: string; state: CropCanvasState; onRectChange: (rect: CropCanvasState["rect"]) => void; onRotate: () => void }) {
    const boxRef = useRef<HTMLDivElement | null>(null);
    const [box, setBox] = useState({ width: 0, height: 0 });
    const [natural, setNatural] = useState<CropSize>({ width: 0, height: 0 });
    const drag = useRef<{ handle: CropHandle | "move"; startX: number; startY: number; rect: CropCanvasState["rect"] } | null>(null);

    useEffect(() => {
        const element = boxRef.current;
        if (!element) return;
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0].contentRect;
            setBox({ width: rect.width, height: rect.height });
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        let cancelled = false;
        decodeSize(url)
            .then((size) => {
                if (!cancelled) setNatural(size);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [url]);

    const oriented = orientedSize(natural.width && natural.height ? natural : { width: 1, height: 1 }, state.rotation);
    const scale = oriented.width && oriented.height ? Math.min(box.width / oriented.width, box.height / oriented.height) : 0;
    const displayWidth = oriented.width * scale;
    const displayHeight = oriented.height * scale;
    const rectPx = { x: state.rect.x * displayWidth, y: state.rect.y * displayHeight, width: state.rect.width * displayWidth, height: state.rect.height * displayHeight };

    function begin(handle: CropHandle | "move", event: React.PointerEvent) {
        event.preventDefault();
        (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
        drag.current = { handle, startX: event.clientX, startY: event.clientY, rect: state.rect };
    }

    function move(event: React.PointerEvent) {
        const active = drag.current;
        if (!active || !displayWidth || !displayHeight) return;
        const dx = (event.clientX - active.startX) / displayWidth;
        const dy = (event.clientY - active.startY) / displayHeight;
        const next = active.handle === "move" ? moveRect(active.rect, dx, dy) : resizeRect(active.rect, active.handle, dx, dy, { locked: state.locked });
        onRectChange(next);
    }

    function end() {
        drag.current = null;
    }

    return (
        <div className="flex min-h-[280px] flex-1 items-center justify-center rounded-xl border border-border bg-[repeating-conic-gradient(#00000008_0deg_90deg,#00000000_90deg_180deg)] bg-[length:16px_16px] p-3">
            <div ref={boxRef} className="relative flex h-full w-full items-center justify-center">
                <div
                    data-testid="crop-canvas"
                    className="relative touch-none select-none"
                    style={{ width: displayWidth || undefined, height: displayHeight || undefined }}
                    onPointerMove={move}
                    onPointerUp={end}
                    onPointerCancel={end}
                >
                    <img
                        src={url}
                        alt="裁剪源图"
                        draggable={false}
                        className="h-full w-full object-contain"
                        style={{ transform: `rotate(-${state.rotation}deg) scaleX(${state.flipX ? -1 : 1}) scaleY(${state.flipY ? -1 : 1})` }}
                    />
                    <div
                        data-testid="crop-rect"
                        role="group"
                        aria-label="裁剪框"
                        tabIndex={0}
                        onPointerDown={(event) => begin("move", event)}
                        onKeyDown={(event) => {
                            const step = event.shiftKey ? 0.05 : 0.01;
                            if (event.key === "ArrowLeft") onRectChange(moveRect(state.rect, -step, 0));
                            else if (event.key === "ArrowRight") onRectChange(moveRect(state.rect, step, 0));
                            else if (event.key === "ArrowUp") onRectChange(moveRect(state.rect, 0, -step));
                            else if (event.key === "ArrowDown") onRectChange(moveRect(state.rect, 0, step));
                        }}
                        className="absolute cursor-move border border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        style={{ left: rectPx.x, top: rectPx.y, width: rectPx.width, height: rectPx.height }}
                    >
                        {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as CropHandle[]).map((handle) => (
                            <span
                                key={handle}
                                data-handle={handle}
                                onPointerDown={(event) => begin(handle, event)}
                                className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-primary bg-background"
                                style={handleStyle(handle)}
                            />
                        ))}
                    </div>
                </div>
                <button type="button" onClick={onRotate} aria-label="旋转" className="absolute bottom-1 right-1 rounded border border-border bg-background/90 p-1 text-muted-foreground hover:text-foreground">
                    <RotateCw className="size-3.5" aria-hidden />
                </button>
            </div>
        </div>
    );
}

function handleStyle(handle: CropHandle): React.CSSProperties {
    const map: Record<CropHandle, React.CSSProperties> = {
        nw: { left: 0, top: 0, cursor: "nwse-resize" },
        n: { left: "50%", top: 0, cursor: "ns-resize" },
        ne: { left: "100%", top: 0, cursor: "nesw-resize" },
        e: { left: "100%", top: "50%", cursor: "ew-resize" },
        se: { left: "100%", top: "100%", cursor: "nwse-resize" },
        s: { left: "50%", top: "100%", cursor: "ns-resize" },
        sw: { left: 0, top: "100%", cursor: "nesw-resize" },
        w: { left: 0, top: "50%", cursor: "ew-resize" },
    };
    return map[handle];
}
