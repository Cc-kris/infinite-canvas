import { describe, expect, test } from "bun:test";

import type { ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask } from "@/services/api/tools/task-machine";

import {
    IMAGE_TRANSLATION_DRAFT_KEY,
    IMAGE_TRANSLATION_MAX_TARGETS,
    IMAGE_TRANSLATION_MAX_TEXT_CHARS,
    IMAGE_TRANSLATION_ROUTE,
    SOURCE_LANGUAGES,
    TARGET_LANGUAGE_GROUPS,
    TRANSLATION_AUTO_SOURCE,
    addManualBox,
    applyRecognition,
    buildTranslationSnapshot,
    createTranslationValues,
    estimatedOutputCount,
    getImageTranslationSpec,
    groupSelectedCounts,
    imageCharCount,
    isKnownTargetLanguage,
    languageLabel,
    parseTranslationValues,
    plannedCells,
    removeBox,
    setImageConfirmed,
    setSourceLanguage,
    syncImages,
    toggleTargetLanguage,
    updateBoxSourceText,
    updateBoxTargetText,
    validateTranslationState,
    blockingIssues,
    type TranslationValues,
} from "../registry/image-translation";
import {
    buildBoxTranslationPrompt,
    buildRecognitionPrompt,
    buildTranslationUnits,
    composeTranslationPrompt,
    mapTaskToOutcome,
    mergeOutcomes,
    outcomeOf,
    parseBoxTranslationPayload,
    parseRecognitionPayload,
    prepareTranslationRun,
    retryableUnits,
    runTranslationUnits,
    summarizeByLanguage,
    transcribeImage,
    translateBoxes,
    auditConfirmed,
    auditTranslations,
    type TranslationRunPort,
    type TranslationTextPort,
    type TranslationUnit,
} from "./image-translation";

function record(id: string, name = `${id}.png`): ToolAssetRecord {
    return {
        id,
        kind: "image",
        name,
        storageKey: `blob-${id}`,
        url: `data:image/png;base64,${id}`,
        bytes: 1024,
        mimeType: "image/png",
        createdAt: new Date(0).toISOString(),
        origin: "local",
    };
}

function valuesWithBoxes(options: { targets?: string[]; sourceText?: string; translations?: Record<string, string> } = {}): TranslationValues {
    const targets = options.targets ?? ["en"];
    const sourceText = options.sourceText ?? "夏季新款纯棉短袖";
    let values = createTranslationValues({ targetLanguages: targets, images: [] });
    values = syncImages(values, ["asset-a"]);
    values = applyRecognition(
        values,
        "asset-a",
        [{ id: "box-1", sourceText, targets: options.translations ?? {}, origin: "recognized" }],
        { detectedLanguage: "zh-CN", at: 1_700_000_000_000 },
    );
    return values;
}

function task(overrides: Partial<ToolTask> = {}): ToolTask {
    return {
        id: "task-1",
        toolId: "IMAGE_TRANSLATION",
        status: "succeeded",
        createdAt: 0,
        updatedAt: 0,
        ...overrides,
    } as ToolTask;
}

/* ------------------------------------------------------------------ *
 * 页面契约
 * ------------------------------------------------------------------ */

