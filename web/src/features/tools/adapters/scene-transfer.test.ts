import { describe, expect, test } from "bun:test";

import type { BrowserToolInput } from "@/services/api/tools/gateway";
import type { ToolTask } from "@/services/api/tools/task-machine";

import {
    DEFAULT_SCENE_TRANSFER_VALUES,
    SCENE_TRANSFER_FIELD_KEYS,
    SCENE_TRANSFER_INDEX,
    SCENE_TRANSFER_LAYOUT,
    SCENE_TRANSFER_MAKE_TYPE,
    SCENE_TRANSFER_ROUTE,
    SCENE_TRANSFER_SNAPSHOT_SLOT,
    SCENE_TRANSFER_TOOL_ID,
    buildTransferPrompt,
    clampSimilarity,
    createSceneTransferSnapshot,
    describeTransferDrift,
    describeTransferReferences,
    restoreSceneTransferSnapshot,
    readSceneTransferValues,
    resolveTransferSegmentation,
    serializeSceneTransferValues,
    similarityLabel,
    validateSceneTransferState,
    type SceneTransferValues,
} from "@/features/tools/registry/scene-transfer";
import {
    SceneTransferAdapterError,
    assertTransferInput,
    buildTransferFields,
    buildTransferInput,
    retrySceneTransfer,
    runSceneTransfer,
    sceneTransferCells,
    sceneTransferResultFromTask,
    summarizeTransferExecution,
    toTransferReference,
    transferImageRef,
    type SceneTransferAsset,
    type SceneTransferGateway,
} from "@/features/tools/adapters/scene-transfer";

/* 网关 / store / i18n 在模块加载期会读 localStorage；这里先补一个内存实现，
 * 再用动态 import 拉网关，避免静态导入把 i18n 在 shim 之前加载。 */
const memoryStorage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: (key: string) => memoryStorage.get(key) ?? null,
        setItem: (key: string, value: string) => void memoryStorage.set(key, value),
        removeItem: (key: string) => void memoryStorage.delete(key),
        clear: () => memoryStorage.clear(),
        key: (index: number) => Array.from(memoryStorage.keys())[index] ?? null,
        get length() {
            return memoryStorage.size;
        },
    },
});

const PRODUCT: SceneTransferAsset = {
    assetId: "asset-product-1",
    id: "asset-product-1",
    name: "bag.png",
    url: "https://cdn.example.com/bag.png",
    mimeType: "image/png",
    width: 1200,
    height: 1600,
};

const STYLE: SceneTransferAsset = {
    assetId: "asset-style-1",
    id: "asset-style-1",
    name: "beach.jpg",
    url: "https://cdn.example.com/beach.jpg",
    mimeType: "image/jpeg",
};

function values(patch: Partial<SceneTransferValues> = {}): SceneTransferValues {
    return {
        ...DEFAULT_SCENE_TRANSFER_VALUES,
        imageUrl: PRODUCT.url ?? "",
        imageStyleUrl: STYLE.url ?? "",
        ...patch,
    };
}

function succeededTask(items: number, status: ToolTask["status"] = "succeeded"): ToolTask {
    const now = new Date().toISOString();
    return {
        id: "task-transfer-1",
        toolId: SCENE_TRANSFER_TOOL_ID,
        status,
        createdAt: now,
        updatedAt: now,
        pollCount: 1,
        ...(status === "succeeded"
            ? {
                  result: {
                      items: Array.from({ length: items }, (_, index) => ({
                          id: `item-${index}`,
                          kind: "image" as const,
                          dataUrl: `data:image/png;base64,${index}`,
                      })),
                  },
              }
            : { error: { code: "provider-error", message: "上游 500", retryable: true } }),
    } as unknown as ToolTask;
}

