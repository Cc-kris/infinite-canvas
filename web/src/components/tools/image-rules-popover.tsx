/**
 * 原站「图片规则」浮层（ant-popover）的本地等价实现。
 *
 * 原站行为：点击表单里的「图片规则」文字 → 在按钮下方弹出规则浮层，包含
 *   1. 标题：请按规则上传图片，以达到最佳效果
 *   2. 规格：支持jpg、jpeg、png、webp，10M以内，图片边长范围：384 ~ 4096，最大宽高比5
 *   3. 样例卡 ×4（每张带「试一试」按钮）
 *   4. 错误示例：请勿上传以下错误图片，会极大影响生成效果 + 若干错误项
 *
 * 文案逐字取自原站 DOM（.verify-tools/frontend-diff/click-orig/*.json），不得改写。
 */
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type ImageRulesKind = "wearable" | "goods" | "video" | "dressing";

interface ImageRulesContent {
    /** 浮层标题；不填用通用 TITLE。 */
    title?: string;
    /** 正向样例卡标题（原站每张卡下方带「试一试」）。 */
    samples: string[];
    /** 错误示例项。 */
    errors: string[];
}

const CONTENT: Record<ImageRulesKind, ImageRulesContent> = {
    wearable: {
        samples: ["模特穿戴图", "主体清晰的简约场景图", "模特穿戴图", "清晰的单一商品图"],
        errors: ["商品主体不清晰", "包含多个商品主体", "商品展示不完整", "小商品但图片占比大"],
    },
    goods: {
        samples: ["完整主体的商品图", "完整主体的商品图", "完整主体的商品图", "完整主体的商品图"],
        errors: ["主体不完整", "模糊图片", "主体太小", "包含多个商品主体", "太多干扰，主体不明确", "主体被遮挡或已有手持"],
    },
    video: {
        samples: ["完整主体的商品图", "完整主体的商品图", "完整主体的商品图", "完整主体的商品图"],
        errors: ["主体不完整", "模糊图片", "主体太小", "包含多个商品主体", "太多干扰，主体不明确", "主体被遮挡或已有手持"],
    },
    // AI穿衣页的规则浮层：原站标题与错误示例逐字来自页面证据（19-ai-dressing-v2.md / DIFF #19）。
    dressing: {
        title: "请按规则上传多件服装图，以达到最佳效果",
        samples: ["上装平铺图", "下装平铺图", "上装平铺图", "下装平铺图"],
        errors: ["非真人图片（模特参考）", "折叠/挡住的服装图", "重叠服装图", "带人台的侧面图"],
    },
};

const TITLE = "请按规则上传图片，以达到最佳效果";
const SPEC = "支持jpg、jpeg、png、webp，10M以内，图片边长范围：384 ~ 4096，最大宽高比5";
const WARN = "请勿上传以下错误图片，会极大影响生成效果";

export interface ImageRulesPopoverProps {
    kind: ImageRulesKind;
    className?: string;
    testId?: string;
    /** 触发按钮文案，默认「图片规则」。 */
    label?: string;
}

/**
 * 「图片规则」按钮 + 规则浮层。
 * 浮层用 role="dialog" + data-state="open"，与原站 ant-popover 的可点击/可检测行为一致。
 */
export function ImageRulesPopover({ kind, className, testId = "image-rules", label = "图片规则" }: ImageRulesPopoverProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLSpanElement | null>(null);
    const content = CONTENT[kind];
    const title = content.title ?? TITLE;

    useEffect(() => {
        if (!open) return;
        const onDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    return (
        <span ref={rootRef} className={cn("relative inline-flex", className)}>
            <button
                type="button"
                data-testid={`${testId}-trigger`}
                aria-expanded={open}
                onClick={() => setOpen((previous) => !previous)}
                className="text-[12px] leading-[18px] text-muted-foreground underline-offset-2 transition hover:text-foreground hover:underline"
            >
                {label}
            </button>
            {open ? (
                <div
                    role="dialog"
                    aria-label={label}
                    data-state="open"
                    data-testid={`${testId}-popover`}
                    className="popover absolute left-0 top-[22px] z-50 w-[420px] rounded-lg border border-border bg-popover p-3 text-[12px] leading-[18px] text-popover-foreground shadow-lg"
                >
                    <p className="font-medium text-foreground">{title}</p>
                    <p className="mt-1 text-muted-foreground">{SPEC}</p>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                        {content.samples.map((sample, index) => (
                            <div key={`${sample}-${index}`} className="flex flex-col items-center gap-1">
                                <div className="flex h-[58px] w-full items-center justify-center rounded-md border border-border bg-muted/40 px-1 text-center text-[10px] leading-[13px] text-muted-foreground">
                                    {sample}
                                </div>
                                <span className="rounded border border-border px-1 text-[10px] leading-[16px] text-muted-foreground">试一试</span>
                            </div>
                        ))}
                    </div>
                    <p className="mt-3 font-medium text-foreground">{WARN}</p>
                    <div className="mt-1 grid grid-cols-3 gap-x-2 gap-y-1 text-[11px] leading-4 text-muted-foreground">
                        {content.errors.map((error) => (
                            <span key={error} className="rounded border border-dashed border-border px-1 py-[2px]">
                                {error}
                            </span>
                        ))}
                    </div>
                </div>
            ) : null}
        </span>
    );
}

export default ImageRulesPopover;
