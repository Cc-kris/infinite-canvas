import { describe, expect, test } from "bun:test";

import type { ToolTask } from "@/services/api/tools/task-machine";

import type { MaskCanvas, MaskRenderDeps } from "./area-repair";
import {
    buildXsyInput,
    buildXsyUnit,
    mapXsyTaskToOutcome,
    renderXsyMasks,
    type XsyUnit,
} from "./ai-dressing-xsy";
import {
    AI_DRESSING_XSY_FIELD_KEYS,
    AI_DRESSING_XSY_TOOL_ID,
    advanceXsyStep,
    applyXsyEdit,
    buildXsySnapshot,
    composeXsyFields,
    createXsyValues,
    fillXsyMask,
    firstXsyError,
    markXsyStepsStale,
    normalizeXsyValues,
    resolveXsyCapability,
    revisitXsyStep,
    serializeXsyValues,
    switchXsyTab,
    validateXsy,
    xsyEstimate,
    xsyMaskCoverage,
    xsyMaskEmpty,
    xsyMissingFields,
    xsySlotMeta,
    xsySnapshotHash,
    xsyStepStates,
    type XsyCapability,
    type XsyValues,
} from "@/features/tools/registry/ai-dressing-xsy";

const MODEL_URL = "data:image/png;base64,model";
const UPPER_URL = "data:image/png;base64,upper";
const DOWN_URL = "data:image/png;base64,down";

/**
 * 测试注入的画布：仍然真实走绘制调用（记录调用序列），只是不落像素。
 * 生产环境用真实 canvas —— 这里不替它假装成功。
 */
function fakeCanvasDeps(): { deps: MaskRenderDeps; calls: string[] } {
    const calls: string[] = [];
    const deps: MaskRenderDeps = {
        createCanvas: (width: number, height: number): MaskCanvas => {
            calls.push(`create:${width}x${height}`);
            const ctx = {
                fillStyle: "#000000",
                strokeStyle: "#ffffff",
                lineCap: "round",
                lineJoin: "round",
                lineWidth: 1,
                filter: "none",
                globalCompositeOperation: "source-over",
                fillRect: () => calls.push("fillRect"),
                beginPath: () => calls.push("beginPath"),
                moveTo: () => calls.push("moveTo"),
                lineTo: () => calls.push("lineTo"),
                stroke: () => calls.push("stroke"),
                drawImage: () => calls.push("drawImage"),
            };
            return {
                width,
                height,
                getContext: () => ctx as unknown as ReturnType<MaskCanvas["getContext"]>,
                toDataURL: () => "data:image/png;base64,MASK",
            };
        },
    };
    return { deps, calls };
}

const capability: XsyCapability = resolveXsyCapability({ modelId: "doubao-image", provider: "openai", version: "v1" });

function filledGarment(slot: "upper" | "down" | "suit", url: string, id: string) {
    const base = createXsyValues().garments[slot];
    return fillXsyMask({ ...base, assetId: id, name: id, imageUrl: url, width: 600, height: 800 }, `fill-${id}`);
}

function readyValues(): XsyValues {
    const base = createXsyValues();
    return {
        ...base,
        step: 4,
        model: { assetId: "m-1", name: "模特", imageUrl: MODEL_URL, width: 768, height: 1024 },
        garments: {
            upper: filledGarment("upper", UPPER_URL, "g-upper"),
            down: filledGarment("down", DOWN_URL, "g-down"),
            suit: base.garments.suit,
        },
    };
}

