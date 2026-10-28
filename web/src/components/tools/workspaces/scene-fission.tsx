import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolResult } from "@/components/tools/tool-result";
import { useConfigStore, resolveModelChannel } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { describeToolExecution, getToolGateway } from "@/services/api/tools/gateway";
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

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
    return (
        <section className="min-w-0 rounded-lg border border-border bg-card p-3">
            <header className="mb-2 flex items-baseline gap-2">
                <h3 className="text-sm font-medium text-card-foreground">{title}</h3>
                {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
            </header>
            {children}
        </section>
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
        <Section title="商品/场景参考" hint="10M以内 · 分辨率 384×384 ~ 4096×4096 · 最大宽高比 5">
            <ToolAssetInput
                toolId={toolId}
                constraints={SCENE_SOURCE_LIMITS}
                maxCount={1}
                disabled={disabled}
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
                className="mt-2 min-h-9 text-left text-[11px] text-primary underline-offset-2 hover:underline"
                data-testid="scene-to-suite"
            >
                上传多图，体验商品套图
            </button>
        </Section>
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
            <div className="mb-1 flex items-center justify-between">
                <label htmlFor="scene-similarity-range" className="text-[11px] text-muted-foreground">
                    背景相似度
                </label>
                <span className="text-[11px] font-medium tabular-nums" data-testid="scene-similarity-value">
                    {smart ? `${effective}（智能）` : effective}
                </span>
            </div>
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
                className="h-9 w-full accent-primary disabled:opacity-50"
            />
            <p id="scene-similarity-hint" className="text-[11px] text-muted-foreground">
                {smart
                    ? "💡已选择智能模式，将根据模型自动生成场景，相似度由模型决定。"
                    : "相似度越高，越贴近参考图的背景结构；越低，场景变化越大。"}
            </p>
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
                上传商品场景参考图，3 秒裂变出多张相似的场景图
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
    const hydrate = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const flushDraft = useToolDraftStore((state) => state.flush);
    const draft = useToolDraftStore((state) => state.drafts[toolId]);
    const config = useConfigStore((state) => state.config);
    const imageModel = useConfigStore((state) => state.config.imageModel);

    const [values, setValues] = useState<SceneValues>(() => ({ ...DEFAULT_SCENE_VALUES }));
    const [source, setSource] = useState<ProductSceneSourceAsset | undefined>();
    const [restoringSource, setRestoringSource] = useState(false);
    const [lostSource, setLostSource] = useState(false);
    const [task, setTask] = useState<ToolTask | undefined>();
    const [snapshot, setSnapshot] = useState<SceneSnapshot | undefined>();
    const [running, setRunning] = useState(false);
    const [runError, setRunError] = useState<string | undefined>();
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

    const onGenerate = useCallback(async () => {
        if (!source) return;
        setRunning(true);
        setRunError(undefined);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            await flushDraft(toolId);
            const run = await runProductScene({
                gateway: getToolGateway(),
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
                gateway: getToolGateway(),
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
                    gateway: getToolGateway(),
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

    return (
        <div className={`flex min-w-0 flex-col gap-3 ${className ?? ""}`} data-tool="product-scene">
            <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
                <div className="flex min-w-0 flex-col gap-3">
                    <SceneLayerComposer
                        toolId={toolId}
                        disabled={running}
                        source={source}
                        restoring={restoringSource}
                        lostSource={lostSource}
                        onChange={onSourceChange}
                    />

                    <Section title="场景配置" hint={`输出 ${output.label}`}>
                        <SimilarityControl
                            values={values}
                            smart={smart}
                            effective={strength}
                            disabled={running}
                            onChange={update}
                        />

                        <p className="mt-3 mb-1 text-[11px] text-muted-foreground">生图模型</p>
                        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="生图模型" data-testid="scene-modes">
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
                                        className={`min-h-9 rounded-md border px-2 py-1 text-xs ${
                                            active
                                                ? "border-primary bg-primary text-primary-foreground"
                                                : "border-border text-foreground hover:bg-accent"
                                        }`}
                                    >
                                        {item.label}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground" data-testid="scene-mode-hint">
                            {card.hint}
                        </p>

                        <label htmlFor="scene-keyword" className="mt-3 block text-[11px] text-muted-foreground">
                            场景关键词（逗号分隔，进入 provider 的 sceneKeyword）
                        </label>
                        <input
                            id="scene-keyword"
                            type="text"
                            value={values.sceneKeyword}
                            disabled={running}
                            onChange={(event) => update({ sceneKeyword: event.target.value })}
                            placeholder="例如：木质桌面, 白色墙面, 绿植"
                            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
                        />

                        <label htmlFor="scene-prompt" className="mt-3 block text-[11px] text-muted-foreground">
                            场景描述（可选）
                        </label>
                        <textarea
                            id="scene-prompt"
                            value={values.prompt}
                            maxLength={SCENE_PROMPT_LIMIT}
                            disabled={running}
                            onChange={(event) => update({ prompt: event.target.value.slice(0, SCENE_PROMPT_LIMIT) })}
                            placeholder="描述想要的场景，例如：晨光下的北欧客厅，浅木色地板"
                            className="mt-1 min-h-20 w-full resize-y rounded-md border border-border bg-background p-2 text-xs"
                        />
                        <p className="mt-1 text-right text-[11px] tabular-nums text-muted-foreground" data-testid="scene-prompt-count">
                            {values.prompt.length} / {SCENE_PROMPT_LIMIT}
                        </p>
                    </Section>

                    <Section title="尺寸 / 数量" hint={describeSceneProduct(output, values.outputNum)}>
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
                                        className={`min-h-9 rounded-md border px-2 py-1 text-xs ${
                                            active
                                                ? "border-primary bg-primary text-primary-foreground"
                                                : "border-border text-foreground hover:bg-accent"
                                        } disabled:opacity-50`}
                                    >
                                        {item.label}
                                    </button>
                                );
                            })}
                        </div>

                        {values.sizeType === "custom" ? (
                            <div className="mt-2 grid grid-cols-2 gap-2" data-testid="scene-custom-size">
                                <label className="text-[11px] text-muted-foreground">
                                    宽
                                    <input
                                        type="number"
                                        min={SCENE_CUSTOM_SIZE.min}
                                        max={SCENE_CUSTOM_SIZE.max}
                                        step={SCENE_CUSTOM_SIZE.step}
                                        value={values.customWidth}
                                        disabled={running}
                                        onChange={(event) => update({ customWidth: Number(event.target.value) })}
                                        className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs tabular-nums"
                                    />
                                </label>
                                <label className="text-[11px] text-muted-foreground">
                                    高
                                    <input
                                        type="number"
                                        min={SCENE_CUSTOM_SIZE.min}
                                        max={SCENE_CUSTOM_SIZE.max}
                                        step={SCENE_CUSTOM_SIZE.step}
                                        value={values.customHeight}
                                        disabled={running}
                                        onChange={(event) => update({ customHeight: Number(event.target.value) })}
                                        className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs tabular-nums"
                                    />
                                </label>
                            </div>
                        ) : null}

                        <p className="mt-3 mb-1 text-[11px] text-muted-foreground">生成张数</p>
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
                                        className={`min-h-9 w-10 rounded-md border text-xs tabular-nums ${
                                            active
                                                ? "border-primary bg-primary text-primary-foreground"
                                                : "border-border text-foreground hover:bg-accent"
                                        }`}
                                    >
                                        {count}
                                    </button>
                                );
                            })}
                        </div>

                        <button
                            type="button"
                            disabled={blocked || !source}
                            onClick={() => void onGenerate()}
                            data-testid="scene-generate"
                            className="mt-3 min-h-10 w-full rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {running ? "裂变中…" : `立即生成 · ${sceneOutputOptionLabel(values.outputNum)}`}
                        </button>
                        <p className="mt-2 text-[11px] text-muted-foreground" data-testid="scene-expected">
                            {describeSceneProduct(output, values.outputNum)} · 模型：{imageModel?.trim() || "未配置"}
                        </p>
                        {issues.length > 0 ? (
                            <ul className="mt-2 list-disc pl-4 text-[11px] text-amber-600" data-testid="scene-issues">
                                {issues.map((issue) => (
                                    <li key={`${issue.code}-${issue.field}`}>{issue.message}</li>
                                ))}
                            </ul>
                        ) : null}
                        {capability.notices.length > 0 ? (
                            <ul className="mt-2 list-disc pl-4 text-[11px] text-muted-foreground" data-testid="scene-capability-notices">
                                {capability.notices.map((notice) => (
                                    <li key={notice}>{notice}</li>
                                ))}
                            </ul>
                        ) : null}
                        {runError ? (
                            <p className="mt-2 text-[11px] text-red-600" data-testid="scene-run-error">
                                {runError}
                            </p>
                        ) : null}
                    </Section>
                </div>

                <div className="flex min-w-0 flex-col gap-3">
                    <Section title="生成结果" hint={`本次 ${result.expected} 张 · 已返回 ${result.count} 张`}>
                        {drift && task ? (
                            <p
                                className="mb-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                data-testid="scene-stale"
                            >
                                配置已变更（{drift}），下面的结果来自上一版配置，请重新生成。
                            </p>
                        ) : null}
                        <SceneVariantGrid
                            cells={result.cells}
                            expected={result.expected}
                            running={running}
                            onRetryCell={(index) => void onRetryCell(index)}
                        />
                    </Section>

                    <ToolResult
                        task={task}
                        toolId={toolId}
                        title="结果资产"
                        onCancel={running ? onCancel : undefined}
                        onRetry={task && !running ? () => void onRetry() : undefined}
                    />
                </div>
            </div>
        </div>
    );
}

export default ProductSceneWorkspace;