describe("registry · IMAGE_TRANSLATION 契约", () => {
    test("路由/slug/makeType 与页面规格一致", () => {
        const spec = getImageTranslationSpec();
        expect(spec.slug).toBe("image-translation");
        expect(spec.route).toBe(IMAGE_TRANSLATION_ROUTE);
        expect(IMAGE_TRANSLATION_ROUTE).toBe("/tools/ecommerce-suite/image-translation");
        expect(spec.layout).toBe("translate");
        expect(spec.makeType).toBe(45);
        expect(spec.adapter).toBe("image");
        expect(spec.batchCapable).toBe(true);
        expect(IMAGE_TRANSLATION_DRAFT_KEY).toBe("tool-draft:v1:IMAGE_TRANSLATION");
    });

    test("源语言目录覆盖规格列出的 10 种语言", () => {
        const labels = SOURCE_LANGUAGES.map((language) => language.label);
        for (const label of ["中文", "英语", "繁体中文", "西班牙语", "日语", "韩语", "葡萄牙语", "德语", "罗马尼亚语", "俄语", "越南语"]) {
            expect(labels).toContain(label);
        }
    });

    test("目标语言按 欧美/亚洲/南亚/中东/非洲 分组且都有语言", () => {
        const keys = TARGET_LANGUAGE_GROUPS.map((group) => group.key);
        expect(keys).toEqual(["europe-america", "asia", "south-asia", "middle-east", "africa"]);
        for (const group of TARGET_LANGUAGE_GROUPS) {
            expect(group.languages.length).toBeGreaterThan(0);
            expect(group.languages.every((language) => isKnownTargetLanguage(language.code))).toBe(true);
        }
    });

    test("语言标签可读，未知 code 原样返回", () => {
        expect(languageLabel("en")).toBe("英语");
        expect(languageLabel("zh-TW")).toBe("繁体中文");
        expect(languageLabel("xx-unknown")).toBe("xx-unknown");
    });
});

/* ------------------------------------------------------------------ *
 * 状态编辑
 * ------------------------------------------------------------------ */

describe("registry · 状态编辑", () => {
    test("syncImages 保留已识别文字框并补新图", () => {
        const before = valuesWithBoxes({ translations: { en: "summer tee" } });
        const after = syncImages(before, ["asset-a", "asset-b"]);
        expect(after.images).toHaveLength(2);
        expect(after.images[0].boxes).toHaveLength(1);
        expect(after.images[0].boxes[0].targets.en).toBe("summer tee");
        expect(after.images[1].boxes).toHaveLength(0);
        expect(after.activeAssetId).toBe("asset-a");
    });

    test("applyRecognition 记录识别时间/语言并重置确认", () => {
        let values = syncImages(createTranslationValues(), ["asset-a"]);
        values = applyRecognition(values, "asset-a", [{ id: "b1", sourceText: "原价 99", targets: {}, origin: "recognized" }], {
            detectedLanguage: "zh-CN",
            at: 123,
        });
        const image = values.images[0];
        expect(image.recognizedAt).toBe(123);
        expect(image.detectedLanguage).toBe("zh-CN");
        expect(image.confirmed).toBe(false);
        expect(image.boxes[0].order).toBe(0);
    });

    test("识别语言不在源语言目录时置空，不猜", () => {
        let values = syncImages(createTranslationValues(), ["asset-a"]);
        values = applyRecognition(values, "asset-a", [{ id: "b1", sourceText: "x", targets: {}, origin: "recognized" }], { detectedLanguage: "klingon" });
        expect(values.images[0].detectedLanguage).toBeNull();
    });

    test("切换目标语言不清空图片与文字框", () => {
        const before = valuesWithBoxes({ targets: ["en"] });
        const after = toggleTargetLanguage(before, "ja");
        expect(after.targetLanguages).toEqual(["en", "ja"]);
        expect(after.images[0].boxes).toHaveLength(1);
        expect(toggleTargetLanguage(after, "en").targetLanguages).toEqual(["ja"]);
    });

    test("目标语言数量受上限约束", () => {
        let values = createTranslationValues();
        for (const code of ["en", "ja", "ko", "de", "fr", "es", "pt", "ru", "vi", "th"]) values = toggleTargetLanguage(values, code);
        expect(values.targetLanguages.length).toBe(IMAGE_TRANSLATION_MAX_TARGETS);
    });

    test("手工添加/编辑/删除文字框", () => {
        let values = syncImages(createTranslationValues({ targetLanguages: ["en"] }), ["asset-a"]);
        values = addManualBox(values, "asset-a", "手工录入");
        const boxId = values.images[0].boxes[0].id;
        expect(values.images[0].boxes[0].origin).toBe("manual");
        values = updateBoxSourceText(values, "asset-a", boxId, "改过的原文");
        expect(values.images[0].boxes[0].sourceText).toBe("改过的原文");
        values = updateBoxTargetText(values, "asset-a", boxId, "en", "edited");
        expect(values.images[0].boxes[0].targets.en).toBe("edited");
        expect(values.images[0].confirmed).toBe(false);
        values = removeBox(values, "asset-a", boxId);
        expect(values.images[0].boxes).toHaveLength(0);
    });

    test("setSourceLanguage 忽略未知语言", () => {
        const values = setSourceLanguage(createTranslationValues(), "nope");
        expect(values.sourceLanguage).toBe(TRANSLATION_AUTO_SOURCE);
        expect(setSourceLanguage(createTranslationValues(), "ja").sourceLanguage).toBe("ja");
    });

    test("草稿解析：坏数据丢弃、语言过滤、未确认状态保留", () => {
        const parsed = parseTranslationValues({
            sourceLanguage: "zh-CN",
            targetLanguages: ["en", "not-a-language", "en", "ja"],
            images: [{ assetId: "asset-a", boxes: [{ id: "b1", sourceText: "hello" }], confirmed: false, detectedLanguage: "en" }],
        });
        expect(parsed.sourceLanguage).toBe("zh-CN");
        expect(parsed.targetLanguages).toEqual(["en", "ja"]);
        expect(parsed.images[0].boxes[0].sourceText).toBe("hello");
        expect(parsed.images[0].confirmed).toBe(false);
        expect(parseTranslationValues(null).images).toHaveLength(0);
    });

    test("groupSelectedCounts 按组统计已选数", () => {
        const counts = groupSelectedCounts(["en", "ja"]);
        expect(counts.find((item) => item.key === "europe-america")?.selected).toBe(1);
        expect(counts.find((item) => item.key === "asia")?.selected).toBe(1);
        expect(counts.find((item) => item.key === "africa")?.selected).toBe(0);
    });
});

