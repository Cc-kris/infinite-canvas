import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Link2, Loader2, Minus, Plus } from "lucide-react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import { cn } from "@/lib/utils";
import { assetRecordToReference } from "@/features/tools/adapters/change-color-v2";
import {
    DEFAULT_LISTING_FISSION_VALUES,
    LISTING_FISSION_APLUS_TYPES,
    LISTING_FISSION_DELIVERIES,
    LISTING_FISSION_STEPPER,
    LISTING_FISSION_TOOL_ID,
    generatesAplus,
    planListingFission,
    readListingFissionValues,
    summarizeListingFission,
    type ListingFissionValues,
} from "@/features/tools/registry/listing-fission";
import type { ToolAssetRecord } from "@/services/api/tools/assets";
import { parseEcommerceProductLink } from "@/services/api/tools/content-analysis";
import { resolveModelChannel, selectableModelsByCapability, useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";

const toolId = LISTING_FISSION_TOOL_ID;

/** 原站 It：1～10 步进器。 */
function Stepper({ value, onChange, disabled, testId }: { value: number; onChange: (value: number) => void; disabled?: boolean; testId: string }) {
    const button = "flex size-7 items-center justify-center rounded-[6px] text-foreground/70 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30";
    return (
        <div data-testid={testId} className="inline-flex items-center gap-1 rounded-[8px] border border-border bg-background p-0.5">
            <button type="button" aria-label="减少" className={button} disabled={disabled || value <= LISTING_FISSION_STEPPER.min} onClick={() => onChange(value - 1)}>
                <Minus className="size-3.5" />
            </button>
            <span className="w-6 text-center text-[14px] text-foreground">{value}</span>
            <button type="button" aria-label="增加" className={button} disabled={disabled || value >= LISTING_FISSION_STEPPER.max} onClick={() => onChange(value + 1)}>
                <Plus className="size-3.5" />
            </button>
        </div>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="mt-5">
            <div className="mb-3 flex items-center gap-2">
                <span className="h-3.5 w-1 rounded-full bg-primary" />
                <span className="text-[15px] font-medium text-foreground">{title}</span>
            </div>
            {children}
        </section>
    );
}

function Thumbs({ records, selected, onToggle, testId }: { records: ToolAssetRecord[]; selected: Set<string>; onToggle: (id: string) => void; testId: string }) {
    return (
        <div data-testid={testId} className="flex flex-wrap gap-2">
            {records.map((record) => (
                <button key={record.id} type="button" aria-pressed={selected.has(record.id)} onClick={() => onToggle(record.id)} className={cn("relative size-16 overflow-hidden rounded-[6px] border-2 bg-background", selected.has(record.id) ? "border-selected" : "border-transparent hover:border-selected")}>
                    <img src={record.url} alt="" className="h-full w-full object-cover" />
                    {selected.has(record.id) ? (
                        <span className="absolute right-0 top-0 flex size-4 items-center justify-center rounded-bl-[6px] bg-selected text-white">
                            <Check className="size-3" />
                        </span>
                    ) : null}
                </button>
            ))}
        </div>
    );
}

const toggleIn = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
};

/**
 * 链接裂变（FISSION_LINK）。原站是自有 Listing 卡片上的「链接裂变」弹窗（rea 还原 LinkCard chunk）；
 * 本地没有 Listing 库，左侧上传来源主副图 / A+，右侧按原站弹窗分区设置并生成。只生成图片，不生成新文案。
 */
