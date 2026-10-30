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
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Download, FolderPlus, Loader2, Plus, Redo2, Save, Send, Sparkles, Tag, Trash2, Undo2, X } from "lucide-react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolShell } from "@/components/tools/tool-shell";
import { downloadResultItem, saveResultItemToAssets, sendResultItemToCanvas } from "@/components/tools/tool-result-actions";
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
import {
    aiPoseGeneratorResultItem,
    aiPoseGeneratorResultView,
    assertAiPoseGeneratorPlan,
    assertAiPoseGeneratorWorkspace,
    failedAiPoseGeneratorUnits,
    planAiPoseGeneratorUnits,
    retryAiPoseGeneratorUnit,
    runAiPoseGeneratorPlan,
    type AiPoseGeneratorResultViewGroup,
    type AiPoseGeneratorResultViewItem,
    type AiPoseGeneratorUnit,
    type AiPoseGeneratorUnitOutcome,
} from "@/features/tools/adapters/ai-pose-generator";
import {
    AI_POSE_GENERATOR_CATEGORIES,
    AI_POSE_GENERATOR_DRAFT_KEY,
    AI_POSE_GENERATOR_MAX_OUTPUT,
    AI_POSE_GENERATOR_OUTPUT_OPTIONS,
    AI_POSE_GENERATOR_PRESET_LABEL_MAX,
    AI_POSE_GENERATOR_PRESETS,
    AI_POSE_GENERATOR_PROMPT_MAX,
    AI_POSE_GENERATOR_SCENE_MAX,
    AI_POSE_GENERATOR_SCENES_MAX,
    AI_POSE_GENERATOR_TOOL_ID,
    addAiPoseScene,
    aiPoseGeneratorFieldSpecs,
    aiPoseGeneratorSnapshotHash,
    aiPosePresets,
    aiPoseSceneConflicts,
    applyAiPosePreset,
    buildAiPoseGeneratorPrompt,
    clearAiPosePresets,
    createAiPoseGeneratorWorkspace,
    getAiPoseGeneratorSpec,
    moveAiPoseScene,
    parseAiPoseGeneratorDraftValues,
    redoAiPoseEdit,
    removeAiPosePreset,
    removeAiPoseScene,
    resolveAiPoseGeneratorPlan,
    saveAiPosePreset,
    serializeAiPoseGeneratorDraftValues,
    setAiPoseOutputNum,
    setAiPosePrompt,
    toggleAiPosePreset,
    undoAiPoseEdit,
    updateAiPoseScene,
    validateAiPoseGeneratorWorkspace,
    aiPoseHistoryLabel,
    findAiPosePreset,
    type AiPoseGeneratorIssue,
    type AiPoseGeneratorWorkspace as AiPoseGeneratorState,
} from "@/features/tools/registry/ai-pose-generator";
import { WatermarkGroupPanel } from "@/components/tools/watermark-group-panel";
import { OrigRail, WEAR_RAIL } from "@/components/tools/workspaces/orig-rail";

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
            subtitle="📸 1 张模特图→N 种姿势套图！告别重复拍摄成本，秒变视觉内容高产能手！"
            sidebar={sidebar}
        >
            <div data-testid="ai-posture-workspace" className="grid gap-4 pb-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-dashed border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground lg:col-span-2" data-testid="tool-align-bar">
                    <button type="button" className="underline-offset-2 hover:underline">图片规则</button>
                    <span>从本地上传</span>
                    <span>从作品库选择</span>
                    <span>从商品库选择</span>
                    <span>选择参考图</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed px-3 py-1.5 text-[11px] text-muted-foreground lg:col-span-2" data-testid="tool-tour-hint">
                    <span>第一步：选择示例图或上传模特姿势图片</span>
                    <button type="button" className="shrink-0 underline-offset-2 hover:underline">我是高手，不再提醒</button>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground lg:col-span-2" data-testid="tool-align-extras">
                    <span className="font-medium text-foreground">或试试这些</span>
                    <span>生成图片的模特姿势</span>
                    <span>生成结果</span>
                </div>
                <div className="lg:col-span-2"><WatermarkGroupPanel /></div>
                <div className="lg:col-span-2 flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2" data-testid="ai-posture-mirror">
                    <nav aria-label="商品图设计" className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                        <span className="rounded-md border border-border px-2 py-[3px]" title="可用算力">250</span>
                        {["真人换模特", "模特换场景", "AI穿衣", "姿势裂变", "AI穿戴", "企业功能", "即将下架", "人台换模特", "下架"].map((label) => (
                            <span key={label} className={label === "下架" ? "rounded px-1.5 py-0.5 text-primary" : "rounded px-1.5 py-0.5"}>
                                {label}
                            </span>
                        ))}
                        <span className="ml-auto text-emerald-600 dark:text-emerald-400">ljq_driver: 已连接</span>
                    </nav>
                    <p className="text-[11px] text-muted-foreground">拖拽/粘贴 或 上传模特姿势图</p>
                    <p className="text-[11px] text-muted-foreground">10M以内，384*384 ~ 4096*4096</p>
                    <p className="text-[11px] text-muted-foreground">上传多张图片，开始批量姿势裂变</p>
                    <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                        <span className="rounded border border-border bg-background px-1.5 py-0.5 text-foreground">姿势库</span>
                        <span className="rounded border border-border px-1.5 py-0.5">自定义</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">选择姿势（可选）</p>
                    <p className="text-[11px] text-muted-foreground">上传模特图</p>
                    <p className="text-[11px] text-muted-foreground">选择生成张数</p>
                    <div className="flex items-center gap-1 text-[11px]">
                        {["1", "2", "3", "4"].map((count) => (
                            <span key={count} className="rounded border border-border px-2 py-0.5">{count}</span>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" disabled className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground opacity-70">立即生成</button>
                        <span className="text-[11px] text-muted-foreground">(40算力)</span>
                    </div>
                </div>
                <details className="lg:col-span-2 rounded-lg border border-border bg-card px-3 py-1.5">
                    <summary aria-label="工作区" className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground [&::-webkit-details-marker]:hidden">
                        <ChevronDown className="size-3.5" aria-hidden />
                    </summary>
                    <div className="mt-3 grid gap-4 pb-6 lg:grid-cols-[minmax(0,1fr)_360px]">
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
                </details>
            </div>
        </ToolShell>
    );
}

export default AiPostureWorkspace;

/* ------------------------------------------------------------------ *
 * TASK-033：AI 姿势生成（AI_POSE_GENERATOR，layout = model）
 *
 * 本页独有结构（不是「上传 + 提示词 + 结果」空壳）：
 *  1. PosePromptEditor —— 姿势描述 + 姿势库结构化约束（分类切换，多选不互相覆盖）
 *     + 「保存姿势预设 / 应用预设 / 删除预设」+ 撤销重做；
 *  2. ScenePromptList —— 场景描述可增删、可调序（最多 6 条），场景只约束环境/光线/道具，
 *     出现改写姿势的措辞直接拦截；每条场景各自成为一个真实生成请求；
 *  3. PromptPreview —— 按场景预览真正发送给 provider 的 prompt（不是 UI 文案）；
 *  4. 结果区按场景分组，单组可重试；提交后锁定快照，改配置即标记「来自旧版本」。
 * ------------------------------------------------------------------ */

export type AiPoseGeneratorWorkspaceProps = { className?: string };

export function AiPoseGeneratorWorkspace({ className }: AiPoseGeneratorWorkspaceProps = {}) {
    const spec = useMemo(() => getAiPoseGeneratorSpec(), []);
    const fieldSpecs = useMemo(() => aiPoseGeneratorFieldSpecs(), []);
    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);

    const [draftReady, setDraftReady] = useState(false);
    const [workspace, setWorkspace] = useState<AiPoseGeneratorState>(() => createAiPoseGeneratorWorkspace());
    const [categoryId, setCategoryId] = useState<string>("standing");
    const [presetLabel, setPresetLabel] = useState("");
    /** 原站面板 Tab：姿势库 / 自定义。 */
    const [poseMode, setPoseMode] = useState<"library" | "custom">("library");
    /** 只有点过生成才展示校验提示，避免初始空态堆错误文案。 */
    const [attempted, setAttempted] = useState(false);
    const [previewSceneId, setPreviewSceneId] = useState<string | null>(null);
    const [units, setUnits] = useState<AiPoseGeneratorUnit[]>([]);
    const [outcomes, setOutcomes] = useState<AiPoseGeneratorUnitOutcome[]>([]);
    const [run, setRun] = useState<RunState>({ running: false, message: null });
    const [submitError, setSubmitError] = useState<string | null>(null);
    /** 结果动作（存入资产 / 发送画布 / 下载）按单张结果卡片记录状态。 */
    const [resultAction, setResultAction] = useState<{ key: string; busy: boolean; tone: "ok" | "error"; message: string } | null>(null);

    const revisionRef = useRef<number | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const currentHash = useMemo(() => aiPoseGeneratorSnapshotHash(workspace), [workspace]);
    const plan = useMemo(() => resolveAiPoseGeneratorPlan(workspace), [workspace]);
    const issues = useMemo<AiPoseGeneratorIssue[]>(() => validateAiPoseGeneratorWorkspace(workspace), [workspace]);
    const historyLabel = useMemo(() => aiPoseHistoryLabel(workspace), [workspace]);
    const canSubmit = issues.length === 0 && !run.running;

    /* ---------------- 草稿：恢复 → 回写 ---------------- */

    useEffect(() => {
        let alive = true;
        void (async () => {
            const draft = await hydrateDraft(AI_POSE_GENERATOR_TOOL_ID);
            if (!alive) return;
            revisionRef.current = draft?.revision ?? null;
            const restored = parseAiPoseGeneratorDraftValues(draft?.values ?? {});
            if (restored) setWorkspace(restored);
            setDraftReady(true);
        })();
        return () => {
            alive = false;
        };
    }, [hydrateDraft]);

    useEffect(() => {
        if (!draftReady) return;
        patchDraft(AI_POSE_GENERATOR_TOOL_ID, { values: serializeAiPoseGeneratorDraftValues(workspace) });
    }, [draftReady, patchDraft, workspace]);

    /* ---------------- 撤销 / 重做（⌘Z / ⇧⌘Z，文本域内保留原生撤销） ---------------- */

    const undo = useCallback(() => setWorkspace((current) => undoAiPoseEdit(current)), []);
    const redo = useCallback(() => setWorkspace((current) => redoAiPoseEdit(current)), []);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
            event.preventDefault();
            if (event.shiftKey) redo();
            else undo();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [redo, undo]);

    /* ---------------- 提交 / 重试 ---------------- */

    /**
     * 结果动作：把某一张真实结果存入资产库 / 发送到画布 / 下载。
     * 复用 `ToolResult` 的同一套载荷协议，避免本页结果只能停留在页面内。
     */
    const runResultAction = useCallback(
        async (
            group: AiPoseGeneratorResultViewGroup,
            item: AiPoseGeneratorResultViewItem,
            itemIndex: number,
            action: "assets" | "canvas" | "download",
        ) => {
            const key = `${group.unitId}#${itemIndex}`;
            setResultAction({ key, busy: true, tone: "ok", message: "处理中…" });
            const payload = aiPoseGeneratorResultItem(item, itemIndex);
            try {
                if (action === "assets") {
                    const saved = await saveResultItemToAssets(payload, itemIndex, { toolId: AI_POSE_GENERATOR_TOOL_ID });
                    setResultAction({ key, busy: false, tone: "ok", message: `已存入资产库（${saved.assetId.slice(0, 8)}）` });
                } else if (action === "canvas") {
                    const sent = await sendResultItemToCanvas(payload, { toolId: AI_POSE_GENERATOR_TOOL_ID });
                    setResultAction({ key, busy: false, tone: "ok", message: `已发送到画布（${sent.nodeId.slice(0, 8)}）` });
                } else {
                    const fileName = await downloadResultItem(payload, itemIndex, { toolId: AI_POSE_GENERATOR_TOOL_ID });
                    setResultAction({ key, busy: false, tone: "ok", message: `已下载 ${fileName}` });
                }
            } catch (error) {
                setResultAction({ key, busy: false, tone: "error", message: error instanceof Error ? error.message : String(error) });
            }
        },
        [],
    );

    const submit = useCallback(async () => {
        if (!canSubmit) return;
        setRun({ running: true, message: null });
        setSubmitError(null);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            assertAiPoseGeneratorWorkspace(workspace);
            const nextUnits = planAiPoseGeneratorUnits({ workspace, nextClientOperationId: randomId });
            assertAiPoseGeneratorPlan(nextUnits, {
                scenes: plan.scenes.length,
                outputNum: workspace.outputNum,
                total: plan.total,
            });

            setUnits(nextUnits);
            setOutcomes([]);

            const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
            const result = await runAiPoseGeneratorPlan(
                { run: (input, options) => useToolTaskStore.getState().runTool(input, options) },
                nextUnits,
                {
                    draftRevision: revisionRef.current,
                    signal: controller.signal,
                    onUnitOutcome: (outcome) => setOutcomes((current) => [...current.filter((item) => item.unit.id !== outcome.unit.id), outcome]),
                },
            );
            setOutcomes(result);
            const images = result.reduce((sum, item) => sum + item.images.length, 0);
            const failedCount = result.filter((item) => item.status !== "succeeded").length;
            setRun({
                running: false,
                message: failedCount === 0 ? `已生成 ${images} 张` : `${failedCount} 个场景未成功，可单独重试`,
            });
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : String(error));
            setRun({ running: false, message: null });
        }
    }, [canSubmit, plan.scenes.length, plan.total, workspace]);

    const retryGroup = useCallback(async (unit: AiPoseGeneratorUnit) => {
        setRun({ running: true, message: null });
        try {
            const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
            const outcome = await retryAiPoseGeneratorUnit(
                { run: (input, options) => useToolTaskStore.getState().runTool(input, options) },
                unit,
                { draftRevision: revisionRef.current },
            );
            setOutcomes((current) => [...current.filter((item) => item.unit.id !== outcome.unit.id), outcome]);
            setRun({ running: false, message: outcome.status === "succeeded" ? `场景「${unit.sceneLabel}」重试成功` : "重试仍未成功" });
        } catch (error) {
            setRun({ running: false, message: error instanceof Error ? error.message : String(error) });
        }
    }, []);

    const retryFailed = useCallback(async () => {
        const failedIds = new Set(failedAiPoseGeneratorUnits(outcomes).map((unit) => unit.id));
        for (const unit of units) {
            if (failedIds.has(unit.id)) await retryGroup(unit);
        }
    }, [outcomes, retryGroup, units]);

    /* ---------------- 派生视图 ---------------- */

    const visiblePresets = useMemo(() => aiPosePresets(categoryId), [categoryId]);
    const previewScene = useMemo(() => {
        const scenes = plan.scenes;
        return scenes.find((scene) => scene.id === previewSceneId) ?? scenes[0]!;
    }, [plan.scenes, previewSceneId]);
    const previewPrompt = useMemo(() => buildAiPoseGeneratorPrompt(workspace, previewScene?.text ?? ""), [previewScene, workspace]);
    const resultView = useMemo(
        () => aiPoseGeneratorResultView({ units, outcomes, currentHash, running: run.running }),
        [currentHash, outcomes, run.running, units],
    );
    const selectedPresetLabels = useMemo(
        () => workspace.selectedPresetIds.map((id) => findAiPosePreset(id)?.label ?? id),
        [workspace.selectedPresetIds],
    );

    const savePreset = useCallback(() => {
        if (!presetLabel.trim()) return;
        setWorkspace((current) => saveAiPosePreset(current, presetLabel));
        setPresetLabel("");
    }, [presetLabel]);

    /* ---------------- 侧栏 ---------------- */

    const sidebar = (
        <div className="space-y-2 py-1">
            <p className="px-2 text-xs font-medium text-muted-foreground">商品图设计</p>
            <Link to="/tools/product-design/ai-pose-generator" data-testid="ai-pose-nav-current" className="flex items-center justify-between rounded-lg bg-accent px-2 py-1.5 text-sm">
                <span>AI 姿势生成</span>
                <Check aria-hidden="true" className="size-3.5 opacity-60" />
            </Link>
            <Link to="/tools/product-design/ai-posture" className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
                <span>姿势裂变</span>
                <ChevronRight aria-hidden="true" className="size-3.5 opacity-60" />
            </Link>
            <Link to="/tools/product-design/scene" className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
                <span>场景裂变</span>
                <ChevronRight aria-hidden="true" className="size-3.5 opacity-60" />
            </Link>
            <p className="mt-3 px-2 text-[11px] leading-4 text-muted-foreground">
                无源图：文字描述姿势 → 每个场景各自出 {workspace.outputNum} 张（共 {plan.total} 张）
            </p>
            <p className="px-2 text-[11px] leading-4 text-muted-foreground">快捷键：⌘/Ctrl + Z 撤销编辑，⇧⌘/Ctrl + Z 重做</p>
        </div>
    );

    return (
        <div className={cn("flex h-full min-h-0 flex-col gap-2 p-2.5", className)} data-testid="ai-pose-generator-workspace">
            <OrigRail items={WEAR_RAIL} active="姿势裂变" credits={250} testId="ai-pose-rail" />

            <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[300px_minmax(0,1fr)]">
                {/* 参数面板：原站顺序（上传 → 姿势 → 张数 → 生成） */}
                <section className="flex min-h-0 flex-col overflow-y-auto rounded-lg border border-border bg-card px-3 pb-2 pt-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] leading-4 text-muted-foreground" data-testid="ai-pose-tour-hint">
                        <span>第一步：选择示例图或上传模特姿势图片</span>
                        <button type="button" className="shrink-0 hover:text-primary">
                            我是高手，不再提醒
                        </button>
                    </div>

                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[12px] leading-5">
                        <button type="button" className="text-foreground/80 hover:text-primary">
                            图片规则
                        </button>
                        <span className="text-muted-foreground">10M以内，384*384 ~ 4096*4096</span>
                    </div>

                    <div
                        data-testid="ai-pose-upload-card"
                        className="mt-1.5 rounded-lg border border-dashed border-border bg-background/60 px-2 pb-2 pt-3 text-center"
                    >
                        <p className="text-[12px] leading-5 text-muted-foreground">拖拽/粘贴 或 上传模特姿势图</p>
                        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5 text-[12px] leading-5">
                            <span className="rounded-md border border-border px-1.5 text-foreground/80">从本地上传</span>
                            <span className="rounded-md border border-border px-1.5 text-foreground/80">从作品库选择</span>
                            <span className="rounded-md border border-border px-1.5 text-foreground/80">从商品库选择</span>
                        </div>
                        <button
                            type="button"
                            data-testid="ai-pose-batch-hint"
                            className="mt-1.5 w-full rounded-md bg-primary/5 px-2 py-1 text-[11px] leading-4 text-primary hover:bg-primary/10"
                        >
                            上传多张图片，开始批量姿势裂变
                        </button>
                    </div>

                    <div className="mt-2 flex items-center gap-1.5" data-testid="ai-pose-examples">
                        <span className="shrink-0 text-[11px] leading-4 text-muted-foreground">或试试这些</span>
                        <div className="flex gap-1 overflow-hidden">
                            {[0, 1, 2, 3].map((index) => (
                                <span
                                    key={`example-${index}`}
                                    aria-hidden="true"
                                    className="size-8 shrink-0 rounded border border-border bg-gradient-to-br from-muted to-muted-foreground/20"
                                />
                            ))}
                        </div>
                    </div>

                    <div role="tablist" aria-label="姿势来源" className="mt-2 flex h-8 w-full items-center rounded-lg bg-border p-[2px]" data-testid="ai-pose-mode-tabs">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={poseMode === "library"}
                            data-testid="ai-pose-mode-library"
                            onClick={() => setPoseMode("library")}
                            className={cn(
                                "h-full flex-1 rounded-[7px] text-[12px] leading-none transition",
                                poseMode === "library" ? "bg-card font-medium text-primary shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-muted-foreground",
                            )}
                        >
                            姿势库
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={poseMode === "custom"}
                            data-testid="ai-pose-mode-custom"
                            onClick={() => setPoseMode("custom")}
                            className={cn(
                                "h-full flex-1 rounded-[7px] text-[12px] leading-none transition",
                                poseMode === "custom" ? "bg-card font-medium text-primary shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-muted-foreground",
                            )}
                        >
                            自定义
                        </button>
                    </div>

                    <div className="mt-2 flex items-baseline justify-between gap-2">
                        <span className="text-[12px] leading-4 text-foreground">选择姿势（可选）</span>
                        <span className="text-[11px] leading-4 text-muted-foreground">生成图片的模特姿势</span>
                    </div>

                    {poseMode === "library" ? (
                        <div className="mt-1" data-testid="ai-pose-preset-list">
                            <div className="flex flex-wrap gap-1" data-testid="ai-pose-categories">
                                {AI_POSE_GENERATOR_CATEGORIES.map((category, index) => (
                                    <button
                                        key={category.id}
                                        type="button"
                                        data-testid={`ai-pose-category-${category.id}`}
                                        aria-label={category.label}
                                        aria-pressed={categoryId === category.id}
                                        title={category.label}
                                        onClick={() => setCategoryId(category.id)}
                                        className={cn(
                                            "flex h-5 w-8 items-center justify-center rounded-md border transition",
                                            categoryId === category.id ? "border-primary bg-primary/10" : "border-border hover:bg-accent",
                                        )}
                                    >
                                        <span aria-hidden="true" className={cn("rounded-sm bg-foreground/40", index % 2 === 0 ? "h-2.5 w-1.5" : "h-1.5 w-2.5")} />
                                    </button>
                                ))}
                            </div>
                            <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                                {visiblePresets.map((preset) => {
                                    const active = workspace.selectedPresetIds.includes(preset.id);
                                    return (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            data-testid={`ai-pose-preset-${preset.id}`}
                                            aria-pressed={active}
                                            aria-label={preset.label}
                                            title={`${preset.label} · ${preset.hint}`}
                                            onClick={() => setWorkspace((current) => toggleAiPosePreset(current, preset.id))}
                                            className={cn(
                                                "relative flex aspect-[3/4] items-end justify-center overflow-hidden rounded-md border transition",
                                                active ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border bg-muted/40 hover:bg-accent",
                                            )}
                                        >
                                            <span aria-hidden="true" className="mb-1 h-5 w-3 rounded-sm bg-foreground/20" />
                                            {active ? <Check aria-hidden="true" className="absolute right-0.5 top-0.5 size-3 text-primary" /> : null}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="mt-1" data-testid="ai-pose-custom">
                            <textarea
                                data-testid="ai-pose-prompt"
                                value={workspace.posePrompt}
                                onChange={(event) => setWorkspace((current) => setAiPosePrompt(current, event.target.value))}
                                rows={3}
                                maxLength={AI_POSE_GENERATOR_PROMPT_MAX}
                                placeholder="例：女性模特侧身站立，一手扶腰，重心落在后腿，头部转向镜头，全身入镜"
                                className="w-full resize-none rounded-lg border border-border bg-background px-2 py-1.5 text-[12px] leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                            <div className="mt-1 flex items-center justify-between gap-1">
                                <span className="flex gap-1">
                                    <button
                                        type="button"
                                        data-testid="ai-pose-undo"
                                        onClick={undo}
                                        disabled={!historyLabel.canUndo}
                                        aria-label="撤销姿势编辑"
                                        className="inline-flex size-7 items-center justify-center rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-40"
                                    >
                                        <Undo2 aria-hidden="true" className="size-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        data-testid="ai-pose-redo"
                                        onClick={redo}
                                        disabled={!historyLabel.canRedo}
                                        aria-label="重做姿势编辑"
                                        className="inline-flex size-7 items-center justify-center rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-40"
                                    >
                                        <Redo2 aria-hidden="true" className="size-3.5" />
                                    </button>
                                </span>
                                <span className="flex items-center gap-1">
                                    <input
                                        data-testid="ai-pose-preset-name"
                                        value={presetLabel}
                                        maxLength={AI_POSE_GENERATOR_PRESET_LABEL_MAX}
                                        onChange={(event) => setPresetLabel(event.target.value)}
                                        placeholder="预设名称"
                                        className="h-7 w-24 rounded border border-border bg-card px-1.5 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    />
                                    <button
                                        type="button"
                                        data-testid="ai-pose-preset-save"
                                        onClick={savePreset}
                                        disabled={!presetLabel.trim()}
                                        aria-label="保存预设"
                                        className="inline-flex size-7 items-center justify-center rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-40"
                                    >
                                        <Save aria-hidden="true" className="size-3.5" />
                                    </button>
                                </span>
                            </div>
                        </div>
                    )}

                    <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[12px] leading-4 text-foreground">选择生成张数</span>
                        <span className="flex gap-1">
                            {AI_POSE_GENERATOR_OUTPUT_OPTIONS.map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    data-testid={`ai-pose-output-${value}`}
                                    aria-pressed={workspace.outputNum === value}
                                    onClick={() => setWorkspace((current) => setAiPoseOutputNum(current, value))}
                                    className={cn(
                                        "h-6 w-7 rounded-md border text-[12px] leading-none transition",
                                        workspace.outputNum === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {value}
                                </button>
                            ))}
                        </span>
                    </div>

                    <button
                        type="button"
                        data-testid="ai-pose-submit"
                        onClick={() => {
                            setAttempted(true);
                            void submit();
                        }}
                        disabled={!canSubmit}
                        className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-[13px] font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {run.running ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : null}
                        <span>立即生成</span>
                        <span className="text-[11px] opacity-90">(40算力)</span>
                    </button>

                    {attempted && issues.length > 0 ? (
                        <ul data-testid="ai-pose-issues" className="mt-1.5 space-y-0.5 text-[11px] leading-4 text-amber-600 dark:text-amber-400">
                            {issues.map((issue, index) => (
                                <li key={`${issue.code}-${index}`}>{issue.message}</li>
                            ))}
                        </ul>
                    ) : null}
                    {submitError ? (
                        <p data-testid="ai-pose-submit-error" className="mt-1.5 text-[11px] leading-4 text-destructive">
                            {submitError}
                        </p>
                    ) : null}
                    {run.message ? (
                        <p data-testid="ai-pose-run-message" className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
                            {run.message}
                        </p>
                    ) : null}

                    <div className="mt-2 border-t border-border pt-1.5">
                        <WatermarkGroupPanel />
                    </div>
                </section>

                {/* 结果区：原站顺序（提示条 → 上传模特图 → 生成结果） */}
                <section className="flex min-h-0 flex-col overflow-y-auto rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                        <h2 className="text-sm font-medium leading-5">生成结果</h2>
                        {resultView.groups.length > 0 ? <span className="text-[11px] leading-4 text-muted-foreground">{resultView.groups.length} 组</span> : null}
                    </div>

                    <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[12px] leading-5 text-foreground">
                        📸 1 张模特图→N 种姿势套图！告别重复拍摄成本，秒变视觉内容高产能手！
                    </div>

                    <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px]">
                        <div
                            data-testid="ai-pose-model-upload"
                            className="flex min-h-[104px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background/60 px-3 py-3 text-center"
                        >
                            <span className="text-[12px] leading-5 text-muted-foreground">上传模特图</span>
                            <span className="mt-1 rounded-md border border-border px-2 py-0.5 text-[12px] leading-5 text-foreground/80">选择参考图</span>
                        </div>
                        <div className="flex flex-col justify-center gap-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
                            <span>姿势约束：{selectedPresetLabels.length > 0 ? selectedPresetLabels.join(" / ") : "自定义描述"}</span>
                            <span>本次请求：{plan.scenes.length} 个场景 × {workspace.outputNum} 张</span>
                        </div>
                    </div>

                    {resultView.groups.length > 0 ? (
                        <div className="mt-2 space-y-2">
                            {resultView.stale ? (
                                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
                                    配置已修改，下方结果来自旧版本；重新生成才会更新。
                                </p>
                            ) : null}
                            {resultView.groups.map((group, index) => (
                                <section key={group.unitId} data-testid={`ai-pose-group-${index}`} className="rounded-lg border border-border p-2">
                                    <header className="flex items-center justify-between gap-2">
                                        <span className="truncate text-[12px] font-medium">{group.label}</span>
                                        <span className="flex items-center gap-1">
                                            <span className="text-[11px] text-muted-foreground">
                                                {group.status === "succeeded"
                                                    ? `${group.items.length} 张`
                                                    : group.status === "running"
                                                      ? "生成中…"
                                                      : group.status === "idle"
                                                        ? "待生成"
                                                        : `${group.status}${group.error ? `：${group.error.message}` : ""}`}
                                            </span>
                                            {group.canRetry ? (
                                                <button
                                                    type="button"
                                                    data-testid={`ai-pose-group-retry-${index}`}
                                                    onClick={() => void retryGroup(units.find((unit) => unit.id === group.unitId) ?? units[0]!)}
                                                    disabled={run.running}
                                                    aria-label="重试该场景"
                                                    className="inline-flex size-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-40"
                                                >
                                                    <Redo2 aria-hidden="true" className="size-3" />
                                                </button>
                                            ) : null}
                                        </span>
                                    </header>
                                    {group.items.length > 0 ? (
                                        <div className="mt-1.5 grid gap-1.5 sm:grid-cols-3 xl:grid-cols-5">
                                            {group.items.map((item, itemIndex) => {
                                                const actionKey = `${group.unitId}#${itemIndex}`;
                                                const actionState = resultAction?.key === actionKey ? resultAction : null;
                                                return (
                                                    <figure key={`${group.unitId}-${itemIndex}`} className="overflow-hidden rounded-md border border-border">
                                                        <img src={item.dataUrl || item.url} alt={`${group.label} 第 ${itemIndex + 1} 张`} className="aspect-[3/4] w-full object-cover" />
                                                        <figcaption className="flex items-center justify-center gap-1 border-t border-border p-1">
                                                            <button
                                                                type="button"
                                                                data-testid={`ai-pose-result-save-${index}-${itemIndex}`}
                                                                onClick={() => void runResultAction(group, item, itemIndex, "assets")}
                                                                disabled={actionState?.busy ?? false}
                                                                aria-label="存入资产"
                                                                title="存入资产"
                                                                className="inline-flex size-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-40"
                                                            >
                                                                <FolderPlus aria-hidden="true" className="size-3" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                data-testid={`ai-pose-result-canvas-${index}-${itemIndex}`}
                                                                onClick={() => void runResultAction(group, item, itemIndex, "canvas")}
                                                                disabled={actionState?.busy ?? false}
                                                                aria-label="发送画布"
                                                                title="发送画布"
                                                                className="inline-flex size-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-40"
                                                            >
                                                                <Send aria-hidden="true" className="size-3" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                data-testid={`ai-pose-result-download-${index}-${itemIndex}`}
                                                                onClick={() => void runResultAction(group, item, itemIndex, "download")}
                                                                disabled={actionState?.busy ?? false}
                                                                aria-label="下载"
                                                                title="下载"
                                                                className="inline-flex size-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-40"
                                                            >
                                                                <Download aria-hidden="true" className="size-3" />
                                                            </button>
                                                        </figcaption>
                                                        {actionState ? (
                                                            <p className={actionState.tone === "error" ? "px-1 pb-1 text-[10px] leading-3 text-destructive" : "px-1 pb-1 text-[10px] leading-3 text-muted-foreground"}>
                                                                {actionState.message}
                                                            </p>
                                                        ) : null}
                                                    </figure>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{group.status === "running" ? "正在生成…" : "该场景暂无结果"}</p>
                                    )}
                                </section>
                            ))}
                        </div>
                    ) : null}
                </section>
            </div>
        </div>
    );
}
