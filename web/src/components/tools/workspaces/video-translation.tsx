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
import { AiVideoFamilyNav } from "./video";
import { WatermarkGroupPanel } from "@/components/tools/watermark-group-panel";
import { ToolShell } from "@/components/tools/tool-shell";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { ToolCases, type ToolCase } from "../tool-cases";
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
    VIDEO_TRANSLATION_RATIO_SOURCE,
    VIDEO_TRANSLATION_OUTPUT_RATIOS,
    VIDEO_TRANSLATION_SOURCE_RULE,
    VIDEO_TRANSLATION_SUPPORTED_OUTPUT,
    VIDEO_TRANSLATION_TOOL_ID,
    applyVideoTranslationSource,
    createVideoTranslationSnapshot,
    normalizeVideoTranslationOutputRatio,
    createVideoTranslationValues,
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
import { useTranslation } from "react-i18next";

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

/* ---------- 页面文案：adapter/上游只给中文串，按 code 与结构化字段在展示层本地化 ---------- */

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** 画幅值带冒号（1:1）：i18next 把「.」当层级、把「:」当命名空间分隔符，键位统一写 1x1。 */
const ratioCopyKey = (value: string) => value.replace(":", "x");

const SOURCE_ISSUE_COPY_KEYS: Record<string, string> = {
    "no-source": "noSource",
    "source-mime": "sourceMime",
    "source-too-large": "sourceTooLarge",
    "source-duration-unknown": "sourceDurationUnknown",
    "source-too-short": "sourceTooShort",
    "source-too-long": "sourceTooLong",
};

/** adapter 抛错 code → 文案键；未列出的照原样显示（多为上游技术消息，不编造翻译）。 */
const SUBMIT_ERROR_COPY_KEYS: Record<string, string> = {
    "model-missing": "workspace.blockedNoModel",
    "no-source": "workspace.blockedNoSource",
    "source-mime": "issue.sourceMime",
    "source-too-large": "issue.sourceTooLarge",
    "source-duration-unknown": "issue.sourceDurationUnknown",
    "source-too-short": "issue.sourceTooShort",
    "source-too-long": "issue.sourceTooLong",
    "source-unavailable": "workspace.errorSourceUnavailable",
    "invalid-language": "workspace.errorInvalidLanguage",
    "same-language": "workspace.errorSameLanguage",
    "invalid-output": "workspace.errorInvalidOutput",
};

function sourceIssueText(t: Translate, code: string) {
    const key = SOURCE_ISSUE_COPY_KEYS[code];
    if (!key) return "";
    return t(`videoTranslation.issue.${key}`, {
        min: VIDEO_TRANSLATION_SOURCE_RULE.minSeconds,
        max: VIDEO_TRANSLATION_SOURCE_RULE.maxSeconds,
    });
}

/** 语言名按语言代码取本地化名，括号里保留原名（同名时不重复）。 */
function languageOptionText(t: Translate, option: { id: string; label: string; native: string }) {
    const name = t(`videoTranslation.language.${option.id}`, { defaultValue: option.label });
    const native = option.id === "auto" ? "" : option.native;
    if (!native || native === name) return name;
    return t("videoTranslation.workspace.languageNameWithNative", { name, native });
}

function ratioOptionText(t: Translate, option: { value: string; label: string }) {
    return t(`videoTranslation.ratio.${ratioCopyKey(option.value)}`, { defaultValue: option.label });
}

function outputCountText(t: Translate, count: number) {
    return t("videoTranslation.workspace.outputCountOption", { count });
}