describe("AI_DRESSING_XSY 注册表", () => {
    test("字段契约 = 页面 17 个字段（逐字一致，无重复）", () => {
        expect(AI_DRESSING_XSY_FIELD_KEYS).toHaveLength(17);
        expect(new Set(AI_DRESSING_XSY_FIELD_KEYS).size).toBe(17);
        const expected = [
            "downImageUrl",
            "downMaskUrl",
            "downOriginUrl",
            "modelImageUrl",
            "modelPose",
            "modelStyle",
            "modelType",
            "outputNum",
            "provider",
            "step",
            "suitImageUrl",
            "suitMaskUrl",
            "suitOriginUrl",
            "upperImageUrl",
            "upperMaskUrl",
            "upperOriginUrl",
            "version",
        ];
        expect([...AI_DRESSING_XSY_FIELD_KEYS] as string[]).toEqual(expected);
    });

    test("默认：第 1 步、上下装模式、1 张输出，且空值全部被拦", () => {
        const values = createXsyValues();
        expect(values.step).toBe(1);
        expect(values.activeTab).toBe("upper-lower");
        expect(values.outputNum).toBe(1);
        const issues = validateXsy(values, capability);
        expect(firstXsyError(issues)?.code).toBe("model-missing");
        const codes = issues.map((issue) => issue.code);
        expect(codes).toContain("garment-missing");
        // 没有服装图时不报 mask-empty：没图就没有可标记的部位，别制造噪声。
        expect(codes).not.toContain("mask-empty");
    });

    test("步骤推进：当前步有错就原地不动并回传字段原因", () => {
        const empty = createXsyValues();
        const blocked = advanceXsyStep(empty, capability);
        expect(blocked.ok).toBe(false);
        if (!blocked.ok) expect(blocked.issues[0]?.field).toBe("modelImageUrl");

        const step1 = applyXsyEdit(createXsyValues(), { model: { assetId: "m", name: "模特", imageUrl: MODEL_URL, width: 768, height: 1024 } }, 1);
        const advanced = advanceXsyStep(step1, capability);
        expect(advanced.ok).toBe(true);
        if (advanced.ok) expect(advanced.values.step).toBe(2);
    });

    test("上游改动只标下游 stale，不删除下游草稿", () => {
        const ready = readyValues();
        const edited = applyXsyEdit(ready, { modelStyle: "editorial" }, 1);
        expect(edited.garments.upper.imageUrl).toBe(UPPER_URL);
        expect(edited.staleSteps).toContain(3);
        expect(edited.staleSteps).toContain(4);
        expect(edited.staleSteps).not.toContain(1);
        const revisit = revisitXsyStep(edited, 3);
        expect(revisit.staleSteps).not.toContain(3);
        expect(revisit.step).toBe(3);
    });

    test("步骤状态：过错的步是 pending 且被前序锁住", () => {
        const empty = createXsyValues();
        const states = xsyStepStates(empty, capability);
        expect(states[0]?.status).toBe("active");
        expect(states[1]?.locked).toBe(true);
        const ready = xsyStepStates(readyValues(), capability);
        expect(ready[0]?.status).toBe("done");
        expect(ready[3]?.status).toBe("active");
    });

    test("蒙版：空判定与覆盖率来自真实栅格化，不是估计值", () => {
        const values = readyValues();
        expect(xsyMaskEmpty(values.garments.upper)).toBe(false);
        expect(xsyMaskCoverage(values.garments.upper)).toBeGreaterThan(0);
        const emptyGarment = createXsyValues().garments.upper;
        expect(xsyMaskEmpty(emptyGarment)).toBe(true);
        expect(xsyMaskCoverage(emptyGarment)).toBe(0);
    });

    test("切换特体：连体清空上下装槽位，切回不清掉连体草稿", () => {
        const values = readyValues();
        const suit = switchXsyTab(values, "suit");
        expect(suit.activeTab).toBe("suit");
        expect(suit.garments.upper.imageUrl).toBe("");
        expect(suit.garments.down.imageUrl).toBe("");
        expect(suit.step).toBeGreaterThanOrEqual(2);
        // 切 Tab 只把下游（蒙版/生成）标成需要重确认；第 2 步本身是「你现在要去补的步」。
        expect(suit.staleSteps).toContain(3);
        expect(suit.staleSteps).toContain(4);
        expect(suit.staleSteps).not.toContain(2);
    });

    test("草稿序列化可还原同一份值（含蒙版笔画），坏数据不炸", () => {
        const values = readyValues();
        const restored = normalizeXsyValues(serializeXsyValues(values));
        expect(restored.activeTab).toBe("upper-lower");
        expect(restored.garments.upper.imageUrl).toBe(UPPER_URL);
        expect(restored.garments.upper.mask.strokes.length).toBe(values.garments.upper.mask.strokes.length);
        expect(restored.model.width).toBe(768);
        const broken = normalizeXsyValues({ step: 99, activeTab: "??", garments: { upper: { imageUrl: 5 } } });
        expect(broken.step).toBe(4);
        expect(broken.activeTab).toBe("upper-lower");
        expect(broken.garments.upper.imageUrl).toBe("");
    });

    test("快照与 17 字段：缺蒙版 URL 时字段自检会点名，不回填空串", () => {
        const values = readyValues();
        const snapshot = buildXsySnapshot(values, { provider: "openai" });
        expect(snapshot.provider).toBe("openai");
        expect(snapshot.garments.map((garment) => garment.slot)).toEqual(["upper", "down"]);
        expect(xsyMissingFields(snapshot)).toEqual(["upperMaskUrl", "downMaskUrl"]);
        const fields = composeXsyFields(snapshot);
        expect(Object.keys(fields).sort()).toEqual([...AI_DRESSING_XSY_FIELD_KEYS].sort());
        expect(fields.modelImageUrl).toBe(MODEL_URL);
        expect(fields.upperImageUrl).toBe(UPPER_URL);
        expect(fields.upperOriginUrl).toBe(UPPER_URL);
        // 原站 step 是「步长」（30–120，默认 60），与向导步骤无关
        expect(fields.step).toBe(60);
        expect(fields.provider).toBe("openai");
        // 快照哈希是仓库统一的 base36 短哈希（djb2），不是 sha256；只要求稳定且非空。
        const hash = xsySnapshotHash(snapshot);
        expect(hash).toMatch(/^[0-9a-z]+$/);
        expect(xsySnapshotHash({ ...snapshot })).toBe(hash);
        expect(xsySnapshotHash({ ...snapshot, provider: "other" })).not.toBe(hash);
    });

    test("产物预估：参考图 = 模特 1 + 服装 2 + 蒙版 2", () => {
        expect(xsyEstimate(readyValues())).toEqual({
            count: 1,
            label: "上下装衣服 · 预计输出 1 张",
            referenceCount: 5,
        });
    });

    test("能力解析：没有模型 / 没有 provider / 未登记版本都阻断", () => {
        const none = resolveXsyCapability({ modelId: "", provider: "" });
        expect(none.modelReady).toBe(false);
        expect(none.blockedReason).toContain("图片模型");
        const badVersion = resolveXsyCapability({ modelId: "m", provider: "openai", version: "v9" });
        expect(badVersion.versionSupported).toBe(false);
        expect(badVersion.blockedReason).toContain("v9");
        const ok = resolveXsyCapability({ modelId: "m", provider: "openai", version: "v2" });
        expect(ok.blockedReason).toBe("");
    });
});

