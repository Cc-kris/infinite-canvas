import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brush, CheckCircle2, Loader2, Sparkles } from "lucide-react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolConfigSection, ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { ProductBgCutout } from "@/components/tools/workspaces/product-bg-cutout";
import { runLocalPixelTask } from "@/features/tools/adapters/local-pixel";
import { pickResultPanelTask } from "@/features/tools/adapters/result-panel";
import {
    PIXEL_TOOL_META,
    pixelInputSnapshot,
    readPixelDraft,
    readPixelInputSnapshot,
    type PixelAsset,
    type PixelMaskSource,
    type PixelToolId,
} from "@/features/tools/registry/local-pixel";
import {
    loadToolAssetRecords,
    toolAssetLibraryItemsFromAssets,
    uploadToolAsset,
    type ToolAssetRecord,
} from "@/services/api/tools/assets";
import { autoSegmentSubjectMask } from "@/services/api/tools/segmentation";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { useAssetStore, type ImageAsset } from "@/stores/use-asset-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";

type PixelMask = { id?: string; url: string; source: PixelMaskSource; cutoutUrl?: string };

const WHITE_BG_SIZE_PRESETS = [
    { id: "original", label: "原图尺寸", width: 0, height: 0 },
    { id: "800x800", label: "800×800 (淘宝/通用)", width: 800, height: 800 },
    { id: "1000x1000", label: "1000×1000 (亚马逊主图)", width: 1000, height: 1000 },
    { id: "1600x1600", label: "1600×1600 (高清主图)", width: 1600, height: 1600 },
    { id: "1200x1600", label: "1200×1600 (3:4 服装)", width: 1200, height: 1600 },
] as const;

const WHITE_BG_COLOR_PRESETS = [
    { id: "#FFFFFF", label: "纯白 #FFFFFF" },
    { id: "#F7F7F7", label: "柔白 #F7F7F7" },
    { id: "#F4F1EA", label: "暖白 #F4F1EA" },
] as const;

const MATTING_PREVIEW_BACKGROUNDS = [
    { id: "checkerboard", label: "透明棋盘格" },
    { id: "white", label: "纯白底" },
    { id: "black", label: "深色底" },
    { id: "stone", label: "暖灰底" },
] as const;

