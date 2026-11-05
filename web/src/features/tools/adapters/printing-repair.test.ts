import { describe, expect, test } from "bun:test";

import type { ToolTask } from "@/services/api/tools/task-machine";

import {
    PRINTING_REPAIR_TOOL_ID,
    PRINTING_REPAIR_SLUG,
    PRINTING_REPAIR_LAYOUT,
    PRINTING_REPAIR_DRAFT_KEY,
    PRINTING_REPAIR_REQUIRED_FIELDS,
    buildPrintingRepairSnapshot,
    clampCompareSplit,
    clampPoint,
    commitPrintTransform,
    compareModeLabel,
    compareRegion,
    composePrintingRepairFields,
    createPrintTransformHistory,
    createPrintingRepairTransform,
    describePrintTransform,
    getPrintingRepairSpec,
    isPrintingRepairSnapshotStale,
    missingPrintingRepairFieldBindings,
    movePrint,
    nudgePrint,
    parsePrintingRepairDraftValues,
    printCoverage,
    printHistoryLabel,
    printLayerRect,
    printLayerSize,
    printTransformSignature,
    printingRepairDownloadName,
    printingRepairInstruction,
    printingRepairSnapshotHash,
    redoPrintTransform,
    regionCropRect,
    resetPrintTransform,
    serializePrintingRepairDraftValues,
    stepPrintRotate,
    stepPrintScale,
    undoPrintTransform,
    validatePrintingRepairFile,
    validatePrintingRepairInput,
} from "../registry/printing-repair";
import {
    PRINTING_REPAIR_SEG_MAX_SIDE,
    analyzePrintPixels,
    assertPrintingRepairInput,
    buildPrintingRepairInput,
    buildPrintingRepairUnit,
    printingRepairPreflightIssues,
    printingRepairResultView,
    printingRepairRunFromTask,
    printingRepairRunFromStoredTask,
    latestPrintingRepairTask,
    segAnalysisSize,
    toPrintingRepairReference,
} from "./printing-repair";

/** 底图 1000×1000、印花 500×500：fit = 2，scale = 1 时印花层正好铺满底图。 */
const BASE = { width: 1000, height: 1000 };
const PRINT = { width: 500, height: 500 };

function snapshotOf(overrides: { strength?: number; clientOperationId?: string; segDataUrl?: string } = {}) {
    return buildPrintingRepairSnapshot({
        baseAssetId: "base-1",
        baseName: "shoe.jpg",
        baseWidth: BASE.width,
        baseHeight: BASE.height,
        printAssetId: "print-1",
        printName: "flower.png",
        printWidth: PRINT.width,
        printHeight: PRINT.height,
        transform: createPrintingRepairTransform(),
        strength: overrides.strength ?? 70,
        segDataUrl: overrides.segDataUrl ?? "data:image/png;base64,AAA",
        segCoverage: 0.42,
        segWidth: 512,
        segHeight: 512,
        draftRevision: 7,
        clientOperationId: overrides.clientOperationId ?? "op-1",
    });
}

function toolTask(overrides: Partial<ToolTask> = {}): ToolTask {
    return {
        id: "task-1",
        toolId: PRINTING_REPAIR_TOOL_ID,
        status: "succeeded",
        clientOperationId: "op-1",
        fingerprint: "fp",
        capability: "image",
        prompt: "print",
        configSnapshot: { capability: "image", model: "m", count: "1" },
        source: { type: "upload", label: "shoe.jpg" },
        result: { items: [{ kind: "image", url: "https://cdn/x.png" }] },
        createdAt: 0,
        updatedAt: 0,
        ...overrides,
    } as ToolTask;
}

