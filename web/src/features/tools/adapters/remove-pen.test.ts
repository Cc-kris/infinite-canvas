import { describe, expect, test } from "bun:test";

import type { ToolTask } from "@/services/api/tools/task-machine";

import {
    REMOVE_PEN_BRUSH_MAX,
    REMOVE_PEN_BRUSH_MIN,
    REMOVE_PEN_COMPARE_MODES,
    REMOVE_PEN_DRAFT_KEY,
    REMOVE_PEN_HANDOFFS,
    REMOVE_PEN_ROUTE,
    REMOVE_PEN_SLUG,
    REMOVE_PEN_TOOL_ID,
    beginRemovePenStroke,
    buildRemovePenHandoff,
    buildRemovePenSnapshot,
    commitRemovePenStroke,
    composeRemovePenFields,
    createRemovePenHistory,
    createRemovePenState,
    describeRemovePenCoverage,
    extendRemovePenStroke,
    parseRemovePenDraftValues,
    redoRemovePenStroke,
    serializeRemovePenDraftValues,
    removePenHistoryState,
    removePenMaskIsEmpty,
    removePenSnapshotHash,
    resetRemovePenStrokes,
    undoRemovePenStroke,
    validateRemovePenInput,
    validateRemovePenSource,
} from "../registry/remove-pen";
import {
    RemovePenAdapterError,
    assertRemovePenInput,
    buildRemovePenInput,
    buildRemovePenUnit,
    clampCompareSplit,
    compareSplitLabel,
    removePenResultView,
    removePenRunFromTask,
    toRemovePenReference,
} from "./remove-pen";
import { getToolById } from "../registry";

/** 一笔水平涂抹：从 (10,10) 到 (90,10)，笔刷 35。 */
function paintStroke(brushSize = 35) {
    const state = createRemovePenState({ brushSize });
    const stroke = extendRemovePenStroke(beginRemovePenStroke(state, { x: 10, y: 10 }, "s1"), { x: 90, y: 10 });
    return { state, stroke };
}

function snapshotOf(overrides: { brushSize?: number; clientOperationId?: string } = {}) {
    const { state } = paintStroke(overrides.brushSize ?? 35);
    return buildRemovePenSnapshot({
        imageAssetId: "asset-1",
        imageName: "shoe.jpg",
        imageWidth: 1024,
        imageHeight: 768,
        state: { ...state, strokes: [extendRemovePenStroke(beginRemovePenStroke(state, { x: 10, y: 10 }, "s1"), { x: 90, y: 10 })] },
        maskWidth: 1024,
        maskHeight: 768,
        maskDataUrl: "data:image/png;base64,AAA",
        draftRevision: 3,
        clientOperationId: overrides.clientOperationId ?? "op-1",
    });
}

function toolTask(overrides: Partial<ToolTask> = {}): ToolTask {
    return {
        id: "task-1",
        toolId: REMOVE_PEN_TOOL_ID,
        status: "succeeded",
        clientOperationId: "op-1",
        fingerprint: "fp",
        capability: "image",
        prompt: "erase",
        configSnapshot: { capability: "image", model: "m", count: "1" },
        source: { type: "upload", label: "shoe.jpg" },
        fields: {},
        references: [],
        createdAt: 1,
        updatedAt: 2,
        pollCount: 1,
        ...overrides,
    } as ToolTask;
}

