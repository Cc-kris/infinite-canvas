import { describe, expect, test } from "bun:test";

import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";

import {
    HandRepairAdapterError,
    assertHandRepairInput,
    auditHandRepairFields,
    buildHandRepairInput,
    buildHandRepairUnits,
    handRepairDownloadHref,
    handRepairResultView,
    mapHandRepairTaskToOutcome,
    runHandRepairUnits,
    summarizeHandRepairOutcomes,
    toHandRepairReference,
} from "../adapters/hand-repair";
import {
    HAND_REPAIR_DEFAULT_OUTPUT,
    HAND_REPAIR_DEFAULT_PERSON_TYPE,
    HAND_REPAIR_OUTPUT_OPTIONS,
    HAND_REPAIR_PERSON_TYPES,
    HAND_REPAIR_PERSON_TYPE_VALUES,
    HAND_REPAIR_ROUTE,
    HAND_REPAIR_TOOL_ID,
    beginHandRepairStroke,
    buildHandRepairSnapshot,
    clampHandRepairBrush,
    commitHandRepairStroke,
    composeHandRepairFields,
    composeHandRepairInstruction,
    createHandRepairHistory,
    createHandRepairState,
    describeHandRepairCoverage,
    extendHandRepairStroke,
    getHandRepairSpec,
    handRepairDownloadName,
    handRepairHistoryState,
    handRepairMaskIsEmpty,
    handRepairOutputLabel,
    handRepairPersonTypeOption,
    handRepairPersonTypeOptions,
    handRepairSnapshotHash,
    isHandRepairSnapshotStale,
    normalizeHandRepairOutputNum,
    parseHandRepairDraftValues,
    redoHandRepairStroke,
    resetHandRepairStrokes,
    resolveHandRepairPersonType,
    serializeHandRepairDraftValues,
    undoHandRepairStroke,
    validateHandRepairInput,
    validateHandRepairSource,
} from "../registry/hand-repair";

const image = toHandRepairReference({
    id: "asset-image",
    name: "hand.png",
    type: "image/png",
    dataUrl: "data:image/png;base64,AAAA",
    width: 800,
    height: 600,
});
const mask = toHandRepairReference({
    id: "asset-mask",
    name: "mask.png",
    type: "image/png",
    dataUrl: "data:image/png;base64,BBBB",
    width: 800,
    height: 600,
});

function strokeState(extra: Partial<Parameters<typeof createHandRepairState>[0]> = {}) {
    const base = createHandRepairState(extra);
    const stroke = beginHandRepairStroke(base, { x: 0.4, y: 0.4 }, "s1");
    const grown = extendHandRepairStroke(stroke, { x: 0.55, y: 0.6 });
    return { ...base, strokes: [grown] };
}

function snapshotOf(state = strokeState(), outputNum = 2) {
    return buildHandRepairSnapshot({
        imageAssetId: "asset-image",
        imageName: "hand.png",
        imageWidth: 800,
        imageHeight: 600,
        state: { ...state, outputNum },
        maskDataUrl: "data:image/png;base64,MASK",
        draftRevision: 7,
        clientOperationId: "op-1",
    });
}

function task(status: ToolTask["status"], items: ToolTaskResultItem[] = [], error?: ToolTask["error"]): ToolTask {
    return { id: `task-${status}`, status, result: { items }, error } as unknown as ToolTask;
}

