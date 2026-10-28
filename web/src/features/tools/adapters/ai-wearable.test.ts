import { describe, expect, test } from "bun:test";

import type { ToolAssetRecord } from "@/services/api/tools/assets";
import type { BrowserToolInput } from "@/services/api/tools/gateway";
import type { ToolTask } from "@/services/api/tools/task-machine";

import {
    AI_WEARABLE_FIELDS,
    AI_WEARABLE_MAKE_TYPE,
    AI_WEARABLE_ROUTE,
    AI_WEARABLE_TOOL_ID,
    DEFAULT_WEARABLE_VALUES,
    WEARABLE_CATEGORIES,
    WEARABLE_MAX_OUTPUT,
    WEARABLE_MIN_REGION_AREA,
    WEARABLE_OUTPUT_OPTIONS,
    WEARABLE_UPLOAD,
    buildWearablePrompt,
    computeWearableOutput,
    createWearableSnapshot,
    defaultTargetRegion,
    describeWearableDrift,
    isWearableRegionUsable,
    linkWearableValues,
    readWearableValues,
    resolveWearableCapability,
    validateWearableState,
    wearableCategoriesFor,
    wearablePartsFor,
    wearableRegionToMaskRect,
    type WearableCapability,
    type WearableRegion,
    type WearableValues,
} from "@/features/tools/registry/ai-wearable";
import {
    AiWearableAdapterError,
    WEARABLE_SUBMIT_FIELDS,
    assertWearableInput,
    bindWearableResultFields,
    buildWearableFields,
    isWearableSourceReady,
    mergeWearableVariant,
    retryAiWearable,
    runAiWearable,
    validateWearableSourceSize,
    wearableMaskSizeFor,
    wearableMaskSpec,
    wearableResultCells,
    wearableResultFromTask,
    wearableSourceFromRecord,
    type WearableSourceAsset,
} from "@/features/tools/adapters/ai-wearable";

const PRODUCT: WearableSourceAsset = {
    assetId: "asset-product-1",
    name: "ring.png",
    width: 1200,
    height: 1200,
    mimeType: "image/png",
    bytes: 300 * 1024,
    url: "https://cdn.example.com/ring.png",
};

const MODEL: WearableSourceAsset = {
    assetId: "asset-model-1",
    name: "model.png",
    width: 1024,
    height: 1536,
    mimeType: "image/png",
    bytes: 420 * 1024,
    url: "https://cdn.example.com/model.png",
};

const MASKS = { productMaskRef: "https://cdn.example.com/mask-product.png", targetMaskRef: "https://cdn.example.com/mask-target.png" };

function values(patch: Partial<WearableValues> = {}): WearableValues {
    return {
        ...DEFAULT_WEARABLE_VALUES,
        productAssetId: PRODUCT.assetId,
        modelAssetId: MODEL.assetId,
        modelId: "gpt-image-2",
        ...patch,
    };
}

function capability(patch: { modelReady?: boolean; provider?: string; providerMaxOutputNum?: number } = {}): WearableCapability {
    return resolveWearableCapability({
        modelId: "gpt-image-2",
        modelReady: patch.modelReady ?? true,
        provider: patch.provider ?? "openai",
        providerMaxOutputNum: patch.providerMaxOutputNum,
        descriptor: { executable: true, fields: [...AI_WEARABLE_FIELDS] },
    });
}

function task(items: number, status: ToolTask["status"] = "succeeded"): ToolTask {
    const now = new Date().toISOString();
    return {
        id: "task-wearable-1",
        toolId: AI_WEARABLE_TOOL_ID,
        status,
        createdAt: now,
        updatedAt: now,
        pollCount: 1,
        ...(status === "succeeded"
            ? {
                  result: {
                      kind: "image" as const,
                      items: Array.from({ length: items }, (_, index) => ({
                          id: `item-${index}`,
                          kind: "image" as const,
                          url: `https://cdn.example.com/out-${index}.png`,
                      })),
                  },
              }
            : status === "failed"
              ? { error: { code: "provider-error", message: "上游 500", retryable: true } }
              : {}),
    } as unknown as ToolTask;
}

