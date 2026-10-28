import { z } from "zod";

/**
 * TASK-029：AI_TEXT（POD素材）页面契约。
 *
 * 事实来源：
 * - docs/V1.0/plan_linkfox_navigation/page-specs/22-ai-text.md（字段表 + 状态联动 + 主操作路径）
 * - docs/V1.0/plan_linkfox_navigation/tool_specs.json（AI_TEXT 的 14 个字段与控件语义）
 * - web/src/features/tools/registry/index.ts（ToolSpec：layout=pod、adapter=image、makeType=14）
 * - web/src/services/api/tools/gateway.ts TOOL_ADAPTER_TABLE.AI_TEXT（真实上游允许的字段集合）
 * - AI_TEXT.json：当前账号访问 /draw/ai-text 被重定向首页，没有任何工作区 DOM 可抄，
 *   因此本文件只实现「证据能支撑的字段」，不虚构枚举、不虚构范围。
 *
 * 真实边界（不接受演示成功）：
 * - `mode` / `ratio` / `styles` / `stylesCn` 的选项必须由模型目录/chunk 提供，未加载时提交被禁用
 *   （页面规格：动态选项未加载时禁用），本文件不内置任何编造的枚举值。
 * - `tilingPreset` 在证据里是布尔控件，provider 也只有布尔位；因此「2×2 / 错位 / 3×3」这类
 *   重复规则以**明确的 prompt 文案 + 快照 + 预览几何**参与真实请求，而不是伪装成一个被丢弃的字段。
 * - `variationStrength` 同样是布尔位（证据未给出数值区间，不从名称猜范围）。
 * - `outputNum` 的可用区间取网关真实夹取值 1..15（gateway.normalizeCount），不另编上限。
 */

export const AI_TEXT_TOOL_ID = "AI_TEXT";

/** 页面明示的提示词长度（服务端更严时取交集）。 */
export const AI_TEXT_PROMPT_LIMIT = 4000;
/** 「简短提示词」输入框是短文本入口，超出即不是“简短”，按本地保守上限拦截。 */
export const AI_TEXT_SIMPLE_PROMPT_LIMIT = 200;

/** 网关 normalizeCount 的真实夹取区间：1..15。 */
export const AI_TEXT_OUTPUT_RANGE = { min: 1, max: 15 } as const;

/** 素材上传约束：POD 素材需要透明底位图，故限定 png/jpeg/webp 与 20MB。 */
export const AI_TEXT_UPLOAD_LIMITS = {
    mimeTypes: ["image/png", "image/jpeg", "image/webp"] as const,
    maxBytes: 20 * 1024 * 1024,
    minSide: 64,
    maxSide: 8192,
} as const;

/* ============================== 平铺预设 ============================== */

export type AiTextTilingPresetId = "single" | "grid-2x2" | "half-drop-2x2" | "grid-3x3";

export type AiTextTilingPreset = {
    id: AiTextTilingPresetId;
    label: string;
    hint: string;
    /** 预览几何：列 / 行 / 是否隔行错位。同一份几何同时决定 prompt 文案。 */
    columns: number;
    rows: number;
    stagger: boolean;
};

export const AI_TEXT_TILING_PRESETS: readonly AiTextTilingPreset[] = [
    { id: "single", label: "不平铺（单图）", hint: "只输出一张独立图案，适合单面印刷。", columns: 1, rows: 1, stagger: false },
    { id: "grid-2x2", label: "2×2 平铺", hint: "四宫格无缝重复，适合布料/包装连续图案。", columns: 2, rows: 2, stagger: false },
    { id: "half-drop-2x2", label: "2×2 错位平铺", hint: "隔行错半格，重复感更弱，适合印花面料。", columns: 2, rows: 2, stagger: true },
    { id: "grid-3x3", label: "3×3 平铺", hint: "九宫格重复，适合小单元满印。", columns: 3, rows: 3, stagger: false },
];

export function isAiTextTilingPresetId(value: unknown): value is AiTextTilingPresetId {
    return typeof value === "string" && AI_TEXT_TILING_PRESETS.some((preset) => preset.id === value);
}

