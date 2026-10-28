import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, Redo2, RotateCcw, Sparkles, Undo2 } from "lucide-react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolResult } from "@/components/tools/tool-result";
import { cn } from "@/lib/utils";
import type { ToolAssetRecord } from "@/services/api/tools/assets";
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

export default PodMaterialWorkspace;
