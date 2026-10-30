import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, Sparkles } from "lucide-react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { WatermarkGroupPanel } from "@/components/tools/watermark-group-panel";
import { ToolCases } from "@/components/tools/tool-cases";
import type { ToolCase } from "@/components/tools/tool-cases";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { uploadCaseFiles } from "@/features/tools/case-apply";
import { COLOR_V2_CASES } from "@/features/tools/suite6-cases-data";
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
import { ECOMMERCE_SUITE_RAIL, OrigRail } from "@/components/tools/workspaces/orig-rail";
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
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";

const TOOL_ID = CHANGE_COLOR_V2_TOOL_ID;
const SUITE_CONSTRAINTS = { maxBytes: COLOR_V2_MAX_BYTES } as const;

/** 单张结果消耗算力（原站「开始生成（50算力）」按方案×图计）。 */
const COLOR_V2_UNIT_POINTS = 50;

export interface ColorV2WorkspaceProps {
    className?: string;
}

/* ------------------------------------------------------------------ *
 * 小部件（对齐原站：46px 分区标题条 / 12px 标题 / #723cf9 主色）
 * ------------------------------------------------------------------ */

function PanelSection({ id, title, hint, defaultOpen = true, children }: { id?: string; title: string; hint?: string; defaultOpen?: boolean; children: React.ReactNode }) {
    // 原站每个分区标题是可点的折叠头（上传图片 / 颜色选择 / 换色部位 / 模型设置）
    // 换色部位、模型设置原站默认收起，故可点入口只有标题
    const [open, setOpen] = useState(defaultOpen);
    return (
        <section id={id} data-section={id} className="border-b border-border">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                data-testid={id ? `color-v2-section-${id}` : undefined}
                className="flex h-[46px] w-full items-center justify-between gap-2 px-4 text-left"
            >
                <h2 style={{ fontSize: 12, fontWeight: 600, lineHeight: 1 }} className="text-foreground">{title}</h2>
                {hint ? <span style={{ fontSize: 12, lineHeight: 1 }} className="text-muted-foreground">{hint}</span> : null}
            </button>
            {open ? <div className="pb-4">{children}</div> : null}
        </section>
    );
}

