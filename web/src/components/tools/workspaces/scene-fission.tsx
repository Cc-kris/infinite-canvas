import { modelLabel } from "@/lib/model-label";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { WatermarkGroupPanel } from "@/components/tools/watermark-group-panel";
import { OrigRail, PRODUCT_SCENE_RAIL } from "@/components/tools/workspaces/orig-rail";
import { ToolCases } from "@/components/tools/tool-cases";
import type { ToolCase } from "@/components/tools/tool-cases";
import { ToolHistoryDock } from "@/components/tools/tool-history-dock";
import { ToolResult } from "@/components/tools/tool-result";
import { uploadCaseFiles } from "@/features/tools/case-apply";
import { PRODUCT_SCENE_CASES } from "@/features/tools/tool-cases-data";
import { useConfigStore, resolveModelChannel } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { describeToolExecution } from "@/services/api/tools/gateway";
import { getPersistedToolGateway } from "@/stores/use-tool-task-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";
import { productSceneResultPanelTask } from "@/features/tools/adapters/product-scene";
import { loadToolAssetRecords, type ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask } from "@/services/api/tools/task-machine";

import {
    DEFAULT_SCENE_VALUES,
    PRODUCT_SCENE_TOOL_ID,
    SCENE_CUSTOM_SIZE,
    SCENE_MODELS,
    SCENE_PROMPT_LIMIT,
    SCENE_SIMILARITY,
    SCENE_SOURCE_LIMITS,
    computeSceneOutput,
    createSceneSnapshot,
    describeSceneDrift,
    describeSceneProduct,
    effectiveSceneStrength,
    readSceneValues,
    sceneModelCard,
    sceneOutputOptionLabel,
    validateSceneSource,
    validateSceneState,
    type SceneSnapshot,
    type SceneValues,
} from "@/features/tools/registry/product-scene";
import {
    ProductSceneAdapterError,
    isSceneSourceReady,
    retryProductScene,
    retrySceneVariant,
    runProductScene,
    sceneCapabilityFromDescriptor,
    sceneResultFromTask,
    sceneSourceFromRecord,
    type ProductSceneSourceAsset,
} from "@/features/tools/adapters/product-scene";

/**
 * TASK-024：场景裂变（PRODUCT_SCENE）工作区。
 *
 * 专用组件按 page-specs/17-product-scene.md §6 拆成三段：
 * `SceneLayerComposer`（商品/场景参考上传）→ `SimilarityControl`（背景相似度 / 智能模式）
 * → `SceneVariantGrid`（1–4 张变体，缺格明确标注并可单格重试）。
 *
 * 真实边界：
 * - 相似度、场景描述、模式、尺寸、张数全部落到 provider 字段（见 adapters/product-scene.ts），不静默丢参；
 * - 智能模式隐藏手调相似度并显示解释，实际提交值由能力表决定并展示；
 * - 未配置生图模型 / 渠道不可执行时提交按钮禁用并说明原因，不做假提交。
 */

const DRAFT_SLOT = "productScene";

/** 右栏页签，顺序与原站一致。 */
const SCENE_TABS = [
    { id: "result", label: "生成结果" },
    { id: "cases", label: "优秀案例" },
    { id: "history", label: "历史记录" },
] as const;
type SceneTabId = (typeof SCENE_TABS)[number]["id"];

/**
 * 模型卡的缩略图占位：原站用官方示例图，这里不引外部 CDN（去 LinkFox 品牌资产），
 * 只保留同尺寸同圆角的中性渐变块，保证卡片 60×89 的视觉权重一致。
 */
const MODEL_PREVIEW: Record<string, string> = {
    realistic: "linear-gradient(135deg,#e9e6e1,#cfc9c0)",
    minimal: "linear-gradient(135deg,#f5f3f0,#dedad4)",
    smart: "linear-gradient(135deg,#e9e5ff,#d3c9fb)",
};

