/**
 * IMAGE_CROP「图片裁剪」工作台（TASK-017 · 2026-11-02 1:1 还原）。
 *
 * 对照证据：docs/V1.0/e2e-1to1/20261102/IMAGE_CROP/report.md + original.png
 *  - 画布顶部：通栏单行工具条（左 重置/撤销/重做/重新上传，右 下载图片+限免/真人换模特2.0/更多/历史记录）
 *  - 空态：居中 535 卡（示例图 + 四角裁剪框 + 437×30 紫主按钮 + 作品库/商品库 + 拖拽粘贴与格式提示），真实上传/拖拽/粘贴
 *  - 右侧配置 250px：尺寸调整（搜索 + 自由裁剪 + 22 平台滚动列表，max-h 346）/ 比例调整（搜索 + 原图比例 + 7 比例行）
 *  - 目标尺寸 1024×1024 + 保存自定义尺寸 + 旋转/翻转；输出格式/锁定比例/开始裁剪收进工具条「更多」弹层
 *  - 历史记录走工具条右侧入口的真实 ToolTaskHistory 面板
 * 裁剪能力（canvas 像素运算）、草稿、撤销重做、旋转翻转、导出、任务恢复全部保留。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    ChevronDown,
    Download,
    FlipHorizontal2,
    FlipVertical2,
    History,
    Link2,
    MoreHorizontal,
    Redo2,
    RotateCcw,
    RotateCw,
    Search,
    Undo2,
    Upload,
    UserRound,
    X,
} from "lucide-react";

import { ToolResult } from "@/components/tools/tool-result";
import { TaskStatusPanel } from "@/components/tools/task-status";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { guardImageCropRequest, buildImageCropRequest, createCanvasCropRenderer, runImageCrop } from "@/features/tools/adapters/image-crop";

import {
    FREE_RATIO_ID,
    IMAGE_CROP_FORMATS,
    IMAGE_CROP_MAX_BYTES,
    IMAGE_CROP_MAX_SIDE,
    IMAGE_CROP_MIN_SIDE,
    IMAGE_CROP_TOOL_ID,
    PLATFORM_PRESETS,
    applyCustomSize,
    applyFlip,
    applyOutputSize,
    applyPlatformPreset,
    applyRatioPreset,
    applyRectDrag,
    applyRotation,
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

    type CropCanvasState,
    type CropHandle,
    type CropOutputFormat,
    type CropRotation,
    type CropSize,
    type ImageCropSnapshot,
} from "@/features/tools/registry/image-crop";
import {
    adoptLibraryAsset,
    loadToolAssetRecords,
    toolAssetLibraryItemsFromAssets,
    uploadToolAsset,
    type ToolAssetLibraryItem,
    type ToolAssetRecord,
} from "@/services/api/tools/assets";
import { useAssetStore, type ImageAsset } from "@/stores/use-asset-store";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { cn } from "@/lib/utils";
import { flushToolDrafts, useToolDraftStore } from "@/stores/use-tool-draft-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";

type SourceImage = { assetId: string; name: string; url: string; bytes: number; mimeType: string; size: CropSize };

const FORMAT_LABEL: Record<CropOutputFormat, string> = { "image/png": "PNG", "image/jpeg": "JPG", "image/webp": "WebP" };

/** 空态示例图：原站 cdn.linkfox.com/ai-site/workbench/image-crop-upload-tour.jpg 原样落盘（自带四角裁剪框）。 */
const CROP_SAMPLE_IMAGE = "/__cases/image-crop/upload-tour.jpg";

/** 原站右上「比例调整」页签的 7 行比例 + 中文场景说明（original-ratio-tab.png）。 */
export const CROP_RATIO_ROWS = [
    { id: "1:1", note: "正方形" },
    { id: "2:3", note: "单反相机（竖图）" },
    { id: "3:2", note: "单反相机（横图）" },
    { id: "3:4", note: "标准屏幕（竖图）" },
    { id: "4:3", note: "标准屏幕（横图）" },
    { id: "9:16", note: "视频（竖屏）" },
    { id: "16:9", note: "视频（横屏）" },
] as const;

