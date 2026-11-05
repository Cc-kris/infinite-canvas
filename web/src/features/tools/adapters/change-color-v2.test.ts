import { describe, expect, test } from "bun:test";

import type { ToolTask } from "@/services/api/tools/task-machine";

import {
    COLOR_QUALITY_LEVELS,
    COLOR_REGION_PRESETS,
    COLOR_V2_MAX_REGION_LENGTH,
    CHANGE_COLOR_V2_ROUTE,
    DEFAULT_COLOR_ADJUSTMENT,
    addColorPlan,
    adjustmentKey,
    adjustmentSummary,
    buildColorV2Snapshot,
    canonicalize,
    createColorPlan,
    describeAdjustment,
    estimatedOutputCount,
    getChangeColorV2Spec,
    normalizeAdjustment,
    normalizeHex,
    parseColorV2Values,
    quantizePalette,
    sanityRegion,
    toggleReferencePlan,
    validateColorV2State,
    type ColorV2Values,
} from "../registry/change-color-v2";
import {
    buildSuiteUnits,
    buildUnitInput,
    buildSuiteImages,
    colorV2UnitId,
    composeColorV2Prompt,
    mapTaskToOutcome,
    mergeOutcomes,
    paletteToPlans,
    retryableUnits,
    runColorV2Suite,
    summarizeByPlan,
    auditSuiteConsistency,
    type ColorV2RunPort,
    type ColorV2Unit,
    type ColorV2UnitOutcome,
} from "./change-color-v2";

function baseValues(overrides: Partial<ColorV2Values> = {}): ColorV2Values {
    return {
        plans: [createColorPlan({ id: "plan-red", source: "history", hex: "#cc2222", name: "正红" })],
        selectedPlanId: "plan-red",
        selectedAssetId: null,
        region: "full-body",
        quality: "medium",
        referenceAssetIds: [],
        adjustments: {},
        imageNames: {},
        historyColors: ["#CC2222"],
        ...overrides,
    };
}

function image(assetId: string) {
    return {
        assetId,
        name: `img-${assetId}.png`,
        reference: { id: assetId, name: `img-${assetId}.png`, type: "image/png", dataUrl: "data:image/png;base64,AA==" },
    };
}

function records() {
    return [
        {
            id: "a1",
            kind: "image" as const,
            name: "front.png",
            storageKey: "k1",
            url: "blob:front",
            bytes: 10,
            mimeType: "image/png",
            createdAt: "2026-10-28T00:00:00.000Z",
            origin: "local" as const,
        },
        {
            id: "a2",
            kind: "image" as const,
            name: "side.png",
            storageKey: "k2",
            url: "blob:side",
            bytes: 10,
            mimeType: "image/png",
            createdAt: "2026-10-28T00:00:00.000Z",
            origin: "local" as const,
        },
    ];
}

function makeTask(partial: Partial<ToolTask> & Pick<ToolTask, "id" | "status">): ToolTask {
    return {
        toolId: "CHANGE_COLOR_V2",
        clientOperationId: partial.id,
        fingerprint: partial.id,
        capability: "image",
        prompt: "",
        configSnapshot: { capability: "image", model: "test-model", count: "1" },
        sourceAssetIds: [],
        createdAt: 0,
        updatedAt: 0,
        attempts: 1,
        pollCount: 0,
        transientFailures: 0,
        ...partial,
    } as ToolTask;
}

