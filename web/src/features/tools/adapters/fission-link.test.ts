import { describe, expect, test } from "bun:test";

import type { BrowserToolInput } from "@/services/api/tools/gateway";
import type { ToolTask } from "@/services/api/tools/task-machine";

/* bun test 没有 DOM：网关链路会加载 i18n（读 localStorage），这里只在缺省时打桩，
   让「网关描述符」用例能在纯逻辑环境里跑；业务代码本身不改。 */
if (typeof globalThis.localStorage === "undefined") {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => void store.set(key, String(value)),
            removeItem: (key: string) => void store.delete(key),
            clear: () => store.clear(),
            key: (index: number) => [...store.keys()][index] ?? null,
            get length() {
                return store.size;
            },
        },
    });
}

import {
    FISSION_LINK_DRAFT_KEY,
    FISSION_LINK_FIELD_KEYS,
    FISSION_LINK_LAYOUT,
    FISSION_LINK_MAKE_TYPE,
    FISSION_LINK_OUTPUT_MAX,
    FISSION_LINK_ROUTE,
    FISSION_LINK_TOOL_ID,
    auditFissionLinkFields,
    buildFissionLinkSnapshot,
    checkFissionLinkContract,
    composeFissionLinkFields,
    createFissionLinkState,
    fissionLinkInstruction,
    fissionLinkOutputOptions,
    fissionLinkPlan,
    fissionLinkSnapshotHash,
    fissionLinkSourceKey,
    fissionLinkSubmitLabel,
    inspectFissionLinkSource,
    isFissionLinkSnapshotStale,
    normalizeFissionLinkOutputNum,
    parseFissionLinkDraft,
    resolveFissionLinkOutputRange,
    serializeFissionLinkDraft,
    validateFissionLinkSubmit,
    type FissionLinkSnapshot,
} from "@/features/tools/registry/fission-link";
import {
    FissionLinkAdapterError,
    assertFissionLinkInput,
    buildFissionLinkInput,
    buildFissionLinkUnit,
    buildFissionLinkUnits,
    fissionLinkPreflightIssues,
    fissionLinkResultView,
    fissionLinkRunFromTask,
    fissionLinkStatusText,
    retryFissionLinkUnit,
    runFissionLink,
    toFissionLinkReference,
    type FissionLinkGatewayLike,
    type FissionLinkRun,
} from "@/features/tools/adapters/fission-link";

const SOURCE_URL = "https://cdn.example.com/products/bag.png";

function makeSnapshot(overrides: Partial<FissionLinkSnapshot> = {}): FissionLinkSnapshot {
    return buildFissionLinkSnapshot({
        sourceKind: "remote",
        sourceUrl: SOURCE_URL,
        sourceName: "bag.png",
        sourceWidth: 1200,
        sourceHeight: 1200,
        outputNum: 1,
        clientOperationId: "op-1",
        ...overrides,
    });
}

function makeTask(status: ToolTask["status"], items: { url?: string; dataUrl?: string }[] = []): ToolTask {
    return {
        id: `task-${status}`,
        toolId: FISSION_LINK_TOOL_ID,
        status,
        clientOperationId: "op-1",
        fingerprint: "fp",
        capability: "image",
        prompt: "prompt",
        configSnapshot: { capability: "image", model: "m", count: "1" },
        sourceAssetIds: [],
        createdAt: 1,
        updatedAt: 1,
        attempts: 1,
        pollCount: 0,
        transientFailures: 0,
        result: items.length
            ? {
                  items: items.map((item, i) => ({
                      id: `item-${i}`,
                      kind: "image" as const,
                      ...item,
                  })),
                  receivedAt: 1,
              }
            : undefined,
    };
}

describe("FISSION_LINK 契约", () => {
    test("registry 与页面常量一致，且只有 imageUrl / outputNum 两个字段", () => {
        const report = checkFissionLinkContract();
        expect(report.ok).toBe(true);
        expect(report.issues).toEqual([]);
        expect(report.spec?.makeType).toBe(FISSION_LINK_MAKE_TYPE);
        expect(report.spec?.route).toBe(FISSION_LINK_ROUTE);
        expect(report.spec?.layout).toBe(FISSION_LINK_LAYOUT);
        expect(report.spec?.batchCapable).toBe(false);
        expect(report.spec?.fields.map((field) => field.key)).toEqual([...FISSION_LINK_FIELD_KEYS]);
    });

    test("网关描述符与本页字段集合一致（不混用 PRODUCT_SCENE 契约）", async () => {
        const { describeToolExecution } = await import("@/services/api/tools/gateway");
        const descriptor = describeToolExecution(FISSION_LINK_TOOL_ID);
        expect(descriptor.kind).toBe("image");
        expect(descriptor.requiresReferences).toBe(true);
        expect([...descriptor.fields].sort()).toEqual([...FISSION_LINK_FIELD_KEYS].sort());
        expect(FISSION_LINK_DRAFT_KEY).toBe("tool-draft:v1:FISSION_LINK");
    });
});

