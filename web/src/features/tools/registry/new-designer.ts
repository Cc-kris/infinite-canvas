import { z } from "zod";

import { parseToolSpec, type ToolSpec, type ToolSpecInput } from "../types";

/**
 * TASK-038：NEW_DESIGNER（商品图设计器）页面契约。
 *
 * 事实来源：
 * - docs/V1.0/plan_linkfox_navigation/page-specs/31-new-designer.md（三栏设计器宿主 + 6 个字段 + 状态联动）
 * - docs/V1.0/plan_linkfox_navigation/task_list.md TASK-038（设计器宿主、返回/完成回调、草稿恢复；不是普通生成表单）
 * - docs/V1.0/plan_linkfox_navigation/test_cases.md TC-046 / acceptance.md AC-046
 * - registry/index.ts 的 NEW_DESIGNER 条目（index 31、layout designer、adapter designer-host、makeType 99）
 *
 * 边界（不虚构）：
 * - 该工具是 **designer-host**：上游不存在“上传 + 提示词 → 生成”接口，本页不伪装成生成表单，
 *   也不走 image/video 网关（gateway.submit 对 designer-host 直接抛 adapter-not-executable）。
 * - 产物由宿主内图层合成的结果得到：真实渲染（Canvas）→ 真实资产入库 → onDone 回传资产；
 *   渲染或入库失败一律显式失败，没有占位图、没有 setTimeout 假进度。
 * - 字段严格保持 6 个契约字段；onClose/onDone 是宿主注入的回调，只在载荷里留存在标记，绝不序列化函数。
 */

export const NEW_DESIGNER_TOOL_ID = "NEW_DESIGNER";
export const NEW_DESIGNER_ROUTE = "/tools/product-design/new-designer";
export const NEW_DESIGNER_DRAFT_KEY = "tool-draft:v1:NEW_DESIGNER";
export const NEW_DESIGNER_LAYOUT = "designer" as const;
export const NEW_DESIGNER_ADAPTER = "designer-host" as const;

/** 契约字段顺序（与 registry/index.ts 的 NEW_DESIGNER 条目逐项一致）。 */
export const NEW_DESIGNER_FIELD_KEYS = ["designerId", "imageUrl", "isDesignerUse", "onClose", "onDone", "open"] as const;
/** 宿主注入的 callback 字段：载荷里只留标记，禁止 JSON 序列化函数本身。 */
export const NEW_DESIGNER_CALLBACK_KEYS = ["onClose", "onDone"] as const;
export const NEW_DESIGNER_CALLBACK_MARKER = "[host-callback]" as const;

/** 画布尺寸：商品图常用的方形，可切 3:4 / 4:3；限制由本地校验守住，不冒充上游枚举。 */
export const DESIGNER_CANVAS_PRESETS = [
    { id: "1:1", label: "1:1 方形", width: 1200, height: 1200 },
    { id: "3:4", label: "3:4 竖版", width: 1080, height: 1440 },
    { id: "4:3", label: "4:3 横版", width: 1440, height: 1080 },
] as const;

/**
 * 文字字体族。LinkFox 设计器通过 `/image/designer/font/list` 下发字体（含用户上传字体），
 * 本站不接远端字体库，只暴露系统可渲染的中英文字体栈：预览与导出合成共用同一栈，
 * 保证「看到的」与「导出的」一致，不冒充上游字体枚举。
 */
