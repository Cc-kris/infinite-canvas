import { describe, expect, test } from "bun:test";

import type { ToolTask } from "@/services/api/tools/task-machine";

import {
    PRODUCT_REFINE_TOOL_ID,
    buildProductRefinePrompt,
    computeProductRefineOutput,
    createProductRefineSnapshot,
    describeProductRefineDrift,
    isProductRefineSnapshotStale,
    isValidHexColor,
    normalizeHexColor,
    productRefineExpectedCount,
    productRefineMode,
    readProductRefineValues,
    refineScaleFactor,
    validateProductRefineState,
    type ProductRefineValues,
} from "../registry/product-refine";

import {
    ProductRefineAdapterError,
    assertProductRefineInput,
    buildProductRefineFields,
    buildProductRefineInput,
    firstProductRefineImage,
    isProductRefineSourceReady,
    productRefineResultFromTask,
    retryProductRefine,
    runProductRefine,
    validateProductRefineSource,
    type ProductRefineGatewayLike,
    type ProductRefineSourceAsset,
} from "./product-refine";

const values = (patch: Partial<ProductRefineValues> = {}): ProductRefineValues => ({
    mode: "full",
    strength: "standard",
    colorEnabled: false,
    color: "",
    imageName: "shoe.png",
    sourceAssetId: "asset-1",
    ...patch,
});

const source = (patch: Partial<ProductRefineSourceAsset> = {}): ProductRefineSourceAsset => ({
    assetId: "asset-1",
    dataUrl: "data:image/png;base64,AAAA",
    name: "shoe.png",
    mimeType: "image/png",
    bytes: 200_000,
    width: 400,
    height: 300,
    ...patch,
});

const task = (patch: Partial<ToolTask> = {}): ToolTask =>
    ({
        id: "task-1",
        toolId: PRODUCT_REFINE_TOOL_ID,
        clientOperationId: "op-1",
        status: "succeeded",
        prompt: "p",
        fingerprint: "fp",
        capability: "image",
        sourceAssetIds: ["asset-1"],
        configSnapshot: { capability: "image", model: "img-model", count: 1 },
        attempts: 1,
        pollCount: 1,
        transientFailures: 0,
        createdAt: 1,
        updatedAt: 2,
        result: { items: [], receivedAt: 2 },
        ...patch,
    }) as ToolTask;

describe("自动生图尺寸规则（页面明示）", () => {
    test("边界：≤512 → ×4，513~1024 → ×2，>1024 → 原尺寸", () => {
        expect(refineScaleFactor(512)).toEqual({ factor: 4, ruleLabel: "≤512px → 放大 4 倍" });
        expect(refineScaleFactor(513)).toEqual({ factor: 2, ruleLabel: "513~1024px → 放大 2 倍" });
        expect(refineScaleFactor(1024)).toEqual({ factor: 2, ruleLabel: "513~1024px → 放大 2 倍" });
        expect(refineScaleFactor(1025)).toEqual({ factor: 1, ruleLabel: "＞1024px → 原尺寸" });
        expect(refineScaleFactor(0)).toEqual({ factor: 1, ruleLabel: "待上传原图" });
    });

    test("非正方形按长边命中规则，短边同倍率，比例保持原图", () => {
        const out = computeProductRefineOutput({ width: 400, height: 300 });
        expect([out.width, out.height]).toEqual([1600, 1200]);
        expect(out.factor).toBe(4);
        expect(out.longEdge).toBe(1600);
        expect(out.ratio).toBe("4:3");
        expect(out.legal).toBe(true);

        const twice = computeProductRefineOutput({ width: 600, height: 400 });
        expect([twice.width, twice.height]).toEqual([1200, 800]);
        expect(twice.ratio).toBe("3:2");

        const keep = computeProductRefineOutput({ width: 2000, height: 1500 });
        expect([keep.width, keep.height]).toEqual([2000, 1500]);
        expect(keep.ratio).toBe("4:3");
    });

    test("未上传原图时不编造尺寸", () => {
        const out = computeProductRefineOutput(undefined);
        expect([out.width, out.height]).toEqual([0, 0]);
        expect(out.legal).toBe(false);
        expect(out.issues.map((issue) => issue.code)).toEqual(["source-size-unknown"]);
    });

    test("超出输出上限/短边过小都阻塞，而不是悄悄换尺寸", () => {
        expect(computeProductRefineOutput({ width: 5000, height: 5000 }).issues.map((i) => i.code)).toContain("output-too-large");
        expect(computeProductRefineOutput({ width: 10, height: 10 }).issues.map((i) => i.code)).toContain("output-too-small");
    });
});