/** 原站左栏字段标题：12px / 45% 黑 / 无加粗，行高 16。 */
function FieldLabel({ htmlFor, children, extra }: { htmlFor?: string; children: React.ReactNode; extra?: React.ReactNode }) {
    return (
        <div className="mb-2 flex items-baseline justify-between gap-2">
            <label htmlFor={htmlFor} className="text-[12px] leading-4 text-muted-foreground">
                {children}
            </label>
            {extra}
        </div>
    );
}

/* ------------------------- SceneLayerComposer ------------------------- */

function SceneLayerComposer({
    toolId,
    disabled,
    source,
    restoring,
    lostSource,
    onChange,
}: {
    toolId: string;
    disabled: boolean;
    source?: ProductSceneSourceAsset;
    restoring: boolean;
    lostSource: boolean;
    onChange: (assetIds: string[], records: ToolAssetRecord[]) => void;
}) {
    const navigate = useNavigate();
    const sourceIssue = source ? validateSceneSource(source) : undefined;
    return (
        <div className="min-w-0" data-testid="scene-source">
            <FieldLabel>上传参考图</FieldLabel>
            <p className="mb-1 text-[11px] leading-4 text-muted-foreground">第一步：选择示例图或上传商品图</p>
            <ToolAssetInput
                toolId={toolId}
                title=""
                constraints={SCENE_SOURCE_LIMITS}
                maxCount={1}
                disabled={disabled}
                variant="linkfox"
                wide
                compact
                hint="10M以内，分辨率：384*384 ~ 4096*4096，最大宽高比5"
                onChange={onChange}
            />
            {restoring ? <p className="mt-2 text-[11px] text-muted-foreground">正在恢复上次的参考图…</p> : null}
            {lostSource ? <p className="mt-2 text-[11px] text-amber-600">上次的参考图已失效，请重新上传。</p> : null}
            {sourceIssue && !sourceIssue.ok ? (
                <p className="mt-2 text-[11px] text-red-600" data-testid="scene-source-error">
                    {sourceIssue.message}
                </p>
            ) : null}
            {source?.width && source?.height ? (
                <p className="mt-2 text-[11px] text-muted-foreground" data-testid="scene-source-size">
                    参考图 {source.width}×{source.height}
                </p>
            ) : null}
            <button
                type="button"
                onClick={() => navigate("/tools/product-design/product-suite")}
                className="mt-3 block text-left text-[13px] leading-5 text-primary hover:underline"
                data-testid="scene-to-suite"
            >
                上传多图，体验新功能商品套图
            </button>
        </div>
    );
}

/* -------------------------- SimilarityControl -------------------------- */

function SimilarityControl({
    values,
    smart,
    effective,
    disabled,
    onChange,
}: {
    values: SceneValues;
    smart: boolean;
    effective: number;
    disabled: boolean;
    onChange: (next: Partial<SceneValues>) => void;
}) {
    return (
        <div data-testid="scene-similarity">
            <FieldLabel
                htmlFor="scene-similarity-range"
            >
                背景相似度：
            </FieldLabel>
            <input
                id="scene-similarity-range"
                type="range"
                min={SCENE_SIMILARITY.min}
                max={SCENE_SIMILARITY.max}
                step={SCENE_SIMILARITY.step}
                value={effective}
                disabled={disabled || smart}
                aria-describedby="scene-similarity-hint"
                onChange={(event) => onChange({ similarity: Number(event.target.value) })}
                className="h-4 w-full accent-primary disabled:opacity-50"
            />
        </div>
    );
}

/* --------------------------- SceneVariantGrid --------------------------- */

