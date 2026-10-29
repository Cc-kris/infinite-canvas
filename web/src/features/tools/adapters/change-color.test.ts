// 仓库未装 bun 类型包：动态导入避免 tsc --noEmit 报 TS2307（与 enhance.test.tsx 一致）。
const { describe, expect, test } = (await import("bun:test" as string)) as {
    describe: (name: string, fn: () => void) => void;
    expect: (actual: unknown) => {
        toBe: (expected: unknown) => void;
        toEqual: (expected: unknown) => void;
        toContain: (expected: string) => void;
        toBeUndefined: () => void;
        toBeGreaterThan: (value: number) => void;
        not: { toContain: (expected: string) => void; toBe: (expected: unknown) => void };
    };
    test: (name: string, fn: () => void | Promise<void>) => void;
};

import {
    CHANGE_COLOR_FIELDS,
    DEFAULT_CHANGE_COLOR_VALUES,
    createChangeColorSnapshot,
    isChangeColorSnapshotStale,
    isChangeColorSourceReady,
    readChangeColorValues,
    snapshotFieldSummary,
    validateChangeColorState,
    validateChangeColorSource,
    type ChangeColorValues,
} from "@/features/tools/registry/change-color";
import {
    ChangeColorAdapterError,
    assertChangeColorInput,
    buildChangeColorInput,
    buildChangeColorPrompt,
    changeColorResultFromTask,
    isChangeColorSourceUsable,
    runChangeColor,
    type ChangeColorGatewayLike,
    type ChangeColorSourceAsset,
} from "@/features/tools/adapters/change-color";

/* ------------------------------- 夹具 ------------------------------- */

const source: ChangeColorSourceAsset = {
    assetId: "asset-shirt",
    name: "shirt.png",
    mimeType: "image/png",
    bytes: 240_000,
    width: 1200,
    height: 1600,
    dataUrl: "data:image/png;base64,SOURCE",
};

const maskUrl = "data:image/png;base64,MASK";
const referenceUrl = "blob:reference-1";

const values = (patch: Partial<ChangeColorValues> = {}): ChangeColorValues => ({
    ...DEFAULT_CHANGE_COLOR_VALUES,
    targetColor: "#B3261E",
    taskName: "红色卫衣",
    imageName: "shirt.png",
    sourceAssetId: source.assetId,
    ...patch,
});

/* ------------------------------ 字段 ------------------------------ */

describe("CHANGE_COLOR 字段映射", () => {
    test("16 个字段全部由页面状态产出，且与 tool_specs 的字段名逐一对应", () => {
        const input = buildChangeColorInput({ values: values(), source, maskUrl, referenceUrl, model: "image-x" });
        const fields = input.fields ?? {};
        // 少一个字段就是丢参，因此这里按 CHANGE_COLOR_FIELDS 全量比对，不做抽样。
        expect(Object.keys(fields).sort()).toEqual([...CHANGE_COLOR_FIELDS].sort());
        expect(fields.imageUrl).toBe(source.dataUrl);
        expect(fields.sourceImageUrl).toBe(source.dataUrl);
        expect(fields.imageMaskUrl).toBe(maskUrl);
        expect(fields.imageWidth).toBe(1200);
        expect(fields.imageHeight).toBe(1600);
        expect(fields.imageFormat).toBe("png");
        expect(fields.imageSize).toBe(240_000);
        expect(fields.colorParams).toBe("#B3261EFF");
        expect(fields.images).toEqual([referenceUrl]);
        expect(fields.name).toBe("红色卫衣");
        expect(fields.adjustLight).toBe("on:50");
        expect(fields.doInpaint).toBe(false);
    });

    test("区域写进 imageTagData 与提示词；coverList 属 asset-list 且本页无套图，如实为空数组", () => {
        const custom = buildChangeColorInput({
            values: values({ region: "custom", customRegion: "外套的翻领" }),
            source,
            maskUrl,
        });
        expect((custom.fields?.imageTagData as { regionText: string }).regionText).toBe("外套的翻领");
        expect((custom.fields?.imageTagData as { region: string }).region).toBe("custom");
        // 结构照常进快照（不是字段缺失），内容为空因为本页没有套图封面
        expect(custom.fields?.coverList).toEqual([]);
        expect(buildChangeColorPrompt(values({ region: "custom", customRegion: "外套的翻领" }), source)).toContain("外套的翻领");

        const issues = validateChangeColorState({
            values: values({ region: "custom", customRegion: "  " }),
            sourceReady: true,
            imageModelReady: true,
            maskReady: true,
        });
        expect(issues.map((issue) => issue.code)).toContain("region-required");
    });

    test("提示词携带目标色/区域/去杂色/细调/光影选项，不只是模板空话", () => {
        const prompt = buildChangeColorPrompt(
            values({
                adjustment: { hue: 12, saturation: -20, brightness: 5, contrast: 8 },
                light: { enabled: true, strength: 70, edge: true, edgeRepair: true, balance: -15, curve: "soft" },
                doInpaint: true,
                removeNoise: true,
            }),
            source,
        );
        for (const text of ["#B3261E", "rgb(179, 38, 30)", "人物身上的衣服", "局部重绘已开启", "去除杂色", "色调 +12°", "饱和度 -20", "光影优化强度 70/100", "边缘优化开启", "颜色边缘修复开启", "色彩平衡 -15", "曲线"]) {
            expect(prompt).toContain(text);
        }
        expect(prompt).toContain("输出：与原图同尺寸、同构图的单张图片。");
    });
});

