import { describe, expect, test } from "bun:test";

import type { ToolAssetRecord } from "@/services/api/tools/assets";
import type { BrowserToolInput } from "@/services/api/tools/gateway";

import {
    MaterialUpperBodyAdapterError,
    assertMaterialInput,
    buildMaterialFields,
    isMaterialSourceReady,
    materialImageRef,
    materialMaskSizeFor,
    materialMaskSpec,
    materialResultCells,
    materialSourceFromRecord,
    mergeMaterialVariant,
    runMaterialUpperBody,
    validateMaterialSourceSize,
} from "./material-upper-body";
import {
    DEFAULT_MATERIAL_VALUES,
    MATERIAL_CATEGORIES,
    MATERIAL_DEFAULT_REGION,
    MATERIAL_FIELDS,
    MATERIAL_MAX_OUTPUT,
    MATERIAL_MIN_REGION_AREA,
    MATERIAL_OUTPUT_OPTIONS,
    MATERIAL_UPPER_BODY_MAKE_TYPE,
    MATERIAL_UPPER_BODY_ROUTE,
    MATERIAL_UPPER_BODY_TOOL_ID,
    buildMaterialPrompt,
    computeMaterialOutput,
    createMaterialSnapshot,
    describeMaterialDrift,
    isMaterialRegionUsable,
    linkMaterialValues,
    materialCategoryIdsOf,
    materialCategoryNameOf,
    materialLeavesOf,
    materialSubTypeOf,
    readMaterialValues,
    resolveMaterialCapability,
    validateMaterialState,
    type MaterialValues,
} from "../registry/material-upper-body";

const product: ToolAssetRecord = {
    id: "asset-1",
    kind: "image",
    name: "上装.png",
    storageKey: "k/product",
    url: "https://cdn.example.com/product.png",
    bytes: 120_000,
    mimeType: "image/png",
    width: 1200,
    height: 1600,
    createdAt: "2026-10-01T00:00:00.000Z",
    origin: "local",
};

const mask: ToolAssetRecord = {
    ...product,
    id: "asset-mask",
    name: "上装-蒙版.png",
    storageKey: "k/mask",
    url: "https://cdn.example.com/mask.png",
};

const capability = () =>
    resolveMaterialCapability({
        modelReady: true,
        provider: "test",
        modelId: "img-1",
        descriptor: { executable: true, fields: MATERIAL_FIELDS },
    });

const selected = (): MaterialValues => {
    const category = MATERIAL_CATEGORIES[0];
    return {
        ...DEFAULT_MATERIAL_VALUES,
        imageAssetId: product.id,
        imageName: product.name,
        categoryKey: category.key,
        leafKeys: [category.leaves[0].key],
        mattingRegion: { ...MATERIAL_DEFAULT_REGION },
    };
};

describe("registry：目录与常量", () => {
    test("工具身份与 7 个提交字段对齐网关", () => {
        expect(MATERIAL_UPPER_BODY_TOOL_ID).toBe("MATERIAL_UPPER_BODY");
        expect(MATERIAL_UPPER_BODY_ROUTE).toBe("/tools/product-design/material-upper-body");
        expect(MATERIAL_UPPER_BODY_MAKE_TYPE).toBe(16);
        expect([...MATERIAL_FIELDS].sort() as string[]).toEqual(
            (["categoryIds", "categoryName", "imageName", "imageUrl", "isMatting", "outputNum", "subType"] as string[]).sort(),
        );
        expect([...MATERIAL_OUTPUT_OPTIONS]).toEqual([1, 2, 3, 4]);
        expect(MATERIAL_MAX_OUTPUT).toBe(4);
    });

    test("材质目录：每类至少 1 个子类，id 全局唯一", () => {
        const ids = new Set<string>();
        expect(MATERIAL_CATEGORIES.length).toBeGreaterThanOrEqual(5);
        for (const category of MATERIAL_CATEGORIES) {
            expect(category.leaves.length).toBeGreaterThan(0);
            for (const leaf of category.leaves) {
                expect(leaf.key.length).toBeGreaterThan(0);
                expect(leaf.texture.length).toBeGreaterThan(0);
                const id = `${category.key}.${leaf.key}`;
                expect(ids.has(id)).toBe(false);
                ids.add(id);
            }
        }
    });

    test("每个子类都属于本大类，子类查询不会串类", () => {
        for (const category of MATERIAL_CATEGORIES) {
            const leaves = materialLeavesOf(category.key);
            expect(leaves.length).toBe(category.leaves.length);
            for (const leaf of leaves) expect(leaf.key).not.toBe("");
        }
        expect(materialLeavesOf("__nope__")).toEqual([]);
    });
});