export const DESIGNER_FONT_FAMILIES = [
    { id: "system", label: "系统默认", stack: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif' },
    { id: "sans", label: "黑体", stack: '"PingFang SC", "Helvetica Neue", Arial, "Microsoft YaHei", sans-serif' },
    { id: "serif", label: "宋体", stack: '"Songti SC", "SimSun", Georgia, serif' },
    { id: "kai", label: "楷体", stack: '"Kaiti SC", "KaiTi", "STKaiti", serif' },
    { id: "mono", label: "等宽", stack: '"SF Mono", Menlo, Consolas, "Courier New", monospace' },
] as const;

export type DesignerFontFamilyId = (typeof DESIGNER_FONT_FAMILIES)[number]["id"];
export const DEFAULT_DESIGNER_FONT_FAMILY: DesignerFontFamilyId = "system";

/** 未知/缺失的字体族一律回落到系统默认，避免导出时拿到非法 CSS 字体串。 */
export function designerFontFamily(id: string | undefined): (typeof DESIGNER_FONT_FAMILIES)[number] {
    return DESIGNER_FONT_FAMILIES.find((family) => family.id === id) ?? DESIGNER_FONT_FAMILIES[0];
}

export function designerFontStack(id: string | undefined): string {
    return designerFontFamily(id).stack;
}

export type DesignerCanvasPresetId = (typeof DESIGNER_CANVAS_PRESETS)[number]["id"];
export const DEFAULT_DESIGNER_CANVAS_PRESET: DesignerCanvasPresetId = "1:1";
export const DESIGNER_CANVAS_LIMITS = { minSide: 256, maxSide: 4096 } as const;

export const DESIGNER_LAYER_LIMITS = {
    maxLayers: 24,
    minSize: 16,
    rotationMin: -180,
    rotationMax: 180,
    opacityMin: 0.05,
    opacityMax: 1,
    /** 键盘微调步长（Shift 为 4 倍），保证 40×40 点击区之外仍有精确操作。 */
    nudgeStep: 8,
    nudgeStepFast: 32,
} as const;

export const DESIGNER_HISTORY_LIMIT = 50;

export const DESIGNER_TEXT_LIMIT = 120;

/* ============================== 文档模型 ============================== */

export type DesignerLayerKind = "image" | "text";

export type DesignerLayer = {
    id: string;
    kind: DesignerLayerKind;
    name: string;
    /** 图片图层的素材地址（HTTPS / dataURL / 本地资产 id）。 */
    src?: string;
    /** 文本图层的文案，渲染与提示词都用它，不允许为空字符串。 */
    text?: string;
    fontSize?: number;
    color?: string;
    /** 文本图层字体族 id（见 DESIGNER_FONT_FAMILIES）；缺省视为系统默认。 */
    fontFamily?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    opacity: number;
    visible: boolean;
    locked: boolean;
};

export type DesignerDocument = {
    designerId: string;
    width: number;
    height: number;
    background: string;
    /** 数组顺序即 z 序（后者在上）。 */
    layers: DesignerLayer[];
    revision: number;
};

export type DesignerHostState = {
    open: boolean;
    isDesignerUse: boolean;
    imageUrl: string;
    hasOnClose: boolean;
    hasOnDone: boolean;
};

export type DesignerIssueCode =
    | "host-closed"
    | "host-callback-missing"
    | "designer-id-missing"
    | "empty-canvas"
    | "too-many-layers"
    | "layer-empty"
    | "layer-size-invalid"
    | "layer-off-canvas"
    | "layer-src-missing"
    | "text-empty"
    | "canvas-size-invalid";

export type DesignerIssue = { code: DesignerIssueCode; message: string; layerId?: string };

/* ============================== 校验 schema（草稿恢复用） ============================== */

const layerSchema = z.object({
    id: z.string().min(1),
    kind: z.enum(["image", "text"]),
    name: z.string().min(1),
    src: z.string().min(1).optional(),
    text: z.string().optional(),
    fontSize: z.number().finite().positive().optional(),
    color: z.string().min(1).optional(),
    fontFamily: z.string().min(1).optional(),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite(),
    height: z.number().finite(),
    rotation: z.number().finite(),
    opacity: z.number().finite(),
    visible: z.boolean(),
    locked: z.boolean(),
});

const documentSchema = z.object({
    designerId: z.string().min(1),
    width: z.number().finite(),
    height: z.number().finite(),
    background: z.string().min(1),
    layers: z.array(layerSchema),
    revision: z.number().int().min(0),
});

/* ============================== 构造 ============================== */

export function createDesignerId(now: number = Date.now(), random: number = Math.random()): string {
    const suffix = Math.floor(Math.abs(random) * 0xffffffff)
        .toString(36)
        .padStart(6, "0")
        .slice(0, 8);
    return `dz-${now.toString(36)}-${suffix}`;
}

export function designerCanvasPreset(id: string | undefined) {
    return DESIGNER_CANVAS_PRESETS.find((preset) => preset.id === id) ?? DESIGNER_CANVAS_PRESETS[0];
}

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

/** 图层几何裁剪：宽高不小于最小值，旋转与不透明度落在契约区间内。 */
export function clampDesignerLayer(layer: DesignerLayer): DesignerLayer {
    return {
        ...layer,
        width: clamp(layer.width, DESIGNER_LAYER_LIMITS.minSize, 100000),
        height: clamp(layer.height, DESIGNER_LAYER_LIMITS.minSize, 100000),
        rotation: clamp(layer.rotation, DESIGNER_LAYER_LIMITS.rotationMin, DESIGNER_LAYER_LIMITS.rotationMax),
        opacity: clamp(layer.opacity, DESIGNER_LAYER_LIMITS.opacityMin, DESIGNER_LAYER_LIMITS.opacityMax),
        x: Number.isFinite(layer.x) ? layer.x : 0,
        y: Number.isFinite(layer.y) ? layer.y : 0,
    };
}

/** 底图图层：从工具/资产进入设计器时，源图作为可编辑底图铺满画布（contain，居中）。 */
export function createBaseImageLayer(imageUrl: string, width: number, height: number): DesignerLayer {
    return clampDesignerLayer({
        id: "layer-base",
        kind: "image",
        name: "商品底图",
        src: imageUrl,
        x: 0,
        y: 0,
        width,
        height,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
    });
}

export function createTextLayer(index: number, patch: Partial<DesignerLayer> = {}): DesignerLayer {
    return clampDesignerLayer({
        id: `layer-text-${index}`,
        kind: "text",
        name: patch.name ?? `文字 ${index}`,
        text: patch.text ?? "商品卖点文案",
        fontSize: patch.fontSize ?? 64,
        color: patch.color ?? "#ffffff",
        fontFamily: patch.fontFamily ?? DEFAULT_DESIGNER_FONT_FAMILY,
        x: patch.x ?? 80,
        y: patch.y ?? 80,
        width: patch.width ?? 640,
        height: patch.height ?? 120,
        rotation: patch.rotation ?? 0,
        opacity: patch.opacity ?? 1,
        visible: patch.visible ?? true,
        locked: patch.locked ?? false,
    });
}

export type CreateDesignerDocumentInput = {
    designerId?: string;
    imageUrl?: string;
    width?: number;
    height?: number;
    background?: string;
    layers?: DesignerLayer[];
    revision?: number;
};

export function createDesignerDocument(input: CreateDesignerDocumentInput = {}): DesignerDocument {
    const width = clamp(Math.round(input.width ?? 1200), DESIGNER_CANVAS_LIMITS.minSide, DESIGNER_CANVAS_LIMITS.maxSide);
    const height = clamp(Math.round(input.height ?? 1200), DESIGNER_CANVAS_LIMITS.minSide, DESIGNER_CANVAS_LIMITS.maxSide);
    const layers = input.layers ? input.layers.map(clampDesignerLayer) : [];
    if (!input.layers && input.imageUrl) layers.push(createBaseImageLayer(input.imageUrl, width, height));
    return {
        designerId: input.designerId ?? createDesignerId(),
        width,
        height,
        background: input.background ?? "#ffffff",
        layers,
        revision: input.revision ?? 1,
    };
}

/** 任何编辑都递增 revision：草稿冲突与“结果来自旧版本”的判断都依赖它。 */
function bump(document: DesignerDocument, layers: DesignerLayer[]): DesignerDocument {
    return { ...document, layers: layers.map(clampDesignerLayer), revision: document.revision + 1 };
}

export function findDesignerLayer(document: DesignerDocument, layerId: string): DesignerLayer | undefined {
    return document.layers.find((layer) => layer.id === layerId);
}

export function selectedDesignerLayer(document: DesignerDocument, layerId?: string): DesignerLayer | undefined {
    if (!layerId) return undefined;
    return findDesignerLayer(document, layerId);
}

/* ============================== 图层操作 ============================== */

export function updateDesignerLayer(document: DesignerDocument, layerId: string, patch: Partial<DesignerLayer>): DesignerDocument {
    return bump(
        document,
        document.layers.map((layer) => (layer.id === layerId ? { ...layer, ...patch, id: layer.id } : layer)),
    );
}

export function moveDesignerLayer(document: DesignerDocument, layerId: string, deltaX: number, deltaY: number): DesignerDocument {
    const layer = findDesignerLayer(document, layerId);
    if (!layer) return document;
    return updateDesignerLayer(document, layerId, { x: layer.x + deltaX, y: layer.y + deltaY });
}

/** 方向键微调：默认 8px，Shift 32px；锁定图层不响应。 */
export function nudgeDesignerLayer(document: DesignerDocument, layerId: string, key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown", fast = false): DesignerDocument {
    const layer = findDesignerLayer(document, layerId);
    if (!layer || layer.locked) return document;
    const step = fast ? DESIGNER_LAYER_LIMITS.nudgeStepFast : DESIGNER_LAYER_LIMITS.nudgeStep;
    if (key === "ArrowLeft") return moveDesignerLayer(document, layerId, -step, 0);
    if (key === "ArrowRight") return moveDesignerLayer(document, layerId, step, 0);
    if (key === "ArrowUp") return moveDesignerLayer(document, layerId, 0, -step);
    return moveDesignerLayer(document, layerId, 0, step);
}

export function resizeDesignerLayer(document: DesignerDocument, layerId: string, width: number, height: number): DesignerDocument {
    return updateDesignerLayer(document, layerId, { width, height });
}

export function rotateDesignerLayer(document: DesignerDocument, layerId: string, rotation: number): DesignerDocument {
    return updateDesignerLayer(document, layerId, { rotation });
}

export function setDesignerLayerVisibility(document: DesignerDocument, layerId: string, visible: boolean): DesignerDocument {
    return updateDesignerLayer(document, layerId, { visible });
}

export function toggleDesignerLayerLock(document: DesignerDocument, layerId: string): DesignerDocument {
    const layer = findDesignerLayer(document, layerId);
    if (!layer) return document;
    return updateDesignerLayer(document, layerId, { locked: !layer.locked });
}

export function renameDesignerLayer(document: DesignerDocument, layerId: string, name: string): DesignerDocument {
    const trimmed = name.trim();
    if (!trimmed) return document;
    return updateDesignerLayer(document, layerId, { name: trimmed });
}

export function removeDesignerLayer(document: DesignerDocument, layerId: string): DesignerDocument {
    if (!findDesignerLayer(document, layerId)) return document;
    return bump(document, document.layers.filter((layer) => layer.id !== layerId));
}

export function addDesignerLayer(document: DesignerDocument, layer: DesignerLayer): DesignerDocument {
    if (document.layers.length >= DESIGNER_LAYER_LIMITS.maxLayers) return document;
    const id = document.layers.some((item) => item.id === layer.id) ? `${layer.id}-${document.revision + 1}` : layer.id;
    return bump(document, [...document.layers, { ...layer, id }]);
}

export type DesignerReorderDirection = "up" | "down" | "front" | "back";

/** z 序调整：up = 上移一层（更靠前），front = 置顶。 */
export function reorderDesignerLayers(document: DesignerDocument, layerId: string, direction: DesignerReorderDirection): DesignerDocument {
    const index = document.layers.findIndex((layer) => layer.id === layerId);
    if (index < 0) return document;
    const layers = [...document.layers];
    const [layer] = layers.splice(index, 1);
    const target = direction === "front" ? layers.length : direction === "back" ? 0 : direction === "up" ? Math.min(index + 1, layers.length) : Math.max(index - 1, 0);
    layers.splice(target, 0, layer);
    return bump(document, layers);
}

export function setDesignerCanvasSize(document: DesignerDocument, width: number, height: number): DesignerDocument {
    const nextWidth = clamp(Math.round(width), DESIGNER_CANVAS_LIMITS.minSide, DESIGNER_CANVAS_LIMITS.maxSide);
    const nextHeight = clamp(Math.round(height), DESIGNER_CANVAS_LIMITS.minSide, DESIGNER_CANVAS_LIMITS.maxSide);
    return { ...bump(document, document.layers), width: nextWidth, height: nextHeight };
}

/** 画布背景色：LinkFox 设计器有独立「背景」面板（/image/designer/background/list）。
 * 本站只做纯色背景，取值只接受 #RGB / #RRGGBB，非法值保持原样不入库。 */
export const DESIGNER_BACKGROUND_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isDesignerBackground(value: string): boolean {
    return DESIGNER_BACKGROUND_PATTERN.test(value.trim());
}

export function setDesignerCanvasBackground(document: DesignerDocument, background: string): DesignerDocument {
    const next = background.trim();
    if (!isDesignerBackground(next)) return document;
    if (next.toLowerCase() === document.background.toLowerCase()) return document;
    return { ...bump(document, document.layers), background: next };
}

/* ============================== 历史（撤销/重做） ============================== */

export type DesignerHistory = { past: DesignerDocument[]; present: DesignerDocument; future: DesignerDocument[] };

export function createDesignerHistory(document: DesignerDocument): DesignerHistory {
    return { past: [], present: document, future: [] };
}

export function designerDocumentKey(document: DesignerDocument): string {
    return JSON.stringify({
        width: document.width,
        height: document.height,
        background: document.background,
        layers: document.layers.map((layer) => [layer.id, layer.kind, layer.name, layer.src ?? "", layer.text ?? "", layer.x, layer.y, layer.width, layer.height, layer.rotation, layer.opacity, layer.visible, layer.locked, layer.fontSize ?? null, layer.fontFamily ?? "", layer.color ?? ""]),
    });
}

/** 无实质变化不入栈，避免撤销一次等于“什么都没变”。 */
export function commitDesignerDocument(history: DesignerHistory, next: DesignerDocument, limit: number = DESIGNER_HISTORY_LIMIT): DesignerHistory {
    if (designerDocumentKey(next) === designerDocumentKey(history.present)) return history;
    const past = [...history.past, history.present].slice(-limit);
    return { past, present: next, future: [] };
}

export function undoDesignerDocument(history: DesignerHistory): DesignerHistory {
    if (!history.past.length) return history;
    const previous = history.past[history.past.length - 1];
    return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future].slice(0, DESIGNER_HISTORY_LIMIT) };
}

