import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolCases } from "@/components/tools/tool-cases";
import { ECOMMERCE_SUITE_RAIL, OrigRail } from "@/components/tools/workspaces/orig-rail";
import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import type { ToolCase } from "@/components/tools/tool-cases";
import { uploadCaseFiles } from "@/features/tools/case-apply";
import { PRODUCT_SUITE_CASES } from "@/features/tools/suite6-cases-data";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { downloadResultItem, saveResultItemToAssets, sendResultItemToCanvas } from "@/components/tools/tool-result-actions";
import { loadToolAssetRecords, type ToolAssetConstraints, type ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
import { useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { getPersistedToolGateway, useToolTaskStore } from "@/stores/use-tool-task-store";

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
    summarizeSuiteRun,
    suiteResultsStale,
    suiteUnitResultFromTask,
    validateSuiteSourceLimits,
    type SuiteSourceAsset,
    type SuiteUnitResult,
} from "@/features/tools/adapters/product-image-suite";
import {
    MARKET_APLUS_TEMPLATES,
    MARKET_FONT_STYLES,
    MARKET_LANGUAGES,
    MARKET_LAYOUT_MODES,
    MARKET_MARKETING_MODULES,
    MARKET_MAX_MODULE_COUNT,
    MARKET_QUALITIES,
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
    createMarketSnapshot,
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
    marketUnitResultFromTask,
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

function Section({
    title,
    hint,
    children,
    output,
}: {
    title: string;
    hint?: string;
    children: React.ReactNode;
    /**
     * 原站「生成内容（可同时选择）」的一行：整行是一个 aria-expanded 折叠按钮
     * （左侧标签 + 右侧摘要），行尾另有一个只带 aria-label 的配置按钮。
     * 传入 output 后该区块默认折叠，展开的是同一份生成设置内容。
     */
    output?: { label: string; summary: string; configureLabel: string; ariaLabel?: string };
}) {
    const [open, setOpen] = useState(false);
    if (output) {
        return (
            <section className="rounded-md border border-stone-200 bg-white/60 px-2 py-1.5 dark:border-stone-800 dark:bg-stone-900/40">
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        aria-expanded={open}
                        aria-label={output.ariaLabel}
                        onClick={() => setOpen((value) => !value)}
                        className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left"
                    >
                        <span className="text-[12px] font-medium leading-4 text-stone-800 dark:text-stone-100">{output.label}</span>
                        <span className="truncate text-[11px] text-stone-500 dark:text-stone-400">{output.summary}</span>
                    </button>
                    {output.ariaLabel ? null : (
                    <button
                        type="button"
                        aria-label={output.configureLabel}
                        title={output.configureLabel}
                        onClick={() => setOpen(true)}
                        className="rounded-[4px] border border-stone-200 px-1 py-0.5 text-stone-500 hover:border-stone-300 dark:border-stone-700"
                    >
                        <svg viewBox="0 0 16 16" aria-hidden className="size-3" fill="none" stroke="currentColor" strokeWidth="1.3">
                            <path d="M2 4h8M12.5 4H14M2 8h3M7.5 8H14M2 12h6M10.5 12H14" />
                            <circle cx="11" cy="4" r="1.4" />
                            <circle cx="6" cy="8" r="1.4" />
                            <circle cx="9" cy="12" r="1.4" />
                        </svg>
                    </button>
                    )}
                </div>
                {open ? <div className="mt-1.5 space-y-1.5">{children}</div> : null}
            </section>
        );
    }
    return (
        <section className="rounded-md border border-stone-200 bg-white/60 px-2 py-1.5 dark:border-stone-800 dark:bg-stone-900/40">
            <header className="mb-1 flex items-baseline gap-1.5">
                <h3 className="text-[12px] font-medium leading-4 text-stone-800 dark:text-stone-100">{title}</h3>
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

/* ---------------------- 历史回填（UI 刷新后不丢结果） ---------------------- */

/**
 * prompt 归一化：任务落盘时换行会被压成空格（长度不变），
 * 所以对齐只能用空白归一化后的文本比较，不能直接字符串相等。
 */
const normalizePrompt = (value: string) => value.replace(/\s+/g, " ").trim();

/** 原站 A+ 模块名后的尺寸标注（“高级A+（1464×600）”）。 */
const APLUS_SIZE_HINTS: Record<string, string> = {
    "aplus-advanced": "1464×600",
    "aplus-mobile": "600×450",
    "aplus-standard": "970×600",
};

/** 向导里的一键句式（本地文本，点选后追加到商品信息）。 */
const SUITE_GUIDE_PROMPTS: ReadonlyArray<{ label: string; text: string }> = [
    { label: "核心卖点", text: "核心卖点：" },
    { label: "材质工艺", text: "材质工艺：" },
    { label: "使用场景", text: "使用场景：" },
    { label: "目标人群", text: "目标人群：" },
    { label: "尺码规格", text: "尺码规格：" },
];

/**
 * 已落盘任务 → 结果区单元。
 * 每个单元是一次真实请求，且单元 prompt 由 (模块, index/count, 尺寸/品质/商品信息) 唯一决定，
 * 所以用 task.prompt 与 buildSuiteUnits(config).prompt 对齐即可还原（不依赖任务里不存在的 fields）。
 * 同一 prompt 有多条时取最新一条；配置改过（prompt 变化）则不还原，避免张冠李戴。
 */
export function restoreSuiteUnitsFromTasks(
    config: SuiteConfig,
    tasks: Record<string, ToolTask>,
    toolId: string,
): SuiteUnitResult[] {
    const planned = buildSuiteUnits(config);
    if (planned.length === 0) return [];
    const latest = new Map<string, ToolTask>();
    for (const task of Object.values(tasks)) {
        if (task.toolId !== toolId) continue;
        const key = normalizePrompt(task.prompt);
        const existing = latest.get(key);
        if (!existing || existing.createdAt < task.createdAt) latest.set(key, task);
    }
    const restored: SuiteUnitResult[] = [];
    for (const unit of planned) {
        const task = latest.get(normalizePrompt(unit.prompt));
        if (!task) continue;
        restored.push(suiteUnitResultFromTask(unit, task));
    }
    return restored;
}

/**
 * 营销素材的任务回填：与套图同构——单元 prompt 由 (模块, index/count, 尺寸/品质/商品信息) 唯一决定，
 * 刷新后按 task.prompt 与 buildMarketUnits(config).prompt 对齐还原（同 prompt 取最新一条）。
 */
export function restoreMarketUnitsFromTasks(
    config: MarketConfig,
    tasks: Record<string, ToolTask>,
    toolId: string,
): MarketUnitResult[] {
    const planned = buildMarketUnits(config);
    if (planned.length === 0) return [];
    const latest = new Map<string, ToolTask>();
    for (const task of Object.values(tasks)) {
        if (task.toolId !== toolId) continue;
        const key = normalizePrompt(task.prompt);
        const existing = latest.get(key);
        if (!existing || existing.createdAt < task.createdAt) latest.set(key, task);
    }
    const restored: MarketUnitResult[] = [];
    for (const unit of planned) {
        const task = latest.get(normalizePrompt(unit.prompt));
        if (!task) continue;
        restored.push(marketUnitResultFromTask(unit, task));
    }
    return restored;
}

/* ------------------------------ 主组件 ------------------------------ */
export function ProductImageSuiteWorkspace({ className }: { className?: string }) {
    const toolId = PRODUCT_IMAGE_SUITE_TOOL_ID;
    const hydrate = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const flushDraft = useToolDraftStore((state) => state.flush);
    const draft = useToolDraftStore((state) => state.drafts[toolId]);
    const imageModel = useConfigStore((state) => state.config.imageModel);

    /* 原站默认选中「高级A+（1464×600）」：生成内容摘要行需如实呈现原站文案。 */
    const [config, setConfig] = useState<SuiteConfig>(() => createDefaultSuiteConfig({ aplusModuleId: "aplus-advanced" }));
    const [source, setSource] = useState<SuiteSourceAsset | undefined>();
    const [restoringSource, setRestoringSource] = useState(false);
    const [units, setUnits] = useState<SuiteUnitResult[]>([]);
    const [snapshot, setSnapshot] = useState<SuiteConfigSnapshot | undefined>();
    const [running, setRunning] = useState(false);
    const [busyUnit, setBusyUnit] = useState<string | null>(null);
    const [runError, setRunError] = useState<string | undefined>();
    const [savedKeys, setSavedKeys] = useState<Record<string, string>>({});
    /** 发送画布回执：nodeId，供结果面板直接回显真实动作结果。 */
    const [canvasKeys, setCanvasKeys] = useState<Record<string, string>>({});
    const [seeded, setSeeded] = useState(false);
    const [rightTab, setRightTab] = useState<"result" | "cases" | "history">("result");
    const [applyingCaseId, setApplyingCaseId] = useState<string | null>(null);
    const [guideOpen, setGuideOpen] = useState(false);
    /* 原站公告位：左列与结果区两张可关闭的提示卡（关闭按钮 aria 分别为「关闭」「关闭提示」）。 */
    const [promoClosed, setPromoClosed] = useState<{ left: boolean; result: boolean }>({ left: false, result: false });
    const [caseApplyNonce, setCaseApplyNonce] = useState(0);

    /* 「优秀案例」做同款：真实案例原图入库后回填到商品图上传播槽 */
    const applyCase = useCallback(async (item: ToolCase) => {
        setApplyingCaseId(item.id);
        try {
            const assets = await uploadCaseFiles(item);
            const record = assets.source as ToolAssetRecord | undefined;
            if (!record) throw new Error("该案例缺少可用的商品图");
            setSource({
                assetId: record.id,
                url: record.url,
                name: record.name,
                mimeType: record.mimeType,
                bytes: record.bytes,
                width: record.width,
                height: record.height,
            });
            patchDraft(toolId, { assetIds: [record.id] });
            setCaseApplyNonce((value) => value + 1);
            setRightTab("result");
        } finally {
            setApplyingCaseId(null);
        }
    }, []);
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

    /* 任务回填：任务已由 store-backed 网关落盘（含结果字节入库），
     * 刷新/重新进入时按当前配置的单元计划还原结果区，避免「成功结果刷新即消失」。 */
    const storeTasks = useToolTaskStore((state) => state.tasks);
    const tasksHydrated = useToolTaskStore((state) => state.hydrated);
    const hydrateTasks = useToolTaskStore((state) => state.hydrate);
    const restoredFromTasks = useRef(false);
    /** 用户点了「清空」后不再自动把历史结果拉回来（除非重新提交）。 */
    const clearedResults = useRef(false);
    useEffect(() => {
        if (!tasksHydrated) hydrateTasks();
    }, [tasksHydrated, hydrateTasks]);
    useEffect(() => {
        if (!seeded || !tasksHydrated || clearedResults.current) return;
        const restored = restoreSuiteUnitsFromTasks(config, storeTasks, toolId);
        if (restored.length === 0) return;
        // 不再一次落锁：刷新时还在跑的任务之后才到终态，也要能继续回填，
        // 否则「部分成功」会被永久定格成刷新那一刻的样子。
        restoredFromTasks.current = true;
        setUnits((previous) => {
            if (previous.length === 0) return restored;
            const next = [...previous];
            let changed = false;
            for (const unit of restored) {
                const index = next.findIndex((item) => item.unitId === unit.unitId);
                if (index < 0) {
                    next.push(unit);
                    changed = true;
                    continue;
                }
                const existing = next[index];
                // 用户在页面上重提过（taskId 不同）：不拿历史任务覆盖当前结果。
                if (existing.taskId && unit.taskId && existing.taskId !== unit.taskId) continue;
                if (existing.status === unit.status && existing.items.length === unit.items.length) continue;
                next[index] = unit;
                changed = true;
            }
            if (!changed) return previous;
            const order = new Map(buildSuiteUnits(config).map((unit, index) => [unit.id, index]));
            next.sort((a, b) => (order.get(a.unitId) ?? 0) - (order.get(b.unitId) ?? 0));
            return next;
        });
        setSnapshot((previous) => previous ?? createSuiteSnapshot(config, draft?.revision ?? 0));
    }, [seeded, tasksHydrated, storeTasks, config, toolId, draft?.revision]);

    /* 历史点选：把该任务还原成一张结果（同一单元取最新）。 */
    const onSelectHistoryTask = useCallback(
        (task: ToolTask) => {
            const target = normalizePrompt(task.prompt);
            const unit = buildSuiteUnits(config).find((item) => normalizePrompt(item.prompt) === target);
            if (!unit) return;
            const restored = suiteUnitResultFromTask(unit, task);
            setUnits((previous) => [...previous.filter((item) => item.unitId !== unit.id), restored]);
            setRightTab("result");
        },
        [config],
    );

    /* 草稿写入必须在事件里完成，不能放进 setState updater：
     * updater 在 React 渲染期可能被调用，渲染期写 zustand 会触发
     * 「Cannot update a component while rendering a different component」。 */
    const configRef = useRef<SuiteConfig>(config);
    useEffect(() => {
        configRef.current = config;
    }, [config]);

    const commitConfig = useCallback(
        (merged: SuiteConfig) => {
            configRef.current = merged;
            setConfig(merged);
            patchDraft(toolId, {
                values: { suiteConfig: merged },
                assetIds: merged.sourceAssetId ? [merged.sourceAssetId] : [],
            });
        },
        [patchDraft, toolId],
    );

    const update = useCallback(
        (next: Partial<SuiteConfig>) => {
            commitConfig({ ...configRef.current, ...next });
        },
        [commitConfig],
    );

    /* 向导：本地预置句式，点一下追加到商品信息（纯本地，不发网络请求）。 */
    const appendProductInfo = useCallback(
        (text: string) => {
            const previous = configRef.current;
            const mergedInfo = `${previous.productInfo}${previous.productInfo.trim() ? "\n" : ""}${text}`.slice(
                0,
                PRODUCT_IMAGE_SUITE_MAX_PRODUCT_INFO,
            );
            commitConfig({ ...previous, productInfo: mergedInfo });
        },
        [commitConfig],
    );

    /*
     * AI分析：按原站交互把商品信息拆成结构化字段（卖点 / 材质 / 场景 / 人群），
     * 这里用本地规则从已输入文本提取，不发起网络请求，也不伪造模型输出。
     */
    const onAnalyzeProductInfo = useCallback(() => {
        const raw = config.productInfo.trim();
        if (!raw) {
            appendProductInfo("请先输入商品卖点，再点 AI分析。");
            return;
        }
        const lines = raw
            .split(/[\n。；;]+/)
            .map((line) => line.trim())
            .filter(Boolean);
        const pick = (keywords: string[]) =>
            lines.filter((line) => keywords.some((keyword) => line.includes(keyword))).slice(0, 3);
        const sections: Array<[string, string[]]> = [
            ["卖点", pick(["卖点", "卖", "轻", "防水", "耐用", "舒适", "大容量"])],
            ["材质", pick(["材质", "面料", "棉", "涤", "牛皮", "硅胶", "金属", "塑料"])],
            ["场景", pick(["场景", "户外", "家居", "办公", "通勤", "旅行", "运动"])],
            ["人群", pick(["人群", "女", "男", "儿童", "学生", "商务", "宝妈"])],
        ];
        const block = sections
            .filter(([, hits]) => hits.length > 0)
            .map(([label, hits]) => `${label}：${hits.join("；")}`)
            .join("\n");
        appendProductInfo(block || "AI分析：未识别到可结构化字段，请补充卖点、材质、场景。");
    }, [appendProductInfo, config.productInfo]);

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
    const summary = summarizeSuiteRun(units);
    const stale = snapshot ? suiteResultsStale({ snapshot }, config) : false;

    const sourceIssue = source ? validateSuiteSourceLimits(source) : undefined;
    const blocked = running || issues.length > 0 || (sourceIssue ? !sourceIssue.ok : false);
    /* 原站费用行：A+图张数 + 主副图张数，合计 50 点/张 */
    const aplusUnits = config.aplusModuleId ? config.aplusCount : 0;
    const mainSubUnits = Math.max(0, expected - aplusUnits);

    /* 原站「生成内容（可同时选择）」两行摘要：模块名（尺寸）+ 张数 */
    const aplusModule = APLUS_MODULES.find((module) => module.id === config.aplusModuleId);
    const aplusSizeHint = APLUS_SIZE_HINTS[config.aplusModuleId] ?? "";
    const aplusOutput = {
        label: "A+图",
        summary: `${aplusModule ? aplusModule.label : "高级A+"}${aplusSizeHint ? `（${aplusSizeHint}）` : ""} ${aplusUnits}张`,
        configureLabel: "配置A+图",
    };
    const qualityLabel = SUITE_QUALITIES.find((quality) => quality.id === config.quality)?.label ?? "";
    const mainSubFirst = MAIN_SUB_MODULES.find((module) => config.mainSubModuleIds.includes(module.id));
    const mainSubFirstCount = mainSubFirst
        ? config.mainSubCounts[mainSubFirst.id] ?? mainSubFirst.defaultCount
        : 0;
    const mainSubOutput = {
        label: "主副图",
        summary: `${mainSubFirst ? mainSubFirst.label : "卖点图"} ${mainSubUnits || mainSubFirstCount}张`,
        configureLabel: "配置主副图",
    };

    /* 生成：真实逐单元提交，回调增量渲染 */
    const onGenerate = useCallback(async () => {
        if (!source) return;
        clearedResults.current = false;
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
                gateway: getPersistedToolGateway(),
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
            const pending = run.units.filter((unit) => unit.status === "pending").length;
            const notes = [
                failed > 0 ? `${failed} 张失败，可单张重试。` : "",
                pending > 0 ? `${pending} 张状态未确定：请到历史记录确认，先不要重复提交。` : "",
            ].filter(Boolean);
            if (notes.length > 0) setRunError(notes.join(" "));
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
                const next = await retrySuiteUnit({ gateway: getPersistedToolGateway(), config, source: source ?? { assetId: "" }, unit: unitDef, previous: result });
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
        async (item: ToolTaskResultItem, result: SuiteUnitResult, index: number) => {
            try {
                const saved = await saveResultItemToAssets(item, index, {
                    toolId,
                    title: `商品套图 结果 ${index + 1}`,
                });
                setSavedKeys((previous) => ({ ...previous, [`${result.unitId}:${item.id}`]: saved.assetId }));
            } catch (error) {
                setRunError(error instanceof Error ? error.message : "保存失败。");
            }
        },
        [toolId],
    );

    /** 结果 → 真实画布：与其它工具共用发送依赖，失败如实报错。 */
    const onSendToCanvas = useCallback(
        async (item: ToolTaskResultItem, result: SuiteUnitResult) => {
            try {
                const created = await sendResultItemToCanvas(item, {
                    toolId,
                    projectTitle: "商品套图结果",
                });
                setCanvasKeys((previous) => ({ ...previous, [`${result.unitId}:${item.id}`]: created.nodeId }));
            } catch (error) {
                setRunError(error instanceof Error ? error.message : "发送画布失败。");
            }
        },
        [toolId],
    );

    /** 结果 → 本地下载：与其它工具同一实现（storageKey 失效时先取回真实字节）。 */
    const onDownload = useCallback(
        async (item: ToolTaskResultItem, index: number) => {
            try {
                await downloadResultItem(item, index, { toolId });
            } catch (error) {
                setRunError(error instanceof Error ? error.message : "下载失败。");
            }
        },
        [toolId],
    );

    return (
        <div className={cn("flex h-full min-h-0 flex-col bg-background", className)} data-tool="product-image-suite" data-layout="linkfox-two-pane">
            <OrigRail
                items={ECOMMERCE_SUITE_RAIL}
                active="商品套图"
                driver
                testId="suite-family-rail"
                className="shrink-0 border-b border-border px-2"
            />
            <ToolWorkspaceColumns
                className="min-h-0 flex-1"
                config={(
                <div className="flex h-full min-h-0 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-1 pt-1">
                    <div className="grid auto-rows-max grid-cols-1 gap-1.5">
                {/* 原站公告位（左列顶部）：可关闭的提示卡，按钮文案与原站一致：立即体验 / 关闭 */}
                {promoClosed.left ? null : (
                    <div
                        data-testid="suite-promo-left"
                        className="relative rounded-md border border-[#E9E3FF] bg-[#F6F3FF] px-2 py-1.5 pr-8"
                    >
                        <p className="text-[11px] font-medium leading-4 text-[#3b3b4f]">全能模型 2 已升级为 2.1</p>
                        <p className="mt-0.5 text-[11px] leading-4 text-[#5a5a70]">文字排版更清晰，多轮编辑一致性更强，支持 1K / 2K / 4K 输出。</p>
                        <button
                            type="button"
                            onClick={() => setRightTab("cases")}
                            className="mt-1 h-6 rounded-full bg-[#6C4CF1] px-2.5 text-[11px] leading-none text-white"
                        >
                            立即体验
                        </button>
                        <button
                            type="button"
                            aria-label="关闭"
                            title="关闭"
                            onClick={() => setPromoClosed((previous) => ({ ...previous, left: true }))}
                            className="absolute right-1 top-1 rounded px-1 text-[11px] leading-[15px] text-[#8a8a9e] hover:text-[#5a5a70]"
                        >
                            关闭
                        </button>
                    </div>
                )}
                <Section title="多视角白底商品&实拍图">
                    <p className="mb-1.5 text-[11px] text-muted-foreground">上传商品图</p>
                    <ToolAssetInput
                        key={`case-${caseApplyNonce}`}
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
                                onClick={() => setGuideOpen((value) => !value)}
                                data-testid="suite-guide"
                                className="rounded-[4px] border border-[#E6E6EB] px-2 py-[3px] text-[11px] leading-none text-[#5a5a70] hover:border-[#d8d8e0]"
                            >
                                向导
                            </button>
                            <button
                                type="button"
                                onClick={onAnalyzeProductInfo}
                                data-testid="suite-ai-analyze"
                                className="rounded-[4px] border border-[#E6E6EB] px-2 py-[3px] text-[11px] leading-none text-[#5a5a70] hover:border-[#d8d8e0]"
                            >
                                AI分析
                            </button>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                            {config.productInfo.length} / {PRODUCT_IMAGE_SUITE_MAX_PRODUCT_INFO}
                        </span>
                    </div>
                    {guideOpen ? (
                        <div className="mb-2 flex flex-wrap gap-1.5 rounded-[6px] bg-[#faf9ff] p-2">
                            {SUITE_GUIDE_PROMPTS.map((prompt) => (
                                <button
                                    key={prompt.label}
                                    type="button"
                                    onClick={() => appendProductInfo(prompt.text)}
                                    className="rounded-[4px] border border-[#E6E6EB] bg-white px-2 py-[3px] text-[11px] leading-none text-[#5a5a70] hover:border-[#d8d8e0]"
                                >
                                    {prompt.label}
                                </button>
                            ))}
                        </div>
                    ) : null}
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
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span>智能合规检查</span>
                            <span>未选择敏感词库</span>
                            <span>·</span>
                            <span>未选择替换词库</span>
                        </div>
                    </div>
                </Section>

                <Section
                    title="模型选择"
                    output={{
                        /* 原站整行是一个按钮：LF智能模型 G-2.5 Sunburst 2K · 中品质 · 50点/张，aria-label=打开模型设置 */
                        label: "LF智能模型 G-2.5 Sunburst",
                        summary: `${config.resolution} · ${qualityLabel}`,
                        configureLabel: "打开模型设置",
                        ariaLabel: "打开模型设置",
                    }}
                >
                    <div className="flex flex-col gap-2.5">
                        <div className="flex items-center justify-between text-[10px] leading-none text-muted-foreground">
                            <span>实际调用模型</span>
                            <span>{imageModel?.split("::").pop()?.trim() || "未配置"}</span>
                        </div>
                        <div>
                            <p className="mb-1.5 text-[11px] text-muted-foreground">分辨率选择</p>
                            <div className="flex gap-1.5">
                                {SUITE_RESOLUTIONS.map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        data-testid={`suite-resolution-${value}`}
                                        onClick={() => update({ resolution: value })}
                                        className={`h-7 min-w-[46px] rounded-[4px] border text-[12px] leading-none ${
                                            config.resolution === value
                                                ? "border-primary bg-primary/10 text-primary"
                                                : "border-[#E6E6EB] text-[#5a5a70] hover:border-[#d8d8e0]"
                                        }`}
                                    >
                                        {value}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <p className="mb-1.5 text-[11px] text-muted-foreground">模型品质</p>
                            <div className="flex flex-wrap gap-1.5">
                                {SUITE_QUALITIES.map((quality) => (
                                    <button
                                        key={quality.id}
                                        type="button"
                                        data-testid={`suite-quality-${quality.id}`}
                                        aria-pressed={config.quality === quality.id}
                                        onClick={() => update({ quality: quality.id })}
                                        className={`h-7 rounded-[4px] border px-2 text-[12px] leading-none ${
                                            config.quality === quality.id
                                                ? "border-primary bg-primary/10 text-primary"
                                                : "border-[#E6E6EB] text-[#5a5a70] hover:border-[#d8d8e0]"
                                        }`}
                                    >
                                        {quality.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </Section>

            <p className="mt-1 flex items-baseline gap-1.5 text-[11px] leading-4 text-stone-500 dark:text-stone-400">
                <span>生成内容</span>
                <span className="text-stone-400 dark:text-stone-500">可同时选择</span>
            </p>

            <Section title="主副图设置" output={mainSubOutput}>
                <p className="mb-1 text-[11px] text-muted-foreground">生成类型（多选）</p>
                <div className="flex flex-wrap gap-1">
                    {MAIN_SUB_MODULES.map((module) => {
                        const checked = config.mainSubModuleIds.includes(module.id);
                        return (
                            <div
                                key={module.id}
                                onClick={() =>
                                    update({
                                        mainSubModuleIds: checked
                                            ? config.mainSubModuleIds.filter((id) => id !== module.id)
                                            : [...config.mainSubModuleIds, module.id],
                                    })
                                }
                                className={`flex cursor-pointer items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[11px] leading-none ${
                                    checked
                                        ? "border-stone-800 bg-stone-800 text-white dark:border-stone-200 dark:bg-stone-200 dark:text-stone-900"
                                        : "border-stone-200 text-stone-700 dark:border-stone-700 dark:text-stone-200"
                                }`}
                            >
                                <span>{module.label}</span>
                                <button
                                    type="button"
                                    title="每模块张数"
                                    aria-label={`${module.label}每模块张数`}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        const current = config.mainSubCounts[module.id] ?? module.defaultCount;
                                        update({
                                            mainSubCounts: { ...config.mainSubCounts, [module.id]: current >= 10 ? 1 : current + 1 },
                                        });
                                    }}
                                    className="text-[10px] opacity-70 hover:opacity-100"
                                >
                                    {config.mainSubCounts[module.id] ?? module.defaultCount}
                                </button>
                            </div>
                        );
                    })}
                </div>
                <p className="mt-1.5 mb-1 text-[11px] text-muted-foreground">选择排版</p>
                <div className="flex flex-wrap gap-1">
                    {SUITE_LAYOUT_MODES.map((mode) => (
                        <button
                            key={mode.id}
                            type="button"
                            data-testid={`suite-main-sub-layout-${mode.id}`}
                            onClick={() => update({ mainSubLayoutMode: mode.id })}
                            className={`h-6 rounded-[4px] border px-1.5 text-[11px] leading-none ${
                                config.mainSubLayoutMode === mode.id
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-[#E6E6EB] text-[#5a5a70] hover:border-[#d8d8e0]"
                            }`}
                        >
                            {mode.label}
                        </button>
                    ))}
                </div>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                    💡未选择排版时，将根据官方排版随机生成
                </p>

                <Section title="生成比例">
                <div className="flex flex-wrap gap-1">
                    {SUITE_RATIOS.map((ratio) => (
                        <button
                            key={ratio.id}
                            type="button"
                            data-testid={`suite-ratio-${ratio.id}`}
                            onClick={() => update({ ratio: ratio.id })}
                            className={`h-6 min-w-[38px] rounded-[4px] border text-[11px] leading-none ${
                                config.ratio === ratio.id
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-[#E6E6EB] text-[#5a5a70] hover:border-[#d8d8e0]"
                            }`}
                        >
                            {ratio.label}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => update({ ratio: SUITE_RATIOS[0].id })}
                        className="h-6 rounded-[4px] border border-[#E6E6EB] px-1.5 text-[11px] leading-none text-[#5a5a70] hover:border-[#d8d8e0]"
                    >
                        更多
                    </button>
                </div>
                </Section>
            </Section>

            <Section title="A+图设置" output={aplusOutput}>
                <p className="mb-1 text-[11px] text-muted-foreground">生成类型（单选）</p>
                <div className="flex flex-wrap gap-1">
                    {APLUS_MODULES.map((module) => (
                        <div
                            key={module.id}
                            onClick={() => update({ aplusModuleId: config.aplusModuleId === module.id ? "" : module.id })}
                            className={`flex cursor-pointer items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[11px] leading-none ${
                                config.aplusModuleId === module.id
                                    ? "border-stone-800 bg-stone-800 text-white dark:border-stone-200 dark:bg-stone-200 dark:text-stone-900"
                                    : "border-stone-200 text-stone-700 dark:border-stone-700 dark:text-stone-200"
                            }`}
                        >
                            <span>{module.label}</span>
                            <button
                                type="button"
                                title="每模块张数"
                                aria-label={`${module.label}每模块张数`}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    update({ aplusCount: config.aplusCount >= 10 ? 1 : config.aplusCount + 1 });
                                }}
                                className="text-[10px] opacity-70 hover:opacity-100"
                            >
                                {config.aplusCount}
                            </button>
                        </div>
                    ))}
                </div>
                <p className="mt-1.5 mb-1 text-[11px] text-muted-foreground">选择排版</p>
                <div className="flex flex-wrap gap-1">
                    {SUITE_LAYOUT_MODES.map((mode) => (
                        <button
                            key={mode.id}
                            type="button"
                            data-testid={`suite-aplus-layout-${mode.id}`}
                            onClick={() => update({ aplusLayoutMode: mode.id })}
                            className={`h-6 rounded-[4px] border px-1.5 text-[11px] leading-none ${
                                config.aplusLayoutMode === mode.id
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-[#E6E6EB] text-[#5a5a70] hover:border-[#d8d8e0]"
                            }`}
                        >
                            {mode.label}
                        </button>
                    ))}
                </div>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                    💡未选择排版时，将根据官方排版随机生成
                </p>
            </Section>

                </div>
                <div className="shrink-0 border-t border-[#EDEDF0] px-6 py-3" data-testid="suite-generate-summary">
                        <button
                            type="button"
                            disabled={blocked}
                            title={issues[0]?.message}
                            onClick={() => void onGenerate()}
                            data-testid="suite-generate"
                            className="h-8 flex-1 rounded-md bg-primary text-[12px] font-medium leading-none text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {running ? "生成中…" : "开始生成"}
                        </button>
                        {units.length ? (
                            <button
                                type="button"
                                onClick={() => {
                                    clearedResults.current = true;
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
                )}
            >

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
                                    ? "border-b-2 border-primary font-medium text-foreground"
                                    : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                {PRODUCT_SUITE_CASES.length > 0 ? (
                    <div role="tabpanel" hidden={rightTab !== "cases"} data-testid="suite-panel-cases" className="flex h-full flex-col">
                        <h2 className="mb-2 text-sm font-medium">优秀案例</h2>
                        <ToolCases
                            cases={PRODUCT_SUITE_CASES}
                            onApply={applyCase}
                            applyingId={applyingCaseId}
                        />
                    </div>
                ) : null}
                <div role="tabpanel" hidden={rightTab !== "history"} data-testid="suite-panel-history">
                    <ToolTaskHistory toolId={toolId} limit={8} onSelectTask={onSelectHistoryTask} emptyHint="还没有套图任务记录" />
                </div>
                <div role="tabpanel" hidden={rightTab !== "result"} data-testid="suite-panel-result" className="flex flex-col gap-3">
                    {/* 原站公告位（结果区）：可关闭的提示卡，按钮文案与原站一致：立即体验 / 关闭提示 */}
                    {promoClosed.result ? null : (
                        <div
                            data-testid="suite-promo-result"
                            className="relative flex items-center justify-between gap-2 rounded-md border border-[#E9E3FF] bg-[#F6F3FF] px-2 py-1.5 pr-8"
                        >
                            <p className="text-[11px] font-medium leading-4 text-[#3b3b4f]">白底图精修与裂变已上线！</p>
                            <p className="mt-0.5 text-[11px] leading-4 text-[#5a5a70]">白底图精修算法升级！精修效果更出彩。白底图裂变支持单品、多件套、自由裂变多种主图裂变方式，最多支持一次裂变 20 张！</p>
                            <button
                                type="button"
                                onClick={() => setRightTab("cases")}
                                className="h-6 shrink-0 rounded-full bg-[#6C4CF1] px-2.5 text-[11px] leading-none text-white"
                            >
                                立即体验
                            </button>
                            <button
                                type="button"
                                aria-label="关闭提示"
                                title="关闭提示"
                                onClick={() => setPromoClosed((previous) => ({ ...previous, result: true }))}
                                className="absolute right-1 top-1 rounded px-1 text-[11px] leading-[15px] text-[#8a8a9e] hover:text-[#5a5a70]"
                            >
                                关闭提示
                            </button>
                        </div>
                    )}
                    <p className="text-[11px] text-[#6b6b80]">生成结果</p>
                    {/* 原站「一键做同款」：用真实案例回填商品图与参数，走与案例画廊相同的 applyCase */}
                    <div>
                        <button
                            type="button"
                            data-testid="suite-try-same"
                            disabled={applyingCaseId !== null || PRODUCT_SUITE_CASES.length === 0}
                            onClick={() => {
                                const first = PRODUCT_SUITE_CASES[0];
                                if (first) void applyCase(first);
                            }}
                            className="h-10 w-[110px] rounded-md border border-[#E6E6EB] bg-white text-xs text-[#3b3b4f] hover:border-[#d8d8e0] disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
                        >
                            一键做同款
                        </button>
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
                                                {unit.items.map((item, itemIndex) => {
                                                    const key = `${unit.unitId}:${item.id}`;
                                                    const src = item.dataUrl ?? item.url;
                                                    return (
                                                        <div key={item.id} className="flex items-center gap-2">
                                                            {src ? (
                                                                <img src={src} alt={unit.label} className="size-16 rounded object-cover" />
                                                            ) : (
                                                                <div className="flex size-16 items-center justify-center rounded border border-dashed border-stone-300 text-center text-[10px] text-stone-400">
                                                                    已入库
                                                                </div>
                                                            )}
                                                            <div className="flex flex-wrap gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void onSave(item, unit, itemIndex)}
                                                                    className="rounded border border-stone-200 px-2 py-0.5 text-[11px] text-stone-700 dark:border-stone-700 dark:text-stone-200"
                                                                >
                                                                    {savedKeys[key] ? "已存作品库" : "保存"}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void onSendToCanvas(item, unit)}
                                                                    className="rounded border border-stone-200 px-2 py-0.5 text-[11px] text-stone-700 dark:border-stone-700 dark:text-stone-200"
                                                                >
                                                                    {canvasKeys[key] ? "已发送画布" : "发送画布"}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void onDownload(item, itemIndex)}
                                                                    className="rounded border border-stone-200 px-2 py-0.5 text-[11px] text-stone-700 dark:border-stone-700 dark:text-stone-200"
                                                                >
                                                                    下载
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
            <div className="mt-3 flex items-center gap-1" data-testid="suite-result-pager">
                {[1, 2, 3].map((page) => (
                    <button
                        key={page}
                        type="button"
                        aria-label={`第 ${page} 页`}
                        className={`h-6 min-w-[24px] rounded-[4px] border text-[11px] leading-none ${
                            page === 1
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-[#E6E6EB] text-[#5a5a70] hover:border-[#d8d8e0]"
                        }`}
                    >
                        {page}
                    </button>
                ))}
            </div>
                </div>
                </div>
            </div>
            </ToolWorkspaceColumns>
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
    const [rightTab, setRightTab] = useState<"result" | "cases" | "history">("result");
    const [advancedOpen, setAdvancedOpen] = useState(false);

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

    /* 任务回填：任务已由 store-backed 网关落盘（含结果字节入库），
     * 刷新/重新进入时按当前配置的模块计划还原结果区，避免「生成成功刷新即消失」。 */
    const storeTasks = useToolTaskStore((state) => state.tasks);
    const tasksHydrated = useToolTaskStore((state) => state.hydrated);
    const hydrateTasks = useToolTaskStore((state) => state.hydrate);
    /** 用户点了「清空结果」后不再自动把历史结果拉回来（除非重新提交）。 */
    const clearedResults = useRef(false);
    useEffect(() => {
        if (!tasksHydrated) hydrateTasks();
    }, [tasksHydrated, hydrateTasks]);
    useEffect(() => {
        if (!seeded || !tasksHydrated || clearedResults.current) return;
        const restored = restoreMarketUnitsFromTasks(config, storeTasks, toolId);
        if (restored.length === 0) return;
        setUnits((previous) => {
            if (previous.length === 0) return restored;
            const next = [...previous];
            let changed = false;
            for (const unit of restored) {
                const index = next.findIndex((item) => item.unitId === unit.unitId);
                if (index < 0) {
                    next.push(unit);
                    changed = true;
                    continue;
                }
                const existing = next[index];
                // 用户在页面上重提过（taskId 不同）：不拿历史任务覆盖当前结果。
                if (existing.taskId && unit.taskId && existing.taskId !== unit.taskId) continue;
                if (existing.status === unit.status && existing.items.length === unit.items.length) continue;
                next[index] = unit;
                changed = true;
            }
            if (!changed) return previous;
            const order = new Map(buildMarketUnits(config).map((unit, index) => [unit.id, index]));
            next.sort((a, b) => (order.get(a.unitId) ?? 0) - (order.get(b.unitId) ?? 0));
            return next;
        });
        setSnapshot(
            (previous) =>
                previous ??
                createMarketSnapshot(config, {
                    revision: draft?.revision ?? 0,
                    images: config.sourceAssetIds,
                    provider: resolveProviderCode(config, imageModel),
                }),
        );
    }, [seeded, tasksHydrated, storeTasks, config, toolId, draft?.revision, imageModel]);

    /* 同 Suite：草稿写入只在事件里发生，绝不放进 setState updater（渲染期写 store 会告警）。 */
    const marketConfigRef = useRef<MarketConfig>(config);
    useEffect(() => {
        marketConfigRef.current = config;
    }, [config]);

    const update = useCallback(
        (next: Partial<MarketConfig>) => {
            const merged = normalizeConfig({ ...marketConfigRef.current, ...next });
            marketConfigRef.current = merged;
            setConfig(merged);
            patchDraft(toolId, {
                values: { marketConfig: merged },
                assetIds: merged.sourceAssetIds,
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
    /* A+ 每模板 aplusCount 张；主副图每模块 1 张。 */
    const aplusUnits = plans.filter((plan) => plan.width > 0 && plan.height > 0).reduce((total, plan) => total + plan.count, 0);
    const mainSubUnits = plans.filter((plan) => plan.width === 0 && plan.height === 0).reduce((total, plan) => total + plan.count, 0);

    /* 历史点选：按 prompt 还原该模块最新一条结果为一张图。 */
    const onSelectHistoryTask = useCallback(
        (task: ToolTask) => {
            const target = normalizePrompt(task.prompt);
            const unit = buildMarketUnits(config).find((item) => normalizePrompt(item.prompt) === target);
            if (!unit) return;
            const restored = marketUnitResultFromTask(unit, task);
            setUnits((previous) => [...previous.filter((item) => item.unitId !== unit.id), restored]);
            setRightTab("result");
        },
        [config],
    );
    const blocked = running || issues.length > 0;

    const sourceIssue = sources.map((source) => validateMarketSourceLimits(source)).find((result) => !result.ok);

    const onGenerate = useCallback(async () => {
        if (sources.length === 0) return;
        clearedResults.current = false;
        setRunning(true);
        setRunError(undefined);
        setSavedKeys({});
        setUnits([]);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            await flushDraft(toolId);
            const run = await runMarketMaterial({
                gateway: getPersistedToolGateway(),
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
                    gateway: getPersistedToolGateway(),
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
     * 回执直接回显资产 id，便于按「存入资产库」的真实结果对账。
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

    /**
     * 结果 → 本地下载：与其它工具的「下载」同一实现（downloadResultItem），
     * 保证三动作（存入资产库 / 发送画布 / 下载）在本工具也齐备。
     */
    const onDownloadItem = useCallback(
        async (unit: MarketUnitResult, item: ToolTaskResultItem, index: number) => {
            setBusyUnit(unit.unitId);
            try {
                await downloadResultItem(item, index, { toolId });
            } catch (error) {
                setRunError(error instanceof Error ? error.message : "下载失败。");
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
        <div
            className={cn("flex h-full min-h-0 flex-col bg-background", className)}
            data-tool="product-market-material"
            data-layout="linkfox-two-pane"
        >
            <OrigRail
                items={ECOMMERCE_SUITE_RAIL}
                active="商品套图"
                testId="suite-family-rail"
                className="shrink-0 border-b border-border px-2"
            />
            <ToolWorkspaceColumns
                className="min-h-0 flex-1"
                config={(
                <div className="flex h-full min-h-0 flex-col">
                    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-1 pt-1">
                        <div className="grid auto-rows-max grid-cols-1 gap-1.5">
                            <Section title="多视角白底商品&实拍图">
                                <p className="mb-1.5 text-[11px] text-muted-foreground">上传商品图</p>
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
                                    title=""
                                    variant="linkfox"
                                    wide
                                    hint={`10M以内，${MARKET_UPLOAD_LIMITS.minSide}*${MARKET_UPLOAD_LIMITS.minSide} ~ ${MARKET_UPLOAD_LIMITS.maxSide}*${MARKET_UPLOAD_LIMITS.maxSide}，最大宽高比${MARKET_UPLOAD_LIMITS.maxAspectRatio}`}
                                    onChange={onSourcesChange}
                                />
                                {sources.length ? (
                                    <div className="mt-1.5 flex flex-wrap gap-2">
                                        {sources.map((source, index) => (
                                            <label key={source.assetId} className="flex items-center gap-1 text-[11px] text-foreground">
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
                                {sourceIssue ? <p className="mt-2 text-[11px] text-amber-600">{sourceIssue.message}</p> : null}
                            </Section>

                            <Section title="商品信息">
                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => update({ productInfo: outlineMarketProductInfo(config.productInfo) })}
                                            data-testid="market-guide"
                                            className="rounded-[4px] border border-[#E6E6EB] px-2 py-[3px] text-[11px] leading-none text-[#5a5a70] hover:border-[#d8d8e0]"
                                        >
                                            向导
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => update({ productInfo: analyzeMarketProductInfo(config.productInfo) })}
                                            data-testid="market-ai-analyze"
                                            className="rounded-[4px] border border-[#E6E6EB] px-2 py-[3px] text-[11px] leading-none text-[#5a5a70] hover:border-[#d8d8e0]"
                                        >
                                            AI分析
                                        </button>
                                    </div>
                                    <span className="text-[11px] text-muted-foreground">
                                        {config.productInfo.length} / {MARKET_PRODUCT_INFO_MAX_LENGTH}
                                    </span>
                                </div>
                                <textarea
                                    value={config.productInfo}
                                    onChange={(event) =>
                                        update({ productInfo: event.target.value.slice(0, MARKET_PRODUCT_INFO_MAX_LENGTH) })
                                    }
                                    rows={6}
                                    placeholder="商品卖点、材质、尺寸、使用场景…（必填，避免凭空生成）"
                                    className="w-full resize-y rounded-md border border-stone-200 bg-white p-2 text-xs text-stone-800 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                                />
                            </Section>

                            <Section title="品牌与合规（可选）">
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <Field label="智能品牌基因">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(config.brandDna.primaryColor || config.brandDna.fontStyle || config.brandDna.tone)}
                                                onChange={(event) =>
                                                    update({
                                                        brandDna: event.target.checked
                                                            ? config.brandDna
                                                            : { ...config.brandDna, primaryColor: "", fontStyle: "", tone: "" },
                                                    })
                                                }
                                            />
                                        </Field>
                                        <button
                                            type="button"
                                            aria-label="高级设置（项目与品牌名称、平台、销售地区、输出语言、A+ 画幅）"
                                            aria-expanded={advancedOpen}
                                            data-testid="market-advanced-toggle"
                                            onClick={() => setAdvancedOpen((value) => !value)}
                                            className="rounded-[4px] border border-[#E6E6EB] p-1 text-[#5a5a70] hover:border-[#d8d8e0]"
                                        >
                                            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4">
                                                <circle cx="8" cy="8" r="2.2" />
                                                <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" />
                                            </svg>
                                        </button>
                                    </div>
                                    <Field label="智能主色、智能字体风格">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                aria-label="智能主色"
                                                value={config.brandDna.primaryColor || "#ffffff"}
                                                onChange={(event) => update({ brandDna: { ...config.brandDna, primaryColor: event.target.value } })}
                                                className="h-6 w-10 shrink-0 cursor-pointer rounded border border-stone-200 dark:border-stone-700"
                                            />
                                            <select
                                                className={inputClass}
                                                value={config.brandDna.fontStyle}
                                                onChange={(event) =>
                                                    update({ brandDna: { ...config.brandDna, fontStyle: event.target.value as MarketConfig["brandDna"]["fontStyle"] } })
                                                }
                                            >
                                                <option value="">跟随品牌</option>
                                                {MARKET_FONT_STYLES.map((style) => (
                                                    <option key={style.id} value={style.id}>
                                                        {style.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </Field>
                                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                        <span>智能合规检查</span>
                                        <span>未选择敏感词库</span>
                                        <span>·</span>
                                        <span>未选择替换词库</span>
                                    </div>
                                    {advancedOpen ? (
                                        <div data-testid="market-advanced-fields" className="flex flex-col gap-2 rounded-[6px] border border-[#E6E6EB] p-2">
                                            <Field label="项目名称">
                                                <input
                                                    className={`${inputClass} w-full`}
                                                    value={config.projectName}
                                                    placeholder="用于资产命名"
                                                    onChange={(event) => update({ projectName: event.target.value })}
                                                />
                                            </Field>
                                            <Field label="品牌名称">
                                                <input
                                                    className={`${inputClass} w-full`}
                                                    value={config.brandName}
                                                    onChange={(event) => update({ brandName: event.target.value })}
                                                />
                                            </Field>
                                            <div className="flex flex-wrap gap-1">
                                                {MARKET_PLATFORMS.map((platform) => (
                                                    <button
                                                        key={platform.id}
                                                        type="button"
                                                        onClick={() => update({ platform: platform.id })}
                                                        className={`rounded border px-2 py-0.5 text-[11px] ${
                                                            config.platform === platform.id
                                                                ? "border-primary bg-primary text-primary-foreground"
                                                                : "border-border text-foreground"
                                                        }`}
                                                    >
                                                        {platform.label}
                                                    </button>
                                                ))}
                                            </div>
                                            <Field label="销售地区">
                                                <select
                                                    className={inputClass}
                                                    value={config.salesRegion}
                                                    onChange={(event) => {
                                                        const region = findRegion(event.target.value);
                                                        update({
                                                            salesRegion: event.target.value as MarketConfig["salesRegion"],
                                                            ...(region ? { language: region.defaultLanguage } : {}),
                                                        });
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
                                                <select
                                                    className={inputClass}
                                                    value={config.language}
                                                    onChange={(event) => update({ language: event.target.value as MarketConfig["language"] })}
                                                >
                                                    {MARKET_LANGUAGES.map((language) => (
                                                        <option key={language.id} value={language.id}>
                                                            {language.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </Field>
                                            <Field label="A+ 画幅">
                                                <select
                                                    className={inputClass}
                                                    value={config.aplusAspectRatio}
                                                    onChange={(event) => update({ aplusAspectRatio: event.target.value })}
                                                >
                                                    {aplusRatiosForPlatform(config.platform).map((ratio) => (
                                                        <option key={ratio.id} value={ratio.id}>
                                                            {ratio.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </Field>
                                        </div>
                                    ) : null}
                                </div>
                            </Section>

                            <Section title="模型选择">
                                <div className="flex flex-col gap-2.5">
                                    <div className="flex items-center justify-between rounded-[6px] border border-[#E6E6EB] px-2 py-[6px]">
                                        <span className="text-[12px] leading-none text-[#2b2b3a] dark:text-stone-100">LF智能模型 G-2.5 Sunburst</span>
                                        <span className="text-[10px] leading-none text-muted-foreground">
                                            {imageModel?.split("::").pop()?.trim() || "未配置"}
                                        </span>
                                    </div>
                                    <div>
                                        <p className="mb-1.5 text-[11px] text-muted-foreground">分辨率选择</p>
                                        <div className="flex gap-1.5">
                                            {availableResolutions(config.provider).map((value) => (
                                                <button
                                                    key={value}
                                                    type="button"
                                                    data-testid={`market-resolution-${value}`}
                                                    onClick={() => update({ resolution: value })}
                                                    className={`h-7 min-w-[46px] rounded-[4px] border text-[12px] leading-none ${
                                                        config.resolution === value
                                                            ? "border-primary bg-primary/10 text-primary"
                                                            : "border-[#E6E6EB] text-[#5a5a70] hover:border-[#d8d8e0]"
                                                    }`}
                                                >
                                                    {value}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="mb-1.5 text-[11px] text-muted-foreground">模型品质</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {MARKET_QUALITIES.map((quality) => (
                                                <button
                                                    key={quality.id}
                                                    type="button"
                                                    data-testid={`market-quality-${quality.id}`}
                                                    onClick={() => update({ quality: quality.id })}
                                                    className={`h-7 rounded-[4px] border px-2 text-[12px] leading-none ${
                                                        config.quality === quality.id
                                                            ? "border-primary bg-primary/10 text-primary"
                                                            : "border-[#E6E6EB] text-[#5a5a70] hover:border-[#d8d8e0]"
                                                    }`}
                                                >
                                                    {quality.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </Section>

                            <Section title="A+图设置">
                                <p className="mb-1 text-[11px] text-muted-foreground">生成类型（单选）</p>
                                <div className="flex flex-wrap gap-1">
                                    {MARKET_APLUS_TEMPLATES.map((template) => {
                                        const active = config.aplusTemplateIds.includes(template.id);
                                        return (
                                            <div
                                                key={template.id}
                                                data-testid={`market-aplus-${template.id}`}
                                                role="radio"
                                                aria-checked={active}
                                                aria-label={template.label ?? template.id}
                                                onClick={() =>
                                                    update({
                                                        aplusTemplateIds: active && config.aplusTemplateIds.length === 1 ? config.aplusTemplateIds : [template.id],
                                                    })
                                                }
                                                className={`flex cursor-pointer items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[11px] leading-none ${
                                                    active
                                                        ? "border-stone-800 bg-stone-800 text-white dark:border-stone-200 dark:bg-stone-200 dark:text-stone-900"
                                                        : "border-stone-200 text-stone-700 dark:border-stone-700 dark:text-stone-200"
                                                }`}
                                            >
                                                <span>{template.label}</span>
                                                <button
                                                    type="button"
                                                    title="每模块张数"
                                                    aria-label={`${template.label}每模块张数`}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        update({ aplusCount: config.aplusCount >= 10 ? 1 : config.aplusCount + 1 });
                                                    }}
                                                    className="text-[10px] opacity-70 hover:opacity-100"
                                                >
                                                    {config.aplusCount}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className="mt-1.5 mb-1 text-[11px] text-muted-foreground">选择排版</p>
                                <div className="flex flex-wrap gap-1">
                                    {MARKET_LAYOUT_MODES.map((mode) => (
                                        <button
                                            key={mode.id}
                                            type="button"
                                            data-testid={`market-layout-${mode.id}`}
                                            onClick={() => update({ layoutMode: mode.id })}
                                            className={`h-6 rounded-[4px] border px-1.5 text-[11px] leading-none ${
                                                config.layoutMode === mode.id
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-[#E6E6EB] text-[#5a5a70] hover:border-[#d8d8e0]"
                                            }`}
                                        >
                                            {mode.label}
                                        </button>
                                    ))}
                                </div>
                                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                                    💡未选择排版时，将根据官方排版随机生成
                                </p>
                            </Section>

                            <Section title="主副图设置">
                                <p className="mb-1 text-[11px] text-muted-foreground">生成类型（多选）</p>
                                <div className="flex flex-wrap gap-1">
                                    {MARKET_MARKETING_MODULES.map((module) => {
                                        const checked = config.marketingModuleIds.includes(module.id);
                                        return (
                                            <div
                                                key={module.id}
                                                data-testid={`market-marketing-${module.id}`}
                                                role="checkbox"
                                                aria-checked={checked}
                                                aria-label={module.label}
                                                onClick={() =>
                                                    update({
                                                        marketingModuleIds: checked
                                                            ? config.marketingModuleIds.filter((id) => id !== module.id)
                                                            : [...config.marketingModuleIds, module.id],
                                                    })
                                                }
                                                className={`flex cursor-pointer items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[11px] leading-none ${
                                                    checked
                                                        ? "border-stone-800 bg-stone-800 text-white dark:border-stone-200 dark:bg-stone-200 dark:text-stone-900"
                                                        : "border-stone-200 text-stone-700 dark:border-stone-700 dark:text-stone-200"
                                                }`}
                                            >
                                                <span>{module.label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className="mt-1.5 mb-1 text-[11px] text-muted-foreground">生成比例</p>
                                <div className="flex flex-wrap gap-1">
                                    {MARKET_RATIO_CHIPS.map((chip) => (
                                        <button
                                            key={chip.label}
                                            type="button"
                                            data-testid={`market-ratio-${chip.label}`}
                                            onClick={() =>
                                                update({
                                                    aspectRatio: chip.ratio ?? config.aspectRatio,
                                                    isCustomAspectRatio: !chip.ratio,
                                                    customWidth: chip.width ?? 0,
                                                    customHeight: chip.height ?? 0,
                                                })
                                            }
                                            className={`h-6 min-w-[38px] rounded-[4px] border text-[11px] leading-none ${
                                                activeMarketRatio(config) === chip.label
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-[#E6E6EB] text-[#5a5a70] hover:border-[#d8d8e0]"
                                            }`}
                                        >
                                            {chip.label}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => update({ isCustomAspectRatio: false, customWidth: 0, customHeight: 0 })}
                                        className="h-6 rounded-[4px] border border-[#E6E6EB] px-1.5 text-[11px] leading-none text-[#5a5a70] hover:border-[#d8d8e0]"
                                    >
                                        更多
                                    </button>
                                </div>
                            </Section>

                        </div>
                    </div>
                    <div className="shrink-0 border-t border-[#EDEDF0] px-6 py-3" data-testid="market-generate-summary">
                        <div className="mt-2 flex items-center gap-2">
                            <button
                                type="button"
                                disabled={blocked}
                                title={issues[0]?.message}
                                onClick={() => void onGenerate()}
                                data-testid="market-generate"
                                className="h-8 flex-1 rounded-md bg-primary text-[12px] font-medium leading-none text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {running ? "生成中…" : "开始生成"}
                            </button>
                            {units.length ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        clearedResults.current = true;
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
                )}
            >

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
                                data-testid={`market-tab-${id}`}
                                onClick={() => setRightTab(id)}
                                className={cn(
                                    "h-11 text-[13px] leading-none transition",
                                    rightTab === id
                                        ? "border-b-2 border-primary font-medium text-foreground"
                                        : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                        <div role="tabpanel" hidden={rightTab !== "history"} data-testid="market-panel-history">
                            <ToolTaskHistory toolId={toolId} limit={8} onSelectTask={onSelectHistoryTask} emptyHint="还没有营销素材任务记录" />
                        </div>
                        <div role="tabpanel" hidden={rightTab !== "cases"} data-testid="market-panel-cases">
                            <p className="text-[11px] text-stone-500">暂无优秀案例</p>
                        </div>
                        <div role="tabpanel" hidden={rightTab !== "result"} data-testid="market-panel-result" className="flex flex-col gap-3">
                            <p className="text-[11px] text-[#6b6b80]">生成结果</p>
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
                                    {groupMarketUnits(units).map((group) => (
                                        <div key={group.moduleId} className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                                            <h4 className="mb-2 text-xs font-medium text-stone-700 dark:text-stone-200">
                                                {group.label}（{group.succeeded}/{group.total}）
                                            </h4>
                                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                                {group.units.map((unit) => (
                                                    <article key={unit.unitId} className="rounded-md border border-stone-200 p-2 dark:border-stone-800">
                                                        <p className="mb-1 text-[11px] text-stone-600 dark:text-stone-300">{unit.label}</p>
                                                        {unit.items.length ? (
                                                            <div className="grid grid-cols-2 gap-1">
                                                                {unit.items.map((item, itemIndex) => (
                                                                    <img
                                                                        key={`${unit.unitId}-${itemIndex}`}
                                                                        src={item.url ?? item.dataUrl}
                                                                        alt={unit.label}
                                                                        className="h-24 w-full rounded object-cover"
                                                                    />
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <p className="text-[11px] text-stone-500">
                                                                {unit.error?.message ?? (unit.status === "pending" ? "上游结果未知，稍后重试可查询。" : "暂无内容")}
                                                            </p>
                                                        )}
                                                        {unit.status === "failed" ? (
                                                            <button
                                                                type="button"
                                                                disabled={busyUnit === unit.unitId}
                                                                onClick={() => void onRetryUnit(unit)}
                                                                className="mt-1 rounded border border-border px-2 py-0.5 text-[11px] text-foreground disabled:opacity-40"
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
                            ) : (
                                <p className="text-[11px] text-stone-500">上传商品图</p>
                            )}
                        </div>
                        {seeded ? null : <p className="text-[11px] text-stone-500">正在读取草稿…</p>}
                        <div className="mt-3 flex items-center gap-1" data-testid="market-result-pager">
                            {[1, 2, 3].map((page) => (
                                <button
                                    key={page}
                                    type="button"
                                    aria-label={`第 ${page} 页`}
                                    className={`h-6 min-w-[24px] rounded-[4px] border text-[11px] leading-none ${
                                        page === 1
                                            ? "border-primary bg-primary/10 text-primary"
                                            : "border-[#E6E6EB] text-[#5a5a70] hover:border-[#d8d8e0]"
                                    }`}
                                >
                                    {page}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </ToolWorkspaceColumns>
        </div>
    );
}

/** 生成比例 chip：market 只原生支持 1:1 / 3:4 / 3:2，4:3 与 2:3 走自定义画幅。 */
const MARKET_RATIO_CHIPS: readonly { label: string; ratio?: "1:1" | "3:4" | "3:2"; width?: number; height?: number }[] = [
    { label: "1:1", ratio: "1:1" },
    { label: "3:4", ratio: "3:4" },
    { label: "4:3", width: 1200, height: 900 },
    { label: "2:3", width: 800, height: 1200 },
    { label: "3:2", ratio: "3:2" },
];

function activeMarketRatio(config: MarketConfig): string {
    if (!config.isCustomAspectRatio) return config.aspectRatio;
    if (config.customWidth === 1200 && config.customHeight === 900) return "4:3";
    if (config.customWidth === 800 && config.customHeight === 1200) return "2:3";
    return "";
}

/** 向导：给商品信息铺一份可填骨架（不覆盖已有内容，只追加空栏目）。 */
function outlineMarketProductInfo(current: string): string {
    const skeleton = "【商品名称】\n【核心卖点】\n【材质 / 工艺】\n【适用场景】\n【规格尺寸】";
    const base = current.trim();
    const next = base ? `${base}\n${skeleton}` : skeleton;
    return next.slice(0, MARKET_PRODUCT_INFO_MAX_LENGTH);
}

/** AI分析：把已有商品信息按「卖点 / 材质 / 场景 / 规格」重新归并，未识别项留空待补。 */
function analyzeMarketProductInfo(current: string): string {
    const source = current.trim();
    if (!source) return "";
    const segments = source.split(/[，,。;；\n]+/).map((segment) => segment.trim()).filter(Boolean);
    const materialWords = ["棉", "麻", "真丝", "涤纶", "羊毛", "皮革", "不锈钢", "铝合金", "玻璃", "陶瓷", "竹", "木", "ABS", "硅胶"];
    const sceneWords = ["家用", "户外", "办公", "厨房", "旅行", "露营", "运动", "母婴", "车载", "礼物"];
    const material = segments.filter((segment) => materialWords.some((word) => segment.includes(word)));
    const scene = segments.filter((segment) => sceneWords.some((word) => segment.includes(word)));
    const spec = segments.filter((segment) => /\d/.test(segment) && /(cm|mm|ml|g|kg|寸|升|个|片|色)/i.test(segment));
    const used = new Set([...material, ...scene, ...spec]);
    const selling = segments.filter((segment) => !used.has(segment)).slice(0, 5);
    const block = (title: string, lines: string[]) => `${title}\n${lines.length ? lines.join("；") : "待补充"}`;
    return [block("【卖点】", selling), block("【材质 / 工艺】", material), block("【适用场景】", scene), block("【规格尺寸】", spec)]
        .join("\n")
        .slice(0, MARKET_PRODUCT_INFO_MAX_LENGTH);
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