describe("registry：草稿读取与联动", () => {
    test("未知大类/子类一律回退，不静默拼接", () => {
        const values = readMaterialValues({
            categoryKey: "__unknown__",
            leafKeys: ["__unknown_leaf__"],
            outputNum: 99,
            isMatting: "yes",
        });
        expect(values.categoryKey).toBe("");
        expect(values.leafKeys).toEqual([]);
        // 越界张数按能力上限夹紧（不是静默变成别的数），非法布尔回退 false。
        expect(values.outputNum).toBe(MATERIAL_MAX_OUTPUT);
        expect(values.isMatting).toBe(false);
    });

    test("未选大类时子类被清空，且说明原因", () => {
        const result = linkMaterialValues({ ...DEFAULT_MATERIAL_VALUES, categoryKey: "", leafKeys: ["silk"] });
        expect(result.values.leafKeys).toEqual([]);
        expect(result.changes.length).toBeGreaterThan(0);
    });

    test("子类不属于该大类时剔除，并自动补第一个子类", () => {
        const category = MATERIAL_CATEGORIES[0];
        const other = MATERIAL_CATEGORIES[1];
        const crossLeaf = other.leaves[0].key;
        const result = linkMaterialValues({ ...DEFAULT_MATERIAL_VALUES, categoryKey: category.key, leafKeys: [crossLeaf] });
        expect(result.values.leafKeys).toEqual([category.leaves[0].key]);
        expect(result.changes.join()).toContain(category.label);

        const missing = linkMaterialValues({ ...DEFAULT_MATERIAL_VALUES, categoryKey: category.key, leafKeys: [] });
        expect(missing.values.leafKeys).toEqual([category.leaves[0].key]);
    });

    test("张数收敛到 1–4", () => {
        const category = MATERIAL_CATEGORIES[0];
        const high = linkMaterialValues({ ...DEFAULT_MATERIAL_VALUES, categoryKey: category.key, leafKeys: [category.leaves[0].key], outputNum: 9 });
        expect(high.values.outputNum).toBe(MATERIAL_MAX_OUTPUT);
        const low = linkMaterialValues({ ...DEFAULT_MATERIAL_VALUES, categoryKey: category.key, leafKeys: [category.leaves[0].key], outputNum: 0 });
        expect(low.values.outputNum).toBe(1);
    });
});

describe("registry：校验与能力", () => {
    test("未上传图片时定位到 imageUrl，且不误报其他字段", () => {
        const issues = validateMaterialState({ values: selected(), capability: capability(), sourceReady: false });
        const fields = issues.map((issue) => issue.field);
        expect(fields).toContain("imageUrl");
        expect(fields).not.toContain("categoryIds");
        expect(fields).not.toContain("outputNum");
    });

    test("图片名称清空后必须报 imageName", () => {
        const issues = validateMaterialState({
            values: { ...selected(), imageName: "   " },
            capability: capability(),
            sourceReady: true,
        });
        expect(issues.map((issue) => issue.field)).toContain("imageName");
    });

    test("抠图开关打开但蒙版区域过小时报 mattingRegion", () => {
        const tiny = { cx: 0.5, cy: 0.5, rx: 0.01, ry: 0.01 };
        const issues = validateMaterialState({
            values: { ...selected(), isMatting: true, mattingRegion: tiny },
            capability: capability(),
            sourceReady: true,
        });
        expect(issues.map((issue) => issue.field)).toContain("mattingRegion");
        expect(isMaterialRegionUsable(tiny)).toBe(false);
        expect(MATERIAL_MIN_REGION_AREA).toBeGreaterThan(0.01 * 0.01 * Math.PI);
    });

    test("模型未配置时提交被拦（modelId）", () => {
        const issues = validateMaterialState({
            values: selected(),
            capability: resolveMaterialCapability({ modelReady: false }),
            sourceReady: true,
        });
        expect(issues.map((issue) => issue.field)).toContain("modelId");
    });

    test("完整配置无阻断问题，张数上限来自能力描述", () => {
        const cap = capability();
        expect(validateMaterialState({ values: selected(), capability: cap, sourceReady: true })).toEqual([]);
        expect(cap.maxOutput).toBe(MATERIAL_MAX_OUTPUT);
        expect(cap.executable).toBe(true);
    });
});