export function redoDesignerDocument(history: DesignerHistory): DesignerHistory {
    if (!history.future.length) return history;
    const [next, ...rest] = history.future;
    return { past: [...history.past, history.present].slice(-DESIGNER_HISTORY_LIMIT), present: next, future: rest };
}

export const canUndoDesigner = (history: DesignerHistory): boolean => history.past.length > 0;
export const canRedoDesigner = (history: DesignerHistory): boolean => history.future.length > 0;

/* ============================== 校验 ============================== */

export function validateDesignerCanvas(document: DesignerDocument): DesignerIssue[] {
    const issues: DesignerIssue[] = [];
    if (!document.designerId) issues.push({ code: "designer-id-missing", message: "缺少设计项目 ID（designerId），请重新打开设计器。" });
    if (document.width < DESIGNER_CANVAS_LIMITS.minSide || document.height < DESIGNER_CANVAS_LIMITS.minSide) {
        issues.push({ code: "canvas-size-invalid", message: `画布不能小于 ${DESIGNER_CANVAS_LIMITS.minSide}px。` });
    }
    if (!document.layers.length) issues.push({ code: "empty-canvas", message: "画布为空：至少保留一个图层再完成。" });
    if (document.layers.length > DESIGNER_LAYER_LIMITS.maxLayers) {
        issues.push({ code: "too-many-layers", message: `图层不能超过 ${DESIGNER_LAYER_LIMITS.maxLayers} 个。` });
    }
    document.layers.forEach((layer, index) => {
        const label = `第 ${index + 1} 层「${layer.name}」`;
        if (layer.width < DESIGNER_LAYER_LIMITS.minSize || layer.height < DESIGNER_LAYER_LIMITS.minSize) {
            issues.push({ code: "layer-size-invalid", message: `${label}尺寸小于 ${DESIGNER_LAYER_LIMITS.minSize}px。`, layerId: layer.id });
        }
        if (layer.kind === "image" && !layer.src) issues.push({ code: "layer-src-missing", message: `${label}没有素材地址，请重新上传。`, layerId: layer.id });
        if (layer.kind === "text" && !(layer.text ?? "").trim()) issues.push({ code: "text-empty", message: `${label}文案为空。`, layerId: layer.id });
        if (layer.x > document.width || layer.y > document.height || layer.x + layer.width < 0 || layer.y + layer.height < 0) {
            issues.push({ code: "layer-off-canvas", message: `${label}完全在画布外，请拖回画布。`, layerId: layer.id });
        }
    });
    return issues;
}

