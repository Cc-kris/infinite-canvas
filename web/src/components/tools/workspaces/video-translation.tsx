/**
 * TASK-045：视频翻译工作区（layout = video）。独立文件，避免与其他视频类任务的共享文件冲突。
 *
 * 结构对齐 docs/V1.0/plan_linkfox_navigation/page-specs/38-video-translation.md：
 *  1. 原视频上传（本地上传 / 作品选择=真实资产库；MP4/MOV、100MB、2–30 秒，规则来自 registry）；
 *  2. 模式选择（原站开关：标准 / 高级）；
 * 新任务只走原片译制：FFmpeg 提取音轨，ASR 转录，文本模型逐句翻译，TTS 配音，复制原画面封装字幕。
 * 不调用普通视频生成或 SEED_V25；不承诺配音时长自动对齐、口型同步。历史重生成结果单独标识。
 * 新管线文案暂由本工作区提供中文；共享中英文 i18n 待父会话集成。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { ToolCases, type ToolCase } from "../tool-cases";
import { ToolCaseGuide } from "@/components/tools/tool-case-guide";
import { VIDEO_TRANSLATION_GUIDE_CASES, VIDEO_TRANSLATION_PROMO_IMAGE } from "@/features/tools/tool-cases-data";
import { GUIDE_WRAP_CLASS, VF_GRAY_CARD, VF_LABEL, VF_SELECT, VF_SUBMIT, VIDEO_CASE_GUIDE_CLASS, uploadVideoCaseFiles } from "./video";
import { ChevronDown } from "lucide-react";
import { videoTranslationHonestyCopy } from "./video-translation-honesty";
import {
    checkVideoTranslationSource,
    videoTranslationResultView,
    videoTranslationSourceFromRecord,
    type VideoTranslationSource,
} from "@/features/tools/adapters/video-translation";
import {
    checkVideoTranslationPipelineConfig,
    createVideoTranslationLocalPort,
    runVideoTranslationLocalTask,
} from "@/features/tools/adapters/video-translation-local";
import {
    VIDEO_TRANSLATION_OUTPUT_OPTIONS,
    VIDEO_TRANSLATION_RATIO_SOURCE,
    VIDEO_TRANSLATION_OUTPUT_RATIOS,
    VIDEO_TRANSLATION_SOURCE_RULE,
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
    videoTranslationSourceOptions,
    videoTranslationTargetOptions,
    type VideoTranslationSnapshot,
    type VideoTranslationValues,
} from "@/features/tools/registry/video-translation";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import { useStoredToolTask } from "@/features/tools/use-stored-tool-task";
import { toolAssetLibraryItemsFromAssets, readToolAssetBlob, type ToolAssetRecord } from "@/services/api/tools/assets";
import { useAssetStore, type ImageAsset, type VideoAsset } from "@/stores/use-asset-store";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";

/* ============================ TASK-045 视频翻译工作区 ============================ */

export type VideoTranslationWorkspaceProps = { className?: string };

/** 原站字段保留在草稿/快照中；本地译制不支持模式差异、多输出、改画幅或口型同步。 */
import type { ComponentProps } from "react";