describe("registry：提示词与结果说明", () => {
    test("提示词写出类目/子类/质感，并强调保留版型", () => {
        const values = selected();
        const category = MATERIAL_CATEGORIES[0];
        const leaf = category.leaves[0];
        const prompt = buildMaterialPrompt(values, capability());
        expect(prompt).toContain(category.label);
        expect(prompt).toContain(leaf.label);
        expect(prompt).toContain(leaf.texture);
        expect(prompt).toContain("保留");
        expect(prompt).toContain("不得改款");
    });

    test("抠图开关改变提示词里的输入说明", () => {
        const values = selected();
        const plain = buildMaterialPrompt({ ...values, isMatting: false }, capability());
        const matted = buildMaterialPrompt({ ...values, isMatting: true }, capability());
        expect(plain).not.toBe(matted);
        expect(matted).toContain("蒙版");
    });

    test("产物说明不出现算力/积分文案", () => {
        const output = computeMaterialOutput({ ...selected(), outputNum: 2 }, capability());
        expect(output.expected).toBe(2);
        expect(output.label).not.toContain("算力");
        expect(output.label).not.toContain("积分");
    });
});

describe("registry：快照漂移", () => {
    test("同一配置不漂移；换图/换类目/换张数逐项报因", () => {
        const cap = capability();
        const values = selected();
        const base = createMaterialSnapshot(values, cap, 1);
        expect(describeMaterialDrift(base, createMaterialSnapshot(values, cap, 2))).toBeUndefined();

        const otherImage = createMaterialSnapshot({ ...values, imageAssetId: "asset-2" }, cap, 1);
        expect(describeMaterialDrift(base, otherImage)).toContain("图片");

        const otherCategory = MATERIAL_CATEGORIES[1];
        const otherCat = createMaterialSnapshot(
            { ...values, categoryKey: otherCategory.key, leafKeys: [otherCategory.leaves[0].key] },
            cap,
            1,
        );
        expect(describeMaterialDrift(base, otherCat)).toContain("类目");

        const otherCount = createMaterialSnapshot({ ...values, outputNum: 3 }, cap, 1);
        expect(describeMaterialDrift(base, otherCount)).toContain("张数");
    });
});

describe("adapter：源图与蒙版", () => {
    test("资产记录 → 源图，可读性按 url/dataUrl 判定", () => {
        const source = materialSourceFromRecord(product);
        expect(source.assetId).toBe(product.id);
        expect(source.name).toBe(product.name);
        expect(source.width).toBe(1200);
        expect(isMaterialSourceReady(source)).toBe(true);
        expect(isMaterialSourceReady({ ...source, url: "" })).toBe(false);
        expect(materialImageRef(source)).toBe(product.url);
    });

    test("尺寸超出上限/短边不足时给出可读原因", () => {
        const tooBig = validateMaterialSourceSize(materialSourceFromRecord({ ...product, width: 9000, height: 9000 }));
        expect(tooBig.ok).toBe(false);
        const tooSmall = validateMaterialSourceSize(materialSourceFromRecord({ ...product, width: 100, height: 100 }));
        expect(tooSmall.ok).toBe(false);
        expect(validateMaterialSourceSize(materialSourceFromRecord(product)).ok).toBe(true);
    });

    test("蒙版尺寸跟随原图，区域映射为真实像素椭圆", () => {
        const source = materialSourceFromRecord(product);
        expect(materialMaskSizeFor(source)).toEqual({ width: 1200, height: 1600 });
        const spec = materialMaskSpec(MATERIAL_DEFAULT_REGION, { width: 1000, height: 800 });
        expect(spec.region).toEqual(MATERIAL_DEFAULT_REGION);
        expect(spec.area).toBeGreaterThan(0);
        expect(spec.cx).toBeCloseTo(500, 5);
        expect(spec.cy).toBeCloseTo(272, 5);
        expect(spec.rx).toBeCloseTo(320, 5);
        expect(spec.ry).toBeCloseTo(216, 5);
    });
});