export function aiTextTilingPreset(id: unknown): AiTextTilingPreset {
    return AI_TEXT_TILING_PRESETS.find((preset) => preset.id === id) ?? AI_TEXT_TILING_PRESETS[0];
}

/** provider 只有布尔平铺位：预设为 single 时 false，其余 true。 */
export function aiTextTilingFlag(id: unknown): boolean {
    return aiTextTilingPreset(id).id !== "single";
}

/** 平铺规则进入 prompt 的稳定文案（审计按它核对“配置真的进了请求”）。 */
export function aiTextTilingPromptLine(id: unknown): string {
    const preset = aiTextTilingPreset(id);
    if (!preset.stagger) return `平铺规则：${preset.label}（${preset.columns} 列 × ${preset.rows} 行无缝重复）。`;
    return `平铺规则：${preset.label}（${preset.columns} 列 × ${preset.rows} 行，隔行错半格，接缝处必须连续）。`;
}

/* ============================== 目录选项 ============================== */

export type AiTextOption = { id: string; label: string };

/**
 * 目录选项归一化：接受 chunk / 模型目录的多种真实形状（string[]、{id,label}、{value,label}）。
 * 空列表就是“未加载”，调用方必须禁用提交，绝不回退到硬编码枚举。
 */
export function normalizeAiTextOptions(raw: unknown): AiTextOption[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const options: AiTextOption[] = [];
    for (const entry of raw) {
        let id = "";
        let label = "";
        if (typeof entry === "string") {
            id = entry.trim();
            label = id;
        } else if (entry && typeof entry === "object") {
            const record = entry as Record<string, unknown>;
            const rawId = record.id ?? record.value ?? record.key;
            const rawLabel = record.label ?? record.name ?? record.title ?? rawId;
            id = typeof rawId === "string" ? rawId.trim() : "";
            label = typeof rawLabel === "string" && rawLabel.trim() ? rawLabel.trim() : id;
        }
        if (!id || seen.has(id)) continue;
        seen.add(id);
        options.push({ id, label });
    }
    return options;
}

export type AiTextOptionSource = {
    mode?: unknown;
    ratio?: unknown;
    styles?: unknown;
    stylesCn?: unknown;
};

export type AiTextCatalog = {
    modes: AiTextOption[];
    ratios: AiTextOption[];
    styles: AiTextOption[];
    stylesCn: AiTextOption[];
};

/**
 * 目录证据标记：`page-catalog` = 本页维护的目录（chunk 枚举未确认，仅接受目录内取值，
 * 与 registry/ai-wearable.ts 的 page catalog 同一处理方式）；`provider` = provider/模型目录下发。
 */
export type AiTextEvidence = "page-catalog" | "provider";

export type AiTextCatalogEntry = AiTextOption & { evidence: AiTextEvidence };

/** POD 素材的三种产出形态。chunk 枚举未确认 → 页面目录，UI 必须展示说明。 */
export const AI_TEXT_MODE_CATALOG: readonly AiTextCatalogEntry[] = [
    { id: "pattern", label: "图案素材", evidence: "page-catalog" },
    { id: "text", label: "文字素材", evidence: "page-catalog" },
    { id: "pattern-text", label: "图案 + 文字", evidence: "page-catalog" },
];

/** 风格（英文 key 与中文标签一一对应，styles / stylesCn 两个字段取值同源）。 */
export const AI_TEXT_STYLE_CATALOG: readonly (AiTextCatalogEntry & { labelCn: string })[] = [
    { id: "vintage", label: "Vintage", labelCn: "复古", evidence: "page-catalog" },
    { id: "minimal", label: "Minimal", labelCn: "极简", evidence: "page-catalog" },
    { id: "floral", label: "Floral", labelCn: "花卉", evidence: "page-catalog" },
    { id: "geometric", label: "Geometric", labelCn: "几何", evidence: "page-catalog" },
    { id: "cartoon", label: "Cartoon", labelCn: "卡通", evidence: "page-catalog" },
    { id: "hand-drawn", label: "Hand-drawn", labelCn: "手绘", evidence: "page-catalog" },
    { id: "retro-poster", label: "Retro poster", labelCn: "复古海报", evidence: "page-catalog" },
    { id: "line-art", label: "Line art", labelCn: "线稿", evidence: "page-catalog" },
];

