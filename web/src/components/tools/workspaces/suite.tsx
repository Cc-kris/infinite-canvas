import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolCases } from "@/components/tools/tool-cases";
import { ToolCaseGuide } from "@/components/tools/tool-case-guide";
import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import type { ToolCase } from "@/components/tools/tool-cases";
import { uploadCaseFiles } from "@/features/tools/case-apply";
import { PRODUCT_SUITE_CASES } from "@/features/tools/suite6-cases-data";
import { PRODUCT_SUITE_SAMPLES } from "@/features/tools/tool-cases-data";
import { History } from "lucide-react";
import { downloadResultItem, saveResultItemToAssets, sendResultItemToCanvas } from "@/components/tools/tool-result-actions";
import { loadToolAssetRecords, toolAssetLibraryItemsFromAssets, type ToolAssetConstraints, type ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
import { useAssetStore, type ImageAsset, type VideoAsset } from "@/stores/use-asset-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { getPersistedToolGateway, useToolTaskStore } from "@/stores/use-tool-task-store";

import {
    PRODUCT_IMAGE_SUITE_MAX_PRODUCT_INFO,
    PRODUCT_IMAGE_SUITE_TOOL_ID,
    buildSuiteUnits,
    SUITE_FONT_STYLES,
    SUITE_LAYOUT_MODES,
    SUITE_PRODUCT_CATEGORIES,
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
import { SUITE_REPLACEMENT_LIBRARIES, SUITE_SENSITIVE_LIBRARIES } from "@/features/tools/registry/product-image-suite";
import {
    MARKET_APLUS_TEMPLATES,
    MARKET_FONT_STYLES,
    MARKET_LANGUAGES,
    MARKET_LAYOUT_MODES,
    MARKET_MARKETING_MODULES,
    MARKET_MAX_MODULE_COUNT,
    MARKET_PRODUCT_CATEGORIES,
    MARKET_QUALITIES,
    MARKET_PLATFORMS,
    MARKET_PRODUCT_INFO_MAX_LENGTH,
    MARKET_REPLACEMENT_LIBRARIES,
    MARKET_SALES_REGIONS,
    MARKET_SENSITIVE_LIBRARIES,
    MARKET_UPLOAD_LIMITS,
    PRODUCT_MARKET_MATERIAL_TOOL_ID,
    aplusRatiosForPlatform,
    availableMarketingRatios,
    availableResolutions,
    buildMarketPlan,
    buildMarketUnits,
    createDefaultMarketConfig,
    createMarketSnapshot,
    findRegion,
    marketExpectedCount,
    marketReplacementLibraryOf,
    marketSensitiveLibraryOf,
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
    output?: { label: string; summary: string; configureLabel: string; ariaLabel?: string; enabled?: boolean; onToggle?: () => void };
}) {
    const [open, setOpen] = useState(false);
    if (output) {
        return (
            /* 原站这两块是「行卡」：上行名称、下行摘要，右侧一个箭头/齿轮，点开是弹层内容。 */
            <section className="rounded-[4px] border border-border bg-background px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                    <button type="button" aria-expanded={open} aria-label={output.ariaLabel} onClick={() => setOpen((value) => !value)} className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
                        <span className="truncate text-[12px] font-medium leading-4 text-foreground">{output.label}</span>
                        <span className="truncate text-[11px] leading-4 text-muted-foreground">{output.summary}</span>
                    </button>
                    {/* 原站：模型行只有一个箭头；A+图 / 主副图行是齿轮（打开配置）+ 开关，不重复两个图标。 */}
                    {output.ariaLabel ? (
                        <svg viewBox="0 0 16 16" aria-hidden className={cn("size-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} fill="none" stroke="currentColor" strokeWidth="1.4">
                            <path d="M6 3.5L10.5 8L6 12.5" />
                        </svg>
                    ) : null}
                    {output.onToggle ? (
                    <button
                        type="button"
                            role="switch"
                            aria-checked={output.enabled !== false}
                            aria-label={`${output.label}开关`}
                            onClick={output.onToggle}
                            className={cn("relative h-[16px] w-[28px] shrink-0 rounded-full transition-colors", output.enabled === false ? "bg-foreground/20" : "bg-primary")}
                    >
                            <span className={cn("absolute top-[2px] size-3 rounded-full bg-background transition-all", output.enabled === false ? "left-[2px]" : "left-[14px]")} />
                    </button>
                    ) : null}
                    {output.ariaLabel ? null : (
                    <button
                        type="button"
                        aria-label={output.configureLabel}
                        title={output.configureLabel}
                            aria-expanded={open}
                            onClick={() => setOpen((value) => !value)}
                        className="rounded-[4px] border border-border px-1 py-0.5 text-muted-foreground hover:bg-accent"
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
                {open ? (
                    <div className="mt-1.5 space-y-1.5">
                        {children}
                        {/* 原站弹层底部有「完成」：本地用它收起同一份设置内容。 */}
                        <div className="flex justify-end pt-0.5">
                            <button type="button" onClick={() => setOpen(false)} className="h-[26px] rounded-[4px] bg-primary px-3 text-[11px] leading-none text-primary-foreground hover:bg-primary/90">
                                完成
                            </button>
                        </div>
                    </div>
                ) : null}
            </section>
        );
    }
    return (
        <section className="rounded-md border border-border bg-background/60 px-2 py-1.5">
            <header className="mb-1 flex items-baseline gap-1.5">
                <h3 className="text-[12px] font-medium leading-4 text-foreground">{title}</h3>
                {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
            </header>
            {children}
        </section>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="flex items-center justify-between gap-2 text-xs text-foreground/70">
            <span className="shrink-0">
                {label}
                {hint ? <span className="ml-1 text-[10px] text-muted-foreground">{hint}</span> : null}
            </span>
            {children}
        </label>
    );
}

const inputClass = "rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary";

/**
 * 原站的下拉/级联在本地统一用「可搜索级联弹层」的交互形态呈现：
 * 触发条（role=combobox，显示当前值）+ 弹层（搜索框 + 选项列表 + 空态）。
 * 数据仍是本页现有的真实枚举（不改注册表、不接后端、不搬运原站类目表）。
 */
function SuiteSearchSelect({
    label,
    value,
    options,
    emptyHint,
    placeholder = "请选择",
    testId,
    onChange,
    className,
}: {
    label: string;
    value: string;
    options: ReadonlyArray<{ value: string; label: string; group?: string }>;
    emptyHint?: string;
    placeholder?: string;
    testId?: string;
    onChange: (value: string) => void;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const rootRef = useRef<HTMLDivElement | null>(null);
    const current = options.find((option) => option.value === value);
    const matched = options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()));

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    return (
        <div ref={rootRef} className={cn("relative", className)}>
            <button
                type="button"
                role="combobox"
                aria-label={label}
                aria-expanded={open}
                aria-haspopup="listbox"
                data-testid={testId}
                onClick={() => setOpen((previous) => !previous)}
                className={cn("flex h-[30px] w-full items-center justify-between gap-1 rounded-[4px] border bg-background px-2 text-left text-[12px] leading-none transition-colors", open ? "border-selected" : "border-border hover:border-selected")}
            >
                <span className={cn("truncate", current ? "text-foreground" : "text-muted-foreground")}>{current ? current.label : placeholder}</span>
                <svg viewBox="0 0 16 16" aria-hidden className="size-3 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <path d="M4 6.5L8 10.5L12 6.5" />
                </svg>
            </button>
            {open ? (
                <div data-testid={testId ? `${testId}-popup` : undefined} className="absolute left-0 top-[34px] z-30 w-full min-w-[220px] rounded-[6px] border border-border bg-background p-1.5 shadow-[0_8px_24px_rgba(15,15,25,0.12)]">
                    <input
                        autoFocus
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="搜索"
                        aria-label={`搜索${label}`}
                        className="mb-1 h-[26px] w-full rounded-[4px] border border-border px-2 text-[12px] leading-none outline-none focus:border-primary"
                    />
                    <ul role="listbox" aria-label={label} className="max-h-[180px] overflow-y-auto">
                        {matched.map((option) => (
                            <li key={option.value}>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={option.value === value}
                                    onClick={() => {
                                        onChange(option.value);
                                        setOpen(false);
                                        setQuery("");
                                    }}
                                    className={cn(
                                        "flex h-[26px] w-full items-center justify-between gap-2 rounded-[4px] px-2 text-left text-[12px] leading-none",
                                        option.value === value ? "bg-selected-soft text-selected" : "text-foreground hover:bg-accent",
                                    )}
                                >
                                    <span className="truncate">
                                        {option.label}
                                        {option.group ? <span className="ml-1 text-[11px] text-muted-foreground">{option.group}</span> : null}
                                    </span>
                                    {option.value === value ? <span aria-hidden>✓</span> : null}
                                </button>
                            </li>
                        ))}
                        {matched.length === 0 ? <li className="px-2 py-1.5 text-[11px] leading-4 text-muted-foreground">{emptyHint ?? "没有匹配的选项"}</li> : null}
                    </ul>
                </div>
            ) : null}
        </div>
    );
}

/** 商品信息「向导」弹窗：只在点「确定」时把填写内容并入商品信息；AI分析按钮保持禁用（与原站未上传时一致）。 */
function SuiteWizardDialog({ open, onClose, onApply }: { open: boolean; onClose: () => void; onApply: (draft: SuiteWizardDraft) => void }) {
    const [draft, setDraft] = useState<SuiteWizardDraft>(EMPTY_SUITE_WIZARD);
    useEffect(() => {
        if (open) setDraft(EMPTY_SUITE_WIZARD);
    }, [open]);
    if (!open) return null;
    const field = (key: keyof SuiteWizardDraft, label: string, max: number, multiline = false) => (
        <label className="flex flex-col gap-1 text-[12px] leading-4 text-foreground/70">
            <span className="flex items-baseline justify-between gap-2">
                <span>{label}</span>
                <span className="text-[11px] text-muted-foreground">
                    {draft[key].length} / {max}
                </span>
            </span>
            {multiline ? (
                <textarea
                    value={draft[key]}
                    rows={4}
                    onChange={(event) => setDraft((previous) => ({ ...previous, [key]: event.target.value.slice(0, max) }))}
                    className="w-full resize-y rounded-[4px] border border-border p-2 text-[12px] leading-5 outline-none focus:border-primary"
                />
            ) : (
                <input
                    value={draft[key]}
                    onChange={(event) => setDraft((previous) => ({ ...previous, [key]: event.target.value.slice(0, max) }))}
                    className="h-[30px] w-full rounded-[4px] border border-border px-2 text-[12px] leading-none outline-none focus:border-primary"
                />
            )}
        </label>
    );
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="presentation" onMouseDown={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label="商品信息"
                data-testid="suite-wizard-dialog"
                onMouseDown={(event) => event.stopPropagation()}
                className="flex max-h-[80vh] w-[484px] max-w-full flex-col rounded-[8px] bg-background shadow-[0_16px_48px_rgba(15,15,25,0.24)]"
            >
                <header className="flex h-[46px] shrink-0 items-center justify-between border-b border-border px-4">
                    <h2 className="text-[14px] font-medium leading-none text-foreground">商品信息</h2>
                    <button type="button" aria-label="关闭商品信息" onClick={onClose} className="text-[12px] leading-none text-muted-foreground hover:text-foreground">
                        关闭
                    </button>
                </header>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                    {field("productName", "产品名称", 100)}
                    {field("productSize", "产品尺寸", 100)}
                    {field("audience", "目标受众", SUITE_WIZARD_LIMITS.audience)}
                    {field("sellingPoint", "核心卖点", SUITE_WIZARD_LIMITS.sellingPoint, true)}
                    {field("infringement", "我的侵权词", SUITE_WIZARD_LIMITS.infringement)}
                    <p className="text-[11px] leading-4 text-muted-foreground">填写内容只写入本页商品信息（随生成 Prompt 提交），不写入上游任何账户。</p>
                </div>
                <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-2.5">
                    <button type="button" onClick={onClose} className="h-[28px] rounded-[4px] border border-border px-3 text-[12px] leading-none text-muted-foreground hover:bg-accent">
                        取消
                    </button>
                    <button
                        type="button"
                        data-testid="suite-wizard-confirm"
                        onClick={() => {
                            onApply(draft);
                            onClose();
                        }}
                        className="h-[28px] rounded-[4px] bg-primary px-4 text-[12px] leading-none text-primary-foreground! hover:bg-primary/90"
                    >
                        确定
                    </button>
                </footer>
            </div>
        </div>
    );
}

/** 诚实空态弹窗：本地没有该类数据源时如实说明，不伪造列表、不禁用入口。 */
function SuiteEmptyLibraryDialog({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="presentation" onMouseDown={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                data-testid="suite-empty-library-dialog"
                onMouseDown={(event) => event.stopPropagation()}
                className="flex w-[360px] max-w-full flex-col rounded-[8px] bg-background shadow-[0_16px_48px_rgba(15,15,25,0.24)]"
            >
                <header className="flex h-[46px] shrink-0 items-center justify-between border-b border-border px-4">
                    <h2 className="text-[14px] font-medium leading-none text-foreground">{title}</h2>
                    <button type="button" aria-label={`关闭${title}`} onClick={onClose} className="text-[12px] leading-none text-muted-foreground hover:text-foreground">
                        关闭
                    </button>
                </header>
                <p className="px-4 py-4 text-[12px] leading-5 text-muted-foreground">{body}</p>
            </div>
        </div>
    );
}

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

/**
 * 上传张数上限 = 16（原站上传卡文案「最多上传16张图」）。
 * 注册表里的 `SUITE_SOURCE_LIMITS.maxCount` 仍是 1（生成时只用首图作源图），
 * 这里放宽的是「选择/暂存参考图」的入口，避免为了 16 张去改注册表契约。
 */
const SUITE_UPLOAD_MAX = 16;

/** 原站上传卡限制行逐字文案（「最多上传16张图，10M以内，384*384~4096*4096，最大宽高比5」）。 */
const SUITE_UPLOAD_HINT = `最多上传${SUITE_UPLOAD_MAX}张图，10M以内，${SUITE_SOURCE_LIMITS.minSide}*${SUITE_SOURCE_LIMITS.minSide}~${SUITE_SOURCE_LIMITS.maxSide}*${SUITE_SOURCE_LIMITS.maxSide}，最大宽高比${SUITE_SOURCE_LIMITS.maxAspectRatio}`;

/**
 * 商品信息「向导」弹窗：原站是 484×648 的本地表单弹窗（产品名称/产品尺寸/目标受众/核心卖点/我的侵权词），
 * 只在点「确定」时把填写的字段拼进商品信息——不请求网络、不伪造 AI 结论、不预置任何账号数据。
 */
const SUITE_WIZARD_LIMITS = { audience: 100, sellingPoint: 2200, infringement: 100 } as const;
type SuiteWizardDraft = {
    productName: string;
    productSize: string;
    audience: string;
    sellingPoint: string;
    infringement: string;
};

const EMPTY_SUITE_WIZARD: SuiteWizardDraft = { productName: "", productSize: "", audience: "", sellingPoint: "", infringement: "" };

/** 向导填写结果 → 商品信息段落（空字段不落段，避免写进无内容的占位行）。 */
function composeSuiteProductInfo(draft: SuiteWizardDraft, current: string): string {
    const lines = [
        draft.productName.trim() ? `产品名称：${draft.productName.trim()}` : "",
        draft.productSize.trim() ? `产品尺寸：${draft.productSize.trim()}` : "",
        draft.audience.trim() ? `目标受众：${draft.audience.trim()}` : "",
        draft.sellingPoint.trim() ? `核心卖点：${draft.sellingPoint.trim()}` : "",
        draft.infringement.trim() ? `我的侵权词：${draft.infringement.trim()}` : "",
    ].filter(Boolean);
    if (lines.length === 0) return current;
    const base = current.trim();
    return `${base ? `${base}\n` : ""}${lines.join("\n")}`.slice(0, PRODUCT_IMAGE_SUITE_MAX_PRODUCT_INFO);
}

/** 原站「品牌与合规」两行行卡：整行可点，展开的是同一份真实字段（不是第三个自造面板）。 */
function BrandComplianceRow({ label, summary, testId, open, onToggle, children }: { label: string; summary: string; testId: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
    return (
        <div className="py-1 first:pt-0 last:pb-0">
            <button type="button" aria-expanded={open} aria-label={label} data-testid={testId} onClick={onToggle} className="flex w-full items-center justify-between gap-2 py-1.5 text-left">
                <span className="flex min-w-0 flex-col">
                    <span className="text-[12px] font-medium leading-4 text-foreground">{label}</span>
                    <span className="truncate text-[11px] leading-4 text-muted-foreground">{summary}</span>
                </span>
                <svg viewBox="0 0 16 16" aria-hidden className={cn("size-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="1.4">
                    <path d="M4 6.5L8 10.5L12 6.5" />
                </svg>
            </button>
            {open ? <div className="mb-1 rounded-[4px] bg-muted p-2">{children}</div> : null}
        </div>
    );
}

/**
 * 已落盘任务 → 结果区单元。
 * 每个单元是一次真实请求，且单元 prompt 由 (模块, index/count, 尺寸/品质/商品信息) 唯一决定，
 * 所以用 task.prompt 与 buildSuiteUnits(config).prompt 对齐即可还原（不依赖任务里不存在的 fields）。
 * 同一 prompt 有多条时取最新一条；配置改过（prompt 变化）则不还原，避免张冠李戴。
 */
export function restoreSuiteUnitsFromTasks(config: SuiteConfig, tasks: Record<string, ToolTask>, toolId: string): SuiteUnitResult[] {
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
export function restoreMarketUnitsFromTasks(config: MarketConfig, tasks: Record<string, ToolTask>, toolId: string): MarketUnitResult[] {
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
    /* 真实作品库：原站「从作品库选择」可用；本地只在真有资产时给出可选条目，空库不伪造。 */
    const assets = useAssetStore((state) => state.assets);
    const library = useMemo(() => toolAssetLibraryItemsFromAssets(assets.filter((asset): asset is ImageAsset | VideoAsset => asset.kind === "image" || asset.kind === "video")), [assets]);

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
    /* 原站结果区只有「生成结果 / 优秀案例」两个页签，历史是右上角外链（本地无对应页，故不得改成第三个页签）。 */
    const [rightTab, setRightTab] = useState<"result" | "cases">("result");
    const [applyingCaseId, setApplyingCaseId] = useState<string | null>(null);
    const [wizardOpen, setWizardOpen] = useState(false);
    /* 商品库入口：本地没有商品库数据，点开是诚实空态（不禁用入口）。 */
    const [productLibOpen, setProductLibOpen] = useState(false);
    /* 品牌与合规：两个可展开行卡（原站形态），不是常驻平铺控件。 */
    const [brandOpen, setBrandOpen] = useState(false);
    const [complianceOpen, setComplianceOpen] = useState(false);
    const [caseApplyNonce, setCaseApplyNonce] = useState(0);

    /* 「优秀案例」做同款：真实案例原图入库后回填到商品图上传播槽 */
    const applyCase = useCallback(async (item: ToolCase) => {
        setApplyingCaseId(item.id);
        try {
            const assets = await uploadCaseFiles(item);
            /* 「或试试这些」一组多图：全部进上传区，首图作商品图（与原站一致）。 */
            const records = ([] as (ToolAssetRecord | undefined)[]).concat(assets.source as ToolAssetRecord | ToolAssetRecord[] | undefined).filter((entry): entry is ToolAssetRecord => !!entry);
            const record = records[0];
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
            patchDraft(toolId, { assetIds: records.map((entry) => entry.id) });
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
            /* 只写配置值：上传区的 assetIds 由 ToolAssetInput 自己维护（最多 16 张），
               这里再写一次会把它覆盖成单张，刷新后只剩第 1 张。 */
            patchDraft(toolId, { values: { suiteConfig: merged } });
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
            const mergedInfo = `${previous.productInfo}${previous.productInfo.trim() ? "\n" : ""}${text}`.slice(0, PRODUCT_IMAGE_SUITE_MAX_PRODUCT_INFO);
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
        const pick = (keywords: string[]) => lines.filter((line) => keywords.some((keyword) => line.includes(keyword))).slice(0, 3);
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

    const issues = useMemo(() => validateSuiteConfig(config, { sourceReady: isSuiteSourceReady(source), imageModelReady: Boolean(imageModel?.trim()) }), [config, source, imageModel]);
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
        /* 原站行内是开关：关掉即不生成该模块（与「生成内容」多选语义一致）。 */
        enabled: Boolean(config.aplusModuleId),
        onToggle: () => update({ aplusModuleId: config.aplusModuleId ? "" : "aplus-advanced" }),
    };
    const qualityLabel = SUITE_QUALITIES.find((quality) => quality.id === config.quality)?.label ?? "";
    const mainSubFirst = MAIN_SUB_MODULES.find((module) => config.mainSubModuleIds.includes(module.id));
    const mainSubFirstCount = mainSubFirst ? (config.mainSubCounts[mainSubFirst.id] ?? mainSubFirst.defaultCount) : 0;
    const mainSubOutput = {
        label: "主副图",
        summary: `${mainSubFirst ? mainSubFirst.label : "卖点图"} ${mainSubUnits || mainSubFirstCount}张`,
        configureLabel: "配置主副图",
        enabled: config.mainSubModuleIds.length > 0,
        onToggle: () => update({ mainSubModuleIds: config.mainSubModuleIds.length > 0 ? [] : [MAIN_SUB_MODULES[0].id] }),
    };

    /* 品牌与合规行卡摘要：只回显用户已选的真实值，未选就如实说未选。 */
    const sensitiveWords = config.compliance.sensitiveWordLexiconId ? (SUITE_SENSITIVE_LIBRARIES.find((lexicon) => lexicon.id === config.compliance.sensitiveWordLexiconId)?.words ?? []) : [];
    const brandSummary = config.brand.smartBrand ? [config.brand.primaryColor, SUITE_FONT_STYLES.find((style) => style.id === config.brand.fontStyle)?.label].filter(Boolean).join(" · ") || "已启用" : "未启用";
    const complianceSummary =
        [config.compliance.sensitiveWordLexiconId, config.compliance.replacementWordLexiconId]
            .map((id) => SUITE_SENSITIVE_LIBRARIES.find((lexicon) => lexicon.id === id)?.label ?? SUITE_REPLACEMENT_LIBRARIES.find((lexicon) => lexicon.id === id)?.label)
            .filter(Boolean)
            .join(" · ") || "未选择词库";

    /* 向导：本地表单弹窗，点「确定」才把填写内容并入商品信息（不发网络请求、不伪造 AI 输出）。 */
    const applyWizard = useCallback(
        (draft: SuiteWizardDraft) => {
            const previous = configRef.current;
            const next = composeSuiteProductInfo(draft, previous.productInfo);
            if (next === previous.productInfo) return;
            commitConfig({ ...previous, productInfo: next });
        },
        [commitConfig],
    );

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
            const notes = [failed > 0 ? `${failed} 张失败，可单张重试。` : "", pending > 0 ? `${pending} 张状态未确定：请到历史记录确认，先不要重复提交。` : ""].filter(Boolean);
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
            <ToolWorkspaceColumns
                className="min-h-0 flex-1"
                config={
                <div className="flex h-full min-h-0 flex-col">
                        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-1 pt-1">
                    <div className="grid auto-rows-max grid-cols-1 gap-1.5">
                                {/* 原站工具区顶部无任何公告条（2026-11-02 只读对照：无「全能模型已升级」文案），本地不再自造。 */}
                <Section title="多视角白底商品&实拍图">
                    <ToolAssetInput
                        key={`case-${caseApplyNonce}`}
                        toolId={toolId}
                                        maxCount={SUITE_UPLOAD_MAX}
                        disabled={running}
                        title=""
                        variant="linkfox"
                        wide
                                        uploadLabel="从本地上传"
                                        library={library}
                                        hint={
                                            <>
                                                {SUITE_UPLOAD_HINT}
                                                {/* 原站上传卡内「或试试这些」：分隔线 + 示例组（一组多图，点击即整组载入为商品图）。 */}
                                                <div className="mt-2.5 cursor-default" data-testid="suite-try-demo" onClick={(event) => event.stopPropagation()}>
                                                    <div className="mb-[5px] flex items-center gap-2">
                                                        <span className="h-px flex-1 bg-border" />
                                                        <span className="text-[12px] font-medium leading-[15px] text-muted-foreground/60">或试试这些</span>
                                                        <span className="h-px flex-1 bg-border" />
                                                    </div>
                                                    <div className="flex justify-center gap-2">
                                                        {PRODUCT_SUITE_SAMPLES.map((group) => (
                                                            <button
                                                                key={group.id}
                                                                type="button"
                                                                data-testid={`suite-sample-${group.id}`}
                                                                disabled={running || applyingCaseId !== null}
                                                                onClick={() => void applyCase(group).catch((error) => setRunError(error instanceof Error ? error.message : "示例载入失败"))}
                                                                className="flex gap-1 rounded-[6px] border border-border bg-card p-1 transition hover:border-selected disabled:opacity-50"
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
                                        /* 原站第三按钮可用且打开商品库；本地没有商品库数据，点开是诚实空态而不是禁用。 */
                                        thirdAction={
                                            <button
                                                type="button"
                                                data-testid="suite-products-entry"
                                                onClick={() => setProductLibOpen(true)}
                                                className="h-6 w-[100px] rounded-md border border-border bg-card text-xs leading-none text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
                                            >
                                                从商品库选择
                                            </button>
                                        }
                        constraints={SUITE_ASSET_CONSTRAINTS}
                        onChange={onSourceChange}
                    />
                                    {source ? (
                                        <div className="mt-1.5 flex items-center gap-2">
                                            <span className="text-[11px] leading-4 text-muted-foreground">生成将使用第 1 张作为商品图</span>
                                            <button
                                                type="button"
                                                data-testid="suite-clear-upload"
                                                onClick={() => {
                                                    setSource(undefined);
                                                    setCaseApplyNonce((value) => value + 1);
                                                    update({ sourceAssetId: "" });
                                                    setRunError(undefined);
                                                }}
                                                className="rounded-[4px] border border-border px-2 py-[2px] text-[11px] leading-none text-muted-foreground hover:bg-accent"
                                            >
                                                清空
                                            </button>
                                        </div>
                    ) : null}
                                    {restoringSource ? <p className="mt-2 text-[11px] text-muted-foreground">正在恢复上次的商品图…</p> : null}
                                    {!source && config.sourceAssetId && !restoringSource ? <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">上次的商品图已失效，请重新选择。</p> : null}
                    {source && sourceIssue && !sourceIssue.ok ? <p className="mt-2 text-[11px] text-destructive">{sourceIssue.message}</p> : null}
                </Section>

                                {/* 原站顺序：商品类目（独立块）→ 商品信息（文本域在上，AI分析/向导/字数在下）。 */}
                                <Section title="商品类目">
                                    <SuiteSearchSelect
                                        label="商品类目"
                                        testId="suite-category"
                                        value={config.productCategory}
                                        placeholder="请选择商品类目"
                                        emptyHint="没有匹配的类目"
                                        options={SUITE_PRODUCT_CATEGORIES.map((category) => ({ value: category.id, label: category.label }))}
                                        onChange={(next) => update({ productCategory: next })}
                                    />
                                </Section>

                <Section title="商品信息">
                                    <textarea
                                        value={config.productInfo}
                                        onChange={(event) => update({ productInfo: event.target.value.slice(0, PRODUCT_IMAGE_SUITE_MAX_PRODUCT_INFO) })}
                                        rows={5}
                                        placeholder="商品信息包含商品卖点、使用方式、销售地区、发布平台等，生图效果将会更好"
                                        className="w-full resize-y rounded-md border border-border bg-background p-2 text-xs text-foreground outline-none focus:border-primary"
                                    />
                                    <div className="mt-1.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                                /* 原站未上传商品图时 AI分析 是禁用态；与源图就绪联动，不再永远可点。 */
                                                disabled={!source}
                                                title={source ? undefined : "上传商品图后可分析"}
                                                onClick={onAnalyzeProductInfo}
                                                data-testid="suite-ai-analyze"
                                                className="rounded-[4px] border border-border px-2 py-[3px] text-[11px] leading-none text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                                AI分析
                            </button>
                            <button
                                type="button"
                                                onClick={() => setWizardOpen(true)}
                                                aria-haspopup="dialog"
                                                data-testid="suite-guide"
                                                className="inline-flex items-center gap-1 rounded-[4px] border border-border px-2 py-[3px] text-[11px] leading-none text-muted-foreground hover:bg-accent"
                            >
                                                <svg viewBox="0 0 16 16" aria-hidden className="size-3" fill="none" stroke="currentColor" strokeWidth="1.4">
                                                    <path d="M8 2.5l1.2 2.6 2.8.4-2 2 .5 2.8-2.5-1.3-2.5 1.3.5-2.8-2-2 2.8-.4z" />
                                                </svg>
                                                向导
                            </button>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                            {config.productInfo.length} / {PRODUCT_IMAGE_SUITE_MAX_PRODUCT_INFO}
                        </span>
                    </div>
                </Section>

                <Section title="品牌与合规（可选）">
                                    {/* 原站是两行可展开的「行卡」（各带箭头）。本地没有品牌库/合规词库服务，
                        点开是同一份真实字段的弹层；没有库数据时给诚实空态，不禁用入口。 */}
                                    <div className="flex flex-col divide-y divide-border">
                                        <BrandComplianceRow label="智能品牌基因" summary={brandSummary} testId="suite-brand-row" open={brandOpen} onToggle={() => setBrandOpen((value) => !value)}>
                    <div className="flex flex-col gap-2">
                                                <strong className="text-[11px] font-medium leading-4 text-foreground">品牌基因设置</strong>
                                                <div className="rounded-[4px] border border-dashed border-border px-2 py-1.5 text-[11px] leading-4 text-muted-foreground">
                                                    未接入品牌库：本地没有你的品牌列表，选择结果只作用于本次生成，不会写入任何账号。
                                                </div>
                                                <Field label="启用智能品牌基因">
                                                    <input type="checkbox" aria-label="启用智能品牌基因" checked={config.brand.smartBrand} onChange={(event) => update({ brand: { ...config.brand, smartBrand: event.target.checked } })} />
                        </Field>
                                                <Field label="品牌主色">
                                <input
                                    type="color"
                                                        aria-label="品牌主色"
                                    value={config.brand.primaryColor || "#ffffff"}
                                    onChange={(event) => update({ brand: { ...config.brand, primaryColor: event.target.value } })}
                                    className="h-6 w-10 shrink-0 cursor-pointer rounded border border-border"
                                />
                                                </Field>
                                                <Field label="字体风格">
                                                    <div className="w-[130px]">
                                                        <SuiteSearchSelect
                                                            label="字体风格"
                                                            testId="suite-font-style"
                                value={config.brand.fontStyle}
                                                            placeholder="未指定"
                                                            options={SUITE_FONT_STYLES.map((style) => ({ value: style.id, label: style.label }))}
                                                            onChange={(next) => update({ brand: { ...config.brand, fontStyle: next as typeof config.brand.fontStyle } })}
                                                        />
                            </div>
                        </Field>
                                                <p className="text-[11px] leading-4 text-muted-foreground">💡未选择时按商品本身判断风格。</p>
                        </div>
                                        </BrandComplianceRow>
                                        <BrandComplianceRow label="智能合规检查" summary={complianceSummary} testId="suite-compliance-row" open={complianceOpen} onToggle={() => setComplianceOpen((value) => !value)}>
                                            <div className="flex flex-col gap-2">
                                                <strong className="text-[11px] font-medium leading-4 text-foreground">合规检查设置</strong>
                                                <Field label="敏感词库">
                                                    <div className="w-[130px]">
                                                        <SuiteSearchSelect
                                                            label="敏感词库"
                                                            testId="suite-sensitive-lexicon"
                                                            value={config.compliance.sensitiveWordLexiconId}
                                                            placeholder="未选择敏感词库"
                                                            options={SUITE_SENSITIVE_LIBRARIES.map((lexicon) => ({ value: lexicon.id, label: lexicon.label }))}
                                                            onChange={(next) => update({ compliance: { ...config.compliance, sensitiveWordLexiconId: next } })}
                                                        />
                                                    </div>
                                                </Field>
                                                <Field label="替换词库">
                                                    <div className="w-[130px]">
                                                        <SuiteSearchSelect
                                                            label="替换词库"
                                                            testId="suite-replacement-lexicon"
                                                            value={config.compliance.replacementWordLexiconId}
                                                            placeholder="未选择替换词库"
                                                            options={SUITE_REPLACEMENT_LIBRARIES.map((lexicon) => ({ value: lexicon.id, label: lexicon.label }))}
                                                            onChange={(next) => update({ compliance: { ...config.compliance, replacementWordLexiconId: next } })}
                                                        />
                                                    </div>
                                                </Field>
                                                <p className="text-[11px] leading-4 text-muted-foreground">
                                                    {sensitiveWords.length > 0 ? `通用敏感词库 ${sensitiveWords.length} 个词；未接入词库管理，词表为本地内置。` : "未选择敏感词库：本次不做敏感词替换。"}
                                                </p>
                                            </div>
                                        </BrandComplianceRow>
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
                                        {/* 原站不暴露内部模型名（报告差异 #10），这里不再显示「实际调用模型」。 */}
                        <div>
                            <p className="mb-1.5 text-[11px] text-muted-foreground">模型选择</p>
                            <div className="inline-flex h-7 items-center gap-1.5 rounded-[4px] border border-selected bg-selected-soft px-2 text-[12px] leading-none text-selected">
                                LF智能模型 G-2.5 Sunburst
                                <span className="rounded-[3px] bg-primary px-1 text-[10px] leading-[14px] text-primary-foreground">NEW</span>
                            </div>
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
                                                            config.resolution === value ? "border-selected bg-selected-soft text-selected" : "border-border text-muted-foreground hover:border-selected"
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
                                                            config.quality === quality.id ? "border-selected bg-selected-soft text-selected" : "border-border text-muted-foreground hover:border-selected"
                                        }`}
                                    >
                                        {quality.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </Section>

            <p className="mt-1 flex items-baseline gap-1.5 text-[11px] leading-4 text-muted-foreground">
                <span>生成内容</span>
                <span className="text-muted-foreground">可同时选择</span>
            </p>

                                <Section title="A+图设置" output={aplusOutput}>
                                    <p className="mb-1 text-[11px] text-muted-foreground">生成类型（单选）</p>
                <div className="flex flex-wrap gap-1">
                                        {APLUS_MODULES.map((module) => (
                            <div
                                key={module.id}
                                                onClick={() => update({ aplusModuleId: config.aplusModuleId === module.id ? "" : module.id })}
                                className={`flex cursor-pointer items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[11px] leading-none ${
                                                    config.aplusModuleId === module.id
                                        ? "border-selected bg-selected-soft text-selected"
                                        : "border-border text-foreground/70"
                                }`}
                            >
                                <span>{module.label}{APLUS_SIZE_HINTS[module.id] ? `（${APLUS_SIZE_HINTS[module.id]}）` : ""}</span>
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
                                                    config.aplusLayoutMode === mode.id ? "border-selected bg-selected-soft text-selected" : "border-border text-muted-foreground hover:border-selected"
                            }`}
                        >
                            {mode.label}
                        </button>
                    ))}
                </div>
                                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">💡未选择排版时，将根据官方排版随机生成</p>
            </Section>

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
                                                            mainSubModuleIds: checked ? config.mainSubModuleIds.filter((id) => id !== module.id) : [...config.mainSubModuleIds, module.id],
                                                        })
                                                    }
                            className={`flex cursor-pointer items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[11px] leading-none ${
                                                        checked ? "border-selected bg-selected-soft text-selected" : "border-border text-foreground/70"
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
                <p className="mt-1.5 mb-1 text-[11px] text-muted-foreground">选择卖点图排版</p>
                <div className="flex flex-wrap gap-1">
                    {SUITE_LAYOUT_MODES.map((mode) => (
                        <button
                                                key={mode.id}
                                                type="button"
                                                data-testid={`suite-main-sub-layout-${mode.id}`}
                                                onClick={() => update({ mainSubLayoutMode: mode.id })}
                                                className={`h-6 rounded-[4px] border px-1.5 text-[11px] leading-none ${
                                                    config.mainSubLayoutMode === mode.id ? "border-selected bg-selected-soft text-selected" : "border-border text-muted-foreground hover:border-selected"
                                                }`}
                                            >
                                                {mode.label}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">💡未选择排版时，将根据官方排版随机生成</p>
                                    {/* 原站「生成比例」在主副图弹层内，不是独立区块。 */}
                                    <p className="mt-1.5 mb-1 text-[11px] text-muted-foreground">生成比例</p>
                                    <div className="flex flex-wrap gap-1">
                                        {SUITE_RATIOS.map((ratio) => (
                                            <button
                                                key={ratio.id}
                            type="button"
                                                data-testid={`suite-ratio-${ratio.id}`}
                                                onClick={() => update({ ratio: ratio.id })}
                                                className={`h-6 min-w-[38px] rounded-[4px] border text-[11px] leading-none ${
                                                    config.ratio === ratio.id ? "border-selected bg-selected-soft text-selected" : "border-border text-muted-foreground hover:border-selected"
                            }`}
                        >
                                                {ratio.label}
                        </button>
                    ))}
                </div>
                                </Section>
                </div>
                </div>
                            <div className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-card px-4 py-3" data-testid="suite-generate-summary">
                                {/* 原站价格行格式「A+图4张 * 每张50点 + 主副图4张 * 每张50点 = 400点」；
                            本仓库按 V1.0 约定不展示算力/点数，只保留同一句式的张数构成。 */}
                                <p className="mb-1.5 text-[11px] leading-4 text-muted-foreground" data-testid="suite-expected-count">
                                    A+图{aplusUnits}张 + 主副图{mainSubUnits}张 = 共 {expected} 张
                                </p>
                                <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={blocked}
                            title={issues[0]?.message}
                            onClick={() => void onGenerate()}
                            data-testid="suite-generate"
                                        className="h-8 w-full rounded-[4px] bg-primary text-[12px] font-medium leading-none text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
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
                                            className="h-8 shrink-0 rounded-[4px] border border-border px-3 text-[12px] leading-none text-muted-foreground"
                            >
                                清空
                            </button>
                        ) : null}
                    </div>
                </div>
                    </div>
                }
            >
            <div className="flex min-w-0 flex-1 flex-col">
                    {/* 原站结果区页签栏 42px：「生成结果 / 优秀案例」+ 右端「历史记录 ↗」外链（不是第三个页签）。 */}
                    <div className="flex h-[42px] shrink-0 items-center gap-4 border-b border-border px-3" role="tablist">
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
                            data-testid={`suite-tab-${id}`}
                            onClick={() => setRightTab(id)}
                                className={cn("h-[42px] text-[14px] leading-[22px] transition-colors", rightTab === id ? "border-b-2 border-foreground font-medium text-foreground" : "border-b-2 border-transparent text-muted-foreground hover:text-foreground")}
                        >
                            {label}
                        </button>
                    ))}
                        {/* 本地 /tools 下没有独立历史页，这里只保留原站式入口位并如实说明，不伪造可点跳转。 */}
                        <span data-testid="suite-tab-history-link" title="本地未接入历史记录页；任务记录在页面底部「历史任务」" className="ml-auto inline-flex items-center gap-1 text-[12px] leading-none text-foreground/50">
                            <History className="size-3" aria-hidden />
                            历史记录
                        </span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                {PRODUCT_SUITE_CASES.length > 0 ? (
                    <div role="tabpanel" hidden={rightTab !== "cases"} data-testid="suite-panel-cases" className="flex h-full flex-col">
                        <h2 className="mb-2 text-sm font-medium">优秀案例</h2>
                                <ToolCases cases={PRODUCT_SUITE_CASES} onApply={applyCase} applyingId={applyingCaseId} />
                    </div>
                ) : null}
                <div role="tabpanel" hidden={rightTab !== "result"} data-testid="suite-panel-result" className="flex min-h-full flex-col gap-3">
                            {/* 原站结果区顶部无公告条（2026-11-02 只读对照），本地不再自造。 */}

                            {/* 原站结果区没有常驻的黄色校验横幅：校验原因只在按钮 title 与这行弱提示里出现。 */}
                            {runError ? <div className="rounded-[4px] border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] leading-4 text-amber-700 dark:text-amber-300">{runError}</div> : null}
                            {!runError && source && issues.length ? (
                                <p className="text-[11px] leading-4 text-muted-foreground" data-testid="suite-result-hints">
                                    {issues.map((issue) => issue.message).join(" ")}
                                </p>
            ) : null}

                            {stale && units.length ? <p className="text-[11px] text-amber-600 dark:text-amber-400">配置已变更，下方结果来自旧版本；重新生成可更新。</p> : null}

            {units.length ? (
                <div className="flex flex-col gap-3">
                    <p className="text-[11px] text-muted-foreground">
                        共 {summary.total} 张 · 成功 {summary.succeeded} · 失败 {summary.failed} · 待定 {summary.pending}
                    </p>
                    {groupSuiteUnits(units).map((group) => (
                        <div key={group.moduleId} className="rounded-lg border border-border p-3">
                            <h4 className="mb-2 text-xs font-medium text-foreground/70">
                                {group.label}（{group.succeeded}/{group.total}）
                            </h4>
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {group.units.map((unit) => (
                                    <article key={unit.unitId} className="rounded-md border border-border p-2">
                                        <header className="mb-1 flex items-center justify-between gap-2">
                                            <span className="text-[11px] text-foreground/70">{unit.label}</span>
                                            <span className={`text-[11px] ${unit.status === "failed" ? "text-destructive" : unit.status === "succeeded" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
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
                                                                                <div className="flex size-16 items-center justify-center rounded border border-dashed border-border text-center text-[10px] text-muted-foreground">已入库</div>
                                                            )}
                                                            <div className="flex flex-wrap gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void onSave(item, unit, itemIndex)}
                                                                    className="rounded border border-border px-2 py-0.5 text-[11px] text-foreground/70"
                                                                >
                                                                    {savedKeys[key] ? "已存作品库" : "保存"}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void onSendToCanvas(item, unit)}
                                                                    className="rounded border border-border px-2 py-0.5 text-[11px] text-foreground/70"
                                                                >
                                                                    {canvasKeys[key] ? "已发送画布" : "发送画布"}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void onDownload(item, itemIndex)}
                                                                    className="rounded border border-border px-2 py-0.5 text-[11px] text-foreground/70"
                                                                >
                                                                    下载
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-[11px] text-muted-foreground">{unit.error?.message ?? (unit.status === "pending" ? "上游结果未知，稍后重试可查询。" : "暂无内容")}</p>
                                        )}
                                        {unit.status === "failed" ? (
                                            <button
                                                type="button"
                                                disabled={busyUnit === unit.unitId}
                                                onClick={() => void onRetryUnit(unit)}
                                                className="mt-2 rounded border border-border px-2 py-0.5 text-[11px] text-foreground/70 disabled:opacity-40"
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

            {seeded ? null : <p className="text-[11px] text-muted-foreground">正在读取草稿…</p>}
                            {units.length === 0 && !running ? (
                                /* 原站空态：958 宽案例轮播（上传商品图 → 生成结果 → 一键做同款），前 3 个案例。 */
                                <div className="flex flex-1 items-center justify-center py-4">
                                    <ToolCaseGuide
                                        cases={PRODUCT_SUITE_CASES.slice(0, 3).map((item) => ({ ...item, params: item.params.map((param) => ({ ...param, label: "上传商品图" })) }))}
                                        onApply={applyCase}
                                        applyingId={applyingCaseId}
                                    />
                                </div>
                            ) : null}
                </div>
                </div>
            </div>
            </ToolWorkspaceColumns>
            <SuiteWizardDialog open={wizardOpen} onClose={() => setWizardOpen(false)} onApply={applyWizard} />
            {productLibOpen ? <SuiteEmptyLibraryDialog title="从商品库选择" body="本地没有商品库数据（未接入商品库接口），可用「从本地上传」或「从作品库选择」。" onClose={() => setProductLibOpen(false)} /> : null}
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
    /* 真实作品库：原站「从作品库选择」可用；本地只在真有资产时给出可选条目，空库不伪造。 */
    const assets = useAssetStore((state) => state.assets);
    const library = useMemo(() => toolAssetLibraryItemsFromAssets(assets.filter((asset): asset is ImageAsset | VideoAsset => asset.kind === "image" || asset.kind === "video")), [assets]);

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
    const [rightTab, setRightTab] = useState<"result" | "cases">("result");
    const [advancedOpen, setAdvancedOpen] = useState(false);
    /* 向导弹窗与商品库诚实空态（与套图同一套本地组件，不新增后端）。 */
    const [wizardOpen, setWizardOpen] = useState(false);
    const [productLibOpen, setProductLibOpen] = useState(false);
    const [brandOpen, setBrandOpen] = useState(false);
    const [complianceOpen, setComplianceOpen] = useState(false);

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

    /* 品牌与合规行卡摘要：只回显真实已选值。 */
    const marketBrandSummary = [config.brandName, config.brandDna.primaryColor, MARKET_FONT_STYLES.find((style) => style.id === config.brandDna.fontStyle)?.label].filter(Boolean).join(" · ") || "未启用";
    const marketComplianceSummary =
        [config.sensitiveLibraryId, config.replacementLibraryId]
            .map((id) => MARKET_SENSITIVE_LIBRARIES.find((lexicon) => lexicon.id === id)?.label ?? MARKET_REPLACEMENT_LIBRARIES.find((lexicon) => lexicon.id === id)?.label)
            .filter(Boolean)
            .join(" · ") || "未选择词库";

    /* 向导（营销素材）：与套图共用同一套弹窗与文案拼装，只写入本页商品信息。 */
    const applyMarketWizard = useCallback(
        (draftInfo: SuiteWizardDraft) => {
            const next = composeSuiteProductInfo(draftInfo, marketConfigRef.current.productInfo);
            if (next === marketConfigRef.current.productInfo) return;
            update({ productInfo: next.slice(0, MARKET_PRODUCT_INFO_MAX_LENGTH) });
        },
        [update],
    );

    const provider = resolveProviderCode(config, imageModel);
    const readyCount = sources.filter((source) => isMarketSourceReady(source)).length;
    const issues = useMemo(() => validateMarketConfig(config, { sourceReadyCount: readyCount, imageModelReady: Boolean(imageModel?.trim()) }), [config, readyCount, imageModel]);
    const plans = useMemo(() => buildMarketPlan(config), [config]);
    const expected = marketExpectedCount(config);
    const summary = summarizeMarketRun(units);
    const stale = snapshot ? marketResultsStale({ snapshot }, config, { images: config.sourceAssetIds, provider }) : false;
    /* A+ 每模板 aplusCount 张；主副图每模块 1 张。 */
    const aplusUnits = plans.filter((plan) => plan.width > 0 && plan.height > 0).reduce((total, plan) => total + plan.count, 0);
    const mainSubUnits = plans.filter((plan) => plan.width === 0 && plan.height === 0).reduce((total, plan) => total + plan.count, 0);

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
    const marketingRatios = availableMarketingRatios(config.provider);

    return (
        <div className={cn("flex h-full min-h-0 flex-col bg-background", className)} data-tool="product-market-material" data-layout="linkfox-two-pane">
            <ToolWorkspaceColumns
                className="min-h-0 flex-1"
                config={
                <div className="flex h-full min-h-0 flex-col">
                        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-1 pt-1">
                        <div className="grid auto-rows-max grid-cols-1 gap-1.5">
                            <Section title="多视角白底商品&实拍图">
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
                                        uploadLabel="从本地上传"
                                        library={library}
                                        thirdAction={
                                            <button
                                                type="button"
                                                data-testid="market-products-entry"
                                                onClick={() => setProductLibOpen(true)}
                                                className="h-6 w-[100px] rounded-md border border-border bg-card text-xs leading-none text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
                                            >
                                                从商品库选择
                                            </button>
                                        }
                                        hint={`最多上传${MARKET_UPLOAD_LIMITS.maxFiles}张图，10M以内，${MARKET_UPLOAD_LIMITS.minSide}*${MARKET_UPLOAD_LIMITS.minSide}~${MARKET_UPLOAD_LIMITS.maxSide}*${MARKET_UPLOAD_LIMITS.maxSide}，最大宽高比${MARKET_UPLOAD_LIMITS.maxAspectRatio}`}
                                    onChange={onSourcesChange}
                                />
                                {sources.length ? (
                                    <div className="mt-1.5 flex flex-wrap gap-2">
                                        {sources.map((source, index) => (
                                            <label key={source.assetId} className="flex items-center gap-1 text-[11px] text-foreground">
                                                    <input type="radio" name="market-cover" checked={config.coverList[0] === source.assetId} onChange={() => update({ coverList: [source.assetId] })} />
                                                {index === 0 ? "主图" : `图 ${index + 1}`}
                                            </label>
                                        ))}
                                    </div>
                                ) : null}
                                {sourceIssue ? <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">{sourceIssue.message}</p> : null}
                            </Section>

                                <Section title="商品类目">
                                    <SuiteSearchSelect
                                        label="商品类目"
                                        testId="market-category"
                                        value={config.productCategory}
                                        placeholder="请选择商品类目"
                                        emptyHint="没有匹配的类目"
                                        options={MARKET_PRODUCT_CATEGORIES.map((category) => ({ value: category.id, label: category.label }))}
                                        onChange={(next) => update({ productCategory: next })}
                                    />
                                </Section>

                            <Section title="商品信息">
                                    <textarea
                                        value={config.productInfo}
                                        onChange={(event) => update({ productInfo: event.target.value.slice(0, MARKET_PRODUCT_INFO_MAX_LENGTH) })}
                                        rows={5}
                                        placeholder="商品信息包含商品卖点、使用方式、销售地区、发布平台等，生图效果将会更好"
                                        className="w-full resize-y rounded-md border border-border bg-background p-2 text-xs text-foreground outline-none focus:border-primary"
                                    />
                                    <div className="mt-1.5 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                                /* 原站未上传商品图时 AI分析 为禁用态。 */
                                                disabled={sources.length === 0}
                                                title={sources.length === 0 ? "上传商品图后可分析" : undefined}
                                                onClick={() => update({ productInfo: analyzeMarketProductInfo(config.productInfo) })}
                                                data-testid="market-ai-analyze"
                                                className="rounded-[4px] border border-border px-2 py-[3px] text-[11px] leading-none text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                                AI分析
                                        </button>
                                        <button
                                            type="button"
                                                aria-haspopup="dialog"
                                                onClick={() => setWizardOpen(true)}
                                                data-testid="market-guide"
                                                className="inline-flex items-center gap-1 rounded-[4px] border border-border px-2 py-[3px] text-[11px] leading-none text-muted-foreground hover:bg-accent"
                                        >
                                                <svg viewBox="0 0 16 16" aria-hidden className="size-3" fill="none" stroke="currentColor" strokeWidth="1.4">
                                                    <path d="M8 2.5l1.2 2.6 2.8.4-2 2 .5 2.8-2.5-1.3-2.5 1.3.5-2.8-2-2 2.8-.4z" />
                                                </svg>
                                                向导
                                        </button>
                                    </div>
                                    <span className="text-[11px] text-muted-foreground">
                                        {config.productInfo.length} / {MARKET_PRODUCT_INFO_MAX_LENGTH}
                                    </span>
                                </div>
                            </Section>

                            <Section title="品牌与合规（可选）">
                                    {/* 与原站同构：两行可展开行卡；品牌库/词库管理未接入时在弹层内如实说明。 */}
                                    <div className="mb-1 flex justify-end">
                                        <button
                                            type="button"
                                            aria-label="高级设置（项目与品牌名称、平台、销售地区、输出语言、A+ 画幅）"
                                            aria-expanded={advancedOpen}
                                            data-testid="market-advanced-toggle"
                                            onClick={() => setAdvancedOpen((value) => !value)}
                                            className="rounded-[4px] border border-border p-1 text-muted-foreground hover:bg-accent"
                                        >
                                            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4">
                                                <circle cx="8" cy="8" r="2.2" />
                                                <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" />
                                            </svg>
                                        </button>
                                    </div>
                                    <div className="flex flex-col divide-y divide-border">
                                        <BrandComplianceRow label="智能品牌基因" summary={marketBrandSummary} testId="market-brand-row" open={brandOpen} onToggle={() => setBrandOpen((value) => !value)}>
                                            <div className="flex flex-col gap-2">
                                                <strong className="text-[11px] font-medium leading-4 text-foreground">品牌基因设置</strong>
                                                <div className="rounded-[4px] border border-dashed border-border px-2 py-1.5 text-[11px] leading-4 text-muted-foreground">
                                                    未接入品牌库：本地没有你的品牌列表，选择结果只作用于本次生成，不会写入任何账号。
                                                </div>
                                                <Field label="品牌名称">
                                                    <input className={`${inputClass} w-[130px]`} value={config.brandName} onChange={(event) => update({ brandName: event.target.value })} placeholder="本次生成的品牌名" />
                                                </Field>
                                                <Field label="品牌主色">
                                            <input
                                                type="color"
                                                aria-label="智能主色"
                                                value={config.brandDna.primaryColor || "#ffffff"}
                                                onChange={(event) => update({ brandDna: { ...config.brandDna, primaryColor: event.target.value } })}
                                                className="h-6 w-10 shrink-0 cursor-pointer rounded border border-border"
                                            />
                                                </Field>
                                                <Field label="字体风格">
                                                    <div className="w-[130px]">
                                                        <SuiteSearchSelect
                                                            label="字体风格"
                                                            testId="market-font-style"
                                                value={config.brandDna.fontStyle}
                                                            placeholder="跟随品牌"
                                                            options={MARKET_FONT_STYLES.map((style) => ({ value: style.id, label: style.label }))}
                                                            onChange={(next) => update({ brandDna: { ...config.brandDna, fontStyle: next as MarketConfig["brandDna"]["fontStyle"] } })}
                                                        />
                                        </div>
                                    </Field>
                                            </div>
                                        </BrandComplianceRow>
                                        <BrandComplianceRow label="智能合规检查" summary={marketComplianceSummary} testId="market-compliance-row" open={complianceOpen} onToggle={() => setComplianceOpen((value) => !value)}>
                                            <div className="flex flex-col gap-2">
                                                <strong className="text-[11px] font-medium leading-4 text-foreground">合规检查设置</strong>
                                                <Field label="敏感词库">
                                                    <div className="w-[130px]">
                                                        <SuiteSearchSelect
                                                            label="敏感词库"
                                                            testId="market-sensitive-lexicon"
                                                            value={config.sensitiveLibraryId}
                                                            placeholder="未选择敏感词库"
                                                            options={MARKET_SENSITIVE_LIBRARIES.map((lexicon) => ({ value: lexicon.id, label: lexicon.label }))}
                                                            onChange={(next) => update({ sensitiveLibraryId: next })}
                                                        />
                                                    </div>
                                                </Field>
                                                <Field label="替换词库">
                                                    <div className="w-[130px]">
                                                        <SuiteSearchSelect
                                                            label="替换词库"
                                                            testId="market-replacement-lexicon"
                                                            value={config.replacementLibraryId}
                                                            placeholder="未选择替换词库"
                                                            options={MARKET_REPLACEMENT_LIBRARIES.map((lexicon) => ({ value: lexicon.id, label: lexicon.label }))}
                                                            onChange={(next) => update({ replacementLibraryId: next })}
                                                        />
                                                    </div>
                                                </Field>
                                                <p className="text-[11px] leading-4 text-muted-foreground">
                                                    {marketSensitiveLibraryOf(config.sensitiveLibraryId) || marketReplacementLibraryOf(config.replacementLibraryId)
                                                        ? "已选词库将随任务快照提交；未接入词库管理，词表为本地内置。"
                                                        : "未选择词库：本次不做敏感词替换。"}
                                                </p>
                                            </div>
                                        </BrandComplianceRow>
                                    </div>
                                    {advancedOpen ? (
                                        <div data-testid="market-advanced-fields" className="flex flex-col gap-2 rounded-[6px] border border-border p-2">
                                            <Field label="项目名称">
                                                <input className={`${inputClass} w-full`} value={config.projectName} placeholder="用于资产命名" onChange={(event) => update({ projectName: event.target.value })} />
                                            </Field>
                                            <Field label="品牌名称">
                                                <input className={`${inputClass} w-full`} value={config.brandName} onChange={(event) => update({ brandName: event.target.value })} />
                                            </Field>
                                            <div className="flex flex-wrap gap-1">
                                                {MARKET_PLATFORMS.map((platform) => (
                                                    <button
                                                        key={platform.id}
                                                        type="button"
                                                        onClick={() => update({ platform: platform.id })}
                                                        className={`rounded border px-2 py-0.5 text-[11px] ${config.platform === platform.id ? "border-selected bg-selected-soft text-selected" : "border-border text-foreground"}`}
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
                                                <select className={inputClass} value={config.language} onChange={(event) => update({ language: event.target.value as MarketConfig["language"] })}>
                                                    {MARKET_LANGUAGES.map((language) => (
                                                        <option key={language.id} value={language.id}>
                                                            {language.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </Field>
                                            <Field label="A+ 画幅">
                                                <select className={inputClass} value={config.aplusAspectRatio} onChange={(event) => update({ aplusAspectRatio: event.target.value })}>
                                                    {aplusRatiosForPlatform(config.platform).map((ratio) => (
                                                        <option key={ratio.id} value={ratio.id}>
                                                            {ratio.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </Field>
                                        </div>
                                    ) : null}
                            </Section>

                            <Section title="模型选择">
                                <div className="flex flex-col gap-2.5">
                                        {/* 原站不暴露内部模型名，只显示「LF智能模型 G-2.5 Sunburst」+ 分辨率/品质摘要。 */}
                                    <div className="flex items-center justify-between rounded-[6px] border border-border px-2 py-[6px]">
                                        <span className="text-[12px] leading-none text-foreground">LF智能模型 G-2.5 Sunburst</span>
                                        <span className="text-[10px] leading-none text-muted-foreground">
                                                {config.resolution} · {MARKET_QUALITIES.find((quality) => quality.id === config.quality)?.label ?? ""}
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
                                                            config.resolution === value ? "border-selected bg-selected-soft text-selected" : "border-border text-muted-foreground hover:border-selected"
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
                                                            config.quality === quality.id ? "border-selected bg-selected-soft text-selected" : "border-border text-muted-foreground hover:border-selected"
                                                    }`}
                                                >
                                                    {quality.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </Section>

                                <Section title="A+图设置" hint={aplusEnabled ? "A+ 模板可多选，按模块分组输出" : "该平台无 A+ 模块"}>
                                    <p className="mb-1 text-[11px] text-muted-foreground">生成类型（可多选）</p>
                                <div className="flex flex-wrap gap-1">
                                    {MARKET_APLUS_TEMPLATES.map((template) => {
                                        const active = config.aplusTemplateIds.includes(template.id);
                                            const lastActive = active && config.aplusTemplateIds.length === 1;
                                        return (
                                                <button
                                                key={template.id}
                                                    type="button"
                                                    disabled={!aplusEnabled || running}
                                                    aria-pressed={active}
                                                    aria-disabled={!aplusEnabled || lastActive}
                                                    data-testid={`market-aplus-template-${template.id}`}
                                                    title={lastActive ? "至少保留一个 A+ 模板" : template.instruction}
                                                    onClick={() => {
                                                        if (lastActive) return;
                                                    update({
                                                            aplusTemplateIds: active ? config.aplusTemplateIds.filter((id) => id !== template.id) : [...config.aplusTemplateIds, template.id],
                                                        });
                                                    }}
                                                    className={`rounded-[4px] border px-1.5 py-0.5 text-[11px] leading-none disabled:opacity-40 ${
                                                        active ? "border-selected bg-selected-soft text-selected" : "border-border text-foreground/70"
                                                    } ${lastActive ? "cursor-not-allowed" : ""}`}
                                            >
                                                    {template.label}
                                                </button>
                                            );
                                        })}
                                                <button
                                                    type="button"
                                                    title="每模块张数"
                                            aria-label="A+ 每模块张数"
                                            disabled={!aplusEnabled || running}
                                            onClick={() => update({ aplusCount: config.aplusCount >= MARKET_MAX_MODULE_COUNT ? 1 : config.aplusCount + 1 })}
                                            className="rounded-[4px] border border-border px-1.5 py-0.5 text-[11px] leading-none text-foreground/70 disabled:opacity-40"
                                                >
                                            每模块 {config.aplusCount} 张
                                                </button>
                                            </div>
                                    {aplusEnabled && config.aplusTemplateIds.length === 1 ? <p className="mt-1 text-[11px] text-muted-foreground">至少保留一个 A+ 模板</p> : null}
                                    <p className="mt-1.5 mb-1 text-[11px] text-muted-foreground">A+ 画幅（按平台过滤）</p>
                                    <div className="flex flex-wrap gap-1">
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
                                                className={`h-6 rounded-[4px] border px-1.5 text-[11px] leading-none disabled:opacity-40 ${
                                                    config.aplusAspectRatio === ratio.id ? "border-selected bg-selected-soft text-selected" : "border-border text-muted-foreground hover:border-selected"
                                                }`}
                                            >
                                                {ratio.label}
                                            </button>
                                        ))}
                                    </div>
                                    {!aplusEnabled ? <p className="mt-1 text-[11px] text-muted-foreground">切换回亚马逊后可选择 A+ 比例。</p> : null}
                                    {aplusEnabled && config.aplusAspectRatio === "custom" ? (
                                        <div className="mt-1.5 flex items-center gap-2">
                                            <input
                                                type="number"
                                                aria-label="A+ 自定比例宽"
                                                className={`${inputClass} w-20`}
                                                value={config.customWidth || ""}
                                                onChange={(event) => update({ customWidth: Number(event.target.value) || 0 })}
                                                placeholder="宽 px"
                                            />
                                            <span className="text-[11px] text-muted-foreground">×</span>
                                            <input
                                                type="number"
                                                aria-label="A+ 自定比例高"
                                                className={`${inputClass} w-20`}
                                                value={config.customHeight || ""}
                                                onChange={(event) => update({ customHeight: Number(event.target.value) || 0 })}
                                                placeholder="高 px"
                                            />
                                </div>
                                    ) : null}
                                <p className="mt-1.5 mb-1 text-[11px] text-muted-foreground">选择排版</p>
                                <div className="flex flex-wrap gap-1">
                                    {MARKET_LAYOUT_MODES.map((mode) => (
                                        <button
                                            key={mode.id}
                                            type="button"
                                            data-testid={`market-layout-${mode.id}`}
                                            onClick={() => update({ layoutMode: mode.id })}
                                            className={`h-6 rounded-[4px] border px-1.5 text-[11px] leading-none ${
                                                    config.layoutMode === mode.id ? "border-selected bg-selected-soft text-selected" : "border-border text-muted-foreground hover:border-selected"
                                            }`}
                                        >
                                            {mode.label}
                                        </button>
                                    ))}
                                </div>
                                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">💡未选择排版时，将根据官方排版随机生成</p>
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
                                                            marketingModuleIds: checked ? config.marketingModuleIds.filter((id) => id !== module.id) : [...config.marketingModuleIds, module.id],
                                                    })
                                                }
                                                className={`flex cursor-pointer items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[11px] leading-none ${
                                                        checked ? "border-selected bg-selected-soft text-selected" : "border-border text-foreground/70"
                                                }`}
                                            >
                                                <span>{module.label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className="mt-1.5 mb-1 text-[11px] text-muted-foreground">生成比例</p>
                                <div className="flex flex-wrap gap-1">
                                        {marketingRatios.map((ratio) => (
                                        <button
                                                key={ratio}
                                            type="button"
                                                data-testid={`market-ratio-${ratio}`}
                                                onClick={() => update({ aspectRatio: ratio, isCustomAspectRatio: false, customWidth: 0, customHeight: 0 })}
                                            className={`h-6 min-w-[38px] rounded-[4px] border text-[11px] leading-none ${
                                                    !config.isCustomAspectRatio && config.aspectRatio === ratio ? "border-selected bg-selected-soft text-selected" : "border-border text-muted-foreground hover:border-selected"
                                            }`}
                                        >
                                                {ratio}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                            data-testid="market-ratio-custom"
                                            aria-pressed={config.isCustomAspectRatio}
                                            onClick={() => update({ isCustomAspectRatio: !config.isCustomAspectRatio })}
                                            className={`h-6 rounded-[4px] border px-1.5 text-[11px] leading-none ${config.isCustomAspectRatio ? "border-selected bg-selected-soft text-selected" : "border-border text-muted-foreground hover:border-selected"}`}
                                    >
                                            自定义画幅
                                    </button>
                                </div>
                                    {config.isCustomAspectRatio ? (
                                        <div className="mt-1.5 flex items-center gap-2">
                                            <input
                                                type="number"
                                                aria-label="自定义画幅宽"
                                                className={`${inputClass} w-20`}
                                                value={config.customWidth || ""}
                                                onChange={(event) => update({ customWidth: Number(event.target.value) || 0 })}
                                                placeholder="宽 px"
                                            />
                                            <span className="text-[11px] text-muted-foreground">×</span>
                                            <input
                                                type="number"
                                                aria-label="自定义画幅高"
                                                className={`${inputClass} w-20`}
                                                value={config.customHeight || ""}
                                                onChange={(event) => update({ customHeight: Number(event.target.value) || 0 })}
                                                placeholder="高 px"
                                            />
                                            {config.customWidth > 0 && config.customWidth < 64 ? <span className="text-[11px] text-amber-600 dark:text-amber-400">宽高至少 64px</span> : null}
                                        </div>
                                    ) : null}
                            </Section>
                        </div>
                    </div>
                        <div className="shrink-0 border-t border-border px-4 py-3" data-testid="market-generate-summary">
                            <p className="mb-1.5 text-[11px] leading-4 text-muted-foreground" data-testid="market-expected-count">
                                预计生成 {expected} 张{aplusUnits > 0 ? `（A+ ${aplusUnits} 张 · 营销图 ${mainSubUnits} 张）` : ""}
                            </p>
                            <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={blocked}
                                title={issues[0]?.message}
                                onClick={() => void onGenerate()}
                                data-testid="market-generate"
                                    className="h-8 w-full rounded-[4px] bg-primary text-[12px] font-medium leading-none text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
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
                                    className="h-8 rounded-[4px] border border-border px-3 text-[12px] leading-none text-muted-foreground"
                                >
                                    清空
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>
                }
            >
                <div className="flex min-w-0 flex-1 flex-col">
                    {/* 原站该页同样只有「生成结果 / 优秀案例」两个页签 + 右端「历史记录 ↗」外链。 */}
                    <div className="flex h-[42px] shrink-0 items-center gap-4 border-b border-border px-3" role="tablist">
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
                                data-testid={`market-tab-${id}`}
                                onClick={() => setRightTab(id)}
                                className={cn("h-[42px] text-[14px] leading-[22px] transition-colors", rightTab === id ? "border-b-2 border-foreground font-medium text-foreground" : "border-b-2 border-transparent text-muted-foreground hover:text-foreground")}
                            >
                                {label}
                            </button>
                        ))}
                        <span data-testid="market-tab-history-link" title="本地未接入历史记录页；任务记录在页面底部「历史任务」" className="ml-auto text-[12px] leading-none text-muted-foreground">
                            历史记录 ↗
                        </span>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                        <div role="tabpanel" hidden={rightTab !== "cases"} data-testid="market-panel-cases">
                            <p className="text-[11px] text-muted-foreground">暂无优秀案例</p>
                        </div>
                        <div role="tabpanel" hidden={rightTab !== "result"} data-testid="market-panel-result" className="flex flex-col gap-3">
                            <p className="text-[11px] text-muted-foreground">生成结果</p>
                            {/* 同套图：原站结果区无常驻校验横幅，校验原因只在按钮 title 与这行弱提示里。 */}
                            {runError ? <div className="rounded-[4px] border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] leading-4 text-amber-700 dark:text-amber-300">{runError}</div> : null}
                            {!runError && issues.length ? (
                                <p className="text-[11px] leading-4 text-muted-foreground" data-testid="market-result-hints">
                                    {issues.map((issue) => issue.message).join(" ")}
                                </p>
                            ) : null}
                            {stale && units.length ? <p className="text-[11px] text-amber-600 dark:text-amber-400">配置已变更，下方结果来自旧版本；重新生成可更新。</p> : null}
                            {units.length ? (
                                <div className="flex flex-col gap-3">
                                    <p className="text-[11px] text-muted-foreground">
                                        共 {summary.total} 张 · 成功 {summary.succeeded} · 失败 {summary.failed} · 待定 {summary.pending}
                                    </p>
                                    {groupMarketUnits(units).map((group) => (
                                        <div key={group.moduleId} className="rounded-lg border border-border p-3">
                                            <h4 className="mb-2 text-xs font-medium text-foreground/70">
                                                {group.label}（{group.succeeded}/{group.total}）
                                            </h4>
                                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                                {group.units.map((unit) => (
                                                    <article key={unit.unitId} className="rounded-md border border-border p-2">
                                                        <p className="mb-1 text-[11px] text-foreground/70">
                                                            {unit.label} · {unit.width > 0 ? `${unit.width}×${unit.height}` : config.isCustomAspectRatio ? `${config.customWidth}×${config.customHeight}` : config.aspectRatio}
                                                        </p>
                                                        {unit.items.length ? (
                                                            <div className="flex flex-col gap-1">
                                                                {unit.items.map((item, itemIndex) => {
                                                                    const key = `${unit.unitId}:${item.id}`;
                                                                    const src = item.dataUrl ?? item.url;
                                                                    return (
                                                                        <div key={item.id} className="flex flex-col gap-1">
                                                                            {src ? (
                                                                                <img src={src} alt={unit.label} className="h-24 w-full rounded object-cover" />
                                                                            ) : (
                                                                                <div className="flex h-24 items-center justify-center rounded border border-dashed border-border text-center text-[10px] text-muted-foreground">
                                                                                    结果已被持久化策略剥离
                                                                                </div>
                                                                            )}
                                                                            <div className="flex flex-wrap gap-1">
                                                                                <button
                                                                                    type="button"
                                                                                    disabled={busyUnit === unit.unitId}
                                                                                    onClick={() => void onSaveItem(unit, item)}
                                                                                    data-testid={`market-save-${key}`}
                                                                                    className="rounded border border-border px-2 py-0.5 text-[11px] text-foreground/70 disabled:opacity-40"
                                                                                >
                                                                                    {savedKeys[key] ? "已存资产库" : "存入资产库"}
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    disabled={busyUnit === unit.unitId}
                                                                                    onClick={() => void onSendItemToCanvas(unit, item)}
                                                                                    data-testid={`market-canvas-${key}`}
                                                                                    className="rounded border border-border px-2 py-0.5 text-[11px] text-foreground/70 disabled:opacity-40"
                                                                                >
                                                                                    {canvasKeys[key] ? "已发送画布" : "发送画布"}
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    disabled={busyUnit === unit.unitId || item.payloadDropped || !(item.dataUrl ?? item.url)}
                                                                                    onClick={() => void onDownloadItem(unit, item, itemIndex)}
                                                                                    data-testid={`market-download-${key}`}
                                                                                    className="rounded border border-border px-2 py-0.5 text-[11px] text-foreground/70 disabled:opacity-40"
                                                                                >
                                                                                    下载
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <p className="text-[11px] text-muted-foreground">{unit.error?.message ?? (unit.status === "pending" ? "上游结果未知，稍后重试可查询。" : "暂无内容")}</p>
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
                                <p className="text-[11px] text-muted-foreground">上传商品图</p>
                            )}
                        </div>
                        {seeded ? null : <p className="text-[11px] text-muted-foreground">正在读取草稿…</p>}
                        {units.length === 0 && seeded && !running ? <p className="text-[11px] leading-4 text-muted-foreground">还没有生成结果：上传商品多图并选择营销模块后，点「开始生成」。</p> : null}
                    </div>
                </div>
            </ToolWorkspaceColumns>
            <SuiteWizardDialog open={wizardOpen} onClose={() => setWizardOpen(false)} onApply={applyMarketWizard} />
            {productLibOpen ? <SuiteEmptyLibraryDialog title="从商品库选择" body="本地没有商品库数据（未接入商品库接口），可用「从本地上传」或「从作品库选择」。" onClose={() => setProductLibOpen(false)} /> : null}
        </div>
    );
}

/** AI分析：把已有商品信息按「卖点 / 材质 / 场景 / 规格」重新归并，未识别项留空待补。 */
function analyzeMarketProductInfo(current: string): string {
    const source = current.trim();
    if (!source) return "";
    const segments = source
        .split(/[，,。;；\n]+/)
        .map((segment) => segment.trim())
        .filter(Boolean);
    const materialWords = ["棉", "麻", "真丝", "涤纶", "羊毛", "皮革", "不锈钢", "铝合金", "玻璃", "陶瓷", "竹", "木", "ABS", "硅胶"];
    const sceneWords = ["家用", "户外", "办公", "厨房", "旅行", "露营", "运动", "母婴", "车载", "礼物"];
    const material = segments.filter((segment) => materialWords.some((word) => segment.includes(word)));
    const scene = segments.filter((segment) => sceneWords.some((word) => segment.includes(word)));
    const spec = segments.filter((segment) => /\d/.test(segment) && /(cm|mm|ml|g|kg|寸|升|个|片|色)/i.test(segment));
    const used = new Set([...material, ...scene, ...spec]);
    const selling = segments.filter((segment) => !used.has(segment)).slice(0, 5);
    const block = (title: string, lines: string[]) => `${title}\n${lines.length ? lines.join("；") : "待补充"}`;
    return [block("【卖点】", selling), block("【材质 / 工艺】", material), block("【适用场景】", scene), block("【规格尺寸】", spec)].join("\n").slice(0, MARKET_PRODUCT_INFO_MAX_LENGTH);
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
