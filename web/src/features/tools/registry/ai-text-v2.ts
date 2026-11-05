/**
 * AI_TEXT（POD素材）页面契约，按 rea 静态还原的原站 chunk 复刻：
 * `docs/V1.0/replica/rea-8tools/pretty/AiText-C2P4kAPW.js`（账号侧 /draw/ai-text 重定向首页，只能从 bundle 还原）。
 *
 * - 简易模式：文字内容和创意方向（≤200）+ 提示词优化（自动/开启/关闭）+ 创意风格模板（type=11，单选）+ 图片比例；
 * - 高阶模式：文字内容和创意方向（≤600）+ 提示词优化 + 创意风格（type=12，可多选）+ 图片比例；
 * - 相似裂变：以一张结果/案例图为参考，相似度 0/25/50/75/100 + 文字 + 风格；
 * - 提交体：`{ type: AI_TEXT, prompt, outputNum, imageUrl?, extendFields: { mode, modelId?, modelName?, ratio, styles, stylesCn, useAutopromptOption, variationStrength? } }`，默认 4 张。
 * 模板、风格、案例数据为 2026-11-05 登录态只读抓取（`docs/V1.0/replica/rea-8tools/api/`），图片落盘在 `web/public/__cases/ai-text/`。
 */

export const AI_TEXT_TOOL_ID = "AI_TEXT";

export type AiTextMode = "SIMPLE" | "ADVANCED" | "SIMILAR";
export type AiTextAutoprompt = "AUTO" | "ON" | "OFF";
export type AiTextTemplate = { id: string; style: string; prompt: string; image: string; examples: string[] };
export type AiTextStyle = { style: string; styleEn: string };
export type AiTextCase = { id: string; prompt: string; styles: string; ratio: string; image: string };

export const AI_TEXT_SIMPLE_LIMIT = 200;
export const AI_TEXT_ADVANCED_LIMIT = 600;
export const AI_TEXT_OUTPUT_OPTIONS = [1, 2, 3, 4] as const;

/** 原站图片比例：x:y 与示意框 w×h（px）。 */
export const AI_TEXT_RATIOS = [
    [1, 1, 12, 12],
    [9, 16, 7, 12],
    [16, 9, 12, 7],
    [10, 16, 8, 12],
    [16, 10, 12, 8],
    [2, 3, 11, 12],
    [3, 2, 12, 11],
    [3, 4, 9, 12],
    [4, 3, 12, 9],
].map(([x, y, w, h]) => ({ value: `${x}:${y}`, w, h }));

export const AI_TEXT_AUTOPROMPT_OPTIONS: readonly { value: AiTextAutoprompt; title: string }[] = [
    { value: "AUTO", title: "自动" },
    { value: "ON", title: "开启" },
    { value: "OFF", title: "关闭" },
];

/** 原站相似裂变的相似度刻度。 */
export const AI_TEXT_SIMILARITY_MARKS: Record<number, string> = { 0: "最不相似", 25: "少许相似", 50: "一半相似", 75: "非常相似", 100: "极度相似" };

export type AiTextValues = {
    mode: "SIMPLE" | "ADVANCED";
    simplePrompt: string;
    advancedPrompt: string;
    simpleAutoprompt: AiTextAutoprompt;
    advancedAutoprompt: AiTextAutoprompt;
    templateId: string;
    styles: string[];
    simpleRatio: string;
    advancedRatio: string;
    outputNum: number;
};

/** 相似裂变弹窗的取值。 */
export type AiTextSimilarValues = {
    imageUrl: string;
    prompt: string;
    ratio: string;
    styles: string[];
    variationStrength: number;
    autoprompt: AiTextAutoprompt;
    outputNum: number;
};

