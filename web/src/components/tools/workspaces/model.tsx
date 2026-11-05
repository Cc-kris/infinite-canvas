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
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Download, FolderPlus, Loader2, PersonStanding, Plus, Redo2, Save, Send, Sparkles, Tag, Trash2, Undo2, X } from "lucide-react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolHistoryDock } from "@/components/tools/tool-history-dock";
import { ToolShell } from "@/components/tools/tool-shell";
import { downloadResultItem, saveResultItemToAssets, sendResultItemToCanvas } from "@/components/tools/tool-result-actions";
import { cn, randomId } from "@/lib/utils";
import type { ToolAssetRecord } from "@/services/api/tools/assets";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";

import {
    aiPostureResultItem,
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
import { OrigRail, WEAR_RAIL } from "@/components/tools/workspaces/orig-rail";
import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";

const MODEL_SLOT_ID = `${AI_POSTURE_TOOL_ID}-model`;
const UPLOAD_CONSTRAINTS = {
    mimeTypes: [...AI_POSTURE_UPLOAD_LIMITS.mimeTypes],
    maxBytes: AI_POSTURE_UPLOAD_LIMITS.maxBytes,
    minSide: AI_POSTURE_UPLOAD_LIMITS.minSide,
    maxSide: AI_POSTURE_UPLOAD_LIMITS.maxSide,
};

/** 原站上传卡下方「或试试这些」的两张示例构图；点击后写入补充描述（真实影响 prompt 字段）。 */
const POSTURE_EXAMPLES = ["完整上身图", "全身模特图"];
const POSTURE_EXAMPLE_HINTS: Record<string, string> = {
    "完整上身图": "完整上身构图，人物居中，背景干净",
    "全身模特图": "全身构图，人物从头到脚完整入镜",
};

type RunState = { running: boolean; message: string | null };

/* ------------------------------------------------------------------ *
 * 小构件
 * ------------------------------------------------------------------ */

/** 原站配置栏里的 Tab / 分类 / 张数都是 22–26px 小字块，不用 36px 大按钮撑高配置列。 */
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
                "inline-flex h-7 min-w-[30px] items-center justify-center rounded-[4px] border px-2 text-[12px] leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-foreground/30",
            )}
        >
            {children}
        </button>
    );
}

/* ------------------------------------------------------------------ *
 * 图片规则弹窗（原站点「图片规则」后弹出）
 * ------------------------------------------------------------------ */