describe("印花修复规格", () => {
    test("工具在 registry 里真实存在，且是 repair 布局", () => {
        const spec = getPrintingRepairSpec();
        expect(spec?.id).toBe(PRINTING_REPAIR_TOOL_ID);
        expect(PRINTING_REPAIR_SLUG).toBe("printing-repair");
        expect(PRINTING_REPAIR_LAYOUT).toBe("repair");
        expect(PRINTING_REPAIR_DRAFT_KEY).toContain(PRINTING_REPAIR_TOOL_ID);
    });

    test("registry 的字段与页面落点完全对齐：没有静默丢参", () => {
        const spec = getPrintingRepairSpec();
        expect(spec).toBeDefined();
        const diff = missingPrintingRepairFieldBindings((spec?.fields ?? []).map((field) => field.key));
        expect(diff.unbound).toEqual([]);
        expect(diff.extra).toEqual([]);
        // 13 个字段里只有 imageResultUrl 是输出回填，其余 12 个都必须进请求
        expect(PRINTING_REPAIR_REQUIRED_FIELDS.length).toBe(12);
        expect(PRINTING_REPAIR_REQUIRED_FIELDS).not.toContain("imageResultUrl");
    });
});

describe("印花定位几何（Step 3）", () => {
    test("fit / 层尺寸 / 矩形 / 覆盖率：印花层按比例落在底图上", () => {
        const transform = createPrintingRepairTransform();
        expect(printLayerSize(transform, PRINT, BASE)).toEqual({ width: 1000, height: 1000 });
        expect(printLayerRect(transform, PRINT, BASE)).toEqual({ x: 0, y: 0, width: 1000, height: 1000 });
        expect(printCoverage(transform, PRINT, BASE)).toBe(1);

        const half = createPrintingRepairTransform({ scale: 0.5 });
        expect(printLayerSize(half, PRINT, BASE)).toEqual({ width: 500, height: 500 });
        expect(printLayerRect(half, PRINT, BASE)).toEqual({ x: 250, y: 250, width: 500, height: 500 });
        expect(printCoverage(half, PRINT, BASE)).toBe(1);
    });

    test("拖到画面外会被钳在边界：不会整块飘出底图，边缘仍有四分之一交叠", () => {
        const outside = createPrintingRepairTransform({ point: { x: 2, y: 2 }, scale: 0.2 });
        // point 被 clamp 到 (1,1)：200×200 的层贴着右下角，只压住 100×100
        expect(outside.point).toEqual({ x: 1, y: 1 });
        expect(printCoverage(outside, PRINT, BASE)).toBeCloseTo(0.25, 5);
        // 反过来：钳位后仍有交叠，所以 placement 校验不会被误触发
        const issues = validatePrintingRepairInput({
            baseUrl: "a",
            printUrl: "b",
            segUrl: "c",
            transform: outside,
            base: BASE,
            print: PRINT,
            strength: 70,
        });
        expect(issues.map((issue) => issue.field)).not.toContain("placement");
    });

    test("拖动与键盘微调：像素位移换算成归一化位移，并钳在 0–1", () => {
        const moved = movePrint(createPrintingRepairTransform(), { dx: 100, dy: -50 }, BASE);
        expect(moved.point.x).toBeCloseTo(0.6, 5);
        expect(moved.point.y).toBeCloseTo(0.45, 5);

        const nudged = nudgePrint(createPrintingRepairTransform(), "right", BASE);
        expect(nudged.point.x).toBeCloseTo(0.504, 5);
        const fast = nudgePrint(createPrintingRepairTransform(), "left", BASE, true);
        expect(fast.point.x).toBeCloseTo(0.48, 5);

        expect(clampPoint({ x: 3, y: -2 })).toEqual({ x: 1, y: 0 });
    });

    test("缩放/旋转步进：5% 与 5°，按住 Shift 变成 15% / 15°", () => {
        expect(stepPrintScale(createPrintingRepairTransform(), "in").scale).toBeCloseTo(1.05, 5);
        expect(stepPrintScale(createPrintingRepairTransform(), "out", true).scale).toBeCloseTo(0.85, 5);
        expect(stepPrintRotate(createPrintingRepairTransform(), "cw").rotate).toBeCloseTo(5, 5);
        expect(stepPrintRotate(createPrintingRepairTransform(), "ccw", true).rotate).toBeCloseTo(-15, 5);
    });

    test("文字描述随定位参数变化（用户能核对位置/缩放/角度）", () => {
        const text = describePrintTransform(createPrintingRepairTransform({ point: { x: 0.25, y: 0.5 }, scale: 0.5, rotate: 15 }));
        expect(text).toContain("位置 25.0% / 50.0%");
        expect(text).toContain("缩放 50%");
        expect(text).toContain("旋转 15°");
    });
});