export function validateDesignerHostState(state: DesignerHostState): DesignerIssue[] {
    const issues: DesignerIssue[] = [];
    if (!state.open) issues.push({ code: "host-closed", message: "设计器宿主未打开（open=false），不能编辑或完成。" });
    if (!state.hasOnClose || !state.hasOnDone) issues.push({ code: "host-callback-missing", message: "宿主必须注入 onClose 与 onDone 回调。" });
    return issues;
}

/** 提交/完成前的合并校验：宿主状态 + 画布内容。 */
export function validateDesignerState(input: { document: DesignerDocument; host: DesignerHostState }): DesignerIssue[] {
    return [...validateDesignerHostState(input.host), ...validateDesignerCanvas(input.document)];
}

export const hasBlockingDesignerIssue = (issues: readonly DesignerIssue[]): boolean => issues.length > 0;

/** 每个图层的确定性描述：提示词、逐项核对、失败定位共用同一段文本。 */
export function designerLayerLine(layer: DesignerLayer, index: number): string {
    const base = `图层 ${index + 1}「${layer.name}」${layer.kind === "image" ? "[图片]" : "[文本]"} 位置 ${Math.round(layer.x)},${Math.round(layer.y)} 尺寸 ${Math.round(layer.width)}×${Math.round(layer.height)} 旋转 ${Math.round(layer.rotation)}° 不透明度 ${Math.round(layer.opacity * 100)}%`;
    if (layer.kind === "text") return `${base} 文案「${layer.text ?? ""}」字号 ${layer.fontSize ?? 0}px 颜色 ${layer.color ?? ""}`;
    return `${base} 素材 ${layer.src ?? ""}`;
}

