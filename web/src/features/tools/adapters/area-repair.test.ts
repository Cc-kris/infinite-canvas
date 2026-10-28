import { describe, expect, test } from "bun:test";

import type { ToolTask } from "@/services/api/tools/task-machine";

import {
    AREA_REPAIR_DEFAULT_OUTPUT,
    AREA_REPAIR_OUTPUT_OPTIONS,
    AREA_REPAIR_PROMPT_MAX,
    AREA_REPAIR_ROUTE,
    AREA_REPAIR_SLUG,
    AREA_REPAIR_TOOL_ID,
    MASK_BRUSH_MAX,
    MASK_BRUSH_MIN,
    MASK_FEATHER_MAX,
    MASK_FEATHER_MIN,
    buildAreaRepairSnapshot,
    clampBrushSize,
    clampFeather,
    composeMaskFields,
    coverageRatio,
    createMaskHistory,
    createMaskState,
    createStroke,
    describeCoverage,
    getAreaRepairSpec,
    maskCoverage,
    maskHistoryLabel,
    maskIsEmpty,
    normalizeOutputNum,
    normalizePoint,
    parseMaskDraftValues,
    pushMaskStroke,
    rasterizeMask,
    redoMaskStroke,
    resetMaskHistory,
    serializeMaskDraftValues,
    snapshotHash,
    undoMaskStroke,
    validateAreaRepairInput,
    type MaskPoint,
    type MaskState,
} from "../registry/area-repair";
import {
    AreaRepairMaskError,
    auditAreaRepairFields,
    buildAreaRepairInput,
    buildAreaRepairUnits,
    composeAreaRepairPrompt,
    mapAreaRepairTaskToOutcome,
    maskRenderSize,
    renderMaskPng,
    runAreaRepairUnits,
    type AreaRepairRunPort,
    type MaskCanvas,
    type MaskPaintContext,
} from "./area-repair";

/* ------------------------------------------------------------------ *
 * 夹具
 * ------------------------------------------------------------------ */

const IMAGE_REF = { id: "asset-1", name: "sofa.png", type: "image/png", dataUrl: "data:image/png;base64,AAAA" };
const MASK_REF = { id: "mask-1", name: "mask.png", type: "image/png", dataUrl: "data:image/png;base64,BBBB" };

function strokeAt(points: MaskPoint[], tool: "brush" | "eraser" = "brush", size = 40) {
    return {
        id: `s-${points.length}-${tool}`,
        tool,
        size,
        points,
    };
}

function maskedState(overrides: Partial<MaskState> = {}): MaskState {
    const history = pushMaskStroke(
        createMaskHistory(),
        strokeAt([
            { x: 0.4, y: 0.4 },
            { x: 0.6, y: 0.6 },
        ]),
    );
    return createMaskState({ strokes: history.present, ...overrides });
}

function snapshotOf(state: MaskState, prompt = "换成米色针织沙发", outputNum = 2) {
    return buildAreaRepairSnapshot({
        imageAssetId: IMAGE_REF.id,
        imageName: IMAGE_REF.name,
        imageWidth: 1000,
        imageHeight: 800,
        state,
        prompt,
        outputNum,
    });
}

/** 记录真实绘制调用的假画布：验证导出逻辑而不是只验证返回值。 */
function fakeCanvas(log: { ops: string[]; widths: number[] }): (width: number, height: number) => MaskCanvas {
    return (width, height) => {
        const ctx: MaskPaintContext = {
            fillStyle: "",
            strokeStyle: "",
            lineWidth: 0,
            lineCap: "",
            lineJoin: "",
            filter: "",
            globalCompositeOperation: "",
            fillRect: () => log.ops.push("fillRect"),
            beginPath: () => log.ops.push("beginPath"),
            moveTo: (x, y) => log.ops.push(`moveTo:${Math.round(x)},${Math.round(y)}`),
            lineTo: (x, y) => log.ops.push(`lineTo:${Math.round(x)},${Math.round(y)}`),
            stroke: () => {
                log.ops.push(`stroke:${ctx.strokeStyle}:${Math.round(ctx.lineWidth)}`);
                log.widths.push(ctx.lineWidth);
            },
            drawImage: () => log.ops.push("drawImage"),
        };
        return {
            width,
            height,
            getContext: () => ctx,
            toDataURL: () => `data:image/png;base64,SIZE-${width}x${height}`,
        };
    };
}

