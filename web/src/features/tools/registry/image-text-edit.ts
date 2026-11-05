/**
 * TASK-036：IMAGE_TEXT_EDIT（图片文字编辑）页面契约 + 纯逻辑（无 React / 无网络）。
 *
 * 事实来源：
 * - docs/V1.0/plan_linkfox_navigation/page-specs/29-image-text-edit.md
 *   （区域：图片文字画布｜文本框列表｜属性编辑｜导出；联动：画布选中 ↔ 右侧条目 ↔ boxes；
 *    导出前检查溢出和缺字；原图永不被覆盖）
 * - docs/V1.0/plan_linkfox_navigation/technical_design.md TECH-T29
 *   （layout=text / adapter=image / 草稿键 tool-draft:v1:IMAGE_TEXT_EDIT）
 * - web/src/services/api/tools/gateway.ts：IMAGE_TEXT_EDIT 只有这 8 个字段进指纹，
 *   prompt 必填、必须带参考图（源图）。
 *
 * 真实边界（不虚构）：
 * - 文本框只能来自用户真实框选/新增，或上游真实识别结果；本文件不生成任何“示例文字”；
 * - 字体列表是本地可渲染的预览字族（CSS 字体栈），不是 LinkFox 字体库清单；
 *   缺字检测按本地字族的覆盖范围给出“预览可能缺字”的提示，不冒充上游保证；
 * - 溢出检测是本地估算（按字宽模型），提示“预计溢出”，不冒充上游排版结果。
 */

export const IMAGE_TEXT_EDIT_TOOL_ID = "IMAGE_TEXT_EDIT" as const;

/** 页面目录（gateway.ts）声明的 8 个字段，顺序即审计顺序。 */
export const IMAGE_TEXT_EDIT_FIELDS = ["boxes", "imageFormat", "imageHeight", "imageName", "imageSize", "imageUrl", "imageWidth", "resultImageUrl"] as const;

export type ImageTextEditFieldKey = (typeof IMAGE_TEXT_EDIT_FIELDS)[number];

/** 源图限制：与页面规格 §7（类型/大小由 provider 校验）对齐的本地前置拦截。 */
export const IMAGE_TEXT_EDIT_IMAGE = {
    maxBytes: 20 * 1024 * 1024,
    minSide: 384,
    maxSide: 4096,
} as const;

export const IMAGE_TEXT_EDIT_MAX_BOXES = 30;
export const IMAGE_TEXT_EDIT_TEXT_LIMIT = 240;
export const IMAGE_TEXT_EDIT_MIN_BOX = 0.03;
export const IMAGE_TEXT_EDIT_FONT_SIZE = { min: 8, max: 240 } as const;
/** 页面 §4：提交按钮旁显示产物数量；本工具单次固定输出 1 张（适配器的 count 也取这里，避免两处各写一个 1）。 */
export const IMAGE_TEXT_EDIT_OUTPUT_NUM = 1;

/* ------------------------------ 导出格式 ------------------------------ */

export type ImageTextEditFormat = "png" | "jpeg" | "webp";

export const IMAGE_TEXT_EDIT_FORMATS: ReadonlyArray<{ id: ImageTextEditFormat; label: string; mime: string; extension: string }> = [
    { id: "png", label: "PNG（透明背景）", mime: "image/png", extension: "png" },
    { id: "jpeg", label: "JPEG（更小体积）", mime: "image/jpeg", extension: "jpg" },
    { id: "webp", label: "WebP（体积与质量平衡）", mime: "image/webp", extension: "webp" },
];

export const imageTextEditFormat = (id: string) => IMAGE_TEXT_EDIT_FORMATS.find((item) => item.id === id);

export function imageTextEditFormatLabel(id: string): string {
    return imageTextEditFormat(id)?.label ?? `${id || "未指定"}（未登记）`;
}

export const isImageTextEditFormat = (id: unknown): id is ImageTextEditFormat => typeof id === "string" && IMAGE_TEXT_EDIT_FORMATS.some((item) => item.id === id);

