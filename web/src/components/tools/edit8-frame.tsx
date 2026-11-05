import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { History, Upload } from "lucide-react";

import { cn } from "@/lib/utils";
import {
    ToolAssetError,
    adoptLibraryAsset,
    resolveToolAssetConstraints,
    uploadToolAsset,
    type ToolAssetConstraints,
    type ToolAssetLibraryItem,
    type ToolAssetRecord,
} from "@/services/api/tools/assets";

/**
 * 图片编辑（smart-edit，原站 edit8）工具页骨架。
 *
 * 几何沿用原站真实页面（1908x781，CDP getBoundingClientRect），配色/圆角/阴影改为本项目
 * 设计系统 token（Infinite Canvas 画布风格）：
 *  - 页面：三列间距 10px，上下内边距 10px，底色 bg-background
 *  - 画布列：flex-1（原站 1148px），bg-surface + border + rounded-xl
 *  - 配置列：240px 卡片，bg-card + border + rounded-xl，分区内边距 10px 16px
 *  - 结果列：300px，bg-card + border + rounded-xl，顶部 42px 标签栏，内容内边距 16px 12px
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
            className={cn("flex h-full min-h-0 gap-[10px] overflow-hidden bg-background p-[10px] text-foreground", className)}
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
            className={cn("flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface", className)}
        >
            {children}
        </section>
    );
}

/** 画布内的工具条（画笔/大小/撤销…），原站位于画布列顶部，高 41px。 */
export function Edit8CanvasToolbar({ className, children }: { className?: string; children: ReactNode }) {
    return (
        <div className={cn("flex h-[41px] shrink-0 flex-wrap items-center gap-2 px-4 text-xs text-foreground", className)}>
            {children}
        </div>
    );
}