export function buildDesignerPrompt(document: DesignerDocument): string {
    const visible = document.layers;
    const lines = visible.map((layer, index) => designerLayerLine(layer, index));
    return [
        `商品图设计器 ${document.designerId}：画布 ${document.width}×${document.height}px，背景 ${document.background}，共 ${visible.length} 个图层，按下列顺序自下而上合成。`,
        ...lines,
    ].join("\n");
}

/* ============================== 字段载荷 ============================== */

export type DesignerFields = {
    designerId: string;
    imageUrl: string;
    isDesignerUse: boolean;
    open: boolean;
    onClose: typeof NEW_DESIGNER_CALLBACK_MARKER;
    onDone: typeof NEW_DESIGNER_CALLBACK_MARKER;
};

/**
 * 6 个契约字段：
 * - designerId/imageUrl/isDesignerUse/open 是真实值；
 * - onClose/onDone 是宿主注入的回调，载荷里只保留标记（禁止 JSON 序列化函数）。
 */
export function buildDesignerFields(document: DesignerDocument, host: DesignerHostState): DesignerFields {
    return {
        designerId: document.designerId,
        imageUrl: host.imageUrl,
        isDesignerUse: host.isDesignerUse,
        open: host.open,
        onClose: NEW_DESIGNER_CALLBACK_MARKER,
        onDone: NEW_DESIGNER_CALLBACK_MARKER,
    };
}