/** 原站 AI_TEXT 创意风格模板（style type=11，简易模式），prompt 里的 ##TEXT## 替换为用户文字。 */
export const AI_TEXT_TEMPLATES: readonly AiTextTemplate[] = [
    {"id": "773", "style": "印刷标志", "prompt": "a vector type Text \"##TEXT##\" , typography.", "image": "/__cases/ai-text/templates/773.webp", "examples": ["hello world"]},
    {"id": "764", "style": "花卉插画", "prompt": "Text \"##TEXT##\" with flowers, in colorfull madness, ultra realistic, vibrant, photo, poster, 3d render, typography, cinematic, painting, product, illustration", "image": "/__cases/ai-text/templates/764.webp", "examples": ["DON'T SAY GOOD BYE"]},
    {"id": "765", "style": "极简线条", "prompt": "Ultra minimalist continuous line drawing of words \"##TEXT##\", colorful, typographic TEXT", "image": "/__cases/ai-text/templates/765.webp", "examples": ["good morning"]},
    {"id": "767", "style": "悦动活力", "prompt": "vectorized HD words \"##TEXT##\", handmade lettering, typography,simple", "image": "/__cases/ai-text/templates/767.webp", "examples": ["Best Wishes"]},
    {"id": "770", "style": "金色典雅", "prompt": "gold Word \"##TEXT##\" calligraphy connected, background deep orange. 4k, fashion, cinematic, poster, 3d render", "image": "/__cases/ai-text/templates/770.webp", "examples": ["Best Day"]},
    {"id": "771", "style": "经典复古", "prompt": "t-shirt design , text: \"##TEXT##\" in background, retro design, typography", "image": "/__cases/ai-text/templates/771.webp", "examples": ["TO THE MOON"]},
    {"id": "775", "style": "霓虹灯", "prompt": "a logo called \"##TEXT##\" , cinematic, high detail, 3d render, product, typography, photo, fashion, Neon lights", "image": "/__cases/ai-text/templates/775.webp", "examples": ["Hello world"]},
    {"id": "776", "style": "徽章贴纸", "prompt": "Realistic design badge logo, with the words \"##TEXT##\" in a bold font.", "image": "/__cases/ai-text/templates/776.webp", "examples": ["cui the cat"]},
    {"id": "777", "style": "Q版卡通", "prompt": "a sticker in style of a spray graffity writing saying \"##TEXT##\", colorful, illustration", "image": "/__cases/ai-text/templates/777.webp", "examples": ["hello world"]},
    {"id": "766", "style": "方块像素", "prompt": "Pixel Art design, write with the words \"##TEXT##\"", "image": "/__cases/ai-text/templates/766.webp", "examples": ["beautiful city"]},
    {"id": "768", "style": "纺织艺术", "prompt": "An embroidery of the name \"##TEXT##\"  in metallic thread, accented with beads and sequins, beautiful black decorative textile floral pattern accents, black semi-reflective surface,black background, photo, 3d render, poster.", "image": "/__cases/ai-text/templates/768.webp", "examples": ["have a nice day"]},
    {"id": "769", "style": "LOGO设计", "prompt": "Minimalistic and elegant logo , show a handwritten text  \"##TEXT##\"  at below ,golden ratio, The design follows the golden ratio, 3d, colorful.", "image": "/__cases/ai-text/templates/769.webp", "examples": ["flower"]},
    {"id": "772", "style": "涂鸦插图", "prompt": "t- shirt graphic in black t- shirt graphic in black ink color, vector, Text \"##TEXT##\" , graffitiink color, vector, Text ##TEXT## , graffiti", "image": "/__cases/ai-text/templates/772.webp", "examples": ["nice day"]},
    {"id": "774", "style": "彩色波纹", "prompt": "the words \"##TEXT##\" with a very colorful and abstract background with a very large wave shape , realistic", "image": "/__cases/ai-text/templates/774.webp", "examples": ["hello world"]},
    {"id": "778", "style": "头像设计", "prompt": "\"##TEXT##\" profile picture, vector ghibli design, simple line", "image": "/__cases/ai-text/templates/778.webp", "examples": ["Handsome boy"]},
];

/** 原站 AI_TEXT 创意风格（style type=12，高阶模式可多选）。 */
export const AI_TEXT_STYLES: readonly AiTextStyle[] = [
    {"style": "照片", "styleEn": "photo"},
    {"style": "海报", "styleEn": "poster"},
    {"style": "3D渲染", "styleEn": "3d render"},
    {"style": "印刷", "styleEn": "typography"},
    {"style": "电影", "styleEn": "cinematic"},
    {"style": "绘画", "styleEn": "painting"},
    {"style": "时尚", "styleEn": "fashion"},
    {"style": "商品", "styleEn": "product"},
    {"style": "插画", "styleEn": "illustration"},
    {"style": "日漫", "styleEn": "anime"},
    {"style": "建筑", "styleEn": "architecture"},
    {"style": "黑暗幻想", "styleEn": "dark fantasy"},
    {"style": "充满活力", "styleEn": "vibrant"},
    {"style": "涂鸦", "styleEn": "graffiti"},
    {"style": "人像", "styleEn": "portrait photography"},
    {"style": "野外", "styleEn": "wildlife photography"},
    {"style": "抽象艺术", "styleEn": "conceptual art"},
    {"style": "浮世绘", "styleEn": "ukiyo-e"},
];

