/**
 * IMAGE_TRANSLATION「批量翻译」页面契约 + 纯逻辑（无 React / 无网络）。
 *
 * 证据：docs/V1.0/plan_linkfox_navigation/page-specs/04-image-translation.md
 *  - 区域：批量图片上传｜原文语言｜目标语言分组多选｜翻译结果（+ 逐文本框校对）
 *  - 限制：单图 20M、384*384 ~ 4096*4096、单图文字 500 字以内（§2、§9）
 *  - 目标语言按 欧美/亚洲/南亚/中东/非洲 分组，多选并显示已选数（§2、§9）
 *  - 目标语言每增一个即增加一路输出；原图×语言矩阵展示进度；源/目标相同须提示；
 *    OCR/版式失败只失败对应单元，可编辑文本后重试；切换语言不清空已上传图片（§3）
 *  - 主路径：上传→选择/自动识别源语言→多选目标语言→翻译→逐语言检查文字与排版→保存/下载（§4）
 *
 * 证据边界：
 *  - 欧美/亚洲 两组语言清单逐项来自规格 §9 原站文案摘录；
 *  - 南亚/中东/非洲 三组规格只给出组名（§2），组内语言为本页补充清单（`evidenced: false`），
 *    不得当作原站枚举引用。
 *
 * 本文件只描述工具自身的输入/校对/快照语义，不复制 LinkFox 前端或算力区。
 */

import type { ToolSpec } from "../types";
import { getToolById } from "./index";

export const IMAGE_TRANSLATION_TOOL_ID = "IMAGE_TRANSLATION" as const;
export const IMAGE_TRANSLATION_SLUG = "image-translation" as const;
export const IMAGE_TRANSLATION_ROUTE = "/tools/ecommerce-suite/image-translation" as const;

/** 草稿键与共享草稿存储约定一致（`tool-draft:v1:<toolId>`）。 */
export const IMAGE_TRANSLATION_DRAFT_KEY = `tool-draft:v1:${IMAGE_TRANSLATION_TOOL_ID}`;

/** 页面规格约束（§2/§9）。 */
export const IMAGE_TRANSLATION_MAX_IMAGES = 12;
export const IMAGE_TRANSLATION_MAX_BYTES = 20 * 1024 * 1024;
export const IMAGE_TRANSLATION_MIN_EDGE = 384;
export const IMAGE_TRANSLATION_MAX_EDGE = 4096;
export const IMAGE_TRANSLATION_MAX_TEXT_CHARS = 500;
export const IMAGE_TRANSLATION_MAX_BOXES_PER_IMAGE = 40;
/** 一次批量最多同时产出多少路语言版本：实现侧成本护栏（规格只要求"多选"）。 */
export const IMAGE_TRANSLATION_MAX_TARGETS = 8;
/** 单批并发上限，避免平台限流。 */
export const IMAGE_TRANSLATION_CONCURRENCY = 3;

export interface TranslationLanguage {
    code: string;
    label: string;
    /** 交给 provider 的语言英文名，提示词里用它，避免模型猜中文名。 */
    english: string;
}

/** 自动识别源语言：由视觉模型读出图中语言后回填（§4「选择/自动识别源语言」）。 */
export const TRANSLATION_AUTO_SOURCE = "auto" as const;

export const SOURCE_LANGUAGES: readonly TranslationLanguage[] = [
    { code: "zh-CN", label: "中文", english: "Simplified Chinese" },
    { code: "en", label: "英语", english: "English" },
    { code: "zh-TW", label: "繁体中文", english: "Traditional Chinese" },
    { code: "es", label: "西班牙语", english: "Spanish" },
    { code: "ja", label: "日语", english: "Japanese" },
    { code: "ko", label: "韩语", english: "Korean" },
    { code: "pt", label: "葡萄牙语", english: "Portuguese" },
    { code: "de", label: "德语", english: "German" },
    { code: "ro", label: "罗马尼亚语", english: "Romanian" },
    { code: "ru", label: "俄语", english: "Russian" },
    { code: "vi", label: "越南语", english: "Vietnamese" },
];

export interface TargetLanguageGroup {
    key: string;
    label: string;
    /** 组内语言是否有原站文案证据（false = 本页补充清单）。 */
    evidenced: boolean;
    languages: readonly TranslationLanguage[];
}