describe("印花层撤销/重做（只有 Step 2 图层进栈）", () => {
    test("提交不同变换入栈，相同变换不重复入栈", () => {
        let history = createPrintTransformHistory();
        const same = commitPrintTransform(history, createPrintingRepairTransform());
        expect(same).toBe(history);
        expect(same.past.length).toBe(0);

        history = commitPrintTransform(history, createPrintingRepairTransform({ scale: 1.5 }));
        expect(history.past.length).toBe(1);
        expect(printHistoryLabel(history)).toBe("撤销 1 / 重做 0");
    });

    test("撤销/重做/重置：状态来回一致", () => {
        const base = createPrintTransformHistory();
        const scaled = commitPrintTransform(base, createPrintingRepairTransform({ scale: 2 }));
        const undone = undoPrintTransform(scaled);
        expect(undone.present.scale).toBe(1);
        expect(undone.future.length).toBe(1);
        const redone = redoPrintTransform(undone);
        expect(redone.present.scale).toBe(2);

        const reset = resetPrintTransform(redone);
        expect(reset.present.scale).toBe(1);
        expect(printTransformSignature(reset.present)).toBe(printTransformSignature(base.present));
    });
});

describe("提交前校验与上传校验", () => {
    test("三步素材缺一不可，缺什么说清什么", () => {
        const issues = validatePrintingRepairInput({
            baseUrl: "",
            printUrl: "",
            segUrl: "",
            transform: createPrintingRepairTransform(),
            strength: 70,
        });
        expect(issues.map((issue) => issue.field)).toEqual(["base", "print", "seg"]);
        expect(issues[0].message).toContain("Step 1");
        expect(issues[1].message).toContain("Step 2");
        expect(issues[2].message).toContain("分割图");
    });

    test("上传格式/体积/长边逐项给原因", () => {
        expect(validatePrintingRepairFile({ mimeType: "image/gif" })).toHaveLength(1);
        expect(validatePrintingRepairFile({ bytes: 25 * 1024 * 1024 })[0].message).toContain("MB");
        expect(validatePrintingRepairFile({ width: 9000, height: 9000 }).some((issue) => issue.message.includes("长边"))).toBe(true);
        expect(validatePrintingRepairFile({ mimeType: "image/png", bytes: 1024, width: 1024, height: 1024 })).toEqual([]);
    });
});

describe("快照与指纹", () => {
    test("输出尺寸缺省等于底图，快照锁定提交时的参数", () => {
        const snapshot = snapshotOf();
        expect(snapshot.baseWidth).toBe(1000);
        expect(snapshot.width).toBe(1000);
        expect(snapshot.height).toBe(1000);
        expect(snapshot.strength).toBe(70);
        expect(snapshot.segCoverage).toBeCloseTo(0.42, 5);
        expect(snapshot.clientOperationId).toBe("op-1");
        expect(snapshot.segHash.length).toBeGreaterThan(3);
        expect(snapshot.segHash).not.toBe(snapshotOf({ segDataUrl: "data:image/png;base64,BBB" }).segHash);
    });

    test("指纹只随影响产出的输入变化；强度不同即视为“来自旧版本”", () => {
        const a = snapshotOf({ strength: 70 });
        const b = snapshotOf({ strength: 70 });
        const c = snapshotOf({ strength: 90 });
        expect(printingRepairSnapshotHash(a)).toBe(printingRepairSnapshotHash(b));
        expect(printingRepairSnapshotHash(a)).not.toBe(printingRepairSnapshotHash(c));
        expect(isPrintingRepairSnapshotStale(a, c)).toBe(true);
        expect(isPrintingRepairSnapshotStale(a, b)).toBe(false);
        // 没有提交过就没有“旧版本”概念
        expect(isPrintingRepairSnapshotStale(null, a)).toBe(false);
    });
});