describe("adapter：7 字段与提交守卫", () => {
    test("组装出的字段与网关声明的 7 个字段完全一致", () => {
        const fields = buildMaterialFields({ values: selected(), capability: capability(), source: materialSourceFromRecord(product) });
        expect(Object.keys(fields).sort()).toEqual([...MATERIAL_FIELDS].sort());
        expect(fields.imageUrl).toBe(product.url);
        expect(fields.imageName).toBe(product.name);
        expect(fields.isMatting).toBe(false);
        expect(fields.outputNum).toBe(1);
        expect(String(fields.categoryIds)).toBe(materialCategoryIdsOf(selected()));
        expect(fields.categoryName).toBe(materialCategoryNameOf(selected()));
        expect(fields.subType).toBe(materialSubTypeOf(selected()));
    });

    test("开了抠图却没蒙版 → 直接抛错，不发送残缺请求", () => {
        expect(() =>
            buildMaterialFields({
                values: { ...selected(), isMatting: true },
                capability: capability(),
                source: materialSourceFromRecord(product),
            }),
        ).toThrow(MaterialUpperBodyAdapterError);
    });

    test("参考图不足、张数不符、prompt 为空都会被守卫拦下", () => {
        const values = selected();
        const build = { values, capability: capability(), source: materialSourceFromRecord(product) };
        const input: BrowserToolInput = {
            toolId: MATERIAL_UPPER_BODY_TOOL_ID,
            prompt: buildMaterialPrompt(values, capability()),
            references: [{ id: product.id, name: product.name, type: "image/png", dataUrl: product.url }],
            count: values.outputNum,
            fields: buildMaterialFields(build),
        };
        expect(() => assertMaterialInput(input, build)).not.toThrow();
        expect(() => assertMaterialInput({ ...input, references: [] }, build)).toThrow(MaterialUpperBodyAdapterError);
        expect(() => assertMaterialInput({ ...input, count: 3 }, build)).toThrow(MaterialUpperBodyAdapterError);
        expect(() => assertMaterialInput({ ...input, prompt: "  " }, build)).toThrow(MaterialUpperBodyAdapterError);
        expect(() => assertMaterialInput({ ...input, fields: { ...input.fields, subType: undefined } }, build)).toThrow(
            MaterialUpperBodyAdapterError,
        );
    });
});

