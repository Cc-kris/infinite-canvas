import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Copy, Image as ImageIcon, Info, Lightbulb, RotateCcw, Search, Upload, X } from "lucide-react";

import { ToolResult } from "@/components/tools/tool-result";
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
    SCENE_CUTOUT_MODES,
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
    productBgModeOf,
    productBgScenePrompt,
    type ProductBgMode,
    type ProductBgScene,
} from "@/features/tools/registry/new-replace-bg-v2-scenes";

const GOODS_CONSTRAINTS = resolveToolAssetConstraints({ mimeTypes: [...SCENE_SOURCE_LIMITS.mimeTypes], maxBytes: SCENE_SOURCE_LIMITS.maxBytes });
const MASK_CONSTRAINTS = resolveToolAssetConstraints({ mimeTypes: [...SCENE_MASK_LIMITS.mimeTypes], maxBytes: SCENE_MASK_LIMITS.maxBytes });
const GRADIENT = "bg-[linear-gradient(90deg,#3a7df9,#723cf9)]";

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

/** 场景卡：原站 200×200、12px 圆角，左下商品示意小图，hover 紫边 +「使用此场景」，标题在卡下。 */
function SceneCard({ scene, active, onPick, testId }: { scene: ProductBgScene; active?: boolean; onPick: (scene: ProductBgScene) => void; testId: string }) {
    return (
        <button type="button" data-testid={testId} aria-pressed={active} onClick={() => onPick(scene)} className="group min-w-0 text-left">
            <span className={cn("relative block aspect-square overflow-hidden rounded-[12px] border-2 transition", active ? "border-[#723cf9]" : "border-transparent group-hover:border-[#723cf9]")}>
                <img src={scene.image} alt={scene.title} loading="lazy" className="size-full object-cover" />
                <img src={scene.goods} alt="" loading="lazy" className="absolute bottom-[10px] left-[10px] size-[28%] rounded-[6px] border-2 border-white bg-white object-contain" />
                <span className="absolute left-[8px] top-[8px] hidden items-center gap-1 rounded-[4px] bg-white px-[6px] py-[2px] text-[12px] text-black/85 group-hover:flex">
                    <Copy className="size-3" />
                    使用此场景
                </span>
            </span>
            <span className="mt-[6px] block truncate text-center text-[14px] leading-[22px] text-black/65">{scene.title}</span>
        </button>
    );
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
    const [drawerCategory, setDrawerCategory] = useState<string | null>(null);
    const [drawerQuery, setDrawerQuery] = useState("");
    const [drawerOpen, setDrawerOpen] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const goodsInputRef = useRef<HTMLInputElement | null>(null);
    const maskInputRef = useRef<HTMLInputElement | null>(null);
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
                        setGoodsHasAlpha(await detectAlpha(next.url ?? ""));
                    } else if (record.id === parsed.maskAssetId) setMask(assetFromRecord(record));
                    else if (record.id === parsed.bgAssetId) setBg(assetFromRecord(record));
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

    const currentSnapshot = useMemo(
        () => (isSceneSourceReady(goods) ? createNewReplaceBgSnapshot(values, output, draft?.revision ?? null) : undefined),
        [values, output, goods, draft?.revision],
    );
    const drift = useMemo(() => describeNewReplaceBgDrift(snapshot, currentSnapshot), [snapshot, currentSnapshot]);
    const result = newReplaceBgResultFromTask(task, snapshot, currentSnapshot, drift);

    /** 选中场景：场景图真实入库 → 作为参考图（adapter 的自定义背景 bgAssetId），标题与合成方式写进 customPrompt。 */
    const applyScene = useCallback(
        async (scene: ProductBgScene) => {
            setBusy("正在载入参考图…");
            setNotice("");
            try {
                /* 文件名带 background：adapter 按名称在提示词里把这张点名为「目标背景图」 */
                const record = await uploadCaseFile(scene.image, `linkfox-scene-${scene.id}-background`);
                setBg(assetFromRecord(record));
                setSceneId(scene.id);
                setTask(undefined);
                setSnapshot(undefined);
                update({ sceneType: "custom", templateId: "", bgAssetId: record.id, customPrompt: productBgScenePrompt(scene.title, productBgModeOf(valuesRef.current.customPrompt)) });
                setDrawerOpen(false);
            } catch (error) {
                setNotice(error instanceof Error ? error.message : "参考图载入失败");
            } finally {
                setBusy("");
            }
        },
        [update],
    );

    /** 商品图入库后进入第二步；示例图是原站已抠好的透明图，直接确认抠图（原站不弹抠图）。 */
    const setGoodsRecord = useCallback(
        async (record: ToolAssetRecord, preCut: boolean) => {
            const next = assetFromRecord(record);
            const hasAlpha = await detectAlpha(next.url ?? "");
            setGoods(next);
            setGoodsHasAlpha(hasAlpha);
            setMask(undefined);
            setTask(undefined);
            setSnapshot(undefined);
            update({
                goodsAssetId: next.assetId,
                goodsName: next.name ?? "",
                maskAssetId: "",
                cutoutMode: hasAlpha ? "transparent" : "mask",
                cutoutConfirmed: preCut && hasAlpha,
                transform: { ...DEFAULT_SCENE_TRANSFORM },
            });
            if (pendingScene) {
                const scene = pendingScene;
                setPendingScene(null);
                await applyScene(scene);
            } else if (!valuesRef.current.bgAssetId) setDrawerOpen(true);
        },
        [update, pendingScene, applyScene],
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

    /* 首屏支持粘贴图片（原站「或拖拽/粘贴图片到此处」） */
    useEffect(() => {
        if (goods) return;
        const onPaste = (event: ClipboardEvent) => {
            const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith("image/"));
            if (file) void uploadGoodsFile(file);
        };
        window.addEventListener("paste", onPaste);
        return () => window.removeEventListener("paste", onPaste);
    }, [goods, uploadGoodsFile]);

    const backHome = useCallback(() => {
        setGoods(undefined);
        setMask(undefined);
        setGoodsHasAlpha(false);
        setTask(undefined);
        setSnapshot(undefined);
        setDrawerOpen(false);
        update({ goodsAssetId: "", goodsName: "", maskAssetId: "", cutoutConfirmed: false });
    }, [update]);

    const pickHomeScene = useCallback(
        (scene: ProductBgScene) => {
            /* 原站未上传商品时点「使用此场景」会先要求上传商品图 */
            setPendingScene(scene);
            goodsInputRef.current?.click();
        },
        [],
    );

    const onMaskFile = useCallback(
        async (file: File) => {
            setBusy("正在上传蒙版…");
            try {
                const next = assetFromRecord(await uploadToolAsset(file, { constraints: MASK_CONSTRAINTS }));
                setMask(next);
                update({ cutoutMode: "mask", maskAssetId: next.assetId, cutoutConfirmed: false });
            } catch (error) {
                setNotice(error instanceof Error ? error.message : "蒙版上传失败");
            } finally {
                setBusy("");
            }
        },
        [update],
    );

    const setMode = useCallback(
        (next: ProductBgMode) => {
            const title = /「(.+?)」/.exec(valuesRef.current.customPrompt)?.[1];
            if (title) update({ customPrompt: productBgScenePrompt(title, next) });
        },
        [update],
    );

    const runOptions = () => ({ gateway: getPersistedToolGateway(), values, output, goods: goods!, mask, bg, model: imageModel, goodsHasAlpha, revision: draft?.revision ?? null, onUpdate: setTask });

    const onGenerate = async () => {
        if (!goods) return;
        setRunning(true);
        setRunError(undefined);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const run = await runNewReplaceBg({ ...runOptions(), signal: controller.signal });
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
            const run = await retryNewReplaceBg({ ...runOptions(), taskId: task.id, signal: controller.signal });
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

    /* 画布：商品可拖动（位置写进 transform，随 canvasData 提交） */
    const dragRef = useRef<{ x: number; y: number; sx: number; sy: number; w: number; h: number } | null>(null);
    const onDragStart = (event: React.PointerEvent<HTMLImageElement>) => {
        const board = event.currentTarget.parentElement?.getBoundingClientRect();
        if (!board || running) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { x: values.transform.x, y: values.transform.y, sx: event.clientX, sy: event.clientY, w: board.width, h: board.height };
    };
    const onDragMove = (event: React.PointerEvent<HTMLImageElement>) => {
        const drag = dragRef.current;
        if (!drag) return;
        const x = drag.x + (event.clientX - drag.sx) / drag.w;
        const y = drag.y + (event.clientY - drag.sy) / drag.h;
        const transform = clampSceneTransform({ ...valuesRef.current.transform, x, y });
        valuesRef.current = { ...valuesRef.current, transform };
        setValues(valuesRef.current);
    };
    const onDragEnd = () => {
        if (!dragRef.current) return;
        dragRef.current = null;
        update({});
    };

    const homeScenes = useMemo(() => filterProductBgScenes(category, query), [category, query]);
    const drawerScenes = useMemo(() => filterProductBgScenes(drawerCategory, drawerQuery), [drawerCategory, drawerQuery]);
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

    if (!goods) {
        return (
            <div data-testid="scene-workspace" data-step="home" className={cn("flex h-full min-h-0 flex-col overflow-y-auto bg-[#f4f6f8]", className)}>
                {/* 顶部白卡：左 Upload.Dragger，右原站引导视频 */}
                <section data-testid="scene-goods" className="flex shrink-0 gap-[40px] rounded-[8px] bg-white px-[20px] py-[16px]">
                    {hiddenGoodsInput}
                    <div
                        data-testid="scene-goods-dragger"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                            event.preventDefault();
                            const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/"));
                            if (file) void uploadGoodsFile(file);
                        }}
                        className="flex min-h-[208px] min-w-0 flex-1 flex-col items-center justify-center rounded-[8px] border border-dashed border-[#d9d9d9] transition hover:border-[#723cf9]"
                    >
                        <button
                            type="button"
                            data-testid="scene-goods-upload"
                            disabled={Boolean(busy) || restoring}
                            onClick={() => goodsInputRef.current?.click()}
                            className={cn("inline-flex h-8 items-center gap-[6px] rounded-[6px] px-[15px] text-[14px] text-white disabled:opacity-60", GRADIENT)}
                        >
                            <Upload className="size-[14px]" />
                            上传商品图
                        </button>
                        <p className="mt-[10px] text-[12px] text-black/60">{busy || restoring ? busy || "正在恢复草稿素材…" : "或拖拽/粘贴图片到此处"}</p>
                        <div className="mt-[10px] flex items-center gap-[8px] text-[12px] text-black/30">
                            <span className="h-px w-[36px] bg-black/10" />
                            或试试这些
                            <span className="h-px w-[36px] bg-black/10" />
                        </div>
                        <div data-testid="scene-examples" className="mt-[10px] flex gap-[10px]">
                            {PRODUCT_BG_EXAMPLES.map((example) => (
                                <button
                                    key={example.id}
                                    type="button"
                                    data-testid={`scene-${example.id}`}
                                    disabled={Boolean(busy)}
                                    onClick={() => void applyExample(example)}
                                    className="size-[60px] overflow-hidden rounded-[4px] border border-transparent transition hover:border-[#723cf9]"
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
                        <h1 className="text-[20px] font-bold leading-[28px] text-black/85">场景参考图</h1>
                        <div className="flex items-center gap-[12px]">
                            <label className="flex h-[28px] w-[150px] items-center gap-[4px] rounded-[4px] bg-black/[0.04] px-[8px]">
                                <Search className="size-[14px] shrink-0 text-black/45" />
                                <input
                                    data-testid="scene-template-search"
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="搜索标签关键词"
                                    className="min-w-0 flex-1 bg-transparent text-[12px] text-black/85 outline-none placeholder:text-black/30"
                                />
                            </label>
                            <span className="text-[12px] text-black/60">排序：</span>
                            <div className="flex gap-[6px]" data-testid="scene-sorts">
                                {PRODUCT_BG_SORTS.map((label, index) => (
                                    <span
                                        key={label}
                                        aria-disabled={index > 0}
                                        title={index > 0 ? "本地没有收藏 / 热度数据，仅按原站推荐顺序展示" : undefined}
                                        className={cn(
                                            "rounded-[4px] border px-[8px] py-[3px] text-[12px]",
                                            index === 0 ? "border-[#723cf9] bg-[#f9f0ff] text-[#723cf9]" : "cursor-not-allowed border-transparent bg-black/[0.04] text-black/60",
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
                                className={cn("relative pb-[6px] text-[14px] leading-[22px]", category === label ? "font-medium text-black/85" : "text-black/60 hover:text-black/85")}
                            >
                                {label}
                                {category === label ? <span className="absolute bottom-0 left-1/2 h-[2px] w-[16px] -translate-x-1/2 rounded bg-black/85" /> : null}
                            </button>
                        ))}
                    </div>
                    {pendingScene ? <p className="mt-[8px] text-[12px] text-[#723cf9]">已选择「{pendingScene.title}」，请先上传商品图</p> : null}
                    <div className="mt-[16px] grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-x-[16px] gap-y-[14px]">
                        {homeScenes.map((scene) => (
                            <SceneCard key={scene.id} scene={scene} testId={`scene-template-${scene.id}`} onPick={pickHomeScene} />
                        ))}
                    </div>
                    <p data-testid="scene-template-end" className="mt-[16px] text-center text-[12px] text-black/30">没有更多了</p>
                </section>
            </div>
        );
    }

    /* 蒙版模式：画布预览按蒙版亮度裁出商品主体（白=主体），与提交给模型的蒙版一致 */
    const maskPreview = values.cutoutMode === "mask" && mask?.url ? { maskImage: `url(${mask.url})`, maskMode: "luminance" as const, maskSize: "100% 100%", WebkitMaskImage: `url(${mask.url})`, WebkitMaskSize: "100% 100%" } : {};
    const productStyle = { left: `${values.transform.x * 100}%`, top: `${values.transform.y * 100}%`, width: `${values.transform.scale * 50}%`, transform: `translate(-50%, -50%) rotate(${values.transform.rotate}deg)`, ...maskPreview };

    return (
        <div data-testid="scene-workspace" data-step="editor" className={cn("flex h-full min-h-0 gap-[8px]", className)}>
            {/* 左侧窄栏：原站「返回 / 参考图 / 商品 / 元素」，本地只有参考图有真实数据 */}
            <nav className="flex w-[60px] shrink-0 flex-col items-center gap-[8px] rounded-[8px] bg-white py-[10px] text-[12px] text-black/60">
                <button type="button" data-testid="scene-back" onClick={backHome} className="flex items-center gap-[2px] hover:text-[#723cf9]">
                    <ArrowLeft className="size-3" />
                    返回
                </button>
                <button
                    type="button"
                    data-testid="scene-drawer-toggle"
                    aria-pressed={drawerOpen}
                    onClick={() => setDrawerOpen(!drawerOpen)}
                    className={cn("flex w-[52px] flex-col items-center gap-[2px] rounded-[6px] py-[8px]", drawerOpen ? "bg-[#f4f0ff] text-[#723cf9]" : "hover:text-[#723cf9]")}
                >
                    <ImageIcon className="size-[16px]" />
                    参考图
                </button>
            </nav>

            {drawerOpen ? (
                <aside data-testid="scene-drawer" className="flex w-[560px] min-w-0 shrink-0 flex-col rounded-[8px] bg-white">
                    <div className="flex h-[44px] shrink-0 items-center justify-between border-b border-black/[0.06] px-[14px]">
                        <span className="text-[14px] font-medium text-[#723cf9]">智能推荐</span>
                        <button type="button" aria-label="关闭" onClick={() => setDrawerOpen(false)} className="text-black/45 hover:text-black/85">
                            <X className="size-4" />
                        </button>
                    </div>
                    <div className="shrink-0 space-y-[10px] px-[14px] py-[10px] text-[12px]">
                        <div className="flex items-center gap-[6px]">
                            <span className="w-[40px] text-black/45">排序：</span>
                            {PRODUCT_BG_SORTS.map((label, index) => (
                                <span key={label} aria-disabled={index > 0} className={cn("rounded-[4px] border px-[8px] py-[3px]", index === 0 ? "border-[#723cf9] text-[#723cf9]" : "cursor-not-allowed border-transparent bg-black/[0.04] text-black/60")}>
                                    {label}
                                </span>
                            ))}
                            <label className="ml-[4px] flex h-[26px] min-w-0 flex-1 items-center gap-[4px] rounded-[4px] bg-black/[0.04] px-[8px]">
                                <Search className="size-[12px] shrink-0 text-black/45" />
                                <input data-testid="scene-drawer-search" value={drawerQuery} onChange={(event) => setDrawerQuery(event.target.value)} placeholder="搜索标签关键词" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-black/30" />
                            </label>
                        </div>
                        <div className="flex gap-[6px]">
                            <span className="w-[40px] shrink-0 pt-[3px] text-black/45">商品：</span>
                            <div className="flex flex-wrap gap-[6px]">
                                {[null, ...PRODUCT_BG_CATEGORIES].map((label) => (
                                    <button key={label ?? "all"} type="button" aria-pressed={drawerCategory === label} onClick={() => setDrawerCategory(label)} className={cn("rounded-[4px] border px-[8px] py-[3px]", drawerCategory === label ? "border-[#723cf9] text-[#723cf9]" : "border-transparent bg-black/[0.04] text-black/60 hover:text-black/85")}>
                                        {label ?? "全部"}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <p className="flex shrink-0 items-center gap-[4px] bg-[#f5f7fa] px-[14px] py-[8px] text-[12px] text-black/65">
                        <Lightbulb className="size-[14px] text-[#faad14]" />
                        建议：选择与您上传图片为同类商品，以达到最佳的效果！
                    </p>
                    <div className="grid min-h-0 flex-1 grid-cols-5 content-start gap-x-[10px] gap-y-[8px] overflow-y-auto p-[14px]">
                        {drawerScenes.map((scene) => (
                            <SceneCard key={scene.id} scene={scene} active={sceneId === scene.id} testId={`scene-drawer-${scene.id}`} onPick={(item) => void applyScene(item)} />
                        ))}
                        {drawerScenes.length === 0 ? <p className="col-span-5 py-[24px] text-center text-[12px] text-black/30">没有更多了</p> : null}
                    </div>
                </aside>
            ) : null}

            {/* 中间画布：场景图铺满画布，商品浮在上面可拖动 */}
            <main data-testid="scene-canvas" className="flex min-h-0 min-w-0 flex-1 flex-col rounded-[8px] bg-[#edeff5]">
                <p className="m-[8px] flex shrink-0 items-center gap-[4px] rounded-[6px] bg-white px-[12px] py-[6px] text-[12px] text-black/65">
                    <Lightbulb className="size-[14px] text-[#faad14]" />
                    小贴士：您可以拖动商品主体到合适的画面位置，并在下方调整商品大小。
                </p>
                <div className="flex min-h-0 flex-1 items-center justify-center p-[16px]">
                    <div
                        data-testid="scene-board"
                        className="relative max-h-full max-w-full overflow-hidden bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] [background-image:linear-gradient(45deg,#f0f0f0_25%,transparent_25%,transparent_75%,#f0f0f0_75%),linear-gradient(45deg,#f0f0f0_25%,transparent_25%,transparent_75%,#f0f0f0_75%)] [background-position:0_0,8px_8px] [background-size:16px_16px]"
                        style={{ aspectRatio: `${output.width} / ${output.height}`, height: "min(100%, 600px)" }}
                    >
                        {bg ? <img data-testid="scene-board-bg" src={bg.url} alt="参考图" className="absolute inset-0 size-full object-cover" /> : null}
                        <img
                            data-testid="scene-board-goods"
                            src={goods.url}
                            alt="商品"
                            draggable={false}
                            onPointerDown={onDragStart}
                            onPointerMove={onDragMove}
                            onPointerUp={onDragEnd}
                            onPointerCancel={onDragEnd}
                            className="absolute cursor-move touch-none select-none outline-dashed outline-1 outline-[#723cf9]/70"
                            style={productStyle}
                        />
                    </div>
                </div>
                <div className="mx-auto mb-[10px] flex shrink-0 items-center gap-[10px] rounded-[6px] bg-white px-[12px] py-[6px] text-[12px] text-black/65 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                    <span className="text-black/45">商品大小</span>
                    <span>小</span>
                    <input
                        data-testid="scene-goods-scale"
                        type="range"
                        min={0.2}
                        max={SCENE_TRANSFORM_LIMITS.scale.max}
                        step={0.05}
                        value={values.transform.scale}
                        disabled={running}
                        onChange={(event) => update({ transform: clampSceneTransform({ ...values.transform, scale: Number(event.target.value) }) })}
                        className="w-[100px] accent-[#723cf9]"
                    />
                    <span>大</span>
                    <button type="button" onClick={() => update(resetSceneTransform(values))} disabled={running} className="flex items-center gap-[2px] hover:text-[#723cf9]">
                        <RotateCcw className="size-3" />
                        重置
                    </button>
                </div>
                {task ? (
                    <section data-testid="scene-result" className="mx-[8px] mb-[8px] max-h-[45%] shrink-0 overflow-y-auto rounded-[8px] bg-white p-[12px]">
                        {result.drift && result.status === "succeeded" ? <p data-testid="scene-drift" className="mb-2 text-[12px] text-amber-700">参数已变化：{result.drift}</p> : null}
                        <ToolResult task={task} toolId={toolId} title={`${NEW_REPLACE_BG_V2_TITLE}结果`} onCancel={running ? onCancel : undefined} onRetry={!running ? () => void onRetry() : undefined} className="border-0 bg-transparent p-0" />
                    </section>
                ) : null}
            </main>

            {/* 右侧配置栏 300px：画面尺寸 → 商品合成/替换 → 已选参考图 → 背景相似度 → 生成张数 → 立即生成 */}
            <aside data-testid="scene-config" className="flex w-[300px] shrink-0 flex-col rounded-[8px] bg-white">
                <div className="min-h-0 flex-1 space-y-[20px] overflow-y-auto px-[14px] py-[14px] text-[12px]">
                    {!cutout.ready ? (
                        <section data-testid="scene-cutout" className="rounded-[6px] border border-[#ffe58f] bg-[#fffbe6] p-[10px]">
                            <p className="mb-[6px] text-[14px] text-black/85">商品抠图</p>
                            <div className="flex gap-[6px]">
                                {SCENE_CUTOUT_MODES.map((item) => (
                                    <button key={item.id} type="button" data-testid={`scene-cutout-mode-${item.id}`} aria-pressed={values.cutoutMode === item.id} title={item.hint} onClick={() => update({ cutoutMode: item.id, cutoutConfirmed: false })} className={cn("rounded-[4px] border px-[8px] py-[3px]", values.cutoutMode === item.id ? "border-[#723cf9] text-[#723cf9]" : "border-black/10 text-black/60")}>
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                            {values.cutoutMode === "mask" ? (
                                <div className="mt-[6px]">
                                    <input ref={maskInputRef} type="file" accept="image/png" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void onMaskFile(file); }} />
                                    <button type="button" data-testid="scene-mask-upload" onClick={() => maskInputRef.current?.click()} className="text-[#723cf9] hover:underline">
                                        {mask ? `已上传蒙版：${mask.name}（重新上传）` : "上传一张蒙版图（白=商品主体）"}
                                    </button>
                                </div>
                            ) : null}
                            <p data-testid="scene-cutout-state" className="mt-[6px] text-black/45">{cutout.reason}</p>
                            <button type="button" data-testid="scene-cutout-confirm" disabled={cutout.code === "cutout-mask-missing" || cutout.code === "cutout-transparent-required"} onClick={() => update({ cutoutConfirmed: true })} className={cn("mt-[6px] h-[26px] w-full rounded-[4px] text-white disabled:opacity-50", GRADIENT)}>
                                确认使用
                            </button>
                        </section>
                    ) : null}

                    <section data-testid="scene-output">
                        <div className="flex items-center justify-between">
                            <span className="text-[12px] text-black/45">画面尺寸</span>
                            <select
                                data-testid="scene-ratio"
                                value={values.ratio}
                                disabled={running}
                                onChange={(event) => isSceneOutputRatio(event.target.value) && update({ ratio: event.target.value })}
                                className="bg-transparent text-[12px] text-[#3a7df9] outline-none"
                            >
                                {SCENE_OUTPUT_RATIOS.map((ratio) => (
                                    <option key={ratio} value={ratio}>{ratio === "1:1" ? "默认尺寸" : ratio}</option>
                                ))}
                            </select>
                        </div>
                        <div data-testid="scene-output-size" className="mt-[8px] flex items-center gap-[8px] text-[14px] text-black/85">
                            <span className="flex h-[32px] flex-1 items-center justify-between rounded-[6px] border border-[#d9d9d9] px-[10px]">{output.width}<span className="text-[12px] text-black/30">px 宽</span></span>
                            <X className="size-[14px] text-black/65" />
                            <span className="flex h-[32px] flex-1 items-center justify-between rounded-[6px] border border-[#d9d9d9] px-[10px]">{output.height}<span className="text-[12px] text-black/30">px 高</span></span>
                        </div>
                    </section>

                    <section data-testid="scene-type">
                        <div className="flex gap-[20px] text-[14px]">
                            {PRODUCT_BG_MODES.map((item) => (
                                <button key={item.id} type="button" data-testid={`scene-mode-${item.id}`} aria-pressed={mode === item.id} disabled={running || !sceneReady} onClick={() => setMode(item.id)} className={cn("border-b-2 pb-[4px]", mode === item.id ? "border-[#723cf9] font-medium text-[#723cf9]" : "border-transparent text-black/85")}>
                                    {item.label}
                                </button>
                            ))}
                        </div>
                        <p className="mt-[8px] flex items-center gap-[4px] text-black/65">
                            <Info className="size-[12px] shrink-0 text-[#faad14]" />
                            {PRODUCT_BG_MODES.find((item) => item.id === mode)?.hint}
                        </p>
                    </section>

                    <section data-testid="scene-reference">
                        <p className="mb-[8px] text-black/45">已选参考图</p>
                        <div className="group relative flex h-[168px] items-center justify-center overflow-hidden rounded-[6px] border border-dashed border-[#d9d9d9]">
                            {bg ? <img data-testid="scene-reference-image" src={bg.url} alt="已选参考图" className="size-full object-cover" /> : null}
                            <button
                                type="button"
                                data-testid="scene-reference-pick"
                                disabled={running || Boolean(busy)}
                                onClick={() => setDrawerOpen(true)}
                                className={cn(bg ? "absolute right-[6px] top-[6px] hidden rounded-[4px] bg-black/50 px-[8px] py-[3px] text-white group-hover:block" : cn("h-[32px] rounded-[6px] px-[14px] text-[14px] text-white", GRADIENT))}
                            >
                                {bg ? "重新选择" : busy || "选择参考图"}
                            </button>
                        </div>
                    </section>

                    <section data-testid="scene-weight">
                        <p className="text-black/45">背景相似度</p>
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
                            className="mt-[8px] w-full accent-[#723cf9]"
                        />
                        <div className="flex justify-between text-black/30">
                            {SCENE_WEIGHT_MARKS.map((mark) => (
                                <span key={mark.value} className={cn(sceneWeightLabel(values.weight) === mark.label && "font-medium text-black/85")}>{mark.label}</span>
                            ))}
                        </div>
                    </section>

                    <section data-testid="scene-count">
                        <p className="mb-[8px] text-black/45">生成张数</p>
                        <div className="grid grid-cols-4 gap-[8px]">
                            {SCENE_OUTPUT_COUNTS.map((count) => (
                                <button key={count} type="button" data-testid={`scene-count-${count}`} aria-pressed={values.outputNum === count} disabled={running} onClick={() => update({ outputNum: count })} className={cn("h-[32px] rounded-[6px] border text-[14px]", values.outputNum === count ? "border-[#723cf9] bg-[#f9f0ff] text-[#723cf9]" : "border-[#d9d9d9] text-black/85")}>
                                    {count}
                                </button>
                            ))}
                        </div>
                    </section>
                </div>

                <div data-testid="scene-submit" className="shrink-0 border-t-[3px] border-[#f5f7fa] px-[14px] py-[10px]">
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
                        <button type="button" data-testid="scene-generate" disabled={blocked} onClick={() => void onGenerate()} className={cn("h-[36px] min-w-0 flex-1 rounded-[6px] text-[14px] text-white disabled:cursor-not-allowed disabled:opacity-50", GRADIENT)}>
                            {running ? "生成中…" : "立即生成"}
                        </button>
                        {running ? <button type="button" onClick={onCancel} className="h-[36px] rounded-[6px] border border-black/10 px-[12px] text-[12px]">取消</button> : null}
                    </div>
                    <p className="mt-[4px] text-center text-[11px] text-black/45">模型：{modelLabel(imageModel)}</p>
                </div>
            </aside>
        </div>
    );
}