describe("CHANGE_COLOR_V2 registry contract", () => {
    test("spec is wired to the ecommerce suite color route and image adapter", () => {
        const spec = getChangeColorV2Spec();
        expect(spec.id).toBe("CHANGE_COLOR_V2");
        expect(spec.category).toBe("ecommerce-suite");
        expect(spec.slug).toBe("change-color-v2");
        expect(spec.route).toBe(CHANGE_COLOR_V2_ROUTE);
        expect(spec.layout).toBe("color");
        expect(spec.adapter).toBe("image");
        expect(spec.fields.map((field) => field.key)).toContain("imageName");
    });

    test("region presets keep the ten documented labels in order", () => {
        expect(COLOR_REGION_PRESETS.map((preset) => preset.label)).toEqual([
            "全身",
            "上装",
            "下装",
            "鞋面",
            "鞋底",
            "包身",
            "包带",
            "外壳",
            "瓶身",
            "表带",
        ]);
    });

    test("quality levels map to the shared provider quality enum", () => {
        expect(COLOR_QUALITY_LEVELS.map((level) => level.label)).toEqual(["低品质", "中品质", "高品质"]);
        expect(COLOR_QUALITY_LEVELS.map((level) => level.providerQuality)).toEqual(["low", "medium", "high"]);
    });
});

describe("color helpers", () => {
    test("normalizeHex accepts shorthand, long form and rgb()", () => {
        expect(normalizeHex("#abc")).toBe("#AABBCC");
        expect(normalizeHex("#a1b2c3")).toBe("#A1B2C3");
        expect(normalizeHex("rgb(255, 0, 16)")).toBe("#FF0010");
        expect(normalizeHex("not-a-color")).toBeUndefined();
    });

    test("region text is trimmed and capped at 50 characters", () => {
        expect(sanityRegion("  上装  左侧  ")).toBe("上装 左侧");
        const long = "色".repeat(80);
        expect(sanityRegion(long)).toHaveLength(COLOR_V2_MAX_REGION_LENGTH);
    });

    test("adjustment clamps out-of-range input and describes deltas", () => {
        const clamped = normalizeAdjustment({ hue: 400, saturation: 10, lightness: 999, strength: -5 });
        expect(clamped).toEqual({ hue: 180, saturation: 40, lightness: 160, strength: 0 });
        expect(describeAdjustment(DEFAULT_COLOR_ADJUSTMENT)).toEqual([]);
        expect(describeAdjustment({ hue: 12, saturation: 110, lightness: 90, strength: 80 })).toEqual([
            "色相+12°",
            "饱和度+10%",
            "明度-10%",
            "上色强度80%",
        ]);
        expect(adjustmentSummary(DEFAULT_COLOR_ADJUSTMENT)).toBe("默认");
        expect(adjustmentKey(DEFAULT_COLOR_ADJUSTMENT)).toBe("0/100/100/100");
    });

    test("quantizePalette returns dominant colors from real pixel data", () => {
        // 100 red pixels + 50 blue pixels, alpha 255.
        const pixels: number[] = [];
        for (let i = 0; i < 100; i += 1) pixels.push(200, 20, 20, 255);
        for (let i = 0; i < 50; i += 1) pixels.push(20, 30, 200, 255);
        const palette = quantizePalette(pixels, { maxColors: 4 });
        expect(palette.length).toBeGreaterThanOrEqual(2);
        expect(palette[0].hex).toBe("#C81414");
        expect(palette[0].ratio).toBeCloseTo(2 / 3, 2);
        expect(palette[1].hex).toBe("#141EC8");
    });

    test("quantizePalette ignores transparent pixels", () => {
        const pixels = [255, 255, 255, 0, 255, 255, 255, 0];
        expect(quantizePalette(pixels)).toEqual([]);
    });
});