describe("AI_DRESSING_XSY 适配器", () => {
    test("蒙版真实导出：与源图同尺寸，空蒙版直接失败", async () => {
        const { deps, calls } = fakeCanvasDeps();
        const values = readyValues();
        const masks = await renderXsyMasks(values, deps);
        expect(masks.upper?.width).toBe(600);
        expect(masks.upper?.height).toBe(800);
        expect(masks.upper?.dataUrl.startsWith("data:image/")).toBe(true);
        expect(calls).toContain("create:600x800");
        expect(calls).toContain("stroke");

        const noMask: XsyValues = {
            ...values,
            garments: { ...values.garments, upper: { ...values.garments.upper, mask: { ...values.garments.upper.mask, strokes: [] } } },
        };
        await expect(renderXsyMasks(noMask, deps)).rejects.toThrow(/还没有标记穿衣区域/);
    });

    test("构建提交单元：17 字段齐全，参考图 = 模特 + 服装 + 同尺寸蒙版", async () => {
        const { deps } = fakeCanvasDeps();
        const unit = await buildXsyUnit(readyValues(), { capability, provider: "openai", deps, newId: () => "xsy-test" });
        expect(unit.id).toBe("xsy-test");
        expect(unit.missingFields).toEqual([]);
        expect(Object.keys(unit.fields)).toHaveLength(17);
        expect(unit.fields.upperMaskUrl).toBe("data:image/png;base64,MASK");
        expect(unit.references).toHaveLength(5);
        expect(unit.references[0]?.name).toBe("模特图");
        expect(unit.references.some((reference) => reference.name === "upper-mask.png")).toBe(true);
        expect(unit.prompt).toContain("AI_DRESSING_XSY");
        expect(unit.snapshot.garments[0]?.maskCoverage).toBeGreaterThan(0);
    });

    test("构建提交单元：缺图 / 缺模型直接抛错，不产出半成品", async () => {
        const { deps } = fakeCanvasDeps();
        await expect(buildXsyUnit(createXsyValues(), { capability, provider: "openai", deps })).rejects.toThrow(/模特图/);
        const noProvider = resolveXsyCapability({ modelId: "m", provider: "" });
        await expect(buildXsyUnit(readyValues(), { capability: noProvider, provider: "", deps })).rejects.toThrow(/provider/);
    });

    test("提交输入：toolId / count / prompt / 参考图都来自真实单元", async () => {
        const { deps } = fakeCanvasDeps();
        const unit = await buildXsyUnit(readyValues(), { capability, provider: "openai", deps });
        const input = buildXsyInput(unit, { model: "doubao-image" });
        expect(input.toolId).toBe(AI_DRESSING_XSY_TOOL_ID);
        expect(input.count).toBe(1);
        expect(input.model).toBe("doubao-image");
        expect(input.references).toHaveLength(5);
        expect(input.prompt).toBe(unit.prompt);
        expect(Object.keys(input.fields ?? {})).toHaveLength(17);
    });

    test("结果判定：成功没图算失败；失败保留原因；pending 不算成功", async () => {
        const { deps } = fakeCanvasDeps();
        const unit: XsyUnit = await buildXsyUnit(readyValues(), { capability, provider: "openai", deps });
        const base = { id: "t1", toolId: AI_DRESSING_XSY_TOOL_ID, fingerprint: "f", clientOperationId: "c", capability: "image", prompt: unit.prompt, configSnapshot: {} } as unknown as ToolTask;

        const noImage = mapXsyTaskToOutcome(unit, { ...base, status: "succeeded", result: { items: [], receivedAt: 0 } } as unknown as ToolTask);
        expect(noImage.status).toBe("failed");
        expect(noImage.error?.code).toBe("empty-result");

        const withImage = mapXsyTaskToOutcome(unit, {
            ...base,
            status: "succeeded",
            result: { items: [{ id: "1", kind: "image", dataUrl: "data:image/png;base64,OUT" }], receivedAt: 0 },
        } as unknown as ToolTask);
        expect(withImage.status).toBe("succeeded");
        expect(withImage.images).toHaveLength(1);

        const failed = mapXsyTaskToOutcome(unit, { ...base, status: "failed", error: { code: "upstream", message: "上游 500", retryable: true } } as unknown as ToolTask);
        expect(failed.status).toBe("failed");
        expect(failed.error?.message).toBe("上游 500");

        const pending = mapXsyTaskToOutcome(unit, { ...base, status: "running" } as unknown as ToolTask);
        expect(pending.status).toBe("pending");
    });
});