export function VideoTranslationWorkspace({ className }: VideoTranslationWorkspaceProps = {}) {
    const { t } = useTranslation();
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
    const [errorCode, setErrorCode] = useState("");
    const [notice, setNotice] = useState("");
    const [running, setRunning] = useState(false);
    const [draftReady, setDraftReady] = useState(false);
    /** 结果区页签：与原站一致的三段（生成结果 / 优秀案例 / 历史记录） */
    const [rightTab, setRightTab] = useState<"result" | "cases" | "history">("result");
    const [applyingCaseId, setApplyingCaseId] = useState<string | null>(null);
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
     * 画幅提示：plan 里的 notice 只有中文串，这里按同一份结构化结果重算，
     * 保证 EN 态与 ZH 态说的是同一件事（不额外承诺「保持原画幅」这类协议没有的能力）。
     */
    const aspectNotice = useMemo(() => {
        if (!outputPlan.notice) return "";
        const vars = {
            ratio: ratioOptionText(t, { value: outputPlan.ratio, label: outputPlan.ratio }),
            size: outputPlan.size,
            sourceLabel: outputPlan.sourceRatioLabel,
            sourceSize: outputPlan.sourceSize,
        };
        if (!outputPlan.sourceSize) {
            return t(
                outputPlan.requested === VIDEO_TRANSLATION_RATIO_SOURCE
                    ? "videoTranslation.aspect.unknownFollow"
                    : "videoTranslation.aspect.unknownChosen",
                vars,
            );
        }
        if (outputPlan.preservesSource) return "";
        return t(
            outputPlan.requested === VIDEO_TRANSLATION_RATIO_SOURCE
                ? "videoTranslation.aspect.bucket"
                : "videoTranslation.aspect.mismatch",
            vars,
        );
    }, [outputPlan, t]);

    /**
     * 当前通道描述：跨工具共用的能力闸门要按「这次实际会走的传输通道」判定。
     * 静态只看 registry 会把 lipSync 当永久必需能力（所有通道都没有该参数）→ 永久禁用。
     */
    const provider = useMemo(() => providerDescriptorFromChannel("video", resolveModelChannel(config, model)), [config, model]);

    const currentSnapshot = useMemo(() => createVideoTranslationSnapshot(values, catalog), [catalog, values]);
    const stale = isVideoTranslationSnapshotStale(snapshot, currentSnapshot);
    const view = videoTranslationResultView({ task, snapshot, current: values, catalog });

    /** 结果文案：adapter 的 message 是中文串，这里按 task.status + 实际返回数量重算。 */
    const resultMessage = useMemo(() => {
        if (!task) return t("videoTranslation.workspace.resultIdle");
        const expected = normalizeVideoTranslationOutput(snapshot?.values.outputNum ?? values.outputNum);
        switch (task.status as string) {
            case "succeeded":
                if (view.videos.length === 0) return t("videoTranslation.workspace.resultNoVideo");
                return view.videos.length < expected
                    ? t("videoTranslation.workspace.resultCountShort", { actual: view.videos.length, expected })
                    : t("videoTranslation.workspace.resultCount", { actual: view.videos.length });
            case "failed":
                return task.error?.message || t("videoTranslation.workspace.resultFailedFallback");
            case "cancelled":
                return t("videoTranslation.workspace.resultCancelled");
            case "draft":
            case "validating":
            case "submitting":
            case "running":
                return t(`videoTranslation.status.${task.status as string}`);
            default:
                return t("videoTranslation.workspace.resultUnknown");
        }
    }, [snapshot?.values.outputNum, t, task, values.outputNum, view.videos.length]);

    /** 能力阻断：adapter 只给中文串，这里按 requirement key 派生本地化文案（与阻断项一一对应）。 */
    const capabilityBlockers = useMemo(
        () =>
            capability.requirements
                .filter((item) => item.required && capability.evidence[item.key] !== "supported")
                .map((item) => {
                    if (item.key === "lipSync") return t("videoTranslation.blocker.lipSync");
                    if (item.key === "outputNum") {
                        return t("videoTranslation.blocker.outputNum", { videos: VIDEO_TRANSLATION_SUPPORTED_OUTPUT });
                    }
                    return t("videoTranslation.blocker.unsupported", {
                        label: t(`videoTranslation.requirement.${item.key}`, { defaultValue: item.label }),
                    });
                }),
        [capability, t],
    );

    const submitBlockedReason = useMemo(() => {
        if (!model.trim()) return t("videoTranslation.workspace.blockedNoModel");
        if (!record) return t("videoTranslation.workspace.blockedNoSource");
        if (sourceBlockers.length > 0) return sourceIssueText(t, sourceBlockers[0].code) || sourceBlockers[0].message;
        if (capabilityBlockers.length > 0) return capabilityBlockers[0];
        return "";
    }, [capabilityBlockers, model, record, sourceBlockers, t]);

    /** 提交失败：已知 code 用本地化文案，未知 code 原样显示。 */
    const errorText = useMemo(() => {
        if (!error) return "";
        if (errorCode === "capability-blocked") {
            return capabilityBlockers[0] || t("videoTranslation.workspace.submitFailed");
        }
        const key = SUBMIT_ERROR_COPY_KEYS[errorCode];
        if (key) {
            return t(`videoTranslation.${key}`, {
                options: VIDEO_TRANSLATION_OUTPUT_OPTIONS.join(" / "),
                min: VIDEO_TRANSLATION_SOURCE_RULE.minSeconds,
                max: VIDEO_TRANSLATION_SOURCE_RULE.maxSeconds,
            });
        }
        return error;
    }, [capabilityBlockers, error, errorCode, t]);

    const sourceOptions = useMemo(() => videoTranslationSourceOptions(catalog), [catalog]);
    const targetOptions = useMemo(() => videoTranslationTargetOptions(values.sourceLanguage, catalog), [catalog, values.sourceLanguage]);
    const videoTypeLabel = t(`videoTranslation.videoType.${values.videoType}`, {
        defaultValue: videoTranslationOptionLabel(catalog.videoTypes, values.videoType) || values.videoType,
    });
    const targetLabel = t(`videoTranslation.language.${values.targetLanguage}`, {
        defaultValue: videoTranslationLanguageLabel(values.targetLanguage, catalog) || values.targetLanguage,
    });

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
                if (next.targetChanged) setNotice(t("videoTranslation.workspace.sourceLanguageAutoSwitched"));
                return next.values;
            });
        },
        [catalog, t],
    );

    /**
     * 诚实降级：上游视频接口没有 lipSync 参数（r27 协议调查），开关置灰并自动归零，
     * 避免「界面上写着已开启、请求里却被静默丢弃」，也让能力闸门不再因口型同步阻断提交。
     */
    useEffect(() => {
        setValues((previous) => (previous.lipSync ? { ...previous, lipSync: false } : previous));
    }, [values.lipSync]);

    /**
     * 「做同款」回填：只写案例里真实给出的字段（ratio / outputNum），
     * 不伪造输入素材，也不切走页签——用户仍停在优秀案例，参数已写进表单。
     */
    const applyCase = useCallback(async (item: ToolCase) => {
        setApplyingCaseId(item.id);
        try {
            const ratio = typeof item.apply?.ratio === "string" ? item.apply.ratio : "";
            const outputNum = typeof item.apply?.outputNum === "number" ? item.apply.outputNum : null;
            setValues((previous) =>
                createVideoTranslationValues({
                    ...previous,
                    ...(ratio ? { outputRatio: ratio } : {}),
                    ...(outputNum ? { outputNum } : {}),
                }),
            );
            setNotice("已按案例回填参数（做同款）");
        } finally {
            setApplyingCaseId(null);
        }
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
                const causeCode =
                    typeof cause === "object" && cause !== null && "code" in cause
                        ? String((cause as { code?: unknown }).code ?? "")
                        : "";
                setErrorCode(causeCode);
                setError(cause instanceof Error ? cause.message : "");
            } finally {
                if (aliveRef.current) setRunning(false);
            }
        },
        [catalog, config.vquality, model, provider, running, source, task, values],
    );

    const honest = videoTranslationHonestyCopy();

    return (
        <ToolShell
            className={className}
            title="视频翻译"
            subtitle="智能识别源语言，驱动口型与目标语言精准匹配。"
            sidebar={null}
            notices={
                error ? (
                    <p role="alert" className="text-xs leading-5 text-destructive">
                        {errorText}
                    </p>
                ) : notice ? (
                    <p className="text-xs leading-5 text-muted-foreground">{notice}</p>
                ) : null
            }
        >
            <div className="grid min-h-0 flex-1 gap-6 overflow-auto p-4 lg:grid-cols-[minmax(300px,320px)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-2" data-testid="video-translation-config">
    <AiVideoFamilyNav active="视频翻译" />
                    <section className="space-y-1">
                        <h2 className="text-sm font-medium">原视频</h2>
                        <p className="text-[11px] leading-4 text-muted-foreground">支持 MP4、MOV 格式，100MB 以内</p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-sm font-medium">上传需要翻译的视频</h2>
                        <ToolAssetInput
                            toolId={VIDEO_TRANSLATION_TOOL_ID}
                            draftSlot="source-video"
                            maxCount={1}
                            disabled={running}
                            variant="linkfox"
                            uploadLabel="本地上传"
                            compact
                            wide
                            actions={
                                <button
                                    type="button"
                                    className="h-7 w-full rounded-md border border-border bg-card text-xs text-muted-foreground"
                                    disabled
                                >
                                    作品选择
                                </button>
                            }
                            constraints={{
                                kind: "video",
                                mimeTypes: [...VIDEO_TRANSLATION_SOURCE_RULE.mimeTypes],
                                maxBytes: VIDEO_TRANSLATION_SOURCE_RULE.maxBytes,
                                minDurationMs: VIDEO_TRANSLATION_SOURCE_RULE.minDurationMs,
                                maxDurationMs: VIDEO_TRANSLATION_SOURCE_RULE.maxDurationMs,
                            }}
                            onChange={handleSourceVideoChange}
                        />
                        <p className="text-[11px] leading-4 text-muted-foreground">建议上传画面清晰、音频完整的视频（2-30 秒）</p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-sm font-medium">模式选择</h2>
                        <button
                            type="button"
                            aria-pressed={values.mode === "advanced"}
                            disabled={running}
                            onClick={() =>
                                setValues((previous) => ({
                                    ...previous,
                                    mode: previous.mode === "advanced" ? "standard" : "advanced",
                                }))
                            }
                            className={cn(
                                "flex w-full items-center justify-between rounded-md border px-2 py-1 text-xs transition-colors",
                                values.mode === "advanced"
                                    ? "border-primary bg-primary/10 text-foreground"
                                    : "border-border text-muted-foreground",
                            )}
                        >
                            <span>高级模式</span>
                        </button>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-sm font-medium">需要翻译的语言</h2>
                        <select
                            aria-label="需要翻译的语言"
                            className="h-8 w-full rounded-md border border-border bg-card px-2 text-xs"
                            value={values.targetLanguage}
                            disabled={running}
                            onChange={(event) => setValues((previous) => ({ ...previous, targetLanguage: event.target.value }))}
                        >
                            {targetOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                    {languageOptionText(t, option)}
                                </option>
                            ))}
                        </select>
                        <p className="text-[11px] leading-4 text-muted-foreground">
                            <span data-testid="video-translation-target-label">英语</span>
                        </p>
                        <p className="text-[11px] leading-4 text-muted-foreground">口型同步默认开启</p>
                    </section>

                    <button
                        type="button"
                        data-testid="video-translation-submit"
                        className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                        disabled={running || Boolean(submitBlockedReason)}
                        onClick={() => void handleSubmit()}
                    >
                        {running ? "生成中…" : "立即生成"}
                    </button>
                    {submitBlockedReason ? (
                        <p className="text-[11px] text-muted-foreground" data-testid="video-translation-blocked">
                            {submitBlockedReason}
                        </p>
                    ) : null}
                </div>

                <div className="min-w-0 space-y-3" data-testid="video-translation-results">
                    <div className="flex h-11 items-center gap-6 border-b border-border" role="tablist">
                        {([
                            ["result", "生成结果"],
                            ["cases", "优秀案例"],
                            ["history", "历史记录"],
                        ] as const).map(([id, label]) => (
                            <button
                                key={id}
                                type="button"
                                role="tab"
                                aria-selected={rightTab === id}
                                data-testid={`video-translation-tab-${id}`}
                                onClick={() => setRightTab(id)}
                                className={cn(
                                    "-mb-px h-11 pb-0.5 text-sm transition-colors",
                                    rightTab === id
                                        ? "border-b-2 border-primary font-medium text-foreground"
                                        : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div role="tabpanel" hidden={rightTab !== "cases"} data-testid="video-translation-panel-cases" className="flex flex-col gap-2">
                        {VIDEO_TRANSLATION_CASES.length > 0 ? (
                            <ToolCases cases={VIDEO_TRANSLATION_CASES} onApply={applyCase} applyingId={applyingCaseId} />
                        ) : (
                            <p className="text-[11px] text-muted-foreground">暂无优秀案例</p>
                        )}
                    </div>
                    <div role="tabpanel" hidden={rightTab !== "history"} data-testid="video-translation-panel-history">
                        <ToolTaskHistory toolId={VIDEO_TRANSLATION_TOOL_ID} limit={8} onSelectTask={() => setRightTab("result")} emptyHint="还没有视频翻译任务记录" />
                    </div>
                    <div role="tabpanel" hidden={rightTab !== "result"} data-testid="video-translation-panel-result" className="flex flex-col gap-3">
                        <h2 className="text-sm font-medium">上传视频并翻译为目标语言，可同步修改口型</h2>
                        <h2 className="text-sm font-medium">上传原始视频</h2>
                        <h2 className="text-sm font-medium">翻译结果</h2>
                        {/* 原站结果卡内的「一键做同款」：切到优秀案例，用案例回填参数（与套图同一交互） */}
                        <div>
                            <button
                                type="button"
                                data-testid="video-translation-one-click"
                                onClick={() => setRightTab("cases")}
                                className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                                一键做同款
                            </button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <ToolResult
                                task={task}
                                toolId={VIDEO_TRANSLATION_TOOL_ID}
                                now={Date.now()}
                                onRetry={() => void handleSubmit({ retry: true })}
                                emptyHint=""
                                className="min-h-[280px]"
                            />
                            <WatermarkGroupPanel />
                        </div>
                    </div>
                </div>
            </div>
        </ToolShell>
    );
}