/* ------------------------------------------------------------------ *
 * 校验与快照
 * ------------------------------------------------------------------ */

describe("registry · 校验", () => {
    test("没有图片/没有目标语言时阻塞并给出文案", () => {
        const issues = validateTranslationState({ assetIds: [], values: createTranslationValues() });
        expect(blockingIssues(issues).length).toBeGreaterThan(0);
        expect(issues.map((issue) => issue.code)).toContain("no-images");
        expect(issues.map((issue) => issue.code)).toContain("no-target");
    });

    test("未确认译文阻塞、缺译文阻塞", () => {
        const values = valuesWithBoxes({ targets: ["en"] });
        const issues = validateTranslationState({ assetIds: ["asset-a"], values });
        const codes = issues.map((issue) => issue.code);
        expect(codes).toContain("unconfirmed");
        expect(codes).toContain("missing-target-text");
        expect(blockingIssues(issues).length).toBeGreaterThan(0);

        const confirmed = setImageConfirmed(valuesWithBoxes({ targets: ["en"], translations: { en: "summer tee" } }), "asset-a", true);
        expect(blockingIssues(validateTranslationState({ assetIds: ["asset-a"], values: confirmed }))).toHaveLength(0);
    });

    test("单图超过 500 字阻塞（规格限制）", () => {
        const longText = "字".repeat(IMAGE_TRANSLATION_MAX_TEXT_CHARS + 1);
        const values = valuesWithBoxes({ sourceText: longText, translations: { en: "x" } });
        expect(imageCharCount(values.images[0])).toBeGreaterThan(IMAGE_TRANSLATION_MAX_TEXT_CHARS);
        const issues = validateTranslationState({ assetIds: ["asset-a"], values: setImageConfirmed(values, "asset-a", true) });
        expect(issues.map((issue) => issue.code)).toContain("text-too-long");
        expect(blockingIssues(issues).length).toBeGreaterThan(0);
    });

    test("原文语言与目标语言相同时给出警告而非阻塞", () => {
        // 目标只有源语言本身 → 直接阻塞（输出不会变化）
        const only = setSourceLanguage(valuesWithBoxes({ targets: ["en"], translations: { en: "tee" } }), "en");
        const onlyIssues = validateTranslationState({ assetIds: ["asset-a"], values: setImageConfirmed(only, "asset-a", true) });
        expect(onlyIssues.find((issue) => issue.code === "same-language")?.level).toBe("error");

        // 目标里同时含源语言 → 仅警告，可继续
        const mixed = setSourceLanguage(valuesWithBoxes({ targets: ["en", "ja"], translations: { en: "tee", ja: "ティー" } }), "en");
        const mixedIssues = validateTranslationState({ assetIds: ["asset-a"], values: setImageConfirmed(mixed, "asset-a", true) });
        expect(mixedIssues.find((issue) => issue.code === "same-language-partial")?.level).toBe("warning");
        expect(blockingIssues(mixedIssues)).toHaveLength(0);
    });

    test("auditConfirmed 需要先确认，再逐框检查每种目标语言", () => {
        const values = valuesWithBoxes({ targets: ["en", "ja"], translations: { en: "tee" } });
        expect(auditConfirmed(values.images[0], ["en"]).ok).toBe(false);
        expect(auditConfirmed(values.images[0], ["en"]).reason).toContain("确认");
        const confirmed = setImageConfirmed(values, "asset-a", true);
        expect(auditConfirmed(confirmed.images[0], ["en"]).ok).toBe(true);
        const missing = auditConfirmed(confirmed.images[0], ["en", "ja"]);
        expect(missing.ok).toBe(false);
        expect(missing.reason).toContain("日语");
    });

    test("auditTranslations 只看译文完整性，不要求已确认（确认按钮的前置校验）", () => {
        const values = valuesWithBoxes({ targets: ["en"], translations: { en: "tee" } });
        const state = values.images[0];
        expect(state.confirmed).toBe(false);
        // 译文齐了就能点“确认译文”，不会被“还没有确认译文”卡死
        expect(auditTranslations(state, ["en"]).ok).toBe(true);
        // 但未确认前仍不允许批量应用
        expect(auditConfirmed(state, ["en"]).ok).toBe(false);
        expect(auditTranslations(state, ["en", "ja"]).reason).toContain("日语");
    });
});

