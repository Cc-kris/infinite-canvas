import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { AlertTriangle, Check, Loader2, Redo2, RotateCcw, Undo2 } from "lucide-react";

import { ToolResult } from "@/components/tools/tool-result";
import { cn } from "@/lib/utils";
import {
    ORNAMENT_TEXT_CATALOG_NOTICE,
    ORNAMENT_TEXT_EFFECT_LIMIT,
    ORNAMENT_TEXT_FONTS,
    ORNAMENT_TEXT_FONT_SIZE,
    ORNAMENT_TEXT_POSITION,
    ORNAMENT_TEXT_TEXT_LIMIT,
    ORNAMENT_TEXT_TOOL_ID,
    applyOrnamentTextLayout,
    canRedoOrnamentTextLayout,
    canUndoOrnamentTextLayout,
    clampOrnamentTextFontSize,
    commitOrnamentTextLayout,
    createOrnamentTextHistory,
    createOrnamentTextSnapshot,
    createOrnamentTextValues,
    hasBlockingOrnamentTextIssue,
    nudgeOrnamentTextLayout,
    ornamentTextFontLabel,
    ornamentTextFontStack,
    ornamentTextPositionLabel,
    readOrnamentTextValues,
    redoOrnamentTextLayout,
    undoOrnamentTextLayout,
    validateOrnamentTextState,
    type OrnamentTextHistory,
    type OrnamentTextLayout,
    type OrnamentTextSnapshot,
    type OrnamentTextValues,
} from "@/features/tools/registry/ornament-text";
import {
    OrnamentTextAdapterError,
    ornamentTextPreviewNotice,
    ornamentTextResultFromTask,
    ornamentTextResultNotice,
    ornamentTextResponseId,
    retryOrnamentText,
    runOrnamentText,
    type OrnamentTextGatewayLike,
} from "@/features/tools/adapters/ornament-text";
import { resolveModelChannel, selectableModelsByCapability, useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";

const toolId = ORNAMENT_TEXT_TOOL_ID;
const cardClass = "rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4";
const fieldClass =
    "w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--primary)]";

/** 饰品正面示意：真 SVG 线框（非生成结果），只用来复用左右定位与字号的几何语义。 */
function OrnamentSilhouette() {
    return (
        <svg aria-hidden="true" viewBox="0 0 200 200" className="absolute inset-0 h-full w-full">
            <defs>
                <radialGradient id="ornament-glow" cx="50%" cy="38%" r="62%">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.14" />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                </radialGradient>
            </defs>
            <rect width="200" height="200" fill="url(#ornament-glow)" />
            <path d="M100 22c9 0 16 7 16 16s-7 16-16 16-16-7-16-16 7-16 16-16Z" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.45" />
            <circle cx="100" cy="118" r="56" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.55" />
            <circle cx="100" cy="118" r="46" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" strokeDasharray="4 5" />
            <path d="M100 38v24" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
            <path d="M52 118h96" stroke="currentColor" strokeWidth="0.8" opacity="0.25" strokeDasharray="3 6" />
        </svg>
    );
}

/**
 * 原站该工具未开通：访问 `/tools/product-design/ornament-text` 会重定向到 /home，
 * 页面没有任何工具 DOM。本地按 1:1 只保留同一说明，不再渲染工具界面。
 */
export function OrnamentTextWorkspace() {
    return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8">
            <p className="max-w-md text-center text-sm text-muted-foreground" data-testid="ornament-text-unavailable">
                重定向到 /home 首页，工具未开通；无工具 DOM
            </p>
        </div>
    );
}

