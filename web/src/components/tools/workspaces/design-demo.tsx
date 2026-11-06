import type { ReactNode } from "react";
import { ChevronRight, ImagePlus, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * 商品图设计 / 模特族配置列的两块原站通用结构（1600×1000 实测）：
 * - `TryDemoStrip`：上传卡内「或试试这些」= 分隔线（文字 12px 30% 黑）+ 4 张 40×40 示例图，间距 20，居中；
 *   点击由调用方真实入库（`uploadCaseFile`）再回填上传槽位，不是装饰。
 * - `DesignRowCard`：「选择手持姿势 / 选择穿衣模特 / 选择商品品类」行卡 = 灰底 + 1px 边 + 6px 圆角 + 10px 内边距，
 *   左缩略图、标题 14px、说明 12px、右箭头。
 */
export const DESIGN_ICON_FEATURE = "/__cases/design-common/icon-feature.png";

export function TryDemoStrip({ demos, onPick, busySrc, disabled }: { demos: { src: string; alt: string }[]; onPick: (src: string, index: number) => void; busySrc?: string | null; disabled?: boolean }) {
    return (
        <div className="mt-[10px]" data-testid="try-demo-strip">
            <div className="mx-auto flex w-[174px] items-center gap-4 text-[12px] leading-[15px] text-muted-foreground/70">
                <span className="h-px flex-1 bg-border" />
                或试试这些
                <span className="h-px flex-1 bg-border" />
            </div>
            <div className="mt-[10px] flex justify-center gap-5">
                {demos.map((demo, index) => (
                    <button
                        key={demo.src}
                        type="button"
                        title={demo.alt}
                        disabled={disabled || Boolean(busySrc)}
                        onClick={() => onPick(demo.src, index)}
                        className="relative size-10 overflow-hidden rounded-[4px] transition hover:opacity-80 disabled:cursor-not-allowed"
                    >
                        <img src={demo.src} alt={demo.alt} className="size-full object-cover" draggable={false} />
                        {busySrc === demo.src ? (
                            <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                                <Loader2 className="size-4 animate-spin text-white" />
                            </span>
                        ) : null}
                    </button>
                ))}
            </div>
        </div>
    );
}

export function DesignRowCard({ image, title, desc, onClick, open, imageClassName, testId, children }: { image: string; title: ReactNode; desc: ReactNode; onClick?: () => void; open?: boolean; imageClassName?: string; testId?: string; children?: ReactNode }) {
    return (
        <div className="rounded-[6px] border border-border bg-muted transition hover:border-selected" data-testid={testId}>
            <button type="button" aria-expanded={open} onClick={onClick} className="flex w-full items-center gap-[10px] p-[10px] text-left">
                <img src={image} alt="" className={cn("w-[60px] shrink-0 rounded-[4px] object-cover", imageClassName ?? "h-[60px]")} draggable={false} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] leading-[22px] text-foreground/80">{title}</span>
                    <span className="block truncate text-[12px] leading-[18px] text-muted-foreground">{desc}</span>
                </span>
                <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition", open && "rotate-90")} />
            </button>
            {open && children ? <div className="border-t border-border p-[10px]">{children}</div> : null}
        </div>
    );
}

/** 原站「上传多图，体验新功能商品套图 →」一类的描边主色按钮（268×32、6px 圆角、14px）。 */
export const DESIGN_OUTLINE_BUTTON = "mt-[10px] flex h-8 w-full items-center justify-center gap-1 rounded-[6px] border border-border bg-background px-[15px] text-[14px] leading-5 text-foreground transition hover:bg-accent disabled:opacity-50";

/** 原站上传卡外层 `_uploadPanel`：#f7f7f7 灰底、8px 圆角、10px 内边距（这里用主题 muted token）。 */
export const DESIGN_UPLOAD_PANEL = "relative rounded-[8px] bg-muted p-[10px]";

/** 原站 `_uploadBox`：虚线框高 196、内边距 16、顶部 40px 图片图标（`UploadPanelIcon`）+ 标题 + 按钮组 + 提示，自上而下间距 10。 */
export const DESIGN_UPLOAD_DROPZONE =
    "relative [&_[data-testid=tool-asset-dropzone]]:min-h-[196px] [&_[data-testid=tool-asset-dropzone]]:justify-start [&_[data-testid=tool-asset-dropzone]]:gap-[10px] [&_[data-testid=tool-asset-dropzone]]:rounded-[8px] [&_[data-testid=tool-asset-dropzone]]:bg-card/60 [&_[data-testid=tool-asset-dropzone]]:px-4 [&_[data-testid=tool-asset-dropzone]]:pb-4 [&_[data-testid=tool-asset-dropzone]]:pt-[66px] " +
    // 原站上传卡是单一入口：已上传图直接铺在虚线框里预览（右上「移除」），不在卡下平铺文件列表。
    "[&_[data-testid=tool-asset-list]]:absolute! [&_[data-testid=tool-asset-list]]:inset-x-0 [&_[data-testid=tool-asset-list]]:top-0 [&_[data-testid=tool-asset-list]]:z-20 [&_[data-testid=tool-asset-list]]:m-0! [&_[data-testid=tool-asset-list]]:h-[196px] [&_[data-testid=tool-asset-list]>li]:relative [&_[data-testid=tool-asset-list]>li]:h-full [&_[data-testid=tool-asset-list]>li]:justify-center [&_[data-testid=tool-asset-list]>li]:rounded-[8px]! [&_[data-testid=tool-asset-list]>li]:border-border! [&_[data-testid=tool-asset-list]>li]:bg-card [&_[data-testid=tool-asset-list]>li>img]:h-[172px]! [&_[data-testid=tool-asset-list]>li>img]:w-auto! [&_[data-testid=tool-asset-list]>li>img]:max-w-full [&_[data-testid=tool-asset-list]>li>img]:object-contain! [&_[data-testid=tool-asset-list]>li[data-status=ready]>div]:hidden [&_[data-testid=tool-asset-list]>li:not(:first-child)]:hidden [&_[data-testid=tool-asset-list]>li>button]:absolute [&_[data-testid=tool-asset-list]>li>button]:bottom-2 [&_[data-testid=tool-asset-list]>li>button]:right-2 [&_[data-testid=tool-asset-list]>li>button]:bg-card";

export function UploadPanelIcon({ className }: { className?: string }) {
    return <ImagePlus aria-hidden="true" strokeWidth={1.5} className={cn("pointer-events-none absolute left-1/2 top-[27px] z-10 size-10 -translate-x-1/2 text-muted-foreground", className)} />;
}

/**
 * 原站 `_caseItemWrap` 竖图轮播几何（ToolCaseGuide 默认是 352 方图 + 结果占余宽）：
 * 每张图 235×352，参数图之间 2px、末张参数图与结果之间 40px；卡片按内容收宽并居中，
 * 标签在卡内（图距卡顶 54px），内边距 16。
 */
export const DESIGN_GUIDE_PORTRAIT =
    "[&_[data-testid=tool-case-guide-card]]:w-fit! [&_[data-testid=tool-case-guide-card]]:px-4 [&_[data-testid=tool-case-guide-card]]:pt-[54px] [&_[data-testid=tool-case-guide-card]>div:first-child]:w-fit! [&_[data-testid=tool-case-guide-card]>div:first-child]:gap-[2px] [&_figure]:h-[352px] [&_figure]:w-[235px] [&_figure]:max-w-none [&_figure]:flex-none [&_figure]:aspect-auto [&_figure:last-child]:ml-[38px]! [&_figure_img]:h-full [&_figure>svg]:text-muted-foreground [&_figure>svg]:drop-shadow-none";