/** 原站优秀案例（/image/ideogram/case/list 首页 24 条，2026-11-05 登录态只读抓取）。 */
export const AI_TEXT_CASES: readonly AiTextCase[] = [
    {"id": "3503", "prompt": "Headline blue text Fishing for compliments. A boat at the ocean a angle has cought one of the hearts. Minimalistic watercolor painting on white background.", "styles": "", "ratio": "10:16", "image": "/__cases/ai-text/cases/3503.webp"},
    {"id": "3500", "prompt": "An old yellowed parchment with the saying in 3d: \"FELIZ DIA DE LA AMISTAD\"- realistic cherry blossoms in the background, a delicate multicolor butterfly , 3D, ultra HD, 29K, realistic, Photo 3D rendering, typography", "styles": "poster,conceptual art,dark fantasy,wildlife photography,cinematic,photo,3d render,typography,illustration", "ratio": "10:16", "image": "/__cases/ai-text/cases/3500.webp"},
    {"id": "3497", "prompt": "\"I Take hours on prompts. Please Like! Not just Remix only!\" on catching -eyes paper", "styles": "", "ratio": "10:16", "image": "/__cases/ai-text/cases/3497.webp"},
    {"id": "3489", "prompt": "Simple minimalist abstract image of two hands toasting with wine glasses, the liquid wine inside the glass forms a heart, one of the hands of a girl and the other of a boy. Text: \"love & happiness\". Only using the colors black for the lines and Red for details in watercolor blurred watercolor painting using the technique Single line Sumi-e painting,elegant cursive text", "styles": "illustration,typography,poster,painting,fashion,dark fantasy,ukiyo-e,graffiti,conceptual art", "ratio": "10:16", "image": "/__cases/ai-text/cases/3489.webp"},
    {"id": "3480", "prompt": "I sold the dog on eBay twice.", "styles": "", "ratio": "10:16", "image": "/__cases/ai-text/cases/3480.webp"},
    {"id": "3485", "prompt": "Logo for a band called \"protect your energy\" in a bold, distressed font that reflects the energy and vitality of the band. Red and yellow. The letters have an urban style, with fluid lines and graphic elements that suggest aggression and dynamism. The main color of the logo is an intense red, inspired by the foliage of the jungle, which symbolizes freshness and vitality.", "styles": "", "ratio": "10:16", "image": "/__cases/ai-text/cases/3485.webp"},
    {"id": "3467", "prompt": "Text that says: \" Make It Count \" (Backround: cute graffiti character mural on the side of a building)....|||(AI Concept Art by fate0fall)|||", "styles": "architecture,graffiti", "ratio": "10:16", "image": "/__cases/ai-text/cases/3467.webp"},
    {"id": "3451", "prompt": "\"Thanks everyone\". Popcorn heart. Red and white lines for background.EV2613🍿.UHD, realistic.", "styles": "dark fantasy,conceptual art,vibrant,product", "ratio": "10:16", "image": "/__cases/ai-text/cases/3451.webp"},
    {"id": "3438", "prompt": "The phrase \"I'm from another planet\" in cosmic illustration cartoon typography style, on dark background, crazy ideia by Josias Severo", "styles": "", "ratio": "10:16", "image": "/__cases/ai-text/cases/3438.webp"},
    {"id": "3435", "prompt": "a peach heart with some lilies, delicate and elegant, placed on the side of the heart, as if the heart were floating, with a text in the middle \"ISABELLA\", with a background that combines with the objects, with front perspective, HDMI, 8K", "styles": "conceptual art,portrait photography,typography", "ratio": "1:1", "image": "/__cases/ai-text/cases/3435.webp"},
    {"id": "3379", "prompt": "Tshirt design: Text \"I don't need Google, my wife knows everything\" in a big futura font", "styles": "typography", "ratio": "1:1", "image": "/__cases/ai-text/cases/3379.webp"},
    {"id": "3405", "prompt": "Long shot, detailed digital painting flowers are woven from love\nsharp focus intricate ray tracing iridescent accents neon colours vibrant depth of field lens flare ethereal rim light sub surface scattering global illumination", "styles": "cinematic", "ratio": "10:16", "image": "/__cases/ai-text/cases/3405.webp"},
    {"id": "3341", "prompt": "Pink neon lights, text \"stay positive be happy\"", "styles": "vibrant,3d render,cinematic", "ratio": "10:16", "image": "/__cases/ai-text/cases/3341.webp"},
    {"id": "3344", "prompt": "Beautiful text in black that says: \"Lots of love (&) blessings for you!\" Metallic acrylic painting - rough brush strokes along with a touch of fan brush and pallete knife techniques - a beautiful bird and tiny hearts in colourful tones in the middle of the canvas - against a white background with vibrant botanical/floral patterns", "styles": "typography,dark fantasy,painting,portrait photography", "ratio": "10:16", "image": "/__cases/ai-text/cases/3344.webp"},
    {"id": "3314", "prompt": "text: here comes the sun. yellow letters with yellow sun. minimalistic watercolor on white background", "styles": "vibrant,painting,illustration", "ratio": "10:16", "image": "/__cases/ai-text/cases/3314.webp"},
    {"id": "3300", "prompt": "Love letter background, black paper and in front of it a bouquet of pink roses, a text that says \" love\" in hd, multiple details, photo,16k,fashion, 3d render", "styles": "3d render,photo,dark fantasy", "ratio": "1:1", "image": "/__cases/ai-text/cases/3300.webp"},
    {"id": "3207", "prompt": "The text: “Please LIKE before you REMIX” typography, over an artwork of substance and influence.", "styles": "fashion,conceptual art,portrait photography,painting,typography,cinematic,illustration,3d render,poster,graffiti,dark fantasy", "ratio": "10:16", "image": "/__cases/ai-text/cases/3207.webp"},
    {"id": "3191", "prompt": "Chibi male guy dressed in black and white jacket, jean pants, Nike shoes, short shaved hair, black super small eyes, is sitting on a name \" Djayden ”, text with", "styles": "photo,poster,3d render,typography,fashion,anime,dark fantasy", "ratio": "1:1", "image": "/__cases/ai-text/cases/3191.webp"},
    {"id": "3192", "prompt": "Curvy Chibi latina in black tones whisky black redish wavy long hair, Black eyes, on the name \"Maria\" illustration, realistic. With a Glass of Wine and sitting on a crown with diamonds., photo, 3d render", "styles": "graffiti,vibrant,illustration,typography,3d render,anime,photo,poster,fashion,portrait photography", "ratio": "10:16", "image": "/__cases/ai-text/cases/3192.webp"},
    {"id": "3121", "prompt": "Cute cartoon back style of a couple, wearing a black t shirts , she have long hair with the name \"DINA\" He have staright hair with the name \"RICARDO\"white color,heart snowy atmosphere", "styles": "photo,typography,3d render,portrait photography,fashion", "ratio": "10:16", "image": "/__cases/ai-text/cases/3121.webp"},
    {"id": "3143", "prompt": "sa it's a Bonsu, some lilac orchids and lots of purple blue red lilac gold lights with a bright glitter star, hearts and the 3D Lucy writing \"palle“under the name a lilac cloud", "styles": "typography,3d render", "ratio": "1:1", "image": "/__cases/ai-text/cases/3143.webp"},
    {"id": "3163", "prompt": "Inspired by TAKASHI MURAKAMI create a FLOWER LED SIGN hanging on a brick wall. Underneath the sign is the exact written text \"LORENA\" in led fluorescent lights", "styles": "product,3d render,conceptual art,vibrant,typography", "ratio": "10:16", "image": "/__cases/ai-text/cases/3163.webp"},
    {"id": "3120", "prompt": "Chibi cute little baby girl laying in the bed in gold and rose tones on the name \"Alexa\" with brown eyes, two lines, illustration, 3d render, realistic, photo", "styles": "poster,photo", "ratio": "10:16", "image": "/__cases/ai-text/cases/3120.webp"},
    {"id": "3177", "prompt": "\"Sunshine\", a cute fat duck with sun glasses, very chill", "styles": "poster", "ratio": "10:16", "image": "/__cases/ai-text/cases/3177.webp"},
];