function PostureRulesDialog({ open, onClose, onTry }: { open: boolean; onClose: () => void; onTry: (label: string) => void }) {
    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="图片规则"
            data-testid="ai-posture-rules-dialog"
            onClick={onClose}
        >
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-medium">图片规则</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="关闭图片规则"
                        className="grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent"
                    >
                        <X className="size-4" />
                    </button>
                </div>
                <p className="mt-3 text-xs leading-5 text-foreground">请按规则上传模特姿势图，以达到最佳效果</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">支持jpg、jpeg、png、webp，10M以内，图片边长范围：384 ~ 4096，最大宽高比5</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                    {POSTURE_EXAMPLES.map((label) => (
                        <div key={label} className="rounded-lg border border-border p-2">
                            <div className="grid h-16 place-items-center rounded-md bg-muted text-[11px] text-muted-foreground">{label}</div>
                            <button
                                type="button"
                                data-testid={`ai-posture-rule-sample-${label}`}
                                onClick={() => onTry(label)}
                                className="mt-2 h-7 w-full rounded-md border border-border text-xs text-muted-foreground transition hover:bg-accent"
                            >
                                试一试
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
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
    /** 「图片规则」弹窗（原站点击图片规则后弹出的上传规则说明）。 */
    const [rulesOpen, setRulesOpen] = useState(false);
    /** 结果区页签：生成结果 / 历史记录（原站两个页签）。 */
    const [resultTab, setResultTab] = useState<"results" | "history">("results");
    /** 「或试试这些」当前示例构图。 */
    const [exampleLabel, setExampleLabel] = useState<string | null>(null);
    /** 「上传多张图片，开始批量姿势裂变」：批量模式暂未开放，按钮禁用并在下方说明原因。 */
    /** 结果动作（存入资产 / 发送画布 / 下载）按单张结果卡片记录状态。 */
    const [resultAction, setResultAction] = useState<{ key: string; busy: boolean; tone: "ok" | "error"; message: string } | null>(null);

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

    // 侧栏承诺的快捷键真实生效：⌘/Ctrl + Z 撤销，⇧⌘/Ctrl + Z 重做；文本域内保留原生撤销。
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

    /** 「一键做同款」：把当前结果的姿势回填到姿势库并切回该姿势，方便直接再生成一套。 */
    const applySameStyle = useCallback(() => {
        const poseId = resultView.groups[0]?.poseId;
        setWorkspace((current) => {
            const cleared = clearAiPosturePoses(current);
            const withLibrary = setAiPostureMode(cleared, "library");
            return poseId ? toggleAiPosturePose(withLibrary, poseId) : withLibrary;
        });
        setResultTab("results");
    }, [resultView.groups]);

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

    /* ---------------- 结果动作（存入资产 / 发送画布 / 下载） ---------------- */

    const runResultAction = useCallback(
        async (
            unitId: string,
            poseLabel: string,
            item: { url?: string; dataUrl?: string },
            itemIndex: number,
            action: "assets" | "canvas" | "download",
        ) => {
            const key = `${unitId}#${itemIndex}`;
            setResultAction({ key, busy: true, tone: "ok", message: "处理中…" });
            const payload = aiPostureResultItem({ poseId: unitId, poseLabel, url: item.url, dataUrl: item.dataUrl }, itemIndex);
            try {
                if (action === "assets") {
                    const saved = await saveResultItemToAssets(payload, itemIndex, { toolId: AI_POSTURE_TOOL_ID });
                    setResultAction({ key, busy: false, tone: "ok", message: `已存入资产库（${saved.assetId.slice(0, 8)}）` });
                } else if (action === "canvas") {
                    const sent = await sendResultItemToCanvas(payload, { toolId: AI_POSTURE_TOOL_ID });
                    setResultAction({ key, busy: false, tone: "ok", message: `已发送到画布（${sent.nodeId.slice(0, 8)}）` });
                } else {
                    const fileName = await downloadResultItem(payload, itemIndex, { toolId: AI_POSTURE_TOOL_ID });
                    setResultAction({ key, busy: false, tone: "ok", message: `已下载 ${fileName}` });
                }
            } catch (error) {
                setResultAction({ key, busy: false, tone: "error", message: error instanceof Error ? error.message : String(error) });
            }
        },
        [],
    );

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
            <Link to="/tools/product-design/product-scene" className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
                <span>场景裂变</span>
                <ChevronRight aria-hidden="true" className="size-3.5 opacity-60" />
            </Link>
            <p className="mt-3 px-2 text-[11px] leading-4 text-muted-foreground">图片规则：{AI_POSTURE_UPLOAD_LABEL}</p>
            <p className="px-2 text-[11px] leading-4 text-muted-foreground">快捷键：⌘/Ctrl + Z 撤销姿势编辑，⇧⌘/Ctrl + Z 重做</p>
        </div>
    );

    const visiblePoses = aiPosturePoses(workspace.categoryId);
    /** 折叠态行卡的摘要：原站「选择姿势（可选）/ 生成图片的模特姿势」，选中后显示已选姿势名。 */
    const poseSummary =
        workspace.mode === "custom"
            ? `自定义姿势${workspace.customPose.trim() ? `：${workspace.customPose.trim().slice(0, 18)}` : ""}`
            : workspace.selectedPoseIds.length > 0
              ? `已选：${plan.poses.map((pose) => pose.label).join(" / ")}`
              : "生成图片的模特姿势（不选则自动裂变）";

    return (
        <ToolShell
            className="h-full min-h-0"
            title={spec?.title ?? "姿势裂变"}
            subtitle="📸 1 张模特图→N 种姿势套图！告别重复拍摄成本，秒变视觉内容高产能手！"
            sidebar={sidebar}
        >
            <div data-testid="ai-posture-workspace" className="flex h-full min-h-0 min-w-0 flex-col">
                <ToolWorkspaceColumns
                    configSide="left"
                    className="min-h-0 flex-1 overflow-hidden"
                    config={
                        <div className="flex h-full min-h-0 flex-col">
                            <div data-testid="ai-posture-form" className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 pb-3 pt-3">
                                {/* 1. 模特姿势图：压缩为原站式上传卡（compact）+ 单行标签 + 示例 + 批量入口（仍明确禁用） */}
                                <section data-testid="ai-posture-model-picker" className="space-y-2 rounded-[8px] border border-border/70 p-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[12px] leading-5">模特姿势图</span>
                                        <span className="flex shrink-0 items-center gap-1">
                                            <button
                                                type="button"
                                                data-testid="ai-posture-image-rules"
                                                onClick={() => setRulesOpen(true)}
                                                className="h-6 shrink-0 rounded border border-border px-1.5 text-[11px] leading-none text-muted-foreground hover:bg-accent"
                                            >
                                                图片规则
                                            </button>
                                            <button
                                                type="button"
                                                data-testid="ai-posture-undo"
                                                onClick={undo}
                                                disabled={!historyLabel.canUndo}
                                                className="inline-flex size-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-40"
                                                aria-label="撤销姿势/标签编辑"
                                            >
                                                <Undo2 className="size-3" />
                                            </button>
                                            <button
                                                type="button"
                                                data-testid="ai-posture-redo"
                                                onClick={redo}
                                                disabled={!historyLabel.canRedo}
                                                className="inline-flex size-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-40"
                                                aria-label="重做姿势/标签编辑"
                                            >
                                                <Redo2 className="size-3" />
                                            </button>
                                        </span>
                                    </div>
                                    <ToolAssetInput
                                        toolId={MODEL_SLOT_ID}
                                        variant="linkfox"
                                        wide
                                        compact
                                        maxCount={1}
                                        constraints={UPLOAD_CONSTRAINTS}
                                        dropLabel="拖拽/粘贴 或 上传模特姿势图"
                                        hint="10M以内，384*384 ~ 4096*4096"
                                        onChange={handleModelChange}
                                    />
                                    <div data-testid="ai-posture-tags" className="rounded-[6px] border border-border/70 px-2 py-1.5">
                                        <p className="flex items-center gap-1 text-[11px] leading-4 text-muted-foreground">
                                            <Tag aria-hidden="true" className="size-3" />
                                            图片标签（可增删，≤{AI_POSTURE_TAGS_MAX}）
                                        </p>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            {workspace.imageTags.length === 0 ? (
                                                <span className="text-[11px] leading-4 text-muted-foreground">点选姿势会自动带出建议标签。</span>
                                            ) : (
                                                workspace.imageTags.map((tag, index) => (
                                                    <span key={`${tag}-${index}`} data-testid={`ai-posture-tag-${index}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-1.5 text-[11px] leading-4">
                                                        {tag}
                                                        <button
                                                            type="button"
                                                            data-testid={`ai-posture-tag-remove-${index}`}
                                                            onClick={() => setWorkspace((current) => removeAiPostureTag(current, index))}
                                                            className="grid size-3.5 place-items-center rounded-full text-muted-foreground hover:bg-accent"
                                                            aria-label={`删除标签 ${tag}`}
                                                        >
                                                            <X className="size-2.5" />
                                                        </button>
                                                    </span>
                                                ))
                                            )}
                                        </div>
                                        <div className="mt-1 flex gap-1">
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
                                                className="h-7 min-w-0 flex-1 rounded border border-border bg-card px-1.5 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            />
                                            <button
                                                type="button"
                                                data-testid="ai-posture-tag-add"
                                                onClick={submitTag}
                                                className="h-7 shrink-0 rounded border border-border px-2 text-[11px] text-muted-foreground hover:bg-accent"
                                            >
                                                添加
                                            </button>
                                        </div>
                                    </div>
                                    {modelRecord ? (
                                        <p className="truncate text-[11px] leading-4 text-muted-foreground">
                                            已选择：{modelRecord.name}
                                            {modelRecord.width ? ` · ${modelRecord.width}×${modelRecord.height}` : ""}
                                        </p>
                                    ) : null}
                                    <div className="flex flex-wrap items-center gap-1.5" data-testid="ai-posture-examples">
                                        <span className="text-[11px] leading-4 text-muted-foreground">或试试这些</span>
                                        {POSTURE_EXAMPLES.map((label) => (
                                            <button
                                                key={label}
                                                type="button"
                                                data-testid={`ai-posture-example-${label}`}
                                                aria-pressed={exampleLabel === label}
                                                onClick={() => {
                                                    setExampleLabel(label);
                                                    // 示例构图真实落到补充描述：与手动输入同一条 prompt 通道。
                                                    setWorkspace((current) => setAiPosturePrompt(current, POSTURE_EXAMPLE_HINTS[label] ?? ""));
                                                    setSubmitError(null);
                                                }}
                                                className={cn(
                                                    "h-7 rounded border px-2 text-[11px] leading-none transition",
                                                    exampleLabel === label ? "border-primary text-primary" : "border-border text-muted-foreground hover:bg-accent",
                                                )}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        type="button"
                                        data-testid="ai-posture-batch-upload"
                                        aria-pressed={false}
                                        aria-disabled="true"
                                        disabled
                                        title="批量裂变（一次多张模特图各自成套）尚未接入：当前提交只支持 1 张模特图，多选会被忽略"
                                        className="h-7 w-full cursor-not-allowed rounded border border-border px-2 text-[11px] text-muted-foreground opacity-60"
                                    >
                                        上传多张图片，开始批量姿势裂变
                                    </button>
                                    <p data-testid="ai-posture-batch-hint" className="text-[11px] leading-4 text-muted-foreground">
                                        批量入口暂未开放：本页当前只支持上传 1 张模特图，按钮保持禁用。
                                    </p>
                                </section>

                                {/* 2. 姿势库默认折叠为原站式行卡：展开后才出现分类 chip 与姿势网格 */}
                                <details
                                    data-testid="ai-posture-pose-select"
                                    className="group rounded-[8px] border border-border/70 px-2 py-1.5"
                                >
                                    <summary className="block cursor-pointer list-none" data-testid="ai-posture-pose-summary-row">
                                        <span className="flex items-center gap-2">
                                            <span className="grid size-8 shrink-0 place-items-center rounded-[6px] bg-muted text-muted-foreground">
                                                <PersonStanding aria-hidden="true" className="size-4" strokeWidth={1.6} />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-[12px] leading-5">选择姿势（可选）</span>
                                                <span data-testid="ai-posture-pose-summary" className="block truncate text-[11px] leading-4 text-muted-foreground">
                                                    {poseSummary}
                                                </span>
                                            </span>
                                            <ChevronRight
                                                aria-hidden="true"
                                                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                                            />
                                        </span>
                                    </summary>
                                    <div className="mt-2 space-y-2">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <SegmentedButton
                                                testId="ai-posture-mode-library"
                                                active={workspace.mode === "library"}
                                                onClick={() => setWorkspace((current) => setAiPostureMode(current, "library"))}
                                            >
                                                姿势库
                                            </SegmentedButton>
                                            <SegmentedButton
                                                testId="ai-posture-mode-custom"
                                                active={workspace.mode === "custom"}
                                                onClick={() => setWorkspace((current) => setAiPostureMode(current, "custom"))}
                                            >
                                                自定义
                                            </SegmentedButton>
                                            <span className="ml-auto text-[11px] text-muted-foreground" data-testid="ai-posture-mode-readout">
                                                {workspace.mode === "library"
                                                    ? `已选 ${workspace.selectedPoseIds.length} 个姿势${workspace.selectedPoseIds.length === 0 ? "（将自动裂变）" : ""}`
                                                    : `自定义描述 ${workspace.customPose.length} 字`}
                                            </span>
                                        </div>

                                        {workspace.mode === "library" ? (
                                            <div className="space-y-2">
                                                <div className="flex flex-wrap gap-1">
                                                    <SegmentedButton
                                                        testId="ai-posture-category-all"
                                                        active={workspace.categoryId === null}
                                                        onClick={() => setWorkspace((current) => setAiPostureCategory(current, null))}
                                                    >
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
                                                <div data-testid="ai-posture-pose-grid" className="grid grid-cols-2 gap-1.5">
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
                                                                    "rounded-[6px] border px-2 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                                                    selected ? "border-primary bg-accent" : "border-border bg-background hover:bg-accent",
                                                                )}
                                                            >
                                                                <span className="flex items-center justify-between gap-1">
                                                                    <span className="text-[11px] font-medium leading-4">{pose.label}</span>
                                                                    {selected ? <Check aria-hidden="true" className="size-3 text-primary" /> : null}
                                                                </span>
                                                                <span title={pose.instruction} className="mt-0.5 block truncate text-[10px] leading-4 text-muted-foreground">
                                                                    {pose.instruction}
                                                                </span>
                                                                <span className="block truncate text-[10px] leading-4 text-muted-foreground/80">标签：{pose.tags.join(" / ")}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                <button
                                                    type="button"
                                                    data-testid="ai-posture-clear-poses"
                                                    onClick={() => setWorkspace((current) => clearAiPosturePoses(current))}
                                                    disabled={workspace.selectedPoseIds.length === 0}
                                                    className="h-7 rounded border border-border px-2 text-[11px] text-muted-foreground hover:bg-accent disabled:opacity-40"
                                                >
                                                    清空选择（改为自动裂变）
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="space-y-1.5">
                                                <textarea
                                                    data-testid="ai-posture-custom-input"
                                                    value={workspace.customPose}
                                                    onChange={(event) => setWorkspace((current) => setAiPostureCustomPose(current, event.target.value))}
                                                    rows={4}
                                                    placeholder="例如：侧身站立，一只手扶着帽檐，微笑看向镜头"
                                                    className="w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-[12px] leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                />
                                                <p className="text-[11px] leading-4 text-muted-foreground">自定义模式只发一条姿势指令；切回姿势库后这段文本仍会保留。</p>
                                            </div>
                                        )}
                                        <p className="text-[11px] leading-4 text-muted-foreground">不选姿势则按张数自动裂变；姿势库与自定义各自保存，来回切换不会互相覆盖。</p>
                                    </div>
                                </details>

                                {/* 3. 选择生成张数（原站 1/2/3/4 小方块）+ 裂变计划折叠 */}
                                <section data-testid="ai-posture-output-control" className="space-y-1.5 rounded-[8px] border border-border/70 p-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[12px] leading-5">选择生成张数</span>
                                        <span className="flex gap-1">
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
                                        </span>
                                    </div>
                                    <details className="rounded border border-border/70 px-2 py-1">
                                        <summary className="cursor-pointer list-none text-[11px] leading-4 text-muted-foreground">裂变计划</summary>
                                        <dl data-testid="ai-posture-plan-readout" className="mt-1 space-y-0.5 text-[11px] leading-4 text-muted-foreground">
                                            <div className="flex justify-between gap-2">
                                                <dt>裂变方式</dt>
                                                <dd data-testid="ai-posture-plan-origin">{plan.origin === "auto" ? "自动裂变" : plan.origin === "custom" ? "自定义姿势" : "姿势库选择"}</dd>
                                            </div>
                                            <div className="flex justify-between gap-2">
                                                <dt>姿势 / 张数</dt>
                                                <dd className="text-right">
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
                                    </details>
                                </section>

                                {/* 4. 补充描述折叠（原站配置栏没有常驻大文本框） */}
                                <details data-testid="ai-posture-prompt-panel" className="rounded-[8px] border border-border/70 px-2 py-1.5">
                                    <summary className="flex cursor-pointer list-none items-center gap-1.5">
                                        <span className="text-[12px] leading-5">补充描述（可选）</span>
                                        <span className="truncate text-[11px] leading-4 text-muted-foreground">光线 / 场景 / 气质</span>
                                        {workspace.prompt.trim() ? <span className="ml-auto shrink-0 text-[11px] leading-4 text-primary">已填写</span> : null}
                                    </summary>
                                    <textarea
                                        data-testid="ai-posture-prompt"
                                        value={workspace.prompt}
                                        onChange={(event) => setWorkspace((current) => setAiPosturePrompt(current, event.target.value))}
                                        rows={3}
                                        placeholder="例如：室内柔光，浅灰背景，全身构图"
                                        className="mt-1.5 w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-[12px] leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    />
                                </details>

                                <details data-testid="ai-posture-snapshot" className="rounded-[8px] border border-border/70 px-2 py-1">
                                    <summary className="cursor-pointer list-none text-[11px] leading-4 text-muted-foreground">本次输入快照</summary>
                                    <dl className="mt-1 space-y-0.5 text-[11px] leading-4 text-muted-foreground">
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

                            {/* 原站「立即生成」吸在配置栏底部：配置区滚动，按钮始终在首屏可见 */}
                            <div data-testid="ai-posture-submit-bar" className="shrink-0 border-t border-border p-3">
                                <button
                                    type="button"
                                    data-testid="ai-posture-submit"
                                    onClick={() => void submit()}
                                    disabled={!canSubmit}
                                    className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-[6px] bg-primary text-[13px] font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    {run.running ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : null}
                                    立即生成
                                </button>
                                <p data-testid="ai-posture-submit-hint" className="mt-1 text-center text-[11px] leading-4 text-muted-foreground">
                                    {workspace.outputNum} 张 · {plan.poses.length} 个姿势请求
                                </p>
                                {issues.length > 0 ? (
                                    <ul data-testid="ai-posture-issues" className="mt-1 space-y-0.5 text-[11px] leading-4 text-amber-600 dark:text-amber-400">
                                        {issues.map((issue) => (
                                            <li key={issue.code}>{issue.message}</li>
                                        ))}
                                    </ul>
                                ) : null}
                                {submitError ? (
                                    <p data-testid="ai-posture-submit-error" className="mt-1 text-[11px] leading-4 text-destructive">
                                        {submitError}
                                    </p>
                                ) : null}
                                {run.message ? (
                                    <p data-testid="ai-posture-run-message" className="mt-1 text-[11px] leading-4 text-muted-foreground">
                                        {run.message}
                                    </p>
                                ) : null}
                            </div>
                        </div>
                    }
                >
                    {/* 右栏：生成结果 / 历史记录（原站两个页签，结果区独立滚动） */}
                    <section aria-label="生成结果" className="flex h-full min-h-0 flex-col">
                        <div data-testid="ai-posture-results" className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-card">
                            <div role="tablist" aria-label="生成结果 / 历史记录" className="flex h-11 shrink-0 items-center gap-4 border-b border-border px-4">
                                <button
                                    type="button"
                                    role="tab"
                                    data-testid="ai-posture-tab-results"
                                    aria-selected={resultTab === "results"}
                                    onClick={() => setResultTab("results")}
                                    className={cn(
                                        "relative flex h-11 items-center text-[12px] leading-5 transition-colors",
                                        resultTab === "results" ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    生成结果
                                    {resultTab === "results" ? <span className="absolute bottom-0 left-0 h-[2px] w-full rounded-full bg-foreground" /> : null}
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    data-testid="ai-posture-tab-history"
                                    aria-selected={resultTab === "history"}
                                    onClick={() => setResultTab("history")}
                                    className={cn(
                                        "relative ml-auto flex h-11 items-center gap-1 text-[12px] leading-5 transition-colors",
                                        resultTab === "history" ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    历史记录
                                    {resultTab === "history" ? <span className="absolute bottom-0 left-0 h-[2px] w-full rounded-full bg-foreground" /> : null}
                                </button>
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
                                {resultTab === "results" ? (
                                    <>
                                        {resultView.status === "idle" ? (
                                            <div data-testid="ai-posture-result-empty" className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-[8px] border border-dashed border-border px-6 py-10 text-center">
                                                <Sparkles aria-hidden="true" className="mx-auto size-5 text-muted-foreground" />
                                                <p className="text-[13px] leading-6">📸 1 张模特图 → N 种姿势套图！告别重复拍摄成本，秒变视觉内容高产能手！</p>
                                                <p className="text-[11px] leading-4 text-muted-foreground">上传模特图 → 选择参考图 → 生成结果</p>
                                                <button
                                                    type="button"
                                                    data-testid="ai-posture-apply-same"
                                                    onClick={applySameStyle}
                                                    className="h-8 rounded-[6px] bg-primary px-5 text-[12px] font-medium text-primary-foreground transition hover:opacity-90"
                                                >
                                                    一键做同款
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <div className="flex flex-wrap items-center gap-2 text-[11px] leading-4 text-muted-foreground">
                                                    <span data-testid="ai-posture-result-status">状态：{resultView.status}</span>
                                                    <span>共 {resultView.totalImages} 张 / {resultView.groups.length} 个姿势</span>
                                                    {resultView.stale ? (
                                                        <span data-testid="ai-posture-result-stale" className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-600 dark:text-amber-400">
                                                            来自旧版本（配置已修改）
                                                        </span>
                                                    ) : null}
                                                    <span className="ml-auto flex items-center gap-1">
                                                        {failedAiPostureUnits(outcomes).length > 0 ? (
                                                            <button
                                                                type="button"
                                                                data-testid="ai-posture-retry-failed"
                                                                onClick={() => void retryFailed()}
                                                                disabled={run.running}
                                                                className="h-7 rounded border border-border px-2 text-[11px] hover:bg-accent disabled:opacity-40"
                                                            >
                                                                重试失败组（{failedAiPostureUnits(outcomes).length}）
                                                            </button>
                                                        ) : null}
                                                        <button
                                                            type="button"
                                                            data-testid="ai-posture-apply-same"
                                                            onClick={applySameStyle}
                                                            className="h-7 rounded border border-border px-2 text-[11px] hover:bg-accent"
                                                        >
                                                            一键做同款
                                                        </button>
                                                    </span>
                                                </div>
                                                {resultView.groups.map((group) => (
                                                    <section key={group.unitId} data-testid={`ai-posture-result-group-${group.poseId}`} className="rounded-lg border border-border bg-background p-3">
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
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
                                                        </div>
                                                        {group.items.length > 0 ? (
                                                            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                                                {group.items.map((item, index) => {
                                                                    const actionKey = `${group.unitId}#${index}`;
                                                                    const actionState = resultAction?.key === actionKey ? resultAction : null;
                                                                    return (
                                                                        <figure key={`${group.unitId}-${index}`} className="overflow-hidden rounded-lg border border-border">
                                                                            <img
                                                                                src={item.dataUrl || item.url}
                                                                                alt={`${group.label} 第 ${index + 1} 张`}
                                                                                className="aspect-[3/4] w-full object-cover"
                                                                            />
                                                                            <figcaption className="flex items-center justify-center gap-1 border-t border-border p-1">
                                                                                <button
                                                                                    type="button"
                                                                                    data-testid={`ai-posture-result-save-${index}`}
                                                                                    onClick={() => void runResultAction(group.unitId, group.label, item, index, "assets")}
                                                                                    disabled={actionState?.busy ?? false}
                                                                                    aria-label="存入资产"
                                                                                    title="存入资产"
                                                                                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent disabled:opacity-40"
                                                                                >
                                                                                    <FolderPlus aria-hidden="true" className="size-3.5" />
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    data-testid={`ai-posture-result-canvas-${index}`}
                                                                                    onClick={() => void runResultAction(group.unitId, group.label, item, index, "canvas")}
                                                                                    disabled={actionState?.busy ?? false}
                                                                                    aria-label="发送画布"
                                                                                    title="发送画布"
                                                                                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent disabled:opacity-40"
                                                                                >
                                                                                    <Send aria-hidden="true" className="size-3.5" />
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    data-testid={`ai-posture-result-download-${index}`}
                                                                                    onClick={() => void runResultAction(group.unitId, group.label, item, index, "download")}
                                                                                    disabled={actionState?.busy ?? false}
                                                                                    aria-label="下载"
                                                                                    title="下载"
                                                                                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent disabled:opacity-40"
                                                                                >
                                                                                    <Download aria-hidden="true" className="size-3.5" />
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
                                                            <p className="mt-2 text-[11px] text-muted-foreground">{group.status === "running" ? "正在生成…" : "该姿势暂无结果"}</p>
                                                        )}
                                                    </section>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <ToolHistoryDock toolId={AI_POSTURE_TOOL_ID} />
                                )}
                            </div>
                        </div>
                        <PostureRulesDialog
                            open={rulesOpen}
                            onClose={() => setRulesOpen(false)}
                            onTry={(label) => {
                                // 与「或试试这些」同一条真实通道：把示例构图写进补充描述。
                                setExampleLabel(label);
                                setWorkspace((current) => setAiPosturePrompt(current, POSTURE_EXAMPLE_HINTS[label] ?? ""));
                                setRulesOpen(false);
                            }}
                        />
                    </section>
                </ToolWorkspaceColumns>
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
    /** 参考预览页签：当前预览哪条场景的最终 prompt（§1 第三区）。 */
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
    /** 空姿势必须真的拦住提交（SSR 首屏即 disabled），而不是点了才报错。 */
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
            <Link to="/tools/product-design/product-scene" className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
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
            <OrigRail items={WEAR_RAIL} active="姿势裂变" testId="ai-pose-rail" />

            <ToolWorkspaceColumns
                configSide="left"
                className="min-h-0 flex-1"
                config={
                    <section className="flex min-h-0 flex-col overflow-y-auto rounded-lg border border-border bg-card px-3 pb-2 pt-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] leading-4 text-muted-foreground" data-testid="ai-pose-tour-hint">
                        <span>本页从文字生成姿势参考：姿势描述 → 场景（可选）→ 生成</span>
                    </div>

                    {/* §1 区域一：姿势提示词（姿势库结构化约束 + 自定义描述，各自保存互不覆盖） */}
                    <div className="mt-2" data-testid="ai-pose-pose-panel">
                    <div role="tablist" aria-label="姿势来源" className="flex h-8 w-full items-center rounded-lg bg-border p-[2px]" data-testid="ai-pose-mode-tabs">
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
                            <div className="mt-1.5 flex items-center justify-between gap-2">
                                <span className="text-[11px] leading-4 text-muted-foreground">
                                    {selectedPresetLabels.length > 0 ? `已选姿势：${selectedPresetLabels.join(" / ")}` : "未选姿势：按纯姿势描述生成"}
                                </span>
                                <button
                                    type="button"
                                    data-testid="ai-pose-preset-clear"
                                    onClick={() => setWorkspace((current) => clearAiPosePresets(current))}
                                    disabled={workspace.selectedPresetIds.length === 0}
                                    className="h-6 shrink-0 rounded-md border border-border px-2 text-[11px] leading-none text-muted-foreground hover:bg-accent disabled:opacity-40"
                                >
                                    清空已选
                                </button>
                            </div>
                        </div>
                    ) : null}

                    {/* 姿势描述（§7 prompt 字段的直接编辑入口）：两条姿势来源共用，始终可编辑 */}
                    <div className="mt-1.5" data-testid="ai-pose-custom">
                        <textarea
                            data-testid="ai-pose-prompt"
                            value={workspace.posePrompt}
                            onChange={(event) => setWorkspace((current) => setAiPosePrompt(current, event.target.value))}
                            rows={3}
                            maxLength={AI_POSE_GENERATOR_PROMPT_MAX}
                            placeholder="例：女性模特侧身站立，一手扶腰，重心落在后腿，头部转向镜头，全身入镜"
                            className="w-full resize-none rounded-lg border border-border bg-background px-2 py-1.5 text-[12px] leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <div className="mt-1 flex items-center justify-between gap-1" data-testid="ai-pose-prompt-count">
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
                            <span className="text-[11px] text-muted-foreground">
                                {workspace.posePrompt.length}/{AI_POSE_GENERATOR_PROMPT_MAX}
                            </span>
                        </div>
                        {/* 可保存的姿势预设（§3：可保存姿势预设）：保存当前描述，应用时覆盖（可撤销） */}
                        <div className="mt-1.5 flex items-center gap-1">
                            <input
                                data-testid="ai-pose-preset-name"
                                value={presetLabel}
                                maxLength={AI_POSE_GENERATOR_PRESET_LABEL_MAX}
                                onChange={(event) => setPresetLabel(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        event.preventDefault();
                                        savePreset();
                                    }
                                }}
                                placeholder="预设名称"
                                className="h-7 min-w-0 flex-1 rounded border border-border bg-card px-1.5 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                            <button
                                type="button"
                                data-testid="ai-pose-preset-save"
                                onClick={savePreset}
                                disabled={!presetLabel.trim()}
                                aria-label="保存预设"
                                title="把当前姿势描述与场景保存为预设"
                                className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-accent disabled:opacity-40"
                            >
                                <Save aria-hidden="true" className="size-3" />
                                保存预设
                            </button>
                        </div>
                        {workspace.savedPresets.length > 0 ? (
                            <ul className="mt-1.5 space-y-1" data-testid="ai-pose-saved-presets">
                                {workspace.savedPresets.map((preset) => (
                                    <li
                                        key={preset.id}
                                        data-testid={`ai-pose-saved-preset-${preset.id}`}
                                        className="flex items-center gap-1 rounded border border-border bg-background px-1.5 py-1"
                                    >
                                        <span className="min-w-0 flex-1 truncate text-[11px] leading-4 text-foreground" title={preset.posePrompt || preset.label}>
                                            {preset.label}
                                        </span>
                                        <button
                                            type="button"
                                            data-testid={`ai-pose-saved-apply-${preset.id}`}
                                            onClick={() => setWorkspace((current) => applyAiPosePreset(current, preset.id))}
                                            aria-label={`应用预设 ${preset.label}`}
                                            className="shrink-0 rounded px-1 text-[11px] leading-4 text-primary hover:underline"
                                        >
                                            应用
                                        </button>
                                        <button
                                            type="button"
                                            data-testid={`ai-pose-saved-remove-${preset.id}`}
                                            onClick={() => setWorkspace((current) => removeAiPosePreset(current, preset.id))}
                                            aria-label={`删除预设 ${preset.label}`}
                                            className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent"
                                        >
                                            <Trash2 aria-hidden="true" className="size-3" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                    </div>

                    <div className="mt-2" data-testid="ai-pose-output-control">
                    <div className="flex items-center justify-between gap-2">
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
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground" data-testid="ai-pose-plan-total">
                        {plan.scenes[0]?.label ?? "默认场景"}等 {plan.scenes.length} 个场景 × 每场景 {workspace.outputNum} 张 = 共 {plan.total} 张
                    </p>
                    </div>

                    {/* §1 区域二：场景提示词（scenePrompts 数组，每条场景各自出图；只能写环境/光线/道具） */}
                    <div className="mt-2 rounded-lg border border-border bg-background/60 p-2" data-testid="ai-pose-scene-panel">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] leading-4 text-foreground">场景描述（可选，最多 {AI_POSE_GENERATOR_SCENES_MAX} 条）</span>
                            <button
                                type="button"
                                data-testid="ai-pose-scene-add"
                                onClick={() => setWorkspace((current) => addAiPoseScene(current))}
                                disabled={workspace.scenes.length >= AI_POSE_GENERATOR_SCENES_MAX}
                                className="inline-flex h-6 shrink-0 items-center gap-0.5 rounded-md border border-border px-1.5 text-[11px] leading-none text-muted-foreground hover:bg-accent disabled:opacity-40"
                            >
                                <Plus aria-hidden="true" className="size-3" />
                                添加场景
                            </button>
                        </div>
                        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">场景只描述环境、光线、道具，不能改写姿势约束。</p>
                        {workspace.scenes.length === 0 ? (
                            <p data-testid="ai-pose-scene-empty" className="mt-1.5 rounded-md border border-dashed border-border px-2 py-3 text-center text-[11px] leading-4 text-muted-foreground">
                                还没有场景：不添加则按默认影棚背景生成。
                            </p>
                        ) : (
                            <ul className="mt-1.5 space-y-1.5">
                                {workspace.scenes.map((scene, index) => {
                                    const conflict = aiPoseSceneConflicts(scene.text);
                                    return (
                                        <li key={scene.id} className="rounded-md border border-border bg-card p-1.5">
                                            <div className="flex items-center justify-between gap-1">
                                                <span className="text-[11px] leading-4 text-muted-foreground">场景 {index + 1}</span>
                                                <span className="flex items-center gap-0.5">
                                                    <button
                                                        type="button"
                                                        data-testid={`ai-pose-scene-up-${index}`}
                                                        onClick={() => setWorkspace((current) => moveAiPoseScene(current, scene.id, -1))}
                                                        disabled={index === 0}
                                                        aria-label={`上移场景 ${index + 1}`}
                                                        className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30"
                                                    >
                                                        <ArrowUp aria-hidden="true" className="size-3" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        data-testid={`ai-pose-scene-down-${index}`}
                                                        onClick={() => setWorkspace((current) => moveAiPoseScene(current, scene.id, 1))}
                                                        disabled={index === workspace.scenes.length - 1}
                                                        aria-label={`下移场景 ${index + 1}`}
                                                        className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30"
                                                    >
                                                        <ArrowDown aria-hidden="true" className="size-3" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        data-testid={`ai-pose-scene-remove-${index}`}
                                                        onClick={() => setWorkspace((current) => removeAiPoseScene(current, scene.id))}
                                                        aria-label={`删除场景 ${index + 1}`}
                                                        className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent"
                                                    >
                                                        <Trash2 aria-hidden="true" className="size-3" />
                                                    </button>
                                                </span>
                                            </div>
                                            <textarea
                                                data-testid={`ai-pose-scene-${index}`}
                                                value={scene.text}
                                                rows={2}
                                                maxLength={AI_POSE_GENERATOR_SCENE_MAX}
                                                onChange={(event) => setWorkspace((current) => updateAiPoseScene(current, scene.id, event.target.value))}
                                                placeholder="例：纯白影棚，地面浅灰反光"
                                                className="mt-1 w-full resize-none rounded border border-border bg-background px-1.5 py-1 text-[12px] leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            />
                                            <div className="mt-0.5 flex items-center justify-between gap-2">
                                                {conflict ? (
                                                    <span data-testid={`ai-pose-scene-conflict-${index}`} className="text-[11px] leading-4 text-destructive">
                                                        场景不能改写姿势，请删除相关描述
                                                    </span>
                                                ) : (
                                                    <span />
                                                )}
                                                <span className="text-[11px] text-muted-foreground">{scene.text.length}/{AI_POSE_GENERATOR_SCENE_MAX}</span>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        <p className="mt-1 text-right text-[11px] text-muted-foreground" data-testid="ai-pose-scene-count">
                            {workspace.scenes.length}/{AI_POSE_GENERATOR_SCENES_MAX} 条场景
                        </p>
                    </div>

                    {/* §1 区域三：参考预览 —— 真正发给 provider 的最终 prompt（按场景页签） */}
                    <div className="mt-2 rounded-lg border border-border bg-background/60 p-2" data-testid="ai-pose-preview-panel">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] leading-4 text-foreground">参考预览</span>
                            {plan.scenes.length > 1 ? (
                                <div className="flex flex-wrap gap-1" data-testid="ai-pose-preview-tabs">
                                    {plan.scenes.map((scene, index) => (
                                        <button
                                            key={scene.id}
                                            type="button"
                                            data-testid={`ai-pose-preview-tab-${index}`}
                                            aria-pressed={previewScene.id === scene.id}
                                            onClick={() => setPreviewSceneId(scene.id)}
                                            className={cn(
                                                "h-5 rounded border px-1.5 text-[11px] leading-none",
                                                previewScene.id === scene.id ? "border-primary text-primary" : "border-border text-muted-foreground hover:bg-accent",
                                            )}
                                        >
                                            {index + 1}
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                        <p
                            data-testid="ai-pose-preview-prompt"
                            className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-all rounded border border-border bg-card px-1.5 py-1 text-[11px] leading-4 text-muted-foreground"
                        >
                            {previewPrompt}
                        </p>
                    </div>

                    <button
                        type="button"
                        data-testid="ai-pose-submit"
                        onClick={() => {
                            setAttempted(true);
                            void submit();
                        }}
                        disabled={!canSubmit}
                        title={issues.length > 0 ? issues[0]!.message : undefined}
                        className="mt-2 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {run.running ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
                        <span>立即生成</span>
                    </button>
                    <p className="mt-1 text-center text-[11px] text-muted-foreground">
                        {run.running ? "生成中…" : `预计输出 ${plan.total} 张`}
                    </p>

                    {issues.length > 0 ? (
                        <ul data-testid="ai-pose-issues" className="mt-1.5 space-y-0.5 text-[11px] leading-4 text-amber-600 dark:text-amber-400">
                            {issues.map((issue, index) => (
                                <li key={`${issue.code}-${index}`}>{attempted ? issue.message : `待填写：${issue.message.split("（")[0]}`}</li>
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

                    {/* 本次输入快照：与提交锁定的 configSnapshot 同源，便于对照结果 */}
                    <details data-testid="ai-pose-snapshot" className="mt-2 rounded-lg border border-border px-2 py-1.5 text-[11px] text-muted-foreground">
                        <summary className="cursor-pointer select-none">本次输入快照</summary>
                        <dl className="mt-1 space-y-0.5">
                            <div className="flex justify-between gap-2">
                                <dt>草稿键</dt>
                                <dd className="truncate">{AI_POSE_GENERATOR_DRAFT_KEY}</dd>
                            </div>
                            <div className="flex justify-between gap-2">
                                <dt>快照指纹</dt>
                                <dd data-testid="ai-pose-snapshot-hash">{currentHash}</dd>
                            </div>
                            <div className="flex justify-between gap-2">
                                <dt>提交字段</dt>
                                <dd className="truncate">{fieldSpecs.map((field) => field.key).join(" / ")}</dd>
                            </div>
                        </dl>
                    </details>

                </section>
                }
            >
                {/* 结果区：空态 / 生成中 / 按场景分组成功与失败（§1 区域四） */}
                <section className="flex min-h-0 flex-col overflow-y-auto rounded-lg border border-border bg-card p-3" data-testid="ai-pose-results">
                    <div className="flex items-center justify-between gap-2">
                        <h2 className="text-sm font-medium leading-5">生成结果</h2>
                        {failedAiPoseGeneratorUnits(outcomes).length > 0 ? (
                            <button
                                type="button"
                                data-testid="ai-pose-retry-failed"
                                onClick={() => void retryFailed()}
                                disabled={run.running}
                                className="h-7 shrink-0 rounded-lg border border-border px-2 text-[11px] leading-none text-muted-foreground hover:bg-accent disabled:opacity-40"
                            >
                                重试失败场景（{failedAiPoseGeneratorUnits(outcomes).length}）
                            </button>
                        ) : null}
                    </div>

                    {resultView.status === "idle" ? (
                        <div data-testid="ai-pose-results-empty" className="mt-2 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-8 text-center">
                            <Sparkles aria-hidden="true" className="mx-auto size-5 text-muted-foreground" />
                            <p className="mt-2 text-sm">还没有生成结果</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {workspace.posePrompt.trim()
                                    ? "填写姿势描述并选择姿势（可选）后，点击「立即生成」。"
                                    : "先填写姿势描述（无姿势描述不能生成），场景可留空按默认影棚背景生成。"}
                            </p>
                        </div>
                    ) : (
                        <div className="mt-2 space-y-2">
                            <div className="flex flex-wrap items-center gap-2 text-[11px] leading-4 text-muted-foreground">
                                <span>共 {resultView.totalImages} 张 / {resultView.groups.length} 个场景</span>
                                {resultView.stale ? (
                                    <p data-testid="ai-pose-results-stale" className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-600 dark:text-amber-400">
                                        配置已修改，下方结果来自旧版本
                                    </p>
                                ) : null}
                            </div>
                            {resultView.groups.map((group, index) => (
                                <section key={group.unitId} data-testid={`ai-pose-group-${index}`} className="rounded-lg border border-border p-2">
                                    <div className="flex items-center justify-between gap-2">
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
                                    </div>
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
                                                        <p
                                                            data-testid={`ai-pose-result-action-status-${index}-${itemIndex}`}
                                                            className={actionState ? (actionState.tone === "error" ? "px-1 pb-1 text-[10px] leading-3 text-destructive" : "px-1 pb-1 text-[10px] leading-3 text-muted-foreground") : "px-1 pb-1 text-[10px] leading-3 text-transparent"}
                                                        >
                                                            {actionState?.message ?? "·"}
                                                        </p>
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
                    )}
                </section>
            </ToolWorkspaceColumns>
        </div>
    );
}
