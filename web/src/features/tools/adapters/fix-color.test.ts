import { describe, expect, test } from "bun:test";

import type { ToolTask } from "@/services/api/tools/task-machine";

import {
    FIX_COLOR_BRUSH_MAX,
    FIX_COLOR_BRUSH_MIN,
    FIX_COLOR_COMPARE_MODES,
    FIX_COLOR_DEFAULT_REGION_COLOR,
    FIX_COLOR_DEFAULT_TARGET_COLOR,
    FIX_COLOR_DRAFT_KEY,
    FIX_COLOR_ROUTE,
    FIX_COLOR_SLUG,
    FIX_COLOR_TOOL_ID,
    FIX_COLOR_VERSIONS,
    beginFixColorStroke,
    buildFixColorSnapshot,
    colorDeltaE,
    commitFixColorStroke,
    composeFixColorFields,
    createFixColorHistory,
    createFixColorState,
    describeColorDelta,
    describeFixColorCoverage,
    extendFixColorStroke,
    fixColorCoverage,
    fixColorMaskIsEmpty,
    fixColorSnapshotHash,
    formatColorInput,
    getFixColorVersion,
    isFixColorSnapshotStale,
    normalizeColorHex,
    parseFixColorDraftValues,
    serializeFixColorDraftValues,
    validateFixColorInput,
    validateFixColorSource,
} from "../registry/fix-color";
import {
    FIX_COLOR_OUTPUT_LIMITS,
    FIX_COLOR_OUTPUT_STEP,
    FixColorAdapterError,
    assertFixColorInput,
    buildFixColorInput,
    buildFixColorUnit,
    clampCompareSplit,
    fixColorDownloadName,
    fixColorOutputSize,
    fixColorResultView,
    fixColorRunFromTask,
    runFixColor,
    toFixColorReference,
} from "./fix-color";
import { getToolById } from "../registry";

/** 一笔水平涂抹：从 (10,10) 到 (90,10)。 */
function paintStroke(brushSize = 35, color = { region: FIX_COLOR_DEFAULT_REGION_COLOR, target: FIX_COLOR_DEFAULT_TARGET_COLOR }) {
    const state = createFixColorState({ brushSize });
    const stroke = extendFixColorStroke(beginFixColorStroke(state, { x: 10, y: 10 }, "s1"), { x: 90, y: 10 });
    const history = commitFixColorStroke(createFixColorHistory(), stroke);
    return { state: { ...state, strokes: history.present }, regionColor: color.region, targetColor: color.target };
}

function snapshotOf(overrides: { clientOperationId?: string; regionColor?: string; targetColor?: string } = {}) {
    const painted = paintStroke();
    return buildFixColorSnapshot({
        imageAssetId: "asset-1",
        imageName: "shoe.jpg",
        imageWidth: 1024,
        imageHeight: 768,
        state: painted.state,
        regionColor: overrides.regionColor ?? painted.regionColor,
        targetColor: overrides.targetColor ?? painted.targetColor,
        version: FIX_COLOR_VERSIONS[0].id,
        maskDataUrl: "data:image/png;base64,MASK",
        draftRevision: 3,
        clientOperationId: overrides.clientOperationId ?? "op-1",
    });
}