export type DesignerFieldAudit = { ok: boolean; missing: string[]; unexpected: string[]; mismatched: string[] };

function sameValue(expected: unknown, actual: unknown): boolean {
    if (typeof expected === "number" || typeof actual === "number" || typeof expected === "boolean" || typeof actual === "boolean") return expected === actual;
    return JSON.stringify(expected ?? null) === JSON.stringify(actual ?? null);
}

export function auditDesignerFields(fields: Record<string, unknown> | undefined, document: DesignerDocument, host: DesignerHostState): DesignerFieldAudit {
    const actual = fields ?? {};
    const expected = buildDesignerFields(document, host) as unknown as Record<string, unknown>;
    const allowed = new Set<string>(NEW_DESIGNER_FIELD_KEYS);
    const missing = NEW_DESIGNER_FIELD_KEYS.filter((key) => !(key in actual));
    const unexpected = Object.keys(actual).filter((key) => !allowed.has(key));
    const mismatched = NEW_DESIGNER_FIELD_KEYS.filter((key) => key in actual && !sameValue(expected[key], actual[key]));
    return { ok: !missing.length && !mismatched.length && !unexpected.length, missing, unexpected, mismatched };
}

/** 回调键在载荷里只能是标记字符串：一旦被替换成函数，序列化就会失败，这里提前拦住。 */
export function assertDesignerFieldsSerializable(fields: Record<string, unknown>): void {
    for (const key of NEW_DESIGNER_CALLBACK_KEYS) {
        if (typeof fields[key] === "function") throw new Error(`字段 ${key} 不能序列化函数，只允许宿主标记。`);
    }
    JSON.stringify(fields);
}

