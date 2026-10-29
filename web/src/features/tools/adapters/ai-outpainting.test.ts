import { describe, expect, test } from "bun:test";

import type { ToolTask } from "@/services/api/tools/task-machine";

import {
    assertMaskGeometry,
    buildOutpaintInput,
    buildOutpaintSnapshot,
    describeOutpaintRequest,
    isOutpaintStale,
    isRetryableOutcome,
    mapOutpaintTask,
    outpaintSnapshotHash,
    type OutpaintSource,
} from "./ai-outpainting";
import {
    AI_OUTPAINTING_ROUTE,
    AI_OUTPAINTING_TOOL_ID,
    DEFAULT_OUTPAINT_VALUES,
    OUTPAINT_DRAFT_KEY,
    OUTPAINT_HISTORY_LIMIT,
    OUTPAINT_KEYBOARD_STEP,
    OUTPAINT_KEYBOARD_STEP_LARGE,
    OUTPAINT_MAX_OUTPUT,
    OUTPAINT_MAX_PROMPT,
    applyHeight,
    applyRatio,
    applySizePreset,
    applySource,
    applyWidth,
    buildConfig,
    buildImageConfig,
    buildStageConfig,
    canRedoOutpaint,
    canUndoOutpaint,
    clampOffset,
    composeOutpaintPrompt,
    createOutpaintHistory,
    edgeExpansion,
    edgeKeyboardDelta,
    expandEdge,
    expansionDirections,
    expansionOf,
    expansionSummary,
    getAiOutpaintingSpec,
    geometryHash,
    keepRect,
    maskPlan,
    maskSyncState,
    moveOriginal,
    parseOutpaintValues,
    pushOutpaintHistory,
    redoOutpaint,
    resetOutpaintTransform,
    sizeForRatio,
    toggleLock,
    undoOutpaint,
    validateOutpaint,
    withMask,
    type OutpaintValues,
} from "../registry/ai-outpainting";

/* ------------------------------------------------------------------ *
 * fixtures
 * ------------------------------------------------------------------ */

/** 800×800 原图 → 1280×1280 画布：四边各外扩 240px，原图 1:1 居中等价。 */
function baseValues(patch: Partial<OutpaintValues> = {}): OutpaintValues {
    return {
        ...DEFAULT_OUTPAINT_VALUES,
        sourceAssetId: "asset-shoe",
        sourceName: "shoe.png",
        sourceWidth: 800,
        sourceHeight: 800,
        ratio: "1:1",
        width: 1280,
        height: 1280,
        offsetX: 240,
        offsetY: 240,
        prompt: "补一层浅灰色无缝背景",
        ...patch,
    };
}

const SYNCED_MASK_URL = "blob:mask-1280";

function withSyncedMask(values: OutpaintValues): OutpaintValues {
    return withMask(values, { maskUrl: SYNCED_MASK_URL, maskAssetId: "mask-asset" });
}

function sourceOf(values: OutpaintValues): OutpaintSource {
    return {
        assetId: values.sourceAssetId ?? "asset-shoe",
        name: values.sourceName,
        reference: {
            id: values.sourceAssetId ?? "asset-shoe",
            name: values.sourceName,
            type: "image/png",
            dataUrl: "data:image/png;base64,AAAA",
        },
        width: values.sourceWidth,
        height: values.sourceHeight,
    };
}

/* ------------------------------------------------------------------ *
 * 契约
 * ------------------------------------------------------------------ */

