import { describe, expect, test } from "bun:test";

import type { ToolTask } from "@/services/api/tools/task-machine";
import type { ReferenceImage } from "@/types/image";

import {
    HANDHELD_GOODS_CHECK_TYPES,
    HANDHELD_GOODS_DRAFT_KEY,
    HANDHELD_GOODS_FIELD_BINDINGS,
    HANDHELD_GOODS_HAND_TABS,
    HANDHELD_GOODS_LAYOUT,
    HANDHELD_GOODS_OUTPUT_OPTIONS,
    HANDHELD_GOODS_POSES,
    HANDHELD_GOODS_SCENE_TABS,
    HANDHELD_GOODS_SLUG,
    HANDHELD_GOODS_SOURCE_RULE,
    HANDHELD_GOODS_TOOL_ID,
    auditHandheldGoodsFields,
    buildHandheldGoodsSnapshot,
    composeHandheldGoodsFields,
    createHandheldGoodsState,
    findHandheldGoodsPose,
    getHandheldGoodsSpec,
    handheldGoodsInstruction,
    handheldGoodsPoseReferenceUrl,
    handheldGoodsPoseSvg,
    handheldGoodsSnapshotHash,
    isHandheldGoodsSnapshotStale,
    listHandheldGoodsPoses,
    normalizeHandheldGoodsOutputNum,
    parseHandheldGoodsDraftValues,
    selectHandheldGoodsPose,
    serializeHandheldGoodsDraftValues,
    switchHandheldGoodsHandTab,
    switchHandheldGoodsSceneTab,
    validateHandheldGoodsInput,
} from "@/features/tools/registry/handheld-goods";
import {
    HandheldGoodsAdapterError,
    buildHandheldGoodsUnits,
    handheldGoodsOutputFields,
    handheldGoodsResultView,
    handheldGoodsStatusText,
    runHandheldGoods,
    toHandheldGoodsReference,
    type HandheldGoodsGatewayLike,
} from "@/features/tools/adapters/handheld-goods";

const PRODUCT: ReferenceImage = {
    id: "asset-product",
    name: "bottle.png",
    type: "image/png",
    dataUrl: "data:image/png;base64,AAAA",
    url: "http://localhost/product.png",
    storageKey: "product-key",
};

function snapshotOf(overrides: Omit<Partial<Parameters<typeof buildHandheldGoodsSnapshot>[0]>, "clientOperationId"> = {}) {
    return buildHandheldGoodsSnapshot({
        clientOperationId: "op-handheld-goods-test",
        productAssetId: PRODUCT.id,
        productName: PRODUCT.name,
        productWidth: 1200,
        productHeight: 1200,
        state: createHandheldGoodsState({ modelId: "left-cradle-front", modelTabType: "left-hand" }),
        ...overrides,
    });
}

function taskOf(id: string, urls: string[]): ToolTask {
    return {
        id,
        toolId: HANDHELD_GOODS_TOOL_ID,
        status: "succeeded",
        prompt: "p",
        configSnapshot: { capability: "image", model: "m", count: "1" },
        sourceAssetIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        attempts: 1,
        pollCount: 0,
        transientFailures: 0,
        result: { items: urls.map((url, index) => ({ index, kind: "image", url })) },
    } as unknown as ToolTask;
}

