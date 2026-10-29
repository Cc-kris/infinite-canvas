/**
 * IMAGE_TRANSLATION 适配器：把「源图 × 目标语言」拆成可独立重试的最小请求单元，
 * 并给出真实运行端口（视觉识别 / 文本翻译 / 图像生成）。
 *
 * 真话边界（不接受"演示成功"）：
 *  - 文字框只能来自真实识别调用（`transcribeImage` → 用户配置的视觉模型）或用户手工录入，
 *    识别失败/空结果直接抛错或返回空数组，由页面提示"未识别到文字"，绝不编造文字；
 *  - 逐框译文来自真实翻译调用（`translateBoxes`），缺条目即失败，不做猜测补全；
 *  - 图像翻译走共享 TaskGateway（`useToolTaskStore.runTool`），空结果判失败；
 *  - 结果携带 snapshotHash，输入一变即标"来自旧版本"。
 *
 * 证据：docs/V1.0/plan_linkfox_navigation/page-specs/04-image-translation.md
 *  - §3 目标语言每增一个即增加一路输出；失败只失败对应单元
 *  - §4 逐语言检查文字与排版；任务提交后锁定快照
 *  - §7 `imageSegUrl`（AI 主体分割）本仓库暂无分割服务 → 不填该字段（不伪造 URL），
 *       已在 report.md 记录为集成缺口。
 */

import type { ToolAssetRecord } from "@/services/api/tools/assets";
import type { BrowserToolInput, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
import type { ReferenceImage } from "@/types/image";

import {
    IMAGE_TRANSLATION_CONCURRENCY,
    IMAGE_TRANSLATION_MAX_TEXT_CHARS,
    IMAGE_TRANSLATION_TOOL_ID,
    buildTranslationSnapshot,
    canonicalize,
    estimatedOutputCount,
    languageEnglish,
    languageLabel,
    stableHash,
    translationUnitId,
    type TranslationBox,
    type TranslationImageState,
    type TranslationSnapshot,
    type TranslationValues,
} from "../registry/image-translation";

/* ------------------------------------------------------------------ *
 * 端口（默认实现：真实 provider；测试注入假端口）
 * ------------------------------------------------------------------ */

export type TranslationChatContent = Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

export type TranslationChatMessage = {
    role: "system" | "user" | "assistant";
    content: string | TranslationChatContent;
};

/** 文本/视觉问答端口。默认实现走 `requestImageQuestion`（用户当前配置的模型）。 */
export interface TranslationTextPort {
    ask(messages: TranslationChatMessage[], options?: { signal?: AbortSignal }): Promise<string>;
}

export interface TranslationRunPort {
    run(input: BrowserToolInput, options?: WaitOptions): Promise<ToolTask>;
}

/** 真实文本端口：动态导入，避免测试环境拉起 axios/配置存储。 */
export function createModelTextPort(): TranslationTextPort {
    return {
        async ask(messages, options) {
            const [{ requestImageQuestion }, { useConfigStore }] = await Promise.all([
                import("@/services/api/image"),
                import("@/stores/use-config-store"),
            ]);
            const config = useConfigStore.getState().config;
            /**
             * 识别/翻译都是「问答」请求，必须走文本模型。
             * `requestImageQuestion` 取的是 `config.model`（图像模型，如 gpt-image-2），
             * 图像模型不回答这类请求，上游直接返回 `Upstream request failed`，
             * 于是「识别文字」100% 失败、历史坞永远是 0 条。这里显式指定 textModel。
             */
            const textModel = config.textModel?.trim();
            const requestConfig = textModel && textModel !== config.model ? { ...config, model: textModel } : config;
            return requestImageQuestion(requestConfig, messages as never, () => {}, { signal: options?.signal });
        },
    };
}

export function createTaskStoreRunPort(): TranslationRunPort {
    return {
        async run(input, options) {
            const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
            return useToolTaskStore.getState().runTool(input, options);
        },
    };
}

/* ------------------------------------------------------------------ *
 * 识别（OCR）真实链路
 * ------------------------------------------------------------------ */

export interface RecognizedBox {
    id: string;
    sourceText: string;
    bbox?: { x: number; y: number; width: number; height: number };
    confidence?: number;
}

export interface RecognitionResult {
    boxes: RecognizedBox[];
    detectedLanguage: string | null;
}

export const RECOGNITION_SYSTEM_PROMPT = "你是电商图片文字识别引擎。只输出 JSON，不写解释、不写 Markdown。";

export function buildRecognitionPrompt(options: { sourceLanguage?: string } = {}): string {
    const hint =
        options.sourceLanguage && options.sourceLanguage !== "auto" ? `图中文字以 ${languageEnglish(options.sourceLanguage)} 为主，仍需逐条识别。` : "自动判断图中文字的语言。";
    return [
        "识别这张电商图片里所有需要翻译的文字（标题、卖点、标签、参数、角标等）。",
        hint,
        "按阅读顺序（从上到下、从左到右）输出 JSON 对象：",
        '{"language":"原文字母的 ISO 代码，如 zh-CN/en/ja","boxes":[{"text":"原文","box":[x,y,w,h],"confidence":0.98}]}',
        "box 是相对图片宽高的 0–1 比例，x/y 为左上角，w/h 为宽高；无法确定位置时省略 box。",
        `只识别可见文字，不要补全、不要翻译、不要臆造；总字数需 ≤ ${IMAGE_TRANSLATION_MAX_TEXT_CHARS}。`,
    ].join("\n");
}

function stripCodeFence(raw: string): string {
    const trimmed = raw.trim();
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return (fence ? fence[1] : trimmed).trim();
}

function extractJson(raw: string): unknown {
    const body = stripCodeFence(raw);
    const candidates = [body];
    const firstBrace = body.indexOf("{");
    const firstBracket = body.indexOf("[");
    const start = [firstBrace, firstBracket].filter((index) => index >= 0).sort((a, b) => a - b)[0];
    if (start !== undefined && start > 0) candidates.push(body.slice(start));
    if (start !== undefined) {
        const last = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
        if (last > start) candidates.push(body.slice(start, last + 1));
    }
    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch {
            continue;
        }
    }
    throw new Error("识别结果不是有效 JSON，请检查模型是否支持视觉输入后重试");
}

