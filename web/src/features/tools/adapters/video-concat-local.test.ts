import { describe, expect, test } from "bun:test";

import { createVideoConcatState, normalizeVideoConcatClip } from "@/features/tools/registry/video-concat";
import { runVideoConcatLocalTask, type VideoConcatLocalPort } from "./video-concat-local";

const clips = [
    normalizeVideoConcatClip({ id: "a", url: "blob:a", storageKey: "a", mimeType: "video/mp4", bytes: 10, durationMs: 5000, startMs: 500, endMs: 2500 }),
    normalizeVideoConcatClip({ id: "b", url: "blob:b", storageKey: "b", mimeType: "video/mp4", bytes: 20, durationMs: 6000, startMs: 1000, endMs: 4000 }),
];
const state = createVideoConcatState({
    clips,
    cover: { source: "frame", url: "data:image/png;base64,AAAA", name: "cover.png", mimeType: "image/png", bytes: 4 },
});

describe("VIDEO_CONCAT 本地确定性任务", () => {
    test("按当前顺序和裁剪状态合成，真实 Blob 才进入成功结果", async () => {
        const saved: string[] = [];
        const output = new Blob(["real-video"], { type: "video/mp4" });
        const port: VideoConcatLocalPort = { compose: async (actual) => { expect(actual).toEqual(state); return output; }, save: (task) => saved.push(task.status) };
        const task = await runVideoConcatLocalTask({ state, port });
        expect(task.status).toBe("succeeded");
        expect(task.configSnapshot.model).toBe("local-ffmpeg");
        expect(task.result?.items[0].blob).toBe(output);
        expect(task.result?.items[0].bytes).toBe(output.size);
        expect(task.inputSnapshot?.videoList).toEqual([
            expect.objectContaining({ assetId: "a", startMs: 500, endMs: 2500 }),
            expect.objectContaining({ assetId: "b", startMs: 1000, endMs: 4000 }),
        ]);
        expect(saved).toEqual(["validating", "submitting", "running", "succeeded"]);
        expect(task.upstreamTaskId).toBeUndefined();
    });

    test("固定时长档不会静默截断真实片段", async () => {
        let called = false;
        await expect(runVideoConcatLocalTask({ state: { ...state, videoTime: 5 }, port: { compose: async () => { called = true; return new Blob(["x"]); }, save: () => undefined } })).rejects.toThrow("固定输出时长档");
        expect(called).toBe(false);
    });

    test("媒体失败写 failed，不把空 Blob 当成功", async () => {
        const task = await runVideoConcatLocalTask({ state, port: { compose: async () => new Blob(), save: () => undefined } });
        expect(task.status).toBe("failed");
        expect(task.result).toBeUndefined();
        expect(task.error?.message).toContain("空视频");
    });

    test("缺片段或封面时不启动 FFmpeg", async () => {
        let called = false;
        await expect(runVideoConcatLocalTask({ state: createVideoConcatState(), port: { compose: async () => { called = true; return new Blob(["x"]); }, save: () => undefined } })).rejects.toThrow();
        expect(called).toBe(false);
    });
});
