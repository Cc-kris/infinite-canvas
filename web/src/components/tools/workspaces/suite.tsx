import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { loadToolAssetRecords, type ToolAssetConstraints, type ToolAssetRecord } from "@/services/api/tools/assets";
import { getToolGateway } from "@/services/api/tools/gateway";
import type { ToolTaskResultItem } from "@/services/api/tools/task-machine";
import { useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";

import {
    PRODUCT_IMAGE_SUITE_MAX_PRODUCT_INFO,
    PRODUCT_IMAGE_SUITE_TOOL_ID,
    buildSuiteUnits,
    SUITE_FONT_STYLES,
    SUITE_LAYOUT_MODES,
    SUITE_QUALITIES,
    SUITE_RATIOS,
    SUITE_RESOLUTIONS,
    SUITE_SOURCE_LIMITS,
    APLUS_MODULES,
    MAIN_SUB_MODULES,
    buildSuiteModulePlan,
    createDefaultSuiteConfig,
    createSuiteSnapshot,
    readSuiteConfig,
    suiteExpectedCount,
    validateSuiteConfig,
    type SuiteConfig,
    type SuiteConfigSnapshot,
} from "@/features/tools/registry/product-image-suite";
import {
    SuiteAdapterError,
    groupSuiteUnits,
    isSuiteSourceReady,
    retrySuiteUnit,
    runSuite,
    saveSuiteResultItem,
    summarizeSuiteRun,
    suiteResultsStale,
    validateSuiteSourceLimits,
    type SuiteSourceAsset,
    type SuiteUnitResult,
} from "@/features/tools/adapters/product-image-suite";

/** 页面规格（JPG/PNG/WEBP、≤10M、384–4096px）→ 通用素材约束字段。 */
const SUITE_ASSET_CONSTRAINTS: Partial<ToolAssetConstraints> = {
    mimeTypes: [...SUITE_SOURCE_LIMITS.mimeTypes],
    maxBytes: SUITE_SOURCE_LIMITS.maxBytes,
    minWidth: SUITE_SOURCE_LIMITS.minSide,
    minHeight: SUITE_SOURCE_LIMITS.minSide,
    maxWidth: SUITE_SOURCE_LIMITS.maxSide,
    maxHeight: SUITE_SOURCE_LIMITS.maxSide,
};

/* ------------------------------ 小组件 ------------------------------ */

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
    return (
        <section className="rounded-lg border border-stone-200 bg-white/60 p-3 dark:border-stone-800 dark:bg-stone-900/40">
            <header className="mb-2 flex items-baseline gap-2">
                <h3 className="text-sm font-medium text-stone-800 dark:text-stone-100">{title}</h3>
                {hint ? <span className="text-[11px] text-stone-500 dark:text-stone-400">{hint}</span> : null}
            </header>
            {children}
        </section>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex items-center justify-between gap-2 text-xs text-stone-600 dark:text-stone-300">
            <span className="shrink-0">{label}</span>
            {children}
        </label>
    );
}

const inputClass =
    "rounded-md border border-stone-200 bg-white px-2 py-1 text-xs text-stone-800 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100";

/* ------------------------------ 主组件 ------------------------------ */