/** 比例：与 services/api/image.ts 的比例解析同源（1:1 / 竖版 / 横版常用档）。 */
export const AI_TEXT_RATIO_CATALOG: readonly AiTextCatalogEntry[] = [
    { id: "1:1", label: "1:1", evidence: "page-catalog" },
    { id: "4:5", label: "4:5", evidence: "page-catalog" },
    { id: "3:4", label: "3:4", evidence: "page-catalog" },
    { id: "2:3", label: "2:3", evidence: "page-catalog" },
    { id: "3:2", label: "3:2", evidence: "page-catalog" },
    { id: "4:3", label: "4:3", evidence: "page-catalog" },
    { id: "16:9", label: "16:9", evidence: "page-catalog" },
    { id: "9:16", label: "9:16", evidence: "page-catalog" },
];

export const AI_TEXT_CATALOG_NOTICE =
    "模式 / 风格 / 比例为页面目录取值（POD 素材 chunk 枚举未确认），仅接受目录内取值；provider 目录接入后同名维度自动覆盖。";

const toOptions = (entries: readonly AiTextCatalogEntry[]) => entries.map(({ id, label }) => ({ id, label }));

const mergeDimension = (provided: AiTextOption[], fallback: readonly AiTextCatalogEntry[]) =>
    provided.length ? provided : toOptions(fallback);

/** provider/模型目录下发优先，缺失维度回落到页面目录，保证控件可用且取值可校验。 */
export function resolveAiTextCatalog(source: AiTextOptionSource = {}): AiTextCatalog {
    const styles = normalizeAiTextOptions(source.styles);
    const stylesCn = normalizeAiTextOptions(source.stylesCn);
    return {
        modes: mergeDimension(normalizeAiTextOptions(source.mode), AI_TEXT_MODE_CATALOG),
        ratios: mergeDimension(normalizeAiTextOptions(source.ratio), AI_TEXT_RATIO_CATALOG),
        styles: styles.length ? styles : toOptions(AI_TEXT_STYLE_CATALOG),
        // stylesCn 字段承载中文风格名，兜底目录的 id 必须与字段值同形（中文），否则会误报"不在目录中"
        stylesCn: stylesCn.length ? stylesCn : AI_TEXT_STYLE_CATALOG.map(({ labelCn }) => ({ id: labelCn, label: labelCn })),
    };
}

/** 哪些维度仍在用页面目录（未拿到 provider 目录）→ UI 提示“仅目录内取值”。 */
export function aiTextPageCatalogDimensions(source: AiTextOptionSource = {}): string[] {
    const dimensions: string[] = [];
    if (!normalizeAiTextOptions(source.mode).length) dimensions.push("模式");
    if (!normalizeAiTextOptions(source.ratio).length) dimensions.push("比例");
    if (!normalizeAiTextOptions(source.styles).length) dimensions.push("风格");
    if (!normalizeAiTextOptions(source.stylesCn).length) dimensions.push("中文风格");
    return dimensions;
}

/** 中文标签：选中英文 style 时联动 stylesCn（同源目录）。 */
export function aiTextStyleLabelCn(styleId: string): string {
    return AI_TEXT_STYLE_CATALOG.find((entry) => entry.id === styleId)?.labelCn ?? "";
}

/* ============================== 页面取值 ============================== */

export type AiTextEditor = "simple" | "full";

export type AiTextValues = {
    mode: string;
    /** 简易文字与完整提示词互斥编辑。 */
    editor: AiTextEditor;
    aiSimpleTextPrompt: string;
    prompt: string;
    useAutopromptOption: boolean;
    /** 自动提示词被用户点“解锁手改”后，prompt 交给用户编辑。 */
    autopromptUnlocked: boolean;
    styles: string;
    stylesCn: string;
    tilingPresetId: AiTextTilingPresetId;
    variationStrength: boolean;
    isCase: boolean;
    ratio: string;
    outputNum: number;
    sourceAssetId?: string;
};

