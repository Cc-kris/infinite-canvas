import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, CircleHelp, History, Loader2, RefreshCw, Search, X } from "lucide-react";

import { ToolResult } from "@/components/tools/tool-result";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import { cn } from "@/lib/utils";
import {
    AI_TEXT_ADVANCED_LIMIT,
    AI_TEXT_AUTOPROMPT_OPTIONS,
    AI_TEXT_CASES,
    AI_TEXT_OUTPUT_OPTIONS,
    AI_TEXT_RATIOS,
    AI_TEXT_SIMILARITY_MARKS,
    AI_TEXT_SIMPLE_LIMIT,
    AI_TEXT_STYLES,
    AI_TEXT_TEMPLATES,
    AI_TEXT_TOOL_ID,
    aiTextExample,
    createAiTextValues,
    readAiTextValues,
    validateAiTextValues,
    type AiTextAutoprompt,
    type AiTextCase,
    type AiTextSimilarValues,
    type AiTextValues,
} from "@/features/tools/registry/ai-text-v2";
import { aiTextReferenceFromUrl, buildAiTextModeInput, buildAiTextSimilarInput } from "@/features/tools/adapters/ai-text-v2";
import { resolveModelChannel, selectableModelsByCapability, useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";
import type { BrowserToolInput } from "@/services/api/tools/gateway";

const toolId = AI_TEXT_TOOL_ID;
const sectionTitle = "text-[14px] leading-[22px] text-muted-foreground";

function RatioGrid({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    return (
        <div className="grid grid-cols-3 gap-[10px]">
            {AI_TEXT_RATIOS.map((ratio) => (
                <button
                    key={ratio.value}
                    type="button"
                    aria-pressed={ratio.value === value}
                    onClick={() => onChange(ratio.value)}
                    className={cn(
                        "flex h-[26px] items-center justify-center rounded-[4px] border text-[14px] transition-colors",
                        ratio.value === value ? "border-selected bg-selected-soft text-foreground" : "border-border bg-background text-foreground/70 hover:bg-accent hover:text-foreground",
                    )}
                >
                    <span className={cn("mr-[5px] inline-block border", ratio.value === value ? "border-selected" : "border-foreground/30")} style={{ width: ratio.w, height: ratio.h }} />
                    {ratio.value}
                </button>
            ))}
        </div>
    );
}

function AutopromptGrid({ value, onChange }: { value: AiTextAutoprompt; onChange: (value: AiTextAutoprompt) => void }) {
    return (
        <>
            <div className={cn(sectionTitle, "mb-2 flex items-center gap-1")}>
                提示词优化
                <span title="可增强您的初始提示词，提高图像的多样性和丰富性。">
                    <CircleHelp className="size-3.5" aria-label="可增强您的初始提示词，提高图像的多样性和丰富性。" />
                </span>
            </div>
            <div className="grid grid-cols-3 gap-[10px]">
                {AI_TEXT_AUTOPROMPT_OPTIONS.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={option.value === value}
                        onClick={() => onChange(option.value)}
                        className={cn("h-[26px] rounded-[4px] border text-[14px]", option.value === value ? "border-selected bg-selected-soft text-foreground" : "border-border bg-background hover:bg-accent")}
                    >
                        {option.title}
                    </button>
                ))}
            </div>
        </>
    );
}

function PromptBox({ value, limit, placeholder, onChange, onExample, light }: { value: string; limit: number; placeholder: string; onChange: (value: string) => void; onExample: () => void; light?: boolean }) {
    return (
        <div className={cn("rounded-[6px]", light ? "border border-border bg-background" : "bg-muted")}>
            <textarea
                aria-label="文字内容和创意方向"
                rows={4}
                value={value}
                maxLength={limit}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
                className="block w-full resize-none bg-transparent px-[11px] py-2 text-[14px] leading-[22px] text-muted-foreground outline-none placeholder:text-muted-foreground/70"
            />
            <div className="flex items-center justify-between px-[10px] pb-[10px] text-[12px]">
                <button type="button" onClick={onExample} className="inline-flex items-center gap-1 hover:text-foreground">
                    <RefreshCw className="size-3" />
                    尝试示例
                </button>
                <span className="text-muted-foreground">
                    {value.length} / {limit}
                </span>
            </div>
        </div>
    );
}

