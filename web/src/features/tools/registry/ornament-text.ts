/**
 * ORNAMENT_TEXT（饰品文字）页面契约。
 *
 * 事实来源：rea 静态还原的原站 chunk `docs/V1.0/replica/rea-8tools/pretty/OrnamentText-ButUu2_m.js`
 * （账号侧 /draw/ornament-text 重定向首页，页面只能从 bundle 还原）：
 * - 文字内容：TextArea，`replace(/[^a-zA-Z]/g, "")` 只保留英文字母，maxLength 50，必填；
 * - 字体：`GET /image/make/style?type=15` 的 30 款字体（style 名 + SVG 预览），默认取第一款；
 * - 挂环位置：两边加环 / 左边加环 / 右边加环 / 不加环，默认两边；提交为 `left`/`right` 两个布尔；
 * - 字体大小：InputNumber 1–200，默认 10，单位 pt；
 * - 提交体：`{ type: ORNAMENT_TEXT, prompt, extendFields: { fontname, fontSize, left, right } }`。
 * 字体列表与预览图取自原站接口（2026-11-05 登录态只读），落盘在 `web/public/__cases/ornament-text/`。
 */

export const ORNAMENT_TEXT_TOOL_ID = "ORNAMENT_TEXT";
export const ORNAMENT_TEXT_TEXT_LIMIT = 50;
export const ORNAMENT_TEXT_FONT_SIZE = { min: 1, max: 200, default: 10 } as const;

export type OrnamentTextFont = { style: string; image: string };

/** 原站字体库（type=15），顺序与原站 sort 一致。 */
export const ORNAMENT_TEXT_FONTS: readonly OrnamentTextFont[] = [
    ["Shelby", "54353409b5254da5ae4a9c8d7444b6ca"],
    ["Aurum", "ec8c0ed3469540deaf557923acff7ce5"],
    ["High Spirited", "ccab5ad95d844f358c08628491cbf7d1"],
    ["VfFree", "63a5dc714e5c4449b841bf94589cdf3a"],
    ["English111 Presto BT", "b0471b0326fa46a28cb4d4aa16d30d9d"],
    ["Follow You Into the World", "4c1a471228d84d9b8e64675e6ead0f14"],
    ["OPTIDiannaScript", "7f8c04dff4644080af6205db3b6a8f0c"],
    ["HW Freehand 575 BT", "280897636d944b51aa716a3041c533d9"],
    ["Fiolex Girls", "7a14338298aa4c6fab57017b7334db88"],
    ["QH", "4627b6a4b88f4bea8085def5639fc5bd"],
    ["Caitlyn", "527c5175f2a044428942251f9289da89"],
    ["ItaliannoRob", "0784dfab158c422f86efa54bebd9df4d"],
    ["Alison", "6c92aa7672394c40a9a3af5e934c5d37"],
    ["ALSScript", "80c39c120e864bd2a49246c686e95a53"],
    ["WhiteAngelica", "a88b4922e15447249f7282ba21906c6d"],
    ["Milkshake", "4fb076b01f774ea6bf6976debd0602af"],
    ["ScriptMTBold", "9ada782509704616b36323b7a28591a6"],
    ["PassionsConflictROB", "a26e35c450094c8c9b795a19eaf78d9d"],
    ["Sacramento", "8da36687638e42a7aeb90c06d58324b3"],
    ["Cervanttis", "f172bd5a71ff47968bc1d802510642f2"],
    ["Notera 2 PERSONAL USE ONLY", "d33166e199bc4d288868f57998ed9c3a"],
    ["UyghurMerdane", "37234640be8a4a1cbfdee3e9becbe4e8"],
    ["OldEnglishText", "55b696159f8a46cbbd8478be80243c4f"],
    ["Halimun", "d6fe32b16b514f7680648a63f9d829c5"],
    ["AlexBrush", "d996fa698292427084b03e38dc2c2a5d"],
    ["Scriptina", "9ee366913fc4479f81dd42ea4d8ae653"],
    ["CounselorScript", "84579961d88244749fc99f6fdee385ed"],
    ["EliannaBoldItalic", "4e4df9db31f7427b8c9aeff22efa63c8"],
    ["AutumnChant", "19796069e9654431957e4fe397776bee"],
    ["MagnoliaScript", "be40f35aa4b04f26b72880f65e912ab3"],
].map(([style, hash]) => ({ style, image: `/__cases/ornament-text/fonts/${hash}.svg` }));

export type OrnamentTextRing = "both" | "left" | "right" | "none";

export const ORNAMENT_TEXT_RINGS: readonly { value: OrnamentTextRing; title: string; image: string }[] = [
    { value: "both", title: "两边加环", image: "/__cases/ornament-text/both-D7g1Qwje.png" },
    { value: "left", title: "左边加环", image: "/__cases/ornament-text/left-C3QCZnrM.png" },
    { value: "right", title: "右边加环", image: "/__cases/ornament-text/right-pZ0s7x9c.png" },
    { value: "none", title: "不加环", image: "/__cases/ornament-text/none-DTx5xFOU.png" },
];

export type OrnamentTextValues = { text: string; fontname: string; fontSize: number; ring: OrnamentTextRing };

export function ornamentTextFont(style: string): OrnamentTextFont | undefined {
    return ORNAMENT_TEXT_FONTS.find((font) => font.style === style);
}

export function ornamentTextRing(value: OrnamentTextRing) {
    return ORNAMENT_TEXT_RINGS.find((ring) => ring.value === value) ?? ORNAMENT_TEXT_RINGS[0];
}