describe("AI_WEARABLE 契约", () => {
    test("工具 id / 路由 / makeType / 13 个字段与页面 spec 一致", () => {
        expect(AI_WEARABLE_TOOL_ID).toBe("AI_WEARABLE");
        expect(AI_WEARABLE_ROUTE).toBe("/tools/product-design/ai-wearable");
        expect(AI_WEARABLE_MAKE_TYPE).toBe(34);
        expect([...AI_WEARABLE_FIELDS]).toEqual([
            "checkType",
            "imageMaskUrl",
            "imageResultUrl",
            "imageUrl",
            "isSecondOperate",
            "modelId",
            "modelTabType",
            "outputNum",
            "productCategory",
            "sceneTabType",
            "targetMaskUrl",
            "targetOriginUrl",
            "targetResultUrl",
        ]);
        expect(WEARABLE_SUBMIT_FIELDS.length).toBe(11);
        expect(WEARABLE_SUBMIT_FIELDS).not.toContain("imageResultUrl");
    });

    test("张数与上传限制与页面上一致（1-4 张 / 10M / 384-4096）", () => {
        expect([...WEARABLE_OUTPUT_OPTIONS]).toEqual([1, 2, 3, 4]);
        expect(WEARABLE_MAX_OUTPUT).toBe(4);
        expect(WEARABLE_UPLOAD.maxBytes).toBe(10 * 1024 * 1024);
        expect(WEARABLE_UPLOAD.minSide).toBe(384);
        expect(WEARABLE_UPLOAD.maxSide).toBe(4096);
        expect(computeWearableOutput(values({ outputNum: 3 })).label).toContain("3 张");
    });
});

describe("品类 × 部位 × 模特联动", () => {
    test("手表只允许手腕；包袋在真人半身页签只剩肩部，手部页签才有肩/手", () => {
        expect(wearablePartsFor("watch", "real").map((part) => part.key)).toEqual(["wrist"]);
        expect(wearablePartsFor("bag", "real").map((part) => part.key)).toEqual(["shoulder"]);
        expect(wearablePartsFor("bag", "hand").map((part) => part.key)).toEqual(["hand"]);
    });

    test("手部页签过滤掉非手部品类，且至少保留一个可用部位", () => {
        const handCategories = wearableCategoriesFor("hand").map((category) => category.key);
        expect(handCategories).toContain("gloves");
        expect(handCategories).not.toContain("eyewear");
        expect(handCategories.length).toBeGreaterThan(0);
    });

    test("品类改成手表时部位收敛为手腕，并记录联动原因；换模特不清空商品", () => {
        const linked = linkWearableValues(values({ productCategory: "watch", part: "neck" }));
        expect(linked.values.part).toBe("wrist");
        expect(linked.changes.length).toBeGreaterThan(0);
        expect(linked.values.productAssetId).toBe(PRODUCT.assetId);
    });

    test("模特页签切到手部后，不兼容部位被收敛且目标蒙版重算", () => {
        const linked = linkWearableValues(values({ productCategory: "gloves", part: "hand", modelTabType: "hand" }));
        expect(linked.values.part).toBe("hand");
        const target = linked.values.targetRegion;
        expect(isWearableRegionUsable(target)).toBe(true);
    });

    test("每个品类都有目录内 key，且默认部位属于该品类可用部位", () => {
        for (const category of WEARABLE_CATEGORIES) {
            expect(category.parts.length).toBeGreaterThan(0);
            expect(category.parts).toContain(category.defaultPart);
        }
    });
});

describe("能力收敛（executable / 张数 / 缺字段）", () => {
    test("未配置模型：不可执行并给出提示", () => {
        const resolved = capability({ modelReady: false });
        expect(resolved.executable).toBe(false);
        expect(resolved.modelReady).toBe(false);
        expect(resolved.notices.join("")).toContain("尚未配置生图模型");
    });

    test("渠道声明最多 2 张时张数选项收敛为 1/2", () => {
        const resolved = capability({ providerMaxOutputNum: 2 });
        expect(resolved.outputOptions).toEqual([1, 2]);
        expect(resolved.maxOutput).toBe(2);
    });

    test("网关字段表缺字段时逐项列出", () => {
        const resolved = resolveWearableCapability({
            modelId: "gpt-image-2",
            modelReady: true,
            descriptor: { executable: true, fields: ["imageUrl", "targetOriginUrl"] },
        });
        expect(resolved.missingFields.length).toBe(11);
        expect(resolved.notices.join("")).toContain("网关字段表缺少");
    });
});

