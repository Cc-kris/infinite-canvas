import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * 原站右下「管理水印分组」面板（1:1 呈现层）：
 * 默认分组 + ＋ 新增水印分组入口，最多 20 组。
 * 仅本地展示状态，未接水印合成链路；接链路前不得当作真实能力宣称。
 */
export function WatermarkGroupPanel({ className }: { className?: string }) {
    const [groups, setGroups] = useState<string[]>(["默认"]);
    return (
        <section
            data-testid="watermark-groups"
            className={cn(
                "flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] leading-5",
                className,
            )}
        >
            <span className="text-foreground">管理水印分组</span>
            <span className="tabular-nums text-muted-foreground">共 {groups.length}/20 个</span>
            {groups.map((name) => (
                <span key={name} className="truncate rounded border border-border px-1.5 text-foreground">
                    {name}
                </span>
            ))}
            <button
                type="button"
                onClick={() =>
                    setGroups((prev) => (prev.length >= 20 ? prev : [...prev, prev.length === 1 ? "分组 2" : `分组 ${prev.length + 1}`]))
                }
                className="rounded border border-dashed border-border px-1.5 text-muted-foreground transition hover:border-foreground/30"
            >
                <span>＋ 新增水印分组</span>
            </button>
        </section>
    );
}

export default WatermarkGroupPanel;
