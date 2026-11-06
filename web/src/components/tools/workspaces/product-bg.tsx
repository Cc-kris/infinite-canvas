import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, Image as ImageIcon, Info, Lightbulb, Pencil, RotateCcw, Shapes, ShoppingBag, Search, Trash2, Upload, X } from "lucide-react";

import { ToolResult } from "@/components/tools/tool-result";
import { ProductBgCutout } from "@/components/tools/workspaces/product-bg-cutout";
import { AssetDrawer, CHECKER, ReferenceDrawer, SceneCard, type BoardAsset, type PickReference } from "@/components/tools/workspaces/product-bg-panels";
import { uploadCaseFile } from "@/features/tools/case-apply";
import { modelLabel } from "@/lib/model-label";
import { cn } from "@/lib/utils";
import { loadToolAssetRecords, resolveToolAssetConstraints, uploadToolAsset, type ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { getPersistedToolGateway } from "@/stores/use-tool-task-store";
import {
    DEFAULT_NEW_REPLACE_BG_VALUES,
    DEFAULT_SCENE_TRANSFORM,
    NEW_REPLACE_BG_V2_TITLE,
    NEW_REPLACE_BG_V2_TOOL_ID,
    SCENE_MASK_LIMITS,
    SCENE_OUTPUT_COUNTS,
    SCENE_OUTPUT_RATIOS,
    SCENE_SOURCE_LIMITS,
    SCENE_TRANSFORM_LIMITS,
    SCENE_WEIGHT_LIMITS,
    SCENE_WEIGHT_MARKS,
    clampSceneTransform,
    computeSceneOutput,
    createNewReplaceBgSnapshot,
    describeNewReplaceBgDrift,
    isSceneOutputRatio,
    readNewReplaceBgValues,
    resetSceneTransform,
    sceneWeightLabel,
    validateNewReplaceBgState,
    type NewReplaceBgSnapshot,
    type NewReplaceBgValues,
} from "@/features/tools/registry/new-replace-bg-v2";
import {
    NewReplaceBgAdapterError,
    isSceneSourceReady,
    newReplaceBgResultFromTask,
    retryNewReplaceBg,
    runNewReplaceBg,
    sceneCutoutReadiness,
    type SceneSourceAsset,
} from "@/features/tools/adapters/new-replace-bg-v2";
import {
    DEFAULT_PRODUCT_BG_CATEGORY,
    PRODUCT_BG_CATEGORIES,
    PRODUCT_BG_EXAMPLES,
    PRODUCT_BG_GUIDE_VIDEO,
    PRODUCT_BG_MODES,
    PRODUCT_BG_SORTS,
    filterProductBgScenes,
    PRODUCT_BG_OCCLUSION_HINT,
    productBgModeOf,
    productBgOcclusionOf,
    productBgPrompt,
    productBgTitleOf,
    type ProductBgMode,
    type ProductBgScene,
} from "@/features/tools/registry/new-replace-bg-v2-scenes";

const GOODS_CONSTRAINTS = resolveToolAssetConstraints({ mimeTypes: [...SCENE_SOURCE_LIMITS.mimeTypes], maxBytes: SCENE_SOURCE_LIMITS.maxBytes });
const MASK_CONSTRAINTS = resolveToolAssetConstraints({ mimeTypes: [...SCENE_MASK_LIMITS.mimeTypes], maxBytes: SCENE_MASK_LIMITS.maxBytes });
/** 参考图统一命名：adapter 的 describeSceneReferences 按名称把它点名为「目标背景图」。 */
const BG_NAME = "linkfox-reference-background";

/** antd reset 给 button 注入未分层的 `color: inherit`，globals.css 只对壳内几个容器做了 revert-layer；本页按钮同样回落到 Tailwind 文字色。 */
type Panel = "ref" | "goods" | "element";
type GoodsEntry = BoardAsset & { mask?: SceneSourceAsset; preCut?: boolean };
/** 元素图层：位置为画布归一化中心点，w 为占画布宽的比例，ratio 为图片宽高比。 */
type BoardElement = { id: string; url: string; x: number; y: number; w: number; ratio: number };

function assetFromRecord(record: ToolAssetRecord): SceneSourceAsset {
    return { assetId: record.id, dataUrl: record.url, url: record.url, name: record.name, mimeType: record.mimeType, bytes: record.bytes, width: record.width, height: record.height };
}

/** 真实像素检查：带 alpha 的商品图才算「已抠好」，环境不支持 canvas 时返回 false（宁可拦下）。 */
async function detectAlpha(url: string): Promise<boolean> {
    if (typeof document === "undefined" || !url) return false;
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error("image-decode-failed"));
            el.src = url;
        });
        const width = Math.min(48, image.naturalWidth || 0);
        const height = Math.min(48, image.naturalHeight || 0);
        if (!width || !height) return false;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return false;
        context.drawImage(image, 0, 0, width, height);
        const { data } = context.getImageData(0, 0, width, height);
        for (let index = 3; index < data.length; index += 4) if (data[index] < 250) return true;
        return false;
    } catch {
        return false;
    }
}

function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("参考图读取失败"));
        el.src = src;
    });
}

/**
 * 按画布所见合成参考图：参考图 object-cover 铺满 + 背景调节（缩放 / 平移）+ 元素图层，
 * 与画布 CSS 渲染一致（translate 按画布宽高百分比，再以中心缩放）。
 */
