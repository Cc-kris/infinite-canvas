import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolResult } from "@/components/tools/tool-result";
import { loadToolAssetRecords, type ToolAssetConstraints, type ToolAssetRecord } from "@/services/api/tools/assets";
import { getToolGateway } from "@/services/api/tools/gateway";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";

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
        <section data-testid={testId} className="rounded-lg border border-stone-200 bg-white/60 p-3 dark:border-stone-800 dark:bg-stone-900/40">
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
            : "border-stone-200 bg-white text-stone-700 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200",
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
                gateway: getToolGateway(),
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
                gateway: getToolGateway(),
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
            setTask(getToolGateway().cancel(task.id));
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

    return (
        <div data-testid="scene-workspace" className={["grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]", className ?? ""].join(" ")}>
            {/* ---------------- 左：素材与场景配置 ---------------- */}
            <div className="space-y-3">
                <Section title="流程" hint="上传 → 抠图确认 → 场景 → 结果" testId="scene-steps">
                    <ol className="flex flex-wrap gap-2">
                        {steps.map((step, index) => (
                            <li
                                key={step.id}
                                data-testid={`scene-step-${step.id}`}
                                data-status={step.status}
                                className={[
                                    "rounded-md border px-2 py-1 text-[11px]",
                                    step.status === "done"
                                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                        : step.status === "active"
                                          ? "border-stone-800 bg-stone-100 text-stone-900"
                                          : "border-stone-200 bg-white text-stone-500",
                                ].join(" ")}
                                title={step.hint}
                            >
                                {index + 1}. {step.label}
                            </li>
                        ))}
                    </ol>
                </Section>

                <Section title="商品层（必填）" hint={`${SCENE_SOURCE_LIMITS.mimeTypes.map((mime) => mime.replace("image/", "")).join(" / ")} · 20M 以内`} testId="scene-goods">
                    <ToolAssetInput toolId={toolId} constraints={GOODS_CONSTRAINTS} maxCount={1} title="上传商品图" onChange={onGoodsChange} disabled={running} />
                    {goods ? (
                        <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400" data-testid="scene-goods-meta">
                            {goods.name ?? "商品图"} · {goods.width ?? "?"}×{goods.height ?? "?"} · {goodsHasAlpha ? "检测到透明通道" : "无透明通道"}
                        </p>
                    ) : null}
                </Section>

                <Section title="抠图确认" hint="先拿素材证据，再点确认" testId="scene-cutout">
                    <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                            {SCENE_CUTOUT_MODES.map((mode) => (
                                <button
                                    key={mode.id}
                                    type="button"
                                    data-testid={`scene-cutout-mode-${mode.id}`}
                                    aria-pressed={values.cutoutMode === mode.id}
                                    className={chipClass(values.cutoutMode === mode.id)}
                                    onClick={() => update({ cutoutMode: mode.id, cutoutConfirmed: false })}
                                    disabled={running}
                                    title={mode.hint}
                                >
                                    {mode.label}
                                </button>
                            ))}
                        </div>
                        {values.cutoutMode === "mask" ? (
                            <ToolAssetInput toolId={`${toolId}:mask`} constraints={MASK_CONSTRAINTS} maxCount={1} title="上传主体蒙版（白=主体）" onChange={onMaskChange} disabled={running} />
                        ) : (
                            <p className="text-[11px] text-stone-500 dark:text-stone-400">
                                透明底模式：已对商品图做真实像素检测，{goodsHasAlpha ? "检测到 alpha 通道" : "未检测到 alpha 通道，无法通过门禁"}
                            </p>
                        )}
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-stone-500 dark:text-stone-400" data-testid="scene-cutout-state">
                                {cutout.ready ? "抠图已确认" : cutout.reason}
                            </span>
                            <button
                                type="button"
                                data-testid="scene-cutout-confirm"
                                className={chipClass(values.cutoutConfirmed)}
                                disabled={running || cutout.code === "cutout-mask-missing" || cutout.code === "cutout-transparent-required"}
                                onClick={() => update({ cutoutConfirmed: !values.cutoutConfirmed })}
                            >
                                {values.cutoutConfirmed ? "取消确认" : "确认抠图"}
                            </button>
                        </div>
                    </div>
                </Section>

                <Section title="场景类型" hint="推荐模板 / 自定义背景" testId="scene-type">
                    <div className="flex flex-wrap gap-2">
                        {SCENE_TYPES.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                data-testid={`scene-type-${option.id}`}
                                aria-pressed={values.sceneType === option.id}
                                className={chipClass(values.sceneType === option.id)}
                                onClick={() => update({ sceneType: option.id })}
                                disabled={running}
                                title={option.hint}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    {values.sceneType === "recommend" ? (
                        <div className="mt-2 grid grid-cols-2 gap-2" data-testid="scene-templates">
                            {SCENE_TEMPLATES.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    data-testid={`scene-template-${item.id}`}
                                    aria-pressed={values.templateId === item.id}
                                    className={[
                                        "rounded-md border px-2 py-1.5 text-left text-[11px] transition",
                                        values.templateId === item.id
                                            ? "border-stone-800 bg-stone-800 text-white dark:border-stone-200 dark:bg-stone-200 dark:text-stone-900"
                                            : "border-stone-200 bg-white text-stone-700 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200",
                                    ].join(" ")}
                                    onClick={() => update({ templateId: item.id })}
                                    disabled={running}
                                >
                                    <span className="block font-medium">{item.label}</span>
                                    <span className="block opacity-70">{item.hint}</span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="mt-2 space-y-2">
                            <ToolAssetInput toolId={`${toolId}:bg`} constraints={BG_CONSTRAINTS} maxCount={1} title="上传自定义背景图（可选）" onChange={onBgChange} disabled={running} />
                            <textarea
                                data-testid="scene-custom-prompt"
                                className="w-full rounded-md border border-stone-200 bg-white px-2 py-1 text-xs text-stone-800 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                                rows={3}
                                maxLength={200}
                                placeholder="描述背景与光线，例如：露营木桌上，早晨侧逆光，背景有薄雾"
                                value={values.customPrompt}
                                onChange={(event) => update({ customPrompt: event.target.value })}
                                disabled={running}
                            />
                        </div>
                    )}
                </Section>

                <Section title="融合强度" hint={sceneWeightLabel(values.weight)} testId="scene-weight">
                    <div data-testid="scene-similarity-control" hidden />
                    <div className="flex items-center gap-2">
                        <input
                            data-testid="scene-weight-range"
                            type="range"
                            min={SCENE_WEIGHT_LIMITS.min}
                            max={SCENE_WEIGHT_LIMITS.max}
                            step={SCENE_WEIGHT_LIMITS.step}
                            value={values.weight}
                            onChange={(event) => update({ weight: Number(event.target.value) })}
                            disabled={running}
                            className="w-full"
                        />
                        <span className="w-10 text-right text-xs tabular-nums text-stone-700 dark:text-stone-200">{Math.round(values.weight * 100)}%</span>
                    </div>
                </Section>

                <Section title="输出规格" hint="比例 / 数量" testId="scene-output">
                    <div className="flex flex-wrap gap-2">
                        {SCENE_OUTPUT_RATIOS.map((ratio) => (
                            <button
                                key={ratio}
                                type="button"
                                data-testid={`scene-ratio-${ratio}`}
                                aria-pressed={values.ratio === ratio}
                                className={chipClass(values.ratio === ratio)}
                                onClick={() => update({ ratio })}
                                disabled={running}
                            >
                                {ratio}
                            </button>
                        ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {SCENE_OUTPUT_COUNTS.map((count) => (
                            <button
                                key={count}
                                type="button"
                                data-testid={`scene-count-${count}`}
                                aria-pressed={values.outputNum === count}
                                className={chipClass(values.outputNum === count)}
                                onClick={() => update({ outputNum: count })}
                                disabled={running}
                            >
                                {count} 张
                            </button>
                        ))}
                        <span className="text-[11px] text-stone-500 dark:text-stone-400" data-testid="scene-output-size">
                            {output.width}×{output.height}
                        </span>
                    </div>
                </Section>
            </div>

            {/* ---------------- 右：合成画布 + 图层 + 结果 ---------------- */}
            <div className="space-y-3">
                <Section title="合成画布" hint="商品层按位置/缩放/旋转叠在场景层上" testId="scene-canvas">
                    <div className="relative overflow-hidden rounded-lg border border-stone-200 bg-stone-100 dark:border-stone-800 dark:bg-stone-800" style={{ aspectRatio: output.width / output.height }}>
                        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-[11px] text-stone-500 dark:text-stone-400">
                            {values.sceneType === "recommend" ? (template?.prompt ?? "未选择场景模板") : bg ? "自定义背景图已就位" : values.customPrompt || "等待自定义背景描述"}
                        </div>
                        {goods && values.layers.goods.visible ? (
                            <img
                                data-testid="scene-canvas-goods"
                                src={goods.dataUrl ?? goods.url ?? ""}
                                alt={goods.name ?? "商品层"}
                                className="absolute select-none object-contain"
                                style={{
                                    left: `${values.transform.x * 100}%`,
                                    top: `${values.transform.y * 100}%`,
                                    width: "60%",
                                    transform: `translate(-50%, -50%) scale(${values.transform.scale}) rotate(${values.transform.rotate}deg)`,
                                    opacity: values.layers.bg.visible ? 1 : 0.9,
                                }}
                            />
                        ) : null}
                    </div>
                    <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400" data-testid="scene-transform-summary">{transformSummary(values.transform)}</p>
                    {/* 画布工具必须可撤销/重做：40px 最小点击区 + 键盘可达 + 明确禁用态 */}
                    <div className="mt-2 flex items-center gap-2" data-testid="scene-history-bar">
                        <button
                            type="button"
                            aria-label="撤销"
                            title="撤销上一步画布参数"
                            data-testid="scene-undo"
                            disabled={!canUndo || running}
                            onClick={() => stepHistory("undo")}
                            className="inline-flex size-10 items-center justify-center rounded-md border border-stone-200 bg-white text-sm text-stone-700 disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
                        >
                            ↶
                        </button>
                        <button
                            type="button"
                            aria-label="重做"
                            title="重做下一步画布参数"
                            data-testid="scene-redo"
                            disabled={!canRedo || running}
                            onClick={() => stepHistory("redo")}
                            className="inline-flex size-10 items-center justify-center rounded-md border border-stone-200 bg-white text-sm text-stone-700 disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
                        >
                            ↷
                        </button>
                        <span className="text-[11px] text-stone-500 dark:text-stone-400" data-testid="scene-history-state">
                            {canUndo ? `可撤销 ${undoState.past} 步` : "无可撤销步骤"} · {canRedo ? `可重做 ${undoState.future} 步` : "无可重做步骤"}
                        </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="text-[11px] text-stone-500 dark:text-stone-400">
                            横向位置 {Math.round(values.transform.x * 100)}%
                            <input type="range" min={0} max={1} step={0.01} value={values.transform.x} onChange={(event) => update({ transform: clampSceneTransform({ ...values.transform, x: Number(event.target.value) }) })} className="w-full" disabled={running} />
                        </label>
                        <label className="text-[11px] text-stone-500 dark:text-stone-400">
                            纵向位置 {Math.round(values.transform.y * 100)}%
                            <input type="range" min={0} max={1} step={0.01} value={values.transform.y} onChange={(event) => update({ transform: clampSceneTransform({ ...values.transform, y: Number(event.target.value) }) })} className="w-full" disabled={running} />
                        </label>
                        <label className="text-[11px] text-stone-500 dark:text-stone-400">
                            缩放 {Math.round(values.transform.scale * 100)}%
                            <input type="range" min={0.2} max={2} step={0.05} value={values.transform.scale} onChange={(event) => update({ transform: clampSceneTransform({ ...values.transform, scale: Number(event.target.value) }) })} className="w-full" disabled={running} />
                        </label>
                        <label className="text-[11px] text-stone-500 dark:text-stone-400">
                            旋转 {values.transform.rotate}°
                            <input type="range" min={-45} max={45} step={1} value={values.transform.rotate} onChange={(event) => update({ transform: clampSceneTransform({ ...values.transform, rotate: Number(event.target.value) }) })} className="w-full" disabled={running} />
                        </label>
                    </div>
                    <div className="mt-2 flex gap-2">
                        <button type="button" className={chipClass(false)} onClick={() => update(resetSceneTransform(values))} disabled={running}>
                            复位变换
                        </button>
                        <button type="button" className={chipClass(values.lockCutout)} onClick={() => update({ lockCutout: !values.lockCutout })} disabled={running}>
                            锁定抠图边缘 {values.lockCutout ? "开" : "关"}
                        </button>
                    </div>
                </Section>

                <Section title="图层" hint="可见 / 锁定" testId="scene-layers">
                    <div data-testid="scene-layer-composer" hidden />
                    <ul className="space-y-1">
                        {SCENE_LAYER_IDS.map((id: SceneLayerId) => {
                            const meta = sceneLayerMeta(id);
                            const state = values.layers[id];
                            return (
                                <li key={id} data-testid={`scene-layer-${id}`} className="flex items-center justify-between gap-2 rounded-md border border-stone-200 px-2 py-1 text-[11px] dark:border-stone-700">
                                    <span className="flex-1">
                                        <span className="font-medium text-stone-800 dark:text-stone-100">{meta.label}</span>
                                        <span className="ml-1 text-stone-500 dark:text-stone-400">{meta.hint}</span>                                    </span>
                                    <button type="button" aria-pressed={state.visible} className={chipClass(state.visible)} onClick={() => update({ layers: { ...values.layers, [id]: { ...state, visible: !state.visible } } })} disabled={running}>
                                        {state.visible ? "可见" : "隐藏"}
                                    </button>
                                    <button type="button" aria-pressed={state.locked} className={chipClass(state.locked)} onClick={() => update({ layers: { ...values.layers, [id]: { ...state, locked: !state.locked } } })} disabled={running}>
                                        {state.locked ? "已锁" : "未锁"}
                                    </button>
                                    <button type="button" className={chipClass(false)} onClick={() => update(resetSceneLayer(values, id))} disabled={running} title={`恢复${meta.label}默认`}>
                                        恢复
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400">
                        默认图层：{SCENE_LAYER_IDS.filter((id) => DEFAULT_SCENE_LAYERS[id].visible).length} 层可见 / 共 {SCENE_LAYER_IDS.length} 层
                    </p>
                </Section>

                <Section title="请求参数（真实下发）" hint="canvasData / sizeData / imageRecords" testId="scene-inspector">
                    <div className="space-y-1 text-[11px] text-stone-600 dark:text-stone-300">
                        <p data-testid="scene-inspector-size">
                            {sizeData.width}×{sizeData.height} @ {sizeData.ratio} · {sizeData.count} 张 · {sizeData.layers} 层可见 · {sizeData.unit}
                        </p>
                        <p data-testid="scene-inspector-records">
                            参考图 {imageRecords.length} 张：{imageRecords.map((record) => `${record.layer}=${record.name}`).join(" / ") || "未选择"}
                        </p>
                        <details>
                            <summary className="cursor-pointer text-stone-500 dark:text-stone-400">展开提示词与 canvasData</summary>
                            <pre data-testid="scene-inspector-json" className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-stone-100 p-2 text-[10px] leading-4 text-stone-700 dark:bg-stone-800 dark:text-stone-200">
{`${buildNewReplaceBgPrompt(values, output)}\n\n${JSON.stringify({ canvasData, sizeData, imageRecords }, null, 2)}`}
                            </pre>
                        </details>
                    </div>
                </Section>

                <Section title="提交" hint={blocked ? "先补齐拦截项" : "参数齐全，可提交真实请求"} testId="scene-submit">
                    {issues.length ? (
                        <ul data-testid="scene-issues" className="mb-2 space-y-1">
                            {issues.map((issue) => (
                                <li key={`${issue.code}-${issue.field}`} className="text-[11px] text-amber-700 dark:text-amber-400">
                                    · {issue.message}
                                </li>
                            ))}
                        </ul>
                    ) : null}
                    {runError ? (
                        <pre data-testid="scene-run-error" className="mb-2 whitespace-pre-wrap break-words rounded border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                            {runError}
                        </pre>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            data-testid="scene-generate"
                            className="rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
                            onClick={() => void onGenerate()}
                            disabled={blocked}
                        >
                            {running ? "生成中…" : `生成 ${output.count} 张`}
                        </button>
                        <span className="text-[11px] text-stone-500 dark:text-stone-400">
                            {restoring ? "正在恢复草稿素材…" : `模型：${imageModel?.trim() || "未配置"}`}
                        </span>
                    </div>
                </Section>

                <Section title="结果" hint={result.stale ? "参数已变，结果需重新生成" : "按输出数量分格展示"} testId="scene-result">
                    {result.drift && result.status === "succeeded" ? (
                        <p data-testid="scene-drift" className="mb-2 text-[11px] text-amber-700 dark:text-amber-400">
                            {result.drift}
                        </p>
                    ) : null}
                    <div data-testid="scene-grid" data-component="scene-variant-grid" className="grid grid-cols-2 gap-2">
                        {grid.map((cell) => (
                            <div key={cell.index} data-testid={`scene-grid-cell-${cell.index}`} data-filled={Boolean(cell.dataUrl)} className="relative overflow-hidden rounded-md border border-stone-200 bg-stone-100 dark:border-stone-700 dark:bg-stone-800" style={{ aspectRatio: 1 }}>
                                {cell.dataUrl ? (
                                    <img src={cell.dataUrl} alt={`结果 ${cell.index + 1}`} className="size-full object-cover" />
                                ) : (
                                    <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-[10px] text-stone-500 dark:text-stone-400">
                                        {result.status === "succeeded" ? "上游未返回此格" : result.status === "running" ? "生成中…" : "待生成"}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                    {primary ? (
                        <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400" data-testid="scene-primary">
                            主结果已就绪，可下载或发送画布
                        </p>
                    ) : null}
                    <ToolResult task={task} toolId={toolId} title={`${NEW_REPLACE_BG_V2_TITLE}结果`} onCancel={running ? onCancel : undefined} onRetry={task && !running ? () => void onRetry() : undefined} className="mt-2 border-0 bg-transparent p-0" />
                </Section>

                <Section title="本次提交快照" hint="提交时锁定的参数；结果与快照不一致会标记为旧版本" testId="scene-submitted">
                    {snapshot ? (
                        <pre data-testid="scene-submitted-json" className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-stone-100 p-2 text-[10px] leading-4 text-stone-700 dark:bg-stone-800 dark:text-stone-200">
                            {JSON.stringify(snapshot, null, 2)}
                        </pre>
                    ) : (
                        <p data-testid="scene-submitted-empty" className="text-[11px] text-stone-500 dark:text-stone-400">
                            还没有提交过任务；提交后这里会显示本次锁定的场景 / 强度 / 图层 / 输出规格。
                        </p>
                    )}
                </Section>
            </div>
        </div>
    );
}

export default SceneWorkspace;