function fakeTask(overrides: Partial<ToolTask> = {}): ToolTask {
    return {
        id: "task-1",
        status: "succeeded",
        result: { items: [{ kind: "image", dataUrl: "data:image/png;base64,RESULT" }] },
        ...overrides,
    } as unknown as ToolTask;
}

/* ------------------------------------------------------------------ *
 * 规格与控件
 * ------------------------------------------------------------------ */

describe("AREA_REPAIR 规格", () => {
    test("注册表里的 id/route/layout 与工作区一致", () => {
        const spec = getAreaRepairSpec();
        expect(spec.id).toBe(AREA_REPAIR_TOOL_ID);
        expect(spec.slug).toBe(AREA_REPAIR_SLUG);
        expect(spec.route).toBe(AREA_REPAIR_ROUTE);
        expect(spec.layout).toBe("mask");
        expect(AREA_REPAIR_ROUTE).toBe("/tools/smart-edit/area-repair");
    });

    test("字段覆盖图片、蒙版、描述、张数与扩边", () => {
        const keys = getAreaRepairSpec().fields.map((field) => field.key);
        expect(keys).toEqual(expect.arrayContaining(["autoExpand", "imageName", "imageUrl", "maskUrl", "outputNum", "prompt"]));
    });

    test("笔刷/羽化/张数都在规格区间内收敛", () => {
        expect(clampBrushSize(-10)).toBe(MASK_BRUSH_MIN);
        expect(clampBrushSize(9999)).toBe(MASK_BRUSH_MAX);
        expect(clampBrushSize("35")).toBe(35);
        expect(clampFeather(-1)).toBe(MASK_FEATHER_MIN);
        expect(clampFeather(1000)).toBe(MASK_FEATHER_MAX);
        expect(normalizeOutputNum(0)).toBe(AREA_REPAIR_DEFAULT_OUTPUT);
        // 非法张数回落到默认值（而不是钳到边界），避免用户误以为选了 4 张
        expect(normalizeOutputNum(9)).toBe(AREA_REPAIR_DEFAULT_OUTPUT);
        expect(normalizeOutputNum(4)).toBe(4);
        expect([...AREA_REPAIR_OUTPUT_OPTIONS]).toEqual([1, 2, 3, 4]);
        expect(AREA_REPAIR_PROMPT_MAX).toBe(600);
    });

    test("归一化坐标夹在 0–1，指针移出画布也不产生越界点", () => {
        expect(normalizePoint({ x: -0.4, y: 1.7 })).toEqual({ x: 0, y: 1 });
    });
});

/* ------------------------------------------------------------------ *
 * 蒙版状态与历史
 * ------------------------------------------------------------------ */