describe("AI_OUTPAINTING registry contract", () => {
    test("路由 / 草稿键 / 工具 id 与共享 registry 一致", () => {
        const spec = getAiOutpaintingSpec();
        expect(spec.id).toBe(AI_OUTPAINTING_TOOL_ID);
        expect(spec.route).toBe(AI_OUTPAINTING_ROUTE);
        expect(spec.layout).toBe("outpaint");
        expect(OUTPAINT_DRAFT_KEY).toBe("tool-draft:v1:AI_OUTPAINTING");
    });

    test("尺寸按比例推导并 8px 对齐、边界钳制", () => {
        expect(sizeForRatio("1:1", 1024)).toEqual({ width: 1024, height: 1024 });
        expect(sizeForRatio("16:9", 1024)).toEqual({ width: 1024, height: 576 });
        expect(sizeForRatio("9:16", 1024)).toEqual({ width: 576, height: 1024 });
        expect(sizeForRatio("1:1", 99999)).toEqual({ width: 4096, height: 4096 });
        expect(sizeForRatio("1:1", 10)).toEqual({ width: 256, height: 256 });
    });
});

/* ------------------------------------------------------------------ *
 * 几何：改比例不拉伸原图
 * ------------------------------------------------------------------ */

describe("比例与尺寸联动", () => {
    test("改比例只改画布尺寸，原图仍是 1:1 像素不缩放", () => {
        const before = baseValues();
        const next = applyRatio(before, "16:9");
        expect(next.width).toBe(1024);
        expect(next.height).toBe(576);
        // 原图尺寸一像素都不能变
        expect(next.sourceWidth).toBe(before.sourceWidth);
        expect(next.sourceHeight).toBe(before.sourceHeight);
        // 原图放不进新的扁画布 → 居中（水平方向外扩为 0，垂直方向被裁）
        expect(next.offsetX).toBe(112);
        expect(next.offsetY).toBe(-112);
    });

    test("改比例时原图仍能完整放下就保留原位置", () => {
        const before = baseValues({ sourceWidth: 600, sourceHeight: 600, offsetX: 0, offsetY: 240 });
        const next = applyRatio(before, "3:4");
        expect(next.width).toBe(768);
        expect(next.height).toBe(1024);
        // 800→600 的原图在 768×1024 里放得下，位置原样保留（不重排）
        expect(next.offsetX).toBe(0);
        expect(next.offsetY).toBe(240);
    });

    test("手动改宽时高度跟比例走，尺寸与比例保持同步", () => {
        const next = applyWidth(baseValues(), 1600);
        expect(next.width).toBe(1600);
        expect(next.height).toBe(1600);
        expect(next.sizePreset).toBe("custom");
        const tall = applyWidth(baseValues({ ratio: "4:3" }), 1200);
        expect(tall.width).toBe(1200);
        expect(tall.height).toBe(904);
    });

    test("手动改高同理", () => {
        const next = applyHeight(baseValues({ ratio: "3:4" }), 1200);
        expect(next.height).toBe(1200);
        expect(next.width).toBe(904);
    });

    test("尺寸预设切换保持当前比例", () => {
        const next = applySizePreset(baseValues({ ratio: "16:9" }), "hd");
        expect(next.width).toBe(1536);
        expect(next.height).toBe(864);
        expect(next.sizePreset).toBe("hd");
    });
});

/* ------------------------------------------------------------------ *
 * 几何：拖拽扩图边界
 * ------------------------------------------------------------------ */

describe("拖拽扩图边界", () => {
    test("拖左边界：画布变宽且原图视觉位置不动", () => {
        const before = baseValues();
        const next = expandEdge(before, "left", 200);
        expect(next.width).toBe(1480);
        expect(next.offsetX).toBe(before.offsetX + 200);
        expect(next.offsetY).toBe(before.offsetY);
        // 原图落在画布上的绝对位置不变
        expect(next.offsetX - 200).toBe(before.offsetX);
    });

    test("拖上边界同理", () => {
        const before = baseValues();
        const next = expandEdge(before, "top", 120);
        expect(next.height).toBe(1400);
        expect(next.offsetY).toBe(before.offsetY + 120);
    });

    test("拖右 / 下边界只改画布，不动原图", () => {
        const before = baseValues();
        const right = expandEdge(before, "right", 240);
        expect(right.width).toBe(1520);
        expect(right.offsetX).toBe(before.offsetX);
        const bottom = expandEdge(before, "bottom", 240);
        expect(bottom.height).toBe(1520);
        expect(bottom.offsetY).toBe(before.offsetY);
    });

    test("向内拖动会缩小画布但不会突破最小边", () => {
        const next = expandEdge(baseValues(), "right", -5000);
        expect(next.width).toBe(256);
    });

    test("向外拖动不会突破最大边", () => {
        const next = expandEdge(baseValues(), "right", 5000);
        expect(next.width).toBe(4096);
    });
});

