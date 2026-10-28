import { describe, expect, test } from "bun:test";

import type { ToolTask } from "@/services/api/tools/task-machine";

import {
    SDS_DESIGN_TOOL_ID,
    SDS_MATERIAL_COUNT,
    SDS_UPLOAD_LIMITS,
    applySdsPlacementAction,
    buildSdsPrompt,
    canRedoSdsPlacement,
    canUndoSdsPlacement,
    clampSdsPlacement,
    commitSdsPlacement,
    createSdsMaterial,
    createSdsPlacementHistory,
    createSdsSnapshot,
    createSdsValues,
    describeSdsDrift,
    isSdsPlacementValid,
    isSdsReady,
    normalizeSdsRotation,
    parseSdsDraft,
    patchSdsPlacement,
    placementRecordFromMaterials,
    redoSdsPlacement,
    sdsPlacementKeyAction,
    sdsPrintableArea,
    serializeSdsValues,
    undoSdsPlacement,
    validateSdsDesignState,
    type SdsProduct,
    type SdsAssetLike,
    type SdsValues,
} from "@/features/tools/registry/sds-design";
import {
    SdsAdapterError,
    auditSdsDesignFields,
    type SdsSourceAsset,
    assertSdsDesignInput,
    buildSdsDesignFields,
    buildSdsDesignInput,
    isSdsSourceReady,
    retrySdsDesign,
    runSdsDesign,
    sdsDesignResultFromTask,
    sdsDesignResultNotice,
    sdsMissingIndexes,
    sdsRepairIndexes,
    sdsResponseId,
    sdsResultSlots,
    validateSdsSource,
} from "@/features/tools/adapters/sds-design";

const asset = (id: string, patch: Record<string, unknown> = {}) => ({
    assetId: id,
    name: `${id}.png`,
    url: `https://cdn.local/${id}.png`,
    mimeType: "image/png",
    bytes: 90_000,
    width: 800,
    height: 800,
    ...patch,
}) as SdsAssetLike & SdsSourceAsset;

const product = (): SdsProduct => ({ assetId: "prod-1", name: "prod-1.png", url: "https://cdn.local/prod-1.png", width: 1200, height: 1600 });

const values = (patch: Partial<SdsValues> = {}): SdsValues =>
    createSdsValues({
        product: product(),
        materials: [createSdsMaterial(asset("m-1")), createSdsMaterial(asset("m-2"))],
        colorId: "original",
        ...patch,
    });

const task = (patch: Partial<ToolTask> = {}): ToolTask =>
    ({
        id: "task-1",
        toolId: SDS_DESIGN_TOOL_ID,
        clientOperationId: "op-1",
        status: "succeeded",
        prompt: "p",
        fingerprint: "fp",
        capability: "image",
        sourceAssetIds: ["m-1", "m-2"],
        configSnapshot: { capability: "image", model: "img-model", count: 2 },
        attempts: 1,
        pollCount: 1,
        transientFailures: 0,
        createdAt: 1,
        updatedAt: 2,
        result: { items: [], receivedAt: 2 },
        ...patch,
    }) as ToolTask;

const imageItem = (id: string) => ({ id, kind: "image" as const, dataUrl: `data:image/png;base64,${id}` });

