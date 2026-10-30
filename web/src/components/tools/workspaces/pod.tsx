import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ImageOff, ImagePlus, Loader2, Maximize, Minus, Move, Palette, Plus, Redo2, RotateCcw, RotateCw, Sparkles, Trash2, Undo2, Upload } from "lucide-react";

import { HistoryRecordPanel } from "@/components/tools/history-record-panel";
import { MaterialSourcePanel } from "@/components/tools/material-source-panel";
import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolCases } from "@/components/tools/tool-cases";
import type { ToolCase } from "@/components/tools/tool-cases";
import { ToolResult } from "@/components/tools/tool-result";
import { cn } from "@/lib/utils";
import { OrigRail, PRODUCT_DESIGN_RAIL } from "@/components/tools/workspaces/orig-rail";
import { loadToolAssetRecords, uploadToolAsset, type ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { resolveModelChannel, selectableModelsByCapability, useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";

import {
    AI_TEXT_CATALOG_NOTICE,
    AI_TEXT_PROMPT_LIMIT,
    AI_TEXT_SIMPLE_PROMPT_LIMIT,
    AI_TEXT_TILING_PRESETS,
    AI_TEXT_TOOL_ID,
    AI_TEXT_UPLOAD_LIMITS,
    aiTextPageCatalogDimensions,
    aiTextStyleLabelCn,
    aiTextTilingPreset,
    buildAiTextAutoPrompt,
    buildAiTextPrompt,
    canRedoAiTextPlacement,
    canUndoAiTextPlacement,
    clampAiTextOutputNum,
    clampAiTextPlacement,
    commitAiTextPlacement,
    createAiTextPlacementHistory,
    createAiTextSnapshot,
    createAiTextValues,
    describeAiTextDrift,
    hasBlockingAiTextIssue,
    isAiTextAutopromptActive,
    moveAiTextPlacement,
    placementKeyboardDelta,
    readAiTextValues,
    redoAiTextPlacement,
    resolveAiTextCatalog,
    scaleAiTextPlacement,
    undoAiTextPlacement,
    validateAiTextState,
    type AiTextPlacementHistory,
    type AiTextSnapshot,
    type AiTextValues,
} from "@/features/tools/registry/ai-text";
import {
    AiTextAdapterError,
    aiTextResponseId,
    aiTextResultFromTask,
    aiTextResultNotice,
    assertAiTextInput,
    buildAiTextInput,
    createAiTextRequestId,
    isAiTextSourceReady,
    validateAiTextSource,
    type AiTextSourceAsset,
} from "@/features/tools/adapters/ai-text";
import {
    SdsAdapterError,
    assertSdsDesignInput,
    buildSdsDesignInput,
    createSdsRequestId,
    isSdsSourceReady,
    sdsDesignResultFromTask,
    sdsDesignResultNotice,
    sdsMissingIndexes,
    sdsRepairIndexes,
    sdsResponseId,
    validateSdsSource,
    type SdsResult,
    type SdsSourceAsset,
} from "@/features/tools/adapters/sds-design";
import {
    DEFAULT_SDS_COLOR_ID,
    SDS_COLOR_OPTIONS,
    SDS_DESIGN_TOOL_ID,
    SDS_MATERIAL_COUNT,
    SDS_TILING_PRESETS,
    SDS_UPLOAD_LIMITS,
    applySdsPlacementAction,
    applySdsPlacementRecord,
    sdsAssetFields,
    canRedoSdsPlacement,
    canUndoSdsPlacement,
    commitSdsPlacement,
    createSdsMaterial,
    createSdsPlacementHistory,
    createSdsSnapshot,
    createSdsValues,
    describeSdsDrift,
    isSdsReady,
    parseSdsDraft,
    patchSdsPlacement,
    placementRecordFromMaterials,
    reconcileSdsValues,
    redoSdsPlacement,
    sdsColorOption,
    sdsDraftAssetIds,
    sdsPlacementKeyAction,
    sdsPrintableArea,
    sdsSelectedMaterial,
    sdsSubmitLabel,
    sdsTilingPreset,
    serializeSdsValues,
    undoSdsPlacement,
    validateSdsDesignState,
    type SdsAssetLike,
    type SdsPlacementHistory,
    type SdsSnapshot,
    type SdsTilingPresetId,
    type SdsValues,
} from "@/features/tools/registry/sds-design";
import { uploadCaseFiles } from "@/features/tools/case-apply";
import { SDS_DESIGN_CASES } from "@/features/tools/tool-cases-data";
import { WatermarkGroupPanel } from "@/components/tools/watermark-group-panel";

/**
 * TASK-029：AI_TEXT（POD素材）工作区。
 *
 * 布局（page-spec 22 §6）：左「素材与风格」｜中「平铺预览」｜右「结果」；
 * ≥1200px 三栏，≤1199px 结果移到下方，≤767px 收成三 Tab（素材/预览/结果）。
 *
 * 真实执行边界：
 * - 所有字段由 adapters/ai-text.buildAiTextInput 组装，提交前 assertAiTextInput 逐项核对；
 * - 提交走 useToolTaskStore.runTool（真实 gateway → provider），没有本地假图、没有 setTimeout 假进度；
 * - 目录未加载时按 registry 的目录回退 + 明确提示，不静默丢弃未知枚举。
 */

const toolId = AI_TEXT_TOOL_ID;

const fieldClass =
    "w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus-visible:border-[var(--primary)]";
const labelClass = "flex flex-col gap-1.5 text-xs font-medium text-[var(--muted-foreground)]";
const cardClass = "rounded-xl border border-[var(--border)] bg-[var(--card)] p-3";

function toSource(record: ToolAssetRecord | undefined): AiTextSourceAsset | undefined {
    if (!record) return undefined;
    return {
        assetId: record.id,
        dataUrl: record.url?.startsWith("data:") ? record.url : undefined,
        url: record.url,
        name: record.name,
        mimeType: record.mimeType,
        bytes: record.bytes,
        width: record.width,
        height: record.height,
    };
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (next: boolean) => void; label: string; hint?: string }) {
    return (
        <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--primary)]" checked={checked} onChange={(event) => onChange(event.target.checked)} />
            <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm text-[var(--foreground)]">{label}</span>
                {hint ? <span className="text-[11px] leading-4 text-[var(--muted-foreground)]">{hint}</span> : null}
            </span>
        </label>
    );
}