/** 优秀案例数据（上游 `/image/make-case/list?type=814` 的真实抓取产物，与空态引导卡同一条原站案例）。 */
const VIDEO_TRANSLATION_CASES: ComponentProps<typeof ToolCases>["cases"] = VIDEO_TRANSLATION_GUIDE_CASES;

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

    /** 新任务不走上游重生成通道；仅检查文本/音频配置，真实端点失败仍会阻断。 */
    const pipelineBlockers = useMemo(() => checkVideoTranslationPipelineConfig(config), [config]);

    /** 复制原画面：不再换算上游画幅，也不按输出档位重编码。 */
    const outputPlan = { ratio: source?.width && source?.height ? `${source.width}:${source.height}` : "source", size: "原始画面尺寸", sourceSize: source?.width && source?.height ? `${source.width}×${source.height}` : "", sourceRatioLabel: "原视频", requested: VIDEO_TRANSLATION_RATIO_SOURCE, preservesSource: true, notice: false };

    /**
     * 当前通道描述：跨工具共用的能力闸门要按「这次实际会走的传输通道」判定。
     * 静态只看 registry 会把 lipSync 当永久必需能力（所有通道都没有该参数）→ 永久禁用。
     */
    const currentSnapshot = useMemo(() => createVideoTranslationSnapshot(values, catalog), [catalog, values]);
    const view = videoTranslationResultView({ task, snapshot, current: values, catalog });
    const legacyRegeneration = task?.configSnapshot.model !== "local-ffmpeg";

    /** 结果文案：adapter 的 message 是中文串，这里按 task.status + 实际返回数量重算。 */
    const resultMessage = useMemo(() => {
        if (!task) return t("videoTranslation.workspace.resultIdle");
        const expected = legacyRegeneration ? normalizeVideoTranslationOutput(snapshot?.values.outputNum ?? values.outputNum) : 1;
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
    }, [legacyRegeneration, snapshot?.values.outputNum, t, task, values.outputNum, view.videos.length]);

    /** 能力阻断：adapter 只给中文串，这里按 requirement key 派生本地化文案（与阻断项一一对应）。 */
    const capabilityBlockers = pipelineBlockers;

    const submitBlockedReason = useMemo(() => {
        if (pipelineBlockers.length) return pipelineBlockers[0];
        if (!record) return t("videoTranslation.workspace.blockedNoSource");
        if (sourceBlockers.length > 0) return sourceIssueText(t, sourceBlockers[0].code) || sourceBlockers[0].message;
        if (capabilityBlockers.length > 0) return capabilityBlockers[0];
        return "";
    }, [pipelineBlockers, capabilityBlockers, record, sourceBlockers, t]);

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
    const targetLabel = t(`videoTranslation.language.${values.targetLanguage}`, {
        defaultValue: videoTranslationLanguageLabel(values.targetLanguage, catalog) || values.targetLanguage,
    });

    /** 作品选择：本地资产库（真实数据），不是原站账号作品库。 */
    const assets = useAssetStore((state) => state.assets);
    const library = useMemo(
        () =>
            toolAssetLibraryItemsFromAssets(
                assets.filter((asset): asset is ImageAsset | VideoAsset => asset.kind === "image" || asset.kind === "video"),
            ),
        [assets],
    );

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
            const uploaded = item.apply?.files ? await uploadVideoCaseFiles(item) : {};
            const sourceRecord = ([] as ToolAssetRecord[]).concat(uploaded.source ?? [])[0];
            if (sourceRecord) handleSourceVideoChange([sourceRecord.id], [sourceRecord]);
            const ratio = typeof item.apply?.ratio === "string" ? item.apply.ratio : "";
            const outputNum = typeof item.apply?.outputNum === "number" ? item.apply.outputNum : null;
            const target = typeof item.apply?.targetLanguage === "string" ? item.apply.targetLanguage : "";
            setValues((previous) =>
                createVideoTranslationValues({
                    ...previous,
                    ...(sourceRecord
                        ? { sourceVideoAssetId: sourceRecord.id, sourceVideoName: sourceRecord.name, sourceVideoUrl: sourceRecord.url, sourceVideoDurationMs: sourceRecord.durationMs ?? 0 }
                        : {}),
                    ...(target && videoTranslationTargetOptions(previous.sourceLanguage, catalog).some((option) => option.id === target) ? { targetLanguage: target } : {}),
                    ...(ratio ? { outputRatio: ratio } : {}),
                    ...(outputNum ? { outputNum } : {}),
                }),
            );
            setNotice(t("videoTranslation.workspace.caseApplied"));
        } finally {
            setApplyingCaseId(null);
        }
    }, [catalog, handleSourceVideoChange, t]);

    const handleSubmit = useCallback(
        async (options?: { retry?: boolean }) => {
            if (running) return;
            setError("");
            setNotice("");
            setRunning(true);
            try {
                if (!source || !record) throw new Error("请先上传需要翻译的原视频");
                const video = await readToolAssetBlob(record.storageKey);
                if (!video) throw new Error("原视频本地数据已失效，请重新上传");
                const port = await createVideoTranslationLocalPort();
                const submitted = createVideoTranslationSnapshot(values, catalog);
                setSnapshot(submitted);
                const next = await runVideoTranslationLocalTask({
                    values,
                    source,
                    video,
                    config,
                    port,
                    draftRevision: revisionRef.current,
                    onProgress: (progress) => {
                        if (aliveRef.current) setNotice(progress.message);
                    },
                });
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
        [catalog, config, running, source, values],
    );

    const honest = {
        ...videoTranslationHonestyCopy(),
        noticeTitle: "原片译制：只替换音轨并保留字幕时间轴",
        noticeBody: "浏览器使用 FFmpeg 提取原片音轨；已配置的 ASR 转录、文本模型逐句翻译、TTS 配音，最后复制原视频画面重新封装。",
        noticeBasis: "不再调用普通视频生成或 SEED_V25 重拍。ASR、文本模型、TTS 任一未配置或失败都会停止，不返回伪结果。",
        outputHint: "每次生成 1 条译制视频。原画面不重编码、不改比例；不生成多版本，不做口型同步。",
        resultTitle: "原片译制结果",
        resultPanelLabel: "译制视频（原画面 + 新配音 + 字幕）",
        resultBadge: "原片译制 · 请核对译文与配音",
        resultEmpty: "完成原片译制后可在此核对",
        submitting: "译制处理中…",
        historyHint: "新任务使用原片译制；早期历史任务可能仍是 AI 重生成，请以输入快照为准。",
    };
    /** 案例参数标签走 i18n（数据里是原站中文「上传原始视频」）。 */
    const localizedCases = useMemo(
        () => VIDEO_TRANSLATION_CASES.map((item) => ({ ...item, params: item.params.map((param) => ({ ...param, label: t("videoTranslation.workspace.resultSourcePane") })) })),
        [t],
    );

    return (
        <div className={cn("min-w-0", className)} data-testid="video-translation-workspace">
            {error ? (
                <p role="alert" className="px-3 pt-2 text-xs leading-5 text-destructive">
                    {errorText}
                </p>
            ) : notice ? (
                <p className="px-3 pt-2 text-xs leading-5 text-muted-foreground">{notice}</p>
            ) : null}
            <ToolWorkspaceColumns
                className="min-h-0 flex-1 overflow-hidden"
                config={
                <div className="flex h-[calc(100dvh-76px)] min-h-0 min-w-0 flex-col gap-2 rounded-[8px] bg-card p-3" data-testid="video-translation-config">
                <div data-testid="vt-config-scroll" className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">

                    {/* 原站配置列顶部示意插画卡（280×174、圆角 10）+ 一行说明 */}
                    <figure className="m-0 space-y-[7px] px-[9px]">
                        <img src={VIDEO_TRANSLATION_PROMO_IMAGE} alt="" className="h-[174px] w-full rounded-[10px] bg-muted object-cover" draggable={false} />
                        <figcaption className="text-center text-[12px] font-medium leading-[18px] text-muted-foreground" data-testid="video-translation-promo">
                            自动识别源语言，一键翻译视频语音与字幕
                        </figcaption>
                    </figure>

                    <section className="space-y-2">
                        <h2 className={VF_LABEL}>{t("videoTranslation.workspace.sourceSectionTitle")}</h2>
                        <div className={VF_GRAY_CARD}>
                        <ToolAssetInput
                            toolId={VIDEO_TRANSLATION_TOOL_ID}
                            draftSlot="source-video"
                            maxCount={1}
                            disabled={running}
                            variant="linkfox"
                            uploadLabel={t("videoTranslation.workspace.uploadLocal")}
                            dropLabel={t("videoTranslation.workspace.uploadSectionTitle")}
                            hint={t("videoTranslation.workspace.sourceAdviceFull", {
                                min: VIDEO_TRANSLATION_SOURCE_RULE.minSeconds,
                                max: VIDEO_TRANSLATION_SOURCE_RULE.maxSeconds,
                            })}
                            compact
                            wide
                            library={library}
                            syncIds={record ? [record.id] : []}
                            constraints={{
                                kind: "video",
                                mimeTypes: [...VIDEO_TRANSLATION_SOURCE_RULE.mimeTypes],
                                maxBytes: VIDEO_TRANSLATION_SOURCE_RULE.maxBytes,
                                minDurationMs: VIDEO_TRANSLATION_SOURCE_RULE.minDurationMs,
                                maxDurationMs: VIDEO_TRANSLATION_SOURCE_RULE.maxDurationMs,
                            }}
                            onChange={handleSourceVideoChange}
                        />
                        </div>
                        <p className="sr-only">{t("videoTranslation.workspace.uploadShortTitle")}</p>
                        {sourceBlockers.length > 0 ? (
                            <ul className="space-y-1 text-[11px] text-destructive" role="alert">
                                {sourceBlockers.map((issue) => (
                                    <li key={issue.code}>{sourceIssueText(t, issue.code) || issue.message}</li>
                                ))}
                            </ul>
                        ) : null}
                        {sourceNotices.length > 0 ? (
                            <ul className="space-y-1 text-[11px] text-amber-600 dark:text-amber-400" data-testid="video-translation-source-notice">
                                {sourceNotices.map((issue) => (
                                    <li key={issue.code}>{sourceIssueText(t, issue.code) || issue.message}</li>
                                ))}
                            </ul>
                        ) : null}
                    </section>

                    <section className="space-y-2">
                        <h2 className={VF_LABEL}>{t("videoTranslation.workspace.modeSectionTitle")}</h2>
                        <select
                            aria-label={t("videoTranslation.workspace.modeSectionTitle")}
                            className={cn(VF_SELECT, "h-8 text-[14px]")}
                            value={values.mode}
                            disabled={running}
                            data-testid="video-translation-mode"
                            onChange={(event) => setValues((previous) => ({ ...previous, mode: event.target.value as typeof previous.mode }))}
                        >
                            <option value="standard">{t("videoTranslation.workspace.modeStandard")}</option>
                            <option value="advanced">{t("videoTranslation.workspace.modeAdvancedToggle")}</option>
                        </select>
                    </section>

                    <section className="space-y-2" data-testid="video-translation-language">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className={VF_LABEL}>源语言 → 目标语言</h2>
                        </div>
                        <label className="block text-[11px] leading-4 text-muted-foreground">
                            {t("videoTranslation.workspace.sourceLanguageLabel")}
                            <select
                                className={cn(VF_SELECT, "mt-1")}
                                value={values.sourceLanguage}
                                disabled={running}
                                data-testid="video-translation-source-language"
                                onChange={(event) => handleSourceLanguage(event.target.value)}
                            >
                                {sourceOptions.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {languageOptionText(t, option)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block text-[11px] leading-4 text-muted-foreground">
                            {t("videoTranslation.workspace.targetLanguageSectionTitle")}
                                <select
                                aria-label={t("videoTranslation.workspace.targetLanguageSectionTitle")}
                                className={cn(VF_SELECT, "mt-1")}
                                value={values.targetLanguage}
                                disabled={running}
                                data-testid="video-translation-target-language"
                                onChange={(event) => setValues((previous) => ({ ...previous, targetLanguage: event.target.value }))}
                            >
                                {targetOptions.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {languageOptionText(t, option)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <p className="sr-only">
                            <span data-testid="video-translation-target-label">{targetLabel}</span>
                        </p>
                    </section>

                    <section
                        className="space-y-2"
                        data-testid="video-translation-lipsync"
                        data-lipsync-supported="false"
                    >
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-[11px] font-normal text-muted-foreground">{t("videoTranslation.workspace.lipSyncDefaultOn")}</h2>
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
                    </section>

                    <details className="group space-y-2" data-testid="video-translation-more">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-[12px] font-[650] text-foreground [&::-webkit-details-marker]:hidden">
                        {t("videoTranslation.workspace.moreSettings")}
                        <ChevronDown aria-hidden="true" className="size-3.5 transition-transform group-open:rotate-180" />
                    </summary>
                    <section className="space-y-2 pt-2">
                        <h2 className={VF_LABEL}>{t("videoTranslation.workspace.modeTitle")}</h2>
                        <label className="block text-[11px] leading-4 text-muted-foreground">
                            {t("videoTranslation.workspace.outputCountLabel")}
                            <select
                                className={cn(VF_SELECT, "mt-1")}
                                value={values.outputNum}
                                disabled={running}
                                data-testid="video-translation-output-count"
                                onChange={(event) =>
                                    setValues((previous) => ({ ...previous, outputNum: normalizeVideoTranslationOutput(event.target.value) }))
                                }
                            >
                                {VIDEO_TRANSLATION_OUTPUT_OPTIONS.map((count) => (
                                    <option key={count} value={count}>
                                        {outputCountText(t, count)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {capabilityBlockers.length > 0 ? (
                            <p
                                className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] leading-4 text-amber-700 dark:text-amber-300"
                                role="alert"
                                data-testid="video-translation-capability-blocker"
                            >
                                {capabilityBlockers[0]}
                            </p>
                        ) : null}
                        <label className="block text-[11px] leading-4 text-muted-foreground">
                            {t("videoTranslation.workspace.outputRatioLabel")}
                            <select
                                className={cn(VF_SELECT, "mt-1")}
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
                                        {ratioOptionText(t, option)}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </section>
                    </details>

                    </div>
                    <div data-testid="vt-submit-bar" className="shrink-0 space-y-1 bg-card pb-1 pt-2">
                    <button
                        type="button"
                        data-testid="video-translation-submit"
                        className={VF_SUBMIT}
                        disabled={running || Boolean(submitBlockedReason)}
                        onClick={() => void handleSubmit()}
                    >
                        {running ? honest.submitting : "开始译制"}
                    </button>
                    {submitBlockedReason ? (
                        <p className="text-[11px] text-muted-foreground" data-testid="video-translation-blocked">
                            {submitBlockedReason}
                        </p>
                    ) : null}
                    </div>
                </div>
                }>

                <div className="min-w-0 space-y-3 rounded-[8px] bg-card p-3" data-testid="video-translation-results">
                    <div className="flex h-11 items-center gap-6 border-b border-border" role="tablist">
                        {([
                            ["result", t("toolChrome.result.title")],
                            ["cases", t("videoTranslation.workspace.casesTitle")],
                            ["history", t("toolChrome.historyTitle")],
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
                                        ? "border-b-2 border-foreground font-medium text-foreground"
                                        : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div role="tabpanel" hidden={rightTab !== "cases"} data-testid="video-translation-cases" className="flex flex-col gap-2">
                        <h2 className="mb-2 text-sm font-medium">{t("videoTranslation.workspace.casesTitle")}</h2>
                        {VIDEO_TRANSLATION_CASES.length > 0 ? (
                            <ToolCases cases={localizedCases} onApply={applyCase} applyingId={applyingCaseId} />
                        ) : (
                            <p className="text-[11px] text-muted-foreground">{t("videoTranslation.workspace.casesEmpty")}</p>
                        )}
                    </div>
                    <div role="tabpanel" hidden={rightTab !== "history"} data-testid="video-translation-history" className="space-y-2">
                        <h2 className="text-sm font-medium">{t("videoTranslation.workspace.historyTitle")}</h2>
                        <ToolTaskHistory
                            toolId={VIDEO_TRANSLATION_TOOL_ID}
                            limit={8}
                            emptyHint={t("videoTranslation.workspace.historyEmpty")}
                            onSelectTask={(historyTask) => {
                                setTask(historyTask);
                                setRightTab("result");
                                setNotice(t("videoTranslation.workspace.historyLoaded"));
                            }}
                        />
                    </div>
                    <div role="tabpanel" hidden={rightTab !== "result"} data-testid="video-translation-panel-result" className="flex min-h-full flex-col gap-3">
                        {!task ? (
                            /* 原站空态：居中标题 +「上传原始视频 → 翻译结果」案例卡 + 一键做同款 */
                            <div className={cn(GUIDE_WRAP_CLASS, "flex-1")} data-testid="video-translation-guide">
                                <ToolCaseGuide
                                    cases={localizedCases}
                                    onApply={applyCase}
                                    applyingId={applyingCaseId}
                                    title="上传原视频，按真实语音生成译制配音与字幕"
                                    resultLabel={t("videoTranslation.workspace.guideResultLabel")}
                                    className={VIDEO_CASE_GUIDE_CLASS}
                                />
                            </div>
                        ) : (
                        <>
                        {/* 原视频 ↔ 译制结果 对照播放 */}
                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                                <p className="text-[11px] leading-4 text-muted-foreground">{t("videoTranslation.workspace.resultSourcePane")}</p>
                                {record ? (
                                    <video src={record.url} controls className="w-full rounded-lg border border-border bg-black" data-testid="video-translation-source-player" />
                                ) : (
                                    <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-border px-3 text-center text-[11px] leading-4 text-muted-foreground">
                                        {t("videoTranslation.workspace.sourcePaneEmpty")}
                                    </div>
                                )}
                            </div>
                            <div className="space-y-1">
                                <p className="text-[11px] leading-4 text-muted-foreground">{honest.resultPanelLabel}</p>
                                {view.videos[0]?.url ? (
                                    <video src={view.videos[0].url} controls className="w-full rounded-lg border border-border bg-black" data-testid="video-translation-result-player" />
                                ) : (
                                    <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-border px-3 text-center text-[11px] leading-4 text-muted-foreground">
                                        {task ? resultMessage : honest.resultEmpty}
                                    </div>
                                )}
                            </div>
                        </div>

                        <ToolResult
                            task={task}
                            toolId={VIDEO_TRANSLATION_TOOL_ID}
                            title={t("videoTranslation.workspace.resultTitle")}
                            emptyTitle={t("videoTranslation.workspace.resultEmptyTitle")}
                            emptyHint=""
                            now={Date.now()}
                            onOneClickAlike={() => setRightTab("cases")}
                            onRetry={() => void handleSubmit({ retry: true })}
                            className="min-h-[280px]"
                        />
                        </>
                        )}
                    </div>
                </div>
            </ToolWorkspaceColumns>
        </div>
    );
}
