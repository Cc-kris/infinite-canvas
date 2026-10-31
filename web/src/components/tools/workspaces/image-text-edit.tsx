/**
 * TASK-036：IMAGE_TEXT_EDIT（图片文字编辑）工作区。
 *
 * 区域（page-specs/29）：图片文字画布｜文本框列表｜属性编辑｜导出。
 * 硬约束：
 * - 画布选中 ↔ 右侧条目 ↔ 属性面板 三处始终指向同一个 boxId；
 * - 文本框只能来自真实框选/新增或（未来）真实识别结果，不生成示例文案；
 * - 导出前必须跑溢出 + 缺字检查，并把阻断项点名；
 * - 原图永不被覆盖：提交把源图作为参考图，结果落到新的结果区；
 * - 换源图 / 改框后旧结果显式标记“来自旧版本”。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Copy, ImagePlus, Loader2, Plus, Redo2, Trash2, Undo2 } from "lucide-react";

import { ToolResult } from "@/components/tools/tool-result";
import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import { cn } from "@/lib/utils";
import { DEFAULT_IMAGE_CONSTRAINTS, uploadToolAsset } from "@/services/api/tools/assets";
import {
    IMAGE_TEXT_EDIT_FONTS,
    IMAGE_TEXT_EDIT_FONT_SIZE,
    IMAGE_TEXT_EDIT_FORMATS,
    IMAGE_TEXT_EDIT_MAX_BOXES,
    IMAGE_TEXT_EDIT_NOTICE,
    IMAGE_TEXT_EDIT_TEXT_LIMIT,
    IMAGE_TEXT_EDIT_TOOL_ID,
    addImageTextBox,
    canRedoImageTextBoxHistory,
    canUndoImageTextBoxHistory,
    commitImageTextBoxHistory,
    createImageTextBoxHistory,
    createImageTextEditSnapshot,
    createImageTextEditValues,
    duplicateImageTextBox,
    imageTextEditBoxLabel,
    imageTextEditFontLabel,
    imageTextEditFontStack,
    imageTextEditFormatFromMime,
    imageTextEditFormatFromName,
    imageTextEditPreviewNotice,
    isBlockingImageTextEditIssue,
    measureImageTextBox,
    moveImageTextBox,
    readImageTextEditValues,
    redoImageTextBoxHistory,
    removeImageTextBox,
    undoImageTextBoxHistory,
    updateImageTextBox,
    validateImageTextEditState,
    type ImageTextBox,
    type ImageTextBoxHistory,
    type ImageTextEditFormat,
    type ImageTextEditSnapshot,
    type ImageTextEditValues,
} from "@/features/tools/registry/image-text-edit";
import {
    ImageTextEditAdapterError,
    imageTextEditResultFromTask,
    imageTextEditResultNotice,
    imageTextEditResultUrl,
    imageTextEditStaleNotice,
    retryImageTextEdit,
    runImageTextEdit,
    toImageTextEditReference,
    type ImageTextEditGatewayLike,
} from "@/features/tools/adapters/image-text-edit";
import { resolveModelChannel, selectableModelsByCapability, useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { reattachDroppedResultUrl, useToolTaskStore } from "@/stores/use-tool-task-store";

const toolId = IMAGE_TEXT_EDIT_TOOL_ID;
const cardClass = "rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4";
const fieldClass = "w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--primary)]";
const smallButton = "inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-xs text-[var(--foreground)] hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40";

export function ImageTextEditWorkspace() {
    const config = useConfigStore((state) => state.config);
    const imageModels = useMemo(() => selectableModelsByCapability(config, "image"), [config]);
    const model = config.imageModel || imageModels[0] || "";
    const modelReady = Boolean(model && resolveModelChannel(config, model));

    const [values, setValues] = useState<ImageTextEditValues>(() => createImageTextEditValues());
    const [history, setHistory] = useState<ImageTextBoxHistory>(() => createImageTextBoxHistory([]));
    const [selectedId, setSelectedId] = useState<string>("");
    const [snapshot, setSnapshot] = useState<ImageTextEditSnapshot | undefined>();
    const [draftRestored, setDraftRestored] = useState(false);
    const snapshotRestoredRef = useRef(false);
    const [running, setRunning] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [errorText, setErrorText] = useState("");
    const [uploadNote, setUploadNote] = useState("");
    const [canvasWidth, setCanvasWidth] = useState(0);
    const [draftRect, setDraftRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

    const abortRef = useRef<AbortController | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const canvasRef = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef<{ id: string; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
    const createRef = useRef<{ startX: number; startY: number } | null>(null);
    const valuesRef = useRef(values);
    valuesRef.current = values;

    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const flushDraft = useToolDraftStore((state) => state.flush);
    const draftRevision = useToolDraftStore((state) => state.drafts[toolId]?.revision ?? null);
    const tasks = useToolTaskStore((state) => state.tasks);
    const hydrateTasks = useToolTaskStore((state) => state.hydrate);
    const runTool = useToolTaskStore((state) => state.runTool);
    const retryTask = useToolTaskStore((state) => state.retryTask);

    useEffect(() => {
        let alive = true;
        void (async () => {
            const draft = await hydrateDraft(toolId);
            if (!alive) return;
            if (draft) {
                const restored = readImageTextEditValues(draft.values);
                setValues(restored);
                setHistory(createImageTextBoxHistory(restored.boxes));
                setSelectedId(restored.boxes[0]?.id ?? "");
            }
            setDraftRestored(true);
        })();
        return () => {
            alive = false;
        };
    }, [hydrateDraft]);

    /** 刷新后自然回填：由落盘任务还原快照（不伪造字节，结果仍只认任务 result.items）。
     *  必须等草稿恢复完成，否则会用默认值算出与任务不一致的快照指纹。 */
    useEffect(() => {
        if (!draftRestored || snapshotRestoredRef.current) return;
        const newest = Object.values(tasks)
            .filter((task) => task.toolId === toolId)
            .sort((a, b) => b.createdAt - a.createdAt)[0];
        if (!newest) return;
        if (newest.status === "draft" || newest.status === "validating" || newest.status === "submitting") return;
        snapshotRestoredRef.current = true;
        if (snapshot) return;
        setSnapshot(createImageTextEditSnapshot(valuesRef.current, newest.draftRevision ?? draftRevision, newest.clientOperationId ?? ""));
    }, [draftRestored, draftRevision, snapshot, tasks, toolId]);

    // 草稿落盘：values 每次都写（含框），刷新后能续上同一批文字框。
    useEffect(() => {
        patchDraft(toolId, { values: values as unknown as Record<string, unknown> });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [values]);

    useEffect(() => () => abortRef.current?.abort(), []);

    /** 画布宽度：字号、拖拽、框选都要用真实像素换算，不靠猜。 */
    useEffect(() => {
        const element = canvasRef.current;
        if (!element) return;
        const observer = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width ?? 0;
            setCanvasWidth(width);
        });
        observer.observe(element);
        setCanvasWidth(element.clientWidth);
        return () => observer.disconnect();
    }, [values.imageUrl]);

    const update = useCallback((updater: (previous: ImageTextEditValues) => ImageTextEditValues) => {
        setValues((previous) => updater(previous));
    }, []);

    /** 结构性变更（增删/复制/排序）走历史栈，删除永远可撤销。 */
    const commitBoxes = useCallback(
        (next: ImageTextBox[]) => {
            setHistory((previous) => {
                const committed = commitImageTextBoxHistory(previous, next);
                if (committed !== previous) update((current) => ({ ...current, boxes: committed.present }));
                return committed;
            });
        },
        [update],
    );

    /** 拖拽中的高频更新不写历史，松手时一次性提交。 */
    const liveBoxes = useCallback(
        (next: ImageTextBox[]) => {
            update((current) => ({ ...current, boxes: next }));
        },
        [update],
    );

    const undo = useCallback(() => {
        setHistory((previous) => {
            const next = undoImageTextBoxHistory(previous);
            if (next === previous) return previous;
            update((current) => ({ ...current, boxes: next.present }));
            return next;
        });
    }, [update]);

    const redo = useCallback(() => {
        setHistory((previous) => {
            const next = redoImageTextBoxHistory(previous);
            if (next === previous) return previous;
            update((current) => ({ ...current, boxes: next.present }));
            return next;
        });
    }, [update]);

    const selected = useMemo(() => values.boxes.find((box) => box.id === selectedId) ?? null, [selectedId, values.boxes]);
    const issues = useMemo(() => validateImageTextEditState({ values, modelReady }), [values, modelReady]);
    const blocking = useMemo(() => issues.filter(isBlockingImageTextEditIssue), [issues]);
    const currentSnapshot = useMemo(() => createImageTextEditSnapshot(values, draftRevision, ""), [values, draftRevision]);
    /** 刷新后先 hydrate 任务库，再从 IndexedDB 按 storageKey 还原真实结果字节。 */
    useEffect(() => {
        hydrateTasks();
    }, [hydrateTasks]);
    /** 结果面板取最近一条「带结果图」的任务（字节可能在 storageKey 里），没有则退回最近任务。 */
    const latest = useMemo(() => {
        const owned = Object.values(tasks)
            .filter((task) => task.toolId === toolId)
            .sort((a, b) => b.createdAt - a.createdAt);
        return owned.find((task) => (task.result?.items ?? []).some((item) => item.kind === "image")) ?? owned[0];
    }, [tasks, toolId]);
    /**
     * 刷新后补回真实来源：草稿里的 `resultImageUrl` 是上次成功时 app 自己回写的真实上游产物地址
     * （换源图会清空），它是这条任务字节的合法 provenance。旧版快照把结果剥成 payloadDropped 后，
     * 这里把地址挂回结果项，再由 store 既有链路抓同一上游产物入库拿 storageKey（不补造字节、不重提交）。
     */
    useEffect(() => {
        if (!draftRestored || !latest || latest.status !== "succeeded") return;
        const url = values.resultImageUrl.trim();
        if (!url) return;
        reattachDroppedResultUrl(latest.id, url);
    }, [draftRestored, latest, values.resultImageUrl]);
    const gateway = useMemo<ImageTextEditGatewayLike>(
        () => ({
            submit: (input, options) => runTool(input, { ...options, draftRevision }),
            waitForResult: async (taskIdToWait) => {
                const task = useToolTaskStore.getState().tasks[taskIdToWait];
                if (!task) throw new ImageTextEditAdapterError("task-missing", "任务记录不存在，无法等待结果。");
                return task;
            },
            retry: (taskIdToRetry, input, options) => retryTask(taskIdToRetry, input, options),
        }),
        [draftRevision, retryTask, runTool],
    );

    /* ------------------------------ 源图 ------------------------------ */

    const applyAsset = useCallback(async (file: File) => {
        setUploadNote("");
        setErrorText("");
        setUploading(true);
        try {
            const record = await uploadToolAsset(file, { name: file.name, constraints: DEFAULT_IMAGE_CONSTRAINTS });
            const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
                if (record.width && record.height) {
                    resolve({ width: record.width, height: record.height });
                    return;
                }
                const probe = new Image();
                probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
                probe.onerror = () => resolve({ width: 0, height: 0 });
                probe.src = record.url;
            });
            const format = imageTextEditFormatFromMime(record.mimeType) || imageTextEditFormatFromName(record.name) || "png";
            // 换源图 = 新一次编辑：旧快照作废，文字框清空（旧坐标对新图无意义）。
            setValues((previous) => ({
                ...previous,
                boxes: [],
                imageFormat: format,
                imageHeight: dimensions.height,
                imageName: record.name,
                imageSize: record.bytes,
                imageUrl: record.url,
                imageWidth: dimensions.width,
                resultImageUrl: "",
            }));
            setHistory(createImageTextBoxHistory([]));
            setSelectedId("");
            setSnapshot(undefined);
            setUploadNote(`已上传 ${record.name}（${dimensions.width}×${dimensions.height}，${Math.round(record.bytes / 1024)}KB）。原图不会被覆盖。`);
        } catch (error) {
            setUploadNote(error instanceof Error ? `上传失败：${error.message}` : "上传失败：未知原因");
        } finally {
            setUploading(false);
        }
    }, []);

    /* ------------------------------ 画布交互 ------------------------------ */

    const toUnit = useCallback((clientX: number, clientY: number) => {
        const host = canvasRef.current;
        if (!host) return { x: 0, y: 0 };
        const rect = host.getBoundingClientRect();
        return {
            x: Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(rect.width, 1))),
            y: Math.min(1, Math.max(0, (clientY - rect.top) / Math.max(rect.height, 1))),
        };
    }, []);

    const startBoxDrag = useCallback((event: PointerEvent<HTMLDivElement>, box: ImageTextBox) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setSelectedId(box.id);
        dragRef.current = { id: box.id, startX: event.clientX, startY: event.clientY, originX: box.x, originY: box.y, moved: false };
    }, []);

    const onCanvasPointerMove = useCallback(
        (event: PointerEvent<HTMLDivElement>) => {
            const drag = dragRef.current;
            if (drag) {
                const host = canvasRef.current;
                if (!host) return;
                const rect = host.getBoundingClientRect();
                const dx = (event.clientX - drag.startX) / Math.max(rect.width, 1);
                const dy = (event.clientY - drag.startY) / Math.max(rect.height, 1);
                if (Math.abs(dx) > 0.0005 || Math.abs(dy) > 0.0005) drag.moved = true;
                const next = valuesRef.current.boxes.map((box) => (box.id === drag.id ? moveImageTextBox([box], box.id, dx, dy)[0] : box));
                liveBoxes(next);
                return;
            }
            const creating = createRef.current;
            if (!creating) return;
            const start = toUnit(creating.startX, creating.startY);
            const now = toUnit(event.clientX, event.clientY);
            setDraftRect({ x: Math.min(start.x, now.x), y: Math.min(start.y, now.y), width: Math.abs(now.x - start.x), height: Math.abs(now.y - start.y) });
        },
        [liveBoxes, toUnit],
    );

    const endCanvasPointer = useCallback(() => {
        const drag = dragRef.current;
        if (drag) {
            dragRef.current = null;
            if (drag.moved) commitBoxes(valuesRef.current.boxes);
            return;
        }
        const rect = draftRect;
        createRef.current = null;
        setDraftRect(null);
        if (!rect || rect.width < 0.03 || rect.height < 0.03) return;
        // 框选创建：只在用户真的拖出可见区域时才建框，坐标与尺寸就用拖出来的范围。
        const base = valuesRef.current.boxes.length ? valuesRef.current.boxes[0] : null;
        commitBoxes(
            addImageTextBox(valuesRef.current.boxes, {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                fontSize: Math.max(IMAGE_TEXT_EDIT_FONT_SIZE.min, Math.round(rect.height * values.imageHeight * 0.5)),
                fontId: base?.fontId ?? IMAGE_TEXT_EDIT_FONTS[0].id,
            }),
        );
        const added = valuesRef.current.boxes;
        setSelectedId(added[added.length - 1]?.id ?? "");
    }, [commitBoxes, draftRect, values.imageHeight]);

    const onCanvasKeyDown = useCallback(
        (event: KeyboardEvent<HTMLDivElement>) => {
            const step = event.shiftKey ? 0.02 : 0.005;
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
                event.preventDefault();
                if (event.shiftKey) redo();
                else undo();
                return;
            }
            if (!selected) return;
            if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                commitBoxes(removeImageTextBox(valuesRef.current.boxes, selected.id));
                setSelectedId("");
                return;
            }
            if (event.key === "Escape") {
                setSelectedId("");
                return;
            }
            const delta: Record<string, [number, number]> = {
                ArrowLeft: [-step, 0],
                ArrowRight: [step, 0],
                ArrowUp: [0, -step],
                ArrowDown: [0, step],
            };
            const move = delta[event.key];
            if (!move) return;
            event.preventDefault();
            commitBoxes(moveImageTextBox(valuesRef.current.boxes, selected.id, move[0], move[1]));
        },
        [commitBoxes, redo, selected, undo],
    );

    const patchSelected = useCallback(
        (patch: Partial<ImageTextBox>) => {
            if (!selected) return;
            commitBoxes(updateImageTextBox(valuesRef.current.boxes, selected.id, patch));
        },
        [commitBoxes, selected],
    );

    /* ------------------------------ 提交 ------------------------------ */

    const handleSubmit = useCallback(async () => {
        if (blocking.length) {
            setErrorText(blocking[0].message);
            return;
        }
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setRunning(true);
        setErrorText("");
        try {
            const run = await runImageTextEdit({ gateway, values, model, revision: draftRevision, modelReady, signal: controller.signal });
            setSnapshot(run.snapshot);
            if (run.task.status === "failed") setErrorText(run.task.error?.message ?? "生成失败，上游未返回原因。");
        } catch (error) {
            setErrorText(error instanceof Error ? error.message : "提交失败，请重试。");
        } finally {
            setRunning(false);
        }
    }, [blocking, draftRevision, gateway, model, modelReady, values]);

    const handleRetry = useCallback(async () => {
        if (!latest || blocking.length) return;
        const controller = new AbortController();
        abortRef.current = controller;
        setRunning(true);
        setErrorText("");
        try {
            const run = await retryImageTextEdit({ gateway, values, model, revision: draftRevision, modelReady, taskId: latest.id, signal: controller.signal });
            setSnapshot(run.snapshot);
        } catch (error) {
            setErrorText(error instanceof Error ? error.message : "重试失败。");
        } finally {
            setRunning(false);
        }
    }, [blocking.length, draftRevision, gateway, latest, model, modelReady, values]);

    // 结果一律走适配器统一出口：漂移维度、空结果、未知状态都由它判定。
    const result = useMemo(() => (snapshot ? imageTextEditResultFromTask(latest ?? null, snapshot, currentSnapshot) : undefined), [currentSnapshot, latest, snapshot]);

    // 成功后把真实结果地址回写到 resultImageUrl（下一次提交带上去继续改），不预填假地址。
    useEffect(() => {
        const url = imageTextEditResultUrl(result?.images[0]);
        if (!url || !result || result.stale) return;
        if (valuesRef.current.resultImageUrl === url) return;
        update((current) => ({ ...current, resultImageUrl: url }));
    }, [result, update]);

    useEffect(() => {
        void flushDraft(toolId);
    }, [values, flushDraft]);

    const resultNotice = result ? imageTextEditResultNotice(result) : "尚无结果：上传图片、框选文字框并填写文字后点击“生成图片文字”。";
    const scale = values.imageWidth > 0 && canvasWidth > 0 ? canvasWidth / values.imageWidth : 1;
    const staleNotice = snapshot ? imageTextEditStaleNotice(values, snapshot, currentSnapshot) : "";

    return (
        <div className="flex flex-col gap-4" data-testid="image-text-edit-workspace">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h1 className="text-lg font-semibold text-[var(--foreground)]">图片文字编辑</h1>
                    <p className="text-xs text-[var(--muted-foreground)]">{imageTextEditPreviewNotice(values)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className={smallButton} onClick={undo} disabled={!canUndoImageTextBoxHistory(history)}>
                        <Undo2 className="h-4 w-4" /> 撤销
                    </button>
                    <button type="button" className={smallButton} onClick={redo} disabled={!canRedoImageTextBoxHistory(history)}>
                        <Redo2 className="h-4 w-4" /> 重做
                    </button>
                </div>
            </div>

            <ToolWorkspaceColumns
                configSide="right"
                config={(
                    <>
                    {/* 属性编辑 */}
                    <section className={cardClass} aria-label="属性编辑">
                        <h2 className="mb-3 text-sm font-medium">属性编辑</h2>
                        {selected ? (
                            <div className="flex flex-col gap-3">
                                <label className="text-xs text-[var(--muted-foreground)]">
                                    文字内容（{selected.text.length}/{IMAGE_TEXT_EDIT_TEXT_LIMIT}）
                                    <textarea
                                        className={cn(fieldClass, "mt-1 min-h-20 resize-y")}
                                        value={selected.text}
                                        maxLength={IMAGE_TEXT_EDIT_TEXT_LIMIT}
                                        placeholder="输入要在该文字框内显示的文字"
                                        onChange={(event) => patchSelected({ text: event.target.value })}
                                    />
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="text-xs text-[var(--muted-foreground)]">
                                        字体
                                        <select className={cn(fieldClass, "mt-1")} value={selected.fontId} onChange={(event) => patchSelected({ fontId: event.target.value })}>
                                            {IMAGE_TEXT_EDIT_FONTS.map((font) => (
                                                <option key={font.id} value={font.id}>
                                                    {font.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="text-xs text-[var(--muted-foreground)]">
                                        字号（源图像素）
                                        <input
                                            type="number"
                                            className={cn(fieldClass, "mt-1")}
                                            min={IMAGE_TEXT_EDIT_FONT_SIZE.min}
                                            max={IMAGE_TEXT_EDIT_FONT_SIZE.max}
                                            value={selected.fontSize}
                                            onChange={(event) => patchSelected({ fontSize: Number(event.target.value) })}
                                        />
                                    </label>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="text-xs text-[var(--muted-foreground)]">
                                        字重
                                        <div className="mt-1 flex gap-1">
                                            {[400, 700].map((weight) => (
                                                <button
                                                    key={weight}
                                                    type="button"
                                                    className={cn(smallButton, "flex-1", selected.fontWeight === weight && "border-[var(--primary)] bg-[var(--primary)]/10")}
                                                    onClick={() => patchSelected({ fontWeight: weight as 400 | 700 })}
                                                >
                                                    {weight === 700 ? "加粗" : "常规"}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="text-xs text-[var(--muted-foreground)]">
                                        对齐
                                        <div className="mt-1 flex gap-1">
                                            {(["left", "center", "right"] as const).map((align) => (
                                                <button key={align} type="button" className={cn(smallButton, "flex-1", selected.align === align && "border-[var(--primary)] bg-[var(--primary)]/10")} onClick={() => patchSelected({ align })}>
                                                    {align === "left" ? "左" : align === "center" ? "中" : "右"}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="text-xs text-[var(--muted-foreground)]">
                                        颜色
                                        <input type="color" className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)]" value={selected.color} onChange={(event) => patchSelected({ color: event.target.value })} />
                                    </label>
                                    <div className="text-xs text-[var(--muted-foreground)]">
                                        缩放（宽/高 %）
                                        <div className="mt-1 flex gap-1">
                                            <input type="number" className={fieldClass} step={1} min={3} max={100} value={Math.round(selected.width * 100)} onChange={(event) => patchSelected({ width: Number(event.target.value) / 100 })} />
                                            <input type="number" className={fieldClass} step={1} min={3} max={100} value={Math.round(selected.height * 100)} onChange={(event) => patchSelected({ height: Number(event.target.value) / 100 })} />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" className={smallButton} onClick={() => commitBoxes(duplicateImageTextBox(values.boxes, selected.id))}>
                                        <Copy className="h-4 w-4" /> 复制
                                    </button>
                                    <button
                                        type="button"
                                        className={cn(smallButton, "text-destructive")}
                                        onClick={() => {
                                            commitBoxes(removeImageTextBox(values.boxes, selected.id));
                                            setSelectedId("");
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4" /> 删除
                                    </button>
                                </div>
                                <p className="text-[11px] text-[var(--muted-foreground)]">预览字族：{imageTextEditFontLabel(selected.fontId)}；上游若替换字族不会回写本地配置。</p>
                            </div>
                        ) : (
                            <p className="text-xs text-[var(--muted-foreground)]">在画布或列表里选中一个文字框后编辑属性。</p>
                        )}
                    </section>

                    {/* 文本框列表 */}
                    <section className={cardClass} aria-label="文本框列表">
                        <header className="mb-2 flex items-center justify-between">
                            <h2 className="text-sm font-medium">文本框列表</h2>
                            <span className="text-[11px] text-[var(--muted-foreground)]">
                                {values.boxes.length}/{IMAGE_TEXT_EDIT_MAX_BOXES}
                            </span>
                        </header>
                        {values.boxes.length ? (
                            <ol className="flex flex-col gap-1">
                                {values.boxes.map((box, index) => {
                                    const layout = measureImageTextBox(box, values.imageWidth, values.imageHeight);
                                    return (
                                        <li key={box.id} className={cn("flex items-center gap-1 rounded-lg border px-2 py-1", selectedId === box.id ? "border-[var(--primary)] bg-[var(--primary)]/10" : "border-[var(--border)]")}>
                                            <button type="button" className="min-h-10 flex-1 truncate text-left text-xs" onClick={() => setSelectedId(box.id)}>
                                                {imageTextEditBoxLabel(box, index)}
                                            </button>
                                            {layout.overflowX || layout.overflowY ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="预计溢出" /> : null}
                                            {layout.missingGlyphs.length ? <span className="shrink-0 text-[10px] text-destructive">缺字</span> : null}
                                            <button
                                                type="button"
                                                className="min-h-10 min-w-8 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                                aria-label={`上移 ${index + 1}`}
                                                disabled={index === 0}
                                                onClick={() => {
                                                    const next = [...values.boxes];
                                                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                                    commitBoxes(next);
                                                }}
                                            >
                                                <ArrowUp className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                className="min-h-10 min-w-8 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                                aria-label={`下移 ${index + 1}`}
                                                disabled={index === values.boxes.length - 1}
                                                onClick={() => {
                                                    const next = [...values.boxes];
                                                    [next[index + 1], next[index]] = [next[index], next[index + 1]];
                                                    commitBoxes(next);
                                                }}
                                            >
                                                <ArrowDown className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                className="min-h-10 min-w-8 text-destructive"
                                                aria-label={`删除 ${index + 1}`}
                                                onClick={() => {
                                                    commitBoxes(removeImageTextBox(values.boxes, box.id));
                                                    if (selectedId === box.id) setSelectedId("");
                                                }}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ol>
                        ) : (
                            <p className="text-xs text-[var(--muted-foreground)]">还没有文字框。</p>
                        )}
                    </section>

                    {/* 导出 */}
                    <section className={cardClass} aria-label="导出">
                        <h2 className="mb-2 text-sm font-medium">导出</h2>
                        <div className="flex flex-wrap gap-1">
                            {IMAGE_TEXT_EDIT_FORMATS.map((format) => (
                                <button
                                    key={format.id}
                                    type="button"
                                    className={cn(smallButton, values.imageFormat === format.id && "border-[var(--primary)] bg-[var(--primary)]/10")}
                                    onClick={() => update((current) => ({ ...current, imageFormat: format.id as ImageTextEditFormat }))}
                                >
                                    {format.label}
                                </button>
                            ))}
                        </div>
                        <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">导出的是新结果文件；原图保持不动，可随时改框重出。</p>

                        {issues.length ? (
                            <ul className="mt-3 flex flex-col gap-1">
                                {issues.map((issue) => (
                                    <li key={`${issue.code}-${issue.boxId ?? ""}`} className={cn("flex items-start gap-1.5 text-[11px]", isBlockingImageTextEditIssue(issue) ? "text-destructive" : "text-destructive")}>
                                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        <span>{issue.message}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : null}

                        <div className="mt-3 flex flex-col gap-2">
                            <button
                                type="button"
                                data-testid="image-text-edit-submit"
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-3 text-sm font-medium text-[var(--primary-foreground)] disabled:cursor-not-allowed disabled:opacity-40"
                                disabled={blocking.length > 0 || running}
                                onClick={() => void handleSubmit()}
                            >
                                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                生成图片文字
                            </button>
                            <p className="text-[11px] text-[var(--muted-foreground)]">{IMAGE_TEXT_EDIT_NOTICE}</p>
                            {errorText ? <p className="text-xs text-destructive">{errorText}</p> : null}
                        </div>
                    </section>
                    </>
                )}
            >
                {/* 图片文字画布 */}
                <section className={cardClass} aria-label="图片文字画布">
                    <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-sm font-medium">图片文字画布</h2>
                        <div className="flex flex-wrap items-center gap-2">
                            <button type="button" className={smallButton} onClick={() => fileRef.current?.click()} disabled={uploading}>
                                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                                {values.imageUrl ? "更换源图" : "上传源图"}
                            </button>
                            <button
                                type="button"
                                className={smallButton}
                                onClick={() => {
                                    const next = addImageTextBox(values.boxes);
                                    if (next === values.boxes) return;
                                    commitBoxes(next);
                                    setSelectedId(next[next.length - 1]?.id ?? "");
                                }}
                                disabled={!values.imageUrl || values.boxes.length >= IMAGE_TEXT_EDIT_MAX_BOXES}
                            >
                                <Plus className="h-4 w-4" /> 新增文字框
                            </button>
                        </div>
                    </header>
                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        data-testid="image-text-edit-file"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) void applyAsset(file);
                        }}
                    />

                    {values.imageUrl ? (
                        <div
                            ref={canvasRef}
                            role="group"
                            aria-label="文字框画布"
                            tabIndex={0}
                            className="relative w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                            style={{ aspectRatio: `${values.imageWidth || 1} / ${values.imageHeight || 1}` }}
                            onPointerDown={(event) => {
                                createRef.current = { startX: event.clientX, startY: event.clientY };
                                setSelectedId("");
                            }}
                            onPointerMove={onCanvasPointerMove}
                            onPointerUp={endCanvasPointer}
                            onPointerCancel={endCanvasPointer}
                            onKeyDown={onCanvasKeyDown}
                        >
                            {/* 源图只作为底图显示，导出走新结果，永不覆盖原图 */}
                            <img src={values.imageUrl} alt={values.imageName || "源图"} className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain" draggable={false} />
                            {values.boxes.map((box, index) => {
                                const layout = measureImageTextBox(box, values.imageWidth, values.imageHeight);
                                const overflow = layout.overflowX || layout.overflowY;
                                const missing = layout.missingGlyphs.length > 0;
                                return (
                                    <div
                                        key={box.id}
                                        role="button"
                                        tabIndex={0}
                                        aria-label={imageTextEditBoxLabel(box, index)}
                                        data-testid={`image-text-edit-box-${box.id}`}
                                        onPointerDown={(event) => startBoxDrag(event, box)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === " ") {
                                                event.preventDefault();
                                                setSelectedId(box.id);
                                            }
                                        }}
                                        className={cn(
                                            "absolute cursor-move rounded-[3px] border-2 text-left",
                                            selectedId === box.id ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/40" : "border-white/70",
                                            overflow ? "bg-accent" : missing ? "bg-destructive/10" : "bg-primary/10",
                                        )}
                                        style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }}
                                    >
                                        <span
                                            className="pointer-events-none block h-full w-full overflow-hidden whitespace-pre-wrap"
                                            style={{
                                                color: box.color,
                                                fontFamily: imageTextEditFontStack(box.fontId),
                                                fontSize: `${Math.max(6, box.fontSize * scale)}px`,
                                                fontWeight: box.fontWeight,
                                                lineHeight: 1.25,
                                                textAlign: box.align,
                                            }}
                                        >
                                            {box.text || "（空文本）"}
                                        </span>
                                    </div>
                                );
                            })}
                            {draftRect ? (
                                <div
                                    aria-hidden="true"
                                    className="pointer-events-none absolute border-2 border-dashed border-[var(--primary)] bg-[var(--primary)]/10"
                                    style={{ left: `${draftRect.x * 100}%`, top: `${draftRect.y * 100}%`, width: `${draftRect.width * 100}%`, height: `${draftRect.height * 100}%` }}
                                />
                            ) : null}
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="flex min-h-52 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--background)] text-sm text-[var(--muted-foreground)] hover:border-[var(--primary)]"
                        >
                            <ImagePlus className="h-6 w-6" />
                            上传 JPG / PNG / WebP 源图后开始框选文字
                        </button>
                    )}

                    <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">在画布空白处拖拽可框选新文字框；选中后方向键微调（Shift 加速）、Delete 删除、⌘/Ctrl+Z 撤销。</p>
                    {uploadNote ? <p className="mt-1 text-xs text-[var(--muted-foreground)]">{uploadNote}</p> : null}
                </section>

            {/* 结果 */}
            <section className={cardClass} aria-label="图片文字结果">
                <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-medium">图片文字结果</h2>
                    <span className="text-[11px] text-[var(--muted-foreground)]">
                        {snapshot ? `快照 ${snapshot.boxes.length} 框｜${snapshot.imageWidth}×${snapshot.imageHeight}` : "尚未提交"}
                        {result?.responseId ? `｜响应 id：${result.responseId}` : ""}
                    </span>
                </header>
                {resultNotice ? <p className="mb-2 text-xs text-[var(--muted-foreground)]">{resultNotice}</p> : null}
                {staleNotice ? <p className="mb-2 text-xs text-destructive">{staleNotice}</p> : null}
                <ToolResult task={latest ?? null} toolId={toolId} title="图片文字结果" onRetry={handleRetry} />
            </section>
            </ToolWorkspaceColumns>
        </div>
    );
}

export default ImageTextEditWorkspace;
