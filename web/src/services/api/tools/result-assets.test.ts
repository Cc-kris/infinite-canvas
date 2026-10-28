/**
 * TASK-048 单测：能力门禁 / 过期判定 / 幂等入库 / 真实失败路径 / 批量并发与部分成功 / 撤销 / 发送画布。
 * 运行：cd web && bun test src/services/api/tools/result-assets.test.ts
 *
 * 全部依赖注入（uploadImage/storeMedia/asset store/canvas store 都是假的），因此断言的是本文件的真实分支：
 * 0 字节、拉取失败、找不到画布、失败后不写库/不建节点，都不是靠“成功演示”通过。
 */
import { describe, expect, test } from "bun:test";

import type { CanvasNodeData, CanvasNodeMetadata, Position } from "@/types/canvas";
import type { UploadedFile } from "@/services/file-storage";
import type { UploadedImage } from "@/services/image-storage";
import type { Asset, AssetUpsertResult } from "@/stores/use-asset-store";

import {
    ResultAssetError,
    createResultAssetActions,
    describeResultError,
    hasResultPayload,
    ingestResultAsset,
    ingestResultBatch,
    nextResultNodePosition,
    resolveResultKind,
    resultAssetKey,
    resultCapability,
    resultStaleness,
    sendResultToCanvas,
    undoResultAction,
    type ResultAssetDeps,
    type ResultCanvasDeps,
    type ResultItem,
} from "./result-assets";

/* ------------------------------------------------------------------ 假依赖 */

type Store = { assets: Asset[] };

function fakeAssetDeps(store: Store, overrides: Partial<ResultAssetDeps> = {}) {
    const calls = { uploads: 0, upserts: 0, removed: [] as string[][], restored: [] as Asset[] };
    const deps: ResultAssetDeps = {
        uploadImage: async (input: string): Promise<UploadedImage> => {
            calls.uploads += 1;
            return { url: "blob:image-1", storageKey: "image:1", width: 1024, height: 1024, bytes: 2048, mimeType: "image/png" };
        },
        storeMedia: async (input, prefix, options): Promise<UploadedFile> => {
            calls.uploads += 1;
            return { url: "blob:video-1", storageKey: "video:1", width: 720, height: 1280, bytes: 4096, mimeType: options?.mimeType ?? "video/mp4", durationMs: 3200 };
        },
        findAssetByKey: (key) => store.assets.find((asset) => asset.metadata?.resultAssetKey === key),
        upsertAsset: (asset, options): AssetUpsertResult => {
            calls.upserts += 1;
            const existing = options?.key ? store.assets.find((item) => item.metadata?.resultAssetKey === options.key) : undefined;
            if (!existing) {
                const created = { ...asset, id: `asset-${calls.upserts}`, createdAt: "2026-10-28T00:00:00.000Z", updatedAt: "2026-10-28T00:00:00.000Z", revision: 1 } as Asset;
                store.assets.unshift(created);
                return { id: created.id, created: true, revision: 1 };
            }
            const next = { ...existing, ...asset, id: existing.id, revision: (existing.revision ?? 1) + 1, updatedAt: "2026-10-28T00:00:01.000Z" } as Asset;
            store.assets = store.assets.map((item) => (item.id === existing.id ? next : item));
            return { id: existing.id, created: false, revision: next.revision ?? 1 };
        },
        replaceAsset: (asset) => {
            calls.restored.push(asset);
            store.assets = store.assets.map((item) => (item.id === asset.id ? asset : item));
        },
        removeAssets: (ids) => {
            calls.removed.push([...ids]);
            store.assets = store.assets.filter((asset) => !ids.includes(asset.id));
        },
        ...overrides,
    };
    return { deps, calls };
}

type CanvasState = { projects: { id: string; nodes: CanvasNodeData[] }[]; deleted: string[][] };

