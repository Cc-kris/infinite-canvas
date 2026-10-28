/**
 * TASK-030：ORNAMENT_TEXT（饰品文字）页面契约。
 *
 * 事实来源：
 * - docs/V1.0/plan_linkfox_navigation/page-specs/23-ornament-text.md（区域、字段表、联动、主流程、恢复）
 * - docs/V1.0/plan_linkfox_navigation/tool_specs.json（ORNAMENT_TEXT：makeType 17 / layout=text / adapter=image）
 * - web/src/features/tools/registry/index.ts（page catalog：fontSize、fontname、left、prompt、right）
 * - web/src/services/api/tools/gateway.ts（ORNAMENT_TEXT 仅这 5 个字段进指纹；prompt 必填；不要求参考图）
 *
 * 证据边界（不虚构）：
 * - 原站该页为 permission_redirect_home，没有工作区文案可抓；本文件中的字体列表是**本地预览**可渲染的
 *   字族（CSS 字体栈），不是 LinkFox 字体库清单；fontname 原样透传给 provider，不做字体库承诺。
 * - 上游 fontname 的取值类型未取得证据（`string/unknown`）。因此在 adapter 里显式校验（非空、长度、无控制字符），
 *   校验不通过就不提交，绝不“乐观提交”。
 */

export const ORNAMENT_TEXT_TOOL_ID = "ORNAMENT_TEXT";

/** 饰品文字内容长度上限（页面 prompt 1–4000，trim 后非空，长度取 chunk）。 */
export const ORNAMENT_TEXT_TEXT_LIMIT = 4000;
/** 效果描述是同一 prompt 字段内的补充段，单独限长，避免挤占文字内容额度。 */
export const ORNAMENT_TEXT_EFFECT_LIMIT = 600;
export const ORNAMENT_TEXT_FONT_NAME_LIMIT = 64;

export const ORNAMENT_TEXT_FONT_SIZE = { min: 8, max: 400, step: 1 } as const;
export const ORNAMENT_TEXT_POSITION = { min: 0, max: 100 } as const;
/** 文字框最小宽度（百分比），防止 left/right 贴合成一条线。 */
export const ORNAMENT_TEXT_MIN_WIDTH = 3;

/* ------------------------------ 字体 ------------------------------ */

export type OrnamentTextFont = {
    /** 透传给上游的 fontname 值。 */
    id: string;
    label: string;
    /** 本地预览用的 CSS 字体栈（可能与上游实际字族不同，属已知差异）。 */
    cssStack: string;
};

/**
 * 本地预览字族：每一项都能在当前浏览器真实渲染，因此预览不是占位图。
 * 上游字体库未取证，界面文案已标注“预览字体”。
 */
export const ORNAMENT_TEXT_FONTS: readonly OrnamentTextFont[] = [
    { id: "serif", label: "衬线 Serif", cssStack: 'Georgia, "Times New Roman", "Songti SC", serif' },
    { id: "sans-serif", label: "无衬线 Sans", cssStack: '"Helvetica Neue", Arial, "PingFang SC", sans-serif' },
    { id: "script", label: "手写 Script", cssStack: '"Snell Roundhand", "Zapfino", "Baoli SC", cursive' },
    { id: "display", label: "展示 Display", cssStack: 'Impact, "Haettenschweiler", "Heiti SC", sans-serif' },
    { id: "rounded", label: "圆体 Rounded", cssStack: '"Arial Rounded MT Bold", "Yuanti SC", sans-serif' },
    { id: "mono", label: "等宽 Mono", cssStack: '"SFMono-Regular", Menlo, "Courier New", monospace' },
] as const;

export const ORNAMENT_TEXT_DEFAULT_FONT = "serif";

export function ornamentTextFont(id: string): OrnamentTextFont | undefined {
    const key = id.trim().toLowerCase();
    return ORNAMENT_TEXT_FONTS.find((font) => font.id === key);
}

/** 预览字体栈：未知字体名回落到 serif，但透传时仍用原值。 */
export function ornamentTextFontStack(id: string): string {
    return ornamentTextFont(id)?.cssStack ?? ORNAMENT_TEXT_FONTS[0].cssStack;
}

export function ornamentTextFontLabel(id: string): string {
    return ornamentTextFont(id)?.label ?? `${id || "未命名字体"}（自定义）`;
}

