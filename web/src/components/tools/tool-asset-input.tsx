import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

export type ToolAssetInputProps = {
    toolId: string;
    /** 单工具覆盖默认限制（格式/大小/像素/时长） */
    constraints?: Partial<ToolAssetConstraints>;
    maxCount?: number;
    /** 资产库（作品库/商品库）条目，来自 use-asset-store 的适配结果 */
    library?: ToolAssetLibraryItem[];
    disabled?: boolean;
    title?: string;
    className?: string;
    /** 选择结果变化：成功入库的 id 与记录（顺序即用户顺序） */
    onChange?: (assetIds: string[], records: ToolAssetRecord[]) => void;
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
export function ToolAssetInput({ toolId, constraints, maxCount, library, disabled, title = "上传素材", className, onChange }: ToolAssetInputProps) {
    const effectiveConstraints = useMemo(() => resolveToolAssetConstraints(constraints), [constraints]);
    const [items, setItems] = useState<AssetItem[]>([]);
    const [notice, setNotice] = useState("");
    const [dragging, setDragging] = useState(false);
    const [hydratedDraft, setHydratedDraft] = useState(false);
    const itemsRef = useRef<AssetItem[]>([]);
    const controllers = useRef(new Map<string, AbortController>());
    const inputRef = useRef<HTMLInputElement | null>(null);

    const patchDraft = useToolDraftStore((state) => state.patch);
    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const conflict = useToolDraftStore((state) => state.conflicts[toolId]);
    const quarantined = useToolDraftStore((state) => state.quarantined[toolId]);
    const resolveConflict = useToolDraftStore((state) => state.resolveConflict);

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
                    patchDraft(toolId, { assetIds: ids });
                    emit(next);
                }
                return next;
            });
        },
        [emit, patchDraft, toolId],
    );

    // 刷新恢复：草稿 assetIds → 资产索引 → 真实 Blob URL；丢失的 id 从草稿剪掉。
    useEffect(() => {
        let alive = true;
        void (async () => {
            const draft = await hydrateDraft(toolId);
            if (!alive) return;
            setHydratedDraft(true);
            const ids = draft?.assetIds ?? [];
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
                patchDraft(toolId, { assetIds: restored.map((item) => item.record!.id) });
            }
        })();
        return () => {
            alive = false;
        };
    }, [emit, hydrateDraft, patchDraft, toolId]);

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
        const ids = useToolDraftStore.getState().drafts[toolId]?.assetIds ?? [];
        const { records } = await loadToolAssetRecords(ids);
        const restored: AssetItem[] = records.map((record) => ({ key: record.id, name: record.name, bytes: record.bytes, mimeType: record.mimeType, status: "ready", progress: { phase: "done", loaded: record.bytes, total: record.bytes, ratio: 1 }, record }));
        itemsRef.current = restored;
        setItems(restored);
        emit(restored);
    }, [emit, resolveConflict, toolId]);

    const readyCount = items.filter((item) => item.status === "ready").length;
    const atLimit = Boolean(maxCount && readyCount >= maxCount);
    const accept = effectiveConstraints.mimeTypes.join(",");

    return (
        <section className={cn("space-y-3", className)} aria-busy={items.some((item) => item.status === "uploading")} data-tool-asset-input={toolId}>
            <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-medium text-stone-800 dark:text-stone-100">{title}</h3>
                <span className="text-xs text-stone-500">
                    {readyCount}
                    {maxCount ? ` / ${maxCount}` : ""} 个 · {formatMimeList(effectiveConstraints.mimeTypes)} · ≤ {formatBytesLabel(effectiveConstraints.maxBytes)}
                </span>
            </div>

            {quarantined ? <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">检测到旧版本草稿，已隔离保存，未载入当前表单。</p> : null}
            {conflict ? (
                <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert">
                    <p>另一个标签页更新了「{toolId}」的草稿（版本 {conflict.remote.revision}，本页 {conflict.local.revision}）。</p>
                    <div className="flex gap-2">
                        <button type="button" className="rounded-md border border-amber-400 px-2 py-1" onClick={() => void resolveConflict(toolId, "local")}>
                            使用本页版本
                        </button>
                        <button type="button" className="rounded-md border border-amber-400 px-2 py-1" onClick={() => void useOtherTabDraft()}>
                            使用其他标签页版本
                        </button>
                    </div>
                </div>
            ) : null}

            <div
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-disabled={disabled || atLimit}
                aria-label={atLimit ? "已达数量上限" : "点击或拖拽上传素材"}
                className={cn(
                    "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-4 py-6 text-center text-xs transition",
                    dragging ? "border-stone-500 bg-stone-100 dark:bg-stone-800" : "border-stone-300 dark:border-stone-700",
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
                <span className="text-stone-700 dark:text-stone-200">{atLimit ? "已达数量上限，先移除一个再上传" : "点击选择本地文件，或拖拽到这里"}</span>
                <span className="text-stone-500">校验格式 / 大小 / 像素，入库后可刷新恢复</span>
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

            {notice ? <p className="text-xs text-stone-500">{notice}</p> : null}

            {items.length ? (
                <ul className="space-y-2" data-testid="tool-asset-list">
                    {items.map((item) => (
                        <li key={item.key} className="flex items-center gap-3 rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-800" data-status={item.status}>
                            {item.record?.mimeType.startsWith("image/") ? (
                                <img src={item.record.url} alt={item.name} className="size-12 shrink-0 rounded-md object-cover" />
                            ) : item.record?.mimeType.startsWith("video/") ? (
                                <video src={item.record.url} className="size-12 shrink-0 rounded-md object-cover" muted />
                            ) : (
                                <span
                                    className="flex size-12 shrink-0 items-center justify-center rounded-md border border-dashed border-stone-300 text-[10px] text-stone-400 dark:border-stone-700 dark:text-stone-500"
                                    aria-hidden="true"
                                >
                                    {item.status === "error" ? "!" : "…"}
                                </span>
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs text-stone-800 dark:text-stone-100">{item.name || "未命名文件"}</p>
                                <p className="truncate text-[11px] text-stone-500">
                                    {formatBytesLabel(item.bytes)}
                                    {item.record?.width && item.record?.height ? ` · ${item.record.width}×${item.record.height}` : ""}
                                    {item.record?.mimeType ? ` · ${item.record.mimeType}` : ""}
                                </p>
                                {item.status === "uploading" ? (
                                    <div className="mt-1 space-y-1">
                                        <progress className="h-1 w-full" value={Math.round(item.progress.ratio * 100)} max={100} data-testid="tool-asset-progress" />
                                        <p className="text-[11px] text-stone-500">{phaseLabel(item.progress)}</p>
                                    </div>
                                ) : null}
                                {item.status === "error" ? <p className="mt-1 text-[11px] text-red-600 dark:text-red-400" role="alert">{item.issue?.message}</p> : null}
                            </div>
                            <button
                                type="button"
                                className="shrink-0 rounded-md border border-stone-300 px-2 py-1 text-[11px] text-stone-600 dark:border-stone-700 dark:text-stone-300"
                                onClick={() => (item.status === "uploading" ? cancelItem(item.key) : void removeItem(item))}
                            >
                                {item.status === "uploading" ? "取消" : "移除"}
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-xs text-stone-500">{hydratedDraft ? "还没有素材" : "正在恢复上次的素材…"}</p>
            )}

            {library?.length ? (
                <details className="rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-800">
                    <summary className="cursor-pointer text-xs text-stone-600 dark:text-stone-300">从资产库选择（{library.length}）</summary>
                    <ul className="mt-2 grid grid-cols-2 gap-2">
                        {library.map((libraryItem) => (
                            <li key={libraryItem.id} className="flex items-center gap-2 rounded-md border border-stone-200 p-1 dark:border-stone-800">
                                <img src={libraryItem.url} alt={libraryItem.name} className="size-8 rounded object-cover" />
                                <span className="min-w-0 flex-1 truncate text-[11px]">{libraryItem.name}</span>
                                <button type="button" className="rounded border border-stone-300 px-1.5 py-0.5 text-[11px]" disabled={disabled || libraryItem.kind !== effectiveConstraints.kind} onClick={() => void addFromLibrary(libraryItem)}>
                                    使用
                                </button>
                            </li>
                        ))}
                    </ul>
                </details>
            ) : null}
        </section>
    );
}