/** 画布内的白卡容器（原站 542 宽、圆角 12、内边距 16、gap 10）。 */
export function Edit8CanvasCard({ className, children }: { className?: string; children: ReactNode }) {
    return (
        <div
            className={cn(
                "mx-auto flex w-[542px] max-w-full flex-col gap-[10px] rounded-xl border border-border bg-card p-4 shadow-sm",
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
        <div
            data-region="config"
            {...rest}
            className={cn("flex w-[240px] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card", className)}
        >
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
            {footer ? <div className="shrink-0">{footer}</div> : null}
        </div>
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
        <section className={cn("border-b border-border px-[16px] py-[10px] last:border-b-0", className)}>
            {title ? (
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium leading-5 text-foreground">
                        {title}
                        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
                    </span>
                    {aside ? <span className="shrink-0 text-[11px] leading-5 tabular-nums text-muted-foreground">{aside}</span> : null}
                </div>
            ) : null}
            <div className="mt-1.5">{children}</div>
        </section>
    );
}

/** 结果列：300px，顶部 42px 标签栏（选中项 text-foreground + font-medium）。 */
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
            className={cn("flex w-[300px] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card", className)}
        >
            <div role="tablist" className="flex h-[42px] shrink-0 items-center gap-5 border-b border-border px-[13px]">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active === tab.id}
                        data-testid={`edit8-tab-${tab.id}`}
                        onClick={() => onTabChange(tab.id)}
                        className={cn(
                            "h-[42px] text-sm leading-none transition",
                            active === tab.id ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
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
            <p className="text-xs text-muted-foreground">{text}</p>
        </div>
    );
}

/** 主按钮：240x32，bg-primary + shadow-sm，rounded-lg，text-sm。 */
export const edit8PrimaryButtonClass =
    "inline-flex h-8 w-full items-center justify-center rounded-lg bg-primary px-[15px] text-sm font-normal leading-none text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50";

/** 输入框：bg-card、border-border、rounded-lg、13px 字。 */
export const edit8InputClass =
    "w-full rounded-lg border border-border bg-card px-[11px] py-1 text-[13px] leading-5 text-foreground outline-none transition focus:border-foreground/40 disabled:opacity-60";

/** 分段选择：1/2/3/4 张数按钮，rounded-md，选中 bg-primary/10 + border-primary/40。 */
export function Edit8Chip({ selected, onClick, disabled, children }: { selected: boolean; onClick: () => void; disabled?: boolean; children: ReactNode }) {
    return (
        <button
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={onClick}
            className={cn(
                "inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-2 text-[11px] leading-none transition disabled:opacity-50",
                selected ? "border-primary/40 bg-primary/10 text-foreground" : "border-border bg-card text-foreground hover:border-foreground/30 hover:bg-muted",
            )}
        >
            {children}
        </button>
    );
}

/* ------------------------------------------------------------------ *
 * 以下为 2026-11-05 画布类工具空态 1:1 收口追加（向后兼容，不改上面已有组件）。
 * 原站实测（1600×1000）：主按钮渐变 #3a7df9→#723cf9、圆角 6、32 高；次按钮白底 1px 紫边；
 * 结果列页签 14px、选中紫字 + 2px 紫色下划线，右侧 12px 紫色「历史记录」；空态 antd Empty（simple）。
 * ------------------------------------------------------------------ */

/** 原站画布内主按钮（从本地上传 / 上传图片 / 开始精修）：渐变紫、圆角 6。 */
export const edit8GradientButtonClass =
    "inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-[6px] bg-[linear-gradient(90deg,#3a7df9,#723cf9)] px-[15px] text-[14px] leading-none text-white shadow-[0_2px_0_rgba(122,5,255,0.06)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

/** 原站次按钮（从作品库选择 / 批量高清放大）：白底、1px 紫边、紫字。 */
export const edit8OutlineButtonClass =
    "inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-[6px] border border-primary bg-card px-[15px] text-[14px] leading-none text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50";

/** 上传入库：真实 `uploadToolAsset` / `adoptLibraryAsset`，失败原因原样返回给界面。 */
export function useEdit8Upload(constraints: Partial<ToolAssetConstraints> | undefined, onPick: (record: ToolAssetRecord) => void) {
    const resolved = useMemo(() => resolveToolAssetConstraints(constraints), [constraints]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const run = useCallback(
        async (task: () => Promise<ToolAssetRecord>) => {
            setBusy(true);
            setError("");
            try {
                onPick(await task());
            } catch (cause) {
                setError(cause instanceof ToolAssetError ? cause.issue.message : cause instanceof Error ? cause.message : "上传失败");
            } finally {
                setBusy(false);
            }
        },
        [onPick],
    );
    const pickFile = useCallback((file: File | undefined) => (file ? run(() => uploadToolAsset(file, { constraints: resolved })) : undefined), [resolved, run]);
    const pickLibrary = useCallback((item: ToolAssetLibraryItem) => run(() => adoptLibraryAsset(item)), [run]);
    return { accept: resolved.mimeTypes.join(","), busy, error, pickFile, pickLibrary };
}

/** 作品库选择面板（本地资产库真实条目），原站是弹层，这里就地展开。 */
function Edit8LibraryPanel({ items, disabled, onPick }: { items: ToolAssetLibraryItem[]; disabled?: boolean; onPick: (item: ToolAssetLibraryItem) => void }) {
    return (
        <div data-testid="edit8-library-panel" className="max-h-48 w-full overflow-auto rounded-lg border border-border bg-card p-1 text-left">
            {items.length ? null : <p className="m-0! px-2 py-2 text-[12px] text-muted-foreground">作品库还没有可用图片</p>}
            {items.map((item) => (
                <button
                    key={item.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(item)}
                    className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-[12px] text-muted-foreground hover:bg-muted disabled:opacity-50"
                >
                    <img src={item.url} alt="" className="size-8 shrink-0 rounded object-cover" />
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                </button>
            ))}
        </div>
    );
}

/**
 * 原站画布空态白卡：示例媒体 + 标题 + 说明 + 上传按钮组（整卡可拖拽上传）。
 * `layout="row"`：按钮横排（高清放大 / 商品精修 / 智能扩图 / 一键换色）；
 * `layout="stacked"`：「从本地上传」通栏 + 两个库按钮各半（局部重绘 / 局部消除）。
 * 商品库本地未接入，按钮如实禁用（不伪造能力）。
 */
export function Edit8UploadCard({
    testId,
    className,
    media,
    heading,
    layout = "row",
    uploadLabel = "从本地上传",
    library,
    products,
    extraActions,
    hint,
    footer,
    constraints,
    disabled,
    onPick,
}: {
    testId?: string;
    className?: string;
    media?: ReactNode;
    heading: ReactNode;
    layout?: "row" | "stacked";
    uploadLabel?: string;
    library: ToolAssetLibraryItem[];
    products?: boolean;
    extraActions?: ReactNode;
    hint?: ReactNode;
    footer?: ReactNode;
    constraints?: Partial<ToolAssetConstraints>;
    disabled?: boolean;
    onPick: (record: ToolAssetRecord) => void;
}) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [dragging, setDragging] = useState(false);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const images = useMemo(() => library.filter((item) => item.kind === "image"), [library]);
    const pick = useCallback(
        (record: ToolAssetRecord) => {
            setLibraryOpen(false);
            onPick(record);
        },
        [onPick],
    );
    const upload = useEdit8Upload(constraints, pick);
    const locked = disabled || upload.busy;
    const stacked = layout === "stacked";
    const libraryButton = (
        <button
            type="button"
            data-testid="edit8-upload-library"
            disabled={locked}
            title="从作品库（本地资产库）选择"
            onClick={() => setLibraryOpen((open) => !open)}
            className={cn(edit8OutlineButtonClass, stacked && "h-[30px] w-full rounded-[4px]")}
        >
            从作品库选择
        </button>
    );
    const productsButton = products ? (
        <button type="button" data-testid="edit8-upload-products" disabled title="商品库本地未接入" className={cn(edit8OutlineButtonClass, stacked && "h-[30px] w-full rounded-[4px]")}>
            从商品库选择
        </button>
    ) : null;

    return (
        <div
            data-testid={testId}
            onDragOver={(event) => {
                event.preventDefault();
                if (!locked) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (!locked) void upload.pickFile(event.dataTransfer?.files?.[0]);
            }}
            className={cn("flex max-w-full flex-col items-center overflow-hidden rounded-[12px] bg-card text-center", dragging && "ring-2 ring-primary/40", className)}
        >
            {media}
            {heading}
            {stacked ? (
                <div className="flex w-full flex-col gap-[10px]">
                    <button
                        type="button"
                        data-testid="edit8-upload-local"
                        disabled={locked}
                        onClick={() => inputRef.current?.click()}
                        className="inline-flex h-[30px] w-full items-center justify-center gap-2 rounded-[4px] bg-primary text-[14px] leading-none text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                    >
                        <Upload className="size-3.5" aria-hidden />
                        {uploadLabel}
                    </button>
                    <div className="grid w-full grid-cols-2 gap-[10px]">
                        {libraryButton}
                        {productsButton}
                    </div>
                </div>
            ) : (
                <div className="flex flex-wrap items-center justify-center gap-2">
                    <button type="button" data-testid="edit8-upload-local" disabled={locked} onClick={() => inputRef.current?.click()} className={edit8GradientButtonClass}>
                        <Upload className="size-3.5" aria-hidden />
                        {uploadLabel}
                    </button>
                    {libraryButton}
                    {productsButton}
                    {extraActions}
                </div>
            )}
            {libraryOpen ? <Edit8LibraryPanel items={images} disabled={locked} onPick={(item) => void upload.pickLibrary(item)} /> : null}
            {hint}
            {upload.busy ? <p className="m-0! mt-2! text-[12px] text-muted-foreground">正在读取素材…</p> : null}
            {upload.error ? (
                <p role="alert" data-testid="edit8-upload-error" className="m-0! mt-2! text-[12px] text-destructive">
                    {upload.error}
                </p>
            ) : null}
            {footer}
            <input
                ref={inputRef}
                type="file"
                accept={upload.accept}
                className="hidden"
                disabled={locked}
                data-testid="tool-asset-file-input"
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    void upload.pickFile(file);
                }}
            />
        </div>
    );
}