describe("plans", () => {
    test("createColorPlan normalizes hex and keeps source traceability", () => {
        const plan = createColorPlan({ source: "product", hex: "#abc", sourceAssetId: "asset-1", at: 10 });
        expect(plan.hex).toBe("#AABBCC");
        expect(plan.sourceAssetId).toBe("asset-1");
        expect(plan.name).toContain("#AABBCC");
        expect(plan.createdAt).toBe(10);
    });

    test("addColorPlan deduplicates identical colors and reference assets", () => {
        const plan = createColorPlan({ id: "a", source: "history", hex: "#112233" });
        const duplicate = createColorPlan({ id: "b", source: "product", hex: "#112233" });
        expect(addColorPlan([plan], duplicate)).toHaveLength(1);
        const refA = createColorPlan({ id: "r1", source: "reference", referenceAssetId: "asset-9" });
        const refB = createColorPlan({ id: "r2", source: "reference", referenceAssetId: "asset-9" });
        expect(addColorPlan([refA], refB)).toHaveLength(1);
    });

    test("toggleReferencePlan adds and removes in one call", () => {
        const added = toggleReferencePlan(baseValues(), { assetId: "ref-1", name: "ref.png", at: 5 });
        expect(added.referenceAssetIds).toEqual(["ref-1"]);
        expect(added.plans.some((plan) => plan.referenceAssetId === "ref-1")).toBe(true);
        const removed = toggleReferencePlan(added, { assetId: "ref-1", name: "ref.png" });
        expect(removed.referenceAssetIds).toEqual([]);
        expect(removed.plans.some((plan) => plan.referenceAssetId === "ref-1")).toBe(false);
        expect(removed.selectedPlanId).toBe("plan-red");
    });
});

describe("draft parsing", () => {
    test("drops malformed plans and clamps stored values", () => {
        const parsed = parseColorV2Values({
            plans: [
                { id: "keep", source: "history", hex: "#0f0", name: "green" },
                { id: "bad-source", source: "nope", hex: "#000" },
                { id: "ref-without-asset", source: "reference" },
                { id: "hex-missing", source: "product" },
            ],
            region: "  上装  ",
            quality: "ultra",
            adjustments: { asset: { hue: 999, saturation: 0, lightness: "x", strength: 50 } },
            historyColors: ["#abc", "bad", "#AABBCC"],
            selectedPlanId: "missing",
        });
        expect(parsed.plans.map((plan) => plan.id)).toEqual(["keep"]);
        expect(parsed.plans[0].hex).toBe("#00FF00");
        expect(parsed.region).toBe("上装");
        expect(parsed.quality).toBe("medium");
        expect(parsed.adjustments.asset).toEqual({ hue: 180, saturation: 40, lightness: 100, strength: 50 });
        expect(parsed.historyColors).toEqual(["#AABBCC", "#AABBCC"]);
        expect(parsed.selectedPlanId).toBe("keep");
    });

    test("empty values are safe defaults", () => {
        expect(parseColorV2Values(undefined)).toEqual({
            plans: [],
            selectedPlanId: null,
            selectedAssetId: null,
            region: "",
            quality: "medium",
            referenceAssetIds: [],
            adjustments: {},
            imageNames: {},
            historyColors: [],
        });
    });
});

describe("validation", () => {
    test("blocks submission without a suite or a plan", () => {
        const issues = validateColorV2State({ assetIds: [], values: baseValues({ plans: [] }) });
        expect(issues.map((issue) => issue.field)).toEqual(["suite", "plans"]);
    });

    test("flags reference plan whose image is not in the reference set", () => {
        const values = baseValues({
            plans: [createColorPlan({ id: "ref", source: "reference", referenceAssetId: "ref-1", referenceName: "r.png" })],
            referenceAssetIds: [],
        });
        const issues = validateColorV2State({ assetIds: ["a1"], values });
        expect(issues.map((issue) => issue.message)).toContain("方案「r.png」的参考图不在本次参考图集合中");
    });

    test("accepts a complete draft and counts planned outputs honestly", () => {
        const values = baseValues();
        expect(validateColorV2State({ assetIds: ["a1", "a2"], values })).toEqual([]);
        expect(estimatedOutputCount(3, 2)).toBe(6);
        expect(estimatedOutputCount(0, 2)).toBe(0);
    });

    test("rejects region longer than 50 characters", () => {
        const issues = validateColorV2State({ assetIds: ["a1"], values: baseValues({ region: "色".repeat(51) }) });
        expect(issues.map((issue) => issue.field)).toContain("region");
    });
});

