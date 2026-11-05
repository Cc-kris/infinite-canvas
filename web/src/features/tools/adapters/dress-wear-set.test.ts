import { describe, expect, test } from "bun:test";

import type { ToolTask } from "@/services/api/tools/task-machine";

import {
    buildDressPrompt,
    buildDressWearSetInput,
    createDressWearSetValues,
    dressSceneSelection,
    dressResultItemOf,
    dressResultPanelTask,
    dressWearSetUnits,
    estimateDressOutputs,
    groupDressTasks,
    isStaleDressTask,
    normalizeDressWearSetValues,
    parseDressSceneTag,
    resolveDressProviderProfile,
    summarizeDressTasks,
    toDressReferences,
    untaggedDressTasks,
    validateDressWearSet,
} from "./dress-wear-set";

function makeTask(partial: Partial<ToolTask> & { id: string; prompt: string }): ToolTask {
    return {
        toolId: "DRESS_WEAR_SET",
        status: "succeeded",
        clientOperationId: `op-${partial.id}`,
        fingerprint: `fp-${partial.id}`,
        capability: "image",
        configSnapshot: { capability: "image", model: "m", apiFormat: "openai", count: 1 },
        sourceAssetIds: ["asset-1"],
        createdAt: 1,
        updatedAt: 2,
        attempts: 1,
        pollCount: 0,
        transientFailures: 0,
        ...partial,
    } as ToolTask;
}

const reference = {
    id: "asset-1",
    name: "front.png",
    url: "blob:front",
    storageKey: "tool-asset:v1:asset-1",
    mimeType: "image/png",
};

describe("DRESS_WEAR_SET defaults", () => {
    test("默认勾选模特图 + 白底图，每项 4 张，A+ 默认不选", () => {
        const values = createDressWearSetValues();
        expect(values.mainScenes.modelLook).toEqual({ checked: true, count: 4 });
        expect(values.mainScenes.whiteBg).toEqual({ checked: true, count: 4 });
        expect(values.mainScenes.sizeChart.checked).toBe(false);
        expect(values.aplusScenes.aplusPro.checked).toBe(false);
        expect(values.aspectRatio).toBe("1:1");
        expect(values.resolution).toBe("2K");
        expect(values.brandMode).toBe("smart");
    });
});

describe("normalizeDressWearSetValues", () => {
    test("非对象输入回落默认值", () => {
        expect(normalizeDressWearSetValues(null)).toEqual(createDressWearSetValues());
    });

    test("数量被夹到 1–15，未知 brandMode 归到 smart，长文案被截断", () => {
        const values = normalizeDressWearSetValues({
            productInfo: "x".repeat(3000),
            brandMode: "nonsense",
            mainScenes: { modelLook: { checked: true, count: 99 }, sellPoint: { checked: true, count: 0 } },
        });
        expect(values.mainScenes.modelLook.count).toBe(15);
        expect(values.mainScenes.sellPoint.count).toBe(4);
        expect(values.brandMode).toBe("smart");
        expect(values.productInfo.length).toBe(2500);
    });

    test("缺失的场景项用默认值补齐，读回结构完整", () => {
        const values = normalizeDressWearSetValues({ mainScenes: {} });
        expect(Object.keys(values.mainScenes).sort()).toEqual(["lifestyle", "modelLook", "sellPoint", "sizeChart", "whiteBg"].sort());
        expect(Object.keys(values.aplusScenes).sort()).toEqual(["aplusCustom", "aplusPhone", "aplusPlain", "aplusPro"].sort());
    });
});

describe("resolveDressProviderProfile", () => {
    test("从 channel::model 形态里取出目录档位", () => {
        expect(resolveDressProviderProfile("default::gpt_2_5_image")?.code).toBe("GPT_2_5_IMAGE");
        expect(resolveDressProviderProfile("GPT_2_5_IMAGE")?.code).toBe("GPT_2_5_IMAGE");
    });

    test("目录外的模型不硬套枚举", () => {
        expect(resolveDressProviderProfile("default::gpt-image-2")).toBeUndefined();
    });
});

