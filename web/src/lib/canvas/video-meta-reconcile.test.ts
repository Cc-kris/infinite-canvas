import { describe, expect, test } from "bun:test";

import {
    fitVideoNodeToNatural,
    reconcileVideoNodeMeta,
    videoNodeFrame,
    type VideoNodePatch,
    type VideoNodeSnapshot,
} from "./video-meta-reconcile";

/* 回归背景：VIDEO_CONCAT 在后台标签发画布，readVideoMeta 超时兜底 1280×720，
 * 真实 768×1344（9:16）的比例被写死成 16:9。这里的断言只认「真实解码值」。 */

const PORTRAIT = { width: 768, height: 1344 };
const LANDSCAPE = { width: 1280, height: 720 };

function makeNode(overrides: Partial<VideoNodeSnapshot> = {}): VideoNodeSnapshot {
    return {
        width: 420,
        height: 236,
        position: { x: 100, y: 50 },
        metadata: { content: "blob:video", storageKey: "video:1", mediaMetaPending: true },
        ...overrides,
    };
}

function harness(initial: VideoNodeSnapshot) {
    let node: VideoNodeSnapshot | undefined = initial;
    const patches: VideoNodePatch[] = [];
    return {
        deps: {
            readNode: () => node,
            patchNode: (_projectId: string, _nodeId: string, patch: VideoNodePatch) => {
                patches.push(patch);
                node = { ...(node as VideoNodeSnapshot), ...patch };
            },
        },
        patches,
        removeNode: () => {
            node = undefined;
        },
        current: () => node as VideoNodeSnapshot,
    };
}

describe("videoNodeFrame：真实宽高 → 画布框", () => {
    test("9:16 竖版按最长边 420 得到 240×420，不再固定 16:9", () => {
        expect(videoNodeFrame(PORTRAIT)).toEqual({ width: 240, height: 420 });
    });

    test("16:9 横版得到 420×236", () => {
        expect(videoNodeFrame(LANDSCAPE)).toEqual({ width: 420, height: 236 });
    });

    test("小尺寸只缩不放", () => {
        expect(videoNodeFrame({ width: 100, height: 50 })).toEqual({ width: 100, height: 50 });
    });
});

describe("fitVideoNodeToNatural", () => {
    test("按真实比例摆正且保持中心点", () => {
        const node = { width: 420, height: 236, position: { x: 110, y: 122 }, metadata: { naturalWidth: 768, naturalHeight: 1344 } };
        const fitted = fitVideoNodeToNatural(node, { x: 320, y: 240 });
        expect(fitted.width).toBe(240);
        expect(fitted.height).toBe(420);
        expect(fitted.position).toEqual({ x: 320 - 120, y: 240 - 210 });
    });

    test("没有真实宽高时原样返回（不做猜测）", () => {
        const node = { width: 420, height: 236, position: { x: 0, y: 0 }, metadata: { mediaMetaPending: true } };
        expect(fitVideoNodeToNatural(node, { x: 320, y: 240 })).toBe(node);
    });
});

describe("reconcileVideoNodeMeta：后台标签二次校正", () => {
    test("第一轮测不到、第二轮拿到真实值 → corrected，尺寸/元数据/中心都改对", async () => {
        const h = harness(makeNode());
        const sleeps: number[] = [];
        const result = await reconcileVideoNodeMeta("project-1", "node-1", {
            ...h.deps,
            measure: async () => (sleeps.length === 0 ? null : PORTRAIT),
            sleep: async (ms) => {
                sleeps.push(ms);
            },
        });

        expect(result).toEqual({ status: "corrected", natural: PORTRAIT, frame: { width: 240, height: 420 } });
        expect(h.patches).toHaveLength(1);
        const node = h.current();
        expect(node.width).toBe(240);
        expect(node.height).toBe(420);
        expect(node.metadata?.naturalWidth).toBe(768);
        expect(node.metadata?.naturalHeight).toBe(1344);
        expect(node.metadata?.mediaMetaPending).toBe(false);
        // 中心不变：旧中心 (100+210, 50+118) = (310, 168)
        expect(node.position).toEqual({ x: 310 - 120, y: 168 - 210 });
    });

    test("一直测不到 → pending，节点保持原样（绝不写 1280×720）", async () => {
        const h = harness(makeNode());
        const result = await reconcileVideoNodeMeta(
            "project-1",
            "node-1",
            { ...h.deps, measure: async () => null, sleep: async () => undefined },
            { attempts: 2 },
        );

        expect(result).toEqual({ status: "pending", attempts: 2 });
        expect(h.patches).toHaveLength(0);
        expect(h.current().metadata?.naturalWidth).toBeUndefined();
        expect(h.current().width).toBe(420);
    });

    test("真实就是 16:9 时只清 pending 与补元数据，不动框（frame-matched）", async () => {
        const h = harness(makeNode());
        const result = await reconcileVideoNodeMeta("project-1", "node-1", { ...h.deps, measure: async () => LANDSCAPE });

        expect(result).toEqual({ status: "frame-matched", natural: LANDSCAPE, frame: { width: 420, height: 236 } });
        const node = h.current();
        expect(node.position).toEqual({ x: 100, y: 50 });
        expect(node.metadata?.naturalWidth).toBe(1280);
        expect(node.metadata?.mediaMetaPending).toBe(false);
    });

    test("已校正过的节点直接跳过，不重复测量（幂等）", async () => {
        let measured = 0;
        const h = harness(makeNode({ metadata: { content: "blob:video", naturalWidth: 768, naturalHeight: 1344 } }));
        const result = await reconcileVideoNodeMeta("project-1", "node-1", {
            ...h.deps,
            measure: async () => {
                measured += 1;
                return PORTRAIT;
            },
        });

        expect(result).toEqual({ status: "skipped", reason: "already-resolved" });
        expect(measured).toBe(0);
        expect(h.patches).toHaveLength(0);
    });

    test("节点被删掉时不写补丁", async () => {
        const h = harness(makeNode());
        h.removeNode();
        const result = await reconcileVideoNodeMeta("project-1", "node-1", { ...h.deps, measure: async () => PORTRAIT });
        expect(result).toEqual({ status: "skipped", reason: "node-missing" });
    });
});