export const TARGET_LANGUAGE_GROUPS: readonly TargetLanguageGroup[] = [
    {
        key: "europe-america",
        label: "欧美",
        evidenced: true,
        languages: [
            { code: "en", label: "英语", english: "English" },
            { code: "ru", label: "俄语", english: "Russian" },
            { code: "fr", label: "法语", english: "French" },
            { code: "de", label: "德语", english: "German" },
            { code: "sv", label: "瑞典语", english: "Swedish" },
            { code: "nb", label: "挪威语", english: "Norwegian" },
            { code: "nl", label: "荷兰语", english: "Dutch" },
            { code: "da", label: "丹麦语", english: "Danish" },
            { code: "it", label: "意大利语", english: "Italian" },
            { code: "pt", label: "葡萄牙语", english: "Portuguese" },
            { code: "pt-BR", label: "葡萄牙语(巴西)", english: "Brazilian Portuguese" },
            { code: "es", label: "西班牙语", english: "Spanish" },
            { code: "pl", label: "波兰语", english: "Polish" },
            { code: "cs", label: "捷克语", english: "Czech" },
            { code: "el", label: "希腊语", english: "Greek" },
            { code: "et", label: "爱沙尼亚语", english: "Estonian" },
            { code: "fi", label: "芬兰语", english: "Finnish" },
            { code: "hu", label: "匈牙利语", english: "Hungarian" },
            { code: "lt", label: "立陶宛语", english: "Lithuanian" },
            { code: "lv", label: "拉脱维亚语", english: "Latvian" },
            { code: "ro", label: "罗马尼亚语", english: "Romanian" },
            { code: "sk", label: "斯洛伐克语", english: "Slovak" },
            { code: "sl", label: "斯洛文尼亚语", english: "Slovenian" },
            { code: "uk", label: "乌克兰语", english: "Ukrainian" },
            { code: "bg", label: "保加利亚语", english: "Bulgarian" },
            { code: "hr", label: "克罗地亚语", english: "Croatian" },
        ],
    },
    {
        key: "asia",
        label: "亚洲",
        evidenced: true,
        languages: [
            { code: "zh-CN", label: "简体中文", english: "Simplified Chinese" },
            { code: "zh-TW", label: "繁体中文", english: "Traditional Chinese" },
            { code: "ja", label: "日语", english: "Japanese" },
            { code: "ko", label: "韩语", english: "Korean" },
            { code: "th", label: "泰语", english: "Thai" },
            { code: "vi", label: "越南语", english: "Vietnamese" },
            { code: "ms", label: "马来语", english: "Malay" },
        ],
    },
    {
        key: "south-asia",
        label: "南亚",
        evidenced: false,
        languages: [
            { code: "hi", label: "印地语", english: "Hindi" },
            { code: "bn", label: "孟加拉语", english: "Bengali" },
            { code: "ta", label: "泰米尔语", english: "Tamil" },
            { code: "ur", label: "乌尔都语", english: "Urdu" },
            { code: "id", label: "印尼语", english: "Indonesian" },
            { code: "fil", label: "菲律宾语", english: "Filipino" },
        ],
    },
    {
        key: "middle-east",
        label: "中东",
        evidenced: false,
        languages: [
            { code: "ar", label: "阿拉伯语", english: "Arabic" },
            { code: "he", label: "希伯来语", english: "Hebrew" },
            { code: "fa", label: "波斯语", english: "Persian" },
            { code: "tr", label: "土耳其语", english: "Turkish" },
        ],
    },
    {
        key: "africa",
        label: "非洲",
        evidenced: false,
        languages: [
            { code: "sw", label: "斯瓦希里语", english: "Swahili" },
            { code: "af", label: "南非荷兰语", english: "Afrikaans" },
            { code: "am", label: "阿姆哈拉语", english: "Amharic" },
            { code: "ha", label: "豪萨语", english: "Hausa" },
        ],
    },
];

const TARGET_INDEX = new Map<string, TranslationLanguage>(
    TARGET_LANGUAGE_GROUPS.flatMap((group) => group.languages.map((language) => [language.code, language] as const)),
);
const SOURCE_INDEX = new Map<string, TranslationLanguage>(SOURCE_LANGUAGES.map((language) => [language.code, language] as const));