describe("SCENE_TRANSFER 契约", () => {
    test("工具常量与 registry 声明一致", () => {
        expect(SCENE_TRANSFER_TOOL_ID).toBe("SCENE_TRANSFER");
        expect(SCENE_TRANSFER_ROUTE).toBe("/tools/product-design/scene-transfer");
        expect(SCENE_TRANSFER_LAYOUT).toBe("scene");
        expect(SCENE_TRANSFER_INDEX).toBe(33);
        expect(SCENE_TRANSFER_MAKE_TYPE).toBe(63);
        expect(SCENE_TRANSFER_FIELD_KEYS).toEqual(["imageStyleUrl", "imageUrl", "segImageUrl", "similarity"]);
    });

    test("网关里的 4 个字段与页面契约完全对齐", async () => {
        const { describeToolExecution } = await import("@/services/api/tools/gateway");
        const descriptor = describeToolExecution(SCENE_TRANSFER_TOOL_ID);
        expect(descriptor.executable).toBe(true);
        expect([...descriptor.fields].sort()).toEqual([...SCENE_TRANSFER_FIELD_KEYS].sort());
    });

    test("相似度按 5 的步长收敛，越界与脏数据都不放过", () => {
        expect(clampSimilarity(0)).toBe(0);
        expect(clampSimilarity(100)).toBe(100);
        expect(clampSimilarity(73)).toBe(75);
        expect(clampSimilarity(-8)).toBe(0);
        expect(clampSimilarity(130)).toBe(100);
        expect(clampSimilarity("88")).toBe(90);
        expect(clampSimilarity("abc")).toBe(DEFAULT_SCENE_TRANSFER_VALUES.similarity);
        expect(clampSimilarity(Number.NaN)).toBe(DEFAULT_SCENE_TRANSFER_VALUES.similarity);
        expect(similarityLabel(70)).toContain("70%");
    });

    test("草稿读写只认契约字段", () => {
        const parsed = readSceneTransferValues({ similarity: 85, imageUrl: "https://a/b.png", junk: 1 });
        expect(parsed.similarity).toBe(85);
        expect(parsed.imageUrl).toBe("https://a/b.png");
        expect(parsed.imageStyleUrl).toBe("");
        const serialized = serializeSceneTransferValues(values({ similarity: 42 }));
        expect(Object.keys(serialized).sort()).toEqual(
            ["imageStyleUrl", "imageUrl", "segImageUrl", "similarity"].sort(),
        );
        expect(serialized.similarity).toBe(40);
    });
});

describe("商品分割图不伪造", () => {
    test("没有分割图时不写 segImageUrl，并给出真实原因", () => {
        const segmentation = resolveTransferSegmentation({});
        expect(segmentation.provided).toBe(false);
        expect(segmentation.segImageUrl).toBeUndefined();
        expect(segmentation.message).toContain("没有分割服务");
    });

    test("有真实分割图时才标记 provided", () => {
        const segmentation = resolveTransferSegmentation({ segImageUrl: "https://cdn.example.com/seg.png" });
        expect(segmentation.provided).toBe(true);
        expect(segmentation.segImageUrl).toBe("https://cdn.example.com/seg.png");
    });

    test("参考图顺序在提示词里写死，避免模型猜哪张是商品", () => {
        const withSeg = describeTransferReferences({ segmentation: true });
        expect(withSeg[0]).toContain("第 1 张参考图 = 商品图");
        expect(withSeg[1]).toContain("第 2 张参考图 = 场景风格参考图");
        expect(withSeg[2]).toContain("第 3 张参考图 = 商品分割图");
        expect(describeTransferReferences({ segmentation: false })).toHaveLength(2);
    });

    test("提示词里带真实相似度数值", () => {
        const prompt = buildTransferPrompt(values({ similarity: 55 }), resolveTransferSegmentation({}));
        expect(prompt).toContain("similarity = 55%");
        expect(prompt).toContain("第 1 张参考图 = 商品图");
        expect(prompt).not.toContain("第 3 张参考图");
    });
});

describe("提交前校验", () => {
    const base = { productReady: true, styleReady: true, imageModelReady: true };

    test("缺商品图 / 缺风格图 / 缺模型都各报一条", () => {
        const issues = validateSceneTransferState({
            values: values(),
            productReady: false,
            styleReady: false,
            imageModelReady: false,
        });
        expect(issues.map((issue) => issue.code).sort()).toEqual(["model-missing", "product-missing", "style-missing"]);
    });

    test("分割图默认不阻断提交，显式要求时才阻断", () => {
        const segmentation = resolveTransferSegmentation({});
        expect(validateSceneTransferState({ values: values(), ...base, segmentation })).toHaveLength(0);
        const issues = validateSceneTransferState({
            values: values(),
            ...base,
            segmentation,
            requireSegmentation: true,
        });
        expect(issues.map((issue) => issue.code)).toEqual(["segmentation-missing"]);
    });

    test("网关不可执行与相似度越界都如实拦截", () => {
        const issues = validateSceneTransferState({
            values: values({ similarity: 140 }),
            ...base,
            executable: false,
        });
        expect(issues.map((issue) => issue.code).sort()).toEqual(["not-executable", "similarity-invalid"]);
    });
});

