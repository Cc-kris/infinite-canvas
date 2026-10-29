import { describe, expect, test } from "bun:test";

import type { ToolTask } from "@/services/api/tools/task-machine";

import type { MaskCanvas } from "./area-repair";
import type { MaskRenderDeps } from "./area-repair";
import {
    buildDressingInput,
    buildDressingUnit,
    dressingResultPanelTask,
    dressingResultView,
    mapDressingTaskToOutcome,
    renderDressingMasks,
    type DressingUnit,
} from "./ai-dressing-v2";
import {
    AI_DRESSING_V2_FIELD_KEYS,
    AI_DRESSING_V2_TOOL_ID,
    buildDressingSnapshot,
    createDressingValues,
    dressingSnapshotHash,
    dressingTag,
    fillGarmentMask,
    firstDressingError,
    garmentMaskCoverage,
    garmentMaskEmpty,
    normalizeDressingValues,
    serializeDressingValues,
    switchTab,
    validateDressing,
    type DressingValues,
} from "@/features/tools/registry/ai-dressing-v2";

const POSE_URL = "data:image/png;base64,pose";
const GARMENT_URL = "data:image/png;base64,garment";

/**
 * 测试注入的画布：仍然真实走绘制调用（记录调用序列），只是不落像素。
 * 生产环境用 document canvas / OffscreenCanvas —— 这里不替它假装成功。
 */
function fakeCanvasDeps(): { deps: MaskRenderDeps; calls: string[] } {
    const calls: string[] = [];
    const deps: MaskRenderDeps = {
        createCanvas: (width: number, height: number): MaskCanvas => {
            calls.push(`create:${width}x${height}`);
            const ctx = {
                fillStyle: "#000000",
                strokeStyle: "#ffffff",
                lineCap: "round",
                lineJoin: "round",
                lineWidth: 1,
                filter: "none",
                globalCompositeOperation: "source-over",
                fillRect: () => calls.push("fillRect"),
                beginPath: () => calls.push("beginPath"),
                moveTo: () => calls.push("moveTo"),
                lineTo: () => calls.push("lineTo"),
                stroke: () => calls.push("stroke"),
                drawImage: () => calls.push("drawImage"),
            };
            return {
                width,
                height,
                getContext: () => ctx as unknown as ReturnType<MaskCanvas["getContext"]>,
                toDataURL: () => "data:image/png;base64,MASK",
            };
        },
    };
    return { deps, calls };
}

function valuesWithGarments(): DressingValues {
    const base = createDressingValues();
    const withPose: DressingValues = {
        ...base,
        poses: [{ id: "pose-1", assetId: "pose-1", name: "模特", imageUrl: POSE_URL, width: 512, height: 768 }],
        activePoseId: "pose-1",
    };
    const upper = fillGarmentMask(
        { ...withPose.garments.upper, assetId: "g-upper", name: "上装", imageUrl: GARMENT_URL, originUrl: GARMENT_URL, width: 600, height: 800 },
        "stroke-fill-upper",
    );
    return { ...withPose, garments: { ...withPose.garments, upper } };
}