describe("提交前校验", () => {
    test("缺商品 / 缺模特 / 蒙版退化都会拦住提交", () => {
        const issues = validateWearableState({
            values: values({ productRegion: { cx: 0.5, cy: 0.5, rx: 0.005, ry: 0.005 } }),
            capability: capability(),
            productReady: false,
            modelReady: false,
        });
        const codes = issues.map((issue) => issue.code);
        expect(codes).toContain("product-missing");
        expect(codes).toContain("model-missing");
        expect(codes).toContain("product-mask-degenerate");
    });

    test("尺寸超限与部位不兼容有独立错误码", () => {
        const issues = validateWearableState({
            values: values({ productCategory: "watch", part: "neck" }),
            capability: capability(),
            productReady: true,
            modelReady: true,
            productSize: { width: 200, height: 200 },
            modelSize: { width: 5000, height: 5000 },
        });
        const codes = issues.map((issue) => issue.code);
        expect(codes).toContain("product-size");
        expect(codes).toContain("model-size");
        expect(codes).toContain("part-incompatible");
    });

    test("张数超过模型能力时报 output-num-unsupported", () => {
        const issues = validateWearableState({
            values: values({ outputNum: 4 }),
            capability: capability({ providerMaxOutputNum: 1 }),
            productReady: true,
            modelReady: true,
        });
        expect(issues.map((issue) => issue.code)).toContain("output-num-unsupported");
    });

    test("尺寸/就绪判断基于真实资产字段", () => {
        expect(isWearableSourceReady(PRODUCT)).toBe(true);
        expect(isWearableSourceReady({ ...PRODUCT, assetId: "" })).toBe(false);
        expect(validateWearableSourceSize({ ...PRODUCT, width: 100 }).ok).toBe(false);
        const record = {
            id: "asset-x",
            name: "x.png",
            url: "https://cdn.example.com/x.png",
            storageKey: "k",
            mimeType: "image/png",
            bytes: 1024,
            width: 800,
            height: 800,
            createdAt: new Date().toISOString(),
        } as unknown as ToolAssetRecord;
        expect(wearableSourceFromRecord(record).assetId).toBe("asset-x");
        expect(wearableMaskSizeFor(record as unknown as WearableSourceAsset)).toEqual({ width: 800, height: 800 });
    });
});

describe("蒙版导出", () => {
    const region: WearableRegion = { cx: 0.4, cy: 0.6, rx: 0.2, ry: 0.1 };

    test("椭圆映射到真实像素，PNG 通过 canvas 导出", async () => {
        const drawn: number[][] = [];
        const sizes: { width: number; height: number }[] = [];
        const blob = await renderWearableMaskBlobForTest(region, { width: 1000, height: 800 }, drawn, sizes);
        expect(blob.type).toBe("image/png");
        expect(sizes).toEqual([{ width: 1000, height: 800 }]);
        const rect = wearableRegionToMaskRect(region, 1000, 800);
        expect(drawn[0]?.[0]).toBeCloseTo(rect.cx, 5);
        expect(drawn[0]?.[1]).toBeCloseTo(rect.cy, 5);
        expect(drawn[0]?.[2]).toBeCloseTo(rect.rx, 5);
        expect(drawn[0]?.[3]).toBeCloseTo(rect.ry, 5);
    });

    test("蒙版退化直接抛 mask-degenerate，不导出假图", async () => {
        expect(() => wearableMaskSpec({ cx: 0.5, cy: 0.5, rx: 0.01, ry: 0.01 }, { width: 512, height: 512 })).toThrow(AiWearableAdapterError);
        await expect(renderWearableMaskBlobForTest({ cx: 0.5, cy: 0.5, rx: 0.01, ry: 0.01 }, { width: 512, height: 512 }, [], [])).rejects.toThrow(/mask-degenerate|蒙版/);
        expect(WEARABLE_MIN_REGION_AREA).toBeGreaterThan(0);
    });

    test("无 DOM 时报 canvas-unavailable，而不是返回空 blob", async () => {
        const { renderWearableMaskBlob } = await import("@/features/tools/adapters/ai-wearable");
        await expect(renderWearableMaskBlob(region, { width: 64, height: 64 }, () => null)).rejects.toThrow(/canvas-unavailable|Canvas/);
    });
});

async function renderWearableMaskBlobForTest(
    region: WearableRegion,
    size: { width: number; height: number },
    drawn: number[][],
    sizes: { width: number; height: number }[],
) {
    const { renderWearableMaskBlob } = await import("@/features/tools/adapters/ai-wearable");
    return renderWearableMaskBlob(region, size, (input) => {
        sizes.push(input);
        return {
            getContext: () => ({
                fillStyle: "",
                clearRect: () => undefined,
                beginPath: () => undefined,
                ellipse: (x: number, y: number, rx: number, ry: number) => {
                    drawn.push([x, y, rx, ry]);
                },
                fill: () => undefined,
            }),
            toBlob: (callback: (blob: Blob | null) => void, type?: string) => callback(new Blob([new Uint8Array([137, 80, 78, 71])], { type: type ?? "image/png" })),
        };
    });
}