describe("registry · 快照", () => {
    test("快照哈希对同样输入稳定，对译文变化敏感", () => {
        const values = valuesWithBoxes({ translations: { en: "tee" } });
        const first = buildTranslationSnapshot({ assetIds: ["asset-a"], values, at: 1 });
        const second = buildTranslationSnapshot({ assetIds: ["asset-a"], values, at: 999 });
        expect(first.hash).toBe(second.hash);
        expect(first.outputCount).toBe(1);

        const changed = updateBoxTargetText(values, "asset-a", values.images[0].boxes[0].id, "en", "t-shirt");
        const third = buildTranslationSnapshot({ assetIds: ["asset-a"], values: changed });
        expect(third.hash).not.toBe(first.hash);
    });

    test("矩阵单元数与图片×语言一致", () => {
        const cells = plannedCells(["a", "b"], ["en", "ja", "de"]);
        expect(cells).toHaveLength(6);
        expect(estimatedOutputCount(2, 3)).toBe(6);
        expect(cells[0]).toMatchObject({ assetId: "a", language: "en" });
    });
});

/* ------------------------------------------------------------------ *
 * 识别解析（真实链路的结构守卫）
 * ------------------------------------------------------------------ */

describe("adapter · 识别", () => {
    test("解析标准 JSON 对象", () => {
        const result = parseRecognitionPayload(
            JSON.stringify({
                language: "zh-CN",
                boxes: [
                    { text: "纯棉短袖", box: [0.1, 0.2, 0.3, 0.05], confidence: 0.97 },
                    { text: "  限时 5 折  " },
                ],
            }),
        );
        expect(result.detectedLanguage).toBe("zh-CN");
        expect(result.boxes).toHaveLength(2);
        expect(result.boxes[0].bbox).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.05 });
        expect(result.boxes[1].sourceText).toBe("限时 5 折");
        expect(result.boxes[1].bbox).toBeUndefined();
    });

    test("解析 Markdown 代码块与前置说明", () => {
        const raw = '识别结果如下：\n```json\n{"language":"en","boxes":[{"text":"Summer Tee"}]}\n```';
        const result = parseRecognitionPayload(raw);
        expect(result.boxes[0].sourceText).toBe("Summer Tee");
    });

    test("缺 boxes / 非 JSON 一律抛错，不静默降级", () => {
        expect(() => parseRecognitionPayload('{"language":"en"}')).toThrow();
        expect(() => parseRecognitionPayload("抱歉我无法识别")).toThrow();
    });

    test("空文字与越界比例被丢弃/裁剪", () => {
        const result = parseRecognitionPayload(
            JSON.stringify({ boxes: [{ text: "   " }, { text: "ok", box: [-1, 0.5, 2, 0.1] }] }),
        );
        expect(result.boxes).toHaveLength(1);
        expect(result.boxes[0].bbox).toEqual({ x: 0, y: 0.5, width: 1, height: 0.1 });
    });

    test("识别提示词带图片与 500 字限制，模型调用带 image_url", async () => {
        const prompt = buildRecognitionPrompt({ sourceLanguage: "ja" });
        expect(prompt).toContain("Japanese");
        expect(prompt).toContain("500");
        const calls: Array<{ messages: unknown }> = [];
        const port: TranslationTextPort = {
            async ask(messages) {
                calls.push({ messages });
                return '{"language":"ja","boxes":[{"text":"夏の新作"}]}';
            },
        };
        const result = await transcribeImage(port, { imageUrl: "data:image/png;base64,AAA", sourceLanguage: "ja" });
        expect(result.boxes[0].sourceText).toBe("夏の新作");
        const payload = JSON.stringify(calls[0].messages);
        expect(payload).toContain("data:image/png;base64,AAA");
        expect(payload).toContain("image_url");
    });

    test("识别返回空 boxes 时如实返回空数组（不编造文字）", async () => {
        const port: TranslationTextPort = { ask: async () => '{"language":"zh-CN","boxes":[]}' };
        const result = await transcribeImage(port, { imageUrl: "data:image/png;base64,AAA" });
        expect(result.boxes).toHaveLength(0);
    });

    test("缺少图片地址直接报错", async () => {
        const port: TranslationTextPort = { ask: async () => "{}" };
        await expect(transcribeImage(port, { imageUrl: "" })).rejects.toThrow();
    });
});

