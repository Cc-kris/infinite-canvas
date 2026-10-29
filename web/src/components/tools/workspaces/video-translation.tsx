/**
 * TASK-045：视频翻译工作区（layout = video）。独立文件，避免与其他视频类任务的共享文件冲突。
 *
 * 结构对齐 docs/V1.0/plan_linkfox_navigation/page-specs/38-video-translation.md：
 *  1. 原视频上传（MP4/MOV、100MB、2–30 秒，规则来自 registry）；
 *  2. 模式（标准 / 高级）；
 *  3. 源语言（默认自动识别）→ 需要翻译的语言（默认英语）；
 *  4. 口型同步开关（页面默认开启）+ 输出数量；
 *  5. 视频模型 + 提交（能力不足时明确阻断，不静默丢参）；
 *  6. 结果区：原视频与翻译结果对照、本次输入快照、旧配置提示。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ModelPicker } from "@/components/model-picker";
import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolShell } from "@/components/tools/tool-shell";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { ToolCases } from "../tool-cases";
import {
    buildVideoTranslationBrowserInput,
    checkVideoTranslationCapability,
    checkVideoTranslationSource,
    createVideoTranslationRunPort,
    retryVideoTranslationTask,
    runVideoTranslationTask,
    videoTranslationResultView,
    videoTranslationSourceFromRecord,
    type VideoTranslationSource,
} from "@/features/tools/adapters/video-translation";
import {
    VIDEO_TRANSLATION_OUTPUT_OPTIONS,
    VIDEO_TRANSLATION_SOURCE_RULE,
    VIDEO_TRANSLATION_SUPPORTED_OUTPUT,
    VIDEO_TRANSLATION_TOOL_ID,
    applyVideoTranslationSource,
    createVideoTranslationSnapshot,
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
 *  2. 模式选择（标准翻译 / 高级模式）；
 *  3. 源语言（默认自动识别）→ 需要翻译的语言（默认英语）；
 *  4. 口型同步开关（页面默认开启）+ 输出数量；
 *  5. 视频模型 + 提交；
 *  6. 结果区：原始视频与翻译结果对照播放、本次输入快照、旧配置提示。
 *
 * 真实边界：口型同步拿不到 provider 能力证据 → 提交前阻断并给出一键关闭；不静默丢参。
 */
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

    const capability = useMemo(() => checkVideoTranslationCapability(values), [values]);

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
        if (!record) return "请上传需要翻译的原视频";
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

    const handleDisableLipSync = useCallback(() => {
        setValues((previous) => ({ ...previous, lipSync: false }));
        setNotice("已关闭口型同步：本次只替换音轨与字幕，不改动唇形");
    }, []);

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
                const browserInput = buildVideoTranslationBrowserInput({ values, source, model, catalog });
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
        [catalog, model, provider, running, source, task, values],
    );

    const sidebar = (
        <div className="space-y-1">
            <p className="px-2 text-xs font-medium text-muted-foreground">视频翻译</p>
            <p className="mt-3 px-2 text-[11px] leading-4 text-muted-foreground">
                原视频 MP4 / MOV，100MB 以内，建议 {VIDEO_TRANSLATION_SOURCE_RULE.recommended}；口型同步需模型支持。
            </p>
        </div>
    );

    return (
        <ToolShell
            className={className}
            title={spec?.title ?? "视频翻译"}
            subtitle="智能识别源语言 · 译为目标语言并重新配音"
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
                    <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        目标语言 {targetLabel}
                    </span>
                    <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">{videoTypeLabel}</span>
                </>
            }
        >
            <div className="grid min-h-0 flex-1 gap-6 overflow-auto p-4 lg:grid-cols-[minmax(300px,320px)_minmax(0,1fr)]">
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
                            title="上传需要翻译的视频"
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

                    <section className="space-y-2 rounded-lg border border-border p-3">
                        <h2 className="text-sm font-medium">源语言 → 需要翻译的语言</h2>
                        <label className="block text-[11px] text-muted-foreground">
                            源语言（默认智能识别）
                            <select
                                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                                value={values.sourceLanguage}
                                disabled={running}
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
                            需要翻译的语言
                            <select
                                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                                value={values.targetLanguage}
                                disabled={running}
                                onChange={(event) => setValues((previous) => ({ ...previous, targetLanguage: event.target.value }))}
                            >
                                {targetOptions.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.label}（{option.native}）
                                    </option>
                                ))}
                            </select>
                        </label>
                        <p className="text-[11px] text-muted-foreground">智能识别源语言，驱动口型与目标语言精准匹配。</p>
                    </section>

                    <section className="space-y-2 rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-sm font-medium">口型同步</h2>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={values.lipSync}
                                disabled={running}
                                onClick={() => setValues((previous) => ({ ...previous, lipSync: !previous.lipSync }))}
                                className={cn(
                                    "relative h-5 w-9 rounded-full border transition",
                                    values.lipSync ? "border-primary bg-primary" : "border-border bg-muted",
                                )}
                            >
                                <span
                                    className={cn(
                                        "absolute top-0.5 size-4 rounded-full bg-background transition",
                                        values.lipSync ? "left-4" : "left-0.5",
                                    )}
                                />
                            </button>
                        </div>
                        <p className="text-[11px] leading-4 text-muted-foreground">
                            {values.lipSync ? "已开启：译制语音与原画面唇形对齐。" : "已关闭：只替换音轨与字幕。"}
                        </p>
                        {capability.blockers.length > 0 ? (
                            <div className="space-y-1 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800" role="alert">
                                <p>{capability.blockers[0]}</p>
                                {values.lipSync ? (
                                    <button type="button" className="underline" onClick={handleDisableLipSync}>
                                        关闭口型同步后继续
                                    </button>
                                ) : null}
                            </div>
                        ) : null}
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
                                    {mode === "standard" ? "标准翻译" : "高级模式"}
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
                    </section>

                    <section className="space-y-2 rounded-lg border border-border p-3">
                        <h2 className="text-sm font-medium">视频模型</h2>
                        <ModelPicker config={config} value={model} onChange={setModel} capability="video" fullWidth />
                        <button
                            type="button"
                            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                            disabled={running || Boolean(submitBlockedReason)}
                            onClick={() => void handleSubmit()}
                        >
                            {running ? "翻译中…" : "立即生成"}
                        </button>
                        {submitBlockedReason ? <p className="text-[11px] text-muted-foreground">{submitBlockedReason}</p> : null}
                    </section>
                </div>

                {/* 结果区：原始视频 ↔ 翻译结果 对照 */}
                <div className="min-w-0 space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-medium">生成结果</h2>
                        {stale ? (
                            <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-amber-600" data-testid="video-translation-stale">
                                来自旧版本配置
                            </span>
                        ) : null}
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
                            <p className="text-[11px] text-muted-foreground">翻译结果</p>
                            {view.videos[0]?.url ? (
                                <video src={view.videos[0].url} controls className="w-full rounded-lg border border-border bg-black" data-testid="video-translation-result-player" />
                            ) : (
                                <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-border text-[11px] text-muted-foreground">
                                    {view.message}
                                </div>
                            )}
                        </div>
                    </div>
                    <ToolResult
                        task={task}
                        toolId={VIDEO_TRANSLATION_TOOL_ID}
                        title="视频翻译结果"
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
                                <dd>{snapshot.values.lipSync ? "开启" : "关闭"}</dd>
                                <dt>输出数量</dt>
                                <dd>{snapshot.values.outputNum} 条</dd>
                                <dt>原视频</dt>
                                <dd>{snapshot.values.sourceVideoName || "—"}</dd>
                                <dt>翻译类型</dt>
                                <dd>{snapshot.labels.videoType || "—"}</dd>
                            </dl>
                        </details>
                    ) : null}
                    <section className="space-y-2 rounded-lg border border-border p-3" data-testid="video-translation-cases">
                        <h2 className="text-sm font-medium">优秀案例</h2>
                        {/* VIDEO_TRANSLATION（type=814）：原站有「优秀案例」页签。
                            数据源：上游案例接口 `/image/make-case/list?type=<bizType>`（抓取与落盘做法见 image-to-video-cases-data.ts）。
                            未抓到前 cases 为空，ToolCases 只渲染标准空态（暂无优秀案例）。 */}
                        <ToolCases cases={[]} onApply={() => undefined} />
                    </section>
                    <section className="space-y-2 rounded-lg border border-border p-3" data-testid="video-translation-history">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-medium">历史任务</h2>
                            <span className="text-[11px] text-muted-foreground">点击「查看结果」把历史任务放回上方结果区</span>
                        </div>
                        <ToolTaskHistory
                            toolId={VIDEO_TRANSLATION_TOOL_ID}
                            emptyHint="还没有视频翻译任务：提交后这里会出现真实任务记录"
                            onSelectTask={(historyTask) => {
                                setTask(historyTask);
                                setNotice("已载入历史任务结果；配置未改动，不会重新提交");
                            }}
                        />
                    </section>
                </div>
            </div>
        </ToolShell>
    );
}
