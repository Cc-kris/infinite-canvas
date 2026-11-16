/**
 * TASK-036：IMAGE_TEXT_EDIT（图片文字编辑）工作区。
 *
 * 布局按原站 `/designer?type=78`：顶栏（返回/撤销重做/保存状态/生成）｜左竖向工具栏（文字/素材/背景/模板/标注/图层）｜
 * 左面板｜中间画布 + 底部缩放｜右面板（选中=文字属性，否则=画布尺寸/导出格式，下方生成检查与结果）。
 * 原站有、本地没有真实能力的入口（素材 / 模板 / 标注 / AI生成文案）只做禁用 + title 说明。
 * 硬约束：
 * - 画布选中 ↔ 右侧条目 ↔ 属性面板 三处始终指向同一个 boxId；
 * - 文本框只能来自真实框选/新增或（未来）真实识别结果，不生成示例文案；
 * - 导出前必须跑溢出 + 缺字检查，并把阻断项点名；
 * - 原图永不被覆盖：提交把源图作为参考图，结果落到新的结果区；
 * - 换源图 / 改框后旧结果显式标记“来自旧版本”。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import {
    AlertTriangle,
    ArrowDown,
    ArrowLeft,
    ArrowUp,
    CircleMinus,
    CirclePlus,
    Copy,
    Frame,
    Image as ImageIcon,
    ImagePlus,
    Layers,
    LayoutTemplate,
    Loader2,
    PencilRuler,
    Redo2,
    Search,
    Shapes,
    Trash2,
    Type,
    Undo2,
    WandSparkles,
} from "lucide-react";

import { ToolResult } from "@/components/tools/tool-result";
import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import { cn } from "@/lib/utils";
import { DEFAULT_IMAGE_CONSTRAINTS, loadToolAssetRecords, uploadToolAsset, type ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTaskResultItem } from "@/services/api/tools/task-machine";
import {
    IMAGE_TEXT_EDIT_FONTS,
    IMAGE_TEXT_EDIT_FONT_SIZE,
    IMAGE_TEXT_EDIT_FORMATS,
    IMAGE_TEXT_EDIT_IMAGE,
    IMAGE_TEXT_EDIT_MAX_BOXES,
    IMAGE_TEXT_EDIT_NOTICE,
    IMAGE_TEXT_EDIT_OUTPUT_NUM,
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
import { formatBytesLabel } from "@/services/api/tools/assets";
import { generateMarketingCopyWithAI } from "@/services/api/tools/content-analysis";
import { recognizeAndTranslateImageText } from "@/services/api/tools/ocr-translate";
import { resolveModelChannel, selectableModelsByCapability, useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { reattachDroppedResultUrl, useToolTaskStore } from "@/stores/use-tool-task-store";

const toolId = IMAGE_TEXT_EDIT_TOOL_ID;
/** §6：控件高 36px、输入圆角 8px。 */
const fieldClass = "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-primary";
/** §6：最小点击区 40×40px。 */
const smallButton = "inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40";
/** 源图限制：与注册表 IMAGE_TEXT_EDIT_IMAGE 同源，上传阶段就把格式/尺寸问题挡在控件旁（§5）。 */
const uploadConstraints = {
    kind: "image" as const,
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
    maxBytes: IMAGE_TEXT_EDIT_IMAGE.maxBytes,
    minWidth: IMAGE_TEXT_EDIT_IMAGE.minSide,
    minHeight: IMAGE_TEXT_EDIT_IMAGE.minSide,
    maxWidth: IMAGE_TEXT_EDIT_IMAGE.maxSide,
    maxHeight: IMAGE_TEXT_EDIT_IMAGE.maxSide,
};

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
    /** 源资产 id（§7 任务必须带 sourceAssetIds）：真实入库记录，刷新后按草稿槽位还原。 */
    const [sourceAssetIds, setSourceAssetIds] = useState<string[]>([]);
    const [aiCopyRunning, setAiCopyRunning] = useState(false);
    const [ocrRunning, setOcrRunning] = useState(false);
    /** 原站编辑器布局：左竖向工具栏当前面板、画布缩放（null = 自适应）、推荐字体搜索。 */
    const [panel, setPanel] = useState("文字");
    const [zoom, setZoom] = useState<number | null>(null);
    const [fontQuery, setFontQuery] = useState("");
    const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
    const stageRef = useRef<HTMLDivElement | null>(null);

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
                // 源资产 id 从草稿槽位还原（§7），刷新后仍能作为本次任务的 sourceAssetIds。
                setSourceAssetIds([...draft.assetIds]);
                // 草稿里的 blob: 地址只在上次会话有效：按资产记录的 storageKey 重新签发源图地址。
                if (restored.imageUrl) {
                    const { records } = await loadToolAssetRecords([...draft.assetIds]);
                    if (!alive) return;
                    if (records[0]) await applyAssetRecord(records[0]);
                    else setUploadNote("上次的源图已不在本地，请重新上传。");
                }
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

    // 源资产 id 也写进草稿槽位（恢复完成后才写，避免初始空数组覆盖），刷新后据此重新签发源图地址。
    useEffect(() => {
        if (draftRestored) patchDraft(toolId, { assetIds: sourceAssetIds });
    }, [draftRestored, patchDraft, sourceAssetIds]);

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

    /** 中间画布区尺寸：自适应缩放按它把源图整张放进可视区。 */
    useEffect(() => {
        const element = stageRef.current;
        if (!element) return;
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (rect) setStageSize({ width: rect.width, height: rect.height });
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

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

    /** 上传失败：问题定位到文件并在控件旁说明（§5），其他输入与配置原样保留。 */
    const [failedFile, setFailedFile] = useState("");

    const applyAsset = useCallback(async (file: File) => {
        setUploadNote("");
        setErrorText("");
        setFailedFile("");
        setUploading(true);
        try {
            const record = await uploadToolAsset(file, { name: file.name, constraints: uploadConstraints });
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
            setSourceAssetIds([record.id]);
            setHistory(createImageTextBoxHistory([]));
            setSelectedId("");
            setSnapshot(undefined);
            setZoom(null);
            setUploadNote(`已上传 ${record.name}（${dimensions.width}×${dimensions.height}，${formatBytesLabel(record.bytes)}）。原图不会被覆盖。`);
        } catch (error) {
            // 失败文件单独点名（§5）：其他输入保留，只有这一行是错误态。
            setFailedFile(file.name);
            setUploadNote(error instanceof Error ? `上传失败：${error.message}` : "上传失败：未知原因");
        } finally {
            setUploading(false);
        }
    }, []);

    /** 复用已入库资产（草稿恢复 / 资产库回填）：真实记录驱动，不伪造字节。 */
    const applyAssetRecord = useCallback(async (record: ToolAssetRecord) => {
        const dimensions = record.width && record.height ? { width: record.width, height: record.height } : await new Promise<{ width: number; height: number }>((resolve) => {
            const probe = new Image();
            probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
            probe.onerror = () => resolve({ width: 0, height: 0 });
            probe.src = record.url;
        });
        const format = imageTextEditFormatFromMime(record.mimeType) || imageTextEditFormatFromName(record.name) || "png";
        setValues((previous) => ({
            ...previous,
            imageFormat: format,
            imageHeight: dimensions.height,
            imageName: previous.imageName || record.name,
            imageSize: record.bytes,
            imageUrl: record.url,
            imageWidth: dimensions.width,
        }));
        setSourceAssetIds([record.id]);
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
        // 配置已漂移时拒绝按旧快照重试：结果瓦片会误报「已重新生成并替换」。
        if (snapshot && imageTextEditStaleNotice(values, snapshot, currentSnapshot)) {
            setErrorText("当前配置已变化，旧结果不能按原快照重试；请修改后点击「生成图片文字」新建任务。");
            return;
        }
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
    }, [blocking.length, currentSnapshot, draftRevision, gateway, latest, model, modelReady, snapshot, values]);

    /**
     * 单结果重试（§4）：本工具单次固定输出 1 张，所以「重试这一张」= 按同一快照真实重发一次；
     * 不复用本地缓存、不伪造新图，成功后由任务库替换该结果项。
     */
    const retryItem = useCallback(
        async (_item: ToolTaskResultItem, index: number) => {
            if (!latest) throw new Error("当前没有可重试的结果，请先生成。");
            if (running) throw new Error("当前有任务在跑，等它结束后再重试。");
            if (index !== 0) throw new Error("本次只有 1 张结果，无法重试该下标。");
            await handleRetry();
        },
        [handleRetry, latest, running],
    );

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

    /** 画布显示尺寸：未上传源图时按原站默认 1024×1024 白板；自适应 = 整张放进画布区（四周留 60px）。 */
    const natural = { width: values.imageWidth || 1024, height: values.imageHeight || 1024 };
    const fitScale = stageSize.width > 0 ? Math.min((stageSize.width - 120) / natural.width, (stageSize.height - 120) / natural.height) : 0.5;
    const viewScale = Math.max(0.05, zoom ?? fitScale);
    const stepZoom = (delta: number) => setZoom(Math.max(0.1, Math.round((viewScale + delta) * 10) / 10));
    const canAddBox = Boolean(values.imageUrl) && values.boxes.length < IMAGE_TEXT_EDIT_MAX_BOXES;
    const fontCards = IMAGE_TEXT_EDIT_FONTS.filter((font) => !fontQuery.trim() || font.label.includes(fontQuery.trim()) || font.id.includes(fontQuery.trim().toLowerCase()));

    /** 新增文字框（添加文字 / 默认字体样式 / 推荐字体）：文字留空等用户填写，不预填示例文案。 */
    const addBox = (patch: Partial<ImageTextBox> = {}) => {
        const next = addImageTextBox(values.boxes, patch);
        if (next === values.boxes) return;
        commitBoxes(next);
        setSelectedId(next[next.length - 1]?.id ?? "");
    };
    const addStyledBox = (ratio: number, fontWeight: 400 | 700) => {
        const fontSize = Math.min(IMAGE_TEXT_EDIT_FONT_SIZE.max, Math.max(IMAGE_TEXT_EDIT_FONT_SIZE.min, Math.round(values.imageHeight * ratio)));
        addBox({ fontSize, fontWeight, height: Math.min(0.5, Math.max(0.05, (fontSize * 1.6) / Math.max(values.imageHeight, 1))) });
    };
    const pickFont = (fontId: string) => (selected ? patchSelected({ fontId }) : addBox({ fontId }));

    const handleAiCopy = async () => {
        if (!values.imageUrl || aiCopyRunning) return;
        setAiCopyRunning(true);
        setErrorText("");
        try {
            const copy = await generateMarketingCopyWithAI({
                mode: "sale-script",
                productInfo: values.imageName || "电商商品",
                currentDraft: selected?.text || "",
            });
            if (copy.trim()) {
                if (selected) {
                    patchSelected({ text: copy.slice(0, IMAGE_TEXT_EDIT_TEXT_LIMIT) });
                } else {
                    addBox({ text: copy.slice(0, IMAGE_TEXT_EDIT_TEXT_LIMIT) });
                }
            }
        } catch (error) {
            setErrorText(error instanceof Error ? error.message : "AI生成文案失败");
        } finally {
            setAiCopyRunning(false);
        }
    };

    const handleOcrDetect = async () => {
        if (!values.imageUrl || ocrRunning) return;
        setOcrRunning(true);
        setErrorText("");
        try {
            const ocr = await recognizeAndTranslateImageText({
                imageUrl: values.imageUrl,
                sourceLanguage: "auto",
                targetLanguage: "zh-CN",
            });
            if (ocr.regions.length > 0) {
                let next = values.boxes;
                for (const region of ocr.regions) {
                    next = addImageTextBox(next, {
                        text: (region.sourceText || region.translatedText || "").slice(0, IMAGE_TEXT_EDIT_TEXT_LIMIT),
                        x: Math.max(0, Math.min(0.9, region.x)),
                        y: Math.max(0, Math.min(0.9, region.y)),
                        width: Math.max(0.08, Math.min(0.95, region.width)),
                        height: Math.max(0.05, Math.min(0.5, region.height)),
                        color: region.textColor || "#111111",
                    });
                }
                commitBoxes(next);
                setSelectedId(next[next.length - 1]?.id ?? "");
            } else {
                setErrorText("未在源图中识别到可编辑文字区域");
            }
        } catch (error) {
            setErrorText(error instanceof Error ? error.message : "识别图片文字失败");
        } finally {
            setOcrRunning(false);
        }
    };

    const railButton = (active: boolean) =>
        cn("flex h-14 w-14 flex-col items-center justify-center gap-0.5 text-[12px] disabled:cursor-not-allowed disabled:opacity-35", active ? "bg-accent font-medium text-foreground!" : "text-foreground/70! hover:bg-accent/60");
    const RAIL = [
        { label: "文字", icon: Type },
        { label: "素材", icon: Shapes, disabled: "本地没有素材库，暂不支持" },
        { label: "背景", icon: ImageIcon },
        { label: "模板", icon: LayoutTemplate, disabled: "本地没有图片文字模板库，暂不支持" },
        { label: "标注", icon: PencilRuler, disabled: "本地没有标注工具，暂不支持" },
        { label: "图层", icon: Layers },
    ];
    const sectionTitle = "mb-2 text-[14px] leading-[22px] text-foreground/70";

    return (
        <div className="flex h-full min-h-[640px] flex-col bg-background text-[14px] text-foreground" data-testid="image-text-edit-workspace">
            {/* 顶栏：返回 / 标题 / 撤销重做 / 保存状态 / 生成 */}
            <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border px-6">
                <Link to="/tools/product-design" className="inline-flex h-8 items-center gap-1.5 rounded-[6px] bg-foreground/[0.04] px-3 text-[14px] text-foreground hover:bg-foreground/[0.08]">
                    <ArrowLeft className="size-4" /> 返回
                </Link>
                <h1 className="text-[20px] font-semibold text-foreground">图片文字编辑</h1>
                <span className="h-4 w-px bg-border" />
                <button type="button" aria-label="撤销" title="撤销（⌘/Ctrl+Z）" className="flex size-8 items-center justify-center rounded-[6px] text-foreground/70 hover:bg-foreground/[0.04] disabled:opacity-30" onClick={undo} disabled={!canUndoImageTextBoxHistory(history)}>
                    <Undo2 className="size-4" />
                </button>
                <button type="button" aria-label="重做" title="重做（⌘/Ctrl+Shift+Z）" className="flex size-8 items-center justify-center rounded-[6px] text-foreground/70 hover:bg-foreground/[0.04] disabled:opacity-30" onClick={redo} disabled={!canRedoImageTextBoxHistory(history)}>
                    <Redo2 className="size-4" />
                </button>
                <span className="text-[14px] text-emerald-600 dark:text-emerald-400" title="文字框与源图引用自动保存到浏览器本地草稿">{draftRestored ? "已保存到本地草稿" : "读取草稿中…"}</span>
                <span className="ml-auto text-[12px] text-muted-foreground">预计输出 {IMAGE_TEXT_EDIT_OUTPUT_NUM} 张</span>
                <button
                    type="button"
                    data-testid="image-text-edit-submit"
                    title={blocking[0]?.message ?? "按当前文字框真实提交图像模型生成"}
                    className="inline-flex h-8 items-center gap-1.5 rounded-[6px] bg-primary px-4 text-[14px] text-primary-foreground! hover:opacity-90 disabled:cursor-not-allowed disabled:bg-foreground/[0.04] disabled:text-muted-foreground!"
                    disabled={blocking.length > 0 || running}
                    onClick={() => void handleSubmit()}
                >
                    {running ? <Loader2 className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
                    生成图片文字
                </button>
            </header>
            <div className="flex min-h-0 flex-1">
                <nav aria-label="编辑工具" className="flex w-14 shrink-0 flex-col pt-4">
                    {RAIL.map(({ label, icon: Icon, disabled }) => (
                        <button key={label} type="button" title={disabled ?? label} disabled={Boolean(disabled)} aria-pressed={panel === label} className={railButton(panel === label)} onClick={() => setPanel(label)}>
                            <Icon className="size-4" strokeWidth={1.8} />
                            {label}
                        </button>
                    ))}
                </nav>

                <ToolWorkspaceColumns
                    canvas
                    configSide="left"
                    className="min-h-0 min-w-0 flex-1 gap-0 lg:grid-rows-[minmax(0,1fr)]"
                    configClassName="gap-0 overflow-y-auto border-x border-border px-4 py-4"
                    mainClassName="flex-row gap-0"
                    config={
                        <>
                            {panel === "文字" ? (
                                <section aria-label="文字">
                                    <div className="grid grid-cols-2 gap-[10px]">
                                        <button type="button" disabled={!canAddBox} title={values.imageUrl ? "在画布上新增一个文字框" : "请先上传源图"} onClick={() => addBox()} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[6px] border border-border bg-background text-[14px] text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40">
                                            <Type className="size-3.5" /> 添加文字
                                        </button>
                                        <button type="button" data-testid="image-text-edit-ai-copy" disabled={!values.imageUrl || aiCopyRunning} title={values.imageUrl ? "使用 AI 生成或改写营销文案" : "请先上传源图"} onClick={() => void handleAiCopy()} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[6px] border border-border bg-background text-[14px] text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40">
                                            {aiCopyRunning ? <Loader2 className="size-3.5 animate-spin" /> : <WandSparkles className="size-3.5" />} AI生成文案
                                        </button>
                                    </div>
                                    {values.imageUrl ? (
                                        <button
                                            type="button"
                                            data-testid="image-text-edit-ocr"
                                            disabled={ocrRunning || !canAddBox}
                                            onClick={() => void handleOcrDetect()}
                                            className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[6px] border border-border bg-background text-[13px] text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            {ocrRunning ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
                                            {ocrRunning ? "正在识别图中文字…" : "识别图中文字框"}
                                        </button>
                                    ) : null}
                                    <label className="mt-3 flex h-8 items-center gap-1.5 rounded-[6px] border border-border px-2.5">
                                        <Search className="size-3.5 text-foreground/70" />
                                        <input value={fontQuery} onChange={(event) => setFontQuery(event.target.value)} placeholder="搜索" aria-label="搜索字体风格" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground" />
                                    </label>
                                    <div className={cn(sectionTitle, "mt-4")}>默认字体样式</div>
                                    <div className="grid grid-cols-3 gap-4">
                                        {([["标题", 0.08, 700], ["副标题", 0.05, 400], ["正文", 0.035, 400]] as const).map(([label, ratio, weight]) => (
                                            <button key={label} type="button" disabled={!canAddBox} title={values.imageUrl ? `新增${label}文字框` : "请先上传源图"} onClick={() => addStyledBox(ratio, weight)} className={cn("h-10 rounded-[5px] border border-dashed border-border text-[18px] text-foreground hover:border-selected disabled:cursor-not-allowed disabled:opacity-40", weight === 700 && "font-bold")}>
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className={cn(sectionTitle, "mt-4")}>推荐字体风格</div>
                                    <div className="grid grid-cols-2 gap-[15px]">
                                        {fontCards.map((font) => (
                                            <button
                                                key={font.id}
                                                type="button"
                                                disabled={!selected && !canAddBox}
                                                title={selected ? `把选中文字框改为「${font.label}」` : `用「${font.label}」新增文字框`}
                                                onClick={() => pickFont(font.id)}
                                                className={cn("flex h-20 flex-col items-center justify-center gap-1 rounded-[5px] border hover:border-selected disabled:cursor-not-allowed disabled:opacity-40", selected?.fontId === font.id ? "border-selected" : "border-border")}
                                            >
                                                <span className="text-[24px] leading-none text-foreground" style={{ fontFamily: font.cssStack, fontWeight: font.id === "display" ? 400 : 600 }}>
                                                    {font.monospace ? "¥ 99.00" : "Style 字体"}
                                                </span>
                                                <span className="text-[11px] text-muted-foreground">{font.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                    {!fontCards.length ? <div className="mt-2 text-[12px] text-muted-foreground">没有匹配的字体风格</div> : null}
                                    <div className="mt-4 text-[12px] leading-5 text-muted-foreground">在画布上拖拽可框选新文字框；选中后方向键微调（Shift 加速）、Delete 删除、⌘/Ctrl+Z 撤销。</div>
                                </section>
                            ) : null}
                            {panel === "背景" ? (
                                <section aria-label="背景（源图）">
                                    <div className={sectionTitle}>源图</div>
                                    {values.imageUrl ? (
                                        <img src={values.imageUrl} alt={values.imageName || "源图"} className="mb-2 max-h-56 w-full rounded-[6px] border border-border bg-canvas object-contain" />
                                    ) : null}
                                    <button type="button" className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[6px] bg-primary text-[14px] text-primary-foreground disabled:opacity-50" onClick={() => fileRef.current?.click()} disabled={uploading}>
                                        {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                                        {values.imageUrl ? "更换源图" : "上传源图"}
                                    </button>
                                    <div className="mt-2 text-[12px] leading-5 text-muted-foreground">
                                        {values.imageUrl ? `${values.imageName || "源图"} · ${values.imageWidth}×${values.imageHeight}` : "支持 JPG / PNG / WebP。"}换源图会清空现有文字框；原图只作参考图上传，不会被覆盖。
                                    </div>
                                </section>
                            ) : null}

                            {panel === "图层" ? (
                                <section aria-label="文本框列表">
                                    <header className="mb-2 flex items-center justify-between">
                                        <div className="text-[14px] leading-[22px] text-foreground/70">文字图层</div>
                                        <span className="text-[12px] text-muted-foreground">
                                            {values.boxes.length}/{IMAGE_TEXT_EDIT_MAX_BOXES}
                                        </span>
                                    </header>
                                    {values.boxes.length ? (
                                        <ol className="flex flex-col gap-1">
                                            {values.boxes.map((box, index) => {
                                                const layout = measureImageTextBox(box, values.imageWidth, values.imageHeight);
                                                return (
                                                    <li key={box.id} className={cn("flex items-center gap-1 rounded-[6px] border px-2 py-1", selectedId === box.id ? "border-selected bg-selected-soft" : "border-border")}>
                                                        <button type="button" className="min-h-9 flex-1 truncate text-left text-[13px]" onClick={() => setSelectedId(box.id)}>
                                                            {imageTextEditBoxLabel(box, index)}
                                                        </button>
                                                        {layout.overflowX || layout.overflowY ? <AlertTriangle className="size-3.5 shrink-0 text-destructive" aria-label="预计溢出" /> : null}
                                                        {layout.missingGlyphs.length ? <span className="shrink-0 text-[10px] text-destructive">缺字</span> : null}
                                                        <button
                                                            type="button"
                                                            className="min-h-9 min-w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
                                                            aria-label={`上移 ${index + 1}`}
                                                            disabled={index === 0}
                                                            onClick={() => {
                                                                const next = [...values.boxes];
                                                                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                                                commitBoxes(next);
                                                            }}
                                                        >
                                                            <ArrowUp className="size-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="min-h-9 min-w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
                                                            aria-label={`下移 ${index + 1}`}
                                                            disabled={index === values.boxes.length - 1}
                                                            onClick={() => {
                                                                const next = [...values.boxes];
                                                                [next[index + 1], next[index]] = [next[index], next[index + 1]];
                                                                commitBoxes(next);
                                                            }}
                                                        >
                                                            <ArrowDown className="size-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="min-h-9 min-w-7 text-destructive"
                                                            aria-label={`删除 ${index + 1}`}
                                                            onClick={() => {
                                                                commitBoxes(removeImageTextBox(values.boxes, box.id));
                                                                if (selectedId === box.id) setSelectedId("");
                                                            }}
                                                        >
                                                            <Trash2 className="size-3.5" />
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ol>
                                    ) : (
                                        <div className="text-[12px] text-muted-foreground">还没有文字框。</div>
                                    )}
                                </section>
                            ) : null}
                        </>
                    }
                >
                    {/* 中间画布区：灰底 + 居中画布 + 底部缩放 */}
                    <section aria-label="图片文字画布" className="relative flex min-h-[480px] min-w-0 flex-1 flex-col bg-canvas">
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
                        <div ref={stageRef} className="min-h-0 flex-1 overflow-auto">
                            <div className="flex min-h-full min-w-full items-center justify-center p-[60px]" style={{ width: "max-content", height: "max-content" }}>
                                {values.imageUrl ? (
                                    <div
                                        ref={canvasRef}
                                        role="group"
                                        aria-label="文字框画布"
                                        tabIndex={0}
                                        className="relative shrink-0 overflow-hidden bg-background outline-none focus-visible:ring-2 focus-visible:ring-selected"
                                        style={{ width: natural.width * viewScale, height: natural.height * viewScale }}
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
                                                        selectedId === box.id ? "border-selected ring-2 ring-selected/40" : "border-white/70",
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
                                                className="pointer-events-none absolute border-2 border-dashed border-selected bg-selected-soft"
                                                style={{ left: `${draftRect.x * 100}%`, top: `${draftRect.y * 100}%`, width: `${draftRect.width * 100}%`, height: `${draftRect.height * 100}%` }}
                                            />
                                        ) : null}
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => fileRef.current?.click()}
                                        disabled={uploading}
                                        className="flex shrink-0 flex-col items-center justify-center gap-2 bg-background text-[14px] text-muted-foreground hover:text-foreground"
                                        style={{ width: natural.width * viewScale, height: natural.height * viewScale }}
                                    >
                                        {uploading ? <Loader2 className="size-6 animate-spin" /> : <ImagePlus className="size-6" />}
                                        上传 JPG / PNG / WebP 源图后开始框选文字
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="pointer-events-none absolute inset-x-0 bottom-[10px] flex justify-center">
                            <div className="pointer-events-auto flex h-9 items-center gap-1 rounded-[8px] border border-border bg-background/95 px-2 shadow-sm">
                                <button type="button" aria-label="缩小" className="flex size-7 items-center justify-center rounded-[6px] text-foreground/70 hover:bg-foreground/[0.04]" onClick={() => stepZoom(-0.1)}>
                                    <CircleMinus className="size-4" />
                                </button>
                                <button type="button" title="点击恢复自适应" className="min-w-11 text-center text-[14px] tabular-nums text-foreground/70" onClick={() => setZoom(null)}>
                                    {Math.round(viewScale * 100)}%
                                </button>
                                <button type="button" aria-label="放大" className="flex size-7 items-center justify-center rounded-[6px] text-foreground/70 hover:bg-foreground/[0.04]" onClick={() => stepZoom(0.1)}>
                                    <CirclePlus className="size-4" />
                                </button>
                            </div>
                        </div>
                    </section>
                    {/* 右面板：选中文字框 = 属性；否则 = 画布（尺寸 / 导出格式）；下方固定生成检查与结果 */}
                    <aside aria-label="属性编辑" className="flex w-[360px] shrink-0 flex-col overflow-y-auto border-l border-border bg-background">
                        <h2 className="flex h-12 shrink-0 items-center border-b border-border px-4 text-[14px]">{selected ? "文字" : "画布"}</h2>
                        <div className="flex flex-col gap-4 p-4">
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
                                                        className={cn(smallButton, "flex-1", selected.fontWeight === weight && "border-selected bg-selected-soft text-selected")}
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
                                                    <button key={align} type="button" className={cn(smallButton, "flex-1", selected.align === align && "border-selected bg-selected-soft text-selected")} onClick={() => patchSelected({ align })}>
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
                                    <div className="text-[11px] text-[var(--muted-foreground)]">预览字族：{imageTextEditFontLabel(selected.fontId)}；上游若替换字族不会回写本地配置。</div>
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <div className="mb-2 text-[14px] text-foreground">画布尺寸</div>
                                        <div className="flex h-8 items-center gap-2 rounded-[6px] border border-border px-3 text-[12px]" title="画布尺寸固定等于源图尺寸，结果按源图尺寸输出">
                                            <Frame className="size-3.5 text-foreground" />
                                            <span className="text-foreground">原图尺寸</span>
                                            <span className="text-foreground/70">{values.imageWidth ? `${values.imageWidth} x ${values.imageHeight}` : "待上传源图"}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="mb-2 text-[14px] text-foreground">导出格式</div>
                                        <div className="flex flex-wrap gap-2">
                                            {IMAGE_TEXT_EDIT_FORMATS.map((format) => (
                                                <button
                                                    key={format.id}
                                                    type="button"
                                                    className={cn("h-8 rounded-[6px] border px-2.5 text-[12px]", values.imageFormat === format.id ? "border-selected bg-selected-soft text-selected" : "border-border text-foreground/70 hover:border-selected")}
                                                    onClick={() => update((current) => ({ ...current, imageFormat: format.id as ImageTextEditFormat }))}
                                                >
                                                    {format.label}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="mt-2 text-[12px] leading-5 text-muted-foreground">导出的是新结果文件；原图保持不动，可随时改框重出。</div>
                                    </div>
                                </>
                            )}

                            {uploadNote ? (
                                <div className={cn("text-[12px]", failedFile ? "text-destructive" : "text-muted-foreground")} role={failedFile ? "alert" : undefined}>
                                    {failedFile ? <span className="font-medium">失败文件：{failedFile}。</span> : null}
                                    {uploadNote}
                                </div>
                            ) : null}
                            <div className="text-[12px] leading-5 text-muted-foreground">{imageTextEditPreviewNotice(values)}</div>
                            {issues.length ? (
                                <ul className="flex flex-col gap-1">
                                    {issues.map((issue) => (
                                        <li key={`${issue.code}-${issue.boxId ?? ""}`} className="flex items-start gap-1.5 text-[12px] text-destructive">
                                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                                            <span>{issue.message}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                            {errorText ? <div className="text-[12px] text-destructive">{errorText}</div> : null}
                            <div className="text-[12px] leading-5 text-muted-foreground">预计输出 {IMAGE_TEXT_EDIT_OUTPUT_NUM} 张结果（单次固定，不可改数量）。{IMAGE_TEXT_EDIT_NOTICE}</div>
                            {/* 结果 */}
                            <section aria-label="图片文字结果" className="border-t border-border pt-4">
                                <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                    <h3 className="text-[14px] text-foreground">生成结果</h3>
                                </header>
                                {resultNotice ? <div className="mb-2 text-[12px] text-muted-foreground">{resultNotice}</div> : null}
                                <ToolResult task={latest ?? null} toolId={toolId} title="图片文字结果" onRetry={handleRetry} onRetryItem={retryItem} retryItemHint="按同一快照真实重发一次请求，成功后替换该结果。" />
                            </section>
                        </div>
                    </aside>
                </ToolWorkspaceColumns>
            </div>
        </div>
    );
}

export default ImageTextEditWorkspace;