describe("请求构造与守卫", () => {
    test("两张参考图顺序固定：第 1 张商品，第 2 张风格", () => {
        const input = buildTransferInput({ values: values(), product: PRODUCT, style: STYLE });
        expect(input.references?.length).toBe(2);
        expect(input.references?.[0].url).toBe(PRODUCT.url);
        expect(input.references?.[1].url).toBe(STYLE.url);
        expect(input.count).toBe(1);
        expect(input.prompt).toContain("similarity = 65%");
        expect((input.fields as Record<string, unknown>).similarity).toBe(0.65);
    });

    test("没有分割图时字段里不出现 segImageUrl", () => {
        const input = buildTransferInput({ values: values(), product: PRODUCT, style: STYLE });
        const fields = (input.fields ?? {}) as Record<string, unknown>;
        expect(Object.keys(fields).sort()).toEqual(["imageStyleUrl", "imageUrl", "similarity"]);
        expect("segImageUrl" in fields).toBe(false);
    });

    test("提供真实分割图时才补第 3 张参考图与 segImageUrl", () => {
        const segAsset: SceneTransferAsset = {
            assetId: "asset-seg-1",
            name: "seg.png",
            url: "https://cdn.example.com/seg.png",
            mimeType: "image/png",
        };
        const segmentation = resolveTransferSegmentation({ segImageUrl: segAsset.url });
        const input = buildTransferInput({
            values: values(),
            product: PRODUCT,
            style: STYLE,
            segmentation,
            segAsset,
        });
        expect(input.references?.length).toBe(3);
        expect(input.references?.[2].url).toBe(segAsset.url);
        expect((input.fields as Record<string, unknown>).segImageUrl).toBe(segAsset.url);
        expect(input.prompt).toContain("第 3 张参考图");
    });

    test("字段用 URL 或本地资产 ID，data URL 不进字段", () => {
        expect(transferImageRef(PRODUCT)).toBe("https://cdn.example.com/bag.png");
        expect(transferImageRef({ assetId: "asset-x", dataUrl: "data:image/png;base64,AAA" })).toBe("asset-x");
        expect(() => toTransferReference({ assetId: "asset-y" }, "商品图")).toThrow(SceneTransferAdapterError);
    });

    test("相似度被吞 / 丢图 / 多图都会在提交前抛错", () => {
        const input = buildTransferInput({ values: values({ similarity: 40 }), product: PRODUCT, style: STYLE });
        const segmentation = resolveTransferSegmentation({});
        expect(() =>
            assertTransferInput(input, { values: values({ similarity: 90 }), segmentation }),
        ).toThrow(/相似度|similarity/);
        expect(() =>
            assertTransferInput(
                { ...input, references: [input.references![0]] },
                { values: values({ similarity: 40 }), segmentation },
            ),
        ).toThrow(/参考图数量/);
        expect(() =>
            assertTransferInput(
                { ...input, fields: { ...(input.fields as Record<string, unknown>), segImageUrl: "https://x/seg.png" } },
                { values: values({ similarity: 40 }), segmentation },
            ),
        ).toThrow(/segImageUrl/);
    });

    test("商品图与页面对不上时抛错", () => {
        const input = buildTransferInput({ values: values(), product: PRODUCT, style: STYLE });
        expect(() =>
            assertTransferInput(input, {
                values: values(),
                segmentation: resolveTransferSegmentation({}),
                productRef: "https://cdn.example.com/other.png",
            }),
        ).toThrow(/一致/);
    });

    test("合法请求不抛错", () => {
        const input = buildTransferInput({ values: values(), product: PRODUCT, style: STYLE });
        expect(() =>
            assertTransferInput(input, {
                values: values(),
                segmentation: resolveTransferSegmentation({}),
                productRef: PRODUCT.url,
                styleRef: STYLE.url,
            }),
        ).not.toThrow();
    });
});

