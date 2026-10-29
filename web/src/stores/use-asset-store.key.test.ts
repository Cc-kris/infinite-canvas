/**
 * 回归：资产幂等键口径。
 * 真实事故：IMAGE_TEXT_EDIT 真实任务 task-mvs8bhu1-hhue24 结果在资产库中已存在
 * （旧版本写入的 metadata 只有 toolId/taskId/resultItemId，没有 resultAssetKey），
 * 再次点击「存入资产」被判为新资产，生成重复记录（Bmtqv… 与 r7_ci…），
 * 违反「同一 toolId+taskId+resultId 幂等入库」。
 */
import { describe, expect, test } from "bun:test";

import { assetResultKey } from "./use-asset-store";

const key = "tool-result:IMAGE_TEXT_EDIT:task-mvs8bhu1-hhue24:task-mvs8bhu1-hhue24-0";

describe("assetResultKey", () => {
    test("已有 resultAssetKey 时原样返回", () => {
        expect(assetResultKey({ metadata: { resultAssetKey: key } } as never)).toBe(key);
    });

    test("历史资产无 resultAssetKey 时按 resultId 推导同一口径", () => {
        expect(
            assetResultKey({
                metadata: { toolId: "IMAGE_TEXT_EDIT", taskId: "task-mvs8bhu1-hhue24", resultId: "task-mvs8bhu1-hhue24-0" },
            } as never),
        ).toBe(key);
    });

    test("旧字段 resultItemId 与 taskId 缺省时同样可推导", () => {
        expect(
            assetResultKey({ metadata: { toolId: "IMAGE_TEXT_EDIT", resultItemId: "task-mvs8bhu1-hhue24-0" } } as never),
        ).toBe("tool-result:IMAGE_TEXT_EDIT:task:task-mvs8bhu1-hhue24-0");
    });

    test("非工具结果资产不产生 key（不参与去重）", () => {
        expect(assetResultKey({ metadata: {} } as never)).toBeUndefined();
        expect(assetResultKey({ metadata: { toolId: "IMAGE_TEXT_EDIT" } } as never)).toBeUndefined();
    });
});