function SceneVariantGrid({
    cells,
    expected,
    running,
    onRetryCell,
}: {
    cells: ReturnType<typeof sceneResultFromTask>["cells"];
    expected: number;
    running: boolean;
    onRetryCell: (index: number) => void;
}) {
    if (!running && cells.every((cell) => cell.status === "missing" && !cell.dataUrl)) {
        return (
            <div
                className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border bg-background p-4 text-center text-[11px] text-muted-foreground"
                data-testid="scene-result-empty"
            >
                上传商品场景参考图，3秒裂变出多张相似的场景图，快来裂变您的场景图吧~
            </div>
        );
    }
    return (
        <div
            className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
            data-testid="scene-variants"
            data-expected={expected}
            aria-busy={running}
        >
            {cells.map((cell) => (
                <div
                    key={cell.index}
                    className="relative flex min-h-32 flex-col overflow-hidden rounded-md border border-border bg-background"
                    data-variant-index={cell.index}
                    data-variant-status={cell.status}
                >
                    {cell.dataUrl ? (
                        <img src={cell.dataUrl} alt={`场景变体 ${cell.index + 1}`} className="h-full w-full object-cover" />
                    ) : (
                        <div className="flex flex-1 flex-col items-center justify-center gap-1 p-2 text-center text-[11px] text-muted-foreground">
                            {cell.status === "pending" ? (
                                <span>生成中…</span>
                            ) : (
                                <>
                                    <span className="text-amber-600">
                                        {cell.status === "failed" ? cell.message ?? "生成失败" : cell.message ?? "缺少该张结果"}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={running}
                                        onClick={() => onRetryCell(cell.index)}
                                        className="min-h-9 rounded-md border border-border px-2 text-[11px] hover:bg-accent disabled:opacity-50"
                                        data-testid={`scene-retry-cell-${cell.index}`}
                                    >
                                        重试这一张
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                    <span className="absolute left-1 top-1 rounded bg-background/85 px-1 text-[10px] tabular-nums text-foreground">
                        {cell.index + 1}/{expected}
                    </span>
                </div>
            ))}
        </div>
    );
}

/* -------------------------------- 工作区 -------------------------------- */

export function ProductSceneWorkspace({ className, toolId = PRODUCT_SCENE_TOOL_ID }: { className?: string; toolId?: string }) {
    // 结果面板只认落库任务：刷新后由 hydrate 用 storageKey 复原真实字节，再交给共享 ToolResult。
    const storedTasks = useToolTaskStore((state) => state.tasks);
    const tasksHydrated = useToolTaskStore((state) => state.hydrated);
    const hydrateTasks = useToolTaskStore((state) => state.hydrate);
    const toolTasks = useMemo(
        () => Object.values(storedTasks).filter((task) => task.toolId === toolId),
        [storedTasks, toolId],
    );
    const panelTask = useMemo(() => productSceneResultPanelTask(toolTasks, toolId), [toolTasks, toolId]);

    useEffect(() => {
        if (!tasksHydrated) hydrateTasks();
    }, [tasksHydrated, hydrateTasks]);

    const hydrate = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const flushDraft = useToolDraftStore((state) => state.flush);
    const draft = useToolDraftStore((state) => state.drafts[toolId]);
    const config = useConfigStore((state) => state.config);
    const imageModel = useConfigStore((state) => state.config.imageModel);

    // 原站默认进入「智能」模型（提示行为「💡已选择智能模式…」），故页面初始值取 smart。
    const [values, setValues] = useState<SceneValues>(() => ({ ...DEFAULT_SCENE_VALUES, modelId: "smart" }));
    const [source, setSource] = useState<ProductSceneSourceAsset | undefined>();
    const [restoringSource, setRestoringSource] = useState(false);
    const [lostSource, setLostSource] = useState(false);
    const [task, setTask] = useState<ToolTask | undefined>();
    const [snapshot, setSnapshot] = useState<SceneSnapshot | undefined>();
    const [running, setRunning] = useState(false);
    const [runError, setRunError] = useState<string | undefined>();
    const [tab, setTab] = useState<SceneTabId>("result");
    const [applyingCaseId, setApplyingCaseId] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    /* 草稿恢复：值 + 参考图资产 id；图丢了明确提示重选，不假装已恢复 */
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const restored = await hydrate(toolId);
            if (cancelled) return;
            const parsed = readSceneValues(restored?.values?.[DRAFT_SLOT] as Record<string, unknown> | undefined);
            setValues(parsed);
            if (!parsed.sourceAssetId) return;
            setRestoringSource(true);
            try {
                const { records } = await loadToolAssetRecords([parsed.sourceAssetId]);
                if (cancelled) return;
                const record = records[0];
                if (record) setSource(sceneSourceFromRecord(record));
                else setLostSource(true);
            } finally {
                if (!cancelled) setRestoringSource(false);
            }
        })();
        return () => {
            cancelled = true;
            void flushDraft(toolId);
        };
    }, [toolId, hydrate, flushDraft]);

    const update = useCallback(
        (next: Partial<SceneValues>) => {
            setValues((previous) => {
                const merged: SceneValues = { ...previous, ...next };
                patchDraft(toolId, {
                    values: { [DRAFT_SLOT]: merged },
                    assetIds: merged.sourceAssetId ? [merged.sourceAssetId] : [],
                });
                return merged;
            });
        },
        [patchDraft, toolId],
    );

    /** 真实能力：网关描述 + 当前渠道 apiFormat + 是否配置模型 */
    const descriptor = useMemo(() => describeToolExecution(PRODUCT_SCENE_TOOL_ID), []);
    const provider = useMemo(() => {
        if (!imageModel?.trim()) return "";
        try {
            return resolveModelChannel(config, imageModel).apiFormat;
        } catch {
            return "";
        }
    }, [config, imageModel]);
    const capability = useMemo(
        () =>
            sceneCapabilityFromDescriptor({
                modelId: values.modelId,
                modelReady: Boolean(imageModel?.trim()),
                provider,
                descriptor,
                similarityValue: values.similarity,
            }),
        [values.modelId, values.similarity, imageModel, provider, descriptor],
    );

    const output = useMemo(() => computeSceneOutput(values, source), [values, source]);
    const issues = useMemo(
        () =>
            validateSceneState({
                values,
                output,
                sourceReady: isSceneSourceReady(source),
                source: source ? { width: source.width, height: source.height } : undefined,
                imageModelReady: Boolean(imageModel?.trim()),
                capability,
            }),
        [values, output, source, imageModel, capability],
    );
    const blocked = running || issues.length > 0;

    const currentSnapshot = useMemo(
        () =>
            source && output.width > 0 && output.height > 0
                ? createSceneSnapshot(values, output, capability, { assetId: source.assetId }, draft?.revision ?? null)
                : undefined,
        [source, output, values, capability, draft?.revision],
    );
    const drift = useMemo(() => describeSceneDrift(snapshot, currentSnapshot), [snapshot, currentSnapshot]);
    const result = sceneResultFromTask(task, snapshot, currentSnapshot);
    const smart = capability.similarity === "auto";
    const strength = effectiveSceneStrength(values, capability);

    const onSourceChange = useCallback(
        (assetIds: string[], records: ToolAssetRecord[]) => {
            const record = records[0];
            if (!record) {
                setSource(undefined);
                setTask(undefined);
                setSnapshot(undefined);
                setLostSource(false);
                update({ sourceAssetId: "", imageName: "" });
                return;
            }
            const next = sceneSourceFromRecord(record);
            setSource(next);
            setLostSource(false);
            /* 换参考图 → 旧结果标记失效，但保留场景描述与配置 */
            setTask(undefined);
            setSnapshot(undefined);
            update({ sourceAssetId: next.assetId, imageName: next.name ?? "" });
            const limits = validateSceneSource(next);
            setRunError(limits.ok ? undefined : limits.message);
        },
        [update],
    );

    /** 「做同款」：真实入库该案例的原始素材，再回填提示词/张数/原图（不做静默降级）。 */
    const applyCase = useCallback(
        async (item: ToolCase) => {
            setApplyingCaseId(item.id);
            setRunError(undefined);
            try {
                const assets = await uploadCaseFiles(item);
                const slot = assets.source ? "source" : Object.keys(assets)[0];
                const record = slot ? (assets[slot] as ToolAssetRecord | undefined) : undefined;
                if (!record || Array.isArray(record)) throw new Error("该案例缺少可用的原始素材");
                const nextSource = sceneSourceFromRecord(record);
                setSource(nextSource);
                setLostSource(false);
                const apply = item.apply ?? {};
                update({
                    prompt: typeof apply.prompt === "string" ? apply.prompt : values.prompt,
                    similarity: typeof apply.similarity === "number" ? apply.similarity : values.similarity,
                    outputNum: typeof apply.outputNum === "number" ? apply.outputNum : values.outputNum,
                    sourceAssetId: nextSource.assetId,
                    imageName: nextSource.name ?? "",
                });
                setTab("result");
            } catch (error) {
                setRunError(error instanceof Error ? error.message : String(error));
            } finally {
                setApplyingCaseId(null);
            }
        },
        [update, values.prompt, values.similarity, values.outputNum],
    );

    const onGenerate = useCallback(async () => {
        if (!source) return;
        setRunning(true);
        setRunError(undefined);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            await flushDraft(toolId);
            const run = await runProductScene({
                gateway: getPersistedToolGateway(),
                values,
                output,
                capability,
                source,
                model: imageModel,
                revision: draft?.revision ?? null,
                imageModelReady: Boolean(imageModel?.trim()),
                signal: controller.signal,
                onUpdate: setTask,
            });
            setTask(run.task);
            setSnapshot(run.snapshot);
        } catch (error) {
            setRunError(error instanceof ProductSceneAdapterError || error instanceof Error ? error.message : "生成失败。");
        } finally {
            setRunning(false);
            abortRef.current = null;
        }
    }, [values, output, capability, source, imageModel, draft?.revision, flushDraft, toolId]);

    const onRetry = useCallback(async () => {
        if (!source || !task) return;
        setRunning(true);
        setRunError(undefined);
        try {
            const run = await retryProductScene({
                gateway: getPersistedToolGateway(),
                values,
                output,
                capability,
                source,
                model: imageModel,
                revision: draft?.revision ?? null,
                imageModelReady: Boolean(imageModel?.trim()),
                taskId: task.id,
                onUpdate: setTask,
            });
            setTask(run.task);
            setSnapshot(run.snapshot);
        } catch (error) {
            setRunError(error instanceof Error ? error.message : "重试失败。");
        } finally {
            setRunning(false);
        }
    }, [values, output, capability, source, imageModel, draft?.revision, task]);

    const onRetryCell = useCallback(
        async (index: number) => {
            if (!source) return;
            setRunning(true);
            setRunError(undefined);
            try {
                const single = await retrySceneVariant({
                    gateway: getPersistedToolGateway(),
                    values,
                    output,
                    capability,
                    source,
                    model: imageModel,
                    revision: draft?.revision ?? null,
                    onUpdate: setTask,
                    variantIndex: index,
                });
                setTask(single.task);
            } catch (error) {
                setRunError(error instanceof Error ? error.message : "单张重试失败。");
            } finally {
                setRunning(false);
            }
        },
        [values, output, capability, source, imageModel, draft?.revision],
    );

    const onCancel = useCallback(() => {
        abortRef.current?.abort();
        setRunning(false);
    }, []);

    const card = sceneModelCard(values.modelId);
    const showEmpty = !running && result.cells.every((cell) => cell.status === "missing" && !cell.dataUrl);

    return (
        <div className={`min-w-0 ${className ?? ""}`} data-tool="product-scene" data-layout="linkfox-two-pane">
            <OrigRail items={PRODUCT_SCENE_RAIL} active="场景裂变" driver testId="product-scene-rail" className="mb-2" />
            <div className="flex h-[calc(100dvh-193px)] min-h-[560px] w-full overflow-hidden rounded-[8px] border border-black/[0.06] bg-card">
                {/* 左栏：原站表单列 300px 白底，操作按钮固定在列底 */}
                <div className="flex h-full w-[300px] shrink-0 flex-col border-r border-border">
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3" data-testid="scene-form">
                        <SceneLayerComposer
                            toolId={toolId}
                            disabled={running}
                            source={source}
                            restoring={restoringSource}
                            lostSource={lostSource}
                            onChange={onSourceChange}
                        />

                        <div className="mt-4">
                            <SimilarityControl
                                values={values}
                                smart={smart}
                                effective={strength}
                                disabled={running}
                                onChange={update}
                            />
                            {smart ? (
                                <p id="scene-similarity-hint" className="mt-1 text-[11px] leading-4 text-muted-foreground">
                                    💡已选择智能模式，将根据模型自动生成场景
                                </p>
                            ) : null}
                        </div>

                        <div className="mt-4">
                            <FieldLabel
                                htmlFor="scene-prompt"
                                extra={
                                    <span className="text-[11px] tabular-nums text-muted-foreground" data-testid="scene-prompt-count">
                                        {values.prompt.length} / 100
                                    </span>
                                }
                            >
                                场景描述（可选）
                            </FieldLabel>
                            <textarea
                                id="scene-prompt"
                                value={values.prompt}
                                maxLength={SCENE_PROMPT_LIMIT}
                                disabled={running}
                                onChange={(event) => update({ prompt: event.target.value.slice(0, SCENE_PROMPT_LIMIT) })}
                                placeholder="描述想要的场景，例如：晨光下的北欧客厅，浅木色地板"
                                className="min-h-[84px] w-full resize-y rounded-[6px] border border-border bg-card p-2 text-[12px] leading-5 text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary"
                            />
                            <p className="mt-1 text-[11px] leading-4 text-primary">💡场景描述怎么写？</p>
                        </div>

                        <div className="mt-4">
                            <FieldLabel>生图模型</FieldLabel>
                            <div className="flex gap-2" role="radiogroup" aria-label="生图模型" data-testid="scene-modes">
                                {SCENE_MODELS.map((item) => {
                                    const active = values.modelId === item.id;
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            data-mode={item.id}
                                            disabled={running}
                                            onClick={() => update({ modelId: item.id })}
                                            className={`w-[60px] shrink-0 overflow-hidden rounded-[6px] border bg-card text-center transition ${
                                                active
                                                    ? "border-primary"
                                                    : "border-border hover:border-primary/40"
                                            } disabled:opacity-50`}
                                        >
                                            <span
                                                aria-hidden
                                                className="block h-[60px] w-full"
                                                style={{ background: MODEL_PREVIEW[item.id] }}
                                            />
                                            <span
                                                className={`block py-1 text-[12px] leading-4 ${
                                                    active ? "text-primary" : "text-muted-foreground"
                                                }`}
                                            >
                                                {item.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="sr-only" data-testid="scene-mode-hint" title={card.hint} aria-label={card.hint} />
                        </div>

                        <div className="mt-4">
                            <FieldLabel>设置生成尺寸</FieldLabel>
                            <div className="flex gap-2" role="radiogroup" aria-label="尺寸方式" data-testid="scene-size-type">
                                {(
                                    [
                                        { id: "default" as const, label: "默认尺寸" },
                                        { id: "custom" as const, label: "自定义" },
                                    ] as const
                                ).map((item) => {
                                    const active = values.sizeType === item.id;
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            data-size-type={item.id}
                                            disabled={running || (item.id === "custom" && !capability.customSize)}
                                            onClick={() => update({ sizeType: item.id })}
                                            className={`h-[30px] flex-1 rounded-[6px] border text-[12px] transition ${
                                                active
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border bg-card text-muted-foreground hover:border-primary/40"
                                            } disabled:opacity-50`}
                                        >
                                            {item.label}
                                        </button>
                                    );
                                })}
                            </div>

                            {values.sizeType === "custom" ? (
                                <div className="mt-2 grid grid-cols-2 gap-2" data-testid="scene-custom-size">
                                    <label className="text-[11px] leading-4 text-muted-foreground">
                                        宽
                                        <input
                                            type="number"
                                            min={SCENE_CUSTOM_SIZE.min}
                                            max={SCENE_CUSTOM_SIZE.max}
                                            step={SCENE_CUSTOM_SIZE.step}
                                            value={values.customWidth}
                                            disabled={running}
                                            onChange={(event) => update({ customWidth: Number(event.target.value) })}
                                            className="mt-1 h-8 w-full rounded-[6px] border border-border bg-card px-2 text-[12px] tabular-nums text-foreground outline-none focus:border-primary"
                                        />
                                    </label>
                                    <label className="text-[11px] leading-4 text-muted-foreground">
                                        高
                                        <input
                                            type="number"
                                            min={SCENE_CUSTOM_SIZE.min}
                                            max={SCENE_CUSTOM_SIZE.max}
                                            step={SCENE_CUSTOM_SIZE.step}
                                            value={values.customHeight}
                                            disabled={running}
                                            onChange={(event) => update({ customHeight: Number(event.target.value) })}
                                            className="mt-1 h-8 w-full rounded-[6px] border border-border bg-card px-2 text-[12px] tabular-nums text-foreground outline-none focus:border-primary"
                                        />
                                    </label>
                                </div>
                            ) : null}
                        </div>

                        <div className="mt-2">
                            <FieldLabel>选择生成张数</FieldLabel>
                            <div className="flex gap-2" role="radiogroup" aria-label="生成张数" data-testid="scene-output-num">
                                {capability.outputOptions.map((count) => {
                                    const active = values.outputNum === count;
                                    return (
                                        <button
                                            key={count}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            data-output-num={count}
                                            disabled={running}
                                            onClick={() => update({ outputNum: count })}
                                            className={`h-[26px] w-[42px] rounded-[4px] border text-[12px] tabular-nums transition ${
                                                active
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border bg-card text-muted-foreground hover:border-primary/40"
                                            } disabled:opacity-50`}
                                        >
                                            {count}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="shrink-0 border-t border-border px-4 py-3">
                        {issues.length > 0 && runError ? (
                            <ul className="mb-2 list-none space-y-0.5 text-[10px] leading-4 text-[#c47a1a]" data-testid="scene-issues">
                                {issues.map((issue) => (
                                    <li key={`${issue.code}-${issue.field}`}>· {issue.message}</li>
                                ))}
                            </ul>
                        ) : null}
                        {capability.notices.length > 0 ? (
                            <ul className="mb-2 list-none space-y-0.5 text-[10px] leading-4 text-muted-foreground" data-testid="scene-capability-notices">
                                {capability.notices.map((notice) => (
                                    <li key={notice}>· {notice}</li>
                                ))}
                            </ul>
                        ) : null}
                        {runError ? (
                            <p className="mb-2 text-[10px] leading-4 text-red-600" data-testid="scene-run-error">
                                {runError}
                            </p>
                        ) : null}
                        <button
                            type="button"
                            disabled={blocked || !source}
                            onClick={() => void onGenerate()}
                            data-testid="scene-generate"
                            className="flex h-8 w-full items-center justify-center gap-1 rounded-[4px] bg-primary text-[13px] font-medium leading-none text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/40"
                        >
                            <span>{running ? "裂变中…" : "立即生成"}</span>
                            <span className="ml-1 text-[11px] leading-4 text-muted-foreground">(40算力)</span>
                        </button>
                        <p className="mt-1.5 text-center text-[11px] leading-4 text-muted-foreground">我是高手，不再提醒</p>
                        <p className="sr-only" data-testid="scene-expected">
                            {describeSceneProduct(output, values.outputNum)} · {sceneOutputOptionLabel(values.outputNum)} ·{" "}
                            {modelLabel(imageModel)}
                        </p>
                    </div>
                </div>

                {/* 右栏：结果页签 + 浅灰画布 */}
                <div className="flex min-w-0 flex-1 flex-col bg-muted">
                    <div
                        className="flex h-[42px] shrink-0 items-center gap-1 border-b border-border bg-card px-3"
                        role="tablist"
                        aria-label="结果视图"
                    >
                        {SCENE_TABS.map((item) => {
                            const active = tab === item.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    data-testid={`scene-tab-${item.id}`}
                                    onClick={() => setTab(item.id)}
                                    className={`h-full px-3 text-[14px] leading-none transition ${
                                        active ? "font-medium text-primary" : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    {item.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {tab === "result" ? (
                            <div className="flex min-h-full flex-col gap-3 p-4">
                                {drift && task ? (
                                    <p
                                        className="rounded-[6px] border border-[#f0d9b0] bg-[#fdf6e8] px-3 py-1.5 text-[11px] leading-4 text-[#8a5d10]"
                                        data-testid="scene-stale"
                                    >
                                        配置已变更（{drift}），下面的结果来自上一版配置，请重新生成。
                                    </p>
                                ) : null}

                                {showEmpty ? (
                                    <div className="flex flex-1 items-center justify-center">
                                        <div
                                            className="flex h-[300px] w-[460px] max-w-full flex-col items-center justify-center gap-2 rounded-[12px] bg-card px-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                                            data-testid="scene-result-empty"
                                        >
                                            <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden className="mb-1">
                                                <rect x="4" y="8" width="32" height="24" rx="4" fill="var(--primary)" fillOpacity="0.1" />
                                                <circle cx="14" cy="17" r="3" fill="var(--primary)" fillOpacity="0.35" />
                                                <path d="M8 27l7-7 5 5 4-3 8 5" stroke="var(--primary)" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                            <p className="text-[20px] font-medium leading-7 text-foreground">上传商品场景参考图</p>
                                            <p className="text-[15px] leading-6 text-muted-foreground">
                                                3秒裂变出多张相似的场景图，快来裂变您的场景图吧~
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-[8px] bg-card p-3">
                                        <div className="mb-2 flex items-baseline justify-between gap-2">
                                            <h3 className="text-[13px] font-medium text-foreground">生成结果</h3>
                                            <span className="text-[11px] tabular-nums text-muted-foreground">
                                                本次 {result.expected} 张 · 已返回 {result.count} 张
                                            </span>
                                        </div>
                                        <SceneVariantGrid
                                            cells={result.cells}
                                            expected={result.expected}
                                            running={running}
                                            onRetryCell={(index) => void onRetryCell(index)}
                                        />
                                    </div>
                                )}

                                {panelTask || task ? (
                                    <div
                                        data-testid="product-scene-result-panel"
                                        data-tool-id={toolId}
                                        data-task-id={(panelTask ?? task)?.id}
                                        data-task-status={(panelTask ?? task)?.status}
                                    >
                                        <ToolResult
                                            task={(panelTask ?? task)!}
                                            toolId={toolId}
                                            title="结果资产"
                                            onCancel={running ? onCancel : undefined}
                                            onRetry={task && !running ? () => void onRetry() : undefined}
                                        />
                                    </div>
                                ) : null}
                                <WatermarkGroupPanel className="mt-2" />
                            </div>
                        ) : null}

                        {tab === "cases" ? (
                            <div className="p-4" data-testid="scene-cases">
                                <ToolCases
                                    cases={PRODUCT_SCENE_CASES}
                                    applyingId={applyingCaseId}
                                    onApply={applyCase}
                                    emptyHint="暂无优秀案例"
                                />
                            </div>
                        ) : null}

                        {tab === "history" ? (
                            <div className="p-4">
                                <ToolHistoryDock toolId={toolId} className="border border-border bg-card" />
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ProductSceneWorkspace;
