import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * LinkFox 图片编辑（smart-edit）工具页骨架。
 *
 * 几何取自原站真实页面（1908x781，CDP getBoundingClientRect）：
 *  - 页面底色 rgb(245,247,250)，三列间距 10px，上下内边距 10px
 *  - 画布列：flex-1（原站 1148px），底色 rgb(237,239,245)，圆角 8
 *  - 配置列：240px 白色卡片，圆角 8，分区内边距 10px 16px
 *  - 结果列：300px，底色 rgb(237,239,245)，圆角 8，顶部 42px 标签栏，内容内边距 16px 12px
 */
export function Edit8Page({
    toolId,
    className,
    children,
    ...rest
}: { toolId: string; className?: string; children: ReactNode } & Record<string, unknown>) {
    return (
        <div
            data-tool={toolId}
            data-layout="linkfox-edit8"
            {...rest}
            className={cn("flex h-full min-h-0 gap-[10px] overflow-hidden bg-[#f5f7fa] p-[10px] text-[#1f1f2c]", className)}
        >
            {children}
        </div>
    );
}

/** 画布列：原站 1148px 宽的浅灰面板，内容垂直居中（空态白卡 542x495）。 */
export function Edit8Canvas({ className, children }: { className?: string; children: ReactNode }) {
    return (
        <section
            data-region="canvas"
            className={cn("flex min-w-0 flex-1 flex-col overflow-hidden rounded-[8px] bg-[#edeff5]", className)}
        >
            {children}
        </section>
    );
}

/** 画布内的工具条（画笔/大小/撤销…），原站位于画布列顶部，高 41px。 */
export function Edit8CanvasToolbar({ className, children }: { className?: string; children: ReactNode }) {
    return (
        <div className={cn("flex h-[41px] shrink-0 flex-wrap items-center gap-2 px-4 text-[12px] text-[#1f1f2c]", className)}>
            {children}
        </div>
    );
}

/** 画布内的白卡容器（原站 542 宽、圆角 12、内边距 16、gap 10）。 */
export function Edit8CanvasCard({ className, children }: { className?: string; children: ReactNode }) {
    return (
        <div
            className={cn(
                "mx-auto flex w-[542px] max-w-full flex-col gap-[10px] rounded-[12px] bg-white p-4 shadow-[0_2px_12px_rgba(31,31,44,0.04)]",
                className,
            )}
        >
            {children}
        </div>
    );
}

/** 配置列：240px 白卡；footer 固定贴在卡片底部（原站「立即生成」在卡片底边，240x32）。 */
export function Edit8Config({
    className,
    footer,
    children,
    ...rest
}: { className?: string; footer?: ReactNode; children: ReactNode } & Record<string, unknown>) {
    return (
        <aside
            data-region="config"
            {...rest}
            className={cn("flex w-[240px] shrink-0 flex-col overflow-hidden rounded-[8px] bg-white", className)}
        >
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
            {footer ? <div className="shrink-0">{footer}</div> : null}
        </aside>
    );
}

/** 配置分区：原站每个分区自带 10px 16px 内边距与 1px 分隔线。 */
export function Edit8Section({
    title,
    required,
    aside,
    className,
    children,
}: {
    title?: ReactNode;
    required?: boolean;
    aside?: ReactNode;
    className?: string;
    children: ReactNode;
}) {
    return (
        <section className={cn("border-b border-[#f0f0f3] px-[16px] py-[10px] last:border-b-0", className)}>
            {title ? (
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium leading-5 text-[#1f1f2c]">
                        {title}
                        {required ? <span className="ml-0.5 text-[#f5483b]">*</span> : null}
                    </span>
                    {aside ? <span className="shrink-0 text-[11px] leading-5 tabular-nums text-[#8a8a99]">{aside}</span> : null}
                </div>
            ) : null}
            <div className="mt-1.5">{children}</div>
        </section>
    );
}

/** 结果列：300px，顶部 42px 标签栏（原站「生成结果 / 历史记录」，选中项紫色 #723cf9）。 */
export function Edit8Results({
    tabs,
    active,
    onTabChange,
    className,
    children,
}: {
    tabs: { id: string; label: string }[];
    active: string;
    onTabChange: (id: string) => void;
    className?: string;
    children: ReactNode;
}) {
    return (
        <section
            data-region="results"
            className={cn("flex w-[300px] shrink-0 flex-col overflow-hidden rounded-[8px] bg-[#edeff5]", className)}
        >
            <div role="tablist" className="flex h-[42px] shrink-0 items-center gap-5 px-[13px]">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active === tab.id}
                        data-testid={`edit8-tab-${tab.id}`}
                        onClick={() => onTabChange(tab.id)}
                        className={cn(
                            "h-[42px] text-[14px] leading-none transition",
                            active === tab.id ? "font-medium text-[#723cf9]" : "text-[#6b6b80] hover:text-[#1f1f2c]",
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2">{children}</div>
        </section>
    );
}

/** 结果列空态文案（原站「暂无生成结果图」）。 */
export function Edit8ResultsEmpty({ text = "暂无生成结果图" }: { text?: string }) {
    return (
        <div className="flex h-full min-h-[120px] items-center justify-center">
            <p className="text-[12px] text-[#8a8a99]">{text}</p>
        </div>
    );
}

/** 主按钮：原站「立即生成」240x32，紫色渐变，圆角 6，14px 白字。 */
export const edit8PrimaryButtonClass =
    "inline-flex h-8 w-full items-center justify-center rounded-[6px] bg-[#723cf9] px-[15px] text-[14px] font-normal leading-none text-white transition hover:bg-[#6231e0] disabled:cursor-not-allowed disabled:opacity-50";

/** 输入框：原站白色、圆角 6、1px #EDEDF0 边框、12-14px 字。 */
export const edit8InputClass =
    "w-full rounded-[6px] border border-[#ededf0] bg-white px-[11px] py-1 text-[13px] leading-5 text-[#1f1f2c] outline-none transition focus:border-[#723cf9] disabled:opacity-60";

/** 分段选择：原站 1/2/3/4 张数按钮，选中紫底白字，圆角 5。 */
export function Edit8Chip({ selected, onClick, disabled, children }: { selected: boolean; onClick: () => void; disabled?: boolean; children: ReactNode }) {
    return (
        <button
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={onClick}
            className={cn(
                "inline-flex h-6 min-w-6 items-center justify-center rounded-[5px] border px-2 text-[11px] leading-none transition disabled:opacity-50",
                selected ? "border-[#723cf9] bg-[#723cf9] text-white" : "border-[#ededf0] bg-white text-[#1f1f2c] hover:border-[#723cf9]/50",
            )}
        >
            {children}
        </button>
    );
}
