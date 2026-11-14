import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, Loader2, Scissors, Sparkles } from "lucide-react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { ToolConfigSection, ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import { pickResultPanelTask } from "@/features/tools/adapters/result-panel";
import {
    DEFAULT_REPLICATION_VALUES,
    IMAGE_REPLICATION_TOOL_ID,
    IMAGE_REPLICATION_VALUES_SLOT,
    IMAGE_REPLICATION_SNAPSHOT_SLOT,
    REPLICATION_LANGUAGES,
    REPLICATION_MARKETS,
    buildReplicationInput,
    createReplicationSnapshot,
    readReplicationSnapshot,
    readReplicationValues,
    replicationReference,
    type ReplicationValues,
} from "@/features/tools/registry/image-replication";
import { describeToolExecution } from "@/services/api/tools/gateway";
import { loadToolAssetRecords, toolAssetLibraryItemsFromAssets, uploadToolAsset, type ToolAssetRecord } from "@/services/api/tools/assets";
import {
    analyzeProductImageWithVision,
    parseEcommerceProductLink,
    sliceLongProductImage,
    type LongImageSlice,
} from "@/services/api/tools/content-analysis";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { useAssetStore, type ImageAsset } from "@/stores/use-asset-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";

const toolId = IMAGE_REPLICATION_TOOL_ID;