/* ------------------------------ 防丢参 ------------------------------ */

describe("CHANGE_COLOR 提交防丢参", () => {
    test("组装好的请求能通过自检", () => {
        const input = buildChangeColorInput({ values: values(), source, maskUrl, referenceUrl, model: "image-x" });
        expect(() => assertChangeColorInput(input, values(), source)).not.toBe(undefined as unknown as () => void);
    });

    test("字段被篡改/清空时自检直接抛错，不会把坏请求发出去", () => {
        const tampered = buildChangeColorInput({ values: values(), source, maskUrl });
        tampered.fields = { ...tampered.fields, colorParams: "#000000FF" };
        let caught: unknown;
        try {
            assertChangeColorInput(tampered, values(), source);
        } catch (error) {
            caught = error;
        }
        expect(caught instanceof ChangeColorAdapterError).toBe(true);
    });

    test("局部重绘没有蒙版时拒绝提交", () => {
        const issues = validateChangeColorState({
            values: values({ doInpaint: true }),
            sourceReady: true,
            imageModelReady: true,
            maskReady: false,
        });
        expect(issues.map((issue) => issue.code)).toContain("mask-required");
    });

    test("没选颜色 / 没配模型 / 没传图都会给出就地阻塞原因", () => {
        const codes = validateChangeColorState({
            values: values({ targetColor: "" }),
            sourceReady: false,
            imageModelReady: false,
            maskReady: false,
        }).map((issue) => issue.code);
        for (const code of ["source-required", "image-model-required", "color-required"]) expect(codes).toContain(code);
    });

    test("源图格式/大小/边长不合规时说明具体原因", () => {
        expect(validateChangeColorSource({ ...source, mimeType: "image/gif" }).ok).toBe(false);
        expect(validateChangeColorSource({ ...source, bytes: 11 * 1024 * 1024 }).ok).toBe(false);
        expect(validateChangeColorSource({ ...source, width: 9000 }).ok).toBe(false);
        expect(validateChangeColorSource(source).ok).toBe(true);
    });
});

/* ------------------------------ 快照 ------------------------------ */

describe("CHANGE_COLOR 快照与结果归属", () => {
    test("同一份配置指纹稳定，改颜色/区域后指纹变化", () => {
        const a = createChangeColorSnapshot(values(), { source, maskUrl, referenceUrl }, 3);
        const b = createChangeColorSnapshot(values(), { source, maskUrl, referenceUrl }, 3);
        const c = createChangeColorSnapshot(values({ targetColor: "#2E7D32" }), { source, maskUrl, referenceUrl }, 3);
        expect(a.fingerprint).toBe(b.fingerprint);
        expect(a.fingerprint === c.fingerprint).toBe(false);
        expect(isChangeColorSnapshotStale(a, b)).toBe(false);
        expect(isChangeColorSnapshotStale(a, c)).toBe(true);
    });

    test("字段摘要能让人核对本次提交的关键参数", () => {
        const summary = snapshotFieldSummary(createChangeColorSnapshot(values(), { source, maskUrl }, null).fields);
        expect(summary).toContain("#B3261E");
        expect(summary).toContain("1200×1600");
        expect(summary).toContain("蒙版有");
    });

    test("旧任务结果如实标记 stale，不冒充当前配置的结果", () => {
        const submitted = createChangeColorSnapshot(values(), { source, maskUrl }, 1);
        const changed = createChangeColorSnapshot(values({ removeNoise: true }), { source, maskUrl }, 1);
        const task = {
            id: "t1",
            status: "succeeded" as const,
            result: { items: [{ id: "i1", kind: "image" as const, dataUrl: "data:image/png;base64,RESULT" }] },
        };
        const view = changeColorResultFromTask(task as never, submitted, changed);
        expect(view.image).toBe("data:image/png;base64,RESULT");
        expect(view.stale).toBe(true);
        expect(changeColorResultFromTask(undefined, submitted, changed).status).toBe("idle");
    });
});

/* ---------------------- 默认值对齐原站（实测） ---------------------- */

