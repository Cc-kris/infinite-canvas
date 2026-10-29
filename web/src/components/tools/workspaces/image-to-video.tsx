/**
 * TASK-041：「图转视频」IMAGE_TO_VIDEO 工作区（layout = video）。
 *
 * ⚠️ 文件名说明：registry 里布局同为 "video" 的「带货口播」SALE_VIDEO（TASK-042）占用
 * `workspaces/video.tsx`，因此本工具的工作区放在独立文件，避免并行任务互相覆盖。
 * 最终挂载时按 toolId 分发：IMAGE_TO_VIDEO → ImageToVideoWorkspace，SALE_VIDEO → video.tsx。
 *
 * 结构对齐 docs/V1.0/plan_linkfox_navigation/page-specs/34-image-to-video.md：
 *  1. 素材来源三模式（参考素材 / 首尾帧 / 商品链接），各自保留状态；
 *  2. 商品信息 0/1600（AI 分析未接解析服务 → 按钮禁用并说明，绝不伪造分析结果）；
 *  3. 视频类型必填（4 种，切换联动模板与时长）+ 模板/自定义描述 + 提示词优化；
 *  4. 模型品质（768P/1080P）、时长（5/10/15）、7 种比例、销售国家 → 语言联动；
 *  5. 结果区：真实 ToolResult，配置变更后旧结果标「来自旧版本」。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolCases, type ToolCase } from "@/components/tools/tool-cases";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { uploadCaseFiles } from "@/features/tools/case-apply";
import { IMAGE_TO_VIDEO_CASES, type ImageToVideoCase } from "@/features/tools/image-to-video-cases-data";
import { useStoredToolTask } from "@/features/tools/use-stored-tool-task";
import { loadToolAssetRecords, type ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";
import { cn } from "@/lib/utils";

import {
    IMAGE_TO_VIDEO_COUNTRIES,
    IMAGE_TO_VIDEO_DRAFT_SLOT,
    IMAGE_TO_VIDEO_DURATIONS,
    IMAGE_TO_VIDEO_LANGUAGES,
    IMAGE_TO_VIDEO_MAKE_TYPE,
    IMAGE_TO_VIDEO_PRODUCT_INFO_LIMIT,
    IMAGE_TO_VIDEO_PROMPT_LIMIT,
    IMAGE_TO_VIDEO_RATIO_BY_KEY,
    IMAGE_TO_VIDEO_RATIOS,
    IMAGE_TO_VIDEO_RESOLUTION_BY_KEY,
    IMAGE_TO_VIDEO_RESOLUTIONS,
    IMAGE_TO_VIDEO_SOURCE_MODES,
    IMAGE_TO_VIDEO_TOOL_ID,
    IMAGE_TO_VIDEO_UPLOAD,
    IMAGE_TO_VIDEO_VIDEO_TYPES,
    buildImageToVideoPrompt,
    countryOf,
    createImageToVideoSnapshot,
    createImageToVideoValues,
    describeImageToVideoDrift,
    imageToVideoCaseApplyPatch,
    imageToVideoRatioFromSize,
    isImageToVideoDuration,
    linkImageToVideoValues,
    readImageToVideoValues,
    resolveImageToVideoCapability,
    toImageToVideoDraftValues,
    validateImageToVideoState,
    videoTypeOf,
    type ImageToVideoAssetRef,
    type ImageToVideoSnapshot,
    type ImageToVideoValues,
} from "@/features/tools/registry/image-to-video";
import {
    ImageToVideoAdapterError,
    describeImageToVideoResult,
    imageToVideoResultCell,
    imageToVideoSourceFromRecord,
    runImageToVideo,
    validateImageToVideoSourceSize,
    type ImageToVideoAssetLike,
} from "@/features/tools/adapters/image-to-video";

const toRef = (asset: ImageToVideoAssetLike): ImageToVideoAssetRef => ({
    id: asset.id ?? "",
    name: asset.name,
    width: asset.width,
    height: asset.height,
    mimeType: asset.mimeType,
    bytes: asset.bytes,
});

const imageConstraints = {
    kind: "image" as const,
    mimeTypes: [...IMAGE_TO_VIDEO_UPLOAD.mimeTypes],
    maxBytes: IMAGE_TO_VIDEO_UPLOAD.maxBytes,
};

function Section({ title, hint, testId, children }: { title: string; hint?: string; testId?: string; children: React.ReactNode }) {
    return (
        <section data-testid={testId} className="rounded-lg border border-border/60 bg-card/40 p-3">
            <h3 className="text-[12px] font-semibold text-foreground">{title}</h3>
            {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
            <div className="mt-2 flex flex-col gap-2">{children}</div>
        </section>
    );
}

function StepBar({ step }: { step: number }) {
    const steps = ["素材", "配置", "结果"];
    return (
        <ol data-testid="image-to-video-steps" data-step={step} className="flex flex-wrap items-center gap-1 text-[11px]">
            {steps.map((label, index) => {
                const index1 = index + 1;
                const active = index1 === step;
                const done = index1 < step;
                return (
                    <li
                        key={label}
                        data-active={active ? "true" : "false"}
                        className={cn(
                            "rounded-md border px-2 py-0.5",
                            active && "border-primary bg-primary/10 text-primary",
                            done && !active && "border-border bg-muted text-muted-foreground",
                            !active && !done && "border-border/60 text-muted-foreground",
                        )}
                    >
                        {index1}. {label}
                    </li>
                );
            })}
        </ol>
    );
}

const selectClass = "min-h-9 rounded-md border border-border bg-background px-2 text-[12px] text-foreground";

/**
 * 图转视频工作区：所有枚举来自 registry，提交走网关真实任务，不产生任何本地假结果。
 */
