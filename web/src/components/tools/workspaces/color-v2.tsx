import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolShell } from "@/components/tools/tool-shell";
import { saveResultItemToAssets, sendResultItemToCanvas } from "@/components/tools/tool-result-actions";
import {
    assetRecordToReference,
    auditSuiteConsistency,
    buildSuiteFromValues,
    createTaskStoreRunPort,
    mergeOutcomes,
    retryableUnits,
    runColorV2Suite,
    sampleImagePalette,
    paletteToPlans,
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
    DEFAULT_COLOR_ADJUSTMENT,
    addColorPlan,
    adjustmentKey,
    adjustmentSummary,
    buildColorV2Snapshot,
    createColorPlan,
    estimatedOutputCount,
    getQualityLevel,
    isSnapshotStale,
    normalizeAdjustment,
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
 * 小部件
 * ------------------------------------------------------------------ */

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
    return (
        <section id={id} className="rounded-lg border border-border bg-card">
            <header className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2">
                <h2 className="text-sm font-medium">{title}</h2>
                {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
            </header>
            <div className="space-y-3 p-3">{children}</div>
        </section>
    );
}

function Swatch({ plan, size = "size-5" }: { plan: ColorPlan; size?: string }) {
    const hex = planSwatch(plan);
    if (hex) {
        return <span aria-hidden className={cn("inline-block shrink-0 rounded border border-border", size)} style={{ backgroundColor: hex }} />;
    }
    return (
        <span className={cn("inline-flex shrink-0 items-center justify-center rounded border border-dashed border-border text-[9px] text-muted-foreground", size)} title="参考图方案，无固定色值">
            图
        </span>
    );
}

function Pill({ active, children, onClick, title }: { active?: boolean; children: React.ReactNode; onClick?: () => void; title?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            aria-pressed={active}
            className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition",
                active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
        >
            {children}
        </button>
    );
}

const SOURCE_LABEL: Record<ColorPlan["source"], string> = { reference: "参考图", product: "商品提色", history: "历史" };

const STATUS_LABEL: Record<ColorV2UnitOutcome["status"], string> = {
    succeeded: "已完成",
    failed: "失败",
    unknown: "结果未定",
    cancelled: "已取消",
};

/* ------------------------------------------------------------------ *
 * 页面
 * ------------------------------------------------------------------ */

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

    return (
        <ToolShell
            className={className}
            title={spec?.title ?? "套图换色"}
            subtitle="整套商品图批量换色：一套方案铺满全部商品图，失败单元单独重试，输入变更后结果自动标记为过期"
            badges={
                <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {spec ? `makeType ${spec.makeType}` : "CHANGE_COLOR_V2"}
                </span>
            }
            actions={
                <button
                    type="button"
                    disabled={busy}
                    onClick={runSuite}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {busy ? `生成中 ${progress.done}/${progress.total}` : "开始换色"}
                </button>
            }
            notices={
                <>
                    {conflict ? (
                        <p key="conflict" className="mb-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            该工具的其他标签页修改了草稿，当前页面可能覆盖远端改动；刷新后再编辑可避免冲突。
                        </p>
                    ) : null}
                    {notice ? <p className="mb-2 rounded border border-border bg-accent px-3 py-2 text-xs">{notice}</p> : null}
                    {stale ? (
                        <p className="mb-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                            输入已变更，下面的结果是旧快照的产物（快照 {runHash?.slice(0, 8)}），重新生成才会反映当前设置。
                        </p>
                    ) : null}
                </>
            }
            sidebar={
                <nav className="space-y-1 p-2 text-sm">
                    {[
                        ["suite", "整套商品图"],
                        ["plans", "换色方案"],
                        ["region", "换色部位"],
                        ["quality", "品质"],
                        ["adjust", "单图微调"],
                        ["results", "整套结果"],
                    ].map(([id, label]) => (
                        <a key={id} href={`#${id}`} className="block rounded px-2 py-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground">
                            {label}
                        </a>
                    ))}
                    <Link to={`/tools/ecommerce-suite/${CHANGE_COLOR_V2_SLUG}`} className="mt-2 block rounded px-2 py-1.5 text-xs text-muted-foreground underline-offset-2 hover:underline">
                        本页规范：{CHANGE_COLOR_V2_SLUG}
                    </Link>
                </nav>
            }
        >
            <div className={cn("grid min-h-0 gap-4 p-4 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]")}>
                <div className="space-y-4">
                    <Section id="suite" title="1 · 整套商品图" hint={`${suiteIds.length}/${COLOR_V2_MAX_SUITE_IMAGES} 张`}>
                        <ToolAssetInput
                            toolId={TOOL_ID}
                            title="上传整套商品图"
                            maxCount={COLOR_V2_MAX_SUITE_IMAGES}
                            constraints={SUITE_CONSTRAINTS}
                            disabled={busy}
                            onChange={(ids, records) => {
                                setSuiteIds(ids);
                                setSuiteRecords(records);
                            }}
                        />
                        {suiteRecords.length ? (
                            <div className="flex flex-wrap gap-2">
                                {suiteRecords.map((record) => (
                                    <button
                                        key={record.id}
                                        type="button"
                                        disabled={busy || extracting === record.id}
                                        onClick={() => void extractPalette(record)}
                                        className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-50"
                                        title="从这张商品图提取 5 个主色作为方案"
                                    >
                                        {extracting === record.id ? "提色中…" : `从「${record.name}」提色`}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </Section>

                    <Section id="plans" title="2 · 换色方案" hint={`${values.plans.length}/${COLOR_V2_MAX_REFERENCE_IMAGES} 个`}>
                        <div className="flex flex-wrap items-center gap-2">
                            <input
                                ref={referenceInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                multiple
                                hidden
                                onChange={(event) => {
                                    const files = Array.from(event.target.files ?? []);
                                    event.target.value = "";
                                    void addReferenceFiles(files);
                                }}
                            />
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => referenceInputRef.current?.click()}
                                className="rounded border border-border px-2 py-1 text-xs transition hover:bg-accent disabled:opacity-50"
                            >
                                上传参考图
                            </button>
                            <span className="text-[11px] text-muted-foreground">参考图只提供颜色与材质依据，不参与构图</span>
                        </div>

                        {referenceRecords.length ? (
                            <div className="flex flex-wrap gap-1.5">
                                {referenceRecords.map((record) => (
                                    <Pill
                                        key={record.id}
                                        active={values.referenceAssetIds.includes(record.id)}
                                        onClick={() => toggleReferenceRecord(record)}
                                        title="点击切换该参考图方案是否启用"
                                    >
                                        {record.name}
                                    </Pill>
                                ))}
                            </div>
                        ) : null}

                        {values.plans.length === 0 ? (
                            <p className="text-xs text-muted-foreground">还没有换色方案：上传参考图、从商品图提色，或点下面任一历史颜色。</p>
                        ) : (
                            <ul className="space-y-1">
                                {values.plans.map((plan) => (
                                    <li
                                        key={plan.id}
                                        className={cn(
                                            "flex items-center gap-2 rounded border px-2 py-1.5 text-xs",
                                            plan.id === selectedPlan?.id ? "border-primary bg-primary/5" : "border-border",
                                        )}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => commit({ ...valuesRef.current, selectedPlanId: plan.id })}
                                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                            aria-pressed={plan.id === selectedPlan?.id}
                                        >
                                            <Swatch plan={plan} />
                                            <span className="truncate">{planLabel(plan)}</span>
                                            <span className="shrink-0 rounded border border-border px-1 text-[10px] text-muted-foreground">{SOURCE_LABEL[plan.source]}</span>
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={`移除方案 ${plan.name}`}
                                            onClick={() => {
                                                const current = valuesRef.current;
                                                commit({
                                                    ...current,
                                                    plans: removeColorPlan(current.plans, plan.id),
                                                    selectedPlanId: current.selectedPlanId === plan.id ? null : current.selectedPlanId,
                                                    referenceAssetIds: plan.referenceAssetId
                                                        ? current.referenceAssetIds.filter((id) => id !== plan.referenceAssetId)
                                                        : current.referenceAssetIds,
                                                });
                                            }}
                                            className="shrink-0 rounded px-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                                        >
                                            ×
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {values.historyColors.length ? (
                            <div className="space-y-1">
                                <p className="text-[11px] text-muted-foreground">历史使用颜色</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {values.historyColors.map((hex) => (
                                        <button
                                            key={hex}
                                            type="button"
                                            onClick={() => addHistoryColor(hex)}
                                            className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] transition hover:bg-accent"
                                            title={`把 ${hex} 加为一个换色方案`}
                                        >
                                            <span aria-hidden className="size-3 rounded-sm border border-border" style={{ backgroundColor: hex }} />
                                            {hex}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </Section>

                    <Section id="region" title="3 · 换色部位" hint={`${values.region.length}/${COLOR_V2_MAX_REGION_LENGTH}`}>
                        <div className="flex flex-wrap gap-1.5">
                            {COLOR_REGION_PRESETS.map((preset) => (
                                <Pill
                                    key={preset.key}
                                    active={sanityRegion(values.region) === preset.label}
                                    onClick={() => commit({ ...valuesRef.current, region: preset.label })}
                                >
                                    {preset.label}
                                </Pill>
                            ))}
                        </div>
                        <input
                            value={values.region}
                            maxLength={COLOR_V2_MAX_REGION_LENGTH}
                            onChange={(event) => commit({ ...valuesRef.current, region: sanityRegion(event.target.value) })}
                            placeholder="不选则按商品主体处理"
                            className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                    </Section>

                    <Section id="quality" title="4 · 品质">
                        <div className="grid gap-1.5">
                            {COLOR_QUALITY_LEVELS.map((level) => (
                                <label
                                    key={level.key}
                                    className={cn(
                                        "flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-xs",
                                        values.quality === level.key ? "border-primary bg-primary/5" : "border-border",
                                    )}
                                >
                                    <input
                                        type="radio"
                                        name="color-v2-quality"
                                        checked={values.quality === level.key}
                                        onChange={() => commit({ ...valuesRef.current, quality: level.key as ColorQualityKey })}
                                    />
                                    <span>{level.label}</span>
                                    <span className="ml-auto text-[10px] text-muted-foreground">{level.providerQuality}</span>
                                </label>
                            ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground">当前档位：{getQualityLevel(values.quality).label}</p>
                    </Section>

                    <Section id="adjust" title="5 · 单图微调" hint="只影响选中的那张商品图">
                        {suiteRecords.length === 0 ? (
                            <p className="text-xs text-muted-foreground">先上传商品图，再按图微调颜色。</p>
                        ) : (
                            <>
                                <select
                                    value={values.selectedAssetId ?? suiteRecords[0].id}
                                    onChange={(event) => commit({ ...valuesRef.current, selectedAssetId: event.target.value })}
                                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
                                >
                                    {suiteRecords.map((record) => (
                                        <option key={record.id} value={record.id}>
                                            {record.name}
                                        </option>
                                    ))}
                                </select>
                                {(() => {
                                    const assetId = values.selectedAssetId ?? suiteRecords[0].id;
                                    const adjustment = normalizeAdjustment(values.adjustments[assetId]);
                                    const setAdjustment = (patch: Partial<typeof adjustment>) =>
                                        commit({
                                            ...valuesRef.current,
                                            adjustments: { ...valuesRef.current.adjustments, [assetId]: normalizeAdjustment({ ...adjustment, ...patch }) },
                                        });
                                    const rows: Array<[string, keyof typeof adjustment, number, number, number]> = [
                                        ["色相", "hue", -180, 180, 1],
                                        ["饱和度", "saturation", 40, 160, 1],
                                        ["明度", "lightness", 40, 160, 1],
                                        ["上色强度", "strength", 0, 100, 1],
                                    ];
                                    return (
                                        <div className="space-y-2">
                                            {rows.map(([label, key, min, max, step]) => (
                                                <label key={key} className="block text-xs">
                                                    <span className="flex items-center justify-between text-muted-foreground">
                                                        <span>{label}</span>
                                                        <span>{adjustment[key]}</span>
                                                    </span>
                                                    <input
                                                        type="range"
                                                        min={min}
                                                        max={max}
                                                        step={step}
                                                        value={adjustment[key]}
                                                        onChange={(event) => setAdjustment({ [key]: Number(event.target.value) })}
                                                        className="w-full"
                                                    />
                                                </label>
                                            ))}
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[11px] text-muted-foreground">
                                                    {adjustmentKey(adjustment) === adjustmentKey(DEFAULT_COLOR_ADJUSTMENT) ? "默认（无微调）" : adjustmentSummary(adjustment)}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setAdjustment(DEFAULT_COLOR_ADJUSTMENT)}
                                                    className="rounded border border-border px-2 py-1 text-[11px] transition hover:bg-accent"
                                                >
                                                    重置
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </>
                        )}
                    </Section>

                    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                                {suiteIds.length} 张商品图 × {values.plans.length} 个方案 = {plannedCount} 张输出
                            </span>
                            <span className="text-[11px] text-muted-foreground">快照 {currentSnapshot.hash.slice(0, 8)}</span>
                        </div>
                        {issues.length ? (
                            <ul className="space-y-1 text-[11px] text-destructive">
                                {issues.map((issue) => (
                                    <li key={`${issue.field}:${issue.message}`}>· {issue.message}</li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-[11px] text-muted-foreground">校验通过，可以开始换色。</p>
                        )}
                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={busy || issues.length > 0}
                                onClick={() => void runSuite()}
                                className="flex-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {busy ? `生成中 ${progress.done}/${progress.total}` : "开始换色"}
                            </button>
                            {busy ? (
                                <button type="button" onClick={stop} className="rounded-md border border-border px-3 py-2 text-xs transition hover:bg-accent">
                                    取消
                                </button>
                            ) : null}
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowSnapshot((prev) => !prev)}
                            className="w-full rounded border border-border px-3 py-1.5 text-[11px] text-muted-foreground transition hover:bg-accent"
                            aria-expanded={showSnapshot}
                        >
                            {showSnapshot ? "收起本次输入快照" : "查看本次输入快照"}
                        </button>
                        {showSnapshot ? (
                            <pre className="max-h-56 overflow-auto rounded border border-border bg-muted/40 p-2 text-[10px] leading-relaxed">
                                {JSON.stringify({ snapshot: currentSnapshot, values: { ...values, plans: values.plans.map((plan) => ({ ...plan, createdAt: plan.createdAt })) } }, null, 2)}
                            </pre>
                        ) : null}
                    </div>
                </div>

                <div className="min-w-0 space-y-4">
                    <Section
                        id="results"
                        title="6 · 整套结果"
                        hint={units.length ? `${succeeded}/${units.length} 张完成` : "尚未生成"}
                    >
                        {units.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                                {hydrated ? "还没有结果：左侧补齐商品图与方案后点「开始换色」，每张图 × 每个方案都会生成一张。" : "正在恢复草稿…"}
                            </p>
                        ) : (
                            <>
                                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                    <span className="rounded border border-border px-1.5 py-0.5">单元 {units.length}</span>
                                    <span className="rounded border border-border px-1.5 py-0.5">成功 {succeeded}</span>
                                    <span className="rounded border border-border px-1.5 py-0.5">未完成 {units.length - succeeded}</span>
                                    {consistency ? (
                                        <span className={cn("rounded border px-1.5 py-0.5", consistency.completeMatrix ? "border-emerald-500/40 text-emerald-600" : "border-amber-500/40 text-amber-600")}>
                                            {consistency.completeMatrix ? "矩阵完整" : "矩阵不完整"}
                                        </span>
                                    ) : null}
                                    {runHash ? <span className="text-muted-foreground">快照 {runHash.slice(0, 8)}</span> : null}
                                    <button
                                        type="button"
                                        disabled={busy || retryableUnits(units, outcomes).length === 0}
                                        onClick={() => void retryFailed()}
                                        className="ml-auto rounded border border-border px-2 py-1 transition hover:bg-accent disabled:opacity-40"
                                    >
                                        重试失败项
                                    </button>
                                </div>

                                {consistency && consistency.deviatingUnits.length ? (
                                    <ul className="space-y-0.5 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                                        {consistency.deviatingUnits.map((item) => (
                                            <li key={item.unitId}>
                                                · {item.assetId} / {item.planId}：{item.summary}
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}

                                {planRows.length ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-[11px]">
                                            <thead className="text-muted-foreground">
                                                <tr>
                                                    <th className="py-1 text-left font-normal">方案</th>
                                                    <th className="py-1 text-right font-normal">完成</th>
                                                    <th className="py-1 text-right font-normal">失败</th>
                                                    <th className="py-1 text-right font-normal">未定</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {planRows.map((row) => (
                                                    <tr key={row.planId} className="border-t border-border">
                                                        <td className="py-1">
                                                            <span className="inline-flex items-center gap-1.5">
                                                                {row.hex ? <span aria-hidden className="size-3 rounded-sm border border-border" style={{ backgroundColor: row.hex }} /> : null}
                                                                {row.planName}
                                                            </span>
                                                        </td>
                                                        <td className="py-1 text-right">
                                                            {row.succeeded}/{row.total}
                                                        </td>
                                                        <td className="py-1 text-right">{row.failed}</td>
                                                        <td className="py-1 text-right">{row.unknown}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : null}

                                <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                                    {actionNotice ? (
                                        <p data-testid="color-v2-action-notice" className="sm:col-span-2 2xl:col-span-3 rounded border border-border bg-accent px-2 py-1 text-[11px]">
                                            {actionNotice}
                                        </p>
                                    ) : null}
                                    {units.map((unit) => {
                                        const outcome = outcomeByUnit.get(unit.unitId);
                                        const plan = values.plans.find((item) => item.id === unit.planId);
                                        const asset = suiteRecords.find((item) => item.id === unit.assetId);
                                        const src = outcome?.image?.dataUrl || outcome?.image?.url;
                                        return (
                                            <figure key={unit.unitId} className="overflow-hidden rounded border border-border bg-background">
                                                <div className="relative aspect-square bg-muted/40">
                                                    {src ? (
                                                        <img src={src} alt={`${asset?.name ?? unit.assetId} · ${plan?.name ?? unit.planId}`} className="size-full object-contain" />
                                                    ) : (
                                                        <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-[11px] text-muted-foreground">
                                                            <span>{outcome ? STATUS_LABEL[outcome.status] : "排队中"}</span>
                                                            {outcome?.error ? <span className="line-clamp-3 text-destructive">{outcome.error.message}</span> : null}
                                                        </div>
                                                    )}
                                                </div>
                                                <figcaption className="space-y-1 border-t border-border px-2 py-1.5">
                                                    <div className="flex items-center justify-between gap-1 text-[11px]">
                                                        <span className="inline-flex min-w-0 items-center gap-1">
                                                            {plan ? <Swatch plan={plan} size="size-3" /> : null}
                                                            <span className="truncate">{asset?.name ?? unit.assetId}</span>
                                                        </span>
                                                        <span className="shrink-0 text-muted-foreground">{plan?.name ?? unit.planId}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        {outcome?.status === "succeeded" ? (
                                                            <>
                                                                <button type="button" onClick={() => download(outcome)} className="rounded border border-border px-1.5 py-0.5 text-[10px] transition hover:bg-accent">
                                                                    下载
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={actingUnit === outcome.unitId}
                                                                    onClick={() => void saveOutcome(outcome)}
                                                                    className="rounded border border-border px-1.5 py-0.5 text-[10px] transition hover:bg-accent disabled:opacity-40"
                                                                >
                                                                    存入资产
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={actingUnit === outcome.unitId}
                                                                    onClick={() => void sendOutcome(outcome)}
                                                                    className="rounded border border-border px-1.5 py-0.5 text-[10px] transition hover:bg-accent disabled:opacity-40"
                                                                >
                                                                    发画布
                                                                </button>
                                                            </>
                                                        ) : null}
                                                        {outcome && outcome.status !== "succeeded" ? (
                                                            <button
                                                                type="button"
                                                                disabled={busy}
                                                                onClick={() => void retryUnit(unit)}
                                                                className="rounded border border-border px-1.5 py-0.5 text-[10px] transition hover:bg-accent disabled:opacity-40"
                                                            >
                                                                重试
                                                            </button>
                                                        ) : null}
                                                        <button
                                                            type="button"
                                                            onClick={() => void navigator.clipboard?.writeText(unit.prompt)}
                                                            className="ml-auto rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:bg-accent"
                                                        >
                                                            复制提示词
                                                        </button>
                                                    </div>
                                                </figcaption>
                                            </figure>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </Section>
                </div>
            </div>
        </ToolShell>
    );
}

export default ColorV2Workspace;