describe("validateDressWearSet", () => {
    test("没有参考图 → 阻断，并定位到 images 字段", () => {
        const issues = validateDressWearSet(createDressWearSetValues(), { referenceCount: 0 });
        expect(issues.some((issue) => issue.level === "error" && issue.field === "images")).toBe(true);
    });

    test("超过 5 张 → 阻断", () => {
        const issues = validateDressWearSet(createDressWearSetValues(), { referenceCount: 6 });
        expect(issues.some((issue) => issue.field === "images" && issue.level === "error")).toBe(true);
    });

    test("一个场景都没选 → 阻断", () => {
        const values = createDressWearSetValues();
        values.mainScenes.modelLook.checked = false;
        values.mainScenes.whiteBg.checked = false;
        const issues = validateDressWearSet(values, { referenceCount: 1 });
        expect(issues.some((issue) => issue.field === "mainScenes" && issue.level === "error")).toBe(true);
    });

    test("A+ 选了两种 → 违背单选约束", () => {
        const values = createDressWearSetValues();
        values.aplusScenes.aplusPro.checked = true;
        values.aplusScenes.aplusPhone.checked = true;
        const issues = validateDressWearSet(values, { referenceCount: 1 });
        expect(issues.some((issue) => issue.field === "aplusScenes" && issue.message.includes("单选"))).toBe(true);
    });

    test("智能品牌基因缺平台/地区/语言 → 阻断并说明缺什么", () => {
        const issues = validateDressWearSet(createDressWearSetValues(), { referenceCount: 1 });
        const issue = issues.find((item) => item.field === "platform");
        expect(issue?.level).toBe("error");
        expect(issue?.message).toContain("平台");
    });

    test("自定义品牌缺品牌名 → 阻断；填好平台后可通过", () => {
        const values = createDressWearSetValues();
        values.brandMode = "custom";
        const missingBrand = validateDressWearSet(values, { referenceCount: 1 });
        expect(missingBrand.some((issue) => issue.field === "brandName")).toBe(true);

        values.brandName = "ACME";
        expect(validateDressWearSet(values, { referenceCount: 1 })).toEqual([]);
    });

    test("目录内的模型会校验比例/分辨率/品质", () => {
        const values = createDressWearSetValues();
        values.brandMode = "custom";
        values.brandName = "ACME";
        values.provider = "GPT_2_5_IMAGE";
        values.aspectRatio = "7:3";
        const issues = validateDressWearSet(values, { referenceCount: 1 });
        expect(issues.some((issue) => issue.field === "aspectRatio" && issue.level === "error")).toBe(true);
    });

    test("目录外的模型只给提示，不阻断", () => {
        const values = createDressWearSetValues();
        values.brandMode = "custom";
        values.brandName = "ACME";
        values.provider = "default::gpt-image-2";
        const issues = validateDressWearSet(values, { referenceCount: 1 });
        expect(issues.every((issue) => issue.level === "warning")).toBe(true);
        expect(issues.some((issue) => issue.field === "provider")).toBe(true);
    });
});

describe("dressWearSetUnits / prompt", () => {
    test("选中分组各成一个请求，主副图排在 A+ 之前，prompt 带可归组标签", () => {
        const values = createDressWearSetValues();
        values.productInfo = "真丝长裙";
        values.language = "英语";
        values.mainScenes.modelLook.count = 3;
        values.aplusScenes.aplusPro.checked = true;
        values.aplusScenes.aplusPro.count = 2;

        const units = dressWearSetUnits(values);
        expect(units.map((unit) => unit.scene)).toEqual(["modelLook", "whiteBg", "aplusPro"]);
        expect(units[0].count).toBe(3);
        expect(units[0].prompt.split("\n")[0]).toBe("[DRESS_SCENE main/modelLook]");
        expect(units[2].prompt.split("\n")[0]).toBe("[DRESS_SCENE aplus/aplusPro]");
        expect(units[0].prompt).toContain("真丝长裙");
        expect(units[0].prompt).toContain("本次输出 3 张");
        expect(units[0].fields).toEqual({ group: "main", scene: "modelLook", outputNum: 3 });
    });

    test("无文字模式写进 prompt；带货语言跟随设置", () => {
        const values = createDressWearSetValues();
        values.noText = true;
        values.language = "德语";
        const prompt = buildDressPrompt(values, "sellPoint");
        expect(prompt).toContain("画面不出现任何文字");
        expect(prompt).not.toContain("文字使用德语");
    });

    test("预计产物 = 选中分组数量之和", () => {
        const values = createDressWearSetValues();
        expect(estimateDressOutputs(values)).toEqual({ groups: 2, images: 8 });
    });
});