describe("CHANGE_COLOR 默认值对齐原站", () => {
    // 依据：evidence/real-acceptance/CHANGE_COLOR/default-values.json
    // 原站 www.linkfox.com/draw/change-color 实测：去除杂色 aria-checked=false、颜色边缘修复 aria-checked=true。
    test("去除杂色默认关闭、颜色边缘修复默认开启", () => {
        expect(DEFAULT_CHANGE_COLOR_VALUES.removeNoise).toBe(false);
        expect(DEFAULT_CHANGE_COLOR_VALUES.light.edgeRepair).toBe(true);
        expect(DEFAULT_CHANGE_COLOR_VALUES.light.enabled).toBe(true);
        expect(DEFAULT_CHANGE_COLOR_VALUES.light.curve).toBe("linear");
        expect(DEFAULT_CHANGE_COLOR_VALUES.adjustment).toEqual({ hue: 0, saturation: 0, brightness: 0, contrast: 0 });
    });

    test("缺字段的旧草稿回退到同一套默认值", () => {
        const restored = readChangeColorValues({ targetColor: "" });
        expect(restored.removeNoise).toBe(false);
        expect(restored.light.edgeRepair).toBe(true);
    });
});

/* ------------------------------ 草稿 ------------------------------ */

describe("CHANGE_COLOR 草稿", () => {
    test("恢复时保留配置，丢掉未知键，蒙版本体不进草稿只留 hasMask", () => {
        const restored = readChangeColorValues({
            ...values({ hasMask: true }),
            imageMaskUrl: "data:image/png;base64,SHOULD_NOT_PERSIST",
            bogus: 1,
        });
        expect(restored.targetColor).toBe("#B3261E");
        expect(restored.hasMask).toBe(true);
        expect(restored.region).toBe("clothing");
        expect(JSON.stringify(restored)).not.toContain("SHOULD_NOT_PERSIST");
        expect("bogus" in restored).toBe(false);
    });

    test("非法颜色/越界滑杆/未知区域回到安全默认值", () => {
        const restored = readChangeColorValues({
            targetColor: "red",
            region: "nope",
            adjustment: { hue: 999, saturation: "x", brightness: -400, contrast: 12 },
            light: { enabled: "yes", strength: 900, curve: "wild" },
        });
        expect(restored.targetColor).toBe("");
        expect(restored.region).toBe("clothing");
        expect(restored.adjustment.hue).toBe(180);
        expect(restored.adjustment.brightness).toBe(-100);
        expect(restored.adjustment.contrast).toBe(12);
        expect(restored.light.strength).toBe(100);
        // 布尔按 `!== false` 收口：只有明确 false 才关闭，草稿里的脏值不会把开关关掉
        expect(restored.light.enabled).toBe(true);
        expect(readChangeColorValues({ light: { enabled: false } }).light.enabled).toBe(false);
        expect(restored.light.curve).toBe("linear");
    });
});

/* ------------------------------ 执行链路 ------------------------------ */

describe("CHANGE_COLOR 执行链路", () => {
    function gatewayStub(): { gateway: ChangeColorGatewayLike; submitted: { input?: unknown; count: number } } {
        const submitted: { input?: unknown; count: number } = { count: 0 };
        const gateway: ChangeColorGatewayLike = {
            submit: async (input) => {
                submitted.count += 1;
                submitted.input = input;
                return { id: "task-1", status: "succeeded", result: { items: [{ id: "i1", kind: "image", dataUrl: "data:image/png;base64,RESULT" }] } } as never;
            },
            waitForResult: async () => {
                throw new Error("任务已终态，不应再轮询");
            },
        };
        return { gateway, submitted };
    }

    test("提交一次即终态时不再轮询，并把快照一起带回来", async () => {
        const { gateway, submitted } = gatewayStub();
        const run = await runChangeColor({ gateway, values: values(), source, maskUrl, referenceUrl, model: "image-x" });
        expect(submitted.count).toBe(1);
        expect(run.task.status).toBe("succeeded");
        expect(run.snapshot.fields.colorParams).toBe("#B3261EFF");
    });

    test("配置不合法时在本地就拒绝，不产生一次真实提交", async () => {
        const { gateway, submitted } = gatewayStub();
        let caught: unknown;
        try {
            await runChangeColor({ gateway, values: values({ targetColor: "" }), source, maskUrl });
        } catch (error) {
            caught = error;
        }
        expect(caught instanceof ChangeColorAdapterError).toBe(true);
        expect(submitted.count).toBe(0);
    });

    test("源图不可用时不算 ready", () => {
        expect(isChangeColorSourceUsable(source)).toBe(true);
        expect(isChangeColorSourceUsable({ ...source, dataUrl: "", url: undefined })).toBe(false);
    });

    // 回归：ToolAssetInput 上传后资产记录里的 url 是 blob:（IndexedDB 对象 URL）。
    // 旧实现只认 data:/http(s)，导致上传成功却仍报「请先上传需要换色的图片」、提交按钮永久禁用。
    test("blob: 源图（上传后的本地资产）也算可用，否则上传成功也永远提交不了", () => {
        const blobSource = { ...source, dataUrl: "", url: "blob:http://127.0.0.1:3000/2f1c-uuid" };
        expect(isChangeColorSourceUsable(blobSource)).toBe(true);
        expect(isChangeColorSourceReady(blobSource)).toBe(true);
        expect(validateChangeColorState({
            values: values({ targetColor: "#2E6BE6" }),
            sourceReady: isChangeColorSourceReady(blobSource),
            imageModelReady: true,
            maskReady: false,
        }).some((issue) => issue.code === "source-required")).toBe(false);
    });
});