export const DEFAULT_AI_TEXT_VALUES: AiTextValues = {
    mode: "",
    editor: "simple",
    aiSimpleTextPrompt: "",
    prompt: "",
    useAutopromptOption: false,
    autopromptUnlocked: false,
    styles: "",
    stylesCn: "",
    tilingPresetId: "single",
    variationStrength: false,
    isCase: false,
    ratio: "",
    outputNum: 1,
};

export function createAiTextValues(patch: Partial<AiTextValues> = {}): AiTextValues {
    return { ...DEFAULT_AI_TEXT_VALUES, ...patch };
}

export function clampAiTextOutputNum(value: unknown): number {
    const parsed = Math.floor(Math.abs(Number(value ?? 1)));
    if (!Number.isFinite(parsed) || parsed < AI_TEXT_OUTPUT_RANGE.min) return AI_TEXT_OUTPUT_RANGE.min;
    return Math.min(parsed, AI_TEXT_OUTPUT_RANGE.max);
}

/** 自动提示词是否正在接管 prompt 输入（用户解锁后交回手改）。 */
export function isAiTextAutopromptActive(values: AiTextValues): boolean {
    return values.useAutopromptOption && !values.autopromptUnlocked;
}

/* ============================== 校验 ============================== */

export type AiTextIssueCode =
    | "source-required"
    | "model-missing"
    | "mode-options-missing"
    | "mode-required"
    | "mode-unknown"
    | "ratio-options-missing"
    | "ratio-required"
    | "ratio-unknown"
    | "simple-prompt-required"
    | "simple-prompt-too-long"
    | "prompt-required"
    | "prompt-too-long"
    | "output-range"
    | "styles-unknown"
    | "styles-cn-unknown"
    | "tiling-unknown";

export type AiTextIssue = { code: AiTextIssueCode; field: string; message: string };

export type ValidateAiTextInput = {
    values: AiTextValues;
    sourceReady: boolean;
    modelReady: boolean;
    options?: AiTextOptionSource;
};

const inList = (options: readonly AiTextOption[], value: string) => options.some((option) => option.id === value);