describe("buildDressWearSetInput", () => {
    test("fields 与真实提交体对齐，count/比例/品质取自表单", () => {
        const values = createDressWearSetValues();
        values.brandMode = "custom";
        values.brandName = "ACME";
        values.provider = "GPT_2_5_IMAGE";
        const unit = dressWearSetUnits(values)[0];
        const input = buildDressWearSetInput(unit, values, toDressReferences([reference]), { model: "default::gpt-image-2" });

        expect(input.toolId).toBe("DRESS_WEAR_SET");
        expect(input.count).toBe(4);
        expect(input.size).toBe("1:1");
        expect(input.quality).toBe("medium");
        expect(input.model).toBe("default::gpt-image-2");
        expect(input.fields?.imageUrl).toBe("blob:front");
        expect(input.fields?.images).toEqual(["blob:front"]);
        expect(input.fields?.brandName).toBe("ACME");
        expect(input.fields?.needIntelligent).toBe(false);
        expect(input.fields?.platform).toBe("");
    });

    test("提交键含 brandKey/brandDNA/coverList/name（字段名即提交键，禁改名）", () => {
        const values = createDressWearSetValues();
        values.brandMode = "custom";
        values.brandName = "ACME";
        values.brandColor = "#1B1B1B";
        values.brandFont = "思源黑体";
        values.platform = "亚马逊";
        values.salesRegion = "美国";
        values.language = "英语";
        const unit = dressWearSetUnits(values)[0];
        const input = buildDressWearSetInput(unit, values, toDressReferences([reference]));

        // brandKey 与真实提交体（create_payload_product_suite.json）同构。
        expect(input.fields?.brandKey).toEqual({ platform: "亚马逊", salesRegion: "美国", language: "英语" });
        expect(input.fields?.brandDNA).toEqual({ primaryColor: "#1B1B1B", fontStyle: "思源黑体" });
        expect(input.fields?.coverList).toEqual([reference.id]);
        expect(input.fields?.name).toBe(unit.label);
        // 智能模式固定「智能品牌基因」，与原站提交体一致。
        const smart = createDressWearSetValues();
        const smartUnit = dressWearSetUnits(smart)[0];
        expect(buildDressWearSetInput(smartUnit, smart, []).fields?.brandName).toBe("智能品牌基因");
        expect(buildDressWearSetInput(smartUnit, smart, []).fields?.needIntelligent).toBe(true);
    });

    test("目录声明无品质档位的模型不下发 quality", () => {
        const values = createDressWearSetValues();
        values.provider = "GEMINI_NANO_BANANA_2_1";
        const unit = dressWearSetUnits(values)[0];
        expect(buildDressWearSetInput(unit, values, []).quality).toBeUndefined();
    });
});

describe("toDressReferences", () => {
    test("保留 storageKey 与 url，最多 5 张", () => {
        const many = Array.from({ length: 7 }, (_, index) => ({ ...reference, id: `a${index}` }));
        const references = toDressReferences(many);
        expect(references).toHaveLength(5);
        expect(references[0]).toMatchObject({ id: "a0", dataUrl: "blob:front", storageKey: "tool-asset:v1:asset-1" });
    });
});

describe("parseDressSceneTag / groupDressTasks", () => {
    test("标签可解析，非法标签返回 null", () => {
        expect(parseDressSceneTag("[DRESS_SCENE aplus/aplusPro]\n投放目标：美国")).toEqual({
            group: "aplus",
            scene: "aplusPro",
        });
        expect(parseDressSceneTag("[DRESS_SCENE foo/bar]")).toBeNull();
        expect(parseDressSceneTag("没有标签")).toBeNull();
    });

    test("按标签分组，保留顺序，并统计部分失败", () => {
        const tasks = [
            makeTask({
                id: "t1",
                prompt: "[DRESS_SCENE main/modelLook]\nx",
                result: { items: [{ id: "i0", kind: "image", dataUrl: "data:image/png;base64,AAA" }], receivedAt: 1 },
            }),
            makeTask({
                id: "t2",
                prompt: "[DRESS_SCENE main/modelLook]\nx",
                status: "failed",
            }),
            makeTask({
                id: "t3",
                prompt: "[DRESS_SCENE main/whiteBg]\nx",
                result: { items: [{ id: "i1", kind: "image", dataUrl: "data:image/png;base64,AAA" }], receivedAt: 1 },
            }),
        ];

        const groups = groupDressTasks(tasks);
        expect(groups.map((group) => group.scene)).toEqual(["modelLook", "whiteBg"]);
        expect(groups[0].status).toBe("partial");
        expect(groups[1].status).toBe("succeeded");
        expect(groups[1].images).toEqual([{ id: "i1", dataUrl: "data:image/png;base64,AAA", taskId: "t3" }]);
    });

    test("上游自报成功但没返回图片：不算成功，组状态为失败", () => {
        const tasks = [
            makeTask({ id: "ok", prompt: "[DRESS_SCENE main/modelLook]\nx", result: { items: [{ id: "i1", kind: "image", dataUrl: "data:image/png;base64,AAA" }], receivedAt: 1 } }),
            makeTask({ id: "empty", prompt: "[DRESS_SCENE main/modelLook]\nx", result: { items: [], receivedAt: 2 } }),
        ];
        const groups = groupDressTasks(tasks);
        expect(groups[0].status).toBe("partial");
        expect(groups[0].images).toHaveLength(1);
        expect(summarizeDressTasks(tasks)).toEqual({ total: 2, running: 0, succeeded: 1, failed: 1, unknown: 0, images: 1 });
    });

    test("无标签任务单独取出，不丢结果", () => {
        const tasks = [makeTask({ id: "old", prompt: "旧版本没有标签" })];
        expect(groupDressTasks(tasks)).toHaveLength(0);
        expect(untaggedDressTasks(tasks).map((task) => task.id)).toEqual(["old"]);
    });
});

