import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * PRD ui_brief §4 的唯一列布局实现。39 个工具页必须用它，不许再各自写 grid。
 *
 * 规格（唯一事实源 `docs/V1.0/plan_linkfox_navigation/REPLICA_SPEC_SHEET.md §0`）：
 * - 配置栏：320–360px；画布类（mask / outpaint / crop / designer）上限 420px
 * - 结果/编辑区：`minmax(0,1fr)`，≥ 工作区宽度 55%
 * - 列间距 16px，页面内边距 20px
 * - <1024px 单列，结果在下（配置在上，绝不把画布压成不可操作）
 *
 * 断言脚本 `web/scripts/real-acceptance/tools-layout-check.mjs` 量的是
 * `[data-testid=tool-config-column]` 与 `[data-testid=tool-main-column]` 的实际像素宽，
 * 所以两个 data-testid 不允许改名、不允许只包一层不承载宽度。
 */
/** LinkFox 原站主流配置列宽：普通工具 300px，画布类工具 360px。 */
export const TOOL_CONFIG_WIDTH = 300;
export const TOOL_CONFIG_WIDTH_CANVAS = 360;
export const TOOL_CONFIG_MIN_WIDTH = 240;
export const TOOL_CONFIG_MAX_WIDTH = TOOL_CONFIG_WIDTH;
export const TOOL_CONFIG_MAX_WIDTH_CANVAS = TOOL_CONFIG_WIDTH_CANVAS;

export interface ToolWorkspaceColumnsProps {
    /** 左列：配置/参数面板。必须承载真实控件，不是占位。 */
    config: ReactNode;
    /** 右列：结果网格 / 画布 / 编辑器。 */
    children: ReactNode;
    /** 画布类页面（图层、蒙版、裁剪、设计器）允许配置栏扩到 420px。 */
    canvas?: boolean;
    className?: string;
    configClassName?: string;
    mainClassName?: string;
    /** 右列在移动端是否排到配置栏上方（结果优先，如视频播放/纯预览页）。 */
    mainFirstOnMobile?: boolean;
    /**
     * 配置栏在左还是右。原站不统一：商品套图/换色等配置在左，裁剪/局部重绘等设置在右。
     * 以 page-specs §1 的区域顺序为准，不强行翻转原站布局。
     */
    configSide?: "left" | "right";
}

export function ToolWorkspaceColumns({
    config,
    children,
    canvas = false,
    className,
    configClassName,
    mainClassName,
    mainFirstOnMobile = false,
    configSide = "left",
}: ToolWorkspaceColumnsProps) {
    // ⚠️ Tailwind 只识别静态字面量类名：这里必须是写死的字符串，不能用模板拼接，
    // 否则 JIT 扫不到、CSS 不生成、两列会退化成单列全宽（已实测踩过）。
    const LEFT_CANVAS = "lg:grid-cols-[360px_minmax(0,1fr)]";
    const LEFT_DEFAULT = "lg:grid-cols-[300px_minmax(0,1fr)]";
    const RIGHT_CANVAS = "lg:grid-cols-[minmax(0,1fr)_360px]";
    const RIGHT_DEFAULT = "lg:grid-cols-[minmax(0,1fr)_300px]";
    const reversed = configSide === "right";
    const gridTemplate = reversed ? (canvas ? RIGHT_CANVAS : RIGHT_DEFAULT) : canvas ? LEFT_CANVAS : LEFT_DEFAULT;

    const configCol = (
        <div
            key="config"
            data-testid="tool-config-column"
            className={cn("flex min-h-0 min-w-0 flex-col gap-3", configClassName)}
        >
            {config}
        </div>
    );
    const mainCol = (
        <div key="main" data-testid="tool-main-column" className={cn("flex min-h-0 min-w-0 flex-col gap-3", mainClassName)}>
            {children}
        </div>
    );

    // 顺序靠 DOM 顺序决定（不靠 order-*）：配置在右时主区先渲染，
    // 栅格模板同步右置；移动端自然变成「主区在上、配置在下」，这也正是画布工具该有的堆叠。
    const ordered = reversed ? [mainCol, configCol] : [configCol, mainCol];

    return (
        <div
            data-testid="tool-workspace-columns"
            data-canvas={canvas ? "true" : "false"}
            data-config-side={configSide}
            className={cn("grid min-h-0 min-w-0 grid-cols-1 gap-3", gridTemplate, className)}
        >
            {mainFirstOnMobile && !reversed ? [mainCol, configCol] : ordered}
        </div>
    );
}

/** 配置栏里的一块分区卡片：统一圆角/边框/间距，避免每页自造一个 section 样式。 */
export function ToolConfigSection({
    title,
    hint,
    extra,
    children,
    className,
}: {
    title?: ReactNode;
    hint?: ReactNode;
    extra?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section
            className={cn("rounded-[10px] border border-border bg-card p-3", className)}
            data-testid="tool-config-section"
        >
            {title || extra ? (
                <div className="mb-2 flex items-center justify-between gap-2">
                    {title ? <h3 className="text-sm font-medium leading-6 text-foreground">{title}</h3> : null}
                    {extra}
                </div>
            ) : null}
            {hint ? <p className="mb-2 text-xs leading-5 text-muted-foreground">{hint}</p> : null}
            {children}
        </section>
    );
}
