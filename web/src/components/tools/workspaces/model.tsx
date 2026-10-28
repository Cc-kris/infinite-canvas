/**
 * TASK-027：「姿势裂变」AI_POSTURE 工作区（layout = model）。
 *
 * 本页独有结构（不是「上传 + 提示词 + 结果」空壳）：
 *  1. ReferenceModelPicker —— 单张模特图 + 可增删的图片标签；
 *  2. PoseOrCategorySelect —— 姿势库（结构化卡片，按站姿/角度/动态/坐姿分类）↔ 自定义文本，
 *     两条输入各自保存，切 Tab 不互相覆盖；姿势可选，空选时按张数自动裂变；
 *  3. OutputCountControl —— 1–4 张，右侧实时显示「每个姿势分到几张」；
 *  4. 结果区按来源姿势分组，单组可重试；提交后锁定快照，改配置即标记「来自旧版本」。
 *
 * 真实边界：提交走共享 TaskGateway（真实 provider），每个姿势一个请求单元，
 * 失败/空结果不造假成功；部分失败只重试失败组。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight, Loader2, Redo2, Sparkles, Tag, Undo2, X } from "lucide-react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolShell } from "@/components/tools/tool-shell";
import { cn, randomId } from "@/lib/utils";
import type { ToolAssetRecord } from "@/services/api/tools/assets";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";

import {
    aiPostureResultView,
    assertAiPostureWorkspace,
    auditAiPosturePlan,
    failedAiPostureUnits,
    planAiPostureUnits,
    retryAiPostureUnit,
    runAiPosturePlan,
    type AiPostureUnit,
    type AiPostureUnitOutcome,
} from "@/features/tools/adapters/ai-posture";
import {
    AI_POSTURE_DRAFT_KEY,
    AI_POSTURE_OUTPUT_OPTIONS,
    AI_POSTURE_POSE_CATEGORIES,
    AI_POSTURE_TAGS_MAX,
    AI_POSTURE_TOOL_ID,
    AI_POSTURE_UPLOAD_LABEL,
    AI_POSTURE_UPLOAD_LIMITS,
    addAiPostureTag,
    aiPostureFieldSpecs,
    aiPosturePoses,
    aiPostureSnapshotHash,
    applyPoseTags,
    clearAiPosturePoses,
    createAiPostureWorkspace,
    distributePostureOutputs,
    editHistoryLabel,
    getAiPostureSpec,
    parseAiPostureDraftValues,
    redoPostureEdit,
    removeAiPostureTag,
    resolveAiPosturePlan,
    serializeAiPostureDraftValues,
    setAiPostureCategory,
    setAiPostureCustomPose,
    setAiPostureMode,
    setAiPostureOutputNum,
    setAiPosturePrompt,
    setAiPostureSource,
    toggleAiPosturePose,
    undoPostureEdit,
    validateAiPostureWorkspace,
    type AiPostureIssue,
    type AiPostureWorkspace,
} from "@/features/tools/registry/ai-posture";

const MODEL_SLOT_ID = `${AI_POSTURE_TOOL_ID}-model`;
const UPLOAD_CONSTRAINTS = {
    mimeTypes: [...AI_POSTURE_UPLOAD_LIMITS.mimeTypes],
    maxBytes: AI_POSTURE_UPLOAD_LIMITS.maxBytes,
    minSide: AI_POSTURE_UPLOAD_LIMITS.minSide,
    maxSide: AI_POSTURE_UPLOAD_LIMITS.maxSide,
};

type RunState = { running: boolean; message: string | null };

/* ------------------------------------------------------------------ *
 * 小构件
 * ------------------------------------------------------------------ */

function Panel({ id, title, hint, children, action }: { id: string; title: string; hint?: string; children: React.ReactNode; action?: React.ReactNode }) {
    return (
        <section data-testid={id} className="rounded-xl border border-border bg-card p-4">
            <header className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <h2 className="text-sm font-medium">{title}</h2>
                    {hint ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p> : null}
                </div>
                {action}
            </header>
            <div className="mt-3">{children}</div>
        </section>
    );
}