/** 指纹：完成产物与提交快照对齐、以及“旧版本结果”判定都用它。 */
export function designerDocumentFingerprint(document: DesignerDocument): string {
    const text = designerDocumentKey(document) + `|${document.designerId}|${document.revision}`;
    let hash = 5381;
    for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0;
    return `dz1-${hash.toString(36)}-${document.layers.length}`;
}

export function isDesignerStale(snapshotFingerprint: string | undefined, current: DesignerDocument): boolean {
    if (!snapshotFingerprint) return false;
    return snapshotFingerprint !== designerDocumentFingerprint(current);
}

/* ============================== 草稿（tool-draft:v1:NEW_DESIGNER） ============================== */

export type DesignerDraftValues = {
    designerId: string;
    imageUrl: string;
    isDesignerUse: boolean;
    canvasPreset: string;
    document: DesignerDocument;
    savedAt: string;
};

export function serializeDesignerDraft(document: DesignerDocument, options: { imageUrl?: string; isDesignerUse?: boolean; canvasPreset?: string; now?: string } = {}): DesignerDraftValues {
    return {
        designerId: document.designerId,
        imageUrl: options.imageUrl ?? document.layers.find((layer) => layer.kind === "image")?.src ?? "",
        isDesignerUse: options.isDesignerUse ?? true,
        canvasPreset: options.canvasPreset ?? "1:1",
        document,
        savedAt: options.now ?? new Date().toISOString(),
    };
}

export type DesignerDraftRestore = { status: "ok"; values: DesignerDraftValues } | { status: "empty" | "invalid"; reason: string };

/** 草稿恢复：形状不符不猜测、不迁移到新结构，直接返回 invalid 交给页面提示。 */
export function restoreDesignerDraft(raw: unknown): DesignerDraftRestore {
    if (raw === null || raw === undefined) return { status: "empty", reason: "没有草稿" };
    if (typeof raw !== "object") return { status: "invalid", reason: "草稿不是对象" };
    const value = raw as Record<string, unknown>;
    const parsed = documentSchema.safeParse(value.document);
    if (!parsed.success) return { status: "invalid", reason: `画布结构不合法：${parsed.error.issues[0]?.message ?? "未知原因"}` };
    if (typeof value.imageUrl !== "string") return { status: "invalid", reason: "草稿缺少 imageUrl" };
    return {
        status: "ok",
        values: {
            designerId: parsed.data.designerId,
            imageUrl: value.imageUrl,
            isDesignerUse: value.isDesignerUse === true,
            canvasPreset: typeof value.canvasPreset === "string" ? value.canvasPreset : "1:1",
            document: parsed.data as DesignerDocument,
            savedAt: typeof value.savedAt === "string" ? value.savedAt : "",
        },
    };
}