describe("蒙版笔刷历史", () => {
    test("画笔入栈 → 撤销 → 重做 → 重置", () => {
        let history = createMaskHistory();
        expect(maskHistoryLabel(history)).toEqual({ canUndo: false, canRedo: false, strokeCount: 0 });

        history = pushMaskStroke(history, strokeAt([{ x: 0.1, y: 0.1 }]));
        history = pushMaskStroke(history, strokeAt([{ x: 0.2, y: 0.2 }]));
        expect(maskHistoryLabel(history).strokeCount).toBe(2);

        history = undoMaskStroke(history);
        expect(history.present).toHaveLength(1);
        expect(maskHistoryLabel(history)).toMatchObject({ canUndo: true, canRedo: true });

        history = redoMaskStroke(history);
        expect(history.present).toHaveLength(2);

        // 重置 = 清空全部笔画，但作为可撤销的一步，不销毁用户工作
        history = resetMaskHistory(history);
        expect(history.present).toHaveLength(0);
        expect(maskHistoryLabel(history)).toMatchObject({ canUndo: true, canRedo: false, strokeCount: 0 });
        history = undoMaskStroke(history);
        expect(history.present).toHaveLength(2);
    });

    test("撤销到底不会变成负数，重做无历史时原样返回", () => {
        let history = createMaskHistory();
        history = undoMaskStroke(history);
        expect(history.present).toHaveLength(0);
        expect(redoMaskStroke(history).present).toHaveLength(0);
    });

    test("覆盖率为 0 时判空；涂抹后非空且反选互补", () => {
        const empty = createMaskState();
        expect(maskIsEmpty(empty)).toBe(true);
        expect(coverageRatio(rasterizeMask(empty.strokes, { width: 64, height: 64 }))).toBe(0);

        const state = maskedState();
        const ratio = maskCoverage(state);
        expect(ratio).toBeGreaterThan(0);
        expect(ratio).toBeLessThan(0.5);
        expect(maskIsEmpty(state)).toBe(false);

        const inverted = maskCoverage({ ...state, inverted: true });
        expect(inverted).toBeCloseTo(1 - ratio, 5);
        expect(describeCoverage(ratio)).toContain("%");
    });

    test("自动扩边让覆盖率变大", () => {
        const base = maskedState({ autoExpand: false });
        const expanded = maskCoverage({ ...base, autoExpand: true });
        expect(expanded).toBeGreaterThan(maskCoverage(base));
    });
});

/* ------------------------------------------------------------------ *
 * 草稿往返
 * ------------------------------------------------------------------ */

describe("蒙版草稿", () => {
    test("序列化 → 解析往返一致（含笔画、羽化、反选、张数）", () => {
        const state = maskedState({ feather: 12, inverted: true, autoExpand: true, brushSize: 55, tool: "eraser" });
        const values = serializeMaskDraftValues({ state, prompt: "把沙发换成木质长凳", outputNum: 3 });
        const parsed = parseMaskDraftValues(values);
        expect(parsed.state.strokes).toHaveLength(1);
        expect(parsed.state.feather).toBe(12);
        expect(parsed.state.inverted).toBe(true);
        expect(parsed.state.autoExpand).toBe(true);
        expect(parsed.state.brushSize).toBe(55);
        expect(parsed.state.tool).toBe("eraser");
        expect(parsed.prompt).toBe("把沙发换成木质长凳");
        expect(parsed.outputNum).toBe(3);
    });

    test("空草稿给出安全默认值", () => {
        const parsed = parseMaskDraftValues({});
        expect(parsed.prompt).toBe("");
        expect(parsed.outputNum).toBe(AREA_REPAIR_DEFAULT_OUTPUT);
        expect(parsed.state.strokes).toHaveLength(0);
    });
});

/* ------------------------------------------------------------------ *
 * 提交校验
 * ------------------------------------------------------------------ */

describe("提交前校验", () => {
    test("缺图/缺蒙版/缺描述/张数越界都被拦下", () => {
        const issues = validateAreaRepairInput({ imageUrl: "", maskUrl: "", prompt: "", outputNum: 9 });
        expect(issues.map((issue) => issue.field)).toEqual(expect.arrayContaining(["image", "mask", "prompt", "outputNum"]));
    });

    test("蒙版必须与原图同尺寸", () => {
        const issues = validateAreaRepairInput({
            imageUrl: IMAGE_REF.dataUrl,
            maskUrl: MASK_REF.dataUrl,
            prompt: "换成米色针织沙发",
            outputNum: 1,
            imageWidth: 1000,
            imageHeight: 800,
            maskWidth: 500,
            maskHeight: 400,
        });
        expect(issues.map((issue) => issue.field)).toEqual(["dimensions"]);
    });

    test("描述超长被拦下", () => {
        const issues = validateAreaRepairInput({
            imageUrl: IMAGE_REF.dataUrl,
            maskUrl: MASK_REF.dataUrl,
            prompt: "x".repeat(AREA_REPAIR_PROMPT_MAX + 1),
            outputNum: 1,
        });
        expect(issues.map((issue) => issue.field)).toEqual(["prompt"]);
    });

    test("完整输入无 issue", () => {
        expect(
            validateAreaRepairInput({
                imageUrl: IMAGE_REF.dataUrl,
                maskUrl: MASK_REF.dataUrl,
                prompt: "换成米色针织沙发",
                outputNum: 2,
                imageWidth: 1000,
                imageHeight: 800,
                maskWidth: 1000,
                maskHeight: 800,
            }),
        ).toEqual([]);
    });
});