export function ImageReplicationWorkspace() {
    const [values, setValues] = useState<ReplicationValues>({ ...DEFAULT_REPLICATION_VALUES });
    const [products, setProducts] = useState<ToolAssetRecord[]>([]);
    const [layout, setLayout] = useState<ToolAssetRecord | null>(null);
    const [layoutSlices, setLayoutSlices] = useState<LongImageSlice[]>([]);
    const [slicing, setSlicing] = useState(false);
    const [linkUrl, setLinkUrl] = useState("");
    const [parsingLink, setParsingLink] = useState(false);
    const [analyzingInfo, setAnalyzingInfo] = useState(false);
    const [task, setTask] = useState<ToolTask | null>(null);
    const [tab, setTab] = useState<"result" | "history">("result");
    const [running, setRunning] = useState(false);
    const [error, setError] = useState("");
    const draft = useToolDraftStore((state) => state.drafts[toolId]);
    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const tasks = useToolTaskStore((state) => state.tasks);
    const hydrateTasks = useToolTaskStore((state) => state.hydrate);
    const runTool = useToolTaskStore((state) => state.runTool);
    const model = useConfigStore((state) => state.config.imageModel);
    const libraryAssets = useAssetStore((state) => state.assets);
    const library = useMemo(() => toolAssetLibraryItemsFromAssets(libraryAssets.filter((asset): asset is ImageAsset => asset.kind === "image")), [libraryAssets]);

    useEffect(() => {
        let alive = true;
        void hydrateDraft(toolId).then((restored) => {
            if (alive) setValues(readReplicationValues(restored?.values?.[IMAGE_REPLICATION_VALUES_SLOT]));
        });
        hydrateTasks();
        return () => { alive = false; };
    }, [hydrateDraft, hydrateTasks]);

    const update = useCallback((next: Partial<ReplicationValues>) => {
        setValues((current) => {
            const merged = { ...current, ...next };
            patchDraft(toolId, { values: { [IMAGE_REPLICATION_VALUES_SLOT]: merged } });
            return merged;
        });
    }, [patchDraft]);
    useEffect(() => {
        if (draft) setValues(readReplicationValues(draft.values[IMAGE_REPLICATION_VALUES_SLOT]));
    }, [draft]);

    const descriptor = useMemo(() => {
        try { return describeToolExecution(toolId); } catch { return null; }
    }, []);
    const activeTask = task ?? pickResultPanelTask(Object.values(tasks), { toolId, includeLatestWithoutItems: true });
    const ready = Boolean(products.length && layout && values.market && values.language && model && descriptor?.executable);

    const handleParseLink = useCallback(async () => {
        if (!linkUrl.trim() || parsingLink) return;
        setParsingLink(true);
        setError("");
        try {
            const parsed = await parseEcommerceProductLink(linkUrl);
            const summary = [
                parsed.title ? `商品标题：${parsed.title}` : "",
                parsed.bullets.length ? `核心卖点：${parsed.bullets.join("；")}` : "",
                parsed.description ? `详情描述：${parsed.description}` : "",
            ].filter(Boolean).join("\n");
            if (summary) {
                update({ productInfo: summary.slice(0, 2500) });
            }
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "商品链接解析失败。");
        } finally {
            setParsingLink(false);
        }
    }, [linkUrl, parsingLink, update]);

    const handleSliceLongLayout = useCallback(async () => {
        if (!layout?.url || slicing) return;
        setSlicing(true);
        setError("");
        try {
            const slices = await sliceLongProductImage(layout.url, { minSliceHeight: 500, maxSlices: 8 });
            setLayoutSlices(slices);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "长图切分失败。");
        } finally {
            setSlicing(false);
        }
    }, [layout?.url, slicing]);

    const handlePickSlice = useCallback(async (slice: LongImageSlice) => {
        try {
            const response = await fetch(slice.dataUrl);
            const blob = await response.blob();
            const file = new File([blob], `aplus-slice-${slice.index + 1}.png`, { type: "image/png" });
            const uploaded = await uploadToolAsset(file);
            setLayout(uploaded);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "长图屏段切换失败。");
        }
    }, []);

    const handleAnalyzeProductInfo = useCallback(async () => {
        const firstProduct = products[0];
        if (!firstProduct?.url || analyzingInfo) return;
        setAnalyzingInfo(true);
        setError("");
        try {
            const analysis = await analyzeProductImageWithVision(firstProduct.url);
            const infoText = [
                analysis.productName ? `商品名称：${analysis.productName}` : "",
                analysis.categoryPath?.length ? `所属类目：${analysis.categoryPath.join(" / ")}` : "",
                analysis.sellingPoints ? `核心卖点：${analysis.sellingPoints}` : "",
                analysis.targetAudience ? `目标人群：${analysis.targetAudience}` : "",
            ].filter(Boolean).join("\n");
            if (infoText) {
                update({ productInfo: infoText.slice(0, 2500) });
            }
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "AI 识别商品信息失败。");
        } finally {
            setAnalyzingInfo(false);
        }
    }, [analyzingInfo, products, update]);

    const generate = useCallback(async () => {
        if (!ready || !layout || running) return;
        setRunning(true);
        setError("");
        setTab("result");
        setTask(null);
        try {
            const input = buildReplicationInput(values, products.map((record) => replicationReference(record)), replicationReference(layout, "版式参考图"), model);
            const snapshot = createReplicationSnapshot(values, products, layout, model);
            const next = await runTool(input, { draftRevision: draft?.revision, onUpdate: setTask });
            useToolTaskStore.getState().upsertTask({ ...next, inputSnapshot: snapshot });
            patchDraft(toolId, { values: { [IMAGE_REPLICATION_SNAPSHOT_SLOT]: snapshot } });
            setTask(useToolTaskStore.getState().tasks[next.id] ?? next);
            if (next.status === "failed") setError(next.error?.message ?? "生成失败。");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "生成失败。");
        } finally {
            setRunning(false);
        }
    }, [draft?.revision, layout, model, products, ready, runTool, running, values]);

    const restoreTask = useCallback(async (selected: ToolTask) => {
        setError("");
        const saved = readReplicationSnapshot(selected.inputSnapshot);
        if (!saved) { setError("这条历史没有可恢复的完整输入。"); return; }
        setTask(selected);
        setTab("result");
        const { records, lostIds } = await loadToolAssetRecords([...saved.productAssetIds, saved.layoutAssetId]);
        if (lostIds.length) setError(`${lostIds.length} 个原始素材已不存在，请重新选择后再生成。`);
        const byId = new Map(records.map((record) => [record.id, record]));
        setProducts(saved.productAssetIds.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []));
        setLayout(byId.get(saved.layoutAssetId) ?? null);
        setValues(saved.values);
        patchDraft(toolId, { values: { [IMAGE_REPLICATION_VALUES_SLOT]: saved.values } });
    }, [patchDraft]);

    return (
        <ToolWorkspaceColumns configWidth={504} config={<>
            <ToolConfigSection title="复刻类型">
                <div className="flex gap-2">
                    {([{ id: "aplus", label: "A+长图复刻" }, { id: "main", label: "主副图复刻" }] as const).map((mode) => <button key={mode.id} type="button" aria-pressed={values.mode === mode.id} onClick={() => update({ mode: mode.id })} className={`h-8 flex-1 rounded border text-xs ${values.mode === mode.id ? "border-selected bg-selected-soft text-selected" : "border-border text-foreground hover:bg-accent"}`}>{mode.label}</button>)}
                </div>
            </ToolConfigSection>
            <ToolConfigSection title="商品链接解析（可选）" hint="粘贴亚马逊 / 独立站 / 电商商品链接自动提取标题与卖点。">
                <div className="flex gap-2" data-testid="replication-link-parser">
                    <input
                        type="url"
                        value={linkUrl}
                        onChange={(event) => setLinkUrl(event.target.value)}
                        placeholder="粘贴商品链接（如 https://www.amazon.com/dp/...）"
                        className="h-8 min-w-0 flex-1 rounded border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
                    />
                    <button
                        type="button"
                        disabled={!linkUrl.trim() || parsingLink}
                        onClick={() => void handleParseLink()}
                        data-testid="replication-parse-link-btn"
                        className="inline-flex h-8 shrink-0 items-center gap-1 rounded border border-border bg-card px-2.5 text-xs text-foreground hover:bg-accent disabled:opacity-50"
                    >
                        {parsingLink ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
                        解析链接
                    </button>
                </div>
            </ToolConfigSection>
            <ToolConfigSection title="白底商品图" hint="沿用素材库的图片大小与格式限制。">
                <ToolAssetInput toolId={toolId} draftSlot="products" title="" library={library} onChange={(_ids, records) => { setProducts(records); setError(""); }} syncIds={products.map((record) => record.id)} />
            </ToolConfigSection>
            <ToolConfigSection title="参考版式图" hint="上传参考版式图；A+ 长图可自动切分单屏复刻。">
                <ToolAssetInput toolId={toolId} draftSlot="layout" title="" maxCount={1} library={library} onChange={(_ids, records) => { setLayout(records[0] ?? null); setLayoutSlices([]); setError(""); }} syncIds={layout ? [layout.id] : []} />
                {values.mode === "aplus" && layout ? (
                    <div className="mt-2 space-y-2" data-testid="replication-aplus-slicer">
                        <button
                            type="button"
                            disabled={slicing}
                            onClick={() => void handleSliceLongLayout()}
                            data-testid="replication-slice-btn"
                            className="inline-flex h-7 items-center gap-1 rounded border border-border bg-card px-2.5 text-xs text-foreground hover:bg-accent disabled:opacity-50"
                        >
                            {slicing ? <Loader2 className="size-3 animate-spin" /> : <Scissors className="size-3" />}
                            切分 A+ 长图屏段
                        </button>
                        {layoutSlices.length > 1 ? (
                            <div className="grid grid-cols-4 gap-1.5" data-testid="replication-slice-list">
                                {layoutSlices.map((slice) => (
                                    <button
                                        key={slice.index}
                                        type="button"
                                        onClick={() => void handlePickSlice(slice)}
                                        className="group relative overflow-hidden rounded border border-border bg-card p-1 text-left hover:border-selected"
                                    >
                                        <img src={slice.dataUrl} alt={`第 ${slice.index + 1} 屏`} className="h-14 w-full object-cover" />
                                        <span className="mt-0.5 block text-center text-[10px] text-muted-foreground group-hover:text-foreground">
                                            第 {slice.index + 1} 屏
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </ToolConfigSection>
            <ToolConfigSection title="生成设置" hint={model ? "使用当前已配置的图像模型。" : "请先在模型设置中配置图像模型。"}>
                <div className="space-y-2 text-xs">
                    <label className="flex items-center justify-between gap-2">目标市场
                        <select aria-label="目标市场" value={values.market} onChange={(event) => update({ market: event.target.value })} className="h-8 rounded border border-border bg-background px-2 text-foreground">
                            {REPLICATION_MARKETS.map((market) => (
                                <option key={market.id} value={market.id}>{market.label}</option>
                            ))}
                        </select>
                    </label>
                    <label className="flex items-center justify-between gap-2">文案语言
                        <select aria-label="文案语言" value={values.language} onChange={(event) => update({ language: event.target.value })} className="h-8 rounded border border-border bg-background px-2 text-foreground">
                            {REPLICATION_LANGUAGES.map((lang) => (
                                <option key={lang} value={lang}>{lang}</option>
                            ))}
                        </select>
                    </label>
                    <div><p className="mb-1">输出分辨率</p><div className="flex gap-2">{(["1K", "2K", "4K"] as const).map((quality) => <button key={quality} type="button" aria-pressed={values.quality === quality} onClick={() => update({ quality })} className={`h-8 flex-1 rounded border ${values.quality === quality ? "border-selected bg-selected-soft text-selected" : "border-border hover:bg-accent"}`}>{quality}</button>)}</div></div>
                    <div><p className="mb-1">生成数量</p><div className="flex gap-2">{[1, 2, 3, 4].map((count) => <button key={count} type="button" aria-pressed={values.count === count} onClick={() => update({ count })} className={`h-8 flex-1 rounded border ${values.count === count ? "border-selected bg-selected-soft text-selected" : "border-border hover:bg-accent"}`}>{count}</button>)}</div></div>
                </div>
            </ToolConfigSection>
            <ToolConfigSection
                title="商品信息（可选）"
                action={
                    products.length > 0 ? (
                        <button
                            type="button"
                            disabled={analyzingInfo}
                            onClick={() => void handleAnalyzeProductInfo()}
                            data-testid="replication-ai-analyze"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:opacity-80 disabled:opacity-50"
                        >
                            {analyzingInfo ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                            AI 分析填充
                        </button>
                    ) : undefined
                }
            >
                <textarea aria-label="商品信息" rows={4} maxLength={2500} value={values.productInfo} onChange={(event) => update({ productInfo: event.target.value })} className="w-full resize-y rounded border border-border bg-background p-2 text-xs outline-none focus:border-primary" />
                <p className="mt-1 text-right text-[11px] text-muted-foreground">{values.productInfo.length}/2500</p>
            </ToolConfigSection>
            {!descriptor ? <p role="status" className="text-xs text-muted-foreground">共享网关尚未注册 IMAGE_REPLICATION，参数与上传已就绪，需完成集成后才能提交。</p> : null}
            <button type="button" disabled={!ready || running} onClick={() => void generate()} className="inline-flex h-10 items-center justify-center gap-2 rounded bg-primary text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {running ? <Loader2 className="size-4 animate-spin" /> : null}{running ? "正在生成" : "开始生成"}
            </button>
            {error ? <p role="alert" className="text-xs leading-5 text-destructive">{error}</p> : null}
        </>}>
            <div className="flex items-center gap-1 border-b border-border">
                {(["result", "history"] as const).map((item) => <button key={item} type="button" aria-pressed={tab === item} onClick={() => setTab(item)} className={`h-9 border-b-2 px-3 text-sm ${tab === item ? "border-selected text-foreground" : "border-transparent text-muted-foreground"}`}>{item === "result" ? "生成结果" : "历史记录"}</button>)}
            </div>
            {tab === "result" ? <ToolResult task={activeTask} toolId={toolId} title="生成结果" emptyTitle="暂无生成结果图" emptyHint="上传白底商品图与参考版式图后开始生成。" /> : <ToolTaskHistory toolId={toolId} selectWithoutResult onSelectTask={(selected) => void restoreTask(selected)} />}
        </ToolWorkspaceColumns>
    );
}

export default ImageReplicationWorkspace;
