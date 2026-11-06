import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronRight, Loader2 } from "lucide-react";

import { ToolResult } from "@/components/tools/tool-result";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import { cn } from "@/lib/utils";
import {
    ORNAMENT_TEXT_FONTS,
    ORNAMENT_TEXT_FONT_SIZE,
    ORNAMENT_TEXT_RINGS,
    ORNAMENT_TEXT_TEXT_LIMIT,
    ORNAMENT_TEXT_TOOL_ID,
    clampOrnamentTextFontSize,
    createOrnamentTextValues,
    ornamentTextFont,
    ornamentTextRing,
    parseOrnamentTextPrompt,
    readOrnamentTextValues,
    sanitizeOrnamentText,
    validateOrnamentTextState,
    type OrnamentTextValues,
} from "@/features/tools/registry/ornament-text";
import { OrnamentTextAdapterError, ornamentTextResultFromTask, retryOrnamentText, runOrnamentText, type OrnamentTextGatewayLike } from "@/features/tools/adapters/ornament-text";
import { resolveModelChannel, selectableModelsByCapability, useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";
import type { ToolTask } from "@/services/api/tools/task-machine";

const toolId = ORNAMENT_TEXT_TOOL_ID;
const labelClass = "mb-1 text-[12px] leading-[22px] text-muted-foreground";

/** 原站「字体 / 挂环位置」选择卡：80px 高灰底行卡，点击向右弹出 116×116 网格。 */
function PickerCard({ testId, image, title, value, children }: { testId: string; image: string; title: string; value: string; children: (close: () => void) => ReactNode }) {
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState({ left: 0, top: 0 });
    const ref = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!open) return;
        const onDown = (event: MouseEvent) => {
            if (!ref.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [open]);
    return (
        <div ref={ref} className="relative mt-[10px]">
            <button
                type="button"
                data-testid={testId}
                aria-expanded={open}
                onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setAnchor({ left: rect.right + 20, top: Math.max(8, Math.min(rect.top, window.innerHeight - 528)) });
                    setOpen((previous) => !previous);
                }}
                className={cn(
                    "flex h-20 w-full items-center rounded-[6px] border p-[10px] text-left transition-colors",
                    open ? "border-selected bg-selected-soft" : "border-border bg-muted hover:border-selected hover:bg-selected-soft",
                )}
            >
                <span className="flex size-[60px] shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-white">
                    <img src={image} alt="" className="max-h-[52px] max-w-[52px] object-contain" />
                </span>
                <span className="ml-[10px] min-w-0 flex-1">
                    <span className="block text-[14px] leading-[22px] text-foreground/70">{title}</span>
                    <span className="block truncate text-[12px] leading-[22px] text-muted-foreground">{value}</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
            </button>
            {open ? (
                <div style={anchor} className="fixed z-50 max-h-[520px] w-max overflow-y-auto rounded-[12px] bg-muted p-4 shadow-[0_6px_16px_rgba(0,0,0,0.12)]">
                    {children(() => setOpen(false))}
                </div>
            ) : null}
        </div>
    );
}

function PickerItem({ active, label, image, onClick, contain }: { active: boolean; label: string; image: string; onClick: () => void; contain?: boolean }) {
    return (
        <div className="w-[116px]">
            <button
                type="button"
                aria-pressed={active}
                aria-label={label}
                onClick={onClick}
                className={cn("relative block size-[116px] overflow-hidden rounded-[6px] border-[3px] bg-white", active ? "border-selected" : "border-transparent hover:border-selected")}
            >
                <img src={image} alt="" className={cn("h-full w-full", contain ? "object-contain p-2" : "object-cover")} />
                {active ? (
                    <span className="absolute right-0 top-0 flex size-5 items-center justify-center rounded-bl-[6px] bg-selected text-white">
                        <Check className="size-3" />
                    </span>
                ) : null}
            </button>
            <p className="mt-[10px] w-full truncate text-center text-[14px] text-foreground/70">{label}</p>
        </div>
    );
}

/**
 * 饰品文字工作台。原站 /draw/ornament-text 对本账号重定向首页，结构按 rea 还原的原站 chunk 复刻：
 * 左 300px 配置（文字内容 / 字体 / 挂环位置 / 字体大小 + 底部立即生成），右侧灰底「生成结果」。
 */