/* ------------------------------ 取值 ------------------------------ */

export type OrnamentTextValues = {
    /** 饰品文字内容（必填，进 prompt）。 */
    text: string;
    /** 效果描述（可选，进 prompt，作为同一字段的补充段）。 */
    effect: string;
    fontname: string;
    fontSize: number;
    /** 文字框在饰品正面的水平起止（百分比，left < right）。 */
    left: number;
    right: number;
};

export function createOrnamentTextValues(patch: Partial<OrnamentTextValues> = {}): OrnamentTextValues {
    return {
        text: "",
        effect: "",
        fontname: ORNAMENT_TEXT_DEFAULT_FONT,
        fontSize: 96,
        left: 18,
        right: 82,
        ...patch,
    };
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** 数字统一到 1 位小数，避免 18.000000000000004 之类的指纹抖动。 */
export const ornamentTextNumber = (value: number): number => (Number.isFinite(value) ? round1(value) : 0);

export function clampOrnamentTextFontSize(value: number): number {
    const { min, max } = ORNAMENT_TEXT_FONT_SIZE;
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, ornamentTextNumber(value)));
}

export function clampOrnamentTextPosition(value: number): number {
    const { min, max } = ORNAMENT_TEXT_POSITION;
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, ornamentTextNumber(value)));
}

/** 归一化左右定位：保证 0 ≤ left < right ≤ 100 且宽度不小于最小值。 */
export function normalizeOrnamentTextPosition(left: number, right: number): { left: number; right: number } {
    let nextLeft = clampOrnamentTextPosition(left);
    let nextRight = clampOrnamentTextPosition(right);
    if (nextRight - nextLeft < ORNAMENT_TEXT_MIN_WIDTH) {
        nextRight = clampOrnamentTextPosition(nextLeft + ORNAMENT_TEXT_MIN_WIDTH);
        if (nextRight - nextLeft < ORNAMENT_TEXT_MIN_WIDTH) nextLeft = clampOrnamentTextPosition(nextRight - ORNAMENT_TEXT_MIN_WIDTH);
    }
    return { left: nextLeft, right: nextRight };
}

export function ornamentTextPositionLabel(values: Pick<OrnamentTextValues, "left" | "right">): string {
    const center = (values.left + values.right) / 2;
    if (center < 40) return "偏左";
    if (center > 60) return "偏右";
    return "居中";
}

/** 草稿恢复：任何脏值都收敛到契约内，绝不把非法数字带进提交路径。 */
export function readOrnamentTextValues(raw: unknown): OrnamentTextValues {
    const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const text = typeof record.text === "string" ? record.text.slice(0, ORNAMENT_TEXT_TEXT_LIMIT) : "";
    const effect = typeof record.effect === "string" ? record.effect.slice(0, ORNAMENT_TEXT_EFFECT_LIMIT) : "";
    const fontname = typeof record.fontname === "string" && record.fontname.trim() ? record.fontname.trim().slice(0, ORNAMENT_TEXT_FONT_NAME_LIMIT) : ORNAMENT_TEXT_DEFAULT_FONT;
    const fontSize = clampOrnamentTextFontSize(Number(record.fontSize));
    const position = normalizeOrnamentTextPosition(Number(record.left), Number(record.right));
    return { text, effect, fontname, fontSize, ...position };
}

export function serializeOrnamentTextValues(values: OrnamentTextValues): Record<string, unknown> {
    return { ...values };
}

/* ------------------------------ 校验 ------------------------------ */

export type OrnamentTextIssueCode =
    | "text-required"
    | "text-too-long"
    | "effect-too-long"
    | "font-required"
    | "font-too-long"
    | "font-size-range"
    | "position-range"
    | "model-missing";

export type OrnamentTextIssue = { code: OrnamentTextIssueCode; field: keyof OrnamentTextValues | "model"; message: string };