/* ------------------------------------------------------------------ *
 * 原图锁定 / 保留区域
 * ------------------------------------------------------------------ */

describe("原图锁定与保留区域", () => {
    test("锁定状态下拖动原图被拒绝", () => {
        const before = baseValues({ locked: true });
        const next = moveOriginal(before, 100, 100);
        expect(next).toBe(before);
        expect(next.offsetX).toBe(before.offsetX);
    });

    test("解锁后可以移动原图，但不会把原图拖出画布", () => {
        const unlocked = baseValues({ locked: false });
        const moved = moveOriginal(unlocked, 60, -40);
        expect(moved.offsetX).toBe(300);
        expect(moved.offsetY).toBe(200);
        const extreme = moveOriginal(unlocked, 99999, 99999);
        expect(extreme.offsetX).toBe(1280 - 200);
        expect(extreme.offsetY).toBe(1280 - 200);
    });

    test("toggleLock 翻转锁定态", () => {
        expect(toggleLock(baseValues({ locked: true })).locked).toBe(false);
        expect(toggleLock(baseValues({ locked: false })).locked).toBe(true);
    });

    test("保留矩形 = 原图 ∩ 画布", () => {
        expect(keepRect(baseValues())).toEqual({ x: 240, y: 240, width: 800, height: 800 });
        expect(keepRect(baseValues({ offsetX: -200, offsetY: 240 }))).toEqual({ x: 0, y: 240, width: 600, height: 800 });
        expect(keepRect(baseValues({ offsetX: -800, offsetY: 0 }))).toBeNull();
    });

    test("外扩方向与像素随几何同步", () => {
        const balanced = baseValues();
        expect(expansionOf(balanced)).toEqual({ left: 240, top: 240, right: 240, bottom: 240 });
        expect(expansionDirections(balanced).map((item) => item.key)).toEqual(["top", "bottom", "left", "right"]);
        expect(expansionSummary(balanced)).toBe("上 240px · 下 240px · 左 240px · 右 240px");

        const oneSide = baseValues({ offsetX: 0 });
        expect(expansionOf(oneSide).left).toBe(0);
        expect(expansionDirections(oneSide).map((item) => item.key)).toEqual(["top", "bottom", "right"]);
    });

    test("恢复默认尺寸清掉扩展变换", () => {
        const reset = resetOutpaintTransform(baseValues({ offsetX: 300, offsetY: 260, ratio: "16:9", width: 1536, height: 864 }));
        expect(reset.ratio).toBe("original");
        expect(reset.width).toBe(800);
        expect(reset.height).toBe(800);
        expect(reset.offsetX).toBe(0);
        expect(reset.offsetY).toBe(0);
        expect(expansionOf(reset)).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
    });

    test("clampOffset 至少保留 25% 原图在画布内", () => {
        const clamped = clampOffset({ width: 1280, height: 1280, sourceWidth: 800, sourceHeight: 800 }, { x: 9999, y: -9999 });
        expect(clamped.x).toBe(1280 - 200);
        expect(clamped.y).toBe(-600);
    });
});

/* ------------------------------------------------------------------ *
 * 蒙版同步
 * ------------------------------------------------------------------ */