/* ------------------------------------------------------------------ *
 * 蒙版 PNG 导出（真实绘制逻辑 + 注入画布）
 * ------------------------------------------------------------------ */

describe("蒙版 PNG 导出", () => {
    test("导出尺寸与原图完全一致（不缩小）", async () => {
        const log = { ops: [] as string[], widths: [] as number[] };
        const result = await renderMaskPng(maskedState(), { width: 1000, height: 800 }, { createCanvas: fakeCanvas(log) });
        expect(result.width).toBe(1000);
        expect(result.height).toBe(800);
        expect(result.scale).toBe(1);
        expect(result.dataUrl).toBe("data:image/png;base64,SIZE-1000x800");
        expect(log.ops[0]).toBe("fillRect");
        expect(log.ops).toContain("beginPath");
        expect(log.ops.some((op) => op.startsWith("lineTo:"))).toBe(true);
    });

    test("大图也不缩边（maxSide 跟随原图长边）", () => {
        const size = maskRenderSize(4000, 1000, 4000);
        expect(size).toEqual({ width: 4000, height: 1000, scale: 1 });
        const scaled = maskRenderSize(8000, 4000, 4000);
        expect(scaled.width).toBe(4000);
        expect(scaled.scale).toBe(0.5);
    });

    test("空蒙版直接报错，不发请求", async () => {
        await expect(renderMaskPng(createMaskState(), { width: 100, height: 100 })).rejects.toBeInstanceOf(AreaRepairMaskError);
    });

    test("反选时底色为白、笔画为黑；画笔白/橡皮黑（正选）", async () => {
        const log = { ops: [] as string[], widths: [] as number[] };
        await renderMaskPng(maskedState(), { width: 200, height: 200 }, { createCanvas: fakeCanvas(log) });
        expect(log.ops.some((op) => op === "stroke:#ffffff:40")).toBe(true);

        const invertedLog = { ops: [] as string[], widths: [] as number[] };
        await renderMaskPng({ ...maskedState(), inverted: true }, { width: 200, height: 200 }, { createCanvas: fakeCanvas(invertedLog) });
        expect(invertedLog.ops.some((op) => op === "stroke:#000000:40")).toBe(true);
    });

    test("环境无 Canvas 时给出可操作错误，而不是静默空结果", async () => {
        await expect(renderMaskPng(maskedState(), { width: 100, height: 100 }, { createCanvas: () => null })).rejects.toThrow(/Canvas/);
    });
});

/* ------------------------------------------------------------------ *
 * 提示词与单元
 * ------------------------------------------------------------------ */

