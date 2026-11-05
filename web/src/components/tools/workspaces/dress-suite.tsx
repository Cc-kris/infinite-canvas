import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import { ToolCases, type ToolCase } from "@/components/tools/tool-cases";
import { ToolCaseGuide } from "@/components/tools/tool-case-guide";
import { uploadCaseFiles } from "@/features/tools/case-apply";
import { DRESS_SET_CASES } from "@/features/tools/suite6-cases-data";
import { DRESS_SET_SAMPLES } from "@/features/tools/tool-cases-data";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveResultItemToAssets, sendResultItemToCanvas } from "@/components/tools/tool-result-actions";
import { ToolResult } from "@/components/tools/tool-result";
import {
    createDressWearSetValues,
    dressResultPanelTask,
    dressSnapshotMatches,
    dressResultItemOf,
    dressWearSetUnits,
    estimateDressOutputs,
    groupDressTasks,
    hasBlockingDressIssues,
    isStaleDressTask,
    normalizeDressWearSetValues,
    retryDressUnit,
    runDressWearSet,
    summarizeDressTasks,
    toDressReferences,
    untaggedDressTasks,
    validateDressWearSet,
    type DressResultGroup,
    type DressRunPort,
    type DressSubmitSnapshot,
    type DressWearSetValues,
} from "@/features/tools/adapters/dress-wear-set";
import {
    DRESS_APLUS_SCENE_OPTIONS,
    DRESS_LANGUAGE_SUGGESTIONS,
    DRESS_MAIN_SCENE_OPTIONS,
    DRESS_PRODUCT_INFO_MAX_LENGTH,
    DRESS_PLATFORM_SUGGESTIONS,
    DRESS_PROVIDERS,
    DRESS_REPLACEMENT_LIBRARIES,
    DRESS_REGION_SUGGESTIONS,
    DRESS_SCENE_BY_KEY,
    DRESS_SENSITIVE_LIBRARIES,
    DRESS_UPLOAD_LIMITS,
    DRESS_WEAR_SET_TOOL_ID,
    dressAspectRatioOptionsFor,
    dressQualityOptionsFor,
    dressReplacementLibraryOf,
    dressResolutionOptionsFor,
    dressSensitiveLibraryOf,
    type DressSceneKey,
} from "@/features/tools/registry/dress-wear-set";
import type { ToolAssetRecord } from "@/services/api/tools/assets";
import { toolAssetLibraryItemsFromAssets } from "@/services/api/tools/assets";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { useAssetStore, type ImageAsset, type VideoAsset } from "@/stores/use-asset-store";
import { selectableModelsByCapability, useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";

/* ------------------------------------------------------------------ *
 * 小控件：不引第三方表单库，保证在 1024/768/390 下都是真实可操作控件。
 * ------------------------------------------------------------------ */

function Section({ title, hint, children, className = "" }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
    return (
        <section className={`flex flex-col gap-2 rounded-lg border border-border bg-card p-3 ${className}`}>
            <header className="flex flex-col gap-0.5">
                <h2 className="text-sm font-medium">{title}</h2>
                {hint ? <p className="text-[11px] leading-4 text-muted-foreground">{hint}</p> : null}
            </header>
            {children}
        </section>
    );
}

function TextField({ label, value, onChange, placeholder, list, maxLength, hint }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; list?: string; maxLength?: number; hint?: string }) {
    return (
        <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-muted-foreground">{label}</span>
            <input
                className="h-9 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:border-primary"
                value={value}
                placeholder={placeholder}
                list={list}
                maxLength={maxLength}
                onChange={(event) => onChange(event.target.value)}
            />
            {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
        </label>
    );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly { value: string; label: string }[]; onChange: (value: string) => void }) {
    return (
        <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-muted-foreground">{label}</span>
            <select className="h-9 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:border-primary" value={value} onChange={(event) => onChange(event.target.value)}>
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </label>
    );
}

function CountStepper({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
    return (
        <div className="flex items-center gap-1" aria-label={label}>
            <button type="button" className="h-7 w-7 rounded border border-border text-sm leading-none text-muted-foreground hover:border-primary disabled:opacity-40" disabled={value <= 1} aria-label={`${label}减少`} onClick={() => onChange(value - 1)}>
                -
            </button>
            <input
                className="h-7 w-10 rounded border border-border bg-background text-center text-sm tabular-nums"
                value={value}
                aria-label={`${label}数量`}
                onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10);
                    if (Number.isFinite(parsed)) onChange(parsed);
                }}
            />
            <button type="button" className="flex h-7 w-7 items-center justify-center rounded border border-border text-sm leading-none text-muted-foreground hover:border-primary disabled:opacity-40" disabled={value >= 15} aria-label={`${label}增加`} onClick={() => onChange(value + 1)}>
                <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true" focusable="false">
                    <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
                </svg>
            </button>
        </div>
    );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: string }) {
    return (
        <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--primary)]" checked={checked} onChange={(event) => onChange(event.target.checked)} />
            <span className="flex min-w-0 flex-col">
                <span className="text-sm">{label}</span>
                {hint ? <span className="text-[11px] leading-4 text-muted-foreground">{hint}</span> : null}
            </span>
        </label>
    );
}