describe("蒙版与比例/尺寸同步", () => {
    test("蒙版画布尺寸永远等于画布尺寸", () => {
        const plan = maskPlan(baseValues());
        expect(plan.canvasWidth).toBe(1280);
        expect(plan.canvasHeight).toBe(1280);
        expect(plan.keep).toEqual({ x: 240, y: 240, width: 800, height: 800 });
        expect(plan.geometryHash).toBe(geometryHash(baseValues()));
    });

    test("改比例 / 拖边界后蒙版 hash 变化（旧蒙版立即判定为过期）", () => {
        const values = withSyncedMask(baseValues());
        expect(maskSyncState(values)).toBe("synced");
        const wider = expandEdge(values, "left", 160);
        expect(maskSyncState(wider)).toBe("stale");
        const reMasked = withMask(wider, { maskUrl: "blob:mask-1440" });
        expect(maskSyncState(reMasked)).toBe("synced");
    });

    test("没有蒙版时状态为 missing", () => {
        expect(maskSyncState(baseValues())).toBe("missing");
    });

    test("蒙版保留区始终落在画布内", () => {
        expect(() => assertMaskGeometry(baseValues())).not.toThrow();
        expect(() => assertMaskGeometry(baseValues({ offsetX: -900 }))).toThrow(/完全在画布外/);
    });
});

/* ------------------------------------------------------------------ *
 * 校验
 * ------------------------------------------------------------------ */

describe("提交前校验", () => {
    test("完整几何通过校验", () => {
        expect(validateOutpaint(baseValues())).toEqual([]);
    });

    test("缺原图 / 缺提示词 / 无外扩 / 数量越界都会被拦下", () => {
        const noSource = validateOutpaint(baseValues({ sourceAssetId: null, sourceWidth: 0, sourceHeight: 0 }));
        expect(noSource.map((issue) => issue.field)).toContain("imageUrl");

        const noPrompt = validateOutpaint(baseValues({ prompt: "   " }));
        expect(noPrompt.filter((issue) => issue.field === "prompt")).toEqual([]);

        const tooLong = validateOutpaint(baseValues({ prompt: "x".repeat(OUTPAINT_MAX_PROMPT + 5) }));
        expect(tooLong.map((issue) => issue.code)).toContain("prompt-too-long");

        const noExpansion = validateOutpaint(baseValues({ width: 800, height: 800, offsetX: 0, offsetY: 0 }));
        expect(noExpansion.map((issue) => issue.code)).toContain("no-expansion");

        const badCount = validateOutpaint(baseValues({ outputNum: OUTPAINT_MAX_OUTPUT + 1 }));
        expect(badCount.map((issue) => issue.field)).toContain("outputNum");

        const badRatio = validateOutpaint(baseValues({ ratio: "16:9", width: 1280, height: 1280 }));
        expect(badRatio.map((issue) => issue.code)).toContain("ratio-mismatch");
    });

    test("原图完全移出画布时报保留区为空", () => {
        const issues = validateOutpaint(baseValues({ offsetX: -2000, offsetY: -2000 }));
        expect(issues.map((issue) => issue.code)).toContain("keep-empty");
    });
});

/* ------------------------------------------------------------------ *
 * Prompt / 字段
 * ------------------------------------------------------------------ */

describe("prompt 与结构化字段", () => {
    test("prompt 携带真实尺寸、位置、外扩方向与用户内容", () => {
        const prompt = composeOutpaintPrompt({ values: baseValues(), userPrompt: "补浅灰渐变背景" });
        expect(prompt).toContain("1280×1280");
        expect(prompt).toContain("原图 800×800");
        expect(prompt).toContain("(240, 240)");
        expect(prompt).toContain("上 240px");
        expect(prompt).toContain("补浅灰渐变背景");
        expect(prompt).toContain("不拉伸");
        // 不出现任何模型/算力措辞
        expect(prompt).not.toMatch(/gpt|dall|flux|gpu|算力/i);
    });

    test("config / imageConfig / stageConfig 全部来自当前几何", () => {
        const values = withSyncedMask(baseValues());
        const config = buildConfig(values);
        expect(config.width).toBe(1280);
        expect(config.expansion).toEqual({ left: 240, top: 240, right: 240, bottom: 240 });
        expect(config.locked).toBe(true);
        expect(config.editFlag).toBe(true);
        expect(config.maskSync).toBe("synced");
        expect(config.geometryHash).toBe(geometryHash(values));

        expect(buildImageConfig(values)).toEqual({ ratio: "1:1", width: 1280, height: 1280, outputNum: 4 });

        const stage = buildStageConfig(values);
        expect(stage.step).toBe("ready");
        expect(stage.hasExpansion).toBe(true);
        expect(stage.editFlag).toBe(true);

        expect(buildStageConfig(baseValues({ sourceAssetId: null })).step).toBe("upload");
        expect(buildStageConfig(baseValues(), { running: true }).step).toBe("running");
    });
});