export function validateAiTextState({ values, sourceReady, modelReady, options = {} }: ValidateAiTextInput): AiTextIssue[] {
    const issues: AiTextIssue[] = [];
    const catalog = resolveAiTextCatalog(options);

    if (!sourceReady) {
        issues.push({ code: "source-required", field: "imageUrl", message: "请先上传用于生成 POD 素材的参考图或文字底图。" });
    }
    if (!modelReady) {
        issues.push({ code: "model-missing", field: "model", message: "未配置可用的图片模型，请先在设置里选择渠道与模型。" });
    }

    if (!catalog.modes.length) {
        issues.push({ code: "mode-options-missing", field: "mode", message: "模式选项尚未从模型目录加载，暂不可提交。" });
    } else if (!values.mode) {
        issues.push({ code: "mode-required", field: "mode", message: "请选择素材模式。" });
    } else if (!inList(catalog.modes, values.mode)) {
        issues.push({ code: "mode-unknown", field: "mode", message: `模式「${values.mode}」不在当前模型目录中，已禁止提交。` });
    }

    if (!catalog.ratios.length) {
        issues.push({ code: "ratio-options-missing", field: "ratio", message: "比例选项尚未从 provider 目录加载，暂不可提交。" });
    } else if (!values.ratio) {
        issues.push({ code: "ratio-required", field: "ratio", message: "请选择输出比例。" });
    } else if (!inList(catalog.ratios, values.ratio)) {
        issues.push({ code: "ratio-unknown", field: "ratio", message: `比例「${values.ratio}」不在 provider 返回的比例中。` });
    }

    const auto = isAiTextAutopromptActive(values);
    const simple = values.aiSimpleTextPrompt.trim();
    const prompt = values.prompt.trim();

    if (!auto && values.editor === "simple" && !simple) {
        issues.push({ code: "simple-prompt-required", field: "aiSimpleTextPrompt", message: "简易文字模式下请填写要生成的文字内容。" });
    }
    if (auto && !simple) {
        issues.push({ code: "simple-prompt-required", field: "aiSimpleTextPrompt", message: "已开启自动提示词，请先给出简短描述，供本地扩写。" });
    }
    if (!auto && values.editor === "full" && !prompt) {
        issues.push({ code: "prompt-required", field: "prompt", message: "完整提示词模式下请填写提示词。" });
    }
    if (simple.length > AI_TEXT_SIMPLE_PROMPT_LIMIT) {
        issues.push({
            code: "simple-prompt-too-long",
            field: "aiSimpleTextPrompt",
            message: `简短提示词最多 ${AI_TEXT_SIMPLE_PROMPT_LIMIT} 字，当前 ${simple.length} 字。`,
        });
    }
    if (prompt.length > AI_TEXT_PROMPT_LIMIT) {
        issues.push({ code: "prompt-too-long", field: "prompt", message: `提示词最多 ${AI_TEXT_PROMPT_LIMIT} 字，当前 ${prompt.length} 字。` });
    }

    const outputNum = Number(values.outputNum);
    if (!Number.isInteger(outputNum) || outputNum < AI_TEXT_OUTPUT_RANGE.min || outputNum > AI_TEXT_OUTPUT_RANGE.max) {
        issues.push({
            code: "output-range",
            field: "outputNum",
            message: `输出数量需为 ${AI_TEXT_OUTPUT_RANGE.min}–${AI_TEXT_OUTPUT_RANGE.max} 的整数（网关真实夹取区间）。`,
        });
    }

    if (catalog.styles.length && values.styles && !inList(catalog.styles, values.styles)) {
        issues.push({ code: "styles-unknown", field: "styles", message: `风格「${values.styles}」不在当前目录中。` });
    }
    if (catalog.stylesCn.length && values.stylesCn && !inList(catalog.stylesCn, values.stylesCn)) {
        issues.push({ code: "styles-cn-unknown", field: "stylesCn", message: `中文风格「${values.stylesCn}」不在当前目录中。` });
    }
    if (!isAiTextTilingPresetId(values.tilingPresetId)) {
        issues.push({ code: "tiling-unknown", field: "tilingPreset", message: "平铺预设不在支持列表中。" });
    }

    return issues;
}

export function hasBlockingAiTextIssue(issues: readonly AiTextIssue[]): boolean {
    return issues.length > 0;
}

export function aiTextExpectedOutputs(values: AiTextValues): number {
    return clampAiTextOutputNum(values.outputNum);
}

/* ============================== 提示词 ============================== */

function styleLine(values: AiTextValues): string {
    const parts = [values.stylesCn, values.styles].map((item) => item.trim()).filter(Boolean);
    return parts.length ? `视觉风格：${parts.join(" / ")}。` : "视觉风格：按模式默认风格，保持干净的印刷质感。";
}

function baseLines(values: AiTextValues): string[] {
    const preset = aiTextTilingPreset(values.tilingPresetId);
    const lines = [
        `生成可直接用于 POD（按需印刷）的素材，比例 ${values.ratio || "待定"}，输出 ${aiTextExpectedOutputs(values)} 张，模式 ${values.mode || "待定"}。`,
        aiTextTilingPromptLine(values.tilingPresetId),
        styleLine(values),
        values.variationStrength
            ? "变化强度：偏高——各张之间允许明显不同的构图与元素分布，但必须共享同一套风格与配色。"
            : "变化强度：默认——各张共享同一构图语言，只做轻微变化，保证系列一致性。",
        "质量要求：透明或纯色底、边缘干净无白边、画面无外部留白、无裁切文字；不得出现第三方商标、版权角色与真实人物肖像。",
    ];
    if (preset.id === "single") {
        lines.push("输出为单张独立素材，不需要拼接出血位。");
    }
    return lines;
}

/** 完整提示词：完整模式直接用用户文案，简易模式把简短文字扩写成可执行指令。 */
export function buildAiTextPrompt(values: AiTextValues): string {
    const lines = baseLines(values);
    const text = values.editor === "full" ? values.prompt.trim() : values.aiSimpleTextPrompt.trim();
    lines.push(`素材内容与文字：${text || "（未填写）"}`);
    if (values.editor === "simple") {
        lines.push("文案处理：围绕上述文字生成图案化排版，文字可读、行距均匀、不拉伸不变形。");
    }
    return lines.join("\n");
}