/** 上传文件的 mime → 导出格式；未登记的类型返回空串，由校验点名。 */
export function imageTextEditFormatFromMime(mime: string | undefined | null): ImageTextEditFormat | "" {
    const normalized = String(mime ?? "").toLowerCase();
    if (!normalized) return "";
    if (normalized.includes("png")) return "png";
    if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpeg";
    if (normalized.includes("webp")) return "webp";
    return "";
}

/** 文件名兜底：mime 缺失时按扩展名推断（仍然可能是空串）。 */
export function imageTextEditFormatFromName(name: string | undefined | null): ImageTextEditFormat | "" {
    const lower = String(name ?? "").toLowerCase();
    if (lower.endsWith(".png")) return "png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpeg";
    if (lower.endsWith(".webp")) return "webp";
    return "";
}

/* ------------------------------ 字体 ------------------------------ */

export type ImageTextEditFontCoverage = "latin" | "latin-symbol" | "latin-cjk";

export type ImageTextEditFont = {
    id: string;
    label: string;
    cssStack: string;
    /** 本地预览的字形覆盖范围；只用于缺字提示，不代表上游字体能力。 */
    coverage: ImageTextEditFontCoverage;
    /** 该字族是否等宽（预览测量用）。 */
    monospace?: boolean;
};

export const IMAGE_TEXT_EDIT_FONTS: ReadonlyArray<ImageTextEditFont> = [
    { id: "sans", label: "无衬线（系统黑体）", cssStack: "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif", coverage: "latin-cjk" },
    { id: "serif", label: "衬线（报刊标题）", cssStack: "'Songti SC', 'Times New Roman', Georgia, serif", coverage: "latin-cjk" },
    { id: "display", label: "展示体（粗标题）", cssStack: "Impact, 'Haettenschweiler', 'Arial Narrow Bold', sans-serif", coverage: "latin-symbol" },
    { id: "mono", label: "等宽（价签/参数）", cssStack: "'SF Mono', Menlo, Consolas, 'Courier New', monospace", coverage: "latin-symbol", monospace: true },
    { id: "hand", label: "手写（手写标注）", cssStack: "'Bradley Hand', 'Segoe Script', 'Comic Sans MS', cursive", coverage: "latin-symbol" },
];

export const IMAGE_TEXT_EDIT_DEFAULT_FONT = IMAGE_TEXT_EDIT_FONTS[0].id;

export function imageTextEditFont(id: string): ImageTextEditFont | undefined {
    return IMAGE_TEXT_EDIT_FONTS.find((font) => font.id === id);
}

/** 预览字体栈：未知字体回落到无衬线，透传时仍用原值（上游可能自带字体能力）。 */
export function imageTextEditFontStack(id: string): string {
    return imageTextEditFont(id)?.cssStack ?? IMAGE_TEXT_EDIT_FONTS[0].cssStack;
}

export function imageTextEditFontLabel(id: string): string {
    return imageTextEditFont(id)?.label ?? `${id || "未命名字体"}（自定义）`;
}

const CJK_PATTERN = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/;
const SYMBOL_PATTERN = /[\u2190-\u21ff\u2500-\u257f\u25a0-\u25ff\u2600-\u27bf]/;

/**
 * 缺字检测（本地预览范围）：返回该字族可能渲染不出来的字符（去重，保序）。
 * latin-cjk 覆盖中日韩 + 拉丁；latin-symbol 只有拉丁 + 常用符号。
 */
export function findImageTextEditMissingGlyphs(text: string, fontId: string): string[] {
    const font = imageTextEditFont(fontId);
    if (!font || font.coverage === "latin-cjk") return [];
    const missing: string[] = [];
    for (const char of Array.from(text)) {
        if (!char.trim()) continue;
        if (CJK_PATTERN.test(char)) {
            if (!missing.includes(char)) missing.push(char);
            continue;
        }
        if (font.coverage === "latin" && SYMBOL_PATTERN.test(char)) {
            if (!missing.includes(char)) missing.push(char);
        }
    }
    return missing;
}

/* ------------------------------ 文本框 ------------------------------ */