describe("adapter：真实提交链路", () => {
    const makeTask = (status: string, items: Array<{ url: string }> = []) =>
        ({ id: "task-1", toolId: MATERIAL_UPPER_BODY_TOOL_ID, status, result: { kind: "image", items } }) as never;

    test("submit 收到的 count/字段/参考图与页面一致，且返回快照", async () => {
        const seen: BrowserToolInput[] = [];
        const gateway = {
            submit: async (input: BrowserToolInput) => {
                seen.push(input);
                return makeTask("succeeded", [{ url: "https://cdn.example.com/out-1.png" }]);
            },
            waitForResult: async () => makeTask("succeeded", [{ url: "https://cdn.example.com/out-1.png" }]),
        };
        const values = { ...selected(), outputNum: 2 };
        const run = await runMaterialUpperBody({
            gateway,
            values,
            capability: capability(),
            source: materialSourceFromRecord(product),
            revision: 7,
        });
        expect(seen).toHaveLength(1);
        expect(seen[0].count).toBe(2);
        expect(seen[0].toolId).toBe(MATERIAL_UPPER_BODY_TOOL_ID);
        expect(seen[0].references).toHaveLength(1);
        expect(Object.keys(seen[0].fields ?? {}).sort()).toEqual([...MATERIAL_FIELDS].sort());
        expect(run.snapshot.revision).toBe(7);
        expect(run.snapshot.outputNum).toBe(2);
        expect(run.task.id).toBe("task-1");
    });

    test("开启抠图后参考图是 2 张（原图 + 蒙版）", async () => {
        let captured: BrowserToolInput | null = null;
        const gateway = {
            submit: async (input: BrowserToolInput) => {
                captured = input;
                return makeTask("succeeded", [{ url: "https://cdn.example.com/out.png" }]);
            },
            waitForResult: async () => makeTask("succeeded", [{ url: "https://cdn.example.com/out.png" }]),
        };
        await runMaterialUpperBody({
            gateway,
            values: { ...selected(), isMatting: true },
            capability: capability(),
            source: materialSourceFromRecord(product),
            mask: { assetId: mask.id, name: mask.name, url: mask.url, mimeType: mask.mimeType, width: 1200, height: 1600 },
        });
        expect(captured!.references).toHaveLength(2);
        expect(captured!.fields?.isMatting).toBe(true);
    });

    test("校验不通过的配置不会发出请求", async () => {
        let calls = 0;
        const gateway = {
            submit: async () => {
                calls += 1;
                return makeTask("succeeded");
            },
            waitForResult: async () => makeTask("succeeded"),
        };
        await expect(
            runMaterialUpperBody({
                gateway,
                values: { ...selected(), imageName: "" },
                capability: capability(),
                source: materialSourceFromRecord(product),
            }),
        ).rejects.toBeInstanceOf(MaterialUpperBodyAdapterError);
        expect(calls).toBe(0);
    });

    test("单件重试只替换目标格子", () => {
        const previous = makeTask("succeeded", [{ url: "a" }, { url: "b" }]);
        const variant = makeTask("succeeded", [{ url: "b2" }]);
        const merged = mergeMaterialVariant(previous as never, variant as never, 1);
        const cells = materialResultCells(merged, 2);
        expect(cells).toHaveLength(2);
        expect(cells[0].item?.url).toBe("a");
        expect(cells[1].item?.url).toBe("b2");
        expect(cells.every((cell) => cell.status === "filled")).toBe(true);
    });

    test("结果格子按期望张数铺：缺的 pending，失败的 failed", () => {
        const pending = materialResultCells(makeTask("running", [{ url: "a" }]), 3);
        expect(pending.map((cell) => cell.status)).toEqual(["filled", "pending", "pending"]);
        const failed = materialResultCells(makeTask("failed"), 2);
        expect(failed.map((cell) => cell.status)).toEqual(["failed", "failed"]);
    });
});

describe("工作台渲染（SSR）", () => {
    test("上装换料首屏渲染步骤条、类目、子类、抠图、张数与结果区", async () => {
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
        const html = renderToStaticMarkup(createElement(workspace.DressWorkspace, { toolId: MATERIAL_UPPER_BODY_TOOL_ID }));

        // 上装换料自己的脚手架（不是 AI 穿戴那份）
        expect(html).toContain("material-workspace");
        expect(html).not.toContain("dress-workspace");
        expect(html).toContain("上装换料");
        expect(html).toContain("上传上装");
        expect(html).toContain("材质类目");
        expect(html).toContain("子类");
        expect(html).toContain("抠图");
        expect(html).toContain("生成张数");
        expect(html).toContain("4 张");
        expect(html).toContain("结果");
        // 真实控件与首屏阻断项（未上传时按钮禁用）
        expect(html).toContain("material-category-tree");
        expect(html).toContain("material-submit");
        expect(html).toContain("立即生成");
        expect(html).toContain('data-issue="imageUrl"');
        expect(html).toContain('data-output="4"');
        expect(html).toContain("material-result-grid");
        expect(html).toContain("tool-result");
    });

    test("默认导出仍然渲染 AI 穿戴（向后兼容，不影响既有测试）", async () => {
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
        expect(html).not.toContain("material-workspace");
    });
});