function clampRatio(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return Math.min(1, Math.max(0, value));
}

function parseBoxRect(value: unknown): RecognizedBox["bbox"] {
    if (!Array.isArray(value) || value.length !== 4) return undefined;
    const [x, y, width, height] = value.map(clampRatio);
    if (x === undefined || y === undefined || width === undefined || height === undefined) return undefined;
    return { x, y, width, height };
}

/** 识别结果解析：结构不符即抛错（不静默降级成空结果，避免"看似成功但没识别"）。 */
export function parseRecognitionPayload(raw: string): RecognitionResult {
    const payload = extractJson(raw);
    const boxesIn = Array.isArray(payload) ? payload : typeof payload === "object" && payload !== null && Array.isArray((payload as { boxes?: unknown }).boxes) ? (payload as { boxes: unknown[] }).boxes : null;
    if (!boxesIn) throw new Error("识别结果缺少 boxes 数组，无法进入逐框校对");
    const languageRaw = Array.isArray(payload) ? null : (payload as { language?: unknown }).language;
    const detectedLanguage = typeof languageRaw === "string" && languageRaw.trim() ? languageRaw.trim() : null;

    const boxes: RecognizedBox[] = [];
    boxesIn.forEach((entry, index) => {
        if (typeof entry !== "object" || entry === null) return;
        const record = entry as Record<string, unknown>;
        const text = typeof record.text === "string" ? record.text.trim() : "";
        if (!text) return;
        const bbox = parseBoxRect(record.box ?? record.bbox ?? record.rect);
        const confidence = clampRatio(record.confidence);
        boxes.push({
            id: `box-ocr-${index + 1}-${stableHash(`${text}|${index}`)}`,
            sourceText: text,
            ...(bbox ? { bbox } : {}),
            ...(confidence === undefined ? {} : { confidence }),
        });
    });
    return { boxes, detectedLanguage };
}

