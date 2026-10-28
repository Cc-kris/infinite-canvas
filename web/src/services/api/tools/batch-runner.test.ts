/**
 * TASK-007 单测：预检 / 并发上限 / 部分成功 / 单行重试 / 报告导出。
 *
 * 编排层用注入网关验证并发与状态语义；最后一组用真实 `ToolTaskGateway` + 桩 provider，
 * 走真实的 submit/失败判定路径（provider 只是不联网的传输层，不返回假结果）。
 * 运行：cd web && bun test src/services/api/tools/batch-runner.test.ts
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { AiConfig } from "../../../stores/use-config-store";
import type { BatchGatewayPort, BatchRowInput, BatchRowOutcome, BatchRunRequest } from "./batch-runner";
import type { ProviderPort } from "./gateway";
import type { ToolTask } from "./task-machine";

/**
 * gateway → use-config-store → i18n 在模块期读 localStorage，而 bun test 没有 DOM。
 * 这里给最小实现后再动态 import，保证被测试的是真实网关代码而不是替身。
 */
const memoryKv = new Map<string, string>();
const localStorageStub = {
    getItem: (key: string) => memoryKv.get(key) ?? null,
    setItem: (key: string, value: string) => {
        memoryKv.set(key, String(value));
    },
    removeItem: (key: string) => {
        memoryKv.delete(key);
    },
    clear: () => memoryKv.clear(),
    key: (index: number) => [...memoryKv.keys()][index] ?? null,
    get length() {
        return memoryKv.size;
    },
};
// 别的测试文件可能已用 defineProperty 装了一个只读的 localStorage，直接赋值会抛错，
// 所以这里用同样可配置的 defineProperty 覆盖，保证本文件独立可跑。
Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: localStorageStub });

const {
    BATCH_CONCURRENCY_DEFAULT,
    BATCH_CONCURRENCY_MAX,
    buildBatchReport,
    buildRowBrowserInput,
    clampBatchConcurrency,
    hashBatchRowContent,
    isBatchCapableTool,
    preflightBatch,
    reportToCsv,
    retryBatchRows,
    runBatch,
    selectRetryableRowIds,
    serializeBatchReport,
    summarizeBatchOutcomes,
} = await import("./batch-runner");
const { BATCH_TOOL_IDS, getToolById } = await import("../../../features/tools/registry");
const { ToolTaskGateway, createMemoryTaskStore } = await import("./gateway");

/* ----------------------------- fixtures ----------------------------- */

/** 与 store 的 defaultConfig 同形状；这里显式写死，避免测试加载 i18n（它会在模块期读 localStorage）。 */
const baseConfig: AiConfig = {
    channelMode: "local",
    baseUrl: "https://api.openai.com",
    apiKey: "test-key",
    apiFormat: "openai",
    channels: [
        {
            id: "default",
            name: "default",
            baseUrl: "https://api.openai.com",
            apiKey: "test-key",
            apiFormat: "openai",
            models: [
                { name: "test-image-model", capability: "image" },
                { name: "test-video-model", capability: "video" },
            ],
        },
    ],
    model: "test-image-model",
    imageModel: "test-image-model",
    videoModel: "test-video-model",
    textModel: "test-text-model",
    audioModel: "test-audio-model",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    videoMode: "frames",
    systemPrompt: "",
    reasoningEffort: "auto",
    models: ["test-image-model", "test-video-model"],
    quality: "auto",
    size: "1:1",
    background: "",
    count: "1",
    canvasImageCount: "3",
    proxyEnabled: false,
    proxyUrl: "",
    nodeRegenerateBehavior: "new-node",
    autoFocusOnSelect: false,
};

const config = (patch: Partial<AiConfig> = {}): AiConfig => ({ ...baseConfig, ...patch });

const reference = (id: string) => ({ id, name: `${id}.png`, type: "image/png", dataUrl: `data:image/png;base64,${id}` });

const row = (id: string, prompt: string, extra: Partial<BatchRowInput> = {}): BatchRowInput => ({
    id,
    label: id,
    prompt,
    references: [reference(`${id}-ref`)],
    ...extra,
});

const request = (rows: BatchRowInput[], patch: Partial<BatchRunRequest> = {}): BatchRunRequest => ({
    batchId: "batch_test",
    toolId: "PRODUCT_IMAGE_SUITE",
    rows,
    concurrency: 3,
    ...patch,
});