describe("提示词与请求单元", () => {
    test("提示词保留用户原话并声明只改蒙版内区域", () => {
        const prompt = composeAreaRepairPrompt({
            prompt: "换成米色针织沙发",
            autoExpand: true,
            inverted: false,
            index: 1,
            total: 1,
        });
        expect(prompt).toContain("换成米色针织沙发");
        expect(prompt).toContain("蒙版");
        expect(prompt.length).toBeGreaterThan(20);
    });

    test("单元数 = 输出张数，参考图固定为「原图 + 蒙版」两张", () => {
        const snapshot = snapshotOf(maskedState(), "换成米色针织沙发", 3);
        const units = buildAreaRepairUnits({ snapshot, image: IMAGE_REF, mask: MASK_REF });
        expect(units).toHaveLength(3);
        expect(units.map((unit) => unit.index)).toEqual([1, 2, 3]);
        expect(new Set(units.map((unit) => unit.id)).size).toBe(3);
        for (const unit of units) {
            expect(unit.references).toHaveLength(2);
            expect(unit.references[0]).toEqual(IMAGE_REF);
            expect(unit.references[1]).toEqual(MASK_REF);
            expect(unit.fields.maskHash).toBe(snapshot.maskHash);
            expect(unit.fields.outputNum).toBe(3);
            expect(unit.prompt).toContain("换成米色针织沙发");
        }
    });

    test("请求体带 toolId、两张参考图与真实字段", () => {
        const snapshot = snapshotOf(maskedState());
        const unit = buildAreaRepairUnits({ snapshot, image: IMAGE_REF, mask: MASK_REF })[0];
        const input = buildAreaRepairInput(unit);
        expect(input.toolId).toBe(AREA_REPAIR_TOOL_ID);
        expect(input.references).toHaveLength(2);
        expect(input.count).toBe(1);
        expect(input.fields).toMatchObject({ outputNum: snapshot.outputNum, autoExpand: snapshot.autoExpand });
    });

    test("字段守卫：规格字段全部落地时无 issue", () => {
        const snapshot = snapshotOf(maskedState());
        const unit = buildAreaRepairUnits({ snapshot, image: IMAGE_REF, mask: MASK_REF })[0];
        const audit = auditAreaRepairFields(
            getAreaRepairSpec().fields.map((field) => field.key),
            { snapshot, unit },
        );
        expect(audit.missing).toEqual([]);
        expect(audit.issues).toEqual([]);
        expect(audit.represented.maskUrl).toBe(true);
        expect(audit.represented.imageUrl).toBe(true);
    });

    test("字段守卫：少一张参考图就报出来", () => {
        const snapshot = snapshotOf(maskedState());
        const unit = { ...buildAreaRepairUnits({ snapshot, image: IMAGE_REF, mask: MASK_REF })[0], references: [IMAGE_REF] };
        const audit = auditAreaRepairFields(["imageUrl", "maskUrl"], { snapshot, unit });
        expect(audit.issues.length).toBeGreaterThan(0);
        expect(audit.issues.join(" ")).toContain("maskUrl");
    });
});

/* ------------------------------------------------------------------ *
 * 快照指纹
 * ------------------------------------------------------------------ */

describe("快照指纹", () => {
    test("同输入同指纹，改提示词/张数/笔画即变化", () => {
        const state = maskedState();
        const a = snapshotOf(state, "换成米色针织沙发", 2);
        const b = snapshotOf(state, "换成米色针织沙发", 2);
        expect(snapshotHash(a)).toBe(snapshotHash(b));

        expect(snapshotHash(snapshotOf(state, "换成木质长凳", 2))).not.toBe(snapshotHash(a));
        expect(snapshotHash(snapshotOf(state, "换成米色针织沙发", 3))).not.toBe(snapshotHash(a));
        const moreStrokes = createMaskState({
            strokes: pushMaskStroke(createMaskHistory(), strokeAt([{ x: 0.1, y: 0.9 }])).present,
        });
        expect(snapshotHash(snapshotOf(moreStrokes, "换成米色针织沙发", 2))).not.toBe(snapshotHash(a));
    });

    test("快照字段与 composeMaskFields 对齐", () => {
        const snapshot = snapshotOf(maskedState());
        const fields = composeMaskFields(snapshot);
        expect(fields.maskHash).toBe(snapshot.maskHash);
        expect(fields.maskCoverage).toBe(snapshot.maskCoverage);
        expect(fields.strokeCount).toBe(1);
        expect(fields.imageName).toBe(IMAGE_REF.name);
    });
});

/* ------------------------------------------------------------------ *
 * 结果映射与并发执行
 * ------------------------------------------------------------------ */

