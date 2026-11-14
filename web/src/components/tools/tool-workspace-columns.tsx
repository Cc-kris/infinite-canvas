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
export const TOOL_CONFIG_WIDTH_SUITE = 504;
export const TOOL_CONFIG_WIDTH_EDIT = 240;
export const TOOL_CONFIG_MIN_WIDTH = 240;
export const TOOL_CONFIG_MAX_WIDTH = TOOL_CONFIG_WIDTH;
export const TOOL_CONFIG_MAX_WIDTH_CANVAS = TOOL_CONFIG_WIDTH_CANVAS;

export type ToolConfigWidth = 240 | 255 | 270 | 296 | 300 | 307 | 330 | 360 | 504;

const LEFT_TEMPLATES: Record<ToolConfigWidth, string> = {
    240: "lg:grid-cols-[240px_minmax(0,1fr)]",
    255: "lg:grid-cols-[255px_minmax(0,1fr)]",
    270: "lg:grid-cols-[270px_minmax(0,1fr)]",
    296: "lg:grid-cols-[296px_minmax(0,1fr)]",
    300: "lg:grid-cols-[300px_minmax(0,1fr)]",
    307: "lg:grid-cols-[307px_minmax(0,1fr)]",
    330: "lg:grid-cols-[330px_minmax(0,1fr)]",
    360: "lg:grid-cols-[360px_minmax(0,1fr)]",
    504: "lg:grid-cols-[504px_minmax(0,1fr)]",
};

const RIGHT_TEMPLATES: Record<ToolConfigWidth, string> = {
    240: "lg:grid-cols-[minmax(0,1fr)_240px]",
    255: "lg:grid-cols-[minmax(0,1fr)_255px]",
    270: "lg:grid-cols-[minmax(0,1fr)_270px]",
    296: "lg:grid-cols-[minmax(0,1fr)_296px]",
    300: "lg:grid-cols-[minmax(0,1fr)_300px]",
    307: "lg:grid-cols-[minmax(0,1fr)_307px]",
    330: "lg:grid-cols-[minmax(0,1fr)_330px]",
    360: "lg:grid-cols-[minmax(0,1fr)_360px]",
    504: "lg:grid-cols-[minmax(0,1fr)_504px]",
};

export interface ToolWorkspaceColumnsProps {
    /** 配置/参数面板（双栏在左或右；三栏在中间 240px）。必须承载真实控件，不是占位。 */
    config: ReactNode;
    /** 主区：结果网格 / 画布 / 编辑器。 */
    children: ReactNode;
    /** 修图家族三栏模式右侧 300px 结果与历史栏（提供时自动启用 `minmax(0,1fr) | 240px | 300px`）。 */
    resultSlot?: ReactNode;
    /** 画布类页面（图层、蒙版、裁剪、设计器）默认配置栏宽度。 */
    canvas?: boolean;
    /** 原站家族规范化配置列宽（套图 504px、修图 240px、设计 255/270/296/300/307/330px）。 */
    configWidth?: ToolConfigWidth;
    className?: string;
    configClassName?: string;
    mainClassName?: string;
    resultClassName?: string;
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
    resultSlot,
    canvas = false,
    configWidth,
    className,
    configClassName,
    mainClassName,
    resultClassName,
    mainFirstOnMobile = false,
    configSide = "left",
}: ToolWorkspaceColumnsProps) {
    // ⚠️ Tailwind 只识别静态字面量类名：这里必须是写死的字符串，不能用模板拼接。
    const effectiveWidth: ToolConfigWidth = configWidth ?? (resultSlot !== undefined ? 240 : canvas ? 360 : 300);
    const reversed = resultSlot !== undefined || configSide === "right";
    const gridTemplate =
        resultSlot !== undefined
            ? "lg:grid-cols-[minmax(0,1fr)_240px_300px]"
            : reversed
              ? RIGHT_TEMPLATES[effectiveWidth]
              : LEFT_TEMPLATES[effectiveWidth];

    const configCol = (
        <div
            key="config"
            data-testid="tool-config-column"
            className={cn("flex min-h-0 min-w-0 flex-col gap-[10px]", configClassName)}
        >
            {config}
        </div>
    );
    const mainCol = (
        <div key="main" data-testid="tool-main-column" className={cn("flex min-h-0 min-w-0 flex-col gap-[10px]", mainClassName)}>
            {children}
        </div>
    );
    const resultCol =
        resultSlot !== undefined ? (
            <div key="result" data-testid="tool-result-column" className={cn("flex min-h-0 min-w-0 flex-col gap-[10px]", resultClassName)}>
                {resultSlot}
            </div>
        ) : null;

    // 顺序靠 DOM 顺序决定（不靠 order-*）：配置在右时主区先渲染，
    // 栅格模板同步右置；移动端自然变成「主区在上、配置在下」，这也正是画布工具该有的堆叠。
    const ordered = resultCol ? [mainCol, configCol, resultCol] : reversed ? [mainCol, configCol] : [configCol, mainCol];

    return (
        <div
            data-testid="tool-workspace-columns"
            data-canvas={canvas || resultSlot !== undefined ? "true" : "false"}
            data-config-side={resultSlot !== undefined ? "right" : configSide}
            data-config-width={effectiveWidth}
            className={cn("grid min-h-0 min-w-0 grid-cols-1 gap-[10px] p-[10px]", gridTemplate, className)}
        >
            {mainFirstOnMobile && !reversed && !resultCol ? [mainCol, configCol] : ordered}
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
