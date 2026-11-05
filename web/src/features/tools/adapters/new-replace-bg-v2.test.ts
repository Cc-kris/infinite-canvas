import { describe, expect, test } from "bun:test";

import type { ToolTask } from "@/services/api/tools/task-machine";

import {
    DEFAULT_NEW_REPLACE_BG_VALUES,
    NEW_REPLACE_BG_V2_TOOL_ID,
    SCENE_LAYER_IDS,
    SCENE_TEMPLATES,
    buildNewReplaceBgPrompt,
    buildSceneCanvasData,
    buildSceneImageRecords,
    buildSceneSizeData,
    clampSceneTransform,
    clampSceneWeight,
    computeSceneOutput,
    createNewReplaceBgSnapshot,
    describeNewReplaceBgDrift,
    isNewReplaceBgSnapshotStale,
    readNewReplaceBgValues,
    resetSceneLayer,
    resolveCutoutReadiness,
    sceneSteps,
    sceneWeightLabel,
    validateNewReplaceBgState,
    type NewReplaceBgValues,
} from "../registry/new-replace-bg-v2";

import {
    NewReplaceBgAdapterError,
    assertNewReplaceBgInput,
    buildNewReplaceBgInput,
    buildSceneReferences,
    isSceneSourceReady,
    newReplaceBgResultFromTask,
    retryNewReplaceBg,
    runNewReplaceBg,
    sceneResultGrid,
    validateSceneSource,
    type NewReplaceBgGatewayLike,
    type SceneSourceAsset,
} from "./new-replace-bg-v2";

const values = (patch: Partial<NewReplaceBgValues> = {}): NewReplaceBgValues => ({
    ...DEFAULT_NEW_REPLACE_BG_VALUES,
    goodsAssetId: "asset-goods",
    goodsName: "chair.png",
    maskAssetId: "asset-mask",
    cutoutConfirmed: true,
    ...patch,
});

const goods = (patch: Partial<SceneSourceAsset> = {}): SceneSourceAsset => ({
    assetId: "asset-goods",
    dataUrl: "data:image/png;base64,AAAA",
    name: "goods.png",
    mimeType: "image/png",
    bytes: 400_000,
    width: 1200,
    height: 900,
    ...patch,
});

const mask: SceneSourceAsset = { assetId: "asset-mask", dataUrl: "data:image/png;base64,BBBB", name: "mask.png", mimeType: "image/png" };
const bg: SceneSourceAsset = { assetId: "asset-bg", dataUrl: "data:image/png;base64,CCCC", name: "background.png", mimeType: "image/png" };

const task = (patch: Partial<ToolTask> = {}): ToolTask =>
    ({
        id: "task-scene",
        toolId: NEW_REPLACE_BG_V2_TOOL_ID,
        clientOperationId: "op-scene",
        status: "running",
        prompt: "p",
        fingerprint: "fp",
        capability: "image",
        sourceAssetIds: ["asset-goods"],
        configSnapshot: { capability: "image", model: "img-model", count: 1 },
        attempts: 1,
        pollCount: 1,
        transientFailures: 0,
        createdAt: 1,
        updatedAt: 2,
        ...patch,
    }) as ToolTask;

function gatewayOf(sequence: ToolTask[]): NewReplaceBgGatewayLike & { inputs: unknown[]; retried: string[] } {
    const inputs: unknown[] = [];
    const retried: string[] = [];
    return {
        inputs,
        retried,
        submit: async (input) => {
            inputs.push(input);
            return task({ status: "running" });
        },
        waitForResult: async () => sequence.shift() ?? task({ status: "failed" }),
        retry: async (taskId, input) => {
            retried.push(taskId);
            inputs.push(input);
            return task({ status: "running" });
        },
    };
}