/* ------------------------------------------------------------------ *
 * 请求
 * ------------------------------------------------------------------ */

describe("真实请求组装", () => {
    test("原图 + 蒙版双参考，计数与字段齐全", () => {
        const values = withSyncedMask(baseValues());
        const input = buildOutpaintInput({ values, source: sourceOf(values), mask: { url: SYNCED_MASK_URL, id: "mask-asset" } });

        expect(input.toolId).toBe("AI_OUTPAINTING");
        expect(input.count).toBe(4);
        expect(input.references).toHaveLength(2);
        expect(input.references?.[0].dataUrl).toStartWith("data:image/png");
        expect(input.references?.[1].name).toBe("outpaint-mask.png");

        const fields = input.fields ?? {};
        expect(fields.maskUrl).toBe(SYNCED_MASK_URL);
        expect(fields.imageUrl).toBe("data:image/png;base64,AAAA");
        expect(fields.originImageUrl).toBe(fields.imageUrl);
        expect(fields.width).toBe(1280);
        expect(fields.height).toBe(1280);
        expect(fields.ratio).toBe("1:1");
        expect(fields.outputNum).toBe(4);
        expect(fields.editFlag).toBe(true);
        expect(fields.imageName).toBe("shoe.png");
        expect(fields.imageExpandUrl).toBe("");
        expect((fields.imageConfig as { width: number }).width).toBe(1280);
        expect((fields.config as { geometryHash: string }).geometryHash).toBe(geometryHash(values));
        expect((fields.stageConfig as { step: string }).step).toBe("ready");
        expect(String(fields.prompt)).toContain("补一层浅灰色无缝背景");

        expect(describeOutpaintRequest(input)).toContain("references=2");
    });

    test("自定义比例写进 ratio 字段", () => {
        const values = withSyncedMask(baseValues({ ratio: "custom", width: 1280, height: 960, offsetY: 80 }));
        const input = buildOutpaintInput({ values, source: sourceOf(values), mask: { url: SYNCED_MASK_URL } });
        expect(input.fields?.ratio).toBe("1280:960");
        expect(validateOutpaint(values)).toEqual([]);
    });

    test("蒙版缺失或过期直接拒绝提交（不静默丢参）", () => {
        const values = baseValues();
        expect(() => buildOutpaintInput({ values, source: sourceOf(values), mask: null })).toThrow(/缺少扩图蒙版/);

        const stale = withSyncedMask(baseValues({ locked: false }));
        const moved = moveOriginal(stale, 40, 0);
        expect(() =>
            buildOutpaintInput({ values: moved, source: sourceOf(moved), mask: { url: SYNCED_MASK_URL } }),
        ).toThrow(/蒙版与当前画布几何不一致/);
    });

    test("参数不完整时拒绝提交，不发出半成品请求", () => {
        // 提示词在原站是可选的（留空自动补续画描述），所以这里用「缺原图」作为不完整参数
        const values = withSyncedMask(baseValues({ sourceAssetId: "", prompt: "" }));
        expect(() => buildOutpaintInput({ values, source: sourceOf(values), mask: { url: SYNCED_MASK_URL } })).toThrow(/扩图参数不完整/);
    });
});

/* ------------------------------------------------------------------ *
 * 快照与结果
 * ------------------------------------------------------------------ */