function task(patch: Partial<ToolTask> & { id: string; status: ToolTask["status"] }): ToolTask {
    const at = 1_700_000_000_000;
    return {
        toolId: "PRODUCT_IMAGE_SUITE",
        clientOperationId: `op-${patch.id}`,
        fingerprint: `fp-${patch.id}`,
        capability: "image",
        prompt: "p",
        configSnapshot: { capability: "image", model: "m", apiFormat: "openai", count: "1" },
        sourceAssetIds: [],
        createdAt: at,
        updatedAt: at,
        attempts: 1,
        pollCount: 0,
        transientFailures: 0,
        ...patch,
    };
}

type Call = { input: { toolId: string; prompt?: string }; mode: "run" | "retry"; taskId?: string };

function scriptedGateway(script: (input: { prompt?: string }, index: number) => ToolTask | Error): {
    port: BatchGatewayPort;
    calls: Call[];
    inFlight: () => number;
    maxInFlight: () => number;
} {
    const calls: Call[] = [];
    const failed: ToolTask[] = [];
    let inFlight = 0;
    let peak = 0;
    const port: BatchGatewayPort = {
        runTool: async (input) => {
            const index = calls.length;
            calls.push({ input, mode: "run" });
            inFlight += 1;
            peak = Math.max(peak, inFlight);
            await Bun.sleep(5);
            try {
                const result = script(input, index);
                if (result instanceof Error) {
                    // 真实网关在抛错前会把失败任务落库；这里同样留痕，供 findTask 找回。
                    failed.push(task({ id: `t-${input.prompt}`, status: "failed", updatedAt: Date.now(), error: { code: "provider-error", message: result.message, retryable: true } }));
                    throw result;
                }
                return result;
            } finally {
                inFlight -= 1;
            }
        },
        retry: async (taskId, input) => {
            calls.push({ input, mode: "retry", taskId });
            await Bun.sleep(5);
            const result = script(input, calls.length - 1);
            if (result instanceof Error) throw result;
            return result;
        },
        getTask: (taskId) => failed.find((item) => item.id === taskId),
        findTask: ({ toolId, since }) => [...failed].filter((item) => item.toolId === toolId && item.updatedAt >= since).sort((a, b) => b.updatedAt - a.updatedAt)[0],
    };
    return { port, calls, inFlight: () => inFlight, maxInFlight: () => peak };
}

/* ------------------------- registry / 常量 ------------------------- */

test("batch tool set matches tool_specs.json batchReferences", () => {
    const specPath = join(import.meta.dir, "../../../../../docs/V1.0/plan_linkfox_navigation/tool_specs.json");
    const spec = JSON.parse(readFileSync(specPath, "utf8")) as { batchReferences: string[] };
    expect([...BATCH_TOOL_IDS].sort()).toEqual([...spec.batchReferences].sort());
    for (const id of BATCH_TOOL_IDS) expect(getToolById(id)).toBeDefined();
    expect(isBatchCapableTool("PRODUCT_IMAGE_SUITE")).toBe(true);
    expect(isBatchCapableTool("CHANGE_COLOR_V2")).toBe(false);
});

test("concurrency is clamped to 1..5 with default 3", () => {
    expect(clampBatchConcurrency(undefined)).toBe(BATCH_CONCURRENCY_DEFAULT);
    expect(clampBatchConcurrency(0)).toBe(1);
    expect(clampBatchConcurrency(-4)).toBe(1);
    expect(clampBatchConcurrency(2.9)).toBe(2);
    expect(clampBatchConcurrency(9)).toBe(BATCH_CONCURRENCY_MAX);
    expect(clampBatchConcurrency(Number.NaN)).toBe(BATCH_CONCURRENCY_DEFAULT);
});

/* ------------------------------ 预检 ------------------------------ */

test("preflight blocks unknown tool, non-batch tool and missing model", () => {
    const unknown = preflightBatch(request([row("r1", "a")], { toolId: "NOPE_TOOL" }), { config: config() });
    expect(unknown.ok).toBe(false);
    expect(unknown.issues.map((issue) => issue.code)).toContain("unknown-tool");
    expect(unknown.totals.runnable).toBe(0);

    const nonBatch = preflightBatch(request([row("r1", "a")], { toolId: "CHANGE_COLOR_V2" }), { config: config() });
    expect(nonBatch.ok).toBe(false);
    expect(nonBatch.issues.map((issue) => issue.code)).toContain("tool-not-batch-capable");

    const noModel = preflightBatch(request([row("r1", "a")]), { config: config({ imageModel: "", model: "" }) });
    expect(noModel.ok).toBe(false);
    expect(noModel.issues.map((issue) => issue.code)).toContain("image-model-required");
});