/* ============================== 关闭/完成回调 ============================== */

export type DesignerCloseDecision = { action: "close" } | { action: "confirm"; message: string };

/** 关闭语义：有未保存画布工作时先确认，未保存不静默丢弃。 */
export function decideDesignerClose(input: { dirty: boolean; restoring?: boolean }): DesignerCloseDecision {
    if (input.restoring) return { action: "confirm", message: "草稿仍在恢复中，确定关闭吗？未恢复的编辑会丢失。" };
    if (input.dirty) return { action: "confirm", message: "画布上有未保存的修改，关闭后需要重新编辑。确定关闭并保留草稿吗？" };
    return { action: "close" };
}

export type DesignerDonePayload = {
    designerId: string;
    assetId: string;
    url: string;
    width: number;
    height: number;
    fingerprint: string;
};

/** 完成回传：只接受真实入库的资产，没有 assetId 一律不许 onDone。 */
export function buildDesignerDonePayload(document: DesignerDocument, asset: { assetId?: string; url?: string } | undefined): DesignerDonePayload {
    if (!asset?.assetId) throw new Error("onDone 需要真实入库的资产 id，当前没有可回传的结果。");
    return {
        designerId: document.designerId,
        assetId: asset.assetId,
        url: asset.url ?? "",
        width: document.width,
        height: document.height,
        fingerprint: designerDocumentFingerprint(document),
    };
}

/* ============================== ToolSpec（与 registry/index.ts 逐项一致） ============================== */

export const NEW_DESIGNER_SPEC_INPUT: ToolSpecInput = {
    id: NEW_DESIGNER_TOOL_ID,
    index: 31,
    title: "商品图设计器",
    category: "product-design",
    slug: "new-designer",
    route: NEW_DESIGNER_ROUTE,
    makeType: 99,
    origin: "supplemental",
    layout: NEW_DESIGNER_LAYOUT,
    adapter: NEW_DESIGNER_ADAPTER,
    batchCapable: false,
    enabled: true,
    fields: [
        { key: "designerId", control: "unspecified", required: false },
        { key: "imageUrl", control: "upload", required: true, providerRule: "string(URL)" },
        { key: "isDesignerUse", control: "boolean", required: true, defaultValue: false, providerRule: "boolean" },
        { key: "onClose", control: "unspecified", required: true, providerRule: "callback" },
        { key: "onDone", control: "unspecified", required: true, providerRule: "callback" },
        { key: "open", control: "unspecified", required: true, defaultValue: false, providerRule: "boolean" },
    ],
};

export const NEW_DESIGNER_SPEC: ToolSpec = parseToolSpec(NEW_DESIGNER_SPEC_INPUT);

/** 与注册表条目做逐字段比对，规格漂移时给出可读差异（供测试与自检使用）。 */
export function designerSpecDrift(actual: ToolSpec | undefined): string[] {
    if (!actual) return ["注册表中找不到 NEW_DESIGNER"];
    const expected = NEW_DESIGNER_SPEC;
    const drift: string[] = [];
    for (const key of ["id", "index", "title", "category", "slug", "route", "makeType", "origin", "layout", "adapter", "batchCapable", "enabled"] as const) {
        if (actual[key] !== expected[key]) drift.push(`${key} 期望 ${String(expected[key])}，实际 ${String(actual[key])}`);
    }
    const expectedKeys = expected.fields.map((field) => field.key);
    const actualKeys = actual.fields.map((field) => field.key);
    if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) drift.push(`字段顺序期望 ${expectedKeys.join(",")}，实际 ${actualKeys.join(",")}`);
    expected.fields.forEach((field, index) => {
        const other = actual.fields[index];
        if (!other) return;
        if (field.control !== other.control) drift.push(`${field.key} 控件期望 ${field.control}，实际 ${other.control}`);
        if (Boolean(field.required) !== Boolean(other.required)) drift.push(`${field.key} required 期望 ${Boolean(field.required)}，实际 ${Boolean(other.required)}`);
        if ((field.defaultValue ?? null) !== (other.defaultValue ?? null)) drift.push(`${field.key} 默认值不一致`);
    });
    return drift;
}