describe("校验与提示词", () => {
    test("缺商品图/缺图片模型/色值非法都会阻塞", () => {
        const out = computeProductRefineOutput({ width: 400, height: 300 });
        const empty = validateProductRefineState({ values: values(), output: out, sourceReady: false, imageModelReady: false });
        expect(empty.map((issue) => issue.code)).toContain("source-required");
        expect(empty.map((issue) => issue.code)).toContain("model-missing");

        const badColor = validateProductRefineState({
            values: values({ colorEnabled: true, color: "#abc" }),
            output: out,
            sourceReady: true,
            imageModelReady: true,
        });
        expect(badColor.map((issue) => issue.code)).toContain("color-invalid");

        expect(validateProductRefineState({ values: values(), output: out, sourceReady: true, imageModelReady: true })).toEqual([]);
    });

    test("去背景模式在提示词里明确移除背景，整图模式明确保留背景", () => {
        const cutoutOut = computeProductRefineOutput({ width: 400, height: 300 });
        const cutout = buildProductRefinePrompt(values({ mode: "cutout", strength: "strong", colorEnabled: true, color: "#ff0000" }), cutoutOut);
        expect(cutout).toContain("去背景精修");
        expect(cutout).toContain("移除背景");
        expect(cutout).toContain("1600×1200");
        expect(cutout).toContain("4:3");
        expect(cutout).toContain("强力");
        expect(cutout).toContain("#FF0000");

        const full = buildProductRefinePrompt(values({ mode: "full" }), cutoutOut);
        expect(full).toContain("整图精修");
        expect(full).toContain("保留原始背景");
        expect(full).not.toContain("移除背景");
        expect(full).toContain("颜色校正：关闭");
    });

    test("草稿恢复：脏枚举回落默认值，不污染提交", () => {
        expect(readProductRefineValues({ mode: "hack", strength: 1, colorEnabled: "yes" })).toEqual({
            mode: "full",
            strength: "standard",
            colorEnabled: false,
            color: "",
            imageName: "",
        });
        const kept = readProductRefineValues({ mode: "cutout", strength: "light", colorEnabled: true, color: "#00ff00", sourceAssetId: "a2" });
        expect(kept.mode).toBe("cutout");
        expect(kept.strength).toBe("light");
        expect(kept.sourceAssetId).toBe("a2");
        expect(kept.colorEnabled).toBe(true);
    });

    test("色值规范化与校验", () => {
        expect(normalizeHexColor("#aabbcc")).toBe("#AABBCC");
        expect(normalizeHexColor("aabbccdd")).toBe("#AABBCCDD");
        expect(normalizeHexColor("#abc")).toBe("");
        expect(isValidHexColor("#AABBCC")).toBe(true);
        expect(isValidHexColor("AABBCC")).toBe(false);
    });
});

