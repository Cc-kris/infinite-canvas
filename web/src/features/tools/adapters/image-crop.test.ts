import { describe, expect, test } from "bun:test";

import type { ToolAssetRecord } from "@/services/api/tools/assets";

import {
    buildImageCropPrompt,
    buildImageCropRequest,
    guardImageCropRequest,
    parseImageCropPrompt,
    runImageCrop,
    type CropRenderer,
} from "./image-crop";
import {
    FREE_RATIO_ID,
    IMAGE_CROP_FORMATS,
    IMAGE_CROP_MAX_BYTES,
    IMAGE_CROP_MIN_SIDE,
    PLATFORM_PRESETS,
    RATIO_PRESETS,
    applyCustomSize,
    applyOutputSize,
    applyPlatformPreset,
    applyRatioPreset,
    applyRectDrag,
    applyRotation,
    composeImageCropFields,
    createCropState,
    createImageCropSnapshot,
    imageCropDraftValues,
    isSnapshotStale,
    orientedSize,
    parseImageCropDraftValues,
    planImageCrop,
    rectToPixels,
    resetForNewSource,
    resizeRect,
    saveCustomSize,
    validateCropState,
    type CropCanvasState,
    type CropSize,
} from "../registry/image-crop";

const SOURCE: CropSize = { width: 3000, height: 2000 };
const MEDIA = { imageUrl: "blob:source-1", imageSize: 512_000, imageCropUrl: "" };
const ASSET_ID = "asset-source-1";

function snapshotOf(state: CropCanvasState, source: CropSize = SOURCE) {
    return createImageCropSnapshot({ sourceAssetId: ASSET_ID, sourceName: "source.png", sourceUrl: MEDIA.imageUrl, source, state });
}

describe("平台预设 / 比例 / 输出尺寸同步", () => {
    test("选平台同时写入平台、比例与目标像素", () => {
        const next = applyPlatformPreset(createCropState(SOURCE), "amazon", SOURCE);
        expect(next.platformKey).toBe("amazon");
        expect(next.platformTitle).toBe("亚马逊");
        expect(next.outputWidth).toBe(1600);
        expect(next.outputHeight).toBe(1600);
        expect(next.ratioId).toBe("1:1");
        // 裁剪框真实像素比例 = 预设比例
        const pixels = rectToPixels(next.rect, orientedSize(SOURCE, next.rotation));
        expect(pixels.width / pixels.height).toBeCloseTo(1, 1);
    });

    test("非方形预设（SHEIN 1340×1785）裁剪框高度按比例吃掉，不拉伸", () => {
        const next = applyPlatformPreset(createCropState(SOURCE), "shein", SOURCE);
        const pixels = rectToPixels(next.rect, orientedSize(SOURCE, next.rotation));
        expect(pixels.width / pixels.height).toBeCloseTo(1340 / 1785, 1);
        expect(next.outputWidth).toBe(1340);
        expect(next.outputHeight).toBe(1785);
    });

    test("22 个平台预设全部能落到状态，且比例可被识别", () => {
        expect(PLATFORM_PRESETS).toHaveLength(22);
        for (const preset of PLATFORM_PRESETS) {
            const next = applyPlatformPreset(createCropState(SOURCE), preset.key, SOURCE);
            expect(next.outputWidth).toBe(preset.width);
            expect(next.outputHeight).toBe(preset.height);
            expect(next.platformTitle).toBe(preset.title);
        }
    });

    test("选比例卡只改裁剪框与输出像素，保留平台预设", () => {
        const platform = applyPlatformPreset(createCropState(SOURCE), "amazon", SOURCE);
        const next = applyRatioPreset(platform, "16:9", SOURCE);
        expect(next.ratioId).toBe("16:9");
        expect(next.platformKey).toBe("amazon");
        const pixels = rectToPixels(next.rect, orientedSize(SOURCE, next.rotation));
        expect(pixels.width / pixels.height).toBeCloseTo(16 / 9, 1);
    });

    test("拖框切成自由裁剪但保留平台预设（规格 §3）", () => {
        const platform = applyPlatformPreset(createCropState(SOURCE), "amazon", SOURCE);
        const dragged = applyRectDrag(platform, { x: 0.1, y: 0.2, width: 0.4, height: 0.5 }, SOURCE);
        expect(dragged.ratioId).toBe(FREE_RATIO_ID);
        expect(dragged.platformKey).toBe("amazon");
        expect(dragged.platformTitle).toBe("亚马逊");
        const pixels = rectToPixels(dragged.rect, orientedSize(SOURCE, dragged.rotation));
        expect(dragged.outputWidth).toBe(pixels.width);
        expect(dragged.outputHeight).toBe(pixels.height);
    });

    test("锁定比例拖角保持宽高比，解锁后可自由变形", () => {
        const base = applyRatioPreset(createCropState(SOURCE), "4:3", SOURCE);
        const before = base.rect.width / base.rect.height;
        const locked = resizeRect(base.rect, "se", 0.2, 0.02, { locked: true });
        expect(locked.width / locked.height).toBeCloseTo(before, 6);
        const unlocked = resizeRect(base.rect, "se", 0.2, 0.02, { locked: false });
        expect(unlocked.width / unlocked.height).not.toBeCloseTo(before, 3);
    });

    test("旋转 90° 交换可视尺寸并重算输出像素", () => {
        const rotated = applyRotation(createCropState(SOURCE), 90, SOURCE);
        expect(orientedSize(SOURCE, 90)).toEqual({ width: 2000, height: 3000 });
        expect(rotated.rotation).toBe(90);
        const pixels = rectToPixels(rotated.rect, { width: 2000, height: 3000 });
        expect(rotated.outputWidth).toBe(pixels.width);
        expect(rotated.outputHeight).toBe(pixels.height);
    });

    test("目标宽度改动时高度按裁剪框真实比例同步", () => {
        // SOURCE=3000×2000，框取整宽 + 半高 → 像素 3000×1000 = 3:1
        const base = applyRectDrag(createCropState(SOURCE), { x: 0, y: 0, width: 1, height: 0.5 }, SOURCE);
        expect(base.outputWidth).toBe(3000);
        expect(base.outputHeight).toBe(1000);
        const next = applyOutputSize(base, "width", 1200, SOURCE);
        expect(next.outputWidth).toBe(1200);
        expect(next.outputHeight).toBe(400);
        const fromHeight = applyOutputSize(base, "height", 900, SOURCE);
        expect(fromHeight.outputWidth).toBe(2700);
        expect(fromHeight.outputHeight).toBe(900);
    });
});