export function validateOrnamentTextState(input: { values: OrnamentTextValues; modelReady?: boolean }): OrnamentTextIssue[] {
    const { values, modelReady = true } = input;
    const issues: OrnamentTextIssue[] = [];
    const text = values.text.trim();
    if (!text) issues.push({ code: "text-required", field: "text", message: "请先填写饰品文字内容。" });
    if (text.length > ORNAMENT_TEXT_TEXT_LIMIT) issues.push({ code: "text-too-long", field: "text", message: `文字内容最多 ${ORNAMENT_TEXT_TEXT_LIMIT} 字，当前 ${text.length} 字。` });
    if (values.effect.trim().length > ORNAMENT_TEXT_EFFECT_LIMIT) issues.push({ code: "effect-too-long", field: "effect", message: `效果描述最多 ${ORNAMENT_TEXT_EFFECT_LIMIT} 字。` });

    const fontname = values.fontname.trim();
    if (!fontname) issues.push({ code: "font-required", field: "fontname", message: "请选择或填写字体名。" });
    if (fontname.length > ORNAMENT_TEXT_FONT_NAME_LIMIT) issues.push({ code: "font-too-long", field: "fontname", message: `字体名最多 ${ORNAMENT_TEXT_FONT_NAME_LIMIT} 个字符。` });

    const { min, max } = ORNAMENT_TEXT_FONT_SIZE;
    if (!Number.isFinite(values.fontSize) || values.fontSize < min || values.fontSize > max) {
        issues.push({ code: "font-size-range", field: "fontSize", message: `字号需在 ${min}–${max} 之间。` });
    }

    const box = ORNAMENT_TEXT_POSITION;
    const positionOk =
        Number.isFinite(values.left) &&
        Number.isFinite(values.right) &&
        values.left >= box.min &&
        values.right <= box.max &&
        values.right - values.left >= ORNAMENT_TEXT_MIN_WIDTH;
    if (!positionOk) issues.push({ code: "position-range", field: "left", message: `左右定位需满足 ${box.min} ≤ 左 < 右 ≤ ${box.max}，且宽度不小于 ${ORNAMENT_TEXT_MIN_WIDTH}%。` });

    if (!modelReady) issues.push({ code: "model-missing", field: "model", message: "未配置可用的图片模型，提交已禁用。" });
    return issues;
}

export function hasBlockingOrnamentTextIssue(issues: readonly OrnamentTextIssue[]): boolean {
    return issues.length > 0;
}

/* ------------------------------ 提示词 ------------------------------ */

/** 单一 prompt 承载全部参数：网关只把 prompt（+ 参考图）送给 provider，字段本身不发给上游。 */
export function buildOrnamentTextPrompt(values: OrnamentTextValues): string {
    const text = values.text.trim();
    const effect = values.effect.trim();
    const fontname = values.fontname.trim();
    const { left, right } = normalizeOrnamentTextPosition(values.left, values.right);
    const fontSize = clampOrnamentTextFontSize(values.fontSize);
    const position = ornamentTextPositionLabel({ left, right });

    return [
        "饰品文字效果图：在珠宝饰品表面生成清晰、贴合材质的文字。",
        `文字内容：「${text}」（逐字照排，不得增字、漏字、改字）。`,
        `字体：${fontname}（${ornamentTextFontLabel(fontname)}）；字号：${fontSize}。`,
        `位置：文字水平范围 ${left}%–${right}%（画面${position}），沿饰品正面曲率排布，不压住宝石主刻面。`,
        effect
            ? `效果：${effect}`
            : "效果：无额外效果描述，保持金属/宝石原材质与真实光影，文字为雕刻质感。",
        "输出：单张成品图，1920 长边以内；文字完整、无裁切、无重影、无错字。",
    ].join("\n");
}

export function buildOrnamentTextEffectLine(values: OrnamentTextValues): string {
    const effect = values.effect.trim();
    return effect ? `效果：${effect}` : "无额外效果描述（保持原材质与真实光影）";
}

/* ------------------------------ 提交快照 ------------------------------ */

export type OrnamentTextSnapshot = {
    toolId: typeof ORNAMENT_TEXT_TOOL_ID;
    text: string;
    effect: string;
    fontname: string;
    fontSize: number;
    left: number;
    right: number;
    revision: number | string | null;
    requestId: string;
    fingerprint: string;
};

export function createOrnamentTextSnapshot(values: OrnamentTextValues, revision: number | string | null, requestId: string): OrnamentTextSnapshot {
    const { left, right } = normalizeOrnamentTextPosition(values.left, values.right);
    const fontSize = clampOrnamentTextFontSize(values.fontSize);
    const snapshot = {
        toolId: ORNAMENT_TEXT_TOOL_ID,
        text: values.text.trim(),
        effect: values.effect.trim(),
        fontname: values.fontname.trim(),
        fontSize,
        left,
        right,
        revision,
        requestId,
        fingerprint: "",
    } satisfies OrnamentTextSnapshot;
    return { ...snapshot, fingerprint: ornamentTextFingerprint(snapshot) };
}

