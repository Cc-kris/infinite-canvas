import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolCases } from "@/components/tools/tool-cases";
import type { ToolCase } from "@/components/tools/tool-cases";
import { uploadCaseFiles } from "@/features/tools/case-apply";
import { DRESS_SET_CASES } from "@/features/tools/suite6-cases-data";
import { saveResultItemToAssets, sendResultItemToCanvas } from "@/components/tools/tool-result-actions";
import {
    createDressWearSetValues,
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
    DRESS_PLATFORM_SUGGESTIONS,
    DRESS_PRODUCT_INFO_MAX_LENGTH,
    DRESS_PROVIDERS,
    DRESS_REGION_SUGGESTIONS,
    DRESS_SCENE_BY_KEY,
    DRESS_UPLOAD_LIMITS,
    DRESS_WEAR_SET_TOOL_ID,
    dressAspectRatioOptionsFor,
    dressQualityOptionsFor,
    dressResolutionOptionsFor,
    type DressSceneKey,
} from "@/features/tools/registry/dress-wear-set";
import type { ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { selectableModelsByCapability, useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";

/* ------------------------------------------------------------------ *
 * 小控件：不引第三方表单库，保证在 1024/768/390 下都是真实可操作控件。
 * ------------------------------------------------------------------ */

function Section({ title, hint, children, className = "" }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
    return (
        <section className={`flex flex-col gap-3 rounded-lg border border-border bg-card p-4 ${className}`}>
            <header className="flex flex-col gap-1">
                <h2 className="text-sm font-medium">{title}</h2>
                {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
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
            <button type="button" className="h-7 w-7 rounded border border-border text-sm leading-none text-muted-foreground hover:border-primary disabled:opacity-40" disabled={value >= 15} aria-label={`${label}增加`} onClick={() => onChange(value + 1)}>
                +
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

function DataList({ id, values }: { id: string; values: readonly string[] }) {
    return (
        <datalist id={id}>
            {values.map((value) => (
                <option key={value} value={value} />
            ))}
        </datalist>
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

export function DressSuiteWorkspace({ toolId = DRESS_WEAR_SET_TOOL_ID }: DressSuiteWorkspaceProps) {
    const config = useConfigStore((state) => state.config);
    const imageModels = useMemo(() => selectableModelsByCapability(config, "image"), [config]);
    const model = config.imageModel || imageModels[0] || "";

    const [values, setValues] = useState<DressWearSetValues>(() => createDressWearSetValues());
    const [records, setRecords] = useState<ToolAssetRecord[]>([]);
    const [notice, setNotice] = useState("");
    const [applyingCaseId, setApplyingCaseId] = useState<string | null>(null);
    const [caseApplyNonce, setCaseApplyNonce] = useState(0);
    const [running, setRunning] = useState(false);
    const [snapshot, setSnapshot] = useState<DressSubmitSnapshot | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const hydrate = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const draftRevision = useToolDraftStore((state) => state.drafts[toolId]?.revision ?? null);

    /* 「优秀案例」做同款：真实案例原图入库后回填商品图 */
    const applyCase = useCallback(async (item: ToolCase) => {
        setApplyingCaseId(item.id);
        setNotice("");
        try {
            const assets = await uploadCaseFiles(item);
            const record = assets.source as ToolAssetRecord | undefined;
            if (!record) throw new Error("该案例缺少可用的服装图");
            setRecords([record]);
            patchDraft(toolId, { assetIds: [record.id] });
            setCaseApplyNonce((value) => value + 1);
            setNotice(`已套用案例服装图：${record.name}`);
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "案例套用失败");
        } finally {
            setApplyingCaseId(null);
        }
    }, [patchDraft, toolId]);

    const tasks = useToolTaskStore((state) => state.tasks);
    const runTool = useToolTaskStore((state) => state.runTool);
    const retryTask = useToolTaskStore((state) => state.retryTask);

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
            setNotice("请先上传商品图（最多 5 张）。");
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
            const failedTask: ToolTask | undefined = group.tasks.find((task) => task.status === "failed" || task.status === "unknown");
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
    const ratioOptions = dressAspectRatioOptionsFor(values.provider);

    const errorFor = (field: string) => issues.filter((issue) => issue.field === field && issue.level === "error")[0];

    return (
        <div className="flex flex-col gap-4" data-testid="dress-suite-workspace" data-tool-id={toolId}>
            <div className="grid gap-4 xl:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
                {/* 左列：素材与商品设定 */}
                <div className="flex min-w-0 flex-col gap-4">
                    <Section title="商品图" hint={`jpg / png / webp，单张 ≤ ${Math.round(DRESS_UPLOAD_LIMITS.maxBytes / 1024 / 1024)}MB，长边 ≤ ${DRESS_UPLOAD_LIMITS.maxSide}px，最多 ${DRESS_UPLOAD_LIMITS.maxFiles} 张。`}>
                        <ToolAssetInput
                            key={`case-${caseApplyNonce}`}
                            toolId={toolId}
                            maxCount={DRESS_UPLOAD_LIMITS.maxFiles}
                            constraints={{
                                kind: "image",
                                mimeTypes: [...DRESS_UPLOAD_LIMITS.mimeTypes],
                                maxBytes: DRESS_UPLOAD_LIMITS.maxBytes,
                                minWidth: DRESS_UPLOAD_LIMITS.minSide,
                                minHeight: DRESS_UPLOAD_LIMITS.minSide,
                                maxWidth: DRESS_UPLOAD_LIMITS.maxSide,
                                maxHeight: DRESS_UPLOAD_LIMITS.maxSide,
                            }}
                            title="上传商品图"
                            onChange={(_assetIds, next) => setRecords(next)}
                        />
                        {errorFor("references") ? <p className="text-xs text-destructive">{errorFor("references")?.message}</p> : null}
                    </Section>

                    <Section title="商品信息" hint="卖点、材质、尺码等会进入提示词；越具体越稳定。">
                        <textarea
                            className="min-h-24 w-full resize-y rounded-md border border-border bg-background p-2 text-sm outline-none focus-visible:border-primary"
                            maxLength={DRESS_PRODUCT_INFO_MAX_LENGTH}
                            value={values.productInfo}
                            placeholder="例如：100% 新疆长绒棉，宽松直筒版型，落肩袖，适合 155-175cm，机洗不掉色"
                            onChange={(event) => setField("productInfo", event.target.value)}
                        />
                        <span className="self-end text-[11px] tabular-nums text-muted-foreground">
                            {values.productInfo.length} / {DRESS_PRODUCT_INFO_MAX_LENGTH}
                        </span>
                    </Section>

                    <Section title="销售设定" hint="平台 / 地区 / 语言会同时约束文案与合规检查。">
                        <DataList id="dress-platform" values={DRESS_PLATFORM_SUGGESTIONS} />
                        <DataList id="dress-region" values={DRESS_REGION_SUGGESTIONS} />
                        <DataList id="dress-language" values={DRESS_LANGUAGE_SUGGESTIONS} />
                        <div className="grid gap-3 sm:grid-cols-2">
                            <TextField label="平台" value={values.platform} list="dress-platform" onChange={(value) => setField("platform", value)} />
                            <TextField label="销售地区" value={values.salesRegion} list="dress-region" onChange={(value) => setField("salesRegion", value)} />
                            <TextField label="语言" value={values.language} list="dress-language" onChange={(value) => setField("language", value)} />
                            <SelectField
                                label="品牌基因"
                                value={values.brandMode}
                                options={[
                                    { value: "smart", label: "智能识别" },
                                    { value: "custom", label: "自定义品牌" },
                                ]}
                                onChange={(value) => setField("brandMode", value === "custom" ? "custom" : "smart")}
                            />
                        </div>
                        {values.brandMode === "custom" ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <TextField label="品牌名" value={values.brandName} onChange={(value) => setField("brandName", value)} />
                                <TextField label="品牌色" value={values.brandColor} placeholder="#1B1B1B" onChange={(value) => setField("brandColor", value)} />
                                <TextField label="品牌字体" value={values.brandFont} placeholder="思源黑体 / Inter" onChange={(value) => setField("brandFont", value)} />
                            </div>
                        ) : null}
                    </Section>

                    <Section title="合规检查" hint="开启后对敏感词库做替换，并产出检查结论。">
                        <Toggle label="启用敏感词与替换词库" checked={values.complianceCheck} onChange={(checked) => setField("complianceCheck", checked)} />
                        {values.complianceCheck ? (
                            <div className="grid gap-3">
                                <TextField label="敏感词库" value={values.sensitiveLibrary} placeholder="best seller, cure, 100% ..." onChange={(value) => setField("sensitiveLibrary", value)} />
                                <TextField label="替换词库" value={values.replacementLibrary} placeholder="top rated, helps, ..." onChange={(value) => setField("replacementLibrary", value)} />
                            </div>
                        ) : null}
                    </Section>

                    <Section title="生成参数" hint={`当前模型：${provider?.name ?? values.provider}；比例与品质按模型目录过滤。`}>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <SelectField
                                label="模型"
                                value={values.provider}
                                options={DRESS_PROVIDERS.map((item) => ({ value: item.code, label: item.name }))}
                                onChange={(value) => {
                                    const next = DRESS_PROVIDERS.find((item) => item.code === value);
                                    const nextResolutions = dressResolutionOptionsFor(value);
                                    const nextQualities = dressQualityOptionsFor(value);
                                    update((previous) => ({
                                        ...previous,
                                        provider: value,
                                        resolution: nextResolutions.includes(previous.resolution) ? previous.resolution : (nextResolutions[0] ?? ""),
                                        quality: nextQualities.some((option) => option.value === previous.quality) ? previous.quality : (nextQualities[0]?.value ?? ""),
                                        aspectRatio: dressAspectRatioOptionsFor(value).includes(previous.aspectRatio) ? previous.aspectRatio : "1:1",
                                    }));
                                    void next;
                                }}
                            />
                            <SelectField label="比例" value={values.aspectRatio} options={ratioOptions.map((value) => ({ value, label: value }))} onChange={(value) => setField("aspectRatio", value)} />
                            <SelectField label="分辨率" value={values.resolution} options={resolutionOptions.map((value) => ({ value, label: value }))} onChange={(value) => setField("resolution", value)} />
                            <SelectField
                                label="品质"
                                value={values.quality}
                                options={qualityOptions.length ? qualityOptions.map((option) => ({ value: option.value, label: option.label })) : [{ value: "", label: "该模型不支持品质档位" }]}
                                onChange={(value) => setField("quality", value)}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Toggle label="画面不出现文字" checked={values.noText} onChange={(checked) => setField("noText", checked)} hint="避免模型生成乱码文案，A+ 长图建议开启。" />
                            <Toggle label="每张单独拆分" checked={values.layoutEach} onChange={(checked) => setField("layoutEach", checked)} hint="关闭时同组多张按一张拼版提交。" />
                        </div>
                    </Section>
                </div>

                {/* 右列：场景与结果 */}
                <div className="flex min-w-0 flex-col gap-4">
                    <Section title="主副图" hint="可多选；每个场景单独设定数量与版式。">
                        <div className="flex flex-col gap-2">
                            {DRESS_MAIN_SCENE_OPTIONS.map((option) => {
                                const selection = values.mainScenes[option.key as keyof DressWearSetValues["mainScenes"]];
                                return (
                                    <div key={option.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 px-3 py-2">
                                        <Toggle label={option.label} checked={selection.checked} onChange={(checked) => setSceneChecked(option.key, checked)} />
                                        <CountStepper label={option.label} value={selection.count} onChange={(count) => setSceneCount(option.key, count)} />
                                    </div>
                                );
                            })}
                        </div>
                    </Section>

                    <Section title="A+ 图" hint="单选：一次只生成一种 A+ 版式。">
                        <div className="flex flex-col gap-2">
                            {DRESS_APLUS_SCENE_OPTIONS.map((option) => {
                                const selection = values.aplusScenes[option.key as keyof DressWearSetValues["aplusScenes"]];
                                return (
                                    <div key={option.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 px-3 py-2">
                                        <Toggle label={option.label} checked={selection.checked} onChange={(checked) => setSceneChecked(option.key, checked)} />
                                        <CountStepper label={option.label} value={selection.count} onChange={(count) => setSceneCount(option.key, count)} />
                                    </div>
                                );
                            })}
                        </div>
                    </Section>

                    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-col">
                                <span className="text-sm">
                                    预计产出 <strong className="tabular-nums">{estimate.images}</strong> 张 / <strong className="tabular-nums">{estimate.groups}</strong> 组
                                </span>
                                <span className="text-[11px] text-muted-foreground">实际以网关返回为准；每组一次真实请求，失败不自动重刷。</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {running ? (
                                    <button type="button" className="h-9 rounded-md border border-border px-3 text-sm" onClick={handleCancel}>
                                        取消等待
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
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
                        {resultsStale ? <p className="text-xs text-amber-600">结果来自上一版设置（已改源图 / 配置），下方结果仅作参考。</p> : null}
                    </section>

                    <Section title="套图结果" hint="按场景分组；组内可单张下载，失败组可单独重试。">
                        {!toolTasks.length ? (
                            <div className="rounded-md border border-dashed border-border px-4 py-10 text-center text-xs text-muted-foreground" data-testid="dress-suite-empty">
                                还没有结果。上传商品图并选择场景后点击「开始生成」。
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground" data-testid="dress-suite-summary">
                                    <span>
                                        共 {summary.total} 组 · 成功 {summary.succeeded} · 失败 {summary.failed} · 进行中 {summary.running}
                                    </span>
                                    <span>产物 {summary.images} 张</span>
                                    {staleTasks.length ? <span className="text-amber-600">其中 {staleTasks.length} 组属于旧设置</span> : null}
                                </div>
                                {groups.map((group) => (
                                    <div key={`${group.group}:${group.scene}`} className="flex flex-col gap-2 rounded-md border border-border/70 p-3" data-testid={`dress-group-${group.scene}`}>
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="text-sm">{group.label}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px] text-muted-foreground">
                                                    {group.status === "succeeded" ? "成功" : group.status === "failed" ? "失败" : group.status === "unknown" ? "状态未知" : "进行中"}
                                                    {group.images.length ? ` · ${group.images.length} 张` : ""}
                                                </span>
                                                {group.status === "failed" || group.status === "unknown" ? (
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
                        )}
                    </Section>

                    <Section title="优秀案例" hint="真实优秀作品；点「做同款」把案例服装图写入商品图，再自行调整场景与数量。">
                        <ToolCases
                            cases={DRESS_SET_CASES}
                            onApply={applyCase}
                            applyingId={applyingCaseId}
                            emptyHint="暂无优秀案例"
                        />
                    </Section>
                </div>
            </div>
        </div>
    );
}

export default DressSuiteWorkspace;