describe("参考图来源识别", () => {
    test("HTTPS 链接是 remote", () => {
        const inspection = inspectFissionLinkSource(`  ${SOURCE_URL}  `);
        expect(inspection.kind).toBe("remote");
        expect(inspection.value).toBe(SOURCE_URL);
        expect(inspection.issue).toBeUndefined();
    });

    test("http 链接被拒，本地开发地址例外", () => {
        const insecure = inspectFissionLinkSource("http://cdn.example.com/a.png");
        expect(insecure.kind).toBe("invalid");
        expect(insecure.issue?.code).toBe("source-insecure");
        expect(fissionLinkSourceKey(insecure)).toBe("");

        const dev = inspectFissionLinkSource("http://localhost:3000/asset.png");
        expect(dev.kind).toBe("dev-remote");
        expect(dev.https).toBe(false);
    });

    test("空输入 / 乱码 / 资产 ID 各有明确结论", () => {
        expect(inspectFissionLinkSource("   ").issue?.code).toBe("source-empty");
        expect(inspectFissionLinkSource("这不是链接").kind).toBe("invalid");
        const asset = inspectFissionLinkSource("asset:9f3c2b1a");
        expect(asset.kind).toBe("asset");
        expect(fissionLinkSourceKey(asset)).toBe("asset:asset:9f3c2b1a");
    });
});

describe("数量与提交校验", () => {
    test("数量钳制到 1–4，且支持 provider 目录收窄", () => {
        expect(normalizeFissionLinkOutputNum(0)).toBe(1);
        expect(normalizeFissionLinkOutputNum(2.4)).toBe(2);
        expect(normalizeFissionLinkOutputNum(99)).toBe(FISSION_LINK_OUTPUT_MAX);
        expect(normalizeFissionLinkOutputNum("3")).toBe(3);
        expect(normalizeFissionLinkOutputNum(undefined)).toBe(1);
        expect(resolveFissionLinkOutputRange(2)).toEqual({ min: 1, max: 2 });
        expect(fissionLinkOutputOptions(3)).toEqual([1, 2, 3]);
    });

    test("预览没加载成功就不能提交", () => {
        const state = createFissionLinkState({ imageUrl: SOURCE_URL, outputNum: 2 });
        expect(validateFissionLinkSubmit({ state, preview: "ready" })).toEqual([]);
        expect(validateFissionLinkSubmit({ state, preview: "idle" })[0]?.code).toBe("source-not-ready");
        expect(validateFissionLinkSubmit({ state, preview: "loading" })[0]?.code).toBe("source-loading");
        expect(validateFissionLinkSubmit({ state, preview: "error" })[0]?.code).toBe("source-unreachable");
        expect(validateFissionLinkSubmit({ state, preview: "ready", executable: false })[0]?.code).toBe("adapter-not-executable");
    });

    test("非法协议与越界数量都会被拦下", () => {
        const insecure = createFissionLinkState({ imageUrl: "http://cdn.example.com/a.png" });
        expect(validateFissionLinkSubmit({ state: insecure, preview: "ready" }).map((issue) => issue.code)).toContain("source-insecure");
        const bad = { imageUrl: SOURCE_URL, outputNum: 9 };
        expect(validateFissionLinkSubmit({ state: bad, preview: "ready" }).map((issue) => issue.code)).toContain("outputNum-invalid");
    });

    test("提交文案与请求计划如实反映扇出次数", () => {
        const three = makeSnapshot({ outputNum: 3 });
        expect(fissionLinkPlan(three)).toEqual({ requests: 3, label: "将发起 3 次真实请求（每张一次）" });
        expect(fissionLinkSubmitLabel(createFissionLinkState({ imageUrl: SOURCE_URL, outputNum: 3 }))).toBe("生成 3 张裂变结果");
        expect(fissionLinkSubmitLabel(createFissionLinkState({ imageUrl: SOURCE_URL }))).toBe("生成裂变结果");
    });
});

