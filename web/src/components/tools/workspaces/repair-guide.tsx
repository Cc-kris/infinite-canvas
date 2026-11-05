import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 画布类修图工具的空态白卡（原站 `_emptyWarpper_`，1600×1000 实测）：
 * 542 宽、圆角 12、内边距 24/40；顶部 382×249 示例视频 → 20px 标题 → 16px 说明 → 可选按钮。
 * 示例视频是原站 `cdn.linkfox.com/ai-site/workbench/guide-*.mp4`，已原样落盘到 `/__cases/<slug>/guide.mp4`。
 */
export function RepairGuideCard({
    video,
    title,
    lines,
    className,
    children,
}: {
    video: string;
    title: string;
    lines: string[];
    className?: string;
    children?: ReactNode;
}) {
    return (
        <div data-testid="repair-guide-card" className={cn("mx-auto flex w-[542px] max-w-full flex-col items-center rounded-xl bg-card px-10 py-6 text-center", className)}>
            <video src={video} autoPlay muted loop playsInline aria-label={`${title}示例`} className="h-[249px] w-[382px] max-w-full rounded-xl object-cover" />
            <h2 className="mt-[10px] text-[20px] font-normal leading-[31px] text-foreground">{title}</h2>
            <div className="mt-[10px] text-[16px] leading-[18px] text-muted-foreground">
                {lines.map((line) => (
                    <p key={line}>{line}</p>
                ))}
            </div>
            {children}
        </div>
    );
}
