import { describe, expect, test } from "bun:test";

import { createTaskRecord, type ToolTask, type ToolTaskResultItem } from "@/services/api/tools/task-machine";

import {
    MARKET_APLUS_RATIOS,
    MARKET_PROVIDERS,
    PRODUCT_MARKET_MATERIAL_TOOL_ID,
    availableQualities,
    availableResolutions,
    aplusRatiosForPlatform,
    buildMarketToolFields,
    buildMarketUnits,
    createDefaultMarketConfig,
    createMarketSnapshot,
    isMarketSnapshotStale,
    marketExpectedCount,
    normalizeConfig,
    platformSupportsAplus,
    readMarketConfig,
    resolveProviderCode,
    validateMarketConfig,
    type MarketConfig,
} from "../registry/product-market-material";
import {
    MarketAdapterError,
    buildMarketUnitInput,
    groupMarketUnits,
    isMarketSourceReady,
    marketResultsStale,
    marketUnitResultFromTask,
    resolveMarketSources,
    retryMarketUnit,
    runMarketMaterial,
    saveMarketResultItem,
    summarizeMarketRun,
    unitStatusFromTask,
    validateMarketSourceLimits,
    type MarketGatewayLike,
    type MarketSourceAsset,
    type MarketUnitResult,
} from "./product-market-material";

function makeSource(id: string, overrides: Partial<MarketSourceAsset> = {}): MarketSourceAsset {
    return {
        assetId: id,
        dataUrl: `data:image/png;base64,${id}`,
        url: `https://cdn.test/${id}.png`,
        name: `${id}.png`,
        mimeType: "image/png",
        bytes: 2048,
        width: 1200,
        height: 1200,
        ...overrides,
    };
}

function makeConfig(overrides: Partial<MarketConfig> = {}): MarketConfig {
    return createDefaultMarketConfig({
        sourceAssetIds: ["a", "b"],
        coverList: ["a", "b"],
        productInfo: "便携榨汁杯，USB-C 充电，400ml，卖点：一键清洗、静音。",
        projectName: "榨汁杯项目",
        ...overrides,
    });
}

function makeTask(status: ToolTask["status"], items: ToolTaskResultItem[] = [], extra: Partial<ToolTask> = {}): ToolTask {
    const record = createTaskRecord({
        toolId: PRODUCT_MARKET_MATERIAL_TOOL_ID,
        capability: "image",
        prompt: "prompt",
        configSnapshot: { capability: "image", model: "", count: "1", size: "1:1", quality: "high" },
        sourceAssetIds: ["a"],
    });
    return {
        ...record,
        status,
        attempts: 1,
        ...(items.length > 0 ? { result: { items, receivedAt: 1 } } : {}),
        ...extra,
    };
}

