import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { saveResultItemToAssets, sendResultItemToCanvas } from "@/components/tools/tool-result-actions";
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
import {
    MARKET_APLUS_TEMPLATES,
    MARKET_FONT_STYLES,
    MARKET_LANGUAGES,
    MARKET_MAX_MODULE_COUNT,
    MARKET_PLATFORMS,
    MARKET_PRODUCT_INFO_MAX_LENGTH,
    MARKET_PROVIDERS,
    MARKET_SALES_REGIONS,
    MARKET_UPLOAD_LIMITS,
    PRODUCT_MARKET_MATERIAL_TOOL_ID,
    aplusRatiosForPlatform,
    availableMarketingRatios,
    availableQualities,
    availableResolutions,
    buildMarketPlan,
    buildMarketUnits,
    createDefaultMarketConfig,
    findRegion,
    marketExpectedCount,
    normalizeConfig,
    platformSupportsAplus,
    readMarketConfig,
    resolveProviderCode,
    validateMarketConfig,
    type MarketConfig,
    type MarketPlatformId,
    type MarketSnapshot,
} from "@/features/tools/registry/product-market-material";
import {
    MarketAdapterError,
    groupMarketUnits,
    isMarketSourceReady,
    marketResultsStale,
    retryMarketUnit,
    runMarketMaterial,
    summarizeMarketRun,
    validateMarketSourceLimits,
    type MarketSourceAsset,
    type MarketUnitResult,
} from "@/features/tools/adapters/product-market-material";

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
    const [rightTab, setRightTab] = useState<"result" | "cases" | "history">("result");
    const [disclaimerOpen, setDisclaimerOpen] = useState(false);
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
    /* 原站费用行：A+图张数 + 主副图张数，合计 50 点/张 */
    const aplusUnits = config.aplusModuleId ? config.aplusCount : 0;
    const mainSubUnits = Math.max(0, expected - aplusUnits);

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
        <div className={cn("flex h-full min-h-0 bg-white", className)} data-tool="product-image-suite" data-layout="linkfox-two-pane">
            <div className="flex h-full w-[307px] shrink-0 flex-col border-r border-[#EDEDF0]">
                <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-3">
                    <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-[12px] text-[#8a8a99]">
                        <span>免责声明</span>
                        <button type="button" className="text-[12px] text-[#723cf9] hover:underline" onClick={() => setDisclaimerOpen((v) => !v)}>
                            {disclaimerOpen ? "收起" : "查看"}
                        </button>
                    </div>
                    {disclaimerOpen ? (
                        <p className="rounded-[6px] bg-[#faf9ff] px-3 py-2 text-[11px] leading-4 text-[#6b6b7a]">
                            生成结果由 AI 模型产生，仅作设计参考；商用前请自行确认素材与商标授权，平台不对生成内容的合规性承担连带责任。
                        </p>
                    ) : null}
                <Section title="多视角白底商品&实拍图">
                    <ToolAssetInput
                        toolId={toolId}
                        maxCount={1}
                        disabled={running}
                        title=""
                        variant="linkfox"
                        wide
                        hint={`10M以内，${SUITE_SOURCE_LIMITS.minSide}*${SUITE_SOURCE_LIMITS.minSide} ~ ${SUITE_SOURCE_LIMITS.maxSide}*${SUITE_SOURCE_LIMITS.maxSide}，最大宽高比${SUITE_SOURCE_LIMITS.maxAspectRatio}`}
                        constraints={SUITE_ASSET_CONSTRAINTS}
                        onChange={onSourceChange}
                    />
                    {restoringSource ? <p className="mt-2 text-[11px] text-stone-500">正在恢复上次的商品图…</p> : null}
                    {!source && config.sourceAssetId && !restoringSource ? (
                        <p className="mt-2 text-[11px] text-amber-600">上次的商品图已失效，请重新选择。</p>
                    ) : null}
                    {source && sourceIssue && !sourceIssue.ok ? <p className="mt-2 text-[11px] text-red-600">{sourceIssue.message}</p> : null}
                </Section>

                <Section title="商品信息">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                data-testid="suite-ai-analysis"
                                disabled={running || !config.productInfo.trim()}
                                title={config.productInfo.trim() ? "根据商品信息生成补充描述待接入（PARTIAL）" : "先填写商品信息"}
                                className="rounded-[4px] border border-[#e5e5ea] px-2 py-0.5 text-[11px] text-[#5a5a66] disabled:opacity-50"
                            >
                                AI分析
                            </button>
                            <button
                                type="button"
                                data-testid="suite-wizard"
                                disabled={running || !source}
                                title={source ? "填表向导待接入（PARTIAL）" : "先上传商品图"}
                                className="rounded-[4px] border border-[#e5e5ea] px-2 py-0.5 text-[11px] text-[#5a5a66] disabled:opacity-50"
                            >
                                向导
                            </button>
                        </div>
                        <span className="text-[11px] text-[#8a8a99]">
                            {config.productInfo.length} / {PRODUCT_IMAGE_SUITE_MAX_PRODUCT_INFO}
                        </span>
                    </div>
                    <textarea
                        value={config.productInfo}
                        onChange={(event) => update({ productInfo: event.target.value.slice(0, PRODUCT_IMAGE_SUITE_MAX_PRODUCT_INFO) })}
                        rows={6}
                        placeholder="商品卖点、材质、适用场景…（用于生成 Prompt，不写入上游任何账户）"
                        className="w-full resize-y rounded-md border border-stone-200 bg-white p-2 text-xs text-stone-800 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                    />
                </Section>

                <Section title="品牌与合规（可选）">
                    <div className="flex flex-col gap-2">
                        <Field label="智能品牌基因">
                            <input
                                type="checkbox"
                                checked={config.brand.smartBrand}
                                onChange={(event) => update({ brand: { ...config.brand, smartBrand: event.target.checked } })}
                            />
                        </Field>
                        <Field label="智能主色、智能字体风格">
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    aria-label="智能主色"
                                    value={config.brand.primaryColor || "#ffffff"}
                                    onChange={(event) => update({ brand: { ...config.brand, primaryColor: event.target.value } })}
                                    className="h-6 w-10 shrink-0 cursor-pointer rounded border border-stone-200 dark:border-stone-700"
                                />
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
                            </div>
                        </Field>
                        <div className="flex items-center gap-1.5 text-[11px] text-[#8a8a99]">
                            <span>智能合规检查</span>
                            <span>未选择敏感词库</span>
                            <span>·</span>
                            <span>未选择替换词库</span>
                        </div>
                    </div>
                </Section>

                <Section title="模型选择">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-1.5 text-[12px] text-[#2b2b36]">
                            <span>LF智能模型 G-2.5 Sunburst</span>
                            <span className="rounded-[3px] bg-[#f2eeff] px-1 text-[10px] leading-4 text-[#723cf9]">NEW</span>
                        </div>
                        <span className="text-[11px] text-[#8a8a99]">当前模型：{imageModel?.split("::").pop()?.trim() || "未配置"}</span>
                        <Field label="分辨率选择">
                            <select className={inputClass} value={config.resolution} onChange={(event) => update({ resolution: event.target.value as SuiteConfig["resolution"] })}>
                                {SUITE_RESOLUTIONS.map((value) => (
                                    <option key={value} value={value}>
                                        {value}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="模型品质">
                            <select className={inputClass} value={config.quality} onChange={(event) => update({ quality: event.target.value as SuiteConfig["quality"] })}>
                                {SUITE_QUALITIES.map((quality) => (
                                    <option key={quality.id} value={quality.id}>
                                        {quality.label}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="生成比例">
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

            <Section title="A+图设置">
                <p className="mb-1.5 text-[11px] text-[#8a8a99]">生成类型（单选）</p>
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

            <Section title="主副图设置">
                <p className="mb-1.5 text-[11px] text-[#8a8a99]">生成类型（多选）</p>
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

                    </div>
                </div>
                <div className="shrink-0 border-t border-[#EDEDF0] px-6 py-3" data-testid="suite-fee-footer">
                    <p className="text-[11px] leading-4 text-[#6b6b80]">
                        A+图{aplusUnits}张 * 每张50点 + 主副图{mainSubUnits}张 * 每张50点 = {expected * 50}点
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                        <button
                            type="button"
                            disabled={blocked}
                            title={issues[0]?.message}
                            onClick={() => void onGenerate()}
                            data-testid="suite-generate"
                            className="h-8 flex-1 rounded-[4px] bg-[#723cf9] text-[12px] font-medium leading-none text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {running ? "生成中…" : "开始生成"}
                        </button>
                        <span className="shrink-0 text-[11px] leading-4 text-[#8a8a99]">({expected * 50}算力)</span>
                        {units.length ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setUnits([]);
                                    setSnapshot(undefined);
                                    setSavedKeys({});
                                    setRunError(undefined);
                                }}
                                className="h-8 rounded-[4px] border border-[#E6E6EB] px-3 text-[12px] leading-none text-[#5a5a70]"
                            >
                                清空
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex h-11 shrink-0 items-center gap-6 border-b border-[#EDEDF0] px-6" role="tablist">
                    {([
                        ["result", "生成结果"],
                        ["cases", "优秀案例"],
                        ["history", "历史记录"],
                    ] as const).map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            role="tab"
                            aria-selected={rightTab === id}
                            data-testid={`suite-tab-${id}`}
                            onClick={() => setRightTab(id)}
                            className={cn(
                                "h-11 text-[13px] leading-none transition",
                                rightTab === id
                                    ? "border-b-2 border-[#723cf9] font-medium text-[#1f1f2c]"
                                    : "border-b-2 border-transparent text-[#6b6b80] hover:text-[#1f1f2c]",
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                <div role="tabpanel" hidden={rightTab !== "cases"} data-testid="suite-panel-cases" className="flex h-full flex-col">
                    <p className="text-[12px] text-stone-500">
                        案例库尚未接入：原站此处展示平台优秀套图作品（上传商品图 / 生成结果 / 一键做同款）。真实案例数据接口就绪后按同结构回填，暂不伪造卡片。
                    </p>
                </div>
                <div role="tabpanel" hidden={rightTab !== "history"} data-testid="suite-panel-history">
                    <ToolTaskHistory toolId={toolId} limit={8} emptyHint="还没有套图任务记录" />
                </div>
                <div role="tabpanel" hidden={rightTab !== "result"} data-testid="suite-panel-result" className="flex flex-col gap-3">
                    <p className="text-[11px] text-[#6b6b80]">
                        预计生成 {expected} 张{plans.map((plan) => ` · ${plan.label}×${plan.count}`).join("")}
                    </p>

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
                </div>
            </div>
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

/* ========================= 商品营销素材（TASK-039 / makeType 64） ========================= */

/**
 * 商品营销素材工作区：商品多图 + 信息 → 品牌/平台/语言 → A+ 与营销画幅 → 按模块分组的结果。
 * 真实边界与套图一致：逐屏真实提交、单屏可重试、结果只来自 task.result.items、保存落文件存储。
 */
export function ProductMarketMaterialWorkspace({ className }: { className?: string }) {
    const toolId = PRODUCT_MARKET_MATERIAL_TOOL_ID;
    const hydrate = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const flushDraft = useToolDraftStore((state) => state.flush);
    const draft = useToolDraftStore((state) => state.drafts[toolId]);
    const imageModel = useConfigStore((state) => state.config.imageModel);

    const [config, setConfig] = useState<MarketConfig>(() => createDefaultMarketConfig());
    const [sources, setSources] = useState<MarketSourceAsset[]>([]);
    const [units, setUnits] = useState<MarketUnitResult[]>([]);
    const [snapshot, setSnapshot] = useState<MarketSnapshot | undefined>();
    const [running, setRunning] = useState(false);
    const [busyUnit, setBusyUnit] = useState<string | null>(null);
    const [runError, setRunError] = useState<string | undefined>();
    const [savedKeys, setSavedKeys] = useState<Record<string, string>>({});
    const [canvasKeys, setCanvasKeys] = useState<Record<string, string>>({});
    const [seeded, setSeeded] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    /* 草稿恢复：values.marketConfig + 商品图记录（记录缺失则要求重新上传） */
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const restored = await hydrate(toolId);
            if (cancelled) return;
            const parsed = readMarketConfig(restored?.values?.marketConfig as Record<string, unknown> | undefined);
            setConfig(parsed.config);
            setSeeded(true);
            if (parsed.config.sourceAssetIds.length === 0) return;
            const { records } = await loadToolAssetRecords(parsed.config.sourceAssetIds);
            if (cancelled) return;
            setSources(records.map(marketSourceFromRecord));
        })();
        return () => {
            cancelled = true;
            void flushDraft(toolId);
        };
    }, [toolId, hydrate, flushDraft]);

    const update = useCallback(
        (next: Partial<MarketConfig>) => {
            setConfig((previous) => {
                const merged = normalizeConfig({ ...previous, ...next });
                patchDraft(toolId, {
                    values: { marketConfig: merged },
                    assetIds: merged.sourceAssetIds,
                });
                return merged;
            });
        },
        [patchDraft, toolId],
    );

    const onSourcesChange = useCallback(
        (assetIds: string[], records: ToolAssetRecord[]) => {
            setSources(records.map(marketSourceFromRecord));
            const limited = assetIds.slice(0, MARKET_UPLOAD_LIMITS.maxFiles);
            update({ sourceAssetIds: limited, coverList: limited.slice(0, 1) });
        },
        [update],
    );

    const provider = resolveProviderCode(config, imageModel);
    const readyCount = sources.filter((source) => isMarketSourceReady(source)).length;
    const issues = useMemo(
        () => validateMarketConfig(config, { sourceReadyCount: readyCount, imageModelReady: Boolean(imageModel?.trim()) }),
        [config, readyCount, imageModel],
    );
    const plans = useMemo(() => buildMarketPlan(config), [config]);
    const expected = marketExpectedCount(config);
    const summary = summarizeMarketRun(units);
    const stale = snapshot ? marketResultsStale({ snapshot }, config, { images: config.sourceAssetIds, provider }) : false;
    const blocked = running || issues.length > 0;

    const sourceIssue = sources.map((source) => validateMarketSourceLimits(source)).find((result) => !result.ok);

    const onGenerate = useCallback(async () => {
        if (sources.length === 0) return;
        setRunning(true);
        setRunError(undefined);
        setSavedKeys({});
        setUnits([]);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            await flushDraft(toolId);
            const run = await runMarketMaterial({
                gateway: getToolGateway(),
                config,
                sources,
                provider,
                revision: draft?.revision ?? null,
                signal: controller.signal,
                onUnit: (unit) => setUnits((previous) => [...previous.filter((item) => item.unitId !== unit.unitId), unit]),
            });
            setUnits(run.units);
            setSnapshot(run.snapshot);
            const failed = run.units.filter((unit) => unit.status === "failed").length;
            if (failed > 0) setRunError(`${failed} 屏失败，可单屏重试。`);
        } catch (error) {
            setRunError(error instanceof MarketAdapterError || error instanceof Error ? error.message : "生成失败。");
        } finally {
            setRunning(false);
            abortRef.current = null;
        }
    }, [config, sources, provider, draft?.revision, flushDraft, toolId]);

    const onRetryUnit = useCallback(
        async (previous: MarketUnitResult) => {
            const unit = buildMarketUnits(config).find((item) => item.id === previous.unitId);
            if (!unit) return;
            setBusyUnit(previous.unitId);
            try {
                const next = await retryMarketUnit({
                    gateway: getToolGateway(),
                    config,
                    sources,
                    provider,
                    unit,
                    previous,
                    revision: draft?.revision ?? null,
                });
                setUnits((current) => current.map((item) => (item.unitId === next.unitId ? next : item)));
            } catch (error) {
                setRunError(error instanceof Error ? error.message : "重试失败。");
            } finally {
                setBusyUnit(null);
            }
        },
        [config, sources, provider, draft?.revision],
    );

    /**
     * 结果 → 真实资产库：与其它工具一致走 saveResultItemToAssets（落 image-storage + 资产库索引），
     * 回执直接回显资产 id，便于与原站「存入作品库」1:1 对账。
     */
    const onSaveItem = useCallback(
        async (unit: MarketUnitResult, item: ToolTaskResultItem) => {
            const key = `${unit.unitId}:${item.id}`;
            setBusyUnit(unit.unitId);
            try {
                const saved = await saveResultItemToAssets(item, 0, {
                    toolId,
                    title: `${unit.label} · ${unit.width > 0 ? `${unit.width}×${unit.height}` : config.aspectRatio}`,
                    source: "product-market-material",
                });
                setSavedKeys((current) => ({ ...current, [key]: saved.assetId }));
            } catch (error) {
                setRunError(error instanceof Error ? error.message : "存入资产库失败。");
            } finally {
                setBusyUnit(null);
            }
        },
        [config.aspectRatio, toolId],
    );

    /** 结果 → 真实画布：复用通用发送依赖（项目/节点/上传），失败如实报错，不静默。 */
    const onSendItemToCanvas = useCallback(
        async (unit: MarketUnitResult, item: ToolTaskResultItem) => {
            const key = `${unit.unitId}:${item.id}`;
            setBusyUnit(unit.unitId);
            try {
                const created = await sendResultItemToCanvas(item, {
                    toolId,
                    projectTitle: "商品营销素材结果",
                });
                setCanvasKeys((current) => ({ ...current, [key]: created.nodeId }));
            } catch (error) {
                setRunError(error instanceof Error ? error.message : "发送画布失败。");
            } finally {
                setBusyUnit(null);
            }
        },
        [toolId],
    );

    const aplusRatios = aplusRatiosForPlatform(config.platform);
    const aplusEnabled = platformSupportsAplus(config.platform);
    const regionDefault = findRegion(config.salesRegion)?.defaultLanguage;

    return (
        <div className={`flex flex-col gap-3 ${className ?? ""}`}>
            {/* ① 商品多图与商品信息 */}
            <Section title="商品多图与信息" hint={`1–${MARKET_UPLOAD_LIMITS.maxFiles} 张 · 首张为主图`}>
                <ToolAssetInput
                    toolId={toolId}
                    constraints={{
                        mimeTypes: [...MARKET_UPLOAD_LIMITS.mimeTypes],
                        maxBytes: MARKET_UPLOAD_LIMITS.maxBytes,
                        minWidth: MARKET_UPLOAD_LIMITS.minSide,
                        minHeight: MARKET_UPLOAD_LIMITS.minSide,
                        maxWidth: MARKET_UPLOAD_LIMITS.maxSide,
                        maxHeight: MARKET_UPLOAD_LIMITS.maxSide,
                    }}
                    maxCount={MARKET_UPLOAD_LIMITS.maxFiles}
                    disabled={running}
                    title="上传商品多图"
                    onChange={onSourcesChange}
                />
                {sources.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                        {sources.map((source, index) => (
                            <label key={source.assetId} className="flex items-center gap-1 text-[11px] text-stone-600 dark:text-stone-300">
                                <input
                                    type="radio"
                                    name="market-cover"
                                    checked={config.coverList[0] === source.assetId}
                                    onChange={() => update({ coverList: [source.assetId] })}
                                />
                                {index === 0 ? "主图" : `图 ${index + 1}`}
                            </label>
                        ))}
                    </div>
                ) : null}
                {sourceIssue ? <p className="mt-1 text-[11px] text-amber-600">{sourceIssue.message}</p> : null}
                <textarea
                    className={`${inputClass} mt-2 h-24 w-full resize-none`}
                    maxLength={MARKET_PRODUCT_INFO_MAX_LENGTH}
                    placeholder="商品卖点、材质、尺寸、使用场景…（必填，避免凭空生成）"
                    value={config.productInfo}
                    onChange={(event) => update({ productInfo: event.target.value })}
                />
                <p className="mt-1 text-right text-[11px] text-stone-500">
                    {config.productInfo.length} / {MARKET_PRODUCT_INFO_MAX_LENGTH}
                </p>
            </Section>

            {/* ② 品牌 / 平台 / 语言 */}
            <Section title="品牌与投放" hint="平台切换会过滤合法 A+ 比例">
                <div className="grid grid-cols-2 gap-2">
                    <Field label="项目名称">
                        <input className={`${inputClass} w-40`} value={config.projectName} placeholder="用于资产命名" onChange={(event) => update({ projectName: event.target.value })} />
                    </Field>
                    <Field label="品牌名称">
                        <input className={`${inputClass} w-40`} value={config.brandName} onChange={(event) => update({ brandName: event.target.value })} />
                    </Field>
                    <Field label="品牌主色">
                        <input className={`${inputClass} w-24`} value={config.brandDna.primaryColor} placeholder="#1F2937" onChange={(event) => update({ brandDna: { ...config.brandDna, primaryColor: event.target.value.trim() } })} />
                    </Field>
                    <Field label="字体风格">
                        <select
                            className={inputClass}
                            value={config.brandDna.fontStyle}
                            onChange={(event) => update({ brandDna: { ...config.brandDna, fontStyle: event.target.value as MarketConfig["brandDna"]["fontStyle"] } })}
                        >
                            <option value="">跟随品牌</option>
                            {MARKET_FONT_STYLES.map((style) => (
                                <option key={style.id} value={style.id}>
                                    {style.label}
                                </option>
                            ))}
                        </select>
                    </Field>
                </div>
                <input
                    className={`${inputClass} mt-2 w-full`}
                    placeholder="品牌风格（可选，如：极简、科技感、暖色调家庭场景）"
                    value={config.brandDna.tone}
                    onChange={(event) => update({ brandDna: { ...config.brandDna, tone: event.target.value } })}
                />
                <div className="mt-2 flex flex-wrap gap-1">
                    {MARKET_PLATFORMS.map((platform) => (
                        <button
                            key={platform.id}
                            type="button"
                            onClick={() => update({ platform: platform.id })}
                            className={`rounded border px-2 py-0.5 text-[11px] ${
                                config.platform === platform.id
                                    ? "border-stone-900 bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                                    : "border-stone-200 text-stone-700 dark:border-stone-700 dark:text-stone-200"
                            }`}
                        >
                            {platform.label}
                        </button>
                    ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                    <Field label="销售地区">
                        <select
                            className={inputClass}
                            value={config.salesRegion}
                            onChange={(event) => {
                                const region = findRegion(event.target.value);
                                update({ salesRegion: event.target.value as MarketConfig["salesRegion"], ...(region ? { language: region.defaultLanguage } : {}) });
                            }}
                        >
                            {MARKET_SALES_REGIONS.map((region) => (
                                <option key={region.id} value={region.id}>
                                    {region.label}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="输出语言">
                        <select className={inputClass} value={config.language} onChange={(event) => update({ language: event.target.value as MarketConfig["language"] })}>
                            {MARKET_LANGUAGES.map((language) => (
                                <option key={language.id} value={language.id}>
                                    {language.label}
                                </option>
                            ))}
                        </select>
                    </Field>
                    {regionDefault && regionDefault !== config.language ? (
                        <span className="text-[11px] text-stone-500">该地区常用语言：{MARKET_LANGUAGES.find((entry) => entry.id === regionDefault)?.label}</span>
                    ) : null}
                </div>
            </Section>

            {/* ③ A+ 模板与营销画幅 */}
            <Section title="A+ 与营销画幅" hint={aplusEnabled ? "A+ 模板可多选，按模块分组输出" : "该平台无 A+ 模块"}>
                <div className="flex flex-wrap gap-1">
                    {MARKET_APLUS_TEMPLATES.map((template) => {
                        const disabled = !aplusEnabled || running;
                        const active = config.aplusTemplateIds.includes(template.id);
                        return (
                            <button
                                key={template.id}
                                type="button"
                                disabled={disabled}
                                onClick={() =>
                                    update({
                                        aplusTemplateIds: active
                                            ? config.aplusTemplateIds.filter((id) => id !== template.id)
                                            : [...config.aplusTemplateIds, template.id],
                                    })
                                }
                                className={`rounded border px-2 py-0.5 text-[11px] disabled:opacity-40 ${
                                    active ? "border-stone-900 bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : "border-stone-200 text-stone-700 dark:border-stone-700 dark:text-stone-200"
                                }`}
                            >
                                {template.label}
                            </button>
                        );
                    })}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                    {aplusRatios.map((ratio) => (
                        <button
                            key={ratio.id}
                            type="button"
                            disabled={!aplusEnabled || running}
                            onClick={() =>
                                update({
                                    aplusAspectRatio: ratio.id,
                                    ...(ratio.id === "custom" ? {} : { customWidth: ratio.width, customHeight: ratio.height }),
                                })
                            }
                            className={`rounded border px-2 py-0.5 text-[11px] disabled:opacity-40 ${
                                config.aplusAspectRatio === ratio.id
                                    ? "border-stone-900 bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                                    : "border-stone-200 text-stone-700 dark:border-stone-700 dark:text-stone-200"
                            }`}
                        >
                            {ratio.label}
                        </button>
                    ))}
                    {!aplusEnabled ? <span className="text-[11px] text-stone-500">切换回亚马逊后可选择 A+ 比例。</span> : null}
                </div>
                {aplusEnabled && config.aplusAspectRatio === "custom" ? (
                    <div className="mt-2 flex items-center gap-2">
                        <input
                            type="number"
                            className={`${inputClass} w-24`}
                            value={config.customWidth}
                            onChange={(event) => update({ customWidth: Number(event.target.value) || 0 })}
                            placeholder="宽 px"
                        />
                        <span className="text-xs text-stone-500">×</span>
                        <input
                            type="number"
                            className={`${inputClass} w-24`}
                            value={config.customHeight}
                            onChange={(event) => update({ customHeight: Number(event.target.value) || 0 })}
                            placeholder="高 px"
                        />
                    </div>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Field label="每模块张数">
                        <input
                            type="number"
                            min={1}
                            max={MARKET_MAX_MODULE_COUNT}
                            className={`${inputClass} w-16`}
                            value={config.aplusCount}
                            onChange={(event) => update({ aplusCount: Number(event.target.value) || 1 })}
                        />
                    </Field>
                    <Field label="模型">
                        <select className={inputClass} value={config.provider} onChange={(event) => update({ provider: event.target.value })}>
                            {MARKET_PROVIDERS.map((entry) => (
                                <option key={entry.code} value={entry.code}>
                                    {entry.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="分辨率">
                        <select className={inputClass} value={config.resolution} onChange={(event) => update({ resolution: event.target.value as MarketConfig["resolution"] })}>
                            {availableResolutions(config.provider).map((resolution) => (
                                <option key={resolution} value={resolution}>
                                    {resolution}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="品质">
                        <select className={inputClass} value={config.quality} onChange={(event) => update({ quality: event.target.value as MarketConfig["quality"] })}>
                            {availableQualities(config.provider).map((quality) => (
                                <option key={quality.id} value={quality.id}>
                                    {quality.label}
                                </option>
                            ))}
                        </select>
                    </Field>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                    {availableMarketingRatios(config.provider).map((ratio) => (
                        <button
                            key={ratio}
                            type="button"
                            onClick={() => update({ aspectRatio: ratio, isCustomAspectRatio: false })}
                            className={`rounded border px-2 py-0.5 text-[11px] ${
                                config.aspectRatio === ratio && !config.isCustomAspectRatio
                                    ? "border-stone-900 bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                                    : "border-stone-200 text-stone-700 dark:border-stone-700 dark:text-stone-200"
                            }`}
                        >
                            {ratio}
                        </button>
                    ))}
                    <label className="flex items-center gap-1 text-[11px] text-stone-600 dark:text-stone-300">
                        <input type="checkbox" checked={config.isCustomAspectRatio} onChange={(event) => update({ isCustomAspectRatio: event.target.checked })} />
                        自定义画幅
                    </label>
                </div>
            </Section>

            {/* 生成条 */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-white/70 p-3 dark:border-stone-800 dark:bg-stone-900/40">
                <span className="text-xs text-stone-600 dark:text-stone-300">
                    预计生成 <strong className="text-stone-900 dark:text-stone-100">{expected}</strong> 屏
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
                        <p key={`${issue.code}-${issue.field}`}>{issue.message}</p>
                    ))}
                </div>
            ) : null}

            {stale && units.length ? <p className="text-[11px] text-amber-600">配置已变更，下方结果来自旧版本；重新生成可更新。</p> : null}

            {/* ④ 结果：按营销模块分组 */}
            {units.length ? (
                <div className="flex flex-col gap-3">
                    <p className="text-[11px] text-stone-500">
                        共 {summary.total} 屏 · 成功 {summary.succeeded} · 失败 {summary.failed} · 待定 {summary.pending}
                    </p>
                    {groupMarketUnits(units).map((group) => (
                        <div key={group.moduleId} className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                            <header className="mb-2 flex items-baseline gap-2">
                                <h4 className="text-sm font-medium text-stone-800 dark:text-stone-100">{group.label}</h4>
                                <span className="text-[11px] text-stone-500">
                                    {group.succeeded}/{group.total} 成功
                                    {group.failed ? ` · ${group.failed} 失败` : ""}
                                    {group.pending ? ` · ${group.pending} 待定` : ""}
                                </span>
                            </header>
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                                {group.units.map((unit) => (
                                    <article key={unit.unitId} className="flex flex-col gap-1">
                                        <div className="text-[11px] text-stone-500">
                                            {unit.label} · {unit.width > 0 ? `${unit.width}×${unit.height}` : config.aspectRatio}
                                        </div>
                                        {unit.items.length ? (
                                            <div className="flex flex-col gap-1">
                                                {unit.items.map((item) => {
                                                    const key = `${unit.unitId}:${item.id}`;
                                                    return (
                                                        <div key={item.id} className="flex flex-col gap-1">
                                                            {item.dataUrl || item.url ? (
                                                                <img src={item.dataUrl ?? item.url} alt={unit.label} className="w-full rounded border border-stone-200 object-contain dark:border-stone-700" />
                                                            ) : (
                                                                <div className="rounded border border-dashed border-stone-300 p-4 text-center text-[11px] text-stone-500">结果已被持久化策略剥离</div>
                                                            )}
                                                            <div className="flex flex-wrap gap-1">
                                                                <button
                                                                    type="button"
                                                                    disabled={busyUnit === unit.unitId}
                                                                    onClick={() => void onSaveItem(unit, item)}
                                                                    data-testid={`market-save-${key}`}
                                                                    className="rounded border border-stone-300 px-2 py-0.5 text-[11px] text-stone-700 disabled:opacity-40 dark:border-stone-700 dark:text-stone-200"
                                                                >
                                                                    {savedKeys[key] ? `已存资产库 ${savedKeys[key].slice(0, 8)}` : "存入资产库"}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={busyUnit === unit.unitId}
                                                                    onClick={() => void onSendItemToCanvas(unit, item)}
                                                                    data-testid={`market-canvas-${key}`}
                                                                    className="rounded border border-stone-300 px-2 py-0.5 text-[11px] text-stone-700 disabled:opacity-40 dark:border-stone-700 dark:text-stone-200"
                                                                >
                                                                    {canvasKeys[key] ? "已发送画布" : "发送画布"}
                                                                </button>
                                                            </div>
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
                                                className="mt-1 rounded border border-stone-300 px-2 py-0.5 text-[11px] text-stone-700 disabled:opacity-40 dark:border-stone-700 dark:text-stone-200"
                                            >
                                                {busyUnit === unit.unitId ? "重试中…" : "重试这一屏"}
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

function marketSourceFromRecord(record: ToolAssetRecord): MarketSourceAsset {
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

export default ProductImageSuiteWorkspace;
