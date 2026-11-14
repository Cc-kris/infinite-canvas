import { describe, expect, test } from "bun:test";

import { runLocalPixelTask } from "@/features/tools/adapters/local-pixel";
import { compositeSubjectImage, type PixelCompositor, type PixelSurface } from "@/services/api/tools/local-pixel";

const sourcePixels = new Uint8ClampedArray([10, 20, 30, 255, 200, 210, 220, 255]);
const maskPixels = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0]);

function fakeCompositor(): { compositor: PixelCompositor; encoded: Uint8ClampedArray[] } {
    const encoded: Uint8ClampedArray[] = [];
    const surface = (): PixelSurface => {
        let pixels = new Uint8ClampedArray(8);
        return {
            width: 2,
            height: 1,
            getContext: () => ({
                drawImage: (image: { pixels: Uint8ClampedArray }) => { pixels = new Uint8ClampedArray(image.pixels); },
                getImageData: () => ({ data: new Uint8ClampedArray(pixels) }),
                createImageData: () => ({ data: new Uint8ClampedArray(8) }),
                putImageData: (image: { data: Uint8ClampedArray }) => { pixels = new Uint8ClampedArray(image.data); },
            } as unknown as CanvasRenderingContext2D),
            convertToBlob: async () => {
                encoded.push(new Uint8ClampedArray(pixels));
                return new Blob([pixels], { type: "image/png" });
            },
        };
    };
    return {
        encoded,
        compositor: {
            load: async (url) => ({ width: 2, height: 1, pixels: url === "blob:mask" ? maskPixels : sourcePixels } as unknown as HTMLImageElement),
            surface,
        },
    };
}

describe("本地像素任务", () => {
    test("合成服务输出真实透明/白色像素 Blob，不依赖 ImageData 全局", async () => {
        for (const background of ["transparent", "white"] as const) {
            const fake = fakeCompositor();
            const blob = await compositeSubjectImage({ sourceUrl: "blob:source", maskUrl: "blob:mask", background }, fake.compositor);
            expect(blob.type).toBe("image/png");
            expect(blob.size).toBeGreaterThan(0);
            expect([...fake.encoded[0]]).toEqual(background === "transparent" ? [10, 20, 30, 255, 200, 210, 220, 0] : [10, 20, 30, 255, 255, 255, 255, 255]);
        }
    });

    test("成功任务保存真实 Blob、蒙版资产 ID 并落库", async () => {
        const fake = fakeCompositor();
        const saved: string[] = [];
        const task = await runLocalPixelTask({
            toolId: "BATCH_MATTING",
            assets: [{ id: "source-1", name: "商品.png", url: "blob:source" }],
            masks: { "source-1": { id: "mask-1", url: "blob:mask", source: "mask" } },
            at: 100,
        }, { compositor: fake.compositor, persist: (next) => saved.push(next.status) });
        expect(task.status).toBe("succeeded");
        expect(task.inputSnapshot?.maskIds).toEqual({ "source-1": "mask-1" });
        expect(task.result?.items[0].mimeType).toBe("image/png");
        expect(task.result?.items[0].blob?.size).toBeGreaterThan(0);
        expect(saved).toEqual(["validating", "submitting", "running", "succeeded"]);
        if (task.result?.items[0].url) URL.revokeObjectURL(task.result.items[0].url);
    });

    test("普通不透明图和空输入失败，不生成假结果", async () => {
        const fake = fakeCompositor();
        const failed = await runLocalPixelTask({ toolId: "WHITE_BACKGROUND", assets: [{ id: "source-1", name: "普通.jpg", url: "blob:source" }], masks: {}, at: 100 }, { compositor: fake.compositor });
        expect(failed.status).toBe("failed");
        expect(failed.error?.message).toContain("普通.jpg");
        expect(failed.result).toBeUndefined();
        const empty = await runLocalPixelTask({ toolId: "WHITE_BACKGROUND", assets: [], masks: {}, at: 100 });
        expect(empty.status).toBe("failed");
        expect(empty.result).toBeUndefined();
    });

    test("后一张失败会清理前一张临时 URL，任务不返回半批结果", async () => {
        const fake = fakeCompositor();
        const created: string[] = [];
        const revoked: string[] = [];
        const originalCreate = URL.createObjectURL;
        const originalRevoke = URL.revokeObjectURL;
        URL.createObjectURL = (blob: Blob) => { const url = originalCreate(blob); created.push(url); return url; };
        URL.revokeObjectURL = (url: string) => { revoked.push(url); originalRevoke(url); };
        try {
            const task = await runLocalPixelTask({
                toolId: "BATCH_MATTING",
                assets: [{ id: "one", name: "一.png", url: "blob:source" }, { id: "two", name: "二.png", url: "blob:source" }],
                masks: { one: { id: "mask-1", url: "blob:mask", source: "mask" } },
                at: 100,
            }, { compositor: fake.compositor });
            expect(task.status).toBe("failed");
            expect(task.result).toBeUndefined();
            expect(revoked).toEqual(created);
        } finally {
            URL.createObjectURL = originalCreate;
            URL.revokeObjectURL = originalRevoke;
        }
    });
});