describe("快照与草稿", () => {
    test("换图 / 改数量会让旧结果变旧，换操作 id 不会", () => {
        const snapshot = makeSnapshot({ outputNum: 2 });
        const base = {
            sourceUrl: snapshot.sourceUrl,
            sourceAssetId: snapshot.sourceAssetId,
            sourceWidth: snapshot.sourceWidth,
            sourceHeight: snapshot.sourceHeight,
            outputNum: snapshot.outputNum,
            version: snapshot.version,
        };
        expect(isFissionLinkSnapshotStale(snapshot, { ...base })).toBe(false);
        expect(isFissionLinkSnapshotStale(snapshot, { ...base, sourceUrl: "https://cdn.example.com/other.png" })).toBe(true);
        expect(isFissionLinkSnapshotStale(snapshot, { ...base, outputNum: 3 })).toBe(true);
        // 客户端操作 id / 草稿版本不参与指纹：同一配置重开一次不该变成“旧结果”。
        expect(fissionLinkSnapshotHash(base)).toBe(fissionLinkSnapshotHash({ ...base }));
    });

    test("草稿只恢复输入，不恢复“预览已就绪”", () => {
        const state = createFissionLinkState({ imageUrl: SOURCE_URL, outputNum: 4 });
        const draft = serializeFissionLinkDraft(state);
        expect(parseFissionLinkDraft(draft)).toEqual(state);
        expect(parseFissionLinkDraft(null)).toEqual({ imageUrl: "", outputNum: 1 });
        expect(parseFissionLinkDraft({ imageUrl: SOURCE_URL, outputNum: 12 }).outputNum).toBe(FISSION_LINK_OUTPUT_MAX);
    });

    test("字段组装与审计只认两个键", () => {
        const fields = composeFissionLinkFields({ imageUrl: SOURCE_URL, outputNum: 1 });
        expect(fields).toEqual({ imageUrl: SOURCE_URL, outputNum: 1 });
        expect(auditFissionLinkFields(fields)).toEqual({ missing: [], unexpected: [] });
        expect(auditFissionLinkFields({ imageUrl: SOURCE_URL })).toEqual({ missing: ["outputNum"], unexpected: [] });
        expect(auditFissionLinkFields({ ...fields, sceneKeyword: "沙滩" }).unexpected).toEqual(["sceneKeyword"]);
    });
});

describe("FISSION_LINK 适配器：单元与请求", () => {
    const source = toFissionLinkReference({ id: "asset-1", name: "bag.png", url: SOURCE_URL, type: "image/png" });

    test("参考图没有地址直接报错，不发空图请求", () => {
        expect(() => toFissionLinkReference({ name: "empty.png" })).toThrow(FissionLinkAdapterError);
    });

    test("数量 = 单元数，每个单元只请求 1 张并带变体序号", () => {
        const snapshot = makeSnapshot({ outputNum: 3 });
        const units = buildFissionLinkUnits({ snapshot, source });
        expect(units).toHaveLength(3);
        expect(units.map((unit) => unit.index)).toEqual([0, 1, 2]);
        for (const unit of units) {
            expect(unit.fields).toEqual({ imageUrl: SOURCE_URL, outputNum: 1 });
            expect(unit.references).toHaveLength(1);
            expect(unit.snapshotHash).toBe(fissionLinkSnapshotHash(snapshot));
            const input = buildFissionLinkInput(unit);
            expect(input.count).toBe(1);
            expect(input.toolId).toBe(FISSION_LINK_TOOL_ID);
            expect(() => assertFissionLinkInput(input)).not.toThrow();
        }
        expect(units[0].prompt).toContain("variant 1 of 3");
        expect(units[2].prompt).toContain("variant 3 of 3");
        expect(units[0].prompt).toContain("Keep the product");
    });

    test("单张时不出现变体文案，但仍保持商品身份约束", () => {
        const unit = buildFissionLinkUnit({ snapshot: makeSnapshot(), source });
        expect(unit.prompt).not.toContain("variant");
        expect(fissionLinkInstruction({ sourceName: "bag.png" })).toContain("bag.png");
        expect(unit.prompt).toContain("Change only the surrounding scene");
    });

    test("载荷守卫拒绝多余字段、缺字段与错误 count", () => {
        const unit = buildFissionLinkUnit({ snapshot: makeSnapshot(), source });
        const base = buildFissionLinkInput(unit);
        expect(() => assertFissionLinkInput({ ...base, fields: { ...unit.fields, sceneKeyword: "沙滩" } })).toThrow(/未登记字段/);
        expect(() => assertFissionLinkInput({ ...base, fields: { imageUrl: SOURCE_URL } })).toThrow(/缺少字段/);
        expect(() => assertFissionLinkInput({ ...base, count: 4 })).toThrow(/只请求 1 张/);
        expect(() => assertFissionLinkInput({ ...base, references: [] })).toThrow(/缺少参考图/);
        expect(() => assertFissionLinkInput({ ...base, prompt: "  " })).toThrow(/指令为空/);
    });
});

