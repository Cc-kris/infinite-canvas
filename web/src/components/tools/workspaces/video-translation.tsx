/**
 * TASK-045：视频翻译工作区（layout = video）。独立文件，避免与其他视频类任务的共享文件冲突。
 *
 * 结构对齐 docs/V1.0/plan_linkfox_navigation/page-specs/38-video-translation.md：
 *  1. 原视频上传（MP4/MOV、100MB、2–30 秒，规则来自 registry）；
 *  2. 模式（标准 / 高级）；
 *  3. 源语言（默认自动识别）→ 目标语言（默认英语，仅进提示词）；
 *  4. 口型同步（上游不支持 → 置灰说明）+ 输出数量；
 *  5. 视频模型 + 提交（能力不足时明确阻断，不静默丢参）；
 *  6. 结果区：原视频与重生成结果对照、本次输入快照、旧配置提示。
 *
 * 诚实能力边界（r27 协议调查，提交 1ef24fba）：当前通道 `sub2api /v1/videos`（MiniMax-H3）没有
 * sourceLanguage / targetLanguage / lipSync / 字幕字段，只能按提示词重生成视频。因此面板常驻
 * 「AI 视频重生成，非逐句翻译 / 口型对齐」提示，语言选择标注为仅影响提示词，结果标为未验证草稿；
 * 禁止出现「翻译完成 / 已译制 / 已对口型 / 已生成字幕 / 已识别源语言」这类承诺。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ModelPicker } from "@/components/model-picker";
import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolShell } from "@/components/tools/tool-shell";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { ToolCases } from "../tool-cases";
import {
    VideoTranslationDraftBadge,
    VideoTranslationHonestyNotice,
    videoTranslationHonestyCopy,
} from "./video-translation-honesty";
import {
    buildVideoTranslationBrowserInput,
    checkVideoTranslationCapability,
    checkVideoTranslationSource,
    createVideoTranslationRunPort,
    retryVideoTranslationTask,
    resolveVideoTranslationOutputPlan,
    runVideoTranslationTask,
    videoTranslationResultView,
    videoTranslationSourceFromRecord,
    type VideoTranslationSource,
} from "@/features/tools/adapters/video-translation";
import {
    VIDEO_TRANSLATION_OUTPUT_OPTIONS,
    VIDEO_TRANSLATION_OUTPUT_RATIOS,
    VIDEO_TRANSLATION_SOURCE_RULE,
    VIDEO_TRANSLATION_SUPPORTED_OUTPUT,
    VIDEO_TRANSLATION_TOOL_ID,
    applyVideoTranslationSource,
    createVideoTranslationSnapshot,
    normalizeVideoTranslationOutputRatio,
    createVideoTranslationValues,
    getVideoTranslationSpec,
    isVideoTranslationSnapshotStale,
    normalizeVideoTranslationOutput,
    parseVideoTranslationDraftValues,
    resolveVideoTranslationCatalog,
    serializeVideoTranslationDraftValues,
    videoTranslationLanguageLabel,
    videoTranslationOptionLabel,
    videoTranslationSourceOptions,
    videoTranslationTargetOptions,
    type VideoTranslationSnapshot,
    type VideoTranslationValues,
} from "@/features/tools/registry/video-translation";
import { cn } from "@/lib/utils";
import { assertToolProvider, providerDescriptorFromChannel } from "@/features/tools/capabilities";
import { useStoredToolTask } from "@/features/tools/use-stored-tool-task";
import type { ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { useConfigStore, resolveModelChannel } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";

/* ============================ TASK-045 视频翻译工作区 ============================ */

export type VideoTranslationWorkspaceProps = { className?: string };

/**
 * 结构对齐 page-specs/38-video-translation.md：
 *  1. 原视频（本地上传；MP4/MOV、100MB、2–30 秒，规则来自 registry）；
 *  2. 模式选择（标准模式 / 高级模式）；
 *  3. 源语言（默认自动识别）→ 需要翻译的语言（默认英语）；
 *  4. 口型同步（上游无该参数 → 置灰说明）+ 输出数量（当前渠道只返回 1 条）；
 *  5. 视频模型 + 提交；
 *  6. 结果区：原始视频与 AI 重生成结果对照播放、本次输入快照、旧配置提示。
 *
 * 真实边界：上游没有 lipSync 参数 → 开关置灰并说明原因，提交时不带该字段，也不假装已对齐。
 */
import type { ComponentProps } from "react";

