import { useCallback, useEffect, useRef, useState } from "react";
import { Image as ImageIcon, ImagePlus, Loader2, Upload, X } from "lucide-react";

import { ToolHistoryDock } from "@/components/tools/tool-history-dock";
import { cn } from "@/lib/utils";
import {
    adoptLibraryAsset,
    formatBytesLabel,
    getToolAssetRecordStore,
    toolAssetLibraryItemsFromAssets,
    type ToolAssetRecord,
} from "@/services/api/tools/assets";
import { assetCoverUrl, useAssetStore } from "@/stores/use-asset-store";

/**
 * 原站「素材选择面板」的逐字文案（工单 cw2 A 项）。
 * 文案不允许改写，改这里等于改验收口径。
 */
export const MATERIAL_SOURCE_TABS = [
    { id: "upload", label: "上传新图" },
    { id: "uploaded", label: "传过的图" },
    { id: "generated", label: "历史作图" },
    { id: "library", label: "素材库" },
] as const;

export type MaterialSourceTabId = (typeof MATERIAL_SOURCE_TABS)[number]["id"];

export const MATERIAL_FORMAT_HINT = "格式要求：支持jpg、jpeg、png、webp格式，10M以内";
export const MATERIAL_SIZE_HINT = "最小：384*384，最大：4096*4096，最大宽高比5";
export const MATERIAL_DROP_HINT = "或拖拽「 上传素材 」 到此处";

export type MaterialSourcePanelProps = {
    open: boolean;
    /** 当前工具 id：用于「历史作图」页签读本工具真实任务历史。 */
    toolId: string;
    disabled?: boolean;
    onClose: () => void;
    /** 上传新图：交给父组件做真实校验 + 入库（父组件已有 uploadStageFiles 之类实现）。 */
    onFiles: (files: File[]) => void | Promise<void>;
    /** 传过的图 / 素材库：挑中一条真实资产记录（已落库、可取字节）。 */
    onPick: (record: ToolAssetRecord) => void;
    formatHint?: string;
    sizeHint?: string;
};

/**
 * 素材选择面板（原站「上传素材」弹窗）。
 *
 * 四个页签都是真实数据源，不做占位：
 *  - 上传新图：真实 `<input type=file>` + 拖拽 → 父组件入库；
 *  - 传过的图：本机 `tool_assets` 索引里已入库的图片；
 *  - 历史作图：共享 `ToolHistoryDock` 读本工具真实任务历史；
 *  - 素材库：作品库（`useAssetStore`）里的图片，选中后 `adoptLibraryAsset` 复用同一份字节。
 */
