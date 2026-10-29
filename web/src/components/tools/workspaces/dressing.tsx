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
import { ToolResult } from "@/components/tools/tool-result";
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
    const dragRef = useRef<{ slot: GarmentSlotKey; id: string } | null>(null);

    const hydrate = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const flushDraft = useToolDraftStore((state) => state.flush);

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

    return (
        <section className={cn("space-y-5", className)} data-testid="ai-dressing-workspace">
            <header className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold">AI 穿衣</h2>
                    <span className="text-xs text-muted-foreground">图片限制：{DRESSING_UPLOAD_LIMITS.label}</span>
                </div>
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
                                "rounded-md px-3 py-1.5 text-sm",
                                values.activeTab === tab.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                            )}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">
                    当前模式：{tabLabel(values.activeTab)}｜参与生成：{slots.map((slot) => slotMeta(slot).label).join(" + ")}
                </p>
            </header>

            <div className="space-y-2" data-field="poses">
                <h3 className="text-sm font-medium">
                    模特参考（最多 {DRESSING_MAX_POSES} 张，当前 {values.poses.length} 张）
                </h3>
                <ToolAssetInput
                    toolId={AI_DRESSING_V2_TOOL_ID}
                    maxCount={DRESSING_MAX_POSES}
                    constraints={UPLOAD_CONSTRAINTS}
                    title="上传模特图"
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
                                    "overflow-hidden rounded-md border-2",
                                    values.activePoseId === item.id ? "border-primary" : "border-transparent",
                                )}
                            >
                                <img src={item.imageUrl} alt={item.name || "模特参考"} className="h-20 w-full object-cover" />
                            </button>
                        ))}
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground">还没有模特参考图，先上传才能生成。</p>
                )}
                {issueFor("poses") ? <p className="text-xs text-destructive">{issueFor("poses")?.message}</p> : null}
            </div>

            {slots.map((slot) => {
                const meta = slotMeta(slot);
                const garment = values.garments[slot];
                const coverage = garmentMaskCoverage(garment);
                const maskIssue = issueFor(`${slot}.mask`);
                return (
                    <div key={slot} className="space-y-2 rounded-lg border p-3" data-field={slot} data-testid={`dressing-garment-${slot}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-sm font-medium">{meta.label}</h3>
                            <span className="text-xs text-muted-foreground">
                                蒙版覆盖 {Math.round(coverage * 100)}%
                                {garmentMaskEmpty(garment) ? "（未标记）" : ""}
                            </span>
                        </div>
                        <ToolAssetInput
                            toolId={AI_DRESSING_V2_TOOL_ID}
                            maxCount={1}
                            constraints={UPLOAD_CONSTRAINTS}
                            title={`上传${meta.label}图`}
                            onChange={onGarmentChange(slot)}
                        />
                        {garment.imageUrl ? (
                            <div className="relative overflow-hidden rounded-md border">
                                <img src={garment.imageUrl} alt={meta.label} className="block w-full" draggable={false} />
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
                        ) : (
                            <p className="text-xs text-muted-foreground">{meta.uploadHint}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                            <button
                                type="button"
                                data-testid={`dressing-fill-${slot}`}
                                disabled={!garment.imageUrl}
                                onClick={() =>
                                    setValues((prev) => ({
                                        ...prev,
                                        garments: { ...prev.garments, [slot]: fillGarmentMask(prev.garments[slot], strokeId()) },
                                    }))
                                }
                                className="rounded border px-2 py-1 disabled:opacity-40"
                            >
                                整件
                            </button>
                            <button type="button" disabled={garment.past.length === 0} onClick={() => maskHistory(slot, "undo")} className="rounded border px-2 py-1 disabled:opacity-40">
                                撤销
                            </button>
                            <button type="button" disabled={garment.future.length === 0} onClick={() => maskHistory(slot, "redo")} className="rounded border px-2 py-1 disabled:opacity-40">
                                重做
                            </button>
                            <button type="button" disabled={garment.mask.strokes.length === 0} onClick={() => maskHistory(slot, "clear")} className="rounded border px-2 py-1 disabled:opacity-40">
                                清空
                            </button>
                            <label className="flex items-center gap-1">
                                <input
                                    type="checkbox"
                                    checked={garment.mask.inverted}
                                    onChange={(event) => patchGarment(slot, { mask: { ...garment.mask, inverted: event.target.checked } })}
                                />
                                反向
                            </label>
                            <label className="flex items-center gap-1">
                                <input
                                    type="checkbox"
                                    checked={garment.mask.autoExpand}
                                    onChange={(event) => patchGarment(slot, { mask: { ...garment.mask, autoExpand: event.target.checked } })}
                                />
                                扩边
                            </label>
                        </div>
                        {maskIssue ? <p className="text-xs text-destructive">{maskIssue.message}</p> : null}
                    </div>
                );
            })}

            <div className="space-y-3 rounded-lg border p-3" data-testid="dressing-options">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">生成张数</span>
                    {DRESSING_OUTPUT_OPTIONS.map((num) => (
                        <button
                            key={num}
                            type="button"
                            data-testid={`dressing-output-${num}`}
                            aria-pressed={values.outputNum === num}
                            onClick={() => setValues((prev) => ({ ...prev, outputNum: num }))}
                            className={cn(
                                "rounded border px-2 py-1 text-xs",
                                values.outputNum === num ? "border-primary text-primary" : "text-muted-foreground",
                            )}
                        >
                            {num} 张
                        </button>
                    ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                    <label className="space-y-1 text-xs">
                        <span className="text-muted-foreground">模型类型</span>
                        <select
                            value={values.modelType}
                            onChange={(event) => setValues((prev) => ({ ...prev, modelType: normalizeModelType(event.target.value) }))}
                            className="w-full rounded border px-2 py-1 text-sm"
                        >
                            {DRESSING_MODEL_TYPES.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="space-y-1 text-xs">
                        <span className="text-muted-foreground">版本</span>
                        <select
                            value={values.version}
                            onChange={(event) => setValues((prev) => ({ ...prev, version: event.target.value }))}
                            className="w-full rounded border px-2 py-1 text-sm"
                        >
                            {DRESSING_VERSION_OPTIONS.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="space-y-1 text-xs">
                        <span className="text-muted-foreground">任务名称</span>
                        <input
                            value={values.name}
                            maxLength={DRESSING_NAME_MAX}
                            placeholder="可选，便于在历史里辨认"
                            onChange={(event) => setValues((prev) => ({ ...prev, name: event.target.value }))}
                            className="w-full rounded border px-2 py-1 text-sm"
                        />
                    </label>
                    <label className="space-y-1 text-xs">
                        <span className="text-muted-foreground">服务商</span>
                        <input
                            value={values.provider}
                            placeholder="留空跟随当前配置"
                            onChange={(event) => setValues((prev) => ({ ...prev, provider: event.target.value }))}
                            className="w-full rounded border px-2 py-1 text-sm"
                        />
                    </label>
                </div>
                <div className="flex flex-wrap gap-4 text-xs">
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

            {error ? (
                <p className="text-xs text-destructive" data-testid="dressing-error">
                    {error}
                </p>
            ) : null}
            {!error && blockedIssue ? (
                <p className="text-xs text-muted-foreground" data-testid="dressing-blocked">
                    提交前请先处理：{blockedIssue.message}
                </p>
            ) : null}

            <button
                type="button"
                data-testid="dressing-submit"
                disabled={busy || Boolean(blockedIssue)}
                onClick={() => void submit()}
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
            >
                {busy ? "生成中…" : "立即生成"}
            </button>

            {outcomes.length > 0 ? (
                <div className="space-y-2" data-testid="dressing-results">
                    {outcomes.map((outcome) => {
                        const view = dressingResultView(outcome, { tab: values.activeTab });
                        return (
                            <div key={outcome.unitId} className="space-y-1 rounded-lg border p-3">
                                <p className="text-xs text-muted-foreground">{view.caption}</p>
                                <p className="text-sm">{describeDressingOutcome(outcome)}</p>
                                {view.stale ? <p className="text-xs text-amber-600">表单已改动，这批结果对应旧快照。</p> : null}
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
                                                    className="block overflow-hidden rounded border"
                                                >
                                                    <img src={href} alt={`结果 ${index + 1}`} className="w-full" />
                                                </a>
                                            );
                                        })}
                                    </div>
                                ) : null}
                                {outcome.error ? <p className="text-xs text-destructive">{outcome.error.message}</p> : null}
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </section>
    );
}

export default DressingWorkspace;
