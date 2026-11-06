import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";

import { ToolResult } from "@/components/tools/tool-result";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import { cn, randomId } from "@/lib/utils";
import { planAiPoseGeneratorUnits, runAiPoseGeneratorPlan, type AiPoseGeneratorUnitOutcome } from "@/features/tools/adapters/ai-pose-generator";
import {
    AI_POSE_GENERATOR_PROMPT_MAX,
    AI_POSE_GENERATOR_TOOL_ID,
    createAiPoseGeneratorWorkspace,
    parseAiPoseGeneratorDraftValues,
    serializeAiPoseGeneratorDraftValues,
    setAiPosePrompt,
    type AiPoseGeneratorWorkspace,
} from "@/features/tools/registry/ai-pose-generator";
import { useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";

const toolId = AI_POSE_GENERATOR_TOOL_ID;

/** 原站输入框占位（rea 还原 AIDressingV2-C0X7ggmy.js）。 */
const PROMPT_TEMPLATE = "[模特外貌]，穿着[衣服描述]，戴着[配饰描述]，[环境及其他细节]，[姿势和景别描述]";

/** 原站「模板库」三条官方模板，原文照录。 */
const POSE_TEMPLATES = [
    {
        id: 1,
        title: "海岸序曲",
        prompt: "一位具有北欧气质的欧美模特，浅金色长发，身穿 #白色缎面抹胸简约纱裙#，站在阴天下的冰岛黑沙滩上，背景是深色的玄武岩和翻涌的白色海浪。海风吹动她的长发和裙摆，她表情坚毅而宁静，画面色调冷静高级，充满电影感，哈苏相机拍摄。模特在沙滩上迎着风行走，双手自然摆动，裙摆向后飘逸。",
    },
    {
        id: 2,
        title: "草地野餐",
        prompt: "一位具有邻家气质的欧美年轻女性模特，她有白皙的皮肤，小巧的椭圆形脸，尖下巴，淡褐色的大眼睛，高挺的鼻梁，饱满的嘴唇，留着一头自然的浅棕色长卷发，穿着一件#红白格纹棉质泡泡短裤#，搭配简约的白色吊带背心，在城市公园开阔的草坪上，面前铺着格子野餐垫，上面放着水果和法棍面包，阳光和煦，氛围轻松惬意，模特展现出享受户外的闲适感，电商摄影，生活化构图，佳能EOS R5拍摄，质感清晰。中景，模特坐在野餐垫上，身体微微前倾，伸手去拿面前篮子里的草莓。",
    },
    {
        id: 3,
        title: "午后独白",
        prompt: "全身视角，展示出整个下装。模特双手插在口袋里，沿着落叶小径悠闲地散步，目视前方。一位30岁左右的欧美男性模特，拥有轮廓分明的下颚线和方形脸，深邃的棕色眼睛，鼻梁高挺，留着整洁的深棕色短发，他身穿一件米色针织衫和#深蓝色水洗棉质直筒牛仔裤#。场景在秋日的城市公园，背景是铺满落叶的小径和疏朗的树木。柔和的金色阳光透过树叶缝隙洒下，光线温暖，氛围宁静平和。模特情绪是内省和放松的。电商摄影，生活化构图，索尼A7R IV拍摄，色彩饱满真实。",
    },
] as const;

/** 原站提交前会把仍带 [占位] 的分句剔除，全是占位时提示「请输入描述」。 */
export function stripPosePlaceholders(text: string): string {
    if (!text.includes("[") || !text.includes("]")) return text.trim();
    return text
        .split("，")
        .filter((part) => !(part.includes("[") && part.includes("]")))
        .join("，")
        .trim();
}

/**
 * AI姿势生成（AI_POSE_GENERATOR）。原站没有独立页面，是 AI穿衣「选择模特 → 生成参考图」页签；
 * 结构按 rea 还原的 chunk 复刻：上方结果，下方输入面板（模板库 / 描述 / 推荐套图场景 / 智能扩写 / 立即生成）。
 */
export function AiPoseGeneratorWorkspace({ className }: { className?: string }) {
    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const tasks = useToolTaskStore((state) => state.tasks);
    const config = useConfigStore((state) => state.config);
    const [workspace, setWorkspace] = useState<AiPoseGeneratorWorkspace>(() => createAiPoseGeneratorWorkspace());
    const [ready, setReady] = useState(false);
    const [templatesOpen, setTemplatesOpen] = useState(false);
    const [expanding, setExpanding] = useState(false);
    const [running, setRunning] = useState(false);
    const [errorText, setErrorText] = useState("");
    const [outcomes, setOutcomes] = useState<AiPoseGeneratorUnitOutcome[]>([]);
    const revisionRef = useRef<number | string | null>(null);

    useEffect(() => {
        let alive = true;
        void hydrateDraft(toolId).then((draft) => {
            if (!alive) return;
            revisionRef.current = draft?.revision ?? null;
            const restored = parseAiPoseGeneratorDraftValues(draft?.values ?? {});
            if (restored) setWorkspace(restored);
            setReady(true);
        });
        return () => {
            alive = false;
        };
    }, [hydrateDraft]);

    useEffect(() => {
        if (ready) patchDraft(toolId, { values: serializeAiPoseGeneratorDraftValues(workspace) });
    }, [patchDraft, ready, workspace]);

    const prompt = workspace.posePrompt;
    const setPrompt = (value: string) => setWorkspace((current) => setAiPosePrompt(current, value));
    const latest = useMemo(() => Object.values(tasks).filter((task) => task.toolId === toolId).sort((a, b) => b.createdAt - a.createdAt)[0], [tasks]);
    const activeTask = (outcomes[0]?.task?.id ? tasks[outcomes[0].task.id] : undefined) ?? latest ?? null;

    /** 原站「智能扩写」：用当前文本模型把描述扩写成完整的模特/场景/姿势描述。 */
    const expand = useCallback(async () => {
        const keyword = stripPosePlaceholders(prompt);
        if (!keyword) {
            setErrorText("请输入需要扩写的描述");
            return;
        }
        const textModel = config.textModel?.trim();
        if (!textModel) {
            setErrorText("未配置文本模型，无法智能扩写。");
            return;
        }
        setExpanding(true);
        setErrorText("");
        try {
            const { requestImageQuestion } = await import("@/services/api/image");
            let text = "";
            const answer = await requestImageQuestion(
                { ...config, model: textModel },
                [
                    { role: "system", content: `把用户的描述扩写成一段电商模特图描述，按「${PROMPT_TEMPLATE}」的结构写成一段中文，衣服描述用 # 包裹，只输出这段描述。` },
                    { role: "user", content: keyword },
                ],
                (delta) => {
                    text += delta;
                },
            );
            const content = (typeof answer === "string" ? answer : text).trim();
            if (content) setPrompt(content.slice(0, AI_POSE_GENERATOR_PROMPT_MAX));
        } catch (error) {
            setErrorText(error instanceof Error ? error.message : "智能扩写失败");
        } finally {
            setExpanding(false);
        }
    }, [config, prompt]);

    const submit = useCallback(async () => {
        const text = stripPosePlaceholders(prompt);
        if (!text) {
            setErrorText("请输入描述");
            return;
        }
        setRunning(true);
        setErrorText("");
        try {
            const target = setAiPosePrompt(workspace, text);
            const units = planAiPoseGeneratorUnits({ workspace: target, nextClientOperationId: randomId });
            const result = await runAiPoseGeneratorPlan({ run: (input, options) => useToolTaskStore.getState().runTool(input, options) }, units, { draftRevision: revisionRef.current });
            setOutcomes(result);
            const failed = result.find((item) => item.status !== "succeeded");
            if (failed) setErrorText(failed.error?.message ?? "生成失败");
        } catch (error) {
            setErrorText(error instanceof Error ? error.message : "提交失败");
        } finally {
            setRunning(false);
        }
    }, [prompt, workspace]);

    const noText = !stripPosePlaceholders(prompt);

    return (
        <div data-testid="ai-pose-generator-workspace" className={cn("flex h-full min-h-0 flex-col", className)}>
            <ToolWorkspaceColumns
                className="min-h-0 flex-1"
                configClassName="overflow-hidden rounded-[8px] border border-border bg-background"
                mainClassName="min-h-0 overflow-hidden"
                config={<ToolTaskHistory toolId={toolId} className="m-3 border-0 bg-transparent p-0" emptyHint="还没有生成过参考图" />}
            >
                <div className="flex h-[42px] shrink-0 items-center border-b border-border bg-background px-4">
                    <span className="border-b-2 border-foreground py-[9px] text-[14px] text-foreground">生成参考图</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {activeTask ? (
                        <ToolResult task={activeTask} toolId={toolId} title="生成结果" />
                    ) : (
                        <div data-testid="ai-pose-results-empty" className="flex h-full min-h-[240px] flex-col items-center justify-center text-[14px] text-muted-foreground">
                            <p>💡 告诉我你要的感觉→模特姿势套图秒出</p>
                            <p className="mt-2 text-[12px]">不知道怎么写，试试点击👇</p>
                        </div>
                    )}
                </div>
                <div data-testid="ai-pose-panel" className="relative m-4 mt-0 shrink-0 rounded-[12px] border border-border bg-background p-3">
                    <button type="button" data-testid="ai-pose-template-btn" onClick={() => setTemplatesOpen((open) => !open)} className="mb-2 rounded-[6px] border border-border px-2 py-0.5 text-[12px] text-foreground/70 hover:border-selected hover:text-foreground">
                        模板库
                    </button>
                    {templatesOpen ? (
                        <div data-testid="ai-pose-templates" className="absolute bottom-full left-0 z-20 mb-2 grid w-full grid-cols-3 gap-2 rounded-[12px] bg-background p-3 shadow-[0_6px_16px_rgba(0,0,0,0.12)]">
                            {POSE_TEMPLATES.map((template) => (
                                <button
                                    key={template.id}
                                    type="button"
                                    onClick={() => {
                                        if (stripPosePlaceholders(prompt) && !window.confirm("您已经填写了内容，确定用新的内容替换已填写的内容？")) return;
                                        setPrompt(template.prompt);
                                        setTemplatesOpen(false);
                                    }}
                                    className="rounded-[8px] border border-border p-2 text-left hover:border-selected"
                                >
                                    <p className="text-[13px] font-medium">{template.title}</p>
                                    <p className="mt-1 line-clamp-3 text-[12px] text-muted-foreground">{template.prompt}</p>
                                </button>
                            ))}
                        </div>
                    ) : null}
                    <textarea
                        aria-label="模特与场景描述"
                        data-testid="ai-pose-prompt"
                        rows={4}
                        value={prompt}
                        maxLength={AI_POSE_GENERATOR_PROMPT_MAX}
                        placeholder={PROMPT_TEMPLATE}
                        onChange={(event) => setPrompt(event.target.value)}
                        className="block w-full resize-none bg-transparent text-[14px] leading-[22px] outline-none placeholder:text-muted-foreground/70"
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[12px] text-muted-foreground" title="原站根据已上传服装推荐套图场景；独立页面没有服装图，不推荐">
                            推荐套图场景
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                data-testid="ai-pose-expand"
                                disabled={noText || expanding || running}
                                title={noText ? "请先输入需要扩写的描述" : ""}
                                onClick={() => void expand()}
                                className="inline-flex h-8 items-center gap-1 rounded-[6px] border border-border bg-background px-3 text-[12px] text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {expanding ? <RefreshCw className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                                {expanding ? "智能扩写中..." : "智能扩写"}
                            </button>
                            <button
                                type="button"
                                data-testid="ai-pose-submit"
                                disabled={noText || running}
                                onClick={() => void submit()}
                                className="inline-flex h-8 items-center gap-1 rounded-[6px] bg-primary px-4 text-[12px] text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {running ? <Loader2 className="size-3.5 animate-spin" /> : null}
                                立即生成
                            </button>
                        </div>
                    </div>
                    {errorText ? <p data-testid="ai-pose-error" className="mt-1 text-[12px] text-destructive">{errorText}</p> : null}
                </div>
            </ToolWorkspaceColumns>
        </div>
    );
}

export default AiPoseGeneratorWorkspace;