describe("商品图 · 输出规格与结果网格", () => {
    test("比例 → 画布尺寸，数量只允许 1/2/4", () => {
        expect(computeSceneOutput("1:1", 1)).toMatchObject({ width: 1024, height: 1024, count: 1, legal: true });
        expect(computeSceneOutput("9:16", 4)).toMatchObject({ width: 720, height: 1280, count: 4, legal: true });
        const bad = computeSceneOutput("5:2", 3);
        expect(bad.legal).toBe(false);
        expect(bad.issues.map((item) => item.code)).toEqual(["ratio-invalid", "count-invalid"]);
        expect(bad.ratio).toBe("1:1");
        expect(bad.count).toBe(1);
    });

    test("结果网格按承诺格子数切分，上游少给不补图", () => {
        const images = [
            { id: "i1", kind: "image" as const, dataUrl: "data:image/png;base64,1" },
            { id: "i2", kind: "image" as const, dataUrl: "data:image/png;base64,2" },
        ];
        const done = sceneResultGrid(images, 4, "succeeded");
        expect(done).toHaveLength(4);
        expect(done[0].dataUrl).toBe("data:image/png;base64,1");
        expect(done[2].dataUrl).toBeUndefined();
        expect(done[2].expected).toBe(false);
        const running = sceneResultGrid([], 2, "running");
        expect(running.every((cell) => cell.expected)).toBe(true);
    });
});

describe("商品图 · 图层状态与草稿容错", () => {
    test("越界数值夹取：强度对齐 0.05 步长，变换回到合法区间", () => {
        expect(clampSceneWeight(1.7)).toBe(1);
        expect(clampSceneWeight(-3)).toBe(0);
        expect(clampSceneWeight("0.63")).toBe(0.65);
        expect(clampSceneWeight(undefined)).toBe(0.7);
        const clamp = clampSceneTransform({ x: -2, y: 9, scale: 50, rotate: -500 });
        expect(clamp).toEqual({ x: 0, y: 1, scale: 2, rotate: -180 });
        expect(sceneWeightLabel(0.7)).toBe("偏强（更融入场景）");
    });

    test("草稿读取：非法枚举回落、蒙版本体不入草稿、图层缺省补齐", () => {
        const parsed = readNewReplaceBgValues({
            sceneType: "unknown",
            templateId: "not-a-template",
            weight: "0.4",
            ratio: "3:4",
            outputNum: 2,
            transform: { x: 0.2, scale: 1.5 },
            layers: { goods: { visible: false } },
            cutoutMode: "transparent",
            cutoutConfirmed: "yes",
            maskUrl: "data:image/png;base64,SHOULD_NOT_PERSIST",
        });
        expect(parsed.sceneType).toBe("recommend");
        expect(parsed.templateId).toBe(SCENE_TEMPLATES[0].id);
        expect(parsed.weight).toBe(0.4);
        expect(parsed.outputNum).toBe(2);
        expect(parsed.transform).toEqual({ x: 0.2, y: DEFAULT_NEW_REPLACE_BG_VALUES.transform.y, scale: 1.5, rotate: 0 });
        expect(parsed.layers.goods.visible).toBe(false);
        expect(parsed.layers.bg.visible).toBe(true);
        expect(parsed.cutoutConfirmed).toBe(false);
        expect(parsed).not.toHaveProperty("maskUrl");
    });

    test("逐层重置只影响该层", () => {
        const base = values({ transform: { x: 0.2, y: 0.3, scale: 1.6, rotate: 12 }, bgAssetId: "asset-bg" });
        const goodsReset = resetSceneLayer(base, "goods");
        expect(goodsReset.transform).toEqual(DEFAULT_NEW_REPLACE_BG_VALUES.transform);
        expect(goodsReset.bgAssetId).toBe("asset-bg");
        const bgReset = resetSceneLayer({ ...base, layers: { ...base.layers, bg: { visible: false, locked: true } } }, "bg");
        expect(bgReset.layers.bg).toEqual({ visible: true, locked: false });
        expect(bgReset.transform).toEqual(base.transform);
        const lockReset = resetSceneLayer({ ...base, lockCutout: false }, "lock");
        expect(lockReset.lockCutout).toBe(true);
    });
});