function StyleChips({ value, onToggle }: { value: readonly string[]; onToggle: (styleEn: string) => void }) {
    return (
        <div className="flex flex-wrap gap-2">
            {AI_TEXT_STYLES.map((style) => {
                const active = value.includes(style.styleEn);
                return (
                    <button
                        key={style.styleEn}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onToggle(style.styleEn)}
                        className={cn("rounded-[4px] border px-[10px] py-[2px] text-[13px]", active ? "border-selected bg-selected-soft text-foreground" : "border-border bg-background text-foreground/70 hover:text-foreground")}
                    >
                        {style.style}
                    </button>
                );
            })}
        </div>
    );
}

/** 原站「生成创意文字的相似裂变图」弹窗（670px）。 */
function SimilarModal({ initial, onClose, onSubmit, running }: { initial: AiTextSimilarValues; onClose: () => void; onSubmit: (values: AiTextSimilarValues) => void; running: boolean }) {
    const [values, setValues] = useState(initial);
    const marks = Object.entries(AI_TEXT_SIMILARITY_MARKS);
    return (
        <div role="dialog" aria-modal="true" aria-label="生成创意文字的相似裂变图" data-testid="ai-text-similar-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6">
            <div className="flex max-h-full w-[670px] max-w-full flex-col overflow-hidden rounded-[12px] bg-background">
                <div className="flex items-center justify-between px-6 pt-5">
                    <h2 className="text-[16px] font-medium">生成创意文字的相似裂变图</h2>
                    <button type="button" aria-label="关闭" onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X className="size-4" />
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                    <p className="mb-3 text-[14px] text-muted-foreground">根据选择的参考图，生成相似裂变图</p>
                    <div className="mb-4 flex items-center gap-3">
                        <span className="text-[14px] text-foreground/70">选择的参考图</span>
                        <img src={values.imageUrl} alt="选择的参考图" className="h-20 w-20 rounded-[6px] object-cover" />
                    </div>
                    <label className="mb-1 block text-[14px] text-foreground/70">生成图与原图相似度</label>
                    <input type="range" min={0} max={100} step={25} value={values.variationStrength} onChange={(event) => setValues({ ...values, variationStrength: Number(event.target.value) })} className="w-full accent-[var(--selected)]" aria-label="生成图与原图相似度" />
                    <div className="mb-4 flex justify-between text-[12px] text-muted-foreground">
                        {marks.map(([key, label]) => (
                            <span key={key} className={Number(key) === values.variationStrength ? "text-foreground" : ""}>
                                {label}
                            </span>
                        ))}
                    </div>
                    <label className="mb-1 block text-[14px] text-foreground/70">生成文字和创意方向</label>
                    <textarea
                        rows={4}
                        value={values.prompt}
                        maxLength={AI_TEXT_ADVANCED_LIMIT}
                        onChange={(event) => setValues({ ...values, prompt: event.target.value })}
                        placeholder={'输入要生成的文字内容和创意方向，使用英文更准确。例如填写“"I love you" in shape of heart”就可以生成心形的"I love you"文字'}
                        className="mb-4 block w-full resize-none rounded-[6px] bg-muted px-[11px] py-2 text-[14px] outline-none"
                    />
                    <label className="mb-2 block text-[14px] text-foreground/70">创意风格（可多选）</label>
                    <StyleChips value={values.styles} onToggle={(en) => setValues({ ...values, styles: values.styles.includes(en) ? values.styles.filter((s) => s !== en) : [...values.styles, en] })} />
                </div>
                <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-3">
                    <span className="text-[12px] text-muted-foreground">生成张数: {values.outputNum}</span>
                    <button
                        type="button"
                        data-testid="ai-text-similar-submit"
                        disabled={running || !values.prompt.trim()}
                        onClick={() => onSubmit(values)}
                        className="inline-flex h-10 w-[268px] items-center justify-center gap-1 rounded-[6px] bg-primary text-[12px] text-primary-foreground! disabled:opacity-50"
                    >
                        {running ? <Loader2 className="size-3.5 animate-spin" /> : null}
                        立即生成
                    </button>
                </div>
            </div>
        </div>
    );
}

