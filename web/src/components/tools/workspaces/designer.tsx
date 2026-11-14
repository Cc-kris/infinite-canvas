import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronsDown, ChevronsUp, Eye, EyeOff, FilePlus2, ImagePlus, Loader2, Lock, Maximize2, Play, Redo2, Trash2, Type, Undo2, Unlock, X } from "lucide-react";

import { uploadToolAsset, resolveToolAssetConstraints } from "@/services/api/tools/assets";
import { downloadResultItem, sendResultItemToCanvas } from "@/components/tools/tool-result-actions";
import type { ToolTaskResultItem } from "@/services/api/tools/task-machine";
import { useToolReplayStore } from "@/stores/use-tool-replay-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";
import { cn } from "@/lib/utils";
import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import { DesignerHome, type DesignerHomeTemplate } from "@/components/tools/workspaces/designer-home";

import {
    addDesignerLayer,
    buildDesignerDonePayload,
    canRedoDesigner,
    canUndoDesigner,
    commitDesignerDocument,
    createBaseImageLayer,
    createDesignerDocument,
    createDesignerHistory,
    createDesignerId,
    createTextLayer,
    decideDesignerClose,
    designerCanvasPreset,
    designerDocumentFingerprint,
    DESIGNER_CANVAS_PRESETS,
    DESIGNER_FONT_FAMILIES,
    designerFontFamily,
    DESIGNER_LAYER_LIMITS,
    DESIGNER_TEXT_LIMIT,
    hasBlockingDesignerIssue,
    moveDesignerLayer,
    nudgeDesignerLayer,
    removeDesignerLayer,
    renameDesignerLayer,
    reorderDesignerLayers,
    resizeDesignerLayer,
    restoreDesignerDraft,
    rotateDesignerLayer,
    NEW_DESIGNER_TOOL_ID,
    selectedDesignerLayer,
    serializeDesignerDraft,
    setDesignerCanvasBackground,
    setDesignerCanvasSize,
    setDesignerLayerVisibility,
    toggleDesignerLayerLock,
    undoDesignerDocument,
    redoDesignerDocument,
    updateDesignerLayer,
    validateDesignerState,
    type DesignerDocument,
    type DesignerHistory,
    type DesignerHostState,
} from "@/features/tools/registry/new-designer";
import {
    createCanvasDesignerCompositor,
    createDesignerSnapshot,
    designerResultNotice,
    designerResultFromStoredTask,
    latestDesignerTask,
    DesignerAdapterError,
    readDesignerReplaySnapshot,
    runDesigner,
    type DesignerAssetPort,
    type DesignerAssetRef,
    type DesignerCompositorPort,
    type DesignerStageState,
} from "@/features/tools/adapters/new-designer";

/* ============================== 草稿存储 ============================== */

export type DesignerDraftStorage = {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem?: (key: string) => void;
};

const DRAFT_STORAGE_KEY = "tool-draft:v1:NEW_DESIGNER";

function defaultDraftStorage(): DesignerDraftStorage | null {
    try {
        const storage = (globalThis as { localStorage?: DesignerDraftStorage }).localStorage;
        return storage ?? null;
    } catch {
        return null;
    }
}

/** 真实入库端口：Canvas PNG → uploadToolAsset（真实落库），不伪造 assetId。 */
const uploadAssetPort: DesignerAssetPort = {
    async save(blob, meta) {
        const record = await uploadToolAsset(blob, { name: meta.name, constraints: resolveToolAssetConstraints({ kind: "image", mimeTypes: ["image/png"] }) });
        return { assetId: record.id, url: record.url, bytes: record.bytes };
    },
};

export type DesignerWorkspaceProps = {
    open?: boolean;
    designerId?: string;
    imageUrl?: string;
    sourceName?: string;
    /** 恢复草稿用；默认 localStorage。 */
    draftStorage?: DesignerDraftStorage | null;
    compositor?: DesignerCompositorPort;
    assets?: DesignerAssetPort;
    onClose?: (payload: { designerId: string; saved: boolean }) => void;
    onDone?: (payload: ReturnType<typeof buildDesignerDonePayload>, document: DesignerDocument) => void;
};

