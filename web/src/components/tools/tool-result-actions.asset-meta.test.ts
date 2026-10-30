import { describe, expect, test } from "bun:test";

import type { UploadedFile } from "@/services/file-storage";

import { reconcileAssetVideoMeta, resolveStoredVideoMeta, saveResultItemToAssets } from "./tool-result-actions";

/* 回归：VIDEO_TRANSLATION r22-f 真实任务（task-mvuflf9e-djxprc）。
 * 结果视频真实 768×768 / 6583ms，但存资产时 readVideoMeta 超时兜底把 1280×720 写进了资产记录。
 * 契约：asset.data 的宽高必须是真实解码值；拿不到就不写兜底（0 + mediaMetaPending），
 * 由后台校正回填，刷新后仍是真实值。 */

const videoItem = {
    id: "r22f-item-0",
    kind: "video" as const,
    url: "https://cdn.example.com/06-result-video.mp4",
    mimeType: "video/mp4",
};

/** 入库结果：readVideoMeta 超时兜底（1280×720 + timedOut）。 */
const fallbackStored: UploadedFile = {
    url: "blob:r22f-result",
    storageKey: "video:r22f-result",
    bytes: 1249837,
    mimeType: "video/mp4",
    width: 1280,
    height: 720,
    timedOut: true,
};

/** 真实解码结果（ffprobe/mdls 实测）。 */
const REAL_META = { width: 768, height: 768, durationMs: 6583 };

type CapturedAsset = { kind: string; data: Record<string, unknown>; metadata?: Record<string, unknown> };

function harness(stored: UploadedFile, measureResult: { width: number; height: number; durationMs?: number } | null) {
    let captured: CapturedAsset | undefined;
    let capturedKey = "";
    const measureCalls: string[] = [];
    const patches: Array<{ id: string; patch: Record<string, unknown> }> = [];
    return {
        deps: {
            storeVideo: async () => stored,
            upsertAsset: (asset: CapturedAsset, options: { key: string }) => {
                captured = asset;
                capturedKey = options.key;
                return { id: "asset-r22f", created: true, revision: 1 };
            },
            measureVideo: async (url: string) => {
                measureCalls.push(url);
                return measureResult;
            },
            updateAsset: (id: string, patch: Record<string, unknown>) => {
                patches.push({ id, patch });
            },
        },
        captured: () => captured,
        capturedKey: () => capturedKey,
        measureCalls,
        patches,
    };
}

describe("存资产：视频宽高契约（不得写 1280×720 兜底）", () => {
    test("兜底尺寸 + 严格测量成功 → 写真实 768×768 与时长，不标 pending", async () => {
        const h = harness(fallbackStored, REAL_META);
        const saved = await saveResultItemToAssets(videoItem, 0, { toolId: "VIDEO_TRANSLATION", taskId: "task-mvuflf9e-djxprc", deps: h.deps });

        expect(saved).toEqual({ assetId: "asset-r22f", kind: "video" });
        expect(h.measureCalls).toEqual(["blob:r22f-result"]);
        const asset = h.captured()!;
        expect(asset.kind).toBe("video");
        expect(asset.data).toMatchObject({ width: 768, height: 768, durationMs: 6583, bytes: 1249837, storageKey: "video:r22f-result" });
        expect(asset.data.width).not.toBe(1280);
        expect(asset.metadata?.mediaMetaPending).toBeUndefined();
        expect(asset.metadata?.taskId).toBe("task-mvuflf9e-djxprc");
        expect(h.capturedKey()).toBe("tool-result:VIDEO_TRANSLATION:task-mvuflf9e-djxprc:r22f-item-0");
        expect(h.patches).toHaveLength(0);
    });

    test("兜底尺寸 + 测不到 → 不写兜底（0×0 + pending），后台校正回填真实值并保留溯源", async () => {
        const h = harness(fallbackStored, null);
        await saveResultItemToAssets(videoItem, 0, { toolId: "VIDEO_TRANSLATION", taskId: "task-mvuflf9e-djxprc", deps: h.deps });

        const asset = h.captured()!;
        expect(asset.data.width).toBe(0);
        expect(asset.data.height).toBe(0);
        expect(asset.data.width).not.toBe(1280);
        expect(asset.metadata?.mediaMetaPending).toBe(true);

        // 标签可见后再测到真实值 → patch 资产记录（刷新后仍是真实值）。
        const fixed = await reconcileAssetVideoMeta(
            "asset-r22f",
            fallbackStored,
            { data: asset.data as never, metadata: asset.metadata },
            { measureVideo: async () => REAL_META, updateAsset: h.deps.updateAsset },
            { attempts: 1, retryDelayMs: 0 },
        );
        expect(fixed).toBe("corrected");
        expect(h.patches).toHaveLength(1);
        const patch = h.patches[0].patch as { data: Record<string, unknown>; metadata: Record<string, unknown> };
        expect(patch.data).toMatchObject({ width: 768, height: 768, durationMs: 6583, storageKey: "video:r22f-result" });
        expect(patch.metadata).toMatchObject({ taskId: "task-mvuflf9e-djxprc", mediaMetaPending: false });
    });

    test("真实入库元数据（未超时）→ 不重复测量，直接用真实值", async () => {
        const trusted: UploadedFile = { ...fallbackStored, width: 1920, height: 1080, durationMs: 9000, timedOut: undefined };
        const h = harness(trusted, REAL_META);
        await saveResultItemToAssets(videoItem, 0, { toolId: "VIDEO_TRANSLATION", deps: h.deps });

        expect(h.measureCalls).toHaveLength(0);
        expect(h.captured()!.data).toMatchObject({ width: 1920, height: 1080, durationMs: 9000 });
        expect(h.captured()!.metadata?.mediaMetaPending).toBeUndefined();
    });

    test("resolveStoredVideoMeta：兜底值永不当事实，测量失败返回 null", async () => {
        expect(await resolveStoredVideoMeta(fallbackStored, undefined)).toBeNull();
        expect(await resolveStoredVideoMeta(fallbackStored, async () => null)).toBeNull();
        expect(await resolveStoredVideoMeta(fallbackStored, async () => REAL_META)).toEqual(REAL_META);
        expect(await resolveStoredVideoMeta({ ...fallbackStored, timedOut: undefined, width: 768, height: 768 }, async () => REAL_META)).toEqual({ width: 768, height: 768 });
        // 兜底 1280×720 即使没标 timedOut 但宽高缺失也不能用
        expect(await resolveStoredVideoMeta({ ...fallbackStored, timedOut: undefined, width: 0, height: 0 }, async () => null)).toBeNull();
    });

    test("reconcileAssetVideoMeta：始终测不到 → pending（不 patch 假值）", async () => {
        const patches: unknown[] = [];
        const state = await reconcileAssetVideoMeta(
            "asset-r22f",
            fallbackStored,
            { data: { url: "blob:r22f-result", width: 0, height: 0, bytes: 1249837, mimeType: "video/mp4" } },
            { measureVideo: async () => null, updateAsset: (_id, patch) => patches.push(patch) },
            { attempts: 2, retryDelayMs: 0 },
        );
        expect(state).toBe("pending");
        expect(patches).toHaveLength(0);
    });
});