export function createAiTextValues(patch: Partial<AiTextValues> = {}): AiTextValues {
    return {
        mode: "SIMPLE",
        simplePrompt: "",
        advancedPrompt: "",
        simpleAutoprompt: "AUTO",
        advancedAutoprompt: "AUTO",
        templateId: AI_TEXT_TEMPLATES[0].id,
        styles: [],
        simpleRatio: "1:1",
        advancedRatio: "1:1",
        outputNum: 4,
        ...patch,
    };
}

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => (options.includes(value as T) ? (value as T) : fallback);
const ratioValues = AI_TEXT_RATIOS.map((ratio) => ratio.value);
const autopromptValues = AI_TEXT_AUTOPROMPT_OPTIONS.map((option) => option.value);
const styleValues = AI_TEXT_STYLES.map((style) => style.styleEn);

export function readAiTextValues(raw: unknown): AiTextValues {
    const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const base = createAiTextValues();
    return {
        mode: r.mode === "ADVANCED" ? "ADVANCED" : "SIMPLE",
        simplePrompt: typeof r.simplePrompt === "string" ? r.simplePrompt.slice(0, AI_TEXT_SIMPLE_LIMIT) : "",
        advancedPrompt: typeof r.advancedPrompt === "string" ? r.advancedPrompt.slice(0, AI_TEXT_ADVANCED_LIMIT) : "",
        simpleAutoprompt: oneOf(r.simpleAutoprompt, autopromptValues, "AUTO"),
        advancedAutoprompt: oneOf(r.advancedAutoprompt, autopromptValues, "AUTO"),
        templateId: AI_TEXT_TEMPLATES.some((t) => t.id === r.templateId) ? String(r.templateId) : base.templateId,
        styles: Array.isArray(r.styles) ? r.styles.filter((s): s is string => styleValues.includes(s as string)) : [],
        simpleRatio: oneOf(r.simpleRatio, ratioValues, "1:1"),
        advancedRatio: oneOf(r.advancedRatio, ratioValues, "1:1"),
        outputNum: AI_TEXT_OUTPUT_OPTIONS.includes(Number(r.outputNum) as 1) ? Number(r.outputNum) : 4,
    };
}