export type ImageTextBox = {
    id: string;
    text: string;
    /** 归一化坐标（0–1，相对源图宽高），落盘与提交都用这套坐标。 */
    x: number;
    y: number;
    width: number;
    height: number;
    /** 字号：以源图像素为单位（导出时按源图尺寸绘制）。 */
    fontSize: number;
    fontWeight: 400 | 700;
    align: "left" | "center" | "right";
    color: string;
    fontId: string;
};

export type ImageTextEditValues = {
    boxes: ImageTextBox[];
    imageFormat: string;
    imageHeight: number;
    imageName: string;
    imageSize: number;
    imageUrl: string;
    imageWidth: number;
    resultImageUrl: string;
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const clampNumber = (value: number, min: number, max: number, fallback = min): number => {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
};

export const clampImageTextEditUnit = (value: number, fallback = 0): number => {
    const rounded = Math.round(clampNumber(value, 0, 1, fallback) * 10000) / 10000;
    return rounded;
};

export const clampImageTextEditFontSize = (value: number): number => {
    const rounded = Math.round(clampNumber(value, IMAGE_TEXT_EDIT_FONT_SIZE.min, IMAGE_TEXT_EDIT_FONT_SIZE.max, IMAGE_TEXT_EDIT_FONT_SIZE.min));
    return rounded;
};

/** 归一化单个框：尺寸不小于最小值，整体夹在画布内（不越界）。 */
export function normalizeImageTextBox(box: ImageTextBox): ImageTextBox {
    const width = clampImageTextEditUnit(Math.max(box.width, IMAGE_TEXT_EDIT_MIN_BOX));
    const height = clampImageTextEditUnit(Math.max(box.height, IMAGE_TEXT_EDIT_MIN_BOX));
    const x = clampImageTextEditUnit(Math.min(box.x, 1 - width));
    const y = clampImageTextEditUnit(Math.min(box.y, 1 - height));
    return {
        ...box,
        x,
        y,
        width,
        height,
        fontSize: clampImageTextEditFontSize(box.fontSize),
        fontWeight: box.fontWeight === 700 ? 700 : 400,
        align: box.align === "center" || box.align === "right" ? box.align : "left",
        color: HEX_COLOR.test(box.color) ? box.color.toLowerCase() : "#111111",
        fontId: box.fontId.trim() || IMAGE_TEXT_EDIT_DEFAULT_FONT,
        text: box.text.slice(0, IMAGE_TEXT_EDIT_TEXT_LIMIT),
    };
}

let boxSeq = 0;
export function createImageTextBoxId(seed?: string): string {
    if (seed && seed.trim()) return seed.trim();
    boxSeq += 1;
    return `box-${Date.now().toString(36)}-${boxSeq}`;
}

export function createImageTextBox(patch: Partial<ImageTextBox> = {}): ImageTextBox {
    return normalizeImageTextBox({
        id: createImageTextBoxId(patch.id),
        text: "",
        x: 0.08,
        y: 0.4,
        width: 0.5,
        height: 0.12,
        fontSize: 48,
        fontWeight: 700,
        align: "left",
        color: "#111111",
        fontId: IMAGE_TEXT_EDIT_DEFAULT_FONT,
        ...patch,
    });
}

export function createImageTextEditValues(patch: Partial<ImageTextEditValues> = {}): ImageTextEditValues {
    return {
        boxes: (patch.boxes ?? []).map((box) => normalizeImageTextBox({ ...box, id: createImageTextBoxId(box.id) })),
        imageFormat: isImageTextEditFormat(patch.imageFormat) ? patch.imageFormat : "png",
        imageHeight: Math.max(0, Math.round(Number(patch.imageHeight) || 0)),
        imageName: String(patch.imageName ?? ""),
        imageSize: Math.max(0, Math.round(Number(patch.imageSize) || 0)),
        imageUrl: String(patch.imageUrl ?? "").trim(),
        imageWidth: Math.max(0, Math.round(Number(patch.imageWidth) || 0)),
        resultImageUrl: String(patch.resultImageUrl ?? ""),
    };
}

/** 草稿恢复：任何脏值都收敛到契约内，框的 id/顺序保持稳定。 */
export function readImageTextEditValues(raw: unknown): ImageTextEditValues {
    if (!raw || typeof raw !== "object") return createImageTextEditValues();
    const source = raw as Partial<ImageTextEditValues>;
    const seen = new Set<string>();
    const boxes: ImageTextBox[] = [];
    for (const candidate of Array.isArray(source.boxes) ? source.boxes : []) {
        if (!candidate || typeof candidate !== "object") continue;
        const box = normalizeImageTextBox({
            id: createImageTextBoxId(String((candidate as ImageTextBox).id ?? "")),
            text: String((candidate as ImageTextBox).text ?? ""),
            x: Number((candidate as ImageTextBox).x),
            y: Number((candidate as ImageTextBox).y),
            width: Number((candidate as ImageTextBox).width),
            height: Number((candidate as ImageTextBox).height),
            fontSize: Number((candidate as ImageTextBox).fontSize),
            fontWeight: (candidate as ImageTextBox).fontWeight === 700 ? 700 : 400,
            align: (candidate as ImageTextBox).align === "center" || (candidate as ImageTextBox).align === "right" ? (candidate as ImageTextBox).align : "left",
            color: String((candidate as ImageTextBox).color ?? "#111111"),
            fontId: String((candidate as ImageTextBox).fontId ?? IMAGE_TEXT_EDIT_DEFAULT_FONT),
        });
        if (seen.has(box.id)) box.id = createImageTextBoxId();
        seen.add(box.id);
        boxes.push(box);
    }
    return createImageTextEditValues({
        boxes,
        imageFormat: typeof source.imageFormat === "string" ? source.imageFormat : "png",
        imageHeight: Number(source.imageHeight),
        imageName: source.imageName,
        imageSize: Number(source.imageSize),
        imageUrl: source.imageUrl,
        imageWidth: Number(source.imageWidth),
        resultImageUrl: source.resultImageUrl,
    });
}

export function addImageTextBox(boxes: ImageTextBox[], patch: Partial<ImageTextBox> = {}): ImageTextBox[] {
    if (boxes.length >= IMAGE_TEXT_EDIT_MAX_BOXES) return boxes;
    const step = (boxes.length % 6) * 0.06;
    return [...boxes, createImageTextBox({ y: 0.12 + step, ...patch })];
}

export function updateImageTextBox(boxes: ImageTextBox[], id: string, patch: Partial<ImageTextBox>): ImageTextBox[] {
    return boxes.map((box) => (box.id === id ? normalizeImageTextBox({ ...box, ...patch, id: box.id }) : box));
}

export function removeImageTextBox(boxes: ImageTextBox[], id: string): ImageTextBox[] {
    return boxes.filter((box) => box.id !== id);
}

/** 拖拽/键盘平移：按归一化增量移动，边界夹紧，尺寸不变。 */
export function moveImageTextBox(boxes: ImageTextBox[], id: string, dx: number, dy: number): ImageTextBox[] {
    return boxes.map((box) => {
        if (box.id !== id) return box;
        return normalizeImageTextBox({
            ...box,
            x: clampNumber(box.x + dx, 0, 1 - box.width, box.x),
            y: clampNumber(box.y + dy, 0, 1 - box.height, box.y),
        });
    });
}

/** 改尺寸：宽高分别夹在最小值与画布剩余空间之间，不把框挤出画布。 */
export function resizeImageTextBox(boxes: ImageTextBox[], id: string, patch: { width?: number; height?: number }): ImageTextBox[] {
    return boxes.map((box) => {
        if (box.id !== id) return box;
        const width = patch.width === undefined ? box.width : Math.max(IMAGE_TEXT_EDIT_MIN_BOX, Math.min(patch.width, 1 - box.x));
        const height = patch.height === undefined ? box.height : Math.max(IMAGE_TEXT_EDIT_MIN_BOX, Math.min(patch.height, 1 - box.y));
        return normalizeImageTextBox({ ...box, width, height });
    });
}

export function duplicateImageTextBox(boxes: ImageTextBox[], id: string): ImageTextBox[] {
    const source = boxes.find((box) => box.id === id);
    if (!source || boxes.length >= IMAGE_TEXT_EDIT_MAX_BOXES) return boxes;
    const copy = createImageTextBox({ ...source, id: undefined, x: Math.min(source.x + 0.02, 1 - source.width), y: Math.min(source.y + 0.02, 1 - source.height) });
    return [...boxes, copy];
}

/* ------------------------------ 历史（删除可撤销） ------------------------------ */

export type ImageTextBoxHistory = { past: ImageTextBox[][]; present: ImageTextBox[]; future: ImageTextBox[][] };

const HISTORY_LIMIT = 50;

export function createImageTextBoxHistory(boxes: ImageTextBox[]): ImageTextBoxHistory {
    return { past: [], present: boxes.map((box) => ({ ...box })), future: [] };
}

/** 同内容提交不产生历史噪声（拖拽与按住方向键都不会刷爆栈）。 */
export function commitImageTextBoxHistory(history: ImageTextBoxHistory, next: ImageTextBox[]): ImageTextBoxHistory {
    if (JSON.stringify(history.present) === JSON.stringify(next)) return history;
    return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: next.map((box) => ({ ...box })), future: [] };
}