function fakeCanvasDeps(state: CanvasState, overrides: Partial<ResultCanvasDeps> = {}) {
    let sequence = 0;
    const deps: ResultCanvasDeps = {
        findProject: (projectId) => state.projects.find((project) => project.id === projectId),
        createProject: (title) => {
            const id = `project-${++sequence}`;
            state.projects.push({ id, nodes: [] });
            return id;
        },
        updateProject: (projectId, nodes) => {
            const project = state.projects.find((item) => item.id === projectId);
            if (!project) throw new Error("project missing");
            project.nodes = nodes;
        },
        removeProjects: (ids) => {
            state.deleted.push(ids);
            state.projects = state.projects.filter((project) => !ids.includes(project.id));
        },
        createNode: (type, position, metadata): CanvasNodeData => ({
            id: `${type}-node-${++sequence}`,
            type,
            title: "",
            position,
            width: 512,
            height: 512,
            metadata,
        }),
        imageMetadata: (image): CanvasNodeMetadata => ({ content: image.url, storageKey: image.storageKey, status: "success", bytes: image.bytes, mimeType: image.mimeType }),
        videoMetadata: (video): CanvasNodeMetadata => ({ content: video.url, storageKey: video.storageKey, status: "success", bytes: video.bytes, mimeType: video.mimeType, durationMs: video.durationMs }),
        ...overrides,
    };
    return deps;
}

const imageItem = (patch: Partial<ResultItem> = {}): ResultItem => ({
    id: "result-1",
    kind: "image",
    dataUrl: "data:image/png;base64,AAAA",
    mimeType: "image/png",
    bytes: 2048,
    draftRevision: 3,
    title: "主图 1",
    tags: ["主图"],
    ...patch,
});

const ctx = { toolId: "PRODUCT_IMAGE_SUITE", taskId: "task-1", draftRevision: 3, prompt: "白色背景", model: "seedream", sourceAssetIds: ["asset-src"] };

/* -------------------------------------------------------------- 纯函数层 */

describe("能力门禁与过期判定", () => {
    test("mimeType 优先于槽位：视频塞进 image 槽位也解析为 video", () => {
        expect(resolveResultKind({ kind: "image", mimeType: "video/mp4" })).toBe("video");
        expect(resolveResultKind({ kind: "video", mimeType: "image/png" })).toBe("image");
        expect(resolveResultKind({ kind: "image" })).toBe("image");
    });

    test("payload 判定覆盖 blob / dataUrl / url 三种来源", () => {
        expect(hasResultPayload({ dataUrl: "data:image/png;base64,AA" })).toBe(true);
        expect(hasResultPayload({ url: "https://cdn.example.com/a.mp4" })).toBe(true);
        expect(hasResultPayload({ blob: new Blob(["x"]) })).toBe(true);
        expect(hasResultPayload({})).toBe(false);
    });

    test("payloadDropped 同时阻断预览/下载/入库/发送画布，并给出原因", () => {
        const capability = resultCapability(imageItem({ payloadDropped: true, dataUrl: undefined, url: "https://cdn.example.com/a.png" }));
        expect(capability).toMatchObject({ preview: false, download: false, saveAsset: false, sendCanvas: false, playable: false });
        expect(capability.blockers.map((blocker) => blocker.code)).toEqual(["payload-dropped"]);
    });

    test("无 payload 时阻断且原因可读", () => {
        const capability = resultCapability(imageItem({ dataUrl: undefined, url: undefined }));
        expect(capability.saveAsset).toBe(false);
        expect(capability.blockers[0].message).toContain("结果媒体已丢失");
    });

    test("视频可播放，图片不可播放", () => {
        expect(resultCapability({ id: "v", kind: "video", url: "https://cdn/a.mp4", mimeType: "video/mp4" }).playable).toBe(true);
        expect(resultCapability(imageItem()).playable).toBe(false);
    });

    test("草稿版本不一致 => stale 且 blocker 可见，但仍可入库（供用户自查旧结果）", () => {
        const stale = resultStaleness(imageItem(), { draftRevision: 4 });
        expect(stale).toMatchObject({ stale: true, reasons: ["draft-revision-mismatch"] });
        expect(stale.message).toContain("旧版本草稿");
        const capability = resultCapability(imageItem(), { draftRevision: 4 });
        expect(capability.saveAsset).toBe(true);
        expect(capability.blockers.map((blocker) => blocker.code)).toContain("draft-revision-mismatch");
    });

    test("多个过期原因去重合并", () => {
        const stale = resultStaleness({ payloadDropped: true, stale: true, draftRevision: 2 }, { draftRevision: 5 });
        expect(stale.reasons).toEqual(["payload-dropped", "media-missing", "source-replaced", "draft-revision-mismatch"]);
    });

    test("幂等键按 toolId+taskId+resultId 稳定，换任务即换键", () => {
        expect(resultAssetKey({ id: "r1" }, { toolId: "T", taskId: "task-1" })).toBe("tool-result:T:task-1:r1");
        expect(resultAssetKey({ id: "r1" }, { toolId: "T", taskId: "task-2" })).not.toBe(resultAssetKey({ id: "r1" }, { toolId: "T", taskId: "task-1" }));
    });

    test("描述错误保留 code/retryable", () => {
        expect(describeResultError(new ResultAssetError("empty-media", "0 字节", { retryable: true }))).toEqual({ code: "empty-media", message: "0 字节", retryable: true });
        expect(describeResultError(new Error("boom")).retryable).toBe(true);
    });
});