describe("自定义尺寸与换图重置", () => {
    test("保存自定义尺寸去重，应用后写回像素与比例", () => {
        const saved = saveCustomSize({ ...createCropState(SOURCE), outputWidth: 1200, outputHeight: 1500 }, 1);
        expect(saved.customSizes).toHaveLength(1);
        const again = saveCustomSize(saved, 2);
        expect(again.customSizes).toHaveLength(1);
        const applied = applyCustomSize(again, "custom-1200x1500", SOURCE);
        expect(applied.outputWidth).toBe(1200);
        expect(applied.outputHeight).toBe(1500);
        expect(applied.ratioId).toBe("4:5");
        expect(applied.platformKey).toBeNull();
    });

    test("换图重置画布变换但保留格式/页签/自定义尺寸", () => {
        const custom = saveCustomSize({ ...createCropState(SOURCE), format: "image/webp", activeTab: "ratio", outputWidth: 800, outputHeight: 800 }, 1);
        const rotated = applyRotation(custom, 90, SOURCE);
        const reset = resetForNewSource(rotated, { width: 800, height: 600 });
        expect(reset.rotation).toBe(0);
        expect(reset.rect).toEqual({ x: 0, y: 0, width: 1, height: 1 });
        expect(reset.format).toBe("image/webp");
        expect(reset.activeTab).toBe("ratio");
        expect(reset.customSizes).toHaveLength(1);
        expect(reset.outputWidth).toBe(800);
    });
});

describe("校验边界", () => {
    test("无源图时禁用提交并给出 no-source", () => {
        const issues = validateCropState(createCropState(), null);
        expect(issues.map((issue) => issue.code)).toContain("no-source");
        expect(guardImageCropRequest(createCropState(), null).length).toBeGreaterThan(0);
    });

    test("源图过小/过大/超重/格式不支持都能定位", () => {
        const tiny = validateCropState(createCropState(), { width: IMAGE_CROP_MIN_SIDE - 1, height: 1000, bytes: 1000, mimeType: "image/png" });
        expect(tiny.map((issue) => issue.code)).toContain("source-too-small");
        const huge = validateCropState(createCropState(), { width: 9000, height: 9000, bytes: 1000, mimeType: "image/png" });
        expect(huge.map((issue) => issue.code)).toContain("source-too-large");
        const heavy = validateCropState(createCropState(), { width: 1000, height: 1000, bytes: IMAGE_CROP_MAX_BYTES + 1, mimeType: "image/png" });
        expect(heavy.map((issue) => issue.code)).toContain("source-too-heavy");
        const odd = validateCropState(createCropState(), { width: 1000, height: 1000, bytes: 1000, mimeType: "image/gif" });
        expect(odd.map((issue) => issue.code)).toContain("unsupported-format");
    });

    test("合法源图 + 合法输出时无阻断项", () => {
        const state = applyPlatformPreset(createCropState(SOURCE), "amazon", SOURCE);
        const issues = validateCropState(state, { width: SOURCE.width, height: SOURCE.height, bytes: 900_000, mimeType: "image/png" });
        expect(issues).toEqual([]);
        expect(IMAGE_CROP_FORMATS).toContain(state.format);
    });
});

