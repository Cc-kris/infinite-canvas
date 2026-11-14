import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
/**
 * TASK-026：AI 穿衣工作区（AI_DRESSING_V2）。
 *
 * 交付面（真实边界）：
 * - 两个 Tab（上下装衣服 / 连体衣服）只决定哪些服装槽位参与生成，切 Tab 不清空另一侧草稿；
 *   配置栏 Tab 下方有上传按钮，按上传顺序落位到当前 Tab 槽位（批量穿衣入口）；
 * - 模特参考与服装图都走真实资产落库再取 URL，不做假上传占位；模特参考最多 10 张；
 * - 每个服装槽位的蒙版必须真实涂抹（或点「整件」），空蒙版会拦住提交；
 * - 提交由适配器构建单元 → 共享任务网关真跑（带当前模型渠道与草稿 revision），
 *   返回空结果即判失败，不补造成片；失败单元可按同快照单独重试；
 * - 结果区页签：生成结果 / 优秀案例 / 历史记录（历史读真实落盘任务，不伪造）。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowRight, SlidersHorizontal, X } from "lucide-react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolCases, type ToolCase } from "@/components/tools/tool-cases";
import { ImageRulesPopover } from "@/components/tools/image-rules-popover";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { useConfigStore } from "@/stores/use-config-store";
import { dressingResultPanelTask } from "@/features/tools/adapters/ai-dressing-v2";
import { useToolTaskStore } from "@/stores/use-tool-task-store";
import { cn } from "@/lib/utils";
import {
    AI_DRESSING_V2_TOOL_ID,
    DRESSING_MAX_POSES,
    DRESSING_OUTPUT_OPTIONS,
    DRESSING_TABS,
    DRESSING_UPLOAD_LIMITS,
    createDressingValues,
    createGarment,
    dressingIssuesByField,
    dressingSnapshotHash,
    fillGarmentMask,
    firstDressingError,
    normalizeDressingValues,
    serializeDressingValues,
    slotMeta,
    switchTab,
    tabSlots,
    validateDressing,
    type DressingSnapshot,
    type DressingTab,
    type DressingValues,
    type GarmentDraft,
    type GarmentSlotKey,
    type ModelPoseDraft,
} from "@/features/tools/registry/ai-dressing-v2";
import type { MaskPoint, MaskStroke } from "@/features/tools/registry/area-repair";
import { uploadCaseFiles } from "@/features/tools/case-apply";
import { AI_DRESSING_GUIDE_CASES, AI_DRESSING_V2_CASES, DESIGN_TRY_DEMOS } from "@/features/tools/tool-cases-data";
import { uploadCaseFile } from "@/features/tools/case-apply";
import { ToolCaseGuide } from "@/components/tools/tool-case-guide";
import { DESIGN_GUIDE_PORTRAIT, DESIGN_ICON_FEATURE, DESIGN_OUTLINE_BUTTON, DESIGN_UPLOAD_DROPZONE, DesignRowCard, TryDemoStrip, UploadPanelIcon } from "@/components/tools/workspaces/design-demo";
import type { ToolAssetRecord } from "@/services/api/tools/assets";
import { toolAssetLibraryItemsFromAssets } from "@/services/api/tools/assets";
import { useAssetStore, type ImageAsset, type VideoAsset } from "@/stores/use-asset-store";
import {
    buildDressingUnit,
    createDressingRunPort,
    describeDressingOutcome,
    dressingResultView,
    mapDressingTaskToOutcome,
    runDressingUnit,
    type DressingUnitOutcome,
} from "@/features/tools/adapters/ai-dressing-v2";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";

export type DressingWorkspaceProps = {
    className?: string;
};

const DRAFT_DEBOUNCE_MS = 500;

/** 与页面规格一致的真实上传约束：10M 以内、384×384 ~ 4096×4096。 */
const UPLOAD_CONSTRAINTS = {
    mimeTypes: [...DRESSING_UPLOAD_LIMITS.mimeTypes],
    maxBytes: DRESSING_UPLOAD_LIMITS.maxBytes,
    minWidth: DRESSING_UPLOAD_LIMITS.minSide,
    minHeight: DRESSING_UPLOAD_LIMITS.minSide,
    maxWidth: DRESSING_UPLOAD_LIMITS.maxSide,
    maxHeight: DRESSING_UPLOAD_LIMITS.maxSide,
};

let strokeSeed = 0;function strokeId(): string {
    strokeSeed += 1;
    return `stroke-${Date.now().toString(36)}-${strokeSeed}`;
}