describe("请求组装与防丢参", () => {
    test("自动尺寸进 size、去背景进 isRmBg、比例与长边进 fields、商品图进 references", () => {
        const v = values();
        const out = computeProductRefineOutput(source());
        const input = buildProductRefineInput({ values: v, output: out, source: source(), model: "img-model" });

        expect(input.toolId).toBe(PRODUCT_REFINE_TOOL_ID);
        expect(input.size).toBe("1600x1200");
        expect(input.count).toBe(1);
        expect(input.model).toBe("img-model");
        expect(input.fields).toMatchObject({ isRmBg: false, ratio: "4:3", imageOutputLength: 1600 });
        expect((input.fields as Record<string, unknown>).color).toBeUndefined();
        expect(input.references?.[0]).toMatchObject({ id: "asset-1", dataUrl: "data:image/png;base64,AAAA" });
        expect(() => assertProductRefineInput(input, v, out)).not.toThrow();
    });

    test("去背景模式 isRmBg=true；仅在显式给出分割结果时写 imageSegUrl", () => {
        const v = values({ mode: "cutout" });
        const out = computeProductRefineOutput(source());
        const plain = buildProductRefineFields(v, out, source());
        expect(plain.isRmBg).toBe(true);
        expect(plain.imageSegUrl).toBeUndefined();

        const withSeg = buildProductRefineFields(v, out, source(), "https://cdn.example.com/seg.png");
        expect(withSeg.imageSegUrl).toBe("https://cdn.example.com/seg.png");

        const full = buildProductRefineFields(values(), out, source(), "https://cdn.example.com/seg.png");
        expect(full.imageSegUrl).toBeUndefined();
    });

    test("色彩校正开启才写 color，并规范化大写", () => {
        const out = computeProductRefineOutput(source());
        const fields = buildProductRefineFields(values({ colorEnabled: true, color: "#abcdef" }), out, source());
        expect(fields.color).toBe("#ABCDEF");
        // 非法色值的守卫点在提交前 assert（build 只做字段搬运），由 assert 拦下
        const bad = values({ colorEnabled: true, color: "#abc" });
        const input = buildProductRefineInput({ values: bad, output: out, source: source() });
        expect(() => assertProductRefineInput(input, bad, out)).toThrow(/色彩校正色值不合法/);
    });

    test("防丢参守卫：尺寸被改小、提示词丢强度、缺参考图都会抛错", () => {
        const v = values({ strength: "strong" });
        const out = computeProductRefineOutput(source());
        const input = buildProductRefineInput({ values: v, output: out, source: source() });

        expect(() => assertProductRefineInput({ ...input, size: "1024x1024" }, v, out)).toThrow(/自动尺寸规则未生效/);
        expect(() => assertProductRefineInput({ ...input, prompt: "no strength" }, v, out)).toThrow(/精修强度未进入请求/);
        expect(() => assertProductRefineInput({ ...input, references: [] }, v, out)).toThrow(/缺少商品图参考/);
        expect(() => assertProductRefineInput({ ...input, fields: {} }, v, out)).toThrow(/去背景开关未进入请求/);
    });

    test("源图硬约束：格式、20M、边长", () => {
        expect(isProductRefineSourceReady(source())).toBe(true);
        expect(isProductRefineSourceReady({ assetId: "a" })).toBe(false);
        expect(validateProductRefineSource(source({ mimeType: "image/gif" })).ok).toBe(false);
        expect(validateProductRefineSource(source({ bytes: 21 * 1024 * 1024 })).ok).toBe(false);
        expect(validateProductRefineSource(source({ width: 9000, height: 9000 })).ok).toBe(false);
        expect(validateProductRefineSource(source({ mimeType: "image/webp" })).ok).toBe(true);
    });

    test("输出尺寸非法时拒绝组装，不会带着错尺寸发请求", () => {
        const out = computeProductRefineOutput({ width: 5000, height: 5000 });
        expect(() => buildProductRefineInput({ values: values(), output: out, source: source() })).toThrow(ProductRefineAdapterError);
    });
});

describe("执行链路：真实提交 / 等待 / 重试", () => {
    const out = () => computeProductRefineOutput(source());

    test("submit 携带真实参数，终态直接返回且不再等待", async () => {
        const submitted: unknown[] = [];
        const gateway: ProductRefineGatewayLike = {
            submit: async (input) => {
                submitted.push(input);
                return task({ status: "succeeded", result: { items: [{ id: "i1", kind: "image", dataUrl: "data:image/png;base64,BBBB" }], receivedAt: 3 } });
            },
            waitForResult: async () => {
                throw new Error("不应在终态后继续等待");
            },
        };
        const run = await runProductRefine({ gateway, values: values({ mode: "cutout" }), output: out(), source: source(), model: "img-model" });

        expect(submitted).toHaveLength(1);
        expect((submitted[0] as { size: string }).size).toBe("1600x1200");
        expect(run.task.status).toBe("succeeded");
        expect(run.snapshot.isRmBg).toBe(true);
        expect(firstProductRefineImage(run.task)).toBe("data:image/png;base64,BBBB");
    });

    test("运行中状态走 waitForResult，并把中间态推给 UI", async () => {
        const updates: string[] = [];
        const gateway: ProductRefineGatewayLike = {
            submit: async () => task({ status: "running" }),
            waitForResult: async (taskId) => {
                expect(taskId).toBe("task-1");
                return task({ status: "succeeded", result: { items: [{ id: "i1", kind: "image", dataUrl: "data:image/png;base64,CCCC" }], receivedAt: 4 } });
            },
        };
        const run = await runProductRefine({
            gateway,
            values: values(),
            output: out(),
            source: source(),
            onUpdate: (t) => updates.push(t.status),
        });
        expect(updates).toEqual(["running"]);
        expect(run.task.status).toBe("succeeded");
    });

    test("缺商品图或未配置模型时根本不发请求", async () => {
        let called = 0;
        const gateway: ProductRefineGatewayLike = {
            submit: async () => {
                called += 1;
                return task();
            },
            waitForResult: async () => task(),
        };
        await expect(
            runProductRefine({ gateway, values: values(), output: out(), source: source({ dataUrl: undefined, url: undefined }) }),
        ).rejects.toThrow(/请先上传待精修的商品图/);
        await expect(
            runProductRefine({ gateway, values: values(), output: out(), source: source(), imageModelReady: false }),
        ).rejects.toThrow(/未配置可用的图片模型/);
        expect(called).toBe(0);
    });

    test("重试按当前配置重建输入并再次守卫；网关不支持重试时明确报错", async () => {
        const gateway: ProductRefineGatewayLike = {
            submit: async () => task(),
            waitForResult: async () => task(),
            retry: async (taskId, input) => {
                expect(taskId).toBe("task-1");
                expect(input.size).toBe("1600x1200");
                return task({ id: "task-2", status: "succeeded" });
            },
        };
        const run = await retryProductRefine({
            gateway,
            values: values(),
            output: out(),
            source: source(),
            taskId: "task-1",
        });
        expect(run.task.id).toBe("task-2");

        await expect(
            retryProductRefine({ gateway: { submit: async () => task(), waitForResult: async () => task() }, values: values(), output: out(), source: source(), taskId: "task-1" }),
        ).rejects.toThrow(/不支持按任务重试/);
    });
});