/* ------------------------------------------------------------------ *
 * 翻译解析
 * ------------------------------------------------------------------ */

describe("adapter · 逐框翻译", () => {
    test("按 id 精确映射译文", () => {
        const map = parseBoxTranslationPayload('[{"id":"b1","text":"Summer Tee"},{"id":"b2","text":"50% OFF"}]', ["b1", "b2"]);
        expect(map).toEqual({ b1: "Summer Tee", b2: "50% OFF" });
    });

    test("缺条目抛错（提示可单列重试）", () => {
        expect(() => parseBoxTranslationPayload('[{"id":"b1","text":"x"}]', ["b1", "b2"])).toThrow(/缺少 1 条/);
    });

    test("空译文按缺失处理并抛错，多余 id 被丢弃", () => {
        expect(() => parseBoxTranslationPayload('[{"id":"b1","text":"x"},{"id":"zzz","text":"y"},{"id":"b2","text":"  "}]', ["b1", "b2"])).toThrow(/缺少/);
        const map = parseBoxTranslationPayload('[{"id":"b1","text":"x"},{"id":"zzz","text":"y"},{"id":"b2","text":"z"}]', ["b1", "b2"]);
        expect(map).toEqual({ b1: "x", b2: "z" });
        expect(map.zzz).toBeUndefined();
    });

    test("没有可翻译原文时报错", async () => {
        const port: TranslationTextPort = { ask: async () => "[]" };
        await expect(translateBoxes(port, { sourceLanguage: "zh-CN", targetLanguage: "en", boxes: [] })).rejects.toThrow(/没有可翻译的原文/);
    });

    test("翻译提示词包含目标语言与原文条数", () => {
        const prompt = buildBoxTranslationPrompt({ sourceLanguage: "zh-CN", targetLanguage: "ja", texts: [{ id: "b1", text: "纯棉" }] });
        expect(prompt).toContain("Japanese");
        expect(prompt).toContain("b1");
        expect(prompt).toContain("纯棉");
    });
});

