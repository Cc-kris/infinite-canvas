import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

import type { ToolCase } from "@/components/tools/tool-cases";
import { cn } from "@/lib/utils";

/**
 * 原站「生成结果」空态的案例轮播卡（`_caseGuide` / `_caseSwiper`）。
 *
 * 原站实测（商品套图，1600×1000）：白卡 958×472、圆角 12px；
 * 参数图 352×352（圆角 4px、1px #eee 边、cover），结果图占余宽、高 352；
 * 图上方居中标签胶囊 14px、圆角 13px、padding 3px 10px；
 * 「一键做同款」110×40、圆角 8px、16px 字；
 * 卡片下方分页点：当前 22×6，其余 6×6，圆角 3px。
 * 配色按无限画布主题：主按钮 / 当前分页点用 primary，胶囊与其余分页点用 foreground 半透明。
 *
 * 数据复用 `ToolCase`：`params` 为输入图（标签取 param.label），`result` 为生成结果。
 * 「一键做同款」交给调用方的真实 applyCase（素材入库 + 回填），失败原因在卡片下方显示。
 */
export function ToolCaseGuide({
    cases,
    onApply,
    applyingId,
    title,
    resultLabel = "生成结果",
    className,
}: {
    cases: ToolCase[];
    onApply: (item: ToolCase) => void | Promise<void>;
    applyingId?: string | null;
    title?: string;
    resultLabel?: string;
    className?: string;
}) {
    const [index, setIndex] = useState(0);
    const [error, setError] = useState("");
    const item = cases[Math.min(index, cases.length - 1)];
    if (!item) return null;
    const busy = applyingId === item.id;

    return (
        <div data-testid="tool-case-guide" className={cn("mx-auto flex w-full max-w-[958px] flex-col items-center", className)}>
            {title ? <h2 className="mb-4 text-center text-[20px] font-medium leading-8 text-foreground">{title}</h2> : null}
            <div data-testid="tool-case-guide-card" data-case-id={item.id} className="flex w-full flex-col items-center rounded-[12px] bg-background px-4 pb-4 pt-8">
                <div className="flex w-full items-start gap-10">
                    {item.params.map((param) => (
                        <figure key={param.label} className="relative m-0 aspect-square w-[352px] max-w-[40%] shrink-0">
                            <span className="absolute -top-[38px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[13px] bg-foreground/60 px-[10px] py-[3px] text-[14px] leading-[22px] text-background">{param.label}</span>
                            <img src={param.src} alt={param.label} className="h-full w-full rounded-[4px] border border-border object-cover" draggable={false} />
                        </figure>
                    ))}
                    <figure className="relative m-0 min-w-0 flex-1">
                        <span className="absolute -top-[38px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[13px] bg-foreground/60 px-[10px] py-[3px] text-[14px] leading-[22px] text-background">{resultLabel}</span>
                        {item.params.length ? (
                            <ArrowRight aria-hidden="true" className="absolute -left-[34px] top-1/2 size-7 -translate-y-1/2 text-muted-foreground" />
                        ) : null}
                        {item.video && item.videoSrc ? (
                            /* 原站卡内直接播放案例视频，封面用抽帧图。 */
                            <video key={item.id} src={item.videoSrc} poster={item.result} muted loop autoPlay playsInline aria-label={`优秀案例-${item.id}`} className="h-[352px] w-full rounded-[4px] object-cover" />
                        ) : (
                            <img src={item.result} alt={`优秀案例-${item.id}`} className="h-[352px] w-full rounded-[4px] object-cover" draggable={false} />
                        )}
                    </figure>
                </div>
                <button
                    type="button"
                    data-testid="tool-case-guide-apply"
                    disabled={busy}
                    onClick={async () => {
                        setError("");
                        try {
                            await onApply(item);
                        } catch (cause) {
                            setError(cause instanceof Error ? cause.message : "做同款失败");
                        }
                    }}
                    className="mt-[10px] inline-flex h-10 items-center justify-center gap-1 rounded-[8px] bg-primary px-[15px] text-[16px] text-primary-foreground disabled:opacity-60"
                >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                    一键做同款
                </button>
                {error ? <p data-testid="tool-case-guide-error" className="mt-2 text-[12px] text-destructive">做同款失败：{error}</p> : null}
            </div>
            {cases.length > 1 ? (
                <div className="mt-[10px] flex items-center gap-2" role="tablist" aria-label="案例分页">
                    {cases.map((entry, i) => (
                        <button
                            key={entry.id}
                            type="button"
                            role="tab"
                            aria-selected={i === index}
                            aria-label={`案例 ${i + 1}`}
                            data-testid="tool-case-guide-dot"
                            onClick={() => setIndex(i)}
                            className={cn("h-[6px] rounded-[3px] transition-all", i === index ? "w-[22px] bg-primary" : "w-[6px] bg-foreground/30")}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}