describe("提交载荷：13 字段全部有落点", () => {
    test("composePrintingRepairFields 带上分割图/印花/底图与定位结构", () => {
        const snapshot = snapshotOf();
        const fields = composePrintingRepairFields(snapshot, {
            imageUrl: "https://cdn/base.jpg",
            stampingFlowerUrl: "https://cdn/flower.png",
            stampingFlowerSegUrl: "data:image/png;base64,SEG",
        });
        expect(fields.imageUrl).toBe("https://cdn/base.jpg");
        expect(fields.url).toBe("https://cdn/base.jpg");
        expect(fields.stampingFlowerUrl).toBe("https://cdn/flower.png");
        expect(fields.stampingFlowerSegUrl).toBe("data:image/png;base64,SEG");
        expect(fields.width).toBe(1000);
        expect(fields.height).toBe(1000);
        expect(fields.version).toBe("v1");
        expect(fields.point).toEqual({ x: 0.5, y: 0.5 });
        expect((fields.config as Record<string, unknown>).mode).toBe("print-transfer");
        expect((fields.targetConfig as Record<string, unknown>).canvas).toEqual({ width: 1000, height: 1000 });
        for (const field of PRINTING_REPAIR_REQUIRED_FIELDS) expect(fields[field]).toBeDefined();
    });

    test("指令里写明参考图分工、定位参数与强度", () => {
        const text = printingRepairInstruction({ ...createPrintingRepairTransform({ scale: 0.5, rotate: 30 }), strength: 70 });
        expect(text).toContain("参考图 1");
        expect(text).toContain("参考图 2");
        expect(text).toContain("中心点 (50.0%, 50.0%)");
        expect(text).toContain("缩放 50%");
        expect(text).toContain("旋转 30°");
        expect(text).toContain("覆盖强度：高");
    });
});

describe("局部对比与草稿", () => {
    test("局部对比以印花中心放大，裁剪区域不越界", () => {
        const region = compareRegion(createPrintingRepairTransform({ point: { x: 0.02, y: 0.98 } }), 3);
        expect(region.width).toBeCloseTo(1 / 3, 3);
        expect(region.x).toBe(0);
        expect(region.y + region.height).toBeLessThanOrEqual(1);
        const crop = regionCropRect(region, BASE);
        expect(crop.width).toBe(333);
        expect(crop.x + crop.width).toBeLessThanOrEqual(1000);
    });

    test("滑块是百分数域，模式标签与下载名可读", () => {
        expect(clampCompareSplit(50.4)).toBe(50);
        expect(clampCompareSplit(999)).toBe(100);
        expect(clampCompareSplit(Number.NaN)).toBe(50);
        expect(compareModeLabel("slider")).toBe("滑动对比");
        expect(printingRepairDownloadName("shoe.jpg")).toBe("shoe-print-fixed.png");
    });

    test("草稿往返：刷新后定位/强度/模式/输出尺寸都恢复，脏值回落默认", () => {
        const draft = {
            transform: createPrintingRepairTransform({ point: { x: 0.3, y: 0.7 }, scale: 1.5, rotate: 45 }),
            strength: 85,
            version: "v1" as const,
            compareMode: "slider" as const,
            output: { width: 800, height: 600 },
            baseName: "shoe.jpg",
            printName: "flower.png",
        };
        const restored = parsePrintingRepairDraftValues(serializePrintingRepairDraftValues(draft));
        expect(restored.transform.point.x).toBeCloseTo(0.3, 5);
        expect(restored.transform.scale).toBeCloseTo(1.5, 5);
        expect(restored.strength).toBe(85);
        expect(restored.compareMode).toBe("slider");
        expect(restored.output).toEqual({ width: 800, height: 600 });

        const dirty = parsePrintingRepairDraftValues({ strength: 9999, version: "v9", compareMode: "nope" });
        expect(dirty.strength).toBe(100);
        expect(dirty.version).toBe("v1");
        expect(dirty.compareMode).toBe("region");
        expect(dirty.output).toEqual({ width: 0, height: 0 });
    });
});