/* ------------------------------------------------------------------ *
 * 请求单元与运行
 * ------------------------------------------------------------------ */

describe("adapter · 图×语言单元", () => {
    const images = [{ assetId: "asset-a", name: "a.png", reference: { id: "asset-a", name: "a.png", type: "image/png", dataUrl: "data:image/png;base64,a" } }];

    test("每张图 × 每个目标语言一个单元，提示词带确认译文", () => {
        const values = valuesWithBoxes({ targets: ["en", "ja"], translations: { en: "Summer Tee", ja: "夏Tシャツ" } });
        const units = buildTranslationUnits({ images, values, snapshotHash: "hash-1" });
        expect(units).toHaveLength(2);
        expect(units[0].unitId).toBe("asset-a::en");
        expect(units[0].prompt).toContain("Summer Tee");
        expect(units[1].prompt).toContain("夏Tシャツ");
        expect(units[0].fields).toMatchObject({ sourceLanguage: TRANSLATION_AUTO_SOURCE, targetLanguage: "en", imageName: "a.png" });
        expect(units[0].snapshotHash).toBe("hash-1");
    });

    test("提示词要求保持版式且不新增文字", () => {
        const prompt = composeTranslationPrompt({ imageName: "a.png", language: "fr", texts: [{ source: "纯棉", target: "coton" }] });
        expect(prompt).toContain("French");
        expect(prompt).toContain("版式");
        expect(prompt).toContain("不新增");
    });

    test("prepareTranslationRun 一次给出快照/单元/数量", () => {
        const values = valuesWithBoxes({ targets: ["en"] });
        const prepared = prepareTranslationRun({ records: [record("asset-a")], assetIds: ["asset-a"], values });
        expect(prepared.units).toHaveLength(1);
        expect(prepared.outputCount).toBe(1);
        expect(prepared.snapshot.images[0].boxes[0].targets.en).toBe("");
    });
});

describe("adapter · 结果映射", () => {
        const unit: TranslationUnit = {
        unitId: "asset-a::en",
        assetId: "asset-a",
        imageName: "a.png",
        language: "en",
        languageName: "英语",
        prompt: "p",
        references: [],
        fields: {},
        snapshotHash: "hash-1",
        texts: [],
    };

    test("成功且有图 → succeeded", () => {
        const outcome = mapTaskToOutcome(unit, task({ result: { items: [{ id: "i1", kind: "image", dataUrl: "data:image/png;base64,x" }], receivedAt: 0 } }));
        expect(outcome.status).toBe("succeeded");
        expect(outcome.image?.dataUrl).toContain("base64");
    });

    test("成功但无图 → failed(empty-result)，不算成功", () => {
        const outcome = mapTaskToOutcome(unit, task({ result: { items: [], receivedAt: 0 } }));
        expect(outcome.status).toBe("failed");
        expect(outcome.error?.code).toBe("empty-result");
        expect(outcome.error?.retryable).toBe(true);
    });

    test("失败/取消/未定分别映射", () => {
        const failed = mapTaskToOutcome(unit, task({ status: "failed", error: { code: "upstream-503", message: "上游 503", retryable: true } }));
        expect(failed.status).toBe("failed");
        expect(failed.error?.code).toBe("upstream-503");
        expect(mapTaskToOutcome(unit, task({ status: "cancelled" })).status).toBe("cancelled");
        expect(mapTaskToOutcome(unit, task({ status: "running" })).status).toBe("unknown");
        expect(mapTaskToOutcome(unit, task({ status: "failed" })).error?.code).toBe("task-failed");
    });
});

