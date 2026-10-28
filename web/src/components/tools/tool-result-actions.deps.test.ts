import { expect, mock, test } from "bun:test";

/**
 * 回归：`loadResultCanvasDeps` 必须自行装配 uploadImage / storeVideo。
 * 缺陷背景：早期默认装配只给了 findProject/createProject/updateProject/createNode/*Metadata，
 * “发送画布”必然抛 `画布依赖不可用：uploadImage, storeVideo`。
 * 这里用 mock.module 拦截真实服务模块（避免 IndexedDB/axios 的浏览器依赖），
 * 断言默认链路真的把图片入库、视频入库接上了。
 */

const uploadedImage = { url: "blob:canvas-image", storageKey: "image:9", width: 512, height: 512, bytes: 11, mimeType: "image/png" };
const storedVideo = { url: "blob:canvas-video", storageKey: "video:9", bytes: 22, mimeType: "video/mp4" };

const uploadCalls: unknown[] = [];
const storeVideoCalls: unknown[] = [];

mock.module("@/services/image-storage", () => ({
    uploadImage: async (input: unknown) => {
        uploadCalls.push(input);
        return uploadedImage;
    },
}));

mock.module("@/services/api/video", () => ({
    storeGeneratedVideo: async (input: unknown) => {
        storeVideoCalls.push(input);
        return storedVideo;
    },
}));

type FakeProject = { id: string; nodes: Array<{ id: string; type: string; title: string; position: { x: number; y: number }; width: number; height: number }> };
const projects = new Map<string, FakeProject>([["project-1", { id: "project-1", nodes: [] }]]);

mock.module("@/stores/canvas/use-canvas-store", () => ({
    useCanvasStore: {
        getState: () => ({
            projects: Array.from(projects.values()),
            createProject: (title?: string) => {
                const id = `project-${projects.size + 1}`;
                projects.set(id, { id, nodes: [] });
                void title;
                return id;
            },
            updateProject: (projectId: string, patch: { nodes: FakeProject["nodes"] }) => {
                const project = projects.get(projectId);
                if (project) project.nodes = patch.nodes;
            },
        }),
    },
}));

mock.module("@/lib/canvas/canvas-node-factory", () => ({
    createCanvasNode: (type: "image" | "video", position: { x: number; y: number }, metadata: { title?: string }) => ({
        id: `node-${type}`,
        type,
        title: metadata?.title ?? "结果",
        position,
        width: 320,
        height: 320,
    }),
    imageMetadata: (image: typeof uploadedImage) => ({ content: image.url, storageKey: image.storageKey, naturalWidth: image.width, naturalHeight: image.height }),
    videoMetadata: (video: typeof storedVideo) => ({ content: video.url, storageKey: video.storageKey }),
}));

test("loadResultCanvasDeps 默认装配 uploadImage/storeVideo 并转发给真实服务", async () => {
    uploadCalls.length = 0;
    storeVideoCalls.length = 0;
    const { loadResultCanvasDeps } = await import("./tool-result-actions");
    const deps = await loadResultCanvasDeps();

    expect(typeof deps.uploadImage).toBe("function");
    expect(typeof deps.storeVideo).toBe("function");
    expect(typeof deps.createNode).toBe("function");

    // 不是“有个同名函数”，而是真的调到 image-storage / video api。
    await expect(deps.uploadImage?.("data:image/png;base64,AAAA")).resolves.toEqual(uploadedImage);
    expect(uploadCalls).toEqual(["data:image/png;base64,AAAA"]);

    await expect(deps.storeVideo?.({ url: "blob:source", mimeType: "video/mp4" })).resolves.toEqual(storedVideo);
    expect(storeVideoCalls).toEqual([{ url: "blob:source", mimeType: "video/mp4" }]);
});

test("sendResultItemToCanvas 不注入 deps 也能完成图片入库与节点追加", async () => {
    uploadCalls.length = 0;
    const { sendResultItemToCanvas } = await import("./tool-result-actions");

    const result = await sendResultItemToCanvas(
        { id: "item-1", kind: "image", dataUrl: "data:image/png;base64,BBBB", mimeType: "image/png" },
        { toolId: "IMAGE_CROP", projectId: "project-1" },
    );

    expect(result.projectId).toBe("project-1");
    expect(result.nodeId).toBe("node-image");
    expect(uploadCalls).toEqual(["data:image/png;base64,BBBB"]);
    expect(projects.get("project-1")?.nodes).toHaveLength(1);
    expect(projects.get("project-1")?.nodes[0]?.type).toBe("image");
});