export function ListingFissionWorkspace() {
    const config = useConfigStore((state) => state.config);
    const imageModels = useMemo(() => selectableModelsByCapability(config, "image"), [config]);
    const model = config.imageModel || imageModels[0] || "";
    const modelReady = Boolean(model && resolveModelChannel(config, model));

    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const draftRevision = useToolDraftStore((state) => state.drafts[toolId]?.revision ?? null);
    const tasks = useToolTaskStore((state) => state.tasks);
    const runTool = useToolTaskStore((state) => state.runTool);

    const [values, setValues] = useState<ListingFissionValues>(DEFAULT_LISTING_FISSION_VALUES);
    const [mainRecords, setMainRecords] = useState<ToolAssetRecord[]>([]);
    const [aplusRecords, setAplusRecords] = useState<ToolAssetRecord[]>([]);
    const [mainSelected, setMainSelected] = useState<Set<string>>(new Set());
    const [aplusSelected, setAplusSelected] = useState<Set<string>>(new Set());
    const [results, setResults] = useState<{ id: string; link: number; label: string }[]>([]);
    const [running, setRunning] = useState(false);
    const [errorText, setErrorText] = useState("");
    const [linkInput, setLinkInput] = useState("");
    const [parsingLink, setParsingLink] = useState(false);

    useEffect(() => {
        let alive = true;
        void hydrateDraft(toolId).then((draft) => {
            if (alive && draft) setValues(readListingFissionValues(draft.values));
        });
        return () => {
            alive = false;
        };
    }, [hydrateDraft]);

    const update = useCallback(
        (patch: Partial<ListingFissionValues>) => {
            setValues((previous) => {
                const next = { ...previous, ...patch };
                patchDraft(toolId, { values: next as unknown as Record<string, unknown> });
                return next;
            });
        },
        [patchDraft],
    );

    /** 原站：来源图默认全选；新上传的图默认选中。 */
    const syncRecords = (records: ToolAssetRecord[], previous: ToolAssetRecord[], setRecords: (r: ToolAssetRecord[]) => void, setSelected: (fn: (s: Set<string>) => Set<string>) => void) => {
        const known = new Set(previous.map((record) => record.id));
        setRecords(records);
        setSelected((selected) => new Set(records.filter((record) => selected.has(record.id) || !known.has(record.id)).map((record) => record.id)));
    };

    const withAplus = generatesAplus(values);
    const selectedMain = mainRecords.filter((record) => mainSelected.has(record.id));
    const selectedAplus = aplusRecords.filter((record) => aplusSelected.has(record.id));
    const summary = summarizeListingFission(values, selectedMain.length, selectedAplus.length, aplusRecords.length);
    const blocked = !selectedMain.length ? "请先选择主副图" : !modelReady ? "未配置可用的图像模型" : "";

    /** 原站 Oe：切到完整 Listing 且没选 A+ 时默认选中第一张 A+。 */
    const chooseDelivery = (delivery: ListingFissionValues["delivery"]) => {
        update({ delivery });
        if (delivery === "complete" && aplusSelected.size === 0 && aplusRecords[0]) setAplusSelected(new Set([aplusRecords[0].id]));
    };

    const submit = useCallback(async () => {
        if (blocked) return setErrorText(blocked);
        setErrorText("");
        let units;
        try {
            units = planListingFission(values, selectedMain.map(assetRecordToReference), selectedAplus.map(assetRecordToReference), aplusRecords.length, model);
        } catch (error) {
            return setErrorText(error instanceof Error ? error.message : "参数无效");
        }
        setRunning(true);
        try {
            const settled = await Promise.allSettled(units.map((unit) => runTool(unit.input, { draftRevision })));
            const failed = settled.filter((item) => item.status === "rejected").length;
            setResults(settled.flatMap((item, index) => (item.status === "fulfilled" ? [{ id: item.value.id, link: units[index].link, label: units[index].label }] : [])));
            if (failed) setErrorText(`${units.length - failed} 张已提交，${failed} 张提交失败`);
        } finally {
            setRunning(false);
        }
    }, [aplusRecords.length, blocked, draftRevision, model, runTool, selectedAplus, selectedMain, values]);

    const links = [...new Set(results.map((item) => item.link))];
    const label = "text-[12px] leading-[22px] text-muted-foreground";
    const sub = "text-[12px] text-muted-foreground";

    const handleParseLink = useCallback(async () => {
        if (!linkInput.trim() || parsingLink) return;
        setParsingLink(true);
        setErrorText("");
        try {
            const parsed = await parseEcommerceProductLink(linkInput.trim());
            if (parsed.title) {
                update({ title: parsed.title });
            }
        } catch (error) {
            setErrorText(error instanceof Error ? error.message : "链接解析失败");
        } finally {
            setParsingLink(false);
        }
    }, [linkInput, parsingLink, update]);

    return (
        <div data-testid="listing-fission-workspace" className="flex h-full min-h-0 flex-col">
            <ToolWorkspaceColumns
                className="min-h-0 flex-1"
                configClassName="overflow-hidden rounded-[8px] border border-border bg-background"
                mainClassName="min-h-0 overflow-hidden"
                config={
                    <div className="h-full overflow-y-auto px-4 py-[10px]" data-testid="listing-fission-source">
                        <p className="text-[12px] text-foreground">裂变来源 · 自有 Listing</p>
                        <div className="mt-1.5 flex items-center gap-1.5" data-testid="listing-fission-link-parser">
                            <input
                                type="url"
                                value={linkInput}
                                onChange={(event) => setLinkInput(event.target.value)}
                                placeholder="粘贴商品链接或 ASIN 解析标题"
                                disabled={running || parsingLink}
                                className="h-7 min-w-0 flex-1 rounded-[6px] border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-selected"
                            />
                            <button
                                type="button"
                                data-testid="listing-fission-parse-btn"
                                disabled={running || parsingLink || !linkInput.trim()}
                                onClick={() => void handleParseLink()}
                                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-[6px] border border-border bg-card px-2 text-[12px] text-foreground hover:border-selected disabled:opacity-50"
                            >
                                {parsingLink ? <Loader2 className="size-3 animate-spin" /> : <Link2 className="size-3" />}
                                解析
                            </button>
                        </div>
                        <input
                            aria-label="Listing 标题"
                            data-testid="listing-fission-title"
                            value={values.title}
                            maxLength={200}
                            onChange={(event) => update({ title: event.target.value })}
                            placeholder="未命名 Listing"
                            className="mt-1.5 h-8 w-full rounded-[6px] border border-border px-[11px] text-[14px] outline-none focus:border-selected"
                        />
                        <p className="mt-1 text-[12px] text-muted-foreground">
                            {[mainRecords.length ? `主副图 ${mainRecords.length} 张` : "", aplusRecords.length ? `A+ ${aplusRecords.length} 张` : ""].filter(Boolean).join(" · ") || "源 Listing 不会被修改"}
                        </p>
                        <p className={cn(label, "mt-3")}>主副图</p>
                        <ToolAssetInput toolId={toolId} draftSlot="main" title="" variant="linkfox" uploadLabel="上传主副图" disabled={running} hint="图片格式：支持jpg、jpeg、png、webp格式" onChange={(_ids, records) => syncRecords(records, mainRecords, setMainRecords, setMainSelected)} />
                        <p className={cn(label, "mt-3")}>A+ 图（可选）</p>
                        <ToolAssetInput toolId={toolId} draftSlot="aplus" title="" variant="linkfox" uploadLabel="上传 A+ 图" disabled={running} hint="没有 A+ 时按所选 A+ 类型用主副图生成" onChange={(_ids, records) => syncRecords(records, aplusRecords, setAplusRecords, setAplusSelected)} />
                    </div>
                }
            >
                <div className="flex h-[42px] shrink-0 items-center border-b border-border bg-background px-4">
                    <span className="border-b-2 border-foreground py-[9px] text-[14px] text-foreground">链接裂变</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    <div className="mx-auto max-w-[760px] rounded-[12px] bg-background px-6 pb-5 pt-1">
                        <Section title="设置裂变目标">
                            <div className="flex items-center justify-between rounded-[8px] bg-muted px-4 py-3">
                                <div className="flex flex-col">
                                    <span className="text-[14px] text-foreground">新 Listing 数量</span>
                                    <span className={sub}>每条将作为独立的自有 Listing 分开展示</span>
                                </div>
                                <Stepper testId="listing-fission-link-count" value={values.linkCount} disabled={running} onChange={(linkCount) => update({ linkCount })} />
                            </div>
                            <p className="mb-2 mt-4 text-[13px] text-foreground/70">每条 Listing 的内容</p>
                            <div className="grid grid-cols-3 gap-3" data-testid="listing-fission-delivery">
                                {LISTING_FISSION_DELIVERIES.map((item) => (
                                    <button key={item.value} type="button" aria-pressed={values.delivery === item.value} disabled={running} onClick={() => chooseDelivery(item.value)} className={cn("rounded-[8px] border p-3 text-left", values.delivery === item.value ? "border-selected bg-selected-soft" : "border-border hover:border-selected")}>
                                        <span className="flex items-center gap-2">
                                            <strong className="text-[14px] font-medium text-foreground">{item.title}</strong>
                                            {"badge" in item ? <span className="rounded-[4px] bg-selected-soft px-1.5 text-[11px] text-foreground">{item.badge}</span> : null}
                                        </span>
                                        <span className={cn(sub, "mt-1 block")}>{item.description}</span>
                                    </button>
                                ))}
                            </div>
                        </Section>

                        <Section title="图片生成设置">
                            <div className="flex items-center justify-between text-[14px]">
                                <span className="text-foreground/70">模型选择</span>
                                <span className="text-foreground">{model || "未配置"}</span>
                            </div>
                        </Section>

                        <Section title="选择参考图片">
                            <p className="mb-2 text-[13px] text-foreground/70">
                                主副图 <span className={sub}>选择图片作为 AI 参考</span>
                            </p>
                            {mainRecords.length ? <Thumbs testId="listing-fission-main" records={mainRecords} selected={mainSelected} onToggle={(id) => setMainSelected((s) => toggleIn(s, id))} /> : <p className={sub}>当前 Listing 暂无可用主副图，无法发起裂变</p>}
                            {values.delivery === "custom" ? (
                                <div className="mt-3 flex items-center justify-between rounded-[8px] bg-muted px-4 py-3">
                                    <div className="flex flex-col">
                                        <strong className="text-[14px] font-medium text-foreground">每张主副图参考图的生成数量</strong>
                                        <span className={sub}>
                                            已选 {selectedMain.length} 张参考图，每条 Listing 将生成 {summary.mainSubPerLink} 张主副图
                                        </span>
                                    </div>
                                    <Stepper testId="listing-fission-main-count" value={values.mainSubCount} disabled={running} onChange={(mainSubCount) => update({ mainSubCount })} />
                                </div>
                            ) : null}
                            {values.delivery === "custom" ? (
                                <label className="mt-3 flex cursor-pointer items-start gap-2">
                                    <input type="checkbox" data-testid="listing-fission-custom-aplus" className="mt-1 accent-[var(--selected)]" checked={values.customAplus} disabled={running} onChange={(event) => update({ customAplus: event.target.checked })} />
                                    <span className="flex flex-col">
                                        <strong className="text-[14px] font-medium text-foreground">同时生成 A+</strong>
                                        <span className={sub}>{aplusRecords.length ? "勾选后可选择参考 A+ 素材" : "勾选后选择要生成的 A+ 类型"}</span>
                                    </span>
                                </label>
                            ) : null}
                            {withAplus ? (
                                <div className="mt-3" data-testid="listing-fission-aplus">
                                    {aplusRecords.length ? (
                                        <>
                                            <p className="mb-2 text-[13px] text-foreground/70">A+ 图</p>
                                            <Thumbs testId="listing-fission-aplus-thumbs" records={aplusRecords} selected={aplusSelected} onToggle={(id) => setAplusSelected((s) => toggleIn(s, id))} />
                                        </>
                                    ) : (
                                        <>
                                            <p className={sub}>源 Listing 暂无 A+，无法复用源 A+；可使用已选主副图生成新的 A+。</p>
                                            <div className="mt-2 grid grid-cols-4 gap-2">
                                                {LISTING_FISSION_APLUS_TYPES.map((item) => (
                                                    <button key={item.value} type="button" aria-pressed={values.aplusType === item.value} disabled={running} onClick={() => update({ aplusType: item.value })} className={cn("rounded-[8px] border p-2 text-left", values.aplusType === item.value ? "border-selected bg-selected-soft" : "border-border hover:border-selected")}>
                                                        <strong className="block text-[13px] font-medium text-foreground">{item.label}</strong>
                                                        <span className={sub}>{item.description}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            {values.aplusType === "custom" ? (
                                                <div className="mt-2 flex items-center gap-2 text-[13px] text-foreground/70">
                                                    比例
                                                    <input aria-label="A+ 宽" type="number" min={1} max={100} value={values.aplusWidth} onChange={(event) => update({ aplusWidth: Math.min(100, Math.max(1, Math.round(Number(event.target.value) || 1))) })} className="h-7 w-14 rounded-[6px] border border-border text-center outline-none focus:border-selected" />
                                                    :
                                                    <input aria-label="A+ 高" type="number" min={1} max={100} value={values.aplusHeight} onChange={(event) => update({ aplusHeight: Math.min(100, Math.max(1, Math.round(Number(event.target.value) || 1))) })} className="h-7 w-14 rounded-[6px] border border-border text-center outline-none focus:border-selected" />
                                                </div>
                                            ) : null}
                                        </>
                                    )}
                                    <div className="mt-3 flex items-center justify-between rounded-[8px] bg-muted px-4 py-3">
                                        <div className="flex flex-col">
                                            <strong className="text-[14px] font-medium text-foreground">{aplusRecords.length ? "每张 A+ 参考图的生成数量" : values.aplusType === "advancedPhone" ? "每种尺寸生成数量" : "生成 A+ 数量"}</strong>
                                            <span className={sub}>{values.aplusType === "advancedPhone" && !aplusRecords.length ? `桌面和手机各生成 ${values.aplusCount} 张，每条 Listing 共 ${summary.aplusPerLink} 张 A+` : `每条 Listing 将生成 ${summary.aplusPerLink} 张 A+`}</span>
                                        </div>
                                        <Stepper testId="listing-fission-aplus-count" value={values.aplusCount} disabled={running} onChange={(aplusCount) => update({ aplusCount })} />
                                    </div>
                                </div>
                            ) : null}
                        </Section>

                        <div className="mt-5 flex items-center justify-between gap-4 border-t border-border pt-4">
                            <div className="flex flex-col" data-testid="listing-fission-summary">
                                {selectedMain.length ? (
                                    <>
                                        <strong className="text-[14px] font-medium text-foreground">本次将生成 {values.linkCount} 条新 Listing</strong>
                                        <span className={sub}>
                                            每条包含：主副图 {summary.mainSubPerLink} 张{withAplus ? `、A+ ${summary.aplusPerLink} 张` : "，不含 A+"}；共 {summary.totalImages} 张图片（本地只生成图片，不生成新文案）
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <strong className="text-[14px] font-medium text-foreground">请先选择主副图</strong>
                                        <span className={sub}>至少选择 1 张参考图后，才能创建新的裂变 Listing。</span>
                                    </>
                                )}
                            </div>
                            <button type="button" data-testid="listing-fission-submit" disabled={Boolean(blocked) || running} title={blocked} onClick={() => void submit()} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-[6px] bg-primary px-5 text-[13px] text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
                                {running ? <Loader2 className="size-3.5 animate-spin" /> : null}
                                {selectedMain.length ? `开始生成 ${values.linkCount} 条 Listing` : "请先选择主副图"}
                            </button>
                        </div>
                        {errorText ? <p data-testid="listing-fission-error" className="mt-2 text-[12px] text-destructive">{errorText}</p> : null}
                    </div>

                    {links.map((link) => (
                        <div key={link} className="mx-auto mt-4 max-w-[760px]" data-testid="listing-fission-result">
                            <p className="mb-2 text-[14px] font-medium text-foreground">新 Listing {link}</p>
                            <div className="grid grid-cols-2 gap-3">
                                {results
                                    .filter((item) => item.link === link && tasks[item.id])
                                    .map((item) => (
                                        <ToolResult key={item.id} task={tasks[item.id]} toolId={toolId} title={item.label} />
                                    ))}
                            </div>
                        </div>
                    ))}
                    <ToolTaskHistory toolId={toolId} className="mx-auto mt-4 max-w-[760px]" emptyHint="还没有链接裂变记录" onSelectTask={(task) => setResults([{ id: task.id, link: 1, label: "生成结果" }])} />
                </div>
            </ToolWorkspaceColumns>
        </div>
    );
}

export default ListingFissionWorkspace;