describe("商品图 · 抠图确认门禁", () => {
    test("蒙版缺失 / 未确认 / 透明底无 alpha 都拦住", () => {
        expect(resolveCutoutReadiness("mask", { confirmed: true }).code).toBe("cutout-mask-missing");
        expect(resolveCutoutReadiness("mask", { maskReady: true }).code).toBe("cutout-unconfirmed");
        expect(resolveCutoutReadiness("transparent", { goodsHasAlpha: false, confirmed: true }).code).toBe("cutout-transparent-required");
        expect(resolveCutoutReadiness("transparent", { goodsHasAlpha: true, confirmed: true })).toMatchObject({ ready: true });
        expect(resolveCutoutReadiness("mask", { maskReady: true, confirmed: true })).toMatchObject({ ready: true, mode: "mask" });
    });

    test("校验把抠图与场景缺口分开报，提交前逐项可见", () => {
        const output = computeSceneOutput("1:1", 1);
        const cutout = resolveCutoutReadiness("mask", { maskReady: false, confirmed: false });
        const issues = validateNewReplaceBgState({ values: values({ maskAssetId: "" }), output, goodsReady: true, cutout, imageModelReady: true });
        expect(issues.map((item) => item.code)).toContain("cutout-mask-missing");
        expect(issues.map((item) => item.field)).not.toContain("templateId");

        const custom = validateNewReplaceBgState({
            values: values({ sceneType: "custom", customPrompt: "", bgAssetId: "" }),
            output,
            goodsReady: true,
            cutout: resolveCutoutReadiness("mask", { maskReady: true, confirmed: true }),
            imageModelReady: true,
        });
        expect(custom.map((item) => item.code)).toContain("custom-scene-missing");

        const noModel = validateNewReplaceBgState({
            values: values(),
            output,
            goodsReady: true,
            cutout: resolveCutoutReadiness("mask", { maskReady: true, confirmed: true }),
            imageModelReady: false,
        });
        expect(noModel.map((item) => item.code)).toContain("model-missing");
    });

    test("步骤条按门禁推进", () => {
        const steps = sceneSteps({ goodsReady: true, cutoutReady: false, sceneReady: false, hasResult: false });
        expect(steps.map((step) => step.status)).toEqual(["done", "active", "todo", "todo"]);
        expect(sceneSteps({ goodsReady: true, cutoutReady: true, sceneReady: true, hasResult: true }).every((step) => step.status === "done")).toBe(true);
    });
});

describe("商品图 · 画布状态序列化（真实请求字段）", () => {
    test("canvasData / sizeData / imageRecords 一一对应页面状态", () => {
        const v = values({ weight: 0.55, transform: { x: 0.4, y: 0.6, scale: 1.2, rotate: 15 }, bgAssetId: "asset-bg" });
        const output = computeSceneOutput("4:5", 2);
        const canvas = buildSceneCanvasData(v, output);
        expect(canvas).toMatchObject({ version: 1, sceneType: "recommend", weight: 0.55, ratio: "4:5", width: 1024, height: 1280 });
        expect(canvas.goods).toEqual({ x: 0.4, y: 0.6, scale: 1.2, rotate: 15 });
        expect(canvas.layers.map((layer) => layer.id)).toEqual(["bg", "goods", "material", "lock"]);
        expect(buildSceneSizeData(v, output)).toEqual({ width: 1024, height: 1280, ratio: "4:5", count: 2, unit: "px", layers: 4 });
        expect(buildSceneImageRecords(v).map((item) => item.layer)).toEqual(["goods", "bg", "lock"]);
    });

    test("提示词携带强度 / 场景类型 / 变换 / 数量 / 锁定策略", () => {
        const v = values({ weight: 0.7, customPrompt: "", transform: { x: 0.5, y: 0.56, scale: 1, rotate: 0 } });
        const output = computeSceneOutput("16:9", 4);
        const prompt = buildNewReplaceBgPrompt(v, output);
        expect(prompt).toContain("融合强度 70%");
        expect(prompt).toContain("推荐场景");
        expect(prompt).toContain(SCENE_TEMPLATES[0].label);
        expect(prompt).toContain("1280×720");
        expect(prompt).toContain("共 4 张");
        expect(prompt).toContain("锁定商品轮廓");
        const custom = buildNewReplaceBgPrompt(values({ sceneType: "custom", templateId: "", customPrompt: "放在露营桌上，有晨雾" }), output);
        expect(custom).toContain("自定义背景");
        expect(custom).toContain("放在露营桌上，有晨雾");
    });
});