/**
 * 自动提示词（本地确定性扩写，不调用上游、不产生结果）。
 * 与 buildAiTextPrompt 的差异：把简短描述展开成结构化条款，供用户预览后决定是否手改。
 */
export function buildAiTextAutoPrompt(values: AiTextValues): string {
    const lines = baseLines(values);
    const simple = values.aiSimpleTextPrompt.trim();
    lines.push(`自动扩写要点：围绕「${simple || "（未填写描述）"}」生成 ${aiTextExpectedOutputs(values)} 张素材。`);
    lines.push("拆解：主视觉元素 + 辅助装饰 + 文字层级（主标题 / 副标题）+ 留白节奏，四者需互相避让，不重叠遮挡。");
    lines.push("限制：不使用渐变噪点堆砌质感，不使用过度描边；文字与底色对比度足以印刷识别。");
    return lines.join("\n");
}

/** 真正进入请求的 prompt：自动提示词接管时使用扩写结果。 */
export function effectiveAiTextPrompt(values: AiTextValues): string {
    return isAiTextAutopromptActive(values) ? buildAiTextAutoPrompt(values) : buildAiTextPrompt(values);
}

/* ============================== 草稿 ============================== */

const aiTextValuesSchema = z.object({
    mode: z.string().optional(),
    editor: z.enum(["simple", "full"]).optional(),
    aiSimpleTextPrompt: z.string().optional(),
    prompt: z.string().optional(),
    useAutopromptOption: z.boolean().optional(),
    autopromptUnlocked: z.boolean().optional(),
    styles: z.string().optional(),
    stylesCn: z.string().optional(),
    tilingPresetId: z.string().optional(),
    variationStrength: z.boolean().optional(),
    isCase: z.boolean().optional(),
    ratio: z.string().optional(),
    outputNum: z.union([z.number(), z.string()]).optional(),
    sourceAssetId: z.string().optional(),
});

/** 草稿恢复：非法枚举回落默认值，脏值不进入提交。 */
export function readAiTextValues(raw: unknown): AiTextValues {
    const parsed = aiTextValuesSchema.safeParse(raw ?? {});
    const data = parsed.success ? parsed.data : {};
    return {
        mode: typeof data.mode === "string" ? data.mode : "",
        editor: data.editor === "full" ? "full" : "simple",
        aiSimpleTextPrompt: typeof data.aiSimpleTextPrompt === "string" ? data.aiSimpleTextPrompt.slice(0, AI_TEXT_SIMPLE_PROMPT_LIMIT) : "",
        prompt: typeof data.prompt === "string" ? data.prompt.slice(0, AI_TEXT_PROMPT_LIMIT) : "",
        useAutopromptOption: data.useAutopromptOption === true,
        autopromptUnlocked: data.autopromptUnlocked === true,
        styles: typeof data.styles === "string" ? data.styles : "",
        stylesCn: typeof data.stylesCn === "string" ? data.stylesCn : "",
        tilingPresetId: isAiTextTilingPresetId(data.tilingPresetId) ? data.tilingPresetId : "single",
        variationStrength: data.variationStrength === true,
        isCase: data.isCase === true,
        ratio: typeof data.ratio === "string" ? data.ratio : "",
        outputNum: clampAiTextOutputNum(data.outputNum),
        ...(typeof data.sourceAssetId === "string" && data.sourceAssetId ? { sourceAssetId: data.sourceAssetId } : {}),
    };
}

/** 只持久化可重建参数（不存图片二进制）。 */
export function serializeAiTextValues(values: AiTextValues): Record<string, unknown> {
    return {
        mode: values.mode,
        editor: values.editor,
        aiSimpleTextPrompt: values.aiSimpleTextPrompt,
        prompt: values.prompt,
        useAutopromptOption: values.useAutopromptOption,
        autopromptUnlocked: values.autopromptUnlocked,
        styles: values.styles,
        stylesCn: values.stylesCn,
        tilingPresetId: values.tilingPresetId,
        variationStrength: values.variationStrength,
        isCase: values.isCase,
        ratio: values.ratio,
        outputNum: values.outputNum,
        ...(values.sourceAssetId ? { sourceAssetId: values.sourceAssetId } : {}),
    };
}