/* ------------------------------------------------------------------ 入库 */

describe("真实入库", () => {
    test("图片入库保留全部字段并返回可撤销句柄", async () => {
        const store: Store = { assets: [] };
        const { deps } = fakeAssetDeps(store);
        const outcome = await ingestResultAsset(imageItem(), ctx, deps);

        expect(outcome).toMatchObject({ ok: true, itemId: "result-1", created: true, revision: 1, stale: false, kind: "image", storageKey: "image:1" });
        expect(outcome.undo.kind).toBe("remove-asset");

        const asset = store.assets[0] as Extract<Asset, { kind: "image" }>;
        expect(asset.kind).toBe("image");
        expect(asset.title).toBe("主图 1");
        expect(asset.tags).toEqual(["主图"]);
        expect(asset.source).toBe("PRODUCT_IMAGE_SUITE");
        expect(asset.data).toMatchObject({ storageKey: "image:1", width: 1024, height: 1024, bytes: 2048, mimeType: "image/png" });
        expect(asset.metadata).toMatchObject({
            resultAssetKey: "tool-result:PRODUCT_IMAGE_SUITE:task-1:result-1",
            resultId: "result-1",
            taskId: "task-1",
            toolId: "PRODUCT_IMAGE_SUITE",
            draftRevision: 3,
            prompt: "白色背景",
            model: "seedream",
            sourceAssetIds: ["asset-src"],
            bytes: 2048,
            width: 1024,
            height: 1024,
        });
    });

    test("视频入库写 video 资产并带时长", async () => {
        const store: Store = { assets: [] };
        const { deps } = fakeAssetDeps(store);
        const outcome = await ingestResultAsset({ id: "v1", kind: "video", url: "https://cdn.example.com/a.mp4", mimeType: "video/mp4" }, ctx, deps);
        expect(outcome.kind).toBe("video");
        const asset = store.assets[0] as Extract<Asset, { kind: "video" }>;
        expect(asset.kind).toBe("video");
        expect(asset.data).toMatchObject({ url: "blob:video-1", durationMs: 3200, mimeType: "video/mp4" });
        expect(asset.metadata?.durationMs).toBe(3200);
    });

    test("重复入库同一结果：同一条资产 revision+1，撤销恢复旧快照而不是删光", async () => {
        const store: Store = { assets: [] };
        const { deps, calls } = fakeAssetDeps(store);
        const first = await ingestResultAsset(imageItem(), ctx, deps);
        const snapshot = { ...store.assets[0] };
        const second = await ingestResultAsset(imageItem({ dataUrl: "data:image/png;base64,BBBB" }), ctx, deps);

        expect(first.created).toBe(true);
        expect(second).toMatchObject({ created: false, revision: 2, assetId: first.assetId });
        expect(store.assets).toHaveLength(1);
        expect(calls.upserts).toBe(2);
        expect(second.undo).toMatchObject({ kind: "restore-asset", asset: snapshot });

        await undoResultAction(second.undo, deps);
        expect(store.assets).toHaveLength(1);
        expect(store.assets[0]).toMatchObject({ id: snapshot.id, revision: 1 });
    });

    test("0 字节结果直接失败且绝不写库", async () => {
        const store: Store = { assets: [] };
        const { deps, calls } = fakeAssetDeps(store, {
            uploadImage: async () => ({ url: "blob:empty", storageKey: "image:empty", width: 0, height: 0, bytes: 0, mimeType: "image/png" }),
        });
        await expect(ingestResultAsset(imageItem(), ctx, deps)).rejects.toThrow(/0 字节/);
        expect(calls.upserts).toBe(0);
        expect(store.assets).toHaveLength(0);
    });

    test("上传失败 => upload-failed + retryable，且不写库", async () => {
        const store: Store = { assets: [] };
        const { deps, calls } = fakeAssetDeps(store, {
            uploadImage: async () => {
                throw new Error("HTTP 403");
            },
        });
        const error = (await ingestResultAsset(imageItem(), ctx, deps).catch((caught) => caught)) as ResultAssetError;
        expect(error.code).toBe("upload-failed");
        expect(error.retryable).toBe(true);
        expect(error.message).toContain("HTTP 403");
        expect(calls.upserts).toBe(0);
    });

    test("payload 被清理时拒绝入库（不静默落一条打不开的资产）", async () => {
        const { deps } = fakeAssetDeps({ assets: [] });
        const error = (await ingestResultAsset(imageItem({ payloadDropped: true, dataUrl: undefined }), ctx, deps).catch((caught) => caught)) as ResultAssetError;
        expect(error.code).toBe("payload-dropped");
    });

    test("草稿版本不一致入库后落 stale + staleReasons", async () => {
        const store: Store = { assets: [] };
        const { deps } = fakeAssetDeps(store);
        const outcome = await ingestResultAsset(imageItem({ draftRevision: 2 }), { ...ctx, draftRevision: 9 }, deps);
        expect(outcome.stale).toBe(true);
        expect(outcome.staleReasons).toEqual(["draft-revision-mismatch"]);
        expect(store.assets[0].stale).toBe(true);
        expect(store.assets[0].metadata?.staleReasons).toEqual(["draft-revision-mismatch"]);
        expect(store.assets[0].metadata?.staleMessage).toContain("旧版本草稿");
    });

    test("取消信号在开始前生效，不做任何写入", async () => {
        const controller = new AbortController();
        controller.abort();
        const { deps, calls } = fakeAssetDeps({ assets: [] });
        const error = (await ingestResultAsset(imageItem(), { ...ctx, signal: controller.signal }, deps).catch((caught) => caught)) as ResultAssetError;
        expect(error.code).toBe("aborted");
        expect(calls.uploads).toBe(0);
    });
});

