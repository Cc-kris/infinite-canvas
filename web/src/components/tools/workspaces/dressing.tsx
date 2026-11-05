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
import { ChevronRight, UserRound } from "lucide-react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolCases, type ToolCase } from "@/components/tools/tool-cases";
import { ImageRulesPopover } from "@/components/tools/image-rules-popover";
import { OrigRail, WEAR_RAIL } from "@/components/tools/workspaces/orig-rail";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { resolveModelChannel, useConfigStore } from "@/stores/use-config-store";
import { dressingResultPanelTask } from "@/features/tools/adapters/ai-dressing-v2";
import { useToolTaskStore } from "@/stores/use-tool-task-store";
import { cn } from "@/lib/utils";
import {
    AI_DRESSING_V2_TOOL_ID,
    DRESSING_MAX_POSES,
    DRESSING_MODEL_TYPES,
    DRESSING_NAME_MAX,
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
    normalizeModelType,
    serializeDressingValues,
    slotMeta,
    switchTab,
    tabLabel,
    tabSlots,
    validateDressing,
    type DressingGarmentSnapshot,
    type DressingSnapshot,
    type DressingTab,
    type DressingValues,
    type GarmentDraft,
    type GarmentSlotKey,
    type ModelPoseDraft,
} from "@/features/tools/registry/ai-dressing-v2";
import type { MaskPoint, MaskStroke } from "@/features/tools/registry/area-repair";
import { uploadCaseFiles } from "@/features/tools/case-apply";
import { AI_DRESSING_V2_CASES } from "@/features/tools/tool-cases-data";
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
    /** 原站「选择穿衣模特」是一张可展开的行卡，默认收起。 */
    const [modelOpen, setModelOpen] = useState(false);
    const dragRef = useRef<{ slot: GarmentSlotKey; id: string } | null>(null);

    const hydrate = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const flushDraft = useToolDraftStore((state) => state.flush);
    // provider 为空 = 跟随当前模型配置；提交时把解析出的渠道写进 model，网关才有真实执行渠道。
    const config = useConfigStore((state) => state.config);
    const imageModel = useConfigStore((state) => state.config.imageModel);
    const effectiveModel = values.provider.trim() || (imageModel ?? "");
    const resolvedProvider = useMemo(() => {
        if (!effectiveModel.trim()) return "";
        try {
            return resolveModelChannel(config, effectiveModel).apiFormat;
        } catch {
            return "";
        }
    }, [config, effectiveModel]);

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
            patchGarment(slot, {
                assetId: record.id,
                name: record.name,
                imageUrl: record.url,
                originUrl: record.url,
                width: record.width ?? 0,
                height: record.height ?? 0,
            });
        },
        [patchGarment],
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
                    garments[slot] = {
                        ...createGarment(slot),
                        assetId: record.id,
                        name: record.name,
                        imageUrl: record.url,
                        originUrl: record.url,
                        width: record.width ?? 0,
                        height: record.height ?? 0,
                    };
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

    const [railReady, setRailReady] = useState(false);
    useEffect(() => {
        setRailReady(true);
    }, []);

    return (
        <section className={cn("flex h-full min-h-0 min-w-0 flex-col", className)} data-testid="ai-dressing-workspace">
            {/* OrigRail 内部用 react-router Link；SSR 单测无 Router 上下文，故挂载后再渲染 */}
            {railReady ? <OrigRail items={WEAR_RAIL} active="AI穿衣" driver testId="dressing-rail" className="mb-2 shrink-0" /> : null}
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
                                                    ? "font-medium text-primary after:absolute after:inset-x-0 after:-bottom-[9px] after:h-[2px] after:rounded-full after:bg-primary"
                                                    : "text-muted-foreground hover:text-foreground",
                                            )}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                                <ImageRulesPopover kind="dressing" testId="dressing-image-rules" />
                            </div>
                            <p className="text-[11px] leading-4 text-muted-foreground">上传多件衣服，开始批量穿衣</p>
                            {/* 原站配置栏是单列 268：上装卡 / 下装卡（或连体卡）纵排 */}
                            {slots.map((slot) => {
                                const meta = slotMeta(slot);
                                const garment = values.garments[slot];
                                const maskIssue = issueFor(`${slot}.mask`);
                                return (
                                    <div
                                        key={slot}
                                        className="space-y-1.5 rounded-[8px] border border-border/70 p-2"
                                        data-field={slot}
                                        data-testid={`dressing-garment-${slot}`}
                                    >
                                        <ToolAssetInput
                                            toolId={AI_DRESSING_V2_TOOL_ID}
                                            draftSlot={`garment-${slot}`}
                                            syncIds={garment.assetId ? [garment.assetId] : undefined}
                                            maxCount={1}
                                            constraints={UPLOAD_CONSTRAINTS}
                                            library={library}
                                            variant="linkfox"
                                            wide
                                            compact
                                            dropLabel={`拖拽/粘贴 或 上传${meta.label}正面图`}
                                            hint="10M以内，384*384 ~ 4096*4096"
                                            onChange={onGarmentChange(slot)}
                                        />
                                        {garment.imageUrl ? (
                                            <>
                                                <div className="relative overflow-hidden rounded-[6px] border border-border/70">
                                                    <img
                                                        src={garment.imageUrl}
                                                        alt={meta.label}
                                                        className="block max-h-[150px] w-full object-contain"
                                                        draggable={false}
                                                    />
                                                    <div
                                                        className="absolute inset-0 cursor-crosshair touch-none"
                                                        onPointerDown={startStroke(slot)}
                                                        onPointerMove={moveStroke(slot)}
                                                        onPointerUp={endStroke}
                                                        onPointerCancel={endStroke}
                                                        onPointerLeave={endStroke}
                                                    >
                                                        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
                                                            {garment.mask.strokes.map((stroke) => (
                                                                <polyline
                                                                    key={stroke.id}
                                                                    points={stroke.points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")}
                                                                    fill="none"
                                                                    stroke="rgba(56,189,248,0.45)"
                                                                    strokeWidth={(stroke.size / Math.max(1, garment.width)) * 100}
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                />
                                                            ))}
                                                        </svg>
                                                    </div>
                                                </div>
                                                <details className="rounded-[6px] border border-border/70 px-2 py-1">
                                                    <summary className="flex cursor-pointer list-none items-center gap-1" aria-label="蒙版工具">
                                                        <svg viewBox="0 0 16 16" className="h-3 w-3 text-muted-foreground" aria-hidden="true">
                                                            <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                                                        </svg>
                                                        <span className="text-[11px] leading-4 text-muted-foreground">涂抹需贴合的部位，或点「整件」</span>
                                                    </summary>
                                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] leading-4">
                                                        <button
                                                            type="button"
                                                            data-testid={`dressing-fill-${slot}`}
                                                            disabled={!garment.imageUrl}
                                                            onClick={() =>
                                                                setValues((prev) => ({
                                                                    ...prev,
                                                                    garments: {
                                                                        ...prev.garments,
                                                                        [slot]: fillGarmentMask(prev.garments[slot], strokeId()),
                                                                    },
                                                                }))
                                                            }
                                                            className="rounded border border-border px-2 py-0.5 disabled:opacity-40"
                                                        >
                                                            整件
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={garment.past.length === 0}
                                                            onClick={() => maskHistory(slot, "undo")}
                                                            className="rounded border border-border px-2 py-0.5 disabled:opacity-40"
                                                        >
                                                            撤销
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={garment.future.length === 0}
                                                            onClick={() => maskHistory(slot, "redo")}
                                                            className="rounded border border-border px-2 py-0.5 disabled:opacity-40"
                                                        >
                                                            重做
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={garment.mask.strokes.length === 0}
                                                            onClick={() => maskHistory(slot, "clear")}
                                                            className="rounded border border-border px-2 py-0.5 disabled:opacity-40"
                                                        >
                                                            清空
                                                        </button>
                                                        <label className="flex items-center gap-1">
                                                            <input
                                                                type="checkbox"
                                                                checked={garment.mask.inverted}
                                                                onChange={(event) =>
                                                                    patchGarment(slot, { mask: { ...garment.mask, inverted: event.target.checked } })
                                                                }
                                                            />
                                                            反向
                                                        </label>
                                                        <label className="flex items-center gap-1">
                                                            <input
                                                                type="checkbox"
                                                                checked={garment.mask.autoExpand}
                                                                onChange={(event) =>
                                                                    patchGarment(slot, { mask: { ...garment.mask, autoExpand: event.target.checked } })
                                                                }
                                                            />
                                                            扩边
                                                        </label>
                                                    </div>
                                                </details>
                                            </>
                                        ) : null}
                                        {maskIssue ? <p className="text-[11px] leading-4 text-destructive">{maskIssue.message}</p> : null}
                                    </div>
                                );
                            })}
                            {/* 原站「或试试这些」：四张服装图缩略，点击即真实做同款 */}
                            <div className="space-y-1.5">
                                <p className="text-[11px] leading-4 text-muted-foreground">或试试这些</p>
                                <div className="grid grid-cols-4 gap-2">
                                    {AI_DRESSING_V2_CASES.slice(0, 4).map((item) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => void applyCase(item)}
                                            disabled={applyingCaseId !== null}
                                            className="overflow-hidden rounded-[4px] border border-border/70 transition hover:border-primary/60 disabled:opacity-50"
                                        >
                                            <img
                                                src={item.params[0]?.src ?? item.result}
                                                alt={`优秀案例-${item.id}`}
                                                className="aspect-square w-full object-cover"
                                            />
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* 原站「选择穿衣模特」行卡：缩略图 + 标题 + 副标题 + 展开箭头 */}
                            <div className="rounded-[8px] border border-dashed border-border px-2 py-2" data-field="poses" data-testid="dressing-model-card">
                                <button
                                    type="button"
                                    aria-expanded={modelOpen}
                                    onClick={() => setModelOpen((open) => !open)}
                                    className="flex w-full items-center gap-2 text-left"
                                >
                                    {values.poses[0] ? (
                                        <img
                                            src={values.poses[0].imageUrl}
                                            alt={values.poses[0].name || "模特参考"}
                                            className="size-9 shrink-0 rounded-[6px] object-cover"
                                        />
                                    ) : (
                                        <span className="grid size-9 shrink-0 place-items-center rounded-[6px] bg-muted text-muted-foreground">
                                            <UserRound aria-hidden="true" className="size-4" strokeWidth={1.6} />
                                        </span>
                                    )}
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[12px] leading-5">选择穿衣模特</span>
                                        <span className="block truncate text-[11px] leading-4 text-muted-foreground">穿衣的部位与模特参考</span>
                                    </span>
                                    <ChevronRight
                                        aria-hidden="true"
                                        className={cn("size-4 shrink-0 text-muted-foreground transition-transform", modelOpen && "rotate-90")}
                                    />
                                </button>
                                {modelOpen ? (
                                    <div className="mt-2 space-y-2">
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
                                        {values.poses.length > 0 ? (
                                            <div className="grid grid-cols-4 gap-2" data-testid="dressing-pose-list">
                                                {values.poses.map((item) => (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        data-testid={`dressing-pose-${item.id}`}
                                                        onClick={() => setValues((prev) => ({ ...prev, activePoseId: item.id }))}
                                                        className={cn(
                                                            "overflow-hidden rounded-[6px] border-2",
                                                            values.activePoseId === item.id ? "border-primary" : "border-transparent",
                                                        )}
                                                    >
                                                        <img src={item.imageUrl} alt={item.name || "模特参考"} className="h-12 w-full object-cover" />
                                                    </button>
                                                ))}
                                            </div>
                                        ) : null}
                                        {poseIssue ? <p className="text-[11px] leading-4 text-destructive">{poseIssue.message}</p> : null}
                                    </div>
                                ) : null}
                            </div>
                            {/* 原站「选择生成张数」1/2/3/4，默认选中 4 */}
                            <div className="space-y-1.5">
                                <p className="text-[12px] leading-5">选择生成张数</p>
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
                                                    ? "border-primary text-primary"
                                                    : "border-border text-muted-foreground hover:border-foreground/30",
                                            )}
                                        >
                                            {num}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* 原站面板无这些参数：收进「高级参数」折叠区。模型渠道由全局配置决定，
                                provider/version 字段仅作渠道覆盖值传递（空 = 跟随配置），不在页面露出裸输入框。 */}
                            <details className="rounded-[6px] border border-border/70 px-2 py-1.5">
                                <summary className="cursor-pointer list-none text-[11px] leading-4 text-muted-foreground" aria-label="高级参数">
                                    高级参数
                                </summary>
                                <div className="mt-2 space-y-2">
                                    <div className="grid gap-2">
                                        <label className="space-y-1 text-[11px] leading-4">
                                            <span className="text-muted-foreground">模型类型</span>
                                            <select
                                                value={values.modelType}
                                                onChange={(event) => setValues((prev) => ({ ...prev, modelType: normalizeModelType(event.target.value) }))}
                                                className="w-full rounded-[6px] border border-border px-2 py-1 text-[12px]"
                                            >
                                                {DRESSING_MODEL_TYPES.map((item) => (
                                                    <option key={item.id} value={item.id}>
                                                        {item.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="space-y-1 text-[11px] leading-4">
                                            <span className="text-muted-foreground">任务名称</span>
                                            <input
                                                value={values.name}
                                                maxLength={DRESSING_NAME_MAX}
                                                onChange={(event) => setValues((prev) => ({ ...prev, name: event.target.value }))}
                                                className="w-full rounded-[6px] border border-border px-2 py-1 text-[12px]"
                                            />
                                        </label>
                                    </div>
                                    <p className="text-[11px] leading-4 text-muted-foreground">
                                        生成渠道跟随「设置 → 模型服务」的当前配置{resolvedProvider ? `（${resolvedProvider}）` : ""}。
                                    </p>
                                    <div className="flex flex-wrap gap-3 text-[11px] leading-4">
                                        <label className="flex items-center gap-1">
                                            <input
                                                type="checkbox"
                                                checked={values.genOriRes}
                                                onChange={(event) => setValues((prev) => ({ ...prev, genOriRes: event.target.checked }))}
                                            />
                                            保持原分辨率
                                        </label>
                                        <label className="flex items-center gap-1">
                                            <input
                                                type="checkbox"
                                                checked={values.isSecondOperate}
                                                onChange={(event) => setValues((prev) => ({ ...prev, isSecondOperate: event.target.checked }))}
                                            />
                                            二次操作
                                        </label>
                                    </div>
                                </div>
                            </details>
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
                                ) : (
                                    <div
                                        className="flex min-h-[420px] flex-col items-center justify-center gap-4 rounded-[8px] border border-dashed border-border px-6 py-10 text-center"
                                        data-testid="dressing-result-empty"
                                    >
                                        <p className="text-[13px] leading-6">
                                            {busy ? "正在生成，结果会出现在这里…" : "无需约模特，上传服装正面图，一键生成衣服上身效果~"}
                                        </p>
                                        <div className="grid w-full max-w-[560px] grid-cols-4 gap-2">
                                            {AI_DRESSING_V2_CASES.slice(0, 4).map((item) => (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    onClick={() => void applyCase(item)}
                                                    disabled={applyingCaseId !== null}
                                                    className="overflow-hidden rounded-[6px] border border-border/70 transition hover:border-primary/60 disabled:opacity-50"
                                                >
                                                    <img src={item.result} alt={`优秀案例-${item.id}`} className="aspect-[3/4] w-full object-cover" />
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            data-testid="dressing-apply-case"
                                            disabled={applyingCaseId !== null}
                                            onClick={() => void applyCase(AI_DRESSING_V2_CASES[0])}
                                            className="h-8 rounded-[6px] bg-primary px-5 text-[12px] font-medium text-primary-foreground transition disabled:opacity-50"
                                        >
                                            {applyingCaseId ? "正在套用…" : "一键做同款"}
                                        </button>
                                    </div>
                                )}
                                {outcomes.length > 0 ? (
                                    <div className="mt-2 space-y-2" data-testid="dressing-results">
                                        <details data-testid="dressing-snapshot" className="rounded-md border border-border/70 px-2 py-1.5">
                                            <summary className="cursor-pointer select-none text-[11px] leading-4 text-muted-foreground">查看本次输入快照</summary>
                                            {lastSnapshot ? (
                                                <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] leading-4 text-muted-foreground">
                                                    <dt>穿衣模式</dt>
                                                    <dd className="text-foreground">{tabLabel(lastSnapshot.tab)}</dd>
                                                    <dt>服装</dt>
                                                    <dd className="truncate text-foreground">
                                                        {lastSnapshot.garments.map((garment: DressingGarmentSnapshot) => garment.label).join("＋") || "—"}
                                                    </dd>
                                                    <dt>模特参考</dt>
                                                    <dd className="truncate text-foreground">{lastSnapshot.poseName || "—"}</dd>
                                                    <dt>张数</dt>
                                                    <dd className="text-foreground">{lastSnapshot.outputNum} 张</dd>
                                                    <dt>模型类型</dt>
                                                    <dd className="text-foreground">{lastSnapshot.modelType === "kid" ? "儿童模特" : "成人模特"}</dd>
                                                    <dt>保持原分辨率</dt>
                                                    <dd className="text-foreground">{lastSnapshot.genOriRes ? "开启" : "关闭"}</dd>
                                                </dl>
                                            ) : null}
                                        </details>
                                        {outcomes.map((outcome) => {
                                            const view = dressingResultView(outcome, {
                                                tab: values.activeTab,
                                                currentHash: lastSnapshot ? dressingSnapshotHash(lastSnapshot) : undefined,
                                            });
                                            return (
                                                <div key={outcome.unitId} className="space-y-1 rounded-[6px] border border-border/70 p-2">
                                                    <p className="text-[11px] leading-4 text-muted-foreground">{view.caption}</p>
                                                    <p className="text-[12px] leading-5">{describeDressingOutcome(outcome)}</p>
                                                    {view.stale ? <p className="text-[11px] leading-4 text-amber-600">表单已改动，这批结果对应旧快照。</p> : null}
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
                                {/* 复用共享案例卡：输入参考图缩略图（商品/参考图）+ 悬浮预览 + 真实「做同款」回填，套用失败有明确提示。 */}
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
        </section>
    );
}

export default DressingWorkspace;