describe("HAND_REPAIR registry：规格一致性", () => {
    test("工具页规格存在，路由与布局与文档一致", () => {
        const spec = getHandRepairSpec();
        expect(spec?.id).toBe(HAND_REPAIR_TOOL_ID);
        expect(spec?.route).toBe(HAND_REPAIR_ROUTE);
        expect(spec?.layout).toBe("repair");
        expect(spec?.fields?.map((field) => field.key).sort()).toEqual(["imageName", "imageUrl", "maskUrl", "outputNum", "personType"]);
        // 规格 §2：本页没有提示词输入框
        expect(spec?.fields?.some((field) => field.key === "prompt")).toBe(false);
    });

    test("人物类型只接受四种真实取值，未知值退回默认而不是静默接受", () => {
        expect(HAND_REPAIR_PERSON_TYPE_VALUES).toEqual(["adult-male", "adult-female", "boy", "girl"]);
        expect(resolveHandRepairPersonType("boy")).toBe("boy");
        expect(resolveHandRepairPersonType("alien")).toBe(HAND_REPAIR_DEFAULT_PERSON_TYPE);
        expect(resolveHandRepairPersonType(undefined)).toBe(HAND_REPAIR_DEFAULT_PERSON_TYPE);
        expect(handRepairPersonTypeOption("girl").label).toBe("女孩");
    });

    test("模型目录缺失的人物类型被标记为不可用并给出原因", () => {
        const options = handRepairPersonTypeOptions([{ value: "adult-male", label: "成年男性" }]);
        expect(options).toHaveLength(HAND_REPAIR_PERSON_TYPES.length);
        const disabled = options.filter((option) => option.disabled);
        expect(disabled.map((option) => option.value).sort()).toEqual(["adult-female", "boy", "girl"]);
        expect(disabled[0]!.reason).toContain("模型目录");
        // 目录为空时全部可用，不因为"没拉到目录"就把页面锁死
        expect(handRepairPersonTypeOptions(null).every((option) => !option.disabled)).toBe(true);
    });

    test("张数被夹到 1–4，非法值退回默认", () => {
        expect(HAND_REPAIR_OUTPUT_OPTIONS).toEqual([1, 2, 3, 4]);
        expect(normalizeHandRepairOutputNum(9)).toBe(4);
        expect(normalizeHandRepairOutputNum(0)).toBe(HAND_REPAIR_DEFAULT_OUTPUT);
        expect(normalizeHandRepairOutputNum("3")).toBe(3);
        expect(normalizeHandRepairOutputNum("abc")).toBe(HAND_REPAIR_DEFAULT_OUTPUT);
        expect(handRepairOutputLabel(4)).toContain("4");
    });

    test("画笔尺寸被夹在合法区间内", () => {
        expect(clampHandRepairBrush(-10)).toBeGreaterThan(0);
        expect(clampHandRepairBrush(9999)).toBeLessThanOrEqual(300);
    });
});

describe("HAND_REPAIR 蒙版：真实笔画驱动覆盖率", () => {
    test("空状态蒙版为空，涂抹后不再为空", () => {
        expect(handRepairMaskIsEmpty(createHandRepairState())).toBe(true);
        const painted = strokeState();
        expect(handRepairMaskIsEmpty(painted)).toBe(false);
        expect(describeHandRepairCoverage(painted)).not.toContain("0.0%");
    });

    test("撤销/重做/重置走真实历史栈", () => {
        const history = commitHandRepairStroke(createHandRepairHistory(), beginHandRepairStroke(createHandRepairState(), { x: 0.2, y: 0.2 }, "s1"));
        expect(history.present).toHaveLength(1);
        expect(handRepairHistoryState(history).canUndo).toBe(true);
        const undone = undoHandRepairStroke(history);
        expect(undone.present).toHaveLength(0);
        const redone = redoHandRepairStroke(undone);
        expect(redone.present).toHaveLength(1);
        expect(resetHandRepairStrokes(redone).present).toHaveLength(0);
    });
});

describe("HAND_REPAIR 快照与草稿", () => {
    test("同一输入得到同一指纹，换人物类型指纹变化", () => {
        const a = snapshotOf(strokeState(), 2);
        const b = snapshotOf(strokeState(), 2);
        expect(handRepairSnapshotHash(a)).toBe(handRepairSnapshotHash(b));
        const different = snapshotOf(strokeState({ personType: "girl" }), 2);
        expect(handRepairSnapshotHash(a)).not.toBe(handRepairSnapshotHash(different));
        expect(isHandRepairSnapshotStale(a, b)).toBe(false);
        expect(isHandRepairSnapshotStale(a, different)).toBe(true);
        // 没有快照时不算过期，避免首屏就报"旧结果"
        expect(isHandRepairSnapshotStale(null, b)).toBe(false);
    });

    test("草稿序列化 → 解析后蒙版与参数不丢", () => {
        const state = strokeState({ personType: "boy", outputNum: 3 });
        const values = serializeHandRepairDraftValues({ state, imageName: "hand.png" });
        const parsed = parseHandRepairDraftValues(values);
        expect(parsed.imageName).toBe("hand.png");
        expect(parsed.state.personType).toBe("boy");
        expect(parsed.state.outputNum).toBe(3);
        expect(parsed.state.strokes).toHaveLength(1);
        expect(parsed.state.strokes[0]!.points.length).toBe(2);
        // 脏草稿不炸
        const dirty = parseHandRepairDraftValues({ strokes: "oops", personType: 42, outputNum: "x", brushSize: {} });
        expect(dirty.state.strokes).toHaveLength(0);
        expect(dirty.state.personType).toBe(HAND_REPAIR_DEFAULT_PERSON_TYPE);
    });
});