describe("REMOVE_PEN 契约", () => {
    test("注册表内的 toolId / slug / route 与本模块一致，且是 mask 布局的单结果工具", () => {
        const spec = getToolById(REMOVE_PEN_TOOL_ID);
        expect(spec?.slug).toBe(REMOVE_PEN_SLUG);
        expect(spec?.route).toBe(REMOVE_PEN_ROUTE);
        expect(spec?.layout).toBe("mask");
        expect(spec?.batchCapable).toBe(false);
        for (const field of ["eraseImageUrl", "imageName", "imageUrl", "maskImageUrl"]) {
            expect(spec?.fields?.some((item) => item.key === field) ?? false).toBe(true);
        }
    });

    test("草稿键与工具 ID 绑定，草稿值可往返解析", () => {
        expect(REMOVE_PEN_DRAFT_KEY).toBe(`tool-draft:v1:${REMOVE_PEN_TOOL_ID}`);
        const { state, stroke } = paintStroke(60);
        const values = serializeRemovePenDraftValues({ state: { ...state, strokes: [stroke] }, imageName: "a.png", compareMode: "slider" });
        const parsed = parseRemovePenDraftValues(values);
        expect(parsed.state.strokes.length).toBe(1);
        expect(parsed.state.brushSize).toBe(60);
        expect(parsed.imageName).toBe("a.png");
        expect(parsed.compareMode).toBe("slider");
    });

    test("画笔大小被夹在共享上下限内，越界输入不产生非法笔刷", () => {
        expect(createRemovePenState({ brushSize: 0 }).brushSize).toBe(REMOVE_PEN_BRUSH_MIN);
        expect(createRemovePenState({ brushSize: 9999 }).brushSize).toBe(REMOVE_PEN_BRUSH_MAX);
        expect(createRemovePenState({ brushSize: Number.NaN }).brushSize).toBeGreaterThanOrEqual(REMOVE_PEN_BRUSH_MIN);
    });

    test("撤销/重做/重置只作用于笔画，语义与共享蒙版历史一致", () => {
        const { stroke } = paintStroke();
        let history = commitRemovePenStroke(createRemovePenHistory(), stroke);
        expect(removePenHistoryState(history).strokeCount).toBe(1);
        history = undoRemovePenStroke(history);
        expect(removePenHistoryState(history).strokeCount).toBe(0);
        expect(removePenHistoryState(history).canRedo).toBe(true);
        history = redoRemovePenStroke(history);
        expect(removePenHistoryState(history).strokeCount).toBe(1);
        expect(removePenHistoryState(resetRemovePenStrokes(history)).strokeCount).toBe(0);
    });
});

describe("REMOVE_PEN 蒙版与校验", () => {
    test("空蒙版判空并给出“先涂抹”文案，涂过之后不再为空", () => {
        const empty = createRemovePenState();
        expect(removePenMaskIsEmpty(empty)).toBe(true);
        expect(describeRemovePenCoverage(empty)).toBe("尚未涂抹");
        const { stroke } = paintStroke();
        const painted = { ...empty, strokes: [stroke] };
        expect(removePenMaskIsEmpty(painted)).toBe(false);
    });

    test("缺原图 / 缺蒙版 / 尺寸不一致都会被拦下，且各给一条具体原因", () => {
        expect(validateRemovePenInput({ imageUrl: "", maskUrl: "data:x" }).some((i) => i.field === "image")).toBe(true);
        expect(validateRemovePenInput({ imageUrl: "data:x", maskUrl: "" }).some((i) => i.field === "mask")).toBe(true);
        const mismatch = validateRemovePenInput({
            imageUrl: "data:x",
            maskUrl: "data:y",
            imageWidth: 1024,
            imageHeight: 768,
            maskWidth: 512,
            maskHeight: 768,
        });
        expect(mismatch.some((i) => i.field === "dimensions")).toBe(true);
        // 同尺寸时不产生 dimensions 问题
        expect(
            validateRemovePenInput({
                imageUrl: "data:x",
                maskUrl: "data:y",
                imageWidth: 1024,
                imageHeight: 768,
                maskWidth: 1024,
                maskHeight: 768,
            }).some((i) => i.field === "dimensions"),
        ).toBe(false);
    });

    test("源图限制按规格给出行数：格式/大小/像素", () => {
        expect(validateRemovePenSource({ mimeType: "image/gif", width: 800, height: 600, bytes: 1024 })).toHaveLength(1);
        expect(validateRemovePenSource({ mimeType: "image/png", width: 9000, height: 600, bytes: 1024 }).length).toBeGreaterThan(0);
        expect(validateRemovePenSource({ mimeType: "image/png", width: 1024, height: 768, bytes: 1024 })).toHaveLength(0);
    });
});