export function OrnamentTextWorkspace() {
    const config = useConfigStore((state) => state.config);
    const imageModels = useMemo(() => selectableModelsByCapability(config, "image"), [config]);
    const model = config.imageModel || imageModels[0] || "";
    const modelReady = Boolean(model && resolveModelChannel(config, model));

    const [values, setValues] = useState<OrnamentTextValues>(() => createOrnamentTextValues());
    const [submitted, setSubmitted] = useState<OrnamentTextValues | null>(null);
    const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
    const [running, setRunning] = useState(false);
    const [errorText, setErrorText] = useState("");

    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const draftRevision = useToolDraftStore((state) => state.drafts[toolId]?.revision ?? null);
    const tasks = useToolTaskStore((state) => state.tasks);
    const runTool = useToolTaskStore((state) => state.runTool);
    const retryTask = useToolTaskStore((state) => state.retryTask);

    useEffect(() => {
        let alive = true;
        void hydrateDraft(toolId).then((draft) => {
            if (alive && draft) setValues(readOrnamentTextValues(draft.values));
        });
        return () => {
            alive = false;
        };
    }, [hydrateDraft]);

    const update = useCallback(
        (patch: Partial<OrnamentTextValues>) => {
            setValues((previous) => {
                const next = { ...previous, ...patch };
                patchDraft(toolId, { values: next as unknown as Record<string, unknown> });
                return next;
            });
        },
        [patchDraft],
    );

    const latest = useMemo(() => Object.values(tasks).filter((task) => task.toolId === toolId).sort((a, b) => b.createdAt - a.createdAt)[0], [tasks]);
    const activeTask = (activeTaskId ? tasks[activeTaskId] : undefined) ?? latest ?? null;
    const issues = useMemo(() => validateOrnamentTextState({ values, modelReady }), [values, modelReady]);
    const result = submitted && activeTask ? ornamentTextResultFromTask(activeTask, submitted, values) : null;

    const gateway = useMemo<OrnamentTextGatewayLike>(
        () => ({
            submit: (input, options) => runTool(input, { ...options, draftRevision }),
            waitForResult: async (id) => {
                const task = useToolTaskStore.getState().tasks[id];
                if (!task) throw new OrnamentTextAdapterError("task-missing", "任务记录不存在，无法等待结果。");
                return task;
            },
            retry: (id, input, options) => retryTask(id, input, options),
        }),
        [draftRevision, retryTask, runTool],
    );

    const run = useCallback(
        async (retryId?: string) => {
            if (issues.length) {
                setErrorText(issues[0].message);
                return;
            }
            setRunning(true);
            setErrorText("");
            try {
                const options = { gateway, values, model, revision: draftRevision, modelReady };
                const outcome = retryId ? await retryOrnamentText({ ...options, taskId: retryId }) : await runOrnamentText(options);
                setSubmitted(values);
                setActiveTaskId(outcome.task.id);
                if (outcome.task.status === "failed") setErrorText(outcome.task.error?.message ?? "生成失败，上游未返回原因。");
            } catch (error) {
                setErrorText(error instanceof Error ? error.message : "提交失败，请重试。");
            } finally {
                setRunning(false);
            }
        },
        [draftRevision, gateway, issues, model, modelReady, values],
    );

    /** 原站「再次编辑」：把历史任务的参数回填到配置栏（已填写内容时先确认）。 */
    const rebuild = useCallback(
        (task: ToolTask) => {
            const next = parseOrnamentTextPrompt(task.prompt);
            if (!next) return setActiveTaskId(task.id);
            if (values.text && !window.confirm("您已经填写了内容，确定用新的内容替换已填写的内容？")) return;
            update(next);
            setActiveTaskId(task.id);
        },
        [update, values.text],
    );

    const font = ornamentTextFont(values.fontname) ?? ORNAMENT_TEXT_FONTS[0];
    const ring = ornamentTextRing(values.ring);

    return (
        <div data-testid="ornament-text-workspace" className="flex h-full min-h-0 flex-col">
            <ToolWorkspaceColumns
                className="min-h-0 flex-1"
                configClassName="overflow-visible rounded-[8px] border border-border bg-background"
                mainClassName="min-h-0 overflow-hidden"
                config={
                    <div className="flex h-full min-h-0 flex-col">
                        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-[10px]">
                            <p className={labelClass}>文字内容</p>
                            <div className="relative rounded-[6px] border border-border pb-6">
                                <textarea
                                    aria-label="文字内容"
                                    data-testid="ornament-text-input"
                                    rows={3}
                                    value={values.text}
                                    maxLength={ORNAMENT_TEXT_TEXT_LIMIT}
                                    onChange={(event) => update({ text: sanitizeOrnamentText(event.target.value) })}
                                    placeholder="输入想要生成的文字内容，仅支持输入英文、不要包含空格，例如：jewelry"
                                    className="block w-full resize-none rounded-[6px] bg-transparent px-[11px] py-1 text-[14px] leading-[22px] outline-none placeholder:text-muted-foreground/70"
                                />
                                <span className="absolute bottom-1 right-[10px] text-[12px] text-muted-foreground">
                                    {values.text.length} / {ORNAMENT_TEXT_TEXT_LIMIT}
                                </span>
                            </div>

                            <PickerCard testId="ornament-font-picker" image={font.image} title="字体" value={font.style}>
                                {(close) => (
                                    <div className="grid grid-cols-3 gap-[10px]">
                                        {ORNAMENT_TEXT_FONTS.map((item) => (
                                            <PickerItem key={item.style} label={item.style} image={item.image} contain active={item.style === values.fontname} onClick={() => (update({ fontname: item.style }), close())} />
                                        ))}
                                    </div>
                                )}
                            </PickerCard>

                            <PickerCard testId="ornament-ring-picker" image={ring.image} title="挂环位置" value={ring.title}>
                                {(close) => (
                                    <div className="grid grid-cols-2 gap-[10px]">
                                        {ORNAMENT_TEXT_RINGS.map((item) => (
                                            <PickerItem key={item.value} label={item.title} image={item.image} active={item.value === values.ring} onClick={() => (update({ ring: item.value }), close())} />
                                        ))}
                                    </div>
                                )}
                            </PickerCard>

                            <div className="mt-4">
                                <p className={labelClass}>字体大小</p>
                                <div className="flex items-center">
                                    <input
                                        aria-label="字体大小"
                                        data-testid="ornament-font-size"
                                        type="number"
                                        min={ORNAMENT_TEXT_FONT_SIZE.min}
                                        max={ORNAMENT_TEXT_FONT_SIZE.max}
                                        step={1}
                                        value={values.fontSize}
                                        onChange={(event) => update({ fontSize: event.target.value === "" ? Number.NaN : clampOrnamentTextFontSize(Number(event.target.value)) })}
                                        onBlur={(event) => {
                                            if (!event.target.value) update({ fontSize: ORNAMENT_TEXT_FONT_SIZE.default });
                                        }}
                                        className="h-8 w-[60px] rounded-[6px] border border-border text-center text-[14px] outline-none focus:border-selected [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <span className="ml-[10px] text-[14px] text-foreground/70">pt</span>
                                </div>
                            </div>
                        </div>
                        <div className="shrink-0 border-t-[3px] border-border px-4 py-2">
                            <button
                                type="button"
                                data-testid="ornament-submit"
                                disabled={!values.text || running}
                                onClick={() => void run()}
                                className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-[6px] bg-primary text-[12px] text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {running ? <Loader2 className="size-3.5 animate-spin" /> : null}
                                立即生成
                            </button>
                            {errorText ? <p data-testid="ornament-error" className="mt-1 text-[12px] text-destructive">{errorText}</p> : null}
                        </div>
                    </div>
                }
            >
                <div className="flex h-[42px] shrink-0 items-center border-b border-border bg-background px-4">
                    <span className="border-b-2 border-foreground py-[9px] text-[14px] text-foreground">生成结果</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {activeTask ? (
                        <>
                            {result?.stale ? <p className="mb-2 text-[12px] text-muted-foreground">当前参数已变化（{result.drift}），下方结果来自上一次提交。</p> : null}
                            <ToolResult task={activeTask} toolId={toolId} title="生成结果" onRetry={() => void run(activeTask.id)} />
                        </>
                    ) : (
                        <div data-testid="ornament-empty" className="flex h-full min-h-[320px] flex-col items-center justify-center text-[14px] text-muted-foreground">
                            <p>暂无生成结果图</p>
                            <p className="mt-1 text-[12px]">快在左侧输入文字生成饰品吧~</p>
                        </div>
                    )}
                    <ToolTaskHistory toolId={toolId} className="mt-4" emptyHint="还没有饰品文字任务记录" onSelectTask={rebuild} selectWithoutResult />
                </div>
            </ToolWorkspaceColumns>
        </div>
    );
}

export default OrnamentTextWorkspace;

/**
 * TASK-036：图片文字编辑（IMAGE_TEXT_EDIT）工作区。
 * 实现单独放在 image-text-edit.tsx（画布/框选/属性面板体量大），本文件作为 text 家族的统一入口再导出。
 */
export { ImageTextEditWorkspace } from "./image-text-edit";
export { default as ImageTextEditWorkspaceEntry } from "./image-text-edit";
