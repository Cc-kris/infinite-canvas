import { describe, expect, test } from "bun:test";

import type { ToolTask } from "@/services/api/tools/task-machine";

import { assertPrintExtractInput, buildPrintExtractInput, buildPrintExtractUnit, printExtractPreflightIssues, printExtractResultView, printExtractSourceReference, runPrintExtract, type PrintExtractRunPort } from "./print-extract";
import {
    PRINT_EXTRACT_DRAFT_KEY,
    PRINT_EXTRACT_LAYOUT,
    PRINT_EXTRACT_REQUIRED_FIELDS,
    PRINT_EXTRACT_ROUTE,
    PRINT_EXTRACT_SOURCE_LIMITS,
    PRINT_EXTRACT_TOOL_ID,
    applyPrintExtractItemResult,
    composePrintExtractFields,
    createPrintExtractItems,
    createPrintExtractSnapshot,
    describePrintExtractProgress,
    getPrintExtractSpec,
    isPrintExtractSnapshotStale,
    normalizePrintExtractOptions,
    parsePrintExtractDraftValues,
    printExtractAspect,
    printExtractDownloadName,
    printExtractDraftValues,
    printExtractInstruction,
    printExtractSnapshotHash,
    summarizePrintExtractItems,
    validatePrintExtractSource,
    type PrintExtractSource,
} from "@/features/tools/registry/print-extract";

const source: PrintExtractSource = {
    assetId: "asset-1",
    name: "shoe.png",
    url: "https://cdn.local/shoe.png",
    width: 1200,
    height: 1600,
    bytes: 2 * 1024 * 1024,
    mimeType: "image/png",
};

function snapshotOf(isTransparent = false, draftRevision: number | null = 3) {
    return createPrintExtractSnapshot({ source, options: { isTransparent }, draftRevision, now: 1700000000000 });
}

function toolTask(overrides: Partial<ToolTask> = {}): ToolTask {
    return {
        id: "task-1",
        toolId: PRINT_EXTRACT_TOOL_ID,
        status: "succeeded",
        clientOperationId: "op-1",
        fingerprint: "fp",
        capability: "image",
        prompt: "extract print",
        configSnapshot: { capability: "image", model: "m", count: "1" },
        source: { type: "upload", label: "shoe.png" },
        result: { items: [{ kind: "image", url: "https://cdn.local/print.png" }] },
        createdAt: 0,
        updatedAt: 0,
        ...overrides,
    } as ToolTask;
}

describe("印花提取 · 规格契约", () => {
    test("注册表里的路由/布局/适配器/字段与页面一致", () => {
        const spec = getPrintExtractSpec();
        expect(spec).toBeDefined();
        expect(spec?.id).toBe(PRINT_EXTRACT_TOOL_ID);
        expect(spec?.layout).toBe(PRINT_EXTRACT_LAYOUT);
        expect(spec?.layout).toBe("extract");
        expect(spec?.adapter).toBe("image");
        expect(spec?.route).toBe(PRINT_EXTRACT_ROUTE);
        expect(spec?.category).toBe("product-design");
        expect(spec?.batchCapable).toBe(false);
        const keys = (spec?.fields ?? []).map((field) => field.key);
        for (const required of PRINT_EXTRACT_REQUIRED_FIELDS) {
            expect(keys).toContain(required);
        }
    });

    test("草稿键与规格 §6 一致", () => {
        expect(PRINT_EXTRACT_DRAFT_KEY).toBe("tool-draft:v1:PRINT_EXTRACT");
    });

    test("限制值来自规格：20M / 384~4096 / 比例<5", () => {
        expect(PRINT_EXTRACT_SOURCE_LIMITS.maxBytes).toBe(20 * 1024 * 1024);
        expect(PRINT_EXTRACT_SOURCE_LIMITS.minSide).toBe(384);
        expect(PRINT_EXTRACT_SOURCE_LIMITS.maxSide).toBe(4096);
        expect(PRINT_EXTRACT_SOURCE_LIMITS.maxAspect).toBe(5);
    });
});