describe("快照与结果映射", () => {
    test("快照 hash 稳定，输入变化即变", () => {
        const values = withSyncedMask(baseValues());
        expect(outpaintSnapshotHash(values)).toBe(outpaintSnapshotHash(withSyncedMask(baseValues())));
        expect(outpaintSnapshotHash(values)).not.toBe(outpaintSnapshotHash(withSyncedMask(baseValues({ outputNum: 2 }))));
        expect(outpaintSnapshotHash(values)).not.toBe(outpaintSnapshotHash(withSyncedMask(baseValues({ prompt: "换个说法" }))));
        expect(outpaintSnapshotHash(values)).not.toBe(outpaintSnapshotHash(expandEdge(withSyncedMask(baseValues()), "right", 40)));

        const snapshot = buildOutpaintSnapshot(values);
        expect(snapshot.geometryHash).toBe(geometryHash(values));
        expect(snapshot.maskUrl).toBe(SYNCED_MASK_URL);
    });

    test("结果过期判定跟随当前输入", () => {
        const values = withSyncedMask(baseValues());
        const outcome = mapOutpaintTask(values, {
            id: "task-1",
            toolId: "AI_OUTPAINTING",
            status: "succeeded",
            result: { items: [{ id: "img-1", kind: "image", url: "https://cdn.example/out.png" }], receivedAt: 1 },
        } as unknown as ToolTask);
        expect(isOutpaintStale(outcome, values)).toBe(false);
        expect(isOutpaintStale(outcome, expandEdge(values, "left", 80))).toBe(true);
        expect(isOutpaintStale(null, values)).toBe(false);
    });

    test("成功但有图 → imageExpandUrl 指向第一张结果", () => {
        const values = withSyncedMask(baseValues());
        const outcome = mapOutpaintTask(values, {
            id: "task-1",
            status: "succeeded",
            result: {
                items: [
                    { id: "img-1", kind: "image", url: "https://cdn.example/a.png" },
                    { id: "img-2", kind: "image", dataUrl: "data:image/png;base64,BBBB" },
                ],
                receivedAt: 1,
            },
        } as unknown as ToolTask);
        expect(outcome.status).toBe("succeeded");
        expect(outcome.images).toHaveLength(2);
        expect(outcome.imageExpandUrl).toBe("https://cdn.example/a.png");
        expect(isRetryableOutcome(outcome)).toBe(false);
    });

    test("上游 success 但无图 → failed(empty-result)，不伪造结果", () => {
        const values = withSyncedMask(baseValues());
        const outcome = mapOutpaintTask(values, {
            id: "task-2",
            status: "succeeded",
            result: { items: [], receivedAt: 1 },
        } as unknown as ToolTask);
        expect(outcome.status).toBe("failed");
        expect(outcome.error?.code).toBe("empty-result");
        expect(outcome.imageExpandUrl).toBeUndefined();
        expect(isRetryableOutcome(outcome)).toBe(true);
    });

    test("失败 / 取消 / running 分别映射，running 不算失败", () => {
        const values = withSyncedMask(baseValues());
        const failed = mapOutpaintTask(values, {
            id: "task-3",
            status: "failed",
            error: { code: "provider-500", message: "上游 500", retryable: true },
        } as unknown as ToolTask);
        expect(failed.status).toBe("failed");
        expect(failed.error?.message).toBe("上游 500");

        const cancelled = mapOutpaintTask(values, { id: "task-4", status: "cancelled" } as unknown as ToolTask);
        expect(cancelled.status).toBe("cancelled");
        expect(isRetryableOutcome(cancelled)).toBe(false);

        const running = mapOutpaintTask(values, { id: "task-5", status: "running" } as unknown as ToolTask);
        expect(running.status).toBe("unknown");
        expect(isRetryableOutcome(running)).toBe(true);
    });
});

/* ------------------------------------------------------------------ *
 * 草稿
 * ------------------------------------------------------------------ */