function CaseCard({ item, onApply, onSimilar, onPreview }: { item: AiTextCase; onApply: () => void; onSimilar: () => void; onPreview: () => void }) {
    return (
        <div data-testid="ai-text-case" className="mb-3 break-inside-avoid overflow-hidden rounded-[12px] bg-background shadow-[0_2px_4px_rgba(0,0,0,0.25)]">
            <div className="group relative">
                <img src={item.image} alt={`优秀案例-${item.id}`} loading="lazy" className="block w-full object-contain" />
                <div className="absolute inset-0 flex flex-col items-center justify-between bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="h-10" />
                    <button type="button" onClick={onPreview} className="text-[12px]">
                        预览
                    </button>
                    <div className="mb-[10px] flex gap-[5px]">
                        <button type="button" onClick={onApply} className="rounded-[4px] bg-primary px-2 py-0.5 text-[12px] text-primary-foreground">
                            做同款
                        </button>
                        <button type="button" onClick={onSimilar} className="rounded-[4px] border border-white/60 px-2 py-0.5 text-[12px]">
                            相似裂变
                        </button>
                    </div>
                </div>
            </div>
            <p className="line-clamp-2 border-t border-border px-3 pb-2 pt-2 text-[13px] text-foreground/70 hover:text-foreground">
                {item.prompt}
                {item.styles ? `,${item.styles}` : ""}
            </p>
        </div>
    );
}

/**
 * POD素材（AI_TEXT）工作台。原站 /draw/ai-text 对本账号重定向首页，结构按 rea 还原的原站 chunk 复刻：
 * 左 296px 配置（简易模式 / 高阶模式页签 + 底部立即生成），右侧「生成结果 / 优秀案例」+ 历史记录。
 */
