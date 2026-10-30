import { describe, expect, test } from "bun:test";

import { createCanvasNode, videoMetadata } from "@/lib/canvas/canvas-node-factory";
import type { UploadedFile } from "@/services/file-storage";

import { sendResultItemToCanvas, type ResultCanvasNode } from "./tool-result-actions";

/* 回归：VIDEO_CONCAT 后台标签发画布时，readVideoMeta 超时兜底把 768×1344 写成 1280×720。
 * 契约：节点 metadata 不得出现兜底值；严格测量拿到真实值就必须按真实比例建框。 */

const videoItem = { id: "item-2", kind: "video" as const, url: "https://cdn.example.com/out.mp4", mimeType: "video/mp4" };
const PORTRAIT = { width: 768, height: 1344 };

function harness(stored: UploadedFile, overrides: Record<string, unknown> = {}) {
    const project = { id: "project-1", nodes: [] as ResultCanvasNode[] };
    const reconcileCalls: Array<[string, string]> = [];
    let measureCalls = 0;
    const deps = {
        findProject: (id: string) => (id === project.id ? project : undefined),
        updateProject: (_id: string, nodes: ResultCanvasNode[]) => {
            project.nodes = nodes;
        },
        uploadImage: async () => ({ url: "blob:img", storageKey: "image:1", bytes: 1, mimeType: "image/png", width: 1, height: 1 }),
        storeVideo: async () => stored,
        createNode: createCanvasNode,
        imageMetadata: () => ({}),
        videoMetadata,
        measureVideo: async () => {
            measureCalls += 1;
            return overrides.measureResult as { width: number; height: number } | null;
        },
        reconcileVideoMeta: async (projectId: string, nodeId: string) => {
            reconcileCalls.push([projectId, nodeId]);
        },
    };
    return {
        project,
        deps,
        reconcileCalls,
        measureCalls: () => measureCalls,
        node: () => project.nodes[project.nodes.length - 1],
    };
}

const pendingStored: UploadedFile = { url: "blob:stored-video", storageKey: "video:9", bytes: 4633118, mimeType: "video/mp4", width: 1280, height: 720, timedOut: true };

describe("发画布：视频节点尺寸契约", () => {
    test("超时兜底 + 严格测量成功 → 按 9:16 真实比例建框，且不带兜底值", async () => {
        const h = harness(pendingStored, { measureResult: PORTRAIT });
        const { nodeId } = await sendResultItemToCanvas(videoItem, { toolId: "VIDEO_CONCAT", projectId: "project-1", deps: h.deps });

        const node = h.node();
        expect(node.id).toBe(nodeId);
        expect(node.width).toBe(240);
        expect(node.height).toBe(420);
        expect(node.metadata?.naturalWidth).toBe(768);
        expect(node.metadata?.naturalHeight).toBe(1344);
        expect(node.metadata?.mediaMetaPending).toBeFalsy();
        expect(h.reconcileCalls).toHaveLength(0);
    });

    test("严格测量也失败 → 节点标 pending、不写 1280×720，并触发后台校正", async () => {
        const h = harness(pendingStored, { measureResult: null });
        const { nodeId } = await sendResultItemToCanvas(videoItem, { toolId: "VIDEO_CONCAT", projectId: "project-1", deps: h.deps });
        // reconcile 是 fire-and-forget，等一轮微任务
        await Promise.resolve();

        const node = h.node();
        expect(node.metadata?.mediaMetaPending).toBe(true);
        expect(node.metadata?.naturalWidth).toBeUndefined();
        expect(node.metadata?.naturalHeight).toBeUndefined();
        expect(node.width).toBe(420);
        expect(node.height).toBe(236);
        expect(h.reconcileCalls).toEqual([["project-1", nodeId]]);
    });

    test("正常路径（真实宽高已在入库时测到）→ 直接按真实比例建框，不再二次测量", async () => {
        const stored: UploadedFile = { ...pendingStored, timedOut: undefined, width: 768, height: 1344 };
        const h = harness(stored, { measureResult: PORTRAIT });
        await sendResultItemToCanvas(videoItem, { toolId: "VIDEO_CONCAT", projectId: "project-1", deps: h.deps });

        const node = h.node();
        expect(h.measureCalls()).toBe(0);
        expect(node.width).toBe(240);
        expect(node.height).toBe(420);
        expect(node.metadata?.naturalWidth).toBe(768);
        expect(h.reconcileCalls).toHaveLength(0);
    });
});

describe("videoMetadata：兜底值不得进节点", () => {
    test("timedOut=true 时只标 pending", () => {
        const metadata = videoMetadata(pendingStored);
        expect(metadata.naturalWidth).toBeUndefined();
        expect(metadata.naturalHeight).toBeUndefined();
        expect(metadata.mediaMetaPending).toBe(true);
        expect(metadata.storageKey).toBe("video:9");
        expect(metadata.bytes).toBe(4633118);
    });

    test("真实宽高时写入自然尺寸且不标 pending", () => {
        const metadata = videoMetadata({ ...pendingStored, timedOut: undefined, width: 768, height: 1344, durationMs: 5000 });
        expect(metadata).toMatchObject({ naturalWidth: 768, naturalHeight: 1344, durationMs: 5000 });
        expect(metadata.mediaMetaPending).toBeUndefined();
    });
});