/** 原站配置列 antd Dragger：虚线框 + 紫色上传图标 +「拖拽 或 点击上传 …」+ 限制提示。 */
export function Edit8Dropzone({
    target,
    hint,
    constraints,
    disabled,
    testId,
    className,
    onPick,
}: {
    target: string;
    hint: ReactNode;
    constraints?: Partial<ToolAssetConstraints>;
    disabled?: boolean;
    testId?: string;
    className?: string;
    onPick: (record: ToolAssetRecord) => void;
}) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [dragging, setDragging] = useState(false);
    const upload = useEdit8Upload(constraints, onPick);
    const locked = disabled || upload.busy;
    return (
        <div className={className}>
            <div
                role="button"
                tabIndex={locked ? -1 : 0}
                aria-disabled={locked}
                aria-label={`拖拽 或 点击上传 ${target}`}
                data-testid={testId}
                onClick={() => !locked && inputRef.current?.click()}
                onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    if (!locked) inputRef.current?.click();
                }}
                onDragOver={(event) => {
                    event.preventDefault();
                    if (!locked) setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    if (!locked) void upload.pickFile(event.dataTransfer?.files?.[0]);
                }}
                className={cn(
                    "flex w-full cursor-pointer flex-col items-center justify-center gap-[6px] rounded-[8px] border border-dashed border-[#d9d9d9] bg-black/[0.02] px-2 py-4 text-center transition hover:border-primary",
                    dragging && "border-primary",
                    locked && "cursor-not-allowed opacity-60",
                )}
            >
                <Upload className="size-[18px] text-primary" aria-hidden />
                <p className="m-0! text-[14px] leading-5 text-foreground">
                    拖拽 或 <span className="text-primary">点击上传</span> {target}
                </p>
                <div className="text-[12px] leading-4 text-[#999]">{hint}</div>
            </div>
            {upload.error ? (
                <p role="alert" className="m-0! mt-1! text-[11px] text-destructive">
                    {upload.error}
                </p>
            ) : null}
            <input
                ref={inputRef}
                type="file"
                accept={upload.accept}
                className="hidden"
                disabled={locked}
                data-testid="tool-asset-file-input"
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    void upload.pickFile(file);
                }}
            />
        </div>
    );
}