describe("真实提交（fake gateway）", () => {
    function fakeGateway(captured: BrowserToolInput[], finalStatus: ToolTask["status"] = "succeeded"): SceneTransferGateway {
        return {
            submit: async (input) => {
                captured.push(input);
                return succeededTask(1, "running");
            },
            waitForResult: async () => succeededTask(1, finalStatus),
        };
    }

    test("提交一次、等待完成，快照记录真实参数", async () => {
        const captured: BrowserToolInput[] = [];
        const run = await runSceneTransfer({
            gateway: fakeGateway(captured),
            values: values({ similarity: 65 }),
            product: PRODUCT,
            style: STYLE,
        });
        expect(captured).toHaveLength(1);
        expect(captured[0].references?.length).toBe(2);
        expect(run.snapshot.similarity).toBe(65);
        expect(run.snapshot.segmentationProvided).toBe(false);
        expect(run.snapshot.fieldKeys).toEqual([...SCENE_TRANSFER_FIELD_KEYS]);
        expect(run.task.status).toBe("succeeded");
    });

    test("没有可用模型时不提交", async () => {
        const captured: BrowserToolInput[] = [];
        let rejected: unknown;
        try {
            await runSceneTransfer({
                gateway: fakeGateway(captured),
                values: values(),
                product: PRODUCT,
                style: STYLE,
                imageModelReady: false,
            });
        } catch (error) {
            rejected = error;
        }
        expect(rejected).toBeInstanceOf(SceneTransferAdapterError);
        expect((rejected as SceneTransferAdapterError).code).toBe("invalid-config");
        expect(captured).toHaveLength(0);
    });

    test("缺风格图时不提交", async () => {
        const captured: BrowserToolInput[] = [];
        await expect(
            runSceneTransfer({ gateway: fakeGateway(captured), values: values(), product: PRODUCT, style: {} }),
        ).rejects.toThrow();
        expect(captured).toHaveLength(0);
    });

    test("重试沿用当前页面参数而不是旧参数", async () => {
        const captured: BrowserToolInput[] = [];
        let retriedId = "";
        const run = await retrySceneTransfer({
            gateway: {
                submit: async () => succeededTask(1, "failed"),
                retry: async (taskId, input) => {
                    retriedId = taskId;
                    captured.push(input);
                    return succeededTask(1, "succeeded");
                },
            },
            taskId: "task-transfer-1",
            values: values({ similarity: 95 }),
            product: PRODUCT,
            style: STYLE,
        });
        expect(retriedId).toBe("task-transfer-1");
        expect(captured[0].prompt).toContain("similarity = 95%");
        expect(run.task.status).toBe("succeeded");
    });
});

describe("结果展示", () => {
    test("成功 1 张 → 1 个 ready 单元；空结果不冒充成功", () => {
        expect(sceneTransferCells(succeededTask(1))).toHaveLength(1);
        expect(sceneTransferCells(succeededTask(1))[0].status).toBe("ready");
        expect(sceneTransferCells(succeededTask(0))[0].status).toBe("missing");
        expect(sceneTransferCells(succeededTask(1, "failed"))[0].status).toBe("failed");
        expect(sceneTransferCells(succeededTask(1, "running"))[0].status).toBe("pending");
    });

    test("无分割图的结果明确标注整图级迁移", () => {
        const snapshot = createSceneTransferSnapshot({
            values: values(),
            product: PRODUCT,
            style: STYLE,
            segmentation: resolveTransferSegmentation({}),
            revision: 3,
        });
        const view = sceneTransferResultFromTask(succeededTask(1), snapshot, snapshot);
        expect(view.ready).toBe(1);
        expect(view.stale).toBe("");
        expect(view.segmentationNotice).toContain("没有 segImageUrl");
    });

    test("提交后改了相似度 → 结果标记为旧配置", () => {
        const segmentation = resolveTransferSegmentation({});
        const before = createSceneTransferSnapshot({ values: values({ similarity: 70 }), product: PRODUCT, style: STYLE, segmentation });
        const after = createSceneTransferSnapshot({ values: values({ similarity: 30 }), product: PRODUCT, style: STYLE, segmentation });
        expect(describeTransferDrift(before, after)).toContain("相似度（70% → 30%）");
        expect(describeTransferDrift(before, before)).toBe("");
    });

    test("网关能力说明不做成功假设", () => {
        const withAll = summarizeTransferExecution({
            executable: true,
            fields: [...SCENE_TRANSFER_FIELD_KEYS],
        } as unknown as Parameters<typeof summarizeTransferExecution>[0]);
        expect(withAll.executable).toBe(true);
        expect(withAll.notes).toHaveLength(0);
        const missingField = summarizeTransferExecution({
            executable: false,
            fields: ["imageUrl", "imageStyleUrl", "similarity"],
        } as unknown as Parameters<typeof summarizeTransferExecution>[0]);
        expect(missingField.executable).toBe(false);
        expect(missingField.notes.join(" ")).toContain("segImageUrl");
    });
});