describe("商品图 · 请求组装与防丢参", () => {
    test("参考图顺序固定：商品 → 蒙版 → 背景，并在提示词里点名", () => {
        const refs = buildSceneReferences({ goods: goods(), mask, bg });
        expect(refs.map((item) => item.id)).toEqual(["asset-goods", "asset-mask", "asset-bg"]);
        const input = buildNewReplaceBgInput({ values: values({ sceneType: "custom", templateId: "", customPrompt: "户外草地", bgAssetId: "asset-bg" }), output: computeSceneOutput("1:1", 2), goods: goods(), mask, bg, model: "img-model" });
        expect(input.references?.length).toBe(3);
        expect(input.prompt).toContain("参考图 2 是主体蒙版");
        expect(input.prompt).toContain("参考图 3 是目标背景图");
        expect(input.count).toBe(2);
        expect(input.size).toBe("1024x1024");
        const fields = input.fields as Record<string, unknown>;
        expect(fields.canvasData).toBeTruthy();
        expect(fields.sizeData).toBeTruthy();
        expect((fields.imageRecords as unknown[]).length).toBe(3);
        expect(input.references?.[0].dataUrl.startsWith("data:image/png")).toBe(true);
    });

    test("丢参守卫：篡改强度 / 少传蒙版 / 换尺寸都会被拦下", () => {
        const v = values({ weight: 0.7 });
        const output = computeSceneOutput("1:1", 1);
        const input = buildNewReplaceBgInput({ values: v, output, goods: goods(), mask, model: "img-model" });
        expect(() => assertNewReplaceBgInput(input, v, output)).not.toThrow();

        const tampered = { ...input, fields: { ...(input.fields as Record<string, unknown>), weight: 0.2 } };
        expect(() => assertNewReplaceBgInput(tampered, v, output)).toThrow(NewReplaceBgAdapterError);

        const noMask = { ...input, references: [input.references![0]] };
        expect(() => assertNewReplaceBgInput(noMask, v, output)).toThrow(/蒙版/);

        const wrongSize = { ...input, size: "512x512" };
        expect(() => assertNewReplaceBgInput(wrongSize, v, output)).toThrow(/画布尺寸/);
    });

    test("未确认抠图 / 未配模型 / 非法素材直接拒绝提交", () => {
        const output = computeSceneOutput("1:1", 1);
        expect(() => buildNewReplaceBgInput({ values: values({ cutoutConfirmed: false }), output, goods: goods(), mask, model: "m" })).toThrow(/确认抠图/);
        expect(() => buildNewReplaceBgInput({ values: values(), output, goods: goods(), mask, model: "" })).toThrow(/图片模型/);
        expect(validateSceneSource(goods({ mimeType: "image/gif" }))).toMatchObject({ ok: false });
        expect(validateSceneSource(goods({ bytes: 40 * 1024 * 1024 }))).toMatchObject({ ok: false });
        expect(validateSceneSource(goods({ width: 20, height: 20 }))).toMatchObject({ ok: false });
        expect(validateSceneSource({ assetId: "x" })).toMatchObject({ ok: false });
        expect(isSceneSourceReady(goods())).toBe(true);
        expect(isSceneSourceReady(undefined)).toBe(false);
    });
});

