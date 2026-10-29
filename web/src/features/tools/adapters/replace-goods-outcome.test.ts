/**
 * REPLACE_GOODS 结果提取口径回归。
 *
 * 背景（R7 审计）：上游已出图，但结果区「静默清空」。
 * 根因：结果项只按 `kind === "image"` 过滤；url 形态 / 历史恢复的项没有 kind（只有 url 或 mimeType），
 * 全被过滤掉 → 判定 empty-result → 页面既不显示图也不说明原因。
 * 该文件锁定「缺 kind 也必须按 mime/url 兜底识别为图片」这一口径，避免以后回退。
 */
import { describe, expect, test } from "bun:test";

import type { ToolTask } from "@/services/api/tools/task-machine";
import type { ReplaceGoodsUnit } from "@/features/tools/adapters/replace-goods";
import { replaceGoodsOutcomeFromTask } from "@/features/tools/adapters/replace-goods";

const unit = {
    id: "unit-1",
    label: "SKU 1",
    snapshotHash: "hash-1",
    snapshot: {} as ReplaceGoodsUnit["snapshot"],
    prompt: "p",
    fields: {},
    references: [],
    maskCoverage: 0,
    guideArea: 0,
} as unknown as ReplaceGoodsUnit;

function task(items: unknown[], status: ToolTask["status"] = "succeeded"): ToolTask {
    return {
        id: "task-1",
        toolId: "REPLACE_GOODS",
        status,
        result: { items, receivedAt: 1 },
    } as unknown as ToolTask;
}

describe("商品替换 · 结果提取", () => {
    test("缺 kind 的 url 结果仍识别为图片，不判 empty-result", () => {
        const outcome = replaceGoodsOutcomeFromTask(unit, task([{ url: "https://oss.local/out.png", mimeType: "image/png" }]));
        expect(outcome.status).toBe("succeeded");
        expect(outcome.images).toHaveLength(1);
        expect(outcome.images[0]?.url).toBe("https://oss.local/out.png");
    });

    test("缺 kind 且只有 dataUrl 前缀的结果同样识别为图片", () => {
        const outcome = replaceGoodsOutcomeFromTask(unit, task([{ dataUrl: "data:image/jpeg;base64,AAAA" }]));
        expect(outcome.status).toBe("succeeded");
        expect(outcome.images).toHaveLength(1);
    });

    test("真正的视频结果不会被当作图片", () => {
        const outcome = replaceGoodsOutcomeFromTask(unit, task([{ url: "https://oss.local/out.mp4", mimeType: "video/mp4" }]));
        expect(outcome.status).toBe("failed");
        expect(outcome.images).toHaveLength(0);
    });

    test("载荷被剥离（payloadDropped）不算结果，如实判失败而不是显示空图", () => {
        const outcome = replaceGoodsOutcomeFromTask(unit, task([{ kind: "image", mimeType: "image/png", payloadDropped: true }]));
        expect(outcome.status).toBe("failed");
        expect(outcome.images).toHaveLength(0);
    });
});