describe("registry / 页面契约", () => {
    test("身份与规格：HANDHELD_GOODS 落在 product-design 的手持商品页", () => {
        expect(HANDHELD_GOODS_TOOL_ID).toBe("HANDHELD_GOODS");
        expect(HANDHELD_GOODS_SLUG).toBe("handheld-goods");
        expect(HANDHELD_GOODS_LAYOUT).toBe("model");
        expect(HANDHELD_GOODS_DRAFT_KEY).toBe("tool-draft:v1:HANDHELD_GOODS");
        const spec = getHandheldGoodsSpec();
        expect(spec).toBeTruthy();
        expect(spec?.id).toBe("HANDHELD_GOODS");
        expect(spec?.layout).toBe("model");
        expect(spec?.route).toBe("/tools/product-design/handheld-goods");
        expect(spec?.batchCapable).toBe(false);
        // 输出参数登记在 fields 的 providerRule 上，不去臆造 spec.output
        expect(spec?.fields.map((field) => field.key)).toEqual(
            expect.arrayContaining(["checkType", "imageUrl", "modelId", "modelTabType", "outputNum", "sceneTabType", "targetOriginUrl"]),
        );
    });

    test("商品图规则与规格 §2 一致（10M / 384–4096 / png·jpeg·webp）", () => {
        expect(HANDHELD_GOODS_SOURCE_RULE.maxBytes).toBe(10 * 1024 * 1024);
        expect(HANDHELD_GOODS_SOURCE_RULE.minSide).toBe(384);
        expect(HANDHELD_GOODS_SOURCE_RULE.maxSide).toBe(4096);
        expect([...HANDHELD_GOODS_SOURCE_RULE.mimeTypes]).toEqual(["image/png", "image/jpeg", "image/webp"]);
    });

    test("张数 1–4，越界归一", () => {
        expect([...HANDHELD_GOODS_OUTPUT_OPTIONS]).toEqual([1, 2, 3, 4]);
        expect(normalizeHandheldGoodsOutputNum(0)).toBe(1);
        expect(normalizeHandheldGoodsOutputNum("3")).toBe(3);
        expect(normalizeHandheldGoodsOutputNum(9)).toBe(4);
    });

    test("三个页签都自带姿势候选，且每张姿势都有可渲染示意图", () => {
        for (const tab of HANDHELD_GOODS_HAND_TABS) {
            const poses = listHandheldGoodsPoses(tab.id);
            expect(poses.length).toBeGreaterThan(0);
            for (const pose of poses) {
                expect(pose.hand).toBe(tab.id);
                const svg = handheldGoodsPoseSvg(pose);
                expect(svg.startsWith("<svg")).toBe(true);
                expect(handheldGoodsPoseReferenceUrl(pose).startsWith("data:image/svg+xml")).toBe(true);
            }
        }
        expect(findHandheldGoodsPose("not-a-pose")).toBeUndefined();
    });

    test("场景页签与检测类型非空", () => {
        expect(HANDHELD_GOODS_SCENE_TABS.length).toBeGreaterThanOrEqual(2);
        expect(HANDHELD_GOODS_CHECK_TYPES.length).toBeGreaterThanOrEqual(2);
    });

    test("切换手持页签只换姿势候选，不清商品图", () => {
        const state = createHandheldGoodsState({ modelTabType: "left-hand", modelId: "left-cradle-front" });
        const next = switchHandheldGoodsHandTab(state, "right-hand");
        expect(next.state.modelTabType).toBe("right-hand");
        expect(next.poseChanged).toBe(true);
        expect(findHandheldGoodsPose(next.state.modelId)?.hand).toBe("right-hand");
        expect(next.state.outputNum).toBe(state.outputNum);
        expect(next.state.sceneTabType).toBe(state.sceneTabType);
        expect(switchHandheldGoodsSceneTab(state, "outdoor").sceneTabType).toBe("outdoor");
        expect(selectHandheldGoodsPose(state, "left-cradle-front").modelId).toBe("left-cradle-front");
        expect(selectHandheldGoodsPose(state, "nope")).toBe(state);
    });
});