export function aiTextTemplate(id: string): AiTextTemplate {
    return AI_TEXT_TEMPLATES.find((template) => template.id === id) ?? AI_TEXT_TEMPLATES[0];
}

export function aiTextStylesCn(styles: readonly string[]): string[] {
    return styles.map((en) => AI_TEXT_STYLES.find((style) => style.styleEn === en)?.style).filter((cn): cn is string => Boolean(cn));
}

/** 原站高阶模式「尝试示例」：从优秀案例里取一条带风格的。 */
export function aiTextExample(seed: number): AiTextCase {
    return AI_TEXT_CASES[Math.abs(seed) % AI_TEXT_CASES.length];
}

export function activeAiTextPrompt(values: AiTextValues): string {
    return (values.mode === "SIMPLE" ? values.simplePrompt : values.advancedPrompt).trim();
}

/** 原站页面校验：当前模式文字为空时禁用并提示。 */
export function validateAiTextValues(values: AiTextValues): string | null {
    return activeAiTextPrompt(values) ? null : "请输入文字内容和创意方向";
}

const AUTOPROMPT_LINE: Record<AiTextAutoprompt, string> = {
    AUTO: "Expand the description with tasteful creative details where it helps.",
    ON: "Enrich the description with vivid, varied creative details to increase diversity.",
    OFF: "Follow the description literally; do not add creative elements beyond it.",
};

/** 网关只把 prompt 送给 provider：模板/风格/提示词优化都要落进最终 prompt。 */
export function buildAiTextProviderPrompt(input: { mode: AiTextMode; prompt: string; templatePrompt?: string; styles?: readonly string[]; autoprompt: AiTextAutoprompt; variationStrength?: number }): string {
    const text = input.prompt.trim();
    const body = input.mode === "SIMPLE" && input.templatePrompt ? input.templatePrompt.replaceAll("##TEXT##", text) : text;
    const lines = [body];
    if (input.styles?.length) lines.push(`Style: ${input.styles.join(", ")}.`);
    if (input.mode === "SIMILAR") lines.push(`Create a variation of the reference image with similarity ${input.variationStrength ?? 50}/100 (${AI_TEXT_SIMILARITY_MARKS[input.variationStrength ?? 50] ?? ""}); keep the typography legible.`);
    lines.push(AUTOPROMPT_LINE[input.autoprompt], "Render all quoted text exactly, correctly spelled, as the visual focus of a print-on-demand design.");
    return lines.join("\n");
}

/** 原站 extendFields（按模式）。 */
export function buildAiTextExtendFields(values: AiTextValues): Record<string, unknown> {
    if (values.mode === "SIMPLE") {
        const template = aiTextTemplate(values.templateId);
        return { mode: "SIMPLE", modelId: template.id, modelName: template.style, ratio: values.simpleRatio, useAutopromptOption: values.simpleAutoprompt, prompt: values.simplePrompt.trim() };
    }
    return { mode: "ADVANCED", ratio: values.advancedRatio, styles: [...values.styles], stylesCn: aiTextStylesCn(values.styles), useAutopromptOption: values.advancedAutoprompt, prompt: values.advancedPrompt.trim() };
}