/** 真实识别：一次视觉问答，解析为逐框原文。空结果原样返回，由页面提示而非伪造。 */
export async function transcribeImage(
    port: TranslationTextPort,
    input: { imageUrl: string; sourceLanguage?: string; signal?: AbortSignal },
): Promise<RecognitionResult> {
    if (!input.imageUrl) throw new Error("缺少可读取的图片地址，无法识别文字");
    const answer = await port.ask(
        [
            { role: "system", content: RECOGNITION_SYSTEM_PROMPT },
            {
                role: "user",
                content: [
                    { type: "text", text: buildRecognitionPrompt({ sourceLanguage: input.sourceLanguage }) },
                    { type: "image_url", image_url: { url: input.imageUrl } },
                ],
            },
        ],
        { signal: input.signal },
    );
    return parseRecognitionPayload(answer);
}

/* ------------------------------------------------------------------ *
 * 逐框翻译真实链路
 * ------------------------------------------------------------------ */

export const TRANSLATION_SYSTEM_PROMPT = "你是电商图片文案翻译引擎。只输出 JSON 数组，不写解释、不写 Markdown。";

export function buildBoxTranslationPrompt(input: { sourceLanguage: string; targetLanguage: string; texts: Array<{ id: string; text: string }> }): string {
    const source = !input.sourceLanguage || input.sourceLanguage === "auto" ? "自动识别的原文" : languageEnglish(input.sourceLanguage);
    const target = `${languageEnglish(input.targetLanguage)}（${languageLabel(input.targetLanguage)}）`;
    return [
        `把下列电商图片文案从 ${source} 翻译成 ${target}。`,
        "要求：保持原意与卖点，术语/单位/型号/品牌不译错，长度尽量贴近原文，不添加解释。",
        "逐条对应输出 JSON 数组，元素为 {\"id\":\"原 id\",\"text\":\"译文\"}，id 必须与输入一一对应，不得增删条目。",
        "输入：",
        canonicalize(input.texts),
    ].join("\n");
}

/** 翻译结果解析：缺少任一条目即抛错（提示该语言失败，可单列重试），不猜测补全。 */
export function parseBoxTranslationPayload(raw: string, expectedIds: readonly string[]): Record<string, string> {
    const payload = extractJson(raw);
    const list = Array.isArray(payload) ? payload : [];
    const result: Record<string, string> = {};
    for (const entry of list) {
        if (typeof entry !== "object" || entry === null) continue;
        const record = entry as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id : "";
        const text = typeof record.text === "string" ? record.text.trim() : "";
        if (!id || !text || !expectedIds.includes(id)) continue;
        result[id] = text;
    }
    const missing = expectedIds.filter((id) => !result[id]);
    if (missing.length > 0) throw new Error(`翻译结果缺少 ${missing.length} 条文案（${missing.slice(0, 3).join(", ")}），请重试该语言`);
    return result;
}

export async function translateBoxes(
    port: TranslationTextPort,
    input: { sourceLanguage: string; targetLanguage: string; boxes: TranslationBox[]; signal?: AbortSignal },
): Promise<Record<string, string>> {
    const texts = input.boxes.map((box) => ({ id: box.id, text: box.sourceText.trim() })).filter((entry) => entry.text);
    if (texts.length === 0) throw new Error("这张图片还没有可翻译的原文");
    const answer = await port.ask(
        [
            { role: "system", content: TRANSLATION_SYSTEM_PROMPT },
            { role: "user", content: buildBoxTranslationPrompt({ ...input, texts }) },
        ],
        { signal: input.signal },
    );
    return parseBoxTranslationPayload(
        answer,
        texts.map((entry) => entry.id),
    );
}

/* ------------------------------------------------------------------ *
 * 图像翻译请求单元：源图 × 目标语言
 * ------------------------------------------------------------------ */

export interface TranslationImageInput {
    assetId: string;
    name: string;
    reference: ReferenceImage;
}

