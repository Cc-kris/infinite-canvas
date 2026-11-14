import { describe, expect, test } from "bun:test";

import { compositeSubjectPixels, maskFromImage } from "@/services/api/tools/local-pixel";
import { readPixelDraft, readPixelInputSnapshot, pixelInputSnapshot } from "@/features/tools/registry/local-pixel";

const rgba = (...pixels: number[]) => new Uint8ClampedArray(pixels);

describe("本地真实像素合成", () => {
    test("透明图输出真实 alpha，保留半透明蒙版与原图 alpha", () => {
        const source = rgba(100, 120, 140, 200, 20, 30, 40, 255);
        const mask = rgba(255, 255, 255, 128, 255, 255, 255, 0);
        expect([...compositeSubjectPixels(source, mask, "transparent")]).toEqual([100, 120, 140, 100, 20, 30, 40, 0]);
    });

    test("白底图输出实际 #fff 合成像素，alpha 全部为 255", () => {
        const source = rgba(0, 100, 200, 128, 0, 100, 200, 255);
        const mask = rgba(255, 255, 255, 255, 255, 255, 255, 0);
        expect([...compositeSubjectPixels(source, mask, "white")]).toEqual([127, 177, 227, 255, 255, 255, 255, 255]);
    });

    test("拒绝尺寸不一致、空像素、全透明与全保留蒙版", () => {
        expect(() => compositeSubjectPixels(rgba(0, 0, 0, 255), rgba(), "white")).toThrow("尺寸不一致");
        expect(() => compositeSubjectPixels(rgba(), rgba(), "white")).toThrow("尺寸不一致");
        expect(() => maskFromImage(rgba(0, 0, 0, 0), "alpha")).toThrow("没有保留区域");
        expect(() => maskFromImage(rgba(20, 30, 40, 255), "alpha")).toThrow("没有识别到透明背景");
    });

    test("普通不透明原图不会自动按亮度抠图，明确蒙版才可按亮度转换", () => {
        const image = rgba(255, 255, 255, 255, 0, 0, 0, 255);
        expect(() => maskFromImage(image, "alpha")).toThrow();
        expect([...maskFromImage(image, "mask")]).toEqual([255, 255, 255, 255, 0, 0, 0, 0]);
    });
});

describe("本地像素任务输入快照", () => {
    test("快照保存源图和蒙版持久资产 ID，不保存 blob URL", () => {
        const snapshot = pixelInputSnapshot("BATCH_MATTING", [{ id: "source-1", name: "商品.png", url: "blob:source", width: 100, height: 80 }], { "source-1": "mask-1" });
        expect(snapshot.maskIds).toEqual({ "source-1": "mask-1" });
        expect(JSON.stringify(snapshot)).not.toContain("blob:");
        expect(readPixelInputSnapshot(snapshot)?.assets[0].id).toBe("source-1");
        expect(readPixelDraft({ maskIds: { "source-1": "mask-1", bad: 1 } }).maskIds).toEqual({ "source-1": "mask-1" });
    });

    test("损坏或未知版本快照不回填为有效输入", () => {
        expect(readPixelInputSnapshot(null)).toBeNull();
        expect(readPixelInputSnapshot({ version: 2, assets: [] })).toBeNull();
        expect(readPixelInputSnapshot({ version: 1, background: "blue", assets: [] })).toBeNull();
    });
});