export function PodMaterialWorkspace() {
    const config = useConfigStore((state) => state.config);
    const imageModels = useMemo(() => selectableModelsByCapability(config, "image"), [config]);
    const model = config.imageModel || imageModels[0] || "";
    const modelReady = Boolean(model && resolveModelChannel(config, model));

    const [values, setValues] = useState<AiTextValues>(() => createAiTextValues());
    const [records, setRecords] = useState<ToolAssetRecord[]>([]);
    const [hydrated, setHydrated] = useState(false);
    const [notice, setNotice] = useState("");
    const [errorText, setErrorText] = useState("");
    const [running, setRunning] = useState(false);
    const [snapshot, setSnapshot] = useState<AiTextSnapshot | undefined>();
    const [placement, setPlacement] = useState<AiTextPlacementHistory>(() => createAiTextPlacementHistory());
    const [tab, setTab] = useState<"material" | "preview" | "result">("material");
    const abortRef = useRef<AbortController | null>(null);
    const dragRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);

    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const draftRevision = useToolDraftStore((state) => state.drafts[toolId]?.revision ?? null);
    const tasks = useToolTaskStore((state) => state.tasks);
    const runTool = useToolTaskStore((state) => state.runTool);
    const retryTask = useToolTaskStore((state) => state.retryTask);

    const source = useMemo(() => toSource(records[0]), [records]);
    const catalog = useMemo(() => resolveAiTextCatalog({}), []);
    const pageCatalogDimensions = useMemo(() => aiTextPageCatalogDimensions({}), []);
    const sourceReady = isAiTextSourceReady(source);

    useEffect(() => {
        let alive = true;
        void (async () => {
            const draft = await hydrateDraft(toolId);
            if (!alive) return;
            if (draft) setValues(readAiTextValues(draft.values));
            setHydrated(true);
        })();
        return () => {
            alive = false;
        };
    }, [hydrateDraft]);

    const update = useCallback(
        (updater: (previous: AiTextValues) => AiTextValues) => {
            setValues((previous) => {
                const next = updater(previous);
                patchDraft(toolId, { values: next as unknown as Record<string, unknown> });
                return next;
            });
        },
        [patchDraft],
    );

    const setField = useCallback(
        <K extends keyof AiTextValues>(key: K, value: AiTextValues[K]) => update((previous) => ({ ...previous, [key]: value })),
        [update],
    );

    const issues = useMemo(
        () => validateAiTextState({ values, sourceReady, modelReady, options: {} }),
        [values, sourceReady, modelReady],
    );
    const blocked = hasBlockingAiTextIssue(issues);

    const task = useMemo(() => {
        const own = Object.values(tasks).filter((item) => item.toolId === toolId);
        return own.sort((a, b) => b.createdAt - a.createdAt)[0];
    }, [tasks]);

    const currentSnapshot = useMemo(
        () => (source && hydrated ? createAiTextSnapshot(values, { assetId: source.assetId }, draftRevision, snapshot?.requestId ?? "") : undefined),
        [values, source, draftRevision, hydrated, snapshot?.requestId],
    );
    const drift = useMemo(() => describeAiTextDrift(snapshot, currentSnapshot), [snapshot, currentSnapshot]);
    const result = useMemo(
        () => aiTextResultFromTask(task, snapshot, currentSnapshot, drift),
        [task, snapshot, currentSnapshot, drift],
    );

    const previewPrompt = useMemo(
        () => (isAiTextAutopromptActive(values) ? buildAiTextAutoPrompt(values) : buildAiTextPrompt(values)),
        [values],
    );

    const handleRecords = useCallback(
        (_assetIds: string[], nextRecords: ToolAssetRecord[]) => {
            setRecords(nextRecords);
            const first = nextRecords[0];
            const nextSource = toSource(first);
            update((previous) => ({ ...previous, sourceAssetId: nextSource?.assetId }));
            if (nextSource) {
                const check = validateAiTextSource(nextSource);
                setNotice(check.ok ? "" : check.message);
            } else {
                setNotice("");
            }
        },
        [update],
    );

    const handleSubmit = useCallback(async () => {
        if (!source) {
            setErrorText("请先上传 POD 素材底图。");
            return;
        }
        if (blocked) {
            setErrorText(issues[0]?.message ?? "配置不完整，无法提交。");
            return;
        }
        setErrorText("");
        setNotice("");
        setRunning(true);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const requestId = createAiTextRequestId();
            const input = buildAiTextInput({ values, source, model, requestId, revision: draftRevision });
            assertAiTextInput(input, values, requestId);
            setSnapshot(createAiTextSnapshot(values, { assetId: source.assetId }, draftRevision, requestId));
            const next = await runTool(input, { draftRevision, signal: controller.signal });
            if (next.status === "failed") setErrorText(next.error?.message ?? "生成失败：上游未返回原因。");
        } catch (error) {
            setErrorText(error instanceof AiTextAdapterError || error instanceof Error ? error.message : String(error));
        } finally {
            setRunning(false);
            abortRef.current = null;
        }
    }, [blocked, draftRevision, issues, model, runTool, source, values]);

    const handleRetry = useCallback(async () => {
        if (!task || !source) return;
        setErrorText("");
        setRunning(true);
        try {
            const requestId = createAiTextRequestId();
            const input = buildAiTextInput({ values, source, model, requestId, revision: draftRevision });
            assertAiTextInput(input, values, requestId);
            const next = await retryTask(task.id, input, { draftRevision });
            if (next.status === "failed") setErrorText(next.error?.message ?? "重试失败：上游未返回原因。");
        } catch (error) {
            setErrorText(error instanceof Error ? error.message : String(error));
        } finally {
            setRunning(false);
        }
    }, [draftRevision, model, retryTask, source, task, values]);

    /* ---------------- 平铺预览拖拽 / 键盘 ---------------- */

    const commitPlacement = useCallback((next: { x: number; y: number; scale: number }) => {
        setPlacement((history) => commitAiTextPlacement(history, clampAiTextPlacement(next)));
    }, []);

    const onPointerDown = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            const rect = event.currentTarget.parentElement?.getBoundingClientRect();
            if (!rect) return;
            (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
            dragRef.current = {
                x: event.clientX,
                y: event.clientY,
                originX: placement.present.x,
                originY: placement.present.y,
            };
        },
        [placement.present.x, placement.present.y],
    );

    const onPointerMove = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            const drag = dragRef.current;
            const rect = event.currentTarget.parentElement?.getBoundingClientRect();
            if (!drag || !rect || rect.width === 0 || rect.height === 0) return;
            commitPlacement({
                x: drag.originX + (event.clientX - drag.x) / rect.width,
                y: drag.originY + (event.clientY - drag.y) / rect.height,
                scale: placement.present.scale,
            });
        },
        [commitPlacement, placement.present.scale],
    );

    const onPointerUp = useCallback(() => {
        dragRef.current = null;
    }, []);

    const onPreviewKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            const meta = event.metaKey || event.ctrlKey;
            if (meta && event.key.toLowerCase() === "z") {
                event.preventDefault();
                setPlacement((history) => (event.shiftKey ? redoAiTextPlacement(history) : undoAiTextPlacement(history)));
                return;
            }
            if (event.key === "+" || event.key === "=" || event.key === "-") {
                event.preventDefault();
                const step = event.key === "-" ? -0.05 : 0.05;
                setPlacement((history) => commitAiTextPlacement(history, scaleAiTextPlacement(history.present, step)));
                return;
            }
            const delta = placementKeyboardDelta(event.key);
            if (!delta) return;
            event.preventDefault();
            setPlacement((history) => commitAiTextPlacement(history, moveAiTextPlacement(history.present, delta.x, delta.y)));
        },
        [],
    );

    const preset = aiTextTilingPreset(values.tilingPresetId);
    const auto = isAiTextAutopromptActive(values);

    return (
        <div className="flex flex-col gap-4">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold text-[var(--foreground)]">POD 素材</h1>
                    <p className="text-xs text-[var(--muted-foreground)]">图案 / 文字素材生成，支持平铺规则、案例变体与真实 provider 出图。</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                    {pageCatalogDimensions.length ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-1">
                            <AlertTriangle className="h-3 w-3" />
                            目录：{pageCatalogDimensions.join(" / ")}
                        </span>
                    ) : null}
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1", modelReady ? "text-[var(--foreground)]" : "text-amber-500")}>
                        {modelReady ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                        {modelReady ? model : "未配置图片模型"}
                    </span>
                </div>
            </header>

            <div className="flex gap-2 md:hidden" role="tablist" aria-label="POD 素材分区">
                {([
                    ["material", "素材与风格"],
                    ["preview", "平铺预览"],
                    ["result", "结果"],
                ] as const).map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={tab === key}
                        onClick={() => setTab(key)}
                        className={cn(
                            "min-h-10 flex-1 rounded-lg border px-3 text-sm",
                            tab === key ? "border-[var(--primary)] text-[var(--foreground)]" : "border-[var(--border)] text-[var(--muted-foreground)]",
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_380px]">
                {/* 左：素材与风格 */}
                <section className={cn("flex flex-col gap-3", tab === "material" ? "" : "hidden md:flex")} aria-label="素材与风格">
                    <div className={cardClass}>
                        <ToolAssetInput
                            toolId={toolId}
                            title="上传底图（参考图）"
                            maxCount={1}
                            onChange={handleRecords}
                            constraints={{
                                kind: "image",
                                mimeTypes: [...AI_TEXT_UPLOAD_LIMITS.mimeTypes],
                                maxBytes: AI_TEXT_UPLOAD_LIMITS.maxBytes,
                                minWidth: AI_TEXT_UPLOAD_LIMITS.minSide,
                                minHeight: AI_TEXT_UPLOAD_LIMITS.minSide,
                                maxWidth: AI_TEXT_UPLOAD_LIMITS.maxSide,
                                maxHeight: AI_TEXT_UPLOAD_LIMITS.maxSide,
                            }}
                        />
                    </div>

                    <div className={cn(cardClass, "flex flex-col gap-3")}>
                        <label className={labelClass}>
                            素材模式
                            <select className={fieldClass} value={values.mode} onChange={(event) => setField("mode", event.target.value)}>
                                <option value="">请选择</option>
                                {catalog.modes.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className={labelClass}>
                            输出比例
                            <select className={fieldClass} value={values.ratio} onChange={(event) => setField("ratio", event.target.value)}>
                                <option value="">请选择</option>
                                {catalog.ratios.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className={labelClass}>
                            风格
                            <select
                                className={fieldClass}
                                value={values.styles}
                                onChange={(event) => {
                                    const next = event.target.value;
                                    update((previous) => ({ ...previous, styles: next, stylesCn: aiTextStyleLabelCn(next) }));
                                }}
                            >
                                <option value="">不指定</option>
                                {catalog.styles.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className={labelClass}>
                            中文风格
                            <select className={fieldClass} value={values.stylesCn} onChange={(event) => setField("stylesCn", event.target.value)}>
                                <option value="">不指定</option>
                                {catalog.stylesCn.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className={labelClass}>
                            输出数量（{1}–{15}）
                            <input
                                type="number"
                                min={1}
                                max={15}
                                className={fieldClass}
                                value={values.outputNum}
                                onChange={(event) => setField("outputNum", clampAiTextOutputNum(event.target.value))}
                            />
                        </label>
                    </div>

                    <div className={cn(cardClass, "flex flex-col gap-3")}>
                        <div className="flex gap-1 rounded-lg border border-[var(--border)] p-1" role="tablist" aria-label="提示词模式">
                            {([
                                ["simple", "简易文字"],
                                ["full", "完整提示词"],
                            ] as const).map(([key, label]) => (
                                <button
                                    key={key}
                                    type="button"
                                    role="tab"
                                    aria-selected={values.editor === key}
                                    onClick={() => setField("editor", key)}
                                    className={cn(
                                        "min-h-10 flex-1 rounded-md text-sm",
                                        values.editor === key ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)]",
                                    )}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        {values.editor === "simple" || auto ? (
                            <label className={labelClass}>
                                简短提示词 / 文案（≤{AI_TEXT_SIMPLE_PROMPT_LIMIT} 字）
                                <textarea
                                    className={cn(fieldClass, "min-h-20 resize-y")}
                                    value={values.aiSimpleTextPrompt}
                                    onChange={(event) => setField("aiSimpleTextPrompt", event.target.value.slice(0, AI_TEXT_SIMPLE_PROMPT_LIMIT))}
                                />
                                <span className="text-[11px] text-[var(--muted-foreground)]">{values.aiSimpleTextPrompt.length}/{AI_TEXT_SIMPLE_PROMPT_LIMIT}</span>
                            </label>
                        ) : null}

                        {values.editor === "full" && !auto ? (
                            <label className={labelClass}>
                                完整提示词（≤{AI_TEXT_PROMPT_LIMIT} 字）
                                <textarea
                                    className={cn(fieldClass, "min-h-32 resize-y")}
                                    value={values.prompt}
                                    onChange={(event) => setField("prompt", event.target.value.slice(0, AI_TEXT_PROMPT_LIMIT))}
                                />
                                <span className="text-[11px] text-[var(--muted-foreground)]">{values.prompt.length}/{AI_TEXT_PROMPT_LIMIT}</span>
                            </label>
                        ) : null}

                        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-[var(--border)] p-2">
                            <Toggle
                                checked={values.useAutopromptOption}
                                onChange={(checked) => update((previous) => ({ ...previous, useAutopromptOption: checked, autopromptUnlocked: false }))}
                                label="自动扩写提示词"
                                hint="本地确定性扩写，不调用上游；扩写结果会进预览与真实请求。"
                            />
                            {values.useAutopromptOption ? (
                                <button
                                    type="button"
                                    className="inline-flex min-h-10 items-center gap-1 self-start rounded-lg border border-[var(--border)] px-3 text-xs"
                                    onClick={() =>
                                        update((previous) => ({
                                            ...previous,
                                            autopromptUnlocked: !previous.autopromptUnlocked,
                                            prompt: previous.autopromptUnlocked ? previous.prompt : buildAiTextAutoPrompt(previous).slice(0, AI_TEXT_PROMPT_LIMIT),
                                            editor: previous.autopromptUnlocked ? previous.editor : "full",
                                        }))
                                    }
                                >
                                    <Sparkles className="h-3.5 w-3.5" />
                                    {values.autopromptUnlocked ? "恢复自动扩写" : "解锁手改"}
                                </button>
                            ) : null}
                        </div>

                        <Toggle checked={values.variationStrength} onChange={(checked) => setField("variationStrength", checked)} label="增强变化强度" hint="同风格下的构图差异更明显。" />
                        <Toggle checked={values.isCase} onChange={(checked) => setField("isCase", checked)} label="作为案例变体提交" />
                    </div>
                </section>

                {/* 中：平铺预览 */}
                <section className={cn("flex flex-col gap-3", tab === "preview" ? "" : "hidden md:flex")} aria-label="平铺预览">
                    <div className={cn(cardClass, "flex flex-col gap-3")}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-[var(--foreground)]">平铺预览</span>
                                <span className="text-[11px] text-[var(--muted-foreground)]">
                                    {preset.label} · {preset.hint}
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    aria-label="撤销位置调整"
                                    title="撤销 (⌘Z)"
                                    disabled={!canUndoAiTextPlacement(placement)}
                                    onClick={() => setPlacement((history) => undoAiTextPlacement(history))}
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] disabled:opacity-40"
                                >
                                    <Undo2 className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    aria-label="重做位置调整"
                                    title="重做 (⇧⌘Z)"
                                    disabled={!canRedoAiTextPlacement(placement)}
                                    onClick={() => setPlacement((history) => redoAiTextPlacement(history))}
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] disabled:opacity-40"
                                >
                                    <Redo2 className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    aria-label="复位位置"
                                    onClick={() => commitPlacement({ x: 0.5, y: 0.5, scale: 1 })}
                                    className="inline-flex h-10 items-center gap-1 rounded-lg border border-[var(--border)] px-3 text-xs"
                                >
                                    <RotateCcw className="h-4 w-4" />
                                    复位
                                </button>
                            </div>
                        </div>

                        <div
                            className="relative aspect-square w-full overflow-hidden rounded-lg border border-[var(--border)] bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]"
                            tabIndex={0}
                            role="application"
                            aria-label="平铺预览画布：方向键移动，+/- 缩放，⌘Z 撤销"
                            onKeyDown={onPreviewKeyDown}
                        >
                            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${preset.columns}, minmax(0,1fr))`, gridTemplateRows: `repeat(${preset.rows}, minmax(0,1fr))` }}>
                                {Array.from({ length: preset.columns * preset.rows }).map((_, index) => {
                                    const row = Math.floor(index / preset.columns);
                                    const shifted = preset.stagger && row % 2 === 1;
                                    return (
                                        <div key={index} className="relative overflow-hidden border border-dashed border-[var(--border)]/60" style={{ transform: shifted ? "translateX(50%)" : undefined }}>
                                            {source?.url ? <img src={source.url} alt="" className="h-full w-full object-cover opacity-90" draggable={false} /> : <div className="flex h-full items-center justify-center text-[11px] text-[var(--muted-foreground)]">待上传</div>}
                                        </div>
                                    );
                                })}
                            </div>

                            <div
                                role="slider"
                                aria-label="文字落位框"
                                aria-valuetext={`x ${(placement.present.x * 100).toFixed(0)}% / y ${(placement.present.y * 100).toFixed(0)}% / 缩放 ${placement.present.scale.toFixed(2)}`}
                                aria-valuenow={Math.round(placement.present.x * 100)}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                tabIndex={0}
                                onPointerDown={onPointerDown}
                                onPointerMove={onPointerMove}
                                onPointerUp={onPointerUp}
                                onPointerCancel={onPointerUp}
                                className="absolute cursor-move touch-none rounded border-2 border-dashed border-[var(--primary)] bg-[var(--primary)]/10 px-2 py-1 text-[11px] text-[var(--foreground)]"
                                style={{
                                    left: `${placement.present.x * 100}%`,
                                    top: `${placement.present.y * 100}%`,
                                    transform: `translate(-50%, -50%) scale(${placement.present.scale})`,
                                }}
                            >
                                文字区
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-1">
                            {AI_TEXT_TILING_PRESETS.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    aria-pressed={values.tilingPresetId === item.id}
                                    onClick={() => setField("tilingPresetId", item.id)}
                                    className={cn(
                                        "min-h-10 rounded-lg border px-3 text-xs",
                                        values.tilingPresetId === item.id
                                            ? "border-[var(--primary)] text-[var(--foreground)]"
                                            : "border-[var(--border)] text-[var(--muted-foreground)]",
                                    )}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>

                        <details className="rounded-lg border border-[var(--border)] p-2">
                            <summary className="cursor-pointer text-xs text-[var(--muted-foreground)]">将进入请求的提示词（{auto ? "自动扩写" : "按模式生成"}）</summary>
                            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-[var(--foreground)]">{previewPrompt}</pre>
                        </details>
                    </div>
                </section>

                {/* 右：结果 */}
                <section className={cn("flex flex-col gap-3", tab === "result" ? "" : "hidden md:flex")} aria-label="生成结果">
                    <div className={cn(cardClass, "flex flex-col gap-2")}>
                        {issues.length ? (
                            <ul className="flex flex-col gap-1 text-xs text-amber-500">
                                {issues.slice(0, 4).map((issue) => (
                                    <li key={issue.code + issue.field} className="flex gap-1">
                                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                        <span>{issue.message}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="flex items-center gap-1 text-xs text-emerald-500">
                                <Check className="h-3 w-3" /> 配置完整，可提交真实生成
                            </p>
                        )}
                        {notice ? <p className="text-xs text-amber-500">{notice}</p> : null}
                        {errorText ? <p className="text-xs text-red-500">{errorText}</p> : null}
                        <p className="text-[11px] leading-4 text-[var(--muted-foreground)]">{AI_TEXT_CATALOG_NOTICE}</p>

                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={running || blocked}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-[var(--primary-foreground)] disabled:opacity-50"
                        >
                            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {running ? "生成中…" : "生成 POD 素材"}
                        </button>
                        {task && (task.status === "failed" || task.status === "unknown" || task.status === "cancelled") && source ? (
                            <button
                                type="button"
                                onClick={handleRetry}
                                disabled={running}
                                className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-[var(--border)] text-xs disabled:opacity-50"
                            >
                                <RotateCcw className="h-3.5 w-3.5" /> 同快照重试
                            </button>
                        ) : null}
                        {result.stale ? <p className="text-xs text-amber-500">结果来自旧版本（已修改：{result.drift}），请重新生成。</p> : null}
                        {aiTextResultNotice(result) ? <p className="text-xs text-[var(--muted-foreground)]">{aiTextResultNotice(result)}</p> : null}
                        {task ? <p className="text-[11px] text-[var(--muted-foreground)]">响应 id：{aiTextResponseId(task) || "——（上游未回填）"}</p> : null}
                    </div>

                    <ToolResult task={task ?? null} toolId={toolId} title="POD 素材结果" onRetry={handleRetry} />
                </section>
            </div>
        </div>
    );
}

/* =====================================================================================
 * TASK-031：SDS_DESIGN（素材贴合）
 * 布局（page-spec 24 §3）：左「素材」｜中「素材操作」画布｜右「结果」。
 * 真实执行边界：字段由 adapters/sds-design 组装并逐项核对，提交走 runTool 真实 gateway，
 * 没有本地假图/假进度；商品图与素材都来自 ToolAssetInput 的真实上传。
 * ===================================================================================== */

const sdsCardClass = "rounded-xl border border-[var(--border)] bg-[var(--card)] p-3";
const sdsFieldClass =
    "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--primary)]";

function toSdsAsset(record: ToolAssetRecord): SdsAssetLike {
    return {
        id: record.id,
        name: record.name,
        url: record.url,
        mimeType: record.mimeType,
        bytes: record.bytes,
        width: record.width,
        height: record.height,
    };
}

function toSdsSource(record: ToolAssetRecord): SdsSourceAsset {
    return {
        assetId: record.id,
        url: record.url,
        name: record.name,
        mimeType: record.mimeType,
        bytes: record.bytes,
        width: record.width,
        height: record.height,
    };
}

/** 平铺缩略图：列/行/错位与 preset 定义一一对应，纯装饰（aria-hidden）。 */
function TilingGlyph({ columns, rows, stagger, active }: { columns: number; rows: number; stagger: boolean; active: boolean }) {
    const cells = Array.from({ length: columns * rows }, (_, index) => index);
    return (
        <span
            aria-hidden="true"
            className="grid h-4 w-4 shrink-0 gap-[1px]"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
        >
            {cells.map((index) => {
                const row = Math.floor(index / columns);
                const shifted = stagger && row % 2 === 1;
                return (
                    <span
                        key={index}
                        className={cn("rounded-[1px]", active ? "bg-[var(--primary)]" : "bg-current opacity-60")}
                        style={shifted ? { transform: "translateX(50%)" } : undefined}
                    />
                );
            })}
        </span>
    );
}

export function TilingPresetSelect({
    value,
    onChange,
    disabled,
}: {
    value: SdsTilingPresetId;
    onChange: (value: SdsTilingPresetId) => void;
    disabled?: boolean;
}) {
    return (
        <div role="group" aria-label="平铺预设" className="flex flex-wrap gap-2">
            {SDS_TILING_PRESETS.map((preset) => {
                const active = preset.id === value;
                return (
                    <button
                        key={preset.id}
                        type="button"
                        aria-pressed={active}
                        disabled={disabled}
                        onClick={() => onChange(preset.id)}
                        className={cn(
                            "flex min-h-[40px] items-center gap-2 rounded-lg border px-3 text-xs transition",
                            active
                                ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)]"
                                : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)]/60",
                            disabled && "cursor-not-allowed opacity-50",
                        )}
                    >
                        <TilingGlyph columns={preset.columns} rows={preset.rows} stagger={preset.stagger} active={active} />
                        {preset.label}
                    </button>
                );
            })}
        </div>
    );
}

export type PodMaterialFormProps = {
    values: SdsValues;
    materials: ToolAssetRecord[];
    disabled?: boolean;
    onMaterialsChange: (records: ToolAssetRecord[]) => void;
    onNameChange: (name: string) => void;
    onSelect: (assetId: string) => void;
    onTilingChange: (assetId: string, preset: SdsTilingPresetId) => void;
    onRemove: (assetId: string) => void;
};

/** PodMaterialForm：素材上传 + 素材列表 + 素材名 + 当前素材平铺。 */
export function PodMaterialForm({
    values,
    materials,
    disabled,
    onMaterialsChange,
    onNameChange,
    onSelect,
    onTilingChange,
    onRemove,
}: PodMaterialFormProps) {
    const selected = sdsSelectedMaterial(values);
    return (
        <div className="flex flex-col gap-3" aria-label="素材">
            <ToolAssetInput
                toolId={SDS_DESIGN_TOOL_ID}
                title="上传素材"
                maxCount={SDS_MATERIAL_COUNT.max}
                disabled={disabled}
                onChange={(_assetIds, records) => onMaterialsChange(records)}
                constraints={{
                    kind: "image",
                    mimeTypes: [...SDS_UPLOAD_LIMITS.mimeTypes],
                    maxBytes: SDS_UPLOAD_LIMITS.maxBytes,
                    minWidth: SDS_UPLOAD_LIMITS.minSide,
                    minHeight: SDS_UPLOAD_LIMITS.minSide,
                    maxWidth: SDS_UPLOAD_LIMITS.maxSide,
                    maxHeight: SDS_UPLOAD_LIMITS.maxSide,
                }}
            />

            <label className={labelClass}>
                素材名（提交字段 imageName）
                <input
                    className={sdsFieldClass}
                    value={values.imageName}
                    placeholder="默认取第一个素材文件名"
                    maxLength={60}
                    disabled={disabled}
                    onChange={(event) => onNameChange(event.target.value)}
                />
            </label>

            <div className="flex flex-col gap-2">
                <p className="text-xs text-[var(--muted-foreground)]">
                    素材 {values.materials.length}/{SDS_MATERIAL_COUNT.max}（{materials.length} 个已上传，输出张数与素材一一对应）
                </p>
                {values.materials.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-6 text-center text-xs text-[var(--muted-foreground)]">
                        还没有素材，先上传要贴到商品上的图案。
                    </p>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {values.materials.map((material, index) => {
                            const active = material.assetId === values.selectedMaterialId;
                            const preset = sdsTilingPreset(material.tilingPresetId);
                            return (
                                <li key={material.assetId}>
                                    <div
                                        className={cn(
                                            "flex items-center gap-2 rounded-lg border p-2",
                                            active ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)]",
                                        )}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => onSelect(material.assetId)}
                                            aria-pressed={active}
                                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                            title="选中该素材后在画布上调整位置"
                                        >
                                            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-[var(--border)] bg-[var(--background)]">
                                                {material.url ? (
                                                    <img src={material.url} alt={material.name} className="h-full w-full object-cover" />
                                                ) : (
                                                    <ImageOff className="h-4 w-4 text-[var(--muted-foreground)]" />
                                                )}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-xs text-[var(--foreground)]">
                                                    {index + 1}. {material.name}
                                                </span>
                                                <span className="block truncate text-[11px] text-[var(--muted-foreground)]">
                                                    {preset.label} · {Math.round(material.placement.scale * 100)}% · {Math.round(material.placement.rotation)}°
                                                </span>
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={`移除素材 ${material.name}`}
                                            disabled={disabled}
                                            onClick={() => onRemove(material.assetId)}
                                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] hover:border-red-400 hover:text-red-500 disabled:opacity-50"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                    {active ? (
                                        <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--background)]/60 p-2">
                                            <p className="mb-1 text-[11px] text-[var(--muted-foreground)]">平铺（{material.name}）</p>
                                            <TilingPresetSelect
                                                value={sdsTilingPreset(material.tilingPresetId).id}
                                                disabled={disabled}
                                                onChange={(presetId) => onTilingChange(material.assetId, presetId)}
                                            />
                                        </div>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}

export type ProductPlacementCanvasProps = {
    values: SdsValues;
    colorId: string;
    disabled?: boolean;
    onSelect: (assetId: string) => void;
    onPlacementChange: (assetId: string, patch: { x?: number; y?: number; scale?: number; rotation?: number }) => void;
    onSelectColor: (colorId: string) => void;
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    /** 颜色选择与操作提示是否由外层（LinkFox 右栏参数卡）承载；true 时组件内不再重复渲染。 */
    compact?: boolean;
};

/** ProductPlacementCanvas：商品图 + 可贴区域 + 素材层（拖拽/键盘）+ 颜色与位置工具条。 */
export function ProductPlacementCanvas({
    values,
    colorId,
    disabled,
    onSelect,
    onPlacementChange,
    onSelectColor,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    compact = false,
}: ProductPlacementCanvasProps) {
    const dragRef = useRef<{ assetId: string; startX: number; startY: number; originX: number; originY: number } | null>(null);
    const product = values.product;
    const area = sdsPrintableArea(product);
    const selected = sdsSelectedMaterial(values);
    const color = sdsColorOption(colorId);
    const ratio = product?.width && product?.height ? product.width / product.height : 1;

    const handlePointerDown = useCallback(
        (event: React.PointerEvent<HTMLDivElement>, assetId: string) => {
            if (disabled) return;
            const target = values.materials.find((material) => material.assetId === assetId);
            if (!target) return;
            (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
            dragRef.current = {
                assetId,
                startX: event.clientX,
                startY: event.clientY,
                originX: target.placement.x,
                originY: target.placement.y,
            };
            onSelect(assetId);
        },
        [disabled, onSelect, values.materials],
    );

    const handlePointerMove = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            const drag = dragRef.current;
            if (!drag) return;
            const rect = event.currentTarget.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            onPlacementChange(drag.assetId, {
                x: drag.originX + (event.clientX - drag.startX) / rect.width,
                y: drag.originY + (event.clientY - drag.startY) / rect.height,
            });
        },
        [onPlacementChange],
    );

    const handlePointerUp = useCallback(() => {
        dragRef.current = null;
    }, []);

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (disabled || !selected) return;
            const meta = event.metaKey || event.ctrlKey;
            if (meta && event.key.toLowerCase() === "z") {
                event.preventDefault();
                if (event.shiftKey) onRedo();
                else onUndo();
                return;
            }
            const action = sdsPlacementKeyAction(event.key, event.shiftKey);
            if (!action) return;
            event.preventDefault();
            const target = selected.placement;
            if (action.kind === "move") onPlacementChange(selected.assetId, { x: target.x + action.dx, y: target.y + action.dy });
            else if (action.kind === "scale") onPlacementChange(selected.assetId, { scale: target.scale * action.factor });
            else onPlacementChange(selected.assetId, { rotation: target.rotation + action.delta });
        },
        [disabled, onPlacementChange, onRedo, onUndo, selected],
    );

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={onUndo}
                    disabled={disabled || !canUndo}
                    aria-label="撤销位置"
                    className="flex h-9 items-center gap-1 rounded-lg border border-[var(--border)] px-2 text-xs text-[var(--muted-foreground)] disabled:opacity-40"
                >
                    <Undo2 className="h-4 w-4" /> 撤销
                </button>
                <button
                    type="button"
                    onClick={onRedo}
                    disabled={disabled || !canRedo}
                    aria-label="重做位置"
                    className="flex h-9 items-center gap-1 rounded-lg border border-[var(--border)] px-2 text-xs text-[var(--muted-foreground)] disabled:opacity-40"
                >
                    <Redo2 className="h-4 w-4" /> 重做
                </button>
                <button
                    type="button"
                    disabled={disabled || !selected}
                    onClick={() => selected && onPlacementChange(selected.assetId, { x: 0.5, y: 0.5, scale: 0.6, rotation: 0 })}
                    className="flex h-9 items-center gap-1 rounded-lg border border-[var(--border)] px-2 text-xs text-[var(--muted-foreground)] disabled:opacity-40"
                >
                    <RotateCcw className="h-4 w-4" /> 复位
                </button>
                <button
                    type="button"
                    disabled={disabled || !selected}
                    onClick={() => selected && onPlacementChange(selected.assetId, { scale: selected.placement.scale * 1.05 })}
                    aria-label="放大素材"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] disabled:opacity-40"
                >
                    <Plus className="h-4 w-4" />
                </button>
                <button
                    type="button"
                    disabled={disabled || !selected}
                    onClick={() => selected && onPlacementChange(selected.assetId, { scale: selected.placement.scale / 1.05 })}
                    aria-label="缩小素材"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] disabled:opacity-40"
                >
                    <Minus className="h-4 w-4" />
                </button>
                <button
                    type="button"
                    disabled={disabled || !selected}
                    onClick={() => selected && onPlacementChange(selected.assetId, { rotation: selected.placement.rotation + 5 })}
                    aria-label="旋转素材"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] disabled:opacity-40"
                >
                    <RotateCw className="h-4 w-4" />
                </button>
            </div>

            <div
                role="application"
                tabIndex={0}
                aria-label="素材操作画布"
                onKeyDown={handleKeyDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="relative w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] outline-none focus-visible:border-[var(--primary)]"
                style={{ aspectRatio: `${ratio}` }}
            >
                {product?.url ? (
                    <img src={product.url} alt={product.name || "商品图"} className="h-full w-full select-none object-contain" draggable={false} />
                ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-xs text-[var(--muted-foreground)]">
                        <ImagePlus className="h-6 w-6" />
                        先上传商品图，素材才能按商品比例摆放
                    </div>
                )}

                {color.hex ? (
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ backgroundColor: color.hex, mixBlendMode: "multiply", opacity: 0.55 }} />
                ) : null}

                {product?.url ? (
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute rounded border border-dashed border-[var(--primary)]/70"
                        style={{
                            left: `${area.x * 100}%`,
                            top: `${area.y * 100}%`,
                            width: `${area.width * 100}%`,
                            height: `${area.height * 100}%`,
                            transform: "translate(-50%, -50%)",
                        }}
                    />
                ) : null}

                {values.materials.map((material) => {
                    const active = material.assetId === values.selectedMaterialId;
                    return (
                        <div
                            key={material.assetId}
                            role="button"
                            tabIndex={-1}
                            aria-label={`摆放素材 ${material.name}`}
                            aria-pressed={active}
                            onPointerDown={(event) => handlePointerDown(event, material.assetId)}
                            className={cn("absolute select-none", disabled ? "cursor-default" : "cursor-move")}
                            style={{
                                left: `${material.placement.x * 100}%`,
                                top: `${material.placement.y * 100}%`,
                                width: `${material.placement.scale * area.width * 100}%`,
                                transform: `translate(-50%, -50%) rotate(${material.placement.rotation}deg)`,
                                touchAction: "none",
                            }}
                        >
                            {material.url ? (
                                <img
                                    src={material.url}
                                    alt={material.name}
                                    draggable={false}
                                    className={cn("w-full rounded-sm", active ? "ring-2 ring-[var(--primary)]" : "opacity-95")}
                                />
                            ) : (
                                <div className="w-full rounded-sm bg-[var(--muted)] py-4 text-center text-[11px] text-[var(--muted-foreground)]">
                                    {material.name}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {compact ? null : (
            <div className="flex flex-wrap items-center gap-2" data-canvas-color-row>
                <span className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
                    <Palette className="h-4 w-4" /> 选择颜色
                </span>
                {SDS_COLOR_OPTIONS.map((option) => {
                    const active = option.id === colorId;
                    return (
                        <button
                            key={option.id}
                            type="button"
                            aria-pressed={active}
                            disabled={disabled}
                            onClick={() => onSelectColor(option.id === DEFAULT_SDS_COLOR_ID ? DEFAULT_SDS_COLOR_ID : option.id)}
                            className={cn(
                                "flex min-h-[36px] items-center gap-1 rounded-full border px-3 text-xs",
                                active ? "border-[var(--primary)] text-[var(--foreground)]" : "border-[var(--border)] text-[var(--muted-foreground)]",
                                disabled && "opacity-50",
                            )}
                        >
                            <span
                                aria-hidden="true"
                                className="h-3 w-3 rounded-full border border-[var(--border)]"
                                style={{ backgroundColor: option.hex || "transparent" }}
                            />
                            {option.label}
                        </button>
                    );
                })}
            </div>
            )}

            {compact ? null : (
            <p className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
                <Move className="h-3.5 w-3.5" />
                拖动素材调整位置；方向键微调 1%（Shift 10%）、+/- 缩放、[ ] 旋转、⌘Z 撤销
            </p>
            )}
        </div>
    );
}

export function SdsDesignWorkspace() {
    const toolId = SDS_DESIGN_TOOL_ID;
    const config = useConfigStore((state) => state.config);
    const imageModels = useMemo(() => selectableModelsByCapability(config, "image"), [config]);
    const model = config.imageModel || imageModels[0] || "";
    const modelReady = Boolean(model && resolveModelChannel(config, model));

    const [values, setValues] = useState<SdsValues>(() => createSdsValues());
    const [materialRecords, setMaterialRecords] = useState<ToolAssetRecord[]>([]);
    const [productRecords, setProductRecords] = useState<ToolAssetRecord[]>([]);
    const [history, setHistory] = useState<SdsPlacementHistory>(() => createSdsPlacementHistory());
    const [hydrated, setHydrated] = useState(false);
    const [notice, setNotice] = useState("");
    const [errorText, setErrorText] = useState("");
    const [running, setRunning] = useState(false);
    const [snapshot, setSnapshot] = useState<SdsSnapshot | undefined>();
    const [resultTab, setResultTab] = useState<"result" | "cases" | "history">("result");
    const [stageBusy, setStageBusy] = useState(false);
    const [stageError, setStageError] = useState("");
    const [applyingCaseId, setApplyingCaseId] = useState<string | null>(null);
    const [casesHint, setCasesHint] = useState("");
    /** 原站「上传素材」弹窗（上传新图 / 传过的图 / 历史作图 / 素材库）。 */
    const [materialPanelOpen, setMaterialPanelOpen] = useState(false);
    /** 原站「历史记录」弹窗（场景素材 / 相似图裂变 / AI自由绘图）。 */
    const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
    const productInputRef = useRef<HTMLInputElement | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    /** 阶段卡直接选图上传所用的约束（与工具注册表一致）。 */
    const sdsConstraints = useMemo(
        () => ({
            kind: "image" as const,
            mimeTypes: [...SDS_UPLOAD_LIMITS.mimeTypes],
            maxBytes: SDS_UPLOAD_LIMITS.maxBytes,
            minWidth: SDS_UPLOAD_LIMITS.minSide,
            minHeight: SDS_UPLOAD_LIMITS.minSide,
            maxWidth: SDS_UPLOAD_LIMITS.maxSide,
            maxHeight: SDS_UPLOAD_LIMITS.maxSide,
        }),
        [],
    );

    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const draftRevision = useToolDraftStore((state) => state.drafts[toolId]?.revision ?? null);
    const tasks = useToolTaskStore((state) => state.tasks);
    const runTool = useToolTaskStore((state) => state.runTool);
    const retryTask = useToolTaskStore((state) => state.retryTask);

    /* ---------------- 草稿回填 ---------------- */

    useEffect(() => {
        let alive = true;
        void (async () => {
            const draft = await hydrateDraft(toolId);
            if (!alive) return;
            const parsed = draft ? parseSdsDraft(draft.values) : createSdsValues();
            const ids = [parsed.product?.assetId ?? "", ...parsed.materials.map((material) => material.assetId)].filter(Boolean);
            if (!ids.length) {
                setValues(parsed);
                setHydrated(true);
                return;
            }
            const { records, lostIds } = await loadToolAssetRecords(ids);
            if (!alive) return;
            const byId = new Map(records.map((record) => [record.id, record]));
            const product = parsed.product && byId.has(parsed.product.assetId) ? parsed.product : null;
            const materials = parsed.materials.filter((material) => byId.has(material.assetId));
            const refreshed = reconcileSdsValues({
                ...parsed,
                product: product ? { ...product, url: byId.get(product.assetId)?.url ?? product.url } : null,
                materials: materials.map((material) => ({ ...material, url: byId.get(material.assetId)?.url ?? material.url })),
            });
            setProductRecords(product && byId.get(product.assetId) ? [byId.get(product.assetId) as ToolAssetRecord] : []);
            setMaterialRecords(materials.map((material) => byId.get(material.assetId)).filter((record): record is ToolAssetRecord => Boolean(record)));
            setValues(refreshed);
            setHistory(createSdsPlacementHistory(refreshed.materials));
            if (lostIds.length) setNotice(`有 ${lostIds.length} 个素材文件已失效，请重新上传后再提交。`);
            setHydrated(true);
        })();
        return () => {
            alive = false;
        };
    }, [hydrateDraft, toolId]);

    const update = useCallback(
        (updater: (previous: SdsValues) => SdsValues) => {
            setValues((previous) => {
                const next = reconcileSdsValues(updater(previous));
                patchDraft(toolId, { values: serializeSdsValues(next) as unknown as Record<string, unknown> });
                return next;
            });
        },
        [patchDraft, toolId],
    );

    /* ---------------- 素材 / 商品图 ---------------- */

    const handleMaterials = useCallback(
        (records: ToolAssetRecord[]) => {
            setMaterialRecords(records);
            let nextMaterials: SdsValues["materials"] = [];
            setValues((previous) => {
                const materials = records.slice(0, SDS_MATERIAL_COUNT.max).map((record) => {
                    const existing = previous.materials.find((material) => material.assetId === record.id);
                    const fields = toSdsAsset(record);
                    return existing
                        ? { ...existing, ...fields, assetId: record.id, placement: existing.placement, tilingPresetId: existing.tilingPresetId }
                        : createSdsMaterial(fields);
                });
                nextMaterials = materials;
                const next = reconcileSdsValues({ ...previous, materials });
                patchDraft(toolId, { values: serializeSdsValues(next) as unknown as Record<string, unknown> });
                return next;
            });
            setHistory((previous) => ({ ...previous, present: placementRecordFromMaterials(nextMaterials), future: [] }));
        },
        [patchDraft, toolId],
    );

    const handleProduct = useCallback(
        (_assetIds: string[], records: ToolAssetRecord[]) => {
            setProductRecords(records.slice(0, 1));
            const record = records[0];
            update((previous) => ({
                ...previous,
                product: record ? sdsAssetFields(toSdsAsset(record)) : null,
                materials: record ? previous.materials : previous.materials,
            }));
            if (!record) {
                setHistory((previous) => ({ ...previous, present: {}, future: [] }));
                return;
            }
        },
        [update],
    );

    /**
     * 「做同款」：把案例的商品图与素材真实入库（uploadCaseFiles），再写进本工具既有状态：
     * 商品图 → productRecords + values.product（草稿里的 productId 即 assetId）；素材 → materialRecords + values.materials。
     * 案例 apply 里的 productId 是原站数值商品 id，本工具 productId 语义是商品图资产 id（registry 已声明无商品库接口），
     * 因此只能回填入库后的资产 id，不伪造原站数值 id。素材为空的案例只回填商品图并提示。
     */
    const applyCase = useCallback(
        async (item: ToolCase) => {
            setApplyingCaseId(item.id);
            setErrorText("");
            try {
                const assets = await uploadCaseFiles(item);
                const rawProduct = assets.product;
                const productRecord = Array.isArray(rawProduct) ? rawProduct[0] : rawProduct;
                if (!productRecord) throw new Error("该案例缺少可用的商品图素材");
                const rawMaterials = assets.materials;
                const caseMaterials = (Array.isArray(rawMaterials) ? rawMaterials : rawMaterials ? [rawMaterials] : []).slice(
                    0,
                    SDS_MATERIAL_COUNT.max,
                );
                const nextMaterials = caseMaterials.map((record) => createSdsMaterial(toSdsAsset(record)));

                setProductRecords([productRecord]);
                setMaterialRecords(caseMaterials);
                update((previous) => ({
                    ...previous,
                    imageName: nextMaterials[0]?.name ?? previous.imageName,
                    product: sdsAssetFields(toSdsAsset(productRecord)),
                    materials: nextMaterials,
                    selectedMaterialId: nextMaterials[0]?.assetId ?? null,
                }));
                setHistory(createSdsPlacementHistory(nextMaterials));
                setSnapshot(undefined);
                // 部分原站案例只落了商品图（材料槽为空）：如实提示，并停在本 tab 让提示可见。
                setCasesHint(
                    nextMaterials.length
                        ? ""
                        : "该案例只提供商品图，没有配套素材；已回填商品图，请再上传 1 个素材后生成。",
                );
                setResultTab(nextMaterials.length ? "result" : "cases");
            } catch (error) {
                setErrorText(error instanceof Error ? error.message : String(error));
            } finally {
                setApplyingCaseId(null);
            }
        },
        [update],
    );

    /** 舞台卡 / 产品卡的文件选择 → 上传落库 → 回填素材或商品图。 */
    const uploadStageFiles = useCallback(
        async (files: File[], slot: "material" | "product") => {
            if (!files.length) return;
            setStageBusy(true);
            setStageError("");
            const limit = slot === "product" ? 1 : Math.max(0, SDS_MATERIAL_COUNT.max - materialRecords.length);
            try {
                const created: ToolAssetRecord[] = [];
                for (const file of files.slice(0, limit)) {
                    created.push(await uploadToolAsset(file, { constraints: sdsConstraints }));
                }
                if (!created.length) return;
                if (slot === "product") {
                    handleProduct([], created);
                } else {
                    handleMaterials([...materialRecords, ...created].slice(0, SDS_MATERIAL_COUNT.max));
                }
            } catch (error) {
                setStageError(error instanceof Error ? error.message : "上传失败，请重试");
            } finally {
                setStageBusy(false);
            }
        },
        [handleMaterials, handleProduct, materialRecords, sdsConstraints],
    );

    const handleRemoveMaterial = useCallback(
        (assetId: string) => {
            handleMaterials(materialRecords.filter((record) => record.id !== assetId));
        },
        [handleMaterials, materialRecords],
    );

    const handleSelect = useCallback((assetId: string) => update((previous) => ({ ...previous, selectedMaterialId: assetId })), [update]);

    const handleTiling = useCallback(
        (assetId: string, preset: SdsTilingPresetId) =>
            update((previous) => ({
                ...previous,
                materials: previous.materials.map((material) =>
                    material.assetId === assetId ? { ...material, tilingPresetId: preset } : material,
                ),
            })),
        [update],
    );

    /* ---------------- 画布几何 ---------------- */

    const handlePlacementChange = useCallback(
        (assetId: string, patch: { x?: number; y?: number; scale?: number; rotation?: number }) => {
            const next = patchSdsPlacement(values.materials, assetId, patch, values.product);
            update((previous) => ({ ...previous, materials: next }));
            setHistory((previous) => commitSdsPlacement(previous, placementRecordFromMaterials(next)));
        },
        [update, values.materials, values.product],
    );

    const handleUndo = useCallback(() => {
        if (!canUndoSdsPlacement(history)) return;
        const next = undoSdsPlacement(history);
        setHistory(next);
        update((previous) => ({ ...previous, materials: applySdsPlacementRecord(previous.materials, next.present) }));
    }, [history, update]);

    const handleRedo = useCallback(() => {
        if (!canRedoSdsPlacement(history)) return;
        const next = redoSdsPlacement(history);
        setHistory(next);
        update((previous) => ({ ...previous, materials: applySdsPlacementRecord(previous.materials, next.present) }));
    }, [history, update]);

    /* ---------------- 校验 / 任务 / 结果 ---------------- */

    const issues = useMemo(() => validateSdsDesignState({ values, hasModel: modelReady }), [values, modelReady]);
    const blocked = !isSdsReady(values, modelReady);

    const task = useMemo(() => {
        const own = Object.values(tasks).filter((item) => item.toolId === toolId);
        return own.sort((a, b) => b.createdAt - a.createdAt)[0];
    }, [tasks]);

    const currentSnapshot = useMemo(
        () =>
            hydrated && values.product && values.materials.length
                ? createSdsSnapshot(values, { revision: draftRevision, requestId: snapshot?.requestId ?? "" })
                : undefined,
        [draftRevision, hydrated, snapshot?.requestId, values],
    );
    const drift = useMemo(() => describeSdsDrift(snapshot, currentSnapshot), [snapshot, currentSnapshot]);
    const result: SdsResult = useMemo(
        () => sdsDesignResultFromTask(task, snapshot, currentSnapshot, drift),
        [currentSnapshot, drift, snapshot, task],
    );
    const resultNotice = useMemo(() => sdsDesignResultNotice(result), [result]);

    const handleSubmit = useCallback(async () => {
        if (blocked) {
            setErrorText(issues[0]?.message ?? "配置不完整，无法提交。");
            return;
        }
        setErrorText("");
        setNotice("");
        setRunning(true);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const requestId = createSdsRequestId();
            const input = buildSdsDesignInput({ values, model, revision: draftRevision });
            assertSdsDesignInput(input, values);
            setSnapshot(createSdsSnapshot(values, { revision: draftRevision, requestId }));
            const next = await runTool(input, { draftRevision, signal: controller.signal });
            if (next.status === "failed") setErrorText(next.error?.message ?? "生成失败：上游未返回原因。");
        } catch (error) {
            setErrorText(error instanceof SdsAdapterError || error instanceof Error ? error.message : String(error));
        } finally {
            setRunning(false);
            abortRef.current = null;
        }
    }, [blocked, draftRevision, issues, model, runTool, values]);

    const handleRetry = useCallback(async () => {
        if (!task) return;
        setErrorText("");
        setRunning(true);
        try {
            const requestId = createSdsRequestId();
            const input = buildSdsDesignInput({ values, model, revision: draftRevision });
            assertSdsDesignInput(input, values);
            const next = await retryTask(task.id, input, { draftRevision });
            if (next.status === "failed") setErrorText(next.error?.message ?? "重试失败：上游未返回原因。");
        } catch (error) {
            setErrorText(error instanceof Error ? error.message : String(error));
        } finally {
            setRunning(false);
        }
    }, [draftRevision, model, retryTask, task, values]);

    /** 部分失败补生成：只把缺失的素材重新提交成新任务，结果不覆盖已有成功槽位。 */
    const handleRepair = useCallback(async () => {
        const indexes = sdsRepairIndexes(result);
        if (!indexes.length) return;
        setErrorText("");
        setRunning(true);
        try {
            const subset: SdsValues = {
                ...values,
                materials: indexes.map((index) => values.materials[index]).filter(Boolean),
                selectedMaterialId: null,
            };
            const input = buildSdsDesignInput({ values, model, revision: draftRevision, materialIndexes: indexes });
            assertSdsDesignInput(input, { ...subset, selectedMaterialId: subset.materials[0]?.assetId ?? null });
            const next = await runTool(input, { draftRevision });
            if (next.status === "failed") setErrorText(next.error?.message ?? "补生成失败：上游未返回原因。");
            else setNotice(`已补生成 ${indexes.length} 个素材，结果请对照素材槽位查看。`);
        } catch (error) {
            setErrorText(error instanceof Error ? error.message : String(error));
        } finally {
            setRunning(false);
        }
    }, [draftRevision, model, result, runTool, values]);

    const materialSources = useMemo(
        () => materialRecords.map((record) => toSdsSource(record)),
        [materialRecords],
    );
    const productSource = useMemo(() => (productRecords[0] ? toSdsSource(productRecords[0]) : undefined), [productRecords]);

    useEffect(() => {
        const problems: string[] = [];
        materialSources.forEach((source) => {
            const check = validateSdsSource(source, "material");
            if (!check.ok) problems.push(check.message);
        });
        if (productSource) {
            const check = validateSdsSource(productSource, "product");
            if (!check.ok) problems.push(check.message);
        }
        setNotice(problems[0] ?? "");
    }, [materialSources, productSource]);

    const missing = sdsMissingIndexes(result.slots);
    const productUrl = productRecords[0]?.url ?? values.product?.url ?? null;
    const stageHasContent = values.materials.length > 0;
    const submitLabel = running ? "生成中…" : "立即生成";

    return (
        <div className="flex flex-col gap-[10px] xl:flex-row" data-tool-workspace="sds-design" data-variant="sds-1to1">
            <OrigRail items={PRODUCT_DESIGN_RAIL} active="素材贴合" driver testId="sds-family-rail" label="素材和灵感" className="order-first w-full" />
            <WatermarkGroupPanel />
            {/* 左：素材贴合主面板（舞台 + 右栏参数卡） */}
            <section
                aria-label="素材贴合"
                className="flex min-w-0 flex-1 flex-col gap-[10px] rounded-[8px] border border-border bg-muted p-[10px] lg:flex-row"
            >
                <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-[10px] pb-[10px] pt-[50px]">
                    {stageHasContent ? (
                        <div className="w-full max-w-[560px]">
                            <ProductPlacementCanvas
                                values={values}
                                colorId={values.colorId}
                                disabled={running}
                                onSelect={handleSelect}
                                onPlacementChange={handlePlacementChange}
                                onSelectColor={(colorId) => update((previous) => ({ ...previous, colorId }))}
                                onUndo={handleUndo}
                                onRedo={handleRedo}
                                canUndo={canUndoSdsPlacement(history)}
                                canRedo={canRedoSdsPlacement(history)}
                                compact
                            />
                        </div>
                    ) : (
                        <div className="flex w-full max-w-[540px] flex-col items-center gap-0 rounded-[12px] bg-card p-[20px] shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                            <div className="flex h-[282px] w-full flex-col items-center justify-center gap-2 rounded-lg bg-muted/50">
                                <ImagePlus className="h-9 w-9 text-muted-foreground" />
                                <p className="text-[13px] text-muted-foreground">上传素材后在这里预览贴合效果</p>
                            </div>
                            <h3 className="text-center text-[20px] leading-[31px] text-[rgba(0,0,0,0.85)]" style={{ margin: "16px 0 0" }}>素材贴合</h3>
                            <p className="text-center text-[16px] leading-[25px] text-muted-foreground" style={{ margin: "6px 0 0" }}>
                                上传精美素材，一键贴合到商品预览效果，极大提高测款效率
                            </p>
                            <button
                                type="button"
                                disabled={running || stageBusy}
                                onClick={() => setMaterialPanelOpen(true)}
                                data-testid="sds-upload-material"
                                className="flex h-[32px] items-center justify-center gap-[6px] rounded-[6px] bg-primary px-[15px] text-[14px] text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                                style={{ marginTop: 14 }}
                            >
                                {stageBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                上传素材
                            </button>
                            {stageError ? <p className="text-[12px] text-red-500">{stageError}</p> : null}
                        </div>
                    )}
                </div>

                <div className="flex w-full shrink-0 flex-col gap-[10px] lg:w-[279px]">
                    {/* 产品 */}
                    <div className="rounded-[8px] bg-muted/50 p-[10px_20px_10px_10px]">
                        <button
                            type="button"
                            disabled={running || stageBusy}
                            onClick={() => productInputRef.current?.click()}
                            className="flex w-full items-center gap-[10px] text-left disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <span className="flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                                {productUrl ? (
                                    <img src={productUrl} alt="商品图" className="h-full w-full object-cover" />
                                ) : (
                                    <Plus className="h-5 w-5 text-muted-foreground" />
                                )}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[14px] leading-[22px] text-[rgba(0,0,0,0.85)]">产品</span>
                                <span className="mt-[2px] block truncate text-[12px] leading-[18px] text-muted-foreground">
                                    {productUrl ? "已选择商品图，点击可更换" : "选择产品进行素材贴合"}
                                </span>
                            </span>
                        </button>
                    </div>

                    {/* 选择颜色 */}
                    <div className="rounded-[8px] bg-muted/50 px-[16px] pt-[10px]">
                        <p className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.85)]" style={{ margin: 0 }}>选择颜色</p>
                        <div className="mt-[7px] flex h-[42px] items-center gap-[10px]" role="group" aria-label="选择颜色">
                            {SDS_COLOR_OPTIONS.map((option) => {
                                const active = option.id === values.colorId;
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        aria-pressed={active}
                                        disabled={running}
                                        title={option.label}
                                        aria-label={option.label}
                                        onClick={() => update((previous) => ({ ...previous, colorId: option.id }))}
                                        className={cn(
                                            "flex h-[26px] w-[26px] items-center justify-center rounded-full border transition",
                                            active ? "border-primary" : "border-transparent",
                                            running && "opacity-50",
                                        )}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="block h-[20px] w-[20px] rounded-full border border-black/10"
                                            style={{ backgroundColor: option.hex || "transparent" }}
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 素材操作 */}
                    <div className="rounded-[8px] bg-muted/50 px-[16px] pt-[10px]">
                        <p className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.85)]" style={{ margin: 0 }}>素材操作</p>
                        <div className="mt-[7px] flex h-[30px] items-center gap-[8px]">
                            <button
                                type="button"
                                aria-label="撤销"
                                disabled={running || !canUndoSdsPlacement(history)}
                                onClick={handleUndo}
                                className="flex h-[30px] w-[30px] items-center justify-center rounded-md border border-border bg-card text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <Undo2 className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                aria-label="重做"
                                disabled={running || !canRedoSdsPlacement(history)}
                                onClick={handleRedo}
                                className="flex h-[30px] w-[30px] items-center justify-center rounded-md border border-border bg-card text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <Redo2 className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                disabled={running || blocked}
                                onClick={() => void handleSubmit()}
                                title={blocked ? (issues[0]?.message ?? "配置不完整") : ""}
                                className="ml-auto flex h-[30px] items-center justify-center gap-1.5 rounded-md bg-primary px-[14px] text-[14px] text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                {submitLabel}
                            </button>
                            <span className="text-[12px] text-muted-foreground">(20算力)</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* 右：生成结果面板 */}
            <section
                aria-label="生成结果"
                className="flex w-full shrink-0 flex-col rounded-[8px] bg-muted xl:w-[300px]"
            >
                <div className="flex h-[42px] shrink-0 items-center justify-between rounded-t-[8px] bg-card px-[12px]">
                    <div className="flex items-center gap-[14px]">
                        {([
                            ["result", "生成结果"],
                            ["cases", "优秀案例"],
                        ] as const).map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                aria-pressed={resultTab === key}
                                onClick={() => setResultTab(key)}
                                className={cn(
                                    "flex h-[41px] items-center px-0 text-[14px] leading-[22px]",
                                    resultTab === key ? "text-primary" : "text-muted-foreground",
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        aria-pressed={resultTab === "history"}
                        data-testid="sds-history-entry"
                        onClick={() => {
                            setResultTab("history");
                            setHistoryPanelOpen(true);
                        }}
                        className={cn(
                            "flex h-[41px] items-center text-[14px] leading-[22px]",
                            resultTab === "history" ? "text-primary" : "text-muted-foreground",
                        )}
                    >
                        历史记录
                    </button>
                </div>

                <div className="flex min-h-[320px] flex-1 flex-col px-[16px]">
                    {resultTab === "cases" ? (
                        <div className="p-4" data-testid="sds-cases">
                            {casesHint ? (
                                <p className="mb-3 rounded-[8px] border border-[#FFE0B2] bg-[#FFF8E1] px-2 py-1.5 text-[12px] text-[#8A6D3B]">
                                    {casesHint}
                                </p>
                            ) : null}
                            <ToolCases cases={SDS_DESIGN_CASES} applyingId={applyingCaseId} onApply={applyCase} />
                        </div>
                    ) : resultTab === "history" ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                            <p className="text-[14px] text-muted-foreground">暂无历史记录</p>
                            <p className="text-[13px] text-muted-foreground">每次生成会自动存档，可在这里回看~</p>
                        </div>
                    ) : (
                        <div className="flex flex-1 flex-col gap-3">
                            {result.slots.length === 0 && !task ? (
                                <div className="flex flex-1 flex-col items-center gap-[22px] pt-[96px] text-center">
                                    <p className="text-[14px] text-[rgba(0,0,0,0.45)]">暂无生成结果图</p>
                                    <p className="text-[14px] text-muted-foreground">快在左侧操作素材贴合吧~</p>
                                </div>
                            ) : (
                                <ul className="flex flex-col gap-1.5" aria-label="素材槽位">
                                    {result.slots.map((slot) => (
                                        <li key={slot.assetId} className="flex items-center gap-2 text-[13px]">
                                            <span
                                                className={cn(
                                                    "flex h-5 w-5 items-center justify-center rounded-full border",
                                                    slot.item
                                                        ? "border-emerald-500 text-emerald-600"
                                                        : missing.includes(slot.index)
                                                          ? "border-amber-500 text-amber-600"
                                                          : "border-border text-muted-foreground",
                                                )}
                                            >
                                                {slot.item ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                                            </span>
                                            <span className="min-w-0 flex-1 truncate text-[rgba(0,0,0,0.85)]">
                                                {slot.index + 1}. {slot.name}
                                            </span>
                                            <span className="text-[12px] text-muted-foreground">
                                                {slot.item ? "已生成" : result.status === "succeeded" ? "缺图" : "待生成"}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {stageHasContent ? (
                                <>
                                    {result.stale ? (
                                        <p className="rounded-[8px] border border-amber-300 bg-amber-50 px-2 py-1.5 text-[12px] text-amber-700">
                                            结果来自旧版本（改动：{result.drift || "配置已变化"}），需重新生成。
                                        </p>
                                    ) : null}
                                    {resultNotice ? (
                                        <p className="rounded-[8px] border border-border bg-card px-2 py-1.5 text-[12px] text-muted-foreground">
                                            {resultNotice}
                                        </p>
                                    ) : null}
                                    {sdsRepairIndexes(result).length ? (
                                        <button
                                            type="button"
                                            disabled={running}
                                            onClick={() => void handleRepair()}
                                            className="flex min-h-[36px] items-center justify-center gap-2 rounded-[8px] border border-primary px-3 text-[13px] text-primary disabled:opacity-50"
                                        >
                                            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                                            只补生成缺失的 {sdsRepairIndexes(result).length} 张
                                        </button>
                                    ) : null}

                                    {blocked && issues[0] ? <p className="text-[12px] text-amber-600">{issues[0].message}</p> : null}
                                    {errorText ? <p className="text-[12px] text-red-500">{errorText}</p> : null}
                                    {notice ? <p className="text-[12px] text-muted-foreground">{notice}</p> : null}
                                    {!modelReady ? <p className="text-[12px] text-amber-600">未配置可用的图片模型，请先在设置里选择模型。</p> : null}
                                </>
                            ) : null}

                            {task ? (
                                <div className="min-h-0 flex-1">
                                    <ToolResult task={task ?? null} toolId={toolId} title="素材贴合结果" onRetry={handleRetry} />
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            </section>

            <MaterialSourcePanel
                open={materialPanelOpen}
                toolId={toolId}
                disabled={running || stageBusy}
                onClose={() => setMaterialPanelOpen(false)}
                onFiles={(files) => uploadStageFiles(files, "material")}
                onPick={(record) => {
                    if (materialRecords.some((item) => item.id === record.id)) return;
                    handleMaterials([...materialRecords, record].slice(0, SDS_MATERIAL_COUNT.max));
                }}
            />
            <HistoryRecordPanel
                open={historyPanelOpen}
                toolId={toolId}
                toolLabel="素材贴合"
                onClose={() => setHistoryPanelOpen(false)}
            />
            <input
                ref={productInputRef}
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    event.target.value = "";
                    void uploadStageFiles(files, "product");
                }}
            />
        </div>
    );
}

export default PodMaterialWorkspace;