describe("商品图 · 真实执行与结果", () => {
    test("run 提交真实请求并等待结果；结果只取自 task.result", async () => {
        const gateway = gatewayOf([
            task({
                status: "succeeded",
                result: {
                    items: [
                        { id: "r1", kind: "image", dataUrl: "data:image/png;base64,R1" },
                        { id: "r2", kind: "image" },
                    ],
                    receivedAt: 3,
                },
            }),
        ]);
        const output = computeSceneOutput("1:1", 2);
        const v = values();
        const run = await runNewReplaceBg({ gateway, values: v, output, goods: goods(), mask, model: "img-model" });
        expect(gateway.inputs).toHaveLength(1);
        expect(run.task.status).toBe("succeeded");

        const current = createNewReplaceBgSnapshot(v, output);
        const result = newReplaceBgResultFromTask(run.task, run.snapshot, current);
        expect(result.status).toBe("succeeded");
        expect(result.images.map((item) => item.id)).toEqual(["r1"]);
        expect(result.stale).toBe(false);
    });

    test("参数变更后结果标记过期并给出原因；失败不产出图", async () => {
        const output = computeSceneOutput("1:1", 1);
        const snapshot = createNewReplaceBgSnapshot(values(), output);
        const changed = createNewReplaceBgSnapshot(values({ weight: 0.3, transform: { x: 0.2, y: 0.4, scale: 0.8, rotate: 0 } }), output);
        expect(isNewReplaceBgSnapshotStale(snapshot, changed)).toBe(true);
        const drift = describeNewReplaceBgDrift(snapshot, changed);
        expect(drift).toContain("融合强度");
        expect(drift).toContain("商品位置");

        const failed = newReplaceBgResultFromTask(
            task({ status: "failed", error: { code: "upstream", message: "上游超时", retryable: true } }),
            snapshot,
            changed,
            drift,
        );
        expect(failed.status).toBe("failed");
        expect(failed.error).toBe("上游超时");
        expect(failed.images).toEqual([]);
        expect(failed.stale).toBe(true);
        expect(newReplaceBgResultFromTask(undefined, undefined, undefined).status).toBe("idle");
    });

    test("重试沿用同一份请求参数", async () => {
        const gateway = gatewayOf([task({ status: "succeeded", result: { items: [{ id: "r1", kind: "image", dataUrl: "data:image/png;base64,R1" }], receivedAt: 3 } })]);
        const output = computeSceneOutput("1:1", 1);
        await retryNewReplaceBg({ gateway, taskId: "task-old", values: values(), output, goods: goods(), mask, model: "img-model" });
        expect(gateway.retried).toEqual(["task-old"]);
        expect(gateway.inputs).toHaveLength(1);
        const fields = (gateway.inputs[0] as { fields: Record<string, unknown> }).fields;
        expect(fields.cutoutMode).toBe("mask");
    });
});

/* ================================================================== */
/* 真实渲染证据：react-dom/server 渲染真组件（不是读源码）              */
/* ================================================================== */

const draftValues = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
        getItem: (key: string) => draftValues.get(key) ?? null,
        setItem: (key: string, value: string) => void draftValues.set(key, value),
        removeItem: (key: string) => void draftValues.delete(key),
        clear: () => draftValues.clear(),
        key: (index: number) => Array.from(draftValues.keys())[index] ?? null,
        get length() {
            return draftValues.size;
        },
    },
});

async function renderSceneWorkspace(): Promise<string> {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { default: Workspace } = await import("@/components/tools/workspaces/scene");
    return renderToStaticMarkup(React.createElement(Workspace) as Parameters<typeof renderToStaticMarkup>[0]);
}