export function ornamentTextFingerprint(snapshot: Omit<OrnamentTextSnapshot, "fingerprint"> | OrnamentTextSnapshot): string {
    return [ORNAMENT_TEXT_TOOL_ID, snapshot.text, snapshot.effect, snapshot.fontname, snapshot.fontSize, snapshot.left, snapshot.right].join("|");
}

/** 结果是否对应当前配置；不一致时点名漂移维度（不静默把旧结果当新结果）。 */
export function describeOrnamentTextDrift(snapshot: OrnamentTextSnapshot, current: OrnamentTextSnapshot): string {
    const drift: string[] = [];
    if (snapshot.text !== current.text) drift.push("文字内容");
    if (snapshot.effect !== current.effect) drift.push("效果描述");
    if (snapshot.fontname !== current.fontname) drift.push("字体");
    if (snapshot.fontSize !== current.fontSize) drift.push("字号");
    if (snapshot.left !== current.left || snapshot.right !== current.right) drift.push("左右定位");
    return drift.join("、");
}

/* ------------------------------ 布局历史 ------------------------------ */

export type OrnamentTextLayout = { left: number; right: number; fontSize: number };
export type OrnamentTextHistory = { past: OrnamentTextLayout[]; present: OrnamentTextLayout; future: OrnamentTextLayout[] };

export function ornamentTextLayout(values: OrnamentTextValues): OrnamentTextLayout {
    const { left, right } = normalizeOrnamentTextPosition(values.left, values.right);
    return { left, right, fontSize: clampOrnamentTextFontSize(values.fontSize) };
}

const HISTORY_LIMIT = 50;

export function createOrnamentTextHistory(values: OrnamentTextValues): OrnamentTextHistory {
    return { past: [], present: ornamentTextLayout(values), future: [] };
}

/** 同值提交不产生历史噪声（键盘长按也不刷爆栈）。 */
export function commitOrnamentTextLayout(history: OrnamentTextHistory, next: OrnamentTextLayout): OrnamentTextHistory {
    const normalized: OrnamentTextLayout = {
        ...normalizeOrnamentTextPosition(next.left, next.right),
        fontSize: clampOrnamentTextFontSize(next.fontSize),
    };
    const same = normalized.left === history.present.left && normalized.right === history.present.right && normalized.fontSize === history.present.fontSize;
    if (same) return history;
    return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: normalized, future: [] };
}

export const canUndoOrnamentTextLayout = (history: OrnamentTextHistory): boolean => history.past.length > 0;
export const canRedoOrnamentTextLayout = (history: OrnamentTextHistory): boolean => history.future.length > 0;

export function undoOrnamentTextLayout(history: OrnamentTextHistory): OrnamentTextHistory {
    if (!history.past.length) return history;
    const previous = history.past[history.past.length - 1];
    return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redoOrnamentTextLayout(history: OrnamentTextHistory): OrnamentTextHistory {
    if (!history.future.length) return history;
    const [next, ...rest] = history.future;
    return { past: [...history.past, history.present], present: next, future: rest };
}

/** 方向键平移：按百分比移动，左右边界一起走，宽度不变。 */
export function nudgeOrnamentTextLayout(layout: OrnamentTextLayout, delta: number): OrnamentTextLayout {
    const width = layout.right - layout.left;
    const nextLeft = clampOrnamentTextPosition(layout.left + delta);
    const nextRight = clampOrnamentTextPosition(nextLeft + width);
    return { ...layout, left: nextLeft, right: nextRight };
}

export function applyOrnamentTextLayout(values: OrnamentTextValues, layout: OrnamentTextLayout): OrnamentTextValues {
    const { left, right } = normalizeOrnamentTextPosition(layout.left, layout.right);
    return { ...values, left, right, fontSize: clampOrnamentTextFontSize(layout.fontSize) };
}

export const ORNAMENT_TEXT_CATALOG_NOTICE =
    "字体列表是本地可渲染的预览字族（上游字体库未取证），fontname 原样透传；预览随文字、字体、字号、左右定位实时更新，提交后结果以上游返回为准。";
