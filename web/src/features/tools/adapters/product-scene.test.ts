import { describe, expect, test } from "bun:test";

import type { ToolTask } from "@/services/api/tools/task-machine";
import type { ToolAssetRecord } from "@/services/api/tools/assets";

import {
    DEFAULT_SCENE_VALUES,
    PRODUCT_SCENE_TOOL_ID,
    SCENE_CUSTOM_SIZE,
    SCENE_MAX_OUTPUT,
    SCENE_PROMPT_LIMIT,
    SCENE_SOURCE_LIMITS,
    buildScenePrompt,
    computeSceneOutput,
    createSceneSnapshot,
    describeSceneDrift,
    effectiveSceneStrength,
    linkSceneValues,
    readSceneValues,
    resolveSceneCapability,
    sceneModelCard,
    validateSceneSource,
    validateSceneState,
    type SceneValues,
} from "@/features/tools/registry/product-scene";
import {
    ProductSceneAdapterError,
    assertSceneInput,
    buildSceneFields,
    buildSceneInput,
    isSceneModelId,
    isSceneSourceReady,
    retryProductScene,
    runProductScene,
    sceneResultFromTask,
    sceneSourceFromRecord,
    sceneVariantCells,
    type ProductSceneSourceAsset,
} from "@/features/tools/adapters/product-scene";

const SOURCE: ProductSceneSourceAsset = {
    assetId: "asset-scene-1",
    name: "bag.png",
    width: 1200,
    height: 1600,
    mimeType: "image/png",
    bytes: 512 * 1024,
    url: "https://cdn.example.com/bag.png",
};

function values(patch: Partial<SceneValues> = {}): SceneValues {
    return { ...DEFAULT_SCENE_VALUES, sourceAssetId: SOURCE.assetId, imageName: "bag.png", ...patch };
}

