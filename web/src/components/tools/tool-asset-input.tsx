import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { cn, randomId } from "@/lib/utils";
import {
    ToolAssetError,
    adoptLibraryAsset,
    formatBytesLabel,
    formatMimeList,
    loadToolAssetRecords,
    removeToolAsset,
    resolveToolAssetConstraints,
    uploadToolAsset,
    validateToolAssetCount,
    type ToolAssetConstraints,
    type ToolAssetIssue,
    type ToolAssetLibraryItem,
    type ToolAssetRecord,
    type ToolAssetUploadProgress,
} from "@/services/api/tools/assets";
import { flushToolDrafts, useToolDraftStore } from "@/stores/use-tool-draft-store";
import { useTranslation } from "react-i18next";

export type ToolAssetSampleItem = {
    id: string;
    url: string;
    label?: string;
};

const DEFAULT_IMAGE_SAMPLES: ToolAssetSampleItem[] = [
    { id: "sample-1", url: "/__cases/product-scene/1983831220118597632-source.webp", label: "示例 1" },
    { id: "sample-2", url: "/__cases/product-scene/1984091344636719104-source.webp", label: "示例 2" },
    { id: "sample-3", url: "/__cases/product-scene/1740339005955035136-source.webp", label: "示例 3" },
    { id: "sample-4", url: "/__cases/product-scene/1740552538122670080-source.webp", label: "示例 4" },
];

export type ToolAssetInputProps = {
    toolId: string;
    /**
     * 同一工具里出现多个上传区时的草稿槽位（如 "video" / "ref-images"）。
     * 不传则用草稿顶层 `assetIds`（单上传区工具的旧行为）；
     * 传了则读写 `draft.values["assetSlot:<slot>"]`，避免两个上传区互相覆盖已选素材。
     */
    draftSlot?: string;
    /** 单工具覆盖默认限制（格式/大小/像素/时长） */
    constraints?: Partial<ToolAssetConstraints>;
    maxCount?: number;
    /** 资产库（作品库/商品库）条目，来自 use-asset-store 的适配结果 */
    library?: ToolAssetLibraryItem[];
    /** 上传框下方的「或试试这些」示例图列表；传 null 显式关闭，不传且为图片上传时展示默认示例 */
    samples?: ToolAssetSampleItem[] | null;
    disabled?: boolean;
    title?: string;
    className?: string;
    /**
     * `linkfox`：原站商品套图的上传卡——「从本地上传」主按钮 + 下方两个库按钮 + 限制提示行，
     * 没有默认的标题行/居中提示文案。默认值保持旧行为，其它工具不受影响。
     */
    variant?: "default" | "linkfox";
    /** 主按钮文案（linkfox 变体默认「从本地上传」） */
    uploadLabel?: string;
    /** 主按钮下方的附加动作（如「从作品库选择」「从商品库选择」） */
    actions?: ReactNode;
    /** linkfox 变体：上传区顶部提示（原站「点击上传」，蓝色 12px） */
    dropLabel?: string;
    /** linkfox 变体：替换第三个按钮（原站部分工具此处是「批量高清放大」而非「从商品库选择」）；传 null 表示不渲染第三按钮 */
    thirdAction?: ReactNode | null;
    /** 上传卡底部的限制提示行 */
    hint?: ReactNode;
    /** linkfox 变体：按钮/提示行按容器宽度铺满（原站画布内 490px 卡片），默认 210px 固定宽度 */
    wide?: boolean;
    /** linkfox 变体：压缩上传卡高度（原站场景裂变卡片更矮，152 而非 249） */
    compact?: boolean;
    /** 选择结果变化：成功入库的 id 与记录（顺序即用户顺序） */
    onChange?: (assetIds: string[], records: ToolAssetRecord[]) => void;
    /**
     * 外部改选：父组件（做同款 / 历史回填 / 任务恢复）把一组资产 id 写进表单时，
     * 用这个 prop 把上传区列表同步过去；不传则保持旧行为（只由用户操作驱动）。
     * 传入的 id 与当前列表一致时不做任何事，不会形成回环。
     */
    syncIds?: string[];
};