export function getImageTranslationSpec(): ToolSpec {
    const spec = getToolById(IMAGE_TRANSLATION_TOOL_ID);
    if (!spec) throw new Error("IMAGE_TRANSLATION spec missing from tool registry");
    return spec;
}

/* ------------------------------------------------------------------ *
 * 语言目录
 * ------------------------------------------------------------------ */

export function sourceLanguage(code: string | null | undefined): TranslationLanguage | undefined {
    if (!code) return undefined;
    return SOURCE_INDEX.get(code) ?? TARGET_INDEX.get(code);
}

export function targetLanguage(code: string | null | undefined): TranslationLanguage | undefined {
    if (!code) return undefined;
    return TARGET_INDEX.get(code);
}

export function languageLabel(code: string | null | undefined): string {
    if (!code) return "—";
    if (code === TRANSLATION_AUTO_SOURCE) return "自动识别";
    return targetLanguage(code)?.label ?? sourceLanguage(code)?.label ?? code;
}

/** provider 提示词用的语言英文名；未知代码原样回传，交给上游报错而不是静默降级。 */
export function languageEnglish(code: string): string {
    return targetLanguage(code)?.english ?? sourceLanguage(code)?.english ?? code;
}

export function targetLanguageGroupOf(code: string): TargetLanguageGroup | undefined {
    return TARGET_LANGUAGE_GROUPS.find((group) => group.languages.some((language) => language.code === code));
}

export function isKnownTargetLanguage(code: string): boolean {
    return TARGET_INDEX.has(code);
}

export function groupSelectedCounts(targets: readonly string[]): Array<{ key: string; label: string; selected: number }> {
    return TARGET_LANGUAGE_GROUPS.map((group) => ({
        key: group.key,
        label: group.label,
        selected: group.languages.filter((language) => targets.includes(language.code)).length,
    }));
}

/* ------------------------------------------------------------------ *
 * 值结构
 * ------------------------------------------------------------------ */