/* ------------------------------------------------------------------ *
 * 服装套图工作区（DRESS_WEAR_SET / makeType 69）
 *
 * 区域：上传（≤5 张）｜商品信息｜主副图｜A+ 图｜套图结果。
 * 真实执行：每个选中的场景分组 = 一次真实上游请求，结果按标签归组，
 * 部分失败只允许人工重试单组，不会因为“未知”自动重刷扣费。
 * ------------------------------------------------------------------ */

export type DressSuiteWorkspaceProps = { toolId?: string };


/** 向导句式（本地文本，点选后追加到商品信息）。 */
const DRESS_GUIDE_PROMPTS: ReadonlyArray<{ label: string; text: string }> = [
    { label: "核心卖点", text: "核心卖点：" },
    { label: "面料成分", text: "面料成分：" },
    { label: "版型尺码", text: "版型尺码：" },
    { label: "搭配建议", text: "搭配建议：" },
    { label: "洗护说明", text: "洗护说明：" },
];

export function DressSuiteWorkspace({ toolId = DRESS_WEAR_SET_TOOL_ID }: DressSuiteWorkspaceProps) {
    const config = useConfigStore((state) => state.config);
    const imageModels = useMemo(() => selectableModelsByCapability(config, "image"), [config]);
    const model = config.imageModel || imageModels[0] || "";

    const [values, setValues] = useState<DressWearSetValues>(() => createDressWearSetValues());
    const [records, setRecords] = useState<ToolAssetRecord[]>([]);
    const [notice, setNotice] = useState("");
    const [applyingCaseId, setApplyingCaseId] = useState<string | null>(null);
    const [caseApplyNonce, setCaseApplyNonce] = useState(0);
    /* 原站结果区页签：生成结果 / 优秀案例（历史是右端外链，本地无对应页，只保留入口位）。 */
    const [rightTab, setRightTab] = useState<"result" | "cases">("result");
    const [guideOpen, setGuideOpen] = useState(false);
    const [moreRatios, setMoreRatios] = useState(false);
    const [running, setRunning] = useState(false);
    const [snapshot, setSnapshot] = useState<DressSubmitSnapshot | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const hydrate = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const draftRevision = useToolDraftStore((state) => state.drafts[toolId]?.revision ?? null);

    /* 「优秀案例」/「或试试这些」做同款：真实素材入库后回填服装图（示例组是一组多图，全部进上传区） */
    const applyCase = useCallback(async (item: ToolCase) => {
        setApplyingCaseId(item.id);
        setNotice("");
        try {
            const assets = await uploadCaseFiles(item);
            const picked = ([] as (ToolAssetRecord | undefined)[]).concat(assets.source as ToolAssetRecord | ToolAssetRecord[] | undefined).filter((entry): entry is ToolAssetRecord => !!entry);
            if (!picked.length) throw new Error("该案例缺少可用的服装图");
            setRecords(picked);
            patchDraft(toolId, { assetIds: picked.map((record) => record.id) });
            setCaseApplyNonce((value) => value + 1);
            setRightTab("result");
            setNotice(`已套用案例服装图：${picked.map((record) => record.name).join("、")}`);
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "案例套用失败");
        } finally {
            setApplyingCaseId(null);
        }
    }, [patchDraft, toolId]);

    const tasks = useToolTaskStore((state) => state.tasks);
    const runTool = useToolTaskStore((state) => state.runTool);
    const retryTask = useToolTaskStore((state) => state.retryTask);

    // 作品库（本地资产库）：上传卡上的「从作品库选择」从真实资产列表读取；不伪造商品库入口。
    const assets = useAssetStore((state) => state.assets);
    const library = useMemo(
        () => toolAssetLibraryItemsFromAssets(assets.filter((asset): asset is ImageAsset | VideoAsset => asset.kind === "image")),
        [assets],
    );

    // 刷新恢复：草稿里的表单值；素材由 ToolAssetInput 自己按 assetIds 恢复。
    useEffect(() => {
        let alive = true;
        void (async () => {
            const draft = await hydrate(toolId);
            if (!alive || !draft) return;
            setValues(normalizeDressWearSetValues(draft.values));
        })();
        return () => {
            alive = false;
        };
    }, [hydrate, toolId]);

    const update = useCallback(
        (updater: (previous: DressWearSetValues) => DressWearSetValues) => {
            setValues((previous) => {
                const next = updater(previous);
                patchDraft(toolId, { values: next as unknown as Record<string, unknown> });
                return next;
            });
        },
        [patchDraft, toolId],
    );

    const setField = useCallback(<K extends keyof DressWearSetValues>(key: K, value: DressWearSetValues[K]) => update((previous) => ({ ...previous, [key]: value })), [update]);

    /* 向导：本地句式点选后追加到商品信息（不发起任何网络请求）。 */
    const appendProductInfo = useCallback(
        (text: string) => {
            update((previous) => {
                const next = previous.productInfo ? `${previous.productInfo.trimEnd()}\n${text}` : text;
                return { ...previous, productInfo: next.slice(0, DRESS_PRODUCT_INFO_MAX_LENGTH) };
            });
        },
        [update],
    );

    /* AI分析：对已填写的商品信息做本地关键词结构化，补全缺失的卖点维度。 */
    const handleAnalyzeProductInfo = useCallback(() => {
        const text = values.productInfo;
        const pick = (keywords: string[]) => keywords.filter((word) => text.includes(word));
        const sections: [string, string[]][] = [
            ["材质", pick(["棉", "麻", "丝", "羊毛", "涤纶", "雪纺", "牛仔", "皮革", "针织", "莱赛尔"])],
            ["版型", pick(["宽松", "直筒", "修身", "oversize", "落肩", "收腰", "A字", "短款", "长款"])],
            ["场景", pick(["日常", "办公", "通勤", "约会", "度假", "运动", "跑步", "聚会", "旅行"])],
            ["人群", pick(["女", "男", "儿童", "学生", "商务", "宝妈", "青年", "中年"])],
        ];
        const block = sections
            .filter(([, hits]) => hits.length > 0)
            .map(([label, hits]) => `${label}：${hits.join("；")}`)
            .join("\n");
        appendProductInfo(block || "AI分析：未识别到可结构化字段，请补充材质、版型、场景。");
    }, [appendProductInfo, values.productInfo]);

    const setSceneChecked = useCallback(
        (key: DressSceneKey, checked: boolean) =>
            update((previous) => {
                const option = DRESS_SCENE_BY_KEY[key];
                if (option.group === "aplus") {
                    const nextAplus = { ...previous.aplusScenes };
                    // A+ 为单选：勾选一项即取消其它项。
                    for (const scene of DRESS_APLUS_SCENE_OPTIONS) {
                        const current = nextAplus[scene.key as keyof typeof nextAplus];
                        nextAplus[scene.key as keyof typeof nextAplus] = {
                            checked: scene.key === key ? checked : false,
                            count: current.count,
                        };
                    }
                    return { ...previous, aplusScenes: nextAplus };
                }
                return {
                    ...previous,
                    mainScenes: {
                        ...previous.mainScenes,
                        [key]: { ...previous.mainScenes[key as keyof typeof previous.mainScenes], checked },
                    },
                };
            }),
        [update],
    );

    const setSceneCount = useCallback(
        (key: DressSceneKey, count: number) =>
            update((previous) => {
                const option = DRESS_SCENE_BY_KEY[key];
                const clamped = Math.min(15, Math.max(1, Math.floor(count) || 1));
                if (option.group === "aplus") {
                    return {
                        ...previous,
                        aplusScenes: {
                            ...previous.aplusScenes,
                            [key]: { ...previous.aplusScenes[key as keyof typeof previous.aplusScenes], count: clamped },
                        },
                    };
                }
                return {
                    ...previous,
                    mainScenes: {
                        ...previous.mainScenes,
                        [key]: { ...previous.mainScenes[key as keyof typeof previous.mainScenes], count: clamped },
                    },
                };
            }),
        [update],
    );

    const issues = useMemo(() => validateDressWearSet(values, { referenceCount: records.length }), [values, records.length]);
    const blocking = hasBlockingDressIssues(issues);
    const estimate = useMemo(() => estimateDressOutputs(values), [values]);
    const mainUnits = DRESS_MAIN_SCENE_OPTIONS.reduce((sum, option) => {
        const selection = values.mainScenes[option.key as keyof DressWearSetValues["mainScenes"]];
        return sum + (selection?.checked ? selection.count : 0);
    }, 0);
    const aplusUnits = DRESS_APLUS_SCENE_OPTIONS.reduce((sum, option) => {
        const selection = values.aplusScenes[option.key as keyof DressWearSetValues["aplusScenes"]];
        return sum + (selection?.checked ? selection.count : 0);
    }, 0);
    const units = useMemo(() => dressWearSetUnits(values), [values]);
    const references = useMemo(() => toDressReferences(records), [records]);

    const toolTasks = useMemo(
        () =>
            Object.values(tasks)
                .filter((task) => task.toolId === toolId)
                .sort((left, right) => left.createdAt - right.createdAt),
        [tasks, toolId],
    );
    const groups = useMemo(() => groupDressTasks(toolTasks), [toolTasks]);
    // 标准结果面板：只聚合本页真实任务的结果项（含刷新后 storageKey 复原的字节），不造结果。
    const panelTask = useMemo(() => dressResultPanelTask(toolTasks), [toolTasks]);
    const untagged = useMemo(() => untaggedDressTasks(toolTasks), [toolTasks]);
    const summary = useMemo(() => summarizeDressTasks(toolTasks), [toolTasks]);
    const staleTasks = useMemo(() => toolTasks.filter((task) => isStaleDressTask(task, draftRevision)), [toolTasks, draftRevision]);
    const resultsStale = snapshot
        ? !dressSnapshotMatches(
              snapshot,
              values,
              records.map((record) => record.id),
              model,
          )
        : false;

    const port = useMemo<DressRunPort>(() => ({ runTool, retryTask }), [runTool, retryTask]);

    const handleGenerate = useCallback(async () => {
        if (blocking) {
            setNotice("请先修正下方标红的问题，再开始生成。");
            return;
        }
        if (!units.length) {
            setNotice("至少选择一个生成场景。");
            return;
        }
        if (!references.length) {
            setNotice("请先上传服装图（最多 5 张）。");
            return;
        }
        if (!model) {
            setNotice("尚未配置可用的图像模型，请先在设置里添加渠道与模型。");
            return;
        }
        const controller = new AbortController();
        abortRef.current = controller;
        setRunning(true);
        setNotice("");
        try {
            const result = await runDressWearSet({
                units,
                values,
                references,
                model,
                revision: draftRevision,
                port,
                signal: controller.signal,
            });
            setSnapshot(result.snapshot);
            const failed = result.units.filter((unit) => unit.status === "failed" || unit.status === "unknown").length;
            setNotice(failed ? `已提交 ${result.units.length} 组，其中 ${failed} 组失败/未知，可单独重试。` : "");
        } catch (error) {
            setNotice(error instanceof Error ? error.message : String(error));
        } finally {
            setRunning(false);
            abortRef.current = null;
        }
    }, [blocking, units, references, model, values, draftRevision, port]);

    const handleCancel = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    const handleRetryGroup = useCallback(
        async (group: DressResultGroup) => {
            const unit = units.find((item) => item.scene === group.scene);
            if (!unit) {
                setNotice(`「${group.label}」当前未勾选，请先勾选该场景再重试。`);
                return;
            }
            const failedTask: ToolTask | undefined = group.tasks.find(
                (task) => task.status === "failed" || task.status === "unknown" || task.status === "cancelled",
            );
            if (!failedTask) {
                setNotice(`「${group.label}」上游自报成功但没有返回图片，没有可重试的任务；请直接重新生成该组。`);
                return;
            }
            setNotice("");
            try {
                await retryDressUnit({
                    run: { unit, taskId: failedTask?.id ?? "", status: failedTask?.status ?? "failed", images: [] },
                    values,
                    references,
                    model,
                    port,
                });
            } catch (error) {
                setNotice(error instanceof Error ? error.message : String(error));
            }
        },
        [units, values, references, model, port],
    );

    const handleSaveImageToAssets = useCallback(
        async (image: { id: string; dataUrl: string; taskId: string }, label: string) => {
            try {
                await saveResultItemToAssets(dressResultItemOf(image), 0, {
                    toolId,
                    ...(image.taskId ? { taskId: image.taskId } : {}),
                    title: `${label}-${image.id.slice(0, 8)}`,
                });
                setNotice(`已存入资产库：${label}-${image.id.slice(0, 8)}`);
            } catch (error) {
                setNotice(error instanceof Error ? error.message : "存入资产库失败");
            }
        },
        [toolId],
    );

    const handleSendImageToCanvas = useCallback(
        async (image: { id: string; dataUrl: string }, label: string) => {
            try {
                const created = await sendResultItemToCanvas(dressResultItemOf(image), {
                    toolId,
                    projectTitle: "服装套图结果",
                });
                setNotice(`已发送到画布（${label} · 项目 ${created.projectId.slice(0, 8)}）`);
            } catch (error) {
                setNotice(error instanceof Error ? error.message : "发送到画布失败");
            }
        },
        [toolId],
    );

    const provider = DRESS_PROVIDERS.find((item) => item.code === values.provider);
    const resolutionOptions = dressResolutionOptionsFor(values.provider);
    const qualityOptions = dressQualityOptionsFor(values.provider);
    /* 原站「生成比例」默认暴露 5 档 +「更多」展开模型目录里的其余档位。 */
    const DRESS_RATIO_UI = ["1:1", "3:4", "4:3", "2:3", "3:2"];
    const allRatioOptions = dressAspectRatioOptionsFor(values.provider);
    const ratioOptions = allRatioOptions.filter((value) => DRESS_RATIO_UI.includes(value));
    const extraRatioOptions = allRatioOptions.filter((value) => !DRESS_RATIO_UI.includes(value));

    const errorFor = (field: string) => issues.filter((issue) => issue.field === field && issue.level === "error")[0];

    return (
        <div className="flex h-full min-h-0 flex-col gap-3" data-testid="dress-suite-workspace" data-tool-id={toolId}>
            <ToolWorkspaceColumns
                config={(
                    <div className="flex h-full min-h-0 flex-1 flex-col">
                    <div data-testid="dress-suite-config-scroll" className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                    <>
                {/* 左列：素材与商品设定 */}
                    <Section title="多角度服装图&搭配图">
                        <ToolAssetInput
                            key={`case-${caseApplyNonce}`}
                            toolId={toolId}
                            variant="linkfox"
                            wide
                            compact
                            maxCount={DRESS_UPLOAD_LIMITS.maxFiles}
                            library={library}
                            syncIds={records.map((record) => record.id)}
                            constraints={{
                                kind: "image",
                                mimeTypes: [...DRESS_UPLOAD_LIMITS.mimeTypes],
                                maxBytes: DRESS_UPLOAD_LIMITS.maxBytes,
                                minWidth: DRESS_UPLOAD_LIMITS.minSide,
                                minHeight: DRESS_UPLOAD_LIMITS.minSide,
                                maxWidth: DRESS_UPLOAD_LIMITS.maxSide,
                                maxHeight: DRESS_UPLOAD_LIMITS.maxSide,
                            }}
                            title="上传服装图"
                            uploadLabel="从本地上传"
                            hint={
                                <>
                                    <span className="block text-center">最多上传{DRESS_UPLOAD_LIMITS.maxFiles}张图，10M以内，384*384~4096*4096</span>
                                    {/* 原站上传卡内「或试试这些」：分隔线 + 示例组（一组多图，点击即整组载入为服装图）。 */}
                                    <div className="mt-2.5 cursor-default" data-testid="dress-suite-try-demo" onClick={(event) => event.stopPropagation()}>
                                        <div className="mb-[5px] flex items-center gap-2">
                                            <span className="h-px flex-1 bg-border" />
                                            <span className="text-[12px] font-medium leading-[15px] text-muted-foreground/60">或试试这些</span>
                                            <span className="h-px flex-1 bg-border" />
                                        </div>
                                        <div className="flex justify-center gap-2">
                                            {DRESS_SET_SAMPLES.map((group) => (
                                                <button
                                                    key={group.id}
                                                    type="button"
                                                    data-testid={`dress-suite-sample-${group.id}`}
                                                    disabled={running || applyingCaseId !== null}
                                                    onClick={() => void applyCase(group)}
                                                    className="flex gap-1 rounded-[6px] border border-black/[0.08] bg-card p-1 transition hover:border-primary disabled:opacity-50 dark:border-white/10"
                                                >
                                                    {group.params.map((param) => (
                                                        <img key={param.src} src={param.src} alt={param.label} className="size-10 rounded-[4px] object-cover" draggable={false} />
                                                    ))}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            }
                            onChange={(_assetIds, next) => setRecords(next)}
                        />
                        {records.length > 1 ? (
                            <p className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                <span>参考图顺序即生成顺序，可调整：</span>
                                <span className="flex items-center gap-1.5">
                                    {records.map((record, index) => (
                                        <button
                                            key={record.id}
                                            type="button"
                                            aria-label={`将第 ${index + 1} 张前移`}
                                            disabled={index === 0}
                                            className="h-7 w-7 rounded border border-border leading-none hover:border-primary disabled:opacity-40"
                                            onClick={() =>
                                                setRecords((previous) => {
                                                    const next = [...previous];
                                                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                                    return next;
                                                })
                                            }
                                        >
                                            ↑
                                        </button>
                                    ))}
                                </span>
                            </p>
                        ) : null}
                        {errorFor("references") ? <p className="text-xs text-destructive">{errorFor("references")?.message}</p> : null}
                    </Section>

                {/* 中列：商品信息与模型 */}
                    <Section title="商品信息">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setGuideOpen((open) => !open)}
                                    className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-foreground"
                                >
                                    向导
                                </button>
                                <button
                                    type="button"
                                    onClick={handleAnalyzeProductInfo}
                                    className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-foreground"
                                >
                                    AI分析
                                </button>
                            </div>
                            <span className="text-[11px] tabular-nums text-muted-foreground">
                                {values.productInfo.length} / {DRESS_PRODUCT_INFO_MAX_LENGTH}
                            </span>
                        </div>
                        {guideOpen ? (
                            <div className="flex flex-wrap gap-1.5 rounded-[6px] bg-muted/40 p-2">
                                {DRESS_GUIDE_PROMPTS.map((item) => (
                                    <button
                                        key={item.label}
                                        type="button"
                                        onClick={() => appendProductInfo(item.text)}
                                        className="rounded-full border border-border bg-background px-2 py-[2px] text-[11px] text-muted-foreground hover:border-primary hover:text-foreground"
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                        <textarea
                            className="min-h-16 w-full resize-y rounded-md border border-border bg-background p-2 text-sm outline-none focus-visible:border-primary"
                            maxLength={DRESS_PRODUCT_INFO_MAX_LENGTH}
                            value={values.productInfo}
                            placeholder="例如：100% 新疆长绒棉，宽松直筒版型，落肩袖，适合 155-175cm，机洗不掉色"
                            onChange={(event) => setField("productInfo", event.target.value)}
                        />
                    </Section>

                    <Section title="品牌与合规（可选）">
                        <div className="grid gap-2 sm:grid-cols-2">
                            <SelectField
                                label="智能品牌基因"
                                value={values.brandMode}
                                options={[
                                    { value: "smart", label: "智能识别" },
                                    { value: "custom", label: "自定义品牌" },
                                ]}
                                onChange={(value) => setField("brandMode", value === "custom" ? "custom" : "smart")}
                            />
                            <SelectField
                                label="商品类目"
                                value={values.platform}
                                options={[{ value: "", label: "请选择商品类目" }, ...DRESS_PLATFORM_SUGGESTIONS.map((item) => ({ value: item, label: item }))]}
                                onChange={(value) => setField("platform", value)}
                            />
                            <SelectField
                                label="销售地区"
                                value={values.salesRegion}
                                options={[{ value: "", label: "请选择销售地区" }, ...DRESS_REGION_SUGGESTIONS.map((item) => ({ value: item, label: item }))]}
                                onChange={(value) => setField("salesRegion", value)}
                            />
                            <SelectField
                                label="语言"
                                value={values.language}
                                options={[{ value: "", label: "请选择语言" }, ...DRESS_LANGUAGE_SUGGESTIONS.map((item) => ({ value: item, label: item }))]}
                                onChange={(value) => setField("language", value)}
                            />
                        </div>
                        <p className="text-[11px] leading-4 text-muted-foreground">
                            智能主色、智能字体风格：智能识别模式下自动从主图取色并匹配字体风格。
                        </p>
                        {values.brandMode === "custom" ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <TextField label="品牌名称" value={values.brandName} onChange={(value) => setField("brandName", value)} />
                                <TextField label="品牌主色" value={values.brandColor} placeholder="#1B1B1B" onChange={(value) => setField("brandColor", value)} />
                                <TextField label="品牌字体" value={values.brandFont} placeholder="思源黑体 / Inter" onChange={(value) => setField("brandFont", value)} />
                            </div>
                        ) : null}
                    </Section>

                    <Section title="智能合规检查">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-muted-foreground">
                                {values.complianceCheck
                                    ? `已选：${dressSensitiveLibraryOf(values.sensitiveLibrary)?.label ?? "未选择敏感词库"} · ${dressReplacementLibraryOf(values.replacementLibrary)?.label ?? "未选择替换词库"}`
                                    : "未选择敏感词库 · 未选择替换词库"}
                            </span>
                            <input
                                type="checkbox"
                                aria-label="智能合规检查"
                                className="h-4 w-4 accent-[var(--primary)]"
                                checked={values.complianceCheck}
                                onChange={(event) => setField("complianceCheck", event.target.checked)}
                            />
                        </div>
                        {values.complianceCheck ? (
                            <div className="grid gap-3">
                                <SelectField
                                    label="敏感词库"
                                    value={values.sensitiveLibrary}
                                    options={[{ value: "", label: "未选择敏感词库" }, ...DRESS_SENSITIVE_LIBRARIES.map((lexicon) => ({ value: lexicon.id, label: `${lexicon.label}（${lexicon.words.length}词）` }))]}
                                    onChange={(value) => setField("sensitiveLibrary", value)}
                                />
                                <SelectField
                                    label="替换词库"
                                    value={values.replacementLibrary}
                                    options={[{ value: "", label: "未选择替换词库" }, ...DRESS_REPLACEMENT_LIBRARIES.map((lexicon) => ({ value: lexicon.id, label: lexicon.label }))]}
                                    onChange={(value) => setField("replacementLibrary", value)}
                                />
                                <p className="text-[11px] leading-4 text-muted-foreground">
                                    选中的词库会随任务快照提交：生成文案命中敏感词时按替换词库改写。
                                </p>
                            </div>
                        ) : null}
                    </Section>

                    <Section title="模型选择">
                        <div className="flex items-center justify-between gap-2 rounded-[6px] border border-border px-2 py-1">
                            <span className="text-xs">LF智能模型 G-2.5 Sunburst</span>
                            <select
                                aria-label="模型"
                                className="h-6 rounded border border-border bg-background px-1 text-[11px] text-muted-foreground"
                                value={values.provider}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    const nextResolutions = dressResolutionOptionsFor(value);
                                    const nextQualities = dressQualityOptionsFor(value);
                                    setMoreRatios(false);
                                    update((previous) => ({
                                        ...previous,
                                        provider: value,
                                        resolution: nextResolutions.includes(previous.resolution) ? previous.resolution : (nextResolutions[0] ?? ""),
                                        quality: nextQualities.some((option) => option.value === previous.quality) ? previous.quality : (nextQualities[0]?.value ?? ""),
                                        aspectRatio: dressAspectRatioOptionsFor(value).includes(previous.aspectRatio) ? previous.aspectRatio : "1:1",
                                    }));
                                }}
                            >
                                {DRESS_PROVIDERS.map((item) => (
                                    <option key={item.code} value={item.code}>
                                        {item.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-[52px] shrink-0 text-[11px] text-muted-foreground">分辨率选择</span>
                            <div className="flex flex-wrap items-center gap-1">
                            {resolutionOptions.map((value) => (
                                <button
                                    key={`chip-${value}`}
                                    type="button"
                                    onClick={() => setField("resolution", value)}
                                    className={`rounded-md border px-2 py-[2px] text-[11px] ${
                                        values.resolution === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary"
                                    }`}
                                >
                                    {value}
                                </button>
                            ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-[52px] shrink-0 text-[11px] text-muted-foreground">模型品质</span>
                            <div className="flex flex-wrap items-center gap-1">
                            {qualityOptions.length ? (
                                qualityOptions.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setField("quality", option.value)}
                                        className={`rounded-md border px-2 py-[2px] text-[11px] ${
                                            values.quality === option.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary"
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))
                            ) : (
                                <span className="text-[11px] text-muted-foreground">该模型不支持品质档位</span>
                            )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-[52px] shrink-0 text-[11px] text-muted-foreground">生成比例</span>
                            <div className="flex flex-wrap items-center gap-1">
                            {ratioOptions.map((value) => (
                                <button
                                    key={`ratio-${value}`}
                                    type="button"
                                    onClick={() => setField("aspectRatio", value)}
                                    className={`rounded-md border px-2 py-[2px] text-[11px] ${
                                        values.aspectRatio === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary"
                                    }`}
                                >
                                    {value}
                                </button>
                            ))}
                            {extraRatioOptions.length ? (
                                <button
                                    type="button"
                                    aria-expanded={moreRatios}
                                    onClick={() => setMoreRatios((open) => !open)}
                                    className="rounded-md border border-border px-2 py-[2px] text-[11px] text-muted-foreground hover:border-primary"
                                >
                                    更多
                                </button>
                            ) : null}
                            {moreRatios
                                ? extraRatioOptions.map((value) => (
                                      <button
                                          key={`ratio-extra-${value}`}
                                          type="button"
                                          onClick={() => setField("aspectRatio", value)}
                                          className={`rounded-md border px-2 py-[2px] text-[11px] ${
                                              values.aspectRatio === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary"
                                          }`}
                                      >
                                          {value}
                                      </button>
                                  ))
                                : null}
                            </div>
                        </div>
                    </Section>

                {/* 第三列：场景与结果 */}
                    <Section title="生成类型（多选）">
                        <p className="mb-2 text-xs font-medium text-muted-foreground">主副图设置</p>
                        <div className="grid grid-cols-2 gap-1.5">
                            {DRESS_MAIN_SCENE_OPTIONS.map((option) => {
                                const selection = values.mainScenes[option.key as keyof DressWearSetValues["mainScenes"]];
                                return (
                                    <div key={option.key} className="flex flex-wrap items-center justify-between gap-1 rounded-md border border-border/70 px-2 py-1">
                                        <div className="flex items-center gap-1">
                                            <Toggle label={option.label} checked={selection.checked} onChange={(checked) => setSceneChecked(option.key, checked)} />
                                            <span className="text-[11px] tabular-nums text-muted-foreground">{selection.count}</span>
                                        </div>
                                        <CountStepper label={option.label} value={selection.count} onChange={(count) => setSceneCount(option.key, count)} />
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex flex-col gap-1 rounded-md bg-muted/40 p-2">
                            <p className="text-[11px] text-muted-foreground">选择排版</p>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                <Toggle label="每种排版生成一张" checked={values.layoutEach} onChange={(checked) => setField("layoutEach", checked)} />
                                <Toggle label="无文字模式" checked={values.noText} onChange={(checked) => setField("noText", checked)} />
                            </div>
                            <p className="text-[11px] leading-4 text-muted-foreground">💡 未选择排版时，将根据官方排版随机生成。</p>
                        </div>
                    </Section>

                    <Section title="生成类型（单选）">
                        <p className="mb-2 text-xs font-medium text-muted-foreground">A+图设置</p>
                        <div className="grid grid-cols-2 gap-1.5">
                            {DRESS_APLUS_SCENE_OPTIONS.map((option) => {
                                const selection = values.aplusScenes[option.key as keyof DressWearSetValues["aplusScenes"]];
                                return (
                                    <div key={option.key} className="flex flex-wrap items-center justify-between gap-1 rounded-md border border-border/70 px-2 py-1">
                                        <div className="flex items-center gap-1">
                                            <Toggle label={option.label} checked={selection.checked} onChange={(checked) => setSceneChecked(option.key, checked)} />
                                            <span className="text-[11px] tabular-nums text-muted-foreground">{selection.count}</span>
                                        </div>
                                        <CountStepper label={option.label} value={selection.count} onChange={(count) => setSceneCount(option.key, count)} />
                                    </div>
                                );
                            })}
                        </div>
                    </Section>

                    </>
                    </div>
                    <div data-testid="dress-suite-submit-bar" className="shrink-0 border-t border-border pt-2">
                    <section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-col">
                                <span className="text-[11px] text-muted-foreground">
                                    主副图{mainUnits}张 + A+图{aplusUnits}张 = 共{estimate.images}张
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {running ? (
                                    <button type="button" className="h-10 rounded-md border border-border px-3 text-sm" onClick={handleCancel}>
                                        取消等待
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
                                    disabled={running || blocking || !units.length || !references.length || !model}
                                    onClick={() => void handleGenerate()}
                                >
                                    {running ? "生成中…" : "开始生成"}
                                </button>
                            </div>
                        </div>
                        {!model ? <p className="text-xs text-destructive">尚未配置图像模型，请先在设置中添加渠道。</p> : null}
                        {blocking
                            ? issues
                                  .filter((issue) => issue.level === "error")
                                  .slice(0, 3)
                                  .map((issue) => (
                                      <p key={`${issue.field}-${issue.message}`} className="text-xs text-destructive">
                                          {issue.message}
                                      </p>
                                  ))
                            : null}
                        {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
                        {resultsStale ? <p className="text-xs text-destructive">结果来自上一版设置（已改源图 / 配置），下方结果仅作参考。</p> : null}
                    </section>
                    </div>
                    </div>
                )}
            >
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {/* 原站结果区页签栏 42px：「生成结果 / 优秀案例」+ 右端「历史记录」外链位（本地无独立历史页，不伪造跳转）。 */}
                    <div className="flex h-[42px] shrink-0 items-center gap-4 rounded-t-lg border-b border-border bg-card px-3" role="tablist">
                        {(
                            [
                                ["result", "生成结果"],
                                ["cases", "优秀案例"],
                            ] as const
                        ).map(([id, label]) => (
                            <button
                                key={id}
                                type="button"
                                role="tab"
                                aria-selected={rightTab === id}
                                data-testid={`dress-suite-tab-${id}`}
                                onClick={() => setRightTab(id)}
                                className={cn("h-[42px] border-b-2 text-[14px] leading-[22px] transition-colors", rightTab === id ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
                            >
                                {label}
                            </button>
                        ))}
                        <span data-testid="dress-suite-history-link" title="本地未接入历史记录页" className="ml-auto inline-flex items-center gap-1 text-[12px] leading-none text-foreground/50">
                            <History className="size-3" aria-hidden />
                            历史记录
                        </span>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                    {rightTab === "cases" ? (
                        <ToolCases cases={DRESS_SET_CASES} onApply={applyCase} applyingId={applyingCaseId} />
                    ) : !toolTasks.length ? (
                        /* 原站空态：958 宽案例轮播（上传服装图 → 生成结果 → 一键做同款），前 3 个案例。 */
                        <div className="flex min-h-full items-center justify-center" data-testid="dress-suite-empty">
                            <ToolCaseGuide
                                cases={DRESS_SET_CASES.slice(0, 3).map((item) => ({ ...item, params: item.params.map((param) => ({ ...param, label: "上传服装图" })) }))}
                                onApply={applyCase}
                                applyingId={applyingCaseId}
                            />
                        </div>
                    ) : (
                        <>
                        {/* 标准结果面板：reload 后由 storageKey 复原的真实字节直接渲染，三动作走统一链路。 */}
                        {panelTask ? (
                            <div data-testid="dress-result-panel" className="mb-3">
                                <ToolResult task={panelTask} toolId={toolId} title="生成结果" projectTitle="服装套图结果" />
                            </div>
                        ) : null}
                            <div className="flex flex-col gap-3">
                                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground" data-testid="dress-suite-summary">
                                    <span>
                                        共 {summary.total} 组 · 成功 {summary.succeeded} · 失败 {summary.failed} · 进行中 {summary.running}
                                    </span>
                                    <span>产物 {summary.images} 张</span>
                                    {staleTasks.length ? <span className="text-destructive">其中 {staleTasks.length} 组属于旧设置</span> : null}
                                </div>
                                {groups.map((group) => (
                                    <div key={`${group.group}:${group.scene}`} className="flex flex-col gap-2 rounded-md border border-border/70 p-3" data-testid={`dress-group-${group.scene}`}>
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="text-sm">{group.label}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px] text-muted-foreground">
                                                    {group.status === "succeeded" ? "成功" : group.status === "partial" ? "部分成功" : group.status === "failed" ? "失败" : group.status === "unknown" ? "状态未知" : "进行中"}
                                                    {group.images.length ? ` · ${group.images.length} 张` : ""}
                                                </span>
                                                {group.status === "failed" || group.status === "unknown" || group.status === "partial" ? (
                                                    <button type="button" className="h-7 rounded border border-border px-2 text-xs hover:border-primary" onClick={() => void handleRetryGroup(group)}>
                                                        重试本组
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>
                                        {group.images.length ? (
                                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                                                {group.images.map((image) => (
                                                    <figure key={image.id} className="overflow-hidden rounded border border-border/60">
                                                        <img src={image.dataUrl} alt={`${group.label} 产物`} className="aspect-[3/4] w-full object-cover" />
                                                        <figcaption className="flex items-center justify-between gap-1 px-2 py-1">
                                                            <span className="truncate text-[11px] text-muted-foreground">{image.id.slice(0, 8)}</span>
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    className="text-[11px] text-primary underline-offset-2 hover:underline"
                                                                    onClick={() => void handleSaveImageToAssets(image, group.label)}
                                                                >
                                                                    存入资产
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="text-[11px] text-primary underline-offset-2 hover:underline"
                                                                    onClick={() => void handleSendImageToCanvas(image, group.label)}
                                                                >
                                                                    发送画布
                                                                </button>
                                                                <a className="text-[11px] text-primary underline-offset-2 hover:underline" href={image.dataUrl} download={`${group.scene}-${image.id}.png`}>
                                                                    下载
                                                                </a>
                                                            </div>
                                                        </figcaption>
                                                    </figure>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-[11px] text-muted-foreground">{group.tasks.find((task) => task.error)?.error?.message ?? "等待上游返回…"}</p>
                                        )}
                                    </div>
                                ))}
                                {untagged.length ? <p className="text-[11px] text-muted-foreground">另有 {untagged.length} 个任务未带场景标签（历史数据），已保留不丢弃。</p> : null}
                            </div>
                        </>
                    )}
                    </div>
                </div>
            </ToolWorkspaceColumns>
        </div>
    );
}

export default DressSuiteWorkspace;