describe("上传校验与数量约束", () => {
    test("来源就绪判定：必须同时有 id 与可读地址", () => {
        expect(isSdsSourceReady({ assetId: "", url: "https://x" })).toBe(false);
        expect(isSdsSourceReady({ assetId: "a", url: "" })).toBe(false);
        expect(isSdsSourceReady(asset("m-1"))).toBe(true);
    });

    test("格式/体积/尺寸越界都点名到具体角色", () => {
        expect(validateSdsSource(asset("a", { mimeType: "image/gif" })).ok).toBe(false);
        const mimeIssue = validateSdsSource(asset("a", { mimeType: "image/gif" }));
        expect(mimeIssue.ok === false && mimeIssue.message).toContain("素材不支持 image/gif");
        const sizeIssue = validateSdsSource(asset("a", { bytes: SDS_UPLOAD_LIMITS.maxBytes + 1 }), "product");
        expect(sizeIssue.ok === false && sizeIssue.message).toContain("商品图不能超过");
        const dimIssue = validateSdsSource(asset("a", { width: 10, height: 900 }), "product");
        expect(dimIssue.ok === false && dimIssue.message).toContain("短边至少");
        expect(validateSdsSource(asset("a")).ok).toBe(true);
    });

    test("素材数量上限由常量夹住", () => {
        const many = Array.from({ length: SDS_MATERIAL_COUNT.max + 3 }, (_unused, index) => createSdsMaterial(asset(`m-${index}`)));
        expect(createSdsValues({ product: product(), materials: many }).materials.length).toBe(SDS_MATERIAL_COUNT.max);
        expect(createSdsValues({ product: product(), materials: many }).materials.length).toBeLessThanOrEqual(SDS_MATERIAL_COUNT.max);
    });
});

describe("几何：可贴区域与笔画微调", () => {
    test("越界落位被夹到安全区内且仍合法", () => {
        const area = sdsPrintableArea(product());
        const clamped = clampSdsPlacement({ x: 5, y: -5, scale: 9, rotation: 999 }, area);
        expect(clamped.scale).toBe(1);
        expect(clamped.x).toBeGreaterThanOrEqual(area.x);
        expect(clamped.y).toBeGreaterThanOrEqual(area.y);
        expect(isSdsPlacementValid(clamped)).toBe(true);
        expect(normalizeSdsRotation(370)).toBe(10);
        expect(normalizeSdsRotation(-190)).toBe(170);
    });

    test("方向键/缩放/旋转映射，未知键返回 null", () => {
        expect(sdsPlacementKeyAction("ArrowRight")).toEqual({ kind: "move", dx: 0.01, dy: 0 });
        expect(sdsPlacementKeyAction("ArrowRight", true)).toEqual({ kind: "move", dx: 0.1, dy: 0 });
        expect(sdsPlacementKeyAction("+")?.kind).toBe("scale");
        expect(sdsPlacementKeyAction("[")?.kind).toBe("rotate");
        expect(sdsPlacementKeyAction("q")).toBeNull();
    });

    test("单素材位移/缩放在安全区内生效", () => {
        const moved = applySdsPlacementAction(values().materials, "m-1", { kind: "move", dx: 0.01, dy: 0 }, product());
        expect(moved[0].placement.x).toBeCloseTo(0.51, 3);
        expect(moved[1].placement.x).toBe(0.5);
        const scaled = applySdsPlacementAction(values().materials, "m-1", { kind: "scale", factor: 0.5 }, product());
        expect(scaled[0].placement.scale).toBeCloseTo(0.3, 3);
        const patched = patchSdsPlacement(values().materials, "m-2", { rotation: 45 }, product());
        expect(patched[1].placement.rotation).toBe(45);
        expect(patched[0].placement.rotation).toBe(0);
    });

    test("撤销/重做保留历史，重复提交同一落位不写新节点", () => {
        const materials = values().materials;
        let history = createSdsPlacementHistory(materials);
        expect(canUndoSdsPlacement(history)).toBe(false);
        const next = { ...placementRecordFromMaterials(materials), "m-1": { x: 0.5, y: 0.5, scale: 0.2, rotation: 0 } };
        history = commitSdsPlacement(history, next);
        expect(canUndoSdsPlacement(history)).toBe(true);
        expect(commitSdsPlacement(history, next)).toBe(history);
        history = undoSdsPlacement(history);
        expect(canRedoSdsPlacement(history)).toBe(true);
        history = redoSdsPlacement(history);
        expect(history.present["m-1"].scale).toBe(0.2);
    });
});

