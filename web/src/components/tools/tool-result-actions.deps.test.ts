import { expect, test } from "bun:test";

import { loadResultCanvasDeps, sendResultItemToCanvas, type ResultCanvasModules } from "./tool-result-actions";

/**
 * 回归：`loadResultCanvasDeps` 必须自行装配 uploadImage / storeVideo。
 * 缺陷背景：默认装配漏了这两个函数 → 工具台“发送画布”必然抛
 * `画布依赖不可用：uploadImage, storeVideo`（只做 typecheck 看不出来）。
 *
 * 真实模块依赖 IndexedDB/axios/localStorage，纯 bun 进程不可直接加载，
 * 故 loader 支持注入模块替身（生产路径不传，仍走真实 import）。
 */

function createFakeModules() {
    const projects: Array<{ id: string; title: string; nodes: any[] }> = [{ id: "project-1", title: "P1", nodes: [] }];
    const calls = { uploadImage: [] as unknown[], storeVideo: [] as unknown[] };

    const canvasStore = {
        useCanvasStore: {
            getState: () => ({
                projects,
                createProject: (title: string) => {
                    const project = { id: `project-${projects.length + 1}`, title, nodes: [] as any[] };
                    projects.push(project);
                    return project.id;
                },
                updateProject: (projectId: string, patch: { nodes: any[] }) => {
                    const project = projects.find((entry) => entry.id === projectId);
                    if (project) project.nodes = patch.nodes;
                },
            }),
        },
    };

    const factory = {
        createCanvasNode: (kind: string, position: { x: number; y: number }) => ({ id: `node-${kind}`, kind, position }),
        imageMetadata: (image: { url: string }) => ({ assetUrl: image.url }),
        videoMetadata: (video: { url: string }) => ({ assetUrl: video.url }),
    };

    const imageStorage = {
        uploadImage: async (input: unknown) => {
            calls.uploadImage.push(input);
            return { url: "blob:canvas-image", storageKey: "image:9", width: 10, height: 10, bytes: 5, mimeType: "image/png" };
        },
    };

    const videoApi = {
        storeGeneratedVideo: async (input: unknown) => {
            calls.storeVideo.push(input);
            return { url: "blob:canvas-video", storageKey: "video:9", bytes: 8, mimeType: "video/mp4" };
        },
    };

    return {
        calls,
        projects,
        modules: { canvasStore, factory, imageStorage, videoApi } as unknown as ResultCanvasModules,
    };
}

test("loadResultCanvasDeps 默认装配 uploadImage/storeVideo 并接到真实服务模块", async () => {
    const { calls, modules } = createFakeModules();
    const deps = await loadResultCanvasDeps(async () => modules);

    // 缺陷点：缺这一行会 undefined，进而“发送画布”直接抛依赖不可用。
    expect(typeof deps.uploadImage).toBe("function");
    expect(typeof deps.storeVideo).toBe("function");
    expect(typeof deps.updateProject).toBe("function");
    expect(typeof deps.createNode).toBe("function");

    const image = await deps.uploadImage!("data:image/png;base64,AAAA");
    expect(calls.uploadImage).toEqual(["data:image/png;base64,AAAA"]);
    expect(image).toMatchObject({ url: "blob:canvas-image", storageKey: "image:9" });

    const video = await deps.storeVideo!({ blob: undefined, url: "blob:raw-video", mimeType: "video/mp4" });
    expect(calls.storeVideo).toHaveLength(1);
    expect(video).toMatchObject({ url: "blob:canvas-video", storageKey: "video:9" });
});

test("sendResultItemToCanvas 走默认装配时不再报“画布依赖不可用”", async () => {
    const { calls, modules, projects } = createFakeModules();

    const result = await sendResultItemToCanvas(
        { id: "item-1", kind: "image", dataUrl: "data:image/png;base64,BBBB", mimeType: "image/png" },
        { toolId: "IMAGE_CROP", projectId: "project-1", loadDeps: () => loadResultCanvasDeps(async () => modules) },
    );

    expect(result.projectId).toBe("project-1");
    expect(result.nodeId).toBe("node-image");
    expect(calls.uploadImage).toEqual(["data:image/png;base64,BBBB"]);
    expect(projects[0]?.nodes).toHaveLength(1);
});