describe("任务结果映射", () => {
    test("成功但有图 → succeeded 且带图片", () => {
        const snapshot = snapshotOf(maskedState());
        const unit = buildAreaRepairUnits({ snapshot, image: IMAGE_REF, mask: MASK_REF })[0];
        const outcome = mapAreaRepairTaskToOutcome(unit, fakeTask());
        expect(outcome.status).toBe("succeeded");
        expect(outcome.image?.dataUrl).toBe("data:image/png;base64,RESULT");
    });

    test("成功但没图 → 视为失败（不补造结果）", () => {
        const snapshot = snapshotOf(maskedState());
        const unit = buildAreaRepairUnits({ snapshot, image: IMAGE_REF, mask: MASK_REF })[0];
        const outcome = mapAreaRepairTaskToOutcome(unit, fakeTask({ result: { items: [] } as never }));
        expect(outcome.status).toBe("failed");
        expect(outcome.error?.code).toBe("empty-result");
    });

    test("失败/取消/未知各自映射并可判定是否可重试", () => {
        const snapshot = snapshotOf(maskedState());
        const unit = buildAreaRepairUnits({ snapshot, image: IMAGE_REF, mask: MASK_REF })[0];

        const failed = mapAreaRepairTaskToOutcome(unit, fakeTask({ status: "failed" }));
        expect(failed.status).toBe("failed");
        expect(failed.error?.retryable).toBe(true);

        const cancelled = mapAreaRepairTaskToOutcome(unit, fakeTask({ status: "cancelled" }));
        expect(cancelled.status).toBe("cancelled");
        expect(cancelled.error?.retryable).toBe(false);

        const unknown = mapAreaRepairTaskToOutcome(unit, fakeTask({ status: "running" }));
        expect(unknown.status).toBe("unknown");
    });
});

describe("单元并发执行", () => {
    test("全部成功时返回逐单元结果并回调进度", async () => {
        const snapshot = snapshotOf(maskedState(), "换成米色针织沙发", 3);
        const units = buildAreaRepairUnits({ snapshot, image: IMAGE_REF, mask: MASK_REF });
        const calls: string[] = [];
        const port: AreaRepairRunPort = {
            async run(input) {
                calls.push(input.prompt ?? "");
                return fakeTask({ id: `t-${calls.length}` });
            },
        };
        const progress: number[] = [];
        const outcomes = await runAreaRepairUnits(units, {
            port,
            concurrency: 2,
            onOutcome: (_outcome, _unit, completed) => progress.push(completed),
        });
        expect(calls).toHaveLength(3);
        expect(outcomes.map((outcome) => outcome.status)).toEqual(["succeeded", "succeeded", "succeeded"]);
        expect(progress).toEqual([1, 2, 3]);
    });

    test("单单元抛错不影响其它单元，失败保留错误信息", async () => {
        const snapshot = snapshotOf(maskedState(), "换成米色针织沙发", 2);
        const units = buildAreaRepairUnits({ snapshot, image: IMAGE_REF, mask: MASK_REF });
        let call = 0;
        const port: AreaRepairRunPort = {
            async run() {
                call += 1;
                if (call === 1) throw new Error("网关 502");
                return fakeTask({ id: "t-ok" });
            },
        };
        const outcomes = await runAreaRepairUnits(units, { port, concurrency: 1 });
        expect(outcomes[0].status).toBe("failed");
        expect(outcomes[0].error?.message).toBe("网关 502");
        expect(outcomes[1].status).toBe("succeeded");
    });

    test("取消后剩余单元标记 cancelled 且不再提交", async () => {
        const snapshot = snapshotOf(maskedState(), "换成米色针织沙发", 3);
        const units = buildAreaRepairUnits({ snapshot, image: IMAGE_REF, mask: MASK_REF });
        const controller = new AbortController();
        let submitted = 0;
        const port: AreaRepairRunPort = {
            async run() {
                submitted += 1;
                controller.abort();
                throw new Error("aborted");
            },
        };
        const outcomes = await runAreaRepairUnits(units, { port, concurrency: 1, signal: controller.signal });
        expect(outcomes.every((outcome) => outcome.status === "cancelled")).toBe(true);
        expect(submitted).toBe(1);
    });
});
