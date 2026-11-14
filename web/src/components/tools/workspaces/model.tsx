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
import { ArrowDown, ArrowUp, Check, ChevronRight, Download, FolderPlus, Loader2, Plus, Redo2, Send, Sparkles, Trash2, Undo2, X } from "lucide-react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
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
import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import { ToolCaseGuide } from "@/components/tools/tool-case-guide";
import type { ToolCase } from "@/components/tools/tool-cases";
import { uploadCaseFile, uploadCaseFiles } from "@/features/tools/case-apply";
import { AI_POSTURE_GUIDE_CASES, DESIGN_TRY_DEMOS } from "@/features/tools/tool-cases-data";
import { DESIGN_GUIDE_PORTRAIT, DESIGN_ICON_FEATURE, DESIGN_OUTLINE_BUTTON, DESIGN_UPLOAD_DROPZONE, DESIGN_UPLOAD_PANEL, TryDemoStrip, UploadPanelIcon } from "@/components/tools/workspaces/design-demo";

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
                "inline-flex h-[26px] min-w-10 items-center justify-center rounded-[4px] border px-2 text-[12px] leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-selected bg-selected-soft text-selected" : "border-border text-muted-foreground hover:border-foreground/30",
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
    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);

    const [draftReady, setDraftReady] = useState(false);
    const [workspace, setWorkspace] = useState<AiPostureWorkspace>(() => createAiPostureWorkspace());
    const [modelRecord, setModelRecord] = useState<ToolAssetRecord | null>(null);
    const [units, setUnits] = useState<AiPostureUnit[]>([]);
    const [outcomes, setOutcomes] = useState<AiPostureUnitOutcome[]>([]);
    const [run, setRun] = useState<RunState>({ running: false, message: null });
    const [submitError, setSubmitError] = useState<string | null>(null);
    /** 「图片规则」弹窗（原站点击图片规则后弹出的上传规则说明）。 */
    const [rulesOpen, setRulesOpen] = useState(false);
    /** 姿势选择悬浮面板。 */
    const [posePanelOpen, setPosePanelOpen] = useState(false);
    /** 结果区页签：生成结果 / 历史记录（原站两个页签）。 */
    const [resultTab, setResultTab] = useState<"results" | "history">("results");
    /** 结果动作（存入资产 / 发送画布 / 下载）按单张结果卡片记录状态。 */
    const [resultAction, setResultAction] = useState<{ key: string; busy: boolean; tone: "ok" | "error"; message: string } | null>(null);
    /** 做同款 / 示例图回填后同步给上传区的资产 id。 */
    const [modelSyncIds, setModelSyncIds] = useState<string[] | undefined>(undefined);
    const [applyingCaseId, setApplyingCaseId] = useState<string | null>(null);
    const [demoBusy, setDemoBusy] = useState<string | null>(null);

    const revisionRef = useRef<number | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const currentHash = useMemo(() => aiPostureSnapshotHash(workspace), [workspace]);
    const plan = useMemo(() => resolveAiPosturePlan(workspace), [workspace]);

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
        setModelSyncIds(record ? [record.id] : undefined);
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

    /** 「一键做同款」/「或试试这些」：模特图真实入库后当作上传的模特图（姿势沿用自动裂变，张数取案例值）。 */
    const applyCase = useCallback(async (item: ToolCase) => {
        setApplyingCaseId(item.id);
        try {
            const record = (await uploadCaseFiles(item)).model;
            if (!record) throw new Error("该案例缺少模特图");
            handleModelChange([record.id], [record]);
            const num = Number(item.apply?.outputNum);
            if (num) setWorkspace((current) => setAiPostureOutputNum(current, num));
        } finally {
            setApplyingCaseId(null);
        }
    }, [handleModelChange]);
    const pickDemo = useCallback(async (src: string) => {
        setDemoBusy(src);
        try {
            const record = await uploadCaseFile(src, "linkfox-demo-posture");
            handleModelChange([record.id], [record]);
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : String(error));
        } finally {
            setDemoBusy(null);
        }
    }, [handleModelChange]);

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

    const undo = useCallback(() => setWorkspace((current) => undoPostureEdit(current)), []);
    const redo = useCallback(() => setWorkspace((current) => redoPostureEdit(current)), []);

    // 快捷键真实生效：⌘/Ctrl + Z 撤销，⇧⌘/Ctrl + Z 重做；文本域内保留原生撤销。
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

    const visiblePoses = aiPosturePoses(workspace.categoryId);
    /** 折叠态行卡的摘要：原站「选择姿势（可选）/ 生成图片的模特姿势」，选中后显示已选姿势名。 */
    const poseSummary =
        workspace.mode === "custom"
            ? `自定义姿势${workspace.customPose.trim() ? `：${workspace.customPose.trim().slice(0, 18)}` : ""}`
            : workspace.selectedPoseIds.length > 0
              ? `已选：${plan.poses.map((pose) => pose.label).join(" / ")}`
              : "生成图片的模特姿势";

    return (
        <div data-testid="ai-posture-workspace" className={cn("relative flex h-full min-h-0 min-w-0 flex-col", className)}>
            <ToolWorkspaceColumns
                configSide="left"
                className="min-h-0 flex-1 overflow-hidden"
                config={
                    <div className="flex h-full min-h-0 flex-col">
                        <div data-testid="ai-posture-form" className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 pb-3 pt-3">
                            {/* 1. 原站 `_uploadPanel`：灰底卡 + 虚线上传框（右上图片规则）+「或试试这些」4 张示例 */}
                            <section data-testid="ai-posture-model-picker" className="space-y-[10px]">
                                <div className={DESIGN_UPLOAD_PANEL}>
                                    <UploadPanelIcon />
                                    <button
                                        type="button"
                                        data-testid="ai-posture-image-rules"
                                        onClick={() => setRulesOpen(true)}
                                        className="absolute right-[18px] top-[14px] z-30 inline-flex items-center text-[12px] leading-6 text-muted-foreground hover:text-foreground"
                                    >
                                        图片规则
                                        <ChevronRight aria-hidden="true" className="size-3" />
                                    </button>
                                    <ToolAssetInput
                                        toolId={MODEL_SLOT_ID}
                                        variant="linkfox"
                                        wide
                                        className={DESIGN_UPLOAD_DROPZONE}
                                        maxCount={1}
                                        constraints={UPLOAD_CONSTRAINTS}
                                        dropLabel="拖拽/粘贴 或 上传模特姿势图"
                                        hint="10M以内，384*384 ~ 4096*4096"
                                        syncIds={modelSyncIds}
                                        onChange={handleModelChange}
                                    />
                                    <TryDemoStrip demos={DESIGN_TRY_DEMOS.posture} busySrc={demoBusy} disabled={run.running} onPick={(src) => void pickDemo(src)} />
                                </div>
                                <button
                                    type="button"
                                    data-testid="ai-posture-batch-upload"
                                    onClick={() => {
                                        const zone = document.querySelector<HTMLElement>('[data-testid="tool-asset-dropzone"]');
                                        zone?.click();
                                    }}
                                    className={cn(DESIGN_OUTLINE_BUTTON, "mt-0")}
                                >
                                    上传多张图片，开始批量姿势裂变
                                    <ChevronRight aria-hidden="true" className="size-3.5" />
                                </button>
                            </section>

                            {/* 2. 原站 Tab 行「姿势库 | 自定义」+ 行卡「选择姿势（可选）」 */}
                            <div role="tablist" aria-label="姿势来源" className="flex h-[30px] items-center gap-[14px] border-b border-border">
                                {([["library", "姿势库"], ["custom", "自定义"]] as const).map(([mode, label]) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        role="tab"
                                        data-testid={`ai-posture-mode-${mode}`}
                                        aria-pressed={workspace.mode === mode}
                                        aria-selected={workspace.mode === mode}
                                        onClick={() => setWorkspace((current) => setAiPostureMode(current, mode))}
                                        className={cn(
                                            "relative h-full text-[14px] leading-[22px] transition-colors",
                                            workspace.mode === mode ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-foreground" : "text-muted-foreground hover:text-foreground",
                                        )}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            {workspace.mode === "library" ? (
                                <>
                                    <button
                                        type="button"
                                        data-testid="ai-posture-pose-summary-row"
                                        onClick={() => setPosePanelOpen((open) => !open)}
                                        className="flex w-full items-center gap-[10px] rounded-[6px] border border-border bg-muted p-[10px] text-left transition hover:border-selected"
                                    >
                                        <img src={DESIGN_ICON_FEATURE} alt="" className="size-[60px] shrink-0 rounded-[4px] object-contain" draggable={false} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[14px] leading-[22px] text-foreground/85">选择姿势（可选）</span>
                                            <span data-testid="ai-posture-pose-summary" className="block truncate text-[12px] leading-[22px] text-muted-foreground">
                                                {poseSummary}
                                            </span>
                                        </span>
                                        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                                    </button>
                                    {posePanelOpen ? (
                                        <div
                                            role="dialog"
                                            aria-label="选择姿势"
                                            data-testid="ai-posture-pose-select"
                                            className="fixed left-[310px] top-[76px] z-40 w-[440px] max-w-[calc(100vw-324px)] rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-xl"
                                        >
                                            <div className="mb-3 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-sm font-medium text-foreground">选择姿势（可选）</h3>
                                                    <span className="text-[11px] text-muted-foreground" data-testid="ai-posture-mode-readout">
                                                        已选 {workspace.selectedPoseIds.length} 个姿势{workspace.selectedPoseIds.length === 0 ? "（将自动裂变）" : ""}
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    aria-label="关闭姿势面板"
                                                    onClick={() => setPosePanelOpen(false)}
                                                    className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                                >
                                                    <X className="size-4" />
                                                </button>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
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
                                            <div data-testid="ai-posture-pose-grid" className="mt-3 grid max-h-[340px] grid-cols-2 gap-2 overflow-y-auto pr-1">
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
                                                                "rounded-[6px] border px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                                                selected ? "border-selected bg-selected-soft" : "border-border bg-card hover:bg-accent",
                                                            )}
                                                        >
                                                            <span className="flex items-center justify-between gap-1">
                                                                <span className="text-[12px] font-medium leading-4">{pose.label}</span>
                                                                {selected ? <Check aria-hidden="true" className="size-3.5 text-selected" /> : null}
                                                            </span>
                                                            <span title={pose.instruction} className="mt-1 block truncate text-[11px] leading-4 text-muted-foreground">
                                                                {pose.instruction}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
                                                <button
                                                    type="button"
                                                    data-testid="ai-posture-clear-poses"
                                                    onClick={() => setWorkspace((current) => clearAiPosturePoses(current))}
                                                    disabled={workspace.selectedPoseIds.length === 0}
                                                    className="h-7 rounded border border-border px-2 text-[11px] text-muted-foreground hover:bg-accent disabled:opacity-40"
                                                >
                                                    清空选择（改为自动裂变）
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setPosePanelOpen(false)}
                                                    className="h-7 rounded bg-primary px-3 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                                                >
                                                    确定
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}
                                </>
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
                                </div>
                            )}

                            {/* 3. 选择生成张数（原站 12px 标题 + 40×26 chip） */}
                            <section data-testid="ai-posture-output-control" className="space-y-[6px] pt-[10px]">
                                <p className="text-[12px] leading-[22px] text-muted-foreground">选择生成张数</p>
                                <div className="flex gap-[10px]">
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
                            </section>
                        </div>

                        {/* 原站「立即生成」吸在配置栏底部：配置区滚动，按钮始终在首屏可见 */}
                        <div data-testid="ai-posture-submit-bar" className="shrink-0 px-3 pb-[10px] pt-2">
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
                            <p data-testid="ai-posture-submit-hint" className="sr-only">
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
                    <div data-testid="ai-posture-results" className="flex h-full min-h-0 flex-col overflow-hidden rounded-[8px]">
                        <div role="tablist" aria-label="生成结果 / 历史记录" className="flex h-11 shrink-0 items-center gap-4 border-b border-border bg-card px-4">
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
                                        <div data-testid="ai-posture-result-empty" className="flex min-h-[calc(100dvh-160px)] pt-[42px] flex-col items-center justify-center">
                                            <ToolCaseGuide
                                                className={DESIGN_GUIDE_PORTRAIT}
                                                title="📸 1 张模特图→N 种姿势套图！告别重复拍摄成本，秒变视觉内容高产能手！"
                                                cases={AI_POSTURE_GUIDE_CASES}
                                                applyingId={applyingCaseId}
                                                onApply={applyCase}
                                            />
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="flex flex-wrap items-center gap-2 text-[11px] leading-4 text-muted-foreground">
                                                <span data-testid="ai-posture-result-status">状态：{resultView.status}</span>
                                                <span>共 {resultView.totalImages} 张 / {resultView.groups.length} 个姿势</span>
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
                                <ToolTaskHistory toolId={AI_POSTURE_TOOL_ID} limit={10} emptyHint="还没有姿势裂变任务记录" />
                            )}
                        </div>
                    </div>
                    <PostureRulesDialog
                        open={rulesOpen}
                        onClose={() => setRulesOpen(false)}
                        onTry={(label) => {
                            setWorkspace((current) => setAiPosturePrompt(current, POSTURE_EXAMPLE_HINTS[label] ?? ""));
                            setRulesOpen(false);
                        }}
                    />
                </section>
            </ToolWorkspaceColumns>
        </div>
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
    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);

    const [draftReady, setDraftReady] = useState(false);
    const [workspace, setWorkspace] = useState<AiPoseGeneratorState>(() => createAiPoseGeneratorWorkspace());
    const [categoryId, setCategoryId] = useState<string>("standing");
    /** 原站面板 Tab：姿势库 / 自定义。 */
    const [poseMode, setPoseMode] = useState<"library" | "custom">("library");
    /** 只有点过生成才展示校验提示，避免初始空态堆错误文案。 */
    const [attempted, setAttempted] = useState(false);
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
    const resultView = useMemo(
        () => aiPoseGeneratorResultView({ units, outcomes, currentHash, running: run.running }),
        [currentHash, outcomes, run.running, units],
    );
    const selectedPresetLabels = useMemo(
        () => workspace.selectedPresetIds.map((id) => findAiPosePreset(id)?.label ?? id),
        [workspace.selectedPresetIds],
    );

    return (
        <div className={cn("flex h-full min-h-0 flex-col", className)} data-testid="ai-pose-generator-workspace">
            <ToolWorkspaceColumns
                configSide="left"
                className="min-h-0 flex-1"
                config={
                    <section className="flex min-h-0 flex-col overflow-y-auto rounded-lg border border-border bg-card px-3 pb-2 pt-3">
                    {/* §1 区域一：姿势提示词（姿势库结构化约束 + 自定义描述，各自保存互不覆盖） */}
                    <div data-testid="ai-pose-pose-panel">
                    <div role="tablist" aria-label="姿势来源" className="flex h-8 w-full items-center rounded-lg bg-border p-[2px]" data-testid="ai-pose-mode-tabs">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={poseMode === "library"}
                            data-testid="ai-pose-mode-library"
                            onClick={() => setPoseMode("library")}
                            className={cn(
                                "h-full flex-1 rounded-[7px] text-[12px] leading-none transition",
                                poseMode === "library" ? "bg-card font-medium text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-muted-foreground",
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
                                poseMode === "custom" ? "bg-card font-medium text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-muted-foreground",
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
                                            categoryId === category.id ? "border-selected bg-selected-soft" : "border-border hover:bg-accent",
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
                                                active ? "border-selected bg-selected-soft ring-1 ring-selected" : "border-border bg-muted/40 hover:bg-accent",
                                            )}
                                        >
                                            <span aria-hidden="true" className="mb-1 h-5 w-3 rounded-sm bg-foreground/20" />
                                            {active ? <Check aria-hidden="true" className="absolute right-0.5 top-0.5 size-3 text-selected" /> : null}
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
                                        workspace.outputNum === value ? "border-selected bg-selected-soft text-selected" : "border-border text-muted-foreground hover:text-foreground",
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

                    <button
                        type="button"
                        data-testid="ai-pose-submit"
                        onClick={() => {
                            setAttempted(true);
                            void submit();
                        }}
                        disabled={!canSubmit}
                        title={issues.length > 0 ? issues[0]!.message : undefined}
                        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
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

                </section>
                }
            >
                {/* 结果区：空态 / 生成中 / 按场景分组成功与失败 */}
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