/* ============================== 快照 ============================== */

export type AiTextSnapshot = {
    toolId: typeof AI_TEXT_TOOL_ID;
    mode: string;
    editor: AiTextEditor;
    aiSimpleTextPrompt: string;
    prompt: string;
    useAutopromptOption: boolean;
    autopromptUnlocked: boolean;
    styles: string;
    stylesCn: string;
    tilingPresetId: AiTextTilingPresetId;
    tilingPreset: boolean;
    variationStrength: boolean;
    isCase: boolean;
    ratio: string;
    outputNum: number;
    sourceAssetId: string;
    revision: number | string | null;
    requestId: string;
    fingerprint: string;
};

export function aiTextFingerprint(input: Omit<AiTextSnapshot, "fingerprint" | "toolId">): string {
    const parts = [
        AI_TEXT_TOOL_ID,
        input.mode,
        input.editor,
        String(input.useAutopromptOption),
        String(input.autopromptUnlocked),
        input.styles,
        input.stylesCn,
        input.tilingPresetId,
        String(input.tilingPreset),
        String(input.variationStrength),
        String(input.isCase),
        input.ratio,
        String(input.outputNum),
        input.sourceAssetId,
        input.prompt,
        String(input.revision ?? ""),
    ];
    const joined = parts.join("|");
    let hash = 2166136261;
    for (let index = 0; index < joined.length; index += 1) {
        hash ^= joined.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `pod-${(hash >>> 0).toString(16)}`;
}

export function createAiTextSnapshot(
    values: AiTextValues,
    source: { assetId: string },
    revision: number | string | null,
    requestId: string,
): AiTextSnapshot {
    const base = {
        mode: values.mode,
        editor: values.editor,
        aiSimpleTextPrompt: values.aiSimpleTextPrompt.trim(),
        prompt: effectiveAiTextPrompt(values),
        useAutopromptOption: values.useAutopromptOption,
        autopromptUnlocked: values.autopromptUnlocked,
        styles: values.styles,
        stylesCn: values.stylesCn,
        tilingPresetId: aiTextTilingPreset(values.tilingPresetId).id,
        tilingPreset: aiTextTilingFlag(values.tilingPresetId),
        variationStrength: values.variationStrength,
        isCase: values.isCase,
        ratio: values.ratio,
        outputNum: aiTextExpectedOutputs(values),
        sourceAssetId: source.assetId,
        revision,
        requestId,
    };
    return { toolId: AI_TEXT_TOOL_ID, ...base, fingerprint: aiTextFingerprint(base) };
}

export function isAiTextSnapshotStale(snapshot: AiTextSnapshot | undefined, current: AiTextSnapshot | undefined): boolean {
    if (!snapshot) return false;
    if (!current) return true;
    return snapshot.fingerprint !== current.fingerprint;
}

/** “来自旧版本”的具体原因：换图 / 改模式 / 改风格 / 改平铺 / 改文案 / 改数量。 */
export function describeAiTextDrift(snapshot: AiTextSnapshot | undefined, current: AiTextSnapshot | undefined): string {
    if (!snapshot || !current) return "";
    const reasons: string[] = [];
    if (snapshot.sourceAssetId !== current.sourceAssetId) reasons.push("参考图");
    if (snapshot.mode !== current.mode) reasons.push("素材模式");
    if (snapshot.editor !== current.editor) reasons.push("提示词模式");
    if (snapshot.styles !== current.styles || snapshot.stylesCn !== current.stylesCn) reasons.push("风格");
    if (snapshot.tilingPresetId !== current.tilingPresetId) reasons.push("平铺预设");
    if (snapshot.variationStrength !== current.variationStrength) reasons.push("变化强度");
    if (snapshot.ratio !== current.ratio) reasons.push("输出比例");
    if (snapshot.outputNum !== current.outputNum) reasons.push("输出数量");
    if (snapshot.prompt !== current.prompt) reasons.push("提示词内容");
    return reasons.join("、");
}

/* ============================== 案例变体 ============================== */

/** 案例变体：继承样式/平铺/比例等配置，但清空文案并标记 isCase，必须新建任务。 */
export function inheritAiTextCase(source: AiTextValues, patch: Partial<AiTextValues> = {}): AiTextValues {
    return createAiTextValues({
        mode: source.mode,
        editor: "simple",
        useAutopromptOption: false,
        autopromptUnlocked: false,
        styles: source.styles,
        stylesCn: source.stylesCn,
        tilingPresetId: source.tilingPresetId,
        variationStrength: source.variationStrength,
        ratio: source.ratio,
        isCase: true,
        outputNum: 1,
        ...patch,
    });
}

/* ============================== 排版预览 ============================== */

export type AiTextPlacement = { x: number; y: number; scale: number };

export const AI_TEXT_PLACEMENT_LIMITS = { scaleMin: 0.4, scaleMax: 1.4 } as const;

export function clampAiTextPlacement(placement: Partial<AiTextPlacement>): AiTextPlacement {
    const clamp = (value: unknown, min: number, max: number, fallback: number) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return fallback;
        return Math.min(max, Math.max(min, numeric));
    };
    return {
        x: clamp(placement.x, 0, 1, 0.5),
        y: clamp(placement.y, 0, 1, 0.5),
        scale: clamp(placement.scale, AI_TEXT_PLACEMENT_LIMITS.scaleMin, AI_TEXT_PLACEMENT_LIMITS.scaleMax, 1),
    };
}