export interface TranslationBBox {
    /** 归一化 0..1 的左上角与宽高，来自识别模型或手工标注。 */
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface TranslationBox {
    id: string;
    order: number;
    sourceText: string;
    /** 目标语言 code → 已校对译文；缺失表示该语言还没有译文。 */
    targets: Record<string, string>;
    bbox?: TranslationBBox;
    /** 识别置信度 0..1；手工添加的框没有该字段。 */
    confidence?: number;
    origin: "recognized" | "manual";
}

export interface TranslationImageState {
    assetId: string;
    boxes: TranslationBox[];
    /** 真实识别调用返回的时间；没识别过就是 null（不假装识别过）。 */
    recognizedAt: number | null;
    /** 识别模型返回的原文语言；用户手填/未识别为 null。 */
    detectedLanguage: string | null;
    /** 用户已逐框校对并确认当前译文。 */
    confirmed: boolean;
}

export interface TranslationValues {
    /** 源语言 code，或 `auto`（自动识别）。 */
    sourceLanguage: string;
    targetLanguages: string[];
    images: TranslationImageState[];
    activeAssetId: string | null;
    /** 矩阵里当前校对的目标语言。 */
    activeLanguage: string | null;
}

export function createTranslationValues(overrides: Partial<TranslationValues> = {}): TranslationValues {
    return {
        sourceLanguage: TRANSLATION_AUTO_SOURCE,
        targetLanguages: [],
        images: [],
        activeAssetId: null,
        activeLanguage: null,
        ...overrides,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
}

function clamp01(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return Math.min(1, Math.max(0, value));
}

function parseBBox(value: unknown): TranslationBBox | undefined {
    if (!isRecord(value)) return undefined;
    const x = clamp01(value.x);
    const y = clamp01(value.y);
    const width = clamp01(value.width);
    const height = clamp01(value.height);
    if (x === undefined || y === undefined || width === undefined || height === undefined) return undefined;
    return { x, y, width, height };
}

function parseBox(value: unknown, index: number): TranslationBox | null {
    if (!isRecord(value)) return null;
    const id = text(value.id).trim();
    if (!id) return null;
    const targetsIn = isRecord(value.targets) ? value.targets : {};
    const targets: Record<string, string> = {};
    for (const [code, raw] of Object.entries(targetsIn)) {
        if (!isKnownTargetLanguage(code)) continue;
        if (typeof raw !== "string") continue;
        targets[code] = raw;
    }
    const bbox = parseBBox(value.bbox);
    const confidence = clamp01(value.confidence);
    return {
        id,
        order: typeof value.order === "number" && Number.isFinite(value.order) ? value.order : index,
        sourceText: text(value.sourceText),
        targets,
        origin: value.origin === "manual" ? "manual" : "recognized",
        ...(bbox ? { bbox } : {}),
        ...(confidence === undefined ? {} : { confidence }),
    };
}

/** 草稿/本地状态解析：只保留目录内语言，坏数据丢弃而不是猜。 */
export function parseTranslationValues(raw: unknown): TranslationValues {
    if (!isRecord(raw)) return createTranslationValues();
    const sourceLanguageRaw = text(raw.sourceLanguage, TRANSLATION_AUTO_SOURCE);
    const resolvedSource =
        sourceLanguageRaw === TRANSLATION_AUTO_SOURCE || Boolean(sourceLanguage(sourceLanguageRaw)) ? sourceLanguageRaw : TRANSLATION_AUTO_SOURCE;

    const targetsIn = Array.isArray(raw.targetLanguages) ? raw.targetLanguages : [];
    const targetLanguages = [...new Set(targetsIn.filter((code): code is string => typeof code === "string" && isKnownTargetLanguage(code)))].slice(
        0,
        IMAGE_TRANSLATION_MAX_TARGETS,
    );

    const imagesIn = Array.isArray(raw.images) ? raw.images : [];
    const images: TranslationImageState[] = [];
    const seen = new Set<string>();
    for (const entry of imagesIn) {
        if (!isRecord(entry)) continue;
        const assetId = text(entry.assetId).trim();
        if (!assetId || seen.has(assetId)) continue;
        seen.add(assetId);
        const boxesIn = Array.isArray(entry.boxes) ? entry.boxes : [];
        const boxes = boxesIn
            .map((box, index) => parseBox(box, index))
            .filter((box): box is TranslationBox => box !== null)
            .slice(0, IMAGE_TRANSLATION_MAX_BOXES_PER_IMAGE)
            .map((box, index) => ({ ...box, order: index }));
        const detectedLanguage = text(entry.detectedLanguage) || null;
        images.push({
            assetId,
            boxes,
            recognizedAt: typeof entry.recognizedAt === "number" && Number.isFinite(entry.recognizedAt) ? entry.recognizedAt : null,
            detectedLanguage: detectedLanguage && sourceLanguage(detectedLanguage) ? detectedLanguage : null,
            confirmed: entry.confirmed === true,
        });
    }

    const activeAssetId = text(raw.activeAssetId).trim();
    const activeLanguage = text(raw.activeLanguage).trim();
    return {
        sourceLanguage: resolvedSource,
        targetLanguages,
        images,
        activeAssetId: images.some((image) => image.assetId === activeAssetId) ? activeAssetId : (images[0]?.assetId ?? null),
        activeLanguage: targetLanguages.includes(activeLanguage) ? activeLanguage : (targetLanguages[0] ?? null),
    };
}

/* ------------------------------------------------------------------ *
 * 联动：图片 / 语言 / 文本框
 * ------------------------------------------------------------------ */

let boxSequence = 0;

export function createManualBox(sourceText = ""): TranslationBox {
    boxSequence += 1;
    return {
        id: `box-manual-${Date.now().toString(36)}-${boxSequence.toString(36)}`,
        order: 0,
        sourceText,
        targets: {},
        origin: "manual",
    };
}

/** 上传列表变化只做增删同步：已有图片的文本框与译文一律保留（切换语言/补图都不清空）。 */
export function syncImages(values: TranslationValues, assetIds: readonly string[]): TranslationValues {
    const byId = new Map(values.images.map((image) => [image.assetId, image] as const));
    const images = assetIds.map((assetId) => byId.get(assetId) ?? { assetId, boxes: [], recognizedAt: null, detectedLanguage: null, confirmed: false });
    const activeAssetId = values.activeAssetId && assetIds.includes(values.activeAssetId) ? values.activeAssetId : (assetIds[0] ?? null);
    return { ...values, images, activeAssetId };
}

export function imageStateOf(values: TranslationValues, assetId: string | null | undefined): TranslationImageState | undefined {
    if (!assetId) return undefined;
    return values.images.find((image) => image.assetId === assetId);
}

export function setActiveAsset(values: TranslationValues, assetId: string): TranslationValues {
    return { ...values, activeAssetId: assetId };
}

export function setActiveLanguage(values: TranslationValues, code: string): TranslationValues {
    if (!values.targetLanguages.includes(code)) return values;
    return { ...values, activeLanguage: code };
}

export function setSourceLanguage(values: TranslationValues, code: string): TranslationValues {
    if (code !== TRANSLATION_AUTO_SOURCE && !sourceLanguage(code)) return values;
    return { ...values, sourceLanguage: code };
}

/** 目标语言增删：只动语言列表与选中态，图片/文本框/已有译文全部保留。 */
export function toggleTargetLanguage(values: TranslationValues, code: string): TranslationValues {
    if (!isKnownTargetLanguage(code)) return values;
    if (values.targetLanguages.includes(code)) {
        const targetLanguages = values.targetLanguages.filter((item) => item !== code);
        return {
            ...values,
            targetLanguages,
            activeLanguage: values.activeLanguage === code ? (targetLanguages[0] ?? null) : values.activeLanguage,
        };
    }
    if (values.targetLanguages.length >= IMAGE_TRANSLATION_MAX_TARGETS) return values;
    const targetLanguages = [...values.targetLanguages, code];
    return { ...values, targetLanguages, activeLanguage: values.activeLanguage ?? code };
}

function mapImage(values: TranslationValues, assetId: string, updater: (image: TranslationImageState) => TranslationImageState): TranslationValues {
    let touched = false;
    const images = values.images.map((image) => {
        if (image.assetId !== assetId) return image;
        touched = true;
        return updater(image);
    });
    if (!touched) return values;
    return { ...values, images };
}

function reindex(boxes: Array<Omit<TranslationBox, "order" | "targets"> & { targets?: Record<string, string> }>): TranslationBox[] {
    return boxes.map((box, index) => ({ ...box, order: index, targets: box.targets ?? {} }));
}

/** 识别结果落地：整图文本框一次性替换，并记录识别时间/语言（都来自真实返回）。 */
export function applyRecognition(
    values: TranslationValues,
    assetId: string,
    recognized: readonly Omit<TranslationBox, "order">[],
    meta: { detectedLanguage?: string | null; at?: number } = {},
): TranslationValues {
    const boxes = reindex(recognized.slice(0, IMAGE_TRANSLATION_MAX_BOXES_PER_IMAGE).map((box) => ({ ...box })));
    const detected = meta.detectedLanguage && sourceLanguage(meta.detectedLanguage) ? meta.detectedLanguage : null;
    return mapImage(values, assetId, (image) => ({
        ...image,
        boxes,
        recognizedAt: meta.at ?? Date.now(),
        detectedLanguage: detected,
        confirmed: boxes.length > 0 ? false : image.confirmed,
    }));
}

export function addManualBox(values: TranslationValues, assetId: string, sourceText = ""): TranslationValues {
    return mapImage(values, assetId, (image) => {
        if (image.boxes.length >= IMAGE_TRANSLATION_MAX_BOXES_PER_IMAGE) return image;
        return { ...image, confirmed: false, boxes: reindex([...image.boxes, createManualBox(sourceText)]) };
    });
}

export function updateBoxSourceText(values: TranslationValues, assetId: string, boxId: string, sourceText: string): TranslationValues {
    return mapImage(values, assetId, (image) => ({
        ...image,
        confirmed: false,
        boxes: image.boxes.map((box) => (box.id === boxId ? { ...box, sourceText } : box)),
    }));
}

export function updateBoxTargetText(values: TranslationValues, assetId: string, boxId: string, language: string, targetText: string): TranslationValues {
    if (!isKnownTargetLanguage(language)) return values;
    return mapImage(values, assetId, (image) => ({
        ...image,
        confirmed: false,
        boxes: image.boxes.map((box) => (box.id === boxId ? { ...box, targets: { ...box.targets, [language]: targetText } } : box)),
    }));
}

export function removeBox(values: TranslationValues, assetId: string, boxId: string): TranslationValues {
    return mapImage(values, assetId, (image) => ({
        ...image,
        confirmed: false,
        boxes: reindex(image.boxes.filter((box) => box.id !== boxId)),
    }));
}

export function setImageConfirmed(values: TranslationValues, assetId: string, confirmed: boolean): TranslationValues {
    return mapImage(values, assetId, (image) => ({ ...image, confirmed }));
}

/* ------------------------------------------------------------------ *
 * 校验
 * ------------------------------------------------------------------ */

export type TranslationIssueLevel = "error" | "warning";

export interface TranslationIssue {
    code: string;
    level: TranslationIssueLevel;
    message: string;
    /** 关联的图片/语言，便于页面定位。 */
    assetId?: string;
    language?: string;
    boxId?: string;
}

export function imageCharCount(image: TranslationImageState): number {
    return image.boxes.reduce((total, box) => total + box.sourceText.trim().length, 0);
}

export function missingTargetBoxes(image: TranslationImageState, languages: readonly string[]): Array<{ boxId: string; language: string }> {
    const missing: Array<{ boxId: string; language: string }> = [];
    for (const box of image.boxes) {
        for (const language of languages) {
            if (!(box.targets[language] ?? "").trim()) missing.push({ boxId: box.id, language });
        }
    }
    return missing;
}

export function estimatedOutputCount(imageCount: number, targetCount: number): number {
    return Math.max(0, imageCount) * Math.max(0, targetCount);
}

export function validateTranslationState(input: { assetIds: readonly string[]; values: TranslationValues }): TranslationIssue[] {
    const { assetIds, values } = input;
    const issues: TranslationIssue[] = [];
    const targets = values.targetLanguages;

    if (assetIds.length === 0) {
        issues.push({ code: "no-images", level: "error", message: "先上传需要翻译的图片" });
    }
    if (assetIds.length > IMAGE_TRANSLATION_MAX_IMAGES) {
        issues.push({ code: "image-limit", level: "error", message: `单批最多 ${IMAGE_TRANSLATION_MAX_IMAGES} 张图片（当前 ${assetIds.length} 张）` });
    }
    if (targets.length === 0) {
        issues.push({ code: "no-target", level: "error", message: "至少选择一个目标语言" });
    }
    if (values.sourceLanguage !== TRANSLATION_AUTO_SOURCE) {
        const same = targets.filter((code) => code === values.sourceLanguage);
        if (same.length === targets.length && targets.length > 0) {
            issues.push({
                code: "same-language",
                level: "error",
                message: `源语言与目标语言相同（${languageLabel(values.sourceLanguage)}），请更换目标语言`,
                language: values.sourceLanguage,
            });
        } else if (same.length > 0) {
            issues.push({
                code: "same-language-partial",
                level: "warning",
                message: `目标语言包含源语言 ${languageLabel(values.sourceLanguage)}，这一路输出不会发生变化`,
                language: values.sourceLanguage,
            });
        }
    }

    for (const assetId of assetIds) {
        const image = imageStateOf(values, assetId);
        if (!image) {
            issues.push({ code: "no-text-box", level: "error", message: "这张图片还没有文字框，请识别或手工添加", assetId });
            continue;
        }
        if (values.sourceLanguage !== TRANSLATION_AUTO_SOURCE && image.detectedLanguage && image.detectedLanguage !== values.sourceLanguage) {
            issues.push({
                code: "source-language-mismatch",
                level: "warning",
                message: `识别到的语言是 ${languageLabel(image.detectedLanguage)}，与所选源语言 ${languageLabel(values.sourceLanguage)} 不一致`,
                assetId,
                language: image.detectedLanguage,
            });
        }
        if (image.boxes.length === 0) {
            issues.push({ code: "no-text-box", level: "error", message: "这张图片还没有文字框，请识别或手工添加", assetId });
            continue;
        }
        const chars = imageCharCount(image);
        if (chars > IMAGE_TRANSLATION_MAX_TEXT_CHARS) {
            issues.push({
                code: "text-too-long",
                level: "error",
                message: `单图文字 ${chars} 字，超过 ${IMAGE_TRANSLATION_MAX_TEXT_CHARS} 字上限`,
                assetId,
            });
        }
        const emptySource = image.boxes.filter((box) => !box.sourceText.trim());
        if (emptySource.length > 0) {
            issues.push({ code: "empty-source-text", level: "error", message: `有 ${emptySource.length} 个文字框缺少原文`, assetId, boxId: emptySource[0].id });
        }
        const missing = missingTargetBoxes(image, targets);
        if (missing.length > 0) {
            issues.push({
                code: "missing-target-text",
                level: "error",
                message: `${missing.length} 个文字框缺少译文（含 ${languageLabel(missing[0].language)}）`,
                assetId,
                language: missing[0].language,
                boxId: missing[0].boxId,
            });
        }
        if (!image.confirmed) {
            issues.push({ code: "unconfirmed", level: "error", message: "请逐框校对后点“确认本图译文”，再批量应用", assetId });
        }
    }

    return issues;
}

export function blockingIssues(issues: readonly TranslationIssue[]): TranslationIssue[] {
    return issues.filter((issue) => issue.level === "error");
}

/* ------------------------------------------------------------------ *
 * 快照
 * ------------------------------------------------------------------ */

export function canonicalize(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
    if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

/** FNV-1a 32 位，只用于快照比对，不用于安全场景。 */
export function stableHash(text: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

export interface TranslationSnapshotBox {
    id: string;
    sourceText: string;
    targets: Record<string, string>;
}

export interface TranslationSnapshotImage {
    assetId: string;
    name?: string;
    detectedLanguage: string | null;
    boxes: TranslationSnapshotBox[];
}

export interface TranslationSnapshot {
    hash: string;
    capturedAt: number;
    sourceLanguage: string;
    targetLanguages: string[];
    images: TranslationSnapshotImage[];
    outputCount: number;
}

export function buildTranslationSnapshot(input: {
    assetIds: readonly string[];
    values: TranslationValues;
    imageNames?: Readonly<Record<string, string>>;
    at?: number;
}): TranslationSnapshot {
    const { assetIds, values } = input;
    const images: TranslationSnapshotImage[] = assetIds.map((assetId) => {
        const state = imageStateOf(values, assetId);
        return {
            assetId,
            name: input.imageNames?.[assetId],
            detectedLanguage: state?.detectedLanguage ?? null,
            boxes: (state?.boxes ?? []).map((box) => ({
                id: box.id,
                sourceText: box.sourceText.trim(),
                targets: Object.fromEntries(values.targetLanguages.map((code) => [code, (box.targets[code] ?? "").trim()])),
            })),
        };
    });
    const payload = {
        sourceLanguage: values.sourceLanguage,
        targetLanguages: [...values.targetLanguages],
        images,
        outputCount: estimatedOutputCount(assetIds.length, values.targetLanguages.length),
    };
    return {
        hash: stableHash(canonicalize(payload)),
        capturedAt: input.at ?? Date.now(),
        ...payload,
    };
}

export function snapshotMatchesHash(snapshot: TranslationSnapshot, hash: string | undefined | null): boolean {
    return Boolean(hash) && snapshot.hash === hash;
}

/** 图片/语言/原文/译文任一变更都算偏离快照，旧结果要标“来自旧版本”。 */
export function isSnapshotStale(current: TranslationSnapshot, resultHash: string | undefined | null): boolean {
    return !snapshotMatchesHash(current, resultHash);
}

/* ------------------------------------------------------------------ *
 * 单元与矩阵
 * ------------------------------------------------------------------ */

export function translationUnitId(assetId: string, language: string): string {
    return `${assetId}::${language}`;
}

export interface TranslationCell {
    unitId: string;
    assetId: string;
    language: string;
    languageLabel: string;
}

/** 原图 × 目标语言矩阵：一个语言一个单元，新增语言就多一列输出。 */
export function plannedCells(assetIds: readonly string[], languages: readonly string[]): TranslationCell[] {
    return assetIds.flatMap((assetId) =>
        languages.map((language) => ({
            unitId: translationUnitId(assetId, language),
            assetId,
            language,
            languageLabel: languageLabel(language),
        })),
    );
}

export function matrixColumns(languages: readonly string[]): Array<{ code: string; label: string }> {
    return languages.map((code) => ({ code, label: languageLabel(code) }));
}