describe("工作区渲染（SSR）", () => {
    async function renderWorkspace(): Promise<string> {
        const React = await import("react");
        const { renderToStaticMarkup } = await import("react-dom/server");
        const { MemoryRouter } = await import("react-router-dom");
        const { SceneTransferWorkspace } = await import("@/components/tools/workspaces/scene");
        const tree = React.createElement(MemoryRouter, null, React.createElement(SceneTransferWorkspace));
        return renderToStaticMarkup(tree as Parameters<typeof renderToStaticMarkup>[0]);
    }

    test("分区与原站一致：商品图 / 风格图 / 风格相似度 / 立即生成 / 生成结果", async () => {
        const html = await renderWorkspace();
        expect(html).toContain('data-testid="scene-transfer-workspace"');
        for (const id of [
            "scene-transfer-product",
            "scene-transfer-style",
            "scene-transfer-similarity",
            "scene-transfer-similarity-slider",
            "scene-transfer-submit",
            "scene-transfer-result",
            "scene-transfer-snapshot-empty",
        ]) {
            expect(html).toContain(`data-testid="${id}"`);
        }
        expect(html).toContain("风格相似度：");
        expect(html).toContain("立即生成");
        expect(html).not.toContain("SCENE_TRANSFER-seg");
        for (const slot of ["product", "style"]) {
            expect(html).toContain(`data-tool-asset-input="SCENE_TRANSFER-${slot}"`);
        }
    });

    test("未上传商品图与风格图时生成按钮禁用（原站 disabled = !商品图 || !风格图）", async () => {
        const html = await renderWorkspace();
        expect(html).toMatch(/data-testid="scene-transfer-submit"[^>]*disabled/);
    });

    test("默认风格相似度 0.65（原站 Slider 0–1）", async () => {
        const html = await renderWorkspace();
        expect(html).toContain(">0.65<");
    });
});

describe("提交快照持久化（刷新恢复）", () => {
    const values: SceneTransferValues = {
        ...DEFAULT_SCENE_TRANSFER_VALUES,
        imageUrl: "asset-product",
        imageStyleUrl: "asset-style",
        similarity: 82,
    };

    const build = () =>
        createSceneTransferSnapshot({
            values,
            product: { assetId: "asset-product" },
            style: { assetId: "asset-style" },
            segmentation: resolveTransferSegmentation(values),
            revision: 7,
            now: () => "2026-10-29T00:00:00.000Z",
        });

    test("快照写进草稿槽位后能原样恢复", () => {
        expect(SCENE_TRANSFER_SNAPSHOT_SLOT).toBe("sceneTransferSnapshot");
        const snapshot = build();
        const restored = restoreSceneTransferSnapshot(JSON.parse(JSON.stringify(snapshot)));
        expect(restored).toEqual(snapshot);
        expect(restored?.similarity).toBe(80); // 滑杆 step=5，82 收敛到 80
        expect(restored).toEqual(snapshot);
        expect(restored?.capturedAt).toBe("2026-10-29T00:00:00.000Z");
        expect(restored?.fieldKeys).toEqual([...SCENE_TRANSFER_FIELD_KEYS]);
    });

    test("坏数据直接拒绝，不半真半假地渲染快照", () => {
        expect(restoreSceneTransferSnapshot(null)).toBeUndefined();
        expect(restoreSceneTransferSnapshot("sceneTransfer")).toBeUndefined();
        expect(restoreSceneTransferSnapshot({ ...build(), toolId: "OTHER_TOOL" })).toBeUndefined();
        expect(restoreSceneTransferSnapshot({ ...build(), capturedAt: "" })).toBeUndefined();
        expect(restoreSceneTransferSnapshot({ ...build(), similarity: Number.NaN })).toBeUndefined();
    });

    test("缺字段时按默认值补齐，相似度按上下限收敛", () => {
        const restored = restoreSceneTransferSnapshot({ ...build(), similarity: 999, fieldKeys: undefined });
        expect(restored?.similarity).toBe(100);
        expect(restored?.fieldKeys).toEqual([...SCENE_TRANSFER_FIELD_KEYS]);
        expect(restored?.segImageUrl).toBe("");
        expect(restored?.segmentationProvided).toBe(false);
    });
});