async function composeReference({ bgUrl, width, height, scale, offset, elements }: { bgUrl: string; width: number; height: number; scale: number; offset: { x: number; y: number }; elements: BoardElement[] }): Promise<File> {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!;
    const image = await loadImage(bgUrl);
    const cover = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    context.save();
    context.translate(width / 2 + offset.x * width, height / 2 + offset.y * height);
    context.scale(scale, scale);
    context.drawImage(image, (-image.naturalWidth * cover) / 2, (-image.naturalHeight * cover) / 2, image.naturalWidth * cover, image.naturalHeight * cover);
    context.restore();
    for (const item of elements) {
        const el = await loadImage(item.url);
        const w = item.w * width;
        const h = w / item.ratio;
        const fit = Math.min(w / el.naturalWidth, h / el.naturalHeight);
        context.drawImage(el, item.x * width - (el.naturalWidth * fit) / 2, item.y * height - (el.naturalHeight * fit) / 2, el.naturalWidth * fit, el.naturalHeight * fit);
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("参考图合成失败");
    return new File([blob], `${BG_NAME}-composed.png`, { type: "image/png" });
}

export function SceneWorkspace({ className }: { className?: string }) {
    const toolId = NEW_REPLACE_BG_V2_TOOL_ID;
    const hydrate = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const flushDraft = useToolDraftStore((state) => state.flush);
    const draft = useToolDraftStore((state) => state.drafts[toolId]);
    const imageModel = useConfigStore((state) => state.config.imageModel);

    const [values, setValues] = useState<NewReplaceBgValues>(() => ({ ...DEFAULT_NEW_REPLACE_BG_VALUES }));
    const [goods, setGoods] = useState<SceneSourceAsset | undefined>();
    const [mask, setMask] = useState<SceneSourceAsset | undefined>();
    const [bg, setBg] = useState<SceneSourceAsset | undefined>();
    const [goodsHasAlpha, setGoodsHasAlpha] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [busy, setBusy] = useState("");
    const [notice, setNotice] = useState("");
    const [task, setTask] = useState<ToolTask | undefined>();
    const [snapshot, setSnapshot] = useState<NewReplaceBgSnapshot | undefined>();
    const [running, setRunning] = useState(false);
    const [runError, setRunError] = useState<string | undefined>();
    const [sceneId, setSceneId] = useState("");
    const [pendingScene, setPendingScene] = useState<ProductBgScene | null>(null);
    const [category, setCategory] = useState<string>(DEFAULT_PRODUCT_BG_CATEGORY);
    const [query, setQuery] = useState("");
    /* 第二步：全屏编辑器（左窄栏 + 抽屉 + 画布 + 配置栏） */
    const [editing, setEditing] = useState(false);
    const [panel, setPanel] = useState<Panel | null>(null);
    const [cutoutOpen, setCutoutOpen] = useState(false);
    const [goodsList, setGoodsList] = useState<GoodsEntry[]>([]);
    const [elementList, setElementList] = useState<BoardAsset[]>([]);
    const [elements, setElements] = useState<BoardElement[]>([]);
    const [bgScale, setBgScale] = useState(1);
    const [bgOffset, setBgOffset] = useState({ x: 0, y: 0 });
    const [selected, setSelected] = useState<string | null>(null);
    const [advanced, setAdvanced] = useState(false);
    const [composed, setComposed] = useState<{ key: string; asset: SceneSourceAsset } | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const goodsInputRef = useRef<HTMLInputElement | null>(null);
    const boardRef = useRef<HTMLDivElement | null>(null);
    const valuesRef = useRef(values);
    valuesRef.current = values;

    /* 草稿恢复：只恢复值与资产 id；图片本体从本地资产库重新取 */
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const restored = await hydrate(toolId);
            if (cancelled) return;
            const parsed = readNewReplaceBgValues(restored?.values?.newReplaceBg);
            setValues(parsed);
            setEditing(Boolean(parsed.goodsAssetId));
            const ids = [parsed.goodsAssetId, parsed.bgAssetId, parsed.maskAssetId].filter(Boolean);
            if (!ids.length) return;
            setRestoring(true);
            try {
                const { records } = await loadToolAssetRecords(ids);
                if (cancelled) return;
                const goodsRecord = records.find((record) => record.id === parsed.goodsAssetId);
                const maskRecord = records.find((record) => record.id === parsed.maskAssetId);
                const bgRecord = records.find((record) => record.id === parsed.bgAssetId);
                const restoredMask = maskRecord ? assetFromRecord(maskRecord) : undefined;
                if (bgRecord) setBg({ ...assetFromRecord(bgRecord), name: BG_NAME });
                setMask(restoredMask);
                if (goodsRecord) {
                    const next = assetFromRecord(goodsRecord);
                    const hasAlpha = await detectAlpha(next.url ?? "");
                    setGoods(next);
                    setGoodsHasAlpha(hasAlpha);
                    setGoodsList([{ id: goodsRecord.id, url: goodsRecord.url, record: goodsRecord, mask: restoredMask, preCut: parsed.cutoutConfirmed && hasAlpha }]);
                }
            } finally {
                if (!cancelled) setRestoring(false);
            }
        })();
        return () => {
            cancelled = true;
            void flushDraft(toolId);
        };
    }, [toolId, hydrate, flushDraft]);

    const update = useCallback(
        (next: Partial<NewReplaceBgValues>) => {
            const merged: NewReplaceBgValues = { ...valuesRef.current, ...next };
            valuesRef.current = merged;
            patchDraft(toolId, { values: { newReplaceBg: merged }, assetIds: [merged.goodsAssetId, merged.bgAssetId, merged.maskAssetId].filter(Boolean) });
            setValues(merged);
        },
        [patchDraft, toolId],
    );

    const output = useMemo(() => computeSceneOutput(values.ratio, values.outputNum), [values.ratio, values.outputNum]);
    const cutout = useMemo(() => sceneCutoutReadiness(values, { mask, goodsHasAlpha }), [values, mask, goodsHasAlpha]);
    const sceneReady = values.sceneType === "custom" && Boolean(bg && values.bgAssetId);
    const issues = useMemo(() => {
        const list = validateNewReplaceBgState({ values, output, goodsReady: isSceneSourceReady(goods), cutout, imageModelReady: Boolean(imageModel?.trim()) });
        const rest = list.filter((issue) => issue.field !== "templateId" && issue.code !== "custom-scene-missing");
        return sceneReady ? rest : [{ code: "scene-missing", field: "bgAssetId", message: "请先选择参考图。" }, ...rest];
    }, [values, output, goods, cutout, imageModel, sceneReady]);
    const blocked = running || restoring || Boolean(busy) || issues.length > 0;
    const mode: ProductBgMode = productBgModeOf(values.customPrompt);
    const occlusion = productBgOcclusionOf(values.customPrompt);

    /* 背景调节 / 元素图层：有改动时提交前把参考图按画布所见合成一张新参考图（adapter 字段不变，仍走 bgAssetId） */
    const layoutKey = bg && (bgScale !== 1 || bgOffset.x || bgOffset.y || elements.length) ? JSON.stringify([values.bgAssetId, bgScale, bgOffset, elements, output.width, output.height]) : "";
    const effectiveBgId = !layoutKey ? values.bgAssetId : composed?.key === layoutKey ? composed.asset.assetId : `pending:${layoutKey}`;
    const currentSnapshot = useMemo(
        () => (isSceneSourceReady(goods) ? createNewReplaceBgSnapshot({ ...values, bgAssetId: effectiveBgId }, output, draft?.revision ?? null) : undefined),
        [values, effectiveBgId, output, goods, draft?.revision],
    );
    const drift = useMemo(() => describeNewReplaceBgDrift(snapshot, currentSnapshot), [snapshot, currentSnapshot]);
    const result = newReplaceBgResultFromTask(task, snapshot, currentSnapshot, drift);

    /** 选中参考图：真实入库 → 作为 adapter 的自定义背景（bgAssetId），标题 + 合成方式 + 保留遮挡物写进 customPrompt。 */
    const pickReference = useCallback<PickReference>(
        (load, id, title) => {
            setBusy("正在载入参考图…");
            setNotice("");
            void (async () => {
                try {
                    const record = await load();
                    /* 统一命名带 background：adapter 按名称在提示词里把这张点名为「目标背景图」 */
                    setBg({ ...assetFromRecord(record), name: BG_NAME });
                    setSceneId(id);
                    setBgScale(1);
                    setBgOffset({ x: 0, y: 0 });
                    setTask(undefined);
                    setSnapshot(undefined);
                    const current = valuesRef.current.customPrompt;
                    update({ sceneType: "custom", templateId: "", bgAssetId: record.id, customPrompt: productBgPrompt(title.slice(0, 40), productBgModeOf(current), productBgOcclusionOf(current)) });
                    setPanel(null);
                    setSelected("bg");
                } catch (error) {
                    setNotice(error instanceof Error ? error.message : "参考图载入失败");
                } finally {
                    setBusy("");
                }
            })();
        },
        [update],
    );

    const applyScene = useCallback(
        (scene: ProductBgScene) => pickReference(() => uploadCaseFile(scene.image, `linkfox-scene-${scene.id}-background`), scene.id, scene.title),
        [pickReference],
    );

    /** 商品图进入编辑器：示例 / 已抠好的直接用；自己上传的先弹抠图编辑（原站「自动抠图中…」→ 抠图弹窗）。 */
    const setGoodsRecord = useCallback(
        async (record: ToolAssetRecord, preCut: boolean) => {
            const next = assetFromRecord(record);
            const known = goodsList.find((item) => item.id === record.id);
            const hasAlpha = await detectAlpha(next.url ?? "");
            const ready = (preCut || Boolean(known?.preCut)) && hasAlpha;
            const knownMask = known?.mask;
            setGoods(next);
            setGoodsHasAlpha(hasAlpha);
            setMask(knownMask);
            setTask(undefined);
            setSnapshot(undefined);
            setEditing(true);
            setSelected("goods");
            update({
                goodsAssetId: next.assetId,
                goodsName: next.name ?? "",
                maskAssetId: knownMask?.assetId ?? "",
                cutoutMode: knownMask ? "mask" : hasAlpha ? "transparent" : "mask",
                cutoutConfirmed: ready || Boolean(knownMask),
                transform: { ...DEFAULT_SCENE_TRANSFORM },
            });
            if (!known) setGoodsList((list) => [{ id: record.id, url: record.url, record, preCut: ready }, ...list]);
            if (!ready && !knownMask) setCutoutOpen(true);
            if (pendingScene) {
                const scene = pendingScene;
                setPendingScene(null);
                applyScene(scene);
            } else if (!valuesRef.current.bgAssetId && (ready || knownMask)) setPanel("ref");
            else setPanel(null);
        },
        [update, pendingScene, applyScene, goodsList],
    );

    const uploadGoodsFile = useCallback(
        async (file: File) => {
            setBusy("正在上传商品图…");
            setNotice("");
            try {
                await setGoodsRecord(await uploadToolAsset(file, { constraints: GOODS_CONSTRAINTS }), false);
            } catch (error) {
                setNotice(error instanceof Error ? error.message : "上传失败");
            } finally {
                setBusy("");
            }
        },
        [setGoodsRecord],
    );

    const applyExample = useCallback(
        async (example: (typeof PRODUCT_BG_EXAMPLES)[number]) => {
            setBusy("正在载入示例商品…");
            setNotice("");
            try {
                await setGoodsRecord(await uploadCaseFile(example.cutout, `linkfox-${example.id}-cutout`), true);
            } catch (error) {
                setNotice(error instanceof Error ? error.message : "示例载入失败");
            } finally {
                setBusy("");
            }
        },
        [setGoodsRecord],
    );

    /** 抠图弹窗「确认使用」：黑白蒙版 PNG 真实入库，走 adapter 现有蒙版字段（cutoutMode=mask + maskAssetId）。 */
    const confirmCutout = useCallback(
        async (file: File) => {
            const next = assetFromRecord(await uploadToolAsset(file, { constraints: MASK_CONSTRAINTS }));
            setMask(next);
            setTask(undefined);
            setSnapshot(undefined);
            update({ cutoutMode: "mask", maskAssetId: next.assetId, cutoutConfirmed: true });
            const goodsId = valuesRef.current.goodsAssetId;
            setGoodsList((list) => list.map((item) => (item.id === goodsId ? { ...item, mask: next } : item)));
            setCutoutOpen(false);
            if (!valuesRef.current.bgAssetId) setPanel("ref");
        },
        [update],
    );

    /* 首屏支持粘贴图片（原站「或拖拽/粘贴图片到此处」） */
    useEffect(() => {
        if (editing) return;
        const onPaste = (event: ClipboardEvent) => {
            const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith("image/"));
            if (file) void uploadGoodsFile(file);
        };
        window.addEventListener("paste", onPaste);
        return () => window.removeEventListener("paste", onPaste);
    }, [editing, uploadGoodsFile]);

    const backHome = useCallback(() => {
        setGoods(undefined);
        setMask(undefined);
        setGoodsHasAlpha(false);
        setTask(undefined);
        setSnapshot(undefined);
        setPanel(null);
        setEditing(false);
        setElements([]);
        setSelected(null);
        update({ goodsAssetId: "", goodsName: "", maskAssetId: "", cutoutConfirmed: false });
    }, [update]);

    const deleteGoods = () => {
        setGoods(undefined);
        setMask(undefined);
        setGoodsHasAlpha(false);
        setSelected(null);
        update({ goodsAssetId: "", goodsName: "", maskAssetId: "", cutoutConfirmed: false, transform: { ...DEFAULT_SCENE_TRANSFORM } });
    };

    const deleteBg = () => {
        setBg(undefined);
        setSceneId("");
        setBgScale(1);
        setBgOffset({ x: 0, y: 0 });
        setSelected(null);
        update({ bgAssetId: "", customPrompt: "" });
    };

    const pickHomeScene = useCallback((scene: ProductBgScene) => {
        /* 原站未上传商品时点「使用此场景」会先要求上传商品图 */
        setPendingScene(scene);
        goodsInputRef.current?.click();
    }, []);

    const setPrompt = useCallback(
        (nextMode: ProductBgMode, nextOcclusion: boolean) => {
            const title = productBgTitleOf(valuesRef.current.customPrompt);
            if (title) update({ customPrompt: productBgPrompt(title, nextMode, nextOcclusion) });
        },
        [update],
    );

    const addElement = (record: ToolAssetRecord) => {
        const id = `${record.id}-${Date.now().toString(36)}`;
        const ratio = record.width && record.height ? record.width / record.height : 1;
        setElements((list) => [...list, { id, url: record.url, x: 0.5, y: 0.5, w: 0.3, ratio }]);
        setElementList((list) => (list.some((item) => item.id === record.id) ? list : [{ id: record.id, url: record.url, record }, ...list]));
        setSelected(id);
        setPanel(null);
    };

    /** 提交前：背景调节 / 元素有改动时按画布所见合成新参考图并入库；同一布局只合成一次。 */
    const prepare = async (): Promise<{ values: NewReplaceBgValues; bg?: SceneSourceAsset }> => {
        if (!layoutKey || !bg?.url) return { values, bg };
        let asset = composed?.key === layoutKey ? composed.asset : undefined;
        if (!asset) {
            const file = await composeReference({ bgUrl: bg.url, width: output.width, height: output.height, scale: bgScale, offset: bgOffset, elements });
            asset = { ...assetFromRecord(await uploadToolAsset(file, { constraints: GOODS_CONSTRAINTS })), name: BG_NAME };
            setComposed({ key: layoutKey, asset });
        }
        return { values: { ...values, bgAssetId: asset.assetId }, bg: asset };
    };

    const runOptions = (ready: { values: NewReplaceBgValues; bg?: SceneSourceAsset }) => ({ gateway: getPersistedToolGateway(), values: ready.values, output, goods: goods!, mask, bg: ready.bg, model: imageModel, goodsHasAlpha, revision: draft?.revision ?? null, onUpdate: setTask });

    const onGenerate = async () => {
        if (!goods) return;
        setRunning(true);
        setRunError(undefined);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const run = await runNewReplaceBg({ ...runOptions(await prepare()), signal: controller.signal });
            setTask(run.task);
            setSnapshot(run.snapshot);
        } catch (error) {
            if (error instanceof NewReplaceBgAdapterError) setRunError([error.message, ...error.issues.map((issue) => `· ${issue.message}`)].join("\n"));
            else setRunError(error instanceof Error ? error.message : "生成失败，请重试。");
        } finally {
            abortRef.current = null;
            setRunning(false);
        }
    };

    const onRetry = async () => {
        if (!goods || !task) return;
        setRunning(true);
        setRunError(undefined);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const run = await retryNewReplaceBg({ ...runOptions(await prepare()), taskId: task.id, signal: controller.signal });
            setTask(run.task);
            setSnapshot(run.snapshot);
        } catch (error) {
            setRunError(error instanceof Error ? error.message : "重试失败。");
        } finally {
            abortRef.current = null;
            setRunning(false);
        }
    };

    const onCancel = () => {
        abortRef.current?.abort();
        if (!task) return;
        try {
            setTask(getPersistedToolGateway().cancel(task.id));
        } catch {
            /* 任务已是终态时取消会抛错，保持现状即可 */
        }
    };

    /* 画布拖动：商品（transform 随 canvasData 提交）/ 参考图（背景调节）/ 元素；右下角手柄缩放 */
    const dragRef = useRef<{ target: string; resize: boolean; sx: number; sy: number; x: number; y: number; size: number; w: number; h: number; cx: number; cy: number } | null>(null);
    const startDrag = (event: React.PointerEvent, target: string, resize = false) => {
        const board = boardRef.current?.getBoundingClientRect();
        if (!board || running) return;
        event.stopPropagation();
        boardRef.current!.setPointerCapture(event.pointerId);
        const element = elements.find((item) => item.id === target);
        const t = valuesRef.current.transform;
        const [x, y, size] = target === "goods" ? [t.x, t.y, t.scale] : target === "bg" ? [bgOffset.x, bgOffset.y, bgScale] : [element?.x ?? 0, element?.y ?? 0, element?.w ?? 0];
        dragRef.current = { target, resize, sx: event.clientX, sy: event.clientY, x, y, size, w: board.width, h: board.height, cx: board.left + x * board.width, cy: board.top + y * board.height };
        setSelected(target);
    };
    const onDragMove = (event: React.PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const dx = (event.clientX - drag.sx) / drag.w;
        const dy = (event.clientY - drag.sy) / drag.h;
        const ratio = Math.hypot(event.clientX - drag.cx, event.clientY - drag.cy) / Math.max(1, Math.hypot(drag.sx - drag.cx, drag.sy - drag.cy));
        if (drag.target === "goods") {
            const t = valuesRef.current.transform;
            const transform = clampSceneTransform(drag.resize ? { ...t, scale: drag.size * ratio } : { ...t, x: drag.x + dx, y: drag.y + dy });
            valuesRef.current = { ...valuesRef.current, transform };
            setValues(valuesRef.current);
        } else if (drag.target === "bg") {
            setBgOffset({ x: Math.max(-1, Math.min(1, drag.x + dx)), y: Math.max(-1, Math.min(1, drag.y + dy)) });
        } else {
            setElements((list) => list.map((item) => (item.id !== drag.target ? item : drag.resize ? { ...item, w: Math.max(0.03, Math.min(1.5, drag.size * ratio)) } : { ...item, x: drag.x + dx, y: drag.y + dy })));
        }
    };
    const onDragEnd = () => {
        if (dragRef.current?.target === "goods") update({});
        dragRef.current = null;
    };

    const homeScenes = useMemo(() => filterProductBgScenes(category, query), [category, query]);
    const hiddenGoodsInput = (
        <input
            ref={goodsInputRef}
            type="file"
            accept={SCENE_SOURCE_LIMITS.mimeTypes.join(",")}
            className="hidden"
            onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void uploadGoodsFile(file);
                else setPendingScene(null);
            }}
        />
    );

    if (!editing) {
        return (
            <div data-testid="scene-workspace" data-step="home" className={cn("flex h-full min-h-0 flex-col overflow-y-auto bg-[var(--canvas)]", className)}>
                {/* 顶部白卡：左 Upload.Dragger，右原站引导视频 */}
                <section data-testid="scene-goods" className="flex shrink-0 gap-[40px] rounded-[8px] bg-background px-[20px] py-[16px]">
                    {hiddenGoodsInput}
                    <div
                        data-testid="scene-goods-dragger"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                            event.preventDefault();
                            const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/"));
                            if (file) void uploadGoodsFile(file);
                        }}
                        className="flex min-h-[208px] min-w-0 flex-1 flex-col items-center justify-center rounded-[8px] border border-dashed border-border transition hover:border-selected"
                    >
                        <button
                            type="button"
                            data-testid="scene-goods-upload"
                            disabled={Boolean(busy) || restoring}
                            onClick={() => goodsInputRef.current?.click()}
                            className="inline-flex h-8 items-center gap-[6px] rounded-[6px] bg-primary px-[15px] text-[14px] text-primary-foreground hover:opacity-90 disabled:opacity-60"
                        >
                            <Upload className="size-[14px]" />
                            上传商品图
                        </button>
                        <p className="mt-[10px] text-[12px] text-foreground/70">{busy || restoring ? busy || "正在恢复草稿素材…" : "或拖拽/粘贴图片到此处"}</p>
                        <div className="mt-[10px] flex items-center gap-[8px] text-[12px] text-muted-foreground">
                            <span className="h-px w-[36px] bg-foreground/10" />
                            或试试这些
                            <span className="h-px w-[36px] bg-foreground/10" />
                        </div>
                        <div data-testid="scene-examples" className="mt-[10px] flex gap-[10px]">
                            {PRODUCT_BG_EXAMPLES.map((example) => (
                                <button
                                    key={example.id}
                                    type="button"
                                    data-testid={`scene-${example.id}`}
                                    disabled={Boolean(busy)}
                                    onClick={() => void applyExample(example)}
                                    className="size-[60px] overflow-hidden rounded-[4px] border border-transparent transition hover:border-selected"
                                >
                                    <img src={example.image} alt={`示例商品 ${example.id.slice(-1)}`} className="size-full object-cover" />
                                </button>
                            ))}
                        </div>
                        {notice ? <p data-testid="scene-notice" className="mt-[8px] text-[12px] text-destructive">{notice}</p> : null}
                    </div>
                    <video data-testid="scene-guide-video" src={PRODUCT_BG_GUIDE_VIDEO} autoPlay muted loop playsInline className="hidden h-[208px] w-[370px] shrink-0 rounded-[8px] object-cover lg:block" />
                </section>

                {/* 场景参考图照片墙；原站「我的商品」在账号无商品时整块隐藏，本地没有商品库数据源，同样不显示 */}
                <section data-testid="scene-templates" className="mt-[16px] min-w-0 px-[4px] pb-[16px]">
                    <div className="flex flex-wrap items-center justify-between gap-[12px]">
                        <h1 className="text-[20px] font-bold leading-[28px] text-foreground">场景参考图</h1>
                        <div className="flex items-center gap-[12px]">
                            <label className="flex h-[28px] w-[150px] items-center gap-[4px] rounded-[4px] bg-foreground/[0.04] px-[8px]">
                                <Search className="size-[14px] shrink-0 text-muted-foreground" />
                                <input
                                    data-testid="scene-template-search"
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="搜索标签关键词"
                                    className="min-w-0 flex-1 bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
                                />
                            </label>
                            <span className="text-[12px] text-foreground/70">排序：</span>
                            <div className="flex gap-[6px]" data-testid="scene-sorts">
                                {PRODUCT_BG_SORTS.map((label, index) => (
                                    <span
                                        key={label}
                                        aria-disabled={index > 0}
                                        title={index > 0 ? "本地没有收藏 / 热度数据，仅按原站推荐顺序展示" : undefined}
                                        className={cn(
                                            "rounded-[4px] border px-[8px] py-[3px] text-[12px]",
                                            index === 0 ? "border-selected bg-selected-soft text-foreground" : "cursor-not-allowed border-transparent bg-foreground/[0.04] text-muted-foreground",
                                        )}
                                    >
                                        {label}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div data-testid="scene-categories" className="mt-[14px] flex gap-[28px] overflow-x-auto whitespace-nowrap [scrollbar-width:none]">
                        {PRODUCT_BG_CATEGORIES.map((label) => (
                            <button
                                key={label}
                                type="button"
                                aria-pressed={category === label}
                                onClick={() => setCategory(label)}
                                className={cn("relative pb-[6px] text-[14px] leading-[22px]", category === label ? "font-medium text-foreground" : "text-foreground/70 hover:text-foreground")}
                            >
                                {label}
                                {category === label ? <span className="absolute bottom-0 left-1/2 h-[2px] w-[16px] -translate-x-1/2 rounded bg-foreground" /> : null}
                            </button>
                        ))}
                    </div>
                    {pendingScene ? <p className="mt-[8px] text-[12px] text-foreground">已选择「{pendingScene.title}」，请先上传商品图</p> : null}
                    <div className="mt-[16px] grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-x-[16px] gap-y-[14px]">
                        {homeScenes.map((scene) => (
                            <SceneCard key={scene.id} scene={scene} testId={`scene-template-${scene.id}`} onPick={pickHomeScene} />
                        ))}
                    </div>
                    <p data-testid="scene-template-end" className="mt-[16px] text-center text-[12px] text-muted-foreground">没有更多了</p>
                </section>
            </div>
        );
    }

    /* 蒙版模式：画布预览按蒙版亮度裁出商品主体（白=主体），与提交给模型的蒙版一致 */
    const maskPreview = values.cutoutMode === "mask" && mask?.url ? { maskImage: `url(${mask.url})`, maskMode: "luminance" as const, maskSize: "100% 100%", WebkitMaskImage: `url(${mask.url})`, WebkitMaskSize: "100% 100%" } : {};
    const goodsStyle = { left: `${values.transform.x * 100}%`, top: `${values.transform.y * 100}%`, width: `${values.transform.scale * 50}%`, transform: `translate(-50%, -50%) rotate(${values.transform.rotate}deg)` };
    const handle = (target: string) => <span onPointerDown={(event) => startDrag(event, target, true)} className="absolute -right-[5px] -top-[5px] size-[10px] cursor-nesw-resize rounded-full border border-selected bg-background" />;
    const bar = "flex items-center gap-[4px] rounded-[6px] px-[8px] py-[4px] hover:bg-accent disabled:opacity-40";
    const rail: { id: Panel; label: string; icon: typeof ImageIcon; testId: string }[] = [
        { id: "ref", label: "参考图", icon: ImageIcon, testId: "scene-drawer-toggle" },
        { id: "goods", label: "商品", icon: ShoppingBag, testId: "scene-goods-toggle" },
        { id: "element", label: "元素", icon: Shapes, testId: "scene-element-toggle" },
    ];

    return (
        <div data-testid="scene-workspace" data-step="editor" className={cn("flex h-full min-h-0 gap-[8px] bg-[var(--canvas)]", className)}>
            {/* 原站第二步是全屏编辑器：data-step="editor" 时 globals.css 隐藏工具页左侧族导航 */}
            {hiddenGoodsInput}
            {/* 左侧窄栏：原站「返回 / 参考图 / 商品 / 元素」 */}
            <nav className="flex w-[72px] shrink-0 flex-col items-center gap-[6px] bg-background py-[10px] text-[12px] text-foreground/70">
                <button type="button" data-testid="scene-back" onClick={backHome} className="mb-[6px] flex items-center gap-[2px] text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="size-3" />
                    返回
                </button>
                {rail.map((item) => (
                    <button key={item.id} type="button" data-testid={item.testId} aria-pressed={panel === item.id} onClick={() => setPanel(panel === item.id ? null : item.id)} className={cn("flex w-[60px] flex-col items-center gap-[4px] rounded-[6px] py-[10px]", panel === item.id ? "bg-accent font-medium text-foreground" : "hover:bg-accent hover:text-foreground")}>
                        <item.icon className="size-[16px]" />
                        {item.label}
                    </button>
                ))}
            </nav>

            <div className="relative flex min-h-0 min-w-0 flex-1 gap-[8px] py-[8px] pr-[8px]">
                {panel === "ref" ? <ReferenceDrawer activeId={sceneId} constraints={GOODS_CONSTRAINTS} onPick={pickReference} onClose={() => setPanel(null)} /> : null}
                {panel === "goods" ? <AssetDrawer kind="goods" items={goodsList} activeId={values.goodsAssetId} constraints={GOODS_CONSTRAINTS} onRecord={(record) => void setGoodsRecord(record, false)} onClose={() => setPanel(null)} /> : null}
                {panel === "element" ? <AssetDrawer kind="element" items={elementList} constraints={GOODS_CONSTRAINTS} onRecord={addElement} onClose={() => setPanel(null)} /> : null}

                {/* 中间画布：参考图铺满画布，商品 / 元素浮在上面可拖动、右下角缩放 */}
                <main data-testid="scene-canvas" className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <p className="flex shrink-0 items-center gap-[4px] rounded-[6px] bg-background px-[12px] py-[6px] text-[12px] text-foreground/70">
                        <Lightbulb className="size-[14px] text-amber-500" />
                        小贴士：您可以调整商品主体到合适的画面位置，或调整参考图大小、位置。
                    </p>
                    <div className="flex min-h-0 flex-1 items-center justify-center p-[16px]">
                        <div
                            ref={boardRef}
                            data-testid="scene-board"
                            onPointerDown={(event) => (bg ? startDrag(event, "bg") : setSelected(null))}
                            onPointerMove={onDragMove}
                            onPointerUp={onDragEnd}
                            onPointerCancel={onDragEnd}
                            className={cn("relative max-h-full max-w-full touch-none select-none overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.08)]", CHECKER, bg && "cursor-move", selected === "bg" && "outline-dashed outline-2 outline-[var(--selected)]")}
                            style={{ aspectRatio: `${output.width} / ${output.height}`, height: "min(100%, 600px)" }}
                        >
                            {bg ? <img data-testid="scene-board-bg" src={bg.url} alt="参考图" draggable={false} className="absolute inset-0 size-full object-cover" style={{ transform: `translate(${bgOffset.x * 100}%, ${bgOffset.y * 100}%) scale(${bgScale})` }} /> : null}
                            {elements.map((item) => (
                                <div key={item.id} data-testid={`scene-board-element-${item.id}`} onPointerDown={(event) => startDrag(event, item.id)} className={cn("absolute cursor-move", selected === item.id && "outline-dashed outline-1 outline-[var(--selected)]")} style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%`, width: `${item.w * 100}%`, aspectRatio: `${item.ratio}`, transform: "translate(-50%, -50%)" }}>
                                    <img src={item.url} alt="元素" draggable={false} className="size-full object-contain" />
                                    {selected === item.id ? handle(item.id) : null}
                                </div>
                            ))}
                            {goods ? (
                                <div data-testid="scene-board-goods-layer" onPointerDown={(event) => startDrag(event, "goods")} className={cn("absolute cursor-move", selected === "goods" && "outline-dashed outline-1 outline-[var(--selected)]")} style={goodsStyle}>
                                    <img data-testid="scene-board-goods" src={goods.url} alt="商品" draggable={false} className="block w-full" style={maskPreview} />
                                    {selected === "goods" ? handle("goods") : null}
                                </div>
                            ) : (
                                <button type="button" data-testid="scene-board-upload" onPointerDown={(event) => event.stopPropagation()} onClick={() => goodsInputRef.current?.click()} className="absolute left-1/2 top-1/2 inline-flex h-[32px] -translate-x-1/2 -translate-y-1/2 items-center gap-[6px] rounded-[6px] bg-primary px-[14px] text-[13px] text-primary-foreground hover:opacity-90">
                                    <Upload className="size-[14px]" />
                                    上传商品
                                </button>
                            )}
                        </div>
                    </div>
                    {/* 画布底部工具条：选中参考图 = 原站「背景调节 小—大 / 重置 / 删除」；选中商品 / 元素 = 编辑 / 重置 / 删除 */}
                    <div data-testid="scene-board-bar" className={cn("mx-auto mb-[4px] flex h-[36px] shrink-0 items-center gap-[6px] rounded-[6px] bg-background px-[10px] text-[12px] text-foreground/70 shadow-[0_1px_4px_rgba(0,0,0,0.06)]", !selected && "invisible")}>
                        {selected === "bg" && bg ? (
                            <>
                                <span className="text-muted-foreground">背景调节</span>
                                <span>小</span>
                                <input data-testid="scene-bg-scale" type="range" min={1} max={3} step={0.1} value={bgScale} disabled={running} onChange={(event) => setBgScale(Number(event.target.value))} className="w-[90px] accent-[var(--selected)]" />
                                <span>大</span>
                                <button type="button" data-testid="scene-bg-reset" onClick={() => { setBgScale(1); setBgOffset({ x: 0, y: 0 }); }} className={bar}>
                                    <RotateCcw className="size-3" />
                                    重置
                                </button>
                                <button type="button" data-testid="scene-bg-delete" onClick={deleteBg} className={cn(bar, "text-destructive")}>
                                    <Trash2 className="size-3" />
                                    删除
                                </button>
                            </>
                        ) : selected === "goods" && goods ? (
                            <>
                                <button type="button" data-testid="scene-goods-edit" disabled={running} onClick={() => setCutoutOpen(true)} className={bar}>
                                    <Pencil className="size-3" />
                                    编辑主图
                                </button>
                                <span className="ml-[4px] text-muted-foreground">大小</span>
                                <input data-testid="scene-goods-scale" type="range" min={0.2} max={SCENE_TRANSFORM_LIMITS.scale.max} step={0.05} value={values.transform.scale} disabled={running} onChange={(event) => update({ transform: clampSceneTransform({ ...values.transform, scale: Number(event.target.value) }) })} className="w-[90px] accent-[var(--selected)]" />
                                <button type="button" data-testid="scene-goods-reset" disabled={running} onClick={() => update(resetSceneTransform(values))} className={bar}>
                                    <RotateCcw className="size-3" />
                                    重置大小和位置
                                </button>
                                <button type="button" data-testid="scene-goods-delete" disabled={running} onClick={deleteGoods} className={cn(bar, "text-destructive")}>
                                    <Trash2 className="size-3" />
                                    删除
                                </button>
                            </>
                        ) : selected ? (
                            <button type="button" data-testid="scene-element-delete" onClick={() => { setElements((list) => list.filter((item) => item.id !== selected)); setSelected(null); }} className={cn(bar, "text-destructive")}>
                                <Trash2 className="size-3" />
                                删除元素
                            </button>
                        ) : null}
                    </div>
                    {task ? (
                        <section data-testid="scene-result" className="mt-[8px] max-h-[45%] shrink-0 overflow-y-auto rounded-[8px] bg-background p-[12px]">
                            {result.drift && result.status === "succeeded" ? <p data-testid="scene-drift" className="mb-2 text-[12px] text-amber-700 dark:text-amber-300">参数已变化：{result.drift}</p> : null}
                            <ToolResult task={task} toolId={toolId} title={`${NEW_REPLACE_BG_V2_TITLE}结果`} onCancel={running ? onCancel : undefined} onRetry={!running ? () => void onRetry() : undefined} className="border-0 bg-transparent p-0" />
                        </section>
                    ) : null}
                </main>

                {/* 右侧配置栏 300px：画面尺寸 → 商品合成/替换 → 已选参考图 → 背景相似度 →（商品替换）高级自定义 → 生成张数 → 立即生成 */}
                <aside data-testid="scene-config" className="flex w-[300px] shrink-0 flex-col rounded-[8px] bg-background">
                    <div className="min-h-0 flex-1 space-y-[20px] overflow-y-auto px-[14px] py-[14px] text-[12px]">
                        {goods && !cutout.ready ? (
                            <p data-testid="scene-cutout-pending" className="rounded-[6px] border border-amber-500/30 bg-amber-500/10 px-[10px] py-[8px] text-amber-700 dark:text-amber-300">
                                {cutout.reason}
                                <button type="button" data-testid="scene-cutout-open" onClick={() => setCutoutOpen(true)} className="ml-[4px] underline underline-offset-2">去抠图</button>
                            </p>
                        ) : null}

                        <section data-testid="scene-output">
                            <div className="flex items-center justify-between">
                                <span className="text-[12px] text-muted-foreground">画面尺寸</span>
                                <select
                                    data-testid="scene-ratio"
                                    value={values.ratio}
                                    disabled={running}
                                    onChange={(event) => isSceneOutputRatio(event.target.value) && update({ ratio: event.target.value })}
                                    className="bg-transparent text-[12px] text-foreground outline-none"
                                >
                                    {SCENE_OUTPUT_RATIOS.map((ratio) => (
                                        <option key={ratio} value={ratio}>{ratio === "1:1" ? "默认尺寸" : ratio}</option>
                                    ))}
                                </select>
                            </div>
                            <div data-testid="scene-output-size" className="mt-[8px] flex items-center gap-[8px] text-[14px] text-foreground">
                                <span className="flex h-[32px] flex-1 items-center justify-between rounded-[6px] border border-border px-[10px]">{output.width}<span className="text-[12px] text-muted-foreground">px 宽</span></span>
                                <X className="size-[14px] text-foreground/70" />
                                <span className="flex h-[32px] flex-1 items-center justify-between rounded-[6px] border border-border px-[10px]">{output.height}<span className="text-[12px] text-muted-foreground">px 高</span></span>
                            </div>
                        </section>

                        <section data-testid="scene-type">
                            <div className="flex gap-[20px] text-[14px]">
                                {PRODUCT_BG_MODES.map((item) => (
                                    <button key={item.id} type="button" data-testid={`scene-mode-${item.id}`} aria-pressed={mode === item.id} disabled={running || !sceneReady} onClick={() => setPrompt(item.id, occlusion)} className={cn("border-b-2 pb-[4px]", mode === item.id ? "border-foreground font-medium text-foreground" : "border-transparent text-foreground/70 hover:text-foreground")}>
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                            <p className="mt-[8px] flex items-center gap-[4px] text-foreground/70">
                                <Info className="size-[12px] shrink-0 text-amber-500" />
                                {PRODUCT_BG_MODES.find((item) => item.id === mode)?.hint}
                            </p>
                        </section>

                        <section data-testid="scene-reference">
                            <p className="mb-[8px] text-muted-foreground">已选参考图</p>
                            <div className="group relative flex h-[168px] items-center justify-center overflow-hidden rounded-[6px] border border-dashed border-border">
                                {bg ? <img data-testid="scene-reference-image" src={bg.url} alt="已选参考图" className="size-full object-cover" /> : null}
                                {bg ? (
                                    <div className="absolute right-[6px] top-[6px] hidden gap-[6px] group-hover:flex">
                                        <button type="button" data-testid="scene-reference-delete" aria-label="删除参考图" disabled={running} onClick={deleteBg} className="rounded-[4px] bg-black/50 p-[5px] text-white hover:bg-black/60">
                                            <Trash2 className="size-[12px]" />
                                        </button>
                                        <button type="button" data-testid="scene-reference-pick" disabled={running || Boolean(busy)} onClick={() => setPanel("ref")} className="rounded-[4px] bg-black/50 px-[8px] py-[3px] text-white hover:bg-black/60">
                                            重新选择
                                        </button>
                                    </div>
                                ) : (
                                    <button type="button" data-testid="scene-reference-pick" disabled={running || Boolean(busy)} onClick={() => setPanel("ref")} className="h-[32px] rounded-[6px] bg-primary px-[14px] text-[14px] text-primary-foreground hover:opacity-90 disabled:opacity-50">
                                        {busy || "选择参考图"}
                                    </button>
                                )}
                            </div>
                        </section>

                        <section data-testid="scene-weight">
                            <p className="text-muted-foreground">背景相似度</p>
                            <input
                                data-testid="scene-weight-range"
                                type="range"
                                aria-label="背景相似度"
                                aria-valuetext={sceneWeightLabel(values.weight)}
                                min={SCENE_WEIGHT_LIMITS.min}
                                max={SCENE_WEIGHT_LIMITS.max}
                                step={SCENE_WEIGHT_LIMITS.step}
                                value={values.weight}
                                disabled={running}
                                onChange={(event) => update({ weight: Number(event.target.value) })}
                                className="mt-[8px] w-full accent-[var(--selected)]"
                            />
                            <div className="flex justify-between text-muted-foreground">
                                {SCENE_WEIGHT_MARKS.map((mark) => (
                                    <span key={mark.value} className={cn(sceneWeightLabel(values.weight) === mark.label && "font-medium text-foreground")}>{mark.label}</span>
                                ))}
                            </div>
                        </section>

                        {mode === "replace" ? (
                            <section data-testid="scene-advanced">
                                <button type="button" data-testid="scene-advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)} className="flex w-full items-center justify-between text-[14px] text-foreground">
                                    高级自定义
                                    <ChevronDown className={cn("size-[14px] transition", advanced && "rotate-180")} />
                                </button>
                                {advanced ? (
                                    <div className="mt-[10px] rounded-[6px] bg-foreground/[0.04] p-[10px]">
                                        <div className="flex items-center justify-between">
                                            <span className="text-foreground">保留遮挡物</span>
                                            <button type="button" role="switch" data-testid="scene-occlusion" aria-checked={occlusion} disabled={running || !sceneReady} onClick={() => setPrompt(mode, !occlusion)} className={cn("relative h-[22px] w-[52px] rounded-full text-[11px] transition disabled:opacity-50", occlusion ? "bg-selected text-white" : "bg-foreground/20 text-foreground/70")}>
                                                <span className={cn("absolute top-[2px] size-[18px] rounded-full bg-white shadow transition-all", occlusion ? "left-[32px]" : "left-[2px]")} />
                                                <span className={cn("absolute top-1/2 -translate-y-1/2", occlusion ? "left-[7px]" : "right-[7px]")}>{occlusion ? "开启" : "关闭"}</span>
                                            </button>
                                        </div>
                                        <p className="mt-[6px] leading-[18px] text-muted-foreground">{PRODUCT_BG_OCCLUSION_HINT}</p>
                                    </div>
                                ) : null}
                            </section>
                        ) : null}

                        <section data-testid="scene-count">
                            <p className="mb-[8px] text-muted-foreground">生成张数</p>
                            <div className="grid grid-cols-4 gap-[8px]">
                                {SCENE_OUTPUT_COUNTS.map((count) => (
                                    <button key={count} type="button" data-testid={`scene-count-${count}`} aria-pressed={values.outputNum === count} disabled={running} onClick={() => update({ outputNum: count })} className={cn("h-[32px] rounded-[6px] border text-[14px]", values.outputNum === count ? "border-selected bg-selected-soft text-foreground" : "border-border text-foreground hover:bg-accent")}>
                                        {count}
                                    </button>
                                ))}
                            </div>
                        </section>
                    </div>

                    <div data-testid="scene-submit" className="shrink-0 border-t border-border px-[14px] py-[10px]">
                        {runError ? <pre data-testid="scene-run-error" className="mb-2 max-h-24 overflow-auto whitespace-pre-wrap break-words text-[11px] text-destructive">{runError}</pre> : null}
                        {notice ? <p className="mb-2 text-[11px] text-destructive">{notice}</p> : null}
                        {issues.length ? (
                            <ul data-testid="scene-issues" className="mb-2 max-h-20 space-y-0.5 overflow-auto">
                                {issues.map((issue) => (
                                    <li key={`${issue.code}-${issue.field}`} className="text-[11px] leading-4 text-destructive">· {issue.message}</li>
                                ))}
                            </ul>
                        ) : null}
                        <div className="flex gap-[8px]">
                            <button type="button" data-testid="scene-generate" disabled={blocked} onClick={() => void onGenerate()} className="h-[36px] min-w-0 flex-1 rounded-[6px] bg-primary text-[14px] text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                                {running ? "生成中…" : "立即生成"}
                            </button>
                            {running ? <button type="button" onClick={onCancel} className="h-[36px] rounded-[6px] border border-border px-[12px] text-[12px] text-foreground hover:bg-accent">取消</button> : null}
                        </div>
                        <p className="mt-[4px] text-center text-[11px] text-muted-foreground">模型：{modelLabel(imageModel)}</p>
                    </div>
                </aside>
            </div>

            {cutoutOpen && goods?.url ? (
                <ProductBgCutout key={goods.assetId} src={goods.url} name={goods.name ?? "goods"} maskSrc={values.cutoutMode === "mask" ? mask?.url : undefined} onCancel={() => setCutoutOpen(false)} onConfirm={confirmCutout} />
            ) : null}
        </div>
    );
}