describe("印花提取 · 源图校验", () => {
    test("缺图时提示先上传", () => {
        expect(validatePrintExtractSource(null).map((issue) => issue.code)).toEqual(["source-missing"]);
    });

    test("超过 20M 拒绝", () => {
        const codes = validatePrintExtractSource({ ...source, bytes: 21 * 1024 * 1024 }).map((issue) => issue.code);
        expect(codes).toContain("source-too-large");
    });

    test("小于 384 边拒绝", () => {
        const codes = validatePrintExtractSource({ ...source, width: 300, height: 300 }).map((issue) => issue.code);
        expect(codes).toContain("source-too-small");
    });

    test("超过 4096 边拒绝", () => {
        const codes = validatePrintExtractSource({ ...source, width: 5000, height: 1000 }).map((issue) => issue.code);
        expect(codes).toContain("source-too-large-dimension");
    });

    test("宽高比 ≥5 拒绝，恰好 5 也拒绝", () => {
        expect(validatePrintExtractSource({ ...source, width: 3840, height: 640 }).map((issue) => issue.code)).toContain("source-aspect-invalid");
        expect(printExtractAspect(3840, 640)).toBe(6);
        expect(printExtractAspect(1920, 384)).toBe(5);
        expect(printExtractAspect(1920, 400)).toBeLessThan(5);
    });

    test("不支持的格式拒绝", () => {
        const codes = validatePrintExtractSource({ ...source, mimeType: "image/gif" }).map((issue) => issue.code);
        expect(codes).toContain("source-type-unsupported");
    });

    test("合规图片无问题", () => {
        expect(validatePrintExtractSource(source)).toEqual([]);
    });
});

describe("印花提取 · 配置与快照", () => {
    test("isTransparent 必须是显式 boolean，缺失归一为 false", () => {
        expect(normalizePrintExtractOptions({})).toEqual({ isTransparent: false });
        expect(normalizePrintExtractOptions({ isTransparent: "yes" })).toEqual({ isTransparent: false });
        expect(normalizePrintExtractOptions({ isTransparent: true })).toEqual({ isTransparent: true });
    });

    test("快照记录契约字段与幂等键", () => {
        const snapshot = snapshotOf(true);
        expect(snapshot.toolId).toBe(PRINT_EXTRACT_TOOL_ID);
        expect(snapshot.isTransparent).toBe(true);
        expect(snapshot.sourceAssetId).toBe("asset-1");
        expect(snapshot.clientOperationId.startsWith("print-extract-")).toBe(true);
        expect(snapshot.draftRevision).toBe(3);
    });

    test("指纹随透明开关变化，从而能判定旧版本", () => {
        const opaque = snapshotOf(false);
        const transparent = snapshotOf(true);
        expect(printExtractSnapshotHash(opaque)).not.toBe(printExtractSnapshotHash(transparent));
        expect(isPrintExtractSnapshotStale(opaque, { ...transparent })).toBe(true);
        expect(isPrintExtractSnapshotStale(opaque, { ...opaque })).toBe(false);
        expect(isPrintExtractSnapshotStale(null, transparent)).toBe(false);
    });

    test("草稿只存配置与资产 id，可往返", () => {
        const values = printExtractDraftValues({ isTransparent: true, format: "png", batch: true, items: [{ assetId: "a" }, { assetId: "b" }] });
        expect(values).toEqual({ isTransparent: true, format: "png", batch: true, assetIds: ["a", "b"] });
        expect(parsePrintExtractDraftValues(values)).toEqual(values);
    });

    test("草稿里异常值被归一而不是抛错", () => {
        expect(parsePrintExtractDraftValues(null)).toBeNull();
        expect(parsePrintExtractDraftValues({})).toBeNull();
        const parsed = parsePrintExtractDraftValues({ isTransparent: "x", format: "webp", batch: 1, assetIds: ["a", "", 2] });
        expect(parsed).toEqual({ isTransparent: false, format: "png", batch: false, assetIds: ["a"] });
    });
});