test("preflight uses the real adapter for row validation", () => {
    const result = preflightBatch(
        request([
            row("ok", "make a scene"),
            { id: "no-ref", label: "no-ref", prompt: "make a scene" },
            { id: "no-prompt", label: "no-prompt", prompt: "   ", references: [reference("x")] },
        ]),
        { config: config() },
    );
    expect(result.ok).toBe(true); // 行级问题不阻断整批，只阻断该行
    expect(result.rows.ok?.runnable).toBe(true);
    expect(result.rows["no-ref"]?.runnable).toBe(false);
    expect(result.rows["no-ref"]?.issues.map((issue) => issue.code)).toContain("references-required");
    expect(result.rows["no-prompt"]?.issues.map((issue) => issue.code)).toContain("prompt-required");
    expect(result.totals).toEqual({ rows: 3, runnable: 1, blocked: 2, skipped: 0 });
});

test("preflight hints duplicate rows without deduplicating", () => {
    const shared = [reference("shared")];
    const result = preflightBatch(
        request([row("a", "same prompt", { references: shared }), row("b", "same prompt", { references: shared }), row("c", "other prompt", { references: shared })]),
        { config: config() },
    );
    expect(result.duplicateGroups).toEqual([["a", "b"]]);
    expect(result.rows.a?.duplicates).toEqual(["b"]);
    expect(result.rows.a?.issues.some((issue) => issue.code === "duplicate-content" && issue.severity === "warning")).toBe(true);
    expect(result.rows.a?.runnable).toBe(true);
    expect(result.rows.b?.runnable).toBe(true);
    expect(hashBatchRowContent(request([row("a", "x")]), row("a", "x"))).not.toBe(hashBatchRowContent(request([row("a", "x")]), row("a", "y")));
});

test("preflight marks disabled rows as skipped and merges shared fields", () => {
    const req = request([row("a", "go", { enabled: false }), row("b", "go", { fields: { outputNum: 2 } })], { sharedFields: { aspectRatio: "1:1", outputNum: 1 } });
    const result = preflightBatch(req, { config: config() });
    expect(result.rows.a?.runnable).toBe(false);
    expect(result.rows.a?.issues.some((issue) => issue.code === "row-disabled")).toBe(true);
    expect(result.totals.skipped).toBe(1);
    const input = buildRowBrowserInput(req, req.rows[1] as BatchRowInput);
    expect(input.fields).toEqual({ aspectRatio: "1:1", outputNum: 2 });
});

/* --------------------------- 并发 / 部分成功 --------------------------- */

test("runBatch respects the concurrency ceiling and default", async () => {
    const rows = Array.from({ length: 7 }, (_, index) => row(`r${index}`, `prompt ${index}`));
    const req = request(rows, { concurrency: 3 });
    const pre = preflightBatch(req, { config: config() });
    const gate = scriptedGateway((input) => task({ id: `t-${input.prompt}`, status: "succeeded", result: { items: [{ id: "i", kind: "image", dataUrl: "data:image/png;base64,x" }], receivedAt: 1 } }));

    const result = await runBatch(req, pre, { gateway: gate.port });
    expect(result.summary.succeeded).toBe(7);
    expect(gate.maxInFlight()).toBe(3);
    expect(gate.calls).toHaveLength(7);
    expect(result.concurrency).toBe(3);

    const defaults = await runBatch(request(rows, { concurrency: undefined }), pre, { gateway: gate.port });
    expect(defaults.concurrency).toBe(3);

    const clamped = await runBatch(request(rows, { concurrency: 99 }), pre, { gateway: gate.port });
    expect(clamped.concurrency).toBe(5);
});

test("runBatch keeps partial success and never throws for failed rows", async () => {
    const req = request([row("a", "ok-1"), row("b", "boom"), row("c", "ok-2"), { id: "d", label: "d", prompt: "missing ref" }]);
    const pre = preflightBatch(req, { config: config() });
    const gate = scriptedGateway((input) => {
        if (input.prompt === "boom") return new Error("upstream 500");
        return task({ id: `t-${input.prompt}`, status: "succeeded", result: { items: [{ id: "i", kind: "image", dataUrl: "data:image/png;base64,x" }], receivedAt: 1 } });
    });

    const result = await runBatch(req, pre, { gateway: gate.port });
    expect(result.outcomes.map((outcome) => outcome.rowId)).toEqual(["a", "b", "c", "d"]);
    expect(result.outcomes.map((outcome) => outcome.status)).toEqual(["succeeded", "failed", "succeeded", "skipped"]);
    expect(result.summary).toEqual({ total: 4, succeeded: 2, failed: 1, unknown: 0, cancelled: 0, skipped: 1, running: 0 });
    expect(result.outcomes[1]?.error?.message).toContain("upstream 500");
    expect(gate.calls.map((call) => call.input.prompt)).toEqual(["ok-1", "boom", "ok-2"]);
});

