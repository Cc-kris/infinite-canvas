import { modelLabel } from "@/lib/model-label";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import { OrigRail, PRODUCT_SCENE_RAIL } from "@/components/tools/workspaces/orig-rail";
import { ToolCases } from "@/components/tools/tool-cases";
import type { ToolCase } from "@/components/tools/tool-cases";
import { ToolHistoryDock } from "@/components/tools/tool-history-dock";
import { ToolResult } from "@/components/tools/tool-result";
import { uploadCaseFiles } from "@/features/tools/case-apply";
import { PRODUCT_SCENE_CASES, PRODUCT_SCENE_GUIDE_CASES } from "@/features/tools/tool-cases-data";
import { ToolCaseGuide } from "@/components/tools/tool-case-guide";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import { DESIGN_GUIDE_PORTRAIT, DESIGN_OUTLINE_BUTTON, DESIGN_UPLOAD_DROPZONE, DESIGN_UPLOAD_PANEL, UploadPanelIcon } from "@/components/tools/workspaces/design-demo";
import { useConfigStore, resolveModelChannel } from "@/stores/use-config-store";
import { useAssetStore, type ImageAsset, type VideoAsset } from "@/stores/use-asset-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { describeToolExecution } from "@/services/api/tools/gateway";
import { getPersistedToolGateway } from "@/stores/use-tool-task-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";
import { productSceneResultPanelTask } from "@/features/tools/adapters/product-scene";
import { loadToolAssetRecords, toolAssetLibraryItemsFromAssets, type ToolAssetLibraryItem, type ToolAssetRecord } from "@/services/api/tools/assets";
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