describe("dressResultPanelTask 结果面板聚合视图", () => {
    test("没有任务时返回 null，不造空结果", () => {
        expect(dressResultPanelTask([])).toBeNull();
    });

    test("只聚合真实结果项：保留 storageKey/bytes 与顺序，不复制也不改写字节", () => {
        const a = makeTask({
            id: "t1",
            prompt: "[DRESS_SCENE main/modelLook]\\nx",
            createdAt: 10,
            updatedAt: 11,
            result: {
                items: [{ id: "i0", kind: "image", bytes: 1883817, storageKey: "tool-result:UJkgjc6BIYFLDnO12F3G-" }],
                receivedAt: 11,
            },
        });
        const b = makeTask({
            id: "t2",
            prompt: "[DRESS_SCENE main/whiteBg]\\nx",
            createdAt: 20,
            updatedAt: 21,
            result: { items: [{ id: "i1", kind: "image", bytes: 2516552, storageKey: "tool-result:abc-" }], receivedAt: 21 },
        });
        const panel = dressResultPanelTask([b, a]);
        expect(panel).not.toBeNull();
        expect(panel!.status).toBe("succeeded");
        expect(panel!.result?.items.map((item) => item.storageKey)).toEqual([
            "tool-result:UJkgjc6BIYFLDnO12F3G-",
            "tool-result:abc-",
        ]);
        expect(panel!.result?.items.map((item) => item.bytes)).toEqual([1883817, 2516552]);
        // 引用同一批结果项（视图聚合，不是新结果）
        expect(panel!.result?.items[0]).toBe(a.result!.items[0]);
        expect(panel!.result?.receivedAt).toBe(21);
    });

    test("有运行中任务时面板状态跟随 running，仍展示已完成的真实结果项", () => {
        const done = makeTask({
            id: "t1",
            prompt: "[DRESS_SCENE main/modelLook]\\nx",
            result: { items: [{ id: "i0", kind: "image", dataUrl: "data:image/png;base64,AAA" }], receivedAt: 1 },
        });
        const running = makeTask({ id: "t2", prompt: "[DRESS_SCENE main/whiteBg]\\nx", status: "running", createdAt: 5 });
        const panel = dressResultPanelTask([done, running]);
        expect(panel!.status).toBe("running");
        expect(panel!.result?.items).toHaveLength(1);
    });
});

describe("summarizeDressTasks / stale", () => {
    test("汇总运行中/成功/失败/未知与产物数", () => {
        const tasks = [
            makeTask({ id: "a", prompt: "p", status: "running" }),
            makeTask({
                id: "b",
                prompt: "p",
                status: "succeeded",
                result: { items: [{ id: "i", kind: "image", dataUrl: "data:image/png;base64,AAA" }], receivedAt: 1 },
            }),
            makeTask({ id: "c", prompt: "p", status: "unknown" }),
            makeTask({ id: "d", prompt: "p", status: "failed" }),
        ];
        expect(summarizeDressTasks(tasks)).toEqual({ total: 4, running: 1, succeeded: 1, failed: 1, unknown: 1, images: 1 });
    });

    test("旧 revision 的任务判为过期", () => {
        const task = makeTask({ id: "a", prompt: "p", draftRevision: 1 });
        expect(isStaleDressTask(task, 2)).toBe(true);
        expect(isStaleDressTask(task, 1)).toBe(false);
        expect(isStaleDressTask(makeTask({ id: "b", prompt: "p" }), 5)).toBe(false);
    });
});

describe("场景选择读取", () => {
    test("未定义的场景回落到未勾选", () => {
        const values = createDressWearSetValues();
        expect(dressSceneSelection(values, "sizeChart")).toEqual({ checked: false, count: 4 });
    });
});

describe("dressResultItemOf（结果卡三动作的载荷）", () => {
    test("默认按 image/png 组装，字段与 ToolTaskResultItem 对齐", () => {
        const item = dressResultItemOf({ id: "task-abc12345", dataUrl: "data:image/png;base64,AAA" });
        expect(item).toEqual({
            id: "task-abc12345",
            kind: "image",
            dataUrl: "data:image/png;base64,AAA",
            mimeType: "image/png",
        });
    });

    test("保留上游给出的 mimeType，不透传任务 id 之外的字段", () => {
        const item = dressResultItemOf({ id: "task-x", dataUrl: "data:image/webp;base64,BBB", mimeType: "image/webp", taskId: "task-x" } as never);
        expect(item.mimeType).toBe("image/webp");
        expect(Object.keys(item).sort()).toEqual(["dataUrl", "id", "kind", "mimeType"]);
    });
});