export function LocalPixelWorkspace({ toolId }: { toolId: PixelToolId }) {
    const meta = PIXEL_TOOL_META[toolId];
    const isWhiteBg = toolId === "WHITE_BACKGROUND";
    const [assets, setAssets] = useState<ToolAssetRecord[]>([]);
    const [masks, setMasks] = useState<Record<string, PixelMask>>({});
    const [autoSegmentingIds, setAutoSegmentingIds] = useState<Record<string, boolean>>({});
    const [editing, setEditing] = useState<ToolAssetRecord | null>(null);
    const [task, setTask] = useState<ToolTask | null>(null);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState("");
    const [tab, setTab] = useState<"result" | "history">("result");

    // 白底图专属参数（尺寸预设 / 主体边距 / 背景色）
    const [sizePreset, setSizePreset] = useState<string>("original");
    const [paddingPercent, setPaddingPercent] = useState<number>(10);
    const [bgColor, setBgColor] = useState<string>("#FFFFFF");

    // 批量抠图专属预览背景切换
    const [previewBg, setPreviewBg] = useState<(typeof MATTING_PREVIEW_BACKGROUNDS)[number]["id"]>("checkerboard");

    const restored = useRef(false);
    const libraryAssets = useAssetStore((state) => state.assets);
    const library = useMemo(
        () => toolAssetLibraryItemsFromAssets(libraryAssets.filter((asset): asset is ImageAsset => asset.kind === "image")),
        [libraryAssets],
    );
    const patchDraft = useToolDraftStore((state) => state.patch);
    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const draft = useToolDraftStore((state) => state.drafts[toolId]);
    const tasks = useToolTaskStore((state) => state.tasks);
    const hydrateTasks = useToolTaskStore((state) => state.hydrate);
    const upsertTask = useToolTaskStore((state) => state.upsertTask);

    useEffect(() => {
        hydrateTasks();
    }, [hydrateTasks]);
    useEffect(() => {
        void hydrateDraft(toolId);
    }, [hydrateDraft, toolId]);
    useEffect(() => {
        if (restored.current || !draft) return;
        restored.current = true;
        const saved = readPixelDraft(draft.values.pixel);
        const maskIds = Object.values(saved.maskIds);
        if (!maskIds.length) return;
        void loadToolAssetRecords(maskIds).then(({ records }) => {
            const byId = new Map(records.map((record) => [record.id, record]));
            setMasks(
                Object.fromEntries(
                    Object.entries(saved.maskIds).flatMap(([sourceId, maskId]) => {
                        const mask = byId.get(maskId);
                        return mask ? [[sourceId, { url: mask.url, source: "mask" as const, id: mask.id }]] : [];
                    }),
                ),
            );
        });
    }, [draft]);

    const updateMasks = useCallback(
        (next: Record<string, PixelMask>) => {
            setMasks(next);
            patchDraft(toolId, {
                values: {
                    pixel: {
                        maskIds: Object.fromEntries(
                            Object.entries(next).flatMap(([id, mask]) => (mask.id ? [[id, mask.id]] : [])),
                        ),
                    },
                },
            });
        },
        [patchDraft, toolId],
    );

    const runAutoMaskForAsset = useCallback(
        async (asset: ToolAssetRecord, currentMasks: Record<string, PixelMask>): Promise<PixelMask | null> => {
            if (currentMasks[asset.id]?.id) return currentMasks[asset.id];
            setAutoSegmentingIds((prev) => ({ ...prev, [asset.id]: true }));
            try {
                const seg = await autoSegmentSubjectMask(asset.url, `${asset.name || "subject"}-mask.png`);
                const uploaded = await uploadToolAsset(seg.maskFile);
                const nextMask: PixelMask = {
                    id: uploaded.id,
                    url: uploaded.url,
                    source: "mask",
                    cutoutUrl: seg.cutoutDataUrl,
                };
                setMasks((prev) => {
                    const merged = { ...prev, [asset.id]: nextMask };
                    patchDraft(toolId, {
                        values: {
                            pixel: {
                                maskIds: Object.fromEntries(
                                    Object.entries(merged).flatMap(([id, m]) => (m.id ? [[id, m.id]] : [])),
                                ),
                            },
                        },
                    });
                    return merged;
                });
                return nextMask;
            } catch {
                return null;
            } finally {
                setAutoSegmentingIds((prev) => ({ ...prev, [asset.id]: false }));
            }
        },
        [patchDraft, toolId],
    );

    const onAssets = useCallback(
        (_ids: string[], records: ToolAssetRecord[]) => {
            setAssets(records);
            setMasks((current) => {
                const next = Object.fromEntries(
                    Object.entries(current).filter(([id]) => records.some((record) => record.id === id)),
                );
                if (Object.keys(next).length !== Object.keys(current).length) updateMasks(next);
                for (const record of records) {
                    if (!next[record.id]) {
                        void runAutoMaskForAsset(record, next);
                    }
                }
                return next;
            });
            setError("");
        },
        [runAutoMaskForAsset, updateMasks],
    );

    const confirmMask = useCallback(
        async (file: File) => {
            if (!editing) return;
            const record = await uploadToolAsset(file);
            updateMasks({ ...masks, [editing.id]: { url: record.url, source: "mask", id: record.id } });
            setEditing(null);
            setError("");
        },
        [editing, masks, updateMasks],
    );

    const generate = useCallback(async () => {
        if (!assets.length || running) return;
        setRunning(true);
        setError("");
        setTab("result");
        setTask(null);
        try {
            // 确保每张上传图片都具备自动前景分割蒙版，无需用户手涂
            const preparedMasks: Record<string, PixelMask> = { ...masks };
            for (const asset of assets) {
                if (!preparedMasks[asset.id]) {
                    const autoMask = await runAutoMaskForAsset(asset, preparedMasks);
                    if (autoMask) {
                        preparedMasks[asset.id] = autoMask;
                    }
                }
            }
            const next = await runLocalPixelTask(
                { toolId, assets, masks: preparedMasks, draftRevision: draft?.revision },
                { persist: upsertTask },
            );
            setTask(next);
            if (next.status === "failed") setError(next.error?.message ?? "图片处理失败。");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "图片处理失败。");
        } finally {
            setRunning(false);
        }
    }, [assets, draft?.revision, masks, runAutoMaskForAsset, running, toolId, upsertTask]);

    const activeTask = task ?? pickResultPanelTask(Object.values(tasks), { toolId, includeLatestWithoutItems: true });
    const restoreTask = useCallback(
        async (selected: ToolTask) => {
            setError("");
            const input = readPixelInputSnapshot(selected.inputSnapshot);
            if (!input) {
                setError("这条历史没有可恢复的完整输入。");
                return;
            }
            setTask(selected);
            setTab("result");
            const ids = [...input.assets.map((asset) => asset.id), ...Object.values(input.maskIds)];
            const { records, lostIds } = await loadToolAssetRecords(ids);
            if (lostIds.length) setError(`${lostIds.length} 个原始素材已不存在，请重新选择后再处理。`);
            const byId = new Map(records.map((record) => [record.id, record]));
            setAssets(input.assets.flatMap((asset) => (byId.has(asset.id) ? [byId.get(asset.id)!] : [])));
            const restoredMasks = Object.fromEntries(
                input.assets.flatMap((asset) => {
                    const id = input.maskIds[asset.id];
                    const mask = id ? byId.get(id) : undefined;
                    return mask ? [[asset.id, { url: mask.url, source: "mask" as const, id }]] : [];
                }),
            );
            updateMasks(restoredMasks);
        },
        [updateMasks],
    );

    return (
        <>
            <ToolWorkspaceColumns
                configWidth={isWhiteBg ? "330px" : "300px"}
                config={
                    <div className="flex h-full min-h-0 flex-col justify-between gap-3">
                        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
                            <ToolConfigSection
                                title={isWhiteBg ? "上传商品图" : "批量上传图片"}
                                hint={isWhiteBg ? "上传商品原图后自动抠除杂乱背景并生成标准电商白底图。" : "支持多图批量上传，自动识别主体轮廓并输出透明 PNG。"}
                            >
                                <ToolAssetInput
                                    toolId={toolId}
                                    maxCount={20}
                                    library={library}
                                    onChange={onAssets}
                                    syncIds={assets.map((asset) => asset.id)}
                                />
                            </ToolConfigSection>

                            {isWhiteBg ? (
                                <>
                                    <ToolConfigSection title="白底图尺寸与边距">
                                        <div className="space-y-2.5">
                                            <div>
                                                <span className="mb-1 block text-xs text-muted-foreground">目标尺寸规格</span>
                                                <div className="grid grid-cols-2 gap-1.5" data-testid="white-bg-size-presets">
                                                    {WHITE_BG_SIZE_PRESETS.map((preset) => (
                                                        <button
                                                            key={preset.id}
                                                            type="button"
                                                            onClick={() => setSizePreset(preset.id)}
                                                            className={`rounded-md border px-2 py-1.5 text-left text-xs transition ${
                                                                sizePreset === preset.id
                                                                    ? "border-selected bg-selected-soft font-medium text-selected"
                                                                    : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                                                            }`}
                                                        >
                                                            {preset.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="mb-1 flex items-center justify-between text-xs">
                                                    <span className="text-muted-foreground">商品四周留白比例</span>
                                                    <span className="tabular-nums text-foreground">{paddingPercent}%</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min={0}
                                                    max={25}
                                                    step={1}
                                                    value={paddingPercent}
                                                    onChange={(event) => setPaddingPercent(Number(event.target.value))}
                                                    className="w-full accent-primary"
                                                    data-testid="white-bg-padding-slider"
                                                />
                                            </div>
                                            <div>
                                                <span className="mb-1 block text-xs text-muted-foreground">底色选择</span>
                                                <div className="flex flex-wrap items-center gap-1.5" data-testid="white-bg-color-presets">
                                                    {WHITE_BG_COLOR_PRESETS.map((preset) => (
                                                        <button
                                                            key={preset.id}
                                                            type="button"
                                                            onClick={() => setBgColor(preset.id)}
                                                            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                                                                bgColor === preset.id
                                                                    ? "border-selected bg-selected-soft text-selected"
                                                                    : "border-border text-muted-foreground hover:text-foreground"
                                                            }`}
                                                        >
                                                            <span
                                                                className="size-3 rounded-full border border-border"
                                                                style={{ backgroundColor: preset.id }}
                                                            />
                                                            {preset.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </ToolConfigSection>
                                </>
                            ) : (
                                <ToolConfigSection title="预览背景底色">
                                    <div className="grid grid-cols-2 gap-1.5" data-testid="batch-matting-preview-bg">
                                        {MATTING_PREVIEW_BACKGROUNDS.map((bg) => (
                                            <button
                                                key={bg.id}
                                                type="button"
                                                onClick={() => setPreviewBg(bg.id)}
                                                className={`rounded-md border px-2 py-1.5 text-xs transition ${
                                                    previewBg === bg.id
                                                        ? "border-selected bg-selected-soft font-medium text-selected"
                                                        : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                                                }`}
                                            >
                                                {bg.label}
                                            </button>
                                        ))}
                                    </div>
                                </ToolConfigSection>
                            )}

                            <ToolConfigSection
                                title="AI 自动主体识别与微调"
                                hint="已自动提取商品主体蒙版；如需局部增减保留区域可点击「精修选区」。"
                            >
                                <div className="space-y-2" data-testid="pixel-subject-mask-list">
                                    {assets.map((asset, index) => {
                                        const isSegmenting = Boolean(autoSegmentingIds[asset.id]);
                                        const hasMask = Boolean(masks[asset.id]);
                                        return (
                                            <div
                                                key={asset.id}
                                                className="flex items-center gap-2 rounded-md border border-border/70 bg-background/60 p-1.5 text-xs"
                                            >
                                                <img
                                                    src={masks[asset.id]?.cutoutUrl ?? asset.url}
                                                    alt={asset.name}
                                                    className="size-10 rounded border border-border object-contain"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate font-medium text-foreground">
                                                        {index + 1}. {asset.name}
                                                    </p>
                                                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                                        {isSegmenting ? (
                                                            <>
                                                                <Loader2 className="size-3 animate-spin text-primary" />
                                                                正在自动识别主体…
                                                            </>
                                                        ) : hasMask ? (
                                                            <>
                                                                <CheckCircle2 className="size-3 text-emerald-500" />
                                                                已自动识别主体
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Sparkles className="size-3 text-primary" />
                                                                待自动识别
                                                            </>
                                                        )}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditing(asset)}
                                                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-border px-2 text-xs text-foreground hover:bg-accent"
                                                >
                                                    <Brush className="size-3.5" />
                                                    精修选区
                                                </button>
                                            </div>
                                        );
                                    })}
                                    {!assets.length ? (
                                        <p className="text-xs text-muted-foreground">上传图片后将自动识别商品主体。</p>
                                    ) : null}
                                </div>
                            </ToolConfigSection>
                        </div>

                        <div className="shrink-0 space-y-2 border-t border-border pt-2.5">
                            <button
                                type="button"
                                disabled={!assets.length || running}
                                onClick={() => void generate()}
                                data-testid={`pixel-submit-${toolId}`}
                                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                            >
                                {running ? <Loader2 className="size-4 animate-spin" /> : null}
                                {running ? "正在处理…" : meta.action}
                            </button>
                            {error ? (
                                <p role="alert" className="text-xs leading-5 text-destructive">
                                    {error}
                                </p>
                            ) : null}
                        </div>
                    </div>
                }
            >
                <div className="flex items-center justify-between border-b border-border pr-2">
                    <div className="flex items-center gap-1">
                        {(["result", "history"] as const).map((item) => (
                            <button
                                key={item}
                                type="button"
                                onClick={() => setTab(item)}
                                aria-pressed={tab === item}
                                className={`h-9 border-b-2 px-3 text-sm ${
                                    tab === item ? "border-selected text-foreground" : "border-transparent text-muted-foreground"
                                }`}
                            >
                                {item === "result" ? "生成结果" : "历史记录"}
                            </button>
                        ))}
                    </div>
                    {isWhiteBg ? (
                        <span className="text-xs text-muted-foreground">
                            规格：{WHITE_BG_SIZE_PRESETS.find((item) => item.id === sizePreset)?.label} · 留白 {paddingPercent}%
                        </span>
                    ) : (
                        <span className="text-xs text-muted-foreground">
                            背景预览：{MATTING_PREVIEW_BACKGROUNDS.find((item) => item.id === previewBg)?.label}
                        </span>
                    )}
                </div>
                {tab === "result" ? (
                    <div
                        className="min-h-0 flex-1 overflow-y-auto rounded-md p-1"
                        style={
                            !isWhiteBg && previewBg === "black"
                                ? { backgroundColor: "#18181b" }
                                : !isWhiteBg && previewBg === "white"
                                  ? { backgroundColor: "#ffffff" }
                                  : !isWhiteBg && previewBg === "stone"
                                    ? { backgroundColor: "#e7e5df" }
                                    : undefined
                        }
                    >
                        <ToolResult
                            task={activeTask}
                            toolId={toolId}
                            title="生成结果"
                            sourceUrl={assets[0]?.url}
                            emptyTitle={isWhiteBg ? "上传商品图一键生成标准白底图" : "批量上传商品图自动抠除背景"}
                            emptyHint={
                                isWhiteBg
                                    ? "自动提取商品主体并合成高纯度电商白底图，支持尺寸与留白调节。"
                                    : "自动识别商品主体并输出透明背景 PNG，支持切换底色预览与手动精修。"
                            }
                        />
                    </div>
                ) : (
                    <ToolTaskHistory
                        toolId={toolId}
                        selectWithoutResult
                        onSelectTask={(selected) => void restoreTask(selected)}
                    />
                )}
            </ToolWorkspaceColumns>
            {editing ? (
                <ProductBgCutout
                    src={editing.url}
                    name={editing.name}
                    maskSrc={masks[editing.id]?.source === "mask" ? masks[editing.id].url : undefined}
                    onCancel={() => setEditing(null)}
                    onConfirm={confirmMask}
                />
            ) : null}
        </>
    );
}

export { pixelInputSnapshot };
export type { PixelAsset };