describe("HAND_REPAIR 校验：缺参必须拒绝，不静默发请求", () => {
    test("空蒙版 / 缺源图 / 张数越界都被拦下", () => {
        const ok = validateHandRepairInput({
            imageUrl: "data:image/png;base64,AAAA",
            maskUrl: "data:image/png;base64,BBBB",
            personType: "adult-male",
            outputNum: 2,
            imageWidth: 800,
            imageHeight: 600,
            maskWidth: 800,
            maskHeight: 600,
        });
        expect(ok).toHaveLength(0);

        const emptyMask = validateHandRepairInput({
            imageUrl: "data:image/png;base64,AAAA",
            maskUrl: "",
            personType: "adult-male",
            outputNum: 2,
            imageWidth: 800,
            imageHeight: 600,
            maskWidth: 0,
            maskHeight: 0,
        });
        expect(emptyMask.map((issue) => issue.field)).toContain("mask");

        const badType = validateHandRepairInput({
            imageUrl: "data:image/png;base64,AAAA",
            maskUrl: "data:image/png;base64,BBBB",
            personType: "alien",
            outputNum: 9,
            imageWidth: 800,
            imageHeight: 600,
            maskWidth: 800,
            maskHeight: 600,
        });
        expect(badType.map((issue) => issue.field)).toContain("personType");
        expect(badType.map((issue) => issue.field)).toContain("outputNum");
    });

    test("源图限制给出中文原因（大小/格式/尺寸）", () => {
        expect(validateHandRepairSource({ name: "a.gif", mimeType: "image/gif", bytes: 10, width: 800, height: 600 }).length).toBeGreaterThan(0);
        expect(validateHandRepairSource({ name: "a.png", mimeType: "image/png", bytes: 30 * 1024 * 1024, width: 800, height: 600 }).length).toBeGreaterThan(0);
        expect(validateHandRepairSource({ name: "a.png", mimeType: "image/png", bytes: 1024, width: 0, height: 0 }).length).toBeGreaterThan(0);
        expect(validateHandRepairSource({ name: "a.png", mimeType: "image/png", bytes: 1024, width: 800, height: 600 })).toHaveLength(0);
    });
});

describe("HAND_REPAIR 适配器：字段落点与单元构造", () => {
    test("outputNum 张 = 真实 N 个单元，每个单元都带人物类型与蒙版引用", () => {
        const snapshot = snapshotOf(strokeState({ personType: "girl" }), 3);
        const units = buildHandRepairUnits({ snapshot, image, mask });
        expect(units).toHaveLength(3);
        expect(units.map((unit) => unit.index)).toEqual([1, 2, 3]);
        expect(new Set(units.map((unit) => unit.id)).size).toBe(3);
        for (const unit of units) {
            expect(unit.fields.personType).toBe("girl");
            expect(unit.fields.outputNum).toBe(3);
            expect(unit.fields.imageName).toBe("hand.png");
            expect(unit.references).toHaveLength(2);
            expect(unit.references[0]!.id).not.toBe(unit.references[1]!.id);
            expect(unit.prompt).toContain("hand anatomy");
            // index 不进 prompt，避免指纹抖动
            expect(unit.prompt).not.toContain(`#${unit.index}`);
        }
        expect(units[0]!.prompt).toBe(units[1]!.prompt);
    });

    test("请求体 count=1 且五个字段齐全，能通过提交前守卫", () => {
        const units = buildHandRepairUnits({ snapshot: snapshotOf(), image, mask });
        const input = buildHandRepairInput(units[0]!, { draftRevision: 7 });
        expect(input.count).toBe(1);
        expect(input.toolId).toBe(HAND_REPAIR_TOOL_ID);
        expect(input.fields?.draftRevision).toBe(7);
        expect(() => assertHandRepairInput(input)).not.toThrow();
    });

    test("缺字段 / 蒙版未导出 / 缺幂等键 → 直接抛错而不是发请求", () => {
        const units = buildHandRepairUnits({ snapshot: snapshotOf(), image, mask });
        const base = buildHandRepairInput(units[0]!);

        const noMask = { ...base, fields: { ...base.fields, maskUrl: "" } };
        expect(() => assertHandRepairInput(noMask as typeof base)).toThrow(HandRepairAdapterError);

        const sameRef = { ...base, references: [image, image] };
        expect(() => assertHandRepairInput(sameRef as typeof base)).toThrow(/蒙版/);

        const noOp = { ...base, fields: { ...base.fields, clientOperationId: "" } };
        expect(() => assertHandRepairInput(noOp as typeof base)).toThrow(/幂等/);

        expect(() => assertHandRepairInput({ ...base, prompt: "   " } as typeof base)).toThrow(/指令为空/);
    });

    test("字段覆盖审计把规格五字段全部对上，缺一即报", () => {
        const snapshot = snapshotOf();
        const [unit] = buildHandRepairUnits({ snapshot, image, mask });
        const audit = auditHandRepairFields(["imageName", "imageUrl", "maskUrl", "outputNum", "personType"], unit!, snapshot);
        expect(audit.missing).toHaveLength(0);
        expect(audit.issues).toHaveLength(0);

        const broken = auditHandRepairFields(["imageName", "imageUrl", "maskUrl", "outputNum", "personType", "prompt"], unit!, snapshot);
        expect(broken.missing).toContain("prompt");
        expect(broken.issues.join()).toContain("适配器未覆盖字段");
    });

    test("指令随人物类型变化（成人与儿童措辞不同）", () => {
        const male = composeHandRepairInstruction({ personType: "adult-male" });
        const girl = composeHandRepairInstruction({ personType: "girl" });
        expect(male).not.toBe(girl);
        expect(male).toContain("hand anatomy");
    });

    test("下载名带原图名，多张加序号", () => {
        expect(handRepairDownloadName("my photo.png", 1)).toBe("my photo-hand-fixed.png");
        expect(handRepairDownloadName("my photo.png", 2)).toBe("my photo-hand-fixed-2.png");
        expect(handRepairDownloadName("", 1)).toBe("hand-repair-hand-fixed.png");
        expect(handRepairDownloadHref(undefined)).toBeNull();
        expect(handRepairDownloadHref("https://x/y.png")).toBe("https://x/y.png");
    });
});

