import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ToolTask, ToolTaskResultItem, ToolTaskStatus } from "@/services/api/tools/task-machine";
import { readZip } from "@/lib/zip";

type Expectation = {
    toBe: (expected: unknown) => void;
    toEqual: (expected: unknown) => void;
    toContain: (expected: string) => void;
    toHaveLength: (expected: number) => void;
    not: { toContain: (expected: string) => void };
};

const { afterAll, describe, expect, test } = (await import("bun:test" as string)) as {
    afterAll: (fn: () => void) => void;
    describe: (name: string, fn: () => void) => void;
    expect: (actual: unknown) => Expectation;
    test: (name: string, fn: () => void | Promise<void>) => void;
};

/**
 * TASK-006 evidence (TC-008 / AC-008).
 * Repo 没有 DOM harness：组件用 react-dom/server 渲染真实 markup 断言；
 * 保存/发送链路用注入依赖验证真实分支（上传、资产入库、画布节点追加、失败原因）。
 */

const storage = new Map<string, string>();
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
    },
});
afterAll(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});

const { ToolResult, resolveToolResultView, resultItems, summarizeResultItems, buildResultFileName, nextCanvasNodePosition, assertResultPayload, saveResultItemToAssets, downloadResultItem, downloadResultItems, sendResultItemToCanvas, ToolResultActionError, parseResultActionKey, isItemPending } = await import("./tool-result");
const { TaskStatusPanel, taskStatusMeta, formatElapsed, describeTaskTiming, describeTaskNotice, TASK_STATUS_META } = await import("./task-status");
const { CapabilityNotice, evaluateToolCapabilities, canSubmitWithCapabilities, TOOL_CAPABILITY_KEYS } = await import("./capability-notice");

function render(node: ReactElement) {
    return renderToStaticMarkup(node);
}

const BASE_TASK: ToolTask = {
    id: "task-1",
    toolId: "SCALE_UP",
    status: "running",
    clientOperationId: "op-1",
    fingerprint: "fp-1",
    capability: "image",
    prompt: "放大 2 倍",
    configSnapshot: { capability: "image", model: "image-model", count: "1" },
    sourceAssetIds: [],
    createdAt: 1_000,
    updatedAt: 1_000,
    attempts: 1,
    pollCount: 0,
    transientFailures: 0,
};

function makeTask(overrides: Partial<ToolTask>): ToolTask {
    return { ...BASE_TASK, ...overrides };
}