describe("提交字段与防丢参守卫", () => {
    test("11 个提交字段全部落位，两个蒙版引用必填", () => {
        const fields = buildWearableFields({ values: values({ outputNum: 2 }), capability: capability(), product: PRODUCT, model: MODEL, masks: MASKS });
        expect(Object.keys(fields).sort()).toEqual([...WEARABLE_SUBMIT_FIELDS].sort());
        expect(fields.outputNum).toBe(2);
        expect(fields.imageMaskUrl).toBe(MASKS.productMaskRef);
        expect(fields.targetMaskUrl).toBe(MASKS.targetMaskRef);
        expect(fields.imageUrl).toBe(PRODUCT.url);
        expect(fields.isSecondOperate).toBe(false);
    });

    test("张数没进入请求 / 蒙版为空 / 参考图错位都会被守卫拦下", () => {
        const input: BrowserToolInput = {
            toolId: AI_WEARABLE_TOOL_ID,
            prompt: buildWearablePrompt(values(), capability()),
            references: [
                { id: PRODUCT.assetId, url: PRODUCT.url, name: PRODUCT.name, type: "image/png", dataUrl: "" },
                { id: MODEL.assetId, url: MODEL.url, name: MODEL.name, type: "image/png", dataUrl: "" },
            ],
            count: 1,
            fields: buildWearableFields({ values: values({ outputNum: 2 }), capability: capability(), product: PRODUCT, model: MODEL, masks: MASKS }),
        };
        expect(() =>
            assertWearableInput(input, { values: values({ outputNum: 2 }), capability: capability(), product: PRODUCT, model: MODEL, masks: MASKS }),
        ).toThrow(/生成张数未进入请求/);

        const broken = { ...input, count: 2, fields: { ...input.fields, imageMaskUrl: "  " } };
        expect(() => assertWearableInput(broken, { values: values({ outputNum: 2 }), capability: capability(), product: PRODUCT, model: MODEL, masks: MASKS })).toThrow(
            /imageMaskUrl/,
        );
    });
});

describe("真实提交链路", () => {
    test("提交参数、等待结果、快照返回", async () => {
        const submitted: BrowserToolInput[] = [];
        let waited = "";
        const run = await runAiWearable({
            gateway: {
                submit: async (input) => {
                    submitted.push(input);
                    return task(0, "running");
                },
                waitForResult: async (taskId) => {
                    waited = taskId;
                    return task(2);
                },
            },
            values: values({ outputNum: 2 }),
            capability: capability(),
            product: PRODUCT,
            model: MODEL,
            masks: MASKS,
        });
        expect(submitted.length).toBe(1);
        expect(submitted[0]?.count).toBe(2);
        expect(submitted[0]?.references?.length).toBe(2);
        expect(submitted[0]?.model).toBeUndefined();
        expect(waited).toBe("task-wearable-1");
        expect(run.task.status).toBe("succeeded");
        expect(run.snapshot.hash).toMatch(/^[0-9a-f]{8}$/);
    });

    test("modelOverride 命中时随提交下发", async () => {
        let sent: BrowserToolInput | undefined;
        await runAiWearable({
            gateway: { submit: async (input) => ((sent = input), task(1)), waitForResult: async () => task(1) },
            values: values(),
            capability: capability(),
            product: PRODUCT,
            model: MODEL,
            masks: MASKS,
            modelOverride: "gpt-image-2",
        });
        expect(sent?.model).toBe("gpt-image-2");
    });

    test("没模型 / 蒙版不可用时抛错且不触网", async () => {
        let calls = 0;
        const gateway = {
            submit: async () => {
                calls += 1;
                return task(1);
            },
            waitForResult: async () => task(1),
        };
        await expect(
            runAiWearable({ gateway, values: values({ modelId: "", targetRegion: { cx: 0.5, cy: 0.5, rx: 0.005, ry: 0.005 } }), capability: capability(), product: PRODUCT, model: MODEL, masks: MASKS }),
        ).rejects.toThrow(AiWearableAdapterError);
        expect(calls).toBe(0);
    });

    test("网关不支持重试时明确报错", async () => {
        await expect(
            retryAiWearable({
                gateway: { submit: async () => task(1), waitForResult: async () => task(1) },
                taskId: "task-wearable-1",
                task: task(0, "failed"),
                values: values(),
                capability: capability(),
                product: PRODUCT,
                model: MODEL,
                masks: MASKS,
            }),
        ).rejects.toThrow(/重试/);
    });

    test("重试会复用同一配置快照", async () => {
        const retried: string[] = [];
        const run = await retryAiWearable({
            gateway: {
                submit: async () => task(1),
                waitForResult: async () => task(1),
                retry: async (taskId) => {
                    retried.push(taskId);
                    return task(1);
                },
            },
            taskId: "task-wearable-1",
            task: task(0, "failed"),
            values: values(),
            capability: capability(),
            product: PRODUCT,
            model: MODEL,
            masks: MASKS,
        });
        expect(retried).toEqual(["task-wearable-1"]);
        expect(run.task.status).toBe("succeeded");
    });
});