describe("AI_DRESSING_XSY 工作区", () => {
    test("首屏可服务端渲染：两个 Tab / 步长 / 立即生成，条件不足时提交禁用", async () => {
        // i18n 初始化会读 localStorage；bun 环境没有，按真实浏览器行为补一个最小实现。
        const store = new Map<string, string>();
        (globalThis as unknown as { localStorage: Storage }).localStorage = {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => void store.set(key, value),
            removeItem: (key: string) => void store.delete(key),
            clear: () => store.clear(),
            key: (index: number) => [...store.keys()][index] ?? null,
            get length() {
                return store.size;
            },
        } as Storage;
        const [{ renderToStaticMarkup }, React, workspace] = await Promise.all([
            import("react-dom/server"),
            import("react"),
            import("@/components/tools/workspaces/dressing-xsy"),
        ]);
        const html = renderToStaticMarkup(React.createElement(workspace.AiDressingXsyWorkspace));
        expect(html).toContain("上下装衣服");
        expect(html).toContain("连体衣服");
        expect(html).toContain('data-testid="xsy-step-length"');
        expect(html).toContain("立即生成");
        expect(html).toContain('data-testid="xsy-submit"');
        expect(html).toContain('data-testid="xsy-estimate"');
        expect(html).toContain("disabled");
        expect(html).toContain("提交被拦下");
    });
});