/* -------------------------------------------------------------- 批量入库 */

describe("批量入库", () => {
    test("部分成功：失败行独立报错，成功行照常入库", async () => {
        const store: Store = { assets: [] };
        const { deps } = fakeAssetDeps(store);
        const batch = await ingestResultBatch(
            [imageItem({ id: "r1" }), imageItem({ id: "r2", dataUrl: undefined, url: undefined }), imageItem({ id: "r3" }), imageItem({ id: "r4" })],
            ctx,
            { concurrency: 2, deps },
        );
        expect(batch).toMatchObject({ succeeded: 3, failed: 1, created: 3, cancelled: false });
        expect(batch.outcomes.map((outcome) => outcome.ok)).toEqual([true, false, true, true]);
        const failed = batch.outcomes[1];
        expect(failed.ok).toBe(false);
        if (!failed.ok) expect(failed.error.code).toBe("payload-missing");
    });

    test("并发上限生效（同时最多 2 个上传）", async () => {
        const store: Store = { assets: [] };
        let active = 0;
        let peak = 0;
        const { deps } = fakeAssetDeps(store, {
            uploadImage: async () => {
                active += 1;
                peak = Math.max(peak, active);
                await new Promise((resolve) => setTimeout(resolve, 15));
                active -= 1;
                return { url: "blob:i", storageKey: "image:k", width: 1, height: 1, bytes: 10, mimeType: "image/png" };
            },
        });
        await ingestResultBatch([1, 2, 3, 4, 5].map((index) => imageItem({ id: `r${index}` })), ctx, { concurrency: 2, deps });
        expect(peak).toBe(2);
        expect(store.assets).toHaveLength(5);
    });

    test("取消后剩余条目记为 aborted，不伪造成功", async () => {
        const controller = new AbortController();
        const { deps } = fakeAssetDeps({ assets: [] });
        let done = 0;
        const batch = await ingestResultBatch([imageItem({ id: "r1" }), imageItem({ id: "r2" }), imageItem({ id: "r3" })], { ...ctx, signal: controller.signal }, {
            concurrency: 1,
            deps,
            onProgress: () => {
                done += 1;
                if (done === 1) controller.abort();
            },
        });
        expect(batch.cancelled).toBe(true);
        expect(batch.succeeded).toBe(1);
        expect(batch.outcomes.slice(1).every((outcome) => !outcome.ok)).toBe(true);
    });
});