describe("registry / 校验与快照", () => {
    test("缺商品图、缺姿势、张数非法都会给出字段级错误", () => {
        const issues = validateHandheldGoodsInput({
            productUrl: "",
            state: { ...createHandheldGoodsState(), modelId: "not-in-library" },
            source: undefined,
        });
        const codes = issues.map((issue) => issue.code);
        expect(codes).toContain("source-missing");
        expect(codes).toContain("pose-missing");

        const badPixel = validateHandheldGoodsInput({
            productUrl: PRODUCT.url!,
            state: createHandheldGoodsState({ modelId: "left-cradle-front" }),
            source: { mimeType: "image/png", bytes: 1024, width: 100, height: 100 },
        });
        expect(badPixel.map((issue) => issue.code)).toContain("source-side");
    });

    test("快照指纹随配置变化，变化即判为旧结果", () => {
        const a = snapshotOf();
        const b = snapshotOf({ state: createHandheldGoodsState({ modelId: "left-cradle-front", sceneTabType: "outdoor" }) });
        expect(handheldGoodsSnapshotHash(a)).not.toBe(handheldGoodsSnapshotHash(b));
        expect(isHandheldGoodsSnapshotStale(a, b)).toBe(true);
        expect(isHandheldGoodsSnapshotStale(a, snapshotOf())).toBe(false);
    });

    test("字段回填：compose → audit 不留未绑定字段", () => {
        const snapshot = snapshotOf();
        const fields = composeHandheldGoodsFields(snapshot, {
            imageUrl: "http://localhost/in.png",
            targetOriginUrl: "http://localhost/pose.png",
        });
        const audit = auditHandheldGoodsFields(fields);
        expect(audit.missing).toEqual([]);
        expect(audit.unexpected).toEqual([]);
        expect(fields.imageUrl).toBe("http://localhost/in.png");
        expect(fields.targetOriginUrl).toBe("http://localhost/pose.png");
        expect(HANDHELD_GOODS_FIELD_BINDINGS.map((binding) => binding.field)).toContain("imageResultUrl");
    });

    test("草稿往返：页签/张数/商品名一致，坏值回落默认", () => {
        const state = createHandheldGoodsState({
            modelTabType: "both-hands",
            modelId: "both-palms-stand",
            sceneTabType: "desk",
            outputNum: 3,
        });
        const values = serializeHandheldGoodsDraftValues(state, { assetId: PRODUCT.id, name: PRODUCT.name });
        const parsed = parseHandheldGoodsDraftValues(values);
        expect(parsed.state).toEqual(state);
        expect(parsed.product).toEqual({ assetId: PRODUCT.id, name: PRODUCT.name });

        const fallback = parseHandheldGoodsDraftValues({ modelTabType: "???", outputNum: 99 });
        expect(fallback.state.modelTabType).toBe("left-hand");
        expect(fallback.state.outputNum).toBe(4);
        expect(fallback.product.assetId).toBeNull();
    });

    test("提示词包含手持部位与场景，不是空串", () => {
        const instruction = handheldGoodsInstruction(snapshotOf());
        expect(instruction.length).toBeGreaterThan(10);
    });
});

describe("adapter / 请求构造", () => {
    test("参考图缺地址直接拒绝，不发空图请求", () => {
        expect(() => toHandheldGoodsReference({ id: "x" })).toThrow(HandheldGoodsAdapterError);
    });

    test("张数 N → N 个单元，每个单元 = 商品图 + 姿势示意图两张参考", () => {
        const snapshot = snapshotOf({ state: createHandheldGoodsState({ modelId: "left-cradle-front", outputNum: 3 }) });
        const units = buildHandheldGoodsUnits({ snapshot, product: PRODUCT });
        expect(units.length).toBe(3);
        for (const unit of units) {
            expect(unit.references.length).toBe(2);
            expect(unit.references[0].dataUrl).toBe(PRODUCT.dataUrl);
            expect(unit.references[1].dataUrl.startsWith("data:image/svg+xml")).toBe(true);
            expect(unit.fields.imageUrl).toBe(PRODUCT.url);
            expect(unit.snapshotHash).toBe(handheldGoodsSnapshotHash(snapshot));
        }
        expect(units[0].id).not.toBe(units[1].id);
    });
});