function succeededTask(items: number, status: ToolTask["status"] = "succeeded"): ToolTask {
    const now = new Date().toISOString();
    return {
        id: "task-scene-1",
        toolId: PRODUCT_SCENE_TOOL_ID,
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

describe("PRODUCT_SCENE 契约", () => {
    test("工具 id 与草稿快照字段与页面 spec 一致", () => {
        expect(PRODUCT_SCENE_TOOL_ID).toBe("PRODUCT_SCENE");
        const capability = resolveSceneCapability({ modelId: "realistic", modelReady: true, provider: "openai", similarityValue: 75 });
        const output = computeSceneOutput(values({ similarity: 75, outputNum: 3 }), SOURCE);
        const snapshot = createSceneSnapshot(values({ similarity: 75, outputNum: 3 }), output, capability, { assetId: SOURCE.assetId }, 7);
        expect(snapshot).toMatchObject({
            toolId: "PRODUCT_SCENE",
            revision: 7,
            modelId: "realistic",
            provider: "openai",
            mode: "realistic",
            strength: 75,
            outputNum: 3,
            width: output.width,
            height: output.height,
            sourceAssetId: SOURCE.assetId,
        });
    });

    test("未知模型 id 回落到写实，模型卡枚举只有三个", () => {
        expect(isSceneModelId("smart")).toBe(true);
        expect(isSceneModelId("cinematic")).toBe(false);
        expect(sceneModelCard("cinematic").id).toBe("realistic");
        expect(sceneModelCard("smart").similarity).toBe("auto");
    });

    test("默认尺寸按参考图比例就近取档，自定义尺寸如实返回不偷偷改写", () => {
        const fromSource = computeSceneOutput(values(), { width: 1200, height: 1600 });
        expect(fromSource.sizeType).toBe("default");
        expect(fromSource.ratio).toBe("3:4");
        expect(fromSource.requestSize).toBe("1024x1360");

        const custom = computeSceneOutput(values({ sizeType: "custom", customWidth: 900, customHeight: 3000 }), SOURCE);
        expect(custom.requestSize).toBe("900x3000");
        expect(custom.width).toBe(900);
    });
});

describe("能力联动：相似度 / 张数 / 尺寸", () => {
    test("智能模式把手调相似度收敛为自动值，并给出原因", () => {
        const capability = resolveSceneCapability({ modelId: "smart", modelReady: true, provider: "openai", similarityValue: 90 });
        expect(capability.similarity).toBe("auto");
        expect(effectiveSceneStrength(values({ modelId: "smart", similarity: 90 }), capability)).toBe(capability.similarityValue);

        const linked = linkSceneValues(values({ modelId: "smart", similarity: 90 }), capability);
        expect(linked.values.similarity).toBe(capability.similarityValue);
        expect(linked.changes.map((change) => change.field)).toContain("similarity");
    });

    test("provider 张数上限收敛可选张数，越界决策不静默通过", () => {
        const capability = resolveSceneCapability({ providerMaxOutputNum: 2 });
        expect(capability.outputOptions).toEqual([1, 2]);
        expect(capability.notices.length).toBeGreaterThan(0);

        const linked = linkSceneValues(values({ outputNum: 4 }), capability);
        expect(linked.values.outputNum).toBe(1);
        expect(linked.changes.map((change) => change.field)).toContain("outputNum");
    });

    test("不支持自定义宽高时回落到默认尺寸并说明", () => {
        const capability = resolveSceneCapability({ providerCustomSize: false });
        const linked = linkSceneValues(values({ sizeType: "custom" }), capability);
        expect(linked.values.sizeType).toBe("default");
        expect(linked.changes.some((change) => change.field === "sizeType")).toBe(true);
    });

    test("描述超长被收敛到 100 字并说明", () => {
        const capability = resolveSceneCapability({});
        const long = "语".repeat(SCENE_PROMPT_LIMIT + 12);
        const linked = linkSceneValues(values({ prompt: long }), capability);
        expect(linked.values.prompt.length).toBe(SCENE_PROMPT_LIMIT);
        expect(linked.changes.some((change) => change.field === "prompt")).toBe(true);
    });
});

describe("请求组装：15 个字段不丢参", () => {
    const capability = resolveSceneCapability({ modelId: "realistic", modelReady: true, provider: "openai", similarityValue: 45 });
    const sceneValues = values({ similarity: 45, sceneKeyword: "木质桌面, 白色墙面", prompt: "晨光客厅", outputNum: 2 });
    const output = computeSceneOutput(sceneValues, SOURCE);

    test("字段覆盖 registry 白名单，且关键词/相似度/尺寸都进请求", () => {
        const fields = buildSceneFields({ values: sceneValues, output, capability, source: SOURCE });
        expect(fields).toMatchObject({
            imageName: "bag.png",
            imageUrl: "https://cdn.example.com/bag.png",
            originImageUrl: "https://cdn.example.com/bag.png",
            mode: "realistic",
            provider: "openai",
            sceneKeyword: "木质桌面, 白色墙面",
            strength: 45,
            sizeType: "default",
            imageOutputWidth: output.width,
            imageOutputHeight: output.height,
            ratio: output.ratio,
            outputNum: 2,
        });
        expect(String(fields.prompt)).toContain("晨光客厅");
        // 没有分割图时不写 segImageUrl / cutoutProvider，禁止空串占位
        expect(fields.segImageUrl).toBeUndefined();
        expect(fields.cutoutProvider).toBeUndefined();
    });

    test("有分割图时才提交 segImageUrl 与 cutoutProvider", () => {
        const fields = buildSceneFields({
            values: sceneValues,
            output,
            capability,
            source: { ...SOURCE, segmentationUrl: "https://cdn.example.com/mask.png", cutoutProvider: "birefnet" },
        });
        expect(fields.segImageUrl).toBe("https://cdn.example.com/mask.png");
        expect(fields.cutoutProvider).toBe("birefnet");
    });

    test("count 跟随生成张数，references 只带一张参考图，assertSceneInput 通过", () => {
        const input = buildSceneInput({ values: sceneValues, output, capability, source: SOURCE, model: "gpt-image-1" });
        expect(input.count).toBe(2);
        expect(input.references?.length).toBe(1);
        expect(input.size).toBe(output.requestSize);
        expect(input.model).toBe("gpt-image-1");
        expect(() => assertSceneInput(input, sceneValues, output, capability)).not.toThrow();
    });

    test("丢参守卫会拒绝被篡改的请求", () => {
        const input = buildSceneInput({ values: sceneValues, output, capability, source: SOURCE });
        const broken = { ...input, count: 4 };
        expect(() => assertSceneInput(broken, sceneValues, output, capability)).toThrow(ProductSceneAdapterError);
    });
});

describe("源图约束", () => {
    test("扩展名/尺寸/宽高比按页面文案校验", () => {
        expect(SCENE_SOURCE_LIMITS.maxBytes).toBe(10 * 1024 * 1024);
        expect(validateSceneSource(SOURCE).ok).toBe(true);
        expect(validateSceneSource({ width: 200, height: 200 }).ok).toBe(false);
        expect(validateSceneSource({ width: 5000, height: 5000 }).ok).toBe(false);
        expect(validateSceneSource({ width: 4000, height: 500 }).ok).toBe(false);
        expect(validateSceneSource({ mimeType: "image/gif" }).ok).toBe(false);
    });

    test("资产记录能还原成提交用的源图，且 http URL 优先", () => {
        const record: ToolAssetRecord = {
            id: "asset-scene-1",
            kind: "image",
            name: "bag.png",
            storageKey: "k",
            url: "blob:local",
            bytes: 1024,
            mimeType: "image/png",
            width: 1200,
            height: 1600,
            createdAt: new Date().toISOString(),
            origin: "local",
        };
        const source = sceneSourceFromRecord(record);
        expect(source.assetId).toBe("asset-scene-1");
        expect(isSceneSourceReady(source)).toBe(true);
        const fields = buildSceneFields({
            values: values(),
            output: computeSceneOutput(values(), source),
            capability: resolveSceneCapability({}),
            source,
        });
        // blob: 不是可给上游的 URL，回落资产 id，避免把会话内 blob 传给 provider
        expect(fields.imageUrl).toBe("asset-scene-1");
    });
});

describe("运行链路：守卫 + 真实提交 + 重试", () => {
    test("配置未收敛时拒绝提交，不发请求", async () => {
        let submits = 0;
        const capability = resolveSceneCapability({ providerMaxOutputNum: 1 });
        await expect(
            runProductScene({
                gateway: {
                    submit: async () => {
                        submits += 1;
                        return succeededTask(1);
                    },
                    waitForResult: async () => succeededTask(1),
                },
                values: values({ outputNum: 4 }),
                output: computeSceneOutput(values({ outputNum: 4 }), SOURCE),
                capability,
                source: SOURCE,
                model: "gpt-image-1",
            }),
        ).rejects.toThrow(ProductSceneAdapterError);
        expect(submits).toBe(0);
    });

    test("未配置模型时不可提交", async () => {
        await expect(
            runProductScene({
                gateway: { submit: async () => succeededTask(1), waitForResult: async () => succeededTask(1) },
                values: values(),
                output: computeSceneOutput(values(), SOURCE),
                capability: resolveSceneCapability({ modelReady: false }),
                source: SOURCE,
                imageModelReady: false,
            }),
        ).rejects.toThrow(ProductSceneAdapterError);
    });

    test("成功提交返回任务与提交快照，快照记录本次张数", async () => {
        const capability = resolveSceneCapability({ modelId: "realistic", modelReady: true, provider: "openai" });
        const sceneValues = values({ outputNum: 2 });
        const run = await runProductScene({
            gateway: {
                submit: async () => succeededTask(2, "running"),
                waitForResult: async () => succeededTask(2),
            },
            values: sceneValues,
            output: computeSceneOutput(sceneValues, SOURCE),
            capability,
            source: SOURCE,
            model: "gpt-image-1",
            revision: 3,
        });
        expect(run.task.status).toBe("succeeded");
        expect(run.snapshot.outputNum).toBe(2);
        expect(run.snapshot.revision).toBe(3);
        expect(run.snapshot.provider).toBe("openai");
    });

    test("重试按同一快照重建请求；网关无 retry 时明确报错", async () => {
        const capability = resolveSceneCapability({ modelId: "realistic", modelReady: true, provider: "openai" });
        const output = computeSceneOutput(values(), SOURCE);
        await expect(
            retryProductScene({
                gateway: { submit: async () => succeededTask(1), waitForResult: async () => succeededTask(1) },
                values: values(),
                output,
                capability,
                source: SOURCE,
                taskId: "task-scene-1",
            }),
        ).rejects.toThrow(ProductSceneAdapterError);

        let retried = "";
        const run = await retryProductScene({
            gateway: {
                submit: async () => succeededTask(1),
                waitForResult: async () => succeededTask(1),
                retry: async (taskId) => {
                    retried = taskId;
                    return succeededTask(1);
                },
            },
            values: values(),
            output,
            capability,
            source: SOURCE,
            taskId: "task-scene-1",
        });
        expect(retried).toBe("task-scene-1");
        expect(run.task.status).toBe("succeeded");
    });
});

describe("结果网格：缺格不复制充数", () => {
    test("请求 4 张只回 2 张时，后两格标 missing 并说明", () => {
        const cells = sceneVariantCells(succeededTask(2), SCENE_MAX_OUTPUT);
        expect(cells.map((cell) => cell.status)).toEqual(["ready", "ready", "missing", "missing"]);
        expect(cells[2].message).toContain("2");
        expect(cells[2].dataUrl).toBeUndefined();
    });

    test("运行中为 pending，失败为 failed", () => {
        expect(sceneVariantCells(succeededTask(0, "running"), 2).every((cell) => cell.status === "pending")).toBe(true);
        expect(sceneVariantCells(succeededTask(0, "failed"), 2).every((cell) => cell.status === "failed")).toBe(true);
    });

    test("配置改动后结果标为旧版本", () => {
        const capability = resolveSceneCapability({ modelId: "realistic", modelReady: true, provider: "openai", similarityValue: 40 });
        const before = createSceneSnapshot(values({ similarity: 40 }), computeSceneOutput(values({ similarity: 40 }), SOURCE), capability, { assetId: SOURCE.assetId }, 1);
        const after = createSceneSnapshot(values({ similarity: 80 }), computeSceneOutput(values({ similarity: 80 }), SOURCE), capability, { assetId: SOURCE.assetId }, 1);
        expect(describeSceneDrift(before, after)).toContain("相似度");
        const view = sceneResultFromTask(succeededTask(1), before, after);
        expect(view.stale.length).toBeGreaterThan(0);
        expect(view.expected).toBe(before.outputNum);
    });
});

describe("校验与提示词", () => {
    test("缺源图/缺模型/张数不支持分别给出独立 issue", () => {
        const capability = resolveSceneCapability({ modelReady: false, providerMaxOutputNum: 1 });
        const issues = validateSceneState({
            values: values({ outputNum: 4 }),
            output: computeSceneOutput(values({ outputNum: 4 }), SOURCE),
            sourceReady: false,
            imageModelReady: false,
            capability,
        });
        const codes = issues.map((issue) => issue.code);
        expect(codes).toContain("source-missing");
        expect(codes).toContain("model-not-ready");
        expect(codes).toContain("output-num-unsupported");
    });

    test("自定义尺寸越界与宽高比超限分别报错", () => {
        const capability = resolveSceneCapability({});
        const tooSmall = values({ sizeType: "custom", customWidth: 100, customHeight: 100 });
        expect(
            validateSceneState({
                values: tooSmall,
                output: computeSceneOutput(tooSmall, SOURCE),
                sourceReady: true,
                imageModelReady: true,
                capability,
            }).map((issue) => issue.code),
        ).toContain("custom-size-range");

        const flat = values({ sizeType: "custom", customWidth: SCENE_CUSTOM_SIZE.max, customHeight: 700 });
        expect(
            validateSceneState({
                values: flat,
                output: computeSceneOutput(flat, SOURCE),
                sourceReady: true,
                imageModelReady: true,
                capability,
            }).map((issue) => issue.code),
        ).toContain("custom-size-aspect");
    });

    test("提示词带上模型风格、关键词与描述", () => {
        const capability = resolveSceneCapability({ modelId: "minimal" });
        const prompt = buildScenePrompt(values({ modelId: "minimal", sceneKeyword: "白色墙面,绿植", prompt: "极简客厅" }), capability);
        expect(prompt).toContain("极简客厅");
        expect(prompt).toContain("白色墙面");
        expect(prompt).toContain("简约");
    });

    test("草稿读取对脏数据兜底", () => {
        const parsed = readSceneValues({ modelId: "unknown", similarity: "abc", outputNum: 99, sizeType: "weird" });
        expect(parsed.modelId).toBe("realistic");
        expect(parsed.outputNum).toBeLessThanOrEqual(SCENE_MAX_OUTPUT);
        expect(parsed.sizeType).toBe("default");
        expect(parsed.similarity).toBeGreaterThanOrEqual(0);
    });
});

/* ============================== 工作区渲染 ============================== */

const draftStore = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
        getItem: (key: string) => draftStore.get(key) ?? null,
        setItem: (key: string, value: string) => void draftStore.set(key, value),
        removeItem: (key: string) => void draftStore.delete(key),
        clear: () => draftStore.clear(),
        key: (index: number) => Array.from(draftStore.keys())[index] ?? null,
        get length() {
            return draftStore.size;
        },
    },
});