describe("结果与快照", () => {
    test("部分失败只标失败格，不冒充成功", () => {
        const cells = wearableResultCells(task(1), 3);
        expect(cells.map((cell) => cell.status)).toEqual(["succeeded", "failed", "failed"]);
        const pending = wearableResultCells(undefined, 2);
        expect(pending.map((cell) => cell.status)).toEqual(["pending", "pending"]);
    });

    test("单格重试按位置合并，已成功格不丢", () => {
        const previous = task(2);
        const merged = mergeWearableVariant(previous, task(1), 1);
        expect(merged.result?.items?.length).toBe(2);
        expect(merged.result?.items?.[1]?.id).toBe("item-0");
    });

    test("结果字段回填走真实资产引用，空引用抛错", () => {
        expect(bindWearableResultFields("https://cdn.example.com/out.png")).toEqual({
            imageResultUrl: "https://cdn.example.com/out.png",
            targetResultUrl: "https://cdn.example.com/out.png",
        });
        expect(() => bindWearableResultFields("   ")).toThrow(/结果资产为空/);
        const view = wearableResultFromTask(task(1), undefined, undefined, 2);
        expect(view.resultFields?.imageResultUrl).toContain("out-0.png");
    });

    test("配置变更后旧结果被标记为 stale", () => {
        const first = createWearableSnapshot(values({ outputNum: 1 }), capability(), 3);
        const second = createWearableSnapshot(values({ outputNum: 2 }), capability(), 3);
        expect(describeWearableDrift(first, second)).toContain("生成张数");
        expect(describeWearableDrift(first, first)).toBeUndefined();
        const view = wearableResultFromTask(task(1), first, second, 1);
        expect(view.stale).toBeTruthy();
    });

    test("草稿读取只接受目录内取值，张数夹到 1-4", () => {
        const parsed = readWearableValues({ productCategory: "不存在", outputNum: 9, modelTabType: "hand", part: "neck", isSecondOperate: "yes" });
        expect(parsed.productCategory).toBe(DEFAULT_WEARABLE_VALUES.productCategory);
        expect(parsed.outputNum).toBe(4);
        expect(parsed.modelTabType).toBe("hand");
        expect(parsed.isSecondOperate).toBe(false);
        expect(isWearableRegionUsable(parsed.targetRegion)).toBe(true);
        expect(defaultTargetRegion("wrist", "real").cy).toBeGreaterThan(0);
    });
});

describe("工作台渲染（SSR）", () => {
    test("工作台首屏渲染步骤条、品类、部位、模特、张数与结果区", async () => {
        const memory = new Map<string, string>();
        const storage = {
            getItem: (key: string) => memory.get(key) ?? null,
            setItem: (key: string, value: string) => void memory.set(key, String(value)),
            removeItem: (key: string) => void memory.delete(key),
            clear: () => memory.clear(),
            key: (index: number) => [...memory.keys()][index] ?? null,
            get length() {
                return memory.size;
            },
        };
        (globalThis as unknown as { localStorage: typeof storage }).localStorage = storage;

        const [{ createElement }, { renderToStaticMarkup }, workspace] = await Promise.all([
            import("react"),
            import("react-dom/server"),
            import("@/components/tools/workspaces/dress"),
        ]);
        const html = renderToStaticMarkup(createElement(workspace.default));

        expect(html).toContain("dress-workspace");
        expect(html).toContain("商品品类");
        expect(html).toContain("穿戴部位");
        expect(html).toContain("模特参考");
        expect(html).toContain("场景");
        expect(html).toContain("1 张");
        expect(html).toContain("4 张");
        expect(html).toContain("生成");
        expect(html).toContain("结果资产");
    });
});