/** 旧实现保留（原站已下线该工具，路由不再渲染）。 */
function OrnamentTextWorkspaceLegacy() {
    const config = useConfigStore((state) => state.config);
    const imageModels = useMemo(() => selectableModelsByCapability(config, "image"), [config]);
    const model = config.imageModel || imageModels[0] || "";
    const modelReady = Boolean(model && resolveModelChannel(config, model));

    const [values, setValues] = useState<OrnamentTextValues>(() => createOrnamentTextValues());
    const [history, setHistory] = useState<OrnamentTextHistory>(() => createOrnamentTextHistory(createOrnamentTextValues()));
    const [snapshot, setSnapshot] = useState<OrnamentTextSnapshot | undefined>();
    const [running, setRunning] = useState(false);
    const [errorText, setErrorText] = useState("");
    const [tab, setTab] = useState<"params" | "preview" | "result">("params");
    const abortRef = useRef<AbortController | null>(null);
    const dragRef = useRef<{ startX: number; left: number; right: number; width: number } | null>(null);

    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const draftRevision = useToolDraftStore((state) => state.drafts[toolId]?.revision ?? null);
    const tasks = useToolTaskStore((state) => state.tasks);
    const runTool = useToolTaskStore((state) => state.runTool);
    const retryTask = useToolTaskStore((state) => state.retryTask);

    useEffect(() => {
        let alive = true;
        void (async () => {
            const draft = await hydrateDraft(toolId);
            if (!alive || !draft) return;
            const restored = readOrnamentTextValues(draft.values);
            setValues(restored);
            setHistory(createOrnamentTextHistory(restored));
        })();
        return () => {
            alive = false;
        };
    }, [hydrateDraft]);

    const update = useCallback(
        (updater: (previous: OrnamentTextValues) => OrnamentTextValues) => {
            setValues((previous) => {
                const next = updater(previous);
                patchDraft(toolId, { values: next as unknown as Record<string, unknown> });
                return next;
            });
        },
        [patchDraft],
    );

    const setField = useCallback(<K extends keyof OrnamentTextValues>(key: K, value: OrnamentTextValues[K]) => update((previous) => ({ ...previous, [key]: value })), [update]);

    /** 几何变更统一走历史栈：拖动、键盘、数值输入、按钮都留下可撤销的一步。 */
    const applyLayout = useCallback(
        (next: OrnamentTextLayout) => {
            setHistory((previous) => {
                const committed = commitOrnamentTextLayout(previous, next);
                update((current) => applyOrnamentTextLayout(current, committed.present));
                return committed;
            });
        },
        [update],
    );

    const undo = useCallback(() => {
        setHistory((previous) => {
            const next = undoOrnamentTextLayout(previous);
            if (next === previous) return previous;
            update((current) => applyOrnamentTextLayout(current, next.present));
            return next;
        });
    }, [update]);

    const redo = useCallback(() => {
        setHistory((previous) => {
            const next = redoOrnamentTextLayout(previous);
            if (next === previous) return previous;
            update((current) => applyOrnamentTextLayout(current, next.present));
            return next;
        });
    }, [update]);

    const nudge = useCallback((delta: number) => applyLayout(nudgeOrnamentTextLayout({ left: values.left, right: values.right, fontSize: values.fontSize }, delta)), [applyLayout, values]);

    const resetLayout = useCallback(() => {
        const base = createOrnamentTextValues();
        applyLayout({ left: base.left, right: base.right, fontSize: base.fontSize });
    }, [applyLayout]);

    const issues = useMemo(() => validateOrnamentTextState({ values, modelReady }), [values, modelReady]);
    const blocked = hasBlockingOrnamentTextIssue(issues);
    const currentSnapshot = useMemo(() => createOrnamentTextSnapshot(values, draftRevision, ""), [values, draftRevision]);
    const latest = useMemo(() => Object.values(tasks).filter((task) => task.toolId === toolId).sort((a, b) => b.createdAt - a.createdAt)[0], [tasks]);
    const gateway = useMemo<OrnamentTextGatewayLike>(
        () => ({
            submit: (input, options) => runTool(input, { ...options, draftRevision }),
            waitForResult: async (taskIdToWait) => {
                const task = useToolTaskStore.getState().tasks[taskIdToWait];
                if (!task) throw new OrnamentTextAdapterError("task-missing", "任务记录不存在，无法等待结果。");
                return task;
            },
            retry: (taskIdToRetry, input, options) => retryTask(taskIdToRetry, input, options),
        }),
        [draftRevision, retryTask, runTool],
    );

    const handleSubmit = useCallback(async () => {
        if (blocked) {
            setErrorText(issues[0]?.message ?? "参数不完整，无法提交。");
            return;
        }
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setRunning(true);
        setErrorText("");
        try {
            const run = await runOrnamentText({ gateway, values, model, revision: draftRevision, modelReady, signal: controller.signal });
            setSnapshot(run.snapshot);
            if (run.task.status === "failed") setErrorText(run.task.error?.message ?? "生成失败，上游未返回原因。");
            setTab("result");
        } catch (error) {
            setErrorText(error instanceof Error ? error.message : "提交失败，请重试。");
        } finally {
            setRunning(false);
        }
    }, [blocked, draftRevision, gateway, issues, model, modelReady, values]);

    const handleRetry = useCallback(async () => {
        if (!latest || blocked) return;
        const controller = new AbortController();
        abortRef.current = controller;
        setRunning(true);
        setErrorText("");
        try {
            const run = await retryOrnamentText({ gateway, values, model, revision: draftRevision, modelReady, taskId: latest.id, signal: controller.signal });
            setSnapshot(run.snapshot);
        } catch (error) {
            setErrorText(error instanceof Error ? error.message : "重试失败。");
        } finally {
            setRunning(false);
        }
    }, [blocked, draftRevision, gateway, latest, model, modelReady, values]);

    const onCanvasKeyDown = useCallback(
        (event: KeyboardEvent<HTMLDivElement>) => {
            const step = event.shiftKey ? 5 : 1;
            if (event.key === "ArrowLeft") {
                event.preventDefault();
                nudge(-step);
            } else if (event.key === "ArrowRight") {
                event.preventDefault();
                nudge(step);
            } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
                event.preventDefault();
                if (event.shiftKey) redo();
                else undo();
            }
        },
        [nudge, redo, undo],
    );

    const startDrag = useCallback(
        (event: PointerEvent<HTMLDivElement>) => {
            const host = event.currentTarget.parentElement;
            if (!host) return;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            dragRef.current = { startX: event.clientX, left: values.left, right: values.right, width: Math.max(host.clientWidth, 1) };
        },
        [values.left, values.right],
    );

    const onDrag = useCallback(
        (event: PointerEvent<HTMLDivElement>) => {
            const drag = dragRef.current;
            if (!drag) return;
            const deltaPercent = ((event.clientX - drag.startX) / drag.width) * 100;
            applyLayout({ left: drag.left + deltaPercent, right: drag.right + deltaPercent, fontSize: values.fontSize });
        },
        [applyLayout, values.fontSize],
    );

    const endDrag = useCallback(() => {
        dragRef.current = null;
    }, []);

    // 结果一律走适配器统一出口：漂移维度、空结果、未知状态都由它判定，页面不自己拼。
    const result = useMemo(
        () => (snapshot ? ornamentTextResultFromTask(latest ?? null, snapshot, currentSnapshot) : undefined),
        [currentSnapshot, latest, snapshot],
    );
    const notice = errorText || (result ? ornamentTextResultNotice(result) : "");

    return (
        <div className="flex flex-col gap-4" data-testid="ornament-text-workspace">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold text-[var(--foreground)]">饰品文字</h1>
                    <p className="text-xs text-[var(--muted-foreground)]">文字内容、字体、字号与左右定位实时预览；提交后由图片模型生成成品。</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
                    <span className={cn("inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-1", modelReady ? "" : "text-amber-500")}>
                        {modelReady ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                        {modelReady ? model : "未配置图片模型"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-1">
                        字数 {values.text.trim().length}/{ORNAMENT_TEXT_TEXT_LIMIT}
                    </span>
                </div>
            </header>

            <div className="flex gap-2 md:hidden" role="tablist" aria-label="饰品文字分区">
                {([
                    ["params", "文字与参数"],
                    ["preview", "效果预览"],
                    ["result", "结果"],
                ] as const).map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={tab === key}
                        onClick={() => setTab(key)}
                        className={cn("h-10 flex-1 rounded-lg border border-[var(--border)] text-sm", tab === key ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)]")}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_minmax(0,20rem)]">
                <section className={cn("flex flex-col gap-3", tab === "params" ? "" : "hidden lg:flex")} aria-label="饰品文字内容">
                    <div className={cn(cardClass, "flex flex-col gap-3")}>
                        <label className="flex flex-col gap-1 text-sm font-medium">
                            饰品文字内容
                            <textarea
                                aria-label="饰品文字内容"
                                value={values.text}
                                rows={4}
                                maxLength={ORNAMENT_TEXT_TEXT_LIMIT}
                                placeholder="例如：FOREVER · 永"
                                onChange={(event) => setField("text", event.target.value)}
                                className={fieldClass}
                            />
                            <span className="text-[11px] text-[var(--muted-foreground)]">逐字照排，最多 {ORNAMENT_TEXT_TEXT_LIMIT} 字。</span>
                        </label>
                        <label className="flex flex-col gap-1 text-sm font-medium">
                            效果描述（可选）
                            <textarea
                                aria-label="效果描述"
                                value={values.effect}
                                rows={2}
                                maxLength={ORNAMENT_TEXT_EFFECT_LIMIT}
                                placeholder="例如：玫瑰金浮雕、宝石边镶嵌碎钻"
                                onChange={(event) => setField("effect", event.target.value)}
                                className={fieldClass}
                            />
                        </label>
                    </div>

                    <div className={cn(cardClass, "flex flex-col gap-3")} aria-label="字体与字号">
                        <span className="text-sm font-medium">字体与字号</span>
                        <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
                            字体
                            <select aria-label="字体" value={values.fontname} onChange={(event) => setField("fontname", event.target.value)} className={fieldClass}>
                                {ORNAMENT_TEXT_FONTS.map((font) => (
                                    <option key={font.id} value={font.id}>
                                        {font.label}
                                    </option>
                                ))}
                                {!ORNAMENT_TEXT_FONTS.some((font) => font.id === values.fontname) ? <option value={values.fontname}>{values.fontname}（自定义）</option> : null}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
                            自定义字体名（原样透传上游）
                            <input
                                aria-label="自定义字体名"
                                value={values.fontname}
                                maxLength={64}
                                onChange={(event) => setField("fontname", event.target.value)}
                                className={fieldClass}
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
                            字号 {values.fontSize}
                            <input
                                aria-label="字号"
                                type="range"
                                min={ORNAMENT_TEXT_FONT_SIZE.min}
                                max={ORNAMENT_TEXT_FONT_SIZE.max}
                                step={ORNAMENT_TEXT_FONT_SIZE.step}
                                value={values.fontSize}
                                onChange={(event) => applyLayout({ left: values.left, right: values.right, fontSize: clampOrnamentTextFontSize(Number(event.target.value)) })}
                            />
                        </label>
                        <p className="text-[11px] leading-4 text-[var(--muted-foreground)]">{ORNAMENT_TEXT_CATALOG_NOTICE}</p>
                    </div>

                    <div className={cn(cardClass, "flex flex-col gap-3")} aria-label="左右定位">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">左右定位</span>
                            <span className="text-[11px] text-[var(--muted-foreground)]">
                                {ornamentTextPositionLabel(values)} · {values.left}%–{values.right}%
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
                                左 (%)
                                <input
                                    aria-label="左定位"
                                    type="number"
                                    min={ORNAMENT_TEXT_POSITION.min}
                                    max={ORNAMENT_TEXT_POSITION.max}
                                    value={values.left}
                                    onChange={(event) => applyLayout({ left: Number(event.target.value), right: Math.max(Number(event.target.value) + 1, values.right), fontSize: values.fontSize })}
                                    className={fieldClass}
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
                                右 (%)
                                <input
                                    aria-label="右定位"
                                    type="number"
                                    min={ORNAMENT_TEXT_POSITION.min}
                                    max={ORNAMENT_TEXT_POSITION.max}
                                    value={values.right}
                                    onChange={(event) => applyLayout({ left: values.left, right: Number(event.target.value), fontSize: values.fontSize })}
                                    className={fieldClass}
                                />
                            </label>
                        </div>
                        <div className="flex gap-2">
                            {[
                                { label: "偏左", target: () => 10 },
                                { label: "居中", target: () => 50 - (values.right - values.left) / 2 },
                                { label: "偏右", target: () => 90 - (values.right - values.left) },
                            ].map((preset) => (
                                <button
                                    key={preset.label}
                                    type="button"
                                    className="h-10 flex-1 rounded-lg border border-[var(--border)] text-xs"
                                    onClick={() => {
                                        const targetLeft = preset.target();
                                        applyLayout({ left: targetLeft, right: targetLeft + (values.right - values.left), fontSize: values.fontSize });
                                    }}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </section>

                <section className={cn("flex flex-col gap-3", tab === "preview" ? "" : "hidden lg:flex")} aria-label="效果预览">
                    <div className={cn(cardClass, "flex flex-col gap-3")}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-col">
                                <span className="text-sm font-medium">效果预览</span>
                                <span className="text-[11px] text-[var(--muted-foreground)]">拖动文字框或方向键微调，实时同步左右定位</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <button type="button" aria-label="撤销定位" title="撤销 (⌘Z)" disabled={!canUndoOrnamentTextLayout(history)} onClick={undo} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] disabled:opacity-40">
                                    <Undo2 className="h-4 w-4" />
                                </button>
                                <button type="button" aria-label="重做定位" title="重做 (⇧⌘Z)" disabled={!canRedoOrnamentTextLayout(history)} onClick={redo} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] disabled:opacity-40">
                                    <Redo2 className="h-4 w-4" />
                                </button>
                                <button type="button" aria-label="复位定位" title="复位" onClick={resetLayout} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)]">
                                    <RotateCcw className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        <div
                            role="application"
                            aria-label="饰品文字预览画布"
                            tabIndex={0}
                            onKeyDown={onCanvasKeyDown}
                            className="relative aspect-square w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                        >
                            <OrnamentSilhouette />
                            <div
                                onPointerDown={startDrag}
                                onPointerMove={onDrag}
                                onPointerUp={endDrag}
                                onPointerCancel={endDrag}
                                className="absolute top-1/2 -translate-y-1/2 cursor-grab touch-none rounded-lg border border-dashed border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] px-1 text-center active:cursor-grabbing"
                                style={{
                                    left: `${values.left}%`,
                                    width: `${Math.max(values.right - values.left, 2)}%`,
                                    fontFamily: ornamentTextFontStack(values.fontname),
                                    fontSize: `clamp(10px, ${values.fontSize / 6}px, 64px)`,
                                    color: "var(--foreground)",
                                    lineHeight: 1.15,
                                }}
                            >
                                <span className="block truncate">{values.text.trim() || "饰品文字"}</span>
                            </div>
                        </div>
                        <p className="text-[11px] leading-4 text-[var(--muted-foreground)]">{ornamentTextPreviewNotice(values)}</p>
                    </div>

                    <div className={cn(cardClass, "flex flex-col gap-2")} aria-label="文字框列表">
                        <span className="text-sm font-medium">文字框列表</span>
                        <ul className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
                            <li className="flex items-center justify-between rounded-lg border border-[var(--border)] px-2 py-1">
                                <span className="truncate text-[var(--foreground)]">{values.text.trim() || "（空文字框）"}</span>
                                <span>
                                    {ornamentTextFontLabel(values.fontname)} · {values.fontSize} · {values.left}%–{values.right}%
                                </span>
                            </li>
                        </ul>
                    </div>
                </section>

                <section className={cn("flex flex-col gap-3", tab === "result" ? "" : "hidden lg:flex")} aria-label="结果">
                    <div className={cn(cardClass, "flex flex-col gap-2")}>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={blocked || running}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-[var(--primary-foreground)] disabled:opacity-50"
                        >
                            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            生成饰品文字
                        </button>
                        {blocked ? <p className="text-[11px] text-amber-500">{issues[0]?.message}</p> : null}
                        {notice ? <p className="text-[11px] text-[var(--muted-foreground)]">{notice}</p> : null}
                        {latest ? <p className="text-[11px] text-[var(--muted-foreground)]">响应 id：{ornamentTextResponseId(latest) || "——（上游未回填）"}</p> : null}
                    </div>
                    <ToolResult task={latest ?? null} toolId={toolId} title="饰品文字结果" onRetry={handleRetry} />
                </section>
            </div>
        </div>
    );
}

export default OrnamentTextWorkspace;

/**
 * TASK-036：图片文字编辑（IMAGE_TEXT_EDIT）工作区。
 * 实现单独放在 image-text-edit.tsx（画布/框选/属性面板体量大），本文件作为 text 家族的统一入口再导出。
 */
export { ImageTextEditWorkspace } from "./image-text-edit";
export { default as ImageTextEditWorkspaceEntry } from "./image-text-edit";