function SegmentedButton({
    active,
    onClick,
    testId,
    children,
}: {
    active: boolean;
    onClick: () => void;
    testId: string;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            data-testid={testId}
            aria-pressed={active}
            onClick={onClick}
            className={cn(
                "inline-flex h-9 min-w-[40px] items-center justify-center rounded-lg border px-3 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-accent",
            )}
        >
            {children}
        </button>
    );
}

/* ------------------------------------------------------------------ *
 * 工作区
 * ------------------------------------------------------------------ */

export type AiPostureWorkspaceProps = { className?: string };

export function AiPostureWorkspace({ className }: AiPostureWorkspaceProps = {}) {
    const spec = useMemo(() => getAiPostureSpec(), []);
    const fieldSpecs = useMemo(() => aiPostureFieldSpecs(), []);
    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);

    const [draftReady, setDraftReady] = useState(false);
    const [workspace, setWorkspace] = useState<AiPostureWorkspace>(() => createAiPostureWorkspace());
    const [modelRecord, setModelRecord] = useState<ToolAssetRecord | null>(null);
    const [tagDraft, setTagDraft] = useState("");
    const [units, setUnits] = useState<AiPostureUnit[]>([]);
    const [outcomes, setOutcomes] = useState<AiPostureUnitOutcome[]>([]);
    const [run, setRun] = useState<RunState>({ running: false, message: null });
    const [submitError, setSubmitError] = useState<string | null>(null);

    const revisionRef = useRef<number | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const currentHash = useMemo(() => aiPostureSnapshotHash(workspace), [workspace]);
    const plan = useMemo(() => resolveAiPosturePlan(workspace), [workspace]);
    const counts = useMemo(() => distributePostureOutputs(workspace.outputNum, plan.poses.length), [plan.poses.length, workspace.outputNum]);

    /* ---------------- 草稿：恢复 → 回写 ---------------- */

    useEffect(() => {
        let alive = true;
        void (async () => {
            const draft = await hydrateDraft(AI_POSTURE_TOOL_ID);
            if (!alive) return;
            revisionRef.current = draft?.revision ?? null;
            const restored = parseAiPostureDraftValues(draft?.values ?? {});
            if (restored) setWorkspace(restored);
            setDraftReady(true);
        })();
        return () => {
            alive = false;
        };
    }, [hydrateDraft]);

    useEffect(() => {
        if (!draftReady) return;
        patchDraft(AI_POSTURE_TOOL_ID, { values: serializeAiPostureDraftValues(workspace) });
    }, [draftReady, patchDraft, workspace]);

    /* ---------------- 源图 ---------------- */

    const handleModelChange = useCallback((_ids: string[], records: ToolAssetRecord[]) => {
        const record = records[0] ?? null;
        setModelRecord(record);
        setWorkspace((current) =>
            setAiPostureSource(
                current,
                record
                    ? {
                          assetId: record.id,
                          name: record.name,
                          url: record.url,
                          width: record.width ?? 0,
                          height: record.height ?? 0,
                      }
                    : null,
            ),
        );
        // 重新上传源文件：旧结果保留在界面上，但会被标记为「来自旧版本」。
        setSubmitError(null);
    }, []);

    /* ---------------- 姿势 / 标签编辑 ---------------- */

    const selectPose = useCallback((poseId: string) => {
        setWorkspace((current) => {
            const next = toggleAiPosturePose(current, poseId);
            if (next.selectedPoseIds.includes(poseId) && !current.selectedPoseIds.includes(poseId)) {
                return applyPoseTags(next, poseId);
            }
            return next;
        });
        setSubmitError(null);
    }, []);

    const submitTag = useCallback(() => {
        if (!tagDraft.trim()) return;
        setWorkspace((current) => addAiPostureTag(current, tagDraft));
        setTagDraft("");
    }, [tagDraft]);

    const undo = useCallback(() => setWorkspace((current) => undoPostureEdit(current)), []);
    const redo = useCallback(() => setWorkspace((current) => redoPostureEdit(current)), []);

    const historyLabel = editHistoryLabel(workspace);

    /* ---------------- 校验 ---------------- */

    const issues = useMemo<AiPostureIssue[]>(() => {
        const list = validateAiPostureWorkspace(workspace, {
            sourceReady: Boolean(modelRecord),
            sourceWidth: modelRecord?.width,
            sourceHeight: modelRecord?.height,
        });
        if (modelRecord && (!modelRecord.width || !modelRecord.height)) {
            // 上传成功但拿不到像素尺寸时，provider 会按原图处理，这里只提示不阻断。
            return list.filter((issue) => issue.code !== "asset-size");
        }
        return list;
    }, [modelRecord, workspace]);

    const canSubmit = Boolean(modelRecord) && issues.length === 0 && !run.running;

    const resultView = useMemo(
        () => aiPostureResultView({ units, outcomes, currentHash, running: run.running }),
        [currentHash, outcomes, run.running, units],
    );

    /* ---------------- 提交 / 重试 ---------------- */

    const buildSource = useCallback(async () => {
        if (!modelRecord) throw new Error("请先上传模特姿势图");
        const { imageToDataUrl } = await import("@/services/image-storage");
        const dataUrl = await imageToDataUrl({ storageKey: modelRecord.storageKey, url: modelRecord.url });
        if (!dataUrl) throw new Error("模特图本地数据已不可用，请重新上传");
        return {
            assetId: modelRecord.id,
            name: modelRecord.name,
            dataUrl,
            originUrl: modelRecord.url,
            width: modelRecord.width ?? 0,
            height: modelRecord.height ?? 0,
        };
    }, [modelRecord]);

    const submit = useCallback(async () => {
        if (!canSubmit) return;
        setRun({ running: true, message: null });
        setSubmitError(null);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            assertAiPostureWorkspace(workspace, {
                sourceReady: Boolean(modelRecord),
                sourceWidth: modelRecord?.width,
                sourceHeight: modelRecord?.height,
            });
            const source = await buildSource();
            const nextUnits = planAiPostureUnits({ workspace, source, nextClientOperationId: randomId });
            const problems = auditAiPosturePlan(nextUnits, workspace.outputNum);
            if (problems.length > 0) throw new Error(problems.join("；"));

            setUnits(nextUnits);
            setOutcomes([]);

            const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
            const result = await runAiPosturePlan(
                { run: (input, options) => useToolTaskStore.getState().runTool(input, options) },
                nextUnits,
                {
                    draftRevision: revisionRef.current,
                    signal: controller.signal,
                    onUnitOutcome: (outcome) => setOutcomes((current) => [...current.filter((item) => item.unit.id !== outcome.unit.id), outcome]),
                },
            );
            setOutcomes(result);
            const failedCount = result.filter((item) => item.status !== "succeeded").length;
            setRun({
                running: false,
                message: failedCount === 0 ? `已生成 ${result.reduce((sum, item) => sum + item.images.length, 0)} 张` : `${failedCount} 个姿势未成功，可单独重试`,
            });
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : String(error));
            setRun({ running: false, message: null });
        }
    }, [buildSource, canSubmit, modelRecord, workspace]);

    const retryGroup = useCallback(
        async (unit: AiPostureUnit) => {
            setRun({ running: true, message: null });
            try {
                const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
                const outcome = await retryAiPostureUnit(
                    { run: (input, options) => useToolTaskStore.getState().runTool(input, options) },
                    unit,
                    { draftRevision: revisionRef.current },
                );
                setOutcomes((current) => [...current.filter((item) => item.unit.id !== outcome.unit.id), outcome]);
                setRun({ running: false, message: outcome.status === "succeeded" ? `姿势「${unit.poseLabel}」重试成功` : "重试仍未成功" });
            } catch (error) {
                setRun({ running: false, message: error instanceof Error ? error.message : String(error) });
            }
        },
        [],
    );

    const retryFailed = useCallback(async () => {
        const unitIds = failedAiPostureUnits(outcomes).map((unit) => unit.id);
        for (const unit of units) {
            if (unitIds.includes(unit.id)) await retryGroup(unit);
        }
    }, [outcomes, retryGroup, units]);

    /* ---------------- 侧栏 ---------------- */

    const sidebar = (
        <div className="space-y-2 py-1">
            <p className="px-2 text-xs font-medium text-muted-foreground">商品图设计</p>
            <Link to="/tools/product-design/ai-posture" data-testid="ai-posture-nav-current" className="flex items-center justify-between rounded-lg bg-accent px-2 py-1.5 text-sm">
                <span>姿势裂变</span>
                <Check aria-hidden="true" className="size-3.5 opacity-60" />
            </Link>
            <Link to="/tools/product-design/ai-pose-generator" className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
                <span>AI 姿势生成</span>
                <ChevronRight aria-hidden="true" className="size-3.5 opacity-60" />
            </Link>
            <Link to="/tools/product-design/scene" className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
                <span>场景裂变</span>
                <ChevronRight aria-hidden="true" className="size-3.5 opacity-60" />
            </Link>
            <p className="mt-3 px-2 text-[11px] leading-4 text-muted-foreground">图片规则：{AI_POSTURE_UPLOAD_LABEL}</p>
            <p className="px-2 text-[11px] leading-4 text-muted-foreground">快捷键：⌘/Ctrl + Z 撤销姿势编辑，⇧⌘/Ctrl + Z 重做</p>
        </div>
    );

    const visiblePoses = aiPosturePoses(workspace.categoryId);

    return (
        <ToolShell
            className={className}
            title={spec?.title ?? "姿势裂变"}
            subtitle="上传 1 张模特图 → 选姿势库或自定义 → 选张数 → 生成，按来源姿势分组出图"
            badges={
                <span data-testid="ai-posture-make-type" className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    makeType {spec?.makeType ?? 58}
                </span>
            }
            sidebar={sidebar}
        >
            <div data-testid="ai-posture-workspace" className="grid gap-4 pb-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0 space-y-4">
                    {/* 1. ReferenceModelPicker */}
                    <Panel
                        id="ai-posture-model-picker"
                        title="模特姿势图"
                        hint="拖拽/粘贴 或 上传模特姿势图；一张图裂变出多种姿势，人物/服装保持一致。"
                        action={
                            <div className="flex shrink-0 gap-1">
                                <button
                                    type="button"
                                    data-testid="ai-posture-undo"
                                    onClick={undo}
                                    disabled={!historyLabel.canUndo}
                                    className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:opacity-40"
                                    aria-label="撤销姿势/标签编辑"
                                >
                                    <Undo2 className="size-4" />
                                </button>
                                <button
                                    type="button"
                                    data-testid="ai-posture-redo"
                                    onClick={redo}
                                    disabled={!historyLabel.canRedo}
                                    className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:opacity-40"
                                    aria-label="重做姿势/标签编辑"
                                >
                                    <Redo2 className="size-4" />
                                </button>
                            </div>
                        }
                    >
                        <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
                            <ToolAssetInput
                                toolId={MODEL_SLOT_ID}
                                title="模特图"
                                maxCount={1}
                                constraints={UPLOAD_CONSTRAINTS}
                                onChange={handleModelChange}
                            />
                            <div className="space-y-2">
                                <div data-testid="ai-posture-tags" className="rounded-lg border border-border bg-background px-3 py-2">
                                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                        <Tag aria-hidden="true" className="size-3" />
                                        图片标签（imageTags，可增删，≤{AI_POSTURE_TAGS_MAX}）
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {workspace.imageTags.length === 0 ? (
                                            <span className="text-xs text-muted-foreground">还没有标签；点选姿势卡片会自动带出建议标签。</span>
                                        ) : (
                                            workspace.imageTags.map((tag, index) => (
                                                <span key={`${tag}-${index}`} data-testid={`ai-posture-tag-${index}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px]">
                                                    {tag}
                                                    <button
                                                        type="button"
                                                        data-testid={`ai-posture-tag-remove-${index}`}
                                                        onClick={() => setWorkspace((current) => removeAiPostureTag(current, index))}
                                                        className="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-accent"
                                                        aria-label={`删除标签 ${tag}`}
                                                    >
                                                        <X className="size-3" />
                                                    </button>
                                                </span>
                                            ))
                                        )}
                                    </div>
                                    <div className="mt-2 flex gap-1.5">
                                        <input
                                            data-testid="ai-posture-tag-input"
                                            value={tagDraft}
                                            onChange={(event) => setTagDraft(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") {
                                                    event.preventDefault();
                                                    submitTag();
                                                }
                                            }}
                                            placeholder="新增标签后回车"
                                            className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        />
                                        <button
                                            type="button"
                                            data-testid="ai-posture-tag-add"
                                            onClick={submitTag}
                                            className="h-9 shrink-0 rounded-lg border border-border px-2.5 text-xs hover:bg-accent"
                                        >
                                            添加
                                        </button>
                                    </div>
                                </div>
                                <p className="text-[11px] leading-4 text-muted-foreground">
                                    {modelRecord ? `已选择：${modelRecord.name}${modelRecord.width ? ` · ${modelRecord.width}×${modelRecord.height}` : ""}` : `图片规则：${AI_POSTURE_UPLOAD_LABEL}`}
                                </p>
                            </div>
                        </div>
                    </Panel>

                    {/* 2. PoseOrCategorySelect */}
                    <Panel
                        id="ai-posture-pose-select"
                        title="姿势库 / 自定义"
                        hint="选择姿势（可选）：不选则按张数自动裂变；姿势库与自定义各自保存，来回切换不会互相覆盖。"
                    >
                        <div className="flex flex-wrap items-center gap-1.5">
                            <SegmentedButton testId="ai-posture-mode-library" active={workspace.mode === "library"} onClick={() => setWorkspace((current) => setAiPostureMode(current, "library"))}>
                                姿势库
                            </SegmentedButton>
                            <SegmentedButton testId="ai-posture-mode-custom" active={workspace.mode === "custom"} onClick={() => setWorkspace((current) => setAiPostureMode(current, "custom"))}>
                                自定义
                            </SegmentedButton>
                            <span className="ml-auto text-[11px] text-muted-foreground" data-testid="ai-posture-mode-readout">
                                {workspace.mode === "library"
                                    ? `已选 ${workspace.selectedPoseIds.length} 个姿势${workspace.selectedPoseIds.length === 0 ? "（将自动裂变）" : ""}`
                                    : `自定义描述 ${workspace.customPose.length} 字`}
                            </span>
                        </div>

                        {workspace.mode === "library" ? (
                            <div className="mt-3 space-y-2">
                                <div className="flex flex-wrap gap-1.5">
                                    <SegmentedButton testId="ai-posture-category-all" active={workspace.categoryId === null} onClick={() => setWorkspace((current) => setAiPostureCategory(current, null))}>
                                        全部
                                    </SegmentedButton>
                                    {AI_POSTURE_POSE_CATEGORIES.map((category) => (
                                        <SegmentedButton
                                            key={category.id}
                                            testId={`ai-posture-category-${category.id}`}
                                            active={workspace.categoryId === category.id}
                                            onClick={() => setWorkspace((current) => setAiPostureCategory(current, category.id))}
                                        >
                                            {category.label}
                                        </SegmentedButton>
                                    ))}
                                </div>
                                <div data-testid="ai-posture-pose-grid" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                    {visiblePoses.map((pose) => {
                                        const selected = workspace.selectedPoseIds.includes(pose.id);
                                        return (
                                            <button
                                                key={pose.id}
                                                type="button"
                                                data-testid={`ai-posture-pose-${pose.id}`}
                                                aria-pressed={selected}
                                                onClick={() => selectPose(pose.id)}
                                                className={cn(
                                                    "min-h-[64px] rounded-lg border p-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                                    selected ? "border-primary bg-accent" : "border-border bg-background hover:bg-accent",
                                                )}
                                            >
                                                <span className="flex items-center justify-between gap-2">
                                                    <span className="text-xs font-medium">{pose.label}</span>
                                                    {selected ? <Check aria-hidden="true" className="size-3.5 text-primary" /> : null}
                                                </span>
                                                <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{pose.instruction}</span>
                                                <span className="mt-1 block text-[11px] text-muted-foreground/80">标签：{pose.tags.join(" / ")}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        data-testid="ai-posture-clear-poses"
                                        onClick={() => setWorkspace((current) => clearAiPosturePoses(current))}
                                        disabled={workspace.selectedPoseIds.length === 0}
                                        className="h-9 rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-40"
                                    >
                                        清空选择（改为自动裂变）
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-3 space-y-2">
                                <textarea
                                    data-testid="ai-posture-custom-input"
                                    value={workspace.customPose}
                                    onChange={(event) => setWorkspace((current) => setAiPostureCustomPose(current, event.target.value))}
                                    rows={4}
                                    placeholder="例如：侧身站立，一只手扶着帽檐，微笑看向镜头"
                                    className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-[22px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                                <p className="text-[11px] leading-4 text-muted-foreground">
                                    自定义模式只发一条姿势指令；切回姿势库后这段文本仍会保留。
                                </p>
                            </div>
                        )}
                    </Panel>

                    {/* 4. 结果区 */}
                    <Panel
                        id="ai-posture-results"
                        title="生成结果"
                        hint="按来源姿势分组；单组失败只重试该组，已成功的姿势不会重复生成。"
                        action={
                            failedAiPostureUnits(outcomes).length > 0 ? (
                                <button
                                    type="button"
                                    data-testid="ai-posture-retry-failed"
                                    onClick={() => void retryFailed()}
                                    disabled={run.running}
                                    className="h-9 shrink-0 rounded-lg border border-border px-2.5 text-xs hover:bg-accent disabled:opacity-40"
                                >
                                    重试失败组（{failedAiPostureUnits(outcomes).length}）
                                </button>
                            ) : null
                        }
                    >
                        {resultView.status === "idle" ? (
                            <div data-testid="ai-posture-result-empty" className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-8 text-center">
                                <Sparkles aria-hidden="true" className="mx-auto size-5 text-muted-foreground" />
                                <p className="mt-2 text-sm">还没有生成结果</p>
                                <p className="mt-1 text-xs text-muted-foreground">📸 1 张模特图 → N 种姿势套图！告别重复拍摄成本。</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <span data-testid="ai-posture-result-status">状态：{resultView.status}</span>
                                    <span>共 {resultView.totalImages} 张 / {resultView.groups.length} 个姿势</span>
                                    {resultView.stale ? (
                                        <span data-testid="ai-posture-result-stale" className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-600 dark:text-amber-400">
                                            来自旧版本（配置已修改）
                                        </span>
                                    ) : null}
                                </div>
                                {resultView.groups.map((group) => (
                                    <section key={group.unitId} data-testid={`ai-posture-result-group-${group.poseId}`} className="rounded-lg border border-border bg-background p-3">
                                        <header className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-xs font-medium">{group.label}</h3>
                                                <span data-testid={`ai-posture-result-group-status-${group.poseId}`} className="text-[11px] text-muted-foreground">
                                                    {group.status === "succeeded"
                                                        ? `成功 ${group.items.length} 张`
                                                        : group.status === "running"
                                                          ? "生成中…"
                                                          : group.status === "idle"
                                                            ? "待生成"
                                                            : `${group.status}${group.error ? `：${group.error.message}` : ""}`}
                                                </span>
                                                {group.stale ? <span className="text-[11px] text-amber-600 dark:text-amber-400">来自旧版本</span> : null}
                                            </div>
                                            {group.canRetry ? (
                                                <button
                                                    type="button"
                                                    data-testid={`ai-posture-group-retry-${group.poseId}`}
                                                    onClick={() => void retryGroup(units.find((unit) => unit.id === group.unitId) ?? units[0]!)}
                                                    disabled={run.running}
                                                    className="h-9 rounded-lg border border-border px-2.5 text-xs hover:bg-accent disabled:opacity-40"
                                                >
                                                    重试该姿势
                                                </button>
                                            ) : null}
                                        </header>
                                        {group.items.length > 0 ? (
                                            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                                {group.items.map((item, index) => (
                                                    <figure key={`${group.unitId}-${index}`} className="overflow-hidden rounded-lg border border-border">
                                                        <img
                                                            src={item.dataUrl || item.url}
                                                            alt={`${group.label} 第 ${index + 1} 张`}
                                                            className="aspect-[3/4] w-full object-cover"
                                                        />
                                                    </figure>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="mt-2 text-[11px] text-muted-foreground">{group.status === "running" ? "正在生成…" : "该姿势暂无结果"}</p>
                                        )}
                                    </section>
                                ))}
                            </div>
                        )}
                    </Panel>
                </div>

                {/* 右栏：OutputCountControl + 提交 */}
                <aside className="space-y-4">
                    <Panel id="ai-posture-output-control" title="选择生成张数" hint="1–4 张，按姿势平均分配；未选姿势时自动从姿势库裂变出互不重复的姿势。">
                        <div className="flex gap-1.5">
                            {AI_POSTURE_OUTPUT_OPTIONS.map((value) => (
                                <SegmentedButton
                                    key={value}
                                    testId={`ai-posture-output-${value}`}
                                    active={workspace.outputNum === value}
                                    onClick={() => setWorkspace((current) => setAiPostureOutputNum(current, value))}
                                >
                                    {value}
                                </SegmentedButton>
                            ))}
                        </div>
                        <dl data-testid="ai-posture-plan-readout" className="mt-3 space-y-1 rounded-lg border border-border bg-background px-2.5 py-2 text-[11px] text-muted-foreground">
                            <div className="flex justify-between gap-2">
                                <dt>裂变方式</dt>
                                <dd data-testid="ai-posture-plan-origin">{plan.origin === "auto" ? "自动裂变" : plan.origin === "custom" ? "自定义姿势" : "姿势库选择"}</dd>
                            </div>
                            <div className="flex justify-between gap-2">
                                <dt>姿势 / 张数</dt>
                                <dd>
                                    {plan.poses.map((pose, index) => (
                                        <span key={pose.id} className="mr-1.5 inline-block">
                                            {pose.label}×{counts[index] ?? 0}
                                        </span>
                                    ))}
                                </dd>
                            </div>
                            <div className="flex justify-between gap-2">
                                <dt>预计输出</dt>
                                <dd data-testid="ai-posture-expected-output">{workspace.outputNum} 张 / {plan.poses.length} 个请求</dd>
                            </div>
                        </dl>
                    </Panel>

                    <Panel id="ai-posture-prompt-panel" title="补充描述" hint="可选：光线、场景、气质等；姿势本身由上面的选择决定。">
                        <textarea
                            data-testid="ai-posture-prompt"
                            value={workspace.prompt}
                            onChange={(event) => setWorkspace((current) => setAiPosturePrompt(current, event.target.value))}
                            rows={3}
                            placeholder="例如：室内柔光，浅灰背景，全身构图"
                            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-[22px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                    </Panel>

                    <div className="rounded-xl border border-border bg-card p-4">
                        <button
                            type="button"
                            data-testid="ai-posture-submit"
                            onClick={() => void submit()}
                            disabled={!canSubmit}
                            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {run.running ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
                            立即生成
                        </button>
                        <p data-testid="ai-posture-submit-hint" className="mt-2 text-center text-[11px] text-muted-foreground">
                            {workspace.outputNum} 张 · {plan.poses.length} 个姿势请求
                        </p>
                        {issues.length > 0 ? (
                            <ul data-testid="ai-posture-issues" className="mt-2 space-y-1 text-xs text-amber-600 dark:text-amber-400">
                                {issues.map((issue) => (
                                    <li key={issue.code}>{issue.message}</li>
                                ))}
                            </ul>
                        ) : null}
                        {submitError ? (
                            <p data-testid="ai-posture-submit-error" className="mt-2 text-xs text-destructive">
                                {submitError}
                            </p>
                        ) : null}
                        {run.message ? (
                            <p data-testid="ai-posture-run-message" className="mt-2 text-xs text-muted-foreground">
                                {run.message}
                            </p>
                        ) : null}
                        <details data-testid="ai-posture-snapshot" className="mt-3 rounded-lg border border-border px-2.5 py-2 text-[11px] text-muted-foreground">
                            <summary className="cursor-pointer select-none">本次输入快照</summary>
                            <dl className="mt-1.5 space-y-0.5">
                                <div className="flex justify-between gap-2">
                                    <dt>草稿键</dt>
                                    <dd className="truncate">{AI_POSTURE_DRAFT_KEY}</dd>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <dt>快照指纹</dt>
                                    <dd data-testid="ai-posture-snapshot-hash">{currentHash}</dd>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <dt>字段</dt>
                                    <dd className="truncate">{fieldSpecs.map((field) => field.key).join(" / ") || "imageTags / imageUrl / outputNum / prompt"}</dd>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <dt>源资产</dt>
                                    <dd className="truncate">{modelRecord?.id ?? "未上传"}</dd>
                                </div>
                            </dl>
                        </details>
                    </div>
                </aside>
            </div>
        </ToolShell>
    );
}

export default AiPostureWorkspace;
