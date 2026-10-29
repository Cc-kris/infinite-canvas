import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, Sparkles } from "lucide-react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { saveResultItemToAssets, sendResultItemToCanvas } from "@/components/tools/tool-result-actions";
import {
    auditSuiteConsistency,
    buildSuiteFromValues,
    createTaskStoreRunPort,
    mergeOutcomes,
    paletteToPlans,
    retryableUnits,
    runColorV2Suite,
    sampleImagePalette,
    summarizeByPlan,
    type ColorV2Unit,
    type ColorV2UnitOutcome,
} from "@/features/tools/adapters/change-color-v2";
import {
    CHANGE_COLOR_V2_SLUG,
    CHANGE_COLOR_V2_TOOL_ID,
    COLOR_QUALITY_LEVELS,
    COLOR_REGION_PRESETS,
    COLOR_V2_MAX_BYTES,
    COLOR_V2_MAX_REFERENCE_IMAGES,
    COLOR_V2_MAX_REGION_LENGTH,
    COLOR_V2_MAX_SUITE_IMAGES,
    addColorPlan,
    buildColorV2Snapshot,
    createColorPlan,
    estimatedOutputCount,
    getQualityLevel,
    isSnapshotStale,
    parseColorV2Values,
    planLabel,
    planSwatch,
    pushHistoryColor,
    removeColorPlan,
    sanityRegion,
    toggleReferencePlan,
    validateColorV2State,
    type ColorPlan,
    type ColorQualityKey,
    type ColorV2Values,
} from "@/features/tools/registry/change-color-v2";
import { getToolById } from "@/features/tools/registry";
import { cn } from "@/lib/utils";
import {
    DEFAULT_IMAGE_CONSTRAINTS,
    loadToolAssetRecords,
    uploadToolAsset,
    type ToolAssetRecord,
} from "@/services/api/tools/assets";
import { imageToDataUrl } from "@/services/image-storage";
import { flushToolDrafts, useToolDraftStore } from "@/stores/use-tool-draft-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";

const TOOL_ID = CHANGE_COLOR_V2_TOOL_ID;
const SUITE_CONSTRAINTS = { maxBytes: COLOR_V2_MAX_BYTES } as const;

export interface ColorV2WorkspaceProps {
    className?: string;
}

/* ------------------------------------------------------------------ *
 * 小部件（对齐原站：46px 分区标题条 / 12px 标题 / #723cf9 主色）
 * ------------------------------------------------------------------ */

function PanelSection({ id, title, hint, children }: { id?: string; title: string; hint?: string; children: React.ReactNode }) {
    return (
        <section id={id} data-section={id} className="border-b border-[#f1f1f4]">
            <header className="flex h-[46px] items-center justify-between gap-2 px-4">
                <h2 style={{ fontSize: 14, fontWeight: 400, lineHeight: 1 }} className="text-[#000000e0]">{title}</h2>
                {hint ? <span className="text-[11px] leading-none text-[#8a8a99]">{hint}</span> : null}
            </header>
            <div className="pb-4">{children}</div>
        </section>
    );
}

function Swatch({ plan, size = "size-4" }: { plan: ColorPlan; size?: string }) {
    const hex = planSwatch(plan);
    if (hex) {
        return <span aria-hidden className={cn("inline-block shrink-0 rounded-[3px] border border-[#ededf0]", size)} style={{ backgroundColor: hex }} />;
    }
    return (
        <span className={cn("inline-flex shrink-0 items-center justify-center rounded-[3px] border border-dashed border-[#d9d9e0] text-[9px] text-[#8a8a99]", size)} title="参考图方案，无固定色值">
            图
        </span>
    );
}

const SOURCE_LABEL: Record<ColorPlan["source"], string> = { reference: "参考图", product: "商品提色", history: "历史" };

const STATUS_LABEL: Record<ColorV2UnitOutcome["status"], string> = {
    succeeded: "已完成",
    failed: "失败",
    unknown: "结果未定",
    cancelled: "已取消",
};