export function DesignerWorkspace({
    open = true,
    designerId,
    imageUrl = "",
    sourceName = "商品图",
    draftStorage,
    compositor,
    assets = uploadAssetPort,
    onClose,
    onDone,
}: DesignerWorkspaceProps) {
    const storage = useMemo(() => (draftStorage === undefined ? defaultDraftStorage() : draftStorage), [draftStorage]);
    const activeCompositor = useMemo(() => compositor ?? createCanvasDesignerCompositor(), [compositor]);

    const [history, setHistory] = useState<DesignerHistory>(() => createDesignerHistory(createDesignerDocument({ designerId: designerId ?? createDesignerId(), imageUrl })));
    const [selectedId, setSelectedId] = useState<string | undefined>(() => (imageUrl ? "layer-base" : undefined));
    const [preview, setPreview] = useState(false);
    const [stage, setStage] = useState<DesignerStageState>("idle");
    const [error, setError] = useState<DesignerAdapterError | undefined>();
    const [result, setResult] = useState<DesignerAssetRef | undefined>();
    const [actionNotice, setActionNotice] = useState("");
    const [resultFingerprint, setResultFingerprint] = useState<string | undefined>();
    const [baselineFingerprint, setBaselineFingerprint] = useState<string>(() => designerDocumentFingerprint(history.present));
    const [restoreNotice, setRestoreNotice] = useState("");
    const [replayNotice, setReplayNotice] = useState("");
    const [closePrompt, setClosePrompt] = useState("");
    const [uploadNote, setUploadNote] = useState("");
    const [uploading, setUploading] = useState(false);
    /** 原站进入设计器先到首页；宿主带图进来（imageUrl）时直接进编辑器。 */
    const [homeOpen, setHomeOpen] = useState(!imageUrl);
    const fileRef = useRef<HTMLInputElement | null>(null);

    /** 任务持久化端口：每次导出都写进共享任务 store（localStorage 落盘），历史坞/刷新后回放都读它。 */
    const upsertTask = useToolTaskStore((state) => state.upsertTask);
    const consumeReplay = useToolReplayStore((state) => state.consumeReplay);
    const replayRequest = useToolReplayStore((state) => state.pending[NEW_DESIGNER_TOOL_ID]);

    const document = history.present;
    const selected = selectedDesignerLayer(document, selectedId);
    const host: DesignerHostState = { open, isDesignerUse: true, imageUrl, hasOnClose: typeof onClose === "function", hasOnDone: typeof onDone === "function" };
    const issues = useMemo(() => validateDesignerState({ document, host }), [document, host.isDesignerUse, host.imageUrl, open, host.hasOnClose, host.hasOnDone]);
    const blocked = hasBlockingDesignerIssue(issues);
    const dirty = document.revision > 1 ? designerDocumentFingerprint(document) !== baselineFingerprint : false;
    const stale = Boolean(resultFingerprint) && resultFingerprint !== designerDocumentFingerprint(document);
    const busy = stage === "validating" || stage === "composing" || stage === "saving";

    const apply = useCallback((next: DesignerDocument) => {
        setHistory((current) => commitDesignerDocument(current, next));
        setStage("idle");
        setError(undefined);
    }, []);

    /* ---------------- 草稿恢复 ---------------- */
    useEffect(() => {
        if (!storage) return;
        let raw: string | null = null;
        try {
            raw = storage.getItem(DRAFT_STORAGE_KEY);
        } catch {
            return;
        }
        if (!raw) return;
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            setRestoreNotice("草稿无法解析，已忽略（未覆盖任何编辑）。");
            return;
        }
        const restored = restoreDesignerDraft(parsed);
        if (restored.status !== "ok") {
            setRestoreNotice(restored.status === "empty" ? "" : `草稿结构已变化，未恢复：${restored.reason}`);
            return;
        }
        if (designerId && restored.values.designerId !== designerId) {
            setRestoreNotice("草稿属于其他设计项目，未恢复。");
            return;
        }
        setHistory(createDesignerHistory(restored.values.document));
        setSelectedId(restored.values.document.layers[0]?.id);
        setBaselineFingerprint(designerDocumentFingerprint(restored.values.document));
        setRestoreNotice(`已恢复草稿：${restored.values.savedAt || "上次会话"}（${restored.values.document.layers.length} 个图层）`);
    }, [storage, designerId]);

    /* ---------------- 历史任务回放（历史坞投递的真实落盘快照，非注入） ---------------- */
    useEffect(() => {
        if (!replayRequest) return;
        const request = consumeReplay(NEW_DESIGNER_TOOL_ID);
        if (!request) return;
        const replayed = readDesignerReplaySnapshot(request.snapshot);
        if (!replayed) {
            setReplayNotice("这条历史任务的画布快照无法回放（结构不符），未覆盖当前编辑。");
            return;
        }
        setHistory(createDesignerHistory(replayed));
        setSelectedId(replayed.layers[0]?.id);
        setStage("idle");
        setError(undefined);
        setResult(undefined);
        setResultFingerprint(undefined);
        setBaselineFingerprint(designerDocumentFingerprint(replayed));
        setHomeOpen(false);
        setReplayNotice(
            `已回放历史任务 ${request.taskId.slice(0, 12)} 的画布（${replayed.layers.length} 个图层 · ${replayed.width}×${replayed.height}）`,
        );
    }, [replayRequest, consumeReplay]);

    /* ---------------- 结果回填（上次导出的结果不该因刷新消失） ---------------- *
     * 导出任务与结果字节都已落盘（use-tool-task-store + media_files/storageKey），
     * 刷新后按最近一条 NEW_DESIGNER 任务把结果区恢复出来，下载 / 发送画布 / 回传继续可用；
     * 画布若已改动，stale 会照实提示「结果来自旧版本」。 */
    const taskRecords = useToolTaskStore((state) => state.tasks);
    const tasksHydrated = useToolTaskStore((state) => state.hydrated);
    const hydrateTasks = useToolTaskStore((state) => state.hydrate);
    const resultRestored = useRef(false);
    useEffect(() => {
        if (!tasksHydrated) {
            hydrateTasks();
            return;
        }
        if (resultRestored.current || result) return;
        const latest = latestDesignerTask(taskRecords, NEW_DESIGNER_TOOL_ID);
        resultRestored.current = true;
        if (!latest) return;
        const restored = designerResultFromStoredTask(latest);
        if (!restored) return;
        // 快照里的 url 可能是上次会话的 blob:（fresh reload 后必然失效）。
        // 只要还有 storageKey，就用 IndexedDB 里的真实字节重新签发 object URL，再交给结果区；
        // 否则发送画布/下载会在 fetch(blob:) 处报 Failed to fetch。
        void (async () => {
            let url = restored.result.url;
            if (restored.result.storageKey) {
                const { resolveMediaUrl } = await import("@/services/file-storage");
                url = await resolveMediaUrl(restored.result.storageKey, url).catch(() => url);
            }
            if (!url) {
                setRestoreNotice((prev) => prev || "上次导出的结果字节已不在本地，请重新导出设计稿。");
                return;
            }
            setResult({ ...restored.result, url });
            setResultFingerprint(restored.fingerprint);
            setStage("succeeded");
            setError(undefined);
            setRestoreNotice(
                (prev) => prev || `已恢复上次导出的设计稿（资产 #${restored.result.assetId.slice(0, 8)}），来自任务记录。`,
            );
        })();
    }, [hydrateTasks, result, taskRecords, tasksHydrated]);

    /* ---------------- 草稿保存（真实写盘，不静默） ---------------- */
    useEffect(() => {
        if (!storage) return;
        try {
            storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(serializeDesignerDraft(document, { imageUrl, isDesignerUse: true })));
        } catch {
            setUploadNote("草稿写入失败（存储不可用），关闭页面前请先导出设计稿。");
        }
    }, [document, storage, imageUrl]);

    const setCanvasPreset = useCallback(
        (presetId: string) => {
            const preset = designerCanvasPreset(presetId);
            apply(setDesignerCanvasSize(document, preset.width, preset.height));
        },
        [apply, document],
    );

    const handleAddText = useCallback(() => {
        apply(addDesignerLayer(document, createTextLayer(document.layers.length)));
    }, [apply, document]);

    const handleUploadLayer = useCallback(
        async (file: File | undefined) => {
            if (!file) return;
            setUploading(true);
            setUploadNote("");
            try {
                const record = await uploadToolAsset(file, { name: file.name });
                apply(
                    addDesignerLayer(document, {
                        id: `layer-image-${record.id.slice(0, 6)}`,
                        kind: "image",
                        name: record.name || "图片图层",
                        src: record.url,
                        x: Math.round(document.width * 0.1),
                        y: Math.round(document.height * 0.1),
                        width: Math.round(document.width * 0.4),
                        height: Math.round(document.height * 0.4),
                        rotation: 0,
                        opacity: 1,
                        visible: true,
                        locked: false,
                    }),
                );
            } catch (uploadError) {
                setUploadNote(uploadError instanceof Error ? `上传失败：${uploadError.message}` : "上传失败：未知原因");
            } finally {
                setUploading(false);
            }
        },
        [apply, document],
    );

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (!selected) return;
            if (event.key.startsWith("Arrow")) {
                event.preventDefault();
                apply(nudgeDesignerLayer(document, selected.id, event.key as "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown", event.shiftKey));
                return;
            }
            if (event.key === "[") {
                event.preventDefault();
                apply(rotateDesignerLayer(document, selected.id, selected.rotation - 1));
            }
            if (event.key === "]") {
                event.preventDefault();
                apply(rotateDesignerLayer(document, selected.id, selected.rotation + 1));
            }
        },
        [apply, document, selected],
    );

    /* ---------------- 导出（真实合成 + 真实入库） ---------------- */
    const handleExport = useCallback(async () => {
        setError(undefined);
        setResult(undefined);
        try {
            const snapshot = createDesignerSnapshot(document, host);
            const run = await runDesigner({
                document,
                host,
                compositor: activeCompositor,
                assets,
                requestId: snapshot.requestId,
                onStage: setStage,
                persist: upsertTask,
            });
            setResult(run.asset);
            setResultFingerprint(run.snapshot.fingerprint);
            setBaselineFingerprint(run.snapshot.fingerprint);
            setStage("succeeded");
        } catch (runError) {
            const adapterError = runError instanceof DesignerAdapterError ? runError : new DesignerAdapterError("compose-failed", runError instanceof Error ? runError.message : "导出失败");
            setError(adapterError);
            setStage("failed");
        }
    }, [activeCompositor, assets, document, host.isDesignerUse, host.imageUrl, host.open, host.hasOnClose, host.hasOnDone, upsertTask]);

    /* ---------------- 结果动作：下载 / 发送画布（复用共享真实画布依赖） ---------------- */
    const resultItem = useMemo<ToolTaskResultItem | undefined>(
        () => (result ? { id: result.assetId, kind: "image", url: result.url, mimeType: "image/png", bytes: result.bytes, storageKey: result.storageKey } : undefined),
        [result],
    );

    const handleDownload = useCallback(async () => {
        if (!resultItem) return;
        setActionNotice("");
        try {
            const name = await downloadResultItem(resultItem, 0, { toolId: NEW_DESIGNER_TOOL_ID });
            setActionNotice(`已下载 ${name}`);
        } catch (downloadError) {
            setActionNotice(downloadError instanceof Error ? downloadError.message : "下载失败");
        }
    }, [resultItem]);

    const handleSendCanvas = useCallback(async () => {
        if (!resultItem) return;
        setActionNotice("");
        try {
            const created = await sendResultItemToCanvas(resultItem, { toolId: NEW_DESIGNER_TOOL_ID, projectTitle: "商品图设计器结果" });
            setActionNotice(`已发送画布（项目 ${created.projectId.slice(0, 8)} · 节点 ${created.nodeId.slice(0, 8)}）`);
        } catch (canvasError) {
            setActionNotice(canvasError instanceof Error ? canvasError.message : "发送画布失败");
        }
    }, [resultItem]);

    const handleDone = useCallback(() => {
        if (!result) return;
        try {
            const payload = buildDesignerDonePayload(document, result);
            onDone?.(payload, document);
            setBaselineFingerprint(designerDocumentFingerprint(document));
        } catch (doneError) {
            setError(new DesignerAdapterError("asset-save-failed", doneError instanceof Error ? doneError.message : "无可回传的结果"));
            setStage("failed");
        }
    }, [document, onDone, result]);

    const requestClose = useCallback(() => {
        const decision = decideDesignerClose({ dirty });
        if (decision.action === "confirm") {
            setClosePrompt(decision.message);
            return;
        }
        onClose?.({ designerId: document.designerId, saved: true });
    }, [dirty, document.designerId, onClose]);

    const confirmClose = useCallback(() => {
        setClosePrompt("");
        onClose?.({ designerId: document.designerId, saved: false });
    }, [document.designerId, onClose]);

    const notice = designerResultNotice(stage, error, { stale: false });

    /** 首页新建：替换当前唯一的本地草稿（含清空旧导出结果），然后进入编辑器。 */
    const startDocument = useCallback((next: DesignerDocument, selectId?: string) => {
        setHistory(createDesignerHistory(next));
        setSelectedId(selectId);
        setStage("idle");
        setError(undefined);
        setResult(undefined);
        setResultFingerprint(undefined);
        setBaselineFingerprint(designerDocumentFingerprint(next));
        setRestoreNotice("");
        setHomeOpen(false);
    }, []);

    /** 上传商品图：真实入库后建新文档，商品图按原比例居中放进画布（长边占 80%）。 */
    const startFromUpload = useCallback(
        async (file: File) => {
            setUploading(true);
            setUploadNote("");
            try {
                const record = await uploadToolAsset(file, { name: file.name });
                const size = record.width && record.height ? { width: record.width, height: record.height } : await new Promise<{ width: number; height: number }>((resolve) => {
                    const probe = new Image();
                    probe.onload = () => resolve({ width: probe.naturalWidth || 1, height: probe.naturalHeight || 1 });
                    probe.onerror = () => resolve({ width: 1, height: 1 });
                    probe.src = record.url;
                });
                const base = createDesignerDocument();
                const fit = (Math.min(base.width, base.height) * 0.8) / Math.max(size.width, size.height);
                const width = Math.round(size.width * fit);
                const height = Math.round(size.height * fit);
                const layerId = `layer-image-${record.id.slice(0, 6)}`;
                startDocument(
                    { ...base, layers: [{ id: layerId, kind: "image", name: record.name || "商品图", src: record.url, x: Math.round((base.width - width) / 2), y: Math.round((base.height - height) / 2), width, height, rotation: 0, opacity: 1, visible: true, locked: false }] },
                    layerId,
                );
            } catch (uploadError) {
                setUploadNote(uploadError instanceof Error ? `上传失败：${uploadError.message}` : "上传失败：未知原因");
            } finally {
                setUploading(false);
            }
        },
        [startDocument],
    );

    /** 点模板：按模板宽高比建新文档，模板图作为铺满画布的底图图层（原站模板的分层文字无法取得，文字已在图内）。 */
    const startFromTemplate = useCallback(
        (template: DesignerHomeTemplate) => {
            const next = createDesignerDocument({ width: template.width, height: template.height });
            next.layers = [{ ...createBaseImageLayer(template.src, next.width, next.height), name: `模板底图（${template.type}）` }];
            startDocument(next, "layer-base");
        },
        [startDocument],
    );

    return (
        <section aria-label="商品图设计器" className={cn("flex flex-col overflow-hidden text-sm text-foreground", homeOpen ? "h-full min-h-[640px]" : "min-h-[640px] rounded-lg border border-border bg-background")}>
            {homeOpen ? (
                <DesignerHome
                    busy={uploading}
                    note={uploadNote}
                    draft={document.layers.length ? { layers: document.layers.length, width: document.width, height: document.height } : null}
                    onUpload={(file) => void startFromUpload(file)}
                    onTemplate={startFromTemplate}
                    onResume={() => setHomeOpen(false)}
                />
            ) : null}
            <div className={cn("min-h-0 flex-1 flex-col", homeOpen ? "hidden" : "flex")} data-testid="designer-editor">
            {/* 顶部：撤销 / 重做 / 预览 / 完成 */}
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">商品图设计器</span>
                    <span className="truncate text-xs text-muted-foreground">{sourceName} · {document.width}×{document.height}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setHomeOpen(true)} className="flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-muted-foreground hover:bg-accent" data-testid="designer-new-design" title="从模板或商品图新建设计（当前未导出的修改会先保留在草稿中）">
                        <FilePlus2 className="h-4 w-4" />
                        新建设计
                    </button>
                    <button type="button" aria-label="撤销" title="撤销" disabled={!canUndoDesigner(history)} onClick={() => setHistory((current) => undoDesignerDocument(current))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:opacity-40">
                        <Undo2 className="h-4 w-4" />
                    </button>
                    <button type="button" aria-label="重做" title="重做" disabled={!canRedoDesigner(history)} onClick={() => setHistory((current) => redoDesignerDocument(current))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:opacity-40">
                        <Redo2 className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setPreview(!preview)} className="flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-muted-foreground hover:bg-accent">
                        <Play className="h-4 w-4" />
                        预览
                    </button>
                    <button type="button" onClick={requestClose} className="flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-muted-foreground hover:bg-accent">
                        <X className="h-4 w-4" />
                        关闭
                    </button>
                    <button type="button" disabled={!result || busy} onClick={handleDone} className="h-10 rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:opacity-50" title={result ? "回传设计稿给来源工具" : "先导出设计稿"} data-testid="designer-done">
                        完成回传
                    </button>
                </div>
            </header>

            {restoreNotice ? <p className="border-b border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">{restoreNotice}</p> : null}
            {replayNotice ? (
                <p className="border-b border-border bg-card px-3 py-1.5 text-xs text-muted-foreground" data-testid="designer-replay-notice">
                    {replayNotice}
                </p>
            ) : null}
            {closePrompt ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-accent px-3 py-2 text-xs">
                    <span>{closePrompt}</span>
                    <span className="flex gap-2">
                        <button type="button" onClick={confirmClose} className="h-8 rounded-md border border-border bg-card px-3">确认关闭</button>
                        <button type="button" onClick={() => setClosePrompt("")} className="h-8 rounded-md border border-border px-3">继续编辑</button>
                    </span>
                </div>
            ) : null}

            <ToolWorkspaceColumns
                canvas
                configSide="left"
                className="min-h-0 flex-1 gap-3 p-3"
                config={
                    preview ? null : (
                    <aside aria-label="素材与图层" className="flex min-h-0 flex-col gap-2 rounded-lg border border-border bg-card p-3">
                        <div className="flex items-center justify-between">
                            <h2 className="font-medium">素材与图层</h2>
                            <span className="text-xs tabular-nums text-muted-foreground">{document.layers.length} 层</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            <button type="button" onClick={handleAddText} disabled={document.layers.length >= DESIGNER_LAYER_LIMITS.maxLayers} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 text-xs hover:bg-accent disabled:opacity-40">
                                <Type className="h-4 w-4" />
                                添加文字
                            </button>
                            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || document.layers.length >= DESIGNER_LAYER_LIMITS.maxLayers} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 text-xs hover:bg-accent disabled:opacity-40">
                                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                                添加图片
                            </button>
                            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => void handleUploadLayer(event.target.files?.[0])} />
                        </div>
                        {uploadNote ? <p className="text-xs text-destructive">{uploadNote}</p> : null}
                        <ul aria-label="图层列表" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                            {[...document.layers].reverse().map((layer, reverseIndex) => {
                                const index = document.layers.length - 1 - reverseIndex;
                                const active = layer.id === selectedId;
                                return (
                                    <li key={layer.id}>
                                        <div className={cn("flex items-center gap-1 rounded-lg border px-1.5 py-1", active ? "border-primary bg-accent" : "border-transparent hover:bg-accent/60")}>
                                            <button type="button" onClick={() => setSelectedId(layer.id)} className="flex min-h-8 min-w-0 flex-1 items-center gap-1.5 text-left">
                                                <span className="w-5 text-center text-[11px] tabular-nums text-muted-foreground">{index + 1}</span>
                                                <span className="truncate">{layer.name}</span>
                                                <span className="shrink-0 text-[10px] text-muted-foreground">{layer.kind === "image" ? "图片" : "文字"}</span>
                                            </button>
                                            <button type="button" aria-label={layer.visible ? `隐藏 ${layer.name}` : `显示 ${layer.name}`} onClick={() => apply(setDesignerLayerVisibility(document, layer.id, !layer.visible))} className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-background">
                                                {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                                            </button>
                                            <button type="button" aria-label={layer.locked ? `解锁 ${layer.name}` : `锁定 ${layer.name}`} onClick={() => apply(toggleDesignerLayerLock(document, layer.id))} className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-background">
                                                {layer.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                                            </button>
                                            <button type="button" aria-label={`删除 ${layer.name}`} onClick={() => apply(removeDesignerLayer(document, layer.id))} className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-background">
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                        {active ? (
                                            <div className="mt-1 flex items-center gap-1 pl-6">
                                                <button type="button" aria-label="上移一层" onClick={() => apply(reorderDesignerLayers(document, layer.id, "up"))} className="flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground hover:bg-background"><ArrowUp className="h-3 w-3" /></button>
                                                <button type="button" aria-label="下移一层" onClick={() => apply(reorderDesignerLayers(document, layer.id, "down"))} className="flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground hover:bg-background"><ArrowDown className="h-3 w-3" /></button>
                                                <button type="button" aria-label="置顶" onClick={() => apply(reorderDesignerLayers(document, layer.id, "front"))} className="flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground hover:bg-background"><ChevronsUp className="h-3 w-3" /></button>
                                                <button type="button" aria-label="置底" onClick={() => apply(reorderDesignerLayers(document, layer.id, "back"))} className="flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground hover:bg-background"><ChevronsDown className="h-3 w-3" /></button>
                                            </div>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                        <div className="flex items-center gap-1.5">
                            {DESIGNER_CANVAS_PRESETS.map((preset) => (
                                <button key={preset.id} type="button" onClick={() => setCanvasPreset(preset.id)} className={cn("h-8 flex-1 rounded-md border text-[11px]", document.width === preset.width && document.height === preset.height ? "border-selected bg-selected-soft text-selected" : "border-border text-muted-foreground hover:bg-accent")}>
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                    </aside>
                    )
                }
            >
                <div className={cn("flex min-h-0 flex-1", preview ? "items-center justify-center" : "gap-3")}>
                {/* 画布 */}
                <div className="flex min-h-0 flex-1 flex-col gap-2">
                    <div
                        role="application"
                        aria-label="设计画布"
                        tabIndex={0}
                        onKeyDown={handleKeyDown}
                        className="relative mx-auto w-full max-w-[720px] overflow-hidden rounded-lg border border-border bg-card shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        style={{ aspectRatio: `${document.width} / ${document.height}`, background: document.background }}
                    >
                        {document.layers.map((layer) => {
                            const style = {
                                left: `${(layer.x / document.width) * 100}%`,
                                top: `${(layer.y / document.height) * 100}%`,
                                width: `${(layer.width / document.width) * 100}%`,
                                height: `${(layer.height / document.height) * 100}%`,
                                transform: `rotate(${layer.rotation}deg)`,
                                opacity: layer.opacity,
                                display: layer.visible ? "block" : "none",
                            };
                            const content =
                                layer.kind === "image" && layer.src ? (
                                    <img src={layer.src} alt={layer.name} className="h-full w-full object-contain" draggable={false} />
                                ) : (
                                    <span className="flex h-full w-full items-center justify-center break-all text-center leading-tight" style={{ color: layer.color, fontFamily: designerFontFamily(layer.fontFamily).stack, fontSize: `${Math.max(10, (layer.fontSize ?? 64) * (640 / document.width))}px` }}>
                                        {layer.text}
                                    </span>
                                );
                            return (
                                <button
                                    key={layer.id}
                                    type="button"
                                    aria-label={`图层 ${layer.name}`}
                                    onClick={() => setSelectedId(layer.id)}
                                    className={cn("absolute overflow-hidden", selectedId === layer.id ? "outline outline-2 outline-offset-1 outline-primary" : "outline-none hover:outline hover:outline-1 hover:outline-border")}
                                    style={style}
                                >
                                    {content}
                                </button>
                            );
                        })}
                        {!document.layers.length ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                                <Maximize2 className="h-6 w-6" />
                                <span>画布为空：上传商品图或添加文字图层开始设计</span>
                            </div>
                        ) : null}
                    </div>
                    <p className="text-center text-[11px] text-muted-foreground">方向键微调 8px（Shift 32px），[ / ] 旋转 1°，撤销 Ctrl/Cmd+Z 之外请用顶部按钮</p>

                    <div className="rounded-lg border border-border bg-card p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">{notice}</span>
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] text-muted-foreground">{dirty ? "草稿有未保存修改" : "草稿已保存"}</span>
                                <span className="text-[11px] tabular-nums text-muted-foreground" title="本次导出真实合成 1 张 PNG 设计稿">产物 1 张 · {document.width}×{document.height} PNG</span>
                                <button type="button" data-testid="designer-export" onClick={() => void handleExport()} disabled={blocked || busy} className="flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:opacity-50" title={blocked ? issues[0]?.message : "真实合成并入库"}>
                                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                    导出设计稿
                                </button>
                            </div>
                        </div>
                        {error ? <p className="mt-1 text-xs text-destructive">{error.code}：{error.message}</p> : null}
                        {result ? (
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                <span>已导出设计稿（{result.bytes ? `${Math.round(result.bytes / 1024)} KB` : "PNG"}）</span>
                                <button type="button" data-testid="designer-download" onClick={() => void handleDownload()} className="rounded border border-border px-2 py-0.5 text-[11px] hover:bg-accent">
                                    下载 PNG
                                </button>
                                <button type="button" data-testid="designer-send-canvas" onClick={() => void handleSendCanvas()} className="rounded border border-border px-2 py-0.5 text-[11px] hover:bg-accent">
                                    发送画布
                                </button>
                                {actionNotice ? <span>{actionNotice}</span> : null}
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* 右：属性 */}
                {preview ? null : (
                    <aside aria-label="属性面板" className="flex min-h-0 flex-col gap-2 rounded-lg border border-border bg-card p-3">
                        <h2 className="font-medium">属性</h2>
                        {selected ? (
                            <div className="flex flex-col gap-2 text-xs">
                                <label className="flex flex-col gap-1">
                                    图层名称
                                    <input value={selected.name} onChange={(event) => apply(renameDesignerLayer(document, selected.id, event.target.value))} className="h-9 rounded-md border border-border bg-background px-2" />
                                </label>
                                {selected.kind === "text" ? (
                                    <>
                                        <label className="flex flex-col gap-1">
                                            文案
                                            <textarea value={selected.text ?? ""} maxLength={DESIGNER_TEXT_LIMIT} onChange={(event) => apply(updateDesignerLayer(document, selected.id, { text: event.target.value }))} className="min-h-20 rounded-md border border-border bg-background px-2 py-1" />
                                        </label>
                                        <div className="flex gap-2">
                                            <label className="flex flex-1 flex-col gap-1">
                                                字号
                                                <input type="number" min={8} max={400} value={selected.fontSize ?? 64} onChange={(event) => apply(updateDesignerLayer(document, selected.id, { fontSize: Number(event.target.value) || 8 }))} className="h-9 rounded-md border border-border bg-background px-2 tabular-nums" />
                                            </label>
                                            <div className="flex flex-col gap-1">
                                                字体
                                                <div className="flex flex-wrap gap-1" role="group" aria-label="字体族">
                                                    {DESIGNER_FONT_FAMILIES.map((family) => (
                                                        <button
                                                            key={family.id}
                                                            type="button"
                                                            data-testid={`designer-font-${family.id}`}
                                                            aria-pressed={designerFontFamily(selected.fontFamily).id === family.id}
                                                            onClick={() => apply(updateDesignerLayer(document, selected.id, { fontFamily: family.id }))}
                                                            className={`h-8 rounded-md border px-2 ${designerFontFamily(selected.fontFamily).id === family.id ? "border-selected bg-selected-soft text-selected" : "border-border bg-background text-muted-foreground"}`}
                                                            style={{ fontFamily: family.stack }}
                                                        >
                                                            {family.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <label className="flex flex-col gap-1">
                                                颜色
                                                <input type="color" value={selected.color ?? "#ffffff"} onChange={(event) => apply(updateDesignerLayer(document, selected.id, { color: event.target.value }))} className="h-9 w-14 rounded-md border border-border bg-background" />
                                            </label>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">字体只提供系统可渲染字族；未接入远端字体库，不伪造字体列表。</p>
                                    </>
                                ) : null}
                                <div className="grid grid-cols-2 gap-2">
                                    {(["x", "y", "width", "height"] as const).map((key) => (
                                        <label key={key} className="flex flex-col gap-1">
                                            {{ x: "X", y: "Y", width: "宽", height: "高" }[key]}
                                            <input
                                                type="number"
                                                value={Math.round(selected[key])}
                                                onChange={(event) => {
                                                    const value = Number(event.target.value);
                                                    if (!Number.isFinite(value)) return;
                                                    apply(key === "width" || key === "height" ? resizeDesignerLayer(document, selected.id, key === "width" ? value : selected.width, key === "height" ? value : selected.height) : moveDesignerLayer(document, selected.id, key === "x" ? value - selected.x : 0, key === "y" ? value - selected.y : 0));
                                                }}
                                                className="h-9 rounded-md border border-border bg-background px-2 tabular-nums"
                                            />
                                        </label>
                                    ))}
                                </div>
                                <label className="flex flex-col gap-1">
                                    旋转 {Math.round(selected.rotation)}°
                                    <input type="range" min={DESIGNER_LAYER_LIMITS.rotationMin} max={DESIGNER_LAYER_LIMITS.rotationMax} value={selected.rotation} onChange={(event) => apply(rotateDesignerLayer(document, selected.id, Number(event.target.value)))} className="accent-primary" />
                                </label>
                                <label className="flex flex-col gap-1">
                                    不透明度 {Math.round(selected.opacity * 100)}%
                                    <input type="range" min={Math.round(DESIGNER_LAYER_LIMITS.opacityMin * 100)} max={100} value={Math.round(selected.opacity * 100)} onChange={(event) => apply(updateDesignerLayer(document, selected.id, { opacity: Number(event.target.value) / 100 }))} className="accent-primary" />
                                </label>
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground">未选中图层：在左侧列表或画布上点选。</p>
                        )}
                        <div className="mt-auto flex flex-col gap-1 border-t border-border pt-2 text-xs">
                            <label className="flex items-center justify-between gap-2">
                                画布背景
                                <input
                                    type="color"
                                    value={document.background}
                                    onChange={(event) => apply(setDesignerCanvasBackground(document, event.target.value))}
                                    className="h-9 w-14 rounded-md border border-border bg-background"
                                    data-testid="designer-background"
                                    aria-label="画布背景色"
                                />
                            </label>
                            <span className="text-[11px] text-muted-foreground">{document.background} · 导出合成与预览使用同一底色（对应 LinkFox 设计器「背景」面板）。</span>
                        </div>
                        {issues.length ? (
                            <ul className="mt-auto flex flex-col gap-1 border-t border-border pt-2 text-[11px] text-destructive">
                                {issues.slice(0, 4).map((issue) => (
                                    <li key={`${issue.code}-${issue.layerId ?? "doc"}`}>{issue.message}</li>
                                ))}
                            </ul>
                        ) : null}
                    </aside>
                )}
                </div>
            </ToolWorkspaceColumns>
            </div>
        </section>
    );
}

export default DesignerWorkspace;
