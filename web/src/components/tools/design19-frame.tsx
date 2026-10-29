import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * design19（原站 product-design index 15-24）工作台骨架。
 *
 * 全部几何/配色取自原站真实 computed style（viewport 1908x781，CDP 实测）：
 *  - 左列 `_configContent`：300px 白底，padding 10/12/10/16 → 内容宽 268；分区间距 15px
 *  - 右栏 `_rightWrapper`：flex-1，透明底；顶部「42px 白底页签栏」（padding 0 12px），
 *    内容区 609 高、无圆角
 *  - 页签：高 41，padding 10px 0，fs14；激活文字 #723cf9 + 底部 2px ink-bar #723cf9；
 *    历史记录固定右对齐、fs12
 *  - 张数/类型 chip：40x26，radius 6，1px #ccc，fs12；选中 #f9f0ff / 边框 #723cf9 / 文字 #723cf9
 *  - 字段小标题：fs12，color rgba(0,0,0,.3)，margin-bottom 6
 *  - 主按钮：268x32，radius 6，渐变 linear-gradient(90deg,#3a7df9,#723cf9)，fs14
 */

export type Design19Tab = { id: string; label: string };

/** 页签 id（部分工具只用 result/case/history 三值）。 */
export type Design19TabId = string;

/** 整个工作台：左 300 参数列 + 右 flex-1 结果列，无额外间距。 */
export function Design19Workbench({
    className,
    children,
    ...rest
}: { className?: string; children: ReactNode } & Record<string, unknown>) {
    return (
        <div
            data-region="design19"
            {...rest}
            className={cn("flex h-full min-h-0 w-full items-stretch bg-white text-[#1f1f2c]", className)}
        >
            {children}
        </div>
    );
}

/** 左列：300px 白底参数列；footer 固定在列底（立即生成）。 */
export function Design19LeftColumn({
    children,
    footer,
    className,
    ...rest
}: { children: ReactNode; footer?: ReactNode; className?: string } & Record<string, unknown>) {
    return (
        <section
            data-region="design19-form"
            {...rest}
            className={cn("flex w-[300px] shrink-0 flex-col", className)}
        >
            <div className="min-h-0 flex-1 overflow-y-auto pl-4 pr-3 py-[10px]">{children}</div>
            {footer ? <div className="shrink-0 px-3 pb-[10px] pt-0">{footer}</div> : null}
        </section>
    );
}

/** 左列分区：原站 `_configItem` 之间 15px。 */
export function Design19Section({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return <div className={cn("mb-[15px] last:mb-0", className)}>{children}</div>;
}

/** 字段小标题：fs12 / rgba(0,0,0,.3) / 22 行高 / 下间距 6。 */
export function Design19FieldLabel({ children }: { children: ReactNode }) {
    return (
        <p className="mb-[6px] text-[12px] leading-[22px] text-black/30">{children}</p>
    );
}

/** chip 行：原站 flex + 10px 间距。 */
export function Design19ChipGroup({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn("flex flex-wrap items-center gap-[10px]", className)}>{children}</div>;
}

export function Design19Chip({
    selected,
    className,
    children,
    ...rest
}: { selected?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type="button"
            aria-pressed={Boolean(selected)}
            {...rest}
            className={cn(
                "inline-flex h-[26px] min-w-[40px] items-center justify-center rounded-[6px] border px-[16px] text-[12px]! leading-[16px]! transition-colors",
                selected
                    ? "border-[#723cf9] bg-[#f9f0ff] text-[#723cf9]!"
                    : "border-[#cccccc] bg-white text-black/80! hover:border-[#723cf9] hover:text-[#723cf9]",
                "disabled:cursor-not-allowed disabled:opacity-50",
                className,
            )}
        >
            {children}
        </button>
    );
}

/** 主按钮：渐变紫，268x32。 */
export function Design19PrimaryButton({
    className,
    children,
    ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type="button"
            {...rest}
            className={cn(
                "inline-flex h-[32px] w-full items-center justify-center gap-1 rounded-[6px] px-[15px] text-[14px]! leading-[22px]! text-white! transition-opacity",
                "bg-[linear-gradient(90deg,#3a7df9_0%,#723cf9_100%)] hover:opacity-90",
                "disabled:cursor-not-allowed disabled:opacity-50",
                className,
            )}
        >
            {children}
        </button>
    );
}

/** 次级按钮：白底紫字描边，268x32。 */
export function Design19GhostButton({
    className,
    children,
    ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type="button"
            {...rest}
            className={cn(
                "inline-flex h-[32px] w-full items-center justify-center gap-[8px] rounded-[6px] border border-[#723cf9] px-[15px] text-[14px]! leading-[22px]! text-[#723cf9]! transition-colors hover:bg-[#f9f0ff]",
                "disabled:cursor-not-allowed disabled:opacity-50",
                className,
            )}
        >
            {children}
        </button>
    );
}

/**
 * 右栏：42px 白底页签栏 + 结果区。
 * `extraTab` 用于「生成结果」之外的尾部页签（原站「历史记录」右对齐、fs12）。
 */
export function Design19Results({
    tabs,
    active,
    onTabChange,
    extraTab,
    children,
    className,
}: {
    tabs: Design19Tab[];
    active: string;
    onTabChange: (id: string) => void;
    extraTab?: Design19Tab;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section
            data-region="design19-results"
            className={cn("flex min-w-0 flex-1 flex-col", className)}
        >
            <div role="tablist" className="flex h-[42px] shrink-0 items-stretch gap-[14px] bg-white px-3">
                {tabs.map((tab) => {
                    const on = active === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            data-testid={`result-tab-${tab.id}`}
                            onClick={() => onTabChange(tab.id)}
                            className={cn(
                                "relative flex h-[42px] items-center px-0 pb-0 pt-0 text-[14px]! leading-[22px]! transition-colors",
                                on ? "text-[#723cf9]!" : "text-black/[0.88]! hover:text-[#723cf9]",
                            )}
                        >
                            {tab.label}
                            {on ? (
                                <span className="absolute bottom-0 left-0 h-[2px] w-full rounded-[1px] bg-[#723cf9]" />
                            ) : null}
                        </button>
                    );
                })}
                {extraTab ? (
                    <button
                        type="button"
                        role="tab"
                        aria-selected={active === extraTab.id}
                        data-testid={`result-tab-${extraTab.id}`}
                        onClick={() => onTabChange(extraTab.id)}
                        className={cn(
                            "ml-auto! flex h-[42px] items-center pr-[4px] text-[12px]! leading-[20px]! transition-colors",
                            active === extraTab.id ? "text-[#723cf9]!" : "text-black/60! hover:text-[#723cf9]",
                        )}
                    >
                        {extraTab.label}
                    </button>
                ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        </section>
    );
}

/** 空态：原站居中 14px / rgba(0,0,0,.6)。 */
export function Design19Empty({ title, hint }: { title: string; hint?: string }) {
    return (
        <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-1 px-4 py-10">
            <svg viewBox="0 0 64 44" className="h-10 w-16 text-black/10" aria-hidden>
                <path d="M6 30l12-14 8 10 8-8 14 16H6z" fill="currentColor" />
                <circle cx="44" cy="12" r="5" fill="currentColor" />
            </svg>
            <p className="text-[14px] leading-[22px] text-black/60">{title}</p>
            {hint ? <p className="text-[14px] leading-[22px] text-black/60">{hint}</p> : null}
        </div>
    );
}

/* ---------------- 兼容旧导出（scene.tsx 仍在用） ---------------- */

export type Design19TabKey = "result" | "case" | "history";

export const DESIGN19_TAB_LABEL: Record<Design19TabKey, string> = {
    result: "生成结果",
    case: "优秀案例",
    history: "历史记录",
};

export const design19PrimaryButtonClass =
    "inline-flex h-[32px] w-full items-center justify-center gap-1 rounded-[6px] px-[15px] text-[14px] leading-[22px] text-white bg-[linear-gradient(90deg,#3a7df9_0%,#723cf9_100%)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

export function Design19Shell({
    className,
    children,
    ...rest
}: { className?: string; children: ReactNode } & Record<string, unknown>) {
    return (
        <div {...rest} className={cn("flex h-full min-h-0 w-full items-stretch bg-white", className)}>
            {children}
        </div>
    );
}

export function Design19FormRail({
    className,
    children,
    ...rest
}: { className?: string; children: ReactNode } & Record<string, unknown>) {
    return (
        <section
            data-region="form-rail"
            {...rest}
            className={cn("flex w-full shrink-0 flex-col overflow-y-auto pl-4 pr-3 py-[10px] lg:w-[300px]", className)}
        >
            {children}
        </section>
    );
}

export function Design19ResultPanel({
    tabs = ["result", "history"],
    active,
    onChange,
    className,
    children,
    ...rest
}: {
    tabs?: Design19TabKey[];
    active: Design19TabKey;
    onChange: (key: Design19TabKey) => void;
    className?: string;
    children: ReactNode;
} & Record<string, unknown>) {
    return (
        <section data-region="result-panel" {...rest} className={cn("flex min-w-0 flex-1 flex-col", className)}>
            <Design19Results
                tabs={tabs.map((key) => ({ id: key, label: DESIGN19_TAB_LABEL[key] }))}
                active={active}
                onTabChange={(id) => onChange(id as Design19TabKey)}
            >
                {children}
            </Design19Results>
        </section>
    );
}