describe("结果过期与快照", () => {
    test("改模式/换图/改强度都会让旧结果变旧，并给出中文差异说明", () => {
        const out = computeProductRefineOutput(source());
        const snapshot = createProductRefineSnapshot(values(), out, { assetId: "asset-1", width: 400, height: 300 }, 1);
        const same = createProductRefineSnapshot(values(), out, { assetId: "asset-1", width: 400, height: 300 }, 1);

        expect(isProductRefineSnapshotStale(snapshot, same)).toBe(false);
        expect(describeProductRefineDrift(snapshot, same)).toBe("");

        const cutout = createProductRefineSnapshot(values({ mode: "cutout" }), out, { assetId: "asset-1", width: 400, height: 300 }, 1);
        expect(isProductRefineSnapshotStale(snapshot, cutout)).toBe(true);
        expect(describeProductRefineDrift(snapshot, cutout)).toContain("精修模式");

        const otherAsset = createProductRefineSnapshot(values(), out, { assetId: "asset-2", width: 400, height: 300 }, 1);
        expect(describeProductRefineDrift(snapshot, otherAsset)).toContain("源图");

        const stronger = createProductRefineSnapshot(values({ strength: "strong" }), out, { assetId: "asset-1", width: 400, height: 300 }, 1);
        expect(describeProductRefineDrift(snapshot, stronger)).toContain("精修强度");

        expect(isProductRefineSnapshotStale(snapshot, undefined)).toBe(true);
        expect(isProductRefineSnapshotStale(undefined, same)).toBe(false);
    });

    test("结果只取 tasks 里的真实图片项，失败原因原样透出", () => {
        const out = computeProductRefineOutput(source());
        const snapshot = createProductRefineSnapshot(values(), out, { assetId: "asset-1", width: 400, height: 300 }, 1);
        const current = createProductRefineSnapshot(values({ mode: "cutout" }), out, { assetId: "asset-1", width: 400, height: 300 }, 1);

        const done = task({
            result: {
                items: [
                    { id: "v1", kind: "video", url: "http://x/v.mp4" },
                    { id: "i1", kind: "image", dataUrl: "data:image/png;base64,DDDD" },
                    { id: "i2", kind: "image" },
                ],
                receivedAt: 5,
            },
        });
        const res = productRefineResultFromTask(done, snapshot, current, describeProductRefineDrift(snapshot, current));
        expect(res.status).toBe("succeeded");
        expect(res.images.map((item) => item.id)).toEqual(["i1"]);
        expect(res.stale).toBe(true);
        expect(res.drift).toContain("精修模式");

        const failed = task({ status: "failed", result: undefined, error: { code: "upstream", message: "上游超时", retryable: true } });
        const failedRes = productRefineResultFromTask(failed, snapshot, snapshot);
        expect(failedRes.error).toBe("上游超时");
        expect(failedRes.stale).toBe(false);
        expect(failedRes.images).toEqual([]);

        const idle = productRefineResultFromTask(undefined, undefined, undefined);
        expect(idle.status).toBe("idle");
        expect(idle.images).toEqual([]);
        expect(firstProductRefineImage(undefined)).toBeUndefined();
    });

    test("去背景精修只承诺 1 张主结果", () => {
        expect(productRefineExpectedCount(values({ mode: "cutout" }))).toBe(1);
        expect(productRefineMode("cutout").producesAlpha).toBe(true);
        expect(productRefineMode("full").producesAlpha).toBe(false);
    });
});