export function ImageToVideoWorkspace({ className, toolId = IMAGE_TO_VIDEO_TOOL_ID }: { className?: string; toolId?: string }) {
    const hydrate = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const flushDraft = useToolDraftStore((state) => state.flush);
    const draft = useToolDraftStore((state) => state.drafts[toolId]);
    const config = useConfigStore((state) => state.config);

    const [values, setValues] = useState<ImageToVideoValues>(() => createImageToVideoValues());
    const [references, setReferences] = useState<ImageToVideoAssetLike[]>([]);
    const [firstFrame, setFirstFrame] = useState<ImageToVideoAssetLike | undefined>();
    const [lastFrame, setLastFrame] = useState<ImageToVideoAssetLike | undefined>();
    const [task, setTask] = useState<ToolTask | undefined>();
    const [snapshot, setSnapshot] = useState<ImageToVideoSnapshot | undefined>();
    /**
     * 结果回填：任务与结果字节都已落库，刷新/重进后按最近一条落盘任务还原结果区，
     * 否则「生成成功 → 刷新 → 结果空白」，下载 / 存资产 / 发画布全部点不到。
     * 只在本会话还没有任务时回填，不覆盖新提交。
     */
    const storedTask = useStoredToolTask(IMAGE_TO_VIDEO_TOOL_ID);
    useEffect(() => {
        if (!task && storedTask) setTask(storedTask);
    }, [storedTask, task]);
    const [running, setRunning] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [lostAssets, setLostAssets] = useState<string[]>([]);
    const [runError, setRunError] = useState<string | undefined>();
    const [linkNotice, setLinkNotice] = useState<string | undefined>();
    const [caseNotice, setCaseNotice] = useState<string | undefined>();
    const [applyingCaseId, setApplyingCaseId] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    // 最新表单值快照：update() 需要在渲染期之外基于「上一次的值」做联动计算，
    // 不能把 setLinkNotice / patchDraft 这类副作用塞进 setValues 的 updater 里
    // （updater 可能在渲染阶段执行，会触发 setState-in-render 与额外重渲染）。
    const valuesRef = useRef(values);
    useEffect(() => {
        valuesRef.current = values;
    }, [values]);

    // 草稿恢复：先还原值，再按 assetId 拉回资产；丢失的 id 明确提示，不静默丢状态。
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const restored = await hydrate(toolId);
            if (cancelled) return;
            const parsed = readImageToVideoValues(restored?.values?.[IMAGE_TO_VIDEO_DRAFT_SLOT] as Record<string, unknown> | undefined);
            setValues(parsed);
            const ids = Array.from(
                new Set(
                    [...parsed.referenceAssetIds, parsed.firstFrameAssetId, parsed.lastFrameAssetId].filter(
                        (id): id is string => typeof id === "string" && id.length > 0,
                    ),
                ),
            );
            if (ids.length === 0) return;
            setRestoring(true);
            try {
                const { records, lostIds } = await loadToolAssetRecords(ids);
                if (cancelled) return;
                const byId = new Map(records.map((record) => [record.id, imageToVideoSourceFromRecord(record)]));
                const lost = [...lostIds];
                setReferences(
                    parsed.referenceAssetIds.map((id) => byId.get(id)).filter((asset): asset is ImageToVideoAssetLike => Boolean(asset)),
                );
                const first = parsed.firstFrameAssetId ? byId.get(parsed.firstFrameAssetId) : undefined;
                if (first) setFirstFrame(first);
                else if (parsed.firstFrameAssetId) lost.push(parsed.firstFrameAssetId);
                const last = parsed.lastFrameAssetId ? byId.get(parsed.lastFrameAssetId) : undefined;
                if (last) setLastFrame(last);
                else if (parsed.lastFrameAssetId) lost.push(parsed.lastFrameAssetId);
                const missingRefs = parsed.referenceAssetIds.filter((id) => !byId.has(id));
                setLostAssets(Array.from(new Set([...lost, ...missingRefs])));
            } finally {
                if (!cancelled) setRestoring(false);
            }
        })();
        return () => {
            cancelled = true;
            void flushDraft(toolId);
        };
    }, [toolId, hydrate, flushDraft]);

    const update = useCallback(
        (patch: Partial<ImageToVideoValues>) => {
            // 纯函数式联动：先算结果并同步 ref，再一次性落草稿/状态，避免在
            // setValues 的 updater（可能在渲染阶段执行）里触发别的 setState。
            const linked = linkImageToVideoValues(valuesRef.current, patch);
            valuesRef.current = linked.values;
            patchDraft(toolId, {
                values: { [IMAGE_TO_VIDEO_DRAFT_SLOT]: toImageToVideoDraftValues(linked.values) },
                assetIds: [linked.values.firstFrameAssetId, linked.values.lastFrameAssetId, ...linked.values.referenceAssetIds].filter(Boolean),
            });
            setValues(linked.values);
            if (linked.changes.length) setLinkNotice(linked.changes.join("；"));
        },
        [patchDraft, toolId],
    );

    const videoModels = useMemo(() => {
        const names = new Set<string>();
        for (const channel of config.channels) {
            for (const model of channel.models) {
                if (!model.capability || model.capability === "video") names.add(model.name);
            }
        }
        if (config.videoModel) names.add(config.videoModel);
        return Array.from(names);
    }, [config.channels, config.videoModel]);

    const effectiveModel = values.modelId || config.videoModel || "";
    const assetRefs = useMemo(
        () => ({
            references: references.map(toRef),
            firstFrame: firstFrame ? toRef(firstFrame) : undefined,
            lastFrame: lastFrame ? toRef(lastFrame) : undefined,
        }),
        [references, firstFrame, lastFrame],
    );

    const capability = useMemo(
        () => resolveImageToVideoCapability({ values: { ...values, modelId: effectiveModel }, assets: assetRefs, modelOptions: videoModels }),
        [values, effectiveModel, assetRefs, videoModels],
    );
    const issues = useMemo(() => validateImageToVideoState(values, assetRefs), [values, assetRefs]);
    const currentSnapshot = useMemo(() => createImageToVideoSnapshot({ ...values, modelId: effectiveModel }), [values, effectiveModel]);
    const drift = useMemo(() => describeImageToVideoDrift(snapshot, { ...values, modelId: effectiveModel }), [snapshot, values, effectiveModel]);
    const prompt = useMemo(() => buildImageToVideoPrompt(values), [values]);
    const resultSummary = useMemo(() => describeImageToVideoResult({ task, snapshot, drift }), [task, snapshot, drift]);
    const cell = useMemo(() => imageToVideoResultCell(task), [task]);
    const blocked = running || restoring || !capability.executable;

    const onReferenceChange = useCallback(
        (assetIds: string[], records: ToolAssetRecord[]) => {
            const next = records.slice(0, IMAGE_TO_VIDEO_UPLOAD.maxCount).map(imageToVideoSourceFromRecord);
            for (const asset of next) {
                const checked = validateImageToVideoSourceSize(asset);
                if (!checked.ok) {
                    setRunError(`${asset.name}：${checked.message}`);
                    return;
                }
            }
            setRunError(undefined);
            setReferences(next);
            update({ referenceAssetIds: next.map((asset) => asset.id ?? "").filter(Boolean) });
            if (assetIds.length > IMAGE_TO_VIDEO_UPLOAD.maxCount) setLinkNotice(`参考图最多 ${IMAGE_TO_VIDEO_UPLOAD.maxCount} 张，已忽略多余图片`);
        },
        [update],
    );

    const onFrameChange = useCallback(
        (role: "first" | "last", records: ToolAssetRecord[]) => {
            if (records.length === 0) {
                if (role === "first") setFirstFrame(undefined);
                else setLastFrame(undefined);
                return;
            }
            const asset = imageToVideoSourceFromRecord(records[0]);
            const checked = validateImageToVideoSourceSize(asset);
            if (!checked.ok) {
                setRunError(`${asset.name}：${checked.message}`);
                return;
            }
            setRunError(undefined);
            if (role === "first") {
                setFirstFrame(asset);
                update({ firstFrameAssetId: asset.id ?? "" });
            } else {
                setLastFrame(asset);
                update({ lastFrameAssetId: asset.id ?? "" });
            }
        },
        [update],
    );

    /**
     * 「做同款」：真实案例 → 上传原图入库 → 回填表单（原站脚本 / 比例 / 清晰度 / 时长）。
     * 素材上传失败直接报错，不做任何占位替身。
     */
    const applyCase = useCallback(
        async (item: ToolCase) => {
            const videoCase = item as ImageToVideoCase;
            setApplyingCaseId(item.id);
            setRunError(undefined);
            setCaseNotice(undefined);
            try {
                const assets = await uploadCaseFiles(item);
                const reference = assets.reference;
                if (!reference || Array.isArray(reference)) {
                    throw new Error("该案例没有可回填的原图素材（files.reference 缺失）。");
                }
                const asset = imageToVideoSourceFromRecord(reference);
                const checked = validateImageToVideoSourceSize(asset);
                if (!checked.ok) throw new Error(`${asset.name}：${checked.message}`);

                setReferences([asset]);
                const { patch, notices } = imageToVideoCaseApplyPatch(videoCase.apply, [asset.id ?? ""].filter(Boolean));
                update(patch);
                setCaseNotice(
                    [
                        `已套用原站案例 ${item.id}：原图 1 张 + ${patch.promptMode === "custom" ? `原站脚本 ${videoCase.apply.prompt.trim().length} 字` : "无脚本"}`,
                        ...notices,
                    ].join("；"),
                );
            } catch (error) {
                setRunError(error instanceof Error ? error.message : "案例回填失败。");
            } finally {
                setApplyingCaseId(null);
            }
        },
        [update],
    );

    /**
     * 历史任务 → 表单：把该任务真实提交过的 prompt / 参考图 / 比例 / 时长 / 清晰度放回表单，
     * 便于改参数重跑。快照里没有的字段才退回当前值，并在提示里如实说明。
     */
    const restoreFromTask = useCallback(
        async (historyTask: ToolTask) => {
            const ratioKey = imageToVideoRatioFromSize(historyTask.configSnapshot?.size);
            /* 快照里确实存了 videoSeconds / quality（网关 buildConfigSnapshot 写入），按真实值回填；
             * 只有旧任务缺字段时才退回当前值，不再一律声称「未存」。 */
            const seconds = Number(historyTask.configSnapshot?.videoSeconds);
            const durationKey = isImageToVideoDuration(seconds) ? seconds : undefined;
            const qualityKey = String(historyTask.configSnapshot?.quality ?? "");
            const resolutionKey = IMAGE_TO_VIDEO_RESOLUTION_BY_KEY[qualityKey] ? qualityKey : undefined;
            const ids = (historyTask.sourceAssetIds ?? []).filter((id): id is string => typeof id === "string" && id.length > 0);
            let nextReferences: ImageToVideoAssetLike[] | undefined;
            let lostCount = 0;
            if (ids.length) {
                const { records, lostIds } = await loadToolAssetRecords(ids);
                nextReferences = records.map(imageToVideoSourceFromRecord);
                lostCount = lostIds.length;
                if (lostIds.length) setLostAssets((previous) => Array.from(new Set([...previous, ...lostIds])));
            }
            if (nextReferences) setReferences(nextReferences);
            update({
                sourceMode: "reference",
                ...(historyTask.prompt.trim() ? { promptMode: "custom" as const } : {}),
                prompt: historyTask.prompt,
                ...(ratioKey ? { aspectRatio: ratioKey } : {}),
                ...(durationKey ? { duration: durationKey } : {}),
                ...(resolutionKey ? { resolution: resolutionKey } : {}),
                referenceAssetIds: ids,
            });
            setCaseNotice(
                [
                    `已按历史任务 ${historyTask.id.slice(0, 8)} 回填表单：提示词取该任务真实提交文本`,
                    `${nextReferences?.length ?? 0} 张参考图${lostCount ? `（${lostCount} 张本地已不存在）` : ""}`,
                    ratioKey ? `比例 ${ratioKey}` : "比例未记录",
                    durationKey ? `时长 ${durationKey}s` : "时长未记录，沿用当前值",
                    resolutionKey ? `清晰度 ${resolutionKey}` : "清晰度未记录，沿用当前值",
                ].join("；"),
            );
        },
        [update],
    );

    const submit = useCallback(async () => {
        setRunning(true);
        setRunError(undefined);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            await flushDraft(toolId);
            const run = await runImageToVideo({
                values: { ...values, modelId: effectiveModel },
                sources: { references, firstFrame, lastFrame },
                config,
                signal: controller.signal,
                draftRevision: draft?.revision ?? null,
                onTask: (next) => {
                    setTask(next);
                    // 真实任务快照落库（localStorage），历史区与刷新恢复都读它；不写假状态。
                    useToolTaskStore.getState().upsertTask(next);
                },
            });
            setSnapshot(run.snapshot);
            setTask(run.task);
            useToolTaskStore.getState().upsertTask(run.task);
        } catch (error) {
            setRunError(error instanceof ImageToVideoAdapterError || error instanceof Error ? error.message : "生成失败。");
        } finally {
            setRunning(false);
            abortRef.current = null;
        }
    }, [flushDraft, toolId, values, effectiveModel, references, firstFrame, lastFrame, config, draft?.revision]);

    const cancel = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
    }, []);

    const mode = values.sourceMode;
    const hasSource = references.length > 0 || Boolean(firstFrame);
    const step = !hasSource ? 1 : !task ? 2 : 3;
    const disabledField = running || restoring;
    const template = videoTypeOf(values.videoType);
    const ratioLabel = IMAGE_TO_VIDEO_RATIO_BY_KEY[values.aspectRatio]?.label ?? values.aspectRatio;
    const resolutionLabel = IMAGE_TO_VIDEO_RESOLUTION_BY_KEY[values.resolution]?.label ?? values.resolution;

    return (
        <div data-testid="image-to-video-workspace" data-make-type={IMAGE_TO_VIDEO_MAKE_TYPE} className={cn("flex flex-col gap-3", className)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-base font-semibold text-foreground">图转视频</h2>
                    <p className="text-[11px] text-muted-foreground">
                        参考素材 / 首尾帧 / 商品链接三选一 → 视频类型与模型品质 → 生成（makeType {IMAGE_TO_VIDEO_MAKE_TYPE}，27 字段真实提交）
                    </p>
                </div>
                <StepBar step={step} />
            </div>

            {lostAssets.length ? (
                <p data-testid="image-to-video-lost" className="rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    有 {lostAssets.length} 个上次的素材已失效（{lostAssets.join("、")}），请重新上传。
                </p>
            ) : null}
            {linkNotice ? (
                <p data-testid="image-to-video-link" className="rounded-md bg-sky-50 px-3 py-2 text-[11px] text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                    已自动联动：{linkNotice}
                </p>
            ) : null}
            {caseNotice ? (
                <p data-testid="image-to-video-case-note" className="rounded-md bg-muted px-3 py-2 text-[11px] text-muted-foreground">
                    {caseNotice}
                </p>
            ) : null}

            <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
                <div className="flex min-w-0 flex-col gap-3">
                    <Section title="1. 素材来源" hint={IMAGE_TO_VIDEO_UPLOAD.hint} testId="image-to-video-source">
                        <div role="tablist" aria-label="素材模式" className="flex gap-1">
                            {IMAGE_TO_VIDEO_SOURCE_MODES.map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    role="tab"
                                    data-testid={`image-to-video-mode-${item.key}`}
                                    aria-selected={mode === item.key}
                                    disabled={disabledField}
                                    title={item.hint}
                                    onClick={() => update({ sourceMode: item.key })}
                                    className={cn(
                                        "min-h-9 flex-1 rounded-md border px-2 text-[11px]",
                                        mode === item.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                                    )}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>

                        {mode === "reference" || mode === "product-link" ? (
                            <ToolAssetInput
                                toolId={toolId}
                                title="上传参考图"
                                maxCount={IMAGE_TO_VIDEO_UPLOAD.maxCount}
                                disabled={disabledField}
                                constraints={imageConstraints}
                                syncIds={values.referenceAssetIds}
                                onChange={onReferenceChange}
                            />
                        ) : null}

                        {mode === "frames" ? (
                            <div className="grid gap-2 sm:grid-cols-2">
                                <ToolAssetInput
                                    toolId={`${toolId}-first`}
                                    title="首帧（必填）"
                                    maxCount={1}
                                    disabled={disabledField}
                                    constraints={imageConstraints}
                                    onChange={(_, records) => onFrameChange("first", records)}
                                />
                                <ToolAssetInput
                                    toolId={`${toolId}-last`}
                                    title="尾帧（选填）"
                                    maxCount={1}
                                    disabled={disabledField}
                                    constraints={imageConstraints}
                                    onChange={(_, records) => onFrameChange("last", records)}
                                />
                            </div>
                        ) : null}

                        {mode === "product-link" ? (
                            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                                <span>商品链接</span>
                                <input
                                    data-testid="image-to-video-product-url"
                                    value={values.productUrl}
                                    disabled={disabledField}
                                    placeholder="https://"
                                    onChange={(event) => update({ productUrl: event.target.value })}
                                    className={selectClass}
                                />
                            </label>
                        ) : null}

                        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                            <span>
                                商品信息（选填）<span className="ml-1 tabular-nums">{values.productInfo.length} / {IMAGE_TO_VIDEO_PRODUCT_INFO_LIMIT}</span>
                            </span>
                            <textarea
                                data-testid="image-to-video-product-info"
                                value={values.productInfo}
                                disabled={disabledField}
                                rows={3}
                                maxLength={IMAGE_TO_VIDEO_PRODUCT_INFO_LIMIT}
                                onChange={(event) => update({ productInfo: event.target.value, productAnalyzed: false })}
                                className="rounded-md border border-border bg-background px-2 py-1 text-[12px] text-foreground"
                            />
                        </label>
                        <button
                            type="button"
                            data-testid="image-to-video-analyze"
                            disabled
                            title="未配置商品解析服务：本页不伪造 AI 分析结果，请手动填写商品信息"
                            className="min-h-9 rounded-md border border-dashed border-border px-3 text-[11px] text-muted-foreground opacity-70"
                        >
                            AI 分析（未接入解析服务，需手动填写）
                        </button>
                    </Section>

                    <Section title="2. 视频类型（必填）" hint={`当前模板：${template.label} · ${template.templateName}`} testId="image-to-video-type">
                        <div className="grid gap-1 sm:grid-cols-2">
                            {IMAGE_TO_VIDEO_VIDEO_TYPES.map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    data-testid={`image-to-video-type-${item.key}`}
                                    aria-pressed={values.videoType === item.key}
                                    disabled={disabledField}
                                    onClick={() => update({ videoType: item.key })}
                                    className={cn(
                                        "rounded-md border px-2 py-1 text-left text-[11px]",
                                        values.videoType === item.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                                    )}
                                >
                                    <span className="block font-medium">{item.label}</span>
                                    <span className="block text-[10px] opacity-70">{item.templateName}</span>
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-1 text-[11px]">
                            {(["template", "custom"] as const).map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    data-testid={`image-to-video-prompt-mode-${key}`}
                                    aria-pressed={values.promptMode === key}
                                    disabled={disabledField}
                                    onClick={() => update({ promptMode: key })}
                                    className={cn(
                                        "min-h-8 flex-1 rounded-md border px-2",
                                        values.promptMode === key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                                    )}
                                >
                                    {key === "template" ? "视频模板" : "自定义描述"}
                                </button>
                            ))}
                        </div>
                        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                            <span>
                                {values.promptMode === "template" ? "模板描述（可覆盖）" : "自定义描述"}
                                <span className="ml-1 tabular-nums">{values.prompt.length} / {IMAGE_TO_VIDEO_PROMPT_LIMIT}</span>
                            </span>
                            <textarea
                                data-testid="image-to-video-prompt"
                                value={values.prompt}
                                disabled={disabledField}
                                rows={3}
                                maxLength={IMAGE_TO_VIDEO_PROMPT_LIMIT}
                                placeholder={template.templatePrompt}
                                onChange={(event) => update({ prompt: event.target.value })}
                                className="rounded-md border border-border bg-background px-2 py-1 text-[12px] text-foreground"
                            />
                        </label>
                        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <input
                                data-testid="image-to-video-optimizer"
                                type="checkbox"
                                checked={values.promptOptimizer}
                                disabled={disabledField}
                                onChange={(event) => update({ promptOptimizer: event.target.checked })}
                            />
                            提示词优化（promptOptimizer）
                        </label>
                    </Section>

                    <Section title="3. 模型品质 / 时长比例 / 地区语言" testId="image-to-video-output">
                        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                            <span>视频模型（未选择时跟随设置里的视频模型）</span>
                            <select
                                data-testid="image-to-video-model"
                                value={values.modelId}
                                disabled={disabledField}
                                onChange={(event) => update({ modelId: event.target.value })}
                                className={selectClass}
                            >
                                <option value="">跟随默认模型{config.videoModel ? `（${config.videoModel}）` : ""}</option>
                                {videoModels.map((name) => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                        </label>
                        <div className="grid gap-2 sm:grid-cols-2">
                            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                                <span>清晰度</span>
                                <select
                                    data-testid="image-to-video-resolution"
                                    value={values.resolution}
                                    disabled={disabledField}
                                    onChange={(event) => update({ resolution: event.target.value })}
                                    className={selectClass}
                                >
                                    {IMAGE_TO_VIDEO_RESOLUTIONS.map((item) => (
                                        <option key={item.key} value={item.key}>{item.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                                <span>时长</span>
                                <select
                                    data-testid="image-to-video-duration"
                                    value={String(values.duration)}
                                    disabled={disabledField}
                                    onChange={(event) => update({ duration: Number(event.target.value) as ImageToVideoValues["duration"] })}
                                    className={selectClass}
                                >
                                    {IMAGE_TO_VIDEO_DURATIONS.map((seconds) => (
                                        <option key={seconds} value={String(seconds)}>{seconds} 秒</option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                                <span>比例</span>
                                <select
                                    data-testid="image-to-video-ratio"
                                    value={values.aspectRatio}
                                    disabled={disabledField}
                                    onChange={(event) => update({ aspectRatio: event.target.value })}
                                    className={selectClass}
                                >
                                    {IMAGE_TO_VIDEO_RATIOS.map((item) => (
                                        <option key={item.key} value={item.key}>{item.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                                <span>销售国家</span>
                                <select
                                    data-testid="image-to-video-country"
                                    value={values.saleCountry}
                                    disabled={disabledField}
                                    onChange={(event) => update({ saleCountry: event.target.value })}
                                    className={selectClass}
                                >
                                    {IMAGE_TO_VIDEO_COUNTRIES.map((item) => (
                                        <option key={item.key} value={item.key}>{item.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                                <span>语言</span>
                                <select
                                    data-testid="image-to-video-language"
                                    value={values.language}
                                    disabled={disabledField}
                                    onChange={(event) => update({ language: event.target.value })}
                                    className={selectClass}
                                >
                                    {IMAGE_TO_VIDEO_LANGUAGES.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <p data-testid="image-to-video-hint" className="text-[10px] text-muted-foreground">
                            发送规格：{values.duration}s · {ratioLabel} · {resolutionLabel} · {countryOf(values.saleCountry).label} → {values.language}
                        </p>
                    </Section>

                    <button
                        type="button"
                        data-testid="image-to-video-submit"
                        disabled={blocked}
                        onClick={() => void submit()}
                        className="min-h-11 w-full rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
                    >
                        {running ? "生成中…" : `生成视频（${capability.expected}）`}
                    </button>

                    {(capability.blockers.length > 0 || issues.warnings.length > 0 || capability.notices.length > 0 || runError) ? (
                        <ul data-testid="image-to-video-issues" className="flex flex-col gap-1 text-[11px]">
                            {runError ? <li className="text-destructive">提交失败：{runError}</li> : null}
                            {capability.blockers.map((item) => (
                                <li key={item} className="text-destructive">• {item}</li>
                            ))}
                            {issues.warnings.map((item) => (
                                <li key={item} className="text-amber-600 dark:text-amber-400">• {item}</li>
                            ))}
                            {capability.notices.map((item) => (
                                <li key={item} className="text-muted-foreground">• {item}</li>
                            ))}
                        </ul>
                    ) : null}

                    <details className="rounded-md border border-border/60 p-2 text-[11px] text-muted-foreground">
                        <summary className="cursor-pointer">本次提交内容预览</summary>
                        <pre data-testid="image-to-video-prompt-preview" className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words">{prompt}</pre>
                        <p className="mt-1 tabular-nums">快照 {currentSnapshot.hash} · 参考图 {references.length} 张</p>
                    </details>
                </div>

                <div className="flex min-w-0 flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-[12px] font-semibold text-foreground">结果</h3>
                        <span data-testid="image-to-video-result-tone" data-tone={resultSummary.tone} className="text-[11px] text-muted-foreground">
                            {resultSummary.title}
                        </span>
                    </div>
                    <p
                        data-testid="image-to-video-result-detail"
                        className={cn("text-[11px]", resultSummary.tone === "failed" ? "text-destructive" : "text-muted-foreground")}
                    >
                        {resultSummary.detail}
                    </p>
                    {running ? (
                        <button
                            type="button"
                            data-testid="image-to-video-cancel"
                            onClick={cancel}
                            className="min-h-9 self-start rounded-md border border-border px-3 text-[11px]"
                        >
                            取消
                        </button>
                    ) : null}
                    <div data-testid="image-to-video-result" data-status={cell.status} className="min-w-0">
                        <ToolResult
                            task={task}
                            toolId={toolId}
                            title="视频结果"
                            onCancel={cancel}
                            onRetry={task && !running ? () => void submit() : undefined}
                        />
                    </div>
                </div>
            </div>

            <section className="space-y-2 rounded-lg border border-border p-3" data-testid="image-to-video-history">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-medium">历史任务</h2>
                    <span className="text-[11px] text-muted-foreground">点击「查看结果」把历史任务放回上方结果区；不会重新提交、不重复消耗</span>
                </div>
                <ToolTaskHistory
                    toolId={toolId}
                    emptyHint="还没有图转视频任务：提交一次后这里会出现真实任务记录（刷新后仍在）"
                    selectWithoutResult
                    onSelectTask={(historyTask) => {
                        setTask(historyTask);
                        setRunError(undefined);
                        void restoreFromTask(historyTask);
                    }}
                />
            </section>

            <section className="space-y-2 rounded-lg border border-border p-3" data-testid="image-to-video-cases">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-medium">优秀案例·做同款</h2>
                    <span className="text-[11px] text-muted-foreground">
                        {IMAGE_TO_VIDEO_CASES.length} 条来自 LinkFox 原站 /image/make-case/list 的真实案例；点「做同款」会把原图入库并回填原站脚本与规格
                    </span>
                </div>
                <ToolCases
                    cases={IMAGE_TO_VIDEO_CASES}
                    applyingId={applyingCaseId}
                    onApply={(item) => void applyCase(item)}
                    emptyHint="暂无优秀案例"
                />
            </section>
        </div>
    );
}