describe("印花分割（真实像素分析，不是占位串）", () => {
    /** 构造 w×h 的 RGBA 像素：默认白底，把指定矩形涂成黑色。 */
    function pixels(w: number, h: number, black?: { x0: number; y0: number; x1: number; y1: number }) {
        const buffer = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y += 1) {
            for (let x = 0; x < w; x += 1) {
                const offset = (y * w + x) * 4;
                const inside = black ? x >= black.x0 && x < black.x1 && y >= black.y0 && y < black.y1 : false;
                const value = inside ? 0 : 255;
                buffer[offset] = value;
                buffer[offset + 1] = value;
                buffer[offset + 2] = value;
                buffer[offset + 3] = 255;
            }
        }
        return buffer;
    }

    test("白底黑印花：前景被切出来，覆盖率与蒙版长度都对得上", () => {
        const analysis = analyzePrintPixels(pixels(8, 8, { x0: 2, y0: 2, x1: 6, y1: 6 }), 8, 8);
        expect(analysis.mode).toBe("background-diff");
        expect(analysis.coverage).toBeCloseTo(16 / 64, 5);
        expect(analysis.mask.length).toBe(8 * 8 * 4);
        expect(analysis.mask[(2 * 8 + 2) * 4]).toBe(255);
        expect(analysis.mask[0]).toBe(0);
    });

    test("纯色图（没有前景）：直接报错，不提交空蒙版", () => {
        expect(() => analyzePrintPixels(pixels(8, 8), 8, 8)).toThrow();
    });

    test("像素数据不完整：报错而不是静默降级", () => {
        expect(() => analyzePrintPixels(new Uint8ClampedArray(4), 8, 8)).toThrow();
    });

    test("分析边长上限 1024，等比缩小不裁剪", () => {
        expect(segAnalysisSize(2048, 1024)).toEqual({ width: 1024, height: 512 });
        expect(segAnalysisSize(300, 200)).toEqual({ width: 300, height: 200 });
        expect(segAnalysisSize(5000, 1000, PRINTING_REPAIR_SEG_MAX_SIDE)).toEqual({ width: 1024, height: 205 });
    });
});

describe("提交守卫与任务映射", () => {
    test("只有一张参考图就拒发", async () => {
        const snapshot = snapshotOf();
        const unit = buildPrintingRepairUnit({
            snapshot,
            base: toPrintingRepairReference({ id: "b", name: "base.jpg", type: "image/png", dataUrl: "data:image/png;base64,B" }),
            print: toPrintingRepairReference({ id: "p", name: "print.png", type: "image/png", dataUrl: "data:image/png;base64,P" }),
            segDataUrl: "data:image/png;base64,S",
        });
        const input = buildPrintingRepairInput(unit, { draftRevision: 7 });
        expect(input.count).toBe(1);
        expect(input.references?.length).toBe(2);
        expect(input.fields?.draftRevision).toBe(7);
        assertPrintingRepairInput(input);
        expect(() => assertPrintingRepairInput({ ...input, references: input.references?.slice(0, 1) })).toThrow();
    });

    test("任务状态映射：成功无图＝失败，取消就是取消，不冒充成功", () => {
        const snapshot = snapshotOf();
        const unit = buildPrintingRepairUnit({
            snapshot,
            base: toPrintingRepairReference({ id: "b", name: "base.jpg", type: "image/png", dataUrl: "data:image/png;base64,B" }),
            print: toPrintingRepairReference({ id: "p", name: "print.png", type: "image/png", dataUrl: "data:image/png;base64,P" }),
            segDataUrl: "data:image/png;base64,S",
        });

        const ok = printingRepairRunFromTask(unit, toolTask());
        expect(ok.status).toBe("succeeded");
        expect(ok.image?.url).toBe("https://cdn/x.png");

        const empty = printingRepairRunFromTask(unit, toolTask({ result: { items: [] } } as unknown as Partial<ToolTask>));
        expect(empty.status).toBe("failed");
        expect(empty.error?.code).toBe("empty-result");

        const cancelled = printingRepairRunFromTask(unit, toolTask({ status: "cancelled" } as Partial<ToolTask>));
        expect(cancelled.status).toBe("cancelled");
    });

    test("结果视图：运行中/过期标记不覆盖真实状态", () => {
        expect(printingRepairResultView({}).status).toBe("idle");
        expect(printingRepairResultView({ running: true }).status).toBe("running");
        const view = printingRepairResultView({ running: true, stale: true, sourceUrl: "https://cdn/base.jpg" });
        expect(view.status).toBe("running");
        expect(view.stale).toBe(true);
    });
});