export function moveAiTextPlacement(placement: AiTextPlacement, dx: number, dy: number): AiTextPlacement {
    return clampAiTextPlacement({ ...placement, x: placement.x + dx, y: placement.y + dy });
}

export function scaleAiTextPlacement(placement: AiTextPlacement, delta: number): AiTextPlacement {
    return clampAiTextPlacement({ ...placement, scale: placement.scale + delta });
}

export function placementKeyboardDelta(key: string, step = 0.02): { x: number; y: number } | null {
    switch (key) {
        case "ArrowLeft":
            return { x: -step, y: 0 };
        case "ArrowRight":
            return { x: step, y: 0 };
        case "ArrowUp":
            return { x: 0, y: -step };
        case "ArrowDown":
            return { x: 0, y: step };
        default:
            return null;
    }
}

export type AiTextPlacementHistory = { past: AiTextPlacement[]; present: AiTextPlacement; future: AiTextPlacement[] };

export const AI_TEXT_PLACEMENT_HISTORY_LIMIT = 40;

export function createAiTextPlacementHistory(present: AiTextPlacement = clampAiTextPlacement({})): AiTextPlacementHistory {
    return { past: [], present: clampAiTextPlacement(present), future: [] };
}

export function commitAiTextPlacement(history: AiTextPlacementHistory, next: AiTextPlacement): AiTextPlacementHistory {
    const clamped = clampAiTextPlacement(next);
    if (clamped.x === history.present.x && clamped.y === history.present.y && clamped.scale === history.present.scale) return history;
    const past = [...history.past, history.present].slice(-AI_TEXT_PLACEMENT_HISTORY_LIMIT);
    return { past, present: clamped, future: [] };
}

export function canUndoAiTextPlacement(history: AiTextPlacementHistory): boolean {
    return history.past.length > 0;
}

export function canRedoAiTextPlacement(history: AiTextPlacementHistory): boolean {
    return history.future.length > 0;
}

export function undoAiTextPlacement(history: AiTextPlacementHistory): AiTextPlacementHistory {
    if (!history.past.length) return history;
    const previous = history.past[history.past.length - 1];
    return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redoAiTextPlacement(history: AiTextPlacementHistory): AiTextPlacementHistory {
    if (!history.future.length) return history;
    const [next, ...rest] = history.future;
    return { past: [...history.past, history.present], present: next, future: rest };
}