describe("snapshot", () => {
    test("same input yields the same hash and canonical key order", () => {
        const values = baseValues();
        const first = buildColorV2Snapshot({ assetIds: ["a1", "a2"], values }, 1);
        const second = buildColorV2Snapshot({ assetIds: ["a1", "a2"], values: { ...values }, }, 2);
        expect(first.hash).toBe(second.hash);
        expect(canonicalize({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
    });

    test("hash changes when quality, region or per-image adjustment changes", () => {
        const values = baseValues();
        const base = buildColorV2Snapshot({ assetIds: ["a1"], values }).hash;
        expect(buildColorV2Snapshot({ assetIds: ["a1"], values: { ...values, quality: "high" } }).hash).not.toBe(base);
        expect(buildColorV2Snapshot({ assetIds: ["a1"], values: { ...values, region: "top" } }).hash).not.toBe(base);
        expect(
            buildColorV2Snapshot({ assetIds: ["a1"], values: { ...values, adjustments: { a1: { ...DEFAULT_COLOR_ADJUSTMENT, hue: 20 } } } }).hash,
        ).not.toBe(base);
    });

    test("default adjustments do not bloat the snapshot", () => {
        const snapshot = buildColorV2Snapshot({
            assetIds: ["a1"],
            values: baseValues({ adjustments: { a1: { ...DEFAULT_COLOR_ADJUSTMENT } } }),
        });
        expect(snapshot.adjustments).toEqual({});
    });

    test("reference asset ids are pruned to plans in the snapshot", () => {
        const values = baseValues({ referenceAssetIds: ["ref-1", "orphan"] });
        expect(buildColorV2Snapshot({ assetIds: ["a1"], values }).referenceAssetIds).toEqual([]);
        const withPlan = baseValues({
            plans: [createColorPlan({ id: "r", source: "reference", referenceAssetId: "ref-1", referenceName: "r.png" })],
            referenceAssetIds: ["ref-1", "orphan"],
        });
        expect(buildColorV2Snapshot({ assetIds: ["a1"], values: withPlan }).referenceAssetIds).toEqual(["ref-1"]);
    });
});

describe("adapter units", () => {
    test("composes a prompt with region, color, quality and adjustments", () => {
        const plan = createColorPlan({ id: "p", source: "history", hex: "#123456", name: "深蓝" });
        const prompt = composeColorV2Prompt({
            imageName: "shoes.png",
            plan,
            region: "shoe-upper",
            adjustment: { hue: -10, saturation: 120, lightness: 100, strength: 90 },
            quality: "high",
            planCount: 2,
        });
        expect(prompt).toContain("shoes.png");
        expect(prompt).toContain("鞋面");
        expect(prompt).toContain("#123456");
        expect(prompt).toContain("色相-10°");
        expect(prompt).toContain("饱和度+20%");
        expect(prompt).toContain("上色强度90%");
        expect(prompt).toContain("输出品质：高品质");
        expect(prompt).toContain("多个换色方案之一");
    });

    test("reference plans describe the reference instead of inventing a hex", () => {
        const plan = createColorPlan({ id: "r", source: "reference", referenceAssetId: "ref-2", referenceName: "suede.png" });
        const prompt = composeColorV2Prompt({
            imageName: "bag.png",
            plan,
            region: "bag-body",
            adjustment: DEFAULT_COLOR_ADJUSTMENT,
            quality: "low",
            planCount: 1,
        });
        expect(prompt).toContain("参考图「suede.png」");
        expect(prompt).not.toMatch(/#[0-9A-F]{6}/);
        expect(prompt).toContain("输出品质：低品质");
    });

    test("buildSuiteUnits produces images × plans units with unique ids", () => {
        const values = baseValues({
            plans: [
                createColorPlan({ id: "p1", source: "history", hex: "#111111" }),
                createColorPlan({ id: "p2", source: "history", hex: "#222222" }),
            ],
            adjustments: { a2: { hue: 5, saturation: 100, lightness: 100, strength: 100 } },
        });
        const images = buildSuiteImages(records(), ["a1", "a2"]);
        const units = buildSuiteUnits({ images, values, snapshotHash: "hash-1" });

        expect(units).toHaveLength(4);
        expect(new Set(units.map((unit) => unit.unitId)).size).toBe(4);
        expect(units[0].unitId).toBe(colorV2UnitId("a1", "p1"));
        expect(units.map((unit) => unit.assetId)).toEqual(["a1", "a1", "a2", "a2"]);
        expect(units[2].fields.adjustmentKey).toBe("5/100/100/100");
        expect(units[0].fields.adjustmentKey).toBe("0/100/100/100");
        expect(units[0].references.map((reference) => reference.id)).toEqual(["a1"]);
        expect(units[0].snapshotHash).toBe("hash-1");
    });

    test("image order follows the selected asset ids", () => {
        const images = buildSuiteImages(records(), ["a2", "a1"]);
        expect(images.map((item) => item.assetId)).toEqual(["a2", "a1"]);
    });

    test("reference plans attach the reference image to every unit", () => {
        const values = baseValues({
            plans: [createColorPlan({ id: "r", source: "reference", referenceAssetId: "ref-1", referenceName: "ref.png" })],
            referenceAssetIds: ["ref-1"],
        });
        const referenceById = new Map([
            ["ref-1", { id: "ref-1", name: "ref.png", type: "image/png", dataUrl: "data:image/png;base64,BB==" }],
        ]);
        const units = buildSuiteUnits({
            images: buildSuiteImages(records(), ["a1"]),
            values,
            snapshotHash: "h",
            referenceById,
        });
        expect(units[0].references.map((reference) => reference.id)).toEqual(["a1", "ref-1"]);
        expect(units[0].references[1].dataUrl).toBe("data:image/png;base64,BB==");
    });

    test("buildUnitInput sends one image per unit with the mapped quality", () => {
        const units = buildSuiteUnits({ images: buildSuiteImages(records(), ["a1"]), values: baseValues(), snapshotHash: "h" });
        const input = buildUnitInput(units[0], "high");
        expect(input.toolId).toBe("CHANGE_COLOR_V2");
        expect(input.count).toBe(1);
        expect(input.quality).toBe("high");
        expect(input.prompt).toBe(units[0].prompt);
        expect(input.fields?.planId).toBe("plan-red");
    });

    test("paletteToPlans keeps hex and source asset", () => {
        const plans = paletteToPlans(
            [
                { hex: "#c81414", ratio: 0.6, count: 60 },
                { hex: "bad", ratio: 0.1, count: 10 },
            ],
            { assetId: "a1", assetName: "front.png", at: 7 },
        );
        expect(plans).toHaveLength(1);
        expect(plans[0].hex).toBe("#C81414");
        expect(plans[0].source).toBe("product");
        expect(plans[0].sourceAssetId).toBe("a1");
        expect(plans[0].id).toBe("product-a1-c81414");
    });

    test("imageName 自动填文件名；用户改过展示名后提交键与 prompt 都用展示名", () => {
        const images = buildSuiteImages(records(), ["a1"]);
        const auto = buildSuiteUnits({ images, values: baseValues(), snapshotHash: "h" });
        expect(auto[0].fields.imageName).toBe("front.png");
        expect(auto[0].imageName).toBe("front.png");
        expect(auto[0].prompt).toContain("front.png");

        const renamed = buildSuiteUnits({
            images,
            values: baseValues({ imageNames: { a1: "  主图正面  " } }),
            snapshotHash: "h",
        });
        expect(renamed[0].fields.imageName).toBe("主图正面");
        expect(renamed[0].prompt).toContain("主图正面");

        // 空白展示名不能覆盖文件名。
        const blank = buildSuiteUnits({ images, values: baseValues({ imageNames: { a1: "   " } }), snapshotHash: "h" });
        expect(blank[0].fields.imageName).toBe("front.png");
    });

    test("展示名进入快照与哈希（改了展示名结果就会标为过期）", () => {
        const base = buildColorV2Snapshot({ assetIds: ["a1"], values: baseValues() }, 1);
        const renamed = buildColorV2Snapshot({ assetIds: ["a1"], values: baseValues({ imageNames: { a1: "主图" } }) }, 1);
        expect(base.imageNames).toEqual({});
        expect(renamed.imageNames).toEqual({ a1: "主图" });
        expect(renamed.hash).not.toBe(base.hash);
    });

    test("§7：单元字段带 draftRevision / clientOperationId", () => {
        const units = buildSuiteUnits({
            images: buildSuiteImages(records(), ["a1"]),
            values: baseValues(),
            snapshotHash: "h",
            meta: { draftRevision: 7, clientOperationId: "op-1" },
        });
        expect(units[0].fields.draftRevision).toBe(7);
        expect(units[0].fields.clientOperationId).toBe("op-1");
        const noMeta = buildSuiteUnits({ images: buildSuiteImages(records(), ["a1"]), values: baseValues(), snapshotHash: "h" });
        expect(noMeta[0].fields.draftRevision).toBeNull();
        expect(noMeta[0].fields.clientOperationId).toBeNull();
    });
});

describe("suite runner", () => {
    test("runs every unit and records per-unit outcomes", async () => {
        const values = baseValues();
        const units = buildSuiteUnits({
            images: buildSuiteImages(
                [
                    ...records(),
                ],
                ["a1", "a2"],
            ),
            values,
            snapshotHash: "h",
        });
        const calls: string[] = [];
        const port: ColorV2RunPort = {
            async run(input) {
                calls.push(input.prompt ?? "");
                return makeTask({
                    id: `task-${calls.length}`,
                    status: "succeeded",
                    result: { receivedAt: 0, items: [{ id: "1", kind: "image", dataUrl: "data:image/png;base64,CC==" }] },
                });
            },
        };
        const outcomes = await runColorV2Suite(units, { port, quality: "medium", concurrency: 2 });
        expect(calls).toHaveLength(2);
        expect(outcomes.every((outcome) => outcome.status === "succeeded")).toBe(true);
        expect(outcomes[0].image?.dataUrl).toBe("data:image/png;base64,CC==");
    });

    test("partial failure keeps successes and retries only failed units", async () => {
        const units = buildSuiteUnits({
            images: buildSuiteImages(records(), ["a1", "a2"]),
            values: baseValues(),
            snapshotHash: "h",
        });
        let index = 0;
        const port: ColorV2RunPort = {
            async run() {
                index += 1;
                if (index === 1) {
                    return makeTask({ id: "t1", status: "failed", error: { code: "provider-500", message: "boom", retryable: true } });
                }
                return makeTask({ id: `t${index}`, status: "succeeded", result: { receivedAt: 0, items: [{ id: "1", kind: "image", dataUrl: "data:x" }] } });
            },
        };
        const outcomes = await runColorV2Suite(units, { port, quality: "medium", concurrency: 1 });
        expect(outcomes.map((outcome) => outcome.status)).toEqual(["failed", "succeeded"]);

        const retry = retryableUnits(units, outcomes);
        expect(retry.map((unit) => unit.assetId)).toEqual(["a1"]);

        const merged = mergeOutcomes(outcomes, [{ ...outcomes[0], status: "succeeded", image: { dataUrl: "data:y" } }]);
        expect(merged.map((outcome) => outcome.status)).toEqual(["succeeded", "succeeded"]);
        expect(summarizeByPlan(units, merged)).toEqual([
            expect.objectContaining({ planId: "plan-red", total: 2, succeeded: 2, failed: 0, ratio: 1 }),
        ]);
    });

    test("unknown upstream state is not reported as success or failure", () => {
        const unit = buildSuiteUnits({ images: buildSuiteImages(records(), ["a1"]), values: baseValues(), snapshotHash: "h" })[0];
        const outcome = mapTaskToOutcome(unit, makeTask({ id: "t", status: "unknown" }));
        expect(outcome.status).toBe("unknown");
        expect(outcome.error?.retryable).toBe(true);
    });

    test("a succeeded task without images is a failure, not an empty success", () => {
        const unit = buildSuiteUnits({ images: buildSuiteImages(records(), ["a1"]), values: baseValues(), snapshotHash: "h" })[0];
        const outcome = mapTaskToOutcome(unit, makeTask({ id: "t", status: "succeeded", result: { receivedAt: 0, items: [] } }));
        expect(outcome.status).toBe("failed");
        expect(outcome.error?.code).toBe("empty-result");
        expect(outcome.image).toBeUndefined();
    });

    test("aborting stops submitting remaining units and marks them cancelled", async () => {
        const units = buildSuiteUnits({
            images: buildSuiteImages(records(), ["a1", "a2"]),
            values: baseValues(),
            snapshotHash: "h",
        });
        const controller = new AbortController();
        const port: ColorV2RunPort = {
            async run() {
                controller.abort();
                return makeTask({ id: "t", status: "succeeded", result: { receivedAt: 0, items: [{ id: "1", kind: "image", dataUrl: "data:x" }] } });
            },
        };
        const outcomes = await runColorV2Suite(units, { port, quality: "medium", concurrency: 1, signal: controller.signal });
        expect(outcomes[0].status).toBe("succeeded");
        expect(outcomes[1].status).toBe("cancelled");
    });

    test("a thrown port error becomes a retryable per-unit failure", async () => {
        const units = buildSuiteUnits({ images: buildSuiteImages(records(), ["a1"]), values: baseValues(), snapshotHash: "h" });
        const port: ColorV2RunPort = {
            async run() {
                throw new Error("network down");
            },
        };
        const outcomes = await runColorV2Suite(units, { port, quality: "medium" });
        expect(outcomes[0]).toMatchObject({ status: "failed", error: { code: "run-threw", message: "network down", retryable: true } });
    });
});

describe("suite consistency report", () => {
    function units(): ColorV2Unit[] {
        return buildSuiteUnits({
            images: buildSuiteImages(records(), ["a1", "a2"]),
            values: baseValues(),
            snapshotHash: "h",
        });
    }

    test("complete matrix with per-image deviations surfaced", () => {
        const base = units();
        const withDeviation = buildSuiteUnits({
            images: buildSuiteImages(records(), ["a1", "a2"]),
            values: baseValues({ adjustments: { a2: { hue: 30, saturation: 100, lightness: 100, strength: 100 } } }),
            snapshotHash: "h",
        });
        const outcomes: ColorV2UnitOutcome[] = base.map((unit) => ({
            unitId: unit.unitId,
            assetId: unit.assetId,
            planId: unit.planId,
            status: "succeeded",
            snapshotHash: "h",
        }));
        const report = auditSuiteConsistency(withDeviation, outcomes);
        expect(report.completeMatrix).toBe(true);
        expect(report.totalUnits).toBe(2);
        expect(report.succeededUnits).toBe(2);
        expect(report.deviatingUnits).toEqual([{ unitId: "a2::plan-red", assetId: "a2", planId: "plan-red", summary: "色相+30°" }]);
    });

    test("missing outcomes keep the unit count but not success", () => {
        const report = auditSuiteConsistency(units(), []);
        expect(report.completeMatrix).toBe(true);
        expect(report.succeededUnits).toBe(0);
    });
});
