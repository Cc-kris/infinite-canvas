/**
 * TASK-026：AI 穿衣工作区（AI_DRESSING_V2）。
 *
 * 交付面（真实边界）：
 * - 两个 Tab（上下装衣服 / 连体衣服）只决定哪些服装槽位参与生成，切 Tab 不清空另一侧草稿；
 * - 模特参考与服装图都走真实资产落库再取 URL，不做假上传占位；
 * - 每个服装槽位的蒙版必须真实涂抹（或点「整件」），空蒙版会拦住提交；
 * - 提交由适配器构建单元 → 共享任务网关真跑，返回空结果即判失败，不补造成片。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolCases, type ToolCase } from "@/components/tools/tool-cases";
import { WatermarkGroupPanel } from "@/components/tools/watermark-group-panel";
import { OrigRail, WEAR_RAIL } from "@/components/tools/workspaces/orig-rail";
import { ToolResult } from "@/components/tools/tool-result";
import { dressingResultPanelTask } from "@/features/tools/adapters/ai-dressing-v2";
import { useToolTaskStore } from "@/stores/use-tool-task-store";
import { cn } from "@/lib/utils";
import {
    AI_DRESSING_V2_TOOL_ID,
    DRESSING_MAX_POSES,
    DRESSING_MIN_MASK_COVERAGE,
    DRESSING_MODEL_TYPES,
    DRESSING_NAME_MAX,
    DRESSING_OUTPUT_OPTIONS,
    DRESSING_PROMPT_MAX,
    DRESSING_TABS,
    DRESSING_UPLOAD_LIMITS,
    DRESSING_VERSION_OPTIONS,
    activePose,
    createDressingValues,
    createGarment,
    dressingIssuesByField,
    fillGarmentMask,
    firstDressingError,
    garmentMaskCoverage,
    garmentMaskEmpty,
    normalizeDressingValues,
    normalizeModelType,
    serializeDressingValues,
    slotMeta,
    switchTab,
    tabLabel,
    tabSlots,
    validateDressing,
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
import {
    buildDressingUnit,
    createDressingRunPort,
    describeDressingOutcome,
    dressingResultView,
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
    const [values, setValues] = useState<DressingValues>(() => createDressingValues());
    const [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [outcomes, setOutcomes] = useState<DressingUnitOutcome[]>([]);
    const [workspaceTab, setWorkspaceTab] = useState<"settings" | "cases">("settings");
    const [applyingCaseId, setApplyingCaseId] = useState<string | null>(null);
    const dragRef = useRef<{ slot: GarmentSlotKey; id: string } | null>(null);

    const hydrate = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const flushDraft = useToolDraftStore((state) => state.flush);

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
    const pose = activePose(values);

    const issueFor = useCallback((field: string) => dressingIssuesByField(issues, field)[0], [issues]);

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
            // 单张案例服装图不能凭空拆成上下装：连体/裙装/泳衣与明确的两件套保留在「套装」槽，明确上装才进上装槽；未知样式也保留原图到套装槽。
            const garmentSlot: GarmentSlotKey = /(?:连体|连衣裙|泳衣|抹胸-长裤|短袖-长裤)/u.test(modelStyle)
                ? "suit"
                : /(?:短袖|大衣|外套)/u.test(modelStyle)
                  ? "upper"
                  : "suit";
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
            setWorkspaceTab("settings");
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
            for (const item of values.poses) {
                const unit = await buildDressingUnit(values, { poseId: item.id });
                const outcome = await runDressingUnit(port, unit);
                collected.push(outcome);
                setOutcomes([...collected]);
                if (outcome.status !== "succeeded") break;
            }
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setBusy(false);
        }
    }, [values]);

    const [tourVisible, setTourVisible] = useState(true);

    const [railReady, setRailReady] = useState(false);
    useEffect(() => {
        setRailReady(true);
    }, []);

    return (
        <section className={cn("min-w-0", className)} data-testid="ai-dressing-workspace">
            {/* OrigRail 内部用 react-router Link；SSR 单测无 Router 上下文，故挂载后再渲染 */}
            {railReady ? <OrigRail items={WEAR_RAIL} active="AI穿衣" driver testId="dressing-rail" className="mb-2" /> : null}
            <div className="flex h-[calc(100dvh-193px)] min-h-[560px] w-full overflow-hidden rounded-[8px] border border-black/[0.06] bg-card">
                {/* 左栏：原站表单列（图片规则 / Tab / 生成张数 / 立即生成） */}
                <div className="flex h-full w-[318px] shrink-0 flex-col border-r border-border">
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3 pt-3">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-[15px] font-semibold leading-6">AI 穿衣</h2>
                            <button
                                type="button"
                                data-testid="dressing-image-rules"
                                className="text-[11px] leading-4 text-muted-foreground underline-offset-2 hover:underline"
                            >
                                图片规则
                            </button>
                        </div>
                        <p className="text-[11px] leading-4 text-muted-foreground">10M以内，384*384 ~ 4096*4096</p>
                        <div role="tablist" aria-label="穿衣模式" className="flex gap-2" data-testid="dressing-tabs">
                            {DRESSING_TABS.map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={values.activeTab === tab.id}
                                    data-testid={`dressing-tab-${tab.id}`}
                                    onClick={() => setTab(tab.id)}
                                    className={cn(
                                        "flex-1 rounded-[6px] px-3 py-1.5 text-[12px] leading-4 transition",
                                        values.activeTab === tab.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                                    )}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        <p className="text-[11px] leading-4 text-muted-foreground">无需约模特，上传服装正面图，一键生成衣服上身效果~</p>
                        {tourVisible ? (
                            <div
                                className="flex items-start justify-between gap-2 rounded-[6px] border border-dashed px-2 py-1.5"
                                data-testid="dressing-tour"
                            >
                                <span className="text-[11px] leading-4">第一步：选择示例图或上传平铺服装图片（支持仅上传上/下装图）</span>
                                <button
                                    type="button"
                                    onClick={() => setTourVisible(false)}
                                    className="shrink-0 text-[11px] leading-4 text-muted-foreground hover:text-foreground"
                                >
                                    我是高手，不再提醒
                                </button>
                            </div>
                        ) : null}
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
                                            "h-7 w-9 rounded-[6px] border text-[12px] leading-4 transition",
                                            values.outputNum === num
                                                ? "border-primary bg-primary/10 text-primary"
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
                        {/* 原站面板无这些参数：收进「高级参数」折叠区，默认不占面板文案 */}
                        <details className="rounded-[6px] border border-border/70 px-2 py-1.5">
                            <summary className="flex cursor-pointer list-none items-center gap-1" aria-label="高级参数">
                                <svg viewBox="0 0 16 16" className="h-3 w-3 text-muted-foreground" aria-hidden="true">
                                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                                </svg>
                            </summary>
                            <div className="mt-2 space-y-2">
                                <div className="grid gap-2 sm:grid-cols-2">
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
                                        <span className="text-muted-foreground">版本</span>
                                        <select
                                            value={values.version}
                                            onChange={(event) => setValues((prev) => ({ ...prev, version: event.target.value }))}
                                            className="w-full rounded-[6px] border border-border px-2 py-1 text-[12px]"
                                        >
                                            {DRESSING_VERSION_OPTIONS.map((item) => (
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
                                    <label className="space-y-1 text-[11px] leading-4">
                                        <span className="text-muted-foreground">服务商</span>
                                        <input
                                            value={values.provider}
                                            onChange={(event) => setValues((prev) => ({ ...prev, provider: event.target.value }))}
                                            className="w-full rounded-[6px] border border-border px-2 py-1 text-[12px]"
                                        />
                                    </label>
                                </div>
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
                    </div>
                    <div className="border-t border-border p-3">
                        <button
                            type="button"
                            data-testid="dressing-submit"
                            disabled={busy || Boolean(blockedIssue)}
                            onClick={() => void submit()}
                            className="w-full rounded-[6px] bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition disabled:opacity-40"
                        >
                            <span className="mr-1">立即生成</span>
                            <span className="text-[11px] opacity-80">(40算力)</span>
                        </button>
                    </div>
                </div>

                {/* 中栏：选择穿衣模特 + 服装上传（原站「穿衣的部位与模特参考」） */}
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3" data-testid="dressing-form">
                    <div className="grid gap-4 xl:grid-cols-2">
                        <div className="space-y-2" data-field="poses">
                            <h3 className="text-[12px] font-medium leading-5">选择穿衣模特</h3>
                            <ToolAssetInput
                                toolId={AI_DRESSING_V2_TOOL_ID}
                                maxCount={DRESSING_MAX_POSES}
                                constraints={UPLOAD_CONSTRAINTS}
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
                                            <img src={item.imageUrl} alt={item.name || "模特参考"} className="h-16 w-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                            {null}
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-[12px] font-medium leading-5">穿衣的部位与模特参考</h3>
                            <p className="text-[11px] leading-4 text-muted-foreground">上传多件衣服，开始批量穿衣</p>
                            <p className="text-[11px] leading-4 text-muted-foreground">上传平铺服装图</p>
                            <div className="grid gap-3 sm:grid-cols-2">
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
                                                maxCount={1}
                                                constraints={UPLOAD_CONSTRAINTS}
                                                variant="linkfox"
                                                wide
                                                compact
                                                dropLabel={
                                                    slot === "down" ? "拖拽/粘贴 或 上传下装正面图" : "拖拽/粘贴 或 上传上装正面图"
                                                }
                                                hint="10M以内，384*384 ~ 4096*4096"
                                                onChange={onGarmentChange(slot)}
                                            />
                                            {garment.imageUrl ? (
                                                <>
                                                    <div className="relative overflow-hidden rounded-[6px] border border-border/70">
                                                        <img
                                                            src={garment.imageUrl}
                                                            alt={meta.label}
                                                            className="block max-h-[140px] w-full object-contain"
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
                            </div>
                        </div>
                    </div>
                </div>

                {/* 右栏：生成结果 / 或试试这些 / 管理水印分组 */}
                <aside className="flex h-full w-[318px] shrink-0 flex-col border-l border-border" aria-label="生成结果与案例">
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-3">
                        <h3 className="mb-2 text-[12px] font-medium leading-5">生成结果</h3>
                        {panelTask ? (
                            <div data-testid="dressing-result-panel">
                                <ToolResult task={panelTask} toolId={AI_DRESSING_V2_TOOL_ID} title="生成结果" projectTitle="AI穿衣结果" />
                            </div>
                        ) : null}
                        {outcomes.length > 0 ? (
                            <div className="space-y-2" data-testid="dressing-results">
                                {outcomes.map((outcome) => {
                                    const view = dressingResultView(outcome, { tab: values.activeTab });
                                    return (
                                        <div key={outcome.unitId} className="space-y-1 rounded-[6px] border border-border/70 p-2">
                                            <p className="text-[11px] leading-4 text-muted-foreground">{view.caption}</p>
                                            <p className="text-[12px] leading-5">{describeDressingOutcome(outcome)}</p>
                                            {view.stale ? <p className="text-[11px] leading-4 text-amber-600">表单已改动，这批结果对应旧快照。</p> : null}
                                            {view.images.length > 0 ? (
                                                <div className="grid grid-cols-2 gap-2">
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
                                                                <img
                                                                    data-testid="tool-result-image"
                                                                    src={href}
                                                                    alt="结果"
                                                                    className="w-full"
                                                                />
                                                            </a>
                                                        );
                                                    })}
                                                </div>
                                            ) : null}
                                            {outcome.error ? <p className="text-[11px] leading-4 text-destructive">{outcome.error.message}</p> : null}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : null}
                        <h3 className="mb-2 mt-3 text-[12px] font-medium leading-5">或试试这些</h3>
                        <div data-testid="ai-dressing-v2-cases">
                            <div className="columns-2 gap-2 [&>*]:mb-2">
                                {AI_DRESSING_V2_CASES.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => void applyCase(item)}
                                        className="block w-full overflow-hidden rounded-[6px] border border-border/60 bg-muted/30"
                                    >
                                        <img src={item.result} alt={`优秀案例-${item.id}`} className="h-auto w-full object-cover" loading="lazy" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="border-t border-border p-2">
                        <WatermarkGroupPanel />
                    </div>
                </aside>
            </div>
        </section>
    );
}


export default DressingWorkspace;