describe("印花提取 · 请求构造", () => {
    test("落库字段包含契约两项，且 isTransparent 为显式 boolean", () => {
        const fields = composePrintExtractFields({ isTransparent: false }, { imageUrl: "https://cdn.local/shoe.png" });
        expect(fields.imageUrl).toBe("https://cdn.local/shoe.png");
        expect(fields.url).toBe("https://cdn.local/shoe.png");
        expect(fields.isTransparent).toBe(false);
        expect(typeof fields.isTransparent).toBe("boolean");
    });

    test("透明与不透明的指令不同，且都要求提取印花", () => {
        const opaque = printExtractInstruction({ isTransparent: false, width: 1200, height: 1600 });
        const transparent = printExtractInstruction({ isTransparent: true, width: 1200, height: 1600 });
        expect(opaque).not.toBe(transparent);
        expect(transparent.toLowerCase()).toContain("transparent background");
        expect(opaque.toLowerCase()).toContain("extract the printed artwork");
        expect(transparent).toContain("1200x1600");
    });

    test("unit 携带两项字段 + 幂等键 + 指纹", () => {
        const snapshot = snapshotOf(true);
        const unit = buildPrintExtractUnit({ snapshot, source: printExtractSourceReference(source) });
        expect(unit.fields.imageUrl).toBe("https://cdn.local/shoe.png");
        expect(unit.fields.isTransparent).toBe(true);
        expect(unit.fields.clientOperationId).toBe(snapshot.clientOperationId);
        expect(unit.snapshotHash).toBe(printExtractSnapshotHash(snapshot));
        expect(unit.references).toHaveLength(1);
    });

    test("asset 记录的 data: 地址不会被当作 http 地址搬运", () => {
        const dataUrlRef = printExtractSourceReference({ ...source, url: "data:image/png;base64,AAA" });
        expect(dataUrlRef.dataUrl).toBe("data:image/png;base64,AAA");
        const httpRef = printExtractSourceReference(source);
        expect(httpRef.dataUrl).toBe("");
        expect(httpRef.url).toBe("https://cdn.local/shoe.png");
    });

    test("请求体一次只出一张，字段齐全", () => {
        const snapshot = snapshotOf(false);
        const unit = buildPrintExtractUnit({ snapshot, source: printExtractSourceReference(source) });
        const input = buildPrintExtractInput(unit, { draftRevision: 7 });
        expect(input.toolId).toBe(PRINT_EXTRACT_TOOL_ID);
        expect(input.count).toBe(1);
        expect(input.fields?.draftRevision).toBe(7);
        expect(input.fields?.clientOperationId).toBe(snapshot.clientOperationId);
        expect(input.fields?.printExtractVersion).toBeDefined();
        expect(() => assertPrintExtractInput(input)).not.toThrow();
    });

    test("缺字段直接拒绝提交，不发缺参请求", () => {
        const snapshot = snapshotOf(false);
        const unit = buildPrintExtractUnit({ snapshot, source: printExtractSourceReference(source) });
        const input = buildPrintExtractInput(unit);
        expect(() => assertPrintExtractInput({ ...input, fields: { ...input.fields, imageUrl: "" } })).toThrow();
        expect(() => assertPrintExtractInput({ ...input, fields: { ...input.fields, isTransparent: undefined } })).toThrow();
        expect(() => assertPrintExtractInput({ ...input, fields: { ...input.fields, clientOperationId: "" } })).toThrow();
    });

    test("preflight 合并页面校验，给可展示的原因", () => {
        const messages = printExtractPreflightIssues({ isTransparent: false, width: 100, height: 100 }, { ...source, width: 100, height: 100 });
        expect(messages.length).toBeGreaterThan(0);
        expect(printExtractPreflightIssues({ isTransparent: true, width: 1200, height: 1600 }, source)).toEqual([]);
    });
});

describe("印花提取 · 结果判定", () => {
    const snapshot = snapshotOf(true);

    test("运行中/未知/失败/取消都有明确状态", () => {
        expect(printExtractResultView(toolTask({ status: "running" }), snapshot).status).toBe("running");
        expect(printExtractResultView(toolTask({ status: "submitting" }), snapshot).status).toBe("running");
        // unknown 不能伪装成 running：上游是否受理无法确认，卡片必须显示「结果未知」等人工确认。
        const unknown = printExtractResultView(toolTask({ status: "unknown" }), snapshot);
        expect(unknown.status).toBe("unknown");
        expect(unknown.error).toContain("人工确认");
        expect(printExtractResultView(toolTask({ status: "failed", error: { message: "boom" } as never }), snapshot).status).toBe("failed");
        expect(printExtractResultView(toolTask({ status: "cancelled" }), snapshot).status).toBe("cancelled");
    });

    test("成功但没有图判失败，绝不补造", () => {
        const view = printExtractResultView(toolTask({ status: "succeeded", result: { items: [], receivedAt: 0 } }), snapshot);
        expect(view.status).toBe("failed");
        expect(view.error).toContain("empty-result");
        expect(view.imageUrl).toBeUndefined();
    });

    test("成功且有图才返回地址", () => {
        const view = printExtractResultView(toolTask(), snapshot);
        expect(view.status).toBe("succeeded");
        expect(view.imageUrl).toBe("https://cdn.local/print.png");
        expect(view.snapshotHash).toBe(printExtractSnapshotHash(snapshot));
    });

    test("runPrintExtract 走真实端口并透传 apply 结果", async () => {
        const calls: unknown[] = [];
        const port: PrintExtractRunPort = {
            run: async (input) => {
                calls.push(input);
                return toolTask({ clientOperationId: String(input.fields?.clientOperationId) });
            },
        };
        const snap = snapshotOf(true);
        const unit = buildPrintExtractUnit({ snapshot: snap, source: printExtractSourceReference(source) });
        const persisted: ToolTask[] = [];
        const { task, view } = await runPrintExtract({ unit, snapshot: snap, draftRevision: 5 }, { port, persist: (next) => persisted.push(next) });
        expect(calls).toHaveLength(1);
        expect(task.id).toBe("task-1");
        expect(view.status).toBe("succeeded");
        expect(persisted.length).toBeGreaterThan(0);
    });

    test("端口失败时异常向上抛，不吞掉", async () => {
        const port: PrintExtractRunPort = {
            run: async () => {
                throw new Error("上游 502");
            },
        };
        const snap = snapshotOf(false);
        const unit = buildPrintExtractUnit({ snapshot: snap, source: printExtractSourceReference(source) });
        await expect(runPrintExtract({ unit, snapshot: snap }, { port })).rejects.toThrow("上游 502");
    });
});