describe("FISSION_LINK 适配器：真实执行语义", () => {
    const source = toFissionLinkReference({ id: "asset-1", name: "bag.png", url: SOURCE_URL });
    const snapshot = makeSnapshot({ outputNum: 3 });
    const units = buildFissionLinkUnits({ snapshot, source });

    test("3 个单元 = 3 次真实请求，全部成功才报 succeeded", async () => {
        const calls: BrowserToolInput[] = [];
        const port: FissionLinkGatewayLike = {
            run: async (input) => {
                calls.push(input);
                return makeTask("succeeded", [{ url: `https://cdn.example.com/out-${calls.length}.png` }]);
            },
        };
        const runs = await runFissionLink({ units, port, concurrency: 2 });
        expect(calls).toHaveLength(3);
        expect(runs.map((run) => run.status)).toEqual(["succeeded", "succeeded", "succeeded"]);
        const view = fissionLinkResultView({ runs, requested: 3 });
        expect(view).toMatchObject({ status: "succeeded", succeeded: 3, failed: 0, requested: 3 });
        expect(fissionLinkStatusText(view)).toBe("已生成 3 张");
    });

    test("上游返回成功但没图 → 该格失败，不补造结果", async () => {
        const port: FissionLinkGatewayLike = { run: async () => makeTask("succeeded", []) };
        const runs = await runFissionLink({ units: units.slice(0, 1), port });
        expect(runs[0].status).toBe("failed");
        expect(runs[0].error?.code).toBe("empty-result");
        const view = fissionLinkResultView({ runs, requested: 1 });
        expect(view.status).toBe("failed");
        expect(view.firstImageUrl).toBeUndefined();
    });

    test("部分失败保留成功格，可只重试失败格", async () => {
        let index = 0;
        const port: FissionLinkGatewayLike = {
            run: async () => {
                index += 1;
                if (index === 2) return makeTask("failed", []);
                return makeTask("succeeded", [{ dataUrl: "data:image/png;base64,AAA" }]);
            },
        };
        const runs = await runFissionLink({ units, port, concurrency: 1 });
        expect(runs[1].status).toBe("failed");
        const view = fissionLinkResultView({ runs, requested: 3 });
        expect(view).toMatchObject({ status: "partial", succeeded: 2, failed: 1 });
        expect(fissionLinkStatusText(view)).toContain("2/3 张成功");

        const retried = await retryFissionLinkUnit(units[1], {
            port: { run: async () => makeTask("succeeded", [{ url: "https://cdn.example.com/retry.png" }]) },
        });
        expect(retried.status).toBe("succeeded");
        expect(retried.image?.url).toBe("https://cdn.example.com/retry.png");
    });

    test("请求发不出去时保留原因，不让整批静默成功", async () => {
        const port: FissionLinkGatewayLike = {
            run: async () => {
                throw new FissionLinkAdapterError("source-unavailable", "参考图读取失败（CORS）");
            },
        };
        const runs = await runFissionLink({ units: units.slice(0, 2), port });
        expect(runs.every((run) => run.status === "failed")).toBe(true);
        expect(runs[0].error).toEqual({ code: "source-unavailable", message: "参考图读取失败（CORS）" });
        expect(runs[0].task.error?.retryable).toBe(false);
    });

    test("取消与未知状态不被当成成功", async () => {
        const cancelled = fissionLinkRunFromTask(units[0], makeTask("cancelled"));
        expect(cancelled.status).toBe("cancelled");
        const unknown = fissionLinkRunFromTask(units[0], makeTask("running"));
        expect(unknown.status).toBe("unknown");
        const view: FissionLinkRun[] = [cancelled];
        expect(fissionLinkResultView({ runs: view, requested: 1 }).status).toBe("cancelled");
        expect(fissionLinkResultView({ runs: [unknown], requested: 1 }).status).toBe("unknown");
        expect(fissionLinkResultView({ runs: [], requested: 0, running: true }).status).toBe("running");
        expect(fissionLinkResultView({ runs: [], requested: 0 }).status).toBe("idle");
    });

    test("提交前体检指出缺图 / 数量越界", () => {
        expect(fissionLinkPreflightIssues(createFissionLinkState())).toContain("请先粘贴图片链接或上传一张参考图");
        expect(fissionLinkPreflightIssues({ imageUrl: SOURCE_URL, outputNum: 9 })).toContain("裂变数量必须是 1–4 的整数");
        expect(fissionLinkPreflightIssues({ imageUrl: SOURCE_URL, outputNum: 2 })).toEqual([]);
    });
});
