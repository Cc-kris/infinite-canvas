import { afterAll, describe, expect, test } from "bun:test";

// gateway / config-store 初始化会碰 localStorage：先注入内存实现（与 tests/gateway.test.ts 同法）。
const values = new Map<string, string>();
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
    },
});
afterAll(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});

import {
    PRODUCT_IMAGE_SUITE_SPEC,
    PRODUCT_IMAGE_SUITE_TOOL_ID,
    buildSuiteModulePlan,
    buildSuiteUnits,
    createDefaultSuiteConfig,
    createSuiteSnapshot,
    isSuiteSnapshotStale,
    readSuiteConfig,
    resolveModuleCount,
    suiteConfigFingerprint,
    suiteExpectedCount,
    validateSuiteConfig,
    type SuiteConfig,
} from "../registry/product-image-suite";
import { TOOLS } from "../registry";
import {
    SuiteAdapterError,
    buildSuiteUnitInput,
    groupSuiteUnits,
    isSuiteSourceReady,
    retrySuiteUnit,
    runSuite,
    saveSuiteResultItem,
    summarizeSuiteRun,
    validateSuiteSourceLimits,
    type SuiteGatewayLike,
    type SuiteUnitResult,
} from "./product-image-suite";
import type { BrowserToolInput } from "@/services/api/tools/gateway";
import type { ToolTask } from "@/services/api/tools/task-machine";
import type { ReferenceImage } from "@/types/image";

const source = {
    assetId: "asset-1",
    dataUrl: "data:image/png;base64,AAAA",
    mimeType: "image/png",
    bytes: 1024,
    width: 1200,
    height: 1200,
    name: "product.png",
};

function config(overrides: Partial<SuiteConfig> = {}): SuiteConfig {
    return createDefaultSuiteConfig({
        sourceAssetId: "asset-1",
        aplusModuleId: "aplus-advanced",
        aplusCount: 2,
        mainSubModuleIds: ["white-background"],
        mainSubCounts: { "white-background": 1 },
        ...overrides,
    });
}