export function AiTextStatic() {
    const config = useConfigStore((state) => state.config);
    const imageModels = useMemo(() => selectableModelsByCapability(config, "image"), [config]);
    const model = config.imageModel || imageModels[0] || "";
    const modelReady = Boolean(model && resolveModelChannel(config, model));

    const [values, setValues] = useState<AiTextValues>(() => createAiTextValues());
    const [rightTab, setRightTab] = useState<"result" | "cases" | "history">("result");
    const [running, setRunning] = useState(false);
    const [errorText, setErrorText] = useState("");
    const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
    const [similar, setSimilar] = useState<AiTextSimilarValues | null>(null);
    const [preview, setPreview] = useState<AiTextCase | null>(null);
    const [keyword, setKeyword] = useState("");

    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const draftRevision = useToolDraftStore((state) => state.drafts[toolId]?.revision ?? null);
    const tasks = useToolTaskStore((state) => state.tasks);
    const runTool = useToolTaskStore((state) => state.runTool);

    useEffect(() => {
        let alive = true;
        void hydrateDraft(toolId).then((draft) => {
            if (alive && draft) setValues(readAiTextValues(draft.values));
        });
        return () => {
            alive = false;
        };
    }, [hydrateDraft]);

    const update = useCallback(
        (patch: Partial<AiTextValues>) => {
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
    const firstResult = activeTask?.result?.items.find((item) => item.kind === "image");
    const firstResultUrl = firstResult?.url ?? firstResult?.dataUrl;

    const submit = useCallback(
        async (build: () => Promise<BrowserToolInput> | BrowserToolInput) => {
            if (!modelReady) {
                setErrorText("未配置可用的图片模型，提交已禁用。");
                return;
            }
            setRunning(true);
            setErrorText("");
            try {
                const task = await runTool(await build(), { draftRevision });
                setActiveTaskId(task.id);
                setRightTab("result");
                setSimilar(null);
                if (task.status === "failed") setErrorText(task.error?.message ?? "生成失败，上游未返回原因。");
            } catch (error) {
                setErrorText(error instanceof Error ? error.message : "提交失败，请重试。");
            } finally {
                setRunning(false);
            }
        },
        [draftRevision, modelReady, runTool],
    );

    const openSimilar = (imageUrl: string, prompt: string, styles: string[], ratio: string) =>
        setSimilar({ imageUrl, prompt, styles, ratio: AI_TEXT_RATIOS.some((r) => r.value === ratio) ? ratio : "1:1", variationStrength: 50, autoprompt: "AUTO", outputNum: 4 });

    /** 原站「做同款」：案例参数回填到高阶模式（已填写时先确认）。 */
    const applyCase = (item: AiTextCase) => {
        if (values.advancedPrompt && !window.confirm("您已经填写了内容，确定用新的内容替换已填写的内容？")) return;
        const styles = item.styles ? item.styles.split(",").filter((s) => AI_TEXT_STYLES.some((style) => style.styleEn === s)) : [];
        update({ mode: "ADVANCED", advancedPrompt: item.prompt.slice(0, AI_TEXT_ADVANCED_LIMIT), styles, advancedRatio: AI_TEXT_RATIOS.some((r) => r.value === item.ratio) ? item.ratio : values.advancedRatio });
    };

    const simpleExample = () => {
        const template = AI_TEXT_TEMPLATES[Math.floor(Math.random() * AI_TEXT_TEMPLATES.length)];
        update({ templateId: template.id, simplePrompt: template.examples[0] ?? "" });
    };
    const advancedExample = () => {
        const item = aiTextExample(Math.floor(Math.random() * AI_TEXT_CASES.length));
        update({ advancedPrompt: item.prompt.slice(0, AI_TEXT_ADVANCED_LIMIT), styles: item.styles ? item.styles.split(",") : [], advancedRatio: AI_TEXT_RATIOS.some((r) => r.value === item.ratio) ? item.ratio : "1:1" });
    };

    const cases = useMemo(() => {
        const word = keyword.trim().toLowerCase();
        return word ? AI_TEXT_CASES.filter((item) => `${item.prompt} ${item.styles}`.toLowerCase().includes(word)) : AI_TEXT_CASES;
    }, [keyword]);

    const tabButton = (key: typeof rightTab, label: ReactNode) => (
        <button
            key={key}
            type="button"
            role="tab"
            aria-selected={rightTab === key}
            onClick={() => setRightTab(key)}
            className={cn("h-10 border-b-2 text-[14px]", rightTab === key ? "border-foreground text-foreground" : "border-transparent text-foreground/70 hover:text-foreground")}
        >
            {label}
        </button>
    );

    const blocked = Boolean(validateAiTextValues(values)) || running;

    return (
        <div data-testid="ai-text-workspace" className="flex h-full min-h-0 flex-col">
            <ToolWorkspaceColumns
                className="min-h-0 flex-1"
                configClassName="overflow-hidden rounded-[8px] border border-border bg-background"
                mainClassName="min-h-0 overflow-hidden"
                config={
                    <div className="flex h-full min-h-0 flex-col">
                        <div role="tablist" aria-label="生成模式" className="flex h-10 shrink-0 items-center justify-center gap-[22px] border-b border-border">
                            {(["SIMPLE", "ADVANCED"] as const).map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    role="tab"
                                    aria-selected={values.mode === mode}
                                    data-testid={`ai-text-mode-${mode.toLowerCase()}`}
                                    onClick={() => update({ mode })}
                                    className={cn("h-10 border-b-2 text-[14px]", values.mode === mode ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
                                >
                                    {mode === "SIMPLE" ? "简易模式" : "高阶模式"}
                                </button>
                            ))}
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto p-4 [scrollbar-gutter:stable]">
                            {values.mode === "SIMPLE" ? (
                                <>
                                    <p className="mb-[5px] text-[12px] leading-[22px] text-muted-foreground">文字内容和创意方向</p>
                                    <PromptBox light value={values.simplePrompt} limit={AI_TEXT_SIMPLE_LIMIT} placeholder="输入要生成的文字内容，使用英文更准确。例如“I love you”或谚语语句等" onChange={(simplePrompt) => update({ simplePrompt })} onExample={simpleExample} />
                                    <div className="mt-5">
                                        <AutopromptGrid value={values.simpleAutoprompt} onChange={(simpleAutoprompt) => update({ simpleAutoprompt })} />
                                    </div>
                                    <p className={cn(sectionTitle, "my-[15px]")}>创意风格模板</p>
                                    <div className="grid grid-cols-3 gap-x-2 gap-y-1">
                                        {AI_TEXT_TEMPLATES.map((template) => (
                                            <button
                                                key={template.id}
                                                type="button"
                                                aria-pressed={template.id === values.templateId}
                                                aria-label={template.style}
                                                onClick={() => update({ templateId: template.id })}
                                                className={cn("relative aspect-square overflow-hidden rounded-[8px] border-[3px]", template.id === values.templateId ? "border-selected" : "border-transparent")}
                                            >
                                                <img src={template.image} alt="" className="h-full w-full object-cover" />
                                                <span className="absolute inset-x-0 bottom-0 flex h-5 items-center justify-center truncate bg-black/40 text-[13px] text-white">{template.style}</span>
                                                {template.id === values.templateId ? (
                                                    <span className="absolute right-0 top-0 flex size-4 items-center justify-center rounded-bl-[6px] bg-selected text-white">
                                                        <Check className="size-3" />
                                                    </span>
                                                ) : null}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="mt-5">
                                        <p className={cn(sectionTitle, "mb-2")}>图片比例</p>
                                        <RatioGrid value={values.simpleRatio} onChange={(simpleRatio) => update({ simpleRatio })} />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <p className="mb-[10px] text-[14px] text-muted-foreground">文字内容和创意方向</p>
                                    <PromptBox
                                        value={values.advancedPrompt}
                                        limit={AI_TEXT_ADVANCED_LIMIT}
                                        placeholder={'输入要生成的文字内容和创意方向，使用英文更准确。例如填写“"I love you" in shape of heart”就可以生成心形的"I love you"文字'}
                                        onChange={(advancedPrompt) => update({ advancedPrompt })}
                                        onExample={advancedExample}
                                    />
                                    <div className="mt-5">
                                        <AutopromptGrid value={values.advancedAutoprompt} onChange={(advancedAutoprompt) => update({ advancedAutoprompt })} />
                                    </div>
                                    <p className={cn(sectionTitle, "my-[15px]")}>创意风格（可多选）</p>
                                    <StyleChips value={values.styles} onToggle={(en) => update({ styles: values.styles.includes(en) ? values.styles.filter((s) => s !== en) : [...values.styles, en] })} />
                                    <div className="mt-[50px]">
                                        <p className={cn(sectionTitle, "mb-2")}>图片比例</p>
                                        <RatioGrid value={values.advancedRatio} onChange={(advancedRatio) => update({ advancedRatio })} />
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="flex h-12 shrink-0 items-center gap-2 border-t-[3px] border-border px-4">
                            <button
                                type="button"
                                data-testid="ai-text-submit"
                                disabled={blocked}
                                onClick={() => void submit(() => buildAiTextModeInput(values, model))}
                                className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-[6px] bg-primary text-[12px] text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {running ? <Loader2 className="size-3.5 animate-spin" /> : null}
                                立即生成
                            </button>
                            <label className="flex items-center whitespace-nowrap text-[12px] text-foreground/70">
                                生成
                                <select aria-label="生成张数" value={values.outputNum} onChange={(event) => update({ outputNum: Number(event.target.value) })} className="bg-transparent text-[14px] outline-none">
                                    {AI_TEXT_OUTPUT_OPTIONS.map((count) => (
                                        <option key={count} value={count}>
                                            {count}张
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        {errorText ? <p data-testid="ai-text-error" className="px-4 pb-2 text-[12px] text-destructive">{errorText}</p> : null}
                    </div>
                }
            >
                <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-background px-3">
                    <div role="tablist" aria-label="结果区" className="flex gap-[22px]">
                        {tabButton("result", "生成结果")}
                        {tabButton("cases", "优秀案例")}
                    </div>
                    <button type="button" onClick={() => setRightTab("history")} className={cn("inline-flex items-center gap-1 text-[12px]", rightTab === "history" ? "text-foreground" : "text-foreground/70 hover:text-foreground")}>
                        <History className="size-3.5" />
                        历史记录
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {rightTab === "result" ? (
                        activeTask ? (
                            <>
                                <ToolResult task={activeTask} toolId={toolId} title="生成结果" />
                                {firstResultUrl ? (
                                    <button
                                        type="button"
                                        data-testid="ai-text-result-similar"
                                        onClick={() => openSimilar(firstResultUrl, values.mode === "SIMPLE" ? values.simplePrompt : values.advancedPrompt, values.mode === "ADVANCED" ? values.styles : [], values.mode === "SIMPLE" ? values.simpleRatio : values.advancedRatio)}
                                        className="mt-3 rounded-[6px] border border-border bg-background px-3 py-1 text-[12px] text-foreground hover:bg-accent"
                                    >
                                        相似裂变
                                    </button>
                                ) : null}
                            </>
                        ) : (
                            <div data-testid="ai-text-empty" className="flex h-full min-h-[320px] flex-col items-center justify-center text-[14px] text-muted-foreground">
                                <p>暂无生成结果图</p>
                                <p className="mt-1 text-[12px]">
                                    快在左侧输入文字生成，或去
                                    <button type="button" onClick={() => setRightTab("cases")} className="text-foreground">
                                        优秀案例
                                    </button>
                                    找灵感吧~
                                </p>
                            </div>
                        )
                    ) : rightTab === "cases" ? (
                        <>
                            <div className="sticky top-[-16px] z-10 -mx-4 -mt-4 mb-2 flex items-center justify-between bg-canvas px-4 py-2 text-[14px]">
                                <span className="text-foreground/70">
                                    筛选：<span className="text-foreground">全部</span>
                                </span>
                                <label className="flex h-8 w-[260px] items-center gap-2 rounded-[6px] bg-background px-2">
                                    <Search className="size-3.5 text-muted-foreground" />
                                    <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="请输入关键词" aria-label="请输入关键词" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
                                </label>
                                <span className="text-foreground/70">
                                    排序：<span className="text-foreground">官方推荐</span>
                                </span>
                            </div>
                            {cases.length ? (
                                <div className="[column-gap:20px] [column-width:220px]">
                                    {cases.map((item) => (
                                        <CaseCard
                                            key={item.id}
                                            item={item}
                                            onPreview={() => setPreview(item)}
                                            onApply={() => applyCase(item)}
                                            onSimilar={() => openSimilar(item.image, item.prompt, item.styles ? item.styles.split(",") : [], item.ratio)}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="flex h-[500px] items-center justify-center text-[14px] text-muted-foreground">暂无搜索结果</div>
                            )}
                        </>
                    ) : (
                        <ToolTaskHistory
                            toolId={toolId}
                            emptyHint="还没有POD素材任务记录"
                            onSelectTask={(task) => {
                                setActiveTaskId(task.id);
                                setRightTab("result");
                            }}
                        />
                    )}
                </div>
            </ToolWorkspaceColumns>

            {similar ? (
                <SimilarModal
                    initial={similar}
                    running={running}
                    onClose={() => setSimilar(null)}
                    onSubmit={(next) => void submit(async () => buildAiTextSimilarInput(next, await aiTextReferenceFromUrl(next.imageUrl), model))}
                />
            ) : null}

            {preview ? (
                <div role="dialog" aria-modal="true" onClick={() => setPreview(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
                    <div className="max-h-full max-w-[720px] overflow-hidden rounded-[12px] bg-background" onClick={(event) => event.stopPropagation()}>
                        <img src={preview.image} alt={`优秀案例-${preview.id}`} className="max-h-[70vh] w-full object-contain" />
                        <p className="border-t border-border px-3 py-2 text-[13px] text-muted-foreground">
                            {preview.prompt}
                            {preview.styles ? `,${preview.styles}` : ""}
                        </p>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default AiTextStatic;