function toolTask(overrides: Partial<ToolTask> = {}): ToolTask {
    return {
        id: "task-1",
        toolId: FIX_COLOR_TOOL_ID,
        status: "succeeded",
        clientOperationId: "op-1",
        fingerprint: "fp",
        capability: "image",
        prompt: "fix color",
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

describe("FIX_COLOR 注册表契约", () => {
    test("路由/slug/layout 与 ToolSpec 一致，且提交字段全部在 ToolSpec 里有落点", () => {
        const spec = getToolById(FIX_COLOR_TOOL_ID);
        expect(spec).toBeDefined();
        expect(spec!.route).toBe(FIX_COLOR_ROUTE);
        expect(spec!.slug).toBe(FIX_COLOR_SLUG);
        expect(spec!.layout).toBe("repair");
        const keys = new Set((spec!.fields ?? []).map((field) => field.key));
        for (const key of ["fixColorSegUrl", "fixColorUrl", "imageName", "imageSegUrl", "imageUrl", "version", "imageResultUrl"]) {
            expect(keys.has(key)).toBe(true);
        }
    });

    test("默认值落在合法区间，草稿 key 与工具 id 对齐", () => {
        expect(FIX_COLOR_DRAFT_KEY).toBe(`tool-draft:v1:${FIX_COLOR_TOOL_ID}`);
        const state = createFixColorState();
        expect(state.brushSize).toBeGreaterThanOrEqual(FIX_COLOR_BRUSH_MIN);
        expect(state.brushSize).toBeLessThanOrEqual(FIX_COLOR_BRUSH_MAX);
        expect(state.strokes).toEqual([]);
        expect(FIX_COLOR_COMPARE_MODES.map((mode) => mode.id)).toContain("slide");
    });
});

describe("FIX_COLOR 颜色", () => {
    test("归一化：#RGB 展开、小写转大写、非法值拒绝", () => {
        expect(normalizeColorHex("#abc")).toEqual({ hex: "#AABBCC", alpha: 1, rgb: [170, 187, 204] });
        expect(normalizeColorHex("a8896a")?.hex).toBe("#A8896A");
        expect(normalizeColorHex("#11223380")?.alpha).toBe(0.5);
        expect(normalizeColorHex("#112233FF")?.alpha).toBe(1);
        expect(normalizeColorHex("#12345")).toBeNull();
        expect(normalizeColorHex("rgb(1,2,3)")).toBeNull();
    });

    test("色差：同色为 0，差异越大越大，且给出可读描述", () => {
        expect(colorDeltaE("#A8896A", "#A8896A")).toBe(0);
        const small = colorDeltaE("#A8896A", "#AB8A6B")!;
        const big = colorDeltaE("#A8896A", "#2255FF")!;
        expect(big).toBeGreaterThan(small);
        expect(describeColorDelta(null)).toContain("颜色");
        expect(describeColorDelta(1.2)).toContain("轻微");
        expect(describeColorDelta(0.4)).toContain("几乎无差别");
        expect(describeColorDelta(5)).toContain("明显");
        expect(describeColorDelta(30)).toContain("强色差");
    });

    test("formatColorInput 统一成 6 位大写 hex", () => {
        expect(formatColorInput("#abc")).toBe("#AABBCC");
        expect(formatColorInput("#aabbccdd")).toBe("#AABBCC");
        // 输入框是宽松格式化：非法输入原样回显，合法性由 validateFixColorInput 把关
        expect(formatColorInput("zzz")).toBe("zzz");
    });
});

describe("FIX_COLOR 提交校验", () => {
    test("空蒙版/同色/未知版本都要被拒，而不是发一次缺参请求", () => {
        const base = { imageUrl: "data:image/png;base64,IN", maskUrl: "", regionColor: "#A8896A", targetColor: "#B79A7C", version: "match-region" };
        expect(validateFixColorInput(base).map((issue) => issue.field)).toContain("mask");
        const same = validateFixColorInput({ ...base, maskUrl: "data:image/png;base64,M", targetColor: "#A8896A" });
        expect(same.map((issue) => issue.field)).toContain("color");
        const badVersion = validateFixColorInput({ ...base, maskUrl: "data:image/png;base64,M", version: "v9" });
        expect(badVersion.map((issue) => issue.field)).toContain("version");
        expect(validateFixColorInput({ ...base, maskUrl: "data:image/png;base64,M" })).toEqual([]);
    });

    test("源图限制：过小/非位图要报错，正常商品图通过", () => {
        expect(validateFixColorSource({ name: "a.png", mimeType: "image/png", bytes: 1200, width: 10, height: 10 }).length).toBeGreaterThan(0);
        expect(validateFixColorSource({ name: "a.gif", mimeType: "image/gif", bytes: 1200, width: 800, height: 800 }).map((issue) => issue.field)).toContain("source");
        expect(validateFixColorSource({ name: "a.png", mimeType: "image/png", bytes: 1200, width: 900, height: 900 })).toEqual([]);
    });

    test("assertFixColorInput 缺字段即拒，且抛 FixColorAdapterError", () => {
        const snapshot = snapshotOf();
        const unit = buildFixColorUnit({
            snapshot,
            image: toFixColorReference({ id: "a", name: "shoe.jpg", type: "image/png", dataUrl: "data:image/png;base64,IN" }),
            mask: { id: "m", name: "mask.png", type: "image/png", dataUrl: "data:image/png;base64,M" },
        });
        const input = buildFixColorInput(unit);
        expect(() => assertFixColorInput(input)).not.toThrow();
        const broken = buildFixColorInput({ ...unit, fields: { ...unit.fields, imageSegUrl: "" } });
        expect(() => assertFixColorInput(broken)).toThrow(FixColorAdapterError);
        try {
            assertFixColorInput(broken);
        } catch (error) {
            expect((error as FixColorAdapterError).code).toBe("field-missing:imageSegUrl");
        }
        const badColor = buildFixColorInput({ ...unit, fields: { ...unit.fields, fixColorUrl: "not-a-color" } });
        expect(() => assertFixColorInput(badColor)).toThrow(/颜色/);
    });
});

describe("FIX_COLOR 快照与草稿", () => {
    test("同一输入 hash 稳定；改颜色/换版本即判定旧版本", () => {
        const a = snapshotOf({ clientOperationId: "op-1" });
        expect(fixColorSnapshotHash(a)).toBe(fixColorSnapshotHash(snapshotOf({ clientOperationId: "op-1" })));
        const changed = snapshotOf({ clientOperationId: "op-1", targetColor: "#2255FF" });
        expect(isFixColorSnapshotStale(a, changed)).toBe(true);
        const otherVersion = buildFixColorSnapshot({
            imageAssetId: "asset-1",
            imageName: "shoe.jpg",
            imageWidth: 1024,
            imageHeight: 768,
            state: paintStroke().state,
            regionColor: a.regionColor,
            targetColor: a.targetColor,
            version: FIX_COLOR_VERSIONS[1].id,
            maskDataUrl: "data:image/png;base64,MASK",
            draftRevision: 3,
            clientOperationId: "op-1",
        });
        expect(isFixColorSnapshotStale(a, otherVersion)).toBe(true);
    });

    test("composeFixColorFields 六字段齐全，颜色统一大写 hex", () => {
        const snapshot = snapshotOf({ regionColor: "#a8896a", targetColor: "#b79a7c" });
        const fields = composeFixColorFields(snapshot, { imageUrl: "data:image/png;base64,IN", imageSegUrl: "data:image/png;base64,M" });
        expect(Object.keys(fields).sort()).toEqual(["fixColorSegUrl", "fixColorUrl", "imageName", "imageSegUrl", "imageUrl", "version"].sort());
        expect(fields.fixColorSegUrl).toBe("#A8896A");
        expect(fields.fixColorUrl).toBe("#B79A7C");
        expect(fields.version).toBe(FIX_COLOR_VERSIONS[0].id);
    });

    test("草稿可往返：颜色/版本/笔画都保住，坏值回落到默认", () => {
        const painted = paintStroke();
        const serialized = serializeFixColorDraftValues({
            state: painted.state,
            imageName: "shoe.jpg",
            version: FIX_COLOR_VERSIONS[1].id,
            regionColor: "#a8896a",
            targetColor: "#2255ff",
            compareMode: "side",
        });
        const parsed = parseFixColorDraftValues(serialized);
        expect(parsed.state.strokes.length).toBe(1);
        expect(parsed.version).toBe(FIX_COLOR_VERSIONS[1].id);
        expect(parsed.regionColor).toBe("#A8896A");
        expect(parsed.compareMode).toBe("side");
        const fallback = parseFixColorDraftValues({ version: "nope", regionColor: "zzz", targetColor: 42 });
        expect(fallback.version).toBe(FIX_COLOR_VERSIONS[0].id);
        expect(fallback.regionColor).toBe(FIX_COLOR_DEFAULT_REGION_COLOR);
        expect(fallback.targetColor).toBe(FIX_COLOR_DEFAULT_TARGET_COLOR);
        expect(fallback.imageName).toBe("");
    });

    test("涂抹覆盖率为 0 时判定空蒙版，涂抹后可提交", () => {
        const empty = createFixColorState();
        expect(fixColorMaskIsEmpty(empty)).toBe(true);
        expect(fixColorCoverage(empty)).toBe(0);
        const painted = paintStroke();
        expect(fixColorMaskIsEmpty(painted.state)).toBe(false);
        expect(fixColorCoverage(painted.state)).toBeGreaterThan(0);
        expect(describeFixColorCoverage(painted.state)).toContain("已涂抹");
    });
});

describe("FIX_COLOR 适配器", () => {
    test("unit 的指令含真实颜色与版本语义，参考图两张，字段带幂等键", () => {
        const snapshot = snapshotOf();
        const unit = buildFixColorUnit({
            snapshot,
            image: toFixColorReference({ id: "a", name: "shoe.jpg", type: "image/png", dataUrl: "data:image/png;base64,IN" }),
            mask: { id: "m", name: "mask.png", type: "image/png", dataUrl: "data:image/png;base64,M" },
        });
        expect(unit.references.length).toBe(2);
        expect(unit.prompt).toContain(snapshot.regionColor);
        expect(unit.prompt).toContain(snapshot.targetColor);
        expect(unit.prompt).toContain(getFixColorVersion(snapshot.version).instruction.slice(0, 8));
        expect(unit.fields.clientOperationId).toBe(snapshot.clientOperationId);
        expect(unit.snapshotHash).toBe(fixColorSnapshotHash(snapshot));
    });

    test("成功后取上游图片；成功但无图判失败，绝不补造占位图", () => {
        const unit = { id: "u", prompt: "", references: [], fields: {}, snapshotHash: "h" };
        const ok = fixColorRunFromTask(
            unit,
            toolTask({ result: { items: [{ kind: "image", dataUrl: "data:image/png;base64,OUT", url: "https://cdn/out.png" }] } as ToolTask["result"] }),
        );
        expect(ok.status).toBe("succeeded");
        expect(ok.image?.url).toBe("https://cdn/out.png");

        const empty = fixColorRunFromTask(unit, toolTask({ result: { items: [] } as unknown as ToolTask["result"] }));
        expect(empty.status).toBe("failed");
        expect(empty.error?.code).toBe("empty-result");
        expect(empty.image).toBeUndefined();

        const failed = fixColorRunFromTask(
            unit,
            toolTask({ status: "failed", error: { code: "provider-rejected", message: "上游拒绝" } as ToolTask["error"] }),
        );
        expect(failed.error?.message).toBe("上游拒绝");

        const unknown = fixColorRunFromTask(unit, toolTask({ status: "unknown" }));
        expect(unknown.status).toBe("unknown");
    });

    test("runFixColor 走注入端口跑真实请求，透传任务与结果", async () => {
        const snapshot = snapshotOf();
        const unit = buildFixColorUnit({
            snapshot,
            image: toFixColorReference({ id: "a", name: "shoe.jpg", type: "image/png", dataUrl: "data:image/png;base64,IN" }),
            mask: { id: "m", name: "mask.png", type: "image/png", dataUrl: "data:image/png;base64,M" },
        });
        const seen: unknown[] = [];
        const run = await runFixColor({
            unit,
            port: {
                run: async (input) => {
                    seen.push(input);
                    return toolTask({ result: { items: [{ kind: "image", dataUrl: "data:image/png;base64,OUT" }] } as ToolTask["result"] });
                },
            },
            draftRevision: 7,
            onTask: () => undefined,
        });
        expect(run.status).toBe("succeeded");
        const input = seen[0] as { toolId: string; count: number; fields: Record<string, unknown>; references: unknown[] };
        expect(input.toolId).toBe(FIX_COLOR_TOOL_ID);
        expect(input.count).toBe(1);
        expect(input.references.length).toBe(2);
        expect(input.fields.draftRevision).toBe(7);
        expect(input.fields.imageResultUrl).toBeUndefined();
    });

    test("结果视图：运行中/过期/失败提示都不冒充成功", () => {
        const run = fixColorRunFromTask(
            { id: "u", prompt: "", references: [], fields: {}, snapshotHash: "h" },
            toolTask({ result: { items: [{ kind: "image", dataUrl: "data:image/png;base64,OUT" }] } as ToolTask["result"] }),
        );
        expect(fixColorResultView({ run, running: true }).status).toBe("running");
        const staleView = fixColorResultView({ run, sourceUrl: "data:image/png;base64,IN", stale: true });
        expect(staleView.stale).toBe(true);
        expect(staleView.imageUrl).toBe("data:image/png;base64,OUT");
        expect(fixColorResultView({ run: null }).status).toBe("idle");
    });

    test("对比分割线/文件名是纯函数且可预测", () => {
        expect(clampCompareSplit(120)).toBe(100);
        expect(clampCompareSplit(-5)).toBe(0);
        expect(clampCompareSplit(Number.NaN)).toBe(50);
        expect(fixColorDownloadName("白鞋 01.jpg")).toBe("白鞋 01-color-fixed.png");
        expect(fixColorDownloadName("a/b:c.png", 2)).toBe("a-b-c-color-fixed-2.png");
    });
});

/* ------------------------------------------------------------------ *\
 * 渲染证据：没有 DOM 环境，用 react-dom/server 渲染真实工作区组件。
 * 断言首屏就是色差修复自己的控件，未上传时提交不可点，也没有伪造结果。
\* ------------------------------------------------------------------ */
describe("FIX_COLOR 工作区渲染", () => {
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
        const { FixColorWorkspace } = await import("@/components/tools/workspaces/repair");
        return renderToStaticMarkup(
            React.createElement(MemoryRouter, null, React.createElement(FixColorWorkspace, {})),
        );
    };

    test("首屏是本页独有区域：画布空态/涂抹/区域色/目标色/版本，未上传不能提交", async () => {
        const html = await render();
        expect(html).toContain('data-testid="fix-color-mask-panel"');
        // 原站色差修复只有「上传原图 / 上传颜色参考图 / 进行AI修复」三段，
        // 不再渲染本地自造的区域色/目标色色卡与修复版本选择。
        for (const copy of ["上传偏色服装图片", "上传颜色矫正参考图", "进行AI修复"]) {
            expect(html).toContain(copy);
        }
        expect(html).not.toContain('data-testid="fix-color-color-panel"');
        expect(html).not.toContain('data-testid="fix-color-version-panel"');
        expect(/<button(?=[^>]*\bdata-testid="fix-color-submit")(?=[^>]*\bdisabled="")[^>]*>/.test(html)).toBe(true);
        // 未提交前不渲染结果对比，也不出现“已完成”
        expect(html).not.toContain("结果对比");
        expect(html).not.toContain("已完成");
    });

    test("不冒充其他修复工具：未接线的 repair 工具给出明确提示而不是通用占位卡", async () => {
        const React = await import("react");
        const { renderToStaticMarkup } = await import("react-dom/server");
        const { MemoryRouter } = await import("react-router-dom");
        const { RepairWorkspace } = await import("@/components/tools/workspaces/repair");
        const Repair = RepairWorkspace as unknown as (props: { toolId?: string }) => React.ReactElement;
        const html = renderToStaticMarkup(
            React.createElement(MemoryRouter, null, React.createElement(Repair, { toolId: "PRINTING_REPAIR" })),
        );
        expect(html).toContain("尚未接入");
        expect(html).not.toContain("fix-color-submit");
    });
});

describe("FIX_COLOR 输出尺寸必须跟随原图", () => {
    test("1024×744 的原图不再按全局 1:1 出图：尺寸吸附到 16 的倍数且与原图比例一致", () => {
        const size = fixColorOutputSize(1024, 744);
        expect(size).toBe("1024x752");
        const [width, height] = size!.split("x").map(Number);
        expect(width % FIX_COLOR_OUTPUT_STEP).toBe(0);
        expect(height % FIX_COLOR_OUTPUT_STEP).toBe(0);
        // 比例误差 < 2%（旧行为是 1024x1024，比例误差 33%）
        expect(Math.abs(width / height - 1024 / 744)).toBeLessThan(0.02);
    });

    test("过小的原图放大到像素下限，过大的原图收敛到上限，均保持 16 步进", () => {
        const tiny = fixColorOutputSize(100, 100)!.split("x").map(Number);
        expect(tiny[0] * tiny[1]).toBeGreaterThanOrEqual(FIX_COLOR_OUTPUT_LIMITS.minPixels);
        const huge = fixColorOutputSize(8192, 8192)!.split("x").map(Number);
        expect(huge[0] * huge[1]).toBeLessThanOrEqual(FIX_COLOR_OUTPUT_LIMITS.maxPixels);
        expect(Math.max(huge[0], huge[1])).toBeLessThanOrEqual(FIX_COLOR_OUTPUT_LIMITS.maxEdge);
        for (const value of [...tiny, ...huge]) expect(value % FIX_COLOR_OUTPUT_STEP).toBe(0);
    });

    test("没有原图尺寸时不下发 size，交给全局配置（不伪造尺寸）", () => {
        expect(fixColorOutputSize(undefined, 744)).toBeNull();
        expect(fixColorOutputSize(0, 0)).toBeNull();
        expect(fixColorOutputSize(Number.NaN, 100)).toBeNull();
    });

    test("unit 算出的尺寸真的落到请求里，且非法尺寸被提交前守卫拒绝", () => {
        const snapshot = snapshotOf();
        const unit = buildFixColorUnit({
            snapshot,
            image: toFixColorReference({ id: "a", name: "shoe.jpg", type: "image/png", dataUrl: "data:image/png;base64,IN" }),
            mask: { id: "m", name: "mask.png", type: "image/png", dataUrl: "data:image/png;base64,M" },
        });
        expect(unit.size).toBe(fixColorOutputSize(snapshot.imageWidth, snapshot.imageHeight)!);
        const input = buildFixColorInput(unit);
        expect(input.size).toBe(unit.size);
        expect(() => assertFixColorInput(input)).not.toThrow();
        // 未吸附的原始尺寸（744 不是 16 的倍数）不允许直接下发
        expect(() => assertFixColorInput({ ...input, size: "1024x744" })).toThrow(/尺寸/);
        expect(() => assertFixColorInput({ ...input, size: "1:1" })).toThrow(/尺寸/);
    });
});
