import { useEffect, useState } from "react";
import { Eye, Loader2, Play } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * B6｜「优秀案例」画廊（按原站 1:1 复刻布局/样式/文案）。
 *
 * 原站实测规格（`docs/V1.0/plan_linkfox_navigation/evidence/b6-cases/origin/AI_OUTPAINTING-detail.json`，
 * 1920 视口、右栏面板 614.9px 宽）：
 * - 双列瀑布流，卡片宽 264.4px、列间距 18px、卡片下间距 10px（原站用绝对定位实现，这里用 column-count 等价布局）；
 * - 卡片 = 结果图 + 悬浮蒙层（`rgba(0,0,0,.5)`，0.3s linear 过渡，居中「预览」+ 眼睛图标 12px 白字）；
 * - 底部操作条：`position:absolute; bottom:5px; padding:0 5px; display:flex; justify-content:space-between; align-items:flex-end`，
 *   左侧参数缩略图（标签 12px 白字 + 40×40、圆角 4px、object-fit:cover），右侧「做同款」按钮 74×32。
 *
 * 事实边界：
 * - 案例数据必须来自本仓库真实产物（见 `features/tools/tool-cases-data.ts`），不伪造别家案例图；
 * - 「做同款」不是复制一段 JSON 给用户：它把案例素材真实写入资产库（本机磁盘），再回填到工具表单，
 *   回填失败（例如素材校验不过）会抛错由调用方提示，不做静默降级。
 */
export type ToolCaseParam = { label: string; src: string };

export type ToolCase = {
    /** 案例 id（写进 alt：`优秀案例-<id>`，与原站 alt 规则一致） */
    id: string;
    /** 结果图；视频工具填视频封面 */
    result: string;
    /** 底部参数缩略图：原图 / 商品 / 参考图 …（原站每卡 1~2 项） */
    params: ToolCaseParam[];
    /** 结果是否为视频（原站视频案例卡片按 9:16 比例，且带播放标记） */
    video?: boolean;
    /** 视频案例的真实成片地址：卡片用 `result` 当封面图，灯箱预览用这里播视频 */
    videoSrc?: string;
    /** 做同款回填的字段（由调用方按自身 draft 结构消费，未识别字段忽略） */
    apply?: ToolCaseApply;
};

export type ToolCaseApply = {
    /** 提示词 */
    prompt?: string;
    /** 画幅比例，如 1:1 / 16:9 */
    ratio?: string;
    /** 尺寸档位（各工具语义不同：长边像素或预设名） */
    sizePreset?: string | number;
    /** 生成数量 */
    outputNum?: number;
    /** 做同款要入库的真实素材：槽位名 → `web/public` 下的绝对路径（多图槽位用数组） */
    files?: Record<string, string | string[]>;
    [key: string]: unknown;
};

export type ToolCasesProps = {
    cases: ToolCase[];
    /** 真实回填：调用方负责把案例素材入库并写进工具状态 */
    onApply: (item: ToolCase) => void | Promise<void>;
    applyingId?: string | null;
    className?: string;
    emptyHint?: string;
};

export function ToolCases({ cases, onApply, applyingId, className, emptyHint = "暂无优秀案例" }: ToolCasesProps) {
    const [preview, setPreview] = useState<ToolCase | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!preview) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setPreview(null);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [preview]);

    if (!cases.length) {
        return <p className={cn("py-10 text-center text-xs text-muted-foreground", className)}>{emptyHint}</p>;
    }

    return (
        <div data-testid="tool-cases" className={cn("min-w-0", className)}>
            <div className="[column-width:264px] [column-gap:18px]">
                {cases.map((item) => {
                    const busy = applyingId === item.id;
                    return (
                        <div
                            key={item.id}
                            data-testid="tool-case-card"
                            data-case-id={item.id}
                            className="group relative mb-[10px] break-inside-avoid overflow-hidden rounded-lg bg-muted"
                        >
                            <img
                                src={item.result}
                                alt={`优秀案例-${item.id}`}
                                loading="lazy"
                                className={cn("block w-full select-none", item.video ? "aspect-[9/16] object-cover" : "")}
                                draggable={false}
                            />

                            {item.video ? (
                                <span className="pointer-events-none absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white opacity-90 transition group-hover:opacity-0">
                                    <Play className="size-4" />
                                </span>
                            ) : null}

                            <button
                                type="button"
                                data-testid="tool-case-preview"
                                aria-label={`预览 ${item.id}`}
                                onClick={() => setPreview(item)}
                                className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 opacity-0 transition duration-300 group-hover:opacity-100"
                            >
                                <span className="flex items-center gap-1 text-[12px] leading-[18.857px] text-white">
                                    <Eye className="size-3.5" />
                                    <p>预览</p>
                                </span>
                            </button>

                            <div className="absolute inset-x-0 bottom-[5px] flex items-end justify-between px-[5px]">
                                <div className="flex items-end gap-1">
                                    {item.params.map((param) => (
                                        <div key={param.label} className="flex flex-col items-center">
                                            <span className="text-[12px] leading-[18.857px] text-white">{param.label}</span>
                                            <img src={param.src} alt="" className="size-10 rounded-md object-cover" draggable={false} />
                                        </div>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    data-testid="tool-case-apply"
                                    disabled={busy}
                                    onClick={async () => {
                                        setError("");
                                        try {
                                            await onApply(item);
                                        } catch (cause) {
                                            setError(cause instanceof Error ? cause.message : "做同款失败");
                                        }
                                    }}
                                    className="flex h-8 shrink-0 items-center justify-center gap-1 rounded-md border border-white/50 bg-transparent px-[15px] text-sm text-white transition hover:bg-white/10 disabled:opacity-60"
                                >
                                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                                    做同款
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {error ? (
                <p data-testid="tool-cases-error" className="mt-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] leading-4 text-destructive">
                    做同款失败：{error}
                </p>
            ) : null}

            {preview ? (
                <div
                    data-testid="tool-case-lightbox"
                    role="dialog"
                    aria-modal="true"
                    onClick={() => setPreview(null)}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
                >
                    {preview.video ? (
                        <video
                            data-testid="tool-case-preview-video"
                            src={preview.videoSrc ?? preview.result}
                            poster={preview.videoSrc ? preview.result : undefined}
                            controls
                            autoPlay
                            loop
                            className="max-h-full max-w-full rounded-lg shadow-lg"
                        />
                    ) : (
                        <img src={preview.result} alt={`优秀案例-${preview.id}`} className="max-h-full max-w-full rounded-lg object-contain shadow-lg" />
                    )}
                </div>
            ) : null}
        </div>
    );
}