export function DressingWorkspace({ className }: DressingWorkspaceProps) {
    // 原站「选择生成张数」默认选中 4（页面证据），registry 的纯逻辑默认值仍是 1，这里按页面覆盖。
    const [values, setValues] = useState<DressingValues>(() => ({ ...createDressingValues(), outputNum: 4 }));
    const [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [outcomes, setOutcomes] = useState<DressingUnitOutcome[]>([]);
    /** §4：每次提交固化的输入快照，供结果区「查看本次输入快照」。 */
    const [lastSnapshot, setLastSnapshot] = useState<DressingSnapshot | null>(null);
    const [applyingCaseId, setApplyingCaseId] = useState<string | null>(null);
    /** 原站「选择穿衣模特」是一张可展开的行卡，点击在右侧弹出模特面板。 */
    const [modelOpen, setModelOpen] = useState(false);
    const [modelPanelTab, setModelPanelTab] = useState<"library" | "upload" | "history">("library");
    const [maskModalSlot, setMaskModalSlot] = useState<GarmentSlotKey | null>(null);
    const dragRef = useRef<{ slot: GarmentSlotKey; id: string } | null>(null);

    const hydrate = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const flushDraft = useToolDraftStore((state) => state.flush);
    // provider 为空 = 跟随当前模型配置；提交时把解析出的渠道写进 model，网关才有真实执行渠道。
    const imageModel = useConfigStore((state) => state.config.imageModel);
    const effectiveModel = values.provider.trim() || (imageModel ?? "");

    // 作品库（本地资产库）：上传卡上的「从作品库选择」从真实资产列表读取，不伪造商品库入口。
    const assets = useAssetStore((state) => state.assets);
    const library = useMemo(
        () => toolAssetLibraryItemsFromAssets(assets.filter((asset): asset is ImageAsset | VideoAsset => asset.kind === "image" || asset.kind === "video")),
        [assets],
    );

    // 结果面板只认落库任务：刷新后由 hydrate 用 storageKey 复原真实字节，再交给共享 ToolResult。
    const storedTasks = useToolTaskStore((state) => state.tasks);
    const tasksHydrated = useToolTaskStore((state) => state.hydrated);
    const hydrateTasks = useToolTaskStore((state) => state.hydrate);
    const toolTasks = useMemo(
        () => Object.values(storedTasks).filter((task) => task.toolId === AI_DRESSING_V2_TOOL_ID),
        [storedTasks],
    );
    const panelTask = useMemo(() => dressingResultPanelTask(toolTasks), [toolTasks]);

    useEffect(() => {
        if (!tasksHydrated) hydrateTasks();
    }, [tasksHydrated, hydrateTasks]);

    useEffect(() => {
        let alive = true;
        void (async () => {
            const draft = await hydrate(AI_DRESSING_V2_TOOL_ID);
            if (!alive) return;
            if (draft?.values && Object.keys(draft.values).length > 0) {
                setValues(normalizeDressingValues(draft.values));
            }
            setReady(true);
        })();
        return () => {
            alive = false;
        };
    }, [hydrate]);

    useEffect(() => {
        if (!ready) return;
        const timer = window.setTimeout(() => {
            patchDraft(AI_DRESSING_V2_TOOL_ID, { values: serializeDressingValues(values) });
            void flushDraft(AI_DRESSING_V2_TOOL_ID);
        }, DRAFT_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [values, ready, patchDraft, flushDraft]);

    const issues = useMemo(() => validateDressing(values), [values]);
    const blockedIssue = firstDressingError(issues);
    const slots = tabSlots(values.activeTab);

    const issueFor = useCallback((field: string) => dressingIssuesByField(issues, field)[0], [issues]);
    const poseIssue = issueFor("poses");

    const patchGarment = useCallback((slot: GarmentSlotKey, next: Partial<GarmentDraft>) => {
        setValues((prev) => ({
            ...prev,
            garments: { ...prev.garments, [slot]: { ...prev.garments[slot], ...next } },
        }));
    }, []);

    const pushStroke = useCallback((slot: GarmentSlotKey, stroke: MaskStroke) => {
        setValues((prev) => {
            const garment = prev.garments[slot];
            return {
                ...prev,
                garments: {
                    ...prev.garments,
                    [slot]: {
                        ...garment,
                        mask: { ...garment.mask, strokes: [...garment.mask.strokes, stroke] },
                        past: [...garment.past, garment.mask.strokes],
                        future: [],
                    },
                },
            };
        });
    }, []);

    const extendStroke = useCallback((slot: GarmentSlotKey, id: string, point: MaskPoint) => {
        setValues((prev) => {
            const garment = prev.garments[slot];
            return {
                ...prev,
                garments: {
                    ...prev.garments,
                    [slot]: {
                        ...garment,
                        mask: {
                            ...garment.mask,
                            strokes: garment.mask.strokes.map((stroke) =>
                                stroke.id === id ? { ...stroke, points: [...stroke.points, point] } : stroke,
                            ),
                        },
                    },
                },
            };
        });
    }, []);

    const maskHistory = useCallback((slot: GarmentSlotKey, direction: "undo" | "redo" | "clear") => {
        setValues((prev) => {
            const garment = prev.garments[slot];
            if (direction === "clear") {
                if (garment.mask.strokes.length === 0) return prev;
                return {
                    ...prev,
                    garments: {
                        ...prev.garments,
                        [slot]: { ...garment, mask: { ...garment.mask, strokes: [] }, past: [...garment.past, garment.mask.strokes], future: [] },
                    },
                };
            }
            if (direction === "undo") {
                const previous = garment.past[garment.past.length - 1];
                if (!previous) return prev;
                return {
                    ...prev,
                    garments: {
                        ...prev.garments,
                        [slot]: {
                            ...garment,
                            mask: { ...garment.mask, strokes: previous },
                            past: garment.past.slice(0, -1),
                            future: [garment.mask.strokes, ...garment.future],
                        },
                    },
                };
            }
            const next = garment.future[0];
            if (!next) return prev;
            return {
                ...prev,
                garments: {
                    ...prev.garments,
                    [slot]: {
                        ...garment,
                        mask: { ...garment.mask, strokes: next },
                        past: [...garment.past, garment.mask.strokes],
                        future: garment.future.slice(1),
                    },
                },
            };
        });
    }, []);

    const setTab = useCallback((tab: DressingTab) => setValues((prev) => switchTab(prev, tab)), []);

    const onPosesChange = useCallback((_ids: string[], records: ToolAssetRecord[]) => {
        const next: ModelPoseDraft[] = records.slice(0, DRESSING_MAX_POSES).map((record) => ({
            id: record.id,
            assetId: record.id,
            name: record.name,
            imageUrl: record.url,
            width: record.width ?? 0,
            height: record.height ?? 0,
        }));
        setValues((prev) => ({
            ...prev,
            poses: next,
            activePoseId: next.some((item) => item.id === prev.activePoseId) ? prev.activePoseId : next[0]?.id ?? "",
        }));
    }, []);

    const onGarmentChange = useCallback(
        (slot: GarmentSlotKey) => (_ids: string[], records: ToolAssetRecord[]) => {
            const record = records[0];
            if (!record) {
                // 换图/清空必须重建草稿，避免旧蒙版继续对应新图（蒙版与像素强绑定）。
                setValues((prev) => ({ ...prev, garments: { ...prev.garments, [slot]: createGarment(slot) } }));
                return;
            }
            setValues((prev) => ({
                ...prev,
                garments: {
                    ...prev.garments,
                    [slot]: fillGarmentMask(
                        {
                            ...prev.garments[slot],
                            assetId: record.id,
                            name: record.name,
                            imageUrl: record.url,
                            originUrl: record.url,
                            width: record.width ?? 0,
                            height: record.height ?? 0,
                        },
                        strokeId(),
                    ),
                },
            }));
        },
        [],
    );

    /** 配置栏上传按钮：按上传张数顺序落位到当前 Tab 的服装槽位（上装→下装→套装）。 */
    const onRailGarmentChange = useCallback(
        (_ids: string[], records: ToolAssetRecord[]) => {
            const order: GarmentSlotKey[] = tabSlots(values.activeTab);
            setValues((prev) => {
                const garments = { ...prev.garments };
                // 不在本次 Tab 的槽位草稿保留（切 Tab 草稿不丢），只重写参与提交的槽位。
                for (const slot of order) garments[slot] = createGarment(slot);
                records.slice(0, order.length).forEach((record, index) => {
                    const slot = order[index];
                    garments[slot] = fillGarmentMask(
                        {
                            ...createGarment(slot),
                            assetId: record.id,
                            name: record.name,
                            imageUrl: record.url,
                            originUrl: record.url,
                            width: record.width ?? 0,
                            height: record.height ?? 0,
                        },
                        strokeId(),
                    );
                });
                return { ...prev, garments };
            });
        },
        [values.activeTab],
    );

    const pointOf = useCallback((event: ReactPointerEvent<HTMLDivElement>): MaskPoint => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
        const y = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0;
        return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
    }, []);

    const startStroke = useCallback(
        (slot: GarmentSlotKey) => (event: ReactPointerEvent<HTMLDivElement>) => {
            if (event.button !== 0) return;
            const garment = values.garments[slot];
            if (!garment.imageUrl) return;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            const stroke: MaskStroke = {
                id: strokeId(),
                tool: "brush",
                size: Math.max(8, Math.round(garment.mask.brushSize || 64)),
                points: [pointOf(event)],
            };
            dragRef.current = { slot, id: stroke.id };
            pushStroke(slot, stroke);
        },
        [pointOf, pushStroke, values.garments],
    );

    const moveStroke = useCallback(
        (slot: GarmentSlotKey) => (event: ReactPointerEvent<HTMLDivElement>) => {
            const drag = dragRef.current;
            if (!drag || drag.slot !== slot) return;
            extendStroke(slot, drag.id, pointOf(event));
        },
        [extendStroke, pointOf],
    );

    const endStroke = useCallback(() => {
        dragRef.current = null;
    }, []);

    const applyCase = useCallback(async (item: ToolCase) => {
        setApplyingCaseId(item.id);
        setError(null);
        try {
            const assets = await uploadCaseFiles(item);
            const model = assets.model;
            const garment = assets.garment;
            if (!model || Array.isArray(model) || !garment || Array.isArray(garment)) {
                throw new Error("该案例缺少单张模特图或服装图，无法适配当前工作区槽位。");
            }
            const apply = item.apply ?? {};
            const modelPose: ModelPoseDraft = {
                id: model.id,
                assetId: model.id,
                name: model.name,
                imageUrl: model.url,
                width: model.width ?? 0,
                height: model.height ?? 0,
            };
            const modelStyle = typeof apply.modelStyle === "string" ? apply.modelStyle : "";
            // 单张案例服装图不能凭空拆成上下装：连体/裙装/泳衣进套装槽；上装（含上下装组合图）进上装槽，不伪造另一件服装。
            const garmentSlot: GarmentSlotKey = /(?:连体|连衣裙|泳衣|吊带)/u.test(modelStyle) ? "suit" : "upper";
            const garmentDraft = fillGarmentMask({
                ...createGarment(garmentSlot),
                assetId: garment.id,
                name: garment.name,
                imageUrl: garment.url,
                originUrl: garment.url,
                width: garment.width ?? 0,
                height: garment.height ?? 0,
            }, `case-${item.id}-full-mask`);
            const modelType = /(?:男童|女童|儿童)/u.test(modelStyle)
                ? "kid"
                : /(?:男士|女士)/u.test(modelStyle)
                  ? "adult"
                  : values.modelType;
            const provider =
                typeof apply.provider === "number"
                    ? String(apply.provider)
                    : typeof apply.provider === "string"
                      ? apply.provider
                      : apply.provider === null
                        ? ""
                        : values.provider;
            const next: DressingValues = {
                ...values,
                activeTab: garmentSlot === "suit" ? "suit" : "upper-lower",
                poses: [modelPose],
                activePoseId: modelPose.id,
                garments: { ...values.garments, [garmentSlot]: garmentDraft },
                modelType,
                provider,
                outputNum: typeof apply.outputNum === "number" ? apply.outputNum : values.outputNum,
                version: typeof apply.version === "string" ? apply.version : values.version,
                isSecondOperate: typeof apply.isSecondOperate === "boolean" ? apply.isSecondOperate : values.isSecondOperate,
            };
            setValues(next);
            patchDraft(AI_DRESSING_V2_TOOL_ID, { values: serializeDressingValues(next) });
            await flushDraft(AI_DRESSING_V2_TOOL_ID);
            setOutcomes([]);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setApplyingCaseId(null);
        }
    }, [flushDraft, patchDraft, values]);

    /** 「或试试这些」：示例平铺图真实入库，按原站 alt（上装/下装）落到对应槽位。 */
    const [demoBusy, setDemoBusy] = useState<string | null>(null);
    const pickDemo = useCallback(async (src: string, index: number) => {
        const slot: GarmentSlotKey = DESIGN_TRY_DEMOS.dressing[index]?.slot === "lower" ? "down" : "upper";
        setDemoBusy(src);
        setError(null);
        try {
            const record = await uploadCaseFile(src, `linkfox-demo-dressing-${slot}`);
            setValues((prev) => switchTab(prev, "upper-lower"));
            onGarmentChange(slot)([record.id], [record]);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setDemoBusy(null);
        }
    }, [onGarmentChange]);

    const submit = useCallback(async () => {
        const first = firstDressingError(validateDressing(values));
        if (first) {
            setError(first.message);
            return;
        }
        setBusy(true);
        setError(null);
        setOutcomes([]);
        const port = createDressingRunPort();
        const collected: DressingUnitOutcome[] = [];
        try {
            await flushDraft(AI_DRESSING_V2_TOOL_ID);
            // 快照 revision：任务固化提交时的草稿版本（task.configSnapshot.draftRevision）。
            const draftRevision = useToolDraftStore.getState().drafts[AI_DRESSING_V2_TOOL_ID]?.revision ?? null;
            // 批量穿衣：一张模特参考一个单元，逐个提交；失败单元之后的不再自动继续，成功结果保留。
            for (const item of values.poses) {
                const unit = await buildDressingUnit(values, { poseId: item.id });
                if (unit.blockedReason) {
                    setError(unit.blockedReason);
                    break;
                }
                const outcome = await runDressingUnit(port, unit, { draftRevision }, effectiveModel);
                collected.push(outcome);
                setOutcomes([...collected]);
                if (item === values.poses[0]) setLastSnapshot(unit.snapshot);
                if (outcome.status !== "succeeded") break;
            }
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setBusy(false);
        }
    }, [values, flushDraft, effectiveModel]);

    /**
     * §5 部分失败恢复：按同一快照只重跑失败单元，已成功结果原样保留。
     * §5 「禁止盲目重复提交」：状态 unknown（超时/中断）时先走查询式恢复（recover/resume），
     * 只有拿到终态失败才允许真正重跑。
     */
    const retryOutcome = useCallback(
        async (outcome: DressingUnitOutcome) => {
            if (busy) return;
            if (outcome.status === "unknown") {
                setBusy(true);
                setError(null);
                try {
                    const taskStore = useToolTaskStore.getState();
                    if (outcome.taskId) {
                        // 先查询：resumeTask 走 gateway.waitForResult 的轮询/租约路径，不盲目重发请求。
                        const task = await taskStore.resumeTask(outcome.taskId, { timeoutMs: 60_000 });
                        const mapped = mapDressingTaskToOutcome(
                            { id: outcome.unitId, poseId: outcome.poseId, snapshotHash: outcome.snapshotHash } as never,
                            task,
                        );
                        setOutcomes((prev) =>
                            prev.map((item) =>
                                item.unitId === outcome.unitId ? { ...mapped, unitId: outcome.unitId } : item,
                            ),
                        );
                        if (mapped.status !== "unknown") return;
                    }
                    setError("任务状态未知：查询后仍未拿到终态，请先到模型服务商后台确认是否已受理，再决定是否重试");
                } catch (cause) {
                    setError(cause instanceof Error ? cause.message : String(cause));
                } finally {
                    setBusy(false);
                }
                return;
            }
            const pose = values.poses.find((item) => item.id === outcome.poseId);
            if (!pose) {
                setError("这张模特参考已不在当前列表，请重新提交整批任务");
                return;
            }
            setBusy(true);
            setError(null);
            const port = createDressingRunPort();
            try {
                const unit = await buildDressingUnit(values, { poseId: outcome.poseId });
                const next = await runDressingUnit(port, unit, {}, effectiveModel);
                setOutcomes((prev) => prev.map((item) => (item.unitId === outcome.unitId ? next : item)));
            } catch (cause) {
                setError(cause instanceof Error ? cause.message : String(cause));
            } finally {
                setBusy(false);
            }
        },
        [busy, values, effectiveModel],
    );

    const [resultTab, setResultTab] = useState<"result" | "cases" | "history">("result");
    const activeMaskGarment = maskModalSlot ? values.garments[maskModalSlot] : null;
    const activeMaskMeta = maskModalSlot ? slotMeta(maskModalSlot) : null;

    return (
        <section className={cn("relative flex h-full min-h-0 min-w-0 flex-col", className)} data-testid="ai-dressing-workspace">
            <ToolWorkspaceColumns
                configSide="left"
                className="min-h-0 flex-1 overflow-hidden"
                config={
                    <div className="flex h-full min-h-0 flex-col">
                        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 pb-2 pt-3" data-testid="dressing-form">
                            <h2 className="sr-only">AI 穿衣</h2>
                            {/* 原站 Tab 行：两个文字 Tab + 右端「图片规则」 */}
                            <div className="flex items-center justify-between border-b border-border/70 pb-2">
                                <div role="tablist" aria-label="穿衣模式" className="flex items-center gap-3" data-testid="dressing-tabs">
                                    {DRESSING_TABS.map((tab) => (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            role="tab"
                                            aria-selected={values.activeTab === tab.id}
                                            data-testid={`dressing-tab-${tab.id}`}
                                            onClick={() => setTab(tab.id)}
                                            className={cn(
                                                "relative h-[22px] text-[12px] leading-[22px] transition-colors",
                                                values.activeTab === tab.id
                                                    ? "font-medium text-foreground after:absolute after:inset-x-0 after:-bottom-[9px] after:h-[2px] after:rounded-full after:bg-foreground"
                                                    : "text-muted-foreground hover:text-foreground",
                                            )}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                                <ImageRulesPopover kind="dressing" testId="dressing-image-rules" />
                            </div>
                            {/* 原站 `_uploadCon`：灰底卡内上装 / 下装（或连体）虚线上传框纵排 + 「或试试这些」 */}
                            <div className="space-y-[10px] rounded-[8px] bg-muted px-[10px] pb-[10px] pt-[10px]">
                            {slots.map((slot) => {
                                const meta = slotMeta(slot);
                                const garment = values.garments[slot];
                                const maskIssue = issueFor(`${slot}.mask`);
                                return (
                                    <div
                                        key={slot}
                                        className="relative space-y-1.5"
                                        data-field={slot}
                                        data-testid={`dressing-garment-${slot}`}
                                    >
                                        <UploadPanelIcon className="top-[17px]" />
                                        <ToolAssetInput
                                            toolId={AI_DRESSING_V2_TOOL_ID}
                                            draftSlot={`garment-${slot}`}
                                            syncIds={garment.assetId ? [garment.assetId] : undefined}
                                            maxCount={1}
                                            constraints={UPLOAD_CONSTRAINTS}
                                            library={library}
                                            variant="linkfox"
                                            wide
                                            className={cn(DESIGN_UPLOAD_DROPZONE, "[&_[data-testid=tool-asset-dropzone]]:pt-[67px]")}
                                            dropLabel={`拖拽/粘贴 或 上传${meta.label}正面图`}
                                            hint="10M以内，384*384 ~ 4096*4096"
                                            onChange={onGarmentChange(slot)}
                                        />
                                        {garment.imageUrl ? (
                                            <div className="flex items-center justify-between rounded-[6px] border border-border/70 bg-card px-2 py-1.5">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <img
                                                        src={garment.imageUrl}
                                                        alt={meta.label}
                                                        className="size-10 shrink-0 rounded object-contain bg-muted"
                                                        draggable={false}
                                                    />
                                                    <div className="min-w-0">
                                                        <p className="truncate text-xs text-foreground">{garment.name || meta.label}</p>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            {garment.mask.strokes.length > 0 ? "已生成服装蒙版" : "待选区"}
                                                        </p>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    data-testid={`dressing-adjust-mask-${slot}`}
                                                    onClick={() => setMaskModalSlot(slot)}
                                                    className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-foreground transition hover:bg-accent"
                                                >
                                                    <SlidersHorizontal className="size-3" aria-hidden />
                                                    调整选区
                                                </button>
                                            </div>
                                        ) : null}
                                        {maskIssue ? <p className="text-[11px] leading-4 text-destructive">{maskIssue.message}</p> : null}
                                    </div>
                                );
                            })}
                            <TryDemoStrip demos={DESIGN_TRY_DEMOS.dressing} busySrc={demoBusy} disabled={busy} onPick={(src, index) => void pickDemo(src, index)} />
                            </div>
                            {/* 原站「上传多件衣服，开始批量穿衣」入口 */}
                            <button
                                type="button"
                                onClick={() => setModelOpen(true)}
                                className={DESIGN_OUTLINE_BUTTON}
                            >
                                上传多件衣服，开始批量穿衣
                                <ArrowRight aria-hidden="true" className="size-3.5" />
                            </button>
                            {/* 原站「选择穿衣模特」行卡：点击在配置列右侧弹出悬浮面板 */}
                            <div data-field="poses" data-testid="dressing-model-card">
                                <DesignRowCard
                                    image={values.poses[0]?.imageUrl ?? DESIGN_ICON_FEATURE}
                                    imageClassName="h-[79px] w-[59px] object-contain"
                                    title="选择穿衣模特"
                                    desc={values.poses.length ? `已选 ${values.poses.length} 张模特参考` : "穿衣的部位与模特参考"}
                                    open={modelOpen}
                                    onClick={() => setModelOpen((open) => !open)}
                                />
                                {poseIssue ? <p className="mt-1 text-[11px] leading-4 text-destructive">{poseIssue.message}</p> : null}
                            </div>
                            {modelOpen ? (
                                <div
                                    role="dialog"
                                    aria-label="选择穿衣模特"
                                    data-testid="dressing-model-panel"
                                    className="fixed left-[310px] top-[76px] z-40 w-[440px] max-w-[calc(100vw-324px)] rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-xl"
                                >
                                    <div className="mb-3 flex items-center justify-between">
                                        <div role="tablist" aria-label="模特来源" className="flex items-center gap-3 text-xs">
                                            {([
                                                ["library", "模特库"],
                                                ["upload", "上传模特"],
                                                ["history", "历史模特"],
                                            ] as const).map(([key, label]) => (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    role="tab"
                                                    aria-selected={modelPanelTab === key}
                                                    data-testid={`dressing-model-tab-${key}`}
                                                    onClick={() => setModelPanelTab(key)}
                                                    className={cn(
                                                        "border-b-2 pb-1 transition-colors",
                                                        modelPanelTab === key
                                                            ? "border-selected font-medium text-foreground"
                                                            : "border-transparent text-muted-foreground hover:text-foreground",
                                                    )}
                                                >
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            aria-label="关闭选择穿衣模特面板"
                                            onClick={() => setModelOpen(false)}
                                            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                        >
                                            <X className="size-4" />
                                        </button>
                                    </div>
                                    {modelPanelTab === "library" ? (
                                        <div className="space-y-2">
                                            <div className="grid max-h-[320px] grid-cols-4 gap-2 overflow-y-auto">
                                                {AI_DRESSING_GUIDE_CASES.map((item) => {
                                                    const modelSrc = typeof item.files?.model === "string" ? item.files.model : item.coverUrl;
                                                    return (
                                                        <button
                                                            key={item.id}
                                                            type="button"
                                                            onClick={async () => {
                                                                try {
                                                                    const record = await uploadCaseFile(modelSrc, `dressing-model-${item.id}`);
                                                                    onPosesChange([record.id], [record]);
                                                                    setModelOpen(false);
                                                                } catch (cause) {
                                                                    setError(cause instanceof Error ? cause.message : String(cause));
                                                                }
                                                            }}
                                                            className="overflow-hidden rounded-lg border border-border bg-card p-1 text-center transition hover:border-selected"
                                                        >
                                                            <img src={modelSrc} alt={item.title} className="aspect-[3/4] w-full rounded object-cover" />
                                                            <span className="mt-1 block truncate text-[11px] text-foreground">{item.title}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : modelPanelTab === "upload" ? (
                                        <div className="space-y-2">
                                            <ToolAssetInput
                                                toolId={AI_DRESSING_V2_TOOL_ID}
                                                draftSlot="poses"
                                                syncIds={values.poses.map((item) => item.id)}
                                                maxCount={DRESSING_MAX_POSES}
                                                constraints={UPLOAD_CONSTRAINTS}
                                                library={library}
                                                thirdAction={null}
                                                variant="linkfox"
                                                wide
                                                compact
                                                dropLabel="选择参考图"
                                                hint="10M以内，384*384 ~ 4096*4096"
                                                onChange={onPosesChange}
                                            />
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {values.poses.length > 0 ? (
                                                <div className="grid grid-cols-4 gap-2" data-testid="dressing-pose-list">
                                                    {values.poses.map((item) => (
                                                        <button
                                                            key={item.id}
                                                            type="button"
                                                            data-testid={`dressing-pose-${item.id}`}
                                                            onClick={() => {
                                                                setValues((prev) => ({ ...prev, activePoseId: item.id }));
                                                                setModelOpen(false);
                                                            }}
                                                            className={cn(
                                                                "overflow-hidden rounded-[6px] border-2",
                                                                values.activePoseId === item.id ? "border-selected" : "border-transparent",
                                                            )}
                                                        >
                                                            <img src={item.imageUrl} alt={item.name || "模特参考"} className="h-16 w-full object-cover" />
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="py-6 text-center text-xs text-muted-foreground">暂无历史模特，请先上传或从模特库选择</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : null}
                            {/* 原站「选择生成张数」1/2/3/4，默认选中 4 */}
                            <div className="space-y-1.5 pt-[10px]">
                                <p className="text-[12px] leading-[22px] text-muted-foreground">选择生成张数</p>
                                <div className="flex gap-2">
                                    {DRESSING_OUTPUT_OPTIONS.map((num) => (
                                        <button
                                            key={num}
                                            type="button"
                                            data-testid={`dressing-output-${num}`}
                                            aria-pressed={values.outputNum === num}
                                            onClick={() => setValues((prev) => ({ ...prev, outputNum: num }))}
                                            className={cn(
                                                "h-[26px] w-10 rounded-[4px] border text-[12px] leading-none transition",
                                                values.outputNum === num
                                                    ? "border-selected bg-selected-soft text-selected"
                                                    : "border-border text-muted-foreground hover:border-foreground/30",
                                            )}
                                        >
                                            {num}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {error ? (
                                <p className="text-[11px] leading-4 text-destructive" data-testid="dressing-error">
                                    {error}
                                </p>
                            ) : null}
                        </div>
                        {/* 原站「立即生成」固定在配置栏底部，不随内容滚动 */}
                        <div className="shrink-0 border-t border-border p-3" data-testid="dressing-submit-bar">
                            <button
                                type="button"
                                data-testid="dressing-submit"
                                disabled={busy || Boolean(blockedIssue)}
                                onClick={() => void submit()}
                                className="h-8 w-full rounded-[6px] bg-primary text-[13px] font-medium text-primary-foreground transition disabled:opacity-40"
                            >
                                {busy ? "正在生成…" : "立即生成"}
                            </button>
                            {blockedIssue && !busy ? (
                                <p className="mt-1.5 text-[11px] leading-4 text-destructive" data-testid="dressing-submit-blocked">
                                    {blockedIssue.message}
                                </p>
                            ) : null}
                        </div>
                    </div>
                }
            >
                <aside className="flex h-full min-h-0 flex-col" aria-label="生成结果与案例">
                    <div role="tablist" aria-label="结果区页签" className="flex h-11 shrink-0 items-center gap-5 border-b border-border bg-card px-4">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={resultTab === "result"}
                            data-testid="dressing-result-tab-result"
                            onClick={() => setResultTab("result")}
                            className={cn(
                                "relative flex h-11 items-center text-[12px] leading-5 transition-colors",
                                resultTab === "result" ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            生成结果
                            {resultTab === "result" ? <span className="absolute bottom-0 left-0 h-[2px] w-full rounded-full bg-foreground" /> : null}
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={resultTab === "cases"}
                            data-testid="dressing-result-tab-cases"
                            onClick={() => setResultTab("cases")}
                            className={cn(
                                "relative flex h-11 items-center text-[12px] leading-5 transition-colors",
                                resultTab === "cases" ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            优秀案例
                            {resultTab === "cases" ? <span className="absolute bottom-0 left-0 h-[2px] w-full rounded-full bg-foreground" /> : null}
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={resultTab === "history"}
                            data-testid="dressing-result-tab-history"
                            onClick={() => setResultTab("history")}
                            className={cn(
                                "ml-auto flex h-11 items-center text-[12px] leading-5 transition-colors",
                                resultTab === "history" ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            历史记录
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
                        {resultTab === "result" ? (
                            <>
                                {panelTask ? (
                                    <div data-testid="dressing-result-panel">
                                        <ToolResult task={panelTask} toolId={AI_DRESSING_V2_TOOL_ID} title="生成结果" projectTitle="AI穿衣结果" />
                                    </div>
                                ) : outcomes.length === 0 ? (
                                    <div className="flex min-h-[calc(100dvh-160px)] pt-[42px] flex-col items-center justify-center" data-testid="dressing-result-empty">
                                        {busy ? (
                                            <p className="text-[13px] leading-6 text-muted-foreground">正在生成，结果会出现在这里…</p>
                                        ) : (
                                            <ToolCaseGuide
                                                className={DESIGN_GUIDE_PORTRAIT}
                                                title="无需约模特，上传服装正面图，一键生成衣服上身效果~"
                                                cases={AI_DRESSING_GUIDE_CASES}
                                                applyingId={applyingCaseId}
                                                onApply={applyCase}
                                            />
                                        )}
                                    </div>
                                ) : null}
                                {outcomes.length > 0 && !panelTask ? (
                                    <div className="mt-2 space-y-2" data-testid="dressing-results">
                                        {outcomes.map((outcome) => {
                                            const view = dressingResultView(outcome, {
                                                tab: values.activeTab,
                                                currentHash: lastSnapshot ? dressingSnapshotHash(lastSnapshot) : undefined,
                                            });
                                            return (
                                                <div key={outcome.unitId} className="space-y-1 rounded-[6px] border border-border/70 p-2">
                                                    <p className="text-[11px] leading-4 text-muted-foreground">{view.caption}</p>
                                                    <p className="text-[12px] leading-5">{describeDressingOutcome(outcome)}</p>
                                                    {view.images.length > 0 ? (
                                                        <div className="grid grid-cols-4 gap-2">
                                                            {view.images.map((image, index) => {
                                                                const href = image.url || image.dataUrl;
                                                                if (!href) return null;
                                                                return (
                                                                    <a
                                                                        key={`${outcome.unitId}-${index}`}
                                                                        href={href}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className="block overflow-hidden rounded border border-border"
                                                                        data-testid="dressing-result-link"
                                                                    >
                                                                        <img data-testid="tool-result-image" src={href} alt="结果" className="w-full" />
                                                                    </a>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : null}
                                                    {outcome.error ? (
                                                        <p className="text-[11px] leading-4 text-destructive" role="alert">
                                                            {outcome.error.message}
                                                            {outcome.error.retryable ? (
                                                                <button
                                                                    type="button"
                                                                    data-testid={`dressing-retry-${outcome.poseId}`}
                                                                    disabled={busy}
                                                                    onClick={() => void retryOutcome(outcome)}
                                                                    className="ml-1 underline underline-offset-2 hover:text-foreground disabled:opacity-40"
                                                                >
                                                                    重试
                                                                </button>
                                                            ) : null}
                                                        </p>
                                                    ) : null}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : null}
                            </>
                        ) : null}
                        {resultTab === "cases" ? (
                            <div data-testid="ai-dressing-v2-cases">
                                <ToolCases
                                    cases={AI_DRESSING_V2_CASES}
                                    onApply={(item) => applyCase(item)}
                                    applyingId={applyingCaseId ?? undefined}
                                    className="[&>div]:[column-gap:8px] [&>div]:[column-width:200px] [&_[data-testid='tool-case-card']]:rounded-[6px]"
                                />
                            </div>
                        ) : null}
                        {resultTab === "history" ? (
                            <div data-testid="dressing-history">
                                <ToolTaskHistory toolId={AI_DRESSING_V2_TOOL_ID} limit={8} emptyHint="还没有 AI 穿衣任务记录" />
                            </div>
                        ) : null}
                    </div>
                </aside>
            </ToolWorkspaceColumns>

            {maskModalSlot && activeMaskGarment?.imageUrl ? (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="调整选区"
                    data-testid="dressing-mask-modal"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onClick={() => setMaskModalSlot(null)}
                >
                    <div
                        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-border px-4 py-3">
                            <div>
                                <h3 className="text-sm font-medium">调整选区 · {activeMaskMeta?.label ?? "服装"}</h3>
                                <p className="text-[11px] text-muted-foreground">涂抹需要保留的服装部位，或点击「整件」自动全选</p>
                            </div>
                            <button
                                type="button"
                                aria-label="关闭调整选区弹窗"
                                onClick={() => setMaskModalSlot(null)}
                                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                                <X className="size-4" />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                            <div className="relative mx-auto max-w-md overflow-hidden rounded-lg border border-border bg-muted">
                                <img
                                    src={activeMaskGarment.imageUrl}
                                    alt={activeMaskMeta?.label ?? "服装"}
                                    className="block max-h-[360px] w-full object-contain"
                                    draggable={false}
                                />
                                <div
                                    className="absolute inset-0 cursor-crosshair touch-none"
                                    onPointerDown={startStroke(maskModalSlot)}
                                    onPointerMove={moveStroke(maskModalSlot)}
                                    onPointerUp={endStroke}
                                    onPointerCancel={endStroke}
                                    onPointerLeave={endStroke}
                                >
                                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
                                        {activeMaskGarment.mask.strokes.map((stroke) => (
                                            <polyline
                                                key={stroke.id}
                                                points={stroke.points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")}
                                                fill="none"
                                                stroke="rgba(56,189,248,0.45)"
                                                strokeWidth={(stroke.size / Math.max(1, activeMaskGarment.width)) * 100}
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                        ))}
                                    </svg>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                <button
                                    type="button"
                                    data-testid={`dressing-fill-${maskModalSlot}`}
                                    onClick={() =>
                                        setValues((prev) => ({
                                            ...prev,
                                            garments: {
                                                ...prev.garments,
                                                [maskModalSlot]: fillGarmentMask(prev.garments[maskModalSlot], strokeId()),
                                            },
                                        }))
                                    }
                                    className="rounded border border-border px-2.5 py-1 hover:bg-accent"
                                >
                                    整件
                                </button>
                                <button
                                    type="button"
                                    disabled={activeMaskGarment.past.length === 0}
                                    onClick={() => maskHistory(maskModalSlot, "undo")}
                                    className="rounded border border-border px-2.5 py-1 hover:bg-accent disabled:opacity-40"
                                >
                                    撤销
                                </button>
                                <button
                                    type="button"
                                    disabled={activeMaskGarment.future.length === 0}
                                    onClick={() => maskHistory(maskModalSlot, "redo")}
                                    className="rounded border border-border px-2.5 py-1 hover:bg-accent disabled:opacity-40"
                                >
                                    重做
                                </button>
                                <button
                                    type="button"
                                    disabled={activeMaskGarment.mask.strokes.length === 0}
                                    onClick={() => maskHistory(maskModalSlot, "clear")}
                                    className="rounded border border-border px-2.5 py-1 hover:bg-accent disabled:opacity-40"
                                >
                                    清空
                                </button>
                                <label className="flex items-center gap-1">
                                    <input
                                        type="checkbox"
                                        checked={activeMaskGarment.mask.inverted}
                                        onChange={(event) =>
                                            patchGarment(maskModalSlot, { mask: { ...activeMaskGarment.mask, inverted: event.target.checked } })
                                        }
                                    />
                                    反向
                                </label>
                                <label className="flex items-center gap-1">
                                    <input
                                        type="checkbox"
                                        checked={activeMaskGarment.mask.autoExpand}
                                        onChange={(event) =>
                                            patchGarment(maskModalSlot, { mask: { ...activeMaskGarment.mask, autoExpand: event.target.checked } })
                                        }
                                    />
                                    扩边
                                </label>
                            </div>
                        </div>
                        <div className="flex items-center justify-end border-t border-border px-4 py-3">
                            <button
                                type="button"
                                onClick={() => setMaskModalSlot(null)}
                                className="h-8 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                            >
                                完成
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
}

export default DressingWorkspace;