export const canUndoImageTextBoxHistory = (history: ImageTextBoxHistory): boolean => history.past.length > 0;
export const canRedoImageTextBoxHistory = (history: ImageTextBoxHistory): boolean => history.future.length > 0;

export function undoImageTextBoxHistory(history: ImageTextBoxHistory): ImageTextBoxHistory {
    if (!history.past.length) return history;
    const previous = history.past[history.past.length - 1];
    return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redoImageTextBoxHistory(history: ImageTextBoxHistory): ImageTextBoxHistory {
    if (!history.future.length) return history;
    const [next, ...rest] = history.future;
    return { past: [...history.past, history.present], present: next, future: rest };
}

/* ------------------------------ 排版估算 ------------------------------ */

const WIDE_CHAR = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/;
const UPPER_CHAR = /[A-Z0-9]/;
const NARROW_CHAR = /[iljI.,:;'’!|]/;

/** 单字宽度（em）：CJK 1em、大写 0.62em、窄字 0.32em、其余 0.52em，等宽字体统一 0.6em。 */
export function imageTextEditCharWidth(char: string, fontId: string): number {
    const font = imageTextEditFont(fontId);
    if (font?.monospace) return 0.6;
    if (WIDE_CHAR.test(char)) return 1;
    if (char === " ") return 0.28;
    if (NARROW_CHAR.test(char)) return 0.32;
    if (UPPER_CHAR.test(char)) return 0.62;
    return 0.52;
}

export function estimateImageTextEditTextWidth(text: string, fontSize: number, fontId: string): number {
    return Array.from(text).reduce((sum, char) => sum + imageTextEditCharWidth(char, fontId) * fontSize, 0);
}

export type ImageTextBoxLayout = {
    /** 框在当前源图下的像素宽度/高度。 */
    boxWidth: number;
    boxHeight: number;
    /** 单行文本估算宽度（像素）。 */
    textWidth: number;
    /** 按框宽折行后的行数（至少 1 行；空文本记 0）。 */
    lines: number;
    /** 折行后需要的总高度（像素）。 */
    neededHeight: number;
    overflowX: boolean;
    overflowY: boolean;
    missingGlyphs: string[];
};

/** 本地排版估算：只用于“导出前检查溢出和缺字”，不冒充上游排版。 */
export function measureImageTextBox(box: ImageTextBox, imageWidth: number, imageHeight: number): ImageTextBoxLayout {
    const boxWidth = Math.round(box.width * imageWidth);
    const boxHeight = Math.round(box.height * imageHeight);
    const text = box.text.trim();
    const textWidth = Math.round(estimateImageTextEditTextWidth(text, box.fontSize, box.fontId));
    const lines = text ? Math.max(1, Math.ceil(textWidth / Math.max(1, boxWidth))) : 0;
    const lineHeight = Math.round(box.fontSize * 1.25);
    const neededHeight = lines * lineHeight;
    return {
        boxWidth,
        boxHeight,
        textWidth,
        lines,
        neededHeight,
        overflowX: textWidth > boxWidth,
        overflowY: neededHeight > boxHeight,
        missingGlyphs: findImageTextEditMissingGlyphs(text, box.fontId),
    };
}

export function imageTextEditBoxLabel(box: ImageTextBox, index: number): string {
    const text = box.text.trim();
    return text ? `框 ${index + 1}｜${text.length > 12 ? `${text.slice(0, 12)}…` : text}` : `框 ${index + 1}（空文本）`;
}

/* ------------------------------ 校验 ------------------------------ */

export type ImageTextEditIssueCode = "image-required" | "image-format-invalid" | "image-size-too-large" | "image-dimensions-range" | "box-limit" | "box-text-required" | "box-text-too-long" | "box-overflow" | "box-missing-glyph" | "model-missing";

export type ImageTextEditIssue = { code: ImageTextEditIssueCode; field: ImageTextEditFieldKey; boxId?: string; message: string };

export function validateImageTextEditState(input: { values: ImageTextEditValues; modelReady?: boolean }): ImageTextEditIssue[] {
    const { values } = input;
    const modelReady = input.modelReady ?? true;
    const issues: ImageTextEditIssue[] = [];
    const format = imageTextEditFormat(values.imageFormat);

    if (!values.imageUrl.trim()) {
        issues.push({ code: "image-required", field: "imageUrl", message: "请先上传要编辑文字的图片。" });
    }
    if (!format) {
        issues.push({ code: "image-format-invalid", field: "imageFormat", message: "导出格式只能是 PNG / JPEG / WebP。" });
    }
    if (values.imageSize > IMAGE_TEXT_EDIT_IMAGE.maxBytes) {
        issues.push({ code: "image-size-too-large", field: "imageSize", message: `图片不能超过 ${Math.round(IMAGE_TEXT_EDIT_IMAGE.maxBytes / 1024 / 1024)}MB。` });
    }
    if (values.imageWidth && values.imageHeight) {
        const { minSide, maxSide } = IMAGE_TEXT_EDIT_IMAGE;
        const shortest = Math.min(values.imageWidth, values.imageHeight);
        const longest = Math.max(values.imageWidth, values.imageHeight);
        if (shortest < minSide || longest > maxSide) {
            issues.push({
                code: "image-dimensions-range",
                field: "imageWidth",
                message: `图片边长需在 ${minSide}–${maxSide}px 之间，当前 ${values.imageWidth}×${values.imageHeight}。`,
            });
        }
    }
    if (values.boxes.length > IMAGE_TEXT_EDIT_MAX_BOXES) {
        issues.push({ code: "box-limit", field: "boxes", message: `最多 ${IMAGE_TEXT_EDIT_MAX_BOXES} 个文字框。` });
    }
    for (const box of values.boxes) {
        if (!box.text.trim()) {
            issues.push({ code: "box-text-required", field: "boxes", boxId: box.id, message: `「${imageTextEditBoxLabel(box, values.boxes.indexOf(box))}」还没有文字内容。` });
            continue;
        }
        if (box.text.length > IMAGE_TEXT_EDIT_TEXT_LIMIT) {
            issues.push({ code: "box-text-too-long", field: "boxes", boxId: box.id, message: `单个文字框最多 ${IMAGE_TEXT_EDIT_TEXT_LIMIT} 字。` });
        }
        if (!values.imageWidth || !values.imageHeight) continue;
        const layout = measureImageTextBox(box, values.imageWidth, values.imageHeight);
        if (layout.overflowX || layout.overflowY) {
            issues.push({
                code: "box-overflow",
                field: "boxes",
                boxId: box.id,
                message: `「${imageTextEditBoxLabel(box, values.boxes.indexOf(box))}」预计溢出：文字 ${layout.textWidth}×${layout.lines}行，框 ${layout.boxWidth}×${layout.boxHeight}px。`,
            });
        }
        if (layout.missingGlyphs.length) {
            issues.push({
                code: "box-missing-glyph",
                field: "boxes",
                boxId: box.id,
                message: `「${imageTextEditBoxLabel(box, values.boxes.indexOf(box))}」当前预览字族可能缺字：${layout.missingGlyphs.slice(0, 8).join("")}。`,
            });
        }
    }
    if (!modelReady) {
        issues.push({ code: "model-missing", field: "imageUrl", message: "请先在设置里选择可用的图片模型。" });
    }
    return issues;
}

/** 阻断项：溢出/缺字只是提示，不阻断提交（上游排版可能与本地估算不同）。 */
const BLOCKING_CODES = new Set<ImageTextEditIssueCode>(["image-required", "image-format-invalid", "image-size-too-large", "image-dimensions-range", "box-limit", "box-text-required", "box-text-too-long", "model-missing"]);

export const isBlockingImageTextEditIssue = (issue: ImageTextEditIssue): boolean => BLOCKING_CODES.has(issue.code);

export function hasBlockingImageTextEditIssue(issues: ImageTextEditIssue[]): boolean {
    return issues.some(isBlockingImageTextEditIssue);
}

export function blockingImageTextEditIssues(issues: ImageTextEditIssue[]): ImageTextEditIssue[] {
    return issues.filter(isBlockingImageTextEditIssue);
}

/* ------------------------------ 快照与字段 ------------------------------ */

export type ImageTextEditSnapshot = {
    toolId: typeof IMAGE_TEXT_EDIT_TOOL_ID;
    imageUrl: string;
    imageName: string;
    imageFormat: string;
    imageWidth: number;
    imageHeight: number;
    imageSize: number;
    boxes: ImageTextBox[];
    revision: number | string | null;
    requestId: string;
    fingerprint: string;
};

export function imageTextEditFingerprint(snapshot: Omit<ImageTextEditSnapshot, "fingerprint"> | ImageTextEditSnapshot): string {
    const boxes = snapshot.boxes.map((box) => [box.id, box.text.trim(), box.x, box.y, box.width, box.height, box.fontSize, box.fontWeight, box.align, box.color, box.fontId].join(",")).join(";");
    return [snapshot.toolId, snapshot.imageUrl, snapshot.imageFormat, snapshot.imageWidth, snapshot.imageHeight, snapshot.imageName, boxes].join("|");
}

export function createImageTextEditSnapshot(values: ImageTextEditValues, revision: number | string | null, requestId: string): ImageTextEditSnapshot {
    const snapshot = {
        toolId: IMAGE_TEXT_EDIT_TOOL_ID,
        imageUrl: values.imageUrl.trim(),
        imageName: values.imageName.trim(),
        imageFormat: values.imageFormat,
        imageWidth: values.imageWidth,
        imageHeight: values.imageHeight,
        imageSize: values.imageSize,
        boxes: values.boxes.map((box) => normalizeImageTextBox({ ...box, text: box.text.trim() })),
        revision,
        requestId,
        fingerprint: "",
    } satisfies ImageTextEditSnapshot;
    return { ...snapshot, fingerprint: imageTextEditFingerprint(snapshot) };
}

/** 结果是否只对应旧配置：换图 / 改框 / 改文字 / 换格式都必须让旧结果失效。 */
export function describeImageTextEditDrift(snapshot: ImageTextEditSnapshot, current: ImageTextEditSnapshot): string {
    const drift: string[] = [];
    if (snapshot.imageUrl !== current.imageUrl) drift.push("源图");
    if (snapshot.imageFormat !== current.imageFormat) drift.push("导出格式");
    if (snapshot.imageWidth !== current.imageWidth || snapshot.imageHeight !== current.imageHeight) drift.push("图片尺寸");
    if (snapshot.imageName !== current.imageName) drift.push("图片名称");
    if (snapshot.fingerprint !== current.fingerprint) drift.push("文字框");
    return drift.join("、");
}

export function isImageTextEditSnapshotStale(snapshot: ImageTextEditSnapshot, current: ImageTextEditSnapshot): boolean {
    return snapshot.fingerprint !== current.fingerprint;
}

/** 8 个字段一次组装（页面各处不得自行拼字段），boxes 用归一化坐标的纯数据。 */
export function composeImageTextEditFields(snapshot: ImageTextEditSnapshot): Record<string, unknown> {
    return {
        boxes: snapshot.boxes.map((box) => ({
            id: box.id,
            text: box.text,
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            fontSize: box.fontSize,
            fontWeight: box.fontWeight,
            align: box.align,
            color: box.color,
            fontId: box.fontId,
        })),
        imageFormat: snapshot.imageFormat,
        imageHeight: snapshot.imageHeight,
        imageName: snapshot.imageName,
        imageSize: snapshot.imageSize,
        imageUrl: snapshot.imageUrl,
        imageWidth: snapshot.imageWidth,
        // 输出字段：提交时为上一次结果（可能为空），成功后由结果回写，绝不预填假地址。
        resultImageUrl: "",
    };
}

/** 单行配置串：网关把值里的空白折叠，所以值本身用 URL 编码保持可解析。 */
function encodePromptValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    return String(value).replace(/[\s;｜]+/g, (match) => encodeURIComponent(match));
}

export type ImageTextEditPromptInput = {
    snapshot: ImageTextEditSnapshot;
    /** 上一次结果地址（若有）也进 prompt，便于上游理解“在既有结果上继续改”。 */
    previousResultUrl?: string;
};

/**
 * 提交给 provider 的真实文案。网关只送 prompt + 参考图，所以源图信息、每个框的
 * 位置/尺寸/文本/字体/字号/字重/对齐/颜色必须逐项写进 prompt，禁止静默丢参。
 */
export function buildImageTextEditPrompt(input: ImageTextEditPromptInput): string {
    const { snapshot } = input;
    const header = [`图片文字编辑｜${snapshot.imageName || "未命名图片"}`, `尺寸 ${snapshot.imageWidth}×${snapshot.imageHeight}`, `源格式 ${snapshot.imageFormat}`, `文字框 ${snapshot.boxes.length} 个`].join("｜");
    const boxLines = snapshot.boxes.map((box, index) => {
        const geometry = `${Math.round(box.x * 10000) / 100}%,${Math.round(box.y * 10000) / 100}%,${Math.round(box.width * 10000) / 100}%,${Math.round(box.height * 10000) / 100}%`;
        return [`框${index + 1}`, `坐标 ${geometry}`, `文本「${box.text.trim()}」`, `字体 ${box.fontId}`, `字号 ${box.fontSize}`, `字重 ${box.fontWeight}`, `对齐 ${box.align}`, `颜色 ${box.color}`].join(" ");
    });
    const tail = [`原图作为参考图提供，只在上述文字框内替换文字，保持其余像素不变`, input.previousResultUrl ? `沿用上一次结果 ${encodePromptValue(input.previousResultUrl)}` : "本次基于上传原图重新排版", `导出格式 ${snapshot.imageFormat}`];
    return [header, ...boxLines, ...tail].join("｜");
}

/** 从 prompt 还原每个框的文本与几何（验收用：证明提交参数没有被静默丢弃）。 */
export function parseImageTextEditPrompt(prompt: string): { dimensions: string; boxes: Array<{ index: number; text: string; geometry: string; fontId: string; fontSize: string }> } {
    const boxes: Array<{ index: number; text: string; geometry: string; fontId: string; fontSize: string }> = [];
    const dimensionMatch = prompt.match(/尺寸 (\d+)×(\d+)/);
    const pattern = /框(\d+) 坐标 ([^ ]+) 文本「([^」]*)」 字体 ([^ ]+) 字号 ([^ ]+)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(prompt))) {
        boxes.push({ index: Number(match[1]), geometry: match[2], text: match[3], fontId: match[4], fontSize: match[5] });
    }
    return { dimensions: dimensionMatch ? `${dimensionMatch[1]}×${dimensionMatch[2]}` : "", boxes };
}

/* ------------------------------ 文案 ------------------------------ */

export const IMAGE_TEXT_EDIT_NOTICE = "字体列表是本地可渲染的预览字族（上游字体库未取证），fontId 原样透传；溢出与缺字提示按本地字宽模型估算，提交前请自行确认。原图只作为参考图上传，不会被覆盖。";

export function imageTextEditPreviewNotice(values: ImageTextEditValues): string {
    if (!values.imageUrl) return "上传图片后可框选或新增文字框；画布选中与右侧属性面板始终同步。";
    if (!values.boxes.length) return "还没有文字框：在画布上拖拽框选，或点“新增文字框”。";
    return `共 ${values.boxes.length} 个文字框；绿色为无溢出，琥珀色为预计溢出，红色为可能缺字。`;
}