describe("HAND_REPAIR 任务 → 结果：不把失败伪装成成功", () => {
    test("成功但无图 → failed(empty-result)；失败保留上游原因", () => {
        const [unit] = buildHandRepairUnits({ snapshot: snapshotOf(), image, mask });
        const empty = mapHandRepairTaskToOutcome(unit!, task("succeeded", []));
        expect(empty.status).toBe("failed");
        expect(empty.error?.code).toBe("empty-result");

        const okOutcome = mapHandRepairTaskToOutcome(unit!, task("succeeded", [{ id: "r-ok", kind: "image", dataUrl: "data:image/png;base64,OK" }]));
        expect(okOutcome.status).toBe("succeeded");
        expect(okOutcome.image?.dataUrl).toBe("data:image/png;base64,OK");

        const failed = mapHandRepairTaskToOutcome(unit!, task("failed", [], { code: "content_policy", message: "内容不合规", retryable: false }));
        expect(failed.status).toBe("failed");
        expect(failed.error?.message).toBe("内容不合规");

        const cancelled = mapHandRepairTaskToOutcome(unit!, task("cancelled", []));
        expect(cancelled.status).toBe("cancelled");
    });

    test("并发运行：单张失败不影响其它张，逐张回调推进", () => {
        const units = buildHandRepairUnits({ snapshot: snapshotOf(strokeState(), 3), image, mask });
        const seen: number[] = [];
        let call = 0;
        const port = {
            run: async () => {
                call += 1;
                if (call === 2) return task("failed", [], { code: "boom", message: "上游炸了", retryable: true });
                return task("succeeded", [{ id: `r-${call}`, kind: "image", dataUrl: `data:image/png;base64,${call}` }]);
            },
        };
        return runHandRepairUnits(units, {
            port,
            concurrency: 1,
            onOutcome: (_outcome, _unit, done) => seen.push(done),
        }).then((outcomes) => {
            expect(outcomes).toHaveLength(3);
            expect(outcomes.filter((outcome) => outcome.status === "succeeded")).toHaveLength(2);
            expect(outcomes.filter((outcome) => outcome.status === "failed")).toHaveLength(1);
            expect(seen).toEqual([1, 2, 3]);
            const view = handRepairResultView({ outcomes });
            expect(view.status).toBe("failed");
            expect(view.images).toHaveLength(2);
            expect(view.errors[0]).toContain("第 2 张");
            expect(summarizeHandRepairOutcomes(outcomes)).toBe("成功 2/3 张");
        });
    });

    test("空结果视图是 idle，不补造占位图", () => {
        const view = handRepairResultView({ outcomes: [] });
        expect(view.status).toBe("idle");
        expect(view.images).toHaveLength(0);
        expect(view.errors).toHaveLength(0);
    });
});