function Swatch({ plan, size = "size-4" }: { plan: ColorPlan; size?: string }) {
    const hex = planSwatch(plan);
    if (hex) {
        return <span aria-hidden className={cn("inline-block shrink-0 rounded-[3px] border border-border", size)} style={{ backgroundColor: hex }} />;
    }
    return (
        <span className={cn("inline-flex shrink-0 items-center justify-center rounded-[3px] border border-dashed border-border text-[9px] text-muted-foreground", size)} title="参考图方案，无固定色值">
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
    // A:69-72 节日主题横幅（可关闭），A:1-11 登录签到条
    const [holidayDismissed, setHolidayDismissed] = useState(false);
    const [actingUnit, setActingUnit] = useState<string | null>(null);
    const [actionNotice, setActionNotice] = useState("");
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [outcomes, setOutcomes] = useState<ColorV2UnitOutcome[]>([]);
    const [runHash, setRunHash] = useState<string | null>(null);
    const [units, setUnits] = useState<ColorV2Unit[]>([]);
    const [extracting, setExtracting] = useState<string | null>(null);
    const [showSnapshot, setShowSnapshot] = useState(false);
    /** 历史记录里选中的任务：选中后结果区按它渲染真实结果（含三动作）。 */
    const [pickedTask, setPickedTask] = useState<ToolTask | null>(null);

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

    /* ---------------- 「优秀案例」做同款：真实素材入库 + 回填商品图/部位/颜色 ---------------- */

    const [applyingCaseId, setApplyingCaseId] = useState<string | null>(null);
    const [caseApplyNonce, setCaseApplyNonce] = useState(0);

    const applyCase = useCallback(
        async (item: ToolCase) => {
            setApplyingCaseId(item.id);
            setNotice("");
            try {
                const assets = await uploadCaseFiles(item);
                const record = assets.source as ToolAssetRecord | ToolAssetRecord[] | undefined;
                if (!record || Array.isArray(record)) throw new Error("该案例缺少可用的商品图");

                setSuiteIds([record.id]);
                setSuiteRecords([record]);
                patchDraft(TOOL_ID, { assetIds: [record.id] });
                setCaseApplyNonce((value) => value + 1);

                const apply = item.apply ?? {};
                const region = typeof apply.colorSubject === "string" ? sanityRegion(apply.colorSubject) : "";
                const colors = Array.isArray(apply.colors) ? (apply.colors as string[]) : [];

                let plans = valuesRef.current.plans;
                for (const hex of colors) {
                    plans = addColorPlan(plans, createColorPlan({ source: "history", hex }));
                }
                const lastPlanId = plans[plans.length - 1]?.id ?? null;

                commit({
                    ...valuesRef.current,
                    plans,
                    selectedPlanId: lastPlanId ?? valuesRef.current.selectedPlanId,
                    region: region || valuesRef.current.region,
                });
                setRightTab("result");
                setNotice(`已套用案例商品图，换色部位「${region || "未标注"}」已回填`);
            } catch (error) {
                setNotice(error instanceof Error ? error.message : "案例套用失败");
            } finally {
                setApplyingCaseId(null);
            }
        },
        [commit],
    );

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
    /** 结果区分页（原站底部 1~6 页码）。 */
    const [resultPage, setResultPage] = useState(1);
    const qualityLevel = getQualityLevel(values.quality);

    /* ---------------- 刷新恢复：落盘任务 → 结果区（G1 遗留缺口） ----------------
     * 结果区原先只认本会话 state，刷新后 outcomes 归零 → 结果空白、三动作点不到。
     * 这里从任务库（localStorage 快照 + media_files 字节）取回真实结果：
     * 结果项的 storageKey 已由 store 在 hydrate 时重建成对象 URL，下载/存资产/发画布继续可用。
     */
    const storedTasks = useToolTaskStore((state) => state.tasks);
    const tasksHydrated = useToolTaskStore((state) => state.hydrated);
    const hydrateTasks = useToolTaskStore((state) => state.hydrate);
    useEffect(() => {
        if (!tasksHydrated) hydrateTasks();
    }, [tasksHydrated, hydrateTasks]);

    const restoredTask = useMemo(() => {
        if (pickedTask) return pickedTask;
        const candidates = Object.values(storedTasks).filter(
            (task) =>
                task.toolId === TOOL_ID &&
                task.status === "succeeded" &&
                (task.result?.items ?? []).some((item) => item.kind === "image" && (item.dataUrl || item.url || item.storageKey)),
        );
        candidates.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
        return candidates[0] ?? null;
    }, [pickedTask, storedTasks]);

    const restoredItems = useMemo(() => {
        if (!restoredTask) return [] as ToolTaskResultItem[];
        return (restoredTask.result?.items ?? []).filter((item) => item.kind === "image" && (item.dataUrl || item.url || item.storageKey));
    }, [restoredTask]);

    const restoredTitle = useCallback(
        (item: ToolTaskResultItem, index: number) => {
            const plan = valuesRef.current.plans[index % Math.max(1, valuesRef.current.plans.length)];
            const asset = suiteRecords[0];
            const base = `${(asset?.name ?? "商品图").replace(/\.[^.]+$/, "")}-${plan?.name ?? `结果${index + 1}`}`;
            return base;
        },
        [suiteRecords],
    );

    const downloadRestored = useCallback((item: ToolTaskResultItem, title: string) => {
        const url = item.dataUrl || item.url;
        if (!url) return;
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${title}.png`;
        anchor.click();
    }, []);

    const saveRestored = useCallback(
        async (item: ToolTaskResultItem, title: string) => {
            setActingUnit(item.id);
            setActionNotice("");
            try {
                const saved = await saveResultItemToAssets(
                    { id: item.id, kind: "image", dataUrl: item.dataUrl, url: item.url, mimeType: item.mimeType ?? "image/png" },
                    0,
                    { toolId: TOOL_ID, taskId: restoredTask?.id, title: `${title} 换色结果`, source: CHANGE_COLOR_V2_SLUG },
                );
                setActionNotice(`已存入资产库（${saved.assetId.slice(0, 8)}）`);
            } catch (error) {
                setActionNotice(error instanceof Error ? error.message : "存入资产库失败");
            } finally {
                setActingUnit(null);
            }
        },
        [restoredTask?.id],
    );

    const sendRestored = useCallback(
        async (item: ToolTaskResultItem) => {
            setActingUnit(item.id);
            setActionNotice("");
            try {
                const sent = await sendResultItemToCanvas(
                    { id: item.id, kind: "image", dataUrl: item.dataUrl, url: item.url, mimeType: item.mimeType ?? "image/png" },
                    { toolId: TOOL_ID, projectTitle: "套图换色结果" },
                );
                setActionNotice(`已发送画布（项目 ${sent.projectId.slice(0, 8)} · 节点 ${sent.nodeId.slice(0, 8)}）`);
            } catch (error) {
                setActionNotice(error instanceof Error ? error.message : "发送画布失败");
            } finally {
                setActingUnit(null);
            }
        },
        [],
    );

    const showResults = outcomes.length > 0 || busy || restoredItems.length > 0;

    /** 原站底部的「上传多张图片，开始批量套图换色」行：直接触发商品图上传区的文件选择器 */
    const openSuitePicker = useCallback(() => {
        const input = document.querySelector<HTMLInputElement>(`[data-tool="${TOOL_ID}"] [data-testid="tool-asset-file-input"]`);
        input?.click();
    }, []);

    return (
        <div
            data-tool={TOOL_ID}
            data-layout="linkfox-change-color"
            data-spec={spec?.slug ?? CHANGE_COLOR_V2_SLUG}
            style={{ fontFamily: '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif' }}
            className={cn("flex h-full min-h-0 min-w-0 gap-[6px] overflow-hidden bg-card text-[13px] text-foreground", className)}
        >
            <OrigRail items={ECOMMERCE_SUITE_RAIL} active="套图换色" driver testId="change-color-rail" className="m-1 shrink-0" />
            {/* 左：300px 参数面板（原站 x190 w300；提交条固定在面板底部） */}
            <section data-region="params" className="flex h-full w-[300px] shrink-0 flex-col overflow-hidden">
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
                <div data-region="params-scroll" className="min-h-0 flex-1 overflow-y-auto">
                    <PanelSection id="upload" title="上传图片">
                        <div className="px-4">
                            <ToolAssetInput
                                key={`case-${caseApplyNonce}`}
                                toolId={TOOL_ID}
                                maxCount={COLOR_V2_MAX_SUITE_IMAGES}
                                constraints={SUITE_CONSTRAINTS}
                                disabled={busy}
                                title=""
                                variant="linkfox"
                                wide
                                compact
                                className="[&>[data-testid=tool-asset-dropzone]]:min-h-[88px] [&>[data-testid=tool-asset-dropzone]]:gap-[10px] [&>[data-testid=tool-asset-dropzone]]:rounded-lg [&>[data-testid=tool-asset-dropzone]]:border-0 [&>[data-testid=tool-asset-dropzone]]:bg-card [&>[data-testid=tool-asset-dropzone]]:px-3 [&>[data-testid=tool-asset-dropzone]]:py-[10px]"
                                uploadLabel="从本地上传"
                                hint={
                                    <span style={{ fontSize: 12, lineHeight: "17px" }} className="block w-full text-center text-muted-foreground">
                                        10M以内，分辨率：384*384 ~ 4096*4096，最大宽高比5
                                    </span>
                                }
                                onChange={(ids, records) => {
                                    setSuiteIds(ids);
                                    setSuiteRecords(records);
                                }}
                            />
                            <button
                                type="button"
                                data-testid="color-v2-suite-upload-batch"
                                disabled={busy}
                                onClick={() => openSuitePicker()}
                                onMouseDown={(event) => event.stopPropagation()}
                                style={{ fontSize: 14 }}
                                className="mt-[10px] h-8 w-full rounded-lg text-foreground transition hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                上传多张图片，开始批量套图换色
                            </button>
                            {suiteRecords.length ? (
                                <ul data-testid="color-v2-suite-list" className="mt-3 grid grid-cols-3 gap-2">
                                    {suiteRecords.map((record) => (
                                        <li key={record.id} className="min-w-0">
                                            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-border bg-card">
                                                {record.url ? (
                                                    <img src={record.url} alt={record.name} className="h-full w-full object-cover" />
                                                ) : (
                                                    <span className="text-[10px] text-muted-foreground">无预览</span>
                                                )}
                                            </div>
                                            <p className="mt-1 truncate text-[11px] leading-4 text-muted-foreground" title={record.name}>
                                                {record.name}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </div>
                    </PanelSection>

                    <PanelSection id="plans" title="颜色选择">
                        <div className="px-4">
                            <div role="tablist" aria-label="取色方式" className="flex h-[34px] w-full items-center rounded-lg bg-border p-[2px]">
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={colorMode === "extract"}
                                    data-testid="color-v2-mode-extract"
                                    onClick={() => setColorMode("extract")}
                                    style={{ fontSize: 12, fontWeight: 600 }}
                                    className={cn(
                                        "h-full flex-1 rounded-lg leading-none transition",
                                        colorMode === "extract" ? "bg-card text-primary shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-muted-foreground",
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
                                        "h-full flex-1 rounded-lg leading-none transition",
                                        colorMode === "history" ? "bg-card text-primary shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-muted-foreground",
                                    )}
                                >
                                    历史使用颜色
                                </button>
                            </div>

                            {colorMode === "extract" ? (
                                <div className="mt-[10px]">
                                    <div
                                        role="button"
                                        tabIndex={busy ? -1 : 0}
                                        aria-disabled={busy}
                                        data-testid="color-v2-reference-dropzone"
                                        aria-label="点击或拖拽批量上传商品参考图"
                                        onClick={() => {
                                            if (!busy) referenceInputRef.current?.click();
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key !== "Enter" && event.key !== " ") return;
                                            event.preventDefault();
                                            if (!busy) referenceInputRef.current?.click();
                                        }}
                                        onDragOver={(event) => {
                                            if (busy) return;
                                            event.preventDefault();
                                        }}
                                        onDrop={(event) => {
                                            if (busy) return;
                                            event.preventDefault();
                                            const files = Array.from(event.dataTransfer?.files ?? []);
                                            if (files.length) void addReferenceFiles(files);
                                        }}
                                        className={cn(
                                            "flex min-h-[72px] w-full cursor-pointer flex-col items-center justify-center gap-[6px] rounded-lg bg-card px-3 py-[10px] transition",
                                            busy ? "cursor-not-allowed opacity-60" : "hover:bg-border",
                                        )}
                                    >
                                        <p style={{ fontSize: 12, lineHeight: "19px" }} className="text-center text-foreground">
                                            拖拽 或{" "}
                                            <b className="font-bold text-primary">
                                                点击批量上传
                                            </b>{" "}
                                            商品参考图
                                        </p>
                                        <p style={{ fontSize: 11, lineHeight: "17px" }} className="max-w-[214px] text-center text-muted-foreground">
                                            整张商品图作为换色参考 · 支持多选 · 最多 {COLOR_V2_MAX_REFERENCE_IMAGES} 张 · 单张 10M 以内
                                        </p>
                                    </div>
                                    <p
                                        data-testid="color-v2-plan-count"
                                        style={{ fontSize: 12, fontWeight: 500, lineHeight: "19px" }}
                                        className="mt-2 text-foreground"
                                    >
                                        本次换色方案 · {referenceRecords.length} 张参考图
                                    </p>
                                    {suiteRecords.length ? (
                                        <div className="mt-2 space-y-1.5">
                                            {suiteRecords.map((record) => (
                                                <button
                                                    key={record.id}
                                                    type="button"
                                                    data-testid="color-v2-extract"
                                                    disabled={busy || extracting === record.id}
                                                    onClick={() => void extractPalette(record)}
                                                    title="从这张商品图提取 5 个主色作为方案"
                                                    className="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1 text-left text-[11px] leading-4 text-muted-foreground transition hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    <ImagePlus className="size-3 shrink-0 text-primary" aria-hidden="true" />
                                                    <span className="truncate">{extracting === record.id ? "提色中…" : `从「${record.name}」提色`}</span>
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
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
                                                                "size-9 overflow-hidden rounded-md border transition",
                                                                active ? "border-primary ring-1 ring-primary/40" : "border-border hover:border-primary/50",
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
                                                        className="size-5 rounded-[3px] border border-border transition hover:scale-110"
                                                        style={{ backgroundColor: hex }}
                                                    />
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-[11px] leading-4 text-muted-foreground">暂无历史使用颜色，提色或手动添加后会出现在这里。</p>
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
                                                        "flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2 py-1 text-left text-[11px] leading-4 transition",
                                                        active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/50",
                                                    )}
                                                >
                                                    <Swatch plan={plan} />
                                                    <span className="min-w-0 flex-1 truncate">{plan.name}</span>
                                                    <span className="shrink-0 text-[10px] text-muted-foreground">{SOURCE_LABEL[plan.source]}</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label={`移除方案 ${plan.name}`}
                                                    disabled={busy}
                                                    onClick={() => commit({ ...valuesRef.current, plans: removeColorPlan(valuesRef.current.plans, plan.id) })}
                                                    className="shrink-0 rounded-[3px] px-1 text-[12px] leading-5 text-muted-foreground transition hover:text-destructive disabled:opacity-40"
                                                >
                                                    ×
                                                </button>
                                            </li>
                                        );
                                    })
                                ) : (
                                    <li className="text-[11px] leading-4 text-muted-foreground">还没有换色方案：从商品图提色、选历史色或上传参考图。</li>
                                )}
                            </ul>
                        </div>
                    </PanelSection>

                    <PanelSection id="region" title="换色部位" defaultOpen={false}>
                        <div className="px-4">
                            <div className="relative">
                                <textarea
                                    data-testid="color-v2-region"
                                    style={{ height: 34, fontSize: 14, lineHeight: "18px" }}
                                    value={values.region}
                                    disabled={busy}
                                    rows={2}
                                    maxLength={COLOR_V2_MAX_REGION_LENGTH}
                                    placeholder="请输入需要换色的部位（必填），如 上装、鞋面"
                                    onChange={(event) => commit({ ...valuesRef.current, region: sanityRegion(event.target.value) })}
                                    className="w-full resize-none rounded-lg border border-border bg-card py-2 pl-[10px] pr-12 text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary disabled:opacity-60"
                                />
                                <span
                                    aria-hidden="true"
                                    style={{ fontSize: 12, lineHeight: "19px" }}
                                    className="pointer-events-none absolute bottom-1 right-2 text-muted-foreground"
                                >
                                    {values.region.length} / {COLOR_V2_MAX_REGION_LENGTH}
                                </span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-[6px]">
                                <span style={{ fontSize: 12, lineHeight: "19px" }} className="text-muted-foreground">
                                    常用
                                </span>
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
                                            style={{ fontSize: 12, lineHeight: "22px", padding: "0 7px", color: active ? "var(--primary)" : "var(--muted-foreground)" }}
                                            className={cn(
                                                "h-[22px] rounded-md transition",
                                                active ? "bg-primary/10" : "bg-transparent hover:bg-border",
                                            )}
                                        >
                                            {preset.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </PanelSection>

                    <PanelSection id="quality" title="模型设置" defaultOpen={false}>
                        <div className="px-4">
                            <p style={{ fontSize: 12, lineHeight: "20px" }} className="text-foreground">模型品质</p>
                            <div className="mt-0.5 flex gap-[10px] rounded-md bg-card p-0.5">
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
                                            style={{ fontSize: 14, fontWeight: 400, color: active ? "var(--primary)" : "var(--muted-foreground)" }}
                                            className={cn(
                                                "h-8 w-[75px] rounded-lg leading-none transition",
                                                active ? "bg-primary/10 font-medium" : "bg-card hover:text-primary",
                                            )}
                                        >
                                            {level.label}
                                        </button>
                                    );
                                })}
                            </div>
                            {plannedCount > 0 ? (
                                <p style={{ fontSize: 11, lineHeight: "17px" }} className="mt-2 text-muted-foreground">
                                    预计输出 {plannedCount} 张（{suiteIds.length} 张商品图 × {values.plans.length} 个方案）
                                </p>
                            ) : null}
                        </div>
                    </PanelSection>

                </div>
                </div>

                <div className="shrink-0 pb-[11px] pt-3">
                    {conflict ? (
                        <p key="conflict" className="mb-2 rounded-md bg-[#fff1f0] px-2 py-1 text-[11px] leading-4 text-destructive">
                            其他标签页改过草稿，当前页面可能覆盖远端改动；刷新后再编辑。
                        </p>
                    ) : null}
                    {stale ? (
                        <p key="stale" data-testid="color-v2-stale" className="mb-2 rounded-md bg-[#fff8e6] px-2 py-1 text-[11px] leading-4 text-[#a86b00]">
                            输入已变更，当前结果来自旧快照 {runHash?.slice(0, 8)}；重新生成才会反映最新设置。
                        </p>
                    ) : null}
                    {notice ? (
                        <p data-testid="color-v2-notice" className="mb-1 text-[11px] leading-4 text-muted-foreground">
                            {notice}
                        </p>
                    ) : null}
                    {issues.length ? (
                        <p data-testid="color-v2-blocked" className="mb-1 text-[11px] leading-4 text-destructive">
                            {issues[0].message}
                        </p>
                    ) : null}
                    <button
                        type="button"
                        data-testid="color-v2-submit"
                        style={{ fontSize: 12 }}
                        disabled={busy || issues.length > 0}
                        title={issues[0]?.message}
                        onClick={() => void runSuite()}
                        className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-lg bg-primary leading-none text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="size-3.5" aria-hidden="true" />}
                                <span className="text-center">{busy ? `生成中 ${progress.done}/${progress.total}` : "开始生成"}</span>
                                <span className="ml-1 text-[11px] text-primary-foreground/80">({Math.max(1, plannedCount) * COLOR_V2_UNIT_POINTS}算力)</span>

                    </button>
                </div>
            </section>

            {/* 右：结果区（原站 42px 白条 tab + #f4f6f8 内容） */}
            <section id="results" data-region="results" className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg bg-card">
                <div role="tablist" aria-label="右栏页签" className="flex h-[42px] shrink-0 items-center gap-[14px] bg-card px-3">
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
                                rightTab === item.key ? "text-primary" : "text-foreground hover:text-primary",
                            )}
                        >
                            {item.label}
                        </button>
                    ))}
                    <button
                        type="button"
                        data-testid="color-v2-tab-history"
                        onClick={() => setRightTab("history")}
                        style={{ fontSize: 14, fontWeight: rightTab === "history" ? 500 : 400, marginLeft: "auto" }}
                        className={cn(
                            "text-[14px] leading-none transition",
                            rightTab === "history" ? "text-primary" : "text-foreground hover:text-primary",
                        )}
                    >
                        历史记录
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    {rightTab === "result" ? (
                        showResults ? (
                            <div className="space-y-3 p-3">
                                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-card px-3 py-2 text-[12px] text-muted-foreground">
                                    <span data-testid="color-v2-progress" className="font-medium text-foreground">
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
                                                className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition hover:border-primary/50"
                                            >
                                                停止
                                            </button>
                                        ) : null}
                                        {!busy && retryableUnits(units, outcomes).length ? (
                                            <button
                                                type="button"
                                                data-testid="color-v2-retry-failed"
                                                onClick={() => void retryFailed()}
                                                className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition hover:border-primary/50"
                                            >
                                                重试失败单元（{retryableUnits(units, outcomes).length}）
                                            </button>
                                        ) : null}
                                    </span>
                                </div>

                                {planRows.length ? (
                                    <div className="flex flex-wrap gap-2">
                                        {planRows.map((row) => (
                                            <span key={row.planId} className="inline-flex items-center gap-1.5 rounded-md bg-card px-2 py-1 text-[11px] leading-4 text-muted-foreground">
                                                {row.hex ? <span aria-hidden className="inline-block size-3 rounded-[2px] border border-border" style={{ backgroundColor: row.hex }} /> : null}
                                                {row.planName}：{row.succeeded}/{row.total}
                                                {row.failed ? <span className="text-destructive">· 失败 {row.failed}</span> : null}
                                                {row.unknown ? <span className="text-[#a86b00]">· 未定 {row.unknown}</span> : null}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}

                                {consistency ? (
                                    <p className="text-[11px] leading-4 text-muted-foreground">
                                        一致性：{consistency.completeMatrix ? "整套矩阵覆盖完整" : "矩阵尚未覆盖全部商品图 × 方案"}
                                        {consistency.deviatingUnits.length ? ` · ${consistency.deviatingUnits.length} 张做过单图微调` : " · 无单图微调"}
                                    </p>
                                ) : null}

                                {actionNotice ? (
                                    <p data-testid="color-v2-action-notice" className="rounded-md bg-accent px-2 py-1 text-[11px] leading-4 text-muted-foreground">
                                        {actionNotice}
                                    </p>
                                ) : null}

                                {restoredItems.length ? (
                                    <div data-testid="color-v2-restored" className="space-y-2 rounded-lg border border-border bg-card p-2">
                                        <p className="text-[11px] leading-4 text-muted-foreground">
                                            已从本地恢复上次生成的真实结果（任务 {restoredTask?.id.slice(-6)} · {restoredItems.length} 张），下载/存资产库/发画布均按库内字节执行。
                                        </p>
                                        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
                                            {restoredItems.map((item, index) => {
                                                const title = restoredTitle(item, index);
                                                return (
                                                    <figure key={item.id} data-testid="color-v2-restored-item" className="overflow-hidden rounded-lg border border-border bg-card">
                                                        <div className="flex aspect-[3/4] items-center justify-center bg-card">
                                                            <img src={item.dataUrl || item.url} alt={title} className="h-full w-full object-contain" />
                                                        </div>
                                                        <figcaption className="space-y-1 p-2">
                                                            <p className="truncate text-[12px] leading-4 text-foreground" title={title}>
                                                                {title}
                                                            </p>
                                                            <p className="text-[11px] leading-4 text-muted-foreground">
                                                                已完成{item.bytes ? ` · ${Math.round(item.bytes / 1024)} KB` : " · 字节来自本地库"}
                                                            </p>
                                                            <div className="flex flex-wrap gap-1 pt-0.5">
                                                                <button
                                                                    type="button"
                                                                    data-testid="color-v2-restored-download"
                                                                    onClick={() => downloadRestored(item, title)}
                                                                    className="rounded-[3px] border border-border px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground transition hover:border-primary/50"
                                                                >
                                                                    下载
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    data-testid="color-v2-restored-save"
                                                                    disabled={actingUnit === item.id}
                                                                    onClick={() => void saveRestored(item, title)}
                                                                    className="rounded-[3px] border border-border px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground transition hover:border-primary/50 disabled:opacity-50"
                                                                >
                                                                    存资产库
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    data-testid="color-v2-restored-send"
                                                                    disabled={actingUnit === item.id}
                                                                    onClick={() => void sendRestored(item)}
                                                                    className="rounded-[3px] border border-border px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground transition hover:border-primary/50 disabled:opacity-50"
                                                                >
                                                                    发画布
                                                                </button>
                                                            </div>
                                                        </figcaption>
                                                    </figure>
                                                );
                                            })}
                                        </div>
                                    </div>
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
                                                      className="overflow-hidden rounded-lg border border-border bg-card"
                                                  >
                                                      <div className="flex aspect-[3/4] items-center justify-center bg-card">
                                                          {imageUrl ? (
                                                              <img src={imageUrl} alt={unit.imageName} className="h-full w-full object-contain" />
                                                          ) : (
                                                              <span className="px-2 text-center text-[11px] leading-4 text-muted-foreground">
                                                                  {status ? STATUS_LABEL[status] : busy ? "等待生成…" : "未生成"}
                                                              </span>
                                                          )}
                                                      </div>
                                                      <figcaption className="space-y-1 p-2">
                                                          <p className="truncate text-[12px] leading-4 text-foreground" title={unit.imageName}>
                                                              {unit.imageName}
                                                          </p>
                                                          <p className="text-[11px] leading-4 text-muted-foreground">
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
                                                                          className="rounded-[3px] border border-border px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground transition hover:border-primary/50"
                                                                      >
                                                                          下载
                                                                      </button>
                                                                      <button
                                                                          type="button"
                                                                          data-testid="color-v2-save"
                                                                          disabled={actingUnit === outcome.unitId}
                                                                          onClick={() => void saveOutcome(outcome)}
                                                                          className="rounded-[3px] border border-border px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground transition hover:border-primary/50 disabled:opacity-50"
                                                                      >
                                                                          存资产库
                                                                      </button>
                                                                      <button
                                                                          type="button"
                                                                          data-testid="color-v2-send"
                                                                          disabled={actingUnit === outcome.unitId}
                                                                          onClick={() => void sendOutcome(outcome)}
                                                                          className="rounded-[3px] border border-border px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground transition hover:border-primary/50 disabled:opacity-50"
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
                                                                      className="rounded-[3px] border border-border px-1.5 py-0.5 text-[11px] leading-4 text-primary transition hover:border-primary/50"
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
                                    className="text-[11px] leading-4 text-muted-foreground underline-offset-2 transition hover:text-primary hover:underline"
                                >
                                    {showSnapshot ? "收起本次输入快照" : "查看本次输入快照"}
                                </button>
                                {showSnapshot ? (
                                    <pre
                                        data-testid="color-v2-snapshot"
                                        className="max-h-[240px] overflow-auto rounded-lg border border-border bg-card p-2 text-[11px] leading-4 text-muted-foreground"
                                    >
                                        {JSON.stringify(currentSnapshot, null, 2)}
                                    </pre>
                                ) : null}
                            </div>
                        ) : (
                            <div className="mx-auto flex h-full w-full max-w-[1000px] flex-col justify-center px-6 py-4">
                                <div className="flex items-center gap-3">
                                    <span className="text-[14px] leading-5 text-foreground">第一步：上传 1 张需要换色的商品图片</span>
                                </div>
                                <h2 className="mt-1 text-center text-[20px] font-medium leading-7 text-foreground">上传整套商品图，批量生成多色变体结果</h2>
                                <div className="mt-5 flex justify-center">
                                    <div className="flex w-[474px] max-w-full flex-col items-center rounded-lg bg-card px-10 py-8 text-center">
                                        <div className="flex size-16 items-center justify-center rounded-[18px] bg-primary/10">
                                            <ImagePlus className="size-7 text-primary" aria-hidden="true" />
                                        </div>
                                        <p data-testid="color-v2-empty-hint" className="mt-3 text-[12px] leading-5 text-muted-foreground">
                                            上传商品图
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
                                {/* 原站「生成结果」空态：横向滚动演示条（上传商品图 → 生成结果 → 一键做同款） */}
                                <div
                                    data-testid="color-v2-empty-demo"
                                    className="mt-6 flex justify-start gap-4 overflow-x-auto pb-1 sm:justify-center"
                                >
                                    {[0, 1, 2].map((index) => (
                                        <div
                                            key={index}
                                            data-testid="color-v2-empty-demo-card"
                                            className="flex w-[240px] shrink-0 flex-col items-center gap-3 rounded-lg border border-border bg-card px-4 py-4"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="inline-flex h-7 items-center rounded-[13px] bg-black/60 px-3 text-[14px] leading-4 text-white">
                                                    上传商品图
                                                </span>
                                                <span className="inline-flex h-7 items-center rounded-[13px] bg-black/60 px-3 text-[14px] leading-4 text-white">
                                                    生成结果
                                                </span>
                                            </div>
                                            <div className="h-[96px] w-full rounded-md bg-muted" aria-hidden="true" />
                                            <button
                                                type="button"
                                                data-testid="color-v2-empty-demo-cta"
                                                className="inline-flex h-10 w-[110px] items-center justify-center rounded-lg border border-border text-[16px] leading-none text-foreground transition hover:border-primary hover:text-primary"
                                            >
                                                一键做同款
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    ) : rightTab === "cases" ? (
                        <div className="p-3">
                            <ToolCases
                                cases={COLOR_V2_CASES}
                                onApply={applyCase}
                                applyingId={applyingCaseId}
                                emptyHint="暂无优秀案例"
                            />
                        </div>
                    ) : (
                        <div className="p-3">
                            <ToolTaskHistory
                                toolId={TOOL_ID}
                                emptyHint="还没有换色任务，生成一次后会出现在这里。"
                                onSelectTask={(task) => {
                                    setPickedTask(task);
                                    setRightTab("result");
                                }}
                            />
                        </div>
                    )}
                </div>
                <div data-testid="color-v2-pagination" className="flex h-[42px] shrink-0 items-center justify-center gap-2 border-t border-border text-[12px]">
                    {[1, 2, 3, 4, 5, 6].map((page) => (
                        <button
                            key={page}
                            type="button"
                            onClick={() => setResultPage(page)}
                            className={cn(
                                "size-6 rounded-md leading-none transition",
                                resultPage === page ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {page}
                        </button>
                    ))}
                </div>
            </section>
            {/* 右：辅助栏（原站右侧：登录签到 / 水印分组 / 节日横幅） */}
            <aside data-region="aside" className="flex w-[318px] shrink-0 flex-col gap-2 overflow-y-auto py-1 pr-1">
                        {/* A:1-11 登录签到条（1:1 呈现层） */}
                        <div data-testid="color-v2-signin-strip" className="mx-3 mt-2 rounded-lg border border-border bg-card p-3">
                            <div className="flex items-center justify-between">
                                <span style={{ fontSize: 12, fontWeight: 600 }}>已连续登录2天</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-primary">查看详情</span>
                                    <span className="text-[11px] text-muted-foreground">250</span>
                                </div>
                            </div>
                            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">再登录3天可获得「100点免费算力」！</p>
                            <div className="mt-2 flex items-center justify-between gap-1 text-[11px]">
                                <span className="flex flex-col items-center gap-[2px]"><span className="text-muted-foreground">+50</span><span>第1天</span></span>
                                <span className="flex flex-col items-center gap-[2px]"><span className="text-primary">今天</span></span>
                                <span className="flex flex-col items-center gap-[2px]"><span className="text-muted-foreground">+50</span><span className="text-muted-foreground">第3天</span></span>
                                <span className="flex flex-col items-center gap-[2px]"><span className="text-muted-foreground">+100</span><span className="text-muted-foreground">第4天</span></span>
                                <span className="flex flex-col items-center gap-[2px]"><span className="text-muted-foreground">+100</span><span className="text-muted-foreground">第5天</span></span>
                            </div>
                        </div>

                        {/* A:69-72 节日主题横幅 */}
                        {holidayDismissed ? null : (
                            <div data-testid="color-v2-holiday-banner" className="mx-3 mt-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-center">
                                <p style={{ fontSize: 12, fontWeight: 600 }} className="text-primary">⬆ 扫码免费领「500算力」⬆</p>
                                <p className="mt-1 text-[12px]">🎄圣诞、🎃万圣节日主题已上线</p>
                                <p className="mt-1 text-[11px] text-muted-foreground">限时开放🕙10月28日23:59:59截止🕙</p>
                                <button
                                    type="button"
                                    data-testid="color-v2-holiday-dismiss"
                                    onClick={() => setHolidayDismissed(true)}
                                    className="mt-2 h-7 w-full rounded-md border border-border text-[12px] hover:text-primary"
                                >
                                    我知道了
                                </button>
                            </div>
                        )}
                <section className="rounded-lg border border-border bg-card p-2">
                    <WatermarkGroupPanel />
                </section>
                        <PanelSection id="watermark" title="管理水印分组">
                            <div className="px-4 pb-3">
                                <WatermarkGroupPanel />
                            </div>
                        </PanelSection>
            </aside>
        </div>
    );
}

export default ColorV2Workspace;