describe("草稿恢复", () => {
    test("脏数据被钳制回合法范围", () => {
        const parsed = parseOutpaintValues({
            sourceAssetId: "a1",
            sourceWidth: 800,
            sourceHeight: 800,
            ratio: "not-a-ratio",
            width: 99999,
            height: -5,
            outputNum: 99,
            prompt: "x".repeat(OUTPAINT_MAX_PROMPT + 50),
            locked: false,
        });
        expect(parsed.ratio).toBe("1:1");
        expect(parsed.width).toBe(4096);
        expect(parsed.height).toBe(256);
        expect(parsed.outputNum).toBe(OUTPAINT_MAX_OUTPUT);
        expect(parsed.prompt).toHaveLength(OUTPAINT_MAX_PROMPT);
        expect(parsed.locked).toBe(false);
    });

    test("空草稿回到默认值", () => {
        expect(parseOutpaintValues(undefined)).toEqual(DEFAULT_OUTPAINT_VALUES);
    });

    test("换原图会重置几何并清掉旧蒙版", () => {
        const values = withSyncedMask(baseValues());
        const next = applySource(values, { assetId: "asset-new", name: "new.png", width: 1200, height: 1600 });
        expect(next.sourceAssetId).toBe("asset-new");
        expect(next.width).toBe(1200);
        expect(next.height).toBe(1600);
        expect(next.offsetX).toBe(0);
        expect(next.offsetY).toBe(0);
        expect(next.maskUrl).toBe("");
        expect(maskSyncState(next)).toBe("missing");
    });
});

/* ------------------------------------------------------------------ *
 * TASK-013 增补：边界键盘微调 + TransformHistory（撤销/重做）
 * ------------------------------------------------------------------ */

describe("边界键盘微调", () => {
    test("方向键移动的是那条边：左右边只吃 ←/→，上下边只吃 ↑/↓", () => {
        expect(edgeKeyboardDelta("left", "ArrowLeft")).toBe(OUTPAINT_KEYBOARD_STEP);
        expect(edgeKeyboardDelta("left", "ArrowRight")).toBe(-OUTPAINT_KEYBOARD_STEP);
        expect(edgeKeyboardDelta("right", "ArrowRight")).toBe(OUTPAINT_KEYBOARD_STEP);
        expect(edgeKeyboardDelta("right", "ArrowLeft")).toBe(-OUTPAINT_KEYBOARD_STEP);
        expect(edgeKeyboardDelta("top", "ArrowUp")).toBe(OUTPAINT_KEYBOARD_STEP);
        expect(edgeKeyboardDelta("bottom", "ArrowDown")).toBe(OUTPAINT_KEYBOARD_STEP);
        // 交叉轴不误改、其它键不误改
        expect(edgeKeyboardDelta("left", "ArrowUp")).toBe(0);
        expect(edgeKeyboardDelta("top", "ArrowLeft")).toBe(0);
        expect(edgeKeyboardDelta("bottom", "Enter")).toBe(0);
    });

    test("Shift 为 64px 大步长", () => {
        expect(edgeKeyboardDelta("right", "ArrowRight", true)).toBe(OUTPAINT_KEYBOARD_STEP_LARGE);
        expect(OUTPAINT_KEYBOARD_STEP_LARGE).toBeGreaterThan(OUTPAINT_KEYBOARD_STEP);
    });

    test("键盘扩 8px 再用反方向键收回，回到原始几何（可逆）", () => {
        const start = baseValues();
        const expanded = expandEdge(start, "right", edgeKeyboardDelta("right", "ArrowRight"));
        expect(expanded.width).toBe(start.width + 8);
        const back = expandEdge(expanded, "right", edgeKeyboardDelta("right", "ArrowLeft"));
        expect(back.width).toBe(start.width);
        expect(geometryHash(back)).toBe(geometryHash(start));
    });

    test("左边界外扩时原图坐标同步平移，原图 1:1 未被缩放", () => {
        const start = baseValues();
        const expanded = expandEdge(start, "left", 8);
        expect(expanded.width).toBe(start.width + 8);
        expect(expanded.offsetX).toBe(start.offsetX + 8);
        // 画布向左生长，画布原点左移 → 原图相对画布左边距同步 +8，右边距不变
        expect(keepRect(expanded)?.width).toBe(keepRect(start)?.width);
        const rightGap = (v: OutpaintValues) => v.width - (v.offsetX + v.sourceWidth);
        expect(rightGap(expanded)).toBe(rightGap(start));
        expect(expanded.sourceWidth).toBe(start.sourceWidth);
    });

    test("edgeExpansion 报告每条边的外扩像素，无外扩为 0", () => {
        const values = baseValues({ sourceWidth: 800, sourceHeight: 800, width: 800, height: 800, offsetX: 0, offsetY: 0 });
        expect(edgeExpansion(values, "left")).toBe(0);
        const expanded = expandEdge(values, "left", 40);
        expect(edgeExpansion(expanded, "left")).toBeGreaterThan(0);
    });
});