/** 原站输入过滤：只保留英文字母并截到 50。 */
export function sanitizeOrnamentText(raw: string): string {
    return raw.replace(/[^a-zA-Z]/g, "").slice(0, ORNAMENT_TEXT_TEXT_LIMIT);
}

export function clampOrnamentTextFontSize(value: number): number {
    const { min, max, default: fallback } = ORNAMENT_TEXT_FONT_SIZE;
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(value)));
}

export function createOrnamentTextValues(patch: Partial<OrnamentTextValues> = {}): OrnamentTextValues {
    return { text: "", fontname: ORNAMENT_TEXT_FONTS[0].style, fontSize: ORNAMENT_TEXT_FONT_SIZE.default, ring: "both", ...patch };
}

export function readOrnamentTextValues(raw: unknown): OrnamentTextValues {
    const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const ring = ORNAMENT_TEXT_RINGS.some((item) => item.value === record.ring) ? (record.ring as OrnamentTextRing) : "both";
    const fontname = typeof record.fontname === "string" && ornamentTextFont(record.fontname) ? record.fontname : ORNAMENT_TEXT_FONTS[0].style;
    return {
        text: typeof record.text === "string" ? sanitizeOrnamentText(record.text) : "",
        fontname,
        fontSize: record.fontSize === undefined ? ORNAMENT_TEXT_FONT_SIZE.default : clampOrnamentTextFontSize(Number(record.fontSize)),
        ring,
    };
}

/** 挂环位置 → 原站 extendFields 的 left/right 布尔。 */
export function ornamentTextRingFlags(ring: OrnamentTextRing): { left: boolean; right: boolean } {
    return { left: ring === "both" || ring === "left", right: ring === "both" || ring === "right" };
}

export type OrnamentTextIssue = { code: "text-required" | "model-missing"; message: string };

export function validateOrnamentTextState(input: { values: OrnamentTextValues; modelReady?: boolean }): OrnamentTextIssue[] {
    const issues: OrnamentTextIssue[] = [];
    if (!input.values.text) issues.push({ code: "text-required", message: "请输入想要生成的文字内容" });
    if (input.modelReady === false) issues.push({ code: "model-missing", message: "未配置可用的图片模型，提交已禁用。" });
    return issues;
}

/**
 * 网关只把 prompt（+ 参考图）送给 provider：字体以参考图（字体预览）+ 名称描述，挂环与字号写进 prompt。
 * 用英文写，图像模型对英文排版指令更稳定。
 */
export function buildOrnamentTextPrompt(values: OrnamentTextValues): string {
    const { left, right } = ornamentTextRingFlags(values.ring);
    const rings = left && right ? "a small jump ring on both the left and right ends" : left ? "a small jump ring on the left end only" : right ? "a small jump ring on the right end only" : "no jump rings";
    return [
        `Product photo of a personalized name necklace pendant: the word "${values.text}" cut as one continuous piece of polished gold metal.`,
        `Lettering style: the "${values.fontname}" typeface shown in the reference image (match its letter shapes and connections; do not copy the reference word).`,
        `Pendant has ${rings} for the chain. Lettering size ${clampOrnamentTextFontSize(values.fontSize)}pt relative scale.`,
        `Spell exactly "${values.text}", no extra or missing letters. Clean white background, soft studio light, single centered pendant, no other text.`,
    ].join("\n");
}

export type OrnamentTextSnapshot = OrnamentTextValues & { toolId: typeof ORNAMENT_TEXT_TOOL_ID; revision: number | string | null; requestId: string; fingerprint: string };

export function ornamentTextFingerprint(values: OrnamentTextValues): string {
    return [ORNAMENT_TEXT_TOOL_ID, values.text, values.fontname, clampOrnamentTextFontSize(values.fontSize), values.ring].join("|");
}

export function createOrnamentTextSnapshot(values: OrnamentTextValues, revision: number | string | null, requestId: string): OrnamentTextSnapshot {
    return { toolId: ORNAMENT_TEXT_TOOL_ID, ...values, fontSize: clampOrnamentTextFontSize(values.fontSize), revision, requestId, fingerprint: ornamentTextFingerprint(values) };
}

export function describeOrnamentTextDrift(snapshot: OrnamentTextValues, current: OrnamentTextValues): string {
    const drift: string[] = [];
    if (snapshot.text !== current.text) drift.push("文字内容");
    if (snapshot.fontname !== current.fontname) drift.push("字体");
    if (clampOrnamentTextFontSize(snapshot.fontSize) !== clampOrnamentTextFontSize(current.fontSize)) drift.push("字体大小");
    if (snapshot.ring !== current.ring) drift.push("挂环位置");
    return drift.join("、");
}

/** 「再次编辑」：从历史任务的 prompt 反解参数（prompt 由 buildOrnamentTextPrompt 生成，二者互为逆）。 */
export function parseOrnamentTextPrompt(prompt: string): OrnamentTextValues | null {
    const text = /the word "([A-Za-z]+)"/.exec(prompt)?.[1];
    if (!text) return null;
    const fontname = /the "([^"]+)" typeface/.exec(prompt)?.[1] ?? "";
    const fontSize = Number(/Lettering size (\d+)pt/.exec(prompt)?.[1]);
    const ring: OrnamentTextRing = prompt.includes("on both the left and right ends") ? "both" : prompt.includes("on the left end only") ? "left" : prompt.includes("on the right end only") ? "right" : "none";
    return readOrnamentTextValues({ text, fontname, fontSize, ring });
}
