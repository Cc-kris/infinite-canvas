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
import { Design19Results } from "@/components/tools/design19-frame";
import { GUIDE_WRAP_CLASS, VF_DURATION_BOX, VF_GRAY_CARD, VF_INPUT_BOX, VF_LABEL, VF_SEGMENTED, VF_SELECT, VF_SUBMIT, VF_TEXT_AREA, VF_TEXT_BOX, VF_TOOLBAR, VfDurationStops, VfRatioGrid, vfSegmentItem } from "@/components/tools/workspaces/video";
import { IMAGE_TO_VIDEO_EMPTY_IMAGE } from "@/features/tools/tool-cases-data";
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
    IMAGE_TO_VIDEO_PRODUCT_URL_LIMIT,
    IMAGE_TO_VIDEO_RATIO_BY_KEY,
    IMAGE_TO_VIDEO_RATIOS,
    IMAGE_TO_VIDEO_RESOLUTION_BY_KEY,
    IMAGE_TO_VIDEO_RESOLUTIONS,
    IMAGE_TO_VIDEO_SOURCE_MODE_BY_KEY,
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
    const [helpOpen, setHelpOpen] = useState(false);
    const [applyingCaseId, setApplyingCaseId] = useState<string | null>(null);
    const [resultTab, setResultTab] = useState<"result" | "case" | "history">("result");
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
                if (role === "first") {
                    setFirstFrame(undefined);
                    update({ firstFrameAssetId: "" });
                } else {
                    setLastFrame(undefined);
                    update({ lastFrameAssetId: "" });
                }
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
    const disabledField = running || restoring;
    const framesOn = mode === "frames";
    const promptPlaceholder = values.promptMode === "custom" ? "描述画面、动作、镜头与节奏" : videoTypeOf(values.videoType).templatePrompt;
    const notice = linkNotice || caseNotice;
    const referenceInput = (
        <ToolAssetInput
            toolId={toolId}
            draftSlot="reference-images"
            variant="linkfox"
            wide
            uploadLabel="本地上传"
            dropLabel="上传参考素材"
            maxCount={IMAGE_TO_VIDEO_UPLOAD.maxCount}
            disabled={disabledField}
            onChange={onReferenceChange}
            syncIds={values.referenceAssetIds}
            hint={`支持上传${IMAGE_TO_VIDEO_UPLOAD.maxCount}张图，10M以内，384*384 ~ 4096*4096，宽高比（宽÷高）0.4～2.5（含边界）`}
        />
    );

    return (
        <div data-testid="image-to-video-workspace" data-make-type={IMAGE_TO_VIDEO_MAKE_TYPE} className={cn("flex h-full min-h-0 flex-col gap-4", className)}>
            {lostAssets.length ? (
                <p data-testid="image-to-video-lost" className="rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    有 {lostAssets.length} 个上次的素材已失效（{lostAssets.join("、")}），请重新上传。
                </p>
            ) : null}

            <ToolWorkspaceColumns
                className="min-h-0 flex-1"
                config={
                    <div className="flex h-full min-h-0 flex-col">
                    <div data-testid="i2v-config-scroll" className="min-h-0 flex-1 space-y-[14px] overflow-y-auto pr-1">
                    {/* 原站顶部「普通模式 / 高级模式」分段：透传既有 isPro 字段（进快照与 fields），不虚构模型能力差异。 */}
                    <div className="flex h-9 gap-[2px] rounded-[8px] border border-[#e4e5ee] bg-[#f4f4f8] p-[3px]" role="tablist" aria-label="模式品质">
                        {([
                            { value: false, label: "普通模式" },
                            { value: true, label: "高级模式" },
                        ]).map((item) => (
                            <button
                                key={item.label}
                                type="button"
                                role="tab"
                                data-testid={`image-to-video-pro-${item.value ? "on" : "off"}`}
                                aria-selected={values.isPro === item.value}
                                disabled={disabledField}
                                title={item.value ? "任务按 isPro=true 提交，是否生效以模型/通道实际能力为准" : "普通模式，isPro=false"}
                                onClick={() => update({ isPro: item.value })}
                                className={cn("flex-1 rounded-[5px] text-[14px] font-semibold", values.isPro === item.value ? "bg-white text-[#723cf9]" : "text-[#625c6d]")}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>

                    <section className="space-y-2" data-testid="image-to-video-upload">
                        {/* 素材来源三模式：首尾帧是右上角开关；关闭时「商品链接」与「手动上传参考素材」并列——填了链接即商品链接模式，否则参考素材模式。
                            切换只改 values.sourceMode，各模式草稿独立保留，提交只按当前模式校验（registry validateImageToVideoState）。 */}
                        <div className="flex items-center justify-between" data-testid="image-to-video-source-mode" data-mode={mode}>
                            <span className={VF_LABEL}>{framesOn ? "首尾帧" : "参考素材"}</span>
                            <label className="flex items-center gap-2 text-[12px] text-[#625c6d]">
                                首尾帧
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={framesOn}
                                    data-testid="image-to-video-mode-frames"
                                    disabled={disabledField}
                                    title={IMAGE_TO_VIDEO_SOURCE_MODE_BY_KEY.frames.hint}
                                    onClick={() => update({ sourceMode: framesOn ? (values.productUrl.trim() ? "product-link" : "reference") : "frames" })}
                                    className={cn("relative h-4 w-7 rounded-full transition-colors disabled:opacity-50", framesOn ? "bg-[#723cf9]" : "bg-[#c9c6d0]")}
                                >
                                    <span className={cn("absolute top-0.5 size-3 rounded-full bg-white transition-all", framesOn ? "left-[14px]" : "left-0.5")} />
                                </button>
                            </label>
                        </div>

                        {framesOn ? (
                            <div className={cn(VF_GRAY_CARD, "grid grid-cols-2 gap-2 space-y-0")}>
                                <div className="space-y-1" data-testid="image-to-video-first-frame">
                                    <h3 className="text-[12px] font-medium text-[#25212d]">
                                        首帧 <span className="text-[#fa5151]">*</span>
                                    </h3>
                                    <ToolAssetInput
                                        toolId={toolId}
                                        draftSlot="first-frame"
                                        variant="linkfox"
                                        wide
                                        compact
                                        uploadLabel="上传首帧"
                                        maxCount={1}
                                        disabled={disabledField}
                                        onChange={(_ids, records) => onFrameChange("first", records)}
                                        syncIds={values.firstFrameAssetId ? [values.firstFrameAssetId] : []}
                                        hint="视频从这张图开始"
                                    />
                                </div>
                                <div className="space-y-1" data-testid="image-to-video-last-frame">
                                    <h3 className="text-[12px] font-medium text-[#25212d]">尾帧（选填）</h3>
                                    <ToolAssetInput
                                        toolId={toolId}
                                        draftSlot="last-frame"
                                        variant="linkfox"
                                        wide
                                        compact
                                        uploadLabel="上传尾帧"
                                        maxCount={1}
                                        disabled={disabledField}
                                        onChange={(_ids, records) => onFrameChange("last", records)}
                                        syncIds={values.lastFrameAssetId ? [values.lastFrameAssetId] : []}
                                        hint="视频在该图结束"
                                    />
                                </div>
                                <p className="col-span-2 text-[11px] leading-4 text-black/45">首帧必填、尾帧可选；两帧进入同一次请求，参考图列表保留在草稿但不发送。</p>
                            </div>
                        ) : (
                            <div className={VF_GRAY_CARD}>
                                <span className="text-[12px] font-medium text-[#25212d]">商品链接</span>
                                <div className={VF_INPUT_BOX} data-testid="image-to-video-mode-product-link" data-active={mode === "product-link" ? "true" : "false"}>
                                    <input
                                        data-testid="image-to-video-product-url"
                                        type="url"
                                        value={values.productUrl}
                                        disabled={disabledField}
                                        maxLength={IMAGE_TO_VIDEO_PRODUCT_URL_LIMIT}
                                        onChange={(event) => update({ productUrl: event.target.value, sourceMode: event.target.value.trim() ? "product-link" : "reference" })}
                                        placeholder="粘贴 TikTok Shop / 亚马逊商品链接"
                                        title="本页不解析商品数据，链接按原样进入任务并校验格式；商品链接模式仍需至少 1 张参考图"
                                        className="h-full min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-black/30"
                                    />
                                    <span className="shrink-0 text-[12px] text-[#723cf9]/50" title="本地未接入商品链接解析">分析</span>
                                </div>
                                <p className="flex items-center gap-2 text-[11px] leading-4 text-black/45 before:h-px before:flex-1 before:bg-black/10 after:h-px after:flex-1 after:bg-black/10">或 手动上传参考素材</p>
                                {referenceInput}
                            </div>
                        )}
                    </section>

                    <section className="space-y-2">
                        <h3 className={VF_LABEL}>
                            商品信息<span className="font-normal text-[#939599]">（选填）</span>
                        </h3>
                        <div className={VF_TEXT_BOX}>
                            <textarea
                                data-testid="image-to-video-product-info"
                                rows={3}
                                value={values.productInfo}
                                maxLength={IMAGE_TO_VIDEO_PRODUCT_INFO_LIMIT}
                                disabled={disabledField}
                                onChange={(event) => update({ productInfo: event.target.value, productAnalyzed: false })}
                                placeholder="上传商品图后点击 AI 分析，自动识别商品信息；也可以手动填写补充。"
                                className={cn(VF_TEXT_AREA, "min-h-[72px]")}
                            />
                            <div className={VF_TOOLBAR}>
                                <button
                                    type="button"
                                    data-testid="image-to-video-analyze"
                                    disabled={disabledField || !values.productInfo.trim()}
                                    title={values.productInfo.trim() ? "按商品信息做本地分析" : "先在「商品信息」里填写卖点再分析"}
                                    onClick={() => update({ productAnalyzed: true })}
                                    className="text-[12px] font-semibold text-[#723cf9] disabled:text-[#b8bcc6]"
                                >
                                    AI 分析
                                </button>
                                <span className="tabular-nums">{values.productInfo.length} / {IMAGE_TO_VIDEO_PRODUCT_INFO_LIMIT}</span>
                            </div>
                        </div>
                    </section>

                    <section className="space-y-2" data-testid="image-to-video-type">
                        <div className="flex items-center justify-between">
                            <h3 className={VF_LABEL}>
                                视频描述 <span className="text-[#fa5151]">*</span>
                                <span className="font-normal text-[#939599]">（必填项）</span>
                            </h3>
                            {/* 「怎么写描述？」：真实帮助说明，不做跳转假链接。 */}
                            <button
                                type="button"
                                data-testid="image-to-video-prompt-help"
                                aria-expanded={helpOpen}
                                onClick={() => setHelpOpen((previous) => !previous)}
                                className="text-[12px] font-semibold text-[#1677ff]"
                            >
                                怎么写描述？
                            </button>
                        </div>
                        {helpOpen ? (
                            <div data-testid="image-to-video-help-panel" className="space-y-1 rounded-[8px] bg-[#f7f7f7] p-2 text-[11px] leading-4 text-black/55">
                                <p>视频模板：选择类型后自动套用对应运镜骨架，可再补充商品细节；提示词为空时按模板骨架生成。</p>
                                <p>自定义描述：写清画面主体、动作、镜头运动、光线与节奏，长度 1～{IMAGE_TO_VIDEO_PROMPT_LIMIT} 字；模板模式下为空也能提交。</p>
                                <p>开启「提示词优化」后，任务会携带优化标志并附上运镜节奏优化要求，由模型按能力执行，本页不做本地改写。</p>
                            </div>
                        ) : null}
                        <div className={VF_TEXT_BOX}>
                            <div className="flex flex-wrap gap-1 px-[9px] pt-[9px]" role="tablist" aria-label="视频类型">
                                {IMAGE_TO_VIDEO_VIDEO_TYPES.map((item) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        role="tab"
                                        aria-selected={values.promptMode === "template" && values.videoType === item.key}
                                        disabled={disabledField}
                                        onClick={() =>
                                            update({
                                                promptMode: "template",
                                                videoType: item.key,
                                                templateKey: item.templateKey,
                                                templateName: item.templateName,
                                                duration: item.defaultDuration as ImageToVideoValues["duration"],
                                            })
                                        }
                                        className={cn(
                                            "h-6 rounded-full border px-2.5 text-[12px] font-semibold",
                                            values.promptMode === "template" && values.videoType === item.key ? "border-[#723cf9]/40 bg-[#f3edff] text-[#723cf9]" : "border-[#e4e5ee] bg-white text-black/65",
                                        )}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    role="tab"
                                    data-testid="image-to-video-prompt-mode-custom"
                                    aria-selected={values.promptMode === "custom"}
                                    disabled={disabledField}
                                    onClick={() => update({ promptMode: "custom" })}
                                    className={cn(
                                        "h-6 rounded-full border px-2.5 text-[12px] font-semibold",
                                        values.promptMode === "custom" ? "border-[#723cf9]/40 bg-[#f3edff] text-[#723cf9]" : "border-[#e4e5ee] bg-white text-black/65",
                                    )}
                                >
                                    自定义
                                </button>
                            </div>
                            <textarea
                                data-testid="image-to-video-prompt"
                                value={values.prompt}
                                disabled={disabledField}
                                rows={5}
                                maxLength={IMAGE_TO_VIDEO_PROMPT_LIMIT}
                                placeholder={promptPlaceholder}
                                onChange={(event) => update({ prompt: event.target.value })}
                                className={cn(VF_TEXT_AREA, "min-h-[108px]")}
                            />
                            <div className={VF_TOOLBAR}>
                                <button
                                    type="button"
                                    data-testid="image-to-video-prompt-optimizer"
                                    aria-pressed={values.promptOptimizer}
                                    disabled={disabledField}
                                    title="开启后随任务提交优化标志，由模型按能力执行"
                                    onClick={() => update({ promptOptimizer: !values.promptOptimizer })}
                                    className={cn("h-6 rounded-[4px] px-2 text-[12px] font-semibold", values.promptOptimizer ? "bg-[#f3edff] text-[#723cf9]" : "bg-[#f1f2f5] text-[#b8bcc6]")}
                                >
                                    提示词优化
                                </button>
                                <span className="tabular-nums">{values.prompt.length} / {IMAGE_TO_VIDEO_PROMPT_LIMIT}</span>
                            </div>
                        </div>
                    </section>

                    <section className="space-y-2" data-testid="image-to-video-settings">
                        <label className="block space-y-2">
                            <span className={cn(VF_LABEL, "block")}>视频模型</span>
                            <select
                                data-testid="image-to-video-model"
                                value={values.modelId}
                                disabled={disabledField}
                                onChange={(event) => update({ modelId: event.target.value })}
                                className={VF_SELECT}
                            >
                                <option value="">跟随默认模型{config.videoModel ? `（${config.videoModel}）` : ""}</option>
                                {videoModels.map((name) => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                        </label>
                    </section>

                    <section className="space-y-2" data-testid="image-to-video-resolution">
                        <h3 className={VF_LABEL}>视频分辨率</h3>
                        <div className={VF_SEGMENTED} role="radiogroup" aria-label="视频分辨率">
                            {IMAGE_TO_VIDEO_RESOLUTIONS.map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    role="radio"
                                    aria-checked={values.resolution === item.key}
                                    data-testid={`image-to-video-resolution-${item.key}`}
                                    disabled={disabledField}
                                    onClick={() => update({ resolution: item.key })}
                                    className={vfSegmentItem(values.resolution === item.key)}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="space-y-2">
                        <h3 className={VF_LABEL}>生成设置</h3>
                        <p className="text-[11px] font-medium text-[#77717f]">视频时长</p>
                        <div className={VF_DURATION_BOX}>
                            <div className="flex items-center justify-between text-[12px] text-[#6e6878]">
                                <span>拖动选择时长</span>
                                <strong data-testid="image-to-video-duration-value" className="font-semibold text-[#723cf9]">{values.duration}秒</strong>
                            </div>
                            <input
                                type="range"
                                data-testid="image-to-video-duration"
                                min={5}
                                max={15}
                                step={5}
                                value={values.duration}
                                disabled={disabledField}
                                onChange={(event) => update({ duration: Number(event.target.value) as ImageToVideoValues["duration"] })}
                                className="w-full accent-[#723cf9]"
                            />
                            <VfDurationStops values={IMAGE_TO_VIDEO_DURATIONS} value={values.duration} disabled={disabledField} onChange={(duration) => update({ duration })} />
                        </div>
                        <p data-testid="image-to-video-hint" className="text-[11px] text-black/45">
                            预计产出 {capability.expected}；来源模式「{IMAGE_TO_VIDEO_SOURCE_MODE_BY_KEY[mode].label}」
                        </p>
                        <div className="space-y-2" data-testid="image-to-video-ratio">
                            <p className="text-[11px] font-medium text-[#77717f]">视频比例</p>
                            <VfRatioGrid options={IMAGE_TO_VIDEO_RATIOS.map((item) => ({ value: item.key, label: item.label }))} value={values.aspectRatio} disabled={disabledField} onChange={(aspectRatio) => update({ aspectRatio })} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <label className="space-y-2">
                                <span className="block text-[11px] font-medium text-[#77717f]">销售国家/地区</span>
                                <select data-testid="image-to-video-country" value={values.saleCountry} disabled={disabledField} onChange={(event) => update({ saleCountry: event.target.value })} className={VF_SELECT}>
                                    {IMAGE_TO_VIDEO_COUNTRIES.map((item) => (
                                        <option key={item.key} value={item.key}>{item.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="space-y-2">
                                <span className="block text-[11px] font-medium text-[#77717f]">目标语言</span>
                                <select data-testid="image-to-video-language" value={values.language} disabled={disabledField} onChange={(event) => update({ language: event.target.value })} className={VF_SELECT}>
                                    {IMAGE_TO_VIDEO_LANGUAGES.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                    </section>
                    </div>
                    <div data-testid="i2v-submit-bar" className="shrink-0 space-y-2 bg-white pb-1 pt-2">
                    <button
                        type="button"
                        data-testid="image-to-video-submit"
                        disabled={blocked}
                        onClick={() => void submit()}
                        className={cn(VF_SUBMIT, "flex items-center justify-center gap-2")}
                    >
                        {running ? "生成中…" : "立即生成"}
                        <span className="text-[12px] font-medium text-white/60">{capability.expected}</span>
                    </button>
                    {(capability.blockers.length > 0 || issues.warnings.length > 0 || capability.notices.length > 0 || runError || notice) ? (
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
                            {notice ? <li className="text-muted-foreground">{notice}</li> : null}
                        </ul>
                    ) : null}
                    </div>
                    </div>
                }
            >
                <Design19Results
                    tabs={[
                        { id: "result", label: "生成结果" },
                        { id: "case", label: "优秀案例" },
                    ]}
                    active={resultTab}
                    onTabChange={(id) => setResultTab(id as typeof resultTab)}
                    extraTab={{ id: "history", label: "历史记录" }}
                    className="min-w-0"
                >
                    {resultTab === "result" ? (
                        <div data-testid="image-to-video-result" data-status={cell.status} className="min-h-full min-w-0">
                            {task ? (
                                <div className="px-1 py-3">
                                    <ToolResult
                                        task={task}
                                        toolId={toolId}
                                        title="结果"
                                        now={Date.now()}
                                        onCancel={cancel}
                                        onRetry={!running ? () => void submit() : undefined}
                                    />
                                </div>
                            ) : (
                                /* 原站空态：白卡（850×590、圆角 12）+ 示例插画 + 16px 灰字说明 */
                                <div className={GUIDE_WRAP_CLASS} data-testid="image-to-video-empty">
                                    <div className="flex w-full max-w-[850px] flex-col items-center rounded-[12px] bg-white px-10 pb-5 pt-[17px]">
                                        <img src={IMAGE_TO_VIDEO_EMPTY_IMAGE} alt="动态展示商品" className="aspect-[770/510] w-full max-w-[770px] object-contain" draggable={false} />
                                        <span className="mt-5 text-[16px] leading-[25px] text-[#939599]">动态展示商品，点击率大大提升</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : resultTab === "case" ? (
                        <div className="px-1 py-3" data-testid="image-to-video-cases">
                            <ToolCases cases={IMAGE_TO_VIDEO_CASES} applyingId={applyingCaseId} onApply={(item) => applyCase(item).then(() => setResultTab("result"))} />
                        </div>
                    ) : (
                        <div className="px-1 py-3" data-testid="image-to-video-history">
                            <ToolTaskHistory
                                toolId={IMAGE_TO_VIDEO_TOOL_ID}
                                limit={8}
                                emptyHint="还没有图转视频任务记录"
                                onSelectTask={(historyTask) => {
                                    setTask(historyTask);
                                    setResultTab("result");
                                    void restoreFromTask(historyTask);
                                }}
                            />
                        </div>
                    )}
                </Design19Results>
            </ToolWorkspaceColumns>
        </div>
    );
}