test("unknown is reported separately from failed", async () => {
    const req = request([row("u", "unknown")]);
    const pre = preflightBatch(req, { config: config() });
    const gate = scriptedGateway(() => task({ id: "t-unknown", status: "unknown", reconcileRequired: true, error: { code: "task-timeout", message: "exceeded", retryable: true } }));
    const result = await runBatch(req, pre, { gateway: gate.port });
    expect(result.outcomes[0]?.status).toBe("unknown");
    expect(result.summary.unknown).toBe(1);
    expect(result.summary.failed).toBe(0);
    expect(selectRetryableRowIds(result.outcomes)).toEqual(["u"]);
});

test("abort cancels remaining rows instead of failing them", async () => {
    const controller = new AbortController();
    const req = request(Array.from({ length: 6 }, (_, index) => row(`r${index}`, `p${index}`)), { concurrency: 2 });
    const pre = preflightBatch(req, { config: config() });
    const gate = scriptedGateway(() => {
        controller.abort();
        return task({ id: "t", status: "succeeded" });
    });
    const result = await runBatch(req, pre, { gateway: gate.port, signal: controller.signal });
    expect(result.aborted).toBe(true);
    expect(result.summary.cancelled).toBeGreaterThan(0);
    expect(result.summary.failed).toBe(0);
});

/* ------------------------------ 单行重试 ------------------------------ */

test("retry re-runs only failed rows through gateway.retry", async () => {
    const req = request([row("a", "ok"), row("b", "fail"), row("c", "ok-2")]);
    const pre = preflightBatch(req, { config: config() });
    let attempt = 0;
    const gate = scriptedGateway((input) => {
        attempt += 1;
        if (input.prompt === "fail" && attempt === 2) return new Error("first attempt 500");
        return task({
            id: `t-${input.prompt}`,
            status: "succeeded",
            ...(input.prompt === "fail" ? { attempts: 2 } : {}),
            result: { items: [{ id: "i", kind: "image", dataUrl: "data:image/png;base64,x" }], receivedAt: 1 },
        });
    });

    const first = await runBatch(req, pre, { gateway: gate.port });
    expect(first.summary.failed).toBe(1);
    const failedOutcome = first.outcomes.find((outcome) => outcome.rowId === "b") as BatchRowOutcome;
    expect(failedOutcome.taskId).toBe("t-fail");

    const succeededSnapshot = first.outcomes.find((outcome) => outcome.rowId === "a");
    const retried = await retryBatchRows(req, pre, first.outcomes, selectRetryableRowIds(first.outcomes), { gateway: gate.port });

    expect(retried.retried).toEqual(["b"]);
    expect(retried.outcomes.find((outcome) => outcome.rowId === "a")).toEqual(succeededSnapshot);
    expect(retried.outcomes.find((outcome) => outcome.rowId === "b")?.status).toBe("succeeded");
    expect(retried.summary).toMatchObject({ succeeded: 3, failed: 0 });
    const retryCalls = gate.calls.filter((call) => call.mode === "retry");
    expect(retryCalls).toHaveLength(1);
    expect(retryCalls[0]?.taskId).toBe("t-fail");
    expect(retryCalls[0]?.input.prompt).toBe("fail");
});

test("retry refuses succeeded rows and skips rows without previous outcome", async () => {
    const req = request([row("a", "ok")]);
    const pre = preflightBatch(req, { config: config() });
    const gate = scriptedGateway(() => task({ id: "t", status: "succeeded" }));
    const run = await runBatch(req, pre, { gateway: gate.port });
    const callsBefore = gate.calls.length;
    const retried = await retryBatchRows(req, pre, run.outcomes, ["a", "missing"], { gateway: gate.port });
    expect(retried.retried).toEqual([]);
    expect(gate.calls.length).toBe(callsBefore);
    expect(retried.summary.succeeded).toBe(1);
});

/* ------------------------------ 报告导出 ------------------------------ */