describe("REMOVE_PEN 快照与请求", () => {
    test("快照指纹不含幂等键：同输入重试不变，改笔画即变", () => {
        const a = snapshotOf();
        const b = snapshotOf({ clientOperationId: "op-2" });
        expect(removePenSnapshotHash(a)).toBe(removePenSnapshotHash(b));
        const wider = snapshotOf({ brushSize: 100 });
        expect(removePenSnapshotHash(wider)).not.toBe(removePenSnapshotHash(a));
    });

    test("四个 ToolSpec 字段全部落到请求，幂等键来自快照", () => {
        const snapshot = snapshotOf();
        const fields = composeRemovePenFields(snapshot, {
            eraseImageUrl: "https://cdn/x.png",
            imageUrl: "https://cdn/x.png",
            maskImageUrl: "https://cdn/mask.png",
        });
        expect(fields.eraseImageUrl).toBe("https://cdn/x.png");
        expect(fields.maskImageUrl).toBe("https://cdn/mask.png");
        expect(fields.imageName).toBe("shoe.jpg");
        expect(fields.clientOperationId).toBe("op-1");
    });

    test("unit 携带原图 + 蒙版两张参考图，蒙版必须是第二张", () => {
        const snapshot = snapshotOf();
        const image = toRemovePenReference({ id: "a1", name: "shoe.jpg", type: "image/jpeg", dataUrl: "data:image/jpeg;base64,IMG" });
        const mask = toRemovePenReference({ id: "a1-mask", name: "mask.png", type: "image/png", dataUrl: "data:image/png;base64,MASK" });
        const unit = buildRemovePenUnit({ snapshot, image, mask });
        expect(unit.references).toHaveLength(2);
        expect(unit.references[0].dataUrl).toContain("IMG");
        expect(unit.references[1].dataUrl).toContain("MASK");
        expect(unit.prompt.trim().length).toBeGreaterThan(0);
        const input = buildRemovePenInput(unit, { draftRevision: 3 });
        expect(input.toolId).toBe(REMOVE_PEN_TOOL_ID);
        expect(input.count).toBe(1);
        expect(input.fields?.draftRevision).toBe(3);
        assertRemovePenInput(input);
    });

    test("守卫拒绝缺蒙版 / 缺字段 / 缺幂等键的请求，而不是发出去等上游报错", () => {
        const snapshot = snapshotOf();
        const image = toRemovePenReference({ id: "a1", name: "shoe.jpg", type: "image/jpeg", dataUrl: "data:image/jpeg;base64,IMG" });
        const mask = toRemovePenReference({ id: "a1-mask", name: "mask.png", type: "image/png", dataUrl: "data:image/png;base64,MASK" });
        const unit = buildRemovePenUnit({ snapshot, image, mask });

        expect(() => assertRemovePenInput(buildRemovePenInput({ ...unit, references: [image, image] }))).toThrow(RemovePenAdapterError);
        const noMaskField = buildRemovePenInput(unit);
        delete (noMaskField.fields as Record<string, unknown>).maskImageUrl;
        expect(() => assertRemovePenInput(noMaskField)).toThrow(/maskImageUrl/);
        const noOp = buildRemovePenInput(unit);
        delete (noOp.fields as Record<string, unknown>).clientOperationId;
        expect(() => assertRemovePenInput(noOp)).toThrow(/clientOperationId/);
        const emptyPrompt = buildRemovePenInput({ ...unit, prompt: "   " });
        expect(() => assertRemovePenInput(emptyPrompt)).toThrow();
    });
});