/** 模型卡缩略图：原站官方示例图（cdn.linkfox.com/ai-site/workbench/style_*.png 同源下载到本地）。 */
const MODEL_PREVIEW: Record<string, string> = {
    realistic: "/__cases/design-common/style_realism.png",
    minimal: "/__cases/design-common/style_simplicity.png",
    smart: "/__cases/design-common/style_intelligent.png",
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
    library,
    syncIds,
    onChange,
}: {
    toolId: string;
    disabled: boolean;
    source?: ProductSceneSourceAsset;
    restoring: boolean;
    lostSource: boolean;
    library: ToolAssetLibraryItem[];
    syncIds?: string[];
    onChange: (assetIds: string[], records: ToolAssetRecord[]) => void;
}) {
    const navigate = useNavigate();
    const sourceIssue = source ? validateSceneSource(source) : undefined;
    return (
        <div className="min-w-0" data-testid="scene-source">
            {/* 原站 `_uploadPanel` 268×233：灰底卡 + 虚线上传框（图标 / 上传参考图 / 按钮组 / 限制） */}
            <div className={DESIGN_UPLOAD_PANEL}>
                <UploadPanelIcon />
                <ToolAssetInput
                    toolId={toolId}
                    title=""
                    constraints={SCENE_SOURCE_LIMITS}
                    maxCount={1}
                    disabled={disabled}
                    library={library}
                    variant="linkfox"
                    wide
                    className={DESIGN_UPLOAD_DROPZONE}
                    dropLabel="上传参考图"
                    hint="10M以内，分辨率：384*384 ~ 4096*4096，最大宽高比5"
                    syncIds={syncIds}
                    onChange={onChange}
                />
            </div>
            {restoring ? <p className="mt-2 text-[11px] text-muted-foreground">正在恢复上次的参考图…</p> : null}
            {lostSource ? <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">上次的参考图已失效，请重新上传。</p> : null}
            {sourceIssue && !sourceIssue.ok ? (
                <p className="mt-2 text-[11px] text-destructive" data-testid="scene-source-error">
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
                onClick={() => navigate("/tools/ecommerce-suite/product-image-suite")}
                className={DESIGN_OUTLINE_BUTTON}
                data-testid="scene-to-suite"
            >
                上传多图，体验新功能商品套图
                <ArrowRight aria-hidden="true" className="size-3.5" />
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
            {smart ? (
                <p id="scene-similarity-hint" className="rounded-[4px] bg-amber-500/10 p-[5px] text-[12px] leading-[22px] text-amber-700 dark:text-amber-300">
                    💡已选择智能模式，将根据模型自动生成场景
                </p>
            ) : (
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
                className="h-4 w-full accent-[var(--selected)] disabled:opacity-50"
            />
            )}
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
                                    <span className="text-amber-600 dark:text-amber-400">
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
    // 作品库（本地资产库）：上传卡上的「从作品库选择」从真实资产列表读取，不伪造商品库入口。
    const assets = useAssetStore((state) => state.assets);
    const library = useMemo(
        () => toolAssetLibraryItemsFromAssets(assets.filter((asset): asset is ImageAsset | VideoAsset => asset.kind === "image" || asset.kind === "video")),
        [assets],
    );

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
    /** 做同款回填后同步给上传区的资产 id（上传区自管列表，只改 source 不会刷新预览）。 */
    const [sourceSyncIds, setSourceSyncIds] = useState<string[] | undefined>(undefined);
    const abortRef = useRef<AbortController | null>(null);

    /* 草稿恢复：值 + 参考图资产 id；图丢了明确提示重选，不假装已恢复 */
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const restored = await hydrate(toolId);
            if (cancelled) return;
            const raw = restored?.values?.[DRAFT_SLOT] as Record<string, unknown> | undefined;
            if (!raw) return;
            const parsed = readSceneValues(raw);
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
            setSourceSyncIds(assetIds.length ? assetIds : undefined);
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
                setSourceSyncIds([record.id]);
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
            <ToolWorkspaceColumns
                configSide="left"
                className="h-[calc(100dvh-76px)] min-h-[560px] overflow-hidden rounded-[8px] border border-border"
                config={
                    <div className="flex h-full flex-col">
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3" data-testid="scene-form">
                        <SceneLayerComposer
                            toolId={toolId}
                            disabled={running}
                            source={source}
                            restoring={restoringSource}
                            lostSource={lostSource}
                            library={library}
                            syncIds={sourceSyncIds}
                            onChange={onSourceChange}
                        />

                        <div className="mt-[10px]">
                            <SimilarityControl
                                values={values}
                                smart={smart}
                                effective={strength}
                                disabled={running}
                                onChange={update}
                            />
                        </div>

                        <div className="mt-[10px]">
                            <FieldLabel htmlFor="scene-prompt" extra={<span className="text-[12px] leading-4 text-foreground">💡场景描述怎么写？</span>}>
                                场景描述（可选）
                            </FieldLabel>
                            <div className="relative rounded-[6px] border border-border bg-card pb-5 focus-within:border-primary">
                            <textarea
                                id="scene-prompt"
                                value={values.prompt}
                                maxLength={SCENE_PROMPT_LIMIT}
                                disabled={running}
                                onChange={(event) => update({ prompt: event.target.value.slice(0, SCENE_PROMPT_LIMIT) })}
                                placeholder="描述您想要的场景（在描述中包含上传的商品）。例如：把水壶放在客厅桌面上。"
                                className="block min-h-[74px] w-full resize-none rounded-[6px] bg-transparent px-[11px] py-1 text-[14px] leading-[22px] text-foreground outline-none placeholder:text-muted-foreground/60"
                            />
                            <span className="absolute bottom-0.5 right-2 text-[12px] tabular-nums text-muted-foreground" data-testid="scene-prompt-count">
                                {values.prompt.length} / 100
                            </span>
                            </div>
                        </div>

                        <details open className="group mt-[10px]">
                            <summary className="mb-2 flex cursor-pointer list-none items-center justify-between text-[12px] leading-4 text-muted-foreground [&::-webkit-details-marker]:hidden">
                                生图模型
                                <ChevronRight aria-hidden="true" className="size-3 transition group-open:rotate-90" />
                            </summary>
                            <div className="flex gap-[10px]" role="radiogroup" aria-label="生图模型" data-testid="scene-modes">
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
                                            className="w-[60px] shrink-0 text-center transition disabled:opacity-50"
                                        >
                                            <span className={`relative block size-[60px] overflow-hidden rounded-[6px] border-2 ${active ? "border-selected" : "border-transparent hover:border-selected"}`}>
                                                <img src={MODEL_PREVIEW[item.id]} alt="" className="size-full object-cover" draggable={false} />
                                                {active ? (
                                                    <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                                                        <Check aria-hidden="true" className="size-7 text-white" />
                                                    </span>
                                                ) : null}
                                            </span>
                                            <span
                                                className={`mt-1 block text-[12px] leading-[19px] ${
                                                    active ? "text-selected" : "text-muted-foreground"
                                                }`}
                                            >
                                                {item.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="sr-only" data-testid="scene-mode-hint" title={card.hint} aria-label={card.hint} />
                        </details>

                        <div className="mt-[10px]">
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
                                            className={`h-8 rounded-[6px] border px-[15px] text-[14px] transition ${
                                                active
                                                    ? "border-selected bg-selected-soft text-selected"
                                                    : "border-border bg-card text-muted-foreground hover:border-selected"
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

                        <div className="mt-[10px]">
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
                                                    ? "border-selected bg-selected-soft text-selected"
                                                    : "border-border bg-card text-muted-foreground hover:border-selected"
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
                            <ul className="mb-2 list-none space-y-0.5 text-[10px] leading-4 text-amber-600 dark:text-amber-400" data-testid="scene-issues">
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
                            <p className="mb-2 text-[10px] leading-4 text-destructive" data-testid="scene-run-error">
                                {runError}
                            </p>
                        ) : null}
                        <button
                            type="button"
                            disabled={blocked || !source}
                            onClick={() => void onGenerate()}
                            data-testid="scene-generate"
                            className="flex h-8 w-full items-center justify-center gap-1 rounded-[4px] bg-primary text-[13px] font-medium leading-none text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/40"
                        >
                            <span>{running ? "裂变中…" : "立即生成"}</span>
                        </button>
                        <p className="sr-only" data-testid="scene-expected">
                            {describeSceneProduct(output, values.outputNum)} · {sceneOutputOptionLabel(values.outputNum)} ·{" "}
                            {modelLabel(imageModel)}
                        </p>
                    </div>
                </div>
                }
            >
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
                                    className={`relative h-full px-3 leading-none transition ${item.id === "history" ? "ml-auto! text-[12px]" : "text-[14px]"} ${
                                        active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    {item.label}
                                    {active ? <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-foreground" /> : null}
                                </button>
                            );
                        })}
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {tab === "result" ? (
                            <div className="flex min-h-full flex-col gap-3 p-4">
                                {drift && task ? (
                                    <p
                                        className="rounded-[6px] border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] leading-4 text-amber-700 dark:text-amber-300"
                                        data-testid="scene-stale"
                                    >
                                        配置已变更（{drift}），下面的结果来自上一版配置，请重新生成。
                                    </p>
                                ) : null}

                                {showEmpty ? (
                                    <div className="flex flex-1 items-center justify-center pt-[26px]" data-testid="scene-result-empty">
                                        {/* 原站 `_caseGuide`：标题（542px 宽、两行）+ 竖图案例轮播 + 一键做同款（真实入库回填） */}
                                        <ToolCaseGuide
                                            className={`${DESIGN_GUIDE_PORTRAIT} [&>h2]:max-w-[542px]`}
                                            title="上传商品场景参考图，3秒裂变出多张相似的场景图，快来裂变您的场景图吧~"
                                            cases={PRODUCT_SCENE_GUIDE_CASES}
                                            applyingId={applyingCaseId}
                                            onApply={applyCase}
                                        />
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
                            </div>
                        ) : null}

                        {tab === "cases" ? (
                            <div className="flex flex-col gap-2 p-4" data-testid="scene-cases">
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
            </ToolWorkspaceColumns>
        </div>
    );
}

export default ProductSceneWorkspace;