test("report contains every row and exports csv/json safely", async () => {
    const req = request([row("a", 'ok, "quoted"'), row("b", "boom", { label: "=cmd" })]);
    const pre = preflightBatch(req, { config: config() });
    const gate = scriptedGateway((input) => {
        if (input.prompt === "boom") return new Error("bad\nline");
        return task({ id: "t-a", status: "succeeded", result: { items: [{ id: "i", kind: "image", url: "https://cdn.example.com/a.png" }], receivedAt: 1 } });
    });
    const run = await runBatch(req, pre, { gateway: gate.port });
    const report = buildBatchReport({ request: req, preflight: pre, outcomes: run.outcomes, startedAt: run.startedAt, finishedAt: run.finishedAt });
    expect(report.rows).toHaveLength(2);
    expect(report.rows[0]?.resultUrls).toEqual(["https://cdn.example.com/a.png"]);
    expect(report.summary).toMatchObject({ succeeded: 1, failed: 1 });

    const csv = serializeBatchReport(report, "csv");
    expect(csv.filename.endsWith(".csv")).toBe(true);
    expect(csv.content.split("\n")[0]).toContain("row_id");
    expect(csv.content).toContain("'=cmd"); // 公式注入防护
    expect(csv.content).toContain('"ok, ""quoted"""');
    expect(csv.content.split("\n").length).toBeGreaterThanOrEqual(3);

    const json = serializeBatchReport(report, "json");
    const parsedReport = JSON.parse(json.content) as { rows: Array<{ status: string }>; summary: { failed: number } };
    expect(parsedReport.summary.failed).toBe(1);
    expect(parsedReport.rows.map((item) => item.status)).toEqual(["succeeded", "failed"]);
    expect(reportToCsv(report)).toBe(csv.content);
    expect(summarizeBatchOutcomes(run.outcomes)).toEqual(run.summary);
});

/* --------------------- 真实网关（不联网传输层） --------------------- */

function providerStub(): ProviderPort & { generateCalls: string[]; editCalls: string[] } {
    const generateCalls: string[] = [];
    const editCalls: string[] = [];
    return {
        generateCalls,
        editCalls,
        async generateImage(_config, prompt) {
            generateCalls.push(prompt);
            if (prompt.includes("boom")) return [];
            return [{ id: `img-${generateCalls.length}`, dataUrl: "data:image/png;base64,ZmFrZQ==" }];
        },
        async editImage(_config, prompt) {
            editCalls.push(prompt);
            if (prompt.includes("boom")) return [];
            return [{ id: `edit-${editCalls.length}`, dataUrl: "data:image/png;base64,ZmFrZQ==" }];
        },
        async createVideoTask() {
            throw new Error("video not used in this test");
        },
        async pollVideoTask() {
            throw new Error("video not used in this test");
        },
    };
}

test("batch runs through the real ToolTaskGateway with per-row submits", async () => {
    const provider = providerStub();
    const gateway = new ToolTaskGateway({ getConfig: () => config(), provider, store: createMemoryTaskStore() });
    const rows = [row("a", "nice scene"), row("b", "boom"), row("c", "nice scene")];
    const req = request(rows);
    const pre = preflightBatch(req, { config: config() });
    const result = await runBatch(req, pre, { gateway });

    expect(result.summary).toMatchObject({ succeeded: 2, failed: 1, skipped: 0 });
    // 相同内容的两行都各发了一次真实编辑请求：批量只提示重复，不自动去重。
    expect(provider.editCalls).toEqual(["nice scene", "boom", "nice scene"]);
    const failed = result.outcomes.find((outcome) => outcome.rowId === "b");
    expect(failed?.error?.code).toBe("empty-image-result");
    expect(gateway.listTasks().filter((item) => item.status === "succeeded")).toHaveLength(2);

    const retryTarget = result.outcomes.find((outcome) => outcome.rowId === "b") as BatchRowOutcome;
    expect(retryTarget.error?.retryable).toBe(true);
});

test("preflight is not ok when every row is blocked by its own inputs", () => {
    const req = request([row("a", "x", { references: [] }), row("b", "y", { references: [] })], { toolId: "PRODUCT_IMAGE_SUITE" });
    const result = preflightBatch(req, { config: config() });
    expect(result.rows.a?.runnable).toBe(false);
    expect(result.totals.runnable).toBe(0);
    expect(result.totals.blocked).toBe(2);
    // 一行都跑不了时不能显示“可执行”
    expect(result.ok).toBe(false);
});

test("preflight blocks video tools without a video model", () => {
    const req = request([row("v", "animate this")], { toolId: "IMAGE_TO_VIDEO" });
    const result = preflightBatch(req, { config: config({ videoModel: "", model: "" }) });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("video-model-required");
    expect(result.totals.runnable).toBe(0);
});