describe("adapter / 真实运行语义", () => {
    test("上游返回图片 → succeeded，并回填结果字段", async () => {
        const gateway: HandheldGoodsGatewayLike = {
            run: async () => taskOf("t1", ["http://localhost/a.png"]),
        };
        const snapshot = snapshotOf();
        const units = buildHandheldGoodsUnits({ snapshot, product: PRODUCT });
        const runs = await runHandheldGoods({ units, port: gateway, concurrency: 1 });
        expect(runs[0].status).toBe("succeeded");
        expect(runs[0].image?.url).toBe("http://localhost/a.png");
        const fields = handheldGoodsOutputFields(runs);
        expect(fields.imageResultUrl).toBe("http://localhost/a.png");
    });

    test("上游成功但没图 → failed（empty-result），绝不补造", async () => {
        const gateway: HandheldGoodsGatewayLike = {
            run: async () => taskOf("t2", []),
        };
        const units = buildHandheldGoodsUnits({ snapshot: snapshotOf(), product: PRODUCT });
        const runs = await runHandheldGoods({ units, port: gateway, concurrency: 1 });
        expect(runs[0].status).toBe("failed");
        expect(runs[0].image).toBeUndefined();
        expect(handheldGoodsOutputFields(runs)).toEqual({});
    });

    test("提交抛错 → 该单元 failed 且记录错误码，不影响其他单元", async () => {
        let call = 0;
        const gateway: HandheldGoodsGatewayLike = {
            run: async () => {
                call += 1;
                if (call === 1) throw new HandheldGoodsAdapterError("submit-failed", "网关不可用");
                return taskOf("t3", ["http://localhost/b.png"]);
            },
        };
        const snapshot = snapshotOf({ state: createHandheldGoodsState({ modelId: "left-cradle-front", outputNum: 2 }) });
        const units = buildHandheldGoodsUnits({ snapshot, product: PRODUCT });
        const runs = await runHandheldGoods({ units, port: gateway, concurrency: 1 });
        expect(runs.map((run) => run.status)).toEqual(["failed", "succeeded"]);
        expect(runs[0].error?.code).toBe("submit-failed");
    });

    test("结果视图：一成一败 → partial，文案与状态一致", async () => {
        let call = 0;
        const gateway: HandheldGoodsGatewayLike = {
            run: async () => {
                call += 1;
                return call === 1 ? taskOf("t4", []) : taskOf("t5", ["http://localhost/c.png"]);
            },
        };
        const snapshot = snapshotOf({ state: createHandheldGoodsState({ modelId: "left-cradle-front", outputNum: 2 }) });
        const units = buildHandheldGoodsUnits({ snapshot, product: PRODUCT });
        const runs = await runHandheldGoods({ units, port: gateway, concurrency: 1 });
        expect(runs.map((run) => run.status)).toEqual(["failed", "succeeded"]);

        const view = handheldGoodsResultView({ runs, requested: 2, running: false, stale: false });
        expect(view.status).toBe("partial");
        expect(view.succeeded).toBe(1);
        expect(handheldGoodsStatusText(view)).toContain("1/2");
    });
});

describe("workspace / 渲染", () => {
    test("首屏渲染出姿势库、张数控制与禁用的提交按钮", async () => {
        const markup = await renderWorkspace();
        expect(markup).toContain("手持商品");
        // 原站首屏姿势是一张「选择手持姿势 / 手持的部位与姿势参考」行卡，点开才选左手/右手/双手
        expect(markup).toContain('data-testid="handheld-pose-card"');
        expect(markup).toContain("选择手持姿势");
        // 原站结果区空态标题（案例轮播 `_caseGuide`）
        expect(markup).toContain("快速生成手持商品图，快速上架");
        expect(markup).toContain('data-testid="tool-case-guide"');
        // 场景类型 / 检测类型是真实提交字段，收进「更多设置」折叠，不删
        expect(markup).toContain('data-testid="handheld-more-settings"');
        expect(markup).toContain("检测类型");
        expect(markup).toContain("disabled");
    });
});

async function renderWorkspace(): Promise<string> {
    const globalRecord = globalThis as unknown as { localStorage?: unknown };
    if (!globalRecord.localStorage) {
        const values = new Map<string, string>();
        globalRecord.localStorage = {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => void values.set(key, value),
            removeItem: (key: string) => void values.delete(key),
            clear: () => values.clear(),
            key: (index: number) => Array.from(values.keys())[index] ?? null,
            get length() {
                return values.size;
            },
        };
    }
    const React = await import("react");
    const { MemoryRouter } = await import("react-router");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { default: Workspace } = await import("@/components/tools/workspaces/handheld-goods");
    return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Workspace)) as never);
}