export function ColorV2Workspace({ className }: ColorV2WorkspaceProps = {}) {
    const spec = useMemo(() => getToolById(TOOL_ID), []);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const conflict = useToolDraftStore((state) => state.conflicts[TOOL_ID]);

    const [values, setValues] = useState<ColorV2Values>(() => parseColorV2Values(undefined));
    const [suiteRecords, setSuiteRecords] = useState<ToolAssetRecord[]>([]);
    const [suiteIds, setSuiteIds] = useState<string[]>([]);
    const [referenceRecords, setReferenceRecords] = useState<ToolAssetRecord[]>([]);
    const [hydrated, setHydrated] = useState(false);
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const [actingUnit, setActingUnit] = useState<string | null>(null);
    const [actionNotice, setActionNotice] = useState("");
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [outcomes, setOutcomes] = useState<ColorV2UnitOutcome[]>([]);
    const [runHash, setRunHash] = useState<string | null>(null);
    const [units, setUnits] = useState<ColorV2Unit[]>([]);
    const [extracting, setExtracting] = useState<string | null>(null);
    const [showSnapshot, setShowSnapshot] = useState(false);

    const valuesRef = useRef(values);
    const abortRef = useRef<AbortController | null>(null);
    const referenceInputRef = useRef<HTMLInputElement | null>(null);
    const runTool = useToolTaskStore((state) => state.runTool);

    const commit = useCallback(
        (next: ColorV2Values) => {
            valuesRef.current = next;
            setValues(next);
            patchDraft(TOOL_ID, { values: next as unknown as Record<string, unknown> });
        },
        [patchDraft],
    );

    // 草稿恢复：方案/部位/品质/参考图 id 全部来自 draft.values，参考图记录再从资产索引取回。
    useEffect(() => {
        let alive = true;
        void (async () => {
            const draft = await hydrateDraft(TOOL_ID);
            if (!alive) return;
            const restored = parseColorV2Values(draft?.values);
            valuesRef.current = restored;
            setValues(restored);
            setHydrated(true);
            if (restored.referenceAssetIds.length) {
                const { records } = await loadToolAssetRecords(restored.referenceAssetIds);
                if (alive) setReferenceRecords(records);
            }
        })();
        return () => {
            alive = false;
        };
    }, [hydrateDraft]);

    useEffect(() => () => abortRef.current?.abort(), []);
    useEffect(() => {
        void flushToolDrafts([TOOL_ID]);
    }, [values]);

    const selectedPlan = values.plans.find((plan) => plan.id === values.selectedPlanId) ?? values.plans[0];
    const issues = useMemo(() => validateColorV2State({ assetIds: suiteIds, values }), [suiteIds, values]);
    const currentSnapshot = useMemo(() => buildColorV2Snapshot({ assetIds: suiteIds, values }), [suiteIds, values]);
    const stale = runHash ? isSnapshotStale(currentSnapshot, runHash) : false;
    const plannedCount = estimatedOutputCount(suiteIds.length, values.plans.length);

    /* ---------------- 参考图与方案 ---------------- */

    const addReferenceFiles = useCallback(
        async (files: File[]) => {
            const room = COLOR_V2_MAX_REFERENCE_IMAGES - valuesRef.current.referenceAssetIds.length;
            if (room <= 0) {
                setNotice(`参考图最多 ${COLOR_V2_MAX_REFERENCE_IMAGES} 张`);
                return;
            }
            const picked = files.slice(0, room);
            if (files.length > picked.length) setNotice(`已忽略 ${files.length - picked.length} 个超出上限的参考图`);
            for (const file of picked) {
                try {
                    const record = await uploadToolAsset(file, { constraints: DEFAULT_IMAGE_CONSTRAINTS });
                    setReferenceRecords((prev) => [...prev.filter((item) => item.id !== record.id), record]);
                    const next = toggleReferencePlan(valuesRef.current, { assetId: record.id, name: record.name });
                    commit(next);
                } catch (error) {
                    setNotice(error instanceof Error ? error.message : "参考图上传失败");
                }
            }
        },
        [commit],
    );

    const toggleReferenceRecord = useCallback(
        (record: ToolAssetRecord) => {
            const next = toggleReferencePlan(valuesRef.current, { assetId: record.id, name: record.name });
            if (!next.referenceAssetIds.includes(record.id)) {
                setReferenceRecords((prev) => prev.filter((item) => item.id !== record.id));
            }
            commit(next);
        },
        [commit],
    );

    const extractPalette = useCallback(
        async (record: ToolAssetRecord) => {
            const url = record.url;
            if (!url) {
                setNotice("该商品图缺少本地预览地址，无法提色");
                return;
            }
            setExtracting(record.id);
            try {
                const palette = await sampleImagePalette(url, { maxColors: 5 });
                if (!palette.length) {
                    setNotice("该商品图未提取到可用颜色");
                    return;
                }
                let next = valuesRef.current;
                for (const plan of paletteToPlans(palette, { assetId: record.id, assetName: record.name })) {
                    next = { ...next, plans: addColorPlan(next.plans, plan), selectedPlanId: plan.id };
                    if (plan.hex) next = { ...next, historyColors: pushHistoryColor(next.historyColors, plan.hex) };
                }
                commit(next);
                setNotice(`已从「${record.name}」提取 ${palette.length} 个颜色方案`);
            } catch (error) {
                setNotice(error instanceof Error ? error.message : "提色失败");
            } finally {
                setExtracting(null);
            }
        },
        [commit],
    );

    const addHistoryColor = useCallback(
        (hex: string) => {
            const plan = createColorPlan({ source: "history", hex, name: `历史色 ${hex}` });
            const next = { ...valuesRef.current, plans: addColorPlan(valuesRef.current.plans, plan), selectedPlanId: plan.id };
            commit(next);
        },
        [commit],
    );

    /* ---------------- 运行 ---------------- */

    const toHydrated = async (record: ToolAssetRecord) => {
        try {
            const dataUrl = await imageToDataUrl({ storageKey: record.storageKey, url: record.url });
            return dataUrl ? { ...record, url: dataUrl } : record;
        } catch {
            return record;
        }
    };

    const execute = useCallback(
        async (planned: ColorV2Unit[], hash: string) => {
            setBusy(true);
            setNotice("");
            setProgress({ done: 0, total: planned.length });
            const controller = new AbortController();
            abortRef.current = controller;
            try {
                const result = await runColorV2Suite(planned, {
                    port: createTaskStoreRunPort(),
                    quality: valuesRef.current.quality,
                    concurrency: 3,
                    signal: controller.signal,
                    onOutcome: (outcome, _unit, completed, total) => {
                        setOutcomes((prev) => mergeOutcomes(prev, [outcome]));
                        setProgress({ done: completed, total });
                    },
                });
                setOutcomes((prev) => mergeOutcomes(prev, result));
                setRunHash(hash);
                const failed = result.filter((item) => item.status !== "succeeded").length;
                setNotice(failed ? `${result.length - failed} 张完成，${failed} 张未完成（可单独重试）` : `全部 ${result.length} 张已完成`);
            } catch (error) {
                setNotice(error instanceof Error ? error.message : "运行失败");
            } finally {
                setBusy(false);
                abortRef.current = null;
            }
        },
        [],
    );

    const runSuite = useCallback(async () => {
        const blocking = validateColorV2State({ assetIds: suiteIds, values: valuesRef.current });
        if (blocking.length) {
            setNotice(blocking[0].message);
            return;
        }
        setNotice("正在解析商品图与参考图…");
        const [hydratedSuite, hydratedReferences] = await Promise.all([
            Promise.all(suiteRecords.map(toHydrated)),
            Promise.all(referenceRecords.map(toHydrated)),
        ]);
        const { snapshot, units: built } = buildSuiteFromValues({
            records: hydratedSuite,
            assetIds: suiteIds,
            values: valuesRef.current,
            referenceRecords: hydratedReferences,
        });
        if (!built.length) {
            setNotice("没有可执行的请求单元");
            return;
        }
        setUnits(built);
        setOutcomes([]);
        await execute(built, snapshot.hash);
    }, [execute, referenceRecords, suiteIds, suiteRecords]);

    const retryFailed = useCallback(async () => {
        if (busy) return;
        const targets = retryableUnits(units, outcomes);
        if (!targets.length) {
            setNotice("没有可重试的失败单元");
            return;
        }
        await execute(targets, runHash ?? units[0]?.snapshotHash ?? "");
    }, [busy, execute, outcomes, runHash, units]);

    const retryUnit = useCallback(
        async (unit: ColorV2Unit) => {
            if (busy) return;
            await execute([unit], unit.snapshotHash);
        },
        [busy, execute],
    );

    const stop = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    const download = useCallback((outcome: ColorV2UnitOutcome) => {
        const url = outcome.image?.dataUrl || outcome.image?.url;
        if (!url) return;
        const plan = valuesRef.current.plans.find((item) => item.id === outcome.planId);
        const asset = suiteRecords.find((item) => item.id === outcome.assetId);
        const name = `${(asset?.name ?? "商品图").replace(/\.[^.]+$/, "")}-${plan?.name ?? outcome.planId}.png`;
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = name;
        anchor.click();
    }, [suiteRecords]);

    const outcomeItem = (outcome: ColorV2UnitOutcome) => ({
        id: `${outcome.unitId}-result`,
        kind: "image" as const,
        dataUrl: outcome.image?.dataUrl,
        url: outcome.image?.url,
        mimeType: outcome.image?.mimeType ?? "image/png",
    });

    const outcomeTitle = useCallback((outcome: ColorV2UnitOutcome) => {
        const plan = valuesRef.current.plans.find((item) => item.id === outcome.planId);
        const asset = suiteRecords.find((item) => item.id === outcome.assetId);
        return `${(asset?.name ?? "商品图").replace(/\.[^.]+$/, "")}-${plan?.name ?? outcome.planId}`;
    }, [suiteRecords]);

    const saveOutcome = useCallback(
        async (outcome: ColorV2UnitOutcome) => {
            const item = outcomeItem(outcome);
            if (!item.dataUrl && !item.url) {
                setActionNotice("没有可存入的结果图：请先完成一次真实换色");
                return;
            }
            setActingUnit(outcome.unitId);
            setActionNotice("");
            try {
                const saved = await saveResultItemToAssets(item, 0, {
                    toolId: TOOL_ID,
                    taskId: outcome.taskId,
                    title: `${outcomeTitle(outcome)} 换色结果`,
                    source: CHANGE_COLOR_V2_SLUG,
                });
                setActionNotice(`已存入资产库（${saved.assetId.slice(0, 8)}）`);
            } catch (error) {
                setActionNotice(error instanceof Error ? error.message : "存入资产库失败");
            } finally {
                setActingUnit(null);
            }
        },
        [outcomeTitle],
    );

    const sendOutcome = useCallback(
        async (outcome: ColorV2UnitOutcome) => {
            const item = outcomeItem(outcome);
            if (!item.dataUrl && !item.url) {
                setActionNotice("没有可发送的结果图：请先完成一次真实换色");
                return;
            }
            setActingUnit(outcome.unitId);
            setActionNotice("");
            try {
                const sent = await sendResultItemToCanvas(item, {
                    toolId: TOOL_ID,
                    projectTitle: "套图换色结果",
                });
                setActionNotice(`已发送画布（项目 ${sent.projectId.slice(0, 8)} · 节点 ${sent.nodeId.slice(0, 8)}）`);
            } catch (error) {
                setActionNotice(error instanceof Error ? error.message : "发送画布失败");
            } finally {
                setActingUnit(null);
            }
        },
        [],
    );

    const outcomeByUnit = useMemo(() => new Map(outcomes.map((item) => [item.unitId, item])), [outcomes]);    const planRows = useMemo(() => (units.length ? summarizeByPlan(units, outcomes) : []), [outcomes, units]);
    const consistency = useMemo(() => (units.length ? auditSuiteConsistency(units, outcomes) : null), [outcomes, units]);
    const succeeded = outcomes.filter((item) => item.status === "succeeded").length;
    /* ---------------- 渲染 ---------------- */

    const [colorMode, setColorMode] = useState<"extract" | "history">("extract");
    const [rightTab, setRightTab] = useState<"result" | "cases" | "history">("result");
    const [stepDismissed, setStepDismissed] = useState(false);
    const qualityLevel = getQualityLevel(values.quality);
    const showResults = outcomes.length > 0 || busy;

    return (
        <div
            data-tool={TOOL_ID}
            data-layout="linkfox-change-color"
            data-spec={spec?.slug ?? CHANGE_COLOR_V2_SLUG}
            style={{ fontFamily: '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif' }}
            className={cn("flex h-full min-h-0 min-w-0 gap-[10px] overflow-hidden bg-[#f4f6f8] text-[13px] text-[#000000e0]", className)}
        >
            {/* 左：296px 参数面板（原站 x190 w296；提交条固定在面板底部） */}
            <section data-region="params" className="flex h-full w-[296px] shrink-0 flex-col overflow-hidden rounded-[8px] border border-[#ededf0] bg-white">
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <PanelSection id="upload" title="上传图片" hint={`${suiteIds.length} / ${COLOR_V2_MAX_SUITE_IMAGES}`}>
                        <div className="px-4">
                            <div className="mx-auto w-[210px]">
                                <ToolAssetInput
                                    toolId={TOOL_ID}
                                    maxCount={COLOR_V2_MAX_SUITE_IMAGES}
                                    constraints={SUITE_CONSTRAINTS}
                                    disabled={busy}
                                    title=""
                                    variant="linkfox"
                                    uploadLabel="从本地上传"
                                    hint={`10M以内，最多 ${COLOR_V2_MAX_SUITE_IMAGES} 张`}
                                    onChange={(ids, records) => {
                                        setSuiteIds(ids);
                                        setSuiteRecords(records);
                                    }}
                                />
                            </div>
                            {suiteRecords.length ? (
                                <ul data-testid="color-v2-suite-list" className="mt-3 grid grid-cols-3 gap-2">
                                    {suiteRecords.map((record) => (
                                        <li key={record.id} className="min-w-0">
                                            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-[4px] border border-[#ededf0] bg-[#fafafa]">
                                                {record.url ? (
                                                    <img src={record.url} alt={record.name} className="h-full w-full object-cover" />
                                                ) : (
                                                    <span className="text-[10px] text-[#8a8a99]">无预览</span>
                                                )}
                                            </div>
                                            <p className="mt-1 truncate text-[11px] leading-4 text-[#8a8a99]" title={record.name}>
                                                {record.name}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </div>
                    </PanelSection>

                    <PanelSection id="plans" title="颜色选择" hint={`${values.plans.length} 个方案`}>
                        <div className="px-4">
                            <div role="tablist" aria-label="取色方式" className="flex h-[34px] w-full items-center rounded-[8px] bg-[#f4f6f8] p-[2px]">
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={colorMode === "extract"}
                                    data-testid="color-v2-mode-extract"
                                    onClick={() => setColorMode("extract")}
                                    style={{ fontSize: 12, fontWeight: 600 }}
                                    className={cn(
                                        "h-full flex-1 rounded-[6px] leading-none transition",
                                        colorMode === "extract" ? "bg-white text-[#723cf9] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#5a5a6e]",
                                    )}
                                >
                                    商品图提色
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={colorMode === "history"}
                                    data-testid="color-v2-mode-history"
                                    style={{ fontSize: 12, fontWeight: 600 }}
                                    onClick={() => setColorMode("history")}
                                    className={cn(
                                        "h-full flex-1 rounded-[6px] leading-none transition",
                                        colorMode === "history" ? "bg-white text-[#723cf9] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#5a5a6e]",
                                    )}
                                >
                                    历史使用颜色
                                </button>
                            </div>

                            {colorMode === "extract" ? (
                                <div className="mt-3 space-y-2">
                                    {suiteRecords.length ? (
                                        <div className="space-y-1.5">
                                            {suiteRecords.map((record) => (
                                                <button
                                                    key={record.id}
                                                    type="button"
                                                    data-testid="color-v2-extract"
                                                    disabled={busy || extracting === record.id}
                                                    onClick={() => void extractPalette(record)}
                                                    title="从这张商品图提取 5 个主色作为方案"
                                                    className="flex w-full items-center gap-2 rounded-[4px] border border-[#e5e5ea] px-2 py-1 text-left text-[11px] leading-4 text-[#5a5a66] transition hover:border-[#723cf9]/50 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    <ImagePlus className="size-3 shrink-0 text-[#723cf9]" aria-hidden="true" />
                                                    <span className="truncate">{extracting === record.id ? "提色中…" : `从「${record.name}」提色`}</span>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-[11px] leading-4 text-[#8a8a99]">先上传商品图，这里会按图片自动提取 5 个主色方案。</p>
                                    )}

                                    <button
                                        type="button"
                                        data-testid="color-v2-reference-upload"
                                        disabled={busy}
                                        onClick={() => referenceInputRef.current?.click()}
                                        className="flex w-full items-center justify-center gap-1 rounded-[4px] border border-dashed border-[#d9d9e0] px-2 py-1 text-[11px] leading-4 text-[#6b6b7a] transition hover:border-[#723cf9]/50 disabled:opacity-50"
                                    >
                                        ＋ 上传参考图（{referenceRecords.length}/{COLOR_V2_MAX_REFERENCE_IMAGES}）
                                    </button>
                                    <input
                                        ref={referenceInputRef}
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        hidden
                                        onChange={(event) => {
                                            const files = Array.from(event.target.files ?? []);
                                            if (files.length) void addReferenceFiles(files);
                                            event.target.value = "";
                                        }}
                                    />
                                    {referenceRecords.length ? (
                                        <ul className="flex flex-wrap gap-1.5">
                                            {referenceRecords.map((record) => {
                                                const active = values.referenceAssetIds.includes(record.id);
                                                return (
                                                    <li key={record.id}>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleReferenceRecord(record)}
                                                            title={`${record.name}${active ? " · 已作为方案" : " · 点击作为参考方案"}`}
                                                            className={cn(
                                                                "size-9 overflow-hidden rounded-[4px] border transition",
                                                                active ? "border-[#723cf9] ring-1 ring-[#723cf9]/40" : "border-[#ededf0] hover:border-[#723cf9]/50",
                                                            )}
                                                        >
                                                            {record.url ? <img src={record.url} alt={record.name} className="h-full w-full object-cover" /> : null}
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="mt-3">
                                    {values.historyColors.length ? (
                                        <ul className="grid grid-cols-8 gap-1.5">
                                            {values.historyColors.map((hex) => (
                                                <li key={hex}>
                                                    <button
                                                        type="button"
                                                        data-testid="color-v2-history-color"
                                                        title={`使用历史色 ${hex}`}
                                                        onClick={() => addHistoryColor(hex)}
                                                        className="size-5 rounded-[3px] border border-[#ededf0] transition hover:scale-110"
                                                        style={{ backgroundColor: hex }}
                                                    />
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-[11px] leading-4 text-[#8a8a99]">暂无历史使用颜色，提色或手动添加后会出现在这里。</p>
                                    )}
                                </div>
                            )}

                            <ul data-testid="color-v2-plans" className="mt-3 space-y-1.5">
                                {values.plans.length ? (
                                    values.plans.map((plan) => {
                                        const active = plan.id === selectedPlan?.id;
                                        return (
                                            <li key={plan.id} className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => commit({ ...valuesRef.current, selectedPlanId: plan.id })}
                                                    title={planLabel(plan)}
                                                    className={cn(
                                                        "flex min-w-0 flex-1 items-center gap-2 rounded-[4px] border px-2 py-1 text-left text-[11px] leading-4 transition",
                                                        active ? "border-[#723cf9] bg-[#f9f0ff] text-[#1f1f2c]" : "border-[#e5e5ea] bg-white text-[#5a5a66] hover:border-[#723cf9]/50",
                                                    )}
                                                >
                                                    <Swatch plan={plan} />
                                                    <span className="min-w-0 flex-1 truncate">{plan.name}</span>
                                                    <span className="shrink-0 text-[10px] text-[#8a8a99]">{SOURCE_LABEL[plan.source]}</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label={`移除方案 ${plan.name}`}
                                                    disabled={busy}
                                                    onClick={() => commit({ ...valuesRef.current, plans: removeColorPlan(valuesRef.current.plans, plan.id) })}
                                                    className="shrink-0 rounded-[3px] px-1 text-[12px] leading-5 text-[#8a8a99] transition hover:text-[#f5483b] disabled:opacity-40"
                                                >
                                                    ×
                                                </button>
                                            </li>
                                        );
                                    })
                                ) : (
                                    <li className="text-[11px] leading-4 text-[#8a8a99]">还没有换色方案：从商品图提色、选历史色或上传参考图。</li>
                                )}
                            </ul>
                        </div>
                    </PanelSection>

                    <PanelSection id="region" title="换色部位" hint={values.region ? `${values.region.length}/${COLOR_V2_MAX_REGION_LENGTH}` : "必填"}>
                        <div className="px-4">
                            <textarea
                                data-testid="color-v2-region"
                                style={{ height: 52 }}
                                value={values.region}
                                disabled={busy}
                                rows={2}
                                maxLength={COLOR_V2_MAX_REGION_LENGTH}
                                placeholder="请输入需要换色的部位（必填），如 上装、鞋面"
                                onChange={(event) => commit({ ...valuesRef.current, region: sanityRegion(event.target.value) })}
                                className="w-full resize-none rounded-[4px] border border-[#e5e5ea] bg-white px-2.5 py-2 text-[14px] leading-5 text-[#000000e0] outline-none transition placeholder:text-[#b4b4c0] focus:border-[#723cf9] disabled:opacity-60"
                            />
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {COLOR_REGION_PRESETS.map((preset) => {
                                    const active = values.region.includes(preset.label);
                                    return (
                                        <button
                                            key={preset.key}
                                            type="button"
                                            data-testid={`color-v2-region-${preset.key}`}
                                            disabled={busy}
                                            onClick={() => {
                                                if (active) return;
                                                const base = valuesRef.current.region.trim();
                                                const merged = base ? `${base}、${preset.label}` : preset.label;
                                                commit({ ...valuesRef.current, region: sanityRegion(merged) });
                                            }}
                                            className={cn(
                                                "rounded-[3px] border px-1.5 py-0.5 text-[11px] leading-4 transition",
                                                active ? "border-[#723cf9] bg-[#f9f0ff] text-[#723cf9]" : "border-[#e5e5ea] bg-white text-[#5a5a66] hover:border-[#723cf9]/50",
                                            )}
                                        >
                                            {preset.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </PanelSection>

                    <PanelSection id="quality" title="模型设置">
                        <div className="px-4">
                            <p className="text-[12px] leading-4 text-[#1f1f2c]">模型品质</p>
                            <div className="mt-2 flex gap-[10px]">
                                {COLOR_QUALITY_LEVELS.map((level) => {
                                    const active = values.quality === level.key;
                                    return (
                                        <button
                                            key={level.key}
                                            type="button"
                                            data-testid={`color-v2-quality-${level.key}`}
                                            disabled={busy}
                                            onClick={() => commit({ ...valuesRef.current, quality: level.key as ColorQualityKey })}
                                            title={`调用上游 ${level.providerQuality} 品质`}
                                            style={{ fontSize: 14, fontWeight: 400 }}
                                            className={cn(
                                                "h-8 w-[75px] rounded-[6px] border leading-none transition",
                                                active ? "border-[#723cf9] bg-[#f9f0ff] text-[#723cf9]" : "border-[#e5e5ea] bg-white text-[#5a5a66] hover:border-[#723cf9]/50",
                                            )}
                                        >
                                            {level.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="mt-2 text-[11px] leading-4 text-[#8a8a99]">
                                预计输出 {plannedCount} 张（{suiteIds.length} 张商品图 × {values.plans.length} 个方案）
                            </p>
                        </div>
                    </PanelSection>
                </div>

                <div className="shrink-0 border-t border-[#ededf0] px-4 py-3">
                    {conflict ? (
                        <p key="conflict" className="mb-2 rounded-[4px] bg-[#fff1f0] px-2 py-1 text-[11px] leading-4 text-[#f5483b]">
                            其他标签页改过草稿，当前页面可能覆盖远端改动；刷新后再编辑。
                        </p>
                    ) : null}
                    {stale ? (
                        <p key="stale" data-testid="color-v2-stale" className="mb-2 rounded-[4px] bg-[#fff8e6] px-2 py-1 text-[11px] leading-4 text-[#a86b00]">
                            输入已变更，当前结果来自旧快照 {runHash?.slice(0, 8)}；重新生成才会反映最新设置。
                        </p>
                    ) : null}
                    <button
                        type="button"
                        data-testid="color-v2-submit"
                        style={{ fontSize: 14 }}
                        disabled={busy || issues.length > 0}
                        title={issues[0]?.message}
                        onClick={() => void runSuite()}
                        className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-[6px] bg-[#723cf9] text-[14px] leading-none text-white transition hover:bg-[#6231e0] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
                        <span>{busy ? `生成中 ${progress.done}/${progress.total}` : "开始生成"}</span>
                        <span className="text-[12px] leading-none opacity-90">(50算力)</span>
                    </button>
                    <p className="mt-1 text-center text-[11px] leading-4 text-[#8a8a99]">
                        共 {plannedCount} 张 · {qualityLevel.label}
                        {busy ? ` · 已完成 ${succeeded}` : ""}
                    </p>
                    {notice ? (
                        <p data-testid="color-v2-notice" className="mt-1 text-[11px] leading-4 text-[#6b6b7a]">
                            {notice}
                        </p>
                    ) : null}
                    {issues.length ? (
                        <p data-testid="color-v2-blocked" className="mt-1 text-[11px] leading-4 text-[#f5483b]">
                            {issues[0].message}
                        </p>
                    ) : null}
                </div>
            </section>

            {/* 右：结果区（原站 42px 白条 tab + #f4f6f8 内容） */}
            <section id="results" data-region="results" className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[8px] bg-[#f4f6f8]">
                <div role="tablist" aria-label="右栏页签" className="flex h-[42px] shrink-0 items-center gap-[14px] bg-white px-3">
                    {(
                        [
                            { key: "result", label: "生成结果" },
                            { key: "cases", label: "优秀案例" },
                        ] as const
                    ).map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            role="tab"
                            aria-selected={rightTab === item.key}
                            data-testid={`color-v2-tab-${item.key}`}
                            style={{ fontSize: 14, fontWeight: 400 }}
                            onClick={() => setRightTab(item.key)}
                            className={cn(
                                "h-[42px] text-[14px] font-normal leading-none transition",
                                rightTab === item.key ? "text-[#723cf9]" : "text-[#000000e0] hover:text-[#723cf9]",
                            )}
                        >
                            {item.label}
                        </button>
                    ))}
                    <button
                        type="button"
                        data-testid="color-v2-tab-history"
                        onClick={() => setRightTab("history")}
                        className={cn(
                            "ml-auto text-[12px] leading-none transition",
                            rightTab === "history" ? "font-medium text-[#723cf9]" : "text-[#6b6b80] hover:text-[#723cf9]",
                        )}
                    >
                        历史记录
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    {rightTab === "result" ? (
                        showResults ? (
                            <div className="space-y-3 p-3">
                                <div className="flex flex-wrap items-center gap-2 rounded-[8px] bg-white px-3 py-2 text-[12px] text-[#5a5a66]">
                                    <span data-testid="color-v2-progress" className="font-medium text-[#1f1f2c]">
                                        进度 {progress.done}/{progress.total || units.length}
                                    </span>
                                    <span>· 已完成 {succeeded}</span>
                                    {runHash ? <span>· 快照 {runHash.slice(0, 8)}</span> : null}
                                    <span className="ml-auto flex items-center gap-2">
                                        {busy ? (
                                            <button
                                                type="button"
                                                data-testid="color-v2-stop"
                                                onClick={stop}
                                                className="rounded-[4px] border border-[#e5e5ea] px-2 py-0.5 text-[11px] text-[#5a5a66] transition hover:border-[#723cf9]/50"
                                            >
                                                停止
                                            </button>
                                        ) : null}
                                        {!busy && retryableUnits(units, outcomes).length ? (
                                            <button
                                                type="button"
                                                data-testid="color-v2-retry-failed"
                                                onClick={() => void retryFailed()}
                                                className="rounded-[4px] border border-[#e5e5ea] px-2 py-0.5 text-[11px] text-[#5a5a66] transition hover:border-[#723cf9]/50"
                                            >
                                                重试失败单元（{retryableUnits(units, outcomes).length}）
                                            </button>
                                        ) : null}
                                    </span>
                                </div>

                                {planRows.length ? (
                                    <div className="flex flex-wrap gap-2">
                                        {planRows.map((row) => (
                                            <span key={row.planId} className="inline-flex items-center gap-1.5 rounded-[4px] bg-white px-2 py-1 text-[11px] leading-4 text-[#5a5a66]">
                                                {row.hex ? <span aria-hidden className="inline-block size-3 rounded-[2px] border border-[#ededf0]" style={{ backgroundColor: row.hex }} /> : null}
                                                {row.planName}：{row.succeeded}/{row.total}
                                                {row.failed ? <span className="text-[#f5483b]">· 失败 {row.failed}</span> : null}
                                                {row.unknown ? <span className="text-[#a86b00]">· 未定 {row.unknown}</span> : null}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}

                                {consistency ? (
                                    <p className="text-[11px] leading-4 text-[#8a8a99]">
                                        一致性：{consistency.completeMatrix ? "整套矩阵覆盖完整" : "矩阵尚未覆盖全部商品图 × 方案"}
                                        {consistency.deviatingUnits.length ? ` · ${consistency.deviatingUnits.length} 张做过单图微调` : " · 无单图微调"}
                                    </p>
                                ) : null}

                                {actionNotice ? (
                                    <p data-testid="color-v2-action-notice" className="rounded-[4px] bg-accent px-2 py-1 text-[11px] leading-4 text-[#5a5a66]">
                                        {actionNotice}
                                    </p>
                                ) : null}

                                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
                                    {units.length
                                        ? units.map((unit) => {
                                              const outcome = outcomeByUnit.get(unit.unitId);
                                              const imageUrl = outcome?.image?.dataUrl || outcome?.image?.url;
                                              const status = outcome?.status;
                                              return (
                                                  <figure
                                                      key={unit.unitId}
                                                      data-testid="color-v2-unit"
                                                      data-status={status ?? "pending"}
                                                      className="overflow-hidden rounded-[8px] border border-[#ededf0] bg-white"
                                                  >
                                                      <div className="flex aspect-[3/4] items-center justify-center bg-[#fafafa]">
                                                          {imageUrl ? (
                                                              <img src={imageUrl} alt={unit.imageName} className="h-full w-full object-contain" />
                                                          ) : (
                                                              <span className="px-2 text-center text-[11px] leading-4 text-[#8a8a99]">
                                                                  {status ? STATUS_LABEL[status] : busy ? "等待生成…" : "未生成"}
                                                              </span>
                                                          )}
                                                      </div>
                                                      <figcaption className="space-y-1 p-2">
                                                          <p className="truncate text-[12px] leading-4 text-[#1f1f2c]" title={unit.imageName}>
                                                              {unit.imageName}
                                                          </p>
                                                          <p className="text-[11px] leading-4 text-[#8a8a99]">
                                                              {unit.planName}
                                                              {status ? ` · ${STATUS_LABEL[status]}` : ""}
                                                          </p>
                                                          <div className="flex flex-wrap gap-1 pt-0.5">
                                                              {outcome && status === "succeeded" ? (
                                                                  <>
                                                                      <button
                                                                          type="button"
                                                                          data-testid="color-v2-download"
                                                                          onClick={() => download(outcome)}
                                                                          className="rounded-[3px] border border-[#e5e5ea] px-1.5 py-0.5 text-[11px] leading-4 text-[#5a5a66] transition hover:border-[#723cf9]/50"
                                                                      >
                                                                          下载
                                                                      </button>
                                                                      <button
                                                                          type="button"
                                                                          data-testid="color-v2-save"
                                                                          disabled={actingUnit === outcome.unitId}
                                                                          onClick={() => void saveOutcome(outcome)}
                                                                          className="rounded-[3px] border border-[#e5e5ea] px-1.5 py-0.5 text-[11px] leading-4 text-[#5a5a66] transition hover:border-[#723cf9]/50 disabled:opacity-50"
                                                                      >
                                                                          存资产库
                                                                      </button>
                                                                      <button
                                                                          type="button"
                                                                          data-testid="color-v2-send"
                                                                          disabled={actingUnit === outcome.unitId}
                                                                          onClick={() => void sendOutcome(outcome)}
                                                                          className="rounded-[3px] border border-[#e5e5ea] px-1.5 py-0.5 text-[11px] leading-4 text-[#5a5a66] transition hover:border-[#723cf9]/50 disabled:opacity-50"
                                                                      >
                                                                          发画布
                                                                      </button>
                                                                  </>
                                                              ) : null}
                                                              {outcome && status !== "succeeded" && !busy ? (
                                                                  <button
                                                                      type="button"
                                                                      data-testid="color-v2-retry-unit"
                                                                      onClick={() => void retryUnit(unit)}
                                                                      title="只重试这一张，其余结果保持不变"
                                                                      className="rounded-[3px] border border-[#e5e5ea] px-1.5 py-0.5 text-[11px] leading-4 text-[#723cf9] transition hover:border-[#723cf9]/50"
                                                                  >
                                                                      重试
                                                                  </button>
                                                              ) : null}
                                                          </div>
                                                      </figcaption>
                                                  </figure>
                                              );
                                          })
                                        : null}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setShowSnapshot((value) => !value)}
                                    aria-expanded={showSnapshot}
                                    className="text-[11px] leading-4 text-[#6b6b80] underline-offset-2 transition hover:text-[#723cf9] hover:underline"
                                >
                                    {showSnapshot ? "收起本次输入快照" : "查看本次输入快照"}
                                </button>
                                {showSnapshot ? (
                                    <pre
                                        data-testid="color-v2-snapshot"
                                        className="max-h-[240px] overflow-auto rounded-[6px] border border-[#ededf0] bg-white p-2 text-[11px] leading-4 text-[#5a5a66]"
                                    >
                                        {JSON.stringify(currentSnapshot, null, 2)}
                                    </pre>
                                ) : null}
                            </div>
                        ) : (
                            <div className="mx-auto flex h-full w-full max-w-[1000px] flex-col justify-center px-6 py-4">
                                {stepDismissed ? null : (
                                    <div className="flex items-center gap-3">
                                        <span className="text-[14px] leading-5 text-[#1f1f2c]">第一步：上传 1 张需要换色的商品图片</span>
                                        <button
                                            type="button"
                                            data-testid="color-v2-dismiss-step"
                                            onClick={() => setStepDismissed(true)}
                                            className="text-[12px] leading-4 text-[#723cf9] transition hover:underline"
                                        >
                                            我是高手，不再提醒
                                        </button>
                                    </div>
                                )}
                                <h2 className="mt-1 text-center text-[20px] font-medium leading-7 text-[#1f1f2c]">上传整套商品图，批量生成多色变体结果</h2>
                                <div className="mt-5 flex justify-center">
                                    <div className="flex w-[474px] max-w-full flex-col items-center rounded-[8px] bg-white px-10 py-8 text-center">
                                        <div className="flex size-16 items-center justify-center rounded-[18px] bg-[#723cf9]/10">
                                            <ImagePlus className="size-7 text-[#723cf9]" aria-hidden="true" />
                                        </div>
                                        <p data-testid="color-v2-empty-hint" className="mt-3 text-[12px] leading-5 text-[#8a8a99]">
                                            拖拽图片到此处或点击上传，支持一次多张
                                        </p>
                                        <div className="mt-4 w-[210px] text-left">
                                            <ToolAssetInput
                                                toolId={TOOL_ID}
                                                maxCount={COLOR_V2_MAX_SUITE_IMAGES}
                                                constraints={SUITE_CONSTRAINTS}
                                                disabled={busy}
                                                variant="linkfox"
                                                title=""
                                                uploadLabel="从本地上传"
                                                onChange={(ids, records) => {
                                                    setSuiteIds(ids);
                                                    setSuiteRecords(records);
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    ) : rightTab === "cases" ? (
                        <div className="p-3">
                            <p className="mb-2 text-[12px] leading-4 text-[#8a8a99]">共 {COLOR_REGION_PRESETS.length} 个部位案例模板，点「一键做同款」把部位写进换色部位。</p>
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                                {COLOR_REGION_PRESETS.map((preset) => (
                                    <article key={preset.key} className="overflow-hidden rounded-[8px] border border-[#ededf0] bg-white">
                                        <div className="flex h-[110px] items-center justify-center bg-[linear-gradient(135deg,#f4ecff,#eef3ff)]">
                                            <span className="text-[22px] font-medium text-[#723cf9]/70">{preset.label}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-2 p-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-[12px] leading-4 text-[#1f1f2c]">{preset.label}换色</p>
                                                <p className="text-[11px] leading-4 text-[#8a8a99]">整套商品图统一换色</p>
                                            </div>
                                            <button
                                                type="button"
                                                data-testid={`color-v2-apply-${preset.key}`}
                                                onClick={() => {
                                                    commit({ ...valuesRef.current, region: sanityRegion(preset.label) });
                                                    setRightTab("result");
                                                    setNotice(`已套用「${preset.label}」换色部位`);
                                                }}
                                                className="shrink-0 rounded-[4px] border border-[#723cf9] px-2 py-0.5 text-[11px] leading-4 text-[#723cf9] transition hover:bg-[#f9f0ff]"
                                            >
                                                一键做同款
                                            </button>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="p-3">
                            <ToolTaskHistory toolId={TOOL_ID} emptyHint="还没有换色任务，生成一次后会出现在这里。" />
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}

export default ColorV2Workspace;