describe("提示词与 5 个契约字段", () => {
    test("每个素材的几何与平铺方式都进提示词，输出数量与素材一致", () => {
        const prompt = buildSdsPrompt(values());
        expect(prompt).toContain("商品 ID：prod-1");
        expect(prompt).toContain("素材 1「m-1.png」");
        expect(prompt).toContain("素材 2「m-2.png」");
        expect(prompt).toContain("旋转 0.0°");
        expect(prompt).toContain("平铺：单张居中");
        expect(prompt).toContain("输出 2 张");
    });

    test("字段只有 5 个，列表顺序与素材顺序一致", () => {
        const fields = buildSdsDesignFields(values());
        expect(Object.keys(fields).sort()).toEqual(["imageList", "imageName", "imageUrl", "materialList", "productId"]);
        const list = fields.imageList as Record<string, unknown>[];
        expect(list.map((row) => row.assetId)).toEqual(["m-1", "m-2"]);
        expect(list.map((row) => row.order)).toEqual([0, 1]);
        expect((fields.materialList as Record<string, unknown>[])[0]).toMatchObject({ assetId: "m-1", scale: 0.6, tilingPresetId: "single" });
        expect(fields.imageName).toBe("m-1.png");
        expect(String(fields.imageUrl)).toContain("m-1.png");
        expect(fields.productId).toBe("prod-1");
    });

    test("审计能点名缺字段、字段漂移与多余字段", () => {
        const fields = buildSdsDesignFields(values());
        expect(auditSdsDesignFields(fields, values()).ok).toBe(true);
        const missing = { ...fields } as Record<string, unknown>;
        delete missing.materialList;
        expect(auditSdsDesignFields(missing, values()).missing).toEqual(["materialList"]);
        expect(auditSdsDesignFields({ ...fields, extra: 1 }, values()).unexpected).toEqual(["extra"]);
        expect(auditSdsDesignFields({ ...fields, productId: "other" }, values()).mismatched).toEqual(["productId"]);
    });

    test("提交守卫：参考图顺序 = 商品图 + 素材，模型缺失不放行", () => {
        const input = buildSdsDesignInput({ values: values(), model: "img-model", revision: 1 });
        expect(() => assertSdsDesignInput(input, values())).not.toThrow();
        expect(input.toolId).toBe(SDS_DESIGN_TOOL_ID);
        expect(input.count).toBe(2);
        expect(input.references?.map((reference) => reference.id)).toEqual(["prod-1", "m-1", "m-2"]);
        expect(validateSdsDesignState({ values: values({ materials: [] }), hasModel: true })[0].code).toBe("material-required");
        expect(validateSdsDesignState({ values: values(), hasModel: false }).some((issue) => issue.code === "model-missing")).toBe(true);
        expect(isSdsReady(values(), true)).toBe(true);
        expect(isSdsReady(values({ product: null }), true)).toBe(false);
    });
});