/** 原站 antd Switch（small 28×16 / 默认 44×22）：真实 checkbox，保留 checked 语义。 */
export function Edit8Switch({
    checked,
    disabled,
    onChange,
    label,
    testId,
    size = "small",
}: {
    checked: boolean;
    disabled?: boolean;
    onChange: (next: boolean) => void;
    label: string;
    testId?: string;
    size?: "small" | "default";
}) {
    const small = size === "small";
    return (
        <span className={cn("relative inline-flex shrink-0", small ? "h-4 w-7" : "h-[22px] w-11", disabled && "opacity-50")}>
            <input
                type="checkbox"
                role="switch"
                aria-label={label}
                data-testid={testId}
                checked={checked}
                disabled={disabled}
                onChange={(event) => onChange(event.target.checked)}
                className="peer absolute inset-0 z-10 m-0 cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
            />
            <span aria-hidden className="absolute inset-0 rounded-full bg-black/25 transition peer-checked:bg-primary" />
            <span
                aria-hidden
                className={cn(
                    "absolute rounded-full bg-white shadow-[0_2px_4px_rgba(0,35,11,0.2)] transition-all",
                    small ? "left-[2px] top-[2px] size-3 peer-checked:left-[14px]" : "left-[2px] top-[2px] size-[18px] peer-checked:left-6",
                )}
            />
        </span>
    );
}

/** 原站结果列页签头：42 高、14px，选中紫字 + 2px 紫色下划线；右侧 12px 紫色「历史记录」。 */
export function Edit8ResultTabs({
    tabs,
    active,
    onTabChange,
    onHistory,
    historyActive,
    historyTestId,
    className,
}: {
    tabs: { id: string; label: string; testId?: string }[];
    active: string;
    onTabChange: (id: string) => void;
    onHistory?: () => void;
    historyActive?: boolean;
    historyTestId?: string;
    className?: string;
}) {
    return (
        <div role="tablist" className={cn("flex h-[42px] shrink-0 items-center gap-[14px] rounded-t-[8px] bg-card px-3", className)}>
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active === tab.id}
                    data-testid={tab.testId ?? `edit8-tab-${tab.id}`}
                    onClick={() => onTabChange(tab.id)}
                    className={cn(
                        "relative h-[42px] text-[14px] leading-[22px] transition",
                        active === tab.id ? "text-primary! after:absolute after:inset-x-0 after:bottom-[1px] after:h-[2px] after:bg-primary" : "text-foreground! hover:text-primary!",
                    )}
                >
                    {tab.label}
                </button>
            ))}
            {onHistory ? (
                <button
                    type="button"
                    data-testid={historyTestId}
                    aria-pressed={historyActive}
                    onClick={onHistory}
                    className={cn("ml-auto! inline-flex items-center gap-1 self-start pt-[8px] text-[12px] leading-[19px] text-primary! hover:opacity-80", historyActive && "font-medium")}
                >
                    <History className="size-3" aria-hidden />
                    历史记录
                </button>
            ) : null}
        </div>
    );
}

/** 原站结果列空态（antd Empty simple 同款 64×41 图形）：14px 60% 黑字，多行居中。 */
export function Edit8Empty({ lines, large, className, testId }: { lines: string[]; large?: boolean; className?: string; testId?: string }) {
    return (
        <div data-testid={testId} className={cn("flex h-full min-h-[200px] items-center justify-center", className)}>
            <div className="mx-2 my-8 text-center">
                <svg width="64" height="41" viewBox="0 0 64 41" aria-hidden className="mx-auto mb-2 text-foreground">
                    <g transform="translate(0 1)" fill="none" fillRule="evenodd">
                        <ellipse cx="32" cy="33" rx="32" ry="7" fill="currentColor" fillOpacity="0.04" />
                        <g fillRule="nonzero" stroke="currentColor" strokeOpacity="0.15">
                            <path d="M55 12.8 44.9 1.3Q44 0 42.9 0H21.1q-1.2 0-2 1.3L9 12.8V22h46z" />
                            <path d="M41.6 16c0-1.7 1-3 2.2-3H55v18.1c0 2.2-1.3 3.9-3 3.9H12c-1.7 0-3-1.7-3-3.9V13h11.2c1.2 0 2.2 1.3 2.2 3s1 2.9 2.2 2.9h14.8c1.2 0 2.2-1.4 2.2-3" fill="currentColor" fillOpacity="0.02" />
                        </g>
                    </g>
                </svg>
                {lines.map((line) => (
                    <span key={line} className={cn("block text-foreground/60", large ? "text-[16px] leading-[25px]" : "text-[14px] leading-[22px]")}>
                        {line}
                    </span>
                ))}
            </div>
        </div>
    );
}