/* -------------------------------------------------------------- 发送画布 */

describe("发送画布", () => {
    test("无目标画布时新建项目、上传媒体、写入节点并保留追溯字段", async () => {
        const state: CanvasState = { projects: [], deleted: [] };
        const outcome = await sendResultToCanvas(imageItem(), ctx, { assets: fakeAssetDeps({ assets: [] }).deps, deps: fakeCanvasDeps(state), projectTitle: "套图结果" });

        expect(outcome.kind).toBe("image");
        expect(outcome.stale).toBe(false);
        expect(state.projects).toHaveLength(1);
        const node = state.projects[0].nodes[0];
        expect(node.type).toBe("image");
        expect(node.title).toBe("主图 1");
        expect(node.metadata).toMatchObject({ content: "blob:image-1", storageKey: "image:1", prompt: "白色背景", model: "seedream" });
        expect(node.metadata as Record<string, unknown>).toMatchObject({
            toolId: "PRODUCT_IMAGE_SUITE",
            taskId: "task-1",
            resultId: "result-1",
            resultAssetKey: "tool-result:PRODUCT_IMAGE_SUITE:task-1:result-1",
            draftRevision: 3,
        });
        expect(outcome.undo).toMatchObject({ kind: "remove-canvas-node", projectId: state.projects[0].id, nodeId: node.id, createdProject: true });
    });

    test("新节点排在现有内容右侧，不重叠", async () => {
        const state: CanvasState = {
            projects: [{ id: "p1", nodes: [{ id: "n1", type: "image", title: "旧", position: { x: 100, y: 40 }, width: 400, height: 300 }] }],
            deleted: [],
        };
        const outcome = await sendResultToCanvas(imageItem(), ctx, { projectId: "p1", assets: fakeAssetDeps({ assets: [] }).deps, deps: fakeCanvasDeps(state) });
        const node = state.projects[0].nodes.find((item) => item.id === outcome.nodeId)!;
        expect(node.position).toEqual({ x: 580, y: 40 });
    });

    test("目标画布不存在 => project-not-found，不偷偷新建", async () => {
        const state: CanvasState = { projects: [], deleted: [] };
        const error = (await sendResultToCanvas(imageItem(), ctx, { projectId: "missing", assets: fakeAssetDeps({ assets: [] }).deps, deps: fakeCanvasDeps(state) }).catch((caught) => caught)) as ResultAssetError;
        expect(error.code).toBe("project-not-found");
        expect(state.projects).toHaveLength(0);
    });

    test("媒体写入 0 字节 => empty-media 并回滚刚创建的空画布", async () => {
        const state: CanvasState = { projects: [], deleted: [] };
        const deps = fakeCanvasDeps(state);
        const assets = fakeAssetDeps({ assets: [] }, { uploadImage: async () => ({ url: "blob:bad", storageKey: "image:bad", width: 0, height: 0, bytes: 0, mimeType: "image/png" }) }).deps;
        const error = (await sendResultToCanvas(imageItem(), ctx, { deps, assets }).catch((caught) => caught)) as ResultAssetError;
        expect(error.code).toBe("empty-media");
        expect(state.deleted).toEqual([["project-1"]]);
        expect(state.projects).toHaveLength(0);
    });

    test("严格模式下拒绝发送过期结果", async () => {
        const state: CanvasState = { projects: [{ id: "p1", nodes: [] }], deleted: [] };
        const error = (await sendResultToCanvas(imageItem({ draftRevision: 1 }), { ...ctx, draftRevision: 7 }, { projectId: "p1", rejectStale: true, assets: fakeAssetDeps({ assets: [] }).deps, deps: fakeCanvasDeps(state) }).catch((caught) => caught)) as ResultAssetError;
        expect(error.code).toBe("stale-result");
        expect(state.projects[0].nodes).toHaveLength(0);
    });

    test("非严格模式下过期结果可发送，但节点带 staleReasons", async () => {
        const state: CanvasState = { projects: [{ id: "p1", nodes: [] }], deleted: [] };
        const outcome = await sendResultToCanvas(imageItem({ draftRevision: 1 }), { ...ctx, draftRevision: 7 }, { projectId: "p1", assets: fakeAssetDeps({ assets: [] }).deps, deps: fakeCanvasDeps(state) });
        expect(outcome.stale).toBe(true);
        const node = state.projects[0].nodes[0];
        expect((node.metadata as Record<string, unknown>).staleReasons).toBe("draft-revision-mismatch");
    });

    test("撤销画布写入：摘除节点，自动创建且已空的项目一并删除", async () => {
        const state: CanvasState = { projects: [], deleted: [] };
        const deps = fakeCanvasDeps(state);
        const outcome = await sendResultToCanvas(imageItem(), ctx, { assets: fakeAssetDeps({ assets: [] }).deps, deps });
        const result = await undoResultAction(outcome.undo, {}, deps);
        expect(result).toEqual({ undone: true, kind: "remove-canvas-node" });
        expect(state.deleted).toEqual([[outcome.projectId]]);
        expect(state.projects).toHaveLength(0);
    });

    test("撤销资产写入只删自己那条", async () => {
        const store: Store = { assets: [] };
        const { deps, calls } = fakeAssetDeps(store);
        const outcome = await ingestResultAsset(imageItem(), ctx, deps);
        await undoResultAction(outcome.undo, deps);
        expect(calls.removed).toEqual([[outcome.assetId]]);
        expect(store.assets).toHaveLength(0);
    });

    test("节点布局：空画布从原点开始", () => {
        expect(nextResultNodePosition([])).toEqual({ x: 0, y: 0 });
        const position: Position = nextResultNodePosition([
            { id: "a", type: "image", title: "a", position: { x: 0, y: 0 }, width: 100, height: 100 },
            { id: "b", type: "image", title: "b", position: { x: 0, y: 200 }, width: 100, height: 100 },
        ]);
        expect(position).toEqual({ x: 180, y: 0 });
    });
});

/* ------------------------------------------------------------------ 门面 */

describe("UI 门面", () => {
    test("createResultAssetActions 暴露门禁 + 入库 + 发送 + 撤销", async () => {
        const store: Store = { assets: [] };
        const { deps } = fakeAssetDeps(store);
        const state: CanvasState = { projects: [{ id: "p1", nodes: [] }], deleted: [] };
        const actions = createResultAssetActions(ctx);

        expect(actions.capability(imageItem()).saveAsset).toBe(true);
        expect(actions.capability(imageItem({ payloadDropped: true, dataUrl: undefined })).saveAsset).toBe(false);

        const saved = await actions.save(imageItem(), deps);
        expect(saved.ok).toBe(true);
        const canvasDeps = fakeCanvasDeps(state);
        const sent = await actions.send(imageItem(), { projectId: "p1", assets: fakeAssetDeps({ assets: [] }).deps, deps: canvasDeps });
        expect(state.projects[0].nodes).toHaveLength(1);

        await actions.undo(sent.undo, undefined, canvasDeps);
        expect(state.projects[0].nodes).toHaveLength(0);
    });
});