describe("PRODUCT_MARKET_MATERIAL registry", () => {
    test("A+ 比例按平台过滤：亚马逊四档，Shopify 没有 A+ 能力", () => {
        expect(aplusRatiosForPlatform("amazon").map((ratio) => ratio.id)).toEqual(["970x600", "1464x600", "600x450", "custom"]);
        expect(aplusRatiosForPlatform("shopify")).toHaveLength(0);
        expect(platformSupportsAplus("amazon")).toBe(true);
        expect(platformSupportsAplus("shopify")).toBe(false);
    });

    test("provider 目录决定可选品质/分辨率（不编造能力）", () => {
        expect(availableQualities("GPT_2_5_IMAGE").map((entry) => entry.id)).toEqual(["low", "medium", "high", "xhigh", "max"]);
        expect(availableQualities("GEMINI_NANO_BANANA_2_1")).toHaveLength(0);
        expect(availableResolutions("GEMINI_NANO_BANANA_2_1")).toEqual(["1K", "2K", "4K"]);
        expect(availableResolutions("GPT_2_5_IMAGE")).toEqual(["1K", "2K", "4K"]);
        expect(MARKET_PROVIDERS.map((provider) => provider.code)).toEqual(["GPT_2_5_IMAGE", "GEMINI_NANO_BANANA_2_1", "GPT_2_5_F_IMAGE"]);
        expect(MARKET_PROVIDERS.every((provider) => provider.maxReferences === 5)).toBe(true);
    });

    test("normalizeConfig 纠正平台/模型不支持的残留值", () => {
        const cleared = normalizeConfig(makeConfig({ platform: "shopify" }));
        expect(cleared.aplusTemplateIds).toEqual([]);
        expect(cleared.aplusAspectRatio).toBe("");

        // 模型目录没有品质档位（GEMINI）→ 保留用户值，不擅自改写
        const quality = normalizeConfig(makeConfig({ provider: "GEMINI_NANO_BANANA_2_1", quality: "xhigh", resolution: "4K" }));
        expect(quality.quality).toBe("xhigh");
        expect(quality.resolution).toBe("4K");

        // 切平台后 A+ 比例回到该平台第一档
        const ratio = normalizeConfig(makeConfig({ platform: "amazon", aplusAspectRatio: "bogus" }));
        expect(ratio.aplusAspectRatio).toBe("970x600");
    });

    test("readMarketConfig 对坏草稿回落默认值并报告问题", () => {
        const ok = readMarketConfig({ sourceAssetIds: ["a"], productInfo: "卖点", platform: "amazon" });
        expect(ok.issues).toEqual([]);
        expect(ok.config.platform).toBe("amazon");

        const bad = readMarketConfig({ platform: "taobao" });
        expect(bad.issues.length).toBeGreaterThan(0);
        expect(bad.config.platform).toBe("amazon");
    });

    test("校验覆盖：缺图/缺商品信息/A+ 平台冲突/品质不支持/封面悬空", () => {
        expect(validateMarketConfig(makeConfig())).toEqual([]);

        const codes = (config: MarketConfig) => validateMarketConfig(config).map((issue) => issue.code);
        expect(codes(makeConfig({ sourceAssetIds: [], coverList: [] }))).toContain("images-required");
        expect(codes(makeConfig({ productInfo: "  " }))).toContain("product-info-required");
        expect(codes(makeConfig({ platform: "shopify", aplusTemplateIds: ["APlusPro"] }))).toContain("aplus-unsupported");
        expect(codes(makeConfig({ provider: "GEMINI_NANO_BANANA_2_1" }))).not.toContain("quality-unsupported");
        expect(codes(makeConfig({ provider: "UNKNOWN_MODEL" }))).toContain("provider-unknown");
        expect(codes(makeConfig({ coverList: ["zzz"] }))).toContain("cover-dangling");
        expect(codes(makeConfig({ aplusAspectRatio: "custom", customWidth: 30, customHeight: 30 }))).toContain("aplus-custom-size");
    });

    test("单元计划按 A+ 模板 × 数量展开，像素来自模板比例", () => {
        const config = normalizeConfig(makeConfig({ aplusTemplateIds: ["APlusPro", "A+"], aplusCount: 2, marketingModuleIds: [] }));
        const expected = marketExpectedCount(config);
        const units = buildMarketUnits(config);
        expect(expected).toBe(4);
        expect(units).toHaveLength(4);
        expect(units[0].id).toBe("APlusPro#1");
        expect(units[0].width).toBe(970);
        expect(units[0].height).toBe(600);
        expect(units[3].id).toBe("A+#2");
        expect(units[0].prompt).toContain("便携榨汁杯");
    });

    test("工具字段覆盖 chunk 真实字段并带品牌基因与画幅像素", () => {
        const config = makeConfig();
        const fields = buildMarketToolFields(config, { images: ["a", "b"], provider: "GPT_2_5_IMAGE" });
        expect(fields.images).toEqual(["a", "b"]);
        expect(fields.provider).toBe("GPT_2_5_IMAGE");
        expect(fields.aplusPixel).toBe("970x600");
        expect(fields.aplusTemplates).toEqual(["APlusPro"]);
        const brandKey = fields.brandKey as Record<string, string>;
        expect(Object.keys(brandKey).sort()).toEqual(["language", "platform", "salesRegion"]);
        expect(brandKey.salesRegion.length).toBeGreaterThan(0);
        expect(fields.name).toBe("榨汁杯项目");
    });

    test("快照指纹随商品信息变化（结果过期判定依赖它）", () => {
        const config = makeConfig();
        const snapshot = createMarketSnapshot(config, { revision: 3, images: ["a", "b"], provider: "GPT_2_5_IMAGE" });
        expect(snapshot.revision).toBe(3);
        expect(isMarketSnapshotStale(snapshot, config, { images: ["a", "b"], provider: "GPT_2_5_IMAGE" })).toBe(false);
        const changed = { ...config, productInfo: "另一个卖点" };
        expect(isMarketSnapshotStale(snapshot, changed, { images: ["a", "b"], provider: "GPT_2_5_IMAGE" })).toBe(true);
        expect(resolveProviderCode(makeConfig({ provider: "" }), "clip-3")).toBe("clip-3");
    });
});

function fakeGateway(behaviour: { status?: ToolTask["status"]; items?: ToolTaskResultItem[]; failOn?: number } = {}) {
    const submitted: string[] = [];
    const gateway: MarketGatewayLike = {
        async submit(input) {
            submitted.push(input.prompt ?? "");
            if (behaviour.failOn !== undefined && submitted.length === behaviour.failOn) {
                throw new Error("upstream 502");
            }
            return makeTask(behaviour.status ?? "succeeded", behaviour.items ?? [{ id: "i1", kind: "image", dataUrl: "data:image/png;base64,xxx" }]);
        },
    };
    return Object.assign(gateway, { submitted });
}