describe("12 字段与 prompt（防丢参）", () => {
    test("composeImageCropFields 恰好输出规格 §7 的 12 个字段", () => {
        const state = applyPlatformPreset(createCropState(SOURCE), "amazon", SOURCE);
        const fields = composeImageCropFields(snapshotOf(state), MEDIA);
        expect(Object.keys(fields).sort()).toEqual(
            ["activeTab", "contentUrl", "imageCropUrl", "imageFormat", "imageHeight", "imageSize", "imageUrl", "imageWidth", "platform", "platformTitle", "ratio", "selectedMode"].sort(),
        );
        expect(fields.imageWidth).toBe(1600);
        expect(fields.imageHeight).toBe(1600);
        expect(fields.platform).toBe("amazon");
        expect(fields.imageSize).toBe(MEDIA.imageSize);
    });

    test("prompt 内嵌配置行，解析回来与字段完全一致（无静默丢参）", () => {
        const state = applyPlatformPreset(createCropState(SOURCE), "shopify-landscape", SOURCE);
        const snapshot = snapshotOf(state);
        const fields = composeImageCropFields(snapshot, MEDIA);
        const prompt = buildImageCropPrompt(snapshot, MEDIA);
        const parsed = parseImageCropPrompt(prompt);
        for (const [key, value] of Object.entries(fields)) {
            expect(parsed[key]).toBe(String(value));
        }
        expect(parsed.platformTitle).toBe("Shopify 横板");
    });

    test("计划与快照一致：裁剪框像素不会越界", () => {
        const state = applyRectDrag(applyPlatformPreset(createCropState(SOURCE), "amazon", SOURCE), { x: 0.92, y: 0.93, width: 0.3, height: 0.3 }, SOURCE);
        const plan = planImageCrop(state, SOURCE);
        expect(plan.sx + plan.sw).toBeLessThanOrEqual(plan.orientedWidth);
        expect(plan.sy + plan.sh).toBeLessThanOrEqual(plan.orientedHeight);
        expect(snapshotOf(state).plan).toEqual(plan);
    });

    test("草稿 roundtrip 保留配置与源资产", () => {
        const state = applyPlatformPreset(createCropState(SOURCE), "ebay", SOURCE);
        const parsed = parseImageCropDraftValues(imageCropDraftValues(state, ASSET_ID));
        expect(parsed?.sourceAssetId).toBe(ASSET_ID);
        expect(parsed?.state.platformKey).toBe("ebay");
        expect(parsed?.state.outputWidth).toBe(1600);
    });

    test("换配置后旧快照被判为过期", () => {
        const first = snapshotOf(applyPlatformPreset(createCropState(SOURCE), "amazon", SOURCE));
        const second = snapshotOf(applyPlatformPreset(createCropState(SOURCE), "ebay", SOURCE));
        expect(isSnapshotStale(first, second)).toBe(true);
        expect(isSnapshotStale(first, first)).toBe(false);
    });
});