describe("印花提取 · 批量条目", () => {
    test("条目去重并按上限截断", () => {
        const duplicated = createPrintExtractItems([source, source]);
        expect(duplicated).toHaveLength(1);
        const many = createPrintExtractItems(Array.from({ length: 30 }, (_, index) => ({ ...source, assetId: `a-${index}` })));
        expect(many).toHaveLength(PRINT_EXTRACT_SOURCE_LIMITS.maxBatch);
    });

    test("换图/重试会清掉上一次结果，成功才写入地址", () => {
        const [item] = createPrintExtractItems([source]);
        const done = applyPrintExtractItemResult(item, { status: "succeeded", resultUrl: "https://cdn.local/print.png", snapshotHash: "h1" });
        expect(done.resultUrl).toBe("https://cdn.local/print.png");
        const failed = applyPrintExtractItemResult(done, { status: "failed", error: "boom" });
        expect(failed.status).toBe("failed");
        expect(failed.resultUrl).toBeUndefined();
        expect(failed.error).toBe("boom");
    });

    test("进度文案覆盖空/进行中/部分失败/全成功", () => {
        const items = createPrintExtractItems([source]);
        expect(describePrintExtractProgress([])).toBe("尚未上传商品图");
        expect(describePrintExtractProgress(items)).toContain("待提取");
        const running = items.map((item) => applyPrintExtractItemResult(item, { status: "running" }));
        expect(describePrintExtractProgress(running)).toContain("提取中");
        const partial = [applyPrintExtractItemResult(items[0], { status: "failed" }), applyPrintExtractItemResult(items[0], { status: "succeeded", resultUrl: "x" })];
        expect(describePrintExtractProgress(partial)).toContain("失败");
        expect(summarizePrintExtractItems(partial)).toMatchObject({ total: 2, failed: 1, succeeded: 1 });
    });

    test("下载名去掉扩展并做安全字符处理", () => {
        expect(printExtractDownloadName("shoe.png")).toBe("shoe-print.png");
        expect(printExtractDownloadName("shoe.png", 3)).toBe("shoe-print-3.png");
        expect(printExtractDownloadName("a/b:c*?.png")).toBe("a-b-c--print.png");
    });
});

describe("印花提取 · 工作台首屏真实渲染", () => {
    test("SSR 首屏出现上传/透明开关/生成/结果四大分区", async () => {
        const storage = {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
            clear: () => undefined,
            key: () => null,
            length: 0,
        };
        (globalThis as unknown as { localStorage: typeof storage }).localStorage = storage;

        const [{ createElement }, { renderToStaticMarkup }, { MemoryRouter }, workspace] = await Promise.all([
            import("react"),
            import("react-dom/server"),
            import("react-router"),
            import("@/components/tools/workspaces/extract"),
        ]);
        const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(workspace.default)));

        expect(html).toContain("print-extract-workspace");
        expect(html).toContain("商品图");
        expect(html).toContain("生成透明图");
        expect(html).toContain("立即生成");
        expect(html).toContain("提取结果");
        expect(html.length).toBeGreaterThan(4000);
    });
});
