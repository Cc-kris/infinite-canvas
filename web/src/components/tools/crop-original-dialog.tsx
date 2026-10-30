import { useCallback, useEffect, useState } from "react";
import { Crop, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";

/** 裁剪比例候选（按原站「原图尺寸裁剪」的常见用途给足方形/竖版/横版）。 */
export const CROP_RATIOS = [
    { id: "1:1", label: "1:1", w: 1, h: 1 },
    { id: "3:4", label: "3:4", w: 3, h: 4 },
    { id: "4:3", label: "4:3", w: 4, h: 3 },
    { id: "9:16", label: "9:16", w: 9, h: 16 },
    { id: "16:9", label: "16:9", w: 16, h: 9 },
] as const;

export type CropRatioId = (typeof CROP_RATIOS)[number]["id"];

export type CropOriginalDialogProps = {
    open: boolean;
    /** 待裁剪的原图（blob:/data: URL，均为本机可读字节，canvas 不会污染）。 */
    src: string | null;
    onClose: () => void;
    /** 返回裁剪后的真实 PNG 文件；父组件负责入库/替换。 */
    onCropped: (file: File) => void | Promise<void>;
};

/** 居中裁出目标比例区域：先按宽度铺满，超出原图高度时再按高度收敛。 */
export function cropRectFor(naturalWidth: number, naturalHeight: number, ratio: { w: number; h: number }) {
    const aspect = ratio.w / ratio.h;
    let width = naturalWidth;
    let height = Math.round(width / aspect);
    if (height > naturalHeight) {
        height = naturalHeight;
        width = Math.round(height * aspect);
    }
    return {
        sx: Math.max(0, Math.round((naturalWidth - width) / 2)),
        sy: Math.max(0, Math.round((naturalHeight - height) / 2)),
        width: Math.max(1, width),
        height: Math.max(1, height),
    };
}

/**
 * 「点击这里裁剪原图尺寸」弹窗：真实 canvas 居中裁剪 → PNG 文件交回父组件。
 * 预览用 `object-cover` + 比例容器，和 canvas 的居中裁剪口径一致。
 */
export function CropOriginalDialog({ open, src, onClose, onCropped }: CropOriginalDialogProps) {
    const [ratioId, setRatioId] = useState<CropRatioId>("1:1");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) return;
        setRatioId("1:1");
        setError("");
        setBusy(false);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    const confirm = useCallback(async () => {
        if (!src) {
            setError("没有可裁剪的原图，请先上传商品图");
            return;
        }
        const ratio = CROP_RATIOS.find((item) => item.id === ratioId) ?? CROP_RATIOS[0];
        setBusy(true);
        setError("");
        try {
            const image = new Image();
            image.src = src;
            await image.decode();
            const rect = cropRectFor(image.naturalWidth || 1, image.naturalHeight || 1, ratio);
            const canvas = document.createElement("canvas");
            canvas.width = rect.width;
            canvas.height = rect.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("当前浏览器无法创建画布，裁剪失败");
            ctx.drawImage(image, rect.sx, rect.sy, rect.width, rect.height, 0, 0, rect.width, rect.height);
            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
            if (!blob) throw new Error("裁剪结果导出失败，请重试");
            await onCropped(new File([blob], `cropped-${ratioId.replace(":", "x")}.png`, { type: "image/png" }));
            onClose();
        } catch (issue) {
            setError(issue instanceof Error ? issue.message : "裁剪失败，请重试");
        } finally {
            setBusy(false);
        }
    }, [onClose, onCropped, ratioId, src]);

    if (!open) return null;
    const ratio = CROP_RATIOS.find((item) => item.id === ratioId) ?? CROP_RATIOS[0];

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
                aria-label="裁剪原图尺寸"
                data-testid="crop-original-dialog"
                className="flex max-h-[86vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_12px_48px_rgba(0,0,0,0.18)]"
            >
                <header className="flex h-[46px] shrink-0 items-center justify-between border-b border-border px-[14px]">
                    <span className="inline-flex items-center gap-1.5 text-[14px] font-medium leading-[22px] text-foreground">
                        <Crop className="size-4 text-muted-foreground" aria-hidden="true" />
                        裁剪原图尺寸
                    </span>
                    <button
                        type="button"
                        aria-label="关闭"
                        data-testid="crop-dialog-close"
                        onClick={onClose}
                        className="flex size-6 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                        <X className="size-4" aria-hidden="true" />
                    </button>
                </header>

                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[14px] py-[12px]">
                    <div className="flex items-center justify-center rounded-lg bg-muted/40 p-2">
                        {src ? (
                            <div
                                className="max-h-[300px] w-full overflow-hidden rounded"
                                style={{ aspectRatio: `${ratio.w} / ${ratio.h}`, maxWidth: 360 }}
                            >
                                <img src={src} alt="待裁剪原图" className="size-full object-cover" />
                            </div>
                        ) : (
                            <p className="py-10 text-[13px] leading-[20px] text-muted-foreground">请先上传商品图，再裁剪原图尺寸</p>
                        )}
                    </div>

                    <div>
                        <p className="mb-[6px] text-[12px] leading-[18px] text-muted-foreground">选择裁剪比例</p>
                        <div className="flex flex-wrap items-center gap-2">
                            {CROP_RATIOS.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    aria-pressed={ratioId === item.id}
                                    data-testid={`crop-ratio-${item.id}`}
                                    onClick={() => setRatioId(item.id)}
                                    className={cn(
                                        "inline-flex h-[26px] min-w-[44px] items-center justify-center rounded-md border px-2 text-[12px] leading-[16px] transition-colors",
                                        ratioId === item.id
                                            ? "border-primary/40 bg-primary/10 text-foreground"
                                            : "border-border bg-card text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {error ? <p className="text-[12px] leading-[18px] text-red-500">{error}</p> : null}
                </div>

                <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-[14px] py-[10px]">
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-[32px] items-center justify-center rounded-lg border border-border bg-card px-3 text-[13px] leading-[20px] text-foreground transition hover:bg-muted"
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        disabled={busy || !src}
                        data-testid="crop-confirm"
                        onClick={() => void confirm()}
                        className="inline-flex h-[32px] items-center justify-center gap-1 rounded-lg bg-primary px-3 text-[13px] leading-[20px] text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                    >
                        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                        确认裁剪
                    </button>
                </footer>
            </div>
        </div>
    );
}