export function ProductImageSuiteWorkspace({ className }: { className?: string }) {
    const toolId = PRODUCT_IMAGE_SUITE_TOOL_ID;
    const hydrate = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const flushDraft = useToolDraftStore((state) => state.flush);
    const draft = useToolDraftStore((state) => state.drafts[toolId]);
    const imageModel = useConfigStore((state) => state.config.imageModel);

    const [config, setConfig] = useState<SuiteConfig>(() => createDefaultSuiteConfig());
    const [source, setSource] = useState<SuiteSourceAsset | undefined>();
    const [restoringSource, setRestoringSource] = useState(false);
    const [units, setUnits] = useState<SuiteUnitResult[]>([]);
    const [snapshot, setSnapshot] = useState<SuiteConfigSnapshot | undefined>();
    const [running, setRunning] = useState(false);
    const [busyUnit, setBusyUnit] = useState<string | null>(null);
    const [runError, setRunError] = useState<string | undefined>();
    const [savedKeys, setSavedKeys] = useState<Record<string, string>>({});
    const [seeded, setSeeded] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    /* 草稿恢复：值 → 配置；assetIds → 商品图记录（丢失则要求重新选择） */
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const restored = await hydrate(toolId);
            if (cancelled) return;
            const parsed = readSuiteConfig(restored?.values?.suiteConfig as Record<string, unknown> | undefined);
            setConfig(parsed.config);
            setSeeded(true);
            const assetId = parsed.config.sourceAssetId;
            if (!assetId) return;
            setRestoringSource(true);
            try {
                const { records } = await loadToolAssetRecords([assetId]);
                if (cancelled) return;
                const record = records[0];
                if (record) setSource(sourceFromRecord(record));
            } finally {
                if (!cancelled) setRestoringSource(false);
            }
        })();
        return () => {
            cancelled = true;
            void flushDraft(toolId);
        };
    }, [toolId, hydrate, flushDraft]);

    const update = useCallback(
        (next: Partial<SuiteConfig>) => {
            setConfig((previous) => {
                const merged: SuiteConfig = { ...previous, ...next };
                patchDraft(toolId, {
                    values: { suiteConfig: merged },
                    assetIds: merged.sourceAssetId ? [merged.sourceAssetId] : [],
                });
                return merged;
            });
        },
        [patchDraft, toolId],
    );

    const onSourceChange = useCallback(
        (assetIds: string[], records: ToolAssetRecord[]) => {
            const record = records[0];
            if (!record) {
                setSource(undefined);
                update({ sourceAssetId: "" });
                return;
            }
            const next = sourceFromRecord(record);
            setSource(next);
            update({ sourceAssetId: next.assetId });
            const limits = validateSuiteSourceLimits(next);
            setRunError(limits.ok ? undefined : limits.message);
        },
        [update],
    );

    const issues = useMemo(
        () => validateSuiteConfig(config, { sourceReady: isSuiteSourceReady(source), imageModelReady: Boolean(imageModel?.trim()) }),
        [config, source, imageModel],
    );
    const expected = suiteExpectedCount(config);
    const plans = useMemo(() => buildSuiteModulePlan(config), [config]);
    const summary = summarizeSuiteRun(units);
    const stale = snapshot ? suiteResultsStale({ snapshot }, config) : false;

    const sourceIssue = source ? validateSuiteSourceLimits(source) : undefined;
    const blocked = running || issues.length > 0 || (sourceIssue ? !sourceIssue.ok : false);

    /* 生成：真实逐单元提交，回调增量渲染 */
    const onGenerate = useCallback(async () => {
        if (!source) return;
        setRunning(true);
        setRunError(undefined);
        setSavedKeys({});
        setUnits([]);
        const controller = new AbortController();
        abortRef.current = controller;
        const currentSnapshot = createSuiteSnapshot(config, draft?.revision ?? 0);
        setSnapshot(currentSnapshot);
        try {
            await flushDraft(toolId);
            const run = await runSuite({
                gateway: getToolGateway(),
                config,
                source,
                revision: draft?.revision ?? null,
                imageModelReady: Boolean(imageModel?.trim()),
                signal: controller.signal,
                onUnit: (unit) => setUnits((previous) => [...previous.filter((item) => item.unitId !== unit.unitId), unit]),
            });
            setUnits(run.units);
            setSnapshot(run.snapshot);
            const failed = run.units.filter((unit) => unit.status === "failed").length;
            if (failed > 0) setRunError(`${failed} 张失败，可单张重试。`);
        } catch (error) {
            setRunError(error instanceof SuiteAdapterError || error instanceof Error ? error.message : "生成失败。");
        } finally {
            setRunning(false);
            abortRef.current = null;
        }
    }, [config, source, imageModel, draft?.revision, flushDraft, toolId]);

    const onRetryUnit = useCallback(
        async (result: SuiteUnitResult) => {
            setBusyUnit(result.unitId);
            setRunError(undefined);
            try {
                const unitDef = buildSuiteUnitDefinition(config, result.unitId);
                if (!unitDef) throw new SuiteAdapterError("unit-missing", "找不到该单元配置，请重新生成。");
                const next = await retrySuiteUnit({ gateway: getToolGateway(), config, source: source ?? { assetId: "" }, unit: unitDef, previous: result });
                setUnits((previous) => previous.map((item) => (item.unitId === next.unitId ? next : item)));
            } catch (error) {
                setRunError(error instanceof Error ? error.message : "重试失败。");
            } finally {
                setBusyUnit(null);
            }
        },
        [config, source],
    );

    const onSave = useCallback(
        async (item: ToolTaskResultItem, result: SuiteUnitResult) => {
            try {
                const saved = await saveSuiteResultItem(item, result);
                setSavedKeys((previous) => ({ ...previous, [`${result.unitId}:${item.id}`]: saved.storageKey }));
            } catch (error) {
                setRunError(error instanceof Error ? error.message : "保存失败。");
            }
        },
        [],
    );

    return (
        <div className={`flex flex-col gap-3 ${className ?? ""}`} data-tool="product-image-suite">
            <div className="grid gap-3 lg:grid-cols-2">
                <Section title="商品图" hint={`JPG/PNG/WEBP · ≤${Math.round(SUITE_SOURCE_LIMITS.maxBytes / 1024 / 1024)}M · ${SUITE_SOURCE_LIMITS.minSide}–${SUITE_SOURCE_LIMITS.maxSide}px · 宽高比 ≤${SUITE_SOURCE_LIMITS.maxAspectRatio}:1`}>
                    <ToolAssetInput
                        toolId={toolId}
                        maxCount={1}
                        disabled={running}
                        title="上传商品图"
                        constraints={SUITE_ASSET_CONSTRAINTS}
                        onChange={onSourceChange}
                    />
                    {restoringSource ? <p className="mt-2 text-[11px] text-stone-500">正在恢复上次的商品图…</p> : null}
                    {!source && config.sourceAssetId && !restoringSource ? (
                        <p className="mt-2 text-[11px] text-amber-600">上次的商品图已失效，请重新选择。</p>
                    ) : null}
                    {source && sourceIssue && !sourceIssue.ok ? <p className="mt-2 text-[11px] text-red-600">{sourceIssue.message}</p> : null}
                </Section>

                <Section title="商品信息" hint={`${config.productInfo.length}/${PRODUCT_IMAGE_SUITE_MAX_PRODUCT_INFO}`}>
                    <textarea
                        value={config.productInfo}
                        onChange={(event) => update({ productInfo: event.target.value.slice(0, PRODUCT_IMAGE_SUITE_MAX_PRODUCT_INFO) })}
                        rows={6}
                        placeholder="商品卖点、材质、适用场景…（用于生成 Prompt，不写入上游任何账户）"
                        className="w-full resize-y rounded-md border border-stone-200 bg-white p-2 text-xs text-stone-800 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                    />
                </Section>

                <Section title="品牌基因" hint="关闭时不注入品牌描述">
                    <div className="flex flex-col gap-2">
                        <Field label="智能品牌">
                            <input
                                type="checkbox"
                                checked={config.brand.smartBrand}
                                onChange={(event) => update({ brand: { ...config.brand, smartBrand: event.target.checked } })}
                            />
                        </Field>
                        <Field label="主色">
                            <input
                                type="color"
                                value={config.brand.primaryColor}
                                onChange={(event) => update({ brand: { ...config.brand, primaryColor: event.target.value } })}
                                className="h-6 w-12 cursor-pointer rounded border border-stone-200 dark:border-stone-700"
                            />
                        </Field>
                        <Field label="字体风格">
                            <select
                                className={inputClass}
                                value={config.brand.fontStyle}
                                onChange={(event) =>
                                    update({ brand: { ...config.brand, fontStyle: event.target.value as typeof config.brand.fontStyle } })
                                }
                            >
                                <option value="">未指定</option>
                                {SUITE_FONT_STYLES.map((style) => (
                                    <option key={style.id} value={style.id}>
                                        {style.label}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <p className="text-[11px] text-stone-500">合规词库需接入词库服务后启用，未接入时不伪造选项。</p>
                    </div>
                </Section>

                <Section title="生成参数" hint={`模型：${imageModel?.trim() || "未配置"}`}>
                    <div className="flex flex-col gap-2">
                        <Field label="分辨率">
                            <select className={inputClass} value={config.resolution} onChange={(event) => update({ resolution: event.target.value as SuiteConfig["resolution"] })}>
                                {SUITE_RESOLUTIONS.map((value) => (
                                    <option key={value} value={value}>
                                        {value}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="品质">
                            <select className={inputClass} value={config.quality} onChange={(event) => update({ quality: event.target.value as SuiteConfig["quality"] })}>
                                {SUITE_QUALITIES.map((quality) => (
                                    <option key={quality.id} value={quality.id}>
                                        {quality.label}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="比例">
                            <select className={inputClass} value={config.ratio} onChange={(event) => update({ ratio: event.target.value as SuiteConfig["ratio"] })}>
                                {SUITE_RATIOS.map((ratio) => (
                                    <option key={ratio.id} value={ratio.id}>
                                        {ratio.label}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    </div>
                </Section>
            </div>

            <Section title="A+ 图" hint="单选一种，数量或排版二选一">
                <div className="flex flex-wrap gap-2">
                    {APLUS_MODULES.map((module) => (
                        <button
                            key={module.id}
                            type="button"
                            onClick={() => update({ aplusModuleId: config.aplusModuleId === module.id ? "" : module.id })}
                            className={`rounded-md border px-2 py-1 text-xs ${
                                config.aplusModuleId === module.id
                                    ? "border-stone-800 bg-stone-800 text-white dark:border-stone-200 dark:bg-stone-200 dark:text-stone-900"
                                    : "border-stone-200 text-stone-700 dark:border-stone-700 dark:text-stone-200"
                            }`}
                        >
                            {module.label}
                        </button>
                    ))}
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <Field label="张数">
                        <input
                            type="number"
                            min={1}
                            max={10}
                            className={`${inputClass} w-16`}
                            value={config.aplusCount}
                            onChange={(event) => update({ aplusCount: Number(event.target.value) || 1 })}
                        />
                    </Field>
                    <Field label="排版">
                        <select className={inputClass} value={config.aplusLayoutMode} onChange={(event) => update({ aplusLayoutMode: event.target.value as SuiteConfig["aplusLayoutMode"] })}>
                            {SUITE_LAYOUT_MODES.map((mode) => (
                                <option key={mode.id} value={mode.id}>
                                    {mode.label}
                                </option>
                            ))}
                        </select>
                    </Field>
                </div>
            </Section>

            <Section title="主副图" hint="可多选，每种单独设张数">
                <div className="flex flex-wrap gap-2">
                    {MAIN_SUB_MODULES.map((module) => {
                        const checked = config.mainSubModuleIds.includes(module.id);
                        return (
                            <button
                                key={module.id}
                                type="button"
                                onClick={() =>
                                    update({
                                        mainSubModuleIds: checked
                                            ? config.mainSubModuleIds.filter((id) => id !== module.id)
                                            : [...config.mainSubModuleIds, module.id],
                                    })
                                }
                                className={`rounded-md border px-2 py-1 text-xs ${
                                    checked
                                        ? "border-stone-800 bg-stone-800 text-white dark:border-stone-200 dark:bg-stone-200 dark:text-stone-900"
                                        : "border-stone-200 text-stone-700 dark:border-stone-700 dark:text-stone-200"
                                }`}
                            >
                                {module.label}
                            </button>
                        );
                    })}
                </div>
                {config.mainSubModuleIds.length ? (
                    <div className="mt-2 flex flex-wrap gap-3">
                        {MAIN_SUB_MODULES.filter((module) => config.mainSubModuleIds.includes(module.id)).map((module) => (
                            <label key={module.id} className="flex items-center gap-1 text-[11px] text-stone-600 dark:text-stone-300">
                                {module.label}
                                <input
                                    type="number"
                                    min={1}
                                    max={10}
                                    className={`${inputClass} w-14`}
                                    value={config.mainSubCounts[module.id] ?? module.defaultCount}
                                    onChange={(event) =>
                                        update({ mainSubCounts: { ...config.mainSubCounts, [module.id]: Number(event.target.value) || 1 } })
                                    }
                                />
                            </label>
                        ))}
                    </div>
                ) : null}
            </Section>

            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-white/70 p-3 dark:border-stone-800 dark:bg-stone-900/40">
                <span className="text-xs text-stone-600 dark:text-stone-300">
                    预计生成 <strong className="text-stone-900 dark:text-stone-100">{expected}</strong> 张
                    {plans.map((plan) => ` · ${plan.label}×${plan.count}`).join("")}
                </span>
                <div className="ml-auto flex items-center gap-2">
                    <button
                        type="button"
                        disabled={blocked}
                        title={issues[0]?.message}
                        onClick={() => void onGenerate()}
                        className="rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900"
                    >
                        {running ? "生成中…" : "开始生成"}
                    </button>
                    {units.length ? (
                        <button
                            type="button"
                            onClick={() => {
                                setUnits([]);
                                setSnapshot(undefined);
                                setSavedKeys({});
                                setRunError(undefined);
                            }}
                            className="rounded-md border border-stone-200 px-3 py-1.5 text-xs text-stone-700 dark:border-stone-700 dark:text-stone-200"
                        >
                            清空结果
                        </button>
                    ) : null}
                </div>
            </div>

            {issues.length || runError ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
                    {runError ? <p>{runError}</p> : null}
                    {issues.map((issue) => (
                        <p key={issue.code}>{issue.message}</p>
                    ))}
                </div>
            ) : null}

            {stale && units.length ? (
                <p className="text-[11px] text-amber-600">配置已变更，下方结果来自旧版本；重新生成可更新。</p>
            ) : null}

            {units.length ? (
                <div className="flex flex-col gap-3">
                    <p className="text-[11px] text-stone-500">
                        共 {summary.total} 张 · 成功 {summary.succeeded} · 失败 {summary.failed} · 待定 {summary.pending}
                    </p>
                    {groupSuiteUnits(units).map((group) => (
                        <div key={group.moduleId} className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                            <h4 className="mb-2 text-xs font-medium text-stone-700 dark:text-stone-200">
                                {group.label}（{group.succeeded}/{group.total}）
                            </h4>
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {group.units.map((unit) => (
                                    <article key={unit.unitId} className="rounded-md border border-stone-200 p-2 dark:border-stone-800">
                                        <header className="mb-1 flex items-center justify-between gap-2">
                                            <span className="text-[11px] text-stone-600 dark:text-stone-300">{unit.label}</span>
                                            <span className={`text-[11px] ${unit.status === "failed" ? "text-red-600" : unit.status === "succeeded" ? "text-emerald-600" : "text-stone-500"}`}>
                                                {unit.status === "succeeded" ? "成功" : unit.status === "failed" ? "失败" : unit.status === "cancelled" ? "已取消" : "待定"}
                                            </span>
                                        </header>
                                        {unit.items.length ? (
                                            <div className="flex flex-col gap-1">
                                                {unit.items.map((item) => {
                                                    const key = `${unit.unitId}:${item.id}`;
                                                    const src = item.dataUrl ?? item.url;
                                                    return (
                                                        <div key={item.id} className="flex items-center gap-2">
                                                            {src ? <img src={src} alt={unit.label} className="size-16 rounded object-cover" /> : null}
                                                            <button
                                                                type="button"
                                                                onClick={() => void onSave(item, unit)}
                                                                className="rounded border border-stone-200 px-2 py-0.5 text-[11px] text-stone-700 dark:border-stone-700 dark:text-stone-200"
                                                            >
                                                                {savedKeys[key] ? "已存作品库" : "保存"}
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-[11px] text-stone-500">{unit.error?.message ?? (unit.status === "pending" ? "上游结果未知，稍后重试可查询。" : "暂无内容")}</p>
                                        )}
                                        {unit.status === "failed" ? (
                                            <button
                                                type="button"
                                                disabled={busyUnit === unit.unitId}
                                                onClick={() => void onRetryUnit(unit)}
                                                className="mt-2 rounded border border-stone-300 px-2 py-0.5 text-[11px] text-stone-700 disabled:opacity-40 dark:border-stone-700 dark:text-stone-200"
                                            >
                                                {busyUnit === unit.unitId ? "重试中…" : "重试这一张"}
                                            </button>
                                        ) : null}
                                    </article>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}

            {seeded ? null : <p className="text-[11px] text-stone-500">正在读取草稿…</p>}
        </div>
    );
}

/* ------------------------------ 辅助 ------------------------------ */

function sourceFromRecord(record: ToolAssetRecord): SuiteSourceAsset {
    return {
        assetId: record.id,
        dataUrl: record.url,
        url: record.url,
        name: record.name,
        mimeType: record.mimeType,
        bytes: record.bytes,
        width: record.width,
        height: record.height,
    };
}

function buildSuiteUnitDefinition(config: SuiteConfig, unitId: string) {
    return buildSuiteUnits(config).find((unit) => unit.id === unitId);
}

export default ProductImageSuiteWorkspace;