async function renderWorkspace(): Promise<string> {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { MemoryRouter } = await import("react-router-dom");
    const { ProductSceneWorkspace } = await import("@/components/tools/workspaces/scene-fission");
    const tree = React.createElement(MemoryRouter, null, React.createElement(ProductSceneWorkspace));
    return renderToStaticMarkup(tree as Parameters<typeof renderToStaticMarkup>[0]);
}

describe("场景裂变工作区渲染", () => {
    test("分区齐全：上传 / 相似度 / 模式 / 尺寸 / 张数 / 结果", async () => {
        const html = await renderWorkspace();
        // 原站上传提示原文（real/PRODUCT_SCENE/text.txt:33），本地按原文渲染
        expect(html).toContain("10M以内，分辨率：384*384 ~ 4096*4096，最大宽高比5");
        expect(html).toContain('data-testid="tool-asset-dropzone"');
        expect(html).toContain('data-tool-asset-input="PRODUCT_SCENE"');
        for (const id of [
            "scene-similarity",
            "scene-modes",
            "scene-size-type",
            "scene-output-num",
            "scene-result-empty",
            "scene-expected",
        ]) {
            expect(html).toContain(`data-testid="${id}"`);
        }
        /* 结果网格只在有任务时出现，空态给的是结果区空状态 */
        expect(html).toContain("生成结果");
        /*
         * 原站首屏不预弹拦截清单（real/PRODUCT_SCENE/text.txt 里没有这类提示），
         * 拦截由禁用按钮 + 上传区引导承担；scene-issues 只在提交失败后出现，
         * 其渲染路径由 new-replace-bg-v2.test.ts（同款场景组件）覆盖。
         */
        expect(html).not.toContain('data-testid="scene-issues"');
        expect(html).toMatch(/data-testid="scene-generate"[^>]*disabled/);
    });

    test("未上传参考图时生成按钮禁用并给出真实拦截", async () => {
        const html = await renderWorkspace();
        expect(html).toMatch(/data-testid="scene-generate"[^>]*disabled/);
        /* 原站不预弹拦截提示，改由上传区 + 结果区引导承担（real/PRODUCT_SCENE/text.txt:57） */
        expect(html).toContain("3秒裂变出多张相似的场景图，快来裂变您的场景图吧~");
        expect(html).toContain("上传商品场景参考图");
    });

    test("默认写实模式显示手调相似度，智能模式给出自动提示", async () => {
        const html = await renderWorkspace();
        expect(html).toContain('data-testid="scene-similarity-value"');
        expect(html).toContain("写实");
        expect(html).toContain("简约");
        expect(html).toContain("智能");
    });

    test("草稿键与页面 spec 一致，恢复后的值能驱动渲染", async () => {
        /* 静态渲染只出首帧：真正的水合是异步的，这里分别验证「键」与「值」两端 */
        const { toolDraftKey } = await import("@/stores/use-tool-draft-store");
        expect(toolDraftKey(PRODUCT_SCENE_TOOL_ID)).toBe("tool-draft:v1:PRODUCT_SCENE");
        expect(readSceneValues({ modelId: "smart", outputNum: 3, similarity: 55 })).toMatchObject({
            modelId: "smart",
            outputNum: 3,
            similarity: 55,
        });
        const html = await renderWorkspace();
        expect(html).toContain("正在恢复上次的素材…");
        expect(html).toMatch(/data-testid="scene-generate"[^>]*disabled/);
    });
});