/** 平台列表左侧 16px 色块图标的品牌色（原站是真品牌图标，本地用品牌色块等价表达）。 */
const PLATFORM_COLORS: Record<string, string> = {
    amazon: "#ff9900",
    walmart: "#0071ce",
    etsy: "#f1641e",
    mercado: "#f7c600",
    ebay: "#e53238",
    temu: "#fb7701",
    "shopify-square": "#95bf47",
    "shopify-landscape": "#95bf47",
    "shopify-portrait": "#95bf47",
    shein: "#111111",
    aliexpress: "#ff4747",
    shopee: "#ee4d2d",
    lazada: "#0f146d",
    "tiktok-shop": "#111111",
    "douyin-shop": "#fe2c55",
    taobao: "#ff5000",
    jd: "#e1251b",
    wayfair: "#7f187f",
    cdiscount: "#00857d",
    jumia: "#f68b1e",
    rakuten: "#bf0000",
    wish: "#2fb7ec",
};

/** 上传约束与原站提示一致（§9「支持jpg、jpeg、png、webp，10M以内，384*384 ~ 4096*4096」）。 */
const CROP_UPLOAD_CONSTRAINTS = {
    kind: "image" as const,
    mimeTypes: [...IMAGE_CROP_FORMATS],
    maxBytes: IMAGE_CROP_MAX_BYTES,
    minWidth: IMAGE_CROP_MIN_SIDE,
    minHeight: IMAGE_CROP_MIN_SIDE,
    maxWidth: IMAGE_CROP_MAX_SIDE,
    maxHeight: IMAGE_CROP_MAX_SIDE,
};

function decodeSize(url: string): Promise<CropSize> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error("图片解码失败，请换一张图"));
        image.src = url;
    });
}