export interface TranslationUnit {
    unitId: string;
    assetId: string;
    imageName: string;
    language: string;
    languageName: string;
    prompt: string;
    references: ReferenceImage[];
    fields: Record<string, unknown>;
    snapshotHash: string;
    /** 该单元携带的逐框译文（来自已确认校对），用于快照/审计。 */
    texts: Array<{ source: string; target: string }>;
}

export function toReference(record: ToolAssetRecord): ReferenceImage {
    return {
        id: record.id,
        name: record.name,
        type: record.mimeType || "image/png",
        dataUrl: record.url,
        url: record.url,
        storageKey: record.storageKey,
    };
}

export function buildTranslationImages(records: ToolAssetRecord[], assetIds?: readonly string[]): TranslationImageInput[] {
    const byId = new Map(records.map((record) => [record.id, record] as const));
    const ordered = assetIds ? assetIds.map((id) => byId.get(id)).filter((record): record is ToolAssetRecord => Boolean(record)) : records;
    return ordered.map((record) => ({
        assetId: record.id,
        name: record.name || "未命名图片",
        reference: toReference(record),
    }));
}

/** 单张图在单一路目标语言下的提示词：把已确认译文逐条落到版式上。 */
export function composeTranslationPrompt(input: { imageName: string; language: string; texts: Array<{ source: string; target: string }> }): string {
    const target = `${languageEnglish(input.language)}（${languageLabel(input.language)}）`;
    const lines = input.texts.map((entry, index) => `${index + 1}. “${entry.source}” → “${entry.target}”`);
    return [
        `把这张电商图片内的全部文字翻译为 ${target}，并保持原有版式。`,
        "版式要求：文字块位置、字号层级、字重、颜色、对齐与留白保持原样；文字不遮挡商品主体、不溢出画面；不新增、不遗漏任何文字。",
        "逐条替换（原文 → 译文），必须一字不差地使用给定译文：",
        ...lines,
        "若个别文字在原图中不可见，忽略该条；不要臆造新文案，不要改动图片中的商品本身。",
        `图片：${input.imageName}`,
    ].join("\n");
}

export function buildTranslationUnits(input: {
    images: TranslationImageInput[];
    values: TranslationValues;
    snapshotHash: string;
    /** §7：任务需带草稿版本、源资产集合与客户端幂等号，便于审计与去重。 */
    meta?: { draftRevision?: number; sourceAssetIds?: readonly string[]; clientOperationId?: string };
}): TranslationUnit[] {
    const targets = input.values.targetLanguages;
    /** 原站默认不选原文语言：未选时由识别结果决定，提示词侧按「自动识别」处理。 */
    const sourceLanguage = input.values.sourceLanguage;
    const units: TranslationUnit[] = [];
    const meta = input.meta ?? {};
    for (const image of input.images) {
        const state = input.values.images.find((item) => item.assetId === image.assetId);
        for (const language of targets) {
            const texts = (state?.boxes ?? [])
                .map((box) => ({ source: box.sourceText.trim(), target: (box.targets[language] ?? "").trim() }))
                .filter((entry) => entry.source);
            units.push({
                unitId: translationUnitId(image.assetId, language),
                assetId: image.assetId,
                imageName: image.name,
                language,
                languageName: languageLabel(language),
                prompt: composeTranslationPrompt({ imageName: image.name, language, texts }),
                references: [image.reference],
                fields: {
                    imageName: image.name,
                    imageUrl: image.reference.url ?? image.reference.dataUrl,
                    sourceLanguage,
                    targetLanguage: language,
                    draftRevision: meta.draftRevision ?? null,
                    clientOperationId: meta.clientOperationId ?? null,
                    sourceAssetIds: meta.sourceAssetIds ?? input.images.map((item) => item.assetId),
                    configSnapshot: {
                        hash: input.snapshotHash,
                        sourceLanguage,
                        targetLanguages: [...targets],
                    },
                },
                snapshotHash: input.snapshotHash,
                texts,
            });
        }
    }
    return units;
}

export function buildUnitInput(unit: TranslationUnit): BrowserToolInput {
    return {
        toolId: IMAGE_TRANSLATION_TOOL_ID,
        prompt: unit.prompt,
        references: unit.references,
        count: 1,
        fields: unit.fields,
    };
}