/** 优秀案例数据（复用上游 /image/make-case/list?type=… 真实抓取产物；为空时不渲染案例模块，避免占位空态）。 */
const VIDEO_TRANSLATION_CASES: ComponentProps<typeof ToolCases>["cases"] = [];

export function VideoTranslationWorkspace({ className }: VideoTranslationWorkspaceProps = {}) {
    const spec = useMemo(() => getVideoTranslationSpec(), []);
    const catalog = useMemo(() => resolveVideoTranslationCatalog(), []);
    const config = useConfigStore((state) => state.config);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const hydrateDraft = useToolDraftStore((state) => state.hydrate);

    const [values, setValues] = useState<VideoTranslationValues>(() => createVideoTranslationValues());
    const [model, setModel] = useState(() => config.videoModel || "");
    const [record, setRecord] = useState<ToolAssetRecord | null>(null);
    const [task, setTask] = useState<ToolTask | null>(null);
    const [snapshot, setSnapshot] = useState<VideoTranslationSnapshot | null>(null);
    /**
     * 结果回填：任务与结果字节都已落库，刷新/重进后按最近一条落盘任务还原结果区，
     * 否则「翻译成功 → 刷新 → 结果空白」，下载 / 存资产 / 发画布全部点不到。
     */
    const storedTask = useStoredToolTask(VIDEO_TRANSLATION_TOOL_ID);
    useEffect(() => {
        if (!task && storedTask) setTask(storedTask);
    }, [storedTask, task]);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [running, setRunning] = useState(false);
    const [draftReady, setDraftReady] = useState(false);
    const revisionRef = useRef<number | null>(null);
    const aliveRef = useRef(true);

    useEffect(() => {
        aliveRef.current = true;
        return () => {
            aliveRef.current = false;
        };
    }, []);

    /* ---------- 草稿：先恢复再回写 ---------- */
    useEffect(() => {
        let alive = true;
        hydrateDraft(VIDEO_TRANSLATION_TOOL_ID)
            .then((draft) => {
                if (!alive || !draft) return;
                revisionRef.current = draft.revision;
                setValues(parseVideoTranslationDraftValues(draft.values, catalog));
            })
            .finally(() => {
                if (alive) setDraftReady(true);
            });
        return () => {
            alive = false;
        };
    }, [catalog, hydrateDraft]);

    useEffect(() => {
        if (!draftReady) return;
        patchDraft(VIDEO_TRANSLATION_TOOL_ID, {
            values: serializeVideoTranslationDraftValues(values),
            assetIds: record ? [record.id] : [],
        });
    }, [draftReady, patchDraft, record, values]);

    /* ---------- 派生状态 ---------- */
    const source: VideoTranslationSource | null = useMemo(
        () => (record ? videoTranslationSourceFromRecord(record) : null),
        [record],
    );

    const sourceIssues = useMemo(() => checkVideoTranslationSource(source), [source]);
    const sourceBlockers = useMemo(() => sourceIssues.filter((issue) => issue.severity === "block"), [sourceIssues]);
    const sourceNotices = useMemo(() => sourceIssues.filter((issue) => issue.severity === "notice"), [sourceIssues]);

    /**
     * 诚实降级：上游没有 lipSync 参数，能力判定与提交都按 lipSync=false 计算，
     * 避免首帧/草稿恢复时把「不支持的能力」当成用户待确认的阻断项。
     */
    const effectiveValues = useMemo<VideoTranslationValues>(
        () => (values.lipSync ? { ...values, lipSync: false } : values),
        [values],
    );

    const capability = useMemo(() => checkVideoTranslationCapability(effectiveValues), [effectiveValues]);

    /**
     * 输出画幅方案：默认跟随原视频，按上游真实档位换算，偏离源比例时给出显式提示（不静默裁切）。
     * 与提交时用的是同一个函数，避免「页面提示一套、真实请求另一套」。
     */
    const outputPlan = useMemo(
        () => resolveVideoTranslationOutputPlan(values, source, config.vquality),
        [config.vquality, source, values],
    );

    /**
     * 当前通道描述：跨工具共用的能力闸门要按「这次实际会走的传输通道」判定。
     * 静态只看 registry 会把 lipSync 当永久必需能力（所有通道都没有该参数）→ 永久禁用。
     */
    const provider = useMemo(() => providerDescriptorFromChannel("video", resolveModelChannel(config, model)), [config, model]);

    const currentSnapshot = useMemo(() => createVideoTranslationSnapshot(values, catalog), [catalog, values]);
    const stale = isVideoTranslationSnapshotStale(snapshot, currentSnapshot);
    const view = videoTranslationResultView({ task, snapshot, current: values, catalog });

    const submitBlockedReason = useMemo(() => {
        if (!model.trim()) return "请选择视频模型";
        if (!record) return "请上传需要处理的原视频，再提交生成";
        if (sourceBlockers.length > 0) return sourceBlockers[0].message;
        if (capability.blockers.length > 0) return capability.blockers[0];
        return "";
    }, [capability.blockers, model, record, sourceBlockers]);

    const sourceOptions = useMemo(() => videoTranslationSourceOptions(catalog), [catalog]);
    const targetOptions = useMemo(() => videoTranslationTargetOptions(values.sourceLanguage, catalog), [catalog, values.sourceLanguage]);
    const videoTypeLabel = videoTranslationOptionLabel(catalog.videoTypes, values.videoType) || values.videoType;
    const targetLabel = videoTranslationLanguageLabel(values.targetLanguage, catalog) || values.targetLanguage;

    /* ---------- 交互 ---------- */
    const handleSourceVideoChange = useCallback((_ids: string[], records: ToolAssetRecord[]) => {
        const next = records[0] ?? null;
        setRecord(next);
        setError("");
        if (!next) {
            setValues((previous) => ({ ...previous, sourceVideoAssetId: "", sourceVideoName: "", sourceVideoUrl: "", sourceVideoDurationMs: 0 }));
            return;
        }
        setValues((previous) => ({
            ...previous,
            sourceVideoAssetId: next.id,
            sourceVideoName: next.name,
            sourceVideoUrl: next.url,
            sourceVideoDurationMs: next.durationMs ?? 0,
        }));
    }, []);

    const handleSourceLanguage = useCallback(
        (language: string) => {
            setValues((previous) => {
                const next = applyVideoTranslationSource(previous, language, catalog);
                if (next.targetChanged) setNotice("源语言与目标语言相同，已自动切换目标语言");
                return next.values;
            });
        },
        [catalog],
    );

    /**
     * 诚实降级：上游视频接口没有 lipSync 参数（r27 协议调查），开关置灰并自动归零，
     * 避免「界面上写着已开启、请求里却被静默丢弃」，也让能力闸门不再因口型同步阻断提交。
     */
    useEffect(() => {
        setValues((previous) => (previous.lipSync ? { ...previous, lipSync: false } : previous));
    }, [values.lipSync]);

    const handleSubmit = useCallback(
        async (options?: { retry?: boolean }) => {
            if (running) return;
            setError("");
            setNotice("");
            setRunning(true);
            try {
                // 跨工具共享闸门：按「本次表单值 + 当前通道」判定，口型同步关闭后可正常路由
                assertToolProvider(VIDEO_TRANSLATION_TOOL_ID, provider, [], {
                    values: values as unknown as Record<string, unknown>,
                    nativeOutputCount: VIDEO_TRANSLATION_SUPPORTED_OUTPUT,
                });
                const browserInput = buildVideoTranslationBrowserInput({
                    values,
                    source,
                    model,
                    catalog,
                    resolution: config.vquality,
                });
                const port = await createVideoTranslationRunPort();
                const submitted = createVideoTranslationSnapshot(values, catalog);
                setSnapshot(submitted);
                const next =
                    options?.retry && task
                        ? await retryVideoTranslationTask({ browserInput, port, draftRevision: revisionRef.current })
                        : await runVideoTranslationTask({ browserInput, port, draftRevision: revisionRef.current });
                if (!aliveRef.current) return;
                setTask(next);
            } catch (cause) {
                if (!aliveRef.current) return;
                setError(cause instanceof Error ? cause.message : "提交失败，请稍后再试");
            } finally {
                if (aliveRef.current) setRunning(false);
            }
        },
        [catalog, config.vquality, model, provider, running, source, task, values],
    );

    const honest = videoTranslationHonestyCopy();

    const sidebar = (
        <div className="space-y-1">
            <p className="px-2 text-xs font-medium text-muted-foreground">{honest.sidebarTitle}</p>
            <p className="mt-3 px-2 text-[11px] leading-4 text-muted-foreground">
                原视频 MP4 / MOV，100MB 以内，建议 {VIDEO_TRANSLATION_SOURCE_RULE.recommended}。
            </p>
            <p className="mt-2 px-2 text-[11px] leading-4 text-amber-700 dark:text-amber-300" data-testid="video-translation-sidebar-honesty">
                {honest.sidebarHint}
            </p>
        </div>
    );

    return (
        <ToolShell
            className={className}
            title={spec?.title ?? "视频翻译"}
            subtitle={honest.subtitle}
            sidebar={sidebar}
            notices={
                error ? (
                    <p role="alert" className="text-[11px] text-destructive">
                        {error}
                    </p>
                ) : notice ? (
                    <p className="text-[11px] text-muted-foreground">{notice}</p>
                ) : null
            }
            badges={
                <>
                    <span
                        className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
                        data-testid="video-translation-capability-badge"
                    >
                        AI 视频重生成
                    </span>
                    <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        目标语言 {targetLabel}
                    </span>
                    <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">{videoTypeLabel}</span>
                </>
            }
        >
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
                {/* 常驻诚实提示：不可折叠、不可关闭（r27 报告 §6.1） */}
                <VideoTranslationHonestyNotice copy={honest} />
                <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(300px,320px)_minmax(0,1fr)]">
                {/* 配置区 */}
                <div className="min-w-0 space-y-4" data-testid="video-translation-config">
                    <section className="space-y-2 rounded-lg border border-border p-3">
                        <div className="flex items-baseline justify-between">
                            <h2 className="text-sm font-medium">原视频</h2>
                            <span className="text-[11px] text-muted-foreground">
                                {record ? record.name : "未上传"}
                            </span>
                        </div>
                        <ToolAssetInput
                            toolId={VIDEO_TRANSLATION_TOOL_ID}
                            title="上传原视频"
                            maxCount={1}
                            disabled={running}
                            constraints={{
                                kind: "video",
                                mimeTypes: [...VIDEO_TRANSLATION_SOURCE_RULE.mimeTypes],
                                maxBytes: VIDEO_TRANSLATION_SOURCE_RULE.maxBytes,
                                minDurationMs: VIDEO_TRANSLATION_SOURCE_RULE.minDurationMs,
                                maxDurationMs: VIDEO_TRANSLATION_SOURCE_RULE.maxDurationMs,
                            }}
                            onChange={handleSourceVideoChange}
                        />
                        <p className="text-[11px] leading-4 text-muted-foreground">
                            支持 MP4、MOV 格式，100MB 以内；建议上传画面清晰、音频完整的视频（
                            {VIDEO_TRANSLATION_SOURCE_RULE.recommended}）。
                        </p>
                        {sourceBlockers.length > 0 ? (
                            <ul className="space-y-1 text-[11px] text-destructive" role="alert">
                                {sourceBlockers.map((issue) => (
                                    <li key={issue.code}>{issue.message}</li>
                                ))}
                            </ul>
                        ) : null}
                        {sourceNotices.length > 0 ? (
                            <ul className="space-y-1 text-[11px] text-amber-600" data-testid="video-translation-source-notice">
                                {sourceNotices.map((issue) => (
                                    <li key={issue.code}>{issue.message}</li>
                                ))}
                            </ul>
                        ) : null}
                    </section>

                    <section className="space-y-2 rounded-lg border border-border p-3" data-testid="video-translation-language">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-sm font-medium">{honest.languageTitle}</h2>
                            <span className="text-[10px] text-amber-700 dark:text-amber-300" data-testid="video-translation-language-badge">
                                {honest.languageHint}
                            </span>
                        </div>
                        <label className="block text-[11px] text-muted-foreground">
                            源语言（默认自动识别）
                            <select
                                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                                value={values.sourceLanguage}
                                disabled={running}
                                data-testid="video-translation-source-language"
                                onChange={(event) => handleSourceLanguage(event.target.value)}
                            >
                                {sourceOptions.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.id === "auto" ? option.label : `${option.label}（${option.native}）`}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block text-[11px] text-muted-foreground">
                            目标语言
                            <select
                                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                                value={values.targetLanguage}
                                disabled={running}
                                data-testid="video-translation-target-language"
                                onChange={(event) => setValues((previous) => ({ ...previous, targetLanguage: event.target.value }))}
                            >
                                {targetOptions.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.label}（{option.native}）
                                    </option>
                                ))}
                            </select>
                        </label>
                        {/* 诚实边界（r27 §6.2）：语言只进提示词，上游没有 language 字段 */}
                        <p className="text-[11px] leading-4 text-muted-foreground" data-testid="video-translation-language-hint">
                            {honest.sourceHint}
                        </p>
                    </section>

                    <section
                        className="space-y-2 rounded-lg border border-border p-3"
                        data-testid="video-translation-lipsync"
                        data-lipsync-supported="false"
                    >
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-sm font-medium">{honest.lipSyncTitle}</h2>
                            {/* 上游无 lipSync 参数 → 恒为关闭且置灰，不提供假开关（r27 §6.3） */}
                            <button
                                type="button"
                                role="switch"
                                aria-checked={false}
                                aria-disabled="true"
                                disabled
                                title={honest.lipSyncHint}
                                data-testid="video-translation-lipsync-switch"
                                className="relative h-5 w-9 cursor-not-allowed rounded-full border border-border bg-muted opacity-60"
                            >
                                <span className="absolute top-0.5 left-0.5 size-4 rounded-full bg-background" />
                            </button>
                        </div>
                        <p className="text-[11px] leading-4 text-muted-foreground" data-testid="video-translation-lipsync-hint">
                            {honest.lipSyncHint}
                        </p>
                    </section>

                    <section className="space-y-2 rounded-lg border border-border p-3">
                        <h2 className="text-sm font-medium">模式与输出</h2>
                        <div className="flex gap-1 rounded-md bg-muted p-0.5 text-xs">
                            {(["standard", "advanced"] as const).map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    disabled={running}
                                    className={cn(
                                        "flex-1 rounded px-2 py-1",
                                        values.mode === mode ? "bg-background shadow-sm" : "text-muted-foreground",
                                    )}
                                    onClick={() => setValues((previous) => ({ ...previous, mode }))}
                                >
                                    {mode === "standard" ? "标准模式" : "高级模式"}
                                </button>
                            ))}
                        </div>
                        <label className="block text-[11px] text-muted-foreground">
                            输出数量
                            <select
                                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                                value={values.outputNum}
                                disabled={running}
                                onChange={(event) =>
                                    setValues((previous) => ({ ...previous, outputNum: normalizeVideoTranslationOutput(event.target.value) }))
                                }
                            >
                                {VIDEO_TRANSLATION_OUTPUT_OPTIONS.map((count) => (
                                    <option key={count} value={count}>
                                        {count} 条
                                    </option>
                                ))}
                            </select>
                        </label>
                        {/* 诚实边界（r27 §6.4）：当前通道一次只返回 1 条，多输出会被上游静默压缩 */}
                        <p className="text-[11px] leading-4 text-muted-foreground" data-testid="video-translation-output-hint">
                            {honest.outputHint}
                        </p>
                        {capability.blockers.length > 0 ? (
                            <p
                                className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] leading-4 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
                                role="alert"
                                data-testid="video-translation-capability-blocker"
                            >
                                {capability.blockers[0]}
                            </p>
                        ) : null}
                        <label className="block text-[11px] text-muted-foreground">
                            输出画幅
                            <select
                                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                                value={values.outputRatio}
                                disabled={running}
                                data-testid="video-translation-output-ratio"
                                onChange={(event) =>
                                    setValues((previous) => ({
                                        ...previous,
                                        outputRatio: normalizeVideoTranslationOutputRatio(event.target.value),
                                    }))
                                }
                            >
                                {VIDEO_TRANSLATION_OUTPUT_RATIOS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <p className="text-[11px] leading-4 text-muted-foreground" data-testid="video-translation-aspect-summary">
                            本次提交画幅：{outputPlan.ratio}（{outputPlan.size}）
                            {outputPlan.sourceSize ? ` · 源画面 ${outputPlan.sourceRatioLabel}（${outputPlan.sourceSize}）` : ""}
                        </p>
                        {outputPlan.notice ? (
                            <p
                                className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] leading-4 text-amber-800"
                                role="alert"
                                data-testid="video-translation-aspect-notice"
                            >
                                {outputPlan.notice}
                            </p>
                        ) : null}
                    </section>

                    <section className="space-y-2 rounded-lg border border-border p-3">
                        <h2 className="text-sm font-medium">视频模型</h2>
                        <ModelPicker config={config} value={model} onChange={setModel} capability="video" fullWidth />
                        <button
                            type="button"
                            data-testid="video-translation-submit"
                            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                            disabled={running || Boolean(submitBlockedReason)}
                            onClick={() => void handleSubmit()}
                        >
                            {running ? honest.submitting : "立即生成"}
                        </button>
                        {submitBlockedReason ? <p className="text-[11px] text-muted-foreground">{submitBlockedReason}</p> : null}
                    </section>
                </div>

                {/* 结果区：原始视频 ↔ AI 重生成结果 对照（结果只能当未验证草稿看） */}
                <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-sm font-medium">{honest.resultTitle}</h2>
                        <div className="flex items-center gap-2">
                            <VideoTranslationDraftBadge copy={honest} />
                            {stale ? (
                                <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-amber-600" data-testid="video-translation-stale">
                                    来自旧版本配置
                                </span>
                            ) : null}
                        </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">上传原始视频</p>
                            {record ? (
                                <video src={record.url} controls className="w-full rounded-lg border border-border bg-black" data-testid="video-translation-source-player" />
                            ) : (
                                <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-border text-[11px] text-muted-foreground">
                                    上传后在这里预览原视频
                                </div>
                            )}
                        </div>
                        <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">{honest.resultPanelLabel}</p>
                            {view.videos[0]?.url ? (
                                <video src={view.videos[0].url} controls className="w-full rounded-lg border border-border bg-black" data-testid="video-translation-result-player" />
                            ) : (
                                <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-border px-3 text-center text-[11px] text-muted-foreground">
                                    {task ? view.message : honest.resultEmpty}
                                </div>
                            )}
                        </div>
                    </div>
                    <ToolResult
                        task={task}
                        toolId={VIDEO_TRANSLATION_TOOL_ID}
                        title="AI 重生成结果（未验证翻译）"
                        now={Date.now()}
                        onRetry={() => void handleSubmit({ retry: true })}
                        className="min-h-[240px]"
                    />
                    {!view.outputMatched ? (
                        <p className="text-[11px] text-amber-600" data-testid="video-translation-output-mismatch">
                            {view.message}
                        </p>
                    ) : null}
                    {snapshot ? (
                        <details className="rounded-lg border border-border p-3 text-[11px] text-muted-foreground">
                            <summary className="cursor-pointer text-xs font-medium text-foreground">本次输入快照</summary>
                            <dl className="mt-2 grid grid-cols-2 gap-1">
                                <dt>源语言</dt>
                                <dd>{snapshot.labels.source || "—"}</dd>
                                <dt>目标语言</dt>
                                <dd>{snapshot.labels.target || "—"}</dd>
                                <dt>口型同步</dt>
                                <dd>{honest.lipSyncSnapshot}</dd>
                                <dt>输出数量</dt>
                                <dd>{snapshot.values.outputNum} 条</dd>
                                <dt>原视频</dt>
                                <dd>{snapshot.values.sourceVideoName || "—"}</dd>
                                <dt>生成类型</dt>
                                <dd>{snapshot.labels.videoType || "—"}</dd>
                            </dl>
                        </details>
                    ) : null}
                    {VIDEO_TRANSLATION_CASES.length > 0 ? (
                        <section className="space-y-2 rounded-lg border border-border p-3" data-testid="video-translation-cases">
                                                        {/* VIDEO_TRANSLATION（type=814）：原站「优秀案例」数据源为上游 `/image/make-case/list?type=<bizType>`；本地已抓取到真实案例时用 VIDEO_TRANSLATION_CASES 渲染，未抓取到则整块不渲染，不输出任何空态文案。 */}
<h2 className="text-sm font-medium">优秀案例</h2>
                            <ToolCases cases={VIDEO_TRANSLATION_CASES} onApply={() => undefined} />
                        </section>
                    ) : null}
                    <section className="space-y-2 rounded-lg border border-border p-3" data-testid="video-translation-history">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-medium">历史任务</h2>
                            <span className="text-[11px] text-muted-foreground">点击「查看结果」把历史任务放回上方结果区</span>
                        </div>
                        <ToolTaskHistory
                            toolId={VIDEO_TRANSLATION_TOOL_ID}
                            emptyHint="还没有视频重生成任务：提交后这里会出现真实任务记录"
                            onSelectTask={(historyTask) => {
                                setTask(historyTask);
                                setNotice("已载入历史任务结果；配置未改动，不会重新提交");
                            }}
                        />
                        <p className="text-[11px] leading-4 text-muted-foreground" data-testid="video-translation-history-hint">
                            {honest.historyHint}
                        </p>
                    </section>
                </div>
            </div>
            </div>
        </ToolShell>
    );
}