describe("印花修复工作台渲染", () => {
    test("三步分区齐全：商品图 / 正确印花 / 定位画布", async () => {
        const html = await renderWorkspace();
        expect(html).toContain('data-testid="printing-repair-workspace"');
        for (const step of [1, 2, 3]) {
            expect(html).toContain(`data-testid="printing-repair-step-${step}"`);
        }
        expect(html).toContain("上传印花有误的商品图");
        expect(html).toContain("先完成 Step 1 与 Step 2，这里会出现可拖动的印花定位画布。");
    });

    test("空状态：不再自造强度/版本/对比参数，定位控件等素材到位才出现", async () => {
        const html = await renderWorkspace();
        for (const id of ["printing-repair-strength", "printing-repair-version"]) {
            expect(html).not.toContain(`data-testid="${id}"`);
        }
        for (const mode of ["region", "side-by-side", "slider"]) {
            expect(html).not.toContain(`data-testid="printing-repair-compare-${mode}"`);
        }
        expect(html).toContain('data-testid="printing-repair-stage-empty"');
        // 没有素材时不渲染定位控件，避免用户对着空画布调参
        for (const id of ["printing-repair-scale", "printing-repair-rotate", "printing-repair-undo", "printing-repair-redo", "printing-repair-reset", "printing-repair-stage"]) {
            expect(html).not.toContain(`data-testid="${id}"`);
        }
    });

    test("没有素材时不编造可提交状态：按钮阻塞、没有结果图", async () => {
        const html = await renderWorkspace();
        const submitDisabled = /data-testid="printing-repair-submit"[^>]*disabled=""/.test(html) || /disabled=""[^>]*data-testid="printing-repair-submit"/.test(html);
        expect(submitDisabled).toBe(true);
        expect(html).toContain("暂无生成结果图");
        expect(html).not.toContain('data-testid="printing-repair-download"');
        expect(html).not.toContain('data-testid="printing-repair-base-image"');
        expect(html).not.toContain("正在修复…");
    });
});

/** 工作台渲染：无 DOM 环境用 react-dom/server 渲染真实组件（跑渲染，不是读源码）。 */
async function renderWorkspace(): Promise<string> {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        writable: true,
        value: {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => void values.set(key, value),
            removeItem: (key: string) => void values.delete(key),
            clear: () => void values.clear(),
            key: (index: number) => Array.from(values.keys())[index] ?? null,
            get length() {
                return values.size;
            },
        },
    });
    const React = await import("react");
    const { MemoryRouter } = await import("react-router");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { default: Workspace } = await import("@/components/tools/workspaces/printing-repair");
    return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Workspace)) as never);
}

describe("刷新后结果回填（任务落库 → run）", () => {
    test("取该工具最近一条任务，别的工具不参与；成功任务还原出结果图", () => {
        const older = {
            id: "task-old",
            toolId: PRINTING_REPAIR_TOOL_ID,
            status: "succeeded",
            submittedAt: 10,
            result: { items: [{ id: "i1", kind: "image", url: "https://x/old.png" }] },
        } as unknown as ToolTask;
        const newer = {
            id: "task-new",
            toolId: PRINTING_REPAIR_TOOL_ID,
            status: "succeeded",
            submittedAt: 20,
            result: { items: [{ id: "i2", kind: "image", url: "https://x/new.png" }] },
        } as unknown as ToolTask;
        const other = {
            id: "task-other",
            toolId: "FIX_COLOR",
            status: "succeeded",
            submittedAt: 30,
            result: { items: [{ id: "i3", kind: "image", url: "https://x/other.png" }] },
        } as unknown as ToolTask;

        const latest = latestPrintingRepairTask({ a: older, b: newer, c: other }, PRINTING_REPAIR_TOOL_ID);
        expect(latest?.id).toBe("task-new");

        const run = printingRepairRunFromStoredTask(newer);
        expect(run.status).toBe("succeeded");
        expect(run.task.id).toBe("task-new");
        expect(run.image?.url).toBe("https://x/new.png");
    });

    test("落库的「成功但没图」按失败回填，不补造结果", () => {
        const empty = {
            id: "task-empty",
            toolId: PRINTING_REPAIR_TOOL_ID,
            status: "succeeded",
            submittedAt: 1,
            result: { items: [] },
        } as unknown as ToolTask;
        const run = printingRepairRunFromStoredTask(empty);
        expect(run.status).toBe("failed");
        expect(run.image).toBeUndefined();
        expect(run.error?.code).toBe("empty-result");
    });
});