describe("真实执行：run / 部分补生成 / retry", () => {
    const makeGateway = (final: ToolTask) => {
        const submitted: Record<string, unknown>[] = [];
        const retried: Record<string, unknown>[] = [];
        const gateway = {
            submit: async (input: Record<string, unknown>) => {
                submitted.push(input);
                return final;
            },
            waitForResult: async () => final,
            retry: async (_taskId: string, input: Record<string, unknown>) => {
                retried.push(input);
                return final;
            },
        };
        return { gateway: gateway as never, submitted, retried };
    };

    test("提交即终态：快照按素材顺序、revision 与响应 id 齐全", async () => {
        const final = task({ upstreamTaskId: "up-9", result: { items: [imageItem("i1"), imageItem("i2")], receivedAt: 3 } });
        const { gateway, submitted } = makeGateway(final);
        const run = await runSdsDesign({ gateway, values: values(), model: "img-model", revision: 2, requestId: "req-1" });
        expect(submitted).toHaveLength(1);
        expect(run.snapshot.materials.map((material) => material.assetId)).toEqual(["m-1", "m-2"]);
        expect(run.snapshot.revision).toBe(2);
        expect(run.requestId).toBe("req-1");
        expect(run.responseId).toBe("up-9");
        expect(sdsResponseId(run.task)).toBe("up-9");
    });

    test("配置/来源不合法时在提交前抛错，一个请求都不发", async () => {
        const { gateway, submitted } = makeGateway(task());
        await expect(runSdsDesign({ gateway, values: values({ materials: [] }), model: "img-model" })).rejects.toThrow(SdsAdapterError);
        await expect(runSdsDesign({ gateway, values: values({ product: null }), model: "img-model" })).rejects.toThrow(/商品图/);
        await expect(runSdsDesign({ gateway, values: values(), model: "img-model", imageModelReady: false })).rejects.toThrow(/模型/);
        expect(submitted).toHaveLength(0);
    });

    test("上游少给图：只报缺的序号，可只补缺失素材", async () => {
        const final = task({ result: { items: [imageItem("i1")], receivedAt: 3 } });
        const { gateway, retried } = makeGateway(final);
        const run = await runSdsDesign({ gateway, values: values(), model: "img-model" });
        const result = sdsDesignResultFromTask(run.task, run.snapshot, run.snapshot);
        expect(result.missingIndexes).toEqual([1]);
        expect(sdsMissingIndexes(result.slots)).toEqual([1]);
        expect(sdsRepairIndexes(result)).toEqual([1]);
        expect(sdsDesignResultNotice(result)).toContain("缺 1 张");
        expect(sdsResultSlots(final, run.snapshot).map((slot) => slot.item?.id)).toEqual(["i1", undefined]);
        await retrySdsDesign({ gateway, values: values(), model: "img-model", taskId: "task-1", materialIndexes: [1] });
        expect(retried).toHaveLength(1);
        expect((retried[0] as { count?: number }).count).toBe(1);
    });

    test("快照漂移逐项可读；重试复用同一 requestId", async () => {
        const final = task({ result: { items: [imageItem("i1"), imageItem("i2")], receivedAt: 3 } });
        const { gateway } = makeGateway(final);
        const run = await runSdsDesign({ gateway, values: values(), model: "img-model", requestId: "req-1" });
        const changed = createSdsSnapshot(values({ colorId: "black" }), { revision: null, requestId: "req-1" });
        expect(describeSdsDrift(run.snapshot, changed)).toBe("颜色");
        expect(describeSdsDrift(run.snapshot, undefined)).toBe("");
        const repair = await retrySdsDesign({ gateway, values: values(), model: "img-model", taskId: "task-1", requestId: "req-1" });
        expect(repair.requestId).toBe("req-1");
        expect(sdsDesignResultNotice(sdsDesignResultFromTask(final, run.snapshot, run.snapshot))).toBe("");
        expect(sdsDesignResultFromTask(undefined, undefined, undefined).status).toBe("idle");
    });
});

describe("草稿：只存可复原配置", () => {
    test("不存二进制，回读后商品/素材/平铺都还在", () => {
        const draft = serializeSdsValues(values({ materials: [createSdsMaterial(asset("m-1"), { tilingPresetId: "grid-2x2" })] }));
        expect(JSON.stringify(draft)).not.toContain("data:image");
        const restored = parseSdsDraft(draft);
        expect(restored.product?.assetId).toBe("prod-1");
        expect(restored.materials[0].tilingPresetId).toBe("grid-2x2");
        expect(restored.materials[0].placement).toEqual({ x: 0.5, y: 0.5, scale: 0.6, rotation: 0 });
    });

    test("脏草稿里的非法平铺回落、越界落位被夹回", () => {
        const restored = parseSdsDraft({
            imageName: "m-9.png",
            colorId: "original",
            productId: "prod-1",
            productName: "prod-1.png",
            productWidth: 1200,
            productHeight: 1600,
            materials: [{ assetId: "m-9", name: "m-9.png", tilingPresetId: "weird", placement: { x: 5, y: -5, scale: 9, rotation: 999 } }],
        });
        expect(restored.materials[0].tilingPresetId).toBe("single");
        expect(restored.materials[0].placement.x).toBeLessThanOrEqual(1);
        expect(restored.materials[0].placement.scale).toBe(1);
        expect(restored.materials[0].placement.rotation).toBeLessThanOrEqual(180);
    });

    test("结构损坏的草稿整体回落，不半信半疑沿用", () => {
        expect(parseSdsDraft({ colorId: "neon", materials: [{ assetId: "m-9" }] }).materials).toEqual([]);
        expect(parseSdsDraft(null).product).toBeNull();
    });
});