/* ------------------------------------------------------------------ *
 * 结果与运行
 * ------------------------------------------------------------------ */

export type TranslationUnitStatus = "succeeded" | "failed" | "unknown" | "cancelled";

export interface TranslationUnitOutcome {
    unitId: string;
    assetId: string;
    language: string;
    status: TranslationUnitStatus;
    snapshotHash: string;
    taskId?: string;
    image?: { dataUrl?: string; url?: string; mimeType?: string };
    error?: { code: string; message: string; retryable?: boolean };
}

export function mapTaskToOutcome(unit: TranslationUnit, task: ToolTask): TranslationUnitOutcome {
    const base = {
        unitId: unit.unitId,
        assetId: unit.assetId,
        language: unit.language,
        snapshotHash: unit.snapshotHash,
        taskId: task.id,
    };
    const firstImage = task.result?.items.find((item: ToolTaskResultItem) => item.kind === "image" && (item.dataUrl || item.url));
    if (task.status === "succeeded") {
        if (!firstImage) {
            return { ...base, status: "failed", error: { code: "empty-result", message: "上游返回成功但没有图片结果", retryable: true } };
        }
        return { ...base, status: "succeeded", image: { dataUrl: firstImage.dataUrl, url: firstImage.url, mimeType: firstImage.mimeType } };
    }
    if (task.status === "failed") {
        return {
            ...base,
            status: "failed",
            error: task.error
                ? { code: task.error.code, message: task.error.message, retryable: task.error.retryable }
                : { code: "task-failed", message: "任务失败（上游未给出原因）", retryable: true },
        };
    }
    if (task.status === "cancelled") {
        return { ...base, status: "cancelled", error: { code: "cancelled", message: "已取消，结果未生成", retryable: false } };
    }
    return { ...base, status: "unknown", error: { code: "unknown", message: "结果未确认，先查询任务再决定是否重试", retryable: false } };
}

export interface RunTranslationOptions {
    port: TranslationRunPort;
    concurrency?: number;
    signal?: AbortSignal;
    onOutcome?: (outcome: TranslationUnitOutcome, unit: TranslationUnit, completed: number, total: number) => void;
}

/** 并发跑图×语言单元；单单元失败不影响其它单元，取消后剩余单元标 cancelled。 */
export async function runTranslationUnits(units: readonly TranslationUnit[], options: RunTranslationOptions): Promise<TranslationUnitOutcome[]> {
    const concurrency = Math.max(1, Math.min(6, Math.floor(options.concurrency ?? IMAGE_TRANSLATION_CONCURRENCY)));
    const outcomes: TranslationUnitOutcome[] = new Array(units.length);
    let cursor = 0;
    let completed = 0;

    const worker = async () => {
        for (;;) {
            const index = cursor;
            cursor += 1;
            if (index >= units.length) return;
            const unit = units[index];
            if (options.signal?.aborted) {
                outcomes[index] = {
                    unitId: unit.unitId,
                    assetId: unit.assetId,
                    language: unit.language,
                    status: "cancelled",
                    snapshotHash: unit.snapshotHash,
                    error: { code: "aborted", message: "已取消，任务未提交", retryable: false },
                };
                continue;
            }
            let outcome: TranslationUnitOutcome;
            try {
                const task = await options.port.run(buildUnitInput(unit), { signal: options.signal });
                outcome = mapTaskToOutcome(unit, task);
            } catch (error) {
                outcome = {
                    unitId: unit.unitId,
                    assetId: unit.assetId,
                    language: unit.language,
                    status: "failed",
                    snapshotHash: unit.snapshotHash,
                    error: { code: "run-threw", message: error instanceof Error ? error.message : String(error), retryable: true },
                };
            }
            outcomes[index] = outcome;
            completed += 1;
            options.onOutcome?.(outcome, unit, completed, units.length);
        }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(units.length, 1)) }, () => worker()));
    return outcomes;
}