describe("adapter · 批量运行", () => {
    const units: TranslationUnit[] = ["asset-a", "asset-b"].flatMap((assetId) =>
        ["en", "ja"].map((language) => ({
            unitId: `${assetId}::${language}`,
            assetId,
            imageName: `${assetId}.png`,
            language,
            languageName: languageLabel(language),
            prompt: "p",
            references: [],
            fields: { targetLanguage: language },
            snapshotHash: "h",
            texts: [],
        })),
    );

    test("逐单元返回结果，单单元失败不影响其它单元", async () => {
        const port: TranslationRunPort = {
            async run(input) {
                if (input.fields?.targetLanguage === "ja") throw new Error("provider down");
                return task({ id: `t-${input.fields?.targetLanguage}`, result: { items: [{ id: "i", kind: "image", dataUrl: "data:image/png;base64,x" }], receivedAt: 0 } });
            },
        };
        const seen: string[] = [];
        const outcomes = await runTranslationUnits(units, { port, concurrency: 2, onOutcome: (_o, unit) => seen.push(unit.unitId) });
        expect(outcomes).toHaveLength(4);
        expect(outcomes.filter((outcome) => outcome.status === "succeeded")).toHaveLength(2);
        expect(outcomes.filter((outcome) => outcome.status === "failed")).toHaveLength(2);
        expect(seen.length).toBe(4);
        expect(retryableUnits(units, outcomes).every((unit) => unit.language === "ja")).toBe(true);
        expect(summarizeByLanguage(["en", "ja"], outcomes).find((row) => row.language === "ja")?.failed).toBe(2);
    });

    test("取消后剩余单元标记 cancelled 且不提交", async () => {
        const controller = new AbortController();
        controller.abort();
        let calls = 0;
        const port: TranslationRunPort = {
            async run() {
                calls += 1;
                return task();
            },
        };
        const outcomes = await runTranslationUnits(units, { port, concurrency: 1, signal: controller.signal });
        expect(calls).toBe(0);
        expect(outcomes.every((outcome) => outcome.status === "cancelled")).toBe(true);
    });

    test("mergeOutcomes 用新结果覆盖同单元", () => {
        const first = [{ unitId: "u1", assetId: "a", language: "en", status: "failed" as const, snapshotHash: "h" }];
        const second = [{ unitId: "u1", assetId: "a", language: "en", status: "succeeded" as const, snapshotHash: "h" }];
        const merged = mergeOutcomes(first, second);
        expect(merged).toHaveLength(1);
        expect(merged[0].status).toBe("succeeded");
        expect(outcomeOf(merged, "a", "en")?.status).toBe("succeeded");
    });
});

describe("任务载荷（页面规范 §7）", () => {
    test("prepareTranslationRun 携带 draftRevision / clientOperationId / sourceAssetIds / configSnapshot", () => {
        const values = setImageConfirmed(valuesWithBoxes({ targets: ["en", "ja"], translations: { en: "tee", ja: "ティー" } }), "asset-a", true);
        const prepared = prepareTranslationRun({
            records: [record("asset-a")],
            assetIds: ["asset-a"],
            values,
            draftRevision: 7,
            clientOperationId: "op-1",
        });
        expect(prepared.outputCount).toBe(2);
        const fields = prepared.units[0].fields as Record<string, unknown>;
        expect(fields.draftRevision).toBe(7);
        expect(fields.clientOperationId).toBe("op-1");
        expect(fields.sourceAssetIds).toEqual(["asset-a"]);
        expect(fields.imageName).toBe("asset-a.png");
        expect(fields.configSnapshot).toEqual({
            hash: prepared.snapshot.hash,
            sourceLanguage: values.sourceLanguage,
            targetLanguages: ["en", "ja"],
        });
    });

    test("未传 meta 时 sourceAssetIds 回落到本次图片集合", () => {
        const values = setImageConfirmed(valuesWithBoxes(), "asset-a", true);
        const prepared = prepareTranslationRun({ records: [record("asset-a")], assetIds: ["asset-a"], values });
        const fields = prepared.units[0].fields as Record<string, unknown>;
        expect(fields.sourceAssetIds).toEqual(["asset-a"]);
        expect(fields.draftRevision).toBeNull();
        expect(fields.clientOperationId).toBeNull();
    });
});