function fakeTask(partial: Partial<ToolTask> & Pick<ToolTask, "id" | "status">): ToolTask {
    return {
        toolId: PRODUCT_IMAGE_SUITE_TOOL_ID,
        clientOperationId: `op-${partial.id}`,
        fingerprint: `fp-${partial.id}`,
        capability: "image",
        prompt: "p",
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

function makeFakeGateway(options: { failUnits?: string[] } = {}) {
    const submitted: BrowserToolInput[] = [];
    const retried: Array<{ taskId: string; input: BrowserToolInput }> = [];
    let seq = 0;
    const gateway: SuiteGatewayLike = {
        async submit(input) {
            submitted.push(input);
            seq += 1;
            const unitId = String((input.fields as Record<string, unknown>).suiteUnitId);
            if (options.failUnits?.includes(unitId)) throw new Error(`provider rejected ${unitId}`);
            return fakeTask({
                id: `task-${seq}`,
                status: "succeeded",
                result: { receivedAt: 3, items: [{ id: `img-${seq}`, kind: "image", dataUrl: `data:image/png;base64,IMG${seq}` }] },
            });
        },
        async retry(taskId, input) {
            retried.push({ taskId, input });
            seq += 1;
            return fakeTask({
                id: taskId,
                status: "succeeded",
                attempts: 2,
                result: { receivedAt: 4, items: [{ id: `img-retry-${seq}`, kind: "image", dataUrl: "data:image/png;base64,RETRY" }] },
            });
        },
    };
    return { gateway, submitted, retried };
}

/* ------------------------------ 规格一致性 ------------------------------ */

describe("PRODUCT_IMAGE_SUITE 规格", () => {
    test("与 39 工具注册表里的条目逐字段一致", () => {
        const registered = TOOLS.find((tool) => tool.id === PRODUCT_IMAGE_SUITE_TOOL_ID);
        expect(registered).toBeDefined();
        expect(PRODUCT_IMAGE_SUITE_SPEC).toEqual(registered!);
        expect(PRODUCT_IMAGE_SUITE_SPEC.makeType).toBe(71);
        expect(PRODUCT_IMAGE_SUITE_SPEC.layout).toBe("suite");
        expect(PRODUCT_IMAGE_SUITE_SPEC.adapter).toBe("image");
    });

    test("草稿读取：非法字段回落默认值并报告 issues", () => {
        const ok = readSuiteConfig({ aplusModuleId: "aplus-advanced", aplusCount: 3 });
        expect(ok.issues).toHaveLength(0);
        expect(ok.config.aplusCount).toBe(3);
        const bad = readSuiteConfig({ aplusCount: 999 });
        expect(bad.issues.length).toBeGreaterThan(0);
        expect(bad.config.aplusCount).toBe(4);
    });
});

/* ------------------------------ 数量与计划 ------------------------------ */

describe("数量与计划", () => {
    test("选了排版 → 每种排版一张；未选排版 → 按数量（官方随机）", () => {
        expect(resolveModuleCount({ count: 4, layoutMode: "per-layout", layoutIds: ["layout-a", "layout-b"] })).toEqual({
            count: 2,
            countSource: "layout",
        });
        expect(resolveModuleCount({ count: 4, layoutMode: "per-layout", layoutIds: [] })).toEqual({ count: 4, countSource: "quantity" });
        expect(resolveModuleCount({ count: 9, layoutMode: "no-text", layoutIds: ["layout-a"] })).toEqual({ count: 9, countSource: "quantity" });
    });

    test("计划按 A+ → 主副图（页面固有顺序）展开，未勾选的不出现", () => {
        // 顺序取页面固有顺序 卖点/白底/场景/特写/特写白底（spec line 14），与勾选先后无关。
        const plans = buildSuiteModulePlan(
            config({ mainSubModuleIds: ["scene", "selling-point"], mainSubCounts: { "selling-point": 1, scene: 2 } }),
        );
        expect(plans.map((plan) => plan.moduleId)).toEqual(["aplus-advanced", "selling-point", "scene"]);
        expect(plans.map((plan) => plan.count)).toEqual([2, 1, 2]);
        expect(plans[0].kind).toBe("aplus");
        expect(plans[1].kind).toBe("main-sub");
    });

    test("单元展开：id/label/总数稳定，每单元一张", () => {
        const units = buildSuiteUnits(config());
        expect(units.map((unit) => unit.id)).toEqual(["aplus-advanced#1", "aplus-advanced#2", "white-background#1"]);
        expect(units.map((unit) => unit.label)).toEqual(["高级A+ 1/2", "高级A+ 2/2", "白底图 1/1"]);
        expect(suiteExpectedCount(config())).toBe(units.length);
    });

    test("Prompt 落地商品信息、比例、分辨率、无文字模式", () => {
        const units = buildSuiteUnits(config({ productInfo: "无线降噪耳机，续航 40 小时", ratio: "3:4", resolution: "4K" }));
        const prompt = units[0].prompt;
        expect(prompt).toContain("无线降噪耳机");
        expect(prompt).toContain("3:4");
        expect(prompt).toContain("4K");
        expect(prompt).toContain("无文字模式");
        const empty = buildSuiteUnits(config())[0].prompt;
        expect(empty).toContain("未填写");
    });

    test("品牌基因与合规只在开启/选择时进入 Prompt", () => {
        const off = buildSuiteUnits(config({ brand: { smartBrand: false, primaryColor: "#ff0000", fontStyle: "bold" } }))[0].prompt;
        expect(off).not.toContain("品牌基因");
        const on = buildSuiteUnits(
            config({
                brand: { smartBrand: true, primaryColor: "#ff0000", fontStyle: "bold" },
                compliance: { sensitiveWordLexiconId: "lex-1", replacementWordLexiconId: "lex-2" },
            }),
        )[0].prompt;
        expect(on).toContain("主色 #ff0000");
        expect(on).toContain("合规");
    });
});

/* -------------------------------- 校验 -------------------------------- */

describe("校验", () => {
    test("缺源图 / 无生成类型 / 无图片模型 / 文案超长 都被拦下", () => {
        const issues = validateSuiteConfig(createDefaultSuiteConfig(), { sourceReady: false, imageModelReady: false });
        const codes = issues.map((issue) => issue.code);
        expect(codes).toContain("source-missing");
        expect(codes).toContain("module-missing");
        expect(codes).toContain("capability-missing");

        const longInfo = validateSuiteConfig(config({ productInfo: "字".repeat(2501) }), { sourceReady: true, imageModelReady: true });
        expect(longInfo.some((issue) => issue.code === "product-info-too-long")).toBe(true);

        expect(validateSuiteConfig(config(), { sourceReady: true, imageModelReady: true })).toHaveLength(0);
    });

    test("源图限制：10M / 384–4096 / 宽高比 ≤ 5", () => {
        expect(validateSuiteSourceLimits({ ...source, bytes: 11 * 1024 * 1024 }).ok).toBe(false);
        expect(validateSuiteSourceLimits({ ...source, width: 200, height: 200 }).ok).toBe(false);
        expect(validateSuiteSourceLimits({ ...source, width: 5000, height: 5000 }).ok).toBe(false);
        expect(validateSuiteSourceLimits({ ...source, width: 5000, height: 900 }).ok).toBe(false);
        expect(validateSuiteSourceLimits(source).ok).toBe(true);
        expect(isSuiteSourceReady(source)).toBe(true);
        expect(isSuiteSourceReady({ assetId: "x" })).toBe(false);
    });
});

/* --------------------------- 快照与过期判定 --------------------------- */

describe("快照与过期判定", () => {
    test("指纹与键序/数组序无关，但随生成字段变化", () => {
        const a = config({ mainSubModuleIds: ["scene", "white-background"] });
        const b = config({ mainSubModuleIds: ["white-background", "scene"] });
        expect(suiteConfigFingerprint(a)).toBe(suiteConfigFingerprint(b));
        expect(suiteConfigFingerprint(config({ productInfo: "新的卖点" }))).not.toBe(suiteConfigFingerprint(config()));
    });

    test("改配置后旧快照判为过期（重新上传源图 / 改品牌基因）", () => {
        const snapshot = createSuiteSnapshot(config(), 3);
        expect(isSuiteSnapshotStale(snapshot, config())).toBe(false);
        expect(isSuiteSnapshotStale(snapshot, config({ sourceAssetId: "asset-2" }))).toBe(true);
        expect(isSuiteSnapshotStale(snapshot, config({ brand: { smartBrand: true, primaryColor: "#000", fontStyle: "" } }))).toBe(true);
    });
});

/* ------------------------------ 提交编排 ------------------------------ */

describe("提交编排（真实调用路径）", () => {
    test("配置非法时不提交任何请求", async () => {
        const { gateway, submitted } = makeFakeGateway();
        await expect(runSuite({ gateway, config: createDefaultSuiteConfig(), source: { assetId: "" } })).rejects.toBeInstanceOf(SuiteAdapterError);
        expect(submitted).toHaveLength(0);
    });

    test("每个单元一次真实提交，结果按模块分组", async () => {
        const { gateway, submitted } = makeFakeGateway();
        const run = await runSuite({ gateway, config: config(), source, revision: 5 });
        expect(submitted).toHaveLength(3);
        expect(run.submitted).toBe(3);
        expect(run.groups.map((group) => group.moduleId)).toEqual(["aplus-advanced", "white-background"]);
        expect(run.groups.map((group) => group.total)).toEqual([2, 1]);
        expect(run.groups.every((group) => group.succeeded === group.total)).toBe(true);
        expect(run.units.every((unit) => unit.items.length === 1)).toBe(true);
        expect(summarizeSuiteRun(run.units)).toEqual({ total: 3, succeeded: 3, failed: 0, pending: 0 });
        expect(run.snapshot.revision).toBe(5);

        const first = submitted[0];
        expect(first.toolId).toBe(PRODUCT_IMAGE_SUITE_TOOL_ID);
        expect(first.count).toBe(1);
        expect(first.references).toHaveLength(1);
        expect((first.fields as Record<string, unknown>).suiteUnitId).toBe("aplus-advanced#1");
        expect((first.fields as Record<string, unknown>).outputNum).toBe(3);
        expect(first.prompt).not.toHaveLength(0);
    });

    test("单张失败不影响其它单元，失败原因保留", async () => {
        const { gateway } = makeFakeGateway({ failUnits: ["white-background#1"] });
        const run = await runSuite({ gateway, config: config(), source });
        const summary = summarizeSuiteRun(run.units);
        expect(summary).toEqual({ total: 3, succeeded: 2, failed: 1, pending: 0 });
        const failed = run.units.find((unit) => unit.unitId === "white-background#1")!;
        expect(failed.error?.message).toContain("provider rejected");
        expect(failed.items).toHaveLength(0);
        expect(run.groups[1].failed).toBe(1);
    });

    test("分组保留页面顺序，pending 单独计数", () => {
        const units: SuiteUnitResult[] = [
            { unitId: "a#1", moduleId: "a", moduleLabel: "A", kind: "aplus", label: "A 1/1", index: 1, total: 1, status: "succeeded", items: [], attempts: 1 },
            { unitId: "b#1", moduleId: "b", moduleLabel: "B", kind: "main-sub", label: "B 1/1", index: 1, total: 1, status: "pending", items: [], attempts: 1 },
        ];
        const groups = groupSuiteUnits(units);
        expect(groups.map((group) => group.moduleId)).toEqual(["a", "b"]);
        expect(groups[1].pending).toBe(1);
    });
});

/* -------------------------------- 重试 -------------------------------- */

describe("单张重试", () => {
    test("只重提该单元，其它结果不动", async () => {
        const { gateway, retried } = makeFakeGateway();
        const unit = buildSuiteUnits(config())[2];
        const previous: SuiteUnitResult = {
            unitId: unit.id,
            moduleId: unit.moduleId,
            moduleLabel: unit.moduleLabel,
            kind: unit.kind,
            label: unit.label,
            index: unit.index,
            total: unit.total,
            status: "failed",
            taskId: "task-9",
            items: [],
            error: { code: "provider-error", message: "boom", retryable: true },
            attempts: 1,
        };
        const next = await retrySuiteUnit({ gateway, config: config(), source, unit, previous, revision: 7 });
        expect(retried).toHaveLength(1);
        expect(retried[0].taskId).toBe("task-9");
        expect(next.status).toBe("succeeded");
        expect(next.unitId).toBe(unit.id);
        expect(next.items).toHaveLength(1);
    });

    test("未提交过 / 已成功 / 待定 的单元拒绝重试", async () => {
        const { gateway } = makeFakeGateway();
        const unit = buildSuiteUnits(config())[0];
        const base: SuiteUnitResult = {
            unitId: unit.id,
            moduleId: unit.moduleId,
            moduleLabel: unit.moduleLabel,
            kind: unit.kind,
            label: unit.label,
            index: unit.index,
            total: unit.total,
            status: "failed",
            items: [],
            attempts: 1,
        };
        await expect(retrySuiteUnit({ gateway, config: config(), source, unit, previous: base })).rejects.toMatchObject({ code: "no-task" });
        await expect(
            retrySuiteUnit({ gateway, config: config(), source, unit, previous: { ...base, status: "succeeded", taskId: "t" } }),
        ).rejects.toMatchObject({ code: "already-succeeded" });
        await expect(
            retrySuiteUnit({ gateway, config: config(), source, unit, previous: { ...base, status: "pending", taskId: "t" } }),
        ).rejects.toMatchObject({ code: "pending-unknown" });
    });
});

/* -------------------------------- 保存 -------------------------------- */

describe("保存动作", () => {
    const unit = buildSuiteUnits(config())[0];
    const result: SuiteUnitResult = {
        unitId: unit.id,
        moduleId: unit.moduleId,
        moduleLabel: unit.moduleLabel,
        kind: unit.kind,
        label: unit.label,
        index: unit.index,
        total: unit.total,
        status: "succeeded",
        items: [],
        attempts: 1,
    };

    test("没有内容的结果直接报错，不生成占位", async () => {
        await expect(saveSuiteResultItem({ id: "x", kind: "image" }, result, { upload: async () => ({ url: "", storageKey: "", bytes: 0, mimeType: "" }) })).rejects.toMatchObject({
            code: "empty-result",
        });
    });

    test("有内容时走注入的存储实现并回传 storageKey", async () => {
        const calls: Array<{ input: string | Blob; prefix?: string }> = [];
        const saved = await saveSuiteResultItem({ id: "img-1", kind: "image", dataUrl: "data:image/png;base64,AAA" }, result, {
            upload: async (input, prefix) => {
                calls.push({ input, prefix });
                return { url: "blob:fake", storageKey: "suite-aplus-advanced:1", bytes: 3, mimeType: "image/png" };
            },
        });
        expect(calls).toHaveLength(1);
        expect(calls[0].prefix).toBe("suite-aplus-advanced");
        expect(saved).toMatchObject({ unitId: "aplus-advanced#1", itemId: "img-1", storageKey: "suite-aplus-advanced:1" });
    });
});

/* --------------------------- 真实网关 + 假 provider --------------------------- */

describe("真实网关集成", () => {
    test("每个单元经 ToolTaskGateway 走 requestEdit 路径并回传真实 item", async () => {
        const { ToolTaskGateway, createMemoryTaskStore } = await import("@/services/api/tools/gateway");
        const { defaultConfig } = await import("@/stores/use-config-store");
        const calls: Array<{ prompt: string; references: ReferenceImage[] }> = [];
        const gateway = new ToolTaskGateway({
            getConfig: () => ({ ...defaultConfig, model: "test-image-model", imageModel: "test-image-model", count: "1" }),
            store: createMemoryTaskStore(),
            provider: {
                async generateImage() {
                    throw new Error("suite always sends a reference image");
                },
                async editImage(_config: unknown, prompt: string, references: ReferenceImage[]) {
                    calls.push({ prompt, references });
                    return [{ id: `img-${calls.length}`, dataUrl: `data:image/png;base64,GEN${calls.length}` }];
                },
                async createVideoTask() {
                    throw new Error("not used");
                },
                async pollVideoTask() {
                    return { status: "pending" as const };
                },
            } as never,
        });

        const run = await runSuite({ gateway, config: config(), source, revision: 11 });
        expect(calls).toHaveLength(3);
        expect(calls[0].references[0].id).toBe("asset-1");
        expect(calls[0].prompt).toContain("高级A+");
        expect(run.groups.map((group) => group.succeeded)).toEqual([2, 1]);
        expect(run.units[0].items[0].dataUrl).toBe("data:image/png;base64,GEN1");
        expect(run.units[0].attempts).toBe(1);
    });

    test("provider 报错时任务判失败，单元暴露错误而不是伪造结果", async () => {
        const { ToolTaskGateway, createMemoryTaskStore } = await import("@/services/api/tools/gateway");
        const { defaultConfig } = await import("@/stores/use-config-store");
        const gateway = new ToolTaskGateway({
            getConfig: () => ({ ...defaultConfig, model: "test-image-model", imageModel: "test-image-model", count: "1" }),
            store: createMemoryTaskStore(),
            provider: {
                async generateImage() {
                    throw new Error("not used");
                },
                async editImage() {
                    throw new Error("upstream 401 invalid api key");
                },
                async createVideoTask() {
                    throw new Error("not used");
                },
                async pollVideoTask() {
                    return { status: "pending" as const };
                },
            } as never,
        });

        const run = await runSuite({ gateway, config: config({ aplusCount: 1, mainSubModuleIds: [] }), source });
        expect(run.units).toHaveLength(1);
        expect(run.units[0].status).toBe("failed");
        expect(run.units[0].error?.message).toContain("401");
        expect(run.units[0].items).toHaveLength(0);
        expect(run.units[0].taskId).toBeDefined();
    });
});

/* ------------------------------ 单元输入 ------------------------------ */

describe("单元输入", () => {
    test("缺源图时构造输入立刻报错（不提交空参考）", () => {
        const unit = buildSuiteUnits(config())[0];
        expect(() => buildSuiteUnitInput({ config: config(), unit, source: { assetId: "" } })).toThrow(SuiteAdapterError);
    });

    test("模型覆盖为空时不写死模型，交给用户配置", () => {
        const unit = buildSuiteUnits(config())[0];
        const input = buildSuiteUnitInput({ config: config(), unit, source });
        expect(input.model).toBeUndefined();
        const pinned = buildSuiteUnitInput({ config: config({ model: "my-model" }), unit, source });
        expect(pinned.model).toBe("my-model");
        expect(pinned.size).toBe("1:1");
    });
});