describe("TransformHistory 撤销/重做", () => {
    test("几何变化入栈，可撤销可重做", () => {
        const start = createOutpaintHistory(baseValues());
        expect(canUndoOutpaint(start)).toBe(false);
        expect(canRedoOutpaint(start)).toBe(false);

        const step1 = pushOutpaintHistory(start, expandEdge(start.present, "right", 40));
        expect(canUndoOutpaint(step1)).toBe(true);
        expect(step1.present.width).toBe(start.present.width + 40);

        const undone = undoOutpaint(step1);
        expect(undone.present.width).toBe(start.present.width);
        expect(canRedoOutpaint(undone)).toBe(true);

        const redone = redoOutpaint(undone);
        expect(redone.present.width).toBe(start.present.width + 40);
    });

    test("只改 prompt / 数量不算一步，不污染撤销栈", () => {
        const start = createOutpaintHistory(baseValues());
        const typed = pushOutpaintHistory(start, { ...start.present, prompt: "补出水泥地与柔和侧光" });
        expect(canUndoOutpaint(typed)).toBe(false);
        expect(typed.present.prompt).toBe("补出水泥地与柔和侧光");

        const counted = pushOutpaintHistory(typed, { ...typed.present, outputNum: 2 });
        expect(canUndoOutpaint(counted)).toBe(false);
    });

    test("撤销只回退几何，保留当前 prompt / 输出数量 / 蒙版", () => {
        const start = createOutpaintHistory(baseValues());
        const typed = pushOutpaintHistory(start, { ...start.present, prompt: "保留文字", outputNum: 2 });
        const moved = pushOutpaintHistory(typed, expandEdge(typed.present, "top", 32));
        const undone = undoOutpaint(moved);
        expect(undone.present.height).toBe(start.present.height);
        expect(undone.present.prompt).toBe("保留文字");
        expect(undone.present.outputNum).toBe(2);
    });

    test("新操作清空 redo 分支", () => {
        const start = createOutpaintHistory(baseValues());
        const moved = pushOutpaintHistory(start, expandEdge(start.present, "right", 40));
        const undone = undoOutpaint(moved);
        expect(canRedoOutpaint(undone)).toBe(true);
        const branched = pushOutpaintHistory(undone, expandEdge(undone.present, "left", 24));
        expect(canRedoOutpaint(branched)).toBe(false);
    });

    test("历史栈有上限，不会无限增长", () => {
        let history = createOutpaintHistory(baseValues());
        for (let index = 0; index < OUTPAINT_HISTORY_LIMIT + 12; index += 1) {
            history = pushOutpaintHistory(history, expandEdge(history.present, "bottom", 8));
        }
        expect(history.past.length).toBe(OUTPAINT_HISTORY_LIMIT);
    });

    test("空栈撤销/重做是幂等的（返回原对象）", () => {
        const start = createOutpaintHistory(baseValues());
        expect(undoOutpaint(start)).toBe(start);
        expect(redoOutpaint(start)).toBe(start);
    });
});