export function MaterialSourcePanel({
    open,
    toolId,
    disabled,
    onClose,
    onFiles,
    onPick,
    formatHint = MATERIAL_FORMAT_HINT,
    sizeHint = MATERIAL_SIZE_HINT,
}: MaterialSourcePanelProps) {
    const [tab, setTab] = useState<MaterialSourceTabId>("upload");
    const [dragging, setDragging] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [passed, setPassed] = useState<ToolAssetRecord[]>([]);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const assets = useAssetStore((state) => state.assets);

    useEffect(() => {
        if (!open) return;
        setTab("upload");
        setError("");
        setDragging(false);
        setBusy(false);
    }, [open]);

    // ESC 关闭，和原站弹窗一致。
    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    // 「传过的图」：打开时读本机工具资产索引（真实已入库记录，按时间倒序）。
    useEffect(() => {
        if (!open) return;
        let alive = true;
        void (async () => {
            try {
                const store = await getToolAssetRecordStore();
                const all = await store.list();
                if (!alive) return;
                setPassed(
                    all
                        .filter((record) => record.kind === "image")
                        .sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""))
                        .slice(0, 30),
                );
            } catch {
                if (alive) setPassed([]);
            }
        })();
        return () => {
            alive = false;
        };
    }, [open]);

    const handleFiles = useCallback(
        async (files: File[]) => {
            if (!files.length || disabled || busy) return;
            setBusy(true);
            setError("");
            try {
                await onFiles(files);
                onClose();
            } catch (issue) {
                setError(issue instanceof Error ? issue.message : "上传失败，请重试");
            } finally {
                setBusy(false);
            }
        },
        [busy, disabled, onClose, onFiles],
    );

    const pickRecord = useCallback(
        (record: ToolAssetRecord) => {
            onPick(record);
            onClose();
        },
        [onClose, onPick],
    );

    const pickLibrary = useCallback(
        async (assetId: string) => {
            const asset = assets.find((item) => item.id === assetId);
            if (!asset || asset.kind !== "image") {
                setError("该素材不是图片，不能用作素材");
                return;
            }
            const [item] = toolAssetLibraryItemsFromAssets([
                {
                    id: asset.id,
                    kind: asset.kind,
                    title: asset.title,
                    coverUrl: asset.coverUrl,
                    data: {
                        url: asset.data.dataUrl,
                        storageKey: asset.data.storageKey,
                        bytes: asset.data.bytes,
                        mimeType: asset.data.mimeType,
                        width: asset.data.width,
                        height: asset.data.height,
                    },
                },
            ]);
            if (!item) {
                setError("该素材缺少可复用的文件，不能用作素材");
                return;
            }
            setBusy(true);
            setError("");
            try {
                const record = await adoptLibraryAsset(item);
                onPick(record);
                onClose();
            } catch (issue) {
                setError(issue instanceof Error ? issue.message : "素材入库失败，请重试");
            } finally {
                setBusy(false);
            }
        },
        [assets, onClose, onPick],
    );

    if (!open) return null;

    const library = assets.filter((asset) => asset.kind === "image").slice(0, 30);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="上传素材"
                data-testid="material-source-panel"
                className="flex max-h-[86vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_12px_48px_rgba(0,0,0,0.18)]"
            >
                <header className="flex h-[46px] shrink-0 items-center justify-between border-b border-border px-[14px]">
                    <span className="text-[14px] font-medium leading-[22px] text-foreground">上传素材</span>
                    <button
                        type="button"
                        aria-label="关闭"
                        data-testid="material-panel-close"
                        onClick={onClose}
                        className="flex size-6 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                        <X className="size-4" aria-hidden="true" />
                    </button>
                </header>

                <div role="tablist" className="flex shrink-0 items-stretch gap-[18px] border-b border-border px-[14px]">
                    {MATERIAL_SOURCE_TABS.map((item) => {
                        const active = tab === item.id;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                data-testid={`material-tab-${item.id}`}
                                onClick={() => setTab(item.id)}
                                className={cn(
                                    "relative flex h-[40px] items-center text-[14px] leading-[22px] transition-colors",
                                    active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {item.label}
                                {active ? <span className="absolute bottom-0 left-0 h-[2px] w-full rounded-full bg-foreground" /> : null}
                            </button>
                        );
                    })}
                </div>

                <div className="min-h-[260px] flex-1 overflow-y-auto px-[14px] py-[12px]">
                    {tab === "upload" ? (
                        <div>
                            <div
                                role="button"
                                tabIndex={0}
                                data-testid="material-dropzone"
                                aria-label="点击此处上传素材"
                                onClick={() => {
                                    if (!busy && !disabled) fileRef.current?.click();
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        if (!busy && !disabled) fileRef.current?.click();
                                    }
                                }}
                                onDragOver={(event) => {
                                    event.preventDefault();
                                    setDragging(true);
                                }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={(event) => {
                                    event.preventDefault();
                                    setDragging(false);
                                    void handleFiles(Array.from(event.dataTransfer.files));
                                }}
                                className={cn(
                                    "flex h-[186px] cursor-pointer flex-col items-center justify-center gap-[6px] rounded-[8px] border border-dashed transition-colors",
                                    dragging ? "border-selected bg-selected-soft" : "border-border bg-muted/40 hover:border-selected",
                                    (busy || disabled) && "cursor-not-allowed opacity-60",
                                )}
                            >
                                {busy ? (
                                    <Loader2 className="size-7 animate-spin text-muted-foreground" aria-hidden="true" />
                                ) : (
                                    <ImagePlus className="size-7 text-muted-foreground" aria-hidden="true" />
                                )}
                                <p className="text-[14px] leading-[22px] text-foreground">点击此处</p>
                                <p className="text-[13px] leading-[20px] text-muted-foreground">{MATERIAL_DROP_HINT}</p>
                            </div>
                            <p className="mt-[8px] text-[12px] leading-[18px] text-muted-foreground">{formatHint}</p>
                            <p className="mt-[2px] text-[12px] leading-[18px] text-muted-foreground">{sizeHint}</p>
                            <input
                                ref={fileRef}
                                type="file"
                                hidden
                                multiple
                                accept="image/jpeg,image/png,image/webp"
                                onChange={(event) => {
                                    const files = Array.from(event.target.files ?? []);
                                    event.target.value = "";
                                    void handleFiles(files);
                                }}
                            />
                        </div>
                    ) : null}

                    {tab === "uploaded" ? (
                        passed.length ? (
                            <ul className="grid grid-cols-5 gap-2" aria-label="传过的图">
                                {passed.map((record) => (
                                    <li key={record.id}>
                                        <button
                                            type="button"
                                            disabled={busy || disabled}
                                            data-testid="material-passed-item"
                                            onClick={() => pickRecord(record)}
                                            className="flex w-full flex-col gap-1 overflow-hidden rounded-md border border-border bg-background p-1 text-left transition hover:border-selected disabled:opacity-50"
                                        >
                                            <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded bg-muted">
                                                {record.url ? (
                                                    <img src={record.url} alt={record.name} className="size-full object-cover" />
                                                ) : (
                                                    <ImageIcon className="size-5 text-muted-foreground" aria-hidden="true" />
                                                )}
                                            </span>
                                            <span className="truncate text-[11px] leading-4 text-muted-foreground">
                                                {record.name} · {formatBytesLabel(record.bytes ?? 0)}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center">
                                <ImageIcon className="size-7 text-muted-foreground" aria-hidden="true" />
                                <p className="text-[13px] leading-[20px] text-muted-foreground">还没有传过的图，先在「上传新图」里传一张</p>
                            </div>
                        )
                    ) : null}

                    {tab === "generated" ? (
                        <ToolHistoryDock toolId={toolId} limit={6} />
                    ) : null}

                    {tab === "library" ? (
                        library.length ? (
                            <ul className="grid grid-cols-5 gap-2" aria-label="素材库">
                                {library.map((asset) => (
                                    <li key={asset.id}>
                                        <button
                                            type="button"
                                            disabled={busy || disabled}
                                            data-testid="material-library-item"
                                            onClick={() => void pickLibrary(asset.id)}
                                            className="flex w-full flex-col gap-1 overflow-hidden rounded-md border border-border bg-background p-1 text-left transition hover:border-selected disabled:opacity-50"
                                        >
                                            <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded bg-muted">
                                                {assetCoverUrl(asset) ? (
                                                    <img src={assetCoverUrl(asset)} alt={asset.title} className="size-full object-cover" />
                                                ) : (
                                                    <Upload className="size-5 text-muted-foreground" aria-hidden="true" />
                                                )}
                                            </span>
                                            <span className="truncate text-[11px] leading-4 text-muted-foreground">{asset.title}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center">
                                <Upload className="size-7 text-muted-foreground" aria-hidden="true" />
                                <p className="text-[13px] leading-[20px] text-muted-foreground">素材库还是空的，生成或上传的图片会自动入库</p>
                            </div>
                        )
                    ) : null}

                    {error ? <p className="mt-2 text-[12px] leading-[18px] text-destructive">{error}</p> : null}
                </div>
            </div>
        </div>
    );
}