const imageItem = { id: "item-1", kind: "image" as const, dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png" };
const videoItem = { id: "item-2", kind: "video" as const, url: "https://cdn.example.com/out.mp4", mimeType: "video/mp4" };

describe("result view mapping", () => {
    test("maps every real task status without inventing success", () => {
        const cases: Array<[ToolTaskStatus | null, string]> = [
            [null, "empty"],
            ["draft", "empty"],
            ["validating", "empty"],
            ["submitting", "running"],
            ["running", "running"],
            ["succeeded", "succeeded"],
            ["failed", "failed"],
            ["cancelled", "cancelled"],
            ["unknown", "unknown"],
        ];
        for (const [status, view] of cases) {
            expect(resolveToolResultView(status ? { status } : null)).toBe(view);
        }
    });

    test("summarizes and counts dropped payloads", () => {
        expect(summarizeResultItems([imageItem, videoItem, { id: "item-3", kind: "image", payloadDropped: true }])).toEqual({ total: 3, images: 2, videos: 1, dropped: 1 });
        expect(resultItems(makeTask({ result: { items: [imageItem], receivedAt: 1 } }))).toHaveLength(1);
        expect(resultItems(makeTask({}))).toEqual([]);
    });

    test("derives missing kind from mimeType so video results never render as images", () => {
        const legacyVideo = { id: "video-0", url: "blob:http://127.0.0.1:3000/x", storageKey: "tool-result:6x-", bytes: 2268656, mimeType: "video/mp4" } as unknown as ToolTaskResultItem;
        const derived = resultItems(makeTask({ result: { items: [legacyVideo], receivedAt: 1 } }));
        expect(derived).toHaveLength(1);
        expect(derived[0].kind).toBe("video");
        expect(derived[0].id).toBe("video-0");
        expect(derived[0].storageKey).toBe("tool-result:6x-");
        expect(summarizeResultItems(derived)).toEqual({ total: 1, images: 0, videos: 1, dropped: 0 });

        const legacyDataUrlImage = { id: "image-0", dataUrl: "data:image/webp;base64,AA" } as unknown as ToolTaskResultItem;
        expect(resultItems(makeTask({ result: { items: [legacyDataUrlImage], receivedAt: 1 } }))[0].kind).toBe("image");

        // 已带正确 kind 的项保持引用不变，避免无谓重渲染
        const same = resultItems(makeTask({ result: { items: [videoItem], receivedAt: 1 } }));
        expect(same[0]).toBe(videoItem);
    });

    test("builds file names from real mime/data URL, not a fixed guess", () => {
        expect(buildResultFileName("SCALE_UP", imageItem, 0)).toBe("scale-up-result-1.png");
        expect(buildResultFileName("SCALE_UP", videoItem, 1)).toBe("scale-up-result-2.mp4");
        expect(buildResultFileName("AI_TEXT", { kind: "image", dataUrl: "data:image/webp;base64,AA" }, 2)).toBe("ai-text-result-3.webp");
        expect(buildResultFileName("", imageItem, 0)).toBe("tool-result-1.png");
    });

    test("places new canvas nodes to the right of existing bounds", () => {
        expect(nextCanvasNodePosition([])).toEqual({ x: 320, y: 240 });
        expect(nextCanvasNodePosition([{ id: "a", type: "image", title: "a", position: { x: 100, y: 100 }, width: 300, height: 200 }])).toEqual({ x: 700, y: 200 });
    });
});

describe("task status", () => {
    test("labels every status and formats elapsed time", () => {
        for (const status of Object.keys(TASK_STATUS_META) as ToolTaskStatus[]) {
            expect(taskStatusMeta(status).label.length > 0).toBe(true);
        }
        expect(formatElapsed(8_400)).toBe("8s");
        expect(formatElapsed(65_000)).toBe("1m 05s");
        expect(formatElapsed(3_720_000)).toBe("1h 02m");
        expect(formatElapsed(Number.NaN)).toBe("—");
    });

    test("uses submittedAt and finishedAt for terminal tasks", () => {
        const running = describeTaskTiming({ status: "running", createdAt: 1_000, updatedAt: 1_000, submittedAt: 5_000, pollCount: 3 }, 15_000);
        expect(running.elapsedLabel).toBe("10s");
        expect(running.pollCount).toBe(3);
        expect(running.running).toBe(true);
        const done = describeTaskTiming({ status: "succeeded", createdAt: 1_000, updatedAt: 1_000, finishedAt: 61_000, pollCount: 0 }, 999_000);
        expect(done.elapsedLabel).toBe("1m 00s");
        expect(done.running).toBe(false);
    });

    test("warns on reconciliation and never re-labels unknown as failure", () => {
        expect(describeTaskNotice({ status: "unknown", reconcileRequired: true })?.title).toBe("需要人工确认");
        expect(describeTaskNotice({ status: "running", deduplicated: true })?.title).toBe("复用了已有任务");
        expect(describeTaskNotice({ status: "cancelled", cancelledByUser: true })?.title).toBe("你已取消");
        expect(describeTaskNotice({ status: "unknown" })?.title).toBe("上游未给出任务编号");
        expect(describeTaskNotice({ status: "running" })).toBe(null);
    });

    test("renders cancel while active, retry only for failed tasks", () => {
        const runningHtml = render(<TaskStatusPanel task={makeTask({ status: "running", submittedAt: 1_000, pollCount: 2 })} now={31_000} onCancel={() => undefined} onRetry={() => undefined} />);
        expect(runningHtml).toContain('data-testid="tool-task-cancel"');
        expect(runningHtml).not.toContain('data-testid="tool-task-retry"');
        expect(runningHtml).toContain("轮询 2 次");

        const unknownHtml = render(<TaskStatusPanel task={makeTask({ status: "unknown", reconcileRequired: true })} onCancel={() => undefined} onRetry={() => undefined} />);
        expect(unknownHtml).not.toContain('data-testid="tool-task-retry"');
        expect(unknownHtml).toContain("需要人工确认");

        const failedHtml = render(
            <TaskStatusPanel
                task={makeTask({ status: "failed", error: { code: "upstream_500", message: "上游返回 500", retryable: true } })}
                onRetry={() => undefined}
            />,
        );
        expect(failedHtml).toContain('data-testid="tool-task-retry"');
        expect(failedHtml).toContain("上游返回 500");
        expect(failedHtml).toContain("upstream_500");
    });
});

describe("capability notice", () => {
    test("rarely treats absent evidence as supported", () => {
        const evaluation = evaluateToolCapabilities([{ key: "mask" }], {});
        expect(evaluation.blocked).toBe(true);
        expect(evaluation.unverified).toEqual(["mask"]);
        expect(canSubmitWithCapabilities(evaluation)).toBe(false);
    });

    test("blocks missing required capability and gates optional degradation on acceptance", () => {
        const blocked = evaluateToolCapabilities([{ key: "referenceVideo" }], { referenceVideo: "unsupported" });
        expect(blocked.blocked).toBe(true);
        expect(blocked.issues[0].severity).toBe("blocker");

        const degradation = evaluateToolCapabilities([{ key: "duration", required: false }], { duration: "unsupported" });
        expect(degradation.blocked).toBe(false);
        expect(degradation.degradations).toEqual(["duration"]);
        expect(canSubmitWithCapabilities(degradation)).toBe(false);
        expect(canSubmitWithCapabilities(degradation, ["duration"])).toBe(true);
    });

    test("renders real evidence and the explicit degradation action", () => {
        const html = render(
            <CapabilityNotice
                requirements={[{ key: "duration", required: false }, { key: "mask" }]}
                evidence={{ duration: "unsupported", mask: "unsupported" }}
                onAcceptDegradation={() => undefined}
            />,
        );
        expect(html).toContain('data-blocked="true"');
        expect(html).toContain("局部蒙版");
        expect(html).toContain("接受降级并继续");

        const supported = render(<CapabilityNotice requirements={TOOL_CAPABILITY_KEYS.slice(0, 2).map((key) => ({ key }))} evidence={{ imageEdit: "supported", mask: "supported" }} />);
        expect(supported).toContain('data-blocked="false"');
        expect(supported).toContain("能力已核实");
    });
});

describe("ToolResult states", () => {
    test("renders an empty state before submit", () => {
        const html = render(<ToolResult />);
        expect(html).toContain('data-view="empty"');
        expect(html).toContain("还没有生成结果");
    });

    test("renders running progress with cancel wiring", () => {
        const html = render(<ToolResult task={makeTask({ status: "running", submittedAt: 1_000 })} now={21_000} onCancel={() => undefined} />);
        expect(html).toContain('data-view="running"');
        expect(html).toContain('data-testid="tool-task-cancel"');
        expect(html).toContain("20s");
    });

    test("renders real image and video results with all three save actions", () => {
        const html = render(<ToolResult task={makeTask({ status: "succeeded", result: { items: [imageItem, videoItem], receivedAt: 1 } })} toolId="SCALE_UP" />);
        expect(html).toContain('data-view="succeeded"');
        expect(html).toContain('data-testid="tool-result-image"');
        expect(html).toContain('data-testid="tool-result-video"');
        expect(html).toContain("共 2 个结果");
        for (const index of [0, 1]) {
            expect(html).toContain(`data-testid="tool-result-download-${index}"`);
            expect(html).toContain(`data-testid="tool-result-save-${index}"`);
            expect(html).toContain(`data-testid="tool-result-canvas-${index}"`);
        }
    });

    test("does not fake results when a succeeded task has no items", () => {
        const html = render(<ToolResult task={makeTask({ status: "succeeded", result: { items: [], receivedAt: 1 } })} />);
        expect(html).toContain('data-testid="tool-result-empty-payload"');
        expect(html).toContain("不会用占位内容冒充结果");
        expect(html).not.toContain('data-testid="tool-result-image"');
    });

    test("disables save actions for payload-stripped items and explains why", () => {
        const html = render(<ToolResult task={makeTask({ status: "succeeded", result: { items: [{ id: "item-9", kind: "image", payloadDropped: true }], receivedAt: 1 } })} />);
        expect(html).toContain('data-dropped="true"');
        expect(html).toContain("刷新后原始文件未保留");
        expect(html).toContain('disabled=""');
    });

    test("surfaces failures with diagnostics and retry", () => {
        const html = render(
            <ToolResult task={makeTask({ status: "failed", error: { code: "timeout", message: "轮询超时", retryable: true } })} onRetry={() => undefined} />,
        );
        expect(html).toContain('data-view="failed"');
        expect(html).toContain("轮询超时");
        expect(html).toContain('data-testid="tool-task-retry"');
        expect(html).not.toContain('data-testid="tool-result-image"');
    });

    test("多结果时给出「全部下载」，单结果/全丢图时不给", () => {
        const multi = render(<ToolResult task={makeTask({ status: "succeeded", result: { items: [imageItem, imageItem, videoItem], receivedAt: 1 } })} toolId="AI_OUTPAINTING" />);
        expect(multi).toContain('data-testid="tool-result-download-all"');
        expect(multi).toContain("全部下载（3）");

        const single = render(<ToolResult task={makeTask({ status: "succeeded", result: { items: [imageItem], receivedAt: 1 } })} toolId="AI_OUTPAINTING" />);
        expect(single).not.toContain('data-testid="tool-result-download-all"');

        const droppedAll = render(
            <ToolResult
                task={makeTask({
                    status: "succeeded",
                    result: { items: [{ id: "a", kind: "image", payloadDropped: true }, { id: "b", kind: "image", payloadDropped: true }], receivedAt: 1 },
                })}
                toolId="AI_OUTPAINTING"
            />,
        );
        expect(droppedAll).not.toContain('data-testid="tool-result-download-all"');
    });

    test("只有传入 onRetryItem 才渲染单张重试，且按钮文案说明只重试这一张", () => {
        const without = render(<ToolResult task={makeTask({ status: "succeeded", result: { items: [imageItem, videoItem], receivedAt: 1 } })} toolId="AI_OUTPAINTING" />);
        expect(without).not.toContain('data-testid="tool-result-retry-0"');

        const withRetry = render(
            <ToolResult
                task={makeTask({ status: "succeeded", result: { items: [imageItem, videoItem], receivedAt: 1 } })}
                toolId="AI_OUTPAINTING"
                onRetryItem={() => undefined}
                retryItemHint="只重试这一张：会再向上游发起 1 次生成"
            />,
        );
        expect(withRetry).toContain('data-testid="tool-result-retry-0"');
        expect(withRetry).toContain('data-testid="tool-result-retry-1"');
        expect(withRetry).toContain("重试这张");
        expect(withRetry).toContain("只重试这一张");
    });
});

async function expectRejects(fn: () => Promise<unknown>, reason: string) {
    let error: unknown;
    try {
        await fn();
    } catch (caught) {
        error = caught;
    }
    expect(error instanceof ToolResultActionError).toBe(true);
    expect((error as InstanceType<typeof ToolResultActionError>).reason).toBe(reason);
}

describe("real result actions", () => {
    test("downloads through the injected saver with a derived filename", async () => {
        const saved: Array<{ data: unknown; name: string }> = [];
        const name = await downloadResultItem(imageItem, 0, { toolId: "SCALE_UP", deps: { saveAs: (data, fileName) => saved.push({ data, name: fileName }) } });
        expect(name).toBe("scale-up-result-1.png");
        expect(saved[0].name).toBe("scale-up-result-1.png");
        expect(saved[0].data).toBe(imageItem.dataUrl);
    });

    test("多张结果打成一次 ZIP 下载（避免浏览器拦截第 2 个下载），按原下标命名，坏项只跳过不伪造文件", async () => {
        const saved: Array<{ name: string; data: unknown }> = [];
        const batch = await downloadResultItems(
            [imageItem, { id: "bad", kind: "image", payloadDropped: true }, { ...imageItem, id: "item-3" }],
            {
                toolId: "AI_OUTPAINTING",
                deps: {
                    saveAs: (data, fileName) => saved.push({ name: fileName, data }),
                },
            },
        );
        // 只发出一次下载动作 —— 这正是修复点：三次 saveAs 会被浏览器拦掉后两个
        expect(saved.length).toBe(1);
        expect(batch.mode).toBe("zip");
        expect(batch.fileName).toBe(saved[0].name);
        expect(saved[0].name).toBe("ai-outpainting-results-2.zip");
        expect(batch.downloaded).toEqual(["ai-outpainting-result-1.png", "ai-outpainting-result-3.png"]);
        expect(batch.skipped.length).toBe(1);
        expect(batch.skipped[0].index).toBe(1);

        // ZIP 里是真的两个文件，不是空壳
        const entries = await readZip(saved[0].data as Blob);
        expect(entries.size).toBe(2);
        expect(entries.has("ai-outpainting-result-1.png")).toBe(true);
        expect(entries.has("ai-outpainting-result-3.png")).toBe(true);
    });

    test("只有一张结果时不打包，直接单文件下载", async () => {
        const saved: Array<{ name: string }> = [];
        const batch = await downloadResultItems([imageItem], {
            toolId: "AI_OUTPAINTING",
            deps: { saveAs: (_data, fileName) => saved.push({ name: fileName }) },
        });
        expect(batch.mode).toBe("single");
        expect(saved.map((entry) => entry.name)).toEqual(["ai-outpainting-result-1.png"]);
    });

    test("saves an image into the asset library with real storage keys", async () => {
        let captured: Record<string, unknown> | undefined;
        const stored = { url: "blob:stored-image", storageKey: "image:42", width: 1024, height: 768, bytes: 2048, mimeType: "image/png" };
        const result = await saveResultItemToAssets(imageItem, 0, {
            toolId: "SCALE_UP",
            taskId: "task-1",
            deps: {
                uploadImage: async (input) => {
                    expect(input).toBe(imageItem.dataUrl);
                    return stored;
                },
                addAsset: (asset) => {
                    captured = asset as unknown as Record<string, unknown>;
                    return "asset-42";
                },
            },
        });
        expect(result).toEqual({ assetId: "asset-42", kind: "image" });
        expect((captured as { kind: string }).kind).toBe("image");
        expect((captured as { data: { storageKey: string } }).data.storageKey).toBe("image:42");
        expect((captured as { metadata: { taskId: string } }).metadata.taskId).toBe("task-1");
    });

    test("stores video bytes before creating a video asset", async () => {
        let storedInput: { blob?: Blob; url?: string } | undefined;
        const result = await saveResultItemToAssets(videoItem, 1, {
            toolId: "IMAGE_TO_VIDEO",
            deps: {
                storeVideo: async (input) => {
                    storedInput = input;
                    return { url: "blob:video", storageKey: "video:7", bytes: 999, mimeType: "video/mp4", width: 1080, height: 1920 };
                },
                addAsset: (asset) => (asset.kind === "video" ? "asset-video" : "wrong"),
            },
        });
        expect(result).toEqual({ assetId: "asset-video", kind: "video" });
        expect(storedInput?.url).toBe(videoItem.url);
    });

    test("refuses to save stripped payloads instead of faking success", async () => {
        await expectRejects(() => saveResultItemToAssets({ id: "x", kind: "image", payloadDropped: true }, 0, { toolId: "SCALE_UP" }), "payload-dropped");
        await expectRejects(() => saveResultItemToAssets({ id: "y", kind: "video" }, 0, { toolId: "SCALE_UP" }), "payload-missing");
        assertResultPayload(imageItem);
    });

    test("appends a real node to the chosen canvas project", async () => {
        const project = { id: "project-1", nodes: [] as Array<{ id: string; type: string; title: string; position: { x: number; y: number }; width: number; height: number }> };
        let updated: { projectId: string; nodes: unknown[] } | undefined;
        const result = await sendResultItemToCanvas(imageItem, {
            toolId: "SCALE_UP",
            projectId: "project-1",
            deps: {
                findProject: (id) => (id === "project-1" ? project : undefined),
                updateProject: (projectId, nodes) => {
                    project.nodes = nodes;
                    updated = { projectId, nodes };
                },
                createProject: () => "unused",
                uploadImage: async () => ({ url: "blob:canvas-image", storageKey: "image:9", width: 512, height: 512, bytes: 10, mimeType: "image/png" }),
                storeVideo: async () => ({ url: "blob:canvas-video", storageKey: "video:9", bytes: 10, mimeType: "video/mp4" }),
                createNode: (type, position) => ({ id: "node-9", type, title: "结果", position, width: 320, height: 320 }),
                imageMetadata: () => ({ content: "blob:canvas-image", storageKey: "image:9", naturalWidth: 512, naturalHeight: 512 }),
                videoMetadata: () => ({ content: "blob:canvas-video" }),
            },
        });
        expect(result).toEqual({ projectId: "project-1", nodeId: "node-9" });
        expect(updated?.nodes).toHaveLength(1);
        expect(project.nodes[0].type).toBe("image");
        expect(project.nodes[0].position).toEqual({ x: 320, y: 240 });
    });

    test("creates a project when none is chosen and rejects unknown projects", async () => {
        let created = "";
        const result = await sendResultItemToCanvas(videoItem, {
            toolId: "IMAGE_TO_VIDEO",
            deps: {
                findProject: () => undefined,
                createProject: (title) => {
                    created = title ?? "";
                    return "project-new";
                },
                updateProject: () => undefined,
                uploadImage: async () => ({ url: "x", storageKey: "s", width: 1, height: 1, bytes: 1, mimeType: "image/png" }),
                storeVideo: async () => ({ url: "blob:v", storageKey: "video:1", bytes: 1, mimeType: "video/mp4" }),
                createNode: (type, position) => ({ id: "node-new", type, title: "结果", position, width: 100, height: 100 }),
                imageMetadata: () => ({}),
                videoMetadata: () => ({}),
            },
        });
        expect(result.projectId).toBe("project-new");
        expect(created).toBe("IMAGE_TO_VIDEO 结果");

        await expectRejects(
            () =>
                sendResultItemToCanvas(imageItem, {
                    toolId: "SCALE_UP",
                    projectId: "missing",
                    deps: { findProject: () => undefined },
                }),
            "project-not-found",
        );
    });
});

describe("单卡 busy 解析", () => {
    test("按下标精确命中，retry-10 不再串到第 0 张", () => {
        expect(parseResultActionKey("retry-10")).toEqual({ action: "retry", index: 10 });
        expect(isItemPending("retry-10", 10)).toBe(true);
        expect(isItemPending("retry-10", 0)).toBe(false);
        expect(isItemPending("retry-10", 1)).toBe(false);
        expect(isItemPending("download-all", 0)).toBe(false);
        expect(isItemPending(null, 0)).toBe(false);
        expect(parseResultActionKey("download-all")).toBe(null);
        expect(parseResultActionKey("save-")).toBe(null);
    });
});