export function CropWorkspace() {
    const navigate = useNavigate();
    const patchDraft = useToolDraftStore((store) => store.patch);
    const hydrateDraft = useToolDraftStore((store) => store.hydrate);
    const upsertTask = useToolTaskStore((store) => store.upsertTask);
    const tasksHydrated = useToolTaskStore((store) => store.hydrated);
    const hydrateTasks = useToolTaskStore((store) => store.hydrate);
    const storedTasks = useToolTaskStore((store) => store.tasks);
    // 本地资产库（作品库）真实接入：空态卡「从作品库选择」不再永久禁用。
    const assets = useAssetStore((store) => store.assets);
    const library = useMemo(() => toolAssetLibraryItemsFromAssets(assets.filter((asset): asset is ImageAsset => asset.kind === "image")), [assets]);

    const [source, setSource] = useState<SourceImage | null>(null);
    // 无源图时的目标尺寸就是原站默认的 1024×1024（且默认选中「自由裁剪」）
    const [state, setState] = useState<CropCanvasState>(() => ({ ...createCropState(), ratioId: FREE_RATIO_ID }));
    const [undoStack, setUndoStack] = useState<CropCanvasState[]>([]);
    const [redoStack, setRedoStack] = useState<CropCanvasState[]>([]);
    const [busy, setBusy] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [task, setTask] = useState<ToolTask | null>(null);
    const [submitted, setSubmitted] = useState<ImageCropSnapshot | null>(null);
    /** 重新上传/换图后不再回放上一次任务结果（用户已明确开始新一次裁剪）。 */
    const [restoredDismissed, setRestoredDismissed] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [platformQuery, setPlatformQuery] = useState("");
    const [ratioQuery, setRatioQuery] = useState("");
    const [dragging, setDragging] = useState(false);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const renderer = useRef(createCanvasCropRenderer());

    const size = source?.size ?? { width: 1, height: 1 };
    const guardIssues = guardImageCropRequest(state, source ? { width: size.width, height: size.height, bytes: source.bytes, mimeType: source.mimeType } : null);
    const canSubmit = Boolean(source) && guardIssues.length === 0 && !busy;

    /** 所有配置变更统一走这里：记录撤销栈 + 落草稿。 */
    const commit = useCallback((next: CropCanvasState | ((current: CropCanvasState) => CropCanvasState)) => {
        setState((current) => {
            const value = typeof next === "function" ? next(current) : next;
            if (value === current) return current;
            setUndoStack((stack) => [...stack.slice(-49), current]);
            setRedoStack([]);
            return value;
        });
    }, []);

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

    // 任务 store 水合：让「刷新后结果复用」成立
    useEffect(() => {
        if (!tasksHydrated) hydrateTasks();
    }, [hydrateTasks, tasksHydrated]);

    async function hydrateSource(record: ToolAssetRecord): Promise<SourceImage> {
        const url = record.url;
        const decoded = await decodeSize(url);
        return { assetId: record.id, name: record.name ?? "源图", url, bytes: record.bytes ?? 0, mimeType: record.mimeType ?? "image/png", size: decoded };
    }

    /** 真实上传成功后统一换图：重置画布变换与裁剪框，保留格式/页签/自定义尺寸。 */
    const adoptRecord = useCallback(async (record: ToolAssetRecord) => {
        const next = await hydrateSource(record);
        setSource(next);
        setState((current) => resetForNewSource(current, next.size));
        setUndoStack([]);
        setRedoStack([]);
        setSubmitted(null);
        setRestoredDismissed(false);
        setNotice(null);
    }, []);

    /** 真实上传（`<input type=file>` / 拖拽 / 粘贴共用）：单张，走 IMAGE_CROP 的上传约束。 */
    const pickFiles = useCallback(
        async (files: File[]) => {
            const file = files.find((item) => item.type.startsWith("image/")) ?? files[0];
            if (!file) return;
            setUploading(true);
            setNotice(null);
            try {
                const record = await uploadToolAsset(file, { name: file.name, constraints: CROP_UPLOAD_CONSTRAINTS });
                await adoptRecord(record);
            } catch (error) {
                setNotice(error instanceof Error ? error.message : "图片上传失败，请重试");
            } finally {
                setUploading(false);
            }
        },
        [adoptRecord],
    );

    /** 剪贴板粘贴图片（原站「或 拖拽/粘贴 图片到此处」）。 */
    useEffect(() => {
        const onPaste = (event: ClipboardEvent) => {
            const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"));
            if (files.length === 0) return;
            event.preventDefault();
            void pickFiles(files);
        };
        window.addEventListener("paste", onPaste);
        return () => window.removeEventListener("paste", onPaste);
    }, [pickFiles]);

    /** 从作品库选择：真实资产库条目 → 工具资产记录（保留 storageKey，刷新后可恢复）。 */
    const chooseLibrary = useCallback(
        async (item: ToolAssetLibraryItem) => {
            setLibraryOpen(false);
            setNotice(null);
            try {
                const record = await adoptLibraryAsset(item);
                await adoptRecord(record);
            } catch (error) {
                setNotice(error instanceof Error ? error.message : "作品库素材读取失败");
            }
        },
        [adoptRecord],
    );

    const submit = useCallback(async () => {
        if (!source || busy) return;
        const blocked = guardImageCropRequest(state, { width: size.width, height: size.height, bytes: source.bytes, mimeType: source.mimeType });
        if (blocked.length > 0) {
            setNotice(blocked.map((issue) => issue.message).join("；"));
            return;
        }
        setBusy(true);
        setNotice(null);
        setMoreOpen(false);
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
        setState((current) => ({ ...createCropState(), format: current.format, activeTab: current.activeTab, customSizes: current.customSizes, ratioId: current.activeTab === "size" ? FREE_RATIO_ID : current.ratioId }));
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

    const platforms = useMemo(() => {
        const query = platformQuery.trim().toLowerCase();
        if (!query) return PLATFORM_PRESETS;
        return PLATFORM_PRESETS.filter((preset) => preset.title.toLowerCase().includes(query) || preset.key.includes(query));
    }, [platformQuery]);

    const ratioRows = useMemo(() => {
        const query = ratioQuery.trim().toLowerCase();
        if (!query) return CROP_RATIO_ROWS;
        return CROP_RATIO_ROWS.filter((row) => row.id.includes(query) || row.note.includes(ratioQuery.trim()));
    }, [ratioQuery]);

    const rotate = (delta: number) => commit((current) => applyRotation(current, ((((current.rotation + delta) % 360) + 360) % 360) as CropRotation, size));
    const canUndo = undoStack.length > 0;
    const canRedo = redoStack.length > 0;

    return (
        <div data-testid="crop-workspace" data-tool={IMAGE_CROP_TOOL_ID} className="relative flex h-full min-h-0 flex-col bg-muted text-foreground">
            <input
                ref={fileRef}
                type="file"
                accept={CROP_UPLOAD_CONSTRAINTS.mimeTypes.join(",")}
                className="hidden"
                data-testid="tool-asset-file-input"
                onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    event.target.value = "";
                    void pickFiles(files);
                }}
            />
            {/* 原站 1600×1000：页面内边距 10；画布列 1100（顶部 44 高操作条 + 画布/空态卡）+ 右侧 270 参数面板 */}
            <div
                data-testid="tool-workspace-columns"
                data-canvas="true"
                data-config-side="right"
                className="grid min-h-0 w-full flex-1 grid-cols-1 gap-[10px] overflow-y-auto p-[10px] lg:grid-cols-[minmax(0,1fr)_270px]"
            >
                <div data-testid="tool-main-column" className="flex min-h-0 min-w-0 flex-col gap-3 bg-transparent!">
                    {/* 画布顶部通栏单行工具条：左 重置/撤销/重做/重新上传，右 下载图片/真人换模特2.0/更多/历史记录 */}
                    <div data-testid="crop-toolbar" className="flex min-h-11 shrink-0 flex-wrap items-center gap-1 rounded-lg bg-card px-2.5 py-1 text-[13px] leading-none">
                        <ToolButton testId="crop-reset" label="重置" icon={RotateCcw} disabled={!source} onClick={() => commit(createCropState(source?.size ?? undefined))} />
                        <ToolButton
                            testId="crop-undo"
                            label="撤销"
                            icon={Undo2}
                            disabled={!canUndo}
                            onClick={() => {
                                const prev = undoStack[undoStack.length - 1];
                                setUndoStack((stack) => stack.slice(0, -1));
                                setRedoStack((stack) => [...stack, state]);
                                setState(prev);
                            }}
                        />
                        <ToolButton
                            testId="crop-redo"
                            label="重做"
                            icon={Redo2}
                            disabled={!canRedo}
                            onClick={() => {
                                const next = redoStack[redoStack.length - 1];
                                setRedoStack((stack) => stack.slice(0, -1));
                                setUndoStack((stack) => [...stack, state]);
                                setState(next);
                            }}
                        />
                        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
                        <ToolButton testId="crop-reupload" label="重新上传" icon={Upload} disabled={!source} onClick={reupload} />

                        <div className="ml-auto flex flex-wrap items-center gap-1">
                            <button
                                type="button"
                                data-testid="crop-download"
                                aria-label="下载图片"
                                disabled={!source || busy}
                                onClick={() => void downloadCurrent()}
                                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium leading-none text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <Download className="size-3.5" aria-hidden />
                                <span>下载图片</span>
                                <span data-testid="crop-free-badge" className="rounded-sm bg-destructive px-1 py-px text-[10px] leading-[13px] font-normal text-white">
                                    限免
                                </span>
                            </button>
                            <ToolButton testId="crop-related-dressing" label="真人换模特2.0" icon={UserRound} onClick={() => navigate("/tools/product-design/ai-dressing-v2")} mutedIcon />
                            {/* 「更多」：输出格式 / 锁定比例 / 开始裁剪默认不占主流程 */}
                            <div className="relative">
                                <button
                                    type="button"
                                    data-testid="crop-more"
                                    aria-label="更多"
                                    aria-expanded={moreOpen}
                                    onClick={() => setMoreOpen((open) => !open)}
                                    className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
                                >
                                    <MoreHorizontal className="size-4" aria-hidden />
                                </button>
                                {moreOpen ? (
                                    <div data-testid="crop-more-panel" className="absolute right-0 top-9 z-30 flex w-[248px] flex-col gap-2 rounded-lg border border-border bg-background p-3 shadow-lg">
                                        <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                            输出格式
                                            <select
                                                data-testid="crop-format"
                                                value={state.format}
                                                onChange={(event) => commit({ ...state, format: event.target.value as CropOutputFormat })}
                                                className="h-[26px] rounded border border-border bg-background px-1.5 text-[11px] text-foreground"
                                            >
                                                {IMAGE_CROP_FORMATS.map((format) => (
                                                    <option key={format} value={format}>
                                                        {FORMAT_LABEL[format]}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <button
                                            type="button"
                                            data-testid="crop-lock-ratio"
                                            aria-pressed={state.locked}
                                            onClick={() => commit({ ...state, locked: !state.locked })}
                                            className={cn(
                                                "inline-flex h-[26px] items-center justify-between gap-1 rounded border px-2 text-[11px] transition",
                                                state.locked ? "border-selected bg-selected-soft text-foreground" : "border-border text-muted-foreground hover:bg-accent",
                                            )}
                                        >
                                            <span>锁定比例</span>
                                            <span>{state.locked ? "已锁定" : "未锁定"}</span>
                                        </button>
                                        {guardIssues.length > 0 ? (
                                            <ul data-testid="crop-issues" className="space-y-0.5 text-[11px] leading-4 text-amber-700 dark:text-amber-300">
                                                {guardIssues.map((issue) => (
                                                    <li key={issue.code}>· {issue.message}</li>
                                                ))}
                                            </ul>
                                        ) : null}
                                        <button
                                            type="button"
                                            data-testid="crop-submit"
                                            disabled={!canSubmit}
                                            onClick={() => void submit()}
                                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium leading-none text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            <Download className="size-3.5" aria-hidden />
                                            {busy ? "裁剪中…" : "开始裁剪"}
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                            <button
                                type="button"
                                data-testid="crop-history"
                                aria-pressed={historyOpen}
                                onClick={() => setHistoryOpen((open) => !open)}
                                className={cn(
                                    "inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] leading-none transition hover:bg-accent",
                                    historyOpen ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                <History className="size-3.5" aria-hidden />
                                历史记录
                            </button>
                        </div>
                    </div>

                    {notice ? (
                        <p data-testid="crop-notice" className="rounded-md bg-muted px-3 py-1.5 text-[11px] leading-4 text-muted-foreground">
                            {notice}
                        </p>
                    ) : null}

                    {source ? (
                        <section className="flex min-h-0 min-w-0 flex-col gap-2">
                            <CropCanvas
                                url={source.url}
                                state={state}
                                onRectChange={(rect) => commit(applyRectDrag(state, rect, size))}
                                onRotate={() => rotate(90)}
                            />
                            <p className="text-[11px] leading-4 text-muted-foreground">
                                {source.name} · {size.width}×{size.height} · 裁剪区 {cropPixels.width}×{cropPixels.height} → 输出 {state.outputWidth}×{state.outputHeight}
                            </p>
                        </section>
                    ) : (
                        // 空态：原站 `_uploadPanel_` 灰底 + 内层 1px 描边框（内边距 50）；示例图是原站 image-crop-upload-tour.jpg（自带四角裁剪框）
                        <div
                            data-testid="crop-empty"
                            data-dragging={dragging ? "true" : "false"}
                            onDragOver={(event) => {
                                event.preventDefault();
                                setDragging(true);
                            }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={(event) => {
                                event.preventDefault();
                                setDragging(false);
                                void pickFiles(Array.from(event.dataTransfer?.files ?? []));
                            }}
                            className="mx-auto my-auto w-full max-w-[559px] rounded-lg bg-muted p-[10px]"
                        >
                            <div className={cn("flex flex-col items-center rounded-lg border px-[50px] py-[50px] transition", dragging ? "border-selected bg-selected-soft" : "border-border bg-card/60")}>
                            <img src={CROP_SAMPLE_IMAGE} alt="示例图片" data-testid="crop-empty-sample" className="block h-[300px] w-[437px] max-w-full rounded-md object-contain" draggable={false} />
                            <h2 className="mt-5 text-[20px] font-medium leading-7 text-foreground">图片裁剪</h2>
                            <p className="mt-2.5 text-sm leading-[22px] text-muted-foreground">上传图片，裁剪图片为任意尺寸/比例</p>
                            <button
                                type="button"
                                data-testid="crop-upload-local"
                                disabled={uploading || busy}
                                onClick={() => fileRef.current?.click()}
                                className="mt-5 inline-flex h-[30px] w-full max-w-[437px] items-center justify-center gap-1.5 rounded bg-primary text-sm leading-none text-primary-foreground transition hover:bg-primary/90 disabled:cursor-progress disabled:opacity-60"
                            >
                                <Upload className="size-3.5" aria-hidden />
                                {uploading ? "上传中…" : "从本地上传"}
                            </button>
                            <div className="mt-2.5 grid w-full max-w-[437px] grid-cols-2 gap-[9px]">
                                <div className="relative">
                                    <button
                                        type="button"
                                        data-testid="crop-from-library"
                                        aria-expanded={libraryOpen}
                                        disabled={library.length === 0}
                                        title={library.length ? "从作品库选择" : "作品库暂无图片"}
                                        onClick={() => setLibraryOpen((open) => !open)}
                                        className="h-[30px] w-full rounded border border-border bg-card text-sm leading-none text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        从作品库选择
                                    </button>
                                    {libraryOpen ? (
                                        <ul data-testid="crop-library-menu" className="absolute left-0 top-9 z-20 max-h-[220px] w-full overflow-y-auto rounded-lg border border-border bg-background p-1 shadow-lg">
                                            {library.slice(0, 12).map((item) => (
                                                <li key={item.id}>
                                                    <button
                                                        type="button"
                                                        onClick={() => void chooseLibrary(item)}
                                                        className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                                                    >
                                                        <img src={item.url} alt="" className="size-8 rounded object-cover" />
                                                        <span className="truncate">{item.name}</span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : null}
                                </div>
                                <button
                                    type="button"
                                    data-testid="crop-from-products"
                                    disabled={library.length === 0}
                                    title={library.length ? "从商品库选择" : "商品库暂无图片"}
                                    onClick={() => setLibraryOpen((open) => !open)}
                                    className="h-[30px] w-full rounded border border-border bg-card text-sm leading-none text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    从商品库选择
                                </button>
                            </div>
                            <p className="mt-2.5 text-center text-[12px] leading-[18px] text-foreground">
                                或 <span className="font-medium text-foreground">拖拽/粘贴</span> 图片到此处（免费限单张，付费解锁 100 张批量上传）
                            </p>
                            <p className="text-center text-[12px] leading-[18px] text-muted-foreground">
                                支持jpg、jpeg、png、webp，{Math.round(IMAGE_CROP_MAX_BYTES / 1024 / 1024)}M以内，{IMAGE_CROP_MIN_SIDE}*{IMAGE_CROP_MIN_SIDE} ~ {IMAGE_CROP_MAX_SIDE}*{IMAGE_CROP_MAX_SIDE}
                            </p>
                            </div>
                        </div>
                    )}

                    {activeTask ? (
                        <>
                            <TaskStatusPanel task={activeTask} />
                            <ToolResult task={activeTask} toolId={IMAGE_CROP_TOOL_ID} title="裁剪结果" onRetry={submit} />
                        </>
                    ) : null}
                </div>

                {/* 右侧参数面板：原站 270 宽白卡、内边距 10、撑满列高（x1310..1580） */}
                <aside data-testid="tool-config-column" className="flex min-h-0 min-w-0 flex-col gap-2.5 overflow-y-auto rounded-lg bg-card p-2.5">
                    <div className="flex h-[22px] shrink-0 rounded-md bg-muted" role="tablist" aria-label="裁剪方式">
                        {(["size", "ratio"] as const).map((tab) => (
                            <button
                                key={tab}
                                type="button"
                                role="tab"
                                data-testid={`crop-tab-${tab}`}
                                aria-selected={state.activeTab === tab}
                                onClick={() => commit({ ...state, activeTab: tab })}
                                className={cn(
                                    "h-[22px] flex-1 rounded text-sm leading-none transition",
                                    state.activeTab === tab ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {tab === "size" ? "尺寸调整" : "比例调整"}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col gap-[5px]">
                        {state.activeTab === "size" ? (
                            <>
                                <SearchField testId="crop-platform-search" value={platformQuery} onChange={setPlatformQuery} placeholder="搜索平台名称" />
                                {/* 单列可滚动平台列表（原站 scrollHeight 1020 / clientHeight 346） */}
                                <div data-testid="crop-platforms" aria-label="平台预设" className="max-h-[346px] overflow-y-auto rounded-lg bg-foreground/[0.04] px-[5px] py-1.5">
                                    <button
                                        type="button"
                                        data-testid="crop-size-free"
                                        aria-pressed={state.platformKey === null && state.ratioId === FREE_RATIO_ID}
                                        onClick={() => commit(applyRatioPreset({ ...state, platformKey: null, platformTitle: "" }, FREE_RATIO_ID, size))}
                                        className={cn(
                                            "flex h-10 w-full items-center gap-3 rounded-md px-2 text-left text-[12px] transition",
                                            state.platformKey === null && state.ratioId === FREE_RATIO_ID ? "bg-selected-soft text-foreground" : "text-foreground hover:bg-foreground/[0.04]",
                                        )}
                                    >
                                        <MediaIcon color="var(--muted-foreground)" />
                                        <span className="flex-1 truncate">自由裁剪</span>
                                    </button>
                                    {platforms.map((preset) => (
                                        <button
                                            key={preset.key}
                                            type="button"
                                            data-testid={`crop-platform-${preset.key}`}
                                            aria-pressed={state.platformKey === preset.key}
                                            onClick={() => commit(applyPlatformPreset(state, preset.key, size))}
                                            className={cn(
                                                "flex h-10 w-full items-center gap-3 rounded-md px-2 text-left text-[12px] transition",
                                                state.platformKey === preset.key ? "bg-selected-soft text-foreground" : "text-foreground hover:bg-foreground/[0.04]",
                                            )}
                                        >
                                            <MediaIcon color={PLATFORM_COLORS[preset.key] ?? "#94a3b8"} />
                                            <span className="flex-1 truncate">{preset.title}</span>
                                            <span className="shrink-0 tabular-nums text-[12px] text-muted-foreground">
                                                {preset.width} × {preset.height}
                                            </span>
                                        </button>
                                    ))}
                                    {platforms.length === 0 ? <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">没有匹配的平台</p> : null}
                                </div>
                            </>
                        ) : (
                            <>
                                <SearchField testId="crop-ratio-search" value={ratioQuery} onChange={setRatioQuery} placeholder="搜索比例" />
                                <div data-testid="crop-ratios" className="max-h-[346px] overflow-y-auto rounded-lg bg-foreground/[0.04] px-[5px] py-1.5">
                                    <button
                                        type="button"
                                        data-testid="crop-ratio-original"
                                        aria-pressed={state.ratioId === FREE_RATIO_ID}
                                        onClick={() => commit(applyRatioPreset({ ...state, platformKey: null, platformTitle: "" }, FREE_RATIO_ID, size))}
                                        className={cn(
                                            "flex h-10 w-full items-center gap-3 rounded-md px-2 text-left text-[12px] transition",
                                            state.ratioId === FREE_RATIO_ID ? "bg-selected-soft text-foreground" : "text-foreground hover:bg-foreground/[0.04]",
                                        )}
                                    >
                                        <span className="flex-1 truncate">原图比例</span>
                                        <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">{source ? `${size.width} × ${size.height}` : "—"}</span>
                                    </button>
                                    {ratioRows.map((row) => (
                                        <button
                                            key={row.id}
                                            type="button"
                                            data-testid={`crop-ratio-${row.id}`}
                                            aria-pressed={state.ratioId === row.id}
                                            aria-label={`${row.id} ${row.note}`}
                                            onClick={() => commit(applyRatioPreset({ ...state, platformKey: null, platformTitle: "" }, row.id, size))}
                                            className={cn(
                                                "flex h-10 w-full items-center gap-3 rounded-md px-2 text-left text-[12px] transition",
                                                state.ratioId === row.id ? "bg-selected-soft text-foreground" : "text-foreground hover:bg-foreground/[0.04]",
                                            )}
                                        >
                                            <span className="shrink-0 tabular-nums">{row.id}</span>
                                            <span className="flex-1 truncate text-right text-[12px] text-muted-foreground">{row.note}</span>
                                        </button>
                                    ))}
                                    {ratioRows.length === 0 ? <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">没有匹配的比例</p> : null}
                                </div>
                            </>
                        )}
                    </div>

                    {/* 目标尺寸：原站默认 1024×1024 + 链接（锁定比例）+ 保存自定义尺寸 + 四角旋转/翻转 */}
                    <div className="flex shrink-0 flex-col gap-2.5">
                        <div className="flex items-center justify-between">
                            <span className="text-[12px] leading-[22px] text-muted-foreground/70">目标尺寸</span>
                            <span data-testid="crop-output-summary" className="sr-only">
                                {state.outputWidth}×{state.outputHeight}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <PixelField label="宽" testId="crop-output-width" value={state.outputWidth} onChange={(value) => commit(applyOutputSize(state, "width", value, size))} />
                            <button
                                type="button"
                                data-testid="crop-link-ratio"
                                aria-pressed={state.locked}
                                aria-label={state.locked ? "解除锁定比例" : "锁定比例"}
                                onClick={() => commit({ ...state, locked: !state.locked })}
                                className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-md border transition", state.locked ? "border-selected bg-selected-soft text-foreground" : "border-transparent text-foreground hover:bg-accent")}
                            >
                                <Link2 className="size-3.5" aria-hidden />
                            </button>
                            <PixelField label="高" testId="crop-output-height" value={state.outputHeight} onChange={(value) => commit(applyOutputSize(state, "height", value, size))} />
                        </div>
                        <button
                            type="button"
                            data-testid="crop-save-custom"
                            onClick={() => commit(saveCustomSize(state))}
                            className="h-6 w-full rounded-md border border-border text-[12px] leading-none text-muted-foreground transition hover:bg-accent hover:text-foreground"
                        >
                            保存自定义尺寸
                        </button>
                        {state.customSizes.length > 0 ? (
                            <div className="flex flex-wrap gap-1" data-testid="crop-custom-sizes">
                                {state.customSizes.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => commit(applyCustomSize(state, item.id, size))}
                                        className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                                    >
                                        {item.width}×{item.height}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                        <div className="grid grid-cols-4 gap-2.5 border-t border-border pt-5">
                            <QuadButton testId="crop-rotate-ccw" label="逆时针旋转90°" disabled={!source} onClick={() => rotate(-90)}>
                                <RotateCcw className="size-4" aria-hidden />
                            </QuadButton>
                            <QuadButton testId="crop-rotate-cw" label="顺时针旋转90°" disabled={!source} onClick={() => rotate(90)}>
                                <RotateCw className="size-4" aria-hidden />
                            </QuadButton>
                            <QuadButton testId="crop-flip-x" label="水平翻转" disabled={!source} onClick={() => commit(applyFlip(state, "x"))}>
                                <FlipHorizontal2 className="size-4" aria-hidden />
                            </QuadButton>
                            <QuadButton testId="crop-flip-y" label="垂直翻转" disabled={!source} onClick={() => commit(applyFlip(state, "y"))}>
                                <FlipVertical2 className="size-4" aria-hidden />
                            </QuadButton>
                        </div>
                    </div>
                </aside>
            </div>

            {/* 工具条右侧入口打开的真实历史面板（不再把历史卡塞进主流程） */}
            {historyOpen ? (
                <div data-testid="crop-history-panel" className="absolute inset-y-0 right-0 z-20 flex w-[360px] max-w-full flex-col border-l border-border bg-background shadow-xl">
                    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
                        <span className="text-[13px] font-medium">历史记录</span>
                        <button type="button" aria-label="关闭历史记录" onClick={() => setHistoryOpen(false)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                            <X className="size-4" aria-hidden />
                        </button>
                    </header>
                    <div className="min-h-0 flex-1 overflow-y-auto p-3">
                        <ToolTaskHistory
                            toolId={IMAGE_CROP_TOOL_ID}
                            emptyHint="暂无历史记录"
                            onSelectTask={(selected) => {
                                setTask(selected);
                                setRestoredDismissed(false);
                                setHistoryOpen(false);
                            }}
                        />
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function ToolButton({
    label,
    testId,
    icon: Icon,
    disabled,
    mutedIcon,
    onClick,
}: {
    label: string;
    testId: string;
    icon: (props: { className?: string; "aria-hidden"?: boolean }) => React.ReactNode;
    disabled?: boolean;
    mutedIcon?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            data-testid={testId}
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] leading-none text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
            <Icon className={cn("size-3.5", mutedIcon && "text-muted-foreground")} aria-hidden />
            <span>{label}</span>
        </button>
    );
}

function QuadButton({ label, testId, disabled, onClick, children }: { label: string; testId: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            data-testid={testId}
            title={label}
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className="inline-flex h-[46px] items-center justify-center rounded-lg bg-muted text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
            {children}
        </button>
    );
}

function SearchField({ testId, value, onChange, placeholder }: { testId: string; value: string; onChange: (value: string) => void; placeholder: string }) {
    return (
        <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
                type="search"
                data-testid={testId}
                value={value}
                placeholder={placeholder}
                aria-label={placeholder}
                onChange={(event) => onChange(event.target.value)}
                className="h-8 w-full rounded-md border border-border bg-card pl-7 pr-6 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            {value ? (
                <button type="button" aria-label="清除搜索" onClick={() => onChange("")} className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
                    <X className="size-3" aria-hidden />
                </button>
            ) : null}
        </div>
    );
}

function MediaIcon({ color }: { color: string }) {
    return <span aria-hidden className="inline-block size-4 shrink-0 rounded-[3px]" style={{ backgroundColor: color }} />;
}

function PixelField({ label, testId, value, onChange }: { label: string; testId: string; value: number; onChange: (value: number) => void }) {
    return (
        <label className="flex h-8 min-w-0 flex-1 items-center gap-1 rounded-md border border-border px-3 text-sm text-foreground">
            <span className="shrink-0">{label}</span>
            <input
                type="number"
                data-testid={testId}
                min={1}
                aria-label={label}
                value={value}
                onChange={(event) => onChange(Math.max(1, Math.round(Number(event.target.value) || 0)))}
                className="min-w-0 flex-1 bg-transparent text-center tabular-nums text-foreground outline-none"
            />
        </label>
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
        <div className="flex min-h-[280px] flex-1 items-center justify-center overflow-hidden rounded-lg border border-border bg-[repeating-conic-gradient(#00000008_0deg_90deg,#00000000_90deg_180deg)] bg-[length:16px_16px] p-3">
            <div ref={boxRef} className="relative flex h-full min-h-[260px] w-full items-center justify-center">
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
