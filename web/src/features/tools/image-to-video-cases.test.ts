import { describe, expect, test } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { IMAGE_TO_VIDEO_CASES } from "@/features/tools/image-to-video-cases-data";
import {
    imageToVideoCaseApplyPatch,
    imageToVideoRatioFromSize,
    IMAGE_TO_VIDEO_DURATIONS,
} from "@/features/tools/registry/image-to-video";

/**
 * 「图转视频」优秀案例 + 做同款 的真实性守卫。
 *
 * 这里只断言“可核对的事实”，不做样式快照：
 * - 案例条数与 LinkFox 原站回包一致（10 条），ID 唯一且为原站数字 ID；
 * - 卡片封面/参考图确实落在 public 目录且非空（不是占位 base64、不是远程糊图）；
 * - 做同款映射：原站时长超档位必须收敛且给提示，不许静默改参数；
 * - 原站没有脚本的案例不许被编造出脚本。
 */

const PUBLIC_DIR = join(import.meta.dir, "../../../public");

describe("IMAGE_TO_VIDEO 真实优秀案例数据", () => {
    test("10 条原站案例，ID 唯一", () => {
        expect(IMAGE_TO_VIDEO_CASES).toHaveLength(10);
        expect(new Set(IMAGE_TO_VIDEO_CASES.map((item) => item.id)).size).toBe(10);
        for (const item of IMAGE_TO_VIDEO_CASES) {
            expect(item.id).toMatch(/^\d{15,}$/);
        }
    });

    test("封面与参考图真实落盘且非空", () => {
        for (const item of IMAGE_TO_VIDEO_CASES) {
            const cover = join(PUBLIC_DIR, item.result.replace(/^\//, ""));
            const refPath = item.apply?.files?.reference;
            expect(typeof refPath).toBe("string");
            const reference = join(PUBLIC_DIR, String(refPath).replace(/^\//, ""));
            expect(existsSync(cover)).toBe(true);
            expect(existsSync(reference)).toBe(true);
            expect(statSync(cover).size).toBeGreaterThan(5_000);
            expect(statSync(reference).size).toBeGreaterThan(50_000);
        }
    });

    test("成片走原站真实地址（mp4）", () => {
        for (const item of IMAGE_TO_VIDEO_CASES) {
            expect(item.video).toBe(true);
            expect(item.videoSrc).toMatch(/^https:\/\/file-ai\.linkfox\.com\/.+\/main_result_.+\.mp4$/);
        }
    });

    test("脚本按原站下发：9 条有脚本，1 条本身为空", () => {
        const withPrompt = IMAGE_TO_VIDEO_CASES.filter((item) => (item.apply?.prompt ?? "").trim().length > 0);
        expect(withPrompt).toHaveLength(9);
        for (const item of withPrompt) expect((item.apply?.prompt ?? "").length).toBeGreaterThan(400);
    });
});

describe("做同款映射（诚实边界）", () => {
    const base = { prompt: "镜头1｜0–4s：设备未亮灯，暖光渐起。", ratio: "9:16", resolution: "1080P", originDuration: 15 };

    test("比例/清晰度/脚本原样回填，提示词优化关闭", () => {
        const { patch, notices } = imageToVideoCaseApplyPatch(base, ["asset-1"]);
        expect(patch.aspectRatio).toBe("9:16");
        expect(patch.resolution).toBe("1080P");
        expect(patch.prompt).toBe(base.prompt);
        expect(patch.promptMode).toBe("custom");
        expect(patch.promptOptimizer).toBe(false);
        expect(patch.referenceAssetIds).toEqual(["asset-1"]);
        expect(patch.imageInputMode).toBe("local");
        expect(notices.join()).not.toContain("时长");
    });

    test("原站 16 秒超档位 → 收敛到 15 秒并留提示", () => {
        const { patch, notices } = imageToVideoCaseApplyPatch({ ...base, originDuration: 16 }, ["a"]);
        expect(patch.duration).toBe(15);
        expect(notices.join()).toContain("16 秒");
        expect(notices.join()).toContain("15 秒");
    });

    test("20 秒收敛到 15 秒、10 秒保持 10 秒", () => {
        expect(imageToVideoCaseApplyPatch({ ...base, originDuration: 20 }, []).patch.duration).toBe(15);
        expect(imageToVideoCaseApplyPatch({ ...base, originDuration: 10 }, []).patch.duration).toBe(10);
        for (const duration of IMAGE_TO_VIDEO_DURATIONS) {
            const { patch, notices } = imageToVideoCaseApplyPatch({ ...base, originDuration: duration }, []);
            expect(patch.duration).toBe(duration);
            expect(notices.join()).not.toContain("时长");
        }
    });

    test("原站无脚本的案例：不编造脚本，留在模板模式并说明", () => {
        const { patch, notices } = imageToVideoCaseApplyPatch({ ...base, prompt: "   " }, ["a"]);
        expect(patch.prompt).toBe("");
        expect(patch.promptMode).toBe("template");
        expect(notices.join()).toContain("未提供脚本");
    });

    test("未知比例不硬塞，回落自适应并提示", () => {
        const { patch, notices } = imageToVideoCaseApplyPatch({ ...base, ratio: "5:4" }, []);
        expect(patch.aspectRatio).toBe("auto");
        expect(notices.join()).toContain("5:4");
    });

    test("历史任务 size 可反推页面比例", () => {
        expect(imageToVideoRatioFromSize("9:16")).toBe("9:16");
        expect(imageToVideoRatioFromSize("1080x1920")).toBeUndefined();
        expect(imageToVideoRatioFromSize(undefined)).toBeUndefined();
    });
});