describe("REMOVE_PEN 结果与接力", () => {
    test("上游成功但无图 → 判失败，不补造占位结果", () => {
        const run = removePenRunFromTask(
            { id: "u", prompt: "", references: [], fields: {}, snapshotHash: "h" },
            toolTask({ result: { items: [] } as unknown as ToolTask["result"] }),
        );
        expect(run.status).toBe("failed");
        expect(run.image).toBeUndefined();
        expect(removePenResultView({ run }).status).toBe("failed");
    });

    test("成功结果直接使用上游返回的两张真实图地址；运行中保持 running", () => {
        const run = removePenRunFromTask(
            { id: "u", prompt: "", references: [], fields: {}, snapshotHash: "h" },
            toolTask({ result: { items: [{ kind: "image", dataUrl: "data:image/png;base64,OUT", url: "https://cdn/out.png" }] } as ToolTask["result"] }),
        );
        expect(run.status).toBe("succeeded");
        const view = removePenResultView({ run, sourceUrl: "https://cdn/in.png", stale: true });
        expect(view.imageUrl).toBe("data:image/png;base64,OUT");
        expect(view.sourceUrl).toBe("https://cdn/in.png");
        expect(view.stale).toBe(true);
        expect(removePenResultView({ run, running: true }).status).toBe("running");
    });

    test("对比滑块被夹在 0–100，文案在两端明确", () => {
        expect(clampCompareSplit(-20)).toBe(0);
        expect(clampCompareSplit(180)).toBe(100);
        expect(compareSplitLabel(0)).toBe("只看原图");
        expect(compareSplitLabel(100)).toBe("只看结果");
        expect(compareSplitLabel(37)).toBe("结果 37%");
        expect(REMOVE_PEN_COMPARE_MODES.map((mode) => mode.id)).toEqual(["side-by-side", "slider", "result"]);
    });

    test("三个接力入口指向真实路由并带上结果地址", () => {
        const urls = new Set(REMOVE_PEN_HANDOFFS.map((handoff) => handoff.route));
        expect(urls.has("/tools/ecommerce-suite/scale-up")).toBe(true);
        expect(urls.has("/tools/product-design/new-replace-bg-v2")).toBe(true);
        expect(urls.has("/tools/smart-edit/hand-repair")).toBe(true);
        for (const handoff of REMOVE_PEN_HANDOFFS) {
            const target = buildRemovePenHandoff(handoff.id, "https://cdn/out.png");
            expect(target.route).toBe(handoff.route);
            expect(target.value).toBe("https://cdn/out.png");
        }
    });
});

/* ------------------------------------------------------------------ *
 * 渲染证据：没有 DOM 测试环境，用 react-dom/server 渲染真实组件，
 * 断言“只显示消除所需控件、无描述输入、未上传时提交不可点”。
 * ------------------------------------------------------------------ */
describe("REMOVE_PEN 工作区渲染", () => {
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
        const { RemovePenWorkspace } = await import("@/components/tools/workspaces/mask");
        return renderToStaticMarkup(
            React.createElement(MemoryRouter, null, React.createElement(RemovePenWorkspace, {})),
        );
    };

    test("只渲染消除控件：画笔/大小/重置/撤销/重做/重新上传/开始消除，且不含重绘描述", async () => {
        const html = await render();
        expect(html).toContain('data-testid="remove-pen-workspace"');
        for (const copy of ["画笔", "重置", "撤销", "重做", "重新上传", "开始消除"]) {
            expect(html).toContain(copy);
        }
        // 本页契约不包含局部重绘的字段
        expect(html).not.toContain("重绘描述");
        expect(html).not.toContain("自动扩边");
        // 没有原图时不能提交（按钮 disabled），也不渲染对比
        expect(/<button(?=[^>]*\bdata-testid="remove-pen-submit")(?=[^>]*\bdisabled="")[^>]*>/.test(html)).toBe(true);
        expect(html).not.toContain('data-testid="remove-pen-compare"');
    });
});

describe("REMOVE_PEN 刷新后从落盘任务恢复", () => {
    test("只有 id/snapshotHash 也要能从落盘任务还原结果字节（下载/存资产/发画布不再归零）", () => {
        const task = toolTask({
            status: "succeeded",
            result: {
                items: [{ kind: "image", mime: "image/png", url: "https://oss/restored.png", dataUrl: "data:image/png;base64,RESTORED" }],
            } as ToolTask["result"],
        });
        const run = removePenRunFromTask({ id: task.id, snapshotHash: task.id }, task);
        expect(run.status).toBe("succeeded");
        const view = removePenResultView({ run });
        expect(view.imageUrl).toBe("data:image/png;base64,RESTORED");
        expect(view.error).toBeUndefined();
    });

    test("落盘任务成功但无字节时不伪造成功（不生成占位图）", () => {
        const task = toolTask({ status: "succeeded", result: { items: [{ kind: "image" }] } as ToolTask["result"] });
        const run = removePenRunFromTask({ id: task.id, snapshotHash: task.id }, task);
        expect(run.status).toBe("failed");
        expect(run.image).toBeUndefined();
    });
});