describe("AI_DRESSING_V2 注册表", () => {
    test("默认值与字段契约对齐页面（20 个字段）", () => {
        const values = createDressingValues();
        expect(values.activeTab).toBe("upper-lower");
        expect(values.outputNum).toBe(1);
        expect(Object.keys(values.garments).sort()).toEqual(["down", "suit", "upper"]);
        expect(AI_DRESSING_V2_FIELD_KEYS).toHaveLength(20);
        expect(new Set(AI_DRESSING_V2_FIELD_KEYS).size).toBe(20);
    });

    test("切 Tab 不清空另一侧草稿", () => {
        const values = valuesWithGarments();
        const suit = switchTab(values, "suit");
        expect(suit.activeTab).toBe("suit");
        expect(suit.garments.upper.imageUrl).toBe(GARMENT_URL);
        expect(suit.garments.upper.mask.strokes.length).toBeGreaterThan(0);
        const back = switchTab(suit, "upper-lower");
        expect(back.garments.upper.imageUrl).toBe(GARMENT_URL);
    });

    test("校验：缺模特 / 缺服装 / 缺蒙版都被拦住，补齐后才放行", () => {
        const empty = createDressingValues();
        expect(validateDressing(empty).length).toBeGreaterThan(0);
        expect(firstDressingError(validateDressing(empty))?.code).toBe("garment-missing");

        const noMask = { ...valuesWithGarments() };
        noMask.garments = { ...noMask.garments, upper: { ...noMask.garments.upper, mask: { ...noMask.garments.upper.mask, strokes: [] } } };
        expect(firstDressingError(validateDressing(noMask))?.code).toBe("garment-mask-empty");

        expect(validateDressing(valuesWithGarments())).toEqual([]);
    });

    test("蒙版覆盖率与空蒙版判定来自真实栅格化", () => {
        const values = valuesWithGarments();
        expect(garmentMaskEmpty(values.garments.upper)).toBe(false);
        expect(garmentMaskCoverage(values.garments.upper)).toBeGreaterThan(0.5);
        expect(garmentMaskEmpty(createDressingValues().garments.upper)).toBe(true);
    });

    test("草稿序列化可还原成同一份值（刷新不丢）", () => {
        const values = valuesWithGarments();
        const restored = normalizeDressingValues(serializeDressingValues(values));
        expect(restored.garments.upper.imageUrl).toBe(GARMENT_URL);
        expect(restored.poses).toHaveLength(1);
        expect(restored.activePoseId).toBe("pose-1");
    });

    test("标签带版本、姿势与 Tab，便于刷新后判断归属", () => {
        expect(dressingTag("suit", "pose-1")).toBe("[AI_DRESSING v2/pose:pose-1/tab:suit]");
        const values = valuesWithGarments();
        const snapshot = buildDressingSnapshot({ values, pose: values.poses[0] });
        expect(snapshot.tab).toBe("upper-lower");
        expect(dressingSnapshotHash(snapshot)).toMatch(/^[0-9a-z]+$/i);
    });
});

describe("AI_DRESSING_V2 适配器", () => {
    test("没有涂抹就导出蒙版 = 直接失败（不补空白图）", async () => {
        const values = createDressingValues();
        const upper = { ...values.garments.upper, imageUrl: GARMENT_URL, width: 600, height: 800 };
        const noMask: DressingValues = { ...values, garments: { ...values.garments, upper } };
        await expect(renderDressingMasks(noMask, fakeCanvasDeps().deps)).rejects.toThrow(/还没有标记穿衣区域/);
    });

    test("有涂抹时按源图同尺寸导出蒙版", async () => {
        const { deps, calls } = fakeCanvasDeps();
        const masks = await renderDressingMasks(valuesWithGarments(), deps);
        expect(masks.upper?.width).toBe(600);
        expect(masks.upper?.height).toBe(800);
        expect(masks.upper?.dataUrl.startsWith("data:image/png")).toBe(true);
        expect(calls).toContain("stroke");
    });

    test("构建单元：20 字段齐全，参考图含模特 + 服装 + 蒙版", async () => {
        const { deps } = fakeCanvasDeps();
        const unit = await buildDressingUnit(valuesWithGarments(), { poseId: "pose-1", deps });
        expect(unit.missingFields).toEqual([]);
        expect(Object.keys(unit.fields).sort()).toEqual([...AI_DRESSING_V2_FIELD_KEYS].sort());
        expect(unit.references.length).toBeGreaterThanOrEqual(3);
        expect(unit.prompt.length).toBeGreaterThan(0);
        expect(unit.fields.upperMaskUrl).toBeTruthy();
        expect(unit.fields.upperImageUrl).toBe(GARMENT_URL);
        const input = buildDressingInput(unit);
        expect(input.toolId).toBe(AI_DRESSING_V2_TOOL_ID);
        expect(input.count).toBe(1);
    });

    test("缺字段时提交被拦下，不静默发出去", async () => {
        const { deps } = fakeCanvasDeps();
        const unit = await buildDressingUnit(valuesWithGarments(), { poseId: "pose-1", deps });
        expect(() => buildDressingInput({ ...unit, missingFields: ["upperMaskUrl"] })).toThrow(/缺少字段/);
    });

    test("上游成功但没有图片 = 失败（不包装成成功）", () => {
        const unit = { id: "unit-1", poseId: "pose-1", snapshotHash: "hash-1" } as unknown as DressingUnit;
        const emptyTask = { id: "task-1", status: "succeeded", result: { items: [] } } as unknown as ToolTask;
        const outcome = mapDressingTaskToOutcome(unit, emptyTask);
        expect(outcome.status).toBe("failed");
        expect(outcome.error?.code).toBe("empty-result");
    });

    test("真正带图的成功结果才算成功", () => {
        const unit = { id: "unit-2", poseId: "pose-1", snapshotHash: "hash-2" } as unknown as DressingUnit;
        const task = {
            id: "task-2",
            status: "succeeded",
            result: { items: [{ kind: "image", url: "https://example.test/a.png", mimeType: "image/png" }] },
        } as unknown as ToolTask;
        const outcome = mapDressingTaskToOutcome(unit, task);
        expect(outcome.status).toBe("succeeded");
        expect(outcome.images).toHaveLength(1);
    });

    test("结果视图能识别旧快照与标签", () => {
        const outcome = { unitId: "unit-3", poseId: "pose-1", snapshotHash: "hash-3", status: "succeeded", images: [{ url: "https://example.test/a.png" }] };
        const fresh = dressingResultView(outcome as never, { currentHash: "hash-3", tab: "suit" });
        expect(fresh.stale).toBe(false);
        expect(fresh.caption).toContain("连体衣服");
        expect(fresh.caption).toContain("[AI_DRESSING v2/pose:pose-1/tab:suit]");
        expect(dressingResultView(outcome as never, { currentHash: "hash-other" }).stale).toBe(true);
    });
});