describe("PRODUCT_MARKET_MATERIAL adapter", () => {
    test("源图就绪与页面约束（10M / 384–4096px / 5:1）", () => {
        expect(isMarketSourceReady(makeSource("a"))).toBe(true);
        expect(isMarketSourceReady({ assetId: "a", dataUrl: "", url: "" })).toBe(false);
        expect(isMarketSourceReady(undefined)).toBe(false);

        expect(validateMarketSourceLimits(makeSource("a", { bytes: 11 * 1024 * 1024 })).ok).toBe(false);
        expect(validateMarketSourceLimits(makeSource("a", { width: 300, height: 300 })).ok).toBe(false);
        expect(validateMarketSourceLimits(makeSource("a", { width: 5000, height: 1000 })).ok).toBe(false);
        expect(validateMarketSourceLimits(makeSource("a", { width: 5000, height: 100 })).ok).toBe(false);
        expect(validateMarketSourceLimits(makeSource("a")).ok).toBe(true);
    });

    test("resolveMarketSources 按 coverList 顺序排列，缺图直接报错", () => {
        const config = makeConfig({ sourceAssetIds: ["b", "a"], coverList: ["b", "a"] });
        const ordered = resolveMarketSources(config, [makeSource("a"), makeSource("b")]);
        expect(ordered.map((source) => source.assetId)).toEqual(["b", "a"]);

        expect(() => resolveMarketSources(config, [makeSource("a")])).toThrow(MarketAdapterError);
        expect(() => resolveMarketSources(makeConfig({ sourceAssetIds: [], coverList: [] }), [])).toThrow(MarketAdapterError);
    });

    test("单元输入：count=1、参考图为全部商品图、字段带模块与像素", () => {
        const config = makeConfig();
        const units = buildMarketUnits(config);
        const input = buildMarketUnitInput({ config, unit: units[0], sources: [makeSource("a"), makeSource("b")], provider: "GPT_2_5_IMAGE", draftRevision: 7 });
        expect(input.toolId).toBe(PRODUCT_MARKET_MATERIAL_TOOL_ID);
        expect(input.count).toBe(1);
        expect(input.size).toBe("1:1");
        expect(input.references).toHaveLength(2);
        const fields = input.fields as Record<string, unknown>;
        expect(fields.marketUnitId).toBe(units[0].id);
        expect(fields.marketPixel).toBe("970x600");
        expect(fields.marketDraftRevision).toBe(7);
    });

    test("运行：逐屏真实提交，单屏异常收敛为 failed 且不影响其他屏", async () => {
        const config = normalizeConfig(makeConfig({ aplusTemplateIds: ["APlusPro"], aplusCount: 2, marketingModuleIds: [] }));
        const gateway = fakeGateway({ failOn: 2 });
        const seen: MarketUnitResult[] = [];
        const run = await runMarketMaterial({
            gateway,
            config,
            sources: [makeSource("a"), makeSource("b")],
            provider: "GPT_2_5_IMAGE",
            revision: 5,
            onUnit: (unit) => seen.push(unit),
        });
        expect(run.submitted).toBe(2);
        expect(gateway.submitted).toHaveLength(2);
        expect(run.units[0].status).toBe("succeeded");
        expect(run.units[0].items).toHaveLength(1);
        expect(run.units[1].status).toBe("failed");
        expect(run.units[1].items).toHaveLength(0);
        expect(seen).toHaveLength(2);
        expect(run.revision).toBe(5);
        expect(summarizeMarketRun(run.units)).toEqual({ total: 2, succeeded: 1, failed: 1, pending: 0 });
    });

    test("运行：非法配置直接抛错，一个请求都不发", async () => {
        const gateway = fakeGateway();
        await expect(
            runMarketMaterial({ gateway, config: makeConfig({ productInfo: "" }), sources: [makeSource("a")], provider: "GPT_2_5_IMAGE" }),
        ).rejects.toBeInstanceOf(MarketAdapterError);
        expect(gateway.submitted).toHaveLength(0);
    });

    test("重试只允许失败屏：无 taskId / 已成功 / pending 全部拒绝", async () => {
        const config = makeConfig();
        const unit = buildMarketUnits(config)[0];
        const pending = marketUnitResultFromTask(unit, makeTask("running"));
        expect(pending.status).toBe("pending");

        const gateway = fakeGateway();
        await expect(
            retryMarketUnit({ gateway, config, sources: [makeSource("a")], provider: "GPT_2_5_IMAGE", unit, previous: { ...pending, taskId: undefined } }),
        ).rejects.toBeInstanceOf(MarketAdapterError);
        await expect(
            retryMarketUnit({ gateway, config, sources: [makeSource("a")], provider: "GPT_2_5_IMAGE", unit, previous: { ...pending, status: "succeeded" } }),
        ).rejects.toBeInstanceOf(MarketAdapterError);
        await expect(
            retryMarketUnit({ gateway, config, sources: [makeSource("a")], provider: "GPT_2_5_IMAGE", unit, previous: pending }),
        ).rejects.toBeInstanceOf(MarketAdapterError);
    });

    test("重试：失败屏重新提交并返回新结果", async () => {
        const config = makeConfig();
        const unit = buildMarketUnits(config)[0];
        const failed = marketUnitResultFromTask(unit, makeTask("failed", [], { error: { code: "upstream", message: "boom", retryable: true } }));
        expect(failed.error?.message).toBe("boom");
        const gateway = {
            submitted: [] as string[],
            async submit() {
                return makeTask("succeeded");
            },
            async retry(_taskId: string, _input: unknown) {
                return makeTask("succeeded", [{ id: "x", kind: "image", dataUrl: "data:image/png;base64,y" }]);
            },
        };
        const next = await retryMarketUnit({ gateway, config, sources: [makeSource("a"), makeSource("b")], provider: "GPT_2_5_IMAGE", unit, previous: failed });
        expect(next.status).toBe("succeeded");
        expect(next.items).toHaveLength(1);
        expect(next.unitId).toBe(failed.unitId);
    });

    test("分组与过期判定", async () => {
        const config = normalizeConfig(makeConfig({ aplusTemplateIds: ["APlusPro", "A+"], aplusCount: 1, marketingModuleIds: [] }));
        const units = buildMarketUnits(config);
        const results = units.map((unit) => marketUnitResultFromTask(unit, makeTask(unit.index === 1 ? "succeeded" : "failed")));
        const groups = groupMarketUnits(results);
        expect(groups.map((group) => group.moduleId)).toEqual(["APlusPro", "A+"]);
        expect(groups[0].succeeded).toBe(1);

        const snapshot = createMarketSnapshot(config, { revision: 1, images: ["a", "b"], provider: "GPT_2_5_IMAGE" });
        const run = { units: results, groups, snapshot, fingerprint: snapshot.fingerprint, revision: 1, submitted: results.length };
        expect(marketResultsStale(run, config, { images: ["a", "b"], provider: "GPT_2_5_IMAGE" })).toBe(false);
        expect(marketResultsStale(run, { ...config, productInfo: "改过的卖点" }, { images: ["a", "b"], provider: "GPT_2_5_IMAGE" })).toBe(true);
        expect(unitStatusFromTask(makeTask("unknown"))).toBe("pending");
    });

    test("保存：无内容拒绝，有内容走注入的上传", async () => {
        const unit = buildMarketUnits(makeConfig())[0];
        const empty = marketUnitResultFromTask(unit, makeTask("succeeded", [{ id: "i1", kind: "image" }]));
        await expect(saveMarketResultItem(empty.items[0], empty)).rejects.toBeInstanceOf(MarketAdapterError);

        const filled = marketUnitResultFromTask(unit, makeTask("succeeded", [{ id: "i2", kind: "image", dataUrl: "data:image/png;base64,z" }]));
        const saved = await saveMarketResultItem(filled.items[0], filled, {
            upload: async () => ({ storageKey: "k", url: "https://cdn.test/z.png", bytes: 10, mimeType: "image/png" }),
        });
        expect(saved.storageKey).toBe("k");
        expect(saved.unitId).toBe(unit.id);
        expect(saved.itemId).toBe("i2");
    });
});

describe("工作区渲染（无网络、无假结果）", () => {
    test("首屏渲染四块区域，未满足条件时生成按钮禁用", async () => {
        const store = new Map<string, string>();
        Object.defineProperty(globalThis, "localStorage", {
            configurable: true,
            value: {
                getItem: (key: string) => store.get(key) ?? null,
                setItem: (key: string, value: string) => void store.set(key, value),
                removeItem: (key: string) => void store.delete(key),
                clear: () => store.clear(),
            },
        });
        const React = await import("react");
        const { renderToStaticMarkup } = await import("react-dom/server");
        const { MemoryRouter } = await import("react-router-dom");
        const { ProductMarketMaterialWorkspace } = await import("@/components/tools/workspaces/suite");
        const tree = React.createElement(MemoryRouter, null, React.createElement(ProductMarketMaterialWorkspace));
        const html = renderToStaticMarkup(tree);
        expect(html).toContain("多视角白底商品");
        expect(html).toContain("商品信息");
        expect(html).toContain("品牌与合规");
        expect(html).toContain("A+图设置");
        expect(html).toContain("主副图设置");
        expect(html).toMatch(/<button[^>]*disabled[^>]*title="至少上传 1 张商品图。"[^>]*>开始生成/);
    });
});
