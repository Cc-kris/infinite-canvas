import { modelLabel } from "@/lib/model-label";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { WatermarkGroupPanel } from "@/components/tools/watermark-group-panel";
import { ToolResult } from "@/components/tools/tool-result";
import { Design19LeftColumn, Design19Results, Design19Workbench, type Design19TabId } from "@/components/tools/design19-frame";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { downloadResultItem, saveResultItemToAssets, sendResultItemToCanvas } from "@/components/tools/tool-result-actions";
import { resolveMediaUrl } from "@/services/file-storage";
import { loadToolAssetRecords, type ToolAssetConstraints, type ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { getPersistedToolGateway, useToolTaskStore } from "@/stores/use-tool-task-store";

import {
    DEFAULT_NEW_REPLACE_BG_VALUES,
    NEW_REPLACE_BG_V2_TOOL_ID,
    NEW_REPLACE_BG_V2_TITLE,
    SCENE_CUTOUT_MODES,
    DEFAULT_SCENE_LAYERS,
    SCENE_LAYER_IDS,
    SCENE_MASK_LIMITS,
    SCENE_OUTPUT_COUNTS,
    SCENE_OUTPUT_RATIOS,
    SCENE_SOURCE_LIMITS,
    SCENE_TEMPLATES,
    SCENE_TYPES,
    SCENE_WEIGHT_LIMITS,
    buildNewReplaceBgPrompt,
    buildSceneCanvasData,
    buildSceneImageRecords,
    buildSceneSizeData,
    clampSceneTransform,
    computeSceneOutput,
    createNewReplaceBgSnapshot,
    createSceneHistory,
    describeNewReplaceBgDrift,
    pushSceneHistory,
    readNewReplaceBgValues,
    sceneHistoryState,
    stepSceneHistory,
    resetSceneLayer,
    resetSceneTransform,
    sceneLayerMeta,
    sceneSteps,
    sceneTemplate,
    sceneWeightLabel,
    transformSummary,
    validateNewReplaceBgState,
    type NewReplaceBgSnapshot,
    type SceneHistory,
    type NewReplaceBgValues,
    type SceneLayerId,
    type SceneOutput,
} from "@/features/tools/registry/new-replace-bg-v2";
import {
    NewReplaceBgAdapterError,
    firstSceneImage,
    isSceneSourceReady,
    newReplaceBgResultFromTask,
    retryNewReplaceBg,
    runNewReplaceBg,
    sceneCutoutReadiness,
    sceneResultGrid,
    type SceneSourceAsset,
} from "@/features/tools/adapters/new-replace-bg-v2";

const GOODS_CONSTRAINTS: Partial<ToolAssetConstraints> = {
    mimeTypes: [...SCENE_SOURCE_LIMITS.mimeTypes],
    maxBytes: SCENE_SOURCE_LIMITS.maxBytes,
};
const BG_CONSTRAINTS: Partial<ToolAssetConstraints> = {
    mimeTypes: [...SCENE_SOURCE_LIMITS.mimeTypes],
    maxBytes: SCENE_SOURCE_LIMITS.maxBytes,
};
const MASK_CONSTRAINTS: Partial<ToolAssetConstraints> = {
    mimeTypes: [...SCENE_MASK_LIMITS.mimeTypes],
    maxBytes: SCENE_MASK_LIMITS.maxBytes,
};

function Section({ title, hint, children, testId }: { title: string; hint?: string; children: React.ReactNode; testId?: string }) {
    return (
        <section data-testid={testId} className="rounded-lg border border-stone-200 bg-card/60 p-3 dark:border-stone-800 dark:bg-stone-900/40">
            <header className="mb-2 flex items-baseline gap-2">
                <h3 className="text-sm font-medium text-stone-800 dark:text-stone-100">{title}</h3>
                {hint ? <span className="text-[11px] text-stone-500 dark:text-stone-400">{hint}</span> : null}
            </header>
            {children}
        </section>
    );
}

function chipClass(active: boolean) {
    return [
        "rounded-md border px-2 py-1 text-xs transition",
        active
            ? "border-stone-800 bg-stone-800 text-white dark:border-stone-200 dark:bg-stone-200 dark:text-stone-900"
            : "border-stone-200 bg-card text-stone-700 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200",
    ].join(" ");
}

function assetFromRecord(record: ToolAssetRecord): SceneSourceAsset {
    return {
        assetId: record.id,
        dataUrl: record.url,
        url: record.url,
        name: record.name,
        mimeType: record.mimeType,
        bytes: record.bytes,
        width: record.width,
        height: record.height,
    };
}

/**
 * 真实像素检查：透明底 PNG 必须真的带 alpha，不能只看用户勾了个开关。
 * 环境不支持 canvas 时返回 false（宁可拦下，不假装通过）。
 */
async function detectAlpha(url: string): Promise<boolean> {
    if (typeof document === "undefined" || !url) return false;
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.crossOrigin = "anonymous";
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
        for (let index = 3; index < data.length; index += 4) {
            if (data[index] < 250) return true;
        }
        return false;
    } catch {
        return false;
    }
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
    const [task, setTask] = useState<ToolTask | undefined>();
    const [snapshot, setSnapshot] = useState<NewReplaceBgSnapshot | undefined>();
    const [running, setRunning] = useState(false);
    const [runError, setRunError] = useState<string | undefined>();
    const abortRef = useRef<AbortController | null>(null);

    /* 草稿恢复：只恢复值与资产 id；图片本体从本地资产库重新取，取不到就明确提示重选 */
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const restored = await hydrate(toolId);
            if (cancelled) return;
            const parsed = readNewReplaceBgValues(restored?.values?.newReplaceBg);
            setValues(parsed);
            const ids = [parsed.goodsAssetId, parsed.bgAssetId, parsed.maskAssetId].filter(Boolean);
            if (!ids.length) return;
            setRestoring(true);
            try {
                const { records } = await loadToolAssetRecords(ids);
                if (cancelled) return;
                for (const record of records) {
                    if (record.id === parsed.goodsAssetId) {
                        const next = assetFromRecord(record);
                        setGoods(next);
                        setGoodsHasAlpha(await detectAlpha(next.dataUrl ?? next.url ?? ""));
                    } else if (record.id === parsed.maskAssetId) {
                        setMask(assetFromRecord(record));
                    } else if (record.id === parsed.bgAssetId) {
                        setBg(assetFromRecord(record));
                    }
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

    /* ---------------- 撤销/重做：只回放画布参数，不回放资产上传 ---------------- */
    /* 逻辑在 registry 里是纯函数（pushSceneHistory / stepSceneHistory），组件只负责持有状态 */
    const valuesRef = useRef(values);
    valuesRef.current = values;
    const historyRef = useRef<SceneHistory>(createSceneHistory());
    const [history, setHistory] = useState<SceneHistory>(() => createSceneHistory());

    const persist = useCallback(
        (next: NewReplaceBgValues) => {
            patchDraft(toolId, {
                values: { newReplaceBg: next },
                assetIds: [next.goodsAssetId, next.bgAssetId, next.maskAssetId].filter(Boolean),
            });
        },
        [patchDraft, toolId],
    );

    const update = useCallback(
        (next: Partial<NewReplaceBgValues>) => {
            const previous = valuesRef.current;
            const merged: NewReplaceBgValues = { ...previous, ...next };
            historyRef.current = pushSceneHistory(historyRef.current, previous);
            setHistory(historyRef.current);
            valuesRef.current = merged;
            persist(merged);
            setValues(merged);
        },
        [persist],
    );

    const stepHistory = useCallback(
        (direction: "undo" | "redo") => {
            const stepped = stepSceneHistory(historyRef.current, valuesRef.current, direction);
            if (!stepped.next) return;
            historyRef.current = stepped.history;
            setHistory(stepped.history);
            valuesRef.current = stepped.next;
            persist(stepped.next);
            setValues(stepped.next);
        },
        [persist],
    );

    const undoState = sceneHistoryState(history);
    const canUndo = undoState.canUndo;
    const canRedo = undoState.canRedo;

    const output = useMemo(() => computeSceneOutput(values.ratio, values.outputNum), [values.ratio, values.outputNum]);
    const cutout = useMemo(() => sceneCutoutReadiness(values, { mask, goodsHasAlpha }), [values, mask, goodsHasAlpha]);
    const issues = useMemo(
        () =>
            validateNewReplaceBgState({
                values,
                output,
                goodsReady: isSceneSourceReady(goods),
                cutout,
                imageModelReady: Boolean(imageModel?.trim()),
            }),
        [values, output, goods, cutout, imageModel],
    );
    const blocked = running || issues.length > 0;

    const currentSnapshot = useMemo(
        () => (isSceneSourceReady(goods) ? createNewReplaceBgSnapshot(values, output, draft?.revision ?? null) : undefined),
        [values, output, goods, draft?.revision],
    );
    const drift = useMemo(() => describeNewReplaceBgDrift(snapshot, currentSnapshot), [snapshot, currentSnapshot]);
    const result = newReplaceBgResultFromTask(task, snapshot, currentSnapshot, drift);
    const grid = sceneResultGrid(result.images, output.count, result.status);
    const primary = firstSceneImage(result);
    const steps = sceneSteps({
        goodsReady: isSceneSourceReady(goods),
        cutoutReady: cutout.ready,
        sceneReady: values.sceneType === "recommend" ? Boolean(sceneTemplate(values.templateId)) : values.customPrompt.trim().length > 0 || isSceneSourceReady(bg),
        hasResult: result.images.length > 0,
    });

    const onGoodsChange = useCallback(
        (assetIds: string[], records: ToolAssetRecord[]) => {
            const record = records[0];
            if (!record) {
                setGoods(undefined);
                setGoodsHasAlpha(false);
                setTask(undefined);
                setSnapshot(undefined);
                update({ goodsAssetId: "", goodsName: "", cutoutConfirmed: false });
                return;
            }
            const next = assetFromRecord(record);
            setGoods(next);
            /* 换商品图 → 旧合成结果不能继续冒充当前结果 */
            setTask(undefined);
            setSnapshot(undefined);
            update({ goodsAssetId: next.assetId, goodsName: next.name ?? "", cutoutConfirmed: false });
            void detectAlpha(next.dataUrl ?? next.url ?? "").then((hasAlpha) => {
                setGoodsHasAlpha(hasAlpha);
                if (!hasAlpha && values.cutoutMode === "transparent") update({ cutoutMode: "mask", cutoutConfirmed: false });
            });
        },
        [update, values.cutoutMode],
    );

    const onMaskChange = useCallback(
        (assetIds: string[], records: ToolAssetRecord[]) => {
            const record = records[0];
            if (!record) {
                setMask(undefined);
                update({ maskAssetId: "", cutoutConfirmed: false });
                return;
            }
            const next = assetFromRecord(record);
            setMask(next);
            update({ maskAssetId: next.assetId, cutoutConfirmed: false });
        },
        [update],
    );

    const onBgChange = useCallback(
        (assetIds: string[], records: ToolAssetRecord[]) => {
            const record = records[0];
            if (!record) {
                setBg(undefined);
                update({ bgAssetId: "" });
                return;
            }
            const next = assetFromRecord(record);
            setBg(next);
            update({ bgAssetId: next.assetId });
        },
        [update],
    );

    const onGenerate = useCallback(async () => {
        if (!goods) return;
        setRunning(true);
        setRunError(undefined);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const run = await runNewReplaceBg({
                gateway: getPersistedToolGateway(),
                values,
                output,
                goods,
                mask,
                bg,
                model: imageModel,
                goodsHasAlpha,
                revision: draft?.revision ?? null,
                signal: controller.signal,
                onUpdate: setTask,
            });
            setTask(run.task);
            setSnapshot(run.snapshot);
        } catch (error) {
            if (error instanceof NewReplaceBgAdapterError) {
                setRunError([error.message, ...error.issues.map((issue) => `· ${issue.message}`)].join("\n"));
            } else {
                setRunError(error instanceof Error ? error.message : "生成失败，请重试。");
            }
        } finally {
            abortRef.current = null;
            setRunning(false);
        }
    }, [goods, values, output, mask, bg, imageModel, goodsHasAlpha, draft?.revision]);

    const onRetry = useCallback(async () => {
        if (!goods || !task) return;
        setRunning(true);
        setRunError(undefined);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const run = await retryNewReplaceBg({
                gateway: getPersistedToolGateway(),
                taskId: task.id,
                values,
                output,
                goods,
                mask,
                bg,
                model: imageModel,
                goodsHasAlpha,
                revision: draft?.revision ?? null,
                signal: controller.signal,
                onUpdate: setTask,
            });
            setTask(run.task);
            setSnapshot(run.snapshot);
        } catch (error) {
            setRunError(error instanceof Error ? error.message : "重试失败。");
        } finally {
            abortRef.current = null;
            setRunning(false);
        }
    }, [goods, task, values, output, mask, bg, imageModel, goodsHasAlpha, draft?.revision]);

    const onCancel = useCallback(() => {
        abortRef.current?.abort();
        if (!task) return;
        try {
            setTask(getPersistedToolGateway().cancel(task.id));
        } catch {
            /* 任务已是终态时取消会抛错，保持现状即可 */
        }
    }, [task]);

    const canvasData = useMemo(() => buildSceneCanvasData(values, output), [values, output]);
    const sizeData = useMemo(() => buildSceneSizeData(values, output), [values, output]);
    const imageRecords = useMemo(
        () => buildSceneImageRecords(values, { goodsName: goods?.name, bgName: bg?.name, maskName: mask?.name }),
        [values, goods?.name, bg?.name, mask?.name],
    );
    const template = sceneTemplate(values.templateId);

    const [sceneSort, setSceneSort] = useState("smart");
    const [activeScene, setActiveScene] = useState<string>();

    return (
        <div data-testid="scene-workspace" className={cn("flex flex-col gap-4", className)}>
            <div className="grid gap-4 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
                <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-3">
                    <h2 className="text-sm font-medium text-foreground">上传商品图</h2>
                    <ToolAssetInput toolId={toolId} maxCount={1} variant="linkfox" wide uploadLabel="上传商品图" dropLabel="或拖拽/粘贴图片到此处" actions={<></>} disabled={running} onChange={onGoodsChange} />
                </section>
                <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-sm font-medium text-foreground">或试试这些</h2>
                        <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                            <span>排序：</span>
                            {([["smart", "智能推荐"], ["favorite", "按收藏时间"], ["hot", "按素材热度"]] as const).map(([value, label]) => (
                                <button key={value} type="button" data-testid={`scene-sort-${value}`} onClick={() => setSceneSort(value)} className={cn("rounded-md border px-1.5 py-0.5 text-[11px] leading-4", sceneSort === value ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                    <button key="日用百货" type="button" onClick={() => { setActiveScene("日用百货"); update({ customPrompt: "日用百货 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "日用百货" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>日用百货</button>
                    <button key="家居家装" type="button" onClick={() => { setActiveScene("家居家装"); update({ customPrompt: "家居家装 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "家居家装" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>家居家装</button>
                    <button key="服饰箱包" type="button" onClick={() => { setActiveScene("服饰箱包"); update({ customPrompt: "服饰箱包 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "服饰箱包" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>服饰箱包</button>
                    <button key="美妆个护" type="button" onClick={() => { setActiveScene("美妆个护"); update({ customPrompt: "美妆个护 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "美妆个护" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>美妆个护</button>
                    <button key="家用电器" type="button" onClick={() => { setActiveScene("家用电器"); update({ customPrompt: "家用电器 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "家用电器" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>家用电器</button>
                    <button key="玩具类目" type="button" onClick={() => { setActiveScene("玩具类目"); update({ customPrompt: "玩具类目 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "玩具类目" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>玩具类目</button>
                    <button key="儿童 & 母婴" type="button" onClick={() => { setActiveScene("儿童 & 母婴"); update({ customPrompt: "儿童 & 母婴 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "儿童 & 母婴" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>儿童 & 母婴</button>
                    <button key="3C数码" type="button" onClick={() => { setActiveScene("3C数码"); update({ customPrompt: "3C数码 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "3C数码" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>3C数码</button>
                    <button key="办公用品" type="button" onClick={() => { setActiveScene("办公用品"); update({ customPrompt: "办公用品 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "办公用品" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>办公用品</button>
                    <button key="运动户外" type="button" onClick={() => { setActiveScene("运动户外"); update({ customPrompt: "运动户外 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "运动户外" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>运动户外</button>
                    <button key="工艺/艺术品" type="button" onClick={() => { setActiveScene("工艺/艺术品"); update({ customPrompt: "工艺/艺术品 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "工艺/艺术品" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>工艺/艺术品</button>
                    <button key="宠物用品" type="button" onClick={() => { setActiveScene("宠物用品"); update({ customPrompt: "宠物用品 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "宠物用品" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>宠物用品</button>
                    <button key="食品饮料" type="button" onClick={() => { setActiveScene("食品饮料"); update({ customPrompt: "食品饮料 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "食品饮料" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>食品饮料</button>
                    <button key="医药保健/护理" type="button" onClick={() => { setActiveScene("医药保健/护理"); update({ customPrompt: "医药保健/护理 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "医药保健/护理" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>医药保健/护理</button>
                    <button key="汽车用品" type="button" onClick={() => { setActiveScene("汽车用品"); update({ customPrompt: "汽车用品 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "汽车用品" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>汽车用品</button>
                    <button key="其他" type="button" onClick={() => { setActiveScene("其他"); update({ customPrompt: "其他 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "其他" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>其他</button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                    <button key="桌面-保温杯" type="button" onClick={() => { setActiveScene("桌面-保温杯"); update({ customPrompt: "桌面-保温杯 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "桌面-保温杯" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>桌面-保温杯</button>
                    <button key="厨房-搅拌器" type="button" onClick={() => { setActiveScene("厨房-搅拌器"); update({ customPrompt: "厨房-搅拌器 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "厨房-搅拌器" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>厨房-搅拌器</button>
                    <button key="客厅-毯子" type="button" onClick={() => { setActiveScene("客厅-毯子"); update({ customPrompt: "客厅-毯子 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "客厅-毯子" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>客厅-毯子</button>
                    <button key="厨房-电子秤" type="button" onClick={() => { setActiveScene("厨房-电子秤"); update({ customPrompt: "厨房-电子秤 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "厨房-电子秤" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>厨房-电子秤</button>
                    <button key="草地-篮子" type="button" onClick={() => { setActiveScene("草地-篮子"); update({ customPrompt: "草地-篮子 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "草地-篮子" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>草地-篮子</button>
                    <button key="餐桌-杯子" type="button" onClick={() => { setActiveScene("餐桌-杯子"); update({ customPrompt: "餐桌-杯子 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "餐桌-杯子" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>餐桌-杯子</button>
                    <button key="餐桌-水壶" type="button" onClick={() => { setActiveScene("餐桌-水壶"); update({ customPrompt: "餐桌-水壶 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "餐桌-水壶" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>餐桌-水壶</button>
                    <button key="客厅-书柜" type="button" onClick={() => { setActiveScene("客厅-书柜"); update({ customPrompt: "客厅-书柜 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "客厅-书柜" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>客厅-书柜</button>
                    <button key="餐桌-茶具" type="button" onClick={() => { setActiveScene("餐桌-茶具"); update({ customPrompt: "餐桌-茶具 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "餐桌-茶具" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>餐桌-茶具</button>
                    <button key="书架-储物箱" type="button" onClick={() => { setActiveScene("书架-储物箱"); update({ customPrompt: "书架-储物箱 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "书架-储物箱" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>书架-储物箱</button>
                    <button key="餐桌-篮子" type="button" onClick={() => { setActiveScene("餐桌-篮子"); update({ customPrompt: "餐桌-篮子 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "餐桌-篮子" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>餐桌-篮子</button>
                    <button key="餐桌-保温箱" type="button" onClick={() => { setActiveScene("餐桌-保温箱"); update({ customPrompt: "餐桌-保温箱 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "餐桌-保温箱" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>餐桌-保温箱</button>
                    <button key="桌面-蜡烛" type="button" onClick={() => { setActiveScene("桌面-蜡烛"); update({ customPrompt: "桌面-蜡烛 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "桌面-蜡烛" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>桌面-蜡烛</button>
                    <button key="节日装饰-蜡烛" type="button" onClick={() => { setActiveScene("节日装饰-蜡烛"); update({ customPrompt: "节日装饰-蜡烛 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "节日装饰-蜡烛" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>节日装饰-蜡烛</button>
                    <button key="厨房-水果篮" type="button" onClick={() => { setActiveScene("厨房-水果篮"); update({ customPrompt: "厨房-水果篮 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "厨房-水果篮" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>厨房-水果篮</button>
                    <button key="厨房-刀具" type="button" onClick={() => { setActiveScene("厨房-刀具"); update({ customPrompt: "厨房-刀具 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "厨房-刀具" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>厨房-刀具</button>
                    <button key="餐桌-蜡烛" type="button" onClick={() => { setActiveScene("餐桌-蜡烛"); update({ customPrompt: "餐桌-蜡烛 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "餐桌-蜡烛" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>餐桌-蜡烛</button>
                    <button key="厨房-厨房岛" type="button" onClick={() => { setActiveScene("厨房-厨房岛"); update({ customPrompt: "厨房-厨房岛 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "厨房-厨房岛" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>厨房-厨房岛</button>
                    <button key="客厅-收纳篮" type="button" onClick={() => { setActiveScene("客厅-收纳篮"); update({ customPrompt: "客厅-收纳篮 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "客厅-收纳篮" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>客厅-收纳篮</button>
                    <button key="客厅-毛毯" type="button" onClick={() => { setActiveScene("客厅-毛毯"); update({ customPrompt: "客厅-毛毯 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "客厅-毛毯" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>客厅-毛毯</button>
                    <button key="礼品展示-圣诞装饰" type="button" onClick={() => { setActiveScene("礼品展示-圣诞装饰"); update({ customPrompt: "礼品展示-圣诞装饰 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "礼品展示-圣诞装饰" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>礼品展示-圣诞装饰</button>
                    <button key="展台-海绵" type="button" onClick={() => { setActiveScene("展台-海绵"); update({ customPrompt: "展台-海绵 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "展台-海绵" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>展台-海绵</button>
                    <button key="餐桌-茶壶" type="button" onClick={() => { setActiveScene("餐桌-茶壶"); update({ customPrompt: "餐桌-茶壶 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "餐桌-茶壶" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>餐桌-茶壶</button>
                    <button key="窗边-陶瓷壶" type="button" onClick={() => { setActiveScene("窗边-陶瓷壶"); update({ customPrompt: "窗边-陶瓷壶 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "窗边-陶瓷壶" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>窗边-陶瓷壶</button>
                    <button key="窗边-首饰架" type="button" onClick={() => { setActiveScene("窗边-首饰架"); update({ customPrompt: "窗边-首饰架 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "窗边-首饰架" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>窗边-首饰架</button>
                    <button key="厨房-置物架" type="button" onClick={() => { setActiveScene("厨房-置物架"); update({ customPrompt: "厨房-置物架 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "厨房-置物架" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>厨房-置物架</button>
                    <button key="厨房-餐车" type="button" onClick={() => { setActiveScene("厨房-餐车"); update({ customPrompt: "厨房-餐车 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "厨房-餐车" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>厨房-餐车</button>
                    <button key="节日场景-万圣节装饰" type="button" onClick={() => { setActiveScene("节日场景-万圣节装饰"); update({ customPrompt: "节日场景-万圣节装饰 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "节日场景-万圣节装饰" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>节日场景-万圣节装饰</button>
                    <button key="节日装饰-鬼魂装饰" type="button" onClick={() => { setActiveScene("节日装饰-鬼魂装饰"); update({ customPrompt: "节日装饰-鬼魂装饰 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "节日装饰-鬼魂装饰" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>节日装饰-鬼魂装饰</button>
                    <button key="节日场景-蜡烛" type="button" onClick={() => { setActiveScene("节日场景-蜡烛"); update({ customPrompt: "节日场景-蜡烛 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "节日场景-蜡烛" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>节日场景-蜡烛</button>
                    <button key="洗衣房-洗衣篮" type="button" onClick={() => { setActiveScene("洗衣房-洗衣篮"); update({ customPrompt: "洗衣房-洗衣篮 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "洗衣房-洗衣篮" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>洗衣房-洗衣篮</button>
                    <button key="客厅-垃圾桶" type="button" onClick={() => { setActiveScene("客厅-垃圾桶"); update({ customPrompt: "客厅-垃圾桶 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "客厅-垃圾桶" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>客厅-垃圾桶</button>
                    <button key="节日场景-圣诞气球" type="button" onClick={() => { setActiveScene("节日场景-圣诞气球"); update({ customPrompt: "节日场景-圣诞气球 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "节日场景-圣诞气球" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>节日场景-圣诞气球</button>
                    <button key="桌面-充电器" type="button" onClick={() => { setActiveScene("桌面-充电器"); update({ customPrompt: "桌面-充电器 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "桌面-充电器" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>桌面-充电器</button>
                    <button key="厨房-垃圾桶" type="button" onClick={() => { setActiveScene("厨房-垃圾桶"); update({ customPrompt: "厨房-垃圾桶 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "厨房-垃圾桶" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>厨房-垃圾桶</button>
                    <button key="纯色背景-支架" type="button" onClick={() => { setActiveScene("纯色背景-支架"); update({ customPrompt: "纯色背景-支架 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "纯色背景-支架" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>纯色背景-支架</button>
                    <button key="客厅-充电器" type="button" onClick={() => { setActiveScene("客厅-充电器"); update({ customPrompt: "客厅-充电器 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "客厅-充电器" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>客厅-充电器</button>
                    <button key="客厅-收纳筐" type="button" onClick={() => { setActiveScene("客厅-收纳筐"); update({ customPrompt: "客厅-收纳筐 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "客厅-收纳筐" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>客厅-收纳筐</button>
                    <button key="书房-储物篮" type="button" onClick={() => { setActiveScene("书房-储物篮"); update({ customPrompt: "书房-储物篮 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "书房-储物篮" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>书房-储物篮</button>
                    <button key="桌面-托盘" type="button" onClick={() => { setActiveScene("桌面-托盘"); update({ customPrompt: "桌面-托盘 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "桌面-托盘" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>桌面-托盘</button>
                    <button key="厨房-厨房用具" type="button" onClick={() => { setActiveScene("厨房-厨房用具"); update({ customPrompt: "厨房-厨房用具 场景，商品居中，光影自然，商业产品摄影" }); }} className={cn("rounded-md border px-2 py-1 text-[11px] leading-4", activeScene === "厨房-厨房用具" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/60")}>厨房-厨房用具</button>
                    </div>
                </section>
            </div>
            <WatermarkGroupPanel />
        </div>
    );
}

export default SceneWorkspace;

/* ==== 场景裂变 PRODUCT_SCENE（TASK-024）：实现在 scene-fission.tsx，入口统一收在 scene.tsx ==== */
export { ProductSceneWorkspace } from "./scene-fission";

/* ================================================================== *
 * 场景裂变链接 FISSION_LINK（TASK-035）
 * 规格 §2：输入只有 imageUrl（粘贴链接 / 本地上传二选一）+ outputNum；
 * 规格 §3：数量 = 请求扇出，每张一次真实请求，失败格不补造、可单格重试。
 * 与 NEW_REPLACE_BG_V2 / PRODUCT_SCENE 无共享状态，只共享 scene 布局。
 * ================================================================== */

import { describeToolExecution } from "@/services/api/tools/gateway";
import {
    FISSION_LINK_OUTPUT_FALLBACK,
    FISSION_LINK_TOOL_ID,
    FISSION_LINK_TITLE,
    FISSION_LINK_UPLOAD_CONSTRAINTS,
    buildFissionLinkSnapshot,
    createFissionLinkState,
    fissionLinkOutputOptions,
    fissionLinkPlan,
    fissionLinkSnapshotHash,
    fissionLinkSourceKey,
    fissionLinkSubmitLabel,
    inspectFissionLinkSource,
    parseFissionLinkDraft,
    serializeFissionLinkDraft,
    validateFissionLinkSubmit,
    type FissionLinkPreviewState,
    type FissionLinkSnapshot,
    type FissionLinkState,
} from "@/features/tools/registry/fission-link";
import {
    buildFissionLinkUnit,
    createFissionLinkRunPort,
    fissionLinkFailedRun,
    fissionLinkResultView,
    fissionLinkRunFromTask,
    fissionLinkStatusText,
    runFissionLinkUnit,
    toFissionLinkReference,
    type FissionLinkGatewayLike,
    type FissionLinkRun,
    type FissionLinkUnit,
} from "@/features/tools/adapters/fission-link";

export type FissionLinkWorkspaceProps = {
    className?: string;
    /** 测试注入的执行端口；默认走共享任务网关（真实 provider 请求）。 */
    port?: FissionLinkGatewayLike;
};

const FISSION_LINK_EMPTY_CELL_TEXT = "等待提交";

function fissionLinkCellText(run: FissionLinkRun | undefined): string {
    if (!run) return FISSION_LINK_EMPTY_CELL_TEXT;
    if (run.status === "succeeded") return "已完成";
    if (run.status === "failed") return run.error?.message ?? "失败";
    if (run.status === "cancelled") return "已取消（上游可能仍在计费）";
    return run.error?.message ?? "上游状态未知";
}

export function FissionLinkWorkspace({ className, port }: FissionLinkWorkspaceProps = {}) {
    const hydrate = useToolDraftStore((store) => store.hydrate);
    const patchDraft = useToolDraftStore((store) => store.patch);
    const draft = useToolDraftStore((store) => store.drafts[FISSION_LINK_TOOL_ID]);

    const [state, setState] = useState<FissionLinkState>(() => createFissionLinkState());
    const [asset, setAsset] = useState<ToolAssetRecord | null>(null);
    const [preview, setPreview] = useState<FissionLinkPreviewState>("idle");
    const [runs, setRuns] = useState<(FissionLinkRun | undefined)[]>([]);
    const [lockedHash, setLockedHash] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    /** 右栏页签：原站「生成结果 / 优秀案例 / 历史记录」。 */
    const [resultTab, setResultTab] = useState<Design19TabId>("result");
    const [actionPending, setActionPending] = useState("");
    /** 动作真实回执（含失败原因），不伪造成功。 */
    const [actionNotice, setActionNotice] = useState("");
    /** 历史恢复回执：说明结果来自哪条已落盘真实任务（不重发请求）。 */
    const [restoredNotice, setRestoredNotice] = useState("");
    const abortRef = useRef<AbortController | null>(null);
    const hydratedRef = useRef(false);
    const autoRestoredRef = useRef(false);
    const storedTasks = useToolTaskStore((store) => store.tasks);
    const hydrateTasks = useToolTaskStore((store) => store.hydrate);

    const inspection = useMemo(() => inspectFissionLinkSource(state.imageUrl), [state.imageUrl]);
    const previewUrl = asset?.url ?? (inspection.kind === "invalid" ? "" : inspection.value);

    /** 草稿只恢复输入，不恢复“预览已就绪”（规格 §5）。 */
    useEffect(() => {
        if (hydratedRef.current) return;
        hydratedRef.current = true;
        void hydrate(FISSION_LINK_TOOL_ID);
        const restored = parseFissionLinkDraft(draft?.values);
        if (restored.imageUrl || restored.outputNum !== FISSION_LINK_OUTPUT_FALLBACK) {
            setState(restored);
        }
    }, [hydrate, draft?.values]);

    const updateState = useCallback(
        (next: Partial<FissionLinkState>) => {
            setState((current) => {
                const merged = { ...current, ...next };
                patchDraft(FISSION_LINK_TOOL_ID, { values: { ...serializeFissionLinkDraft(merged) } });
                return merged;
            });
            setError("");
        },
        [patchDraft],
    );

    const executable = useMemo(() => describeToolExecution(FISSION_LINK_TOOL_ID).executable, []);
    const issues = useMemo(
        () => validateFissionLinkSubmit({ state, preview, executable }),
        [state, preview, executable],
    );
    const plan = fissionLinkPlan({ outputNum: state.outputNum });
    const options = fissionLinkOutputOptions();
    const canSubmit = !busy && issues.length === 0;

    /** 当前配置的指纹：用于判断结果是否已“变旧”（换图/改数量后旧结果不能充新）。 */
    const currentHash = useMemo(
        () =>
            fissionLinkSnapshotHash({
                sourceUrl: asset ? `asset:${asset.id}` : inspection.value,
                sourceAssetId: asset?.id ?? "",
                sourceWidth: asset?.width ?? 0,
                sourceHeight: asset?.height ?? 0,
                outputNum: state.outputNum,
                version: 1,
            }),
        [asset, inspection.value, state.outputNum],
    );

    const pickAsset = useCallback(
        (records: ToolAssetRecord[]) => {
            const record = records[0] ?? null;
            setAsset(record);
            if (record) {
                setState((current) => {
                    const merged = { ...current, imageUrl: `asset:${record.id}` };
                    patchDraft(FISSION_LINK_TOOL_ID, { values: { ...serializeFissionLinkDraft(merged) } });
                    return merged;
                });
                setPreview("ready");
            } else {
                setPreview("idle");
            }
            setError("");
        },
        [patchDraft],
    );

    const resolveSource = useCallback(async () => {
        if (asset) {
            const { imageToDataUrl } = await import("@/services/image-storage");
            /**
             * 真实缺陷修复（2026-10-29 真机复现）：刷新页面后草稿里的资产还在，但 IndexedDB 字节可能已经不在，
             * `imageToDataUrl` 会一直挂起 —— 界面永远停在「正在生成：已返回 0/1 张」，且一个上游请求都没发。
             * 这里加超时兜底：读不到字节就回退到资产自身 URL，让提交要么带真实地址继续，要么立刻报错。
             */
            const dataUrl = await Promise.race<string | undefined>([
                imageToDataUrl({ storageKey: asset.storageKey, url: asset.url }),
                new Promise<undefined>((resolve) => {
                    setTimeout(() => resolve(undefined), 8000);
                }),
            ]);
            return { asset, url: asset.url ?? dataUrl, dataUrl };
        }
        return { asset: null, url: inspection.value, dataUrl: undefined };
    }, [asset, inspection.value]);

    /**
     * 历史恢复（本地持久化 → 结果格），不重发任何请求：
     *  - 任务本身由 `useToolTaskStore` 落盘（字节在 IndexedDB），刷新后仍可取回；
     *  - 结果 URL 必须按 `storageKey` 重建（旧 blob URL 早就失效），否则「看着成功却点不动」；
     *  - 恢复出来的格子沿用同一套下载 / 存资产 / 发画布动作。
     */
    const runFromStoredTask = useCallback(async (task: ToolTask): Promise<FissionLinkRun | null> => {
        const item = (task.result?.items ?? []).find(
            (entry) => entry.kind === "image" && (entry.storageKey || entry.dataUrl || entry.url),
        );
        if (!item) return null;
        const url = item.storageKey ? await resolveMediaUrl(item.storageKey, item.url ?? "") : item.url;
        if (!url && !item.dataUrl) return null;
        return {
            unitId: `restored-${task.id}`,
            index: 0,
            snapshotHash: task.fingerprint ?? "",
            task,
            image: { url: url ?? item.url, dataUrl: item.dataUrl },
            status:
                task.status === "succeeded"
                    ? "succeeded"
                    : task.status === "failed"
                      ? "failed"
                      : task.status === "cancelled"
                        ? "cancelled"
                        : "unknown",
            ...(task.error ? { error: { code: task.error.code, message: task.error.message } } : {}),
        };
    }, []);

    const applyStoredTask = useCallback(
        async (task: ToolTask, label: string) => {
            const restored = await runFromStoredTask(task);
            if (!restored) return false;
            setRuns([restored]);
            setActionNotice("");
            setRestoredNotice(
                `已从本地持久化恢复${label}（${new Date(task.updatedAt).toLocaleString()} 提交，状态 ${task.status}，任务 ${task.id}）：结果可下载 / 存入资产库 / 发送画布。`,
            );
            return true;
        },
        [runFromStoredTask],
    );

    /** 挂载时先 hydrate 落盘快照（与提交链路同一 store）。 */
    useEffect(() => {
        hydrateTasks();
    }, [hydrateTasks]);

    /** 刷新后没有本次会话结果时，自动回填最近一条已落盘的真实成功任务（只读，不伪造）。 */
    useEffect(() => {
        if (autoRestoredRef.current || port || busy || runs.length > 0) return;
        const latest = Object.values(storedTasks)
            .filter(
                (task) =>
                    task.toolId === FISSION_LINK_TOOL_ID &&
                    task.status === "succeeded" &&
                    (task.result?.items ?? []).some(
                        (item) => item.kind === "image" && (item.storageKey || item.dataUrl || item.url),
                    ),
            )
            .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
        if (!latest) return;
        autoRestoredRef.current = true;
        void applyStoredTask(latest, "上次真实任务");
    }, [storedTasks, port, busy, runs.length, applyStoredTask]);

    const runCells = useCallback(
        async (indices: readonly number[]) => {
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            setBusy(true);
            setError("");
            setRestoredNotice("");

            let units: FissionLinkUnit[] = [];
            try {
                const execution = port ?? (await createFissionLinkRunPort());
                const source = await resolveSource();
                if (!source.url) throw new Error("参考图没有可用地址，请重新粘贴链接或上传");
                const snapshot: FissionLinkSnapshot = buildFissionLinkSnapshot({
                    sourceKind: source.asset ? "asset" : inspection.kind,
                    sourceUrl: source.url,
                    sourceAssetId: source.asset?.id ?? "",
                    sourceName: source.asset?.name ?? "链接参考图",
                    sourceWidth: source.asset?.width ?? 0,
                    sourceHeight: source.asset?.height ?? 0,
                    outputNum: state.outputNum,
                    draftRevision: draft?.revision ?? null,
                    clientOperationId: crypto.randomUUID(),
                });
                const reference = toFissionLinkReference({
                    id: source.asset?.id ?? "fission-link-source",
                    name: snapshot.sourceName || "source.png",
                    url: source.url,
                    dataUrl: source.dataUrl,
                });
                units = indices.map((index) =>
                    buildFissionLinkUnit({ snapshot, source: reference, index, total: snapshot.outputNum }),
                );
                setLockedHash(fissionLinkSnapshotHash(snapshot));
            } catch (cause) {
                setBusy(false);
                setError(cause instanceof Error ? cause.message : "参考图不可用");
                return;
            }

            setRuns((current) =>
                Array.from({ length: state.outputNum }, (_, index) => (indices.includes(index) ? undefined : current[index])),
            );

            await Promise.all(
                units.map(async (unit) => {
                    try {
                        const run = await runFissionLinkUnit(unit, {
                            port: port ?? (await createFissionLinkRunPort()),
                            signal: controller.signal,
                            draftRevision: draft?.revision ?? null,
                            onTask: (task) => {
                                const pending = fissionLinkRunFromTask(unit, task);
                                setRuns((current) => {
                                    const next = [...current];
                                    next[unit.index] = pending;
                                    return next;
                                });
                            },
                        });
                        setRuns((current) => {
                            const next = [...current];
                            next[unit.index] = run;
                            return next;
                        });
                    } catch (cause) {
                        const failed = fissionLinkFailedRun(unit, cause);
                        setRuns((current) => {
                            const next = [...current];
                            next[unit.index] = failed;
                            return next;
                        });
                    }
                }),
            );

            setBusy(false);
        },
        [port, resolveSource, inspection.kind, state.outputNum, draft?.revision],
    );

    const submit = useCallback(() => {
        if (!canSubmit) {
            setError(issues[0]?.message ?? "还不能提交");
            return;
        }
        void runCells(Array.from({ length: state.outputNum }, (_, index) => index));
    }, [canSubmit, issues, runCells, state.outputNum]);

    const retryCell = useCallback(
        (index: number) => {
            if (busy) return;
            void runCells([index]);
        },
        [busy, runCells],
    );

    /**
     * 单张结果的三个真实动作。
     *
     * 规格要求「下载 / 存入资产库 / 发送到画布」都是真实副作用：这里复用 ToolResult 同一套
     * 动作实现（file-saver / image-storage + asset-store / canvas-store），不另造链路，
     * 也不在任何一步失败时谎报成功。pending 用 `${action}-${index}` 精确到单张。
     */
    const runCellAction = useCallback(
        async (action: "download" | "save" | "canvas", index: number) => {
            const image = runs[index]?.image;
            if (!image?.url && !image?.dataUrl) return;
            const key = `${action}-${index}`;
            setActionPending(key);
            setActionNotice("");
            const item = {
                id: `fission-link-${index}`,
                kind: "image" as const,
                url: image.url,
                dataUrl: image.dataUrl,
                mimeType: "image/png",
            };
            try {
                if (action === "download") {
                    const fileName = await downloadResultItem(item, index, { toolId: FISSION_LINK_TOOL_ID });
                    setActionNotice(`已下载第 ${index + 1} 张：${fileName}`);
                } else if (action === "save") {
                    const saved = await saveResultItemToAssets(item, index, {
                        toolId: FISSION_LINK_TOOL_ID,
                        title: `${FISSION_LINK_TITLE} 第 ${index + 1} 张`,
                        source: "场景裂变",
                    });
                    setActionNotice(`已存入资产库（${saved.assetId}）`);
                } else {
                    const sent = await sendResultItemToCanvas(item, {
                        toolId: FISSION_LINK_TOOL_ID,
                        projectTitle: `${FISSION_LINK_TITLE} 结果`,
                    });
                    setActionNotice(`已发送到画布（${sent.projectId}）`);
                }
            } catch (cause) {
                setActionNotice(cause instanceof Error ? cause.message : "操作失败");
            } finally {
                setActionPending("");
            }
        },
        [runs],
    );

    const cancel = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        setBusy(false);
    }, []);

    const view = useMemo(
        () => fissionLinkResultView({ runs, requested: state.outputNum, running: busy }),
        [runs, state.outputNum, busy],
    );

    return (
        <div
            data-testid="fission-link-workspace"
            className={cn("flex h-full min-h-0 overflow-hidden bg-card text-foreground", className)}
        >
            <Design19LeftColumn data-testid="fission-link-config">
                <h2 className="text-sm font-medium">{FISSION_LINK_TITLE}</h2>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    粘贴一张商品/场景图的链接，或直接上传；数量 = 每张一次真实请求。
                </p>

                <label className="mt-3 block text-[11px] font-medium" htmlFor="fission-link-url">
                    参考图链接
                </label>
                <textarea
                    id="fission-link-url"
                    data-testid="fission-link-url"
                    value={state.imageUrl.startsWith("asset:") ? "" : state.imageUrl}
                    disabled={busy}
                    rows={2}
                    placeholder="https://example.com/product.png"
                    onChange={(event) => {
                        setAsset(null);
                        setPreview(event.target.value.trim() ? "loading" : "idle");
                        updateState({ imageUrl: event.target.value });
                    }}
                    className="mt-1 w-full rounded-md border border-stone-300 bg-card p-2 text-xs outline-none focus:border-stone-500 dark:border-stone-700 dark:bg-stone-900"
                />

                {previewUrl ? (
                    <div className="mt-2 flex items-center gap-2">
                        <img
                            src={previewUrl}
                            alt="参考图预览"
                            data-testid="fission-link-preview"
                            data-state={preview}
                            onLoad={() => setPreview("ready")}
                            onError={() => setPreview("error")}
                            className="h-16 w-16 rounded border border-stone-200 object-cover dark:border-stone-700"
                        />
                        <span className="text-[11px] text-muted-foreground">
                            {preview === "ready" ? "预览已就绪" : preview === "error" ? "加载失败" : "加载中…"}
                        </span>
                    </div>
                ) : null}

                <div className="mt-3">
                    <ToolAssetInput
                        toolId={FISSION_LINK_TOOL_ID}
                        constraints={FISSION_LINK_UPLOAD_CONSTRAINTS}
                        maxCount={1}
                        disabled={busy}
                        title="或上传本地参考图"
                        onChange={(_ids, records) => pickAsset(records)}
                    />
                </div>

                <div className="mt-3">
                    <span className="text-[11px] font-medium">裂变数量</span>
                    <div data-testid="fission-link-output" className="mt-1 flex gap-1">
                        {options.map((count) => (
                            <button
                                key={count}
                                type="button"
                                disabled={busy}
                                aria-pressed={state.outputNum === count}
                                onClick={() => updateState({ outputNum: count })}
                                className={[
                                    "h-7 w-9 rounded border text-xs",
                                    state.outputNum === count
                                        ? "border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900"
                                        : "border-stone-300 text-stone-700 dark:border-stone-700 dark:text-stone-300",
                                ].join(" ")}
                            >
                                {count}
                            </button>
                        ))}
                    </div>
                    <p data-testid="fission-link-plan" className="mt-1 text-[11px] text-muted-foreground">
                        {plan.label}
                    </p>
                </div>

                {issues.length > 0 ? (
                    <ul data-testid="fission-link-issues" className="mt-2 space-y-1">
                        {issues.map((issue) => (
                            <li key={issue.code} className="text-[11px] text-amber-700 dark:text-amber-400">
                                {issue.message}
                            </li>
                        ))}
                    </ul>
                ) : null}

                {error ? (
                    <p data-testid="fission-link-error" className="mt-2 text-[11px] text-red-600 dark:text-red-400">
                        {error}
                    </p>
                ) : null}

                <div className="mt-3 flex gap-2">
                    <button
                        type="button"
                        data-testid="fission-link-submit"
                        disabled={!canSubmit}
                        onClick={submit}
                        className="h-8 flex-1 rounded-md bg-stone-900 text-xs text-white disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900"
                    >
                        {fissionLinkSubmitLabel(state, busy)}
                    </button>
                    {busy ? (
                        <button
                            type="button"
                            onClick={cancel}
                            className="h-8 rounded-md border border-stone-300 px-3 text-xs dark:border-stone-700"
                        >
                            取消
                        </button>
                    ) : null}
                </div>
            </Design19LeftColumn>

            <Design19Results
                tabs={[
                    { id: "result", label: "生成结果" },
                    { id: "case", label: "优秀案例" },
                ]}
                extraTab={{ id: "history", label: "历史记录" }}
                active={resultTab}
                onTabChange={setResultTab}
            >
                <div data-testid="fission-link-result" className="contents">
                <span data-testid="fission-link-result-status" className="sr-only">
                    {fissionLinkStatusText(view)}
                </span>
                {resultTab !== "result" ? (
                    <div className="min-h-0 flex-1 overflow-auto p-4">
                        {resultTab === "case" ? (
                            <p className="rounded-lg bg-card px-4 py-8 text-center text-xs text-muted-foreground">
                                原站该工具没有公开的优秀案例，本地不伪造案例数据。
                            </p>
                        ) : (
                            <ToolTaskHistory
                                toolId={FISSION_LINK_TOOL_ID}
                                emptyHint="还没有历史任务；提交一次后会在这里留下任务与结果。"
                                onSelectTask={(historyTask) => {
                                    void applyStoredTask(historyTask, "历史任务").then((restored) => {
                                        if (restored) setResultTab("result");
                                    });
                                }}
                            />
                        )}
                    </div>
                ) : null}
                <div className={resultTab === "result" ? "min-h-0 flex-1 overflow-auto p-4" : "hidden"}>
                {lockedHash && lockedHash !== currentHash ? (
                    <p data-testid="fission-link-stale" className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                        参数已改动，下面这些结果是上一次配置生成的，需要重新提交
                    </p>
                ) : null}
                {actionNotice ? (
                    <p data-testid="fission-link-action-notice" className="mt-1 text-[11px] text-stone-600 dark:text-stone-300">
                        {actionNotice}
                    </p>
                ) : null}
                {restoredNotice ? (
                    <p data-testid="fission-link-restored-task" className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                        {restoredNotice}
                    </p>
                ) : null}

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {Array.from({ length: Math.max(state.outputNum, runs.length) }, (_, index) => {
                        const run = runs[index];
                        const image = run?.image;
                        return (
                            <div
                                key={index}
                                data-testid={`fission-link-cell-${index + 1}`}
                                className="rounded border border-stone-200 p-2 dark:border-stone-800"
                            >
                                <p className="text-[11px] text-muted-foreground">第 {index + 1} 张</p>
                                {image?.url || image?.dataUrl ? (
                                    <img
                                        src={image.url ?? image.dataUrl}
                                        alt={`裂变结果 ${index + 1}`}
                                        className="mt-1 aspect-square w-full rounded object-cover"
                                    />
                                ) : (
                                    <div className="mt-1 flex aspect-square w-full items-center justify-center rounded bg-stone-100 text-[11px] text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                                        {fissionLinkCellText(run)}
                                    </div>
                                )}
                                <p className="mt-1 truncate text-[11px] text-muted-foreground">{fissionLinkCellText(run)}</p>
                                {image?.url || image?.dataUrl ? (
                                    <div className="mt-1 space-y-1" data-testid={`fission-link-actions-${index + 1}`}>
                                        <button
                                            type="button"
                                            disabled={Boolean(actionPending)}
                                            onClick={() => void runCellAction("download", index)}
                                            data-testid={`fission-link-download-${index + 1}`}
                                            className="w-full rounded border border-stone-300 py-1 text-[11px] disabled:opacity-60 dark:border-stone-700"
                                        >
                                            {actionPending === `download-${index}` ? "下载中…" : "下载"}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={Boolean(actionPending)}
                                            onClick={() => void runCellAction("save", index)}
                                            data-testid={`fission-link-save-${index + 1}`}
                                            className="w-full rounded border border-stone-300 py-1 text-[11px] disabled:opacity-60 dark:border-stone-700"
                                        >
                                            {actionPending === `save-${index}` ? "保存中…" : "存入资产库"}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={Boolean(actionPending)}
                                            onClick={() => void runCellAction("canvas", index)}
                                            data-testid={`fission-link-canvas-${index + 1}`}
                                            className="w-full rounded border border-stone-300 py-1 text-[11px] disabled:opacity-60 dark:border-stone-700"
                                        >
                                            {actionPending === `canvas-${index}` ? "发送中…" : "发送到画布"}
                                        </button>
                                    </div>
                                ) : null}
                                {run?.status === "failed" ? (
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => retryCell(index)}
                                        className="mt-1 w-full rounded border border-stone-300 py-1 text-[11px] dark:border-stone-700"
                                    >
                                        只重试这一张
                                    </button>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
                </div>
                </div>
            </Design19Results>
        </div>
    );
}

/* ================================================================== *
 * 场景迁移 SCENE_TRANSFER（TASK-033）
 * 规格 §2：输入 = 商品图 + 场景风格参考图 + 商品分割图 + 相似度；
 * 规格 §3：相似度滑杆实时更新约束强度，任一必填图缺失禁用生成；
 * 规格 §5：提交失败/部分失败/刷新恢复都如实展示，不伪造成功。
 * 与 NEW_REPLACE_BG_V2 / PRODUCT_SCENE / FISSION_LINK 无共享状态，只共享 scene 布局。
 * ================================================================== */

import { cn } from "@/lib/utils";
import {
    SCENE_TRANSFER_SIMILARITY,
    SCENE_TRANSFER_SIMILARITY_PRESETS,
    SCENE_TRANSFER_SOURCE_LIMITS,
    SCENE_TRANSFER_TOOL_ID,
    SCENE_TRANSFER_TITLE,
    SCENE_TRANSFER_VALUES_SLOT,
    SCENE_TRANSFER_SNAPSHOT_SLOT,
    DEFAULT_SCENE_TRANSFER_VALUES,
    clampSimilarity,
    createSceneTransferSnapshot,
    describeTransferPlan,
    describeTransferSource,
    readSceneTransferValues,
    resolveTransferSegmentation,
    restoreSceneTransferSnapshot,
    serializeSceneTransferValues,
    similarityLabel,
    validateSceneTransferState,
    type SceneTransferSnapshot,
    type SceneTransferValues,
} from "@/features/tools/registry/scene-transfer";
import {
    runSceneTransfer,
    sceneTransferResultFromTask,
    summarizeTransferExecution,
    transferImageRef,
    type SceneTransferAsset,
    type SceneTransferGateway,
} from "@/features/tools/adapters/scene-transfer";

export type SceneTransferWorkspaceProps = {
    className?: string;
    toolId?: string;
    /** 测试注入的执行端口；默认走共享任务网关（真实 provider 请求）。 */
    port?: SceneTransferGateway;
};

function transferAssetFromRecord(record: {
    id: string;
    name: string;
    mimeType: string;
    url: string;
    storageKey?: string;
    width?: number;
    height?: number;
    bytes?: number;
}): SceneTransferAsset {
    return {
        assetId: record.id,
        id: record.id,
        name: record.name,
        type: record.mimeType,
        mimeType: record.mimeType,
        url: record.url,
        storageKey: record.storageKey,
        width: record.width,
        height: record.height,
        bytes: record.bytes,
    };
}

export function SceneTransferWorkspace({ className, toolId = SCENE_TRANSFER_TOOL_ID, port }: SceneTransferWorkspaceProps) {
    const hydrate = useToolDraftStore((store) => store.hydrate);
    const patchDraft = useToolDraftStore((store) => store.patch);
    const draft = useToolDraftStore((store) => store.drafts[toolId]);
    const imageModel = useConfigStore((state) => state.config.imageModel);

    const [values, setValues] = useState<SceneTransferValues>(() => ({ ...DEFAULT_SCENE_TRANSFER_VALUES }));
    const [product, setProduct] = useState<SceneTransferAsset | null>(null);
    const [style, setStyle] = useState<SceneTransferAsset | null>(null);
    const [seg, setSeg] = useState<SceneTransferAsset | null>(null);
    const [restoring, setRestoring] = useState(false);
    const [lostAssets, setLostAssets] = useState<string[]>([]);
    const [task, setTask] = useState<ToolTask | undefined>();
    const [snapshot, setSnapshot] = useState<SceneTransferSnapshot | undefined>();
    /** 右栏页签：原站「生成结果 / 优秀案例 / 历史记录」。 */
    const [resultTab, setResultTab] = useState<Design19TabId>("result");
    const [running, setRunning] = useState(false);
    const [error, setError] = useState("");
    const hydratedRef = useRef(false);
    const abortRef = useRef<AbortController | null>(null);
    /** 任务落库（G1）：刷新后从 localStorage/IndexedDB 取回任务与结果字节。 */
    const storedTasks = useToolTaskStore((store) => store.tasks);
    const upsertStoredTask = useToolTaskStore((store) => store.upsertTask);
    const hydrateTasks = useToolTaskStore((store) => store.hydrate);

    /** 草稿只恢复输入与资产引用；资产解析不到就明确标“丢失”，不假装已恢复。 */
    useEffect(() => {
        if (hydratedRef.current) return;
        hydratedRef.current = true;
        void hydrate(toolId);
        const restored = readSceneTransferValues(draft?.values?.[SCENE_TRANSFER_VALUES_SLOT] as Record<string, unknown> | undefined);
        setValues(restored);
        const ids = [restored.imageUrl, restored.imageStyleUrl, restored.segImageUrl].filter((id) => id && !/^(https?:|data:|blob:)/.test(id));
        if (!ids.length) return;
        setRestoring(true);
        void (async () => {
            try {
                const { records } = await loadToolAssetRecords(ids);
                const byId = new Map(records.map((record) => [record.id, record]));
                const missing: string[] = [];
                const pick = (id: string) => (id ? byId.get(id) : undefined);
                const productRecord = pick(restored.imageUrl);
                const styleRecord = pick(restored.imageStyleUrl);
                const segRecord = pick(restored.segImageUrl);
                if (productRecord) setProduct(transferAssetFromRecord(productRecord));
                else if (restored.imageUrl && !/^(https?:|data:|blob:)/.test(restored.imageUrl)) missing.push("商品图");
                if (styleRecord) setStyle(transferAssetFromRecord(styleRecord));
                else if (restored.imageStyleUrl && !/^(https?:|data:|blob:)/.test(restored.imageStyleUrl)) missing.push("场景风格参考图");
                if (segRecord) setSeg(transferAssetFromRecord(segRecord));
                else if (restored.segImageUrl && !/^(https?:|data:|blob:)/.test(restored.segImageUrl)) missing.push("商品分割图");
                setLostAssets(missing);
            } finally {
                setRestoring(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hydrate, toolId]);

    /**
     * G1 刷新恢复：任务本身落 `useToolTaskStore`（localStorage + IndexedDB 产物字节），
     * 挂载时 hydrate 一次；刷新后即使组件 state 清空，也能从持久化任务里把结果取回来。
     */
    useEffect(() => {
        hydrateTasks();
    }, [hydrateTasks]);

    /** 本次会话没有新任务时，回落到最近一条已持久化的同工具任务（不伪造、只读回填）。 */
    const storedTask = useMemo(() => {
        if (port) return undefined;
        return Object.values(storedTasks)
            .filter((item) => item.toolId === toolId)
            .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
    }, [storedTasks, port, toolId]);

    const activeTask = task ?? storedTask;

    /** 提交快照写进草稿：刷新后「本次提交快照」不空，且能提示输入是否已漂移。 */
    const snapshotRestoredRef = useRef(false);
    useEffect(() => {
        if (snapshotRestoredRef.current || snapshot) return;
        const restored = restoreSceneTransferSnapshot(draft?.values?.[SCENE_TRANSFER_SNAPSHOT_SLOT]);
        if (!restored) return;
        snapshotRestoredRef.current = true;
        setSnapshot(restored);
    }, [draft?.values, snapshot]);

    const update = useCallback(
        (next: Partial<SceneTransferValues>) => {
            setValues((current) => {
                const merged = serializeSceneTransferValues({ ...current, ...next });
                patchDraft(toolId, {
                    values: { [SCENE_TRANSFER_VALUES_SLOT]: merged },
                    assetIds: [merged.imageUrl, merged.imageStyleUrl, merged.segImageUrl].filter((id) => id && !/^(https?:|data:|blob:)/.test(id)),
                });
                return merged;
            });
        },
        [patchDraft, toolId],
    );

    const segmentation = useMemo(
        () => resolveTransferSegmentation({ segImageUrl: seg ? (seg.dataUrl ?? "").trim() || (seg.url ?? "").trim() : "" }),
        [seg],
    );

    const descriptor = useMemo(() => describeToolExecution(SCENE_TRANSFER_TOOL_ID), []);
    const execution = useMemo(() => summarizeTransferExecution(descriptor), [descriptor]);

    const issues = useMemo(
        () =>
            validateSceneTransferState({
                values,
                productReady: Boolean(product),
                styleReady: Boolean(style),
                imageModelReady: Boolean(imageModel?.trim()),
                executable: descriptor.executable,
                segmentation,
            }),
        [values, product, style, imageModel, descriptor.executable, segmentation],
    );

    const blocked = running || issues.length > 0;
    const plan = useMemo(() => describeTransferPlan(values, segmentation), [values, segmentation]);

    const currentSnapshot = useMemo<SceneTransferSnapshot | null>(() => {
        if (!product || !style) return null;
        return createSceneTransferSnapshot({
            values,
            product,
            style,
            segmentation,
            revision: draft?.revision ?? null,
        });
    }, [values, product, style, segmentation, draft?.revision]);

    const view = useMemo(
        () => sceneTransferResultFromTask(activeTask, snapshot, currentSnapshot),
        [activeTask, snapshot, currentSnapshot],
    );

    const submit = useCallback(async () => {
        if (!product || !style || issues.length) return;
        setRunning(true);
        setError("");
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const run = await runSceneTransfer({
                gateway: port ?? getPersistedToolGateway(),
                values,
                product,
                style,
                segAsset: seg,
                imageModelReady: Boolean(imageModel?.trim()),
                descriptor,
                revision: draft?.revision ?? null,
                signal: controller.signal,
                onUpdate: (next) => {
                    setTask(next);
                    if (!port) upsertStoredTask(next);
                },
            });
            setTask(run.task);
            if (!port) upsertStoredTask(run.task);
            setSnapshot(run.snapshot);
            if (run.snapshot) {
                patchDraft(toolId, { values: { [SCENE_TRANSFER_SNAPSHOT_SLOT]: run.snapshot } });
            }
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "提交失败");
        } finally {
            setRunning(false);
            abortRef.current = null;
        }
    }, [product, style, seg, values, issues, port, imageModel, descriptor, draft?.revision, patchDraft, toolId, upsertStoredTask]);

    const cancel = useCallback(() => {
        abortRef.current?.abort();
        const current = activeTask;
        if (current && current.status === "running") {
            const cancelled = (port ?? getPersistedToolGateway()).cancel?.(current.id);
            if (cancelled) {
                setTask(cancelled);
                if (!port) upsertStoredTask(cancelled);
            }
        }
    }, [activeTask, port, upsertStoredTask]);

    return (
        <div className={cn("flex flex-col gap-2.5 lg:flex-row lg:items-start", className)} data-testid="scene-transfer-workspace">
            <Design19LeftColumn data-testid="scene-transfer-config">
                <header>
                    <h2 className="text-sm font-medium" data-testid="scene-transfer-title">{SCENE_TRANSFER_TITLE}</h2>
                    <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                        商品图 + 场景风格参考图，按相似度把商品迁移进参考场景；提交即一次真实图像请求。
                    </p>
                </header>

                {lostAssets.length ? (
                    <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200" data-testid="scene-transfer-lost-assets">
                        草稿里的这些图在本地已找不到，请重新选择：{lostAssets.join("、")}
                    </p>
                ) : null}

                <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-700" data-testid="scene-transfer-product">
                    <h3 className="mb-2 text-xs font-medium">商品图 <span className="text-stone-400">imageUrl</span></h3>
                    <ToolAssetInput
                        toolId={`${toolId}-product`}
                        title="上传商品图"
                        maxCount={1}
                        constraints={SCENE_TRANSFER_SOURCE_LIMITS}
                        disabled={running || restoring}
                        onChange={(_ids, records) => {
                            const record = records[0];
                            setProduct(record ? transferAssetFromRecord(record) : null);
                            update({ imageUrl: record ? transferImageRef(transferAssetFromRecord(record)) || record.id : "" });
                        }}
                    />
                    <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400" data-testid="scene-transfer-product-state">
                        {describeTransferSource(product)}
                    </p>
                </div>

                <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-700" data-testid="scene-transfer-style">
                    <h3 className="mb-2 text-xs font-medium">场景风格参考图 <span className="text-stone-400">imageStyleUrl</span></h3>
                    <ToolAssetInput
                        toolId={`${toolId}-style`}
                        title="上传场景风格参考图"
                        maxCount={1}
                        constraints={SCENE_TRANSFER_SOURCE_LIMITS}
                        disabled={running || restoring}
                        onChange={(_ids, records) => {
                            const record = records[0];
                            setStyle(record ? transferAssetFromRecord(record) : null);
                            update({ imageStyleUrl: record ? transferImageRef(transferAssetFromRecord(record)) || record.id : "" });
                        }}
                    />
                    <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400" data-testid="scene-transfer-style-state">
                        {describeTransferSource(style)}
                    </p>
                </div>

                <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-700" data-testid="scene-transfer-seg">
                    <h3 className="mb-2 text-xs font-medium">商品分割图 <span className="text-stone-400">segImageUrl（可选）</span></h3>
                    <ToolAssetInput
                        toolId={`${toolId}-seg`}
                        title="上传商品分割图"
                        maxCount={1}
                        constraints={SCENE_TRANSFER_SOURCE_LIMITS}
                        disabled={running || restoring}
                        onChange={(_ids, records) => {
                            const record = records[0];
                            setSeg(record ? transferAssetFromRecord(record) : null);
                            update({ segImageUrl: record ? transferImageRef(transferAssetFromRecord(record)) || record.id : "" });
                        }}
                    />
                    <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400" data-testid="scene-transfer-seg-notice">
                        {segmentation.message}
                    </p>
                </div>

                <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-700" data-testid="scene-transfer-similarity">
                    <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-xs font-medium">相似度 <span className="text-stone-400">similarity</span></h3>
                        <span className="text-[11px] font-medium" data-testid="scene-transfer-similarity-value">{clampSimilarity(values.similarity)}%</span>
                    </div>
                    <input
                        type="range"
                        min={SCENE_TRANSFER_SIMILARITY.min}
                        max={SCENE_TRANSFER_SIMILARITY.max}
                        step={SCENE_TRANSFER_SIMILARITY.step}
                        value={clampSimilarity(values.similarity)}
                        disabled={running}
                        aria-label="相似度"
                        data-testid="scene-transfer-similarity-slider"
                        className="w-full accent-stone-900 dark:accent-stone-100"
                        onChange={(event) => update({ similarity: clampSimilarity(event.target.value) })}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                        {SCENE_TRANSFER_SIMILARITY_PRESETS.map((preset) => (
                            <button
                                key={preset.value}
                                type="button"
                                disabled={running}
                                data-testid={`scene-transfer-preset-${preset.value}`}
                                className={cn(
                                    "rounded border px-2 py-1 text-[11px]",
                                    clampSimilarity(values.similarity) === preset.value
                                        ? "border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900"
                                        : "border-stone-300 text-stone-600 dark:border-stone-600 dark:text-stone-300",
                                )}
                                onClick={() => update({ similarity: preset.value })}
                            >
                                {preset.label} {preset.value}%
                            </button>
                        ))}
                    </div>
                    <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400" data-testid="scene-transfer-similarity-label">
                        {similarityLabel(values.similarity)}
                    </p>
                </div>

                <div className="space-y-2">
                    <p className="text-[11px] text-stone-500 dark:text-stone-400" data-testid="scene-transfer-plan">{plan}</p>
                    {execution.notes.map((note) => (
                        <p key={note} className="text-[11px] text-amber-700 dark:text-amber-300" data-testid="scene-transfer-capability-note">{note}</p>
                    ))}
                    {issues.map((issue) => (
                        <p key={`${issue.code}-${issue.field}`} className="text-[11px] text-red-600 dark:text-red-400" data-testid="scene-transfer-issue">
                            {issue.message}
                        </p>
                    ))}
                    {error ? (
                        <p className="text-[11px] text-red-600 dark:text-red-400" data-testid="scene-transfer-error">{error}</p>
                    ) : null}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={blocked}
                            data-testid="scene-transfer-submit"
                            className="rounded bg-stone-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
                            onClick={() => void submit()}
                        >
                            {running ? "生成中…" : "开始迁移"}
                        </button>
                        {running ? (
                            <button
                                type="button"
                                data-testid="scene-transfer-cancel"
                                className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-600 dark:border-stone-600 dark:text-stone-300"
                                onClick={cancel}
                            >
                                取消
                            </button>
                        ) : null}
                    </div>
                </div>
            </Design19LeftColumn>

            <Design19Results
                tabs={[
                    { id: "result", label: "生成结果" },
                    { id: "case", label: "优秀案例" },
                ]}
                extraTab={{ id: "history", label: "历史记录" }}
                active={resultTab}
                onTabChange={setResultTab}
            >
                <div className={resultTab === "result" ? "space-y-3" : "hidden"} data-testid="scene-transfer-result">
                <ToolResult task={activeTask} toolId={toolId} title={`${SCENE_TRANSFER_TITLE}结果`} onCancel={running ? cancel : undefined} onRetry={undefined} />

                {!task && storedTask ? (
                    <p className="text-[11px] text-stone-500 dark:text-stone-400" data-testid="scene-transfer-restored-task">
                        已从本地持久化恢复上次任务（{storedTask.status}）：结果图仍可下载 / 存入资产 / 发送画布。
                    </p>
                ) : null}

                {view.cells.length ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="scene-transfer-cells">
                        {view.cells.map((cell) => (
                            <figure key={cell.index} className="overflow-hidden rounded border border-stone-200 dark:border-stone-700" data-testid={`scene-transfer-cell-${cell.index}`}>
                                {cell.url ? (
                                    <img src={cell.url} alt={`场景迁移结果 ${cell.index + 1}`} className="aspect-square w-full object-cover" />
                                ) : (
                                    <div className="flex aspect-square w-full items-center justify-center bg-stone-100 px-2 text-center text-[11px] text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                                        {cell.message ?? "暂无结果"}
                                    </div>
                                )}
                            </figure>
                        ))}
                    </div>
                ) : null}

                {view.stale ? (
                    <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200" data-testid="scene-transfer-stale">
                        {view.stale}
                    </p>
                ) : null}

                {view.segmentationNotice ? (
                    <p className="text-[11px] text-stone-500 dark:text-stone-400" data-testid="scene-transfer-result-seg-notice">
                        {view.segmentationNotice}
                    </p>
                ) : null}

                <div>
                    <h3 className="mb-1 text-xs font-medium">本次提交快照</h3>
                    {snapshot ? (
                        <pre data-testid="scene-transfer-snapshot" className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-stone-100 p-2 text-[10px] leading-4 text-stone-700 dark:bg-stone-800 dark:text-stone-200">
                            {JSON.stringify(snapshot, null, 2)}
                        </pre>
                    ) : (
                        <p className="text-[11px] text-stone-500 dark:text-stone-400" data-testid="scene-transfer-snapshot-empty">
                            还没有提交过任务；提交后这里会显示锁定的商品图 / 风格图 / 分割图 / 相似度。
                        </p>
                    )}
                </div>
                </div>
                {resultTab === "case" ? (
                    <p className="rounded-lg bg-card px-4 py-8 text-center text-xs text-muted-foreground">
                        原站该工具没有公开的优秀案例，本地不伪造案例数据。
                    </p>
                ) : null}
                {resultTab === "history" ? (
                    <ToolTaskHistory toolId={toolId} emptyHint="还没有历史任务；提交一次后会在这里留下任务与结果。" />
                ) : null}
            </Design19Results>
        </div>
    );
}