describe("AI_DRESSING_V2 工作区", () => {
    test("首屏可服务端渲染：两个 Tab 存在，未满足条件时提交被禁用", async () => {
        const [{ renderToStaticMarkup }, React, workspace] = await Promise.all([
            import("react-dom/server"),
            import("react"),
            import("@/components/tools/workspaces/dressing"),
        ]);
        const html = renderToStaticMarkup(React.createElement(workspace.DressingWorkspace));
        expect(html).toContain("上下装衣服");
        expect(html).toContain("连体衣服");
        expect(html).toContain('data-testid="dressing-tabs"');
        expect(html).toContain('data-testid="dressing-submit"');
        expect(html).toContain("disabled");
    });
});

describe("dressingResultPanelTask（刷新后结果面板视图）", () => {
    const base = {
        toolId: AI_DRESSING_V2_TOOL_ID,
        clientOperationId: "op",
        fingerprint: "fp",
        capability: "image" as const,
        prompt: "p",
        createdAt: 1,
        updatedAt: 2,
    };
    const task = (patch: Partial<ToolTask> & { id: string }): ToolTask =>
        ({
            ...base,
            status: "succeeded",
            result: {
                items: [
                    {
                        id: `${patch.id}-0`,
                        kind: "image",
                        storageKey: "tool-result:abc",
                        bytes: 2115031,
                        mimeType: "image/png",
                        payloadDropped: false,
                    },
                ],
                receivedAt: 3,
            },
            ...patch,
        }) as ToolTask;

    test("无任务/无结果项时返回 null，不造空面板", () => {
        expect(dressingResultPanelTask([])).toBeNull();
        expect(dressingResultPanelTask([task({ id: "t0", result: undefined })])).toBeNull();
    });

    test("原样引用 storageKey 结果项，状态取成功，不改名不补字节", () => {
        const panel = dressingResultPanelTask([task({ id: "t1" })]);
        expect(panel?.result?.items).toHaveLength(1);
        expect(panel?.result?.items[0].storageKey).toBe("tool-result:abc");
        expect(panel?.result?.items[0].bytes).toBe(2115031);
        expect(panel?.result?.items[0].payloadDropped).toBe(false);
        expect(panel?.status).toBe("succeeded");
    });

    test("多任务按提交顺序聚合，运行中优先显示 running", () => {
        const panel = dressingResultPanelTask([
            task({ id: "t2", createdAt: 5 }),
            task({ id: "t1", createdAt: 1 }),
            task({ id: "t3", createdAt: 9, status: "running" }),
        ]);
        expect(panel?.result?.items.map((item) => item.id)).toEqual(["t1-0", "t2-0", "t3-0"]);
        expect(panel?.status).toBe("running");
    });
});
