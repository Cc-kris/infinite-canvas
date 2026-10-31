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
import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import { AiVideoFamilyNav } from "./video";
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
        <div data-testid="image-to-video-workspace" data-make-type={IMAGE_TO_VIDEO_MAKE_TYPE} className={cn("flex flex-col gap-4", className)}>
        <AiVideoFamilyNav active="图转视频" />
            {lostAssets.length ? (
                <p data-testid="image-to-video-lost" className="rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    有 {lostAssets.length} 个上次的素材已失效（{lostAssets.join("、")}），请重新上传。
                </p>
            ) : null}

            <ToolWorkspaceColumns
                className="min-h-0 flex-1"
                config={
                    <>
                    <section className="space-y-2 rounded-lg border border-border bg-card p-3" data-testid="image-to-video-upload">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-medium">图片规则</h3>
                            <button
                                type="button"
                                data-testid="image-to-video-analyze"
                                disabled={disabledField || !values.productInfo.trim()}
                                title={values.productInfo.trim() ? "按商品信息做本地分析" : "先在「商品信息」里填写卖点再分析"}
                                onClick={() => update({ productAnalyzed: true })}
                                className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground disabled:opacity-50"
                            >
                                分析
                            </button>
                        </div>
                        <ToolAssetInput
                            toolId={toolId}
                            draftSlot="reference-images"
                            variant="linkfox"
                            wide
                            uploadLabel="本地上传"
                            maxCount={IMAGE_TO_VIDEO_UPLOAD.maxCount}
                            disabled={disabledField}
                            onChange={onReferenceChange}
                            hint={`支持上传${IMAGE_TO_VIDEO_UPLOAD.maxCount}张图，10M以内，384*384 ~ 4096*4096，宽高比（宽÷高）0.4～2.5（含边界）`}
                        />
                        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                            <span className="flex items-center justify-between">
                                <span>商品信息（选填）</span>
                                <span className="tabular-nums text-[11px] text-muted-foreground">
                                    {values.productInfo.length} / {IMAGE_TO_VIDEO_PRODUCT_INFO_LIMIT}
                                </span>
                            </span>
                            <textarea
                                data-testid="image-to-video-product-info"
                                rows={3}
                                value={values.productInfo}
                                maxLength={IMAGE_TO_VIDEO_PRODUCT_INFO_LIMIT}
                                disabled={disabledField}
                                onChange={(event) => update({ productInfo: event.target.value, productAnalyzed: false })}
                                placeholder="填写商品卖点、目标人群、使用场景，帮助模型理解要展示什么"
                                className="rounded-md border border-border bg-background px-2 py-1 text-[12px] text-foreground"
                            />
                        </label>
                    </section>

                    <section className="space-y-2 rounded-lg border border-border bg-card p-3" data-testid="image-to-video-type">
                        <h3 className="text-xs font-medium">
                            视频类型 <span className="text-destructive">*</span>
                            <span className="ml-1 text-[11px] font-normal text-muted-foreground">（必填项）</span>
                        </h3>
                        <div role="tablist" aria-label="描述方式" className="flex gap-1">
                            {([
                                { mode: "template" as const, label: "视频模板" },
                                { mode: "custom" as const, label: "自定义描述" },
                            ]).map((item) => (
                                <button
                                    key={item.mode}
                                    type="button"
                                    role="tab"
                                    aria-selected={values.promptMode === item.mode}
                                    disabled={disabledField}
                                    onClick={() => update({ promptMode: item.mode })}
                                    className={cn(
                                        "rounded border px-2 py-1 text-[11px]",
                                        values.promptMode === item.mode
                                            ? "border-primary bg-primary/10 text-foreground"
                                            : "border-border text-muted-foreground",
                                    )}
                                >
                                    {item.label}
                                </button>
                            ))}
                            <span
                                className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-[10px] text-muted-foreground"
                                title="模板由原站脚本生成，选择模板后仍可补充描述"
                            >
                                ?
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {IMAGE_TO_VIDEO_VIDEO_TYPES.map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    disabled={disabledField}
                                    onClick={() =>
                                        update({
                                            videoType: item.key,
                                            templateKey: item.templateKey,
                                            templateName: item.templateName,
                                            duration: item.defaultDuration as ImageToVideoValues["duration"],
                                        })
                                    }
                                    className={cn(
                                        "rounded border px-2 py-1 text-[11px]",
                                        values.videoType === item.key
                                            ? "border-primary bg-primary/10 text-foreground"
                                            : "border-border text-muted-foreground",
                                    )}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                            <span className="flex items-center justify-between">
                                <span>{values.promptMode === "custom" ? "自定义描述" : "视频模板"}</span>
                                <span className="tabular-nums">{values.prompt.length} / {IMAGE_TO_VIDEO_PROMPT_LIMIT}</span>
                            </span>
                            <textarea
                                data-testid="image-to-video-prompt"
                                value={values.prompt}
                                disabled={disabledField}
                                rows={3}
                                maxLength={IMAGE_TO_VIDEO_PROMPT_LIMIT}
                                placeholder={values.promptMode === "custom" ? "描述画面、动作、镜头与节奏" : template.templatePrompt}
                                onChange={(event) => update({ prompt: event.target.value })}
                                className="rounded-md border border-border bg-background px-2 py-1 text-[12px] text-foreground"
                            />
                        </label>
                        <p className="text-[10px] text-muted-foreground">当前模板：{template.templateName}</p>
                    </section>

                    <section className="space-y-2 rounded-lg border border-border bg-card p-3" data-testid="image-to-video-settings">
                        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                            <span>视频模型</span>
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
                        <div className="grid gap-1">
                            {(() => {
                                const h3 = videoModels.find((name) => /minimax/i.test(name) && /h3/i.test(name));
                                return (
                                    <button
                                        type="button"
                                        data-testid="image-to-video-model-tier"
                                        disabled={disabledField || !h3}
                                        title={h3 ? "MiniMax H3" : "本地通道未提供 MiniMax H3"}
                                        onClick={() => h3 && update({ modelId: h3 })}
                                        className={cn(
                                            "flex flex-col items-start rounded-md border px-2 py-1 text-left",
                                            h3 && values.modelId === h3 ? "border-primary bg-primary/5" : "border-border",
                                            !h3 && "opacity-50",
                                        )}
                                    >
                                        <span className="text-[12px] text-foreground">MiniMax H3</span>
                                        <span className="text-[10px] text-muted-foreground">适合批量测款与日常上新</span>
                                    </button>
                                );
                            })()}
                        </div>

                        <div className="space-y-1">
                            <h3 className="text-[11px] font-medium text-foreground">视频分辨率</h3>
                            <div className="flex gap-1">
                                {IMAGE_TO_VIDEO_RESOLUTIONS.map((item) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        data-testid={`image-to-video-resolution-${item.key}`}
                                        disabled={disabledField}
                                        onClick={() => update({ resolution: item.key })}
                                        className={cn(
                                            "rounded border px-2 py-1 text-[11px]",
                                            values.resolution === item.key
                                                ? "border-primary bg-primary/10 text-foreground"
                                                : "border-border text-muted-foreground",
                                        )}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2 border-t border-border/60 pt-2">
                            <h3 className="text-[11px] font-medium text-foreground">生成设置</h3>
                            <div className="space-y-1">
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                    <span>视频时长</span>
                                    <span data-testid="image-to-video-duration-value" className="text-foreground">{values.duration}秒</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground">拖动选择时长</p>
                                <input
                                    type="range"
                                    data-testid="image-to-video-duration"
                                    min={5}
                                    max={15}
                                    step={5}
                                    value={values.duration}
                                    disabled={disabledField}
                                    onChange={(event) => update({ duration: Number(event.target.value) as ImageToVideoValues["duration"] })}
                                    className="w-full"
                                />
                                <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
                                    {IMAGE_TO_VIDEO_DURATIONS.map((seconds) => (
                                        <span key={seconds}>{seconds}</span>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <h4 className="text-[11px] text-muted-foreground">视频比例</h4>
                                <div className="flex flex-wrap gap-1">
                                    {IMAGE_TO_VIDEO_RATIOS.map((item) => (
                                        <button
                                            key={item.key}
                                            type="button"
                                            disabled={disabledField}
                                            onClick={() => update({ aspectRatio: item.key })}
                                            className={cn(
                                                "rounded border px-2 py-1 text-[11px]",
                                                values.aspectRatio === item.key
                                                    ? "border-primary bg-primary/10 text-foreground"
                                                    : "border-border text-muted-foreground",
                                            )}
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                                    <span>销售国家/地区</span>
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
                                    <span>目标语言</span>
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
                        </div>

                        <button
                            type="button"
                            data-testid="image-to-video-submit"
                            disabled={blocked}
                            onClick={() => void submit()}
                            className="min-h-11 w-full rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
                        >
                            {running ? "生成中…" : "立即生成"}
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
                    </section>
                    </>
                }
            >
                <section className="flex min-w-0 flex-col gap-4" aria-label="结果区">
                    <div data-testid="image-to-video-result" data-status={cell.status} className="min-w-0">
                        <ToolResult
                            task={task}
                            toolId={toolId}
                            title="结果"
                            emptyTitle="动态展示商品，点击率大大提升"
                            now={Date.now()}
                            onCancel={cancel}
                            onRetry={task && !running ? () => void submit() : undefined}
                        />
                    </div>
                </section>
            </ToolWorkspaceColumns>
        </div>
    );
}