describe("真实执行路径", () => {
    const state = applyPlatformPreset(createCropState(SOURCE), "amazon", SOURCE);
    const snapshot = snapshotOf(state);
    const request = buildImageCropRequest({ snapshot, media: MEDIA });

    const okRenderer: CropRenderer = {
        async render(_url, plan) {
            return { blob: new Blob([new Uint8Array(2048)], { type: plan.mimeType }), width: plan.outputWidth, height: plan.outputHeight, mimeType: plan.mimeType };
        },
    };

    const asset = { id: "asset-out-1", url: "blob:asset-out-1", storageKey: "tool-asset/asset-out-1", bytes: 2048, mimeType: "image/png", name: "cropped.png" } as unknown as ToolAssetRecord;

    test("同配置指纹稳定，改配置即变（幂等键依赖真实参数）", () => {
        expect(buildImageCropRequest({ snapshot, media: MEDIA }).fingerprint).toBe(request.fingerprint);
        const changed = buildImageCropRequest({ snapshot: snapshotOf(applyPlatformPreset(createCropState(SOURCE), "ebay", SOURCE)), media: MEDIA });
        expect(changed.fingerprint).not.toBe(request.fingerprint);
    });

    test("成功：draft→running→succeeded，结果入资产库并带回可用地址", async () => {
        const seen: string[] = [];
        let uploaded = 0;
        const result = await runImageCrop(
            { request, sourceUrl: MEDIA.imageUrl },
            {
                renderer: okRenderer,
                now: () => 1_700_000_000_000,
                persist: (task) => seen.push(task.status),
                upload: async () => {
                    uploaded += 1;
                    return asset;
                },
            },
        );
        expect(result.task.status).toBe("succeeded");
        expect(seen).toEqual(["running", "succeeded"]);
        expect(uploaded).toBe(1);
        expect(result.task.upstreamProvider).toBe("in-process-crop");
        expect(result.task.result?.items[0].url).toBe("blob:asset-out-1");
        expect(result.task.result?.items[0].bytes).toBe(2048);
        expect(result.task.sourceAssetIds).toEqual([ASSET_ID]);
        expect(result.asset?.id).toBe("asset-out-1");
    });

    test("渲染失败：failed + 可重试错误码，且不会去写资产库", async () => {
        let uploaded = 0;
        const result = await runImageCrop(
            { request, sourceUrl: MEDIA.imageUrl },
            {
                renderer: {
                    async render() {
                        throw new Error("canvas 2d context unavailable");
                    },
                },
                upload: async () => {
                    uploaded += 1;
                    return asset;
                },
            },
        );
        expect(result.task.status).toBe("failed");
        expect(result.task.error?.code).toBe("crop-render-failed");
        expect(result.task.error?.retryable).toBe(true);
        expect(uploaded).toBe(0);
        expect(result.task.result).toBeUndefined();
    });

    test("空字节结果按失败处理，不冒充成功", async () => {
        const result = await runImageCrop(
            { request, sourceUrl: MEDIA.imageUrl },
            {
                renderer: {
                    async render(_url, plan) {
                        return { blob: new Blob([], { type: plan.mimeType }), width: plan.outputWidth, height: plan.outputHeight, mimeType: plan.mimeType };
                    },
                },
                upload: async () => asset,
            },
        );
        expect(result.task.status).toBe("failed");
        expect(result.task.error?.code).toBe("crop-render-failed");
    });

    test("入库失败：failed + asset-upload-failed，保留源资产供同参重试", async () => {
        const result = await runImageCrop(
            { request, sourceUrl: MEDIA.imageUrl },
            {
                renderer: okRenderer,
                upload: async () => {
                    throw new Error("IndexedDB quota exceeded");
                },
            },
        );
        expect(result.task.status).toBe("failed");
        expect(result.task.error?.code).toBe("asset-upload-failed");
        expect(result.task.sourceAssetIds).toEqual([ASSET_ID]);
        expect(result.task.prompt).toContain("imageWidth=1600");
    });

    test("比例库非空且 id 唯一（页面卡片渲染前提）", () => {
        const ids = RATIO_PRESETS.map((preset) => preset.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toContain("1:1");
    });
});

/* ------------------------------------------------------------------ *
 * 渲染证据：无 DOM 测试环境，用 react-dom/server 渲染真实工作台组件，
 * 断言「规格声明的控件都在、平台卡数量等于预设数、无源图时提交不可点」。
 * ------------------------------------------------------------------ */
describe("IMAGE_CROP 工作区渲染", () => {
    const render = async (): Promise<string> => {
        const g = globalThis as unknown as Record<string, unknown>;
        if (!g.localStorage) {
            g.localStorage = {
                getItem: () => null,
                setItem: () => undefined,
                removeItem: () => undefined,
                clear: () => undefined,
                key: () => null,
                length: 0,
            };
        }
        const React = await import("react");
        const { renderToStaticMarkup } = await import("react-dom/server");
        const { MemoryRouter } = await import("react-router-dom");
        const { CropWorkspace } = await import("@/components/tools/workspaces/crop");
        return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(CropWorkspace, {})));
    };

    test("渲染规格控件：尺寸调整/比例调整/目标尺寸/保存自定义尺寸/平台预设/撤销/重做/重置", async () => {
        const html = await render();
        expect(html).toContain('data-testid="crop-workspace"');
        for (const copy of ["尺寸调整", "比例调整", "目标尺寸", "保存自定义尺寸", "平台预设", "撤销", "重做", "重置", "重新上传", "下载图片"]) {
            expect(html).toContain(copy);
        }
        expect(html).toContain('data-testid="crop-tab-size"');
        expect(html).toContain('data-testid="crop-tab-ratio"');
        expect(html).toContain('data-testid="crop-output-width"');
        expect(html).toContain('data-testid="crop-output-height"');
    });

    test("平台卡数量与预设一致，且无源图时提交按钮 disabled、不渲染画布", async () => {
        const html = await render();
        const cards = html.match(/data-testid="crop-platform-/g) ?? [];
        expect(cards.length).toBe(PLATFORM_PRESETS.length);
        expect(/<button(?=[^>]*\bdata-testid="crop-submit")(?=[^>]*\bdisabled="")[^>]*>/.test(html)).toBe(true);
        expect(html).not.toContain('data-testid="crop-canvas"');
        expect(html).toContain('data-testid="crop-empty"');
    });
});