type AssetItem = {
    key: string;
    name: string;
    bytes: number;
    mimeType: string;
    status: "uploading" | "ready" | "error";
    progress: ToolAssetUploadProgress;
    record?: ToolAssetRecord;
    issue?: ToolAssetIssue;
};

const emptyProgress = (total: number): ToolAssetUploadProgress => ({ phase: "reading", loaded: 0, total, ratio: 0 });
const readyKeys = (items: AssetItem[]) => new Set(items.filter((item) => item.status === "ready").map((item) => item.key));

function phaseLabel(progress: ToolAssetUploadProgress) {
    if (progress.phase === "reading") return `读取 ${Math.round(progress.ratio * 100)}%（${formatBytesLabel(progress.loaded)} / ${formatBytesLabel(progress.total)}）`;
    if (progress.phase === "storing") return "写入本地库存…";
    return "完成";
}

/**
 * 资产输入：真实 `<input type=file>` / 拖拽 → `uploadToolAsset`（真实落库、真实字节进度、可取消）
 * → 资产 id 写入草稿（刷新后由草稿 + 资产索引恢复）。
 */
export function ToolAssetInput({ toolId, draftSlot, constraints, maxCount, library, samples, disabled, title = "上传素材", className, variant = "default", uploadLabel, actions, thirdAction, dropLabel, hint, wide, compact, onChange, syncIds }: ToolAssetInputProps) {
    const { t } = useTranslation();
    const effectiveConstraints = useMemo(() => resolveToolAssetConstraints(constraints), [constraints]);
    const [items, setItems] = useState<AssetItem[]>([]);
    const [notice, setNotice] = useState("");
    const [dragging, setDragging] = useState(false);
    const [hydratedDraft, setHydratedDraft] = useState(false);
    const [libraryModalOpen, setLibraryModalOpen] = useState(false);
    const [libraryTab, setLibraryTab] = useState<"mine" | "history">("mine");
    const [librarySearch, setLibrarySearch] = useState("");
    const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);
    const itemsRef = useRef<AssetItem[]>([]);
    const libraryRef = useRef<HTMLDetailsElement | null>(null);
    const controllers = useRef(new Map<string, AbortController>());
    const inputRef = useRef<HTMLInputElement | null>(null);

    const patchDraft = useToolDraftStore((state) => state.patch);
    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const conflict = useToolDraftStore((state) => state.conflicts[toolId]);
    const quarantined = useToolDraftStore((state) => state.quarantined[toolId]);
    const resolveConflict = useToolDraftStore((state) => state.resolveConflict);

    /** 槽位键：`draftSlot` 存在时把已选资产 id 放进 `draft.values["assetSlot:<slot>"]`，
     *  避免同工具多个上传区共用顶层 `assetIds` 互相覆盖（刷新后把视频槽恢复成图片这类问题）。 */
    const slotKey = draftSlot ? `assetSlot:${draftSlot}` : null;
    const patchSlotIds = useCallback(
        (ids: string[]) => {
            if (slotKey) patchDraft(toolId, { values: { [slotKey]: ids } });
            else patchDraft(toolId, { assetIds: ids });
        },
        [patchDraft, slotKey, toolId],
    );
    const readSlotIds = useCallback(
        (draft: { values?: Record<string, unknown>; assetIds?: string[] } | null | undefined): string[] => {
            if (slotKey) {
                const raw = draft?.values?.[slotKey];
                return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
            }
            return draft?.assetIds ?? [];
        },
        [slotKey],
    );

    /** 最新 onChange 放 ref：父组件常用内联箭头，若进依赖会让下方的恢复 effect 每次渲染都重跑，
     *  形成「effect → emit → 父组件 setState → 重渲染 → effect」自激循环（会清空蒙版笔画）。 */
    const onChangeRef = useRef(onChange);
    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    const emit = useCallback((next: AssetItem[]) => {
        const records = next.flatMap((item) => (item.record ? [item.record] : []));
        onChangeRef.current?.(
            records.map((record) => record.id),
            records,
        );
    }, []);

    const updateItems = useCallback(
        (updater: (list: AssetItem[]) => AssetItem[], options: { syncDraft?: boolean } = {}) => {
            setItems((previous) => {
                const next = updater(previous);
                itemsRef.current = next;
                if (options.syncDraft !== false) {
                    const ids = next.filter((item) => item.status === "ready" && item.record).map((item) => item.record!.id);
                    patchSlotIds(ids);
                    emit(next);
                }
                return next;
            });
        },
        [emit, patchSlotIds],
    );

    // 刷新恢复：草稿 assetIds → 资产索引 → 真实 Blob URL；丢失的 id 从草稿剪掉。
    useEffect(() => {
        let alive = true;
        void (async () => {
            const draft = await hydrateDraft(toolId);
            if (!alive) return;
            setHydratedDraft(true);
            const ids = readSlotIds(draft);
            if (!ids.length) return;
            const { records, lostIds } = await loadToolAssetRecords(ids);
            if (!alive) return;
            const restored: AssetItem[] = records.map((record) => ({
                key: record.id,
                name: record.name,
                bytes: record.bytes,
                mimeType: record.mimeType,
                status: "ready",
                progress: { phase: "done", loaded: record.bytes, total: record.bytes, ratio: 1 },
                record,
            }));
            itemsRef.current = restored;
            setItems(restored);
            emit(restored);
            if (lostIds.length) {
                setNotice(`已清理 ${lostIds.length} 个本地已不存在的素材`);
                patchSlotIds(restored.map((item) => item.record!.id));
            }
        })();
        return () => {
            alive = false;
        };
    }, [emit, hydrateDraft, patchSlotIds, readSlotIds, toolId]);

    // 外部改选（做同款 / 历史回填 / 任务恢复）：父组件换了 syncIds 时把列表同步过来。
    // 只做「父 → 上传区」单向同步，不回 emit，避免与父组件状态互相驱动；列表已一致时直接返回。
    const syncKey = syncIds ? syncIds.filter((id) => typeof id === "string" && id.length > 0).join("|") : "";
    const syncIdsRef = useRef(syncIds);
    syncIdsRef.current = syncIds;
    useEffect(() => {
        if (!syncKey) return;
        const wanted = syncKey.split("|");
        const current = itemsRef.current.filter((item) => item.status === "ready" && item.record).map((item) => item.record!.id);
        if (wanted.length === current.length && wanted.every((id, index) => id === current[index])) return;
        let alive = true;
        void (async () => {
            const { records, lostIds } = await loadToolAssetRecords(wanted);
            if (!alive) return;
            const restored: AssetItem[] = records.map((record) => ({
                key: record.id,
                name: record.name,
                bytes: record.bytes,
                mimeType: record.mimeType,
                status: "ready",
                progress: { phase: "done", loaded: record.bytes, total: record.bytes, ratio: 1 },
                record,
            }));
            itemsRef.current = restored;
            setItems(restored);
            patchSlotIds(restored.map((item) => item.record!.id));
            if (lostIds.length) setNotice(`已清理 ${lostIds.length} 个本地已不存在的素材`);
        })();
        return () => {
            alive = false;
        };
    }, [patchSlotIds, syncKey]);

    // 卸载：取消进行中的上传并立刻落盘草稿（不等 500ms 防抖）。
    useEffect(() => {
        const running = controllers.current;
        return () => {
            running.forEach((controller) => controller.abort());
            running.clear();
            void flushToolDrafts([toolId]);
        };
    }, [toolId]);

    const pickFiles = useCallback(
        async (files: File[]) => {
            if (disabled || !files.length) return;
            for (const file of files) {
                const ready = itemsRef.current.filter((item) => item.status === "ready").length;
                const countIssue = validateToolAssetCount(ready, maxCount);
                if (countIssue) {
                    updateItems((list) => [...list, { key: randomId(), name: file.name, bytes: file.size, mimeType: file.type, status: "error", progress: emptyProgress(file.size), issue: countIssue }], { syncDraft: false });
                    continue;
                }
                const key = randomId();
                const controller = new AbortController();
                controllers.current.set(key, controller);
                updateItems((list) => [...list, { key, name: file.name, bytes: file.size, mimeType: file.type, status: "uploading", progress: emptyProgress(file.size) }], { syncDraft: false });
                try {
                    const record = await uploadToolAsset(file, {
                        constraints: effectiveConstraints,
                        signal: controller.signal,
                        onProgress: (progress) => updateItems((list) => list.map((item) => (item.key === key ? { ...item, progress } : item)), { syncDraft: false }),
                    });
                    updateItems((list) => list.map((item) => (item.key === key ? { ...item, status: "ready" as const, record, name: record.name, bytes: record.bytes, mimeType: record.mimeType } : item)));
                } catch (error) {
                    const issue = error instanceof ToolAssetError ? error.issue : ({ code: "store-failed", message: error instanceof Error ? error.message : "上传失败" } as ToolAssetIssue);
                    updateItems((list) => list.map((item) => (item.key === key ? { ...item, status: "error" as const, issue } : item)), { syncDraft: false });
                } finally {
                    controllers.current.delete(key);
                }
            }
        },
        [disabled, effectiveConstraints, maxCount, updateItems],
    );

    const cancelItem = useCallback(
        (key: string) => {
            const controller = controllers.current.get(key);
            controller?.abort();
            controllers.current.delete(key);
            updateItems((list) => list.filter((item) => item.key !== key), { syncDraft: false });
        },
        [updateItems],
    );

    const removeItem = useCallback(
        async (item: AssetItem) => {
            if (item.status === "uploading") {
                cancelItem(item.key);
                return;
            }
            if (item.record) await removeToolAsset(item.record);
            updateItems((list) => list.filter((entry) => entry.key !== item.key));
        },
        [cancelItem, updateItems],
    );

    const addFromLibrary = useCallback(
        async (libraryItem: ToolAssetLibraryItem) => {
            const ready = itemsRef.current.filter((item) => item.status === "ready").length;
            const countIssue = validateToolAssetCount(ready, maxCount);
            if (countIssue) {
                setNotice(countIssue.message);
                return;
            }
            const record = await adoptLibraryAsset(libraryItem);
            updateItems((list) => [
                ...list,
                { key: record.id, name: record.name, bytes: record.bytes, mimeType: record.mimeType, status: "ready", progress: { phase: "done", loaded: record.bytes, total: record.bytes, ratio: 1 }, record },
            ]);
        },
        [maxCount, updateItems],
    );

    const useOtherTabDraft = useCallback(async () => {
        await resolveConflict(toolId, "remote");
        const ids = readSlotIds(useToolDraftStore.getState().drafts[toolId]);
        const { records } = await loadToolAssetRecords(ids);
        const restored: AssetItem[] = records.map((record) => ({ key: record.id, name: record.name, bytes: record.bytes, mimeType: record.mimeType, status: "ready", progress: { phase: "done", loaded: record.bytes, total: record.bytes, ratio: 1 }, record }));
        itemsRef.current = restored;
        setItems(restored);
        emit(restored);
    }, [emit, readSlotIds, resolveConflict, toolId]);

    const readyCount = items.filter((item) => item.status === "ready").length;
    const atLimit = Boolean(maxCount && readyCount >= maxCount);
    const accept = effectiveConstraints.mimeTypes.join(",");

    const linkfox = variant === "linkfox";
    const atLimitForDisplay = Boolean(atLimit);
    const resolvedSamples = useMemo(
        () => (samples === null ? [] : samples ?? (effectiveConstraints.kind === "image" ? DEFAULT_IMAGE_SAMPLES : [])),
        [effectiveConstraints.kind, samples],
    );

    const pickSample = useCallback(
        async (sample: ToolAssetSampleItem) => {
            if (disabled || atLimit) return;
            try {
                const response = await fetch(sample.url);
                if (!response.ok) throw new Error(`示例读取失败（HTTP ${response.status}）`);
                const blob = await response.blob();
                const ext = (sample.url.split("?")[0].split(".").pop() ?? "webp").toLowerCase();
                const mime = blob.type || (ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/webp");
                await pickFiles([new File([blob], `${sample.id}.${ext}`, { type: mime })]);
            } catch (error) {
                setNotice(error instanceof Error ? error.message : "示例图加载失败");
            }
        },
        [atLimit, disabled, pickFiles],
    );

    const confirmLibraryModal = useCallback(async () => {
        if (!library?.length || !selectedLibraryIds.length) {
            setLibraryModalOpen(false);
            return;
        }
        const byId = new Map(library.map((entry) => [entry.id, entry]));
        for (const id of selectedLibraryIds) {
            const found = byId.get(id);
            if (found) await addFromLibrary(found);
        }
        setSelectedLibraryIds([]);
        setLibraryModalOpen(false);
    }, [addFromLibrary, library, selectedLibraryIds]);

    return (
        <section className={cn("space-y-3", className)} aria-busy={items.some((item) => item.status === "uploading")} data-tool-asset-input={toolId} data-variant={variant}>
            {linkfox ? null : (
            <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-medium text-foreground">{title}</h3>
                <span className="text-xs text-muted-foreground">
                    {readyCount}
                    {t("toolChrome.quotaLine", {
                        ready: readyCount,
                        max: maxCount ? ` / ${maxCount}` : "",
                        mime: formatMimeList(effectiveConstraints.mimeTypes),
                        size: formatBytesLabel(effectiveConstraints.maxBytes),
                    })}
                </span>
            </div>
            )}

            {quarantined ? <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">检测到旧版本草稿，已隔离保存，未载入当前表单。</p> : null}
            {conflict ? (
                <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300" role="alert">
                    <p>另一个标签页更新了「{toolId}」的草稿（版本 {conflict.remote.revision}，本页 {conflict.local.revision}）。</p>
                    <div className="flex gap-2">
                        <button type="button" className="rounded-md border border-amber-500/40 px-2 py-1" onClick={() => void resolveConflict(toolId, "local")}>
                            使用本页版本
                        </button>
                        <button type="button" className="rounded-md border border-amber-500/40 px-2 py-1" onClick={() => void useOtherTabDraft()}>
                            使用其他标签页版本
                        </button>
                    </div>
                </div>
            ) : null}

            <div
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-disabled={disabled || atLimit}
                aria-label={atLimit ? t("toolChrome.dropAtLimitAria") : t("toolChrome.dropAria")}
                className={cn(
                    linkfox
                        ? wide
                            ? cn(
                                  "flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 p-3 text-xs transition hover:border-selected",
                                  compact ? "min-h-[152px]" : "min-h-[249px]",
                              )
                            : "flex cursor-pointer flex-col items-start gap-2 rounded-xl border border-border bg-card p-3 text-xs transition hover:border-selected"
                        : "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-4 py-6 text-center text-xs transition",
                    dragging ? "border-selected bg-muted" : linkfox ? "" : "border-border",
                    (disabled || atLimit) && "cursor-not-allowed opacity-60",
                )}
                onClick={() => !disabled && !atLimit && inputRef.current?.click()}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        if (!disabled && !atLimit) inputRef.current?.click();
                    }
                }}
                onDragOver={(event) => {
                    event.preventDefault();
                    if (!disabled) setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    if (disabled) return;
                    void pickFiles(Array.from(event.dataTransfer?.files ?? []));
                }}
                data-testid="tool-asset-dropzone"
            >
                {linkfox ? (
                    <>
                        {dropLabel ? (
                            <span className={cn("text-xs leading-[15px] text-foreground", wide && "text-center")} data-testid="tool-asset-drop-label">
                                {dropLabel}
                            </span>
                        ) : null}
                        <button
                            type="button"
                            data-testid="tool-asset-upload-button"
                            disabled={disabled || atLimit}
                            onClick={(event) => {
                                event.stopPropagation();
                                event.preventDefault();
                                if (!disabled && !atLimit) inputRef.current?.click();
                            }}
                            className={cn(
                                "inline-flex h-6 items-center justify-center rounded-md bg-primary text-xs font-medium leading-none text-primary-foreground transition hover:opacity-90 disabled:opacity-50",
                                wide ? "w-full" : "w-[210px]",
                            )}
                        >
                            {uploadLabel ?? t("toolChrome.assetUpload")}
                        </button>
                        {actions || linkfox ? (
                            <div
                                className={cn("flex items-center gap-2", wide ? "w-full" : "w-[210px]")}
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => event.stopPropagation()}
                            >
                                {actions ?? (linkfox ? (

                            <>
                                <button
                                    type="button"
                                    data-testid="tool-asset-open-library-modal"
                                    className="h-6 w-[100px] rounded-md border border-border bg-card text-xs leading-none text-muted-foreground transition hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
                                    disabled={disabled || atLimit}
                                    title={library?.length ? t("toolChrome.assetFromLibraryTitle") : t("toolChrome.assetLibraryEmptyTitle")}
                                    onClick={() => {
                                        setSelectedLibraryIds([]);
                                        setLibraryModalOpen(true);
                                        if (libraryRef.current) libraryRef.current.open = true;
                                    }}
                                >
                                    {t("toolChrome.assetFromLibrary")}
                                </button>
                                {thirdAction === undefined ? (
                                <button
                                    type="button"
                                    data-testid="tool-asset-open-products-modal"
                                    className="h-6 w-[100px] rounded-md border border-border bg-card text-xs leading-none text-muted-foreground transition hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
                                    disabled={disabled || atLimit}
                                    onClick={() => {
                                        setLibraryTab("history");
                                        setSelectedLibraryIds([]);
                                        setLibraryModalOpen(true);
                                    }}
                                >
                                    {t("toolChrome.assetFromProducts")}
                                </button>
                                ) : thirdAction}
                            </>
                                ) : null)}
                            </div>
                        ) : null}
                        {hint ? <div className={cn("text-[11px] leading-4 text-muted-foreground", wide ? "w-full" : "w-[210px]")}>{hint}</div> : null}
                    </>
                ) : (
                    <>
                        <span className="text-foreground/70">
                            {atLimit ? t("toolChrome.dropAtLimit") : t("toolChrome.dropIdle")}
                        </span>
                        <span className="text-muted-foreground">{t("toolChrome.dropMeta")}</span>
                    </>
                )}
            </div>
            <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept={accept}
                multiple={!maxCount || maxCount > 1}
                disabled={disabled}
                data-testid="tool-asset-file-input"
                onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    event.target.value = "";
                    void pickFiles(files);
                }}
            />

            {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}

            {items.length ? (
                <ul className="space-y-2" data-testid="tool-asset-list">
                    {items.map((item) => (
                        <li key={item.key} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2" data-status={item.status}>
                            {item.record?.mimeType.startsWith("image/") ? (
                                <img src={item.record.url} alt={item.name} className="size-12 shrink-0 rounded-md object-cover" />
                            ) : item.record?.mimeType.startsWith("video/") ? (
                                <video src={item.record.url} className="size-12 shrink-0 rounded-md object-cover" muted />
                            ) : (
                                <span
                                    className="flex size-12 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-[10px] text-muted-foreground"
                                    aria-hidden="true"
                                >
                                    {item.status === "error" ? "!" : "…"}
                                </span>
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs text-foreground">{item.name || "未命名文件"}</p>
                                <p className="truncate text-[11px] text-muted-foreground">
                                    {formatBytesLabel(item.bytes)}
                                    {item.record?.width && item.record?.height ? ` · ${item.record.width}×${item.record.height}` : ""}
                                    {item.record?.mimeType ? ` · ${item.record.mimeType}` : ""}
                                </p>
                                {item.status === "uploading" ? (
                                    <div className="mt-1 space-y-1">
                                        <progress className="h-1 w-full" value={Math.round(item.progress.ratio * 100)} max={100} data-testid="tool-asset-progress" />
                                        <p className="text-[11px] text-muted-foreground">{phaseLabel(item.progress)}</p>
                                    </div>
                                ) : null}
                                {item.status === "error" ? <p className="mt-1 text-[11px] text-destructive" role="alert">{item.issue?.message}</p> : null}
                            </div>
                            <button
                                type="button"
                                className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] text-foreground/70 hover:bg-accent"
                                onClick={() => (item.status === "uploading" ? cancelItem(item.key) : void removeItem(item))}
                            >
                                {item.status === "uploading" ? t("toolChrome.itemCancel") : t("toolChrome.itemRemove")}
                            </button>
                        </li>
                    ))}
                </ul>
            ) : linkfox && hydratedDraft ? null : (
                <p className="text-xs text-muted-foreground">
                    {hydratedDraft ? t("toolChrome.assetsEmpty") : t("toolChrome.assetsRestoring")}
                </p>
            )}

            {readyCount === 0 && resolvedSamples.length > 0 ? (
                <div className="flex items-center gap-2 pt-0.5" data-testid="tool-asset-samples">
                    <span className="shrink-0 text-[11px] text-muted-foreground">或试试这些：</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                        {resolvedSamples.slice(0, 4).map((sample, idx) => (
                            <button
                                key={sample.id}
                                type="button"
                                disabled={disabled || atLimit}
                                title={sample.label ?? `示例 ${idx + 1}`}
                                data-testid={`tool-asset-sample-${idx}`}
                                onClick={() => void pickSample(sample)}
                                className="group relative size-9 overflow-hidden rounded-md border border-border bg-muted transition hover:border-selected disabled:opacity-50"
                            >
                                <img src={sample.url} alt={sample.label ?? `示例 ${idx + 1}`} className="size-full object-cover" loading="lazy" />
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            {library?.length ? (
                <details ref={libraryRef} className="hidden rounded-lg border border-border px-3 py-2">
                    <summary className="cursor-pointer text-xs text-foreground/70">
                        {t("toolChrome.librarySummary", { count: library.length })}
                    </summary>
                    <ul className="mt-2 grid grid-cols-2 gap-2">
                        {library.map((libraryItem) => (
                            <li key={libraryItem.id} className="flex items-center gap-2 rounded-md border border-border p-1">
                                <img src={libraryItem.url} alt={libraryItem.name} className="size-8 rounded object-cover" />
                                <span className="min-w-0 flex-1 truncate text-[11px]">{libraryItem.name}</span>
                                <button type="button" className="rounded border border-border px-1.5 py-0.5 text-[11px] hover:bg-accent" disabled={disabled || libraryItem.kind !== effectiveConstraints.kind} onClick={() => void addFromLibrary(libraryItem)}>
                                    {t("toolChrome.libraryUse")}
                                </button>
                            </li>
                        ))}
                    </ul>
                </details>
            ) : null}

            {libraryModalOpen ? (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="从素材库选择"
                    data-testid="tool-asset-library-modal"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
                    onClick={() => setLibraryModalOpen(false)}
                >
                    <div
                        className="flex max-h-[82vh] w-full max-w-2xl flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-border pb-2.5">
                            <div className="flex items-center gap-4">
                                <button
                                    type="button"
                                    onClick={() => setLibraryTab("mine")}
                                    className={cn(
                                        "text-sm font-medium transition-colors",
                                        libraryTab === "mine" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    我的素材（{(library ?? []).filter((entry) => entry.kind === effectiveConstraints.kind).length}）
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setLibraryTab("history")}
                                    className={cn(
                                        "text-sm font-medium transition-colors",
                                        libraryTab === "history" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    示例与商品库（{resolvedSamples.length}）
                                </button>
                            </div>
                            <input
                                type="search"
                                value={librarySearch}
                                onChange={(event) => setLibrarySearch(event.target.value)}
                                placeholder="搜索素材名称…"
                                className="h-7 w-44 rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-primary"
                            />
                        </div>

                        <div className="min-h-[240px] flex-1 overflow-y-auto">
                            {libraryTab === "mine" ? (
                                (library ?? []).filter(
                                    (entry) =>
                                        entry.kind === effectiveConstraints.kind &&
                                        (!librarySearch.trim() || entry.name.toLowerCase().includes(librarySearch.trim().toLowerCase())),
                                ).length > 0 ? (
                                    <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                                        {(library ?? [])
                                            .filter(
                                                (entry) =>
                                                    entry.kind === effectiveConstraints.kind &&
                                                    (!librarySearch.trim() || entry.name.toLowerCase().includes(librarySearch.trim().toLowerCase())),
                                            )
                                            .map((libraryItem) => {
                                                const checked = selectedLibraryIds.includes(libraryItem.id);
                                                return (
                                                    <li key={libraryItem.id}>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedLibraryIds((prev) =>
                                                                    prev.includes(libraryItem.id)
                                                                        ? prev.filter((id) => id !== libraryItem.id)
                                                                        : maxCount === 1
                                                                          ? [libraryItem.id]
                                                                          : [...prev, libraryItem.id],
                                                                );
                                                            }}
                                                            className={cn(
                                                                "group relative flex w-full flex-col overflow-hidden rounded-lg border p-1.5 text-left transition",
                                                                checked ? "border-selected bg-selected-soft" : "border-border hover:border-foreground/40",
                                                            )}
                                                        >
                                                            <img src={libraryItem.url} alt={libraryItem.name} className="aspect-square w-full rounded object-cover" />
                                                            <span className="mt-1 w-full truncate text-[11px] text-foreground">{libraryItem.name}</span>
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                    </ul>
                                ) : (
                                    <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
                                        暂无匹配的本地素材，可切换到「示例与商品库」或从本地上传
                                    </div>
                                )
                            ) : (
                                <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                                    {resolvedSamples.map((sample, idx) => (
                                        <li key={sample.id}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    void pickSample(sample);
                                                    setLibraryModalOpen(false);
                                                }}
                                                className="flex w-full flex-col overflow-hidden rounded-lg border border-border p-1.5 text-left transition hover:border-selected"
                                            >
                                                <img src={sample.url} alt={sample.label ?? `示例 ${idx + 1}`} className="aspect-square w-full rounded object-cover" />
                                                <span className="mt-1 w-full truncate text-[11px] text-foreground">{sample.label ?? `示例商品 ${idx + 1}`}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-border pt-2.5">
                            <button
                                type="button"
                                onClick={() => setLibraryModalOpen(false)}
                                className="h-8 rounded-md border border-border px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                                取消
                            </button>
                            {libraryTab === "mine" ? (
                                <button
                                    type="button"
                                    disabled={selectedLibraryIds.length === 0}
                                    data-testid="tool-asset-library-confirm"
                                    onClick={() => void confirmLibraryModal()}
                                    className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                                >
                                    确认选择（{selectedLibraryIds.length}）
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
}