describe("商品图工作区渲染", () => {
    test("分区齐全：流程 / 商品层 / 抠图确认 / 场景 / 强度 / 输出 / 画布 / 图层 / 参数 / 结果", async () => {
        const html = await renderSceneWorkspace();
        for (const id of [
            "scene-workspace",
            "scene-goods",
            "scene-cutout",
            "scene-type",
            "scene-weight",
            "scene-output",
            "scene-canvas",
            "scene-layers",
            "scene-inspector",
            "scene-submit",
            "scene-result",
        ]) {
            expect(html).toContain(`data-testid="${id}"`);
        }
    });

    test("默认态就是 chunk 默认：推荐场景 + weight 70% + 1 张 + 8 个模板", async () => {
        const html = await renderSceneWorkspace();
        expect(html).toContain('data-testid="scene-type-recommend"');
        expect(html).toContain('aria-pressed="true"');
        expect(html).toContain("70%");
        expect(html).toContain('data-testid="scene-count-1"');
        for (const template of SCENE_TEMPLATES) expect(html).toContain(`data-testid="scene-template-${template.id}"`);
    });

    test("未上传商品时给出真实拦截，而不是可点的假按钮", async () => {
        const html = await renderSceneWorkspace();
        expect(html).toContain('data-testid="scene-issues"');
        expect(html).toMatch(/data-testid="scene-generate"[^>]*disabled/);
        /* 抠图门禁先卡蒙版：提示语来自真实 readiness，不是占位文案 */
        expect(html).toContain('data-testid="scene-cutout-state"');
    });

    test("图层四个都在，且画布显示默认场景模板描述", async () => {
        const html = await renderSceneWorkspace();
        for (const layer of SCENE_LAYER_IDS) expect(html).toContain(`data-testid="scene-layer-${layer}"`);
        expect(html).toContain(SCENE_TEMPLATES[0].prompt);
        /* 结果网格默认 1 格，未生成时明确是待生成 */
        expect(html).toContain('data-testid="scene-grid-cell-0"');
        expect(html).toContain("待生成");
        /* page-specs/15 §6 要求画布工具可撤销/重做 + 提交快照可查 */
        expect(html).toContain('data-testid="scene-history-bar"');
        expect(html).toContain("无可撤销步骤");
        expect(html).toContain('data-testid="scene-submitted-empty"');
        /* spec 里的组件名必须能对上（layer composer / similarity / variant grid） */
        expect(html).toContain('data-testid="scene-layer-composer"');
        expect(html).toContain('data-testid="scene-similarity-control"');
        expect(html).toContain('data-component="scene-variant-grid"');
    });
});

/* ================================================================== */
/* 撤销 / 重做（page-specs/15 §6 要求画布工具可撤销重做）              */
/* ================================================================== */

describe("商品图 · 撤销重做", async () => {
    const reg = await import("@/features/tools/registry/new-replace-bg-v2");
    const base = reg.DEFAULT_NEW_REPLACE_BG_VALUES;

    test("无历史时撤销/重做都是空操作，不产生 next", () => {
        const history = reg.createSceneHistory();
        const undo = reg.stepSceneHistory(history, base, "undo");
        const redo = reg.stepSceneHistory(history, base, "redo");
        expect(undo.next).toBe(undefined);
        expect(redo.next).toBe(undefined);
        expect(reg.sceneHistoryState(history)).toEqual({ canUndo: false, canRedo: false, past: 0, future: 0 });
    });

    test("撤销回到上一步，重做回到撤销前的状态", () => {
        const step1 = { ...base, weight: 0.5 };
        const step2 = { ...step1, outputNum: 3 };
        let history = reg.createSceneHistory();
        history = reg.pushSceneHistory(history, base);
        history = reg.pushSceneHistory(history, step1);

        const undone = reg.stepSceneHistory(history, step2, "undo");
        expect(undone.next?.outputNum).toBe(1);
        expect(reg.sceneHistoryState(undone.history)).toEqual({ canUndo: true, canRedo: true, past: 1, future: 1 });

        const redone = reg.stepSceneHistory(undone.history, undone.next!, "redo");
        expect(redone.next?.outputNum).toBe(3);
        expect(reg.sceneHistoryState(redone.history)).toEqual({ canUndo: true, canRedo: false, past: 2, future: 0 });
    });

    test("撤销后再改参数会清空重做栈（新分支）", () => {
        let history = reg.createSceneHistory();
        history = reg.pushSceneHistory(history, base);
        const undone = reg.stepSceneHistory(history, { ...base, weight: 0.4 }, "undo");
        expect(reg.sceneHistoryState(undone.history).canRedo).toBe(true);
        const rebranched = reg.pushSceneHistory(undone.history, base);
        expect(reg.sceneHistoryState(rebranched).canRedo).toBe(false);
    });

    test("历史上限 30 步，超出丢最旧的一条", () => {
        let history = reg.createSceneHistory();
        for (let index = 0; index < 40; index += 1) history = reg.pushSceneHistory(history, { ...base, weight: index / 100 });
        expect(history.past.length).toBe(reg.SCENE_HISTORY_LIMIT);
        expect(reg.SCENE_HISTORY_LIMIT).toBe(30);
        /* 最旧那条被丢掉：栈底是第 10 次修改（weight=0.10） */
        expect(history.past[0].weight).toBeCloseTo(0.1, 6);
    });
});