export function retryableUnits(units: readonly TranslationUnit[], outcomes: readonly TranslationUnitOutcome[]): TranslationUnit[] {
    const byId = new Map(outcomes.map((outcome) => [outcome.unitId, outcome] as const));
    return units.filter((unit) => {
        const outcome = byId.get(unit.unitId);
        return !outcome || outcome.status === "failed" || outcome.status === "unknown";
    });
}

export function mergeOutcomes(previous: readonly TranslationUnitOutcome[], next: readonly TranslationUnitOutcome[]): TranslationUnitOutcome[] {
    const merged = new Map(previous.map((outcome) => [outcome.unitId, outcome] as const));
    for (const outcome of next) merged.set(outcome.unitId, outcome);
    return [...merged.values()];
}

export interface LanguageSummaryRow {
    language: string;
    label: string;
    total: number;
    succeeded: number;
    failed: number;
    unknown: number;
    cancelled: number;
}

/** 逐语言汇总：结果区按语言列展示进度/失败数。 */
export function summarizeByLanguage(languages: readonly string[], outcomes: readonly TranslationUnitOutcome[]): LanguageSummaryRow[] {
    return languages.map((language) => {
        const rows = outcomes.filter((outcome) => outcome.language === language);
        return {
            language,
            label: languageLabel(language),
            total: rows.length,
            succeeded: rows.filter((row) => row.status === "succeeded").length,
            failed: rows.filter((row) => row.status === "failed").length,
            unknown: rows.filter((row) => row.status === "unknown").length,
            cancelled: rows.filter((row) => row.status === "cancelled").length,
        };
    });
}

export function outcomeOf(outcomes: readonly TranslationUnitOutcome[], assetId: string, language: string): TranslationUnitOutcome | undefined {
    return outcomes.find((outcome) => outcome.assetId === assetId && outcome.language === language);
}

/** 快照 + 单元一次性构建，供页面提交时锁定本次配置。 */
export function prepareTranslationRun(input: {
    records: ToolAssetRecord[];
    assetIds: readonly string[];
    values: TranslationValues;
    imageNames?: Readonly<Record<string, string>>;
    at?: number;
    draftRevision?: number;
    clientOperationId?: string;
}): { snapshot: TranslationSnapshot; units: TranslationUnit[]; outputCount: number } {
    const snapshot = buildTranslationSnapshot({ assetIds: input.assetIds, values: input.values, imageNames: input.imageNames, at: input.at });
    const images = buildTranslationImages(input.records, input.assetIds);
    const units = buildTranslationUnits({
        images,
        values: input.values,
        snapshotHash: snapshot.hash,
        meta: {
            ...(input.draftRevision === undefined ? {} : { draftRevision: input.draftRevision }),
            sourceAssetIds: input.assetIds,
            ...(input.clientOperationId ? { clientOperationId: input.clientOperationId } : {}),
        },
    });
    return { snapshot, units, outputCount: estimatedOutputCount(input.assetIds.length, input.values.targetLanguages.length) };
}

/** 译文完整性审计（只看每个目标语言是否有译文，不要求“已确认”）——“确认译文”动作的前置校验。 */
export function auditTranslations(state: TranslationImageState | undefined, languages: readonly string[]): { ok: boolean; reason?: string } {
    if (!state) return { ok: false, reason: "这张图片还没有文字框" };
    if (state.boxes.length === 0) return { ok: false, reason: "这张图片还没有文字框" };
    for (const box of state.boxes) {
        for (const language of languages) {
            if (!(box.targets[language] ?? "").trim()) return { ok: false, reason: `${languageLabel(language)} 还缺译文` };
        }
    }
    return { ok: true };
}

/** 确认状态审计：有图片未确认/译文缺失就不允许批量应用（对应 §4「逐语言检查文字与排版」）。 */
export function auditConfirmed(state: TranslationImageState | undefined, languages: readonly string[]): { ok: boolean; reason?: string } {
    if (!state) return { ok: false, reason: "这张图片还没有文字框" };
    if (state.boxes.length === 0) return { ok: false, reason: "这张图片还没有文字框" };
    if (!state.confirmed) return { ok: false, reason: "还没有确认译文" };
    return auditTranslations(state, languages);
}
